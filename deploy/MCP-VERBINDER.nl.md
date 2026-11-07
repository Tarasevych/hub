> 🌐 **Taal / Мова:** [Українська](ЗЄДНУВАЧ-ПРОТОКОЛУ-КОНТЕКСТУ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Mijn Ruimte-connector voor Claude (claude.ai → Customize → Connectors)

Hiermee koppelt u **uw eigen Claude-account** aan de site: Claude (vanuit de Anthropic-cloud) krijgt hulpmiddelen voor **uw eigen
apparaten** (pc, VM met agent) en uw GitHub-token. Elke geregistreerde gebruiker van de site meldt zich aan met zijn eigen account
en geeft uitsluitend toegang tot zijn eigen apparaten.

## Adres van de connector

```
https://mcp.tarasevych.com/mcp
```

MCP-server: Streamable HTTP (JSON-antwoorden). Authenticatie: **OAuth 2.x + PKCE (S256) + dynamische clientregistratie**.
Statische sleutels in «Verzoek headers» zijn niet nodig (in Claude is dat een bètafunctie voor een beperkte groep organisaties).

## Toevoegen in Claude

1. Claude → **Customize → Connectors → Add custom connector**.
2. **Name**: `Mijn Ruimte` (willekeurig). **MCP server URL**: het adres hierboven. Klik op **Continue**.
3. **Authentication**: **Sign in now**. **OAuth client**: **Register automatically** (DCR). Laat Verzoek headers leeg. Klik op **Add**.
4. Claude opent de site: meld u aan (recht `api-platform` vereist), controleer het verzoek en klik op **Дозволити** (Toestaan).
5. In de chat: **+ → Connectors** → schakel de connector in en typ bijvoorbeeld: «toon mijn apparaten».

Beheer op de site: `mcp.tarasevych.com` → **Агенти** (Agenten) → «Надані доступи» (Verleende toegangen: overzicht en intrekken).

## Hulpmiddelen (Tools)

| Hulpmiddel | Type (hint voor Claude) | Wat het doet |
|---|---|---|
| `machine_list` | alleen-lezen | Uw apparaten en hun status |
| `machine_info` | alleen-lezen | Besturingssysteem, toegestane mappen en opdrachten van de agent |
| `machine_list_dir` | alleen-lezen | Mapinhoud (uitsluitend binnen toegestane mappen) |
| `machine_read_file` | alleen-lezen | Tekstbestand tot 2 MB |
| `machine_write_file` | schrijven (destructief) | Bestand schrijven. **Vereist uw «Дозволити» (Toestaan) op de site** |
| `machine_exec` | uitvoeren (destructief) | Opdracht uit de lijst van de agent, zonder shell. **Vereist bevestiging** |
| `docker_list_containers` | lezen (alleen-lezen) | `docker ps` (parameter `include_stopped`). Vereist `docker` in `--allow` van de agent |
| `docker_manage_container` | uitvoeren (destructief) | `start`/`stop`/`restart` van een container op naam. **Vereist altijd bevestiging** |
| `system_metrics` | lezen (alleen-lezen) | CPU, geheugen, schijven (Windows: PowerShell; anders `os`) |
| `app_deploy` | uitvoeren (destructive, standaard uit) | Webapplicatie bouwen en starten op het **eigen** apparaat in een rootless container; bestanden lopen via een eenmalig ticket, niet via de DB. Snapshot van elke versie, automatische terugrol naar de vorige |
| `app_deploy_status` / `app_list` / `app_logs` / `app_versions` / `app_secret_list` | lezen | Voortgang van uitrol, lijst van apps (status, geheugen), laatste logregels (geheimen gemaskeerd), versies, **namen** van geheimen |
| `app_rollback` / `app_control` / `app_route` / `app_secret_delete` | uitvoeren (destructive, standaard uit) | Terugrollen, start/stop/restart/remove, domein via lokale Caddy, geheim verwijderen |
| `app_secret_request` | schrijven | Eenmalige link `mcp.*/apps?geheim=…`, waar de **eigenaar** zelf de waarde invoert; de AI ziet deze nooit |
| `browser_snapshot` | lezen (alleen-lezen) | Adres, tekst, bedieningselementen en site-acties van de geopende pagina (browserextensie) |
| `browser_open` | navigatie | Pagina `*.tarasevych.com` openen in een tabblad. Alleen zonder bevestiging als de gebruiker dit voor deze browser heeft toegestaan |
| `browser_invoke_action` | actie op pagina (destructief) | Een actie uitvoeren die de site zelf aanbiedt (`open_service`, `list_services`). **Vereist altijd bevestiging** |
| `browser_click` / `browser_type` | actie op pagina (destructief) | Klikken of typen op naam van het element; nooit voor wachtwoord- of betaalvelden. **Vereist altijd bevestiging** |

**Hulpmiddelen van de site zelf** (via bestaande siteroutes, namens de gebruiker; `backend/site-hulpmiddelen.ts`, `backend/site-aanroep.ts`):

| Hulpmiddel | Standaardmodus | Wat het doet |
|---|---|---|
| `site_search` | Altijd | Gecombineerd zoeken in alles wat Mijn Ruimte heeft geïndexeerd (mail, bestanden, Drive, agenda) |
| `mail_list_accounts`, `mail_list_labels` | Altijd | Gekoppelde Gmail-accounts, etiketten |
| `mail_search_messages`, `mail_read_message` | Altijd | Berichten zoeken (Gmail-syntaxis) en één bericht lezen (tekst tot 20.000 tekens, gemarkeerd als onvertrouwde gegevens) |
| `mail_modify_message` | **Vragen** | Gelezen/ongelezen, archiveren, ster, spam, prullenbak (verwijdert niet definitief) |
| `calendar_list_calendars`, `calendar_list_events` | Altijd | Agenda's en afspraken van Google Calendar |
| `drive_browse`, `drive_read_file` | Altijd | Mappen/zoeken op naam en lezen van tekstbestanden uit Google Drive |

**Modus per hulpmiddel** (op de pagina «Агенти → Інструменти й дозволи», opgeslagen op de server, `app.connector_tool_settings.modes`): «Завжди» (Altijd — zonder extra verzoek op de site), «Питати» (Vragen — elke aanroep wacht op «Дозволити» op de site; voor site-hulpmiddelen is dit de wachtrij `app.connector_tool_calls`, voor apparaten en browser is dit een verplichte goedkeuring bovenop het agentbeleid), «Вимк.» (Uit — verborgen voor Claude en geweigerd op de server). Er zijn knoppen voor «Усі інструменти» (Alle hulpmiddelen), «Вимкнути групу» (Groep uitschakelen) en «Standaard» (Standaard). Risicovolle hulpmiddelen (`RISKY_TOOLS`: bestanden schrijven, opdrachten uitvoeren, Docker-beheer, klikken/typen/selecteren/toetsen/site-acties, schermafbeelding, diepe diagnose) staan **standaard uit** en zijn niet zichtbaar voor Claude. De gebruiker kan deze zelf op «Питати» of «Завжди» zetten (met een «!»-teken, uitleg van de risico's en bevestiging op de pagina). «Завжди» betekent hier: zonder klik bij elke afzonderlijke aanroep, terwijl de grenzen van de agent (mappen, opdrachtenlijst) en de schakelaars van de extensie van kracht blijven. De bulkactie «Усі інструменти → Завжди/Питати» raakt deze risicovolle hulpmiddelen niet aan.

**Beveiliging van interne aanroepen:** site-hulpmiddelen roepen siteroutes aan in hetzelfde proces via een gebeurtenis dat uitsluitend door `site-aanroep.ts` wordt aangemaakt (gemarkeerd in een `WeakMap`); `ownerRequireSession` geeft de sessie terug van exact de gebruiker uit het OAuth-token van Claude. Een extern HTTP-verzoek kan nooit «gedelegeerd» zijn (wordt gecontroleerd door een test). Alleen routes uit de lijst `TOEGESTANE_ROUTES` zijn toegankelijk. Nieuw hulpmiddel = nieuw item in `SITE_TOOLS` + route in deze lijst.

De gebruiker kan elk hulpmiddel uitschakelen onder «Інструменти й дозволи» (de server verbergt het dan uit `tools/list` en weigert de aanroep). Details over de extensie: `deploy/BROWSER-EXTENSIE.nl.md`.

## Spiegeling van de deuren (zonder nieuwe rechten)

Deze hulpmiddelen roepen reeds bestaande consoleroutes aan (`POST/PATCH/PUT /api/mcp/board`, `POST /api/mcp/spiegel/…`). Het AI-beleid blijft het plafond. Lezen blijft lezen.

| Hulpmiddel | Modus | Wat het doet |
|---|---|---|
| `get_live_release`, `list_releases`, `read_release_file`, `get_system_health` | Altijd | Na uw goedkeuring van een pakket met de sleutel controleert de AI de live release en de status van de site, deuren en schakelaars. Een geheim bestand geeft een weigering terug zonder dat de connector crasht. |
| `search_board`, `create_task`, `update_task_status`, `update_board_item`, `delete_board_item` | lezen altijd; wijzigen **Vragen** | Zoeken vóór aanmaken. Statussen: `backlog`, `doing`, `blocked`, `done`. Annuleren is verwijderen; er is geen aparte status voor. |
| `list_services`, `get_service`, `get_hub_overview` | Altijd | JSON met knooppunt-URL's. Roep `list_services` aan vóór mail, admin of hub. |
| `get_github_projects` | Altijd, alleen als er een token `github` of `github-app` is | GitHub Projects-borden. |
| `draft_email_reply`, `draft_calendar_event`, `manage_hub_notes`, `get_connector_stats` | **Vragen** | Conceptantwoord voor e-mail zonder verzending, conceptafspraak als notitie (niet Google Calendar), hub-notities, teller en tokenprefixen. Antwoord is `status: "pending"` totdat u het op de site toestaat. |

Niet aanwezig in de connector, zelfs als een oude deurnaam nog bekend is: goedkeuren van een release met een sleutel, terugrollen, maken van een back-up, wijzigen van het AI-beleid, downloaden van een archief of back-up naar de chat, en waarden van geheimen. Zulke namen geven `OUT_OF_SCOPE`.
| `github_get` | alleen-lezen | GET naar de GitHub API met uw PAT uit de kluis (verschijnt alleen als er een PAT aanwezig is) |

In de connectorinstellingen in Claude (Tool permissions) kunnen schrijven en uitvoeren afzonderlijk van lezen worden geblokkeerd of van een verplichte bevestiging worden voorzien.

## Twee ruimtes: privé en technisch (vanaf 14-10-2026, migratie `0042_ai_ruimte.sql`)

Elke AI-koppeling (OAuth-grant), elk `tvh_…`-token en elk gekoppeld apparaat behoort tot **exact één ruimte**
(`shared/ai-ruimte.ts`). De ruimte wordt door **de mens op de site** ingesteld bij het maken van de koppeling; de AI kan deze niet wijzigen, ziet geen hulpmiddelen
van de andere ruimte in `tools/list`, en een aanroep buiten de eigen ruimte krijgt `SPACE_SEPARATED: …` (isError, in de audit `reden: ruimte`) nog vóór beleid,
rechten en grants worden gecontroleerd.

| | Privéruimte | Technische ruimte |
|---|---|---|
| Waar te koppelen | mcp.* → **Агенти** (accountruimte) | mcp.* → **Технічні під'єднання** (technisch profiel; alleen eigenaar) |
| Waarheen | alleen connector `/mcp` | serverdeuren `/Grok`, `/claude`, … of connector `/mcp` |
| Wat de AI ziet | apparaten en browsers van de gebruiker, mail, agenda, Drive, bord, notities, GitHub-token | releases (`get_live_release`, `list_releases`, `read_release_file`), serverstatus (`get_system_health`), voorbereiden van updates `uitrol_voorstel_*` (alleen met grant), serverdeuren, agents op de server |
| Wat de AI niet ziet | geen enkel site-/serverhulpmiddel; geen enkel apparaat uit de technische ruimte | geen mail, Drive, bord of browser; geen enkel persoonlijk apparaat |
| Apparaten | `app.agents.ruimte='prive'` (koppelcodes vanaf de pagina Agenten) | `app.agents.ruimte='technisch'` (codes vanaf de pagina Apps → «Під'єднати цей сервер») |
| Recht «updates voorbereiden» | wordt nooit verleend (`RUIMTE_PRIVE`) | alleen aan technische tokens/grants; goedkeuring altijd door de eigenaar met passkey |
| Meldingen | belletje van de accountruimte | belletje van de technische ruimte (`shared/meldingen-ruimte.ts`) |

Serverregels:
- `ruimte` wordt opgeslagen in `app.mcp_oauth_auth`, `app.mcp_oauth_tokens`, `app.mcp_console_tokens`, `app.agent_pairing_codes`, `app.agents`;
  alles wat al bestond wordt `prive` (minste rechten), behalve grants met een geldig recht «updates voorbereiden» en agents die door de serverinstallatie zelf zijn ingesteld.
- De technische ruimte vereist bij het aanmaken (consent, `POST /api/mcp/tokens`, `POST /api/owner/agents/pairing-code` met `ruimte:'technisch'`)
  de eigenaar **én** een actief technisch profiel (`backend/ai-ruimte-poort.ts`: `OWNER_REQUIRED`, `TECH_PROFIEL_VEREIST`). Een verzoek vanuit een deur (`mrd_…`)
  is altijd technisch: in de accountruimte toont het venster «Дозволити» alleen een link «Відкрити в технічному просторі» (Openen in de technische ruimte).
- `initialize.instructions` verschillen per ruimte (`RUIMTE_INSTRUCTIES`); het ondertekende AI-beleid blijft in beide ruimtes het plafond.
- Apparaathulpmiddelen (`machine_*`, `docker_*`, `app_*`, `system_metrics`) zijn in beide ruimtes beschikbaar, maar zien uitsluitend de apparaten van **hun eigen** ruimte.

## Hoe het werkt (stroom)

1. Claude roept `POST /mcp` aan zonder token → **401** met `WWW-Authenticate: Bearer realm="mcp", resource_metadata="…/.well-known/oauth-protected-resource/mcp"`.
2. Claude leest de metadata (RFC 9728 → RFC 8414) en registreert de client (`POST /oauth2/register`; alleen de callback van Claude
   `https://claude.ai/api/mcp/auth_callback` en loopback `/callback` voor Claude Code zijn toegestaan).
3. Browser → `GET /oauth2/authorize` → redirect naar de site `…/agents?consent=<id>` (privéruimte; met `ruimte=technisch` in het siteverzoek — `…/verbindingen?consent=<id>`) → u meldt zich aan en klikt op «Дозволити».
4. De site geeft een **eenmalige code** uit (2 min geldig, gekoppeld aan `code_challenge`) → redirect naar Claude.
5. Claude wisselt de code in voor tokens: `POST /oauth2/token` (`application/x-www-form-urlencoded`, `code_verifier`).
   Access-token 1 uur, refresh-token 30 dagen met **rotatie** en detectie van hergebruik (gestolen token → de volledige grant wordt ingetrokken).
6. Alle aanroepen naar `POST /mcp` bevatten `Authorization: Bearer …`; het token is gekoppeld aan uw account.

## Adressen (extern → intern)

| Extern adres | Interne route | Bestemming in de tunnel |
|---|---|---|
| `POST /mcp` | `/api/mcp-connector/rpc` | hoofdapplicatie :8080 |
| `/.well-known/oauth-protected-resource/mcp` | `…/prm` | :8080 (aparte regel **boven** de brug) |
| `/.well-known/oauth-authorization-server/oauth2` | `…/asm` | :8080 (aparte regel **boven** de brug) |
| `POST /oauth2/register`, `GET /oauth2/authorize`, `POST /oauth2/token`, `POST /oauth2/revoke` | `…/register`, `…/authorize`, `…/token`, `…/revoke` | :8080 (`/oauth2` ≠ `/oauth`, dus de brug onderschept dit niet) |

`/oauth/*`, `/Grok`, `/claude`, `/health` en de overige `/.well-known/*` blijven achter de brug (:8091, aparte alleen-lezen brug voor Grok).

Tunnelregel (moet **vóór** de brugregel voor `mcp.` staan; controleer met `cloudflared tunnel ingress rule <url>`):

```yaml
  - hostname: mcp.tarasevych.com
    path: ^/\.well-known/(oauth-protected-resource/mcp|oauth-authorization-server/oauth2)$
    service: http://127.0.0.1:8080
```

## Beveiliging

- **Gebruikersisolatie:** `userId` wordt uitsluitend uit het token gehaald; argumenten van het model kunnen dit niet wijzigen. De test `mcp-connector.test.ts` controleert dat A de apparaten van B niet ziet.
- **Eenmalige codes, PKCE S256 verplicht, refresh-rotatie, intrekking** (UI + `POST /oauth2/revoke`, RFC 7009). Tokens staan in de DB uitsluitend als sha256.
- **Alleen bekende redirect-adressen** (vanaf 13-10-2026, `shared/ai-verbinding.ts`): https van bekende AI's (claude.ai, grok.com, x.ai, chatgpt.com, openai.com, vscode.dev), loopback `http://127.0.0.1|localhost|[::1]:<poort>/…` (Claude Code, Cursor, VS Code), app-schema's `cursor://`, `vscode://`, `vscode-insiders://`, `windsurf://`, het eigen site-adres `/oauth-terug` en wat de eigenaar heeft toegevoegd in `/etc/mijn-ruimte/mcp-rechten.json` → `"oauthRedirects": ["https://…/callback", "https://…/prefix/"]`. Geen fragmenten, geen logins in de URL, geen `javascript:`/`data:`/`file:`. Een onbekende `client_id` of `redirect_uri` leidt nooit tot een redirect.
- **Prompt injection:** resultaten van hulpmiddelen vanaf een apparaat worden gemarkeerd als onvertrouwde gegevens; in de `instructions` van de server staat dat er geen opdrachten uit bestandsinhoud mogen worden uitgevoerd.
  Schrijven en uitvoeren worden altijd door de gebruiker op de site bevestigd.
- **Limieten:** 120 aanroepen/min per token, 20 registraties/min en 120 tokenwissels/min per IP, maximaal 10 actieve toegangen per gebruiker, maximaal 20 gelijktijdige bevestigingsverzoeken.
- **CSRF/Origin:** voor deze routes wordt Origin niet gecontroleerd (authenticatie verloopt via Bearer/PKCE, niet via een cookie); de rest van de API blijft onder CSRF-controle.

## Cloudflare: controleer dat niets Anthropic blokkeert

Verzoeken komen vanuit `160.79.104.0/21` (niet vanuit een browser). In het Cloudflare-dashboard voor `mcp.tarasevych.com`: schakel Bot Fight Modus / Browser Integrity Controle uit
voor de paden `/mcp`, `/oauth2/*`, `/.well-known/*`, of voeg een Skip-regel toe voor het IP-bereik van Anthropic; zorg dat er geen WAF-challenges optreden.
Symptoom: «Couldn't reach de MCP server», terwijl er in het applicatielogboek geen enkel verzoek binnenkomt.

## Diagnose

- **Couldn't reach de MCP server** → tunnel/WAF (zie hierboven); `curl -i -X POST https://mcp.tarasevych.com/mcp` moet `401` met `WWW-Authenticate` teruggeven.
- **Authorization failed** → `curl https://mcp.tarasevych.com/.well-known/oauth-authorization-server/oauth2` moet JSON met `registration_endpoint` teruggeven.
- **Na «Дозволити» gebeurt er niets** → bekijk het logboek `journalctl -u mijn-ruimte -n 50`; de code is 2 min geldig.
- **Geen hulpmiddelen zichtbaar** → u hebt geen gekoppelde agent (`machine_*`) en geen GitHub-PAT in de kluis.
- Alles wissen: site → Agenten → «Надані доступи» → Intrekken, en in Claude de connector verwijderen.


## AI koppelen: met één klik of handmatig (vanaf 13-10-2026)

Site: `mcp.<domein>` → **Агенти → Маркери доступу → «Під'єднати ШІ»** (privéruimte) of **Технічні під'єднання → «Під'єднати ШІ»** (technische ruimte, alleen eigenaar met profiel). Kies de AI (Grok, Claude, ChatGPT, Gemini, Copilot, Cursor, overige),
waarheen u wilt koppelen (**serverdeuren** `/Grok`, `/claude`, … — alleen servereigenaar; of **connector** `/mcp` — uw apparaten, mail, Drive)
en de **toegangsduur** voor deze AI: 1 uur (wordt vernieuwd tot 14 dagen, aanbevolen), 8 uur, 1 dag, 7 dagen, 30 dagen, onbeperkt (tot intrekking).
Lange termijnen (7 dagen en langer) vereisen een nieuwe aanmeldingsbevestiging (extra bevestiging). De termijn kan nogmaals worden aangepast in het venster «Дозволити».

**1. «Під'єднати автоматично (одним натисканням)» (Automatisch koppelen met één klik)** — OAuth 2.1 + PKCE (S256) + dynamische registratie:
- plak het adres (`https://mcp.<domein>/Grok` of `/mcp`) in de AI-client; de client opent zelf de site — u bent al aangemeld, klik op **«Дозволити»**;
- de deuren (`GET /oauth/authorize`) vragen niet langer om een deurtoken: ze sturen door naar het sitevenster `…/verbindingen?consent=mrd_…` (technische ruimte)
  (controle van de eigenaarssessie + nieuwe aanmeldingsbevestiging), waarna de site het besluit via loopback doorgeeft aan de deur;
- voor clients die zelf geen aanmeldvenster kunnen openen: gebruik de knop **«Отримати маркер доступу зараз»** (Nu token ophalen) — de site doorloopt zelf OAuth met PKCE in een pop-upvenster
  en toont het Bearer-token eenmalig (inclusief kant-en-klare `mcp.json`-configuratie en een controleopdracht met `curl`).

**2. «Під'єднати вручну (прямий маркер доступу)» (Handmatig koppelen met direct token)** — zoals voorheen: een `tvh_…`-token (30 dagen) in de header `Authorization: Bearer …` van de clientconfiguratie.
Dit werkt nu zowel op `/mcp` als op de deuren (op de deuren uitsluitend met een token van de servereigenaar). Het oude formulier met een deurtoken is behouden:
`/oauth/authorize?…&methode=token` of via de link «Ввести маркер доступу дверей вручну» in het venster «Дозволити».

**Wat er is veranderd in de deuren (`deploy/mcp/server.mjs`, service `mijn-ruimte-mcp`):**
- metadata voor elke deur: `GET /.well-known/oauth-protected-resource/<deur>` (en `/<deur>/.well-known/oauth-protected-resource`)
  geeft `resource` terug met exact het adres dat de client gebruikt (`https://mcp.<domein>/Grok`, `…/claude`); `WWW-Authenticate` bij 401
  bevat de `resource_metadata` van specifiek deze deur, `scope="read"` en `error="invalid_token"` als er wel een token was maar dit niet geldig was;
- een token is gebonden aan de deur waarvoor het is uitgegeven (`resource`): een token voor `/claude` opent `/Grok` niet;
- `/intern/*` — uitsluitend voor de site: alleen loopback, zonder tunnelheaders (`cf-connecting-ip`, `cf-ray`, `x-forwarded-for`) en met een sleutel
  die de deuren bij elke start wegschrijven naar `/srv/mijn-ruimte/mcp-state/intern.sleutel` (0640, gebruiker `mijnruimte`). In de tunnelregel
  komt `/intern` niet voor, zodat deze adressen van buitenaf onbereikbaar zijn;
- overzicht van toegangen via de deuren (wie heeft toegestaan, duur, laatste activiteit) en intrekken — onder «Технічні під'єднання» (technisch profiel); acties worden vastgelegd in het logboek
  (`owner.mcp.deur.approved` / `denied` / `revoked`, met deur, client en termijn);
- JSON-RPC-batches, een onbekende `Mcp-Session-Id` na een herstart geeft niet langer 404, en CORS voor `/.well-known`, `/oauth/*` en de deuren.

**502 / time-outs bij parallelle initialisatie.** Oorzaak: cloudflared houdt verbindingen tot 90 s open (`originRequest.keepAliveTimeout`),
terwijl Node «stille» verbindingen eerder sloot (deuren: 5 s, applicatie: 65 s). De tunnel stuurde soms een verzoek over een net gesloten verbinding → 502.
Nu is `keepAliveTimeout` van de deuren 120 s (`headersTimeout` 125 s) en van de applicatie 100 s. Er zijn geen aparte instellingen nodig: dit maakt deel uit van de release.

**Voor elke «Mijn Ruimte»-server (BYOS):** alles wordt geïnstalleerd via een gewone release met `/usr/local/sbin/mijn-ruimte-installeer`
(de deuren en hun unit-bestand worden gekopieerd door `installeer-app.sh`, en migratie `0029_ai_verbinding_duur.sql` draait mee). De tunnelregel verandert niet.
Als de deuren op een server niet draaien, toont de site eenvoudigweg «Двері сервера зараз не працюють» (Serverdeuren werken momenteel niet), terwijl de connector `/mcp` gewoon blijft werken.
