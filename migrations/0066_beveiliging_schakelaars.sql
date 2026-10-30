-- 0066: drie beschermingen aan/uit met één beslissing van de eigenaar (18.10.2026, «Захист» in /diagnostiek).
--
--   auth-poort     vangnet van de toegangspoort: anoniem 2xx buiten PUBLIEKE_ROUTES → 401 (was alleen env AUTH_POORT_AFDWINGEN=1)
--   opa-afdwingen  beheerrechten alleen in een actief technisch profiel, OPA fail-closed (was alleen root: mcp-rechten.json)
--   rls            RLS afdwingen voor mijnruimte_app (was alleen root: db-rollen-instellen.sh rls-aan)
--
-- Wie schakelt: alleen de eigenaar, in een actief technisch profiel, met passkey (backend/beveiliging-schakelaars.ts). Uitzetten
-- mag altijd en meteen (zonder passkey); de zekering zet automatisch uit bij een piek in fouten in de eerste 10 minuten.
-- Omgevingsvariabelen en het root-bestand blijven voorrang houden (geforceerd aan/uit); deze tabel is alleen de stand van de site.
--
-- RLS: de eigenlijke stand blijft app.rls_instellingen (de policy's lezen die). De systeemrol mag die tabel nog steeds NIET
-- schrijven; alleen via app.rls_afdwingen_zetten() (SECURITY DEFINER, EXECUTE alleen voor mijnruimte_system). Waarom dat veilig is:
-- de systeemrol heeft BYPASSRLS, dus de stand beperkt haar zelf niet; aanzetten maakt alleen mijnruimte_app strenger.
--
-- app.rls_proef: een sessie-GUC die app.rls_vrij() alleen STRENGER kan maken (nooit ruimer). De gereedheidscontrole zet hem in
-- een transactie met ROLLBACK om met synthetische rijen te bewijzen dat de app-rol andermans rijen niet ziet — vóór het aanzetten.
-- Idempotent.

CREATE TABLE IF NOT EXISTS app.beveiliging_schakelaars (
  sleutel               text PRIMARY KEY CHECK (sleutel IN ('auth-poort', 'opa-afdwingen', 'rls')),
  stand                 text NOT NULL DEFAULT 'uit' CHECK (stand IN ('uit', 'aan')),
  gewijzigd_op          timestamptz NOT NULL DEFAULT now(),
  door_id               text,
  door_email            text,
  reden                 text NOT NULL DEFAULT '',
  bewaking_tot          timestamptz,
  basis                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  automatisch_uit_op    timestamptz,
  automatisch_uit_reden text NOT NULL DEFAULT ''
);
INSERT INTO app.beveiliging_schakelaars (sleutel) VALUES ('auth-poort'), ('opa-afdwingen'), ('rls') ON CONFLICT (sleutel) DO NOTHING;

-- Strenger-alleen proefmodus (zie kop). Zelfde definitie als 0004 plus: app.rls_proef = 'aan' telt als afgedwongen.
CREATE OR REPLACE FUNCTION app.rls_vrij() RETURNS boolean
  LANGUAGE sql STABLE
  AS $$ SELECT current_user::text <> 'mijnruimte_app'
            OR (COALESCE((SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'), 'uit') <> 'aan'
                AND COALESCE(current_setting('app.rls_proef', true), '') <> 'aan') $$;

CREATE OR REPLACE FUNCTION app.rls_afdwingen_zetten(p_stand text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app
  AS $$
BEGIN
  IF p_stand IS NULL OR p_stand NOT IN ('uit', 'aan') THEN RAISE EXCEPTION 'RLS_STAND_ONGELDIG' USING ERRCODE = '22023'; END IF;
  INSERT INTO app.rls_instellingen (sleutel, waarde, bijgewerkt) VALUES ('afdwingen', p_stand, now())
    ON CONFLICT (sleutel) DO UPDATE SET waarde = EXCLUDED.waarde, bijgewerkt = now();
  RETURN p_stand;
END $$;
REVOKE ALL ON FUNCTION app.rls_afdwingen_zetten(text) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN GRANT EXECUTE ON FUNCTION app.rls_afdwingen_zetten(text) TO mijnruimte_system; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN REVOKE ALL ON app.beveiliging_schakelaars FROM mijnruimte_app; END IF;
END $$;
