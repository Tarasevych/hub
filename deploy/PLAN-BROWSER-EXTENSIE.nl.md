> 🌐 **Taal / Мова:** [Українська](ПЛАН-РОЗШИРЕННЯ-ОГЛЯДАЧА.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Plan: browserextensie «Mijn Ruimte» en AI-toegang tot de site

Doel: de gebruiker zet in zijn accountomgeving één schakelaar om, installeert de extensie vanaf de site, en zijn AI-agenten (Claude via onze MCP-connector) kunnen pagina's van de site lezen en erin handelen. Zonder handmatige configuratie en zonder code. De extensie werkt **uitsluitend op onze site**.

## Beveiligingsprincipes
- Manifest V3-extensie, `host_permissions` uitsluitend `https://*.tarasevych.com/*`. Op andere sites ziet en doet de extensie niets.
- Toegang wordt beheerd vanuit de accountomgeving: standaard uitgeschakeld, niveaus (lezen / navigatie / wijzigende acties), intrekken met één klik.
- Wijzigende acties lopen altijd via een «Дозволити» (Toestaan)-verzoek op de site (net als `fs.write` en `docker.manage`).
- Elke actie komt in het logboek dat de gebruiker ziet. Gebruikersisolatie is identiek aan die van de apparaatconnector (RLS, `userId` uitsluitend uit de sessie).
- Pagina-inhoud wordt voor het model gemarkeerd als onvertrouwd (zoals `untrusted()` in `connectors-hulpmiddelen.ts`).

## Architectuur (hergebruik van wat er al is)
1. **Koppelen (Pairing)**: code uit de accountomgeving → extensie (zoals `agent pair`). Nieuw soort agent `browser` in de tabel `agents`.
2. **Kanaal**: WSS `/agent/ws` (bestaat al, 4401 zonder authenticatie). De achtergrondpagina van de extensie houdt de verbinding open, het contentscript voert acties op de pagina uit.
3. **Opdrachten**: `browser.snapshot` (tekst en beschikbare acties), `browser.navigate` (alleen onze eigen adressen), `browser.invoke` (aanroepen van een gedeclareerde actie), `browser.click`/`browser.type` (op naam, uitsluitend met bevestiging). Worden toegevoegd aan `COMMAND_TYPES` en CONTROLE (nieuwe migratie).
4. **MCP-hulpmiddelen**: `browser_snapshot`, `browser_open`, `browser_invoke_action` enz. via de bestaande opdrachtenwachtrij en goedkeuringsregels.
5. **WebMCP**: de site declareert zijn acties via `navigator.modelContext`, indien de browser dit ondersteunt. De extensie gebruikt dezelfde declaratie, zodat acties gestructureerd zijn in plaats van «blind klikken».

## Installatie
- Chrome blokkeert de installatie van externe extensies buiten de winkel om. Voor gewone gebruikers is daarom publicatie in de Chrome Web Store (unlisted) nodig. Deze handeling moet door de eigenaar worden uitgevoerd (ontwikkelaarsaccount).
- Voor ontwikkeling en eerste tests: ZIP vanaf de site → «Load unpacked» in de ontwikkelaarsmodus.
- Pagina in de accountomgeving: knop «Завантажити розширення» (Extensie downloaden), stapsgewijze instructie, status «extensie verbonden».

## Fasen
1. (voltooid) Knop «Перепід'єднати Claude» (Claude opnieuw verbinden) en toegangsstatussen.
2. (voltooid) Paneel «Розширення браузера» (Browserextensie) in de accountomgeving, declaratie van site-acties (`src/ai-site-acties.ts`, WebMCP indien aanwezig), rechten op browserniveau en per afzonderlijk hulpmiddel; logboek via de algemene audit.
3. (voltooid) Extensie (`extension/`), koppelen zonder code in te voeren, snapshot/navigate, migratie 0012, MCP-hulpmiddelen, tests (inclusief end-to-end keten).
4. (voltooid) Klikken/typen/site-acties: uitsluitend met een bevestigingsverzoek.
5. Publicatie in de Chrome Web Store (vereist besluit en account van de eigenaar) — openstaand. Controle in een echte Chrome-browser — handmatig na installatie.

Beschrijving van de implementatie: `deploy/BROWSER-EXTENSIE.nl.md`.

## Open vragen aan de eigenaar
- Welke site-acties moeten als eerste worden gedeclareerd (overzicht van secties en bewerkingen)?
- Is er een ontwikkelaarsaccount voor de Chrome Web Store (eenmalige betaling)?
