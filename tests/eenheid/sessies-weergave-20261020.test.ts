// Eenheidstest 20.10.2026 — «https://id.tarasevych.com/sessies виглядає, що попало: текст поїхав весь, а кнопки
// іноді чи опції надмірно великі» (klacht van de eigenaar, met schermafbeelding).
//
// WAT ER MIS WAS (de oorzaak, niet het symptoom): de kop van elke dienstkaart («Пошта / Вкладка», «Адміністрування / вхід») was
// ÉÉN flexrij zonder omloop: pictogram, naamblok (flex:1, basis 0, min-width:0) en daarnaast de badges die er in oktober bij
// kwamen — aanmeldmethode, «Користувацький + технічний» (18.10) en «Підтвердження запам'ятано до <datum>» (19–20.10).
// Bij krapte verdeelt flexbox het krimpen naar de basis: een item met basis 0 levert alles in, de badges met basis auto niets.
// Het naamblok werd dus tot NUL breedte geperst en liep met overflow-wrap:anywhere letter voor letter naar beneden, terwijl de
// badges zelf werden afgekapt. De kaartbreedte zelf was niet het probleem (17rem per kolom is genoeg voor «Адміністрування»).
//
// Deze test controleert de REGELS (CSS + opbouw), niet een schermafbeelding: een raster met minmax(0,1fr) voor de naam, de
// badges op een eigen omlopende regel, niets wat stil wordt afgekapt, één knopgewicht en één kolom op een smal scherm.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

/** Alle declaraties van de regels waarin deze selector letterlijk in de selectorlijst voorkomt (at-regels meegerekend). */
function regels(css: string, selector: string): string[] {
  const uit: string[] = [];
  for (const blok of css.split('}')) {
    const i = blok.indexOf('{');
    if (i < 0) continue;
    const kop = blok.slice(0, i).split('\n').pop() ?? '';
    const lijst = kop.split(',').map((x) => x.trim());
    if (lijst.includes(selector)) uit.push(blok.slice(i + 1).trim());
  }
  return uit;
}
const alles = (css: string, selector: string) => regels(css, selector).join(' ; ');
const heeft = (css: string, selector: string, stuk: string) => alles(css, selector).replace(/\s+/g, '').includes(stuk.replace(/\s+/g, ''));

