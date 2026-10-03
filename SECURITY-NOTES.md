# Beveiligingsnotities

Uitgangspunt: een aanvaller kent de volledige broncode en alle oude (AppDeploy-)geheimen.
**Roteer alles uit ENV-VARS.md vóór de eerste productiestart.**

## 1. Statische audit (2026-10-02, op de AppDeploy-code)
1. KRITIEK: `POST /api/owner/security/session-fixture` maakte zonder authenticatie een eigenaarssessie (`qaSynthetic`).
2. KRITIEK: `/api/owner/google-contour/reveal` gaf het Google-clientgeheim en de grant-sleutel in leesbare vorm terug.
3. HOOG: `wrapKey` (google-contour) leidde een sleutel af uit het OAuth-clientgeheim.
4. HOOG: de kluissleutel viel terug op andere sleutels en clientgeheimen.
5. MIDDEL: `MailComposeEditor.parseValue` gebruikte `innerHTML` op een live element.

Alle vijf zijn opgelost (eerst achter vlaggen, in de zelf-gehoste versie zijn de routes en code volledig verwijderd, zie §2).

## 2. Zelf-gehoste versie: opgelost in fase A en de opruimstap
- Geen AppDeploy-platform meer: eigen Node-server (`server/start.ts`) achter Cloudflare Tunnel, luistert alleen op 127.0.0.1.
- Alleen bekende hostnamen; `x-forwarded-host`, `forwarded` en `x-real-ip` van de client worden verwijderd; client-IP alleen uit `cf-connecting-ip`.
- Cookies: `Domain=.tarasevych.com; Secure; HttpOnly; SameSite=Lax` (geen `SameSite=None`/`Partitioned`). Bevestigd door de eigenaar: alle subdomeinen zijn van hem.
- CSP als HTTP-header: `script-src 'self' 'wasm-unsafe-eval'` (nodig voor sql.js, h5wasm en pdf.js; **geen** `'unsafe-eval'`, geen `'unsafe-inline'` voor scripts), `frame-ancestors 'none'`, HSTS, nosniff.
- `l002-diagnostic.json`, `*.map` en dotfiles worden nooit geserveerd (404), ook niet als ze in `dist/` belanden.
- Verwijderd: de technische AppDeploy-host (`TECH_ORIGIN`), OwnerTestApp, QA-fixtures, integratielabs, `session-fixture`, `self-test`, de technische finalize-route en het QA-CSP-beleid met `'unsafe-inline' 'unsafe-eval'`.
- Google-login keert altijd terug naar `https://id.tarasevych.com/`; na het inloggen naar `hub.tarasevych.com`. Redirect-allow-list bevat alleen `*.tarasevych.com`.
- Google-contour (client-ID/geheim) komt uitsluitend uit env; databasewaarden worden genegeerd.

## 3. Fase B (deze stap): status per punt

