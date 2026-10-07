-- Existing duplicate watchlist records remain recoverable in the archive.
-- Updating their version causes the existing revision trigger to preserve the change.
UPDATE workspace_records SET archived=1,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE type='watchlist' AND archived=0 AND company_id IS NOT NULL
  AND id NOT IN (SELECT MIN(id) FROM workspace_records WHERE type='watchlist' AND archived=0 AND company_id IS NOT NULL GROUP BY owner_id,company_id);

CREATE UNIQUE INDEX active_watchlist_company_idx ON workspace_records(owner_id,company_id)
WHERE type='watchlist' AND archived=0 AND company_id IS NOT NULL;

CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
