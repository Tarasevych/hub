// Kleurwaarden van de paletten «Чистий» en «Кольоровий» (per sectie), als echte hex-waarden zodat de eenheidstest het contrast
// kan nameten (WCAG AA). Grifel en violet gebruiken de bestaande waarden (canoniek-omlijsting.css). Uit deze tabel worden
// src/thema/paletten.css en de opstartregels in index.html gemaakt (scripts/thema-css.mjs); de test bewaakt dat ze gelijk blijven.
import { ACCENT_KLEUREN, DIENST_ACCENT } from '../../shared/menu-model';

export const SECTIES = ['hub', 'ai', 'mail', 'cloud', 'github', 'huis', 'identity', 'api', 'admin', 'mcp'] as const;
export type Sectie = typeof SECTIES[number];
export type Waarden = { bg: string; panel: string; surface: string; surface2: string; line: string; text: string; muted: string; faint: string; accent: string; accentText: string; accentSoft: string };

const hex = (h: string) => { const v = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
const naarHex = (c: number[]) => `#${c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
/** a met aandeel t over b gelegd. */
export const meng = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return naarHex(x.map((v, i) => v * t + y[i] * (1 - t))); };
const lum = (h: string) => { const [r, g, b] = hex(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** Donkerder/lichter tot het contrast tegen `tegen` minstens `min` is (zelfde tint). */
const totContrast = (kleur: string, tegen: string, min: number, richting: '#000000' | '#ffffff') => { let k = kleur; for (let i = 0; i < 40 && contrast(k, tegen) < min; i++) k = meng(richting, k, 0.06); return k; };

export const PUUR: { licht: Waarden; donker: Waarden } = {
  licht: { bg: '#ffffff', panel: '#ffffff', surface: '#f5f5f5', surface2: '#ebebeb', line: '#d4d4d4', text: '#000000', muted: '#404040', faint: '#595959', accent: '#111111', accentText: '#ffffff', accentSoft: '#eeeeee' },
  donker: { bg: '#000000', panel: '#000000', surface: '#0d0d0d', surface2: '#1a1a1a', line: '#333333', text: '#ffffff', muted: '#c2c2c2', faint: '#8f8f8f', accent: '#ffffff', accentText: '#000000', accentSoft: '#1f1f1f' },
};

export function kleurWaarden(s: Sectie): { licht: Waarden; donker: Waarden } {
  const k = ACCENT_KLEUREN[DIENST_ACCENT[s]];
  const L = k.licht.hoofd, D = k.donker.hoofd;
  const bgL = meng(L, '#f7f8fa', 0.05), panelL = meng(L, '#ffffff', 0.02);
  const accentL = totContrast(totContrast(L, '#ffffff', 4.6, '#000000'), bgL, 4.6, '#000000');
  const softL = meng(L, '#ffffff', 0.14);
  const bgD = meng(D, '#14181d', 0.05), panelD = meng(D, '#20262d', 0.06);
  const softD = meng(D, '#20262d', 0.2);
  return {
    licht: { bg: bgL, panel: panelL, surface: meng(L, '#f1f3f5', 0.06), surface2: meng(L, '#e7ebef', 0.1), line: meng(L, '#d5dbe1', 0.16), text: '#17212b', muted: '#4b5563', faint: '#5f6873', accent: totContrast(accentL, softL, 4.6, '#000000'), accentText: '#ffffff', accentSoft: softL },
    donker: { bg: bgD, panel: panelD, surface: meng(D, '#29313a', 0.08), surface2: meng(D, '#35404b', 0.1), line: meng(D, '#46515c', 0.14), text: '#f3f6f8', muted: '#c3cbd5', faint: '#a3aeb9', accent: totContrast(D, softD, 4.6, '#ffffff'), accentText: '#10161c', accentSoft: softD },
  };
}

const vars = (w: Waarden) => `--bg:${w.bg};--panel:${w.panel};--surface:${w.surface};--surface2:${w.surface2};--line:${w.line};--text:${w.text};--muted:${w.muted};--faint:${w.faint};--accent:${w.accent};--accentText:${w.accentText};--accent-soft:${w.accentSoft}`;
const boot = (w: Waarden) => `--boot-bg:${w.bg};--boot-panel:${w.panel};--boot-line:${w.line};--boot-text:${w.text};--boot-muted:${w.muted};--boot-accent:${w.accent}`;

/** Regels voor de app (overschrijven de thema-variabelen; html.palet-… weegt zwaarder dan .canonical-chrome.theme-…). */
export function paletCss(): string {
  const r: string[] = ['/* GEGENEREERD door scripts/thema-css.mjs uit src/thema/paletten.ts — niet met de hand wijzigen. */'];
  r.push(`html.palet-puur.theme-light,html.palet-puur .theme-light{${vars(PUUR.licht)};--shadow:rgba(0,0,0,.08)}`);
  r.push(`html.palet-puur.theme-dark,html.palet-puur .theme-dark{${vars(PUUR.donker)};--shadow:rgba(255,255,255,.06)}`);
  for (const s of SECTIES) {
    const w = kleurWaarden(s), sel = `html.palet-kleur[data-presentation-service="${s}"]`;
    r.push(`${sel}.theme-light,${sel} .theme-light{${vars(w.licht)}}`);
    r.push(`${sel}.theme-dark,${sel} .theme-dark{${vars(w.donker)}}`);
  }
  return `${r.join('\n')}\n`;
}
/** Regels voor het opstartscherm (index.html), zodat het eerste beeld al het juiste palet heeft. */
export function bootCss(): string {
  const r = [`html.palet-puur.theme-light{${boot(PUUR.licht)}}`, `html.palet-puur.theme-dark{${boot(PUUR.donker)}}`];
  for (const s of SECTIES) { const w = kleurWaarden(s), sel = `html.palet-kleur[data-presentation-service="${s}"]`; r.push(`${sel}.theme-light{${boot(w.licht)}}`, `${sel}.theme-dark{${boot(w.donker)}}`); }
  return r.join('');
}
