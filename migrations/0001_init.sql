-- Yushin SaaS — initiële databaseschema (D1 / SQLite)
-- Zie Yushin_SaaS_Architectuur.md voor de volledige toelichting per tabel.

PRAGMA foreign_keys = ON;

-- Praktijken (tenants)
CREATE TABLE IF NOT EXISTS organizations (
  id                  TEXT PRIMARY KEY,          -- uuid
  name                TEXT NOT NULL,
  contact_email       TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  mollie_customer_id  TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'trialing'
                        CHECK (subscription_status IN ('trialing','active','past_due','canceled')),
  plan                TEXT NOT NULL DEFAULT 'solo'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_contact_email ON organizations(contact_email);

-- Therapeut-accounts
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,              -- uuid
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'therapist'
                    CHECK (role IN ('owner','therapist')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

-- Login-sessies (te onderscheiden van patient_sessions hieronder)
CREATE TABLE IF NOT EXISTS auth_sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);

-- Ingevulde intake-sessies (patiëntresultaten)
-- Bewust geen verplicht patiëntnaam/-ID-veld: dataminimalisatie (AVG).
-- "patient_label" is een vrij invulbaar veld dat de praktijk zelf beheert
-- (bv. een dossiernummer dat enkel voor hen betekenis heeft).
CREATE TABLE IF NOT EXISTS patient_sessions (
  id                    TEXT PRIMARY KEY,        -- uuid
  organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  therapist_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_label         TEXT,
  role                  TEXT NOT NULL DEFAULT 'therapist'
                          CHECK (role IN ('therapist','patient')),
  lang                  TEXT NOT NULL DEFAULT 'nl',
  answers_json          TEXT NOT NULL,            -- ruwe antwoorden per vraag-id
  clock_highlights_json TEXT,                      -- orgaanklok-segmenten
  result_json           TEXT,                      -- berekend eindresultaat (patronen + scores)
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patient_sessions_org ON patient_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_patient_sessions_therapist ON patient_sessions(therapist_id);

-- Abonnementen (Mollie-koppeling)
CREATE TABLE IF NOT EXISTS subscriptions (
  id                    TEXT PRIMARY KEY,        -- uuid
  organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mollie_subscription_id TEXT,
  status                TEXT NOT NULL DEFAULT 'trialing'
                          CHECK (status IN ('trialing','active','past_due','canceled')),
  plan                  TEXT NOT NULL,
  current_period_end    TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
