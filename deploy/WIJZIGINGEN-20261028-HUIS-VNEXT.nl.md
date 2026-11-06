> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261028-HUIS-VNEXT.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261028-HUIS-VNEXT.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

## Huis vNext — huis.tarasevych.com (28-10-2026)

Implementatie van het pakket `Mijn_Ruimte_Huis_vNext` (bestek `ТЕХНІЧНЕ_ЗАВДАННЯ_HUIS_VNEXT.md`, startpunt `00_АГЕНТУ_ПОЧАТИ_ЗВІДСИ.md`) in het bestaande project. Basis: archief **`mijn-ruimte-20261028-224316`** + branch `notities-vnext` (migratie 0127). Branch **`huis-vnext`**, migratie **`0128_huis_vnext.sql`**, featureflag **`huis-vnext`** (standaard uitgeschakeld → oude informatiepagina ongewijzigd). **Productie is niet gewijzigd en niet uitgerold.**

> **Gerebased op 29-10-2026:** de basis is nu **`mijn-ruimte-20261028-233308`** (pagina "Terugdraaien", tak `fix-technische-modules`, commit `f7eafb075585`) — een tussentijdse release van een andere agent. Er is geen overlap in bestanden (die release wijzigde terugdraaien/overzicht/gezondheid, deze wijzigt notities/huis); de rebase is schoon, zonder enige wijziging in de bestanden van dit pakket. Opnieuw gecontroleerd op de nieuwe basis: `huis-vnext` 53/53, `notities-vnext` 62/62, `terugdraai-controle` 25/25, e2e `huis` 49/49, e2e `notities` 39/39, `npm run build` PASS, `tsc` 3/20 (basis).


De prioriteitsvolgorde uit het bestek is aangehouden: 1) identity/access + Huis Core toestand model → 2) alleen-lezen adapter → 3) UI → 4) confirmed opdracht path → 5) scènes/regels (regels alleen als concept+simulatie) → 6) echte integraties (alleen Home Assistant) → 7) showroom/calculator (zonder prijzen).

### Principes vastgelegd in de code (shared/huis-model.ts, backend/huis-vnext.ts)

* **Geen verzonnen status.** Een status bestaat uitsluitend als waarneming met `waargenomen_op`/`ontvangen_op`/`kwaliteit`. Zonder meting — `onbekend`; ouder dan 15 min — `verouderd`; `unavailable` bij de bron — `onbeschikbaar`. De UI toont dit op elke kaart (linkerbalk + tekst), nooit "groen = aan" zonder gegevens.
* **Opdracht pas uitgevoerd na ACK.** Toestandsmachine `verzocht → aanvaard → verzonden → bevestigd → waargenomen → voltooid` (of `geweigerd/verlopen/mislukt/gedeeltelijk/offline`); `voltooid` pas wanneer de bron de gewenste status heeft teruggegeven (3 polls van 500 ms, daarna nalezen tot de deadline van 20 s). De idempotentiesleutel is uniek per woning; alles staat met correlatie in het logboek.
* **Kritieke beveiliging uitsluitend door een mens.** Slot, beveiliging, sirene, rook/gas: een AI-voorstel wordt al bij het aanmaken geweigerd (`KRITIEK_ALLEEN_MENS`), scènes en regels accepteren zulke stappen niet (`STAP_KRITIEK_NIET_TOEGESTAAN`/`DAN_KRITIEK_NIET_TOEGESTAAN`), en een mens kan dit alleen via expliciete bevestiging in de UI + server-side step-up (`STEP_UP_VEREIST`). Opdrachten zijn sowieso pas mogelijk na een afzonderlijk "Opdrachten toestaan" voor de integratie (eveneens met step-up; alleen de woningeigenaar).
* **Compatibiliteit op basis van model/mogelijkheden, niet op merk.** Het capability-model (`aan_uit, helderheid, kleurtemperatuur, temperatuur, doeltemperatuur, open_dicht, positie, vergrendeld, alarm, contact, beweging, water, rook, gas, aanwezigheid, energie, vermogen, …`) wordt afgeleid uit het HA-domein + attributen (`vertaalEntiteit`). Er zijn geen merklogo's; de integratiecatalogus vermeldt eerlijk: **alleen Home Assistant `beschikbaar`**; Matter/Zigbee/Z-Wave/KNX/Loxone/Tuya/Google Home/Alexa/MQTT — `gepland` (geen adapter, geen knoppen); Ajax, Apple Home, camera's/RTSP — `niet_ondersteund` met reden en bronverwijzing.
* **Geen open poorten.** De adapter maakt een uitgaande verbinding vanaf de server naar Home Assistant (LAN/VPN), `http(s)` zonder userinfo/query, loopback/link-local worden geweigerd (`veiligAdres`), time-out van 8 s, limiet van 6 MB. Het token wordt versleuteld met een envelope-sleutel (`HUIS_ADAPTER_SLEUTEL_V1`, fallback `TOTP_ENCRYPTION_KEY_V1`), wordt nooit teruggegeven aan de client en komt nooit in het logboek terecht.
* **Isolatie.** Alle tabellen `app.huis_*` vallen onder RLS via het woninglidmaatschap (`app.huis_leden`: `eigenaar/lid/gast/installateur/ondersteuning`, de laatste twee tijdelijk met `geldig_tot`); zoekopdracht's lopen via `alsGebruiker` (dezelfde draaischijf als bij notities).

