import { ApiError } from '../../packages/core/schema.js';

const COOKIE = 'afhq_session';
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');

export async function session(request, db, create = false) {
  const token = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const row = await db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').bind(await hash(token), new Date().toISOString()).first();
    if (row) return { row, cookie: null };
  }
  if (!create) throw new ApiError(401, 'Open your workspace first');
  const raw = randomToken();
  const now = new Date();
  const row = { id: crypto.randomUUID(), token_hash: await hash(raw), csrf_token: randomToken(), created_at: now.toISOString(), expires_at: new Date(now.getTime() + 30 * 86400000).toISOString() };
  const inserted = await db.prepare('INSERT INTO sessions(id,token_hash,csrf_token,created_at,expires_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM sessions WHERE expires_at>?) < 10000 RETURNING id')
    .bind(row.id, row.token_hash, row.csrf_token, row.created_at, row.expires_at, row.created_at).first();
  if (!inserted) throw new ApiError(429, 'Demo workspace capacity reached. Public research is still available; please try creating a workspace later.');
  return { row, cookie: `${COOKIE}=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}` };
}

export function verifyWrite(request, row) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw new ApiError(403, 'Same-origin request required');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) throw new ApiError(403, 'Cross-site write rejected');
  const token = request.headers.get('x-csrf-token');
  if (!token || token !== row.csrf_token) throw new ApiError(403, 'Invalid CSRF token');
}
