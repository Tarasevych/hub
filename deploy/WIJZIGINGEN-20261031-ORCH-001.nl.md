> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261031-ORCH-001.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261031-ORCH-001.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# ORCH-001 · Eenduidig coördinatiesysteem voor AI-agenten — wijzigingsoverzicht

Tak: `feature/orch-001-20261031-112355` (vanaf `b279ccabe31a27139b337822162653ccc13b6a5a` = BRON-COMMIT van de opgegeven geïnstalleerde versie `20261031-093842`).
Task ID: `ORCH-001`. Agent: `claude`. Taakstatus: `orchestratie/taken/ORCH-001.json`.

## Fase 0 — gedeeld geheugen en regels (31-10-2026)

**Toegevoegd**
- `AGENTS.md` — canonieke regels voor alle agenten (uk+nl). Compact-blokken tussen `<!-- compact:begin/einde -->` komen terecht in de compacte context.
- `orchestratie/beleid.json` — machineleesbaar beleid: basis, integratietak, patroon voor takken/Task ID's, statussen, inleverkanalen, agenten, adapters,
  sectie `kritiek` (installatiemodi, beschermde takken, verbod op het doorgeven van privésleutels).
- `orchestratie/BESLUITEN.md` — besluitenregister (append-only), B-001…B-003 met status `voorstel` tot bevestiging door de eigenaar.
- `orchestratie/regels.lock.json` — afdruk van de regels (`hash`) en het kritieke beleid (`kritiekHash`); veld `eigenaar` voor de handtekening van de eigenaar.
- `orchestratie/eigenaar-ondertekenaars` — publieke sleutels van de eigenaar (allowed_signers, namespace `mijn-ruimte-regels`). Privésleutels worden niet aan agenten verstrekt.
- `orchestratie/CONTEXT-COMPACT.md` — gegenereerde context voor agenten zonder GitHub/MCP (≤ 12 KB; `controleer` faalt als deze verouderd is).
- `orchestratie/taken/ORCH-001.json`, `orchestratie/wachtrij.json`, `orchestratie/sjablonen/ORCH-OVERDRACHT.json` — taken, sequentiële wachtrij, overdrachtssjabloon.
- Adapters (≤ 25 regels, markering `<!-- orch-adapter -->`): `CLAUDE.md`, `GEMINI.md`, `ANTIGRAVITY.md`, `CHATGPT.md`, `CODEX.md`, `GROK.md`,
  `.github/copilot-instructions.md`, `.cursorrules`. Geen eigen regels — uitsluitend een verwijzing naar AGENTS.md en het agent-id.
- `scripts/orch.mjs` + `scripts/orch/kern.mjs` — CLI: `controleer`, `vergrendel`, `context`, `taak-start`, `taak-staat`, `versheid`, `onderteken-bericht`, `bevestig`.
  SSHSIG-verificatie (ed25519) geïmplementeerd op `node:crypto` — werkt ook waar `ssh-keygen` ontbreekt.
- Tests: `tests/eenheid/orch-kern-20261031.test.ts` (53), `tests/eenheid/orch-cli-20261031.test.ts` (16, echte git-scenario's: verouderde basis met overlappende
  bestanden, basis is geen voorouder van HEAD, regels bijgewerkt, adapter uitgegroeid tot eigen regelset, agent mag geen `installed` instellen).
- `package.json`: `npm run orch:controleer`.

**Gecontroleerd**
- `node scripts/eenheidstests.mjs orch-` → 69/69. `node scripts/orch.mjs controleer` → groen (waarschuwing `KRITIEK_NIET_BEVESTIGD` is verwacht tot ondertekening door de eigenaar).
- `uitrol-manifest` (18/18) — bestaande pakketcontroles niet geraakt.

**Bewust niet gedaan / beperkingen**
- De basis `20261031-093842 @ b279ccab…` is **niet vergeleken met productie**: vanuit de omgeving van de agent is `hub.tarasevych.com` onbereikbaar (proxy 403) en zijn de MCP-hulpmiddelen
  van de technische ruimte (`_beheer`) inactief. In `beleid.json` staat de basisstatus op `opgave_eigenaar`; na verificatie volgen B-004 en `regelsVersie 1.0.1`.
- Het kritieke beleid is nog niet ondertekend door de eigenaar: hiervoor is `ssh-keygen -Y sign -n mijn-ruimte-regels` op de pc van de eigenaar (T:\) nodig, zie B-003.
- De SSHSIG-verificatie is getoetst met een geëmuleerde handtekening volgens PROTOCOL.sshsig, niet met een echte `ssh-keygen` (die ontbreekt in de omgeving). De eerste echte handtekening van de eigenaar
  vormt de controleverificatie.
- De tak `integratie` bestaat nog niet in origin; `versheid` gebruikt tijdelijk `origin/release/sec-001-20261031-084138` (basisTak). Het aanmaken van `integratie` gebeurt
  in overleg met de eigenaar (beschermde tak).

## Fase 1 — eenduidig ontwikkelsysteem (31-10-2026)

**Toegevoegd**
- `scripts/orch/inleveren.mjs` + opdracht `orch inleveren`: één pijplijn voor alle 8 kanalen (ZIP, TAR.GZ, git patch/mbox, lokale map, git-tak/PR-URL;
  MCP, HTTP API, webupload — dezelfde bestanden met een kanaalmarkering): uitpakken → `ORCH-OVERDRACHT.json` → regels en basis → nieuwe tak vanaf de basiscommit
  in een tijdelijke worktree → feitelijke wijzigingen (vergelijking met opgegeven wijzigingen) → `git merge-tree` tegen `integratie` → tests → registratie in
  `orchestratie/inleveringen/<id>.json` → wachtrij. Een afgewezen inlevering laat geen tak achter en raakt `integratie` niet aan, maar de registratie blijft behouden (audit).
- Statusbescherming: een inlevering die `orchestratie/taken`, `inleveringen`, `wachtrij.json`, `regels.lock.json` of `geinstalleerd.json` wijzigt → `BESCHERMDE_BESTANDEN`.
- Wachtrij `orch wachtrij toon|volgende|klaar|terugtrekken` — sequentieel (één taak `bezig`), geschiedenis in `wachtrij.json → geschiedenis`.
- `orch status` — `in_progress / integrated / released / installed`; `installed` uitsluitend uit `orchestratie/geinstalleerd.json` (geschreven door installer/eigenaar),
  `integrated` uit het feit van samenvoeging (`integratieCommit`); een agent kan geen `installed` verklaren (`INSTALLED_ALLEEN_INSTALLER`).
