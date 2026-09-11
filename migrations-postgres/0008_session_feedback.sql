-- Postgres-versie van migrations/0008_session_feedback.sql — enkel
-- datetime('now') -> NOW(), verder identiek (zie dat bestand voor de
-- volledige toelichting).

CREATE TABLE IF NOT EXISTS session_feedback (
  id                  TEXT PRIMARY KEY,          -- uuid
  patient_session_id  TEXT NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
  organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rating              INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  would_recommend     INTEGER,                    -- 0/1/NULL ("weet niet"/niet ingevuld)
  comment             TEXT,
  created_at          TEXT NOT NULL DEFAULT (NOW())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_feedback_session ON session_feedback(patient_session_id);
CREATE INDEX IF NOT EXISTS idx_session_feedback_org ON session_feedback(organization_id);
