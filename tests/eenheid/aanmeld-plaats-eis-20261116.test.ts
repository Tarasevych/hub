// TELEGRAM-004 (0299, 16.11.2026): «Вимагати місце пристрою» — людина сама вибирає, для яких способів входу діє вимога.
// Поведінка — через справжні маршрути backend/index.ts проти одноразової бази й підробленого Google (tests/eenheid/hulp).
// De gebruiker kiest per aanmeldmethode; echte routes, nep-Google, alleen verzonnen gegevens; niets gaat naar buiten.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs aanmeld-plaats-eis-20261116.test.ts
import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { bevestig, nieuwePasskey, registreer } from './hulp/nep-toegangssleutel';
import { PLAATS_EIS_METHODEN, PLAATS_EIS_NAAM, plaatsEisSchoon, plaatsUitVerzoek } from '../../shared/aanmeld-plaats-eis';

const VLAGGEN = ['aanmelden-passkey', 'aanmelden-wachtwoord'] as const;
const BRUSSEL = { lat: 50.8467, lon: 4.3525, nauwkeurig: 40 };
const KOP_BRUSSEL = { 'cf-ipcity': 'Brussels', 'cf-ipcountry': 'BE', 'cf-iplatitude': '50.85', 'cf-iplongitude': '4.35' };
const KOP_LISSABON = { 'cf-ipcity': 'Lisbon', 'cf-ipcountry': 'PT', 'cf-iplatitude': '38.72', 'cf-iplongitude': '-9.14' };

