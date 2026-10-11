// 2.1: «Зменшити вікно» для перегляду листа — лист стає вільним вікном поверх пошти: перетягується за верхню панель,
// змінює розмір за кут, а список листів і вікно відповіді / нового листа поруч лишаються доступні. Стан і розмір пам’ятаються.
const SLEUTEL = 'mail-reader-venster-v1';
type Stand = { zwevend: boolean; x: number; y: number; w: number; h: number };
const lees = (): Stand => { try { const v = JSON.parse(localStorage.getItem(SLEUTEL) || 'null'); if (v && typeof v.x === 'number') return v; } catch { /* geen opslag */ } return { zwevend: false, x: Math.max(60, innerWidth - 760), y: 70, w: Math.min(720, innerWidth - 80), h: Math.min(760, innerHeight - 100) }; };
const bewaar = (s: Stand) => { try { localStorage.setItem(SLEUTEL, JSON.stringify(s)); } catch { /* geen opslag */ } };
const binnen = (s: Stand): Stand => { const w = Math.max(360, Math.min(s.w, innerWidth - 16)), h = Math.max(280, Math.min(s.h, innerHeight - 16)); return { ...s, w, h, x: Math.max(8, Math.min(s.x, innerWidth - w - 8)), y: Math.max(8, Math.min(s.y, innerHeight - h - 8)) }; };

export const readerZwevend = () => lees().zwevend && typeof innerWidth !== 'undefined' && innerWidth > 760;

export function pasToe(backdrop: HTMLElement | null) {
  if (!backdrop) return;
  const reader = backdrop.querySelector<HTMLElement>('.google-mail-reader');
  const s = binnen(lees());
  if (!s.zwevend || innerWidth <= 760) { backdrop.removeAttribute('data-reader-venster'); if (reader) reader.style.cssText = reader.style.cssText.replace(/(left|top|width|height):[^;]*;?/g, ''); return; }
  backdrop.setAttribute('data-reader-venster', 'zwevend');
  if (reader) Object.assign(reader.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px` });
}

export function wissel(knop: HTMLElement) {
  const backdrop = knop.closest<HTMLElement>('.google-mail-reader-backdrop');
  const s = lees(); s.zwevend = !s.zwevend; bewaar(binnen(s)); pasToe(backdrop);
  return s.zwevend;
}

/** Slepen aan de werkbalk (niet op knoppen) en grootte bijhouden na het vergroten met de hoek. */
export function koppel(backdrop: HTMLElement | null) {
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
  const beweeg = (e: PointerEvent) => { if (!start) return; const s = binnen({ ...start.s, x: start.s.x + e.clientX - start.px, y: start.s.y + e.clientY - start.py }); Object.assign(reader.style, { left: `${s.x}px`, top: `${s.y}px` }); };
  const op = (e: PointerEvent) => { if (!start) return; const s = binnen({ ...start.s, x: start.s.x + e.clientX - start.px, y: start.s.y + e.clientY - start.py }); start = null; bewaar(s); };
  const ro = new ResizeObserver(() => { if (backdrop.getAttribute('data-reader-venster') !== 'zwevend') return; const r = reader.getBoundingClientRect(); const s = lees(); if (Math.abs(r.width - s.w) > 2 || Math.abs(r.height - s.h) > 2) bewaar({ ...s, w: Math.round(r.width), h: Math.round(r.height) }); });
  reader.addEventListener('pointerdown', neer); window.addEventListener('pointermove', beweeg); window.addEventListener('pointerup', op); ro.observe(reader);
  return () => { reader.removeEventListener('pointerdown', neer); window.removeEventListener('pointermove', beweeg); window.removeEventListener('pointerup', op); ro.disconnect(); };
}
