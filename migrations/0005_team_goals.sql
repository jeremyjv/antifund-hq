CREATE TABLE team_goals (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  horizon TEXT NOT NULL CHECK (horizon IN ('month', 'quarter', 'year')),
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX team_goal_owner_idx ON team_goals(owner_id, archived, horizon, created_at);
