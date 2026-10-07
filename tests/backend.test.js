import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import * as miniflare from 'miniflare';
import { buildContext, CONTEXT_CHARACTER_BUDGET } from '../packages/core/context.js';
import { parseBody, recordCreate } from '../packages/core/schema.js';

const fixture = {
  checkedAt: '2026-10-07',
  sources: [{ id: 'source-a', title: 'Company primary source', url: 'https://example.com/robotics', publisher: 'Example', checkedAt: '2026-10-07' }],
  companies: [{ id: 'robotics-a', name: 'Robotics A', domain: 'example.com', sector: 'Robotics', relationship: 'research', summary: 'Robot actuator systems', bottleneck: 'Precision actuation', thesisFit: 'Hardware infrastructure', risks: ['Unknown manufacturing yield'], questions: ['What is the measured failure rate?'], sourceIds: ['source-a'] }],
  signals: [{ id: 'signal-a', companyId: 'robotics-a', title: 'Actuation research', summary: 'New public research to review', sourceIds: ['source-a'], observedAt: '2026-10-07' }],
  briefs: [{ id: 'brief-a', title: 'Actuation diligence', summary: 'A research hypothesis', companyIds: ['robotics-a'], sourceIds: ['source-a'], sections: [], counterpoints: ['A vertically integrated competitor may remove this bottleneck'], questions: ['Can the company supply at scale?'] }], theses: [],
};
let mf, db;
const origin = 'http://localhost:8787';
const request = (pathname, init) => mf.dispatchFetch(`${origin}${pathname}`, init);

