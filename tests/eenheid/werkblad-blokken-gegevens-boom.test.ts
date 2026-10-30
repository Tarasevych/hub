// Werkblad «Blokken» (stroom A) — pure boomhulpen: normalisatie, limieten, kring, unieke ids, omzettingen, bewerkingen.
import { checker } from './hulp/nep-google';
import { BLOKKEN_LIMIETEN as L, type Blok, type BlokInhoud, type Onderdeel } from '../../shared/werkblad-blokken';
import {
  BlokFout, blokUitMap, blokUitWidget, diepteVan, groepeer, herstelEigenschap, knoopIds, mapUitBlok, naarCanvas, normaliseerBlok,
  ontgroepeer, pasVoorinstellingToe, telKnopen, valideerBlok, vanCanvas, verplaats, wijzig, zoekKnoop,
} from '../../shared/werkblad-blokken-boom';

const alles = () => true;
const o = (id: string, itemId = 'svc:mail', extra: Record<string, unknown> = {}) => ({ soort: 'onderdeel', id, itemId, afmeting: { breedte: { soort: 'auto' }, hoogte: { soort: 'auto' } }, volgorde: 0, ...extra });
const b = (id: string, kinderen: unknown[], extra: Record<string, unknown> = {}) => ({ soort: 'blok', id, afmeting: { breedte: { soort: 'auto' }, hoogte: { soort: 'auto' } }, volgorde: 0, indeling: { modus: 'raster' }, kinderen, ...extra });
const inh = (wortel: unknown) => ({ schema: 1, wortel });
const gooit = (f: () => unknown, code: string) => { try { f(); return false; } catch (e) { return e instanceof BlokFout && e.code === code; } };

