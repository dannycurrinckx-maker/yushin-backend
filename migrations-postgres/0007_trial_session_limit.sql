-- Postgres-versie van migrations/0007_trial_session_limit.sql — identiek.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_session_limit INTEGER;
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS session_limit INTEGER;
