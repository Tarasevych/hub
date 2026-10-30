// Melding van de eigenaar, 19.10.2026 — punten 7 en 8.
//
// PUNT 7: «Chrome не надав дозвіл налагоджувача — діагностику не ввімкнено», terwijl het in een vroegere versie wél werkte.
// Oorzaak (hier bewezen uit het manifest én vastgelegd in deploy/BROWSER-EXTENSIE.md): Chrome staat `debugger` NIET toe als
// optioneel recht. Het staat wel in optional_permissions, maar Chrome haalt het er bij het inlezen uit, dus
// chrome.permissions.request({permissions:['debugger']}) eindigt ALTIJD met «Only permissions specified in the manifest may be
// requested». Het verzoek stond dus goed (synchroon in de klikhandler, binnen het gebruikersgebaar) maar kon per definitie niet
// slagen — en de oude melding deed alsof de gebruiker of Chrome nee had gezegd. 0.6.1: het verzoek komt nog steeds STRIKT uit een
// klik (opties, pop-up, zijpaneel), maar de uitkomst wordt geclassificeerd ('ja' | 'geweigerd' | 'nee' | 'niet-aanvraagbaar') en
// elke stand heeft eigen uitleg + wat de gebruiker kan doen (pakket «діагностика», waarin het recht in het manifest staat).
// Het veiligheidsmodel wordt NIET losser: debuggerToegestaan() eist recht + opt-in + ruimte 'technisch' + een levende ondertekende
// ontgrendeling met browser.debug + host ∈ ADMIN_HOSTS_TOEGESTAAN ∩ grant.domeinen + een tabblad dat NU technisch is.
//
// PUNT 8: geen zichtbaar teken dat de verbinding met de site actief is. 0.6.1: markeringVoor() bepaalt of er een dunne rand komt
// (alleen bij een slot dat open ÉN verbonden is, op een host uit de ontgrendeling, met het juiste profiel); extension/markering.js
// tekent die in een eigen, gesloten shadow DOM met pointer-events:none en respecteert prefers-reduced-motion; background.js zet de
// badge in de kleur van het profiel met een tooltip en stuurt een flits naar het tabblad waar de AI iets doet (nooit bij een
// schermafbeelding of diepe diagnose).
//
// Geen netwerk, geen database: de echte extension/shared.js en de echte background.js draaien hier met een nep-chrome.
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';
import * as JS from '../../extension/shared.js';
import {
  ADMIN_HOSTS_TOEGESTAAN, DIAG_CAP, DIAG_PAKKET, DIAG_RECHT_STANDEN, DIAG_RUIMTE, MARKERING_BADGE, MARKERING_KLEUREN,
  MIN_EXTENSIE_VERSIE, WEIGER_UITLEG, isDiagRechtStand,
} from '../../shared/extensie-ontgrendeling';
import { EXT_MIN_VERSIE, updateAdvies, vergelijkVersie } from '../../shared/extensie-update';
import { filterPubliek } from '../../src/extensie/extensie-live';

const W = process.cwd();
const EXT = join(W, 'extension');
const lees = (f: string) => readFileSync(join(EXT, f), 'utf8');
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const BASIS = `chrome-extension://${ID}/`;

