-- 0103: ZOEKEN — GESCHIEDENIS OP DE SERVER, per lade (user_id + ruimte). Zone Z4, 22.10.2026, specificatie §10.
--
-- WAAROM. Tot nu stond de zoekgeschiedenis in localStorage['mr.search.history.v1'] zonder gebruiker of ruimte
-- (src/search/zoek-core.ts): wie na een ander account in dezelfde browser aanmeldde, zag diens zoekopdrachten (audit
-- zoek-audit.md, conclusie 8). Nu staat ze hier, onder RLS, in de lade die de poort opent — nooit uit het verzoek.
--
-- WAT ER IN STAAT (en wat NIET). Per (lade, genormaliseerde vraag, filters) één rij: de vraag, de normalisatie, de filters,
-- het moment van de laatste uitvoering, de versie van algoritme/index, de ids van wat toen gevonden werd (ALLEEN bron + id,
-- nooit titel of tekst — de momentopname wordt bij het heropenen opnieuw tegen de poort gelegd) en de verversingsstand.
-- Geen documenttekst, geen titels, geen fragmenten: wie de tabel leest, leest geen inhoud.
--   stand: 'vers'        — de momentopname is van de laatste echte zoekopdracht;
--          'verouderd'   — de index is sindsdien bijgewerkt (index_versie wijkt af) en de rij is nog niet opnieuw gelopen;
--          'vernieuwd'   — bij het heropenen opnieuw gezocht en samengevoegd (nieuw / niet meer beschikbaar);
--          'fout'        — het opnieuw zoeken mislukte; de momentopname blijft staan.
-- Idempotent; terugdraaien = DROP TABLE app.zoek_geschiedenis (geen andere tabel verwijst ernaar).

CREATE TABLE IF NOT EXISTS app.zoek_geschiedenis (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text        NOT NULL CHECK (user_id <> ''),
  ruimte           text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  vraag            text        NOT NULL CHECK (length(vraag) BETWEEN 1 AND 300),
  vraag_norm       text        NOT NULL CHECK (length(vraag_norm) BETWEEN 1 AND 300),
  filters          jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object' AND pg_column_size(filters) <= 4096),
  filters_sleutel  text        GENERATED ALWAYS AS (md5(filters::text)) STORED,
  laatst_op        timestamptz NOT NULL DEFAULT now(),
  aantal_keer      integer     NOT NULL DEFAULT 1 CHECK (aantal_keer >= 1),
  algoritme_versie text        NOT NULL DEFAULT '' CHECK (length(algoritme_versie) <= 80),
  index_versie     text        NOT NULL DEFAULT '' CHECK (length(index_versie) <= 80),
  -- [{"bron":"mail","id":"…"}, …] — ten hoogste 200 verwijzingen, geen tekst (controle op vorm én grootte).
  treffers         jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(treffers) = 'array' AND jsonb_array_length(treffers) <= 200 AND pg_column_size(treffers) <= 32768),
  totaal           integer     NOT NULL DEFAULT 0 CHECK (totaal >= 0),
  stand            text        NOT NULL DEFAULT 'vers' CHECK (stand IN ('vers', 'verouderd', 'vernieuwd', 'fout')),
  aangemaakt_op    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, vraag_norm, filters_sleutel)
);

CREATE INDEX IF NOT EXISTS zoek_geschiedenis_lade_idx ON app.zoek_geschiedenis (user_id, ruimte, laatst_op DESC);
-- Prefix-suggesties uit de eigen geschiedenis («завершення»): text_pattern_ops voor LIKE 'abc%' binnen de lade.
CREATE INDEX IF NOT EXISTS zoek_geschiedenis_norm_idx ON app.zoek_geschiedenis (user_id, ruimte, vraag_norm text_pattern_ops);

-- Rij-beveiliging: zelfde vorm als 0094 (zoek_objecten). De app-rol ziet en schrijft uitsluitend rijen van
-- app.huidige_gebruiker(); de ruimte dwingt backend/zoek-geschiedenis.ts af met `ruimte = $2` in ELKE query.
ALTER TABLE app.zoek_geschiedenis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zoek_geschiedenis_eigen ON app.zoek_geschiedenis;
CREATE POLICY zoek_geschiedenis_eigen ON app.zoek_geschiedenis
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

-- Rechten van de app-rol (zoals rechten.sql voor de overige tabellen; hier zodat één migratie volstaat en rechten.sql
-- — een gedeeld bestand — ongewijzigd blijft). Doet niets zolang de rol niet bestaat (lokale ontwikkeling).
DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.zoek_geschiedenis TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.zoek_geschiedenis TO mijnruimte_system;
  END IF;
END
$r$;
