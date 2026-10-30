// «Треба, щоб вікна … не пропадали згорнутими … згорнуті вікна в одному просторі втрачаються, якщо я переходжу на інший
// піддомен» (eigenaar, 20.10.2026). Deze test legt vast dat een geminimaliseerd venster blijft bestaan over subdomeinen
// en herladen heen, dat er meer dan één naast elkaar kan staan, dat de lade per ACCOUNT en per RUIMTE apart is, en dat er
// nooit een geheim in terechtkomt.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';
import {
  LEGE_VENSTERSTAND, VENSTER_MAX, metVenster, metVensterKlein, normaliseerVenster, normaliseerVensterStand,
  standHeeftGeheim, stapOmTeBewaren, vensterScope, voegVensterStandenSamen, zonderGeheimen, zonderVenster,
} from '../../shared/vensters-onthouden-model';

const venster = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, soort: 'mail-koppelen', titel: `Koppelen: ${id}`, aanbieder: 'icloud', adres: 'pavlo@icloud.com', stap: 'adres', klein: false, dienst: 'mail', ...extra });

export async function main(): Promise<number> {
  const { check, einde } = checker('vensters-onthouden-20261020');

  // ------------------------------------------------------------------ 1. de regels zelf
  check('een venster zonder bekende soort of zonder id wordt niet bewaard',
    normaliseerVenster({ id: 'x' }) === null && normaliseerVenster({ soort: 'mail-koppelen' }) === null && normaliseerVenster(venster('a')) !== null);

  const een = metVenster(LEGE_VENSTERSTAND, venster('mail-koppelen:icloud', { klein: true }), 1000);
  const twee = metVenster(een, venster('mail-koppelen:yahoo', { aanbieder: 'yahoo', klein: true }), 2000);
  const drie = metVenster(twee, venster('mail-koppelen:iua', { aanbieder: 'iua' }), 3000);
  check('meerdere (geminimaliseerde) vensters bestaan naast elkaar', drie.vensters.length === 3 && drie.vensters.filter((v) => v.klein).length === 2);
  check('het nieuwste venster staat vooraan', drie.vensters[0].id === 'mail-koppelen:iua');
  check('hetzelfde venster twee keer onthouden = bijwerken, niet verdubbelen',
    metVenster(drie, venster('mail-koppelen:iua', { adres: 'p@i.ua' }), 4000).vensters.length === 3
    && metVenster(drie, venster('mail-koppelen:iua', { adres: 'p@i.ua' }), 4000).vensters[0].adres === 'p@i.ua');
  check('sluiten haalt het venster uit de lade', zonderVenster(drie, 'mail-koppelen:yahoo').vensters.length === 2);
  check('minimaliseren en terugzetten verandert alleen die ene stand',
    metVensterKlein(drie, 'mail-koppelen:iua', true).vensters.find((v) => v.id === 'mail-koppelen:iua')!.klein
    && !metVensterKlein(drie, 'mail-koppelen:icloud', false).vensters.find((v) => v.id === 'mail-koppelen:icloud')!.klein);

  let veel = LEGE_VENSTERSTAND;
  for (let i = 0; i < VENSTER_MAX + 4; i += 1) veel = metVenster(veel, venster(`mail-koppelen:v${i}`), 1000 + i);
  check(`hoogstens ${VENSTER_MAX} vensters, het oudste valt weg`, veel.vensters.length === VENSTER_MAX && !veel.vensters.some((v) => v.id === 'mail-koppelen:v0'));

  // ------------------------------------------------------------------ 2. nooit een geheim
  const metGeheim = venster('mail-koppelen:icloud', { wachtwoord: 'abcd-efgh', token: 'x', stap: 'wachtwoord', diep: { password: 'y' } });
  const bewaard = metVenster(LEGE_VENSTERSTAND, metGeheim, 5000);
  check('wachtwoord, token en code gaan eruit — ook diep in het object',
    !standHeeftGeheim(bewaard) && !JSON.stringify(bewaard).includes('abcd-efgh') && !standHeeftGeheim(zonderGeheimen(metGeheim)));
  check('een venster dat op het wachtwoord stond, komt terug met «vul het opnieuw in»',
    bewaard.vensters[0].stap === 'wachtwoord-opnieuw' && stapOmTeBewaren('wachtwoord') === 'wachtwoord-opnieuw' && stapOmTeBewaren('rommel') === 'adres');
  check('het ingevulde ADRES mag wel blijven (dat vroeg de eigenaar expliciet)', bewaard.vensters[0].adres === 'pavlo@icloud.com');

  // ------------------------------------------------------------------ 3. per account en per ruimte
  check('de lade is per account en per ruimte',
    vensterScope('u-aaa', 'prive') !== vensterScope('u-bbb', 'prive')
    && vensterScope('u-aaa', 'prive') !== vensterScope('u-aaa', 'technisch')
    && vensterScope('u-AAA', 'gebruiker') === vensterScope('u-aaa', 'prive'));

  // ------------------------------------------------------------------ 4. samenvoegen: de nieuwste beschrijving wint
  const oud = metVenster(LEGE_VENSTERSTAND, venster('mail-koppelen:icloud', { klein: false }), 1000);
  const nieuw = metVenster(LEGE_VENSTERSTAND, venster('mail-koppelen:icloud', { klein: true }), 9000);
  check('server en cache samenvoegen: de verste klik wint, niets verdubbelt',
    voegVensterStandenSamen(oud, nieuw).vensters.length === 1 && voegVensterStandenSamen(oud, nieuw).vensters[0].klein
    && voegVensterStandenSamen(nieuw, oud).vensters[0].klein);

  // ------------------------------------------------------------------ 5. de weergave haalt het van de server, op elk subdomein
  const bron = (pad: string) => readFileSync(pad, 'utf8');
  const chrome = bron('src/CanoniekOmlijsting.tsx');
  check('de herstellaag staat in het ene chroom, dus op hub, mail EN cloud', chrome.includes('<VensterHerstel') && /from\s*'\.\/platform\/VensterHerstel'/.test(chrome));
  const winkel = bron('src/platform/vensters-onthouden.ts');
  check('de stand komt van de server (localStorage is alleen een cache voor het eerste beeld)',
    winkel.includes('/api/owner/vensters/laden') && winkel.includes('/api/owner/vensters/opslaan') && winkel.includes('voegVensterStandenSamen'));
  check('bij een ander account wordt er nooit namens hem geschreven', winkel.includes('scopeNu() !== vanScope'));
  const herstel = bron('src/platform/VensterHerstel.tsx');
  check('een venster dat geminimaliseerd was, begint ook geminimaliseerd', herstel.includes('vensterBeheer.minimaliseer'));
  check('wat de mens in het dok doet, gaat terug de lade in', herstel.includes('vensterKleinOnthouden'));
  const koppel = bron('src/mail/MailKoppelVenster.tsx');
  check('minimaliseren wist het geheim in het venster zelf', koppel.includes("setWachtwoord('')") && koppel.includes('opnieuwNodig'));
  const route = bron('backend/vensters-onthouden.ts');
  check('de route weigert een stand met een geheim in plaats van die stil op te schonen', route.includes('standHeeftGeheim') && route.includes('OWNER_VENSTERS_GEHEIM_GEWEIGERD'));

  // ------------------------------------------------------------------ 6. met database: overleeft herladen en een ander subdomein
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN vensters-onthouden: geen database'); return einde(); }
  const sys = getPool('systeem');
  const bestaat = await sys.query("SELECT to_regclass('app.venster_stand') IS NOT NULL AS er");
  if (!bestaat.rows[0]?.er) { console.log('OVERGESLAGEN vensters-onthouden (database): migratie 0089 nog niet toegepast'); await closePool(); return einde(); }
  const { vensterStandLezen, vensterStandSchrijven } = await import('../../backend/vensters-onthouden');
  const gebruiker = `venster-test-${Date.now()}`;
  try {
    await vensterStandSchrijven(gebruiker, 'prive', { vensters: [venster('mail-koppelen:icloud', { klein: true }), venster('mail-koppelen:yahoo', { aanbieder: 'yahoo', klein: true })] });
    // «Herladen» en «ander subdomein» zijn voor de server hetzelfde: een nieuw verzoek van dezelfde mens in dezelfde ruimte.
    const naHerladen = await vensterStandLezen(gebruiker, 'prive');
    check('na herladen/een ander subdomein staan beide geminimaliseerde vensters er nog',
      naHerladen.vensters.length === 2 && naHerladen.vensters.every((v) => v.klein), JSON.stringify(naHerladen.vensters.map((v) => v.id)));
    const technisch = await vensterStandLezen(gebruiker, 'technisch');
    check('de technische ruimte heeft haar eigen, lege dok', technisch.vensters.length === 0);
    await vensterStandSchrijven(gebruiker, 'prive', { vensters: [{ ...venster('mail-koppelen:icloud', { klein: false, stap: 'wachtwoord', wachtwoord: 'geheim-abc' }) }] });
    const schoon = await vensterStandLezen(gebruiker, 'prive');
    check('de database bewaart geen wachtwoord, ook niet als de aanroeper het meestuurt',
      schoon.vensters.length === 1 && !JSON.stringify(schoon).includes('geheim-abc') && schoon.vensters[0].stap === 'wachtwoord-opnieuw');
    const ruw = await sys.query('SELECT vensters::text AS t FROM app.venster_stand WHERE user_id = $1 AND ruimte = $2', [gebruiker, 'prive']);
    check('ook de ruwe rij in Postgres draagt geen geheim', !String(ruw.rows[0]?.t || '').includes('geheim-abc'));
  } finally {
    await sys.query('DELETE FROM app.venster_stand WHERE user_id = $1', [gebruiker]);
    await closePool();
  }
  return einde();
}
