// Audit 18.10.2026, punten 8 en 9 (uitvoerder G). Elke check reproduceert eerst het oude probleem en bewijst dan dat het weg is.
//  8a technische band verborg nooit (luisterde naar window.scrollY terwijl .canonical-workspace scrolt)
//  8b «Написати лист» stond twee keer in de DOM (MailSidebarNavigation-portal + MailComposeFloat)
//  8c stapnamen van de wizard plakten op 390 px aan elkaar; tabbladen zonder hint
//  8d terminal toonde UTC (ISO-slice), stappen lokale tijd
//  9  extensie: CRX 0.3.4 bij manifest 0.4.x, geen updatemelding; sign-extension maakte stil een nieuwe sleutel
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { overlapt } from '../../src/mail-opstel-plaats';
import { STAPEL_GAT, indeling, stapelRechthoek, standaardPlaatsing, verplaats, type PaginaContext } from '../../shared/plaatsing';
import { tijdInZone, tijdMetZone, zoneAfkorting } from '../../src/uitrol/tijdzone';
import { EXT_MIN_VERSIE, LATER_MS, updateAdvies, vergelijkVersie, versieBestandKlopt } from '../../shared/extensie-update';

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('ui-audit-g');

  // ---------------------------------------------------------------- 8a band (herzien 18.10.2026, tweede keer)
  {
    // Eerste oplossing (verbergen bij scrollen) gaf live een terugkoppeling: 305 wissels van data-tech-verborgen in 15 s (top van
    // #root 40→0 → scrollcontainer hoger → browser corrigeert scrollTop → scroll-event → weer tonen …). Daarna een knop «Згорнути»
    // — afgewezen door de eigenaar. Nu: headroom zonder geometrie (src/tech/band-inschuiven.ts; uitgebreid getest in
    // band-inschuiven.test.ts en in de browser-harnas): alleen translate, drempel 24 px, ≥ 300 ms tussen wissels.
    const laag = lees('src/tech/TechLaag.tsx'), css = lees('src/tech/tech.css');
    check('8a oude band-verbergen.ts en de knop «Згорнути» zijn weg', !existsSync(join(W, 'src/tech/band-verbergen.ts')) && !existsSync(join(W, 'src/tech/band-inklappen.ts')) && !/band-verbergen|koppelBandVerbergen|data-tech-knop='inklappen'/.test(laag));
    check('8a TechLaag luistert zelf niet naar scroll (dat doet band-inschuiven.ts op de echte container)', !/addEventListener\(\s*'scroll'/.test(laag) && /from '\.\/band-inschuiven'/.test(laag));
    check('8a verborgen = alleen translate (#root, band, bel); #root top blijft gelijk', /html\[data-tech=aan\]\[data-tech-verborgen\] body>#root\{translate:0 calc\(-1 \* var\(--tech-band-h\)\)\}/.test(css) && /html\[data-tech=aan\]\[data-tech-verborgen\] \.tech-band\{translate:0 -100%\}/.test(css));
    check('8a bel en «Написати лист» springen niet: vast-kader rekent zonder translate en volgt data-tech-verborgen bewust niet', lees('src/platform/vast-kader.ts').includes('getComputedStyle(blok).translate') && !lees('src/platform/vast-kader.ts').includes("'data-tech-verborgen'"));
  }

  // ---------------------------------------------------------------- 8b één knop
  {
    const nav = lees('src/MailZijbalkNavigatie.tsx'), flt = lees('src/MailOpstelZwevend.tsx');
    const tel = (s: string) => (s.match(/className=\{`mail-compose-float\$\{/g) || []).length + (s.match(/className=['"]mail-compose-float['" ]/g) || []).length;
    check('8b reproductie verholpen: MailSidebarNavigation rendert géén zwevende knop meer (was een tweede portal)', tel(nav) === 0 && !nav.includes("id:'mail-compose-float'"));
    check('8b precies één bron van de knop (MailComposeFloat) en één zone mail-compose-float', tel(flt) === 1 && (flt.match(/id: 'mail-compose-float'/g) || []).length === 1);
    check('8b de pil in het menu opent hetzelfde venster via mail:open-compose', nav.includes("mail:open-compose") && flt.includes("'mail:open-compose'"));
    check('8b geen tweede berichtvenster in het menu', !nav.includes('<MailNewMessageDialog'));
    // 25.10.2026: «Написати» heeft een eigen GNIEZDO in de actiestapel (shared/plaatsing.ts); het gniezdo bestaat vóór de knop.
    check('8b geen sprong na monteren: het gniezdo staat al in de stapel voordat de knop er is (<Plek> tekent erin)', flt.includes("<Plek knop='opstellen'>") && lees('src/plaatsing/Plek.tsx').includes("{w.knoppen.map((k) => <div key={k} className='plaats-gniezdo'"));
    const gn = (i: number, vw: number, vh: number, onder = 0) => { const s = stapelRechthoek(vw <= 700 ? 'telefoon' : 'computer', i + 1, vw, vh, { boven: 0, onder, links: 0, rechts: 0 }); return { left: s.left, top: s.top, width: s.width, height: s.width }; };
    const pc: PaginaContext = { klasse: 'computer', dienst: 'mail', zoekInMenu: true };
    check(`8b computer: de bel staat rechts van de foto in de bovenbalk, «Написати» in de stapel — nooit over elkaar`, indeling(standaardPlaatsing(), pc).plek.bel === 'bovenbalk' && indeling(standaardPlaatsing(), pc).plek.opstellen === 'actiestapel');
    const tel2: PaginaContext = { klasse: 'telefoon', dienst: 'mail', zoekInMenu: true };
    const mb = verplaats(standaardPlaatsing(), tel2, 'bel', 'actiestapel', 0);
    check(`8b telefoon, bel door de gebruiker in de stapel: elk een eigen gniezdo met ${STAPEL_GAT}px ertussen, geen overlap`, mb.ok && !overlapt(gn(0, 390, 844), gn(1, 390, 844)) && gn(0, 390, 844).top - (gn(1, 390, 844).top + gn(1, 390, 844).height) === STAPEL_GAT);
    check('8b veilige zone onderaan (home-indicator) gerespecteerd', gn(0, 390, 844, 34).top + gn(0, 390, 844, 34).height <= 844 - 34);
  }

  // ---------------------------------------------------------------- 8c wizard + tabs
  {
    const up = lees('src/uitrol/Upload.tsx'), css = lees('src/uitrol/upload.css');
    check('8c elke stap heeft een korte naam voor ≤ 640 px', (up.match(/kortUk: '/g) || []).length === 5 && up.includes("className='ut-wiz-kort'"));
    check('8c op smalle schermen alleen de korte naam, labels breken af binnen hun kolom', /@media \(max-width:640px\)\{\.ut-wiz-balk \.ut-wiz-lang\{display:none\}\.ut-wiz-balk \.ut-wiz-kort\{display:block\}\}\s*$/.test(css) && /overflow-wrap:anywhere/.test(css) && /\.ut-wiz-balk li\{min-width:0\}/.test(css));
    const langste = Math.max(...[...up.matchAll(/kortUk: '([^']+)', kortNl: '([^']+)'/g)].flatMap((m) => [m[1].length, m[2].length]));
    check('8c korte namen ≤ 8 tekens (past in 1/5 van 358 px bij 11 px)', langste <= 8, String(langste));
    check('8c tabbladen: vervaagde randen + pijlen als er meer is (TabsRij)', lees('src/ontwerp/TabsRij.tsx').includes('meerRechts') /* 21.10: verhuisd uit src/uitrol (technisch) */ && lees('src/BeheerUitrolWeergave.tsx').includes('<TabsRij'));
  }

  // ---------------------------------------------------------------- 8d tijdzone
  {
    const iso = '2026-10-18T03:41:47.000Z';
    check('8d reproductie: oude terminal toonde ISO-slice = UTC-uur', iso.slice(11, 19) === '03:41:47');
    check('8d Brussel (CEST, +2): 05:41:47', tijdInZone(iso, 'Europe/Brussels', 'nl') === '05:41:47');
    check('8d Kyiv (EEST, +3): 06:41:47', tijdInZone(iso, 'Europe/Kyiv', 'uk') === '06:41:47');
    check('8d UTC: 03:41:47 met afkorting UTC', tijdInZone(iso, 'UTC', 'nl') === '03:41:47' && tijdMetZone(iso, 'UTC', 'nl') === '03:41:47 UTC');
    check('8d zone-afkorting zichtbaar (CEST / GMT+3)', zoneAfkorting(new Date(iso), 'Europe/Brussels') === 'CEST' && /GMT\+3|EEST/.test(zoneAfkorting(new Date(iso), 'Europe/Kyiv')));
    check('8d winter: Brussel CET (+1)', tijdInZone('2026-12-01T10:00:00Z', 'Europe/Brussels', 'nl') === '11:00:00' && zoneAfkorting(new Date('2026-12-01T10:00:00Z'), 'Europe/Brussels') === 'CET');
    check('8d ongeldige of lege tijd → leeg (geen «Invalid Date»)', tijdInZone('', 'UTC') === '' && tijdInZone('rommel', 'UTC') === '');
    const term = lees('src/uitrol/Terminal.tsx'), types = lees('src/uitrol/types.ts');
    check('8d terminal gebruikt de zone, niet meer slice(11, 19)', !term.includes('slice(11, 19)') && term.includes('tijdInZone(r.tijd, zone, lang)') && term.includes('ut-terminal-zone'));
    check('8d stappen en historie (datum/tijdKort) volgen dezelfde keuze', types.includes("datumInZone(v, lang, 'short')") && types.includes('tijdInZone(v, zoneKeuze(), lang)'));
    check('8d keuze staat in Налаштування (ZoneKiezer)', lees('src/BeheerUitrolWeergave.tsx').includes('<ZoneKiezer'));
  }

  // ---------------------------------------------------------------- 9 extensie
  {
    check('9 versievergelijking', vergelijkVersie('0.4.1', '0.4.0') === 1 && vergelijkVersie('0.10.0', '0.9.9') === 1 && vergelijkVersie('0.4.0', '0.4.0') === 0 && vergelijkVersie('0.3.4', '0.4.0') === -1);
    const nu = 1_000_000;
    const a = updateAdvies({ heeft: '0.3.4', nieuwste: '0.4.1', crxVersie: null, zelfGehost: true, nu });
    check('9 reproductie 0.3.4: verplicht bijwerken, geen «later», geen auto zonder actuele CRX', a.toon && a.verplicht && !a.automatisch && a.reden === 'te-oud');
    // `min` staat hier expliciet: deze gevallen gaan over de LOGICA van de strook, niet over het minimum van vandaag
    // (EXT_MIN_VERSIE is sinds 0.6.1 hoger dan 0.4.x, anders zou elk geval «verplicht» zijn).
    const b = updateAdvies({ heeft: '0.4.0', nieuwste: '0.4.1', min: '0.4.0', crxVersie: '0.4.1', zelfGehost: true, nu });
    check('9 0.4.0 → 0.4.1 met CRX: melding met automatisch bijwerken', b.toon && !b.verplicht && b.automatisch && b.van === '0.4.0' && b.naar === '0.4.1');
    const c = updateAdvies({ heeft: '0.4.0', nieuwste: '0.4.1', min: '0.4.0', crxVersie: '0.4.1', zelfGehost: false, nu });
    check('9 «Load unpacked»: geen automatische knop (Chrome kan dat niet), wel melding', c.toon && !c.automatisch);
    const d = updateAdvies({ heeft: '0.4.0', nieuwste: '0.4.1', min: '0.4.0', laterTot: nu + LATER_MS, nu });
    check('9 «Нагадати пізніше» verbergt 24 uur', !d.toon && d.reden === 'later' && updateAdvies({ heeft: '0.4.0', nieuwste: '0.4.1', min: '0.4.0', laterTot: nu - 1, nu }).toon);
    check('9 «later» geldt niet voor een verplichte update', updateAdvies({ heeft: '0.3.9', nieuwste: '0.4.1', min: '0.4.0', laterTot: nu + LATER_MS, nu }).toon);
    check('9 actueel of onbekend → geen strook', !updateAdvies({ heeft: '0.4.1', nieuwste: '0.4.1', min: '0.4.0' }).toon && !updateAdvies({ heeft: '', nieuwste: '0.4.1' }).toon);

    const manifest = JSON.parse(lees('extension/manifest.json'));
    check(`9 manifest ≥ minimale versie ${EXT_MIN_VERSIE}`, vergelijkVersie(manifest.version, EXT_MIN_VERSIE) >= 0, manifest.version);
    check('9 consistentiecontrole vangt de oude fout (crx 0.3.4 / updates.xml 0.3.4 bij manifest 0.4.x)',
      versieBestandKlopt(manifest.version, { version: manifest.version, minVersion: EXT_MIN_VERSIE, crx: { version: '0.3.4' } }, "<updatecheck version='0.3.4' />").length >= 2);
    // Build draaien en het echte resultaat controleren.
    if (existsSync(join(W, 'dist'))) {
      execFileSync(process.execPath, ['scripts/bouw-extensie.mjs'], { cwd: W, stdio: 'pipe' });
      const v = JSON.parse(lees('dist/downloads/extension-version.json'));
      const xml = existsSync(join(W, 'dist/downloads/updates.xml')) ? lees('dist/downloads/updates.xml') : null;
      const fouten = versieBestandKlopt(manifest.version, v, xml);
      check('9 gebouwde extension-version.json / updates.xml kloppen met het manifest', fouten.length === 0, fouten.join('; '));
      check('9 extension-version.json meldt minVersion en crxStatus (waarom geen automatische update)', v.minVersion === EXT_MIN_VERSIE && ['actueel', 'verouderd', 'ontbreekt', 'ongeldig'].includes(v.crxStatus), `${v.minVersion} ${v.crxStatus}`);
      check('9 geen verouderde crx/updates.xml gepubliceerd', v.crxStatus === 'actueel' ? !!xml : (!xml && !existsSync(join(W, 'dist/downloads/mijn-ruimte-extension.crx'))));
    } else check('9 build-controle (dist/ ontbreekt: overgeslagen)', true);
    // sign-extension: zonder sleutel geen nieuwe sleutel (anders ander extensie-id → bestaande installaties krijgen nooit meer een update).
    let code = 0, uit = '';
    try { execFileSync(process.execPath, ['scripts/onderteken-extensie.mjs', '/tmp/bestaat-niet-mr.pem'], { cwd: W, stdio: 'pipe' }); } catch (e) { code = (e as { status?: number }).status ?? -1; uit = String((e as { stderr?: Buffer }).stderr || ''); }
    check('9 sign-extension maakt NIET stil een nieuwe sleutel (exit 2, uitleg met extensie-id)', code === 2 && uit.includes('ofpffonakgjioahgfejmiblfmbkobmmi') && !existsSync('/tmp/bestaat-niet-mr.pem'));
    const bg = lees('extension/background.js'), br = lees('extension/bridge.js');
    check('9 extensie: UPDATE_CHECK via requestUpdateCheck, alleen voor CRX-installatie (UNPACKED anders)', bg.includes("type === 'UPDATE_CHECK'") && bg.includes('requestUpdateCheck') && bg.includes("reason: 'UNPACKED'"));
    check('9 extensie: eigen versiecontrole + badge «↑», hello meldt versie', bg.includes("setBadgeText({ text: '↑' })") && bg.includes("alarm.name === 'versie'") && (br.match(/version: VERSION \}\)/g) || []).length === 2);
    check('9 site: strook als eigen root op elke pagina', lees('src/main.tsx').includes("import('./ExtensieUpdateBand')"));
  }
  // ---------------------------------------------------------------- audit 19.10.2026 (A5, A16): lagen boven de chrome
  {
    const ut = lees('src/uitrol/uitrol.css'), chrome = lees('src/canoniek-omlijsting.css'), ges = lees('src/uitrol/Geschiedenis.tsx'), cc = lees('src/CanoniekOmlijsting.tsx');
    const z = (css: string, sel: string) => Number((new RegExp(`${sel.replace(/[.[\]']/g, '\\$&')}\\{[^}]*z-index:(\\d+)`).exec(css) || [])[1] || 0);
    check('A5 la «Деталі розгортання» ligt boven avatar-anker (220), accountmenu (360) en «omhoog»-knop (440), onder de verbindingsbanner (1300)',
      z(ut, '.ut-lade-schaduw') > Math.max(z(chrome, '.canonical-account-anchor'), z(chrome, '.canonical-account-menu') || 360, z(chrome, '.canonical-scroll-top')) && z(ut, '.ut-lade-schaduw') < z(chrome, '.canonical-connection-banner'), `${z(ut, '.ut-lade-schaduw')}`);
    // 23.10: de la «Деталі розгортання» werd in zone B één tijdlijn met opklapbare regels; dezelfde eis geldt daar: Esc sluit en de focus
    // blijft op een zinnige plek (de regelknop), nooit in het niets.
    check('A5 Esc sluit de opengeklapte regel en focust de regelknop', /e\.key === 'Escape'\) \{ e\.stopPropagation\(\); onToggle\(\);/.test(ges) && /rij\.current\?\.focus\(\)/.test(ges) && /ut-tl-detail' id=\{detailId\} onKeyDown=\{opEsc\}/.test(ges));
    // 25.10.2026: de scrollruimte hoort bij de ACTIESTAPEL (src/plaatsing/plaatsing.css): zo hoog als de stapel, altijd (niet alleen
    // zolang «Вгору» zichtbaar is) — elke regel kan boven «Написати»/«Вгору» worden gescrold.
    check('A16 «omhoog»-knop: extra scrollruimte onderaan = hoogte van de actiestapel (::after), niet in mailfocus', /data-scroll-top=\{scrollTopVisible\?'1':undefined\}/.test(cc) && /\.canonical-chrome\[data-plaats-stapel\]:not\(\[data-focus-mode='mail'\]\) \.canonical-workspace::after\{[^}]*height:var\(--plaats-stapel-ruimte,0px\)/.test(lees('src/plaatsing/plaatsing.css')) && cc.includes("data-plaats-stapel={stapelN>0?'ja':undefined}"));
  }
  // ---------------------------------------------------------------- audit 19.10.2026 (hub.*/id/admin/api/github/huis): onbekende route → 404, geen stille terugval
  {
    const { runInNewContext } = await import('node:vm');
    const bron = lees('public/canonical-service.js');
    let laatsteWin: Record<string, unknown> = {};
    const route = (host: string, pathname: string) => {
      const loc = { hostname: host, host, pathname, search: '', href: `https://${host}${pathname}`, origin: `https://${host}` };
      const win: Record<string, unknown> = { addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true };
      laatsteWin = win;
      runInNewContext(bron, { window: win, location: loc, document: { documentElement: { lang: 'uk', dataset: {} }, head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }), addEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [] }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL, console });
      return (win.__TSV_CANONICAL_SERVICE__ as { resolve: (l: unknown) => { onbekend?: boolean; tab: string; service: string } }).resolve(loc);
    };
    check('404: hub.*/recent en mcp.*/agents zijn tabbladen (niet onbekend)', !route('hub.tarasevych.com', '/recent').onbekend && !route('mcp.tarasevych.com', '/agents').onbekend && route('hub.tarasevych.com', '/').onbekend === false);
    check('404: hub.*/zomaar, id.*/foo/bar, admin.*/nope, github.*/x → onbekend', ['hub.tarasevych.com:/zomaar', 'id.tarasevych.com:/foo/bar', 'admin.tarasevych.com:/nope', 'github.tarasevych.com:/x', 'huis.tarasevych.com:/abc', 'api.tarasevych.com:/q'].every((x) => { const [h, p] = x.split(':'); return route(h, p).onbekend === true; }));
    check('404: oud alias (api.*/webhooks → access) en slug blijven bekend', !route('api.tarasevych.com', '/webhooks').onbekend && route('api.tarasevych.com', '/webhooks').tab === 'access');
    const nav = lees('src/canoniek-navigatie.ts'), app = lees('src/App.tsx'), usa = lees('src/VerenigdDienstApp.tsx'), nf = lees('src/NietGevonden.tsx');
    check('404: normalizeCurrentRoute schrijft een onbekend pad niet stil om; hub en diensten tonen NietGevonden', /route\.onbekend\)return;/.test(nav) && /routeOnbekend\(\)\)return shell\(<NietGevonden/.test(app) && /if\(routeOnbekend\(\)\)return <NietGevonden/.test(usa) && /404/.test(nf) && /Сторінку не знайдено/.test(nf));
    // HUB-06: servermeldingen («uk / nl») in één taal
    const { taalDeel } = await import('../../src/canoniek-meldingen');
    check('HUB-06: tweetalige servermelding → één taal; een pad met « / » blijft heel', taalDeel('Інший Google-акаунт з вашою адресою / Ander Google-account met uw adres', 'nl') === 'Ander Google-account met uw adres' && taalDeel('Інший акаунт / Ander account', 'uk') === 'Інший акаунт' && taalDeel('/var/log / foo', 'uk') === '/var/log / foo' && taalDeel('enkel nl', 'uk') === 'enkel nl');
    // HUB-08: terminal-einde in gewone taal; HUB-02: Esc + focus-trap in hub-vensters; HUB-04: geen cyclische link
    const term = lees('src/terminal/Terminal.tsx');
    check('HUB-08: «einde»/«tijd»/«gesloten» vertaald in het terminalvenster', /eindeTekst\(m\.reden, uk\)/.test(term) && /einde: \['оболонку завершено'/.test(term) && /tijd: \['час вийшов'/.test(term));
    check('HUB-02: hub-venster: Esc sluit, Tab blijft binnen (focus-trap), role=dialog; modal boven het avatarmenu (z-index 400 > 360)', /e\.key === 'Escape'\) \{ e\.preventDefault\(\); setModal\(null\)/.test(app) && /role='dialog' aria-modal='true'/.test(app) && /\.modal-backdrop \{ position:fixed; z-index:400/.test(lees('src/index.css')));
    check('HUB-04: «Зараз» zonder stap toont uitleg + knop naar «Завдання» in dezelfde pagina; hub-interne links openen geen nieuw tabblad naar de hub zelf', /data-hub-focus='leeg'/.test(app) && /hub\\.tarasevych\\.com\\\/\\\?tab=\(\[a-z\]\+\)\$\/\.test\(functionalUrl\)/.test(app));
    check('HUB-03/notes: «Останні» en «Нотатки» hebben eigen inhoud (HubRecent, HubNotes); notities-tab toont geen Drive-blok meer', /hubTab==='recent'\?<HubRecent/.test(app) && /hubTab==='notes'&&<HubNotes/.test(app) && /hubTab === 'notes' && block\.kind === 'custom'/.test(app));
    // HubNotes → canonical-navigation leest het runtime-object bij het laden: tijdelijk een venster met dat object.
    const g = globalThis as Record<string, unknown>;
    const hadWin = 'window' in g, hadDoc = 'document' in g;
    g.window = Object.assign(laatsteWin, { setTimeout, clearTimeout, setInterval, clearInterval, localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }, sessionStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } }); g.document = { documentElement: { lang: 'uk' }, addEventListener: () => undefined, removeEventListener: () => undefined, hidden: false };
    const { hubNotities } = await import('../../src/HubNotities');
    if (!hadWin) delete g.window; if (!hadDoc) delete g.document;
    check('notes: alleen bord-items met tag hub, nieuwste eerst', hubNotities([{ id: '1', title: 'a', body: '', tags: ['hub'], author: 'x', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }, { id: '2', title: 'b', body: '', tags: [], author: 'x', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' }, { id: '3', title: 'c', body: '', tags: ['hub'], author: 'x', createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z' }]).map((n) => n.id).join() === '3,1');
    const mc = lees('backend/mcp-console.ts');
    check('notes: bordroutes (list/search/schrijven) ook vanaf de hub-dienst; de rest blijft mcp', /BORD_DIENSTEN = \["mcp", "hub"\]/.test(mc) && (mc.match(/diensten: BORD_DIENSTEN/g) || []).length === 3 && /opts\.diensten \?\? \["mcp"\]/.test(mc));
  }

  // ---------------------------------------------------------------- audit fase 2: E-02 schakelaar groen met ✓, E-03 reden met label
  {
    const hub = lees('src/mcp-hub.css'), laag = lees('src/tech/TechLaag.tsx'), tcss = lees('src/tech/tech.css');
    check('E-02: aan-stand van .hub-toggle met eigen token + vaste terugval (ook zonder .hub en in donker), hoge specificiteit (html body …) en ✓',
      /\.hub-toggle\{--hub-toggle-uit:var\(--hub-off,#6b7280\);--hub-toggle-aan:var\(--hub-ok,#1a7f37\)/.test(hub)
      && /\.theme-dark \.hub-toggle,\.theme-plum-dark \.hub-toggle\{--hub-toggle-uit:var\(--hub-off,#9ca3af\);--hub-toggle-aan:var\(--hub-ok,#4ac26b\)\}/.test(hub) /* 20.10.2026: thema van de site (klasse), niet prefers-color-scheme */
      && /html body \.hub-toggle\[aria-checked=true\]\{background:var\(--hub-toggle-aan\);background-color:var\(--hub-toggle-aan\);border-color:transparent\}/.test(hub)
      && /html body \.hub-toggle\[aria-checked=true\]::before\{content:'✓'/.test(hub) && /\.hub-toggle\{[^}]*appearance:none/.test(hub));
    check('E-02: de schakelaar in BrowserExtensionPanel is een echte switch (role=switch, aria-checked) met klasse hub-toggle', /className='hub-toggle' role='switch' aria-checked=\{a\.enabled\}/.test(lees('src/BrowserExtensiePaneel.tsx')));
    check('E-03: technische band toont de reden met label «Причина:»/«Reden:» en als citaat (q), ook in title', /tech-band-reden-label'>\{uk \? 'Причина:' : 'Reden:'\}<\/span> <q className='tech-band-reden-tekst'>\{t\.activatie\.reden\}<\/q>/.test(laag)
      && /title=\{`\$\{uk \? 'Причина' : 'Reden'\}: \$\{t\.activatie\.reden\}`\}/.test(laag) && tcss.includes('.tech-band-reden-label{') && tcss.includes(".tech-band-reden-tekst{quotes:'«' '»'"));
  }
  return einde();
}
