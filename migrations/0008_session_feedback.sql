-- Ingebouwde feedbackstap (taak #141b) — korte, overslaanbare beoordeling die
-- een therapeut na een afgeronde sessie kan achterlaten (bv. testpanel-
-- gebruikers die Danny een reactie geven). Eén rij per patient_sessions-rij
-- (UNIQUE-index hieronder): opnieuw indienen overschrijft de vorige (zie
-- saveSessionFeedback in src/lib/db.js, ON CONFLICT DO UPDATE), geen losse
-- geschiedenis van meerdere pogingen nodig voor dit doel.
--
-- would_recommend volgt dezelfde 0/1/NULL-conventie als access_codes.active
-- hierboven i.p.v. een apart BOOLEAN-type (SQLite/D1 kent dat niet nativer).
CREATE TABLE IF NOT EXISTS session_feedback (
  id                  TEXT PRIMARY KEY,          -- uuid
  patient_session_id  TEXT NOT NULL REFERENCES patient_sessions(id) ON DELETE CASCADE,
  organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rating              INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  would_recommend     INTEGER,                    -- 0/1/NULL ("weet niet"/niet ingevuld)
  comment             TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_feedback_session ON session_feedback(patient_session_id);
CREATE INDEX IF NOT EXISTS idx_session_feedback_org ON session_feedback(organization_id);
