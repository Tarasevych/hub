// «Кому дозволено» moest iedereen kunnen vinden. Tot 20.10.2026 stond er een kale `ORDER BY email LIMIT 200`: op een server met
// meer goedgekeurde mensen viel iedereen achteraan het alfabet STIL uit de keuzelijst, zonder één woord uitleg, en de eigenaar
// kon die persoon geen recht geven. Gevonden doordat de gedeelde test-DB 289 goedgekeurde accounts had en de controle
// «grants: kandidaten-accounts hebben naam en foto» daarop brak — dus geen testartefact maar een echte grens.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-kandidaten-zoeken-20261020');
  const bron = readFileSync('backend/uitrol-goedkeuring.ts', 'utf8');
  const types = readFileSync('src/uitrol/types.ts', 'utf8');
  const dialoog = readFileSync('src/uitrol/AgentToevoegen.tsx', 'utf8');
  const view = readFileSync('src/BeheerUitrolWeergave.tsx', 'utf8');

  check('de grens staat op één plek en heet iets (geen los getal in de query)', /const KANDIDATEN_MAX = 200;/.test(bron) && /LIMIT \$\{KANDIDATEN_MAX\}/.test(bron));
  check('kandidaten() neemt een zoekterm aan', /async function kandidaten\(zoek = ''\)/.test(bron));
  check('zoeken gebeurt op de SERVER, op e-mail én naam (dus ook buiten het eerste blok)',
    /data->>'email' ILIKE \$1 OR data->>'name' ILIKE \$1/.test(bron));
  check('de zoekterm wordt geparametriseerd, nooit in de SQL geplakt', !/ILIKE '%\$\{/.test(bron) && /\], args\)|, args\)\)/.test(bron));
  check('% en _ in de zoekterm worden ontsnapt (anders is «%» een joker van de gebruiker)', /replace\(\/\[%_/.test(bron));
  check('het totaal wordt apart geteld, zodat het scherm de waarheid kan zeggen', /SELECT count\(\*\)::int AS n FROM app\.records WHERE \$\{waar\}\$\{filter\}/.test(bron));
  check('het antwoord draagt totaal, afkapvlag en de gebruikte term', /accountsTotaal, accountsAfgekapt: accountsTotaal > accounts\.length, accountsZoek: term/.test(bron));
  check('er is een eigen route om te zoeken, alleen voor de eigenaar', /'POST \/api\/owner\/uitrol\/kandidaten': \[eigenaar\(/.test(bron));

  check('het type kent de nieuwe velden (optioneel, dus oude antwoorden blijven geldig)',
    /accountsTotaal\?: number; accountsAfgekapt\?: boolean; accountsZoek\?: string/.test(types));

  check('de dialoog heeft een zoekveld voor accounts', /data-kandidaat-zoek/.test(dialoog) && /ander === 'account' && zoekAccounts/.test(dialoog));
  check('de dialoog zegt hoeveel er getoond worden van het totaal', /Показано \$\{anderLijst\.length\} з \$\{accountsTotaal\}/.test(dialoog));
  check('zoeken is uitgesteld (niet elke toetsaanslag een verzoek)', /setTimeout\(\(\) => \{[\s\S]{0,200}zoekAccounts\(term\)/.test(dialoog) && /\}, 250\);/.test(dialoog));
  check('een mislukte zoekopdracht maakt de lijst leeg i.p.v. het oude blok te tonen (geen stille verkeerde uitkomst)',
    /catch\(\(\) => \{ if \(leeft\) \{ setGevonden\(\[\]\); setGevondenTotaal\(0\); \} \}\)/.test(dialoog));
  check('de zoekfunctie komt van het scherm dat de sessiecontext heeft', /const zoekAccounts = useCallback\(async \(zoek: string\)/.test(view) && /'\/api\/owner\/uitrol\/kandidaten'/.test(view));

  check('de oude, stille afkapping staat er niet meer', !/ORDER BY data->>'email' LIMIT 200`/.test(bron));
  return einde();
}
