-- Auditlog (taak #133, laatste stap van "app-shell koppelen aan live
-- sessiedata"). Vereist in het EU-compliance-masterdossier (TOM's:
-- "acties worden gelogd zonder de volledige klinische inhoud in de auditlog
-- te dupliceren") — vandaar bewust GEEN kolom voor de patiëntdata/resultaten
-- zelf, enkel WIE WAT deed en WANNEER, plus een niet-vertrouwelijke
-- vrije-tekst "detail" (bv. de naam van een uitgenodigd teamlid — nooit
-- klinische inhoud).
--
-- ON DELETE SET NULL (niet CASCADE) op actor_user_id: een gedeactiveerd of
-- ooit verwijderd account mag de logregel van diens actie niet laten
-- verdwijnen — het auditspoor moet net bij een incident blijven bestaan.
-- organization_id blijft wél CASCADE: verdwijnt een praktijk volledig (bv.
-- een AVG-verwijderverzoek van de praktijk zelf), dan hoort ook haar
-- auditlog niet achter te blijven.
CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,              -- uuid
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_label     TEXT NOT NULL,                  -- naam/e-mail op het moment zelf (blijft leesbaar na SET NULL hierboven)
  action          TEXT NOT NULL,                  -- machine-leesbare actiecode, bv. 'session_bekeken', 'gebruiker_uitgenodigd'
  target_type     TEXT,                           -- bv. 'patient_session', 'user' — optioneel
  target_id       TEXT,                           -- id van het object waarop de actie gebeurde — optioneel
  detail          TEXT,                           -- korte, niet-klinische toelichting (bv. uitgenodigde naam)
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created ON audit_log(organization_id, created_at);
