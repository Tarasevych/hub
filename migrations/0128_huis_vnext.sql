-- 0128 — Huis vNext (28.10.2026): het DOMEINMODEL van het slimme huis (huis.tarasevych.com), fase P1 «foundation».
--
-- Vandaag is huis.* een informatieve pagina zonder gegevens (src/DomoticaWeergave.tsx). Deze migratie legt de tabellen van
-- Huis Core: woningen met leden, ruimtes (verdiepingen/kamers met een eenvoudige plattegrond), integraties (adapters, geheim
-- versleuteld), apparaten met mogelijkheden (capabilities), WAARGENOMEN toestanden met tijdstempel en kwaliteit, opdrachten met
-- een toestandsmachine (verzocht → aanvaard → verzonden → bevestigd → waargenomen → voltooid | geweigerd/verlopen/mislukt/offline),
-- scènes, automatiseringen (concept/simulatie), gebeurtenissen en voorstellen van een AI (nooit uitvoering).
--
-- RLS: een rij hoort bij een WONING; wie lid is van de woning (app.huis_leden) ziet haar. Voor mijnruimte_app geldt dat altijd,
-- zoals 0019/0127 (app.huidige_gebruiker()). Geen rij toont ooit een verzonnen toestand: zonder integratie zijn er geen apparaten.
-- De vlag `huis-vnext` komt erbij, standaard UIT: zonder vlag precies de oude pagina. Idempotent.

