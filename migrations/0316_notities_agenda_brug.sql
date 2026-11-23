-- 0316 — Міст між Нотатками, Календарем, Завданнями та Хмарним сховищем із примусовим рядковим захистом у межах простору.
-- Brug tussen Notities, Agenda, Taken en Opslag met afgedwongen rijbeveiliging per gebruiker en ruimte (standaard vlag uit).

ALTER TABLE app.notities
  ADD COLUMN IF NOT EXISTS taken_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(taken_ids) <= 50),
  ADD COLUMN IF NOT EXISTS cloud_bestand_ids text[] NOT NULL DEFAULT '{}' CHECK (cardinality(cloud_bestand_ids) <= 50);

CREATE TABLE IF NOT EXISTS app.notities_agenda_koppelingen (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              text        NOT NULL,
  ruimte               text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  notitie_id           uuid        NOT NULL REFERENCES app.notities (id) ON DELETE CASCADE,
  event_id             text        NOT NULL CHECK (length(event_id) BETWEEN 3 AND 1200),
  agenda_id            text        NOT NULL DEFAULT 'primary' CHECK (length(agenda_id) BETWEEN 1 AND 2000),
  event_bron           text        NOT NULL DEFAULT 'google' CHECK (event_bron IN ('google', 'caldav', 'ics')),
  event_titel          text        NOT NULL DEFAULT '' CHECK (length(event_titel) <= 300),
  event_begin          text        NOT NULL DEFAULT '' CHECK (length(event_begin) <= 80),
  bevestigd_door       text        NOT NULL DEFAULT 'gebruiker' CHECK (length(bevestigd_door) <= 80),
  idempotentie_sleutel text        NOT NULL CHECK (idempotentie_sleutel ~ '^[A-Za-z0-9_-]{8,120}$'),
  aangemaakt_op        timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ruimte, notitie_id, event_id),
  UNIQUE (user_id, ruimte, idempotentie_sleutel)
);

CREATE INDEX IF NOT EXISTS notities_agenda_koppelingen_notitie_idx
  ON app.notities_agenda_koppelingen (user_id, ruimte, notitie_id);
CREATE INDEX IF NOT EXISTS notities_agenda_koppelingen_event_idx
  ON app.notities_agenda_koppelingen (user_id, ruimte, event_id);

ALTER TABLE app.notities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notities FORCE ROW LEVEL SECURITY;
ALTER TABLE app.notities_mappen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notities_mappen FORCE ROW LEVEL SECURITY;
ALTER TABLE app.notities_revisies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notities_revisies FORCE ROW LEVEL SECURITY;

ALTER TABLE app.notities_agenda_koppelingen ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notities_agenda_koppelingen FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notities_agenda_koppelingen_eigen ON app.notities_agenda_koppelingen;
CREATE POLICY notities_agenda_koppelingen_eigen ON app.notities_agenda_koppelingen
  USING (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (
        NULLIF(current_setting('app.ruimte', true), '') IS NULL
        OR ruimte = NULLIF(current_setting('app.ruimte', true), '')
      )
    )
  )
  WITH CHECK (
    current_user::text <> 'mijnruimte_app'
    OR (
      user_id = app.huidige_gebruiker()
      AND (
        NULLIF(current_setting('app.ruimte', true), '') IS NULL
        OR ruimte = NULLIF(current_setting('app.ruimte', true), '')
      )
    )
  );

DO $rechten$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.notities_agenda_koppelingen TO mijnruimte_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_system') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.notities_agenda_koppelingen TO mijnruimte_system;
  END IF;
END
$rechten$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES (
  'notities-agenda-brug-v1',
  'Нотатки: двостороння прив’язка до подій календаря з підтвердженням, створення завдань і прикріплення файлів Сховища. | Notities: tweerichtingskoppeling met agenda-afspraken, taken en Opslag-bestanden.',
  false, false
)
ON CONFLICT (sleutel) DO NOTHING;