- `orch werkruimte --taak ID` — geïsoleerde werkboom (git worktree) op de taaktak; `orch taak-herlees` — bevestiging van herlezen regels;
  `orch staat-commit` — commit van uitsluitend statusbestanden.
- `beleid.json` 1.0.0 → **1.1.0** (`inlevering.standaardTests`, `recordMap`, `werkruimte`, `geinstalleerd`), B-004 in BESLUITEN.md.

**Gecontroleerd**
- `tests/eenheid/orch-inleveren-20261031.test.ts` — 36/36 op echte git-repositories: ZIP van agent zonder git, TAR.GZ via MCP met bestandsverwijdering,
  git patch (`git am`), verouderde basis met overlap (`BASIS_VEROUDERD_OVERLAP` + `CONFLICT`, geen tak achtergebleven, `integratie` niet overschreven),
  zonder ORCH-OVERDRACHT, verouderde regels, gefaalde tests, bewust overslaan van tests met opgave van reden, wachtrijmanipulatie, git-tak van een geregistreerde taak,
  werkruimte, sequentiële wachtrij (bezig → conflict bij samenvoegen → afgewezen → volgende → integrated), status `installed` op basis van feitelijke installatie, staat-commit.
- Totaal `orch-*`: kern 53 + cli 16 + inleveren 36 = **105**.

**Bewust niet gedaan / beperkingen**
- HTTP-route en MCP-hulpmiddel voor het uploaden van een inlevering naar de site — fase 3 (zij leveren het bestand alleen aan bij dezelfde pijplijn).
- Automatisch aanmaken van PR's: `--push` verstuurt de tak en toont de compare-URL; `gh pr create` wordt niet aangeroepen (op de server staat geen agenttoken, en dat is
  terecht — de PR wordt aangemaakt door degene die daar rechten voor heeft).
- Status `released` — fase 2 (pakket met `integratieCommit`).

**Volgende** — fase 2: `mijn-ruimte-…-AGENT-overdracht.zip` (installatiearchief + SHA-256 + metadata + rapport + tests + commits + agenten + handtekening),
installercontroles (basisversie, Git SHA, integriteit, regels), drie installatiemodi.

## Fase 2 — universele releases (31-10-2026)

**Toegevoegd**
- `UITROL-BASIS` in het pakket (`maak-voorstelpakket.sh`, `maak-uitrolpakket.sh`: `BASIS_VERSIE` + `BASIS_COMMIT`, + `regelsVersie`/`regelsHash` uit lock;
  verplicht vanaf `20261201-000000`). Root-installer `mijn-ruimte-uitrol.sh`: `BASIS_ONGELDIG`, `BASIS_VEROUDERD`, `BASIS_COMMIT_VERSCHILT`, `GEEN_BASIS`,
  `REGELS_NIET_VERGRENDELD` (python-afdruk = JS `regelsAfdruk`), `MODUS_NIET_TOEGESTAAN`; na een geslaagde installatie wordt `$WERK_ROOT/laatste-commit` weggeschreven.
  `gitops-ophalen.sh` (automatisch) — uitsluitend bij `automatisch_beperkt` en een ondertekende lock.
- `scripts/orch/pakket.mjs` + `orch pakket`: `mijn-ruimte-<versie>.tar.gz` (via het bestaande `maak-voorstelpakket.sh`) + `mijn-ruimte-<versie>-<agent>-overdracht.zip`
  (archief, `.sha256`, `.voorstel.json`, `ORCH-OVERDRACHT.json` met `installatie` en `sindsInstallatie`, `UITROL-MANIFEST.json`, `TESTRESULTATEN.json`,
  `RAPPORT.md` uk+nl, `COMMITS.txt` + `commits.bundle`, `AGENTEN.json`, `LEESMIJ.txt`, `.sig` indien aanwezig); taak → `released`.
  `orch pakket-controleer --bron <zip>` — controle zonder installatie. `inleveren --bron <overdracht.zip>` — integriteit, daarna inhoud van de tar.gz.
- Opgelost (coördinatiestatus): eigen `orchestratie/taken/<taakId>.json` toegestaan in een inlevering; `.gitattributes` `merge=orch-staat` + driver in
  `wachtrij volgende`; `UITROL-BASIS` in `UITGESLOTEN_PADEN` (dienstbestanden van het archief komen niet in de tak terecht).
- `beleid.json` 1.1.0 → **1.2.0** (`pakket`, `inlevering.eigenTaakBestandToegestaan`, statussen met `ter_integratie`), B-005, `REGELS-UITROLPAKKET.md` §6,
  `shared/uitrol-codes.ts` (+6 codes), `.gitignore` `uitvoer/`.

**Gecontroleerd**
- `tests/eenheid/orch-pakket-20261031.test.ts` — 23/23: echte `orch pakket` op een tijdelijke repository (tar via `maak-voorstelpakket.sh`, inhoud van zip en tar,
  `UITROL-BASIS`, `ORCH-OVERDRACHT` met twee basissen, `RAPPORT.md`, echte `git bundle`, status `released`), `pakket-controleer` (in orde / gemanipuleerde
  tar → `INTEGRITEIT` / nieuwere geïnstalleerde versie → `BASIS_VEROUDERD` / andere commit → `BASIS_COMMIT_VERSCHILT`), import van zip via `inleveren` (bestaande tak →
  `TAK_BESTAAT`; daarna geaccepteerd, tak gereconstrueerd vanaf de basis), weigeringen van `maak-voorstelpakket.sh` zonder/met ongeldige `BASIS_*`.
- `tests/eenheid/orch-uitrol-basis-20261031.test.ts` — 14/14: echt root-script onder een niet-geprivilegieerde gebruiker (`setpriv`, uid 65534) met een installer-stub:
  oud formaat OK + `laatste-commit`, juiste basis OK, `BASIS_VEROUDERD`, `BASIS_COMMIT_VERSCHILT`, `BASIS_ONGELDIG`,
  `REGELS_NIET_VERGRENDELD`, `MODUS_NIET_TOEGESTAAN` met lock berekend in JS (python-afdruk root = JS), CRLF, `GEEN_BASIS`; stub exact 4 keer aangeroepen.
- Totaal `orch-*`: kern 67 + cli 16 + inleveren 36 + pakket 23 + uitrol-basis 14 = **156**; `uitrol-codes` 17, `uitrol-manifest` 18, `uitrol-pakket-maken` 5,
  `uitrol-weergave-v2` 29 — groen. `uitrol-deur` overgeslagen (geen `ssh-keygen` in de omgeving), `server-beheer`/`uitrol-goedkeuring` — geen `pg`.

