// Het «kader» van een position:fixed-element (18.10.2026, melding van de eigenaar: de meldingenbel viel onder het scherm zolang de
// technische band zichtbaar was en kwam pas terug als de band verdween).
//
// Waarom: met actief technisch profiel krijgt #root `transform` en `top: var(--tech-band-h)` (src/tech/tech.css). Een transform
// maakt #root het containing block van ALLE vaste elementen erin: `top: 700px` betekent dan 700px onder de bovenkant van #root,
// dus 40–44px lager dan in het venster. Wie posities in vensterpixels berekent (visualViewport, clientX/Y, getBoundingClientRect)
// moet ze naar dit kader omrekenen, anders schuift het element onder de rand.
//
// Zuiver en zonder React: getest in tests/eenheid/vast-kader.test.ts.

export type Kader = { left: number; top: number; width: number; height: number };
/** Zichtbaar gebied in kadercoördinaten, plus de verschuiving van het kader in het venster (kx/ky). */
export type ZichtbaarKader = Kader & { kx: number; ky: number };

type StijlLezer = (el: Element) => (Pick<CSSStyleDeclaration, 'transform' | 'perspective' | 'filter' | 'contain' | 'willChange' | 'backdropFilter'> & Partial<Pick<CSSStyleDeclaration, 'translate' | 'rotate' | 'scale'>>) | null;

const vormtKader = (s: ReturnType<StijlLezer>) => {
  if (!s) return false;
  const geen = (v: string | undefined) => !v || v === 'none' || v === 'normal' || v === 'auto';
  if (!geen(s.transform) || !geen(s.perspective) || !geen(s.filter) || !geen(s.backdropFilter)) return true;
  // Ook de losse eigenschappen translate/rotate/scale maken een containing block (CSS Transforms 2).
  if (!geen(s.translate) || !geen(s.rotate) || !geen(s.scale)) return true;
  if (s.willChange && /translate|rotate|scale/.test(s.willChange)) return true;
  if (s.contain && /paint|layout|strict|content/.test(s.contain)) return true;
  if (s.willChange && /transform|perspective|filter/.test(s.willChange)) return true;
  return false;
};

/**
 * Het element dat het containing block is voor een vast element op plaats `el` (de dichtstbijzijnde voorouder met transform,
 * filter, perspective, contain:paint/layout of will-change: transform), of null als dat het venster is.
 * `zelf`: telt `el` zelf mee (handig als het vaste element nog niet bestaat en je de ouder meegeeft).
 */
export function bevattendBlok(el: Element | null | undefined, zelf = false, stijl: StijlLezer = (e) => (typeof getComputedStyle === 'function' ? getComputedStyle(e) : null)): Element | null {
  let n: Element | null = el ? (zelf ? el : el.parentElement) : null;
  while (n && n.tagName !== 'HTML' && n.tagName !== 'BODY') {
    if (vormtKader(stijl(n))) return n;
    n = n.parentElement;
  }
  return null;
}

/**
 * Zichtbaar gebied (visualViewport) uitgedrukt in de coördinaten van het kader `blok`, beperkt tot het kader zelf.
 * Zonder kader: gewoon het zichtbare venster, kx = ky = 0.
 */
export function zichtbaarIn(zicht: Kader, blok: Kader | null): ZichtbaarKader {
  if (!blok) return { ...zicht, kx: 0, ky: 0 };
  const links = Math.max(zicht.left, blok.left), boven = Math.max(zicht.top, blok.top);
  const rechts = Math.min(zicht.left + zicht.width, blok.left + blok.width), onder = Math.min(zicht.top + zicht.height, blok.top + blok.height);
  return { left: links - blok.left, top: boven - blok.top, width: Math.max(0, rechts - links), height: Math.max(0, onder - boven), kx: blok.left, ky: blok.top };
}

/** Zichtbaar venster in de coördinaten van het kader van `el` (browser). */
export function zichtbaarKader(el: Element | null | undefined, zelf = false): ZichtbaarKader {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const zicht: Kader = { left: vv?.offsetLeft || 0, top: vv?.offsetTop || 0, width: vv?.width || (typeof window !== 'undefined' ? window.innerWidth : 0), height: vv?.height || (typeof window !== 'undefined' ? window.innerHeight : 0) };
  const blok = bevattendBlok(el, zelf);
  if (!blok) return zichtbaarIn(zicht, null);
  const r = blok.getBoundingClientRect();
  // Zonder de eigen `translate` van het kader: als de technische band verborgen is schuift #root omhoog via translate (tech.css) en
  // schuiven de bel, haar melding en paneel even ver terug. In kadercoördinaten ZONDER die translate staan ze dus altijd op dezelfde
  // plek, ook tijdens de animatie — de bel springt niet.
  const [tx, ty] = verschuiving(typeof getComputedStyle === 'function' ? getComputedStyle(blok).translate : '');
  return zichtbaarIn(zicht, { left: r.left - tx + (blok as HTMLElement).clientLeft, top: r.top - ty + (blok as HTMLElement).clientTop, width: (blok as HTMLElement).clientWidth || r.width, height: (blok as HTMLElement).clientHeight || r.height });
}

/** Berekende waarde van `translate` ("none", "10px", "0px -40px", "1px 2px 3px") → [x, y] in px; procenten e.d. tellen als 0. */
export function verschuiving(waarde: string | undefined | null): [number, number] {
  if (!waarde || waarde === 'none') return [0, 0];
  const d = waarde.trim().split(/\s+/).map((v) => (/^-?[\d.]+(e-?\d+)?px$/.test(v) ? parseFloat(v) : 0));
  return [d[0] || 0, d[1] || 0];
}

/**
 * Roept `opnieuw` aan zodra het kader kan veranderen zonder venster-resize: technisch profiel aan/uit (data-tech op <html>), stijl
 * van #root en het einde van een animatie van #root. Band verbergen/tonen (data-tech-verborgen) hoort er bewust NIET bij: dat is
 * alleen translate en verandert het kader niet (zie zichtbaarKader).
 */
export function volgKader(opnieuw: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => undefined;
  let rf = 0;
  const plan = () => { if (rf) return; rf = requestAnimationFrame(() => { rf = 0; opnieuw(); }); };
  const mo = new MutationObserver(plan);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-tech'] });
  const root = document.getElementById('root');
  if (root) mo.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
  root?.addEventListener('transitionend', plan);
  return () => { mo.disconnect(); root?.removeEventListener('transitionend', plan); if (rf) cancelAnimationFrame(rf); };
}
