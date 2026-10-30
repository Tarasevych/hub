// Eenheidstests rekenmachine Werkblad «Blokken» (stroom B). Eigenschapsstijl met vaste zaadwaarde (deterministisch).
// Draaien: node scripts/eenheidstests.mjs werkblad-blokken-rekenen
import { STANDAARD_INDELING, type Blok, type Knoop, type Onderdeel, type BlokModus, type Maat } from '../../shared/werkblad-blokken';
import { AUTO_WAARDEN, bereken, contrast, doelIndex, icoonPx, leesbareTekst, leesVolgorde, tekeningPx, kleurCss } from '../../shared/werkblad-blokken-rekenen';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const A: Maat = { soort: 'auto' };
const ond = (id: string, volgorde: number, extra: Partial<Onderdeel> = {}): Onderdeel => ({ soort: 'onderdeel', id, itemId: `svc:${id}`, volgorde, afmeting: { breedte: A, hoogte: A }, ...extra });
const blok = (id: string, kinderen: Knoop[], ind: Partial<Blok['indeling']> = {}, extra: Partial<Blok> = {}): Blok => ({ soort: 'blok', id, volgorde: 0, afmeting: { breedte: A, hoogte: A }, indeling: { ...STANDAARD_INDELING, ...ind }, kinderen, ...extra });
const twaalf = () => Array.from({ length: 12 }, (_, i) => ond(`t${i}`, i));
const eps = (a: number, b: number) => Math.abs(a - b) < 0.05;

