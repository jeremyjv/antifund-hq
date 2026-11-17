import { ApiError, parseBody, recordCreate, recordUpdate, focusCreate, focusUpdate, weekId, goalCreate, goalUpdate, taskCreate, taskAction, goalNote, agentKeyCreate, crmOrgCreate, crmPersonCreate, crmOrgUpdate, crmPersonUpdate, crmInteractionCreate } from '../../packages/core/schema.js';
import { listCrm, createOrg, createPerson, updateOrg, updatePerson, logInteraction, crmHistory } from '../../packages/core/crm.js';
import { TEAM, listFocuses, createFocus, updateFocus } from '../../packages/core/team.js';
import { listGoals, createGoal, updateGoal, addTask, claimTask, unclaimTask, setTaskDone, archiveTask, addNote, createAgentKey, listAgentKeys } from '../../packages/core/goals.js';
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

function weekParam(value) {
  const result = weekId.safeParse(value);
  if (!result.success) throw new ApiError(400, 'Week must be a Monday date (YYYY-MM-DD)');
  return result.data;
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/mcp' || /^\/mcp\/afhq_[a-f0-9]{48}$/.test(path)) return handleMcp(request, env);
  if (path === '/api/health' && request.method === 'GET') {
    await env.DB.prepare('SELECT 1 FROM sessions LIMIT 1').first();
    const seeded = await env.DB.prepare("SELECT version FROM public_catalog WHERE id='public-research'").first();
    return json({ ok: !!seeded, database: 'D1', researchReady: !!seeded }, seeded ? 200 : 503);
  }
  if (path === '/api/research' && request.method === 'GET') return json(await catalog(env.DB));
  if (path === '/api/context' && request.method === 'GET') return json(buildContext(await catalog(env.DB), { companyId: url.searchParams.get('companyId') || '', query: url.searchParams.get('query') || '' }));
  if (path === '/api/team' && request.method === 'GET') {
    const auth = await session(request, env.DB, true);
    return json({ members: TEAM, focuses: await listFocuses(env.DB, auth.row.id, url.searchParams.get('week') ? weekParam(url.searchParams.get('week')) : undefined), csrfToken: auth.row.csrf_token }, 200, auth.cookie ? { 'Set-Cookie': auth.cookie } : {});
  }
  if (path === '/api/goals' && request.method === 'GET') {
    const auth = await session(request, env.DB, true);
    return json({ goals: await listGoals(env.DB, auth.row.id), agentKeys: await listAgentKeys(env.DB, auth.row.id), csrfToken: auth.row.csrf_token }, 200, auth.cookie ? { 'Set-Cookie': auth.cookie } : {});
  }
  if (path === '/api/goals' && request.method === 'POST') {
    const auth = await session(request, env.DB);
    verifyWrite(request, auth.row);
    const input = await parseBody(request, goalCreate);
    return json({ id: await createGoal(env.DB, auth.row.id, input, input.actor) }, 201);
  }
  const goalRoute = path.match(/^\/api\/goals\/([a-f0-9-]{36})(\/tasks|\/notes)?$/);
  if (goalRoute) {
    const auth = await session(request, env.DB);
    verifyWrite(request, auth.row);
    if (!goalRoute[2] && request.method === 'PATCH') {
      await updateGoal(env.DB, auth.row.id, goalRoute[1], (await parseBody(request, goalUpdate)).changes);
      return json({ ok: true });
    }
    if (goalRoute[2] === '/tasks' && request.method === 'POST') {
      const input = await parseBody(request, taskCreate);
      return json(await addTask(env.DB, auth.row.id, goalRoute[1], input, input.actor), 201);
    }
    if (goalRoute[2] === '/notes' && request.method === 'POST') {
      const input = await parseBody(request, goalNote);
      await addNote(env.DB, auth.row.id, goalRoute[1], input.actor, input.note);
      return json({ ok: true }, 201);
    }
    throw new ApiError(405, 'Method not allowed');
  }
  const taskRoute = path.match(/^\/api\/tasks\/([a-f0-9-]{36})$/);
  if (taskRoute) {
    if (request.method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const auth = await session(request, env.DB);
    verifyWrite(request, auth.row);
    const { action, actor, note } = await parseBody(request, taskAction);
    const id = taskRoute[1], owner = auth.row.id;
    const task = action === 'claim' ? await claimTask(env.DB, owner, id, actor)
      : action === 'unclaim' ? await unclaimTask(env.DB, owner, id)
      : action === 'complete' ? await setTaskDone(env.DB, owner, id, true, actor, 'web', note)
      : action === 'reopen' ? await setTaskDone(env.DB, owner, id, false, actor, 'web')
      : (await archiveTask(env.DB, owner, id), null);
    return json({ task });
  }
  if (path === '/api/crm' && request.method === 'GET') {
    const auth = await session(request, env.DB, true);
    const crm = await listCrm(env.DB, auth.row.id, await catalog(env.DB), { archived: url.searchParams.get('archived') === 'true' });
    return json({ ...crm, csrfToken: auth.row.csrf_token }, 200, auth.cookie ? { 'Set-Cookie': auth.cookie } : {});
  }
  const crmRoute = path.match(/^\/api\/crm\/(orgs|people|interactions)(?:\/([a-f0-9-]{36})(\/history)?)?$/);
  if (crmRoute) {
    const [, kind, id, hist] = crmRoute;
    const auth = await session(request, env.DB);
    const owner = auth.row.id;
    if (hist && request.method === 'GET' && kind !== 'interactions') return json({ revisions: await crmHistory(env.DB, owner, kind === 'orgs' ? 'org' : 'person', id) });
    verifyWrite(request, auth.row);
    if (!id && request.method === 'POST') {
      if (kind === 'orgs') { const input = await parseBody(request, crmOrgCreate); return json({ org: await createOrg(env.DB, owner, input, input.actor) }, 201); }
      if (kind === 'people') { const input = await parseBody(request, crmPersonCreate); return json({ person: await createPerson(env.DB, owner, input, input.actor) }, 201); }
      const input = await parseBody(request, crmInteractionCreate);
      return json({ interaction: await logInteraction(env.DB, owner, input, input.actor) }, 201);
    }
    if (id && !hist && request.method === 'PATCH' && kind === 'orgs') { const input = await parseBody(request, crmOrgUpdate); return json({ org: await updateOrg(env.DB, owner, id, input, input.actor) }); }
    if (id && !hist && request.method === 'PATCH' && kind === 'people') { const input = await parseBody(request, crmPersonUpdate); return json({ person: await updatePerson(env.DB, owner, id, input) }); }
    throw new ApiError(405, 'Method not allowed');
  }
  if (path === '/api/agent-keys' && request.method === 'POST') {
    const auth = await session(request, env.DB);
    verifyWrite(request, auth.row);
    const { member } = await parseBody(request, agentKeyCreate);
    return json({ member, key: await createAgentKey(env.DB, auth.row.id, member) }, 201);
  }
  if (path === '/api/team/focus' && request.method === 'POST') {
    const auth = await session(request, env.DB);
    verifyWrite(request, auth.row);
    return json({ focus: await createFocus(env.DB, auth.row.id, await parseBody(request, focusCreate)) }, 201);
  }
  const focusRoute = path.match(/^\/api\/team\/focus\/([a-f0-9-]{36})$/);
  if (focusRoute) {
    if (request.method !== 'PATCH') throw new ApiError(405, 'Method not allowed');
    const auth = await session(request, env.DB);
    verifyWrite(request, auth.row);
    return json({ focus: await updateFocus(env.DB, auth.row.id, focusRoute[1], await parseBody(request, focusUpdate)) });
  }
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
