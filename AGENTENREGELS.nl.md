> 🌐 **Taal / Мова:** [Українська](ПРАВИЛА-АГЕНТІВ.uk.md) · **Nederlands** | [Hoofdpagina](LEESMIJ.md) · [Documentatie-index](docs/INDEX.nl.md)

# AGENTENREGELS.nl.md — Eén regelset voor alle AI-agenten van Mijn Ruimte (Nederlandse versie)

**Status:** volledige Nederlandse versie van de canonieke regelbron [`AGENTS.md`](./AGENTS.md) (`ORCH-001`). Versie van de regels: zie [`orchestratie/beleid.json`](./orchestratie/beleid.json) → `regelsVersie`; cryptografische vingerafdruk — [`orchestratie/regels.lock.json`](./orchestratie/regels.lock.json).
`CLAUDE.md`, `GEMINI.md`, `.cursorrules`, enz. zijn uitsluitend adapters die naar het canonieke [`AGENTS.md`](./AGENTS.md) verwijzen. Als een ander document in tegenspraak is met [`AGENTS.md`](./AGENTS.md), geldt [`AGENTS.md`](./AGENTS.md).

Wijziging van de regels = een nieuw besluit in [`orchestratie/BESLUITEN.md`](./orchestratie/BESLUITEN.md) ([🇳🇱 NL](./orchestratie/BESLUITEN.nl.md) · [🇺🇦 UK](orchestratie/РІШЕННЯ.uk.md)) + hogere `regelsVersie` + `node scripts/orch.mjs vergrendel`. Anders faalt `orch controleer`.

---

## 0. Hoofdprincipe

Één projectgeheugen, één regelset, één integratiewachtrij, één afgestemde release — ongeacht het aantal en het type agenten
(Claude, Antigravity, AutoClaw, ChatGPT, Codex, Grok, GitHub Copilot, Microsoft Copilot, Gemini, Cursor, Windsurf, Cline, Devin, OpenCode en toekomstige agenten).

## 1. Platform en doelarchitectuur «Klimop»

- De huidige basis van **Mijn Ruimte** is een zelfstandig platform op eigen apparatuur (virtuele Ubuntu-machine op eigen hardware van de eigenaar). Geen externe wolken voor plaatsing of uitrol zonder toestemming.
- **Doelarchitectuurconcept «Klimop» (`KLIMOP-001`, besluit `B-024`, volledige canon: [`docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md`](./docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md) / [`docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md`](./docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md)):** geleidelijke omvorming van het gecentraliseerde platform tot een levend, gedistribueerd, zelfherstellend en cryptografisch beveiligd ecosysteem met onafhankelijke knopen, verifieerbare verbindingen, gescheiden bevoegdheden en het vermogen om zonder voortdurende tussenkomst van één maker te blijven werken. **Het manifest is een doelarchitectuur en GEEN toestemming om de productie-infrastructuur onmiddellijk te wijzigen of bestaande servers uit te schakelen (§3b, §10).**
- Releases zijn atomisch: `mijn-ruimte-YYYYMMDD-HHMMSS.tar.gz`, SHA-256, installatie uitsluitend via `/usr/local/sbin/mijn-ruimte-installeer`
  (`deploy/uitrol/mijn-ruimte-uitrol.sh`). Pakketregels: [`deploy/REGELS-UITROLPAKKET.nl.md`](./deploy/REGELS-UITROLPAKKET.nl.md) (`UITROL-VERSIE`, `AUTEUR`, `AGENT`, `SAMENVATTING`, `BRON-COMMIT`, `UITROL-MANIFEST.json` vanaf `20261101`).
- Geen ruwe root-acties met de hand: acties lopen via de werkgebruiker (`beheer`), systeemwijzigingen via vooraf geschreven configuraties en systemd-units. Niets uitpakken in `/root`.
- Gebruikersruimtes zijn geïsoleerd en versleuteld met hun eigen aanmeldmethode; de servereigenaar kan deze niet ontsleutelen.
- Talen: communicatie en rapportages in het Oekraïens; commentaar in de code in het Oekraïens of Nederlands; interfaceteksten in het Oekraïens en Nederlands.
  Engels uitsluitend voor onvertaalbare technische protocol-identificaties. Paden en webadressen in het Nederlands (`/verbindingen`, niet `/connections`).
- Stack van VM `<VM-IP>` (`B-009`): `Ubuntu 26.04.1 LTS` (`kernel 7.0`, `glibc 2.43`, `systemd 259.9`), `Node.js 26.13.0 LTS`, `PostgreSQL 18.6`,
  `Caddy 2.11.7` (`admin.sock|0660`), `OPA 1.22.0`, `age 1.3.2`, `cloudflared 2026.10.7`, `Docker 29.9.2`. In `deploy/*.service` staat `RestrictSUIDSGID=no` (anders blokkeert seccomp `openat2` in `tar 1.35`).

## 2. Vóór je begint (verplicht)

0. **Eerste stap van elke sessie (BIJDRAGE-001):** `node scripts/orch.mjs begin --agent <id> [--taak <ID>] [--onderwerp <naam>] [--tekst "<opdracht>"]` — regels gecontroleerd, vaardigheden (worden zelf in de map van de agent gezet), dossier van de functie met de hele geschiedenis, wie eraan werkte en wie er tegelijk aan werkt. Claude doet dit automatisch (`.claude/settings.json`). Details in §9.
1. Lees [`AGENTS.md`](./AGENTS.md) (of `orchestratie/CONTEXT-COMPACT.md` als er geen toegang tot de repository is), [`orchestratie/beleid.json`](./orchestratie/beleid.json) en bij architecturale wijzigingen [`docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md`](./docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md).
2. Codebasis: `beleid.json → basis.bronCommit` (basisijlpaal `f3f3fabb…`, versie `20261105-061659`, status `geverifieerd_productie`, zie `B-014`; de productieserver is op 20-11-2026 gecontroleerd via `/api/version` — uitgave `20261120-141041` @ `ba289fa919c66765b6fc5565d340976994261c05`, zie `B-024`).
   Werktakken vertrekken vanaf de actuele integratie- of geïnstalleerde basis. Als je toegang hebt tot de site, controleer dan `/api/version` en leg het resultaat vast in `BESLUITEN.md`.
