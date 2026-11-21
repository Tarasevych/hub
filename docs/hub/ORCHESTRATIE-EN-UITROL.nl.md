> 🌐 **Taal / Мова:** [Українська](КООРДИНАЦІЯ-ТА-РОЗГОРТАННЯ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)
> 🧭 **Hub-secties (`docs/hub/`):** [Hoofdmanifest «Klimop»](./ARCHITECTUURMANIFEST-KLIMOP.nl.md) · [1. Architectuur](./ARCHITECTUUR.nl.md) · [2. Geschiedenis](./GESCHIEDENIS.nl.md) · [3. Takken, samenvoegverzoeken & uitgaven](./TAKKEN-EN-SAMENVOEGVERZOEKEN.nl.md) · [4. Mapstructuur](./MAP-STRUCTUUR.nl.md) · [5. Omgevingsvariabelen](./OMGEVINGSVARIABELEN.nl.md) · **6. Coördinatie & Uitrol**

# Coördinatie van 14 AI-Agenten (`ORCH-001` / `BIJDRAGE-001`), Traceerbaarheid (`TRACE-001`), Architectuur «Klimop» (`KLIMOP-001`) en Atomaire Uitrol

Dit document beschrijft de volledige levenscyclus van ontwikkeling, architectuurcontrole, auteurschapsregistratie, coördinatie van **alle 14 AI-agentintegraties** en veilige uitrol van bijwerkingen op de productie-VM van het platform «Mijn Ruimte / Мій простір».

---

## 1. Multi-Agent Coördinatie `ORCH-001`, Auteurschap `BIJDRAGE-001` en Architectuurcontrole `KLIMOP-001` (`B-001`–`B-025`)

Aan de opslagplaats `Tarasevych/hub` werken **14 AI-agentintegraties** parallel samen: **Claude**, **Google Antigravity**, **AutoClaw (GLM)**, **ChatGPT**, **OpenAI Codex**, **Grok**, **GitHub Copilot**, **Microsoft Copilot Studio**, **Google Gemini**, **Cursor**, **Windsurf**, **Cline**, **Devin** en **OpenCode**. Om het overschrijven van andermans werk, het verliezen van auteurschap of afwijkende instructies uit te sluiten, geldt het uniforme kader **`ORCH-001` + `BIJDRAGE-001` + `VERWIJZING-001` + `KLIMOP-001`**:

### 1.1. Enige Bron van Regels, Gedeelde Vaardigheden en Cryptografisch Slot
1. **Canonieke regelbestanden (versie `1.6.0`):**
   - [`AGENTS.md`](../../AGENTS.md) ([🇺🇦 UK](../../ПРАВИЛА-АГЕНТІВ.uk.md) ↔ [🇳🇱 NL](../../AGENTENREGELS.nl.md)) — mensleesbare regels voor alle 14 agenten en ontwikkelaars (inclusief de verplichte architectuurcontrole van 15 vragen in §3b en §10).
   - [`orchestratie/beleid.json`](../../orchestratie/beleid.json) — machineleesbaar beleid (alle 14 agenten, 14 adapters, overdrachtskanalen, auteurschap, driefactorvertrouwen en `architectuurRichting`).
   - [`orchestratie/BESLUITEN.md`](../../orchestratie/BESLUITEN.md) ([🇺🇦 UK](../../orchestratie/РІШЕННЯ.uk.md) ↔ [🇳🇱 NL](../../orchestratie/BESLUITEN.nl.md)) — alleen-aanvullen register van architecturale en organisatorische besluiten (`B-001`..`B-025`).
   - Catalogus van **13 gedeelde vaardigheden** [`.agents/skills/`](../../.agents/skills/) ([`scripts/vaardigheden/catalogus.json`](../../scripts/vaardigheden/catalogus.json)), waaronder [`klimop-architectuur`](../../.agents/skills/klimop-architectuur/VAARDIGHEID.nl.md) en [`movnyi-zakon`](../../.agents/skills/movnyi-zakon/VAARDIGHEID.nl.md).
