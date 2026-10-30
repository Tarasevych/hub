// chrome-devtools-mcp-NAMEN op connector v2 (zone E, 22.10.2026; backend/connector-v2-browser.ts + DEVTOOLS_ALIASES in connectors-hulpmiddelen.ts).
// Doel: een agent die op chrome-devtools-mcp getraind is, werkt zonder herscholing — maar altijd met ONZE grenzen.
//  1. ontleden: kale naam, _gebruiker/_beheer, volledige v2-vorm; de naam van een andere agent blijft AGENT_MISMATCH;
//  2. vertalen: uid, value, pageIdx, timeout (ms), type back/forward, function → onze argumenten; wat wij niet kennen
//     (format, fullPage, dblClick, pageSize …) valt weg en staat als «Ignored arguments» in het antwoord;
//  3. slot: args.slot wint, anders technisch als dat leeft én is toegestaan, anders privé; evaluate_script nooit privé, nooit met
//     element-args; niet-ondersteunde namen (emulate_cpu, upload_file …) → NOT_SUPPORTED met de lijst van wat wél bestaat;
//  4. extensie 0.7.0: valideerOpdracht kent uid/pageIdx/browser.script; kiesElement vindt een element op uid, ook na een verschoven DOM;
//  5. door de poorten: een alias zonder recht → PERMISSION_OFF; met recht maar zonder browser → de echte foutmelding van callTool;
//     NOT_SUPPORTED staat in het journaal (reden 'devtools').
import { randomBytes } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { toolNaam } from '../../shared/connector-v2/namen';
import * as v2 from '../../backend/connector-v2';
import { DEVTOOLS_NIET, DEVTOOLS_ONDERSTEUND, devtoolsBeslissing, genegeerdeArgs, ontleedDevtools, vertaalDevtools } from '../../backend/connector-v2-browser';
import { scriptExpressie } from '../../backend/connectors-hulpmiddelen';

