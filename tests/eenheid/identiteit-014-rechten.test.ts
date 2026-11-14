// IDENTITEIT-014 (фаза 3, крок «rechten», 14.11.2026): права в спільному просторі — одна таблиця для сервера й інтерфейсу,
// роль користувача в КОЖНОМУ просторі у відповідях сервера, step-up для надання ролі «адміністратор» і сповіщення людям,
// чиї права змінилися. Чисті функції — напряму; поведінка — через справжні маршрути backend/index.ts проти одноразової бази
// й підробленого Google (tests/eenheid/hulp). Лише вигадані дані; назовні не йде нічого.
// Rechten in een gedeelde werkruimte: één tabel, rol per ruimte in de antwoorden, step-up voor «beheerder», meldingen aan de betrokkene.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-014-rechten.test.ts
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { canManageRole } from '../../backend/rbac';
import * as delen from '../../backend/werkruimte-delen';
import { NOOIT_ONTHOUDEN, onthoudMagVoorPad } from '../../backend/stap-op';
import { WERKRUIMTE_ROLLEN, hoogsteRol, magDelen, magRolBeheren, rollenUitLidmaatschappen, werkruimteRol, ROL_TEKST, type WerkruimteRol } from '../../shared/werkruimte-rechten';
import { actieVoorPad } from '../../shared/stap-op-acties';
import { beschrijfStapOp } from '../../shared/stap-op-beschrijving';
import { MELDING_SOORTEN, isBekendeSoort } from '../../shared/melding-soorten';
import { NA_0107_VIA_VOORVOEGSEL, SFEER_PER_SOORT, sfeerVanSoort } from '../../shared/meldingen-soorten';
import { uitlegVoor } from '../../shared/meldingen-v2/uitleg-register';
import { meldingDoel } from '../../shared/menu-meldingen';

