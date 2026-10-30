#!/usr/bin/env node
// Inventaris van ALLE API-routes met hun beveiligingsmaatregelen (22.10.2026, zone C — vraag van de eigenaar: «чи безпека забезпечена
// і покрита на всіх сторінках, і чи неможливо … потрапити в чужий простір»). Leest backend/*.ts, zoekt per route de poort (gate), de
// tabellen die zij raakt, of zij een bewuste systeemstap doet, step-up eist, en of er een test is die de route bij naam noemt.
// Schrijft docs/beveiliging/MAATREGELEN-PER-ROUTE-<datum>.md (uk). Puur statisch: geen database, geen netwerk.
//   node scripts/beveiliging-routes-inventaris.mjs [--uit pad] [--json]
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const W = process.cwd();
const args = process.argv.slice(2);
const uitPad = args.includes('--uit') ? args[args.indexOf('--uit') + 1] : 'docs/beveiliging/MAATREGELEN-PER-ROUTE-20261022.md';
const alsJson = args.includes('--json');

const bestanden = (map) => { let uit = []; for (const n of readdirSync(join(W, map))) { const p = `${map}/${n}`; const st = statSync(join(W, p)); if (st.isDirectory()) uit = uit.concat(bestanden(p)); else if (/\.(ts|mts|tsx|mjs)$/.test(n)) uit.push(p); } return uit; };
const lees = (p) => readFileSync(join(W, p), 'utf8');

/** Tekst van de handler na `'<METHODE> /api/…': [` tot het sluitende `]` (strings en template-literals overgeslagen). */
function handlerTekst(s, start) {
  let diep = 0, i = start, begonnen = false;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"') { const q = c; for (i++; i < s.length && s[i] !== q && s[i] !== '\n'; i++) if (s[i] === '\\') i++; continue; }
    if (c === '`') { let d = 0; for (i++; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '$' && s[i + 1] === '{') { d++; i++; continue; } if (s[i] === '}' && d) { d--; continue; } if (s[i] === '`' && !d) break; } continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i + 2); if (i < 0) break; i++; continue; }
    if (c === '[' || c === '(' || c === '{') { diep++; begonnen = true; }
    else if (c === ']' || c === ')' || c === '}') { diep--; if (begonnen && diep === 0) return s.slice(start, i + 1); }
    if (begonnen && i - start > 40000) break;
  }
  return s.slice(start, Math.min(s.length, start + 4000));
}

// RLS-groepen (migratie 0033) + persoonlijke app-tabellen: wat «persoonlijk» telt.
const RLS_GROEPEN = { voorkeuren: ['owner_ui_preferences_v1', 'mail_view_preferences_v1', 'mail_notification_preferences_v1', 'menu_tellers_v1', 'cognitive_resume_context_v1', 'mail_resume_v1'], meldingen: ['site_notifications', 'notification_jobs'], mail: ['mail_accounts_v1', 'mail_items_v1', 'mail_metrics_v1', 'mail_jobs_v2', 'mail_state_intents_v1', 'mail_state_intent_events_v1'], werkruimtes: ['workspaces', 'workspace_members', 'workspace_blocks'], verbindingen: ['owner_connections_v1', 'owner_browser_grants_v1', 'owner_vault_v1', 'credential_contours_v1', 'api_machine_tokens_v1', 'browser_policies', 'browser_grants'], identiteit: ['users', 'account_identities', 'account_email_conflicts_v1'] };
const PERSOONLIJK_RECORDS = new Set(Object.values(RLS_GROEPEN).flat());
const PERSOONLIJK_APP = /^(mail_|agenda|kalender|hub_|bord|notities|taken|cloud_|drive|photos|ai_|chat|agents?\b|agent_|connector_|mcp_oauth|mcp_console|extensie_|terminal|zoek_|werkruimte|sleutel|passkey|toegangscode|tech_|ruimte_|github_|besluit|eigenaar_besluiten)/;

