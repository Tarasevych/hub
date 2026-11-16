// VELD-001 + ZWEVEND-001 (15.11.2026, знімки власника): висота поля робочого стола змінюється ручкою й кнопкою «Прибрати порожнє»,
// поза налаштуванням порожнього хвоста немає; спливні меню (вітрина «Живий робочий стіл», блоки полотна) завжди поверх.
// Draaien: node scripts/eenheidstests.mjs werkblad-veld-zwevend
import { readFileSync } from 'node:fs';
import type { CanvasLayout, DesktopEntry } from '../../shared/werkblad-v3-types';
import { WERKBLAD_V3_LIMIETEN } from '../../shared/werkblad-v3-types';
import { normaliseerLaag } from '../../shared/werkblad-v3';
import * as K from '../../src/werkblad/canvas/kern';
import { zwevendePlek } from '../../src/platform/zwevend-menu';

const res: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { res.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const it = (id: string, x: number, y: number, w = 300, h = 200): DesktopEntry => ({ instanceId: id, itemId: `wdg:${id}`, kind: 'widget', x, y, w, h, z: 1 });
const L = (canvasHeight: number, items: DesktopEntry[]): CanvasLayout => ({ mode: 'free', canvasWidth: 1280, canvasHeight, items });

export async function main() {
  // ── Висота поля ──
  const eigenaar = L(1600, [it('a', 16, 16, 820, 120), it('b', 16, 152, 540, 300)]); // як у власника: блоки до 452, поле 1600
  check('inhoudHoogte = низ найнижчого блока + 24', K.inhoudHoogte(eigenaar) === 452 + 24, String(K.inhoudHoogte(eigenaar)));
  check('benodigdeHoogte (режим налаштування) поважає збережену висоту', K.benodigdeHoogte(eigenaar) === 1600);
  check('є порожній хвіст → кнопка «Прибрати порожнє» активна', K.heeftLegeStaart(eigenaar));
  const pas = K.veldPassend(eigenaar);
  check('«Прибрати порожнє» стискає поле впритул до блоків', pas.canvasHeight === 476 && K.benodigdeHoogte(pas) === 476, String(pas.canvasHeight));
  check('після стискання хвоста немає', !K.heeftLegeStaart(pas));
  check('повторне «Прибрати порожнє» нічого не змінює (той самий об’єкт → без зайвого збереження)', K.veldPassend(pas) === pas);
  check('блоки при цьому не рухаються', j(pas.items) === j(eigenaar.items));
  check('ручкою можна збільшити', K.zetVeldHoogte(pas, 900).canvasHeight === 900);
  check('ручкою не можна стиснути нижче блоків (нічого не ховається)', K.zetVeldHoogte(eigenaar, 100).canvasHeight === 476);
  check('ручкою не можна вийти за maxCanvas', K.zetVeldHoogte(eigenaar, 999999).canvasHeight === WERKBLAD_V3_LIMIETEN.maxCanvas);
  check('дробові пікселі округлюються', Number.isInteger(K.zetVeldHoogte(eigenaar, 777.6).canvasHeight));
  const leeg = L(1600, []);
  check('порожній стіл: мінімум VELD_MIN (= нижня межа сервера 200)', K.veldPassend(leeg).canvasHeight === K.VELD_MIN && K.VELD_MIN === 200);
  const kind = L(1600, [it('a', 0, 0), { ...it('k', 0, 3000), parent: 'a' }]);
  check('ярлик у теці (parent) не тримає поле довгим', K.veldPassend(kind).canvasHeight === 224, String(K.veldPassend(kind).canvasHeight));
  // Сервер приймає стиснуте поле (раніше normaliseerLaag лише піднімала висоту до блоків — це лишається, нижче блоків не дасть)
  const srv = normaliseerLaag(pas, 'computer', { ruimte: 'prive', itemToegestaan: () => true });
  check('сервер зберігає стиснуту висоту як є', srv.canvasHeight === 476, String(srv.canvasHeight));
  const srv2 = normaliseerLaag({ ...pas, canvasHeight: 50 }, 'computer', { ruimte: 'prive', itemToegestaan: () => true });
  check('сервер не дає поля нижче блоків чи 200', srv2.canvasHeight >= 452, String(srv2.canvasHeight));
  // Перетягування блока вниз і далі збільшує поле (поведінка «рости за блоком» не зламана)
  const g0 = K.startGebaar(pas, 'b', 100, 200)!;
  const g1 = K.beweeg(g0, pas, 100, 900, K.beleidVoor(pas));
  const e = K.eindGebaar(g1, pas, K.beleidVoor(pas));
  check('блок, перетягнутий нижче краю, розширює поле', e.layout.canvasHeight >= (K.zoek(e.layout, 'b')!.y + 300 + 24), String(e.layout.canvasHeight));
  check('тексти ручки uk + nl однакові за ключами', j(Object.keys(K.TEKST.uk.veld).sort()) === j(Object.keys(K.TEKST.nl.veld).sort()));
  check('підказка ручки пояснює наслідки (не лише назву)', K.TEKST.uk.veld.tip.length > 120 && /нічого не сховається/.test(K.TEKST.uk.veld.tip) && /niets/.test(K.TEKST.nl.veld.tip));

  // Canvas.tsx: поза налаштуванням — inhoudHoogte, у налаштуванні — benodigdeHoogte; ручка лише в режимі налаштування
  const canvas = readFileSync('src/werkblad/canvas/Canvas.tsx', 'utf8');
  check('Canvas: висота поза налаштуванням = inhoudHoogte (без хвоста)', /p\.editMode \? K\.benodigdeHoogte\(werk\) : K\.inhoudHoogte\(werk\)/.test(canvas));
  check('Canvas: ручка — role=separator з aria-valuenow і підказкою', /role="separator"/.test(canvas) && /aria-valuenow=/.test(canvas) && /title=\{T\.veld\.tip\}/.test(canvas));
  check('Canvas: ручка відмальовується лише в режимі налаштування', /\{p\.editMode && \(\s*<div className=\{`wbc-veld/.test(canvas));
  const css = readFileSync('src/werkblad/canvas/canvas.css', 'utf8');
  check('CSS: ручка не прокручує сторінку на телефоні (touch-action:none) і має тикову зону 44 px', /\.wbc-veld-greep\{[^}]*touch-action:none/.test(css) && /\.wbc-veld-greep::before\{[^}]*height:44px/.test(css));
  check('CSS: блок із відкритим меню піднімається над сусідами й не обрізає меню', /\.wbc-item:is\(:has\(\[aria-expanded="true"\]\),:has\(details\[open\]\)\)\{z-index:8050!important\}/.test(css)
    && /:is\(\.wbc-inhoud,\.wb-tegel\)\{overflow:visible!important\}/.test(css));
  check('CSS: стіл не обрізає меню найнижчого блока', /\.werkblad\.wb3:has\(\.wbc-item :is\(\[aria-expanded="true"\],details\[open\]\)\)\{overflow:visible\}/.test(readFileSync('src/werkblad/werkblad.css', 'utf8')));

  // ── Спливне меню поверх ──
  const knop = { left: 480, right: 518, top: 340, bottom: 378 };
  const p1 = zwevendePlek(knop, { width: 236, height: 100 }, 1440, 900);
  check('меню під кнопкою, праве вирівнювання', p1.top === 384 && p1.left === 518 - 236 && !p1.boven, j(p1));
  const p2 = zwevendePlek({ left: 480, right: 518, top: 820, bottom: 858 }, { width: 236, height: 100 }, 1440, 900);
  check('біля низу вікна меню відкривається вгору', p2.boven && p2.top === 820 - 6 - 100, j(p2));
  const p3 = zwevendePlek({ left: 4, right: 42, top: 100, bottom: 138 }, { width: 236, height: 100 }, 390, 844);
  check('на телефоні меню не виходить за лівий край', p3.left === 10, j(p3));
  const p4 = zwevendePlek({ left: 360, right: 380, top: 100, bottom: 138 }, { width: 236, height: 100 }, 390, 844, { uitlijning: 'begin' });
  check('і за правий край', p4.left + 236 <= 390 - 10, j(p4));
  const app = readFileSync('src/App.tsx', 'utf8');
  check('App: меню «⋯» у порталі (ZwevendPortaal) з класом zwevend-popover', /<ZwevendPortaal anker=\{sectieKnopRef\}><div ref=\{sectieLijstRef\} className='hub-sectie-menu-lijst zwevend-popover'/.test(app));
  check('App: клік у меню в порталі не закриває його як «поза меню»', /closest\?\.\('\[data-zwevend="hub-sectie"\]'\)/.test(app));
  const zcss = readFileSync('src/platform/zwevend-menu.css', 'utf8');
  check('CSS: zwevend-popover — position:fixed, висота в межах вікна', /\.zwevend-popover\{position:fixed!important;[^}]*max-height:calc\(100dvh - 20px\)/.test(zcss));
  const lijst = JSON.parse(readFileSync('scripts/plaatsing-vaste-elementen.json', 'utf8')) as { toegestaan: Array<{ sleutel: string }> };
  check('position:fixed погоджено в plaatsing-vaste-elementen (з причиною)', lijst.toegestaan.some((t) => t.sleutel === 'src/platform/zwevend-menu.css :: .zwevend-popover'));

  const fout = res.filter((r) => !r.ok).length;
  console.log(`werkblad-veld-zwevend: ${res.length - fout}/${res.length} geslaagd`);
  return fout ? 1 : 0;
}
const j = (x: unknown) => JSON.stringify(x);
