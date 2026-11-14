// IDENTITEIT-014 (фаза 3, крок «delen», 14.11.2026): спільний доступ у hub-модалці й центрі налаштувань.
// Перевіряє СПРАВЖНЮ поведінку: (1) чисту логіку src/delen/delen-logica.ts і тексти відмов вступу (src/weigeringen.ts);
// (2) серверні коди відмов і поле expired через справжні маршрути backend/index.ts проти одноразової бази (як identiteit-014-rechten);
// (3) хук useDelen + список LedenLijst у справжньому Chrome: стани двома мовами, вимкнені дії за роллю В ПРОСТОРІ, відкликання й
// «зробити адміністратором» лише після вікна підтвердження, посилання-запрошення на hub, зрозумілі відмови.
// Delen in hub en instellingencentrum: zuivere logica, servercodes, en hook + lijst in een echte Chrome. Alleen verzonnen gegevens.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-014-delen.test.ts
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { deelWeigering, foutNaarTekst } from '../../src/weigeringen';
import { geldigeKeuze, lidStaat, rolKeuzes, rolVanLid, staatTekst, toegangGevenVraag, uitnodigingAfgewezen, waaromNiet, STAAT_TEKST } from '../../src/delen/delen-logica';
import { WERKRUIMTE_ROLLEN, magRolBeheren } from '../../shared/werkruimte-rechten';

