ALTER TABLE team_goals ADD COLUMN member TEXT;
ALTER TABLE team_goals ADD COLUMN target_date TEXT;

CREATE TABLE goal_tasks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  goal_id TEXT NOT NULL REFERENCES team_goals(id),
  title TEXT NOT NULL,
  assignee TEXT,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  done_by TEXT,
  done_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX goal_tasks_goal_idx ON goal_tasks(owner_id, goal_id, archived, created_at);

CREATE TABLE goal_log (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  goal_id TEXT NOT NULL REFERENCES team_goals(id),
  task_id TEXT,
  actor TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('web', 'agent')),
  action TEXT NOT NULL CHECK (action IN ('created_goal', 'added_task', 'claimed', 'completed', 'reopened', 'note')),
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX goal_log_goal_idx ON goal_log(owner_id, goal_id, created_at);

CREATE TABLE agent_keys (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  member TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
);
CREATE INDEX agent_keys_owner_idx ON agent_keys(owner_id, member, revoked);
