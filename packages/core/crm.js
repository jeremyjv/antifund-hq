import { ApiError } from './schema.js';
import { STAGES, stageLabel } from './crm-derive.js';

export { STAGES, stageLabel, lastTouch, whoKnows, searchCrm, describeRecord } from './crm-derive.js';

// In-house CRM. Organizations and people are versioned records (revisions kept by triggers,
// archived instead of deleted). Interactions are an append-only log written by the web UI
// or by a teammate's agent over MCP; "last touch" and "who knows whom" are derived from it.

const DAY = 86400000;

// Fictional sample records so the demo is not empty. They are flagged sample=1 and shown as
// "Sample" in the UI; they describe no real people, companies, or Anti Fund activity.
const SAMPLE_ORGS = [
  { key: 'kestrel', name: 'Kestrel Autonomy', kind: 'company', sector: 'Defense · GPS-denied navigation', stage: 'diligence', dealOwner: 'steve', nextStep: 'Reference calls with two pilot customers', due: 6 },
  { key: 'ampere', name: 'Ampere Grid Labs', kind: 'company', sector: 'Energy · flexible data-center load', stage: 'first_call', dealOwner: 'geoff', nextStep: 'Second call with the CTO on utility contracts', due: 3 },
  { key: 'tessellate', name: 'Tessellate Circuits', kind: 'company', sector: 'Robotics · AI circuit-board design', stage: 'partner_review', dealOwner: 'jeremy', nextStep: 'Memo to partners before Thursday', due: 2 },
  { key: 'fieldhand', name: 'Fieldhand Robotics', kind: 'company', sector: 'Robotics · agricultural autonomy', stage: 'sourced', dealOwner: 'jeremy', nextStep: 'Request an intro through Ridgeline', due: 9 },
  { key: 'halcyon', name: 'Halcyon Evals', kind: 'company', sector: 'AI infrastructure · agent evals', stage: 'passed', dealOwner: 'logan', passReason: 'Too early on revenue; revisit after first paid pilot' },
  { key: 'ridgeline', name: 'Ridgeline Ventures', kind: 'fund', sector: 'Seed fund · co-investor' },
  { key: 'granite', name: 'Granite Point Endowment', kind: 'lp', sector: 'Endowment · prospective LP' },
];
const SAMPLE_PEOPLE = [
  { key: 'maya', name: 'Maya Okafor', kind: 'founder', title: 'CEO', org: 'kestrel', relOwner: 'steve', strength: 'strong', location: 'San Diego' },
  { key: 'daniel', name: 'Daniel Reyes', kind: 'founder', title: 'CTO', org: 'ampere', relOwner: 'geoff', strength: 'warm', location: 'Austin' },
  { key: 'priya', name: 'Priya Natarajan', kind: 'founder', title: 'CEO', org: 'tessellate', relOwner: 'jeremy', strength: 'strong', location: 'San Francisco' },
  { key: 'tomas', name: 'Tomás Lindqvist', kind: 'founder', title: 'Founder', org: 'fieldhand', relOwner: null, strength: 'cold', location: 'Fresno' },
  { key: 'hana', name: 'Hana Sato', kind: 'founder', title: 'CEO', org: 'halcyon', relOwner: 'logan', strength: 'warm', location: 'New York' },
  { key: 'ben', name: 'Ben Adler', kind: 'investor', title: 'Partner', org: 'ridgeline', relOwner: 'jake', strength: 'strong', location: 'Los Angeles' },
  { key: 'claire', name: 'Claire Moreau', kind: 'lp', title: 'Director of Private Markets', org: 'granite', relOwner: 'laura', strength: 'warm', location: 'Boston' },
  { key: 'samuel', name: 'Samuel Osei', kind: 'expert', title: 'Grid interconnection engineer', org: null, relOwner: 'geoff', strength: 'warm', location: 'Denver' },
];
// [daysAgo, kind, person, org, actor, source, summary]
const SAMPLE_TOUCHES = [
  [41, 'intro', 'maya', 'kestrel', 'jake', 'web', 'Intro from Ben Adler at Ridgeline'],
  [34, 'meeting', 'maya', 'kestrel', 'steve', 'agent', 'First call: inertial + vision navigation, two Navy pilots'],
  [12, 'meeting', 'maya', 'kestrel', 'steve', 'agent', 'Diligence session on unit cost and pilot results'],
  [20, 'call', 'daniel', 'ampere', 'geoff', 'web', 'Intro call: software that throttles training jobs during grid peaks'],
  [8, 'email', 'samuel', null, 'geoff', 'web', 'Asked for a read on interconnection timelines in ERCOT'],
  [27, 'meeting', 'priya', 'tessellate', 'jeremy', 'agent', 'Demo: layout for a 6-layer motor-controller board in under a day'],
  [5, 'call', 'priya', 'tessellate', 'jeremy', 'agent', 'Customer references from two drone makers'],
  [96, 'meeting', 'hana', 'halcyon', 'logan', 'web', 'Pitch meeting; strong team, no paying pilots yet'],
  [3, 'email', 'ben', 'ridgeline', 'jake', 'web', 'Shared two robotics founders raising this quarter'],
  [52, 'meeting', 'claire', 'granite', 'laura', 'web', 'Intro meeting; interested in defense and robotics exposure'],
  [15, 'email', 'claire', 'granite', 'laura', 'agent', 'Asked how the fund sizes follow-on positions'],
];

