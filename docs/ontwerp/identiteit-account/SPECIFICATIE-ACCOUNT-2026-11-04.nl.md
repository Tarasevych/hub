> 🌐 **Taal / Мова:** [Українська](ТЕХНІЧНЕ-ЗАВДАННЯ-ОБЛІКОВОГО-ЗАПИСУ-2026-11-04.uk.md) · **Nederlands** | [Hoofdpagina](../../../LEESMIJ.md) · [Documentatie-index](../../INDEX.nl.md)

# Technische specificatie: accountbeheerpagina (`TZ-account-2026-11-04.nl.md`)

**Datum:** 2026-11-04 (bijgewerkt na implementatie van `IDENTITY-002` en audit 2026-11-05)
**Interactief prototype:** [`identity-live.html`](./identity-live.html)
**Implementatie in de applicatie:** `src/identiteit/IdentiteitAccountPagina.tsx`, `src/identiteit/Profielfoto.tsx`, `src/identiteit/identiteit-account.css`, `src/identiteit/identiteit-tabs.ts`
**Ontwerpbron:** `src/ontwerp/tokens.css` (uitsluitend tokens, geen losse hex-kleuren)

---

## 1. Doel en afbakening

**Doel:** één geconsolideerde pagina voor de categorie `identity` waarop de eigenaar en gebruikers alle 12 onderdelen van het account op één scherm kunnen bekijken en beheren: personalisatie, menu, thema's, talen, widgets, delen, identiteiten, account en gegevens, sessies en apparaten, aanmeldmethoden, beveiliging en toegangsherstel.

**Binnen bereik:** `src/identiteit/IdentiteitAccountPagina.tsx` met inhoudsopgave (`.ia-toc`), profielfotocomponent `src/identiteit/Profielfoto.tsx` met drie bronnen, tweetalige teksten (`uk`/`nl`) en eenheidstests (`tests/eenheid/identiteit-account-ui.test.ts`).
**Buiten bereik:** wijzigingen in serverauthenticatiebeleid, nieuwe databasetabellen of het verwijderen van het eigenaarsaccount (`OWNER_NIET_WISSEN`).

---

## 2. Schermopbouw en de 12 secties

Alle 12 secties uit `IDENTITY_TABS` (`src/identiteit/identiteit-tabs.ts`) staan onder elkaar op één pagina:

| # | ID | Titel (🇳🇱 NL) | Titel (🇺🇦 UK) |
|---|---|---|---|
| 1 | `personalization` | Personalisatie | Персоналізація |
| 2 | `menu` | Menu | Меню |
| 3 | `themes` | Thema’s | Теми |
| 4 | `languages` | Talen | Мови |
| 5 | `widgets` | Widgets | Блоки інтерфейсу |
| 6 | `sharing` | Delen | Спільний доступ |
| 7 | `identity` | Identiteiten | Ідентичності |
| 8 | `account` | Account en gegevens | Обліковий запис і дані |
| 9 | `sessions` | Sessies en apparaten | Сеанси та пристрої |
| 10 | `methods` | Aanmeldmethoden | Способи входу |
| 11 | `security` | Beveiliging | Безпека |
| 12 | `recovery` | Toegangsherstel | Відновлення доступу |

---

## 3. Componenten en auditfixes (05-11-2026)

1. **Inhoudsopgave (`.ia-toc`) en secties (`.ia-sectie`):**
   - `.ia-toc` heeft `position: sticky; top: 70px;` (`top: 62px;` op schermen `≤ 700px`) zodat de inhoudsopgave nooit onder de vaste bovenbalk (`.app-header`) schuift.
   - `.ia-sectie` heeft `scroll-margin-top: 170px;` (`150px` op `≤ 700px`) zodat sectiekoppen bij klikken en scrollen volledig zichtbaar blijven onder de bovenbalk en inhoudsopgave.
2. **Avatar en fotodialoog (`Profielfoto.tsx`):**
   - Het camera-icoon `.ia-avatar-camera` (`22×22 px`) staat exact in het midden van de avatar (`top: 50%; left: 50%; transform: translate(-50%, -50%)`).
   - De prullenbakknop `.ia-avatar-prullenbak` (`24×24 px`) staat op de rechterbovenhoek (`top: -6px; right: -6px`) zonder het camera-icoon te bedekken.
   - De modale achtergrond `.ia-dialoog-achtergrond` heeft `z-index: 99500` (boven `.app-header` met `z-index: 99000`) en `padding-top: max(var(--ruimte-4), calc(76px + env(safe-area-inset-top, 0px)))`.
   - De dialoog ondersteunt 3 bronnen: **Apparaat** (JPEG/PNG/WebP), **Dienst** (huidige foto van de aanmeldprovider) en **Link** (`https://`).

---

## 4. Gegevens en server-API-routes

| Onderdeel | Serverroute | Toelichting |
|---|---|---|
| Profiel en accountoverzicht | `POST /api/account/overview` | Gezaghebbende bron voor profiel en werkruimten |
| Huidige sessie | `GET /api/owner/session/who` | Verificatie van de actieve sessie |
| Aanmeldmethoden en identiteiten | `POST /api/security/overview`, `GET /api/auth/methods` | Gekoppelde identiteiten en providercatalogus |
| TOTP-tweestapsverificatie | `POST /api/owner/access/totp/start`, `/confirm`, `/disable` | Vereist `TOTP_ENCRYPTION_KEY_V1` |
| Herstelcodes | `POST /api/owner/access/recovery/overzicht`, `/rotate`, `/intrekken` | Gemaskeerd overzicht en rotatie met step-up |
| Browsersessies | `POST /api/owner/session/accounts`, `POST /api/owner/session/logout-*` | Sessiebeheer en overal afmelden |
| Gegevensexport | `POST /api/owner/privacy/export` | Volledige export na step-up |
| Account verwijderen | `POST /api/owner/identity/account/delete` | 30 dagen herstelperiode; geblokkeerd voor eigenaar (`OWNER_NIET_WISSEN`) |

---

## 5. Acceptatiecriteria en verificatie

- Alle 12 secties zijn op één pagina bereikbaar op breedtes van 320–1440 px zonder horizontaal scrollen (`@container ia-account`).
- Geen enkele kleur buiten `src/ontwerp/tokens.css`; `node scripts/kleur-contrast-controle.mjs` en `node scripts/plaatsing-controle.mjs` slagen zonder fouten.
- De eenheidstests `node scripts/eenheidstests.mjs identiteit-account-ui.test.ts` bevestigen alle 6 invarianten.