3. Registreer de taak: `node scripts/orch.mjs taak-start --id ORCH-001 --agent claude --basis <sha> --tak feature/orch-001-YYYYMMDD-HHMMSS`
   (zonder repository: maak `ORCH-OVERDRACHT.json` handmatig aan volgens het sjabloon `orchestratie/sjablonen/ORCH-OVERDRACHT.json`).
4. Draai `node scripts/orch.mjs controleer` en `node scripts/orch.mjs versheid --taak <ID> --fase start`. Bij rood: niet beginnen, eerst op de nieuwe basis overzetten of de regels herlezen.

## 3. Tijdens het werk

- Eigen tak `feature|fix|audit|release/<onderwerp>-YYYYMMDD-HHMMSS` vanaf de basiscommit. Één Task ID (`ABC-001`) per taak; deze staat in de taknaam, commit, samenvoegverzoek en het pakket.
- Schrijf nooit in takken van andere agenten, `voornaamst`, `integratie` of `release/*`. Nooit geforceerd verzenden, nooit de geschiedenis herschrijven, nooit reservekopieën verwijderen.
- Stil overschrijven van andermans wijzigingen is verboden: bij een conflict overzetten op de integratietak, conflicten expliciet oplossen en vermelden in het rapport.
- Oude fout gevonden? Los haar op (in een aparte commit) en negeer haar niet. Verwijder nooit iets «om het werkend te krijgen»: geen knop, tabblad, test of controle weghalen.
- Geheimen, toegangsbewijzen, privésleutels en e-mailinhoud horen nooit in de chat, logboeken, commits of pakketten. Privésleutels van de eigenaar worden nooit aan agenten gegeven.
- Productie, de standaardtak, reservekopieën en kritieke rechten worden alleen gewijzigd na expliciete toestemming van de eigenaar (niet van een andere agent).
- Logo's (`REESTR-LOGO-001`): uitsluitend uit het merkregister `src/merk/` (`<Merk>`, `MerkLogo`); nieuw teken via `scripts/merk-officieel-maken.mjs`, geen losse `<svg>`-kopieën. Details in §6.
- Meldingen- en actieregister (`MELDINGEN-REGISTER-001`, `B-026`): elke nieuwe dienst of serveractiecode krijgt verplicht een betekenisvolle titel `[uk, nl]`, inhoudelijke categorie (geen `overig`) en bewijsschema in `shared/beheer-journaal.ts` / `shared/meldingen-catalogus.ts`, en technische ruis gaat in `RUIS_PATROON`; bewaakt door `node scripts/meldingen-register-controle.mjs` (§11).
- Diagnostiek en tijd van de eigenaar (`B-009`): vraag de eigenaar nooit om handmatig terminalcommando's uit te voeren (`df -h`, `journalctl`) of handmatig pakketten te bouwen; geef zonder directe toegang tot `<VM-IP>` een korte technische conclusie (1–2 zinnen) voor de infrastructuuragent op de pc van de eigenaar. Gis nooit naar de oorzaak van een `voorcontrole`-fout (wijt het niet aan een `.zip` als de stap `structuur` al geslaagd is). Details hieronder bij `B-009`.

## 3a. Auteurschap, dossiers, vaardigheden (BIJDRAGE-001, details in §9)

- Elke bijdrage is een bestand `orchestratie/bijdragen/<ID>/…json` (`orch bijdrage`): de persoon die het werk gaf; agent, platform en concreet model; wat, waarom, op wiens werk het voortbouwt. Alleen aanvullen.
- Lees vóór een wijziging aan een functie haar dossier `orchestratie/onderwerpen/<naam>.json` en vul het aan. Mogelijkheden niet verwijderen: verloren werk krijgt `verloren` en wordt hersteld.
- Vaardigheden alleen in `.agents/skills/` + catalogus; samenvoegen zonder verlies (een optie die een agent niet ondersteunt markeer je in `agenten`).
- Een opmerking van de eigenaar gaat over één concreet onderdeel: verbeter dat, behoud de rest. Samenvoegen alleen `--no-ff`, zonder geschiedenis te pletten.
- Vóór het verwijderen van een tak of het sluiten van een samenvoegverzoek zonder samenvoeging: `orch verwijzing` (wie, waarom, laatste commit, waar het werk zit), zodat een koppeling nooit op «404» uitkomt (§9.7).

## 3b. Ecosysteem «Klimop» en architectuurcontrole (KLIMOP-001, details in §10)

