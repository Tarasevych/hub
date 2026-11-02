// FLIP voor de buren in een zone tijdens het slepen (25.10.2026): «сусіди розсуваються, щоб звільнити гніздо; повели далі —
// повертаються». Vóór een wijziging legt het sleepprogramma de plaats van alle kinderen van alle zones vast (flipVoor); na het
// tekenen schuift elke zone haar kinderen van de oude naar de nieuwe plaats (flipNa, 160 ms). Alleen tijdens het slepen — gewone
// herindeling (venster breder, menu open) gaat zonder beweging. Geen beweging bij prefers-reduced-motion.
import { plaatsStaat } from './plaatsing-staat';

let oud = new WeakMap<Element, DOMRect>();
let actief = false;

const kinderen = (zone: Element) => Array.from(zone.children);
const rustig = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Plaats van alle kinderen van alle zones vastleggen (vlak vóór de staat van het slepen verandert). */
export function flipVoor() {
  actief = true;
  oud = new WeakMap();
  for (const zone of Object.values(plaatsStaat().zones)) if (zone) for (const c of kinderen(zone)) oud.set(c, c.getBoundingClientRect());
}
/** Slepen voorbij: niets meer animeren. */
export function flipUit() { actief = false; oud = new WeakMap(); }

/** Na het tekenen van een zone: kinderen die verschoven zijn, glijden van hun oude plaats naar de nieuwe. */
export function flipNa(zone: Element) {
  if (!actief || rustig()) return;
  for (const c of kinderen(zone)) {
    const was = oud.get(c), nu = c.getBoundingClientRect();
    if (!was || !(c as HTMLElement).animate) { oud.set(c, nu); continue; }
    const dx = was.left - nu.left, dy = was.top - nu.top;
    oud.set(c, nu);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    (c as HTMLElement).animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}
