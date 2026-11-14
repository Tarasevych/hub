// IDENTITEIT-014 (фаза 3, крок «herstel» — виправлення знахідок рецензії, 14.11.2026). Кожна знахідка має тут перевірку, що
// її відтворює на СПРАВЖНІЙ поведінці (чисті функції, справжні маршрути backend/index.ts проти одноразової бази й підробленого
// Google, хук + список у справжньому Chrome):
//   1) тексти більше не обіцяють сповіщення, якого сервер не шле (адреса без облікового запису, запрошений без входу);
//   2) запрошення на адресу від відкликаного учасника не активується (як посилання: uitnodigerMagNogDelen);
//   3) у старій панелі «Вхід» — один стан Telegram; каталог із назвами ключів — лише власнику сайту;
//   4) нагадування про коди веде туди, де коди є: /recovery#aanmeldmethoden-herstel, текст «Відновлення»;
//   5) зміна ролі в списку — лише після вікна (стрілка в <select> більше не шле POST);
//   6) приватне посилання — вікно з наслідками, запис у центрі сповіщень (сервер) і повідомлення (клієнт);
//   7) «Надіслати знову» — з обсягом початкового запрошення, а вікно називає обсяг;
//   дрібні: workspace_share «uk / nl»; ім'я в nl-частині в «» (інакше центр не ділить текст із кириличним ім'ям);
//   адреса автора дії замаскована для того, кого понизили до «Перегляду» чи вилучили; відкликаний набір кодів ≠ «закінчилися»;
//   посилання-запрошення приховане від AI-розширення (одиниці «Б/КБ/МБ» — у identiteit-014-uitvoer.test.ts).
// Herstel van de bevindingen van de review: elk punt met een test op echt gedrag. Alleen verzonnen gegevens; niets gaat naar buiten.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-014-herstel-recensie.test.ts
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import * as delen from '../../backend/werkruimte-delen';
import { RESERVE_LINK, reserveTekst } from '../../backend/reserve-herinnering';
import { LINK_GEMAAKT, MELDING_PER_ADRES, PER_ADRES_GELUKT, bereikTekst, beheerderMakenVraag, linkMakenVraag, rolGewijzigdTekst, rolWijzigenVraag, toegangGevenVraag } from '../../src/delen/delen-logica';
import { MELDING_SOORTEN, isBekendeSoort } from '../../shared/melding-soorten';
import { NA_0107_VIA_VOORVOEGSEL, SFEER_PER_SOORT, sfeerVanSoort } from '../../shared/meldingen-soorten';
import { uitlegVoor } from '../../shared/meldingen-v2/uitleg-register';
import { meldingDoel } from '../../shared/menu-meldingen';
import { snapshotNaarKaarten } from '../../src/aanmeld-vnext/snapshotNaarKaarten';
import { codesOp } from '../../src/herstel/reserve';
import { AccessPlanePanels, naarSectie } from '../../src/toegangslaag-panelen';
import { AndereMethodenWeergave } from '../../src/AndereAanmeldMethoden';

