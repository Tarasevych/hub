-- 0078: de site wordt ook MCP-KLANT (opdracht van de eigenaar, 20.10.2026: «досить кнопок-пустушок»).
--
-- Tot nu was Mijn Ruimte alleen MCP-SERVER: Claude koppelde aan ons. Zelf gingen we nooit naar een vreemde
-- MCP-server, waardoor het adres op de GitHub-kaart (https://api.githubcopilot.com/mcp/x/all) alleen tekst was
-- om te kopiëren naar een ander programma. Nu praat de server zelf het protocol (backend/mcp-klant/*), en die
-- verbindingen horen per gebruiker in de database:
--
--   app.externe_mcp_verbinding   één rij per vreemde MCP-server van één gebruiker: het adres (alleen https), de
--                                naam, de RUIMTE waarin hij hoort (privé of technisch — die worden nooit
--                                gemengd, shared/ai-ruimte.ts), de manier van aanmelden, en de NAAM van de
--                                sleutel in de eigen kluis (app.records → owner_vault_v1). Het token zelf staat
--                                hier NOOIT: alleen de verwijzing. Verder de feiten van de laatste poging: welk
--                                vervoer en welke protocolversie de server bleek te spreken, wat hij over
--                                zichzelf zei, wanneer het voor het laatst lukte of mislukte en met welke code.
--   app.externe_mcp_hulpmiddel   het gekeurde geheugen van `tools/list`: per hulpmiddel de naam, titel,
--                                beschrijving en het invoerschema van de VREEMDE server. Dat is onbetrouwbare
--                                inhoud: de tekst is opgeschoond en wordt aan de AI altijd met een markering
--                                aangeboden (shared/mcp-klant-model.ts → externeBeschrijving). `aan` is de
--                                keuze van de gebruiker per hulpmiddel; `alleen_lezen` is slechts de HINT van
--                                de vreemde server en bepaalt alleen de standaard, nooit of er bevestigd wordt.
--
-- De stand op de pagina komt uit DEZE feiten, niet uit een catalogus: een verbinding is pas «klaar» als er een
-- echte `initialize` is gelukt.
--
-- Alles per gebruiker en onder RLS, net als 0076. Idempotent.

CREATE TABLE IF NOT EXISTS app.externe_mcp_verbinding (
  user_id            text        NOT NULL,
  id                 text        NOT NULL CHECK (length(id) BETWEEN 8 AND 120),
  naam               text        NOT NULL DEFAULT '' CHECK (length(naam) <= 200),
  -- Alleen https. backend/mcp-klant/klant.ts controleert het nog eens met de zuivere functie uit shared/
  -- (veiligMcpAdres) én tegen de witte lijst van de eigenaar; hier staat het ook in de database, als derde hek.
  adres              text        NOT NULL CHECK (adres ~ '^https://' AND length(adres) <= 2000),
  ruimte             text        NOT NULL DEFAULT 'prive' CHECK (ruimte IN ('prive', 'technisch')),
  auth_wijze         text        NOT NULL DEFAULT 'geen' CHECK (auth_wijze IN ('geen', 'bearer', 'oauth')),
  -- Naam van de sleutel in de eigen kluis (owner_vault_v1). Nooit de waarde.
  sleutel_naam       text        NOT NULL DEFAULT '' CHECK (length(sleutel_naam) <= 80),
  vervoer            text        NOT NULL DEFAULT 'onbekend' CHECK (vervoer IN ('onbekend', 'streamable', 'sse')),
  protocol_versie    text        NOT NULL DEFAULT '' CHECK (protocol_versie ~ '^[0-9-]{0,12}$'),
  server_naam        text        NOT NULL DEFAULT '' CHECK (length(server_naam) <= 200),
  server_versie      text        NOT NULL DEFAULT '' CHECK (length(server_versie) <= 80),
  -- Wat de server zei dat hij kan (tools / resources / prompts / logging …), zoals ontvangen maar begrensd.
  mogelijkheden      jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(mogelijkheden) = 'object' AND pg_column_size(mogelijkheden) <= 8192),
  instructies        text        NOT NULL DEFAULT '' CHECK (length(instructies) <= 2000),
  actief             boolean     NOT NULL DEFAULT true,
  staat              text        NOT NULL DEFAULT 'nieuw' CHECK (staat IN ('nieuw', 'bezig', 'klaar', 'fout')),
  fout               text        NOT NULL DEFAULT '' CHECK (fout ~ '^[A-Z0-9_]{0,60}$'),
  laatst_ok_op       timestamptz,
  laatst_fout_op     timestamptz,
  tools_bijgewerkt_op timestamptz,
  aantal_tools       integer     NOT NULL DEFAULT 0 CHECK (aantal_tools >= 0),
  aangemaakt_op      timestamptz NOT NULL DEFAULT now(),
  bijgewerkt_op      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
-- Eén keer hetzelfde adres per gebruiker: anders staat dezelfde server er twee keer in.
CREATE UNIQUE INDEX IF NOT EXISTS externe_mcp_verbinding_adres_idx ON app.externe_mcp_verbinding (user_id, adres);
CREATE INDEX IF NOT EXISTS externe_mcp_verbinding_ruimte_idx ON app.externe_mcp_verbinding (user_id, ruimte) WHERE actief;

CREATE TABLE IF NOT EXISTS app.externe_mcp_hulpmiddel (
  user_id        text        NOT NULL,
  verbinding_id  text        NOT NULL CHECK (length(verbinding_id) BETWEEN 8 AND 120),
  -- De naam zoals de vreemde server hem geeft (MCP staat letters, cijfers, punt, streepje en liggend streepje toe).
  naam           text        NOT NULL CHECK (naam ~ '^[A-Za-z0-9_.-]{1,120}$'),
  titel          text        NOT NULL DEFAULT '' CHECK (length(titel) <= 200),
  -- Onbetrouwbare tekst van de vreemde server: opgeschoond en begrensd opgeslagen, nooit als instructie gebruikt.
  beschrijving   text        NOT NULL DEFAULT '' CHECK (length(beschrijving) <= 4000),
  invoer_schema  jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(invoer_schema) = 'object' AND pg_column_size(invoer_schema) <= 8192),
  -- Alleen de HINT van de vreemde server (annotations.readOnlyHint): bepaalt de standaardmodus, nooit de bevestiging.
  alleen_lezen   boolean     NOT NULL DEFAULT false,
  destructief    boolean     NOT NULL DEFAULT false,
  -- De keuze van de gebruiker per hulpmiddel: uit staat betekent dat de AI het niet eens ziet.
  aan            boolean     NOT NULL DEFAULT true,
  gezien_op      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, verbinding_id, naam)
);
CREATE INDEX IF NOT EXISTS externe_mcp_hulpmiddel_verbinding_idx ON app.externe_mcp_hulpmiddel (user_id, verbinding_id);

ALTER TABLE app.externe_mcp_verbinding ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.externe_mcp_hulpmiddel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS externe_mcp_verbinding_eigen ON app.externe_mcp_verbinding;
CREATE POLICY externe_mcp_verbinding_eigen ON app.externe_mcp_verbinding
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
DROP POLICY IF EXISTS externe_mcp_hulpmiddel_eigen ON app.externe_mcp_hulpmiddel;
CREATE POLICY externe_mcp_hulpmiddel_eigen ON app.externe_mcp_hulpmiddel
  USING (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())
  WITH CHECK (current_user::text <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker());
