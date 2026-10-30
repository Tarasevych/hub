// Eenheidstests Werkblad «Blokken» — eigenschappenpaneel (stroom C): pure logica + teksten. Geen DB nodig.
// Draaien: node scripts/eenheidstests.mjs werkblad-blokken-paneel
import { MAAT_AUTO, STANDAARD_INDELING, VOORINSTELLINGEN, type Blok, type Onderdeel } from '../../shared/werkblad-blokken';
import { BLOKKEN_TEKSTEN, tekst, uitleg } from '../../shared/werkblad-blokken-teksten';
import * as L from '../../src/werkblad/blokken/EigenschappenLogica';

const res: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { res.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const od = (id: string, extra: Partial<Onderdeel> = {}): Onderdeel => ({ id, soort: 'onderdeel', itemId: `svc:${id}`, afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 0, ...extra });
const boom = (): Blok => ({ id: 'w', soort: 'blok', afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 0, indeling: { ...STANDAARD_INDELING },
  kinderen: [od('mail'), od('agenda'), { id: 'b2', soort: 'blok', afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 2, indeling: { ...STANDAARD_INDELING, modus: 'kolom' }, kinderen: [od('git')] }] });

export async function main() {
  const w = boom();
  check('zoekKnoop vindt genest + ouder', L.zoekKnoop(w, 'git')?.ouder?.id === 'b2');
  check('zoekKnoop onbekend → null', L.zoekKnoop(w, 'x') === null);

  const w2 = L.wijzigKnoop(w, 'mail', (k) => L.zetPad(k, 'icoon', { grootte: { soort: 'px', waarde: 72 } }));
  check('geval 2: één icoon 72px, rest ongewijzigd', (L.zoekKnoop(w2, 'mail')!.knoop as Onderdeel).icoon?.grootte.soort === 'px' && w2.kinderen[1] === w.kinderen[1] && w2.kinderen[2] === w.kinderen[2]);
  check('wijzigKnoop: origineel onaangeroerd', !(w.kinderen[0] as Onderdeel).icoon);
  check('wijzigKnoop onbekende id → zelfde object', L.wijzigKnoop(w, 'zz', (k) => k) === w);
  const w3 = L.wijzigKnoop(w, 'git', (k) => L.zetPad(k, 'uiterlijk.achtergrond', '#ff0000'));
  check('wijzig diep genest', (L.zoekKnoop(w3, 'git')!.knoop.uiterlijk?.achtergrond) === '#ff0000');

  // Скинути
  const m = L.zetPad(od('a'), 'afmeting.breedte', { soort: 'px', waarde: 200 });
  check('isStandaard false na wijziging', !L.isStandaard(m, 'afmeting.breedte'));
  check('herstelPad breedte → auto', L.isStandaard(L.herstelPad(m, 'afmeting.breedte'), 'afmeting.breedte'));
  const k = L.herstelPad(L.zetPad(od('a'), 'uiterlijk.schaduw', 'sterk'), 'uiterlijk.schaduw');
  check('herstelPad ruimt leeg uiterlijk op', k.uiterlijk === undefined);
  const ic = L.herstelPad(L.zetPad(od('a'), 'icoon', { grootte: { soort: 'px', waarde: 40 } }), 'icoon.grootte');
  check('herstel icoongrootte → icoon weg', (ic as Onderdeel).icoon === undefined);
  const bl = L.herstelPad(L.zetPad(boom(), 'indeling.tussenruimte', 30), 'indeling.tussenruimte') as Blok;
  check('herstel indeling.tussenruimte → standaard 8', bl.indeling.tussenruimte === 8);
  const vol = od('x', { uiterlijk: { vorm: 'pil' }, apparaten: { telefoon: 'verbergen' }, vergrendeld: true, label: { tonen: 'nee', plaats: 'onder' }, volgorde: 5 });
  const ha = L.herstelAlles(vol) as Onderdeel;
  check('herstelAlles: alles weg, id/itemId/volgorde blijven', !ha.uiterlijk && !ha.apparaten && !ha.label && !ha.vergrendeld && ha.itemId === 'svc:x' && ha.volgorde === 5);
  const hb = L.herstelAlles({ ...boom(), indeling: { ...STANDAARD_INDELING, modus: 'vrij' } }) as Blok;
  check('herstelAlles blok: indeling standaard, kinderen blijven', hb.indeling.modus === 'raster' && hb.kinderen.length === 3);

  // Voorinstellingen
  const g = L.pasVoorinstellingToe(boom(), 'grote-iconen');
  check('geval 1: Великі значки → 56px standaard voor kinderen', g.standaardOnderdeel?.icoon?.grootte.soort === 'px' && (g.standaardOnderdeel.icoon.grootte as { waarde: number }).waarde === 56 && g.indeling.rasterMinCel === 120);
  const c = L.pasVoorinstellingToe(boom(), 'compacte-rij');
  check('Компактний ряд: rij, geen label', c.indeling.modus === 'rij' && c.standaardOnderdeel?.label?.tonen === 'nee');
  check('Колонка: kolom, label rechts', L.pasVoorinstellingToe(boom(), 'kolom').standaardOnderdeel?.label?.plaats === 'rechts');
  check('Вільно: modus vrij', L.pasVoorinstellingToe(boom(), 'vrij').indeling.modus === 'vrij');
  const terug = L.pasVoorinstellingToe(g, 'raster-automatisch');
  check('Автоматично (як зараз): exact standaard, geen standaardOnderdeel', JSON.stringify(terug.indeling) === JSON.stringify(STANDAARD_INDELING) && terug.standaardOnderdeel === undefined);
  check('alle 5 voorinstellingen hebben UA+NL', Object.values(VOORINSTELLINGEN).every((v) => v.uk && v.nl));

  // Maten
  check('begrens px', JSON.stringify(L.begrensMaat({ soort: 'px', waarde: 5 })) === '{"soort":"px","waarde":16}');
  check('begrens procent', (L.begrensMaat({ soort: 'procent', waarde: 300 }) as { waarde: number }).waarde === 100);
  check('begrens deel', (L.begrensMaat({ soort: 'deel', waarde: 0 }) as { waarde: number }).waarde === 1);
  check('begrens NaN', (L.begrensMaat({ soort: 'px', waarde: NaN }) as { waarde: number }).waarde === 16);

  // Contrast
  check('contrast zwart/wit = 21', Math.abs(L.contrastVerhouding('#000000', '#ffffff')! - 21) < 0.01);
  check('contrast #777777/#ffffff < 4.5', L.contrastVerhouding('#777777', '#ffffff')! < 4.5);
  check('contrast #595959/#ffffff ≥ 4.5', L.contrastVerhouding('#595959', '#ffffff')! >= 4.5);
  check('contrast ongeldige kleur → null', L.contrastVerhouding('rood', '#ffffff') === null);

  // Geschiedenis
  let h = L.nieuweGeschiedenis(1);
  h = L.duw(h, 2); h = L.duw(h, 3);
  check('terug', L.terug(h).heden === 2);
  check('terug+vooruit', L.vooruit(L.terug(h)).heden === 3);
  check('nieuwe stap wist toekomst', L.duw(L.terug(h), 9).toekomst.length === 0);
  check('terug bij leeg = zelfde', L.terug(L.nieuweGeschiedenis(1)).heden === 1);
  let lang = L.nieuweGeschiedenis(0); for (let i = 1; i <= 80; i++) lang = L.duw(lang, i);
  check('geschiedenis max 50', lang.verleden.length === 50);

  // Teksten
  const sleutels = Object.keys(BLOKKEN_TEKSTEN) as Array<keyof typeof BLOKKEN_TEKSTEN>;
  check('alle teksten UA en NL niet leeg', sleutels.every((s) => BLOKKEN_TEKSTEN[s].uk.trim() && BLOKKEN_TEKSTEN[s].nl.trim()));
  check('uitleg heeft altijd beide talen', sleutels.every((s) => { const u = (BLOKKEN_TEKSTEN[s] as { uitleg?: { uk: string; nl: string } }).uitleg; return !u || (u.uk && u.nl); }));
  const verplichtUitleg = ['breedte', 'hoogte', 'grenzen', 'icoonGrootte', 'kleuren', 'icoonStijl', 'label', 'vorm', 'randDikte', 'doorzichtigheid', 'schaduw', 'modus', 'tussenruimte', 'binnenrand', 'uitlijningHoofd', 'uitlijningDwars', 'omloop', 'richting', 'rasterKolommen', 'rasterMinCel', 'overlap', 'vergrendel', 'apparaten', 'voorinstellingen', 'rasterSpan'] as const;
  check('elke optie heeft (?)-uitleg UA+NL', verplichtUitleg.every((s) => uitleg(s, 'uk') && uitleg(s, 'nl')), verplichtUitleg.filter((s) => !uitleg(s, 'uk')).join(','));
  check('vervanging {v}', tekst('contrastGoed', 'uk', { v: '7,0' }).includes('7,0'));
  const engels = /\b(reset|preset|size|width|height|color|colour|save|saved|undo|redo|settings|auto)\b/i;
  check('geen Engelse woorden in UA-teksten', sleutels.every((s) => !engels.test(BLOKKEN_TEKSTEN[s].uk)));
  check('UA-teksten bevatten Cyrillisch', sleutels.every((s) => /[а-яіїєґ]/i.test(BLOKKEN_TEKSTEN[s].uk)));

  const fout = res.filter((r) => !r.ok).length;
  console.log(`\nwerkblad-blokken-paneel: ${res.length - fout}/${res.length} geslaagd`);
  return fout ? 1 : 0;
}