export async function main(): Promise<number> {
  const { check, einde } = checker('sessies-weergave-20261020');
  const sessiesCss = readFileSync('src/sessies/sessies.css', 'utf8');
  const accessCss = readFileSync('src/toegangslaag.css', 'utf8');
  const menuCss = readFileSync('src/menu-v2.css', 'utf8');
  const paneel = readFileSync('src/BeveiligingSessiesPaneel.tsx', 'utf8');
  const overzicht = readFileSync('src/SessiesOverzicht.tsx', 'utf8');

  // ------------------------------------------------------------------ 1. de oorzaak: de naam kan niet meer tot nul krimpen
  check('kop van een dienstkaart is een raster, niet één flexrij', heeft(sessiesCss, '.sessie-dienst-kop', 'display:grid'));
  check('naamkolom is minmax(0,1fr): breder dan nul, nooit breder dan de kaart', heeft(sessiesCss, '.sessie-dienst-kop', 'grid-template-columns:autominmax(0,1fr)'));
  check('het naamblok zelf houdt min-width:0 (anders duwt een lange naam de kaart op)', heeft(sessiesCss, '.sessie-dienst-kop>div', 'min-width:0'));
  check('de naam breekt niet meer op elke letter (overflow-wrap:break-word, geen anywhere)',
    heeft(sessiesCss, '.sessie-dienst-kop strong', 'overflow-wrap:break-word') && !alles(sessiesCss, '.sessie-dienst-kop strong').includes('anywhere')
    && !alles(sessiesCss, '.sessie-dienst-kop small').includes('anywhere'));

  // ------------------------------------------------------------------ 2. de badges: eigen regel, omlopend, niet afgekapt
  check('badges staan in de opbouw in hun eigen rij (sessie-dienst-badges) en niet los in de kop',
    /className='sessie-dienst-badges'>\s*<Methode/.test(paneel) && paneel.includes('sessie-dienst-badges'));
  const badgeRij = alles(sessiesCss, '.sessie-dienst-badges');
  check('die rij loopt over de hele kaart en breekt af naar een volgende regel', badgeRij.replace(/\s+/g, '').includes('grid-column:1/-1') && badgeRij.includes('flex-wrap:wrap'));
  check('badgetekst loopt om in plaats van te krimpen of te worden afgekapt',
    ['.sessie-methode', '.sessie-niveau', '.sessie-onthouden'].every((sel) => heeft(sessiesCss, sel, 'white-space:normal')));
  check('geen stille maskering: nergens text-overflow:ellipsis of overflow:hidden op de badges of de kaartkop',
    !/\.(sessie-dienst-kop|sessie-dienst-badges|sessie-onthouden|sessie-niveau|sessie-methode)[^{}]*\{[^}]*(text-overflow|overflow\s*:\s*hidden)/.test(sessiesCss));
  check('lange waarden (IPv6, id\'s, User-Agent) mogen wél binnen het woord breken, in hun eigen vak',
    heeft(sessiesCss, '.sessie-netwerk dd', 'overflow-wrap:anywhere') && heeft(sessiesCss, '.sessie-diensten dd', 'overflow-wrap:anywhere'));

  // ------------------------------------------------------------------ 3. smal scherm: alles onder elkaar
  const smal = sessiesCss.split('@media (max-width:640px)').slice(1).join(' ');
  check('op een smal scherm één kolom voor de dienstkaarten én voor het netwerkvak', /\.sessie-diensten,\.sessie-netwerk\{grid-template-columns:1fr\}/.test(smal.replace(/\s+/g, '')) || /grid-template-columns:1fr/.test(smal));
  check('de kolommen zijn nooit breder dan de kaart (minmax(min(100%,…)))',
    heeft(sessiesCss, '.sessie-diensten', 'repeat(auto-fill,minmax(min(100%,17rem),1fr))') && heeft(sessiesCss, '.sessie-netwerk', 'minmax(min(100%,14rem),1fr)'));

  // ------------------------------------------------------------------ 4. de schakelaar «Зберегти цей акаунт»
  check('«Зберегти цей акаунт для наступних сесій» gebruikt DE schakelaar van de site (.zijbalk-schakel + spoor)',
    overzicht.includes("className='zijbalk-schakel'") && overzicht.includes("className='zijbalk-schakel-spoor'") && overzicht.includes("role='switch'"));
  check('geen reuzen-vinkje meer: de oude kaartklasse van het aanmeldscherm staat niet meer op dit vinkje',
    !overzicht.includes('canonical-signed-out-remember'));
  check('die schakelaar bestaat echt in menu-v2.css (zelfde maat als elders: spoor 38×22)', heeft(menuCss, '.zijbalk-schakel-spoor', 'width:38px') && heeft(menuCss, '.zijbalk-schakel-spoor', 'height:22px'));
  check('de kaart eromheen wordt in «Сесії та пристрої» opgemaakt', accessCss.includes('.sessies-onthouden .zijbalk-schakel'));

  // ------------------------------------------------------------------ 5. knoppen van één gewicht
  const knopRegel = ['.sessie-rij-acties .sessie-secundair', '.sessie-apparaat-acties .identity-danger', '.sessie-diensten .security-revoke'].map((sel) => alles(sessiesCss, sel)).join(' ; ');
  const knopHoogten = ['.sessie-rij-acties .sessie-secundair', '.sessie-apparaat-acties .identity-danger', '.sessie-apparaat-acties .sessies-secundair', '.sessie-diensten .security-revoke'].every((sel) => alles(sessiesCss, sel).replace(/\s+/g, '').includes('min-height:2.5rem'));
  check('rijknoppen, kaartknoppen en «Відкликати» hebben dezelfde hoogte en ronding', knopHoogten && knopRegel.includes('border-radius:12px'));
  check('in de instellingen krijgen «Відкликати» en de rijknoppen hetzelfde gewicht als «Оновити»/«Вийти всюди»',
    accessCss.includes(':is(.security-revoke,.sessie-secundair)') && /:is\(\.security-revoke,\.sessie-secundair\)\{[^}]*min-height:40px/.test(accessCss.replace(/\s+/g, '')));
  check('icoonmaat in knoppen is overal gelijk (1rem in de kaart, 18px in de instellingen)',
    ['.sessie-rij-acties .sessie-secundair svg', '.sessie-apparaat-acties svg', '.sessie-diensten .security-revoke svg'].every((sel) => heeft(sessiesCss, sel, 'width:1rem')));

  return einde();
}
