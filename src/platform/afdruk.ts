// Afdrukken (Ctrl+P) — INTEG-001 / TEMA print (03.11.2026).
// Eigenaar: «bij Ctrl+P wil ik de hele pagina op papier; nu stelt de browser voor alleen het zichtbare deel te drukken.»
// Oorzaak: de app is een schil met vaste hoogte (html/body/#root 100 % + overflow:hidden; .canonical-chrome en .canonical-workspace
// position:fixed + overflow:auto) met daarbinnen nog tientallen scrollvensters. src/afdruk.css maakt de bekende schil los en verbergt
// de bekende balken. Dit bestand doet wat CSS niet kan raden — vlak vóór het afdrukken (beforeprint) meten we de echte pagina:
//   · scrollvensters/afgeknipte vakken met inhoud die buiten beeld valt  → data-afdruk-auto="ontgrendel" (hoogte vrij, overflow zichtbaar)
//   · vaste lagen: schermvullend = schil (los maken), klein = balk/knop/melding (verbergen; met kop = paginakop, los maken)
//   · knoppen: een knop met inhoud (rij, kaart, tegel: titel + status) blijft, een actieknop (Зберегти, ✕, ⋯) valt weg
// Na het afdrukken (afterprint) verdwijnen alle markeringen en komen de scrollstanden terug. Zonder deze JS blijft de pagina leesbaar
// (alleen de CSS), er gaat dan niets verloren; hooguit staan er enkele knoppen bij.
// Lui geladen inhoud (bv. de secties van /agenten): componenten melden zich met bijAfdrukVoorbereiding(); voor secties die pas bij
// scrollen worden opgebouwd (data-afdruk-lui="dicht" of het huidige data-ag-lui="dicht") scrollt de Ctrl+P-onderschepping ze eerst
// in beeld en drukt daarna pas af. Het menu Bestand → Afdrukken kan niet worden uitgesteld (daar telt alleen het synchrone beforeprint).

/** Attribuut waarmee dit bestand elementen markeert; waarden (spatie-gescheiden): ontgrendel, losmaken, verberg, knop. */
export const AFDRUK_ATTR = 'data-afdruk-auto';
/** Plaatshouders van lui geladen inhoud die vóór het afdrukken opgebouwd moeten worden. */
export const LUI_PLAATSHOUDERS = "[data-afdruk-lui='dicht'], [data-ag-lui='dicht']";

const KLEMT = new Set(['hidden', 'auto', 'scroll', 'clip']);
const OVERSLAAN = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'OPTGROUP', 'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO', 'IMG', 'BR', 'HR']);
/** Veiligheidsgrens: een pagina met meer elementen wordt niet doorgemeten (CSS-terugval blijft werken). */
const MAX_ELEMENTEN = 40_000;
/** Een knop met minstens zoveel tekens is inhoud (een zin), geen actielabel. */
const KNOP_INHOUD_TEKENS = 28;
/** Een vast element dat zoveel van het venster bedekt is de schil (of een achterlaag), geen balk. */
const SCHIL_FRACTIE = 0.5;
/** Een vast element met een kop erin is een paginakop (blijft, één keer) als het minstens zoveel van de breedte beslaat; een hoekmelding met titel niet. */
const KOP_BREEDTE = 0.9;

/** Wat we van één element meten (puur, zodat het zonder DOM te toetsen is). */
export type Meting = {
  positie: string;
  overflowY: string;
  scrollHoogte: number;
  klantHoogte: number;
  /** Alleen bij position:fixed: deel van het venster dat het element bedekt (0–1). */
  beeldFractie: number;
  /** Alleen bij position:fixed: deel van de vensterbreedte dat het element beslaat (0–1); een paginakop loopt over de hele breedte, een melding niet. */
  breedteFractie: number;
  heeftInhoud: boolean;
  /** Het element is zelf een venster of bestaat alleen uit vensters (een achterlaag): niet 'er zit ergens een venster in' — dan zou de hele schil wegvallen. */
  isOverlay: boolean;
  heeftKop: boolean;
  /** clip/clip-path of 1×1 px: visueel verborgen hulptekst (sr-only) blijft verborgen. */
  onzichtbaarHulp: boolean;
};
export type Besluit = { ontgrendel: boolean; losmaken: boolean; verberg: boolean };

const GEEN: Besluit = { ontgrendel: false, losmaken: false, verberg: false };