- **Hoofdregel van machtsscheiding:** geen enkele afzonderlijke deelnemer, apparaat, server, sleutel, beheerder, aanbieder of AI-agent heeft alleenheerschappij of onbeperkte macht over het gehele ecosysteem; de rechten van de gegevenseigenaar, knoopbeheerder en wijziging van gedeelde regels zijn strikt gescheiden; een toevallige meerderheid van knopen krijgt nooit kritieke macht; ongecontroleerde woekering («computerworm») is verboden.
- **Verplichte 15-puntencontrole bij elke wijziging (§10.4):** controleer vóór het aanmaken of aanpassen van elk onderdeel dat er geen nieuw enkel uitvalpunt, geen verborgen bevoegdheden, geen onnodige metagegevens, geen ongevraagd middelenverbruik en geen netwerkbreed gevaar via één verbinder ontstaat, en dat rechtmatig herstel, intrekking van rechten, knoopcompatibiliteit, foutisolatie, mensbescherming, verifieerbaarheid en veilig terugdraaien behouden blijven.
- **Verboden vereenvoudigingen (§10.5):** noem het systeem nooit onkwetsbaar; tel kopieën op één server nooit als onafhankelijke knopen; verwar Shamir-geheimsplitsing niet met bestandsopdeling (waar versleuteling + fragmentherstelcodes nodig zijn); stel drempelhandtekeningen niet gelijk aan versleuteling en gewone serverversleuteling niet aan nulkennis-geheimhouding; schakel draaiende servers en PostgreSQL niet uit vóór bewezen gereedheid van een onafhankelijk alternatief; vervang beproefde protocollen nooit door eigen ongetoetste algoritmen.
- **Werkvolgorde (§10.6):** Fase 0 (volledige audit van de feitelijke staat; aanwezigheid van een bestand in git ≠ werkend in productie) → Fase 1 (doelspecificatie «Klimop») → technologievergelijking → gefaseerd uitgaveplan → geïsoleerde beproevingen. Wijzig de productie-infrastructuur nooit zonder afzonderlijke goedkeuring door de eigenaar.

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
  Samenvoegen in `integratie` gebeurt altijd met `--no-ff`, zonder force; bij een conflict → `klaar --uitkomst afgewezen`, en de taak gaat terug naar de agent voor overzetting op de actuele basis.
- Een pakket op een verouderde basis (`basisCommit` is geen voorouder van `integratie`, met overlappende bestanden) wordt niet uitgebracht en niet geïnstalleerd.
- Installatiemodi (`beleid.json → kritiek.installatieModi`): `handmatig`, `na_bevestiging` (Passkey/handtekening van de eigenaar; standaard),
  `automatisch_beperkt` — uitsluitend onder een apart goedgekeurd en ondertekend beleid. Momenteel zijn de eerste twee toegestaan.
- Kritiek beleid (`kritiek`) is pas geldig met bevestiging van de eigenaar in `orchestratie/regels.lock.json → eigenaar`: SSH-handtekening (`orch bevestig`)
  of passkey op de site (`eigenaar.soort = passkey`, registratie in het root-journaal); tot dat moment heeft het de status «voorstel».
- Regels wijzigen door de eigenaar zonder SSH: site `mcp.tarasevych.com/agents` → «Координація» → bewerken van de regelbestanden → controle van het voorstel (`regelsVersie`
  hoger, besluit in `BESLUITEN.md`, `beleid.json` geldig) → passkey (besluit `orch-regels`; root legt alleen de bevestiging vast in zijn eigen journaal) →
  tak `regels/<versie>-<tijd>` met nieuw lock en `CONTEXT-COMPACT.md` gaat naar `origin`. Samenvoegen in `integratie` doet alleen de eigenaar. Site/MCP/HTTP roepen
  exact dezelfde functies aan als de CLI (`inleveren`, `beoordeelVoorstel`, `vergrendel`) — er is geen aparte logica (`beleid.json → site`).
- **TRACE-001 (vanaf `20261103-211555`):** verplicht `ONTWIKKELARCHIEF.json` en een geverifieerde exacte GitHub Release-asset SHA-256. Het ontwikkelarchief is gecommit; de server en root weigeren ontbrekende, onjuiste of onbereikbare gegevens. Volledige voorwaarden hieronder, `B-007`, `deploy/REGELS-UITROLPAKKET.nl.md` §7.

### Volledige voorwaarden voor release, ontwikkelarchief en controles (§5)

- **TRACE-001 (vanaf release `20261103-211555`):** elk pakket bevat `ONTWIKKELARCHIEF.json` met een verwijzing naar `orchestratie/ontwikkelarchieven/<TASK-ID>.json` in dezelfde GitHub-commit en een verwijzing naar de `.tar.gz`-release. Het dossier bewaart de beschikbare opdrachtteksten, stapsgewijze acties en pogingen, commits, testresultaten, bijlagen met links en hashes, tijdelijke artefacten (of het feit dat die er niet waren), onderbouwing van beslissingen, afwegingen en niet-uitgevoerde punten; het bevat nooit privésleutels, toegangsbewijzen, e-mailinhoud of verborgen interne modelredenering. Gegevens met beperkte toegang worden alleen met een beschrijving en hash zonder inhoud opgenomen. Na het bouwen wordt het release-asset `mijn-ruimte-<versie>.tar.gz` gepubliceerd in een GitHub Release met de versietag. De voorcontrole op de server (`voorcontrole`) en de root-installer controleren onafhankelijk van elkaar de onveranderlijke commit, de herkomst uit de opgegeven tak, de SHA-256 van het dossier en de exacte SHA-256 van het archief op GitHub; ontbreken, foutieve links, afwijkingen of onbereikbaarheid van GitHub **blokkeren de installatie onherroepelijk**. Er is geen enkele uitzondering om «zonder controle door te gaan». Oudere pakketten blijven ongewijzigd. Vereist goedkeuring van de regels door de eigenaar met Passkey/SSH en samenvoeging in de beschermde integratietak.
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
  2. In `Ubuntu 26.04.1 LTS` gebruikt `GNU tar 1.35` tijdens `--extract` de systeemaanroep `openat2(..., RESOLVE_BENEATH)`. In `systemd 259` blokkeert `RestrictSUIDSGID=yes` in het seccomp-filter `openat2` met `-ENOSYS` (`Function not implemented`), waardoor `voorcontrole` faalde bij het uitpakken van `.tar.gz`. Daarom moet in alle `deploy/*.service` en in de server-drop-ins `/etc/systemd/system/<unit>.d/ubuntu2604-openat2.conf` `RestrictSUIDSGID=no` staan (met behoud van `NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes`).
  3. Als een agent in een wolk-/webcontainer werkt zonder directe toegang tot server `<VM-IP>`, is het hem **verboden** de diagnostiek bij de eigenaar neer te leggen (vragen om `df -h`, `journalctl`, enz. uit te voeren) of blind te gissen naar de oorzaak (bijvoorbeeld de eigenaar ervan beschuldigen een `.zip` i.p.v. een `.tar.gz` te hebben geüpload terwijl `voorcontrole` de stap `structuur` al gepasseerd is). In plaats daarvan geeft de agent een korte technische notitie (1–2 zinnen) voor de infrastructuuragent op de pc van de eigenaar (Antigravity/Claude), die directe SSH-toegang heeft tot `beheer@<VM-IP>`.