const kyr = /[А-Яа-яІіЇїЄєҐґ]/;
const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-014-delen');

  // ================================================================ (1) чиста логіка
  {
    check('стан: active → actief; invited → uitgenodigd; invited+expired → verlopen',
      lidStaat({ status: 'active' }) === 'actief' && lidStaat({ status: 'invited' }) === 'uitgenodigd' && lidStaat({ status: 'invited', expired: true }) === 'verlopen' && lidStaat({ status: 'active', expired: true }) === 'actief');
    check('стан: тексти українською й нідерландською (різні мови, не сирі active/invited)',
      Object.values(STAAT_TEKST).every(([uk, nl]) => kyr.test(uk) && !kyr.test(nl) && !/^(active|invited)$/.test(nl)) && staatTekst('nl', { status: 'invited', expired: true }) === 'Uitnodiging verlopen' && staatTekst('uk', { status: 'active' }) === 'Активний');
    check('роль учасника: editor без ролі → member, явна admin, решта → viewer',
      rolVanLid({ permission: 'editor' }) === 'member' && rolVanLid({ permission: 'editor', workspaceRole: 'admin' }) === 'admin' && rolVanLid({ permission: 'viewer' }) === 'viewer');
    const keuzes = Object.fromEntries([...WERKRUIMTE_ROLLEN, null].map((r) => [String(r), rolKeuzes(r).join(',')]));
    check('рівні у формі: власник і адміністратор простору — Перегляд/Редагування/Адміністратор; учасник, глядач і «без ролі» — нічого',
      keuzes.owner === 'viewer,editor,admin' && keuzes.admin === 'viewer,editor,admin' && keuzes.member === '' && keuzes.viewer === '' && keuzes.null === '', JSON.stringify(keuzes));
    check('рівні у формі: «Адміністратор» з’являється рівно тоді, коли magRolBeheren(rol,"admin") (та сама таблиця, що на сервері)',
      [...WERKRUIMTE_ROLLEN, null].every((r) => rolKeuzes(r).includes('admin') === magRolBeheren(r, 'admin')));
    check('зміна простору: недоступний рівень повертається на «Перегляд»', geldigeKeuze('member', 'admin') === 'viewer' && geldigeKeuze('owner', 'admin') === 'admin' && geldigeKeuze(null, 'editor') === 'viewer');
    const vAdmin = toegangGevenVraag('uk', { email: 'x@example.test', ruimte: 'Сім’я', keuze: 'admin' });
    const vKijk = toegangGevenVraag('nl', { email: 'y@example.test', ruimte: 'Werk', keuze: 'viewer' });
    const vLid = toegangGevenVraag('uk', { email: 'z@example.test', ruimte: 'Р', keuze: 'editor' });
    check('вікно «Надати доступ?»: адреса, простір і роль; для адміністратора — небезпечне, з наслідками й попередженням про step-up',
      vAdmin.gevaarlijk && vAdmin.uitleg.includes('x@example.test') && vAdmin.uitleg.includes('Сім’я') && vAdmin.uitleg.includes('«Адміністратор»')
      && vAdmin.gevolgen.some((g) => /запрошувати інших/.test(g)) && vAdmin.gevolgen.some((g) => /підтвердити, що це ви/.test(g)), JSON.stringify(vAdmin));
    check('вікно «Надати доступ?»: Перегляд/Редагування — не небезпечні, текст мовою інтерфейсу, роль названа людською мовою',
      !vKijk.gevaarlijk && vKijk.uitleg === 'y@example.test krijgt toegang tot «Werk» als «Lezen».' && !kyr.test(vKijk.gevolgen.join(' ')) && !vLid.gevaarlijk && vLid.uitleg.includes('«Редагування»') && vLid.gevolgen.some((g) => /7 днів/.test(g)));
    check('пояснення вимкнених дій: власник/адміністратор — немає; глядач — названо його роль у ЦЬОМУ просторі; без простору — окремий текст',
      waaromNiet('uk', 'owner') === null && waaromNiet('nl', 'admin') === null && /«Перегляд»/.test(waaromNiet('uk', 'viewer') || '') && /DEZE werkruimte/.test(waaromNiet('nl', 'member') || '') && /Немає простору/.test(waaromNiet('uk', null) || ''));

    // (д) відмови вступу: зрозумілий текст і остаточність
    const fout = (code: string) => ({ message: code, response: { data: { error: code } } });
    const codes = ['invite_expired', 'invite_used', 'invite_revoked', 'invite_not_found', 'invite_not_allowed', 'INVITE_INVITER_NOT_ALLOWED'];
    const teksten = codes.map((c) => deelWeigering(fout(c)));
    check('вступ: кожна відмова має текст uk/nl (і через foutNaarTekst), що каже, що робити далі',
      teksten.every((p) => !!p && kyr.test(p[0]) && !kyr.test(p[1]) && /Попросіть|Перевірте|Увійдіть|зверніться/.test(p[0])) && codes.every((c) => !!foutNaarTekst(fout(c))), JSON.stringify(teksten.map((p) => p?.[0].slice(0, 30))));
    check('вступ: прострочене / використане / відкликане — різні тексти', /прострочене/.test(teksten[0]![0]) && /вже використано/.test(teksten[1]![0]) && /відкликали/.test(teksten[2]![0]) && /verlopen/.test(teksten[0]![1]) && /al gebruikt/.test(teksten[1]![1]) && /ingetrokken/.test(teksten[2]![1]));
    check('вступ: остаточна відмова (invite_*, INVITE_INVITER_NOT_ALLOWED) → код прибирають; мережа/500 — ні',
      codes.every((c) => uitnodigingAfgewezen(fout(c))) && !uitnodigingAfgewezen(fout('NETWORK_ERROR')) && !uitnodigingAfgewezen(fout('HTTP_500')) && !uitnodigingAfgewezen(undefined));
  }

  // ================================================================ (1б) місця в коді, де поведінку не запустити без усієї програми
  {
    const app = lees('src/App.tsx'), centrum = lees('src/InstellingencentrumWeergave.tsx'), vd = lees('src/VerenigdDienstApp.tsx'), hook = lees('src/delen/useDelen.ts');
    check('hub: модалка рендериться порталом у document.body (не під прозорим шаром .canonical-workspace)',
      app.includes("createPortal(<div className='modal-backdrop'") && app.includes("</section></div>, document.body)}") && app.includes("import { createPortal } from 'react-dom';"));
    check('hub і центр: роль — у вибраному просторі (useDelen), не на сайті', app.includes('const canShareWorkspace=delen.mag;') && !/user\?\.role==='owner'\|\|user\?\.role==='admin'\);\s*$/m.test(app) && centrum.includes('const magDelenHier=delen.mag;') && !centrum.includes("const magDelen=p.user.role==="));
    check('hub і центр: «Адміністратор» у формі лише коли magRolBeheren(rol,"admin")', app.includes("{magRolBeheren(delen.rol,'admin')&&<option value='admin'>") && centrum.includes("{magRolBeheren(delen.rol,'admin')&&<option value='admin'>"));
    check('hub і центр: «Надати доступ» — спершу вікно deel-toegang-geven', app.includes("id='deel-toegang-geven'") && centrum.includes("id='deel-toegang-geven'") && !/onClick=\{\(\)=>void delen\.perAdres/.test(app));
    check('центр: блоки «Хто має доступ» (id=delen-leden) і форма запрошення (id=delen-uitnodigen), простір — з deelWerkruimtes',
      centrum.includes("<section id='delen-leden'") && centrum.includes("<section id='delen-uitnodigen'") && centrum.includes('p.deelWerkruimtes??') && vd.includes('deelWerkruimtes={deelWerkruimtes}'));
    check('центр: посилання будується на hub (не на id.*)', vd.includes("uitnodigingsLink(String(response.data.code||''),hubOrigin())") && !vd.includes("{path:'?join=1'}") && vd.includes("new URL(canonicalNavigationUrl('hub')).origin"));
    check('hub: після остаточної відмови вступу код прибирають зі sessionStorage', /catch \(e\) \{[^}]*if \(uitnodigingAfgewezen\(e\)\) invitesClient\.clearPendingCode\(\);/.test(app));
    check('хук: використовує наявні помічники (deelWeigering/foutNaarTekst, kopieerTekst), без власних перевірок ролей', hook.includes('deelWeigering(e)') && hook.includes('kopieerTekst(link)') && !/=== ?'owner' ?\|\|/.test(hook));
  }

  // ================================================================ (2) сервер: справжні коди відмов і expired
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const G = await nepGoogle({ ownerEmail: `i014d-eig-${T}@example.test` });
  const pool = getPool();
  type Browser = ReturnType<typeof G.browser>;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const hub = ({ b }: { b: Browser }, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('hub.tarasevych.com', pad, b.ctxBody('hub', extra));
  const maak = async (naam: string) => {
    const email = `i014d-${naam}-${T}@example.test`, b = G.browser(), sub = `i014d-${naam}-${T}`;
    await b.aanmelden(sub, email, { intent: 'login' });
    const id = await idRij(email);
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: `Проба ${naam}` })]);
    return { b, email, id, sub };
  };
  const alsFout = (r: { data: Record<string, unknown> }) => ({ response: { data: r.data } });
  try {
    const O = await maak('o'), M = await maak('m'), N = await maak('n');
    const ws = String((await hub(O, '/api/workspace/load')).data.workspace?.id || '');
    for (const p of [M, N]) await hub(p, '/api/workspace/load');
    const link = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer' });
    const code = String(link.data.code || '');
    const eerst = await hub(M, '/api/share/join', { code });
    const tweede = await hub(N, '/api/share/join', { code });
    check('сервер: друга людина за тим самим посиланням → 400 invite_used; інтерфейс показує «вже використано» і прибирає код',
      eerst.status === 200 && tweede.status === 400 && tweede.data.error === 'invite_used' && /вже використано/.test(deelWeigering(alsFout(tweede))?.[0] || '') && uitnodigingAfgewezen(alsFout(tweede)), `${eerst.status} ${tweede.status} ${JSON.stringify(tweede.data)}`);
    const nep = await hub(N, '/api/share/join', { code: 'nietbestaand12345' });
    check('сервер: неіснуючий код → invite_not_found з текстом для людини', nep.status === 400 && nep.data.error === 'invite_not_found' && !!deelWeigering(alsFout(nep)) && uitnodigingAfgewezen(alsFout(nep)), JSON.stringify(nep.data));
    // прострочене запрошення за адресою: сервер позначає expired → «Запрошення прострочене»
    const mail = `i014d-later-${T}@example.test`;
    const uit = await hub(O, '/api/share/email', { workspaceId: ws, email: mail, workspaceRole: 'viewer' });
    await pool.query("update app.records set data = data || $2::jsonb where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'email'=$3", [ws, JSON.stringify({ verlooptOp: Date.now() - 1000 }), mail]);
    const leden = await hub(O, '/api/share/members', { workspaceId: ws });
    const later = ((leden.data.members || []) as Array<{ email: string; status: string; expired?: boolean }>).find((l) => l.email === mail);
    const actief = ((leden.data.members || []) as Array<{ email: string; status: string }>).find((l) => l.email === M.email);
    check('сервер: /api/share/members дає rol власника і expired для простроченого запрошення → стани «Запрошення прострочене» / «Активний»',
      uit.status === 200 && leden.data.rol === 'owner' && !!later && lidStaat(later) === 'verlopen' && staatTekst('uk', later) === 'Запрошення прострочене' && !!actief && lidStaat(actief) === 'actief', JSON.stringify(leden.data).slice(0, 400));
    const kijkerLeden = await hub(M, '/api/share/members', { workspaceId: ws });
    check('сервер: для глядача rol=viewer → інтерфейс вимикає дії (rolKeuzes порожній)', kijkerLeden.data.rol === 'viewer' && rolKeuzes(kijkerLeden.data.rol as 'viewer').length === 0);
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i014d-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await pool.query("delete from app.records where tbl='workspace_members' and data->>'workspaceId' in (select id from app.records where tbl='workspaces' and data->>'ownerUserId' = any($1))", [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    }
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);

  // ================================================================ (3) хук + список у справжньому Chrome
  await inChrome(check);
  return einde();
}

