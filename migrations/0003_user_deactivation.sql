-- Yushin SaaS — account-deactivatie (taak #73, beheerpaneel).
-- Aparte migratie i.p.v. 0001 aanpassen: zodra een schema ooit live staat,
-- pas je bestaande migraties nooit meer aan, je voegt enkel nieuwe toe.
--
-- Bewust GEEN hard DELETE van gebruikers vanuit het beheerpaneel: users.id
-- wordt door patient_sessions.therapist_id gerefereerd met ON DELETE CASCADE
-- (zie 0001_init.sql) — een therapeut-account hard verwijderen zou dus alle
-- patiëntsessies van die therapeut stilzwijgend meeslepen. Een account
-- "verwijderen" in het beheerpaneel betekent daarom: deactiveren (inloggen
-- niet langer mogelijk, niet meer zichtbaar als actief lid), met behoud van
-- de historische patiëntsessies.

ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
