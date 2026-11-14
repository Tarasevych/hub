// IDENTITEIT-014 (фаза 3, крок «kaart», 14.11.2026):
// (а) нагадування про резервний доступ — вподобання в моделі меню (типово ввімкнено), справжній перемикач у #menu-meldingen,
//     серверне сповіщення access_recovery_low, коли після використання коду лишилося ≤2: рівно один раз на набір кодів і лише
//     з увімкненим налаштуванням; перевірено через справжні маршрути проти одноразової бази й підробленого Google;
// (б) жива карта: кожна ціль data-kaart-ga з реєстру існує в коді (справжній рендер панелей або вихідний код), розділ
//     «Відновлення» повністю працює й зникає з карти, демо-перемикача нагадування в «Макеті» більше немає.
// Herinnering aan reservetoegang (≤2 herstelcodes, één keer per set, schakelaar in het menu) en de levende kaart (elk doel bestaat).
// Запуск: . <testenv> && node scripts/eenheidstests.mjs identiteit-014-kaart.test.ts
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle, totpCode } from './hulp/nep-google';
import { normaliseerMeldingen, standaardMeldingen } from '../../shared/menu-meldingen-voorkeuren';
import { normaliseerZijbalk, standaardZijbalk } from '../../shared/menu-model';
import { MELDING_SOORTEN } from '../../shared/melding-soorten';
import { SFEER_PER_SOORT } from '../../shared/meldingen-soorten';
import { uitlegVoor } from '../../shared/meldingen-v2/uitleg-register';
import { registreerMelder, registreerMeldingVoorkeurLezer } from '../../backend/melder';
import { RESERVE_DREMPEL, RESERVE_LINK, RESERVE_SOORT, reserveBijnaOpMelden, reserveOnderDrempel, reserveTekst } from '../../backend/reserve-herinnering';
import { AccessPlanePanels } from '../../src/toegangslaag-panelen';