**Bewust niet gedaan / beperkingen**
- De pakkethandtekening met de echte sleutel van de eigenaar is niet getest (de agent heeft geen sleutel en hoort die ook niet te hebben) — de root-controle van de handtekening blijft zoals die was
  (`uitrol-deur`). De tests van fase 2 dekken alles na de handtekening.
- Niet uitgevoerd op productie; `laatste-commit` verschijnt op de server na de eerste installatie met het nieuwe script (tot die tijd treedt `BASIS_COMMIT_VERSCHILT`
  niet in werking — alleen de versiecontrole).
- Site/MCP voor het uploaden van een overdrachtspakket — fase 3.

## Fase 3 — beheer via de site, MCP en HTTP; regels met passkey (31-10-2026)

**Toegevoegd**
- `shared/orch-model.ts` — routes `/api/owner/orch/*`, limieten (fragment 512 KiB, pakket ≤ 300 MiB, 20 uploads/uur), types, codes `ORCH_CODES` (uk+nl).
- `backend/orch-opslag.ts` — centrale toegang tot de werkkopie van de coördinatie (`ORCH_WORTEL`, standaard `/srv/mijn-ruimte/orch-repo`): overzicht, context,
  taakregistratie, gefragmenteerde upload naar `ORCH_INBOX` → dezelfde `inleveren(...)`/`registreerInlevering(...)`, regelvoorstellen via
  `beoordeelVoorstel`, toepassen (`vergrendel` → `bevestigMetPasskey`, `compacteContext`, `controleer`, commit, push, compare-URL). Geen
  eigen regellogica — uitsluitend aanroepen naar `scripts/orch/kern.mjs` en `scripts/orch/inleveren.mjs` (waarvoor `.d.mts` is toegevoegd).
- `backend/orch-routes.ts` (eigenaar, `requireSession` + `isOwnerEmail`; `ADMIN_SERVICE_REQUIRED` voor de technische ruimte), `backend/orch-hulpmiddelen.ts`
  + `orch-hulpmiddeldefinities.ts` (MCP: `orch_overzicht`, `orch_context`, `orch_taak_start`, `orch_inleveren_begin|stuk|klaar`; in catalogus v2,
  `TOOL_CAPABILITY`, `mcp-acties`, tweetalige teksten), `backend/orch-besluit-pg.ts` (opzoeken van het besluit voor toepassing).
- Eigenaarsbesluit van een nieuw type **`orch-regels`**: `deploy/goedkeuring/besluit-kern.mjs` (+ `.d.mts`), `deploy/besluit/mijn-ruimte-besluit.sh`
  (`orch_regels`: root voegt enkel de bevestiging toe aan `$WERK/orch-regels-bevestigd.jsonl` 0600 en herschrijft `$STATUS/orch-regels-bevestigd.json` 0640,
  laatste 50; gebeurtenis `BESLUIT_ORCH_REGELS_OK`; schakelaar `orch-regels-passkey`), `backend/eigenaar-besluit.ts`, `shared/eigenaar-besluit.ts`,
  `src/besluit/besluit-client.ts`.
- `deploy/gitops/gitops-ophalen.sh` — een passkey-lock wordt **alleen** geaccepteerd als dezelfde vermelding in het root-logboek staat (`GITOPS_ORCH_BEVESTIGD`);
  SSH-handtekening werkt zoals voorheen.
- Site: `src/agenten/TabOrch.tsx` + `src/orch/orch-client.ts` + `src/orch/orch.css` (tabblad «Coördinatie»: overzicht, taken/wachtrij/inleveringen,
  pakketoverdracht vanaf apparaat met voortgang, regeleditor → controle → passkey → tak), hulpteksten `orch.inlevering` / `orch.regels` in `hulp-register`.
- `server/platform/antwoord.ts` — `json`/`error` zonder keten naar `pg` (router herexporteert); coördinatieroutes zijn testbaar zonder database.
- `deploy/installeer-app.sh` → `orch_inrichten` (maakt `orch-inbox` aan, meldt de aanwezigheid van de werkkopie). `beleid.json` 1.2.0 → **1.3.0**
  (sectie `site`; `kritiek.toelichting` vermeldt passkey), B-006, `AGENTS.md` §5–§7, RUNBOOK §18, `uitrol-codes` (+`BESLUIT_ORCH_REGELS_OK`).
- Bestaande zaken opgelost: `tests/eenheid/besluit-root-20261022.test.ts` faalde wanneer tests als root werden gedraaid (het script negeert bewust `BESLUIT_*` voor root) —
  draait nu onder uid 65534 via `setpriv` (gedeelde helpers geëxporteerd). `hulpmiddelen-tweetalig` gebruikt het gedeelde
  `tests/eenheid/hulp/taalcontrole.ts`. `backend/index.ts` riep `gmailParserPolicySelfTest`, `normalizeGmailMessage`, `gmailMaxHistoryId`,
  `gmailHistoryMessageIds` en het type `MailClassificationSignals` aan **zonder import** (verloren gegaan in de SEC-001-snapshot van 30-10-2026; tsc TS2304, in runtime een
  ReferenceError bij Gmail-synchronisatie) — imports hersteld. `backend/mail-afzenders.ts`: `was` buiten bereik in `afzenderVerifieren`
  (ReferenceError bij handmatige afzenderverificatie) → `basis.status`; `fout` omgezet naar functiedeclaratie (TS versmalt het type na `if (!x) fout()`);
  opgeslagen bewijsregels worden gecontroleerd tegen `AuthUitslag` (`shared/mail-afzenders.ts → authUitslag`). `tsc -p tsconfig.server.json`: 130 → 111 fouten,
  alle overige komen door ontbrekende modules in de omgeving (`pg`, `ws`, `pdf-lib` → TS2307/TS7006) en twee plekken die afhangen van `pg`-types
  (`ruimte-scheiding.ts:117`, `uitrol-goedkeuring.ts:447`, `index.ts:636`) — te controleren in een omgeving met een volledige `node_modules`.

**Gecontroleerd**
- `tests/eenheid/orch-site-20261031.test.ts` — 74/74 op echte git-repositories met `origin`: toegangsdrempel (401, `OWNER_REQUIRED`,
  `ADMIN_SERVICE_REQUIRED`), `ORCH_GEEN_REPO` zonder emulatie, overzicht/context, taakregistratie (`TAAK_BESTAAT`, `TAAK_ONGELDIG`, `BASIS_ONBEKEND`),
  gefragmenteerde upload (naam, grootte, offset, SHA-256, onvoltooid + annuleren) → geaccepteerd/afgewezen (`REGELS_VEROUDERD`), MCP-hulpmiddelen
  via `voerOrchToolUit`, regelvoorstel (alle weigeringscodes, 413), toepassen (`GEEN_BESLUIT`, `BESLUIT_PAST_NIET`, `NIET_BEVESTIGD_DOOR_ROOT`,
  `ORCH_REPO_VUIL`; succes: tak `regels/<versie>-<tijd>`, lock met passkey, CONTEXT-COMPACT, push naar origin, `controleer` groen, herhaling →
  `GEEN_VOORSTEL`), `VOORSTEL_VEROUDERD` na regelwijziging, intrekken; registers (catalogus v2, naamlengte ≤ 64 voor elke agent, taal van de teksten).
