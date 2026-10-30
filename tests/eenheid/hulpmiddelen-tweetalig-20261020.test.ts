// Hulpmiddelen tweetalig (20.10.2026, eigenaar): de lijst van hulpmiddelen in de Claude-app toonde ENGELSE namen («Start, stop,
// restart or remove an app», «Deploy an app on your own device», «Take screenshot» …). De eis: titel, uitleg én parameterteksten
// van elk hulpmiddel alleen in het Oekraïens en het Nederlands, in de taal die de eigenaar van de grant op de site koos (anders
// Oekraïens), nooit Engels. De technische naam (`name`) blijft Latijn: dat is het protocol.
//
//  1. PUUR (geen database): elke vaste definitie (apparaat, apps, browser, GitHub, site, devtools-aliassen, uitrol) wordt voor beide
//     kanten en beide talen vertaald; geen enkele titel, uitleg of parametertekst bevat Engels. Oekraïens: geen Latijns woord van
//     ≥ 4 letters buiten de TOEGESTANE lijst hieronder; Nederlands: geen Engels signaalwoord (the, and, with, default, …).
//  2. MET DATABASE: tools/list op het oude /mcp en op connector v2 (/claude) voor een mens ZONDER taalkeuze → Oekraïens, voor een
//     mens met taal 'nl' → Nederlands; parameterteksten in dezelfde taal; beide adressen geven voor hetzelfde hulpmiddel dezelfde
//     titel en uitleg; een gewijzigde taalkeuze werkt bij de volgende tools/list (geen cache aan onze kant).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';
import * as c from '../../backend/mcp-connector';
import * as v2 from '../../backend/connector-v2';
import type * as v2st from '../../backend/connector-v2-opslag';
import { ALLE_VASTE_TOOLDEFS, DEVTOOLS_ALIASES, resolveAlias, taalVanGebruiker, type ToolDef } from '../../backend/connectors-hulpmiddelen';
import { UITROL_TOOLS } from '../../backend/uitrol-goedkeuring';
import { SITE_TOOLS } from '../../backend/site-hulpmiddelen';
import { agentUrl } from '../../shared/connector-v2/agenten';
import { V2_OPTIES, type Kant } from '../../shared/connector-v2/catalogus';
import { ontleed } from '../../shared/connector-v2/namen';
import { ALIAS_DOEL, hulpmiddelTekst, isTweetalig, p, TEKST_ONTBREEKT, TOOL_TALEN, toolTaal, vertaalHulpmiddel, vertaalSchema, type ToolTaal } from '../../shared/hulpmiddel-teksten';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
const json = (r: { body: string }) => (r.body ? JSON.parse(r.body) : null);
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const kop = (r: { headers: Record<string, string> }, n: string) => Object.entries(r.headers).find(([k]) => k.toLowerCase() === n)?.[1] ?? '';

// ---------------------------------------------------------------- taalcontrole
/**
 * Latijnse woorden die in een Oekraïense tekst mogen staan: merken, protocollen, bestands- en productnamen, toetsen en termen die
 * de site zelf zo schrijft. Alles wat hier niet staat en ≥ 4 Latijnse letters heeft, is Engels (of een vergeten vertaling).
 */
