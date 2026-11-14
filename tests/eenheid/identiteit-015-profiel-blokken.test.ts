// IDENTITEIT-015, крок 4 «profiel-blokken». Поведінка — через справжні маршрути backend/index.ts проти одноразової бази й
// підробленого Google (tests/eenheid/hulp/nep-google.ts); зображення за посиланням — підроблений провайдер (zetFotoOphalerVoorTests)
// і справжній pinnedFetch для внутрішніх адрес (відмова ДО з'єднання). Лише вигадані дані; назовні не йде нічого.
//   (1) «Без фото»: geenFoto у POST /api/owner/profile/photo, поле в users, усі аватари — ініціали, вхід Google фото не повертає;
//   (2) світлина за посиланням через сервер: https, SSRF, переадресація, тип за байтами, межа розміру, ліміт, аудит з хостом;
//   (3) форма блоку: «Скасувати», «Відкрити в просторі» (hub читає ?werkruimte&blok), пояснення поля адреси внутрішнього блоку;
//   (4) передача володіння простором: кандидати, права на сервері, step-up, аудит і сповіщення обом, повторна й перервана спроба,
//       одночасні запити; чесний текст про власника САЙТУ (OWNER_EMAIL).
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-015-profiel-blokken.test.ts
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { afbeeldingSoort, fotoLinkControleren, fotoVanLink, zetFotoOphalerVoorTests, FOTO_LINK_MAX_BYTES } from '../../backend/profielfoto-link';
import { overdrachtFout, overdrachtMeldingTekst } from '../../backend/werkruimte-overdracht';
import { NOOIT_ONTHOUDEN, onthoudMagVoorPad } from '../../backend/stap-op';
import { actieVoorPad } from '../../shared/stap-op-acties';
import { beschrijfStapOp } from '../../shared/stap-op-beschrijving';
import { MELDING_SOORTEN, isBekendeSoort } from '../../shared/melding-soorten';
import { NA_0107_VIA_VOORVOEGSEL, SFEER_PER_SOORT, sfeerVanSoort } from '../../shared/meldingen-soorten';
import { uitlegVoor } from '../../shared/meldingen-v2/uitleg-register';
import { meldingDoel } from '../../shared/menu-meldingen';
import { leesOpenDoel, zonderOpenDoel } from '../../src/open-in-ruimte';
import { fotoLinkWeigering, foutNaarTekst } from '../../src/weigeringen';
import { KIJKER_EIGEN } from '../../backend/kijker-alleen-lezen';

