> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./AGENTS.uk.md) · **🇳🇱 Nederlands** ([🔒 canoniek `AGENTS.md`](./AGENTS.md)) · [🏠 Hoofdpagina (NL)](./LEESMIJ.md) · [🏠 Головна (UK)](./README.md) · [📚 Documentatie-index](./docs/INDEX.nl.md)

# AGENTS.nl.md — Eén regelset voor alle AI-agenten van Mijn Ruimte (Nederlandse versie)

**Status:** volledige Nederlandse versie van de canonieke regelbron [`AGENTS.md`](./AGENTS.md) (`ORCH-001`). Versie van de regels: zie [`orchestratie/beleid.json`](./orchestratie/beleid.json) → `regelsVersie`; cryptografische vingerafdruk — [`orchestratie/regels.lock.json`](./orchestratie/regels.lock.json).
`CLAUDE.md`, `GEMINI.md`, `.cursorrules`, enz. zijn uitsluitend adapters die naar het canonieke [`AGENTS.md`](./AGENTS.md) verwijzen. Als een ander document in tegenspraak is met [`AGENTS.md`](./AGENTS.md), geldt [`AGENTS.md`](./AGENTS.md).

Wijziging van de regels = een nieuw besluit in [`orchestratie/BESLUITEN.md`](./orchestratie/BESLUITEN.md) ([🇳🇱 NL](./orchestratie/BESLUITEN.nl.md) · [🇺🇦 UK](./orchestratie/BESLUITEN.uk.md)) + hogere `regelsVersie` + `node scripts/orch.mjs vergrendel`. Anders faalt `orch controleer`.

---

## 0. Hoofdprincipe

Één projectgeheugen, één regelset, één integratiewachtrij, één afgestemde release — ongeacht het aantal en het type agenten
(Claude, Antigravity, ChatGPT, Codex, Grok, Copilot, Gemini, Cursor en toekomstige agenten).

## 1. Platform (onveranderlijk)

- **Mijn Ruimte** is een zelfstandig BYOS-platform (Ubuntu-VM op de eigen hardware van de gebruiker). Geen externe clouds voor hosting of uitrol.
- Releases zijn atomisch: `mijn-ruimte-YYYYMMDD-HHMMSS.tar.gz`, SHA-256, installatie uitsluitend via `/usr/local/sbin/mijn-ruimte-installeer`
  (`deploy/uitrol/mijn-ruimte-uitrol.sh`). Pakketregels: [`deploy/REGELS-UITROLPAKKET.nl.md`](./deploy/REGELS-UITROLPAKKET.nl.md) / [`deploy/REGELS-UITROLPAKKET.md`](./deploy/REGELS-UITROLPAKKET.md) (`UITROL-VERSIE`, `AUTEUR`, `AGENT`, `SAMENVATTING`, `BRON-COMMIT`, `UITROL-MANIFEST.json` vanaf `20261101`).
- Geen ruwe root-acties met de hand: acties lopen via de werkgebruiker (`beheer`), systeemwijzigingen via vooraf geschreven configuraties en systemd-units. Niets uitpakken in `/root`.
- Gebruikersruimtes zijn geïsoleerd en versleuteld met hun eigen aanmeldmethode; de servereigenaar kan deze niet ontsleutelen.
- Talen: communicatie en rapportages in het Oekraïens; commentaar in de code in het Oekraïens of Nederlands; UI-teksten in het Oekraïens en Nederlands.
  Engels uitsluitend voor onvertaalbare technische termen. Paden en URL-adressen in het Nederlands (`/verbindingen`, niet `/connections`).
- Stack van VM `<VM-IP>` (`B-009`): `Ubuntu 26.04.1 LTS` (`kernel 7.0`, `glibc 2.43`, `systemd 259.9`), `Node.js 26.13.0 LTS`, `PostgreSQL 18.6`,
  `Caddy 2.11.7` (`admin.sock|0660`), `OPA 1.22.0`, `age 1.3.2`, `cloudflared 2026.10.7`, `Docker 29.9.2`. In `deploy/*.service` staat `RestrictSUIDSGID=no` (anders blokkeert seccomp `openat2` in `tar 1.35`).

## 2. Vóór je begint (verplicht)

