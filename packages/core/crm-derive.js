// Pure CRM helpers with no dependencies, shared by the browser UI, the API, and MCP tools.

export const STAGES = ['sourced', 'first_call', 'diligence', 'partner_review', 'invested', 'passed'];

export const stageLabel = (s) => ({ sourced: 'Sourced', first_call: 'First call', diligence: 'Diligence', partner_review: 'Partner review', invested: 'Invested', passed: 'Passed' })[s] || 'No stage';

// ---- Derived views shared by the UI, the API, and MCP tools ----

export function lastTouch(crm, record) {
  const key = record.type === 'org' ? 'orgId' : 'personId';
  return crm.interactions.find((t) => t[key] === record.id && t.kind !== 'stage')?.at || null;
}

// Who on the team knows this person or organization: relationship owners plus anyone who logged a touch.
export function whoKnows(crm, record) {
  const people = record.type === 'org' ? crm.people.filter((p) => p.orgId === record.id) : [record];
  const ids = new Set([record.id, ...people.map((p) => p.id)]);
  const tally = new Map();
  const bump = (member, at, why) => {
    if (!member) return;
    const cur = tally.get(member) || { member, touches: 0, last: null, reasons: new Set() };
    if (at) { cur.touches += 1; if (!cur.last || at > cur.last) cur.last = at; }
    cur.reasons.add(why);
    tally.set(member, cur);
  };
  people.forEach((p) => bump(p.relOwner, null, `owns relationship with ${p.name}`));
  if (record.type === 'org') bump(record.dealOwner, null, 'deal owner');
  crm.interactions.filter((t) => t.kind !== 'stage' && (ids.has(t.personId) || ids.has(t.orgId))).forEach((t) => bump(t.actor, t.at, 'logged touches'));
  return [...tally.values()].map((x) => ({ ...x, reasons: [...x.reasons] })).sort((a, b) => b.touches - a.touches || (b.last || '').localeCompare(a.last || ''));
}

const norm = (s) => String(s || '').toLowerCase();
export function searchCrm(crm, query, limit = 20) {
  const q = norm(query).trim();
  if (!q) return [];
  const orgName = (id) => crm.orgs.find((o) => o.id === id)?.name || '';
  const score = (fields) => {
    const [primary, ...rest] = fields.map(norm);
    if (primary === q) return 100;
    if (primary.startsWith(q)) return 80;
    if (primary.includes(q)) return 60;
    return rest.some((f) => f.includes(q)) ? 30 : 0;
  };
  const hits = [
    ...crm.orgs.map((o) => ({ record: o, score: score([o.name, o.sector, o.domain, o.notes, o.nextStep]) })),
    ...crm.people.map((p) => ({ record: p, score: score([p.name, orgName(p.orgId), p.title, p.kind, p.location, p.notes, p.email]) })),
  ];
  return hits.filter((h) => h.score > 0).sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name)).slice(0, limit).map((h) => h.record);
}

// A compact, citation-friendly summary of one record for agents.
export function describeRecord(crm, record) {
  const org = record.type === 'person' ? crm.orgs.find((o) => o.id === record.orgId) : record;
  const ids = record.type === 'org' ? new Set([record.id, ...crm.people.filter((p) => p.orgId === record.id).map((p) => p.id)]) : new Set([record.id]);
  return {
    id: record.id, type: record.type, name: record.name, kind: record.kind, sample: record.sample,
    ...(record.type === 'person' ? { title: record.title, organization: org ? { id: org.id, name: org.name } : null, relationshipOwner: record.relOwner, strength: record.strength, location: record.location, email: record.email }
      : { sector: record.sector, stage: stageLabel(record.stage), dealOwner: record.dealOwner, nextStep: record.nextStep, nextStepDue: record.nextStepDue, passReason: record.passReason, people: crm.people.filter((p) => p.orgId === record.id).map((p) => ({ id: p.id, name: p.name, title: p.title })) }),
    notes: record.notes || undefined,
    lastTouch: lastTouch(crm, record),
    whoKnows: whoKnows(crm, record).map((w) => ({ member: w.member, touches: w.touches, last: w.last })),
    history: crm.interactions.filter((t) => ids.has(t.personId) || ids.has(t.orgId)).slice(0, 15).map((t) => `${t.at.slice(0, 10)} ${t.actor} (${t.source}) ${t.kind}: ${t.summary}`),
  };
}
