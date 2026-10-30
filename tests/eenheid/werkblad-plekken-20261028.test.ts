// Eenheidstests Werkblad «Blokken» — plekken, neerzetregels, kringen, limieten, ruimte, ongedaan/opnieuw. Puur, geen DB.
// Draaien: node scripts/eenheidstests.mjs werkblad-plekken
import { MAAT_AUTO, STANDAARD_INDELING, type Blok, type Knoop, type Onderdeel } from '../../shared/werkblad-blokken';
import { LaagGeschiedenis, beoordeelNeerzetting as B, hoogte, isGesloten, maakPlek, maatklasse, redenTekst, type PlekContext } from '../../shared/werkblad-plekken';
import type { DesktopEntry } from '../../shared/werkblad-v3-types';

const res: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { res.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const j = (x: unknown) => JSON.stringify(x);
const af = { breedte: MAAT_AUTO, hoogte: MAAT_AUTO };
const o = (id: string, itemId = `svc:${id}`, extra: Partial<Onderdeel> = {}): Onderdeel => ({ id, soort: 'onderdeel', itemId, afmeting: af, volgorde: 0, ...extra });
const b = (id: string, kinderen: Knoop[], extra: Partial<Blok> = {}): Blok => ({ id, soort: 'blok', indeling: STANDAARD_INDELING, kinderen, afmeting: af, volgorde: 0, ...extra });
const plekB = (id: string) => maakPlek('blok', id);

export async function main() {
  // boom: w(1) > a(2) > a1(3) > a2(4) > x ; w > c(2); w > m (onderdeel)
  const a2 = b('a2', [o('x')]);
  const a1 = b('a1', [a2]);
  const a = b('a', [a1, o('p')]);
  const c = b('c', []);
  const w = b('w', [a, c, o('m'), o('t', 'svc:admin'), o('slot', 'svc:slot', { vergrendeld: true })]);
  const vol = b('vol', Array.from({ length: 60 }, (_, i) => o(`v${i}`)));
  const dicht = b('dicht', [], { vergrendeld: true });
  const canvas: DesktopEntry[] = [{ instanceId: 'k1', itemId: 'svc:mail', kind: 'shortcut', x: 0, y: 0, w: 96, h: 104, z: 1 }, { instanceId: 'k2', itemId: 'svc:admin', kind: 'shortcut', x: 0, y: 0, w: 96, h: 104, z: 1 }];
  const ctx: PlekContext = { wortels: [w, vol, dicht], plekken: [], canvas, ruimte: 'prive', ruimtesVan: (id) => (id === 'svc:admin' ? ['technisch'] : ['prive', 'technisch']) };
  const nz = (doel = plekB('c'), kopie = false) => ({ doel, voor: null, kopie });

  check('hoogte: onderdeel 0, a 3', hoogte(o('q')) === 0 && hoogte(a) === 3);
  // kringen
  check('kring: blok in zichzelf', j(B({ van: 'blok', knoopId: 'a' }, nz(plekB('a')), ctx)) === j({ ok: false, reden: 'kring' }));
  check('kring: blok in eigen kleinkind', j(B({ van: 'blok', knoopId: 'a' }, nz(plekB('a2')), ctx)) === j({ ok: false, reden: 'kring' }));
  check('kring: ook bij kopie', !B({ van: 'blok', knoopId: 'a1' }, nz(plekB('a2'), true), ctx).ok);
  check('blok naar zusterblok mag niet als te diep (a hoogte 3 + diepte 2 = 5)', j(B({ van: 'blok', knoopId: 'a' }, nz(plekB('c')), ctx)) === j({ ok: false, reden: 'te-diep' }));
  check('blok a1 (hoogte 2) in c (diepte 2) = 4 mag', B({ van: 'blok', knoopId: 'a1' }, nz(plekB('c')), ctx).ok);
  check('blok a2 in a2-ouder a1? diepte 3+1=4 mag', B({ van: 'blok', knoopId: 'a2' }, nz(plekB('a1')), ctx).ok);
  check('onderdeel in diepste blok a2 (diepte 4) mag', B({ van: 'blok', knoopId: 'm' }, nz(plekB('a2')), ctx).ok);
  check('blok in diepste blok a2 → te-diep', j(B({ van: 'blok', knoopId: 'c' }, nz(plekB('a2')), ctx)) === j({ ok: false, reden: 'te-diep' }));
  // limiet 60
  check('vol: 61e onderdeel geweigerd', j(B({ van: 'blok', knoopId: 'm' }, nz(plekB('vol')), ctx)) === j({ ok: false, reden: 'vol' }));
  check('vol: herschikken binnen hetzelfde volle blok mag', B({ van: 'blok', knoopId: 'v3' }, nz(plekB('vol')), ctx).ok);
  check('vol: kopie binnen vol blok geweigerd', !B({ van: 'blok', knoopId: 'v3' }, nz(plekB('vol'), true), ctx).ok);
  check('vol: vanaf canvas geweigerd', !B({ van: 'canvas', instanceId: 'k1' }, nz(plekB('vol')), ctx).ok);
  // vergrendeling
  check('vergrendeld doelblok', j(B({ van: 'blok', knoopId: 'm' }, nz(plekB('dicht')), ctx)) === j({ ok: false, reden: 'vergrendeld' }));
  check('vergrendeld onderdeel verplaatsen geweigerd', j(B({ van: 'blok', knoopId: 'slot' }, nz(), ctx)) === j({ ok: false, reden: 'vergrendeld' }));
  check('vergrendeld onderdeel kopiëren mag', B({ van: 'blok', knoopId: 'slot' }, nz(plekB('c'), true), ctx).ok);
  // ruimte
  check('technisch onderdeel naar privéblok geweigerd', j(B({ van: 'blok', knoopId: 't' }, nz(), ctx)) === j({ ok: false, reden: 'niet-toegestaan-in-ruimte' }));
  check('technisch canvas-item naar privémenu geweigerd', !B({ van: 'canvas', instanceId: 'k2' }, nz(maakPlek('menu', 'hoofd')), ctx).ok);
  check('technisch onderdeel in technische ruimte mag', B({ van: 'blok', knoopId: 't' }, nz(), { ...ctx, ruimte: 'technisch' }).ok);
  check('blok met technisch kind naar privé canvas geweigerd', !B({ van: 'blok', knoopId: 'w' }, nz(maakPlek('canvas', 'computer')), { ...ctx }).ok);
  check('bibliotheek technisch item → privé geweigerd', !B({ van: 'bibliotheek', itemId: 'svc:admin' }, nz(), ctx).ok);
  // omzettingen
  check('blok → canvas = onderdeel→snelkoppeling', j(B({ van: 'blok', knoopId: 'm' }, nz(maakPlek('canvas', 'computer')), ctx)) === j({ ok: true, omzetting: 'onderdeel→snelkoppeling' }));
  check('canvas → blok = snelkoppeling→onderdeel', j(B({ van: 'canvas', instanceId: 'k1' }, nz(), ctx)) === j({ ok: true, omzetting: 'snelkoppeling→onderdeel' }));
  check('blok → menu = onderdeel→menu', j(B({ van: 'blok', knoopId: 'm' }, nz(maakPlek('menu', 'hoofd')), ctx)) === j({ ok: true, omzetting: 'onderdeel→menu' }));
  check('blok naar blok zonder omzetting', j(B({ van: 'blok', knoopId: 'm' }, nz(), ctx)) === j({ ok: true }));
  check('menu → blok = snelkoppeling→onderdeel', j(B({ van: 'menu', sleutel: 'svc:mail' }, nz(), ctx)) === j({ ok: true, omzetting: 'snelkoppeling→onderdeel' }));
  // soort / maat / gesloten
  check('blok naar menu geweigerd (soort)', j(B({ van: 'blok', knoopId: 'c' }, nz(maakPlek('menu', 'hoofd')), ctx)) === j({ ok: false, reden: 'soort-niet-toegestaan' }));
  check('widget naar blok geweigerd', !B({ van: 'bibliotheek', itemId: 'wdg:klok' }, nz(), ctx).ok);
  check('menu alleen klein', j(maakPlek('menu', 'x').maten) === j(['klein']));
  check('pagina is gesloten (uitbreidingspunt)', isGesloten(maakPlek('pagina', 'mail#boven'), {}) && !B({ van: 'blok', knoopId: 'm' }, nz(maakPlek('pagina', 'mail#boven')), ctx).ok);
  check('pagina open met uitbreiding', B({ van: 'blok', knoopId: 'm' }, nz(maakPlek('pagina', 'mail#boven')), { ...ctx, uitbreidingen: ['pagina'] }).ok);
  check('reden «gesloten» in tekst', redenTekst({ ok: false, reden: 'soort-niet-toegestaan' }, maakPlek('pagina', 'p#v'), {}).startsWith('Ще недоступно'));
  check('reden kring in tekst uk', redenTekst({ ok: false, reden: 'kring' }, plekB('a'), {}) === 'Тут не можна: блок не можна покласти сам у себе');
  check('onbekende bron geweigerd', !B({ van: 'blok', knoopId: 'nergens' }, nz(), ctx).ok);
  check('onbekend doelblok geweigerd', !B({ van: 'blok', knoopId: 'm' }, nz(plekB('nergens')), ctx).ok);
  check('maatklasse px 24 klein / 56 middel / 96 groot / auto middel',
    maatklasse(o('q', 'svc:q', { icoon: { grootte: { soort: 'px', waarde: 24 } } })) === 'klein' && maatklasse(o('q', 'svc:q', { icoon: { grootte: { soort: 'px', waarde: 56 } } })) === 'middel'
    && maatklasse(o('q', 'svc:q', { icoon: { grootte: { soort: 'px', waarde: 96 } } })) === 'groot' && maatklasse(o('q')) === 'middel');
  // ongedaan/opnieuw
  const g = new LaagGeschiedenis<number>();
  for (let i = 0; i < 70; i++) g.legVast('prive:computer', i);
  check('geschiedenis max 50', g.kan('prive:computer').terug === 50);
  let nu = 70; const terug: number[] = [];
  for (let i = 0; i < 51; i++) { const t = g.ongedaan('prive:computer', nu); if (t === null) break; terug.push(t); nu = t; }
  check('ongedaan geeft 69..20 en stopt', terug.length === 50 && terug[0] === 69 && terug[49] === 20);
  check('opnieuw na ongedaan', g.opnieuw('prive:computer', nu) === 21);
  g.legVast('prive:computer', 99);
  check('nieuwe handeling wist opnieuw', g.kan('prive:computer').vooruit === 0 && g.opnieuw('prive:computer', 0) === null);
  check('lagen los van elkaar', g.kan('prive:telefoon').terug === 0 && g.ongedaan('prive:telefoon', 1) === null);
  g.legVast('prive:telefoon', 5);
  check('telefoonlaag eigen', g.ongedaan('prive:telefoon', 6) === 5 && g.kan('prive:computer').terug > 0);

  const fout = res.filter((r) => !r.ok).length;
  console.log(`werkblad-plekken: ${res.length - fout}/${res.length} OK`);
  return fout ? 1 : 0;
}