before(async () => {
  const bundle = await build({ entryPoints: ['apps/worker/index.js'], write: false, bundle: true, format: 'esm', platform: 'browser', target: 'es2022' });
  const options = { modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-01', d1Databases: { DB: 'afhq-test' } };
  mf = new miniflare.Miniflare(miniflare.convertV4MiniflareOptions ? miniflare.convertV4MiniflareOptions(options) : options);
  db = await mf.getD1Database('DB');
  for (const name of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) {
    const migration = await readFile(`migrations/${name}`, 'utf8');
    await db.exec(migration.replace(/^\s*--.*$/gm, '').replace(/\s+/g, ' '));
  }
  await db.prepare('INSERT INTO public_catalog(id,data,version,updated_at) VALUES(?,?,?,?)').bind('public-research', JSON.stringify(fixture), 1, new Date().toISOString()).run();
});
after(async () => { await mf?.dispose(); });

async function visitor() {
  const response = await request('/api/workspace');
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const body = await response.json();
  return { cookie, csrf: body.csrfToken, headers: { cookie, origin, 'content-type': 'application/json', 'x-csrf-token': body.csrfToken } };
}
async function create(owner, input = {}) {
  const response = await request('/api/workspace', { method: 'POST', headers: owner.headers, body: JSON.stringify({ type: 'note', companyId: 'robotics-a', title: 'Research note', body: 'Questions for the founder', ...input }) });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  return (await response.json()).record;
}

test('public catalog and health come from D1; security headers are present', async () => {
  const response = await request('/api/research');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal((await response.json()).companies[0].id, 'robotics-a');
  assert.deepEqual(await (await request('/api/health')).json(), { ok: true, database: 'D1', researchReady: true });
});

test('visitor records persist on reload and stay isolated from another visitor', async () => {
  const a = await visitor();
  const b = await visitor();
  const record = await create(a);
  const response = await request('/api/workspace', { headers: { cookie: a.cookie } });
  assert.equal(response.headers.get('set-cookie'), null);
  const reloaded = await response.json();
  assert.equal(reloaded.csrfToken, a.csrf);
  assert.ok(reloaded.records.some(item => item.id === record.id));
  const other = await (await request('/api/workspace', { headers: { cookie: b.cookie } })).json();
  assert.equal(other.records.length, 0);
  assert.equal((await request(`/api/workspace/${record.id}/history`, { headers: { cookie: b.cookie } })).status, 404);
  assert.equal((await request(`/api/workspace/${record.id}`, { method: 'PATCH', headers: b.headers, body: JSON.stringify({ expectedVersion: 1, changes: { title: 'Hijacked' } }) })).status, 404);
  const sessions = await db.prepare('SELECT token_hash FROM sessions').all();
  assert.ok(sessions.results.every(row => ![a.cookie, b.cookie].some(cookie => cookie.endsWith(row.token_hash))));
});

test('atomic expected-version checks reject one concurrent write', async () => {
  const owner = await visitor();
  const record = await create(owner);
  const results = await Promise.all(['First edit', 'Second edit'].map(title => request(`/api/workspace/${record.id}`, { method: 'PATCH', headers: owner.headers, body: JSON.stringify({ expectedVersion: 1, changes: { title } }) })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const revisions = await (await request(`/api/workspace/${record.id}/history`, { headers: { cookie: owner.cookie } })).json();
  assert.deepEqual(revisions.revisions.map(item => item.version), [2, 1]);
});

test('archive and restore preserve immutable revision history', async () => {
  const owner = await visitor();
  const record = await create(owner);
  const patch = (version, archived) => request(`/api/workspace/${record.id}`, { method: 'PATCH', headers: owner.headers, body: JSON.stringify({ expectedVersion: version, changes: { archived } }) });
  assert.equal((await patch(1, true)).status, 200);
  assert.equal((await (await request('/api/workspace', { headers: { cookie: owner.cookie } })).json()).records.length, 0);
  const archived = await (await request('/api/workspace?archived=true', { headers: { cookie: owner.cookie } })).json();
  assert.equal(archived.records[0].archived, true);
  assert.equal((await patch(2, false)).status, 200);
  const revisions = (await (await request(`/api/workspace/${record.id}/history`, { headers: { cookie: owner.cookie } })).json()).revisions;
  assert.deepEqual(revisions.map(item => [item.version, item.archived]), [[3, false], [2, true], [1, false]]);
  await assert.rejects(db.prepare('DELETE FROM record_revisions WHERE record_id=?').bind(record.id).run(), /immutable/);
  await assert.rejects(db.prepare("UPDATE record_revisions SET data='{}' WHERE record_id=?").bind(record.id).run(), /immutable/);
});

test('writes enforce session, Origin, CSRF, strict validation, and source relationships', async () => {
  const owner = await visitor();
  const payload = { type: 'note', title: 'Valid', body: '' };
  const post = (headers, data = payload) => request('/api/workspace', { method: 'POST', headers, body: JSON.stringify(data) });
  assert.equal((await post({ 'content-type': 'application/json' })).status, 401);
  assert.equal((await post({ ...owner.headers, origin: 'https://attacker.example' })).status, 403);
  assert.equal((await post({ ...owner.headers, origin: '' })).status, 403);
  assert.equal((await post({ ...owner.headers, 'x-csrf-token': 'wrong' })).status, 403);
  assert.equal((await post(owner.headers, { ...payload, ownerId: 'other' })).status, 400);
  assert.equal((await post(owner.headers, { ...payload, companyId: 'missing-company' })).status, 400);
  assert.equal((await post(owner.headers, { ...payload, body: 'x'.repeat(20001) })).status, 400);
  assert.equal((await post(owner.headers, { ...payload, title: '  ' })).status, 400);
  // Exercise the streaming cap directly: some workerd/undici versions reset an
  // in-flight upload when the server correctly rejects it before consuming it.
  await assert.rejects(parseBody(new Request(`${origin}/api/workspace`, { method: 'POST', headers: owner.headers, body: JSON.stringify({ ...payload, body: 'x'.repeat(100001) }) }), recordCreate), error => error.status === 413);
  const record = await create(owner);
  assert.equal((await request(`/api/workspace/${record.id}`, { method: 'PATCH', headers: owner.headers, body: JSON.stringify({ expectedVersion: 1, changes: { companyId: 'missing-company' } }) })).status, 400);
});

test('context is bounded, source-linked, and does not contain visitor data', async () => {
  const owner = await visitor();
  await create(owner, { body: 'PRIVATE_SENTINEL_93621' });
  const response = await request('/api/context?companyId=robotics-a&query=actuation', { headers: { cookie: owner.cookie } });
  const packet = await response.json();
  assert.equal(response.status, 200);
  assert.ok(packet.evidence.length > 0);
  assert.equal(packet.sources[0].id, 'source-a');
  assert.ok(!JSON.stringify(packet).includes('PRIVATE_SENTINEL'));
  assert.ok(packet.evidence.some(item => item.risks?.includes('Unknown manufacturing yield')));
  assert.ok(packet.evidence.some(item => item.counterpoints?.includes('A vertically integrated competitor may remove this bottleneck')));
  assert.ok(packet.evidence.some(item => item.questions?.includes('What is the measured failure rate?')));
  const large = { ...fixture, signals: Array.from({ length: 100 }, (_, index) => ({ ...fixture.signals[0], id: `signal-${index}`, summary: 'Actuation '.repeat(400) })) };
  const bounded = buildContext(large, { companyId: 'robotics-a' });
  assert.ok(JSON.stringify(bounded).length <= CONTEXT_CHARACTER_BUDGET);
  assert.equal(bounded.budget.truncated, true);
  assert.equal((await request('/api/context?companyId=missing')).status, 404);
  assert.equal((await request(`/api/context?query=${'a'.repeat(301)}`)).status, 400);
});

test('stateless public MCP supports initialization, discovery, and evidence tools', async () => {
  const rpc = body => request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', ...body }) });
  const initialize = await (await rpc({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })).json();
  assert.equal(initialize.result.protocolVersion, '2025-06-18');
  assert.ok(initialize.result.capabilities.tools);
  assert.equal((await rpc({ method: 'notifications/initialized' })).status, 202);
  const listing = await (await rpc({ id: 2, method: 'tools/list' })).json();
  assert.deepEqual(listing.result.tools.map(tool => tool.name), ['search_research', 'get_company_context']);
  const result = await (await rpc({ id: 3, method: 'tools/call', params: { name: 'get_company_context', arguments: { companyId: 'robotics-a' } } })).json();
  assert.equal(result.result.isError, false);
  assert.ok(JSON.parse(result.result.content[0].text).sources.length);
  const search = await (await rpc({ id: 4, method: 'tools/call', params: { name: 'search_research', arguments: { query: 'actuator' } } })).json();
  assert.ok(JSON.parse(search.result.content[0].text).evidence.length);
  const privateTool = await (await rpc({ id: 5, method: 'tools/call', params: { name: 'get_workspace', arguments: {} } })).json();
  assert.equal(privateTool.error.code, -32602);
  const method = await (await rpc({ id: 6, method: 'imaginary' })).json();
  assert.equal(method.error.code, -32601);
  assert.equal((await request('/mcp', { method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' }, body: '{}' })).status, 403);
});

test('exact company name outranks mentions and does not match inside another word', () => {
  const data = { ...fixture, companies: [
    { id: 'rerun', name: 'Rerun', summary: 'Multimodal robotics observations', sourceIds: ['source-a'] },
    { id: 'modal', name: 'Modal', summary: 'Compute infrastructure', sourceIds: ['source-a'] },
    { id: 'other', name: 'Other', summary: 'Integrates Modal compute', sourceIds: ['source-a'] },
  ] };
  const packet = buildContext(data, { query: 'Modal' });
  assert.equal(packet.evidence[0].id, 'modal');
  assert.ok(packet.evidence.some(item => item.id === 'other'));
  assert.ok(!packet.evidence.some(item => item.id === 'rerun'));
});

test('concurrent watchlist creates are idempotent and archived entries remain recoverable', async () => {
  const owner = await visitor();
  const [first, second] = await Promise.all([create(owner, { type: 'watchlist' }), create(owner, { type: 'watchlist', title: 'Duplicate' })]);
  assert.equal(first.id, second.id);
  assert.equal(first.version, 1);
  assert.equal(second.title, first.title);
  const patch = (record, archived) => request(`/api/workspace/${record.id}`, { method: 'PATCH', headers: owner.headers, body: JSON.stringify({ expectedVersion: record.version, changes: { archived } }) });
  const archived = (await (await patch(first, true)).json()).record;
  const replacement = await create(owner, { type: 'watchlist' });
  assert.notEqual(replacement.id, first.id);
  const conflict = await patch(archived, false);
  assert.equal(conflict.status, 409);
  assert.match((await conflict.json()).error, /active watchlist/);
  assert.equal((await patch(replacement, true)).status, 200);
  assert.equal((await patch(archived, false)).status, 200);
});

test('active session quota is atomic and preserves public research and existing sessions', async () => {
  const owner = await visitor();
  const { count } = await db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE expires_at>?').bind(new Date().toISOString()).first();
  await db.prepare(`WITH RECURSIVE slots(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM slots WHERE n < ?)
    INSERT INTO sessions(id,token_hash,csrf_token,created_at,expires_at)
    SELECT 'quota-'||n,'quota-hash-'||n,'test-csrf','2026-10-07T00:00:00.000Z','2099-01-01T00:00:00.000Z' FROM slots`).bind(9999 - count).run();
  try {
    const responses = await Promise.all([request('/api/workspace'), request('/api/workspace')]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 429]);
    assert.equal((await request('/api/workspace', { headers: { cookie: owner.cookie } })).status, 200);
    assert.equal((await request('/api/research')).status, 200);
  } finally {
    await db.prepare("DELETE FROM sessions WHERE id LIKE 'quota-%'").run();
  }
});
