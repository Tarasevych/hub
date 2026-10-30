-- 0076: de agenda wordt ECHT tweerichtings (opdracht van de eigenaar, 20.10.2026: «досить кнопок-пустушок»).
--
--   app.agenda_koppeling          de band lokaal ↔ Google en het ENE geheugen voor idempotentie. Per schrijfactie
--                                 draagt de aanroeper een `idempotentie_sleutel` mee; die staat hier met de uitslag.
--                                 Een tweede, gelijke poging (netwerk hapert, de AI probeert opnieuw) vindt de rij en
--                                 verstuurt niets meer. `etag` is de Google-versie die wij kenden: die gaat als
--                                 If-Match mee, zodat we nooit een wijziging overschrijven die in Google is gedaan.
--                                 `waarheidsbron` zegt wie bij een conflict wint: 'lokaal' zolang de insert nog niet
--                                 lukte, daarna altijd 'google' (shared/agenda-model.ts → WAARHEIDSBRON).
--   app.agenda_abonnement         externe agenda's die we LEZEN: een .ics-adres (alleen https) of een CalDAV-account.
--                                 Het CalDAV-wachtwoord staat versleuteld (AES-256-GCM, sealWithEnvKey met
--                                 AGENDA_ABONNEMENT_SLEUTEL_V1 en de rij als AAD) — nooit in platte tekst, nooit in de URL.
--                                 De planner leest `interval_minuten` + `laatst_op`: nooit vaker dan elke 15 minuten.
--   app.agenda_externe_gebeurtenis  de spiegel van die externe agenda's. Alleen lezen: `bron` is altijd de aanbieder.
--
-- De Google-spiegel zelf blijft staan waar ze stond (app.records → google_suite_calendar_events_v1), want
-- backend/hub-block-data.ts leest die al; 0076 voegt daar alleen velden aan toe (schemaloze records).
-- Alles onder RLS en per gebruiker. Idempotent.

CREATE TABLE IF NOT EXISTS app.agenda_koppeling (
  user_id              text        NOT NULL,
  lokaal_id            text        NOT NULL CHECK (length(lokaal_id) BETWEEN 8 AND 120),
  provider             text        NOT NULL DEFAULT 'google' CHECK (provider IN ('google')),
  agenda_id            text        NOT NULL DEFAULT 'primary' CHECK (length(agenda_id) BETWEEN 1 AND 500),
  provider_gebeurtenis_id text     NOT NULL DEFAULT '' CHECK (length(provider_gebeurtenis_id) <= 1024),
  etag                 text        NOT NULL DEFAULT '' CHECK (length(etag) <= 300),
  waarheidsbron        text        NOT NULL DEFAULT 'lokaal' CHECK (waarheidsbron IN ('lokaal', 'google')),
  idempotentie_sleutel text        NOT NULL CHECK (idempotentie_sleutel ~ '^[A-Za-z0-9_-]{8,120}$'),
  actie                text        NOT NULL CHECK (actie IN ('aanmaken', 'wijzigen', 'verplaatsen', 'verwijderen', 'deelnemers', 'rsvp')),
  staat                text        NOT NULL DEFAULT 'bezig' CHECK (staat IN ('bezig', 'klaar', 'conflict', 'weg', 'fout')),
  fout                 text        NOT NULL DEFAULT '' CHECK (fout ~ '^[A-Z0-9_]{0,60}$'),
  uitslag              jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(uitslag) = 'object' AND pg_column_size(uitslag) <= 8192),
  aangemaakt_op        timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotentie_sleutel)
);
CREATE INDEX IF NOT EXISTS agenda_koppeling_gebeurtenis_idx ON app.agenda_koppeling (user_id, provider, agenda_id, provider_gebeurtenis_id);
CREATE INDEX IF NOT EXISTS agenda_koppeling_lokaal_idx ON app.agenda_koppeling (user_id, lokaal_id);