- `tests/eenheid/orch-besluit-root-20261031.test.ts` — 34/34: echte `mijn-ruimte-besluit.sh` onder uid 65534 (logboek 0600, statusbestand 0640, gebeurtenis,
  schakelaar, rechten ongewijzigd, installer niet aangeroepen; aanvallen: inhoud, onbekende sleutel, hergebruikte handtekening, vreemde taak, andere hash, uitgeschakeld);
  `rootBevestigingen()` leest het root-bestand; GitOps-controle wordt uitgevoerd met dezelfde Python-code uit het script tegen het echte logboek (geaccepteerd;
  zonder logboek; vreemd besluit/voorstel/hash/kritiekHash; onvolledige passkey; beschadigd logboek; SSH-pad; zonder eigenaar).
- Totaal `orch-*`: kern 78 + cli 16 + inleveren 36 + pakket 23 + uitrol-basis 14 + site 74 + besluit-root 34 = **275**; `besluit-root` 47/47,
  `mcp-acties` 12/12, `uitrol-codes` 17/17; `bash -n` voor drie scripts; `tsc -p tsconfig.server.json` — geen fouten in de gewijzigde bestanden.

**Bewust niet gedaan / beperkingen**
- Typecontrole van de frontend (`src/`) is in de omgeving van de agent onmogelijk: `react`/`lucide-react`/`@types/react` ontbreken en `npm install` wordt geblokkeerd
  (403 op `cdn.sheetjs.com`). De logica van `TabOrch.tsx` is gecontroleerd met typestubs; definitieve controle via CI/`npm run typecheck` bij de eigenaar.
- Tests die `pg` vereisen (`connector-v2`, `tweetalig`, `besluit-app`) draaien hier niet — de registers zijn afzonderlijk gecontroleerd in `orch-site`.
- De werkkopie voor coördinatie op de server (`/srv/mijn-ruimte/orch-repo`) wordt door de eigenaar aangemaakt met een deploy-sleutel (RUNBOOK §18.1) — de installer heeft bewust geen sleutel.
- Productie is niet aangeraakt; de tak `regels/*` wordt na passkey alleen naar `origin` gepusht, het samenvoegen in `integratie` is aan de eigenaar.

**Volgende** — fase 4: acceptatietests (parallelle agenten, git-conflicten, verouderde release, import van archief zonder git, beleidswijziging, herstel van een
«bevroren» agent, gelijktijdige installaties, terugdraaien).

## Fase 4 — acceptatietests (31-10-2026)

**Toegevoegd**
- `tests/eenheid/orch-acceptatie-20261031.test.ts` — 47 controles in acht end-to-end-scenario's uit het bestek op een echte git-repository via de CLI
  (`inleveren`, `wachtrij`, `status`, `versheid`, `taak-herlees`, `taak-staat`, `pakket`, `pakket-controleer`), de echte root-installer
  (`mijn-ruimte-uitrol.sh` onder uid 65534) en het echte root-besluitscript (`mijn-ruimte-besluit.sh` + passkey):
  1. **Parallelle agenten** — claude en codex wijzigen vanaf dezelfde basis verschillende bestanden; beide inleveringen worden geaccepteerd, de wachtrij verwerkt ze één voor één
     (`volgende` → `git merge --no-ff` → `klaar integrated`), beide resultaten zitten in `integratie`, niets is verloren gegaan, de basis is voorouder van de top gebleven.
  2. **Git-conflicten** — bij inlevering (gemini raakt op een verouderde basis hetzelfde bestand aan → `BASIS_VEROUDERD_OVERLAP` + `CONFLICT`, geen tak,
     `integratie` ongewijzigd) en bij samenvoegen (grok en antigravity geaccepteerd vanaf dezelfde basis, de tweede conflicteert pas bij `merge` → abort,
     `klaar afgewezen`, taak terug naar `in_progress`); beide agenten worden na een rebase op de verse basis met een nieuw taklabel geaccepteerd en samengevoegd.
  3. **Verouderde release** — `orch pakket` vanuit `integratie` (`UITROL-BASIS` = geïnstalleerde basis); root installeert (OK, `laatste-commit`), het feit van installatie
     zet de taken op `installed`; nadat een «andere agent» een nieuwere versie heeft geïnstalleerd, wijst root het pakket op de oude basis af (`BASIS_VEROUDERD`,
     installer niet aangeroepen) — en `pakket-controleer` meldt hetzelfde.
  4. **Import zonder git** — een agent werkt met `CONTEXT-COMPACT.md` (bevat versie en afdruk van de regels) en een export van de basis zonder `.git`, en levert een zip terug;
     het inleverrecord legt het kanaal, de reden «zonder git» en de SHA-256 vast.
  5. **Beleidswijziging** — de eigenaar verhoogt `regelsVersie` (vermelding in BESLUITEN.md, `vergrendel`, `context`); een taak met oude regels →
     `REGELS_VEROUDERD` in `versheid`, inlevering afgewezen; na `taak-herlees` — geaccepteerd en samengevoegd.
  6. **«Bevroren» agent** — taak staat op `bezig` in de wachtrij, de agent is verdwenen: `wachtrij terugtrekken --reden` + `taak-staat bevroren` → de wachtrij loopt door
     (`WACHTRIJ_LEEG`, niet `WACHTRIJ_BEZIG`), `status` toont `bevroren`, inlevering → `TAAK_BEVROREN`, `controleer` groen; na `in_progress`
     wordt een nieuwe inlevering geaccepteerd zonder dat de oude tak wordt overschreven.
  7. **Gelijktijdige installaties** — een tweede installatie tijdens de eerste: `flock` → «er loopt al een uitrol», exitcode 0, installer wordt niet voor een tweede keer aangeroepen,
     het pakket blijft in de inbox; de volgende ronde installeert het; in de stub ligt de start van de tweede NA het einde van de eerste.
  8. **Terugdraaien** — passkey-besluit `terugdraaien` → root-script → installer `terugdraaien <vorige>`, `current` → vorige release; in de coördinatie
     keert het installatiefeit terug naar de vorige basis → taken staan weer op `released` (niet `installed`), hetzelfde pakket is opnieuw geldig tegen de basis.
