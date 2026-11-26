// SITE-001 (пункти 5 і 19): логіка смуги згоди та знеособленої аналітики без оглядача.
// nl: logica van de toestemmingsbalk en de anonieme analyse, zonder browser.
import { readFile } from 'node:fs/promises';
import { checker } from './hulp/nep-google';
import {
  TOESTEMMING_SLEUTEL, TOESTEMMING_ROUTE, GEBEURTENIS_ROUTE, bandNodig, bewaarKeuze, bezoekGebeurtenis,
  leesKeuze, meldKeuzeAanServer, sessieBekend, telBezoek, wisKeuze,
} from '../../src/toestemming/toestemming';

const geheugen = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
};
const ctx = { service: 'hub', tabContext: 'tab-1', sourceOrigin: 'https://hub.tarasevych.com' };

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-toestemming');

  // Типово немає вибору → смуга потрібна, аналітика вимкнена.
  const o = geheugen();
  check('zonder keuze is de balk nodig', bandNodig(leesKeuze(o)) === true);
  const k = bewaarKeuze(false, o, 1000);
  check('keuze «alleen noodzakelijk» wordt bewaard', leesKeuze(o)?.analyse === false && k.tijd === 1000);
  check('na een keuze is de balk niet meer nodig', bandNodig(leesKeuze(o)) === false);
  o.setItem(TOESTEMMING_SLEUTEL, '{kapot');
  check('beschadigde opslag geldt als geen keuze', leesKeuze(o) === null);
  o.setItem(TOESTEMMING_SLEUTEL, JSON.stringify({ versie: 0, analyse: true, tijd: 1 }));
  check('verouderde versie geldt als geen keuze', leesKeuze(o) === null);
  o.setItem(TOESTEMMING_SLEUTEL, JSON.stringify({ versie: 1, analyse: 'ja', tijd: 1 }));
  check('niet-booleaanse toestemming geldt als geen keuze', leesKeuze(o) === null);
  bewaarKeuze(true, o); wisKeuze(o);
  check('wissen opent de balk opnieuw', leesKeuze(o) === null);
  check('zonder opslag werkt bewaren zonder fout', bewaarKeuze(true, null).analyse === true && leesKeuze(null) === null);

  // Назва події: лише латиниця, без адреси сторінки.
  check('gebeurtenisnaam per dienst', bezoekGebeurtenis('Hub') === 'bezoek.hub');
  check('geen pad of parameters in de gebeurtenis', bezoekGebeurtenis('hub/../x?y=1') === 'bezoek.hubxy1');
  check('lege dienst geeft geen gebeurtenis', bezoekGebeurtenis('') === null && bezoekGebeurtenis('///') === null);

  // Сеанс з ранньої розмітки.
  check('sessie bekend', sessieBekend({ __TSV_PRESENTATION__: { session: 'known' } }) === true);
  check('anonieme bezoeker zonder sessie', sessieBekend({ __TSV_PRESENTATION__: { session: 'anon', domainAccountKey: 'anon' } }) === false && sessieBekend(undefined) === false);

  // Надсилання: без згоди — нічого; зі згодою — одна подія на сеанс вкладки.
  const verzonden: Array<{ url: string; body: Record<string, unknown> }> = [];
  const post = async (url: string, body: unknown) => { verzonden.push({ url, body: body as Record<string, unknown> }); return {}; };
  const opslag = geheugen(); const sessie = geheugen();
  check('zonder toestemming wordt niets geteld', (await telBezoek('hub', post, ctx, opslag, sessie)) === null && verzonden.length === 0);
  bewaarKeuze(false, opslag);
  check('met «alleen noodzakelijk» wordt niets geteld', (await telBezoek('hub', post, ctx, opslag, sessie)) === null && verzonden.length === 0);
  bewaarKeuze(true, opslag);
  check('met toestemming één gebeurtenis', (await telBezoek('hub', post, ctx, opslag, sessie)) === 'bezoek.hub' && verzonden.length === 1 && verzonden[0].url === GEBEURTENIS_ROUTE && verzonden[0].body.naam === 'bezoek.hub');
  check('tweede keer in hetzelfde tabblad niet opnieuw', (await telBezoek('hub', post, ctx, opslag, sessie)) === null && verzonden.length === 1);
  check('geen adres of tijdstempel in de gebeurtenis', !('pad' in verzonden[0].body) && !('url' in verzonden[0].body) && Object.keys(verzonden[0].body).sort().join(',') === 'naam,service,sourceOrigin,tabContext');

  check('keuze naar de server', (await meldKeuzeAanServer(bewaarKeuze(true, opslag), post, ctx)) === true && verzonden.at(-1)?.url === TOESTEMMING_ROUTE && verzonden.at(-1)?.body.analyticsConsent === true);
  const faalt = async () => { throw new Error('401'); };
  check('serverfout breekt de pagina niet', (await meldKeuzeAanServer(bewaarKeuze(false, opslag), faalt, ctx)) === false);

  // Інтерфейс: дві рівноцінні кнопки, посилання на політику, обидві мови, без попередньої згоди.
  const tsx = await readFile('src/toestemming/ToestemmingBand.tsx', 'utf8');
  check('twee knoppen «nodig» en «analyse»', tsx.includes('data-toestemming="nodig"') && tsx.includes('data-toestemming="analyse"'));
  check('koppeling naar /privacy', tsx.includes('/privacy'));
  check('geen vooraf aangevinkt vakje', !/defaultChecked|checked=\{true\}/.test(tsx));
  const verboden = new RegExp('[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]');
  check('Oekraïense tekst zonder verboden letters', !verboden.test(tsx) && !verboden.test(await readFile('src/toestemming/toestemming.ts', 'utf8')));
  return einde();
}
