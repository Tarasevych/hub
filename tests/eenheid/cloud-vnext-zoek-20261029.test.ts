// Cloud vNext — ZOEKEN + MOBIEL FIJNSLIJPEN (uitvoerder D, 29.10.2026). Draaien: node scripts/eenheidstests.mjs cloud-vnext-zoek-20261029
//   A. Zoeken.tsx: eerlijkheid en het contract — geen innerHTML en geen verzonnen resultaten; zoekt via de BESTAANDE kern
//      (src/zoek/zoek-api → POST /api/owner/zoek) met alleen de bronnen cloud+drive; markering via posities van de server;
//      veld/bronknoppen/staten dragen data-attributen; 300 ms debounce + afbreken; vraaglimiet uit het contract (zoekMax);
//      overgangen via sessionStorage (cvn-open / cvn-drive-open) naar de tabbladen files/google.
//   B. zuivere functies waarop de weergave leunt (stukkenUitPosities, cloudSoort) — bewezen, niet beweerd.
//   C. cloud-vnext-mobiel.css: ALLES binnen @media (max-width of pointer: coarse), geen vaste plaatsing, geen hexkleuren,
//      raakdoelen en veilige randen, raster 2→1 kolommen, kruimels zonder wrap, tabellen met scroll-terugval.
//   D. AgendaFotos.tsx: hergebruik van de bestaande Google-weergaven + een eerlijke niet-gekoppeld-staat (knop naar integraties),
//      status uit de echte bootstrap (onboarding.services), geen innerHTML.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { CLOUD_VNEXT_LIMIETEN, cloudSoort } from '../../shared/cloud-vnext-model';
import { stukkenUitPosities } from '../../src/zoek/zoek-kern';

