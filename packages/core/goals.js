import { ApiError } from './schema.js';

// Illustrative direction until the team sets its own; not Anti Fund's real goals.
const SAMPLE = [
  ['month', 'Every partner connected to HQ through their agent'],
  ['month', 'Founder radar v1 live for the team'],
  ['quarter', 'Median time to decision under 10 days'],
  ['quarter', 'Log 95% of group-chat deal mentions'],
  ['year', 'Proprietary signals source half of new deals'],
  ['year', 'LP reporting fully automated'],
];

const mapGoal = row => ({ id: row.id, horizon: row.horizon, title: row.title, done: !!row.done, version: row.version, createdAt: row.created_at });

export async function listGoals(db, ownerId) {
  const any = await db.prepare('SELECT 1 FROM team_goals WHERE owner_id=? LIMIT 1').bind(ownerId).first();
  if (!any) {
    const base = Date.now();
    await db.batch(SAMPLE.map(([horizon, title], i) => {
      const at = new Date(base + i).toISOString();
      return db.prepare('INSERT INTO team_goals(id,owner_id,horizon,title,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(), ownerId, horizon, title, at, at);
    }));
  }
  const { results } = await db.prepare('SELECT * FROM team_goals WHERE owner_id=? AND archived=0 ORDER BY created_at ASC,id ASC LIMIT 200').bind(ownerId).all();
  return results.map(mapGoal);
}

export async function createGoal(db, ownerId, input) {
  const now = new Date().toISOString();
  const row = await db.prepare(`INSERT INTO team_goals(id,owner_id,horizon,title,created_at,updated_at)
    SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM team_goals WHERE owner_id=?) < 200 RETURNING *`)
    .bind(crypto.randomUUID(), ownerId, input.horizon, input.title, now, now, ownerId).first();
  if (!row) throw new ApiError(429, 'This demo has reached its 200-goal limit');
  return mapGoal(row);
}

export async function updateGoal(db, ownerId, id, input) {
  const entries = Object.entries(input.changes);
  const row = await db.prepare(`UPDATE team_goals SET ${entries.map(([k]) => `${k}=?`).join(',')},version=version+1,updated_at=? WHERE id=? AND owner_id=? AND version=? RETURNING *`)
    .bind(...entries.map(([, v]) => typeof v === 'boolean' ? Number(v) : v), new Date().toISOString(), id, ownerId, input.expectedVersion).first();
  if (!row) {
    const current = await db.prepare('SELECT version FROM team_goals WHERE id=? AND owner_id=?').bind(id, ownerId).first();
    if (!current) throw new ApiError(404, 'Goal not found');
    throw new ApiError(409, 'This goal changed. Reload before saving.', { currentVersion: current.version });
  }
  return mapGoal(row);
}