CREATE TABLE IF NOT EXISTS app.huis_woningen (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        NOT NULL,                      -- eigenaar
  naam         text        NOT NULL CHECK (length(naam) BETWEEN 1 AND 80),
  tijdzone     text        NOT NULL DEFAULT 'Europe/Brussels' CHECK (length(tijdzone) <= 64),
  taal         text        NOT NULL DEFAULT 'uk' CHECK (taal IN ('uk', 'nl')),
  verdiepingen jsonb       NOT NULL DEFAULT '[{"id":"0","naam":"Begane grond"}]'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.huis_leden (
  woning_id    uuid        NOT NULL REFERENCES app.huis_woningen (id) ON DELETE CASCADE,
  user_id      text        NOT NULL,
  rol          text        NOT NULL DEFAULT 'lid' CHECK (rol IN ('eigenaar', 'lid', 'gast', 'installateur', 'ondersteuning')),
  geldig_tot   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (woning_id, user_id)
);
CREATE INDEX IF NOT EXISTS huis_leden_user_idx ON app.huis_leden (user_id);

CREATE TABLE IF NOT EXISTS app.huis_ruimtes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  woning_id    uuid        NOT NULL REFERENCES app.huis_woningen (id) ON DELETE CASCADE,
  verdieping   text        NOT NULL DEFAULT '0',
  naam         text        NOT NULL CHECK (length(naam) BETWEEN 1 AND 60),
  soort        text        NOT NULL DEFAULT 'kamer',
  geometrie    jsonb       NOT NULL DEFAULT '{"x":0,"y":0,"w":4,"h":3}'::jsonb,
  volgorde     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS huis_ruimtes_woning_idx ON app.huis_ruimtes (woning_id, verdieping, volgorde);

CREATE TABLE IF NOT EXISTS app.huis_integraties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  woning_id       uuid        NOT NULL REFERENCES app.huis_woningen (id) ON DELETE CASCADE,
  soort           text        NOT NULL CHECK (soort IN ('home-assistant')),
  naam            text        NOT NULL CHECK (length(naam) BETWEEN 1 AND 80),
  adres           text        NOT NULL CHECK (length(adres) <= 500),
  geheim          text        NOT NULL DEFAULT '',                -- AES-256-GCM-envelop (server/platform/beveiliging.ts), nooit platte tekst
  stand           text        NOT NULL DEFAULT 'geconfigureerd' CHECK (stand IN ('niet_geinstalleerd', 'geconfigureerd', 'verbindt', 'verbonden', 'verzwakt', 'geweigerd')),
  schrijven       boolean     NOT NULL DEFAULT false,             -- aparte toestemming om opdrachten te sturen
  laatste_sync    timestamptz,
  hartslag        timestamptz,
  fout            text        NOT NULL DEFAULT '',
  info            jsonb       NOT NULL DEFAULT '{}'::jsonb,       -- versie, locatienaam, aantallen — nooit geheimen
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS huis_integraties_woning_idx ON app.huis_integraties (woning_id);

CREATE TABLE IF NOT EXISTS app.huis_apparaten (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  woning_id       uuid        NOT NULL REFERENCES app.huis_woningen (id) ON DELETE CASCADE,
  integratie_id   uuid        REFERENCES app.huis_integraties (id) ON DELETE CASCADE,
  bron_id         text        NOT NULL,                           -- id bij de bron (bv. HA entity_id)
  naam            text        NOT NULL CHECK (length(naam) <= 120),
  soort           text        NOT NULL DEFAULT 'onbekend',         -- light, switch, sensor, binary_sensor, climate, cover, lock, …
  fabrikant       text        NOT NULL DEFAULT '',
  model           text        NOT NULL DEFAULT '',
  firmware        text        NOT NULL DEFAULT '',
  ruimte_id       uuid        REFERENCES app.huis_ruimtes (id) ON DELETE SET NULL,
  mogelijkheden   jsonb       NOT NULL DEFAULT '[]'::jsonb,       -- [{soort, lezen, schrijven, eenheid, bereik, kritiek}]
  kritiek         boolean     NOT NULL DEFAULT false,
  online          boolean,
  laatst_gezien   timestamptz,
  verborgen       boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (woning_id, integratie_id, bron_id)
);
CREATE INDEX IF NOT EXISTS huis_apparaten_woning_idx ON app.huis_apparaten (woning_id, soort);

CREATE TABLE IF NOT EXISTS app.huis_toestanden (
  apparaat_id     uuid        NOT NULL REFERENCES app.huis_apparaten (id) ON DELETE CASCADE,
  woning_id       uuid        NOT NULL REFERENCES app.huis_woningen (id) ON DELETE CASCADE,
  kenmerk         text        NOT NULL,                           -- 'aan', 'helderheid', 'temperatuur', 'open', 'vergrendeld', 'meting', …
  waarde          jsonb,
  eenheid         text        NOT NULL DEFAULT '',
  waargenomen_op  timestamptz,                                    -- tijd bij de bron (last_changed)
  ontvangen_op    timestamptz NOT NULL DEFAULT now(),
  kwaliteit       text        NOT NULL DEFAULT 'gemeten' CHECK (kwaliteit IN ('gemeten', 'geschat', 'onbekend', 'onbeschikbaar')),
  versie          bigint      NOT NULL DEFAULT 1,
  PRIMARY KEY (apparaat_id, kenmerk)
);
CREATE INDEX IF NOT EXISTS huis_toestanden_woning_idx ON app.huis_toestanden (woning_id, kenmerk);

CREATE TABLE IF NOT EXISTS app.huis_opdrachten (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  woning_id           uuid        NOT NULL REFERENCES app.huis_woningen (id) ON DELETE CASCADE,
  user_id             text        NOT NULL,                       -- wie vroeg (mens) of namens wie (AI via voorstel)
  via                 text        NOT NULL DEFAULT 'site' CHECK (via IN ('site', 'scene', 'automatisering', 'ai-voorstel')),
  apparaat_id         uuid        REFERENCES app.huis_apparaten (id) ON DELETE SET NULL,
  mogelijkheid        text        NOT NULL,
  verzocht            jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- gewenste toestand
  idempotentie        text        NOT NULL,
  correlatie          text        NOT NULL DEFAULT '',
  stand               text        NOT NULL DEFAULT 'verzocht' CHECK (stand IN ('verzocht', 'wacht_op_goedkeuring', 'aanvaard', 'verzonden', 'bevestigd', 'waargenomen', 'voltooid', 'geweigerd', 'verlopen', 'mislukt', 'gedeeltelijk', 'offline')),
  beleid              jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- besluit: kritiek, step-up, schrijfrecht
  fout                text        NOT NULL DEFAULT '',
  uitkomst            jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- waargenomen toestand na ACK
  deadline            timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (woning_id, idempotentie)
);
CREATE INDEX IF NOT EXISTS huis_opdrachten_woning_idx ON app.huis_opdrachten (woning_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.huis_scenes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  woning_id    uuid        NOT NULL REFERENCES app.huis_woningen (id) ON DELETE CASCADE,
  naam         text        NOT NULL CHECK (length(naam) BETWEEN 1 AND 80),
  icoon        text        NOT NULL DEFAULT 'sparkles',
  favoriet     boolean     NOT NULL DEFAULT false,
  stappen      jsonb       NOT NULL DEFAULT '[]'::jsonb,          -- [{apparaatId, mogelijkheid, waarde}]
  laatste_run  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.huis_automatiseringen (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  woning_id    uuid        NOT NULL REFERENCES app.huis_woningen (id) ON DELETE CASCADE,
  naam         text        NOT NULL CHECK (length(naam) BETWEEN 1 AND 80),
  regel        jsonb       NOT NULL DEFAULT '{}'::jsonb,          -- {wanneer:[], als:[], dan:[], instellingen:{}}
  stand        text        NOT NULL DEFAULT 'concept' CHECK (stand IN ('concept', 'simulatie', 'aan', 'gepauzeerd', 'fout')),
  versie       integer     NOT NULL DEFAULT 1,
  laatste_run  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.huis_gebeurtenissen (
  id            bigserial   PRIMARY KEY,
  woning_id     uuid        NOT NULL REFERENCES app.huis_woningen (id) ON DELETE CASCADE,
  bron          text        NOT NULL DEFAULT 'site',              -- site, home-assistant, scene, automatisering, ai
  soort         text        NOT NULL,                             -- opdracht, toestand, integratie, scene, automatisering, voorstel, beveiliging
  ernst         text        NOT NULL DEFAULT 'info' CHECK (ernst IN ('info', 'belangrijk', 'kritiek')),
  apparaat_id   uuid,
  opdracht_id   uuid,
  bericht       text        NOT NULL DEFAULT '',
  gegevens      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  bron_tijd     timestamptz,
  ontvangen_op  timestamptz NOT NULL DEFAULT now(),
  correlatie    text        NOT NULL DEFAULT '',
  privacy       text        NOT NULL DEFAULT 'huishouden'
);
CREATE INDEX IF NOT EXISTS huis_gebeurtenissen_woning_idx ON app.huis_gebeurtenissen (woning_id, id DESC);

CREATE TABLE IF NOT EXISTS app.huis_voorstellen (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  woning_id     uuid        NOT NULL REFERENCES app.huis_woningen (id) ON DELETE CASCADE,
  door          text        NOT NULL DEFAULT 'ai',                -- agent/klant
  user_id       text        NOT NULL,                             -- voor wie het voorstel is (goedkeurder)
  samenvatting  text        NOT NULL CHECK (length(samenvatting) <= 500),
  opdracht      jsonb       NOT NULL DEFAULT '{}'::jsonb,         -- {apparaatId, mogelijkheid, waarde}
  stand         text        NOT NULL DEFAULT 'wacht' CHECK (stand IN ('wacht', 'goedgekeurd', 'afgewezen', 'verlopen')),
  verloopt_op   timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  besluit_op    timestamptz,
  opdracht_id   uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------------------------ RLS: lid van de woning
DO $huis_rls$
DECLARE t text;
BEGIN
  ALTER TABLE app.huis_woningen ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS huis_woningen_lid ON app.huis_woningen;
  CREATE POLICY huis_woningen_lid ON app.huis_woningen
    USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker() OR EXISTS (SELECT 1 FROM app.huis_leden l WHERE l.woning_id = huis_woningen.id AND l.user_id = app.huidige_gebruiker()))
    WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
  ALTER TABLE app.huis_leden ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS huis_leden_lid ON app.huis_leden;
  CREATE POLICY huis_leden_lid ON app.huis_leden
    USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker() OR EXISTS (SELECT 1 FROM app.huis_woningen w WHERE w.id = huis_leden.woning_id AND w.user_id = app.huidige_gebruiker()))
    WITH CHECK (current_user::text <> 'mijnruimte_app' OR EXISTS (SELECT 1 FROM app.huis_woningen w WHERE w.id = huis_leden.woning_id AND w.user_id = app.huidige_gebruiker()));
  FOREACH t IN ARRAY ARRAY['huis_ruimtes', 'huis_integraties', 'huis_apparaten', 'huis_toestanden', 'huis_opdrachten', 'huis_scenes', 'huis_automatiseringen', 'huis_gebeurtenissen', 'huis_voorstellen'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON app.%I', t || '_lid', t);
    EXECUTE format($p$CREATE POLICY %I ON app.%I
      USING (current_user::text <> 'mijnruimte_app' OR EXISTS (SELECT 1 FROM app.huis_leden l WHERE l.woning_id = %I.woning_id AND l.user_id = app.huidige_gebruiker()))
      WITH CHECK (current_user::text <> 'mijnruimte_app' OR EXISTS (SELECT 1 FROM app.huis_leden l WHERE l.woning_id = %I.woning_id AND l.user_id = app.huidige_gebruiker()))$p$, t || '_lid', t, t, t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.huis_woningen, app.huis_leden, app.huis_ruimtes, app.huis_integraties, app.huis_apparaten, app.huis_toestanden, app.huis_opdrachten, app.huis_scenes, app.huis_automatiseringen, app.huis_gebeurtenissen, app.huis_voorstellen TO mijnruimte_app;
    GRANT USAGE, SELECT ON SEQUENCE app.huis_gebeurtenissen_id_seq TO mijnruimte_app;
  END IF;
END
$huis_rls$;

INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)
VALUES ('huis-vnext',
  'Новий «Розумний будинок»: кімнати, пристрої, сцени, автоматизації, інтеграції (Home Assistant), події. Nieuw slim huis. Стани лише з підтверджених джерел.',
  false, false)
ON CONFLICT (sleutel) DO NOTHING;