- Bestaand probleem opgelost (gevonden door scenario 7): `mijn-ruimte-uitrol.sh` **wiste na een geslaagde installatie alle** `mijn-ruimte-*.tar.gz` uit de inbox — waardoor een nieuwer
  pakket dat tijdens de installatie was binnengekomen stilletjes verdween. Nu worden alleen pakketten opgeruimd die niet nieuwer zijn dan de geïnstalleerde versie; een nieuwer pakket blijft staan voor
  de volgende ronde, waar het door de normale controles (versie, `UITROL-BASIS`, regels) wordt beoordeeld.

**Gecontroleerd**
- `orch-acceptatie` 47/47; totaal `orch-*` = **322** (kern 78, cli 16, inleveren 36, pakket 23, uitrol-basis 14, site 74, besluit-root 34,
  acceptatie 47); `besluit-root` 47; `bash -n` van de installer.

**Bewust niet gedaan / beperkingen**
- Scenario's met root (3, 7, 8) worden alleen uitgevoerd waar `setpriv` beschikbaar is of wanneer de tests niet als root zijn gestart; anders worden ze met een melding overgeslagen.
- Productie is niet aangeraakt; alle scenario's draaien op tijdelijke repositories en bomen.

## Onafhankelijke beoordeling vóór integratie (31-10-2026, Antigravity `a5f2741` + ChatGPT PR #13)

De eigenaar heeft PR #11 door twee onafhankelijke agenten laten beoordelen. Antigravity vond kritieke blokkades en bereidde de tak `fix/orch-001-review-20261031-165744` voor
(`a5f2741`, 688/688 op zijn machine); ChatGPT maakte concept-PR #13 (`fix/orch-001-audit-20261031-170250`, 4 wijzigingen zonder testrun). Beide takken
vertrekken vanaf `d4c2ae9`; `a5f2741` is ongewijzigd samengevoegd in `feature/orch-001-20261031-112355` (fast-forward), de delta uit PR #13 is als aparte commit toegevoegd.

**Overgenomen uit `a5f2741` (elke groep regel voor regel gelezen en hier met tests geverifieerd)**
- **CRITICAL — RCE nr. 1.** `uploadKlaar` (site/MCP/HTTP) geeft `tests[]` niet langer door aan `sh -c`: alles behalve exact `node scripts/orch.mjs controleer`
  → `400 TESTS_NIET_TOEGESTAAN`; de parameter `tests` is verwijderd uit het schema van `orch_inleveren_klaar`. `veiligeTestEnv` — kindprocessen krijgen alleen
  `PATH/HOME/TMP*/LANG/LC_ALL/TZ/…`, zonder `DATABASE_URL`, sleutels en peppers.
- **CRITICAL — RCE nr. 2.** De standaardcontrole voerde `scripts/orch.mjs` uit **vanuit het pakket van de agent** (cwd = uitgepakte boom). Nu wordt het
  vertrouwde `join(wortel, 'scripts/orch.mjs') controleer --wortel <boom>` gestart via `spawnSync(process.execPath, …)`, zonder shell; `orch.mjs` ondersteunt nu
  `--wortel`. Een regressietest stopt een `scripts/orch.mjs` in het pakket dat `PWNED.txt` schrijft — het bestand verschijnt niet.
- **HIGH — GitOps en SSHSIG.** `gitops-ophalen.sh` (PYMODUS) accepteerde voorheen elke niet-lege `eigenaar.handtekening`; nu vindt een echte controle plaats met
  `ssh-keygen -Y find-principals` + `-Y verify -n mijn-ruimte-regels` tegen het **root-bestand** `/etc/mijn-ruimte/eigenaar-ondertekenaars` (niet uit de release —
  RUNBOOK §18.1.5). `verifieerSshsig` in `kern.mjs`: opties van allowed_signers (`namespaces=`, negatie, verbod op `cert-authority`), SSHSIG-versie = 1,
  veldlengtes, verbod op overtollige bytes, handtekeningtype ed25519/64 bytes.
- **HIGH — regressie SEC-001-05.** `orch` is toegevoegd aan `IMPERSONATIE_ALTIJD_VERBODEN` en `AGENT_VERBODEN`: alle `/api/owner/orch/*` zijn verboden onder
  impersonatie (ook met `metActies`) en voor agenten namens de eigenaar.
