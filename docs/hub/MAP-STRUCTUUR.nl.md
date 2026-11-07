> 🌐 **Taal / Мова:** [Українська](СТРУКТУРА-ТЕК.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)
> 🧭 **Hub-secties (`docs/hub/`):** [1. Architectuur](./ARCHITECTUUR.nl.md) · [2. Geschiedenis](./GESCHIEDENIS.nl.md) · [3. Takken, PR's & Releases](./TAKKEN-EN-SAMENVOEGVERZOEKEN.nl.md) · [4. Mapstructuur](./MAP-STRUCTUUR.nl.md) · [5. Omgevingsvariabelen](./OMGEVINGSVARIABELEN.nl.md) · [6. Orchestratie & Uitrol](./ORCHESTRATIE-EN-UITROL.nl.md)

# Mapstructuur en Codekaart (`Tarasevych/hub`)

Dit document beschrijft de volledige mappenstructuur van de repository `Tarasevych/hub`, het doel van elke architectuurlaag (`server/`, `backend/`, `src/`, `shared/`, `orchestratie/`, `migrations/`, `deploy/`, `scripts/`, `tests/`, `extension/`) en de verplichte regel voor Nederlandse bestandsnamen (`kaart-controle`).

---

## 1. Volledige Boomstructuur van de Repository

```text
Tarasevych/hub
├── AGENTS.md                        # Canonieke regels voor alle AI-agenten en ontwikkelaars (ORCH-001)
├── OMGEVINGSVARIABELEN.nl.md                      # Volledige beschrijving van omgevingsvariabelen en encryptiesleutels (/etc/mijn-ruimte/geheimen.env)
├── BEVEILIGINGSNOTITIES.nl.md                # Beveiligingsaudit, fixes van fasen A/B/1/2/3/Audit/Zoek/Werkblad en open vragen
├── PORTEERPLAN.nl.md                   # Architectuurplan voor de migratie van AppDeploy naar self-hosted Node.js + PostgreSQL
├── cron.json                        # Definitie van 6 achtergrondtaken (mail, google-sync, opruimen, mail-queue, diagnostiek, zoek-index)
├── package.json                     # Afhankelijkheden (Node >= 24) en scripts voor build, controles, migraties en tests
│
├── orchestratie/                    # Coördinatie van AI-agenten (ORCH-001) en traceerbaarheid van releases (TRACE-001)
│   ├── beleid.json                  # Machineleesbaar coördinatiebeleid, lijsten van agenten, kanalen en verplichte controles
│   ├── BESLUITEN.md                 # Append-only register van architecturale en organisatorische besluiten (B-001 .. B-011)
│   ├── regels.lock.json             # Cryptografische vingerafdruk van regelbestanden en handtekening van de eigenaar (SSH / Passkey)
│   ├── CONTEXT-COMPACT.md           # Automatisch gegenereerde compacte context (≤ 12 KB) voor agenten zonder directe git-toegang
│   ├── wachtrij.json                # Sequentiële integratiewachtrij voor taken (FIFO op basis van basis-commit)
│   ├── eigenaar-ondertekenaars      # Publieke sleutels van de eigenaar (ed25519) voor verificatie van regels en releases
│   ├── taken/                       # Declaraties van actieve en voltooide taken (<TASK-ID>.json)
│   ├── ontwikkelarchieven/          # Gecommitte ontwikkelarchieven volgens TRACE-001 (<TASK-ID>.json)
│   └── sjablonen/                   # Sjablonen voor overdracht van resultaten (ORCH-OVERDRACHT.json)
│
├── server/                          # HTTP-server, router en platformkern (@platform/server)
│   ├── start.ts                     # Server-entrypoint (127.0.0.1:8080, Host-validatie, CSP, HSTS, CSRF, Rate Limits)
│   ├── migrate.ts                   # Uitvoerder van SQL-migraties en controle van PostgreSQL-versie
│   ├── cron.ts                      # CLI-runner voor achtergrondtaken met pg_advisory_lock
│   └── platform/                    # Compatibele platformlaag bovenop PostgreSQL en bestandssysteem
│       ├── db.ts                    # Werken met app.records (JSONB), atomaire takeOne / takeArrayValue / zetAlsHoger, RLS-context
│       ├── pg.ts                    # Verbindingspools voor 3 DB-rollen (migrator, app, system)
│       ├── opslag.ts                # Lokale bestandsopslag (/srv/data/uploads) met pad- en eigenaarsbeveiliging
│       ├── geheimen.ts              # Toegang tot omgevingsgeheimen via een allowlist
│       ├── router.ts                # HTTP-router met controle op canonieke paden (PATH_NOT_CANONICAL)
│       ├── auth-poort.ts            # Centrale autorisatiepoort en registratie van publieke routes (PUBLIEKE_ROUTES)
│       ├── beveiliging.ts           # Rate limiting, inlogblokkades (lockouts), cryptografische helpers
│       ├── rls-audit.ts             # Spiegel van Row-Level Security-controles en logging van schendingen in app.rls_audit
│       └── audit.ts                 # Schrijven naar het met een hash-keten beveiligde logboek app.audit
│
├── backend/                         # Server-side bedrijfslogica van alle 10 actieve diensten
│   ├── index.ts                     # Hoofdregister van API-routes, sessies, OAuth-transacties en werkruimtes
│   ├── deployment-identiteit.ts       # Enige bron voor domeinen (*.tarasevych.com) en sessiecookie-parameters
│   ├── toegangslaag.ts              # Wachtwoorden, TOTP (AES-256-GCM), herstelcodes (HMAC), telefoons, inlogbeleid
│   ├── toegangssleutels.ts          # Gebruikers-WebAuthn Passkeys
│   ├── stap-op.ts                   # Step-Up herbevestigingsmechanisme voor gevoelige acties
│   ├── eigenaar-besluit.ts          # Passkey-besluiten van de eigenaar voor root-acties (rollback, regels, externe MCP-hosts)
│   ├── uitrol-goedkeuring.ts        # Controle, voorcontrole en goedkeuring van uitrolpakketten
│   ├── uitrol-github.ts             # Verificatie van commit-herkomst, tak en SHA-256 van GitHub Release-archief (TRACE-001)
│   ├── orch-routes.ts / orch-opslag.ts / orch-hulpmiddelen.ts # Web/HTTP/MCP-interface van het ORCH-001 coördinatiesysteem
│   ├── connector-v2.ts / mcp-klant/ # Gateway voor AI-connectoren v2 (/claude, /gpt, /grok...) en externe MCP-client
│   ├── google-suite-*.ts            # OAuth, Gmail, Google Drive, Google Calendar, Google Contacts (People API)
│   ├── mail-microsoft.ts / mail-imap.ts # Integratie van Outlook (Microsoft Graph) en universele IMAP/SMTP
│   ├── globaal-zoek.ts / zoek-index.ts / zoek/ # Globaal zoeken /zoek, indexer, tekst-worker en OCR
│   ├── cloud-platform.ts / cloud-google-drive.ts # Cloudopslag Cloud vNext
│   ├── werkblad-v3.ts               # Serverkern van het werkbladcanvas Werkblad v3
│   └── juridisch.ts                 # Statische tweetalige juridische pagina's GET /privacy en GET /terms
│
├── src/                             # Frontend (React 19 + TypeScript + Tailwind CSS)
│   ├── main.tsx / App.tsx           # SPA-entrypoint
│   ├── VerenigdDienstApp.tsx        # Verenigde diensten-shell, menu v2, ruimtewisselaar
│   ├── GoogleMailWerkruimte.tsx     # Hoofdwerkruimte voor e-mail
│   ├── mail/                        # Modules van Adaptive Mail Canvas (LeesVenster, ContextPaneel, WatNodigBlok, MailOrbitIntro, MailKoppelVenster)
│   ├── Mail*Bewerker.tsx / Mail*Voorbeeld.tsx # 147 gespecialiseerde viewers en editors voor bijlageformaten
│   ├── plaatsing/                   # Systeem voor zwevende knoppen "Zones & Slots" (Plek.tsx, plaats-slepen.ts)
│   ├── agenten/                     # Beheerinterface voor AI-agenten, rechten en tabblad "Coördinatie" (TabOrch.tsx)
│   ├── afstemming-vnext/            # Interface voor taakafstemming, conflicten en releases
│   ├── merk/                        # Systeem voor officiële en eigen merklogo's (CC0/MIT + gesaneerde SVG)
│   └── zoek/                        # Interface voor globaal zoeken /zoek en indexeringsbeheer
│
├── shared/                          # Gedeelde types, modellen, regels en constanten (beschikbaar op zowel server als browser)
│   ├── orch-model.ts                # Datamodel en foutcodes voor agentcoördinatie (ORCH_CODES)
│   ├── ontwikkelarchief.ts          # Schema en validator voor het TRACE-001 ontwikkelarchief (ONTWIKKELARCHIEF.json)
│   ├── uitrol-manifest.ts / uitrol-codes.ts # Manifest van het uitrolpakket en weigeringscodes van de installer
│   ├── plaatsing.ts                 # Wiskundig model van zones en slots voor zwevende knoppen
│   ├── mail-acties.ts               # Enig register van 39 e-mailacties (teksten uk/nl, sneltoetsen, kleurtonen)
│   ├── ai-bronnen.ts                # Verificatie van AI-citaten en datums tegen de originele e-mailtekst
│   ├── sleutelkluis.ts              # Types en constanten van de Sleutelkluis
│   └── geheim-patronen.ts           # Reguliere expressies voor automatische maskering van geheimen in de zoekindex
│
├── migrations/                      # 139 PostgreSQL SQL-migraties (0001_basis.sql .. 0198_aanmeldmethoden_vnext.sql + rechten.sql)
├── deploy/                          # Installatiescripts (installeer-app.sh), systemd-units, timers, back-ups, runbooks
├── docs/                            # Architectuurdocumentatie, specificaties en bestandskaart (docs/kaart/KAART-BESTANDEN.nl.md)
├── scripts/                         # CLI-hulpprogramma's voor build, controles (kaart-controle, plaatsing-controle, l002-audit) en orch.mjs
├── tests/                           # Unit- (tests/eenheid/), visuele (tests/visueel/) en E2E-tests (tests/e2e/)
└── extension/                       # Browserextensie Mijn Ruimte (Chrome / Edge)
```

---

## 2. Gedetailleerde Beschrijving van de Kernmodules

### 2.1. Platformkern (`server/`)
De platformkern is verantwoordelijk voor het ontvangen van HTTP-verkeer, transportbeveiliging, interactie met PostgreSQL (`app.records` en getypeerde tabellen) en het bestandssysteem:
- [`server/start.ts`](../../server/start.ts) — start de HTTP-server op `127.0.0.1:8080`, valideert de `Host`-header tegen de allowlist van 11 subdomeinen `*.tarasevych.com`, stelt beveiligingsheaders in (`CSP`, `HSTS`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), past CSRF-bescherming toe (`Sec-Fetch-Site` + `Origin`) en initialiseert de sessiecontext.
- [`server/platform/db.ts`](../../server/platform/db.ts) — biedt een compatibele API bovenop `app.records` met atomaire operaties (`takeOne`, `takeArrayValue`, `zetAlsHoger`) en automatische instelling van de PostgreSQL RLS-context (`SET LOCAL app.current_user_id`, `app.current_session_role`, `app.current_workspace`).
- [`server/platform/auth-poort.ts`](../../server/platform/auth-poort.ts) — centrale autorisatiepoort: controleert elk API-verzoek tegen de lijst `PUBLIEKE_ROUTES` en blokkeert ongeautoriseerde anonieme antwoorden.
- [`server/platform/audit.ts`](../../server/platform/audit.ts) — schrijft beveiligingsgebeurtenissen naar de tabel `app.audit` met een cryptografische hash-keten (`prev_hash` → `entry_hash`) en HMAC-hashing van IP-adressen (`AUDIT_IP_PEPPER`).

### 2.2. Server-side Bedrijfslogica (`backend/`)
Bevat de implementatie van alle 10 actieve platformdiensten en systeemonderdelen:
- **Authenticatie en accountbeveiliging:** [`backend/toegangslaag.ts`](../../backend/toegangslaag.ts), [`backend/toegangssleutels.ts`](../../backend/toegangssleutels.ts) (WebAuthn Passkeys), [`backend/stap-op.ts`](../../backend/stap-op.ts) (Step-Up verificatie), [`backend/eigenaar-besluit.ts`](../../backend/eigenaar-besluit.ts) (Passkey-besluiten van de eigenaar).
- **E-mail en Agenda:** [`backend/google-suite-mail-browser.ts`](../../backend/google-suite-mail-browser.ts), [`backend/mail-microsoft.ts`](../../backend/mail-microsoft.ts), [`backend/mail-imap.ts`](../../backend/mail-imap.ts), [`backend/google-suite-agenda-sync.ts`](../../backend/google-suite-agenda-sync.ts).
- **Cloud, Zoeken en Werkbladcanvas:** [`backend/cloud-platform.ts`](../../backend/cloud-platform.ts), [`backend/globaal-zoek.ts`](../../backend/globaal-zoek.ts), [`backend/zoek-index.ts`](../../backend/zoek-index.ts), [`backend/werkblad-v3.ts`](../../backend/werkblad-v3.ts).
- **AI-connectoren, Orchestratie en Uitrol:** [`backend/connector-v2.ts`](../../backend/connector-v2.ts), [`backend/orch-routes.ts`](../../backend/orch-routes.ts), [`backend/uitrol-goedkeuring.ts`](../../backend/uitrol-goedkeuring.ts), [`backend/uitrol-github.ts`](../../backend/uitrol-github.ts).

### 2.3. Frontend (`src/`)
Gebouwd met **React 19 + TypeScript + Tailwind CSS (Vite)**:
- [`src/VerenigdDienstApp.tsx`](../../src/VerenigdDienstApp.tsx) — hoofd-shell van de diensten, menu v2 (dock rechts/boven/onder), globale zoekbalk en ruimtewisselaar (`Persoonlijk` / `Werk` / `Technisch`).
- [`src/GoogleMailWerkruimte.tsx`](../../src/GoogleMailWerkruimte.tsx) en `src/mail/*` — e-mailclient met Adaptive Mail Canvas (`LeesVenster.tsx`, `ContextPaneel.tsx`, `WatNodigBlok.tsx`, `MailOrbitIntro.tsx`, `MailKoppelVenster.tsx`) en 147 gespecialiseerde bijlageviewers/-editors (`Mail*Voorbeeld.tsx`, `Mail*Bewerker.tsx`).
- `src/agenten/*` en `src/afstemming-vnext/*` — beheerinterface voor AI-agenten, MCP-koppelingen, Sleutelkluis en het tabblad "Coördinatie" (`TabOrch.tsx`).

### 2.4. Gedeelde Contracten (`shared/`)
Bevat isomorfe TypeScript-code zonder server- of browserafhankelijkheden, wat identieke validatie op de client, server en in CLI-scripts garandeert (`orch-model.ts`, `ontwikkelarchief.ts`, `uitrol-manifest.ts`, `plaatsing.ts`, `mail-acties.ts`, `ai-bronnen.ts`, `sleutelkluis.ts`, `geheim-patronen.ts`).

---

## 3. Regel voor Nederlandse Bestandsnamen (`kaart-controle`)

Op 24 oktober 2026 zijn in het kader van de Nederlandse code-canonisatie **531 bestanden** in `src/`, `backend/`, `shared/`, `server/`, `tests/` en `scripts/` hernoemd naar het Nederlands volgens één uniform domeinwoordenboek.

- **Volledige vertaaltabel van oude (EN) naar nieuwe (NL) bestandsnamen:** [`docs/kaart/KAART-BESTANDEN.nl.md`](../kaart/КАРТА-ФАЙЛІВ.md) ([🇺🇦 UK](../kaart/КАРТА-ФАЙЛІВ.uk.md) ↔ [🇳🇱 NL](../kaart/KAART-BESTANDEN.nl.md)).
- **Automatische controle tijdens de build:** het script [`scripts/kaart-controle.mjs`](../../scripts/kaart-controle.mjs) wordt als eerste stap in `npm run build` uitgevoerd en controleert dat er bij het samenvoegen van takken geen oude Engelstalige bestandsnamen terugkeren in de repository.

---

## Gerelateerde Documentatie (🇺🇦 UK ↔ 🇳🇱 NL)

- **Bestandskaart (EN → NL):** [🇺🇦 `docs/kaart/KAART-BESTANDEN.uk.md`](../kaart/КАРТА-ФАЙЛІВ.uk.md) ↔ [🇳🇱 `docs/kaart/KAART-BESTANDEN.nl.md`](../kaart/KAART-BESTANDEN.nl.md)
- **Platformarchitectuur:** [🇺🇦 `docs/hub/ARCHITECTUUR.uk.md`](АРХІТЕКТУРА-ЦЕНТРУ.uk.md) ↔ [🇳🇱 `docs/hub/ARCHITECTUUR.nl.md`](./ARCHITECTUUR.nl.md)
- **Orchestratie & Uitrol:** [🇺🇦 `docs/hub/ORCHESTRATIE-EN-UITROL.uk.md`](КООРДИНАЦІЯ-ТА-РОЗГОРТАННЯ.uk.md) ↔ [🇳🇱 `docs/hub/ORCHESTRATIE-EN-UITROL.nl.md`](./ORCHESTRATIE-EN-UITROL.nl.md)