1. Lees [`AGENTS.md`](./AGENTS.md) (of `orchestratie/CONTEXT-COMPACT.md` als er geen toegang tot de repository is) en [`orchestratie/beleid.json`](./orchestratie/beleid.json).
2. Codebasis: `beleid.json → basis.bronCommit` (nu `f3f3fabb…`, versie `20261105-061659`, status `geverifieerd_productie` — geverifieerd met de server, zie `B-014`; de takken `integratie` en `voornaamst` zijn gesynchroniseerd). Als je toegang hebt tot de site, controleer dan `/api/version` en leg het resultaat vast in `BESLUITEN.md`.
3. Registreer de taak: `node scripts/orch.mjs taak-start --id ORCH-001 --agent claude --basis <sha> --tak feature/orch-001-YYYYMMDD-HHMMSS`
   (zonder repository: maak `ORCH-OVERDRACHT.json` handmatig aan volgens het sjabloon `orchestratie/sjablonen/ORCH-OVERDRACHT.json`).
4. Draai `node scripts/orch.mjs controleer` en `node scripts/orch.mjs versheid --taak <ID> --fase start`. Bij rood: niet beginnen, eerst rebasen of de regels herlezen.

## 3. Tijdens het werk

- Eigen tak `feature|fix|audit|release/<onderwerp>-YYYYMMDD-HHMMSS` vanaf de basiscommit. Één Task ID (`ABC-001`) per taak; deze staat in de taknaam, commit, PR en het pakket.
- Schrijf nooit in takken van andere agenten, `voornaamst`, `integratie` of `release/*`. Nooit force-pushen, nooit de geschiedenis herschrijven, nooit back-ups verwijderen.
- Stil overschrijven van andermans wijzigingen is verboden: bij een conflict rebasen op de integratietak, conflicten expliciet oplossen en vermelden in het rapport.
- Oude fout gevonden? Los haar op (in een aparte commit) en negeer haar niet. Verwijder nooit iets «om het werkend te krijgen»: geen knop, tabblad, test of controle weghalen.
- Geheimen, tokens, privésleutels en e-mailinhoud horen nooit in de chat, logs, commits of pakketten. Privésleutels van de eigenaar worden nooit aan agenten gegeven.
- Productie, de standaardtak, back-ups en kritieke rechten worden alleen gewijzigd na expliciete toestemming van de eigenaar (niet van een andere agent).
- Diagnostiek en tijd van de eigenaar (`B-009`): vraag de eigenaar nooit om handmatig terminalcommando's uit te voeren (`df -h`, `journalctl`) of handmatig pakketten te bouwen; geef zonder directe toegang tot `<VM-IP>` een korte technische conclusie (1–2 zinnen) voor de infrastructuuragent op de pc van de eigenaar. Gis nooit naar de oorzaak van een `voorcontrole`-fout (wijt het niet aan een `.zip` als de stap `structuur` al geslaagd is). Details hieronder bij `B-009`.

## 4. Vóór overdracht van het resultaat

1. Alles is gecommit. `node scripts/orch.mjs versheid --taak <ID> --fase overdracht` is groen (basis niet verouderd met overlappende bestanden, regels actueel).
2. Tests: `node scripts/eenheidstests.mjs <filter>`, `npm run typecheck:server` (waar mogelijk). Resultaten opnemen in `TESTRESULTATEN` (formaat v2) en in het rapport.
3. Inlevering via elk kanaal uit `beleid.json → inlevering.kanalen` (PR, MCP, HTTP API, lokaal bestand, ZIP, TAR.GZ, git patch, web-upload),
   maar altijd met `ORCH-OVERDRACHT.json`: `taakId`, `agent`, `basisCommit`, `regelsVersie`, `regelsHash`, `samenvatting`, lijst van gewijzigde bestanden, tests.
   Alles loopt door één pijplijn: `node scripts/orch.mjs inleveren --bron <bestand|map|tak>` — nieuwe tak vanaf de basis, wijzigingen, conflicten met `integratie`
   (`git merge-tree`), tests, registratie in `orchestratie/inleveringen/`, wachtrij. Een inlevering die statusbestanden wijzigt (`orchestratie/taken`, `inleveringen`,
   `wachtrij.json`, `regels.lock.json`, `geinstalleerd.json`) wordt geweigerd — die worden alleen door `orch` of de eigenaar geschreven. De enige uitzondering is het eigen
   `orchestratie/taken/<ID>.json` (declaratie van de agent uit `taak-start`); bij het samenvoegen wint de versie van `integratie` (`.gitattributes` → `merge=orch-staat`).