### Wat er is gerealiseerd

| Onderdeel (bestek) | Status | Waar |
|---|---|---|
| Overzicht: kanaal (lokaal/verouderd/geweigerd/geen gateway), eerlijke lege status met één CTA, tegels uitsluitend op basis van metingen (temperatuur met bron en tijdstip, licht "aan (bevestigd)", energie gemeten/totaal, beveiliging "onbekend" zonder officiële status), mini-plattegrond, scènes, 3 laatste gebeurtenissen | **implemented** | `src/huis/onderdelen/Overzicht.tsx` |
| Kamers: verdiepingen, schematische 2D-plattegrond (SVG, toetsenbord, altijd een lijst aanwezig), toevoegen/hernoemen/verwijderen, verschuiven/grootte wijzigen met knoppen, kamerpaneel met bediening, apparaten verplaatsen | **implemented** (zonder 3D, zonder scan) | `Kamers.tsx`, `Plattegrond.tsx` |
| Apparaten: zoeken/filters (type, kamer, versheid), kaarten met werkelijke waarde + versheid, inspecteur (toestanden, mogelijkheden, bron, hernoemen/kamer/verbergen), bediening met levenscyclus van de opdracht | **implemented** | `Apparaten.tsx`, `ApparaatBediening.tsx` |
| Scènes: editor (alleen bedienbare niet-kritieke apparaten), uitvoering met ACK per stap, resultaat `voltooid/gedeeltelijk/mislukt`, correlatie | **implemented** | `Scenes.tsx`, `sceneUitvoeren` |
| Automatiseringen: editor Wanneer/Als/Dan (tijd+dagen, status, drempel; tijdvenster, status, aanwezigheid; scène/opdracht/melding), beveiligingen (afkoeltijd, max/dag, vertraging), **droogloop** zonder I/O op echte waarnemingen met uitleg per voorwaarde en waarschuwingen (lus, zonder afkoeltijd, kritiek in "Dan") | **implemented als concept+simulatie**; **uitvoering van regels door de server — NIET IMPLEMENTED** (status `aan` wordt eerlijk geweigerd: `NOG_NIET_UITVOERBAAR`) | `Automatiseringen.tsx`, `droogloop()` |
| Beveiliging: uitsluitend waarnemingen (contact/beweging/rook/gas/water/slot/paneel/aanwezigheid), expliciet `gecertificeerd: false`, waarschuwing bij geactiveerde sensor, slot/paneel alleen door een mens met bevestiging | **implemented** (geen gecertificeerd alarmsysteem — zo staat het er ook) | `Beveiliging.tsx` |
| Energie: alleen gemeten waarden (`vermogen/energie`), geschiedenis uit `history/period` van de bron als SVG-lijn, zonder tarieven/schattingen | **implemented** | `Energie.tsx`, `haGeschiedenis` |
| Gebeurtenissen: logboek met bron, type, ernst, brontijd, correlatie, filter, cursor | **implemented** | `Gebeurtenissen.tsx` |
| Integraties: eerlijke catalogus + Home Assistant-wizard (adres+token → controle `/api/`, `/api/config` → ontdekken (met "al op de site"/kritiek/offline) → geselecteerde importeren → synchronisatie (bijgewerkt/verdwenen/nieuw) → opdrachten toestaan (extra bevestiging) → ontkoppelen) | **implemented** | `Integraties.tsx`, `backend/huis-adapter-thuis-assistent.ts` |
| AI-assistent: keten voorstel → menselijk besluit → opdracht via `ai-voorstel` met ACK; kritieke acties worden geweigerd; TTL van voorstel; handmatig aanmaken voor ketentest | **implemented** (er is geen ingebouwde woning-chatbot — voorstellen komen binnen via MCP/pagina; zo staat het er ook) | `Assistent.tsx`, `voorstelMaken/voorstelBesluiten` |
| Instellingen: naam/tijdzone/verdiepingen, leden met rollen (tijdelijk voor installateur/ondersteuning), extra woning | **implemented** | `Instellingen.tsx` |
| Showroom: demo op fictieve gegevens met expliciete aanduiding, demo-plattegrond, 3 scenario's ("Avond", "Ochtend", "Water") als stapsgewijze tekst-playback, zonder API/opdrachten/tokens | **implemented** | `Showroom.tsx` |
| Calculator: woningtype/m²/fase/functies → zones, aantallen, complexiteitsfactoren; **zonder prijzen** (bestek: prijslijst niet geverifieerd) | **implemented** | `Planner.tsx`, `plannerStructuur()` |
| uk/nl, toetsenbord (Esc, Tab-trap in lagen), aria (switch met `aria-checked="mixed"` bij onbekende status, `role=tablist`), tikdoelen ≥ 44 px, safe-area, licht/donker via tokens, onderste balk op telefoon | **implemented** | `src/huis/huis.css`, `HuisLaag.tsx` |
| WebSocket/push-updates | **NIET IMPLEMENTED** — polling elke 30 s + knop "Vernieuwen"; opdrachten worden elke 1,5 s gepolld tot de eindstatus | — |

