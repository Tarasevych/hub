> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./MAATREGELEN-PER-ROUTE-20261022.md)) · [🇳🇱 **Nederlandse versie**](./MAATREGELEN-PER-ROUTE-20261022.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../../docs/INDEX.md)

# Заходи безпеки за маршрутами (22.10.2026, зона C)

Згенеровано `node scripts/beveiliging-routes-inventaris.mjs` зі статичного аналізу `backend/*.ts` і `tests/**`. Це карта покриття для відповіді на питання власника: «чи безпека забезпечена і покрита на всіх сторінках, і чи неможливо через код чи спроби взлому потрапити в чужий простір». Стовпці:

- **Гейт** — яка перевірка відкриває маршрут (сесія користувача, лише власник, технічний профіль, токен агента, системний маршрут з власним контролем прав, публічний).
- **Лада** — чи маршрут обчислює ладу (userId + ruimte) на сервері (`bordLade`, `mailLade`, `gegevensRuimteVeilig`, …), а не бере її з тіла запиту.
- **RLS** — запити йдуть через `db.*`/`gebruiker()` у контексті користувача (`zetGebruiker` після гейта): політики `app.records` (0007/0033) і RLS таблиць застосовуються; **системна** = свідомий `alsSysteem` або системний маршрут (BYPASSRLS, контроль прав у коді).
- **WHERE** — явний фільтр за власником (`userId`/`ownerUserId`/`recipientUserId`/`user_id = $n`) у самому обробнику.
- **Step-up** — маршрут вимагає свіжого підтвердження (passkey/Google step-up) для чутливих дій.
- **Тест 2 користувачі** — тест, що викликає маршрут від імені двох акаунтів і перевіряє відмову для чужого (атакуючий тест). «Тести» — будь-який тест, що згадує маршрут.
- **Особисті таблиці** — таблиці з груп RLS (0033) чи особистих app-таблиць, яких торкається обробник.

Маршрутів: **682** (POST 658, GET 22, інші 2). З особистими таблицями: **33**, з них без атакуючого тесту (поза admin/системними): **0** (список у §2). Без розпізнаного гейта: **0** (§3 — перевірені вручну).

## 1. Таблиця маршрутів

