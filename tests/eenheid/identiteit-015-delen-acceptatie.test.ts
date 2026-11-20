// IDENTITEIT-015 (приймання групи «delen», 14.11.2026): вади, які знайшов e2e tests/e2e/identiteit-015-delen.e2e.ts (розділ A),
// і їхні виправлення — перевірка без браузера.
//  1. Одержувач запрошення за адресою (облікового запису ще не було / не схвалений) не отримував жодного сповіщення, коли доступ
//     починався (activateInvites); «Новий спільний простір» ішов одразу й лише наявному запису — навіть не схваленому.
//  2. Право «Редагування» обіцяє «Зможе додавати й змінювати блоки», сервер дозволяє, але в інтерфейсі не було місця, де учасник
//     міг би додати блок до спільного простору: вибір простору у формі блоку центру мав лише власні простори.
//  3. Давнє посилання «Відкрити в просторі» / запам'ятований простір після відкликання доступу — hub мовчки показував власний простір.
//  4. Підсумок «Ви вийшли з простору» інколи не з'являвся: той самий текст показувався ще до перезавантаження й після нього
//     вважався повтором (див. також tests/eenheid/identiteit-015-delen.test.ts).
// Лише вигадані дані; назовні не йде нічого. / Acceptatie «delen»: gevonden fouten en hun herstel, zonder browser.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-015-delen-acceptatie.test.ts
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { blokWerkruimtes } from '../../src/delen/delen-logica';
import { RUIMTE_ONTBREEKT, ruimteGeweigerd, ruimteOntbreekt } from '../../src/open-in-ruimte';

