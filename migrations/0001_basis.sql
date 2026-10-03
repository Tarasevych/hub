-- 0001_basis.sql : basisschema voor de zelf-gehoste compatibiliteitslaag.
-- Wordt uitgevoerd door server/migrate.ts binnen één transactie (geen BEGIN/COMMIT hier).
-- De runner maakt schema `app` en tabel app.schema_migrations zelf aan.


-- Generieke documentopslag (vervangt AppDeploy db.*). Eén rij per record per logische tabel.
CREATE TABLE app.records (
  tbl         text        NOT NULL CHECK (length(tbl) BETWEEN 1 AND 200),
  id          text        NOT NULL DEFAULT gen_random_uuid()::text,
  seq         bigint      GENERATED ALWAYS AS IDENTITY,
  data        jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tbl, id)
);
CREATE UNIQUE INDEX records_tbl_seq_idx  ON app.records (tbl, seq);                      -- volgorde + keyset-paginering
CREATE INDEX records_data_gin            ON app.records USING gin (data jsonb_path_ops);  -- filter: data @> '{...}'
CREATE INDEX records_owner_idx    ON app.records (tbl, (data->>'ownerUserId'))   WHERE data ? 'ownerUserId';
CREATE INDEX records_user_idx     ON app.records (tbl, (data->>'userId'))        WHERE data ? 'userId';
CREATE INDEX records_email_idx    ON app.records (tbl, (data->>'email'))         WHERE data ? 'email';
CREATE INDEX records_mailacc_idx  ON app.records (tbl, (data->>'mailAccountId')) WHERE data ? 'mailAccountId';
CREATE INDEX records_tokenhash_idx ON app.records (tbl, (data->>'tokenHash'))    WHERE data ? 'tokenHash';
CREATE INDEX records_updated_idx  ON app.records (updated_at);                    -- TTL-opruimjob

-- Metadata van bestanden onder UPLOADS_DIR (codering, type, integriteit).
CREATE TABLE app.storage_objects (
  path          text PRIMARY KEY CHECK (path ~ '^[A-Za-z0-9/_.-]{1,512}$' AND path !~ '\.\.'),
  content_type  text   NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes >= 0),
  sha256        text   NOT NULL,
  encoding      text   NOT NULL DEFAULT 'base64' CHECK (encoding IN ('base64','utf8')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Uitnodigingen (vervangt AppDeploy invites).
CREATE TABLE app.invites (
  code           text PRIMARY KEY,
  resource_type  text NOT NULL,
  auth_mode      text NOT NULL CHECK (auth_mode IN ('anonymous','required')),
  allow_list     text[] NOT NULL DEFAULT '{}',
  context        jsonb  NOT NULL DEFAULT '{}',
  created_by     text,
  expires_at     timestamptz,
  revoked_at     timestamptz,
  join_count     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invites_expires_idx ON app.invites (expires_at) WHERE revoked_at IS NULL;

-- Rate limiting en lockout (worden in fase B gebruikt).
CREATE TABLE app.rate_limits (
  bucket        text        NOT NULL,
  window_start  timestamptz NOT NULL,
  hits          integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX rate_limits_window_idx ON app.rate_limits (window_start);

CREATE TABLE app.login_lockouts (
  subject       text PRIMARY KEY,
  failures      integer     NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Cron-runs (observability, aanvulling op journald).
CREATE TABLE app.cron_runs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error','skipped')),
  detail       text
);
CREATE INDEX cron_runs_name_idx ON app.cron_runs (name, started_at DESC);
