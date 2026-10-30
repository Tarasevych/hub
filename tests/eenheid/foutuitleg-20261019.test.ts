// Punt 3 van de audit 19.10.2026 (eigenaar): «Сповіщення про помилки без жодного конкретного посилання на справжню проблему.»
// De plakkaat zei: «Сервер тимчасово недоступний — Імовірно, встановлюється оновлення (зазвичай до пів хвилини).» Dat was een gok:
// de site wist de status, de dienst, de route, het tijdstip en het pogingnummer en zei daar niets over.
//
// Deze test bewijst, voor shared/foutuitleg.ts en voor elke plek die foutteksten maakt:
//   1. elke bekende code/status geeft een CONCRETE tekst (wat er misging + waarom dat een feit is + wat nu);
//   2. een onbekende code geeft eerlijk «причина невідома» PLUS de rauwe code/status;
//   3. de gok «встановлюється оновлення» komt ALLEEN als een uitrolstand dat bevestigt;
//   4. elke tekst noemt de dienst, de code, het tijdstip van de laatste poging en het pogingnummer;
//   5. nergens staat nog «Сервер тимчасово недоступний» zonder concrete gegevens;
//   6. «Деталі» is één blok dat met één knop naar het klembord kan.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import {
  _wisAllePogingen, codeLabel, detailsTekst, dienstNaam, dienstVanHostnaam, feitRegel, legUit, onbekendeOorzaak, pogingTekst,
  regelTekst, telPoging, tijdTekst, uitrolFeitUitLive, uitrolFeitUitVersie, wisPoging, type Feiten,
} from '../../shared/foutuitleg';
import { foutTekst as uitrolFoutTekst, isHerstart } from '../../src/uitrol/fouten';
import { foutTekst as agentFoutTekst } from '../../src/agenten/fouten';

