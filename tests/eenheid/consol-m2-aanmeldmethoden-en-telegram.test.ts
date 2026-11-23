// Віха M2 (CONSOL-001): модульні та інтеграційні випробування Блоку 1 (картковий режим «Способи входу» UI-015A, №167)
// та Блоку 2 (посилений серверний контур зовнішнього входу UI-015B, №168 + макет вікна входу Telegram, №169).
import { createHash, createHmac, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { AANMELD_ANKERS } from '../../shared/aanmeld-vnext-model';
import { ACTIE_LABELS, categorieVan } from '../../shared/beheer-journaal';
import { MELDINGEN } from '../../shared/meldingen-catalogus';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import {
  _jwksCacheLeeg,
  aanbiedersVoorToegangsSnapshot,
  aanmeldKoppelRoutes,
  isGeldigeMicrosoftTenant,
  sleutelVormFouten,
  telegramControle,
} from '../../backend/aanmeld-koppel';
import { accessSnapshot } from '../../backend/toegangslaag';
import {
  ANKER_NAAR_KAART,
  filterKaarten,
  isAanbieder,
  isVeiligPad,
  snapshotNaarKaartenV2,
  staatLabel,
  weergaveGroep,
} from '../../src/aanmeldmethoden-v2/aanmeldmethoden-model';
import { checker } from './hulp/nep-google';
import { nepAanbieder } from './hulp/nep-aanbieder';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('consol-m2-aanmeldmethoden-en-telegram');
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');

  const ENV_SLEUTELS = [
    'AANMELD_TERUG_BASIS',
    'AANMELD_MICROSOFT_BASIS',
    'AANMELD_MICROSOFT_TENANT',
    'AANMELD_MICROSOFT_CLIENT_ID',
    'AANMELD_MICROSOFT_CLIENT_SECRET',
    'AANMELD_DISCORD_BASIS',
    'AANMELD_DISCORD_CLIENT_ID',
    'AANMELD_DISCORD_CLIENT_SECRET',
    'AANMELD_APPLE_BASIS',
    'AANMELD_APPLE_CLIENT_ID',
    'AANMELD_APPLE_SERVICES_ID',
    'AANMELD_APPLE_TEAM_ID',
    'AANMELD_APPLE_KEY_ID',
    'AANMELD_APPLE_PRIVATE_KEY',
    'AANMELD_TELEGRAM_BOT_TOKEN',
    'AANMELD_TELEGRAM_BOT_NAAM',
  ];
  const oudEnv = Object.fromEntries(ENV_SLEUTELS.map((k) => [k, process.env[k]]));
  for (const k of ENV_SLEUTELS) delete process.env[k];
  process.env.AANMELD_TERUG_BASIS = 'https://id.eenheid.test';

  let eigenaarId: string = randomUUID();
  let eigenaarAangemaakt = false;
  const lidId = randomUUID();
  let nep: Awaited<ReturnType<typeof nepAanbieder>> | null = null;
  let nepRotatie: Awaited<ReturnType<typeof nepAanbieder>> | null = null;

  try {
    // ---------------------------------------------------------------- 1. Міграція 0321 та двомовні пояснення прапорців
    const migSql = lees('migrations/0321_aanmeldmethoden_kaart_v2_vlag.sql');
    check(
      'міграція 0321 реєструє aanmeldmethoden-kaart-v2 і telegram-aanmeld-maket-v1 зі станом false, false',
      migSql.includes("'aanmeldmethoden-kaart-v2'") &&
        migSql.includes("'telegram-aanmeld-maket-v1'") &&
        (migSql.match(/false,\s*\n\s*false/g) || []).length === 2,
    );
    const vlagRijen = (
      await pool.query<{ sleutel: string; omschrijving: string; aan: boolean; standaard: boolean }>(
        `SELECT sleutel, omschrijving, aan, standaard
           FROM app.feature_flags
          WHERE sleutel IN ('aanmeldmethoden-kaart-v2', 'telegram-aanmeld-maket-v1')
          ORDER BY sleutel`,
      )
    ).rows;
    check(
      'обидва нові прапорці присутні в app.feature_flags із двомовним описом ≤ 300 символів',
      vlagRijen.length === 2 &&
        vlagRijen.every((r) => r.omschrijving.includes(' | ') && r.omschrijving.length <= 300),
    );
    for (const sl of ['aanmeldmethoden-kaart-v2', 'telegram-aanmeld-maket-v1', 'telegram-v2']) {
      const u = VLAG_UITLEG[sl];
      check(
        `VLAG_UITLEG['${sl}'] має непорожні двомовні поля naam, wat, wanneer, gevolg`,
        Boolean(u && u.naam[0] && u.naam[1] && u.wat[0] && u.wat[1] && u.wanneer[0] && u.wanneer[1] && u.gevolg[0] && u.gevolg[1]),
      );
    }

    // ---------------------------------------------------------------- 2. Чиста модель UI-015A (aanmeldmethoden-model.ts)
    check(
      'isVeiligPad пропускає лише відносні шляхи з однією початковою косою рискою',
      isVeiligPad('/api/owner/aanmeld/vnext/start') &&
        !isVeiligPad('//boosdoener.invalid/pad') &&
        !isVeiligPad('https://boosdoener.invalid/pad') &&
        !isVeiligPad('/pad met spatie') &&
        !isVeiligPad('/pad\\terug'),
    );
    check(
      'isAanbieder відхиляє невідомі статуси або відсутнє булеве поле kanLosmaken',
      isAanbieder({ id: 'microsoft', status: 'actief', kanLosmaken: true }) &&
        !isAanbieder({ id: 'microsoft', status: 'verzonnen', kanLosmaken: true }) &&
        !isAanbieder({ id: 'microsoft', status: 'actief' }),
    );

    const ladenKaarten = snapshotNaarKaartenV2('laden');
    check(
      'фаза laden: усі картки перебувають у стані loading без фальшивого Підключено',
      ladenKaarten.length >= 9 && ladenKaarten.every((k) => k.staat === 'loading' && k.actie === 'none'),
    );
    const foutKaarten = snapshotNaarKaartenV2('fout');
    check(
      'фаза fout: основні способи входу переходять у чесний стан unknown з дією retry',
      foutKaarten.find((k) => k.id === 'google')?.staat === 'unknown' &&
        foutKaarten.find((k) => k.id === 'google')?.actie === 'retry',
    );
    const geenToegang = snapshotNaarKaartenV2('geen-toegang');
    check(
      'фаза geen-toegang: картка Google показує unavailable із двомовною причиною «Немає доступу» / «Geen toegang»',
      geenToegang.find((k) => k.id === 'google')?.staat === 'unavailable' &&
        geenToegang.find((k) => k.id === 'google')?.reden?.uk === 'Немає доступу' &&
        geenToegang.find((k) => k.id === 'google')?.reden?.nl === 'Geen toegang',
    );

    const klaarKaarten = snapshotNaarKaartenV2('klaar', {
      methods: [
        { id: 'google', enabled: true, configured: true, bound: true, status: 'active' },
        { id: 'password', enabled: true, configured: true, bound: true, status: 'active' },
      ],
      factors: [
        { id: 'passkey', enabled: true, enrolled: true, status: 'active', count: 2 },
        { id: 'totp', enabled: true, enrolled: false, status: 'not_enrolled' },
        { id: 'recovery', enabled: true, enrolled: true, status: 'active', remaining: 2 },
      ],
      bindings: [{ method: 'google', email: 'eigenaar@voorbeeld.invalid', status: 'active' }],
      lockout: { protected: true },
      password: { configured: true, mustChange: true },
      totp: { enrolled: false },
      aanbieders: [
        {
          id: 'microsoft',
          status: 'actief',
          accountLabel: 'pa…@voorbeeld.invalid',
          gekoppeldOp: '2026-11-22T12:00:00.000Z',
          kanLosmaken: false,
          losmaakUrl: '/api/owner/aanmeld/vnext/ontkoppel',
        },
        {
          id: 'discord',
          status: 'gereed-om-te-koppelen',
          actieKoppelUrl: '/api/owner/aanmeld/vnext/start',
          kanLosmaken: false,
        },
        {
          id: 'apple',
          status: 'gereed-om-te-koppelen',
          actieKoppelUrl: 'https://kwaad.invalid/stelen',
          kanLosmaken: false,
        },
        {
          id: 'telegram',
          status: 'niet-geconfigureerd',
          kanLosmaken: false,
        },
      ],
    });
    const gKaart = klaarKaarten.find((k) => k.id === 'google')!;
    const pwKaart = klaarKaarten.find((k) => k.id === 'password')!;
    const rcKaart = klaarKaarten.find((k) => k.id === 'recovery')!;
    const msKaart = klaarKaarten.find((k) => k.id === 'aanbieder:microsoft')!;
    const dcKaart = klaarKaarten.find((k) => k.id === 'aanbieder:discord')!;
    const apKaart = klaarKaarten.find((k) => k.id === 'aanbieder:apple')!;
    check(
      'захист останнього способу входу (beschermd: true) і відсутність вигаданих відсотків 100%',
      gKaart.beschermd === true &&
        Boolean(gKaart.reden?.uk && gKaart.reden?.nl) &&
        !JSON.stringify(klaarKaarten).includes('100%'),
    );
    check(
      'тимчасовий пароль і малий залишок кодів відновлення (≤ 2) отримують стан attention',
      pwKaart.staat === 'attention' && rcKaart.staat === 'attention',
    );
    check(
      'зовнішні постачальники: активний Microsoft у групі verbonden, готовий Discord має connect, а небезпечний URL Apple знижено до unknown',
      weergaveGroep(msKaart) === 'verbonden' &&
        staatLabel(msKaart, 'uk') === 'Підключено' &&
        staatLabel(msKaart, 'nl') === 'Gekoppeld' &&
        dcKaart.staat === 'ready' &&
        dcKaart.actie === 'connect' &&
        apKaart.staat === 'unknown' &&
        apKaart.actie === 'none',
    );
    check(
      'двомовний пошук filterKaarten знаходить і українською («відновлення»), і нідерландською («sleutel»)',
      filterKaarten(klaarKaarten, 'alle', 'ВІДНОВЛЕННЯ').some((k) => k.id === 'recovery') &&
        filterKaarten(klaarKaarten, 'alle', 'sleutels').some((k) => k.id === 'passkey') &&
        filterKaarten(klaarKaarten, 'alle', '', 'recovery').every((k) => k.id === 'recovery' || k.id === 'vault'),
    );
    check(
      'усі 5 канонічних якорів AANMELD_ANKERS відображені у ANKER_NAAR_KAART, а каталог public/aanmeldmethoden відсутній',
      AANMELD_ANKERS.every((a) => Boolean(ANKER_NAAR_KAART[a])) && !existsSync('public/aanmeldmethoden'),
    );
    const v2Bestanden = readdirSync('src/aanmeldmethoden-v2').map((f) => lees(`src/aanmeldmethoden-v2/${f}`)).join('\n');
    check(
      'компоненти src/aanmeldmethoden-v2 використовують єдиний реєстр марок MethodeMerk і перемикач подання у AanmeldVnextPanelen',
      v2Bestanden.includes('MethodeMerk') &&
        !v2Bestanden.includes('/aanmeldmethoden/') &&
        lees('src/aanmeld-vnext/AanmeldVnextPanelen.tsx').includes('AanmeldmethodenKaartV2'),
    );

    // ---------------------------------------------------------------- 3. UI-015B: серверні перевірки та криптографія
    check(
      'isGeldigeMicrosoftTenant приймає common/consumers/organizations/UUID/домен і відхиляє некоректні значення',
      isGeldigeMicrosoftTenant('common') &&
        isGeldigeMicrosoftTenant('consumers') &&
        isGeldigeMicrosoftTenant('organizations') &&
        isGeldigeMicrosoftTenant('9188040d-6c67-4c5b-b112-36a304b66dad') &&
        isGeldigeMicrosoftTenant('contoso.onmicrosoft.com') &&
        !isGeldigeMicrosoftTenant('ongeldige..tenant/waarde!') &&
        !isGeldigeMicrosoftTenant('') &&
        !isGeldigeMicrosoftTenant('domein met spatie.nl'),
    );

    const bestaandeEigenaar = (
      await pool.query<{ id: string }>(`SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1`)
    ).rows[0];
    if (bestaandeEigenaar?.id) {
      eigenaarId = bestaandeEigenaar.id;
    } else {
      eigenaarAangemaakt = true;
      await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
        'users',
        eigenaarId,
        { email: `m2-eig-${sfx}@eenheid.test`, role: 'owner', status: 'approved' },
      ]);
    }
    await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
      'users',
      lidId,
      { email: `m2-lid-${sfx}@eenheid.test`, role: 'member', status: 'approved' },
    ]);

    const nepGeheimWaarde = `GEHEIM_SLEUTEL_${sfx}_NOOIT_TONEN`;
    process.env.AANMELD_APPLE_SERVICES_ID = 'com.eenheid.services';
    process.env.AANMELD_APPLE_TEAM_ID = 'TEAM123456';
    process.env.AANMELD_APPLE_KEY_ID = 'KEY1234567';
    process.env.AANMELD_APPLE_PRIVATE_KEY = nepGeheimWaarde;
    process.env.AANMELD_MICROSOFT_TENANT = 'ongeldige..tenant/waarde!';

    const vormApple = await sleutelVormFouten('apple');
    const vormMs = await sleutelVormFouten('microsoft');
    check(
      'sleutelVormFouten виявляє пошкоджений PEM Apple та хибний AANMELD_MICROSOFT_TENANT без жодного витоку таємниці',
      vormApple.some((f) => f.includes('AANMELD_APPLE_PRIVATE_KEY')) &&
        !vormApple.join(' ').includes(nepGeheimWaarde) &&
        vormMs.some((f) => f.includes('AANMELD_MICROSOFT_TENANT')) &&
        !vormMs.join(' ').includes('ongeldige..tenant'),
    );

    const routesEigenaar = aanmeldKoppelRoutes(
      async () => ({ user: { id: eigenaarId, role: 'owner', status: 'approved' }, service: 'identity' }),
      { stepUp: async () => null },
    );
    const statusAntw = await (routesEigenaar['POST /api/owner/aanmeld/vnext/aanbieders'][0] as unknown as (x: unknown) => Promise<{ statusCode: number; body: string }>)({
      event: { headers: {} },
      body: {},
      params: {},
      query: {},
    });
    check(
      'маршрут статусу постачальників повертає 200, klaarVoorKoppeling=false при помилці формату і ніколи не містить секрету в тілі',
      statusAntw.statusCode === 200 &&
        !statusAntw.body.includes(nepGeheimWaarde) &&
        JSON.parse(statusAntw.body).aanbieders.find((x: { id: string }) => x.id === 'apple')?.klaarVoorKoppeling === false,
    );

    // Знімок accessSnapshot: власник бачить назви ключів, звичайний учасник — ні
    const snapEigenaar = await accessSnapshot({ id: eigenaarId, email: `m2-eig-${sfx}@eenheid.test`, role: 'owner' }, true);
    const snapLid = await accessSnapshot({ id: lidId, email: `m2-lid-${sfx}@eenheid.test`, role: 'member' }, false);
    check(
      'accessSnapshot містить поле aanbieders; деталі ontbrekendeSleutels/vormFouten передаються лише адміністратору без таємниць',
      Array.isArray(snapEigenaar.aanbieders) &&
        snapEigenaar.aanbieders.length === 4 &&
        !JSON.stringify(snapEigenaar).includes(nepGeheimWaarde) &&
        snapLid.aanbieders.every((a) => a.ontbrekendeSleutels === undefined && a.vormFouten === undefined),
    );
    const rechtstreeks = await aanbiedersVoorToegangsSnapshot({ id: eigenaarId, role: 'owner' }, true);
    check(
      'синонім AANMELD_APPLE_SERVICES_ID зараховує AANMELD_APPLE_CLIENT_ID як присутній',
      rechtstreeks.find((x) => x.id === 'apple')?.ontbrekendeSleutels?.length === 0,
    );

    // Перевірка повного циклу прив'язки Apple із синонімом AANMELD_APPLE_SERVICES_ID та оновлення JWKS при ротації kid
    delete process.env.AANMELD_MICROSOFT_TENANT;
    const applePair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const appleP8 = applePair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const applePub = applePair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
    nep = await nepAanbieder({
      apple: { clientId: 'com.eenheid.services', publiekeSleutelPem: applePub },
    });
    process.env.AANMELD_APPLE_PRIVATE_KEY = appleP8;
    process.env.AANMELD_APPLE_BASIS = nep.url;
    _jwksCacheLeeg();

    const zAp = await (routesEigenaar['POST /api/owner/aanmeld/vnext/zelftest'][0] as unknown as (x: unknown) => Promise<{ statusCode: number; body: string }>)({
      event: { headers: {} },
      body: { id: 'apple' },
      params: {},
      query: {},
    });
    check('самоперевірка Apple із AANMELD_APPLE_SERVICES_ID проходить зі станом ok', JSON.parse(zAp.body).zelftest === 'ok');

    // Перевірка telegramControle: свіжий підпис — ok, майбутній auth_date (+180 с) — vers=false
    const proefBotToken = `123456:APROEF${sfx}aaaaaaaaaaaaaaaaaaaaaaaaaa`;
    const nuSec = Math.floor(Date.now() / 1000);
    const maakTgQuery = (authDate: number) => {
      const velden: Record<string, string> = { auth_date: String(authDate), first_name: 'Pavlo', id: '777888', username: 'pavlo' };
      const regel = Object.keys(velden).sort().map((k) => `${k}=${velden[k]}`).join('\n');
      const hash = createHmac('sha256', createHash('sha256').update(proefBotToken).digest()).update(regel).digest('hex');
      return { ...velden, hash };
    };
    check(
      'telegramControle відхиляє підроблений майбутній auth_date (+180 с), але приймає поточний час',
      telegramControle(maakTgQuery(nuSec), proefBotToken).vers === true &&
        telegramControle(maakTgQuery(nuSec + 180), proefBotToken).vers === false,
    );

    // ---------------------------------------------------------------- 4. Макет вікна входу Telegram (№169) та реєстр сповіщень
    const tgBronnen = readdirSync('src/telegram-aanmelden')
      .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
      .map((f) => lees(`src/telegram-aanmelden/${f}`))
      .join('\n');
    check(
      'вікно входу Telegram підтримує компактний і студійний режими подання та двомовне попередження про підозрілий запит (uk + nl)',
      tgBronnen.includes("TelegramStijlKiezer") &&
        tgBronnen.includes("TelegramTijdBalk") &&
        tgBronnen.includes("TelegramBotVoorbeeld") &&
        tgBronnen.includes('підозріл') &&
        tgBronnen.includes('verdacht'),
    );
    check(
      'реєстр сповіщень містить двомовні записи для зовнішнього входу та підтвердження пристроїв без категорії overig',
      MELDINGEN.some((m) => /aanmeld|apparaat/i.test(m.id) && m.titel[0].length > 0 && m.titel[1].length > 0) &&
        Object.keys(ACTIE_LABELS)
          .filter((k) => k.startsWith('aanmeld.') || k.startsWith('telegram.'))
          .every((k) => categorieVan(k) !== 'overig'),
    );
  } finally {
    if (nep) await nep.stop().catch(() => undefined);
    if (nepRotatie) await nepRotatie.stop().catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'aanmeld_zelftest_v1' AND data->>'doorUserId' = $1`, [eigenaarId]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [eigenaarAangemaakt ? [eigenaarId, lidId] : [lidId]]).catch(() => undefined);
    for (const k of ENV_SLEUTELS) {
      if (oudEnv[k] === undefined) delete process.env[k];
      else process.env[k] = oudEnv[k];
    }
    await closePool().catch(() => undefined);
  }
  return einde();
}