export async function main(): Promise<number> {
  const { check, einde } = checker('werkblad-blokken-gegevens-boom');
  // normalisatie
  const n = normaliseerBlok(inh(b('w', [o('a', 'svc:mail', {
    afmeting: { breedte: { soort: 'px', waarde: 99999 }, hoogte: { soort: 'procent', waarde: 0 }, minBreedte: 50, maxBreedte: 10 },
    uiterlijk: { achtergrond: '#AABBCC', tekstKleur: 'red', icoonKleur: 'token:accent', randDikte: 99, doorzichtigheid: 0, vorm: 'ster' },
    icoon: { grootte: { soort: 'px', waarde: 2 }, vervang: '<svg>' }, label: { tekst: '  <b>Пошта</b>  ', plaats: 'midden' }, onbekend: 1,
  })], { indeling: { modus: 'vrij', overlapToestaan: true, tussenruimte: -5 } })), { toegestaan: alles, streng: true });
  const a = n.waarde?.wortel.kinderen[0] as Onderdeel;
  check('normalisatie: px geklemd op 4000, procent ≥1, max<min weg', a.afmeting.breedte.soort === 'px' && (a.afmeting.breedte as any).waarde === L.maxPx && (a.afmeting.hoogte as any).waarde === 1 && a.afmeting.maxBreedte === undefined && a.afmeting.minBreedte === 50); // eslint-disable-line @typescript-eslint/no-explicit-any
  check('normalisatie: kleur #rrggbb klein, token ok, vrije CSS weg; randDikte ≤8; doorzichtigheid ≥0.2; vorm onbekend weg', a.uiterlijk?.achtergrond === '#aabbcc' && a.uiterlijk?.icoonKleur === 'token:accent' && a.uiterlijk?.tekstKleur === undefined && a.uiterlijk?.randDikte === 8 && a.uiterlijk?.doorzichtigheid === 0.2 && a.uiterlijk?.vorm === undefined);
  check('normalisatie: icoon ≥12px, SVG-vervang weg, label zonder <>, plaats standaard onder, onbekende velden weg', (a.icoon?.grootte as any).waarde === 12 && a.icoon?.vervang === undefined && a.label?.tekst === 'bПошта/b' && a.label?.plaats === 'onder' && !('onbekend' in a), JSON.stringify(a.label)); // eslint-disable-line @typescript-eslint/no-explicit-any
  check('indeling: overlapToestaan bewaard in vrij, tussenruimte ≥0', n.waarde?.wortel.indeling.overlapToestaan === true && n.waarde.wortel.indeling.tussenruimte === 0 && !n.fouten.length);
  check('indeling: overlapToestaan valt weg buiten vrij', normaliseerBlok(inh(b('w', [], { indeling: { modus: 'rij', overlapToestaan: true } })), { toegestaan: alles, streng: true }).waarde?.wortel.indeling.overlapToestaan === undefined);
  check('veilige standaard: leeg blok → raster auto', valideerBlok(inh({ soort: 'blok', id: 'w' }), alles).ok);
  // limieten
  let diep: unknown = b('d5', []); for (let i = 4; i >= 1; i--) diep = b(`d${i}`, [diep]);
  check('diepte 5 → fout te-diep', !valideerBlok(inh(diep), alles).ok && (valideerBlok(inh(diep), alles) as any).fouten.includes('te-diep')); // eslint-disable-line @typescript-eslint/no-explicit-any
  let vier: unknown = b('d4', [o('x')]); for (let i = 3; i >= 1; i--) vier = b(`d${i}`, [vier]);
  check('diepte 4 → ok', valideerBlok(inh(vier), alles).ok);
  check('61 kinderen → fout', !valideerBlok(inh(b('w', Array.from({ length: 61 }, (_, i) => o(`k${i}`)))), alles).ok);
  check('60 kinderen → ok', valideerBlok(inh(b('w', Array.from({ length: 60 }, (_, i) => o(`k${i}`)))), alles).ok);
  const groot = b('w', Array.from({ length: 7 }, (_, j) => b(`g${j}`, Array.from({ length: 58 }, (_, i) => o(`k${j}-${i}`)))));
  check('meer dan 400 knopen → te-veel-knopen', (valideerBlok(inh(groot), alles) as any).fouten?.includes('te-veel-knopen')); // eslint-disable-line @typescript-eslint/no-explicit-any
  check('dubbele id → fout', (valideerBlok(inh(b('w', [o('a'), o('a')])), alles) as any).fouten?.includes('dubbele-id:a')); // eslint-disable-line @typescript-eslint/no-explicit-any
  const k: any = b('w', []); k.kinderen.push(k); // eslint-disable-line @typescript-eslint/no-explicit-any
  check('kring (object in zichzelf) → fout', !valideerBlok(inh(k), alles).ok);
  check('ongeldige id / map: / URL als itemId / wortel geen blok / schema 2 → fout', !valideerBlok(inh(b('W!', [])), alles).ok && !valideerBlok(inh(b('w', [o('a', 'map:x')])), alles).ok && !valideerBlok(inh(b('w', [o('a', 'svc:https://x')])), alles).ok && !valideerBlok(inh(o('a')), alles).ok && !valideerBlok({ schema: 2, wortel: b('w', []) }, alles).ok);
  const tech = (i: string) => !i.includes('tech');
  check('streng: niet-toegestaan item → fout', !valideerBlok(inh(b('w', [o('a', 'wdg:tech-server')])), tech).ok);
  const m = normaliseerBlok(inh(b('w', [o('a', 'wdg:tech-server'), o('c')])), { toegestaan: tech, streng: false });
  check('mild: niet-toegestaan item valt stil weg, rest blijft', !m.fouten.length && knoopIds(m.waarde!.wortel).join() === 'w,c');
  check('toegestaan krijgt config (usr: met basis)', valideerBlok(inh(b('w', [o('u', 'usr:x', { config: { basis: 'svc:mail' } })])), (_i, c) => c?.basis === 'svc:mail').ok);
  // omzettingen
  const wi = blokUitWidget('snel-toegang', ['svc:mail', 'svc:ai', 'svc:mail', 'bad']);
  check('blokUitWidget: raster auto, ontdubbeld, ongeldig weg, bron widget-standaard', wi.bron === 'widget-standaard' && wi.wortel.indeling.modus === 'raster' && knoopIds(wi.wortel).join() === 'w-snel-toegang,o-1,o-2' && valideerBlok(wi, alles).ok);
  const map = { instanceId: 'm1', itemId: 'map:m1', kind: 'folder' as const, x: 10, y: 20, w: 200, h: 200, z: 3, titleOverride: 'Мапа' };
  const kin = [{ instanceId: 'k1', itemId: 'svc:mail', kind: 'shortcut' as const, x: 5, y: 6, w: 96, h: 104, z: 2, parent: 'm1', titleOverride: 'Лист', iconOverride: 'mail' },
    { instanceId: 'k2', itemId: 'svc:ai', kind: 'shortcut' as const, x: 105, y: 6, w: 120, h: 104, z: 1, parent: 'm1', locked: true }];
  const bm = blokUitMap(map, kin);
  const terug = mapUitBlok({ ...map, blok: bm });
  const zelfde = (x: any, y: any) => JSON.stringify(Object.entries(x).sort()) === JSON.stringify(Object.entries(y).sort()); // eslint-disable-line @typescript-eslint/no-explicit-any
  check('map → blok → map verliesvrij', !!terug && zelfde(terug.map, map) && terug.kinderen.length === 2 && kin.every((k) => zelfde(terug.kinderen.find((t) => t.instanceId === k.instanceId)!, k)), JSON.stringify(terug));
  check('mapUitBlok: genest blok → null', mapUitBlok({ ...map, blok: inh(b('m1', [b('x', [])])) as BlokInhoud }) === null);
  const oc = vanCanvas(kin[0], 'k1'); const ec = naarCanvas(oc, { x: 5, y: 6, z: 2 }, 'k1');
  check('vanCanvas/naarCanvas: titel, icoon, maat behouden', ec.titleOverride === 'Лист' && ec.iconOverride === 'mail' && ec.w === 96 && ec.kind === 'shortcut');
  // bewerkingen
  const W = valideerBlok(inh(b('w', [o('a'), o('c'), b('g', [o('d')], { indeling: { modus: 'kolom' } })])), alles);
  const w0 = (W as { waarde: BlokInhoud }).waarde.wortel;
  const w1 = verplaats(w0, 'a', 'g', 'd');
  check('verplaats: a vóór d in g, volgorde hernummerd, origineel onaangeroerd', knoopIds(w1).join() === 'w,c,g,a,d' && (zoekKnoop(w1, 'a')!.ouder!.id === 'g') && knoopIds(w0).join() === 'w,a,c,g,d');
  check('verplaats: blok in eigen kind → kring', gooit(() => verplaats(w0, 'g', 'g'), 'kring') && gooit(() => verplaats(w0, 'w', 'g', null), 'wortel-vast'));
  check('verplaats: naar onderdeel → soort-niet-toegestaan', gooit(() => verplaats(w0, 'c', 'a', null), 'soort-niet-toegestaan'));
  const w2 = groepeer(w0, ['a', 'c'], 'rij');
  const nieuw = w2.kinderen[0] as Blok;
  check('groepeer: nieuw blok (rij) op plek van a met a,c', nieuw.soort === 'blok' && nieuw.indeling.modus === 'rij' && knoopIds(nieuw).slice(1).join() === 'a,c' && valideerBlok({ schema: 1, wortel: w2 }, alles).ok);
  check('ontgroepeer: terug naar a,c,g', knoopIds(ontgroepeer(w2, nieuw.id)).join() === 'w,a,c,g,d');
  let d4 = w0; d4 = groepeer(d4, ['g'], 'rij'); d4 = groepeer(d4, [d4.kinderen[2].id], 'rij');
  check('groepeer boven diepte 4 → te-diep', diepteVan(d4) === 4 && gooit(() => groepeer(d4, [d4.kinderen[2].id], 'rij'), 'te-diep'));
  const w3 = wijzig(w0, 'a', { icoon: { grootte: { soort: 'px', waarde: 72 } }, id: 'hack', soort: 'blok' });
  check('wijzig: eigenschap gezet, id/soort niet te wijzigen', (zoekKnoop(w3, 'a')!.knoop as Onderdeel).icoon?.grootte.soort === 'px' && zoekKnoop(w3, 'a')!.knoop.soort === 'onderdeel');
  const w4 = herstelEigenschap(w3, 'a', 'icoon.grootte');
  check('herstelEigenschap: icoon.grootte → auto', (zoekKnoop(w4, 'a')!.knoop as Onderdeel).icoon?.grootte.soort === 'auto' && gooit(() => herstelEigenschap(w3, 'a', 'kinderen'), 'pad-ongeldig'));
  const w5 = pasVoorinstellingToe(w0, 'w', 'grote-iconen');
  check('voorinstelling grote-iconen: raster 120, standaard icoon 56px; terug automatisch wist standaard', w5.indeling.rasterMinCel === 120 && (w5.standaardOnderdeel?.icoon?.grootte as any).waarde === 56 && pasVoorinstellingToe(w5, 'w', 'raster-automatisch').standaardOnderdeel === undefined); // eslint-disable-line @typescript-eslint/no-explicit-any
  check('telKnopen', telKnopen(w0) === 5);
  return einde();
}
