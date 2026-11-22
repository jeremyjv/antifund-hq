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
  assert.deepEqual(listing.result.tools.map(tool => tool.name), ['search_research', 'get_company_context', 'search_signals']);
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

test('team focuses seed once, persist, toggle, archive, and stay owner scoped', async () => {
  const a = await visitor();
  const b = await visitor();
  const first = await (await request('/api/team', { headers: { cookie: a.cookie } })).json();
  assert.equal(first.members.length, 6);
  assert.ok(first.focuses.length > 0);
  const add = await request('/api/team/focus', { method: 'POST', headers: a.headers, body: JSON.stringify({ week: first.focuses[0].week, member: 'steve', title: 'Follow up with founder' }) });
  assert.equal(add.status, 201);
  const { focus } = await add.json();
  assert.equal((await request('/api/team/focus', { method: 'POST', headers: a.headers, body: JSON.stringify({ week: first.focuses[0].week, member: 'nobody', title: 'x' }) })).status, 400);
  assert.equal((await request(`/api/team/focus/${focus.id}`, { method: 'PATCH', headers: b.headers, body: JSON.stringify({ expectedVersion: 1, changes: { done: true } }) })).status, 404);
  const done = await (await request(`/api/team/focus/${focus.id}`, { method: 'PATCH', headers: a.headers, body: JSON.stringify({ expectedVersion: 1, changes: { done: true } }) })).json();
  assert.equal(done.focus.done, true);
  assert.equal((await request(`/api/team/focus/${focus.id}`, { method: 'PATCH', headers: a.headers, body: JSON.stringify({ expectedVersion: 1, changes: { done: false } }) })).status, 409);
  await request(`/api/team/focus/${focus.id}`, { method: 'PATCH', headers: a.headers, body: JSON.stringify({ expectedVersion: 2, changes: { archived: true } }) });
  const reloaded = await (await request('/api/team', { headers: { cookie: a.cookie } })).json();
  assert.equal(reloaded.focuses.length, first.focuses.length);
  assert.ok(!reloaded.focuses.some(f => f.id === focus.id));
  const other = await (await request('/api/team', { headers: { cookie: b.cookie } })).json();
  assert.ok(!other.focuses.some(f => f.title === 'Follow up with founder'));
});

test('team focuses are scoped by week', async () => {
  const a = await visitor();
  const current = await (await request('/api/team?week=2026-11-09', { headers: { cookie: a.cookie } })).json();
  assert.ok(current.focuses.length > 0);
  const next = await (await request('/api/team?week=2026-11-16', { headers: { cookie: a.cookie } })).json();
  assert.equal(next.focuses.length, 0);
  assert.equal((await request('/api/team/focus', { method: 'POST', headers: a.headers, body: JSON.stringify({ week: '2026-11-16', member: 'geoff', title: 'Next week item' }) })).status, 201);
  const again = await (await request('/api/team?week=2026-11-16', { headers: { cookie: a.cookie } })).json();
  assert.deepEqual(again.focuses.map(f => f.title), ['Next week item']);
  assert.equal((await request('/api/team?week=2026-11-17', { headers: { cookie: a.cookie } })).status, 400);
  assert.equal((await request('/api/team/focus', { method: 'POST', headers: a.headers, body: JSON.stringify({ week: '2026-11-17', member: 'geoff', title: 'x' }) })).status, 400);
});

test('goals carry tasks; progress, claims, and log work from the web', async () => {
  const a = await visitor();
  const b = await visitor();
  const first = await (await request('/api/goals', { headers: { cookie: a.cookie } })).json();
  assert.ok(first.goals.length >= 3);
  const goal = first.goals[0];
  assert.ok(goal.total > 0 && goal.log.length > 0 && goal.member && goal.targetDate);
  const created = await request('/api/goals', { method: 'POST', headers: a.headers, body: JSON.stringify({ title: 'Raise fund II', member: 'laura', targetDate: '2027-06-30', actor: 'jeremy' }) });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const add = await (await request(`/api/goals/${id}/tasks`, { method: 'POST', headers: a.headers, body: JSON.stringify({ title: 'Draft LP deck', actor: 'jeremy' }) })).json();
  assert.equal(add.duplicate, false);
  const dup = await (await request(`/api/goals/${id}/tasks`, { method: 'POST', headers: a.headers, body: JSON.stringify({ title: 'draft  LP deck!', actor: 'steve' }) })).json();
  assert.equal(dup.duplicate, true);
  const t = add.task.id;
  assert.equal((await request(`/api/tasks/${t}`, { method: 'POST', headers: a.headers, body: JSON.stringify({ action: 'claim', actor: 'laura' }) })).status, 200);
  assert.equal((await request(`/api/tasks/${t}`, { method: 'POST', headers: a.headers, body: JSON.stringify({ action: 'claim', actor: 'steve' }) })).status, 409);
  assert.equal((await request(`/api/tasks/${t}`, { method: 'POST', headers: b.headers, body: JSON.stringify({ action: 'complete', actor: 'laura' }) })).status, 404);
  assert.equal((await request(`/api/tasks/${t}`, { method: 'POST', headers: a.headers, body: JSON.stringify({ action: 'complete', actor: 'laura', note: 'v1 sent' }) })).status, 200);
  const after = (await (await request('/api/goals', { headers: { cookie: a.cookie } })).json()).goals.find(g => g.id === id);
  assert.equal(`${after.done}/${after.total}`, '1/1');
  assert.deepEqual(after.log.map(l => l.action).sort(), ['added_task', 'claimed', 'completed', 'created_goal']);
});