| # | Punt | Status | Waar | Test |
|---|---|---|---|---|
| 1 | Rate limiting + lockout | **Opgelost.** Algemeen 600 verzoeken/min/IP (geheugen). Strikt per IP/min in Postgres (`app.rate_limits`): wachtwoordlogin 10, TOTP/herstel 10, Google-start 10, login-transacties 20, overige aanmeld-/handoffpaden 120. Lockout per account (`app.login_lockouts`): na 5 fouten 15 min, daarna verdubbelend tot 24 u; geldt ook voor onbekende adressen (geen enumeratie via gedrag). | `server/start.ts`, `server/platform/beveiliging.ts`, `backend/access-plane.ts` | rooktest B2, B3; eenheidstest lockout |
| 2 | Willekeurige PKCE-verifier + nonce | **Opgelost.** `randomBytes(32)` per start, server-side bewaard in `oauth_pkce_v1` (sleutel = hash van doel+state), bij de callback atomisch en eenmalig opgehaald. Geldt voor eigenaar-Google-login, Google Suite en Microsoft-mail; de losse Google-mail-callback eist het ook (die start loopt nu via Google Suite). De oude HMAC-afleiding blijft alleen voor de zelftests. | `backend/oauth-pkce.ts`, `index.ts`, `google-suite-onboarding.ts`, `mail-microsoft.ts` | eenheidstest PKCE (4) |
| 3 | CSRF: Origin-allow-list | **Opgelost.** Elke niet-GET/HEAD/OPTIONS naar `/api/*` met Origin moet een eigen `https://<dienst>.tarasevych.com` zijn (anders 403 `CSRF_ORIGIN_DENIED`). Zonder Origin mag alleen een verzoek **zonder** cookies door (webhooks van Google/Microsoft); met cookie → 403 `CSRF_ORIGIN_REQUIRED`. | `server/start.ts` | rooktest B1 (4) |
| 4 | TOTP-versleuteling + pepper voor herstelcodes | **Opgelost.** TOTP-geheim AES-256-GCM met `TOTP_ENCRYPTION_KEY_V1`, AAD = gebruikers-id (`secretEnc`, geen leesbaar `secret`). Oude leesbare records worden bij het eerste gebruik automatisch versleuteld. Herstelcodes: HMAC-SHA256 met `RECOVERY_CODE_PEPPER` (`hashVersion: 2`), 12 hex-tekens (48 bit) i.p.v. 10. Ontbreekt sleutel/pepper → 503, nooit een stille terugval. | `backend/access-plane.ts`, `server/platform/beveiliging.ts` | rooktest B4 (4); eenheidstest envelop/pepper (3) |
| 5 | Eigenaar uit env | **Opgelost.** `OWNER_EMAIL` vervangt het hardgecodeerde adres in `index.ts` en `rbac.ts`. Leeg = niemand is eigenaar; de server weigert te starten zonder. | `server/platform/beveiliging.ts`, `server/start.ts` | rooktest B5 |
| 6 | Kluis zonder localhost-uitzondering | **Opgelost.** Onthullen alleen op `admin.` en `api.tarasevych.com`, alleen op basis van de echte Host-header; geen localhost/127.0.0.1/technische host. Google-sleutelkaart idem (alleen `https://admin.tarasevych.com`). | `backend/api-platform-vault.ts`, `backend/google-contour.ts` | rooktest B6 |
| 7 | Passkeys uit tot echte WebAuthn-verificatie | **Opgelost (uitgeschakeld).** De oude routes registreerden een `credentialId` zonder enige cryptografische controle. Nu: `webauthn/options` en `webauthn/register` → 503 `ACCESS_WEBAUTHN_DISABLED`; factor altijd `enabled:false`; beleid kan het niet aanzetten; kaart verborgen in de UI (`PASSKEYS_ENABLED=false`). `webauthn/remove` blijft om oude onverifieerde registraties te kunnen wissen. WebAuthn zelf is **niet** geïmplementeerd. | `backend/access-plane.ts`, `src/access-plane-panels.tsx`, `src/AccessPlaneView.tsx` | rooktest B7 |
| 8 | Atomische eenmalige sessie-handoff | **Opgelost.** Alle vier inwisselroutes gebruiken `db.takeOne` (één `DELETE … RETURNING` met `FOR UPDATE SKIP LOCKED`). De service volgt uit de host; een afwijkende `body.service` wordt geweigerd. Een browser met een sessie van een **ander** account wisselt geen handoff in (409) — beperkt login-CSRF via `?handoff=`. Geblokkeerde gebruikers krijgen geen sessie. | `backend/owner-session-handoff.ts`, `backend/index.ts` | rooktest B8 (3 gelijktijdig → precies 1 succes) |
| 9 | SSRF: DNS-pinning | **Opgelost.** Externe afbeeldingen in de mailreader en one-click-unsubscribe gaan via `pinnedFetch`: resolutie + controle gebeuren in de `lookup`-hook van de socket zelf, dus het gecontroleerde adres is het adres waarmee verbonden wordt (geen DNS-rebinding). Elk privé-, loopback-, link-local-, CGNAT-, multicast-, ULA- en documentatieadres wordt geweigerd; ook IP-literals. Alleen https, geen automatische redirects (elke redirect wordt opnieuw gecontroleerd), time-out en groottelimiet. | `backend/veilige-fetch.ts`, `backend/google-suite-mail-browser.ts` | eenheidstest SSRF (4) |
| 10 | DOMPurify in mailvoorbeeld | **Opgelost.** `MailRichDocumentPreview` (dat `dangerouslySetInnerHTML` gebruikt) saniteert met DOMPurify: geen scripts, formulieren, frames, `<style>`/`style`, alleen `data:image`/`blob:`-afbeeldingen en http(s)/mailto/tel-links (`rel=noopener noreferrer`). De HTML-body van mails gaat eerst door DOMPurify en daarna door de bestaande opschoning, en draait in een sandbox-iframe zonder `allow-scripts`. | `src/mail-html-sanitize.ts` | build + handmatige review (DOMPurify heeft een DOM nodig; geen jsdom in de testset) |
| 11 | CSP op de callbackpagina | **Opgelost.** Server-gegenereerde HTML (OAuth-callback, redirectpagina) krijgt `default-src 'none'` met `sha256`-hashes van precies de eigen inline `<script>`/`<style>`-blokken; geen `'unsafe-inline'`. De redirectpagina had eerder helemaal geen CSP. | `backend/index.ts` (`inlineHtmlCsp`) | rooktest B9 |
| 12 | 503 + rate limit op `/api/auth/google/start` | **Opgelost.** Zonder Google-client: 503 `GOOGLE_NOT_CONFIGURED`, geen state-rij. Rate limit 10/min/IP. | `backend/index.ts`, `server/start.ts` | rooktest B2 (2) |
| 13 | Opruimjob | **Opgelost.** Cron-taak `opruimen` (elk uur, minuut 17): verlopen OAuth-states, PKCE-materiaal, login-transacties, handoffs, broker-verzoeken, sessies, tab-sessies en browsergrants (na 24 u respijt), oude rate-limit-/lockout-rijen en cron-runs ouder dan 30 dagen. | `backend/opruimen.ts`, `cron.json`, `deploy/mijn-ruimte-opruimen.timer` | rooktest B10 (via `dist-server/cron.mjs opruimen`) |

