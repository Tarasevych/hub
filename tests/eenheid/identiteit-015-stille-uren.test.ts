// IDENTITEIT-015 (крок «kaart-stille-uren», 14.11.2026): тихі години для всього центру сповіщень.
// Перевіряє СПРАВЖНЮ поведінку: (1) чисту логіку shared/stille-uren.ts з керованим часом (через північ, один підсумок, вимкнення,
// зміна кінця, пошкоджений запис); (2) збереження тихих годин через справжні маршрути backend/index.ts (sidebar/save → sidebar)
// проти одноразової бази, і старий запис без поля «stil» — тиші немає; (3) справжній центр сповіщень (CanoniekMeldingencentrum)
// у справжньому Chrome з керованим годинником: у тишу подія не спливає й не звучить, безпека спливає, після кінця — рівно один
// підсумок «Поки була тиша: N», після перезавантаження — жодного другого. Лише вигадані дані; назовні не йде нічого.
// Stille uren voor het hele meldingencentrum: zuivere logica, opslag via de echte routes, en het echte centrum in Chrome met een nepklok.
// Давня вада поруч (рядок methods.пароль.0.vymoha-zaminy): тимчасовий пароль (mustChange) після кроку «aanmelden» давав повний вхід —
// тепер 403 ACCESS_PASSWORD_MUST_CHANGE без сеансу, з поясненням; власний пароль входить як раніше (розділ 2б).
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-015-stille-uren.test.ts
import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { leesTeller, samenvattingTekst, stilNu, stilStap, stilTot, type StilVoorkeur } from '../../shared/stille-uren';
import { normaliseerMeldingen } from '../../shared/menu-meldingen-voorkeuren';
import { aanmeldWeigering } from '../../src/weigeringen';

