// IDENTITEIT-015, крок 1 «risico» (етап 1 плану: ризики втрати даних або доступу). Поведінка — через справжні маршрути
// backend/index.ts проти одноразової бази й підробленого Google (tests/eenheid/hulp/nep-google.ts); повторне шифрування —
// через справжній модуль backend/sleutelkluis.ts (як sec-002-g10e). Лише вигадані дані; назовні не йде нічого.
//   (1) старі /api/account/{delete,recover,workspaces/:id/restore} → 410; hub і id.* — /api/owner/identity/account/*;
//       самостійне відновлення протягом 30 днів (restore/fresh), ідемпотентне, з аудитом і сповіщенням;
//   (2) зовнішній блок без посилання сервер не приймає (add і update), старі блоки без sourceType працюють;
//   (3) повторне шифрування: перебіг N з M у app.records, переривання ключем, «Продовжити», ідемпотентність, одночасний запуск;
//   (4) правило mfa='required' діє під час входу: сеанс без TOTP/ключа/коду відновлення не повний; без власного чинника правило
//       не вмикається; людина без другого чинника входить як раніше; аварійний вимикач відчиняє ворота;
//   (5) обов'язковий пункт меню заблоковано для всіх; (6) violet лише з правом plum-theme; (7) «зберегти обліковий запис» —
//       чесне «діятиме з наступного входу» без скидання.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-015-risico.test.ts
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle, totpCode } from './hulp/nep-google';
import { blokUrlVereistFout } from '../../shared/blok-invoer';
import { poortDicht, tweedeFactorRouteVrij, tweedeFactorVers, tweedeFactorGeheugenLeeg, TWEEDE_FACTOR_LOGIN_MS } from '../../backend/tweede-factor-poort';
import { actieVoorPad } from '../../shared/stap-op-acties';
import { beschrijfStapOp } from '../../shared/stap-op-beschrijving';
import * as sk from '../../backend/sleutelkluis';

