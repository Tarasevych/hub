-- 0202 — TELEGRAM-AANMELDEN v1: eigen tabellen. Schrijven en lezen ALLEEN via de systeemrol (de webhook van Telegram heeft geen
-- gebruikerscontext); mijnruimte_app krijgt geen rechten (zelfde patroon als 0192). De autorisatie zit in de code
-- (backend/telegram-aanmelden/*: sessie + eigen user_id + centrale beleidsfunctie). Geen enkele tabel bevat een geheim in
-- platte vorm: de botsleutel staat in de versleutelde kluis van de eigenaar, de geheime code alleen als Argon2id/scrypt-hash,
-- verzoekgeheimen alleen als SHA-256.
-- Terugdraaien (alleen als de vlag uit staat): DROP TABLE app.tg_* (zie deploy/telegram-aanmelden-terugdraaien.sql).

-- Koppelingen: één rij per (account, Telegram). Uitgeschakelde rijen blijven als spoor; actief/gepauzeerd/geblokkeerd uniek.
CREATE TABLE IF NOT EXISTS app.tg_koppelingen (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text        NOT NULL,
  telegram_id        text        NOT NULL CHECK (telegram_id ~ '^[0-9]{1,20}$'),
  chat_id            text        NOT NULL CHECK (chat_id ~ '^-?[0-9]{1,20}$'),
  telefoon           text        NOT NULL DEFAULT '' CHECK (length(telefoon) <= 24),
  gebruikersnaam     text        NOT NULL DEFAULT '' CHECK (length(gebruikersnaam) <= 64),
  voornaam           text        NOT NULL DEFAULT '' CHECK (length(voornaam) <= 128),
  achternaam         text        NOT NULL DEFAULT '' CHECK (length(achternaam) <= 128),
  foto_id            text        NOT NULL DEFAULT '' CHECK (length(foto_id) <= 128),
  naam               text        NOT NULL DEFAULT '' CHECK (length(naam) <= 40),
  rechten            text[]      NOT NULL DEFAULT ARRAY['aanmelden','bevestigen','meldingen']::text[],
  stand              text        NOT NULL DEFAULT 'actief' CHECK (stand IN ('actief','gepauzeerd','geblokkeerd','uitgeschakeld')),
  kleur              smallint    NOT NULL DEFAULT 0 CHECK (kleur BETWEEN 0 AND 4),
  site_taal          text        NOT NULL DEFAULT 'uk' CHECK (site_taal IN ('uk','nl')),
  aangemaakt_op      timestamptz NOT NULL DEFAULT now(),
  laatst_gebruikt_op timestamptz,
  uitgeschakeld_op   timestamptz,
  reden              text        NOT NULL DEFAULT '' CHECK (length(reden) <= 80)
);
CREATE UNIQUE INDEX IF NOT EXISTS tg_koppelingen_levend ON app.tg_koppelingen (user_id, telegram_id) WHERE stand <> 'uitgeschakeld';
CREATE INDEX IF NOT EXISTS tg_koppelingen_telegram ON app.tg_koppelingen (telegram_id) WHERE stand <> 'uitgeschakeld';

-- Volledige geschiedenis van de vingerafdruk per koppeling (eigenaar en beheer zien alles, onverkort).
CREATE TABLE IF NOT EXISTS app.tg_vingerafdruk_historie (
  id           bigserial PRIMARY KEY,
  koppeling_id uuid        NOT NULL,
  veld         text        NOT NULL CHECK (veld IN ('telegramId','telefoon','gebruikersnaam','voornaam','achternaam','fotoId','apparaat')),
  oud          text        NOT NULL DEFAULT '',
  nieuw        text        NOT NULL DEFAULT '',
  op           timestamptz NOT NULL DEFAULT now(),
  uitkomst     text        NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS tg_vingerafdruk_historie_koppeling ON app.tg_vingerafdruk_historie (koppeling_id, op DESC);

-- Gedetecteerde wijzigingen die een antwoord vragen («Це ви змінили?»).
CREATE TABLE IF NOT EXISTS app.tg_wijzigingen (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  koppeling_id      uuid        NOT NULL,
  user_id           text        NOT NULL,
  ernst             text        NOT NULL CHECK (ernst IN ('vervalsing','ernstig','gewoon')),
  verschillen       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status            text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','gezien','bevestigd','geweigerd','verlopen')),
  telegram_antwoord text        CHECK (telegram_antwoord IN ('ja','nee')),
  site_antwoord     text        CHECK (site_antwoord IN ('ja','nee')),
  conflict          boolean     NOT NULL DEFAULT false,
  getoond_op        timestamptz,
  aangemaakt_op     timestamptz NOT NULL DEFAULT now(),
  afgehandeld_op    timestamptz
);
CREATE INDEX IF NOT EXISTS tg_wijzigingen_open ON app.tg_wijzigingen (user_id) WHERE status IN ('open','gezien');

-- Koppelverzoeken: alleen vanuit een ingelogde sitesessie; eenmalig, kort geldig.
CREATE TABLE IF NOT EXISTS app.tg_koppel_verzoeken (
  id            text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{12}$'),
  user_id       text        NOT NULL,
  sessie_id     text        NOT NULL,
  telegram_id   text        CHECK (telegram_id ~ '^[0-9]{1,20}$'),
  chat_id       text,
  telefoon      text,
  profiel       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  widget_id     text,
  binding_hash  text,
  stand         text        NOT NULL DEFAULT 'wacht-bot' CHECK (stand IN ('wacht-bot','wacht-telefoon','wacht-widget','wacht-passkey','klaar','verlopen','geweigerd','geannuleerd')),
  naam          text        NOT NULL DEFAULT '' CHECK (length(naam) <= 40),
  met_code      boolean     NOT NULL DEFAULT false,
  verloopt_op   timestamptz NOT NULL,
  aangemaakt_op timestamptz NOT NULL DEFAULT now()
);

-- Aanmeldverzoeken («Увійти через Telegram»): gebonden aan een bestaande eigenaartransactie van de site; geheim alleen als hash.
CREATE TABLE IF NOT EXISTS app.tg_inlog_verzoeken (
  id             text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{12}$'),
  geheim_hash    text        NOT NULL CHECK (geheim_hash ~ '^[0-9a-f]{64}$'),
  transactie_id  text        NOT NULL,
  apparaat       text        NOT NULL DEFAULT '' CHECK (length(apparaat) <= 80),
  telegram_id    text,
  user_id        text,
  koppeling_id   uuid,
  stand          text        NOT NULL DEFAULT 'wacht' CHECK (stand IN ('wacht','goedgekeurd','geweigerd','verlopen','ingewisseld')),
  code_nodig     boolean     NOT NULL DEFAULT false,
  code_ok        boolean     NOT NULL DEFAULT false,
  sessie_id      text        CHECK (sessie_id IS NULL OR length(sessie_id) <= 80),
  methode        text        NOT NULL DEFAULT 'bot' CHECK (methode IN ('bot','widget','miniapp')),
  -- waarom geweigerd (eerlijk op de site tonen): 'niet-ik' | 'passkey-nodig' | 'niet-gekoppeld' | 'gepauzeerd' | 'apparaat-geblokkeerd' | '' (algemeen; ook bij de alarmcode)
  reden          text        NOT NULL DEFAULT '' CHECK (reden IN ('','niet-ik','passkey-nodig','niet-gekoppeld','gepauzeerd','apparaat-geblokkeerd')),
  verloopt_op    timestamptz NOT NULL,
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  afgehandeld_op timestamptz
);

-- Bevestigingen van één handeling (Telegram-tik of geheime code), gebonden aan sessie + handeling; eenmalig verbruikt.
CREATE TABLE IF NOT EXISTS app.tg_bevestigingen (
  id            text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{12}$'),
  user_id       text        NOT NULL,
  sessie_id     text        NOT NULL,
  actie         text        NOT NULL CHECK (actie ~ '^[a-z][a-z0-9-]{1,40}$'),
  methode       text        NOT NULL CHECK (methode IN ('telegram','code')),
  koppeling_id  uuid,
  stand         text        NOT NULL DEFAULT 'wacht' CHECK (stand IN ('wacht','bevestigd','geweigerd','verlopen','gebruikt')),
  verloopt_op   timestamptz NOT NULL,
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  bevestigd_op  timestamptz
);
CREATE INDEX IF NOT EXISTS tg_bevestigingen_sessie ON app.tg_bevestigingen (user_id, sessie_id, actie) WHERE stand = 'bevestigd';

-- Knoppen onder berichten: eenmalig (stand nieuw → bezig → klaar in één atomische UPDATE).
CREATE TABLE IF NOT EXISTS app.tg_knoppen (
  id            text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{12}$'),
  letter        text        NOT NULL CHECK (letter ~ '^[a-z]$'),
  telegram_id   text        NOT NULL,
  doel          text        NOT NULL DEFAULT '',
  verloopt_sec  bigint      NOT NULL,
  stand         text        NOT NULL DEFAULT 'nieuw' CHECK (stand IN ('nieuw','bezig','klaar','vervallen')),
  groep         text        NOT NULL DEFAULT '',
  uitkomst      text        NOT NULL DEFAULT '',
  -- «Так»-knoppen werken pas na deze seconden (server-side aftelling; de knop toont «⏳ N с» tot dan)
  aftel_sec     integer     NOT NULL DEFAULT 0 CHECK (aftel_sec BETWEEN 0 AND 120),
  aangemaakt_op timestamptz NOT NULL DEFAULT now(),
  gebruikt_op   timestamptz
);
CREATE INDEX IF NOT EXISTS tg_knoppen_groep ON app.tg_knoppen (groep);

-- Idempotentie van de webhook (update_id) en eenmaligheid van widget-/Mini App-handtekeningen.
CREATE TABLE IF NOT EXISTS app.tg_updates (update_id bigint PRIMARY KEY, ontvangen_op timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app.tg_eenmalig (hash text PRIMARY KEY CHECK (hash ~ '^[0-9a-f]{64}$'), op timestamptz NOT NULL DEFAULT now());

-- Chatvoorkeur per Telegram-gebruiker (taal van de bot; verandert de taal van de site niet).
CREATE TABLE IF NOT EXISTS app.tg_chats (
  telegram_id  text PRIMARY KEY CHECK (telegram_id ~ '^[0-9]{1,20}$'),
  chat_id      text        NOT NULL,
  taal         text        CHECK (taal IN ('uk','nl')),
  laatste_op   timestamptz NOT NULL DEFAULT now(),
  pogingen     jsonb       NOT NULL DEFAULT '[]'::jsonb
);

-- Instellingen van de beheerder: 'actief' + 'vorige' (één minuut ongedaan maken).
CREATE TABLE IF NOT EXISTS app.tg_instellingen (
  id           text PRIMARY KEY CHECK (id IN ('actief','vorige')),
  waarde       jsonb       NOT NULL,
  gewijzigd_op timestamptz NOT NULL DEFAULT now(),
  door         text        NOT NULL DEFAULT '',
  ongedaan_tot timestamptz
);

-- Handelingen die de beheerder zonder nieuwe bouw toevoegt (aanvulling op de ingebouwde lijst in shared/telegram-aanmelden/beleid.ts).
CREATE TABLE IF NOT EXISTS app.tg_acties (
  sleutel       text PRIMARY KEY CHECK (sleutel ~ '^[a-z][a-z0-9-]{1,40}$'),
  naam_uk       text        NOT NULL CHECK (length(naam_uk) BETWEEN 2 AND 80),
  naam_nl       text        NOT NULL CHECK (length(naam_nl) BETWEEN 2 AND 80),
  minimum       text        NOT NULL,
  standaard     text        NOT NULL,
  gevoelig      boolean     NOT NULL DEFAULT false,
  aangemaakt_op timestamptz NOT NULL DEFAULT now()
);

-- Keuzes van de gebruiker in de bevestigingstabel.
CREATE TABLE IF NOT EXISTS app.tg_matrix (
  user_id      text PRIMARY KEY,
  keuzes       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  gewijzigd_op timestamptz NOT NULL DEFAULT now()
);

-- Geheime code: alleen hash (Argon2id of scrypt) met eigen zout + serverpeper; telling van mislukte pogingen.
CREATE TABLE IF NOT EXISTS app.tg_geheime_codes (
  user_id      text PRIMARY KEY,
  hash         text        NOT NULL CHECK (hash ~ '^(argon2id|scrypt)\$'),
  alarm_hash   text        CHECK (alarm_hash IS NULL OR alarm_hash ~ '^(argon2id|scrypt)\$'),
  mislukt      integer     NOT NULL DEFAULT 0,
  pauze_tot    timestamptz,
  uitgeschakeld boolean    NOT NULL DEFAULT false,
  reden        text        NOT NULL DEFAULT '',
  gewijzigd_op timestamptz NOT NULL DEFAULT now()
);

-- Statusdienst: stand per methode + tellingen.
CREATE TABLE IF NOT EXISTS app.tg_status (
  methode          text PRIMARY KEY CHECK (methode ~ '^[a-z][a-z0-9-]{1,30}$'),
  stand            text        NOT NULL DEFAULT 'onbekend' CHECK (stand IN ('werkt','traag','storing','onbekend','niet-ingesteld')),
  soort            text        NOT NULL DEFAULT '' CHECK (soort IN ('','tijdelijk','lang','vast')),
  oorzaak          text        NOT NULL DEFAULT '' CHECK (length(oorzaak) <= 120),
  sinds            timestamptz NOT NULL DEFAULT now(),
  laatste_controle timestamptz,
  automatisch_uit  boolean     NOT NULL DEFAULT false,
  reeks            jsonb       NOT NULL DEFAULT '[]'::jsonb
);

-- Gebeurtenissen voor de cijfers in «Огляд» (aanmeldingen/mislukkingen per dag/week/maand). Geen persoonsgegevens behalve user_id.
CREATE TABLE IF NOT EXISTS app.tg_gebeurtenissen (
  id      bigserial PRIMARY KEY,
  soort   text        NOT NULL CHECK (soort ~ '^[a-z][a-z0-9-]{1,40}$'),
  ok      boolean     NOT NULL,
  user_id text,
  op      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tg_gebeurtenissen_op ON app.tg_gebeurtenissen (op DESC);

-- Geblokkeerde apparaten na «Це не я» (grove sleutel, zoals app.bekende_apparaten).
CREATE TABLE IF NOT EXISTS app.tg_geblokkeerd (
  user_id text        NOT NULL,
  sleutel text        NOT NULL CHECK (length(sleutel) <= 80),
  op      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sleutel)
);

DO $tg$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tg_koppelingen','tg_vingerafdruk_historie','tg_wijzigingen','tg_koppel_verzoeken','tg_inlog_verzoeken','tg_bevestigingen',
    'tg_knoppen','tg_updates','tg_eenmalig','tg_chats','tg_instellingen','tg_acties','tg_matrix','tg_geheime_codes','tg_status','tg_gebeurtenissen','tg_geblokkeerd']
  LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$tg$;
