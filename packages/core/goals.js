import { ApiError } from './schema.js';

// Goals carry an owner, a target date, and the high-level tasks needed to reach them.
// Progress = completed tasks / total tasks. Every change writes an activity log entry,
// whether it came from the web UI or from a teammate's agent over MCP.

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);

// Illustrative starting goals until the team sets its own; not Anti Fund's real plan.
const SAMPLE = [
  { title: 'Every partner connected to HQ through their agent', member: 'jeremy', days: 30, tasks: [
    ['Write one-page agent setup guide', 'jeremy', 'jeremy'],
    ["Connect Jeremy's agent", 'jeremy', 'jeremy'],
    ["Connect Geoff's and Steve's agents", 'jeremy', null],
    ["Connect Jake's, Logan's, and Laura's agents", null, null],
  ] },
  { title: 'Log 95% of group-chat deal mentions', member: 'jeremy', days: 75, tasks: [
    ['Pick which group chats to capture', 'geoff', 'geoff'],
    ['Build mention-capture agent', 'jeremy', null],
    ['Weekly review of missed mentions', null, null],
  ] },
  { title: 'Median time to decision under 10 days', member: 'steve', days: 90, tasks: [
    ['Define pipeline stages and exit criteria', 'steve', 'steve'],
    ['Auto-draft a memo after every founder call', 'jeremy', null],
    ['Hold a weekly partner decision slot', 'geoff', null],
  ] },
  { title: 'Quarterly LP update fully automated', member: 'laura', days: 135, tasks: [
    ['Collect the last two LP updates as templates', 'laura', null],
    ['Map a data source to every section', null, null],
    ['Build the LP update drafting agent', null, null],
  ] },
];

const mapTask = (r) => ({ id: r.id, goalId: r.goal_id, title: r.title, assignee: r.assignee, done: !!r.done, doneBy: r.done_by, doneAt: r.done_at, createdAt: r.created_at });
const mapLog = (r) => ({ id: r.id, goalId: r.goal_id, taskId: r.task_id, actor: r.actor, source: r.source, action: r.action, detail: r.detail, at: r.created_at });