const lees = (p: string) => readFileSync(p, 'utf8');
const SOORT = 'workspace_ownership_transferred';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4a70000000049454e44ae426082', 'hex');

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-profiel-blokken');

  // ================================================================ (2) чисті правила посилання
  {
    const c = (u: string) => { const r = fotoLinkControleren(u); return r.ok ? 'ok' : r.code; };
    check('посилання: лише https без логіна/пароля; http, ftp, data, javascript, порожнє, задовге — FOTO_LINK_ONGELDIG',
      ['http://example.com/a.png', 'ftp://example.com/a.png', 'data:image/png;base64,AA', 'javascript:alert(1)', '', 'https://u:p@example.com/a.png', `https://example.com/${'a'.repeat(2100)}`, 'https://exa mple.com/a.png'].every((u) => c(u) === 'FOTO_LINK_ONGELDIG'));
    check('посилання: нестандартний порт, localhost, *.local, *.internal, ім\'я без крапки — FOTO_LINK_GEWEIGERD (ще до DNS)',
      ['https://example.com:8443/a.png', 'https://localhost/a.png', 'https://printer.local/a.png', 'https://metadata.google.internal/x', 'https://intranet/a.png'].every((u) => c(u) === 'FOTO_LINK_GEWEIGERD'));
    check('посилання: звичайна адреса й явний :443 — ok, хеш прибрано', c('https://images.example.org/a.png') === 'ok' && c('https://images.example.org:443/a.png') === 'ok'
      && (fotoLinkControleren('https://x.example.org/a.png#frag') as { url: string }).url === 'https://x.example.org/a.png');
    check('тип за першими байтами: PNG, JPEG, WebP так; GIF, HTML, SVG, порожньо — ні',
      afbeeldingSoort(PNG) === 'image/png' && afbeeldingSoort(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])) === 'image/jpeg' && afbeeldingSoort(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1')) === 'image/webp'
      && !afbeeldingSoort(Buffer.from('GIF89a......')) && !afbeeldingSoort(Buffer.from('<html><body>')) && !afbeeldingSoort(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')) && !afbeeldingSoort(new Uint8Array(0)));
    // Справжній pinnedFetch (без підробки): IP-літерали внутрішніх мереж відхиляються ДО з'єднання.
    zetFotoOphalerVoorTests();
    const ssrf = await Promise.all(['https://127.0.0.1/a.png', 'https://10.1.2.3/a.png', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/a.png', 'https://[::ffff:7f00:1]/a.png', 'https://192.168.1.1/x.jpg'].map((u) => fotoVanLink(u)));
    check('SSRF: справжній pinnedFetch відхиляє 127.0.0.1, 10.*, 169.254.169.254, ::1, ::ffff:7f00:1, 192.168.* — FOTO_LINK_GEWEIGERD',
      ssrf.every((r) => !r.ok && r.code === 'FOTO_LINK_GEWEIGERD'), JSON.stringify(ssrf));
    // Підроблений провайдер
    const gezien: string[] = [];
    const nep = (r: () => Response | Promise<Response>) => zetFotoOphalerVoorTests(async (u) => { gezien.push(u); return r(); });
    nep(() => new Response(PNG, { status: 200, headers: { 'content-type': 'text/plain' } }));
    const goed = await fotoVanLink('https://img.example.org/p.png');
    check('провайдер: PNG із хибним content-type розпізнано за байтами; повертаються ті самі байти й хост', goed.ok && goed.mimeType === 'image/png' && Buffer.from(goed.data, 'base64').equals(PNG) && goed.host === 'img.example.org');
    nep(() => new Response('<html>не зображення</html>', { status: 200, headers: { 'content-type': 'image/png' } }));
    const html = await fotoVanLink('https://img.example.org/p.png');
    nep(() => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }));
    const omleiding = await fotoVanLink('https://img.example.org/p.png');
    nep(() => new Response('nope', { status: 404 }));
    const nietGevonden = await fotoVanLink('https://img.example.org/p.png');
    nep(() => { throw new Error('REMOTE_TIMEOUT'); });
    const traag = await fotoVanLink('https://img.example.org/p.png');
    nep(() => { throw new Error('FOTO_LINK_TE_GROOT'); });
    const groot = await fotoVanLink('https://img.example.org/p.png');
    nep(() => new Response(new Uint8Array(FOTO_LINK_MAX_BYTES + 1), { status: 200 }));
    const grootZonderKop = await fotoVanLink('https://img.example.org/p.png');
    const voor = gezien.length;
    await fotoVanLink('http://img.example.org/p.png');
    check('провайдер: HTML під виглядом зображення, переадресація (за нею НЕ йдемо), 404, тайм-аут, розмір — кожне зі своїм кодом; на http провайдер не викликається',
      !html.ok && html.code === 'FOTO_LINK_GEEN_AFBEELDING' && !omleiding.ok && omleiding.code === 'FOTO_LINK_OMLEIDING' && !nietGevonden.ok && nietGevonden.code === 'FOTO_LINK_ONBEREIKBAAR'
      && !traag.ok && traag.code === 'FOTO_LINK_ONBEREIKBAAR' && !groot.ok && groot.code === 'FOTO_LINK_TE_GROOT' && !grootZonderKop.ok && grootZonderKop.code === 'FOTO_LINK_TE_GROOT' && gezien.length === voor,
      JSON.stringify([html, omleiding, nietGevonden, traag, groot, grootZonderKop].map((r) => (r.ok ? 'ok' : r.code))));
    const t = (code: string) => fotoLinkWeigering({ response: { data: { error: code } } });
    check('тексти відмов: кожен код — пояснення обома мовами з порадою («Пристрій»/«Apparaat» для недосяжного, «внутрішньої» для SSRF), ліміт — не про запрошення',
      /внутрішньої/.test(t('FOTO_LINK_GEWEIGERD')[0]) && /intern/.test(t('FOTO_LINK_GEWEIGERD')[1]) && /«Пристрій»/.test(t('FOTO_LINK_ONBEREIKBAAR')[0]) && /«Apparaat»/.test(t('FOTO_LINK_TE_GROOT')[1])
      && /переадрес/.test(t('FOTO_LINK_OMLEIDING')[0]) && /фото за посиланням/.test(t('RATE_LIMITED')[0]) && !/запрошен/.test(t('RATE_LIMITED')[0]) && t('ЩОСЬ_НЕВІДОМЕ')[0].length > 10);
    check('глядач (лише перегляд) може міняти власне фото й за посиланням — як і власне фото', KIJKER_EIGEN.has('POST /api/owner/profile/photo/link') && KIJKER_EIGEN.has('POST /api/owner/profile/photo'));
  }

  // ================================================================ (4) чисті правила передачі, step-up, тип сповіщення
  {
    const w = { id: 'w1', ownerUserId: 'o', name: 'Сім\'я' };
    const lid = (rol: string, extra: Record<string, unknown> = {}) => ({ id: 'm', workspaceId: 'w1', userId: 'a', email: 'a@x', permission: rol === 'viewer' ? 'viewer' : 'editor', workspaceRole: rol, status: 'active', ...extra });
    const f = (o: Partial<Parameters<typeof overdrachtFout>[0]>) => overdrachtFout({ werkruimte: w, eigenaarId: 'o', doelId: 'a', lid: lid('admin'), doelStatus: 'approved', ...o });
    check('передача (чисто): admin і member — так; viewer — OVERDRACHT_ROL; старий рядок editor без ролі = member — так',
      f({}) === '' && f({ lid: lid('member') }) === '' && f({ lid: lid('viewer') }) === 'OVERDRACHT_ROL' && f({ lid: { ...lid(''), workspaceRole: undefined } }) === '');
    check('передача (чисто): не власник, архів, технічний простір, собі, не учасник/запрошений/інший простір, неактивний обліковий запис — відмова',
      f({ eigenaarId: 'x' }) === 'WERKRUIMTE_NIET_EIGENAAR' && f({ werkruimte: { ...w, archivedAt: 5 } }) === 'WERKRUIMTE_GEARCHIVEERD' && f({ werkruimte: { ...w, ruimte: 'technisch' } }) === 'WERKRUIMTE_TECHNISCH'
      && f({ doelId: 'o' }) === 'OVERDRACHT_ZELF' && f({ lid: null }) === 'OVERDRACHT_GEEN_LID' && f({ lid: lid('admin', { status: 'invited' }) }) === 'OVERDRACHT_GEEN_LID' && f({ lid: lid('admin', { workspaceId: 'w2' }) }) === 'OVERDRACHT_GEEN_LID'
      && f({ doelStatus: 'blocked' }) === 'OVERDRACHT_ACCOUNT' && f({ doelStatus: 'deleted' }) === 'OVERDRACHT_ACCOUNT' && f({ werkruimte: null }) === 'WERKRUIMTE_NIET_GEVONDEN');
    const p = '/api/owner/identity/workspaces/abc-1/overdragen';
    check('step-up: шлях передачі → «werkruimte-overdragen», ніколи не запам\'ятовується; список кандидатів — не ця дія',
      actieVoorPad(p) === 'werkruimte-overdragen' && NOOIT_ONTHOUDEN.includes('werkruimte-overdragen') && !onthoudMagVoorPad(p) && actieVoorPad('/api/owner/identity/workspaces/overdracht/kandidaten') !== 'werkruimte-overdragen');
    const b = beschrijfStapOp(actieVoorPad(p), p);
    check('step-up: вікно «Підтвердіть доступ» називає дію й наслідок обома мовами (небезпечна)', b.bekend && b.gevaar && /Передати простір/.test(b.uk) && /overdragen/.test(b.nl) && /адміністратором/.test(b.gevolgUk) && /beheerder/.test(b.gevolgNl), JSON.stringify(b));
    check('сповіщення: новий тип у MELDING_SOORTEN (delen, важливе), сфера prive (і через префікс 0107 — без міграції), меню → hub',
      isBekendeSoort(SOORT) && MELDING_SOORTEN[SOORT].type === 'delen' && MELDING_SOORTEN[SOORT].ernst === 'belangrijk' && SFEER_PER_SOORT[SOORT] === 'prive' && sfeerVanSoort(SOORT) === 'prive' && NA_0107_VIA_VOORVOEGSEL.has(SOORT)
      && meldingDoel(SOORT).categorie === 'delen' && meldingDoel(SOORT).item === 'pg:hub/overview');
    const u = uitlegVoor({ id: SOORT, dienst: 'site', soort: SOORT, ernst: 'belangrijk', titel: 't', tijd: 0, gelezen: false } as never);
    check('сповіщення: пояснення «werkruimte-overdracht» з порадою «якщо не ви»', u.id === 'werkruimte-overdracht' && /не робили/.test(JSON.stringify(u)), u.id);
    const n = overdrachtMeldingTekst('nieuw', { wie: 'Олена / x', ruimte: 'Р\u0007' }), o = overdrachtMeldingTekst('oud', { wie: '', ruimte: 'Сім\'я' });
    check('сповіщення: тексти обома мовами з наслідком, без керівних символів і без « / » в іменах',
      /тепер ви його власник/i.test(n.tekst) && /bent nu de eigenaar/.test(n.tekst) && !/\u0007/.test(n.tekst) && !/Олена \/ x/.test(n.tekst) && /адміністратором/.test(o.tekst) && /beheerder/.test(o.tekst) && / \/ /.test(o.titel));
    check('тексти відмов передачі — у загальній таблиці (foutNaarTekst)', ['OVERDRACHT_ROL', 'OVERDRACHT_GELIJKTIJDIG', 'WERKRUIMTE_NIET_EIGENAAR', 'OVERDRACHT_GEEN_LID', 'OVERDRACHT_ACCOUNT'].every((c) => !!foutNaarTekst({ response: { data: { error: c } } })));
  }

  // ================================================================ (3) «Відкрити в просторі» (hub) і форма блоку
  {
    check('hub: ?werkruimte&blok читаються; некоректний id — немає переходу; блок необов\'язковий',
      JSON.stringify(leesOpenDoel('?werkruimte=ab-1&blok=cd_2')) === '{"werkruimte":"ab-1","blok":"cd_2"}' && leesOpenDoel('?werkruimte=a"b') === null && leesOpenDoel('') === null
      && JSON.stringify(leesOpenDoel('?werkruimte=ab&blok=<x>')) === '{"werkruimte":"ab","blok":""}');
    check('hub: після переходу параметри прибираються, інші й хеш лишаються', zonderOpenDoel('https://hub.tarasevych.com/tasks?werkruimte=a&blok=b&x=1#k') === '/tasks?x=1#k');
    const app = lees('src/App.tsx');
    check('hub: хук викликається безумовно поруч із selectedSpace, блоки мають data-blok-id', app.includes('useOpenInRuimte({ spaces, spaceId, setSpaceId, blocks })') && app.includes('data-blok-id={block.id}'));
    const c = lees('src/InstellingencentrumWeergave.tsx');
    // Центр налаштувань у node не рендериться (import.meta.glob у SessieIconen) — перевірка коду, як у identiteit-014-uitvoer.
    check('форма блоку: «Скасувати» — type=button (не надсилає), скидає ВСІ поля до початкових і повертає фокус на «Робочий простір»',
      /<button type='button' className='settings-secundair' data-widget-annuleren[^>]*onClick=\{annuleerWidget\}/.test(c) && c.includes("const annuleerWidget=()=>{setWidget({...LEGE_WIDGET});setNieuwBlok(null);werkruimteKeuze.current?.focus()}")
      && c.includes('<select ref={werkruimteKeuze} value={workspaceId}') && c.includes('useState<SettingsWidgetInput>({...LEGE_WIDGET})'));
    check('форма блоку: «Відкрити в просторі» лише після успіху з id блоку і веде в hub з ?werkruimte&blok',
      c.includes("if(typeof ok==='string'&&ok)setNieuwBlok({workspaceId,blockId:ok})") && c.includes('href={`${p.hubOrigin}/?werkruimte=${encodeURIComponent(nieuwBlok.workspaceId)}&blok=${encodeURIComponent(nieuwBlok.blockId)}`}')
      && lees('src/VerenigdDienstApp.tsx').includes("return String((toegevoegd.data as {block?:{id?:unknown}})?.block?.id||'')||true"));
    check('форма блоку: для внутрішнього блоку поле адреси пояснене («порожнє — стандартна сторінка», заміна для всіх учасників)',
      c.includes("{widget.sourceType==='internal'&&<small id='widget-url-intern'") && /Порожнє поле — блок відкриває стандартну сторінку вибраного сервісу/.test(c) && /voor alle leden van de werkruimte/.test(c));
    const pf = lees('src/identiteit/Profielfoto.tsx');
    check('діалог фото: вкладка «Без фото» з підтвердженням (BevestigDialoog id=foto-geen) і onFoto(\'geen\'); посилання — через fotoVanLink сервера',
      pf.includes('data-foto-geen') && pf.includes("id='foto-geen'") && pf.includes("await onFoto('geen')") && pf.includes('fotoVanLink ? await fotoVanLink(link.trim())') && c.includes('fotoVanLink={p.onFotoLink}') && c.includes('geenFoto={Boolean(p.user.geenFoto)}'));
    check('блок видалення: передача просторів перед поясненням; власнику сайту — чесно про OWNER_EMAIL, без обіцянки «Передайте володіння»',
      c.includes('<WerkruimteOverdragen lang={p.lang} post={p.delenPost}') && c.includes('OWNER_EMAIL у налаштуваннях сервера') && !c.includes('Передайте володіння, якщо потрібно') && !c.includes('Draag het eigendom over als dat nodig is'));
  }

  // ================================================================ маршрути проти бази
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const G = await nepGoogle({ ownerEmail: `i015pb-eig-${T}@example.test` });
  const pool = getPool();
  const oud = Math.floor(Date.now() / 1000) - 3600;
  type Browser = ReturnType<typeof G.browser>;
  type P = { b: Browser; sub: string; email: string; id: string };
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const hub = (p: P, pad: string, extra: Record<string, unknown> = {}) => p.b.verzoek('hub.tarasevych.com', pad, p.b.ctxBody('hub', extra));
  const idv = (p: P, pad: string, extra: Record<string, unknown> = {}) => p.b.verzoek('id.tarasevych.com', pad, p.b.ctxBody('identity', extra));
  const maak = async (naam: string): Promise<P> => {
    const email = `i015pb-${naam}-${T}@example.test`, b = G.browser(), sub = `i015pb-${naam}-${T}`;
    await b.aanmelden(sub, email, { intent: 'login', authTime: oud, iat: oud });
    const id = await idRij(email);
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: `Проба ${naam}` })]);
    return { b, email, id, sub };
  };
  const stapOp = async (p: P, naam: string) => {
    await p.b.aanmelden(p.sub, p.email, { intent: 'step-up' });
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [p.id, JSON.stringify({ name: naam })]);
  };
  const gebruiker = async (id: string) => (await pool.query("select data from app.records where tbl='users' and id=$1", [id])).rows[0]?.data as Record<string, any>;
  const audit = async (userId: string, action: string) => (await pool.query('select result, details from app.audit where owner_id=$1 and action=$2 order by id', [userId, action])).rows as Array<{ result: string; details: Record<string, any> }>;
  const meldingen = async (userId: string) => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'=$2 order by seq", [userId, SOORT])).rows.map((r: { data: Record<string, any> }) => r.data);
  const ws = async (id: string) => (await pool.query("select data from app.records where tbl='workspaces' and id=$1", [id])).rows[0]?.data as Record<string, any>;
  const leden = async (wsId: string, userId: string) => (await pool.query("select id, data from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'userId'=$2", [wsId, userId])).rows as Array<{ id: string; data: Record<string, any> }>;
  const lidMaken = async (wsId: string, p: P, rol: 'admin' | 'member' | 'viewer') => {
    await pool.query("insert into app.records (tbl, data) values ('workspace_members', $1::jsonb)", [JSON.stringify({ workspaceId: wsId, userId: p.id, email: p.email, permission: rol === 'viewer' ? 'viewer' : 'editor', workspaceRole: rol, scopeBlockIds: [], status: 'active', createdAt: Date.now(), updatedAt: Date.now() })]);
  };
  const blokEigenaars = async (wsId: string) => (await pool.query("select id, data->>'ownerUserId' o from app.records where tbl='workspace_blocks' and data->>'workspaceId'=$1 order by seq", [wsId])).rows as Array<{ id: string; o: string }>;

  try {
    const O = await maak('o'), A = await maak('a'), M = await maak('m'), V = await maak('v'), X = await maak('x');
    const wsId = String((await hub(O, '/api/workspace/load')).data.workspace?.id || '');
    for (const p of [A, M, V, X]) await hub(p, '/api/workspace/load');
    check('підготовка: простір O є, у ньому стандартні блоки O', !!wsId && (await blokEigenaars(wsId)).length > 0 && (await blokEigenaars(wsId)).every((b) => b.o === O.id));

    // ---------------------------------------------------------------- (1) «Без фото»
    const G_FOTO = 'https://lh3.googleusercontent.com/a/i015pb-foto';
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [O.id, JSON.stringify({ picture: G_FOTO, providerPicture: G_FOTO, customPicture: false })]);
    const geen = await idv(O, '/api/owner/profile/photo', { geenFoto: true });
    const naGeen = await gebruiker(O.id);
    check('«Без фото»: 200, у відповіді picture порожнє й geenFoto=true; у базі picture і providerPicture порожні, geenFoto=true',
      geen.status === 200 && geen.data.user?.picture === '' && geen.data.user?.geenFoto === true && naGeen.picture === '' && naGeen.providerPicture === '' && naGeen.geenFoto === true && naGeen.customPicture === false,
      `${geen.status} ${JSON.stringify(geen.data.user)} ${JSON.stringify({ p: naGeen.picture, pp: naGeen.providerPicture, g: naGeen.geenFoto })}`);
    const nogmaals = await idv(O, '/api/owner/profile/photo', { geenFoto: true });
    check('«Без фото»: повторне натискання — той самий стан (200), аудит owner.profile.photo.none записано', nogmaals.status === 200 && (await gebruiker(O.id)).geenFoto === true && (await audit(O.id, 'owner.profile.photo.none')).length === 2);
    await O.b.aanmelden(O.sub, O.email, { intent: 'login', authTime: oud, iat: oud, picture: 'https://lh3.googleusercontent.com/a/i015pb-nieuw' } /* давній auth_time: без свіжого підтвердження */);
    const naLogin = await gebruiker(O.id);
    const bootO = await hub(O, '/api/bootstrap');
    check('«Без фото»: новий вхід через Google з фото в токені фото НЕ повертає (picture і providerPicture порожні); hub віддає порожнє picture',
      naLogin.picture === '' && naLogin.providerPicture === '' && naLogin.geenFoto === true && (bootO.data.user?.picture ?? '') === '', JSON.stringify({ p: naLogin.picture, pp: naLogin.providerPicture, hub: bootO.data.user?.picture }));
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [O.id, JSON.stringify({ name: 'Проба o' })]);
    const terug = await idv(O, '/api/owner/profile/photo', { reset: true });
    const naTerug = await gebruiker(O.id);
    check('«Сервіс» → «Повернути сервісне фото» знімає «Без фото»: geenFoto=false, фото з Google-прив\'язки повертається',
      terug.status === 200 && naTerug.geenFoto === false && /i015pb-nieuw/.test(String(naTerug.picture || '')), `${terug.status} ${JSON.stringify({ p: naTerug.picture, g: naTerug.geenFoto })}`);
    // Старий запис без поля geenFoto працює як раніше (сумісність): у M поля немає — фото з Google не блокується
    await pool.query(`update app.records set data = data - 'geenFoto' || $2::jsonb where tbl='users' and id=$1`, [M.id, JSON.stringify({ picture: G_FOTO, providerPicture: G_FOTO })]);
    const bootM = await hub(M, '/api/bootstrap');
    check('сумісність: обліковий запис без поля geenFoto показує фото як раніше', bootM.data.user?.picture === G_FOTO && bootM.data.user?.geenFoto === false, JSON.stringify(bootM.data.user?.picture));

    // ---------------------------------------------------------------- (2) фото за посиланням через сервер
    zetFotoOphalerVoorTests(async () => new Response(PNG, { status: 200 }));
    const link = await idv(O, '/api/owner/profile/photo/link', { url: 'https://img.example.org/me.png' });
    check('посилання: 200 з даними PNG; сервер НЕ зберігає фото сам (picture не змінився)', link.status === 200 && link.data.mimeType === 'image/png' && Buffer.from(String(link.data.data), 'base64').equals(PNG) && (await gebruiker(O.id)).picture === naTerug.picture,
      `${link.status} ${JSON.stringify(link.data).slice(0, 200)}`);
    const opslaan = await idv(O, '/api/owner/profile/photo', { data: String(link.data.data), mimeType: 'image/png' });
    check('посилання: отримані байти приймає звичайне збереження фото (customPicture=true, geenFoto=false)', opslaan.status === 200 && (await gebruiker(O.id)).customPicture === true && (await gebruiker(O.id)).geenFoto === false);
    zetFotoOphalerVoorTests();
    const intern = await idv(O, '/api/owner/profile/photo/link', { url: 'https://169.254.169.254/latest/meta-data' });
    const http = await idv(O, '/api/owner/profile/photo/link', { url: 'http://img.example.org/me.png' });
    const auditLink = await audit(O.id, 'owner.profile.photo.link');
    check('посилання: SSRF-адреса → 400 FOTO_LINK_GEWEIGERD, http → 400 FOTO_LINK_ONGELDIG; аудит лише з хостом (без шляху)',
      intern.status === 400 && intern.data.error === 'FOTO_LINK_GEWEIGERD' && http.status === 400 && http.data.error === 'FOTO_LINK_ONGELDIG'
      && auditLink.some((r) => r.result === 'success' && r.details.host === 'img.example.org') && auditLink.some((r) => r.result === 'denied' && r.details.code === 'FOTO_LINK_GEWEIGERD') && !JSON.stringify(auditLink).includes('meta-data'),
      `${intern.status} ${intern.data.error} ${http.status} ${http.data.error}`);
    const nietGoedgekeurd = await maak('n');
    await pool.query(`update app.records set data = data || '{"status":"pending"}'::jsonb where tbl='users' and id=$1`, [nietGoedgekeurd.id]);
    const pend = await idv(nietGoedgekeurd, '/api/owner/profile/photo/link', { url: 'https://img.example.org/me.png' });
    check('посилання: не схвалений обліковий запис — 403', pend.status === 403, String(pend.status));
    zetFotoOphalerVoorTests(async () => new Response(PNG, { status: 200 }));
    let limiet = 0;
    for (let i = 0; i < 25 && !limiet; i++) { const r = await idv(X, '/api/owner/profile/photo/link', { url: 'https://img.example.org/me.png' }); if (r.status === 429) limiet = i + 1; }
    check('посилання: ліміт 20 на годину на обліковий запис — 21-й запит 429 RATE_LIMITED', limiet === 21, String(limiet));
    zetFotoOphalerVoorTests();

    // ---------------------------------------------------------------- (4) передача володіння простором
    await lidMaken(wsId, A, 'admin'); await lidMaken(wsId, M, 'member'); await lidMaken(wsId, V, 'viewer');
    await pool.query("insert into app.records (tbl, data) values ('workspace_blocks', $1::jsonb)", [JSON.stringify({ workspaceId: wsId, ownerUserId: M.id, ruimte: 'prive', kind: 'link', title: 'Блок M', description: '', url: '', visible: true, position: 99, size: 'small', custom: true })]);
    const kand = await idv(O, '/api/owner/identity/workspaces/overdracht/kandidaten');
    const mijn = ((kand.data.werkruimtes || []) as Array<{ id: string; kandidaten: Array<{ userId: string; rol: string }> }>).find((w) => w.id === wsId);
    check('кандидати: адміністратор і редактор (з роллю), глядач — ні', kand.status === 200 && !!mijn && mijn.kandidaten.some((k) => k.userId === A.id && k.rol === 'admin') && mijn.kandidaten.some((k) => k.userId === M.id && k.rol === 'member') && !mijn.kandidaten.some((k) => k.userId === V.id),
      `${kand.status} ${JSON.stringify(kand.data).slice(0, 300)}`);
    const pad = `/api/owner/identity/workspaces/${wsId}/overdragen`;
    const vreemd = await idv(X, pad, { nieuweEigenaarId: X.id });
    const lidZelf = await idv(A, pad, { nieuweEigenaarId: A.id });
    check('права на сервері: чужий (X) і навіть адміністратор простору (A) — 403 WERKRUIMTE_NIET_EIGENAAR без запиту підтвердження; власник не змінився',
      vreemd.status === 403 && vreemd.data.error === 'WERKRUIMTE_NIET_EIGENAAR' && lidZelf.status === 403 && lidZelf.data.error === 'WERKRUIMTE_NIET_EIGENAAR' && (await ws(wsId)).ownerUserId === O.id);
    const zonder = await idv(O, pad, { nieuweEigenaarId: A.id });
    check('step-up: власник без свіжого підтвердження → 403 STEP_UP_REQUIRED, нічого не змінено', zonder.status === 403 && zonder.data.reasonCode === 'STEP_UP_REQUIRED' && (await ws(wsId)).ownerUserId === O.id, `${zonder.status} ${JSON.stringify(zonder.data)}`);
    await stapOp(O, 'Проба o');
    const naarKijker = await idv(O, pad, { nieuweEigenaarId: V.id });
    const naarVreemde = await idv(O, pad, { nieuweEigenaarId: X.id });
    check('після підтвердження: глядачеві — 400 OVERDRACHT_ROL, не учасникові — 400 OVERDRACHT_GEEN_LID; відмову записано в аудит',
      naarKijker.status === 400 && naarKijker.data.error === 'OVERDRACHT_ROL' && naarVreemde.status === 400 && naarVreemde.data.error === 'OVERDRACHT_GEEN_LID' && (await audit(O.id, 'owner.identity.workspace.transfer')).filter((r) => r.result === 'denied' && ['OVERDRACHT_ROL', 'OVERDRACHT_GEEN_LID'].includes(r.details.code)).length === 2
      && (await audit(X.id, 'owner.identity.workspace.transfer')).some((r) => r.result === 'denied' && r.details.code === 'WERKRUIMTE_NIET_EIGENAAR'), `${naarKijker.status} ${naarKijker.data.error} ${naarVreemde.status} ${naarVreemde.data.error}`);
    const goed = await idv(O, pad, { nieuweEigenaarId: A.id });
    await new Promise((r) => setTimeout(r, 100));
    const naWs = await ws(wsId), blokken = await blokEigenaars(wsId);
    const oLid = await leden(wsId, O.id), aLid = await leden(wsId, A.id);
    check('передача: 200; власник — A, overgedragenVan — O; блоки O тепер у A, блок M лишився в M',
      goed.status === 200 && goed.data.alOverdragen === false && naWs.ownerUserId === A.id && naWs.overgedragenVan === O.id && blokken.filter((b) => b.o === O.id).length === 0 && blokken.filter((b) => b.o === M.id).length === 1 && blokken.filter((b) => b.o === A.id).length >= 1,
      `${goed.status} ${JSON.stringify(goed.data)} ${JSON.stringify(blokken)}`);
    check('передача: рядок учасника A прибрано; O — один активний рядок «Адміністратор»', aLid.length === 0 && oLid.length === 1 && oLid[0].data.workspaceRole === 'admin' && oLid[0].data.status === 'active', JSON.stringify({ aLid, oLid }));
    const laadO = await hub(O, '/api/workspace/load', { workspaceId: wsId }), laadA = await hub(A, '/api/workspace/load', { workspaceId: wsId });
    check('передача: у hub A бачить простір як власник, O — як адміністратор', laadA.data.workspaceRole === 'owner' && laadO.data.workspaceRole === 'admin', `${laadA.data.workspaceRole} ${laadO.data.workspaceRole}`);
    const mA = await meldingen(A.id), mO = await meldingen(O.id);
    check('сповіщення обом: A — «Вам передано…» з іменем O; O — «Ви передали…»; особиста сфера',
      mA.length === 1 && /Проба o/.test(mA[0].message) && /власник/.test(mA[0].message) && mO.length === 1 && /Проба a/.test(mO[0].message) && mA[0].ruimte !== 'technisch', JSON.stringify([mA, mO]).slice(0, 500));
    check('аудит обом: transfer (success, кількість блоків) у O і received у A', (await audit(O.id, 'owner.identity.workspace.transfer')).some((r) => r.result === 'success' && r.details.naar === A.id && Number(r.details.blokken) >= 1) && (await audit(A.id, 'owner.identity.workspace.received')).some((r) => r.details.van === O.id));
    // повторне натискання
    const weer = await idv(O, pad, { nieuweEigenaarId: A.id });
    check('повторне натискання: 200 alOverdragen=true, без нових сповіщень і без дубля рядка O', weer.status === 200 && weer.data.alOverdragen === true && (await meldingen(A.id)).length === 1 && (await meldingen(O.id)).length === 1 && (await leden(wsId, O.id)).length === 1);
    // перервана спроба: доведення не відбулося (рядок A повернувся, блок знову в O)
    await lidMaken(wsId, A, 'admin');
    await pool.query("update app.records set data = data || jsonb_build_object('ownerUserId', $2::text) where tbl='workspace_blocks' and id=$1", [blokken.find((b) => b.o === A.id)!.id, O.id]);
    const herstel = await idv(O, pad, { nieuweEigenaarId: A.id });
    check('перервана спроба: повтор доводить кроки — рядок A знову прибрано, блок O знову в A, сповіщень не додалося',
      herstel.status === 200 && herstel.data.alOverdragen === true && (await leden(wsId, A.id)).length === 0 && (await blokEigenaars(wsId)).every((b) => b.o !== O.id) && (await meldingen(A.id)).length === 1);
    const kandNa = await idv(O, '/api/owner/identity/workspaces/overdracht/kandidaten');
    check('після передачі простір більше не серед «ваших» у списку для передачі', !((kandNa.data.werkruimtes || []) as Array<{ id: string }>).some((w) => w.id === wsId));
    // новий власник не може «повернути» простір через маршрут O: O тепер не власник
    const terugO = await idv(O, pad, { nieuweEigenaarId: O.id });
    check('O більше не власник: спроба передати знову (собі) — 403 WERKRUIMTE_NIET_EIGENAAR', terugO.status === 403 && terugO.data.error === 'WERKRUIMTE_NIET_EIGENAAR');

    // одночасні запити: два різні нові власники — виграє один
    const ws2 = (await pool.query("insert into app.records (tbl, data) values ('workspaces', $1::jsonb) returning id", [JSON.stringify({ ownerUserId: O.id, ruimte: 'prive', name: 'Друга', createdAt: Date.now(), updatedAt: Date.now() })])).rows[0].id as string;
    const lidA2 = { ...A }, lidM2 = { ...M };
    await lidMaken(ws2, lidA2, 'admin'); await lidMaken(ws2, lidM2, 'member');
    const pad2 = `/api/owner/identity/workspaces/${ws2}/overdragen`;
    const [r1, r2] = await Promise.all([idv(O, pad2, { nieuweEigenaarId: A.id }), idv(O, pad2, { nieuweEigenaarId: M.id })]);
    await new Promise((r) => setTimeout(r, 100));
    const winnaar = r1.status === 200 ? A : M, ander = r1.status === 200 ? r2 : r1;
    const naWs2 = await ws(ws2);
    const meldWs2 = (await meldingen(winnaar.id)).filter((m) => String(m.message).includes('Друга'));
    check('одночасно: один 200, інший 409 OVERDRACHT_GELIJKTIJDIG або 403 (уже не власник); власник — переможець, одне сповіщення',
      [r1.status, r2.status].filter((s) => s === 200).length === 1 && (ander.status === 409 || ander.status === 403) && naWs2.ownerUserId === winnaar.id && meldWs2.length === 1,
      `${r1.status} ${r2.status} ${JSON.stringify(r1.data)} ${JSON.stringify(r2.data)}`);
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    zetFotoOphalerVoorTests();
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i015pb-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await pool.query("delete from app.records where tbl in ('workspace_members','workspace_blocks') and data->>'workspaceId' in (select id from app.records where tbl='workspaces' and (data->>'ownerUserId' = any($1) or data->>'overgedragenVan' = any($1)))", [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    }
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);
  return einde();
}
