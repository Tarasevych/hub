-- 0319 (CONSOL-001 / M4, 23.11.2026): власні ярлики користувача на робочому столі Werkblad v3 з міжпристроєвою синхронізацією у межах простору.
-- Таблиця прив'язана до шухляди (user_id, ruimte) під суворим двомірним захистом рядків (ENABLE + FORCE ROW LEVEL SECURITY).
-- Eigen snelkoppelingen (usr:*) per lade (user_id + ruimte) onder strikte tweevoudige FORCE RLS (gebruiker én ruimte).

CREATE TABLE IF NOT EXISTS app.werkblad_usr_items (
  user_id       text        NOT NULL CHECK (user_id <> ''),
  ruimte        text        NOT NULL CHECK (ruimte IN ('prive', 'technisch')),
  item_id       text        NOT NULL CHECK (item_id ~ '^usr:[a-z0-9-]{1,40}$'),
  basis         text        NOT NULL CHECK (basis ~ '^(svc|pg|cmd):[a-z0-9][a-z0-9._/-]{0,79}$'),
  titel         text        NULL CHECK (titel IS NULL OR (char_length(titel) BETWEEN 1 AND 60 AND titel !~ '[<>]')),
  icoon         text        NULL CHECK (icoon IS NULL OR icoon ~ '^[a-z0-9][a-z0-9:_-]{0,59}$'),
  volgorde      integer     NOT NULL DEFAULT 0 CHECK (volgorde BETWEEN 0 AND 200),
  bijgewerkt_op timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ruimte, item_id),
  FOREIGN KEY (user_id, ruimte) REFERENCES app.werkblad_v3_lade (user_id, ruimte) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS werkblad_usr_items_lade_idx
  ON app.werkblad_usr_items (user_id, ruimte, volgorde, item_id);

COMMENT ON TABLE app.werkblad_usr_items IS 'Werkblad v3: eigen snelkoppelingen (usr:*) per lade (user_id + ruimte) onder strikte FORCE RLS.';

ALTER TABLE app.werkblad_usr_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.werkblad_usr_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS werkblad_usr_items_eigen ON app.werkblad_usr_items;
CREATE POLICY werkblad_usr_items_eigen ON app.werkblad_usr_items
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = NULLIF(current_setting('app.ruimte', true), '')
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = NULLIF(current_setting('app.user_id', true), '')
      AND ruimte = NULLIF(current_setting('app.ruimte', true), '')
    )
  );

DO $rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.werkblad_usr_items TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.werkblad_usr_items TO mijnruimte_system;
  END IF;
END
$rechten$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'werkblad-snelkoppelingen-v1',
  'Робочий стіл v3: збереження й синхронізація власних ярликів між пристроями в межах простору. | Werkblad v3: opslag en synchronisatie van eigen snelkoppelingen tussen apparaten binnen de ruimte.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