Navigatie: 13 tabbladen van `huis` geregistreerd in `public/canonical-service.js` (slugs: `overzicht, kamers, apparaten, scenes, automatiseringen, beveiliging, energie, activiteit, integraties, assistent, instellingen, showroom, planner`), `shared/menu-model.ts`, `shared/werkblad-register.ts`, `src/menu-voorkeuren.tsx`, `src/VerenigdDienstApp.tsx`. De submenu-iconen zijn uniek en vallen niet samen met de hoofdiconen (test `menu-v2`).

### Integratiematrix (eerlijk)

| Integratie | Status in code | Opmerking |
|---|---|---|
| Home Assistant (REST, long-lived token) | **implemented** — lezen van alle entiteiten; opdrachten `light/switch/input_boolean/fan/cover/climate/lock` (`lock` alleen mens+step-up); history | alleen getest tegen een **gesimuleerde** HA (`tests/eenheid/hulp/nep-thuis-assistent.ts`); **echte hardware — NIET TESTED** |
| Matter/Thread, Zigbee, Z-Wave, Tuya/LSC, MQTT/ESPHome | **planned** — alleen via Home Assistant | geen eigen adapter, geen "Koppelen"-knoppen |
| KNX, Loxone, Google Home, Alexa | **planned** | geen adapter |
| Ajax Systems | **restricted/unsupported** — Enterprise API voor partners | beloven we niet; bediening alleen vanuit de eigen app |
| Apple Home | **niet-ondersteund** vanuit een website | HomeKit alleen via native SDK |
| Camera's/RTSP | **niet-ondersteund** in deze release | geen streams |

### Controles (echte cijfers, deze omgeving)

Omgeving: Node v22.22.0 (de repository vraagt ≥ 24; EBADENGINE), PostgreSQL 16 lokaal (`127.0.0.1:55432`), Chromium (Playwright 1194), zelfondertekend certificaat `*.tarasevych.com` (`ignoreHTTPSErrors` alleen in e2e), gesimuleerde Home Assistant op een niet-loopback-adres van de machine (de adapter weigert loopback).

