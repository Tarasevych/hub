-- 0061: blijvende archieven van releases en publicatie op GitHub (audit 18.10.2026, punt 4).
--
-- Waarom: het root-script zocht het pakket op een pad dat nooit bestond, dus er werd nooit een archief bewaard, nooit een GitHub-release
-- gemaakt en er was geen manier om een eerdere release te downloaden. Nu bewaart root (passkey/ondertekend) en de installer (SSH) elk
-- geïnstalleerd pakket in /srv/mijn-ruimte/pakketten/mijn-ruimte-<versie>.tar.gz (+ .sha256) en zet het pad in de OK-gebeurtenis;
-- de app neemt het bij de run op (backend/uitrol-runs.ts) en biedt «Завантажити цей випуск» (passkey) en publicatie op GitHub
-- (backend/uitrol-github.ts, token uit de kluis van de eigenaar, doel `github-uitrol` of `github`).
ALTER TABLE app.uitrol_runs ADD COLUMN IF NOT EXISTS pakket_pad      text NOT NULL DEFAULT '';
ALTER TABLE app.uitrol_runs ADD COLUMN IF NOT EXISTS pakket_sha256   text NOT NULL DEFAULT '' CHECK (pakket_sha256 = '' OR pakket_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE app.uitrol_runs ADD COLUMN IF NOT EXISTS pakket_grootte  bigint NOT NULL DEFAULT 0 CHECK (pakket_grootte >= 0);
ALTER TABLE app.uitrol_runs ADD COLUMN IF NOT EXISTS github_release_url text NOT NULL DEFAULT '';
ALTER TABLE app.uitrol_runs ADD COLUMN IF NOT EXISTS github_fout     text NOT NULL DEFAULT '';
ALTER TABLE app.uitrol_runs ADD COLUMN IF NOT EXISTS github_pogingen integer NOT NULL DEFAULT 0;
ALTER TABLE app.uitrol_runs ADD COLUMN IF NOT EXISTS github_op       timestamptz;

-- Instellingen van de publicatie (één rij per eigenaar): repository, automatisch publiceren.
CREATE TABLE IF NOT EXISTS app.uitrol_github_instellingen (
  eigenaar_id   uuid        PRIMARY KEY,
  repo          text        NOT NULL DEFAULT '' CHECK (repo = '' OR repo ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$'),
  automatisch   boolean     NOT NULL DEFAULT false,
  bijgewerkt_op timestamptz NOT NULL DEFAULT now()
);

-- Logboek van publicaties (ook mislukte): wat, wanneer, uitkomst; nooit de token.
CREATE TABLE IF NOT EXISTS app.uitrol_github_publicaties (
  id          bigserial   PRIMARY KEY,
  run_id      text        NOT NULL REFERENCES app.uitrol_runs (id) ON DELETE CASCADE,
  versie      text        NOT NULL DEFAULT '',
  repo        text        NOT NULL DEFAULT '',
  tag         text        NOT NULL DEFAULT '',
  uitkomst    text        NOT NULL CHECK (uitkomst IN ('ok', 'fout', 'overgeslagen')),
  url         text        NOT NULL DEFAULT '',
  fout        text        NOT NULL DEFAULT '' CHECK (length(fout) <= 400),
  door        text        NOT NULL DEFAULT '',   -- 'automatisch' of e-mail/id van de eigenaar
  tijd        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uitrol_github_publicaties_run_idx ON app.uitrol_github_publicaties (run_id, tijd DESC);
