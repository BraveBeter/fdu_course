ALTER TABLE imports ADD COLUMN reconciled boolean NOT NULL DEFAULT false;
CREATE INDEX imports_user_term_created ON imports(user_id,term,created_at DESC);