export async function main(): Promise<number> {
  const { check, einde } = checker('aanmeld-plaats-eis-20261116');

  // ================================================================ (а) статичні частини
  {
    const mig = readFileSync('migrations/0299_tg_plaats_verplicht.sql', 'utf8');
    check('міграція 0299: повторювана, стовпець plaats_eis типово порожній (вимога ніде не ввімкнена), лише відомі способи',
      mig.includes("ADD COLUMN IF NOT EXISTS plaats_eis text[] NOT NULL DEFAULT '{}'") && mig.includes('DROP CONSTRAINT IF EXISTS tg_matrix_plaats_eis_check') && PLAATS_EIS_METHODEN.every((m) => mig.includes(`'${m}'`)));
    check('перелік способів: сім, кожен із назвою двома мовами', PLAATS_EIS_METHODEN.length === 7 && PLAATS_EIS_METHODEN.every((m) => PLAATS_EIS_NAAM[m].uk && PLAATS_EIS_NAAM[m].nl));
    check('очищення вибору: невідоме й повтори відкидаються, порядок сталий', plaatsEisSchoon(['google', 'x', 'passkey', 'google', 7]).join() === 'passkey,google' && plaatsEisSchoon('google').length === 0);
    const p = plaatsUitVerzoek({ lat: 50.84671, lon: 4.35249, nauwkeurig: 41.6 });
    check('місце із запиту: округлення до 2 знаків (≈ 1 км); сміття, 0/0 і точки поза межами — відкидаються',
      p?.geoLat === 50.85 && p?.geoLon === 4.35 && p?.geoNauwkeurig === 42 && p?.geoStand === 'gegeven'
      && plaatsUitVerzoek({ lat: '50', lon: 4 }) === null && plaatsUitVerzoek({ lat: 0, lon: 0 }) === null && plaatsUitVerzoek({ lat: 95, lon: 4 }) === null && plaatsUitVerzoek(null) === null && plaatsUitVerzoek('x') === null);
    const idx = readFileSync('backend/index.ts', 'utf8');
    check('центральна точка: вимога перевіряється в ownerCompletePrimaryRedirect ДО створення сеансу і в шляху Google без переспрямування',
      idx.includes("if(await aanmeldPlaatsTegenhouden(ctx,record,user,authMethod,locale))return ownerPrimaryRedirectCompleteFailure(record,'PLAATS_NODIG',returnTo,locale);const liveAnchor=")
      && idx.split("if(await aanmeldPlaatsTegenhouden(ctx,record,user,'google',locale))throw new Error('PLAATS_NODIG');").length === 3);
    const sectie = readFileSync('src/telegram-aanmelden/TelegramSectie.tsx', 'utf8');
    check('налаштування: перемикач на кожен спосіб, «!» у назві, попередження «для всіх способів», подробиці згорнуто',
      sectie.includes('PLAATS_EIS_METHODEN.map((m) => <label') && sectie.includes("data-plaats-eis-methode={m}") && sectie.includes('data-plaats-eis-alles') && sectie.includes("<details className='tga-uitleg'>") && sectie.includes('❗ </span>'));
    const zg = readFileSync('src/aanmelden/AanmeldZonderGoogle.tsx', 'utf8');
    const pl = readFileSync('src/aanmelden/plaats.ts', 'utf8');
    check('сторінка входу: місце додається лише без нового запитання (дозвіл уже є), а відмова PLAATS_NODIG показує кнопку «Надати місце»',
      pl.includes("if (stand === 'denied' || stand === 'prompt') return {};") && zg.includes('...(await plaatsVoorStart())') && zg.includes('{geenPlaats && <PlaatsNodig') && readFileSync('src/aanmeld-omleiding.ts', 'utf8').includes('plaatsVoorStart()')
      && readFileSync('src/weigeringen.ts', 'utf8').includes('PLAATS_NODIG:') && readFileSync('src/EigenaarIdentiteitTerug.tsx', 'utf8').includes("searchParams.set('aanmeld_fout','PLAATS_NODIG')"));
  }

  // ================================================================ (б) справжні маршрути проти бази
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const G = await nepGoogle({ ownerEmail: `plaats-eig-${T}@example.test` });
  const pool = getPool();
  const vlagVooraf = (await pool.query('SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = ANY($1)', [VLAGGEN as unknown as string[]])).rows;
  type Browser = ReturnType<typeof G.browser>;
  const IP = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
  const email = `plaats-a-${T}@example.test`, sub = `plaats-a-${T}`;
  const ctx = (b: Browser, extra: Record<string, unknown> = {}) => ({ service: 'identity', tabContext: b.tab, sourceOrigin: 'https://id.tarasevych.com', returnTo: 'https://id.tarasevych.com/', locale: 'uk', remember: false, ...extra });
  const post = (b: Browser, pad: string, body: Record<string, unknown> = {}, kop: Record<string, string> = KOP_BRUSSEL) => b.verzoek('id.tarasevych.com', pad, body, { ip: IP, kop });
  const ik = async (b: Browser) => (await b.verzoek('id.tarasevych.com', '/api/owner/session/bootstrap', { service: 'identity', tabContext: b.tab })).data?.user?.id as string | undefined;
  let userId = '';
  try {
    const eerste = G.browser();
    await eerste.aanmelden(sub, email, { intent: 'login', service: 'identity' });
    userId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [userId, JSON.stringify({ status: 'approved', name: 'Проба місце' })]);
    for (const v of VLAGGEN) await pool.query('UPDATE app.feature_flags SET aan = true, standaard = false, percentage = 0, gebruikers = $2 WHERE sleutel = $1', [v, [userId]]);
    const bp = await import('../../backend/telegram-aanmelden/beleid-poort');
    const meldingen = async (deel: string) => (await pool.query("select count(*)::int n from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data::text like $2", [userId, `%${deel}%`])).rows[0].n as number;
    const auditRijen = async () => (await pool.query("select details::text d, result o from app.audit where owner_id = $1 and action = 'owner.aanmelden.plaats' order by seq", [userId])).rows as Array<{ d: string; o: string }>;

    // пароль
    const ww = `Wachtwoord-${T}`;
    { const salt = randomBytes(16); await pool.query("insert into app.records (tbl,id,data) values ('identity_passwords_v1',$1,$2)", [`plaats-ww-${userId}`, { userId, algorithm: 'scrypt', n: 16384, r: 8, p: 1, salt: salt.toString('base64url'), hash: scryptSync(ww, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url'), mustChange: false, createdAt: Date.now(), updatedAt: Date.now() }]); }
    const wwPoging = async (b: Browser, plaats?: unknown, kop = KOP_BRUSSEL) => {
      const s = await post(b, '/api/aanmelden/wachtwoord/start', ctx(b, plaats ? { plaats } : {}), kop);
      return post(b, '/api/aanmelden/wachtwoord/voltooien', { pogingId: s.data.pogingId, email, password: ww, code: '' }, kop);
    };
    // ключ доступу
    const pk = nieuwePasskey('es256', 1);
    { const ch = randomBytes(32).toString('base64url');
      const reg = kern.verifieerRegistratie({ ...registreer(pk, ch, { origin: 'https://id.tarasevych.com' }), verwachteUitdaging: ch, rpId: 'tarasevych.com', origins: ['https://id.tarasevych.com'] }) as Record<string, any>;
      await pool.query('INSERT INTO app.passkeys (user_id, credential_id, alg, jwk, vingerafdruk, naam, aaguid, transports, backup_eligible, backup_state, sign_count) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,false,false,$9)', [userId, reg.credentialId, reg.alg, JSON.stringify(reg.jwk), reg.vingerafdruk, 'Проба ключ', '', [], 1]); }
    let teller = 1;
    const pkPoging = async (b: Browser, plaats?: unknown) => {
      const opt = await post(b, '/api/aanmelden/passkey/opties', ctx(b, plaats ? { plaats } : {}));
      teller += 1;
      return post(b, '/api/aanmelden/passkey/voltooien', { uitdagingId: opt.data.uitdagingId, assertie: bevestig(pk, String(opt.data.publicKey?.challenge || ''), { origin: 'https://id.tarasevych.com', teller } as never) });
    };

    check('типово вимога ніде не ввімкнена', (await bp.plaatsEisMethoden(userId)).length === 0 && !(await bp.plaatsVerplicht(userId, 'password')) && !(await bp.plaatsVerplicht(userId)));
    const b0 = G.browser();
    const vrij = await wwPoging(b0);
    check('вимогу вимкнено: вхід паролем без місця працює як раніше', vrij.status === 200 && vrij.data.sessionCreated === true && (await ik(b0)) === userId, `${vrij.status} ${JSON.stringify(vrij.data).slice(0, 160)}`);

    // --- вимога лише для пароля
    check('збереження вибору: лише відомі способи, у сталому порядку', (await bp.plaatsEisZetten(userId, ['password', 'onzin'])).join() === 'password' && (await bp.plaatsEisMethoden(userId)).join() === 'password');
    const b1 = G.browser();
    const zonder = await wwPoging(b1);
    check('пароль із вимогою, місця немає: 409 PLAATS_NODIG, сеансу немає', zonder.status === 409 && zonder.data.reasonCode === 'PLAATS_NODIG' && zonder.data.sessionCreated === false && !(await ik(b1)), `${zonder.status} ${JSON.stringify(zonder.data).slice(0, 160)}`);
    const b1b = G.browser();
    const sm = await wwPoging(b1b, { lat: 'x', lon: 4 });
    check('пароль із вимогою, замість місця сміття: так само PLAATS_NODIG', sm.status === 409 && sm.data.reasonCode === 'PLAATS_NODIG' && !(await ik(b1b)));
    check('зупинена спроба: сповіщення людині в центрі сповіщень', (await meldingen('браузер не надав місце пристрою')) >= 1);
    const b2 = G.browser();
    const met = await wwPoging(b2, BRUSSEL);
    check('пароль із вимогою, місце надано: сеанс створено', met.status === 200 && met.data.sessionCreated === true && (await ik(b2)) === userId, `${met.status} ${JSON.stringify(met.data).slice(0, 160)}`);
    const b3 = G.browser();
    const pkVrij = await pkPoging(b3);
    check('вимога лише для пароля: ключ доступу без місця працює (вибір по способах, а не «все або нічого»)', pkVrij.status === 200 && pkVrij.data.sessionCreated === true && (await ik(b3)) === userId, `${pkVrij.status} ${JSON.stringify(pkVrij.data).slice(0, 160)}`);
    const b4 = G.browser();
    const gVrij = await b4.aanmelden(sub, email, { intent: 'login', service: 'identity', ip: IP });
    check('вимога лише для пароля: Google без місця працює', gVrij.cb.data.ok === true && gVrij.cb.data.sessionCreated === true && (await ik(b4)) === userId, JSON.stringify(gVrij.cb.data).slice(0, 160));

    // --- вимога для ключа доступу й Google, пароль вільний
    await bp.plaatsEisZetten(userId, ['passkey', 'google']);
    const b5 = G.browser();
    const pkZonder = await pkPoging(b5);
    check('ключ доступу з вимогою, місця немає: PLAATS_NODIG, сеансу немає', pkZonder.status === 409 && pkZonder.data.reasonCode === 'PLAATS_NODIG' && !(await ik(b5)), `${pkZonder.status} ${JSON.stringify(pkZonder.data).slice(0, 160)}`);
    const b6 = G.browser();
    const pkMet = await pkPoging(b6, BRUSSEL);
    check('ключ доступу з вимогою, місце надано: сеанс створено', pkMet.status === 200 && pkMet.data.sessionCreated === true && (await ik(b6)) === userId, `${pkMet.status} ${JSON.stringify(pkMet.data).slice(0, 160)}`);
    const b7 = G.browser();
    const gZonder = await b7.aanmelden(sub, email, { intent: 'login', service: 'identity', ip: IP });
    check('Google з вимогою, місця немає: PLAATS_NODIG із адресою повернення на сторінку входу, сеансу немає',
      gZonder.cb.data.ok === false && gZonder.cb.data.reasonCode === 'PLAATS_NODIG' && gZonder.cb.data.sessionCreated === false && /^https:\/\/[a-z]+\.tarasevych\.com/.test(String(gZonder.cb.data.returnTo || '')) && !(await ik(b7)), JSON.stringify(gZonder.cb.data).slice(0, 200));
    const b8 = G.browser();
    const gMet = await b8.aanmelden(sub, email, { intent: 'login', service: 'identity', ip: IP, plaats: BRUSSEL, kop: KOP_BRUSSEL });
    check('Google з вимогою, місце надано: сеанс створено', gMet.cb.data.ok === true && gMet.cb.data.sessionCreated === true && (await ik(b8)) === userId, JSON.stringify(gMet.cb.data).slice(0, 200));
    const b9 = G.browser();
    const wwVrij = await wwPoging(b9);
    check('вимогу для пароля знято: пароль без місця знову працює', wwVrij.status === 200 && wwVrij.data.sessionCreated === true && (await ik(b9)) === userId);
    // підтвердження дії (step-up) у живому сеансі — не вхід: вимога його не зачіпає
    const su = await b8.aanmelden(sub, email, { intent: 'step-up', service: 'identity', ip: IP });
    check('підтвердження дії через Google у живому сеансі не вимагає місця (це не вхід)', su.cb.data.reasonCode !== 'PLAATS_NODIG', JSON.stringify(su.cb.data).slice(0, 200));

    // --- звірка з місцем за IP
    const voorVer = await meldingen('далеко від місця за IP-адресою');
    const b10 = G.browser();
    const ver = await b10.aanmelden(sub, email, { intent: 'login', service: 'identity', ip: IP, plaats: BRUSSEL, kop: KOP_LISSABON });
    await new Promise((r) => setTimeout(r, 150));
    check('місце пристрою (Брюссель) далеко від місця за IP (Лісабон): вхід відбувся, а людина отримала попередження',
      ver.cb.data.sessionCreated === true && (await meldingen('далеко від місця за IP-адресою')) === voorVer + 1, `${JSON.stringify(ver.cb.data).slice(0, 120)} ${await meldingen('далеко від місця за IP-адресою')}`);
    const log = await auditRijen();
    const tekst = log.map((x) => `${x.o}:${x.d}`).join(' ');
    check('аудит: зупинені й успішні спроби з оцінкою («gelijk» / «afwijkend»), без координат',
      log.some((x) => x.o === 'rejected' && /plaats-nodig/.test(x.d)) && /afwijkend/.test(tekst) && /gelijk/.test(tekst) && !/50\.8|4\.35|geoLat|"lat"/.test(tekst), tekst.slice(0, 400));

    // --- усі способи: дозволено (нічого не забороняємо), але без місця не зайти жодним
    await bp.plaatsEisZetten(userId, [...PLAATS_EIS_METHODEN]);
    const b11 = G.browser(), b12 = G.browser(), b13 = G.browser();
    const a1 = await wwPoging(b11), a2 = await pkPoging(b12), a3 = await b13.aanmelden(sub, email, { intent: 'login', service: 'identity', ip: IP });
    check('вимога для всіх способів: без місця не входить жоден, із місцем — входить',
      a1.data.reasonCode === 'PLAATS_NODIG' && a2.data.reasonCode === 'PLAATS_NODIG' && a3.cb.data.reasonCode === 'PLAATS_NODIG' && (await wwPoging(G.browser(), BRUSSEL)).data.sessionCreated === true);
    await bp.plaatsVerplichtZetten(userId, false, 'telegram');
    check('один спосіб вимикається окремо, решта лишаються', !(await bp.plaatsVerplicht(userId, 'telegram')) && (await bp.plaatsEisMethoden(userId)).length === 6);
    await bp.plaatsEisZetten(userId, []);
    check('усе вимкнено: вхід без місця знову працює', (await wwPoging(G.browser())).data.sessionCreated === true);
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    for (const r of vlagVooraf) await pool.query('UPDATE app.feature_flags SET aan=$2, standaard=$3, percentage=$4, gebruikers=$5 WHERE sleutel=$1', [r.sleutel, r.aan, r.standaard, r.percentage, r.gebruikers]).catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`plaats-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await pool.query('delete from app.passkeys where user_id = any($1)', [ids]).catch(() => undefined);
      await pool.query('delete from app.tg_matrix where user_id = any($1)', [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id like 'plaats-ww-%' or id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    }
    await pool.query("delete from app.aanmeld_uitdagingen where aangemaakt_op > now() - interval '1 hour'").catch(() => undefined);
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);
  return einde();
}