const lees = (p: string) => readFileSync(p, 'utf8');
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-risico');

  // ================================================================ чисті правила
  {
    const nu = 1_800_000_000_000;
    check('ворота: правило optional → відчинені; required без власного чинника → відчинені (сумісність, власник не блокує себе)',
      !poortDicht({ beleid: 'optional', heeftFactor: true, bevestigdOp: 0, noodschakelaar: false, nu }) && !poortDicht({ beleid: 'required', heeftFactor: false, bevestigdOp: 0, noodschakelaar: false, nu }));
    check('ворота: required + чинник + без підтвердження → зачинені; підтверджено на цьому вході → відчинені; через 30 діб — знову зачинені',
      poortDicht({ beleid: 'required', heeftFactor: true, bevestigdOp: 0, noodschakelaar: false, nu }) && !poortDicht({ beleid: 'required', heeftFactor: true, bevestigdOp: nu - 1000, noodschakelaar: false, nu })
      && poortDicht({ beleid: 'required', heeftFactor: true, bevestigdOp: nu - TWEEDE_FACTOR_LOGIN_MS - 1, noodschakelaar: false, nu }) && !tweedeFactorVers(nu + 10 * 60_000, nu));
    check('ворота: аварійний вимикач (STAP_OP_UIT_TOT) відчиняє', !poortDicht({ beleid: 'required', heeftFactor: true, bevestigdOp: 0, noodschakelaar: true, nu }));
    check('ворота: вільні лише вхід, вихід і вікно «Підтвердіть доступ»; дані — ні',
      ['POST /api/owner/session/bootstrap', 'POST /api/owner/session/logout-current', 'POST /api/owner/access/stap-op', 'POST /api/owner/access/stap-op/methoden', 'POST /api/owner/access/stap-op/passkey', 'POST /api/owner/access/stap-op/passkey/opties'].every(tweedeFactorRouteVrij)
      && !['POST /api/workspace/load', 'POST /api/owner/access/policy/save', 'POST /api/owner/identity/account/delete', 'POST /api/owner/access/totp/disable'].some(tweedeFactorRouteVrij));
    const b = beschrijfStapOp(actieVoorPad('/api/owner/access/tweede-factor'), '/api/owner/access/tweede-factor');
    check('вікно «Підтвердіть доступ» знає, що підтверджується (вхід другим чинником)', actieVoorPad('/api/owner/access/tweede-factor') === 'tweede-factor' && b.bekend && /друг/i.test(b.uk) && /tweede factor/i.test(b.nl));
    check('блок: зовнішній без посилання → BLOK_URL_VEREIST; з посиланням або внутрішній — так',
      blokUrlVereistFout('external', '') === 'BLOK_URL_VEREIST' && blokUrlVereistFout(undefined, '  ') === 'BLOK_URL_VEREIST' && blokUrlVereistFout('external', 'https://a.test/') === null && blokUrlVereistFout('internal', '') === null);
  }

  // ================================================================ (7) «зберегти обліковий запис»: чесно з наступного входу
  {
    const sklad = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => sklad.get(k) ?? null, setItem: (k: string, v: string) => { sklad.set(k, String(v)); }, removeItem: (k: string) => { sklad.delete(k); } };
    const o = await import('../../src/aanmelden-onthouden');
    o.zetAanmeldenOnthouden(false);
    const uit = !o.leesAanmeldenOnthouden() && !o.leesOnthoudenVanafVolgende();
    o.zetOnthoudenVanafVolgende();
    const volgende = o.leesAanmeldenOnthouden() && o.leesOnthoudenVanafVolgende();
    o.zetAanmeldenOnthouden(true);
    check('зберегти: «вимкнено» → «діятиме з наступного входу» читається як увімкнено (вхід піде з remember) → після запам’ятованого входу звичайне «увімкнено»',
      uit && volgende && o.leesAanmeldenOnthouden() && !o.leesOnthoudenVanafVolgende());
    const vda = lees('src/VerenigdDienstApp.tsx'), so = lees('src/SessiesOverzicht.tsx');
    check('зберегти: bootstrap не скидає вибір «з наступного входу» (rememberedBrowser=false) і не видає грант посеред сеансу',
      vda.includes('model.rememberedBrowser===false?(leesOnthoudenVanafVolgende()||zetAanmeldenOnthouden(false))') && so.includes('data-sessies-onthoud-volgende') && so.includes('zetOnthoudenVanafVolgende()')
      && !/security\/items\/[^`]*\/remember|onthouden\/aan/.test(so));
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }

  // ================================================================ (5) обов'язковий пункт меню — для всіх
  {
    const ic = lees('src/InstellingencentrumWeergave.tsx'), ma = lees('src/MenuAanpasser.tsx');
    check('меню: кнопка-око обов’язкового пункту заблокована для всіх (без умови ролі) з поясненням, і в «Налаштувати меню» теж',
      !ic.includes("p.user.role==='owner'&&ownerLockedMenuItem") && ic.includes('disabled={ownerLockedMenuItem(item.id)}') && ic.includes('Завжди видимий: без цього пункту не відкрити налаштувань')
      && ma.includes('disabled={ownerLockedMenuItem(item.id)}') && ma.includes('Altijd zichtbaar: zonder dit item zijn de instellingen niet te openen'));
  }

  // ================================================================ маршрути проти бази
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN (DB): geen database'); return einde(); }
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const eigenaar = `i015-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  const oud = Math.floor(Date.now() / 1000) - 3600;
  type Browser = ReturnType<typeof G.browser>;
  type Mens = { b: Browser; email: string; id: string; sub: string };
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const hub = (p: { b: Browser }, pad: string, extra: Record<string, unknown> = {}) => p.b.verzoek('hub.tarasevych.com', pad, p.b.ctxBody('hub', extra));
  const idv = (p: { b: Browser }, pad: string, extra: Record<string, unknown> = {}) => p.b.verzoek('id.tarasevych.com', pad, p.b.ctxBody('identity', extra));
  const zetUser = (id: string, extra: Record<string, unknown>) => pool.query("update app.records set data = data || $2::jsonb where tbl='users' and id=$1", [id, JSON.stringify(extra)]);
  const stand = async (id: string) => (await pool.query("select data from app.records where tbl='users' and id=$1", [id])).rows[0]?.data as Record<string, any>;
  const maak = async (naam: string, email = `i015-${naam}-${T}@example.test`): Promise<Mens> => {
    const b = G.browser(), sub = `i015-${naam}-${T}`;
    await b.aanmelden(sub, email, { intent: 'login', authTime: oud, iat: oud });
    const id = await idRij(email);
    await zetUser(id, { status: 'approved', name: `Проба ${naam}` });
    return { b, email, id, sub };
  };
  const opnieuw = async (p: Mens): Promise<Mens> => { const b = G.browser(); await b.aanmelden(p.sub, p.email, { intent: 'login', authTime: oud, iat: oud }); return { ...p, b }; };
  const stapOpGoogle = (p: Mens) => p.b.aanmelden(p.sub, p.email, { intent: 'step-up' });
  const meldingen = async (userId: string) => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 order by seq", [userId])).rows.map((r: { data: Record<string, any> }) => r.data);
  const audit = async (userId: string, action: string) => (await pool.query('select result, details from app.audit where owner_id=$1 and action=$2 order by id', [userId, action])).rows as Array<{ result: string; details: Record<string, any> }>;
  const wacht = () => slaap(150);
  const policyVoor = (await pool.query("select id, data from app.records where tbl='access_method_policy_v1' and data->>'tenantKey'='global' order by seq limit 1")).rows[0] as { id: string; data: Record<string, unknown> } | undefined;

  try {
    const Oeig = await maak('o', eigenaar); // власник сайту (один вхід Google для всього тесту)
    // ---------------------------------------------------------------- (1) обліковий запис: старі маршрути, видалення й відновлення
    {
      const A = await maak('a');
      const wsA = String((await hub(A, '/api/workspace/load')).data.workspace?.id || '');
      const oudDel = await hub(A, '/api/account/delete', { confirmEmail: A.email });
      const oudRec = await hub(A, '/api/account/recover', { mode: 'restore' });
      const oudWs = await hub(A, `/api/account/workspaces/${wsA}/restore`);
      check('(1) старі /api/account/delete, /recover, /workspaces/:id/restore → 410 LEGACY_ROUTE_GONE, обліковий запис не змінено',
        [oudDel, oudRec, oudWs].every((r) => r.status === 410 && r.data.reasonCode === 'LEGACY_ROUTE_GONE') && (await stand(A.id)).status === 'approved', JSON.stringify([oudDel.status, oudRec.status, oudWs.status]));

      // архівований простір — відновлення з hub новим маршрутом
      await pool.query("update app.records set data = data || jsonb_build_object('archivedAt', $2::bigint) where id=$1", [wsA, Date.now()]);
      const wsTerug = await hub(A, `/api/owner/identity/account/workspaces/${wsA}/restore`);
      const archief = Number((await pool.query("select (data->>'archivedAt')::bigint a from app.records where id=$1", [wsA])).rows[0]?.a || 0);
      check('(1) hub: архівований простір відновлюється новим маршрутом (200, archivedAt=0, аудит)', wsTerug.status === 200 && archief === 0 && (await audit(A.id, 'owner.identity.workspace.restored')).length >= 1, `${wsTerug.status} ${archief}`);

      // видалення з hub — новим маршрутом, зі step-up
      const zonder = await hub(A, '/api/owner/identity/account/delete', { confirmEmail: A.email });
      await stapOpGoogle(A);
      const weg = await hub(A, '/api/owner/identity/account/delete', { confirmEmail: A.email });
      const naWeg = await stand(A.id);
      const naBoot = await hub(A, '/api/owner/session/bootstrap');
      check('(1) після видалення з hub сеанс цього браузера завершено (усі входи відкликано, як у старому маршруті)', naBoot.data.state === 'signed_out' && !naBoot.data.user, JSON.stringify(naBoot.data).slice(0, 120));
      check('(1) hub: видалення новим маршрутом — без step-up 403, із step-up 200; status deleted, 30 днів на відновлення',
        zonder.status === 403 && weg.status === 200 && naWeg.status === 'deleted' && Number(naWeg.recoverableUntil) > Date.now() + 29 * 864e5, `${zonder.status} ${weg.status} ${naWeg.status}`);

      // вхід → id.* показує відновлення; кнопка «Відновити» = POST /api/owner/identity/account/recover
      const A2 = await opnieuw(A);
      const boot = await idv(A2, '/api/owner/session/bootstrap');
      const herstel = await idv(A2, '/api/owner/identity/account/recover', { mode: 'restore' });
      await wacht();
      const naHerstel = await stand(A.id);
      const wsNa = Number((await pool.query("select coalesce((data->>'archivedAt')::bigint,0) a from app.records where id=$1", [wsA])).rows[0]?.a || 0);
      const melding = (await meldingen(A.id)).filter((m) => m.kind === 'security' && /Обліковий запис відновлено/.test(m.title));
      const auditHerstel = await audit(A.id, 'owner.identity.account.recovered');
      check('(1) id.*: після входу стан deleted → «Відновити» повертає approved і простір (archivedAt=0), аудит success і сповіщення в центрі',
        boot.data.user?.status === 'deleted' && herstel.status === 200 && herstel.data.user?.status === 'approved' && naHerstel.status === 'approved' && wsNa === 0
        && melding.length === 1 && auditHerstel.some((r) => r.result === 'success' && r.details?.mode === 'restore'), JSON.stringify({ boot: boot.data.user?.status, h: herstel.status, s: naHerstel.status, wsNa, m: melding.length }));
      const nogmaals = await idv(A2, '/api/owner/identity/account/recover', { mode: 'restore' });
      await wacht();
      check('(1) повторне натискання «Відновити» — 200 без змін (alHersteld), друге сповіщення не надходить',
        nogmaals.status === 200 && nogmaals.data.alHersteld === true && (await meldingen(A.id)).filter((m) => /Обліковий запис відновлено/.test(m.title)).length === 1, `${nogmaals.status}`);

      // B: видалення з id.*, відновлення «з новим простором» з hub; простроченого — 400
      const B = await maak('b');
      await hub(B, '/api/workspace/load');
      await stapOpGoogle(B);
      const wegB = await idv(B, '/api/owner/identity/account/delete', { confirmEmail: B.email });
      const B2 = await opnieuw(B);
      const vers = await hub(B2, '/api/owner/identity/account/recover', { mode: 'fresh' });
      const ruimtesB = (await pool.query("select coalesce((data->>'archivedAt')::bigint,0) a from app.records where tbl='workspaces' and data->>'ownerUserId'=$1", [B.id])).rows.map((r: { a: string }) => Number(r.a));
      check('(1) hub: «Почати заново» (fresh) — approved, новий активний простір, старий лишається в архіві',
        wegB.status === 200 && vers.status === 200 && (await stand(B.id)).status === 'approved' && ruimtesB.some((a) => a === 0) && ruimtesB.some((a) => a > 0), JSON.stringify({ wegB: wegB.status, vers: vers.status, ruimtesB }));
      const C = await maak('c');
      await stapOpGoogle(C);
      await idv(C, '/api/owner/identity/account/delete', { confirmEmail: C.email });
      const C2 = await opnieuw(C);
      await zetUser(C.id, { recoverableUntil: Date.now() - 1000 });
      const te = await idv(C2, '/api/owner/identity/account/recover', { mode: 'restore' });
      check('(1) після 30 днів відновлення відмовляє з точною причиною (400 RECOVERY_WINDOW_EXPIRED), запис лишається deleted, аудит denied',
        te.status === 400 && te.data.error === 'RECOVERY_WINDOW_EXPIRED' && (await stand(C.id)).status === 'deleted' && (await audit(C.id, 'owner.identity.account.recovered')).some((r) => r.result === 'denied'), `${te.status} ${te.data.error}`);
      const gate = lees('src/VerenigdDienstApp.tsx');
      check('(1) новий інтерфейс: на екрані «Акаунт потребує відновлення» є «Відновити старий простір» і «Створити новий простір» (без «через Мій простір»)',
        gate.includes("data-account-herstel-knop='restore'") && gate.includes("data-account-herstel-knop='fresh'") && gate.includes("'/api/owner/identity/account/recover'") && !gate.includes('Відновлення акаунта виконується через Мій простір'));
      const app = lees('src/App.tsx');
      check('(1) hub (src/App.tsx) не звертається до /api/account/*', !/['`]\/api\/account\/(delete|recover|workspaces)/.test(app) && app.includes("'/api/owner/identity/account/delete'") && app.includes("'/api/owner/identity/account/recover'") && app.includes('/api/owner/identity/account/workspaces/'));
    }

    // ---------------------------------------------------------------- (2) зовнішній блок вимагає посилання
    {
      const W = await maak('w');
      const ws = String((await hub(W, '/api/workspace/load')).data.workspace?.id || '');
      const zonderUrl = await hub(W, '/api/blocks/add', { workspaceId: ws, sourceType: 'external', title: 'без посилання' });
      const zonderAlles = await hub(W, '/api/blocks/add', { workspaceId: ws, title: 'без джерела' });
      const metUrl = await hub(W, '/api/blocks/add', { workspaceId: ws, sourceType: 'external', title: 'з посиланням', url: 'https://example.test/x' });
      const intern = await hub(W, '/api/blocks/add', { workspaceId: ws, sourceType: 'internal', target: 'mail', title: '' });
      check('(2) add: зовнішній без url → 400 BLOK_URL_VEREIST (і коли sourceType не вказано); з url — 200; внутрішній без url — 200',
        zonderUrl.status === 400 && zonderUrl.data.error === 'BLOK_URL_VEREIST' && zonderAlles.status === 400 && metUrl.status === 200 && intern.status === 200,
        JSON.stringify([zonderUrl.status, zonderAlles.status, metUrl.status, intern.status]));
      const blok = String(metUrl.data.block?.id || '');
      const wis = await hub(W, `/api/blocks/${blok}/update`, { url: '  ' });
      const titel = await hub(W, `/api/blocks/${blok}/update`, { title: 'нова назва' });
      const nogUrl = (await pool.query("select data->>'url' u from app.records where id=$1", [blok])).rows[0]?.u;
      check('(2) update: стерти посилання зовнішнього блоку → 400, посилання лишилося; зміна назви — 200', wis.status === 400 && wis.data.error === 'BLOK_URL_VEREIST' && titel.status === 200 && nogUrl === 'https://example.test/x', `${wis.status} ${titel.status} ${nogUrl}`);
      await pool.query("update app.records set data = (data - 'sourceType') || '{\"url\":\"\"}'::jsonb where id=$1", [blok]);
      const oudBlok = await hub(W, `/api/blocks/${blok}/update`, { url: '', title: 'старий блок' });
      check('(2) сумісність: старий блок без sourceType (до IDENTITEIT-012) змінюється як раніше (200)', oudBlok.status === 200, `${oudBlok.status}`);
      const tekst = lees('src/weigeringen.ts');
      check('(2) інтерфейс пояснює відмову двома мовами (BLOK_URL_VEREIST у weigeringen.ts)', /BLOK_URL_VEREIST: \['Зовнішньому блоку потрібне посилання[^']*', 'Een extern blok heeft een https/.test(tekst));
    }

    // ---------------------------------------------------------------- (6) violet лише з правом
    {
      const V = await maak('v');
      const zonder = await hub(V, '/api/owner/ui/weergave/save', { weergave: { versie: 1, modus: 'dark', palet: 'violet' } });
      const opgeslagenZonder = zonder.data.weergave || {};
      const auditViolet = await audit(V.id, 'owner.ui.weergave.palet');
      await zetUser(V.id, { entitlements: ['plum-theme'] });
      const met = await hub(V, '/api/owner/ui/weergave/save', { weergave: { versie: 1, modus: 'dark', palet: 'violet' } });
      const eig = await hub(Oeig, '/api/owner/ui/weergave/save', { weergave: { versie: 1, modus: 'light', palet: 'violet' } });
      check('(6) violet без plum-theme: сервер не зберігає палітру (paletGeweigerd), решту вибору — так; аудит denied',
        zonder.status === 200 && zonder.data.paletGeweigerd === 'violet' && opgeslagenZonder.palet !== 'violet' && opgeslagenZonder.modus === 'dark' && auditViolet.some((r) => r.result === 'denied'), JSON.stringify(zonder.data).slice(0, 200));
      check('(6) з правом plum-theme і для власника сайту — violet зберігається', met.status === 200 && met.data.weergave?.palet === 'violet' && !met.data.paletGeweigerd && eig.status === 200 && eig.data.weergave?.palet === 'violet', JSON.stringify([met.data.weergave, eig.data.weergave]));
    }

    // ---------------------------------------------------------------- (5) меню: сервер лишає обов'язковий пункт видимим для не-власника
    {
      const M = await maak('m');
      const r = await hub(M, '/api/owner/ui/preferences/save', { menu: [{ id: 'identity', visible: false, order: 0, icon: 'settings' }] });
      const item = (r.data.menu || []).find((x: { id: string }) => x.id === 'identity');
      check('(5) не-власник «приховує» обов’язковий пункт — сервер лишає його видимим (тож інтерфейс і показує його заблокованим)', r.status === 200 && item?.visible === true, JSON.stringify(item));
    }

    // ---------------------------------------------------------------- (3) повторне шифрування: перебіг, переривання, «Продовжити»
    {
      const sys = getPool('systeem');
      process.env.MAIL_APP_WACHTWOORD_SLEUTEL_V1 = process.env.MAIL_APP_WACHTWOORD_SLEUTEL_V1 || randomBytes(32).toString('base64');
      const U = `i015-kluis-${randomUUID()}`;
      const lade = { userId: U, ruimte: 'prive' as const };
      sk.zetHouderControle(async () => true);
      const keer: Record<string, number> = { een: 0, twee: 0, drie: 0 };
      let sluitBijTwee = false, traag = 0;
      try {
        const { herstelcode } = await sk.inschakelen(lade, { soort: 'sessie', id: 's1' });
        sk.registreerHerversleutelaar('i015.een', async (l) => { if (l.userId !== U) return { gevonden: 0, herversleuteld: 0 }; keer.een++; if (traag) await slaap(traag); return { gevonden: 2, herversleuteld: 2 }; });
        sk.registreerHerversleutelaar('i015.twee', async (l) => { if (l.userId !== U) return { gevonden: 0, herversleuteld: 0 }; keer.twee++; if (sluitBijTwee) { sluitBijTwee = false; sk.sleutelSluitenVoorHouder('sessie', 's1'); } return { gevonden: 1, herversleuteld: 1 }; });
        sk.registreerHerversleutelaar('i015.drie', async (l) => { if (l.userId !== U) return { gevonden: 0, herversleuteld: 0 }; keer.drie++; return { gevonden: 0, herversleuteld: 0 }; });
        const M = sk.geregistreerdeHerversleutelaars().length;
        const eerste = await sk.herversleutelen(lade, { maxTabellen: 1 });
        const rij = (await sys.query("select owner_id, data from app.records where tbl=$1 and id=$2", [sk.HERVERSLEUTEL_TABEL, `${U}:prive`])).rows[0] as { owner_id: string; data: Record<string, any> } | undefined;
        check('(3) старт кроком: «оброблено 1 з M», стан у app.records (owner_id = людина)', eerste.voortgang.status === 'bezig' && eerste.voortgang.gedaan === 1 && eerste.voortgang.totaal === M && rij?.owner_id === U && rij?.data.gedaan.length === 1, JSON.stringify(eerste.voortgang).slice(0, 160));
        // «вкладку закрито»: далі ніхто не кличе — стан лишається, сторінка бачить незавершене
        const o1 = await sk.overzicht(lade);
        check('(3) закрита вкладка: огляд показує незавершене «bezig 1 з M» → кнопка «Продовжити»', o1.herversleutelVoortgang?.status === 'bezig' && o1.herversleutelVoortgang?.gedaan === 1);
        // переривання ключем посеред таблиці «twee»
        sluitBijTwee = true;
        let fout = '';
        try { await sk.herversleutelen(lade, { verder: true }); } catch (e) { fout = String((e as { code?: string }).code || (e as Error).message); }
        const o2 = await sk.herversleutelVoortgang(lade);
        const geenKlaar = !(await sys.query('select herversleuteld_op from app.sleutelkluis where user_id=$1 and ruimte=$2', [U, 'prive'])).rows[0]?.herversleuteld_op;
        check('(3) ключ закрили посеред роботи → 423 SLEUTELKLUIS_GESLOTEN, стан «onderbroken» (reden sleutel-gesloten), таблицю, де закрили, не зараховано, «перешифровано» не поставлено',
          fout === 'SLEUTELKLUIS_GESLOTEN' && o2.status === 'onderbroken' && o2.reden === 'sleutel-gesloten' && o2.gedaan < M && geenKlaar && keer.drie === 0, `${fout} ${JSON.stringify(o2).slice(0, 160)}`);
        let dicht = '';
        try { await sk.herversleutelen(lade, { verder: true }); } catch (e) { dicht = String((e as { code?: string }).code); }
        check('(3) «Продовжити» з закритим ключем — 423, нічого не змінено', dicht === 'SLEUTELKLUIS_GESLOTEN' && (await sk.herversleutelVoortgang(lade)).gedaan === o2.gedaan);
        await sk.ontgrendelMetHerstelcode(lade, herstelcode, { soort: 'sessie', id: 's1' });
        const een0 = keer.een;
        const verder = await sk.herversleutelen(lade, { verder: true });
        const klaarOp = (await sys.query('select herversleuteld_op from app.sleutelkluis where user_id=$1 and ruimte=$2', [U, 'prive'])).rows[0]?.herversleuteld_op;
        await wacht();
        const kluisMelding = (await sys.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'='security'", [U])).rows.filter((r: { data: Record<string, any> }) => /herversleuteld/.test(String(r.data.message))).length;
        check('(3) після розблокування «Продовжити» доводить до кінця: «M з M», klaar, уже оброблене не повторено, перерване — ще раз (ідемпотентно), «перешифровано» стоїть, сповіщення',
          verder.voortgang.status === 'klaar' && verder.voortgang.gedaan === M && keer.een === een0 && keer.twee === 2 && keer.drie === 1 && !!klaarOp && kluisMelding === 1, JSON.stringify({ v: verder.voortgang.status, g: verder.voortgang.gedaan, M, keer, kluisMelding }));
        let niets = '';
        try { await sk.herversleutelen(lade, { verder: true }); } catch (e) { niets = String((e as { code?: string }).code); }
        check('(3) повторне «Продовжити» після завершення — 409 HERVERSLEUTELEN_NIETS_TE_HERVATTEN (нічого не запускає)', niets === 'HERVERSLEUTELEN_NIETS_TE_HERVATTEN' && keer.drie === 1);
        traag = 120;
        const p1 = sk.herversleutelen(lade).then(() => '', (e) => String(e.code));
        await slaap(20);
        const p2 = await sk.herversleutelen(lade).then(() => '', (e) => String(e.code));
        const r1 = await p1;
        traag = 0;
        check('(3) одночасний другий запуск для тієї ж шухляди → 409 HERVERSLEUTELEN_BEZIG, перший завершується', p2 === 'HERVERSLEUTELEN_BEZIG' && r1 === '' && (await sk.herversleutelVoortgang(lade)).status === 'klaar', `${p2} ${r1}`);
        // маршрути: є «Продовжити», без сеансу — 401
        const anon = await G.browser().verzoek('id.tarasevych.com', '/api/owner/sleutelkluis/herversleutelen/verder', { service: 'identity', tabContext: randomBytes(24).toString('hex') });
        const sec = lees('src/SleutelkluisSectie.tsx');
        check('(3) маршрут /herversleutelen/verder існує і вимагає сеансу (401); на сторінці — перебіг «Оброблено N з M» і кнопка «Продовжити»',
          anon.status === 401 && sec.includes('data-sleutelkluis-verder') && sec.includes('Оброблено ${loopt.gedaan} з ${loopt.totaal}') && sec.includes('/herversleutelen/verder'), `${anon.status}`);
      } finally {
        sk.geheugenLeeg();
        sk.zetHouderControle(null);
        await sys.query("DELETE FROM app.records WHERE tbl = $1 AND id = $2", [sk.HERVERSLEUTEL_TABEL, `${U}:prive`]).catch(() => undefined);
        await sys.query("DELETE FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = $1", [U]).catch(() => undefined);
        for (const t of ['sleutelkluis_omslag', 'sleutelkluis_journaal', 'sleutelkluis']) await sys.query(`DELETE FROM app.${t} WHERE user_id = $1`, [U]).catch(() => undefined);
        await sys.query('DELETE FROM app.audit WHERE owner_id = $1', [U]).catch(() => undefined);
      }
    }

    // ---------------------------------------------------------------- (4) «другий чинник обов'язковий» під час входу
    {
      if (Date.now() % 30000 > 20000) await slaap(30000 - (Date.now() % 30000) + 200);
      const stap = Math.floor(Date.now() / 30000);
      const O = Oeig;
      const P = await maak('p');
      const Q = await maak('q');
      await hub(P, '/api/workspace/load'); await hub(Q, '/api/workspace/load');
      // власник без власного чинника не може ввімкнути правило
      await stapOpGoogle(O);
      const zonderEigen = await idv(O, '/api/owner/access/policy/save', { mfa: 'required', enabled: {} });
      check('(4) власник без TOTP/ключа не вмикає правило — 409 ACCESS_MFA_EIGEN_FACTOR_VEREIST (не заблокує себе), аудит denied',
        zonderEigen.status === 409 && zonderEigen.data.error === 'ACCESS_MFA_EIGEN_FACTOR_VEREIST' && (await audit(O.id, 'access.policy.save')).some((r) => r.result === 'denied'), `${zonderEigen.status} ${zonderEigen.data.error}`);
      // TOTP для власника і для P
      const totp = async (p: Mens, s: number) => { await stapOpGoogle(p); const st = await idv(p, '/api/owner/access/totp/start'); const c = await idv(p, '/api/owner/access/totp/confirm', { code: totpCode(st.data.secret, s) }); return { secret: String(st.data.secret || ''), codes: (c.data.recoveryCodes || []) as string[], ok: st.status === 200 && c.status === 200 }; };
      const tO = await totp(O, stap - 1), tP = await totp(P, stap - 1);
      check('(4) підготовка: TOTP налаштовано власнику й учаснику P', tO.ok && tP.ok && tP.codes.length > 0);
      // з власним TOTP правило — сильна дія: підтвердження кодом (Google тут уже не рахується)
      const Osterk = await idv(O, '/api/owner/access/stap-op', { code: totpCode(tO.secret, stap) });
      const aan = await idv(O, '/api/owner/access/policy/save', { mfa: 'required', enabled: {} });
      await wacht();
      check('(4) власник із власним TOTP вмикає правило (200, mfa=required; його вхід, підтверджений кодом, лишається відчиненим), аудит success і сповіщення в центрі',
        Osterk.status === 200 && aan.status === 200 && aan.data.policy?.mfa === 'required' && aan.data.tweedeFactorPoort === false && (await audit(O.id, 'access.policy.save')).some((r) => r.result === 'success' && r.details?.mfa === 'required')
        && (await meldingen(O.id)).some((m) => m.kind === 'security' && /обов’язковий/.test(m.title)), `${Osterk.status} ${aan.status} ${aan.data.error} ${JSON.stringify(aan.data.policy)}`);
      // P: новий вхід → сеанс не повний
      const P2 = await opnieuw(P);
      const boot = await hub(P2, '/api/owner/session/bootstrap');
      const dicht = await hub(P2, '/api/workspace/load');
      const vrij = await hub(P2, '/api/owner/access/stap-op/methoden');
      check('(4) після Google сеанс P не повний: bootstrap — tweedeFactorPoort без просторів; дані закрито; вікно «Підтвердіть доступ» доступне',
        boot.status === 200 && boot.data.tweedeFactorPoort === true && (boot.data.workspaces || []).length === 0 && dicht.status >= 400 && vrij.status === 200 && vrij.data.methoden?.totp === true,
        JSON.stringify({ b: boot.data.tweedeFactorPoort, w: (boot.data.workspaces || []).length, d: dicht.status, v: vrij.status }));
      const fout = await hub(P2, '/api/owner/access/stap-op', { code: '000000' });
      const nogDicht = await hub(P2, '/api/workspace/load');
      const goed = await hub(P2, '/api/owner/access/stap-op', { code: totpCode(tP.secret, stap) });
      const open = await hub(P2, '/api/workspace/load');
      const boot2 = await hub(P2, '/api/owner/session/bootstrap');
      check('(4) неправильний код не відчиняє; правильний TOTP на цьому вході — сеанс повний (дані, bootstrap без воріт)',
        fout.status === 400 && nogDicht.status >= 400 && goed.status === 200 && open.status === 200 && boot2.data.tweedeFactorPoort === false && (boot2.data.workspaces || []).length > 0,
        JSON.stringify({ f: fout.status, n: nogDicht.status, g: goed.status, o: open.status, b: boot2.data.tweedeFactorPoort }));
      const herhaal = await hub(P2, '/api/workspace/load');
      check('(4) підтвердження тримається на цьому вході (наступні запити без нового коду)', herhaal.status === 200);
      // запасний шлях: код відновлення
      const P3 = await opnieuw(P);
      const herstel = await hub(P3, '/api/owner/access/stap-op', { methode: 'herstelcode', code: tP.codes[0] });
      const open3 = await hub(P3, '/api/workspace/load');
      check('(4) запасний шлях: невикористаний код відновлення відчиняє вхід', herstel.status === 200 && open3.status === 200, `${herstel.status} ${open3.status}`);
      // Q без другого чинника — як раніше
      const Q2 = await opnieuw(Q);
      const bootQ = await hub(Q2, '/api/owner/session/bootstrap');
      const openQ = await hub(Q2, '/api/workspace/load');
      check('(4) сумісність: людина без TOTP/ключа входить як раніше (ворота не зачиняються)', bootQ.data.tweedeFactorPoort === false && openQ.status === 200, `${bootQ.data.tweedeFactorPoort} ${openQ.status}`);
      // власник: вхід, на якому він кодом підтвердив збереження правила, уже повний (TOTP = другий чинник цього входу);
      // НОВИЙ вхід власника теж до коду не повний, і змінити правило з нього до коду не можна.
      const Ovoor = await idv(O, '/api/owner/session/bootstrap');
      const O2 = await opnieuw(O);
      const Oboot = await idv(O2, '/api/owner/session/bootstrap');
      const Ozonder = await idv(O2, '/api/owner/access/policy/save', { mfa: 'optional', enabled: {} });
      const Ostap = await idv(O2, '/api/owner/access/stap-op', { code: totpCode(tO.secret, stap + 1) });
      check('(4) власник: вхід, підтверджений кодом при збереженні правила, повний; новий вхід власника до коду не повний (і правило не змінити); після TOTP — повний',
        Ovoor.data.tweedeFactorPoort === false && Oboot.data.tweedeFactorPoort === true && Ozonder.status >= 400 && Ostap.status === 200 && (await idv(O2, '/api/owner/session/bootstrap')).data.tweedeFactorPoort === false, `${Oboot.data.tweedeFactorPoort} ${Ozonder.status} ${Ostap.status}`);
      // аварійний вимикач
      process.env.STAP_OP_UIT_TOT = new Date(Date.now() + 30 * 60_000).toISOString();
      const P4 = await opnieuw(P);
      const nood = await hub(P4, '/api/workspace/load');
      delete process.env.STAP_OP_UIT_TOT;
      check('(4) аварійний вимикач STAP_OP_UIT_TOT відчиняє ворота (власник не лишається без доступу)', nood.status === 200, `${nood.status}`);
      const uit = await idv(O2, '/api/owner/access/policy/save', { mfa: 'optional', enabled: {} });
      const P5 = await opnieuw(P);
      const naUit = await hub(P5, '/api/workspace/load');
      check('(4) правило вимкнено (після підтвердження) — новий вхід знову без коду', uit.status === 200 && uit.data.policy?.mfa === 'optional' && naUit.status === 200, `${uit.status} ${naUit.status}`);
      const ui = lees('src/toegangslaag-panelen.tsx');
      check('(4) інтерфейс: перемикач правила лише власнику, за замовчуванням вимкнений (з policy), через діалог із наслідками; вікно воріт у застосунку',
        ui.includes("data-mfa-beleid-schakel='1'") && ui.includes("checked={data.policy?.mfa==='required'}") && ui.includes("id='mfa-beleid'") && lees('src/App.tsx').includes('<TweedeFactorPoort />') && lees('src/platform/client.ts').includes('zetTweedeFactorPoort'));
    }
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    delete process.env.STAP_OP_UIT_TOT;
    // правило сайту — назад як було
    if (policyVoor) await pool.query("update app.records set data=$2::jsonb where tbl='access_method_policy_v1' and id=$1", [policyVoor.id, JSON.stringify(policyVoor.data)]);
    else await pool.query("delete from app.records where tbl='access_method_policy_v1' and data->>'tenantKey'='global'");
    tweedeFactorGeheugenLeeg();
    const ids = (await pool.query("select id from app.records where tbl='users' and (data->>'email' like $1 or data->>'email' = $2)", [`i015-%-${T}@example.test`, eigenaar])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await pool.query("delete from app.records where tbl='workspace_blocks' and data->>'workspaceId' in (select id from app.records where tbl='workspaces' and data->>'ownerUserId' = any($1))", [ids]);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
      await pool.query("delete from app.records where tbl='tweede_factor_login_v1' and id = any($1)", [ids.map((i) => `tweede-factor:${i}`)]);
    }
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);
  return einde();
}
