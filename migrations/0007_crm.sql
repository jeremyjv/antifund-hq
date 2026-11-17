-- In-house CRM: organizations, people, and an append-only interaction log.
-- Same owner scoping, versioning, revisions, and archive-not-delete rules as workspace records.

CREATE TABLE crm_orgs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('company', 'fund', 'lp', 'lab')),
  sector TEXT,
  domain TEXT,
  catalog_id TEXT,
  stage TEXT CHECK (stage IS NULL OR stage IN ('sourced', 'first_call', 'diligence', 'partner_review', 'invested', 'passed')),
  deal_owner TEXT,
  next_step TEXT,
  next_step_due TEXT,
  pass_reason TEXT,
  notes TEXT NOT NULL DEFAULT '',
  sample INTEGER NOT NULL DEFAULT 0 CHECK (sample IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX crm_orgs_owner_idx ON crm_orgs(owner_id, archived, name);

CREATE TABLE crm_people (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('founder', 'investor', 'lp', 'expert', 'operator')),
  title TEXT,
  org_id TEXT REFERENCES crm_orgs(id),
  email TEXT,
  location TEXT,
  rel_owner TEXT,
  strength TEXT NOT NULL DEFAULT 'cold' CHECK (strength IN ('cold', 'warm', 'strong')),
  notes TEXT NOT NULL DEFAULT '',
  sample INTEGER NOT NULL DEFAULT 0 CHECK (sample IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX crm_people_owner_idx ON crm_people(owner_id, archived, name);
CREATE INDEX crm_people_org_idx ON crm_people(owner_id, org_id);

CREATE TABLE crm_interactions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  person_id TEXT REFERENCES crm_people(id),
  org_id TEXT REFERENCES crm_orgs(id),
  kind TEXT NOT NULL CHECK (kind IN ('meeting', 'call', 'email', 'intro', 'note', 'stage')),
  summary TEXT NOT NULL,
  actor TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('web', 'agent')),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (person_id IS NOT NULL OR org_id IS NOT NULL)
);
CREATE INDEX crm_interactions_owner_idx ON crm_interactions(owner_id, occurred_at);
CREATE TRIGGER crm_interactions_no_update BEFORE UPDATE ON crm_interactions BEGIN
  SELECT RAISE(ABORT, 'Interactions are append-only');
END;
CREATE TRIGGER crm_interactions_no_delete BEFORE DELETE ON crm_interactions BEGIN
  SELECT RAISE(ABORT, 'Interactions are append-only');
END;

CREATE TABLE crm_revisions (
  entity TEXT NOT NULL CHECK (entity IN ('org', 'person')),
  record_id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES sessions(id),
  version INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (entity, record_id, version)
);
CREATE TRIGGER crm_revisions_no_update BEFORE UPDATE ON crm_revisions BEGIN
  SELECT RAISE(ABORT, 'Revisions are immutable');
END;
CREATE TRIGGER crm_revisions_no_delete BEFORE DELETE ON crm_revisions BEGIN
  SELECT RAISE(ABORT, 'Revisions are immutable');
END;

CREATE TRIGGER crm_org_insert_revision AFTER INSERT ON crm_orgs BEGIN
  INSERT INTO crm_revisions(entity,record_id,owner_id,version,data,created_at) VALUES('org',NEW.id,NEW.owner_id,NEW.version,json_object('name',NEW.name,'kind',NEW.kind,'sector',NEW.sector,'domain',NEW.domain,'stage',NEW.stage,'dealOwner',NEW.deal_owner,'nextStep',NEW.next_step,'nextStepDue',NEW.next_step_due,'passReason',NEW.pass_reason,'notes',NEW.notes,'archived',NEW.archived),NEW.updated_at);
END;
CREATE TRIGGER crm_org_update_revision AFTER UPDATE ON crm_orgs BEGIN
  INSERT INTO crm_revisions(entity,record_id,owner_id,version,data,created_at) VALUES('org',NEW.id,NEW.owner_id,NEW.version,json_object('name',NEW.name,'kind',NEW.kind,'sector',NEW.sector,'domain',NEW.domain,'stage',NEW.stage,'dealOwner',NEW.deal_owner,'nextStep',NEW.next_step,'nextStepDue',NEW.next_step_due,'passReason',NEW.pass_reason,'notes',NEW.notes,'archived',NEW.archived),NEW.updated_at);
END;
CREATE TRIGGER crm_org_version_guard BEFORE UPDATE ON crm_orgs
WHEN NEW.version != OLD.version + 1 OR NEW.owner_id != OLD.owner_id OR NEW.id != OLD.id
BEGIN SELECT RAISE(ABORT, 'Invalid record revision'); END;

CREATE TRIGGER crm_person_insert_revision AFTER INSERT ON crm_people BEGIN
  INSERT INTO crm_revisions(entity,record_id,owner_id,version,data,created_at) VALUES('person',NEW.id,NEW.owner_id,NEW.version,json_object('name',NEW.name,'kind',NEW.kind,'title',NEW.title,'orgId',NEW.org_id,'email',NEW.email,'location',NEW.location,'relOwner',NEW.rel_owner,'strength',NEW.strength,'notes',NEW.notes,'archived',NEW.archived),NEW.updated_at);
END;
CREATE TRIGGER crm_person_update_revision AFTER UPDATE ON crm_people BEGIN
  INSERT INTO crm_revisions(entity,record_id,owner_id,version,data,created_at) VALUES('person',NEW.id,NEW.owner_id,NEW.version,json_object('name',NEW.name,'kind',NEW.kind,'title',NEW.title,'orgId',NEW.org_id,'email',NEW.email,'location',NEW.location,'relOwner',NEW.rel_owner,'strength',NEW.strength,'notes',NEW.notes,'archived',NEW.archived),NEW.updated_at);
END;
CREATE TRIGGER crm_person_version_guard BEFORE UPDATE ON crm_people
WHEN NEW.version != OLD.version + 1 OR NEW.owner_id != OLD.owner_id OR NEW.id != OLD.id
BEGIN SELECT RAISE(ABORT, 'Invalid record revision'); END;
