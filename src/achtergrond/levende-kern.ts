// ACHTERGROND-001: «Живий фон» — чиста математика й малювання, без React і без DOM-запитів (працює і в окремому потоці, і в основному).
// Плями малюються на ДУЖЕ малому полотні (≈1/8 розміру вікна), а браузер розтягує його на весь екран зі згладжуванням: так межі
// м'які без жодного filter: blur(), а один кадр коштує частки мілісекунди. Форми непропорційні (розтяг + поворот + бічна «лопать»),
// кольори повільно переливаються з відтінку у відтінок.
// Levende achtergrond: pure rekenkunde en tekenen op een klein canvas dat de browser zacht uitrekt (geen blur-filter nodig).
import { achtergrondVolledig, type AchtergrondKader, type AchtergrondKleuren, type AchtergrondOvergang, type UiterlijkAchtergrond } from '../../shared/uiterlijk';

export type Omgeving = {
  /** Світла тема сторінки (інші кольори й змішування). Lichte thema. */
  licht: boolean;
  /** Відтінок акцентного кольору теми, 0–360. Tint van het accent. */
  accentTint: number;
  /** Полегшений режим: телефон/планшет у стані «auto» або слабкий пристрій. Lichte modus. */
  zuinig: boolean;
};

export type Vlek = {
  bx: number; by: number; ax: number; ay: number; fx: number; fy: number; px: number; py: number;
  r: number; rek: number; rekF: number; rekP: number; draai: number; draaiF: number;
  lob: number; lobHoek: number; lobF: number;
  tint: number; tintBereik: number; tintF: number; tintP: number; adem: number; ademF: number;
};

export type Plan = {
  vlekken: Vlek[];
  snelheid: number;
  kleurSnelheid: number;
  doorlopend: boolean;
  licht: boolean;
  verzadiging: number;
  lichtheid: number;
  alfa: number;
  /** Кадрів на секунду. Beelden per seconde. */
  fps: number;
  /** У скільки разів полотно менше за вікно. Verkleining van het canvas. */
  schaal: number;
  /** Прозорість усього шару (0–1): інтенсивність. Dekking van de hele laag. */
  dekking: number;
};

export const KADER_FPS: Record<AchtergrondKader, number> = { zuinig: 15, normaal: 30, vloeiend: 60 };

/** Набори відтінків (зсуви від акценту для «thema», інакше абсолютні). Tintensets. */
const TINTEN: Record<AchtergrondKleuren, number[]> = {
  thema: [0, -34, 30, -58, 52, -16, 16, 72, -76, 40, -44, 88],
  aurora: [150, 268, 178, 300, 196, 132, 286, 166, 250, 210, 312, 120],
  zee: [192, 214, 176, 232, 204, 248, 186, 222, 168, 240, 198, 260],
  zonsondergang: [14, 334, 32, 350, 296, 22, 316, 42, 4, 280, 340, 26],
  regenboog: [0, 210, 60, 270, 120, 330, 30, 180, 90, 240, 150, 300],
};

