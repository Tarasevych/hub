-- 0204 — APPARAAT-001 (09.11.2026): «Підтвердження з іншого пристрою» — bevestigen vanaf een ander, al aangemeld apparaat
-- (zelfde drie symbolen op beide schermen, één uitgelicht op het vragende apparaat; één poging; aftelling; «Ні» wint).
-- Ook: Telegram als methode voor de klassieke step-up (dienst «stap-op») en symboolknoppen in de Telegram-kaart.
--
-- Schrijven en lezen ALLEEN via de systeemrol (zelfde patroon als 0202): de snelle stroom (SSE, server/start.ts) loopt buiten de
-- router en heeft geen gebruikerscontext voor RLS; de autorisatie zit in de code (eigen user_id + sessie op elke route,
-- backend/apparaat-bevestiging/kern.ts). Geen enkele tabel bevat een geheim: alleen indexen in een symboolcatalogus en standen.
-- Terugdraaien (alleen met de vlag UIT en na een reservekopie): deploy/apparaat-bevestiging-terugdraaien.sql.
-- Herhaalbaar (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- Vlag: standaard AAN (geen botsleutel of extern systeem nodig; de beheerder heeft daarnaast een noodschakelaar in de instellingen).
-- Прапорець типово УВІМКНЕНО; у адміністратора є окремий аварійний вимикач. omschrijving ≤ 300 tekens (CHECK in 0038).
INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('apparaat-bevestiging-v1',
  'Підтвердження з іншого пристрою: ті самі символи на обох екранах, одна спроба, відлік; Telegram як спосіб step-up. | Bevestigen vanaf een ander apparaat: dezelfde symbolen op beide schermen, één poging, aftelling; Telegram als step-up.',
  true, true)
ON CONFLICT (sleutel) DO NOTHING;

-- Verzoeken: één rij per vraag «Це ви?». Stand-woorden gelijk aan app.tg_bevestigingen zodat de poort ze samen leest.
CREATE TABLE IF NOT EXISTS app.bevestigingen_apparaat (
  id             text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{12}$'),
  user_id        text        NOT NULL,
  -- vragend apparaat A: de sessie waarvoor de step-up gaat gelden (tabsessie of anker), het anker (= de browser) en het tabblad
  sessie_a       text        NOT NULL CHECK (length(sessie_a) BETWEEN 8 AND 80),
  anker_a        text        NOT NULL DEFAULT '' CHECK (length(anker_a) <= 80),
  tab_hash_a     text        NOT NULL DEFAULT '' CHECK (length(tab_hash_a) <= 80),
  -- actie = handeling in de bevestigingstabel ('stap-op' of een bewaakte handeling); label = wat de gebruiker eigenlijk deed
  -- (bv. 'passkey-toevoegen'), alleen voor de tekst op het andere apparaat
  actie          text        NOT NULL CHECK (actie ~ '^[a-z][a-z0-9-]{1,40}$'),
  label          text        NOT NULL DEFAULT '' CHECK (label = '' OR label ~ '^[a-z][a-z0-9-]{1,40}$'),
  dienst         text        NOT NULL DEFAULT '' CHECK (length(dienst) <= 20),
  gevoelig       boolean     NOT NULL DEFAULT false,
  apparaat_a     text        NOT NULL DEFAULT '' CHECK (length(apparaat_a) <= 40),
  regio_a        text        NOT NULL DEFAULT '' CHECK (length(regio_a) <= 120),
  set_versie     text        NOT NULL DEFAULT 'v1' CHECK (length(set_versie) <= 8),
  soort          text        NOT NULL CHECK (soort IN ('pictogrammen','cijfers','letters')),
  kandidaten     smallint[]  NOT NULL,
  juist          smallint    NOT NULL CHECK (juist BETWEEN 0 AND 4),
  aftel_sec      integer     NOT NULL DEFAULT 5 CHECK (aftel_sec BETWEEN 0 AND 120),
  stand          text        NOT NULL DEFAULT 'wacht' CHECK (stand IN ('wacht','bevestigd','geweigerd','verlopen','gebruikt','ingetrokken')),
  -- bevestigend apparaat B
  methode_b      text        NOT NULL DEFAULT '' CHECK (methode_b IN ('', 'passkey', 'totp')),
  sessie_b       text        NOT NULL DEFAULT '' CHECK (length(sessie_b) <= 80),
  apparaat_b     text        NOT NULL DEFAULT '' CHECK (length(apparaat_b) <= 40),
  reden          text        NOT NULL DEFAULT '' CHECK (length(reden) <= 40),
  aangemaakt_op  timestamptz NOT NULL DEFAULT now(),
  verloopt_op    timestamptz NOT NULL,
  bevestigd_op   timestamptz,
  afgerond_op    timestamptz,
  CONSTRAINT bevestigingen_apparaat_kort CHECK (verloopt_op <= aangemaakt_op + interval '6 minutes'),
  CONSTRAINT bevestigingen_apparaat_kandidaten CHECK (array_length(kandidaten, 1) BETWEEN 3 AND 5 AND juist < array_length(kandidaten, 1))
);
CREATE INDEX IF NOT EXISTS bevestigingen_apparaat_open ON app.bevestigingen_apparaat (user_id, verloopt_op) WHERE stand = 'wacht';
CREATE INDEX IF NOT EXISTS bevestigingen_apparaat_sessie ON app.bevestigingen_apparaat (user_id, sessie_a, actie) WHERE stand = 'bevestigd';
CREATE INDEX IF NOT EXISTS bevestigingen_apparaat_recent ON app.bevestigingen_apparaat (user_id, aangemaakt_op DESC);

-- Instellingen van de beheerder: 'actief' + 'vorige' (ongedaan maken), zelfde vorm als app.tg_instellingen.
CREATE TABLE IF NOT EXISTS app.apparaat_instellingen (
  id           text PRIMARY KEY CHECK (id IN ('actief','vorige')),
  waarde       jsonb       NOT NULL,
  gewijzigd_op timestamptz NOT NULL DEFAULT now(),
  door         text        NOT NULL DEFAULT ''
);

-- Keuzes van de gebruiker + de teller van verkeerde symbolen (zelfde regels als de geheime code: pauze, daarna uit tot herstel).
CREATE TABLE IF NOT EXISTS app.apparaat_voorkeuren (
  user_id       text PRIMARY KEY,
  waarde        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  mislukt       integer     NOT NULL DEFAULT 0,
  pauze_tot     timestamptz,
  uitgeschakeld boolean     NOT NULL DEFAULT false,
  reden         text        NOT NULL DEFAULT '' CHECK (length(reden) <= 40),
  gewijzigd_op  timestamptz NOT NULL DEFAULT now()
);

-- Telegram-kaart van de dienst «stap-op» met drie symboolknoppen (TELEGRAM-001 bouwde alleen «Так, це я»): de trekking staat bij
-- het Telegram-verzoek zelf, zodat de webhook de tik kan nakijken zonder tweede tabel.
ALTER TABLE app.tg_bevestigingen ADD COLUMN IF NOT EXISTS soort text CHECK (soort IS NULL OR soort IN ('pictogrammen','cijfers','letters'));
ALTER TABLE app.tg_bevestigingen ADD COLUMN IF NOT EXISTS kandidaten smallint[];
ALTER TABLE app.tg_bevestigingen ADD COLUMN IF NOT EXISTS juist smallint CHECK (juist IS NULL OR juist BETWEEN 0 AND 4);
