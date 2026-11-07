> 🌐 **Taal / Мова:** [Українська](СТИСЛИЙ-КОНТЕКСТ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

> **Taal / Мова:** [Українська](СТИСЛИЙ-КОНТЕКСТ.uk.md) · **Nederlands** (huidig) · [Canoniek bestand](./CONTEXT-COMPACT.md)

<!-- GEGENEREERD op basis van node scripts/orch.mjs context — Nederlandse versie van de compacte agentcontext -->
# Mijn Ruimte — compacte agentcontext (Nederlandse versie)

- regelsVersie: `1.4.11`
- regelsHash: `716dbdebfa4c1916ff4f10448c4c486157232dae595e3c48629683d9389262a3`
- kritiekHash: `15fb72c45e30c0347440c8bc5002934d080b229eb61ce20543f5d1cd49b43bf7` (NIET bevestigd door eigenaar)
- basis: `20261105-061659` @ `f3f3fabb2f3b5209b1ee8eba3078e403de831844` (geverifieerd_productie)
- integratietak: `integratie`

Voeg dit bestand volledig in aan het begin van het werk. Vermeld in het overdrachtsrapport de `regelsHash` en de basiscommit waarvan je bent vertrokken — anders wordt het resultaat gemarkeerd als «verouderde basis/regels» en komt het niet zonder hercontrole in de wachtrij.

## 0. Hoofdprincipe

Één projectgeheugen, één regelset, één integratiewachtrij, één afgestemde release — ongeacht het aantal en het type agenten (Claude, Antigravity, ChatGPT, Codex, Grok, Copilot, Gemini, Cursor en toekomstige agenten).

## 1. Platform (onveranderlijk)

- Mijn Ruimte is een zelfstandig BYOS-platform (Ubuntu-VM op de eigen hardware van de gebruiker). Geen externe clouds voor hosting of uitrol.
- Releases zijn atomisch: `mijn-ruimte-YYYYMMDD-HHMMSS.tar.gz`, SHA-256, installatie uitsluitend via `/usr/local/sbin/mijn-ruimte-installeer` (`deploy/uitrol/mijn-ruimte-uitrol.sh`). Pakketregels: `deploy/REGELS-UITROLPAKKET.nl.md` (`UITROL-VERSIE`, `AUTEUR`, `AGENT`, `SAMENVATTING`, `BRON-COMMIT`, `UITROL-MANIFEST.json` vanaf `20261101`).
- Geen directe root-acties met de hand: acties lopen via de werkgebruiker (`beheer`), systeemwijzigingen via vooraf geschreven configuraties en systemd-units. Niets uitpakken in `/root`.
- Gebruikersruimtes zijn geïsoleerd en versleuteld met hun eigen aanmeldmethode; de servereigenaar kan deze niet ontsleutelen.
- Talen: communicatie en rapportages in het Oekraïens; commentaar in de code in het Oekraïens of Nederlands; UI-teksten in het Oekraïens en Nederlands. Engels uitsluitend voor onvertaalbare technische termen. Paden en URL-adressen in het Nederlands (`/verbindingen`, niet `/connections`).
- Stack van VM `<VM-IP>` (`B-009`): `Ubuntu 26.04.1 LTS` (`kernel 7.0`, `glibc 2.43`, `systemd 259.9`), `Node.js 26.13.0 LTS`, `PostgreSQL 18.6`, `Caddy 2.11.7` (`admin.sock|0660`), `OPA 1.22.0`, `age 1.3.2`, `cloudflared 2026.10.7`, `Docker 29.9.2`. In `deploy/*.service` staat `RestrictSUIDSGID=no` (anders blokkeert seccomp `openat2` in `tar 1.35`).

## 2. Vóór je begint (verplicht)

1. Lees `AGENTENREGELS.nl.md` / `AGENTS.md` (of `orchestratie/CONTEXT-COMPACT.nl.md` als er geen toegang tot de repository is) en `orchestratie/beleid.json`.
2. Codebasis: `beleid.json → basis.bronCommit` (nu `f3f3fabb…`, versie `20261105-061659`, status `geverifieerd_productie` — geverifieerd met de server, zie `B-014`; de takken `integratie` en `voornaamst` zijn gesynchroniseerd). Als je toegang hebt tot de site, controleer dan `/api/version` en leg het resultaat vast in `BESLUITEN.md`.
3. Registreer de taak: `node scripts/orch.mjs taak-start --id ORCH-001 --agent claude --basis <sha> --tak feature/orch-001-YYYYMMDD-HHMMSS` (zonder repository: maak `ORCH-OVERDRACHT.json` handmatig aan volgens het sjabloon `orchestratie/sjablonen/ORCH-OVERDRACHT.json`).
4. Draai `node scripts/orch.mjs controleer` en `node scripts/orch.mjs versheid --taak <ID> --fase start`. Bij rood: niet beginnen, eerst rebasen of de regels herlezen.

## 3. Tijdens het werk

- Eigen tak `feature|fix|audit|release/<onderwerp>-YYYYMMDD-HHMMSS` vanaf de basiscommit. Één Task ID (`ABC-001`) per taak; deze staat in de taknaam, commit, PR en het pakket.
- Schrijf nooit in takken van andere agenten, `voornaamst`, `integratie` of `release/*`. Nooit force-pushen, nooit de geschiedenis herschrijven, nooit back-ups verwijderen.
- Stil overschrijven van andermans wijzigingen is verboden: bij een conflict rebasen op de integratietak, conflicten expliciet oplossen en vermelden in het rapport.
- Oude fout gevonden? Los haar op (in een aparte commit) en negeer haar niet. Verwijder nooit iets «om het werkend te krijgen»: geen knop, tabblad, test of controle weghalen.
- Geheimen, tokens, privésleutels en e-mailinhoud horen nooit in de chat, logs, commits of pakketten. Privésleutels van de eigenaar worden nooit aan agenten gegeven.
- Productie, de standaardtak, back-ups en kritieke rechten worden alleen gewijzigd na expliciete toestemming van de eigenaar (niet van een andere agent).
- Diagnostiek en tijd van de eigenaar (`B-009`): vraag de eigenaar nooit om handmatig terminalcommando's uit te voeren (`df -h`, `journalctl`) of handmatig pakketten te bouwen; geef zonder directe toegang tot `<VM-IP>` een korte technische conclusie (1–2 zinnen) voor de infrastructuuragent op de pc van de eigenaar. Gis nooit naar de oorzaak van een `voorcontrole`-fout (wijt het niet aan een `.zip` als de stap `structuur` al geslaagd is). Details bij `B-009`.

## 4. Vóór overdracht van het resultaat

1. Alles is gecommit. `node scripts/orch.mjs versheid --taak <ID> --fase overdracht` is groen (basis niet verouderd met overlappende bestanden, regels actueel).
2. Tests: `node scripts/eenheidstests.mjs <filter>`, `npm run typecheck:server` (waar mogelijk). Resultaten opnemen in `TESTRESULTATEN` (formaat v2) en in het rapport.
3. Inlevering via elk kanaal uit `beleid.json → inlevering.kanalen` (PR, MCP, HTTP API, lokaal bestand, ZIP, TAR.GZ, git patch, web-upload), maar altijd met `ORCH-OVERDRACHT.json`: `taakId`, `agent`, `basisCommit`, `regelsVersie`, `regelsHash`, `samenvatting`, lijst van gewijzigde bestanden, tests. Alles loopt door één pijplijn: `node scripts/orch.mjs inleveren --bron <bestand|map|tak>` — nieuwe tak vanaf de basis, wijzigingen, conflicten met `integratie` (`git merge-tree`), tests, registratie in `orchestratie/inleveringen/`, wachtrij. Een inlevering die statusbestanden wijzigt (`orchestratie/taken`, `inleveringen`, `wachtrij.json`, `regels.lock.json`, `geinstalleerd.json`) wordt geweigerd — die worden alleen door `orch` of de eigenaar geschreven. De enige uitzondering is het eigen `orchestratie/taken/<ID>.json` (declaratie van de agent uit `taak-start`); bij het samenvoegen wint de versie van `integratie` (`.gitattributes` → `merge=orch-staat`).
4. Rapport (in het Oekraïens voor de eigenaar): op de 1e regel de directe link naar `mijn-ruimte-<versie>.tar.gz` (los van `-overdracht.zip`); daarna wat klaar is, wat daadwerkelijk getest is (feitelijk, niet op basis van metadata), waar het resultaat staat, wat de volgende stap is en wat bewust niet is gedaan.
5. Taakstatus: `in_progress` → `ter_integratie` (ingeleverd) → `integrated` (samengevoegd in `integratie`) → `released` (pakket gebouwd) → `installed` (geïnstalleerd door de installer op de server). De status wordt uitsluitend gewijzigd door de stap die haar uitvoert; een agent zet een taak nooit zelf op `installed`.

## 5. Integratie en release

- Één sequentiële wachtrij: `orchestratie/wachtrij.json` (FIFO per basis; `wachtrij volgende|klaar|terugtrekken`, slechts één taak tegelijk `bezig`). Samenvoegen in `integratie` gebeurt altijd met `--no-ff`, zonder force; bij een conflict → `klaar --uitkomst afgewezen`, en de taak gaat terug naar de agent voor een rebase.
- Een pakket op een verouderde basis (`basisCommit` is geen voorouder van `integratie`, met overlappende bestanden) wordt niet uitgebracht en niet geïnstalleerd.
- Installatiemodi (`beleid.json → kritiek.installatieModi`): `handmatig`, `na_bevestiging` (Passkey/handtekening van de eigenaar; standaard), `automatisch_beperkt` — uitsluitend onder een apart goedgekeurd en ondertekend beleid. Momenteel zijn de eerste twee toegestaan.
- Kritiek beleid (`kritiek`) is pas geldig met bevestiging van de eigenaar in `orchestratie/regels.lock.json → eigenaar`: SSH-handtekening (`orch bevestig`) of passkey op de site (`eigenaar.soort = passkey`, registratie in het root-journaal); tot dat moment heeft het de status «voorstel».
- Regels wijzigen door de eigenaar zonder SSH: site `mcp.tarasevych.com/agents` → «Coördinatie» → bewerken van de regelbestanden → controle van het voorstel (`regelsVersie` hoger, besluit in `BESLUITEN.md`, `beleid.json` geldig) → passkey (besluit `orch-regels`; root legt alleen de bevestiging vast in zijn eigen journaal) → tak `regels/<versie>-<tijd>` met nieuw lock en `CONTEXT-COMPACT.md` gaat naar `origin`. Samenvoegen in `integratie` doet alleen de eigenaar. Site/MCP/HTTP roepen exact dezelfde functies aan als de CLI (`inleveren`, `beoordeelVoorstel`, `vergrendel`) — er is geen aparte logica (`beleid.json → site`).
- **TRACE-001 (vanaf `20261103-211555`):** verplicht `ONTWIKKELARCHIEF.json` en een geverifieerde exacte GitHub Release-asset SHA-256. Het ontwikkelarchief is gecommit; de server en root weigeren ontbrekende, onjuiste of onbereikbare gegevens. Volledige voorwaarden in `AGENTENREGELS.nl.md` §5, `B-007`, `deploy/REGELS-UITROLPAKKET.nl.md` §7.
