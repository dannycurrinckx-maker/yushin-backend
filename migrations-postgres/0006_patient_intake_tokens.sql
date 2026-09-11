-- Postgres-versie van migrations/0006_patient_intake_tokens.sql — identiek.
-- Let op (zie origineel voor de volledige toelichting): NULL-waarden tellen
-- ook in Postgres niet mee als botsing binnen een UNIQUE-index, dus gedrag
-- blijft exact hetzelfde als onder SQLite.

ALTER TABLE users ADD COLUMN IF NOT EXISTS patient_intake_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_patient_intake_token ON users(patient_intake_token);
