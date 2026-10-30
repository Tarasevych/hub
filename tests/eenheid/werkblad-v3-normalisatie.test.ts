// Werkblad v3 — zuivere normalisatie en de overzetting v2 → v3 (shared/werkblad-v3.ts). Geen database.
import { normaliseerLaag, normaliseerWerkbladV3, migreerV2NaarV3, vormKlopt, STANDAARD_CANVAS, configSchonen } from '../../shared/werkblad-v3';
import { plaatsen, normaliseerWerkblad } from '../../shared/werkblad-indeling';
import { WERKBLAD_V3_LIMIETEN as L } from '../../shared/werkblad-v3-types';
import { checker } from './hulp/nep-google';

const P = { ruimte: 'prive' as const }, T = { ruimte: 'technisch' as const };
const s = (v: unknown) => JSON.stringify(v);

export async function main(): Promise<number> {
  const { check, einde } = checker('werkblad-v3-normalisatie');
  // ---------------------------------------------------------------- vorm, onbekende velden, begrenzing
  const l = normaliseerLaag({ mode: 'free', canvasWidth: 1280, canvasHeight: 800, evil: 1, items: [
    { instanceId: 'a', itemId: 'svc:post', kind: 'shortcut', x: 10.6, y: 20.2, w: 80, h: 80, z: 5, onzin: '<script>', __proto__: { x: 1 } },
    { instanceId: 'b', itemId: 'wdg:agenda', kind: 'widget', x: -50, y: 99999, w: 99999, h: 3, z: 5 },
    { instanceId: 'c', itemId: 'svc:post', kind: 'widget', x: 0, y: 0, w: 50, h: 50, z: 1 },
    { instanceId: 'd', itemId: 'javascript:alert(1)', kind: 'shortcut', x: 0, y: 0, w: 50, h: 50, z: 1 },
    { instanceId: 'e', itemId: 'pg:x', kind: 'shortcut', x: NaN, y: Infinity, w: 'x', h: null, z: 0 },
  ] }, 'computer', P);
  check('onbekende velden vallen weg (layout en item)', !('evil' in l) && !('onzin' in l.items[0]));
  check('kind/voorvoegsel moet kloppen; vrije URL als itemId valt weg', l.items.map((i) => i.instanceId).join(',') === 'a,b,e', l.items.map((i) => i.instanceId).join(','));
  check('x/y afgerond op hele px', l.items[0].x === 11 && l.items[0].y === 20);
  const b = l.items[1];
  check('begrenzing: w ≤ canvasbreedte, h ≥ minAfm, x ≥ 0, binnen canvas', b.w === 1280 && b.h === L.minAfm && b.x === 0 && b.y === L.maxCanvas - b.h, s(b));
  check('NaN/Infinity/tekst → veilige standaard (0 / minAfm)', l.items[2].x === 0 && l.items[2].y === 0 && l.items[2].w === L.minAfm);
  check('canvasHoogte groeit mee met het laagste object (≤ maxCanvas)', l.canvasHeight === Math.min(L.maxCanvas, b.y + b.h));
  check('z uniek 1..n in stapelvolgorde (z, dan invoer)', l.items.map((i) => i.z).sort().join(',') === '1,2,3' && l.items[2].z === 1 && l.items[0].z === 2 && l.items[1].z === 3, s(l.items.map((i) => i.z)));
  check('idempotent: tweemaal normaliseren = eenmaal', s(normaliseerLaag(l, 'computer', P)) === s(l));
  check('vormKlopt: widget⇔wdg:, map⇒map:/usr:, ярлик⇒svc/pg/cmd/usr', vormKlopt('wdg:x', 'widget') && !vormKlopt('wdg:x', 'shortcut') && vormKlopt('map:x', 'folder') && !vormKlopt('svc:x', 'folder') && vormKlopt('cmd:mail.opstellen', 'shortcut') && !vormKlopt('SVC:x', 'shortcut'));

  // ---------------------------------------------------------------- dubbele ids, mappen, overrides, config
  const d = normaliseerLaag({ items: [
    { instanceId: 'x', itemId: 'map:werk', kind: 'folder', x: 0, y: 0, w: 80, h: 80, z: 1, parent: 'x' },
    { instanceId: 'x', itemId: 'svc:post', kind: 'shortcut', x: 0, y: 0, w: 80, h: 80, z: 2, parent: 'x' },
    { instanceId: 'y', itemId: 'svc:agenda', kind: 'shortcut', x: 0, y: 0, w: 80, h: 80, z: 3, parent: 'bestaat-niet' },
    { instanceId: 'z', itemId: 'svc:taken', kind: 'shortcut', x: 0, y: 0, w: 80, h: 80, z: 4, parent: 'x', titleOverride: '  <b>Мої\u0000 задачі</b> \u202e ', iconOverride: 'lucide:list' },
    { instanceId: 'w', itemId: 'wdg:agenda', kind: 'widget', x: 0, y: 0, w: 80, h: 80, z: 5, parent: 'x', iconOverride: 'https://kwaad.test/x.svg' },
    { instanceId: 'i-1', itemId: 'svc:zoek', kind: 'shortcut', x: 0, y: 0, w: 80, h: 80, z: 6 },
  ] }, 'telefoon', P);
  const ids = d.items.map((i) => i.instanceId);
  check('dubbele instanceId krijgt een nieuwe vaste id die nergens botst', new Set(ids).size === ids.length && ids[1] === 'i-2', ids.join(','));
  check('map heeft zelf geen parent; parent alleen naar een bestaande map', d.items[0].parent === undefined && d.items[1].parent === 'x' && d.items[2].parent === undefined && d.items[3].parent === 'x');
  check('widget kan niet in een map (één niveau, alleen ярлики)', d.items[4].parent === undefined);
  check('titleOverride: platte tekst, geen <>, controle-/bidi-tekens weg, getrimd', d.items[3].titleOverride === 'bМої задачі/b', s(d.items[3].titleOverride));
  check('iconOverride: alleen id, nooit URL/SVG', d.items[3].iconOverride === 'lucide:list' && d.items[4].iconOverride === undefined);
  check('titleOverride ≤ 60 tekens', (normaliseerLaag({ items: [{ instanceId: 'a', itemId: 'svc:a', kind: 'shortcut', titleOverride: 'я'.repeat(200) }] }, 'computer', P).items[0].titleOverride || '').length === 60);
  const c = configSchonen({ a: 'x', b: 2, c: true, d: { nest: 1 }, e: [1], 'bad key': 1, f: NaN, g: 'y'.repeat(5000), ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i])) });
  check('config: alleen platte waarden, geneste/arrays/NaN weg, ≤ 16 sleutels, tekst ≤ 1600, ≤ 4000 bytes', !!c && c.a === 'x' && c.b === 2 && c.c === true && !('d' in c) && !('e' in c) && !('f' in c) && Object.keys(c).length <= 16 && String(c.g).length === 1600 && new TextEncoder().encode(s(c)).length <= 4000, s(c).slice(0, 80));
  const veel = normaliseerLaag({ items: Array.from({ length: 900 }, (_, i) => ({ instanceId: `n${i}`, itemId: 'svc:post', kind: 'shortcut', x: 0, y: 0, w: 40, h: 40, z: i })) }, 'computer', P);
  check(`hoogstens ${L.maxItemsPerLaag} objecten per laag`, veel.items.length === L.maxItemsPerLaag);
  const enk = normaliseerLaag({ items: [{ instanceId: 'a', itemId: 'wdg:begroeting', kind: 'widget' }, { instanceId: 'b', itemId: 'wdg:begroeting', kind: 'widget' }] }, 'computer', { ...P, singleton: (id) => id === 'wdg:begroeting' });
  check('singleton (registerhaak): tweede exemplaar valt weg', enk.items.length === 1);
  const gr = normaliseerLaag({ items: [{ instanceId: 'a', itemId: 'wdg:post', kind: 'widget', w: 10, h: 9999 }] }, 'computer', { ...P, grenzen: () => ({ min: { w: 200, h: 150 }, max: { w: 600, h: 500 } }) });
  check('registergrenzen (min/max w/h) worden gerespecteerd', gr.items[0].w === 200 && gr.items[0].h === 500);

  // ---------------------------------------------------------------- privé/technisch
  const tech = { items: [{ instanceId: 'a', itemId: 'wdg:tech-server', kind: 'widget' }, { instanceId: 'b', itemId: 'svc:tech-diagnose', kind: 'shortcut' }, { instanceId: 'c', itemId: 'wdg:github', kind: 'widget' }, { instanceId: 'd', itemId: 'wdg:post', kind: 'widget' }] };
  check('persoonlijke lade: technische widget/ярлик en «binnenkort» vallen weg', normaliseerLaag(tech, 'computer', P).items.map((i) => i.instanceId).join(',') === 'd');
  check('technische lade: technische dingen blijven', normaliseerLaag(tech, 'computer', T).items.map((i) => i.instanceId).join(',') === 'a,b,d', normaliseerLaag(tech, 'computer', T).items.map((i) => i.instanceId).join(','));
  check('registerhaak itemToegestaan beslist (planned/denied → weg)', normaliseerLaag(tech, 'computer', { ...P, itemToegestaan: (id) => id === 'wdg:post' }).items.length === 1);

  // ---------------------------------------------------------------- volledige v3 + overzetting
  const v3 = normaliseerWerkbladV3({ v: 3, achtergrond: 'http://x', layouts: { computer: { items: [] }, kast: {}, telefoon: null } }, P);
  check('normaliseerWerkbladV3: onbekende apparaatklasse/achtergrond → weg/«nacht»', Object.keys(v3.layouts).join(',') === 'computer' && v3.achtergrond === 'nacht');
  const v2 = { v: 2, achtergrond: 'zee', items: [{ tid: 'w1', id: 'begroeting', k: 12, r: 1 }, { tid: 'w2', id: 'post', k: 6, r: 3, inst: { weergave: 'tellers' } }, { tid: 'w3', id: 'agenda', k: 6, r: 2 }, { tid: 'w4', id: 'tech-server', k: 4, r: 2 }] };
  const v2n = normaliseerWerkblad(v2, P);
  const m = migreerV2NaarV3(v2, P);
  const pc = m.v3.layouts.computer!, tab = m.v3.layouts.tablet!, tel = m.v3.layouts.telefoon!;
  check('overzetting: drie aparte lagen, achtergrond overgenomen', !!pc && !!tab && !!tel && m.v3.achtergrond === 'zee' && pc !== tab);
  const p12 = plaatsen(v2n.items, 12);
  const kolB = (1280 - 12 * 13) / 12;
  check('computer = plaatsen(v2.items, 12) omgerekend naar px (zelfde volgorde, zelfde rasterplek)', pc.items.length === 3 && pc.items.every((e, i) => e.instanceId === p12[i].tid && e.x === Math.round(12 + p12[i].x * (kolB + 12)) && e.y === 12 + p12[i].y * 108), s(pc.items.map((e) => [e.x, e.y, e.w, e.h])));
  check('computer: post naast agenda (6+6 kolommen), begroeting over de hele breedte', pc.items[1].y === pc.items[2].y && pc.items[2].x > pc.items[1].x && pc.items[0].w === 1280 - 24);
  check('computer: h = r*96 + (r-1)*12 (post r3 → 312)', pc.items[1].h === 312);
  check('inst → config (post weergave=tellers)', pc.items[1].config?.weergave === 'tellers' && pc.items[1].itemId === 'wdg:post' && pc.items[1].kind === 'widget');
  check('technische v2-widget komt niet in de persoonlijke v3', !pc.items.some((e) => e.itemId === 'wdg:tech-server'));
  check('tablet: eigen laag op 768 px, binnen het canvas', tab.canvasWidth === 768 && tab.items.every((e) => e.x + e.w <= 768));
  check('telefoon: flow, één kolom onder elkaar (geen kopie van PC-coördinaten)', tel.mode === 'flow' && tel.canvasWidth === 390 && tel.items.every((e) => e.x === 12 && e.w === 366) && tel.items.every((e, i) => i === 0 || e.y > tel.items[i - 1].y));
  check('geen overlap op computer', pc.items.every((a, i) => pc.items.every((b2, j) => i === j || a.x + a.w <= b2.x || b2.x + b2.w <= a.x || a.y + a.h <= b2.y || b2.y + b2.h <= a.y)));
  check('backup = de v2-indeling ongewijzigd (genormaliseerd)', s(m.backup) === s(v2n));
  check('overzetting is deterministisch (tweemaal = zelfde)', s(migreerV2NaarV3(v2, P)) === s(m));
  const opnieuw = migreerV2NaarV3(m.v3, P);
  check('idempotent: v3 als invoer → geen backup, v3 ongewijzigd', opnieuw.backup === null && s(opnieuw.v3) === s(m.v3));
  check('lagen zijn al genormaliseerd (normaliseren verandert niets)', s(normaliseerWerkbladV3(m.v3, P)) === s(m.v3));
  check('leeg v2 → drie lege lagen met standaardcanvas', (() => { const e = migreerV2NaarV3(null, P).v3; return e.layouts.computer!.items.length === 0 && e.layouts.telefoon!.canvasWidth === STANDAARD_CANVAS.telefoon.w; })());
  return einde();
}