type Luisteraar = (m: unknown, s: unknown, r: (x: unknown) => void) => unknown;
/** Nep-chrome zoals extensie-opties.test.ts, plus action (badge/tooltip) en tabs.sendMessage-logboek (flits). */
function nepChrome(opslag: Record<string, unknown>, verleend: Set<string>, manifest: Record<string, unknown>) {
  const luister = { intern: [] as Luisteraar[], extern: [] as Luisteraar[] };
  const ev = (lijst?: Luisteraar[]) => ({ addListener: (f: Luisteraar) => { lijst?.push(f); } });
  const leeg = (): any => new Proxy(function () { /* nep */ }, { get: (_t, k) => (k === 'then' ? undefined : leeg()), apply: () => Promise.resolve({}) });
  const actie = { badge: [] as string[], kleur: [] as string[], titel: [] as string[] };
  const naarTab = [] as Array<{ tabId: number; bericht: any }>;
  const verzoeken = [] as Array<{ permissions: string[] }>;
  const local = {
    get: async (k: string | string[]) => { const ks = Array.isArray(k) ? k : [k]; return Object.fromEntries(ks.filter((x) => x in opslag).map((x) => [x, opslag[x]])); },
    set: async (o: Record<string, unknown>) => { Object.assign(opslag, o); },
    remove: async (k: string | string[]) => { for (const x of Array.isArray(k) ? k : [k]) delete opslag[x]; },
  };
  const chrome = {
    runtime: {
      id: ID, getURL: (p: string) => `${BASIS}${p}`, getManifest: () => manifest,
      onMessage: ev(luister.intern), onMessageExternal: ev(luister.extern), onInstalled: ev(), onStartup: ev(),
      openOptionsPage: async () => undefined, sendMessage: async () => undefined,
    },
    storage: { local, session: { get: async () => ({}), set: async () => undefined, remove: async () => undefined } },
    alarms: { create: () => undefined, clear: async () => undefined, onAlarm: ev() },
    tabs: {
      query: async () => [], get: async (id: number) => ({ id, url: 'https://admin.tarasevych.com/' }),
      sendMessage: async (tabId: number, bericht: unknown) => { naarTab.push({ tabId, bericht }); return { ok: true }; },
      create: async () => undefined, onRemoved: ev(), onUpdated: ev(), onActivated: ev(),
    },
    action: {
      setBadgeText: async (o: { text: string }) => { actie.badge.push(String(o.text)); },
      setBadgeBackgroundColor: async (o: { color: string }) => { actie.kleur.push(String(o.color)); },
      setTitle: async (o: { title: string }) => { actie.titel.push(String(o.title)); },
    },
    permissions: {
      contains: async (p: { permissions: string[] }) => p.permissions.every((x) => verleend.has(x)),
      request: async (p: { permissions: string[] }) => { verzoeken.push(p); return false; },
      remove: async () => true, onAdded: ev(), onRemoved: ev(),
    },
    debugger: leeg(), sidePanel: leeg(), scripting: leeg(), windows: leeg(), webRequest: leeg(),
  };
  return { chrome: new Proxy(chrome as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : leeg()) }), luister, actie, naarTab, verzoeken };
}
const vraag = (f: Luisteraar, m: unknown, s: unknown) => new Promise<any>((klaar) => { f(m, s, klaar); setTimeout(() => klaar('GEEN_ANTWOORD'), 1500); });

/** Een levende, geldige grant van het technische slot (alleen de velden die de poortwachter leest). */
const techGrant = (over: Record<string, unknown> = {}) => ({ caps: ['browser.read', DIAG_CAP], domeinen: ['admin.tarasevych.com', 'mcp.tarasevych.com'], ...over });
const basis = { recht: true, optIn: true, ruimte: 'technisch', url: 'https://admin.tarasevych.com/beheer', grant: techGrant(), profiel: 'technisch' };

