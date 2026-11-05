> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./MAATREGELEN-PER-ROUTE-20261022.uk.md) · **🇳🇱 Nederlands** ([origineel](./MAATREGELEN-PER-ROUTE-20261022.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Beveiligingsmaatregelen per route (22-10-2026, zone C)

Gegenereerd door `node scripts/beveiliging-routes-inventaris.mjs` op basis van statische analyse van `backend/*.ts` en `tests/**`. Dit is het dekkingsoverzicht ter beantwoording van de vraag van de eigenaar: «is de beveiliging op alle pagina's geborgd en afgedekt, en is het onmogelijk om via code of inbraakpogingen in andermans ruimte terecht te komen». Kolommen:

- **Poort (Gate)** — welke controle de route opent (gebruikerssessie, alleen eigenaar, technisch profiel, agenttoken, systeemroute met eigen rechtencontrole, openbaar).
- **Lade** — of de route de lade (`userId` + `ruimte`) op de server berekent (`bordLade`, `mailLade`, `gegevensRuimteVeilig`, …) in plaats van die uit de request-body te lezen.
- **RLS** — queries lopen via `db.*`/`gebruiker()` in de gebruikerscontext (`zetGebruiker` na de poort): policies op `app.records` (0007/0033) en tabel-RLS zijn van kracht; **systeem** = bewuste `alsSysteem` of systeemroute (`BYPASSRLS`, rechtencontrole in code).
- **WHERE** — expliciet filter op eigenaar (`userId`/`ownerUserId`/`recipientUserId`/`user_id = $n`) in de handler zelf.
- **Step-up** — de route vereist een verse bevestiging (passkey/Google step-up) voor gevoelige acties.
- **Test 2 gebr.** — test die de route namens twee accounts aanroept en controleert dat toegang tot andermans gegevens wordt geweigerd (aanvalstest). «Tests» — elke test waarin de route voorkomt.
- **Persoonlijke tabellen** — tabellen uit de RLS-groepen (0033) of persoonlijke app-tabellen die door de handler worden geraakt.

Routes: **682** (POST 658, GET 22, overige 2). Met persoonlijke tabellen: **33**, waarvan zonder aanvalstest (buiten admin/systeem): **0** (overzicht in §2). Zonder herkende poort: **0** (§3 — handmatig gecontroleerd).

## 1. Routetabel

| Route | Bestand | Poort | Lade | RLS | WHERE | Step-up | Schrijft | Persoonlijke tabellen | Test 2 gebr. | Tests |
|---|---|---|---|---|---|---|---|---|---|---|
| `DELETE /api/connector-v2/:agent/rpc` | mcp-connector-routes.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `DELETE /api/mcp-connector/rpc` | mcp-connector-routes.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/_healthcheck` | index.ts | gedelegeerd aan module (zie bestand) | — | gebruiker | — | — | — | — | admin-diagnostiek, diagnose | admin-diagnostiek, beveiliging-schakelaars, diagnose +1 |
| `GET /api/auth/google` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/auth/methods` | index.ts | gedelegeerd aan module (zie bestand) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/connector-v2/:agent/prm` | mcp-connector-routes.ts | openbare resourcemetadata | — | gebruiker | — | — | — | — | — | — |
| `GET /api/connector-v2/:agent/rpc` | mcp-connector-routes.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/mail/list` | rbac.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/mcp-connector/asm` | mcp-connector-routes.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/mcp-connector/authorize` | mcp-connector-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/mcp-connector/prm` | mcp-connector-routes.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/mcp-connector/rpc` | mcp-connector-routes.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/owner/agents/extensie-beheer` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling |
| `GET /api/owner/agents/extensie-matrix` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/owner/agents/extensie-status` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | ai-hub, ai-toegang-beheer | ai-hub, ai-toegang-beheer, extensie-ontgrendeling +1 |
| `GET /api/owner/agents/kleuren` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/owner/agents/self` | connectors-routes.ts | agenttoken (agentSelf) | — | gebruiker | — | — | — | — | agents, extensie-vergrendeling | agents, extensie-beheer, extensie-profielen +1 |
| `GET /api/owner/agents/ws-ticket` | connectors-routes.ts | bearer-token | — | gebruiker | — | — | — | — | extensie-vergrendeling | extensie-profielen, extensie-vergrendeling |
| `GET /api/owner/auth/google/callback` | index.ts | openbaar (zonder sessie) | — | — (zonder sessie) | ja | — | ja | — | hulp/nep-google | hulp/nep-google, tabbladen |
| `GET /api/owner/github/oauth/callback` | github-platform.ts | alleen rate-limiting | — | gebruiker | ja | — | — | — | integraties-wizard-20261020 | integraties-wizard-20261020 |
| `GET /api/owner/session/who` | index.ts | ankersessie van browser | — | gebruiker | — | — | — | — | — | — |
| `GET /api/owner/system/manifest` | index.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `GET /api/v1/me` | api-platform-tokens.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `GET /api/version` | index.ts | gedelegeerd aan module (zie bestand) | — | gebruiker | — | — | — | — | — | foutuitleg-20261019, nieuwe-versie, release-info +1 |
| `POST /api/access/request` | index.ts | sessie (sessionContext) | — | gebruiker + alsSysteem | ja | — | ja | users, notification_jobs | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/account/delete` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | ja | — | — | audit-account, audit-rls | audit-account, audit-rls |
| `POST /api/account/overview` | index.ts | sessie (sessionContext) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/account/recover` | index.ts | sessie (sessionContext) | — | gebruiker | — | — | — | — | audit-account, audit-rls | audit-account, audit-rls |
| `POST /api/account/workspaces/:id/restore` | index.ts | sessie (sessionContext) | — | gebruiker | — | — | ja | workspaces | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/admin/overview` | index.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/admin/requests/:id` | index.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/admin/users/:id` | index.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/admin/users/:id/delete` | index.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/admin/users/:id/recover` | index.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/auth/broker/complete` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/auth/broker/request/complete` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/auth/broker/request/consume` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/auth/broker/request/create` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/auth/exchange` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/auth/google` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/auth/google/code` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/auth/google/start` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/auth/google/status` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/auth/logout` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/beheer/beleid/stand` | diagnose.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/beheer/flags` | flags.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | flags | flags.e2e, siem.e2e, ssh-ca.e2e +1 |
| `POST /api/beheer/flags/test` | flags.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | flags | flags |
| `POST /api/beheer/flags/verwijderen` | flags.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | flags | flags |
| `POST /api/beheer/flags/zetten` | flags.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | flags | siem.e2e, ssh-ca.e2e, flags |
| `POST /api/beheer/rls/groepen` | diagnose.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/beheer/siem/stand` | siem.ts | sessie (deps.requireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/blocks/:id/delete` | index.ts | sessie (sessionContext) | ja | gebruiker | ja | — | ja | workspace_blocks | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/blocks/:id/delete` | rbac.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/blocks/:id/update` | index.ts | sessie (sessionContext) | ja | gebruiker | ja | — | ja | workspace_blocks | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/blocks/add` | index.ts | sessie (sessionContext) | ja | gebruiker | ja | — | ja | workspace_blocks | audit-rls | audit-rls |
| `POST /api/blocks/delete` | rbac.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/bootstrap` | index.ts | sessie (sessionContext) | ja | gebruiker | ja | — | — | site_notifications, workspace_members, workspaces | ruimte-aanvallen-20261022 | meldingen-sferen-20261022, ruimte-aanvallen-20261022 |
| `POST /api/browser/accounts` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/browser/accounts/forget` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/browser/accounts/select` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/connector-v2/:agent/rpc` | mcp-connector-routes.ts | bearer OAuth-agenttoken (rpc v2) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/diagnose/gelezen` | diagnose.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/diagnose/melden` | diagnose.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/diagnose/meldingen` | diagnose.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/diagnose/server` | diagnose.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | diagnose.e2e |
| `POST /api/ecosystem/auth/remembered` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/ecosystem/auth/start` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/ecosystem/auth/status` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/ecosystem/bootstrap` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/ecosystem/handoff/exchange` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/ecosystem/logout` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/ecosystem/navigate` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/ecosystem/notifications/read` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/flags` | flags.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | flags, impersonatie | flags.e2e, flags, impersonatie |
| `POST /api/gast/bekijk` | toegangscodes-routes.ts | openbaar (zonder sessie) | — | — (zonder sessie) | — | — | — | — | toegangscodes | gast-toegang.e2e, toegangscodes |
| `POST /api/gast/inwisselen` | toegangscodes-routes.ts | openbaar (zonder sessie) | — | — (zonder sessie) | — | — | — | — | toegangscodes | toegangscodes |
| `POST /api/gast/sessie` | toegangscodes-routes.ts | openbaar (zonder sessie) | — | — (zonder sessie) | — | — | — | — | toegangscodes | gast-toegang.e2e, toegangscodes |
| `POST /api/gast/uitloggen` | toegangscodes-routes.ts | openbaar (zonder sessie) | — | — (zonder sessie) | — | — | — | — | toegangscodes | toegangscodes |
| `POST /api/identity/account/delete` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/identity/account/workspaces/:id/restore` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/identity/admin/overview` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/identity/admin/requests/:id` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/identity/admin/users/:id` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/identity/admin/users/:id/delete` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/identity/admin/users/:id/recover` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/identity/security/location` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/identity/security/sessions` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/identity/security/sessions/:id/revoke` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/identity/security/sessions/revoke-all` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/impersonatie/aanroep` | impersonatie-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | impersonatie | impersonatie |
| `POST /api/impersonatie/aanvragen` | impersonatie-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | impersonatie | impersonatie |
| `POST /api/impersonatie/band` | impersonatie-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | impersonatie | impersonatie |
| `POST /api/impersonatie/beeindigen` | impersonatie-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/impersonatie/journaal` | impersonatie-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/impersonatie/mijn-aanvragen` | impersonatie-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/impersonatie/toestaan` | impersonatie-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | impersonatie | impersonatie |
| `POST /api/impersonatie/voor-mij` | impersonatie-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | impersonatie | impersonatie |
| `POST /api/impersonatie/weigeren` | impersonatie-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/mail/update` | rbac.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/mcp-connector/register` | mcp-connector-routes.ts | openbare OAuth-registratie (RFC 7591) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/mcp-connector/revoke` | mcp-connector-routes.ts | openbare OAuth-intrekking | — | gebruiker | — | — | — | — | — | — |
| `POST /api/mcp-connector/rpc` | mcp-connector-routes.ts | bearer OAuth-agenttoken (rpc) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/mcp-connector/token` | mcp-connector-routes.ts | openbaar OAuth-token (code/refresh) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/mcp/deur/token-check` | mcp-connector-routes.ts | agenttoken (module) | — | gebruiker | — | — | — | — | mcp-een-klik | mcp-een-klik |
| `POST /api/notifications/read` | index.ts | sessie (sessionContext) | ja | gebruiker | ja | — | ja | site_notifications | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/ofrep/v1/evaluate/flags` | flags.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | flags | flags.e2e, flags |
| `POST /api/ofrep/v1/evaluate/flags/:key` | flags.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | flags | flags.e2e, flags |
| `POST /api/ondersteuning/aanvragen` | ondersteuning-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | — | ondersteuning.e2e |
| `POST /api/ondersteuning/beeindigen` | ondersteuning-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/ondersteuning/mijn-aanvragen` | ondersteuning-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/ondersteuning/overzicht` | ondersteuning-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | ondersteuning.e2e |
| `POST /api/ondersteuning/toestaan` | ondersteuning-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | impersonatie | impersonatie |
| `POST /api/ondersteuning/voor-mij` | ondersteuning-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/ondersteuning/weigeren` | ondersteuning-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/access/binding/unbind` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/access/catalog` | toegangslaag.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/access/method/herstel` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | ja | — | — | audit-toegang | audit-toegang |
| `POST /api/owner/access/method/unbind` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | ja | — | — | audit-toegang | audit-toegang |
| `POST /api/owner/access/password/login` | toegangslaag.ts | openbare aanmelding (wachtwoord + TOTP, rate-limiting) | — | gebruiker | — | — | — | — | audit-toegang | audit-pad, audit-toegang |
| `POST /api/owner/access/password/remove` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/access/password/set` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | ja | ja | ja | — | audit-toegang | audit-toegang |
| `POST /api/owner/access/phone/save` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | ja | ja | ja | — | — | — |
| `POST /api/owner/access/policy/save` | toegangslaag.ts | sessie + recht api-platform (ownerGate) | — | systeem | — | ja | — | — | — | — |
| `POST /api/owner/access/recovery/bekeken` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | — | ja | — | passkeys | passkeys |
| `POST /api/owner/access/recovery/intrekken` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | ja | ja | — | passkeys | passkeys |
| `POST /api/owner/access/recovery/overzicht` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | — | — | — | passkeys | passkeys |
| `POST /api/owner/access/recovery/rotate` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | ja | ja | — | passkeys | passkeys |
| `POST /api/owner/access/request` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker + alsSysteem | ja | — | ja | users, notification_jobs | audit-rls | audit-rls |
| `POST /api/owner/access/snapshot` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | — | — | — | passkeys | passkeys |
| `POST /api/owner/access/stap-op` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | ja | — | — | herstelcodes.e2e, audit-toegang | herstelcodes.e2e, audit-pad, audit-toegang +5 |
| `POST /api/owner/access/stap-op/methoden` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | ja | — | — | passkeys, stap-op-onthouden-20261020 | passkeys, stap-op-onthouden-20261020 |
| `POST /api/owner/access/stap-op/onthouden` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | ja | — | — | stap-op-onthouden-20261020 | stap-op-onthouden-20261020 |
| `POST /api/owner/access/stap-op/passkey` | toegangssleutels.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | ja | — | — | passkeys, sleutelkluis-20261020 | passkeys, sleutelkluis-20261020, stap-op-onthouden-20261020 +2 |
| `POST /api/owner/access/stap-op/passkey/opties` | toegangssleutels.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | ja | — | — | passkeys, sleutelkluis-20261020 | passkeys, sleutelkluis-20261020, stap-op-onthouden-20261020 +2 |
| `POST /api/owner/access/totp/confirm` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | — | ja | — | audit-toegang, passkeys | audit-toegang, passkeys, stap-op-onthouden-20261020 |
| `POST /api/owner/access/totp/disable` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/access/totp/start` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | ja | ja | ja | — | audit-toegang, passkeys | audit-toegang, passkeys, stap-op-onthouden-20261020 |
| `POST /api/owner/access/user/:id/method` | toegangslaag.ts | sessie + recht api-platform (ownerGate) | — | systeem | ja | ja | ja | users | audit-toegang | audit-toegang |
| `POST /api/owner/access/user/:id/reset-password` | toegangslaag.ts | sessie + recht api-platform (ownerGate) | — | systeem | ja | ja | ja | — | — | — |
| `POST /api/owner/access/webauthn/options` | toegangslaag.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/access/webauthn/register` | toegangslaag.ts | zonder sessie (leest verzoek niet: catalogus/status/410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/access/webauthn/remove` | toegangslaag.ts | sessie (lokale poort van module) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/admin/access-requests/:id` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/bootstrap` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/diagnostics` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/diagnostiek/account` | admin-diagnostiek.ts | alleen rate-limiting | — | systeem | — | — | — | — | diagnostiek-account | diagnostiek-account |
| `POST /api/owner/admin/diagnostiek/gebruiker` | admin-diagnostiek.ts | alleen rate-limiting | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/diagnostiek/historie` | admin-diagnostiek.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/diagnostiek/overzicht` | admin-diagnostiek.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/diagnostiek/rendering` | admin-diagnostiek.ts | alleen rate-limiting | — | systeem | — | — | — | — | — | admin-diagnostiek-rook-20261022 |
| `POST /api/owner/admin/diagnostiek/uitvoeren` | admin-diagnostiek.ts | alleen rate-limiting | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/directory-connectors/save` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | — | ja | ja | — | — | — |
| `POST /api/owner/admin/integraties/beleid` | beheer-integraties.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/integraties/controleer` | beheer-integraties.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | ja | — | — | — |
| `POST /api/owner/admin/integraties/loskoppelen` | beheer-integraties.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/integraties/stand` | beheer-integraties.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/integraties/wizard/controleer` | integraties-wizard.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | ja | — | integraties-wizard-20261020 | integraties-wizard-20261020 |
| `POST /api/owner/admin/integraties/wizard/stand` | integraties-wizard.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | integraties-wizard-20261020 | integraties-wizard-20261020 |
| `POST /api/owner/admin/integraties/wizard/vernieuwen` | integraties-wizard.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | integraties-wizard-20261020 | integraties-wizard-20261020 |
| `POST /api/owner/admin/media-generator/controleer` | dev-mg-routes.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/media-generator/opslaan` | dev-mg-routes.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/media-generator/stand` | dev-mg-routes.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/merk-bron/stand` | merk-bron.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/merk-bron/vernieuwen` | merk-bron.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | ja | — | — | — |
| `POST /api/owner/admin/merk-bron/zetten` | merk-bron.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | merk-bron-20261021 | merk-bron-20261021 |
| `POST /api/owner/admin/merk-eigen/wissen` | merk-eigen.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/merk-eigen/zetten` | merk-eigen.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | mail-accounts-beheer-20261021 | mail-accounts-beheer-20261021 |
| `POST /api/owner/admin/oauth-policy/save` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | — | ja | — | — | — | — |
| `POST /api/owner/admin/overview` | beheer-overzicht.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | admin-overzicht, agent-namens |
| `POST /api/owner/admin/overview/layout` | beheer-overzicht.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/overview/layout/reset` | beheer-overzicht.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/overview/layout/save` | beheer-overzicht.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/admin/overview/snapshots` | beheer-overzicht.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | admin-overzicht |
| `POST /api/owner/admin/overview/user` | beheer-overzicht.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | admin-overzicht |
| `POST /api/owner/admin/roles/save` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | ja | ja | ja | users | — | — |
| `POST /api/owner/admin/sso-policy/save` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | — | ja | — | — | — | — |
| `POST /api/owner/admin/users/:id` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | — | ja | — | users | audit-account, audit-rls | audit-account, audit-rls, impersonatie +1 |
| `POST /api/owner/admin/users/:id/delete` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | — | ja | — | users | audit-account | audit-account |
| `POST /api/owner/admin/users/:id/recover` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | — | ja | — | — | audit-account | audit-account |
| `POST /api/owner/admin/users/pagina` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | — | — | — | users | — | — |
| `POST /api/owner/agenda/caldav/koppelen` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/caldav/vernieuwen` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/caldav/verwijderen` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | agenda-tweerichting-20261020, hub-agenda-notities-20261019 |
| `POST /api/owner/agenda/gebeurtenis/aanmaken` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis/antwoord` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis/deelnemers` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis/verplaatsen` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis/verwijderen` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis/wijzigen` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/ics/schakelen` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/ics/toevoegen` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/ics/vernieuwen` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/ics/verwijderen` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/lokaal` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/overzicht` | agenda-routes.ts | sessie (authorize van module) | ja | gebruiker | — | — | — | — | ruimte-cloud-agenda-20261020 | hub-agenda-notities-20261019, ruimte-cloud-agenda-20261020, tech-ruimte-pagina-20261020 |
| `POST /api/owner/agenda/synchroniseren` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agenda/toegang/uitbreiden` | agenda-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agent-namens/aanmaken` | agent-namens.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | ja | ja | — | — | — | agent-namens |
| `POST /api/owner/agent-namens/intrekken` | agent-namens.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | agent-namens |
| `POST /api/owner/agent-namens/lijst` | agent-namens.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | agent-namens |
| `POST /api/owner/agent-namens/spoken/opruimen` | agent-namens.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | ja | — | — | — | agent-namens |
| `POST /api/owner/agents/:id/browser-enabled` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/agents/:id/command` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/:id/commands` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/:id/heartbeat` | connectors-routes.ts | sessie op willekeurige dienst + recht api-platform | — | gebruiker | — | — | — | — | gebruiker-audit-2026-10-19 | gebruiker-audit-2026-10-19 |
| `POST /api/owner/agents/:id/policy` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/:id/revoke` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/activity` | connectors-routes.ts | sessie op willekeurige dienst + recht api-platform | ja | gebruiker | ja | — | — | — | ruimte-aanvallen-20261022 | bevestig-toegang.e2e, meldingen-sferen-20261022, ruimte-aanvallen-20261022 |
| `POST /api/owner/agents/chat` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/chat/status` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/commands/:id/approve` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/agents/commands/:id/reject` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/diagnostics/archive` | connectors-routes.ts | bearer-token | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/extensie-beheer` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling |
| `POST /api/owner/agents/extensie-beheer/beleid` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling |
| `POST /api/owner/agents/extensie-beheer/intrekken` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling |
| `POST /api/owner/agents/extensie-beheer/verlengen` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling |
| `POST /api/owner/agents/extensie-matrix` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/extensie-matrix/snel` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/extensie-matrix/zet` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/extensie-status` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | ai-hub, ai-toegang-beheer | ai-hub, ai-toegang-beheer, extensie-ontgrendeling +1 |
| `POST /api/owner/agents/extensie/chat` | extensie-zijpaneel.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/journaal` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | ja | — | — | — | gebruiker-audit-2026-10-19 | agenten.e2e, gebruiker-audit-2026-10-19 |
| `POST /api/owner/agents/kleuren` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/kleuren/zet` | extensie-ontgrendeling-routes.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/list` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling, gebruiker-audit-2026-10-19 |
| `POST /api/owner/agents/opruimen` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | agents | agents |
| `POST /api/owner/agents/overdracht` | connectors-routes.ts | bearer-token | — | gebruiker | — | — | — | — | — | agent-apps, apps-overdracht |
| `POST /api/owner/agents/overzicht` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | ja | — | — | — | ai-toegang-beheer | agenten.e2e, ai-toegang-beheer |
| `POST /api/owner/agents/pair` | connectors-routes.ts | openbaar: eenmalige koppelcode | — | gebruiker | ja | — | — | — | extensie-vergrendeling, gebruiker-audit-2026-10-19 | apps-byos.e2e, terminal.e2e, extensie-beheer +3 |
| `POST /api/owner/agents/pairing-code` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | ruimte_dienst_stand | gebruiker-audit-2026-10-19 | apps-byos.e2e, terminal.e2e, gebruiker-audit-2026-10-19 |
| `POST /api/owner/agents/self` | connectors-routes.ts | agenttoken (agentSelf) | — | gebruiker | — | — | — | — | agents, extensie-vergrendeling | agents, extensie-beheer, extensie-profielen +1 |
| `POST /api/owner/agents/tools/call` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/agents/tools/list` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/ai-beleid/ondertekenen` | ai-beleid.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | agent-namens |
| `POST /api/owner/ai-beleid/overzicht` | ai-beleid.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/ai-beleid/voorstel` | ai-beleid.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | ai-beleid.e2e |
| `POST /api/owner/ai-bevestiging/bevestigen` | ai-bevestiging-routes.ts | sessie (vooraf() van module) | — | gebruiker | ja | ja | — | — | ai-bevestiging-20261021, dev-rechten-beheer-20261021 | ai-bevestiging-20261021, dev-rechten-beheer-20261021 |
| `POST /api/owner/ai-bevestiging/lijst` | ai-bevestiging-routes.ts | sessie (vooraf() van module) | — | gebruiker | — | — | — | — | ai-bevestiging-20261021 | ai-bevestiging-20261021 |
| `POST /api/owner/ai-bevestiging/weigeren` | ai-bevestiging-routes.ts | sessie (vooraf() van module) | — | gebruiker | ja | — | — | — | ai-bevestiging-20261021 | ai-bevestiging-20261021 |
| `POST /api/owner/ai-bord` | mcp-connector-routes.ts | accountsessie (accountGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/ai-bord/modus` | mcp-connector-routes.ts | accountsessie (accountGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/ai-bord/token` | mcp-connector-routes.ts | accountsessie (accountGate) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/ai-rechten/fotos/sessie` | dev-rechten-gebruiker.ts | sessie | ja | gebruiker | — | — | ja | — | — | dev-rechten-gebruiker-20261021 |
| `POST /api/owner/ai-rechten/fotos/stand` | dev-rechten-gebruiker.ts | sessie | ja | gebruiker | — | — | ja | — | — | dev-rechten-gebruiker-20261021 |
| `POST /api/owner/ai-rechten/google-stand` | dev-rechten-gebruiker.ts | gebruikerssessie (wrapper mens()) | — | gebruiker | — | — | — | — | — | dev-rechten-gebruiker-20261021 |
| `POST /api/owner/ai-rechten/google-toegang` | dev-rechten-gebruiker.ts | gebruikerssessie (wrapper mens()) | — | gebruiker | — | — | — | — | — | dev-rechten-gebruiker-20261021 |
| `POST /api/owner/ai-site-schakelaars` | mcp-connector-routes.ts | sitesessie (siteGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/ai-site-schakelaars/zet` | mcp-connector-routes.ts | sitesessie (siteGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/ai-toegang/beheer` | mcp-connector-routes.ts | accountsessie (accountGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/ai-toegang/beheer/zet` | mcp-connector-routes.ts | accountsessie (accountGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/ai-toegang/overzicht` | mcp-connector-routes.ts | accountsessie (accountGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/ai-toegang/zet` | mcp-connector-routes.ts | accountsessie (accountGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/ai/block` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/ai/grants/add` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/ai/grants/list` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | ja | — | — | — | ai-toegang-beheer | agenten.e2e, ai-toegang-beheer |
| `POST /api/owner/ai/grants/preset` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/ai/grants/revoke` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | ai-toegang-beheer | ai-toegang-beheer |
| `POST /api/owner/ai/settings` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/ai/stop` | connectors-routes.ts | sessie op willekeurige dienst + recht api-platform | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/ai/werkruimte/chat` | ai-werkruimte.ts | dienstpoort (lade) | — | gebruiker | — | — | — | — | — | ai-werkruimte-20261019 |
| `POST /api/owner/ai/werkruimte/overzicht` | ai-werkruimte.ts | dienstpoort (lade) | — | gebruiker | — | — | — | — | — | ai-werkruimte-20261019 |
| `POST /api/owner/api-platform/connections` | api-platform-verbindingen.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | audit-systeemrijen | audit-systeemrijen |
| `POST /api/owner/api-platform/connections/:id/status` | api-platform-verbindingen.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | ja | — | ja | — | — | — |
| `POST /api/owner/api-platform/contract` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | audit-systeemrijen | audit-systeemrijen |
| `POST /api/owner/api-platform/tokens` | api-platform-tokens.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/api-platform/tokens/:id/revoke` | api-platform-tokens.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/api-platform/tokens/create` | api-platform-tokens.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | ja | — | ja | — | — | — |
| `POST /api/owner/api-platform/tokens/verify` | api-platform-tokens.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/api-platform/vault` | api-platform-kluis.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | impersonatie, integraties-wizard-20261020 | agent-namens, geheimen, impersonatie +3 |
| `POST /api/owner/api-platform/vault/:id/delete` | api-platform-kluis.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | ja | — | — | geheimen |
| `POST /api/owner/api-platform/vault/:id/meta` | api-platform-kluis.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | ja | — | — | vault-meta |
| `POST /api/owner/api-platform/vault/:id/rename` | api-platform-kluis.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/api-platform/vault/:id/reveal` | api-platform-kluis.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | geheimen |
| `POST /api/owner/api-platform/vault/save` | api-platform-kluis.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | ja | — | ja | — | integraties-wizard-20261020 | geheimen, integraties-wizard-20261020, vault-meta |
| `POST /api/owner/apps/eigen-domein` | dev-mg-routes.ts | gebruikerssessie (wrapper mens()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/apps/geheimen` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | apps-overdracht |
| `POST /api/owner/apps/geheimen/:id` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | apps-overdracht |
| `POST /api/owner/apps/geheimen/:id/invullen` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | apps-overdracht |
| `POST /api/owner/apps/overzicht` | connectors-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/audit/beheer/controle` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | ja | — | — | — | — | — |
| `POST /api/owner/audit/beheer/lijst` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | — | — | — | users | — | — |
| `POST /api/owner/audit/beheer/verwijderen` | index.ts | beheerdersbevoegdheid (adminContext) | — | systeem | ja | ja | — | — | — | — |
| `POST /api/owner/auth/google/callback` | index.ts | openbaar (zonder sessie) | — | — (zonder sessie) | — | — | — | — | hulp/nep-google | hulp/nep-google, tabbladen |
| `POST /api/owner/auth/password/login` | toegangslaag.ts | openbare aanmelding (wachtwoord + TOTP, rate-limiting) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/besluit/ondertekenen` | eigenaar-besluit.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | besluit-app-20261022 | besluit-app-20261022 |
| `POST /api/owner/besluit/overzicht` | eigenaar-besluit.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | besluit-app-20261022 | besluit-app-20261022 |
| `POST /api/owner/besluit/starten` | eigenaar-besluit.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | besluit-app-20261022 | besluit-app-20261022 |
| `POST /api/owner/besluit/status` | eigenaar-besluit.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | besluit-app-20261022 | besluit-app-20261022 |
| `POST /api/owner/betalingen/stripe` | dev-mg-routes.ts | gebruikerssessie (wrapper mens()) | — | gebruiker | — | — | — | — | dev-rechten-media-github-20261021 | dev-rechten-media-github-20261021 |
| `POST /api/owner/beveiliging/aanzetten` | beveiliging-schakelaars.ts | dienstpoort (lade) | — | gebruiker | — | ja | — | — | — | beveiliging-schakelaars |
| `POST /api/owner/beveiliging/app-rol-maken` | beveiliging-schakelaars.ts | dienstpoort (lade) | — | gebruiker | — | ja | — | — | — | beveiliging-schakelaars |
| `POST /api/owner/beveiliging/stand` | beveiliging-schakelaars.ts | dienstpoort (lade) | — | gebruiker | — | — | — | — | — | beveiliging-schakelaars |
| `POST /api/owner/beveiliging/uitzetten` | beveiliging-schakelaars.ts | dienstpoort (lade) | — | gebruiker | — | — | — | — | — | beveiliging-schakelaars |
| `POST /api/owner/browser/accounts` | index.ts | alleen id.* (identity authority) | — | — (zonder sessie) | — | — | — | users | — | — |
| `POST /api/owner/cloud/bootstrap` | cloud-platform.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | ruimte-cloud-agenda-20261020 | ruimte-cloud-agenda-20261020, tech-ruimte-pagina-20261020 |
| `POST /api/owner/cloud/capture` | cloud-platform.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/cloud/google-suite/calendar/calendars` | google-suite-agenda-fotos.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/calendar/events` | google-suite-agenda-fotos.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/drive/browse` | google-suite-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | mail-compose-venster.e2e, ruimte-drive-projectie-20261020 |
| `POST /api/owner/cloud/google-suite/drive/file` | google-suite-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | mail-compose-venster.e2e |
| `POST /api/owner/cloud/google-suite/drive/preview` | google-suite-inrichting.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/drive/replace` | google-suite-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/drive/update` | google-suite-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/drive/upload` | google-suite-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/onboarding/start` | google-suite-inrichting.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/onboarding/status` | google-suite-inrichting.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/onboarding/verify` | google-suite-inrichting.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/photos/import` | google-suite-agenda-fotos.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/cloud/google-suite/photos/item/preview` | google-suite-agenda-fotos.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/photos/session/create` | google-suite-agenda-fotos.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/cloud/google-suite/photos/session/status` | google-suite-agenda-fotos.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/cloud/items/:id/open` | cloud-platform.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/cloud/items/:id/place` | cloud-platform.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/cloud/items/:id/status` | cloud-platform.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/cloud/platform-status` | cloud-platform.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/providers/google/account/select` | cloud-google-drive.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/providers/google/connect/start` | cloud-google-drive.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/providers/google/disconnect` | cloud-google-drive.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/providers/status/verify` | cloud-google-drive.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/resume` | cloud-platform.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/search` | cloud-platform.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/cloud/workspaces/create` | cloud-platform.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/cognitive-context/load` | cognitief-context.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/cognitive-context/save` | cognitief-context.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | ja | — | — | — |
| `POST /api/owner/connector-v2/herverbind` | connector-v2-routes.ts | agenttoken/-sessie (metAgent) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/connector-v2/instellingen` | connector-v2-routes.ts | sessie (deps.gate) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/connector-v2/intrekken` | connector-v2-routes.ts | agenttoken/-sessie (metAgent) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/connector-v2/massa` | connector-v2-routes.ts | sessie (deps.gate) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/connector-v2/overzicht` | connector-v2-routes.ts | sessie (deps.gate) | — | gebruiker | — | ja | — | — | gebruiker-audit-2026-10-19 | gebruiker-audit-2026-10-19 |
| `POST /api/owner/connector-v2/wijzig` | connector-v2-routes.ts | agenttoken/-sessie (metAgent) | — | gebruiker | — | — | — | — | — | agent-namens |
| `POST /api/owner/diagnostiek/mijn-diensten` | admin-diagnostiek.ts | sessie (deps.requireSession) | — | gebruiker | — | — | — | — | diagnostiek-account | tech-assets.e2e, diagnostiek-account |
| `POST /api/owner/externe-mcp/hulpmiddel` | mcp-klant-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/externe-mcp/overzicht` | mcp-klant-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | mcp-klant-20261020 | mcp-klant-20261020 |
| `POST /api/owner/externe-mcp/schakelen` | mcp-klant-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/externe-mcp/testen` | mcp-klant-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/externe-mcp/toevoegen` | mcp-klant-routes.ts | bearer-token | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/externe-mcp/verwijderen` | mcp-klant-routes.ts | sessie (authorize van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/geheimen/historie` | geheimen.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | geheimen |
| `POST /api/owner/geheimen/lijst` | geheimen.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | impersonatie | agent-namens, geheimen, impersonatie |
| `POST /api/owner/github/actions` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/actions/logs` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/activity` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/app/installaties` | github-platform.ts | dienstpoort (lade) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/app/verbinden` | github-platform.ts | dienstpoort (lade) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/commits` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/issue/comment` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/issue/create` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/issues` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/koppeling` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | github-koppelkaart-20261019 |
| `POST /api/owner/github/oauth/start` | github-platform.ts | dienstpoort (lade) | ja | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/oauth/vernieuwen` | github-platform.ts | dienstpoort (lade) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/ontkoppelen` | github-platform.ts | dienstpoort (lade) | ja | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/pr/voorstel` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/projects` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/readme` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/repo` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | site-tools | site-tools |
| `POST /api/owner/github/repos` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | site-tools | site-tools |
| `POST /api/owner/github/search` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/github/status` | github-platform.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/global-search` | globaal-zoek.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | — | — | — | — | site-tools | ruimte-drive-projectie-20261020, site-tools, tech-ruimte-pagina-20261020 |
| `POST /api/owner/google-contour` | google-contour.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/google-contour/delete` | google-contour.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/google-contour/keys` | google-contour.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/google-contour/reveal` | google-contour.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/google-contour/save` | google-contour.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/google-suite/callback` | index.ts | OAuth-callback (state + sessie in handler) | — | gebruiker | — | — | — | — | beveiliging-review-20261021, mail-accounts-beheer-20261021 | beveiliging-review-20261021, mail-accounts-beheer-20261021, merk-bron-google-20261021 |
| `POST /api/owner/hub/blocks/data` | hub-block-data.ts | sessie (authorize van module) | ja | gebruiker | — | — | — | — | — | hulp/stand-werkblad, ruimte-drive-projectie-20261020, tech-ruimte-pagina-20261020 |
| `POST /api/owner/hub/bureau/load` | hub-bureau.ts | bureaulade (bordLade) | ja | gebruiker | ja | — | — | — | — | hub-bureau-20261019 |
| `POST /api/owner/hub/bureau/save` | hub-bureau.ts | bureaulade (bordLade) | ja | gebruiker | ja | — | — | — | — | hub-bureau-20261019 |
| `POST /api/owner/hub/layouts/load` | hub-indeling-voorkeuren.ts | bureaulade (bordLade) | ja | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/hub/layouts/save` | hub-indeling-voorkeuren.ts | bureaulade (bordLade) | ja | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/hub/werkblad/bewaren` | werkblad.ts | modulewrapper met() (sessiecontrole intern) | ja | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/hub/werkblad/laden` | werkblad.ts | modulewrapper met() (sessiecontrole intern) | ja | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/hub/werkblad/tech` | werkblad.ts | modulewrapper met() (sessiecontrole intern) | ja | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/hub/werkblad/terugzetten` | werkblad.ts | modulewrapper met() (sessiecontrole intern) | ja | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/identity/account/delete` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | ja | ja | ja | — | impersonatie | agent-namens, impersonatie |
| `POST /api/owner/identity/account/workspaces/:id/restore` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | ja | workspaces | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/owner/identity/admin/overview` | index.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/identity/admin/requests/:id` | index.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/identity/admin/users/:id` | index.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/identity/admin/users/:id/delete` | index.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/identity/admin/users/:id/recover` | index.ts | systeemroute (rechtencontrole in code) | — | systeem | — | — | — | — | — | — |
| `POST /api/owner/identity/redirect/finalize` | index.ts | ankersessie van browser | — | gebruiker | ja | ja | ja | users | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/owner/identity/security/emergency-revoke` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | ja | — | ja | — | — | tech-sessies |
| `POST /api/owner/identity/security/items/:id/revoke` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | ja | — | — | tech-sessies |
| `POST /api/owner/identity/security/items/:id/stap-op-vergeten` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | ja | — | — | stap-op-onthouden-20261020 | stap-op-onthouden-20261020 |
| `POST /api/owner/identity/security/items/:id/tech-beeindigen` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | tech-sessies |
| `POST /api/owner/identity/security/overview` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | ja | ja | — | — | impersonatie, stap-op-onthouden-20261020 | impersonatie, stap-op-onthouden-20261020, tech-sessies |
| `POST /api/owner/identity/security/revoke-all` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | ja | — | — | — | impersonatie | agent-namens, impersonatie, tech-sessies |
| `POST /api/owner/identity/security/revoke-others` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | ja | — | ja | — | toegangscodes | tech-sessies, toegangscodes |
| `POST /api/owner/identity/transactions/attach` | index.ts | alleen id.* (identity authority) | — | gebruiker | — | ja | ja | — | — | — |
| `POST /api/owner/identity/transactions/cancel` | index.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/identity/transactions/complete-remembered` | index.ts | alleen id.* (identity authority) | — | — (zonder sessie) | — | — | ja | users | — | — |
| `POST /api/owner/identity/transactions/create` | index.ts | ankersessie van browser | — | — (zonder sessie) | — | ja | ja | — | audit-account, hulp/nep-google | audit-account, hulp/nep-google, tabbladen |
| `POST /api/owner/identity/transactions/redeem` | index.ts | ankersessie van browser | — | gebruiker | ja | ja | ja | users | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/owner/identity/transactions/status` | index.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/integraties/beschikbaar` | beheer-integraties.ts | sessie (deps.requireSession) | — | gebruiker | — | — | — | — | admin-integraties | admin-integraties |
| `POST /api/owner/journaal/beheer/export` | beheer-journaal-routes.ts | beheerdersbevoegdheid (wrapper metAdmin()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/journaal/beheer/ketencontrole` | beheer-journaal-routes.ts | beheerdersbevoegdheid (wrapper metAdmin()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/journaal/beheer/statistiek` | beheer-journaal-routes.ts | beheerdersbevoegdheid (wrapper metAdmin()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/journaal/beheer/zoeken` | beheer-journaal-routes.ts | beheerdersbevoegdheid (wrapper metAdmin()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/connect/start` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | ja | — | ja | — | — | — |
| `POST /api/owner/mail/accounts/:id/disconnect` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | mail-accounts-beheer-20261021 | mail-accounts-beheer-20261021 |
| `POST /api/owner/mail/accounts/:id/labels` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/labels/modify` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/messages` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/send` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/send/confirm` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/send/prepare` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/sync-health` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/threads` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/link` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/mail/accounts/list` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/afzender-beelden` | merk-bron.ts | modulewrapper mail() (sessiecontrole intern) | ja | gebruiker | — | — | — | — | merk-bron-20261021 | merk-bron-20261021, merk-bron-google-20261021 |
| `POST /api/owner/mail/afzender-beelden/google-toestemming` | merk-bron.ts | sessie (module) | — | gebruiker | — | — | — | — | — | merk-bron-google-20261021 |
| `POST /api/owner/mail/afzender-beelden/voorkeur` | merk-bron.ts | modulewrapper mail() (sessiecontrole intern) | ja | gebruiker | — | — | — | — | — | merk-bron-google-20261021 |
| `POST /api/owner/mail/afzenders/audit/start` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/audit/status` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/audit/stop` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/bijwerken` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/controle` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/detail` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/intrekken` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/lijst` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/status` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | ruimte-mail-20261020 | hulp/stand-mail-nep, ruimte-mail-20261020 |
| `POST /api/owner/mail/afzenders/verifieren` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/vervangen` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/verwijderen` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/ai-vertaling/run` | ai-vertaling-routes.ts | alleen rate-limiting | — | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/mail/ai-vertaling/settings` | ai-vertaling-routes.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | ai-vertaling | ai-vertaling |
| `POST /api/owner/mail/ai-vertaling/state` | ai-vertaling-routes.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | ai-vertaling | ai-vertaling |
| `POST /api/owner/mail/bootstrap` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | audit-systeemrijen, beveiliging-review-20261021 | audit-systeemrijen, beveiliging-review-20261021, mail-accounts-beheer-20261021 +1 |
| `POST /api/owner/mail/compose/ai/reply` | ai-mail-assistent.ts | sessie (wrapper handler()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/ai/summarize` | ai-mail-assistent.ts | sessie (wrapper handler()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/ai/tone` | ai-mail-assistent.ts | sessie (wrapper handler()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/ai/transform` | ai-mail-assistent.ts | sessie (wrapper handler()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/draft/delete` | mail-opstel.ts | postsessie (gateOf van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/draft/get` | mail-opstel.ts | postsessie (gateOf van module) | — | gebruiker | — | — | — | — | — | mail-compose-venster.e2e |
| `POST /api/owner/mail/compose/draft/list` | mail-opstel.ts | postsessie (gateOf van module) | — | gebruiker | — | — | — | — | — | mail-compose-venster.e2e |
| `POST /api/owner/mail/compose/draft/save` | mail-opstel.ts | postsessie (gateOf van module) | — | gebruiker | — | — | — | — | impersonatie | hulp/stand-opstellen, mail-compose-venster.e2e, impersonatie |
| `POST /api/owner/mail/compose/schedule` | mail-opstel.ts | postsessie (gateOf van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/scheduled/cancel` | mail-opstel.ts | postsessie (gateOf van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/scheduled/list` | mail-opstel.ts | postsessie (gateOf van module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/send` | mail-opstel.ts | postsessie (gateOf van module) | — | gebruiker | — | — | — | — | ruimte-mail-20261020 | mail-compose-venster.e2e, ruimte-mail-20261020 |
| `POST /api/owner/mail/contacten/contact` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/detail` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/lijst` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | ruimte-mail-20261020 | ruimte-mail-20261020 |
| `POST /api/owner/mail/contacten/scan/auto` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/scan/beleid` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/scan/pauze` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/scan/start` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/scan/status` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/scan/stop` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/verdacht` | mail-afzenders.ts | sessie + technisch profiel (wrapper route()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/account/disconnect` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/account/select` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | beveiliging-review-20261021 | beveiliging-review-20261021 |
| `POST /api/owner/mail/google-suite/accounts` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | audit-systeemrijen, beveiliging-review-20261021 | hulp/stand-mail-nep, hulp/stand-opstellen, mail-compose-venster.e2e +4 |
| `POST /api/owner/mail/google-suite/attachment` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | hulp/stand-mail-nep |
| `POST /api/owner/mail/google-suite/attachments/metadata` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | hulp/stand-mail-nep |
| `POST /api/owner/mail/google-suite/connect/start` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | audit-systeemrijen | audit-systeemrijen |
| `POST /api/owner/mail/google-suite/forward-attachment` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/labels` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | hulp/stand-mail-accounts, hulp/stand-mail-nep |
| `POST /api/owner/mail/google-suite/labels/create` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/labels/delete` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/labels/update` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/message` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | impersonatie, ruimte-mail-20261020 | hulp/stand-mail-nep, mail-lijst-ux.e2e, impersonatie +3 |
| `POST /api/owner/mail/google-suite/message/labels-set` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/message/modify` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | impersonatie, site-tools | impersonatie, site-tools |
| `POST /api/owner/mail/google-suite/message/raw` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/messages` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | mail_items_v1 | impersonatie, ruimte-mail-20261020 | hulp/stand-mail-nep, mail-lijst-ux.e2e, impersonatie +3 |
| `POST /api/owner/mail/google-suite/messages/bulk-modify` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/onboarding/start` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | beveiliging-review-20261021, gebruiker-audit-2026-10-19 | beveiliging-review-20261021, gebruiker-audit-2026-10-19, mail-accounts-beheer-20261021 +2 |
| `POST /api/owner/mail/google-suite/period-bounds` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/preview` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | hulp/stand-mail-accounts |
| `POST /api/owner/mail/google-suite/reader/capabilities` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reader/filter-similar` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reader/n10/capabilities` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reader/remote-image` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reader/translate` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reply` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reply/reaction` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/save-drive` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/save-folders` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/save-targets` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/selection/resolve` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/sender/block-filter` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/state-bulk/status` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/state-bulk/submit` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/state-intents/status` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/state-intents/submit` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/subscriptions` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/thread` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | mail-lijst-ux.e2e |
| `POST /api/owner/mail/google-suite/thread/ignore` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/unsubscribe` | google-suite-mail-browser.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/google/accounts/:id/disconnect` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | ja | — | ja | — | beveiliging-review-20261021, mail-accounts-beheer-20261021 | beveiliging-review-20261021, mail-accounts-beheer-20261021 |
| `POST /api/owner/mail/google/pubsub/push` | index.ts | Google-webhook (handtekeningcontrole in handler) | — | gebruiker | — | — | — | — | audit-systeemrijen, ruimte-mail-20261020 | audit-systeemrijen, ruimte-mail-20261020 |
| `POST /api/owner/mail/handwriting/recognize` | mail-handschrift.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/imap/aanbieders` | mail-imap.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | — | — | — | — | mail-accounts-beheer-20261021 | mail-accounts-beheer-20261021 |
| `POST /api/owner/mail/imap/controleren` | mail-imap.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/imap/koppelen` | mail-imap.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | — | — | — | — | gebruiker-audit-2026-10-19, mail-accounts-beheer-20261021 | gebruiker-audit-2026-10-19, mail-accounts-beheer-20261021, mail-koppelen-20261020 |
| `POST /api/owner/mail/imap/ontkoppelen` | mail-imap.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | — | — | — | — | mail-accounts-beheer-20261021 | mail-accounts-beheer-20261021 |
| `POST /api/owner/mail/import` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | ja | — | ja | — | — | — |
| `POST /api/owner/mail/items/:id/update` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/mail/maintenance/run-once` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/microsoft/webhook` | index.ts | Microsoft-webhook (validatiecontrole in handler) | — | gebruiker | — | — | — | — | ruimte-mail-20261020 | ruimte-mail-20261020 |
| `POST /api/owner/mail/migration-inventory` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/notification-preferences/save` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/platform-status` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/resume` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/ruimte` | mail-ruimte-routes.ts | sessie (deps.requireSession) | ja | gebruiker | — | — | — | — | ruimte-mail-20261020 | ruimte-mail-20261020 |
| `POST /api/owner/mail/search/advanced` | mail-search.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/mail/search/local-period` | mail-search.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/mail/sender-avatar/data` | mail-weergave-voorkeuren.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/sender-avatar/remove` | mail-weergave-voorkeuren.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/sender-avatar/set` | mail-weergave-voorkeuren.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mail/snooze/cancel` | mail-uitstel.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | ja | — | — | — |
| `POST /api/owner/mail/snooze/list` | mail-uitstel.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | ja | — | — | — |
| `POST /api/owner/mail/snooze/set` | mail-uitstel.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | ja | — | — | — |
| `POST /api/owner/mail/view-preferences/load` | mail-weergave-voorkeuren.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | hulp/stand-mail-nep |
| `POST /api/owner/mail/view-preferences/save` | mail-weergave-voorkeuren.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | ja | — | — | hulp/stand-mail-nep |
| `POST /api/owner/mail/view-preferences/section-display` | mail-weergave-voorkeuren.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | ja | — | ja | — | — | — |
| `POST /api/owner/mail/workers/run-once` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mcp-connector/approvals` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | gebruiker-audit-2026-10-19 | gebruiker-audit-2026-10-19, stapop-h4 |
| `POST /api/owner/mcp-connector/approvals/:id/approve` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | stapop-h4 |
| `POST /api/owner/mcp-connector/approvals/:id/reject` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mcp-connector/consent` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | stap-op-onthouden-20261020 | stap-op-onthouden-20261020, stapop-h4 |
| `POST /api/owner/mcp-connector/consent/info` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/mcp-connector/deur/intrekken` | mcp-connector-routes.ts | alleen eigenaar (module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mcp-connector/deur/verbindingen` | mcp-connector-routes.ts | alleen eigenaar (module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mcp-connector/duren` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/mcp-connector/duren/zet` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/mcp-connector/grants` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | ai-toegang-beheer | agenten.e2e, agent-namens, ai-toegang-beheer |
| `POST /api/owner/mcp-connector/grants/:id/revoke` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | ai-toegang-beheer | agenten.e2e, agent-namens, ai-toegang-beheer |
| `POST /api/owner/mcp-connector/tools` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | stapop-h4 |
| `POST /api/owner/mcp-connector/tools/set` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | ja | — | — | — | stapop-h4 |
| `POST /api/owner/mcp-connector/tools/set-all` | mcp-connector-routes.ts | sessie + recht api-platform (ownerGate) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/media/afbeelding` | dev-mg-routes.ts | gebruikerssessie (wrapper mens()) | — | gebruiker | ja | — | — | — | dev-rechten-media-github-20261021 | dev-rechten-media-github-20261021 |
| `POST /api/owner/media/diagram` | dev-mg-routes.ts | gebruikerssessie (wrapper mens()) | — | gebruiker | — | — | — | — | dev-rechten-media-github-20261021 | dev-rechten-media-github-20261021 |
| `POST /api/owner/media/ontwerp-context` | dev-mg-routes.ts | gebruikerssessie (wrapper mens()) | — | gebruiker | — | — | — | — | dev-rechten-media-github-20261021 | dev-rechten-media-github-20261021 |
| `POST /api/owner/menu/tellers` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | menu-v2-meldingen.e2e, menu-meldingen | menu-v2-meldingen.e2e, menu-meldingen |
| `POST /api/owner/menu/tellers/weg` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | menu-meldingen | menu-meldingen |
| `POST /api/owner/menu/tellers/zet` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | menu-v2-meldingen.e2e, menu-meldingen | menu-v2-meldingen.e2e, menu-meldingen |
| `POST /api/owner/merk-beeld` | merk-bron.ts | sessie (module) | — | gebruiker | — | — | — | — | merk-bron-20261021 | merk-bron-20261021 |
| `POST /api/owner/merk-eigen/lijst` | merk-eigen.ts | sessie (deps.requireSession) | — | gebruiker | — | — | — | — | mail-accounts-beheer-20261021 | mail-accounts-beheer-20261021 |
| `POST /api/owner/notifications/read` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | ja | gebruiker | ja | — | ja | site_notifications | impersonatie, ruimte-aanvallen-20261022 | impersonatie, meldingen-sferen-20261022, ruimte-aanvallen-20261022 +1 |
| `POST /api/owner/privacy/export` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/privacy/gebeurtenis` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/privacy/status` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/privacy/toestemming` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/profile/photo` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | ja | users | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/owner/remote/hosts/opslaan` | extern-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/remote/openen` | extern-routes.ts | sessie | — | gebruiker | — | ja | — | — | remote-bureaublad | remote-bureaublad |
| `POST /api/owner/remote/sessies` | extern-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/remote/sluiten` | extern-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/remote/stand` | extern-routes.ts | sessie | — | gebruiker | — | — | — | — | remote-bureaublad | remote-bureaublad |
| `POST /api/owner/remote/verbinding/opslaan` | extern-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | remote-bureaublad | remote-bureaublad |
| `POST /api/owner/remote/verbinding/testen` | extern-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | remote-bureaublad | remote-bureaublad |
| `POST /api/owner/remote/verbinding/verwijderen` | extern-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | remote-bureaublad | remote-bureaublad |
| `POST /api/owner/ruimte/besluit` | ruimte-scheiding-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | ja | ja | — | — | ruimte-scheiding-20261020 | ruimte-scheiding-20261020 |
| `POST /api/owner/ruimte/dienst` | ruimte-scheiding-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | ruimte-scheiding-20261020 | ruimte-scheiding-20261020 |
| `POST /api/owner/ruimte/keuze` | ruimte-scheiding-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | ruimte-scheiding-20261020 | ruimte-scheiding-20261020 |
| `POST /api/owner/ruimte/overzicht` | ruimte-scheiding-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | ruimte-mail-20261020 | ruimte-mail-20261020 |
| `POST /api/owner/session/accounts` | index.ts | ankersessie van browser | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/session/accounts/:id/forget` | index.ts | ankersessie van browser | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/session/bootstrap` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker + alsSysteem | ja | — | ja | — | audit-account, audit-rls | vault-meta.e2e, agent-namens, audit-account +8 |
| `POST /api/owner/session/handoff/create` | eigenaar-sessie-overdracht.ts | sessie (deps.requireSession) | — | gebruiker | ja | — | ja | — | audit-rls | audit-rls |
| `POST /api/owner/session/handoff/redeem` | eigenaar-sessie-overdracht.ts | sessie (deps.requireSession) | — | gebruiker | ja | — | ja | users | audit-rls | audit-rls |
| `POST /api/owner/session/logout-account-browser` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | beveiliging-review-20261021, sessie-tabbladen-20261020 | beveiliging-review-20261021, sessie-tabbladen-20261020 |
| `POST /api/owner/session/logout-account-everywhere` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/session/logout-browser-all` | index.ts | ankersessie van browser | — | gebruiker | — | — | — | — | beveiliging-review-20261021 | beveiliging-review-20261021 |
| `POST /api/owner/session/logout-current` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | ja | — | beveiliging-review-20261021, sleutelkluis-20261020 | beveiliging-review-20261021, sleutelkluis-20261020, stap-op-onthouden-20261020 |
| `POST /api/owner/session/refresh` | index.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | ja | — | — | — |
| `POST /api/owner/session/replace-tab-remembered` | index.ts | ankersessie van browser | — | gebruiker | ja | — | ja | users | account-wisselen-tech-20261020 | account-wisselen-tech-20261020 |
| `POST /api/owner/tech/activeren` | tech-routes.ts | sessie | — | gebruiker | — | ja | — | — | ai-hub, impersonatie | diagnose.e2e, flags.e2e, hulp/tech +10 |
| `POST /api/owner/tech/band` | tech-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/tech/beeindigen` | tech-routes.ts | sessie | — | gebruiker | — | — | — | — | ai-hub, tech-tabbladen | tech-assets.e2e, ai-hub, tech-tabbladen |
| `POST /api/owner/tech/delen` | tech-routes.ts | sessie | — | gebruiker | — | — | — | — | tech-tabbladen | tech-tabbladen |
| `POST /api/owner/tech/erven` | tech-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | tech-tabbladen | tech-tabbladen |
| `POST /api/owner/tech/intrekken` | tech-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/tech/profielen` | tech-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/tech/status` | tech-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | tech-profiel.e2e, ai-hub | diagnose.e2e, tech-profiel.e2e, ai-hub +5 |
| `POST /api/owner/tech/toekennen` | tech-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/owner/ui/preferences` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | menu-v2-meldingen.e2e, profiel-isolatie-20261019 | menu-v2-meldingen.e2e, profiel-isolatie-20261019, weergave-per-account-20261020 +1 |
| `POST /api/owner/ui/preferences/save` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | weergave-per-account-20261020 | weergave-per-account-20261020 |
| `POST /api/owner/ui/sidebar` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | menu-v2-indeling.e2e, menu-per-account-20261019 | menu-v2-indeling.e2e, menu-v2-snelheid.e2e, menu-per-account-20261019 +2 |
| `POST /api/owner/ui/sidebar/save` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | menu-v2-indeling.e2e, menu-per-account-20261019 | menu-v2-indeling.e2e, menu-v2-snelheid.e2e, menu-per-account-20261019 +2 |
| `POST /api/owner/ui/weergave` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | weergave-per-account-20261020 | weergave-per-account-20261020 |
| `POST /api/owner/ui/weergave/save` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | weergave-per-account-20261020 | weergave-per-account-20261020 |
| `POST /api/owner/ui/welkom/sluiten` | index.ts | eigenaars-/gebruikerssessie (ownerRequireSession) | — | gebruiker | — | — | — | — | gebruiker-audit-2026-10-19 | gebruiker-audit-2026-10-19 |
| `POST /api/owner/uitrol/bron` | uitrol-bron.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/uitrol/bron/instellen` | uitrol-bron.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/uitrol/diagnose` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | uitrol-diagnose-run |
| `POST /api/owner/uitrol/diagnose/uitvoeren` | uitrol-diagnose-run.ts | sessie (deps.requireSession) | — | gebruiker | — | — | — | — | — | uitrol-diagnose-run |
| `POST /api/owner/uitrol/github/instellingen` | uitrol-github.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | uitrol-pakketten | uitrol-pakketten |
| `POST /api/owner/uitrol/github/publiceren` | uitrol-github.ts | alleen rate-limiting | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/uitrol/github/stand` | uitrol-github.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | uitrol-pakketten | uitrol-pakketten |
| `POST /api/owner/uitrol/kandidaten` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/uitrol/live` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | foutuitleg-20261019 |
| `POST /api/owner/uitrol/log` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/uitrol/overzicht` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | uitrol-goedkeuring | gast-toegang.e2e, foutuitleg-20261019, uitrol-bron +1 |
| `POST /api/owner/uitrol/pakket/:runId` | uitrol-github.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | uitrol-pakketten | uitrol-pakketten |
| `POST /api/owner/uitrol/pakket/:runId/link` | uitrol-github.ts | alleen rate-limiting | — | gebruiker | — | — | — | — | uitrol-pakketten | uitrol-pakketten |
| `POST /api/owner/uitrol/pakketten/opruimen` | uitrol-github.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | uitrol-pakketten | uitrol-pakketten |
| `POST /api/owner/uitrol/pogingen` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | uitrol-pogingen-20261020 | uitrol-pogingen-20261020 |
| `POST /api/owner/uitrol/run` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | agent-namens |
| `POST /api/owner/uitrol/run/regels` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/uitrol/runs` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | — | agent-namens |
| `POST /api/owner/uitrol/voorbereiders/intrekken` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/uitrol/voorbereiders/termijn` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | ja | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/uitrol/voorbereiders/toevoegen` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | ja | — | — | stap-op-onthouden-20261020, uitrol-goedkeuring | stap-op-onthouden-20261020, uitrol-goedkeuring, uitrol-pogingen-20261020 |
| `POST /api/owner/uitrol/voorstel/afwijzen` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/uitrol/voorstel/goedkeuren` | uitrol-goedkeuring.ts | alleen rate-limiting | — | gebruiker | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/uitrol/voorstel/uitdaging` | uitrol-goedkeuring.ts | alleen eigenaar (wrapper eigenaar()) | — | gebruiker | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/vensters/laden` | vensters-onthouden.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | — | — | — | — | vensters-onthouden-20261020 | vensters-onthouden-20261020 |
| `POST /api/owner/vensters/opslaan` | vensters-onthouden.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | — | — | — | — | vensters-onthouden-20261020 | vensters-onthouden-20261020 |
| `POST /api/owner/weergave` | weergave.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | impersonatie | impersonatie |
| `POST /api/owner/weergave/zet` | weergave.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | impersonatie | impersonatie |
| `POST /api/owner/zoek` | globaal-zoek.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | — | — | — | — | zoek-index-beheer-20261022, zoek-isolatie-20261022 | hulp/stand-zoek, zoek-index-beheer-20261022, zoek-isolatie-20261022 +1 |
| `POST /api/owner/zoek/bronnen/stand` | zoek/bronnen.ts | sessie/recht (weigering 401/403 in module) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/zoek/bronnen/vernieuwen` | zoek/bronnen.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | ja | — | — | — | — | — |
| `POST /api/owner/zoek/geschiedenis/bewaren` | zoek-geschiedenis.ts | modulewrapper met() (sessiecontrole intern) | ja | gebruiker | — | — | — | — | zoek-isolatie-20261022 | zoek-isolatie-20261022 |
| `POST /api/owner/zoek/geschiedenis/lijst` | zoek-geschiedenis.ts | modulewrapper met() (sessiecontrole intern) | ja | gebruiker | — | — | — | — | zoek-isolatie-20261022 | zoek-isolatie-20261022 |
| `POST /api/owner/zoek/geschiedenis/open` | zoek-geschiedenis.ts | modulewrapper met() (sessiecontrole intern) | ja | gebruiker | — | — | — | — | zoek-isolatie-20261022 | zoek-isolatie-20261022 |
| `POST /api/owner/zoek/geschiedenis/wis` | zoek-geschiedenis.ts | modulewrapper met() (sessiecontrole intern) | ja | gebruiker | — | — | — | — | zoek-isolatie-20261022 | zoek-isolatie-20261022 |
| `POST /api/owner/zoek/geschiedenis/wis-alles` | zoek-geschiedenis.ts | modulewrapper met() (sessiecontrole intern) | ja | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/zoek/index/geschiedenis` | zoek/beheer.ts | modulewrapper met() (sessiecontrole intern) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/zoek/index/stand` | zoek/beheer.ts | modulewrapper met() (sessiecontrole intern) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/zoek/index/starten` | zoek/beheer.ts | modulewrapper met() (sessiecontrole intern) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/zoek/index/stoppen` | zoek/beheer.ts | modulewrapper met() (sessiecontrole intern) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/zoek/stand` | globaal-zoek.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | — | — | — | — | — | — |
| `POST /api/owner/zoek/suggesties` | globaal-zoek.ts | sessie/recht (weigering 401/403 in module) | ja | gebruiker | — | — | — | — | zoek-isolatie-20261022 | zoek-isolatie-20261022 |
| `POST /api/security/overview` | index.ts | sessie (sessionContext) | — | systeem | ja | — | — | account_identities | impersonatie | impersonatie |
| `POST /api/service-handoff/consume` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service-handoff/consume-hub` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service-handoff/create` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service-handoff/create-from-service` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/account/delete` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/account/workspaces/:id/restore` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/admin/overview` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/admin/requests/:id` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/admin/users/:id` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/admin/users/:id/delete` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/admin/users/:id/recover` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/auth/logout` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/bootstrap` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/notifications/read` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/security/location` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/security/sessions` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/security/sessions/:id/revoke` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/service/security/sessions/revoke-all` | index.ts | — (verouderde route, 410) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/share/email` | index.ts | sessie (sessionContext) | — | gebruiker | ja | — | ja | workspace_members, users | audit-rls | audit-rls |
| `POST /api/share/join` | index.ts | sessie (sessionContext) | — | gebruiker + alsSysteem | ja | — | ja | workspaces, workspace_members | audit-rls | audit-rls |
| `POST /api/share/link` | index.ts | sessie (sessionContext) | — | gebruiker | ja | — | — | — | audit-rls | audit-rls |
| `POST /api/share/link/revoke` | index.ts | sessie (sessionContext) | — | gebruiker | ja | — | — | — | audit-rls | audit-rls |
| `POST /api/share/members` | index.ts | sessie (sessionContext) | — | gebruiker | ja | — | — | workspace_members | audit-rls | audit-rls |
| `POST /api/share/revoke` | index.ts | sessie (sessionContext) | — | gebruiker | ja | — | ja | workspace_members | audit-rls | audit-rls |
| `POST /api/share/role` | index.ts | sessie (sessionContext) | — | gebruiker | ja | — | ja | workspace_members | audit-rls | audit-rls |
| `POST /api/ssh-ca/beheer` | ssh-ca-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | ssh-ca-site | ssh-ca-site |
| `POST /api/ssh-ca/beheer/uitdaging` | ssh-ca-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/ssh-ca/intrekken` | ssh-ca-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | ssh-ca-site | ssh-ca-site |
| `POST /api/ssh-ca/lijst` | ssh-ca-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | ssh-ca-site | ssh-ca-site |
| `POST /api/ssh-ca/stand` | ssh-ca-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | ssh-ca-site | ssh-ca-site |
| `POST /api/ssh-ca/uitgifte` | ssh-ca-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/terminal/apparaten` | terminal-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/terminal/instelling` | terminal-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/terminal/opdracht` | terminal-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/terminal/opdracht-stand` | terminal-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/terminal/opdrachten` | terminal-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/terminal/openen` | terminal-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | ja | — | — | — | — |
| `POST /api/terminal/opname` | terminal-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/terminal/sessies` | terminal-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/terminal/sluiten` | terminal-routes.ts | sessie/recht (wrapper gate()) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/uitrol/poging/afgebroken` | uitrol-goedkeuring.ts | modulewrapper voorbereider() (sessiecontrole intern) | — | gebruiker | — | — | — | — | uitrol-pogingen-20261020 | uitrol-pogingen-20261020 |
| `POST /api/uitrol/voorstel/annuleren` | uitrol-goedkeuring.ts | modulewrapper voorbereider() (sessiecontrole intern) | — | gebruiker | — | — | — | — | — | — |
| `POST /api/uitrol/voorstel/begin` | uitrol-goedkeuring.ts | modulewrapper voorbereider() (sessiecontrole intern) | — | gebruiker | — | — | — | — | bestand-lezen-fout-20261020, uitrol-goedkeuring | bestand-lezen-fout-20261020, uitrol-goedkeuring, uitrol-pogingen-20261020 |
| `POST /api/uitrol/voorstel/klaar` | uitrol-goedkeuring.ts | modulewrapper voorbereider() (sessiecontrole intern) | — | gebruiker | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/uitrol/voorstel/status` | uitrol-goedkeuring.ts | modulewrapper voorbereider() (sessiecontrole intern) | — | gebruiker | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/uitrol/voorstel/stuk` | uitrol-goedkeuring.ts | modulewrapper voorbereider() (sessiecontrole intern) | — | gebruiker | — | — | — | — | uitrol-goedkeuring, uitrol-pogingen-20261020 | uitrol-goedkeuring, uitrol-pogingen-20261020 |
| `POST /api/workspace/load` | index.ts | sessie (sessionContext) | ja | gebruiker | ja | — | — | workspace_blocks | audit-rls, ruimte-aanvallen-20261022 | audit-rls, ruimte-aanvallen-20261022 |
| `POST /api/workspaces/:id/blocks/reset` | index.ts | sessie (sessionContext) | ja | gebruiker | ja | — | ja | workspace_blocks | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |

## 2. Routes met persoonlijke tabellen zonder aanvalstest (statische analyse)

Routes buiten admin-/systeemroutes die persoonlijke tabellen raken en waarvoor geen enkele test ze namens twee accounts aanroept. Op 22-10-2026 waren dat er 23; na de tests in `ruimte-aanvallen-20261022` (§1–§5) staat de lijst hieronder (doel: leeg).

| Route | Poort | Tabellen | WHERE | RLS-groep |
|---|---|---|---|---|
| — (geen: elke route met persoonlijke tabellen heeft een aanvalstest) | | | | |

## 3. Routes zonder herkende poort (handmatige controle)

| Route | Bestand | Eerste 160 tekens van de handler |
|---|---|---|
| — (geen: bij elke route is een poort herkend) | | |

## 4. Hoe isolatie werkt (samenvatting voor de eigenaar)

1. **Sessie → gebruikerscontext.** Elke poort roept na een geslaagde controle `zetGebruiker(userId)` aan; alle volgende `db.*`/`gebruiker()`-queries van dit verzoek draaien onder de rol `mijnruimte_app` met `SET LOCAL app.user_id` (`server/platform/db.ts`). De RLS-policies (0004/0007/0033) zien alleen `owner_id = app.huidige_gebruiker()` of werkruimtes waarvan de gebruiker lid is. Zolang een RLS-groep in de modus «audit» staat, worden rijen die door RLS zouden zijn geweigerd geteld in `app.rls_audit` — dat is de pagina «Controle» («Звірка»).
2. **Expliciete WHERE in de code.** Los van RLS filtert elke handler op `userId`/`ownerUserId`/`recipientUserId` (kolom «WHERE»), en `workspaceAccess()` controleert het lidmaatschap van de werkruimte voordat blokken worden gelezen.
3. **Lade van de server.** De persoonlijke/technische ruimte (`ruimte`) wordt op de server berekend uit de activering van het technisch profiel in het tabblad (`gegevensRuimteVeilig`); de request-body kan deze hooguit inperken, nooit verruimen.
4. **Systeemstappen zijn expliciet.** `alsSysteem(...)` wordt uitsluitend gebruikt waar een actie rechtmatig betrekking heeft op een ander account (melding aan de eigenaar, ankersessie van de browser), voorzien van het commentaar «bewuste systeemstap» en een aanvalstest (`ruimte-aanvallen-20261022`).
5. **Beheerroutes** (`/api/owner/admin/*`, `/api/admin/*`, `/api/owner/audit/beheer/*`) — systeemcontext met eigen controle op bevoegdheden (`adminContext(…, "users.manage")` enz.) en step-up; deze worden afgedekt door de tests `audit-toegang`, `gebruiker-audit-2026-10-19` en `impersonatie`.

Volledige lijst van routes met aanvalstests die op 22-10-2026 zijn toegevoegd: zie `tests/eenheid/ruimte-aanvallen-20261022.test.ts` (bestandskop).

## 5. Drie meldingen op de pagina «Controle» («Звірка», 22-10-2026) — oorzaak en oplossing

| Route · tabel · actie | Oorzaak | Oplossing | Test |
|---|---|---|---|
| `POST /api/owner/session/bootstrap` · owner_browser_grants_v1 · lezen · 74× | Na «Account wisselen in dit tabblad» (B-005) is het tabbladaccount ≠ het ankeraccount van de browser. Bootstrap geeft de cookie «browser onthouden» van het ANKER opnieuw uit door de bijbehorende grant te lezen in de context van het TABBLAD-account → de RLS-emulatie telt het lezen van een rij van een ander account. Er is geen datalek (de rij wordt alleen geselecteerd op `grantId` van de eigen ankersessie en het antwoord bevat uitsluitend de ankercookie), maar met ingeschakelde RLS zou het lezen wegvallen en de cookie niet worden vernieuwd. | Bewuste systeemstap (`alsSysteem`) met de EXPLICIETE voorwaarde `grant.userId === anker.userId` en toelichting in `backend/index.ts` (bootstrap). Een vreemde id (zelfs vervalst in een ankersessie) → «niet gevonden», er wordt geen cookie uitgegeven. | `ruimte-aanvallen-20261022` §1 (4× bootstrap in tabblad van ander account → 0 in `app.rls_audit`; vervalste `grantId` → geen cookie) |
| `POST /api/access/request` · notification_jobs · toevoegen · 2× | E-mail-/telegramtaken «nieuw toegangsverzoek» werden aangemaakt ZONDER ontvanger (`owner_id` NULL) namens de aanvrager: onder RLS mag de aanvrager geen rij invoegen die aan niemand toebehoort. | Ontvanger = eigenaar (`recipientUserId` → `owner_id`), `sfeer: technisch`, invoegen als bewuste systeemstap (zoals `notify()`); zonder eigenaarsaccount wordt er geen taak aangemaakt. | `ruimte-aanvallen-20261022` §2 (aanvrager C → 2 taken met `owner_id` van eigenaar, 0 in controle; geen enkele taak met `owner_id` C) |
| `POST /api/workspace/load` · workspace_blocks · toevoegen · 6× | FOUT-POSITIEF van de emulatie (geen lek): de eigenaar (die al een persoonlijke ruimte had) opende voor het eerst de hub in een TECHNISCH tabblad → `load` maakte «Mijn ruimte — technisch» + 6 blokken aan. De werkruimtecache van het verzoek (`c.werkruimtes`) was berekend VÓÓR het invoegen van de ruimte en kende het nieuwe id nog niet → 6 «schendingen». De echte policy (`app.mijn_werkruimtes`, live) staat deze inserts gewoon toe. | `server/platform/rls-audit.ts`: na elke schrijfactie in `workspaces`/`workspace_members` vergeet het verzoek de cache (synchroon, vóór de eerste `await`) → de volgende controle leest na de commit uit de database. | `ruimte-aanvallen-20261022` §3 (A met persoonlijke ruimte + technische activering → technische ruimte + 6 blokken, 0 in controle; op oude code — 6) |

**Oude tellers.** Migratie `0108_zvirka_verholpen.sql` verwijdert uit `app.rls_audit` precies deze drie combinaties (alleen records die op het moment van migratie al bestonden; alle overige tellers blijven behouden). Zonder deze migratie zou de pagina «Er zijn nog schendingen: 74/2/6» blijven tonen en zou `db-rollen-instellen.sh rls-groep … aan` weigeren de groepen «verbindingen», «meldingen» en «werkruimtes» in te schakelen. Verschijnt er na de update nog een teller met een tijdstip VÓÓR de activering van de nieuwe release, dan betreft het een oud proces in het tijdsvenster tussen migratie en herstart; met een tijdstip ERNA is het een echte melding die onderzocht moet worden (`sudo deploy/db-rollen-instellen.sh status`).

**Wat de controle nog meer toont en GEEN codefout is.** In de modus «audit» telt de teller ook aanvalspogingen die door de code zijn afgewezen: bijvoorbeeld wanneer B `blocks/<id-A>/update` aanroept → de handler leest de rij op id (om 403 terug te geven) en de RLS-emulatie telt «lezen workspace_blocks». Met ingeschakelde RLS geeft datzelfde verzoek direct 404 zonder te lezen. Na het inschakelen van de groep verdwijnen zulke meldingen dus; tot die tijd kunnen incidentele «lezen»-regels op routes met `:id` sporen zijn van afgewezen pogingen en geen datalekken (de pagina toont alleen de teller zonder inhoud).

**Grenzen van deze tabel.** De kolommen «Tabellen/WHERE/Schrijft» weerspiegelen uitsluitend de body van de routehandler; gegevenstoegang binnen de afzonderlijke modules (post, cloud, agenda, zoeken, agenten) vindt plaats in hun eigen functies en wordt gedekt door hun eigen tests (`ruimte-mail-20261020`, `ruimte-cloud-agenda-20261020`, `ruimte-drive-projectie-20261020`, `ruimte-bord-github-20261020`, `ruimte-ai-20261020`, `rls-groepen`, `audit-rls`, `zoek-*`). De routes van de aanmeldstroom (`identity/redirect/finalize`, `identity/transactions/redeem`) werken met eenmalige transacties die gebonden zijn aan tabblad, herkomst, geheim en browsercookie; de aanvalstest met twee accounts staat in `ruimte-aanvallen-20261022` §5 (vreemde transactie vanuit een ander tabblad → `OWNER_TAB_MISMATCH`, met vreemd tabblad zonder geheim → `OWNER_REDEEM_SECRET_MISMATCH`, hergebruik → 409, finalize zonder/met vervalste cookie → 401; browser B blijft B).
