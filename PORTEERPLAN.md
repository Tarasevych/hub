# Porteerplan «Мій простір»: zelf hosten zonder AppDeploy

Status: plan, er is nog geen code aangepast. Branch: `zelf-hosten`. Basis: `b161610` (security fixes).
Datum van de analyse: 3 oktober 2026.
Doelomgeving: Ubuntu 24.04.5, Node.js 24.21 / npm 11, PostgreSQL 17 op 127.0.0.1:5432 (db en rol `mijnruimte`), uploads in `/srv/data/uploads`, app in `/srv/mijn-ruimte`, systeemgebruiker `mijnruimte`, systemd en een Cloudflare Tunnel (`cloudflared`, alleen uitgaand) naar een localhost-poort.

---

## 0. Samenvatting

* De app is een React/Vite-SPA met één grote TypeScript-backend (`backend/index.ts`, 415 KB, ±285 routes: 278× POST en 8× GET). AppDeploy draaide de backend als Lambda-achtige handler (`export const handler = router({...})`) en twee cron-handlers.
* **61 bestanden** importeren de SDK: 28 in `backend/` (`@appdeploy/sdk`) en 33 in `src/` (`@appdeploy/client`).
* De afhankelijkheid zit vooral in **`db`**: ±770 aanroepen van `db.add/get/list/update/delete` op **82 vaste logische tabellen** en ±10 families van dynamische tabellen met een prefix.
  Daarnaast gebruikt de code `secrets` (±40×), `storage` (2 bestanden), `ai` (3 aanroepen), `invites` (1 flow), `ws` (dode code) en `router/json/error`.
  Aan de frontend-kant zijn het `api.post/get` (±200 aanroepen), `image.resizeIfNeeded` (3×) en `invitesClient` (4×).
* **AppDeploy-auth wordt niet gebruikt.** De app heeft een eigen authenticatielaag: Google OIDC voor de eigenaar, wachtwoord met TOTP en herstelcodes, eigen sessiecookies en eigen RBAC. Er moet dus geen auth-provider vervangen worden.
* **Aanbevolen aanpak: een compatibiliteitslaag ("shim").** We schrijven eigen modules met precies dezelfde API (`db`, `storage`, `secrets`, `ai`, `invites`, `router/json/error`; client: `api`, `image`, `invitesClient`) bovenop Postgres (JSONB), het lokale bestandssysteem en env-variabelen.
  De ±770 db-aanroepen blijven dan ongewijzigd. Een volledig relationeel schema (zoals in `docs/mail/MAIL_DATABASE_SCHEMA.md`) is fase 2 en optioneel.
* **Inschatting:** ±14–19 werkdagen voor één ontwikkelaar, inclusief de beveiligingspunten en het testen. Zie §7.
* **Build nu:** er is geen `package-lock.json`, dus `npm ci` faalt meteen. `npm install` lukt wel. `npm run build` faalt in Vite op `Rollup failed to resolve import "@appdeploy/client"` (Node 20 én Node 24.21/npm 11).
  Met een tijdelijke stub van de client-SDK bouwt de frontend volledig (`✓ built in 29.64s`). Details in §6.
* **Er is geen harde blokkade.** Alle AppDeploy-diensten zijn te vervangen. Alleen `ai.*` heeft een externe AI-provider (of lokale modellen) nodig, en productiedata uit AppDeploy is niet eenvoudig te exporteren. Zie de beslissingen in §9.

---

## 1. Huidige architectuur (zoals aangetroffen)

| Onderdeel | Bevinding |
|---|---|
| Frontend | Vite 6 + React 19 + Tailwind 3. Entry `index.html` → `src/main.tsx`. `base: './'`, output `dist/` (`APPDEPLOY_VITE_OUT_DIR`). Er is een service worker (`public/service-worker.js`, slaat `/api/` over). |
| Pre-build scripts | `scripts/l002-audit.mjs` (statische audit die alleen `public/l002-diagnostic.json` schrijft en nooit faalt), `scripts/beveiliging-bouw.mjs` en `scripts/mail-slimme-inbox-audit.mjs`. **Let op:** `beveiliging-bouw.mjs` herschrijft `index.html` **in de werkboom**: de inline scripts en styles worden geëxternaliseerd naar `public/canonical-*.js/css`. Draai de build daarom in een schone kopie of pas het script aan zodat het naar een build-map schrijft. |
| Runtime-config frontend | `public/canonical-service.js` bevat de hostnamen van 9 diensten: `hub`, `id`, `mail`, `cloud`, `ai`, `github`, `huis`, `api` en `admin` (`*.tarasevych.com`). Een "technische host" wordt herkend aan `*.v2.appdeploy.ai`. |
| CSP | Wordt alleen via een `<meta>`-tag gezet door `public/canonical-security.js`. Productie: `script-src 'self'`, `connect-src` met `api-v2.appdeploy.ai`. Technische host: `'unsafe-inline' 'unsafe-eval'`. |
| Backend | `backend/index.ts` exporteert `handler` (router), `mailMaintenanceCron` en `googleSuiteSyncCron`. De Lambda-event-velden die gebruikt worden: `event.headers`, `event.body`, `event.queryStringParameters` en `event.requestContext.http.sourceIp`. Responses zijn altijd `{statusCode, headers, body:string}` (geen base64/binaire bodies). Externe npm-dependencies van de backend: alleen `pdf-lib` en `html-entities`, verder `node:*`. |
| API-transport | De client-SDK riep `https://api-v2.appdeploy.ai/app/migrated-bg2v4h/...` aan (zie `connect-src` en `API_COOKIE_PATH=/app/migrated-bg2v4h/`). Daarom zijn de cookies cross-site: `SameSite=None; Partitioned`. |
| Cron | `cron.json`: `mail-provider-maintenance` (*/5, `batchLimit:3`) en `google-suite-bplus-sync` (*/5, `accountLimit:10`), tijdzone Europe/Brussels. |
| Realtime | `backend/realtime.ts` en `backend/realtime-subscribers.ts` (`ws.send`, tabel `entity_subscriptions`) worden **nergens geïmporteerd** door `index.ts`, en de frontend gebruikt `ws` niet. Dit is dode code. |
| Docs | `docs/mail/MAIL_DATABASE_SCHEMA.md` beschrijft al een normatief PostgreSQL-doelschema voor mail (fase 2). |

---

## 2. Inventaris van AppDeploy-gebruik en vervanging

### 2.1 Backend (`@appdeploy/sdk`): 28 bestanden

| Bestand | Import | Gebruik (aantal aanroepen) |
|---|---|---|
| backend/index.ts | db, error, invites, isInviteError, json, router, secrets | db 344, secrets 33, invites 2, router 1 |
| backend/toegangslaag.ts | db | db 34 |
| backend/google-suite-inrichting.ts | db, error, json, secrets | db 37, secrets 6 |
| backend/mail-zoek-duurzaam.ts | db | db 13 |
| backend/cloud-platform.ts | ai, db, error, json, storage | db 10, storage 6, ai.extract 1 |
| backend/google-suite-mail-browser.ts | ai, db, error, json | db 9, ai.extract 1 (vertalen) |
| backend/mail-weergave-voorkeuren.ts | db, error, json, storage | db 6, storage 4 (avatars van afzenders) |
| backend/google-suite-agenda-fotos.ts | db, error, json | db 6 |
| backend/google-suite-agenda-sync.ts | db | db 6 |
| backend/google-suite-sync.ts | db | db 6 |
| backend/mail-uitstel.ts | db, error, json | db 5 |
| backend/api-platform-kluis.ts | db, secrets | db 4, secrets 2 |
| backend/eigenaar-sessie-overdracht.ts | db | db 4 |
| backend/realtime-subscribers.ts | db, ws, json, error | db 4, ws.send 1 (dood) |
| backend/google-contour.ts | db, secrets | db 3, secrets 2 + **globale override van `secrets.readSecret`** (r. 162–163) |
| backend/api-platform-tokens.ts | db, error, json | db 3 |
| backend/api-platform-verbindingen.ts, cognitief-context.ts, hub-indeling-voorkeuren.ts, mail-pmid-opstart.ts | db (+ error/json) | db 1–2 per bestand |
| backend/mail-periode-grenzen-cache.ts | db | db 1 (dynamische tabel `mail_period_bounds_v2:<hash>`) |
| backend/mail-handschrift.ts | ai, error, json | ai.ocr 1 (handschriftherkenning) |
| backend/globaal-zoek.ts, hub-block-data.ts, mail-search.ts | db, error, json | db via helpers |
| backend/cloud-google-drive.ts, google-suite-browser.ts, rbac.ts | error, json | alleen response-helpers |

