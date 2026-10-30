// Kleurhulp voor tests (menu v2): WCAG-contrast en CIEDE2000-afstand tussen twee sRGB-kleuren ('#rrggbb' of 'rgb(r, g, b)').
const kanaal = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function rgb(k: string): [number, number, number] {
  const s = k.trim();
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
  const h = s.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}
export function luminantie(k: string) { const [r, g, b] = rgb(k).map(kanaal); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a: string, b: string) { const [x, y] = [luminantie(a), luminantie(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
export function lab(k: string): [number, number, number] {
  const [r, g, b] = rgb(k).map(kanaal);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
/** Kleurtoon (graden) en chroma in CIELCh. */
export function lch(k: string) { const [l, a, b] = lab(k); return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }; }
const rad = (d: number) => (d * Math.PI) / 180;
export function deltaE2000(k1: string, k2: string) {
  const [L1, a1, b1] = lab(k1), [L2, a2, b2] = lab(k2);
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = ((Math.atan2(b1, a1p) * 180) / Math.PI + 360) % 360, h2p = ((Math.atan2(b2, a2p) * 180) / Math.PI + 360) % 360;
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = h2p - h1p; if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2)), Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p; if (C1p * C2p !== 0) hb = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) / 2 : (h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2);
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb)) + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.2 * Math.cos(rad(4 * hb - 63));
  const dth = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T, Rt = -Math.sin(rad(2 * dth)) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}
export const ACHTERGROND = { licht: ['#ffffff', '#f7f8fa', '#f1f3f5', '#fffafd', '#f1e7f0'], donker: ['#20262d', '#14181d', '#29313a', '#2d1e2a', '#382633'] } as const;