const logStmt = (db, ownerId, goalId, taskId, actor, source, action, detail, at = new Date().toISOString()) =>
  db.prepare('INSERT INTO goal_log(id,owner_id,goal_id,task_id,actor,source,action,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), ownerId, goalId, taskId, actor, source, action, detail, at);

async function seed(db, ownerId) {
  const now = Date.now();
  const stmts = [db.prepare('UPDATE team_goals SET archived=1,version=version+1 WHERE owner_id=? AND member IS NULL AND archived=0').bind(ownerId)];
  SAMPLE.forEach((g, gi) => {
    const goalId = crypto.randomUUID();
    const created = new Date(now - 6 * DAY + gi * 1000).toISOString();
    stmts.push(db.prepare("INSERT INTO team_goals(id,owner_id,horizon,title,member,target_date,created_at,updated_at) VALUES(?,?,'quarter',?,?,?,?,?)")
      .bind(goalId, ownerId, g.title, g.member, iso(new Date(now + g.days * DAY)), created, created));
    stmts.push(logStmt(db, ownerId, goalId, null, g.member, 'web', 'created_goal', g.title, created));
    g.tasks.forEach(([title, assignee, doneBy], ti) => {
      const taskId = crypto.randomUUID();
      const at = new Date(now - (5 - ti) * DAY + gi * 1000).toISOString();
      const doneAt = doneBy ? new Date(now - (3 - ti) * DAY * 0.5 + gi * 1000).toISOString() : null;
      stmts.push(db.prepare('INSERT INTO goal_tasks(id,owner_id,goal_id,title,assignee,done,done_by,done_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .bind(taskId, ownerId, goalId, title, assignee, doneBy ? 1 : 0, doneBy, doneAt, at, doneAt || at));
      stmts.push(logStmt(db, ownerId, goalId, taskId, g.member, 'web', 'added_task', title, at));
      if (assignee && !doneBy) stmts.push(logStmt(db, ownerId, goalId, taskId, assignee, 'agent', 'claimed', title, at));
      if (doneBy) stmts.push(logStmt(db, ownerId, goalId, taskId, doneBy, ti % 2 ? 'web' : 'agent', 'completed', title, doneAt));
    });
  });
  await db.batch(stmts);
}

export async function listGoals(db, ownerId) {
  const modern = await db.prepare('SELECT 1 FROM team_goals WHERE owner_id=? AND member IS NOT NULL LIMIT 1').bind(ownerId).first();
  if (!modern) await seed(db, ownerId);
  const [goals, tasks, logs] = await db.batch([
    db.prepare('SELECT * FROM team_goals WHERE owner_id=? AND archived=0 AND member IS NOT NULL ORDER BY target_date ASC, created_at ASC LIMIT 100').bind(ownerId),
    db.prepare('SELECT * FROM goal_tasks WHERE owner_id=? AND archived=0 ORDER BY created_at ASC LIMIT 1000').bind(ownerId),
    db.prepare('SELECT * FROM goal_log WHERE owner_id=? ORDER BY created_at DESC LIMIT 400').bind(ownerId),
  ]);
  return goals.results.map((g) => {
    const t = tasks.results.filter((x) => x.goal_id === g.id).map(mapTask);
    return {
      id: g.id, title: g.title, member: g.member, targetDate: g.target_date, version: g.version, createdAt: g.created_at,
      tasks: t, done: t.filter((x) => x.done).length, total: t.length,
      log: logs.results.filter((x) => x.goal_id === g.id).slice(0, 30).map(mapLog),
    };
  });
}

async function goalRow(db, ownerId, goalId) {
  const g = await db.prepare('SELECT * FROM team_goals WHERE id=? AND owner_id=? AND archived=0').bind(goalId, ownerId).first();
  if (!g) throw new ApiError(404, 'Goal not found');
  return g;
}
async function taskRow(db, ownerId, taskId) {
  const t = await db.prepare('SELECT * FROM goal_tasks WHERE id=? AND owner_id=? AND archived=0').bind(taskId, ownerId).first();
  if (!t) throw new ApiError(404, 'Task not found');
  return t;
}

export async function createGoal(db, ownerId, input, actor, source = 'web') {
  const count = await db.prepare('SELECT COUNT(*) n FROM team_goals WHERE owner_id=?').bind(ownerId).first();
  if (count.n >= 200) throw new ApiError(429, 'This demo has reached its 200-goal limit');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO team_goals(id,owner_id,horizon,title,member,target_date,created_at,updated_at) VALUES(?,?,'quarter',?,?,?,?,?)").bind(id, ownerId, input.title, input.member, input.targetDate, now, now),
    logStmt(db, ownerId, id, null, actor, source, 'created_goal', input.title, now),
  ]);
  return id;
}

export async function updateGoal(db, ownerId, goalId, changes) {
  await goalRow(db, ownerId, goalId);
  const cols = { title: 'title', member: 'member', targetDate: 'target_date', archived: 'archived' };
  const entries = Object.entries(changes);
  await db.prepare(`UPDATE team_goals SET ${entries.map(([k]) => `${cols[k]}=?`).join(',')},version=version+1,updated_at=? WHERE id=? AND owner_id=?`)
    .bind(...entries.map(([, v]) => (typeof v === 'boolean' ? Number(v) : v)), new Date().toISOString(), goalId, ownerId).run();
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Adding a task that already exists (open, same wording) returns the existing one instead of a duplicate.
export async function addTask(db, ownerId, goalId, input, actor, source = 'web') {
  await goalRow(db, ownerId, goalId);
  const { results } = await db.prepare('SELECT * FROM goal_tasks WHERE owner_id=? AND goal_id=? AND archived=0').bind(ownerId, goalId).all();
  const dup = results.find((t) => !t.done && norm(t.title) === norm(input.title));
  if (dup) return { task: mapTask(dup), duplicate: true };
  if (results.length >= 50) throw new ApiError(429, 'This goal already has 50 tasks');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const stmts = [
    db.prepare('INSERT INTO goal_tasks(id,owner_id,goal_id,title,assignee,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id, ownerId, goalId, input.title, input.assignee || null, now, now),
    logStmt(db, ownerId, goalId, id, actor, source, 'added_task', input.title, now),
  ];
  if (input.assignee) stmts.push(logStmt(db, ownerId, goalId, id, input.assignee, source, 'claimed', input.title, now));
  await db.batch(stmts);
  return { task: mapTask(await taskRow(db, ownerId, id)), duplicate: false };
}

// Claiming is atomic: it only succeeds if nobody else holds the task, so two people never work the same task.
export async function claimTask(db, ownerId, taskId, actor, source = 'web') {
  const t = await taskRow(db, ownerId, taskId);
  if (t.done) throw new ApiError(409, `Already completed by ${t.done_by}`);
  const now = new Date().toISOString();
  const row = await db.prepare('UPDATE goal_tasks SET assignee=?,updated_at=? WHERE id=? AND owner_id=? AND done=0 AND (assignee IS NULL OR assignee=?) RETURNING *').bind(actor, now, taskId, ownerId, actor).first();
  if (!row) {
    const cur = await taskRow(db, ownerId, taskId);
    throw new ApiError(409, `Already claimed by ${cur.assignee}`);
  }
  if (t.assignee !== actor) await logStmt(db, ownerId, t.goal_id, taskId, actor, source, 'claimed', t.title, now).run();
  return mapTask(row);
}

export async function unclaimTask(db, ownerId, taskId) {
  const row = await db.prepare('UPDATE goal_tasks SET assignee=NULL,updated_at=? WHERE id=? AND owner_id=? AND done=0 RETURNING *').bind(new Date().toISOString(), taskId, ownerId).first();
  if (!row) throw new ApiError(404, 'Task not found or already done');
  return mapTask(row);
}

export async function setTaskDone(db, ownerId, taskId, done, actor, source = 'web', note = '') {
  const t = await taskRow(db, ownerId, taskId);
  if (done && t.assignee && t.assignee !== actor && source === 'agent') throw new ApiError(409, `Claimed by ${t.assignee}; ask them or have them unclaim it first`);
  const now = new Date().toISOString();
  const row = await db.prepare('UPDATE goal_tasks SET done=?,done_by=?,done_at=?,assignee=COALESCE(assignee,?),updated_at=? WHERE id=? AND owner_id=? AND done=? RETURNING *')
    .bind(done ? 1 : 0, done ? actor : null, done ? now : null, actor, now, taskId, ownerId, done ? 0 : 1).first();
  if (!row) throw new ApiError(409, done ? `Already completed by ${t.done_by}` : 'Task is not completed');
  await logStmt(db, ownerId, t.goal_id, taskId, actor, source, done ? 'completed' : 'reopened', note ? `${t.title} — ${note}` : t.title, now).run();
  return mapTask(row);
}

export async function archiveTask(db, ownerId, taskId) {
  const row = await db.prepare('UPDATE goal_tasks SET archived=1,updated_at=? WHERE id=? AND owner_id=? AND archived=0 RETURNING id').bind(new Date().toISOString(), taskId, ownerId).first();
  if (!row) throw new ApiError(404, 'Task not found');
}

export async function addNote(db, ownerId, goalId, actor, note, source = 'web') {
  await goalRow(db, ownerId, goalId);
  await logStmt(db, ownerId, goalId, null, actor, source, 'note', note).run();
}

// Agent keys: each teammate gets a personal key. The agent acts as that teammate, so its log entries are attributed correctly.
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, '0')).join('');

export async function createAgentKey(db, ownerId, member) {
  const raw = `afhq_${Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  await db.batch([
    db.prepare('UPDATE agent_keys SET revoked=1 WHERE owner_id=? AND member=? AND revoked=0').bind(ownerId, member),
    db.prepare('INSERT INTO agent_keys(id,owner_id,member,key_hash,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), ownerId, member, await hash(raw), new Date().toISOString()),
  ]);
  return raw;
}

export async function listAgentKeys(db, ownerId) {
  const { results } = await db.prepare('SELECT member, created_at FROM agent_keys WHERE owner_id=? AND revoked=0').bind(ownerId).all();
  return results.map((r) => ({ member: r.member, createdAt: r.created_at }));
}

export async function resolveAgentKey(db, raw) {
  if (!raw || !/^afhq_[a-f0-9]{48}$/.test(raw)) return null;
  return db.prepare('SELECT owner_id, member FROM agent_keys WHERE key_hash=? AND revoked=0').bind(await hash(raw)).first();
}
