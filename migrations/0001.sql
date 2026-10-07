PRAGMA foreign_keys = ON;

CREATE TABLE public_catalog (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK (json_valid(data)),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE workspace_records (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  type TEXT NOT NULL CHECK (type IN ('note', 'watchlist', 'memo')),
  company_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'done')),
  version INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX workspace_owner_idx ON workspace_records(owner_id, archived, updated_at);

CREATE TABLE record_revisions (
  record_id TEXT NOT NULL REFERENCES workspace_records(id),
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  version INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(record_id, version)
);
CREATE INDEX revision_owner_idx ON record_revisions(owner_id, record_id);

CREATE TRIGGER record_insert_revision AFTER INSERT ON workspace_records BEGIN
  INSERT INTO record_revisions (record_id,owner_id,version,data,created_at)
  VALUES(NEW.id,NEW.owner_id,NEW.version,json_object('id',NEW.id,'type',NEW.type,'companyId',NEW.company_id,'title',NEW.title,'body',NEW.body,'status',NEW.status,'version',NEW.version,'archived',json(CASE WHEN NEW.archived=1 THEN 'true' ELSE 'false' END),'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER record_update_revision AFTER UPDATE ON workspace_records BEGIN
  INSERT INTO record_revisions (record_id,owner_id,version,data,created_at)
  VALUES(NEW.id,NEW.owner_id,NEW.version,json_object('id',NEW.id,'type',NEW.type,'companyId',NEW.company_id,'title',NEW.title,'body',NEW.body,'status',NEW.status,'version',NEW.version,'archived',json(CASE WHEN NEW.archived=1 THEN 'true' ELSE 'false' END),'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER revision_no_update BEFORE UPDATE ON record_revisions BEGIN
  SELECT RAISE(ABORT, 'Revisions are immutable');
END;
CREATE TRIGGER revision_no_delete BEFORE DELETE ON record_revisions BEGIN
  SELECT RAISE(ABORT, 'Revisions are immutable');
END;
CREATE TRIGGER record_version_guard BEFORE UPDATE ON workspace_records
WHEN NEW.version != OLD.version + 1 OR NEW.owner_id != OLD.owner_id OR NEW.id != OLD.id
BEGIN SELECT RAISE(ABORT, 'Invalid record revision'); END;