- **B-023 (vanaf 20.11.2026 · driefactorvertrouwen, persoonlijke beheersleutels en selectief intrekken van releases):**
  1. Elke beheerder of gedelegeerde werkt onder een eigen intrekbare sleutel (`app.uitrol_beheer_sleutels`; in de database staan alleen voorvoegsel en SHA-256). Uploaden naar de cumulatieve wachtrij (`uploaden`) wordt altijd door de site gecontroleerd en wacht op goedkeuring door de eigenaar; gedelegeerde installatie (`installeren`) vereist volledige wederzijdse synchronisatie van alle 3 factoren (`GitHub + TRACE-001` ↔ `MCP AI + geldende regels` ↔ `Site-account en siterechten`).
  2. Elke release wordt vastgelegd in het wijzigingsregister (`app.uitrol_release_wijzigingen` — bron `github|mcp|site|ssh`, bestanden, migraties, driefactorstatus), inzichtelijk voor de eigenaar en voor AI via `uitrol_voorstel_status`. Voor het selectief intrekken van één release zonder verlies van latere updates stelt de agent een bestandsplan op (schone terugdraaiing van unieke bestanden, zorgvuldig behoud van latere aanpassingen bij overlappende bestanden, geen vernietigende verwijdering van databasemigraties) en bouwt een nieuwe herstelrelease.
- **B-027 · VLAG-001 (vanaf 22.11.2026 · verplichte functievlaggen voor nieuwigheden, snelheid en overgang naar vaste staat):**
  1. **Zonder vlag — geen uitgave.** Elk pakket dat het gedrag wijzigt (bestanden in `src/`, `backend/`, `shared/`, `public/`, `deploy/`, met uitzondering van tests en documentatie), verklaart in `UITROL-MANIFEST.json` het veld `functievlaggen`: een lijst `{ "sleutel": "<naam>-vN", "migratie": "NNNN_….sql" }`. Elke vlag wordt toegevoegd door een migratie `INSERT INTO app.feature_flags (…, aan, standaard) VALUES (…, false, false) ON CONFLICT (sleutel) DO NOTHING` met een tweetalige omschrijving, zodat zij direct op de pagina «Nieuwe mogelijkheden van de site» op het tabblad «Actief» verschijnt. Met een uitgeschakelde vlag gedraagt de site zich zoals de vorige uitgave. Voor pakketten vanaf versie `20261123-000000` weigert `orch pakket` een pakket zonder vlag (`VLAG_ONTBREEKT`), met een vlag zonder migratie (`VLAG_ZONDER_MIGRATIE`) of met een vlag die standaard ingeschakeld is (`VLAG_STANDAARD_AAN`).
  2. **Uitzonderingen zijn uitsluitend uitdrukkelijk en smal:** het veld `zonderVlag: { "reden": "beveiliging|herstel|documentatie|vlag-opruiming", "toelichting": "…" }` — dringend beveiligingsherstel; herstel dat uitsluitend eerder gedrag terugbrengt; uitsluitend documentatie; opruiming van een reeds blijvende vlag (punt 4). De uitzondering is zichtbaar voor de eigenaar op de uitrolpagina; al het overige zonder vlag wordt geweigerd.
  3. **Vlaggen vertragen de pagina niet:** de toestand van alle vlaggen wordt met één verzoek per pagina gelezen en in het geheugen van de toepassing bewaard (`src/functievlag-lezen.ts`, `useVlag`); geen afzonderlijke netwerkverzoeken per onderdeel en geen wachttijd bij het opbouwen van het scherm — tot het antwoord geldt de standaardwaarde (het eerdere gedrag). De server levert vlaggen uit het geheugen en niet met een afzonderlijk databankverzoek per aanroep. Nieuwe code achter een vlag wordt pas ingeladen wanneer de vlag ingeschakeld is.
  4. **Beproefd — naar vaste staat:** zodra een mogelijkheid beproefd is en «Voor iedereen» aan staat, verplaatst de eigenaar haar naar het «Archief». Uiterlijk 30 dagen na verplaatsing naar het «Archief» verwijdert een volgende uitgave de vlagcontrole uit de code (het nieuwe gedrag wordt vast, het oude verdwijnt) met `zonderVlag.reden = "vlag-opruiming"` en een migratie die de vlagrij verwijdert. De pagina «Nieuwe mogelijkheden van de site» en de pakketcontrole waarschuwen voor gearchiveerde vlaggen die langer dan 30 dagen in de code blijven (`VLAG_OPRUIMEN`).
  5. Proefgebruikers en het aandeel mensen (alleen ik / geselecteerden / een deel) regelt de eigenaar op de pagina «Nieuwe mogelijkheden van de site»; bij een fout wordt de mogelijkheid met de schakelaar uitgezet zonder nieuwe uitgave.

---

## 6. Waar staat wat

