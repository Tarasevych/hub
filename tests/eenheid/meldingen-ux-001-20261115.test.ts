// MELDINGEN-UX-001 (15.11.2026): twee panelen bij de bel — compacte panel en zwevend venster — met één wissel op dezelfde plek
// (vlak voor ✕) in beide richtingen; de keuze in de accountvoorkeuren (alle subdomeinen), niet meer alleen localStorage per
// subdomein; kaarten in het venster krimpen niet meer tot smalle stroken; venster opent onder de bel.
// MELDINGEN-UX-001: дві панелі біля дзвіночка з однаковим перемикачем; вибір вигляду в налаштуваннях акаунта; картки не стискаються.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checker } from './hulp/nep-google';
import { normaliseerMeldingen } from '../../shared/menu-meldingen-voorkeuren';

const lees = (rel: string) => readFileSync(resolve(rel), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('meldingen-ux-001-20261115');

  // 1. Voorkeur «paneel»: geldige waarden blijven, onzin en ontbreken = geen keuze (oude opslag ongewijzigd).
  check('voorkeur: venster blijft venster', normaliseerMeldingen({ paneel: 'venster' }).paneel === 'venster');
  check('voorkeur: compact blijft compact', normaliseerMeldingen({ paneel: 'compact' }).paneel === 'compact');
  check('voorkeur: onbekende waarde valt weg', !('paneel' in normaliseerMeldingen({ paneel: 'zwevend' })));
  check('voorkeur: oude opslag zonder veld krijgt geen standaard (terugval op localStorage)', !('paneel' in normaliseerMeldingen({})));
  const soorten = normaliseerMeldingen({ paneel: 'venster', soorten: { post: { geluid: false } } });
  check('voorkeur: types blijven bewaard naast paneel', soorten.soorten.post.geluid === false);

  // 2. Opslag: de keuze leest eerst de accountvoorkeur en schrijft ze ook weg.
  const opslag = lees('src/meldingen/ecosysteem/ecosysteem-opslag.ts');
  check('opslag: leest zijbalk meldingen.paneel vóór localStorage', /zijbalkVoorkeuren\(\)\.meldingen\.paneel[\s\S]{0,200}localStorage\.getItem\(STAND_SLEUTEL\)/.test(opslag));
  check('opslag: zet de keuze in de accountvoorkeuren', /zetZijbalk\(\(cur\) => \(\{ \.\.\.cur, meldingen: \{ \.\.\.cur\.meldingen, paneel: actief \? 'venster' : 'compact' \}/.test(opslag));
  check('opslag: luistert naar wijzigingen van de voorkeuren', opslag.includes('abonneerZijbalk('));

  // 3. Wissel in beide richtingen op dezelfde plek: vlak voor ✕.
  const v2 = lees('src/meldingen/v2/MeldingenV2.tsx');
  const portaal = lees('src/meldingen/ecosysteem/MeldingenPortaal.tsx');
  const centrum = lees('src/CanoniekMeldingencentrum.tsx');
  check('compact: knop «Вікно» vlak voor ✕', /data-qa-id='melding-vorm-venster'[\s\S]{0,700}aria-label=\{t\('Закрити', 'Sluiten'\)\}/.test(v2));
  check('compact: geen «Згорнути»-knop met Minimize2 meer als sluitknop', !/Minimize2/.test(v2));
  check('venster: knop «Компактно» vlak voor ✕', /data-qa-id='melding-vorm-compact'[\s\S]{0,900}aria-label=\{t\('Закрити', 'Sluiten'\)\}/.test(portaal));
  check('venster: oude knop «Компактно біля дзвоника» onderaan weg', !portaal.includes('Компактно біля дзвоника'));
  check('centrum: compacte panel krijgt onVenster', /onVenster=\{\(\) => \{ zetEcosysteemModusActief\(true\); \}\}/.test(centrum));
  check('klassiek paneel: zelfde «Вікно» in plaats van ✨', !/Sparkles/.test(centrum) && centrum.includes("className='cnc-ecosysteem-schakel mv2-vorm-schakel'"));
  check('wissel heeft uitleg hoe terug te gaan (uk)', v2.includes('Повернутися — кнопкою «Компактно» у вікні') && portaal.includes('Повернутися до вікна — кнопкою «Вікно»'));

  // 4. Venster: korte titel, twee groottes in plaats van vier, opent onder de bel.
  check('venster: titel «Сповіщення» (geen afgekapte lange titel)', portaal.includes("<strong>{t('Сповіщення', 'Meldingen')}</strong>") && !portaal.includes('Центр подій і сповіщень'));
  check('venster: standaardplek → onder de bel', /g\.x !== 24 \|\| g\.y !== 72[\s\S]{0,300}canonical-notification-bell[\s\S]{0,300}r\.right - h\.breedte, y: r\.bottom \+ 10/.test(portaal));

  // 5. CSS: kaarten krimpen niet, tabs/chips zonder eigen horizontale schuifbalk.
  const css = lees('src/meldingen/ecosysteem/meldingen-ecosysteem.css');
  const blok = (sel: string) => (css.match(new RegExp(`\\n${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`)) || [])[1] || '';
  check('css: stroomkolom is flex-kolom (geen grid dat rijen samendrukt)', /display: flex;/.test(blok('.mel-stroom-kolom')) && /flex-direction: column/.test(blok('.mel-stroom-kolom')));
  check('css: kaarthouder krimpt nooit', /flex: 0 0 auto/.test(blok('.mel-veeg-houder')));
  check('css: tabs lopen door (wrap), geen overflow-x', /flex-wrap: wrap/.test(blok('.mel-tabs')) && !/overflow-x/.test(blok('.mel-tabs')));
  check('css: kanaalchips lopen door (wrap), geen overflow-x', /flex-wrap: wrap/.test(blok('.mel-kanaal-chips')) && !/overflow-x/.test(blok('.mel-kanaal-chips')));
  check('css: «Вікно» ook in het klassieke paneel gestyled (globaal bestand)', lees('src/canoniek-meldingencentrum.css').includes('.canonical-notification-panel .mv2-vorm-schakel'));

  return einde();
}
