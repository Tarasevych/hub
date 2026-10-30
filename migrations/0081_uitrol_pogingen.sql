-- 0081: elke POGING om een update uit te rollen laat een spoor na — ook als ze in de BROWSER afbrak (eigenaar 20.10.2026).
--
-- Waarom: de eigenaar koos een pakket op admin.tarasevych.com/updates, het lezen van het bestand brak af met NotReadableError
-- (een DOMException van de File API, dus in de browser), en in de geschiedenis bleef NIETS over. De tweede poging slaagde, dus
-- «Останні розгортання» toonde alleen de geslaagde regel. De oorzaak: de afbreking gebeurde vóór of tijdens het versturen van de
-- stukken; de server hoorde er nooit van. Een pakket dat niet werd afgemaakt bleef op 'uploaden' staan en kwam hoogstens in het
-- blok «Пакети, які не дійшли до встановлення» — zonder reden, zonder etappe, zonder percentage.
--
-- Vanaf nu meldt de browser elke afbreking (POST /api/uitrol/poging/afgebroken, backend/uitrol-pogingen.ts) en bewaart de server
-- ook zijn EIGEN vaststellingen hier (een upload die stil viel of te oud werd). Daarom:
--   * `gemeld_door` zegt of de regel van de browser komt of door de server zelf is vastgesteld — die twee worden nooit verward;
--   * `etappe` zegt waar het stokte (kiezen → lezen → voorcontrole → begin → uploaden → klaar → goedkeuren → installeren);
--   * `code` is de reden uit de ENIGE bron (shared/foutuitleg.ts + shared/uitrol-codes.ts), bv. `BESTAND_LEZEN|NotReadableError`;
--   * `reden_bekend = false` + code 'ZONDER_REDEN' is het eerlijke geval: het tabblad werd gesloten of het netwerk verdween, en
--     de site weet niets meer dan dat. Dat mag nooit lijken op een bekende oorzaak.
-- Alleen de systeemrol komt bij deze tabel (zoals app.uitrol_runs); bewaartermijn en maximum per account: backend/uitrol-pogingen.ts.
CREATE TABLE IF NOT EXISTS app.uitrol_pogingen (
  id                 bigserial   PRIMARY KEY,
  -- Het voorstel, als dat al bestond. Brak het lezen van het bestand af vóór «voorstel/begin», dan is dit NULL en zijn versie en
  -- sha256 toch bekend: de browser las ze al uit het archief (src/platform/tar-lezen.ts).
  voorstel_id        uuid        REFERENCES app.uitrol_voorstellen (id) ON DELETE SET NULL,
  versie             text        NOT NULL DEFAULT '' CHECK (versie = '' OR versie ~ '^[0-9]{8}-[0-9]{6}$'),
  sha256             text        NOT NULL DEFAULT '' CHECK (sha256 = '' OR sha256 ~ '^[0-9a-f]{64}$'),
  bytes              bigint      NOT NULL DEFAULT 0 CHECK (bytes >= 0 AND bytes <= 314572800),
  etappe             text        NOT NULL CHECK (etappe IN ('kiezen', 'lezen', 'voorcontrole', 'begin', 'uploaden', 'klaar', 'goedkeuren', 'installeren')),
  verstuurd          bigint      NOT NULL DEFAULT 0 CHECK (verstuurd >= 0),
  procent            smallint    NOT NULL DEFAULT 0 CHECK (procent BETWEEN 0 AND 100),
  code               text        NOT NULL DEFAULT 'ZONDER_REDEN' CHECK (length(code) BETWEEN 1 AND 120),
  reden_bekend       boolean     NOT NULL DEFAULT true,
  poging             integer     NOT NULL DEFAULT 1 CHECK (poging BETWEEN 1 AND 999),
  bestand            text        NOT NULL DEFAULT '' CHECK (length(bestand) <= 160),
  gemeld_door        text        NOT NULL CHECK (gemeld_door IN ('browser', 'server')),
  voorbereider_id    uuid        REFERENCES app.uitrol_voorbereiders (id) ON DELETE SET NULL,
  voorbereider_label text        NOT NULL DEFAULT '' CHECK (length(voorbereider_label) <= 160),
  account_id         text        NOT NULL DEFAULT '' CHECK (length(account_id) <= 80),
  -- Tijd volgens de browser (alleen informatief; de klok van een apparaat is geen feit). `aangemaakt_op` is de servertijd.
  gemeld_op          timestamptz,
  aangemaakt_op      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uitrol_pogingen_tijd_idx    ON app.uitrol_pogingen (aangemaakt_op DESC, id DESC);
CREATE INDEX IF NOT EXISTS uitrol_pogingen_account_idx ON app.uitrol_pogingen (account_id, aangemaakt_op DESC);
CREATE INDEX IF NOT EXISTS uitrol_pogingen_versie_idx  ON app.uitrol_pogingen (versie);

DO $r$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN REVOKE ALL ON app.uitrol_pogingen FROM mijnruimte_app; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.uitrol_pogingen TO mijnruimte_system;
    GRANT USAGE, SELECT ON SEQUENCE app.uitrol_pogingen_id_seq TO mijnruimte_system;
  END IF;
END
$r$;