4. Rapport (in het Oekraïens voor de eigenaar): op de 1e regel de directe link naar `mijn-ruimte-<versie>.tar.gz` (los van `-overdracht.zip`); daarna wat klaar is, wat daadwerkelijk getest is (feitelijk, niet op basis van metadata), waar het resultaat staat, wat de volgende stap is en wat bewust niet is gedaan.
5. Taakstatus: `in_progress` → `ter_integratie` (ingeleverd) → `integrated` (samengevoegd in `integratie`) → `released` (pakket gebouwd) → `installed`
   (geïnstalleerd door de installer op de server). De status wordt uitsluitend gewijzigd door de stap die haar uitvoert; een agent zet een taak nooit zelf op `installed`.

## 5. Integratie en release

- Één sequentiële wachtrij: `orchestratie/wachtrij.json` (FIFO per basis; `wachtrij volgende|klaar|terugtrekken`, slechts één taak tegelijk `bezig`).
  Samenvoegen in `integratie` gebeurt altijd met `--no-ff`, zonder force; bij een conflict → `klaar --uitkomst afgewezen`, en de taak gaat terug naar de agent voor een rebase.
- Een pakket op een verouderde basis (`basisCommit` is geen voorouder van `integratie`, met overlappende bestanden) wordt niet uitgebracht en niet geïnstalleerd.
- Installatiemodi (`beleid.json → kritiek.installatieModi`): `handmatig`, `na_bevestiging` (Passkey/handtekening van de eigenaar; standaard),
  `automatisch_beperkt` — uitsluitend onder een apart goedgekeurd en ondertekend beleid. Momenteel zijn de eerste twee toegestaan.
- Kritiek beleid (`kritiek`) is pas geldig met bevestiging van de eigenaar in `orchestratie/regels.lock.json → eigenaar`: SSH-handtekening (`orch bevestig`)
  of passkey op de site (`eigenaar.soort = passkey`, registratie in het root-journaal); tot dat moment heeft het de status «voorstel».
- Regels wijzigen door de eigenaar zonder SSH: site `mcp.tarasevych.com/agents` → «Координація» → bewerken van de regelbestanden → controle van het voorstel (`regelsVersie`
  hoger, besluit in `BESLUITEN.md`, `beleid.json` geldig) → passkey (besluit `orch-regels`; root legt alleen de bevestiging vast in zijn eigen journaal) →
  tak `regels/<versie>-<tijd>` met nieuw lock en `CONTEXT-COMPACT.md` gaat naar `origin`. Samenvoegen in `integratie` doet alleen de eigenaar. Site/MCP/HTTP roepen
  exact dezelfde functies aan als de CLI (`inleveren`, `beoordeelVoorstel`, `vergrendel`) — er is geen aparte logica (`beleid.json → site`).
- **TRACE-001 (vanaf `20261103-211555`):** verplicht `ONTWIKKELARCHIEF.json` en een geverifieerde exacte GitHub Release-asset SHA-256. Het ontwikkelarchief is gecommit; de server en root weigeren ontbrekende, onjuiste of onbereikbare gegevens. Volledige voorwaarden hieronder, `B-007`, `deploy/REGELS-UITROLPAKKET.md` §7.

### Volledige voorwaarden voor release, ontwikkelarchief en controles (§5)

