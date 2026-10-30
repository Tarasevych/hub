-- 0127 — Notities vNext (28.10.2026): een EIGEN domeinmodel voor de notities van de hub (hub.tarasevych.com/notities),
-- in plaats van «alles in de etiketten van een bord-item» (titel ≤ 160, tekst ≤ 4000, 8 etiketten).
--
-- WAT ER GEBEURT — en wat er uitdrukkelijk NIET gebeurt:
--   • drie nieuwe tabellen: app.notities (de notitie zelf), app.notities_mappen (blocnotes/mappen), app.notities_revisies
--     (een momentopname vóór elke wijziging, zodat terugdraaien per notitie mogelijk is);
--   • RLS precies zoals 0019: voor mijnruimte_app altijd alleen eigen rijen (app.huidige_gebruiker());
--   • een kopie van elke bestaande hub-notitie (app.mcp_console_items, kind 'note', etiket 'hub') MET DEZELFDE id, inclusief de
--     ruimte (0086), de datums en een sha256 van titel+tekst in `herkomst`, zodat de test op «0 verlies» getalsmatig kan bewijzen
--     dat niets verdween of veranderde;
--   • de oude rij in app.mcp_console_items wordt NIET verwijderd en NIET herschreven. Zij blijft de spiegel voor de oude weg
--     (manage_hub_notes, /api/mcp/board, de oude pagina zonder vlag) — backend/notities-vnext.ts houdt beide gelijk;
--   • de vlag `notities-vnext` komt erbij, standaard UIT: zonder vlag precies de oude pagina. De opslag is NIET aan de vlag
--     gebonden (anders zouden twee bronnen uit elkaar lopen): na deze migratie schrijft elke weg naar app.notities en spiegelt.
--
-- Terugdraaien: deploy/notities-vnext-terugdraaien.sql (laat de spiegel in app.mcp_console_items staan; de oude code leest die).
-- Idempotent: de testsuite draait alle migraties opnieuw.

CREATE TABLE IF NOT EXISTS app.notities_mappen (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  ruimte      text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  naam        text        NOT NULL CHECK (length(naam) BETWEEN 1 AND 80),
  kleur       text        NOT NULL DEFAULT 'geen' CHECK (kleur IN ('geen', 'geel', 'groen', 'blauw', 'roze', 'grijs')),
  volgorde    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, naam)
);

CREATE TABLE IF NOT EXISTS app.notities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text        NOT NULL,
  ruimte           text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  titel            text        NOT NULL DEFAULT '' CHECK (length(titel) <= 300),
  inhoud_md        text        NOT NULL DEFAULT '' CHECK (length(inhoud_md) <= 200000),
  inhoud_plat      text        NOT NULL DEFAULT '',
  soort            text        NOT NULL DEFAULT 'tekst' CHECK (soort IN ('tekst', 'lijst', 'code', 'koppeling')),
  kleur            text        NOT NULL DEFAULT 'geen' CHECK (kleur IN ('geen', 'geel', 'groen', 'blauw', 'roze', 'grijs')),
  etiketten        text[]      NOT NULL DEFAULT '{}' CHECK (cardinality(etiketten) <= 24),
  map_id           uuid        REFERENCES app.notities_mappen (id) ON DELETE SET NULL,
  vast_sinds       timestamptz,
  gearchiveerd_op  timestamptz,
  verwijderd_op    timestamptz,
  auteur           text        NOT NULL DEFAULT 'operator' CHECK (length(auteur) <= 80),
  herkomst         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  versie           integer     NOT NULL DEFAULT 1 CHECK (versie >= 1),
  schema_versie    integer     NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notities_lade_idx ON app.notities (user_id, ruimte, updated_at DESC);
CREATE INDEX IF NOT EXISTS notities_lade_staat_idx ON app.notities (user_id, ruimte, (verwijderd_op IS NULL), (gearchiveerd_op IS NULL));
CREATE INDEX IF NOT EXISTS notities_etiketten_idx ON app.notities USING gin (etiketten);
CREATE INDEX IF NOT EXISTS notities_zoek_idx ON app.notities USING gin (to_tsvector('simple', coalesce(titel, '') || ' ' || coalesce(inhoud_plat, '')));