| Маршрут | Файл | Гейт | Лада | RLS | WHERE | Step-up | Пише | Особисті таблиці | Тест 2 корист. | Тести |
|---|---|---|---|---|---|---|---|---|---|---|
| `DELETE /api/connector-v2/:agent/rpc` | mcp-connector-routes.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `DELETE /api/mcp-connector/rpc` | mcp-connector-routes.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `GET /api/_healthcheck` | index.ts | делеговано модулю (див. файл) | — | користувач | — | — | — | — | admin-diagnostiek, diagnose | admin-diagnostiek, beveiliging-schakelaars, diagnose +1 |
| `GET /api/auth/google` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `GET /api/auth/methods` | index.ts | делеговано модулю (див. файл) | — | користувач | — | — | — | — | — | — |
| `GET /api/connector-v2/:agent/prm` | mcp-connector-routes.ts | публічні метадані ресурсу | — | користувач | — | — | — | — | — | — |
| `GET /api/connector-v2/:agent/rpc` | mcp-connector-routes.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `GET /api/mail/list` | rbac.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `GET /api/mcp-connector/asm` | mcp-connector-routes.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `GET /api/mcp-connector/authorize` | mcp-connector-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `GET /api/mcp-connector/prm` | mcp-connector-routes.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `GET /api/mcp-connector/rpc` | mcp-connector-routes.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `GET /api/owner/agents/extensie-beheer` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling |
| `GET /api/owner/agents/extensie-matrix` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `GET /api/owner/agents/extensie-status` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | ai-hub, ai-toegang-beheer | ai-hub, ai-toegang-beheer, extensie-ontgrendeling +1 |
| `GET /api/owner/agents/kleuren` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `GET /api/owner/agents/self` | connectors-routes.ts | токен агента (agentSelf) | — | користувач | — | — | — | — | agents, extensie-vergrendeling | agents, extensie-beheer, extensie-profielen +1 |
| `GET /api/owner/agents/ws-ticket` | connectors-routes.ts | bearer-токен | — | користувач | — | — | — | — | extensie-vergrendeling | extensie-profielen, extensie-vergrendeling |
| `GET /api/owner/auth/google/callback` | index.ts | публічний (без сесії) | — | — (без сесії) | так | — | так | — | hulp/nep-google | hulp/nep-google, tabbladen |
| `GET /api/owner/github/oauth/callback` | github-platform.ts | лише обмеження частоти | — | користувач | так | — | — | — | integraties-wizard-20261020 | integraties-wizard-20261020 |
| `GET /api/owner/session/who` | index.ts | якірна сесія браузера | — | користувач | — | — | — | — | — | — |
| `GET /api/owner/system/manifest` | index.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `GET /api/v1/me` | api-platform-tokens.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `GET /api/version` | index.ts | делеговано модулю (див. файл) | — | користувач | — | — | — | — | — | foutuitleg-20261019, nieuwe-versie, release-info +1 |
| `POST /api/access/request` | index.ts | сесія (sessionContext) | — | користувач + alsSysteem | так | — | так | users, notification_jobs | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/account/delete` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | так | — | — | audit-account, audit-rls | audit-account, audit-rls |
| `POST /api/account/overview` | index.ts | сесія (sessionContext) | — | користувач | — | — | — | — | — | — |
| `POST /api/account/recover` | index.ts | сесія (sessionContext) | — | користувач | — | — | — | — | audit-account, audit-rls | audit-account, audit-rls |
| `POST /api/account/workspaces/:id/restore` | index.ts | сесія (sessionContext) | — | користувач | — | — | так | workspaces | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/admin/overview` | index.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/admin/requests/:id` | index.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/admin/users/:id` | index.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/admin/users/:id/delete` | index.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/admin/users/:id/recover` | index.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/auth/broker/complete` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/auth/broker/request/complete` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/auth/broker/request/consume` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/auth/broker/request/create` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/auth/exchange` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/auth/google` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/auth/google/code` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/auth/google/start` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/auth/google/status` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/auth/logout` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/beheer/beleid/stand` | diagnose.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/beheer/flags` | flags.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | flags | flags.e2e, siem.e2e, ssh-ca.e2e +1 |
| `POST /api/beheer/flags/test` | flags.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | flags | flags |
| `POST /api/beheer/flags/verwijderen` | flags.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | flags | flags |
| `POST /api/beheer/flags/zetten` | flags.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | flags | siem.e2e, ssh-ca.e2e, flags |
| `POST /api/beheer/rls/groepen` | diagnose.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/beheer/siem/stand` | siem.ts | сесія (deps.requireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/blocks/:id/delete` | index.ts | сесія (sessionContext) | так | користувач | так | — | так | workspace_blocks | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/blocks/:id/delete` | rbac.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/blocks/:id/update` | index.ts | сесія (sessionContext) | так | користувач | так | — | так | workspace_blocks | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/blocks/add` | index.ts | сесія (sessionContext) | так | користувач | так | — | так | workspace_blocks | audit-rls | audit-rls |
| `POST /api/blocks/delete` | rbac.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `POST /api/bootstrap` | index.ts | сесія (sessionContext) | так | користувач | так | — | — | site_notifications, workspace_members, workspaces | ruimte-aanvallen-20261022 | meldingen-sferen-20261022, ruimte-aanvallen-20261022 |
| `POST /api/browser/accounts` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/browser/accounts/forget` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/browser/accounts/select` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/connector-v2/:agent/rpc` | mcp-connector-routes.ts | bearer OAuth-токен агента (rpc v2) | — | користувач | — | — | — | — | — | — |
| `POST /api/diagnose/gelezen` | diagnose.ts | сесія/право (обгортка gate()) | — | користувач | — | — | так | — | — | — |
| `POST /api/diagnose/melden` | diagnose.ts | сесія/право (обгортка gate()) | — | користувач | — | — | так | — | — | — |
| `POST /api/diagnose/meldingen` | diagnose.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/diagnose/server` | diagnose.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | diagnose.e2e |
| `POST /api/ecosystem/auth/remembered` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/ecosystem/auth/start` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/ecosystem/auth/status` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/ecosystem/bootstrap` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/ecosystem/handoff/exchange` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/ecosystem/logout` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/ecosystem/navigate` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/ecosystem/notifications/read` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/flags` | flags.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | flags, impersonatie | flags.e2e, flags, impersonatie |
| `POST /api/gast/bekijk` | toegangscodes-routes.ts | публічний (без сесії) | — | — (без сесії) | — | — | — | — | toegangscodes | gast-toegang.e2e, toegangscodes |
| `POST /api/gast/inwisselen` | toegangscodes-routes.ts | публічний (без сесії) | — | — (без сесії) | — | — | — | — | toegangscodes | toegangscodes |
| `POST /api/gast/sessie` | toegangscodes-routes.ts | публічний (без сесії) | — | — (без сесії) | — | — | — | — | toegangscodes | gast-toegang.e2e, toegangscodes |
| `POST /api/gast/uitloggen` | toegangscodes-routes.ts | публічний (без сесії) | — | — (без сесії) | — | — | — | — | toegangscodes | toegangscodes |
| `POST /api/identity/account/delete` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/identity/account/workspaces/:id/restore` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/identity/admin/overview` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/identity/admin/requests/:id` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/identity/admin/users/:id` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/identity/admin/users/:id/delete` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/identity/admin/users/:id/recover` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/identity/security/location` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/identity/security/sessions` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/identity/security/sessions/:id/revoke` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/identity/security/sessions/revoke-all` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/impersonatie/aanroep` | impersonatie-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | impersonatie | impersonatie |
| `POST /api/impersonatie/aanvragen` | impersonatie-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | impersonatie | impersonatie |
| `POST /api/impersonatie/band` | impersonatie-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | impersonatie | impersonatie |
| `POST /api/impersonatie/beeindigen` | impersonatie-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/impersonatie/journaal` | impersonatie-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/impersonatie/mijn-aanvragen` | impersonatie-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/impersonatie/toestaan` | impersonatie-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | impersonatie | impersonatie |
| `POST /api/impersonatie/voor-mij` | impersonatie-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | impersonatie | impersonatie |
| `POST /api/impersonatie/weigeren` | impersonatie-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/mail/update` | rbac.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `POST /api/mcp-connector/register` | mcp-connector-routes.ts | публічний OAuth-реєстрація (RFC 7591) | — | користувач | — | — | — | — | — | — |
| `POST /api/mcp-connector/revoke` | mcp-connector-routes.ts | публічний OAuth-відкликання | — | користувач | — | — | — | — | — | — |
| `POST /api/mcp-connector/rpc` | mcp-connector-routes.ts | bearer OAuth-токен агента (rpc) | — | користувач | — | — | — | — | — | — |
| `POST /api/mcp-connector/token` | mcp-connector-routes.ts | публічний OAuth-токен (код/refresh) | — | користувач | — | — | — | — | — | — |
| `POST /api/mcp/deur/token-check` | mcp-connector-routes.ts | токен агента (модуль) | — | користувач | — | — | — | — | mcp-een-klik | mcp-een-klik |
| `POST /api/notifications/read` | index.ts | сесія (sessionContext) | так | користувач | так | — | так | site_notifications | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/ofrep/v1/evaluate/flags` | flags.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | flags | flags.e2e, flags |
| `POST /api/ofrep/v1/evaluate/flags/:key` | flags.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | flags | flags.e2e, flags |
| `POST /api/ondersteuning/aanvragen` | ondersteuning-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | — | ondersteuning.e2e |
| `POST /api/ondersteuning/beeindigen` | ondersteuning-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/ondersteuning/mijn-aanvragen` | ondersteuning-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/ondersteuning/overzicht` | ondersteuning-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | ondersteuning.e2e |
| `POST /api/ondersteuning/toestaan` | ondersteuning-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | impersonatie | impersonatie |
| `POST /api/ondersteuning/voor-mij` | ondersteuning-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/ondersteuning/weigeren` | ondersteuning-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/access/binding/unbind` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/access/catalog` | toegangslaag.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/access/method/herstel` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | так | — | — | audit-toegang | audit-toegang |
| `POST /api/owner/access/method/unbind` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | так | — | — | audit-toegang | audit-toegang |
| `POST /api/owner/access/password/login` | toegangslaag.ts | публічний вхід (пароль + TOTP, обмеження частоти) | — | користувач | — | — | — | — | audit-toegang | audit-pad, audit-toegang |
| `POST /api/owner/access/password/remove` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/access/password/set` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | так | так | так | — | audit-toegang | audit-toegang |
| `POST /api/owner/access/phone/save` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | так | так | так | — | — | — |
| `POST /api/owner/access/policy/save` | toegangslaag.ts | сесія + право api-platform (ownerGate) | — | системний | — | так | — | — | — | — |
| `POST /api/owner/access/recovery/bekeken` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | — | так | — | passkeys | passkeys |
| `POST /api/owner/access/recovery/intrekken` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | так | так | — | passkeys | passkeys |
| `POST /api/owner/access/recovery/overzicht` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | — | — | — | passkeys | passkeys |
| `POST /api/owner/access/recovery/rotate` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | так | так | — | passkeys | passkeys |
| `POST /api/owner/access/request` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач + alsSysteem | так | — | так | users, notification_jobs | audit-rls | audit-rls |
| `POST /api/owner/access/snapshot` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | — | — | — | passkeys | passkeys |
| `POST /api/owner/access/stap-op` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | так | — | — | herstelcodes.e2e, audit-toegang | herstelcodes.e2e, audit-pad, audit-toegang +5 |
| `POST /api/owner/access/stap-op/methoden` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | так | — | — | passkeys, stap-op-onthouden-20261020 | passkeys, stap-op-onthouden-20261020 |
| `POST /api/owner/access/stap-op/onthouden` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | так | — | — | stap-op-onthouden-20261020 | stap-op-onthouden-20261020 |
| `POST /api/owner/access/stap-op/passkey` | toegangssleutels.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | так | — | — | passkeys, sleutelkluis-20261020 | passkeys, sleutelkluis-20261020, stap-op-onthouden-20261020 +2 |
| `POST /api/owner/access/stap-op/passkey/opties` | toegangssleutels.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | так | — | — | passkeys, sleutelkluis-20261020 | passkeys, sleutelkluis-20261020, stap-op-onthouden-20261020 +2 |
| `POST /api/owner/access/totp/confirm` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | — | так | — | audit-toegang, passkeys | audit-toegang, passkeys, stap-op-onthouden-20261020 |
| `POST /api/owner/access/totp/disable` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/access/totp/start` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | так | так | так | — | audit-toegang, passkeys | audit-toegang, passkeys, stap-op-onthouden-20261020 |
| `POST /api/owner/access/user/:id/method` | toegangslaag.ts | сесія + право api-platform (ownerGate) | — | системний | так | так | так | users | audit-toegang | audit-toegang |
| `POST /api/owner/access/user/:id/reset-password` | toegangslaag.ts | сесія + право api-platform (ownerGate) | — | системний | так | так | так | — | — | — |
| `POST /api/owner/access/webauthn/options` | toegangslaag.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/access/webauthn/register` | toegangslaag.ts | без сесії (не читає запит: каталог/стан/410) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/access/webauthn/remove` | toegangslaag.ts | сесія (локальний гейт модуля) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/admin/access-requests/:id` | index.ts | адмін-здатність (adminContext) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/bootstrap` | index.ts | адмін-здатність (adminContext) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/diagnostics` | index.ts | адмін-здатність (adminContext) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/diagnostiek/account` | admin-diagnostiek.ts | лише обмеження частоти | — | системний | — | — | — | — | diagnostiek-account | diagnostiek-account |
| `POST /api/owner/admin/diagnostiek/gebruiker` | admin-diagnostiek.ts | лише обмеження частоти | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/diagnostiek/historie` | admin-diagnostiek.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/diagnostiek/overzicht` | admin-diagnostiek.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/diagnostiek/rendering` | admin-diagnostiek.ts | лише обмеження частоти | — | системний | — | — | — | — | — | admin-diagnostiek-rook-20261022 |
| `POST /api/owner/admin/diagnostiek/uitvoeren` | admin-diagnostiek.ts | лише обмеження частоти | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/directory-connectors/save` | index.ts | адмін-здатність (adminContext) | — | системний | — | так | так | — | — | — |
| `POST /api/owner/admin/integraties/beleid` | beheer-integraties.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/integraties/controleer` | beheer-integraties.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | так | — | — | — |
| `POST /api/owner/admin/integraties/loskoppelen` | beheer-integraties.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/integraties/stand` | beheer-integraties.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/integraties/wizard/controleer` | integraties-wizard.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | так | — | integraties-wizard-20261020 | integraties-wizard-20261020 |
| `POST /api/owner/admin/integraties/wizard/stand` | integraties-wizard.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | integraties-wizard-20261020 | integraties-wizard-20261020 |
| `POST /api/owner/admin/integraties/wizard/vernieuwen` | integraties-wizard.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | integraties-wizard-20261020 | integraties-wizard-20261020 |
| `POST /api/owner/admin/media-generator/controleer` | dev-mg-routes.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/media-generator/opslaan` | dev-mg-routes.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/media-generator/stand` | dev-mg-routes.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/merk-bron/stand` | merk-bron.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/merk-bron/vernieuwen` | merk-bron.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | так | — | — | — |
| `POST /api/owner/admin/merk-bron/zetten` | merk-bron.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | merk-bron-20261021 | merk-bron-20261021 |
| `POST /api/owner/admin/merk-eigen/wissen` | merk-eigen.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/merk-eigen/zetten` | merk-eigen.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | mail-accounts-beheer-20261021 | mail-accounts-beheer-20261021 |
| `POST /api/owner/admin/oauth-policy/save` | index.ts | адмін-здатність (adminContext) | — | системний | — | так | — | — | — | — |
| `POST /api/owner/admin/overview` | beheer-overzicht.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | admin-overzicht, agent-namens |
| `POST /api/owner/admin/overview/layout` | beheer-overzicht.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/overview/layout/reset` | beheer-overzicht.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/overview/layout/save` | beheer-overzicht.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/admin/overview/snapshots` | beheer-overzicht.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | admin-overzicht |
| `POST /api/owner/admin/overview/user` | beheer-overzicht.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | admin-overzicht |
| `POST /api/owner/admin/roles/save` | index.ts | адмін-здатність (adminContext) | — | системний | так | так | так | users | — | — |
| `POST /api/owner/admin/sso-policy/save` | index.ts | адмін-здатність (adminContext) | — | системний | — | так | — | — | — | — |
| `POST /api/owner/admin/users/:id` | index.ts | адмін-здатність (adminContext) | — | системний | — | так | — | users | audit-account, audit-rls | audit-account, audit-rls, impersonatie +1 |
| `POST /api/owner/admin/users/:id/delete` | index.ts | адмін-здатність (adminContext) | — | системний | — | так | — | users | audit-account | audit-account |
| `POST /api/owner/admin/users/:id/recover` | index.ts | адмін-здатність (adminContext) | — | системний | — | так | — | — | audit-account | audit-account |
| `POST /api/owner/admin/users/pagina` | index.ts | адмін-здатність (adminContext) | — | системний | — | — | — | users | — | — |
| `POST /api/owner/agenda/caldav/koppelen` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/caldav/vernieuwen` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/caldav/verwijderen` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | agenda-tweerichting-20261020, hub-agenda-notities-20261019 |
| `POST /api/owner/agenda/gebeurtenis/aanmaken` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis/antwoord` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis/deelnemers` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis/verplaatsen` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis/verwijderen` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/gebeurtenis/wijzigen` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/ics/schakelen` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/ics/toevoegen` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/ics/vernieuwen` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/ics/verwijderen` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/lokaal` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/overzicht` | agenda-routes.ts | сесія (authorize модуля) | так | користувач | — | — | — | — | ruimte-cloud-agenda-20261020 | hub-agenda-notities-20261019, ruimte-cloud-agenda-20261020, tech-ruimte-pagina-20261020 |
| `POST /api/owner/agenda/synchroniseren` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agenda/toegang/uitbreiden` | agenda-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agent-namens/aanmaken` | agent-namens.ts | лише власник (обгортка eigenaar()) | — | користувач | так | так | — | — | — | agent-namens |
| `POST /api/owner/agent-namens/intrekken` | agent-namens.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | agent-namens |
| `POST /api/owner/agent-namens/lijst` | agent-namens.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | agent-namens |
| `POST /api/owner/agent-namens/spoken/opruimen` | agent-namens.ts | лише власник (обгортка eigenaar()) | — | користувач | — | так | — | — | — | agent-namens |
| `POST /api/owner/agents/:id/browser-enabled` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/agents/:id/command` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/:id/commands` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/:id/heartbeat` | connectors-routes.ts | сесія на будь-якій службі + право api-platform | — | користувач | — | — | — | — | gebruiker-audit-2026-10-19 | gebruiker-audit-2026-10-19 |
| `POST /api/owner/agents/:id/policy` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/:id/revoke` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/activity` | connectors-routes.ts | сесія на будь-якій службі + право api-platform | так | користувач | так | — | — | — | ruimte-aanvallen-20261022 | bevestig-toegang.e2e, meldingen-sferen-20261022, ruimte-aanvallen-20261022 |
| `POST /api/owner/agents/chat` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/chat/status` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/commands/:id/approve` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/agents/commands/:id/reject` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/diagnostics/archive` | connectors-routes.ts | bearer-токен | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/extensie-beheer` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling |
| `POST /api/owner/agents/extensie-beheer/beleid` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling |
| `POST /api/owner/agents/extensie-beheer/intrekken` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling |
| `POST /api/owner/agents/extensie-beheer/verlengen` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling |
| `POST /api/owner/agents/extensie-matrix` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/extensie-matrix/snel` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/extensie-matrix/zet` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/extensie-status` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | ai-hub, ai-toegang-beheer | ai-hub, ai-toegang-beheer, extensie-ontgrendeling +1 |
| `POST /api/owner/agents/extensie/chat` | extensie-zijpaneel.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/journaal` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | так | — | — | — | gebruiker-audit-2026-10-19 | agenten.e2e, gebruiker-audit-2026-10-19 |
| `POST /api/owner/agents/kleuren` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/kleuren/zet` | extensie-ontgrendeling-routes.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/list` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | ai-toegang-beheer, extensie-ontgrendeling | ai-toegang-beheer, extensie-ontgrendeling, gebruiker-audit-2026-10-19 |
| `POST /api/owner/agents/opruimen` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | agents | agents |
| `POST /api/owner/agents/overdracht` | connectors-routes.ts | bearer-токен | — | користувач | — | — | — | — | — | agent-apps, apps-overdracht |
| `POST /api/owner/agents/overzicht` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | так | — | — | — | ai-toegang-beheer | agenten.e2e, ai-toegang-beheer |
| `POST /api/owner/agents/pair` | connectors-routes.ts | публічний: одноразовий код спарювання | — | користувач | так | — | — | — | extensie-vergrendeling, gebruiker-audit-2026-10-19 | apps-byos.e2e, terminal.e2e, extensie-beheer +3 |
| `POST /api/owner/agents/pairing-code` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | ruimte_dienst_stand | gebruiker-audit-2026-10-19 | apps-byos.e2e, terminal.e2e, gebruiker-audit-2026-10-19 |
| `POST /api/owner/agents/self` | connectors-routes.ts | токен агента (agentSelf) | — | користувач | — | — | — | — | agents, extensie-vergrendeling | agents, extensie-beheer, extensie-profielen +1 |
| `POST /api/owner/agents/tools/call` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/agents/tools/list` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/ai-beleid/ondertekenen` | ai-beleid.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | agent-namens |
| `POST /api/owner/ai-beleid/overzicht` | ai-beleid.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/ai-beleid/voorstel` | ai-beleid.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | ai-beleid.e2e |
| `POST /api/owner/ai-bevestiging/bevestigen` | ai-bevestiging-routes.ts | сесія (vooraf() модуля) | — | користувач | так | так | — | — | ai-bevestiging-20261021, dev-rechten-beheer-20261021 | ai-bevestiging-20261021, dev-rechten-beheer-20261021 |
| `POST /api/owner/ai-bevestiging/lijst` | ai-bevestiging-routes.ts | сесія (vooraf() модуля) | — | користувач | — | — | — | — | ai-bevestiging-20261021 | ai-bevestiging-20261021 |
| `POST /api/owner/ai-bevestiging/weigeren` | ai-bevestiging-routes.ts | сесія (vooraf() модуля) | — | користувач | так | — | — | — | ai-bevestiging-20261021 | ai-bevestiging-20261021 |
| `POST /api/owner/ai-bord` | mcp-connector-routes.ts | сесія акаунта (accountGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/ai-bord/modus` | mcp-connector-routes.ts | сесія акаунта (accountGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/ai-bord/token` | mcp-connector-routes.ts | сесія акаунта (accountGate) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/ai-rechten/fotos/sessie` | dev-rechten-gebruiker.ts | сесія | так | користувач | — | — | так | — | — | dev-rechten-gebruiker-20261021 |
| `POST /api/owner/ai-rechten/fotos/stand` | dev-rechten-gebruiker.ts | сесія | так | користувач | — | — | так | — | — | dev-rechten-gebruiker-20261021 |
| `POST /api/owner/ai-rechten/google-stand` | dev-rechten-gebruiker.ts | сесія користувача (обгортка mens()) | — | користувач | — | — | — | — | — | dev-rechten-gebruiker-20261021 |
| `POST /api/owner/ai-rechten/google-toegang` | dev-rechten-gebruiker.ts | сесія користувача (обгортка mens()) | — | користувач | — | — | — | — | — | dev-rechten-gebruiker-20261021 |
| `POST /api/owner/ai-site-schakelaars` | mcp-connector-routes.ts | сесія сайту (siteGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/ai-site-schakelaars/zet` | mcp-connector-routes.ts | сесія сайту (siteGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/ai-toegang/beheer` | mcp-connector-routes.ts | сесія акаунта (accountGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/ai-toegang/beheer/zet` | mcp-connector-routes.ts | сесія акаунта (accountGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/ai-toegang/overzicht` | mcp-connector-routes.ts | сесія акаунта (accountGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/ai-toegang/zet` | mcp-connector-routes.ts | сесія акаунта (accountGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/ai/block` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/ai/grants/add` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/ai/grants/list` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | так | — | — | — | ai-toegang-beheer | agenten.e2e, ai-toegang-beheer |
| `POST /api/owner/ai/grants/preset` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/ai/grants/revoke` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | ai-toegang-beheer | ai-toegang-beheer |
| `POST /api/owner/ai/settings` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/ai/stop` | connectors-routes.ts | сесія на будь-якій службі + право api-platform | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/ai/werkruimte/chat` | ai-werkruimte.ts | поорт служби (lade) | — | користувач | — | — | — | — | — | ai-werkruimte-20261019 |
| `POST /api/owner/ai/werkruimte/overzicht` | ai-werkruimte.ts | поорт служби (lade) | — | користувач | — | — | — | — | — | ai-werkruimte-20261019 |
| `POST /api/owner/api-platform/connections` | api-platform-verbindingen.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | audit-systeemrijen | audit-systeemrijen |
| `POST /api/owner/api-platform/connections/:id/status` | api-platform-verbindingen.ts | сесія + право api-platform (ownerGate) | — | користувач | так | — | так | — | — | — |
| `POST /api/owner/api-platform/contract` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | audit-systeemrijen | audit-systeemrijen |
| `POST /api/owner/api-platform/tokens` | api-platform-tokens.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/api-platform/tokens/:id/revoke` | api-platform-tokens.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/api-platform/tokens/create` | api-platform-tokens.ts | сесія + право api-platform (ownerGate) | — | користувач | так | — | так | — | — | — |
| `POST /api/owner/api-platform/tokens/verify` | api-platform-tokens.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/api-platform/vault` | api-platform-kluis.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | impersonatie, integraties-wizard-20261020 | agent-namens, geheimen, impersonatie +3 |
| `POST /api/owner/api-platform/vault/:id/delete` | api-platform-kluis.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | так | — | — | geheimen |
| `POST /api/owner/api-platform/vault/:id/meta` | api-platform-kluis.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | так | — | — | vault-meta |
| `POST /api/owner/api-platform/vault/:id/rename` | api-platform-kluis.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/api-platform/vault/:id/reveal` | api-platform-kluis.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | geheimen |
| `POST /api/owner/api-platform/vault/save` | api-platform-kluis.ts | сесія + право api-platform (ownerGate) | — | користувач | так | — | так | — | integraties-wizard-20261020 | geheimen, integraties-wizard-20261020, vault-meta |
| `POST /api/owner/apps/eigen-domein` | dev-mg-routes.ts | сесія користувача (обгортка mens()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/apps/geheimen` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | apps-overdracht |
| `POST /api/owner/apps/geheimen/:id` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | apps-overdracht |
| `POST /api/owner/apps/geheimen/:id/invullen` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | apps-overdracht |
| `POST /api/owner/apps/overzicht` | connectors-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/audit/beheer/controle` | index.ts | адмін-здатність (adminContext) | — | системний | так | — | — | — | — | — |
| `POST /api/owner/audit/beheer/lijst` | index.ts | адмін-здатність (adminContext) | — | системний | — | — | — | users | — | — |
| `POST /api/owner/audit/beheer/verwijderen` | index.ts | адмін-здатність (adminContext) | — | системний | так | так | — | — | — | — |
| `POST /api/owner/auth/google/callback` | index.ts | публічний (без сесії) | — | — (без сесії) | — | — | — | — | hulp/nep-google | hulp/nep-google, tabbladen |
| `POST /api/owner/auth/password/login` | toegangslaag.ts | публічний вхід (пароль + TOTP, обмеження частоти) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/besluit/ondertekenen` | eigenaar-besluit.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | besluit-app-20261022 | besluit-app-20261022 |
| `POST /api/owner/besluit/overzicht` | eigenaar-besluit.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | besluit-app-20261022 | besluit-app-20261022 |
| `POST /api/owner/besluit/starten` | eigenaar-besluit.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | besluit-app-20261022 | besluit-app-20261022 |
| `POST /api/owner/besluit/status` | eigenaar-besluit.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | besluit-app-20261022 | besluit-app-20261022 |
| `POST /api/owner/betalingen/stripe` | dev-mg-routes.ts | сесія користувача (обгортка mens()) | — | користувач | — | — | — | — | dev-rechten-media-github-20261021 | dev-rechten-media-github-20261021 |
| `POST /api/owner/beveiliging/aanzetten` | beveiliging-schakelaars.ts | поорт служби (lade) | — | користувач | — | так | — | — | — | beveiliging-schakelaars |
| `POST /api/owner/beveiliging/app-rol-maken` | beveiliging-schakelaars.ts | поорт служби (lade) | — | користувач | — | так | — | — | — | beveiliging-schakelaars |
| `POST /api/owner/beveiliging/stand` | beveiliging-schakelaars.ts | поорт служби (lade) | — | користувач | — | — | — | — | — | beveiliging-schakelaars |
| `POST /api/owner/beveiliging/uitzetten` | beveiliging-schakelaars.ts | поорт служби (lade) | — | користувач | — | — | — | — | — | beveiliging-schakelaars |
| `POST /api/owner/browser/accounts` | index.ts | лише id.* (identity authority) | — | — (без сесії) | — | — | — | users | — | — |
| `POST /api/owner/cloud/bootstrap` | cloud-platform.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | ruimte-cloud-agenda-20261020 | ruimte-cloud-agenda-20261020, tech-ruimte-pagina-20261020 |
| `POST /api/owner/cloud/capture` | cloud-platform.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/cloud/google-suite/calendar/calendars` | google-suite-agenda-fotos.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/calendar/events` | google-suite-agenda-fotos.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/drive/browse` | google-suite-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | mail-compose-venster.e2e, ruimte-drive-projectie-20261020 |
| `POST /api/owner/cloud/google-suite/drive/file` | google-suite-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | mail-compose-venster.e2e |
| `POST /api/owner/cloud/google-suite/drive/preview` | google-suite-inrichting.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/drive/replace` | google-suite-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/drive/update` | google-suite-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/drive/upload` | google-suite-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/onboarding/start` | google-suite-inrichting.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/onboarding/status` | google-suite-inrichting.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/onboarding/verify` | google-suite-inrichting.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/photos/import` | google-suite-agenda-fotos.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/cloud/google-suite/photos/item/preview` | google-suite-agenda-fotos.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/google-suite/photos/session/create` | google-suite-agenda-fotos.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/cloud/google-suite/photos/session/status` | google-suite-agenda-fotos.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/cloud/items/:id/open` | cloud-platform.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | — | — | так | — | — | — |
| `POST /api/owner/cloud/items/:id/place` | cloud-platform.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/cloud/items/:id/status` | cloud-platform.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/cloud/platform-status` | cloud-platform.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/providers/google/account/select` | cloud-google-drive.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/providers/google/connect/start` | cloud-google-drive.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/providers/google/disconnect` | cloud-google-drive.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/providers/status/verify` | cloud-google-drive.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/resume` | cloud-platform.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/search` | cloud-platform.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/cloud/workspaces/create` | cloud-platform.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/cognitive-context/load` | cognitief-context.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | — |
| `POST /api/owner/cognitive-context/save` | cognitief-context.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | так | — | — | — |
| `POST /api/owner/connector-v2/herverbind` | connector-v2-routes.ts | токен/сесія агента (metAgent) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/connector-v2/instellingen` | connector-v2-routes.ts | сесія (deps.gate) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/connector-v2/intrekken` | connector-v2-routes.ts | токен/сесія агента (metAgent) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/connector-v2/massa` | connector-v2-routes.ts | сесія (deps.gate) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/connector-v2/overzicht` | connector-v2-routes.ts | сесія (deps.gate) | — | користувач | — | так | — | — | gebruiker-audit-2026-10-19 | gebruiker-audit-2026-10-19 |
| `POST /api/owner/connector-v2/wijzig` | connector-v2-routes.ts | токен/сесія агента (metAgent) | — | користувач | — | — | — | — | — | agent-namens |
| `POST /api/owner/diagnostiek/mijn-diensten` | admin-diagnostiek.ts | сесія (deps.requireSession) | — | користувач | — | — | — | — | diagnostiek-account | tech-assets.e2e, diagnostiek-account |
| `POST /api/owner/externe-mcp/hulpmiddel` | mcp-klant-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/externe-mcp/overzicht` | mcp-klant-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | mcp-klant-20261020 | mcp-klant-20261020 |
| `POST /api/owner/externe-mcp/schakelen` | mcp-klant-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/externe-mcp/testen` | mcp-klant-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/externe-mcp/toevoegen` | mcp-klant-routes.ts | bearer-токен | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/externe-mcp/verwijderen` | mcp-klant-routes.ts | сесія (authorize модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/geheimen/historie` | geheimen.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | geheimen |
| `POST /api/owner/geheimen/lijst` | geheimen.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | impersonatie | agent-namens, geheimen, impersonatie |
| `POST /api/owner/github/actions` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/actions/logs` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/activity` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/app/installaties` | github-platform.ts | поорт служби (lade) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/app/verbinden` | github-platform.ts | поорт служби (lade) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/commits` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/issue/comment` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/issue/create` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/issues` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/koppeling` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | github-koppelkaart-20261019 |
| `POST /api/owner/github/oauth/start` | github-platform.ts | поорт служби (lade) | так | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/oauth/vernieuwen` | github-platform.ts | поорт служби (lade) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/ontkoppelen` | github-platform.ts | поорт служби (lade) | так | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/pr/voorstel` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/projects` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/readme` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/repo` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | site-tools | site-tools |
| `POST /api/owner/github/repos` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | site-tools | site-tools |
| `POST /api/owner/github/search` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/github/status` | github-platform.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/global-search` | globaal-zoek.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | — | — | — | — | site-tools | ruimte-drive-projectie-20261020, site-tools, tech-ruimte-pagina-20261020 |
| `POST /api/owner/google-contour` | google-contour.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/google-contour/delete` | google-contour.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/google-contour/keys` | google-contour.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/google-contour/reveal` | google-contour.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/google-contour/save` | google-contour.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/google-suite/callback` | index.ts | OAuth-callback (state + сесія в обробнику) | — | користувач | — | — | — | — | beveiliging-review-20261021, mail-accounts-beheer-20261021 | beveiliging-review-20261021, mail-accounts-beheer-20261021, merk-bron-google-20261021 |
| `POST /api/owner/hub/blocks/data` | hub-block-data.ts | сесія (authorize модуля) | так | користувач | — | — | — | — | — | hulp/stand-werkblad, ruimte-drive-projectie-20261020, tech-ruimte-pagina-20261020 |
| `POST /api/owner/hub/bureau/load` | hub-bureau.ts | лада бюро (bordLade) | так | користувач | так | — | — | — | — | hub-bureau-20261019 |
| `POST /api/owner/hub/bureau/save` | hub-bureau.ts | лада бюро (bordLade) | так | користувач | так | — | — | — | — | hub-bureau-20261019 |
| `POST /api/owner/hub/layouts/load` | hub-indeling-voorkeuren.ts | лада бюро (bordLade) | так | користувач | так | — | — | — | — | — |
| `POST /api/owner/hub/layouts/save` | hub-indeling-voorkeuren.ts | лада бюро (bordLade) | так | користувач | так | — | — | — | — | — |
| `POST /api/owner/hub/werkblad/bewaren` | werkblad.ts | обгортка модуля met() (перевірка сесії всередині) | так | користувач | — | — | — | — | — | — |
| `POST /api/owner/hub/werkblad/laden` | werkblad.ts | обгортка модуля met() (перевірка сесії всередині) | так | користувач | — | — | — | — | — | — |
| `POST /api/owner/hub/werkblad/tech` | werkblad.ts | обгортка модуля met() (перевірка сесії всередині) | так | користувач | — | — | — | — | — | — |
| `POST /api/owner/hub/werkblad/terugzetten` | werkblad.ts | обгортка модуля met() (перевірка сесії всередині) | так | користувач | — | — | — | — | — | — |
| `POST /api/owner/identity/account/delete` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | так | так | так | — | impersonatie | agent-namens, impersonatie |
| `POST /api/owner/identity/account/workspaces/:id/restore` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | так | workspaces | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/owner/identity/admin/overview` | index.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/identity/admin/requests/:id` | index.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/identity/admin/users/:id` | index.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/identity/admin/users/:id/delete` | index.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/identity/admin/users/:id/recover` | index.ts | системний маршрут (контроль прав у коді) | — | системний | — | — | — | — | — | — |
| `POST /api/owner/identity/redirect/finalize` | index.ts | якірна сесія браузера | — | користувач | так | так | так | users | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/owner/identity/security/emergency-revoke` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | так | — | так | — | — | tech-sessies |
| `POST /api/owner/identity/security/items/:id/revoke` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | так | — | — | tech-sessies |
| `POST /api/owner/identity/security/items/:id/stap-op-vergeten` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | так | — | — | stap-op-onthouden-20261020 | stap-op-onthouden-20261020 |
| `POST /api/owner/identity/security/items/:id/tech-beeindigen` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | tech-sessies |
| `POST /api/owner/identity/security/overview` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | так | так | — | — | impersonatie, stap-op-onthouden-20261020 | impersonatie, stap-op-onthouden-20261020, tech-sessies |
| `POST /api/owner/identity/security/revoke-all` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | так | — | — | — | impersonatie | agent-namens, impersonatie, tech-sessies |
| `POST /api/owner/identity/security/revoke-others` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | так | — | так | — | toegangscodes | tech-sessies, toegangscodes |
| `POST /api/owner/identity/transactions/attach` | index.ts | лише id.* (identity authority) | — | користувач | — | так | так | — | — | — |
| `POST /api/owner/identity/transactions/cancel` | index.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/identity/transactions/complete-remembered` | index.ts | лише id.* (identity authority) | — | — (без сесії) | — | — | так | users | — | — |
| `POST /api/owner/identity/transactions/create` | index.ts | якірна сесія браузера | — | — (без сесії) | — | так | так | — | audit-account, hulp/nep-google | audit-account, hulp/nep-google, tabbladen |
| `POST /api/owner/identity/transactions/redeem` | index.ts | якірна сесія браузера | — | користувач | так | так | так | users | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/owner/identity/transactions/status` | index.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/integraties/beschikbaar` | beheer-integraties.ts | сесія (deps.requireSession) | — | користувач | — | — | — | — | admin-integraties | admin-integraties |
| `POST /api/owner/journaal/beheer/export` | beheer-journaal-routes.ts | адмін-здатність (обгортка metAdmin()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/journaal/beheer/ketencontrole` | beheer-journaal-routes.ts | адмін-здатність (обгортка metAdmin()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/journaal/beheer/statistiek` | beheer-journaal-routes.ts | адмін-здатність (обгортка metAdmin()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/journaal/beheer/zoeken` | beheer-journaal-routes.ts | адмін-здатність (обгортка metAdmin()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/connect/start` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | так | — | так | — | — | — |
| `POST /api/owner/mail/accounts/:id/disconnect` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | mail-accounts-beheer-20261021 | mail-accounts-beheer-20261021 |
| `POST /api/owner/mail/accounts/:id/labels` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/labels/modify` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/messages` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/send` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/send/confirm` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/send/prepare` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/sync-health` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/:id/threads` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/accounts/link` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/mail/accounts/list` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/afzender-beelden` | merk-bron.ts | обгортка модуля mail() (перевірка сесії всередині) | так | користувач | — | — | — | — | merk-bron-20261021 | merk-bron-20261021, merk-bron-google-20261021 |
| `POST /api/owner/mail/afzender-beelden/google-toestemming` | merk-bron.ts | сесія (модуль) | — | користувач | — | — | — | — | — | merk-bron-google-20261021 |
| `POST /api/owner/mail/afzender-beelden/voorkeur` | merk-bron.ts | обгортка модуля mail() (перевірка сесії всередині) | так | користувач | — | — | — | — | — | merk-bron-google-20261021 |
| `POST /api/owner/mail/afzenders/audit/start` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/audit/status` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/audit/stop` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/bijwerken` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/controle` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/detail` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/intrekken` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/lijst` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/status` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | ruimte-mail-20261020 | hulp/stand-mail-nep, ruimte-mail-20261020 |
| `POST /api/owner/mail/afzenders/verifieren` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/vervangen` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/afzenders/verwijderen` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/ai-vertaling/run` | ai-vertaling-routes.ts | лише обмеження частоти | — | користувач | так | — | — | — | — | — |
| `POST /api/owner/mail/ai-vertaling/settings` | ai-vertaling-routes.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | ai-vertaling | ai-vertaling |
| `POST /api/owner/mail/ai-vertaling/state` | ai-vertaling-routes.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | ai-vertaling | ai-vertaling |
| `POST /api/owner/mail/bootstrap` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | audit-systeemrijen, beveiliging-review-20261021 | audit-systeemrijen, beveiliging-review-20261021, mail-accounts-beheer-20261021 +1 |
| `POST /api/owner/mail/compose/ai/reply` | ai-mail-assistent.ts | сесія (обгортка handler()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/ai/summarize` | ai-mail-assistent.ts | сесія (обгортка handler()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/ai/tone` | ai-mail-assistent.ts | сесія (обгортка handler()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/ai/transform` | ai-mail-assistent.ts | сесія (обгортка handler()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/draft/delete` | mail-opstel.ts | сесія пошти (gateOf модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/draft/get` | mail-opstel.ts | сесія пошти (gateOf модуля) | — | користувач | — | — | — | — | — | mail-compose-venster.e2e |
| `POST /api/owner/mail/compose/draft/list` | mail-opstel.ts | сесія пошти (gateOf модуля) | — | користувач | — | — | — | — | — | mail-compose-venster.e2e |
| `POST /api/owner/mail/compose/draft/save` | mail-opstel.ts | сесія пошти (gateOf модуля) | — | користувач | — | — | — | — | impersonatie | hulp/stand-opstellen, mail-compose-venster.e2e, impersonatie |
| `POST /api/owner/mail/compose/schedule` | mail-opstel.ts | сесія пошти (gateOf модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/scheduled/cancel` | mail-opstel.ts | сесія пошти (gateOf модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/scheduled/list` | mail-opstel.ts | сесія пошти (gateOf модуля) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/compose/send` | mail-opstel.ts | сесія пошти (gateOf модуля) | — | користувач | — | — | — | — | ruimte-mail-20261020 | mail-compose-venster.e2e, ruimte-mail-20261020 |
| `POST /api/owner/mail/contacten/contact` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/detail` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/lijst` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | ruimte-mail-20261020 | ruimte-mail-20261020 |
| `POST /api/owner/mail/contacten/scan/auto` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/scan/beleid` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/scan/pauze` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/scan/start` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/scan/status` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/scan/stop` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/contacten/verdacht` | mail-afzenders.ts | сесія + технічний профіль (обгортка route()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/account/disconnect` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/account/select` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | beveiliging-review-20261021 | beveiliging-review-20261021 |
| `POST /api/owner/mail/google-suite/accounts` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | audit-systeemrijen, beveiliging-review-20261021 | hulp/stand-mail-nep, hulp/stand-opstellen, mail-compose-venster.e2e +4 |
| `POST /api/owner/mail/google-suite/attachment` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | hulp/stand-mail-nep |
| `POST /api/owner/mail/google-suite/attachments/metadata` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | hulp/stand-mail-nep |
| `POST /api/owner/mail/google-suite/connect/start` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | audit-systeemrijen | audit-systeemrijen |
| `POST /api/owner/mail/google-suite/forward-attachment` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/labels` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | hulp/stand-mail-accounts, hulp/stand-mail-nep |
| `POST /api/owner/mail/google-suite/labels/create` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/labels/delete` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/labels/update` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/message` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | impersonatie, ruimte-mail-20261020 | hulp/stand-mail-nep, mail-lijst-ux.e2e, impersonatie +3 |
| `POST /api/owner/mail/google-suite/message/labels-set` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/message/modify` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | impersonatie, site-tools | impersonatie, site-tools |
| `POST /api/owner/mail/google-suite/message/raw` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/messages` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | mail_items_v1 | impersonatie, ruimte-mail-20261020 | hulp/stand-mail-nep, mail-lijst-ux.e2e, impersonatie +3 |
| `POST /api/owner/mail/google-suite/messages/bulk-modify` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/onboarding/start` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | beveiliging-review-20261021, gebruiker-audit-2026-10-19 | beveiliging-review-20261021, gebruiker-audit-2026-10-19, mail-accounts-beheer-20261021 +2 |
| `POST /api/owner/mail/google-suite/period-bounds` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/preview` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | hulp/stand-mail-accounts |
| `POST /api/owner/mail/google-suite/reader/capabilities` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reader/filter-similar` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reader/n10/capabilities` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reader/remote-image` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reader/translate` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reply` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/reply/reaction` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/save-drive` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/save-folders` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/save-targets` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/selection/resolve` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/sender/block-filter` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/state-bulk/status` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/state-bulk/submit` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/state-intents/status` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/state-intents/submit` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/subscriptions` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/thread` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | mail-lijst-ux.e2e |
| `POST /api/owner/mail/google-suite/thread/ignore` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google-suite/unsubscribe` | google-suite-mail-browser.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/google/accounts/:id/disconnect` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | так | — | так | — | beveiliging-review-20261021, mail-accounts-beheer-20261021 | beveiliging-review-20261021, mail-accounts-beheer-20261021 |
| `POST /api/owner/mail/google/pubsub/push` | index.ts | вебхук Google (перевірка підпису в обробнику) | — | користувач | — | — | — | — | audit-systeemrijen, ruimte-mail-20261020 | audit-systeemrijen, ruimte-mail-20261020 |
| `POST /api/owner/mail/handwriting/recognize` | mail-handschrift.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/imap/aanbieders` | mail-imap.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | — | — | — | — | mail-accounts-beheer-20261021 | mail-accounts-beheer-20261021 |
| `POST /api/owner/mail/imap/controleren` | mail-imap.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/imap/koppelen` | mail-imap.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | — | — | — | — | gebruiker-audit-2026-10-19, mail-accounts-beheer-20261021 | gebruiker-audit-2026-10-19, mail-accounts-beheer-20261021, mail-koppelen-20261020 |
| `POST /api/owner/mail/imap/ontkoppelen` | mail-imap.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | — | — | — | — | mail-accounts-beheer-20261021 | mail-accounts-beheer-20261021 |
| `POST /api/owner/mail/import` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | так | — | так | — | — | — |
| `POST /api/owner/mail/items/:id/update` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/mail/maintenance/run-once` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/microsoft/webhook` | index.ts | вебхук Microsoft (перевірка валідації в обробнику) | — | користувач | — | — | — | — | ruimte-mail-20261020 | ruimte-mail-20261020 |
| `POST /api/owner/mail/migration-inventory` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/notification-preferences/save` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/platform-status` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/resume` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/ruimte` | mail-ruimte-routes.ts | сесія (deps.requireSession) | так | користувач | — | — | — | — | ruimte-mail-20261020 | ruimte-mail-20261020 |
| `POST /api/owner/mail/search/advanced` | mail-search.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | — |
| `POST /api/owner/mail/search/local-period` | mail-search.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | — | — | — | — |
| `POST /api/owner/mail/sender-avatar/data` | mail-weergave-voorkeuren.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/sender-avatar/remove` | mail-weergave-voorkeuren.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/sender-avatar/set` | mail-weergave-voorkeuren.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mail/snooze/cancel` | mail-uitstel.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | так | — | — | — |
| `POST /api/owner/mail/snooze/list` | mail-uitstel.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | так | — | — | — |
| `POST /api/owner/mail/snooze/set` | mail-uitstel.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | так | — | — | — |
| `POST /api/owner/mail/view-preferences/load` | mail-weergave-voorkeuren.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | hulp/stand-mail-nep |
| `POST /api/owner/mail/view-preferences/save` | mail-weergave-voorkeuren.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | так | — | — | hulp/stand-mail-nep |
| `POST /api/owner/mail/view-preferences/section-display` | mail-weergave-voorkeuren.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | так | — | так | — | — | — |
| `POST /api/owner/mail/workers/run-once` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mcp-connector/approvals` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | gebruiker-audit-2026-10-19 | gebruiker-audit-2026-10-19, stapop-h4 |
| `POST /api/owner/mcp-connector/approvals/:id/approve` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | stapop-h4 |
| `POST /api/owner/mcp-connector/approvals/:id/reject` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mcp-connector/consent` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | stap-op-onthouden-20261020 | stap-op-onthouden-20261020, stapop-h4 |
| `POST /api/owner/mcp-connector/consent/info` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/mcp-connector/deur/intrekken` | mcp-connector-routes.ts | лише власник (модуль) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mcp-connector/deur/verbindingen` | mcp-connector-routes.ts | лише власник (модуль) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mcp-connector/duren` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/mcp-connector/duren/zet` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/mcp-connector/grants` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | ai-toegang-beheer | agenten.e2e, agent-namens, ai-toegang-beheer |
| `POST /api/owner/mcp-connector/grants/:id/revoke` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | ai-toegang-beheer | agenten.e2e, agent-namens, ai-toegang-beheer |
| `POST /api/owner/mcp-connector/tools` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | stapop-h4 |
| `POST /api/owner/mcp-connector/tools/set` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | так | — | — | — | stapop-h4 |
| `POST /api/owner/mcp-connector/tools/set-all` | mcp-connector-routes.ts | сесія + право api-platform (ownerGate) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/media/afbeelding` | dev-mg-routes.ts | сесія користувача (обгортка mens()) | — | користувач | так | — | — | — | dev-rechten-media-github-20261021 | dev-rechten-media-github-20261021 |
| `POST /api/owner/media/diagram` | dev-mg-routes.ts | сесія користувача (обгортка mens()) | — | користувач | — | — | — | — | dev-rechten-media-github-20261021 | dev-rechten-media-github-20261021 |
| `POST /api/owner/media/ontwerp-context` | dev-mg-routes.ts | сесія користувача (обгортка mens()) | — | користувач | — | — | — | — | dev-rechten-media-github-20261021 | dev-rechten-media-github-20261021 |
| `POST /api/owner/menu/tellers` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | menu-v2-meldingen.e2e, menu-meldingen | menu-v2-meldingen.e2e, menu-meldingen |
| `POST /api/owner/menu/tellers/weg` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | menu-meldingen | menu-meldingen |
| `POST /api/owner/menu/tellers/zet` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | menu-v2-meldingen.e2e, menu-meldingen | menu-v2-meldingen.e2e, menu-meldingen |
| `POST /api/owner/merk-beeld` | merk-bron.ts | сесія (модуль) | — | користувач | — | — | — | — | merk-bron-20261021 | merk-bron-20261021 |
| `POST /api/owner/merk-eigen/lijst` | merk-eigen.ts | сесія (deps.requireSession) | — | користувач | — | — | — | — | mail-accounts-beheer-20261021 | mail-accounts-beheer-20261021 |
| `POST /api/owner/notifications/read` | index.ts | сесія власника/користувача (ownerRequireSession) | так | користувач | так | — | так | site_notifications | impersonatie, ruimte-aanvallen-20261022 | impersonatie, meldingen-sferen-20261022, ruimte-aanvallen-20261022 +1 |
| `POST /api/owner/privacy/export` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/privacy/gebeurtenis` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/privacy/status` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/privacy/toestemming` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/profile/photo` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | так | users | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |
| `POST /api/owner/remote/hosts/opslaan` | extern-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/remote/openen` | extern-routes.ts | сесія | — | користувач | — | так | — | — | remote-bureaublad | remote-bureaublad |
| `POST /api/owner/remote/sessies` | extern-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/remote/sluiten` | extern-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/remote/stand` | extern-routes.ts | сесія | — | користувач | — | — | — | — | remote-bureaublad | remote-bureaublad |
| `POST /api/owner/remote/verbinding/opslaan` | extern-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | remote-bureaublad | remote-bureaublad |
| `POST /api/owner/remote/verbinding/testen` | extern-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | remote-bureaublad | remote-bureaublad |
| `POST /api/owner/remote/verbinding/verwijderen` | extern-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | remote-bureaublad | remote-bureaublad |
| `POST /api/owner/ruimte/besluit` | ruimte-scheiding-routes.ts | сесія/право (обгортка gate()) | — | користувач | так | так | — | — | ruimte-scheiding-20261020 | ruimte-scheiding-20261020 |
| `POST /api/owner/ruimte/dienst` | ruimte-scheiding-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | ruimte-scheiding-20261020 | ruimte-scheiding-20261020 |
| `POST /api/owner/ruimte/keuze` | ruimte-scheiding-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | ruimte-scheiding-20261020 | ruimte-scheiding-20261020 |
| `POST /api/owner/ruimte/overzicht` | ruimte-scheiding-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | ruimte-mail-20261020 | ruimte-mail-20261020 |
| `POST /api/owner/session/accounts` | index.ts | якірна сесія браузера | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/session/accounts/:id/forget` | index.ts | якірна сесія браузера | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/session/bootstrap` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач + alsSysteem | так | — | так | — | audit-account, audit-rls | vault-meta.e2e, agent-namens, audit-account +8 |
| `POST /api/owner/session/handoff/create` | eigenaar-sessie-overdracht.ts | сесія (deps.requireSession) | — | користувач | так | — | так | — | audit-rls | audit-rls |
| `POST /api/owner/session/handoff/redeem` | eigenaar-sessie-overdracht.ts | сесія (deps.requireSession) | — | користувач | так | — | так | users | audit-rls | audit-rls |
| `POST /api/owner/session/logout-account-browser` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | beveiliging-review-20261021, sessie-tabbladen-20261020 | beveiliging-review-20261021, sessie-tabbladen-20261020 |
| `POST /api/owner/session/logout-account-everywhere` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | так | — | — | — | — | — |
| `POST /api/owner/session/logout-browser-all` | index.ts | якірна сесія браузера | — | користувач | — | — | — | — | beveiliging-review-20261021 | beveiliging-review-20261021 |
| `POST /api/owner/session/logout-current` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | так | — | beveiliging-review-20261021, sleutelkluis-20261020 | beveiliging-review-20261021, sleutelkluis-20261020, stap-op-onthouden-20261020 |
| `POST /api/owner/session/refresh` | index.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | так | — | — | — |
| `POST /api/owner/session/replace-tab-remembered` | index.ts | якірна сесія браузера | — | користувач | так | — | так | users | account-wisselen-tech-20261020 | account-wisselen-tech-20261020 |
| `POST /api/owner/tech/activeren` | tech-routes.ts | сесія | — | користувач | — | так | — | — | ai-hub, impersonatie | diagnose.e2e, flags.e2e, hulp/tech +10 |
| `POST /api/owner/tech/band` | tech-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/tech/beeindigen` | tech-routes.ts | сесія | — | користувач | — | — | — | — | ai-hub, tech-tabbladen | tech-assets.e2e, ai-hub, tech-tabbladen |
| `POST /api/owner/tech/delen` | tech-routes.ts | сесія | — | користувач | — | — | — | — | tech-tabbladen | tech-tabbladen |
| `POST /api/owner/tech/erven` | tech-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | tech-tabbladen | tech-tabbladen |
| `POST /api/owner/tech/intrekken` | tech-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/tech/profielen` | tech-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/tech/status` | tech-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | tech-profiel.e2e, ai-hub | diagnose.e2e, tech-profiel.e2e, ai-hub +5 |
| `POST /api/owner/tech/toekennen` | tech-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | — | — |
| `POST /api/owner/ui/preferences` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | menu-v2-meldingen.e2e, profiel-isolatie-20261019 | menu-v2-meldingen.e2e, profiel-isolatie-20261019, weergave-per-account-20261020 +1 |
| `POST /api/owner/ui/preferences/save` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | weergave-per-account-20261020 | weergave-per-account-20261020 |
| `POST /api/owner/ui/sidebar` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | menu-v2-indeling.e2e, menu-per-account-20261019 | menu-v2-indeling.e2e, menu-v2-snelheid.e2e, menu-per-account-20261019 +2 |
| `POST /api/owner/ui/sidebar/save` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | menu-v2-indeling.e2e, menu-per-account-20261019 | menu-v2-indeling.e2e, menu-v2-snelheid.e2e, menu-per-account-20261019 +2 |
| `POST /api/owner/ui/weergave` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | weergave-per-account-20261020 | weergave-per-account-20261020 |
| `POST /api/owner/ui/weergave/save` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | weergave-per-account-20261020 | weergave-per-account-20261020 |
| `POST /api/owner/ui/welkom/sluiten` | index.ts | сесія власника/користувача (ownerRequireSession) | — | користувач | — | — | — | — | gebruiker-audit-2026-10-19 | gebruiker-audit-2026-10-19 |
| `POST /api/owner/uitrol/bron` | uitrol-bron.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/uitrol/bron/instellen` | uitrol-bron.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/uitrol/diagnose` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | uitrol-diagnose-run |
| `POST /api/owner/uitrol/diagnose/uitvoeren` | uitrol-diagnose-run.ts | сесія (deps.requireSession) | — | користувач | — | — | — | — | — | uitrol-diagnose-run |
| `POST /api/owner/uitrol/github/instellingen` | uitrol-github.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | uitrol-pakketten | uitrol-pakketten |
| `POST /api/owner/uitrol/github/publiceren` | uitrol-github.ts | лише обмеження частоти | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/uitrol/github/stand` | uitrol-github.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | uitrol-pakketten | uitrol-pakketten |
| `POST /api/owner/uitrol/kandidaten` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/uitrol/live` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | foutuitleg-20261019 |
| `POST /api/owner/uitrol/log` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/uitrol/overzicht` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | uitrol-goedkeuring | gast-toegang.e2e, foutuitleg-20261019, uitrol-bron +1 |
| `POST /api/owner/uitrol/pakket/:runId` | uitrol-github.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | uitrol-pakketten | uitrol-pakketten |
| `POST /api/owner/uitrol/pakket/:runId/link` | uitrol-github.ts | лише обмеження частоти | — | користувач | — | — | — | — | uitrol-pakketten | uitrol-pakketten |
| `POST /api/owner/uitrol/pakketten/opruimen` | uitrol-github.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | uitrol-pakketten | uitrol-pakketten |
| `POST /api/owner/uitrol/pogingen` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | uitrol-pogingen-20261020 | uitrol-pogingen-20261020 |
| `POST /api/owner/uitrol/run` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | agent-namens |
| `POST /api/owner/uitrol/run/regels` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/uitrol/runs` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | — | agent-namens |
| `POST /api/owner/uitrol/voorbereiders/intrekken` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/uitrol/voorbereiders/termijn` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | так | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/uitrol/voorbereiders/toevoegen` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | так | — | — | stap-op-onthouden-20261020, uitrol-goedkeuring | stap-op-onthouden-20261020, uitrol-goedkeuring, uitrol-pogingen-20261020 |
| `POST /api/owner/uitrol/voorstel/afwijzen` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/uitrol/voorstel/goedkeuren` | uitrol-goedkeuring.ts | лише обмеження частоти | — | користувач | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/uitrol/voorstel/uitdaging` | uitrol-goedkeuring.ts | лише власник (обгортка eigenaar()) | — | користувач | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/owner/vensters/laden` | vensters-onthouden.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | — | — | — | — | vensters-onthouden-20261020 | vensters-onthouden-20261020 |
| `POST /api/owner/vensters/opslaan` | vensters-onthouden.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | — | — | — | — | vensters-onthouden-20261020 | vensters-onthouden-20261020 |
| `POST /api/owner/weergave` | weergave.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | impersonatie | impersonatie |
| `POST /api/owner/weergave/zet` | weergave.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | impersonatie | impersonatie |
| `POST /api/owner/zoek` | globaal-zoek.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | — | — | — | — | zoek-index-beheer-20261022, zoek-isolatie-20261022 | hulp/stand-zoek, zoek-index-beheer-20261022, zoek-isolatie-20261022 +1 |
| `POST /api/owner/zoek/bronnen/stand` | zoek/bronnen.ts | сесія/право (відмова 401/403 у модулі) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/zoek/bronnen/vernieuwen` | zoek/bronnen.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | так | — | — | — | — | — |
| `POST /api/owner/zoek/geschiedenis/bewaren` | zoek-geschiedenis.ts | обгортка модуля met() (перевірка сесії всередині) | так | користувач | — | — | — | — | zoek-isolatie-20261022 | zoek-isolatie-20261022 |
| `POST /api/owner/zoek/geschiedenis/lijst` | zoek-geschiedenis.ts | обгортка модуля met() (перевірка сесії всередині) | так | користувач | — | — | — | — | zoek-isolatie-20261022 | zoek-isolatie-20261022 |
| `POST /api/owner/zoek/geschiedenis/open` | zoek-geschiedenis.ts | обгортка модуля met() (перевірка сесії всередині) | так | користувач | — | — | — | — | zoek-isolatie-20261022 | zoek-isolatie-20261022 |
| `POST /api/owner/zoek/geschiedenis/wis` | zoek-geschiedenis.ts | обгортка модуля met() (перевірка сесії всередині) | так | користувач | — | — | — | — | zoek-isolatie-20261022 | zoek-isolatie-20261022 |
| `POST /api/owner/zoek/geschiedenis/wis-alles` | zoek-geschiedenis.ts | обгортка модуля met() (перевірка сесії всередині) | так | користувач | — | — | — | — | — | — |
| `POST /api/owner/zoek/index/geschiedenis` | zoek/beheer.ts | обгортка модуля met() (перевірка сесії всередині) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/zoek/index/stand` | zoek/beheer.ts | обгортка модуля met() (перевірка сесії всередині) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/zoek/index/starten` | zoek/beheer.ts | обгортка модуля met() (перевірка сесії всередині) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/zoek/index/stoppen` | zoek/beheer.ts | обгортка модуля met() (перевірка сесії всередині) | — | користувач | — | — | — | — | — | — |
| `POST /api/owner/zoek/stand` | globaal-zoek.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | — | — | — | — | — | — |
| `POST /api/owner/zoek/suggesties` | globaal-zoek.ts | сесія/право (відмова 401/403 у модулі) | так | користувач | — | — | — | — | zoek-isolatie-20261022 | zoek-isolatie-20261022 |
| `POST /api/security/overview` | index.ts | сесія (sessionContext) | — | системний | так | — | — | account_identities | impersonatie | impersonatie |
| `POST /api/service-handoff/consume` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service-handoff/consume-hub` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service-handoff/create` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service-handoff/create-from-service` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/account/delete` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/account/workspaces/:id/restore` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/admin/overview` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/admin/requests/:id` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/admin/users/:id` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/admin/users/:id/delete` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/admin/users/:id/recover` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/auth/logout` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/bootstrap` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/notifications/read` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/security/location` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/security/sessions` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/security/sessions/:id/revoke` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/service/security/sessions/revoke-all` | index.ts | — (застарілий маршрут, 410) | — | користувач | — | — | — | — | — | — |
| `POST /api/share/email` | index.ts | сесія (sessionContext) | — | користувач | так | — | так | workspace_members, users | audit-rls | audit-rls |
| `POST /api/share/join` | index.ts | сесія (sessionContext) | — | користувач + alsSysteem | так | — | так | workspaces, workspace_members | audit-rls | audit-rls |
| `POST /api/share/link` | index.ts | сесія (sessionContext) | — | користувач | так | — | — | — | audit-rls | audit-rls |
| `POST /api/share/link/revoke` | index.ts | сесія (sessionContext) | — | користувач | так | — | — | — | audit-rls | audit-rls |
| `POST /api/share/members` | index.ts | сесія (sessionContext) | — | користувач | так | — | — | workspace_members | audit-rls | audit-rls |
| `POST /api/share/revoke` | index.ts | сесія (sessionContext) | — | користувач | так | — | так | workspace_members | audit-rls | audit-rls |
| `POST /api/share/role` | index.ts | сесія (sessionContext) | — | користувач | так | — | так | workspace_members | audit-rls | audit-rls |
| `POST /api/ssh-ca/beheer` | ssh-ca-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | ssh-ca-site | ssh-ca-site |
| `POST /api/ssh-ca/beheer/uitdaging` | ssh-ca-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | — | — |
| `POST /api/ssh-ca/intrekken` | ssh-ca-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | ssh-ca-site | ssh-ca-site |
| `POST /api/ssh-ca/lijst` | ssh-ca-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | ssh-ca-site | ssh-ca-site |
| `POST /api/ssh-ca/stand` | ssh-ca-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | ssh-ca-site | ssh-ca-site |
| `POST /api/ssh-ca/uitgifte` | ssh-ca-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | — | — |
| `POST /api/terminal/apparaten` | terminal-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/terminal/instelling` | terminal-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | — | — |
| `POST /api/terminal/opdracht` | terminal-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/terminal/opdracht-stand` | terminal-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/terminal/opdrachten` | terminal-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/terminal/openen` | terminal-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | так | — | — | — | — |
| `POST /api/terminal/opname` | terminal-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/terminal/sessies` | terminal-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/terminal/sluiten` | terminal-routes.ts | сесія/право (обгортка gate()) | — | користувач | — | — | — | — | — | — |
| `POST /api/uitrol/poging/afgebroken` | uitrol-goedkeuring.ts | обгортка модуля voorbereider() (перевірка сесії всередині) | — | користувач | — | — | — | — | uitrol-pogingen-20261020 | uitrol-pogingen-20261020 |
| `POST /api/uitrol/voorstel/annuleren` | uitrol-goedkeuring.ts | обгортка модуля voorbereider() (перевірка сесії всередині) | — | користувач | — | — | — | — | — | — |
| `POST /api/uitrol/voorstel/begin` | uitrol-goedkeuring.ts | обгортка модуля voorbereider() (перевірка сесії всередині) | — | користувач | — | — | — | — | bestand-lezen-fout-20261020, uitrol-goedkeuring | bestand-lezen-fout-20261020, uitrol-goedkeuring, uitrol-pogingen-20261020 |
| `POST /api/uitrol/voorstel/klaar` | uitrol-goedkeuring.ts | обгортка модуля voorbereider() (перевірка сесії всередині) | — | користувач | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/uitrol/voorstel/status` | uitrol-goedkeuring.ts | обгортка модуля voorbereider() (перевірка сесії всередині) | — | користувач | — | — | — | — | uitrol-goedkeuring | uitrol-goedkeuring |
| `POST /api/uitrol/voorstel/stuk` | uitrol-goedkeuring.ts | обгортка модуля voorbereider() (перевірка сесії всередині) | — | користувач | — | — | — | — | uitrol-goedkeuring, uitrol-pogingen-20261020 | uitrol-goedkeuring, uitrol-pogingen-20261020 |
| `POST /api/workspace/load` | index.ts | сесія (sessionContext) | так | користувач | так | — | — | workspace_blocks | audit-rls, ruimte-aanvallen-20261022 | audit-rls, ruimte-aanvallen-20261022 |
| `POST /api/workspaces/:id/blocks/reset` | index.ts | сесія (sessionContext) | так | користувач | так | — | так | workspace_blocks | ruimte-aanvallen-20261022 | ruimte-aanvallen-20261022 |

## 2. Маршрути з особистими таблицями без атакуючого тесту (статичний аналіз)

Маршрути поза admin-/системними, які торкаються особистих таблиць і для яких жоден тест не викликає їх від імені двох акаунтів. 22.10.2026 таких було 23; після тестів `ruimte-aanvallen-20261022` (§1–§5) — список нижче (ціль: порожній).

| Маршрут | Гейт | Таблиці | WHERE | RLS-група |
|---|---|---|---|---|
| — (немає: кожен маршрут з особистими таблицями має атакуючий тест) | | | | |

## 3. Маршрути без розпізнаного гейта (ручна перевірка)

| Маршрут | Файл | Перші 160 символів обробника |
|---|---|---|
| — (немає: у кожного маршруту розпізнано гейт) | | |

## 4. Як працює ізоляція (узагальнення для власника)

1. **Сесія → контекст користувача.** Кожен гейт після успішної перевірки викликає `zetGebruiker(userId)`; усі подальші `db.*`/`gebruiker()`-запити цього запиту йдуть від ролі `mijnruimte_app` із `SET LOCAL app.user_id` (server/platform/db.ts). Політики RLS (0004/0007/0033) бачать лише `owner_id = app.huidige_gebruiker()` або руімти, де користувач є учасником. Поки група RLS у режимі «аудит», рядки, які RLS відхилив би, рахуються в `app.rls_audit` — це і є сторінка «Звірка».
2. **Явний WHERE у коді.** Незалежно від RLS кожен обробник фільтрує за `userId`/`ownerUserId`/`recipientUserId` (стовпець «WHERE»), і `workspaceAccess()` перевіряє членство в робочому просторі перед читанням блоків.
3. **Лада з сервера.** Особистий/технічний простір (`ruimte`) обчислюється на сервері з активації технічного профілю у вкладці (`gegevensRuimteVeilig`); тіло запиту може лише звузити її, ніколи не розширити.
4. **Системні кроки — явні.** `alsSysteem(...)` вживається лише там, де запис законно стосується іншого акаунта (сповіщення власнику, якірна сесія браузера), з коментарем «бевуста системна стап» і атакуючим тестом (`ruimte-aanvallen-20261022`).
5. **Адміністративні маршрути** (`/api/owner/admin/*`, `/api/admin/*`, `/api/owner/audit/beheer/*`) — системний контекст із власною перевіркою здатностей (`adminContext(…, "users.manage")` тощо) і step-up; їх покривають тести `audit-toegang`, `gebruiker-audit-2026-10-19`, `impersonatie`.

Повний список маршрутів з атакуючими тестами, доданими 22.10.2026: див. `tests/eenheid/ruimte-aanvallen-20261022.test.ts` (шапка файла).

## 5. Три порушення зі сторінки «Звірка» (22.10.2026) — причина і виправлення

| Маршрут · таблиця · дія | Причина | Виправлення | Тест |
|---|---|---|---|
| `POST /api/owner/session/bootstrap` · owner_browser_grants_v1 · lezen · 74× | Після «Змінити акаунт у цій вкладці» (B-005) акаунт вкладки ≠ акаунт якоря браузера. Bootstrap перевидає cookie «запам’ятати браузер» ЯКОРЯ, читаючи його grant у контексті акаунта ВКЛАДКИ → RLS-емуляція рахує читання чужого рядка. Витоку немає (рядок обраний лише за `grantId` власної якірної сесії, у відповідь йде лише cookie якоря), але під увімкненим RLS читання б зникло і cookie не перевидавалась. | Свідомий системний крок (`alsSysteem`) з ЯВНОЮ умовою `grant.userId === anker.userId` і коментарем у `backend/index.ts` (bootstrap). Чужий id (навіть підроблений у якірній сесії) → «не знайдено», cookie не видається. | `ruimte-aanvallen-20261022` §1 (4× bootstrap у вкладці іншого акаунта → 0 у `app.rls_audit`; підроблений `grantId` → без cookie) |
| `POST /api/access/request` · notification_jobs · toevoegen · 2× | Задачі e-mail/telegram «новий запит на доступ» створювалися БЕЗ отримувача (`owner_id` NULL) від імені заявника: під RLS заявник не може вставити рядок, що нікому не належить. | Отримувач = власник (`recipientUserId` → `owner_id`), `sfeer: technisch`, вставка як свідомий системний крок (як `notify()`); без акаунта власника задача не створюється. | `ruimte-aanvallen-20261022` §2 (заявник C → 2 задачі з `owner_id` власника, 0 у звірці; жодної задачі з `owner_id` C) |
| `POST /api/workspace/load` · workspace_blocks · toevoegen · 6× | ХИБНЕ спрацювання емуляції (не дірка): власник (що вже мав особистий простір) уперше відкрив hub у ТЕХНІЧНІЙ вкладці → load створив «Мій простір — технічний» + 6 блоків. Кеш робочих просторів запиту (`c.werkruimtes`) був обчислений ДО вставки простору і не знав нового id → 6 «порушень». Справжня політика (`app.mijn_werkruimtes`, live) ці вставки дозволяє. | `server/platform/rls-audit.ts`: після кожного запису в `workspaces`/`workspace_members` запит забуває кеш (синхронно, до першого await) → наступна перевірка читає з бази після коміту. | `ruimte-aanvallen-20261022` §3 (A з особистим простором + технічна активація → технічний простір + 6 блоків, 0 у звірці; на старому коді — 6) |

**Старі лічильники.** Міграція `0108_zvirka_verholpen.sql` прибирає з `app.rls_audit` саме ці три комбінації (лише записи, що вже є на момент міграції; усі інші лічильники лишаються). Без неї сторінка й далі показувала б «Ще є порушення: 74/2/6», а `db-rollen-instellen.sh rls-groep … aan` відмовляв би вмикати групи «verbindingen», «meldingen», «werkruimtes». Якщо після оновлення з’явиться лічильник із часом ДО активації нового випуску — це старий процес у вікні між міграцією й перезапуском; з часом ПІСЛЯ — справжній, його треба дослідити (`sudo deploy/db-rollen-instellen.sh status`).

**Що ще показує звірка і НЕ є помилкою коду.** У режимі «аудит» лічильник рахує й спроби атаки, які код відхилив: наприклад, B викликає `blocks/<id-A>/update` → обробник читає рядок за id (щоб відповісти 403) і RLS-емуляція рахує «lezen workspace_blocks». Під увімкненим RLS той самий запит дасть 404 без читання. Тож після ввімкнення групи такі записи зникають; до того — одиничні «lezen» на маршрутах з `:id` можуть бути слідами відхилених спроб, не витоків (сторінка показує лише лічильник без вмісту).

**Межі цієї таблиці.** Стовпці «Таблиці/WHERE/Пише» відображають лише тіло обробника; доступ до даних у модулях (пошта, хмара, агенда, пошук, агенти) відбувається в їхніх функціях і покривається їхніми тестами (`ruimte-mail-20261020`, `ruimte-cloud-agenda-20261020`, `ruimte-drive-projectie-20261020`, `ruimte-bord-github-20261020`, `ruimte-ai-20261020`, `rls-groepen`, `audit-rls`, `zoek-*`). Маршрути потоку входу (`identity/redirect/finalize`, `identity/transactions/redeem`) працюють на одноразових транзакціях, прив’язаних до вкладки, походження, секрету й cookie браузера; атакуючий тест із двома акаунтами — `ruimte-aanvallen-20261022` §5 (чужа транзакція з іншої вкладки → OWNER_TAB_MISMATCH, з чужою вкладкою без секрету → OWNER_REDEEM_SECRET_MISMATCH, повтор → 409, finalize без/з підробленою cookie → 401; браузер B лишається B).
