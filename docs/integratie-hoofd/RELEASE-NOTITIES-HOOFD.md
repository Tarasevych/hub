# Hoofdarchief Mijn Ruimte: integratie van 10 werkpakketten

Basis: `20261029-131639` (claude, Cloud vNext). Er is geen nieuwere release van een andere agent gevonden: in `/workspace/nieuw-andere*` staan alleen 144748, 074233 en 131639, en `a.gz` is hetzelfde 131639-archief. Agent: grok. Auteur: Pavlo Tarasevych. **Niet uitgerold.**

## Werkpakketten, vlaggen en migraties

| WP | Wat | Vlag (standaard UIT) | Migratie |
|---|---|---|---|
| UI-001 | Submenu via rechtsklik of lang drukken (alleen horizontaal menu boven/onder, scherm >700 px) | — (geen vlag, additief gebaar) | — |
| UI-002 | Dienst «Фото» + Agenda/Foto naar «Мій простір» | `foto-dienst`, `menu-kalender-foto-eigen` | 0153 |
| UI-003 | Verbindingencentrum `/accounts` | `verbindingen-centrum-v2` | 0151 |
| UI-004 | «ШІ для вас» gaat niet meer naar MCP (bugfix) | — | — |
| UI-005 / BUG-001 | Huis: RLS-kringloop weg (500-fout), eerlijke laad/fout-toestand | — (nieuw beginscherm binnen bestaande `huis-vnext`) | 0131 |
| BUG-002 | Venster «Перевірка всіх адрес» sluit niet meer vanzelf (bugfix) | — | — |
| UI-006 / BUG-003 | Bijlageviewer v2; PDF-scroll met wiel/twee vingers (bugfix zonder vlag) | `bijlage-viewer-v2` | 0134 |
| UI-007 | Meldingencentrum v2 (+ RLS voor melding_regels_v1) | `meldingen-v2` | 0142, 0143 |
| UI-008 | Verfijnd accountmenu | `accountmenu-v2` | 0141 |
| UI-009 | Mail zoeken en filters v2 | `mail-zoeken-v2` | 0150 |

Migraties na 0130: 0131, 0134, 0141, 0142, 0143, 0150, 0151, 0153. Ze zijn uniek en oplopend, zonder dubbele nummers (gecontroleerd met `ls migrations | sed 's/_.*//' | sort | uniq -d`, uitkomst leeg). Niet gebruikte reserveringen: 0132, 0133, 0135–0140, 0144–0145, 0152, 0154–0159. Er zijn geen dubbele vlag-sleutels in `migrations/*.sql` of in `shared/vlaggen.ts`. Na de migraties staan alle 17 vlaggen op `aan=false` en `standaard=false`.

UI-007 en UI-009: hun brief vraagt een aparte bevestiging van de eigenaar («DEPLOY ПІДТВЕРДЖЕНО») voor productie. Beide staan achter een vlag die standaard UIT is.

## Opgeloste samenvoegconflicten (beide kanten behouden, niets verwijderd)
1. `shared/vlaggen.ts`: UI-008 tegen UI-006 → beide uitlegblokken.
2. `scripts/plaatsing-vaste-elementen.json`: UI-007 tegen UI-006 → beide selectors.
3. `shared/vlaggen.ts`: UI-009 tegen UI-006 en UI-008 → alle drie de blokken.
4. `src/GoogleMailWerkruimte.tsx`: UI-009 tegen UI-006. Het gaat om één regel van 66 KB, samengevoegd met een 3-weg-merge per token (`git merge-file`, 0 restconflicten). `BijlageV2Kop` en `MailZoekenV2` zitten er allebei in.
5. `TESTRESULTATEN`: UI-009 tegen BUG-002 → vervangen door de integratie-uitslag.
6. `scripts/plaatsing-vaste-elementen.json`: UI-002 tegen UI-006 en UI-007 → alles behouden (114 «bestaand», geen dubbele sleutels).
7. `shared/zoek-ui-knoppen.generated.ts` opnieuw gegenereerd met `scripts/zoek-ui-catalogus.mjs` (via de build).

Zonder conflict samengevoegd: `CanoniekOmlijsting.tsx` (UI-001 en UI-002), `backend/index.ts` (UI-007 en UI-002), `CanoniekMeldingencentrum.tsx` (alleen UI-007).

## Eigen correcties tijdens de integratie
- De browserscripts van BUG-002 (`scan-melding.e2e.ts`, `scan-melding-fotos.ts`) zijn verplaatst van `tests/e2e/` naar `scripts/lokaal-e2e/`. Ze startten Chrome zonder `chromeArgs()`, waardoor het e2e-slot van `scripts/e2e-lokaal.mjs` ALLE e2e-tests weigerde.
- De test `hub-bureau-20261019` accepteert nu ook de UI-002-voorwaarde `hubTab!=='photos'`.
- De «?» van het verbindingencentrum (UI-003) krijgt de klasse `is-icoon`. In de echte app maakte de algemene mobiele regel `min-height:44px` er een ovaal van (22×44). In het harnas van UI-003 was dat niet zichtbaar.
- `shared/vlaggen.ts` heeft nu een uitleg in het Oekraïens en Nederlands voor `verbindingen-centrum-v2`. Die ontbrak, waardoor Pavlo alleen de sleutel zou zien.