type Check = (naam: string, ok: boolean, info?: string) => void;

const PROEF = `
import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useDelen } from './src/delen/useDelen';
import { LedenLijst } from './src/delen/LedenLijst';
const w = window as any;
w.log = []; w.meldingen = []; w.antwoorden = {}; w.serverRol = 'owner';
const post = async (pad: string, lichaam: Record<string, unknown>) => {
  w.log.push({ pad, lichaam });
  const f = w.antwoorden[pad];
  if (f) return f(lichaam);
  if (pad === '/api/share/members') return { members: w.leden[lichaam.workspaceId as string] || [], rol: w.serverRol };
  return { ok: true };
};
function Proef() {
  const [ws, setWs] = useState('ws-1');
  const d = useDelen({ werkruimteId: ws, rol: 'owner', actief: true, post, melding: (p) => w.meldingen.push(p), hubOrigin: 'https://hub.proef.invalid' });
  w.d = d; w.setWs = setWs;
  return h('div', null, h('output', { id: 'rol' }, String(d.rol)), h(LedenLijst, { lang: 'uk', leden: d.leden, rol: d.rol, bezig: d.bezig, onRol: d.rolWijzigen, onIntrekken: d.intrekken }));
}
w.start = () => createRoot(document.getElementById('k')!).render(h(Proef));
`;

