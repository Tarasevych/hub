> 🌐 **Taal / Мова:** [Українська](ЄДИНИЙ-ШЛЯХ-ЗЄДНУВАЧА.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Eén connectoradres per AI — wat er op de server moet gebeuren (20.10.2026)

Tot nu toe: `https://mcp.tarasevych.com/ai/<agent>` voor connector v2, `…/mcp` voor de koppeling van vóór v2, en de korte paden
`/claude`, `/grok`, `/chatgpt`, `/gemini`, `/copilot` voor de MCP-**deur** (een apart proces, `deploy/mcp/server.mjs`, poort 8091).
Drie «deuren» naar hetzelfde huis.

Vanaf nu: **één adres per agent, bediend door de hoofdapp**:

```
https://mcp.tarasevych.com/claude
https://mcp.tarasevych.com/gpt
https://mcp.tarasevych.com/grok
https://mcp.tarasevych.com/gemini
https://mcp.tarasevych.com/copilot
https://mcp.tarasevych.com/cursor
```

En de rechten zitten niet meer in het adres: de connector toont zowel de privé- als de technische hulpmiddelen, en bij **elke**
`tools/list` en `tools/call` berekent de server opnieuw wat er op dat moment bestaat (eigenaar + actief technisch profiel →
`backend/ai-ruimte-poort.ts`, `effectieveRuimte`). Technische toegang verdwijnt dus op het moment dat u het profiel verlaat.

> `/gpt` is het adres van ChatGPT. De deur heette `/chatgpt`; dat pad is nooit een v2-adres geweest en wordt er ook geen.

---

## 1. Cloudflare Tunnel (`/etc/cloudflared/config.yml`)

Het sjabloon in `deploy/cloudflared-config.yml` is al bijgewerkt. Neem de blokken voor `mcp.tarasevych.com` daaruit over. De
regels worden van boven naar beneden gematcht, dus de volgorde is de helft van het werk:

```yaml
  # Alleen nog de eigen OAuth en gezondheid van de deur gaan naar 8091 …
  - hostname: mcp.tarasevych.com
    path: ^/(oauth|health)(/|$)
    service: http://127.0.0.1:8091
  # … al het andere naar de hoofdapp: /claude /gpt /grok /gemini /copilot /cursor, /mcp, /oauth2/*, /.well-known/*, de schermen, /api/*.
  - hostname: mcp.tarasevych.com
    service: http://127.0.0.1:8080
```

Wat er verdwijnt is de oude regel

```yaml
    path: ^/((?i:grok|claude|chatgpt|gemini|copilot)|oauth|health|\.well-known)(/|$)
    service: http://127.0.0.1:8091
```

Zolang die regel bestaat komt `POST /claude` bij de **deur** en niet bij de app: het nieuwe adres geeft dan de antwoorden van de
deur en de koppeling mislukt. De aparte `.well-known`-regel naar 8080 is niet meer nodig (alles valt nu onder de laatste regel).

Toepassen zonder de tunnel te verliezen:

```bash
sudo cloudflared tunnel ingress validate            # eerst controleren
sudo systemctl reload cloudflared || sudo systemctl restart cloudflared
```

Controle (van buiten, met een geldig token van een bestaande koppeling):

```bash
# 1. nieuw adres: 401 met de metadata-pointer naar /claude/.well-known/…
curl -si -X POST https://mcp.tarasevych.com/claude -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | head -20

# 2. oud adres: 308 (NIET 301/302) naar /claude, methode en body blijven
curl -si -X POST https://mcp.tarasevych.com/ai/claude -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | head -5

# 3. metadata in beide vormen
curl -s https://mcp.tarasevych.com/claude/.well-known/oauth-protected-resource
curl -s https://mcp.tarasevych.com/.well-known/oauth-protected-resource/claude
```

## 2. De deur (`mijn-ruimte-mcp.service`, poort 8091)

De deur doet niets meer wat de app niet beter doet; haar enige reden om te blijven draaien zijn **bestaande deur-verbindingen**
(`/oauth/*`, zichtbaar op mcp.*/verbindingen → «Tokens en deuren»). Stappenplan:

```bash
# a) kijken of er nog iets van de deur gebruikt wordt
sudo journalctl -u mijn-ruimte-mcp --since '7 days ago' | grep -c ' /oauth/'

# b) elke deurverbinding intrekken op de site (mcp.* → Technische verbindingen → Tokens en deuren → «Intrekken»),
#    of in één keer alles wat de deur ooit uitgaf:
sudo sh -c 'date +%s%3N > /etc/mijn-ruimte/mcp-intrekken'

# c) daarna de dienst stoppen en uitzetten
sudo systemctl disable --now mijn-ruimte-mcp
sudo systemctl is-enabled mijn-ruimte-mcp   # → disabled
```

Is de dienst uit, haal dan ook de `^/(oauth|health)` -regel uit de tunnelconfig weg en herlaad `cloudflared`. De app antwoordt dan
404 op `/oauth/*`; `/oauth2/*` (de OAuth van de app zelf) blijft ongemoeid — let op het verschil van die ene **2**.

`deploy/mcp/server.mjs` en `deploy/mcp/mijn-ruimte-mcp.service` blijven in het pakket staan zolang de BYOS-installatie de deur als
optie aanbiedt; ze worden alleen niet meer geactiveerd.

## 3. Wat NIET wordt omgeleid: `/mcp`

`/mcp` blijft bestaan en blijft de app. Daar hangen twee dingen aan die geen agent-slug hebben:

* OAuth-koppelingen van vóór connector v2 (`app.mcp_oauth_tokens` met `agent IS NULL`);
* de agenttokens van de site (`tvh_…`, «Handmatig verbinden», `app.mcp_console_tokens`).

Een 308 van `/mcp` naar `/claude` zou die allemaal een 401 geven, want een v2-adres accepteert alleen een token dat aan dat adres
gebonden is. `/mcp` krijgt daarom dezelfde **levende** rechtenberekening als de nieuwe adressen (een technische koppeling zonder
actief profiel toont niets en voert niets uit) en gaat pas weg als er geen zulke koppelingen meer zijn:

```sql
SELECT count(*) FROM app.mcp_oauth_tokens WHERE agent IS NULL AND revoked_at IS NULL AND refresh_expires_at > now();
SELECT count(*) FROM app.mcp_console_tokens WHERE revoked_at IS NULL AND expires_at > now();
```

Zijn beide 0, dan kan `/mcp` uit `CONNECTOR_PADEN` in `server/start.ts`.

## 4. Wat de gebruiker merkt

* Op mcp.*/agents → «Connectors» staat per AI **één** adres. Kopiëren en in de AI-client plakken, zoals altijd.
* Bestaande koppelingen op `/ai/<agent>` blijven werken (308) en hoeven niet opnieuw te worden gelegd.
* Toestemming geven vraagt **geen** actief technisch profiel meer. Wie technische hulpmiddelen aanvinkt, geeft ze «zolang mijn
  technische profiel actief is»; staat het profiel uit, dan staan die regels grijs met «momenteel niet beschikbaar» en ziet de AI ze niet.
* Zet de eigenaar het technische profiel aan of uit, dan is dat **meteen** zichtbaar in `tools/list` — zonder opnieuw verbinden.

---

## 5. Wat er op 20.10.2026 (avond) misging, en wat de deur sindsdien zelf doet

Na release 20261020-173704 koppelde de eigenaar Claude aan `https://mcp.tarasevych.com/claude` en kreeg **het oude deurvenster**
(«Lezen» + «Ondertekende release», kop «Technische ruimte … Geen e-mail, Drive of persoonlijke apparaten») en daarna een connector
met precies **elf** technische hulpmiddelen (`site_health … rollout_upload_finish`). Dat zijn de `TOOLS` van `deploy/mcp/server.mjs`:
het verzoek was dus bij de **deur** (poort 8091) beland, niet bij connector v2. Oorzaak: de tunnelregel uit §1 stond nog op de
server (`/etc/cloudflared/config.yml` zit niet in het uitrolpakket). Het venster, de rechten en de levende filtering van connector
v2 zijn nooit aan bod gekomen; er is dus ook geen grant «met alleen beheer» ontstaan — er is een **deurtoken** ontstaan.

Sinds deze release is dat niet meer mogelijk, ongeacht de tunnelregel:

* **De deur geeft agentadressen door aan de app.** `deploy/mcp/server.mjs` stuurt `/claude`, `/gpt`, `/grok`, `/gemini`, `/copilot`,
  `/cursor` (ook `/ai/<agent>` en de metadata eronder), `/.well-known/oauth-protected-resource/<agent|mcp>`, elke RFC 8414/OpenID-
  ontdekkingsvorm van de autorisatieserver van de app, `/oauth2/*` en `/mcp` één-op-één door naar `http://127.0.0.1:8080`
  (zelfde Host, koppen en body). De installer zet het nieuwe bestand neer en herstart `mijn-ruimte-mcp.service` (`try-restart`).
  Alleen `MCP_AGENTPADEN=deur` in de omgeving laat de deur die paden nog zelf bedienen (tests, noodgeval).
* **De deur geeft geen toestemming en geen token meer voor een agentadres**: `resource=https://mcp.…/claude` op `/oauth/authorize`
  van de deur → `invalid_target`. Een AI-klant die de OAuth van de deur nog onthield, loopt dus niet rond maar meldt zich opnieuw
  aan via de metadata van de app.
* **Het deurvenster zegt het eerlijk**: komt het venster «serverdeur» voor een agentadres, dan staat erbij dat dit de oude
  weg is, dat er via de deur nooit privéhulpmiddelen komen, en wat te doen (weigeren, tunnelregel bijwerken, opnieuw verbinden).

Wat de eigenaar na deze release moet doen:

1. In de AI-app (claude.ai → Connectors) de connector `mcp.tarasevych.com/claude` **verwijderen en opnieuw toevoegen** (of
   «Reconnect»): het deurtoken is waardeloos op de app en de app antwoordt er 401 op, waarna de klant opnieuw aanmeldt — nu via
   het v2-venster met **beide** ruimtes (privé én technisch) en rechten per hulpmiddel.
2. Toch §1 toepassen (tunnelregel), zodat de deur niet als onnodig tussenstation blijft draaien; daarna §2.
3. Op mcp.*/verbindingen → «Tokens en deuren» de oude deurverbinding van 20.10 intrekken.

## 6. Erfenis van `/mcp` en `tools/list_changed`

* Een token van het oude `/mcp` van **dezelfde** AI-klant werkt ook op `/<agent>` (`backend/connector-v2-erfenis.ts`): de kanten
  zijn de vereniging van wat de mens die AI op `/mcp` toestond (`ruimte` prive → gebruiker, technisch → beheer), de sleutels
  volgen de scopes van dat token. Geen migratie, geen nieuwe toestemming; de levende filtering is dezelfde als voor een v2-grant.
  Het v2-venster start met die erfenis aangevinkt als er nog geen v2-koppeling of onthouden keuze is.
* `GET /<agent>` met `Accept: text/event-stream` opent de SSE-stroom van Streamable HTTP (`backend/connector-v2-stroom.ts`).
  Daarover stuurt de server `notifications/tools/list_changed` zodra de levende staat (technisch profiel, dienst «ai», rol) de
  lijst verandert; `initialize` meldt `tools.listChanged: true`. Houdt de AI-app geen stroom open (claude.ai doet dat op dit
  moment niet), dan verandert er niets aan de rechten — alleen de lijst in dat gesprek is verouderd tot een nieuw gesprek of
  «Opnieuw verbinden»; de pagina Agenten → Connectors zegt dat.