const NIEUW = ['workspace_role_changed', 'workspace_access_revoked', 'workspace_invite_accepted'] as const;

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-014-rechten');

  // ================================================================ (а) таблиця ролей: shared = стара canManageRole
  {
    const verschil: string[] = [];
    const huidigen: Array<WerkruimteRol | undefined> = [undefined, ...WERKRUIMTE_ROLLEN];
    for (const rol of WERKRUIMTE_ROLLEN) for (const doel of WERKRUIMTE_ROLLEN) for (const huidig of huidigen) {
      // Стара реалізація (до IDENTITEIT-014, backend/werkruimte-delen.ts): штучний actor із роллю в просторі + canManageRole.
      const actor = { role: rol as string, accessLevel: 'full', email: '' };
      const oud = magDelen(rol) && canManageRole(actor, doel) && (huidig === undefined || canManageRole(actor, huidig));
      if (oud !== magRolBeheren(rol, doel, huidig)) verschil.push(`${rol}:${doel}:${huidig ?? '-'}`);
    }
    check('ролі: magRolBeheren збігається зі старою canManageRole на всіх 4×4×5 поєднаннях', verschil.length === 0, verschil.join(' '));
    const tabel = (rol: WerkruimteRol) => WERKRUIMTE_ROLLEN.filter((d) => magRolBeheren(rol, d)).join(',');
    check('ролі: власник надає admin/member/viewer (не owner); admin — admin/member/viewer; member і viewer — нічого',
      tabel('owner') === 'admin,member,viewer' && tabel('admin') === 'admin,member,viewer' && tabel('member') === '' && tabel('viewer') === '',
      WERKRUIMTE_ROLLEN.map((r) => `${r}=${tabel(r)}`).join(' '));
    check('ролі: admin не чіпає власника (huidig=owner) і ніхто не стає owner', !magRolBeheren('admin', 'viewer', 'owner') && !magRolBeheren('owner', 'owner') && !magRolBeheren('admin', 'owner'));
    check('ролі: без ролі (null/undefined) — нічого не можна', !magDelen(null) && !magDelen(undefined) && !magRolBeheren(null, 'viewer') && !magRolBeheren(undefined, 'viewer'));
    check('ролі: werkruimteRol — owner, явна роль, editor→member, решта→viewer, null',
      werkruimteRol({ permission: 'owner' }) === 'owner' && werkruimteRol({ permission: 'editor', workspaceRole: 'admin' }) === 'admin' && werkruimteRol({ permission: 'editor' }) === 'member'
      && werkruimteRol({ permission: 'viewer' }) === 'viewer' && werkruimteRol({ permission: 'editor', workspaceRole: 'owner' }) === 'member' && werkruimteRol(null) === null);
    check('ролі: hoogsteRol ніколи не знижує; rollenUitLidmaatschappen бере найвищу з дублікатів',
      hoogsteRol('admin', 'viewer') === 'admin' && hoogsteRol('viewer', 'member') === 'member' && hoogsteRol(null, 'viewer') === 'viewer'
      && rollenUitLidmaatschappen([{ workspaceId: 'a', permission: 'viewer' }, { workspaceId: 'a', permission: 'editor', workspaceRole: 'admin' }, { workspaceId: 'b', permission: 'editor' }]).get('a') === 'admin'
      && rollenUitLidmaatschappen([{ workspaceId: 'b', permission: 'editor' }]).get('b') === 'member');
    const bron = readFileSync('shared/werkruimte-rechten.ts', 'utf8');
    check('ролі: shared/werkruimte-rechten.ts не імпортує серверний код (можна в браузері)', !/from\s+['"][^'"]*(backend|server)\//.test(bron) && !/\bimport\s/.test(bron.replace(/\/\/.*$/gm, '')));
    check('ролі: backend/werkruimte-delen.ts реекспортує ТІ САМІ функції (один код, без копії)',
      delen.werkruimteRol === werkruimteRol && delen.magDelen === magDelen && delen.magRolBeheren === magRolBeheren && delen.hoogsteRol === hoogsteRol && !readFileSync('backend/werkruimte-delen.ts', 'utf8').includes('canManageRole'));
    check('ролі: назви для людей uk/nl для кожної ролі', WERKRUIMTE_ROLLEN.every((r) => ROL_TEKST[r][0] && ROL_TEKST[r][1]) && ROL_TEKST.admin[1] === 'Beheerder');
  }

  // ================================================================ (в) step-up: шлях → дія «deel-beheerder», ніколи не запам'ятовується
  {
    check('step-up: /api/share/email|link|role → «deel-beheerder»; /api/share/link/revoke і /api/share/members — ні',
      ['/api/share/email', '/api/share/link', '/api/share/role'].every((p) => actieVoorPad(p) === 'deel-beheerder') && actieVoorPad('/api/share/link/revoke') !== 'deel-beheerder' && actieVoorPad('/api/share/members') !== 'deel-beheerder');
    check('step-up: «deel-beheerder» ніколи не запам\'ятовується браузером', NOOIT_ONTHOUDEN.includes('deel-beheerder') && !onthoudMagVoorPad('/api/share/role'));
    const b = beschrijfStapOp(actieVoorPad('/api/share/role'), '/api/share/role'); // так само, як вікно в src/platform/bevestig-toegang.tsx
    check('step-up: вікно «Підтвердіть доступ» називає дію і наслідок обома мовами', b.bekend && b.gevaar && /адміністратор/.test(b.uk) && /beheerder/.test(b.nl) && /запрошувати/.test(b.gevolgUk) && /uitnodigen/.test(b.gevolgNl), JSON.stringify(b));
  }

  // ================================================================ (г) нові типи сповіщень — у всіх таблицях
  {
    check('сповіщення: три нові типи в MELDING_SOORTEN (тип «delen»)', NIEUW.every((k) => isBekendeSoort(k) && MELDING_SOORTEN[k].type === 'delen'));
    check('сповіщення: у реєстрі сфер — особисті, і правило префікса 0107 дає те саме (нова міграція не потрібна)',
      NIEUW.every((k) => SFEER_PER_SOORT[k] === 'prive' && sfeerVanSoort(k) === 'prive' && NA_0107_VIA_VOORVOEGSEL.has(k)));
    check('сповіщення: у меню ведуть до hub, категорія «delen»', NIEUW.every((k) => meldingDoel(k).categorie === 'delen' && meldingDoel(k).item === 'pg:hub/overview'));
    const uitleg = NIEUW.map((k) => uitlegVoor({ id: k, dienst: 'site', soort: k, ernst: 'info', titel: 't', tijd: 0, gelezen: false } as never).id);
    check('сповіщення: пояснення «delen-rechten», а не «безпека облікового запису» (access_ у назві не збиває)', uitleg.every((id) => id === 'delen-rechten'), uitleg.join(','));
    const r = delen.deelMeldingTekst('workspace_role_changed', { wie: 'Олена', ruimte: 'Сім\'я', oud: 'member', nieuw: 'admin' });
    const v = delen.deelMeldingTekst('workspace_access_revoked', { wie: '', ruimte: 'Робота' });
    const a = delen.deelMeldingTekst('workspace_invite_accepted', { wie: 'x@example.test', ruimte: 'Р\u0007', nieuw: 'viewer' });
    check('сповіщення: тексти обома мовами, з наслідком, без керівних символів, з запасним іменем',
      /«Редагування» → «Адміністратор»/.test(r.tekst) && /«Bewerken» → «Beheerder»/.test(r.tekst) && /запрошувати інших/.test(r.tekst) && /anderen uitnodigen/.test(r.tekst)
      && /Учасник \/ Een lid/.test(v.tekst) && /зникне з вашого списку/.test(v.tekst) && /blijven bij de eigenaar/.test(v.tekst)
      && !/\u0007/.test(a.tekst) && /«Перегляд»/.test(a.tekst) && /«Lezen»/.test(a.tekst) && / \/ /.test(a.titel), JSON.stringify([r, v, a]).slice(0, 600));
  }

  // ================================================================ маршрути проти бази
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const G = await nepGoogle({ ownerEmail: `i014-eig-${T}@example.test` });
  const pool = getPool();
  const oud = Math.floor(Date.now() / 1000) - 3600;
  type Browser = ReturnType<typeof G.browser>;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const hub = ({ b }: { b: Browser }, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('hub.tarasevych.com', pad, b.ctxBody('hub', extra));
  const idv = ({ b }: { b: Browser }, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('id.tarasevych.com', pad, b.ctxBody('identity', extra));
  /** Новий схвалений обліковий запис; давній auth_time — тобто БЕЗ свіжого підтвердження (step-up). */
  const maak = async (naam: string, metNaam = true) => {
    const email = `i014-${naam}-${T}@example.test`, b = G.browser(), sub = `i014-${naam}-${T}`;
    await b.aanmelden(sub, email, { intent: 'login', authTime: oud, iat: oud });
    const id = await idRij(email);
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', ...(metNaam ? { name: `Проба ${naam}` } : { name: '' }) })]);
    return { b, email, id, sub };
  };
  /** Свіже підтвердження через (підроблений) Google. Google переписує ім'я профілю на адресу — повертаємо «Проба …», щоб тексти були передбачувані. */
  const stapOp = async (p: { b: Browser; sub: string; email: string; id: string }, naam: string) => {
    await p.b.aanmelden(p.sub, p.email, { intent: 'step-up' });
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [p.id, JSON.stringify({ name: naam })]);
  };
  const meldingen = async (userId: string, kind: string) => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'=$2 order by seq", [userId, kind])).rows.map((r: { data: Record<string, any> }) => r.data);
  const lid = async (ws: string, userId: string) => (await pool.query("select id, data->>'workspaceRole' r, data->>'status' s from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'userId'=$2", [ws, userId])).rows[0] as { id: string; r: string; s: string } | undefined;
  const auditRij = async (accountId: string, event: string) => (await pool.query("select data->'details' d from app.records where tbl='security_audit' and data->>'accountId'=$1 and data->>'event'=$2 order by seq desc limit 1", [accountId, event])).rows[0]?.d as Record<string, unknown> | undefined;
  const wacht = () => new Promise((r) => setTimeout(r, 150)); // сповіщення йдуть після відповіді (void)
  const zoekVeld = (o: unknown, veld: string): unknown => { if (!o || typeof o !== 'object') return undefined; if (veld in (o as Record<string, unknown>)) return (o as Record<string, unknown>)[veld]; for (const v of Object.values(o as Record<string, unknown>)) { const x = zoekVeld(v, veld); if (x !== undefined) return x; } return undefined; };

  try {
    const O = await maak('o'), A = await maak('a'), M = await maak('m'), V = await maak('v', false), B = await maak('b');
    const ws = String((await hub(O, '/api/workspace/load')).data.workspace?.id || '');
    const wsB = String((await hub(B, '/api/workspace/load')).data.workspace?.id || '');
    for (const p of [A, M, V]) await hub(p, '/api/workspace/load');
    check('підготовка: два простори (O і B)', !!ws && !!wsB && ws !== wsB);

    // ---- (в) step-up для ролі «адміністратор»
    const zonder = await hub(O, '/api/share/email', { workspaceId: ws, email: A.email, workspaceRole: 'admin' });
    check('step-up: власник надає «admin» за адресою без свіжого підтвердження → 403 STEP_UP_REQUIRED, учасника не створено',
      zonder.status === 403 && zonder.data.reasonCode === 'STEP_UP_REQUIRED' && !(await lid(ws, A.id)), `${zonder.status} ${JSON.stringify(zonder.data)}`);
    const linkZonder = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'admin' });
    const linkPermissie = await hub(O, '/api/share/link', { workspaceId: ws, permission: 'admin' });
    const linkKijker = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer' });
    check('step-up: посилання з роллю «admin» (і через workspaceRole, і через permission) → 403; посилання «viewer» — 200 без підтвердження',
      linkZonder.status === 403 && linkZonder.data.reasonCode === 'STEP_UP_REQUIRED' && linkPermissie.status === 403 && linkKijker.status === 200 && !!linkKijker.data.code,
      `${linkZonder.status} ${linkPermissie.status} ${linkKijker.status}`);
    const lidZonder = await hub(O, '/api/share/email', { workspaceId: ws, email: M.email, workspaceRole: 'member' });
    check('step-up: «Редагування» за адресою — без підтвердження (200, учасник активний)', lidZonder.status === 200 && (await lid(ws, M.id))?.r === 'member');

    await stapOp(O, 'Проба o');
    const met = await hub(O, '/api/share/email', { workspaceId: ws, email: A.email, workspaceRole: 'admin' });
    check('step-up: після свіжого підтвердження власник робить A адміністратором (200, роль admin)', met.status === 200 && (await lid(ws, A.id))?.r === 'admin', `${met.status} ${JSON.stringify(met.data)}`);
    await wacht();
    check('сповіщення: нова людина отримує «Новий спільний простір» з іменем власника (не workspace_role_changed)',
      (await meldingen(A.id, 'workspace_share')).some((m) => /Проба o надав вам доступ/.test(m.message)) && (await meldingen(A.id, 'workspace_role_changed')).length === 0,
      JSON.stringify(await meldingen(A.id, 'workspace_share')));

    // ---- (б) роль у кожному просторі
    const bootA = await hub(A, '/api/bootstrap');
    const ruimtesA = (bootA.data.workspaces || []) as Array<{ id: string; workspaceRole?: string; shared: boolean }>;
    check('bootstrap: у hub кожен простір має workspaceRole (власний — owner, спільний — admin)',
      ruimtesA.some((w) => w.id === ws && w.shared && w.workspaceRole === 'admin') && ruimtesA.some((w) => !w.shared && w.workspaceRole === 'owner'), JSON.stringify(ruimtesA));
    const laadA = await hub(A, '/api/workspace/load', { workspaceId: ws });
    const laadM = await hub(M, '/api/workspace/load', { workspaceId: ws });
    const laadO = await hub(O, '/api/workspace/load', { workspaceId: ws });
    check('workspace/load: workspaceRole з того самого доступу (A admin, M member, O owner)', laadA.data.workspaceRole === 'admin' && laadM.data.workspaceRole === 'member' && laadO.data.workspaceRole === 'owner', `${laadA.data.workspaceRole} ${laadM.data.workspaceRole} ${laadO.data.workspaceRole}`);
    const ledenA = await hub(A, '/api/share/members', { workspaceId: ws }), ledenM = await hub(M, '/api/share/members', { workspaceId: ws });
    check('share/members: повертає й роль того, хто питає (A — admin, M — member), список учасників лишився масивом',
      ledenA.data.rol === 'admin' && ledenM.data.rol === 'member' && Array.isArray(ledenA.data.members) && ledenA.data.members.length >= 2);
    const modelA = await idv(A, '/api/owner/session/bootstrap');
    const deelA = zoekVeld(modelA.data, 'deelWerkruimtes') as Array<{ id: string; name: string; rol: string }> | undefined;
    check('модель налаштувань: deelWerkruimtes — власний простір (owner) і спільний, де A адміністратор (admin)',
      Array.isArray(deelA) && deelA.some((w) => w.id === ws && w.rol === 'admin' && !!w.name) && deelA.some((w) => w.id !== ws && w.rol === 'owner'), `${modelA.status} ${JSON.stringify(deelA)}`);
    const modelM = await idv(M, '/api/owner/session/bootstrap');
    const deelM = zoekVeld(modelM.data, 'deelWerkruimtes') as Array<{ id: string; rol: string }> | undefined;
    check('модель налаштувань: простір, де M лише редагує, у deelWerkruimtes НЕ потрапляє', Array.isArray(deelM) && !deelM.some((w) => w.id === ws) && deelM.every((w) => w.rol === 'owner'), JSON.stringify(deelM));

    // ---- зміна ролі: адміністратор без/зі step-up, сповіщення цілі
    const lidM = await lid(ws, M.id);
    const promoZonder = await hub(A, '/api/share/role', { workspaceId: ws, memberId: lidM?.id, workspaceRole: 'admin' });
    check('step-up: адміністратор підвищує M до admin без підтвердження → 403 STEP_UP_REQUIRED, роль лишилась member',
      promoZonder.status === 403 && promoZonder.data.reasonCode === 'STEP_UP_REQUIRED' && (await lid(ws, M.id))?.r === 'member');
    const omlaagZonder = await hub(A, '/api/share/role', { workspaceId: ws, memberId: lidM?.id, workspaceRole: 'viewer' });
    await wacht();
    const naarKijker = (await meldingen(M.id, 'workspace_role_changed')).at(-1);
    check('зміна ролі: зниження до «Перегляд» не потребує підтвердження; M отримує сповіщення з наслідком (uk/nl)',
      omlaagZonder.status === 200 && (await lid(ws, M.id))?.r === 'viewer' && !!naarKijker && /«Редагування» → «Перегляд»/.test(naarKijker.message) && /alleen bekijken/.test(naarKijker.message) && /Проба a/.test(naarKijker.message),
      `${omlaagZonder.status} ${JSON.stringify(naarKijker)}`);
    await stapOp(A, 'Проба a');
    const promo = await hub(A, '/api/share/role', { workspaceId: ws, memberId: lidM?.id, workspaceRole: 'admin' });
    await wacht();
    const naarAdmin = (await meldingen(M.id, 'workspace_role_changed')).at(-1);
    check('зміна ролі: після підтвердження A робить M адміністратором; M отримує «Вашу роль змінено» з тим, що тепер може',
      promo.status === 200 && (await lid(ws, M.id))?.r === 'admin' && !!naarAdmin && /«Перегляд» → «Адміністратор»/.test(naarAdmin.message) && /запрошувати інших/.test(naarAdmin.message) && naarAdmin.ruimte !== 'technisch',
      `${promo.status} ${JSON.stringify(naarAdmin)}`);
    const auditRol = await auditRij(A.id, 'workspace_member_role_changed');
    check('аудит: зміна ролі записана зі старою й новою роллю', auditRol?.workspaceRole === 'admin' && auditRol?.vorigeRol === 'viewer', JSON.stringify(auditRol));
    const nogmaals = await hub(A, '/api/share/role', { workspaceId: ws, memberId: lidM?.id, workspaceRole: 'admin' });
    await wacht();
    check('зміна ролі: та сама роль ще раз — без нового сповіщення', nogmaals.status === 200 && (await meldingen(M.id, 'workspace_role_changed')).length === 2);
    const herdeel = await hub(O, '/api/share/email', { workspaceId: ws, email: M.email, workspaceRole: 'member' });
    await wacht();
    check('зміна ролі через повторне «Надати доступ» за адресою: активний учасник отримує workspace_role_changed, а не «Новий простір»',
      herdeel.status === 200 && (await meldingen(M.id, 'workspace_role_changed')).length === 3 && (await meldingen(M.id, 'workspace_share')).length === 1);

    // ---- вступ за посиланням: автору — «запрошення прийнято»
    const join = await hub(V, '/api/share/join', { code: linkKijker.data.code });
    await wacht();
    const aanvaard = await meldingen(O.id, 'workspace_invite_accepted');
    check('вступ за посиланням: автор посилання (O) отримує workspace_invite_accepted з адресою людини (ім\'я порожнє) і роллю',
      join.status === 200 && aanvaard.length === 1 && aanvaard[0].message.includes(V.email) && /«Перегляд»/.test(aanvaard[0].message) && (await lid(ws, V.id))?.r === 'viewer', `${join.status} ${JSON.stringify(aanvaard)}`);

    // ---- запрошення на адресу без облікового запису → активація → сповіщення автору
    const N = `i014-n-${T}@example.test`;
    const uitn = await hub(A, '/api/share/email', { workspaceId: ws, email: N, workspaceRole: 'viewer' });
    const Nb = await maak('n');
    const { emailZichtbaarheidVoorTests } = await import('../../backend/index');
    const [nRij] = (await pool.query("select id, data from app.records where tbl='users' and id=$1", [Nb.id])).rows;
    await emailZichtbaarheidVoorTests.activateInvites({ ...nRij.data, id: nRij.id } as never);
    const naA = await meldingen(A.id, 'workspace_invite_accepted');
    check('запрошення за адресою: після активації автор (A) отримує workspace_invite_accepted, аудит записано',
      uitn.status === 200 && (await lid(ws, Nb.id))?.s === 'active' && naA.length === 1 && /Проба n/.test(naA[0].message) && (await auditRij(Nb.id, 'workspace_invite_accepted'))?.invitedBy === A.id,
      `${uitn.status} ${JSON.stringify(await lid(ws, Nb.id))} ${JSON.stringify(naA)}`);

    // ---- відкликання: цілі — сповіщення; власний вихід — без нього
    const vLid = await lid(ws, V.id);
    const zelfWeg = await hub(V, '/api/share/revoke', { workspaceId: ws, memberId: vLid?.id });
    const nLid = await lid(ws, Nb.id);
    const weg = await hub(O, '/api/share/revoke', { workspaceId: ws, memberId: nLid?.id });
    await wacht();
    const ingetrokken = await meldingen(Nb.id, 'workspace_access_revoked');
    check('відкликання: людина, яку вилучив інший, отримує workspace_access_revoked; хто вийшов сам — ні',
      zelfWeg.status === 200 && weg.status === 200 && ingetrokken.length === 1 && /Проба o/.test(ingetrokken[0].message) && /ingetrokken/.test(ingetrokken[0].title) && (await meldingen(V.id, 'workspace_access_revoked')).length === 0,
      `${zelfWeg.status} ${weg.status} ${JSON.stringify(ingetrokken)}`);

    // ---- давня вада: без імені в профілі сповіщення казало «undefined надав вам доступ.» — тепер адреса
    await pool.query(`update app.records set data = data - 'name' where tbl='users' and id=$1`, [B.id]);
    const zonderNaam = await hub(B, '/api/share/email', { workspaceId: wsB, email: V.email, workspaceRole: 'viewer' });
    await wacht();
    const vanB = (await meldingen(V.id, 'workspace_share')).at(-1);
    // IDENTITEIT-014 (herstel): workspace_share тепер «uk / nl» з простором і роллю (рецензія: було лише українською) — текст
    // починається тією самою фразою з адресою, тож перевірка лишається тією ж (адреса замість «undefined»), але не на рівність.
    check('давня вада: власник без імені → «<адреса> надав вам доступ…», без «undefined»',
      zonderNaam.status === 200 && !!vanB && vanB.message.startsWith(`${B.email} надав вам доступ до простору «`) && / \/ «/.test(vanB.message) && vanB.message.includes(`«${B.email}» gaf u toegang`) && !/undefined/.test(vanB.message), JSON.stringify(vanB));

    // ---- межі не змінилися: учасник без права ділитися; чужий простір
    const lidDeelt = await hub(B, '/api/share/email', { workspaceId: ws, email: `i014-x-${T}@example.test`, workspaceRole: 'admin' });
    check('межа: не-учасник простору не може надати admin навіть «до step-up» (403 Share access required, а не запит підтвердження)',
      lidDeelt.status === 403 && lidDeelt.data.error === 'Share access required', `${lidDeelt.status} ${JSON.stringify(lidDeelt.data)}`);
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i014-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await pool.query("delete from app.records where tbl='workspace_members' and data->>'workspaceId' in (select id from app.records where tbl='workspaces' and data->>'ownerUserId' = any($1))", [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    }
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);
  return einde();
}