const lees = (f: string) => readFileSync(f, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-delen-acceptatie');

  // ================================================================ (2) вибір простору для нового блоку
  {
    const eigen = [{ id: 'e1', name: 'Мій простір' }];
    const gedeeld = [
      { id: 's-lid', name: 'Сім\'я', rol: 'member' as const },
      { id: 's-beheer', name: 'Робота', rol: 'admin' as const },
      { id: 's-kijk', name: 'Клуб', rol: 'viewer' as const },
      { id: 's-lid', name: 'Сім\'я (повтор)', rol: 'member' as const },
      { id: 'e1', name: 'Мій простір (як спільний)', rol: 'admin' as const },
    ];
    const lijst = blokWerkruimtes(eigen, gedeeld);
    check('блок: власні простори — першими, з роллю owner', lijst[0]?.id === 'e1' && lijst[0]?.rol === 'owner' && lijst[0]?.name === 'Мій простір');
    check('блок: спільні з роллю «Редагування» (member) і «Адміністратор» — є; глядача — немає; без повторів',
      JSON.stringify(lijst.map((w) => `${w.id}:${w.rol}`)) === JSON.stringify(['e1:owner', 's-lid:member', 's-beheer:admin']), JSON.stringify(lijst));
    check('блок: без власних просторів учасник усе одно може вибрати спільний', blokWerkruimtes([], gedeeld.slice(0, 4)).map((w) => w.id).join(',') === 's-lid,s-beheer');
    check('блок: лише глядач — вибирати нічого (форма вимкнена)', blokWerkruimtes([], [{ id: 'k', name: 'К', rol: 'viewer' }]).length === 0);
    const centrum = lees('src/InstellingencentrumWeergave.tsx');
    check('центр: вибір «Робочий простір» форми блоку будується з blokWerkruimtes (власні + deelWerkruimtes + lidWerkruimtes) і позначає роль',
      centrum.includes('blokWerkruimtes(p.activeWorkspaces,[...(p.deelWerkruimtes||[]),...(p.lidWerkruimtes||[])])') && centrum.includes('{blokLijst.map(item=><option key={item.id} value={item.id}>{item.name}{item.rol===\'owner\'?\'\'')
      && centrum.includes("disabled={!blokLijst.length}"));
    check('центр: простір, якого вже немає в переліку (роль знижено / доступ відкликано), не лишається вибраним',
      centrum.includes('if((!workspaceId||!blokLijst.some(w=>w.id===workspaceId))&&blokLijst[0])setWorkspaceId(blokLijst[0].id)'));
  }

  // ================================================================ (3) простору більше немає — пояснення в hub
  {
    check('hub: ruimteOntbreekt — так, лише коли переліки вже є й простору з адреси серед них немає',
      ruimteOntbreekt({ werkruimte: 'x', blok: '' }, [{ id: 'a' }]) && !ruimteOntbreekt({ werkruimte: 'a', blok: '' }, [{ id: 'a' }]) && !ruimteOntbreekt({ werkruimte: 'x', blok: '' }, []) && !ruimteOntbreekt(null, [{ id: 'a' }]));
    check('hub: ruimteGeweigerd — лише 403 «Workspace access denied» (інші відмови й мережеві помилки — ні)',
      ruimteGeweigerd({ response: { status: 403, data: { error: 'Workspace access denied' } } }) && !ruimteGeweigerd({ response: { status: 403, data: { error: 'Approval required' } } })
      && !ruimteGeweigerd({ response: { status: 500, data: { error: 'Workspace access denied' } } }) && !ruimteGeweigerd(new Error('x')) && !ruimteGeweigerd(null));
    check('hub: пояснення обома мовами каже, що сталося і що показано', /недоступний/.test(RUIMTE_ONTBREEKT[0]) && /відкликали або ви з нього вийшли/.test(RUIMTE_ONTBREEKT[0]) && /niet \(meer\) voor u beschikbaar/.test(RUIMTE_ONTBREEKT[1]));
    const app = lees('src/App.tsx'), hook = lees('src/open-in-ruimte.ts');
    check('hub: відмова 403 під час завантаження простору й адреса на недоступний простір — позначка ruimteWeg; пояснення — лише після входу і не затирає вже показаний підсумок',
      app.includes('if (ruimteGeweigerd(e)) { setRuimteWeg(true); return; }') && app.includes('onNietBeschikbaar: () => setRuimteWeg(true)')
      && app.includes("if (ruimteWeg && state === 'authorized') { setRuimteWeg(false); setMessage((m) => m || (lang === 'uk' ? RUIMTE_ONTBREEKT[0] : RUIMTE_ONTBREEKT[1])); }")
      && hook.includes('if (ruimteOntbreekt(d, p.spaces)) { klaar(); p.onNietBeschikbaar?.(); return; }'));
  }

  // ================================================================ (4) підсумок «Ви вийшли з простору» — лише після перезавантаження
  {
    const hook = lees('src/delen/useDelen.ts');
    const deel = hook.slice(hook.indexOf('const vertrekken = useCallback'), hook.indexOf('}, []);', hook.indexOf('const vertrekken = useCallback')));
    check('вихід: до перезавантаження підсумок не показується (лише зберігається), помилка — показується одразу',
      /const gelukt = \(paar: Paar\) => \{ bewaarMeldingNaHerladen\(paar\); return true; \};/.test(deel) && !/melding\(paar\)/.test(deel) && /melding\(foutNaarTekst\(e\)/.test(deel));
    const app = lees('src/App.tsx'), vd = lees('src/VerenigdDienstApp.tsx');
    check('вихід: обидва виклики після успіху одразу перезавантажують сторінку (тому показ до перезавантаження не потрібен)',
      app.includes('if (await delen.vertrekken(id)) { setModal(null); location.reload(); }') && vd.length > 0 && lees('src/InstellingencentrumWeergave.tsx').includes("if(await delen.vertrekken(id)){setDeelWerkruimteId('');location.reload()}"));
  }

  // ================================================================ (1) сервер: сповіщення одержувачеві, коли доступ починається
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const G = await nepGoogle({ ownerEmail: `i015a-eig-${T}@example.test` });
  const pool = getPool();
  type Browser = ReturnType<typeof G.browser>;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const hub = ({ b }: { b: Browser }, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('hub.tarasevych.com', pad, b.ctxBody('hub', extra));
  const aanmelden = async (naam: string) => { const email = `i015a-${naam}-${T}@example.test`, b = G.browser(); await b.aanmelden(`i015a-${naam}-${T}`, email, { intent: 'login' }); return { b, email, id: await idRij(email) }; };
  const goedkeuren = async (id: string, naam: string) => pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: naam })]);
  const meldingen = async (userId: string, kind: string) => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'=$2 order by seq", [userId, kind])).rows.map((r: { data: Record<string, any> }) => r.data);
  const lid = async (ws: string, userId: string) => (await pool.query("select data->>'status' s, data->>'workspaceRole' r from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'userId'=$2", [ws, userId])).rows[0] as { s: string; r: string } | undefined;
  const wacht = () => new Promise((r) => setTimeout(r, 250)); // сповіщення йдуть після відповіді (void)
  const activeer = async (id: string) => { const { emailZichtbaarheidVoorTests } = await import('../../backend/index'); const [rij] = (await pool.query("select id, data from app.records where tbl='users' and id=$1", [id])).rows; await emailZichtbaarheidVoorTests.activateInvites({ ...rij.data, id: rij.id } as never); };

  try {
    const O = await aanmelden('o'); await goedkeuren(O.id, 'Власниця Проба');
    const ws = String((await hub(O, '/api/workspace/load')).data.workspace?.id || '');
    const naam = String((await hub(O, '/api/workspace/load')).data.workspace?.name || '');

    // а) обліковий запис є, але ще не схвалений → запрошення «invited», сповіщення ще немає
    const P = await aanmelden('p');
    const uitP = await hub(O, '/api/share/email', { workspaceId: ws, email: P.email, workspaceRole: 'member' });
    await wacht();
    check('не схвалений обліковий запис: запрошення збережено (invited), «Новий спільний простір» ще НЕ надіслано (доступу ще немає)',
      uitP.status === 200 && uitP.data.status === 'invited' && (await meldingen(P.id, 'workspace_share')).length === 0, `${uitP.status} ${JSON.stringify(await meldingen(P.id, 'workspace_share'))}`);
    await goedkeuren(P.id, 'Учасниця Проба'); await activeer(P.id); await wacht();
    const pM = await meldingen(P.id, 'workspace_share'), oM = await meldingen(O.id, 'workspace_invite_accepted');
    check('після схвалення (activateInvites): одержувач active з роллю member і отримує ОДНЕ «Новий спільний простір» — хто, простір, роль',
      (await lid(ws, P.id))?.s === 'active' && (await lid(ws, P.id))?.r === 'member' && pM.length === 1 && pM[0].message.includes(`Власниця Проба надав вам доступ до простору «${naam}» з роллю «Редагування»`) && / \/ /.test(pM[0].title),
      JSON.stringify(pM));
    check('після схвалення: власниця отримує «Запрошення до простору прийнято» з іменем одержувача', oM.length === 1 && oM[0].message.includes('Учасниця Проба тепер має доступ'), JSON.stringify(oM));
    await activeer(P.id); await wacht();
    check('повторна активація нічого не дублює (запрошення вже не «invited»)', (await meldingen(P.id, 'workspace_share')).length === 1 && (await meldingen(O.id, 'workspace_invite_accepted')).length === 1);

    // б) облікового запису ще немає → після першого входу й схвалення — те саме сповіщення
    const nieuwEmail = `i015a-n-${T}@example.test`;
    const uitN = await hub(O, '/api/share/email', { workspaceId: ws, email: nieuwEmail, workspaceRole: 'viewer' });
    const N = await aanmelden('n');
    await goedkeuren(N.id, 'Новенька Проба'); await activeer(N.id); await wacht();
    const nM = await meldingen(N.id, 'workspace_share');
    check('адреса без облікового запису: після першого входу й схвалення — «Новий спільний простір» з роллю «Перегляд»',
      uitN.status === 200 && N.email === nieuwEmail && (await lid(ws, N.id))?.r === 'viewer' && nM.length === 1 && nM[0].message.includes('з роллю «Перегляд»'), JSON.stringify(nM));

    // в) схвалений обліковий запис → одразу active і одне сповіщення (як раніше)
    const A = await aanmelden('a'); await goedkeuren(A.id, 'Активна Проба');
    const uitA = await hub(O, '/api/share/email', { workspaceId: ws, email: A.email, workspaceRole: 'viewer' });
    await wacht();
    await activeer(A.id); await wacht();
    check('схвалений обліковий запис: одразу active і рівно одне «Новий спільний простір» (активація після цього нічого не додає)',
      uitA.status === 200 && (await lid(ws, A.id))?.s === 'active' && (await meldingen(A.id, 'workspace_share')).length === 1, JSON.stringify(await meldingen(A.id, 'workspace_share')));
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i015a-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      const wsIds = (await pool.query("select id from app.records where tbl='workspaces' and data->>'ownerUserId' = any($1)", [ids])).rows.map((r: { id: string }) => r.id);
      await pool.query("delete from app.records where tbl='workspace_members' and data->>'workspaceId' = any($1)", [wsIds]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    }
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);
  return einde();
}
