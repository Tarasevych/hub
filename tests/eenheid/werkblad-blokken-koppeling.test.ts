// Eenheidstests koppeling Werkblad «Blokken» ↔ Werkblad v3 (stijl heen en terug, ids, weghalen/invoegen).
// Draaien: node scripts/eenheidstests.mjs werkblad-blokken-koppeling
import { MAAT_AUTO, type Onderdeel } from '../../shared/werkblad-blokken';
import { STIJL_SLEUTEL, alleIds, haalWeg, herId, onderdeelNaarCanvas, onderdeelVanCanvas, samen, samengesteldeWortels, standaardSnelToegang, stijlUitConfig, uiteen, voegIn, vrijeId, heeftBlok, SNEL_TOEGANG } from '../../src/werkblad/blokken/koppeling';

const r: boolean[] = [];
const check = (naam: string, ok: boolean, info = '') => { r.push(ok); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };

export async function main(): Promise<number> {
const ond: Onderdeel = { soort: 'onderdeel', id: 'k1', itemId: 'svc:mail', volgorde: 0, afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO },
  uiterlijk: { achtergrond: '#7c3aed' }, icoon: { grootte: { soort: 'px', waarde: 64 } }, label: { tekst: 'Моя пошта', tonen: 'auto', plaats: 'onder' } };
const e = onderdeelNaarCanvas(ond, { x: 10, y: 20, z: 3 }, 'i-1');
const s = stijlUitConfig(e.config as Record<string, unknown>);
check('naar werkblad: losse snelkoppeling met stijl in config.blokStijl', e.kind === 'shortcut' && e.itemId === 'svc:mail' && typeof e.config?.[STIJL_SLEUTEL] === 'string' && s?.uiterlijk?.achtergrond === '#7c3aed', JSON.stringify(e));
check('naar werkblad: naam via titleOverride, niet in de stijl', e.titleOverride === 'Моя пошта' && !JSON.stringify(s).includes('Моя пошта'));
const terug = onderdeelVanCanvas(e, 'k9');
check('heen en terug: kleur, icoongrootte en naam terug', terug.uiterlijk?.achtergrond === '#7c3aed' && terug.icoon?.grootte?.soort === 'px' && (terug.icoon.grootte as { waarde: number }).waarde === 64 && terug.label?.tekst === 'Моя пошта' && !terug.config, JSON.stringify(terug));
const vol: Onderdeel = { ...ond, uiterlijk: { achtergrond: '#112233', randKleur: '#445566', randDikte: 2, vorm: 'afgerond', straal: 14, schaduw: 'zacht', doorzichtigheid: 0.8 }, icoon: { grootte: { soort: 'px', waarde: 48 }, stijl: 'rond', vervang: 'mail' }, label: { tekst: 'Х', tonen: 'ja', plaats: 'rechts' } };
  const vt = onderdeelVanCanvas(onderdeelNaarCanvas(vol, { x: 0, y: 0, z: 1 }, 'i-3'), 'k8');
  check('heen en terug: vorm, straal, rand, schaduw, doorzichtigheid, icoonstijl, labelplaats en vervangen icoon blijven', Object.entries(vol.uiterlijk!).every(([k, v]) => (vt.uiterlijk as Record<string, unknown>)?.[k] === v) && Object.keys(vt.uiterlijk || {}).length === Object.keys(vol.uiterlijk!).length && vt.icoon?.stijl === 'rond' && vt.icoon?.vervang === 'mail' && (vt.icoon.grootte as { waarde: number }).waarde === 48 && vt.label?.plaats === 'rechts' && vt.label?.tonen === 'ja' && vt.label?.tekst === 'Х', JSON.stringify(vt));
  check('stijl met ongeldige kleur wordt niet overgenomen', !stijlUitConfig({ [STIJL_SLEUTEL]: JSON.stringify({ uiterlijk: { achtergrond: 'url(x)' } }) })?.uiterlijk?.achtergrond);
check('kapotte stijl-JSON → null', stijlUitConfig({ [STIJL_SLEUTEL]: '{kapot' }) === null);
check('onderdeel zonder stijl → geen config', !onderdeelNaarCanvas({ ...ond, uiterlijk: undefined, icoon: undefined, label: undefined }, { x: 0, y: 0, z: 1 }, 'i-2').config);

check('samengestelde id heen en terug', JSON.stringify(uiteen(samen('w3', 'g-1'))) === JSON.stringify({ instanceId: 'w3', knoopId: 'g-1' }));
const st = standaardSnelToegang('w3', ['svc:mail', 'svc:cloud', 'svc:ai']);
check('standaardblok Швидкий доступ: ids w-<id> en <id>-n, volgorde gelijk', st.wortel.id === 'w-w3' && st.wortel.kinderen.map((k) => k.id).join() === 'w3-1,w3-2,w3-3' && st.wortel.kinderen.map((k) => (k as Onderdeel).itemId).join() === 'svc:mail,svc:cloud,svc:ai');
const bezet = alleIds({ w3: st }); const oud = new Set(bezet); const v = vrijeId(bezet, 'k');
check('vrije id botst niet en wordt meteen bezet', !oud.has(v) && bezet.has(v) && v.startsWith('k'));
const h = herId(st.wortel, bezet, 'k');
check('herId: alle ids nieuw en onderling uniek', new Set([h.id, ...h.kinderen.map((k) => k.id)]).size === 4 && [h.id, ...h.kinderen.map((k) => k.id)].every((x) => !oud.has(x) && x !== v));
const weg = haalWeg(st.wortel, 'w3-2');
check('haalWeg: knoop weg, volgorde opnieuw', !!weg && weg.wortel.kinderen.length === 2 && weg.wortel.kinderen[1].volgorde === 1 && weg.knoop.id === 'w3-2' && st.wortel.kinderen.length === 3);
const in1 = weg && voegIn(weg.wortel, 'w-w3', weg.knoop, 'w3-1');
check('voegIn vóór eerste', !!in1 && in1.kinderen[0].id === 'w3-2');
check('voegIn in onbekend blok → null', voegIn(st.wortel, 'bestaat-niet', ond, null) === null);
const sw = samengesteldeWortels({ w3: st });
check('samengestelde wortels: ids met voorvoegsel', sw[0].id === 'w3~w-w3' && sw[0].kinderen[0].id === 'w3~w3-1');
check('heeftBlok: widget Швидкий доступ en map ja, snelkoppeling nee', heeftBlok({ itemId: SNEL_TOEGANG, kind: 'widget' } as never) && heeftBlok({ itemId: 'x', kind: 'folder' } as never) && !heeftBlok({ itemId: 'svc:mail', kind: 'shortcut' } as never));

  const ok = r.filter(Boolean).length; console.log(`werkblad-blokken-koppeling: ${ok}/${r.length} OK`); return ok === r.length ? 0 : 1;
}
