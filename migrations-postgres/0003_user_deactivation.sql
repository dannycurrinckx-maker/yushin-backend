-- Postgres-versie van migrations/0003_user_deactivation.sql — identiek,
-- ALTER TABLE ... ADD COLUMN werkt hetzelfde in Postgres.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1;
