// ALLE AGENTEN = DEZELFDE BROWSERHULPMIDDELEN (zone E, 22.10.2026). Klacht 3 van de eigenaar: «будь-який агент через наш конектор
// має працювати з браузером через наше розширення». Wat hier vastligt:
//  1. catalogus: voor elke agent (claude, gpt, grok, gemini, copilot, cursor) precies dezelfde browseropties, aan beide kanten;
//     technisch = privé + browser_script (evaluate_script), niets meer; elke optie heeft een intern hulpmiddel en een unieke naam;
//  2. levend (tegen de wegwerp-PG): v2Lijst geeft elke agent met dezelfde rechten exact dezelfde browserhulpmiddelen (namen zonder de
//     agentslug gelijk), privé én technisch; de interne doelen zijn precies de catalogus;
//  3. «devtools-namen» aan in de matrix → dezelfde extra namen voor elke agent, zonder dubbele namen;
//  4. een agent zonder het recht op een hulpmiddel ziet het niet (gelijkheid «за його правами», geen gelijkschakeling naar boven).
import { randomBytes } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';
import { V2_AGENTEN, type AgentSlug } from '../../shared/connector-v2/agenten';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { toolNaam } from '../../shared/connector-v2/namen';
import * as v2 from '../../backend/connector-v2';
import * as matrix from '../../backend/extensie-matrix';
import { browserInternPerKant, DEVTOOLS_ONDERSTEUND } from '../../backend/connector-v2-browser';
import { newCommandKey, randomToken, sealCommandKey, sha256 } from '../../backend/connectors-crypto';
import * as store from '../../backend/connectors-opslag';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';

const zonderSlug = (naam: string, slug: string) => naam.replace(`_${slug}_`, '_*_');

