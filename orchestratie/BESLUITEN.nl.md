> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./BESLUITEN.uk.md) · **🇳🇱 Nederlands** ([🔒 canoniek `BESLUITEN.md`](./BESLUITEN.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Besluitenregister (`BESLUITEN.nl.md` · ORCH-001)

Alleen toevoegen (Append-only). Elke wijziging van de regels ([`AGENTS.md`](../AGENTS.md), [`orchestratie/beleid.json`](./beleid.json)) = een nieuw besluit in het canonieke [`orchestratie/BESLUITEN.md`](./BESLUITEN.md) + verhoging van `regelsVersie` + `node scripts/orch.mjs vergrendel`.

Vorm: `## B-NNN · JJJJ-MM-DD · regelsVersie · status` → Context / Besluit / Gevolgen / Wie.
Statussen: `voorstel` (voorgesteld door een agent), `bevestigd` (bevestigd door de eigenaar), `vervangen` (vervangen door B-…), `ingetrokken`.

---

## B-001 · 2026-10-31 · 1.0.0 · voorstel

**Context.** Aan Mijn Ruimte werken parallel Claude, Antigravity, ChatGPT, Codex, Grok, Copilot, Gemini en Cursor. De regels stonden verspreid over
`deploy/REGELS-UITROLPAKKET.md`, `RUNBOOK-*.md`, de gedeelde kennismap en chats; elke agent had een eigen beeld van de codebasis.

**Besluit.** De enige bron van regels is [`AGENTS.md`](../AGENTS.md) (voor mens en agent) + [`orchestratie/beleid.json`](./beleid.json) (voor de machine) + dit register. `CLAUDE.md`, `GEMINI.md` en andere omgevingsbestanden
zijn uitsluitend adapters van ≤ 25 regels met de markering `<!-- orch-adapter -->`. De vingerafdruk van de regels ligt vast in [`orchestratie/regels.lock.json`](./regels.lock.json);
`node scripts/orch.mjs controleer` faalt zodra de regels zijn gewijzigd zonder verhoging van het versienummer.

**Gevolgen.** Oude documenten blijven bewaard als naslagwerk (runbooks, `REGELS-UITROLPAKKET`); waar zij in tegenspraak zijn met `AGENTS.md`, geldt `AGENTS.md`.

**Wie.** Voorgesteld door agent `claude` (`ORCH-001`, tak `feature/orch-001-20261031-112355`). Vereist bevestiging door de eigenaar.

## B-002 · 2026-10-31 · 1.0.0 · voorstel

**Context.** De laatst opgegeven geïnstalleerde versie op dat moment was `20261031-093842`, `BRON-COMMIT` `b279ccabe31a27139b337822162653ccc13b6a5a`
(tak `release/sec-001-20261031-084138`, auteur van de commit Antigravity). De tak `voornaamst` (standaard) bevatte op dat moment alleen de README en was een voorouder van deze commit.

**Besluit.** De basis voor alle nieuwe taken is `b279ccab…`, totdat de eigenaar een andere bevestigt. De status van de basis is `opgave_eigenaar`
(opgegeven door de eigenaar): de agent had geen netwerktoegang tot `hub.tarasevych.com/api/version`, waardoor de controle tegen productie nog niet was uitgevoerd.
`voornaamst` gold ten tijde van B-002 niet als de actuele codebasis (later gesynchroniseerd in B-009).

**Gevolgen.** Na onafhankelijke verificatie (door de eigenaar of een agent met toegang tot de site/installer): `basis.verificatie = geverifieerd_productie`,
een nieuw besluit `B-00x` en verhoging van `regelsVersie` naar `1.0.1`.

**Wie.** Agent `claude`. Vereist bevestiging door de eigenaar.

## B-003 · 2026-10-31 · 1.0.0 · voorstel

**Context.** Kritiek beleid (installatiemodi, beschermde takken, het verbod op het delen van privésleutels) mag nooit afhangen van wat een agent heeft opgeschreven.

**Besluit.** De sectie `kritiek` in `beleid.json` heeft een afzonderlijke `kritiekHash`. De eigenaar ondertekent de tekenreeks `mijn-ruimte-regels\nregelsVersie=…\nkritiekHash=…`
met zijn eigen ed25519 SSH-sleutel (namespace `mijn-ruimte-regels`, **niet** `mijn-ruimte-uitrol`, zodat een release-handtekening nooit als regelhandtekening kan dienen):
`node scripts/orch.mjs onderteken-bericht > bericht.txt` → op de pc van de eigenaar `ssh-keygen -Y sign -f <sleutel> -n mijn-ruimte-regels bericht.txt` →
`node scripts/orch.mjs bevestig bericht.txt.sig`. De publieke sleutels staan in [`orchestratie/eigenaar-ondertekenaars`](./eigenaar-ondertekenaars). De privésleutel wordt nooit aan agenten gegeven.
Tot het moment van ondertekening heeft het kritieke beleid de status «voorstel»; de automatische installatiemodus is in die staat verboden.

**Wie.** Agent `claude`. Vereist bevestiging door de eigenaar (de handtekening zelf vormt de bevestiging).

## B-004 · 2026-10-31 · 1.1.0 · voorstel

**Context.** Fase 1 van `ORCH-001`: resultaten van agenten komen binnen via acht kanalen (GitHub PR/tak, MCP, HTTP API, lokale map, ZIP, TAR.GZ, git patch,
web-upload); voorheen had elk kanaal een eigen route en kon het stilzwijgend andermans werk overschrijven.

**Besluit.** Alle kanalen lopen via één pijplijn `node scripts/orch.mjs inleveren`: uitpakken → `ORCH-OVERDRACHT.json` → regels en basis controleren →
toepassen op een nieuwe tak vanaf de basiscommit in een tijdelijke worktree → wijzigingen vaststellen → `git merge-tree` tegen `integratie` → tests uit
`beleid.json → inlevering.standaardTests` → registratie in `orchestratie/inleveringen/<id>.json` → wachtrij. Een afgewezen inlevering laat geen tak achter en raakt
`integratie` niet aan. De wachtrij is sequentieel (`wachtrij volgende|klaar|terugtrekken`, één taak `bezig`). De status `installed` wordt uitsluitend afgeleid uit
`orchestratie/geinstalleerd.json` (geschreven door de installer/eigenaar), `integrated` uit het feit van samenvoeging, en `released` uit het bestaan van het pakket.

**Gevolgen.** `regelsVersie` `1.0.0` → `1.1.0` (toegevoegd: `inlevering.standaardTests`, `werkruimte`, `geinstalleerd`); taken met `regelsVersie 1.0.0` moeten
de regels herlezen (`versheid` → `REGELS_VEROUDERD`).

**Wie.** Agent `claude`. Vereist bevestiging door de eigenaar.

## B-005 · 2026-10-31 · 1.2.0 · voorstel

**Context.** Fase 2 van `ORCH-001`: er moest één gezamenlijke release zijn voor alle agenten, terwijl de installer voorheen alleen naar de versiedatum keek — een pakket dat op een verouderde basis
of met andere regels was gebouwd, werd toch geïnstalleerd zodra de versiedatum nieuwer was.

**Besluit.**
1. In het pakket `mijn-ruimte-<versie>.tar.gz` verschijnt `UITROL-BASIS` (geïnstalleerde versie + commit + vingerafdruk van de regels). De root-installer vergelijkt dit met
   `$WERK_ROOT/laatste-versie` en `laatste-commit` (`BASIS_VEROUDERD`, `BASIS_COMMIT_VERSCHILT`, `BASIS_ONGELDIG`), verplicht vanaf `20261201-000000`
   (`GEEN_BASIS`). Als het pakket `orchestratie/regels.lock.json` bevat, moeten de vingerafdruk van de regels en `regelsVersie` overeenkomen (`REGELS_NIET_VERGRENDELD`),
   en moet de installatiemodus toegestaan zijn in `kritiek.installatieModi` (`MODUS_NIET_TOEGESTAAN`). GitOps (`gitops-ophalen.sh`, automatisch) werkt uitsluitend
   bij `automatisch_beperkt` **én** een door de eigenaar ondertekend lock.
2. Het uniforme overdrachtspakket `mijn-ruimte-<versie>-<agent>-overdracht.zip` wordt gebouwd door `node scripts/orch.mjs pakket` (via `maak-voorstelpakket.sh`, zonder
   duplicatie): archief, SHA-256, `ORCH-OVERDRACHT.json`, `UITROL-MANIFEST.json`, tests, `RAPPORT.md`, commits (`COMMITS.txt` + `commits.bundle`),
   agenten (`AGENTEN.json`), en handtekening `.sig` alleen als de eigenaar zelf heeft ondertekend. Controle via `pakket-controleer`, import zonder git via dezelfde `inleveren`.
3. De twee basissen zijn bewust verschillend: `UITROL-BASIS`/`installatie` = de **geïnstalleerde** basis (voor de installer), `basisCommit` in `ORCH-OVERDRACHT.json` = de **basis van de taaktak**
   (waarvan `inleveren` de wijzigingen reconstrueert en de commits telt).
4. Het eigen `orchestratie/taken/<taakId>.json` is toegestaan in de inlevering (de agent registreert de taak in zijn eigen tak — een andere weg heeft hij niet); alle overige coördinatiestatus
   blijft beschermd. Bij het samenvoegen wint de versie van `integratie` (`.gitattributes` → `merge=orch-staat`, de merge-driver wordt ingesteld door `orch wachtrij volgende`).
5. De installatiemodi blijven ongewijzigd (`handmatig`, `na_bevestiging`; `automatisch_beperkt` alleen onder een apart ondertekend beleid); privésleutels
   van de eigenaar worden nooit aan agenten gegeven.

**Gevolgen.** `regelsVersie` `1.1.0` → `1.2.0` (`pakket`, `inlevering.eigenTaakBestandToegestaan`, status `ter_integratie` in het overzicht); taken met
`1.1.0` herlezen de regels. Nieuwe foutcodes in `shared/uitrol-codes.ts`.

**Wie.** Agent `claude`. Vereist bevestiging door de eigenaar (het kritieke beleid is ongewijzigd, de handtekening blijft «voorstel»).

## B-006 · 2026-10-31 · 1.3.0 · voorstel

**Context.** Fase 3 van `ORCH-001`: de coördinatie kon alleen vanaf de commandoregel (`scripts/orch.mjs`) worden bediend, en regels konden alleen via
git en een SSH-handtekening op de pc van de eigenaar worden gewijzigd. De eigenaar wil taken, de wachtrij en inleveringen op de site zien, pakketten van agenten zonder SSH aannemen en regels wijzigen met
dezelfde zekerheid als het goedkeuren van serverupdates (passkey, §13/§15 RUNBOOK).

**Besluit.**
1. De site (`mcp.tarasevych.com/agents` → «Координація»), HTTP (`/api/owner/orch/*`, alleen eigenaar) en MCP (`orch_overzicht`, `orch_context`,
   `orch_taak_start`, `orch_inleveren_begin|stuk|klaar`) **hebben geen eigen logica**: zij roepen exact dezelfde functies aan als de CLI — `inleveren`,
   `beoordeelVoorstel`, `vergrendel`, `compacteContext`. De werkkopie van de coördinatie op de server is `ORCH_WORTEL` (`/srv/mijn-ruimte/orch-repo`),
   uploads komen in `ORCH_INBOX` in stukken van 512 KiB met SHA-256-controle; de inleveringsregistraties en wachtrij gebruiken dezelfde bestanden `orchestratie/*`.
2. Regels wijzigen door de eigenaar: bewerken van `AGENTS.md` / `beleid.json` / `BESLUITEN.md` op de site → controle van het voorstel (`regelsVersie` hoger,
   item `## B-xxx · … · <versie> · …` in `BESLUITEN.md`, `beleid.json` geldig, geen andere regelbestanden gewijzigd) → passkey-besluit van de nieuwe soort
   **`orch-regels`** (hetzelfde kanaal als `terugdraaien`/`externe-hosts`; schakelaar `orch-regels-passkey` in `/etc/mijn-ruimte/mcp-rechten.json`,
   standaard open) → **root voert geen code uit**: hij schrijft de bevestiging (`regelsVersie`, `hash`, `kritiekHash`, `voorstel`, `passkey`,
   `besluit`) bij in zijn eigen journaal `/var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl` (`0600`) en herschrijft de leesbare kopie
   `/var/lib/mijn-ruimte-uitrol-status/orch-regels-bevestigd.json` (`0640`, laatste 50) → de applicatie ziet de bevestiging, maakt een tak
   `regels/<versie>-<tijd>` met een nieuw `regels.lock.json` (`eigenaar.soort = "passkey"`, `besluit`, `passkey`) en `CONTEXT-COMPACT.md`, draait
   `controleer` (bij een fout wordt alles teruggedraaid) en pusht de tak naar `origin`. Samenvoegen in `integratie` blijft aan de eigenaar.
3. Een lock met `eigenaar.soort = "passkey"` is gelijkwaardig aan een SSH-handtekening voor `eigenaarStatus`/`controleer`. GitOps (`gitops-ophalen.sh`, root) vertrouwt
   zo'n lock **uitsluitend** als exact dezelfde registratie (`besluit`, `regelsVersie`, `hash`, `kritiekHash`, `voorstel`) in het root-journaal staat — de app kan
   regels dus nooit zelf «bevestigen». De SSH-handtekening blijft een volwaardig alternatief (`orch onderteken-bericht` / `bevestig`).
4. De installer maakt `orch-inbox` aan en meldt of de werkkopie van de coördinatie aanwezig is; het klonen zelf (`git clone` met deploy-key) doet de eigenaar
   (RUNBOOK §18). Zonder werkkopie toont de site eerlijk `ORCH_GEEN_REPO`, zonder iets te simuleren.

**Gevolgen.** `regelsVersie` `1.2.0` → `1.3.0` (sectie `site`; `kritiek.toelichting` noemt passkey als tweede bevestigingspad — daardoor
wijzigde `kritiekHash`, het kritieke beleid zelf bleef ongewijzigd); taken met `1.2.0` herlezen de regels. Nieuwe gebeurteniscode `BESLUIT_ORCH_REGELS_OK`,
codes `ORCH_CODES` in `shared/orch-model.ts`, hulpteksten `orch.inlevering` / `orch.regels`.

**Wie.** Agent `claude`. Vereist bevestiging door de eigenaar — dit kan voortaan met een passkey op de site of met een SSH-handtekening.

## B-007 · 2026-11-03 · 1.4.0 · voorstel

**Context.** De eigenaar eist voor elke volgende release een permanent, reproduceerbaar verwerkingsdossier van het verzoek én een verificatie dat de volledige broncode en het exacte installatiearchief daadwerkelijk op GitHub zijn gepubliceerd. Eerdere releases bevatten een commit, maar bewezen niet dat er een onveranderlijk beslissingsdocument en exact die `.tar.gz` in een GitHub Release stonden.

**Besluit.** Vanaf `20261103-211555` bevat elk pakket `ONTWIKKELARCHIEF.json` met `taakId`, `repo`, `tak`, de 40-teken `commit` (= `BRON-COMMIT`), `pad` naar het gecommitte dossier `orchestratie/ontwikkelarchieven/<TASK-ID>.json`, de SHA-256 daarvan, de canonieke URL naar de GitHub-blob, de URL van de GitHub Release op basis van `UITROL-VERSIE` en de naam van het `.tar.gz`-bestand. Het verplichte dossier bevat de vraag, de chronologische volgorde, beslissingen en afwegingen, wijzigingen, tests, links naar bronnen/bijlagen, bekende problemen, redenen en uitsluitingen. De standaardopdracht `orch pakket` controleert dat het dossier al in `HEAD` zit en lokaal niet is aangepast, en schrijft de verwijzing in de tar. De `voorcontrole` op de site en de root-installer bevragen onafhankelijk van elkaar uitsluitend de vaste GitHub API (`Tarasevych/hub`), controleren de inhoud en hash van het document, of de commit bij de tak hoort, de aanwezigheid van de GitHub Release en of de `asset.digest` SHA-256 exact overeenkomt met de geüploade `.tar.gz`. Elke afwijking, ontbrekend onderdeel of netwerkfout faalt gesloten (fail-closed). Zonder voltooide GitHub-publicatie kan een pakket niet worden geïnstalleerd.

**Gegevensbescherming.** Zet nooit geheimen, privébestanden, e-mailinhoud, onbegrensde logs, ruwe inloggegevens of verborgen chain-of-thought van AI in het dossier. Leg beschikbare stappen en **beknopte, verifieerbare onderbouwingen** van beslissingen vast, samen met links/hashes van artefacten en expliciete hiaten. Wanneer de interne geschiedenis van een model niet automatisch kan worden gereconstrueerd, moet dat eerlijk worden gemarkeerd en nooit verzonnen. De binaire tar wordt bewaard als GitHub Release-asset, de volledige code in de git-commit; vanwege de cyclische aard van hashes wordt de tar zelf niet toegevoegd aan zijn eigen broncommit.

**Gevolgen.** `regelsVersie` `1.3.0` → `1.4.0`, nieuwe weigeringscodes `ONTWIKKELARCHIEF_*`, uitgebreide regels voor `pakket`, `AGENTS.md` en het runbook. Root en site moeten als onderdeel van deze release worden geïnstalleerd en het beleid doorloopt `vergrendel`; tot onafhankelijke Passkey/SSH-goedkeuring is de status «voorstel». Geen enkele eerdere installatie wordt gewijzigd; de eigenaar bevestigt de regel en de installatie afzonderlijk.

**Wie.** Eis van de Eigenaar op 03.11.2026, geïmplementeerd door agent ChatGPT/Codex in taak `TRACE-001`. Wacht op passkey/SSH-bevestiging van de eigenaar voor de rechtsgeldigheid van de kritieke regels.

## B-008 · 2026-11-03 · 1.4.1 · technische correctie op B-007

**Context.** De eerste CI-run van `TRACE-001` genereerde een `CONTEXT-COMPACT.md` van 13.834 bytes terwijl maximaal 12.000 bytes is toegestaan (`CONTEXT_TE_GROOT`). Het eenvoudigweg inkorten van `AGENTS.md` bij het bestaande lock `1.4.0` werd terecht geweigerd met `VERSIE_NIET_VERHOOGD`.

**Besluit.** De gedetailleerde releasenormen en `TRACE-001` verplaatsen buiten de `compact`-markeringen in **hetzelfde canonieke `AGENTS.md`**, waarbij in het compacte blok een korte, eenduidige en verplichte regel met verwijzingen achterblijft. Geen enkele eis is verwijderd of afgezwakt; de installatiecontroles blijven ongewijzigd. Volgens de procedure voor regelwijzigingen wordt `regelsVersie` verhoogd van `1.4.0` naar **`1.4.1`**, gevolgd door de standaard `orch vergrendel`, `orch context`, `orch taak-herlees`, tests en overdracht. De registratie van B-007 blijft ongewijzigd.

**Wie.** Agent ChatGPT/Codex. Technische correctie voor een reproduceerbare compacte context; de formele bevestiging van de regelwijziging blijft aan de eigenaar.

## B-009 · 2026-11-04 · 1.4.2 · voorstel

**Context.**
1. Op 01.11.2026 zijn server `<VM-IP>` en de hulpmiddelen op de werk-pc van de eigenaar bijgewerkt naar de nieuwste hoofdseries (`Ubuntu 26.04.1 LTS`, `PostgreSQL 18.6`, `Node.js 26.13.0 LTS`, `Caddy 2.11.7`, `OPA 1.22.0`, `age 1.3.2`).
2. Na de overstap op `Ubuntu 26.04.1 LTS` (`systemd 259.9`, `glibc 2.43`, `GNU tar 1.35`) begon de voorcontrole van pakketten (`voorcontrole`) op de site geldige `.tar.gz`-archieven te weigeren bij de stap `tar --extract` (`VOORCONTROLE_MISLUKT`). Met tracing (`strace` binnen `mijn-ruimte.service`) is de exacte oorzaak vastgesteld: `GNU tar 1.35` gebruikt de syscall `openat2(..., RESOLVE_BENEATH)`, die door het seccomp-filter `RestrictSUIDSGID=yes` in `systemd 259` wordt geblokkeerd met `-ENOSYS` (`Function not implemented`).
3. Een cloud-agent (ChatGPT) zonder toegang tot de server zag alleen de afgekapte regel `Command failed: /usr/bin/tar --extract ...`, nam ten onrechte aan dat de eigenaar een `.zip` in plaats van een `.tar.gz` had geüpload en vroeg de eigenaar vervolgens om handmatig `df -h` uit te voeren en logs in de terminal te zoeken. Daarnaast bleek dat de tak `voornaamst` op GitHub achterliep op `integratie`, en dat `/srv/mijn-ruimte/orch-repo` op de server nog niet gesynchroniseerd was met de nieuwste regels.

**Besluit.**
1. **De bijgewerkte stack van productie-VM `<VM-IP>` vastleggen in de regels (`AGENTS.md` §1, §5):**
   - Besturingssysteem: `Ubuntu 26.04.1 LTS (Resolute)`, kernel `7.0.0-42-generic`, `glibc 2.43`, `systemd 259.9`, LUKS + `clevis-tpm2`.
   - Runtime en diensten: `Node.js v26.13.0 LTS` (`npm 11.20.0`), `PostgreSQL 18.6` (`/srv/data/postgresql/18/main` met `--data-checksums`), `Caddy v2.11.7` (socket `admin unix//run/caddy/admin.sock|0660` voor groep `caddy`/`mr-apps`), `OPA v1.22.0`, `age v1.3.2`, `cloudflared 2026.10.7`, `Docker 29.9.2` (`containerd 2.4.2`).
   - Hulpmiddelen op de pc van de eigenaar (`T:\mijn-ruimte\hulpmiddelen\`): `Node.js v26.13.0 LTS`, `PostgreSQL 18.6-5`, `rclone v1.75.2`.
2. **De blokkade van `openat2` in `systemd 259` opheffen (`RestrictSUIDSGID=no`):**
   - Op server `<VM-IP>` zijn permanente drop-in-bestanden `/etc/systemd/system/<unit>.d/ubuntu2604-openat2.conf` met `RestrictSUIDSGID=no` uitgerold voor alle 9 `mijn-ruimte*`-units en `cloudflared.service`.
   - In alle unit-bestanden `deploy/*.service` in de repository is `RestrictSUIDSGID=yes/true` gewijzigd in `RestrictSUIDSGID=no` (met behoud van `NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes`).
3. **Verplichte regels voor diagnostiek en resultaatoverdracht invoeren voor alle agenten (`AGENTS.md` §3, §4):**
   - Geen enkele agent vraagt de eigenaar om handmatig opdrachten in de serverterminal uit te voeren (`df -h`, `journalctl`, enz.) of handmatig pakketten te bouwen. Als een agent in een cloudcontainer geen directe toegang heeft tot `<VM-IP>` (via MCP of SSH), formuleert hij een korte technische conclusie (1–2 zinnen) voor overdracht aan de infrastructuuragent op de pc van de eigenaar (Antigravity/Claude).
   - Het is verboden om blind te gissen bij `voorcontrole`-fouten (in het bijzonder het aannemen dat een `.zip` i.p.v. een `.tar.gz` is geüpload wanneer de stap `structuur` al geslaagd is).
   - Bij het aanleveren van een release voor installatie via `Admin → Оновлення` staat op de allereerste regel altijd de directe link naar `mijn-ruimte-<versie>.tar.gz` (los van `-overdracht.zip`).
4. **Alle regelkanalen synchroniseren:** `origin/integratie`, `origin/voornaamst` en `/srv/mijn-ruimte/orch-repo` op `<VM-IP>` bijwerken naar `regelsVersie 1.4.2` (de geïnstalleerde productierelease op het moment van synchronisatie is `20261104-075953` @ `e97a58ceaf70f6a4a8d63608541d47e455ddb66a`).

**Gevolgen.** `regelsVersie` `1.4.1` → `1.4.2`; bijgewerkt zijn `AGENTS.md`, `orchestratie/beleid.json`, `orchestratie/BESLUITEN.md`, `orchestratie/regels.lock.json`, `orchestratie/CONTEXT-COMPACT.md` en `deploy/*.service`. Alle agenten (via GitHub `integratie`/`voornaamst`, MCP `orch_context`/`orch_overzicht` of `CONTEXT-COMPACT.md`) ontvangen de actuele regels `1.4.2`.

**Wie.** Eis van de Eigenaar op 04.11.2026, geïmplementeerd door agent `antigravity`. Wacht op passkey/SSH-bevestiging van de eigenaar.

## B-010 · 2026-11-04 · 1.4.5 · verwijdering van persoonsgegevens en herschrijven van Git-geschiedenis

**Context.** In de repository en de commitgeschiedenis stonden nog de voor- en achternaam van de eigenaar en een woonadres in testfixtures. De eigenaar gaf toestemming om de werkboom en de volledige Git-geschiedenis op te schonen met een lokale back-up buiten de repository.

**Besluit.** (1) In de code zijn configureerbare omgevingsvariabelen `MR_EIGENAAR_NAAM`, `MR_CONTACT_EMAIL` en `MR_BEHEERSUBNET` ingevoerd; testfixtures gebruiken fictieve gegevens. (2) De geschiedenis van alle takken en tags is herschreven met `git filter-repo`. (3) De basis in `beleid.json` is bijgewerkt naar de herschreven SHA; `regelsVersie` verhoogd naar `1.4.5`.

**Wie.** Verzoek en toestemming van de eigenaar; uitvoering door agent `claude` (`PRIVACY-001`).

## B-011 · 2026-11-05 · 1.4.6 · tweede opschoning van de geschiedenis (IP-adressen, restanten PG) en pakketfixes

**Context.** De eigenaar stemde in met een tweede herschrijving van de geschiedenis om interne IP-adressen en overgebleven persoonsgegevens uit oude commits te verwijderen, en om `git -c core.autocrlf=false archive` in `maak-voorstelpakket.sh` en `.gitattributes` (`*.sh text eol=lf`) vast te leggen.

**Besluit.** (1) `maak-voorstelpakket.sh` gebruikt `git -c core.autocrlf=false archive`. (2) De AWS-voorbeeldsleutel in de SigV4-test staat niet meer als één literal. (3) `regelsVersie` verhoogd van `1.4.5` naar `1.4.6`.

**Wie.** Verzoek van de eigenaar; uitvoering door agent `claude`.

## B-012 · 2026-11-05 · 1.4.7 · basisversie na samenvoeging van identity-documentatie

**Context.** De herschreven commit `50e63737…` (overeenkomend met `b0d41b77…`, tag `20261104-164906`) voegt de ontwerpdocumentatie en het dossier `IDENTITY-001` toe.

**Besluit.** `50e63737…` is samengevoegd in de releasetak van `PRIVACY-001`, de basis in `beleid.json` is bijgewerkt en `regelsVersie` is verhoogd naar `1.4.7`.

**Wie.** Besluit van de eigenaar; uitvoering door agent `claude`.

## B-013 · 2026-11-05 · 1.4.8 · Consolidatie van audit 2026-11-05, tweetalige documentatie en parallelle takken (`PRIVACY-001`, `MAILFIT-002`, `IDENTITY-002`, `DESIGN-001`)

**Context.** Na de tweede geschiedenisherschrijving (`B-011`) en het toevoegen van tweetalige navigatiekoppen (`uk`/`nl`) op tak `voornaamst` (`f3f3fabb2f3b`) ontstond een splitsing tussen vier parallelle agenttakken (`PRIVACY-001` @ `d4fb253`, `MAILFIT-002` @ `98beb2a`, `IDENTITY-002` @ `a318ba0`, `DESIGN-001` @ `052fae3`) en een fout op het regelsslot (`REGELS_NIET_VERGRENDELD` in `node scripts/orch.mjs controleer`). Onafhankelijke controle van het live productie-eindpunt `https://hub.tarasevych.com/api/version` bevestigde de actieve versie `20261104-204906` (in de pre-rewrite geschiedenis commit `6e815a00307dd9c00a0b2907838be099be8c5610`).

**Besluit.** (1) Binnen taak `AUDIT-001` op de canonieke post-rewrite geschiedenis (`voornaamst` @ `f3f3fabb2f3b5209b1ee8eba3078e403de831844`) alle vier actieve stromen zonder conflict en zonder pre-rewrite voorouder `e547381` samenvoegen: `PRIVACY-001`, `MAILFIX-001`/`MAILFIT-001`/`MAILFIT-002`, `IDENTITY-001/002` (inclusief auditfixes `cbeb3d0` en `a318ba0`) en `DESIGN-001`. (2) In `orchestratie/beleid.json → basis` versie `20261104-204906` vastleggen (`verificatie: "geverifieerd_productie"`, basiscommit `f3f3fabb2f3b5209b1ee8eba3078e403de831844`), `regelsVersie` verhogen naar `1.4.8` en `orchestratie/regels.lock.json` en `orchestratie/CONTEXT-COMPACT.md` opnieuw opbouwen. (3) De Oekraïense (`.uk.md`) en Nederlandse (`.nl.md`) documentatie synchroniseren en de takken `integratie` en `voornaamst` samen met de GitHub Release bijwerken.

**Gevolgen.** `regelsVersie` `1.4.7` → `1.4.8`; `node scripts/orch.mjs controleer` slaagt zonder fouten; de takken `integratie` en `voornaamst` bevatten alle fixes uit de audit van 2026-11-05.

**Wie.** Opdracht van de eigenaar op 05-11-2026 (`AUDIT-001`); uitvoering door agent `antigravity`.

## B-014 · 2026-11-05 · 1.4.9 · Rebase van release `AUDIT-001` op geïnstalleerde serverversie `20261105-061659` (`a318ba0b1c73`)

**Context.** Bij het installeren van pakket `20261105-080000` stond op de server inmiddels versie `20261105-061659` (`BRON-COMMIT: a318ba0b1c731390217458dabadcf0e086d13635`), waardoor `UITROL-BASIS` het pakket op de oudere basis `20261104-204906` afwees met `BASIS_VEROUDERD`. Alle codewijzigingen uit `20261105-061659` zijn al volledig opgenomen in `AUDIT-001`.

**Besluit.** De basis in `orchestratie/beleid.json` en `AGENTS.md` bijwerken naar `20261105-061659`, `regelsVersie` verhogen naar `1.4.9`, `regels.lock.json` opnieuw vergrendelen en het bijgewerkte pakket `20261105-093500` bouwen met `UITROL-BASIS: versie=20261105-061659, commit=a318ba0b1c731390217458dabadcf0e086d13635`.

**Gevolgen.** `regelsVersie` `1.4.8` → `1.4.9`; het nieuwe pakket `20261105-093500` sluit direct aan op de geïnstalleerde serverversie `20261105-061659`.

**Wie.** Opdracht van de eigenaar op 05-11-2026 (`AUDIT-001`); uitvoering door agent `antigravity`.

## B-015 · 2026-11-06 · 1.4.10 · Volledige taalopschoning van broncode, zoekcatalogi en tweetalige documentatie (uk + nl)

**Context.** Bij controle van PR #30 en alle actieve takken zijn overblijfselen van Russische en Engelse zoektermen aangetroffen in `backend/zoek/catalogus-ui.ts`, `shared/zoek-synoniemen.ts`, `shared/zoek-normalisatie.ts`, evenals Surzjyk-vormen in componenten onder `src/`, `backend/`, `shared/`, `deploy/` en in de tests.

**Besluit.** Alle Russische letters, Russische woorden, Surzjyk en Engelse zoekintenties verwijderen uit alle broncode-, test- en documentatiebestanden in alle actieve takken; `shared/zoek-ui-knoppen.generated.ts` opnieuw opbouwen, `regelsVersie` verhogen naar `1.4.10`, en `orchestratie/regels.lock.json` en `orchestratie/CONTEXT-COMPACT.md` bijwerken.

**Gevolgen.** `regelsVersie` 1.4.9 → 1.4.10; 0 Russische tekens of Surzjyk-treffers in de gehele repository.

**Wie.** Verzoek van de eigenaar op 06-11-2026 (`AUDIT-001`); uitvoering door agent `antigravity`.

## B-016 · 2026-11-06 · 1.4.11 · Volledige zuivering van alle gepubliceerde artikelen en documentatie van Russismen, leenvertalingen en tech-slang

**Context.** In de documentatieartikelen stonden nog diepere morfologische leenvertalingen en tech-slang die door eenvoudige ASCII-woordgrenzen `\b` in JS werden gemist.

**Besluit.** Alle Russische leenvertalingen, Surzjyk-wendingen en slang-termen in alle gepubliceerde artikelen (`*.md`, `*.uk.md`, `*.txt`) vervangen door authentiek Oekraïens; `regelsVersie` verhogen naar `1.4.11` en `orchestratie/regels.lock.json` en `orchestratie/CONTEXT-COMPACT.md` opnieuw opbouwen.

**Gevolgen.** `regelsVersie` 1.4.10 → 1.4.11; 0 treffers van Russismen, leenvertalingen of slang in alle documentatieartikelen.

**Wie.** Verzoek van de eigenaar op 06-11-2026 (`AUDIT-001`); uitvoering door agent `antigravity`.
