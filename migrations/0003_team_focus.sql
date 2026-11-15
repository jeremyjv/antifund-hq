CREATE TABLE team_focuses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  member TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX team_focus_owner_idx ON team_focuses(owner_id, archived, member, created_at);