export async function main(): Promise<number> {
  const { check, einde } = checker('connector-browser-gelijk-20261022');
  const browser = V2_OPTIES.filter((o) => o.groep === 'browser' && o.status === 'actief');
  const gebr = browser.filter((o) => o.kant === 'gebruiker'), beh = browser.filter((o) => o.kant === 'beheer');

  // ---------------------------------------------------------------- 1. catalogus
  const perAgent = V2_AGENTEN.map((a) => browser.map((o) => zonderSlug(toolNaam(o, a.slug), a.slug)).sort().join('|'));
  check('catalogus: elke agent dezelfde browsernamen (zonder slug)', V2_AGENTEN.length === 6 && perAgent.every((x) => x === perAgent[0]), `${V2_AGENTEN.length} agenten`);
  check('catalogus: technisch = privé + browser_script, verder gelijk',
    beh.length === gebr.length + 1 && gebr.every((g) => beh.some((b) => b.id === g.id)) && beh.filter((b) => !gebr.some((g) => g.id === b.id)).map((b) => b.id).join() === 'browser_script');
  check('catalogus: elk browserhulpmiddel heeft een intern doel en een unieke naam per agent',
    browser.every((o) => !!o.intern) && V2_AGENTEN.every((a) => new Set(browser.map((o) => toolNaam(o, a.slug))).size === browser.length));
  const verwacht = ['browser_audit', 'browser_click', 'browser_console', 'browser_fill_form', 'browser_get_deep_diagnostics', 'browser_get_diagnostics', 'browser_history', 'browser_hover',
    'browser_invoke_action', 'browser_list_tabs', 'browser_network', 'browser_open', 'browser_pages', 'browser_press_key', 'browser_screenshot', 'browser_scroll', 'browser_select_option',
    'browser_snapshot', 'browser_type', 'browser_wait_for_text'];
  check('catalogus: de opdracht van E3 is gedekt (open, snapshot/read, click, type, select, press, screenshot, console, network, tabs, deep diagnostics, wait_for_text, site_action)',
    JSON.stringify(browserInternPerKant('gebruiker')) === JSON.stringify([...verwacht].sort()) && JSON.stringify(browserInternPerKant('beheer')) === JSON.stringify([...verwacht, 'browser_script'].sort()),
    browserInternPerKant('gebruiker').join(','));

  // ---------------------------------------------------------------- 2. levend
  const sys = getPool('systeem');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const U = `cbg-u-${T}`;
  const verplaatst = (await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner-tijdelijk\"') WHERE tbl = 'users' AND data->>'role' = 'owner' RETURNING id")).rows.map((r: { id: string }) => r.id);
  try {
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', ['users', U, { email: 'eigenaar@test.invalid', role: 'owner', status: 'approved', name: U }]);
    await aiDienstAan(U);
    // een browser in BEIDE sloten (de technische kant toont browserhulpmiddelen alleen met een technisch browserslot)
    for (const ruimte of ['prive', 'technisch'] as const) {
      const tok = randomToken(32);
      await store.createAgent(U, `Chrome ${ruimte} ${T}`, 'browser', sha256(tok), {}, undefined, { pairingId: `p${T}`.replace(/[^A-Za-z0-9]/g, ''), commandKeyEnc: sealCommandKey(newCommandKey(), U, sha256(tok)), version: '0.7.0', ruimte });
    }
    const alleSleutels = browser.map((o) => o.key);
    const koppeling = (slug: AgentSlug) => ({ userId: U, clientName: V2_AGENTEN.find((a) => a.slug === slug)!.naam, tokenId: `t-${slug}-${T}`, agent: slug, limietSleutel: `l-${slug}`, ruimte: 'prive' as const });
    const lijst = async (slug: AgentSlug, ruimte: 'prive' | 'technisch', sleutels = alleSleutels) =>
      (await v2.v2Lijst(koppeling(slug) as never, { kanten: ['gebruiker', 'beheer'], sleutels }, ruimte)).map((t) => t.name).filter((n) => browser.some((o) => toolNaam(o, slug) === n) || DEVTOOLS_ONDERSTEUND.includes(n));
    // 2a. standaardstand van de site: riskante browserhulpmiddelen UIT — maar voor elke agent precies even uit
    const vooraf = await Promise.all(V2_AGENTEN.map((a) => lijst(a.slug, 'prive')));
    const normV = vooraf.map((l, i) => l.map((n) => zonderSlug(n, V2_AGENTEN[i].slug)).sort().join('|'));
    check('levend privé, standaard: elke agent ziet dezelfde (veilige) browserhulpmiddelen; riskante staan voor iedereen uit',
      normV.every((x) => x === normV[0]) && vooraf[0].length > 0 && vooraf[0].length < gebr.length && !vooraf[0].some((n) => n.startsWith('klikken_element_')), `${vooraf.map((l) => l.length).join(',')}`);
    const keten0 = await matrix.ketenVoor(U);
    check('ketting: toont per agent welke browserhulpmiddelen de modus van de site uitzet (bron «site»)',
      keten0.length === 6 && keten0.every((k) => k.bron === 'site' && k.kanten[0].uit.includes('browser_click') && k.kanten[0].rechten === null));
    // 2b. ÉÉN PLEK: de matrix opslaan (alles, met bevestiging) zet de modi van de site mee → elke agent alle 20 / 41
    const naP = (await matrix.schrijfMatrix(U, matrix.valideerInvoer({ ruimte: 'prive', rijen: [{ agent: '*', caps: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console'] }] }), 'test')).na;
    const nModi = await matrix.modiVolgenMatrix(U, naP);
    const naT = (await matrix.schrijfMatrix(U, matrix.valideerInvoer({ ruimte: 'technisch', rijen: [{ agent: '*', caps: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script'] }] }), 'test')).na;
    const nModiT = await matrix.modiVolgenMatrix(U, naT);
    const modi = await store.getToolModes(U);
    check('modiVolgenMatrix: riskante browserhulpmiddelen van «uit» naar «ask» (met bevestiging), niets anders aangeraakt',
      nModi > 0 && nModiT > 0 && modi.browser_click === 'ask' && modi.browser_screenshot === 'ask' && modi.browser_get_deep_diagnostics === 'ask' && modi.browser_snapshot === undefined
      && !Object.keys(modi).some((t) => !t.startsWith('browser_')), JSON.stringify(modi));
    const privé = await Promise.all(V2_AGENTEN.map((a) => lijst(a.slug, 'prive')));
    const norm = privé.map((l, i) => l.map((n) => zonderSlug(n, V2_AGENTEN[i].slug)).sort().join('|'));
    check('levend privé na de matrix: elke agent ziet exact dezelfde browserhulpmiddelen (alle 20)', norm.every((x) => x === norm[0]) && privé[0].length === gebr.length, `${privé.map((l) => l.length).join(',')}`);
    const tech = await Promise.all(V2_AGENTEN.map((a) => lijst(a.slug, 'technisch')));
    const normT = tech.map((l, i) => l.map((n) => zonderSlug(n, V2_AGENTEN[i].slug)).sort().join('|'));
    check('levend technisch: elke agent ziet exact dezelfde browserhulpmiddelen van beide kanten (20 + 21)', normT.every((x) => x === normT[0]) && tech[0].length === gebr.length + beh.length, `${tech.map((l) => l.length).join(',')}`);
    // «без підтвердження» in beide sloten → 'always'
    const zb = (await matrix.schrijfMatrix(U, matrix.valideerInvoer({ ruimte: 'prive', rijen: [{ agent: '*', caps: ['browser.read', 'browser.interact'] }], instellingen: { zonderBevestiging: true } }), 'test')).na;
    await matrix.modiVolgenMatrix(U, zb);
    const m2 = await store.getToolModes(U);
    check('«без підтвердження» geldt per mogelijkheid: interact staat in beide sloten aan maar technisch MET bevestiging → blijft «ask»; screenshot (alleen technisch, met bevestiging) «ask»',
      m2.browser_click === 'ask' && m2.browser_screenshot === 'ask', JSON.stringify({ click: m2.browser_click, shot: m2.browser_screenshot }));
    const zbT = (await matrix.schrijfMatrix(U, matrix.valideerInvoer({ ruimte: 'technisch', rijen: [{ agent: '*', caps: ['browser.read', 'browser.interact', 'browser.script'] }], instellingen: { zonderBevestiging: true } }), 'test')).na;
    await matrix.modiVolgenMatrix(U, zbT);
    const m3 = await store.getToolModes(U);
    check('beide sloten «без підтвердження» → «always» voor klikken; scripts (alleen technisch, zonder bevestiging) «always»', m3.browser_click === 'always' && m3.browser_script === 'always', JSON.stringify({ click: m3.browser_click, script: m3.browser_script }));
    // terug naar «met bevestiging» voor de rest van de test
    await matrix.modiVolgenMatrix(U, (await matrix.schrijfMatrix(U, matrix.valideerInvoer({ ruimte: 'technisch', rijen: [{ agent: '*', caps: [...naT.rijen.find((r) => r.ruimte === 'technisch' && r.agent === '*')!.caps] }], instellingen: { zonderBevestiging: false } }), 'test')).na);
    // 3. devtools-namen aan voor het privéslot
    await matrix.modiVolgenMatrix(U, (await matrix.schrijfMatrix(U, matrix.valideerInvoer({ ruimte: 'prive', rijen: [{ agent: '*', caps: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console'] }], instellingen: { devtoolsNamen: true, zonderBevestiging: false } }), 'test')).na);
    const metDt = await Promise.all(V2_AGENTEN.map((a) => lijst(a.slug, 'prive')));
    const dt = metDt.map((l) => l.filter((n) => DEVTOOLS_ONDERSTEUND.includes(n)).sort().join('|'));
    check('«devtools-namen» aan: dezelfde chrome-devtools-mcp-namen voor elke agent, geen dubbele namen, evaluate_script NIET privé',
      dt.every((x) => x === dt[0]) && dt[0].includes('take_snapshot') && dt[0].includes('navigate_page') && dt[0].includes('click') && !dt[0].includes('evaluate_script')
      && metDt.every((l) => new Set(l).size === l.length), dt[0]);
    const metDtT = await lijst('grok', 'technisch');
    check('technisch met devtools-namen alleen voor privé: evaluate_script verschijnt pas als ook het technische slot ze aanzet', !metDtT.includes('evaluate_script'));
    await matrix.schrijfMatrix(U, matrix.valideerInvoer({ ruimte: 'technisch', rijen: [{ agent: '*', caps: ['browser.read', 'browser.script'] }], instellingen: { devtoolsNamen: true, zonderBevestiging: false } }), 'test');
    check('technisch met devtools-namen: evaluate_script voor elke agent', (await Promise.all(V2_AGENTEN.map((a) => lijst(a.slug, 'technisch')))).every((l) => l.includes('evaluate_script')));
    // 4. rechten per koppeling blijven gelden
    const zonderKlik = alleSleutels.filter((k) => !k.startsWith('browser_click:'));
    const g1 = await lijst('gpt', 'prive', zonderKlik);
    check('gelijk «за правами»: zonder het recht browser_click ziet ChatGPT geen klikhulpmiddel (ook de alias click niet), Claude met het recht wel',
      !g1.some((n) => n.startsWith('klikken_element_') || n === 'click') && (await lijst('claude', 'prive')).some((n) => n.startsWith('klikken_element_')), g1.filter((n) => /klik|click/.test(n)).join(','));
  } finally {
    await sys.query('DELETE FROM app.extensie_matrix WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.connector_tool_settings WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.agents WHERE user_id = $1', [U]).catch(() => undefined);
    await aiDienstOpruimen([U]);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [U]).catch(() => undefined);
    for (const id of verplaatst) await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner\"') WHERE tbl = 'users' AND id = $1", [id]).catch(() => undefined);
    await closePool();
  }
  return einde();
}
