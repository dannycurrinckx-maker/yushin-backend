-- Gelimiteerde testtoegang (taak #141b) — aanvulling op het bestaande
-- toegangscode-systeem (migratie 0004). Een gewone 'free'-toegangscode blijft
-- exact zoals die was: permanente, onbeperkte toegang (session_limit NULL).
-- Deze migratie voegt een OPTIONELE variant toe waarbij een 'free'-code ook
-- een maximumaantal gratis analyses kan meegeven ("een paar gratis
-- consults"), zodat een testaccount na dat aantal automatisch weer op het
-- normale betaalscherm terechtkomt — zonder dat daarvoor een nieuwe
-- subscription_status-waarde nodig is (zie isTrialLimitReached in
-- src/lib/trial.js: die combineert deze kolom met het bestaande
-- countPatientSessionsForOrganization()-teller, telt dus GEEN aparte
-- verbruiksteller apart bij).
--
-- Beide kolommen NULL = huidig gedrag, volledig ongewijzigd voor alle
-- bestaande organisaties/codes.
ALTER TABLE organizations ADD COLUMN trial_session_limit INTEGER;
ALTER TABLE access_codes ADD COLUMN session_limit INTEGER;
