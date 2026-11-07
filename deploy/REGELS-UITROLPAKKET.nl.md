> 🌐 **Taal / Мова:** [Українська](ПРАВИЛА-ПАКЕТА-РОЗГОРТАННЯ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Regels voor een uitrolpakket

Voor iedereen die een pakket voor Mijn Ruimte bouwt — mens of AI-agent (Claude, GPT, Cursor, …) — ook zonder voorkennis van het project.
De server controleert deze regels **drie keer**: in de browser (wizard «Нове оновлення» / Nieuwe update), op de site (voorcontrole) en in het root-script
(`deploy/uitrol/mijn-ruimte-uitrol.sh`). Een pakket dat een regel breekt, wordt **niet** geïnstalleerd; de gebruiker ziet een code met uitleg.

## 1. Verplichte bestanden

Alle bestanden staan in **één bovenmap** `mijn-ruimte-<VERSIE>/` van het archief `mijn-ruimte-<VERSIE>.tar.gz`.

| Bestand | Inhoud | Waarom | Zonder |
|---|---|---|---|
| `UITROL-VERSIE` | `JJJJMMDD-UUMMSS`, gelijk aan de versie in de bestandsnaam en **nieuwer** dan de geïnstalleerde | bescherming tegen terugrollen met een oud pakket | `GEEN_VERSIE`, `VERSIE_VERSCHILT`, `NIET_NIEUWER` |
| `AUTEUR` | wie de auteur is (≥ 3 tekens), bijv. `Eigenaar Test` | verantwoordelijkheid | `GEEN_AUTEUR`, `AUTEUR_ONGELDIG` |
| `AGENT` | via welke agent: `claude`, `cursor`, `gpt`… (kleine letters) | zichtbaar wie het pakket voorbereidde | `GEEN_AGENT`, `AGENT_ONGELDIG` |
| `SAMENVATTING` | wat er is gewijzigd en waarom, wat er was/bijkwam/verdween (≥ 20 tekens) | de eigenaar ziet wat hij goedkeurt | `GEEN_SAMENVATTING`, `SAMENVATTING_TE_KORT` |
| `BRON-COMMIT` | **volledige** git-commit (40 hex) **of** `zonder-git:<reden>` | zichtbaar welke code draait; build is reproduceerbaar | `GEEN_BRON_COMMIT` |
| `ONTWIKKELARCHIEF.json` | vanaf `20261103-211555`: SHA-256 van het geschiedenisdocument in de GitHub-commit + bijbehorende branch + link naar de GitHub Release met exacte `.tar.gz` | volledige, verifieerbare herkomst van wijzigingen | `GEEN_ONTWIKKELARCHIEF`, `ONTWIKKELARCHIEF_ONGELDIG`, `ONTWIKKELARCHIEF_ONBEREIKBAAR`, `ONTWIKKELARCHIEF_PAKKET_SHA_VERSCHILT` |
| `deploy/installeer-app.sh` | de installer uit dezelfde code | installatie | `GEEN_INSTALLER` |

Verboden in het archief: symbolische/harde koppelingen, apparaatbestanden, absolute paden, `..`, meer dan één bovenmap
(`INHOUD_ONVEILIG`); `node_modules`, `dist`, rapporten (omvang ≤ 300 MB, `TE_GROOT`).

### Regel 3: BRON-COMMIT (vanaf 18-10-2026)

- `unknown`, leeg of een korte hash (`abc1234`) → **geweigerd** met `GEEN_BRON_COMMIT`. Eerder toonde de live site «unknown» en kon niemand zeggen welke code er draaide.
- `zonder-git:<reden>` (reden ≥ 5 tekens) mag alleen **uitdrukkelijk** wanneer git echt niet beschikbaar is. Op de site verschijnt dit als waarschuwing «gebouwd buiten git: reden».

## 2. Hoe bouwen

```bash
# 1) vanuit git (aanbevolen): BRON-COMMIT = HEAD, alleen gecommitte code
AUTEUR="Eigenaar Test" AGENT=claude SAMENVATTING="Wat er is gewijzigd en waarom (minimaal 20 tekens)" \
  deploy/uitrol/maak-voorstelpakket.sh /tmp/uit            # niet-ondertekend pakket → site → passkey van eigenaar
AUTEUR=… AGENT=… SAMENVATTING=… deploy/uitrol/maak-uitrolpakket.sh ~/.ssh/uitrol-sleutel /tmp/uit   # ondertekend met sleutel

# 2) buiten git — alleen met een expliciete reden
AUTEUR=… AGENT=claude SAMENVATTING=… deploy/uitrol/maak-voorstelpakket.sh --zonder-git "build in agent-sandbox zonder git-geschiedenis" /tmp/uit
```

Windows: `powershell -File deploy\uitrol\maak-uitrolpakket.ps1 [-ZonderGit "reden"]`.

Bouwt u het pakket handmatig (zonder scripts)? Zet dan alle verplichte bestanden uit de tabel in de bovenmap en haal `BRON-COMMIT` uit `git rev-parse HEAD`
(niet `--short`). Controle vóór het uploaden: de wizard op de site toont direct wat er ontbreekt.

## 3. Wat de eigenaar ziet

- Weigering: status «Відхилено сервером · <codenaam>» (Geweigerd door server), de tekst van de reden en «Що робити» / Wat nu (`shared/uitrol-codes.ts` — vertaling van **elke** code; de test `uitrol-codes` controleert de scripts).
- Mislukte installatie: «Reden» — de **eerste** echte foutregel (bijv. `error TS6133 …`) plus enkele regels context; en de stap waarin het misging.
- Van buitenaf onderbroken (stoppen van de service, systemd-time-out van 45 min) → `ONDERBROKEN`; interne fout in het script → `AFGEBROKEN`. De status «wordt geïnstalleerd» blijft nooit meer «hangen».

## 4. Voor wie de scripts wijzigt

- Nieuwe weigering in het root-script? Gebruik `weiger NIEUWE_CODE "uk" "nl"` **én** voeg een item toe in `shared/uitrol-codes.ts` — anders faalt de test `uitrol-codes`.
- Nieuwe stap in de installer? Gebruik `voortgang <id> <pct> "tekst"` in `deploy/installeer-app.sh` + tekst in `installeer_stappen()` van het root-script + `subVanRegel` in `backend/uitrol-runs.ts`.
- Time-outs: `shared/uitrol-tijden.ts` (de test `uitrol-tijden` vergelijkt deze met `TimeoutStartSec` in de service-bestanden).

## 5. UITROL-MANIFEST.json en TESTRESULTATEN v2 (UI-010, vanaf 29-10-2026)

**Verplicht voor `UITROL-VERSIE` ≥ `20261101-000000`** (`shared/uitrol-manifest.ts`, `MANIFEST_VERPLICHT_VANAF`). Oudere pakketten zonder manifest
blijven installeerbaar, maar krijgen de waarschuwing «oud formaat». Dit wordt gecontroleerd door de browser (wizard) en de voorcontrole van de site, met dezelfde module.
Het root-script controleert het manifest (nog) niet; een SSH-installatie zonder voorcontrole slaat deze regel dus over (zie STATUS UI-010).

```json
{
  "schema": 1, "versie": "<UITROL-VERSIE>", "aangemaakt": "2026-11-07T11:45:00Z",
  "herkomst": "git: <branch>@<commit> (basis <versie>)", "auteur": "Тарасевич Павло (tarasevych.pavlo@gmail.com)", "zonderAi": false,
  "deelnemers": [
    { "soort": "mens", "naam": "Тарасевич Павло (tarasevych.pavlo@gmail.com)", "rollen": ["auteur"] },
    { "soort": "ai", "naam": "antigravity", "platform": "Google Antigravity", "tool": "Antigravity IDE", "model": { "id": "claude-opus-4-6", "versie": "20260205", "bron": "omgeving" }, "rollen": ["ontwikkeling", "controle", "testen", "verpakken"] }
  ],
  "beschrijving": {
    "uk": { "titel": "…", "samenvatting": "… (≥ 20, cyrillisch)", "wijzigingen": [], "fixes": [], "beperkingen": [], "instructies": "" },
    "nl": { "titel": "…", "samenvatting": "… (≥ 20)", "wijzigingen": [], "fixes": [], "beperkingen": [], "instructies": "" }
  }
}
```

- `auteur` en `deelnemers` (`soort: "mens"`): moet de werkelijke naam en het e-mailadres van het eigenaarsaccount vermelden van waaruit wordt uitgerold (automatisch opgehaald uit de account-/Git-configuratie); generieke bijnamen (`Власник`, `Eigenaar`, `Owner`, `Admin`) zijn verboden (`MANIFEST_STRIKT_VANAF = 20261106-000000`). De rol van de mens bij voorbereiding door een agent is `["auteur"]`.
- `deelnemers` (`soort: "ai"`): vermeld uitsluitend AI-agenten die objectief aan dit pakket hebben meegewerkt (geen niet-betrokken agenten automatisch toevoegen).
- `rollen`: `ontwikkeling`, `controle`, `testen`, `verpakken`, `auteur`.
- `model.bron`: `omgeving` (door de omgeving bevestigd) of `auteur` (door de auteur opgegeven) met een concrete `model.id` (bijv. `claude-opus-4-6`) en `model.versie`. De waarde `onbekend` («model onbekend»), een lege `model.id` of familienamen («Claude», «Grok», «GPT») zijn verboden en worden geweigerd.
- Zonder AI: `"zonderAi": true` + een mens met de rol `ontwikkeling`.
- De lijsten `wijzigingen/fixes/beperkingen` in `uk` en `nl` moeten evenveel punten bevatten.
- Fouten worden getoond met de exacte veldnaam (`beschrijving.uk.titel`, `deelnemers[1].model.id` …).
  Codes: `GEEN_MANIFEST`, `MANIFEST_ONGELDIG`.

**TESTRESULTATEN v2** (vrijwillig, maar aanbevolen):

```json
{ "geslaagd": 10103, "mislukt": 61,
  "basis": { "versie": "20261029-131639", "geslaagd": 9893, "mislukt": 62 },
  "falend": [ { "bestand": "tests/eenheid/agent-namens.test.ts", "aantal": 3, "ookOpBasis": true, "reden": "geen lokale instellingen" } ],
  "uitleg": { "uk": "Старі тести, що падали й до змін", "nl": "Oude tests die ook vóór de wijzigingen faalden" } }
```

De site toont welke bestanden precies faalden, en of ze ook al op de basisversie faalden («ook op basis») of nieuw zijn («NIEUW»). Zonder `falend` verschijnt «details niet beschikbaar in dit pakket».

Bouwen: `MANIFEST=pad/UITROL-MANIFEST.json TESTRESULTATEN_BESTAND=pad/testen.json AUTEUR=… AGENT=… SAMENVATTING=… deploy/uitrol/maak-voorstelpakket.sh /tmp/uit`

## 6. UITROL-BASIS en het overdrachtpakket (ORCH-001, vanaf 31-10-2026)

**`UITROL-BASIS`** geeft aan op welke GEÏNSTALLEERDE versie en commit het pakket is gebouwd (`key=value`, één per regel): `versie=JJJJMMDD-UUMMSS`, `commit=<40 hex>`,
en bij aanwezigheid van `orchestratie/regels.lock.json` ook `regelsVersie=` en `regelsHash=`. Dit wordt geschreven door `maak-voorstelpakket.sh` / `maak-uitrolpakket.sh`
vanuit `BASIS_VERSIE` + `BASIS_COMMIT` (samen en geldig, anders weigering); het eenvoudigst is `node scripts/orch.mjs pakket` (haalt de basis uit
`orchestratie/geinstalleerd.json`, anders uit `beleid.json → basis`). **Verplicht voor `UITROL-VERSIE` ≥ `20261201-000000`** (`GEEN_BASIS`);
oudere pakketten zonder dit bestand worden geïnstalleerd met de melding «oud formaat» in het logboek.

Het root-installatiescript (`deploy/uitrol/mijn-ruimte-uitrol.sh`) controleert na de handtekening en versie:

| Code | Wanneer |
|---|---|
| `BASIS_ONGELDIG` | `UITROL-BASIS` is aanwezig, maar mist een geldige `versie`/`commit` |
| `BASIS_VEROUDERD` | `versie` in `UITROL-BASIS` is ouder dan `$WERK_ROOT/laatste-versie` — iemand heeft tussen het bouwen en dit pakket een versie geïnstalleerd; voer een rebase uit en bouw opnieuw |
| `BASIS_COMMIT_VERSCHILT` | `commit` ≠ `$WERK_ROOT/laatste-commit` (root schrijft deze weg na elke geslaagde installatie met een 40-hex `BRON-COMMIT`) |
| `GEEN_BASIS` | versie ≥ `20261201-000000` zonder `UITROL-BASIS` |
| `REGELS_NIET_VERGRENDELD` | het pakket bevat `orchestratie/regels.lock.json`, maar de vingerafdruk van de regels (`AGENTS.md`, `beleid.json`, `BESLUITEN.md`; LF, zonder spaties aan het regeleinde) of `regelsVersie` komt niet overeen |
| `MODUS_NIET_TOEGESTAAN` | `beleid.json → kritiek.installatieModi.toegestaan` bevat niet de vereiste modus (`na_bevestiging` voor passkey/handtekening; `automatisch_beperkt` + ondertekende lock voor GitOps `gitops-ophalen.sh`) |

Vertalingen van de codes staan in `shared/uitrol-codes.ts` (de test `uitrol-codes` bewaakt dat elke `weiger CODE` een `uk`- en `nl`-tekst heeft).

**Het overdrachtpakket** `mijn-ruimte-<versie>-<agent>-overdracht.zip` (`node scripts/orch.mjs pakket --taak <ID> --auteur "…"`) bevat: `mijn-ruimte-<versie>.tar.gz`
(hetzelfde compatibele archief; ALLEEN dit archief wordt geïnstalleerd), `.tar.gz.sha256`, `.voorstel.json`, `ORCH-OVERDRACHT.json` (taakId, agent, `basisCommit` = basis
van de taakbranch, `installatie` = geïnstalleerde basis, commits, bestanden, tests, `pakket.sha256`/`bronCommit`/`modus`), `UITROL-MANIFEST.json`, `TESTRESULTATEN.json`,
`RAPPORT.md` (uk+nl), `COMMITS.txt` + `commits.bundle`, `AGENTEN.json`, `LEESMIJ.txt`, en `.tar.gz.sig` uitsluitend wanneer de eigenaar op zijn eigen pc heeft ondertekend
(privésleutels worden nooit aan agents doorgegeven). Controle zonder installatie: `node scripts/orch.mjs pakket-controleer --bron <zip>` (naam, integriteit,
`UITROL-VERSIE`/`BRON-COMMIT`/`AGENT`/`UITROL-BASIS` ↔ metadata, basis ↔ `geinstalleerd.json`, regels ↔ lock, `deploy/installeer-app.sh`,
geen `node_modules/dist/.git`). Importeren zonder git aan de andere kant: `node scripts/orch.mjs inleveren --bron <zip>` — eerst integriteitscontrole, daarna de inhoud van `tar.gz`
op een nieuwe branch vanaf `basisCommit`; de metadata-bestanden van het archief (`UITROL-*`, `AUTEUR`, `AGENT`, …) komen niet in de branch terecht.

## 7. TRACE-001 — verplicht procesarchief in GitHub (vanaf 20261103-211555)

**Elk nieuw pakket moet `ONTWIKKELARCHIEF.json` bevatten.** Dit bestand wordt aangemaakt door het standaardcommando `node scripts/orch.mjs pakket` vanuit het **reeds gecommitte** document `orchestratie/ontwikkelarchieven/<TASK-ID>.json`. Bouwen buiten Git is voor volgende versies verboden.

Het document op GitHub bewaart al het **beschikbare en veilige** bewijsmateriaal over de taak:

1. Het verzoek van de gebruiker en feitelijke verduidelijkingen — tekst/links, zonder persoonlijke geheimen;
2. Chronologie van stappen, tijdstippen, pogingen, fouten, geslaagde en mislukte resultaten;
3. Besluiten en een beknopte beschrijving van de redenen, alternatieven, afwegingen en verworpen opties;
4. Wijzigingen per bestand en commit-SHA, PR, links naar CI, controlesommen;
5. Tests: opdrachten, uitvoerresultaten, omgevingsbeperkingen, niet-uitgevoerde controles;
6. Bijlagen, concepten, tijdelijke bestanden — veilige links en hashes; als een bron tijdelijk niet beschikbaar is, wordt dit expliciet vermeld;
7. Privacysectie: gegevens die **bewust niet zijn gepubliceerd** en de reden daarvoor.

Het is niet toegestaan om het besloten interne denkproces van de AI, wachtwoorden, tokens, sleutels, de inhoud van e-mails of niet-geschoonde privébestanden op te vragen of op te slaan. In plaats daarvan worden besluiten, verifieerbare stappen, feitelijke resultaten en toelichtingen vastgelegd.

Formaat van de verwijzing in `ONTWIKKELARCHIEF.json`:

```json
{
  "schema": 1,
  "taakId": "TRACE-001",
  "repo": "Tarasevych/hub",
  "tak": "feature/trace-001-20261103-214810",
  "commit": "<40-hex git commit (identiek aan BRON-COMMIT)>",
  "pad": "orchestratie/ontwikkelarchieven/TRACE-001.json",
  "sha256": "<64-hex SHA-256 van het document>",
  "url": "https://github.com/Tarasevych/hub/blob/<commit>/orchestratie/ontwikkelarchieven/TRACE-001.json",
  "release": "https://github.com/Tarasevych/hub/releases/tag/<UITROL-VERSIE>",
  "pakket": "mijn-ruimte-<UITROL-VERSIE>.tar.gz"
}
```

De site en het root-installatiescript weigeren het pakket **zonder uitzondering** als:
- het document of de verwijzing ontbreekt, de JSON ongeldig is, of de SHA-256 van het document niet klopt;
- de commit niet overeenkomt met `BRON-COMMIT` of geen voorouder is van de opgegeven branch;
- de GitHub Release voor de versie ontbreekt of het bestand `pakket` niet bevat;
- `asset.digest` op GitHub niet gelijk is aan de SHA-256 van het **geüploade** `.tar.gz`-bestand;
- GitHub onbereikbaar is, de privérepository geen geconfigureerde toegang heeft, of er een autorisatiefout optreedt.

De GitHub-controle vindt **uitsluitend plaats via het vaste API-adres** `api.github.com/repos/Tarasevych/hub`, nooit via een willekeurig adres uit het pakket (bescherming tegen SSRF). Als de repository privé is, is op de site een token uit de eigen beveiligde GitHub-kluis vereist; bij het root-installatiescript een apart ingesteld root-only bestand `/etc/mijn-ruimte/github-token` (0600). Als toegang ontbreekt, volgt een weigering zonder omzeiling. De eigenaar bevestigt de installatie daarnaast afzonderlijk met een Passkey.

Het `.tar.gz`-archief zelf wordt gepubliceerd als GitHub Release-asset, terwijl de bronbestanden en het logboek als git-commit worden vastgelegd: zo wordt een circulaire verwijzing voorkomen waarbij het pakket zijn eigen SHA zou moeten bevatten.
