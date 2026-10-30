// Elke POGING om een update uit te rollen laat een spoor na (eigenaar 20.10.2026, migratie 0081).
//
// De vraag van de eigenaar: «Чому сервіс в історії останніх розгортань не відмітив невдалу спробу встановлення, навіть якщо була
// помилка завантаження?» Het antwoord: de afbreking gebeurde in de BROWSER (NotReadableError van de File API) vóór of tijdens het
// versturen van de stukken, dus de server hoorde er niets van; een half geüpload pakket bleef op 'uploaden' staan zonder reden,
// zonder etappe en zonder percentage. Deze test dekt de nieuwe keten:
//   A. de pure bron (shared/uitrol-pogingen.ts): etappes, reden uit de ENIGE bron, en «обірвано без причини» als eigen geval;
//   B. de route POST /api/uitrol/poging/afgebroken: bewaren met versie/etappe/reden, percentage, hervatten, journaal;
//   C. de grenzen: frequentie, veldlengtes, een gelogen percentage, en een vreemd voorstel (niemand schrijft in de geschiedenis
//      van een ander);
//   D. de server zelf: een 'uploaden' dat niemand afmaakte wordt 'afgebroken' met een uitlegbare code én laat een spoor na;
//   E. opruimen: bewaartermijn en maximum per account;
//   F. de interface: «Останні розгортання» en «Уся історія» tonen elke poging, met etappe, percentage, reden en de echte actie.
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closePool, getPool } from '../../server/platform/pg';
import { ZONDER_REDEN, POGING_ETAPPES, POGING_LIMIETEN, etappeTekst, pogingActie, pogingKernCode, pogingOorzaak } from '../../shared/uitrol-pogingen';
import { UITROL_CODES } from '../../shared/uitrol-codes';
import { ACTIE_LABELS } from '../../shared/beheer-journaal';
import { checker } from './hulp/nep-google';

type Check = (n: string, ok: boolean, i?: string) => void;

// ------------------------------------------------------------------------------------------------ A. pure bron
function pureTests(check: Check) {
  check('A1: elke etappe heeft een naam in uk én nl (en nooit de kale id)', POGING_ETAPPES.every((e) => {
    const uk = etappeTekst('uk', e); const nl = etappeTekst('nl', e);
    return uk.length > 3 && nl.length > 3 && uk !== e && nl !== e && uk !== nl;
  }), POGING_ETAPPES.map((e) => `${e}=${etappeTekst('uk', e)}`).join(' | '));
  check('A2: onbekende etappe blijft zichtbaar, nooit leeg', etappeTekst('uk', 'nieuw-iets') === 'nieuw-iets' && etappeTekst('uk', '').length > 3);

  const lees = pogingOorzaak('uk', 'BESTAND_LEZEN|NotReadableError');
  check('A3: leesfout van de schijf heeft een ZEKERE oorzaak uit de enige bron en noemt nooit «сервер повернув»',
    lees.zeker && /NotReadableError/.test(lees.waarom) && !/Сервер повернув|сервер повернув/.test(lees.waarom) && lees.doen.length > 20, lees.waarom.slice(0, 120));

  const zonder = pogingOorzaak('uk', '', false);
  const zonderNl = pogingOorzaak('nl', ZONDER_REDEN, false);
  check('A4: «обірвано без причини» is een EIGEN geval: zeker = false, en de tekst zegt dat het tabblad of het netwerk weg was',
    !zonder.zeker && /без причини/.test(zonder.waarom) && /вкладку закрито|мережа/.test(zonder.waarom) && !zonderNl.zeker && /zonder reden/.test(zonderNl.waarom), zonder.waarom.slice(0, 140));
  check('A5: een BEKENDE reden is te onderscheiden van «без причини»', pogingOorzaak('uk', 'BESTAND_LEZEN|NotReadableError').zeker && !pogingOorzaak('uk', ZONDER_REDEN).zeker);

  check('A6: UPLOAD_ONDERBROKEN|<code>|<pct> valt terug op de echte code', pogingKernCode('UPLOAD_ONDERBROKEN|HTTP_502|41') === 'HTTP_502'
    && pogingOorzaak('uk', 'UPLOAD_ONDERBROKEN|HTTP_502|41').zeker && pogingKernCode('UPLOAD_ONDERBROKEN||7') === ZONDER_REDEN);
  const onbekend = pogingOorzaak('uk', 'IETS_HEEL_NIEUWS');
  check('A7: onbekende code → eerlijk «причина невідома» MET de rauwe code, nooit een verzonnen oorzaak',
    !onbekend.zeker && /невідома/.test(onbekend.waarom) && /IETS_HEEL_NIEUWS/.test(onbekend.waarom), onbekend.waarom.slice(0, 120));
  check('A8: de codes van de keten staan in de enige codetabel (geen tweede tabel met teksten)',
    [ZONDER_REDEN, 'UPLOAD_NIET_VOLTOOID', 'UPLOAD_STIL', 'UPLOAD_TE_OUD'].every((c) => !!UITROL_CODES[c] && UITROL_CODES[c].uk.length > 10 && UITROL_CODES[c].nl.length > 10));
  check('A9: actie per poging: verder gaan alleen als er echt al bytes op de server staan',
    pogingActie({ hervatbaar: true, ontvangen: 1000 }) === 'hervatten' && pogingActie({ hervatbaar: true, ontvangen: 0 }) === 'opnieuw' && pogingActie({ hervatbaar: false, ontvangen: 9000 }) === 'opnieuw');
  check('A10: de gebeurtenis heeft een naam in het beheerlogboek', !!ACTIE_LABELS['uitrol_poging_afgebroken']);
}