async function inChrome(check: Check) {
  const PW = [process.env.PLAYWRIGHT_CORE, join(process.cwd(), 'node_modules', 'playwright-core'), '/opt/node-tools/node_modules/playwright-core']
    .filter((p): p is string => Boolean(p)).map((p) => join(p, 'index.mjs')).find((p) => existsSync(p)) || '';
  const CHROME = process.env.CHROME_PAD || '/usr/bin/google-chrome';
  if (!PW || !existsSync(CHROME)) { check('Chrome і playwright-core доступні (CHROME_PAD, PLAYWRIGHT_CORE)', false, `${PW} ${CHROME}`); return; }
  const map = mkdtempSync(join(tmpdir(), 'i014-delen-'));
  try {
    const { build } = await import('esbuild');
    const uit = resolve(map, 'proef.js');
    await build({ stdin: { contents: PROEF, resolveDir: resolve('.'), loader: 'tsx', sourcefile: 'i014-proef.tsx' }, outfile: uit, bundle: true, logLevel: 'error', platform: 'browser', format: 'iife', target: 'es2022', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' } });
    const { chromium } = await import(pathToFileURL(PW).href) as { chromium: { launch: (o: unknown) => Promise<any> } };
    const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      const fouten: string[] = [];
      page.on('pageerror', (e: Error) => fouten.push(String(e?.message || e)));
      await page.route('**/*', async (r: any) => {
        const u = String(r.request().url());
        if (u === 'https://id.proef.invalid/') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="uk"><head><meta charset="utf-8"></head><body><div id="k"></div><script src="/proef.js"></script></body></html>' });
        if (u === 'https://id.proef.invalid/proef.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(uit, 'utf8') });
        return r.abort(); // niets gaat naar buiten
      });
      await page.goto('https://id.proef.invalid/');
      await page.evaluate(() => {
        const w = window as any;
        w.leden = {
          'ws-1': [
            { id: 'l1', email: 'lid@example.test', userId: 'u1', permission: 'editor', workspaceRole: 'member', status: 'active' },
            { id: 'l2', email: 'nieuw@example.test', permission: 'viewer', workspaceRole: 'viewer', status: 'invited' },
            { id: 'l3', email: 'oud@example.test', permission: 'viewer', workspaceRole: 'viewer', status: 'invited', expired: true },
          ],
          'ws-2': [{ id: 'k1', email: 'a***@example.test', userId: 'u9', permission: 'editor', workspaceRole: 'admin', status: 'active' }],
        };
        w.start();
      });
      await page.waitForSelector('[data-lid-staat="verlopen"]', { timeout: 15000 });
      const staten = await page.$$eval('.delen-lid', (els: Element[]) => els.map((e) => `${e.getAttribute('data-lid-staat')}:${e.querySelector('.delen-staat')?.textContent}`));
      check('Chrome: стани учасників українською (Активний / Запрошено / Запрошення прострочене), без сирих active/invited',
        staten.join('|') === 'actief:Активний|uitgenodigd:Запрошено — ще не прийнято|verlopen:Запрошення прострочене', staten.join('|'));
      const eerste = await page.$eval('.delen-lid select', (s: HTMLSelectElement) => ({ disabled: s.disabled, opties: [...s.options].map((o) => `${o.value}${o.disabled ? '!' : ''}`).join(',') }));
      check('Chrome: власник може змінити роль (Перегляд/Редагування/Адміністратор), ролі «власник» у списку немає', !eerste.disabled && eerste.opties === 'viewer,member,admin', JSON.stringify(eerste));

      // Відкликання — лише після вікна deel-intrekken
      await page.click('.delen-lid:nth-of-type(1) button:has-text("Відкликати")');
      await page.waitForSelector('[data-bevestig="deel-intrekken"]', { timeout: 5000 });
      const voorIntrekken = await page.evaluate(() => (window as any).log.filter((x: any) => x.pad === '/api/share/revoke').length);
      await page.click('[data-bevestig="deel-intrekken"] .bevestig-dialoog-ja');
      await page.waitForFunction(() => (window as any).log.some((x: any) => x.pad === '/api/share/revoke'), null, { timeout: 5000 });
      const intrek = await page.evaluate(() => (window as any).log.find((x: any) => x.pad === '/api/share/revoke'));
      check('Chrome: «Відкликати» спершу відкриває вікно підтвердження; запит іде лише після «Так, відкликати» (memberId=l1, ws-1)',
        voorIntrekken === 0 && intrek?.lichaam?.memberId === 'l1' && intrek?.lichaam?.workspaceId === 'ws-1', JSON.stringify(intrek));

      // «Адміністратор» у списку — окреме вікно, запит /api/share/role лише після підтвердження
      await page.waitForSelector('[data-bevestig="deel-intrekken"]', { state: 'detached', timeout: 5000 });
      await page.selectOption('.delen-lid:nth-of-type(1) select', 'admin');
      await page.waitForSelector('[data-bevestig="deel-rol-beheerder"]', { timeout: 5000 });
      const voorRol = await page.evaluate(() => (window as any).log.filter((x: any) => x.pad === '/api/share/role').length);
      const gevaar = await page.$eval('[data-bevestig="deel-rol-beheerder"]', (e: Element) => e.classList.contains('is-gevaarlijk') && /!/.test(e.querySelector('.bevestig-dialoog-ja')?.textContent || ''));
      await page.click('[data-bevestig="deel-rol-beheerder"] .bevestig-dialoog-ja');
      await page.waitForFunction(() => (window as any).log.some((x: any) => x.pad === '/api/share/role'), null, { timeout: 5000 });
      const rolVerzoek = await page.evaluate(() => (window as any).log.find((x: any) => x.pad === '/api/share/role'));
      check('Chrome: «Адміністратор» для учасника — небезпечне вікно з «!»; /api/share/role (workspaceRole=admin) лише після підтвердження',
        voorRol === 0 && gevaar && rolVerzoek?.lichaam?.workspaceRole === 'admin' && rolVerzoek?.lichaam?.memberId === 'l1', JSON.stringify(rolVerzoek));

      // Посилання — на hub, не на id.*
      const link = await page.evaluate(async () => { const w = window as any; w.antwoorden['/api/share/link'] = () => ({ code: 'CODE1234abcd' }); return w.d.linkMaken({ keuze: 'viewer' }); });
      check('Chrome: посилання-запрошення, створене на id.*, веде на hub (#/join?invite=…)', link === 'https://hub.proef.invalid/#/join?invite=CODE1234abcd', link);

      // Відмова сервера → зрозумілий текст
      const melding = await page.evaluate(async () => {
        const w = window as any; w.antwoorden['/api/share/email'] = () => { throw Object.assign(new Error('RBAC_ROLE_FORBIDDEN'), { response: { data: { error: 'RBAC_ROLE_FORBIDDEN' } } }); };
        const ok = await w.d.perAdres({ email: 'x@example.test', keuze: 'admin' }); return { ok, laatste: w.meldingen[w.meldingen.length - 1] };
      });
      check('Chrome: відмова RBAC_ROLE_FORBIDDEN → текст deelWeigering, поле не очищається (perAdres=false)', melding.ok === false && /не можете надати таку роль/.test(melding.laatste?.[0] || ''), JSON.stringify(melding));

      // Інший простір, де користувач лише учасник: список оновлюється, дії вимкнені
      await page.evaluate(() => { const w = window as any; w.serverRol = 'member'; w.setWs('ws-2'); });
      await page.waitForFunction(() => document.getElementById('rol')?.textContent === 'member' && document.querySelectorAll('.delen-lid').length === 1, null, { timeout: 5000 });
      const ws2 = await page.$eval('.delen-lid', (e: Element) => ({ disabled: (e.querySelector('select') as HTMLSelectElement).disabled, knoppen: e.querySelectorAll('button').length, uitleg: (e.querySelector('select') as HTMLSelectElement).title }));
      check('Chrome: у просторі, де ви лише учасник (rol від сервера), зміна ролі вимкнена з поясненням і кнопки «Відкликати» немає',
        ws2.disabled && ws2.knoppen === 0 && /лише власник або адміністратор/.test(ws2.uitleg), JSON.stringify(ws2));
      check('Chrome: без помилок сторінки', fouten.length === 0, fouten.join(' | ').slice(0, 300));
    } finally { await browser.close(); }
  } catch (e) {
    check('Chrome: перевірка виконалася', false, String((e as Error)?.stack || e).slice(0, 600));
  } finally { rmSync(map, { recursive: true, force: true }); }
}
