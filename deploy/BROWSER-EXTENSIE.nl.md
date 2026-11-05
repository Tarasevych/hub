> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./BROWSER-EXTENSIE.uk.md) · **🇳🇱 Nederlands** ([origineel](./BROWSER-EXTENSIE.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Browserextensie «Mijn Ruimte»

Laat uw AI-assistent (Claude via onze MCP-connector) geopende pagina's van de site lezen en daarin acties uitvoeren. Werkt **uitsluitend** op `*.tarasevych.com`.

## Hoe het werkt

```
Claude ──MCP──▶ mcp.tarasevych.com ──opdrachtenwachtrij (beleid/«Toestaan»)──▶ WSS /agent/ws ──▶ extensie ──▶ sitetabblad
```

- De extensie is een gewone agent met `platform = 'browser'` (dezelfde tabel `agents`, dezelfde tokens, isolatie en goedkeuring als bij de pc-agent).
- Mogelijkheden (14 opdrachtsoorten, migraties 0012–0014; lijst in `backend/browser-mogelijkheden.ts` = `extension/shared.js`, overeenkomst wordt door een test gecontroleerd):
  - Lezen en bekijken: `snapshot`, `diagnostics`, `tabs`, `scroll`, `wait`.
  - Navigatie: `navigate`, `history` (terug, vooruit, vernieuwen).
  - Acties op de pagina: `click`, `type`, `select`, `key` (alleen navigatietoetsen), `invoke` (acties die de site aanbiedt).
  - Uitgebreid: `screenshot` (JPEG; wordt teruggegeven als MCP-afbeelding), `deep_diagnostics` (vanaf 0.3.3 zonder `chrome.debugger`: gedurende enkele seconden wordt een passieve verzamelaar `diag-hook.js` in de pagina geïnjecteerd via `chrome.scripting`; geen extra rechten of balk nodig. Chrome staat `debugger` niet toe als optionele machtiging — het verzoek eindigde altijd met de fout «Only permissions specified in the manifest may be requested»).
- Elke mogelijkheid schakelt de gebruiker **afzonderlijk per browser** in of uit met een schakelaar en uitleg «?» (wat er gebeurt bij in- en uitschakelen). Een extra schakelaar «zonder bevestiging» bestaat alleen voor lezen/bekijken en navigatie. Standaard staat alleen lezen en bekijken aan.
- Het opdrachttype wordt gecontroleerd door een CHECK in de database, de mogelijkheid door `policy.enabled` op de server (`browserGate`), en het adres door zowel de server als de extensie (`isOwnSiteUrl`).
- Standaardbeleid: ingeschakeld en zonder bevestiging geldt alleen voor lezen en bekijken. Klikken, typen, selecteren, toetsen, site-acties, schermafbeelding en diepe diagnostiek **kunnen niet** automatisch zijn (de server weigert zo'n verzoek).
- Pagina-inhoud wordt voor het model gemarkeerd als onvertrouwd (`untrusted()`); wachtwoord- en betaalvelden worden door de extensie nooit gelezen of ingevuld.
- Hulpmiddelinstellingen (een afzonderlijk hulpmiddel uitschakelen) worden op de server bewaard (`app.connector_tool_settings`), niet alleen in de interface.

## Activatie en aanmelding op het account (bescherming tegen vreemd gebruik)

De extensie **doet niets** totdat aan beide voorwaarden is voldaan (gecontroleerd door de server, niet door de extensie):

1. **De gebruiker heeft deze browser ingeschakeld** met de schakelaar «AI toestaan deze browser te gebruiken» in het accountoverzicht (`agents.browser_enabled`). Na het koppelen staat de browser altijd **uit**.
2. **Aangemeld op de site:** een geopende pagina van de site met een actieve sessie stuurt elke 2 min een hartslag (`POST /api/owner/agents/:id/heartbeat`, vereist een geldige sessie en rechten). De server verlengt `armed_until` met 5 min. Afmelden, de site sluiten of een verlopen sessie → na enkele minuten is de browser weer «vergrendeld».

Wat dit oplevert:
- Alleen wie op het account is aangemeld kan de extensie koppelen (een eenmalige code voor 10 min wordt alleen vanuit het account uitgegeven).
- Een gestolen extensietoken (malware) levert niets op zonder geldige sessie: de hartslag valt niet te vervalsen.
- Een al goedgekeurde opdracht gaat niet naar de extensie als de hartslag intussen is verlopen (`dispatchCommand`), en er is geen omweg via `submitCommand`.
- Het intrekken van de browser (`Ontkoppelen`) sluit het kanaal onmiddellijk (code 4403).
- Alle stappen (koppelen, in-/uitschakelen, goedkeuren) worden weggeschreven naar het algemene auditlogboek.

## Debuggermachtiging: waarom «Chrome heeft geen toestemming verleend» (0.6.1, 19.10.2026)

Chrome **staat niet toe** dat `debugger` een optionele machtiging is. Het staat in `optional_permissions`, maar Chrome verwijdert het bij het inlezen van het manifest, waardoor een machtigingsverzoek vanuit de extensie altijd eindigt met de fout «Only permissions specified in the manifest may be requested» — ongeacht of het verzoek uit een gebruikersgebaar komt. Daarom kwam de schakelaar «diepe diagnostiek» altijd terug met de tekst «Chrome heeft geen debuggermachtiging verleend».

Wat er in 0.6.1 is gedaan:

- het machtigingsverzoek loopt nog steeds **strikt vanuit een klik** in popup / sidepanel / options (synchroon, in de handler zelf, vóór elke `await`); de service worker vraagt nooit om machtigingen (daar is geen gebruikersgebaar);
- het resultaat wordt **geclassificeerd**: `ja` (machtiging aanwezig) · `nee` (nog niet gevraagd / geen gebaar) · `geweigerd` (gebruiker weigerde in het Chrome-venster) · `ingetrokken` (machtiging ingetrokken terwijl diepe diagnostiek aanstaat) · `niet-aanvraagbaar` (Chrome weigerde het verzoek zelf te accepteren). Voor elke status is er een eigen uitleg in twee talen en een concrete volgende stap;
- de status wordt doorgegeven aan zowel de UI van de extensie (popup, sidepanel, options) als de site (openbaar veld `diagnostiek`: `stand`, `optIn`, `actief`, `aanvraagbaar`) — de hub «AI-koppelingen → Browserextensie» toont dit op een aparte regel;
- de echte manier om CDP in te schakelen is een apart pakket **`mijn-ruimte-extension-diagnose.zip`** (`scripts/bouw-extensie.mjs`, veld `diagnose` in `extension-version.json`): dezelfde bestanden en dezelfde `key` (dus hetzelfde id), maar `debugger` staat in `permissions`. Het standaardpakket behoudt minimale rechten en geeft geen brede waarschuwing bij installatie;
- `chrome.debugger.onDetach` en `chrome.permissions.onRemoved` laten alle tabbladen los en sturen direct de nieuwe status rond; `chrome.permissions.onAdded` schakelt diagnostiek in **zonder herstart** van de extensie;
- het beveiligingsmodel is niet afgezwakt: `debuggerToegestaan()` (`extension/shared.js`, gedekt door een test) vereist tegelijkertijd de Chrome-machtiging + keuze van de gebruiker (`diagOptIn`) + slot `technisch` + een actieve ondertekende ontgrendeling met `browser.debug` + host ∈ `ADMIN_HOSTS_TOEGESTAAN` ∩ `grant.domeinen` + een tabblad dat zich **op dat moment** in de technische modus bevindt.

## Markering van het actieve tabblad (0.6.1)

Wanneer een slot daadwerkelijk ontgrendeld **én** verbonden is (WSS `ready`), en de host van de pagina in de ontgrendeling staat, tekent `extension/markering.js` een dun kader langs de rand van de pagina in de kleur van het profiel (gebruiker — groen, technisch — oranje) + een badge en tooltip op het extensiepictogram. Alles zit in een aparte **gesloten** shadow DOM met `pointer-events:none`, stijl via `adoptedStyleSheets` (de CSP van de pagina blokkeert dit niet), `aria-hidden`. Wanneer de AI een opdracht uitvoert in dit tabblad, «flitst» het kader kort op — behalve bij een schermafbeelding (om niet in beeld te komen) en diepe diagnostiek (daar toont Chrome zelf een gele balk). `prefers-reduced-motion` schakelt de animatie uit (er blijft één statische verdikking). Het kader verdwijnt direct na intrekken, «Stop», verbroken verbinding, profielwissel of `pagehide`.

## Diagnostiek zonder `chrome.debugger`

`browser_get_diagnostics` leest het korte logboek van de site zelf (`src/ai-site-acties.ts`): JS-fouten, `console.error/warn`, mislukte verzoeken (alleen methode, pad zonder query en status) en paginametrieken. De machtiging `chrome.debugger` (CDP) wordt bewust **niet** standaard gebruikt: die geeft toegang tot al het verkeer van het tabblad, toont de balk «extensie debugt de browser» en druist in tegen het principe van minimale rechten. Diepere analyse (`deep_diagnostics`) wordt uitgevoerd door de enkele seconden ingebouwde verzamelaar `diag-hook.js` (alleen console, uitzonderingen, adres/status/duur van verzoeken; nooit inhoud of kopteksten).

## Site-acties: register en hook

Componenten registreren hun acties met de hook `useMcpContext(context, actions)` (`src/use-mcp-context.ts`) → ze verschijnen in `browser_snapshot` → `actions` als `<context>_<id>`. Het uitlezen van `window.__MCP_CONTEXT__` (alleen beschrijving, zonder functies) is beschikbaar voor ontwikkelaars. Basisacties: `list_services`, `open_service`, `get_page_metrics`, `get_diagnostics`. Acties die gegevens wijzigen (back-up, onderhoudsmodus, enz.) worden alleen geregistreerd waar die functie daadwerkelijk op de site aanwezig is, en doorlopen altijd `browser.invoke` met bevestiging.

## Installatie: hulpbestand, automatisch openen van de activatiepagina, aanmelden

Chrome staat niet toe dat een extensie buiten de winkel om zonder tussenkomst van de gebruiker wordt geïnstalleerd; daarom is maximale automatisering gebouwd:
1. De site herkent zelf het besturingssysteem en biedt een **hulpbestand** aan: `Install-MijnRuimte.cmd` (Windows) of `install-mijn-ruimte.sh` (macOS/Linux). Dit downloadt de ZIP van onze site, **controleert de SHA-256** (de controlesom is tijdens de build ingebakken), pakt uit naar een aparte profielmap (zonder beheerdersrechten), zet het pad op het klembord en opent `chrome://extensions`. De gebruiker hoeft alleen nog «Ontwikkelaarsmodus» aan te zetten en de map te kiezen.
2. Direct na installatie **opent de extensie zelf** `mcp.tarasevych.com/agents?extension=welcome`. Als de gebruiker nog niet is aangemeld, volgt eerst het aanmelden; de welkomstvlag blijft tijdens het aanmelden bewaard (`src/extensie-welkom-opslag.ts`). Daarna volgt de wizard: extensie gevonden → u bent aangemeld → koppelen → mogelijkheden kiezen → inschakelen voor AI.
3. Het extensievenster geeft aan wat er moet gebeuren: «Aanmelden en koppelen op de site», «Inschakelen op de site», «Aanmelden op de site» (wanneer er geen sessie is), «AI actief». De status wordt van de server opgehaald met het eigen token (`POST /api/owner/agents/self`).
4. Echte «één-klik-installatie»: publicatie in de Chrome Web Store, zie `deploy/CHROME-WEB-STORE.md` (de knop op de site verschijnt zodra de URL in `extension/store-url.txt` staat).

## CRX-variant (eigen ondertekend pakket)

Naast het hulpbestand en de ZIP staat er op de pagina een knop «CRX downloaden»: een ondertekende CRX3 (`/downloads/mijn-ruimte-extension.crx`) en `updates.xml` voor automatische updates (`update_url` in het manifest van dit pakket).

**Eerlijk over de beperkingen:** ChatGPT en andere worden met «één klik als .crx» geïnstalleerd omdat het bestand uit de Chrome Web Store komt met een handtekening van Google. Chrome op Windows en macOS **weigert CRX-bestanden van buiten de winkel** («Pakket is ongeldig», `CRX_REQUIRED_PROOF_MISSING`); dit is een beveiliging van Chrome. Onze CRX wordt geaccepteerd door sommige Chromium-browsers, Linux, en pc's waarop de beheerder de extensie heeft toegestaan met het beleid `ExtensionInstallForcelist` (op Windows buiten een domein/beheerde omgeving blokkeert Chrome dit eveneens). Daarom blijft de hoofdroute het hulpbestand of (na publicatie) de Chrome Web Store.

Hoe dit werkt en wordt onderhouden:
- Ondertekenen met de eigen sleutel: `node scripts/onderteken-extensie.mjs` (alleen lokaal). Sleutel: `T:\mijn-ruimte\geheim\extension-signing-key.pem` (wordt aangemaakt als die nog niet bestaat; **niet in de repository**; maak een back-up: zonder deze sleutel kunnen geen updates onder hetzelfde id worden uitgebracht).
- Resultaat (openbaar, in de repository): `extension/signed/mijn-ruimte-extension.crx` en `crx-info.json` (extensie-id, versie, `contentHash`).
- `npm run build` publiceert de CRX **alleen als** de handtekening geldig is én `contentHash` overeenkomt met de huidige extensiebestanden. Extensiecode of versie gewijzigd → opnieuw `node scripts/onderteken-extensie.mjs` uitvoeren en `extension/signed/` committen. Een verouderde CRX wordt door de build niet uitgeleverd (en dat wordt gemeld).
- De test `browser-extensie.test.ts` controleert: geldige handtekening, id afgeleid van de sleutel, overeenkomst met `updates.xml`, actualiteit van de inhoud, afwezigheid van de privésleutel, en dat het wijzigen van één byte de handtekening breekt.
- Niet getest in een echte Chrome (het CRX3-formaat is geïmplementeerd volgens de Chromium-specificatie; controleer de installatie op Linux/Chromium of via groepsbeleid).

## Handmatige installatie (ontwikkeling / eigen gebruik)

1. mcp.tarasevych.com → Agenten → «Browserextensie» → «Extensie downloaden» (`/downloads/mijn-ruimte-extension.zip`).
2. Uitpakken in een aparte map. Chrome/Edge: `chrome://extensions` → «Ontwikkelaarsmodus» → «Uitgepakte extensie laden».
3. Vernieuw de pagina Agenten en klik op «Koppelen aan mijn account» (de koppelcode wordt automatisch aan de extensie doorgegeven, handmatig invoeren is niet nodig).
4. Zet de schakelaar «AI toestaan deze browser te gebruiken» aan (staat standaard uit).

Voor gewone gebruikers is publicatie in de Chrome Web Store vereist (Chrome staat het installeren van externe extensies buiten de winkel niet toe). Dit doet de eigenaar van de site met een eigen ontwikkelaarsaccount. Pakket bouwen: `node scripts/bouw-extensie.mjs` (onderdeel van `npm run build`).

## Site-acties voor AI

`src/ai-site-acties.ts`: de pagina reageert op `window.postMessage` (uitsluitend afkomstig van de pagina zelf) en registreert, als de browser WebMCP ondersteunt, dezelfde acties in `navigator.modelContext`. Momenteel: `list_services` (lezen) en `open_service` (navigatie binnen de site).

## Verificatie

- `tests/eenheid/browser-extensie.test.ts` — gedeelde regels en pakket (ZIP, manifest zonder brede rechten).
- `tests/eenheid/browser-keten.test.ts` — de volledige keten met een testclient van het protocol: direct lezen, goedkeuren/weigeren, automatische navigatie, weigeren van vreemde adressen, gebruikersisolatie, intrekken (4403).
- Niet automatisch gecontroleerd: werking in een echte Chrome (vereist handmatige installatie).
