// Uitklapblokken op de hele site (punt 4): elk <details id="…"> onthoudt of u het open of dicht liet (per pagina, in deze browser),
// en een directe link met #anker opent DAT blok en klapt de andere blokken van dezelfde groep dicht (niet overladen).
// Blokken met data-accordeon op de ouder vormen een accordeon: één open tegelijk.
// Werkt ook voor blokken die React later toevoegt (MutationObserver). Gemaksopslag: zonder localStorage werkt alles gewoon.
const SLEUTEL = 'tsv-uitklap-v1';
type Stand = Record<string, boolean>;
const lees = (): Stand => { try { const v = JSON.parse(localStorage.getItem(SLEUTEL) || '{}'); return v && typeof v === 'object' ? v as Stand : {}; } catch { return {}; } };
const bewaar = (s: Stand) => { try { const ks = Object.keys(s); if (ks.length > 300) for (const k of ks.slice(0, ks.length - 300)) delete s[k]; localStorage.setItem(SLEUTEL, JSON.stringify(s)); } catch { /* geen opslag */ } };
const sleutel = (d: HTMLDetailsElement) => `${location.pathname}#${d.id}`;
let bezigMetZetten = false;

const zet = (d: HTMLDetailsElement, open: boolean) => { if (d.open !== open) { bezigMetZetten = true; d.open = open; queueMicrotask(() => { bezigMetZetten = false; }); } };
const groep = (d: HTMLDetailsElement) => (d.parentElement ? [...d.parentElement.querySelectorAll<HTMLDetailsElement>(':scope > details[id]')] : [d]);
const isAccordeon = (d: HTMLDetailsElement) => Boolean(d.parentElement?.hasAttribute('data-accordeon'));

/** Het blok dat bij het #anker hoort (het blok zelf of het blok waar het doel in staat). */
function ankerBlok(): HTMLDetailsElement | null {
  const id = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
  const doel = document.getElementById(id);
  if (!doel) return null;
  return doel instanceof HTMLDetailsElement ? doel : doel.closest('details');
}

function openAnker(scroll = true) {
  const d = ankerBlok();
  if (!d) return false;
  for (const ander of groep(d)) if (ander !== d) zet(ander, false);
  // ook omliggende blokken openen, anders blijft het doel verborgen
  for (let p: HTMLElement | null = d; p; p = p.parentElement?.closest('details') ?? null) if (p instanceof HTMLDetailsElement) zet(p, true);
  const s = lees(); for (const x of groep(d)) if (x.id) s[sleutel(x)] = x === d; bewaar(s);
  if (scroll) window.setTimeout(() => d.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 60);
  return true;
}

const gezien = new WeakSet<HTMLDetailsElement>();
function herstel(root: ParentNode) {
  const s = lees(), anker = ankerBlok();
  for (const d of root.querySelectorAll<HTMLDetailsElement>('details[id]')) {
    if (gezien.has(d)) continue;
    gezien.add(d);
    if (anker && (d === anker || groep(anker).includes(d))) continue; // het anker beslist voor die groep
    const k = sleutel(d);
    if (k in s) zet(d, s[k]);
  }
  if (anker && !gezien.has(anker as unknown as HTMLDetailsElement)) gezien.add(anker);
}

let geinstalleerd = false;
export function installeerUitklapGeheugen() {
  if (geinstalleerd || typeof document === 'undefined') return;
  geinstalleerd = true;
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.id || bezigMetZetten) return;
    const s = lees();
    s[sleutel(d)] = d.open;
    if (d.open && isAccordeon(d)) for (const ander of groep(d)) if (ander !== d) { zet(ander, false); s[sleutel(ander)] = false; }
    bewaar(s);
  }, true);
  let ankerGedaan = '';
  const verwerk = () => {
    herstel(document);
    if (location.hash && ankerGedaan !== location.pathname + location.hash && openAnker()) ankerGedaan = location.pathname + location.hash;
  };
  // hooguit één keer per beeld (de mail-lijst verandert vaak; dit mag niets vertragen)
  let gepland = 0;
  new MutationObserver(() => { if (!gepland) gepland = requestAnimationFrame(() => { gepland = 0; verwerk(); }); }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => { ankerGedaan = ''; verwerk(); });
  window.addEventListener('popstate', () => { ankerGedaan = ''; window.setTimeout(verwerk, 0); });
  verwerk();
}
