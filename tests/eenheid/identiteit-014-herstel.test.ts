// IDENTITEIT-014 (фаза 3, крок «herstel», 14.11.2026): розділ «Відновлення доступу».
// (а) огляд резерву (src/herstel/reserve.ts + ReserveOverzicht, id herstel-overzicht): два незалежні способи, коди є і збережені,
// ключ даних має passkey з PRF і код сховища; пріоритет — eersteInTeStellen; (б) сценарії (id herstel-scenarios) і наслідки втрати
// ключа (id herstel-sleutelverlies); (в) давня вада: використаний набір кодів виглядав як «не налаштовано» (сервер ставить
// enrolled:false при remaining 0); (г) справжні маршрути: stap-op/methoden, sleutelkluis/stand, «Немає доступу» = totp/disable
// з кодом відновлення облікового запису (код сховища не підходить), аудит і сповіщення, коди закінчилися → банер.
// Herstel: overzicht, scenario's, gevolgen van sleutelverlies; echte routes tegen een wegwerpdatabase en nep-Google.
// Запуск: . <testenv> && node scripts/eenheidstests.mjs identiteit-014-herstel.test.ts
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle, totpCode } from './hulp/nep-google';
import { AccessPlanePanels } from '../../src/toegangslaag-panelen';
import { snapshotNaarKaarten, type SnapshotLike } from '../../src/aanmeld-vnext/snapshotNaarKaarten';
import { codesOp, eersteStap, onafhankelijkeMethoden, reserveControles, type KluisKern } from '../../src/herstel/reserve';
import { ReserveOverzichtWeergave } from '../../src/herstel/ReserveOverzicht';
import { ScenariosWeergave, SleutelverliesBlok } from '../../src/herstel/Scenarios';
import { KLUIS_TEKST } from '../../shared/sleutelkluis';

