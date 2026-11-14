// IDENTITEIT-015 (крок apparaten-uitvoer, 14.11.2026): (1) «Попереджати про новий пристрій» — вибір «Завжди / Вимкнено»,
// перелік відомих пристроїв, «Це був я», «Забути пристрій»; backend/nieuw-apparaat.ts поважає вибір, запис у журналі безпеки
// лишається завжди; (2) вивантаження у форматі ZIP із CSV на кожну таблицю (без секретів), стан «готую → готово → файл».
// Справжні маршрути backend/index.ts проти одноразової бази (як identiteit-014-uitvoer). Лише вигадані дані; нічого не йде назовні.
// Keuze voor de waarschuwing bij een nieuw apparaat + bekende apparaten, en de export als ZIP met CSV per tabel.
// Запуск: . <testenv> && node scripts/eenheidstests.mjs identiteit-015-apparaten-uitvoer.test.ts
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { strFromU8, unzipSync } from 'fflate';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';
import { actieVoorPad } from '../../shared/stap-op-acties';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const HOST = 'id.tarasevych.com';
const lees = (p: string) => readFileSync(p, 'utf8');
const kyr = /[А-Яа-яІіЇїЄєҐґ]/;

/** Minimale nagebootste browser (overgenomen uit identiteit-014-uitvoer, met ?zoek): genoeg om de panelen in node te renderen. */
function nepBrowser(zoek = ''): () => void {
  const host = `https://id.tarasevych.com/sessions${zoek}`;
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'navigator'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(host);
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = {
    hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } },
  };
  Object.defineProperty(g, 'document', { value: doc, configurable: true, writable: true });
  Object.defineProperty(g, 'location', { value: { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined }, configurable: true, writable: true });
  Object.defineProperty(g, 'sessionStorage', { value: opslag(), configurable: true, writable: true });
  Object.defineProperty(g, 'localStorage', { value: opslag(), configurable: true, writable: true });
  Object.defineProperty(g, 'history', { value: { pushState: () => undefined, replaceState: () => undefined, state: null }, configurable: true, writable: true });
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0), matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-apparaten-uitvoer');

  // ================================================================ step-up: шляхи й «ніколи не запам'ятовувати»
  {
    const { NOOIT_ONTHOUDEN, onthoudMagVoorPad } = await import('../../backend/stap-op');
    const { stapOpBeschrijving } = await import('../../shared/stap-op-beschrijving') as unknown as { stapOpBeschrijving?: (p: string) => { bekend: boolean; uk: string } };
    const m = '/api/owner/identity/apparaten/melding', v = '/api/owner/identity/apparaten/vergeten';
    check('step-up: вимкнення → «apparaat-melding-uit», забути → «apparaat-vergeten»; обидва ніколи не запам\'ятовуються',
      actieVoorPad(m) === 'apparaat-melding-uit' && actieVoorPad(v) === 'apparaat-vergeten' && NOOIT_ONTHOUDEN.includes('apparaat-melding-uit') && NOOIT_ONTHOUDEN.includes('apparaat-vergeten') && !onthoudMagVoorPad(m) && !onthoudMagVoorPad(v));
    const b = lees('shared/stap-op-beschrijving.ts'), t = lees('src/ToegangContext.tsx');
    check('вікно «Підтвердіть доступ» знає обидві дії (тексти uk/nl)', b.includes("'apparaat-melding-uit': ['Вимкнути попередження про новий пристрій'") && b.includes("'apparaat-vergeten': ['Забути відомий пристрій'") && t.includes("'apparaat-melding-uit':[") && t.includes("'apparaat-vergeten':["));
    if (stapOpBeschrijving) check('опис дії для вікна — відомий', stapOpBeschrijving(m).bekend === true);
    const k = lees('backend/kijker-alleen-lezen.ts');
    check('режим «лише перегляд»: власні маршрути пристроїв дозволені як «власна безпека»', ['melding', 'vergeten', 'bevestigen'].every((x) => k.includes(`'owner/identity/apparaten/${x}'`)));
  }

  // ================================================================ CSV (чисте перетворення)
  const { naarCsv, persoonsgegevensZip, zonderGeheimen } = await import('../../backend/privacy');
  {
    const csv = naarCsv([{ id: 'a', gegevens: { naam: 'Проба, "лапки"', formule: '=HYPERLINK("http://x")', diep: { a: [1, 2] } } }, { id: 'b', extra: 5 }]);
    const regels = csv.replace(/^﻿/, '').split('\r\n');
    check('CSV: BOM, CRLF, кома/лапки екрановано, вкладене поле як стовпець «батько.поле»',
      csv.startsWith('﻿') && regels[0] === 'id,gegevens.naam,gegevens.formule,gegevens.diep,extra' && regels[1].includes('"Проба, ""лапки"""'), regels.slice(0, 3).join(' | '));
    check('CSV: формула в клітинці знешкоджена апострофом; глибше вкладене — JSON; відсутній стовпець — порожньо',
      regels[1].includes(`"'=HYPERLINK(""http://x"")"`) && regels[1].includes('"{""a"":[1,2]}"') && regels[2] === 'b,,,,5', regels[1]);
  }

  // ================================================================ рендер: Gegevensuitvoer з вибором формату
  let weg = nepBrowser();
  const { default: Gegevensuitvoer, gegevensUitvoeren, uitvoerAanvraag, uitvoerBestandsnaam, UITVOER_ZIP_FORMAAT } = await import('../../src/instellingen/Gegevensuitvoer');
  {
    const uk = renderToStaticMarkup(createElement(Gegevensuitvoer, { lang: 'uk' }));
    const nl = renderToStaticMarkup(createElement(Gegevensuitvoer, { lang: 'nl' }));
    const compact = renderToStaticMarkup(createElement(Gegevensuitvoer, { lang: 'uk', compact: true }));
    check('«Ваші дані»: вибір формату «Структурований (JSON)» (типово) / «Табличний (ZIP із CSV)» з поясненням',
      uk.includes('data-gegevensuitvoer-formaat="json"') && uk.includes('Структурований (JSON)') && uk.includes('Табличний (ZIP із CSV)') && /checked="" value="json"/.test(uk) && uk.includes('LEESMIJ.txt'), (uk.match(/<input[^>]*radio[^>]*>/g) || []).join(' '));
    check('нідерландська без кирилиці; компактна кнопка — без вибору (JSON, як раніше)', !kyr.test(nl) && nl.includes('Tabelvorm (ZIP met CSV)') && !compact.includes('gegevensuitvoer-formaat') && compact.includes('Вивантажити мої дані (JSON)'));
    check('тіло запиту: formaat:"zip" лише для ZIP; назва файлу .zip', JSON.stringify(uitvoerAanvraag('t', 'o', 'zip')) === JSON.stringify({ service: 'identity', tabContext: 't', sourceOrigin: 'o', formaat: 'zip' }) && !('formaat' in uitvoerAanvraag('t', 'o')) && uitvoerBestandsnaam(new Date('2026-11-14T08:00:00Z'), 'zip') === 'mijn-ruimte-export-2026-11-14.zip');
    const nep = await gegevensUitvoeren({ post: async () => ({ data: { formaat: UITVOER_ZIP_FORMAAT, data: Buffer.from('<html>').toString('base64') } }), bewaar: () => { throw new Error('mag niet'); }, tabContext: 't', origin: 'o', formaat: 'zip' });
    check('ZIP-відповідь без підпису «PK» → нічого не збережено, чесний текст', !nep.ok && /не файлом вивантаження/.test(nep.tekst[0]));
  }
  weg();

  // ================================================================ рендер: BekendeApparaten
  weg = nepBrowser('?apparaat=00000000-0000-4000-8000-000000000002');
  const { default: BekendeApparaten, apparatenWeigering, VLAG_VOORWAARDE } = await import('../../src/BekendeApparaten');
  {
    const apparaten = [
      { id: '00000000-0000-4000-8000-000000000001', apparaat: 'Chrome/Windows', eerstGezien: '2026-11-01T10:00:00Z', laatstGezien: '2026-11-14T09:00:00Z', bevestigdOp: '2026-11-01T10:00:00Z', ditApparaat: true },
      { id: '00000000-0000-4000-8000-000000000002', apparaat: 'Safari/iOS', eerstGezien: '2026-11-13T10:00:00Z', laatstGezien: '2026-11-13T10:00:00Z', bevestigdOp: null, ditApparaat: false },
    ];
    const uk = renderToStaticMarkup(createElement(BekendeApparaten, { lang: 'uk', beginStand: { keuze: 'altijd', vlag: false, meldingActief: false, apparaten } }));
    const nl = renderToStaticMarkup(createElement(BekendeApparaten, { lang: 'nl', beginStand: { keuze: 'uit', vlag: true, meldingActief: false, apparaten: [] } }));
    check('вибір «Завжди / Вимкнено»: «Завжди» типово, «Вимкнено» з «!» і поясненням ризику; ШІ не натисне',
      /checked="" value="altijd"/.test(uk) && uk.includes('nieuw-apparaat-uitroep') && uk.includes('Ризик: якщо хтось увійде') && uk.includes('журнал безпеки') && (uk.match(/data-ai-geen-actie="1"/g) || []).length >= 4, (uk.match(/<input[^>]*radio[^>]*>/g) || []).join(' '));
    check('без прапорця власника — точна передумова (де саме вмикає власник)', uk.includes('data-nieuw-apparaat-voorwaarde="vlag"') && VLAG_VOORWAARDE[0].includes('«Перемикачі функцій»') && VLAG_VOORWAARDE[0].includes('meldingen-uitleg-v3') && uk.includes('Перемикачі функцій'));
    check('перелік: «Цей пристрій», «Підтверджено вами», «Це був я» лише для непідтвердженого, «Забути пристрій» для кожного; пристрій із посилання сповіщення підсвічено',
      uk.includes('Цей пристрій') && uk.includes('Підтверджено вами') && (uk.match(/data-apparaat-bevestigen=/g) || []).length === 1 && (uk.match(/data-apparaat-vergeten=/g) || []).length === 2 && /data-bekend-apparaat="00000000-0000-4000-8000-000000000002"[^>]*data-uit-melding="1"/.test(uk));
    check('нідерландська без кирилиці; стан «Вимкнено» показано чесно, без передумови прапорця', !kyr.test(nl) && /checked="" value="uit"/.test(nl) && nl.includes('data-nieuw-apparaat-voorwaarde="uit"') && !nl.includes('data-nieuw-apparaat-voorwaarde="vlag"'));
    const lim = apparatenWeigering({ message: 'RATE_LIMITED', response: { data: { error: 'RATE_LIMITED', retryAfter: 120 } } });
    check('ліміт — власний текст (не про запрошення), з часом', lim[0].includes('~2 хв') && !/запрошен/.test(lim[0]));
    const s = lees('src/SessiesOverzicht.tsx');
    check('«Сесії та пристрої»: блок змонтовано після переліку сесій', s.indexOf('<BekendeApparaten lang={p.lang}/>') > s.indexOf('<SecuritySessionsPanel'));
  }
  weg();

  // ================================================================ справжні маршрути
  const pool = getPool('systeem');
  const { handler } = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
  const { googleStapOpVastleggen } = await import('../../backend/stap-op');
  const { APPARAAT_COOKIE, apparaatCookieHash } = await import('../../backend/apparaat-cookie');
  const { naAanmelding } = await import('../../backend/nieuw-apparaat');
  const nieuw = async (status: string, extra: Record<string, unknown> = {}) => {
    const uid = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: `i015a-${randomBytes(4).toString('hex')}@eenheid.test`, role: 'member', status, name: 'Проба 015', ...extra }]);
    return uid;
  };
  const sessie = async (uid: string) => {
    const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
    const rec = { tokenHash: sha(token), userId: uid, service: 'identity', sourceOrigin: `https://${HOST}`, tabHash: sha('ecosystem'), grantId: '', createdAt: now, authenticatedAt: now, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.15', userAgent: 'eenheid' };
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, rec]);
    return { id, cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}` };
  };
  const roep = async (s: { cookie: string }, pad: string, lijf: Record<string, unknown> = {}, apparaat = '') => {
    const evt = { headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', cookie: s.cookie + (apparaat ? `; ${APPARAAT_COOKIE}=${apparaat}` : ''), 'user-agent': 'eenheid' }, body: JSON.stringify({ service: 'identity', tabContext: randomBytes(24).toString('hex'), sourceOrigin: `https://${HOST}`, ...lijf }), httpMethod: 'POST', path: pad, rawPath: pad, requestContext: { http: { method: 'POST', path: pad } } };
    const r = await handler(evt as never);
    let data: Record<string, any> = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ }
    return { status: r.statusCode, data };
  };
  const meldingen = async (uid: string, kind: string, titel: string) => (await pool.query(`SELECT 1 FROM app.records WHERE tbl='site_notifications' AND data->>'recipientUserId'=$1 AND data->>'kind'=$2 AND data->>'title' LIKE $3`, [uid, kind, `${titel}%`])).rowCount || 0;
  const audits = async (uid: string, actie: string, melding?: string) => (await pool.query(`SELECT 1 FROM app.audit WHERE owner_id=$1 AND action=$2 AND ($3::text IS NULL OR details->>'melding'=$3)`, [uid, actie, melding ?? null])).rowCount || 0;
  const cookieWaarde = () => randomBytes(32).toString('base64url');
  const aanmelden = (uid: string, waarde: string, vlag = true) => naAanmelding({ userId: uid, email: 'x@eenheid.test', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36', methode: 'google', apparaatCookie: apparaatCookieHash({ headers: { cookie: `${APPARAAT_COOKIE}=${waarde}` } }) }, { vlagAan: async () => vlag });
  const L = '/api/owner/identity/apparaten/lijst', M = '/api/owner/identity/apparaten/melding', V = '/api/owner/identity/apparaten/vergeten', B = '/api/owner/identity/apparaten/bevestigen';
  const NIEUW = 'Новий вхід на новому пристрої', UIT = 'Попередження про новий пристрій вимкнено', AAN = 'Попередження про новий пристрій увімкнено', VERGETEN = 'Пристрій забуто';

  try {
    const uid = await nieuw('approved');
    const s = await sessie(uid);
    const leeg = await roep(s, L);
    check('перелік: старий запис без поля → «Завжди»; прапорця немає → meldingActief=false; пристроїв ще немає', leeg.status === 200 && leeg.data.keuze === 'altijd' && leeg.data.vlag === false && leeg.data.meldingActief === false && leeg.data.apparaten.length === 0, JSON.stringify(leeg.data).slice(0, 200));

    const a1 = cookieWaarde(), a2 = cookieWaarde(), a3 = cookieWaarde();
    const r1 = await aanmelden(uid, a1), r2 = await aanmelden(uid, a2);
    check('вхід: перший пристрій тихо як база, другий новий → сповіщення + запис у журналі безпеки', r1 === 'basis' && r2 === 'gemeld' && (await meldingen(uid, 'security_warning', NIEUW)) === 1 && (await audits(uid, 'owner.apparaat.nieuw', 'gemeld')) === 1, `${r1}/${r2}`);
    const lijst = await roep(s, L, {}, a1);
    check('перелік: два відомі пристрої, «цей пристрій» за cookie браузера, перший — підтверджений', lijst.data.apparaten.length === 2 && lijst.data.apparaten.filter((x: any) => x.ditApparaat).length === 1 && lijst.data.apparaten.find((x: any) => x.ditApparaat)?.bevestigdOp && lijst.data.apparaten.some((x: any) => !x.bevestigdOp));

    // ---- Вимкнути: step-up, аудит, сповіщення, ідемпотентність
    const zonder = await roep(s, M, { keuze: 'uit' });
    check('вимкнення без підтвердження доступу → 403 STEP_UP, вибір не змінено', zonder.status === 403 && /STEP_UP/.test(String(zonder.data.error)) && (await roep(s, L)).data.keuze === 'altijd');
    check('недійсний вибір → 400', (await roep(s, M, { keuze: 'soms' })).status === 400);
    await googleStapOpVastleggen(uid, [s.id], Date.now());
    const uit = await roep(s, M, { keuze: 'uit' });
    const veld = (await pool.query(`SELECT data->>'nieuwApparaatMelding' AS k, data->>'status' AS st FROM app.records WHERE tbl='users' AND id=$1`, [uid])).rows[0];
    check('після підтвердження: «Вимкнено» збережено в обліковому записі (на всіх пристроях), статус не зачеплено', uit.status === 200 && uit.data.keuze === 'uit' && uit.data.gewijzigd === true && veld.k === 'uit' && veld.st === 'approved', JSON.stringify(uit.data).slice(0, 160));
    check('вимкнення: сповіщення безпеки й аудит owner.apparaat.melding (altijd → uit)', (await meldingen(uid, 'security', UIT)) === 1 && (await pool.query(`SELECT 1 FROM app.audit WHERE owner_id=$1 AND action='owner.apparaat.melding' AND details->>'naar'='uit' AND details->>'van'='altijd'`, [uid])).rowCount === 1);
    const nogEens = await roep(s, M, { keuze: 'uit' });
    check('повторне натискання «Вимкнено» → ok, gewijzigd=false, без другого сповіщення й аудиту', nogEens.status === 200 && nogEens.data.gewijzigd === false && (await meldingen(uid, 'security', UIT)) === 1 && (await audits(uid, 'owner.apparaat.melding')) === 1);
    const r3 = await aanmelden(uid, a3);
    check('вхід із нового пристрою при «Вимкнено» → без сповіщення, але запис у журналі безпеки (uit-door-keuze)', r3 === 'stil' && (await meldingen(uid, 'security_warning', NIEUW)) === 1 && (await audits(uid, 'owner.apparaat.nieuw', 'uit-door-keuze')) === 1, r3);
    const r4 = await aanmelden(uid, cookieWaarde(), false);
    check('без прапорця власника новий пристрій теж лишає запис у журналі безпеки', r4 === 'uit' && (await audits(uid, 'owner.apparaat.nieuw', 'geen-vlag')) === 1, r4);

    // ---- Увімкнути: без step-up (посилює захист), аудит і сповіщення
    const s2 = await sessie(uid);
    const aan = await roep(s2, M, { keuze: 'altijd' });
    check('увімкнення «Завжди» з нового сеансу без підтвердження → 200, сповіщення й аудит', aan.status === 200 && aan.data.keuze === 'altijd' && (await meldingen(uid, 'security', AAN)) === 1 && (await audits(uid, 'owner.apparaat.melding')) === 2);

    // ---- «Це був я»
    const onbevestigd = (await roep(s, L)).data.apparaten.find((x: any) => !x.bevestigdOp);
    const bev = await roep(s, B, { id: onbevestigd.id });
    check('«Це був я» у «Сесіях»: позначка «Підтверджено вами», аудит один раз (повтор не дублює)', bev.status === 200 && bev.data.apparaten.find((x: any) => x.id === onbevestigd.id)?.bevestigdOp && (await roep(s, B, { id: onbevestigd.id })).status === 200 && (await audits(uid, 'owner.apparaat.bevestigd')) === 1);

    // ---- «Забути пристрій»
    const doel = (await roep(s, L, {}, a2)).data.apparaten.find((x: any) => x.ditApparaat);
    const vZonder = await roep(s2, V, { id: doel.id });
    check('«Забути» без підтвердження доступу → 403, пристрій лишився', vZonder.status === 403 && (await roep(s, L)).data.apparaten.some((x: any) => x.id === doel.id));
    const ander = await nieuw('approved');
    const sa = await sessie(ander); await googleStapOpVastleggen(ander, [sa.id], Date.now());
    const vreemd = await roep(sa, V, { id: doel.id });
    check('чужий пристрій забути не можна (права на сервері): vergeten=false, рядок на місці', vreemd.status === 200 && vreemd.data.vergeten === false && (await roep(s, L)).data.apparaten.some((x: any) => x.id === doel.id) && (await meldingen(ander, 'security', VERGETEN)) === 0);
    const vergeten = await roep(s, V, { id: doel.id });
    check('«Забути пристрій»: рядок видалено, аудит і сповіщення безпеки', vergeten.status === 200 && vergeten.data.vergeten === true && !vergeten.data.apparaten.some((x: any) => x.id === doel.id) && (await audits(uid, 'owner.apparaat.vergeten')) === 1 && (await meldingen(uid, 'security', VERGETEN)) === 1);
    const weer = await roep(s, V, { id: doel.id });
    check('повторне «Забути» (подвійний клік, друга вкладка) → ok, vergeten=false, без нового сповіщення', weer.status === 200 && weer.data.vergeten === false && (await meldingen(uid, 'security', VERGETEN)) === 1);
    const r5 = await aanmelden(uid, a2);
    check('наступний вхід із забутого пристрою знову дає попередження про новий пристрій', r5 === 'gemeld' && (await meldingen(uid, 'security_warning', NIEUW)) === 2, r5);

    const wacht = await nieuw('pending');
    const sw = await sessie(wacht);
    check('несхвалений обліковий запис → 403 ACCOUNT_NOT_APPROVED', (await roep(sw, L)).status === 403 && (await roep(sw, M, { keuze: 'uit' })).status === 403);

    // ================================================================ (2) вивантаження ZIP із CSV
    const ex = await nieuw('approved', { name: '=HYPERLINK("http://kwaad")', totpSecret: 'GEHEIM-TOTP-015', recoveryCodeHashes: ['HASH-015'] });
    const se = await sessie(ex);
    await pool.query('INSERT INTO app.records (tbl,id,data,owner_id) VALUES ($1,$2,$3,$4)', ['i015_notities', randomUUID(), { titel: 'Нотатка, з комою', apiKey: 'SLEUTEL-015', accessToken: 'TOKEN-015' }, ex]).catch(async () => {
      await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['i015_notities', randomUUID(), { userId: ex, titel: 'Нотатка, з комою', apiKey: 'SLEUTEL-015', accessToken: 'TOKEN-015' }]);
    });
    const P = '/api/owner/privacy/export';
    const zZonder = await roep(se, P, { formaat: 'zip' });
    check('ZIP без підтвердження доступу → 403 STEP_UP (як JSON), файлу немає', zZonder.status === 403 && !zZonder.data.data);
    await googleStapOpVastleggen(ex, [se.id], Date.now());
    const z = await roep(se, P, { formaat: 'zip' });
    let bestanden: Record<string, Uint8Array> = {};
    try { bestanden = unzipSync(new Uint8Array(Buffer.from(String(z.data.data || ''), 'base64'))); } catch { /* leeg */ }
    const namen = Object.keys(bestanden);
    const alles = namen.map((n) => strFromU8(bestanden[n])).join('\n');
    check('ZIP: формат v1-zip, назва .zip, mime application/zip, розпаковується', z.status === 200 && z.data.formaat === 'mijn-ruimte-export-v1-zip' && /^mijn-ruimte-export-\d{4}-\d{2}-\d{2}\.zip$/.test(z.data.bestandsnaam) && z.data.mime === 'application/zip' && namen.length >= 4, `${z.status} ${namen.join(',')}`);
    check('ZIP: по CSV на таблицю (users, i015_notities), bestanden.csv, beveiligingslog.csv, LEESMIJ.txt; перелік таблиць у відповіді',
      namen.includes('tabellen/users.csv') && namen.includes('tabellen/i015_notities.csv') && namen.includes('bestanden.csv') && namen.includes('beveiligingslog.csv') && namen.includes('LEESMIJ.txt') && z.data.tabellen.some((t: any) => t.bestand === 'tabellen/users.csv' && t.rijen === 1), namen.join(','));
    check('ZIP без секретів: немає totpSecret, хешів кодів відновлення, apiKey, токенів', !/GEHEIM-TOTP-015|HASH-015|SLEUTEL-015|TOKEN-015/.test(alles) && strFromU8(bestanden['tabellen/i015_notities.csv'] || new Uint8Array()).includes('"Нотатка, з комою"'));
    check('ZIP: формула в імені знешкоджена (апостроф)', strFromU8(bestanden['tabellen/users.csv'] || new Uint8Array()).includes(`"'=HYPERLINK(""http://kwaad"")"`));
    check('JSON-вивантаження без змін: ті самі дані, що й у ZIP (zonderGeheimen)', typeof zonderGeheimen === 'function' && typeof persoonsgegevensZip === 'function');
    check('ZIP: аудит із formaat=zip і сповіщення безпеки', (await pool.query(`SELECT 1 FROM app.audit WHERE owner_id=$1 AND action='owner.privacy.export' AND details->>'formaat'='zip'`, [ex])).rowCount === 1 && (await meldingen(ex, 'security', 'Ваші дані вивантажено')) === 1);

    // клієнт: справжня відповідь сервера → .zip збережено, стан «готово» з кількістю таблиць
    weg = nepBrowser();
    const bewaard: Array<{ naam: string; blob: Blob }> = [];
    const klant = await gegevensUitvoeren({ post: async (u, b) => { const r = await roep(se, u, b as Record<string, unknown>); if (r.status !== 200) throw Object.assign(new Error(r.data.error), { response: { data: r.data } }); return { data: r.data }; }, bewaar: (naam, blob) => bewaard.push({ naam, blob }), tabContext: 't', origin: `https://${HOST}`, formaat: 'zip', nu: new Date('2026-11-14T08:00:00Z') });
    weg();
    const zipBytes = bewaard[0] ? new Uint8Array(await bewaard[0].blob.arrayBuffer()) : new Uint8Array();
    check('клієнт: файл mijn-ruimte-export-2026-11-14.zip (application/zip) збережено, той самий архів; blob лишається для «Зберегти ще раз»',
      klant.ok === true && bewaard.length === 1 && bewaard[0].naam === 'mijn-ruimte-export-2026-11-14.zip' && bewaard[0].blob.type === 'application/zip' && !!unzipSync(zipBytes)['LEESMIJ.txt'] && klant.ok && !!klant.blob && (klant.tabellen || 0) >= 3, JSON.stringify({ ...klant, blob: undefined }));
    // ліміт спільний: 2 ZIP уже, ще 3 JSON → 5; шосте (ZIP) → 429
    const st: number[] = [];
    for (let i = 0; i < 3; i++) st.push((await roep(se, P)).status);
    const zesde = await roep(se, P, { formaat: 'zip' });
    check('ліміт 5/год спільний для JSON і ZIP: шосте → 429 з retryAfter', st.every((x) => x === 200) && zesde.status === 429 && zesde.data.retryAfter > 0, `${st.join(',')} → ${zesde.status}`);
  } finally {
    await closePool().catch(() => undefined);
  }
  return einde();
}
