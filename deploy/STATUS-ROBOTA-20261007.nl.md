> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./STATUS-ROBOTA-20261007.uk.md) · **🇳🇱 Nederlands** ([origineel](./STATUS-ROBOTA-20261007.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Mijn Ruimte: wat is geïmplementeerd en wat niet (stand op 07-10-2026)

Werkbranch: `feature/connectors-agent-v2` (gepusht naar GitHub `Tarasevych/hub`). Op de server draait release `20261007-091620`, commit `aa898b5`.
De branch `zelf-hosten` is hier nog niet mee samengevoegd: de server is gebouwd vanuit `feature/connectors-agent-v2`. Het besluit over het samenvoegen ligt nog bij de eigenaar.

## Geïmplementeerd en werkend op de server

**Connector voor lokale apparaten (agenten)**
- Agent op pc/VM maakt verbinding via WSS `/agent/ws`, koppelen met eenmalige code (10 min), beleid voor automatische goedkeuring, goedkeuring van acties op de site.
- Hulpmiddelen: bestanden lezen/schrijven, mappenlijst, opdrachten uit de lijst (zonder shell), apparaatinformatie, Docker (lijst en beheer), systeemmetrieken. Agent `0.2.0`.
- Chat op `ai.*` met eigen sleutel (BYOK) en hulpmiddelen.

**MCP-connector voor Claude (`https://mcp.tarasevych.com/mcp`)**
- OAuth 2.x + PKCE + clientregistratie, tokens van 1 uur / 30 dagen met rotatie, intrekking, limieten, gebruikersisolatie.
- 23 hulpmiddelen: 9 voor apparaten en 14 voor de browser. Altijd zichtbaar voor Claude (Claude toont de toestemmingsgroepen «lezen / schrijven»).
- Toestemmingsvenster boven de interface (overleeft het inloggen), paneel «Verleende toegangen» (intrekken met bevestiging op de pagina, laatste verbinding, tijdzone van het apparaat), knop «Claude opnieuw verbinden», status.
- «Hulpmiddelen en rechten»: elk van de 23 hulpmiddelen kan op de site worden uitgeschakeld; de server verbergt het en weigert de aanroep.
- In het toegangslogboek staat het kenmerk `anthropic=yes|no` (IP-bereik van Anthropic), zonder IP-adres.

**Site-hulpmiddelen in MCP (e-mail, agenda, schijf, zoeken)** + modi: 33 hulpmiddelen (9 apparaten, 14 browser, 10 site). Voor elk «Altijd / Vragen / Uit», «Alle hulpmiddelen», groepen, goedkeuringswachtrij op de site. Veilig aanroepen van siteroutes namens de gebruiker (zie `deploy/MCP-CONNECTOR.md`). Migratie `0015`. Voorlopig alleen Google Suite (Gmail, Calendar, Drive) en zoeken; Microsoft-e-mail, cloudproviders, notities/taken van de hub en het API-platform zijn nog niet gekoppeld. Wordt toegevoegd via een item in `SITE_TOOLS`.

**Browserextensie «Mijn Ruimte» 0.2.0** (alleen `*.tarasevych.com`)
- 14 mogelijkheden per browser, elk afzonderlijk in te schakelen met uitleg onder «?»: pagina lezen, diagnostiek, tabbladen, scrollen, wachten op tekst, pagina's openen, terug/vooruit/vernieuwen, klikken, invoeren, kiezen uit lijsten, navigatietoetsen, site-acties, schermafbeelding, diepe diagnostiek (`chrome.debugger`, optionele toestemming).
- Activering alleen na inschakelen in het account **én** alleen zolang een geopend tabblad van de site met uw aanmelding de sessie bevestigt (elke 2 min, geldigheid 5 min). Wordt gecontroleerd door de server (`browserGate`).
- Wijzigende acties, schermafbeeldingen en diepe diagnostiek wachten altijd op «Toestaan».
- Installatie: hulpscripts `Install-MijnRuimte.cmd` / `install-mijn-ruimte.sh` (met SHA-256-controle), ZIP, eigen ondertekende CRX (+`updates.xml`), activeringswizard die na installatie automatisch de pagina opent, extensievenster met tips, instellingenpagina.
- Site-acties voor AI: register `registerSiteActions`, hook `useMcpContext`, `window.__MCP_CONTEXT__`, zelfdiagnostiek van de site.

**Snelheid en menu**
- E-mail en Instellingen worden op aanvraag geladen, hoofdbestand 2,7 MB → 0,9 MB, de huidige dienst wordt parallel opgehaald.
- Het pijltje naast een andere dienst klapt het submenu uit zonder de pagina opnieuw te laden.

**Oplossingen:** inloggen op `mcp.*`, wit scherm door tijdnotatie, intrekken zonder `window.confirm`, lege lijst met hulpmiddelen zonder agent.

**Migraties:** `0009` agenten, `0010` MCP-connector, `0011` Docker/metrieken, `0012` browser + instellingen van hulpmiddelen, `0013` activering, `0014` alle browsermogelijkheden.

## NIET geïmplementeerd / niet getest

- **Chrome Web Store:** de extensie is niet gepubliceerd (vereist een ontwikkelaarsaccount, 5 USD). Alleen dat biedt een echte «één-klik-installatie». Voorbereid in `deploy/CHROME-WEB-STORE.md`; na publicatie de URL invullen in `extension/store-url.txt`.
- **Werking van de extensie in een echte Chrome is niet getest** (de ingebouwde browser kan geen extensies installeren). Met name: schermafbeelding (`captureVisibleTab`) en `chrome.debugger`. Wel getest: protocol, server, schakelaars op de pagina, installatiehulp, CRX-handtekening.
- **Eigen CRX wordt door Chrome op Windows/macOS geweigerd** (beveiliging: alleen pakketten uit de winkel). Werkt in sommige Chromium-browsers, op Linux, of via beheerdersbeleid.
- **Docker-hulpmiddelen niet end-to-end getest:** er is geen gekoppelde agent met `--allow docker`.
- **Catalogus van plug-ins en skills op de site** (zoals in Claude): niet gemaakt.
- **Statisch UI-skelet vóór het laden van JS** (zodat het menu direct zichtbaar is): niet gemaakt; navigeren tussen subdomeinen blijft een volledige paginalading.
- **RustDesk:** niet gemaakt.
- **Site-acties zoals back-up of onderhoudsmodus voor AI:** dergelijke functies bestaan niet op de site en zijn daarom niet geregistreerd.
- Gevaarlijke MCP-hulpmiddelen (schrijven, opdrachten, Docker-beheer, klikken/invoeren, schermafbeelding, diepe diagnostiek) staan standaard **uit**; de gebruiker kan ze inschakelen («Vragen» of «Altijd») met een «!»-symbool en uitleg over de risico's.

## Herinneringen en restpunten
- Ondertekeningssleutel van de extensie: `T:\mijn-ruimte\geheim\extension-signing-key.pem`. Bestaat alleen in deze (versleutelde) kopie en op `T:`. Zonder deze sleutel kunnen er geen CRX-updates worden uitgebracht onder dezelfde id `ofpffonakgjioahgfejmiblfmbkobmmi`.
- Na het wijzigen van de extensiecode: `node scripts/sign-extension.mjs`, commit `extension/signed/`, anders publiceert de CRX-build niet.
- Tijdelijke bestanden die nog handmatig moeten worden verwijderd: op de server in `/tmp` (`perf-src`, `tools-src`, `login-src`, `hotfix-src`, `ext-src`, `cap-src`, `crx-src` en de bijbehorende `mijn-ruimte-*.tar.gz` / `.sha256`); op de pc `T:\mijn-ruimte\hulpmiddelen\node\tmp\arch`.
- Overlay van de MCP-brug op de server (`/srv/mijn-ruimte/mcp-staging/overlay`): moet na elke release overeenkomen met de release voor `server/start.ts` en `src/McpServiceView.tsx`; `UnifiedServiceApp.tsx` verschilt slechts op één regel (`plumEnabled`), die door de installer wordt gepatcht.
