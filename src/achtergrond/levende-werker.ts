// ACHTERGROND-001: окремий потік для «Живого фону». Малює на OffscreenCanvas, тож основний потік (кліки, прокрутка, React) не платить
// за кадри нічого. Час іде лише поки фон видимий: після паузи плями продовжують з того самого місця, без стрибка.
// Eigen thread voor de levende achtergrond: tekent op een OffscreenCanvas, de hoofdthread betaalt niets per beeld.
import { polotno, teken, type Plan } from './levende-kern';

type Bericht =
  | { soort: 'start'; doek: OffscreenCanvas; plan: Plan; w: number; h: number; t: number; loopt: boolean }
  | { soort: 'plan'; plan: Plan }
  | { soort: 'maat'; w: number; h: number }
  | { soort: 'loop'; loopt: boolean };

const ctxScope = self as unknown as { requestAnimationFrame?: (f: (t: number) => void) => number; postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent<Bericht>) => void) | null };
let doek: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let plan: Plan | null = null;
let vw = 0, vh = 0, tijd = 0, vorige = 0, loopt = false, gepland = false, laatsteBeeld = 0;
let meetSom = 0, meetN = 0, meetVan = 0;

const volgende = (f: (t: number) => void) => (ctxScope.requestAnimationFrame ? ctxScope.requestAnimationFrame(f) : setTimeout(() => f(performance.now()), 16));

function maat() {
  if (!doek || !plan) return;
  const p = polotno(vw, vh, plan);
  if (doek.width !== p.w) doek.width = p.w;
  if (doek.height !== p.h) doek.height = p.h;
}
function beeld() {
  if (!ctx || !doek || !plan) return;
  const a = performance.now();
  teken(ctx, doek.width, doek.height, tijd, plan);
  meetSom += performance.now() - a; meetN += 1;
  if (a - meetVan > 4000) { ctxScope.postMessage({ soort: 'meting', ms: meetN ? meetSom / meetN : 0, n: meetN }); meetSom = 0; meetN = 0; meetVan = a; }
}
function lus(nu: number) {
  gepland = false;
  if (!loopt || !plan) { vorige = 0; return; }
  const stap = 1000 / Math.max(1, Math.min(plan.fps, 45));
  if (nu - laatsteBeeld >= stap - 2) {
    tijd += Math.min(0.25, Math.max(0, (nu - (vorige || nu)) / 1000));
    vorige = nu; laatsteBeeld = nu;
    beeld();
  }
  plannen();
}
function plannen() { if (!gepland && loopt) { gepland = true; volgende(lus); } }

ctxScope.onmessage = (e) => {
  const m = e.data;
  if (m.soort === 'start') {
    doek = m.doek; ctx = doek.getContext('2d', { alpha: true }) as OffscreenCanvasRenderingContext2D | null;
    plan = m.plan; vw = m.w; vh = m.h; tijd = m.t; loopt = m.loopt; vorige = 0; meetVan = performance.now();
    maat(); beeld(); plannen();
  } else if (m.soort === 'plan') { plan = m.plan; maat(); beeld(); }
  else if (m.soort === 'maat') { vw = m.w; vh = m.h; maat(); beeld(); }
  else if (m.soort === 'loop') { loopt = m.loopt; vorige = 0; if (loopt) plannen(); else ctxScope.postMessage({ soort: 'tijd', t: tijd }); }
};
