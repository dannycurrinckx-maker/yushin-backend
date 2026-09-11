-- Postgres-versie van migrations/0004_access_codes.sql — enkel
-- datetime('now') -> NOW(), verder identiek (zie dat bestand voor de
-- volledige toelichting).

CREATE TABLE IF NOT EXISTS access_codes (
  id                TEXT PRIMARY KEY,          -- uuid
  code              TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('free','discount')),
  discount_percent  INTEGER,                    -- verplicht (1-99) wanneer kind = 'discount', anders NULL
  max_uses          INTEGER,                    -- NULL = onbeperkt aantal keer bruikbaar
  use_count         INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1,  -- Danny kan een code intrekken zonder de rij te verwijderen (audit trail blijft)
  note              TEXT,                        -- vrij invulbare herinnering, bv. "Lancering augustus 2026"
  created_at        TEXT NOT NULL DEFAULT (NOW())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS discount_percent INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS redeemed_code TEXT;
