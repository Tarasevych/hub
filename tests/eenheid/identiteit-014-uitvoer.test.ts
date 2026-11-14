// IDENTITEIT-014 (фаза 3, крок «uitvoer», 14.11.2026): «Ваші дані» і «Типи сповіщень».
// (а) Gegevensuitvoer: тіло запиту (identity-сеанс вкладки), збереження JSON-файлу, тексти помилок, попередження про журнал
// безпеки; змонтовано в «Акаунті» (id gegevensuitvoer) і кнопкою в блоці видалення; (б) сервер: ліміт рахується ПІСЛЯ step-up,
// 429 віддає retryAfter, кожне вивантаження — аудит і сповіщення безпеки; uitvoerWeigering; (в) окремий блок menu-meldingtypen
// з MeldingVoorkeurenPaneel, легенда міток меню перейменована. Справжні маршрути backend/index.ts проти одноразової бази.
// Export van gegevens (client + route) en «Soorten meldingen» in het menu. Alleen verzonnen gegevens; niets gaat naar buiten.
// Запуск: . <testenv> && node scripts/eenheidstests.mjs identiteit-014-uitvoer.test.ts
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';
import { deelWeigering, foutNaarTekst, uitvoerWeigering, UITVOER_PER_UUR } from '../../src/weigeringen';
import { MELDING_SOORTEN } from '../../shared/melding-soorten';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const HOST = 'id.tarasevych.com';
const lees = (p: string) => readFileSync(p, 'utf8');
const kyr = /[А-Яа-яІіЇїЄєҐґ]/;

