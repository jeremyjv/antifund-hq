import { ApiError } from './schema.js';

// Team roster from antifund.com (public). Sample focuses are illustrative demo
// content until members sign in; they are not Anti Fund's real priorities.
export const TEAM = [
  { id: 'geoff', name: 'Geoff', role: 'Managing Partner' },
  { id: 'jake', name: 'Jake', role: 'Managing Partner' },
  { id: 'logan', name: 'Logan', role: 'General Partner' },
  { id: 'steve', name: 'Steve', role: 'Partner' },
  { id: 'laura', name: 'Laura', role: 'Capital Formation' },
  { id: 'jeremy', name: 'Jeremy', role: 'Technical Staff' },
];
export const TEAM_IDS = TEAM.map(member => member.id);

const SAMPLE = [
  ['geoff', 'Review weekly sourcing shortlist', 0],
  ['geoff', 'Pick next thesis area for agent research', 0],
  ['jake', 'Founder list for next field visit', 0],
  ['logan', 'Portfolio content calendar check-in', 0],
  ['steve', 'Pipeline review: seed-stage AI infra', 0],
  ['steve', 'Diligence questions before partner meeting', 0],
  ['laura', 'Draft quarterly LP update', 0],
  ['jeremy', 'Ship team home with weekly focuses', 1],
  ['jeremy', 'Capture group-chat deal mentions into pipeline', 0],
  ['jeremy', 'Portfolio stats source of truth', 0],
];

const mapFocus = row => ({ id: row.id, week: row.week, member: row.member, title: row.title, done: !!row.done, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at });

export function mondayOf(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export async function listFocuses(db, ownerId, week = mondayOf()) {
  const any = await db.prepare('SELECT 1 FROM team_focuses WHERE owner_id=? LIMIT 1').bind(ownerId).first();
  if (!any) {
    const base = Date.now();
    await db.batch(SAMPLE.map(([member, title, done], i) => {
      const at = new Date(base + i).toISOString();
      return db.prepare('INSERT INTO team_focuses(id,owner_id,week,member,title,done,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), ownerId, week, member, title, done, at, at);
    }));
  }
  const { results } = await db.prepare('SELECT * FROM team_focuses WHERE owner_id=? AND week=? AND archived=0 ORDER BY created_at ASC,id ASC LIMIT 300').bind(ownerId, week).all();
  return results.map(mapFocus);
}

export async function createFocus(db, ownerId, input) {
  const now = new Date().toISOString();
  const row = await db.prepare(`INSERT INTO team_focuses(id,owner_id,week,member,title,created_at,updated_at)
    SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM team_focuses WHERE owner_id=?) < 1000 RETURNING *`)
    .bind(crypto.randomUUID(), ownerId, input.week, input.member, input.title, now, now, ownerId).first();
  if (!row) throw new ApiError(429, 'This demo board has reached its 1,000-focus limit');
  return mapFocus(row);
}

export async function updateFocus(db, ownerId, id, input) {
  const entries = Object.entries(input.changes);
  const assignments = entries.map(([key]) => `${key}=?`).join(',');
  const values = entries.map(([key, value]) => typeof value === 'boolean' ? Number(value) : value);
  const row = await db.prepare(`UPDATE team_focuses SET ${assignments},version=version+1,updated_at=? WHERE id=? AND owner_id=? AND version=? RETURNING *`)
    .bind(...values, new Date().toISOString(), id, ownerId, input.expectedVersion).first();
  if (!row) {
    const current = await db.prepare('SELECT version FROM team_focuses WHERE id=? AND owner_id=?').bind(id, ownerId).first();
    if (!current) throw new ApiError(404, 'Focus not found');
    throw new ApiError(409, 'This focus changed. Reload before saving.', { currentVersion: current.version });
  }
  return mapFocus(row);
}
