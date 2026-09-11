-- Postgres-versie van migrations/0005_audit_log.sql — enkel
-- datetime('now') -> NOW(), verder identiek (zie dat bestand voor de
-- volledige toelichting, incl. de ON DELETE SET NULL vs CASCADE-afweging).

CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,              -- uuid
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_label     TEXT NOT NULL,                  -- naam/e-mail op het moment zelf (blijft leesbaar na SET NULL hierboven)
  action          TEXT NOT NULL,                  -- machine-leesbare actiecode, bv. 'session_bekeken', 'gebruiker_uitgenodigd'
  target_type     TEXT,                           -- bv. 'patient_session', 'user' — optioneel
  target_id       TEXT,                           -- id van het object waarop de actie gebeurde — optioneel
  detail          TEXT,                           -- korte, niet-klinische toelichting (bv. uitgenodigde naam)
  created_at      TEXT NOT NULL DEFAULT (NOW())
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created ON audit_log(organization_id, created_at);
