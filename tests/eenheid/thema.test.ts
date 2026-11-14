// Thema: palet + modus + automatisch schakelen (zon / tijdvenster / pauze); de opstart-kopie in public/canonical-service.js
// moet exact hetzelfde beslissen; gegenereerde CSS actueel; contrast van de nieuwe paletten (WCAG AA).
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { UITERLIJK_PALETTEN } from '../../shared/uiterlijk';
import { autoNu, isKlassiekPalet, isMaquetteStelsel, leesKeuze, normaalAuto, PALETTEN, pauzeer, resolveer, zonTijden } from '../../src/thema/kern';
import { bootCss, contrast, KLASSIEK_WIT, KLASSIEK_ZWART, kleurWaarden, MAQUETTE, paletCss, PUUR, SECTIES } from '../../src/thema/paletten';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('thema');
  process.env.TZ = 'Europe/Brussels';
  const t = (s: string) => new Date(s).getTime();
  const uur = (ms: number) => new Date(ms).toTimeString().slice(0, 5);

  // zon: Brussel, burgerlijke schemering (±15 min van de tabellen is genoeg om «donker buiten» te volgen)
  const okt = zonTijden(new Date('2026-10-10T12:00'), 50.8, 4.4);
  check('Brussel 10.10: licht ± 07:30–19:30', typeof okt === 'object' && Math.abs(t('2026-10-10T07:33') - okt.op) < 15 * 60e3 && Math.abs(t('2026-10-10T19:34') - okt.onder) < 15 * 60e3, typeof okt === 'object' ? `${uur(okt.op)}–${uur(okt.onder)}` : String(okt));
  const jun = zonTijden(new Date('2026-06-21T12:00'), 50.8, 4.4);
  check('Brussel 21.06: licht ± 04:45–22:45 (zomertijd)', typeof jun === 'object' && Math.abs(t('2026-06-21T04:47') - jun.op) < 15 * 60e3 && Math.abs(t('2026-06-21T22:40') - jun.onder) < 15 * 60e3, typeof jun === 'object' ? `${uur(jun.op)}–${uur(jun.onder)}` : '');
  check('Spitsbergen: poolnacht/witte nacht', zonTijden(new Date('2026-12-21T12:00'), 78, 15) === 'nacht' && zonTijden(new Date('2026-06-21T12:00'), 78, 15) === 'dag');

  // tijdvenster 20:00–07:00 (over middernacht)
  const a = normaalAuto({ soort: 'interval', van: '20:00', tot: '07:00' });
  check('venster: 06:59 donker, 07:00 licht, 19:59 licht, 20:00 donker', autoNu(a, t('2026-10-10T06:59')).donker && !autoNu(a, t('2026-10-10T07:00')).donker && !autoNu(a, t('2026-10-10T19:59')).donker && autoNu(a, t('2026-10-10T20:00')).donker);
  check('venster: volgende wissel om 20:00 en daarna 07:00 morgen', autoNu(a, t('2026-10-10T12:00')).volgende === t('2026-10-10T20:00') && autoNu(a, t('2026-10-10T21:00')).volgende === t('2026-10-11T07:00'));
  const dag = normaalAuto({ soort: 'interval', van: '09:00', tot: '17:00' });
  check('venster binnen één dag (09–17 donker)', autoNu(dag, t('2026-10-10T10:00')).donker && !autoNu(dag, t('2026-10-10T18:00')).donker);

  // pauze «Скасувати на сьогодні»: andere modus tot het volgende moment, daarna weer automatisch
  const p = pauzeer(a, t('2026-10-10T20:30'));
  check('pauze om 20:30 (net donker) → licht tot 07:00 morgen', p.pauzeModus === 'light' && p.pauzeTot === t('2026-10-11T07:00') && !autoNu(p, t('2026-10-10T23:00')).donker && autoNu(p, t('2026-10-10T23:00')).gepauzeerd);
  check('na de pauze weer automatisch', !autoNu(p, t('2026-10-11T08:00')).gepauzeerd && !autoNu(p, t('2026-10-11T08:00')).donker && autoNu(p, t('2026-10-11T21:00')).donker);

  // keuzes en oude waarden
  check('oud «plum-dark» → violet + donker', JSON.stringify(leesKeuze('plum-dark', undefined)) === '{"modus":"dark","palet":"violet"}');
  check('standaard: palet «kleur», modus «device»', JSON.stringify(leesKeuze(undefined, undefined)) === '{"modus":"device","palet":"kleur"}');
  check('palet «maquette» + modus «dark»', JSON.stringify(leesKeuze('dark', 'maquette')) === '{"modus":"dark","palet":"maquette"}');
  check('PALETTEN en UITERLIJK_PALETTEN bevatten exact dezelfde 7 paletten', PALETTEN.length === 7 && UITERLIJK_PALETTEN.length === 7 && PALETTEN.every((x) => (UITERLIJK_PALETTEN as readonly string[]).includes(x)));
  check('isKlassiekPalet en isMaquetteStelsel herkennen maquette en beide klassieke paletten', isKlassiekPalet('klassiek-wit') && isKlassiekPalet('klassiek-zwart') && !isKlassiekPalet('maquette') && isMaquetteStelsel('maquette') && isMaquetteStelsel('klassiek-wit') && isMaquetteStelsel('klassiek-zwart') && !isMaquetteStelsel('kleur'));
  check(
    'klassiek-wit dwingt altijd een vaste lichte toon af zonder de opgeslagen modus te wissen',
    leesKeuze('dark', 'klassiek-wit').modus === 'dark' &&
      (['light', 'dark', 'device', 'auto'] as const).every((m) => {
        const uit = resolveer({ theme: m, palet: 'klassiek-wit', auto: p, apparaatDonker: true, nu: t('2026-10-10T23:00') });
        return !uit.donker && uit.palet === 'klassiek-wit' && uit.presentatie === 'light' && uit.volgende === null && !uit.gepauzeerd;
      }),
  );
  check(
    'klassiek-zwart dwingt altijd een vaste donkere toon af zonder de opgeslagen modus te wissen',
    leesKeuze('light', 'klassiek-zwart').modus === 'light' &&
      (['light', 'dark', 'device', 'auto'] as const).every((m) => {
        const uit = resolveer({ theme: m, palet: 'klassiek-zwart', auto: a, apparaatDonker: false, nu: t('2026-10-10T12:00') });
        return uit.donker && uit.palet === 'klassiek-zwart' && uit.presentatie === 'dark' && uit.volgende === null && !uit.gepauzeerd;
      }),
  );
  const r = resolveer({ theme: 'dark', palet: 'violet', auto: undefined, apparaatDonker: false, nu: 0, violetToegestaan: false });
  check('violet zonder recht → grifel (opgeslagen keuze blijft)', r.palet === 'grifel' && r.presentatie === 'dark');
  check('normaalAuto: rommel → standaard, coördinaten afgerond op 0,1°', JSON.stringify(normaalAuto({ soort: 'x', van: '25:00', lat: 50.84567, lon: 4.35678 })) === '{"soort":"zon","van":"20:00","tot":"07:00","lat":50.8,"lon":4.4}');

  // opstart-kopie (public/canonical-service.js) beslist exact hetzelfde
  const venster: Record<string, unknown> = {};
  const ctx = { window: venster, location: { hostname: 'id.tarasevych.com', pathname: '/', search: '' }, document: { cookie: '', querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL };
  (venster as Record<string, unknown>).addEventListener = () => undefined;
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), ctx);
  const rt = venster.__TSV_CANONICAL_SERVICE__ as { thema?: (o: unknown) => unknown } | undefined;
  check('canonical-service.js heeft runtime.thema', typeof rt?.thema === 'function');
  let verschil = '', combinaties = 0;
  const themes = ['light', 'dark', 'device', 'auto', 'plum-dark', 'plum-light', undefined, 'onzin'];
  const paletten = ['grifel', 'puur', 'violet', 'kleur', 'maquette', 'klassiek-wit', 'klassiek-zwart', undefined];
  const autos = [undefined, { soort: 'zon' }, { soort: 'zon', lat: 50.5, lon: 30.5 }, { soort: 'interval', van: '21:30', tot: '06:15' }, { soort: 'interval', van: '08:00', tot: '08:00' }, pauzeer(a, t('2026-10-10T07:30'))];
  for (const theme of themes) for (const palet of paletten) for (const auto of autos) for (const nu of [t('2026-10-10T03:00'), t('2026-10-10T12:00'), t('2026-10-10T19:40'), t('2026-12-21T16:00'), t('2026-06-21T22:50')]) for (const apparaatDonker of [true, false]) for (const violetToegestaan of [true, false, undefined]) {
    combinaties++;
    const o = { theme, palet, auto, apparaatDonker, nu, violetToegestaan };
    const x = JSON.stringify(resolveer(o)), y = JSON.stringify(rt?.thema?.(o));
    if (x !== y && !verschil) verschil = `${JSON.stringify(o)}\n  ts: ${x}\n  js: ${y}`;
  }
  check(`opstart (JS) en app (TS) beslissen identiek over ${combinaties} combinaties`, !verschil && combinaties === 11520, verschil);

  // gegenereerde bestanden actueel
  const indexHtml = readFileSync('index.html', 'utf8');
  check('src/thema/paletten.css actueel (node scripts/thema-css.mjs)', readFileSync('src/thema/paletten.css', 'utf8') === paletCss());
  check('index.html bevat de actuele opstartregels en maquetteStijl-synchronisatie', indexHtml.includes(`/*thema-paletten*/${bootCss()}/*/thema-paletten*/`) && indexHtml.includes("'palet-klassiek-wit','palet-klassiek-zwart'") && indexHtml.includes("root.dataset.maquetteStijl='klassiek'"));

  // contrast (AA 4,5:1 voor tekst): tekst/gedempt op achtergrond en paneel, accent als tekst op paneel en zachte accentvlak,
  // tekst op accentknop
  const fouten: string[] = [];
  const meet = (naam: string, w: typeof PUUR.licht) => {
    for (const [a1, b1, wat] of [[w.text, w.bg, 'tekst/bg'], [w.text, w.panel, 'tekst/paneel'], [w.muted, w.bg, 'gedempt/bg'], [w.muted, w.panel, 'gedempt/paneel'], [w.muted, w.surface, 'gedempt/surface'], [w.accent, w.panel, 'accent/paneel'], [w.accent, w.accentSoft, 'accent/zacht'], [w.accentText, w.accent, 'knoptekst/accent']] as const) {
      const c = contrast(a1, b1); if (c < 4.5) fouten.push(`${naam} ${wat} ${c.toFixed(2)}`);
    }
  };
  meet('puur licht', PUUR.licht); meet('puur donker', PUUR.donker);
  meet('maquette licht', MAQUETTE.licht); meet('maquette donker', MAQUETTE.donker);
  meet('klassiek-wit', KLASSIEK_WIT); meet('klassiek-zwart', KLASSIEK_ZWART);
  for (const s of SECTIES) { const k = kleurWaarden(s); meet(`${s} licht`, k.licht); meet(`${s} donker`, k.donker); }
  check('contrast ≥ 4,5:1 in «Чистий», «Макет», «Біла класика», «Чорна класика» en «Кольоровий» (alle secties, licht en donker)', fouten.length === 0, fouten.join(', '));
  return einde();
}