CREATE TABLE IF NOT EXISTS app.agenda_abonnement (
  user_id          text        NOT NULL,
  id               text        NOT NULL CHECK (length(id) BETWEEN 8 AND 120),
  bron             text        NOT NULL CHECK (bron IN ('ics', 'caldav')),
  naam             text        NOT NULL DEFAULT '' CHECK (length(naam) <= 200),
  -- Alleen https; backend/agenda-ics.ts en backend/agenda-caldav.ts controleren dat nog eens met de zuivere
  -- functies uit shared/ (veiligIcsAdres / veiligCaldavAdres). Hier staat het ook in de database, als derde hek.
  adres            text        NOT NULL CHECK (adres ~ '^https://' AND length(adres) <= 2000),
  gebruikersnaam   text        NOT NULL DEFAULT '' CHECK (length(gebruikersnaam) <= 320),
  -- AES-256-GCM-envelop 'v1.<iv>.<ct>.<tag>' (base64url) — nooit het wachtwoord zelf.
  geheim           text        NOT NULL DEFAULT '' CHECK (geheim = '' OR geheim ~ '^v1\.'),
  actief           boolean     NOT NULL DEFAULT true,
  interval_minuten integer     NOT NULL DEFAULT 60 CHECK (interval_minuten BETWEEN 15 AND 10080),
  -- CalDAV: de gevonden agenda's (url, naam, ctag, kleur) na de ontdekking; ICS: leeg.
  agendas          jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(agendas) = 'array' AND pg_column_size(agendas) <= 16384),
  etag             text        NOT NULL DEFAULT '' CHECK (length(etag) <= 300),
  laatst_op        timestamptz,
  laatst_klaar_op  timestamptz,
  laatste_staat    text        NOT NULL DEFAULT 'nieuw' CHECK (laatste_staat IN ('nieuw', 'bezig', 'klaar', 'onveranderd', 'fout')),
  fout             text        NOT NULL DEFAULT '' CHECK (fout ~ '^[A-Z0-9_]{0,60}$'),
  aantal           integer     NOT NULL DEFAULT 0 CHECK (aantal >= 0),
  poging           smallint    NOT NULL DEFAULT 0 CHECK (poging BETWEEN 0 AND 100),
  aangemaakt_op    timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
-- Eén keer hetzelfde adres per gebruiker: anders staat een rooster er twee keer in.
CREATE UNIQUE INDEX IF NOT EXISTS agenda_abonnement_adres_idx ON app.agenda_abonnement (user_id, bron, adres);
CREATE INDEX IF NOT EXISTS agenda_abonnement_planner_idx ON app.agenda_abonnement (actief, laatst_op) WHERE actief;

CREATE TABLE IF NOT EXISTS app.agenda_externe_gebeurtenis (
  user_id        text        NOT NULL,
  abonnement_id  text        NOT NULL CHECK (length(abonnement_id) BETWEEN 8 AND 120),
  -- Per CalDAV-agenda apart (bij ICS leeg): hetzelfde UID kan in twee agenda's staan.
  agenda_url     text        NOT NULL DEFAULT '' CHECK (length(agenda_url) <= 2000),
  uid            text        NOT NULL CHECK (length(uid) BETWEEN 1 AND 500),
  titel          text        NOT NULL DEFAULT '' CHECK (length(titel) <= 300),
  locatie        text        NOT NULL DEFAULT '' CHECK (length(locatie) <= 500),
  beschrijving   text        NOT NULL DEFAULT '' CHECK (length(beschrijving) <= 4000),
  begin_waarde   text        NOT NULL CHECK (length(begin_waarde) BETWEEN 10 AND 40),
  eind_waarde    text        NOT NULL DEFAULT '' CHECK (length(eind_waarde) <= 40),
  hele_dag       boolean     NOT NULL DEFAULT false,
  tijdzone       text        NOT NULL DEFAULT '' CHECK (length(tijdzone) <= 80),
  rrule          text        NOT NULL DEFAULT '' CHECK (length(rrule) <= 600),
  status         text        NOT NULL DEFAULT '' CHECK (length(status) <= 40),
  reeks          integer     NOT NULL DEFAULT 0 CHECK (reeks >= 0),
  gewijzigd_op   text        NOT NULL DEFAULT '' CHECK (length(gewijzigd_op) <= 40),
  url            text        NOT NULL DEFAULT '' CHECK (url = '' OR url ~ '^https://'),
  gezien_op      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, abonnement_id, agenda_url, uid)
);
CREATE INDEX IF NOT EXISTS agenda_externe_gebeurtenis_begin_idx ON app.agenda_externe_gebeurtenis (user_id, begin_waarde);

ALTER TABLE app.agenda_koppeling ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agenda_abonnement ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agenda_externe_gebeurtenis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agenda_koppeling_eigen ON app.agenda_koppeling;
CREATE POLICY agenda_koppeling_eigen ON app.agenda_koppeling
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS agenda_abonnement_eigen ON app.agenda_abonnement;
CREATE POLICY agenda_abonnement_eigen ON app.agenda_abonnement
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS agenda_externe_gebeurtenis_eigen ON app.agenda_externe_gebeurtenis;
CREATE POLICY agenda_externe_gebeurtenis_eigen ON app.agenda_externe_gebeurtenis
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
