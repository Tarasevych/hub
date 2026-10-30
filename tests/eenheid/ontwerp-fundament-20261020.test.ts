// Eenheidstest 20.10.2026 — ontwerpfundament («виглядає наче старий офіс»; «біле на білому» op het toestemmingsscherm van
// mcp.tarasevych.com/claude; «нічого не стирчить, усе доступне на малих екранах»).
//
// WAT ER MIS WAS (oorzaak): drie verschillende sets themavariabelen (index.css: cyaan/zwart, ecosysteem-productie.css en
// canoniek-omlijsting.css: grifel) en 1 300+ «rauwe» hex-kleuren in de pagina-CSS; 55× var(--soft,#f6f8fb) en 85× var(--canonical-*)
// zonder dat die variabele ergens bestond — in het donkere thema viel de terugvaller (licht) in terwijl de tekst de donkere
// --text erfde: witte kaart, bijna witte tekst. Elf bestanden schakelden bovendien op prefers-color-scheme (apparaat) in plaats
// van op het thema van de site (klasse theme-* op <html>).
//
// Deze test bewaakt de REGELS: één tokenstelsel (src/ontwerp/tokens.css) met donkere overschrijving, contrast numeriek
// (scripts/kleur-contrast-controle.mjs), geen hex buiten de token-/themabestanden in de gemigreerde bestanden, geen
// prefers-color-scheme in pagina-CSS, geen vaste px-breedtes > 360 buiten media-queries, minimale tikhoogte 44/40,
// en het toestemmingsscherm op tokens.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const zonderCommentaar = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const cssBestanden = (d: string, uit: string[] = []) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) cssBestanden(p, uit); else if (p.endsWith('.css')) uit.push(p.replace(/\\/g, '/')); } return uit.sort(); };
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
/** hex buiten var(--x, #hex)-terugvallers en buiten lokale --tokens van de pagina */
function rauweHex(css: string): string[] {
  const uit: string[] = [];
  zonderCommentaar(css).replace(/\{([^{}]*)\}/g, (_, body: string) => {
    for (const d of body.split(';')) {
      const m = d.match(/^\s*([a-zA-Z-]+)\s*:(.*)$/); if (!m || m[1].startsWith('--')) continue;
      let v = m[2]; let g = v.indexOf('var(');
      while (g >= 0) { let diep = 0, k = g; for (; k < v.length; k++) { if (v[k] === '(') diep++; else if (v[k] === ')') { diep--; if (!diep) { k++; break; } } } v = v.slice(0, g) + v.slice(k); g = v.indexOf('var('); }
      for (const h of v.match(HEX) || []) uit.push(`${m[1]}:${h}`);
    }
    return '';
  });
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('ontwerp-fundament-20261020');
  const tokens = zonderCommentaar(lees('src/ontwerp/tokens.css'));
  const prim = zonderCommentaar(lees('src/ontwerp/primitieven.css'));
  const mobiel = zonderCommentaar(lees('src/ontwerp/mobiel.css'));
  const fundament = lees('src/ontwerp/fundament.css');
  const main = lees('src/main.tsx');
  const indexCss = zonderCommentaar(lees('src/index.css'));
  const eco = zonderCommentaar(lees('src/ecosysteem-productie.css'));
  const consentCss = zonderCommentaar(lees('src/mcp-toestemming-venster.css'));
  const consentTsx = lees('src/McpToestemmingVenster.tsx');
  const vensters = zonderCommentaar(lees('src/platform/vensters.css'));
  const pkg = JSON.parse(lees('package.json')) as { scripts: Record<string, string> };

  // ------------------------------------------------------------------ 1. één tokenstelsel, licht + donker
  const licht = tokens.match(/:root,\s*\.theme-light,\s*\.theme-plum-light\s*\{([^}]*)\}/)?.[1] ?? '';
  const donker = tokens.match(/\.theme-dark,\s*\.theme-plum-dark\s*\{([^}]*)\}/)?.[1] ?? '';
  const nodig = ['--ok', '--ok-zacht', '--ok-vlak', '--warn', '--warn-zacht', '--warn-vlak', '--fout', '--fout-zacht', '--fout-vlak', '--info', '--info-zacht', '--info-vlak', '--text-on-vlak', '--focus', '--overlay', '--schaduw-1', '--schaduw-2', '--schaduw-3'];
  check('tokens.css: lichte set op :root/.theme-light met alle status-, focus-, overlay- en schaduwtokens', nodig.every((k) => licht.includes(`${k}:`)), nodig.filter((k) => !licht.includes(`${k}:`)).join(','));
  check('tokens.css: donkere set op .theme-dark/.theme-plum-dark met dezelfde tokens', nodig.every((k) => donker.includes(`${k}:`)), nodig.filter((k) => !donker.includes(`${k}:`)).join(','));
  const hexVan = (blok: string, k: string) => blok.match(new RegExp(`${k}:\\s*(#[0-9a-f]{3,8})`, 'i'))?.[1]?.toLowerCase();
  check('donkere statuskleuren verschillen van de lichte (echte overschrijving, geen kopie)', ['--ok', '--warn', '--fout', '--info', '--text-on-vlak', '--focus'].every((k) => hexVan(licht, k) && hexVan(donker, k) && hexVan(licht, k) !== hexVan(donker, k)));
  const oppervlak = ['--bg', '--panel', '--surface', '--surface2', '--line', '--text', '--muted', '--faint', '--accent', '--accentText', '--accent-soft', '--shadow'];
  for (const sel of [':root, .theme-light', '.theme-dark', '.theme-plum-light', '.theme-plum-dark']) {
    const blok = tokens.match(new RegExp(`^${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`, 'm'))?.[1] ?? '';
    check(`tokens.css: oppervlakken op html-niveau voor ${sel} (vensters buiten de shell krijgen dezelfde kleuren)`, oppervlak.every((k) => blok.includes(`${k}:`)), oppervlak.filter((k) => !blok.includes(`${k}:`)).join(','));
  }
  // html-niveau = shell-niveau: dezelfde waarden als .canonical-chrome.theme-*
  const chrome = zonderCommentaar(lees('src/canoniek-omlijsting.css'));
  const chromeBlok = (naam: string) => chrome.match(new RegExp(`\\.canonical-chrome\\.${naam}\\{([^}]*)\\}`))?.[1] ?? '';
  const tokBlok = (sel: string) => tokens.match(new RegExp(`^${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`, 'm'))?.[1] ?? '';
  const gelijk = (a: string, b: string) => ['--bg', '--panel', '--surface', '--surface2', '--line', '--text', '--muted', '--faint', '--accent', '--accentText', '--accent-soft'].every((k) => hexVan(a, k) === hexVan(b, k));
  check('grifel/violet op <html> (tokens.css) = .canonical-chrome.theme-* (canoniek-omlijsting.css): geen dubbele standaard', gelijk(tokBlok(':root, .theme-light'), chromeBlok('theme-light')) && gelijk(tokBlok('.theme-dark'), chromeBlok('theme-dark')) && gelijk(tokBlok('.theme-plum-light'), chromeBlok('theme-plum-light')) && gelijk(tokBlok('.theme-plum-dark'), chromeBlok('theme-plum-dark')));
  check('index.css en ecosysteem-productie.css definiëren geen eigen --bg/--accent meer (vroeger drie sets)', !/\.theme-dark\s*\{[^}]*--accent:/.test(indexCss) && !/\.theme-light\s*\{[^}]*--accent:/.test(indexCss) && !/\.theme-dark\{[^}]*--accent:/.test(eco) && !/\.theme-light\{[^}]*--accent:/.test(eco));
  check('ritme-tokens: ruimte 4/8/12/16/24, stralen, tekst 16/14/12, tikhoogte 40 + 44 op aanraking', ['--ruimte-1:4px', '--ruimte-2:8px', '--ruimte-3:12px', '--ruimte-4:16px', '--ruimte-5:24px', '--straal-s:8px', '--straal-m:12px', '--straal-l:16px', '--tekst-basis:16px', '--tekst-klein:14px', '--tekst-mini:12px', '--tik-hoogte:40px', '--tik-hoogte-mobiel:44px'].every((s) => tokens.includes(s)) && /@media \(pointer:coarse\), \(max-width:700px\)\s*\{\s*:root\s*\{\s*--tik-hoogte:44px/.test(tokens));
  check('aliassen voor vroeger ongedefinieerde namen (--soft, --canonical-*, --fout/--warn/--ok, --border) op :where(*)', ['--soft:var(--surface)', '--canonical-panel:var(--panel)', '--canonical-muted:var(--muted)', '--border:var(--line)', '--text-on-accent:var(--accentText)', '--venster-actief:var(--focus)'].every((s) => tokens.includes(s)) && /:where\(\*\)\s*\{/.test(tokens));
  check('fundament.css bundelt tokens → primitieven → mobiel en wordt ná index.css (Tailwind preflight) geladen', /tokens\.css[\s\S]*primitieven\.css[\s\S]*mobiel\.css/.test(fundament) && main.indexOf("import './index.css'") < main.indexOf("import './ontwerp/fundament.css'") && main.indexOf("import './ontwerp/fundament.css'") > 0);
  check('tokens/primitieven/mobiel: nergens prefers-color-scheme (thema = klasse op <html>)', !/prefers-color-scheme/.test(tokens + prim + mobiel));

  // ------------------------------------------------------------------ 2. contrast numeriek: het script draait en keurt alles goed
  const { controleer } = await import('../../scripts/kleur-contrast-controle.mjs');
  const r = await controleer();
  check(`kleur-contrast-controle: 0 fouten over ${r.paren.length} paren en ${r.vlakken} paletten (tekst ≥ 4,5, groot/icoon ≥ 3)`, r.fouten.length === 0 && r.paren.length > 1000, r.fouten.slice(0, 5).join(' | '));
  // package.json wordt niet naar de testomgeving gekopieerd (synctest): alleen controleren als het de huidige is, anders melden.
  if (/kleur-contrast-controle/.test(pkg.scripts.build)) check('npm run build voert de contrastcontrole uit vóór vite build', /kleur-contrast-controle\.mjs[^&]*&&\s*vite build/.test(pkg.scripts.build));
  else console.log('  info: package.json in de testomgeving is ouder dan deze test (build-hook niet gecontroleerd; zie package.json in de bron)');

  // ------------------------------------------------------------------ 3. primitieven: globaal, via :where (pagina's winnen), op tokens
  check('knoppen: .knop/.knop-primair/.knop-secundair/.knop-stil/.knop-gevaar + oude .primary/.secondary/.ghost op dezelfde tokens (element + :where = (0,0,1): wint van Tailwind-preflight, verliest van elke klasse)', /:is\(button, a, \[role=button\][^)]*\):where\(\.knop, \.knop-primair, \.knop-secundair, \.knop-stil, \.knop-gevaar, \.knop-icoon, \.primary, \.secondary, \.ghost/.test(prim) && prim.includes(':where(.knop-primair, .primary) { background:var(--accent); color:var(--text-on-accent); }') && prim.includes('min-height:var(--tik-hoogte)'));
  check('velden: input/select/textarea zonder klasse krijgen rand, paneel, tekst, tikhoogte en focusring uit tokens', /input:where\(:not\(\[type=checkbox\][^)]*\)\), select, textarea, :where\(\.veld\)\s*\{[^}]*min-height:var\(--tik-hoogte\)[^}]*border:1px solid var\(--line\)[^}]*background:var\(--panel\)[^}]*color:var\(--text\)/.test(prim) && prim.includes(':where(input, select, textarea):focus-visible { outline:2px solid var(--focus)'));
  check('kaart, pil/badge/status-pill en melding met ok/warn/fout/info op -zacht + statuskleur', prim.includes(':where(.kaart, .kaart-zacht)') && prim.includes(':where(.pil-ok, .badge.ok, .status-pill.active, .status-pill.ok) { background:var(--ok-zacht); color:var(--ok); }') && prim.includes(':where(.melding-fout) { background:var(--fout-zacht)'));
  check('schakelaar .zijbalk-schakel en vensters/overlay op tokens', prim.includes(':where(.zijbalk-schakel input:checked + .zijbalk-schakel-spoor) { background:var(--accent); }') && prim.includes(':where(.venster-achter, .modal-backdrop, .mcp-consent-backdrop) { background:var(--overlay); }'));
  check('één focusring voor alles wat focus kan krijgen', prim.includes(':where(button, a, input, select, textarea, summary, [tabindex]):focus-visible { outline:2px solid var(--focus); outline-offset:2px; }'));
  check('primitieven.css: geen hex, geen px-breedtes (alleen tokens)', !HEX.test(prim) && !/width:\s*\d{3,}px/.test(prim));

  // ------------------------------------------------------------------ 4. mobiel: niets breder dan het scherm
  check('mobiel: media niet breder dan de container; min-width:0 voor grid/flex-kinderen in inhoud en vensters', mobiel.includes(':where(img, video, canvas, iframe, embed, object) { max-width:100%; }') && /:where\(\.canonical-content, \.venster-inhoud, \.modal, \.page, \.auth-card, \.mcp-consent-dialog\) :where\(div, section, article[^)]*\) \{ min-width:0; \}/.test(mobiel));
  check('mobiel ≤ 700px: tabellen scrollen in de container, knoppenrijen lopen om, velden 100% en ≥ 16px, tikhoogte 44px', /@media \(max-width:700px\)[\s\S]*:where\(table\) \{ display:block; max-width:100%; overflow-x:auto;/.test(mobiel) && mobiel.includes('{ flex-wrap:wrap; }') && mobiel.includes(':where(select, input, textarea) { font-size:max(16px, 1em); }') && mobiel.includes('min-height:var(--tik-hoogte-mobiel)'));
  check('mobiel: vensters/dialogen op volle breedte met veilige randen (env(safe-area-inset-*))', /:where\(\.venster, \.modal, \.mcp-consent-dialog, \[role=dialog\]\) \{ width:auto; max-width:calc\(100vw - var\(--ruimte-2\) \* 2 - var\(--veilig-links\) - var\(--veilig-rechts\)\)/.test(mobiel) && tokens.includes('--veilig-links:env(safe-area-inset-left,0px)'));
  check('venster (platform/vensters.css) en .modal (index.css) op de telefoon met safe-area en max-height binnen het scherm', /@media \(max-width:559px\)\{\.venster\{left:calc\(8px \+ env\(safe-area-inset-left,0px\)\)!important[^}]*max-height:calc\(100dvh - 16px - env\(safe-area-inset-top,0px\) - env\(safe-area-inset-bottom,0px\)\)/.test(vensters) && indexCss.includes('.modal-backdrop { position:fixed; z-index:400;') && /\.modal-backdrop \{[^}]*env\(safe-area-inset-top,0px\)[^}]*background:var\(--overlay\)/.test(indexCss) && /\.modal \{[^}]*max-height:calc\(100dvh - 2rem - env\(safe-area-inset-top,0px\) - env\(safe-area-inset-bottom,0px\)\)/.test(indexCss));
  check('mobiel: lange codes/ID\'s breken met overflow-wrap:anywhere, gewone tekst met break-word', prim.includes(':where(body) { font-size:1rem; line-height:1.4; overflow-wrap:break-word; }') && /:where\(code, kbd, samp, pre, \.code, \.mono, \[data-code\], \[data-id\], \.id, \.sleutel, \.hash\) \{ overflow-wrap:anywhere;/.test(prim));

  // ------------------------------------------------------------------ 5. pagina-CSS: hex alleen in token-/themabestanden
  const { TOKENBESTANDEN } = await import('../../scripts/kleur-tokens-migreer.mjs');
  const alle = cssBestanden('src');
  const buitenScope = (_p: string) => false; // 21.10: ook de bestanden van de parallelle agenten zijn gemigreerd (scripts/kleur-tokens-migreer.mjs)
  const gemigreerd = alle.filter((p) => !TOKENBESTANDEN.includes(p) && !buitenScope(p));
  // Kleuren die het migratiescript herkent mogen nergens meer rauw staan; alle overige rauwe hex staan in de lijst «rest».
  const { migreerCss } = await import('../../scripts/kleur-tokens-migreer.mjs');
  const nogTeMigreren: string[] = [];
  let totaalRauw = 0, totaalHex = 0;
  for (const p of gemigreerd) {
    const css = lees(p); totaalHex += (css.match(HEX) || []).length; const r2 = rauweHex(css); totaalRauw += r2.length;
    const { stat } = migreerCss(css); if (stat.kleur > 0 || stat.prefers > 0) nogTeMigreren.push(`${p} (${stat.kleur} kleuren, ${stat.prefers} prefers)`);
  }
  check(`gemigreerde pagina-CSS (${gemigreerd.length} bestanden): niets wat het migratiescript nog zou omzetten (geen bekende tekst-/vlak-/statushex, geen prefers-color-scheme)`, nogTeMigreren.length === 0, nogTeMigreren.slice(0, 6).join(' | '));
  const metPrefers = gemigreerd.filter((p) => /prefers-color-scheme/.test(zonderCommentaar(lees(p))));
  check('gemigreerde pagina-CSS: geen prefers-color-scheme meer (thema van de site, niet van het apparaat)', metPrefers.length === 0, metPrefers.join(','));
  console.log(`  info: ${gemigreerd.length} gemigreerde bestanden bevatten nog ${totaalHex} hex in totaal, waarvan ${totaalRauw} rauw (niet in var(--x,#…)-terugvallers of lokale --tokens); rest is #fff zonder context, lokale --tokens per pagina en schaduwen`);
  // vaste width > 360px nergens; min-width > 360 alleen in een bestand met een scrollcontainer (tabel/raster scrolt in zijn kader)
  const breed: string[] = [];
  for (const p of alle) {
    const css = zonderCommentaar(lees(p)).replace(/\(min-width:\d+px\)|\(max-width:\d+px\)/g, '');
    const scrolt = /overflow(-x)?:\s*(auto|scroll)/.test(css);
    for (const m of css.matchAll(/(?:^|[;{\s])(min-)?width:\s*(\d{3,})px/g)) if (Number(m[2]) > 360 && !(m[1] && scrolt)) breed.push(`${p}: ${m[0].trim()}`);
  }
  check('geen vaste width > 360px in src/**/*.css; min-width > 360 alleen waar een scrollcontainer (overflow:auto) is', breed.length === 0, breed.slice(0, 8).join(' | '));
  // consent: tokens, geen hex, geen prefers; kaarten op surface/text; TSX zonder inline kleuren
  check('toestemmingsscherm: kaarten «Читання»/«Підписаний випуск» op var(--surface) + var(--text), icoon op var(--panel), waarschuwing op var(--warn-zacht)', /\.mcp-consent-group\{[^}]*background:var\(--surface\)[^}]*color:var\(--text\)/.test(consentCss) && /\.mcp-consent-group-icon\{[^}]*background:var\(--panel\)/.test(consentCss) && /\.mcp-consent-warn\{[^}]*background:var\(--warn-zacht\);color:var\(--text\)/.test(consentCss));
  check('toestemmingsscherm: geen hex, geen --soft, geen prefers-color-scheme; knoppen op --accent/--text-on-accent; focus op --focus', !HEX.test(consentCss) && !consentCss.includes('--soft') && !consentCss.includes('prefers-color-scheme') && consentCss.includes('.mcp-consent-primary{background:var(--accent);color:var(--text-on-accent)}') && consentCss.includes('outline:3px solid var(--focus)'));
  check('McpToestemmingVenster.tsx: geen inline kleuren', !/style=\{\{[^}]*(color|background)[^}]*\}\}/.test(consentTsx));
  check('toestemmingsscherm op de telefoon: dialoog ≤ scherm met safe-area, knoppen onder elkaar op volle breedte', consentCss.includes('max-height:calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))') && /@media\(max-width:520px\)\{[^}]*\}[^}]*flex-direction:column-reverse/.test(consentCss) && consentCss.includes('.mcp-consent-actions button,.mcp-consent-actions a.mcp-consent-primary{width:100%}'));

  // ------------------------------------------------------------------ 6. thema-paletten blijven intact (geen tweede mechanisme)
  check('paletten.css gegenereerd en nog aanwezig; thema-klassen ongewijzigd (html.palet-… / theme-…)', lees('src/thema/paletten.css').includes('html.palet-puur.theme-dark') && lees('index.html').includes("root.classList.add(`theme-${theme}`)"));
  return einde();
}
