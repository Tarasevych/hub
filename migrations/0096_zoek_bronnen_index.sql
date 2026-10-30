-- 0096: ZOEKEN, ETAPPE C — bronnen naar één zoekindex, een wachtrij voor incrementele updates, een OCR-cache per sha256 en
-- de echte stand per bron (verbonden / indexeren / fout).
--
-- NUMMERING. In deze momentopname (20261021-191053) is 0092 de laatste migratie op schijf. SAMENVATTING noemt 0093/0094
-- (zoeken fase 1/2) en de opdracht noemt 0095 als voorbeeld van een wachtrij, maar die drie bestanden zitten NIET in het
-- pakket. Om botsingen met die nummers te vermijden kiest deze migratie 0096. Klopt de volgorde niet, dan alleen het
-- bestand hernoemen: alles hieronder is idempotent en hangt niet van 0093–0095 af.
--
-- WACHTRIJ. Zelfde patroon als app.mail_queue (0016) en runMailQueue (backend/mail-compose.ts): een statusmachine
-- (wachtend -> bezig -> klaar / fout / geannuleerd), attempts, last_error, een idempotentiesleutel (een tweede melding van
-- hetzelfde bronitem maakt GEEN tweede rij zolang de eerste nog wacht) en ophalen met FOR UPDATE SKIP LOCKED.
-- Zoals bij 0016: alleen de systeemrol (cron) en routes in gebruikerscontext; RLS aan als tweede laag.

CREATE TABLE IF NOT EXISTS app.zoek_wachtrij (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL,
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  bron           text        NOT NULL CHECK (bron IN ('mail', 'mail_bijlage', 'cloud', 'drive', 'agenda', 'bord', 'github')),
  bron_id        text        NOT NULL CHECK (length(bron_id) BETWEEN 1 AND 500),
  actie          text        NOT NULL DEFAULT 'bijwerken' CHECK (actie IN ('bijwerken', 'verwijderen', 'volledig')),
  status         text        NOT NULL DEFAULT 'wachtend' CHECK (status IN ('wachtend', 'bezig', 'klaar', 'fout', 'geannuleerd')),
  attempts       integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error     text        NOT NULL DEFAULT '' CHECK (length(last_error) <= 300),
  -- Kleine verwijzing naar het bronitem (geen inhoud): bv. {accountId, messageId, attachmentId}. Begrensd.
  payload        jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 4096),
  run_after      timestamptz NOT NULL DEFAULT now(),
  leased_until   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  done_at        timestamptz
);
CREATE INDEX IF NOT EXISTS zoek_wachtrij_due_idx ON app.zoek_wachtrij (run_after) WHERE status = 'wachtend';
CREATE INDEX IF NOT EXISTS zoek_wachtrij_user_idx ON app.zoek_wachtrij (user_id, ruimte, bron, status);
-- Idempotentie: per bronitem hoogstens één WACHTENDE taak. Bewust niet ook 'bezig': komt er een wijziging binnen terwijl
-- het item net verwerkt wordt, dan moet er daarna nog één run komen (anders gaat die wijziging verloren).
CREATE UNIQUE INDEX IF NOT EXISTS zoek_wachtrij_open_idx ON app.zoek_wachtrij (user_id, ruimte, bron, bron_id) WHERE status = 'wachtend';