/** Publieke vorm van één slot zoals de extensie hem naar de pagina duwt. */
const slot = (over: Record<string, unknown> = {}) => ({
  gekoppeld: true, verbonden: true, staat: 'ontgrendeld', exp: Date.now() + 3600_000,
  caps: ['browser.read'], domeinen: ['hub.tarasevych.com', 'mail.tarasevych.com'], aiVerbonden: false, agentId: '', ...over,
});

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-debugger-markering-20261019');
  const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));

  // ---------------------------------------------------------------- 0. versie en «bijwerken, niet blokkeren»
  // 20.10.2026 (0.6.2): de markering noemt nu de agent en zijn actie. De versie staat op EEN plek (het manifest); de drie
  // andere waarden moeten daaraan gelijk zijn — nooit een vaste reeks in de test, anders leeft de versie op vier plaatsen.
  // 0.7.0 (zone E): de MINIMUMVERSIE blijft 0.6.2 — de server bedient een 0.6.2-extensie nog correct (capsVoorVersie strookt de nieuwe
  // mogelijkheden weg, een lange termijn → TERMIJN_VEREIST_UPDATE, scripts → EXTENSIE_SCRIPT), dus niemand hoeft gedwongen bij te werken.
  // Wat één bron blijft: de minimumversie op de drie plaatsen; het manifest is minstens die versie.
  check('MIN_EXTENSIE_VERSIE, EXT_MIN_VERSIE en extension/shared.js noemen dezelfde minimumversie (één bron); het manifest is minstens die versie',
    EXT_MIN_VERSIE === MIN_EXTENSIE_VERSIE && JS.MIN_EXTENSIE_VERSIE === MIN_EXTENSIE_VERSIE && vergelijkVersie(manifest.version, MIN_EXTENSIE_VERSIE) >= 0,
    `${manifest.version} / ${MIN_EXTENSIE_VERSIE} / ${EXT_MIN_VERSIE} / ${JS.MIN_EXTENSIE_VERSIE}`);
  {
    const advies = updateAdvies({ heeft: '0.6.0', nieuwste: manifest.version, min: EXT_MIN_VERSIE, crxVersie: null, zelfGehost: false });
    check('een 0.6.0-extensie krijgt de band «Розширення застаріло 0.6.0 → 0.6.1» (verplicht, geen «later»), dus de site VRAAGT om bijwerken',
      advies.toon && advies.verplicht && advies.van === '0.6.0' && advies.naar === manifest.version && advies.reden === 'te-oud', JSON.stringify(advies));
    const nu = updateAdvies({ heeft: manifest.version, nieuwste: manifest.version, min: EXT_MIN_VERSIE });
    check('een extensie op de huidige versie krijgt geen band', !nu.toon && nu.reden === 'actueel');
    const u = WEIGER_UITLEG.EXTENSIE_TE_OUD;
    check('EXTENSIE_TE_OUD legt uit WAAROM en wijst naar het bijwerken op de eigen site (geen blokkade zonder uitleg)',
      u.uk.includes(MIN_EXTENSIE_VERSIE) && u.uk.length > 80 && u.nl.length > 80 && !!u.actie && u.actie.url.startsWith('https://mcp.tarasevych.com/'), JSON.stringify(u.actie));
    check('elke versie van de extensie haalt het minimum (de build publiceert nooit een pakket onder het minimum)', vergelijkVersie(manifest.version, EXT_MIN_VERSIE) >= 0);
  }

  // ---------------------------------------------------------------- 1. shared.js = shared/extensie-ontgrendeling.ts (spiegel)
  check('spiegel: DIAG_RECHT_STANDEN, DIAG_PAKKET, DIAG_RUIMTE, DIAG_CAP, MARKERING_KLEUREN, MARKERING_BADGE in extension/shared.js = de TypeScript-versie',
    JSON.stringify(JS.DIAG_RECHT_STANDEN) === JSON.stringify(DIAG_RECHT_STANDEN) && JS.DIAG_PAKKET === DIAG_PAKKET
    && JS.DIAG_RUIMTE === DIAG_RUIMTE && JS.DIAG_CAP === DIAG_CAP
    && JSON.stringify(JS.MARKERING_KLEUREN) === JSON.stringify(MARKERING_KLEUREN) && JSON.stringify(JS.MARKERING_BADGE) === JSON.stringify(MARKERING_BADGE));
  check('spiegel: beide kanten kennen dezelfde standen en keuren een verzonnen stand af',
    DIAG_RECHT_STANDEN.every((s) => JS.isDiagRechtStand(s) && isDiagRechtStand(s)) && !JS.isDiagRechtStand('misschien') && !isDiagRechtStand('misschien'));
  check('diepe diagnose hoort bij ruimte «technisch» en mogelijkheid «browser.debug»; de kleuren verschillen per profiel',
    DIAG_RUIMTE === 'technisch' && DIAG_CAP === 'browser.debug' && MARKERING_KLEUREN.prive !== MARKERING_KLEUREN.technisch && MARKERING_BADGE.prive !== MARKERING_BADGE.technisch);

  // ---------------------------------------------------------------- 2. waarom het verzoek nooit lukte + waar het nu vandaan komt
  {
    const opt = lees('options.js'); const ui = lees('ui.js'); const bg = lees('background.js');
    // UI-011 (0.8.0): opgelost — `debugger` staat VAST in permissions (Chrome weigert het als optioneel recht; bewezen in Chrome 156).
    check('0.8.0: `debugger` staat VAST in permissions en NIET meer in optional_permissions',
      !(manifest.optional_permissions || []).includes('debugger') && (manifest.permissions || []).includes('debugger'));
    check('de fout van Chrome wordt als «niet-aanvraagbaar» geclassificeerd, niet als weigering van de gebruiker',
      JS.diagRechtStandVanFout(new Error('Only permissions specified in the manifest may be requested.')) === 'niet-aanvraagbaar'
      && JS.diagRechtStandVanFout(new Error("'debugger' cannot be optional")) === 'niet-aanvraagbaar'
      && JS.diagRechtStandVanFout(new Error('This function must be called during a user gesture')) === 'nee'
      && JS.diagRechtStandVanFout(null) === 'geweigerd');
    check('dezelfde indeling in ui.js (de extensie-pagina\'s kunnen geen module importeren) — standVanFout',
      /function standVanFout\(fout\)/.test(ui) && ui.includes('only permissions specified in the manifest') && ui.includes('user gesture'));
    // Het verzoek moet SYNCHROON in de klikhandler starten: in de bron staat het vóór elke await en vóór set-diag.
    check('0.8.0: niemand vraagt `debugger` meer aan (opties: alleen nativeMessaging via vraagRecht; ui.js leest met permissions.contains)',
      (opt.match(/chrome\.permissions\.request\(/g) || []).length === 1 && !/vraagRecht\('debugger'\)/.test(opt) && /const toestemming = want \? vraagRecht\('nativeMessaging'\)/.test(opt)
      && !/chrome\.permissions\.request\(/.test(ui) && /permissions\.contains\(\{ permissions: \['debugger'\] \}\)/.test(ui));
    check('de achtergrond (service worker) vraagt NOOIT een recht aan — daar is geen gebruikersgebaar; ze leest het alleen',
      !/chrome\.permissions\.request/.test(bg) && /permissions\.contains\(\{ permissions: \['debugger'\] \}\)/.test(bg));
    check('0.8.0: elke stand heeft eigen uitleg én een herstelstap (chrome://extensions / ↻ / bijwerken naar 0.8.0); de schakelaar springt nooit stil terug',
      DIAG_RECHT_STANDEN.every((s) => ui.includes(`'${s}'`) || ui.includes(`${s}:`)) && ui.includes('chrome://extensions') && ui.includes('0.8.0') && /diag-hulp/.test(opt) && /diagWerkelijk/.test(ui));
  }

  // ---------------------------------------------------------------- 3. de poortwachter: alleen technisch profiel, alleen toegestane hosts
  {
    const ok = JS.debuggerToegestaan(basis);
    check('aanhaken mag als alles klopt (recht + opt-in + technisch slot + ondertekende ontgrendeling met browser.debug + toegestane host + technisch tabblad)', ok.ok === true, JSON.stringify(ok));
    const gevallen: Array<[string, Record<string, unknown>, string]> = [
      ['zonder het Chrome-recht', { recht: false }, 'GEEN_RECHT'],
      ['zonder de keuze van de gebruiker (diagOptIn)', { optIn: false }, 'GEEN_OPT_IN'],
      ['uit het slot «як користувач» (prive), ook met alle caps', { ruimte: 'prive', grant: techGrant({ domeinen: ['hub.tarasevych.com'] }), profiel: 'gebruiker', url: 'https://hub.tarasevych.com/' }, 'VERKEERDE_RUIMTE'],
      ['zonder ontgrendeling (vergrendeld slot)', { grant: null }, 'GEEN_ONTGRENDELING'],
      ['met een ontgrendeling zonder browser.debug', { grant: techGrant({ caps: ['browser.read', 'browser.screenshot'] }) }, 'GEEN_ONTGRENDELING'],
      ['op een host die niet in de ontgrendeling staat', { url: 'https://mail.tarasevych.com/' }, 'DOMEIN'],
      ['op een vreemde host die wél in de grant zou staan', { url: 'https://admin.tarasevych.com.evil.com/', grant: techGrant({ domeinen: ['admin.tarasevych.com.evil.com'] }) }, 'DOMEIN'],
      ['over http in plaats van https', { url: 'http://admin.tarasevych.com/' }, 'DOMEIN'],
      ['op een subdomein van een toegestane host', { url: 'https://x.admin.tarasevych.com/', grant: techGrant({ domeinen: ['x.admin.tarasevych.com'] }) }, 'DOMEIN'],
      ['in een tabblad dat niet (meer) in de technische modus staat', { profiel: 'gebruiker' }, 'PROFIEL'],
    ];
    const fout = gevallen.filter(([, over, code]) => JS.debuggerToegestaan({ ...basis, ...over }).code !== code);
    check(`poortwachter weigert elk van de ${gevallen.length} gevallen met de juiste code (${gevallen.map(([n]) => n).join('; ')})`,
      fout.length === 0, fout.map(([n, over]) => `${n} → ${JSON.stringify(JS.debuggerToegestaan({ ...basis, ...over }))}`).join(' | '));
    // Elke host die een technische ontgrendeling mag noemen is ook voor de debugger toegestaan; niets daarbuiten.
    const buiten = ['tarasevych.com', 'www.tarasevych.com', 'evil.com'].filter((h) => JS.debuggerToegestaan({ ...basis, url: `https://${h}/`, grant: techGrant({ domeinen: [h] }) }).ok);
    check('alleen hosts uit ADMIN_HOSTS_TOEGESTAAN; de site zelf en vreemde hosts nooit', buiten.length === 0 && ADMIN_HOSTS_TOEGESTAAN.includes('admin.tarasevych.com') && !ADMIN_HOSTS_TOEGESTAAN.includes('tarasevych.com'), buiten.join());
    const bg = lees('background.js');
    check('background.js gebruikt deze ene poortwachter vóór chrome.debugger.attach en geeft het slot mee (humanAttach(r, …))',
      /async function humanAttach\(r, tab, tabOk(, cap = DIAG_CAP)?\)/.test(bg) && bg.indexOf('debuggerToegestaan({') < bg.indexOf('chrome.debugger.attach')
      && /deepDiagnostics\(r, tab,/.test(bg) && /async function deepDiagnostics\(r, tab,/.test(bg));
    check('onDetach en het intrekken van het recht worden opgevangen: tabblad los, alles los, nieuwe stand verspreid',
      /chrome\.debugger\.onDetach\.addListener/.test(bg) && /canceled_by_user/.test(bg)
      && /permissions\.onRemoved\.addListener\(\(\) => \{ losgelaten = .*detachAll\(\)\.then\(\(\) => statusWijziging\(\)\)/.test(bg)
      && /permissions\.onAdded\.addListener\(\(\) => \{ debuggerLuisteraars\(\)/.test(bg));
  }

  // ---------------------------------------------------------------- 4. markering: exact de staat van ontgrendeling + verbinding
  {
    const aan = JS.markeringVoor(slot(), 'prive', 'gebruiker', 'https://hub.tarasevych.com/bureau');
    check('markering AAN: slot gekoppeld + verbonden (WSS ready) + ontgrendeld + juist profiel + host uit de ontgrendeling',
      !!aan && aan.ruimte === 'prive' && aan.kleur === MARKERING_KLEUREN.prive && aan.agent === false, JSON.stringify(aan));
    const agent = JS.markeringVoor(slot({ staat: 'agent', aiVerbonden: true }), 'prive', 'gebruiker', 'https://hub.tarasevych.com/');
    check('markering met een werkende AI-agent: zelfde kleur, maar gemarkeerd als «agent» (dikkere rand)', !!agent && agent.agent === true);
    const tech = JS.markeringVoor(slot({ domeinen: ['admin.tarasevych.com'] }), 'technisch', 'technisch', 'https://admin.tarasevych.com/');
    check('markering van het technische slot heeft een andere kleur dan die van de gebruiker', !!tech && tech.kleur === MARKERING_KLEUREN.technisch && tech.kleur !== MARKERING_KLEUREN.prive);
    const uit: Array<[string, unknown]> = [
      ['vergrendeld slot', JS.markeringVoor(slot({ staat: 'vergrendeld' }), 'prive', 'gebruiker', 'https://hub.tarasevych.com/')],
      ['niet gekoppeld', JS.markeringVoor(slot({ gekoppeld: false, staat: 'niet-gekoppeld' }), 'prive', 'gebruiker', 'https://hub.tarasevych.com/')],
      ['geen verbinding met de server (WSS niet ready)', JS.markeringVoor(slot({ verbonden: false }), 'prive', 'gebruiker', 'https://hub.tarasevych.com/')],
      ['host buiten de ontgrendeling', JS.markeringVoor(slot(), 'prive', 'gebruiker', 'https://cloud.tarasevych.com/')],
      ['pagina in de technische modus, slot van de gebruiker', JS.markeringVoor(slot(), 'prive', 'technisch', 'https://hub.tarasevych.com/')],
      ['technisch slot op een pagina die niet technisch is', JS.markeringVoor(slot({ domeinen: ['admin.tarasevych.com'] }), 'technisch', 'gebruiker', 'https://admin.tarasevych.com/')],
      ['geen slot', JS.markeringVoor(null, 'prive', 'gebruiker', 'https://hub.tarasevych.com/')],
      ['onbekende ruimte', JS.markeringVoor(slot(), 'onzin', 'gebruiker', 'https://hub.tarasevych.com/')],
      ['adres dat geen eigen https-adres is', JS.markeringVoor(slot({ domeinen: ['hub.tarasevych.com'] }), 'prive', 'gebruiker', 'javascript:alert(1)')],
    ];
    const blijft = uit.filter(([, v]) => v !== null);
    check(`markering UIT in elk van de ${uit.length} gevallen (${uit.map(([n]) => n).join('; ')})`, blijft.length === 0, blijft.map(([n]) => n).join());

    const m = lees('markering.js');
    check('markering.js: eigen GESLOTEN shadow DOM, pointer-events:none, position:fixed, nooit innerHTML',
      /attachShadow\(\{ mode: 'closed' \}\)/.test(m) && /pointer-events:none/.test(m) && /\['pointer-events', 'none'\]/.test(m)
      && /position:fixed/.test(m) && !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(m));
    check('markering.js: aria-hidden (schermlezers lezen de rand niet), geen tekst van de pagina, en opruimen met verwijder()',
      /setAttribute\('aria-hidden', 'true'\)/.test(m) && /export function verwijder\(\)/.test(m) && /host\.remove\(\)/.test(m));
    // 0.6.2: er is geen flits meer — de markering bestaat alleen tijdens het werk en gaat daarna zacht uit. Bij
    // prefers-reduced-motion verdwijnt ze meteen (zie tests/eenheid/markering-agenten-20261020.test.ts).
    check('markering.js respecteert prefers-reduced-motion (geen overgang die iemand ziet bewegen)',
      /prefers-reduced-motion: reduce/.test(m) && /\.laag\{transition:none\}/.test(m) && /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(m));
    check('markering.js gaat weg vóór een momentopname en komt daarna terug (de rand staat nooit óp de foto)',
      /export function verberg\(/.test(m) && /export function toon\(/.test(m));
    check('markering.js: stijl via een geconstrueerd stylesheet (adoptedStyleSheets), zodat het CSP van de pagina niets blokkeert',
      /new CSSStyleSheet\(\)/.test(m) && /adoptedStyleSheets/.test(m));
    check('markering.js is als web_accessible_resource beschikbaar voor de brug, alleen op de eigen site',
      manifest.web_accessible_resources.some((r: any) => r.resources.includes('markering.js') && JSON.stringify(r.matches) === '["https://*.tarasevych.com/*"]'));
    const br = lees('bridge.js');
    check('bridge.js herberekent de markering bij ELKE statusmelding en bij een profielwissel; bij pagehide gaat ze weg',
      /const meldStatus = \(bron\) => \{/.test(br) && /hertekenMarkering\(\);/.test(br) && /if \(profielGewisseld\) zetMarkering\(laatstePubliek\);/.test(br)
      && /addEventListener\('pagehide', \(\) => \{ try \{ mark && mark\.verwijder\(\)/.test(br));
    check('bridge.js: de melding «deze AI leest nu» komt alleen voor het slot dat op deze pagina mag werken', /message\.op === 'markering-lezer'/.test(br) && /!profielToegestaan\(message\.ruimte, huidigProfiel\(\)\)/.test(br));
  }

  // ---------------------------------------------------------------- 5. de echte achtergrond met een nep-chrome
  const g = globalThis as Record<string, unknown>;
  const oud = { chrome: g.chrome, fetch: g.fetch, WebSocket: g.WebSocket };
  try {
    const opslag: Record<string, unknown> = {};
    const verleend = new Set<string>();
    const nep = nepChrome(opslag, verleend, manifest);
    g.chrome = nep.chrome;
    g.fetch = async () => { throw new Error('geen netwerk in de eenheidstest'); };
    g.WebSocket = class { constructor() { throw new Error('geen netwerk'); } };
    const map = mkdtempSync(join(tmpdir(), 'mr-ext-dbg-'));
    cpSync(EXT, map, { recursive: true });
    await import(pathToFileURL(join(map, 'background.js')).href);
    const intern = nep.luister.intern[0];
    const optiesTab = { id: ID, url: `${BASIS}options.html`, origin: BASIS.slice(0, -1), tab: { id: 7, url: `${BASIS}options.html` } };
    check('background.js geladen met nep-chrome', typeof intern === 'function');

    const zonder = await vraag(intern, { op: 'diag-stand' }, optiesTab);
    check('zonder recht en zonder dat er ooit gevraagd is: stand «nee» (niet «geweigerd»: de gebruiker heeft niets geweigerd), met het pakket erbij',
      zonder?.diagnostiek?.stand === 'nee' && zonder.diagnostiek.recht === false && zonder.diagnostiek.optIn === false
      && zonder.diagnostiek.pakket === DIAG_PAKKET && zonder.diagnostiek.ruimte === DIAG_RUIMTE && zonder.diagnostiek.cap === DIAG_CAP, JSON.stringify(zonder?.diagnostiek));
    const gemeld = await vraag(intern, { op: 'set-diag-stand', stand: 'niet-aanvraagbaar' }, optiesTab);
    check('de pagina meldt de uitkomst van haar verzoek: «niet-aanvraagbaar» wordt bewaard, dus pop-up, zijpaneel en site zeggen hetzelfde',
      gemeld?.diagnostiek?.stand === 'niet-aanvraagbaar' && gemeld.diagnostiek.aanvraagbaar === false && opslag.diagRechtStand === 'niet-aanvraagbaar', JSON.stringify(gemeld?.diagnostiek));
    const aanzetten = await vraag(intern, { op: 'set-diag', on: true }, optiesTab);
    check('set-diag aan zonder het Chrome-recht: geweigerd (PERMISSION) MET de volledige stand erbij, zodat de pagina kan uitleggen waarom',
      aanzetten?.ok === false && aanzetten.reason === 'PERMISSION' && aanzetten.diagnostiek?.stand === 'niet-aanvraagbaar' && opslag.diagOptIn !== true, JSON.stringify(aanzetten));

    verleend.add('debugger'); // zoals na het laden van het pakket «діагностика» (debugger vast in het manifest)
    const metRecht = await vraag(intern, { op: 'diag-stand' }, optiesTab);
    check('met het recht: stand «ja» — en meteen, zonder de extensie te herstarten', metRecht?.diagnostiek?.stand === 'ja' && metRecht.diagnostiek.recht === true);
    const aan = await vraag(intern, { op: 'set-diag', on: true }, optiesTab);
    check('set-diag aan mét het recht: gelukt, opgeslagen, en de stand komt in hetzelfde antwoord terug',
      aan?.ok === true && opslag.diagOptIn === true && aan.diagnostiek?.stand === 'ja' && aan.diagnostiek.optIn === true
      && opslag.diagRechtStand === undefined, JSON.stringify(aan));
    verleend.delete('debugger'); // de gebruiker trekt het recht in (chrome://extensions) terwijl diepe diagnose aan staat
    const weg = await vraag(intern, { op: 'diag-stand' }, optiesTab);
    check('recht ingetrokken terwijl de keuze aan stond → stand «ingetrokken» (te onderscheiden van «nooit gehad» en van een weigering)',
      weg?.diagnostiek?.stand === 'ingetrokken' && weg.diagnostiek.optIn === true && weg.diagnostiek.recht === false, JSON.stringify(weg?.diagnostiek));

    // Status naar de pagina's en de site: stand erin, geheimen eruit.
    const st = await vraag(intern, { op: 'status' }, optiesTab);
    check('de status van de extensie bevat de diagnosestand (pop-up, zijpaneel en opties tonen hem)',
      st?.diagnostiek?.stand === 'ingetrokken' && typeof st.diagnostiek.actief === 'boolean', JSON.stringify(st?.diagnostiek));
    // Wat naar de PAGINA gaat is een striktere vorm dan wat de extensie-UI ziet: vier velden, nooit het pad van een pakket,
    // nooit iets uit de opslag. Beide kanten (background.publiek en bridge.diagPubliek) knippen hem met dezelfde lijst.
    check('naar de pagina gaan precies vier velden (geen pakket, ruimte, cap of opslag)',
      /diagnostiek: \{ stand: d\.stand \|\| 'nee', optIn: d\.optIn === true, actief: d\.actief === true, aanvraagbaar: d\.aanvraagbaar === true \}/.test(lees('background.js'))
      && /function diagPubliek\(bron\)/.test(lees('bridge.js'))
      && /return \{ stand: DIAG_STANDEN\.includes\(d\.stand\) \? d\.stand : 'nee', optIn: d\.optIn === true, actief: d\.actief === true, aanvraagbaar: d\.aanvraagbaar === true \};/.test(lees('bridge.js'))
      && lees('bridge.js').includes("'diagnostiek'"));
    check('badge en tooltip worden gezet (punt 8: ook buiten de pagina te zien wat er aan is)',
      nep.actie.badge.length > 0 && nep.actie.titel.some((x) => x.includes(`Mijn Ruimte ${manifest.version}`)), nep.actie.titel.slice(-1)[0]);
    const bg = lees('background.js');
    // 0.6.2: zonder levende lezer houdt de badge de kleur van het PROFIEL; met een lezer krijgt hij die van de AGENT.
    check('de badge krijgt de kleur van het profiel (en bij werk die van de agent), met een tooltip in twee talen',
      /MARKERING_KLEUREN\.technisch/.test(bg) && /function tooltip\(s\)/.test(bg) && /setTitle\(\{ title: titel \}\)/.test(bg)
      && /function levendeLezer\(\)/.test(bg) && /kleurVoorAgent\(lezer\.slug, lezer\.accent\)/.test(bg));
    check('elke browseropdracht meldt WIE er leest aan het tabblad; een momentopname verbergt de markering eerst',
      /meldLezerIn\(r, tab, type, opdracht\);/.test(bg) && /op: 'markering-lezer'/.test(bg)
      && /op: 'markering-verberg'/.test(bg) && /op: 'markering-toon'/.test(bg));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    g.chrome = oud.chrome; g.fetch = oud.fetch; g.WebSocket = oud.WebSocket;
  }

  // ---------------------------------------------------------------- 6. de site neemt de stand aan (en niets anders)
  {
    const p = filterPubliek({ versie: manifest.version, diagnostiek: { stand: 'ingetrokken', optIn: true, actief: false, aanvraagbaar: false, geheim: 'x' } });
    check('site: de stand komt door, onbekende velden vallen weg',
      !!p?.diagnostiek && p.diagnostiek.stand === 'ingetrokken' && p.diagnostiek.optIn === true && JSON.stringify(Object.keys(p.diagnostiek).sort()) === '["aanvraagbaar","actief","optIn","stand"]',
      JSON.stringify(p?.diagnostiek));
    check('site: een verzonnen stand wordt niet overgenomen (dan weet de site het gewoon niet)',
      filterPubliek({ diagnostiek: { stand: 'misschien', optIn: true } })?.diagnostiek === undefined
      && filterPubliek({ diagnostiek: 'ja' })?.diagnostiek === undefined && filterPubliek({ versie: '0.6.0' })?.diagnostiek === undefined);
    const tab = readFileSync(join(W, 'src', 'agenten', 'TabExtensie.tsx'), 'utf8');
    check('de hub toont de stand bij het beheerslot, met een regel per stand en de weg vooruit',
      DIAG_RECHT_STANDEN.every((s) => tab.includes(`${s.includes('-') ? `'${s}'` : s}:`)) && tab.includes('data-ext-diag') && tab.includes('DIAG_PAKKET'));
    const live = readFileSync(join(W, 'src', 'extensie', 'extensie-live.ts'), 'utf8');
    check('extensie-live.ts geeft de stand door aan de schermen (ExtensieLive.diagnostiek) en alleen van DEZE browser',
      /diagnostiek: LokaalDiagnostiek \| null;/.test(live) && /diagnostiek: l0\?\.diagnostiek \?\? null,/.test(live));
  }

  // ---------------------------------------------------------------- 7. pakket «діагностика» uit de build
  {
    const pad = join(W, 'dist', 'downloads', 'extension-version.json');
    if (!existsSync(pad)) check('dist/downloads/extension-version.json ontbreekt — draai eerst de build (node scripts/bouw-extensie.mjs)', false);
    else {
      const info = JSON.parse(readFileSync(pad, 'utf8'));
      check('de build publiceert het pakket «діагностика» met dezelfde versie en een controlesom; het standaardpakket blijft op de minimale rechten',
        info.diagnose?.file === DIAG_PAKKET && info.diagnose.version === manifest.version && /^[0-9a-f]{64}$/.test(info.diagnose.sha256)
        && info.diagnose.permissie === 'debugger' && info.debug === null, JSON.stringify(info.diagnose));
      check('de site weet dus waarheen te wijzen als Chrome het recht weigert', existsSync(join(W, 'dist', 'downloads', DIAG_PAKKET)));
    }
  }

  return einde();
}
