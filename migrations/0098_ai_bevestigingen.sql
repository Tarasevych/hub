-- 0098 (eerst 0094; hernummerd: 0094 is de zoek-RLS van de parallelle release): «ПІДТВЕРДЖЕННЯ НА САЙТІ» — één wachtrij voor acties die een AI-agent voorstelt en die pas gebeuren nadat de mens ze op
-- de site bevestigde (shared/ai-bevestiging.ts, backend/ai-bevestiging.ts). Besluit van de eigenaar 21.10.2026: de rechten
-- «у розробці» worden gebouwd; «Надсилати листи від вашого імені» en «Ділитися файлами» bestaan ALLEEN met deze bevestiging.
--
-- WAT ER IN EEN RIJ STAAT
--   • wie (user_id) en in welke RUIMTE (prive | technisch): bevestigen kan alleen die mens, vanuit een tabblad dat NU in die
--     ruimte is (de server rekent de ruimte live uit, backend/ruimte-scheiding.ts → gegevensRuimteVeilig);
--   • welke agent (slug), welke AI-klant en welke grant het verzoek maakte, welk hulpmiddel en welke SOORT (mail.verzenden, …);
--   • `parameters`: de volledige parameters als ENVELOP — 'dek1.' (gegevenssleutel van de sleutelkluis, 0092) zodra de mens die
--     aanzette, anders 'v1.' (serversleutel; `sleutel_naam` zegt welke). Nooit in platte tekst. De AAD van de envelop bevat
--     mens, ruimte en id: een rij verplaatsen naar een ander account of de andere ruimte maakt haar onleesbaar;
--   • `hash`: SHA-256 over {soort, ruimte, mens, parameters} (canonieke JSON). Het scherm stuurt hem mee bij «Підтвердити»; de
--     server vergelijkt hem én rekent hem opnieuw uit de ontsleutelde parameters. Wijkt hij af: niets uitvoeren;
--   • `verloopt_op` = aangemaakt + 30 minuten; daarna is het verzoek 'verlopen';
--   • de uitkomst (`resultaat`, ook een envelop) en een korte foutcode (`fout`, alleen [A-Z0-9_]).
-- Statusovergangen (de server doet ze met één voorwaardelijke UPDATE, dus nooit twee keer uitvoeren):
--   wacht → bezig → uitgevoerd | mislukt;  wacht → geweigerd;  wacht → verlopen;  wacht → ingetrokken.
-- Idempotent: de testsuite draait alle migraties opnieuw.

CREATE TABLE IF NOT EXISTS app.ai_bevestiging (
  id            uuid        PRIMARY KEY,
  user_id       text        NOT NULL,
  ruimte        text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  agent         text        NOT NULL DEFAULT '' CHECK (agent ~ '^[a-z0-9-]{0,24}$'),
  klant         text        NOT NULL DEFAULT '' CHECK (length(klant) <= 80),
  grant_id      text        NOT NULL DEFAULT '' CHECK (length(grant_id) <= 120),
  soort         text        NOT NULL CHECK (soort ~ '^[a-z][a-z0-9-]{1,30}\.[a-z][a-z0-9.-]{1,40}$'),
  tool          text        NOT NULL DEFAULT '' CHECK (tool ~ '^[a-z0-9_]{0,64}$'),
  risico        text        NOT NULL CHECK (risico IN ('laag', 'midden', 'hoog', 'kritiek')),
  parameters    text        NOT NULL CHECK (parameters ~ '^(v1|dek1)\.'),
  sleutel_naam  text        NOT NULL DEFAULT '' CHECK (sleutel_naam ~ '^[A-Z0-9_]{0,64}$'),
  hash          text        NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  status        text        NOT NULL DEFAULT 'wacht' CHECK (status IN ('wacht', 'bezig', 'uitgevoerd', 'mislukt', 'geweigerd', 'verlopen', 'ingetrokken')),
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  verloopt_op   timestamptz NOT NULL,
  besloten_op   timestamptz,
  besloten_door text        NOT NULL DEFAULT '',
  stap_op       text        NOT NULL DEFAULT '' CHECK (stap_op ~ '^[a-z-]{0,20}$'),
  resultaat     text        CHECK (resultaat IS NULL OR resultaat ~ '^(v1|dek1)\.'),
  fout          text        NOT NULL DEFAULT '' CHECK (fout ~ '^[A-Z0-9_]{0,80}$'),
  opgehaald_op  timestamptz,
  CHECK (verloopt_op > aangemaakt_op AND verloopt_op <= aangemaakt_op + interval '31 minutes')
);
CREATE INDEX IF NOT EXISTS ai_bevestiging_open_idx ON app.ai_bevestiging (user_id, ruimte, status, aangemaakt_op DESC);
CREATE INDEX IF NOT EXISTS ai_bevestiging_verloop_idx ON app.ai_bevestiging (verloopt_op) WHERE status = 'wacht';
COMMENT ON TABLE app.ai_bevestiging IS
  'Verzoeken van AI-agenten die pas na bevestiging door de mens op de site worden uitgevoerd (mail verzenden, bestanden delen, …). Parameters versleuteld (dek1/v1) met een hash; 30 minuten geldig; per mens en per ruimte.';
COMMENT ON COLUMN app.ai_bevestiging.parameters IS 'Envelop (dek1 = sleutelkluis 0092, v1 = serversleutel `sleutel_naam`); AAD = ai-bevestiging|<user>|<ruimte>|<id>|parameters.';
COMMENT ON COLUMN app.ai_bevestiging.hash IS 'SHA-256 (hex) over canonieke JSON {v, soort, ruimte, userId, params}; moet bij bevestigen kloppen.';

-- Rijbeveiliging: zelfde vorm als 0092 — de app-rol ziet alleen eigen rijen; de systeemrol (BYPASSRLS) bedient de server.
ALTER TABLE app.ai_bevestiging ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_bevestiging_eigen ON app.ai_bevestiging;
CREATE POLICY ai_bevestiging_eigen ON app.ai_bevestiging
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

DO $ai_bevestiging_bewijs$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM app.ai_bevestiging;
  RAISE NOTICE '0094: wachtrij «підтвердження на сайті» klaar; verzoeken: % (bij een eerste migratie 0)', n;
END
$ai_bevestiging_bewijs$;
