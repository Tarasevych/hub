// IDENTITEIT-015 (крок «vormgeving»): щільність, рух, акцент і виразність ефектів — справжні налаштування всього сайту.
// Зберігаються в обліковому записі (shared/uiterlijk.ts → POST /api/owner/ui/weergave/save, як тема й палітра); тут лише
// застосування на <html>: data-dichtheid, data-beweging, data-accent і змінна --effect-sterkte. Самі правила — weergave-stijl.css.
// Dichtheid, beweging, accent en effecten: echte instellingen van de hele site, bewaard in het account; hier alleen het toepassen
// op <html>. De regels staan in weergave-stijl.css.
import { UITERLIJK_EFFECTEN_STANDAARD, type UiterlijkAccent, type UiterlijkBeweging, type UiterlijkDichtheid } from '../../shared/uiterlijk';

export type WeergaveStijl = { dichtheid?: UiterlijkDichtheid; beweging?: UiterlijkBeweging; accent?: UiterlijkAccent; effecten?: number; transparantie?: number };

/** Акцентні кольори поверх палітри (той самий набір, що й у weergave-stijl.css; тест звіряє обидва й контраст ≥ 4,5:1 тексту на заливці
 *  та ≥ 3:1 заливки на тлі кожної палітри). Accentkleuren boven het palet; de test vergelijkt ze met de CSS en meet het contrast. */
export const ACCENT_TONEN: Record<UiterlijkAccent, { licht: { accent: string; tekst: string; zacht: string }; donker: { accent: string; tekst: string; zacht: string } }> = {
  violet: { licht: { accent: '#6d28d9', tekst: '#ffffff', zacht: '#ede9fe' }, donker: { accent: '#c4b5fd', tekst: '#10161c', zacht: '#3b3160' } },
  cyan: { licht: { accent: '#155e75', tekst: '#ffffff', zacht: '#cffafe' }, donker: { accent: '#67e8f9', tekst: '#10161c', zacht: '#164e63' } },
  pink: { licht: { accent: '#be185d', tekst: '#ffffff', zacht: '#fce7f3' }, donker: { accent: '#f9a8d4', tekst: '#10161c', zacht: '#50223a' } },
  amber: { licht: { accent: '#92400e', tekst: '#ffffff', zacht: '#fef3c7' }, donker: { accent: '#fcd34d', tekst: '#10161c', zacht: '#4a3410' } },
  // ACCENT-001: вісім «улюблених відтінків» меню облікового запису (основа — ACCENT_KLEUREN, затемнено/висвітлено до тих самих порогів контрасту).
  blauw: { licht: { accent: '#1a5fd6', tekst: '#ffffff', zacht: '#dfe9f9' }, donker: { accent: '#7aa7ff', tekst: '#10161c', zacht: '#2f3e57' } },
  hemel: { licht: { accent: '#0279b4', tekst: '#ffffff', zacht: '#dcedf6' }, donker: { accent: '#67e8f9', tekst: '#10161c', zacht: '#2b4c55' } },
  teal: { licht: { accent: '#0f766e', tekst: '#ffffff', zacht: '#ddeceb' }, donker: { accent: '#5eead4', tekst: '#10161c', zacht: '#294c4d' } },
  groen: { licht: { accent: '#15803d', tekst: '#ffffff', zacht: '#deede4' }, donker: { accent: '#4ade80', tekst: '#10161c', zacht: '#254a3b' } },
  oranje: { licht: { accent: '#b8530b', tekst: '#ffffff', zacht: '#f6e7dd' }, donker: { accent: '#fdba74', tekst: '#10161c', zacht: '#4c4238' } },
  roze: { licht: { accent: '#be185d', tekst: '#ffffff', zacht: '#f6dfe8' }, donker: { accent: '#f9a8d4', tekst: '#10161c', zacht: '#4b3e4d' } },
  indigo: { licht: { accent: '#4f46e5', tekst: '#ffffff', zacht: '#e6e5fb' }, donker: { accent: '#a5b4fc', tekst: '#10161c', zacht: '#394156' } },
  bruin: { licht: { accent: '#8b5a2b', tekst: '#ffffff', zacht: '#efe8e1' }, donker: { accent: '#d6b48f', tekst: '#10161c', zacht: '#43413e' } },
};

/** ACCENT-001: ті самі відтінки, що в меню облікового запису; «pink» і «amber» (давні, майже однакові з «Малиновим» і «Бурштиновим»)
 *  показуються, лише поки обрані. Dezelfde tinten als in het accountmenu; oude tinten alleen zolang ze gekozen zijn. */
export const ACCENT_KEUZES: readonly UiterlijkAccent[] = ['violet', 'cyan', 'blauw', 'hemel', 'teal', 'groen', 'oranje', 'roze', 'indigo', 'bruin'];

/** ACCENT-001: непрозорість підкладки блоків за повзунком прозорості (0 — суцільні; 100 — 30 %, нижче текст гірше читається). */
export const blokDekking = (transparantie: number | undefined): number => {
  const t = typeof transparantie === 'number' && Number.isFinite(transparantie) ? Math.max(0, Math.min(100, transparantie)) : 0;
  return Math.round((1 - t * 0.007) * 1000) / 1000;
};
/** Чи просить система менше прозорості (prefers-reduced-transparency) — тоді прозорий режим не вмикається. */
export function minderTransparantie(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-transparency: reduce)').matches; } catch { return false; }
}

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
  // ACCENT-001: прозорі блоки — атрибут і змінна непрозорості; системне «зменшити прозорість» має перевагу.
  const t = typeof w.transparantie === 'number' && w.transparantie > 0 && !minderTransparantie() ? Math.min(100, Math.round(w.transparantie)) : 0;
  if (t) { if (root.dataset.transparantie !== 'aan') root.dataset.transparantie = 'aan'; root.style.setProperty('--blok-dekking', String(blokDekking(t))); }
  else { if (root.dataset.transparantie !== undefined) delete root.dataset.transparantie; root.style.removeProperty('--blok-dekking'); }
  const e = typeof w.effecten === 'number' && Number.isFinite(w.effecten) ? Math.max(0, Math.min(100, Math.round(w.effecten))) : UITERLIJK_EFFECTEN_STANDAARD;
  if (e === UITERLIJK_EFFECTEN_STANDAARD) root.style.removeProperty('--effect-sterkte');
  else root.style.setProperty('--effect-sterkte', String(e / 100));
}
