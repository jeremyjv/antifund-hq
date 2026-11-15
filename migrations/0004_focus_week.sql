ALTER TABLE team_focuses ADD COLUMN week TEXT;
UPDATE team_focuses SET week = date(created_at, '-6 days', 'weekday 1') WHERE week IS NULL;
CREATE INDEX team_focus_week_idx ON team_focuses(owner_id, week, archived);