- **TRACE-001 (vanaf release `20261103-211555`):** elk pakket bevat `ONTWIKKELARCHIEF.json` met een verwijzing naar `orchestratie/ontwikkelarchieven/<TASK-ID>.json` in dezelfde GitHub-commit en een verwijzing naar de `.tar.gz`-release. Het dossier bewaart de beschikbare opdrachtteksten, stapsgewijze acties en pogingen, commits, testresultaten, bijlagen met links en hashes, tijdelijke artefacten (of het feit dat die er niet waren), onderbouwing van beslissingen, afwegingen en niet-uitgevoerde punten; het bevat nooit privésleutels, tokens, e-mailinhoud of verborgen interne modelredenering (chain-of-thought). Gegevens met beperkte toegang worden alleen met een beschrijving en hash zonder inhoud opgenomen. Na het bouwen wordt het release-asset `mijn-ruimte-<versie>.tar.gz` gepubliceerd in een GitHub Release met de versietag. De voorcontrole op de server (`voorcontrole`) en de root-installer controleren onafhankelijk van elkaar de onveranderlijke commit, de herkomst uit de opgegeven tak, de SHA-256 van het dossier en de exacte SHA-256 van het archief op GitHub; ontbreken, foutieve links, afwijkingen of onbereikbaarheid van GitHub **blokkeren de installatie onherroepelijk**. Er is geen enkele uitzondering om «zonder controle door te gaan». Oudere pakketten blijven ongewijzigd. Vereist goedkeuring van de regels door de eigenaar met Passkey/SSH en samenvoeging in de beschermde integratietak.
- Een release wordt uitsluitend gebouwd door `node scripts/orch.mjs pakket --taak <ID> --auteur "…" [--manifest …] [--testresultaten …] [--sig …]`: een compatibel
  `mijn-ruimte-<versie>.tar.gz` (via `deploy/uitrol/maak-voorstelpakket.sh`, met het bestand `UITROL-BASIS` = geïnstalleerde versie + commit + vingerafdruk
  van de regels) en het overdrachtspakket `mijn-ruimte-<versie>-<agent>-overdracht.zip` (archief, `.sha256`, `ORCH-OVERDRACHT.json`, `UITROL-MANIFEST.json`,
  `TESTRESULTATEN.json`, `RAPPORT.md`, `COMMITS.txt` + `commits.bundle`, `AGENTEN.json`, `.sig` — alleen als de eigenaar op zijn pc heeft ondertekend).
  Controle zonder installatie: `pakket-controleer --bron <zip>`; importeren aan de andere kant zonder git: `inleveren --bron <zip>` (dezelfde pijplijn).
- De installer (root) weigert een pakket als: de basis ouder is dan de geïnstalleerde versie (`BASIS_VEROUDERD`), de geïnstalleerde commit afwijkt (`BASIS_COMMIT_VERSCHILT`),
  `UITROL-BASIS` ontbreekt vanaf versie `20261201` (`GEEN_BASIS`), de regels afwijken van `regels.lock.json` (`REGELS_NIET_VERGRENDELD`), of de modus buiten het beleid valt
  (`MODUS_NIET_TOEGESTAAN`). GitOps (automatisch) werkt alleen bij `automatisch_beperkt` **én** een door de eigenaar ondertekend lock. Privésleutels worden nooit aan agenten gegeven.
