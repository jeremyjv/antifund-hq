import { ApiError } from './schema.js';
import { SOURCES, PLANNED_SOURCES, entityKey } from '../connectors/signal-sources.js';
import { buildIndex, runWatch, searchSignals, SOURCE_LABELS } from './signal-score.js';
import { listCrm, createOrg, logInteraction } from './crm.js';

export { SOURCE_LABELS, KIND_LABELS, runWatch, searchSignals, buildIndex } from './signal-score.js';

// Signal Watch. `signals` is a shared cache of free public sources (no visitor data in it).
// Watches, votes, and promotions are owner scoped like every other workspace record.

const DAY = 86400000;
const WINDOW_DAYS = 30;
const MANUAL_COOLDOWN_MIN = 10;

// Starter watches so a new workspace shows the method working. Editable like any other watch.
const STARTERS = [
  { name: 'Manifesto watch', delivery: 'digest', minScore: 50, description: 'Hard tech the world needs but most investors avoid: defense, robotics, energy, semiconductors, space, manufacturing, and AI infrastructure. Scarcity, chokepoints, contrarian bets, technical founders.', sources: [], kinds: [], includeTerms: [], requireTerms: [], excludeTerms: ['crypto', 'memecoin', 'nft', 'game', 'gaming', 'real estate', 'pooled investment fund'], accounts: [] },
  { name: 'Defense & dual-use', delivery: 'alert', minScore: 42, description: 'Startups selling autonomy, drones, sensing, and munitions to the military; new defense contracts and prototypes.', sources: [], kinds: [], includeTerms: ['defense', 'drone', 'uas', 'counter-uas', 'unmanned', 'autonomy', 'autonomous', 'munition', 'radar', 'electronic warfare', 'hypersonic', 'satellite', 'spacecraft', 'orbital', 'darpa', 'missile', 'navy', 'air force', 'army', 'sensor'], requireTerms: [], excludeTerms: ['game', 'gaming'], accounts: [] },
  { name: 'Robotics & hardware', delivery: 'feed', minScore: 38, description: 'Robots, actuators, embedded systems, chips, and the tools that design them, such as AI for circuit boards.', sources: [], kinds: [], includeTerms: ['robot', 'robotics', 'humanoid', 'actuator', 'manipulation', 'lidar', 'embedded', 'firmware', 'fpga', 'pcb', 'circuit', 'chip', 'semiconductor', 'hardware', 'motor', 'manufacturing'], requireTerms: [], excludeTerms: [], accounts: [] },
  { name: 'Energy & grid', delivery: 'feed', minScore: 36, description: 'Power for the AI buildout: grid, batteries, nuclear, geothermal, and flexible data-center load.', sources: [], kinds: [], includeTerms: ['grid', 'battery', 'batteries', 'nuclear', 'fusion', 'fission', 'solar', 'geothermal', 'transmission', 'energy', 'power plant', 'data center', 'power transformer', 'electricity', 'utility'], requireTerms: [], excludeTerms: [], accounts: [] },
  { name: 'Fresh raises (Form D)', delivery: 'alert', minScore: 25, description: 'Young operating companies that just filed a raise, before any press release.', sources: ['sec_form_d'], kinds: ['raise'], includeTerms: ['operating company'], requireTerms: [], excludeTerms: ['fund', 'real estate', 'reit', 'insurance', 'banking', 'restaurants', 'retailing', 'lodging'], accounts: [] },
  { name: 'AI builders I follow', delivery: 'feed', minScore: 20, description: 'Launches, models, and tools from specific people, the open-network version of a Twitter list.', sources: ['bluesky', 'github', 'huggingface'], kinds: [], includeTerms: [], requireTerms: [], excludeTerms: [], accounts: ['simonwillison.net', 'karpathy.bsky.social', 'natolambert.bsky.social', 'hamel.bsky.social', 'swyx.io'] },
];

const J = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
const mapSignal = (r) => ({ id: r.id, source: r.source, kind: r.kind, title: r.title, summary: r.summary, url: r.url, author: r.author, entity: r.entity, entityKey: r.entity_key, tags: J(r.tags, []), metrics: J(r.metrics, {}), publishedAt: r.published_at, firstSeenAt: r.first_seen_at, retrievedAt: r.retrieved_at });
const mapWatch = (r) => ({ id: r.id, name: r.name, description: r.description, sources: J(r.sources, []), kinds: J(r.kinds, []), includeTerms: J(r.include_terms, []), requireTerms: J(r.require_terms, []), excludeTerms: J(r.exclude_terms, []), accounts: J(r.accounts, []), minScore: r.min_score, delivery: r.delivery, starter: !!r.sample, archived: !!r.archived, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at });
const mapRun = (r) => ({ source: r.source, trigger: r.trigger, startedAt: r.started_at, finishedAt: r.finished_at, status: r.status, fetched: r.fetched, inserted: r.inserted, error: r.error });