const GATES = [
  ['ownerRequireSession', 'сесія власника/користувача (ownerRequireSession)'], ['sessionContext', 'сесія (sessionContext)'], ['adminContext', 'адмін-здатність (adminContext)'],
  ['ownerGate', 'сесія + право api-platform (ownerGate)'], ['sessionGateAny', 'сесія на будь-якій службі + право api-platform'], ['techToegang', 'технічний профіль (techToegang)'], ['techVereist', 'технічний профіль (techVereist)'],
  ['eigenaarVereist', 'лише власник (eigenaarVereist)'], ['requireOwner', 'лише власник'], ['ownerRequireAnchor', 'якірна сесія браузера'], ['ownerRequireRedirectAnchor', 'якірна сесія браузера'],
  ['agentAuth', 'токен агента'], ['requireAgent', 'токен агента'], ['machineToken', 'машинний токен'], ['apiToken', 'API-токен'], ['bearer', 'bearer-токен'], ['gedelegeerdeSessie', 'делегована сесія агента'],
  ['ownerIdentityAuthority', 'лише id.* (identity authority)'], ['requireSession', 'сесія (deps.requireSession)'], ['sessieVan', 'сесія'], ['poort(', 'поорт служби (lade)'], ['bordLade', 'лада бюро (bordLade)'],
  ['VEROUDERDE_ROUTE_WEG', '— (застарілий маршрут, 410)'],
  // lokale poorten van modules (deps/closures): gate(), auth(authorize, ctx), authorize(), sessie(), eigenaar(), techGate(), agentGate()
  ['await gate(', 'сесія (локальний гейт модуля)'], ['auth(authorize', 'сесія (authorize модуля)'], ['authorize(', 'сесія (authorize модуля)'], ['await sessie(', 'сесія (модуль)'], ['sessieVereist', 'сесія (модуль)'],
  ['techGate', 'технічний профіль (модуль)'], ['techPoort', 'технічний профіль (модуль)'], ['beheerGate', 'технічний профіль/власник (модуль)'], ['eigenaarGate', 'лише власник (модуль)'], ['await eigenaar(', 'лише власник (модуль)'],
  ['agentGate', 'токен агента (модуль)'], ['agentToken', 'токен агента (модуль)'], ['verifyAgent', 'токен агента (модуль)'], ['wsTicket', 'квиток агента'], ['deps.auth', 'сесія (deps.auth)'], ['deps.gate', 'сесія (deps.gate)'], ['deps.sessie', 'сесія (deps.sessie)'],
  ['gateOf(', 'сесія пошти (gateOf модуля)'], ['accountGate(', 'сесія акаунта (accountGate)'], ['siteGate(', 'сесія сайту (siteGate)'],
  ['verifyPasswordLogin', 'публічний вхід (пароль + TOTP, обмеження частоти)'], ['normalizePairingCode', 'публічний: одноразовий код спарювання'], ['agentSelf(', 'токен агента (agentSelf)'],
  ['c.registerClient', 'публічний OAuth-реєстрація (RFC 7591)'], ['c.token(', 'публічний OAuth-токен (код/refresh)'], ['c.revoke(', 'публічний OAuth-відкликання'], ['c.rpcPost', 'bearer OAuth-токен агента (rpc)'], ['v2.rpc(', 'bearer OAuth-токен агента (rpc v2)'], ['v2.prm(', 'публічні метадані ресурсу'],
  ['mailGooglePush', 'вебхук Google (перевірка підпису в обробнику)'], ['mailMicrosoftWebhook', 'вебхук Microsoft (перевірка валідації в обробнику)'], ['googleSuiteCallbackPost', 'OAuth-callback (state + сесія в обробнику)'],
  ['rateLimit', 'лише обмеження частоти'],
];
/** Terugval: de handler weigert zelf met 401/403 binnen zijn eerste regels → een sessie- of rechtencontrole van het module. */
const GATE_TERUGVAL = /(SESSION_REQUIRED|SESSIE_VEREIST|SESSION_INVALID|OWNER_SESSION|NIET_INGELOGD|UNAUTHORIZED|GEEN_RECHT|FORBIDDEN|VERBODEN|,\s*(401|403)\s*\))/;
const SYSTEEM_ROUTES = [/^[A-Z]+ \/api\/owner\/admin\//, /^[A-Z]+ \/api\/admin\//, /^[A-Z]+ \/api\/owner\/identity\/admin\//, /^[A-Z]+ \/api\/owner\/access\/(user\/|policy\/)/, /^[A-Z]+ \/api\/owner\/google-contour(\/|$)/, /^[A-Z]+ \/api\/security\/overview$/, /^[A-Z]+ \/api\/owner\/system\//, /^[A-Z]+ \/api\/owner\/audit\/beheer(\/|$)/];
const PUBLIEK = /^(POST|GET) \/api\/(owner\/(identity\/transactions\/(create|complete[^']*)|auth\/google\/callback|session\/bootstrap|deployment\/identity|browser\/accounts|gezondheid)|health|gezondheid|public\/|toegang\/(code|aanmelden)|access\/info|gast\/)/;

const routes = [];
for (const f of bestanden('backend')) {
  const s = lees(f);
  const re = /'((?:POST|GET|PUT|DELETE) \/api\/[^']+)':\s*/g;
  let m;
  while ((m = re.exec(s))) {
    const na = m.index + m[0].length;
    if (s[na] === '{') continue; // geen route maar een objectsleutel (bv. nep-antwoorden in ruimte-cloud-agenda.ts)
    // Geen `[` na de sleutel → de handler is een naam (bv. VEROUDERDE_ROUTE_WEG): alleen die naam, niet de volgende route.
    const tekst = s[na] === '[' ? handlerTekst(s, na) : s.slice(na, s.indexOf(',', na) > 0 ? Math.min(s.indexOf(',', na), na + 200) : na + 200);
    routes.push({ route: m[1], bestand: f, tekst });
  }
}
// Tests die een route bij naam noemen (eenheid + e2e), inclusief de patroon-vorm met :id vervangen door een echte waarde.
const testBestanden = [...bestanden('tests')];
const testTekst = testBestanden.map((f) => ({ f, s: lees(f) }));
const genoemdIn = (route) => {
  const pad = route.split(' ')[1];
  const vast = pad.replace(/:[a-zA-Z]+/g, '');
  const patroon = new RegExp(pad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-zA-Z]+/g, '[^/\'"`\\s]+') + '(?=[\'"`\\s?]|$)');
  return testTekst.filter(({ s }) => s.includes(pad) || (vast !== pad && patroon.test(s))).map(({ f }) => f.replace(/^tests\/(eenheid|e2e)\//, '').replace(/\.(test\.)?ts$/, ''));
};
// Twee-gebruikers-tests: noemen de route én hebben twee accounts (A/B, dev/eigenaar, mk(…) ×2, nepGoogle browsers).
const tweeGebruikers = (f) => { const s = testTekst.find((x) => x.f.replace(/^tests\/(eenheid|e2e)\//, '').replace(/\.(test\.)?ts$/, '') === f)?.s || ''; return /(vreemd|чуж|andermans|ander account|andere gebruiker|другого|чужий|aanval|attack|twee (accounts|gebruikers|mensen)|two users|B\b[^;]{0,40}(403|404))/i.test(s) || (s.match(/await mk\(/g) || []).length >= 2 || (s.match(/\.aanmelden\(/g) || []).length >= 2; };

const regels = routes.map((r) => {
  const t = r.tekst;
  const gate = GATES.filter(([k]) => t.includes(k)).map(([, l]) => l);
  const systeem = SYSTEEM_ROUTES.some((x) => x.test(r.route));
  const records = [...new Set([...t.matchAll(/\b(?:db|dbs)\.(?:add|get|list|update|delete|listOne)[^(]*\(\s*'([a-z_0-9]+)'/g)].map((x) => x[1]).concat([...t.matchAll(/\b(?:listOne|listAll)<[^>]*>\(\s*'([a-z_0-9]+)'/g)].map((x) => x[1])))];
  const appTabellen = [...new Set([...t.matchAll(/\bapp\.([a-z_0-9]+)/g)].map((x) => x[1]).filter((x) => !/^(huidige_gebruiker|rls_|audit_toevoegen|mijn_werkruimtes|melding_sfeer)/.test(x)))];
  const tabellen = [...records, ...appTabellen];
  const persoonlijk = records.filter((x) => PERSOONLIJK_RECORDS.has(x)).concat(appTabellen.filter((x) => PERSOONLIJK_APP.test(x)));
  const schrijft = /\b(?:db|dbs)\.(add|update|delete)\(|INSERT\s+INTO|UPDATE\s+app\.|DELETE\s+FROM/i.test(t);
  const alsSysteem = /alsSysteem\(/.test(t);
  const where = /\b(userId|user_id|ownerUserId|recipientUserId|accountId)\b\s*[:=]/.test(t) || /WHERE[^;]{0,200}user_id\s*=\s*\$/.test(t) || /filter:\s*\{[^}]*(userId|ownerUserId|recipientUserId|accountId)/.test(t);
  const stepUp = /stapOp|stepUp|StapOp|step_up|passkey|Passkey/.test(t);
  const lade = /Lade\(|lade\b|gegevensRuimte|ruimteVan|bordLade|mailLade|metLade/.test(t);
  const tests = genoemdIn(r.route);
  const twee = tests.filter(tweeGebruikers);
  const publiek = PUBLIEK.test(r.route);
  const delegatie = /\[\s*async\s*\(?\s*\)?\s*=>\s*[a-zA-Z_]+\(/.test(t) && t.length < 120; // handler delegeert naar een module (bv. [async(ctx)=>mailRoutes(ctx)])
  // Obgortka-poorten: `[eigenaar(…)]`, `[gate(…)]`, `[route(…)]`, `[mens(…)]`, `[metAdmin(…)]`, `handler('…')` — het module controleert de sessie in de wrapper.
  const wrap = /^\[?\s*([a-zA-Z]+)\(/.exec(t.trim());
  const WRAPPERS = { eigenaar: 'лише власник (обгортка eigenaar())', gate: 'сесія/право (обгортка gate())', route: 'сесія + технічний профіль (обгортка route())', mens: 'сесія користувача (обгортка mens())', metAdmin: 'адмін-здатність (обгортка metAdmin())', metAgent: 'токен агента (обгортка)', metTech: 'технічний профіль (обгортка)', metSessie: 'сесія (обгортка)', handler: 'сесія (обгортка handler())', beheer: 'технічний профіль (обгортка beheer())', tech: 'технічний профіль (обгортка tech())', eigenaarRoute: 'лише власник (обгортка)', metEigenaar: 'лише власник (обгортка)', metGebruiker: 'сесія (обгортка)', metLade: 'сесія + лада (обгортка)' };
  const wrapGate = wrap && wrap[1] !== 'async' && WRAPPERS[wrap[1]] ? WRAPPERS[wrap[1]] : wrap && wrap[1] !== 'async' ? `обгортка модуля ${wrap[1]}() (перевірка сесії всередині)` : '';
  const zonderCtx = /^\[\s*async\s*\(\s*\)\s*=>/.test(t.trim());
  const terugval = wrapGate || (/vooraf\(raw\)|await vooraf\(/.test(t) ? 'сесія (vooraf() модуля)' : /metAgent\(ctx\)/.test(t) ? 'токен/сесія агента (metAgent)' : GATE_TERUGVAL.test(t.slice(0, 600)) ? 'сесія/право (відмова 401/403 у модулі)' : zonderCtx ? 'без сесії (не читає запит: каталог/стан/410)' : '?');
  return { ...r, gate: gate.length ? gate[0] : publiek ? 'публічний (без сесії)' : systeem ? 'системний маршрут (контроль прав у коді)' : delegatie ? 'делеговано модулю (див. файл)' : terugval, gateAlle: gate, systeem, tabellen, persoonlijk, schrijft, alsSysteem, where, stepUp, lade, tests, twee, publiek };
});

const ja = (b) => (b ? 'так' : '—');
const kort = (a, n = 6) => (a.length > n ? `${a.slice(0, n).join(', ')} +${a.length - n}` : a.join(', ')) || '—';
const persoonlijkZonderTest = regels.filter((r) => r.persoonlijk.length && !r.twee.length && !r.systeem && !r.publiek && !r.route.includes('/admin/'));
const zonderGate = regels.filter((r) => r.gate === '?' && !r.publiek && !r.systeem);
const datum = '22.10.2026';
const md = [];
md.push(`# Заходи безпеки за маршрутами (${datum}, зона C)`);
md.push('');
md.push('Згенеровано `node scripts/beveiliging-routes-inventaris.mjs` зі статичного аналізу `backend/*.ts` і `tests/**`. Це карта покриття для відповіді на питання власника: «чи безпека забезпечена і покрита на всіх сторінках, і чи неможливо через код чи спроби взлому потрапити в чужий простір». Стовпці:');
md.push('');
md.push('- **Гейт** — яка перевірка відкриває маршрут (сесія користувача, лише власник, технічний профіль, токен агента, системний маршрут з власним контролем прав, публічний).');
md.push('- **Лада** — чи маршрут обчислює ладу (userId + ruimte) на сервері (`bordLade`, `mailLade`, `gegevensRuimteVeilig`, …), а не бере її з тіла запиту.');
md.push('- **RLS** — запити йдуть через `db.*`/`gebruiker()` у контексті користувача (`zetGebruiker` після гейта): політики `app.records` (0007/0033) і RLS таблиць застосовуються; **системна** = свідомий `alsSysteem` або системний маршрут (BYPASSRLS, контроль прав у коді).');
md.push('- **WHERE** — явний фільтр за власником (`userId`/`ownerUserId`/`recipientUserId`/`user_id = $n`) у самому обробнику.');
md.push('- **Step-up** — маршрут вимагає свіжого підтвердження (passkey/Google step-up) для чутливих дій.');
md.push('- **Тест 2 користувачі** — тест, що викликає маршрут від імені двох акаунтів і перевіряє відмову для чужого (атакуючий тест). «Тести» — будь-який тест, що згадує маршрут.');
md.push('- **Особисті таблиці** — таблиці з груп RLS (0033) чи особистих app-таблиць, яких торкається обробник.');
md.push('');
md.push(`Маршрутів: **${regels.length}** (POST ${regels.filter((r) => r.route.startsWith('POST')).length}, GET ${regels.filter((r) => r.route.startsWith('GET')).length}, інші ${regels.filter((r) => !/^(POST|GET)/.test(r.route)).length}). ` +
  `З особистими таблицями: **${regels.filter((r) => r.persoonlijk.length).length}**, з них без атакуючого тесту (поза admin/системними): **${persoonlijkZonderTest.length}** (список у §2). Без розпізнаного гейта: **${zonderGate.length}** (§3 — перевірені вручну).`);
md.push('');
md.push('## 1. Таблиця маршрутів');
md.push('');
md.push('| Маршрут | Файл | Гейт | Лада | RLS | WHERE | Step-up | Пише | Особисті таблиці | Тест 2 корист. | Тести |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of regels.sort((a, b) => a.route.localeCompare(b.route))) {
  const rls = r.systeem ? 'системний' : r.alsSysteem ? 'користувач + alsSysteem' : r.publiek ? '— (без сесії)' : 'користувач';
  md.push(`| \`${r.route}\` | ${r.bestand.replace('backend/', '')} | ${r.gate} | ${ja(r.lade)} | ${rls} | ${ja(r.where)} | ${ja(r.stepUp)} | ${ja(r.schrijft)} | ${kort(r.persoonlijk)} | ${r.twee.length ? r.twee.slice(0, 2).join(', ') : '—'} | ${kort(r.tests, 3)} |`);
}
md.push('');
md.push('## 2. Маршрути з особистими таблицями без атакуючого тесту (статичний аналіз)');
md.push('');
md.push('Маршрути поза admin-/системними, які торкаються особистих таблиць і для яких жоден тест не викликає їх від імені двох акаунтів. 22.10.2026 таких було 23; після тестів `ruimte-aanvallen-20261022` (§1–§5) — список нижче (ціль: порожній).');
md.push('');
md.push('| Маршрут | Гейт | Таблиці | WHERE | RLS-група |');
md.push('|---|---|---|---|---|');
if (!persoonlijkZonderTest.length) md.push('| — (немає: кожен маршрут з особистими таблицями має атакуючий тест) | | | | |');
for (const r of persoonlijkZonderTest) md.push(`| \`${r.route}\` | ${r.gate} | ${kort(r.persoonlijk)} | ${ja(r.where)} | ${[...new Set(r.persoonlijk.map((t) => Object.keys(RLS_GROEPEN).find((g) => RLS_GROEPEN[g].includes(t)) || 'app'))].join(', ')} |`);
md.push('');
md.push('## 3. Маршрути без розпізнаного гейта (ручна перевірка)');
md.push('');
md.push('| Маршрут | Файл | Перші 160 символів обробника |');
md.push('|---|---|---|');
if (!zonderGate.length) md.push('| — (немає: у кожного маршруту розпізнано гейт) | | |');
for (const r of zonderGate) md.push(`| \`${r.route}\` | ${r.bestand.replace('backend/', '')} | \`${r.tekst.replace(/\s+/g, ' ').replace(/\|/g, '¦').slice(0, 160)}\` |`);
md.push('');
md.push('## 4. Як працює ізоляція (узагальнення для власника)');
md.push('');
md.push('1. **Сесія → контекст користувача.** Кожен гейт після успішної перевірки викликає `zetGebruiker(userId)`; усі подальші `db.*`/`gebruiker()`-запити цього запиту йдуть від ролі `mijnruimte_app` із `SET LOCAL app.user_id` (server/platform/db.ts). Політики RLS (0004/0007/0033) бачать лише `owner_id = app.huidige_gebruiker()` або руімти, де користувач є учасником. Поки група RLS у режимі «аудит», рядки, які RLS відхилив би, рахуються в `app.rls_audit` — це і є сторінка «Звірка».');
md.push('2. **Явний WHERE у коді.** Незалежно від RLS кожен обробник фільтрує за `userId`/`ownerUserId`/`recipientUserId` (стовпець «WHERE»), і `workspaceAccess()` перевіряє членство в робочому просторі перед читанням блоків.');
md.push('3. **Лада з сервера.** Особистий/технічний простір (`ruimte`) обчислюється на сервері з активації технічного профілю у вкладці (`gegevensRuimteVeilig`); тіло запиту може лише звузити її, ніколи не розширити.');
md.push('4. **Системні кроки — явні.** `alsSysteem(...)` вживається лише там, де запис законно стосується іншого акаунта (сповіщення власнику, якірна сесія браузера), з коментарем «бевуста системна стап» і атакуючим тестом (`ruimte-aanvallen-20261022`).');
md.push('5. **Адміністративні маршрути** (`/api/owner/admin/*`, `/api/admin/*`, `/api/owner/audit/beheer/*`) — системний контекст із власною перевіркою здатностей (`adminContext(…, "users.manage")` тощо) і step-up; їх покривають тести `audit-toegang`, `gebruiker-audit-2026-10-19`, `impersonatie`.');
md.push('');
md.push('Повний список маршрутів з атакуючими тестами, доданими 22.10.2026: див. `tests/eenheid/ruimte-aanvallen-20261022.test.ts` (шапка файла).');
md.push('');
md.push('## 5. Три порушення зі сторінки «Звірка» (22.10.2026) — причина і виправлення');
md.push('');
md.push('| Маршрут · таблиця · дія | Причина | Виправлення | Тест |');
md.push('|---|---|---|---|');
md.push('| `POST /api/owner/session/bootstrap` · owner_browser_grants_v1 · lezen · 74× | Після «Змінити акаунт у цій вкладці» (B-005) акаунт вкладки ≠ акаунт якоря браузера. Bootstrap перевидає cookie «запам’ятати браузер» ЯКОРЯ, читаючи його grant у контексті акаунта ВКЛАДКИ → RLS-емуляція рахує читання чужого рядка. Витоку немає (рядок обраний лише за `grantId` власної якірної сесії, у відповідь йде лише cookie якоря), але під увімкненим RLS читання б зникло і cookie не перевидавалась. | Свідомий системний крок (`alsSysteem`) з ЯВНОЮ умовою `grant.userId === anker.userId` і коментарем у `backend/index.ts` (bootstrap). Чужий id (навіть підроблений у якірній сесії) → «не знайдено», cookie не видається. | `ruimte-aanvallen-20261022` §1 (4× bootstrap у вкладці іншого акаунта → 0 у `app.rls_audit`; підроблений `grantId` → без cookie) |');
md.push('| `POST /api/access/request` · notification_jobs · toevoegen · 2× | Задачі e-mail/telegram «новий запит на доступ» створювалися БЕЗ отримувача (`owner_id` NULL) від імені заявника: під RLS заявник не може вставити рядок, що нікому не належить. | Отримувач = власник (`recipientUserId` → `owner_id`), `sfeer: technisch`, вставка як свідомий системний крок (як `notify()`); без акаунта власника задача не створюється. | `ruimte-aanvallen-20261022` §2 (заявник C → 2 задачі з `owner_id` власника, 0 у звірці; жодної задачі з `owner_id` C) |');
md.push('| `POST /api/workspace/load` · workspace_blocks · toevoegen · 6× | ХИБНЕ спрацювання емуляції (не дірка): власник (що вже мав особистий простір) уперше відкрив hub у ТЕХНІЧНІЙ вкладці → load створив «Мій простір — технічний» + 6 блоків. Кеш робочих просторів запиту (`c.werkruimtes`) був обчислений ДО вставки простору і не знав нового id → 6 «порушень». Справжня політика (`app.mijn_werkruimtes`, live) ці вставки дозволяє. | `server/platform/rls-audit.ts`: після кожного запису в `workspaces`/`workspace_members` запит забуває кеш (синхронно, до першого await) → наступна перевірка читає з бази після коміту. | `ruimte-aanvallen-20261022` §3 (A з особистим простором + технічна активація → технічний простір + 6 блоків, 0 у звірці; на старому коді — 6) |');
md.push('');
md.push('**Старі лічильники.** Міграція `0108_zvirka_verholpen.sql` прибирає з `app.rls_audit` саме ці три комбінації (лише записи, що вже є на момент міграції; усі інші лічильники лишаються). Без неї сторінка й далі показувала б «Ще є порушення: 74/2/6», а `db-rollen-instellen.sh rls-groep … aan` відмовляв би вмикати групи «verbindingen», «meldingen», «werkruimtes». Якщо після оновлення з’явиться лічильник із часом ДО активації нового випуску — це старий процес у вікні між міграцією й перезапуском; з часом ПІСЛЯ — справжній, його треба дослідити (`sudo deploy/db-rollen-instellen.sh status`).');
md.push('');
md.push('**Що ще показує звірка і НЕ є помилкою коду.** У режимі «аудит» лічильник рахує й спроби атаки, які код відхилив: наприклад, B викликає `blocks/<id-A>/update` → обробник читає рядок за id (щоб відповісти 403) і RLS-емуляція рахує «lezen workspace_blocks». Під увімкненим RLS той самий запит дасть 404 без читання. Тож після ввімкнення групи такі записи зникають; до того — одиничні «lezen» на маршрутах з `:id` можуть бути слідами відхилених спроб, не витоків (сторінка показує лише лічильник без вмісту).');
md.push('');
md.push('**Межі цієї таблиці.** Стовпці «Таблиці/WHERE/Пише» відображають лише тіло обробника; доступ до даних у модулях (пошта, хмара, агенда, пошук, агенти) відбувається в їхніх функціях і покривається їхніми тестами (`ruimte-mail-20261020`, `ruimte-cloud-agenda-20261020`, `ruimte-drive-projectie-20261020`, `ruimte-bord-github-20261020`, `ruimte-ai-20261020`, `rls-groepen`, `audit-rls`, `zoek-*`). Маршрути потоку входу (`identity/redirect/finalize`, `identity/transactions/redeem`) працюють на одноразових транзакціях, прив’язаних до вкладки, походження, секрету й cookie браузера; атакуючий тест із двома акаунтами — `ruimte-aanvallen-20261022` §5 (чужа транзакція з іншої вкладки → OWNER_TAB_MISMATCH, з чужою вкладкою без секрету → OWNER_REDEEM_SECRET_MISMATCH, повтор → 409, finalize без/з підробленою cookie → 401; браузер B лишається B).');
const uit = md.join('\n') + '\n';
mkdirSync(join(W, dirname(uitPad)), { recursive: true });
writeFileSync(join(W, uitPad), uit);
if (alsJson) writeFileSync(join(W, uitPad.replace(/\.md$/, '.json')), JSON.stringify(regels.map(({ tekst: _t, ...r }) => r), null, 1));
console.log(`routes: ${regels.length}; persoonlijk: ${regels.filter((r) => r.persoonlijk.length).length}; persoonlijk zonder twee-gebruikers-test: ${persoonlijkZonderTest.length}; zonder gate: ${zonderGate.length} → ${uitPad}`);