// ------------------------------------------------------------------------------------------------ B–E. routes en database
async function dbTests(basis: string, check: Check) {
  const m = await import('../../backend/uitrol-goedkeuring');
  const pg = await import('../../backend/uitrol-pogingen');
  const sys = getPool('systeem');
  const oud = { a: process.env.UITROL_VOORSTEL_DIR, b: process.env.GOEDKEUR_INBOX, c: process.env.OPDRACHT_STATUS_DIR };
  Object.assign(process.env, {
    UITROL_VOORSTEL_DIR: join(basis, 'voorstellen'), GOEDKEUR_INBOX: join(basis, 'inbox'), OPDRACHT_STATUS_DIR: join(basis, 'status'),
  });
  const OWNER = `up-owner-${randomUUID()}`, HELPER = `up-helper-${randomUUID()}`, TWEEDE = `up-tweede-${randomUUID()}`, ANDER = `up-ander-${randomUUID()}`, SNEL = `up-snel-${randomUUID()}`;
  const users: Record<string, { id: string; role: string; status: string; email: string }> = {
    [OWNER]: { id: OWNER, role: 'owner', status: 'approved', email: process.env.OWNER_EMAIL || 'eigenaar@test.invalid' },
    [HELPER]: { id: HELPER, role: 'user', status: 'approved', email: `h-${HELPER}@example.test` },
    [TWEEDE]: { id: TWEEDE, role: 'user', status: 'approved', email: `t-${TWEEDE}@example.test` },
    [ANDER]: { id: ANDER, role: 'user', status: 'approved', email: `a-${ANDER}@example.test` },
    [SNEL]: { id: SNEL, role: 'user', status: 'approved', email: `s-${SNEL}@example.test` },
  };
  // Eén eigenaar per database (records_een_eigenaar); de sessie-mock geeft rol en e-mail, de rij blijft 'member'.
  for (const u of Object.values(users)) await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [u.id, { email: u.role === 'owner' ? `${u.id}@example.test` : u.email, role: u.role === 'owner' ? 'member' : u.role, status: u.status }]);
  let stepUp = false;
  const routes = m.uitrolGoedkeuringRoutes({
    requireSession: async (event: any) => ({ user: users[event.who], service: event.service ?? 'admin' }) as any,
    stepUp: async () => (stepUp ? null : { statusCode: 403, headers: {}, body: JSON.stringify({ error: 'STEP_UP_REQUIRED' }) } as any),
    sterkeStapOp: async () => null,
  });
  const call = async (route: string, who: string, body: Record<string, unknown> = {}) => {
    const res: any = await routes[route][0]({ event: { who, headers: {} }, body } as any);
    let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
    return { status: res.statusCode as number, data, fout: String(data?.error || data?.reasonCode || '') };
  };
  const grantVoor = async (wie: string) => { stepUp = true; const g = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'account', onderwerp: wie, dagen: 3 }); stepUp = false; return String(g.data?.voorbereider?.id || ''); };
  const melden = (who: string, body: Record<string, unknown>) => call('POST /api/uitrol/poging/afgebroken', who, body);
  const rij = async (id: string) => (await sys.query('SELECT * FROM app.uitrol_pogingen WHERE id = $1', [id])).rows[0];

  // De versiekolom is UNIEK over de hele database; deze test draait vaker op dezelfde testdatabase, dus eerst de eigen versies weg
  // (anders weigert «voorstel/begin» met VERSIE_BESTAAT_AL en meet de test iets anders dan ze denkt).
  const VERSIES = ['20261020-080000', '20261020-080100', '20261020-080200', '20261020-080300', '20261020-080400'];
  try {
    await sys.query('DELETE FROM app.uitrol_voorstellen WHERE versie = ANY($1::text[])', [VERSIES]);
    const grantHelper = await grantVoor(HELPER);
    check('B0: voorbereider heeft een grant (voorwaarde voor alles hieronder)', !!grantHelper);

    // ---- B1. afbreking op het LEZEN, er is nog geen voorstel op de server
    const b1 = await melden(HELPER, { etappe: 'lezen', code: 'BESTAND_LEZEN|NotReadableError', versie: '20261020-080000', sha256: 'a'.repeat(64), bytes: 4_000_000, bestand: 'mijn-ruimte-20261020-080000.tar.gz', poging: 1 });
    const r1 = b1.data?.id ? await rij(String(b1.data.id)) : null;
    check('B1: obрив на читанні файлу (ще без пакета) wordt bewaard met versie, etappe en reden',
      b1.status === 200 && !!r1 && r1.voorstel_id === null && r1.versie === '20261020-080000' && r1.etappe === 'lezen'
      && r1.code === 'BESTAND_LEZEN|NotReadableError' && r1.reden_bekend === true && r1.gemeld_door === 'browser' && r1.account_id === HELPER,
      JSON.stringify({ status: b1.status, fout: b1.fout, r1: r1 && { v: r1.versie, e: r1.etappe, c: r1.code, p: r1.voorstel_id, a: r1.account_id } }));

    // ---- B2. afbreking MIDDEN in de upload: percentage en «verder gaan waar het stopte»
    const begin = await call('POST /api/uitrol/voorstel/begin', HELPER, { version: '20261020-080100', bytes: 1000, sha256: 'b'.repeat(64) });
    const voorstelId = String(begin.data?.id || '');
    await call('POST /api/uitrol/voorstel/stuk', HELPER, { id: voorstelId, offset: 0, data: Buffer.alloc(410).toString('base64') });
    const b2 = await melden(HELPER, { etappe: 'uploaden', code: 'BESTAND_LEZEN|NotReadableError', voorstelId, verstuurd: 410, bytes: 1000, poging: 2 });
    const r2 = b2.data?.id ? await rij(String(b2.data.id)) : null;
    const lijst2 = (await call('POST /api/owner/uitrol/pogingen', OWNER, { limiet: 20 })).data as { pogingen: Array<{ id: string; procent: number; hervatbaar: boolean; ontvangen: number; etappe: string; versie: string }> };
    const uit2 = lijst2.pogingen.find((p) => p.id === String(b2.data?.id));
    check('B2: обрив посеред завантаження wordt bewaard met percentage en laat «Продовжити» toe',
      !!r2 && r2.etappe === 'uploaden' && Number(r2.procent) === 41 && Number(r2.verstuurd) === 410 && r2.voorstel_id === voorstelId
      && !!uit2 && uit2.procent === 41 && uit2.hervatbaar === true && uit2.ontvangen === 410 && uit2.versie === '20261020-080100',
      JSON.stringify({ begin: { s: begin.status, f: begin.fout, d: begin.data }, r2: r2 && { p: r2.procent, v: r2.verstuurd }, uit2 }));

    // ---- B3. tabblad gesloten: EERLIJK zonder reden, en te onderscheiden van een bekende reden
    const b3 = await melden(HELPER, { etappe: 'uploaden', code: '', voorstelId, verstuurd: 410, bytes: 1000 });
    const r3 = b3.data?.id ? await rij(String(b3.data.id)) : null;
    check('B3: закрита вкладка (geen code) geeft een eerlijk «обірвано без причини», geen verzonnen oorzaak',
      !!r3 && r3.code === ZONDER_REDEN && r3.reden_bekend === false && !pogingOorzaak('uk', r3.code, r3.reden_bekend).zeker,
      JSON.stringify(r3 && { c: r3.code, b: r3.reden_bekend }));
    const b3b = await melden(HELPER, { etappe: 'uploaden', code: ZONDER_REDEN, redenBekend: true, voorstelId, verstuurd: 410, bytes: 1000 });
    const r3b = b3b.data?.id ? await rij(String(b3b.data.id)) : null;
    check('B3b: een client kan «zonder reden» niet als bekende reden laten doorgaan', !!r3b && r3b.reden_bekend === false);

    // ---- B4. zichtbaar in de geschiedenis (eigenaarsroute) en in het beheerlogboek, langs dezelfde weg als de andere uitrolgebeurtenissen
    // Gefilterd op de voorbereider van DEZE testrun (de testdatabase houdt regels van eerdere runs; het label bevat het unieke e-mailadres).
    const lijst = (await call('POST /api/owner/uitrol/pogingen', OWNER, { limiet: 50, q: users[HELPER].email })).data as { pogingen: Array<{ id: string; gemeldDoor: string }>; totaal: number };
    check('B4: записи видно в історії (POST /api/owner/uitrol/pogingen)',
      lijst.totaal >= 4 && lijst.pogingen.length >= 4 && lijst.pogingen.every((p) => p.gemeldDoor === 'browser')
      && [b1, b2, b3, b3b].every((r) => lijst.pogingen.some((p) => p.id === String(r.data?.id))),
      JSON.stringify({ totaal: lijst.totaal, n: lijst.pogingen.length }));
    check('B4b: een gewone gebruiker mag die geschiedenis niet lezen', (await call('POST /api/owner/uitrol/pogingen', HELPER)).status === 403);
    const journaal = (await sys.query("SELECT details FROM app.audit WHERE action = 'uitrol_poging_afgebroken' AND actor_id = $1 ORDER BY created_at DESC", [HELPER]).catch(() => ({ rows: [] as any[] }))).rows;
    check('B4c: te саме потрапляє в адмін-журнал (uitrol_poging_afgebroken) met etappe, code en percentage',
      journaal.length >= 4 && journaal.some((r: any) => (r.details?.etappe ?? JSON.parse(r.details || '{}').etappe) === 'uploaden'),
      JSON.stringify(journaal.slice(0, 1)));

    // ---- C. grenzen
    const lang = `X${'Y'.repeat(400)}`;
    const c1 = await melden(HELPER, { etappe: 'lezen', code: lang, bestand: 'z'.repeat(400), poging: 99999, versie: '20261020-080200' });
    const rc1 = c1.data?.id ? await rij(String(c1.data.id)) : null;
    check('C1: межі розміру полів дотримані (code ≤ 120, bestand ≤ 160, poging ≤ 999)',
      !!rc1 && String(rc1.code).length === POGING_LIMIETEN.maxCode && String(rc1.bestand).length === POGING_LIMIETEN.maxBestand && Number(rc1.poging) === POGING_LIMIETEN.maxPoging,
      JSON.stringify(rc1 && { c: String(rc1.code).length, b: String(rc1.bestand).length, p: rc1.poging }));
    const c2 = await melden(HELPER, { etappe: 'uploaden', code: 'NETWORK_ERROR', bytes: 1000, verstuurd: 0, procent: 99 });
    const rc2 = c2.data?.id ? await rij(String(c2.data.id)) : null;
    check('C2: een client kan geen vals percentage in de geschiedenis zetten (het wordt uit de bytes herrekend)', !!rc2 && Number(rc2.procent) === 0, JSON.stringify(rc2 && { p: rc2.procent }));
    check('C3: onbekende etappe geweigerd', (await melden(HELPER, { etappe: 'ergens-anders', code: 'NETWORK_ERROR' })).fout === 'ETAPPE_ONGELDIG');

    // ---- C4. чужий користувач не може писати чужі записи
    check('C4: zonder grant mag niemand melden', (await melden(ANDER, { etappe: 'lezen', code: 'NETWORK_ERROR' })).fout === 'GEEN_VOORBEREIDER_GRANT');
    await grantVoor(TWEEDE);
    const c5 = await melden(TWEEDE, { etappe: 'uploaden', code: 'NETWORK_ERROR', voorstelId, verstuurd: 999, bytes: 1000 });
    const naTweede = Number((await sys.query('SELECT count(*)::int AS n FROM app.uitrol_pogingen WHERE voorstel_id = $1 AND account_id = $2', [voorstelId, TWEEDE])).rows[0].n);
    check('C5: een ander mag geen poging op het voorstel van iemand anders schrijven', c5.status === 404 && c5.fout === 'NIET_GEVONDEN' && naTweede === 0, JSON.stringify({ c5: c5.fout, naTweede }));
    const eigen = await melden(TWEEDE, { etappe: 'lezen', code: 'NETWORK_ERROR', versie: '20261020-080300' });
    const rEigen = eigen.data?.id ? await rij(String(eigen.data.id)) : null;
    check('C5b: het account in de regel komt ALTIJD van de sessie, nooit uit het verzoeklichaam', !!rEigen && rEigen.account_id === TWEEDE);

    // ---- C6. frequentielimiet
    const grantSnel = await grantVoor(SNEL);
    let geweigerd = '';
    for (let i = 0; i < POGING_LIMIETEN.perUur + 1 && !geweigerd; i++) {
      const r = await melden(SNEL, { etappe: 'lezen', code: 'NETWORK_ERROR' });
      if (r.status !== 200) geweigerd = `${r.status}:${r.fout}@${i + 1}`;
    }
    check('C6: межа частоти дотримана (RATE_LIMITED na de limiet per uur)', geweigerd === `429:RATE_LIMITED@${POGING_LIMIETEN.perUur + 1}`, `${geweigerd} grant=${grantSnel}`);

    // ---- D. de server zelf: een 'uploaden' dat niemand afmaakte
    const dBegin = await call('POST /api/uitrol/voorstel/begin', HELPER, { version: '20261020-080400', bytes: 2000, sha256: 'c'.repeat(64) });
    const dId = String(dBegin.data?.id || '');
    await call('POST /api/uitrol/voorstel/stuk', HELPER, { id: dId, offset: 0, data: Buffer.alloc(500).toString('base64') });
    await sys.query(`UPDATE app.uitrol_voorstellen SET aangemaakt_op = now() - interval '2 hours', bijgewerkt_op = now() - interval '2 hours' WHERE id = $1`, [dId]);
    await m.opruimenVoorstellen();
    const dRij = (await sys.query('SELECT status, uitkomst_code FROM app.uitrol_voorstellen WHERE id = $1', [dId])).rows[0];
    const dPoging = (await sys.query('SELECT * FROM app.uitrol_pogingen WHERE voorstel_id = $1 AND gemeld_door = $2', [dId, 'server'])).rows[0];
    check('D1: прострочені «uploaden» стають «afgebroken» met een uitlegbare reden (geen kale code)',
      dRij?.status === 'afgebroken' && dRij?.uitkomst_code === 'UPLOAD_STIL' && !!UITROL_CODES[String(dRij?.uitkomst_code)], JSON.stringify(dRij));
    check('D2: die afbreking laat een spoor na, met etappe, percentage en «виявлено сервером» (niet verward met de browser)',
      !!dPoging && dPoging.etappe === 'uploaden' && Number(dPoging.procent) === 25 && dPoging.code === 'UPLOAD_STIL' && dPoging.gemeld_door === 'server' && dPoging.account_id === HELPER,
      JSON.stringify(dPoging && { e: dPoging.etappe, p: dPoging.procent, c: dPoging.code, g: dPoging.gemeld_door }));
    check('D3: zo’n pakket bezet geen plek van «TE_VEEL_OPEN» meer', Number((await sys.query("SELECT count(*)::int AS n FROM app.uitrol_voorstellen WHERE id = $1 AND status IN ('uploaden','wacht-op-goedkeuring')", [dId])).rows[0].n) === 0);

    // ---- E. opruimen (bewaartermijn en maximum per account)
    const EIG = `up-oud-${randomUUID()}`;
    await sys.query(`INSERT INTO app.uitrol_pogingen (etappe, code, gemeld_door, account_id, aangemaakt_op)
      SELECT 'lezen', 'NETWORK_ERROR', 'browser', $1, now() - make_interval(days => $2) FROM generate_series(1, 3)`, [EIG, POGING_LIMIETEN.bewaarDagen + 1]);
    await sys.query(`INSERT INTO app.uitrol_pogingen (etappe, code, gemeld_door, account_id)
      SELECT 'lezen', 'NETWORK_ERROR', 'browser', $1 FROM generate_series(1, $2)`, [EIG, POGING_LIMIETEN.maxPerAccount + 7]);
    const opgeruimd = await pg.pogingenOpruimen();
    const over = Number((await sys.query('SELECT count(*)::int AS n FROM app.uitrol_pogingen WHERE account_id = $1', [EIG])).rows[0].n);
    check('E1: прибирання працює: te oude regels weg en nooit meer dan het maximum per account',
      opgeruimd.oud >= 3 && over === POGING_LIMIETEN.maxPerAccount, JSON.stringify({ opgeruimd, over, max: POGING_LIMIETEN.maxPerAccount }));
  } finally {
    Object.assign(process.env, { UITROL_VOORSTEL_DIR: oud.a, GOEDKEUR_INBOX: oud.b, OPDRACHT_STATUS_DIR: oud.c });
    // Eigen sporen opruimen: de testdatabase wordt hergebruikt, en buurtests lezen lijsten met een LIMIT (bv. «Кому дозволено»,
    // LIMIT 200 op e-mail). Een test die accounts en regels laat staan, laat zo'n lijst op den duur omslaan.
    const ids = Object.keys(users);
    await sys.query('DELETE FROM app.uitrol_pogingen WHERE account_id = ANY($1::text[]) OR account_id LIKE $2', [ids, 'up-oud-%']).catch(() => undefined);
    // Volgorde telt: uitrol_voorstellen verwijst naar uitrol_voorbereiders (FK).
    await sys.query('DELETE FROM app.uitrol_voorstellen WHERE versie = ANY($1::text[]) OR account_id = ANY($2::text[])', [VERSIES, ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.uitrol_voorbereiders WHERE account_id = ANY($1::text[])', [ids]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1::text[])", [ids]).catch(() => undefined);
  }
}

// ------------------------------------------------------------------------------------------------ F. interface
function uiTests(check: Check) {
  const pogingen = readFileSync('src/uitrol/Pogingen.tsx', 'utf8');
  const hist = readFileSync('src/uitrol/Geschiedenis.tsx', 'utf8');
  const admin = readFileSync('src/BeheerUitrolWeergave.tsx', 'utf8');
  const upload = readFileSync('src/uitrol/Upload.tsx', 'utf8');
  const melden = readFileSync('src/uitrol/poging-melden.ts', 'utf8');

  check('F1: elke poging toont версію, етап, відсоток, причину, час en wie het voorbereidde',
    /etappeTekst\(lang, p\.etappe\)/.test(pogingen) && /p\.procent/.test(pogingen) && /pogingOorzaak\(lang, p\.code, p\.redenBekend\)/.test(pogingen)
    && /datum\(lang, p\.tijd\)/.test(pogingen) && /p\.voorbereider/.test(pogingen) && /p\.versie/.test(pogingen));
  check('F2: de reden komt uit de ENIGE bron (geen tweede tabel met teksten in de component)',
    /from '\.\.\/\.\.\/shared\/uitrol-pogingen'/.test(pogingen) && !/Record<string, \[string, string\]>/.test(pogingen));
  check('F3: «повідомлено браузером» staat erbij, zodat het niet met de server wordt verward', /повідомлено браузером/.test(pogingen) && /data-bron=\{p\.gemeldDoor\}/.test(pogingen));
  check('F4: «без причини» is als apart geval zichtbaar', /без причини/.test(pogingen) && /oorzaak\.zeker/.test(pogingen));
  check('F5: actie «Продовжити» of «Почати заново», afhankelijk van wat echt mogelijk is',
    /pogingActie\(p\)/.test(pogingen) && /Продовжити/.test(pogingen) && /Почати заново/.test(pogingen) && /data-ut-poging-hervat/.test(pogingen));
  // 22.10.2026 (zone B): «Уся історія» is één tijdlijn (geschiedenis-tijdlijn.ts) waarin de pogingen op datum tussen de runs staan.
  check('F6: «Уся історія» en «Останні розгортання» tonen de pogingen',
    /bouwTijdlijn\(/.test(hist) && /api\.post\('\/api\/owner\/uitrol\/pogingen'/.test(hist) && /<Pogingen /.test(admin) && /\/api\/owner\/uitrol\/pogingen/.test(admin));
  check('F7: de wizard meldt elke afbreking: lezen, begin, uploaden, klaar, voorcontrole en een gesloten tabblad',
    ["etappe: 'lezen'", "etappe: 'begin'", "etappe: 'uploaden'", "etappe: 'klaar'", "etappe: 'voorcontrole'"].every((s) => upload.includes(s))
    && /addEventListener\('pagehide'/.test(upload) && /meldAfbreking/.test(upload));
  check('F8: de melding mag de echte fout nooit verdringen (geen await, keepalive, stille catch)',
    /keepalive: true/.test(melden) && /\.catch\(\(\) => undefined\)/.test(melden) && !/await fetch/.test(melden) && /telPoging\(/.test(melden));
  check('F9: tekstpaar per melding (tr(lang, uk, nl)) in de nieuwe component', (pogingen.match(/tr\(lang,/g) || []).length > 8);
}

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-pogingen-20261020');
  const basis = mkdtempSync(join(tmpdir(), 'uitrol-pogingen-'));
  try {
    pureTests(check);
    await dbTests(basis, check);
    uiTests(check);
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err));
  } finally {
    rmSync(basis, { recursive: true, force: true });
    await closePool().catch(() => undefined);
  }
  return einde();
}