/** Детермінований генератор (mulberry32): ті самі плями після зміни налаштувань — без стрибків. Vaste toevalsreeks. */
export function willekeur(zaad: number) {
  let a = zaad >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const tussen = (r: () => number, a: number, b: number) => a + (b - a) * r();

/** Із налаштувань і середовища — план малювання. Van instellingen naar een tekenplan. */
export function maakPlan(deel: Partial<UiterlijkAchtergrond> | undefined, omgeving: Omgeving, zaad = 20261115): Plan {
  const inst = achtergrondVolledig(deel);
  const r = willekeur(zaad);
  const maxAantal = omgeving.zuinig ? Math.min(inst.aantal, 4) : inst.aantal;
  const vorm = inst.vervorming / 100;
  const grootte = inst.grootte / 100;
  const tinten = TINTEN[inst.kleuren];
  const basisTint = inst.kleuren === 'thema' ? omgeving.accentTint : 0;
  const vlekken: Vlek[] = [];
  for (let i = 0; i < 12; i++) {
    // Усі 12 плям рахуються завжди (той самий порядок випадкових чисел), відбираються перші N: зміна кількості не перемішує решту.
    const v: Vlek = {
      // Розкидані від краю до краю, частина виходить за межі — фон без «рамки».
      bx: tussen(r, -0.08, 1.08), by: tussen(r, -0.08, 1.08),
      ax: tussen(r, 0.12, 0.42), ay: tussen(r, 0.1, 0.36),
      fx: tussen(r, 0.6, 1.4), fy: tussen(r, 0.5, 1.3), px: tussen(r, 0, Math.PI * 2), py: tussen(r, 0, Math.PI * 2),
      r: tussen(r, 0.24, 0.46) * grootte,
      rek: 1 + vorm * tussen(r, 0.35, 1.25), rekF: tussen(r, 0.3, 0.9), rekP: tussen(r, 0, Math.PI * 2),
      draai: tussen(r, 0, Math.PI), draaiF: tussen(r, -0.35, 0.35),
      lob: vorm * tussen(r, 0.25, 0.7), lobHoek: tussen(r, 0, Math.PI * 2), lobF: tussen(r, 0.2, 0.6),
      tint: basisTint + tinten[i % tinten.length], tintBereik: tussen(r, 18, 46), tintF: tussen(r, 0.5, 1.4), tintP: tussen(r, 0, Math.PI * 2),
      adem: tussen(r, 0.08, 0.18), ademF: tussen(r, 0.4, 1),
    };
    vlekken.push(v);
  }
  // Плавність: 0 → дуже повільно, 100 → жваво (експоненційна шкала). Tempo: exponentiële schaal.
  const snelheid = 0.035 * Math.pow(10, inst.tempo / 60);
  const kleurSnelheid = inst.kleurwissel <= 0 ? 0 : 0.02 * Math.pow(10, inst.kleurwissel / 55);
  const fps = Math.min(KADER_FPS[inst.kader], omgeving.zuinig ? 24 : 60);
  const dekkingMax = omgeving.licht ? 0.78 : 0.92;
  return {
    vlekken: vlekken.slice(0, maxAantal).map((v) => toepassenOvergang(v, inst.overgang)),
    snelheid, kleurSnelheid, doorlopend: inst.kleuren === 'regenboog',
    licht: omgeving.licht,
    verzadiging: omgeving.licht ? 70 : 62,
    lichtheid: omgeving.licht ? 72 : 58,
    alfa: omgeving.licht ? 0.6 : 0.78,
    fps,
    schaal: omgeving.zuinig ? 10 : 8,
    dekking: Math.round(dekkingMax * (inst.sterkte / 100) * 1000) / 1000,
  };
}

/** Характер руху: «golf» — хвилі по колу, «drift» — довгий дрейф від краю до краю, «adem» — плями майже на місці, але «дихають». */
function toepassenOvergang(v: Vlek, o: AchtergrondOvergang): Vlek {
  if (o === 'drift') return { ...v, ax: v.ax * 1.9, ay: v.ay * 1.7, fx: v.fx * 0.55, fy: v.fy * 0.6, adem: v.adem * 0.5 };
  if (o === 'adem') return { ...v, ax: v.ax * 0.35, ay: v.ay * 0.35, adem: v.adem * 3.2, ademF: v.ademF * 1.3 };
  return v;
}

/** Мінімальний інтерфейс 2D-контексту (і CanvasRenderingContext2D, і OffscreenCanvasRenderingContext2D). */
export type Ctx2D = {
  clearRect(x: number, y: number, w: number, h: number): void; save(): void; restore(): void;
  translate(x: number, y: number): void; rotate(a: number): void; scale(x: number, y: number): void;
  beginPath(): void; arc(x: number, y: number, r: number, a: number, b: number): void; fill(): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
  fillStyle: string | CanvasGradient | CanvasPattern; globalCompositeOperation: string;
};

const kleur = (tint: number, s: number, l: number, a: number) => `hsla(${((tint % 360) + 360) % 360},${s}%,${l}%,${a})`;

function ellips(ctx: Ctx2D, x: number, y: number, rad: number, sx: number, sy: number, hoek: number, tint: number, plan: Plan, kracht: number) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(hoek); ctx.scale(sx, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
  const a = plan.alfa * kracht;
  // Плавне згасання без чіткої межі: щільний центр → довгий м'який хвіст. Zachte afloop zonder rand.
  g.addColorStop(0, kleur(tint, plan.verzadiging, plan.lichtheid, a));
  g.addColorStop(0.38, kleur(tint + 6, plan.verzadiging, plan.lichtheid, a * 0.62));
  g.addColorStop(0.72, kleur(tint + 12, plan.verzadiging, plan.lichtheid, a * 0.2));
  g.addColorStop(1, kleur(tint + 16, plan.verzadiging, plan.lichtheid, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Один кадр. t — секунди «живого» часу (без пауз). Eén beeld; t in seconden. */
export function teken(ctx: Ctx2D, w: number, h: number, t: number, plan: Plan) {
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = plan.licht ? 'source-over' : 'screen';
  const m = Math.max(w, h), s = plan.snelheid, k = plan.kleurSnelheid;
  for (const v of plan.vlekken) {
    const ts = t * s;
    // Дві гармоніки на вісь — шлях не повторюється очевидно. Twee harmonischen per as.
    const x = (v.bx + v.ax * Math.sin(ts * v.fx + v.px) + v.ax * 0.35 * Math.sin(ts * v.fx * 2.3 + v.py)) * w;
    const y = (v.by + v.ay * Math.cos(ts * v.fy + v.py) + v.ay * 0.3 * Math.sin(ts * v.fy * 1.7 + v.px)) * h;
    const adem = 1 + v.adem * Math.sin(ts * v.ademF * 1.6 + v.px);
    const rad = v.r * m * adem;
    const rek = 1 + (v.rek - 1) * (0.65 + 0.35 * Math.sin(ts * v.rekF + v.rekP));
    const hoek = v.draai + ts * v.draaiF;
    const tint = v.tint + v.tintBereik * Math.sin(t * k * v.tintF + v.tintP) + (plan.doorlopend ? t * k * 14 : 0);
    ellips(ctx, x, y, rad, rek, 1 / Math.sqrt(rek), hoek, tint, plan, 1);
    if (v.lob > 0.02) {
      // Бічна «лопать» іншого відтінку робить форму неправильною й непропорційною. Zijlob: onregelmatige vorm.
      const lh = v.lobHoek + ts * v.lobF;
      const d = rad * (0.45 + v.lob * 0.5);
      ellips(ctx, x + Math.cos(lh) * d, y + Math.sin(lh) * d, rad * (0.5 + v.lob * 0.25), 1 / Math.sqrt(rek), rek, -hoek, tint + 28, plan, 0.75);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Розмір полотна для вікна w×h (CSS-пікселі). Canvasgrootte. */
export const polotno = (w: number, h: number, plan: Pick<Plan, 'schaal'>) => ({ w: Math.max(16, Math.ceil(w / plan.schaal)), h: Math.max(16, Math.ceil(h / plan.schaal)) });

/** Відтінок (0–360) із кольору rgb()/#rrggbb, як його нормалізує canvas. Tint uit een kleur. */
export function tintVan(kleurTekst: string, standaard = 262): number {
  const s = String(kleurTekst || '').trim();
  let r: number, g: number, b: number;
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
  if (hex) { const n = parseInt(hex[1], 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  else if (rgb) { r = +rgb[1]; g = +rgb[2]; b = +rgb[3]; }
  else return standaard;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 8) return standaard; // сірий акцент — беремо типовий фіолетово-синій. Grijs accent: standaardtint.
  let hTint: number;
  if (max === r) hTint = ((g - b) / d) % 6; else if (max === g) hTint = (b - r) / d + 2; else hTint = (r - g) / d + 4;
  return Math.round(((hTint * 60) + 360) % 360);
}
