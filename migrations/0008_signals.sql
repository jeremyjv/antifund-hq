-- Signal Watch: public internet signals (shared cache of free public sources) and
-- owner-scoped watches that decide which signals matter to whom.

-- Public observations. One row per source item; repeated fetches refresh metrics, never duplicate.
-- id is '<source>:<external id>'; url is the canonical primary source; entity_key is the normalized
-- company name used for cross-source matching; published_at is when it happened at the source
-- (nullable), first_seen_at / retrieved_at are when HQ fetched it.
CREATE TABLE signals (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('launch', 'repo', 'model', 'paper', 'raise', 'contract', 'post')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  author TEXT,
  entity TEXT,
  entity_key TEXT,
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  metrics TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metrics)),
  published_at TEXT,
  first_seen_at TEXT NOT NULL,
  retrieved_at TEXT NOT NULL
);
CREATE INDEX signals_seen_idx ON signals(first_seen_at);
CREATE INDEX signals_entity_idx ON signals(entity_key);
CREATE INDEX signals_source_idx ON signals(source, first_seen_at);

-- Every ingestion run, so the UI can show source health honestly.
CREATE TABLE signal_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('cron', 'manual')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error')),
  fetched INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX signal_runs_source_idx ON signal_runs(source, started_at);

-- Watches: saved criteria. Data, not code: edit in the UI or through an agent over MCP.
CREATE TABLE watches (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sources TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sources)),
  kinds TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(kinds)),
  include_terms TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(include_terms)),
  require_terms TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(require_terms)),
  exclude_terms TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(exclude_terms)),
  accounts TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(accounts)),
  min_score INTEGER NOT NULL DEFAULT 40 CHECK (min_score BETWEEN 0 AND 100),
  delivery TEXT NOT NULL DEFAULT 'feed' CHECK (delivery IN ('feed', 'digest', 'alert')),
  sample INTEGER NOT NULL DEFAULT 0 CHECK (sample IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX watches_owner_idx ON watches(owner_id, archived);

CREATE TABLE watch_revisions (
  watch_id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  version INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (watch_id, version)
);
CREATE TRIGGER watch_revisions_no_update BEFORE UPDATE ON watch_revisions BEGIN SELECT RAISE(ABORT, 'Revisions are immutable'); END;
CREATE TRIGGER watch_revisions_no_delete BEFORE DELETE ON watch_revisions BEGIN SELECT RAISE(ABORT, 'Revisions are immutable'); END;
CREATE TRIGGER watch_insert_revision AFTER INSERT ON watches BEGIN
  INSERT INTO watch_revisions(watch_id,owner_id,version,data,created_at) VALUES(NEW.id,NEW.owner_id,NEW.version,json_object('name',NEW.name,'description',NEW.description,'sources',json(NEW.sources),'kinds',json(NEW.kinds),'includeTerms',json(NEW.include_terms),'requireTerms',json(NEW.require_terms),'excludeTerms',json(NEW.exclude_terms),'accounts',json(NEW.accounts),'minScore',NEW.min_score,'delivery',NEW.delivery,'archived',NEW.archived),NEW.updated_at);
END;
CREATE TRIGGER watch_update_revision AFTER UPDATE ON watches BEGIN
  INSERT INTO watch_revisions(watch_id,owner_id,version,data,created_at) VALUES(NEW.id,NEW.owner_id,NEW.version,json_object('name',NEW.name,'description',NEW.description,'sources',json(NEW.sources),'kinds',json(NEW.kinds),'includeTerms',json(NEW.include_terms),'requireTerms',json(NEW.require_terms),'excludeTerms',json(NEW.exclude_terms),'accounts',json(NEW.accounts),'minScore',NEW.min_score,'delivery',NEW.delivery,'archived',NEW.archived),NEW.updated_at);
END;
CREATE TRIGGER watch_version_guard BEFORE UPDATE ON watches
WHEN NEW.version != OLD.version + 1 OR NEW.owner_id != OLD.owner_id OR NEW.id != OLD.id
BEGIN SELECT RAISE(ABORT, 'Invalid record revision'); END;

-- Thumbs up / down per watch. Owner scoped; the latest vote wins.
CREATE TABLE signal_votes (
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  watch_id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, watch_id, signal_id)
);
