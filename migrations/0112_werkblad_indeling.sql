-- 0112 (22.10.2026, zone F): WERKBLAD («Робочий стіл») — de indeling van de widgets op hub.*/overzicht, per LADE (user_id + ruimte).
--
-- WAAROM. Het oude bureaublad (0067, hub_bureau_v1 in app.records) kende alleen tegels zonder plaatsing, zonder achtergrond en zonder
-- instellingen per tegel, en het overzicht toonde daarnaast nog de oude hub-blokken van App.tsx. Het nieuwe werkblad (src/werkblad/*)
-- heeft één indeling per lade: volgorde + formaat per widget, instellingen per widget (bv. welk oud blok erin zit), de achtergrond
-- en — als de mens die kiest — een eigen achtergrondafbeelding. Dat hoort in een eigen tabel onder RLS, niet in de generieke
-- records-bak, en NOOIT in localStorage alleen (de lokale cache is alleen voor de eerste weergave zonder te wachten).
--
-- WAT ER IN STAAT. Per (user_id, ruimte) hoogstens één rij:
--   indeling          jsonb  {v:2, items:[{tid,id,k,r,inst?}], achtergrond} — genormaliseerd door shared/werkblad-indeling.ts (browser én server);
--   achtergrond_eigen text   data-URL (image/jpeg|webp) ≤ 400 000 tekens, alleen als achtergrond = 'eigen';
--   herkomst          text   waar de eerste indeling vandaan kwam: 'bureau' (oud bureaublad), 'blokken' (oude hub-blokken), 'standaard', 'eigen' (zelf bewaard);
--   versie            int    telt per bewaring op (de client stuurt zijn versie mee: een oudere browser overschrijft geen nieuwere indeling).
-- Bestaande rijen van het oude bureaublad en de oude blokken worden NIET verplaatst of verwijderd: de client zet ze bij het eerste openen
-- over (shared/werkblad-indeling.ts eersteWerkblad) en bewaart het resultaat hier; de oude gegevens blijven waar ze staan.
-- Idempotent; terugdraaien = DROP TABLE app.werkblad_indeling (geen andere tabel verwijst ernaar).

CREATE TABLE IF NOT EXISTS app.werkblad_indeling (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text        NOT NULL CHECK (user_id <> ''),
  ruimte            text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  indeling          jsonb       NOT NULL DEFAULT '{"v":2,"items":[],"achtergrond":"nacht"}'::jsonb
                                CHECK (jsonb_typeof(indeling) = 'object' AND jsonb_typeof(indeling->'items') = 'array' AND jsonb_array_length(indeling->'items') <= 24 AND pg_column_size(indeling) <= 32768),
  achtergrond_eigen text        NOT NULL DEFAULT '' CHECK (length(achtergrond_eigen) <= 400000 AND (achtergrond_eigen = '' OR achtergrond_eigen LIKE 'data:image/%')),
  herkomst          text        NOT NULL DEFAULT 'standaard' CHECK (herkomst IN ('bureau', 'blokken', 'standaard', 'eigen')),
  versie            integer     NOT NULL DEFAULT 1 CHECK (versie >= 1),
  aangemaakt_op     timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte)
);

COMMENT ON TABLE app.werkblad_indeling IS 'Werkblad (hub/overzicht): indeling van de widgets per lade (user_id + ruimte). Eén rij per lade; RLS op user_id; ruimte dwingt backend/werkblad.ts af met WHERE ruimte = $2.';

-- Rij-beveiliging: zelfde vorm als 0103 (zoek_geschiedenis). De app-rol ziet en schrijft uitsluitend rijen van
-- app.huidige_gebruiker(); de ruimte dwingt backend/werkblad.ts af met `ruimte = $2` in ELKE query.
ALTER TABLE app.werkblad_indeling ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS werkblad_indeling_eigen ON app.werkblad_indeling;
CREATE POLICY werkblad_indeling_eigen ON app.werkblad_indeling
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

-- Rechten van de rollen (zoals 0103: hier, zodat één migratie volstaat; migrations/rechten.sql herhaalt ze). Doet niets zolang
-- de rol niet bestaat (lokale ontwikkeling).
DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.werkblad_indeling TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.werkblad_indeling TO mijnruimte_system;
  END IF;
END
$r$;

DO $werkblad_bewijs$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM app.werkblad_indeling;
  RAISE NOTICE '0112: app.werkblad_indeling klaar (werkblad per lade, RLS); rijen: % (bij een eerste migratie 0)', n;
END
$werkblad_bewijs$;
