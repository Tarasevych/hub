// IDENTITEIT-015 (крок «vormgeving»): щільність, рух, акцент і виразність ефектів — справжні налаштування всього сайту.
// Зберігаються в обліковому записі (shared/uiterlijk.ts → POST /api/owner/ui/weergave/save, як тема й палітра); тут лише
// застосування на <html>: data-dichtheid, data-beweging, data-accent і змінна --effect-sterkte. Самі правила — weergave-stijl.css.
// Dichtheid, beweging, accent en effecten: echte instellingen van de hele site, bewaard in het account; hier alleen het toepassen
// op <html>. De regels staan in weergave-stijl.css.
import { UITERLIJK_EFFECTEN_STANDAARD, type UiterlijkAccent, type UiterlijkBeweging, type UiterlijkDichtheid } from '../../shared/uiterlijk';

export type WeergaveStijl = { dichtheid?: UiterlijkDichtheid; beweging?: UiterlijkBeweging; accent?: UiterlijkAccent; effecten?: number };

/** Акцентні кольори поверх палітри (той самий набір, що й у weergave-stijl.css; тест звіряє обидва й контраст ≥ 4,5:1 тексту на заливці
 *  та ≥ 3:1 заливки на тлі кожної палітри). Accentkleuren boven het palet; de test vergelijkt ze met de CSS en meet het contrast. */
export const ACCENT_TONEN: Record<UiterlijkAccent, { licht: { accent: string; tekst: string; zacht: string }; donker: { accent: string; tekst: string; zacht: string } }> = {
  violet: { licht: { accent: '#6d28d9', tekst: '#ffffff', zacht: '#ede9fe' }, donker: { accent: '#c4b5fd', tekst: '#10161c', zacht: '#3b3160' } },
  cyan: { licht: { accent: '#155e75', tekst: '#ffffff', zacht: '#cffafe' }, donker: { accent: '#67e8f9', tekst: '#10161c', zacht: '#164e63' } },
  pink: { licht: { accent: '#be185d', tekst: '#ffffff', zacht: '#fce7f3' }, donker: { accent: '#f9a8d4', tekst: '#10161c', zacht: '#50223a' } },
  amber: { licht: { accent: '#92400e', tekst: '#ffffff', zacht: '#fef3c7' }, donker: { accent: '#fcd34d', tekst: '#10161c', zacht: '#4a3410' } },
};

/** Менше руху: вибір людини АБО системне prefers-reduced-motion. Minder beweging: keuze van de persoon of van het apparaat. */
export function minderBeweging(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.beweging === 'minder') return true;
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Значення для <html>; типові значення прибирають атрибут (старі записи без полів — як раніше). */
export function pasWeergaveStijlToe(w: WeergaveStijl, root: { dataset: DOMStringMap; style: { setProperty: (k: string, v: string) => void; removeProperty: (k: string) => void } } = document.documentElement) {
  const zet = (k: 'dichtheid' | 'beweging' | 'accent', v: string | undefined) => { if (v) { if (root.dataset[k] !== v) root.dataset[k] = v; } else if (root.dataset[k] !== undefined) delete root.dataset[k]; };
  zet('dichtheid', w.dichtheid && w.dichtheid !== 'normaal' ? w.dichtheid : undefined);
  zet('beweging', w.beweging === 'minder' ? 'minder' : undefined);
  zet('accent', w.accent);
  const e = typeof w.effecten === 'number' && Number.isFinite(w.effecten) ? Math.max(0, Math.min(100, Math.round(w.effecten))) : UITERLIJK_EFFECTEN_STANDAARD;
  if (e === UITERLIJK_EFFECTEN_STANDAARD) root.style.removeProperty('--effect-sterkte');
  else root.style.setProperty('--effect-sterkte', String(e / 100));
}