### 2.2 Frontend (`@appdeploy/client`): 33 bestanden

* `api`: ±200 aanroepen, bijna allemaal `api.post('/api/...')` met een JSON-body. De grootste gebruikers zijn GoogleMailWerkruimte.tsx (39), App.tsx (31), VerenigdDienstApp.tsx (30), OwnerTestApp.tsx (19), ApiPlatformWeergave.tsx (11) en MailFunctioneelWeergave.tsx (10).
  De code verwacht `response.data`. Bij fouten leest ze `err.response.status`, `err.response.data.error`, `err.status`, `err.responseText` en `err.message`.
* `image.resizeIfNeeded`: App.tsx en VerenigdDienstApp.tsx (profielfoto, 512 px JPEG) en MailHandschriftInvoer.tsx (1200 px PNG voor OCR).
* `invitesClient.getPendingCode / clearPendingCode / buildJoinUrl`: App.tsx (`#/join`) en VerenigdDienstApp.tsx (`?join=1`). Het gaat om workspace-delen.

### 2.3 Vervanging per functie

| AppDeploy-functie | Gebruik in de app | Zelf-gehoste vervanging |
|---|---|---|
| `db.add/get/list/update/delete` | ±770 aanroepen, 82 vaste en ±10 dynamische logische tabellen, filters op gelijkheid van velden op het hoogste niveau (`{userId}`, `{ownerUserId, mailAccountId}`, `{email}`, ...), `limit` en `nextToken` | **Shim `server/platform/db.ts`** met dezelfde signaturen, op `pg` (node-postgres, pool). Eén generieke tabel `app.records(tbl, id, seq, data jsonb, ...)`. `filter` wordt `data @> $1::jsonb` (GIN-index `jsonb_path_ops`). Volgorde op `seq`. `nextToken` = base64(laatste `seq`), dus keyset-paginering. `update` vervangt het hele record, net als AppDeploy. Limieten (500 items en 1 MiB per aanroep, 256 KiB per record) worden gehandhaafd met dezelfde foutmeldingen. **Gedragsverschil (een verbetering):** AppDeploy telde bij `limit` de *gelezen* items, niet de *gevonden* items. Lookups zoals `db.list('users',{filter:{email},limit:5})` konden dus records missen. Postgres geeft echte matches terug. Daarnaast komen er extra methodes voor atomaire acties (`takeOne`/`deleteWhere ... RETURNING`), nodig voor de handoff-race (§5). |
| `storage.write/read/delete` (content base64) | Cloud-uploads (`cloud/<hash>/<ts>-<rand>.<ext>`, max 6 MB) en afzender-avatars (webp) | **Shim `server/platform/opslag.ts`** op `/srv/data/uploads` (`UPLOADS_DIR`). Base64 wordt bij het schrijven gedecodeerd en bij het lezen weer gecodeerd. Strenge padvalidatie: `^[a-zA-Z0-9/_.-]+$`, geen `..`, en na `path.resolve` moet het pad binnen de root vallen. Atomisch schrijven (tmp + `rename`), bestanden 0640 en mappen 0750. Optioneel komt er metadata in `app.storage_objects`. `storage.url` wordt niet gebruikt, dus implementeren we die niet (er komt een duidelijke fout). |
| `secrets.readSecret / listSecretNames` | ±40 aanroepen, 15+ namen (§4.3) | **Shim `server/platform/geheimen.ts`:** leest uit `process.env`, gevuld via `EnvironmentFile=/etc/mijn-ruimte/geheimen.env`. Er komt een allow-list van toegestane namen. `listSecretNames` geeft alleen de namen uit die lijst die gezet zijn. `readSecret` gooit een fout als een naam ontbreekt, net als AppDeploy. De override in `google-contour.ts` (r. 162–163) **verwijderen**. |
| `router/json/error` | 1 router, ±285 routes `'POST /api/...'` met `:params`, ctx = `{body, query, params, event}` | **Eigen `router()` met dezelfde semantiek** plus een HTTP-adapter op `node:http`. De adapter bouwt een Lambda-achtig event (`headers` in kleine letters, `body` als string, `queryStringParameters`, `requestContext.http.sourceIp` = `cf-connecting-ip`). `json(data,status)` en `error(msg,status)` geven `{"error": msg}` terug. Er komt een body-limiet van ±12 MB (6 MB bestand als base64 in JSON). |
| `invites.create/join` (+ `isInviteError`) | Delen van workspaces (`resourceType:'workspace_share'`, `authMode:'anonymous'`, met verloopdatum) | **Eigen module en tabel `app.invites`.** De code is 128 bits willekeurig (`base64url`). Er zijn `status`, `expires_at`, `revoked_at` en `context jsonb`. `InviteError` krijgt dezelfde `code`-waarden. `resolve`/`revoke` alleen als ze nodig zijn. |
| `ai.extract` (2×) en `ai.ocr` (1×) | Metadata-suggestie voor cloud-items (met een deterministische fallback), vertaling van mails, en handschrift-OCR | **Adapter `server/platform/ai.ts`** met `AI_PROVIDER=none|openai|anthropic|gemini|xai|ollama`. `extract` betekent: een chat-call met JSON-schema (structured output) plus validatie. `ocr` betekent: een vision-call. Bij `none` wordt `AI_UNAVAILABLE` gegooid. Dan valt cloud terug op de deterministische logica, en tonen vertaling en handschrift een nette melding. Dit is een **beslissing** (§9). |
| `ws.send` + `realtime.ts` | Niet aangesloten | **Verwijderen**: `backend/realtime.ts`, `backend/realtime-subscribers.ts` en de ongebruikte `/api/subscriptions`. |
| Cron (`cron.json`, handlers in index.ts) | 2 jobs, elke 5 minuten | **systemd-timers** die een kleine CLI aanroepen (`node dist-server/cron.mjs <naam>`), met dezelfde payload als in `cron.json`. `Type=oneshot` voorkomt overlap. Logging gaat naar journald. Extra: een `pg_advisory_lock` per job. Alternatief: in-process `croner` (eenvoudiger, maar minder geïsoleerd). |
| `@appdeploy/client` `api` | ±200 aanroepen | **`src/platform/client.ts`:** `fetch` naar same-origin `/api/...`, `credentials:'same-origin'`, JSON, een axios-achtige response `{data}` en een error-object met `response:{status,statusText,data}`, `status`, `responseText` en `message`. |
| `image.resizeIfNeeded` | 3× | Een eigen implementatie (±60 regels) met `createImageBitmap` + canvas/`OffscreenCanvas` → `toBlob` → base64. Retourvorm `{data,mimeType,width,height,bytes,resized}`. |
| `invitesClient` | 4× | Een eigen helper die de URL bouwt met de parameter `invite`. Een pending code wordt bewaard in `sessionStorage`. |
| Hosting en statische bestanden | AppDeploy CDN | Dezelfde Node-server serveert `dist/` (bijv. met `sirv`). Hashed assets krijgen `immutable` caching. SPA-fallback naar `index.html`. `base` wordt `'/'` in plaats van `'./'`, want URL's met een tab-pad zoals `/inbox` mogen niet stuk gaan. |

**Importstrategie:** vervang `'@appdeploy/sdk'` door een alias `'@platform/server'` en `'@appdeploy/client'` door `'@platform/client'` (tsconfig `paths` + Vite `resolve.alias` + esbuild `alias`). Dat is een mechanische wijziging van 61 regels. Gebruik niet de oude pakketnamen: dat geeft verwarring en botst als iemand het echte pakket later installeert.

---

## 3. Datamodel en Postgres-schema

### 3.1 Wat de app verwacht