/** Minimale nagebootste browser (zoals meldingen-integ-20261103): genoeg om de panelen in node te renderen. */
function nepBrowser(host = 'https://id.tarasevych.com/'): () => void {
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
  const { check, einde } = checker('identiteit-014-uitvoer');
  const browserWeg = nepBrowser();
  const { default: Gegevensuitvoer, UITVOER_ROUTE, gegevensUitvoeren, uitvoerAanvraag, uitvoerBestandsnaam } = await import('../../src/instellingen/Gegevensuitvoer');

  // ================================================================ (б) uitvoerWeigering
  {
    const limiet = uitvoerWeigering({ message: 'RATE_LIMITED', retryAfter: 170, response: { data: { error: 'RATE_LIMITED', retryAfter: 170 } } });
    check('ліміт: власний текст вивантаження (5 на годину, «~3 хв»), а не текст про запрошення',
      !!limiet && limiet[0].includes(`${UITVOER_PER_UUR} разів на годину`) && limiet[0].includes('~3 хв') && limiet[1].includes('~3 min') && !/запрошен|uitnodiging/i.test(limiet.join(' ')), JSON.stringify(limiet));
    const zonderTijd = uitvoerWeigering({ message: 'RATE_LIMITED' });
    check('ліміт без retryAfter → «пізніше» / «later»', !!zonderTijd && zonderTijd[0].includes('пізніше') && zonderTijd[1].includes('later'));
    const sessie = uitvoerWeigering({ message: 'OWNER_IDENTITY_SESSION_REQUIRED', response: { data: { error: 'OWNER_IDENTITY_SESSION_REQUIRED' } } });
    check('немає сеансу налаштувань → пояснення «увійдіть знову» (раніше коду не знала жодна таблиця)', !!sessie && /Увійдіть знову/.test(sessie[0]) && /opnieuw aan/.test(sessie[1]) && foutNaarTekst({ message: 'OWNER_IDENTITY_SESSION_REQUIRED' }) === null);
    const stap = { message: 'STEP_UP_REQUIRED', response: { data: { error: 'STEP_UP_REQUIRED' } } };
    check('решта кодів — через foutNaarTekst (step-up, вікно, мережа)', JSON.stringify(uitvoerWeigering(stap)) === JSON.stringify(foutNaarTekst(stap)) && JSON.stringify(uitvoerWeigering({ message: 'NETWORK_ERROR' })) === JSON.stringify(foutNaarTekst({ message: 'NETWORK_ERROR' })) && uitvoerWeigering({ message: 'ЩОСЬ_НЕВІДОМЕ' }) === null);
    check('запрошення не зачеплено: deelWeigering на RATE_LIMITED далі говорить про запрошення', /запрошень/.test(deelWeigering({ message: 'RATE_LIMITED' })?.[0] || ''));
  }

  // ================================================================ (а) чиста дія вивантаження
  {
    check('тіло запиту: service identity, tabContext і sourceOrigin вкладки', JSON.stringify(uitvoerAanvraag('tab-1', 'https://id.example')) === JSON.stringify({ service: 'identity', tabContext: 'tab-1', sourceOrigin: 'https://id.example' }) && UITVOER_ROUTE === '/api/owner/privacy/export');
    check('назва файлу з датою', uitvoerBestandsnaam(new Date('2026-11-14T23:30:00Z')) === 'mijn-ruimte-export-2026-11-14.json');
    const verzoeken: Array<[string, unknown]> = [];
    const bewaard: Array<{ naam: string; blob: Blob }> = [];
    const data = { formaat: 'mijn-ruimte-export-v1', accountId: 'a1', gegevens: { users: [{ id: 'a1' }] }, bestanden: [], beveiligingslog: [{ actie: 'login' }] };
    const ok = await gegevensUitvoeren({ post: async (u, b) => { verzoeken.push([u, b]); return { data }; }, bewaar: (naam, blob) => bewaard.push({ naam, blob }), tabContext: 'tab-x', origin: 'https://id.example', nu: new Date('2026-11-14T08:00:00Z') });
    const tekst = bewaard[0] ? await bewaard[0].blob.text() : '';
    check('успіх: один POST на маршрут експорту, файл JSON збережено з датою в назві', ok.ok === true && verzoeken.length === 1 && verzoeken[0][0] === UITVOER_ROUTE && (verzoeken[0][1] as { service?: string }).service === 'identity' && bewaard.length === 1 && bewaard[0].naam === 'mijn-ruimte-export-2026-11-14.json' && bewaard[0].blob.type === 'application/json', JSON.stringify(ok));
    check('успіх: у файлі саме відповідь сервера (з журналом безпеки), розмір повернуто', JSON.parse(tekst).beveiligingslog?.[0]?.actie === 'login' && ok.ok && ok.bytes === new TextEncoder().encode(tekst).length);
    const bewaardFout: string[] = [];
    const fout = await gegevensUitvoeren({ post: async () => { throw Object.assign(new Error('RATE_LIMITED'), { retryAfter: 600, response: { data: { error: 'RATE_LIMITED', retryAfter: 600 } } }); }, bewaar: (n) => bewaardFout.push(n), tabContext: 't', origin: 'o' });
    check('ліміт: файл не збережено, текст «~10 хв»', !fout.ok && fout.tekst[0].includes('~10 хв') && bewaardFout.length === 0, JSON.stringify(fout));
    const vreemd = await gegevensUitvoeren({ post: async () => ({ data: '<html>' }), bewaar: (n) => bewaardFout.push(n), tabContext: 't', origin: 'o' });
    check('не той формат (наприклад, сторінка замість JSON) → нічого не збережено, чесний текст', !vreemd.ok && /не файлом вивантаження/.test(vreemd.tekst[0]) && bewaardFout.length === 0);
    const onbekend = await gegevensUitvoeren({ post: async () => { throw new Error('ЩОСЬ'); }, bewaar: () => undefined, tabContext: 't', origin: 'o' });
    check('невідома помилка → загальний текст, а не порожньо', !onbekend.ok && /Не вдалося вивантажити/.test(onbekend.tekst[0]) && /niet worden geëxporteerd/.test(onbekend.tekst[1]));
  }

  // ================================================================ (а) рендер компонента
  {
    const uk = renderToStaticMarkup(createElement(Gegevensuitvoer, { lang: 'uk' }));
    const nl = renderToStaticMarkup(createElement(Gegevensuitvoer, { lang: 'nl' }));
    const compact = renderToStaticMarkup(createElement(Gegevensuitvoer, { lang: 'uk', compact: true }));
    check('повна секція: якір id="gegevensuitvoer", кнопка й попередження про журнал безпеки', uk.includes('id="gegevensuitvoer"') && uk.includes('Вивантажити мої дані (JSON)') && /data-gegevensuitvoer-waarschuwing="1"[^>]*>.*журнал безпеки/.test(uk) && uk.includes('IP-адреси'));
    check('кнопку не натисне ШІ-розширення (data-ai-geen-actie), підказка пояснює наслідки', /data-gegevensuitvoer-knop="vol"[^>]*data-ai-geen-actie="1"|data-ai-geen-actie="1"[^>]*data-gegevensuitvoer-knop="vol"/.test(uk) && uk.includes('Нічого в обліковому записі не зміниться'));
    check('нідерландська: без кирилиці, є попередження про beveiligingslogboek', !kyr.test(nl) && nl.includes('beveiligingslogboek') && nl.includes('Mijn gegevens exporteren (JSON)'));
    check('компактний варіант (блок видалення): та сама кнопка, без другого якоря', compact.includes('data-gegevensuitvoer-knop="compact"') && !compact.includes('id="gegevensuitvoer"'));
  }

  // ================================================================ (а) монтування в центрі налаштувань
  // InstellingencentrumWeergave у node не рендериться (SessieIconen вантажить прапори через import.meta.glob Vite), тож тут —
  // перевірка коду; саму секцію й кнопку рендер-перевірено вище. Rendert niet in node (import.meta.glob): broncontrole.
  {
    const c = lees('src/InstellingencentrumWeergave.tsx');
    const account = c.slice(c.indexOf("else if(p.tab==='account')"), c.indexOf("else if(p.tab==='sessions')"));
    check('«Акаунт»: секція «Ваші дані» одразу після «Стану моїх служб», лише для схваленого облікового запису (рядок MijnDiensten незмінний)',
      account.includes("<MijnDiensten lang={p.lang}/>{p.user.status==='approved'&&<Gegevensuitvoer lang={p.lang}/>}") && c.includes("import Gegevensuitvoer from './instellingen/Gegevensuitvoer';"));
    const wis = account.slice(account.indexOf("<section className='settings-danger'>"));
    const uitleg = wis.indexOf('<p data-wissen-uitleg>'), knop = wis.indexOf('<Gegevensuitvoer lang={p.lang} compact/>'), eigenaar = wis.indexOf('data-wissen-eigenaar'), invoer = wis.indexOf('<input value={confirm}');
    check('блок видалення: кнопка вивантаження після пояснення й перед полем підтвердження; у гілці власника її немає', uitleg > 0 && uitleg < knop && knop < invoer && eigenaar > 0 && eigenaar < uitleg && (account.match(/<Gegevensuitvoer /g) || []).length === 2);
    check('порада «вивантажте дані» в діалозі видалення лишилася (тепер має дію поруч)', c.includes("tr('Порада: перед видаленням вивантажте свої дані.','Tip: exporteer uw gegevens vóór het verwijderen.')") && wis.includes('data-wissen-uitvoer'));
  }

  // ================================================================ (а) без технічних тек і без клієнта хмари
  {
    const bron = lees('src/instellingen/Gegevensuitvoer.tsx');
    check('Gegevensuitvoer не імпортує технічні теки (src/uitrol, src/audit) і cloud-vnext; без @tech-asset', !/from '\.\.\/(uitrol|audit|cloud-vnext)\//.test(bron) && !bron.includes('@tech-asset') && bron.includes("from '../platform/bestand-opslaan'"));
    check('один помічник збереження: cloud-vnext реекспортує bewaarBlob з platform', lees('src/cloud-vnext/hulp.ts').includes("export { bewaarBlob } from '../platform/bestand-opslaan';") && !lees('src/cloud-vnext/hulp.ts').includes('URL.createObjectURL'));
  }

  // ================================================================ (в) «Типи сповіщень» у меню — справжній рендер
  {
    const { default: ZijbalkInstellingen } = await import('../../src/ZijbalkInstellingen');
    const tr = (uk: string) => uk;
    let html = '', fout = '';
    try { html = renderToStaticMarkup(createElement(ZijbalkInstellingen, { tr })); } catch (e) { fout = String((e as Error)?.stack || e).slice(0, 400); }
    const blok = html.indexOf('id="menu-meldingtypen"'), snel = html.indexOf('id="menu-snelheid"'), meld = html.indexOf('id="menu-meldingen"');
    check('окремий блок id="menu-meldingtypen" стоїть перед menu-snelheid і після menu-meldingen', !fout && blok > 0 && meld >= 0 && meld < blok && blok < snel, fout || `${meld}/${blok}/${snel}`);
    const binnen = html.slice(blok, snel);
    check('у блоці — MeldingVoorkeurenPaneel (той самий редактор типів, що й у дзвонику)', binnen.includes('mv-paneel') && binnen.includes('Типи сповіщень'));
    check('назва «Типи сповіщень» більше не двоїться: легенда міток меню — «Категорії міток у меню»', (html.match(/Типи сповіщень<\/strong>/g) || []).length === 1 && html.includes('Категорії міток у меню') && !html.includes('<legend>Типи сповіщень</legend>'));
    check('селектори e2e меню не зачеплено: [data-meld-categorie], [data-meld-schakel="aan"] лишилися в #menu-meldingen', html.slice(meld, blok).includes('data-meld-categorie="delen"') && html.slice(meld, blok).includes('data-meld-schakel="aan"') && !binnen.includes('data-meld-'));
  }

  browserWeg();
  // ================================================================ (б) справжній маршрут експорту
  const pool = getPool('systeem');
  const { handler } = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
  const { googleStapOpVastleggen } = await import('../../backend/stap-op');
  const nieuw = async (status: string) => {
    const uid = randomUUID();
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: `i014u-${randomBytes(4).toString('hex')}@eenheid.test`, role: 'member', status, name: 'Проба 014' }]);
    return uid;
  };
  const sessie = async (uid: string) => {
    const epochRij = await pool.query(`SELECT (data->>'epoch')::int AS e FROM app.records WHERE tbl='owner_revocation_state_v1' AND data->>'userId'=$1 ORDER BY (data->>'epoch')::int DESC LIMIT 1`, [uid]);
    const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
    const rec = { tokenHash: sha(token), userId: uid, service: 'identity', sourceOrigin: `https://${HOST}`, tabHash: sha('ecosystem'), grantId: '', createdAt: now, authenticatedAt: now, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: Number(epochRij.rows[0]?.e || 0), scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.14', userAgent: 'eenheid' };
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, rec]);
    return { id, cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}` };
  };
  const roep = async (s: { cookie: string }) => {
    const pad = '/api/owner/privacy/export';
    const evt = { headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', cookie: s.cookie, 'user-agent': 'eenheid' }, body: JSON.stringify({ service: 'identity', tabContext: randomBytes(24).toString('hex'), sourceOrigin: `https://${HOST}` }), httpMethod: 'POST', path: pad, rawPath: pad, requestContext: { http: { method: 'POST', path: pad } } };
    const r = await handler(evt as never);
    let data: Record<string, any> = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ }
    return { status: r.statusCode, data, headers: (r.headers || {}) as Record<string, string> };
  };
  const meldingen = async (uid: string) => (await pool.query(`SELECT data FROM app.records WHERE tbl='site_notifications' AND data->>'recipientUserId'=$1 AND data->>'kind'='security' AND data->>'title' LIKE 'Ваші дані вивантажено%'`, [uid])).rowCount || 0;
  const audits = async (uid: string) => (await pool.query(`SELECT 1 FROM app.audit WHERE owner_id=$1 AND action='owner.privacy.export' AND result='success'`, [uid])).rowCount || 0;

  try {
    const uid = await nieuw('approved');
    const s = await sessie(uid);
    const zonder1 = await roep(s), zonder2 = await roep(s);
    check('без підтвердження доступу → 403 STEP_UP_REQUIRED, нічого не вивантажено', zonder1.status === 403 && zonder2.status === 403 && /STEP_UP/.test(String(zonder1.data.error || zonder1.data.reasonCode)) && !zonder1.data.formaat, JSON.stringify(zonder1.data).slice(0, 200));
    await googleStapOpVastleggen(uid, [s.id], Date.now());
    const goed: number[] = [];
    let eerste: Record<string, any> = {};
    for (let i = 0; i < UITVOER_PER_UUR; i++) { const r = await roep(s); goed.push(r.status); if (i === 0) eerste = r.data; }
    check(`після підтвердження — ${UITVOER_PER_UUR} вивантажень на годину: дві відмови step-up НЕ з'їли спроб (давня вада)`, goed.every((x) => x === 200), goed.join(','));
    check('вміст: формат v1, свій обліковий запис, журнал безпеки — масив', eerste.formaat === 'mijn-ruimte-export-v1' && eerste.accountId === uid && Array.isArray(eerste.beveiligingslog) && !!eerste.gegevens?.users);
    const zesde = await roep(s);
    check('шосте вивантаження → 429 RATE_LIMITED з retryAfter, maxAttempts 5, windowSec 3600 і заголовком Retry-After (раніше без часу)',
      zesde.status === 429 && zesde.data.error === 'RATE_LIMITED' && zesde.data.retryAfter > 0 && zesde.data.retryAfter <= 3600 && zesde.data.maxAttempts === 5 && zesde.data.windowSec === 3600 && Number(zesde.headers['Retry-After']) === zesde.data.retryAfter, JSON.stringify(zesde.data));
    const tekst = uitvoerWeigering({ message: zesde.data.error, retryAfter: zesde.data.retryAfter, response: { data: zesde.data } });
    check('клієнт перетворює цю відповідь на текст із часом очікування', !!tekst && /через ~\d+ хв/.test(tekst[0]));
    check(`кожне вдале вивантаження — сповіщення безпеки в центрі сповіщень (${UITVOER_PER_UUR})`, (await meldingen(uid)) === UITVOER_PER_UUR);
    const a = await audits(uid);
    check('кожне вдале вивантаження записано в аудит owner.privacy.export (відмови step-up і ліміту — ні)', a === UITVOER_PER_UUR, String(a));
    check('тип «security» відомий реєстру сповіщень (новий тип не потрібен)', Object.prototype.hasOwnProperty.call(MELDING_SOORTEN, 'security'));

    const uidWacht = await nieuw('pending');
    const sw = await sessie(uidWacht);
    const w = await roep(sw);
    check('несхвалений обліковий запис → 401 OWNER_IDENTITY_SESSION_REQUIRED, без сповіщення', w.status === 401 && w.data.error === 'OWNER_IDENTITY_SESSION_REQUIRED' && (await meldingen(uidWacht)) === 0, JSON.stringify(w.data));
  } finally {
    await closePool().catch(() => undefined);
  }
  return einde();
}
