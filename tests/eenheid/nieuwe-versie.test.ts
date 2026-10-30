// «Сайт оновлено» (18.10.2026): een tabblad dat vóór een installatie geopend was, draaide live nog een uur de oude code (de
// oplossing voor het springen van de pagina leek «niet te werken»). Bewijst de beslisregels, de detectie van onopgeslagen invoer,
// dat de build zijn versie meegeeft, dat de strook als eigen root start en dat de service worker HTML niet uit de cache serveert.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { INTERVAL_MS, MIN_TUSSEN_MS, beslis, heeftOnopgeslagen, isServerStoring, meldServerAntwoord, opServerStoring, serverStoring, veldGewijzigd } from '../../src/platform/nieuwe-versie';

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('nieuwe-versie');
  const oud = '20261018-151122', nieuw = '20261018-153026';
  const b = (o: Partial<Parameters<typeof beslis>[0]>) => beslis({ ingebouwd: oud, server: nieuw, zichtbaar: true, onopgeslagen: false, uitgesteld: '', ...o });
  check('oud gedrag nagebootst: zonder vergelijking merkt een open tabblad niets (zelfde versie = niets)', b({ server: oud }) === 'niets');
  check('nieuwe serverversie + zichtbaar → strook tonen (nooit vanzelf herladen terwijl de gebruiker kijkt)', b({}) === 'toon');
  check('nieuwe versie + verborgen + niets onopgeslagen → vanzelf herladen', b({ zichtbaar: false }) === 'herlaad');
  check('nieuwe versie + verborgen + onopgeslagen invoer → NIET herladen, strook tonen', b({ zichtbaar: false, onopgeslagen: true }) === 'toon');
  check('«Пізніше» voor deze versie → niets; bij een volgende versie weer tonen', b({ uitgesteld: nieuw }) === 'niets' && b({ uitgesteld: nieuw, server: '20261018-170000' }) === 'toon');
  check('geen of ongeldige versie (build zonder UITROL-VERSIE, foutpagina) → nooit een valse melding', b({ ingebouwd: '' }) === 'niets' && b({ server: '' }) === 'niets' && b({ server: '<html>' }) === 'niets' && b({ ingebouwd: 'dev' }) === 'niets');
  check(`interval ${INTERVAL_MS / 1000} s, nooit vaker dan elke ${MIN_TUSSEN_MS / 1000} s`, INTERVAL_MS === 60_000 && MIN_TUSSEN_MS >= 10_000);

  const veld = (o: Record<string, unknown>) => ({ tagName: 'INPUT', type: 'text', value: '', defaultValue: '', hasAttribute: () => false, ...o });
  check('veld: ongewijzigd tekstveld → niets onopgeslagen', veldGewijzigd(veld({})) === false && veldGewijzigd(veld({ value: 'x', defaultValue: 'x' })) === false);
  check('veld: getypte tekst → onopgeslagen', veldGewijzigd(veld({ value: 'concept' })) === true);
  check('veld: textarea met nieuwe tekst of met data-concept → onopgeslagen', veldGewijzigd({ tagName: 'TEXTAREA', value: 'brief', defaultValue: '' }) && veldGewijzigd({ tagName: 'TEXTAREA', value: 'x', defaultValue: 'x', hasAttribute: (n: string) => n === 'data-concept' }));
  check('veld: verborgen/knop/bestand tellen niet', !veldGewijzigd(veld({ type: 'hidden', value: 'a' })) && !veldGewijzigd(veld({ type: 'submit', value: 'a' })) && !veldGewijzigd(veld({ type: 'file', value: 'C:\\\\x' })));
  check('veld: aangevinkt vakje anders dan standaard → onopgeslagen', veldGewijzigd(veld({ type: 'checkbox', checked: true, defaultChecked: false })) && !veldGewijzigd(veld({ type: 'checkbox', checked: true, defaultChecked: true })));
  check('veld: contenteditable met inhoud → onopgeslagen', veldGewijzigd({ tagName: 'DIV', isContentEditable: true, textContent: 'tekst' }) && !veldGewijzigd({ tagName: 'DIV', isContentEditable: true, textContent: '  ' }));
  check('document: één gewijzigd veld volstaat', heeftOnopgeslagen({ querySelectorAll: () => [veld({}), veld({ value: 'x' })] }) && !heeftOnopgeslagen({ querySelectorAll: () => [veld({})] }));

  const vite = lees('vite.config.ts'), main = lees('src/main.tsx'), band = lees('src/platform/NieuweVersieBand.tsx'), sw = lees('public/service-worker.js');
  check('build zet de eigen versie in de bundel (__MR_BOUW_VERSIE__ uit UITROL-VERSIE)', /define:\s*\{\s*__MR_BOUW_VERSIE__/.test(vite) && /readFileSync\('UITROL-VERSIE'/.test(vite));
  check('strook start als eigen root (na de app)', main.includes("import('./platform/NieuweVersieBand')"));
  check('controle bij terugkeer naar het tabblad + interval alleen als zichtbaar', /visibilitychange/.test(band) && /document\.visibilityState === 'visible'\) void controleer\(\)/.test(band));
  check('/api/version zonder cache (no-store)', /fetch\('\/api\/version', \{ cache: 'no-store'/.test(band));
  check('service worker: navigatie (HTML) network-first, /api/ nooit uit de cache, skipWaiting + clients.claim', /request\.mode==='navigate'\)\{event\.respondWith\(\(async\(\)=>\{[\s\S]{0,200}?try\{const response=await fetch\(request,\{cache:'no-cache'\}\)/.test(sw) && /pathname\.startsWith\('\/api\/'\)/.test(sw) && /skipWaiting\(\)/.test(sw) && /clients\.claim\(\)/.test(sw));
  check('bij een nieuwe versie wordt ook de service worker bijgewerkt', /getRegistration\?\.\(\)\.then\(\(reg\) => reg\?\.update\(\)\)/.test(band));
  // G4 (audit 19.10.2026): strook «Сервер тимчасово недоступний» bij 502/503/504/520–530, weg bij de volgende geslaagde respons.
  check('G4: isServerStoring: 502/503/504/520/530 ja; 200/401/404/500 nee', [502, 503, 504, 520, 530].every(isServerStoring) && ![200, 401, 404, 500, 429].some(isServerStoring));
  const gezien: boolean[] = []; const los = opServerStoring((v) => gezien.push(v));
  meldServerAntwoord(200); meldServerAntwoord(502); meldServerAntwoord(503); meldServerAntwoord(404); meldServerAntwoord(200); los();
  check('G4: storing wordt één keer gemeld, herstel bij de eerste niet-storing-respons (ook 404)', gezien.join() === 'true,false' && !serverStoring());
  const cl = readFileSync(join('src', 'platform', 'client.ts'), 'utf8'); const bn = readFileSync(join('src', 'CanoniekVerbindingBand.tsx'), 'utf8');
  // Punt 3 van de audit 19.10.2026: de plakkaat zegt niet meer «Сервер тимчасово недоступний — Імовірно, встановлюється
  // оновлення», want dat was een gok. De melding komt nu uit shared/foutuitleg.ts met de code, de dienst, het tijdstip en het
  // pogingnummer, en elke respons meldt die feiten mee (route, code, rauw lichaam). Zie tests/eenheid/foutuitleg-20261019.test.ts.
  check('G4: client.ts meldt elke respons MET de feiten; versie-poll meldt en pollt sneller bij storing; banner toont de server-fase', /meldServerAntwoord\(response\.status, \{ route,/.test(cl) && /meldServerAntwoord\(r\.status, \{ route: 'GET \/api\/version' \}\)/.test(band) && /STORING_POLL_MS/.test(band)
    && /opServerStoring\(zet\)/.test(bn) && /legUit\(taal, feiten\)/.test(bn) && !/Сервер тимчасово недоступний/.test(bn.replace(/\/\/.*$/gm, '')) && /data-connection='server'/.test(readFileSync(join('src', 'canoniek-omlijsting.css'), 'utf8')));
  return einde();
}