* Records zijn **JSON-documenten zonder schema** in een "tabel" (een string). Het `id` (uuid als string) wordt door de database gegenereerd. `db.list` voegt `id` toe, `db.get` niet.
* Tijden zijn epoch-ms (`createdAt`, `updatedAt`, `expiresAt`, ...) in het document zelf.
* Alles is owner-scoped via velden zoals `userId`, `ownerUserId` en `tenantKey`.
* Dynamische "tabellen" met een prefix (cachepagina's, checkpoints) zijn: `mail_period_bounds_v2:*`, `mail_search_cursor_v1:*`, `mail_search_manifest_v1:*`, `mail_search_result_page_v1:*`, `mail_pmid_map_v1:*`, `mail_pmid_bootstrap_v1:*`, `hub_layout_preferences_v1:*`, `mail_state_bulk_active_v1:*`, `mail_state_bulk_operation_v1:*` en `mail_state_bulk_page_v1:*`.
  Deze groeien en hebben in Postgres een **opruimjob** nodig (TTL, bijv. 30 dagen op `updated_at`).

**Logische tabellen per domein (82):**

| Domein | Tabellen |
|---|---|
| Identiteit en accounts | `users`, `account_identities`, `access_requests`, `identity_passwords_v1`, `identity_totp_v1`, `identity_recovery_codes_v1`, `identity_phones_v1`, `identity_webauthn_v1`, `identity_method_bindings_v1`, `access_method_policy_v1` |
| Sessies en tokens | `owner_service_sessions_v1`, `owner_tab_sessions_v1`, `owner_browser_grants_v1`, `owner_auth_transactions_v1`, `owner_revocation_state_v1`, `service_sessions`, `service_handoffs`, `browser_grants`, `browser_policies`, `google_sessions`, `google_auth_codes`, `google_oauth_states`, `auth_broker_requests`, `api_machine_tokens_v1` |
| Admin en audit | `admin_role_assignments_v1`, `admin_sso_policy_v1`, `admin_oauth_access_policy_v1`, `admin_directory_connectors_v1`, `owner_security_audit_v2`, `security_audit`, `credential_contours_v1`, `owner_ui_preferences_v1` |
| API-platform | `owner_vault_v1`, `owner_connections_v1` |
| Hub en workspaces | `workspaces`, `workspace_members`, `workspace_blocks`, `site_notifications`, `notification_jobs`, `cognitive_resume_context_v1` |
| Cloud | `cloud_workspaces_v1`, `cloud_items_v1`, `cloud_resume_v1`, `cloud_audit_v1`, `cloud_ai_decisions_v1`, `cloud_provider_accounts_v1`, `cloud_provider_selections_v1`, `cloud_provider_tokens_v1` |
| Google Suite / providers | `google_oauth_grant_v1`, `google_suite_onboarding_v1`, `google_suite_oauth_states_v1`, `google_suite_sync_state_v1`, `google_suite_calendar_sync_state_v1`, `google_suite_calendar_events_v1`, `google_suite_drive_projection_v1`, `google_suite_mail_selections_v1`, `google_photos_picker_sessions_v1`, `google_photos_picker_selections_v1`, `provider_principals_v1`, `provider_service_grants_v1`, `provider_service_tokens_v1`, `provider_endpoint_verifications_v1` |
| Mail | `mail_accounts_v1`, `mail_items_v1`, `mail_oauth_states_v2`, `mail_oauth_tokens_v2`, `mail_jobs_v2`, `mail_commands_v2`, `mail_sync_state_v2`, `mail_provider_labels_v2`, `mail_provider_threads_v2`, `mail_provider_subscriptions_v2`, `mail_webhook_events_v2`, `mail_endpoint_verifications_v1`, `mail_metrics_v1`, `mail_notification_preferences_v1`, `mail_view_preferences_v1`, `mail_resume_v1`, `mail_snoozes_v1`, `mail_state_intents_v1`, `mail_state_intent_events_v1` |
| Dood | `entity_subscriptions` (realtime) |

Typische recordvormen (uit de code): `User {email, sub, name, picture, role: owner|admin|member|viewer, status, accessLevel, entitlements, createdAt, ...}`, `OwnerSession {tokenHash, previousTokenHash, userId, service, sourceOrigin, tabHash, grantId, idleExpiresAt, absoluteExpiresAt, revocationEpoch, rotation, qaSynthetic?, scope}`, `CloudItemRecord {ownerUserId, workspaceId, kind, title, storagePath, mimeType, sizeBytes, tags, status, aiState, ...}` en `MailAccountRecord {ownerUserId, provider: google|microsoft, email, status, grantedScopes, ...}`.

### 3.2 Voorstel migratiebestand: `migrations/0001_basis.sql` (fase 1, compatibel)

```sql
-- 0001_basis.sql : basisschema voor de zelf-gehoste compatibiliteitslaag
-- Uitvoeren als eigenaar van database mijnruimte (rol mijnruimte).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- gen_random_uuid()
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION mijnruimte;

-- Migratieboekhouding
CREATE TABLE IF NOT EXISTS app.schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- Generieke documentopslag (vervangt AppDeploy db.*)
CREATE TABLE app.records (
  tbl         text        NOT NULL CHECK (length(tbl) BETWEEN 1 AND 200),
  id          text        NOT NULL DEFAULT gen_random_uuid()::text,
  seq         bigint      GENERATED ALWAYS AS IDENTITY,
  data        jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tbl, id)
);
CREATE UNIQUE INDEX records_tbl_seq_idx ON app.records (tbl, seq);         -- volgorde + keyset-paginering
CREATE INDEX records_data_gin      ON app.records USING gin (data jsonb_path_ops);  -- filter: data @> '{...}'
-- Gerichte indexen voor de meest gebruikte filtervelden
CREATE INDEX records_owner_idx  ON app.records (tbl, (data->>'ownerUserId')) WHERE data ? 'ownerUserId';
CREATE INDEX records_user_idx   ON app.records (tbl, (data->>'userId'))      WHERE data ? 'userId';
CREATE INDEX records_email_idx  ON app.records (tbl, lower(data->>'email'))  WHERE data ? 'email';
CREATE INDEX records_mailacc_idx ON app.records (tbl, (data->>'mailAccountId')) WHERE data ? 'mailAccountId';
CREATE INDEX records_tokenhash_idx ON app.records (tbl, (data->>'tokenHash')) WHERE data ? 'tokenHash';
CREATE INDEX records_updated_idx ON app.records (updated_at);                -- TTL-opruimjob

-- Metadata van bestanden in /srv/data/uploads (optioneel, voor integriteit/opruimen)
CREATE TABLE app.storage_objects (
  path          text PRIMARY KEY CHECK (path ~ '^[A-Za-z0-9/_.-]{1,512}$' AND path !~ '\.\.'),
  content_type  text   NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes >= 0),
  sha256        text   NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Uitnodigingen (vervangt AppDeploy invites)
CREATE TABLE app.invites (
  code           text PRIMARY KEY,                  -- 128 bit random, base64url
  resource_type  text NOT NULL,
  auth_mode      text NOT NULL CHECK (auth_mode IN ('anonymous','required')),
  allow_list     text[] NOT NULL DEFAULT '{}',
  context        jsonb  NOT NULL DEFAULT '{}',
  created_by     text,
  expires_at     timestamptz,
  revoked_at     timestamptz,
  join_count     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invites_expires_idx ON app.invites (expires_at) WHERE revoked_at IS NULL;

-- Rate limiting / lockout (wachtwoord, TOTP, herstelcodes, OAuth-start, ...)
CREATE TABLE app.rate_limits (
  bucket        text        NOT NULL,               -- bv. 'login:ip:203.0.113.5' of 'login:email:<sha256>'
  window_start  timestamptz NOT NULL,
  hits          integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX rate_limits_window_idx ON app.rate_limits (window_start);

CREATE TABLE app.login_lockouts (
  subject       text PRIMARY KEY,                   -- 'email:<sha256>' of 'ip:<addr>'
  failures      integer     NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Cron-runs (observability; aanvulling op journald)
CREATE TABLE app.cron_runs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error')),
  detail       text
);
CREATE INDEX cron_runs_name_idx ON app.cron_runs (name, started_at DESC);

INSERT INTO app.schema_migrations (version) VALUES ('0001_basis');
COMMIT;
```

Opmerkingen:
* `id` is `text` en geen `uuid`. Zo geven ongeldige ID's uit requests geen SQL-fouten, maar gewoon `null`, zoals bij AppDeploy.
* `db.add` doet een `INSERT ... RETURNING id`, `db.get` doet `WHERE tbl=$1 AND id = ANY($2)` en de shim herordent de resultaten naar de volgorde van de aanvraag. `db.update` doet `UPDATE ... SET data=$, updated_at=now()`, `db.delete` doet `DELETE ... WHERE id = ANY`.
* `db.list` doet `WHERE tbl=$1 AND seq > $cursor AND data @> $filter ORDER BY seq LIMIT $n+1`.
* Transacties: AppDeploy had die niet. De shim krijgt een `db.tx(fn)` voor nieuwe code (handoff redeem, rate limits).
* Fase 2 (optioneel, later): de hete tabellen (`users`, `owner_service_sessions_v1`, `mail_items_v1`, `mail_accounts_v1`, `cloud_items_v1`) normaliseren naar echte kolommen volgens `docs/mail/MAIL_DATABASE_SCHEMA.md`. Dat kost ±2–4 weken extra en is pas zinvol als de prestaties dat vragen.

### 3.3 Data uit AppDeploy

Er is geen exportfunctie voor de AppDeploy-database of -storage (ook niet via de AppDeploy MCP-tools). Er zijn twee opties:
1. **Schoon beginnen (aanbevolen).** Alle tokens, grants, vault-items, TOTP-geheimen en sessies moeten volgens SECURITY-NOTES toch geroteerd en opnieuw gekoppeld worden. Wat verloren gaat: workspaces/blokken/notities in de Hub, cloud-items en geüploade bestanden, en voorkeuren.
2. Tijdelijk een export-endpoint (alleen voor de eigenaar) deployen op de oude AppDeploy-app. Dat dumpt per tabel JSON en bestanden als base64, en daarna importeren we in `app.records`. Dit vraagt een extra deploy op het gecompromitteerde platform. Doe het alleen als die data echt nodig is, en draai daarna eerst de forensische checks.

---

## 4. Frontend, authenticatie en secrets

### 4.1 Frontend build en serving
* De build blijft `vite build` → `dist/`, met de pre-build scripts. Pas `vite.config.ts` aan: `outDir` vast op `dist`, `APPDEPLOY_*` eruit (eventueel `SOURCEMAP=hidden`), `base: '/'`.
* `beveiliging-bouw.mjs` moet de output in een build-map zetten (nu herschrijft het `index.html` in git). Anders blijft de werkboom na elke build vuil.
* `public/canonical-service.js`: `isTechnicalHost` wordt `false` in productie (de AppDeploy-host verdwijnt). De lijst met domeinen moet configureerbaar worden, zodat we lokaal kunnen testen (zie §7.3). Zet hem bijvoorbeeld in een door de server gegenereerde `/canonical-config.js`, of in een build-time `VITE_PUBLIC_DOMAIN`. Dezelfde lijst staat ook in `backend/index.ts` (`SERVICE_ORIGINS`), `backend/eigenaar-sessie-overdracht.ts`, `backend/google-suite-inrichting.ts` (`CALLBACK`), `backend/api-platform-kluis.ts` (`revealHostAllowed`) en enkele `src/*`. Dit wordt **één bron** in `backend/deployment-identity.ts` (`TECH_ORIGIN`, `API_COOKIE_PATH`, cookienamen).
* De Node-server serveert alle hostnamen vanuit één proces. De dienst wordt bepaald door de `Host`-header (`ownerCustomHostService`), en die werkt al zo.

### 4.2 Hoe auth werkt
* **Eigenaar-login:** Google OIDC (authorization code + PKCE S256, `response_mode=query`) met `redirect_uri = https://id.tarasevych.com/` (de root). De frontend op `id.` stuurt `code`/`state` naar `/api/owner/...` callback-routes. De eigenaar wordt herkend aan een **hardcoded e-mailadres** (`backend/index.ts:30`, `backend/rbac.ts:8`).
* **Wachtwoordlogin** (`/api/owner/access/password/login` en `/api/owner/auth/password/login`) met optionele TOTP en herstelcodes (`backend/toegangslaag.ts`). Passkeys/WebAuthn slaan alleen een `credentialId` op, zonder publieke sleutel of verificatie. Dat is dus geen echte loginmethode: niet inschakelen totdat het goed geïmplementeerd is (bijv. `@simplewebauthn/server`).
* **Sessies** zijn eigen cookies: `__Secure-tsv_ecosystem_<APP_ID>` (gedeelde sessie), per-tab cookies per dienst (`SameSite=Strict`), browser-grants (`tsv_bg_*`, `tsv_bp_*`, `SameSite=Lax`), plus handoff tussen diensten (`eigenaar-sessie-overdracht.ts`). De opslag gebeurt in `owner_service_sessions_v1` en verwante tabellen (token-hash), met een revocation-epoch.
* **Machine-API:** Bearer-tokens `tsv_...` (`api_machine_tokens_v1`, `GET /api/v1/me`). SCIM-inbound gebeurt met `SCIM_BEARER_TOKEN`.
* **Providers voor koppelingen:** Google (Gmail, Drive, Calendar, Photos Picker, Tasks via de "Google Suite"-onboarding) en Microsoft Graph (Outlook-mail). Push gaat via Gmail Pub/Sub (`/api/owner/mail/google/pubsub/push`, JWT-verificatie) en Graph-webhooks (`/api/owner/mail/microsoft/webhook`).
* **Cookies bij zelf hosten:** de API wordt *same-origin*. `SameSite=None; Partitioned` en `Path=/app/<id>/` zijn niet meer nodig. Voorstel:
  * De ecosysteem-cookie wordt `__Secure-tsv_ecosystem; Domain=tarasevych.com; Path=/api/; HttpOnly; Secure; SameSite=Lax`. Zo houden alle subdomeinen één sessie, net als met de gepartitioneerde cookie nu.
  * Cookies per dienst/tab worden host-only `__Host-...; Path=/; SameSite=Strict`.
  * De ingebouwde self-tests die op `SameSite=None`/`Partitioned` controleren, moeten mee aangepast worden.

### 4.3 Secrets en env-variabelen (alle **nieuw** genereren)
In `/etc/mijn-ruimte/geheimen.env` (0640 root:mijnruimte):
`DATABASE_URL` (bestaat al), `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (aliassen `GOOGLE_SUITE_CLIENT_ID` en `GOOGLE_SUITE_CLIENT_SECRET`), `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1`, `OWNER_VAULT_ENCRYPTION_KEY_V1`, `MAIL_TOKEN_ENCRYPTION_KEY_V1`, `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET`, `MICROSOFT_GRAPH_TENANT_ID`, `MICROSOFT_GRAPH_WEBHOOK_URL`, `MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE`, `GOOGLE_GMAIL_PUBSUB_TOPIC`, `GOOGLE_GMAIL_PUBSUB_AUDIENCE`, `GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL`, `SCIM_BEARER_TOKEN` (optioneel).
**Nieuw door de port:** `OWNER_EMAIL`, `OWNER_GOOGLE_SUB` (aanbevolen), `IDENTITY_TOTP_ENCRYPTION_KEY_V1`, `IDENTITY_RECOVERY_PEPPER_V1`, `SESSION_TOKEN_PEPPER_V1` (optioneel), `AI_PROVIDER` en `AI_API_KEY` (afhankelijk van de keuze), `PUBLIC_DOMAIN=tarasevych.com`, `PORT=8080`, `HOST=127.0.0.1`, `UPLOADS_DIR=/srv/data/uploads`.
**Vervalt:** `APPDEPLOY_VITE_OUT_DIR`, `APPDEPLOY_VITE_SOURCEMAP` en de AppDeploy-accountsleutels (wel intrekken bij AppDeploy).
Daarnaast intrekken en opnieuw aanmaken: alle `tsv_`-tokens, vault-items (Home Assistant, Telegram, GitHub PAT, webhooks), alle Google- en Microsoft-refresh-tokens, wachtwoorden en TOTP.
**OAuth-apps die nieuw moeten:**
* Google Cloud: een **nieuwe OAuth-client** (de oude secret is gelekt, en de standaard-client-ID staat hardcoded in `google-contour.ts:5` en `src/CanoniekImplementatieWaarheidMatrix.tsx`). Redirect-URI `https://id.tarasevych.com/`, JS-origins voor de gebruikte hosts. Verder een Pub/Sub-topic met een push-subscription naar `https://<host>/api/owner/mail/google/pubsub/push` en een service-account.
* Microsoft Entra: een nieuwe client secret (of een nieuwe app-registratie), redirect `https://id.tarasevych.com/`, en een Graph-webhook-URL op een publieke host.

---

## 5. Open beveiligingspunten: locatie en oplossing

| # | Punt | Waar | Oplossing |
|---|---|---|---|
| 1 | **Geen rate limit of lockout** op wachtwoordlogin (brute force van wachtwoord, TOTP en herstelcodes; user-enumeratie) | `backend/toegangslaag.ts:203` `verifyPasswordLogin`. Routes r. 273 (`/api/owner/access/password/login`) en r. 279 (`/api/owner/auth/password/login`). Ook `totp/confirm` (r. 403) en `account/recover`. | Middleware `rateLimit(bucket, max, window)` op `app.rate_limits` (atomische `INSERT ... ON CONFLICT DO UPDATE SET hits=hits+1 RETURNING hits`). Per IP bijv. 10/15 min, per e-mail (sha256) 5/15 min, en een progressieve lockout in `app.login_lockouts`. TOTP: een gebruikte tijdstap onthouden (replay-bescherming). Antwoorden en timing gelijk houden voor bestaande en onbestaande gebruikers (dummy-hash). Het client-IP komt **alleen** uit `cf-connecting-ip` (`requestMeta` in index.ts kijkt nu eerst naar `x-forwarded-for`, en die is te vervalsen). Extra laag: een Cloudflare WAF rate-limit-regel op `/api/*/password/login`. |
| 2 | **PKCE-verifier en nonce afgeleid** met HMAC van de client secret | `backend/index.ts:321` `ownerOAuthMaterial`, `backend/mail-platform.ts:17` `mailGoogleOAuthMaterial`, `backend/mail-microsoft.ts:1` `mailMicrosoftOAuthMaterial`, `backend/google-suite-inrichting.ts:110` `oauthMaterial` | Bij de start `randomBytes(32)` voor verifier en nonce, opgeslagen in de bestaande state-record (`owner_auth_transactions_v1`, `mail_oauth_states_v2`, `google_suite_oauth_states_v1`, `google_oauth_states`), met TTL ≤10 min en eenmalig gebruik (atomisch verwijderen bij de callback). De nonce wordt gecontroleerd in het ID-token. |
| 3 | **SameSite=None/Partitioned zonder CSRF-check** | Cookie-builders in `backend/index.ts` (ecosysteem-, grant-, identity- en redirect-cookies) en `backend/eigenaar-sessie-overdracht.ts`. Er is geen Origin-check op POST. | Same-origin API met `SameSite=Lax/Strict` (§4.2), plus een **globale Origin-allow-list** in de HTTP-adapter: voor elke niet-GET `/api/*` moet `Origin` (of `Referer`) gelijk zijn aan `https://<Host>` en in de lijst van diensten staan. Uitzonderingen: de webhooks (`/api/owner/mail/microsoft/webhook`, `/api/owner/mail/google/pubsub/push`, die eigen verificatie hebben), `/api/v1/*` met Bearer, en SCIM. Content-Type moet `application/json` zijn. |
| 4 | **`x-forwarded-host` vertrouwd** | `backend/index.ts:278` `ownerHost`, `backend/eigenaar-sessie-overdracht.ts:17` `hostOf`, `backend/api-platform-kluis.ts:69` `requestHost` | Alleen `Host` gebruiken, en valideren tegen de lijst van hostnamen (anders 421/400). De server bindt op `127.0.0.1`. In cloudflared **geen** `httpHostHeader` instellen. De adapter verwijdert een inkomende `x-forwarded-host` uit `event.headers`. **Ook:** `revealHostAllowed` (`api-platform-kluis.ts:73`) staat `localhost`, `127.0.0.1` en `internal.appdeploy.runtime` toe. Dat is gevaarlijk bij zelf hosten, want elk lokaal proces kan dan bij de vault. Die waarden moeten weg. |
| 5 | **CSP `unsafe-inline`/`unsafe-eval`** | `public/canonical-security.js` (qa/technische policy). Een HTML-callbackpagina met `script-src 'unsafe-inline'` in `backend/index.ts:321`. CSP staat nu alleen in een meta-tag. | De technische host verdwijnt, en daarmee de qa-policy. De CSP komt als **HTTP-header** vanuit de Node-server: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob: https://*.googleusercontent.com; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'`. `'wasm-unsafe-eval'` is nodig omdat sql.js, h5wasm en pdf.js WebAssembly gebruiken. Testen. De callbackpagina krijgt een per-request `nonce` of een sha256-hash. De meta-tag blijft eventueel als tweede laag, zonder AppDeploy-hosts. De overige headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP) komen ook op statische responses. |
| 6 | **DOMPurify ontbreekt** | `src/MailOpgemaaktDocumentVoorbeeld.tsx:1` `dangerouslySetInnerHTML={{__html:content.html}}`. Daarnaast nakijken: `src/mail-document-inhoud.ts` en `src/mail-docx-kopie.ts` (`template.innerHTML`, inert maar de output wordt gerenderd). | `dompurify` toevoegen. `DOMPurify.sanitize(html,{USE_PROFILES:{html:true}, FORBID_TAGS:['style','form','input','iframe','object','embed'], FORBID_ATTR:['style'], ALLOW_DATA_ATTR:false})` en een hook die externe `src`/`href` blokkeert of herschrijft. Eén helper `sanitizeHtml()` gebruiken op alle plaatsen. |
| 7 | **TOTP-geheimen in plaintext. Herstelcodes HMAC'd met een vaste sleutel** | `backend/toegangslaag.ts:30` (`createHmac('sha256','mij-prostir-access-v1')`). TOTP-record `identity_totp_v1.secret` (base32, gebruikt op r. 216 en 409). | TOTP-geheim versleutelen met AES-256-GCM (`IDENTITY_TOTP_ENCRYPTION_KEY_V1`, AAD = userId). Herstelcodes: HMAC-SHA256 met `IDENTITY_RECOVERY_PEPPER_V1` (of scrypt), eenmalig gebruik. Omdat we schoon beginnen, is er geen datamigratie nodig. Iedereen stelt TOTP opnieuw in. |
| 8 | **Hardcoded eigenaar** | `backend/index.ts:30` `OWNER`, `backend/rbac.ts:8` `OWNER_EMAIL` | Komt uit env `OWNER_EMAIL`, en bij voorkeur ook `OWNER_GOOGLE_SUB` (de stabiele Google-`sub`, sterker dan e-mail). Een check bij het opstarten: zonder deze waarden start de server niet. Los daarvan het Google-account beveiligen (zie SECURITY-NOTES). |
| 9 | Override van secrets via de database in google-contour | `backend/google-contour.ts:162–163` (`mutable.readSecret=...`) | Verwijderen. Secrets komen alleen uit env. De UI-tekst over "contour"-opslag aanpassen. |
| 10 | Handoff redeem is list-then-delete (race) en login-CSRF via `?handoff=` | `backend/eigenaar-sessie-overdracht.ts:48` (`POST /api/owner/session/handoff/redeem`) | Atomisch: `DELETE FROM app.records WHERE tbl='service_handoffs' AND data @> {...} RETURNING data` (via `db.takeOne`). Het handoff-token wordt gebonden aan een browser-nonce of -cookie die bij het aanmaken gezet is, en de redeem vraagt een POST met Origin-check. |
| 11 | DNS-rebinding TOCTOU in de SSRF-guard voor remote images | `backend/google-suite-mail-browser.ts:26` (`publicHttpsTarget` doet `lookup()` en daarna `fetch()`) | Een `undici` `Agent` met een eigen `connect.lookup` die het geresolvede publieke IP vastpint en private ranges weigert bij het connecten. Geen redirects volgen (of elke hop opnieuw valideren). Limieten op grootte en tijd. |
| 12 | Ongebruikte `/api/subscriptions` en realtime-code | `backend/realtime*.ts` | Verwijderen. |
| 13 | QA-fixtures en technische host | `OWNER_QA_FIXTURES_ENABLED=false` (index.ts), `src/OwnerTestApp.tsx`, `internal.appdeploy.runtime` in de self-test | In productie uit laten. Eventueel alleen in development via `NODE_ENV!=='production' && QA_FIXTURES=1`, nooit via de Host-header. |
| 14 | Pre-existing: WebAuthn zonder verificatie | `backend/toegangslaag.ts:366–390` | Uitzetten in de UI of echt implementeren (challenge server-side opslaan, attestation en assertion verifiëren). |

---

## 6. Build- en teststatus nu (getest op deze box, in een schone kopie in /tmp)

| Stap | Resultaat |
|---|---|
| `npm ci` | **Faalt meteen:** `EUSAGE: The npm ci command can only install with an existing package-lock.json`. Er is geen lockfile in de repo. |
| `npm install` | Lukt (284 pakketten). Waarschuwingen: `file-type@22` en `pdfjs-dist@6` vragen Node ≥22 (de box heeft Node 20.19). Met Node 24.21/npm 11.21 (via `npx -p node@24`) gaat het ook goed, maar npm 11 meldt dat de install-scripts van `esbuild` en `tesseract.js` nog niet goedgekeurd zijn (`npm install-scripts approve`). |
| `npm run build` (Node 20 en Node 24) | De audits slagen. L002 meldt 2 diagnostische punten die niet blokkeren: `b4-important-free:src/mail-zijbalk-navigatie.css` en `test-suite-current-generation-count`. Daarna **faalt Vite:** `[vite]: Rollup failed to resolve import "@appdeploy/client" from "src/App.tsx"`. **Het pakket staat niet eens in `package.json`**: het werd door AppDeploy geïnjecteerd. |
| Build met een tijdelijke stub voor `@appdeploy/client` | **Slaagt** (`✓ built in 29.64s`). Er zijn grote chunks (o.a. `hdf5_hl` 4,8 MB, `officeparser` 2,7 MB, de hoofdchunk 2,9 MB). Werkt, maar code-splitting is een optionele verbetering. |
| `tsc` backend (met type-stubs van de SDK) | 15 type-fouten die **niets met de SDK te maken hebben** (bijv. `toegangslaag.ts:52/56` "Expected 3 arguments, but got 4", `index.ts:241` een vergelijking met `'owner'`, en `mail-search.ts:1`). AppDeploy deed blijkbaar geen typecheck. Het esbuild-bundelen werkt wel. |
| `tsc -p tsconfig.json` (frontend, met stubs) | 219 bestaande type-fouten in 58 bestanden (strict, ongebruikte variabelen, ...). Dit blokkeert de Vite-build niet. Opruimen staat los van de port. |
| Tests | Er is geen testrunner. `tests/tests.txt` bevat 10 handmatige/E2E-scenario's (in AppDeploy-QA-formaat). |

Conclusie: wat door de SDK faalt, is alleen de import-resolutie (`@appdeploy/client` in de frontend, `@appdeploy/sdk` in de backend). De rest van de build werkt.

---

## 7. Omvang, stappenplan en testaanpak

### 7.1 Omvang
* **Mechanisch:** 61 import-regels (28 backend, 33 frontend).
* **Inhoudelijk te wijzigen:** ±15 bestaande bestanden: `backend/index.ts`, `toegangslaag.ts`, `eigenaar-sessie-overdracht.ts`, `google-contour.ts`, `api-platform-kluis.ts`, `mail-platform.ts`, `mail-microsoft.ts`, `google-suite-inrichting.ts`, `google-suite-mail-browser.ts`, `rbac.ts`, `deployment-identity.ts`, `public/canonical-security.js`, `public/canonical-service.js`, `src/MailOpgemaaktDocumentVoorbeeld.tsx`, `vite.config.ts`, `package.json` en `scripts/beveiliging-bouw.mjs`/`l002-audit.mjs`.
* **Nieuw:** ±15 bestanden: `server/platform/{db,storage,secrets,router,invites,ai,ratelimit,config}.ts`, `server/main.ts`, `server/cron.ts`, `src/platform/client.ts`, `migrations/0001_basis.sql` plus een runner, `deploy/` (systemd-units, cloudflared-voorbeeld, env-sjabloon) en tests.
* **Verwijderen:** `backend/realtime.ts`, `backend/realtime-subscribers.ts`, `cron.json` (vervangen door timers).

| Werkpakket | Inschatting |
|---|---|
| HTTP-server + router-compat + statische bestanden + host-allow-list + headers + healthcheck | 2 d |
| db-shim op Postgres + migratierunner + unit-tests tegen echte PG | 1,5–2 d |
| storage-shim (fs) + tests | 0,5 d |
| secrets (env) + config-validatie bij opstarten | 0,5 d |
| invites + client-helpers (`api`, `image`, `invitesClient`) | 1 d |
| ai-adapter (1 provider) of netjes uitschakelen | 0,5–1 d |
| cron-CLI + systemd-timers | 0,5 d |
| Domeinen/cookies/technische host centraliseren, self-tests bijwerken | 1,5 d |
| Beveiligingspunten 1–11 (§5) | 4–5 d |
| Deploy-artefacten (systemd, cloudflared, env, back-up met pg_dump + uploads) | 1 d |
| Lokaal testen en E2E (de 10 scenario's) en fixes | 2–3 d |
| **Totaal** | **±14–19 werkdagen** (3–4 weken voor één ontwikkelaar) |
| (Optioneel, fase 2) relationeel schema voor mail/sessies | +2–4 weken |

### 7.2 Stappen (in deze volgorde)
1. **Lockfile en toolchain:** een `engines`-veld toevoegen (`node >=24`). Op Node 24/npm 11 `npm install` draaien en `package-lock.json` committen. Install-scripts goedkeuren (esbuild). Zo werkt `npm ci` weer.
2. **Build hygiënisch maken:** `beveiliging-bouw.mjs` schrijft naar een build-map, `vite.config.ts` zonder `APPDEPLOY_*` en met `base:'/'`.
3. **Client-shim** `src/platform/client.ts` plus een alias. Daarmee bouwt de frontend.
4. **Server-skelet:** `server/main.ts` (node:http, body-limiet, eventbouw, Host-validatie, Origin-check, security-headers, statische `dist/` met SPA-fallback, `/api/_healthcheck`). `router/json/error` met dezelfde semantiek.
5. **Platform-shims:** `db` (Postgres JSONB), `storage` (fs), `secrets` (env), `invites`, `ai`. Migratie `0001_basis.sql` plus een runner (`node dist-server/migrate.mjs`).
6. **Backend-imports** omzetten naar de alias. Bundelen met esbuild (`--platform=node --format=esm --target=node24 --packages=external`) naar `dist-server/server.mjs`, `cron.mjs` en `migrate.mjs`.
7. **Opruimen:** realtime-code weg, technische host en QA-fixtures weg, `deployment-identity.ts` wordt de bron van domeinen en cookienamen (configureerbaar via `PUBLIC_DOMAIN`), en de cookies krijgen nieuwe attributen.
8. **Beveiligingspunten** uit §5, in volgorde van ernst: 4 (Host), 3 (CSRF), 1 (rate limit), 2 (PKCE), 8 (eigenaar), 9 (contour), 7 (TOTP), 6 (DOMPurify), 5 (CSP), 10 (handoff), 11 (SSRF).
9. **Cron** omzetten naar CLI en timers, met daarbij een TTL-opruimjob voor de dynamische tabellen, `rate_limits` en verlopen sessies.
10. **Lokaal testen** (§7.3).
11. **Deploy op de VM** (§8). Eerst alleen `hub` en `id` via de tunnel, dan de overige hosts.
12. **Nieuwe OAuth-clients en secrets** instellen, dan opnieuw koppelen (Google, Microsoft, vault). Daarna de AppDeploy-app uitzetten en de AppDeploy-sleutels intrekken.

### 7.3 Lokaal testen op deze box (later, nu niets geïnstalleerd)
* **Node 24:** `npx -y -p node@24 -p npm@11 ...` (al getest, werkt) of nvm.
* **Postgres 17:** `docker run --rm -e POSTGRES_USER=mijnruimte -e POSTGRES_PASSWORD=... -e POSTGRES_DB=mijnruimte -p 127.0.0.1:55432:5432 postgres:17` als Docker beschikbaar is. Anders `apt install postgresql-17` via PGDG. Daarna `node dist-server/migrate.mjs`.
* **Hostnamen:** gebruik `PUBLIC_DOMAIN=localhost` met `hub.localhost`, `id.localhost`, ... (Chromium resolvet `*.localhost` naar loopback, en dat geldt als secure context, dus `Secure`-cookies werken). Alternatief: `--host-resolver-rules="MAP *.tarasevych.com 127.0.0.1"` met een lokale TLS-proxy (Caddy met een interne CA).
* **Tests:**
  * Unit-tests (vitest) voor de db-shim tegen echte PG, met name semantiek van `add/get/list/update/delete`, filters, paginering, limieten en het weigeren van ongeldige ID's.
  * Storage-padvalidatie (path traversal).
  * Router: params en foutvormen.
  * Rate limiter en Origin-check.
* **Smoke-test:** `curl -H 'Host: hub.localhost' http://127.0.0.1:8080/api/_healthcheck`, plus negatieve tests: een vreemde `Host` geeft 421, een POST zonder of met een vreemde `Origin` geeft 403, en `x-forwarded-host` wordt genegeerd.
* **E2E:** de 10 scenario's uit `tests/tests.txt` met Playwright (desktop 1280×800 en mobiel 375×667). OAuth-flows kunnen alleen echt getest worden met een test-OAuth-client die ook `http://id.localhost:8080/` als redirect heeft. Anders testen we tegen de staging-VM.

---

## 8. Deploy op de VM (concept)

**Layout:** `/srv/mijn-ruimte/releases/<git-sha>/` (met `dist/`, `dist-server/`, `node_modules` via `npm ci --omit=dev`) en een symlink `/srv/mijn-ruimte/current`.

`/etc/systemd/system/mijn-ruimte.service`:
```ini
[Unit]
Description=Мій простір (mijn-ruimte) web-app
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=mijnruimte
Group=mijnruimte
WorkingDirectory=/srv/mijn-ruimte/current
EnvironmentFile=/etc/mijn-ruimte/geheimen.env
Environment=NODE_ENV=production HOST=127.0.0.1 PORT=8080 UPLOADS_DIR=/srv/data/uploads
ExecStart=/usr/bin/node dist-server/server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ReadWritePaths=/srv/data/uploads
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
LockPersonality=yes
MemoryMax=1500M

[Install]
WantedBy=multi-user.target
```
(Controleer het pad van `node` op de VM met `command -v node`.)

Cron: `mijn-ruimte-cron@.service` (`Type=oneshot`, `ExecStart=/usr/bin/node dist-server/cron.mjs %i`, met dezelfde hardening) plus de timers `mijn-ruimte-cron@mail-maintenance.timer` en `mijn-ruimte-cron@google-suite-sync.timer` met `OnCalendar=*:0/5` en `RandomizedDelaySec=30`. Daarnaast een dagelijkse timer voor `cleanup` (TTL).

cloudflared (`/etc/cloudflared/config.yml`):
```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /etc/cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: hub.tarasevych.com
    service: http://127.0.0.1:8080
  - hostname: id.tarasevych.com
    service: http://127.0.0.1:8080
  # mail/cloud/ai/admin/api/... naar dezelfde service zodra ze nodig zijn
  - service: http_status:404
```
Geen `httpHostHeader`/`originServerName` overschrijven: de app heeft de originele `Host` nodig.
De webhooks (`/api/owner/mail/microsoft/webhook`, `/api/owner/mail/google/pubsub/push`) en de OAuth-callback (`https://id.tarasevych.com/`) moeten publiek bereikbaar blijven. Bij gebruik van Cloudflare Access hiervoor bypass-regels maken.

**Back-ups:** een dagelijkse `pg_dump -Fc mijnruimte` en een kopie van `/srv/data/uploads` (bijv. restic), allebei versleuteld en buiten de VM bewaard. Het herstel testen.

---

## 9. Beslissingen voor de eigenaar

1. **Hostnamen.** De code kent 9 diensten: `hub`, `id`, `mail`, `cloud`, `ai`, `github`, `huis`, `api` en `admin`. **`dashboard` bestaat niet in de code.** Minimaal nodig zijn `hub` en `id` (de OAuth-redirect is `https://id.tarasevych.com/`). Is `dashboard` een alias voor `hub`, een hernoemde `admin`, of iets nieuws? Welke hosts zetten we in de eerste release in de tunnel?
2. **Gedeelde sessie over subdomeinen:** een cookie met `Domain=tarasevych.com` (aanbevolen, gelijk aan het huidige gedrag) of per host plus handoff. Bij `Domain=` krijgt **elk** subdomein van tarasevych.com de cookie. Zijn er subdomeinen die door anderen of door derde partijen gehost worden?
3. **Data:** schoon beginnen (aanbevolen) of een eenmalige export via een tijdelijk endpoint op AppDeploy (§3.3).
4. **AI-functies** (cloud-metadata, mailvertaling, handschrift-OCR): welke provider en API-sleutel (OpenAI, Anthropic, Gemini, xAI of lokaal met Ollama/Tesseract), of voorlopig uitzetten?
5. **Google OAuth:** een nieuwe client aanmaken. De Gmail- en Drive-scopes zijn *restricted*. In de status "Testing" van een External-app verlopen refresh-tokens na 7 dagen. Dus: de app "In production" zetten (verificatie of security-assessment voor restricted scopes), of een Workspace-"Internal"-app gebruiken als er een Workspace-domein is. Dit bepaalt of de mailsync stabiel blijft.
6. **Microsoft Graph (Outlook):** nodig in de eerste release? Zo ja, dan een nieuwe client secret en een publieke webhook-URL.
7. **Cron:** systemd-timers (aanbevolen) of in-process.
8. **Passkeys (WebAuthn):** voorlopig uitzetten (aanbevolen) of goed implementeren.
9. **Fase 2** (relationeel schema voor mail) nu of later.
10. **Cloudflare Access** voor `admin.`/`api.` als extra laag (met bypass voor webhooks en callbacks)?

## 10. Voortgang

### 10.1 Fase A: afgerond (3 okt 2026, branch `zelf-hosten`, niet gepusht, niet gedeployd)

Beslissingen van de eigenaar die zijn toegepast:
1. **Schone database.** Geen migratie van AppDeploy-data en geen export-endpoint.
2. **AI staat uit.**
   - `ai.extract`/`ai.ocr`/`ai.generate` gooien `AI_NOT_CONFIGURED` (503).
   - Cloud valt terug op de ingebouwde deterministische suggesties (`aiState=fallback`, `CLOUD_AI_FALLBACK`).
   - Vertalen geeft 503 `AI_NOT_CONFIGURED`. Handschrift-OCR blijft 503 `MAIL_HANDWRITING_OCR_UNAVAILABLE`.
3. **Dashboard.**
   - De server serveert `DASHBOARD_DIR` (standaard `/srv/mijn-ruimte/dashboard`) voor `dashboard.tarasevych.com`.
   - Ontbreekt de map, dan geeft hij 404. Er is daar geen API.
   - Nog niet geïntegreerd. Het herstelde materiaal staat buiten de repo (`/workspace/dashboard-patch/`, `qa.html`, `qa-id.html`).
4. **Google alleen via env.**
   - De hardcoded client-ID en de database-override van secrets zijn weg.
   - Zonder `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` geldt `configured:false` en is er geen crash.
   - Microsoft/Outlook is uit zolang de env ontbreekt.
5. **Eén aanmelding voor alle `*.tarasevych.com`-subdomeinen.**
   - Cookies: `Domain=.tarasevych.com; Path=/; Secure; HttpOnly; SameSite=Lax` (tab-cookies `Strict`).
   - Geen `SameSite=None`/`Partitioned` meer. De API is same-origin per host (`/api/*`).
   - Multi-user en multi-account (ecosysteemsessie, tab-sessies, browser-grants, account wisselen) zijn ongewijzigd. Alle cookies delen één jar, net als vroeger op de ene API-host.

Wat er nu is:
- **Platformlaag** (`server/platform/`):
  - `db` op Postgres-JSONB (`app.records`).
  - `storage` op lokaal FS (`UPLOADS_DIR`, strikte padcontrole, atomisch schrijven).
  - `secrets` uit env (allow-list), `ai` (uit), `invites`, `router/json/error`.
- **Migraties:** `migrations/0001_basis.sql` plus de runner `server/migrate.ts` (advisory lock, transactie per bestand).
- **Frontend-laag:** `src/platform/client.ts` (same-origin `api`, `image.resizeIfNeeded`, `invitesClient`).
- **Server** `server/start.ts` (`node:http`, `127.0.0.1:PORT`):
  - Host-allow-list: 421 voor onbekende hosts.
  - Gezondheidscheck `/__gezondheid` (inclusief DB).
  - Lambda-achtig event voor de bestaande router.
  - Client-IP alleen uit `cf-connecting-ip`. `x-forwarded-*`, `forwarded` en `x-real-ip` worden genegeerd of overschreven.
  - `dist/` met SPA-fallback, ETag/304 en immutable assets.
  - CSP als HTTP-header (gelijk aan de meta-CSP, plus `frame-ancestors 'none'`), HSTS, nosniff, Referrer-Policy, X-Frame-Options en Permissions-Policy.
  - Body-limiet 12 MB, nette shutdown.
- **Cron:** `server/cron.ts`, CLI voor `mail-provider-maintenance` en `google-suite-bplus-sync`. Voor systemd-timers, met `pg_try_advisory_lock` en logging naar `app.cron_runs`.
- **Build:**
  - `security-build` als Vite-plugin, zodat de werkboom niet meer wordt herschreven.
  - `npm run build` = audits + Vite + `dist-server/*.mjs` (esbuild).
  - `package-lock.json` is gegenereerd (Node 24).

Rooktests op deze box (Postgres 17.11, Node 24.21):
- **curl:**
  - `/__gezondheid` → `{"ok":true,"db":true}`; `/api/_healthcheck` → 200.
  - hub/id/cloud laden 200 met CSP-header. SPA-fallback werkt; een ontbrekend asset geeft 404. Assets: immutable + ETag/304.
  - Onbekende host → 421. `X-Forwarded-Host` vervalsen → 421. Padtraversal → index/404, nooit bestanden buiten `dist/`.
  - Dashboard: 404 zonder map, 200 met map (eigen CSP). `/api/*` op het dashboard → 404.
- **`scripts/rooktest-lokaal.mjs`** (22/22):
  - Afgemelde bootstrap; wis-cookie met `Domain=.tarasevych.com` en `SameSite=Lax`, zonder `Partitioned`.
  - Eén gezaaide sessie is geldig op hub, cloud, mail en id. Een service die niet bij de host past → 401.
  - Accountlijst (multi-account) antwoordt. Sessie-IP = `cf-connecting-ip`.
  - Werkruimte maken; de rij staat in `app.records`.
  - Bestand uploaden en downloaden levert identieke bytes, met de `storage_objects`-rij en het bestand op schijf. Zoeken vindt het item.
  - Een tweede gebruiker ziet de items van de eigenaar niet.
  - Wachtwoordverificatie: juist → ok, fout → 401.
  - Google zonder env: `configured:false`, geen 500.
- **`scripts/lokaal-e2e/`** (Playwright met Chrome via een https-testproxy, zoals de tunnel), 6/6:
  - `tests.txt` test 1: afgemelde shell op hub/id is niet leeg.
  - `tests.txt` test 3: aangemelde Hub toont "Огляд" met inhoud; cloud werkt ook.
  - De cookie geldt ook voor mail. Geen CSP-schendingen.
- **Migraties:** opnieuw draaien is idempotent.
- **Cron:**
  - Beide taken: ok.
  - Een tweede gelijktijdige run wordt overgeslagen (lock).
  - Een onbekende taak geeft exitcode 2.

Bekende beperkingen:
- Inloggen kan nu alleen met een in de database gezaaide sessie of na het instellen van een Google-client.
- Wachtwoordlogin verifieert wel, maar geeft (zoals in de bestaande code) geen sessie uit.

### 10.2 AppDeploy v30–v56 samengevoegd (commit `142f625`)
- Patch `appdeploy-v31-v56.patch` (basis v29) met `git apply --3way`; `@appdeploy/client` → `./platform/client`.
- Overgenomen: mail-compose (resizable, concept), relatieve datums, bijlagevoorbeelden, sidebar/topbar,
  contrast licht thema, fix `use-external-rect`, handoff-wachttijd 12 s met herhaling, redirect-allow-list.
- **Bewust weggelaten:** alle v54–v56-wijzigingen die Google-login naar de AppDeploy-host
  (`migrated-bg2v4h.v2.appdeploy.ai`) terugstuurden. Callback blijft `https://id.tarasevych.com/`, doel na login
  `hub.tarasevych.com`; de AppDeploy-origin staat nergens meer in de allow-list.

### 10.3 Besluiten eigenaar op de open vragen (commits `1287f21`, `cd9712e`)
1. `l002-diagnostic.json` niet publiceren: audit schrijft naar `rapporten/` (gitignored); server geeft 404 op dat pad, `*.map` en dotfiles.
2. `Domain=.tarasevych.com` bevestigd (alle subdomeinen zijn van de eigenaar).
3. `'wasm-unsafe-eval'` toegestaan in `script-src` (header en meta), `'unsafe-eval'` niet.
4. Technische AppDeploy-host, OwnerTestApp, QA-fixtures en integratielabs verwijderd; l002-audit en `tests/tests.txt` aangepast.

### 10.4 Fase B beveiliging: afgerond (commit `8a2d63f`)
Alle punten uit §5 zijn opgelost; details en status per punt in `SECURITY-NOTES.md` §3, env-vars in `ENV-VARS.md`.
Passkeys zijn **uitgeschakeld** (niet geïmplementeerd) tot er echte WebAuthn-verificatie is.
Tests: rooktest 42/42, eenheidstests 12/12 (`scripts/eenheidstests.mjs`), browsertest 7/7
(`scripts/lokaal-e2e/test-alles.sh` draait alles). Servertypecheck: 74 bestaande meldingen (was 77), frontend 222 (was 224).

### 10.5 Deploy-artefacten (map `deploy/`, niet uitgerold)
`mijn-ruimte.service`, `mijn-ruimte-cron@.service` + timers (mail-onderhoud, google-sync, opruimen),
`mijn-ruimte-backup.service/.timer` + `backup-maken.sh` (pull-model), `cloudflared-config.yml`,
`installeer-app.sh` (inrichten / installeren met automatische rollback / terugdraaien / lijst). Zie `deploy/LEESMIJ.md`.

### 10.6 Laatste theoretische risico's gesloten (commit `0160a0b`)
Handoff gebonden aan de aanmakende browser (`tsv_handoff_binding`), herstelcode atomisch verbruikt (`db.takeArrayValue`).
Zie `SECURITY-NOTES.md` §3 (punten 14 en 15). Tests: rooktest 47/47, eenheidstests 19/19, browsertest 10/10.

### 10.7 Eerste uitrol op de VM (3 okt 2026, commit `0b32ecd`, release `20261003-115704`)
VM `mijn-ruimte-webserver` (10.77.0.10): `installeer-app.sh inrichten` + `installeren`, geheimen op de VM gegenereerd
(`geheimen-aanvullen.sh`), dashboard in `/srv/mijn-ruimte/dashboard`, dienst + vier timers actief, back-up getest
(incl. proefherstel). Alleen `127.0.0.1:8080` nieuw; ufw ongewijzigd. Tijdens de uitrol gevonden en opgelost:
vite-build OOM op 2 GB RAM (build nu in een cgroup met geheugenplafond), zelfverwijzende `current`-symlink bij de
eerste installatie, en de server die via de symlink `current/` stil niet startte (isMain met realpath).
Cloudflare Tunnel: alleen `/etc/cloudflared/config.yml` met plaatshouder; nog geen tunnel/DNS (zie `deploy/LEESMIJ.md`).

### 10.8 Cloudflare Tunnel live (3 okt 2026, ~12:16)
Tunnel `mijn-ruimte` (`a176c08b-29e7-47b0-95d9-9ec9383572f2`), 10 nieuwe CNAME's, gehardende `cloudflared.service`,
4 verbindingen (ams/bru). Alle tien hosts geven extern 200; `cert.pem` geshred. Credentials-JSON nog zonder back-up.

### 10.9 Versleutelde back-ups met age (3 okt 2026, ~12:40)
Publieke-sleutelmodel: één X25519-sleutelpaar, op de pc gemaakt; de privésleutel staat alleen in
`R:\mijn-ruimte-reservekopie\sleutels\herstelsleutel-age.txt` (ACL alleen gebruiker t), de VM heeft alleen
`/etc/mijn-ruimte/backup-ontvanger.age.pub`. `backup-maken.sh` stuurt `pg_dump` en de uploads-tar rechtstreeks door
`age -R` (release 20261003-123345, commit c4429df); de VM kan zijn back-ups niet ontsleutelen. Versleuteld
geheimenarchief (`geheimen.env` + tunnel-credentials) op R:\; proefontsleuteling en proefherstel (via een
`cmd /c`-pijp van de pc naar een tijdelijke database) geslaagd. `deploy/reservekopie-ophalen.ps1` haalt de
nieuwste back-up op naar R:\; `deploy/HERSTEL.md` is het noodplan. Uitleg per map (Oekraïens + Nederlands):
`deploy/pc-uitleg/`.

### 10.10 Nog open
- Offline kopie van de herstelsleutel (USB/papier); geplande taak voor het ophalen; Cloudflare: Always Use HTTPS aanzetten.
- Oude onversleutelde test-back-ups 20261003-115845/-115908 op de VM (verdwijnen na 7 dagen vanzelf).
- Nieuwe Google OAuth-client (redirect `https://id.tarasevych.com/`).
- Echte WebAuthn-implementatie; AI-provider; dashboardintegratie.
- l002-audit: `b4-important-free` in twee AppDeploy-CSS-bestanden (v56), cosmetisch.
