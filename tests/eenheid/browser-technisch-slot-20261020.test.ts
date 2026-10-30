// Technisch slot van de browserhulpmiddelen (20.10.2026, punt 7 + punt 8 van de eigenaar).
//
// Wat hier vastligt:
//  1. de technische browserhulpmiddelen bestaan ALLEEN in de technische connector (naam op `_beheer`); de privékant blijft
//     ongewijzigd en de standaardrechten van een nieuwe koppeling bevatten geen enkele beheer-browsertool;
//  2. elk van de ZES voorwaarden (ruimte, gekoppeld slot, ondertekende ontgrendeling, mogelijkheid, host, profiel van het tabblad)
//     geeft APART haar eigen, uitlegbare weigering — nooit een kaal 403;
//  3. diepe diagnose buiten het technische slot weigert, en zonder het Chrome-recht noemt de weigering het pakket «diagnose»
//     met de stappen;
//  4. het erven van het technische profiel door een NIEUW tabblad is een keuze van de gebruiker en staat standaard UIT;
//  5. elke technische browseractie komt in het beheerjournaal (owner.tech.browser) met dienst, actie, host, tabblad en agent;
//  6. de markering in het tabblad is in het technische slot een andere kleur en een ander opschrift dan in het gebruikersslot.
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { agentOnline, attachAgentGateway } from '../../backend/connectors-gateway';
import * as grants from '../../backend/ai-toestemmingen';
import { BROWSER_TYPES } from '../../backend/browser-mogelijkheden';
import { RISKY_TOOLS } from '../../backend/connectors-hulpmiddelen';
import { newCommandKey, randomToken, sealCommandKey, sha256 } from '../../backend/connectors-crypto';
import * as store from '../../backend/connectors-opslag';
import { callTool } from '../../backend/connectors-hulpmiddelen';
import * as eo from '../../backend/extensie-ontgrendeling';
import * as techn from '../../backend/browser-technisch';
import { metNamens } from '../../backend/mcp-namens';
import { lijstTools } from '../../backend/mcp-connector';
import * as tp from '../../backend/tech-profiel';
import { getPool } from '../../server/platform/pg';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { ontleed, toolNaam, MAX_NAAM } from '../../shared/connector-v2/namen';
import { STANDAARD, kiesbaar } from '../../shared/connector-v2/rechten';
import { ADMIN_HOSTS_TOEGESTAAN, MARKERING_BADGE, MARKERING_KLEUREN, PRIVE_HOSTS } from '../../shared/extensie-ontgrendeling';
import { technischeBrowserPoort, verduidelijkExtensieFout, type TechnischeBrowserInvoer } from '../../shared/browser-technisch-slot';
import { markeringOpschrift } from '../../shared/markering-agenten';
import * as extShared from '../../extension/shared.js';
import { ontgrendelVoorTest } from './hulp/extensie-ontgrendeling';
import { checker } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => Promise<boolean> | boolean, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(40); }
  return false;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('browser-technisch-slot-20261020');
  const sys = getPool('systeem');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const U = `bts-u-${T}`;
  const server = createServer();
  attachAgentGateway(server, new Set(['127.0.0.1']));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  const agentIds: string[] = [];

  /** Nagebootste extensie 0.6.1 (één slot). `fout` = de extensie weigert elke opdracht met die tekst (zoals background.js doet). */
  const extensie = (token: string, fout?: string) => new Promise<{ ws: WebSocket; berichten: any[] }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/agent/ws`); sockets.push(ws);
    const berichten: any[] = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token, version: '0.6.2', capabilities: { kind: 'browser' } })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString()); berichten.push(m);
      if (m.t === 'ready') resolve({ ws, berichten });
      if (m.t === 'cmd') ws.send(JSON.stringify(fout ? { t: 'result', id: m.id, ok: false, error: fout } : { t: 'result', id: m.id, ok: true, data: { ok: true, type: m.type } }));
    });
    ws.on('error', reject);
  });
  const journaal = async (resultaat?: string) => Number((await sys.query(
    `SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'owner.tech.browser'${resultaat ? ' AND result = $2' : ''}`,
    resultaat ? [U, resultaat] : [U])).rows[0].n);
  const laatsteRegel = async () => (await sys.query(
    `SELECT result, details FROM app.audit WHERE owner_id = $1 AND action = 'owner.tech.browser' ORDER BY seq DESC LIMIT 1`, [U])).rows[0];

  try {
    // ============================================================== 1. catalogus: de technische kant bestaat, de standaard niet
    const browserOpties = V2_OPTIES.filter((o) => o.groep === 'browser' && o.status === 'actief');
    const beheer = browserOpties.filter((o) => o.kant === 'beheer');
    const gebruiker = browserOpties.filter((o) => o.kant === 'gebruiker');
    // 0110 (zone E): browser_script (evaluate_script) bestaat ALLEEN technisch; al het andere in beide ruimtes.
    check('catalogus: elk browserhulpmiddel bestaat in BEIDE ruimtes, behalve browser_script (alleen technisch)',
      beheer.length > 0 && beheer.length === gebruiker.length + 1 && gebruiker.every((g) => beheer.some((b) => b.id === g.id)) && beheer.some((b) => b.id === 'browser_script') && !gebruiker.some((g) => g.id === 'browser_script'),
      `beheer=${beheer.length} gebruiker=${gebruiker.length}`);
    const namen = beheer.map((o) => toolNaam(o, 'claude'));
    check('naam: de technische variant eindigt op `_beheer` en blijft binnen de ${MAX_NAAM} tekens van MCP',
      namen.every((n) => n.endsWith('_tarasevych_com_beheer') && n.length <= MAX_NAAM),
      `${namen.find((n) => n.length > MAX_NAAM) ?? 'ok'} (${MAX_NAAM})`);
    const diep = beheer.find((o) => o.id === 'browser_get_deep_diagnostics');
    const ontleedDiep = diep ? ontleed(toolNaam(diep, 'claude'), 'claude') : null;
    check('de technische naam is te ontleden en wijst naar dezelfde interne tool (diepe diagnose)',
      !!ontleedDiep?.ok && ontleedDiep.optie.kant === 'beheer' && ontleedDiep.optie.intern === 'browser_get_deep_diagnostics');
    check('een verbinding ZONDER technische kant kan geen enkele beheer-browsertool kiezen',
      kiesbaar(['gebruiker']).every((o) => o.kant === 'gebruiker') && !kiesbaar(['gebruiker']).some((o) => o.groep === 'browser' && o.kant === 'beheer'));
    check('standaardrechten van een nieuwe koppeling bevatten nooit een beheer-browsertool',
      !STANDAARD(['gebruiker']).some((k) => k.endsWith(':beheer')) && !STANDAARD(['gebruiker', 'beheer']).some((k) => k.endsWith(':beheer')));

    // ============================================================== 2. de zes voorwaarden, elk apart (pure poort)
    const basis: TechnischeBrowserInvoer = {
      ruimte: 'technisch', slot: true, beleidAan: true,
      ontgrendeling: { ruimte: 'technisch', caps: ['browser.read', 'browser.navigate', 'browser.debug'], domeinen: ['admin.tarasevych.com', 'mcp.tarasevych.com'] },
      type: 'browser.snapshot', cap: 'browser.read', urls: [], tabProfiel: 'technisch', diagRecht: 'ja',
    };
    const uit = (p: Partial<TechnischeBrowserInvoer>) => technischeBrowserPoort({ ...basis, ...p });
    check('alles in orde → de opdracht mag (en de mogelijkheid staat in het antwoord)', uit({}).ok === true);

    const v1 = uit({ ruimte: 'prive' });
    const v2 = uit({ slot: false });
    const v3 = uit({ ontgrendeling: null });
    const v3b = uit({ beleidAan: false });
    const v3c = uit({ ontgrendeling: { ruimte: 'prive', caps: ['browser.read'], domeinen: [...PRIVE_HOSTS] } });
    const v4 = uit({ type: 'browser.click', cap: 'browser.interact' });
    const v5 = uit({ type: 'browser.navigate', cap: 'browser.navigate', urls: ['https://hub.tarasevych.com/'] });
    const v6 = uit({ tabProfiel: 'gebruiker' });
    const alle = [v1, v2, v3, v4, v5, v6];
    check('1) buiten de technische ruimte → RUIMTE, met uitleg over de aparte technische verbinding',
      !v1.ok && v1.code === 'RUIMTE' && /EXTENSIE_RUIMTE/.test(v1.fout) && /private space/.test(v1.fout), !v1.ok ? v1.fout.slice(0, 90) : '');
    check('2) geen browser in het technische slot → SLOT, met de weg om het te koppelen',
      !v2.ok && v2.code === 'SLOT' && /TECHNICAL slot/.test(v2.fout) && /Browser extension/.test(v2.fout), !v2.ok ? v2.fout.slice(0, 90) : '');
    check('3) geen lopende ondertekende ontgrendeling → VERGRENDELD; beleid uit en een rij van het ANDERE slot geven dezelfde code met een eigen oorzaak',
      !v3.ok && v3.code === 'VERGRENDELD' && /no active signed unlock/.test(v3.fout)
      && !v3b.ok && v3b.code === 'VERGRENDELD' && /switched the TECHNICAL browser slot off/.test(v3b.fout)
      && !v3c.ok && v3c.code === 'VERGRENDELD' && /private slot/.test(v3c.fout),
      [v3, v3b, v3c].map((x) => (x.ok ? 'ok' : x.fout.slice(0, 60))).join(' | '));
    check('4) mogelijkheid niet in de ontgrendeling → CAP, met wat de ontgrendeling WEL geeft',
      !v4.ok && v4.code === 'CAP' && /browser\.interact/.test(v4.fout) && /browser\.read/.test(v4.fout), !v4.ok ? v4.fout.slice(0, 90) : '');
    check('5) host buiten ADMIN_HOSTS_TOEGESTAAN ∩ domeinen van de ontgrendeling → HOST, met de hosts die wél mogen',
      !v5.ok && v5.code === 'HOST' && /hub\.tarasevych\.com/.test(v5.fout) && /admin\.tarasevych\.com/.test(v5.fout), !v5.ok ? v5.fout.slice(0, 90) : '');
    check('6) tabblad niet in technische modus → PROFIEL, met de weg om het profiel te activeren',
      !v6.ok && v6.code === 'PROFIEL' && /EXTENSIE_PROFIEL/.test(v6.fout) && /technical profile/.test(v6.fout), !v6.ok ? v6.fout.slice(0, 90) : '');
    check('elke voorwaarde heeft een EIGEN code en een eigen tekst; nergens een kaal «403»',
      new Set(alle.map((x) => (x.ok ? 'ok' : x.code))).size === 6 && new Set(alle.map((x) => (x.ok ? '' : x.fout))).size === 6
      && alle.every((x) => !x.ok && x.fout.length > 120 && !/^403|\b403\b/.test(x.fout)));
    // De hosts van het technische slot zijn echt administratief: een privéhost die niet administratief is, komt er nooit in.
    check('ADMIN_HOSTS_TOEGESTAAN bevat admin.* en api.*; de privélijst nooit', ADMIN_HOSTS_TOEGESTAAN.includes('admin.tarasevych.com')
      && ADMIN_HOSTS_TOEGESTAAN.includes('api.tarasevych.com') && !PRIVE_HOSTS.includes('admin.tarasevych.com') && !PRIVE_HOSTS.includes('api.tarasevych.com'));

    // ============================================================== 3. diepe diagnose en het pakket «diagnose»
    const d1 = uit({ type: 'browser.deep_diagnostics', cap: 'browser.debug', ruimte: 'prive' });
    const d2 = uit({ type: 'browser.deep_diagnostics', cap: 'browser.debug', diagRecht: 'niet-aanvraagbaar' });
    const d3 = uit({ type: 'browser.deep_diagnostics', cap: 'browser.debug', ontgrendeling: { ruimte: 'technisch', caps: ['browser.read'], domeinen: ['mcp.tarasevych.com'] } });
    const d4 = uit({ type: 'browser.deep_diagnostics', cap: 'browser.debug' });
    check('diepe diagnose buiten het technische slot weigert (privéruimte → RUIMTE)', !d1.ok && d1.code === 'RUIMTE');
    check('diepe diagnose zonder het Chrome-recht → DEBUGGER, met het pakket «diagnose» en de stappen',
      !d2.ok && d2.code === 'DEBUGGER' && /mijn-ruimte-extension-diagnose\.zip/.test(d2.fout) && /1\).*2\).*3\)/.test(d2.fout)
      && /chrome:\/\/extensions/.test(d2.fout), !d2.ok ? d2.fout.slice(0, 120) : '');
    check('diepe diagnose zonder browser.debug in de ontgrendeling → CAP die de rollen noemt',
      !d3.ok && d3.code === 'CAP' && /browser\.debug/.test(d3.fout) && /ontwikkelaar/.test(d3.fout), !d3.ok ? d3.fout.slice(0, 90) : '');
    check('met recht, cap, slot en technisch tabblad mag diepe diagnose WEL (dat is de weg waarvoor «diagnose» bestaat)', d4.ok === true, JSON.stringify(d4));
    const uitleg = verduidelijkExtensieFout('browser.deep_diagnostics', 'Refused: Chrome has not granted the "debugger" permission. Chrome does not allow it as an optional permission');
    check('een korte weigering van de extensie zelf wordt uitgelegd met dezelfde stappen',
      uitleg?.code === 'DEBUGGER' && /mijn-ruimte-extension-diagnose\.zip/.test(uitleg.fout), uitleg?.fout.slice(0, 90) ?? 'null');
    check('de extensie weigert diepe diagnose in de privéruimte met dezelfde grens (shared.js debuggerToegestaan)',
      extShared.debuggerToegestaan({ recht: true, optIn: true, ruimte: 'prive', url: 'https://admin.tarasevych.com/', grant: { caps: ['browser.debug'], domeinen: ['admin.tarasevych.com'] }, profiel: 'technisch' }).code === 'VERKEERDE_RUIMTE');

    // ============================================================== 6. markering: technisch ≠ gebruiker
    check('markering: technisch slot heeft een eigen kleur en een eigen badge (punt 8)',
      MARKERING_KLEUREN.technisch !== MARKERING_KLEUREN.prive && MARKERING_BADGE.technisch !== MARKERING_BADGE.prive
      && extShared.MARKERING_KLEUREN.technisch === MARKERING_KLEUREN.technisch && extShared.MARKERING_BADGE.technisch === MARKERING_BADGE.technisch,
      `${MARKERING_KLEUREN.technisch}/${MARKERING_BADGE.technisch} ≠ ${MARKERING_KLEUREN.prive}/${MARKERING_BADGE.prive}`);
    const mTech = extShared.markeringVoor({ gekoppeld: true, verbonden: true, staat: 'ontgrendeld', domeinen: ['admin.tarasevych.com'], aiVerbonden: true }, 'technisch', 'technisch', 'https://admin.tarasevych.com/');
    const mPrive = extShared.markeringVoor({ gekoppeld: true, verbonden: true, staat: 'ontgrendeld', domeinen: ['hub.tarasevych.com'], aiVerbonden: true }, 'prive', 'gebruiker', 'https://hub.tarasevych.com/');
    check('markeringVoor() geeft in het technische slot de technische kleur, in het gebruikersslot de gebruikerskleur',
      mTech?.kleur === MARKERING_KLEUREN.technisch && mPrive?.kleur === MARKERING_KLEUREN.prive, JSON.stringify([mTech, mPrive]));
    // 0.6.2 (20.10.2026): het opschrift noemt niet meer het PROFIEL maar de AGENT en zijn actie. Het technische slot blijft
    // daarom op twee andere manieren te onderscheiden, ook als de agentkleur dezelfde is: een extra streepjesrand in de
    // technische kleur én het woord «технічний профіль» achter de lezers (zie markering-agenten-20261020.test.ts).
    const markering = (await import('node:fs')).readFileSync('extension/markering.js', 'utf8');
    check('de markering van het technische slot blijft te onderscheiden (eigen streepjesrand in de technische kleur)',
      /border:2px dashed \$\{MARKERING_KLEUREN\.technisch\}/.test(markering) && /ruimte === 'technisch'/.test(markering));
    const techOpschrift = markeringOpschrift({ lezers: [{ slug: 'claude', naam: 'Claude', kleur: { licht: '#000', donker: '#fff' }, actie: ['читає сторінку', 'leest de pagina'], at: 0 }], extra: 0 }, 'technisch', false);
    check('het opschrift van het technische slot zegt het ook in woorden («технічний профіль»)',
      techOpschrift.includes('Claude') && techOpschrift.endsWith('технічний профіль'), techOpschrift);

    // ============================================================== gebruiker, slot en de echte keten
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', ['users', U, { email: `bts-${T}@example.test`, role: 'user', status: 'approved', name: U }]);
    await sys.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['ontwikkelaar'], 240, 'test')`, [U, `tech-${randomBytes(6).toString('hex')}`]);
    // 20.10.2026: de technische kant van de AI is ondergeschikt aan de stand van de dienst «ai» in de gescheiden
    // gegevensruimtes (0082). Die staat standaard op «uit»; deze test gaat daar niet over, dus zetten we hem aan
    // (tests/eenheid/hulp/ruimte-ai.ts; de standen zelf staan in tests/eenheid/ruimte-ai-20261020.test.ts).
    await aiDienstAan(U);
    const gU = { id: U, email: `bts-${T}@example.test`, role: 'user', status: 'approved' };

    // ---------------------------------------------------------------- 4. erven van het technische profiel: keuze, standaard UIT
    check('0080: standaard erft een NIEUW tabblad het technische profiel niet (ervenAan = false)', (await tp.ervenAan(U)) === false);
    const tabA = randomBytes(24).toString('hex'), tabB = randomBytes(24).toString('hex');
    const sessie = { id: randomUUID(), createdAt: Date.now() - 1000 };
    await tp.activeren(gU, tabA, 0, 'erven uit: nieuw tabblad blijft gebruiker', sessie);
    check('0080: met de standaardinstelling krijgt een nieuw tabblad geen kopie — de AI van de gebruiker werkt er dus',
      (await tp.ervenOpen(gU, tabB, sessie)) === null && (await tp.actieveActivatie(U, tabB, sessie)) === null);
    const na = await tp.ervenZetten(gU, true);
    check('0080: de gebruiker zet het zelf aan; het profiel onthoudt het', na.ervenNieuweTabbladen === true && (await tp.ervenAan(U)) === true);
    check('0080: dan erft hetzelfde nieuwe tabblad wel (logica van 0071 ongewijzigd)', (await tp.ervenOpen(gU, tabB, sessie))?.herkomst === 'geerfd');
    const fout = await tp.ervenZetten(gU, 'ja' as unknown).then(() => 'GEEN_FOUT', (e) => (e as { code?: string }).code ?? 'ANDERS');
    check('0080: iets anders dan true/false wordt geweigerd (ERVEN_ONGELDIG), nooit stil genegeerd', fout === 'ERVEN_ONGELDIG', fout);
    await tp.ervenZetten(gU, false);
    await tp.beeindigenBijIntrekken(U, 'handmatig');

    // ---------------------------------------------------------------- 1b. tools/list: alleen de technische connector
    const token = randomToken(32);
    const key = newCommandKey();
    const agent = await store.createAgent(U, `Chrome tech (${T})`, 'browser', sha256(token), { enabled: [...BROWSER_TYPES] }, undefined,
      { pairingId: `bts-${T}`.replace(/[^A-Za-z0-9_-]/g, ''), commandKeyEnc: sealCommandKey(key, U, sha256(token)), version: '0.6.2', ruimte: 'technisch' });
    agentIds.push(agent.id);
    await store.setBrowserEnabled(U, agent.id, true);
    // Riskante hulpmiddelen staan standaard uit en handelen vraagt een klik: deze test gaat over de ZES voorwaarden van het
    // technische slot, dus de gebruiker zet ze op «ask» en geeft de browser toestemmingen (grants). Alles daarboven blijft gelden.
    await store.setToolModes(U, Object.fromEntries([...RISKY_TOOLS].map((n) => [n, 'ask' as const])));
    await grants.addGrants(U, U, [
      { agentId: agent.id, capability: 'browser.read' },
      { agentId: agent.id, capability: 'browser.navigate', domains: [...ADMIN_HOSTS_TOEGESTAAN] },
      { agentId: agent.id, capability: 'browser.debug' },
    ], { steppedUp: false });
    const ext = await extensie(token);
    check('de extensie verbindt in het technische slot en staat online', await until(() => agentOnline(agent.id)));

    const lijstT = (await lijstTools({ userId: U, clientName: 'Claude', ruimte: 'technisch' }, { aliassen: false })).map((t) => t.name);
    check('tools/list technisch: de browserhulpmiddelen staan erin (er is een technisch slot), zonder mail of bord',
      lijstT.includes('browser_snapshot') && lijstT.includes('browser_get_deep_diagnostics') && !lijstT.includes('mail_search_messages'),
      lijstT.filter((n) => n.startsWith('browser_')).join(','));
    check('tools/list technisch: GEEN browserhulpmiddelen voor een account zonder technisch slot',
      !(await lijstTools({ userId: `${U}-zonder`, clientName: 'Claude', ruimte: 'technisch' }, { aliassen: false })).some((t) => t.name.startsWith('browser_')));
    check('interne namen blijven beschikbaar voor connector v2 (aliassen: false), zodat de v2-catalogus ze kan opzoeken',
      lijstT.includes('browser_list_tabs') && lijstT.includes('browser_pages') && !lijstT.includes('take_snapshot'));
    const metAlias = (await lijstTools({ userId: U, clientName: 'Claude', ruimte: 'technisch' })).map((t) => t.name);
    check('het oude /mcp blijft de devtools-namen zien (take_snapshot, list_pages) — die weg verandert niet',
      metAlias.includes('take_snapshot') && metAlias.includes('list_pages') && !metAlias.includes('browser_snapshot'));

    // ---------------------------------------------------------------- 2b. dezelfde zes voorwaarden door de echte serverpoort
    const zonder = await metNamens({ client: 'Claude', ruimte: 'technisch', agent: 'claude' }, () => techn.poort(U, agent.id, 'browser.snapshot', {}));
    check('serverpoort: zonder ontgrendeling weigert het technische slot met de code VERGRENDELD', !zonder.ok && zonder.code === 'VERGRENDELD');
    const inPrive = await metNamens({ client: 'Claude', ruimte: 'prive' }, () => techn.poort(U, agent.id, 'browser.snapshot', {}));
    check('serverpoort: dezelfde aanroep in de privéruimte weigert met RUIMTE (nooit stil op het technische slot)', !inPrive.ok && inPrive.code === 'RUIMTE');

    const gid = await ontgrendelVoorTest(agent.id, U, { caps: ['browser.read', 'browser.navigate'], domeinen: ['admin.tarasevych.com', 'mcp.tarasevych.com'], minuten: 30, ruimte: 'technisch' });
    check('fixture: het technische slot heeft nu een lopende ontgrendeling', !!(await eo.actieveOntgrendeling(agent.id, U)) && !!gid);
    const naDiep = await metNamens({ client: 'Claude', ruimte: 'technisch', agent: 'claude' }, () => techn.poort(U, agent.id, 'browser.deep_diagnostics', {}));
    check('serverpoort: diepe diagnose zonder browser.debug in de ontgrendeling → CAP', !naDiep.ok && naDiep.code === 'CAP', !naDiep.ok ? naDiep.fout.slice(0, 80) : '');
    const naHost = await metNamens({ client: 'Claude', ruimte: 'technisch', agent: 'claude' }, () => techn.poort(U, agent.id, 'browser.navigate', { url: 'https://hub.tarasevych.com/' }));
    check('serverpoort: een adres buiten de ontgrendeling → HOST', !naHost.ok && naHost.code === 'HOST', !naHost.ok ? naHost.fout.slice(0, 80) : '');
    eo._zetGemeldeTab(agent.id, { profielTab: 'gebruiker' });
    const naProfiel = await metNamens({ client: 'Claude', ruimte: 'technisch', agent: 'claude' }, () => techn.poort(U, agent.id, 'browser.snapshot', {}));
    check('serverpoort: de extensie meldde een GEBRUIKERStabblad → PROFIEL, vóórdat er een opdracht ontstaat', !naProfiel.ok && naProfiel.code === 'PROFIEL');
    eo._zetGemeldeTab(agent.id, { profielTab: 'technisch', diagRecht: 'nee' });
    const naRecht = await metNamens({ client: 'Claude', ruimte: 'technisch', agent: 'claude' }, () => techn.poort(U, agent.id, 'browser.snapshot', {}));
    check('serverpoort: met een technisch tabblad en de juiste cap mag het lezen door', naRecht.ok === true, JSON.stringify(naRecht));

    // ---------------------------------------------------------------- 5. journaal
    const voor = await journaal();
    const weigering = await metNamens({ client: 'Claude', ruimte: 'technisch', agent: 'claude' },
      () => callTool(U, 'browser_get_deep_diagnostics', { browser: agent.id, seconds: 2 }));
    check('callTool: diepe diagnose zonder browser.debug weigert met de uitlegbare CAP-tekst',
      weigering.isError === true && /EXTENSIE_CAP/.test(weigering.content[0].text), weigering.content[0].text.slice(0, 110));
    check('journaal: ook een WEIGERING komt in het beheerjournaal (owner.tech.browser, result denied)',
      (await journaal()) === voor + 1 && (await journaal('denied')) >= 1);
    const rGeweigerd = await laatsteRegel();
    check('journaal (weigering): dienst, actie, ruimte, tabblad, agent en de reden staan erin',
      rGeweigerd?.result === 'denied' && rGeweigerd.details?.actie === 'browser.deep_diagnostics' && rGeweigerd.details?.ruimte === 'technisch'
      && rGeweigerd.details?.agent === 'claude' && rGeweigerd.details?.reden === 'CAP' && rGeweigerd.details?.tabblad === 'technisch',
      JSON.stringify(rGeweigerd?.details));

    const gelukt = await metNamens({ client: 'Claude', ruimte: 'technisch', agent: 'claude' },
      () => callTool(U, 'browser_snapshot', { browser: agent.id }));
    check('callTool: lezen in het technische slot gaat door en bereikt de extensie',
      gelukt.isError !== true && ext.berichten.some((m) => m.t === 'cmd' && m.type === 'browser.snapshot'), gelukt.content[0].text.slice(0, 90));
    const rGelukt = await laatsteRegel();
    check('journaal: de geslaagde actie staat erin met result success, de actie en het apparaat',
      (await journaal('success')) >= 1 && rGelukt?.result === 'success' && rGelukt.details?.actie === 'browser.snapshot'
      && rGelukt.details?.doel?.id === agent.id, JSON.stringify(rGelukt?.details));

    const navigatie = await metNamens({ client: 'Claude', ruimte: 'technisch', agent: 'claude' },
      () => callTool(U, 'browser_open', { browser: agent.id, url: 'https://admin.tarasevych.com/' }));
    const rNav = await laatsteRegel();
    check('journaal: bij een adres staat de HOST in de regel (admin.tarasevych.com), zodat te zien is waar de AI keek',
      navigatie.isError !== true && rNav?.details?.host === 'admin.tarasevych.com' && rNav.details?.dienst === 'admin.tarasevych.com',
      JSON.stringify(rNav?.details));

    // ---------------------------------------------------------------- een korte fout van de extensie wordt uitgelegd
    const tokenB = randomToken(32);
    const agentB = await store.createAgent(U, `Chrome tech B (${T})`, 'browser', sha256(tokenB), { enabled: [...BROWSER_TYPES] }, undefined,
      { commandKeyEnc: sealCommandKey(newCommandKey(), U, sha256(tokenB)), version: '0.6.2', ruimte: 'technisch' });
    agentIds.push(agentB.id);
    await store.setBrowserEnabled(U, agentB.id, true);
    // «Altijd»-grant met step-up (de enige weg zonder verse klik per opdracht) + modus «altijd»: zo komt de opdracht echt bij de
    // extensie en kunnen we zien dat haar korte weigering wordt uitgelegd.
    await grants.addGrants(U, U, [{ agentId: agentB.id, capability: 'browser.debug', always: true, domains: ['admin.tarasevych.com'] }], { steppedUp: true });
    await store.setToolModes(U, { browser_get_deep_diagnostics: 'always' });
    await ontgrendelVoorTest(agentB.id, U, { caps: ['browser.read', 'browser.debug'], domeinen: ['admin.tarasevych.com'], minuten: 30, ruimte: 'technisch' });
    const extB = await extensie(tokenB, 'Refused: Chrome has not granted the "debugger" permission. Chrome does not allow it as an optional permission, so the extension cannot ask for it at runtime');
    check('tweede slot online (het weigert elke opdracht zoals een extensie zonder debuggerrecht)', await until(() => agentOnline(agentB.id)) && !!extB);
    eo._zetGemeldeTab(agentB.id, { profielTab: 'technisch' });
    const kort = await metNamens({ client: 'Claude', ruimte: 'technisch', agent: 'claude' },
      () => callTool(U, 'browser_get_deep_diagnostics', { browser: agentB.id, seconds: 1 }));
    check('de korte fout van de extensie wordt vervangen door de volledige uitleg met het pakket «diagnose»',
      kort.isError === true && /EXTENSIE_DEBUGGER/.test(kort.content[0].text) && /mijn-ruimte-extension-diagnose\.zip/.test(kort.content[0].text),
      kort.content[0].text.slice(0, 140));
    check('journaal: ook die mislukking staat erin (result failure, met de melding van de extensie)',
      (await journaal('failure')) >= 1);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await aiDienstOpruimen([U]);
    for (const ws of sockets) { try { ws.close(); } catch { /* al dicht */ } }
    await new Promise<void>((r) => server.close(() => r()));
    await sys.query('DELETE FROM app.extensie_ontgrendelingen WHERE user_id = $1', [U]).catch(() => undefined);
    if (agentIds.length) await sys.query('DELETE FROM app.agents WHERE id = ANY($1::uuid[])', [agentIds]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.audit WHERE owner_id = $1', [U]).catch(() => undefined);
    await sys.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = $1`, [U]).catch(() => undefined);
  }
  return einde();
}
