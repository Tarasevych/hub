> 🌐 **Taal / Мова:** [Українська](ЗМІНИ-20261015-ЗЄДНУВАЧ-В2.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Release 15.10.2026: AI-connectoren v2, fase 1 (bovenop a2bbb13)

## Basis
- Op de server draaide **a2bbb13**, tak `cursor/ai-agent-board-8d4d`, werk van een andere agent bovenop mijn e6cbf73. Deze tak is
  als basis genomen.
- Wat daarin al aanwezig was:
  - twee AI-ruimtes, privé en technisch (0042);
  - verbindingsbord en siteschakelaars (0043);
  - toegangsscopes (0044);
  - menu opgesplitst in account- en technisch profiel;
  - vertaling en mailcontext.
- Mijn werk verwijdert hier niets van. Connector v2 bouwt erop voort: hij gebruikt dezelfde ruimtes, schakelaars, ondertekende
  beleidsregels en scopes.

## Nieuw
1. **Apart adres voor elke AI**: `https://mcp.tarasevych.com/ai/{claude|gpt|grok|gemini|copilot|cursor}`.
   - Een token is gebonden aan het adres. Een vreemd adres of het oude `/mcp` geeft 401 en dit wordt gelogd.
   - Het terugkeeradres moet bij deze agent horen.
2. **Nederlandse namen van hulpmiddelen**: `<actie>_<agent>_<subdomein>[_<dienst>]_tarasevych_com_<gebruiker|beheer>`.
   - De catalogus van 131 items (109 verschillende hulpmiddelen; apparaten en applicaties bestaan in beide ruimtes) dekt alle bestaande hulpmiddelen.
   - Nog 17 items zijn gemarkeerd als «in ontwikkeling» («у розробці»), naar het voorbeeld van Figma, AppDeploy, GitHub, Notion en Stripe.
   - Alle namen zijn ASCII en maximaal 64 tekens lang, dus compatibel met Claude en ChatGPT.
   - De test controleert: elk echt hulpmiddel heeft een v2-naam en geen enkele v2-naam verwijst naar niets.
3. **Toestemmingen per hulpmiddel** in elke verbinding.
   - Standaard staat alleen wat veilig is ingeschakeld.
   - Modi: alles / lezen / lezen en schrijven / alleen schrijven / geen.
   - De aanroepruimte wordt bepaald door het achtervoegsel in de naam (`_beheer` betekent technische ruimte en alleen voor de eigenaar).
4. **Toestemmingsvenster met stappen**: bevestiging → beveiliging (indien ingesteld) → account → ruimte (eigenaar) → toestemmingen.
   - Toestemmingen zijn gegroepeerd en voorzien van pictogrammen en schakelaars met badge.
   - Met zoekfunctie, risiconiveau, uitleg, schema en adres van het hulpmiddel.
   - Items «in ontwikkeling» worden getoond, maar kunnen niet worden ingeschakeld.
   - Bij opnieuw verbinden zijn drie secties zichtbaar: wat wordt toegevoegd, wat er al was, en wat niet wordt toegevoegd.
5. **Tabblad «З'єднувачі» (Connectoren)** op `mcp.*/agents` en op `mcp.*/verbindingen`.
   - Adressen met kopieer- en verbindingsknop.
   - Beperken werkt direct, uitbreiden pas na opnieuw verbinden; de keuze wordt onthouden.
   - Knoppen «Перепід'єднати» (Opnieuw verbinden) en «Відкликати» (Intrekken).
   - Instelling «Додаткове підтвердження кожного нового під'єднання» (Extra bevestiging bij elke nieuwe verbinding: passkey of app-code) en advies als 2FA ontbreekt.
6. **Migratie 0045**:
   - velden `agent` en `v2_keuze` op verzoeken en tokens;
   - tabellen `connector_v2_rechten`, `connector_v2_voorkeur` en `connector_v2_instellingen` (met RLS).
7. Technisch:
   - `mcp-connector.ts` opgesplitst in `lijstTools` en `roepTool`, zodat `/mcp` en v2 door dezelfde poorten gaan;
   - het logboek bewaart de v2-naam en de agent;
   - cloudflared-sjabloon aangevuld (optioneel, zie `deploy/VERBINDER-V2.nl.md`).

## Controles
- Eenheidstest `connector-v2` — 43/43:
  - namen en limiet van 64 tekens;
  - catalogus tegenover echte hulpmiddelen;
  - modi en verschilweergave bij opnieuw verbinden;
  - koppeling van token aan adres;
  - vreemde naam geeft `AGENT_MISMATCH`, niet-gekozen toestemming geeft `PERMISSION_OFF`;
  - beperken werkt direct, uitbreiden alleen via opnieuw verbinden;
  - eigenaar met beide ruimtes; na verlies van de eigenaarsrol verdwijnen `_beheer`-hulpmiddelen.
- Geen regressies: `mcp-connector` 71/71, `ai-toegang`, `site-tools`, `mcp-spiegel`.
- E2E in Chrome, `connector-v2` — 22/22:
  - volledig pad: Claude → stappenvenster → code → token;
  - `/ai/claude` via echte padverdeling;
  - tabblad «З'єднувачі»;
  - telefoon 390 px zonder afkapping;
  - geen enkele fout in de console.

## Beperkingen van fase 1
- De serverdeuren staan nog op `/grok`, `/claude`, … Daarom draait v2 op `/ai/<agent>`.
- v2 accepteert alleen OAuth. Handmatige `tvh_`-tokens werken zoals voorheen via `/mcp` en de deuren.

## Tests die ik heb bijgewerkt (vanuit basis a2bbb13)
- `agents`: `consumePairingCode` geeft nu `{ userId, ruimte }` terug (wijziging van de andere agent), terwijl de test een string verwachtte.
- `mcp-een-klik`: de serverdeuren openen het toestemmingsvenster nu op `/verbindingen` (technische ruimte), terwijl de test `/agents` verwachtte.

## Bekende fouten die al vóór mij bestonden (ook op a2bbb13)
- `passkeys` 71/78, `server-beheer`, `uitrol-deur`: vereisen `/etc/mijn-ruimte` en systemd van de echte server.
- `beleid-afdwingen` 10/11 (`GEEN_TECH_PROFIEL`): de testdatabase bevat een «vervuilde» eigenaar na e2e. Dit ligt niet aan de code.
- e2e `agenten` 2/3 en `mcp-een-klik`: falen eveneens op a2bbb13. e2e `ai-beleid` 16/18 (pagina's `admin/ai` en `#ai`, die ik niet
  heb aangeraakt): apart na te kijken.
