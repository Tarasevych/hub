-- 0253 · SEC-002 (geheimen-07, toets-g10b #1): enveloppen met de serversleutel dragen sinds de rotatie een versie
-- ('v1.' … 'v9.', server/platform/beveiliging.ts). De CHECK-regels van 0092 en 0098 lieten alleen 'v1.' en 'dek1.' toe:
-- na het toevoegen van <NAAM>_V2 (procedure in deploy/GEHEIMEN-REGISTER.nl.md) faalden het koppelen van IMAP, het opslaan van een
-- CalDAV-abonnement en elke AI-bevestiging. Nu: v1 … v9 of dek1. Idempotent (DROP … IF EXISTS, daarna opnieuw).

ALTER TABLE app.mail_imap_koppeling DROP CONSTRAINT IF EXISTS mail_imap_koppeling_geheim_check;
ALTER TABLE app.mail_imap_koppeling ADD CONSTRAINT mail_imap_koppeling_geheim_check CHECK (geheim ~ '^(v[1-9]|dek1)\.');

DO $$ BEGIN
  IF to_regclass('app.agenda_abonnement') IS NOT NULL THEN
    ALTER TABLE app.agenda_abonnement DROP CONSTRAINT IF EXISTS agenda_abonnement_geheim_check;
    ALTER TABLE app.agenda_abonnement ADD CONSTRAINT agenda_abonnement_geheim_check CHECK (geheim IS NULL OR geheim = '' OR geheim ~ '^(v[1-9]|dek1)\.');
  END IF;
END $$;

ALTER TABLE app.ai_bevestiging DROP CONSTRAINT IF EXISTS ai_bevestiging_parameters_check;
ALTER TABLE app.ai_bevestiging ADD CONSTRAINT ai_bevestiging_parameters_check CHECK (parameters ~ '^(v[1-9]|dek1)\.');
ALTER TABLE app.ai_bevestiging DROP CONSTRAINT IF EXISTS ai_bevestiging_resultaat_check;
ALTER TABLE app.ai_bevestiging ADD CONSTRAINT ai_bevestiging_resultaat_check CHECK (resultaat IS NULL OR resultaat ~ '^(v[1-9]|dek1)\.');
