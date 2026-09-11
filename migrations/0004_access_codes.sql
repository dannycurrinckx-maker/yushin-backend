-- Toegangscode-systeem (taak #118).
--
-- Vervangt de eerdere automatische 14-dagen/5-analyses-proefperiode (taak
-- #114, src/lib/trial.js): een organisatie in status 'trialing' heeft nu
-- GEEN gratis toegang meer, punt. Ontgrendelen (-> 'active') kan enkel via
-- een geslaagde Mollie-betaling (billing.js) of een geldige toegangscode
-- van het type 'free' hieronder. Een 'discount'-code ontgrendelt NIET op
-- zichzelf — die onthoudt enkel een kortingspercentage dat automatisch
-- toegepast wordt zodra de organisatie effectief afrekent via Mollie.
--
-- `code` wordt bewust NIET met een UNIQUE-index gedwongen tot lowercase
-- opslag: de vergelijking bij het inwisselen gebeurt case-insensitive in de
-- query zelf (zie getAccessCodeByCode in src/lib/db.js: "LOWER(code) =
-- LOWER(?)"), zodat het niet uitmaakt hoe Danny de code intikt bij het
-- aanmaken.
CREATE TABLE IF NOT EXISTS access_codes (
  id                TEXT PRIMARY KEY,          -- uuid
  code              TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('free','discount')),
  discount_percent  INTEGER,                    -- verplicht (1-99) wanneer kind = 'discount', anders NULL
  max_uses          INTEGER,                    -- NULL = onbeperkt aantal keer bruikbaar
  use_count         INTEGER NOT NULL DEFAULT 0,
  active            INTEGER NOT NULL DEFAULT 1,  -- Danny kan een code intrekken zonder de rij te verwijderen (audit trail blijft)
  note              TEXT,                        -- vrij invulbare herinnering, bv. "Lancering augustus 2026"
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);

-- Op de organisatie zelf: welke korting (indien van toepassing) geldt bij de
-- eerstvolgende checkout, en welke code laatst succesvol werd ingewisseld
-- (lichte audit trail — niet gekoppeld met een FK, enkel ter referentie).
ALTER TABLE organizations ADD COLUMN discount_percent INTEGER;
ALTER TABLE organizations ADD COLUMN redeemed_code TEXT;
