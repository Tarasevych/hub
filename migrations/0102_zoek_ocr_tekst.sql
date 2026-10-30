-- 0102: ZOEKEN — OCR-CACHE PER GEBRUIKER EN RUIMTE (vervangt het gebruik van app.zoek_ocr_cache uit 0096).
--
-- WAAROM EEN NIEUWE TABEL. 0096 cachet herkende tekst alleen op sha256+engine, zonder user_id. Dat is goedkoop (één OCR
-- voor iedereen met hetzelfde bestand), maar: (1) herkende tekst IS de inhoud van een persoonlijk document en hoort onder
-- dezelfde ruimteregel als de zoekindex zelf (RLS op user_id, prive/technisch); (2) een gedeelde cache is een orakel —
-- wie de hash van een bestand heeft, kan aan 'ocr_cache' zien dat iemand anders op deze server dat bestand bezit;
-- (3) na het verwijderen van een document of het intrekken van een bron moet de tekst wég kunnen (ocrCacheWissen), wat
-- met een gedeelde rij niet kan. Prijs: hetzelfde bestand bij twee gebruikers wordt twee keer herkend. Bewust gekozen.
--
-- Sleutel: (user_id, ruimte, sha256, pagina, engine, talen). Pagina 1-based (afbeelding = 1). `talen` is de
-- tesseract-taalreeks ('ukr+nld+eng'): andere talen = andere tekst. Een 'leeg' resultaat wordt óók bewaard (een lege
-- scan hoeft niet elke keer opnieuw door de engine). Fouten en time-outs worden NIET bewaard.
--
-- Terugdraaien: DROP TABLE app.zoek_ocr_tekst; — de code valt dan terug op 'ocr' zonder cache (geen gegevensverlies in
-- de index zelf). 0096 blijft onaangeroerd.

CREATE TABLE IF NOT EXISTS app.zoek_ocr_tekst (
  user_id        text        NOT NULL CHECK (user_id <> ''),
  ruimte         text        NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  sha256         text        NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  pagina         integer     NOT NULL CHECK (pagina >= 1 AND pagina <= 100000),
  engine         text        NOT NULL CHECK (length(engine) BETWEEN 1 AND 60),
  talen          text        NOT NULL DEFAULT '' CHECK (length(talen) <= 120),
  status         text        NOT NULL CHECK (status IN ('ok', 'leeg')),
  tekst          text        NOT NULL DEFAULT '' CHECK (length(tekst) <= 200000),
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, sha256, pagina, engine, talen)
);
CREATE INDEX IF NOT EXISTS zoek_ocr_tekst_gebruiker_idx ON app.zoek_ocr_tekst (user_id, ruimte, aangemaakt_op);

-- Zelfde policy als app.zoek_document (0096): de app-rol ziet alleen eigen rijen; de systeemrol (cron/wachtrij) alles,
-- maar de code zet altijd user_id én ruimte in de WHERE (tekst-extractie.ts, pgOcrTekstCache).
ALTER TABLE app.zoek_ocr_tekst ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zoek_ocr_tekst_eigen ON app.zoek_ocr_tekst;
CREATE POLICY zoek_ocr_tekst_eigen ON app.zoek_ocr_tekst
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.zoek_ocr_tekst TO mijnruimte_app;
  END IF;
END $$;