const TOEGESTAAN = new Set([
  // merken en diensten
  'Google', 'Drive', 'Gmail', 'GitHub', 'Docker', 'Dockerfile', 'Caddy', 'Podman', 'Guacamole', 'Microsoft', 'Outlook', 'Mijn', 'Ruimte',
  'Windows', 'PowerShell', 'Node', 'Python', 'nginx', 'Chrome', 'Apple', 'iCloud', 'Photos', 'Mermaid', 'Stripe', 'Loki', 'Grafana', 'Prometheus', 'Canva', 'Figma', 'Encrypt', 'Actions', 'Projects', 'Markdown', 'Calendar', 'tarasevych', 'claude', 'Claude',
  // protocollen, formaten en afkortingen
  'MCP', 'IMAP', 'SMTP', 'OAuth', 'CPU', 'URL', 'JSON', 'CSV', 'PDF', 'SSH', 'README', 'API', 'HTML', 'ICS', 'CalDAV', 'OPA', 'SIEM', 'HTTPS', 'https',
  'DNS', 'JavaScript', 'LCP', 'CLS', 'BYOS', 'UTF-8', 'UTF', 'SHA', 'true', 'false', 'base64', 'utf8', 'etag', 'SHA-256', 'sha256', 'ISO', 'REST', 'PaaS', 'INBOX', 'JSONB',
  // toetsen (browser_press_key) en bestanden/variabelen die de uitleg bij naam noemt
  'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'UITROL-VERSIE', 'BRON-COMMIT', 'GEEN_BRON_COMMIT',
  'NODE_ENV', 'production', 'PORT', 'OPENAI_API_KEY', 'package', 'json', 'deploy', 'REGELS-UITROLPAKKET', 'nextPageToken', 'rollout_history', 'calendar-draft',
  // termen die de site zelf in het Oekraïens zo schrijft (toestemmingsvenster, extensie)
  'passkey', 'cookie', 'admin', 'pull', 'request', 'issue', 'issues', 'repo', 'time_zone', 'all_day', 'default_reminders', 'title', 'description', 'location',
  'start', 'attendees', 'email', 'name', 'optional', 'recurrence', 'frequency', 'none', 'daily', 'weekly', 'monthly', 'yearly', 'interval', 'count', 'until',
  'days', 'reminders', 'method', 'popup', 'minutes', 'YYYY-MM-DDTHH', 'YYYY-MM-DD', 'YYYYMMDD-HHMMSS', 'zonder-git', 'octocat', 'hello-world', 'example',
  'notes', 'notes-app', 'server', 'status', 'short', 'per_page', 'user', 'repos', 'OWNER', 'REPO', 'git', 'node', 'primary', 'root', 'main', 'requirements',
  'index', 'html', 'externalOnly', 'needsAction', 'accepted', 'tentative', 'declined', 'open_service', 'actions', 'alles', 'prestaties', 'beveiliging',
]);
/** Wat vóór de controle uit een tekst verdwijnt: technische namen met «_», adressen en paden, en alles tussen rechte aanhalingstekens. */
const schoon = (s: string) => s
  .replace(/"[^"]*"/g, ' ')                                   // "voorbeelden" en "waarden"
  .replace(/\{[^}]*\}/g, ' ')                                 // {"NODE_ENV":"production"}, [{email,name}]
  .replace(/[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+/g, ' ')            // machine_list, browser_snapshot, OPENAI_API_KEY
  .replace(/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[^\s)]*)?/g, ' ') // tarasevych.com, notes.example.com, deploy/x.md, package.json
  .replace(/[A-Za-z0-9.]+\/[A-Za-z0-9./-]+/g, ' ');           // src/server.js, /user/repos
const latijnseWoorden = (s: string) => (schoon(s).match(/[A-Za-z][A-Za-z0-9-]{3,}/g) ?? []).filter((w) => !TOEGESTAAN.has(w) && !TOEGESTAAN.has(w.replace(/-$/, '')));
/** Engels in een Nederlandse tekst: woorden die het Nederlands niet kent (het Nederlands heeft geen «the», «and», «with», …). */
const ENGELS = /\b(the|and|with|when|from|only|default|optional|optionally|file|files|folder|device|user|which|returns?|must|without|this|that|these|whether|used|using|into|each|every|cannot|never|always|otherwise|also|same|see|after|before|first|cut|read-only|untrusted|approve|approval|pending|retry|list|page|number|characters|seconds|message|messages|secret|secrets|address|allowed|refuses|does|not|are|for|example|omitted|omit|leave|empty|show|shows|listed|search|version|versions|current|previous|size|text|value|values|write|writes|program|command|commands|wait|waits|stays|keep|kept|changes?|change|delete|deletes|deleted|remove|removes|create|creates|creating|whose|your|you|yours|they|them|their|there|here|where|while|than|then|many|much|more|less|other|another|any|some|all|both|either|neither|within|between|across|about|above|below|under|out|off|through|during|until|since|again|back|away|down|just|very|too|also)\b/i;