Daarnaast: `ownerHost` en de handoff-`hostOf` vertrouwen `x-forwarded-host` niet meer (alleen `Host`).

### Fase B, vervolg: de twee resterende theoretische risico's (gesloten)

| # | Punt | Status | Waar | Test |
|---|---|---|---|---|
| 14 | Login-CSRF via ondergeschoven `?handoff=`-link | **Opgelost.** Elke handoff wordt gebonden aan de browser die hem aanmaakt: bij het aanmaken krijgt die browser een willekeurige cookie `tsv_handoff_binding` (32 bytes, `HttpOnly; Secure; SameSite=Strict; Domain=.tarasevych.com`, 30 dagen, hergebruikt zodat meerdere tabbladen werken). De handoff-rij bewaart alleen de SHA-256 ervan. Alle vijf aanmaakroutes zetten de cookie; alle vier inwisselroutes (`/api/owner/session/handoff/redeem`, `/api/service-handoff/consume`, `/api/service-handoff/consume-hub`, `/api/ecosystem/handoff/exchange`) eisen hem en nemen de hash op in het atomische `db.takeOne`-filter. Een andere browser (zonder of met een andere cookie) krijgt 401 en verbruikt de code niet. Gekozen boven "same-site navigatie + bevestiging": Sec-Fetch-/Referer-signalen zijn bij een gewone link niet betrouwbaar te onderscheiden en een bevestigingsklik is te omzeilen met social engineering; een cookie die alleen de eigen browser heeft is dat niet. | `backend/handoff-binding.ts`, `backend/owner-session-handoff.ts`, `backend/index.ts` | rooktest B8/B8b, eenheidstest, Playwright Test 9 (vreemde browser 401 + code blijft; eigen browser 200) |
| 15 | Herstelcode dubbel gebruiken | **Opgelost.** Verbruik is één `UPDATE … WHERE data->'hashes' @> [hash] RETURNING id` (`db.takeArrayValue`): Postgres vergrendelt de rij, een gelijktijdige tweede poging ziet de nieuwe versie zonder de hash en wijzigt niets → `ACCESS_MFA_INVALID`. `remaining` wordt in hetzelfde statement bijgewerkt. | `server/platform/db.ts`, `backend/access-plane.ts` | rooktest B4 (4 gelijktijdige logins → precies 1× 200), eenheidstest (8 gelijktijdig → 1 winnaar) |

## 3b. Auth fase 1 (branch `auth-fase-1`, zie `docs/ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.md`)