export function beslis(m: Meting): Besluit {
  if (m.onzichtbaarHulp) return GEEN;
  if (m.positie === 'fixed') {
    if (m.beeldFractie >= SCHIL_FRACTIE) {
      // Schermvullende laag: een venster/achterlaag valt weg, de schil (met inhoud) wordt gewone stroom.
      if (m.isOverlay || !m.heeftInhoud) return { ontgrendel: false, losmaken: false, verberg: true };
      return { ontgrendel: true, losmaken: true, verberg: false };
    }
    // Kleine vaste laag: een paginakop (met kop erin) gaat de stroom in, al het andere (balk, knop, melding, dok) valt weg.
    if (m.heeftKop && m.breedteFractie >= KOP_BREEDTE && !m.isOverlay) return { ontgrendel: true, losmaken: true, verberg: false };
    return { ontgrendel: false, losmaken: false, verberg: true };
  }
  const klemt = KLEMT.has(m.overflowY) && m.scrollHoogte > m.klantHoogte + 1;
  return { ontgrendel: klemt, losmaken: m.positie === 'sticky' || (klemt && m.positie === 'absolute'), verberg: false };
}

/** Een knop is inhoud (blijft) als de eigenaar dat zegt, of als hij een zin bevat, of uit minstens twee tekstdelen bestaat (titel + status). */
export function isInhoudsKnop(k: { tekst: string; tekstElementen: number; toon?: boolean }): boolean {
  if (k.toon) return true;
  return k.tekst.replace(/\s+/g, ' ').trim().length >= KNOP_INHOUD_TEKENS || k.tekstElementen >= 2;
}

// ── Voorbereiden / opruimen ────────────────────────────────────────────────────────────────────────────────────────────────────────

const voorbereidingen = new Set<() => void>();
/** Voor componenten met lui geladen inhoud: `fn` draait synchroon in beforeprint (bv. flushSync(() => setOpen(true))). Geeft een afmelder terug. */
export function bijAfdrukVoorbereiding(fn: () => void): () => void {
  voorbereidingen.add(fn);
  return () => { voorbereidingen.delete(fn); };
}

const heeftEigenTekst = (el: Element) => { for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && (n.nodeValue ?? '').trim()) return true; return false; };
const VENSTER = '[role="dialog"],[aria-modal="true"],dialog';
const isOverlay = (el: Element) => el.matches(VENSTER) || (el.tagName !== 'MAIN' && el.children.length > 0 && Array.from(el.children).some((c) => c.matches(VENSTER)) && Array.from(el.children).every((c) => c.matches(VENSTER) || !(c.textContent ?? '').trim()));
const tekstElementen = (knop: Element) => { let n = 0; for (const el of Array.from(knop.querySelectorAll('*'))) if (heeftEigenTekst(el)) n++; return n; };

/**
 * Meet de pagina en zet data-afdruk-auto op wat vrij moet, weg moet of een knop is. Geeft de functie terug die alles terugzet.
 * Doet niets in de eigen afdrukstand van de herstelcodes (body.herstel-afdruk: daar toont de CSS bewust één blok).
 */
export function bereidAfdrukVoor(doc: Document): () => void {
  const win = doc.defaultView;
  const body = doc.body;
  if (!win || !body || body.classList.contains('herstel-afdruk')) return () => {};
  for (const fn of Array.from(voorbereidingen)) { try { fn(); } catch { /* een kapotte voorbereiding mag het afdrukken niet blokkeren */ } }

  const vb = Math.max(1, win.innerWidth), vh = Math.max(1, win.innerHeight);
  const waarden = new Map<Element, Set<string>>();
  const zet = (el: Element, w: string) => { let s = waarden.get(el); if (!s) { s = new Set(); waarden.set(el, s); } s.add(w); };
  const ontgrendeld: Element[] = [];

  // Fase 1 (alleen lezen): meten in documentvolgorde. Onder een verborgen/weggehaalde tak kijken we niet meer.
  let tak: Element | null = null;
  const alle = body.querySelectorAll('*');
  const aantal = Math.min(alle.length, MAX_ELEMENTEN);
  for (let i = 0; i < aantal; i++) {
    const el = alle[i];
    if (tak) { if (tak.contains(el)) continue; tak = null; }
    if (OVERSLAAN.has(el.tagName) || !(el instanceof win.HTMLElement)) continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none') { tak = el; continue; }
    const fixed = cs.position === 'fixed';
    const klemt = KLEMT.has(cs.overflowY);
    if (!fixed && !klemt && cs.position !== 'sticky') continue;
    const r = fixed ? el.getBoundingClientRect() : null;
    const breed = r ? Math.max(0, Math.min(r.right, vb) - Math.max(r.left, 0)) : 0;
    const hoog = r ? Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) : 0;
    const m: Meting = {
      positie: cs.position,
      overflowY: cs.overflowY,
      scrollHoogte: klemt ? el.scrollHeight : 0,
      klantHoogte: klemt ? el.clientHeight : 0,
      beeldFractie: fixed ? (breed * hoog) / (vb * vh) : 0,
      breedteFractie: fixed ? breed / vb : 0,
      heeftInhoud: fixed ? ((el.textContent ?? '').trim().length > 0 || !!el.querySelector('img,canvas,svg,video,iframe,picture')) : true,
      isOverlay: fixed ? isOverlay(el) : false,
      heeftKop: fixed ? !!el.querySelector('h1,h2,h3') : false,
      onzichtbaarHulp: (cs.clip !== 'auto' && cs.clip !== '') || (cs.clipPath !== 'none' && cs.clipPath !== '') || (el.clientWidth <= 2 && el.clientHeight <= 2 && cs.overflowY !== 'visible'),
    };
    const b = beslis(m);
    if (b.verberg) { zet(el, 'verberg'); tak = el; continue; }
    if (b.ontgrendel) { zet(el, 'ontgrendel'); ontgrendeld.push(el); }
    if (b.losmaken) zet(el, 'losmaken');
  }

  // Alles boven een ontgrendeld element moet ook vrij (anders knipt een ouder met vaste hoogte het alsnog af).
  for (const el of ontgrendeld) for (let p = el.parentElement; p && p !== body && p !== doc.documentElement; p = p.parentElement) {
    if (waarden.get(p)?.has('ontgrendel')) break; // de rest van de keten is al aan de beurt geweest
    zet(p, 'ontgrendel');
  }

  // Scrollstanden onthouden: een element dat geen scrollvenster meer is vergeet zijn stand.
  const standen: Array<[Element, number, number]> = [];
  for (const [el, w] of waarden) if (w.has('ontgrendel') && (el.scrollTop || el.scrollLeft)) standen.push([el, el.scrollTop, el.scrollLeft]);

  // Fase 2 (schrijven).
  for (const [el, w] of waarden) el.setAttribute(AFDRUK_ATTR, Array.from(w).join(' '));

  // Knoppen (na fase 2, zodat een knop in een weggehaalde tak overgeslagen wordt).
  for (const k of Array.from(body.querySelectorAll('button, [role="button"]'))) {
    if (k.closest(`[${AFDRUK_ATTR}~="verberg"], [data-afdruk-verberg]`)) continue;
    const toon = !!k.closest('[data-afdruk-toon]');
    if (!isInhoudsKnop({ tekst: k.textContent ?? '', tekstElementen: tekstElementen(k), toon })) { zet(k, 'knop'); k.setAttribute(AFDRUK_ATTR, [...(waarden.get(k) ?? [])].join(' ')); }
  }

  return () => {
    for (const el of waarden.keys()) el.removeAttribute(AFDRUK_ATTR);
    for (const [el, t, l] of standen) { el.scrollTop = t; el.scrollLeft = l; }
  };
}

