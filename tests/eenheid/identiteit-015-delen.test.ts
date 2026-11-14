// IDENTITEIT-015 (крок «delen», етап 2.2 + 3.10, 14.11.2026): приватні посилання й вихід із простору.
//  • строк посилання 1/7/30 днів з межею на сервері (shared/deel-links.ts замість константи INVITE_SECONDS), дата спливу у відповіді;
//  • перелік відкритих посилань простору (POST /api/share/link/lijst) лише для власника/адміністратора, код замаскований;
//  • відкликання за id з переліку (POST /api/share/link/revoke, linkId) — ідемпотентне, з аудитом і сповіщенням творцеві;
//  • необов'язкова прив'язка посилання до адреси (і давня вада: посилання на власну адресу → SHARE_SELF);
//  • «Вийти з простору» для власного рядка — власник отримує сповіщення workspace_member_left;
//  • міграція 0273: індекс і RLS для app.invites (роль застосунку не бачить жодного рядка).
// Поведінка — через справжні маршрути backend/index.ts проти одноразової бази й підробленого Google (tests/eenheid/hulp);
// інтерфейс — справжні складові src/delen, відмальовані на сервері. Лише вигадані дані; назовні не йде нічого.
// Privélinks: looptijd, lijst, intrekken op id, adresbinding en zelf vertrekken.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-015-delen.test.ts
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closePool, getPool } from '../../server/platform/pg';
import { invites } from '../../server/platform/uitnodigingen';
import { checker, nepGoogle } from './hulp/nep-google';
import { LINK_DAGEN, STANDAARD_LINK_DAGEN, dagenTekst, linkDagen, vervalTekst } from '../../shared/deel-links';
import * as delen from '../../backend/werkruimte-delen';
import { MELDING_SOORTEN, isBekendeSoort } from '../../shared/melding-soorten';
import { NA_0107_VIA_VOORVOEGSEL, SFEER_PER_SOORT, sfeerVanSoort } from '../../shared/meldingen-soorten';
import { uitlegVoor } from '../../shared/meldingen-v2/uitleg-register';
import { meldingDoel } from '../../shared/menu-meldingen';
import { GEEN_UITNODIGINGSMAIL, PER_ADRES_GELUKT, linkGemaakt, linkIntrekkenVraag, linkMakenVraag, vertrekkenVraag } from '../../src/delen/delen-logica';
import { deelWeigering } from '../../src/weigeringen';
import { LinksLijst, LinkOpties } from '../../src/delen/LinksLijst';
import { LedenLijst } from '../../src/delen/LedenLijst';