| Wat | Waar |
|---|---|
| Regels (voor mens en agent) | [`AGENTS.md`](./AGENTS.md) ([🇳🇱 NL](./AGENTENREGELS.nl.md) · [🇺🇦 UK](ПРАВИЛА-АГЕНТІВ.uk.md)) |
| Beleid (voor de machine) | [`orchestratie/beleid.json`](./orchestratie/beleid.json) |
| Besluitenregister | [`orchestratie/BESLUITEN.md`](./orchestratie/BESLUITEN.md) ([🇳🇱 NL](./orchestratie/BESLUITEN.nl.md) · [🇺🇦 UK](orchestratie/РІШЕННЯ.uk.md)) |
| Vingerafdruk van regels, handtekening eigenaar | [`orchestratie/regels.lock.json`](./orchestratie/regels.lock.json) |
| Publieke sleutels van de eigenaar | [`orchestratie/eigenaar-ondertekenaars`](./orchestratie/eigenaar-ondertekenaars) |
| Compacte context (zonder GitHub/MCP) | [`orchestratie/CONTEXT-COMPACT.md`](./orchestratie/CONTEXT-COMPACT.md) (gegenereerd met: `node scripts/orch.mjs context`) |
| Taken van agenten | `orchestratie/taken/<TASK-ID>.json` |
| Inleveringsregistraties (alle kanalen, geaccepteerd en afgewezen) | `orchestratie/inleveringen/<TASK-ID>-<tijd>.json` |
| Integratiewachtrij | [`orchestratie/wachtrij.json`](./orchestratie/wachtrij.json) |
| Installatieregistratie (geschreven door installer/eigenaar) | `orchestratie/geinstalleerd.json` |
| Overdrachtssjablonen | `orchestratie/sjablonen/` |
| Releasepakketten (lokaal, niet in git) | `uitvoer/` — `mijn-ruimte-<versie>.tar.gz` + `mijn-ruimte-<versie>-<agent>-overdracht.zip` (`orch pakket`) |
| Coördinatiestatus bij samenvoegen | [`.gitattributes`](./.gitattributes) (`merge=orch-staat`: de versie van `integratie` wint) |
| Ontwikkelarchief voor de release | `orchestratie/ontwikkelarchieven/<TASK-ID>.json` (in git), `ONTWIKKELARCHIEF.json` (in de tar) |
| Regels voor het uitrolpakket | [`deploy/REGELS-UITROLPAKKET.nl.md`](./deploy/REGELS-UITROLPAKKET.nl.md), [`shared/uitrol-manifest.ts`](./shared/uitrol-manifest.ts), [`shared/uitrol-codes.ts`](./shared/uitrol-codes.ts) |
| Veilige uitrol, passkey, terugdraaien | [`deploy/DRAAIBOEK-VEILIGE-UITROL.nl.md`](./deploy/DRAAIBOEK-VEILIGE-UITROL.nl.md) (§13 passkey, §15 eigenaarbesluit, §18 coördinatie op de server) |
| Beheer vanaf de site / HTTP / MCP (dezelfde logica als CLI) | [`src/agenten/TabOrch.tsx`](./src/agenten/TabOrch.tsx), [`backend/orch-routes.ts`](./backend/orch-routes.ts) (`/api/owner/orch/*`), [`backend/orch-opslag.ts`](./backend/orch-opslag.ts), [`backend/orch-hulpmiddelen.ts`](./backend/orch-hulpmiddelen.ts) (`orch_*`), [`shared/orch-model.ts`](./shared/orch-model.ts) |
| Werkkopie coördinatie op de server, uploads | `ORCH_WORTEL` (`/srv/mijn-ruimte/orch-repo`), `ORCH_INBOX` (`/srv/mijn-ruimte/orch-inbox`) |
| Passkey-bevestiging van regels (alleen geschreven door root) | `/var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl`; kopie voor de app `/var/lib/mijn-ruimte-uitrol-status/orch-regels-bevestigd.json` |
| Toegang voor agenten, MCP | [`deploy/DRAAIBOEK-AGENTEN-0.4.nl.md`](./deploy/DRAAIBOEK-AGENTEN-0.4.nl.md), [`deploy/MCP-VERBINDER.nl.md`](./deploy/MCP-VERBINDER.nl.md), [`deploy/VERBINDER-V2.nl.md`](./deploy/VERBINDER-V2.nl.md) |
| Afstemming (taken/conflicten/releases op de site) | [`shared/afstemming-model.ts`](./shared/afstemming-model.ts), `backend/afstemming-*.ts`, `src/afstemming-vnext/` |
| Merkregister (`REESTR-LOGO-001`) | `src/merk/`, `shared/merk-direct.ts`, `scripts/merk-officieel-maken.mjs`, `src/merk/officieel/HERKOMST.json`, `backend/merk-gebruiker.ts` |
| Auteurschap (`BIJDRAGE-001`) en functiedossiers | `orchestratie/bijdragen/<TAAK-ID>/…`, `orchestratie/onderwerpen/<naam>.json`, `node scripts/orch.mjs begin` |
| Vaardigheden (één bron) | `.agents/skills/` (waaronder `klimop-architectuur`), `scripts/vaardigheden/catalogus.json`; spiegeling via `beleid.json → vaardigheden.spiegels` |
| Hoofdarchitectuurmanifest «Klimop» (`KLIMOP-001`) | [`docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md`](./docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md) ([🇺🇦 UK](./docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md)) en dossier [`orchestratie/onderwerpen/ecosysteem-klimop.json`](./orchestratie/onderwerpen/ecosysteem-klimop.json) |
| Adapters van alle 14 agentintegraties | `CLAUDE.md`, `ANTIGRAVITY.md`, `AUTOCLAW.md`, `CHATGPT.md`, `CODEX.md`, `GROK.md`, `.github/copilot-instructions.md`, `MSCOPILOT.md`, `GEMINI.md`, `.cursorrules`, `WINDSURF.md`, `CLINE.md`, `DEVIN.md`, `OPENCODE.md` |
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
node scripts/orch.mjs begin --agent claude [--taak X] [--onderwerp meldingen]   # BIJDRAGE-001: sessiestart — regels, vaardigheden, dossier, parallel werk
node scripts/orch.mjs bijdrage --taak X --agent claude --platform "Claude Code" --model claude-opus-5-5 --opdrachtgever "Naam" --soort herwerkt --wat "…" --waarom "…" --bouwt-voort-op <id>
node scripts/orch.mjs bijdragen [--taak X] [--onderwerp n]   # wie wat heeft gedaan, herwerkt of afgerond
node scripts/orch.mjs onderwerp ecosysteem-klimop    # functiedossier: volledige geschiedenis, mogelijkheden en opmerkingen van de eigenaar
node scripts/orch.mjs behoud --tegen <ref>           # bewaking: geen verlies van bijdragen, dossiers of vaardigheden
node scripts/orch.mjs vaardigheden-spiegel --agent claude   # vaardigheden uit .agents/skills/ spiegelen naar de map van de agent
node scripts/eenheidstests.mjs orch                  # coördinatietests (kern, cli, inleveren, pakket, uitrol-basis, site, besluit-root)
# Hetzelfde vanaf de site/MCP (backend/orch-hulpmiddelen.ts): orch_overzicht, orch_context, orch_taak_start, orch_inleveren_begin|stuk|klaar
```

## 8. Wat bewust géén regel is

Oude draaiboeken en wijzigingsdocumenten blijven naslagwerk over hoe de code werkt. Ze voegen geen regels toe bovenop [`AGENTS.md`](./AGENTS.md) en heffen dit bestand niet op.
Wordt er een tegenstrijdigheid in gevonden, corrigeer dan het document of voeg een besluit toe in [`orchestratie/BESLUITEN.md`](./orchestratie/BESLUITEN.md), in plaats van stilzwijgend één van beide te kiezen.

## 9. Auteurschap, functiegeschiedenis en vaardigheden (BIJDRAGE-001, vanaf 18.11.2026)

**Waarom.** Verschillende agenten en modellen werken aan dezelfde functie, vaak los van elkaar. Zonder registratie lijkt ander werk een fout, wordt het opnieuw gedaan en gaat eerder werk verloren. Nu ziet iedereen **wie, met welk model, wat, waarom en op wiens werk** deed, en wie tegelijk werkt.

1. **Start:** `node scripts/orch.mjs begin` (verandert niets in git): regels, lijst vaardigheden en kopie in de map van de agent (`beleid.json → vaardigheden.spiegels`, Claude: `.claude/skills/`), dossiers die bij de opdracht passen, bijdragen van de taak, lopend parallel werk. Claude Code start dit zelf via SessionStart.
2. **Auteurschap:** `node scripts/orch.mjs bijdrage --taak <ID> --agent <id> --platform "…" --model <concreet model> --opdrachtgever "<persoon>" --soort <soort> --wat "…" [--waarom "…"] [--bouwt-voort-op <id>] [--voorganger "…"]`. Soorten: `begin`, `nieuw`, `herwerkt`, `afgerond`, `overname`, `samenvoeging`, `herstel`, `controle`, `correctie`; bij omwerken, afmaken, overnemen, herstellen, samenvoegen en corrigeren zijn «waarom» en «bouwt voort op» verplicht. Minstens één registratie per taak (`versheid --fase overdracht`). Registraties worden niet bewerkt of verwijderd (`orch behoud`): een modelcorrectie gebeurt uitsluitend via een nieuwe `correctie`-registratie met `corrigeert` (waarbij de oorspronkelijke opgave zichtbaar blijft in `eerderGeregistreerd`). Het releasepakket neemt alle nieuwe registraties op in `BIJDRAGEN.json` en `UITROL-MANIFEST.json → bijdragen`; de site toont «Wie deed wat».
3. **Dossier:** `orchestratie/onderwerpen/<naam>.json` met taken, takken, samenvoegverzoeken, mogelijkheden met vaste `id` en staat (`actief`, `in-ontwikkeling`, `verloren`, `vervangen`, `ingetrokken` alleen op besluit van de eigenaar), opmerkingen van de eigenaar en open vragen. Wie bestanden uit `paden` wijzigt, vult het dossier aan; niets verwijderen.
4. **Opmerkingen van de eigenaar** gaan over één concreet onderdeel (`betreft`) en noemen wat blijft (`behouden`). Verbeter alleen dat onderdeel; vervang geen hele component tenzij de eigenaar dat zegt.
5. **Vaardigheden:** één bron `.agents/skills/` + `scripts/vaardigheden/catalogus.json` (SemVer, `mogelijkheden` met vaste `id` en `agenten`, waaronder de gedeelde vaardigheden `movnyi-zakon` en `klimop-architectuur` voor alle 14 agenten). Nieuwe vaardigheid op tak `feature/vaardigheid-<naam>-<tijd>` of in de eigen taaktak. Versie gaat niet omlaag, vaardigheden en mogelijkheden verdwijnen niet; wat een agent niet ondersteunt, wordt in `agenten` beperkt, niet verwijderd.
6. **Geschiedenis:** samenvoegen alleen `--no-ff`, niets pletten of herschrijven; oude releases, takken en samenvoegverzoeken blijven, sluiten gebeurt met uitleg waar het werk naartoe ging.
7. **Verwijzingen zonder «404» (VERWIJZING-001):** elke tak, samenvoegverzoek, migratie en taak staat op de updatepagina met mensentitel, samenvatting en staat. `orch pakket` haalt dit uit git en uit `orchestratie/verwijzingen/` (`UITROL-MANIFEST.json → verwijzingen`, `BIJDRAGEN.json`), dus ook zichtbaar zonder GitHub. Vóór het verwijderen van een tak: `orch verwijzing --soort tak --id <tak> --gebeurtenis verwijderd --wie … --waarom …`; bij sluiten zonder samenvoeging: `--soort pr --gebeurtenis gesloten --opgenomen-in …`. Alleen aanvullen.

---

## 10. Doelecosysteem «Klimop» (`KLIMOP-001` / `B-024`, vanaf 20.11.2026)

Volledige tweetalige tekst van het manifest: [`docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md`](./docs/hub/ARCHITECTUURMANIFEST-KLIMOP.nl.md) · [`docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md`](./docs/hub/АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md). Geheugendossier: [`orchestratie/onderwerpen/ecosysteem-klimop.json`](./orchestratie/onderwerpen/ecosysteem-klimop.json). Vaardigheid: [`.agents/skills/klimop-architectuur/SKILL.md`](./.agents/skills/klimop-architectuur/SKILL.md).

### 10.1 Status en bevoegdheidsgrenzen

- Het manifest «Klimop» is het **doelarchitectuurconcept** voor de gefaseerde omvorming van «één hoofdserver → gedeelde kern → centrale gegevensbank → alle diensten» naar «onafhankelijke knopen ↔ beveiligd netwerk ↔ verdeelde opslag ↔ geïsoleerde diensten ↔ onafhankelijk bestuur».
- **Het is GEEN toestemming voor onmiddellijke wijziging van de productie-infrastructuur.** De huidige PostgreSQL-gegevensbank, servers, reservekopieën, 11 subdomeinen, M7-privéopslag, toegangssleutels, wijzigingsgeschiedenis en goedgekeurde werkwijze van agenten blijven zonder enig verlies van gegevens of functies behouden (§3.2, §35 van het manifest).
- De aanwezigheid van een codeonderdeel in de opslagplaats geldt **nooit** als bewijs dat de mogelijkheid in productie actief en bewezen is (§3.3).

### 10.2 Zeven structurele elementen, knopen, gegevens- en mensbescherming

1. **Zeven elementen van het ecosysteem (§1):** **Wortels** (onafhankelijke vertrouwensankers zonder alleenheerschappij), **Stengels** (geauthenticeerde versleutelde verbindingen met alternatieve routes en afkoppeling van beschadigde delen), **Bladeren** (geïsoleerde functionele onderdelen), **Hechtranken** (geautoriseerde, begrensde en intrekbare uitbreiding zonder eigenmachtige installatie), **Voeding** (vrijwillige en inzichtelijke uitwisseling van middelen zonder dwang), **Immuunsysteem** (bewaking zonder onthulling van privé-inhoud, zelfherstel binnen regels en gefaseerde uitgaven), **Zaad** (overdraagbaarheid en heropbouw zonder één onmisbare maker).
2. **Vier knooptypen (§4):** vaste onafhankelijke knopen (gescheiden uitvalrisico's), persoonlijke gebruikersapparaten, gespecialiseerde knopen met begrensde rechten en overgangsknopen voor toetreding (nooit de enige ontdekkingsweg). Een buurknoop is nooit automatisch vertrouwd enkel door netwerknabijheid (§5).
3. **Zeven versleutelingslagen en cryptografie (§6–§13):** apparaat → gegevens (`AES-256-GCM` / `ChaCha20-Poly1305`) → overdracht → opslag (versleuteling + herstelcodes voor verloren fragmenten) → bevoegdheid → herstel → drempelbestuur. Shamir-geheimsplitsing (§7), verifieerbare splitsing volgens Feldman/Pedersen (§8), proactieve deelvernieuwing per tijdvak (§9) en FROST-drempelhandtekeningen (§10) worden doelgebonden toegepast met cryptografisch versiebeheer en voorbereiding op gestandaardiseerde postkwantumcryptografie (§13). Voor groepsberichten wordt standaard 9420 onderzocht (§12).
4. **Bescherming van de mens en 7 bestuurscategorieën (§14–§20):** onafhankelijke procedures bij verlies van apparaat of aanmeldgegevens, ziekte, langdurige afwezigheid, wettelijke erfopvolging en fysieke of psychologische dwang (zonder automatische gegevensvernietiging bij verdenking van dwang, §15–§17); 7 gescheiden bevoegdheidscategorieën (eigen gegevens, persoonlijke apparaten, operationeel knoopbeheer, programma-onderhoud, cryptografische bevestiging van kritieke wijzigingen, noodherstel, wijziging van ecosysteemregels) en verplichte wachttijden voor ingrijpende besluiten zonder vertraging van dagelijks post-, bestands- of agendagebruik (§19–§20).

### 10.3 Zestien gespecialiseerde ontwikkelrichtingen voor agenten (§32–§34)

1) algemene architectuur; 2) knoop-tot-knoop-verbindingen; 3) cryptografie; 4) verdeelde opslag; 5) identiteit; 6) herstel; 7) bescherming van de mens; 8) gedeeld bestuur; 9) externe verbinders; 10) zelfherstel; 11) uitgavebeveiliging; 12) beveiligingstoetsing; 13) snelheid en middelenverbruik; 14) persoonlijke levenssfeer; 15) compatibiliteit en migratie; 16) documentatie en beheerondersteuning. Geen enkele agent mag alleen een kritieke wijziging ontwerpen, goedkeuren én installeren.

### 10.4 Verplichte architectuurcontrole bij elke wijziging (§42 van het manifest)

Vóór het aanmaken of wijzigen van elk programmaonderdeel beantwoordt elk van de 14 agenten vijftien vragen:
1. Ontstaat er een nieuw enkel uitvalpunt?
2. Worden verborgen bevoegdheden uitgebreid?
3. Blijft rechtmatig herstel beschikbaar?
4. Zijn gegevens beschermd op het apparaat, tijdens overdracht én in opslag?
5. Worden onnodige metagegevens blootgegeven?
6. Kunnen aangemaakte rechten worden ingetrokken?
7. Wordt de compatibiliteit tussen knopen geschaad?
8. Blijft het mogelijk een defect onderdeel te isoleren?
9. Verslechtert de bescherming van de mens?
10. Blijft de wijziging verifieerbaar?
11. Bestaat er een veilige terugkeerweg?
12. Neemt de afhankelijkheid van de oorspronkelijke auteur toe?
13. Worden middelen van gebruikers verbruikt zonder hun instemming?
14. Worden rechten van gegevenseigenaren geschonden?
15. Ontstaat er een nieuw gevaar voor het gehele netwerk via één enkele verbinder?

Schendt een wijziging de kernwaarborgen, dan moet zij vóór invoering worden herzien.

### 10.5 Verboden vereenvoudigingen (§43 van het manifest)

Het is strikt verboden om: (1) het systeem volstrekt onkwetsbaar te noemen; (2) meerdere kopieën op één server als onafhankelijke knopen te tellen; (3) geheimsplitsing te verwarren met bestandsopdeling; (4) gewone serverversleuteling gelijk te stellen aan nulkennis-geheimhouding; (5) een drempelhandtekening als universele versleuteling te beschouwen; (6) knopen enkel op basis van deelname te vertrouwen; (7) rechten automatisch aan een toevallige meerderheid toe te kennen; (8) hardware-isolatie als absolute bescherming te beschouwen; (9) toegang automatisch te herstellen zonder behoorlijke bevestigingen; (10) apparaten van gebruikers heimelijk te benutten; (11) draaiende servers uit te schakelen vóórdat onafhankelijke alternatieven werken; (12) beproefde protocollen te vervangen door eigen ongetoetste algoritmen; (13) beproevingen geslaagd te verklaren zonder bewijs; (14) kritieke updates te installeren zonder behoorlijke goedkeuring.

### 10.6 Volgorde van fasen (0–12), verplichte documenten (25) en eerste stappen van agenten (§36, §44, §45)

- **Volgorde van fasen (§36):** Fase 0 (volledige audit) → Fase 1 (architectuurkern) → Fase 2 (beproevingsnetwerk) → Fase 3 (versleuteling en opslag) → Fase 4 (gespreide sleutels) → Fase 5 (onafhankelijke identiteit) → Fase 6 (verdeeld bestuur) → Fase 7 (zelfherstel) → Fase 8 (overzetten van diensten) → Fase 9 (bescherming tegen dwang) → Fase 10 (bredere uitrol) → Fase 11 (onafhankelijke audit) → Fase 12 (doorlopende ontwikkeling zonder afhankelijkheid van de aanvankelijke auteur).
- **Eerste stappen van agenten (§45):** 1) audit van het feitelijke project en de actuele installatiewijze → 2) doelarchitectuur «Klimop» → 3) vergelijking van bewezen technologieën → 4) gefaseerd plan van onafhankelijke uitgaven → 5) pas daarna geïsoleerde beproevingen en uitvoering zonder de productieomgeving zonder goedkeuring van de eigenaar te wijzigen. Alle documentatie wordt tweetalig bijgehouden (`uk` + `nl`, lijst van 25 verplichte documenten in §44 van het manifest).

---

## 11. Eén levend register van meldingen en actiecodes (`MELDINGEN-REGISTER-001` / `B-026`, vanaf 22.11.2026)

Het meldingenpaneel («Aandachtspuls») bestrijkt alle onderdelen en subdomeinen van «Mijn Ruimte». Een melding zonder inhoudelijke betekenis (zoals een loze verzamelterm «Actie in technische ruimte») is verboden. Daarom geldt bij elke ontwikkeling van een nieuwe dienst, route of auditgebeurtenis de vaste projectregel:

1. **Verplichte registratie per code:** elke nieuwe `schrijfBeheerAudit`- of `audit_events`-actiecode en elke nieuwe dienstmelding moet in dezelfde wijziging geregistreerd worden in `shared/beheer-journaal.ts` (`ACTIE_LABELS` met betekenisvolle tweetalige titel `[uk, nl]` + indeling in `CATEGORIEEN`, nooit `'overig'`) en/of `shared/meldingen-catalogus.ts` (`MELDINGEN` met bewijsschema `S1..S20`), evenals in de regeltabel van `backend/site-activiteit.ts` (`RULES`).
2. **Strikte scheiding van ruis en zelfmeldingen:** puur technische leesbewerkingen en handelingen binnen het meldingenpaneel zelf (`owner.meldingen.ecosysteem.actie`, `owner.meldingen.ecosysteem.profiel`) horen in `RUIS_PATROON` en `SITE_RUIS`: ze blijven bewaard in het beveiligingslogboek, maar vervuilen nooit de bel of de meldingsstroom.
3. **Levend inzicht op de site en automatische poortwachter:** het gecombineerde register (`shared/meldingen-register-overzicht.ts`) is live in te zien en doorzoekbaar op `/melding#melding-register` (en rechtstreeks vanuit de voettekst van het paneel). `npm run build` draait verplicht `node scripts/meldingen-register-controle.mjs` en breekt het bouwen onmiddellijk af zodra in `backend/` of `server/` een ongeregistreerde actiecode of een `'overig'`-terugval verschijnt.
