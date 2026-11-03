// Eenheidstest 25.10.2026 — ingeklapte brieven (1.3/1.4) en bijlagekaarten die niet in de rij groeien (6.3).
// Draaien: node scripts/eenheidstests.mjs mail-geminimaliseerd-20261025
//
// KLACHT EIGENAAR (schermafdrukken f83fade0, 538db84e, 4edfead2): het dok «Згорнуті листи» bleef na inklappen groot en leeg; na slepen
// aan de rand stond één ingeklapte brief over de hele hoogte, met de logo's in het midden en een badge «+$84».
// OORZAAK: slepen schreef inline top/left + bottom:auto, maar `.mail-minimized-viewer{bottom:…!important}` (src/ui-golf-11.css; telefoon
// src/mail-qa-2026-10.css) won daarvan → top EN bottom → 52 → 352 px, ook na inklappen en herladen (plek uit sessionStorage); de klem rekende
// met die uitgerekte hoogte. Badge: `+${…}` als JSX-tekst. Bijlagen: het wiel boven een kaart maakte hem 64 → 304 px hoog (rij mee,
// lijst geblokkeerd, data-expanding); in «Звичайний» was er geen zwevend voorbeeld.
//  A. zuivere plek (geminimaliseerdPlek uit de component, gebundeld met stubs): binnen beeld met de NATUURLIJKE maat, vrij van de
//     actiestapel (shared/plaatsing stapelRechthoek) en de bovenbalk, dichtstbijzijnde vrije plek, op 390/768/1280/1704.
//  B. component: data-geplaatst alleen bij een eigen plek, dan top/left + bottom:auto, nooit een hoogte; klem bij slepen, resize,
//     herladen en open/dicht; terug op de standaardplek = attribuut weg; badge «+N»; hindernissen uit de plaatsingslaag.
//  C. CSS: geen enkele regel zet bottom met !important op een ZELF NEERGEZET venster; natuurlijke hoogte; letters ≥ 12 px; tikdoelen 40 px.
//  D. bijlagen: geen groei in de rij, geen data-expanding; het wiel boven een kaart zet het zwevende voorbeeld groot, alleen als het
//     open en zichtbaar is (anders geen luisteraar: de lijst scrolt); voorbeeld in elke dichtheid en bij ingeklapte berichten in de brief.
//  E. stand: de stappen blok1-geminimaliseerd-dok en -bijlage bestaan.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Plugin } from 'esbuild';
import { checker } from './hulp/nep-google';
import { klasseVan, stapelRechthoek } from '../../shared/plaatsing';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
type Doos = { left: number; top: number; width: number; height: number };
type Plek = { left: number; top: number };
type PlekFn = (wens: Plek, maat: { width: number; height: number }, vw: number, vh: number, hindernissen?: Doos[]) => Plek;
const raakt = (a: Doos, b: Doos) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;

/** Alle CSS-regels (selector + declaraties, ook binnen @media) van een bestand, zonder commentaar. */
function regels(css: string): Array<{ selector: string; blok: string }> {
  const s = zc(css), uit: Array<{ selector: string; blok: string }> = [];
  let i = 0, kop = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '{') {
      const k = kop.trim(); kop = '';
      if (k.startsWith('@')) { i++; continue; }
      let diepte = 1, j = i + 1;
      while (j < s.length && diepte) { if (s[j] === '{') diepte++; else if (s[j] === '}') diepte--; j++; }
      uit.push({ selector: k.replace(/\s+/g, ' '), blok: s.slice(i + 1, j - 1) });
      i = j; continue;
    }
    if (c === '}') { kop = ''; i++; continue; }
    kop += c; i++;
  }
  return uit;
}
function* cssBestanden(map: string): Generator<string> {
  for (const n of readdirSync(map).sort()) {
    const p = join(map, n);
    if (statSync(p).isDirectory()) yield* cssBestanden(p); else if (n.endsWith('.css')) yield p;
  }
}

