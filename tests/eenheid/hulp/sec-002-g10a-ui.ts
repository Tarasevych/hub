// Testhulp (geen test zelf) voor tests/eenheid/sec-002-g10a-20261112.test.ts — de SCHERM- en brugkant van groep g10a:
//   interface-01  «Дозволити» zonder (volledige) inhoud: compact verborg alles, elders slice(0, 240|800|1200) in jsonb-volgorde
//   interface-02  WIE vraagt: overal een vaste «Claude»
//   extensie-02   een AI met «Клік і введення» drukte zelf op «Дозволити» / toestemming / matrix
//   extensie-09   koppelcode als tekst in snapshot/schermafbeelding; koppelcode zonder bevestiging
//   interface-07  «Підтвердіть доступ» zei niet WAT er bevestigd werd en bood «Запам’ятати» ook zonder klik van de mens
//   extensie-04   (site) de meta mjn-profiel zei «gebruiker» terwijl de site het nog niet wist
// Geen netwerk, geen database. Alle «geheimen» zijn verzonnen proefwaarden.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { nepBrowser } from './nep-browser';

type Check = (naam: string, ok: boolean, info?: string) => void;
const lees = (p: string) => readFileSync(resolve(p), 'utf8');
const UK = (uk: string) => uk;
const NL = (_uk: string, nl: string) => nl;
/** Platte tekst van gerenderde HTML (entiteiten terug), om te zien wat de mens leest. */
const tekst = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Klein nep-DOM-element met closest() voor de selectors die extension/shared.js gebruikt: [attr], [attr="w"], #id. */
type NepEl = { attrs: Record<string, string>; parent: NepEl | null; form?: NepEl | null; hasAttribute: (a: string) => boolean; querySelector: (s: string) => NepEl | null; closest: (s: string) => NepEl | null; kinderen: NepEl[] };
function el(attrs: Record<string, string> = {}, parent: NepEl | null = null): NepEl {
  const e: NepEl = {
    attrs, parent, kinderen: [],
    hasAttribute: (a) => a in e.attrs,
    querySelector: (s) => { const zoek = (x: NepEl): NepEl | null => { for (const k of x.kinderen) { if (past(k, s)) return k; const d = zoek(k); if (d) return d; } return null; }; return zoek(e); },
    closest: (s) => { for (let x: NepEl | null = e; x; x = x.parent) if (past(x, s)) return x; return null; },
  };
  if (parent) parent.kinderen.push(e);
  return e;
}
function past(x: NepEl, selectors: string): boolean {
  return selectors.split(',').map((s) => s.trim()).some((s) => {
    let m = /^\[([\w-]+)\]$/.exec(s); if (m) return m[1] in x.attrs;
    m = /^\[([\w-]+)="([^"]*)"\]$/.exec(s); if (m) return x.attrs[m[1]] === m[2];
    m = /^#([\w-]+)$/.exec(s); if (m) return x.attrs.id === m[1];
    m = /^\.([\w-]+)$/.exec(s); if (m) return String(x.attrs.class || '').split(/\s+/).includes(m[1]);
    throw new Error(`nep-DOM kent selector niet: ${s}`);
  });
}