2. **Dunne adapters voor alle 14 agenten (≤ 25 niet-lege regels):** de bestanden `CLAUDE.md`, `ANTIGRAVITY.md`, `AUTOCLAW.md`, `CHATGPT.md`, `CODEX.md`, `GROK.md`, `.github/copilot-instructions.md`, `MSCOPILOT.md`, `GEMINI.md`, `.cursorrules` (`CURSOR.md`), `WINDSURF.md` (`.windsurfrules`), `CLINE.md` (`.clinerules`), `DEVIN.md`, `OPENCODE.md` (en hun Nederlandstalige tegenhangers `*.nl.md`) bevatten de markering `<!-- orch-adapter -->` en verwijzen uitsluitend naar `AGENTS.md`.
3. **Cryptografische vingerafdruk [`orchestratie/regels.lock.json`](../../orchestratie/regels.lock.json):** legt de SHA-256 van alle drie de canonieke regelbestanden vast en wordt bevestigd door de eigenaar (`SSH ed25519` of WebAuthn-toegangssleutel).

### 1.2. Taakisolatie en 8 Inleverkanalen
- Elke taak krijgt een unieke identificatie (`ABC-001`), een eigen tak `feature|fix|audit|release/<onderwerp>-YYYYMMDD-HHMMSS` en een declaratiebestand `orchestratie/taken/<TASK-ID>.json`.
- Agenten schrijven nooit rechtstreeks naar `voornaamst`, `integratie`, `release/*` of de takken van andere agenten.
- Er worden **8 inleverkanalen** ondersteund die allemaal samenkomen in één commando `node scripts/orch.mjs inleveren`:
  1. `git-pr` (tak of Pull Verzoek op GitHub)
  2. `tar.gz` (installatiepakket `mijn-ruimte-<versie>.tar.gz`)
  3. `overdracht-zip` (universeel archief `mijn-ruimte-<versie>-<agent>-overdracht.zip` met patch, bundle en rapport)
  4. `git-bundle` (`.bundle`)
  5. `git-patch` (`git format-patch` / `.patch`)
  6. `werkmap` (lokale werkmap op de server of VM)
  7. `http-upload` (uploaden via de webinterface `Admin → AI-agenten → Coördinatie`)
  8. `mcp` (aanroep van MCP-tools `orch_*` via connector `/claude`, `/gpt`, enz.)

---

## 2. Herkomsttraceerbaarheid van Releases `TRACE-001` (`B-007` / `B-008`)

Volgens de standaard **TRACE-001** (regels `1.4.1`) kan geen enkel pakket op de server worden geïnstalleerd zonder volledige koppeling aan GitHub en een onveranderlijk ontwikkelarchief:

1. **Gecommit ontwikkelarchief:** in elke taaktak wordt het bestand `orchestratie/ontwikkelarchieven/<TASK-ID>.json` bijgehouden, en in het `.tar.gz`-archief wordt `ONTWIKKELARCHIEF.json` opgenomen (tijdlijn van stappen, gewijzigde bestanden, uitgevoerde controles, beveiligingsbesluiten en het `privacy`-blok).
2. **Verplichte publicatie op GitHub Releases:** elk release-archief `mijn-ruimte-<versie>.tar.gz` en bijbehorende `.sha256` worden gepubliceerd in GitHub Releases van de repository `Tarasevych/hub`.
3. **Dubbele SHA-256-verificatie via de GitHub API:**
   - Tijdens de **voorcontrole** op de website (`backend/uitrol-github.ts`) controleert de server het bestaan van de commit in `Tarasevych/hub`, de aanwezigheid op een toegestane tak en de exacte SHA-256-overeenkomst van de lokale `.tar.gz` met de asset in GitHub Release.
   - Tijdens de **root-installatie (`deploy/installeer-app.sh`)** controleert de installer opnieuw `ONTWIKKELARCHIEF.json` en vergelijkt de SHA-256 rechtstreeks met de GitHub API vóór het uitpakken.

---

## 3. Infrastructuur en Serverstack (`B-009` van 04-11-2026)

### 3.1. Huidige Stack van de Productie-VM

| Component | Versie en Configuratie |
|---|---|
| **Besturingssysteem** | `Ubuntu 26.04.1 LTS (Resolute)` · kernel `Linux 7.0.0-42-generic` · `glibc 2.43` · `systemd 259.9` · schijfversleuteling LUKS + `clevis-tpm2` (vTPM) |
| **Runtime-omgeving** | `Node.js v26.13.0 LTS` (`npm 11.20.0`) |
| **Database** | `PostgreSQL 18.6` (`/srv/data/postgresql/18/main` met ingeschakelde `--data-checksums`) |
| **Netwerk en Gateways** | `Cloudflare Tunnel (cloudflared 2026.10.7)` · `Caddy v2.11.7` (`admin unix//run/caddy/admin.sock\|0660`) · `OPA v1.22.0` (`127.0.0.1:8181`) |
| **Containers en Cryptografie** | `Docker 29.9.2` (`containerd 2.4.2`) · `age v1.3.2` (asymmetrische versleuteling van back-ups) |
| **Compatibiliteit `systemd 259` + `GNU tar 1.35`** | In `Ubuntu 26.04.1 LTS` roept `tar --extract` de syscall `openat2(..., RESOLVE_BENEATH)` aan. Om te voorkomen dat het seccomp-filter van `systemd 259` dit blokkeert met `-ENOSYS`, is in alle `deploy/*.service` en server drop-ins `RestrictSUIDSGID=no` ingesteld (met behoud van `NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes`). |