const kyr = /[А-Яа-яІіЇїЄєҐґ]/;
const lees = (p: string) => readFileSync(p, 'utf8');
/** Lokale tijd (de logica rekent in lokale tijd, net als de browser). */
const op = (j: number, m: number, d: number, u: number, min = 0) => new Date(j, m - 1, d, u, min, 0, 0);

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-stille-uren');

  // ================================================================ (1) чиста логіка з керованим часом
  {
    const nacht: StilVoorkeur = { aan: true, van: '22:00', tot: '07:00' };
    check('stilNu: 23:00 і 03:00 — тиша; 07:00 і 12:00 — ні; вимкнено — ніколи; рівні межі — ніколи',
      stilNu(nacht, op(2026, 11, 14, 23)) && stilNu(nacht, op(2026, 11, 15, 3)) && !stilNu(nacht, op(2026, 11, 15, 7)) && !stilNu(nacht, op(2026, 11, 15, 12))
      && !stilNu({ ...nacht, aan: false }, op(2026, 11, 14, 23)) && !stilNu({ aan: true, van: '09:00', tot: '09:00' }, op(2026, 11, 14, 9)) && !stilNu(undefined, op(2026, 11, 14, 23)));
    check('stilNu: зіпсований час «25:00»/порожній — не тиша (не мовчати через помилку)', !stilNu({ aan: true, van: '25:00', tot: '07:00' }, op(2026, 11, 14, 23)) && !stilNu({ aan: true, van: '', tot: '07:00' }, op(2026, 11, 14, 23)));
    check('stilTot: 23:30 при 22:00–07:00 → завтра 07:00; 03:00 → сьогодні 07:00; поза тишею → null',
      stilTot(nacht, op(2026, 11, 14, 23, 30)) === op(2026, 11, 15, 7).getTime() && stilTot(nacht, op(2026, 11, 15, 3)) === op(2026, 11, 15, 7).getTime() && stilTot(nacht, op(2026, 11, 15, 12)) === null);
    const dag: StilVoorkeur = { aan: true, van: '09:00', tot: '17:00' };
    check('stilTot: тиша в межах дня 09:00–17:00 → 17:00 того ж дня', stilTot(dag, op(2026, 11, 14, 10)) === op(2026, 11, 14, 17).getTime());

    // Дві події в тиші → після кінця рівно один підсумок 2; друга перевірка — нічого.
    let s = stilStap(null, nacht, op(2026, 11, 14, 23), 1);
    check('крок: подія в тиші рахується (n=1, кінець — завтра 07:00), підсумку ще немає', s.stil && s.teller?.n === 1 && s.teller.tot === op(2026, 11, 15, 7).getTime() && s.samenvatting === null);
    s = stilStap(s.teller, nacht, op(2026, 11, 15, 2), 1);
    check('крок: друга подія тієї ж ночі → n=2', s.teller?.n === 2 && s.samenvatting === null);
    const zonder = stilStap(s.teller, nacht, op(2026, 11, 15, 6, 59));
    check('крок: до кінця тиші підсумку немає, лічильник цілий', zonder.samenvatting === null && zonder.teller?.n === 2);
    const na = stilStap(s.teller, nacht, op(2026, 11, 15, 7, 0));
    check('крок: о 07:00 — один підсумок 2, лічильник стерто', na.samenvatting === 2 && na.teller === null && !na.stil);
    check('крок: повторна перевірка після підсумку — нічого (рівно один раз)', stilStap(na.teller, nacht, op(2026, 11, 15, 7, 1)).samenvatting === null);
    check('крок: подія ПІСЛЯ тиші не рахується', stilStap(null, nacht, op(2026, 11, 15, 12), 1).teller === null);
    // Вкладка «спала» через кінець і прокинулася вже в НОВІЙ тиші: спершу підсумок старої ночі, потім нова подія рахується окремо.
    const sliep = stilStap({ n: 3, tot: op(2026, 11, 15, 7).getTime() }, nacht, op(2026, 11, 15, 23), 1);
    check('крок: стара ніч (3) підсумовується, нова подія — новий лічильник 1', sliep.samenvatting === 3 && sliep.teller?.n === 1 && sliep.teller.tot === op(2026, 11, 16, 7).getTime());
    check('крок: тихі години вимкнено посеред тиші → підсумок одразу', stilStap({ n: 4, tot: op(2026, 11, 15, 7).getTime() }, { ...nacht, aan: false }, op(2026, 11, 15, 1)).samenvatting === 4);
    const verschoven = stilStap({ n: 2, tot: op(2026, 11, 15, 7).getTime() }, { aan: true, van: '22:00', tot: '08:00' }, op(2026, 11, 15, 1), 1);
    check('крок: кінець перенесли на 08:00 посеред тиші → без передчасного підсумку, лічильник 3 до 08:00', verschoven.samenvatting === null && verschoven.teller?.n === 3 && verschoven.teller.tot === op(2026, 11, 15, 8).getTime());
    check('leesTeller: пошкоджене (рядок, n=0, n=1.5, tot<0, масив) → null; правильне → як є',
      [leesTeller('x'), leesTeller({ n: 0, tot: 5 }), leesTeller({ n: 1.5, tot: 5 }), leesTeller({ n: 1, tot: -1 }), leesTeller([1])].every((x) => x === null) && JSON.stringify(leesTeller({ n: 2, tot: 9 })) === '{"n":2,"tot":9}');
    check('крок: пошкоджений лічильник у сховищі не дає вигаданого підсумку', stilStap({ n: 'veel', tot: 1 } as never, nacht, op(2026, 11, 15, 12)).samenvatting === null);
    const uk = samenvattingTekst(5, 'uk'), nl = samenvattingTekst(5, 'nl');
    check('текст: «Поки була тиша: 5» / «Tijdens de stille uren: 5», пояснення каже, де сповіщення й де налаштування',
      uk.text === 'Поки була тиша: 5' && nl.text === 'Tijdens de stille uren: 5' && kyr.test(uk.explain) && !kyr.test(nl.explain) && uk.explain.includes('панелі') && nl.explain.includes('meldingenpaneel'));
    check('старий запис без «stil» → тихі години вимкнено (нічого не мовчить)', !stilNu(normaliseerMeldingen({}).stil, op(2026, 11, 14, 23)) && !stilNu(normaliseerMeldingen({ stil: { van: '22:00' } }).stil, op(2026, 11, 14, 23)));
  }

  // ================================================================ (1б) код: центр, рамка, налаштування
  {
    const centrum = lees('src/CanoniekMeldingencentrum.tsx'), oml = lees('src/CanoniekOmlijsting.tsx'), zb = lees('src/ZijbalkInstellingen.tsx');
    check('центр: отримує stil від рамки (mv.stil)', oml.includes('stil={mv.stil}') && centrum.includes('stil?: StilVoorkeur;'));
    check('рамка: стан тиші перевіряється таймером (не лише при перемальовуванні)', oml.includes('setStil(stilNuMenu())') && !oml.includes('const nu=new Date(),stil=isStil('));
    const blok = zb.slice(zb.indexOf("data-stille-uren"), zb.indexOf('</div>', zb.indexOf("data-stille-uren")));
    check('налаштування: «Тихі години» не вимикаються разом із мітками і пояснюють наслідки (безпека спливає, одне зведення)',
      blok.length > 0 && !blok.includes('!m.aan') && blok.includes('Попередження безпеки все одно') && blok.includes('Beveiligingswaarschuwingen verschijnen wel') && blok.includes('Вимкнено:'));
  }

  // ================================================================ (2) збереження через справжні маршрути
  const T = randomBytes(4).toString('hex');
  const eigenaar = `stil-eig-${T}@example.test`;
  const vorigeEigenaar = process.env.OWNER_EMAIL;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  try {
    const b = G.browser();
    await b.aanmelden(`sub-stil-${T}`, eigenaar, { service: 'identity', intent: 'login' });
    const leeg = G.browser();
    const r0 = await leeg.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar/save', leeg.ctxBody('identity', { sidebar: { meldingen: { stil: { aan: true, van: '23:15', tot: '06:45' } } } }));
    check('маршрут: без сеансу зберегти тихі години не можна (401/403)', r0.status === 401 || r0.status === 403, String(r0.status));
    const eigId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id as string;
    // Старий запис (до цього кроку): sidebar без meldingen.stil — читається, тиші немає.
    const nu = Date.now();
    await pool.query("insert into app.records (id, tbl, data) values ($1, 'owner_ui_preferences_v1', $2::jsonb)", [`oud-${T}`, JSON.stringify({ userId: eigId, menu: [], sidebar: { modus: 'open' }, createdAt: nu, updatedAt: nu })]);
    const oud = await b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar', b.ctxBody('identity'));
    check('маршрут: старий запис без «stil» читається (200), тихі години вимкнено', oud.status === 200 && oud.data.sidebar?.meldingen?.stil?.aan === false && !stilNu(oud.data.sidebar.meldingen.stil, op(2026, 11, 14, 23)), `${oud.status} ${oud.body.slice(0, 200)}`);
    const opgeslagen = await b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar/save', b.ctxBody('identity', { sidebar: { ...oud.data.sidebar, meldingen: { ...oud.data.sidebar.meldingen, stil: { aan: true, van: '23:15', tot: '06:45' } } } }));
    check('маршрут: власник зберігає тихі години 23:15–06:45 (200)', opgeslagen.status === 200 && opgeslagen.data.sidebar?.meldingen?.stil?.van === '23:15', `${opgeslagen.status} ${opgeslagen.body.slice(0, 200)}`);
    const weer = await b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar', b.ctxBody('identity'));
    const st = weer.data.sidebar?.meldingen?.stil as StilVoorkeur;
    check('маршрут: прочитане назад діє — 23:30 тиша до 06:45, 07:00 — ні',
      st?.aan === true && stilNu(st, op(2026, 11, 14, 23, 30)) && stilTot(st, op(2026, 11, 14, 23, 30)) === op(2026, 11, 15, 6, 45).getTime() && !stilNu(st, op(2026, 11, 15, 7)), JSON.stringify(st));
    const tweede = await b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar/save', b.ctxBody('identity', { sidebar: weer.data.sidebar }));
    const rijen = (await pool.query("select count(*)::int as n from app.records where tbl='owner_ui_preferences_v1' and data->>'userId'=$1", [eigId])).rows[0].n;
    check('маршрут: повторне збереження — той самий стан, один рядок', tweede.status === 200 && JSON.stringify(tweede.data.sidebar?.meldingen?.stil) === JSON.stringify(st) && rijen === 1, String(rijen));
    const slecht = await b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar/save', b.ctxBody('identity', { sidebar: { ...weer.data.sidebar, meldingen: { ...weer.data.sidebar.meldingen, stil: { aan: true, van: '99:99', tot: 'x' } } } }));
    check('маршрут: зіпсований час нормалізується до стандартного (22:00–07:00), а не ламає тишу', slecht.status === 200 && slecht.data.sidebar?.meldingen?.stil?.van === '22:00' && slecht.data.sidebar?.meldingen?.stil?.tot === '07:00', slecht.body.slice(0, 200));

    // ---------------------------------------------------------------- (2б) давня вада: тимчасовий пароль не дає входу
    const vlag = (await pool.query("select aan, standaard, percentage, gebruikers from app.feature_flags where sleutel='aanmelden-wachtwoord'")).rows[0];
    check('пароль: прапорець «aanmelden-wachtwoord» є в базі (міграція 0275)', !!vlag);
    try {
      await pool.query('UPDATE app.feature_flags SET aan = true, standaard = false, percentage = 0, gebruikers = $1 WHERE sleutel = $2', [[eigId], 'aanmelden-wachtwoord']);
      const ww = `Tijdelijk-${T}-wachtwoord`;
      const salt = randomBytes(16);
      const rec = { userId: eigId, algorithm: 'scrypt', n: 16384, r: 8, p: 1, salt: salt.toString('base64url'), hash: scryptSync(ww, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url'), mustChange: true, createdAt: Date.now(), updatedAt: Date.now() };
      await pool.query("insert into app.records (tbl,id,data) values ('identity_passwords_v1',$1,$2)", [`stil-ww-${T}`, rec]);
      const IP = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
      const poging = async () => {
        const w = G.browser();
        const ctx = { service: 'identity', tabContext: w.tab, sourceOrigin: 'https://id.tarasevych.com', returnTo: 'https://id.tarasevych.com/', locale: 'uk', remember: false };
        const st = await w.verzoek('id.tarasevych.com', '/api/aanmelden/wachtwoord/start', ctx, { ip: IP });
        const v = await w.verzoek('id.tarasevych.com', '/api/aanmelden/wachtwoord/voltooien', { pogingId: st.data.pogingId, email: eigenaar, password: ww }, { ip: IP });
        const ik = (await w.verzoek('id.tarasevych.com', '/api/owner/session/bootstrap', { service: 'identity', tabContext: w.tab })).data?.user?.id;
        return { st, v, ik };
      };
      const tijdelijk = await poging();
      const auditRij = (await pool.query("select count(*)::int n from app.audit where owner_id = $1 and action = 'aanmelden.password' and result = 'denied' and details->>'reden' = 'ACCESS_PASSWORD_MUST_CHANGE'", [eigId]).catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n;
      check('пароль: тимчасовий (mustChange) → 403 ACCESS_PASSWORD_MUST_CHANGE, сеансу немає',
        tijdelijk.st.status === 200 && tijdelijk.v.status === 403 && tijdelijk.v.data.error === 'ACCESS_PASSWORD_MUST_CHANGE' && tijdelijk.v.data.sessionCreated === false && !tijdelijk.ik, `${tijdelijk.st.status} ${tijdelijk.v.status} ${tijdelijk.v.body.slice(0, 160)}`);
      check('пароль: відмову записано в журнал (aanmelden.password denied, причина ACCESS_PASSWORD_MUST_CHANGE)', auditRij >= 1, String(auditRij));
      const [tekst = '', tekstNl = ''] = aanmeldWeigering({ response: { data: { error: 'ACCESS_PASSWORD_MUST_CHANGE' } } }) || [];
      check('пароль: людина бачить, що робити (увійти іншим способом і задати власний пароль)', /тимчасовий пароль/i.test(tekst) && tekst.includes('Способах входу') && tekstNl.includes('Aanmeldmethoden'), tekst);
      await pool.query("update app.records set data = data || '{\"mustChange\":false}'::jsonb where tbl='identity_passwords_v1' and id=$1", [`stil-ww-${T}`]);
      const eigen = await poging();
      check('пароль: власний (mustChange=false) пароль — вхід, як і раніше', eigen.v.status === 200 && eigen.ik === eigId, `${eigen.v.status} ${eigen.v.body.slice(0, 160)}`);
    } finally {
      if (vlag) await pool.query('UPDATE app.feature_flags SET aan = $1, standaard = $2, percentage = $3, gebruikers = $4 WHERE sleutel = $5', [vlag.aan, vlag.standaard, vlag.percentage, vlag.gebruikers, 'aanmelden-wachtwoord']);
      await pool.query("delete from app.records where id = $1", [`stil-ww-${T}`]).catch(() => undefined);
      await pool.query("delete from app.login_lockouts where subject like $1", [`wachtwoord:${eigenaar}:%`]).catch(() => undefined);
    }
  } catch (e) {
    check('onverwachte fout (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [[eigenaar]])).rows.map((r: { id: string }) => r.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    await pool.query('delete from app.records where id = $1', [`oud-${T}`]).catch(() => undefined);
    if (vorigeEigenaar === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeEigenaar;
  }
  await closePool().catch(() => undefined);

  // ================================================================ (3) справжній центр сповіщень у Chrome з керованим годинником
  await inChrome(check);
  return einde();
}

type Check = (naam: string, ok: boolean, info?: string) => void;

const PROEF = `
import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CanonicalNotificationCenter from './src/CanoniekMeldingencentrum';
import { emitCanonicalNotice } from './src/canoniek-meldingen';
const w = window as any;
w.geluid = 0; w.gezien = [];
// Звук: кожен виклик «дзвіночка» створює AudioContext — рахуємо їх (без справжнього звуку).
w.AudioContext = class { constructor() { w.geluid++; throw new Error('nep-geluid'); } };
// Кожне нове спливне вікно (або нова назва в тому самому вікні) — у журнал.
new MutationObserver(() => {
  document.querySelectorAll('.canonical-notification-toast-titel').forEach((el: any) => { if (el.__tekst !== el.textContent) { el.__tekst = el.textContent; w.gezien.push(el.textContent); } });
}).observe(document.body, { childList: true, subtree: true, characterData: true });
function Proef() {
  const [server, setServer] = useState<any[]>([]);
  const [stil, setStil] = useState(w.stil || { aan: true, van: '22:00', tot: '07:00' });
  w.setServer = setServer; w.setStil = setStil; w.huidigStil = stil;
  return h(CanonicalNotificationCenter, { lang: 'uk', scope: 'proef-stil', serverItems: server, stil });
}
w.emit = emitCanonicalNotice;
w.start = () => createRoot(document.getElementById('k')!).render(h(Proef));
`;

async function inChrome(check: Check) {
  const PW = [process.env.PLAYWRIGHT_CORE, join(process.cwd(), 'node_modules', 'playwright-core'), '/opt/node-tools/node_modules/playwright-core']
    .filter((p): p is string => Boolean(p)).map((p) => join(p, 'index.mjs')).find((p) => existsSync(p)) || '';
  const CHROME = process.env.CHROME_PAD || '/usr/bin/google-chrome';
  if (!PW || !existsSync(CHROME)) { check('Chrome і playwright-core доступні (CHROME_PAD, PLAYWRIGHT_CORE)', false, `${PW} ${CHROME}`); return; }
  const map = mkdtempSync(join(tmpdir(), 'i015-stil-'));
  try {
    const { build } = await import('esbuild');
    const uit = resolve(map, 'proef.js');
    await build({ stdin: { contents: PROEF, resolveDir: resolve('.'), loader: 'tsx', sourcefile: 'i015-stil-proef.tsx' }, outfile: uit, bundle: true, logLevel: 'error', platform: 'browser', format: 'iife', target: 'es2022', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' } });
    const { chromium } = await import(pathToFileURL(PW).href) as { chromium: { launch: (o: unknown) => Promise<any> } };
    const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
    try {
      const context = await browser.newContext({ timezoneId: 'Europe/Amsterdam', locale: 'uk-UA' });
      const page = await context.newPage();
      const fouten: string[] = [];
      page.on('pageerror', (e: Error) => fouten.push(String(e?.message || e)));
      await page.route('**/*', async (r: any) => {
        const u = String(r.request().url());
        if (u === 'https://id.proef.invalid/') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="uk"><head><meta charset="utf-8"></head><body><div id="k"></div><script src="/canonical-service.js"></script><script src="/proef.js"></script></body></html>' });
        if (u === 'https://id.proef.invalid/canonical-service.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync('public/canonical-service.js', 'utf8') });
        if (u === 'https://id.proef.invalid/proef.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(uit, 'utf8') });
        return r.abort(); // niets gaat naar buiten
      });
      // 23:00 за Амстердамом, тихі години 22:00–07:00.
      await page.clock.install({ time: new Date('2026-11-14T23:00:00+01:00') });
      await page.goto('https://id.proef.invalid/');
      const geladen = await page.waitForFunction(() => typeof (window as any).start === 'function', null, { timeout: 15000 }).then(() => true, () => false);
      if (!geladen) { check('Chrome: proefpagina geladen', false, fouten.join(' | ')); return; }
      await page.evaluate(() => (window as any).start());
      await page.clock.runFor(500); // de bel zelf staat in een zone (<Plek>) die deze proefpagina niet heeft; de pop-up wel
      await page.mouse.click(5, 5); // активація користувача — інакше «дзвіночок» мовчить завжди, і тест нічого б не довів
      const stap = async (ms: number) => { await page.clock.runFor(ms); };
      /** Чекає, доки нове значення тихих годин справді відмальоване (оновлення React — окреме завдання). */
      const stilGezet = async (aan: boolean) => { for (let i = 0; i < 100; i++) { if (await page.evaluate((a: boolean) => (window as any).huidigStil?.aan === a, aan)) return true; await stap(20); } return false; };

      // Контроль: поза тишею (тихі години вимкнено) звичайне сповіщення спливає й звучить — інакше перевірка тиші була б порожньою.
      await page.evaluate(() => (window as any).setStil({ aan: false, van: '22:00', tot: '07:00' }));
      check('Chrome: тихі години вимкнено в пропсах', await stilGezet(false));
      await page.evaluate(() => (window as any).emit({ text: 'Контроль: новий лист від бухгалтерії', kind: 'info', source: 'mail', type: 'post' }));
      await stap(300);
      const controle = await page.evaluate(() => ({ gezien: [...(window as any).gezien], geluid: (window as any).geluid }));
      check('Chrome: контроль поза тишею — спливає й звучить', controle.gezien.includes('Контроль: новий лист від бухгалтерії') && controle.geluid >= 1, JSON.stringify(controle));
      await stap(15_000); // спливне вікно зникає

      // Тиша увімкнена: дві локальні події і одна серверна — без спливання й без звуку.
      await page.evaluate(() => { const w = window as any; w.gezien = []; w.geluid = 0; w.setStil({ aan: true, van: '22:00', tot: '07:00' }); });
      check('Chrome: тихі години 22:00–07:00 у пропсах', await stilGezet(true));
      await page.evaluate(() => {
        const w = window as any;
        w.emit({ text: 'Новий лист від сусіда', kind: 'info', source: 'mail', type: 'post' });
        w.emit({ text: 'Файл у хмарі синхронізовано', kind: 'success', source: 'cloud', type: 'cloud' });
        w.setServer((v: any[]) => [...v, { id: 'nieuw-1', kind: 'workspace_share', title: 'Вам надали доступ до простору', message: '', createdAt: Date.now(), read: false }]);
      });
      await stap(1000);
      const inStilte = await page.evaluate(() => ({ gezien: [...(window as any).gezien], geluid: (window as any).geluid, teller: localStorage.getItem('tsv-stille-uren-v1:proef-stil') }));
      check('Chrome: у тишу локальні й серверні сповіщення не спливають і не звучать', inStilte.gezien.length === 0 && inStilte.geluid === 0, JSON.stringify(inStilte));
      check('Chrome: у тишу пораховано 3 події до кінця тиші (07:00)', (() => { try { const t = JSON.parse(inStilte.teller || ''); return t.n === 3 && t.tot === new Date('2026-11-15T07:00:00+01:00').getTime(); } catch { return false; } })(), String(inStilte.teller));

      // Безпека в тишу все одно спливає (попередження безпеки не відкладаються).
      await page.evaluate(() => (window as any).emit({ text: 'Вхід з нового пристрою', kind: 'warning', source: 'security', type: 'beveiliging' }));
      await stap(300);
      const veilig = await page.evaluate(() => [...(window as any).gezien]);
      check('Chrome: попередження безпеки в тишу спливає', veilig.includes('Вхід з нового пристрою'), JSON.stringify(veilig));
      await stap(20_000);

      // Кінець тиші: рівно один підсумок.
      await page.evaluate(() => { (window as any).gezien = []; });
      await page.clock.fastForward('08:00:00'); // ≈23:00:40 + 8 год → ≈07:00:40
      await stap(31_000);
      const na = await page.evaluate(() => ({ gezien: [...(window as any).gezien], teller: localStorage.getItem('tsv-stille-uren-v1:proef-stil'), uur: new Date().getHours() }));
      check('Chrome: після кінця тиші — один підсумок «Поки була тиша: 3», лічильник стерто',
        na.gezien.filter((x: string) => x === 'Поки була тиша: 3').length === 1 && na.teller === null && na.uur >= 7, JSON.stringify(na));
      await stap(5 * 60_000);
      const later = await page.evaluate(() => [...(window as any).gezien]);
      check('Chrome: за 5 хвилин другого підсумку немає', later.filter((x: string) => x.startsWith('Поки була тиша')).length === 1, JSON.stringify(later));
      const inPaneel = await page.evaluate(() => { try { return Object.keys(localStorage).some((k) => (localStorage.getItem(k) || '').includes('Поки була тиша: 3')); } catch { return false; } });
      check('Chrome: підсумок лишається в переліку сповіщень (видно після закриття спливного вікна)', inPaneel);

      // Перервана дія: вкладку закрили в тишу, відкрили після кінця → один підсумок; ще одне перезавантаження — жодного.
      const kinderen = await page.evaluate(() => { localStorage.setItem('tsv-stille-uren-v1:proef-stil', JSON.stringify({ n: 4, tot: Date.now() - 60_000 })); return true; });
      await page.reload();
      await page.evaluate(() => (window as any).start());
      await stap(500);
      const herladen1 = await page.evaluate(() => ({ gezien: [...(window as any).gezien], teller: localStorage.getItem('tsv-stille-uren-v1:proef-stil'), hist: localStorage.getItem('tsv:canonical-notification-history-v2:proef-stil') }));
      await page.reload();
      await page.evaluate(() => (window as any).start());
      await stap(31_000);
      const herladen2 = await page.evaluate(() => [...(window as any).gezien]);
      check('Chrome: після перезавантаження — один підсумок за пропущену тишу (4), друге перезавантаження — нічого',
        kinderen && herladen1.gezien.includes('Поки була тиша: 4') && herladen1.teller === null && !herladen2.some((x: string) => x.startsWith('Поки була тиша')), JSON.stringify({ herladen1, herladen2 }));
      check('Chrome: без помилок сторінки', fouten.length === 0, fouten.join(' | '));
      await context.close();
    } finally {
      await browser.close();
    }
  } catch (e) {
    check('Chrome: onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}