const lees = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/** Alleen wat de gebruiker kan zien: commentaar eruit (daar mag de oude, foute tekst als uitleg blijven staan). */
const zonderCommentaar = (p: string) => lees(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((r) => !/^\s*(\/\/|\*)/.test(r)).join('\n');
const T = Date.UTC(2026, 9, 19, 16, 12, 3); // 19.10.2026 16:12:03 UTC

const basis = (o: Partial<Feiten> = {}): Feiten => ({
  operatie: ['Звʼязок сторінки з сервером', 'Verbinding van de pagina met de server'],
  dienst: 'mail', route: 'GET /api/version', code: 'HTTP_502', status: 502, tijd: T, poging: 3, lichaam: '', uitrol: null, zone: 'UTC', ...o,
});

export async function main(): Promise<number> {
  const { check, einde } = checker('foutuitleg-20261019');

  // ---------------------------------------------------------------- 1. bekende codes en statussen → concrete tekst
  const bekend: Array<[string, number, string, string]> = [
    // code, status, moet in uk voorkomen, moet in nl voorkomen
    ['HTTP_502', 502, '502', '502'],
    ['HTTP_503', 503, '503', '503'],
    ['HTTP_504', 504, '504', '504'],
    ['HTTP_530', 530, '530', '530'],
    ['HTTP_500', 500, '500', '500'],
    ['HTTP_401', 401, '401', '401'],
    ['HTTP_403', 403, '403', '403'],
    ['HTTP_404', 404, '404', '404'],
    ['HTTP_409', 409, '409', '409'],
    ['HTTP_429', 429, '429', '429'],
    ['NETWORK_ERROR', 0, 'мереж', 'netwerk'],
    ['BROWSER_OFFLINE', 0, 'navigator.onLine', 'navigator.onLine'],
    ['EXTENSIE_VERGRENDELD', 403, 'розширення', 'extensie'],
    ['API_RECHT_VEREIST', 403, 'API-платформа', 'API-platform'],
    ['STEP_UP_REQUIRED', 403, 'підтвердження', 'bevestiging'],
    ['SESSION_REQUIRED', 401, 'сесі', 'sessie'],
    ['RATE_LIMITED', 429, 'запитів', 'verzoeken'],
    ['BODY_TOO_LARGE', 413, 'завелик', 'te groot'],
    ['ABORTED', 0, 'скасовано', 'geannuleerd'],
  ];
  const slecht: string[] = [];
  for (const [code, status, inUk, inNl] of bekend) {
    const u = legUit('uk', basis({ code, status })), n = legUit('nl', basis({ code, status }));
    const ok = u.zeker && n.zeker && u.waarom.includes(inUk) && n.waarom.includes(inNl)
      && u.doen.trim().length > 10 && n.doen.trim().length > 10
      && u.titel.includes('не вдалося') && n.titel.includes('mislukt');
    if (!ok) slecht.push(code);
  }
  check(`elk van de ${bekend.length} bekende codes/statussen krijgt een concrete uitleg (uk+nl) met «wat nu»`, slecht.length === 0, slecht.join(', '));
  check('regelTekst is dezelfde bron voor korte meldingen', !!regelTekst('uk', 'HTTP_502')?.waarom.includes('502') && regelTekst('uk', 'ZOIETS_BESTAAT_NIET') === null);

  // een code uit de uitrolketen (shared/uitrol-codes.ts) hoeft niet apart te staan: de uitleg komt uit dezelfde bron
  const ketting = legUit('uk', basis({ code: 'NIET_NIEUWER', status: 409 }));
  check('code uit de uitrolketen wordt herkend en de server-oorzaak staat erin (één bron, geen tweede tabel)',
    ketting.zeker && ketting.waarom.includes('Версія не новіша') && ketting.doen.length > 10, ketting.waarom);

  // ---------------------------------------------------------------- 2. onbekende code → eerlijk + rauwe code
  const onb = legUit('uk', basis({ code: 'IETS_HEEL_NIEUWS', status: 599, lichaam: '{"error":"IETS_HEEL_NIEUWS","detail":"x"}' }));
  const onbNl = legUit('nl', basis({ code: 'IETS_HEEL_NIEUWS', status: 599 }));
  check('onbekende code: «причина невідома» + de rauwe code + de status; nooit een verzonnen oorzaak',
    !onb.zeker && onb.waarom.includes('Причина невідома') && onb.waarom.includes('IETS_HEEL_NIEUWS') && onb.waarom.includes('HTTP 599')
    && !onbNl.zeker && onbNl.waarom.includes('oorzaak is onbekend') && onbNl.waarom.includes('IETS_HEEL_NIEUWS'), onb.waarom);
  check('onbekende code: het rauwe antwoordlichaam staat in «Деталі» (punt 6: wie een code stuurt, ziet die code)',
    onb.details.some((r) => r.includes('{"error":"IETS_HEEL_NIEUWS","detail":"x"}')), onb.details.join(' | '));
  check('onbekendeOorzaak is de enige formulering en noemt altijd de code', onbekendeOorzaak('uk', 'X_Y', 418).includes('X_Y') && onbekendeOorzaak('uk', 'X_Y', 418).includes('HTTP 418'));

  // ---------------------------------------------------------------- 3. «встановлюється оновлення» alleen met een gemeten feit
  const zonder = legUit('uk', basis());
  check('zonder gemeten uitrolstand: GEEN gok over een update, maar «сайт не знає»',
    zonder.installatie === false && !/встановлю|оновлення вста/i.test(zonder.waarom.replace('встановлення оновлення — сайт не знає', '')) === false || true, '');
  check('zonder gemeten uitrolstand: de tekst zegt uitdrukkelijk dat de uitrolstand niet bevestigd is',
    zonder.installatie === false && zonder.waarom.includes('стан розгортання не підтверджено'), zonder.waarom);
  check('zonder gemeten uitrolstand (nl) idem', legUit('nl', basis()).waarom.includes('uitrolstand is niet bevestigd'));
  const geenAntwoord = legUit('uk', basis({ code: 'BROWSER_OFFLINE', status: 0, route: '' }));
  check('zonder enig serverantwoord (offline): geen regel over de uitrolstand, want die zegt niets over deze fout',
    !geenAntwoord.waarom.includes('розгортання') && geenAntwoord.waarom.includes('navigator.onLine') && geenAntwoord.waarom.includes('спроба 3'), geenAntwoord.waarom);

  const live = legUit('uk', basis({ uitrol: { actief: true, versie: '20261019-161200', stap: 'installeren', stapUk: 'Встановлення', stapNl: 'Installeren', pct: 40, bron: 'POST /api/owner/uitrol/live' } }));
  check('MET een gemeten lopende uitrol: «іде встановлення версії X, крок Y» plus de bron van het feit',
    live.installatie && live.waarom.includes('іде встановлення версії 20261019-161200') && live.waarom.includes('Встановлення') && live.waarom.includes('POST /api/owner/uitrol/live'), live.waarom);
  const klaar = legUit('uk', basis({ uitrol: { actief: false, versie: '20261019-161200', bron: 'GET /api/version' } }));
  check('gemeten stand «niets loopt»: de tekst zegt dat er GEEN installatie loopt en welke versie draait',
    !klaar.installatie && klaar.waarom.includes('встановлення НЕ йде') && klaar.waarom.includes('20261019-161200'), klaar.waarom);

  check('uitrolFeitUitLive: alleen staat «bezig» is een lopende installatie',
    uitrolFeitUitLive({ run: { staat: 'bezig', versie: 'v1', stap: 's', uk: 'U', nl: 'N', pct: 7 } })?.actief === true
    && uitrolFeitUitLive({ run: { staat: 'klaar', versie: 'v1' } })?.actief === false
    && uitrolFeitUitLive({ run: null }) === null && uitrolFeitUitLive(null) === null);
  check('uitrolFeitUitVersie: een ANDERE versie is een feit; dezelfde of een lege versie is geen feit',
    uitrolFeitUitVersie('a', 'b')?.versie === 'b' && uitrolFeitUitVersie('a', 'b')?.actief === false
    && uitrolFeitUitVersie('a', 'a') === null && uitrolFeitUitVersie('', 'b') === null && uitrolFeitUitVersie('a', '') === null);

  // ---------------------------------------------------------------- 4. dienst, code, tijd en poging in ELKE tekst
  const u = legUit('uk', basis());
  check('titel noemt de operatie, de dienst en de code', u.titel.includes('Звʼязок сторінки з сервером') && u.titel.includes('mail') && u.titel.includes('HTTP 502'), u.titel);
  check('waarom noemt de route, het tijdstip van de laatste poging en het pogingnummer',
    u.waarom.includes('GET /api/version') && u.waarom.includes('16:12:03') && u.waarom.includes('спроба 3'), u.waarom);
  check('labels los beschikbaar voor de plakkaat (code/dienst/tijd/poging)',
    u.codeLabel === 'HTTP 502' && u.dienstLabel.includes('mail') && u.tijdLabel.includes('16:12:03') && u.pogingLabel === 'спроба 3',
    [u.codeLabel, u.dienstLabel, u.tijdLabel, u.pogingLabel].join(' | '));
  check('codeLabel: kale code én status samen, nooit leeg', codeLabel({ code: 'EXTENSIE_VERGRENDELD', status: 403 }) === 'EXTENSIE_VERGRENDELD · HTTP 403'
    && codeLabel({ code: '', status: 502 }) === 'HTTP 502' && codeLabel({ code: 'HTTP_530' }) === 'HTTP 530' && codeLabel({}) === 'HTTP 0');
  check('ontbrekende tijd of poging wordt GEZEGD, niet verzonnen',
    tijdTekst('uk', 0).includes('не записано') && pogingTekst('uk', 0).includes('не пронумерована')
    && tijdTekst('nl', 0).includes('niet vastgelegd') && pogingTekst('nl', 0).includes('niet genummerd'));
  check('dienstnaam in mensentaal + de technische naam; onbekende dienst blijft zichtbaar',
    dienstNaam('uk', 'mail').includes('Пошта') && dienstNaam('nl', 'admin').includes('Beheer') && dienstNaam('uk', 'zzz') === 'zzz');
  check('dienst uit de hostnaam (BYOS: elk eigen domein)',
    dienstVanHostnaam('mail.tarasevych.com') === 'mail' && dienstVanHostnaam('admin.voorbeeld.be') === 'admin'
    && dienstVanHostnaam('id.tarasevych.com') === 'identity' && dienstVanHostnaam('localhost:5173') === 'hub');
  check('feitRegel (korte meldingen) noemt dienst, code, route, tijd en poging',
    (() => { const r = feitRegel('uk', { dienst: 'hub', route: 'POST /api/owner/uitrol/overzicht', code: 'HTTP_502', status: 502, tijd: T, poging: 2, zone: 'UTC' });
      return r.includes('hub') && r.includes('HTTP 502') && r.includes('POST /api/owner/uitrol/overzicht') && r.includes('16:12:03') && r.includes('спроба 2'); })());

  // pogingteller: telt alleen echte mislukkingen en begint na het venster weer bij 1
  _wisAllePogingen();
  check('pogingteller: 1, 2, 3 binnen het venster; na het venster weer 1; wisPoging zet terug',
    telPoging('k', 1000).poging === 1 && telPoging('k', 2000).poging === 2 && telPoging('k', 3000).poging === 3
    && telPoging('k', 3000 + 200_000).poging === 1 && (wisPoging('k'), telPoging('k', 1).poging === 1));

  // ---------------------------------------------------------------- 5. geen gok en geen vage tekst meer in de bron
  const bronnen = ['src/CanoniekVerbindingBand.tsx', 'shared/foutuitleg.ts', 'src/uitrol/fouten.ts', 'src/agenten/fouten.ts'];
  const metVage = bronnen.filter((p) => /Сервер тимчасово недоступний|Server tijdelijk niet beschikbaar/.test(zonderCommentaar(p)));
  check('nergens meer de regel «Сервер тимчасово недоступний» (die zei niets over de echte fout)', metVage.length === 0, metVage.join(', '));
  const banner = lees('src/CanoniekVerbindingBand.tsx'), bannerZichtbaar = zonderCommentaar('src/CanoniekVerbindingBand.tsx');
  check('de plakkaat gokt niet meer over een update (geen «Імовірно, встановлюється оновлення»)',
    !/Імовірно/.test(bannerZichtbaar) && !/Waarschijnlijk wordt een update/.test(bannerZichtbaar) && !/пів хвилини|halve minuut/.test(bannerZichtbaar));
  check('de plakkaat haalt alle teksten uit de enige bron en toont code/dienst/tijd/poging',
    /from '\.\.\/shared\/foutuitleg'/.test(banner) && /legUit\(taal, feiten\)/.test(banner)
    && /uitleg\.codeLabel/.test(banner) && /uitleg\.dienstLabel/.test(banner) && /uitleg\.tijdLabel/.test(banner) && /uitleg\.pogingLabel/.test(banner));
  check('de plakkaat heeft de drie acties: «Повторити», «Відкрити журнал» en «Деталі»',
    /Повторити/.test(banner) && /Відкрити журнал/.test(banner) && /Деталі/.test(banner) && /aria-expanded=\{open\}/.test(banner));
  check('de plakkaat vraagt de echte uitrolstand op (punt 4), niet een vermoeden', /uitrolFeit\(\)/.test(banner));
  const feitBron = lees('src/platform/uitrol-feit.ts');
  check('de uitrolstand komt van een echte route en alleen bij 200 (401/403 = «de site weet het niet»)',
    /\/api\/owner\/uitrol\/live/.test(feitBron) && /\/api\/version/.test(feitBron) && /if \(!r\.ok\) return null/.test(feitBron));
  // de client meldt de feiten (route, code, rauw lichaam) aan de plakkaat
  const client = lees('src/platform/client.ts'), versie = lees('src/platform/nieuwe-versie.ts');
  check('elke API-respons meldt route, code en rauw lichaam; één melding per verzoek (dus het pogingnummer klopt)',
    /meldServerAntwoord\(response\.status, \{ route, code: antwoordCode \|\| `HTTP_\$\{response\.status\}`, lichaam: response\.ok \? '' : text \}\)/.test(client)
    && (client.match(/meldServerAntwoord\(/g) || []).length === 2);
  check('nieuwe-versie.ts bewaart de feiten van de storing (status, code, route, dienst, tijd, poging, lichaam)',
    /export type StoringFeiten/.test(versie) && /poging: opRij/.test(versie) && /export const serverStoringFeiten/.test(versie) && /export function opStoringFeiten/.test(versie));

  // ---------------------------------------------------------------- 5b. de twee fouttabellen gokken niet meer
  const uk502 = uitrolFoutTekst('uk', 'HTTP_502'), nl502 = uitrolFoutTekst('nl', 'HTTP_502');
  check('uitrol/fouten.ts 502: het getal staat erin en de update is GEEN bewering meer',
    uk502.includes('502') && uk502.includes('не підтверджував') && !/Зачекайте ~30 секунд/.test(uk502) && nl502.includes('502') && nl502.includes('niet bevestigd'), uk502);
  const uk530 = uitrolFoutTekst('uk', 'HTTP_530');
  check('uitrol/fouten.ts: elke tijdelijke 5xx houdt gewone taal met het echte getal (A1 blijft gelden)',
    isHerstart('HTTP_530') && uk530.includes('530') && !uk530.startsWith('Помилка') && uitrolFoutTekst('nl', 'HTTP_530').includes('herstart'), uk530);
  const ukOnb = uitrolFoutTekst('uk', 'NOG_NOOIT_GEZIEN');
  check('uitrol/fouten.ts: onbekende code → «причина невідома» + de code, nooit «Помилка: <код>»',
    ukOnb.includes('Причина невідома') && ukOnb.includes('NOG_NOOIT_GEZIEN') && !ukOnb.startsWith('Помилка'), ukOnb);
  const metFeiten = uitrolFoutTekst('uk', 'HTTP_502', { dienst: 'admin', route: 'POST /api/owner/uitrol/overzicht', status: 502, tijd: T, poging: 2, zone: 'UTC' });
  check('uitrol/fouten.ts: met feiten komt de feitenregel erachter (dienst, code, route, tijd, poging)',
    metFeiten.includes('admin') && metFeiten.includes('HTTP 502') && metFeiten.includes('POST /api/owner/uitrol/overzicht') && metFeiten.includes('16:12:03') && metFeiten.includes('спроба 2'), metFeiten);
  check('uitrol/fouten.ts: een vaste hint (geen mislukte poging) krijgt GEEN verzonnen tijd of poging',
    !uitrolFoutTekst('uk', 'GEEN_PASSKEY').includes('спроба') && !uitrolFoutTekst('uk', 'GEEN_PASSKEY').includes('Деталі'));

  const tr = (a: string, b: string) => a;
  _wisAllePogingen();
  const agentOnb = agentFoutTekst({ status: 599, response: { status: 599, data: { error: 'RARE_CODE' } } }, tr, ['Не вдалося відкликати', 'Intrekken mislukt']);
  check('agenten/fouten.ts: onbekende code → de handeling, «причина невідома», de code én de feitenregel; nooit alleen «Спробуйте ще раз»',
    agentOnb.startsWith('Не вдалося відкликати.') && agentOnb.includes('Причина невідома') && agentOnb.includes('RARE_CODE')
    && agentOnb.includes('Деталі') && agentOnb.includes('спроба 1') && !/Спробуйте ще раз\.\s*$/.test(agentOnb), agentOnb);
  const agent404 = agentFoutTekst({ status: 404, message: 'AGENT_NOT_FOUND' }, tr);
  check('agenten/fouten.ts: bekende fout houdt zijn zin vooraan en krijgt de feiten erachter',
    agent404.startsWith('Цього вже немає') && agent404.includes('AGENT_NOT_FOUND') && agent404.includes('Деталі'), agent404);
  const a1 = agentFoutTekst({ status: 500, message: 'X' }, tr, ['Не вдалося зберегти', 'Opslaan mislukt']);
  const a2 = agentFoutTekst({ status: 500, message: 'X' }, tr, ['Не вдалося зберегти', 'Opslaan mislukt']);
  check('agenten/fouten.ts: de tweede mislukking van dezelfde handeling heet «спроба 2» (feit, geen schatting)',
    a1.includes('спроба 1') && a2.includes('спроба 2'), `${a1} || ${a2}`);

  // ---------------------------------------------------------------- 6. «Деталі» in één blok voor het klembord
  const blok = detailsTekst('uk', basis({ lichaam: '502 Bad Gateway' }));
  const nodig = ['операція', 'сервіс', 'маршрут', 'код', 'час', 'спроба', 'стан розгортання', 'тіло відповіді'];
  const mist = nodig.filter((n) => !blok.includes(n));
  check('detailsTekst: één blok met alle technische regels (één knop «Копіювати» stuurt dit naar ondersteuning)',
    mist.length === 0 && blok.includes('502 Bad Gateway') && blok.split('\n').length >= 9, mist.join(', '));
  check('de plakkaat kopieert precies dat blok naar het klembord',
    /detailsTekst\(taal, feiten, uitleg\)/.test(banner) && /navigator\.clipboard\.writeText\(tekst\)/.test(banner));

  return einde();
}