const lees = (f: string) => readFileSync(f, 'utf8');
/** Code zonder commentaar: het verbod geldt voor GEBRUIK van innerHTML, niet voor de uitleg erover in een commentaar. */
const zonderCommentaar = (bron: string) => bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** Elke top-level CSS-regel moet een @media zijn (max-width of pointer: coarse); daarbuiten mag dit bestand niets stylen. */
function allesBinnenMedia(css: string): boolean {
  const zonder = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let diepte = 0; let kop = ''; let blokken = 0;
  for (const ch of zonder) {
    if (ch === '{') {
      if (diepte === 0) { blokken++; if (!/^@media[^{]*(max-width|pointer\s*:\s*coarse)/.test(kop.trim())) return false; }
      diepte++; kop = '';
    } else if (ch === '}') { diepte = Math.max(0, diepte - 1); kop = ''; }
    else if (diepte === 0) kop += ch;
  }
  return diepte === 0 && blokken > 0;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('cloud-vnext-zoek-20261029');
  const zoeken = lees('src/cloud-vnext/onderdelen/Zoeken.tsx');
  const mobiel = lees('src/cloud-vnext/cloud-vnext-mobiel.css');
  const agenda = lees('src/cloud-vnext/onderdelen/AgendaFotos.tsx');

  // ================================================================ A. Zoeken.tsx
  check('A geen innerHTML/dangerouslySetInnerHTML in Zoeken (commentaar niet meegerekend)', !/innerHTML/i.test(zonderCommentaar(zoeken)));
  check('A geen verzonnen resultaten (geen demo-/nepgegevensarrays in de bron)', !/\b(demoResult|nepResult|fakeResult|mockResult|voorbeeldResult)/i.test(zoeken) && !/items\s*=\s*\[\s*\{/.test(zoeken));
  check('A zoekt via de bestaande kern (src/zoek/zoek-api → zoeken/bronStand/isAfgebroken)', /from '\.\.\/\.\.\/zoek\/zoek-api'/.test(zoeken) && /\bzoeken\(\{/.test(zoeken) && /bronStand\(\)/.test(zoeken));
  check('A markering via posities van de server (stukkenUitPosities uit zoek-kern)', /from '\.\.\/\.\.\/zoek\/zoek-kern'/.test(zoeken) && /stukkenUitPosities/.test(zoeken));
  check('A alleen de cloudbronnen cloud + drive gaan in het verzoek', /\['cloud', 'drive'\] as const/.test(zoeken) && /bronnen: actief/.test(zoeken));
  check('A veld: data-cvn-zoek-veld, autofocus, Enter zoekt meteen, Escape wist', /data-cvn-zoek-veld/.test(zoeken) && /\.focus\(\)/.test(zoeken) && /'Enter'/.test(zoeken) && /'Escape'/.test(zoeken));
  check('A bronknoppen: data-cvn-zoek-bron + aria-pressed, beide standaard aan', /data-cvn-zoek-bron/.test(zoeken) && /aria-pressed/.test(zoeken) && /\{ cloud: true, drive: true \}/.test(zoeken));
  check('A resultaat-, leeg- en foutstaat dragen data-attributen', /data-cvn-zoek-resultaat/.test(zoeken) && /data-cvn-zoek-leeg/.test(zoeken) && /data-cvn-zoek-fout/.test(zoeken));
  check('A 300 ms debounce en het vorige verzoek wordt afgebroken', /, 300\)/.test(zoeken) && /AbortController/.test(zoeken) && /isAfgebroken/.test(zoeken));
  check('A vraaglimiet uit het contract (zoekMax = 120), niet hardgecodeerd', /CLOUD_VNEXT_LIMIETEN\.zoekMax/.test(zoeken) && CLOUD_VNEXT_LIMIETEN.zoekMax === 120 && !/maxLength=\{?120\}?/.test(zoeken));
  check('A overgang eigen bestand: cvn-open + tabblad files; Drive: cvn-drive-open + tabblad google', /'cvn-open'/.test(zoeken) && /naarTab\('files'\)/.test(zoeken) && /'cvn-drive-open'/.test(zoeken) && /naarTab\('google'\)/.test(zoeken));
  check('A Drive-overgang alleen met een echte id uit het antwoord (route.params.drive), anders kale navigatie', /params\.drive/.test(zoeken) && /if \(driveId\)/.test(zoeken));
  check('A eerlijke lege staat: noemt OCR en de indexvernieuwing (~5 хв) + link naar de volledige zoekpagina', /OCR/.test(zoeken) && /5 хвилин/.test(zoeken) && /canonicalNavigationUrl\('hub', 'zoek'/.test(zoeken));
  check('A fout- en gesloten-staten zijn eerlijk (foutTekst + uitleg van de server), met een uitweg', /foutTekst\(lang, fout\)/.test(zoeken) && /gesloten/.test(zoeken) && /Спробувати ще раз/.test(zoeken));
  check('A icoon per soort via cloudSoort uit het gedeelde contract; map blijft een map', /cloudSoort\(mime, naam\)/.test(zoeken) && /r\.soort === 'map' \? Folder/.test(zoeken));
  check('A teksten uk+nl via tr(…)', /tr\(lang, 'Шукаємо…', 'Zoeken…'\)/.test(zoeken));

  // ================================================================ B. zuivere functies
  const stukken = stukkenUitPosities('abcdef', [[1, 3], [2, 4]]);
  check('B posities → stukken: overlap samengevoegd, tekst blijft volledig, markering klopt',
    JSON.stringify(stukken) === JSON.stringify([{ t: 'a', hit: false }, { t: 'bcd', hit: true }, { t: 'ef', hit: false }]));
  check('B ongeldige posities vallen weg (geen lege of omgekeerde markering)',
    JSON.stringify(stukkenUitPosities('ab', [[5, 9], [1, 1]])) === JSON.stringify([{ t: 'ab', hit: false }]));
  check('B cloudSoort: pdf en werkblad worden herkend, onbekend blijft overig',
    cloudSoort('application/pdf') === 'pdf' && cloudSoort('', 'x.xlsx') === 'werkblad' && cloudSoort('application/x-onbekend') === 'overig');

  // ================================================================ C. cloud-vnext-mobiel.css
  check('C alles binnen @media (max-width of pointer: coarse), niets op top-niveau', allesBinnenMedia(mobiel));
  check('C geen vaste plaatsing en geen hexkleuren (alleen tokens)', !/position\s*:\s*fixed/.test(mobiel) && !/#[0-9a-fA-F]{3,8}\b/.test(mobiel.replace(/\/\*[\s\S]*?\*\//g, '')));
  check('C raakdoelen ≥ 44 px (tik-hoogte-mobiel) en veilige randen (veilig-*)', /--tik-hoogte-mobiel/.test(mobiel) && /--veilig-links/.test(mobiel) && /--veilig-onder/.test(mobiel));
  check('C raster: 2 kolommen op smal, 1 kolom onder 420 px', /repeat\(2, minmax\(0, 1fr\)\)/.test(mobiel) && /max-width: 420px/.test(mobiel) && /grid-template-columns: minmax\(0, 1fr\)/.test(mobiel));
  check('C kruimelpad: één regel, horizontaal scrollen, geen wrap', /\.cvn-kruimels/.test(mobiel) && /flex-wrap: nowrap/.test(mobiel) && /white-space: nowrap/.test(mobiel));
  check('C tabellen: scroll-terugval binnen het blok', /\.cvn table/.test(mobiel) && /overflow-x: auto/.test(mobiel));
  check('C kop compacter en lagen worden onderblad/volledig paneel', /\.cvn-kop h2 \{ font-size: 19px/.test(mobiel) && /is-venster/.test(mobiel) && /is-paneel/.test(mobiel));

  // ================================================================ D. AgendaFotos.tsx
  check('D hergebruikt de bestaande Google-weergaven (geen tweede implementatie)', /GoogleCalendarView/.test(agenda) && /GooglePhotosView/.test(agenda) && /GoogleSuiteMediaWeergave/.test(agenda));
  check('D status uit de echte bootstrap (onboarding.services + granted), tolerant gelezen', /onboarding/.test(agenda) && /granted: s\.granted === true/.test(agenda));
  check('D eerlijke niet-gekoppeld-staat met één knop naar het integratiecentrum', /niet-gekoppeld/.test(agenda) && /naarTab\('accounts'\)/.test(agenda) && /не підключено/.test(agenda));
  check('D gekoppeld: in een .cvn-blok met de hint dat dit dezelfde Google-gegevens zijn', /cvn-blok/.test(agenda) && /Ті самі дані Google/.test(agenda));
  check('D geen innerHTML en geen dode koppelknop (onStart leidt naar integraties)', !/innerHTML/i.test(zonderCommentaar(agenda)) && /onStart=\{naarIntegraties/.test(agenda));

  return einde();
}