-- De index zelf: één rij per bronitem (of per bijlage / per bestand in een archief).
CREATE TABLE IF NOT EXISTS app.zoek_document (
  user_id        text        NOT NULL,
  ruimte         text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  bron           text        NOT NULL CHECK (bron IN ('mail', 'mail_bijlage', 'cloud', 'drive', 'agenda', 'bord', 'github')),
  bron_id        text        NOT NULL CHECK (length(bron_id) BETWEEN 1 AND 700),
  titel          text        NOT NULL DEFAULT '' CHECK (length(titel) <= 500),
  ondertitel     text        NOT NULL DEFAULT '' CHECK (length(ondertitel) <= 500),
  tekst          text        NOT NULL DEFAULT '' CHECK (length(tekst) <= 200000),
  doel           jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(doel) = 'object' AND pg_column_size(doel) <= 2048),
  inhoud_sha256  text        NOT NULL DEFAULT '' CHECK (inhoud_sha256 = '' OR inhoud_sha256 ~ '^[a-f0-9]{64}$'),
  bron_bijgewerkt_op timestamptz,
  geindexeerd_op timestamptz NOT NULL DEFAULT now(),
  zoekvector     tsvector    GENERATED ALWAYS AS (
                   setweight(to_tsvector('simple', coalesce(titel, '')), 'A') ||
                   setweight(to_tsvector('simple', coalesce(ondertitel, '')), 'B') ||
                   setweight(to_tsvector('simple', left(coalesce(tekst, ''), 100000)), 'C')) STORED,
  PRIMARY KEY (user_id, ruimte, bron, bron_id)
);
CREATE INDEX IF NOT EXISTS zoek_document_vector_idx ON app.zoek_document USING gin (zoekvector);

-- OCR-cache: inhoud wordt één keer herkend, ongeacht hoeveel bronnen hetzelfde bestand hebben. Sleutel = sha256 van de
-- bytes + engine. Geen user_id: dezelfde bytes geven dezelfde tekst; alleen de systeemrol leest/schrijft (geen RLS-lek,
-- want een rij is alleen te vinden met de hash van bytes die je al hebt).
CREATE TABLE IF NOT EXISTS app.zoek_ocr_cache (
  sha256         text        NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  engine         text        NOT NULL CHECK (length(engine) BETWEEN 1 AND 60),
  status         text        NOT NULL CHECK (status IN ('ok', 'leeg', 'niet_ondersteund', 'te_groot')),
  tekst          text        NOT NULL DEFAULT '' CHECK (length(tekst) <= 200000),
  mime_type      text        NOT NULL DEFAULT '' CHECK (length(mime_type) <= 200),
  bytes          bigint      NOT NULL DEFAULT 0,
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sha256, engine)
);

-- De stand per bron: wat de indexeerder ECHT laatst zag. «verbonden» zelf komt live uit de bestaande koppelingen
-- (backend/zoek/stand.ts); hier staan de tijden en de laatste fout.
CREATE TABLE IF NOT EXISTS app.zoek_bron_stand (
  user_id          text        NOT NULL,
  ruimte           text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  bron             text        NOT NULL CHECK (bron IN ('mail', 'mail_bijlage', 'cloud', 'drive', 'agenda', 'bord', 'github')),
  laatste_poging_op timestamptz,
  laatste_succes_op timestamptz,
  laatste_fout     text        NOT NULL DEFAULT '' CHECK (length(laatste_fout) <= 300),
  laatste_fout_op  timestamptz,
  documenten       integer     NOT NULL DEFAULT 0 CHECK (documenten >= 0),
  bijgewerkt_op    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, bron)
);

ALTER TABLE app.zoek_wachtrij ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.zoek_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.zoek_ocr_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.zoek_bron_stand ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zoek_wachtrij_eigen ON app.zoek_wachtrij;
CREATE POLICY zoek_wachtrij_eigen ON app.zoek_wachtrij
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS zoek_document_eigen ON app.zoek_document;
CREATE POLICY zoek_document_eigen ON app.zoek_document
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS zoek_bron_stand_eigen ON app.zoek_bron_stand;
CREATE POLICY zoek_bron_stand_eigen ON app.zoek_bron_stand
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
-- app.zoek_ocr_cache: geen policy voor mijnruimte_app = geen toegang voor de app-rol; alleen de systeemrol.
DROP POLICY IF EXISTS zoek_ocr_cache_systeem ON app.zoek_ocr_cache;
CREATE POLICY zoek_ocr_cache_systeem ON app.zoek_ocr_cache
  USING (current_user::text <> 'mijnruimte_app')
  WITH CHECK (current_user::text <> 'mijnruimte_app');
