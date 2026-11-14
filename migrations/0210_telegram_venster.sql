-- 0210 — TELEGRAM-002 etap 1 (14.11.2026): «Захищене вікно Telegram» — dezelfde pictogrammen op de site en in Telegram.
-- De browser toont één pictogram; in het venster van Telegram (Mini App, of dezelfde pagina in de browser via een ondertekende
-- verwijzing) kiest de gebruiker datzelfde pictogram uit 3–5 en vult daar — indien ingesteld — de geheime code in (nooit in de chat).
-- Daarnaast: geschiedenis van de profielfoto's van Telegram (elke nieuwe foto blijft bewaard, er wordt niets verwijderd).
--
-- Schrijven en lezen ALLEEN via de systeemrol (zelfde patroon als 0202/0204); de autorisatie zit in de code
-- (backend/telegram-aanmelden/venster.ts). Geen enkele kolom bevat een geheim: alleen indexen in de pictogramcatalogus en standen.
-- Herhaalbaar (IF NOT EXISTS / ON CONFLICT DO NOTHING / DROP CONSTRAINT IF EXISTS).

-- Vlag voor alle onderdelen van TELEGRAM-002; omschrijving ≤ 300 tekens (CHECK in 0038). Standaard AAN: het venster verhoogt
-- alleen de veiligheid; de beheerder kan het venster apart uitzetten (instelling «venster») — dan geldt de oude knop «Так, це я».
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('telegram-v2',
  'Telegram 2.0: ті самі піктограми на сайті й у захищеному вікні Telegram, таємний код у вікні, історія фото. | Telegram 2.0: dezelfde pictogrammen op de site en in het beveiligde Telegram-venster, code in het venster, fotogeschiedenis.',
  true, true)
ON CONFLICT (sleutel) DO NOTHING;

-- Aanmelden: trekking bij het verzoek (getrokken bij de start, zodat de browser het pictogram meteen toont).
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS soort text CHECK (soort IS NULL OR soort = 'pictogrammen');
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS kandidaten smallint[];
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS juist smallint CHECK (juist IS NULL OR juist BETWEEN 0 AND 4);
-- true = het juiste pictogram is in het venster gekozen
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS symbool_ok boolean NOT NULL DEFAULT false;
-- waar de geheime code ingevuld moet worden: 'site' (oude weg) of 'venster' (TELEGRAM-002)
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS code_plek text NOT NULL DEFAULT 'site' CHECK (code_plek IN ('site','venster'));
-- Herkenning (officiële logo's en vlag in het venster en op de site): browser + versie en systeem + versie, plaats en land
-- zoals de tunnel ze meegeeft (cf-ipcity / cf-ipcountry). Alleen weergave; de grove sleutel `apparaat` blijft voor de blokkade.
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS toestel text NOT NULL DEFAULT '' CHECK (length(toestel) <= 80);
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS plaats text NOT NULL DEFAULT '' CHECK (length(plaats) <= 120);
ALTER TABLE app.tg_inlog_verzoeken ADD COLUMN IF NOT EXISTS land text NOT NULL DEFAULT '' CHECK (land ~ '^([A-Z]{2})?$');
-- Nieuwe reden: verkeerd pictogram gekozen (één poging).
ALTER TABLE app.tg_inlog_verzoeken DROP CONSTRAINT IF EXISTS tg_inlog_verzoeken_reden_check;
ALTER TABLE app.tg_inlog_verzoeken ADD CONSTRAINT tg_inlog_verzoeken_reden_check
  CHECK (reden IN ('','niet-ik','passkey-nodig','niet-gekoppeld','gepauzeerd','apparaat-geblokkeerd','fout-symbool','code-fout'));
DO $v$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tg_inlog_verzoeken_trekking') THEN
    ALTER TABLE app.tg_inlog_verzoeken ADD CONSTRAINT tg_inlog_verzoeken_trekking
      CHECK (kandidaten IS NULL OR (array_length(kandidaten, 1) BETWEEN 3 AND 5 AND juist IS NOT NULL AND juist < array_length(kandidaten, 1)));
  END IF;
END
$v$;

-- Bevestigen van een handeling: geheime code in het venster (alleen als de gebruiker er een heeft).
ALTER TABLE app.tg_bevestigingen ADD COLUMN IF NOT EXISTS code_nodig boolean NOT NULL DEFAULT false;
ALTER TABLE app.tg_bevestigingen ADD COLUMN IF NOT EXISTS symbool_ok boolean NOT NULL DEFAULT false;
ALTER TABLE app.tg_bevestigingen ADD COLUMN IF NOT EXISTS venster boolean NOT NULL DEFAULT false;
ALTER TABLE app.tg_bevestigingen ADD COLUMN IF NOT EXISTS toestel text NOT NULL DEFAULT '' CHECK (length(toestel) <= 80);
ALTER TABLE app.tg_bevestigingen ADD COLUMN IF NOT EXISTS plaats text NOT NULL DEFAULT '' CHECK (length(plaats) <= 120);
ALTER TABLE app.tg_bevestigingen ADD COLUMN IF NOT EXISTS land text NOT NULL DEFAULT '' CHECK (land ~ '^([A-Z]{2})?$');

-- Geschiedenis van de profielfoto's van Telegram: bij elke interactie bijgewerkt, NOOIT verwijderd (ook niet bij ontkoppelen),
-- zodat de eigenaar later kan nagaan welk profiel wanneer hoe zag. Klein voorbeeld (≤ 64 KB, de kleinste maat van Telegram).
CREATE TABLE IF NOT EXISTS app.tg_fotos (
  id            bigserial PRIMARY KEY,
  telegram_id   text        NOT NULL CHECK (telegram_id ~ '^[0-9]{1,20}$'),
  uniek         text        NOT NULL CHECK (length(uniek) BETWEEN 1 AND 128),
  beeld         bytea       CHECK (beeld IS NULL OR octet_length(beeld) <= 65536),
  type          text        NOT NULL DEFAULT 'image/jpeg' CHECK (type IN ('image/jpeg','image/png','image/webp')),
  eerst_gezien  timestamptz NOT NULL DEFAULT now(),
  laatst_gezien timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_id, uniek)
);
CREATE INDEX IF NOT EXISTS tg_fotos_telegram ON app.tg_fotos (telegram_id, laatst_gezien DESC);
ALTER TABLE app.tg_fotos ENABLE ROW LEVEL SECURITY;
