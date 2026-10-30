-- 0030: technisch profiel naast het klantprofiel (architectuur 13.10.2026, «Архітектура доступу: клієнтський і технічний простір»).
--
--   app.tech_profielen   één per account dat een technisch profiel KREEG (eigenaar of gemachtigde): eigen id (tech-…), rollen uit een
--                        vaste lijst, plafond voor de duur van één activering, of een tweede goedkeuring nodig is, de kleur/het patroon
--                        van de band (keuze van de gebruiker zelf), wie het gaf en wanneer, en het intrekken. Nooit verwijderd: de geschiedenis
--                        blijft (ingetrokken_op).
--   app.tech_activaties  elke keer dat iemand zijn profiel AANZET: alleen voor één tabblad (hash van de tabcontext), met reden, begin en
--                        einde (verplicht, server-afgedwongen), en hoe het eindigde (tijd om / zelf / ingetrokken).
--
-- Schrijven alleen via de systeemrol (backend/tech-profiel.ts: elke wijziging gaat door dezelfde controles + audit); de app-rol leest onder
-- strikte RLS alleen eigen rijen. Een profiel geeft op zich NIETS: rechten bestaan alleen in een lopende activering.
CREATE TABLE IF NOT EXISTS app.tech_profielen (
  user_id            text PRIMARY KEY,
  profiel_id         text        NOT NULL UNIQUE CHECK (profiel_id ~ '^tech-[0-9a-f]{12}$'),
  rollen             text[]      NOT NULL CHECK (cardinality(rollen) BETWEEN 1 AND 6
                                   AND rollen <@ ARRAY['ondersteuning', 'tester', 'ontwikkelaar', 'beheerder', 'auditor', 'eigenaar']::text[]),
  max_minuten        integer     NOT NULL DEFAULT 60 CHECK (max_minuten BETWEEN 15 AND 480),
  tweede_goedkeuring boolean     NOT NULL DEFAULT false,
  band               jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(band) = 'object'),
  toegekend_door     text        NOT NULL,
  toegekend_op       timestamptz NOT NULL DEFAULT now(),
  gewijzigd_op       timestamptz NOT NULL DEFAULT now(),
  notitie            text        NOT NULL DEFAULT '' CHECK (length(notitie) <= 300),
  laatst_actief      timestamptz,
  ingetrokken_op     timestamptz,
  ingetrokken_door   text,
  ingetrokken_reden  text        CHECK (ingetrokken_reden IS NULL OR length(ingetrokken_reden) <= 300)
);

CREATE TABLE IF NOT EXISTS app.tech_activaties (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text        NOT NULL,
  profiel_id       text        NOT NULL,
  tab_hash         text        NOT NULL CHECK (tab_hash ~ '^[0-9a-f]{64}$'),
  rollen           text[]      NOT NULL,
  reden            text        NOT NULL CHECK (length(reden) BETWEEN 3 AND 300),
  begin_op         timestamptz NOT NULL DEFAULT now(),
  eind_op          timestamptz NOT NULL,
  beeindigd_op     timestamptz,
  beeindigd_reden  text        CHECK (beeindigd_reden IS NULL OR beeindigd_reden IN ('zelf', 'verlopen', 'ingetrokken', 'vervangen', 'noodstop')),
  CONSTRAINT tech_activaties_duur CHECK (eind_op > begin_op AND eind_op <= begin_op + interval '8 hours')
);
CREATE INDEX IF NOT EXISTS tech_activaties_actief_idx ON app.tech_activaties (user_id, tab_hash) WHERE beeindigd_op IS NULL;

ALTER TABLE app.tech_profielen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tech_activaties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tech_profielen_eigen ON app.tech_profielen;
CREATE POLICY tech_profielen_eigen ON app.tech_profielen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS tech_activaties_eigen ON app.tech_activaties;
CREATE POLICY tech_activaties_eigen ON app.tech_activaties
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