type Basis = Parameters<typeof AccessPlanePanels>[0];
const kyr = /[А-Яа-яІіЇїЄєҐґ]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-014-herstel');

  // Знімок у формі сервера (backend/toegangslaag.ts, accessSnapshot): recovery.enrolled = remaining>0.
  const snap = (o: { passkey?: boolean; totp?: boolean; rest?: number; createdAt?: number; bekekenOp?: number; google?: boolean } = {}): Basis['data'] => ({
    architecture: 'access-plane-v1',
    contour: { clientId: '', redirectUri: '', credentialsConfigured: true, source: '', hasVaultOverride: false, hasPlatformSecret: false, missing: [], lockProtected: false, updatedAt: 0 },
    policy: { enabled: {}, mfa: 'optional' },
    methods: [{ id: 'google', enabled: true, configured: true, bound: !!o.google, status: o.google ? 'active' : 'ready' }],
    factors: [
      { id: 'totp', enabled: true, enrolled: !!o.totp, status: o.totp ? 'active' : 'not_enrolled' },
      { id: 'recovery', enabled: true, enrolled: (o.rest || 0) > 0, status: (o.rest || 0) > 0 ? 'active' : 'not_enrolled', remaining: o.rest || 0, createdAt: o.createdAt || 0, bekekenOp: o.bekekenOp || 0 },
      { id: 'passkey', enabled: true, enrolled: !!o.passkey, status: o.passkey ? 'active' : 'not_enrolled', count: o.passkey ? 1 : 0 },
    ],
    bindings: o.google ? [{ id: 'b1', method: 'google', email: 'x@example.test', status: 'active' }] : [],
    usableCount: 1, lockout: { protected: false, reason: '' },
    password: { configured: false, mustChange: false }, totp: { enrolled: !!o.totp },
  });
  const kluis = (o: Partial<KluisKern> & { prf?: boolean; code?: boolean } = {}): KluisKern => ({
    stand: o.stand || 'gesloten',
    omslagen: { herstelcode: o.code === false ? null : { aangemaaktOp: 1 }, passkeys: o.prf === false ? [{ prf: false }] : [{ prf: true }] },
    herstelcodeWacht: o.herstelcodeWacht, zonderOmslag: o.zonderOmslag,
  });
  const vind = (s: SnapshotLike, id: string) => snapshotNaarKaarten(s).find((k) => k.id === id);
  const c = (s: SnapshotLike, m: Parameters<typeof reserveControles>[1], k: Parameters<typeof reserveControles>[2], id: string) => reserveControles(s, m, k).find((x) => x.id === id)!;

  // ================================================================ давня вада: використаний набір кодів
  {
    const op = vind(snap({ google: true, rest: 0, createdAt: 1_700_000_000_000 }), 'recovery');
    check('давня вада: набір був, кодів 0 (enrolled:false від сервера) → «attention» + RECOVERY_EMPTY + teller 0 + «manage», а не «не налаштовано»',
      op?.staat === 'attention' && op?.waarschuwingCode === 'RECOVERY_EMPTY' && op?.teller === 0 && op?.hoofdActie === 'manage', JSON.stringify(op));
    const nooit = vind(snap({ google: true }), 'recovery');
    check('кодів ніколи не створювали → «не налаштовано», без банера «закінчилися»', nooit?.staat === 'not-configured' && !nooit?.waarschuwingCode && !codesOp(snap()));
  }

  // ================================================================ незалежні способи
  {
    const alleenGoogle = snap({ google: true });
    check('google:true з stap-op/methoden не рахується без прив’язки у знімку (сервер завжди шле true)',
      onafhankelijkeMethoden(snap(), { totp: false }).length === 0 && onafhankelijkeMethoden(alleenGoogle, null).join() === 'google');
    const een = c(alleenGoogle, { passkey: false, totp: false, herstelcode: false }, kluis({ stand: 'uit' }), 'onafhankelijk');
    check('лише Google → червоний пункт, веде в «Безпеку», каже, що повернути доступ буде нічим', een.toon === 'slecht' && een.sectie === 'security' && /нічим/.test(een.uitleg[0]) && !kyr.test(een.uitleg[1]));
    const twee = c(alleenGoogle, { telegram: true, codewoord: false }, kluis({ stand: 'uit' }), 'onafhankelijk');
    check('Google + Telegram (з methoden) → зелений, обидва названо', twee.toon === 'goed' && /Google/.test(twee.uitleg[0]) && /Telegram/.test(twee.uitleg[0]));
    const zonderMethoden = c(snap({ google: true, passkey: true }), null, undefined, 'onafhankelijk');
    check('stap-op/methoden недоступний → рахуємо те, що знає знімок (passkey + Google = 2)', zonderMethoden.toon === 'goed');
  }

  // ================================================================ коди облікового запису
  {
    check('коди є (5) і збережені → зелений', c(snap({ rest: 5, createdAt: 1, bekekenOp: 2 }), null, undefined, 'codes').toon === 'goed');
    const nietBewaard = c(snap({ rest: 10, createdAt: 1 }), null, undefined, 'codes');
    check('коди є, але «Я зберіг коди» не позначено → червоний, веде у «Відновлення»', nietBewaard.toon === 'slecht' && nietBewaard.sectie === 'recovery' && /не позначені/.test(nietBewaard.titel[0]));
    const op = c(snap({ rest: 0, createdAt: 1, bekekenOp: 2 }), null, undefined, 'codes');
    check('коди закінчилися → червоний «закінчилися»', op.toon === 'slecht' && /закінчилися/.test(op.titel[0]));
    const laden = snap(); laden.factors = laden.factors.map((f) => ({ ...f, status: 'loading' }));
    check('знімок ще завантажується → «перевіряємо», жодного червоного', reserveControles(laden, null, undefined).every((x) => x.toon === 'onbekend'));
  }

  // ================================================================ сховище ключів
  {
    const s = snap();
    check('сховище вимкнене → нейтрально (KLUIS_TEKST.stand.uit), не червоний', c(s, null, kluis({ stand: 'uit' }), 'kluis').toon === 'neutraal' && c(s, null, kluis({ stand: 'uit' }), 'kluis').uitleg[0].startsWith(KLUIS_TEKST.stand.uit.uk));
    check('passkey з PRF + код сховища → зелений', c(s, null, kluis(), 'kluis').toon === 'goed');
    const geenCode = c(s, null, kluis({ code: false }), 'kluis');
    check('немає коду сховища → червоний: втрата всіх passkey = втрата даних', geenCode.toon === 'slecht' && geenCode.sectie === 'security' && /втрату даних|втрата всіх passkey/.test(geenCode.uitleg[0]));
    const geenPrf = c(s, null, kluis({ prf: false }), 'kluis');
    check('passkey без PRF → червоний: щоразу вводити код сховища', geenPrf.toon === 'slecht' && /PRF/.test(geenPrf.uitleg[0]) && !/коду сховища —/.test(geenPrf.uitleg[0]));
    check('новий код сховища чекає підтвердження → жовтий з KLUIS_TEKST.codeWacht', c(s, null, kluis({ herstelcodeWacht: true }), 'kluis').toon === 'aandacht' && c(s, null, kluis({ herstelcodeWacht: true }), 'kluis').uitleg[0] === KLUIS_TEKST.codeWacht.uk);
    check('сховище без жодної обгортки → червоний з KLUIS_TEKST.zonderOmslag', c(s, null, kluis({ zonderOmslag: true }), 'kluis').uitleg[0] === KLUIS_TEKST.zonderOmslag.uk);
    check('стан сховища не прочитано → «не вдалося перевірити», не зелений', c(s, null, null, 'kluis').toon === 'onbekend');
  }

  // ================================================================ «Що зробити першим» (пріоритет eersteInTeStellen)
  {
    const leeg = snap({ google: true });
    check('нічого не налаштовано → першим passkey («Безпека»), як герой «Способів входу»', eersteStap(leeg, reserveControles(leeg, null, undefined))?.sectie === 'security' && /Passkey/.test(eersteStap(leeg, reserveControles(leeg, null, undefined))!.titel[0]));
    const allesBehalveCodes = snap({ google: true, passkey: true, totp: true, rest: 0, createdAt: 1 });
    const e = eersteStap(allesBehalveCodes, reserveControles(allesBehalveCodes, null, kluis()));
    check('усе є, але коди закінчилися → першим «Створити нові коди» у «Відновленні»', e?.sectie === 'recovery' && /нові коди/.test(e!.titel[0]), JSON.stringify(e));
    const alles = snap({ google: true, passkey: true, totp: true, rest: 9, createdAt: 1, bekekenOp: 2 });
    check('усе гаразд → «Що зробити першим» немає', eersteStap(alles, reserveControles(alles, null, kluis())) === null);
  }

  // ================================================================ вигляд огляду
  {
    const s = snap({ google: true, rest: 10, createdAt: 1 });
    const ctr = reserveControles(s, null, kluis({ code: false }));
    const html = renderToStaticMarkup(createElement(ReserveOverzichtWeergave, { lang: 'uk', controles: ctr, eerste: eersteStap(s, ctr), onKies: () => {} }));
    check('огляд: id herstel-overzicht, три пункти, червоні мають кнопку переходу (data-ga), «Що зробити першим»',
      html.includes('id="herstel-overzicht"') && (html.match(/data-controle=/g) || []).length === 3 && html.includes('data-ga="recovery"') && html.includes('data-ga="security"') && html.includes('data-herstel-eerste="security"') && html.includes(`data-rood="${ctr.filter((x) => x.toon === 'slecht').length}"`) && ctr.filter((x) => x.toon === 'slecht').length === 2, html.slice(0, 200));
    const nl = renderToStaticMarkup(createElement(ReserveOverzichtWeergave, { lang: 'nl', controles: ctr, eerste: eersteStap(s, ctr), fout: ['А', 'Niet alles gecontroleerd'], onKies: () => {} }));
    check('огляд нідерландською — без кирилиці; відмова methoden показана чесно', !kyr.test(nl) && nl.includes('data-herstel-fout'));
  }

  // ================================================================ сценарії й наслідки втрати ключа
  {
    const sc = (data: Basis['data'], k: KluisKern | null | undefined, lang: 'uk' | 'nl' = 'uk') => renderToStaticMarkup(createElement(ScenariosWeergave, { lang, data, kluis: k, busy: false, onKies: () => {}, totpUitschakelen: async () => {}, nieuweHerstelcodes: async () => {} }));
    const met = sc(snap({ totp: true, rest: 4, createdAt: 1, bekekenOp: 1 }), kluis());
    check('сценарії: id herstel-scenarios, чотири розгортні картки, перехід до сесій і ключів',
      met.includes('id="herstel-scenarios"') && ['apparaat', 'passkey', 'authenticator', 'codes-op'].every((x) => met.includes(`data-scenario="${x}"`)) && met.includes('data-ga="sessions"') && met.includes('data-ga="security"'));
    check('«Немає доступу» є лише з автентифікатором і чинними кодами; без кодів — пояснення замість кнопки',
      met.includes('data-geen-toegang') && !sc(snap({ rest: 4, createdAt: 1 }), kluis()).includes('data-geen-toegang') && sc(snap({ totp: true, rest: 0, createdAt: 1 }), kluis()).includes('data-geen-codes'));
    check('тексти розводять два коди: код облікового запису (XXXX-XXXX-XXXX) і код сховища ключів', met.includes(KLUIS_TEKST.tweeCodes.uk.slice(0, 40)) && met.includes('XXXX-XXXX-XXXX') && met.includes('не код сховища ключів'));
    check('діалог «Немає доступу» закритий, доки людина не натисне (BevestigDialoog)', !met.includes('data-bevestig="totp-geen-toegang"') && readFileSync('src/herstel/Scenarios.tsx', 'utf8').includes("<BevestigDialoog open={geenToegang} id='totp-geen-toegang' lang={lang} gevaarlijk"));
    const op = sc(snap({ totp: true, rest: 0, createdAt: 1 }), kluis({ stand: 'uit' }));
    check('коди закінчилися → банер із «Створити нові коди» поза data-access-section="recovery" (e2e herstelcodes шукає «Створити коди» у своїй секції)',
      op.includes('data-herstel-codes-op') && op.includes('Створити нові коди') && !op.includes('data-access-section') && /data-scenario="codes-op" open=""/.test(op));
    check('банера немає, якщо коди є або їх ніколи не було', !met.includes('data-herstel-codes-op') && !sc(snap(), kluis()).includes('data-herstel-codes-op'));
    check('наслідки втрати ключа: id herstel-sleutelverlies, KLUIS_TEKST.verlies при ввімкненому сховищі', met.includes('id="herstel-sleutelverlies"') && met.includes(KLUIS_TEKST.verlies.uk.slice(0, 50)) && met.includes('data-kluis="gesloten"'));
    const uit = renderToStaticMarkup(createElement(SleutelverliesBlok, { lang: 'uk', kluis: kluis({ stand: 'uit' }) }));
    check('сховище вимкнене → чесно «дані захищені лише ключем сервера», без лякання втратою даних', uit.includes(KLUIS_TEKST.stand.uit.uk) && !uit.includes('data-kluis-verlies'));
    check('сценарії нідерландською — без кирилиці', !kyr.test(sc(snap({ totp: true, rest: 0, createdAt: 1 }), kluis(), 'nl')));
  }

  // ================================================================ монтування в панелі
  {
    const basis: Basis = {
      tab: 'recovery', lang: 'uk', data: snap({ totp: true, rest: 3, createdAt: 1 }), busy: false, notice: '', password: '', setPassword: () => {},
      otpauth: '', secret: '', code: '', setCode: () => {}, recovery: [], tempPassword: '', context: {},
      write: async () => {}, load: async () => {}, nieuweHerstelcodes: async () => {}, totpUitschakelen: async () => {}, recoverySaved: async () => {},
    };
    const html = (p: Partial<Basis>) => renderToStaticMarkup(createElement(AccessPlanePanels, { ...basis, ...p }));
    const herstel = html({ alleen: 'recovery' });
    const plek = ['id="herstel-overzicht"', 'id="aanmeldmethoden-herstel"', 'id="herstel-scenarios"', 'id="herstel-sleutelverlies"'].map((x) => herstel.indexOf(x));
    check('розділ «Відновлення»: огляд → коди → сценарії → наслідки, по одному разу', plek.every((i, n) => i > 0 && (n === 0 || i > plek[n - 1])) && herstel.split('data-access-section="recovery"').length === 2, plek.join(','));
    const bev = html({ alleen: 'security', tab: 'security' });
    const vhod = html({ alleen: 'methods', tab: 'methods' });
    check('у «Безпеці» і «Вході» огляду й сценаріїв немає (жодних дублів у Макеті й Студії)', ![bev, vhod].some((h) => /herstel-(overzicht|scenarios|sleutelverlies)/.test(h)));
    check('повна сторінка без меж (окремі налаштування) — кожен блок рівно один раз', ['herstel-overzicht', 'herstel-scenarios', 'herstel-sleutelverlies'].every((id) => html({}).split(`id="${id}"`).length === 2));
    const w = readFileSync('src/ToegangslaagWeergave.tsx', 'utf8');
    const centrum = readFileSync('src/InstellingencentrumWeergave.tsx', 'utf8');
    check('onKies: центр налаштувань → AccessPlaneView → панель (перехід до «Сесій», «Безпеки»); без нього — прокрутка naarSectie',
      centrum.includes("body=<AccessPlaneView tab={p.tab} lang={p.lang} mode='identity' onKies={p.onNavigate}/>") && w.includes("telegramSectie={telegramAan&&tab==='methods'&&mode==='identity'} onKies={onKies}/>") && readFileSync('src/toegangslaag-panelen.tsx', 'utf8').includes('if(p.onKies)p.onKies(sectie);else naarSectie(sectie);'));
    const stand = readFileSync('tests/e2e/hulp/identiteit-maquette-stand/stand.tsx', 'utf8');
    check('e2e-стенд «Макета» має ті самі якорі розділу «Відновлення», що й справжня панель', ['herstel-overzicht', 'aanmeldmethoden-herstel', 'herstel-scenarios', 'herstel-sleutelverlies'].every((id) => stand.includes(`id='${id}'`)));
  }

  // ================================================================ сервер: справжні маршрути
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const eigenaar = `i14h-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [email])).rows[0]?.id as string;
  if (Date.now() % 30000 > 20000) await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 200));
  const stap = Math.floor(Date.now() / 30000);
  try {
    const O = G.browser();
    await O.aanmelden(`sub-i14h-${T}`, eigenaar, { authTime: Math.floor(Date.now() / 1000) - 3600 });
    const id = (pad: string, extra: Record<string, unknown> = {}) => O.verzoek('id.tarasevych.com', pad, O.ctxBody('identity', extra));
    const oId = await idRij(eigenaar);

    await O.aanmelden(`sub-i14h-${T}`, eigenaar, { intent: 'step-up' });
    const s1 = await id('/api/owner/access/totp/start');
    const c1 = await id('/api/owner/access/totp/confirm', { code: totpCode(s1.data.secret, stap - 1) });
    const codes: string[] = c1.data.recoveryCodes || [];
    await id('/api/owner/access/recovery/bekeken');
    const m1 = await id('/api/owner/access/stap-op/methoden', { actie: 'herstel-overzicht', sterk: false });
    const sn1 = await id('/api/owner/access/snapshot');
    const ks = await id('/api/owner/sleutelkluis/stand');
    check('маршрути огляду: stap-op/methoden (totp, коди; google завжди true), знімок, стан сховища — без step-up',
      c1.status === 200 && codes.length === 10 && m1.status === 200 && m1.data.methoden.totp === true && m1.data.methoden.herstelcode === true && m1.data.methoden.google === true && sn1.status === 200 && ks.status === 200 && typeof ks.data.stand === 'string',
      `${c1.status} ${m1.status} ${sn1.status} ${ks.status} ${ks.body?.slice?.(0, 80)}`);
    const echt = reserveControles(sn1.data, m1.data.methoden, ks.data);
    check('справжні дані: ≥2 незалежні способи (автентифікатор, коди, Google), коди збережені — зелені', echt.find((x) => x.id === 'onafhankelijk')?.toon === 'goed' && echt.find((x) => x.id === 'codes')?.toon === 'goed', JSON.stringify(echt.map((x) => x.toon)));

    // «Немає доступу»: код сховища ключів (5×4) не підходить; код облікового запису — вимикає автентифікатор.
    const kluisVorm = await id('/api/owner/access/totp/disable', { code: 'ABCD-EFGH-JKLM-NPQR-STUV' });
    check('«Немає доступу» з кодом формату сховища ключів → відмова, автентифікатор лишається', kluisVorm.status >= 400 && /ACCESS_/.test(String(kluisVorm.data.error)), `${kluisVorm.status} ${kluisVorm.data.error}`);
    const uit = await id('/api/owner/access/totp/disable', { code: codes[0] });
    const melding = (await pool.query("select count(*)::int n from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data::text like '%(TOTP) вимкнено%'", [oId])).rows[0].n;
    const audit = (await pool.query("select count(*) filter (where result='success')::int ok, count(*) filter (where result='failure')::int fout from app.audit where owner_id=$1 and action='access.totp.disable'", [oId])).rows[0];
    check('«Немає доступу» з кодом відновлення облікового запису → автентифікатор вимкнено, код згорів, сповіщення безпеки й аудит',
      uit.status === 200 && uit.data.totp?.enrolled === false && uit.data.factors.find((f: { id: string }) => f.id === 'recovery')?.remaining === 9 && melding === 1 && audit.ok === 1 && audit.fout === 1, `${uit.status} melding=${melding} audit=${JSON.stringify(audit)}`);
    const nogmaals = await id('/api/owner/access/stap-op', { methode: 'herstelcode', code: codes[0] });
    check('використаний код більше не діє', nogmaals.status === 400, `${nogmaals.status}`);

    // Решту кодів використано → знімок: remaining 0, enrolled false, createdAt є → банер і «attention».
    for (const k of codes.slice(1)) await id('/api/owner/access/stap-op', { methode: 'herstelcode', code: k });
    const sn2 = await id('/api/owner/access/snapshot');
    const r = sn2.data.factors.find((f: { id: string }) => f.id === 'recovery');
    check('сервер: усі коди використано → remaining 0, enrolled false, createdAt > 0 (саме тому давня вада ховала «закінчилися»)', r?.remaining === 0 && r?.enrolled === false && r?.createdAt > 0, JSON.stringify(r));
    const html = renderToStaticMarkup(createElement(ScenariosWeergave, { lang: 'uk', data: sn2.data, kluis: ks.data, busy: false, onKies: () => {}, totpUitschakelen: async () => {}, nieuweHerstelcodes: async () => {} }));
    check('справжній знімок → банер «Коди відновлення закінчилися», картка Google-входу лишається єдиним способом (червоний пункт)',
      codesOp(sn2.data) && html.includes('data-herstel-codes-op') && vind(sn2.data, 'recovery')?.waarschuwingCode === 'RECOVERY_EMPTY' && reserveControles(sn2.data, null, ks.data).find((x) => x.id === 'onafhankelijk')?.toon === 'slecht');
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i14h-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    await pool.query('delete from app.login_lockouts where subject = any($1)', [ids.map((i) => `stap-op:${i}`)]);
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool();
  return einde();
}