const kyr = /[А-Яа-яІіЇїЄєҐґ]/;
const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-014-herstel-recensie');
  const { taalDeel } = await import('../../src/canoniek-meldingen');

  // ================================================================ 1) чесні тексти про сповіщення (клієнт)
  {
    const v = toegangGevenVraag('uk', { email: 'nieuw@example.test', ruimte: 'Сім’я', keuze: 'viewer' });
    const vNl = toegangGevenVraag('nl', { email: 'nieuw@example.test', ruimte: 'Werk', keuze: 'editor', blokken: 2 });
    check('1: вікно «Надати доступ?» більше не обіцяє сповіщення безумовно — каже, що без облікового запису сайт нікого не сповіщає',
      !v.gevolgen.some((g) => /^Людина отримає сповіщення/.test(g)) && v.gevolgen.includes(MELDING_PER_ADRES[0]) && /нікого не сповіщає/.test(MELDING_PER_ADRES[0]) && vNl.gevolgen.includes(MELDING_PER_ADRES[1]) && !kyr.test(vNl.gevolgen.join(' ')),
      JSON.stringify(v.gevolgen));
    check('1: повідомлення після «Надати доступ» — умовне (лише наявний обліковий запис), однакове в hub і центрі',
      /лише наявний обліковий запис/.test(PER_ADRES_GELUKT[0]) && /bestaand account/.test(PER_ADRES_GELUKT[1]) && !/Людина отримає сповіщення/.test(PER_ADRES_GELUKT[0])
      && lees('src/VerenigdDienstApp.tsx').includes('say(PER_ADRES_GELUKT[0],PER_ADRES_GELUKT[1])') && !lees('src/VerenigdDienstApp.tsx').includes('Людина отримає сповіщення') && !lees('src/delen/useDelen.ts').includes('Людина отримає сповіщення'));
    check('1: зміна ролі — сповіщення обіцяно лише активному учаснику; запрошеному — «сповіщення немає»',
      /отримає сповіщення/.test(rolGewijzigdTekst(true)[0]) && /Сповіщення немає/.test(rolGewijzigdTekst(false)[0]) && /geen melding/.test(rolGewijzigdTekst(false)[1]));
    const adminUit = beheerderMakenVraag('uk', 'x@example.test', false), adminAan = beheerderMakenVraag('uk', 'x@example.test', true);
    check('1: «Зробити адміністратором?» для запрошеного без входу не каже «Людина отримає сповіщення»',
      !adminUit.gevolgen.some((g) => /отримає сповіщення/.test(g)) && adminUit.gevolgen.some((g) => /сповіщення не буде/.test(g)) && adminAan.gevolgen.some((g) => /отримає сповіщення/.test(g)));
  }

  // ================================================================ 5) кожна зміна ролі — вікно з наслідками
  {
    const omlaag = rolWijzigenVraag('uk', { email: 'l@example.test', van: 'member', naar: 'viewer', actief: true });
    const omhoog = rolWijzigenVraag('nl', { email: 'l@example.test', van: 'viewer', naar: 'member', actief: false });
    const beheer = rolWijzigenVraag('uk', { email: 'l@example.test', van: 'viewer', naar: 'admin', actief: true });
    check('5: зниження до «Перегляду» — небезпечне вікно, називає перехід ролей і що блоки переходять власнику',
      omlaag.gevaarlijk && /«Редагування» → «Перегляд»/.test(omlaag.uitleg) && omlaag.gevolgen.some((g) => /переходять власнику/.test(g)) && omlaag.gevolgen.some((g) => /отримає сповіщення/.test(g)), JSON.stringify(omlaag));
    check('5: підвищення запрошеного до «Редагування» — не небезпечне, нідерландською, без обіцянки сповіщення',
      !omhoog.gevaarlijk && /«Lezen» → «Bewerken»/.test(omhoog.uitleg) && omhoog.gevolgen.some((g) => /geen melding/.test(g)) && !kyr.test(omhoog.gevolgen.join(' ')));
    check('5: «Адміністратор» — небезпечне вікно (той самий текст, що «Зробити адміністратором?»)', beheer.gevaarlijk && beheer.titel === 'Зробити адміністратором?');
    const lijst = lees('src/delen/LedenLijst.tsx');
    check('5: у списку select лише відкриває вікно (жодного p.onRol прямо в onChange); вікна deel-rol-beheerder і deel-rol-wijzigen',
      !/onChange=\{[^}]*p\.onRol/.test(lijst) && lijst.includes("id='deel-rol-beheerder'") && lijst.includes("id='deel-rol-wijzigen'"));
  }

  // ================================================================ 6) посилання: вікно, повідомлення, запис у центрі
  {
    const a = linkMakenVraag('uk', { ruimte: 'Сім’я', keuze: 'admin' }), k = linkMakenVraag('nl', { ruimte: 'Werk', keuze: 'viewer', blokken: 3 });
    check('6: вікно «Створити посилання-запрошення?» — хто першим відкриє, 7 днів, обсяг; «Адміністратор» небезпечний і з step-up',
      a.gevaarlijk && /«Адміністратор»/.test(a.uitleg) && a.gevolgen.some((g) => /першим відкриє/.test(g)) && a.gevolgen.some((g) => /7 днів/.test(g)) && a.gevolgen.some((g) => /підтвердити, що це ви/.test(g))
      && !k.gevaarlijk && k.gevolgen.includes(bereikTekst('nl', 3)) && !kyr.test(k.gevolgen.join(' ')), JSON.stringify(a));
    const app = lees('src/App.tsx'), centrum = lees('src/InstellingencentrumWeergave.tsx');
    check('6: hub і центр — кнопка «Створити» відкриває вікно deel-link-maken, а не створює посилання одразу',
      app.includes("onClick={()=>setLinkVraag(true)}><Link2/>") && app.includes("id='deel-link-maken'") && !app.includes('onClick={()=>void createLink()}')
      && centrum.includes("<button onClick={()=>setLinkVraag(true)} disabled={!magDelenHier") && centrum.includes("id='deel-link-maken'") && !centrum.includes('onClick={()=>void createLink()}'));
    check('6: посилання (одноразовий секрет) приховане від AI-розширення в hub і центрі (verborgenVoorAi)',
      app.includes('<input value={delen.link} readOnly {...verborgenVoorAi}/>') && centrum.includes('<input readOnly value={shareLink} {...verborgenVoorAi}/>'));
    check('6: новий тип workspace_share_link_created — у MELDING_SOORTEN, сферах (prive, правило префікса), меню і з власним поясненням',
      isBekendeSoort('workspace_share_link_created') && MELDING_SOORTEN.workspace_share_link_created.type === 'delen' && SFEER_PER_SOORT.workspace_share_link_created === 'prive'
      && sfeerVanSoort('workspace_share_link_created') === 'prive' && NA_0107_VIA_VOORVOEGSEL.has('workspace_share_link_created') && meldingDoel('workspace_share_link_created').categorie === 'delen'
      && uitlegVoor({ id: 'x', dienst: 'site', soort: 'workspace_share_link_created', ernst: 'info', titel: 't', tijd: 0, gelezen: false } as never).id === 'delen-link');
  }

  // ================================================================ 7) обсяг у вікні
  check('7: обсяг словами — увесь простір (і майбутні блоки) або лише N блоків',
    /увесь простір/.test(bereikTekst('uk', 0)) && /пізніше/.test(bereikTekst('uk')) && /лише вибрані блоки \(2\)/.test(bereikTekst('uk', 2)) && /alleen de gekozen blokken \(2\)/.test(bereikTekst('nl', 2))
    && toegangGevenVraag('uk', { email: 'a@b.test', ruimte: 'Р', keuze: 'viewer', blokken: 2 }).gevolgen.includes(bereikTekst('uk', 2)));

  // ================================================================ сповіщення: тексти (сервер, чисті функції)
  {
    const s = delen.deelMeldingTekst('workspace_share', { wie: 'Олена', ruimte: 'Сім’я', nieuw: 'member' });
    check('дрібне: workspace_share тепер «uk / nl» з простором і роллю (раніше лише українською)',
      / \/ /.test(s.titel) && /Олена надав вам доступ до простору «Сім’я» з роллю «Редагування»/.test(s.tekst) && /gaf u toegang tot de werkruimte «Сім’я» als «Bewerken»/.test(s.tekst), JSON.stringify(s));
    const r = delen.deelMeldingTekst('workspace_role_changed', { wie: 'Олена', ruimte: 'Сім’я', oud: 'member', nieuw: 'viewer' });
    check('давня вада фази 3: кириличне ім\'я в nl-частині тепер у «» — центр сповіщень ділить текст за мовою (раніше показував обидві)',
      taalDeel(r.tekst, 'nl').startsWith('«Олена» wijzigt') && !/змінює/.test(taalDeel(r.tekst, 'nl')) && taalDeel(r.tekst, 'uk').startsWith('Олена змінює') && taalDeel(s.tekst, 'nl').startsWith('«Олена» gaf u'),
      taalDeel(r.tekst, 'nl').slice(0, 80));
    check('дрібне: «/» з пробілами в імені не ламає поділ «uk / nl»', !/ \/ /.test(delen.deelMeldingTekst('workspace_access_revoked', { wie: 'А / Б', ruimte: 'X' }).tekst.split(' / ')[0]));
    check('дрібне: deelWie — ім\'я; без імені адреса; для пониженого/вилученого — замаскована',
      delen.deelWie({ name: 'Олена', email: 'o@x.test' }, true) === 'Олена' && delen.deelWie({ email: 'olena@x.test' }) === 'olena@x.test' && delen.deelWie({ email: 'olena@x.test' }, true) === 'o***@x.test');
    const l = delen.deelMeldingTekst('workspace_share_link_created', { wie: '', ruimte: 'Р', nieuw: 'admin' });
    check('6: текст «Створено посилання-запрошення» — одноразове, 7 днів, «якщо це були не ви», обома мовами', /одноразове/.test(l.tekst) && /7 днів/.test(l.tekst) && /не ви/.test(l.tekst) && /eenmalige/.test(l.tekst) && /«Адміністратор»/.test(l.tekst));
  }

  // ================================================================ 4) нагадування про коди — куди веде
  {
    const kaart = uitlegVoor({ id: 'x', dienst: 'site', soort: 'access_recovery_low', ernst: 'belangrijk', titel: 't', tijd: 0, gelezen: false } as never);
    const actie = kaart.acties.find((a) => a.soort === 'wijziging');
    const hash = new URL(RESERVE_LINK).hash.slice(1), pad = new URL(RESERVE_LINK).pathname;
    // Справжня прокрутка панелі: naarSectie('recovery') шукає той самий id, що в посиланні.
    const gezocht: string[] = [];
    const doc = { getElementById: (id: string) => { gezocht.push(id); return null; }, querySelectorAll: () => [] } as never;
    naarSectie(pad.slice(1), doc);
    check('4: посилання сповіщення й картки — /recovery#aanmeldmethoden-herstel; саме цей id шукає прокрутка розділу «Відновлення»',
      RESERVE_LINK === 'https://id.tarasevych.com/recovery#aanmeldmethoden-herstel' && actie?.href?.({} as never) === RESERVE_LINK && gezocht[0] === hash && hash === 'aanmeldmethoden-herstel', `${RESERVE_LINK} ${gezocht.join(',')}`);
    const basis = (alleen: 'recovery' | 'methods') => renderToStaticMarkup(createElement(AccessPlanePanels, {
      alleen, tab: alleen, lang: 'uk', busy: false, notice: '', password: '', setPassword: () => {}, otpauth: '', secret: '', code: '', setCode: () => {}, recovery: [], tempPassword: '', context: {},
      write: async () => {}, load: async () => {}, nieuweHerstelcodes: async () => {}, totpUitschakelen: async () => {}, recoverySaved: async () => {},
      data: { architecture: 'access-plane-v1', contour: { clientId: '', redirectUri: '', credentialsConfigured: true, source: '', hasVaultOverride: false, hasPlatformSecret: false, missing: [], lockProtected: false, updatedAt: 0 }, policy: { enabled: {}, mfa: 'optional' }, methods: [{ id: 'google', enabled: true, configured: true, status: 'active' }], factors: [{ id: 'recovery', enabled: true, enrolled: true, status: 'active', remaining: 2, createdAt: 1 }], bindings: [], usableCount: 1, lockout: { protected: false, reason: '' }, password: { configured: false, mustChange: false }, totp: { enrolled: false } },
    } as never));
    check('4: на сторінці облікового запису (alleen) розділ «Відновлення» має id aanmeldmethoden-herstel, а «Способи входу» — ні',
      basis('recovery').includes(`id="${hash}"`) && !basis('methods').includes(`id="${hash}"`));
    const t = reserveTekst(2);
    check('4: текст радить розділ «Відновлення» / «Herstel», а не «Способи входу»', /у розділі «Відновлення»/.test(t.tekst) && /bij «Herstel»/.test(t.tekst) && !/Способах входу/.test(t.tekst));
    check('давня вада поруч: сповіщення «Використано код відновлення» теж вело на мертвий #herstel', !lees('backend/nieuw-apparaat.ts').includes('methods#herstel') && lees('backend/nieuw-apparaat.ts').includes(RESERVE_LINK));
  }

  // ================================================================ дрібне: відкликаний набір кодів ≠ «закінчилися»
  {
    const snap = (extra: Record<string, unknown>) => ({ methods: [], bindings: [], lockout: { protected: false, reason: '' }, factors: [{ id: 'recovery', enabled: true, enrolled: false, status: 'not_enrolled', remaining: 0, createdAt: 1700000000000, ...extra }] }) as never;
    const kaart = (s: never) => snapshotNaarKaarten(s, 'uk').find((k) => k.id === 'recovery') as { waarschuwingCode?: string; staat: string } | undefined;
    check('дрібне: використаний набір — «Коди закінчилися» (RECOVERY_EMPTY) і codesOp; відкликаний — ні',
      kaart(snap({}))?.waarschuwingCode === 'RECOVERY_EMPTY' && codesOp(snap({})) && !kaart(snap({ ingetrokken: true }))?.waarschuwingCode && !codesOp(snap({ ingetrokken: true })),
      JSON.stringify([kaart(snap({})), kaart(snap({ ingetrokken: true }))]));
  }

  // ================================================================ 3) Telegram і каталог у старій панелі
  {
    const html = (admin: boolean) => renderToStaticMarkup(createElement(AccessPlanePanels, {
      alleen: 'methods', tab: 'methods', lang: 'uk', busy: false, notice: '', password: '', setPassword: () => {}, otpauth: '', secret: '', code: '', setCode: () => {}, recovery: [], tempPassword: '', context: {},
      write: async () => {}, load: async () => {}, nieuweHerstelcodes: async () => {}, totpUitschakelen: async () => {}, recoverySaved: async () => {},
      data: { admin, architecture: 'access-plane-v1', contour: { clientId: '', redirectUri: '', credentialsConfigured: true, source: '', hasVaultOverride: false, hasPlatformSecret: false, missing: [], lockProtected: false, updatedAt: 0 }, policy: { enabled: {}, mfa: 'optional' }, methods: [{ id: 'google', enabled: true, configured: true, status: 'active' }], factors: [], bindings: [], usableCount: 1, lockout: { protected: false, reason: '' }, password: { configured: false, mustChange: false }, totp: { enrolled: false } },
    } as never));
    check('3: каталог провайдерів (назви ключів сервера, самотест) — лише власнику сайту; звичайний учасник його не отримує',
      !html(false).includes('class="amv"') && html(true).includes('class="amv"') && html(false).includes('id="aanmeldmethoden-catalogus"'));
    check('3: каталог у старій панелі — без плитки Telegram (zonder), бо живий стан Telegram уже на сторінці',
      lees('src/toegangslaag-panelen.tsx').includes("zonder={['telegram']}") && lees('src/aanmeld-vnext/onderdelen/AanbiederCatalogus.tsx').includes('AANMELD_AANBIEDERS.filter((a) => !zonder.includes(a.id))'));
    const aan = { zichtbaar: true, bot: 'x', botId: '1', stand: 'werkt', soort: 'x', status: { stand: 'werkt', soort: 'x' }, plaatsing: null } as never;
    const metSectie = renderToStaticMarkup(createElement(AndereMethodenWeergave, { lang: 'uk', admin: false, telegramSectie: true, cfg: aan }));
    const zonderSectie = renderToStaticMarkup(createElement(AndereMethodenWeergave, { lang: 'nl', admin: false, telegramSectie: false, cfg: aan }));
    check('3: з повним розділом «Telegram» рядок не показує другий стан — лише посилання на розділ і кнопку; без розділу стан лишається',
      !metSectie.includes('Працює') && !metSectie.includes('access-plane-badge') && metSectie.includes('data-telegram-verwijzing') && metSectie.includes('Налаштувати Telegram') && zonderSectie.includes('data-telegram-stand="werkt"'));
  }

  // дрібне «одиниці розміру Б/КБ/МБ» перевіряє tests/eenheid/identiteit-014-uitvoer.test.ts: там уже є середовище window для Gegevensuitvoer.

  // ================================================================ маршрути проти бази
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const G = await nepGoogle({ ownerEmail: `i014h-eig-${T}@example.test` });
  const pool = getPool();
  const oud = Math.floor(Date.now() / 1000) - 3600;
  type Browser = ReturnType<typeof G.browser>;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const hub = ({ b }: { b: Browser }, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('hub.tarasevych.com', pad, b.ctxBody('hub', extra));
  const maak = async (naam: string) => {
    const email = `i014h-${naam}-${T}@example.test`, b = G.browser(), sub = `i014h-${naam}-${T}`;
    await b.aanmelden(sub, email, { intent: 'login', authTime: oud, iat: oud });
    const id = await idRij(email);
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: `Проба ${naam}` })]);
    return { b, email, id, sub };
  };
  const meldingen = async (userId: string, kind: string) => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'=$2 order by seq", [userId, kind])).rows.map((r: { data: Record<string, any> }) => r.data);
  const lidRij = async (ws: string, email: string) => (await pool.query("select id, data->>'status' s, data->>'userId' u from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'email'=$2", [ws, email])).rows[0] as { id: string; s: string; u: string } | undefined;
  const auditRij = async (accountId: string, event: string) => (await pool.query("select data->'details' d from app.records where tbl='security_audit' and data->>'accountId'=$1 and data->>'event'=$2 order by seq desc limit 1", [accountId, event])).rows[0]?.d as Record<string, unknown> | undefined;
  const wacht = () => new Promise((r) => setTimeout(r, 200));
  const { emailZichtbaarheidVoorTests } = await import('../../backend/index');
  const activeer = async (id: string) => { const [rij] = (await pool.query("select id, data from app.records where tbl='users' and id=$1", [id])).rows; await emailZichtbaarheidVoorTests.activateInvites({ ...rij.data, id: rij.id } as never); };

  try {
    const O = await maak('o'), A = await maak('a'), K = await maak('k'), M = await maak('m');
    const ws = String((await hub(O, '/api/workspace/load')).data.workspace?.id || '');
    for (const p of [A, K, M]) await hub(p, '/api/workspace/load');
    check('підготовка: простір власника', !!ws);

    // ---- 1) сервер: адреса без облікового запису — жодного сповіщення (тому текст і не обіцяє)
    const geenAccount = `i014h-geen-${T}@example.test`;
    const zonderAcc = await hub(O, '/api/share/email', { workspaceId: ws, email: geenAccount, workspaceRole: 'viewer' });
    await wacht();
    const allesVoorAdres = (await pool.query("select count(*)::int n from app.records where tbl='site_notifications' and data->>'recipientEmail'=$1", [geenAccount])).rows[0]?.n ?? 0;
    check('1: сервер — адреса без облікового запису: 200 {status:invited}, сповіщень немає (інтерфейс тепер це й каже)', zonderAcc.status === 200 && zonderAcc.data.status === 'invited' && allesVoorAdres === 0, `${zonderAcc.status} ${allesVoorAdres}`);

    // ---- workspace_share тепер «uk / nl»
    const deelK = await hub(O, '/api/share/email', { workspaceId: ws, email: K.email, workspaceRole: 'member' });
    await wacht();
    const share = (await meldingen(K.id, 'workspace_share')).at(-1);
    check('дрібне: workspace_share для наявного облікового запису — «uk / nl», ім\'я, простір і роль; центр показує лише мову сайту',
      deelK.status === 200 && !!share && / \/ /.test(share.title) && /Проба o надав вам доступ до простору/.test(share.message) && /«Проба o» gaf u toegang/.test(share.message) && /«Bewerken»/.test(share.message)
      && taalDeel(share.message, 'nl').startsWith('«Проба o» gaf u') && !/надав/.test(taalDeel(share.message, 'nl')), JSON.stringify(share));

    // ---- 6) посилання: запис у центрі сповіщень автора + аудит
    const link = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer' });
    await wacht();
    const linkM = await meldingen(O.id, 'workspace_share_link_created');
    check('6: створене посилання — сповіщення автору (workspace_share_link_created, «uk / nl», роль) і аудит',
      link.status === 200 && !!link.data.code && linkM.length === 1 && /«Перегляд»/.test(linkM[0].message) && /«Lezen»/.test(linkM[0].message) && !String(linkM[0].message).includes(String(link.data.code)) && !!(await auditRij(O.id, 'workspace_share_link_created')),
      `${link.status} ${JSON.stringify(linkM)}`);

    // ---- 7) обсяг: /api/share/members дає scopeBlockIds тому, хто ділиться (для «Надіслати знову»), але не глядачу
    const blok = `i014h-blok-${T}`;
    await pool.query("insert into app.records (tbl,id,data) values ('workspace_blocks',$1,$2)", [blok, { workspaceId: ws, title: 'Блок', ownerUserId: O.id }]);
    const beperkt = `i014h-beperkt-${T}@example.test`;
    const beperktUit = await hub(O, '/api/share/email', { workspaceId: ws, email: beperkt, workspaceRole: 'viewer', scopeBlockIds: [blok] });
    const ledenO = ((await hub(O, '/api/share/members', { workspaceId: ws })).data.members || []) as Array<{ email: string; scopeBlockIds?: string[] }>;
    const deelM = await hub(O, '/api/share/email', { workspaceId: ws, email: M.email, workspaceRole: 'viewer' });
    const ledenM = ((await hub(M, '/api/share/members', { workspaceId: ws })).data.members || []) as Array<{ scopeBlockIds?: string[] }>;
    check('7: «Хто має доступ» для власника містить обсяг обмеженого запрошення; глядач обсягів не бачить',
      beperktUit.status === 200 && deelM.status === 200 && JSON.stringify(ledenO.find((l) => l.email === beperkt)?.scopeBlockIds) === JSON.stringify([blok]) && ledenM.length > 0 && ledenM.every((l) => !l.scopeBlockIds),
      JSON.stringify(ledenO.map((l) => [l.email.slice(0, 18), l.scopeBlockIds])));
    const opnieuw = await hub(O, '/api/share/email', { workspaceId: ws, email: beperkt, workspaceRole: 'viewer', scopeBlockIds: ledenO.find((l) => l.email === beperkt)?.scopeBlockIds || [] });
    const naOpnieuw = (await pool.query("select data->'scopeBlockIds' s from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'email'=$2", [ws, beperkt])).rows[0]?.s;
    check('7: повторне запрошення з обсягом зі списку зберігає обмеження (не розширює до всього простору)', opnieuw.status === 200 && JSON.stringify(naOpnieuw) === JSON.stringify([blok]), JSON.stringify(naOpnieuw));

    // ---- дрібне: власник без імені знижує/вилучає — адреса замаскована
    await pool.query(`update app.records set data = data - 'name' where tbl='users' and id=$1`, [O.id]);
    const kLid = await lidRij(ws, K.email);
    const omlaag = await hub(O, '/api/share/role', { workspaceId: ws, memberId: kLid?.id, workspaceRole: 'viewer' });
    await wacht();
    const naarKijker = (await meldingen(K.id, 'workspace_role_changed')).at(-1);
    const masker = delen.emailMaskeren(O.email);
    check('дрібне: понижений до «Перегляду» бачить замасковану адресу автора (як у списку учасників), не повну',
      omlaag.status === 200 && !!naarKijker && naarKijker.message.includes(masker) && !naarKijker.message.includes(O.email), JSON.stringify(naarKijker));
    const weg = await hub(O, '/api/share/revoke', { workspaceId: ws, memberId: kLid?.id });
    await wacht();
    const ingetrokken = (await meldingen(K.id, 'workspace_access_revoked')).at(-1);
    check('дрібне: вилучений бачить замасковану адресу автора', weg.status === 200 && !!ingetrokken && ingetrokken.message.includes(masker) && !ingetrokken.message.includes(O.email), JSON.stringify(ingetrokken));
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [O.id, JSON.stringify({ name: 'Проба o' })]);

    // ---- 2) запрошення від відкликаного учасника не активується
    const deelA = await hub(O, '/api/share/email', { workspaceId: ws, email: A.email, workspaceRole: 'member' });
    // учасник з роллю «Редагування» ділитися не може — робимо A адміністратором напряму в базі (step-up тут не предмет перевірки)
    await pool.query("update app.records set data = data || '{\"workspaceRole\":\"admin\",\"permission\":\"editor\"}'::jsonb where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'userId'=$2", [ws, A.id]);
    const nA = `i014h-na-${T}@example.test`, nO = `i014h-no-${T}@example.test`;
    const vanA = await hub(A, '/api/share/email', { workspaceId: ws, email: nA, workspaceRole: 'member' });
    const vanO = await hub(O, '/api/share/email', { workspaceId: ws, email: nO, workspaceRole: 'member' });
    const aLid = await lidRij(ws, A.email);
    const aWeg = await hub(O, '/api/share/revoke', { workspaceId: ws, memberId: aLid?.id });
    check('2: підготовка — A (адміністратор) запросив адресу без облікового запису; власник відкликав A',
      deelA.status === 200 && vanA.status === 200 && vanO.status === 200 && aWeg.status === 200 && (await lidRij(ws, nA))?.s === 'invited', `${deelA.status} ${vanA.status} ${vanO.status} ${aWeg.status}`);
    // обидві адреси реєструються (status new), адміністратор сайту схвалює → activateInvites
    const reg = async (email: string, sub: string) => { const b = G.browser(); await b.aanmelden(sub, email, { intent: 'login', authTime: oud, iat: oud }); const id = await idRij(email); await pool.query(`update app.records set data = data || '{"status":"approved"}'::jsonb where tbl='users' and id=$1`, [id]); return id; };
    const idNA = await reg(nA, `i014h-na-${T}`), idNO = await reg(nO, `i014h-no-${T}`);
    await activeer(idNA); await activeer(idNO);
    await wacht();
    const rijNA = await lidRij(ws, nA), rijNO = await lidRij(ws, nO);
    check('2: запрошення від відкликаного A НЕ активується (лишається «запрошеним», без доступу); від власника — активується',
      rijNA?.s === 'invited' && !rijNA?.u && rijNO?.s === 'active' && rijNO?.u === idNO, JSON.stringify([rijNA, rijNO]));
    const auditNA = await auditRij(idNA, 'workspace_invite_inviter_not_allowed');
    check('2: відмову записано в аудит (хто запросив, простір); A не отримує «запрошення прийнято», власник — отримує',
      auditNA?.invitedBy === A.id && auditNA?.workspaceId === ws && (await meldingen(A.id, 'workspace_invite_accepted')).length === 0 && (await meldingen(O.id, 'workspace_invite_accepted')).length === 1,
      JSON.stringify(auditNA));
    // старий рядок без invitedBy (до цього поля) працює як раніше
    const nOud = `i014h-oud-${T}@example.test`;
    await pool.query("insert into app.records (tbl,id,data) values ('workspace_members',$1,$2)", [`i014h-oud-lid-${T}`, { workspaceId: ws, userId: '', email: nOud, permission: 'viewer', workspaceRole: 'viewer', scopeBlockIds: [], status: 'invited', verlooptOp: Date.now() + 3600_000, createdAt: Date.now(), updatedAt: Date.now() }]);
    const idOud = await reg(nOud, `i014h-oud-${T}`);
    await activeer(idOud);
    check('2: старе запрошення без invitedBy активується, як і раніше (сумісність)', (await lidRij(ws, nOud))?.s === 'active');
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i014h-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await pool.query("delete from app.records where tbl in ('workspace_members','workspace_blocks') and data->>'workspaceId' in (select id from app.records where tbl='workspaces' and data->>'ownerUserId' = any($1))", [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    }
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);

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
w.log = []; w.meldingen = []; w.antwoorden = {}; w.opnieuw = null;
const post = async (pad: string, lichaam: Record<string, unknown>) => {
  w.log.push({ pad, lichaam });
  const f = w.antwoorden[pad];
  if (f) return f(lichaam);
  if (pad === '/api/share/members') return { members: w.leden, rol: 'owner' };
  return { ok: true };
};
function Proef() {
  const d = useDelen({ werkruimteId: 'ws-1', rol: 'owner', actief: true, post, melding: (p) => w.meldingen.push(p), hubOrigin: 'https://hub.proef.invalid' });
  w.d = d;
  return h(LedenLijst, { lang: 'uk', leden: d.leden, rol: d.rol, bezig: d.bezig, onRol: d.rolWijzigen, onIntrekken: d.intrekken, onOpnieuw: (e: string, r: string, s: string[]) => { w.opnieuw = [e, r, s]; } });
}
w.start = () => createRoot(document.getElementById('k')!).render(h(Proef));
`;

async function inChrome(check: Check) {
  const PW = [process.env.PLAYWRIGHT_CORE, join(process.cwd(), 'node_modules', 'playwright-core'), '/opt/node-tools/node_modules/playwright-core']
    .filter((p): p is string => Boolean(p)).map((p) => join(p, 'index.mjs')).find((p) => existsSync(p)) || '';
  const CHROME = process.env.CHROME_PAD || '/usr/bin/google-chrome';
  if (!PW || !existsSync(CHROME)) { check('Chrome і playwright-core доступні (CHROME_PAD, PLAYWRIGHT_CORE)', false, `${PW} ${CHROME}`); return; }
  const map = mkdtempSync(join(tmpdir(), 'i014-herstel-'));
  try {
    const { build } = await import('esbuild');
    const uit = resolve(map, 'proef.js');
    await build({ stdin: { contents: PROEF, resolveDir: resolve('.'), loader: 'tsx', sourcefile: 'i014h-proef.tsx' }, outfile: uit, bundle: true, logLevel: 'error', platform: 'browser', format: 'iife', target: 'es2022', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' } });
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
        return r.abort();
      });
      await page.goto('https://id.proef.invalid/');
      await page.evaluate(() => {
        const w = window as any;
        w.leden = [
          { id: 'l1', email: 'lid@example.test', userId: 'u1', permission: 'viewer', workspaceRole: 'viewer', status: 'active' },
          { id: 'l2', email: 'nieuw@example.test', permission: 'editor', workspaceRole: 'member', status: 'invited' },
          { id: 'l3', email: 'oud@example.test', permission: 'viewer', workspaceRole: 'viewer', status: 'invited', expired: true, scopeBlockIds: ['b1', 'b2'] },
        ];
        w.start();
      });
      await page.waitForSelector('[data-lid-staat="verlopen"]', { timeout: 15000 });
      const rolVerzoeken = () => page.evaluate(() => (window as any).log.filter((x: any) => x.pad === '/api/share/role').length);

      // 5) клавіатура: Tab до закритого select і ↓ — раніше одразу POST /api/share/role
      await page.focus('.delen-lid:nth-of-type(1) select');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
      const naPijl = await rolVerzoeken();
      const vensterNaPijl = await page.$('[data-bevestig="deel-rol-wijzigen"]');
      const waardeNaPijl = await page.$eval('.delen-lid:nth-of-type(1) select', (s: HTMLSelectElement) => s.value);
      check('5: ↓ на select ролі не надсилає /api/share/role; якщо браузер змінив вибір — відкривається вікно, роль у списку лишається «Перегляд»',
        naPijl === 0 && waardeNaPijl === 'viewer', `запитів=${naPijl} вікно=${!!vensterNaPijl} значення=${waardeNaPijl}`);
      if (vensterNaPijl) { await page.click('[data-bevestig="deel-rol-wijzigen"] .bevestig-dialoog-nee, [data-bevestig="deel-rol-wijzigen"] button:has-text("Скасувати")'); await page.waitForSelector('[data-bevestig="deel-rol-wijzigen"]', { state: 'detached', timeout: 5000 }); }

      await page.selectOption('.delen-lid:nth-of-type(1) select', 'member');
      await page.waitForSelector('[data-bevestig="deel-rol-wijzigen"]', { timeout: 5000 });
      const tekst = await page.$eval('[data-bevestig="deel-rol-wijzigen"]', (e: Element) => e.textContent || '');
      await page.click('[data-bevestig="deel-rol-wijzigen"] button:has-text("Скасувати")');
      await page.waitForSelector('[data-bevestig="deel-rol-wijzigen"]', { state: 'detached', timeout: 5000 });
      const naAnnuleren = await rolVerzoeken();
      check('5: вибір «Редагування» відкриває вікно «Змінити роль?» з наслідками; «Скасувати» — жодного запиту',
        /Змінити роль\?/.test(tekst) && /«Перегляд» → «Редагування»/.test(tekst) && /отримає сповіщення/.test(tekst) && naAnnuleren === 0, tekst.slice(0, 200));
      await page.selectOption('.delen-lid:nth-of-type(1) select', 'member');
      await page.waitForSelector('[data-bevestig="deel-rol-wijzigen"]', { timeout: 5000 });
      await page.click('[data-bevestig="deel-rol-wijzigen"] button:has-text("Так, змінити роль")');
      await page.waitForFunction(() => (window as any).log.some((x: any) => x.pad === '/api/share/role'), null, { timeout: 5000 });
      const r1 = await page.evaluate(() => { const w = window as any; return { v: w.log.find((x: any) => x.pad === '/api/share/role'), m: w.meldingen[w.meldingen.length - 1] }; });
      check('5: після «Так, змінити роль» — рівно один запит (l1 → member) і повідомлення «Людина отримає сповіщення» (активний учасник)',
        r1.v?.lichaam?.memberId === 'l1' && r1.v?.lichaam?.workspaceRole === 'member' && /Людина отримає сповіщення/.test(r1.m?.[0] || ''), JSON.stringify(r1));

      // 1) запрошений, який ще не прийняв: вікно й повідомлення не обіцяють сповіщення
      await page.selectOption('.delen-lid:nth-of-type(2) select', 'viewer');
      await page.waitForSelector('[data-bevestig="deel-rol-wijzigen"]', { timeout: 5000 });
      const t2 = await page.$eval('[data-bevestig="deel-rol-wijzigen"]', (e: Element) => e.textContent || '');
      const gevaar2 = await page.$eval('[data-bevestig="deel-rol-wijzigen"]', (e: Element) => e.classList.contains('is-gevaarlijk'));
      await page.click('[data-bevestig="deel-rol-wijzigen"] button:has-text("Так, змінити роль")');
      await page.waitForFunction(() => (window as any).log.filter((x: any) => x.pad === '/api/share/role').length === 2, null, { timeout: 5000 });
      const m2 = await page.evaluate(() => { const w = window as any; return w.meldingen[w.meldingen.length - 1]; });
      check('1: запрошений без входу — вікно каже «сповіщення не буде», після зміни — «Сповіщення немає» (сервер справді не шле)',
        /сповіщення не буде/.test(t2) && !/отримає сповіщення/.test(t2) && /Сповіщення немає/.test(m2?.[0] || '') && gevaar2, `${t2.slice(0, 200)} | ${JSON.stringify(m2)}`);

      // 7) «Надіслати знову» передає обсяг початкового запрошення
      await page.click('.delen-lid:nth-of-type(3) button:has-text("Надіслати знову")');
      const opnieuw = await page.evaluate(() => (window as any).opnieuw);
      check('7: «Надіслати знову» передає батькові адресу, роль і обсяг старого запрошення (b1, b2)', JSON.stringify(opnieuw) === JSON.stringify(['oud@example.test', 'viewer', ['b1', 'b2']]), JSON.stringify(opnieuw));

      // 6) посилання: повідомлення після створення; 1) «Надати доступ» — умовний текст
      const na = await page.evaluate(async () => {
        const w = window as any; w.antwoorden['/api/share/link'] = () => ({ code: 'CODE1234abcd' });
        await w.d.linkMaken({ keuze: 'viewer' }); const link = w.meldingen[w.meldingen.length - 1];
        await w.d.perAdres({ email: 'x@example.test', keuze: 'viewer' }); const adres = w.meldingen[w.meldingen.length - 1];
        return { link, adres };
      });
      check('6/1: після створення посилання — LINK_GEMAAKT; після «Надати доступ» — PER_ADRES_GELUKT (без безумовної обіцянки)',
        JSON.stringify(na.link) === JSON.stringify(LINK_GEMAAKT) && JSON.stringify(na.adres) === JSON.stringify(PER_ADRES_GELUKT), JSON.stringify(na));
      check('Chrome: без помилок сторінки', fouten.length === 0, fouten.join(' | ').slice(0, 300));
    } finally { await browser.close(); }
  } catch (e) {
    check('Chrome: неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 600));
  } finally { rmSync(map, { recursive: true, force: true }); }
}
