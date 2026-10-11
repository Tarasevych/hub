// 2.6: випадаючі меню на <details> (кнопка «⋯», «Перемістити», меню дій) закриваються кліком поза ними й коли відкривається інше.
// Лише «спливаючі» details — ті, чий вміст позиціонується поверх сторінки (absolute/fixed); звичайні розгортні блоки не чіпаємо.
const isZwevend = (d: HTMLDetailsElement) => {
  for (const el of Array.from(d.children)) {
    if (el.tagName === 'SUMMARY') continue;
    const pos = getComputedStyle(el).position;
    if (pos === 'absolute' || pos === 'fixed') return true;
  }
  return false;
};
let klaar = false;
export function installeerEenMenu() {
  if (klaar || typeof document === 'undefined') return;
  klaar = true;
  document.addEventListener('pointerdown', (e) => {
    const doel = e.target as Node | null;
    for (const d of Array.from(document.querySelectorAll<HTMLDetailsElement>('details[open]'))) if (!d.contains(doel) && isZwevend(d)) d.open = false;
  }, true);
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.open || !isZwevend(d)) return;
    for (const ander of Array.from(document.querySelectorAll<HTMLDetailsElement>('details[open]'))) if (ander !== d && !ander.contains(d) && !d.contains(ander) && isZwevend(ander)) ander.open = false;
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const d of Array.from(document.querySelectorAll<HTMLDetailsElement>('details[open]'))) if (isZwevend(d) && d.contains(document.activeElement)) { d.open = false; d.querySelector('summary')?.focus(); }
  });
}