- **B-009 (vanaf 04.11.2026 · stack Ubuntu 26.04.1 LTS, `RestrictSUIDSGID=no` en communicatieregels met de eigenaar):**
  1. Op VM `<VM-IP>` draaien `Ubuntu 26.04.1 LTS (Resolute)` (`kernel 7.0.0-42-generic`, `glibc 2.43`, `systemd 259.9`), `Node.js v26.13.0 LTS`, `PostgreSQL 18.6` (`/srv/data/postgresql/18/main` met `--data-checksums`), `Caddy v2.11.7` (`admin unix//run/caddy/admin.sock|0660`), `OPA v1.22.0` (`127.0.0.1:8181`), `age v1.3.2`, `cloudflared 2026.10.7`, `Docker 29.9.2`. Op de werk-pc van de eigenaar staat in `T:\mijn-ruimte\hulpmiddelen\` `Node.js v26.13.0`, `PostgreSQL 18.6-5`, `rclone v1.75.2`.
  2. In `Ubuntu 26.04.1 LTS` gebruikt `GNU tar 1.35` tijdens `--extract` de syscall `openat2(..., RESOLVE_BENEATH)`. In `systemd 259` blokkeert `RestrictSUIDSGID=yes` in het seccomp-filter `openat2` met `-ENOSYS` (`Function not implemented`), waardoor `voorcontrole` faalde bij het uitpakken van `.tar.gz`. Daarom moet in alle `deploy/*.service` en in de server-drop-ins `/etc/systemd/system/<unit>.d/ubuntu2604-openat2.conf` `RestrictSUIDSGID=no` staan (met behoud van `NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes`).
  3. Als een agent in een cloud-/webcontainer werkt zonder directe toegang tot server `<VM-IP>`, is het hem **verboden** de diagnostiek bij de eigenaar neer te leggen (vragen om `df -h`, `journalctl`, enz. uit te voeren) of blind te gissen naar de oorzaak (bijvoorbeeld de eigenaar ervan beschuldigen een `.zip` i.p.v. een `.tar.gz` te hebben geüpload terwijl `voorcontrole` de stap `structuur` al gepasseerd is). In plaats daarvan geeft de agent een korte technische notitie (1–2 zinnen) voor de infrastructuuragent op de pc van de eigenaar (Antigravity/Claude), die directe SSH-toegang heeft tot `beheer@<VM-IP>`.

---

## 6. Waar staat wat

| Wat | Waar |
|---|---|
| Regels (voor mens en agent) | [`AGENTS.md`](./AGENTS.md) ([🇳🇱 NL](./AGENTS.nl.md) · [🇺🇦 UK](./AGENTS.uk.md)) |
| Beleid (voor de machine) | [`orchestratie/beleid.json`](./orchestratie/beleid.json) |
| Besluitenregister | [`orchestratie/BESLUITEN.md`](./orchestratie/BESLUITEN.md) ([🇳🇱 NL](./orchestratie/BESLUITEN.nl.md) · [🇺🇦 UK](./orchestratie/BESLUITEN.uk.md)) |
| Vingerafdruk van regels, handtekening eigenaar | [`orchestratie/regels.lock.json`](./orchestratie/regels.lock.json) |
| Publieke sleutels van de eigenaar | [`orchestratie/eigenaar-ondertekenaars`](./orchestratie/eigenaar-ondertekenaars) |
| Compacte context (zonder GitHub/MCP) | [`orchestratie/CONTEXT-COMPACT.md`](./orchestratie/CONTEXT-COMPACT.md) (gegenereerd met: `node scripts/orch.mjs context`) |
| Taken van agenten | `orchestratie/taken/<TASK-ID>.json` |
| Inleveringsregistraties (alle kanalen, geaccepteerd en afgewezen) | `orchestratie/inleveringen/<TASK-ID>-<tijd>.json` |
| Integratiewachtrij | [`orchestratie/wachtrij.json`](./orchestratie/wachtrij.json) |
| Installatieregistratie (geschreven door installer/eigenaar) | [`orchestratie/geinstalleerd.json`](./orchestratie/geinstalleerd.json) |
| Overdrachtssjablonen | `orchestratie/sjablonen/` |
| Releasepakketten (lokaal, niet in git) | `uitvoer/` — `mijn-ruimte-<versie>.tar.gz` + `mijn-ruimte-<versie>-<agent>-overdracht.zip` (`orch pakket`) |
| Coördinatiestatus bij samenvoegen | [`.gitattributes`](./.gitattributes) (`merge=orch-staat`: de versie van `integratie` wint) |
| Ontwikkelarchief voor de release | `orchestratie/ontwikkelarchieven/<TASK-ID>.json` (in git), `ONTWIKKELARCHIEF.json` (in de tar) |
| Regels voor het uitrolpakket | [`deploy/REGELS-UITROLPAKKET.md`](./deploy/REGELS-UITROLPAKKET.md), [`shared/uitrol-manifest.ts`](./shared/uitrol-manifest.ts), [`shared/uitrol-codes.ts`](./shared/uitrol-codes.ts) |
| Veilige uitrol, passkey, terugdraaien | [`deploy/RUNBOOK-VEILIGE-UITROL.md`](./deploy/RUNBOOK-VEILIGE-UITROL.md) (§13 passkey, §15 eigenaarbesluit, §18 coördinatie op de server) |
| Beheer vanaf de site / HTTP / MCP (dezelfde logica als CLI) | [`src/agenten/TabOrch.tsx`](./src/agenten/TabOrch.tsx), [`backend/orch-routes.ts`](./backend/orch-routes.ts) (`/api/owner/orch/*`), [`backend/orch-opslag.ts`](./backend/orch-opslag.ts), [`backend/orch-hulpmiddelen.ts`](./backend/orch-hulpmiddelen.ts) (`orch_*`), [`shared/orch-model.ts`](./shared/orch-model.ts) |
| Werkkopie coördinatie op de server, uploads | `ORCH_WORTEL` (`/srv/mijn-ruimte/orch-repo`), `ORCH_INBOX` (`/srv/mijn-ruimte/orch-inbox`) |
| Passkey-bevestiging van regels (alleen geschreven door root) | `/var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl`; kopie voor de app `/var/lib/mijn-ruimte-uitrol-status/orch-regels-bevestigd.json` |
| Toegang voor agenten, MCP | [`deploy/RUNBOOK-AGENTEN-0.4.md`](./deploy/RUNBOOK-AGENTEN-0.4.md), [`deploy/MCP-CONNECTOR.md`](./deploy/MCP-CONNECTOR.md), [`deploy/CONNECTOR-V2.md`](./deploy/CONNECTOR-V2.md) |
| Afstemming (taken/conflicten/releases op de site) | [`shared/afstemming-model.ts`](./shared/afstemming-model.ts), `backend/afstemming-*.ts`, `src/afstemming-vnext/` |
| Gedeelde kennismap (buiten de repository) | projectmap `knowledge/claude/` — naslagwerk, geen bron van regels |

## 7. Opdrachten

```bash
node scripts/orch.mjs controleer                     # beleid.json, lock, adapters, taken, wachtrij — alles tegelijk
node scripts/orch.mjs vergrendel                     # regels.lock.json bijwerken na wijziging van regels (+ hogere regelsVersie)
node scripts/orch.mjs context                        # orchestratie/CONTEXT-COMPACT.md genereren
node scripts/orch.mjs taak-start --id ORCH-001 --agent claude --basis <sha40> --tak feature/orch-001-YYYYMMDD-HHMMSS
node scripts/orch.mjs versheid --taak ORCH-001 --fase start|overdracht
node scripts/orch.mjs taak-herlees --id ORCH-001     # «ik heb de regels herlezen» na een regelwijziging
node scripts/orch.mjs werkruimte --taak ORCH-001     # geïsoleerde werkboom (git worktree) voor de taak
node scripts/orch.mjs inleveren --bron <zip|tar.gz|patch|map|tak> [--kanaal mcp|http_api|web_upload] [--overdracht od.json] [--taak ID] [--zonder-tests "reden"] [--push]
node scripts/orch.mjs wachtrij toon|volgende|klaar|terugtrekken   # sequentiële integratiewachtrij
node scripts/orch.mjs status                         # in_progress / integrated / released / installed per taak
node scripts/orch.mjs staat-commit                   # alleen de statusbestanden van de coördinatie committen
node scripts/orch.mjs pakket --taak ORCH-001 --auteur "Naam" [--manifest m.json] [--testresultaten t.json] [--sig p.sig] [--uit uitvoer]
                                                     # tar.gz (UITROL-BASIS) + <versie>-<agent>-overdracht.zip; taak → released
node scripts/orch.mjs pakket-controleer --bron uitvoer/mijn-ruimte-<versie>-<agent>-overdracht.zip   # controle zonder installatie
node scripts/orch.mjs onderteken-bericht             # regel die de eigenaar ondertekent (ssh-keygen -Y sign -n mijn-ruimte-regels)
node scripts/orch.mjs bevestig <bericht.sig>         # handtekening van de eigenaar in de lock zetten (alternatief: passkey op de site, §5)
node scripts/eenheidstests.mjs orch                  # coördinatietests (kern, cli, inleveren, pakket, uitrol-basis, site, besluit-root)
# Hetzelfde vanaf de site/MCP (backend/orch-hulpmiddelen.ts): orch_overzicht, orch_context, orch_taak_start, orch_inleveren_begin|stuk|klaar
```

## 8. Wat bewust géén regel is

Oude runbooks en wijzigingsdocumenten blijven naslagwerk over hoe de code werkt. Ze voegen geen regels toe bovenop [`AGENTS.md`](./AGENTS.md) en heffen dit bestand niet op.
Wordt er een tegenstrijdigheid in gevonden, corrigeer dan het document of voeg een besluit toe in [`orchestratie/BESLUITEN.md`](./orchestratie/BESLUITEN.md), in plaats van stilzwijgend één van beide te kiezen.
