import { ApiError, parseBody, recordCreate, recordUpdate } from '../../packages/core/schema.js';
import { catalog, listRecords, createRecord, updateRecord, history } from '../../packages/core/store.js';
import { buildContext } from '../../packages/core/context.js';
import { session, verifyWrite } from './session.js';
import { handleMcp } from './mcp.js';

function secure(response) {
  const result = new Response(response.body, response);
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  result.headers.set('X-Frame-Options', 'DENY');
  result.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  result.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return result;
}
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/mcp') return handleMcp(request, env);
  if (path === '/api/health' && request.method === 'GET') {
    await env.DB.prepare('SELECT 1 FROM sessions LIMIT 1').first();
    const seeded = await env.DB.prepare("SELECT version FROM public_catalog WHERE id='public-research'").first();
    return json({ ok: !!seeded, database: 'D1', researchReady: !!seeded }, seeded ? 200 : 503);
  }
  if (path === '/api/research' && request.method === 'GET') return json(await catalog(env.DB));
  if (path === '/api/context' && request.method === 'GET') return json(buildContext(await catalog(env.DB), { companyId: url.searchParams.get('companyId') || '', query: url.searchParams.get('query') || '' }));
  if (path === '/api/workspace' && request.method === 'GET') {
    const auth = await session(request, env.DB, true);
    return json({ records: await listRecords(env.DB, auth.row.id, url.searchParams.get('archived') === 'true'), csrfToken: auth.row.csrf_token, sessionExpiresAt: auth.row.expires_at }, 200, auth.cookie ? { 'Set-Cookie': auth.cookie } : {});
  }
  if (path === '/api/workspace' && request.method === 'POST') {
    const auth = await session(request, env.DB);
    verifyWrite(request, auth.row);
    const input = await parseBody(request, recordCreate);
    return json({ record: await createRecord(env.DB, auth.row.id, input) }, 201);
  }
  const recordRoute = path.match(/^\/api\/workspace\/([a-f0-9-]{36})(\/history)?$/);
  if (recordRoute) {
    const auth = await session(request, env.DB);
    if (recordRoute[2] && request.method === 'GET') return json({ revisions: await history(env.DB, auth.row.id, recordRoute[1]) });
    if (!recordRoute[2] && request.method === 'PATCH') {
      verifyWrite(request, auth.row);
      return json({ record: await updateRecord(env.DB, auth.row.id, recordRoute[1], await parseBody(request, recordUpdate)) });
    }
    throw new ApiError(405, 'Method not allowed');
  }
  if (path.startsWith('/api/')) throw new ApiError(404, 'Endpoint not found');
  return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Anti Fund HQ', { headers: { 'content-type': 'text/plain' } });
}

export default {
  async fetch(request, env) {
    try { return secure(await route(request, env)); }
    catch (error) {
      return secure(json({ error: error.status ? error.message : 'Service temporarily unavailable', ...(error.details ? { details: error.details } : {}) }, error.status || 503));
    }
  },
};