test('agents manage goal tasks over MCP with a personal key, without overlap', async () => {
  const a = await visitor();
  const goals = (await (await request('/api/goals', { headers: { cookie: a.cookie } })).json()).goals;
  const keyFor = async member => (await (await request('/api/agent-keys', { method: 'POST', headers: a.headers, body: JSON.stringify({ member }) })).json()).key;
  const steveKey = await keyFor('steve');
  const geoffKey = await keyFor('geoff');
  const rpc = (key, method, params = {}) => request(`/mcp/${key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then(r => r.json());
  const call = async (key, name, args) => JSON.parse((await rpc(key, 'tools/call', { name, arguments: args })).result.content[0].text);
  const publicList = await (await request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).json();
  assert.ok(!publicList.result.tools.some(t => t.name === 'complete_task'));
  assert.ok((await rpc(steveKey, 'tools/list')).result.tools.some(t => t.name === 'complete_task'));
  const listed = await call(steveKey, 'list_goals', {});
  assert.equal(listed.you, 'steve');
  const added = await call(steveKey, 'add_task', { goalId: goals[0].id, title: 'Interview three portfolio founders', claim: true });
  assert.equal(added.task.assignee, 'steve');
  const steal = await rpc(geoffKey, 'tools/call', { name: 'claim_task', arguments: { taskId: added.task.id } });
  assert.equal(steal.result.isError, true);
  assert.match(steal.result.content[0].text, /claimed by steve/);
  const done = await call(steveKey, 'complete_task', { taskId: added.task.id, note: 'Notes in HQ' });
  assert.equal(done.task.done, true);
  const log = (await (await request('/api/goals', { headers: { cookie: a.cookie } })).json()).goals.find(g => g.id === goals[0].id).log;
  assert.ok(log.some(l => l.action === 'completed' && l.source === 'agent' && l.actor === 'steve'));
  const rotated = await keyFor('steve');
  assert.notEqual(rotated, steveKey);
  assert.equal((await request(`/mcp/${steveKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).status, 401);
});

