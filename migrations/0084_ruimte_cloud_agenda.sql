-- 0084: de HMARA en de AGENDA krijgen de dimensie «ruimte» (model: shared/ruimte-scheiding.ts, kern: migratie 0082).
--
-- WAAROM. Tot nu hingen een werkruimte, een bestand, een Google-koppeling, een ICS-abonnement, een CalDAV-account
-- en de spiegel van externe afspraken UITSLUITEND aan `user_id` / `ownerUserId`. Eén mens = één lade, voor beide
-- profielen: wie in het technische profiel de hmara opende, zag exact dezelfde bestanden. Vanaf nu is de
-- gegevenssleutel (user_id, ruimte).
--
-- DE TWEE REGELS DIE NIET ONDERHANDELBAAR ZIJN (en die deze migratie afdwingt):
--   1. de kolom heet `ruimte` en kent precies twee waarden: 'prive' en 'technisch';
--   2. ONTBREEKT de waarde (NULL, of een rij van vóór deze migratie), dan is de rij 'prive'. Daarom staat de
--      DEFAULT op 'prive' en wordt er GEEN ENKELE bestaande rij verplaatst: alles wat er nu staat blijft
--      persoonlijk en blijft precies even zichtbaar als gisteren. De technische lade begint LEEG.
--
-- De records-tabellen van de hmara (app.records → cloud_workspaces_v1, cloud_items_v1, cloud_resume_v1,
-- cloud_audit_v1, provider_principals_v1, google_oauth_grant_v1, …) zijn schemaloos; daar zet backend/
-- cloud-platform.ts en backend/google-suite-onboarding.ts het veld `ruimte` in de JSON (ladeVelden) en filtert
-- het met `data @> {...}` (ladeFilter) respectievelijk `hoortBij`. Daarvoor is hier dus niets te doen.
--
-- Wat hier WEL moet, zijn de drie echte tabellen van de agenda (migratie 0076) plus hun sleutels:
--   app.agenda_koppeling            de band lokaal ↔ Google + het idempotentiegeheugen;
--   app.agenda_abonnement           ICS-adressen en CalDAV-accounts (met het versleutelde wachtwoord);
--   app.agenda_externe_gebeurtenis  de spiegel van die externe agenda's.
--
-- EN ÉÉN SLEUTEL DIE MOET WIJKEN: `agenda_abonnement_adres_idx` was UNIQUE (user_id, bron, adres). Daarmee kon
-- de technische ruimte NOOIT hetzelfde rooster volgen als de persoonlijke — de tweede inschrijving zou de eerste
-- stil overschrijven en zo twee ruimtes tot één lade samenvoegen. Hij wordt (user_id, ruimte, bron, adres):
-- binnen één lade nog altijd één keer hetzelfde adres, maar de twee laden staan los.
--
-- Idempotent (twee keer draaien mag), en de RLS van 0076 blijft staan: `ruimte` scheidt de laden van ÉÉN mens,
-- RLS scheidt de mensen. Dat zijn twee verschillende hekken en ze vervangen elkaar niet.

-- ------------------------------------------------------------------------------------------------ de kolom
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agenda_koppeling', 'agenda_abonnement', 'agenda_externe_gebeurtenis']
  LOOP
    IF to_regclass('app.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE app.%I ADD COLUMN IF NOT EXISTS ruimte text NOT NULL DEFAULT %L', t, 'prive');
    -- De CHECK apart: ADD CONSTRAINT kent geen IF NOT EXISTS, dus eerst kijken of hij er al is.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ('app.' || t)::regclass AND conname = t || '_ruimte_check') THEN
      EXECUTE format('ALTER TABLE app.%I ADD CONSTRAINT %I CHECK (ruimte IN (%L, %L))', t, t || '_ruimte_check', 'prive', 'technisch');
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------------------------ de sleutels
-- Eén adres per LADE in plaats van per mens: anders kan de technische ruimte geen eigen abonnement hebben.
DROP INDEX IF EXISTS app.agenda_abonnement_adres_idx;
CREATE UNIQUE INDEX IF NOT EXISTS agenda_abonnement_adres_ruimte_idx
  ON app.agenda_abonnement (user_id, ruimte, bron, adres);

-- Zoeken gebeurt altijd binnen één lade; zonder deze indexen zou elke lijst de hele tabel van die mens langsgaan.
CREATE INDEX IF NOT EXISTS agenda_abonnement_lade_idx ON app.agenda_abonnement (user_id, ruimte, bron);
CREATE INDEX IF NOT EXISTS agenda_koppeling_lade_idx ON app.agenda_koppeling (user_id, ruimte, lokaal_id);
CREATE INDEX IF NOT EXISTS agenda_externe_gebeurtenis_lade_idx
  ON app.agenda_externe_gebeurtenis (user_id, ruimte, begin_waarde);

-- De planner (backend/agenda-ics.ts → icsCronRonde, backend/agenda-caldav.ts → caldavCronRonde) loopt over ALLE
-- gebruikers en moet de ruimte van de rij meenemen: een technische rij mag alleen lopen zolang die lade open is.
CREATE INDEX IF NOT EXISTS agenda_abonnement_planner_ruimte_idx
  ON app.agenda_abonnement (actief, ruimte, laatst_op) WHERE actief;