### 3.2. Achtergrondtaken (`cron.json` en systemd-timers)

Alle periodieke taken worden uitgevoerd door geïsoleerde `Type=oneshot` units `mijn-ruimte-cron@<naam>.service` onder bescherming van `pg_advisory_lock`:

| Taak (`cron.json` / timer) | Schema | Functie |
|---|---|---|
| `mail-provider-maintenance` | `*/5 * * * *` (elke 5 min) | Synchronisatie en onderhoud van mailboxen (`mailMaintenanceCron`, `batchLimit: 3`). |
| `google-suite-bplus-sync` | `*/5 * * * *` (elke 5 min) | Achtergrondsynchronisatie van Google Suite — e-mail, agenda, drive (`googleSuiteSyncCron`, `accountLimit: 10`). |
| `zoek-index` | `*/5 * * * *` (elke 5 min) | Indexering van nieuwe en gewijzigde objecten in globaal zoeken `/zoek` (`zoekIndexCron`, `limiet: 60`). |
| `mail-queue-send` | `* * * * *` (elke minuut) | Verzenden van e-mails uit de uitgaande wachtrij (`mailQueueCron`). |
| `diagnostiek-server` | `*/15 * * * *` (elke 15 min) | Verzamelen van servergezondheidsmetrieken en beveiligingscontroles (`diagnostiekServerCron`). |
| `opruimen` | `17 * * * *` (elk uur) | Opschonen van verlopen OAuth-states, PKCE, sessies, handoff-codes, rate-limits en oude logs (`opruimCron`). |
| `mijn-ruimte-backup.timer` | Dagelijks om `03:30` | PostgreSQL-dump (`pg_dump -Fc`) + archief `/srv/data/uploads`, direct versleuteld via `age -R` met de publieke sleutel (`/etc/mijn-ruimte/backup-ontvanger.age.pub`) in `/srv/backups/mijn-ruimte/<datum>/`. |

---

## 4. Atomaire Uitrol van Pakketten (`mijn-ruimte-installeer`)

Het bijwerken van het platform gebeurt nooit door code live op productie te bewerken. Elke update doorloopt een strikte pijplijn:

1. **Pakketopbouw en verificatie (`npm run build` + `orch.mjs pakket`):** bouwt `mijn-ruimte-<versie>.tar.gz` met `PAKKET-MANIFEST.json` en `ONTWIKKELARCHIEF.json`.
2. **Voorcontrole en goedkeuring door de eigenaar met Passkey:** in `Admin → Updates` (binnen het actieve Technische profiel) controleert de eigenaar de pakketinhoud, migraties en GitHub Release, en ondertekent vervolgens de installatietoestemming met zijn eigen **WebAuthn Passkey**.
3. **Atomaire installatie (`mijn-ruimte-installeer`):**
   - Pakt de release uit naar `/srv/mijn-ruimte/releases/<versie>/`.
   - Voert SQL-migraties uit onder de rol `mijnruimte_migrator` (`/etc/mijn-ruimte/migratie.env`) en past `migrations/rechten.sql` toe.
   - Schakelt de symlink `/srv/mijn-ruimte/actief` atomair om naar de nieuwe release en herstart `mijn-ruimte.service` en `mijn-ruimte-mcp-deur.service` (poort `8091`).
4. **Rookcontrole in een echte browser (`rook-controle`):** start headless Chromium (`deploy/rook-controle.mjs`), controleert `/api/health`, de afwezigheid van consolefouten en de rendering van alle hoofdsubdomeinen. Bij een fout zet de installer de symlink `actief` automatisch terug naar de vorige werkende release.

---

## 5. Belangrijkste Commando's voor Ontwikkeling, Controle en Orchestratie