const lees = (p: string) => readFileSync(p, 'utf8');
const kyr = /[А-Яа-яІіЇїЄєҐґ]/;
type Basis = Parameters<typeof AccessPlanePanels>[0];

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-014-kaart');

  // ================================================================ модель: вподобання нормалізується однаково в браузері й на сервері
  {
    const std = standaardMeldingen();
    check('вподобання: типово «Нагадувати про резервний доступ» увімкнено (попередження безпеки)', std.reserveHerinnering === true && standaardZijbalk().meldingen.reserveHerinnering === true);
    check('вподобання: false зберігається, сміття → типове true, порядок полів однаковий (JSON-порівняння меню не ламається)',
      normaliseerMeldingen({ reserveHerinnering: false }).reserveHerinnering === false && normaliseerMeldingen({ reserveHerinnering: 'nee' }).reserveHerinnering === true
      && JSON.stringify(normaliseerMeldingen('x')) === JSON.stringify(std) && JSON.stringify(normaliseerZijbalk(normaliseerZijbalk({ meldingen: { reserveHerinnering: false } }))) === JSON.stringify(normaliseerZijbalk({ meldingen: { reserveHerinnering: false } })));
  }

  // ================================================================ реєстри типів і пояснення
  {
    check('тип access_recovery_low: у MELDING_SOORTEN (безпека, важливе) і в SFEER_PER_SOORT (приватне)',
      MELDING_SOORTEN[RESERVE_SOORT]?.type === 'beveiliging' && MELDING_SOORTEN[RESERVE_SOORT]?.ernst === 'belangrijk' && SFEER_PER_SOORT[RESERVE_SOORT] === 'prive');
    const u = uitlegVoor({ id: 'x', soort: RESERVE_SOORT, titel: 'Залишилося мало кодів відновлення', tekst: '', bron: 'site', tijd: Date.now() } as never);
    // IDENTITEIT-014 (herstel): рецензія знайшла мертвий якір methods#herstel — посилання законно переїхало на розділ, де коди є
    // (/recovery#aanmeldmethoden-herstel); перевіряємо нове місце (див. також identiteit-014-herstel-recensie.test.ts).
    check('пояснення: окремий вид «herstelcodes-bijna-op» — каже, що станеться, і веде до створення нових кодів, без «Це був я / не я»',
      u.id === 'herstelcodes-bijna-op' && /увійти буде неможливо/.test(u.gevolg[0]) && u.acties.some((a) => a.soort === 'wijziging' && /recovery#aanmeldmethoden-herstel/.test(a.href!({} as never) || '')) && !u.acties.some((a) => a.soort === 'niet-ik' || a.soort === 'dit-was-ik'), u.id);
    const gebruikt = uitlegVoor({ id: 'y', soort: 'access_recovery_code_used', titel: 'Використано код відновлення', tekst: '', bron: 'site', tijd: Date.now() } as never);
    check('пояснення: «код використано» і далі має свій вид herstelcode', gebruikt.id === 'herstelcode');
  }

  // ================================================================ логіка межі (без бази): заглушки читача вподобань і надсилача
  {
    const t2 = reserveTekst(2), t0 = reserveTekst(0);
    check('текст: двомовний «uk / nl», кількість і наслідок; окремий текст, коли кодів 0',
      RESERVE_DREMPEL === 2 && kyr.test(t2.tekst.split(' / ')[0]) && t2.tekst.includes('Залишилося кодів відновлення: 2') && t2.tekst.includes('Nog 2 herstelcode') && t0.tekst.includes('Кодів відновлення більше немає') && t0.tekst.includes('geen herstelcodes meer'));
    check('межа: 3 — ні; 2, 1, 0 — так; відкликаний набір — ні', !reserveOnderDrempel(3) && reserveOnderDrempel(2) && reserveOnderDrempel(1) && reserveOnderDrempel(0) && !reserveOnderDrempel(1, true) && !reserveOnderDrempel(Number.NaN));
    const verstuurd: string[] = [];
    registreerMelder(async (_u, _e, kind, _t, _m, link) => { verstuurd.push(`${kind}|${link || ''}`); });
    let voorkeur: boolean | undefined = undefined;
    registreerMeldingVoorkeurLezer(async () => (voorkeur === undefined ? undefined : { ...standaardMeldingen(), reserveHerinnering: voorkeur }));
    let vlag = false;
    const eenmalig = async () => { if (vlag) return false; vlag = true; return true; };
    const stand = (over: number) => async () => ({ over, ingetrokken: false });
    const r3 = await reserveBijnaOpMelden('u', stand(3), eenmalig);
    voorkeur = false;
    const rUit = await reserveBijnaOpMelden('u', stand(2), eenmalig);
    voorkeur = undefined; // geen lezer-antwoord → standaard aan
    const rAan = await reserveBijnaOpMelden('u', stand(2), eenmalig);
    const rNog = await reserveBijnaOpMelden('u', stand(1), eenmalig);
    check('логіка: вище межі — нічого; вимкнено — нічого і вимкнення не «з’їдає» одноразову позначку; далі рівно одне сповіщення з посиланням',
      r3 === 'boven-drempel' && rUit === 'uit' && rAan === 'gemeld' && rNog === 'al-gemeld' && verstuurd.length === 1 && verstuurd[0] === `${RESERVE_SOORT}|${RESERVE_LINK}`, `${r3} ${rUit} ${rAan} ${rNog} ${verstuurd.join(',')}`);
    const rFout = await reserveBijnaOpMelden('u', async () => { throw new Error('db weg'); }, eenmalig);
    check('логіка: збій читання не кидає далі (вхід із кодом не ламається)', rFout === 'fout');
    registreerMeldingVoorkeurLezer(async () => { throw new Error('kapot'); });
    vlag = false;
    check('логіка: збій читання вподобань → типове «увімкнено» (попередження не губиться)', await reserveBijnaOpMelden('u', stand(2), eenmalig) === 'gemeld');
  }

  // ================================================================ інтерфейс: справжній перемикач і прибраний демо-перемикач
  {
    const z = lees('src/ZijbalkInstellingen.tsx');
    const i = z.indexOf("schakel('reserve',"), groep = z.indexOf("<div className='zijbalk-meldingen-groep'");
    check('меню: перемикач reserve у #menu-meldingen, поза групою, що вимикається разом із мітками (не disabled від !m.aan)',
      i > z.indexOf("<Blok id='menu-meldingen'") && i < groep && !z.slice(i, z.indexOf('\n', i)).includes(',!m.aan)') && z.slice(i, z.indexOf('\n', i)).includes('zetM({reserveHerinnering:x})'));
    const loc = lees('docs/ontwerp/identiteit-account/maquette-bron/locales.js'), motor = lees('src/identiteit/maquette/maquette-motor.ts');
    check('«Макет»: демо-перемикача нагадування більше немає (джерело й згенерований двигун), замість нього — указівка на Меню',
      !/type:"toggle",label:"(Нагадування про резервний доступ|Herinnering over herstel)"/.test(loc + motor) && loc.includes('Справжній перемикач — у Меню') && motor.includes('De echte schakelaar staat bij Menu'));
    const t = lees('backend/toegangslaag.ts');
    check('сервер: перевірка в herstelcodeGebruiken — спільній точці входу, TOTP і «Підтвердіть доступ»', /async function herstelcodeGebruiken[\s\S]*?await reserveBijnaOpMelden\(userId,[\s\S]*?return sleutel;/.test(t) && t.includes("'laagGemeld',herstelSetSleutel(recovery)"));
  }

  // ================================================================ жива карта: кожна ціль існує в коді
  {
    const bron = 'docs/ontwerp/identiteit-account/maquette-bron/';
    const stomp = { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } };
    type Rij = { ціль?: string; стан?: string };
    type Groep = { стан?: string; ціль?: string; цілі?: Record<string, string>; рядки?: Record<string, string>; додати?: Rij[] };
    type Kaart = { tekenМайбутніМожливості: (s: string) => string; реєстрНалаштувань: Record<string, { id: string; рядки: unknown[] }[]>; станНаСайті: Record<string, Record<string, Groep>> };
    const kaart = (new Function('document', 'preferences', 'showToast', 'openInlineSettings',
      `${lees(bron + 'піктограми.js')}\n${lees(bron + 'реєстр.js')}\n;return {tekenМайбутніМожливості,реєстрНалаштувань,станНаСайті};`) as (...a: unknown[]) => Kaart)(stomp, { lang: 'uk' }, () => {}, () => {});
    // Усі цілі з даних (не лише видимі кнопки: ціль зниклої групи стане кнопкою, щойно рядок знову стане частковим).
    const doelen = new Set<string>();
    for (const [sectie, groepen] of Object.entries(kaart.станНаСайті)) for (const g of Object.values(groepen)) {
      for (const d of [g.ціль, ...Object.values(g.цілі || {}), ...(g.додати || []).map((r) => r.ціль)]) if (d) doelen.add(d.includes('|') ? d : `${sectie}|${d}`);
    }
    const html = Object.keys(kaart.реєстрНалаштувань).map((s) => kaart.tekenМайбутніМожливості(s)).join('');
    const knoppen = [...html.matchAll(/data-kaart-ga="([^"]+)"/g)].map((m) => m[1].replace(/&quot;/g, '"'));
    check('карта: кожна видима кнопка переходу — одна з цілей реєстру', knoppen.length > 0 && knoppen.every((k) => doelen.has(k)), knoppen.filter((k) => !doelen.has(k)).join(', '));

    // Вихідний код інтерфейсу (без згенерованого двигуна макета).
    const bestanden: string[] = [];
    const loop = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) loop(p); else if (/\.tsx?$/.test(n) && !n.startsWith('maquette-')) bestanden.push(p); } };
    loop('src');
    const code = bestanden.map((p) => ({ p, s: lees(p) }));
    const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // id/клас/атрибут як літерал, або атрибут через змінну ({id}) у файлі, де це значення передається як 'v' (schakel('reserve',…), <Kaart id='apparaat'>).
    const deelBestaat = (deel: string): boolean => {
      let m = /^#([\w-]+)$/.exec(deel);
      if (m) { const r = new RegExp(`\\bid=(['"])${esc(m[1])}\\1|\\bid=\\{'${esc(m[1])}'\\}|<Blok id='${esc(m[1])}'`); return code.some((f) => r.test(f.s)); }
      m = /^\.([\w-]+)$/.exec(deel);
      if (m) { const r = new RegExp(`className=['"{][^'"}]*\\b${esc(m[1])}\\b`); return code.some((f) => r.test(f.s)); }
      m = /^\[([\w-]+)="([^"]+)"\]$/.exec(deel);
      if (m) { const [, attr, waarde] = m; const letterlijk = new RegExp(`${esc(attr)}=(['"])${esc(waarde)}\\1`); const via = new RegExp(`${esc(attr)}=\\{\\w+\\}`); return code.some((f) => letterlijk.test(f.s) || (via.test(f.s) && f.s.includes(`'${waarde}'`))); }
      return false;
    };
    const ontbreekt = [...doelen].filter((d) => !d.split('|')[1].split(/\s+/).every(deelBestaat));
    check(`карта: усі ${doelen.size} цілей data-kaart-ga існують як id / клас / атрибут у коді src/`, doelen.size >= 25 && ontbreekt.length === 0, ontbreekt.join(', '));
    const fase3 = ['menu|#menu-meldingtypen', 'menu|[data-meld-schakel="reserve"]', 'sharing|#delen-uitnodigen', 'sharing|#delen-leden', 'account|#gegevensuitvoer', 'recovery|#herstel-overzicht', 'recovery|#herstel-scenarios', 'recovery|#herstel-sleutelverlies', 'methods|#aanmeldmethoden-wachtwoord', 'methods|#aanmeldmethoden-catalogus', 'security|#aanmeldmethoden-2fa'];
    check('карта: якорі фази 3 використано саме з цими назвами й у своїх розділах', fase3.every((d) => doelen.has(d)), fase3.filter((d) => !doelen.has(d)).join(', '));

    // Справжній рендер старої панелі в межах розділу (як гніздо «Макета»): цілі розділів methods / security / recovery на місці.
    const data: Basis['data'] = {
      architecture: 'access-plane-v1',
      contour: { clientId: '', redirectUri: '', credentialsConfigured: true, source: '', hasVaultOverride: false, hasPlatformSecret: false, missing: [], lockProtected: false, updatedAt: 0 },
      policy: { enabled: {}, mfa: 'optional' },
      methods: [{ id: 'google', enabled: true, configured: true, status: 'active' }, { id: 'password', enabled: true, configured: false, bound: false, status: 'not_configured' }],
      factors: [{ id: 'totp', enabled: true, enrolled: true, status: 'active' }],
      bindings: [], usableCount: 1, lockout: { protected: false, reason: '' },
      password: { configured: false, mustChange: false }, totp: { enrolled: true },
    } as Basis['data'];
    const basis: Basis = {
      tab: 'methods', lang: 'uk', data, busy: false, notice: '', password: '', setPassword: () => {},
      otpauth: '', secret: '', code: '', setCode: () => {}, recovery: [], tempPassword: '', context: {},
      write: async () => {}, load: async () => {}, nieuweHerstelcodes: async () => {}, totpUitschakelen: async () => {}, recoverySaved: async () => {},
    };
    const paneel = (alleen: string) => renderToStaticMarkup(createElement(AccessPlanePanels, { ...basis, tab: alleen === 'security' ? 'security' : basis.tab, alleen } as Basis));
    const vanSectie: Record<string, string> = { methods: paneel('methods'), security: paneel('security'), recovery: paneel('recovery') };
    const inRender = (d: string) => {
      const [sectie, sel] = d.split('|');
      const h = vanSectie[sectie]; if (!h) return true; // інші розділи — вихідний код вище
      return sel.split(/\s+/).every((deel) => { const m = /^#([\w-]+)$/.exec(deel) || /^\[[\w-]+="([^"]+)"\]$/.exec(deel); return !!m && (h.includes(`id="${m[1]}"`) || h.includes(`="${m[1]}"`)); });
    };
    const nietGerenderd = [...doelen].filter((d) => !inRender(d));
    check('карта: цілі розділів «Вхід», «Безпека» й «Відновлення» є в справжньому рендері панелі саме цього розділу', nietGerenderd.length === 0, nietGerenderd.join(', '));
    // IDENTITEIT-015 (kaart-stille-uren): «Пароль» більше не «працює повністю» — тимчасовий пароль від власника не дає входу, а форми
    // заміни під час входу немає (рядок methods.пароль.0.vymoha-zaminy — «частково працює»); група повернулася на карту з чесним підписом.
    check('карта: «Відновлення», «Запрошення», «Чинні», «Сповіщення в меню» й автентифікатор працюють повністю — на карті їх немає; «Стан пароля й вимога заміни» — «Частково»',
      kaart.tekenМайбутніМожливості('recovery') === '' && /Стан пароля й вимога його заміни<\/span><small class="future-option-status future-stand-deels">/.test(html) && !html.includes('Доступ за обліковим записом') && !html.includes('Чинні запрошення та дозволи') && !html.includes('Сповіщення в меню') && !html.includes('Двофакторна автентифікація'));
    // IDENTITEIT-015 (apparaten-uitvoer): формат вивантаження (JSON / ZIP із CSV) тепер працює повністю — група «Керування вивантаженням
    // даних» зникла з карти (як і інші повністю робочі); перевірку перенесено в identiteit-015-apparaten-uitvoer.
    // IDENTITEIT-015 (kaart-stille-uren): інші способи входу — код є, працюють після ключів/прапорця власника: новий підпис
    // «Потребує налаштування власника» (future-stand-eigenaar) замість «Частково реалізовано».
    check('карта: частково готове лишається чесно частковим (строк посилання); інші способи входу — «Потребує налаштування власника»; формат вивантаження — працює, на карті його немає',
      /Строк дії посилання<\/span><small class="future-option-status future-stand-deels">/.test(html) && !html.includes('Формат вивантаження') && /Microsoft[^<]*<\/span><small class="future-option-status future-stand-eigenaar">Потребує налаштування власника/.test(html));
  }

  // ================================================================ сервер: справжні маршрути проти бази
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const eigenaar = `i14k-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar }); // laadt backend/index → registreert de echte melder en voorkeurlezer
  const pool = getPool();
  const oud = Math.floor(Date.now() / 1000) - 3600;
  if (Date.now() % 30000 > 20000) await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 200));
  const stap = Math.floor(Date.now() / 30000);
  try {
    const O = G.browser();
    await O.aanmelden(`sub-i14k-${T}`, eigenaar, { authTime: oud });
    const id = (pad: string, extra: Record<string, unknown> = {}) => O.verzoek('id.tarasevych.com', pad, O.ctxBody('identity', extra));
    const oId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id as string;
    const laag = async () => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'=$2 order by (data->>'createdAt')::bigint", [oId, RESERVE_SOORT])).rows.map((r: { data: Record<string, string> }) => r.data);
    const gebruik = async (code: string) => (await id('/api/owner/access/stap-op', { methode: 'herstelcode', code })).status;

    await O.aanmelden(`sub-i14k-${T}`, eigenaar, { intent: 'step-up' });
    const s1 = await id('/api/owner/access/totp/start');
    const c1 = await id('/api/owner/access/totp/confirm', { code: totpCode(s1.data.secret, stap - 1) });
    const A: string[] = c1.data.recoveryCodes || [];
    check('сервер: набір із 10 кодів відновлення', c1.status === 200 && A.length === 10, `${c1.status} ${A.length}`);

    // Типово ввімкнено: 7 кодів → лишилося 3 — тиша; 8-й → лишилося 2 — одне сповіщення; 9-й → лишилося 1 — без повтору.
    const eerste = [];
    for (const c of A.slice(0, 7)) eerste.push(await gebruik(c));
    const na7 = (await laag()).length;
    const st8 = await gebruik(A[7]);
    const na8 = await laag();
    const st9 = await gebruik(A[8]);
    const na9 = (await laag()).length;
    check('сервер: лишилося 3 — сповіщення немає; лишилося 2 — рівно одне access_recovery_low з посиланням і кількістю',
      eerste.every((s) => s === 200) && na7 === 0 && st8 === 200 && na8.length === 1 && na8[0].link === RESERVE_LINK && na8[0].message.includes('Залишилося кодів відновлення: 2') && na8[0].read === false as unknown as string, `${eerste.join(',')} ${na7} ${st8} ${na8.length}`);
    check('сервер: наступний код (лишився 1) — повторного сповіщення для цього набору немає', st9 === 200 && na9 === 1, String(na9));

    // Вимкнути налаштування в меню (сервер нормалізує й зберігає поле).
    const uit = await id('/api/owner/ui/sidebar/save', { sidebar: { meldingen: { reserveHerinnering: false } } });
    check('меню: сервер зберігає reserveHerinnering=false у налаштуваннях меню', uit.status === 200 && uit.data.sidebar?.meldingen?.reserveHerinnering === false, `${uit.status} ${JSON.stringify(uit.data.sidebar?.meldingen || {}).slice(0, 120)}`);

    // Заміна автентифікатора кодом відновлення (другий шлях використання коду) → новий набір B.
    const s2 = await id('/api/owner/access/totp/start', { currentCode: A[9] });
    const c2 = await id('/api/owner/access/totp/confirm', { code: totpCode(s2.data.secret, stap + 1) });
    const B: string[] = c2.data.recoveryCodes || [];
    check('сервер: останній код набору A через заміну автентифікатора — набір A уже сповіщено, нового сповіщення немає; новий набір B', s2.status === 200 && c2.status === 200 && B.length === 10 && (await laag()).length === 1, `${s2.status} ${c2.status} ${B.length}`);

    const tweede = [];
    for (const c of B.slice(0, 8)) tweede.push(await gebruik(c));
    check('сервер: налаштування вимкнено — після переходу межі в наборі B сповіщення немає', tweede.every((s) => s === 200) && (await laag()).length === 1, tweede.join(','));

    const aan = await id('/api/owner/ui/sidebar/save', { sidebar: { meldingen: { reserveHerinnering: true } } });
    const st = await gebruik(B[8]);
    const naAan = await laag();
    const st10 = await gebruik(B[9]);
    check('сервер: знову ввімкнено — наступне використання нижче межі дає одне сповіщення для набору B (лишився 1), далі тиша',
      aan.status === 200 && st === 200 && naAan.length === 2 && naAan[1].message.includes('Залишилося кодів відновлення: 1') && st10 === 200 && (await laag()).length === 2, `${aan.status} ${st} ${naAan.length}`);
    // Новий набір перезаписує запис (nieuweHerstelSet) — позначка набору A зникає разом із ним; лишається лише позначка поточного набору B.
    const rec = (await pool.query("select data from app.records where tbl='identity_recovery_codes_v1' and data->>'userId'=$1", [oId])).rows[0]?.data as { remaining: number; createdAt: number; laagGemeld?: Record<string, number> };
    check('сервер: одноразова позначка — у записі поточного набору й прив’язана до нього (createdAt), коди закінчилися',
      rec?.remaining === 0 && JSON.stringify(Object.keys(rec?.laagGemeld || {})) === JSON.stringify([String(rec.createdAt)]), JSON.stringify(rec?.laagGemeld));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i14k-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    await pool.query('delete from app.login_lockouts where subject = any($1)', [ids.map((i) => `stap-op:${i}`)]);
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool();
  return einde();
}
