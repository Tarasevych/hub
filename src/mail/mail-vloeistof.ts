// MAILBG-002 · М'які мінливі зграї, хвилі від дотику та короткочасне малювання.
// Геометрія без гострих кутів; виняток — справжні обриси емблем.

export type VloeiPunt = { x: number; y: number };
export type LogoPunt = VloeiPunt & { kleur: string };

const GULDEN_HOEK = Math.PI * (3 - Math.sqrt(5));
const begrens = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Різні зграї мандрують, сходяться, розтікаються та ніколи не повторюють обрис точно. */
export function vloeibaarDoel(i: number, aantal: number, tijd: number, breedte: number, hoogte: number, fase = 0): VloeiPunt {
  const groepen = breedte < 580 ? 3 : 5;
  const groep = i % groepen, volg = Math.floor(i / groepen);
  const binnen = (volg + .5) / Math.max(1, Math.ceil(aantal / groepen));
  const hoek = volg * GULDEN_HOEK + groep * 1.1 + tijd * .035;
  const samensmelten = (1 + Math.cos(tijd * .31 + groep * .6)) * .5;
  const spreiding = 1 - .45 * samensmelten;
  const straal = Math.min(breedte * .34, hoogte * .29, 220) * Math.sqrt(binnen) * spreiding;
  const vervorming = 1 + .22 * Math.sin(3 * hoek + tijd * .37 + fase) + .1 * Math.sin(5 * hoek - tijd * .19);
  const centrumX = breedte * (.50 + .36 * Math.sin(tijd * .15 + groep * 2.4) * (1 - samensmelten * .7));
  const centrumY = hoogte * (.55 + .27 * Math.cos(tijd * .13 + groep * 1.57) * (1 - samensmelten * .7));
  return {
    x: begrens(centrumX + Math.cos(hoek) * straal * vervorming, 4, Math.max(4, breedte - 4)),
    y: begrens(centrumY + Math.sin(hoek) * straal * vervorming * .8, 4, Math.max(4, hoogte - 4)),
  };
}

/** У ході письма значки самі утворюють лінію руки, а потім знову розтікаються. */
export function schrijfDoel(i: number, aantal: number, streek: readonly VloeiPunt[], breedte: number): VloeiPunt | null {
  if (streek.length < 2) return null;
  const plaats = Math.min(streek.length - 1, Math.floor(i / Math.max(1, aantal) * streek.length));
  const punt = streek[plaats];
  const spreiding = Math.min(10, breedte * .018);
  const hoek = i * GULDEN_HOEK;
  return { x: punt.x + Math.cos(hoek) * spreiding * (i % 3) / 3, y: punt.y + Math.sin(hoek) * spreiding * (i % 3) / 3 };
}

/** Дотик створює хвилю: її сила найбільша поблизу пальця і згасає до краю. */
export function golfImpuls(punt: VloeiPunt, aanraking: VloeiPunt, straal = 160): VloeiPunt {
  const dx = punt.x - aanraking.x, dy = punt.y - aanraking.y;
  const afstand = Math.hypot(dx, dy);
  if (afstand >= straal || afstand < .001) return { x: 0, y: 0 };
  const kracht = 12 * (1 - afstand / straal) ** 2;
  return { x: dx / afstand * kracht, y: dy / afstand * kracht };
}

/** Лише один показ на місцеву календарну добу, навіть після оновлення сторінки. */
export function dagSleutel(datum: Date): string {
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`;
}
