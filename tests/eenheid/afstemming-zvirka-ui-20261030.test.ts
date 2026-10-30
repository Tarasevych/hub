// Afstemming vNext — ZVIRKA-UI (uitvoerder D3, 30.10.2026). Draaien: node scripts/eenheidstests.mjs afstemming-zvirka
//   A. zvirka-kern.ts wordt ECHT uitgevoerd (geen beweringen): deterministische grafindeling, filters, zoom-wiskunde,
//      groepering van controles, postflight-labels (scenario 4: uitgerold ≠ bevestigd) en de mogelijkheden-filter.
//   B. Bestandsgerichte controles van de vijf onderdelen: contract-aanroepen, data-afv-haken, eerlijke teksten,
//      geen innerHTML/window-popups, geen vreemde afhankelijkheden, en de C3-bestanden blijven onaangeraakt.
//   C. afstemming-mobiel.css: alles binnen @media, geen hex, geen position:fixed, aanraakdoelen.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { GEZONDHEID_LABEL, KOPPEL_SOORTEN, type Kaart, type KoppelSoort } from '../../shared/afstemming-model';
import {
  GEZONDHEID_KLEUR, RAND_KLEUR, filterMogelijkheden, grafIndeling, groepeerKaarten, postflightLabel, preflightLabel, zoomViewBox,
} from '../../src/afstemming-vnext/zvirka-kern';
import type { GraafUit } from '../../src/afstemming-vnext/afstemming-client';