CREATE TABLE IF NOT EXISTS app.notities_revisies (
  id           bigserial   PRIMARY KEY,
  notitie_id   uuid        NOT NULL REFERENCES app.notities (id) ON DELETE CASCADE,
  user_id      text        NOT NULL,
  versie       integer     NOT NULL,
  titel        text        NOT NULL DEFAULT '',
  inhoud_md    text        NOT NULL DEFAULT '',
  soort        text        NOT NULL DEFAULT 'tekst',
  kleur        text        NOT NULL DEFAULT 'geen',
  etiketten    text[]      NOT NULL DEFAULT '{}',
  map_id       uuid,
  auteur       text        NOT NULL DEFAULT 'operator',
  reden        text        NOT NULL DEFAULT 'wijziging',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notities_revisies_idx ON app.notities_revisies (notitie_id, versie DESC);

ALTER TABLE app.notities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notities_mappen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notities_revisies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notities_eigen ON app.notities;
CREATE POLICY notities_eigen ON app.notities
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS notities_mappen_eigen ON app.notities_mappen;
CREATE POLICY notities_mappen_eigen ON app.notities_mappen
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS notities_revisies_eigen ON app.notities_revisies;
CREATE POLICY notities_revisies_eigen ON app.notities_revisies
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());

-- Dezelfde rechten als de bord-tabellen van 0019 (rechten.sql herhaalt dit voor een nieuwe installatie).
DO $notities_rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.notities, app.notities_mappen, app.notities_revisies TO mijnruimte_app;
    GRANT USAGE, SELECT ON SEQUENCE app.notities_revisies_id_seq TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.notities, app.notities_mappen, app.notities_revisies TO mijnruimte_system;
    GRANT USAGE, SELECT ON SEQUENCE app.notities_revisies_id_seq TO mijnruimte_system;
  END IF;
END
$notities_rechten$;

-- ------------------------------------------------------------------------------------------------ de kopie van de hub-notities
-- Zelfde id, zelfde ruimte, zelfde datums. Soort/kleur/vast uit de etiketten (shared/notities-model.ts), de vrije etiketten apart.
-- `herkomst` bewaart de oorspronkelijke etiketten en een sha256 van titel+tekst: het bewijs voor de test op «0 verlies».
INSERT INTO app.notities (id, user_id, ruimte, titel, inhoud_md, inhoud_plat, soort, kleur, etiketten, vast_sinds, auteur, herkomst, created_at, updated_at)
SELECT i.id, i.user_id, COALESCE(i.ruimte, 'prive'), i.title, i.body, i.body,
       COALESCE((SELECT substr(t, 7) FROM unnest(i.tags) t WHERE t LIKE 'soort:%' AND substr(t, 7) IN ('tekst', 'lijst', 'code', 'koppeling') LIMIT 1), 'tekst'),
       COALESCE((SELECT substr(t, 7) FROM unnest(i.tags) t WHERE t LIKE 'kleur:%' AND substr(t, 7) IN ('geel', 'groen', 'blauw', 'roze', 'grijs') LIMIT 1), 'geen'),
       COALESCE(ARRAY(SELECT t FROM unnest(i.tags) t WHERE t <> 'hub' AND t <> 'vast' AND t NOT LIKE 'soort:%' AND t NOT LIKE 'kleur:%'), '{}'),
       CASE WHEN 'vast' = ANY (i.tags) THEN i.updated_at ELSE NULL END,
       left(i.author, 80),
       jsonb_build_object('bron', 'legacy-bord', 'legacy_tags', to_jsonb(i.tags),
                          'legacy_sha256', encode(sha256(convert_to(i.title || E'\n' || i.body, 'UTF8')), 'hex'),
                          'overgezet_op', now()),
       i.created_at, i.updated_at
FROM app.mcp_console_items i
WHERE i.kind = 'note' AND 'hub' = ANY (i.tags)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------------------------ de vlag (standaard uit)
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('notities-vnext',
  'Нові нотатки: папки, архів, кошик, редактор Markdown, імпорт/експорт. Nieuwe notities. Записи та дозволи ті самі.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;

-- ------------------------------------------------------------------------------------------------ bewijs
DO $notities_bewijs$
DECLARE oud bigint; nieuw bigint; ontbreekt bigint;
BEGIN
  SELECT count(*) INTO oud FROM app.mcp_console_items WHERE kind = 'note' AND 'hub' = ANY (tags);
  SELECT count(*) INTO nieuw FROM app.notities WHERE herkomst->>'bron' = 'legacy-bord';
  SELECT count(*) INTO ontbreekt FROM app.mcp_console_items i WHERE i.kind = 'note' AND 'hub' = ANY (i.tags) AND NOT EXISTS (SELECT 1 FROM app.notities n WHERE n.id = i.id);
  IF ontbreekt > 0 THEN RAISE EXCEPTION '0127: % hub-notities zijn NIET overgezet', ontbreekt; END IF;
  RAISE NOTICE '0127: notities vNext klaar; hub-notities op het bord: %, overgezet (zelfde id): %, ontbrekend: 0', oud, nieuw;
END
$notities_bewijs$;
