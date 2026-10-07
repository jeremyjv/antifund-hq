import { ApiError } from './schema.js';

export async function catalog(db) {
  const row = await db.prepare("SELECT data,version,updated_at FROM public_catalog WHERE id='public-research'").first();
  if (!row) throw new ApiError(503, 'Research catalog is being prepared');
  return { ...JSON.parse(row.data), catalogVersion: row.version };
}

export function mapRecord(row) {
  return { id: row.id, type: row.type, companyId: row.company_id, title: row.title, body: row.body, status: row.status, version: row.version, archived: !!row.archived, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function listRecords(db, ownerId, archived) {
  const { results } = await db.prepare('SELECT * FROM workspace_records WHERE owner_id=? AND archived=? ORDER BY updated_at DESC,id DESC LIMIT 100').bind(ownerId, archived ? 1 : 0).all();
  return results.map(mapRecord);
}

export async function createRecord(db, ownerId, input) {
  if (input.companyId) {
    const data = await catalog(db);
    if (!data.companies.some(company => company.id === input.companyId)) throw new ApiError(400, 'Unknown company reference');
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = await db.prepare(`INSERT OR IGNORE INTO workspace_records(id,owner_id,type,company_id,title,body,status,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM workspace_records WHERE owner_id=?) < 100 RETURNING *`)
    .bind(id, ownerId, input.type, input.companyId || null, input.title, input.body, input.status, now, now, ownerId).first();
  if (!row) {
    if (input.type === 'watchlist' && input.companyId) {
      const existing = await db.prepare("SELECT * FROM workspace_records WHERE owner_id=? AND company_id=? AND type='watchlist' AND archived=0").bind(ownerId, input.companyId).first();
      if (existing) return mapRecord(existing);
    }
    throw new ApiError(429, 'This demo workspace has reached its 100-record limit');
  }
  return mapRecord(row);
}

export async function updateRecord(db, ownerId, id, input) {
  const columns = { title: 'title', body: 'body', status: 'status', archived: 'archived' };
  const entries = Object.entries(input.changes);
  const assignments = entries.map(([key]) => `${columns[key]}=?`).join(',');
  const values = entries.map(([key, value]) => key === 'archived' ? Number(value) : value);
  let row;
  try {
    row = await db.prepare(`UPDATE workspace_records SET ${assignments},version=version+1,updated_at=? WHERE id=? AND owner_id=? AND version=? AND version < 500 RETURNING *`)
      .bind(...values, new Date().toISOString(), id, ownerId, input.expectedVersion).first();
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed: workspace_records.owner_id, workspace_records.company_id')) throw new ApiError(409, 'This company already has an active watchlist entry. Archive that entry before restoring this one.');
    throw error;
  }
  if (!row) {
    const current = await db.prepare('SELECT version FROM workspace_records WHERE id=? AND owner_id=?').bind(id, ownerId).first();
    if (!current) throw new ApiError(404, 'Record not found');
    if (current.version >= 500) throw new ApiError(429, 'This demo record has reached its revision limit');
    throw new ApiError(409, 'This record changed. Reload it before saving.', { currentVersion: current.version });
  }
  return mapRecord(row);
}

export async function history(db, ownerId, id) {
  const exists = await db.prepare('SELECT id FROM workspace_records WHERE id=? AND owner_id=?').bind(id, ownerId).first();
  if (!exists) throw new ApiError(404, 'Record not found');
  const { results } = await db.prepare('SELECT data FROM record_revisions WHERE record_id=? AND owner_id=? ORDER BY version DESC LIMIT 500').bind(id, ownerId).all();
  return results.map(row => JSON.parse(row.data));
}
