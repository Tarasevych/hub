// 2.1: «Зменшити вікно» для перегляду листа — лист стає вільним вікном поверх пошти: перетягується за верхню панель,
// змінює розмір за кут, а список листів і вікно відповіді / нового листа поруч лишаються доступні. Стан і розмір пам’ятаються.
// 24.10.2026 (pakket 1 «Adaptive Mail Canvas»): de vorm van het venster hoort nu bij src/mail/LeesVenster.tsx (het kader); dit bestand
// doet alleen de geometrie in de DOM. Nieuw: één grens met de telefoon (721 px, was 760 — daartussen deed de knop niets), het venster
// blijft rechts van de zijbalk en binnen het scherm (ook na het verkleinen van het browservenster), en het toetsenbord: pijltjes op de
// greep verplaatsen, Shift+pijltjes veranderen de grootte (zoals src/platform/vensters.tsx).
import { BOVENBALK, TELEFOON_TOT, binnenScherm, vensterToets, type Randen, type VensterStand } from './mail/lees-modus';

const SLEUTEL = 'mail-reader-venster-v1';
type Stand = VensterStand & { zwevend: boolean };
const lees = (): Stand => { try { const v = JSON.parse(localStorage.getItem(SLEUTEL) || 'null'); if (v && typeof v.x === 'number') return v; } catch { /* geen opslag */ } return { zwevend: false, x: Math.max(60, innerWidth - 760), y: 70, w: Math.min(720, innerWidth - 80), h: Math.min(760, innerHeight - 100) }; };
const bewaar = (s: Stand) => { try { localStorage.setItem(SLEUTEL, JSON.stringify(s)); } catch { /* geen opslag */ } };
// Het zwevende venster blijft naast menu/dock (randen van LeesVenster) en onder de bovenbalk van de site.
const binnen = (s: Stand, r: Partial<Randen> = {}): Stand => ({ ...s, ...binnenScherm(s, { w: innerWidth, h: innerHeight }, { ...r, boven: Math.max(Number(r.boven) || 0, BOVENBALK) }) });

// Eén bron voor «zwevend aan/uit»: het kader (LeesVenster) en de werkbalk luisteren mee.
const luisteraars = new Set<() => void>();
export function opZwevend(f: () => void) { luisteraars.add(f); return () => { luisteraars.delete(f); }; }
export const readerZwevend = () => typeof innerWidth !== 'undefined' && innerWidth >= TELEFOON_TOT && lees().zwevend;
/** De keuze zelf (ook als het scherm nu te smal is om te zweven): LeesVenster rekent er de vorm mee uit. */
export const zwevendVoorkeur = () => typeof localStorage !== 'undefined' && lees().zwevend === true;
export function zetZwevend(aan: boolean, r: Partial<Randen> = {}) {
  const s = lees(); bewaar(binnen({ ...s, zwevend: aan }, r));
  for (const f of luisteraars) f();
  return aan;
}

/** Zet de stand op het venster: `data-reader-venster="zwevend"` + plaats en grootte, of alles weg (volledig/gesplitst/telefoon). */
export function pasToe(backdrop: HTMLElement | null, r: Partial<Randen> = {}) {
  if (!backdrop) return;
  const reader = backdrop.querySelector<HTMLElement>('.google-mail-reader');
  const s = binnen(lees(), r);
  if (!s.zwevend || innerWidth < TELEFOON_TOT) { backdrop.removeAttribute('data-reader-venster'); if (reader) for (const k of ['left', 'top', 'width', 'height']) reader.style.removeProperty(k); return; }
  backdrop.setAttribute('data-reader-venster', 'zwevend');
  if (reader) Object.assign(reader.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px` });
}

/** Toetsenbord op de greep: pijltjes verplaatsen (Alt: fijn), Shift+pijltjes veranderen de grootte. true = toets gebruikt. */
export function verschuif(backdrop: HTMLElement | null, toets: { key: string; shiftKey?: boolean; altKey?: boolean }, r: Partial<Randen> = {}): boolean {
  if (!backdrop || backdrop.getAttribute('data-reader-venster') !== 'zwevend') return false;
  const reader = backdrop.querySelector<HTMLElement>('.google-mail-reader');
  const s = lees(), b = reader?.getBoundingClientRect();
  const nu: Stand = b ? { ...s, x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } : s;
  const volgend = vensterToets(nu, toets);
  if (!volgend) return false;
  bewaar(binnen({ ...nu, ...volgend }, r)); pasToe(backdrop, r);
  return true;
}

/** Slepen aan de werkbalk (niet op knoppen), grootte bijhouden na het vergroten met de hoek, en na het verkleinen van het
 *  browservenster het venster terug binnen het scherm zetten. */
export function koppel(backdrop: HTMLElement | null, randen: () => Partial<Randen> = () => ({})) {
  if (!backdrop) return () => undefined;
  const reader = backdrop.querySelector<HTMLElement>('.google-mail-reader');
  if (!reader) return () => undefined;
  let start: { px: number; py: number; s: Stand } | null = null;
  const neer = (e: PointerEvent) => {
    if (backdrop.getAttribute('data-reader-venster') !== 'zwevend' || e.button !== 0) return;
    const t = e.target as HTMLElement;
    const rr = reader.getBoundingClientRect();
    if (e.clientY - rr.top > 64 || t.closest('button, a, input, select, textarea, details, summary, [role=menu], [contenteditable=true]')) return;
    start = { px: e.clientX, py: e.clientY, s: lees() }; t.setPointerCapture?.(e.pointerId); e.preventDefault();
  };
  const beweeg = (e: PointerEvent) => { if (!start) return; const s = binnen({ ...start.s, x: start.s.x + e.clientX - start.px, y: start.s.y + e.clientY - start.py }, randen()); Object.assign(reader.style, { left: `${s.x}px`, top: `${s.y}px` }); };
  const op = (e: PointerEvent) => { if (!start) return; const s = binnen({ ...start.s, x: start.s.x + e.clientX - start.px, y: start.s.y + e.clientY - start.py }, randen()); start = null; bewaar(s); };
  const ro = new ResizeObserver(() => { if (backdrop.getAttribute('data-reader-venster') !== 'zwevend') return; const r = reader.getBoundingClientRect(); const s = lees(); if (Math.abs(r.width - s.w) > 2 || Math.abs(r.height - s.h) > 2) bewaar({ ...s, w: Math.round(r.width), h: Math.round(r.height) }); });
  const scherm = () => pasToe(backdrop, randen());
  reader.addEventListener('pointerdown', neer); window.addEventListener('pointermove', beweeg); window.addEventListener('pointerup', op); window.addEventListener('resize', scherm); window.addEventListener('tsv:plaatsing', scherm); ro.observe(reader);
  return () => { reader.removeEventListener('pointerdown', neer); window.removeEventListener('pointermove', beweeg); window.removeEventListener('pointerup', op); window.removeEventListener('resize', scherm); window.removeEventListener('tsv:plaatsing', scherm); ro.disconnect(); };
}