```bash
# 1. Lokale start en volledige build-verificatie
npm run dev                                          # Start Vite dev-server voor de frontend
npm run build                                        # Volledige build-pijplijn:
                                                     #   kaart-controle → plaatsing-controle → hulp-vraagtekens-controle →
                                                     #   zoek-ui-catalogus → l002-audit → mail-slimme-inbox-audit →
                                                     #   kleur-contrast-controle → vite build → tech-bundels-controle →
                                                     #   bouw-extensie → build:server
npm run typecheck:server                             # Typecontrole van servercode (tsc -p tsconfig.server.json)

# 2. Uitvoeren van unit- en visuele tests
node scripts/eenheidstests.mjs                       # Alle unittests (of met filter, bijv.: node scripts/eenheidstests.mjs orch)
node scripts/kaart-controle.mjs                      # Integriteitscontrole van de Nederlandse bestandskaart
node scripts/plaatsing-controle.mjs                  # Controle van zones en slots voor zwevende knoppen en afwezigheid van ongeautoriseerde position:fixed
node scripts/kleur-contrast-controle.mjs             # Controle van kleurcontrasten

# 3. Orchestratiecommando's voor AI-agenten (ORCH-001)
node scripts/orch.mjs controleer                     # Volledige controle van beleid.json, regels.lock.json, adapters, taken en wachtrij
node scripts/orch.mjs status                         # Huidige status van alle geregistreerde taken (in_progress / integrated / released / installed)
node scripts/orch.mjs context                        # Generatie van compacte context orchestratie/CONTEXT-COMPACT.md
node scripts/orch.mjs taak-start --id <TASK-ID> --agent <agent> --basis <sha40> --tak <branch>
node scripts/orch.mjs versheid --taak <TASK-ID> --fase start|overdracht
node scripts/orch.mjs pakket --taak <TASK-ID> --auteur "<Naam>"    # Bouw mijn-ruimte-<versie>.tar.gz + <versie>-<agent>-overdracht.zip
node scripts/orch.mjs pakket-controleer --bron uitvoer/mijn-ruimte-<versie>-<agent>-overdracht.zip
node scripts/orch.mjs inleveren --bron <zip|tar.gz|patch|map|tak>
node scripts/orch.mjs wachtrij toon|volgende|klaar|terugtrekken
```

---

## Gerelateerde Documentatie (🇺🇦 UK ↔ 🇳🇱 NL)

- **Hoofdarchitectuurmanifest «Klimop» (`KLIMOP-001`):** [🇳🇱 `ARCHITECTUURMANIFEST-KLIMOP.nl.md`](./ARCHITECTUURMANIFEST-KLIMOP.nl.md) ↔ [🇺🇦 `АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md`](./АРХІТЕКТУРНИЙ-МАНІФЕСТ-ПЛЮЩ.uk.md) · vaardigheid [`klimop-architectuur`](../../.agents/skills/klimop-architectuur/VAARDIGHEID.nl.md)
- **Regels voor 14 agenten (`1.6.0`) en besluitenregister (`B-024`–`B-025`):** [🇳🇱 `AGENTENREGELS.nl.md`](../../AGENTENREGELS.nl.md) ↔ [🇺🇦 `ПРАВИЛА-АГЕНТІВ.uk.md`](../../ПРАВИЛА-АГЕНТІВ.uk.md) ([origineel `AGENTS.md`](../../AGENTS.md)) · [🇳🇱 `orchestratie/BESLUITEN.nl.md`](../../orchestratie/BESLUITEN.nl.md) ↔ [🇺🇦 `orchestratie/РІШЕННЯ.uk.md`](../../orchestratie/РІШЕННЯ.uk.md)
- **Uitrol, pakketten en herstel:** [🇳🇱 `deploy/LEESMIJ.nl.md`](../../deploy/LEESMIJ.nl.md) ↔ [🇺🇦 `deploy/ОГЛЯД-РОЗГОРТАННЯ.uk.md`](../../deploy/ОГЛЯД-РОЗГОРТАННЯ.uk.md) · [🇳🇱 `deploy/REGELS-UITROLPAKKET.nl.md`](../../deploy/REGELS-UITROLPAKKET.nl.md) ↔ [🇺🇦 `deploy/ПРАВИЛА-ПАКЕТА-РОЗГОРТАННЯ.uk.md`](../../deploy/ПРАВИЛА-ПАКЕТА-РОЗГОРТАННЯ.uk.md) · [🇳🇱 `deploy/HERSTEL.nl.md`](../../deploy/HERSTEL.nl.md) ↔ [🇺🇦 `deploy/ВІДНОВЛЕННЯ.uk.md`](../../deploy/ВІДНОВЛЕННЯ.uk.md)