// ── Ctrl+P met lui geladen inhoud ───────────────────────────────────────────────────────────────────────────────────────────────────

const slaap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Scrollt elke nog niet opgebouwde plaatshouder in beeld zodat zijn inhoud verschijnt; zet daarna de scrollstanden terug. Begrensd in tijd. */
export async function laadLuieInhoud(doc: Document, maxMs = 4000): Promise<void> {
  const eerste = doc.querySelector(LUI_PLAATSHOUDERS);
  if (!eerste) return;
  const stand: Array<[Element, number]> = [];
  for (let p: Element | null = eerste; p; p = p.parentElement) if (p.scrollTop) stand.push([p, p.scrollTop]);
  const begin = Date.now();
  for (let i = 0; i < 60 && Date.now() - begin < maxMs; i++) {
    const plaats = doc.querySelector(LUI_PLAATSHOUDERS);
    if (!plaats) break;
    plaats.scrollIntoView({ block: 'center', behavior: 'instant' });
    await slaap(120);
  }
  await slaap(120);
  for (const [el, t] of stand) el.scrollTop = t;
  if (!stand.length) doc.defaultView?.scrollTo({ top: 0, behavior: 'instant' });
}

let geinstalleerd = false;
/** Koppelt beforeprint/afterprint en Ctrl/⌘+P. Eén keer; geeft een afmelder terug. */
export function installeerAfdruk(): () => void {
  if (geinstalleerd || typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  geinstalleerd = true;
  let opruim: (() => void) | null = null;
  const voor = () => { if (opruim) return; try { opruim = bereidAfdrukVoor(document); } catch { opruim = null; /* de CSS-terugval blijft werken */ } };
  const na = () => { const f = opruim; opruim = null; try { f?.(); } catch { /* niets te herstellen */ } };
  let bezig = false;
  const sneltoets = (e: KeyboardEvent) => {
    if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'p') return;
    if (!document.querySelector(LUI_PLAATSHOUDERS)) return; // niets op te bouwen: gewoon het normale afdrukvenster
    e.preventDefault();
    if (bezig) return;
    bezig = true;
    void laadLuieInhoud(document).catch(() => {}).then(() => { bezig = false; window.print(); });
  };
  window.addEventListener('beforeprint', voor);
  window.addEventListener('afterprint', na);
  window.addEventListener('keydown', sneltoets, true);
  return () => {
    window.removeEventListener('beforeprint', voor);
    window.removeEventListener('afterprint', na);
    window.removeEventListener('keydown', sneltoets, true);
    na();
    geinstalleerd = false;
  };
}