const NIEUW = ['workspace_share_link_revoked', 'workspace_member_left'] as const;
const DAG = 86_400_000;
const lees = (f: string) => readFileSync(f, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-delen');

  // ================================================================ (а) строк: одна таблиця для сервера й інтерфейсу
  {
    check('строк: лише 1/7/30; без вибору — 7 (як давня константа)', JSON.stringify(LINK_DAGEN) === '[1,7,30]' && STANDAARD_LINK_DAGEN === 7 && linkDagen(undefined) === 7 && linkDagen('') === 7);
    check('строк: 1, "30", 7 приймаються; 2, 0, -7, 31, 365, "7d", 1.5, NaN, {} — ні',
      linkDagen(1) === 1 && linkDagen('30') === 30 && linkDagen(7) === 7 && [2, 0, -7, 31, 365, '7d', 1.5, NaN, {}, [7]].every((v) => linkDagen(v) === null));
    check('строк: тексти «1 день / 7 днів / 30 днів» і «1 dag / 7 dagen / 30 dagen»',
      dagenTekst('uk', 1) === '1 день' && dagenTekst('uk', 7) === '7 днів' && dagenTekst('uk', 30) === '30 днів' && dagenTekst('nl', 1) === '1 dag' && dagenTekst('nl', 30) === '30 dagen');
    check('строк: дата спливу людською мовою; без дати — «без строку»; сміття — «—»',
      /2026/.test(vervalTekst('uk', '2026-11-21T10:00:00Z')) && vervalTekst('uk', null) === 'без строку' && vervalTekst('nl', 'x') === '—');
    const v1 = linkMakenVraag('uk', { ruimte: 'Р', keuze: 'viewer', dagen: 1 }), v30 = linkMakenVraag('nl', { ruimte: 'R', keuze: 'viewer', dagen: 30, email: 'a@example.test' });
    check('вікно «Створити посилання?»: вибраний строк і прив\'язка до адреси названі; без строку — 7 днів (як раніше)',
      v1.gevolgen.some((g) => /діє 1 день/.test(g)) && v30.gevolgen.some((g) => /30 dagen geldig/.test(g)) && v30.gevolgen.some((g) => /alleen voor wie zich aanmeldt met a@example\.test/.test(g))
      && linkMakenVraag('uk', { ruimte: 'Р', keuze: 'viewer' }).gevolgen.some((g) => /7 днів/.test(g)));
    const g = linkGemaakt(30, '2026-12-14T10:00:00Z');
    check('після створення: «діє 30 днів — до <дата>» обома мовами', /30 днів — до .*2026/.test(g[0]) && /30 dagen geldig — tot .*2026/.test(g[1]));
    check('відмова SHARE_LINK_DAYS_INVALID має текст для людини', /1, 7 або 30 днів/.test(deelWeigering({ response: { data: { error: 'SHARE_LINK_DAYS_INVALID' } } })?.[0] || ''));
  }

  // ================================================================ (б) нові типи сповіщень — у всіх таблицях
  {
    check('сповіщення: два нові типи в MELDING_SOORTEN (тип «delen»)', NIEUW.every((k) => isBekendeSoort(k) && MELDING_SOORTEN[k].type === 'delen'));
    check('сповіщення: особисті; правило префікса 0107 дає те саме (нова міграція не потрібна)', NIEUW.every((k) => SFEER_PER_SOORT[k] === 'prive' && sfeerVanSoort(k) === 'prive' && NA_0107_VIA_VOORVOEGSEL.has(k)));
    check('сповіщення: у меню ведуть до hub, категорія «delen»', NIEUW.every((k) => meldingDoel(k).categorie === 'delen' && meldingDoel(k).item === 'pg:hub/overview'));
    const uitleg = NIEUW.map((k) => uitlegVoor({ id: k, dienst: 'site', soort: k, ernst: 'info', titel: 't', tijd: 0, gelezen: false } as never).id);
    check('сповіщення: пояснення «delen-rechten» (а не загальне)', uitleg.every((id) => id === 'delen-rechten'), uitleg.join(','));
    const zelf = delen.deelMeldingTekst('workspace_share_link_revoked', { wie: 'А', ruimte: 'Р', zelf: true });
    const ander = delen.deelMeldingTekst('workspace_share_link_revoked', { wie: 'Олена', ruimte: 'Р' });
    const weg = delen.deelMeldingTekst('workspace_member_left', { wie: 'Петро', ruimte: 'Сім\'я' });
    const l30 = delen.deelMeldingTekst('workspace_share_link_created', { wie: '', ruimte: 'Р', nieuw: 'viewer', dagen: 30 });
    check('сповіщення: тексти з наслідком обома мовами (відкликано собою / іншим; учасник вийшов; створено на 30 днів)',
      /^Ви відкликали/.test(zelf.tekst) && /U trok/.test(zelf.tekst) && /Олена відкликає ваше/.test(ander.tekst) && /maak zo nodig een nieuwe/.test(ander.tekst)
      && /Петро виходить/.test(weg.tekst) && /тепер ваші/.test(weg.tekst) && /zijn nu van u/.test(weg.tekst) && /діє 30 днів/.test(l30.tekst) && /30 dagen geldig/.test(l30.tekst) && / \/ /.test(weg.titel));
  }

  // ================================================================ (в) чесний текст про лист-запрошення
  {
    const backend = lees('backend/index.ts');
    const shareEmail = backend.slice(backend.indexOf("'POST /api/share/email'"), backend.indexOf("'POST /api/share/link'"));
    check('лист: у POST /api/share/email немає надсилання пошти (немає поштової служби сайту) — текст це чесно каже',
      !!shareEmail && !/sendMail|sendNow|smtp|nodemailer|imapVerstuur|mailVersturen/i.test(shareEmail) && /не надсилає/.test(GEEN_UITNODIGINGSMAIL[0]) && /stuurt geen e-mail/.test(PER_ADRES_GELUKT[1]) && /після входу з цією адресою/.test(PER_ADRES_GELUKT[0]));
    check('лист: центр налаштувань показує пояснення біля запрошення (data-delen-geen-mail)', lees('src/InstellingencentrumWeergave.tsx').includes("data-delen-geen-mail='1'"));
  }

  // ================================================================ (г) маршрути проти бази
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const G = await nepGoogle({ ownerEmail: `i015d-eig-${T}@example.test` });
  const pool = getPool();
  type Browser = ReturnType<typeof G.browser>;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const hub = ({ b }: { b: Browser }, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('hub.tarasevych.com', pad, b.ctxBody('hub', extra));
  const maak = async (naam: string) => {
    const email = `i015d-${naam}-${T}@example.test`, b = G.browser(), sub = `i015d-${naam}-${T}`;
    await b.aanmelden(sub, email, { intent: 'login' });
    const id = await idRij(email);
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: `Проба ${naam}` })]);
    return { b, email, id, sub };
  };
  const meldingen = async (userId: string, kind: string) => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'=$2 order by seq", [userId, kind])).rows.map((r: { data: Record<string, any> }) => r.data);
  const auditTel = async (accountId: string, event: string) => Number((await pool.query("select count(*)::int n from app.records where tbl='security_audit' and data->>'accountId'=$1 and data->>'event'=$2", [accountId, event])).rows[0]?.n || 0);
  const lidRij = async (ws: string, userId: string) => (await pool.query("select id, data->>'status' s from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'userId'=$2", [ws, userId])).rows[0] as { id: string; s: string } | undefined;
  const invitesVan = async (ws: string) => Number((await pool.query("select count(*)::int n from app.invites where context->>'workspaceId'=$1", [ws])).rows[0]?.n || 0);
  const wacht = () => new Promise((r) => setTimeout(r, 200)); // сповіщення йдуть після відповіді (void)

  try {
    const O = await maak('o'), A = await maak('a'), M = await maak('m'), B = await maak('b'), X = await maak('x');
    const ws = String((await hub(O, '/api/workspace/load')).data.workspace?.id || '');
    const wsB = String((await hub(B, '/api/workspace/load')).data.workspace?.id || '');
    for (const p of [A, M, X]) await hub(p, '/api/workspace/load');
    check('підготовка: два простори', !!ws && !!wsB && ws !== wsB);

    // ---- строк
    const nu = Date.now();
    const l1 = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer', geldigDagen: 1 });
    const l30 = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer', geldigDagen: '30' });
    const l7 = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'member' });
    const vervalDb = async (code: string) => new Date((await pool.query('select expires_at from app.invites where code=$1', [code])).rows[0]?.expires_at).getTime();
    const binnen = (t: number, verwacht: number) => Math.abs(t - verwacht) < 120_000;
    check('строк: 1 день → expires_at у базі ≈ +1 доба, відповідь має expiresAt і geldigDagen',
      l1.status === 200 && l1.data.geldigDagen === 1 && l1.data.expiresInSeconds === 86400 && binnen(await vervalDb(String(l1.data.code)), nu + DAG) && binnen(new Date(String(l1.data.expiresAt)).getTime(), nu + DAG), JSON.stringify(l1.data));
    check('строк: 30 днів (рядком) → +30 діб', l30.status === 200 && l30.data.geldigDagen === 30 && binnen(await vervalDb(String(l30.data.code)), nu + 30 * DAG));
    check('строк: без вибору → 7 днів (старі клієнти працюють як раніше)', l7.status === 200 && l7.data.geldigDagen === 7 && l7.data.expiresInSeconds === 7 * 86400 && binnen(await vervalDb(String(l7.data.code)), nu + 7 * DAG));
    const voor = await invitesVan(ws);
    const fout2 = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer', geldigDagen: 2 });
    const fout365 = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer', geldigDagen: 365 });
    const foutTekst = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer', geldigDagen: '7 days' });
    check('межа на сервері: 2, 365, «7 days» → 400 SHARE_LINK_DAYS_INVALID, жодного нового рядка в app.invites',
      [fout2, fout365, foutTekst].every((r) => r.status === 400 && r.data.error === 'SHARE_LINK_DAYS_INVALID') && (await invitesVan(ws)) === voor);

    // ---- прив'язка до адреси
    const eigenAdres = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer', email: O.email.toUpperCase() });
    check('адреса (давня вада): посилання на власну адресу → 400 SHARE_SELF, нічого не створено', eigenAdres.status === 400 && eigenAdres.data.error === 'SHARE_SELF' && (await invitesVan(ws)) === voor);
    const lMail = await hub(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer', email: ` ${X.email.toUpperCase()} `, geldigDagen: 1 });
    const joinVerkeerd = await hub(M, '/api/share/join', { code: String(lMail.data.code) });
    check('адреса: посилання для X не спрацьовує для M → invite_not_allowed (і не згоряє)', lMail.status === 200 && lMail.data.emailBound === true && joinVerkeerd.status === 400 && joinVerkeerd.data.error === 'invite_not_allowed', JSON.stringify(joinVerkeerd.data));

    // ---- перелік
    await wacht();
    const lijst = await hub(O, '/api/share/link/lijst', { workspaceId: ws });
    const links = (lijst.data.links || []) as Array<{ id: string; code: string; workspaceRole: string; email: string; expiresAt: string; eigen: boolean }>;
    const ruw = JSON.stringify(lijst.data);
    const codes = [l1, l30, l7, lMail].map((r) => String(r.data.code));
    check('перелік: власник бачить 4 відкриті посилання, нові — першими; id — 32 hex; код замаскований (4 знаки + «…»)',
      lijst.status === 200 && links.length === 4 && links.every((l) => /^[0-9a-f]{32}$/.test(l.id) && /^.{4}…$/.test(l.code)) && links[0].email === X.email.toLowerCase(), ruw.slice(0, 500));
    check('перелік: повний код не потрапляє у відповідь', codes.every((c) => !ruw.includes(c)));
    check('перелік: роль, адреса, дата спливу й «ваше посилання»', links.some((l) => l.workspaceRole === 'member' && !l.email) && links.every((l) => l.eigen && !!l.expiresAt));
    // використане посилання зникає з переліку
    const join7 = await hub(M, '/api/share/join', { code: String(l7.data.code) });
    const naJoin = ((await hub(O, '/api/share/link/lijst', { workspaceId: ws })).data.links || []) as unknown[];
    check('перелік: використане одноразове посилання зникає (M приєднався з роллю «Редагування»)', join7.status === 200 && naJoin.length === 3 && (await lidRij(ws, M.id))?.s === 'active');
    // права на перелік
    const lijstM = await hub(M, '/api/share/link/lijst', { workspaceId: ws });
    const lijstB = await hub(B, '/api/share/link/lijst', { workspaceId: ws });
    check('перелік: учасник без права ділитися (member) і чужий власник → 403, посилань не видно',
      lijstM.status === 403 && lijstB.status === 403 && !lijstM.data.links && !lijstB.data.links, `${lijstM.status} ${lijstB.status}`);
    // старий рядок без geldigDagen (створений до цього кроку) теж у переліку
    const oud = await invites.create({ resourceType: 'workspace_share', authMode: 'anonymous', actor: { userId: O.id, email: O.email }, eenmalig: true, expiresInSec: 7 * 86400, context: { workspaceId: ws, permission: 'viewer', createdBy: O.id } });
    const metOud = ((await hub(O, '/api/share/link/lijst', { workspaceId: ws })).data.links || []) as Array<{ workspaceRole: string }>;
    check('сумісність: давнє посилання без поля строку й без workspaceRole показується як «Перегляд»', metOud.length === 4 && metOud[0].workspaceRole === 'viewer');

    // ---- відкликання за id: адміністратор відкликає посилання власника
    await pool.query("insert into app.records (tbl, id, data) values ('workspace_members', $1, $2::jsonb)", [`i015d-adm-${T}`, JSON.stringify({ workspaceId: ws, userId: A.id, email: A.email, permission: 'editor', workspaceRole: 'admin', scopeBlockIds: [], status: 'active', createdAt: Date.now(), updatedAt: Date.now() })]);
    const lijstA = ((await hub(A, '/api/share/link/lijst', { workspaceId: ws })).data.links || []) as Array<{ id: string; eigen: boolean }>;
    const doel = lijstA.find((l) => !!l);
    check('відкликання: адміністратор бачить посилання власника як «створив інший адміністратор» (eigen=false)', lijstA.length === 4 && lijstA.every((l) => l.eigen === false));
    const auditVoor = await auditTel(A.id, 'workspace_share_link_revoked');
    const r1 = await hub(A, '/api/share/link/revoke', { workspaceId: ws, linkId: doel!.id });
    const r2 = await hub(A, '/api/share/link/revoke', { workspaceId: ws, linkId: doel!.id });
    await wacht();
    const naIntrek = ((await hub(O, '/api/share/link/lijst', { workspaceId: ws })).data.links || []) as Array<{ id: string }>;
    const mO = await meldingen(O.id, 'workspace_share_link_revoked');
    check('відкликання: за id → 200; повторне натискання → 200 alIngetrokken; посилання зникло з переліку',
      r1.status === 200 && r1.data.ok === true && !r1.data.alIngetrokken && r2.status === 200 && r2.data.alIngetrokken === true && naIntrek.length === 3 && !naIntrek.some((l) => l.id === doel!.id), `${JSON.stringify(r1.data)} ${JSON.stringify(r2.data)}`);
    check('відкликання: рівно один запис в аудиті й одне сповіщення творцеві (з ім\'ям того, хто відкликав)',
      (await auditTel(A.id, 'workspace_share_link_revoked')) === auditVoor + 1 && mO.length === 1 && /Проба a відкликає ваше/.test(String(mO[0].message)), JSON.stringify(mO).slice(0, 300));
    const codeDoel = (await pool.query("select code from app.invites where left(encode(sha256(convert_to(code,'UTF8')),'hex'),32)=$1", [doel!.id])).rows[0]?.code as string;
    const joinNa = await hub(X, '/api/share/join', { code: codeDoel });
    check('відкликання: за відкликаним посиланням приєднатися не можна (invite_revoked або invite_not_allowed для прив\'язаного)', joinNa.status === 400 && /^invite_(revoked|not_allowed)$/.test(String(joinNa.data.error)), JSON.stringify(joinNa.data));
    // власник відкликає своє — сповіщення «Ви відкликали»
    const eigenDoel = naIntrek[0];
    const r3 = await hub(O, '/api/share/link/revoke', { workspaceId: ws, linkId: eigenDoel.id });
    await wacht();
    const mO2 = await meldingen(O.id, 'workspace_share_link_revoked');
    check('відкликання: власне посилання → сповіщення «Ви відкликали…»', r3.status === 200 && mO2.length === 2 && /^Ви відкликали/.test(String(mO2[1].message)));
    // чужий простір і учасник без права
    const linkB = await hub(B, '/api/share/link', { workspaceId: wsB, workspaceRole: 'viewer' });
    const idB = String(((await hub(B, '/api/share/link/lijst', { workspaceId: wsB })).data.links || [])[0]?.id || '');
    const kruis = await hub(O, '/api/share/link/revoke', { workspaceId: ws, linkId: idB });
    const kruisB = await hub(O, '/api/share/link/revoke', { workspaceId: wsB, linkId: idB });
    const blijft = ((await hub(B, '/api/share/link/lijst', { workspaceId: wsB })).data.links || []) as unknown[];
    check('відкликання: id посилання іншого простору в межах свого простору не знаходиться (404), а до чужого простору доступу немає (403); посилання B живе',
      linkB.status === 200 && !!idB && kruis.status === 404 && kruisB.status === 403 && blijft.length === 1, `${kruis.status} ${kruisB.status}`);
    const lidDoel = ((await hub(O, '/api/share/link/lijst', { workspaceId: ws })).data.links || [])[0] as { id: string };
    const doorM = await hub(M, '/api/share/link/revoke', { workspaceId: ws, linkId: lidDoel.id });
    check('відкликання: учасник без права ділитися не відкликає чуже посилання (403)', doorM.status === 403 && ((await hub(O, '/api/share/link/lijst', { workspaceId: ws })).data.links || []).length === 2, `${doorM.status} ${JSON.stringify(doorM.data)}`);
    const smerig = await hub(O, '/api/share/link/revoke', { workspaceId: ws, linkId: "x' or 1=1 --" });
    check('відкликання: id не того виду → 404, нічого не відкликано', smerig.status === 404 && ((await hub(O, '/api/share/link/lijst', { workspaceId: ws })).data.links || []).length === 2);

    // ---- вийти з простору
    const lidM = await lidRij(ws, M.id);
    const weg1 = await hub(M, '/api/share/revoke', { workspaceId: ws, memberId: lidM!.id });
    const weg2 = await hub(M, '/api/share/revoke', { workspaceId: ws, memberId: lidM!.id });
    await wacht();
    const mLeft = await meldingen(O.id, 'workspace_member_left');
    check('вихід: учасник виходить сам → 200; рядка більше немає; повтор → 404 (інтерфейс вважає це виконаним)', weg1.status === 200 && !(await lidRij(ws, M.id)) && weg2.status === 404);
    check('вихід: власник отримує одне сповіщення «Проба m виходить…» і в аудиті zelf=true',
      mLeft.length === 1 && /Проба m виходить із простору/.test(String(mLeft[0].message))
      && Number((await pool.query("select count(*)::int n from app.records where tbl='security_audit' and data->>'accountId'=$1 and data->>'event'='workspace_member_revoked' and data->'details'->>'zelf'='true'", [M.id])).rows[0]?.n) === 1);

    // ---- RLS 0273
    let appFout = '';
    try { await getPool('app').query('select count(*) from app.invites'); } catch (e) { appFout = String((e as Error).message); }
    const rls = (await pool.query("select relrowsecurity r from pg_class where oid='app.invites'::regclass")).rows[0]?.r;
    const idx = (await pool.query("select 1 from pg_indexes where schemaname='app' and tablename='invites' and indexname='invites_werkruimte_idx'")).rowCount;
    check('0273: RLS увімкнено, індекс є; роль застосунку не читає app.invites (permission denied)', rls === true && idx === 1 && (!process.env.DATABASE_URL_APP || /permission denied/.test(appFout)), appFout || 'geen fout');
    void oud;
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i015d-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      const wsIds = (await pool.query("select id from app.records where tbl='workspaces' and data->>'ownerUserId' = any($1)", [ids])).rows.map((r: { id: string }) => r.id);
      await pool.query("delete from app.invites where context->>'workspaceId' = any($1)", [wsIds]).catch(() => undefined);
      await pool.query("delete from app.records where tbl='workspace_members' and data->>'workspaceId' = any($1)", [wsIds]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    }
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);

  // ================================================================ (д) інтерфейс: справжні складові src/delen
  {
    const link = { id: 'a'.repeat(32), code: 'AbCd…', workspaceRole: 'member' as const, email: 'x@example.test', expiresAt: '2026-11-21T10:00:00Z', createdAt: '2026-11-14T10:00:00Z', eigen: false, blokken: 2 };
    const html = renderToStaticMarkup(createElement(LinksLijst, { lang: 'uk', links: [link], mag: true, onIntrekken: () => undefined }));
    check('UI: перелік показує замасковану назву, роль, адресу, дату спливу й «створив інший адміністратор»; кнопка «Відкликати» з підказкою наслідку',
      html.includes('AbCd…') && html.includes('Редагування') && html.includes('Лише для x@example.test') && /діє до .*2026/.test(html) && html.includes('створив інший адміністратор') && html.includes('>Відкликати<') && html.includes('перестане діяти одразу'), html.slice(0, 600));
    check('UI: без права ділитися перелік не відмальовується', renderToStaticMarkup(createElement(LinksLijst, { lang: 'uk', links: [link], mag: false, onIntrekken: () => undefined })) === '');
    const leeg = renderToStaticMarkup(createElement(LinksLijst, { lang: 'nl', links: [], mag: true, onIntrekken: () => undefined }));
    check('UI: порожній перелік пояснює, що використані/прострочені/відкликані не показуються (nl без кирилиці)', /geen open links/.test(leeg) && !/[А-Яа-яІіЇїЄє]/.test(leeg));
    const opties = renderToStaticMarkup(createElement(LinkOpties, { lang: 'uk', dagen: 7, onDagen: () => undefined, email: '', onEmail: () => undefined }));
    check('UI: вибір строку 1/7/30 (7 вибрано) і поле адреси з поясненням наслідку', /<option value="1">1 день/.test(opties) && /<option value="7" selected="">7 днів/.test(opties) && /<option value="30">30 днів/.test(opties) && opties.includes('type="email"') && opties.includes('лише після входу з нею'), opties.slice(0, 500));
    const v = linkIntrekkenVraag('uk', link), w = vertrekkenVraag('nl');
    check('UI: вікна «Відкликати посилання?» і «Werkruimte verlaten?» пояснюють наслідки', /перестане діяти одразу/.test(v.uitleg) && v.gevolgen.length === 3 && /eigenaar krijgt een melding/.test(w.gevolgen.join(' ')) && /nieuwe uitnodiging/.test(w.gevolgen.join(' ')));
    const leden = [{ id: 'l1', email: 'me@example.test', userId: 'u-me', permission: 'viewer', workspaceRole: 'viewer', status: 'active' }, { id: 'l2', email: 'o***@example.test', userId: 'u-x', permission: 'editor', workspaceRole: 'member', status: 'active' }];
    const lh = renderToStaticMarkup(createElement(LedenLijst, { lang: 'uk', leden, rol: 'viewer', eigenId: 'u-me', onRol: () => undefined, onIntrekken: () => undefined, onVertrekken: () => undefined }));
    check('UI: власний рядок має «Вийти з простору» (один раз), чужий — ні; без onVertrekken кнопки немає',
      (lh.match(/Вийти з простору/g) || []).length === 1 && lh.includes('data-delen-vertrekken') && !renderToStaticMarkup(createElement(LedenLijst, { lang: 'uk', leden, rol: 'viewer', eigenId: 'u-me', onRol: () => undefined, onIntrekken: () => undefined })).includes('Вийти з простору'));
    const adm = renderToStaticMarkup(createElement(LedenLijst, { lang: 'uk', leden: [{ ...leden[0], workspaceRole: 'admin', permission: 'editor' }], rol: 'admin', eigenId: 'u-me', onRol: () => undefined, onIntrekken: () => undefined, onVertrekken: () => undefined }));
    check('UI: адміністратор на власному рядку бачить «Вийти», а не «Відкликати» себе', adm.includes('Вийти з простору') && !adm.includes('>Відкликати<'));
    const hook = lees('src/delen/useDelen.ts'), centrum = lees('src/InstellingencentrumWeergave.tsx'), app = lees('src/App.tsx');
    check('UI: хук ходить на справжні маршрути (lijst, revoke з linkId, geldigDagen, email) і використовує deelWeigering/foutNaarTekst',
      hook.includes("'/api/share/link/lijst'") && hook.includes("'/api/share/link/revoke', { workspaceId: werkruimteId, linkId }") && hook.includes('geldigDagen: v.dagen') && hook.includes('deelWeigering(e)'));
    check('UI: центр налаштувань і hub мають «Відкриті посилання», вибір строку, дату спливу й «Вийти з простору»',
      centrum.includes("id='delen-links'") && centrum.includes('<LinkOpties') && centrum.includes('data-link-vervalt') && centrum.includes('onVertrekken=')
      && app.includes('<LinksLijst') && app.includes('<LinkOpties') && app.includes('data-link-vervalt') && app.includes('onVertrekken='));
  }
  return einde();
}
