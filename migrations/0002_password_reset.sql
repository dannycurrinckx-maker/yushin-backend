-- Yushin SaaS — wachtwoord-reset-tokens (taak #68).
-- Aparte migratie i.p.v. 0001 aanpassen: zodra een schema ooit live staat,
-- pas je bestaande migraties nooit meer aan, je voegt enkel nieuwe toe.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
