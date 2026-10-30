// Punt 1 van de eigenaarslijst («хрестики»): naast de tab «Огляд» op admin.*/updates stond een kruisje in een rondje.
// Bewezen in de echte browser van de eigenaar (19.10.2026): BEIDE schuifpijlen van de tabbalk (`.ut-tabs-pijl.is-links` met
// ChevronLeft en `.is-rechts` met ChevronRight) stonden zichtbaar op precies dezelfde plek (118,15,28×28) terwijl de tabbalk
// helemaal niet overliep (scrollWidth === clientWidth === 1320). «‹» over «›» heen = een kruisje.
// Oorzaak: `src/BeheerUitrolWeergave.tsx` rendert <div className='admin-uitrol ut-root'>, en `src/beheer-uitrol.css` had een kale
// `.admin-uitrol button{display:inline-flex;…}` (specificiteit 0,1,1) uit de OUDE updatepagina. Die won van
// `.ut-tabs-pijl{display:none}` (0,1,0). Live bewezen: na `deleteRule` van die ene regel werd de computed display van beide
// pijlen `none` en was het kruisje weg.
// Deze test houdt beide kanten vast: de oude regel mag niet meer kaal zijn, en de pijlregel moet sterker zijn dan zo'n
// paginabrede knopregel.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

/** Specificiteit (a,b,c) van één enkelvoudige selector; genoeg voor de regels in dit bestand (geen :is()/:where() hier). */
function specificiteit(sel: string): [number, number, number] {
  const s = sel.trim();
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const klassen = (s.match(/\.[\w-]+/g) || []).length + (s.match(/\[[^\]]+\]/g) || []).length + (s.match(/:(?!:)(?!is\b|where\b)[\w-]+/g) || []).length;
  const elementen = (s.replace(/\[[^\]]+\]/g, '').match(/(^|[\s>+~])[a-z][\w-]*/g) || []).length;
  return [ids, klassen, elementen];
}
const sterker = (a: [number, number, number], b: [number, number, number]) => a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

export async function main(): Promise<number> {
  const { check, einde } = checker('ut-tabs-pijlen-20261019');
  const oud = readFileSync('src/beheer-uitrol.css', 'utf8');
  // 21.10.2026: TabsRij + zijn schuifrij-CSS verhuisd naar het (openbare) ontwerpfundament, omdat ook mcp-agenten de rij gebruikt.
  const nieuw = readFileSync('src/uitrol/uitrol.css', 'utf8') + '\n' + readFileSync('src/ontwerp/tabs-rij.css', 'utf8');
  const tsx = readFileSync('src/ontwerp/TabsRij.tsx', 'utf8');
  const view = readFileSync('src/BeheerUitrolWeergave.tsx', 'utf8');

  // ---- de situatie die het kruisje mogelijk maakte
  check('AdminUitrolView zet nog steeds beide klassen op één element (admin-uitrol + ut-root) — daarom is scoping nodig',
    /className='admin-uitrol ut-root'/.test(view));
  check('TabsRij rendert nog steeds twee pijlen (is-links en is-rechts) op dezelfde absolute plek',
    /ut-tabs-pijl is-links/.test(tsx) && /ut-tabs-pijl is-rechts/.test(tsx));

  // ---- 1. geen enkele kale elementregel meer onder .admin-uitrol
  const kaal = (oud.match(/^\.admin-uitrol\s+(button|input|select|textarea|a|svg)\s*[,{:]/gm) || []);
  check('geen kale `.admin-uitrol <element>`-regel meer in beheer-uitrol.css (die lekte naar de hele nieuwe ut-pagina)',
    kaal.length === 0, kaal.join(' | '));
  check('de oude knopstijl staat nu binnen de oude containers (knoppen/lijst/form/voorstel/intrek)',
    /\.admin-uitrol :is\(\.admin-uitrol-knoppen,\.admin-uitrol-lijst,\.admin-uitrol-form,\.admin-uitrol-voorstel,\.admin-uitrol-intrek\) button\{/.test(oud));

  // ---- 2. de pijlen staan standaard uit, met een selector die sterker is dan zo'n paginabrede knopregel
  const verbergRegel = /(^|\n)([^\n{]*\.ut-tabs-pijl)\{[^}]*display:none/.exec(nieuw);
  check('.ut-tabs-pijl staat standaard op display:none', !!verbergRegel);
  const sel = (verbergRegel?.[2] || '').trim();
  check(`verbergselector «${sel}» is sterker dan een paginabrede knopregel van de omringende pagina`,
    !!sel && sterker(specificiteit(sel), specificiteit('.admin-uitrol button')), JSON.stringify(specificiteit(sel)));
  check('de pijlen verschijnen alleen als de tabbalk echt verder loopt (data-meer-links / data-meer-rechts)',
    /\.ut-tabs-wrap\[data-meer-rechts\] \.ut-tabs-pijl\.is-rechts\{display:grid;right:2px\}/.test(nieuw)
    && /\.ut-tabs-wrap\[data-meer-links\] \.ut-tabs-pijl\.is-links\{display:grid;left:2px\}/.test(nieuw));
  check('links en rechts krijgen elk hun eigen kant (left/right) — nooit meer op elkaar',
    /\.is-rechts\{display:grid;right:2px\}/.test(nieuw) && /\.is-links\{display:grid;left:2px\}/.test(nieuw));

  // ---- 3. het mag ook nergens anders zo mis kunnen gaan
  check('TabsRij zet de vlaggen zelf op de wrap (anders blijven de pijlen altijd uit)',
    /data-meer-links|meerLinks/.test(tsx) && /data-meer-rechts|meerRechts/.test(tsx));
  return einde();
}