| Testset | Resultaat |
|---|---|
| `tests/eenheid/huis-vnext-20261028.test.ts` (migratie ×2 idempotent, RLS/rollen, adressen/token, verbinden/ontdekken/importeren, versheid, opdracht met ACK, trage bron → `verzonden` zonder "voltooid", dove bron → `verlopen`, kritiek → step-up, gast → `ROL_ALLEEN_LEZEN`, scène met stapsgewijze ACK, droogloop zonder I/O, automatisering `aan` geweigerd, AI-voorstel → goedkeuring → opdracht, energie/beveiliging/logboek zonder token, synchronisatie, bron onbereikbaar → `offline`, ontkoppelen, model, catalogus, planner zonder prijzen) | **53/53 PASS** |
| `tests/e2e/huis-vnext.e2e.ts` (echte server + Postgres + nep-Google + nep-HA; vlag uit → oude pagina; aan → woning → lege status → HA-wizard (token nergens op de pagina, in DB als envelope) → 13 ontdekken → import → kaarten 11 actueel/1 onbekend/1 offline → alleen-lezen inspecteur → "Opdrachten toestaan" → lamp `voltooid` met ACK (`turn_on` bij de bron, rij `voltooid/site/site-…` in DB) → slot: bevestiging, niets verzonden vóór "Ja" → kamers/plattegrond/verplaatsen/`heeft-licht` → scène (slot niet selecteerbaar) `voltooid` 2/2 → regel: alleen concept/simulatie, droogloop 07:00 ja / 09:00 nee zonder enige bronaanroep → beveiliging `gecertificeerd=false` → energie 2 meters zonder € → AI-voorstel → goedkeuring → `switch` bij de bron → logboek zonder token → showroom/planner → 320/390/768/1024/1440 × licht/donker zonder horizontale scroll, inspecteur schermvullend op 390, tikdoel 44 px, "Meer"-menu; 0 console-/pagina-/4xx-fouten of externe verzoeken) | **49/49 PASS** (screenshots in het bewijsarchief) |
| `npm run build` (kaart-controle, plaatsing-controle, zoek-ui-catalogus, l002-audit, mail-slimme-inbox-audit, kleur-contrast-controle, vite, tech-bundels, extensie, server) | **PASS** (exit 0) |
| `tsc -p tsconfig.json` / `tsc -p tsconfig.server.json` | 3 / 20 fouten — **dezelfde als in het basisarchief** (cloud/React unused; mail-afzenders, index.ts gmail*); 0 in nieuwe bestanden |
| Regressie van registers/menu: `menu-indeling` 32/32, `menu-v2` 35/35, `menu-oppervlak` 14/14, `werkblad-register-20261027` 34/34, `plaatsing-20261025` 68/68, `vertaalpaneel-20261019` 33/33, `gebruiker-audit-2026-10-19` 44/44, `zoek-in-menu-20261024` 23/23, `zoek-ui-20261022` 61/61, `integraties-catalogus` 22/22, `menu-per-profiel-20261019` 40/40, `thema` 17/17 | PASS |
| `ui-audit-g` 58/59 | **dezelfde fout als in het basisarchief** (8a band-verbergen) |
| Notities vNext op deze branch: `notities-vnext-20261028` 62/62 (opnieuw na huis-wijzigingen); e2e 39/39 op commit `notities-vnext` | PASS (bestanden overlappen niet) |
| `deploy/huis-vnext-terugdraaien.sql` | **uitgevoerd** op een aparte DB `mr_vers`: 11 tabellen + vlag + migratie-item verwijderd; `migrate.mjs` heeft 0128 daarna opnieuw zonder fouten toegepast |

**NIET TESTED:** echte Home Assistant en echte apparaten (alleen gesimuleerde REST); RLS met de rollen `mijnruimte_app/system` op productie (hier één superrol; policies worden aangemaakt, maar de daadwerkelijke isolatie tussen gebruikers wordt alleen gecontroleerd door de `lidVan`-logica); step-up met een **verouderde** sessie (in e2e is de sessie vers, waardoor step-up doorgaat; op productie verschijnt het venster "Toegang bevestigen" — het gedeelde mechanisme `src/platform/stap-op.ts`); gedrag bij >1000 entiteiten (importlimiet in de code is 2000).

### Migratie 0128 (veilig, idempotent)