const lees = (f: string) => readFileSync(f, 'utf8');
const zonderCommentaar = (bron: string) => bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** Elke top-level CSS-regel moet een @media zijn (max-width of pointer: coarse); daarbuiten mag dit bestand niets stylen. */
function allesBinnenMedia(css: string): boolean {
  const zonder = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let diepte = 0; let kop = ''; let blokken = 0;
  for (const ch of zonder) {
    if (ch === '{') { if (diepte === 0) { blokken++; if (!/^@media[^{]*(max-width|pointer\s*:\s*coarse)/.test(kop.trim())) return false; } diepte++; kop = ''; }
    else if (ch === '}') { diepte = Math.max(0, diepte - 1); kop = ''; }
    else if (diepte === 0) kop += ch;
  }
  return diepte === 0 && blokken > 0;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('afstemming-zvirka-ui-20261030');

  // ================================================================ A1. grafindeling: deterministisch en meetbaar
  const MAAT = 640;
  const graaf: GraafUit = {
    knopen: [
      { id: 'k1', externId: 'UI-010', titel: ['Десять', 'Tien'], fase: 'deployed', gezondheid: 'working', dienst: 'mail' },
      { id: 'k2', externId: 'UI-014', titel: ['Картотека', 'Kartotheek'], fase: 'draft', gezondheid: 'unknown', dienst: 'api' },
      { id: 'k3', externId: 'UI-012', titel: ['Навігація', 'Navigatie'], fase: 'approved', gezondheid: 'partially_working', dienst: 'api' },
      { id: 'k4', externId: 'CAN-001', titel: ['Канон', 'Canon'], fase: 'accepted', gezondheid: 'working', dienst: 'all' },
    ],
    randen: [
      { van: 'k2', naar: 'k1', soort: 'relates_to', stand: 'bevestigd' },
      { van: 'k2', naar: 'k3', soort: 'conflicts_with', stand: 'voorgesteld' },
      { van: 'k3', naar: 'k4', soort: 'depends_on', stand: 'bevestigd' },
      { van: 'k1', naar: 'spook', soort: 'blocks', stand: 'bevestigd' },
    ],
  };
  const alle = { dienst: '', soorten: KOPPEL_SOORTEN, alleenBevestigd: false };
  const a = grafIndeling(graaf, alle, MAAT);
  const b = grafIndeling(graaf, alle, MAAT);
  check('A1 deterministisch: twee keer dezelfde invoer → exact dezelfde tekening', JSON.stringify(a) === JSON.stringify(b));
  check('A1 alle knopen getekend, de spook-rand (onbekend eindpunt) stil weggelaten', a.knopen.length === 4 && a.randen.length === 3);
  const c = MAAT / 2; const straal = MAAT * 0.38;
  check('A1 knopen liggen op de cirkel (straal 0,38 × maat, afgerond op 0,1)', a.knopen.every((k) => Math.abs(Math.hypot(k.x - c, k.y - c) - straal) < 0.6));
  const volgorde = a.knopen.map((k) => `${k.dienst}:${k.externId}`).join(',');
  check('A1 stabiele sortering: dienst-groepen aaneengesloten, externId alfabetisch', volgorde === 'all:CAN-001,api:UI-012,api:UI-014,mail:UI-010');
  check('A1 diensten-lijst voor de filter komt uit de data', a.diensten.join(',') === 'all,api,mail');
  const rand = a.randen.find((r) => r.van === 'k2' && r.naar === 'k1')!;
  const vanKnoop = a.knopen.find((k) => k.id === 'k2')!; const naarKnoop = a.knopen.find((k) => k.id === 'k1')!;
  check('A1 rand-eindpunten vallen samen met de knoopposities', rand.x1 === vanKnoop.x && rand.y1 === vanKnoop.y && rand.x2 === naarKnoop.x && rand.y2 === naarKnoop.y);
  const midX = (rand.x1 + rand.x2) / 2; const midY = (rand.y1 + rand.y2) / 2;
  check('A1 stuurpunt van de boog ligt tussen het lijnmidden en het centrum (leesbare kromming)', Math.hypot(rand.mx - c, rand.my - c) < Math.hypot(midX - c, midY - c) + 0.01);

  // ---- filters
  const alleenApi = grafIndeling(graaf, { ...alle, dienst: 'api' }, MAAT);
  check('A1 dienst-filter beperkt de knopen en laat bungelende randen vallen', alleenApi.knopen.length === 2 && alleenApi.randen.length === 1 && alleenApi.randen[0].soort === 'conflicts_with');
  const alleenDepends = grafIndeling(graaf, { ...alle, soorten: ['depends_on'] as readonly KoppelSoort[] }, MAAT);
  check('A1 soorten-filter: alleen de gekozen koppelsoort blijft', alleenDepends.randen.length === 1 && alleenDepends.randen[0].soort === 'depends_on');
  const bevestigd = grafIndeling(graaf, { ...alle, alleenBevestigd: true }, MAAT);
  check('A1 «лише підтверджені»: de voorgestelde (gestippelde) rand valt weg', bevestigd.randen.length === 2 && bevestigd.randen.every((r) => r.stand === 'bevestigd'));

  // ================================================================ A2. zoom-wiskunde
  check('A2 zoomViewBox 100%: de hele tekening', zoomViewBox(640, 1, 0, 0) === '0 0 640 640');
  check('A2 zoomViewBox 200%: helft zo breed, gecentreerd', zoomViewBox(640, 2, 0, 0) === '160 160 320 320');
  check('A2 zoomViewBox met pan: verschuiving in tekening-eenheden', zoomViewBox(640, 2, 10, -20) === '170 140 320 320');
  check('A2 zoomViewBox beschermt tegen schaal 0', zoomViewBox(640, 0, 0, 0).split(' ').every((v) => Number.isFinite(Number(v))));

  // ================================================================ A3. controles-groepering: feiten, geen meningen
  const kaart = (over: Partial<Kaart>): Kaart => ({ id: over.id || 'x', externId: 'X-1', levensfase: 'approved', gezondheid: 'working', revisieId: 'r', revisieNummer: 1, titel: ['т', 't'], samenvatting: ['', ''], dienst: 'api', categorie: 'c', prioriteit: 'P2', criteriaTotaal: 0, criteriaGeslaagd: 0, koppelingen: 0, bewijs: 0, openConflicten: 0, bronSoort: 'gesprek', provenance: '', aangemaaktOp: '', bijgewerktOp: '', versie: 1, ...over } as Kaart);
  const groepen = groepeerKaarten([
    kaart({ id: 'zb', criteriaTotaal: 3, bewijs: 0 }),
    kaart({ id: 'metBewijs', criteriaTotaal: 3, bewijs: 2 }),
    kaart({ id: 'zonderCriteria', criteriaTotaal: 0, bewijs: 0 }),
    kaart({ id: 'reg', gezondheid: 'regressed' }),
    kaart({ id: 'onb', gezondheid: 'unknown' }),
    kaart({ id: 'weg', criteriaTotaal: 5, bewijs: 0, gezondheid: 'regressed', gearchiveerd: true }),
  ]);
  check('A3 «без доказів»: criteria aanwezig én nul bewijsstukken — niets anders', groepen.zonderBewijs.map((k) => k.id).join(',') === 'zb');
  check('A3 regressies en onbekend gegroepeerd op gezondheid', groepen.regressies.map((k) => k.id).join(',') === 'reg' && groepen.onbekend.map((k) => k.id).join(',') === 'onb');
  check('A3 gearchiveerde kaarten tellen nergens mee', ![...groepen.zonderBewijs, ...groepen.regressies, ...groepen.onbekend].some((k) => k.id === 'weg'));

  // ================================================================ A4. scenario 4: uitgerold ≠ bevestigd
  const nc = postflightLabel('niet_gecontroleerd');
  check('A4 «Розгорнуто, не підтверджено» is GEEL (warn), letterlijk zoals het dossier eist', nc.kleur === 'warn' && nc.uk === 'Розгорнуто, не підтверджено');
  check('A4 gecontroleerd → ok; regressie → fout', postflightLabel('gecontroleerd').kleur === 'ok' && postflightLabel('regressie').kleur === 'fout');
  check('A4 preflight «ongeregistreerd» heet eerlijk «Незареєстрована зміна» (warn)', preflightLabel('ongeregistreerd').kleur === 'warn' && preflightLabel('ongeregistreerd').uk === 'Незареєстрована зміна');

  // ================================================================ A5. mogelijkheden-filter
  const rubrieken = [
    { dienst: 'mail', items: [{ externId: 'UI-010', titel: ['Пошта швидко', 'Mail snel'] as [string, string], uitleg: 'Лист відкривається збоку.', route: 'mail.tarasevych.com/inbox', stand: 'перевірено' as const }] },
    { dienst: 'cloud', items: [{ externId: 'UI-020', titel: { uk: 'Хмара' }, uitleg: 'Файли з теками.', route: 'cloud.tarasevych.com/bestanden', stand: 'не перевірено' as const }] },
  ];
  check('A5 lege zoekterm → alles', filterMogelijkheden(rubrieken, '  ').length === 2);
  check('A5 vindt op externId, hoofdletterongevoelig', filterMogelijkheden(rubrieken, 'ui-010').length === 1 && filterMogelijkheden(rubrieken, 'ui-010')[0].dienst === 'mail');
  check('A5 vindt op Oekraïense titel en op route; lege rubrieken vallen weg', filterMogelijkheden(rubrieken, 'хмара').length === 1 && filterMogelijkheden(rubrieken, 'bestanden')[0].dienst === 'cloud' && filterMogelijkheden(rubrieken, 'niets-hiervan').length === 0);

  // ================================================================ A6. kleuren: dekkend en alleen tokens
  check('A6 RAND_KLEUR dekt alle koppelsoorten met var(--…)-tokens', KOPPEL_SOORTEN.every((s) => /^var\(--[a-z]+\)$/.test(RAND_KLEUR[s])));
  check('A6 GEZONDHEID_KLEUR dekt alle gezondheden met var(--…)-tokens', (Object.keys(GEZONDHEID_LABEL) as Array<keyof typeof GEZONDHEID_LABEL>).every((g) => /^var\(--[a-z]+\)$/.test(GEZONDHEID_KLEUR[g])));

  // ================================================================ B. de vijf onderdelen: bron-controles
  const MIJN = {
    relatiekaart: 'src/afstemming-vnext/onderdelen/Relatiekaart.tsx',
    controles: 'src/afstemming-vnext/onderdelen/Controles.tsx',
    releases: 'src/afstemming-vnext/onderdelen/Releases.tsx',
    mogelijkheden: 'src/afstemming-vnext/onderdelen/Mogelijkheden.tsx',
    bronnen: 'src/afstemming-vnext/onderdelen/Bronnen.tsx',
  } as const;
  const inhoud = new Map(Object.values(MIJN).map((f) => [f, lees(f)]));
  for (const [f, t] of inhoud) {
    const schoon = zonderCommentaar(t);
    check(`B ${f.split('/').pop()}: geen innerHTML en geen window.prompt/confirm/alert`, !/innerHTML/i.test(schoon) && !/\b(?:window\s*\.\s*)?(?:prompt|confirm|alert)\s*\(/.test(schoon));
    check(`B ${f.split('/').pop()}: tweetalig via tr( en zonder vreemde afhankelijkheden`, t.includes('tr(lang') && [...t.matchAll(/from\s+'([^']+)'/g)].every((m) => m[1].startsWith('.') || m[1] === 'react' || m[1] === 'lucide-react'));
  }
  check('B geen van de vijf raakt C3-bestanden aan (KaartDetail/Kartotheek/Overzicht/Toevoegen/Geschiedenis als import)', [...inhoud.values()].every((t) => !/from\s+'\.\/(Kartotheek|Overzicht|Toevoegen|Geschiedenis|KaartDetail)'/.test(t)));

  const rel = inhoud.get(MIJN.relatiekaart)!;
  check('B Relatiekaart: laadt de ECHTE graf (afstemmingClient.graaf) en importeert het mobiele css-bestand', rel.includes('afstemmingClient.graaf(') && rel.includes("'../afstemming-mobiel.css'"));
  check('B Relatiekaart: afgesproken haken data-afv-graaf/-knoop/-rand/-zoom', rel.includes('data-afv-graaf') && rel.includes('data-afv-knoop={k.externId}') && rel.includes('data-afv-rand={r.soort}') && rel.includes("data-afv-zoom=''"));
  check('B Relatiekaart: voorgestelde randen gestippeld, bevestigde niet', rel.includes("strokeDasharray={r.stand === 'bevestigd' ? undefined : '6 4'}"));
  check('B Relatiekaart: legenda met de contractlabels (KOPPEL_LABEL) + uitleg van de stippellijn', rel.includes('KOPPEL_LABEL[s]') && rel.includes('пунктир — запропоновано'));
  check('B Relatiekaart: knoop heeft <title> (zweeftekst) en opent de kaart via openKaart (geen eigen detail)', rel.includes('<title>') && rel.includes('openKaart(gekozen.id)'));
  check('B Relatiekaart: eerlijke lege toestand met weg naar de kartotheek', rel.includes('Зв’язків поки немає') && rel.includes("naarSectie('kartotheek')"));
  check('B Relatiekaart: pannen rekent met de echte schaal (geen vaste pixelfactor)', rel.includes('MAAT / schaal') && rel.includes('getBoundingClientRect'));

  const con = inhoud.get(MIJN.controles)!;
  check('B Controles: leest kaarten én rapport, groepeert via de bewezen kern', con.includes('afstemmingClient.kaarten({})') && con.includes('afstemmingClient.rapport()') && con.includes('groepeerKaarten('));
  check('B Controles: eerlijkheidsregel over live probes (data-afv-eerlijk) en verouderd-uitleg met de contracttermijn', con.includes("data-afv-eerlijk=''") && con.includes('AFSTEMMING_LIMIETEN.gezondheidVerouderdDagen'));
  check('B Controles: scan via de scanroute, vondsten met soortbadge (data-afv-bevinding)', con.includes('afstemmingClient.scan()') && con.includes('data-afv-bevinding={b.soort}') && con.includes("data-afv-scan=''"));
  check('B Controles (scenario 6): vondst zonder kaart → concept met idempotentiesleutel scan:<sleutel>, daarna de kaart openen', con.includes('`scan:${b.sleutel}`') && con.includes('maakConcept') && con.includes('openKaart(kaart.id)'));
  check('B Controles: kaart zonder spoor → bestaande kaart openen, geen nieuwe maken', con.includes("b.soort === 'kaart_zonder_spoor' && b.kaartId") && con.includes('openKaart(b.kaartId!)'));

  const rls = inhoud.get(MIJN.releases)!;
  check('B Releases: echte routes releases/postflight/release-koppel', rls.includes('afstemmingClient.releases()') && rls.includes('afstemmingClient.postflight(') && rls.includes('afstemmingClient.releaseKoppel('));
  check('B Releases (scenario 4): postflight-badge via de bewezen labels + stand-haak', rls.includes('postflightLabel(') && rls.includes('data-afv-postflight-stand={k.postflight}'));
  check('B Releases: haken data-afv-release/-postflight en koppelzekerheid als keuze, nooit stilzwijgend 100%', rls.includes('data-afv-release={release.versie}') && rls.includes('data-afv-postflight={release.versie}') && rls.includes("<option value='0.8'>80%</option>"));
  check('B Releases: ongeregistreerde wijzigingen zichtbaar als waarschuwing', rls.includes('Незареєстровані зміни'));
  check('B Releases: eerlijke lege toestand + read-only-uitspraak over de installatiegeschiedenis', rls.includes('Випусків ще не зафіксовано') && rls.includes('read-only'));

  const mog = inhoud.get(MIJN.mogelijkheden)!;
  check('B Mogelijkheden: leest de gidsroute en filtert via de bewezen kern', mog.includes('afstemmingClient.mogelijkheden()') && mog.includes('filterMogelijkheden('));
  check('B Mogelijkheden: groen UITSLUITEND bij server-stand «перевірено»; neutraal anders', /stand === 'перевірено'[\s\S]{0,160}ok-zacht/.test(mog) && mog.includes("data-afv-stand='не перевірено'") && (mog.match(/ok-zacht/g) || []).length === 1);
  check('B Mogelijkheden: uitleg dat «перевірено» productiebewijs vraagt + haken per item', mog.includes('доказ') && mog.includes('production') && mog.includes('data-afv-mogelijkheid={i.externId}'));

  const brn = inhoud.get(MIJN.bronnen)!;
  check('B Bronnen: agent-API met de drie echte routes en de mensenregel AGENT_MAG_NIET', brn.includes('/api/owner/afstemming/voorstel') && brn.includes('/api/owner/afstemming/bewijs') && brn.includes("actie: 'stel-voor'") && brn.includes('AGENT_MAG_NIET'));
  check('B Bronnen: precies 3 bronnen «werkt» (de echte routes) en 4 «gepland» — niets doet alsof het gekoppeld is', (brn.match(/'werkt', '/g) || []).length === 3 && (brn.match(/'gepland', '/g) || []).length === 4 && brn.includes('заплановано'));
  check('B Bronnen: rapport op aanvraag (week/maand) met cijfers en de servertekst', brn.includes("data-afv-rapport='week'") && brn.includes("data-afv-rapport='maand'") && brn.includes('afstemmingClient.rapport(') && brn.includes("data-afv-rapport-uit=''"));

  // ================================================================ C. mobiel css
  const css = lees('src/afstemming-vnext/afstemming-mobiel.css');
  check('C css: ALLES binnen @media (max-width of pointer: coarse)', allesBinnenMedia(css));
  const cssSchoon = css.replace(/\/\*[\s\S]*?\*\//g, '');
  check('C css: geen hex-kleuren en geen position:fixed (commentaar niet meegerekend)', !/#[0-9a-fA-F]{3,8}\b/.test(cssSchoon) && !/position\s*:\s*fixed/.test(cssSchoon));
  check('C css: aanraakdoelen op de mobiele tikhoogte + één-vinger-pannen op de graf', css.includes('var(--tik-hoogte-mobiel)') && css.includes('touch-action: none'));
  check('C css: brede inhoud scrolt BINNEN het blok, nooit de pagina', css.includes('overflow-x: auto') && css.includes('overflow-wrap: anywhere'));

  return einde();
}
