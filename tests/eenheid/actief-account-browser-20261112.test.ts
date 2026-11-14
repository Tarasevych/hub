// Модульне та інтеграційне випробування IDENTITEIT-010 (12.11.2026):
// Простір як єдине джерело правди для активного облікового запису в оглядачі на всіх піддоменах *.tarasevych.com,
// узгодження silentAllowed (живий 30-денний дозвіл OwnerGrant) і криптографічно перевіреного login_hint після виходу,
// а також захист від перегонів паралельних вкладок і миттєве завершення технічного профілю попереднього акаунта.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { closePool, getPool, poolUrl } from '../../server/platform/pg';
import * as tp from '../../backend/tech-profiel';
import { checker, nepGoogle } from './hulp/nep-google';
import { nepBrowser } from './hulp/nep-browser';

const W = process.cwd();
const bron = (p: string) => readFileSync(join(W, p), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('actief-account-browser-20261112');

  // ================================================================ 1. Клієнт: монотонна ревізія облікового запису представлення
  {
    nepBrowser('https://mail.tarasevych.com');
    const gv = await import('../../src/gedeelde-voorkeuren');
    const dwc = await import('../../src/domein-weergave-cache');

    // Спершу на hub був активний обліковий запис user-A (перша ревізія).
    const keyA = dwc.rememberViewAccountEverywhere('user-A');
    gv.writeSharedPreferences({ theme: 'dark', palet: 'grifel' });
    const oudeHubAccountHint = globalThis.sessionStorage.getItem(gv.WEERGAVE_ACCOUNT_HINT);
    const oudeHubRevHint = globalThis.sessionStorage.getItem(gv.WEERGAVE_ACCOUNT_REV);
    check(
      '1.1 rememberViewAccountEverywhere фіксує ключ user-A у спільному реп’яшку та sessionStorage з ревізією kaartOp',
      gv.weergaveAccountNu() === keyA && oudeHubAccountHint === keyA && Number(oudeHubRevHint || 0) > 0,
      `keyA=${keyA} hint=${oudeHubAccountHint} rev=${oudeHubRevHint}`
    );

    // Користувач на mail.tarasevych.com перемикається на user-B — спільний реп’яшок отримує новішу ревізію kaartOp.
    const keyB = dwc.rememberViewAccountEverywhere('user-B');
    gv.writeSharedPreferences({ theme: 'light', palet: 'violet' });
    const gedeeldeCookie = globalThis.document.cookie;

    // Імітуємо перехід на вкладку hub.tarasevych.com, де у власному sessionStorage досі лежить старий запис keyA зі старішою ревізією.
    globalThis.sessionStorage.setItem(gv.WEERGAVE_ACCOUNT_HINT, oudeHubAccountHint!);
    globalThis.sessionStorage.setItem(gv.WEERGAVE_ACCOUNT_REV, oudeHubRevHint!);
    check(
      '1.2 при старішій ревізії у sessionStorage на іншому піддомені перемагає новіший user-B зі спільного реп’яшка екосистеми',
      gv.weergaveAccountNu() === keyB,
      `nu=${gv.weergaveAccountNu()} verwacht=${keyB}`
    );

    // Застарілий запис без ревізії у sessionStorage також не перебиває новіший kaartOp зі спільного реп’яшка.
    globalThis.sessionStorage.setItem(gv.WEERGAVE_ACCOUNT_HINT, keyA);
    globalThis.sessionStorage.removeItem(gv.WEERGAVE_ACCOUNT_REV);
    check(
      '1.3 застарілий запис без ревізії у sessionStorage не перебиває актуальний user-B зі спільного реп’яшка',
      gv.weergaveAccountNu() === keyB,
      `nu=${gv.weergaveAccountNu()} verwacht=${keyB}`
    );

    // Перевірка вбудованого раннього сценарію presentation-init у index.html (до завантаження бандла).
    const html = bron('index.html');
    const match = /<script id="presentation-init">([\s\S]*?)<\/script>/.exec(html);
    check('1.4 index.html містить ранній сценарій presentation-init із перевіркою kaartOp проти tsv-weergave-account-rev', !!match && match[1].includes('tsv-weergave-account-rev') && match[1].includes('prefs.kaartOp'));
    if (match) {
      const ssMap = new Map<string, string>([
        ['tsv-weergave-account', keyA],
        ['tsv-weergave-account-rev', String(oudeHubRevHint)],
      ]);
      const lsMap = new Map<string, string>();
      const klassen = new Set<string>();
      const docEl = {
        lang: 'uk',
        dataset: {} as Record<string, string>,
        style: { colorScheme: '' },
        classList: {
          add: (...c: string[]) => c.forEach(x => klassen.add(x)),
          remove: (...c: string[]) => c.forEach(x => klassen.delete(x)),
          contains: (c: string) => klassen.has(c),
        },
      };
      const uHub = new URL('https://hub.tarasevych.com/');
      const locHub = { href: uHub.href, origin: uHub.origin, host: uHub.host, hostname: uHub.hostname, pathname: uHub.pathname, search: '', hash: '', protocol: 'https:' };
      const winCtx: Record<string, unknown> = { name: '', location: locHub, addEventListener: () => undefined, removeEventListener: () => undefined };
      const docCtx = {
        cookie: gedeeldeCookie,
        title: '',
        documentElement: docEl,
        head: { appendChild: () => undefined },
        createElement: () => ({ getContext: () => null, dataset: {} }),
        querySelectorAll: () => [],
        getElementById: () => ({ setAttribute: () => undefined }),
      };
      runInNewContext(bron('public/canonical-service.js'), {
        window: winCtx,
        location: locHub,
        document: docCtx,
        addEventListener: () => undefined,
        Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL,
      });
      runInNewContext(match[1], {
        window: winCtx,
        location: locHub,
        navigator: { language: 'uk-UA' },
        document: docCtx,
        localStorage: {
          getItem: (k: string) => lsMap.get(k) ?? null,
          setItem: (k: string, v: string) => { lsMap.set(k, String(v)); },
          removeItem: (k: string) => { lsMap.delete(k); },
        },
        sessionStorage: {
          getItem: (k: string) => ssMap.get(k) ?? null,
          setItem: (k: string, v: string) => { ssMap.set(k, String(v)); },
          removeItem: (k: string) => { ssMap.delete(k); },
        },
        matchMedia: () => ({ matches: false }),
        Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL, encodeURIComponent, decodeURIComponent, Error,
      });
      const pres = winCtx.__TSV_PRESENTATION__ as { domainAccountKey?: string; theme?: string } | undefined;
      check(
        '1.5 presentation-init у index.html одразу обирає актуальний keyB та його тему plum-light замість застарілого keyA із sessionStorage',
        pres?.domainAccountKey === keyB && docEl.dataset.presentationTheme === 'plum-light' && klassen.has('palet-violet'),
        `domainAccountKey=${pres?.domainAccountKey} (verwacht ${keyB}) theme=${docEl.dataset.presentationTheme}`
      );
    }
  }

  // ================================================================ 2. Серверні інваріанти у коді backend/index.ts
  {
    const idx = bron('backend/index.ts');
    check(
      '2.1 єдина функція ownerActivateBrowserAccount виконує ротацію сесії та підтримує пільгове вікно OWNER_PREVIOUS_GRACE_MS (replacedFollow)',
      idx.includes('async function ownerActivateBrowserAccount(') &&
      idx.includes('const OWNER_PREVIOUS_GRACE_MS=15*1000;') &&
      idx.includes('replacedFollow')
    );
    check(
      '2.2 ownerGrantCanSilentlySwitch спирається на живий дозвіл OwnerGrant без hintOnlyAt, а ownerVerifiedGrantLoginHint підтримує підказку пошти після виходу',
      idx.includes('const ownerGrantCanSilentlySwitch=') &&
      idx.includes('!record.revokedAt&&!record.hintOnlyAt&&record.expiresAt>now') &&
      idx.includes('const ownerVerifiedGrantLoginHint=async(')
    );
  }

  // ================================================================ 3. Повний серверний сценарій із PostgreSQL + nepGoogle
  if (poolUrl('systeem')) {
    const pool = getPool('systeem');
    const T = `${Date.now()}-${randomBytes(3).toString('hex')}`;
    const bestaandeEigenaar = (await pool.query<{ email: string }>(
      "SELECT data->>'email' AS email FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1",
    )).rows[0];
    const mailA = `actief-a-${T}@example.test`;
    const mailB = `actief-b-${T}@example.test`;
    const google = await nepGoogle({ ownerEmail: bestaandeEigenaar?.email || mailA });
    try {
      for (const naam of ['0082_ruimte_scheiding.sql', '0083_mail_contacten_ruimte.sql', '0209_telegram_aanmelden_context.sql']) {
        await getPool('migratie').query(bron(join('migrations', naam)));
      }

      const b = google.browser();
      const tabHub = randomBytes(24).toString('hex');
      const tabMail = randomBytes(24).toString('hex');
      const tabCloud = randomBytes(24).toString('hex');
      const tabId = randomBytes(24).toString('hex');

      const bootstrap = async (host: string, service: string, tabContext: string) => {
        const r = await b.verzoek(host, '/api/owner/session/bootstrap', { service, tabContext });
        return {
          status: r.status,
          state: String(r.data.state || 'authenticated'),
          email: String(r.data.user?.email || ''),
          userId: String(r.data.user?.id || ''),
          replacedFollow: Boolean(r.data.auth?.replacedFollow),
        };
      };

      const leesAccounts = async (host: string, service: string, tabContext: string) => {
        const r = await b.verzoek(host, '/api/owner/session/accounts', { service, tabContext });
        return Array.isArray(r.data.accounts) ? (r.data.accounts as Array<Record<string, any>>) : [];
      };

      // Крок A: вхід у mailA на hub.tarasevych.com із запам’ятовуванням профілю (схвалимо статус користувача для повноцінної роботи служб).
      const loginA = await b.aanmelden(`sub-a-${T}`, mailA, {
        service: 'hub',
        tabContext: tabHub,
        remember: true,
        intent: 'login',
      });
      await pool.query(
        "UPDATE app.records SET data = jsonb_set(data, '{status}', '\"approved\"'::jsonb, true) WHERE tbl = 'users' AND data->>'email' = $1",
        [mailA],
      );
      const bootNaA = await bootstrap('hub.tarasevych.com', 'hub', tabHub);
      check('3.1 перший вхід (A на hub) встановлює активним mailA', loginA.cb.data.ok === true && bootNaA.email === mailA, bootNaA.email);

      // Крок B: на mail.tarasevych.com користувач додає / входить у mailB (remember: true).
      const loginB = await b.aanmelden(`sub-b-${T}`, mailB, {
        service: 'mail',
        tabContext: tabMail,
        remember: true,
        intent: 'replace-tab',
      });
      await pool.query(
        "UPDATE app.records SET data = jsonb_set(data, '{status}', '\"approved\"'::jsonb, true) WHERE tbl = 'users' AND data->>'email' = $1",
        [mailB],
      );
      check('3.2 вхід у другий обліковий запис (B на mail) успішний і replaceScope === browser', loginB.cb.data.ok === true && loginB.cb.data.replaceScope === 'browser');

      // Перевірка інваріанта власника (вимога 6): жодних перестрибувань назад на A при переході на hub, cloud, id чи нову вкладку!
      const [opHub, opMail, opCloud, opId] = await Promise.all([
        bootstrap('hub.tarasevych.com', 'hub', tabHub),
        bootstrap('mail.tarasevych.com', 'mail', tabMail),
        bootstrap('cloud.tarasevych.com', 'cloud', tabCloud),
        bootstrap('id.tarasevych.com', 'identity', tabId),
      ]);
      check(
        '3.3 після переходу на B усі піддомени (включно зі старою вкладкою hub та новими cloud/id) показують виключно B, без перестрибування на A',
        opHub.email === mailB && opMail.email === mailB && opCloud.email === mailB && opId.email === mailB,
        `hub=${opHub.email} mail=${opMail.email} cloud=${opCloud.email} id=${opId.email}`
      );

      const accLijstOpB = await leesAccounts('hub.tarasevych.com', 'hub', tabHub);
      check(
        '3.4 обидва збережені облікові записи (A і B) присутні в списку оглядача з активними дозволами швидкого перемикання',
        accLijstOpB.some(a => a.user?.email === mailA && a.silentAllowed === true) &&
        accLijstOpB.some(a => a.user?.email === mailB && a.current === true && a.silentAllowed === true),
        JSON.stringify(accLijstOpB.map(a => ({ email: a.user?.email, current: a.current, silentAllowed: a.silentAllowed })))
      );

      // Крок C: увімкнемо технічний профіль для B і перемкнемося на A в один дотик (replace-tab-remembered).
      const userIdB = opHub.userId;
      await pool.query(
        `INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door)
         VALUES ($1, $2, ARRAY['ontwikkelaar'], 240, 'test')
         ON CONFLICT (user_id) DO UPDATE SET rollen = EXCLUDED.rollen, ingetrokken_op = NULL`,
        [userIdB, `tech-${randomBytes(6).toString('hex')}`]
      );
      await tp.activeren({ id: userIdB, email: mailB, role: 'member', status: 'approved' }, tabMail, 30, 'активація перед перемиканням');
      check('3.5 перед перемиканням технічний профіль B активний у вкладці mail', !!(await tp.actieveActivatie(userIdB, tabMail)));

      // Збережемо попередній набір реп’яшків іншої вкладки для перевірки перегонів паралельних вкладок!
      const oudeCookieHeader = [...b.jar].map(([k, v]) => `${k}=${v}`).join('; ');

      const rijA = accLijstOpB.find(a => a.user?.email === mailA)!;
      const wisselNaarA = await b.verzoek('mail.tarasevych.com', '/api/owner/session/replace-tab-remembered', {
        service: 'mail',
        tabContext: tabMail,
        grantId: rijA.grantId,
      });
      check(
        '3.6 перемикання B -> A в один дотик миттєво завершує технічний профіль B (techBeeindigd >= 1) і робить A єдиним активним у просторі',
        wisselNaarA.status === 200 &&
        wisselNaarA.data.ok === true &&
        Number(wisselNaarA.data.techBeeindigd || 0) >= 1 &&
        !(await tp.actieveActivatie(userIdB, tabMail)),
        JSON.stringify({ status: wisselNaarA.status, techBeeindigd: wisselNaarA.data.techBeeindigd })
      );

      // Паралельна вкладка зі старим реп’яшком у межах OWNER_PREVIOUS_GRACE_MS не вилітає в signed_out, а слідує за новим акаунтом A!
      const raceR = await google.handler({
        headers: {
          host: 'hub.tarasevych.com',
          origin: 'https://hub.tarasevych.com',
          'content-type': 'application/json',
          'user-agent': 'eenheidstest',
          'x-forwarded-for': '203.0.113.9',
          cookie: oudeCookieHeader,
        },
        body: JSON.stringify({ service: 'hub', tabContext: tabHub }),
        isBase64Encoded: false,
        rawPath: '/api/owner/session/bootstrap',
        rawQueryString: '',
        queryStringParameters: {},
        requestContext: { http: { method: 'POST', path: '/api/owner/session/bootstrap', sourceIp: '203.0.113.9', userAgent: 'eenheidstest' } },
      } as never) as { statusCode: number; headers: Record<string, string>; body: string };
      const raceData = JSON.parse(raceR.body);
      const valsR = await google.handler({
        headers: {
          host: 'hub.tarasevych.com',
          origin: 'https://hub.tarasevych.com',
          'content-type': 'application/json',
          'user-agent': 'eenheidstest',
          'x-forwarded-for': '203.0.113.9',
          cookie: oudeCookieHeader.replace(/=([^;]+)/, '=ongeldig_token_waarde'),
        },
        body: JSON.stringify({ service: 'hub', tabContext: tabHub }),
        isBase64Encoded: false,
        rawPath: '/api/owner/session/bootstrap',
        rawQueryString: '',
        queryStringParameters: {},
        requestContext: { http: { method: 'POST', path: '/api/owner/session/bootstrap', sourceIp: '203.0.113.9', userAgent: 'eenheidstest' } },
      } as never) as { statusCode: number; headers: Record<string, string>; body: string };
      const valsData = JSON.parse(valsR.body);
      check(
        '3.7 захист від перегонів паралельних вкладок: запит у польоті зі старим реп’яшком у межах OWNER_PREVIOUS_GRACE_MS повертає новий акаунт A (не старий B і не signed_out), а підроблений токен відхиляється',
        raceR.statusCode === 200 &&
        raceData.user?.email === mailA &&
        String(raceData.state || '') !== 'signed_out' &&
        valsData.state === 'signed_out',
        `race=${raceR.statusCode}/${raceData.user?.email} vals=${valsData.state}`
      );

      // Крок D: зворотне перемикання A -> B через replace-tab-remembered (живий 30-денний OwnerGrant дозволяє вхід в один дотик!).
      const accLijstOpA = await leesAccounts('hub.tarasevych.com', 'hub', tabHub);
      const rijB = accLijstOpA.find(a => a.user?.email === mailB)!;
      check('3.8 після перемикання на A профіль B зберігає silentAllowed === true завдяки живому дозволу OwnerGrant', !!rijB && rijB.silentAllowed === true);

      const wisselTerugNaarB = await b.verzoek('hub.tarasevych.com', '/api/owner/session/replace-tab-remembered', {
        service: 'hub',
        tabContext: tabHub,
        grantId: rijB.grantId,
      });
      const bootWeerB = await bootstrap('cloud.tarasevych.com', 'cloud', tabCloud);
      check(
        '3.9 зворотне перемикання A -> B через живий OwnerGrant відновлює B в один дотик на всіх піддоменах без OAuth-походу',
        wisselTerugNaarB.status === 200 && wisselTerugNaarB.data.ok === true && bootWeerB.email === mailB,
        bootWeerB.email
      );

      // Крок E: явний «Вийти з усіх у цьому оглядачі» (logout-browser-all) залишає картки у списку з silentAllowed === false (hintOnly === true), але дозволяє прямий вхід із login_hint!
      const uitloggenAlle = await b.verzoek('hub.tarasevych.com', '/api/owner/session/logout-browser-all', {
        service: 'hub',
        tabContext: tabHub,
      });
      check('3.10 logout-browser-all завершує сесію оглядача', uitloggenAlle.status === 200 && uitloggenAlle.data.ok === true);

      const bootUitgelogd = await bootstrap('hub.tarasevych.com', 'hub', tabHub);
      const accNaUitloggen = await leesAccounts('hub.tarasevych.com', 'hub', tabHub);
      const rijBNaUitloggen = accNaUitloggen.find(a => a.user?.email === mailB);
      check(
        '3.11 після явного виходу картка B залишається у списку (не забувається без натискання ×), але silentAllowed === false (hintOnly === true)',
        bootUitgelogd.state === 'signed_out' && !!rijBNaUitloggen && rijBNaUitloggen.silentAllowed === false && rijBNaUitloggen.hintOnly === true,
        JSON.stringify(rijBNaUitloggen)
      );

      const stillePoging = await b.verzoek('hub.tarasevych.com', '/api/owner/session/replace-tab-remembered', {
        service: 'hub',
        tabContext: tabHub,
        grantId: rijBNaUitloggen!.grantId,
      });
      const weigerCode = String(stillePoging.data.reasonCode || stillePoging.data.error || '');
      check(
        '3.12 тихе відновлення після явного виходу чесно відхиляється з OWNER_REMEMBERED_REAUTH_REQUIRED (вимагає підтвердження в Google)',
        stillePoging.status === 401 && weigerCode === 'OWNER_REMEMBERED_REAUTH_REQUIRED',
        `${stillePoging.status} ${weigerCode}`
      );

      const startMetHint = await b.verzoek('hub.tarasevych.com', '/api/owner/identity/transactions/create', {
        service: 'hub',
        tabContext: tabHub,
        flowMode: 'redirect',
        returnTo: 'https://hub.tarasevych.com/',
        locale: 'uk',
        intent: 'login',
        hintGrantId: rijBNaUitloggen!.grantId,
      });
      const hintUrl = new URL(String(startMetHint.data.authUrl || 'https://x.invalid/'));
      check(
        '3.13 натискання на картку B після виходу одразу запускає вхід Google із криптографічно перевіреним login_hint=mailB',
        startMetHint.status === 200 && hintUrl.searchParams.get('login_hint') === mailB,
        hintUrl.toString()
      );
    } finally {
      google.herstel();
      await closePool();
    }
  }

  return einde();
}