test('CRM records are owner scoped, versioned, append-only, and reachable by agents over MCP', async () => {
  const a = await visitor();
  const b = await visitor();
  const crmOf = async (v) => (await request('/api/crm', { headers: { cookie: v.cookie } })).json();
  const first = await crmOf(a);
  assert.ok(first.orgs.some(o => o.catalogId === 'robotics-a' && o.stage === null), 'public research companies arrive with no stage');
  assert.ok(first.orgs.some(o => o.sample && o.stage), 'fictional sample deals are flagged');
  assert.equal(first.interactions.filter(t => t.orgId === first.orgs.find(o => o.catalogId === 'robotics-a').id).length, 0, 'no invented activity for real companies');

  const org = (await (await request('/api/crm/orgs', { method: 'POST', headers: a.headers, body: JSON.stringify({ name: 'Test Dynamics', kind: 'company', stage: 'sourced', actor: 'jeremy' }) })).json()).org;
  const personRes = await request('/api/crm/people', { method: 'POST', headers: a.headers, body: JSON.stringify({ name: 'Test Founder', kind: 'founder', orgId: org.id, actor: 'jeremy' }) });
  assert.equal(personRes.status, 201);
  const person = (await personRes.json()).person;

  const move = await request(`/api/crm/orgs/${org.id}`, { method: 'PATCH', headers: a.headers, body: JSON.stringify({ expectedVersion: 1, changes: { stage: 'diligence' }, actor: 'steve' }) });
  assert.equal(move.status, 200);
  const stale = await request(`/api/crm/orgs/${org.id}`, { method: 'PATCH', headers: a.headers, body: JSON.stringify({ expectedVersion: 1, changes: { stage: 'passed' }, actor: 'geoff' }) });
  assert.equal(stale.status, 409, 'stale versions never overwrite');
  const revisions = (await (await request(`/api/crm/orgs/${org.id}/history`, { headers: { cookie: a.cookie } })).json()).revisions;
  assert.deepEqual(revisions.map(r => r.version), [2, 1]);
  const stageLog = (await crmOf(a)).interactions.filter(t => t.orgId === org.id && t.kind === 'stage');
  assert.deepEqual(stageLog.map(t => t.summary), ['Sourced → Diligence', 'Added at Sourced'], 'stage moves are logged once, only when the update applied');

  const crossOwner = await request(`/api/crm/orgs/${org.id}`, { method: 'PATCH', headers: b.headers, body: JSON.stringify({ expectedVersion: 2, changes: { stage: 'passed' }, actor: 'geoff' }) });
  assert.equal(crossOwner.status, 404, 'another visitor cannot touch the record');
  assert.ok(!(await crmOf(b)).orgs.some(o => o.id === org.id));
  assert.equal((await request('/api/crm/people', { method: 'POST', headers: { ...a.headers, origin: 'https://attacker.example' }, body: JSON.stringify({ name: 'X', kind: 'founder', actor: 'jeremy' }) })).status, 403);

  const key = (await (await request('/api/agent-keys', { method: 'POST', headers: a.headers, body: JSON.stringify({ member: 'steve' }) })).json()).key;
  const call = (name, args) => request(`/mcp/${key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }).then(r => r.json()).then(r => ({ isError: r.result.isError, data: (() => { try { return JSON.parse(r.result.content[0].text); } catch { return r.result.content[0].text; } })() }));
  const found = await call('search_crm', { query: 'Test Found' });
  assert.equal(found.data.results[0].id, person.id);
  const logged = await call('log_interaction', { record: 'Test Founder', kind: 'call', summary: 'Raising a seed in Q1', nextStep: 'Follow up', nextStepDue: '2027-01-10' });
  assert.equal(logged.isError, false, JSON.stringify(logged.data));
  assert.equal(logged.data.followUp.due, '2027-01-10');
  const knows = await call('who_knows', { record: 'Test Dynamics' });
  assert.equal(knows.data.whoKnows[0].member, 'steve');
  const after = await crmOf(a);
  const touch = after.interactions.find(t => t.summary === 'Raising a seed in Q1');
  assert.equal(touch.actor, 'steve');
  assert.equal(touch.source, 'agent');
  assert.equal(touch.orgId, org.id, 'a touch on a person also lands on their organization');
  await assert.rejects(db.prepare('DELETE FROM crm_interactions WHERE id=?').bind(touch.id).run(), /append-only/);
  const publicTools = await (await request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).json();
  assert.ok(!publicTools.result.tools.some(t => t.name === 'search_crm'), 'public MCP never exposes the CRM');
});

test('Signal Watch scores public signals per owner-scoped watch, and promotes finds into the CRM', async () => {
  const now = new Date().toISOString();
  const sig = (id, source, kind, title, entity, metrics, tags = []) => db.prepare('INSERT INTO signals(id,source,kind,title,summary,url,author,entity,entity_key,tags,metrics,published_at,first_seen_at,retrieved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, source, kind, title, '', `https://example.com/${id}`, 'someone', entity, entity.toLowerCase(), JSON.stringify(tags), JSON.stringify(metrics), now, now, now).run();
  await sig('hn:1', 'hn', 'launch', 'Skyfence – counter-drone interceptors for bases', 'Skyfence', { points: 240 });
  await sig('github:1', 'github', 'repo', 'skyfence/autonomy-stack', 'skyfence', { stars: 900, starsPerDay: 90 }, ['drone']);
  await sig('hn:2', 'hn', 'launch', 'A recipe app for busy parents', 'Recipes', { points: 300 });

  const a = await visitor();
  const b = await visitor();
  const load = async (v) => (await request('/api/signals', { headers: { cookie: v.cookie } })).json();
  const first = await load(a);
  assert.ok(first.signals.length >= 3);
  assert.ok(first.watches.length >= 5 && first.watches.every(w => w.starter), 'starter watches seed once per workspace');
  assert.ok(first.sources.planned.some(p => p.id === 'x'), 'paid sources are listed as not connected');

  const created = await request('/api/watches', { method: 'POST', headers: a.headers, body: JSON.stringify({ name: 'Counter-drone', includeTerms: ['Counter-Drone', 'drone'], excludeTerms: ['recipe'], minScore: 10 }) });
  assert.equal(created.status, 201);
  const watch = (await created.json()).watch;
  assert.deepEqual(watch.includeTerms, ['counter-drone', 'drone'], 'terms are normalized');

  const key = (await (await request('/api/agent-keys', { method: 'POST', headers: a.headers, body: JSON.stringify({ member: 'jeremy' }) })).json()).key;
  const call = (name, args, k = key) => request(k ? `/mcp/${k}` : '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }).then(r => r.json()).then(r => ({ isError: r.result.isError, data: (() => { try { return JSON.parse(r.result.content[0].text); } catch { return r.result.content[0].text; } })() }));
  const results = await call('get_watch_signals', { watch: 'Counter-drone' });
  assert.equal(results.isError, false, JSON.stringify(results.data));
  assert.deepEqual(results.data.results.map(r => r.id).sort(), ['github:1', 'hn:1'], 'hard filters drop the recipe app');
  assert.ok(results.data.results.find(r => r.id === 'hn:1').why.some(w => /Also seen on GitHub/.test(w)), 'cross-source convergence is explained');

  const edit = await request(`/api/watches/${watch.id}`, { method: 'PATCH', headers: a.headers, body: JSON.stringify({ expectedVersion: 1, changes: { minScore: 99 } }) });
  assert.equal(edit.status, 200);
  const stale = await request(`/api/watches/${watch.id}`, { method: 'PATCH', headers: a.headers, body: JSON.stringify({ expectedVersion: 1, changes: { minScore: 5 } }) });
  assert.equal(stale.status, 409);
  assert.deepEqual((await (await request(`/api/watches/${watch.id}/history`, { headers: { cookie: a.cookie } })).json()).revisions.map(r => r.version), [2, 1]);
  assert.equal((await request(`/api/watches/${watch.id}`, { method: 'PATCH', headers: b.headers, body: JSON.stringify({ expectedVersion: 2, changes: { minScore: 5 } }) })).status, 404, 'watches are owner scoped');
  assert.ok(!(await load(b)).watches.some(w => w.id === watch.id));
  assert.equal((await request('/api/signals/vote', { method: 'POST', headers: { ...a.headers, 'x-csrf-token': 'nope' }, body: JSON.stringify({ watchId: watch.id, signalId: 'hn:1', vote: 1 }) })).status, 403);
  assert.equal((await request('/api/signals/vote', { method: 'POST', headers: a.headers, body: JSON.stringify({ watchId: watch.id, signalId: 'hn:1', vote: -1 }) })).status, 200);
  assert.equal((await load(a)).watches.find(w => w.id === watch.id).votes['hn:1'], -1);

  const promoted = await request('/api/signals/promote', { method: 'POST', headers: a.headers, body: JSON.stringify({ signalId: 'hn:1', actor: 'jeremy' }) });
  assert.equal(promoted.status, 201);
  const { org, created: isNew } = await promoted.json();
  assert.equal(isNew, true);
  const again = await call('promote_signal', { signalId: 'github:1', name: 'Skyfence Inc.' });
  assert.equal(again.data.created, false, 'the same company is matched, not duplicated');
  const crm = await (await request('/api/crm', { headers: { cookie: a.cookie } })).json();
  const row = crm.orgs.find(o => o.id === org.id);
  assert.equal(row.stage, 'sourced');
  const notes = crm.interactions.filter(t => t.orgId === org.id && t.kind === 'note');
  assert.equal(notes.length, 2);
  assert.ok(notes.every(t => /https:\/\/example\.com\//.test(t.summary)), 'promotions cite the primary source');
  assert.ok(notes.some(t => t.source === 'agent' && t.actor === 'jeremy'));
  assert.ok((await load(a)).known.some(k => k.id === org.id), 'promoted companies are tagged as known');

  const pub = await call('search_signals', { query: 'counter-drone' }, null);
  assert.equal(pub.data.results[0].id, 'hn:1');
  assert.match(pub.data.coverage, /Not covered: X/);
  const publicTools = await (await request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })).json();
  assert.ok(!publicTools.result.tools.some(t => ['list_watches', 'promote_signal', 'create_watch'].includes(t.name)), 'watches stay private to their owner');
});
