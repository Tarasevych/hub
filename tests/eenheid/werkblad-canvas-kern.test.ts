// Eenheidstests Werkblad v3 — canvaskern (src/werkblad/canvas/kern.ts). Puur, geen DB nodig.
// Draaien: node scripts/eenheidstests.mjs werkblad-canvas
import type { CanvasLayout, DesktopEntry } from '../../shared/werkblad-v3-types';
import * as K from '../../src/werkblad/canvas/kern';

const res: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { res.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const it = (id: string, x: number, y: number, w = 100, h = 80, z = 1, extra: Partial<DesktopEntry> = {}): DesktopEntry => ({ instanceId: id, itemId: `svc:${id}`, kind: 'shortcut', x, y, w, h, z, ...extra });
const L = (mode: CanvasLayout['mode'], items: DesktopEntry[]): CanvasLayout => ({ mode, canvasWidth: 1280, canvasHeight: 800, items });
const lim: K.LimietenFn = (id) => (id === 'svc:w' ? { minW: 160, minH: 120, maxW: 600, maxH: 400 } : { minW: 48, minH: 48, maxW: 800, maxH: 800 });
const j = (x: unknown) => JSON.stringify(x);

export async function main() {
  const vrij = L('free', [it('a', 100, 100), it('b', 400, 100, 100, 80, 2)]);
  const bv = K.beleidVoor(vrij);
  check('beleid free: overlap toegestaan, geen raster', bv.overlap && !bv.snap);
  check('beleid snap: raster + geen overlap', (() => { const b = K.beleidVoor(L('snap', [])); return b.snap && !b.overlap; })());
  check('beleid overschrijfbaar per prop', K.beleidVoor(vrij, { overlap: false, snap: true, raster: 16 }).raster === 16);

  // Exact x/y slepen
  let g = K.startGebaar(vrij, 'a', 150, 140)!;
  g = K.beweeg(g, vrij, 150 + 237, 140 + 311, bv, lim);
  let e = K.eindGebaar(g, vrij, bv);
  check('slepen: exact (x,y) = (337,411), geen raster', e.gewijzigd && j(K.rechthoek(K.zoek(e.layout, 'a')!)) === j({ x: 337, y: 411, w: 100, h: 80 }));
  check('slepen: buur onaangeroerd (geen auto-compactie/herschikking)', j(K.zoek(e.layout, 'b')) === j(K.zoek(vrij, 'b')));
  // Commit uit synchrone toestand: tussenliggende beweeg-stappen tellen niet, alleen de laatste
  let g2 = K.startGebaar(vrij, 'a', 0, 0)!;
  for (const p of [[10, 10], [50, 20], [500, 30], [33, 44]]) g2 = K.beweeg(g2, vrij, p[0], p[1], bv);
  check('één atomaire commit uit laatste synchrone toestand', K.zoek(K.eindGebaar(g2, vrij, bv).layout, 'a')!.x === 133);
  check('onveranderd gebaar → gewijzigd=false (geen opslag)', !K.eindGebaar(K.startGebaar(vrij, 'a', 5, 5)!, vrij, bv).gewijzigd);
  check('Escape/pointercancel: indeling zelf is nooit gemuteerd', K.zoek(vrij, 'a')!.x === 100);

  // Klemmen
  g = K.beweeg(K.startGebaar(vrij, 'a', 0, 0)!, vrij, 5000, -5000, bv);
  check('klemmen: niet buiten rechter-/bovenrand', j(g.live) === j({ x: 1180, y: 0, w: 100, h: 80 }));
  g = K.beweeg(K.startGebaar(vrij, 'a', 0, 0)!, vrij, -500, 2000, bv);
  e = K.eindGebaar(g, vrij, bv);
  check('naar beneden groeit het canvas mee (niets verborgen)', g.live.x === 0 && e.layout.canvasHeight >= 2100 + 80, String(e.layout.canvasHeight));

  // Formaat alle randen
  const w = L('free', [it('w', 300, 300, 200, 150, 1, { itemId: 'svc:w', kind: 'widget' })]);
  const fm = (rand: K.Rand, dx: number, dy: number) => K.rechthoek(K.zoek(K.eindGebaar(K.beweeg(K.startGebaar(w, 'w', 0, 0, rand)!, w, dx, dy, bv, lim), w, bv).layout, 'w')!);
  const verwacht: Record<K.Rand, [number, number, K.Rect]> = {
    e: [37, 99, { x: 300, y: 300, w: 237, h: 150 }], s: [99, 13, { x: 300, y: 300, w: 200, h: 163 }],
    w: [-21, 5, { x: 279, y: 300, w: 221, h: 150 }], n: [5, -17, { x: 300, y: 283, w: 200, h: 167 }],
    se: [10, 20, { x: 300, y: 300, w: 210, h: 170 }], nw: [-10, -20, { x: 290, y: 280, w: 210, h: 170 }],
    ne: [10, -20, { x: 300, y: 280, w: 210, h: 170 }], sw: [-10, 20, { x: 290, y: 300, w: 210, h: 170 }],
  };
  for (const r of K.RANDEN) check(`formaat rand ${r}: 1-px precisie, geen 96-px stap`, j(fm(r, verwacht[r][0], verwacht[r][1])) === j(verwacht[r][2]), j(fm(r, verwacht[r][0], verwacht[r][1])));
  check('formaat: min uit limieten (160×120)', j(fm('se', -500, -500)) === j({ x: 300, y: 300, w: 160, h: 120 }));
  check('formaat: max uit limieten (600×400)', j(fm('se', 5000, 5000)) === j({ x: 300, y: 300, w: 600, h: 400 }));
  check('formaat nw: rechter-onderhoek blijft vast bij min', (() => { const r = fm('nw', 500, 500); return r.x + r.w === 500 && r.y + r.h === 450; })());
  check('formaat w: niet voorbij linkerrand canvas', fm('w', -1000, 0).x === 0);
  check('vergrendeld item: geen gebaar', K.startGebaar(vervangLock(w), 'w', 0, 0) === null);

  // Raster
  const s = L('snap', [it('a', 100, 100)]); const bs = K.beleidVoor(s);
  e = K.eindGebaar(K.beweeg(K.startGebaar(s, 'a', 0, 0)!, s, 13, 21, bs), s, bs);
  check('raster aan: (113,121) → (112,120)', j(K.rechthoek(K.zoek(e.layout, 'a')!)) === j({ x: 112, y: 120, w: 100, h: 80 }));

  // Overlapbeleid
  const vm = L('flow', [it('a', 100, 100), it('b', 300, 100)]); const bvm = K.beleidVoor(vm);
  g = K.beweeg(K.startGebaar(vm, 'a', 0, 0)!, vm, 190, 0, bvm);
  check('vermijden: live volgt cursor (290,100)', g.live.x === 290);
  check('vermijden: doel = dichtstbijzijnde vrije plek, niet op buur', !!g.doel && !K.overlapt(g.doel, { x: 300, y: 100, w: 100, h: 80 }), j(g.doel));
  e = K.eindGebaar(g, vm, bvm);
  check('vermijden: buur b schuift NIET', j(K.zoek(e.layout, 'b')) === j(K.zoek(vm, 'b')));
  const fz = K.beweeg(K.startGebaar(vm, 'a', 0, 0, 'e')!, vm, 250, 0, bvm, lim);
  check('vermijden: formaat tegen buur → ongeldig (veert terug)', fz.doel === null && !K.eindGebaar(fz, vm, bvm).gewijzigd);
  e = K.eindGebaar(K.beweeg(K.startGebaar(vrij, 'a', 0, 0)!, vrij, 320, 10, bv), vrij, bv);
  check('free: overlap toegestaan, gesleepte tegel komt bovenop', K.zoek(e.layout, 'a')!.x === 420 && K.zoek(e.layout, 'a')!.z > K.zoek(e.layout, 'b')!.z);

  // z-volgorde
  const zl = L('free', [it('a', 0, 0, 100, 100, 1), it('b', 50, 50, 100, 100, 2), it('c', 500, 500, 100, 100, 3)]);
  check('naarVoorgrond: hoogste z', K.zoek(K.naarVoorgrond(zl, 'a'), 'a')!.z === 3);
  check('stapNaarVoren: wisselt met overlappende buur', (() => { const n = K.stapNaarVoren(zl, 'a'); return K.zoek(n, 'a')!.z === 2 && K.zoek(n, 'b')!.z === 1; })());
  check('naarAchtergrond: laagste', K.zoek(K.naarAchtergrond(zl, 'c'), 'c')!.z === 1);
  check('normaliseerZ: 1..n zonder gaten', j(K.normaliseerZ(L('free', [it('a', 0, 0, 10, 10, 7), it('b', 0, 0, 10, 10, -3)])).items.map((x) => x.z)) === '[2,1]');
  check('vergrendelen heen en terug', K.zoek(K.wisselVergrendeling(K.wisselVergrendeling(zl, 'a'), 'a'), 'a')!.locked === undefined && K.zoek(K.wisselVergrendeling(zl, 'a'), 'a')!.locked === true);
  check('verwijderen: map met inhoud weg', K.verwijder(L('free', [it('m', 0, 0, 10, 10, 1, { kind: 'folder' }), it('k', 0, 0, 10, 10, 1, { parent: 'm' }), it('x', 0, 0)]), 'm').items.length === 1);

  // Toetsenbord
  const kb = K.toetsStap(vrij, 'a', { key: 'ArrowRight' }, bv)!;
  check('toets → : +8 px', K.zoek(kb.layout, 'a')!.x === 108);
  check('Ctrl+toets ↓ : +1 px', K.zoek(K.toetsStap(vrij, 'a', { key: 'ArrowDown', ctrl: true }, bv)!.layout, 'a')!.y === 101);
  check('Shift+→ : breder, positie gelijk', (() => { const a = K.zoek(K.toetsStap(vrij, 'a', { key: 'ArrowRight', shift: true }, bv, lim)!.layout, 'a')!; return a.w === 108 && a.x === 100; })());
  check('andere toets → null', K.toetsStap(vrij, 'a', { key: 'Enter' }, bv) === null);
  const kv = L('flow', [it('a', 100, 100), it('b', 204, 100)]);
  check('toets bij botsing: springt over buur heen', (() => { const r = K.toetsStap(kv, 'a', { key: 'ArrowRight' }, K.beleidVoor(kv))!; const a = K.zoek(r.layout, 'a')!; return r.gewijzigd && a.x >= 304; })());
  check('«Розмістити тут…» plaatst op (640,480)', j(K.rechthoek(K.zoek(K.plaatsOp(vrij, 'a', 640, 480, bv).layout, 'a')!)) === j({ x: 640, y: 480, w: 100, h: 80 }));

  // Geschiedenis
  let h = K.legeGeschiedenis(); const v1 = K.toetsStap(vrij, 'a', { key: 'ArrowRight' }, bv)!.layout;
  h = K.vastleggen(h, vrij);
  const u = K.ongedaan(h, v1)!; const r2 = K.opnieuw(u.h, u.layout)!;
  check('ongedaan → vorige, opnieuw → volgende', u.layout === vrij && r2.layout === v1 && !K.opnieuw(r2.h, r2.layout));
  check('nieuwe wijziging wist redo', K.vastleggen(u.h, vrij).toekomst.length === 0);
  check('geschiedenis begrensd op 50', (() => { let x = K.legeGeschiedenis(); for (let i = 0; i < 80; i++) x = K.vastleggen(x, vrij); return x.verleden.length === 50; })());

  // Apparaten
  check('klasse uit containerbreedte: 390/768/1280/1023/600', [390, 768, 1280, 1023, 600].map(K.apparaatVoorBreedte).join() === 'telefoon,tablet,computer,tablet,tablet');
  const pc = L('free', [it('a', 0, 0, 400, 200), it('b', 640, 0, 400, 200), it('w', 900, 600, 300, 200, 1, { itemId: 'svc:w' })]);
  const tel = K.aanpassenVanaf(pc, 390, lim);
  check('telefoon: alles binnen de breedte', tel.items.every((x) => x.x >= 0 && x.x + x.w <= 390), j(tel.items.map(K.rechthoek)));
  check('telefoon: geen overlap na aanpassen', tel.items.every((a) => tel.items.every((b) => a === b || !K.overlapt(K.rechthoek(a), K.rechthoek(b)))));
  check('telefoon: min-grenzen gerespecteerd', K.zoek(tel, 'w')!.w >= 160 && K.zoek(tel, 'w')!.h >= 120);
  check('telefoon: canvasHoogte dekt alle items', tel.items.every((x) => x.y + x.h <= tel.canvasHeight));
  check('tablet: proportioneel (x 640 → 384)', K.zoek(K.aanpassenVanaf(pc, 768, lim), 'b')!.x === 384);
  check('bron niet gemuteerd', K.zoek(pc, 'b')!.x === 640);
  check('schaal: containerbreedte/canvasbreedte (zoom 200% → 0,5)', K.schaalVoor(640, pc) === 0.5);
  check('teksten uk + nl compleet', Object.keys(K.TEKST.uk).sort().join() === Object.keys(K.TEKST.nl).sort().join());

  const fout = res.filter((r) => !r.ok).length;
  console.log(`werkblad-canvas-kern: ${res.length - fout}/${res.length} geslaagd`);
  return fout ? 1 : 0;
}
function vervangLock(l: CanvasLayout) { return K.vervang(l, 'w', { locked: true }); }