const mapOrg = (r) => ({ id: r.id, type: 'org', name: r.name, kind: r.kind, sector: r.sector, domain: r.domain, catalogId: r.catalog_id, stage: r.stage, dealOwner: r.deal_owner, nextStep: r.next_step, nextStepDue: r.next_step_due, passReason: r.pass_reason, notes: r.notes, sample: !!r.sample, archived: !!r.archived, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at });
const mapPerson = (r) => ({ id: r.id, type: 'person', name: r.name, kind: r.kind, title: r.title, orgId: r.org_id, email: r.email, location: r.location, relOwner: r.rel_owner, strength: r.strength, notes: r.notes, sample: !!r.sample, archived: !!r.archived, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at });
const mapTouch = (r) => ({ id: r.id, personId: r.person_id, orgId: r.org_id, kind: r.kind, summary: r.summary, actor: r.actor, source: r.source, at: r.occurred_at });

const touchStmt = (db, owner, t) => db.prepare('INSERT INTO crm_interactions(id,owner_id,person_id,org_id,kind,summary,actor,source,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .bind(crypto.randomUUID(), owner, t.personId || null, t.orgId || null, t.kind, t.summary, t.actor, t.source, t.at, new Date().toISOString());

async function seed(db, owner, catalog) {
  const now = Date.now();
  const at = (days) => new Date(now - days * DAY).toISOString();
  const day = (days) => new Date(now + days * DAY).toISOString().slice(0, 10);
  const created = at(60);
  const ids = {};
  const stmts = [];
  // Public research companies come in as organizations with no stage and no activity:
  // inclusion in the research catalog implies no Anti Fund interest or relationship.
  for (const c of (catalog?.companies || []).slice(0, 100)) {
    stmts.push(db.prepare("INSERT INTO crm_orgs(id,owner_id,name,kind,sector,domain,catalog_id,created_at,updated_at) VALUES(?,?,?,'company',?,?,?,?,?)")
      .bind(crypto.randomUUID(), owner, c.name, c.sector || null, c.domain || null, c.id, created, created));
  }
  for (const o of SAMPLE_ORGS) {
    ids[o.key] = crypto.randomUUID();
    stmts.push(db.prepare('INSERT INTO crm_orgs(id,owner_id,name,kind,sector,stage,deal_owner,next_step,next_step_due,pass_reason,sample,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)')
      .bind(ids[o.key], owner, o.name, o.kind, o.sector, o.stage || null, o.dealOwner || null, o.nextStep || null, o.due ? day(o.due) : null, o.passReason || null, created, created));
  }
  for (const p of SAMPLE_PEOPLE) {
    ids[p.key] = crypto.randomUUID();
    stmts.push(db.prepare('INSERT INTO crm_people(id,owner_id,name,kind,title,org_id,location,rel_owner,strength,sample,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)')
      .bind(ids[p.key], owner, p.name, p.kind, p.title, p.org ? ids[p.org] : null, p.location, p.relOwner, p.strength, created, created));
  }
  for (const [days, kind, person, org, actor, source, summary] of SAMPLE_TOUCHES) {
    stmts.push(touchStmt(db, owner, { personId: ids[person], orgId: org ? ids[org] : null, kind, summary, actor, source, at: at(days) }));
  }
  await db.batch(stmts);
}

export async function listCrm(db, owner, catalog, { archived = false } = {}) {
  const any = await db.prepare('SELECT 1 FROM crm_orgs WHERE owner_id=? LIMIT 1').bind(owner).first();
  if (!any) await seed(db, owner, catalog);
  const flag = archived ? 1 : 0;
  const [orgs, people, touches] = await db.batch([
    db.prepare('SELECT * FROM crm_orgs WHERE owner_id=? AND archived=? ORDER BY name COLLATE NOCASE LIMIT 2000').bind(owner, flag),
    db.prepare('SELECT * FROM crm_people WHERE owner_id=? AND archived=? ORDER BY name COLLATE NOCASE LIMIT 5000').bind(owner, flag),
    db.prepare('SELECT * FROM crm_interactions WHERE owner_id=? ORDER BY occurred_at DESC LIMIT 2000').bind(owner),
  ]);
  return { orgs: orgs.results.map(mapOrg), people: people.results.map(mapPerson), interactions: touches.results.map(mapTouch), stages: STAGES };
}

async function orgRow(db, owner, id) {
  const r = await db.prepare('SELECT * FROM crm_orgs WHERE id=? AND owner_id=?').bind(id, owner).first();
  if (!r) throw new ApiError(404, 'Organization not found');
  return r;
}
async function personRow(db, owner, id) {
  const r = await db.prepare('SELECT * FROM crm_people WHERE id=? AND owner_id=?').bind(id, owner).first();
  if (!r) throw new ApiError(404, 'Person not found');
  return r;
}
async function capacity(db, owner, table, limit) {
  const { n } = await db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE owner_id=?`).bind(owner).first();
  if (n >= limit) throw new ApiError(429, `This demo has reached its ${limit}-record limit`);
}

export async function createOrg(db, owner, input, actor, source = 'web') {
  await capacity(db, owner, 'crm_orgs', 2000);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const stmts = [db.prepare('INSERT INTO crm_orgs(id,owner_id,name,kind,sector,domain,stage,deal_owner,next_step,next_step_due,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, owner, input.name, input.kind, input.sector || null, input.domain || null, input.stage || null, input.dealOwner || null, input.nextStep || null, input.nextStepDue || null, input.notes || '', now, now)];
  if (input.stage) stmts.push(touchStmt(db, owner, { orgId: id, kind: 'stage', summary: `Added at ${stageLabel(input.stage)}`, actor, source, at: now }));
  await db.batch(stmts);
  return mapOrg(await orgRow(db, owner, id));
}

export async function createPerson(db, owner, input, actor, source = 'web') {
  await capacity(db, owner, 'crm_people', 5000);
  if (input.orgId) await orgRow(db, owner, input.orgId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO crm_people(id,owner_id,name,kind,title,org_id,email,location,rel_owner,strength,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, owner, input.name, input.kind, input.title || null, input.orgId || null, input.email || null, input.location || null, input.relOwner || actor || null, input.strength || 'cold', input.notes || '', now, now).run();
  return mapPerson(await personRow(db, owner, id));
}


const ORG_COLS = { name: 'name', kind: 'kind', sector: 'sector', domain: 'domain', stage: 'stage', dealOwner: 'deal_owner', nextStep: 'next_step', nextStepDue: 'next_step_due', passReason: 'pass_reason', notes: 'notes', archived: 'archived' };
const PERSON_COLS = { name: 'name', kind: 'kind', title: 'title', orgId: 'org_id', email: 'email', location: 'location', relOwner: 'rel_owner', strength: 'strength', notes: 'notes', archived: 'archived' };

// Updates match owner AND expected version atomically; a stale version is a 409, never a silent overwrite.
const updateStmt = (db, owner, table, cols, id, expectedVersion, changes, now = new Date().toISOString()) => {
  const entries = Object.entries(changes);
  return db.prepare(`UPDATE ${table} SET ${entries.map(([k]) => `${cols[k]}=?`).join(',')},version=version+1,updated_at=? WHERE id=? AND owner_id=? AND version=? RETURNING *`)
    .bind(...entries.map(([, v]) => (typeof v === 'boolean' ? Number(v) : v ?? null)), now, id, owner, expectedVersion);
};

export async function updateOrg(db, owner, id, { expectedVersion, changes }, actor, source = 'web') {
  const before = await orgRow(db, owner, id);
  const now = new Date().toISOString();
  const stmts = [updateStmt(db, owner, 'crm_orgs', ORG_COLS, id, expectedVersion, changes, now)];
  if ('stage' in changes && changes.stage !== before.stage) {
    // Same transaction as the update, and only written if the versioned update actually applied.
    const detail = changes.stage === 'passed' && changes.passReason ? ` — ${changes.passReason}` : '';
    stmts.push(db.prepare("INSERT INTO crm_interactions(id,owner_id,person_id,org_id,kind,summary,actor,source,occurred_at,created_at) SELECT ?,?,NULL,?,'stage',?,?,?,?,? WHERE EXISTS (SELECT 1 FROM crm_orgs WHERE id=? AND owner_id=? AND version=? AND updated_at=?)")
      .bind(crypto.randomUUID(), owner, id, `${stageLabel(before.stage)} → ${stageLabel(changes.stage)}${detail}`, actor, source, now, now, id, owner, expectedVersion + 1, now));
  }
  const [result] = await db.batch(stmts);
  const row = result.results?.[0];
  if (!row) throw new ApiError(409, 'Someone else changed this record. Reload to see the latest version.', { current: mapOrg(await orgRow(db, owner, id)) });
  return mapOrg(row);
}

export async function updatePerson(db, owner, id, { expectedVersion, changes }) {
  await personRow(db, owner, id);
  if (changes.orgId) await orgRow(db, owner, changes.orgId);
  const row = await updateStmt(db, owner, 'crm_people', PERSON_COLS, id, expectedVersion, changes).first();
  if (!row) throw new ApiError(409, 'Someone else changed this record. Reload to see the latest version.', { current: mapPerson(await personRow(db, owner, id)) });
  return mapPerson(row);
}

export async function logInteraction(db, owner, input, actor, source = 'web') {
  let orgId = input.orgId || null;
  if (input.personId) {
    const p = await personRow(db, owner, input.personId);
    orgId ||= p.org_id;
  }
  if (orgId) await orgRow(db, owner, orgId);
  if (!input.personId && !orgId) throw new ApiError(400, 'Link the interaction to a person or an organization');
  const at = input.occurredAt ? new Date(`${input.occurredAt}T12:00:00Z`).toISOString() : new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO crm_interactions(id,owner_id,person_id,org_id,kind,summary,actor,source,occurred_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(id, owner, input.personId || null, orgId, input.kind, input.summary, actor, source, at, new Date().toISOString()).run();
  return { id, personId: input.personId || null, orgId, kind: input.kind, summary: input.summary, actor, source, at };
}

export async function crmHistory(db, owner, entity, id) {
  const { results } = await db.prepare('SELECT version, data, created_at FROM crm_revisions WHERE owner_id=? AND entity=? AND record_id=? ORDER BY version DESC LIMIT 50').bind(owner, entity, id).all();
  return results.map((r) => ({ version: r.version, data: JSON.parse(r.data), at: r.created_at }));
}