- **HIGH — archieven, git-refs, isolatie van `ORCH_WORTEL`.** `controleerZipVooraf`/`controleerTarGzVooraf` weigeren vóór het uitpakken symlinks/specifieke systeembestanden,
  `..`, absolute paden, `\`, `:`, >60.000 items (`INHOUD_ONVEILIG`); `padVeilig` weigert daarnaast lege segmenten, `.` en geneste `.git`; `githubRef`
  verwerpt argumenten met `-` en ongeldige tekens (`REF_ONGELDIG`), `fetch origin -- <ref>`. `voorstelToepassen`: exacte vergelijking van `besluit.id` met de vermelding
  in het root-logboek (hetzelfde id, zonder koppeltekens) en de tak `regels/*` wordt opgebouwd in een geïsoleerde `git worktree` — `ORCH_WORTEL` blijft op `integratie`.
- **MEDIUM.** `shared/zoek-ui-knoppen.generated.ts` opnieuw gegenereerd (`TabOrch` → profiel `technisch`, tabblad `#orch` eveneens); `TS2345` in
  `backend/codewoord.ts`; een opmerking in `src/orch/orch.css` bevatte `*/` en sloot het commentaarblok voortijdig; `tr -d '\r'` voor python-uitvoer en `sed` voor
  het `\`-voorvoegsel van `sha256sum` in `maak-*.sh`; `controleer` vergelijkt CONTEXT-COMPACT na `normaliseer` (CRLF). Nieuwe testsuite
  `tests/eenheid/orch-beoordeling-20261031.test.ts`.

**Overgenomen uit PR #13 (ChatGPT) — wat nog niet in `a5f2741` zat**
- **Koppeling van de upload aan de initiërende actor.** `uploadStuk`/`uploadKlaar`/`uploadAnnuleren` ontvangen `actor` (HTTP: e-mailadres van de eigenaar; MCP:
  `clientName (agent) via mcp [grant/token-id]`) en vergelijken die met `door` dat is vastgelegd in `uploadBegin`; een andere actor krijgt `UPLOAD_ONBEKEND` (404), net als
  bij een niet-bestaande upload. Anders kon elke agent die de 16-hex `id` achterhaalde andermans upload voltooien of annuleren. Het server-id van de grant/token is
  bewust toegevoegd (ChatGPT markeerde dit zelf als restrisico): twee verbindingen met dezelfde naam «Grok (grok)» zijn verschillende actoren. Gedekt door 5
  controles in `orch-beoordeling` (MCP↔HTTP, andere agent, dezelfde naam via andere grant, annuleren uitsluitend door initiatiefnemer, `door` bevat id).
- **Niet overgenomen:** `TESTS_NIET_GEISOLEERD` (409) met het volledig overslaan van controles en een verbod op `zonderTests` — dit wordt overtroffen door de veiligere variant van Antigravity
  (de vertrouwde `controleer` wordt wél uitgevoerd, zonder code uit het pakket); `zonderTests` blijft toegestaan — na de adversariële controle (hieronder) alleen nog als
  kanttekening in het record: de vertrouwde `controleer` draait altijd.

**Bestaand probleem opgelost (gevonden tijdens integratie)**
- `orch-uitrol-basis` en `orch-acceptatie` plaatsten alleen een `ssh-keygen`-shim wanneer een echte ontbrak; op een machine met een echte `ssh-keygen` gaven hun fictieve
  `.sig`-bestanden `HANDTEKENING_ONGELDIG`. De shim staat nu altijd vooraan in `PATH` (deze suites testen niet de handtekening — de handtekening wordt getest door `uitrol-deur`).

**Gecontroleerd (in deze omgeving, met echte `ssh-keygen` 9.6)**
- `orch-beoordeling` 28/28 (23 Antigravity + 5 actorkoppeling), `orch-site` 74/74, `orch-besluit-root` 36/36 (incl. echte handtekening → GitOps
  accepteert, vervalste → weigert), `orch-uitrol-basis` 14/14, `orch-acceptatie` 47/47, `orch-kern`/`orch-cli`/`orch-inleveren`/`orch-pakket` — zie
  het overzicht hieronder; `tsc -p tsconfig.server.json` — 110 fouten, allemaal in niet-ORCH-bestanden wegens ontbrekende `@types/pg`/`react` in de sandbox (waren er 111;
  `codewoord.ts` opgelost); `node scripts/zoek-ui-catalogus.mjs --controle` actueel (1331); `npm run orch:controleer` groen; `bash -n` op vijf
  scripts; `python3 -m py_compile` op het PYMODUS-blok; `build:server` (esbuild) gebouwd; `vite build` is in de sandbox onmogelijk (geen vite/react).
- De volledige suite `node scripts/eenheidstests.mjs` zonder filter stopt in de sandbox bij de allereerste test die een database nodig heeft (`DATABASE_URL_ONTBREEKT`),
  net als op basis `d4c2ae9`; daarom zijn de suites één voor één gedraaid — samenvatting in het verslag in de thread.

## Adversariële controle na integratie (31-10-2026)

Na het samenvoegen van `a5f2741` + PR #13 is de tak nogmaals met een «aanvallersbril» doorgelicht (19 bevindingen). Elke bevinding is handmatig geverifieerd; de reële punten zijn verholpen en
afgedekt met tests die op de eerdere code zouden falen.

**HIGH**
- **GitOps vergeleek de lock niet met de bestanden in de release.** PYMODUS controleerde de handtekening/passkey alleen voor `lock.kritiekHash`, terwijl `beleid.json` in de release
  ANDERE kritieke beleidsregels kon bevatten (een agent voegt `automatisch_beperkt` of `privesleutelsNaarAgenten: true` toe bovenop een oude bevestigde lock). Nu
  berekent PYMODUS (en PYREGELS van de root-installer) `stabielJson`/`kritiekAfdruk`/`regelsAfdruk` in Python op precies dezelfde wijze als `kern.mjs` (BOM/CRLF, cyrillisch,
  emoji, `1.0`, `1e20` — met een test gecontroleerd op byte-voor-byte gelijkheid), en vereist gelijkheid van `kritiekHash`, `hash` en `regelsVersie`; `regelBestanden` moeten
  veilige paden zijn met `AGENTS.md` en `beleid.json`; `NaN` in JSON wordt geweigerd; `python3 -I`. De tests `orch-besluit-root` en 5e in `orch-beoordeling`
  gaven voorheen fictieve afdrukken mee — nu een echte release.
- **CLI `inleveren` voerde standaard pakketcode uit** (`standaardTests[1]` = `node scripts/eenheidstests.mjs orch-kern` in de pakketboom,
  met de `HOME` van de operator). Nu draait standaard alleen de vertrouwde `controleer`; shell-tests draaien uitsluitend bij een expliciete `--tests`/`--standaardtests` met waarschuwing; na
  fouten in stap 6 (conflict, veroudering) worden tests helemaal niet meer gestart.
- **Uitpakbom (zip/tar-bomb).** Voorcontroles beperkten het aantal items, maar niet de omvang: 408 KiB → 400 MiB op schijf. Nu geldt ≤ 1 GiB per archief op basis van
  FEITELIJKE bytes (`unzip -p`/`gzip -dc` → `head` → `wc`, zonder naar schijf te schrijven): geverifieerd dat unzip 6.0 20 MiB schrijft bij een header van «10 bytes».
  Voor tar wordt daarnaast de som van de groottes uit de headers gecontroleerd (sparse bestand van 64 MiB uit een stroom van 10 KB), en na het uitpakken de zichtbare mapomvang.

**MEDIUM**
- `zonderTests` schakelde op de server de vertrouwde `controleer` uit → een pakket met een gewijzigde `AGENTS.md` zonder lock kwam erdoorheen. Nu draait `controleer` altijd.
- Een agent kon namens een andere agent handelen (`orch_taak_start` met een vreemde `agent`, pakket met een vreemde `agent` in `ORCH-OVERDRACHT.json`) → `AGENT_VERSCHILT`;
  het inleverrecord slaat `door` op.
- `deploy/mijn-ruimte.service` miste `ReadWritePaths` voor `orch-inbox`/`orch-repo` → EROFS bij de eerste upload. Toegevoegd (RUNBOOK §18.1.6).
- `compactContext.bestand` werd niet gecontroleerd — een regelvoorstel kon een bestand buiten de boom of over `AGENTS.md` heen schrijven. Nu is alleen
  `orchestratie/<naam>.md` (`CONTEXT_PAD`) toegestaan in `valideerBeleid`, in `context()`, `voorstelToepassen` en de CLI `context`.

**LOW**
- De tak `regels/*` wordt opgebouwd vanaf de gecontroleerde SHA in plaats van de taknaam (TOCTOU); we maken de tak zelf aan vóór `worktree add`, en bij een fout
  (bijv. een post-checkout hook) ruimen we zowel de boom als de tak op — getest met een hook.
- MCP: limiet van 20/uur op `begin` en `klaar` per eigenaar; `orch_overzicht` maskeert voor een agent het e-mailadres van de eigenaar, vreemde uploads, passkey en besluit-id.
- Bestaand: de lijst met conflicten bevatte informatieve regels van `git merge-tree` («Auto-merging …»); uitpakfouten hadden ook in `nl` een Oekraïense tekst.

**Tests:** `orch-beoordeling` 28 → 49, `orch-besluit-root` 36 → 49, `orch-inleveren` 36 → 41, `orch-uitrol-basis` 14 → 15; expliciete
`OVERGESLAGEN`-meldingen wanneer `ssh-keygen`/`python`/`tar --sparse` ontbreekt; isolatie van de worktree wordt gecontroleerd via de reflog; `veiligeTestEnv` — end-to-end
(pakketcode ziet geen `DATABASE_URL`/`SESSION_SECRET` van de operator).

**Beperkingen / vervolg bij de eigenaar**
- Op de server is het root-bestand `/etc/mijn-ruimte/eigenaar-ondertekenaars` vereist (RUNBOOK §18.1.5), anders weigert GitOps een met SSH ondertekende lock.
- PR #11 is niet samengevoegd, `integratie` is niet aangemaakt, het beleid is niet ondertekend en productie (`b279ccab…`) is niet aangeraakt — wacht op een afzonderlijk `DEPLOY ПІДТВЕРДЖЕНО`.

## Integratie en afsluiting van de taak (01–05-11-2026)

- **1-11-2026.** De eigenaar heeft PR #11 gesloten als opgenomen en PR #16 (fasen 0–4, controles, MCP-001, MCP-deur op poort 8091)
  samengevoegd in `release/sec-001-20261031-084138`. De vervolgcorrecties en de scheiding van privé- en technische «AI-toegang»
  zijn via PR #17 samengevoegd met merge-commit `4db51b6` (samen met PR #18; vóór het herschrijven `5f84d9d`). Die commit ligt op
  de eerste-ouderlijn van zowel `release/sec-001-20261031-084138` als `integratie`.
- **Herschrijven van de historie (B-010, B-011).** De historie is twee keer herschreven, dus elke commit heeft drie SHA's. Auteur,
  datum en onderwerp zijn in alle drie gelijk.

  | Commit | vóór B-010 | tussen B-010 en B-011 | na B-011 (canoniek) |
  |---|---|---|---|
  | taakbasis | `b279ccab` | `0614c8b` | `5a023b41` |
  | adversariële controle | `fa50a5b` | `7c8844a` | `7176e95` |
  | PR #16 | `f8def89` | `a58579e` | `d33d068` |
  | PR #17, 1/2 | `c414fe7` | `878e45c` | `eebfdd1` |
  | PR #17, 2/2 | `8722770` | `a3ae4e6` | `3dea7c1` |
  | merge PR #17 + PR #18 | `5f84d9d` | `10d5c90` | `4db51b6` |

  De taakbasis `5a023b41` is een voorouder van `integratie`.
- **Geïnstalleerde versie.** `4db51b6` is een voorouder van de canonieke geïnstalleerde basis `f3f3fab` (`20261105-061659`,
  `geverifieerd_productie`, B-014) en van de huidige `integratie` en `voornaamst`. De servercommit `a318ba0` (waar de tag
  `20261105-061659` naar wijst) ligt in de tussenhistorie tussen B-010 en B-011. Zijn voorouder `10d5c90` is dezelfde merge van
  PR #17 met de tussen-SHA's, dus PR #17 zit erin als voorouder. `/api/version` is vanuit de cloudcontainer niet bereikbaar.
- **5-11-2026, coördinatiestaat.** De taak stond op `in_progress` onder regels 1.4.2. In de eigen declaratie
  (`orchestratie/taken/ORCH-001.json`, uitzondering AGENTS.md §4.3) staat nu: regels 1.4.9 (`taak-herlees`), `integrated` (`taak-staat`),
  `integratieCommit` `4db51b6`, basis `5a023b41` (oude SHA bewaard). Het wachtrijbestand `wachtrij.json` wijzigt de agent niet: bovenaan
  staat nog de regel van het gesloten PR #11 (tak `feature/orch-001-20261031-112355`, «wacht»). Die sluit de integrator op `integratie`.
  **De volgorde telt: eerst de PR van de taak samenvoegen in `integratie`, daarna** `wachtrij volgende`, dan
  `wachtrij klaar --taak ORCH-001 --uitkomst integrated --hoofd 4db51b6aabe73f295ba4286c4c7557568c0d5e3e`, dan `staat-commit`.
  Reden: `wachtrij klaar` herschrijft `orchestratie/taken/ORCH-001.json` op `integratie`, en voor dat bestand geldt `merge=orch-staat`
  (de versie van `integratie` blijft). Wie de wachtrij eerst sluit, verliest bij een lokale merge van de PR stil de eigen declaratie
  (regels 1.4.9, basis `5a023b41`, blok `afsluiting`); een merge op GitHub geeft een conflict in dat bestand. Al gebeurd? Dan op
  `integratie`: `git checkout <kop van de PR> -- orchestratie/taken/ORCH-001.json`, daarna `staat-commit`. Tot de wachtrij gesloten
  is, meldt `controleer` geen fout: orch-kern aanvaardt beide staten van de regel (wacht nog, of staat al in `geschiedenis` als
  `integrated`).
  De status `installed` zet alleen de installer via `orchestratie/geinstalleerd.json`, dat nog ontbreekt.
- **Onderweg gevonden en in aparte commits hersteld:**
  - *Zoekcatalogus van knoppen.* De catalogus was verouderd na AUDIT-001. De generator bepaalde het tabblad uit tekst in de 1500 tekens
    vóór een knop, waardoor «Verwijdering bevestigen» naar «Personalisatie» leidde. Nu leest `scripts/zoek-ui-catalogus.mjs` de
    syntaxisboom van TypeScript en berekent voor elke plek de mogelijke tabbladen. Na twee onafhankelijke controles kwam erbij:
    - waarden van uitdrukkingen (`pages[tab]` in de beheerconsole, `effectiveTab` in de cloud, `section` in MCP), `switch` met
      `break` en het hijsen van functies;
    - alleen de prop `tab` van de pagina telt als tabblad, niet `useState`, `.map((tab) => …)` of `item.tab`. Een pagina telt ook
      als ze geëxporteerd is via `memo(X)`, `forwardRef(X)`, een alias of met een typeomzetting (`as`, `satisfies`, `!`);
    - een lineair geheugen voor de doorloop (vroeger 2^N paden);
    - de hub «AI-koppelingen» staat op `mcp/agents` (163 elementen);
    - de sectie van een knop komt alleen uit zijn eigen JSX-boom en geldt tot het einde van het dichtstbijzijnde blok (`section`,
      `article`, `footer`, `dialog` enz.). Bij 142 knoppen verdween de sectie. Meestal was die onjuist: een kop uit een andere boom,
      uit een andere tak of een wisselende kop. Maar minstens 14 juiste secties gingen ook weg (onder meer `Toegangscodes`,
      `uitrol/Geschiedenis`, `uitrol/Bronnen`, «Стандарт» in `AgentKleuren`). Dat is een voorzichtige keuze: liever geen sectie dan
      een onjuiste;
    - 16 bestanden die vanaf `src/main.tsx` onbereikbaar zijn (14 zonder één import en 2 die alleen vanuit andere dode bestanden
      geïmporteerd worden) en tabbladen die altijd doorsturen (`mcp`: overview, connect, verbindingen) komen niet in de catalogus.
      De «?»-uitleg uit zulke bestanden biedt het zoeken ook niet aan (`hulp:keys.doel`);
    - de technische delen van de hub, het overzichtspaneel van de console (`src/overzicht/` → `admin/overview`) en de technische
      meldingen (`meldingen/TechMeldingen`) zijn alleen met een technisch profiel zichtbaar. Een test vergelijkt dat met de
      technische modules van `shared/tech-bundels.ts`.
    Catalogus: 1334 elementen. Tests zoek-ui-tabblad 46/46, zoek-ui-sectie 14/14, zoek-ui-bereik 24/24; alle mutanten gedood (28 vóór
    de tweede controle en 19 erna).
    Komen er vóór het samenvoegen andere wijzigingen in `src/**/*.tsx` op `integratie`, dan moet de catalogus opnieuw gemaakt worden
    met `node scripts/zoek-ui-catalogus.mjs` (dat doet `npm run build` ook); de actualiteitstest meldt het.
  - *Zoekkaarten openden alleen de hoofdpagina van de dienst.* De routes van de catalogus en de adapters komen nu op het juiste
    tabblad (`zoek-route-tabblad` 10/10).
  - *Recente zoekopdrachten mengden de ruimtes.* Een pagina die met een actief technisch profiel was gekozen (`admin/sso`), verscheen
    als link in de privéruimte. Nu is er een lijst per ruimte. De ruimte volgt de technische activering van het tabblad op het
    moment dat het menu opent, niet het uiterlijk van de pagina. Een route naar `admin.*`, `api.*` of een technisch tabblad van
    `mcp.*` gaat altijd naar de technische lijst, en zulke rijen uit oude privélijsten worden niet meer getoond. Bestaande
    privélijsten blijven behouden (`zoek-recent` 31/31, 15 van 15 mutanten gedood).
  - *Na F5 werd een beheerpagina even privé.* Zolang de status van het technische profiel laadt, blijft het tabblad in de technische
    ruimte als het daar vóór het herladen was (alleen met een goedgekeurde sessie). De inhoud van de pagina blijft achter de echte
    activering (`tech-ruimte-f5` 8/8, 7 van 7 mutanten gedood).
  - *Scenario 7 van `orch-acceptatie`.* Een vaste pauze van 1,2 s gaf onder belasting 45/47. Nu houdt de stub de eerste installatie
    onder flock vast tot de test de tweede heeft gecontroleerd.

**Vervolg bij de eigenaar**
- De PR van de taak samenvoegen in `integratie` en pas daarna de regel van PR #11 in de wachtrij sluiten met de drie opdrachten hierboven.
- Kritieke beleidsregels bevestigen met passkey of SSH-handtekening: `controleer` meldt nog `KRITIEK_NIET_BEVESTIGD`, B-001…B-006
  staan op `voorstel`, `regels.lock.json → eigenaar` is leeg.
- Root-bestand `/etc/mijn-ruimte/eigenaar-ondertekenaars` op de server (RUNBOOK §18.1.5), anders weigert GitOps een met SSH
  ondertekende lock.
- `beleid.json → basis` (`20261105-061659`) vergelijken met de werkelijk geïnstalleerde versie: tag `20261105-101500` wijst naar `53a7b91`.
- Desgewenst: oude technische verbindingen die ooit rechten uit «AI-toegang» kopieerden terugzetten naar de technische standaard
  (het tabblad «Technisch» markeert ze; in bulk alleen met een apart script en met uw toestemming).

**Losse vragen over het zoeken (gevonden bij de controle, in deze taak niet gewijzigd)**
- De tak `mode==='accounts'` in `GoogleMailWorkspace` wordt nooit getoond, omdat de enige aanroep `mode` niet meegeeft.
- Diepe links: de zoeker voegt `bericht`/`item` toe, maar de pagina's lezen andere parameters (mail: `open_message_id`). Een resultaat
  opent daardoor het tabblad, maar niet het bericht, bestand of de notitie zelf.
- Elementen van de hub «AI-koppelingen» openen de hub zonder onderdeel (`#agent/<slug>`, `?consent=`).
- «Externe directory’s» op `admin/directories` vragen nog één klik op het subtabblad.
- `IdentiteitBeheerWeergave` is praktisch onbereikbaar: `VerenigdDienstApp` toont haar alleen als laatste terugval.
- In `AiVerbinden` en `TabExtensie` zijn delen alleen met een technisch profiel zichtbaar, terwijl de toegang in de catalogus per
  bestand geldt.
- Wederzijds recursieve componenten verliezen het tabblad van de pagina. Dat is een voorzichtige keuze: dan geldt de bestandsregel.
- Een tabblad dat aan een kindcomponent wordt doorgegeven via spread (`{...p}`), onder een andere naam (`tab={sect}`), met een
  terugvalwaarde (`tab={p.tab ?? 'overview'}`) of via een aanroep `Inner({tab})`, herkent de generator niet; dan geldt ook de
  bestandsregel.
- Een kop zonder paar `tr('…','…')` (bijvoorbeeld `<h3>CalDAV</h3>`) beëindigt de vorige sectie niet. Koppen met dynamische tekst
  komen in het zoeken als secties met de tekst van een badge («Нове», «онлайн», «Без теми»).
- Recente zoekopdrachten: elementen van het technische tabblad van de hub (RuimteScheiding, TechVerbindingen, SiteSchakelaars) en het
  indexvenster van het zoeken (`hub/zoek`) hebben dezelfde route als privé-elementen. In de privélijst kunnen ze alleen komen in een
  nieuw tabblad, zolang de eerste status van het technische profiel er nog niet is.