// zaadgestuurde willekeur
let zaad = 1234567;
const rnd = () => ((zaad = (zaad * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const kies = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const willekeurigeMaat = (): Maat => kies<Maat>([A, { soort: 'px', waarde: Math.round(20 + rnd() * 200) }, { soort: 'procent', waarde: Math.round(5 + rnd() * 90) }, { soort: 'deel', waarde: 1 + Math.floor(rnd() * 4) }]);
let teller = 0;
function willekeurigBlok(diepte: number): Blok {
  const n = 1 + Math.floor(rnd() * 6); const kids: Knoop[] = [];
  for (let i = 0; i < n; i++) {
    if (diepte < 4 && rnd() < 0.3) kids.push({ ...willekeurigBlok(diepte + 1), volgorde: i });
    else kids.push(ond(`o${teller++}`, i, { afmeting: { breedte: willekeurigeMaat(), hoogte: willekeurigeMaat(), minBreedte: rnd() < 0.2 ? 30 : undefined, maxBreedte: rnd() < 0.2 ? 150 : undefined }, positie: { x: Math.round(rnd() * 300), y: Math.round(rnd() * 200), z: i } }));
  }
  return blok(`b${teller++}`, kids, { modus: kies<BlokModus>(['vrij', 'rij', 'kolom', 'raster']), omloop: rnd() < 0.5, tussenruimte: Math.round(rnd() * 16), binnenrand: Math.round(rnd() * 12), uitlijningHoofd: kies(['begin', 'midden', 'eind', 'rek', 'verdeeld'] as const), uitlijningDwars: kies(['begin', 'midden', 'eind', 'rek', 'verdeeld'] as const), rasterKolommen: rnd() < 0.5 ? 'auto' : 1 + Math.floor(rnd() * 5) });
}

export async function main() {
  // --- 'auto'-pariteit met de huidige CSS
  const w = blok('w', twaalf());
  const r1280 = bereken(w, { w: 600, h: 0 }, 'computer');
  const kol600 = Math.floor((600 + 8) / (84 + 8)); // auto-fill
  check('auto: 600px → zelfde kolomaantal als CSS auto-fill(84px, gap 8)', new Set(r1280.map((b) => b.kader.x)).size === kol600, `${kol600}`);
  check('auto: celbreedte = (600 − gaps)/kolommen (1fr)', eps(r1280[0].kader.w, (600 - 8 * (kol600 - 1)) / kol600));
  check('auto: rijhoogte 68px, icoon 36px, tekening 20px', r1280[0].kader.h === 68 && r1280[0].icoonPx === 36 && tekeningPx(36) === 20);
  const rSmal = bereken(w, { w: 360, h: 0 }, 'telefoon');
  check('auto smal (≤380): cellen min 70, rijen 54, gap 6, icoon 28/16', rSmal[0].kader.h === 54 && rSmal[0].icoonPx === 28 && tekeningPx(28) === 16 && new Set(rSmal.map((b) => b.kader.x)).size === Math.floor((360 + 6) / (70 + 6)));
  check('auto: icoonPx grens precies op 380', icoonPx(undefined, 380) === 28 && icoonPx(undefined, 381) === 36);
  check('auto: vaste icoonmaat wint altijd', icoonPx({ grootte: { soort: 'px', waarde: 56 } }, 200) === 56 && icoonPx({ grootte: { soort: 'px', waarde: 9999 } }, 900) === 256);
  const rHoog = bereken(w, { w: 600, h: 400 }, 'computer');
  const rijen = Math.ceil(12 / kol600);
  check('auto: rijen rekken mee (minmax(68px,1fr)) bij hoger blok', eps(rHoog[0].kader.h, Math.max(68, (400 - 8 * (rijen - 1)) / rijen)));
  check('auto: labels getoond zoals nu', r1280.every((b) => b.labelTonen));

  // --- standaardOnderdeel-overerving
  const wGroot = blok('w', twaalf(), {}, { standaardOnderdeel: { icoon: { grootte: { soort: 'px', waarde: 48 } } } });
  const rg = bereken(wGroot, { w: 600, h: 0 }, 'computer');
  check('overerving: standaardOnderdeel 48px geldt voor alle kinderen', rg.every((b) => b.icoonPx === 48));
  const wEen = blok('w', [ond('a', 0, { icoon: { grootte: { soort: 'px', waarde: 20 } } }), ond('b', 1)], {}, { standaardOnderdeel: { icoon: { grootte: { soort: 'px', waarde: 48 } } } });
  const re = bereken(wEen, { w: 600, h: 0 }, 'computer');
  check('overerving: eigen waarde wint van standaard', re.find((b) => b.id === 'a')!.icoonPx === 20 && re.find((b) => b.id === 'b')!.icoonPx === 48);

  // --- rij met delen: som = beschikbaar
  const rij = blok('r', [ond('a', 0, { afmeting: { breedte: { soort: 'deel', waarde: 1 }, hoogte: A } }), ond('b', 1, { afmeting: { breedte: { soort: 'deel', waarde: 2 }, hoogte: A } }), ond('c', 2, { afmeting: { breedte: { soort: 'px', waarde: 100 }, hoogte: A } })], { modus: 'rij', omloop: false, tussenruimte: 10 });
  const rr = bereken(rij, { w: 500, h: 80 }, 'computer');
  const som = rr.reduce((s, b) => s + b.kader.w, 0) + 20;
  check('rij: maten + tussenruimte = binnenbreedte (delen vullen)', eps(som, 500), `${som}`);
  check('rij: deel 2 = 2× deel 1', eps(rr[1].kader.w, 2 * rr[0].kader.w));
  const rijMax = blok('r', [ond('a', 0, { afmeting: { breedte: { soort: 'deel', waarde: 1 }, hoogte: A, maxBreedte: 50 } }), ond('b', 1, { afmeting: { breedte: { soort: 'deel', waarde: 1 }, hoogte: A } })], { modus: 'rij', omloop: false, tussenruimte: 0 });
  const rm = bereken(rijMax, { w: 300, h: 80 }, 'computer');
  check('rij: max respecteerd, rest naar ander deel', rm[0].kader.w === 50 && eps(rm[1].kader.w, 250));
  const kolom = blok('k', [ond('a', 0), ond('b', 1)], { modus: 'kolom', omloop: false, uitlijningDwars: 'rek' });
  const rk = bereken(kolom, { w: 300, h: 0 }, 'computer');
  check('kolom: onder elkaar, rek over volle breedte', rk[1].kader.y > rk[0].kader.y && rk[0].kader.w === 300 && rk[0].kader.x === rk[1].kader.x);
  const omg = bereken(blok('r', [ond('a', 0), ond('b', 1)], { modus: 'rij', richting: 'omgekeerd', omloop: false }), { w: 400, h: 80 }, 'computer');
  check('rij omgekeerd: b links van a', omg.find((b) => b.id === 'b')!.kader.x < omg.find((b) => b.id === 'a')!.kader.x);
  const omloop = bereken(blok('r', Array.from({ length: 6 }, (_, i) => ond(`x${i}`, i, { afmeting: { breedte: { soort: 'px', waarde: 100 }, hoogte: A } })), { modus: 'rij', omloop: true, tussenruimte: 0 }), { w: 250, h: 0 }, 'computer');
  check('rij omloop: 2 per regel bij 250px', new Set(omloop.map((b) => b.kader.y)).size === 3);
  const midden = bereken(blok('r', [ond('a', 0, { afmeting: { breedte: { soort: 'px', waarde: 100 }, hoogte: A } })], { modus: 'rij', uitlijningHoofd: 'midden', omloop: false }), { w: 300, h: 80 }, 'computer');
  check('rij midden: gecentreerd', midden[0].kader.x === 100);

  // --- raster span
  const span = bereken(blok('g', [ond('a', 0, { rasterSpan: { kolommen: 2, rijen: 2 } }), ond('b', 1), ond('c', 2), ond('d', 3)], { rasterKolommen: 3, tussenruimte: 0 }), { w: 300, h: 0 }, 'computer');
  check('raster span 2×2: breedte 2 cellen, b en c rechts ernaast', span[0].kader.w === 200 && span[0].kader.h === 136 && span[1].kader.x === 200 && span[2].kader.x === 200 && span[2].kader.y === 68);

  // --- vrij: geen overlap standaard, wel met vlag
  const vr = blok('v', [ond('a', 0, { positie: { x: 10, y: 10, z: 0 } }), ond('b', 1, { positie: { x: 20, y: 20, z: 1 } })], { modus: 'vrij' });
  const rv = bereken(vr, { w: 400, h: 300 }, 'computer');
  const ov = (i: number, j: number, r: typeof rv) => r[i].kader.x < r[j].kader.x + r[j].kader.w && r[j].kader.x < r[i].kader.x + r[i].kader.w && r[i].kader.y < r[j].kader.y + r[j].kader.h && r[j].kader.y < r[i].kader.y + r[i].kader.h;
  check('vrij: standaard geen overlap (tweede schuift)', !ov(0, 1, rv) && rv[0].kader.x === 10 && rv[0].kader.y === 10);
  const rvo = bereken(vr, { w: 400, h: 300 }, 'computer', { overlapToestaan: true });
  check('vrij: overlap toegestaan → posities exact', ov(0, 1, rvo) && rvo[1].kader.x === 20 && rvo[1].kader.y === 20);

  // --- apparaten
  const app = blok('a', [ond('a', 0, { apparaten: { telefoon: 'verbergen' } }), ond('b', 1)]);
  check('apparaat: verborgen op telefoon, zichtbaar op computer', bereken(app, { w: 300, h: 0 }, 'telefoon').length === 1 && bereken(app, { w: 300, h: 0 }, 'computer').length === 2);

  // --- nesting diepte 4
  let diep: Blok = blok('d5', [ond('blad', 0)]);
  for (let i = 4; i >= 1; i--) diep = blok(`d${i}`, [{ ...diep, volgorde: 0 }, ond(`z${i}`, 1)], { modus: 'kolom', omloop: false });
  const wortel = blok('wortel', [{ ...diep, volgorde: 0 }]);
  const rd = bereken(wortel, { w: 600, h: 600 }, 'computer');
  check('nesting: diepte ≤ 4 getekend, dieper niet', Math.max(...rd.map((b) => b.diepte)) <= 4 && !rd.some((b) => b.id === 'blad'));
  const kinderBinnen = rd.filter((b) => b.id !== 'd1').every((b) => b.kader.x >= 0 && b.kader.y >= 0);
  check('nesting: alle kaders binnen de wortel (≥0)', kinderBinnen);

  // --- eigenschappen over willekeurige bomen
  let negatief = 0, nietEindig = 0, ondet = 0, diepteFout = 0, rijSomFout = 0;
  for (let n = 0; n < 300; n++) {
    const b = willekeurigBlok(1); const maat = { w: Math.round(rnd() * 1400), h: Math.round(rnd() * 900) };
    const app = kies(['computer', 'tablet', 'telefoon'] as const);
    const x = bereken(b, maat, app), y = bereken(b, maat, app);
    if (JSON.stringify(x) !== JSON.stringify(y)) ondet++;
    for (const k of x) { if (k.kader.w < 0 || k.kader.h < 0 || k.icoonPx < 0) negatief++; if (![k.kader.x, k.kader.y, k.kader.w, k.kader.h, k.icoonPx].every(Number.isFinite)) nietEindig++; if (k.diepte > 4) diepteFout++; }
  }
  for (let n = 0; n < 200; n++) {
    const kids = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, i) => ond(`s${i}`, i, { afmeting: { breedte: { soort: 'deel', waarde: 1 + Math.floor(rnd() * 5) }, hoogte: A } }));
    const g = Math.round(rnd() * 12); const W = 200 + Math.round(rnd() * 1000);
    const r = bereken(blok('s', kids, { modus: 'rij', omloop: false, tussenruimte: g }), { w: W, h: 80 }, 'computer');
    if (!eps(r.reduce((s, b) => s + b.kader.w, 0) + g * (kids.length - 1), W)) rijSomFout++;
  }
  check('eigenschap: deterministisch (300 bomen)', ondet === 0, `${ondet}`);
  check('eigenschap: geen negatieve maten', negatief === 0, `${negatief}`);
  check('eigenschap: alles eindig (geen NaN/∞)', nietEindig === 0, `${nietEindig}`);
  check('eigenschap: diepte nooit > 4', diepteFout === 0);
  check('eigenschap: rij met alleen delen vult exact (200 gevallen)', rijSomFout === 0, `${rijSomFout}`);
  check('robuust: ongeldige invoer (NaN/0 breedte) faalt niet', bereken(blok('n', twaalf(), { tussenruimte: Number.NaN }), { w: Number.NaN, h: -5 }, 'computer').every((b) => b.kader.w >= 0));

  // --- volgorde, doelzone, kleuren
  const lv = leesVolgorde(r1280);
  check('leesvolgorde: rij voor rij, links→rechts', lv.join() === r1280.map((b) => b.id).join());
  const dz = doelIndex(w, r1280, 'w', { x: 1, y: 1 }, 'computer');
  check('doelzone: punt linksboven → vóór eerste', dz.index === 0 && dz.voor === 't0');
  check('doelzone: punt ver onder → achteraan', doelIndex(w, r1280, 'w', { x: 1, y: 5000 }, 'computer').voor === null);
  check('kleur: alleen token of #rrggbb', kleurCss('token:accent') === 'var(--accent)' && kleurCss('#AABBCC') === '#aabbcc' && kleurCss('red; x:y' as never) === undefined && kleurCss('token:a;b' as never) === undefined);
  const lt = leesbareTekst('#ffff00', '#ffffff');
  check('contrast: onleesbare tekstkleur vervangen (≥4.5)', lt !== '#ffffff' && contrast('#ffff00', lt!) >= 4.5);
  check('contrast: donkere achtergrond → witte tekst', leesbareTekst('#101820') === '#ffffff');
  check('AUTO_WAARDEN gelijk aan werkblad.css', AUTO_WAARDEN.celMin === 84 && AUTO_WAARDEN.rijHoogte === 68 && AUTO_WAARDEN.smalGrens === 380);

  const fout = resultaten.filter((r) => !r.ok).length;
  console.log(`werkblad-blokken-rekenen: ${resultaten.length - fout}/${resultaten.length} OK`);
  return fout ? 1 : 0;
}