| # | Punt | Status | Waar | Test |
|---|---|---|---|---|
| 16 | Stille samenvoeging op e-mailadres | **Opgelost.** Account alleen via (provider, subject). Zelfde e-mail met een ander Google-subject → nieuw apart account (`member`/`new`) + melding (alleen op id) en hint in `account_email_conflicts_v1` bij het bestaande account. Eigenaar mag eenmalig koppelen als zijn account nog geen identiteit heeft; een tweede account met `OWNER_EMAIL` wordt nooit eigenaar. `email_verified` opnieuw geëist na userinfo. | `backend/account-koppeling.ts`, `backend/index.ts` (`ensureUser`) | eenheidstest (aanmelden) |
| 17 | Login-CSRF in de Google-redirectflow | **Opgelost.** `transactions/create` zet per transactie `__Secure-tsv_aanmeld_binding_<16 hex transactiehash>` (HttpOnly, Secure, SameSite=Lax, Domain=.tarasevych.com, Max-Age 15 min); transactie bewaart SHA-256(transactiehash, tabhash, waarde); callback POST/GET vergelijkt tijdconstant en wist alleen die cookie; ontbrekende/oude hash = geweigerd (`LOGIN_BINDING_MISMATCH`). Parallelle aanmeldingen in meerdere tabbladen werken. | `backend/aanmeld-binding.ts`, `backend/index.ts` | eenheidstests (aanmelden, tabbladen), rooktest B8c |
| 18 | Verouderde aanmeld-/sessieroutes | **Verwijderd (410 Gone).** `/api/auth/google` (ID-token zonder nonce), `/api/auth/google/{start,code,status}`, `/api/auth/exchange`, `/api/auth/logout`, `/api/auth/broker/*`, `/api/service-handoff/*`, `/api/ecosystem/*`, `/api/identity/*`, `/api/service/*`, `/api/browser/accounts*`. Migratie `0002` verwijdert `google_sessions`, `service_sessions`, `browser_grants`, `google_auth_codes`, `auth_broker_requests`. Vervangt punt 12 en de legacy-inwisselroutes van punt 14. | `backend/index.ts`, `migrations/0002_verouderde_sessies_opruimen.sql` | rooktest B2 |
| 19 | "Overal afmelden" liet rijen staan | **Opgelost.** Alle pagina's sessies/tabs/grants (was: eerste 100), openstaande handoff-codes, afgeronde niet-ingewisselde transacties, oude tabellen. | `backend/index.ts` (`ownerAllesIntrekken`) | rooktest B8d |
| 20 | Rate limiter faalde open bij DB-fout | **Opgelost voor aanmeld-buckets** (wachtwoord, MFA, login-start, aanmelden): 429 met Retry-After 30 s. | `server/platform/beveiliging.ts`, `server/start.ts` | eenheidstest |
| 21 | `huis` ontbrak in `LOGIN_SERVICES` | **Opgelost.** | `src/redirect-login.ts` | — |
| 22 | Tweede aanmelding in een ander tabblad schakelde het eerste tabblad om | **Opgelost.** Een `login`-transactie die afrondt terwijl de browser al een geldige root-sessie heeft, maakt alleen een tab-overlay; de rootcookie wordt niet meer vervangen. | `backend/index.ts` (`ownerCompletePrimaryRedirect`, `redirect/finalize`) | eenheidstest (tabbladen, nagebootste Google) |
| 23 | E-mailgeadresseerde meldingen/uitnodigingen zichtbaar voor tweede account met zelfde e-mail | **Opgelost.** Alleen het oorspronkelijke account (eerste `users`-record met dat adres, niet als "nieuw" in `account_email_conflicts_v1`) ziet `recipientEmail`-meldingen en activeert `invited`-lidmaatschappen. | `backend/index.ts` (`isEmailEigenaar`, `emailMeldingen`, `activateInvites`) | eenheidstest (aanmelden) |

## 4. Nog open / bewust niet gedaan
- **WebAuthn/passkeys**: echte implementatie (attestation + assertion, bijv. `@simplewebauthn/server`) volgt later; tot dan uit.
- `b4-important-free` in `src/mail-sidebar-navigation.css` en `src/mail-thread-editor.css` (l002-audit): komt uit AppDeploy v56, geen beveiligingsprobleem.
- ~~De legacy popup-flow (`/api/auth/google/start` + `proof`) kan later weg.~~ Gedaan in auth fase 1 (punt 18).

## 5. Forensisch onderzoek (oude productiedatabase)
Zoek auditacties `owner.qa.synthetic-fixture.created`, `access.google-contour.reveal`, `access.user.reset-password`, `access.policy.save`, `owner.admin.user.*`;
sessies met `qaSynthetic:true` in `owner_service_sessions_v1`; onverwachte rijen in `credential_contours_v1`; onbekende gebruikers of `tsv_`-tokens.