`CREATE TABLE IF NOT EXISTS` ×11 (`huis_woningen, huis_leden, huis_ruimtes, huis_integraties, huis_apparaten, huis_toestanden, huis_opdrachten, huis_scenes, huis_automatiseringen, huis_gebeurtenissen, huis_voorstellen`), RLS-policies op basis van lidmaatschap, GRANT's (`migrations/rechten.sql` aangevuld), vlag `huis-vnext` (`ON CONFLICT DO NOTHING`, uitgeschakeld). Raakt bestaande tabellen niet aan. Nieuwe variabele **`HUIS_ADAPTER_SLEUTEL_V1`** (optioneel; `ENV-VARS.md`).

### Terugdraaiplan

1. Normaal: `mijn-ruimte-installeer` → vorige release. De tabellen uit 0128 blijven staan, de oude code leest ze niet; de oude pagina `huis` blijft ongewijzigd.
2. Alleen de nieuwe pagina uitschakelen: vlag `huis-vnext` → UIT (Functieschakelaars) — direct terug naar de oude informatiepagina, gegevens blijven behouden.
3. Tabellen verwijderen: `deploy/huis-vnext-terugdraaien.sql` na `pg_dump -t 'app.huis_*'` (instructie in het bestand). In Home Assistant verandert er niets.

### Gewijzigde/nieuwe bestanden

Nieuw: `migrations/0128_huis_vnext.sql`, `shared/huis-model.ts`, `backend/huis-vnext.ts`, `backend/huis-adapter-thuis-assistent.ts`, `src/huis/{HuisPagina,HuisLaag,ApparaatBediening}.tsx`, `src/huis/{huis-client,huis-vlag,tekst}.ts`, `src/huis/huis.css`, `src/huis/onderdelen/{Overzicht,Plattegrond,Kamers,Apparaten,Scenes,Automatiseringen,Beveiliging,Energie,Gebeurtenissen,Integraties,Assistent,Instellingen,Showroom,Planner}.tsx`, `tests/eenheid/huis-vnext-20261028.test.ts`, `tests/eenheid/hulp/nep-thuis-assistent.ts`, `tests/e2e/huis-vnext.e2e.ts`, `deploy/huis-vnext-terugdraaien.sql`, dit bestand.
Gewijzigd: `backend/index.ts` (registratie van `huisRoutes` met step-up), `src/DomoticaWeergave.tsx` (schakelaar op vlag; oude pagina `SmartHomeOud` ongewijzigd), `src/VerenigdDienstApp.tsx` (huis-tabbladen + `onNavigateTab`), `public/canonical-service.js`, `shared/menu-model.ts`, `shared/werkblad-register.ts`, `src/menu-voorkeuren.tsx` (13 tabbladen), `shared/vlaggen.ts` (toelichting vlag), `migrations/rechten.sql` (GRANT 0128), `scripts/plaatsing-vaste-elementen.json` (`.hv-laag`, `.hv-onderbalk` met reden), `scripts/e2e-lokaal.mjs` (eigen interface-adressen van de machine gelden als lokaal — voor nep-HA; naar buiten gaat nog steeds niets), `ENV-VARS.md`.

### Bevindingen tijdens het werk (opgelost)

* Chrome `data-surface-model=flat-content` verwijdert zijranden en border-radius bij elke `<section>/<article>` in de inhoud — woningkaarten tonen de versheid in de linkerbalk, dus dit is met dezelfde specificiteit hersteld (`huis.css`, onderaan het bestand).
* De algemene regel `.hv svg {16px}` verkleinde de SVG-plattegrond tot icoonformaat — `.hv-plan`/`.hv-lijn` zijn hiervan uitgesloten.
* In e2e onderschept nep-Google **alle** `fetch`-aanroepen (599) — voor nep-HA gaat een echte fetch alleen naar het eigen adres van de machine; het socket-slot in `e2e-lokaal.mjs` staat nu eigen interfaces toe.
* `menu-v2`: submenu-iconen moeten uniek zijn en mogen niet samenvallen met hoofdiconen — `scenes:workspace`, `automations:workflows`, `assistant:ai-access`.

**Uitrol uitsluitend na de afzonderlijke zin van de eigenaar `DEPLOY ПІДТВЕРДЖЕНО` en goedkeuring met passkey op de site.**