export async function uiBlok(check: Check): Promise<void> {
  nepBrowser('https://mcp.tarasevych.com');

  // ================================================================ interface-01: volledige inhoud, betekenisvolle volgorde
  {
    const { beschrijfParams, kernVan, zichtbaarMaken, LANG_VANAF } = await import('../../../src/goedkeuring-beschrijving');
    // jsonb sorteert sleutels op lengte: zo kwamen ze terug van de server (bewijs-afkappen2.mjs van de audit).
    const staart = Array.from({ length: 40 }, (_, i) => `--stap-${i}`);
    const exec = { cwd: 'C:\\werk', args: ['-NoProfile', ...staart, 'Remove-Item -Recurse C:\\Users'], command: 'cmd.exe' };
    const b = beschrijfParams(exec, UK);
    check('interface-01: exec — volgorde programma → argumenten → werkmap (jsonb zette command achteraan)', b.velden.map((v) => v.sleutel).join(',') === 'command,args,cwd', b.velden.map((v) => v.sleutel).join(','));
    check('interface-01: exec — niets afgekapt: het LAATSTE argument staat in de beschrijving', b.velden[1].waarde.includes('Remove-Item -Recurse C:\\\\Users') && kernVan(exec, UK).startsWith('cmd.exe "-NoProfile"') && kernVan(exec, UK).includes('Remove-Item'));
    const body = 'Дякую за звіт! '.repeat(30);
    const gh = { body, repo: 'vreemd/publiek', number: 7 };
    const g = beschrijfParams(gh, UK);
    check('interface-01: github_comment_issue — repo en nummer vóór de tekst; kern «vreemd/publiek#7»', g.velden.map((v) => v.sleutel).join(',') === 'repo,number,body' && kernVan(gh, UK) === 'vreemd/publiek#7', `${g.velden.map((v) => v.sleutel)} | ${kernVan(gh, UK)}`);
    check(`interface-01: lange tekst (> ${LANG_VANAF}) is «lang» (eerst openklappen) maar volledig bewaard`, g.velden[2].lang && g.velden[2].waarde === body && g.velden[2].tekens === body.length);
    const cal = { title: 'x'.repeat(500), notify: true, attendees: ['vreemde@example.invalid'] };
    const c = beschrijfParams(cal, UK);
    check('interface-01: calendar_create_event — deelnemers en notify als eigen regel vóór een lange titel? (titel, deelnemers, notify allemaal aanwezig, in vaste volgorde)', c.velden.map((v) => v.sleutel).join(',') === 'title,attendees,notify' && c.velden[1].waarde.includes('vreemde@example.invalid') && kernVan(cal, UK).includes('vreemde@example.invalid'));
    const z = zichtbaarMaken('rm\u202Etxt.exe\u200B');
    check('interface-01 (naastgelegen): onzichtbare/omkerende tekens worden zichtbaar gemaakt (⟦U+202E⟧, ⟦U+200B⟧)', z.verborgen === 2 && z.tekst === 'rm⟦U+202E⟧txt.exe⟦U+200B⟧', z.tekst);

    const { PendingList } = await import('../../../src/ApparatenWeergave');
    const pending = [{ id: 'p1', agentId: 'a1', agentName: 'PC-kantoor', type: 'exec', params: exec, createdAt: Date.now(), aanvrager: { client: 'Tweede klant (DCR)', agent: 'chatgpt', verbinding: 'abcd1234', site: false } },
      { id: 'p2', agentId: 'a1', agentName: 'PC-kantoor', type: 'browser.fill_form', params: { uid: 'f1' }, createdAt: Date.now() }];
    const compact = renderToStaticMarkup(createElement(PendingList, { tr: UK, pending, reload: async () => undefined, compact: true }));
    const t = tekst(compact);
    check('interface-01: «Огляд» (compact) toont nu de parameters: programma én laatste argument (was: alleen «Виконання команди»)', t.includes('cmd.exe') && t.includes('--stap-39') && t.includes('Remove-Item -Recurse'), t.slice(0, 200));
    check('interface-01: type zonder label krijgt een naam (browser.fill_form → «Заповнення форми»)', t.includes('Заповнення форми'));
    check('interface-01: «Дозволити» staat uit tot de mens alles zag (eerste weergave, nog niets bevestigd als gezien)', /<button[^>]*disabled=""[^>]*data-ai-geen-actie="1"[^>]*>(?:(?!<\/button>).)*Дозволити/.test(compact) || /<button[^>]*data-ai-geen-actie="1"[^>]*disabled=""/.test(compact) || /<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*Дозволити/.test(compact));

    const { ToolApprovals } = await import('../../../src/McpHulpmiddelenPaneel');
    const calls = [{ id: 't1', tool: 'github_comment_issue', args: gh, status: 'pending_approval', createdAt: Date.now(), preview: '', aanvrager: { client: 'Tweede klant (DCR)', agent: '', verbinding: 'abcd1234', site: false } },
      { id: 't2', tool: 'calendar_create_event', args: cal, status: 'pending_approval', createdAt: Date.now(), preview: '' }];
    const ta = renderToStaticMarkup(createElement(ToolApprovals, { tr: UK, calls, reload: async () => undefined }));
    const tt = tekst(ta);
    check('interface-01: site-hulpmiddelen — repo/nummer zichtbaar ondanks lange tekst (was: slice(0, 240) in jsonb-volgorde)', tt.includes('vreemd/publiek') && tt.includes('#7') && tt.includes('vreemde@example.invalid'));
    check('interface-01: lange tekst eerst als begin met teller «показано 400 із N знаків» en knop «Показати повністю»', tt.includes(`показано 400 із ${body.length} знаків`) && tt.includes('Показати повністю'));

    // ================================================================ interface-02: WIE vraagt
    check('interface-02: het verzoek noemt de klant uit de verbinding («Тweede klant (DCR)»), en geen vaste pil «Claude»', tt.includes('Просить: Tweede klant (DCR)') && !/hub-pill warn">Claude</.test(ta));
    check('interface-02: zonder bekende vrager staat er eerlijk «Невідомий клієнт ШІ» met waarschuwing', tt.includes('Невідомий клієнт ШІ') && ta.includes('data-aanvrager="onbekend"'));
    check('interface-02: ook bij opdrachten naar een pc staat wie vraagt (agent + verbinding)', t.includes('Просить: Tweede klant (DCR) · chatgpt · підключення abcd1234…'));
    const { aanvragerTekst } = await import('../../../src/goedkeuring-beschrijving');
    check('interface-02 (g10a-4): op het scherm is «?» of een lege naam «Невідомий клієнт ШІ» met waarschuwing', aanvragerTekst({ client: '?' }, UK).onbekend && aanvragerTekst({ client: ' ? ' }, UK).tekst === 'Невідомий клієнт ШІ' && !aanvragerTekst({ client: 'Cursor' }, UK).onbekend);
    const { activityTitle, activiteitContext, sourceLabel } = await import('../../../src/connector-activiteit');
    const grant = { id: 'g', source: 'claude', kind: 'grant' as const, type: 'grant', subject: 'Cursor', status: 'active', createdAt: 1, finishedAt: null };
    const tool = { id: 'x', source: 'claude', kind: 'tool' as const, type: 'mail_send', subject: 'Tweede klant (DCR)', status: 'pending_approval', createdAt: 1, finishedAt: null };
    check('interface-02: meldingen — geen vaste «Claude» meer (verbinding, aanroep, bron)', !/Claude/.test(activityTitle(grant, 'uk')) && activityTitle(grant, 'uk').includes('Cursor') && activiteitContext(tool, 'uk') === 'Tweede klant (DCR)' && sourceLabel('claude', 'nl') === 'AI-verbinding',
      `${activityTitle(grant, 'uk')} | ${activiteitContext(tool, 'uk')}`);
    const bronAw = lees('src/ApparatenWeergave.tsx');
    check('interface-02: uitleg «zonder klik» op de apparaatkaart noemt niet meer vast Claude/Anthropic', !/Claude|Anthropic/.test(bronAw));
    const routes = lees('backend/mcp-connector-routes.ts');
    check('interface-02: de route approvals geeft de aanvrager mee', /aanvrager: agentStore\.aanvragerVoorScherm\(r\)/.test(routes));

    // ================================================================ extensie-02 (site): alleen de mens
    const { doorMens, alleenMens } = await import('../../../src/menselijke-actie');
    let liep = 0; let voorkomen = 0;
    const h = alleenMens(() => { liep += 1; });
    h({ nativeEvent: { isTrusted: false, type: 'click' }, preventDefault: () => { voorkomen += 1; } });
    h({ nativeEvent: { isTrusted: true, type: 'click' }, preventDefault: () => { voorkomen += 1; } });
    check('extensie-02: een scriptklik (isTrusted=false, zoals el.click() van de extensie) doet niets en de standaardactie gaat niet door; een echte klik wel', liep === 1 && voorkomen === 1);
    check('extensie-02: «submit» die de browser zelf vuurt na een scriptklik of requestSubmit telt alleen met een actief gebruikersgebaar',
      !doorMens({ nativeEvent: { isTrusted: true, type: 'submit' } }, { isActive: false }) && doorMens({ nativeEvent: { isTrusted: true, type: 'submit' } }, { isActive: true }) && !doorMens(null));
    check('extensie-02: lijst met wachtende opdrachten en hulpmiddelen ligt in een zone die de extensie niet bedient', /data-agents-pending="2"[^>]*data-ai-geen-actie="1"/.test(compact) && /data-mcp-approvals="2"[^>]*data-ai-geen-actie="1"/.test(ta));
    const consent = lees('src/McpToestemmingVenster.tsx'), bea = lees('src/extensie/BrowserEnAgenten.tsx'), prive = lees('src/extensie/ExtensiePrive.tsx'), tools = lees('src/McpHulpmiddelenPaneel.tsx'), srv = lees('src/ServerKoppelen.tsx');
    check('extensie-02: OAuth-toestemming «Дозволити» alleen bij een echte klik; matrix «Зберегти», «Так, дозволити все» en «Відкрити доступ» idem; zones gemarkeerd',
      consent.includes('onClick={alleenMens(() => void decide(true))}') && consent.includes("data-mcp-consent-modal='true' {...geenAi}")
      && bea.includes("onClick={alleenMens(() => void opslaan())}") && bea.includes("onClick={alleenMens(() => void snel('alles'))}") && bea.includes('alleenMens(() => void doeOpen())(e)') && /data-bea-ruimte=\{ruimte\} \{\.\.\.geenAi\}/.test(bea)
      && prive.includes('alleenMens(() => void doeOpen())(e)') && tools.includes('data-mcp-tools-panel=\'true\' data-mcp-tools={String(tools.length)} {...geenAi}')
      && (srv.match(/\{\.\.\.geenAi\} onClick=\{alleenMens\(\(\) => void geef\(/g) || []).length === 4);
    // De brug van de extensie: zelfde zones, plus de beslisvensters die via een portal in <body> staan.
    const shared = await import(pathToFileURL(resolve('extension/shared.js')).href);
    const wortel = el();
    const zone = el({ 'data-ai-geen-actie': '1' }, wortel); const knop = el({}, zone);
    const venster = el({ 'data-venster': 'mcp-toestemming' }, wortel); const toestaan = el({}, venster);
    const stapOp = el({ 'data-venster': 'bevestig-toegang' }, wortel); const vinkje = el({}, stapOp);
    const gewoon = el({}, wortel);
    const form = el({}, wortel); el({ 'data-ai-geen-actie': '1' }, form); const veld = el({}, form); veld.form = form;
    check('extensie-02 (brug): knop in een afgeschermde zone, in het OAuth-/koppelvenster en in «Підтвердіть доступ» = geen actie; gewone knop wel',
      shared.inAiGeenActie(knop) && shared.inAiGeenActie(toestaan) && shared.inAiGeenActie(vinkje) && !shared.inAiGeenActie(gewoon) && shared.formulierMetAiGeenActie(veld) && !shared.formulierMetAiGeenActie(gewoon));
    // Na de toets (g10a-2): OOK de andere knoppen die een AI rechten of uitvoering geven, staan in een zone die de brug niet bedient —
    // ook in bestanden zonder eigen data-ai-geen-actie (selector op hun vaste wortelattributen).
    const ZONES: Array<[string, Record<string, string>]> = [
      ['grants/presets en «Окремий дозвіл» (AiToestemmingen)', { 'data-ai-grants': 'pc-1' }], ['«Підтвердити» in de wachtrij ai-bevestiging', { 'data-ab-bevestig': 'b1' }],
      ['«Відхилити» in de wachtrij ai-bevestiging', { 'data-ab-weiger': 'b1' }], ['keuzes bij een bevestiging', { class: 'ab-keuzes' }], ['Google-toegang geven (ai-bevestiging)', { 'data-ab-google': 'mail' }],
      ['scopes van een verbinding (AiToegangTab)', { 'data-toegang': 'g1' }], ['schakelaars van de site (SiteSchakelaars)', { 'data-site-schakelaars': '1' }],
      ['AI verbinden / duur (AiVerbinden)', { 'data-ai-verbinden': '1' }], ['bord met rechten per klant (AgentBord)', { 'data-agent-bord': '1' }], ['browser voor AI aan/uit (BrowserExtensiePaneel)', { 'data-browser-ai-schakelaar': '1' }]];
    const open = ZONES.filter(([, a]) => !shared.inAiGeenActie(el({}, el(a, el()))));
    check(`extensie-02 (g10a-2): de brug bedient ook ${ZONES.length} andere rechtenzones niet (grants, bevestigingen, scopes, schakelaars, bord, browserschakelaar)`, open.length === 0, open.map(([n]) => n).join(' | '));
    const brug = lees('extension/bridge.js');
    const fn = (naam: string) => { const i = brug.indexOf(`function ${naam}(`); return i < 0 ? '' : brug.slice(i, brug.indexOf('\n  }\n', i)); };
    check('extensie-02 (brug): click, type, hover, select en key weigeren in een afgeschermde zone; Enter verstuurt zo’n formulier niet',
      ['click', 'type', 'hover', 'selectOption', 'pressKey'].every((n) => fn(n).includes('weigerGeenActie(')) && fn('pressKey').includes('formulierMetAiGeenActie(el)'), ['click', 'type', 'hover', 'selectOption', 'pressKey'].filter((n) => !fn(n).includes('weigerGeenActie(')).join(','));

    // ================================================================ extensie-09: koppelcode niet leesbaar voor de AI, en niet zonder bevestiging
    const verborgen = el({ 'data-ai-verborgen': '1' }, wortel); const code = el({}, verborgen);
    check('extensie-09 (brug): tekst in [data-ai-verborgen] valt eruit (snapshot, namen, kopjes, «wacht op tekst»)', shared.inAiVerborgen(code) && !shared.inAiVerborgen(gewoon)
      && /text: paginaTekst\(\)/.test(brug) && /if \(paginaTekst\(\)\.toLowerCase\(\)\.includes\(wanted\)\)/.test(brug) && /filter\(\(el\) => !inAiVerborgen\(el\)\)/.test(brug) && /verbergGeheim\(message\.ms\)/.test(brug));
    // Na de toets (g10a-3): ook de ANDERE eenmalig getoonde geheimen (token van een MCP-verbinding en van het bord, toegangscode,
    // API-sleutel, TOTP-sleutel, herstelcodes, tijdelijk wachtwoord) leest de brug niet — op hun vaste attributen/klassen, ook in
    // schermen die zelf nog geen data-ai-verborgen zetten.
    const GEHEIMEN: Array<[string, Record<string, string>]> = [
      ['token van een nieuwe MCP-verbinding (AiVerbinden)', { 'data-vers-token': '1' }], ['token van het bord (AgentBord)', { 'data-token-eenmaal': '1' }],
      ['toegangscode (Toegangscodes)', { class: 'access-plane-mono toegangscode-code' }], ['API-sleutel (ApiPlatformWeergave)', { 'data-api-plaintext-once': 'true' }],
      ['TOTP-sleutel (toegangslaag)', { class: 'access-plane-mono access-plane-secret' }], ['TOTP-sleutel (aanmeld-vnext)', { class: 'amv-geheim' }],
      ['nieuwe herstelcodes', { 'data-herstel-nieuw': '' }], ['raster met herstelcodes', { class: 'herstel-raster' }], ['tijdelijk wachtwoord', { class: 'access-plane-subrow access-plane-recovery-codes' }]];
    const leesbaar = GEHEIMEN.filter(([, a]) => !shared.inAiVerborgen(el({}, el(a, el()))));
    check(`extensie-09 (g10a-3): de brug leest ook ${GEHEIMEN.length} andere eenmalige geheimen niet (tokens, toegangscode, API-sleutel, TOTP-sleutel, herstelcodes, tijdelijk wachtwoord)`, leesbaar.length === 0, leesbaar.map(([n]) => n).join(' | '));
    check('extensie-09 (g10a-3): de brug gebruikt voor tekst, namen en schermafbeelding dezelfde selector (AI_VERBORGEN_SELECTOR)', /querySelectorAll\(AI_VERBORGEN_SELECTOR\)/.test(brug) && /el\.querySelector\(AI_VERBORGEN_SELECTOR\)/.test(brug) && (brug.match(/\[\$\{AI_VERBORGEN\}\]/g) || []).length === 1 /* alleen de terugval voor een oudere shared.js */);
    const bg = lees('extension/background.js');
    check('extensie-09 (brug): geen schermafbeelding als de brug de verborgen zones niet bevestigd verborg (geen antwoord of geheim: -1)', /if \(!terug \|\| \(terug\.data && terug\.data\.geheim === -1\)\)/.test(bg) && bg.indexOf("op: 'markering-verberg'") < bg.indexOf('captureVisibleTab(tab.windowId'));
    const wiz = lees('src/AgentInrichtingWizard.tsx'), pan = lees('src/AgentenPaneel.tsx');
    check('extensie-09 (site): koppelcodes staan in [data-ai-verborgen] (wizard, paneel, serverkoppeling); «Створити код» alleen door de mens',
      wiz.includes('<code {...verborgenVoorAi}>{c}</code>') && wiz.includes('onClick={alleenMens(() => void createCode())}') && pan.includes("data-agents-pairing='true' {...verborgenVoorAi}") && srv.includes('<pre {...verborgenVoorAi}><code>{commando}</code></pre>'));
    const { createAgentRoutes } = await import('../../../backend/connectors-routes');
    const eigenaar = { user: { id: '00000000-0000-4000-8000-000000000001', email: 'eigenaar@example.invalid', role: 'owner', status: 'approved', entitlements: ['api-platform'] }, service: 'mcp' };
    const r: any = createAgentRoutes({ requireSession: async () => eigenaar as never, respond: (d: unknown, st = 200) => ({ statusCode: st, body: JSON.stringify(d) }), fail: (m: string, st = 400) => ({ statusCode: st, body: JSON.stringify({ error: m }) }), audit: async () => undefined, body: (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {}) } as never);
    const uit = await r['POST /api/owner/agents/pairing-code'][0]({ event: { headers: {} }, body: {}, params: {} });
    check('extensie-09 (server): een koppelcode vraagt altijd een verse bevestiging (STEP_UP_REQUIRED zonder bevestiging; was: direct een code)', uit.statusCode === 403 && /STEP_UP_REQUIRED/.test(uit.body), `status ${uit.statusCode}, code ${uit.statusCode === 200 ? "(uitgegeven, niet getoond)" : String(JSON.parse(uit.body || "{}").error)}`);
    // g10a-2: een AI-recht toevoegen of een set toepassen vraagt ALTIJD een verse bevestiging (vroeger: alleen «altijd»/destructief, dus
    // machine.read of de set «Спостерігач» ging met één klik — ook een scriptklik van de AI zelf).
    const roepR = async (route: string, body: Record<string, unknown>) => { const u = await r[route][0]({ event: { headers: {} }, body, params: {} }); return { st: Number(u.statusCode), fout: String(JSON.parse(u.body || '{}').error ?? '') }; };
    const add = await roepR('POST /api/owner/ai/grants/add', { agentId: 'pc-1', capability: 'machine.read', minutes: 60 });
    const preset = await roepR('POST /api/owner/ai/grants/preset', { agentId: 'pc-1', preset: 'spostericach' });
    check('extensie-02 (g10a-2, server): grants/add (machine.read) en grants/preset («Спостерігач») vragen een verse bevestiging', add.st === 403 && add.fout === 'STEP_UP_REQUIRED' && preset.st === 403 && preset.fout === 'STEP_UP_REQUIRED', JSON.stringify([add, preset]));
    const routesBron = lees('backend/connectors-routes.ts');
    check('extensie-09 (server): elke nieuwe koppeling komt als beveiligingsmelding bij de mens', /await meld\(userId, 'security',\s*\n\s*'Новий пристрій або браузер підключено до ШІ/.test(routesBron));
  }

  // ================================================================ interface-07: WAT wordt bevestigd
  {
    const { beschrijfStapOp } = await import('../../../shared/stap-op-beschrijving');
    const a = beschrijfStapOp('onbekend', '/api/owner/agents/commands/1234/approve');
    const p = beschrijfStapOp('passkey-verwijderen', '/api/owner/access/passkeys/verwijderen');
    const o = beschrijfStapOp('onbekend', '/api/owner/iets/nieuws?x=1');
    check('interface-07: het venster weet WAT er bevestigd wordt (goedkeuren van een opdracht, passkey verwijderen) met het gevolg',
      a.bekend && /Дозволити дію на вашому пристрої/.test(a.uk) && a.gevaar && p.bekend && p.uk === 'Видалити passkey' && /не можна буде увійти/.test(p.gevolgUk));
    check('interface-07: een onbekende actie zegt eerlijk het adres en «сайт не знає її опису» (met waarschuwing)', !o.bekend && o.gevaar && o.uk === 'Дія: /api/owner/iets/nieuws — сайт не знає її опису' && /kent er geen beschrijving/.test(o.nl));
    const venster = lees('src/platform/bevestig-toegang.tsx'), stap = lees('src/platform/stap-op.ts');
    check('interface-07: «Що ви підтверджуєте» en «Наслідок» staan in het venster; het pad gaat mee vanuit stapOpVragen',
      venster.includes("data-stap-op-wat={wat.bekend ? 'bekend' : 'onbekend'}") && venster.includes('beschrijfStapOp(opties.actie, opties.pad)') && stap.includes('pad: url, onthoudAanbieden: directGebaar()'));
    check('interface-07: «Запам’ятати» alleen bij een klik van de mens in dit tabblad (anders een eerlijke regel); het vinkje telt alleen een echte klik',
      venster.includes("weergave !== 'codewoord' && !nietDirect") && venster.includes("t('onthoudNietDirect')") && venster.includes('onClick={(e) => { if (!doorMens(e)) e.preventDefault(); }}'));
    const { directGebaar } = await import('../../../src/platform/stap-op');
    const g = globalThis as Record<string, unknown>;
    const oudDoc = g.document, oudNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const metGebaar = (actief: boolean, zicht = 'visible') => {
      g.document = { ...(oudDoc as object), visibilityState: zicht, hasFocus: () => true };
      Object.defineProperty(globalThis, 'navigator', { value: { userActivation: { isActive: actief } }, configurable: true, writable: true });
      try { return directGebaar(); } finally { g.document = oudDoc; if (oudNav) Object.defineProperty(globalThis, 'navigator', oudNav); }
    };
    check('interface-07: directGebaar — actief gebaar en zichtbaar = ja; zonder gebaar (scriptklik, hervat) of verborgen tabblad = nee', metGebaar(true) && !metGebaar(false) && !metGebaar(true, 'hidden'));
  }

  // ================================================================ extensie-04 (site): de meta zegt pas «zeker» als de site het weet
  {
    const tech = await import('../../../src/tech/tech-opslag');
    const basis = { geladen: false, profiel: null, activatie: null, fout: null, scheef: 0 } as never;
    check('extensie-04 (site): profielZeker — nog niet geladen = nee; netwerkfout zonder activering = nee; geladen = ja; netwerkfout MET activering = ja',
      !tech.profielZeker(basis) && !tech.profielZeker({ ...(basis as object), geladen: true, fout: 'netwerk' } as never) && tech.profielZeker({ ...(basis as object), geladen: true } as never)
      && tech.profielZeker({ ...(basis as object), geladen: true, fout: 'netwerk', activatie: { eind: Date.now() + 60_000 } } as never));
    const shared = await import(pathToFileURL(resolve('extension/shared.js')).href);
    check('extensie-04 (brug): «gebruiker» met data-zeker="0" is «onbekend» en geen slot raakt het; zonder voorbehoud gewoon «gebruiker»',
      shared.parseProfiel('gebruiker', '0') === 'onbekend' && shared.parseProfiel('gebruiker', '1') === 'gebruiker' && shared.parseProfiel('gebruiker') === 'gebruiker' && shared.parseProfiel('', '1') === 'onbekend'
      && !shared.profielToegestaan('prive', 'onbekend') && !shared.profielToegestaan('technisch', 'onbekend') && shared.profielToegestaan('prive', 'gebruiker'));
  }
  void NL;
}