export async function main(): Promise<number> {
  const { check, einde } = checker('connector-browser-devtools-20261022');
  const JS = await import('../../extension/shared.js') as any;

  // ---------------------------------------------------------------- 1. ontleden
  check('ontleden: kale naam, suffix en volledige v2-vorm; een gewone v2-naam is geen devtools-naam',
    JSON.stringify(ontleedDevtools('take_snapshot', 'claude')) === '{"alias":"take_snapshot","kant":null}'
    && ontleedDevtools('click_beheer', 'claude')?.kant === 'beheer' && ontleedDevtools('navigate_page_gebruiker', 'grok')?.kant === 'gebruiker'
    && ontleedDevtools('evaluate_script_cursor_mcp_tarasevych_com_beheer', 'cursor')?.alias === 'evaluate_script'
    && ontleedDevtools('lezen_pagina_claude_mcp_tarasevych_com_gebruiker', 'claude') === null
    && ontleedDevtools('click_claude_mcp_tarasevych_com_beheer', 'grok') === null);
  check('namen: de lijst van ondersteunde en bewust niet-ondersteunde chrome-devtools-mcp-namen',
    ['navigate_page', 'new_page', 'close_page', 'select_page', 'list_pages', 'take_snapshot', 'take_screenshot', 'click', 'hover', 'fill', 'fill_form', 'press_key', 'wait_for',
      'list_console_messages', 'list_network_requests', 'evaluate_script', 'performance_start_trace', 'performance_stop_trace', 'get_console_message', 'get_network_request', 'navigate_page_history'].every((n) => DEVTOOLS_ONDERSTEUND.includes(n))
    && ['emulate', 'emulate_cpu', 'emulate_network', 'resize_page', 'upload_file', 'handle_dialog', 'drag', 'performance_analyze_insight'].every((n) => n in DEVTOOLS_NIET), DEVTOOLS_ONDERSTEUND.join(','));

  // ---------------------------------------------------------------- 2. vertalen
  const v = (alias: string, a: Record<string, unknown>) => vertaalDevtools(alias, a);
  check('click {uid, dblClick} → browser_click {uid}; dblClick genegeerd en gemeld',
    JSON.stringify(v('click', { uid: '3_abc12', dblClick: true })) === '{"intern":"browser_click","args":{"uid":"3_abc12"}}' && genegeerdeArgs('click', { uid: '3_abc12', dblClick: true }).join() === 'dblClick');
  check('fill {uid, value} → browser_type {uid, text}; fill_form elementen met uid', JSON.stringify(v('fill', { uid: '4_x', value: 'Hallo' })?.args) === '{"uid":"4_x","text":"Hallo"}'
    && JSON.stringify(v('fill_form', { elements: [{ uid: '1_a', value: 'x' }, { name: 'E-mail', value: 'y' }] })?.args) === '{"elements":[{"uid":"1_a","value":"x"},{"name":"E-mail","value":"y"}]}');
  check('wait_for {timeout in ms} → timeout_seconds 1..15', v('wait_for', { text: 'Klaar', timeout: 5000 })?.args.timeout_seconds === 5 && v('wait_for', { text: 'x', timeout: 60000 })?.args.timeout_seconds === 15 && v('wait_for', { text: 'x', timeout: 10 })?.args.timeout_seconds === 1);
  check('take_screenshot {format, fullPage} → browser_screenshot {} (alles weg, gemeld); take_snapshot {verbose} → {}',
    JSON.stringify(v('take_screenshot', { format: 'png', fullPage: true })) === '{"intern":"browser_screenshot","args":{}}' && genegeerdeArgs('take_screenshot', { format: 'png', fullPage: true }).join() === 'format,fullPage'
    && JSON.stringify(v('take_snapshot', { verbose: true })?.args) === '{}');
  check('navigate_page {type:"back"} → browser_history; {url} → browser_open; new_page {url, timeout} → browser_pages new',
    JSON.stringify(v('navigate_page', { type: 'back' })) === '{"intern":"browser_history","args":{"action":"back"}}'
    && JSON.stringify(v('navigate_page', { url: 'https://mail.tarasevych.com/' })) === '{"intern":"browser_open","args":{"url":"https://mail.tarasevych.com/"}}'
    && JSON.stringify(v('new_page', { url: 'https://hub.tarasevych.com/', timeout: 1000 })?.args) === '{"action":"new","url":"https://hub.tarasevych.com/"}'
    && JSON.stringify(v('navigate_page_history', { navigate: 'forward' })?.args) === '{"action":"forward"}');
  check('select_page {pageIdx} / close_page {pageId} → browser_pages', JSON.stringify(v('select_page', { pageIdx: 1 })?.args) === '{"action":"select","pageIdx":1}' && JSON.stringify(v('close_page', { pageId: 77 })?.args) === '{"action":"close","pageId":77}');
  check('evaluate_script: een functie wordt aangeroepen, een expressie blijft een expressie',
    v('evaluate_script', { function: '() => document.title' })?.args.expression === '(() => document.title)()' && v('evaluate_script', { function: 'async () => { return 1 }' })?.args.expression === '(async () => { return 1 })()'
    && scriptExpressie('function () { return 2 }') === '(function () { return 2 })()' && scriptExpressie('x => x') === '(x => x)()' && scriptExpressie('document.title') === 'document.title');
  check('list_console_messages: onbekende types weg (issue), pageSize gemeld; performance_start_trace → audit «prestaties» met eerlijke noot',
    JSON.stringify(v('list_console_messages', { types: ['error', 'issue'], pageSize: 10 })?.args) === '{"types":["error"]}' && genegeerdeArgs('list_console_messages', { types: [], pageSize: 10 }).join() === 'pageSize'
    && v('performance_start_trace', { reload: true })?.intern === 'browser_audit' && v('performance_start_trace', {})?.args.soort === 'prestaties' && /no trace recorder/.test(String(v('performance_start_trace', {})?.noot)));

  // ---------------------------------------------------------------- 3. slot en weigeringen
  const alles = new Set(V2_OPTIES.filter((o) => o.groep === 'browser').map((o) => o.key));
  const zonderBeheer = new Set([...alles].filter((k) => k.endsWith(':gebruiker')));
  const b = (naam: string, args: Record<string, unknown>, levend: 'prive' | 'technisch', toegestaan = alles) => devtoolsBeslissing(naam, args, 'claude', levend, toegestaan);
  const naamVan = (id: string, kant: 'gebruiker' | 'beheer', slug = 'claude') => toolNaam(V2_OPTIES.find((o) => o.id === id && o.kant === kant)!, slug as never);
  const d1 = b('take_snapshot', {}, 'prive'), d2 = b('take_snapshot', {}, 'technisch'), d3 = b('take_snapshot', {}, 'technisch', zonderBeheer), d4 = b('take_snapshot', { slot: 'prive' }, 'technisch');
  check('slot: privé levend → _gebruiker; technisch levend + recht → _beheer; zonder beheerrecht → _gebruiker; args.slot wint (en verdwijnt uit de args)',
    d1?.soort === 'doorsturen' && d1.naam === naamVan('browser_snapshot', 'gebruiker') && d1.automatisch
    && d2?.soort === 'doorsturen' && d2.naam === naamVan('browser_snapshot', 'beheer')
    && d3?.soort === 'doorsturen' && d3.naam === naamVan('browser_snapshot', 'gebruiker')
    && d4?.soort === 'doorsturen' && d4.naam === naamVan('browser_snapshot', 'gebruiker') && !d4.automatisch && !('slot' in d4.args));
  const e1 = b('evaluate_script', { function: '() => 1' }, 'prive'), e2 = b('evaluate_script', { function: '() => 1' }, 'technisch'), e3 = b('evaluate_script', { function: '(el) => el.id', args: [{ uid: '1_a' }] }, 'technisch');
  check('evaluate_script: privé → EXTENSIE_RUIMTE met het pad; technisch → uitvoeren_script_…_beheer; met element-args → NOT_SUPPORTED',
    e1?.soort === 'weigeren' && /^EXTENSIE_RUIMTE/.test(e1.bericht) && /agents#browser/.test(e1.bericht)
    && e2?.soort === 'doorsturen' && e2.naam === naamVan('browser_script', 'beheer') && e2.args.expression === '(() => 1)()'
    && e3?.soort === 'weigeren' && /^NOT_SUPPORTED/.test(e3.bericht));
  const n1 = b('emulate_cpu', { throttlingRate: 4 }, 'prive'), n2 = b('upload_file_beheer', {}, 'technisch');
  check('niet ondersteund: NOT_SUPPORTED met reden en de lijst van wat wél bestaat (ook met suffix)',
    n1?.soort === 'weigeren' && /^NOT_SUPPORTED: "emulate_cpu"/.test(n1.bericht) && /take_snapshot/.test(n1.bericht) && n2?.soort === 'weigeren' && /upload_file/.test(n2.bericht));
  const ig = b('take_screenshot', { fullPage: true }, 'prive');
  check('genegeerde argumenten komen als noot mee', ig?.soort === 'doorsturen' && /Ignored arguments \(not supported by Mijn Ruimte\): fullPage/.test(String(ig.noot)));
  check('geen devtools-naam → null (de gewone v2-route beslist)', b('lezen_pagina_claude_mcp_tarasevych_com_gebruiker', {}, 'prive') === null && b('iets_anders', {}, 'prive') === null);

  // ---------------------------------------------------------------- 4. extensie 0.7.0
  const ok = (t: string, p: unknown) => JS.valideerOpdracht(t, p);
  check('valideerOpdracht: click/hover/type/select met uid OF name; zonder beide → VERPLICHT; foute uid → WAARDE',
    ok('browser.click', { uid: '3_abc12' }).ok && ok('browser.click', { name: 'Opslaan' }).ok && ok('browser.click', {}).code === 'VERPLICHT' && ok('browser.click', { uid: 'x' }).code === 'WAARDE'
    && ok('browser.hover', { uid: '0_a' }).ok && ok('browser.type', { uid: '1_b', text: 'x' }).ok && ok('browser.type', { text: 'x' }).code === 'VERPLICHT' && ok('browser.select', { uid: '2_c', option: 'Ja' }).ok);
  check('valideerOpdracht: fill_form met uid-elementen; element zonder uid en naam → VERPLICHT; pages met pageIdx; script ≤ 4000 tekens',
    ok('browser.fill_form', { elements: [{ uid: '1_a', value: 'x' }, { name: 'N', value: 'y' }] }).ok && ok('browser.fill_form', { elements: [{ value: 'x' }] }).code === 'VERPLICHT'
    && ok('browser.pages', { action: 'select', pageIdx: 2 }).ok && ok('browser.pages', { action: 'close' }).code === 'VERPLICHT'
    && ok('browser.script', { expression: '1+1' }).ok && ok('browser.script', { expression: 'x'.repeat(4001) }).code === 'LENGTE' && ok('browser.script', {}).code === 'VERPLICHT');
  const items = [{ name: 'Opslaan', role: 'button' }, { name: 'Naam', role: 'textbox' }, { name: 'Land', role: 'select' }];
  const uidNaam = JS.uidVan(1, 'Naam');
  const verschoven = [{ name: 'Nieuw', role: 'button' }, ...items];
  check('kiesElement: op uid; na een verschoven DOM op de hash; weg → «take a new snapshot»; verkeerde soort → fout; op naam blijft werken',
    JS.kiesElement(items, { uid: uidNaam }).item?.name === 'Naam' && JS.kiesElement(verschoven, { uid: uidNaam }).item?.name === 'Naam'
    && /no longer on the page/.test(JS.kiesElement([items[0]], { uid: uidNaam }).error) && /not a control of this kind/.test(JS.kiesElement(items, { uid: JS.uidVan(0, 'Opslaan') }, (c: { role: string }) => c.role === 'textbox').error)
    && JS.kiesElement(items, { name: 'Land' }).item?.role === 'select' && /^\d+_[a-z0-9]+$/.test(uidNaam));

  // ---------------------------------------------------------------- 5. door de poorten (wegwerp-PG)
  const sys = getPool('systeem');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const U = `cbd-u-${T}`;
  try {
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', ['users', U, { email: `${U}@example.test`, role: 'user', status: 'approved', name: U }]);
    const k = { userId: U, clientName: 'Claude', tokenId: `t-${T}`, agent: 'claude', limietSleutel: `l-${T}`, ruimte: 'prive' } as never;
    const sleutels = V2_OPTIES.filter((o) => o.groep === 'browser' && o.kant === 'gebruiker' && o.id !== 'browser_screenshot').map((o) => o.key);
    const rechten = { kanten: ['gebruiker'] as never, sleutels };
    const tekst = (r: { content: Array<{ text: string }> }) => r.content[0]?.text ?? '';
    const r1 = await v2.v2Roep(k, rechten, 'take_screenshot', { format: 'png' }, 'prive');
    check('alias zonder recht (browser_screenshot niet toegestaan) → PERMISSION_OFF met de v2-naam', !!r1.isError && /^PERMISSION_OFF/.test(tekst(r1)) && tekst(r1).includes(naamVan('browser_screenshot', 'gebruiker')), tekst(r1).slice(0, 120));
    const r2 = await v2.v2Roep(k, rechten, 'take_snapshot', {}, 'prive');
    // Deze nep-koppeling heeft geen scopes in app.ai_toegang: dan weigert de scope-poort van roepTool — precies de poort die ook
    // de eigen naam (lezen_pagina_…) zou tegenhouden. Met scopes komt de melding van het hulpmiddel zelf («No … extension is connected»).
    const r2b = await v2.v2Roep(k, rechten, naamVan('browser_snapshot', 'gebruiker'), {}, 'prive');
    check('alias met recht gaat door DEZELFDE poorten als de eigen v2-naam (zelfde uitkomst, geen eigen pad)',
      !!r2.isError && /TOEGANG_GESCHEIDEN|No Mijn Ruimte browser extension is connected/.test(tekst(r2)) && tekst(r2) === tekst(r2b), tekst(r2).slice(0, 120));
    const r3 = await v2.v2Roep(k, rechten, 'click_beheer', { uid: '1_a' }, 'prive');
    check('click_beheer terwijl de koppeling geen beheerkant heeft → PERMISSION_OFF', !!r3.isError && /^PERMISSION_OFF/.test(tekst(r3)));
    const r4 = await v2.v2Roep(k, rechten, 'emulate_cpu', { throttlingRate: 4 }, 'prive');
    const j = (await sys.query("SELECT details FROM app.audit WHERE owner_id = $1 AND action = 'owner.mcp.tool' AND result = 'denied' ORDER BY created_at DESC LIMIT 1", [U])).rows[0]?.details;
    check('NOT_SUPPORTED staat in het journaal (reden devtools)', !!r4.isError && /^NOT_SUPPORTED/.test(tekst(r4)) && j?.reden === 'devtools' && j?.tool === 'emulate_cpu', JSON.stringify(j));
    const r5 = await v2.v2Roep(k, rechten, 'evaluate_script', { function: '() => 1' }, 'prive');
    check('evaluate_script via de connector in de privéstaat → EXTENSIE_RUIMTE', !!r5.isError && /^EXTENSIE_RUIMTE/.test(tekst(r5)));
  } finally {
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [U]).catch(() => undefined);
    await closePool();
  }
  return einde();
}