// ---------------------------------------------------------------- ingestion
// One upsert statement per source run: rows travel as a single JSON parameter (D1 caps bound
// parameters per query), repeated items refresh their metrics and never duplicate.
async function upsert(db, items, now) {
  if (!items.length) return 0;
  const rows = items.map((s) => ({ ...s, entity_key: entityKey(s.entity), tags: JSON.stringify((s.tags || []).filter(Boolean).slice(0, 12)), metrics: JSON.stringify(s.metrics || {}) }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const { results } = await db.prepare(`INSERT INTO signals(id,source,kind,title,summary,url,author,entity,entity_key,tags,metrics,published_at,first_seen_at,retrieved_at)
      SELECT json_extract(value,'$.id'), json_extract(value,'$.source'), json_extract(value,'$.kind'), substr(json_extract(value,'$.title'),1,300), substr(coalesce(json_extract(value,'$.summary'),''),1,600),
        json_extract(value,'$.url'), json_extract(value,'$.author'), json_extract(value,'$.entity'), json_extract(value,'$.entity_key'), json_extract(value,'$.tags'), json_extract(value,'$.metrics'), json_extract(value,'$.publishedAt'), ?1, ?1
      FROM json_each(?2) WHERE true
      ON CONFLICT(id) DO UPDATE SET metrics=excluded.metrics, title=excluded.title, summary=excluded.summary, tags=excluded.tags, retrieved_at=excluded.retrieved_at
      RETURNING first_seen_at`).bind(now, JSON.stringify(rows.slice(i, i + 100))).all();
    inserted += results.filter((r) => r.first_seen_at === now).length;
  }
  return inserted;
}

async function lastRuns(db) {
  const { results } = await db.prepare('SELECT r.* FROM signal_runs r JOIN (SELECT source, MAX(started_at) m FROM signal_runs GROUP BY source) x ON x.source=r.source AND x.m=r.started_at').all();
  return Object.fromEntries(results.map((r) => [r.source, r]));
}

// Run the sources that are due. Cron runs follow each source's cadence; a manual refresh runs
// anything not fetched in the last few minutes. A 'running' row stops two runs overlapping.
export async function runSources(env, { trigger = 'cron', only = null, max = 3 } = {}) {
  const db = env.DB;
  const last = await lastRuns(db);
  const nowMs = Date.now();
  const due = SOURCES.filter((s) => (!only || only.includes(s.id)) && (() => {
    const r = last[s.id];
    if (!r) return true;
    const age = (nowMs - Date.parse(r.started_at)) / 60000;
    if (r.status === 'running' && age < 5) return false;
    return age >= (trigger === 'manual' ? MANUAL_COOLDOWN_MIN : s.cadence);
  })()).sort((a, b) => Date.parse(last[a.id]?.started_at || 0) - Date.parse(last[b.id]?.started_at || 0)).slice(0, max);
  const report = [];
  for (const src of due) {
    const id = crypto.randomUUID();
    const started = new Date().toISOString();
    await db.prepare("INSERT INTO signal_runs(id,source,trigger,started_at,status) VALUES(?,?,?,?,'running')").bind(id, src.id, trigger, started).run();
    let phase = 'start';
    try {
      const known = src.id === 'sec_form_d' ? new Set((await db.prepare("SELECT id FROM signals WHERE source='sec_form_d' AND first_seen_at>?").bind(new Date(nowMs - 10 * DAY).toISOString()).all()).results.map((r) => r.id)) : new Set();
      phase = 'fetch';
      const items = (await src.run({ known })).filter((s) => s && s.id && s.title && /^https:\/\//.test(s.url));
      phase = 'store';
      const inserted = await upsert(db, items, started);
      await db.prepare("UPDATE signal_runs SET status='ok', finished_at=?, fetched=?, inserted=? WHERE id=?").bind(new Date().toISOString(), items.length, inserted, id).run();
      report.push({ source: src.id, status: 'ok', fetched: items.length, inserted });
    } catch (error) {
      console.error('signal source failed', src.id, phase, error?.stack || error);
      await db.prepare("UPDATE signal_runs SET status='error', finished_at=?, error=? WHERE id=?").bind(new Date().toISOString(), String(error?.message || error).slice(0, 300), id).run();
      report.push({ source: src.id, status: 'error', error: String(error?.message || error).slice(0, 300) });
    }
  }
  // Public cache, not workspace records: keep a rolling window.
  if (trigger === 'cron') await db.batch([
    db.prepare('DELETE FROM signals WHERE first_seen_at<?').bind(new Date(nowMs - 45 * DAY).toISOString()),
    db.prepare('DELETE FROM signal_runs WHERE started_at<?').bind(new Date(nowMs - 14 * DAY).toISOString()),
  ]);
  return { ran: report, skipped: SOURCES.filter((s) => !due.includes(s) && (!only || only.includes(s.id))).map((s) => s.id) };
}

// ---------------------------------------------------------------- reads
export async function recentSignals(db, days = WINDOW_DAYS, limit = 1500) {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const { results } = await db.prepare('SELECT * FROM signals WHERE first_seen_at>? ORDER BY first_seen_at DESC LIMIT ?').bind(since, limit).all();
  return results.map(mapSignal);
}

export async function sourceHealth(db) {
  const last = await lastRuns(db);
  const { results: counts } = await db.prepare('SELECT source, COUNT(*) n, MAX(first_seen_at) latest FROM signals WHERE first_seen_at>? GROUP BY source').bind(new Date(Date.now() - WINDOW_DAYS * DAY).toISOString()).all();
  const byCount = Object.fromEntries(counts.map((c) => [c.source, c]));
  return {
    live: SOURCES.map((s) => ({ id: s.id, label: s.label, detail: s.detail, cadenceMinutes: s.cadence, home: s.home, signals: byCount[s.id]?.n || 0, lastRun: last[s.id] ? mapRun(last[s.id]) : null })),
    planned: PLANNED_SOURCES,
  };
}

async function seedWatches(db, owner) {
  const base = Date.now();
  await db.batch(STARTERS.map((w, i) => [w, new Date(base + i).toISOString()]).map(([w, now]) => db.prepare('INSERT INTO watches(id,owner_id,name,description,sources,kinds,include_terms,require_terms,exclude_terms,accounts,min_score,delivery,sample,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)')
    .bind(crypto.randomUUID(), owner, w.name, w.description, JSON.stringify(w.sources), JSON.stringify(w.kinds), JSON.stringify(w.includeTerms), JSON.stringify(w.requireTerms), JSON.stringify(w.excludeTerms), JSON.stringify(w.accounts), w.minScore, w.delivery, now, now)));
}

export async function listWatches(db, owner, { archived = false } = {}) {
  const any = await db.prepare('SELECT 1 FROM watches WHERE owner_id=? LIMIT 1').bind(owner).first();
  if (!any) await seedWatches(db, owner);
  const [w, v] = await db.batch([
    db.prepare('SELECT * FROM watches WHERE owner_id=? AND archived=? ORDER BY created_at, name LIMIT 100').bind(owner, archived ? 1 : 0),
    db.prepare('SELECT watch_id, signal_id, vote FROM signal_votes WHERE owner_id=? LIMIT 5000').bind(owner),
  ]);
  const votes = {};
  for (const r of v.results) (votes[r.watch_id] ||= {})[r.signal_id] = r.vote;
  return w.results.map((r) => ({ ...mapWatch(r), votes: votes[r.id] || {} }));
}

// Entities already in this workspace's CRM, so a signal can say "In your CRM · Diligence".
export async function knownEntities(db, owner) {
  const { results } = await db.prepare('SELECT id, name, stage FROM crm_orgs WHERE owner_id=? AND archived=0 LIMIT 2000').bind(owner).all();
  return results.map((o) => ({ key: entityKey(o.name), id: o.id, label: o.stage ? `In your CRM · ${o.stage.replace('_', ' ')}` : 'In your CRM' }));
}

export async function signalWorkspace(db, owner, { archived = false } = {}) {
  const [signals, watches, health, known] = await Promise.all([recentSignals(db), listWatches(db, owner, { archived }), sourceHealth(db), knownEntities(db, owner)]);
  return { signals, watches, sources: health, known, windowDays: WINDOW_DAYS };
}

// ---------------------------------------------------------------- writes
const COLS = { name: 'name', description: 'description', sources: 'sources', kinds: 'kinds', includeTerms: 'include_terms', requireTerms: 'require_terms', excludeTerms: 'exclude_terms', accounts: 'accounts', minScore: 'min_score', delivery: 'delivery', archived: 'archived' };
const JSON_COLS = new Set(['sources', 'kinds', 'includeTerms', 'requireTerms', 'excludeTerms', 'accounts']);
const dbValue = (k, v) => (JSON_COLS.has(k) ? JSON.stringify(v) : typeof v === 'boolean' ? Number(v) : v);

async function watchRow(db, owner, id) {
  const r = await db.prepare('SELECT * FROM watches WHERE id=? AND owner_id=?').bind(id, owner).first();
  if (!r) throw new ApiError(404, 'Watch not found');
  return r;
}

export async function createWatch(db, owner, input) {
  const { n } = await db.prepare('SELECT COUNT(*) n FROM watches WHERE owner_id=?').bind(owner).first();
  if (n >= 50) throw new ApiError(429, 'This demo has reached its 50-watch limit');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const w = { sources: [], kinds: [], includeTerms: [], requireTerms: [], excludeTerms: [], accounts: [], minScore: 40, delivery: 'feed', description: '', ...input };
  await db.prepare('INSERT INTO watches(id,owner_id,name,description,sources,kinds,include_terms,require_terms,exclude_terms,accounts,min_score,delivery,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, owner, w.name, w.description, ...['sources', 'kinds', 'includeTerms', 'requireTerms', 'excludeTerms', 'accounts'].map((k) => JSON.stringify(w[k])), w.minScore, w.delivery, now, now).run();
  return mapWatch(await watchRow(db, owner, id));
}

export async function updateWatch(db, owner, id, { expectedVersion, changes }) {
  await watchRow(db, owner, id);
  const entries = Object.entries(changes);
  const row = await db.prepare(`UPDATE watches SET ${entries.map(([k]) => `${COLS[k]}=?`).join(',')},version=version+1,updated_at=? WHERE id=? AND owner_id=? AND version=? RETURNING *`)
    .bind(...entries.map(([k, v]) => dbValue(k, v)), new Date().toISOString(), id, owner, expectedVersion).first();
  if (!row) throw new ApiError(409, 'This watch changed somewhere else. Reload to see the latest version.', { current: mapWatch(await watchRow(db, owner, id)) });
  return mapWatch(row);
}

export async function watchHistory(db, owner, id) {
  const { results } = await db.prepare('SELECT version, data, created_at FROM watch_revisions WHERE owner_id=? AND watch_id=? ORDER BY version DESC LIMIT 50').bind(owner, id).all();
  return results.map((r) => ({ version: r.version, data: JSON.parse(r.data), at: r.created_at }));
}

async function signalRow(db, id) {
  const r = await db.prepare('SELECT * FROM signals WHERE id=?').bind(id).first();
  if (!r) throw new ApiError(404, 'Signal not found (it may have aged out of the 45-day window)');
  return mapSignal(r);
}

export async function voteSignal(db, owner, { watchId, signalId, vote }) {
  await watchRow(db, owner, watchId);
  await signalRow(db, signalId);
  if (vote === 0) await db.prepare('DELETE FROM signal_votes WHERE owner_id=? AND watch_id=? AND signal_id=?').bind(owner, watchId, signalId).run();
  else await db.prepare('INSERT INTO signal_votes(owner_id,watch_id,signal_id,vote,created_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_id,watch_id,signal_id) DO UPDATE SET vote=excluded.vote, created_at=excluded.created_at')
    .bind(owner, watchId, signalId, vote, new Date().toISOString()).run();
  return { watchId, signalId, vote };
}

// Promote a signal into the CRM: reuse the organization if it already exists, otherwise create it
// at Sourced, and log a note that cites the primary source. One click from signal to pipeline.
export async function promoteSignal(db, owner, catalogData, { signalId, name, actor, source = 'web' }) {
  const sig = await signalRow(db, signalId);
  const orgName = (name || sig.entity || '').trim();
  if (!orgName) throw new ApiError(400, 'Name the company this signal is about');
  const crm = await listCrm(db, owner, catalogData);
  const key = entityKey(orgName);
  let org = crm.orgs.find((o) => entityKey(o.name) === key);
  const created = !org;
  if (!org) org = await createOrg(db, owner, { name: orgName.slice(0, 200), kind: 'company', sector: sig.kind === 'contract' ? 'Defense' : null, stage: 'sourced', dealOwner: actor, notes: '' }, actor, source);
  await logInteraction(db, owner, { orgId: org.id, kind: 'note', summary: `Signal from ${SOURCE_LABELS[sig.source] || sig.source}: ${sig.title} — ${sig.url}`.slice(0, 1000) }, actor, source);
  return { org: { id: org.id, name: org.name, stage: org.stage }, created };
}

// For MCP and the API: score one watch, or search all signals, on the server.
export async function watchResults(db, owner, { watchId, query, limit = 25 }) {
  const [signals, watches, known] = await Promise.all([recentSignals(db), listWatches(db, owner), knownEntities(db, owner)]);
  const index = buildIndex(signals, known);
  if (query) return { query, results: searchSignals(signals, query, index, limit) };
  const watch = watches.find((w) => w.id === watchId || w.name.toLowerCase() === String(watchId || '').toLowerCase());
  if (!watch) throw new ApiError(404, 'Watch not found. Call list_watches.');
  return { watch, results: runWatch(signals, watch, index, { limit }) };
}