## UFW-bestanden
`src/DriveBrowser.tsx`, `src/MailBijlageVensters.tsx`, `src/MailBijlageVoorbeeld.tsx`, `src/bestand/*`, `docs/universele-bestanden/` en `integrations/` zijn byte-identiek aan 20261028-144748 (`diff -rq`).

## Testresultaten (echt uitgevoerd, uit het uitgepakte archief)
- `npm ci`, `NODE_ENV=production npm run build` (kaart-, plaatsing-, hulp-, contrast- en tech-bundelcontrole, vite, extensie, server), `npm prune --omit=dev`: alle exit 0.
- Migraties op een lege Postgres: 130 uitgevoerd. De tweede keer: «niets te doen, schema is actueel».
- Server: `/__gezondheid` 200 op hub, mail, cloud en huis. OFREP voor nieuwe vlaggen zonder sessie geeft 401.
- Eenheidstests, elk bestand in een eigen proces (`eenheid-vergelijking.txt`):
  - Integratie: 298 bestanden, 10103 OK, 61 FOUT, 37 bestanden met exit≠0.
  - Basis 131639 (zelfde omgeving): 288 bestanden, 9893 OK, 62 FOUT, 38 bestanden met exit≠0.
  - **Geen enkel bestand slechter dan de basis.** Alle 37 falende bestanden falen identiek op de basis (omgevingsafhankelijk: geen aparte app/systeem-DB-rollen, enz.). De verschillen in foutregels bij audit-account, contrast-knoppen, ontwerp-fundament en tech-ruimte-pagina zijn alleen willekeurige id's.
  - `ruimte-cloud-agenda` faalde één keer op de basis en slaagt bij de integratie (wisselvallig).
  - Nieuwe WP-tests: accountmenu-v2 13, ai-doorverwijzing 13, bijlage-viewer-v2 14, dock-snelmenu 12, foto-dienst 54, mail-zoeken-v2 33, meldingen-v2 38, scan-weergave 28, verbindingen-sync 4, allemaal zonder fouten. `verbindingen-centrum` (node:test) apart: 6/6 samen met sync.
- `uitrol-deur` «geen NoNewPrivileges=no in deploy/» faalt alleen in een git-checkout (de test gebruikt `git ls-files`). Dat geldt evengoed voor de basis: `deploy/mijn-ruimte-besluit.service` bevat dit al in 131639. Het is een bekend basispunt, niet van deze integratie.
- agent-namens: 45/45, zowel per bestand als in de officiële één-procesrunner, op basis én integratie. De crash die UI-002 meldde (`OWNER_REQUIRED` en dan `ns.id` undefined) kwam door de omgeving: de test-DB werd gedeeld met een e2e-server die al een andere eigenaar had. De officiële runner `scripts/eenheidstests.mjs` stopt op basis én integratie op dezelfde plek, bij `ai-toegang-beheer` (`CANONICAL_SERVICE_RUNTIME_MISSING`), en is daarom per bestand gedraaid.
- E2E (Chrome, lokaal):
  - menu-dock-snelmenu 58/58
  - huis-start 27/27
  - bijlage-viewer-v2 132/132
  - accountmenu-v2 82/82
  - meldingen-v2-ui 29/29
  - mail-zoeken-v2 172/172
  - scan-melding (BUG-002): 2 scenario's, zelfOpen 0, fouten 0
  - foto-dienst-ui 24/24 (op de geprunede server uit het archief)
- Integratie-schermen met alle vlaggen AAN: 50/50. Het menu, het accountmenu en de meldingenbel openen en sluiten op 390 en 1440, in licht en donker, er ontstaan geen twee overlappende panelen, er is geen horizontale overloop op /accounts en er zijn geen paginafouten.
- Vlaggen UIT tegenover de basis (DOM-opbouw, `vlaggen-uit-vergelijking.txt`): 18 van de 20 schermen zijn identiek (hub, accountmenu, meldingen, agenda, cloud/accounts, cloud/calendar, cloud/photos, mail, huis). Het enige verschil is het rechtstreekse adres `hub/photos`: de basis toont daar «не знайдено», de integratie de tekst «Розділ «Фото» ще не ввімкнено.» (UI-002).

## Niet getest of bekende beperkingen
- Niet getest op de echte site, met echte Google/Gmail/OneDrive-accounts of met echte sessies van Pavlo, en ook niet op iOS Safari of een echt toestel (wel Chrome-emulatie).
- Mail zoeken v2 en bijlageviewer v2 zijn alleen in hun stand getest, niet in de volledige mail-app met een gekoppeld account.
- UI-001 staat niet achter een vlag. Het voegt alleen een gebaar toe (rechtsklik of lang drukken), het normale klikken blijft gelijk.
- Fotodienst: de pagina toont de kop «Фото» twee keer (paginakop en sectiekop). Op een lege bibliotheek staat soms «0 файлів · 1 КБ». Dit is cosmetisch en ongewijzigd uit UI-002.
- Op de telefoon bedekt het meldingenblad het hele scherm, ook de avatar. Eerst sluiten (Esc of ✕) en dan het accountmenu openen werkt wel.