function schemaTeksten(schema: unknown, pad = 'inputSchema'): Array<{ pad: string; tekst: unknown }> {
  const uit: Array<{ pad: string; tekst: unknown }> = [];
  const loop = (v: unknown, waar: string) => {
    if (Array.isArray(v)) { v.forEach((x, i) => loop(x, `${waar}[${i}]`)); return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, w] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'description') uit.push({ pad: waar, tekst: w });
      else loop(w, `${waar}.${k}`);
    }
  };
  loop(schema, pad);
  return uit;
}
/** Elke parameter (properties.*, ook genest in items) heeft een description. */
function parametersZonderTekst(schema: any, pad = ''): string[] {
  const uit: string[] = [];
  const props = schema?.properties as Record<string, any> | undefined;
  if (!props) return uit;
  for (const [k, v] of Object.entries(props)) {
    if (v.description === undefined) uit.push(`${pad}${k}`);
    if (v.items && typeof v.items === 'object') uit.push(...parametersZonderTekst(v.items, `${pad}${k}[].`));
    if (v.properties) uit.push(...parametersZonderTekst(v, `${pad}${k}.`));
  }
  return uit;
}
/** Alle fouten in één vertaald hulpmiddel: Engels of onvertaald in titel, uitleg of schema. */
function fouten(t: ToolDef, taal: ToolTaal): string[] {
  const uit: string[] = [];
  const cyr = /[А-Яа-яІіЇїЄєҐґ]/;
  const beoordeel = (waar: string, s: unknown) => {
    if (typeof s !== 'string') { uit.push(`${waar}: geen string (${JSON.stringify(s)?.slice(0, 40)})`); return; }
    if (!s.trim()) { uit.push(`${waar}: leeg`); return; }
    if (s === TEKST_ONTBREEKT.uk || s === TEKST_ONTBREEKT.nl) { uit.push(`${waar}: tekst ontbreekt`); return; }
    if (taal === 'uk') {
      if (!cyr.test(s)) uit.push(`${waar}: geen Oekraïens: «${s.slice(0, 60)}»`);
      const lat = latijnseWoorden(s);
      if (lat.length) uit.push(`${waar}: Latijn in uk: ${lat.join(',')} ← «${s.slice(0, 80)}»`);
    } else {
      if (cyr.test(s)) uit.push(`${waar}: Cyrillisch in nl: «${s.slice(0, 60)}»`);
      const m = schoon(s).match(ENGELS);
      if (m) uit.push(`${waar}: Engels in nl («${m[0]}») ← «${s.slice(0, 80)}»`);
    }
  };
  beoordeel(`${t.name}.title`, t.title);
  if (t.title === t.name) uit.push(`${t.name}.title = technische naam`);
  beoordeel(`${t.name}.description`, t.description);
  for (const { pad, tekst } of schemaTeksten(t.inputSchema, `${t.name}.inputSchema`)) beoordeel(pad, tekst);
  for (const k of parametersZonderTekst(t.inputSchema)) uit.push(`${t.name}: parameter ${k} zonder description`);
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('hulpmiddelen-tweetalig-20261020');

  // ================================================================ 1. puur
  check('toolTaal: alleen nl → nl; uk, leeg, onbekend of Engels → uk (nooit een derde taal)', toolTaal('nl') === 'nl' && toolTaal('uk') === 'uk' && toolTaal(undefined) === 'uk' && toolTaal('en') === 'uk' && toolTaal(null) === 'uk' && TOOL_TALEN.join() === 'uk,nl');
  const s0 = { type: 'object', properties: { a: { type: 'string', description: p('Один.', 'Eén.'), enum: ['x'] }, b: { type: 'array', items: { type: 'object', properties: { c: { type: 'number', description: p('Два.', 'Twee.') } } }, description: 'reeds tekst' } }, required: ['a'] };
  const su = vertaalSchema(s0, 'uk') as any, sn = vertaalSchema(s0, 'nl') as any;
  check('vertaalSchema: tweetalige description → string per taal, ook genest in items; strings, enum en required blijven; de bron verandert niet',
    su.properties.a.description === 'Один.' && sn.properties.a.description === 'Eén.' && su.properties.b.items.properties.c.description === 'Два.' && sn.properties.b.items.properties.c.description === 'Twee.'
    && su.properties.b.description === 'reeds tekst' && JSON.stringify(su.properties.a.enum) === '["x"]' && su.required[0] === 'a' && isTweetalig((s0.properties.a as any).description) && !isTweetalig('x') && !isTweetalig({ uk: 1, nl: 'a' }));
  const onbekend = vertaalHulpmiddel({ name: 'niet_bestaand_tool', description: 'English text', inputSchema: { type: 'object', properties: {} } }, 'uk');
  check('onbekend hulpmiddel: nooit de Engelse tekst — technische naam als titel en «Опис ще не додано.»', onbekend.title === 'niet_bestaand_tool' && onbekend.description === TEKST_ONTBREEKT.uk);
  const vreemd = vertaalHulpmiddel({ name: 'extern_abc_hallo', title: 'Hallo', description: '[extern] Hallo tool', inputSchema: { type: 'object', properties: { x: { type: 'string', description: 'from that server' } } } }, 'uk');
  check('vreemd hulpmiddel (extern_*): blijft precies zoals de vreemde server het gaf (gemarkeerd, nooit herschreven)', vreemd.title === 'Hallo' && vreemd.description === '[extern] Hallo tool' && (vreemd.inputSchema as any).properties.x.description === 'from that server');

  const vaste = [...ALLE_VASTE_TOOLDEFS(), ...(UITROL_TOOLS as unknown as ToolDef[])];
  const namen = new Set(vaste.map((t) => t.name));
  check(`catalogus: ${namen.size} vaste hulpmiddelen (apparaat, apps, browser, GitHub, ${SITE_TOOLS.length} site, ${Object.keys(DEVTOOLS_ALIASES).length} devtools-aliassen, ${UITROL_TOOLS.length} uitrol), meer dan 100, unieke namen`,
    namen.size === vaste.length && namen.size > 100, String(namen.size));
  check('bron: elke parametertekst in de bron is tweetalig (p(uk, nl)); nergens nog een Engelse string als parameterbeschrijving',
    vaste.every((t) => schemaTeksten(t.inputSchema).every((x) => isTweetalig(x.tekst))),
    vaste.flatMap((t) => schemaTeksten(t.inputSchema, t.name).filter((x) => !isTweetalig(x.tekst)).map((x) => x.pad)).slice(0, 8).join(', '));
  const alleFouten: string[] = [];
  let geteld = 0;
  for (const kant of ['gebruiker', 'beheer'] as Kant[]) {
    for (const taal of TOOL_TALEN) {
      for (const t of vaste) {
        const v = vertaalHulpmiddel(t, taal, { kant, wacht: true });
        geteld++;
        alleFouten.push(...fouten(v, taal));
      }
    }
  }
  check(`vertaald: ${geteld} keer (hulpmiddel × kant × taal) zonder één Engels woord in titel, uitleg of parametertekst; elke parameter beschreven`,
    alleFouten.length === 0, alleFouten.slice(0, 12).join(' | '));
  const uk = vaste.map((t) => vertaalHulpmiddel(t, 'uk')), nl = vaste.map((t) => vertaalHulpmiddel(t, 'nl'));
  check('uk en nl verschillen écht (geen kopie van de ene taal in de andere) voor titel en uitleg van elk hulpmiddel',
    uk.every((t, i) => t.title !== nl[i].title && t.description !== nl[i].description), uk.filter((t, i) => t.title === nl[i].title).map((t) => t.name).join(','));
  check('titels zijn kort en menselijk: 2–8 woorden, zonder technische naam, en de voorbeelden van de eigenaar hebben een werkwoord-titel in beide talen',
    [...uk, ...nl].every((t) => { const n = String(t.title).trim().split(/\s+/).length; return n >= 1 && n <= 9; })
    && /^Запускати|^Запуск|^Керувати/.test(uk.find((t) => t.name === 'app_control')!.title!) && /^Розгортати/.test(uk.find((t) => t.name === 'app_deploy')!.title!)
    && /uitrollen$/i.test(nl.find((t) => t.name === 'app_deploy')!.title!) && /^Робити знімок/.test(uk.find((t) => t.name === 'take_screenshot')!.title!),
    [uk.find((t) => t.name === 'app_control')!.title, uk.find((t) => t.name === 'app_deploy')!.title, nl.find((t) => t.name === 'app_deploy')!.title].join(' | '));
  const ENGELSE_TITELS = ['Start, stop, restart or remove an app', 'Deploy an app on your own device', 'List deployed apps', 'Read a Google Drive file', 'Take screenshot'];
  const voorbeeld = (n: string) => `${uk.find((t) => t.name === n)?.title} / ${nl.find((t) => t.name === n)?.title}`;
  check('de voorbeelden van de eigenaar (app_control, app_deploy, app_list, drive_read_file, take_screenshot) hebben in uk én nl een menselijke titel en nooit meer de Engelse',
    ['app_control', 'app_deploy', 'app_list', 'drive_read_file', 'take_screenshot'].every((n) => { const a = uk.find((t) => t.name === n)!, b = nl.find((t) => t.name === n)!; return !!a?.title && !!b?.title && a.title !== b.title && !ENGELSE_TITELS.includes(a.title) && !ENGELSE_TITELS.includes(b.title); })
    && uk.find((t) => t.name === 'app_control')!.title === 'Запускати, зупиняти або видаляти додаток',
    ['app_control', 'app_deploy', 'app_list', 'drive_read_file', 'take_screenshot'].map(voorbeeld).join(' ; '));
  check('de uitleg van een hulpmiddel dat op een klik kan wachten zegt dat in de taal van de mens (uk: «підтвердження», nl: «bevestiging»)',
    /підтвердж/.test(vertaalHulpmiddel(vaste.find((t) => t.name === 'machine_write_file')!, 'uk', { wacht: true }).description) && /bevestiging/.test(vertaalHulpmiddel(vaste.find((t) => t.name === 'machine_write_file')!, 'nl', { wacht: true }).description));
  check('devtools-aliassen: ALIAS_DOEL (shared) wijst precies naar het doel van DEVTOOLS_ALIASES; de aliassen op browser_pages en navigate_page hebben een eigen tekst',
    Object.entries(ALIAS_DOEL).every(([a, doel]) => DEVTOOLS_ALIASES[a]?.target === doel) && Object.entries(DEVTOOLS_ALIASES).every(([a, x]) => ALIAS_DOEL[a] === x.target || ['select_page', 'new_page', 'close_page', 'navigate_page'].includes(a))
    && hulpmiddelTekst('take_snapshot')!.titel.uk === hulpmiddelTekst('browser_snapshot')!.titel.uk && hulpmiddelTekst('close_page')!.titel.uk !== hulpmiddelTekst('browser_pages')!.titel.uk);
  check('de beheerkant heeft voor apparaattools eigen teksten (server zelf) die verschillen van de gebruikerskant (eigen pc)',
    hulpmiddelTekst('machine_list', 'beheer')!.uitleg.uk !== hulpmiddelTekst('machine_list', 'gebruiker')!.uitleg.uk && hulpmiddelTekst('machine_list', 'beheer')!.uitleg.nl !== hulpmiddelTekst('machine_list', 'gebruiker')!.uitleg.nl);
  // De catalogus van connector v2 (de teksten die de mens in het venster goedkeurde) is de bron: ook die is vrij van Engels.
  const catFouten: string[] = [];
  for (const o of V2_OPTIES) {
    for (const i of [0, 1, 2] as const) {
      const lat = latijnseWoorden(o.uk[i]);
      if (lat.length) catFouten.push(`${o.key}.uk[${i}]: ${lat.join(',')}`);
      const m = schoon(o.nl[i]).match(ENGELS);
      if (m) catFouten.push(`${o.key}.nl[${i}]: ${m[0]}`);
    }
  }
  check(`catalogus v2 (${V2_OPTIES.length} opties): titel, uitleg en gevolgen in uk en nl zonder Engels`, catFouten.length === 0, catFouten.slice(0, 10).join(' | '));

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN tools-tweetalig (integratie): geen database'); return einde(); }

  // ================================================================ 2. met database: /mcp en /claude, taal van de grant-eigenaar
  const sys = getPool('systeem');
  const A = `tt-a-${randomUUID()}`, B = `tt-b-${randomUUID()}`;
  const clients: string[] = [];
  const prefs: string[] = [];
  const rpcOud = (token: string, msg: unknown) => c.rpcPost(`Bearer ${token}`, JSON.stringify(msg));
  const rpcV2 = (token: string, msg: unknown) => v2.rpc('claude', `Bearer ${token}`, JSON.stringify(msg));
  const lijstOud = async (token: string) => (json(await rpcOud(token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }))?.result?.tools ?? []) as ToolDef[];
  const lijstV2 = async (token: string) => (json(await rpcV2(token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }))?.result?.tools ?? []) as ToolDef[];

  async function koppel(userId: string, doel: { agent: 'claude'; keuze: v2st.V2Keuze } | { oud: 'prive' }) {
    const reg = json(await c.registerClient(JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK] })));
    clients.push(reg.client_id);
    const pk = pkce();
    const resource = 'agent' in doel ? agentUrl(doel.agent) : c.RESOURCE;
    const a = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: CALLBACK, code_challenge: pk.challenge, code_challenge_method: 'S256', state: 's', resource });
    const rid = new URL(kop(a as never, 'location')).searchParams.get('consent') || '';
    const d = 'agent' in doel ? await c.consentDecide(userId, rid, true, null, 'prive', doel.keuze) : await c.consentDecide(userId, rid, true, null, doel.oud, null);
    const code = 'redirect' in d ? new URL(d.redirect).searchParams.get('code') || '' : '';
    const t = json(await c.token(form({ grant_type: 'authorization_code', code, code_verifier: pk.verifier, client_id: reg.client_id, redirect_uri: CALLBACK })));
    return String(t.access_token || '');
  }
  const zetTaal = async (userId: string, taal: string | null) => {
    const id = randomUUID(); prefs.push(id);
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('owner_ui_preferences_v1',$1,$2)", [id, { userId, menu: [], ...(taal ? { language: taal } : {}), createdAt: Date.now(), updatedAt: Date.now() }]);
  };

  try {
    for (const u of [A, B]) await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [u, { email: `${u}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] }]);
    await zetTaal(B, 'nl');
    check('taalVanGebruiker: zonder voorkeur uk; met voorkeur nl op de site (owner_ui_preferences_v1.language) nl', (await taalVanGebruiker(A)) === 'uk' && (await taalVanGebruiker(B)) === 'nl');

    const oudA = await koppel(A, { oud: 'prive' }), oudB = await koppel(B, { oud: 'prive' });
    const lA = await lijstOud(oudA), lB = await lijstOud(oudB);
    const fA = lA.flatMap((t) => fouten(t, 'uk')), fB = lB.flatMap((t) => fouten(t, 'nl'));
    check(`oud /mcp, mens zonder taalkeuze: ${lA.length} hulpmiddelen, alles Oekraïens (titel, uitleg, parameters), geen Engels`, lA.length > 50 && fA.length === 0, fA.slice(0, 8).join(' | '));
    check(`oud /mcp, mens met taal nl: ${lB.length} hulpmiddelen, alles Nederlands, geen Engels en geen Cyrillisch`, lB.length === lA.length && fB.length === 0, fB.slice(0, 8).join(' | '));
    const perA = (n: string) => lA.find((t) => t.name === n)!, perB = (n: string) => lB.find((t) => t.name === n)!;
    check('oud /mcp: de lijst van een mens zonder apparaat en zonder GitHub bevat de apparaat-, site- en browserhulpmiddelen (RISKY staat standaard uit en ontbreekt dus)',
      !!perA('machine_list_dir') && !!perA('docker_list_containers') && !!perA('drive_read_file') && !!perA('list_pages') && !perA('app_control') && !perA('machine_exec'), lA.map((t) => t.name).slice(0, 10).join(','));
    check('parameterteksten volgen de taal: machine (uk «пристрою», nl «apparaat»); het schema is verder gelijk (enum, required, additionalProperties)',
      /пристро/.test(String((perA('machine_list_dir').inputSchema as any).properties.machine.description)) && /apparaat/.test(String((perB('machine_list_dir').inputSchema as any).properties.machine.description))
      && JSON.stringify((perA('browser_scroll').inputSchema as any).properties.direction.enum) === JSON.stringify((perB('browser_scroll').inputSchema as any).properties.direction.enum)
      && JSON.stringify((perA('machine_list_dir').inputSchema as any).required) === JSON.stringify((perB('machine_list_dir').inputSchema as any).required)
      && (perA('machine_list_dir').inputSchema as any).additionalProperties === false);
    check('annotaties en namen veranderen niet met de taal', lA.every((t, i) => t.name === lB[i].name && JSON.stringify(t.annotations ?? {}) === JSON.stringify(lB[i].annotations ?? {})));

    // connector v2: dezelfde teksten op /claude (met de v2-naam en het staartje [Мій простір · простір · groep])
    const keuze: v2st.V2Keuze = { kanten: ['gebruiker'], sleutels: V2_OPTIES.filter((o) => o.status === 'actief' && o.kant === 'gebruiker').map((o) => o.key) };
    const v2A = await koppel(A, { agent: 'claude', keuze }), v2B = await koppel(B, { agent: 'claude', keuze });
    const vA = await lijstV2(v2A), vB = await lijstV2(v2B);
    const gA = vA.flatMap((t) => fouten(t, 'uk')), gB = vB.flatMap((t) => fouten(t, 'nl'));
    check(`connector v2 /claude, zonder taalkeuze: ${vA.length} hulpmiddelen, alles Oekraïens`, vA.length > 50 && gA.length === 0, gA.slice(0, 8).join(' | '));
    check(`connector v2 /claude, taal nl: ${vB.length} hulpmiddelen, alles Nederlands`, vB.length === vA.length && gB.length === 0, gB.slice(0, 8).join(' | '));
    check('v2: het staartje noemt ruimte en groep in de taal van de mens («Мій простір · приватний простір» / «Mijn Ruimte · privéruimte»)',
      vA.every((t) => /\[Мій простір · приватний простір · [^\]]+\]$/.test(t.description)) && vB.every((t) => /\[Mijn Ruimte · privéruimte · [^\]]+\]$/.test(t.description)), vA[0]?.description.slice(-60));
    // Zelfde hulpmiddel = zelfde titel en uitleg op beide adressen. De v2-naam wijst naar de interne naam; het oude /mcp toont
    // browserhulpmiddelen onder hun devtools-alias (take_snapshot ↔ browser_snapshot), dus vergelijk op de interne naam.
    const internOud = new Map<string, ToolDef>();
    for (const t of lA) internOud.set(resolveAlias(t.name, {}).name, t);
    const internOudB = new Map<string, ToolDef>();
    for (const t of lB) internOudB.set(resolveAlias(t.name, {}).name, t);
    const verschillen: string[] = [];
    let vergeleken = 0;
    for (const [lijst, oud, taal] of [[vA, internOud, 'uk'], [vB, internOudB, 'nl']] as const) {
      for (const t of lijst) {
        const o = ontleed(t.name, 'claude');
        // browser_pages (select/new/close_page) en browser_open/browser_history (navigate_page) hebben op /mcp meerdere aliassen met een eigen tekst
        if (!o.ok || !o.optie.intern || o.optie.intern === 'v2_whoami' || ['browser_pages', 'browser_open', 'browser_history'].includes(o.optie.intern)) continue;
        const basis = oud.get(o.optie.intern);
        if (!basis) continue; // hulpmiddelen die /mcp in deze toestand niet toont (bv. zonder GitHub-token)
        vergeleken++;
        if (basis.title !== t.title) verschillen.push(`${taal} ${o.optie.intern}: titel «${basis.title}» ≠ «${t.title}»`);
        if (!t.description.startsWith(`${basis.description} [`)) verschillen.push(`${taal} ${o.optie.intern}: uitleg verschilt`);
        if (JSON.stringify(basis.inputSchema) !== JSON.stringify(t.inputSchema)) verschillen.push(`${taal} ${o.optie.intern}: schema verschilt`);
      }
    }
    check(`oud /mcp en connector v2 geven voor hetzelfde hulpmiddel dezelfde titel, uitleg en parameterteksten (${vergeleken} vergeleken, uk + nl)`, vergeleken > 80 && verschillen.length === 0, verschillen.slice(0, 6).join(' | ') || String(vergeleken));

    // De taalkeuze is live: wisselt de mens op de site van taal, dan is de volgende tools/list in die taal (geen cache aan onze kant).
    await zetTaal(B, 'uk');
    await new Promise((r) => setTimeout(r, 5));
    const lB2 = await lijstOud(oudB), vB2 = await lijstV2(v2B);
    check('taalwissel nl → uk op de site: de volgende tools/list (oud én v2) is Oekraïens, zonder herverbinden', lB2.every((t) => /[А-Яа-яІіЇїЄєҐґ]/.test(String(t.title))) && vB2.every((t) => /[А-Яа-яІіЇїЄєҐґ]/.test(String(t.title))), `${lB2[0]?.title} / ${vB2[0]?.title}`);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query("UPDATE app.mcp_oauth_tokens SET revoked_at = now() WHERE user_id = ANY($1)", [[A, B]]).catch(() => undefined);
    if (clients.length) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]).catch(() => undefined);
    if (prefs.length) await sys.query("DELETE FROM app.records WHERE tbl = 'owner_ui_preferences_v1' AND id = ANY($1)", [prefs]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [[A, B]]);
    await sys.query('DELETE FROM app.user_ai_settings WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
  }
  await closePool();
  return einde();
}