/** De zuivere functie uit de component laden: esbuild bundelt src/MailGeminimaliseerdeViewer.tsx met stubs voor React, iconen, CSS en de
 *  buurcomponenten (die tellen hier niet); venster-dok-logica blijft echt. */
async function laadPlek(): Promise<{ plek: PlekFn; MARGE: number; SNAP: number }> {
  const STUBS: Record<string, string> = {
    'lucide-react': 'const n=()=>null;export const ChevronDown=n,GripHorizontal=n,MailOpen=n,Maximize2=n,Paperclip=n,PenLine=n,X=n;',
    react: 'export const useEffect=()=>{},useLayoutEffect=()=>{},useRef=(v)=>({current:v}),useState=(v)=>[v,()=>{}];export default {};',
    'react/jsx-runtime': 'export const jsx=()=>null,jsxs=()=>null,Fragment={};',
    './MailBijlageMiniatuur': 'export default ()=>null;',
    './MailBijlageVoorbeeld': 'export const describeMailAttachment=()=>({});',
    './plaatsing/plaatsing-staat': 'export const plaatsStaat=()=>({zones:{}});',
  };
  const stub: Plugin = { name: 'stub', setup(b) {
    b.onResolve({ filter: /\.css$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onResolve({ filter: /^(lucide-react|react|react\/jsx-runtime|\.\/MailBijlageMiniatuur|\.\/MailBijlageVoorbeeld|\.\/plaatsing\/plaatsing-staat)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path] ?? 'export default {};', loader: 'js' }));
  } };
  const r = await build({ entryPoints: ['src/MailGeminimaliseerdeViewer.tsx'], bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22', jsx: 'automatic', logLevel: 'silent', plugins: [stub] });
  const map = mkdtempSync(join('rapporten', 'geminimaliseerd-'));
  try {
    const pad = join(map, 'viewer.mjs');
    writeFileSync(pad, r.outputFiles[0].text);
    const m = await import(pathToFileURL(join(process.cwd(), pad)).href);
    return { plek: m.geminimaliseerdPlek, MARGE: m.GEMINIMALISEERD_MARGE, SNAP: m.GEMINIMALISEERD_SNAP };
  } finally { rmSync(map, { recursive: true, force: true }); }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-geminimaliseerd-20261025');
  const viewer = lees('src/MailGeminimaliseerdeViewer.tsx'), vcss = lees('src/mail-geminimaliseerde-viewer.css');
  const bijlage = lees('src/MailBijlageVoorbeeld.tsx'), strook = lees('src/mail-bijlage-strook.css');

  // ------------------------------------------------------------------ A. zuivere plek
  const { plek, MARGE, SNAP } = await laadPlek();
  check('A functie en maten uit de component: geminimaliseerdPlek, marge 8 px, terugklikken naar de standaardplek binnen 24 px', typeof plek === 'function' && MARGE === 8 && SNAP === 24);
  const p1 = plek({ left: 300, top: 200 }, { width: 520, height: 52 }, 1280, 800);
  check('A zonder hindernis en binnen beeld: precies de wens', p1.left === 300 && p1.top === 200, JSON.stringify(p1));
  const p2 = plek({ left: 5000, top: 5000 }, { width: 520, height: 52 }, 1280, 800), p3 = plek({ left: -90, top: -40 }, { width: 520, height: 52 }, 1280, 800);
  check('A begrensd tot het scherm met 8 px marge (rechtsonder en linksboven)', p2.left === 1280 - 520 - 8 && p2.top === 800 - 52 - 8 && p3.left === 8 && p3.top === 8, JSON.stringify({ p2, p3 }));
  // het oude defect: een (uitgerekte) hoogte van 352 hield het venster hoog; met de natuurlijke hoogte (52) mag het weer tot onderaan
  const laag = plek({ left: 632, top: 740 }, { width: 520, height: 52 }, 1280, 800), lijstOpen = plek({ left: 632, top: 740 }, { width: 480, height: 372 }, 1280, 800);
  check('A de klem rekent met de natuurlijke hoogte: kop 52 px → top 740 blijft; lijst open (372 px) → omhoog tot 800 − 372 − 8', laag.top === 740 && lijstOpen.top === 800 - 372 - 8, JSON.stringify({ laag, lijstOpen }));
  for (const [vw, vh] of [[390, 844], [768, 1024], [1280, 800], [1704, 960]] as const) {
    const st = stapelRechthoek(klasseVan(vw), 2, vw, vh);
    const stapel: Doos = { left: st.left, top: st.top, width: st.width, height: st.height };
    const balk: Doos = { left: vw - 120, top: 8, width: 104, height: 46 };
    const breed = vw <= 700 ? vw - 16 : Math.min(520, vw - 260), maten = [52, 56, 210];
    let fout = '', n = 0;
    for (const h of maten) for (let x = -50; x <= vw; x += Math.round(vw / 9)) for (let y = -50; y <= vh; y += Math.round(vh / 11)) {
      const p = plek({ left: x, top: y }, { width: breed, height: h }, vw, vh, [stapel, balk]); n++;
      const d = { left: p.left, top: p.top, width: breed, height: h };
      if (p.left < 8 || p.top < 8 || p.left + breed > vw - 8 || p.top + h > vh - 8) { fout = `buiten beeld ${JSON.stringify({ x, y, h, p })}`; break; }
      if (raakt(d, stapel) || raakt(d, balk)) { fout = `raakt ${raakt(d, stapel) ? 'stapel' : 'bovenbalk'} ${JSON.stringify({ x, y, h, p, stapel })}`; break; }
    }
    check(`A ${vw}×${vh}: ${n} wensen × hoogte 52/56/210 — altijd binnen beeld, nooit over de actiestapel of de bovenbalk`, !fout, fout);
  }
  {
    const st = stapelRechthoek('computer', 2, 1280, 800), stapel = { left: st.left, top: st.top, width: st.width, height: st.height };
    const p = plek({ left: st.left - 100, top: st.top + 20 }, { width: 520, height: 52 }, 1280, 800, [stapel]);
    check('A over de stapel losgelaten → de dichtstbijzijnde vrije plek (links ervan, zelfde hoogte)', p.left === st.left - 520 - 8 && p.top === st.top + 20, JSON.stringify({ p, st }));
    const tel = stapelRechthoek('telefoon', 2, 390, 844), ts = { left: tel.left, top: tel.top, width: tel.width, height: tel.height };
    const q = plek({ left: 8, top: tel.top + 10 }, { width: 374, height: 56 }, 390, 844, [ts]);
    check('A telefoon (venster over de hele breedte): over de stapel → erboven, 8 px vrij', q.left === 8 && q.top === tel.top - 56 - 8, JSON.stringify({ q, tel }));
  }

  // ------------------------------------------------------------------ B. component
  check('B data-geplaatst alleen bij een eigen plek', viewer.includes("data-geplaatst={position?'ja':undefined}"));
  check('B eigen plek = top/left met right/bottom auto — nooit een hoogte in de stijl', viewer.includes("style=plek?({left:plek.left,top:plek.top,right:'auto',bottom:'auto'}as CSSProperties):undefined") && !/style=\{?[^;]*height:/.test(viewer.slice(viewer.indexOf('style=plek?'), viewer.indexOf('style=plek?') + 120)));
  check('B terug naar de standaardplek: onPositionChange(null) (type staat null toe) bij loslaten binnen GEMINIMALISEERD_SNAP',
    viewer.includes('onPositionChange:(value:MailFloatingPosition|null)=>void') && /Math\.abs\(r\.left-d\.left\)<=GEMINIMALISEERD_SNAP&&Math\.abs\(r\.top-d\.top\)<=GEMINIMALISEERD_SNAP\)\{onPositionChange\(null\)/.test(viewer) && viewer.includes('standaardRect(el)'));
  const klemmen = (viewer.match(/geminimaliseerdPlek\(/g) || []).length;
  check('B klem met de natuurlijke maat bij slepen, loslaten en tonen (layout-effect)', klemmen >= 4 && /onPositionChange\(geminimaliseerdPlek\(\{left:state\.left\+dx,top:state\.top\+dy\},\{width:rect\.width,height:rect\.height\}/.test(viewer), String(klemmen));
  check('B opnieuw begrenzen bij resize, visualViewport, tsv:plaatsing (één beeld later: eerst tekent React de stapel) en maatwissel (ResizeObserver: lijst open/dicht, herladen)',
    viewer.includes("window.addEventListener('resize',f)") && viewer.includes("window.visualViewport?.addEventListener('resize',f)") && viewer.includes("window.addEventListener('tsv:plaatsing',later)") && viewer.includes('later=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(f)}') && viewer.includes('new ResizeObserver(f)')
    && viewer.includes('useLayoutEffect(()=>{plaats.current()},[position?.left,position?.top,listOpen,entries.length,items.length])'));
  check('B de wens blijft staan: geen terugschrijven bij resize (vroeger onPositionChange in de resize-klem)', !/const clamp=\(\)=>/.test(viewer) && !/addEventListener\('resize',clamp\)/.test(viewer));
  check('B hindernissen uit de plaatsingslaag: actiestapel en bovenbalk (dokHindernissen), verborgen zones tellen niet',
    viewer.includes("import{dokHindernissen,type DokRect}from'./platform/venster-dok-logica'") && viewer.includes("import{plaatsStaat}from'./plaatsing/plaatsing-staat'") && viewer.includes('[z.actiestapel,z.bovenbalk]') && viewer.includes("cs.visibility==='hidden'||cs.display==='none'"));
  check('B badge «+N»: getal, geen «+$84» (template-tekst in JSX)', viewer.includes("<span className='mail-minimized-more'>+{items.length-shown.length}</span>") && !viewer.includes('+${items.length'));
  check('B alle functies blijven: openen, sluiten, terughalen, lijst, bijlage openen, slepen, toetsenbord', ['onRestore()', 'onClose()', 'onSelectEntry(entry.id)', 'onCloseEntry(entry.id)', 'onOpen(value)', 'setPointerCapture', "event.key==='Enter'||event.key===' '", 'setListOpen(value=>!value)'].every((x) => viewer.includes(x)));
  check('B teksten uk + nl blijven', ["t('Згорнуті листи','Geminimaliseerde berichten')", "t('Розгорнути перегляд','Weergave herstellen')", "t('Закрити перегляд','Weergave sluiten')", 't(`Згорнуто: ${entries.length}`,`Geminimaliseerd: ${entries.length}`)'].every((x) => viewer.includes(x)));
  check('B één regel (stijl van het bestand)', !viewer.trimEnd().includes('\n'));

  // ------------------------------------------------------------------ C. CSS
  const fouten: string[] = [];
  for (const f of cssBestanden('src')) for (const r of regels(lees(f))) {
    const delen = r.selector.split(',').map((x) => x.trim()).filter((x) => /\.mail-minimized-viewer(?![-\w])/.test(x) && !/\.mail-minimized-viewer[^,]*\s+\S/.test(x.replace(/:not\([^)]*\)/g, '')));
    if (!delen.length) continue;
    if (/(^|;)\s*(bottom|inset|inset-block|inset-block-end)\s*:[^;]*!important/.test(r.blok)) for (const d of delen) if (!d.includes(':not([data-geplaatst])')) fouten.push(`${f}: ${d}`);
    if (/(^|;)\s*height\s*:\s*\d/.test(r.blok)) fouten.push(`${f}: ${r.selector} zet een vaste hoogte`);
  }
  check('C geen enkele regel zet bottom met !important op een zelf neergezet venster (alleen :not([data-geplaatst])), geen vaste hoogte', fouten.length === 0, fouten.join(' | '));
  check('C de globale regels zijn er (standaardplek onderaan, boven de rij knoppen)', zc(lees('src/ui-golf-11.css')).includes('.mail-minimized-viewer:not([data-geplaatst]){bottom:calc(16px + env(safe-area-inset-bottom,0px))!important}')
    && zc(lees('src/mail-qa-2026-10.css')).includes('html body .mail-minimized-viewer:not([data-geplaatst]){bottom:calc(8px + env(safe-area-inset-bottom,0px))!important}'));
  const vz = zc(vcss);
  check('C eigen CSS: natuurlijke hoogte (height:auto), zelf neergezet = right/bottom auto en niet te rekken', vz.includes('min-height:52px;height:auto;') && vz.includes('.mail-minimized-viewer[data-geplaatst]{right:auto;bottom:auto;resize:none}'));
  const klein = [...vz.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter((n) => n < 12);
  check('C letters ≥ 12 px in het dok (stand: kleine-letter 9 px «Згорнутий лист»)', klein.length === 0, klein.join(','));
  check('C telefoon: knoppen van het dok 40 px (stand: kleine-knop 30×30)', /@media\(max-width:700px\)\{[^@]*\.mail-minimized-actions button,\.mail-minimized-entry-close\{width:40px;height:40px\}\.mail-minimized-stack-toggle\{box-sizing:border-box;height:40px\}/.test(vz));
  check('C dicht bij de bovenrand groeien de miniaturen naar beneden (data-boven)', vz.includes('.mail-minimized-viewer[data-boven] .mail-minimized-previews>button{transform-origin:top center}') && viewer.includes("data-boven={plek&&plek.top<96?'ja':undefined}"));
  const vast = JSON.parse(lees('scripts/plaatsing-vaste-elementen.json'));
  const vastTekst = JSON.stringify(vast);
  check('C vaste elementen staan nog op de lijst (bouwcontrole plaatsing)', vastTekst.includes('src/mail-geminimaliseerde-viewer.css :: .mail-minimized-viewer') && vastTekst.includes('src/mail-bijlage-strook.css :: .mail-attachment-hover-preview')
    && /\.mail-minimized-viewer\{position:fixed/.test(vz) && /\.mail-attachment-hover-preview\{position:fixed/.test(zc(strook)));

  // ------------------------------------------------------------------ D. bijlagen
  const knop = bijlage.slice(bijlage.indexOf('export const MailAttachmentButton='), bijlage.indexOf('const MailAttachmentHoverCard='));
  const kaart = bijlage.slice(bijlage.indexOf('const MailAttachmentHoverCard='), bijlage.indexOf('export const MailAttachmentStrip='));
  const strip = bijlage.slice(bijlage.indexOf('export const MailAttachmentStrip='), bijlage.indexOf('const ArchiveBrowser='));
  check('D de kaart groeit niet meer in de rij: geen expanded-staat, geen eigen wiel, geen hoogte in de stijl', knop.length > 1000 && !/setExpanded|baseHeightRef|cardRef|contentRef|style=\{expanded/.test(knop) && !knop.includes("addEventListener('wheel'"));
  check('D nergens nog data-expanding (bron en CSS)', ['src/MailBijlageVoorbeeld.tsx', 'src/mail-bijlage-strook.css', 'src/mail-gesprek-bewerker.css', 'src/MailGesprekInhoud.tsx'].every((f) => !zc(lees(f)).includes('data-expanding')));
  check('D kaart: aanwijzen/focus opent het voorbeeld en klikken opent de bijlage zoals vroeger', knop.includes('onPointerEnter={event=>{activeRef.current=true;onHoverStart?.(event.currentTarget)}}') && knop.includes('onClick={loading?undefined:open}') && knop.includes("data-scrolling={scrolling?'true':undefined}"));
  check('D zwevend voorbeeld: «groot» komt van de strook (wiel boven de kaart of boven een foto in het voorbeeld)', kaart.includes('({state,lang,groot,onGroot,vakRef,onEnter,onLeave,onOpen}') && !kaart.includes('useState(false)') && kaart.includes("onGroot(true)") && kaart.includes('ref={vakRef}')
    && kaart.includes("data-groot={groot?'ja':undefined}") && /voorbeeldBreedte\(\w+,window\.innerWidth,groot\)/.test(kaart));
  check('D wiel: alleen een luisteraar terwijl een voorbeeld open is; preventDefault pas als het zichtbaar is, niet geblokkeerd, na WIEL_RUST_MS, omlaag, niet horizontaal of met Ctrl',
    /if\(!node\|\|!hover\|\|!hoverPreview\)return;/.test(strip) && strip.includes("node.addEventListener('wheel',wiel,{passive:false})") && strip.includes('},[hover?.key,hoverPreview]);')
    && /if\(!h\|\|!pop\|\|!pop\.isConnected\|\|!pop\.getClientRects\(\)\.length\)return;/.test(strip)
    && /if\(h\.blocked\|\|event\.ctrlKey\|\|event\.deltaY<=0\|\|Math\.abs\(event\.deltaX\)>Math\.abs\(event\.deltaY\)\|\|nu-sinds<WIEL_RUST_MS\|\|!\(event\.target as Element\|null\)\?\.closest\?\.\('\.mail-attachment'\)\)return;event\.preventDefault\(\);/.test(strip)
    && /const WIEL_RUST_MS=300,WIEL_GEBAAR_MS=200;/.test(bijlage));
  check('D groot weer klein bij een andere bijlage of sluiten', strip.includes('useEffect(()=>{setGroot(false);grootRef.current=false;') && strip.includes('groot={groot} onGroot={waarde=>{grootRef.current=waarde;setGroot(waarde)}} vakRef={vak}'));
  check('D CSS: geen [data-expanding]-regel meer; kaart houdt haar vaste hoogte', !zc(strook).includes('[data-expanding]') && zc(strook).includes('height:var(--mail-density-attachment-preview-height,58px)'));
  const rij = lees('src/MailBerichtRij.tsx'), gesprek = lees('src/MailGesprekInhoud.tsx');
  check('D lijst: zwevend voorbeeld in elke dichtheid (ook «Звичайний»)', rij.includes('hoverPreview hoverPreviewLang={lang} onHoverPreviewLoad={onAttachmentHoverPreview}') && !rij.includes("hoverPreview={density!=='normal'}"));
  check('D brief: ingeklapte berichten krijgen hetzelfde zwevende voorbeeld (eigen lader, meldt tsv:mail-attachment-preview-ready)',
    gesprek.includes("import{MailAttachmentStrip,loadMailAttachmentPreview,type MailAttachment}from'./MailBijlageVoorbeeld';") && /<MailAttachmentStrip items=\{message\.attachments\}[^>]*hoverPreview hoverPreviewLang=\{lang\} onHoverPreviewLoad=/.test(gesprek)
    && gesprek.includes('loadMailAttachmentPreview({context,accountId,cacheAccountId,messageId:message.id,item})') && gesprek.includes("new CustomEvent('tsv:mail-attachment-preview-ready'"));
  check('D №15 (mail-qa): antwoord standaard ingeklapt blijft', gesprek.includes('[replyIngeklapt,setReplyIngeklapt]=useState(true)'));

  // ------------------------------------------------------------------ E. stand
  const stand = lees('tests/e2e/hulp/stand-blok1-geminimaliseerd.ts');
  check('E stand: stappen blok1-geminimaliseerd-dok en -bijlage, met meting', stand.includes("naam: 'blok1-geminimaliseerd-dok'") && stand.includes("naam: 'blok1-geminimaliseerd-bijlage'") && (stand.match(/ctx\.meting\(/g) || []).length >= 2
    && lees('tests/e2e/hulp/stand-blok1.ts').includes('...geminimaliseerdStappen(ctx)'));
  return einde();
}
