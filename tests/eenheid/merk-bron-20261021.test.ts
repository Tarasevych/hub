// Besluit van de eigenaar (21.10.2026): «знайди … публічні фото їх логотипів і збережи в базу … До офіційних адрес / від кого щось
// прийшло — також мають бути заповнені … Якщо акаунти Google або інші видають фото відправника — вони також мають
// відображатися в нас на сервісі.»
//
// Wat deze test bewijst over backend/merk-bron.ts (migratie 0097) — met een ECHTE HTTPS-server op 127.0.0.1 en een DNS-nabootser
// (hulp/nep-merk-web.ts): er gaat niets naar buiten, maar het is wel dezelfde code (resolven, controleren, pinnen, TLS, omleiden):
//   1. de volgorde van de bronnen: BIMI → <link rel=icon> → manifest (≥ 128 px) → /favicon.ico, en het organisatiedomein;
//   2. de veiligheid: alleen https; privé/loopback/link-local/CGNAT/ULA geweigerd vóór de verbinding (ook als één DNS-antwoord zo
//      is); een omleiding naar 127.0.0.1 geweigerd; hoogstens 3 omleidingen; > 256 KB geweigerd; SVG met script geweigerd; geen
//      cookies, geen Authorization, eigen User-Agent;
//   3. de database: positieve rij 30 dagen, negatieve 1 dag, geen nieuw verzoek zolang de rij geldt, verlopen = oud logo + opnieuw;
//      de schakelaar van de eigenaar zet het ophalen echt uit;
//   4. de personen: Google People API (nagebootst) — een standaardfoto (`default: true`) wordt overgeslagen, alleen
//      googleusercontent.com; Gravatar alleen na aanzetten (en dan met de SHA-256, niet het adres); vCard; een gratis mailbox krijgt
//      nooit het logo van de dienst;
//   5. de scheiding: een foto uit de persoonlijke ruimte is in de technische niet te zien; het adres staat alleen als HMAC in de tabel;
//   6. de sleutelkluis: aan + open → alleen een dek1-envelop (data NULL), leesbaar terug; dicht → niets bewaard en «gesloten»;
//      «перешифрувати» zet een oude onversleutelde foto om;
//   7. de route: door de ruimtepoort (zonder lade geen gegevens), Cache-Control privé, nosniff, data-URI.
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';
import { ico, jpeg, nepMerkWeb, png, type NepRoute } from './hulp/nep-merk-web';
import {
  controleerBeeld, formaatVan, fotosUitPeople, iconenUitHtml, iconenUitManifest, isGratisDomein, kandidatenVolgorde, vcardFoto,
} from '../../shared/merk-bron';
import type { Lade } from '../../shared/ruimte-scheiding';

const sys = () => getPool('systeem');
const fout = async (taak: () => Promise<unknown>): Promise<string> => { try { await taak(); return ''; } catch (e) { return String((e as { code?: string }).code || (e as Error).message); } };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#c00" d="M2 2h20v20H2z"/></svg>';
const SVG_ORG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#063"/></svg>';
const SVG_KWAAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0h1v1z"/></svg>';
const html = (kop: string) => `<!doctype html><html><head><meta charset="utf-8"><title>t</title>${kop}</head><body>x</body></html>`;

export async function main(): Promise<number> {
  const { check, einde } = checker('merk-bron-20261021');
  const mb = await import('../../backend/merk-bron');
  const sk = await import('../../backend/sleutelkluis');
  const { metLade, isPostPad, dienstVoorPad, VRIJ_VAN_POORT } = await import('../../backend/mail-ruimte');

  const U = `merkbron-test-${randomUUID()}`;
  const P: Lade = { userId: U, ruimte: 'prive' }, T: Lade = { userId: U, ruimte: 'technisch' };
  const PNG_SITE = png([1, 2, 3]), PNG_GROOT = png([4, 5, 6]), PNG_KLEIN = png([7, 8, 9]), PNG_GRAV = png([10, 11, 12]), ICO = ico();
  const FOTO_ANNA = jpeg('anna'), FOTO_BOB = jpeg('bob-standaard');
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  const EVA = 'eva@voorbeeld-persoon.test';

  const NAMEN = ['bimi.voorbeeld.test', 'site.voorbeeld.test', 'manifest.voorbeeld.test', 'favicon.voorbeeld.test', 'omleiding.voorbeeld.test', 'lus.voorbeeld.test',
    'groot.voorbeeld.test', 'script.voorbeeld.test', 'mail.orgbedrijf.test', 'orgbedrijf.test', 'lh3.googleusercontent.com', 'gravatar.com', 'voorbeeld-persoon.test', 'koek.voorbeeld.test'];
  const vast = (m: Record<string, { status?: number; headers?: Record<string, string>; body?: Buffer | string }>): NepRoute => (pad) => m[pad.split('?')[0]] ?? null;
  const web = await nepMerkWeb(NAMEN, {
    'bimi.voorbeeld.test': vast({ '/logo.svg': { headers: { 'content-type': 'image/svg+xml' }, body: SVG }, '/': { body: html('') } }),
    'site.voorbeeld.test': vast({ '/': { headers: { 'content-type': 'text/html', 'set-cookie': 'sessie=geheim; Path=/' }, body: html('<link rel="mask-icon" href="/masker.svg"><link rel="icon" href="http://site.voorbeeld.test/onveilig.png"><link rel="icon" sizes="192x192" href="/icoon.png">') }, '/icoon.png': { body: PNG_SITE } }),
    'manifest.voorbeeld.test': vast({ '/': { body: html('<link rel="icon" href="/klein.png" sizes="16x16"><link rel="manifest" href="/app.webmanifest">') }, '/app.webmanifest': { body: JSON.stringify({ icons: [{ src: '/mono.png', sizes: '512x512', purpose: 'monochrome' }, { src: '/te-klein.png', sizes: '64x64' }, { src: '/groot.png', sizes: '512x512', type: 'image/png' }] }) }, '/groot.png': { body: PNG_GROOT }, '/klein.png': { body: PNG_KLEIN } }),
    'favicon.voorbeeld.test': vast({ '/': { body: html('') }, '/favicon.ico': { body: ICO } }),
    'omleiding.voorbeeld.test': vast({ '/': { status: 302, headers: { location: `https://127.0.0.1:${0}/` } }, '/favicon.ico': { status: 301, headers: { location: 'https://127.0.0.1/geheim' } } }),
    'lus.voorbeeld.test': vast({ '/': { status: 302, headers: { location: '/a' } }, '/a': { status: 302, headers: { location: '/b' } }, '/b': { status: 302, headers: { location: '/c' } }, '/c': { status: 302, headers: { location: '/d' } }, '/d': { body: PNG_SITE } }),
    'groot.voorbeeld.test': vast({ '/favicon.ico': { body: Buffer.concat([ICO, Buffer.alloc(300 * 1024)]) } }),
    'script.voorbeeld.test': vast({ '/': { body: html('<link rel="icon" type="image/svg+xml" href="/kwaad.svg">') }, '/kwaad.svg': { body: SVG_KWAAD } }),
    'orgbedrijf.test': vast({ '/bimi.svg': { body: SVG_ORG } }),
    'lh3.googleusercontent.com': vast({ '/foto-anna': { headers: { 'content-type': 'image/jpeg' }, body: FOTO_ANNA }, '/standaard-bob': { body: FOTO_BOB } }),
    'gravatar.com': (pad) => (pad.startsWith(`/avatar/${sha(EVA)}?`) ? { body: PNG_GRAV } : { status: 404, body: '' }),
    'koek.voorbeeld.test': vast({ '/': { status: 302, headers: { location: '/b', 'set-cookie': 'x=1' } }, '/b': { body: PNG_SITE } }),
  });
  const ADRES: Record<string, string[]> = Object.fromEntries(NAMEN.map((n, i) => [n, [`203.0.113.${10 + i}`]]));
  Object.assign(ADRES, { 'intern.voorbeeld.test': ['10.0.0.1'], 'gemengd.voorbeeld.test': ['203.0.113.99', '127.0.0.1'], 'cgnat.voorbeeld.test': ['100.64.0.5'], 'ula.voorbeeld.test': ['fd00::1'], 'linklokaal.voorbeeld.test': ['169.254.169.254'] });
  const TXT: Record<string, string[][]> = {
    'default._bimi.bimi.voorbeeld.test': [['v=BIMI1; l=https://bimi.voorbeeld.test/logo.svg']],
    'default._bimi.orgbedrijf.test': [['v=BIMI1; l=https://orgbedrijf.test/bimi.svg; a=']],
  };
  const opgezocht: string[] = [];
  const NET = {
    txt: async (n: string) => { if (TXT[n]) return TXT[n]; throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' }); },
    adressen: async (h: string) => { opgezocht.push(h); const a = ADRES[h]; if (!a) throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' }); return a.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })); },
    verbindMet: (adres: string, poort: number) => (adres.startsWith('203.0.113.') ? { adres: '127.0.0.1', poort: web.poort } : { adres, poort }),
    ca: web.ca,
  };
  mb._zetMerkNet(NET);
  mb._merkBronVergeten();
  // De schakelaar van de eigenaar: zoals hij stond, terug aan het eind.
  const schakelaarVoor = (await sys().query(`SELECT aan FROM app.merk_bron_instelling WHERE sleutel = 'afzender-domeinen'`)).rows[0] as { aan: boolean } | undefined;
  await mb.domeinOphalenZetten(true, 'eenheidstest');
  const testDomeinen = [...NAMEN, 'intern.voorbeeld.test'];
  await sys().query('DELETE FROM app.merk_beeld WHERE sleutel = ANY($1::text[])', [testDomeinen]);
  const gmailVoor = (await sys().query(`SELECT 1 FROM app.merk_beeld WHERE sleutel = 'gmail.com'`)).rowCount;

  try {
    // ================================================================ 0. zuivere regels
    const h = iconenUitHtml(html('<link rel="mask-icon" href="/m.svg"><link rel="icon" href="http://x.test/a.png"><link rel="apple-touch-icon" href="/apple.png"><link rel="shortcut icon" href="favicon-32.png" sizes="32x32"><link rel="icon" href="/logo.svg" type="image/svg+xml"><base href="https://boos.test/">'), 'https://w.test/pad/');
    check('HTML: alleen https-iconen (http genegeerd), mask-icon telt niet, relatief tegen de pagina (geen <base>)', h.iconen.length === 3 && h.iconen.every((i) => i.url.startsWith('https://w.test/')) && h.iconen.some((i) => i.url === 'https://w.test/pad/favicon-32.png'));
    const volg = kandidatenVolgorde(h.iconen, iconenUitManifest({ icons: [{ src: '/m512.png', sizes: '512x512' }, { src: '/m64.png', sizes: '64x64' }] }, 'https://w.test/app.json'));
    check('volgorde: groot (SVG/apple-touch) → manifest ≥ 128 px → kleine <link>-iconen', volg.map((k) => k.url.replace('https://w.test', '')).join(' ') === '/logo.svg /apple.png /m512.png /pad/favicon-32.png', volg.map((k) => k.url).join(' '));
    check('formaat uit de handtekening: PNG, JPEG, ICO, SVG; GIF en HTML geweigerd', formaatVan(png()) === 'image/png' && formaatVan(jpeg('x')) === 'image/jpeg' && formaatVan(ico()) === 'image/x-icon' && formaatVan(Buffer.from(`<?xml version="1.0"?>\n${SVG}`)) === 'image/svg+xml'
      && !controleerBeeld(Buffer.from('GIF89a......')).ok && !controleerBeeld(Buffer.from('<html><svg></svg></html>')).ok);
    check('SVG met script → geweigerd met reden (zelfde ontsmetting als een eigen logo)', (controleerBeeld(Buffer.from(SVG_KWAAD)) as { reden?: string }).reden === 'SVG_ELEMENT_SCRIPT');
    check('gratis mailbox (gmail.com, ukr.net, mail.ukr.net) → nooit het logo van de dienst als foto', isGratisDomein('gmail.com') && isGratisDomein('ukr.net') && isGratisDomein('mail.ukr.net') && !isGratisDomein('orgbedrijf.test'));
    const people = fotosUitPeople({ connections: [
      { emailAddresses: [{ value: 'Anna@Voorbeeld-Persoon.test' }], photos: [{ url: 'https://lh3.googleusercontent.com/foto-anna', metadata: { primary: true } }] },
      { emailAddresses: [{ value: 'bob@voorbeeld-persoon.test' }], photos: [{ url: 'https://lh3.googleusercontent.com/standaard-bob', default: true }] },
    ], otherContacts: [{ emailAddresses: [{ value: 'carla@voorbeeld-persoon.test' }], photos: [{ url: 'https://boos.voorbeeld.test/carla.jpg' }] }] });
    check('People API: standaardfoto (`default: true`) overgeslagen, alleen googleusercontent.com, adres in kleine letters', people.size === 1 && people.get('anna@voorbeeld-persoon.test') === 'https://lh3.googleusercontent.com/foto-anna');
    const b64 = FOTO_ANNA.toString('base64');
    const v3 = vcardFoto(`BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Frank\r\nPHOTO;ENCODING=b;TYPE=JPEG:${b64.slice(0, 10)}\r\n ${b64.slice(10)}\r\nEND:VCARD`);
    const v4 = vcardFoto(`BEGIN:VCARD\nVERSION:4.0\nPHOTO:data:image/jpeg;base64,${b64}\nEND:VCARD`);
    const uri = vcardFoto('BEGIN:VCARD\nVERSION:3.0\nPHOTO;VALUE=uri:https://volger.test/pixel.jpg\nEND:VCARD');
    check('vCard: PHOTO als base64 (3.0, gevouwen regel) en als data-URI (4.0); een PHOTO-URL wordt NOOIT gevolgd', !!v3?.ok && !!v4?.ok && uri === null);

    // ================================================================ 1. veiligheid van elke verbinding
    check('alleen https: http:// → ALLEEN_HTTPS', await fout(() => mb.veiligOphalen('http://site.voorbeeld.test/', '*/*')) === 'ALLEEN_HTTPS');
    const privé: Array<[string, string]> = [['intern.voorbeeld.test', '10.0.0.1'], ['gemengd.voorbeeld.test', '203.0.113.99 + 127.0.0.1'], ['cgnat.voorbeeld.test', '100.64.0.5'], ['ula.voorbeeld.test', 'fd00::1'], ['linklokaal.voorbeeld.test', '169.254.169.254']];
    const uitslag = await Promise.all(privé.map(([h2]) => fout(() => mb.veiligOphalen(`https://${h2}/`, '*/*'))));
    check(`privé-adressen geweigerd VÓÓR de verbinding (${privé.map(([, a]) => a).join(', ')})`, uitslag.every((u) => u === 'PRIVE_ADRES') && privé.every(([h2]) => web.aantal(h2) === 0), uitslag.join());
    check('IP-letterlijk: https://127.0.0.1/ en https://[::1]/ → PRIVE_ADRES', await fout(() => mb.veiligOphalen('https://127.0.0.1/', '*/*')) === 'PRIVE_ADRES' && await fout(() => mb.veiligOphalen('https://[::1]/', '*/*')) === 'PRIVE_ADRES');
    check('omleiding naar 127.0.0.1 → geweigerd (PRIVE_ADRES), het doel wordt nooit benaderd', await fout(() => mb.veiligOphalen('https://omleiding.voorbeeld.test/', '*/*')) === 'PRIVE_ADRES');
    check('hoogstens 3 omleidingen (4 verzoeken, dan TE_VEEL_OMLEIDINGEN)', await fout(() => mb.veiligOphalen('https://lus.voorbeeld.test/', '*/*')) === 'TE_VEEL_OMLEIDINGEN' && web.aantal('lus.voorbeeld.test') === 4);
    check('> 256 KB → TE_GROOT', await fout(() => mb.veiligOphalen('https://groot.voorbeeld.test/favicon.ico', 'image/*')) === 'TE_GROOT');
    const ok = await mb.veiligOphalen('https://koek.voorbeeld.test/', 'image/*');
    const koek = web.verzoeken.filter((v) => v.host === 'koek.voorbeeld.test');
    check('geen cookies (ook niet na Set-Cookie bij een omleiding), geen Authorization, eigen User-Agent', ok.status === 200 && koek.length === 2 && koek.every((v) => !v.kop.cookie && !v.kop.authorization && v.kop['user-agent'] === mb.MERK_UA));
    mb._zetMerkNet({ ...NET, ca: undefined });
    const tls = await fout(() => mb.veiligOphalen('https://site.voorbeeld.test/', '*/*'));
    mb._zetMerkNet(NET);
    check('TLS echt gecontroleerd: zonder de CA van de nabootser geen verbinding (TLS_FOUT)', tls === 'TLS_FOUT', tls);

    // ================================================================ 2. de volgorde van de bronnen
    const z = async (d: string) => mb.zoekLogo(d) as Promise<{ bron?: string; mime?: string; url?: string; domein?: string; fout?: string; inhoud?: Buffer }>;
    const bimi = await z('bimi.voorbeeld.test');
    check('BIMI eerst: default._bimi → l= → SVG (bron bimi)', bimi.bron === 'bimi' && bimi.mime === 'image/svg+xml' && web.aantal('bimi.voorbeeld.test') === 1);
    const site = await z('site.voorbeeld.test');
    check('daarna de eigen website: <link rel=icon sizes=192x192> (bron favicon, PNG) — http-icoon en mask-icon genegeerd', site.bron === 'favicon' && site.mime === 'image/png' && !!site.inhoud?.equals(PNG_SITE) && !web.verzoeken.some((v) => v.pad === '/masker.svg' || v.pad === '/onveilig.png'));
    const man = await z('manifest.voorbeeld.test');
    check('manifest-iconen ≥ 128 px vóór een klein <link>-icoon (512 px, niet monochroom)', man.bron === 'manifest' && !!man.inhoud?.equals(PNG_GROOT) && !web.verzoeken.some((v) => v.pad === '/mono.png' || v.pad === '/te-klein.png'));
    const fav = await z('favicon.voorbeeld.test');
    check('/favicon.ico als laatste (ICO)', fav.bron === 'favicon' && fav.mime === 'image/x-icon');
    const kwaad = await z('script.voorbeeld.test');
    check('SVG met script op de website → niet bewaard, reden SVG_ELEMENT_SCRIPT', kwaad.fout === 'SVG_ELEMENT_SCRIPT', JSON.stringify(kwaad).slice(0, 80));
    const om = await z('omleiding.voorbeeld.test');
    check('website die naar 127.0.0.1 omleidt → geen logo, reden PRIVE_ADRES', om.fout === 'PRIVE_ADRES');
    const org = await z('mail.orgbedrijf.test');
    check('organisatiedomein: mail.orgbedrijf.test heeft niets, orgbedrijf.test wel (BIMI)', org.bron === 'bimi' && org.domein === 'orgbedrijf.test');

    // ================================================================ 3. database, wachtrij, cache
    const eerst = await mb.merkBeelden(['site.voorbeeld.test', 'script.voorbeeld.test']);
    await mb.wachtrijLeeg();
    const rijen = await mb.merkRijen(['site.voorbeeld.test', 'script.voorbeeld.test']);
    const pos = rijen.get('site.voorbeeld.test'), neg = rijen.get('script.voorbeeld.test');
    const dag = 24 * 3600 * 1000;
    check('eerste vraag: niets in de database, beide in de wachtrij (niet blokkerend)', eerst.beelden.size === 0 && eerst.wachtrij.length === 2);
    check('positieve rij: data, sha256, bron, https-bron-URL, 30 dagen geldig', !!pos?.data?.equals(PNG_SITE) && pos?.bron === 'favicon' && /^[a-f0-9]{64}$/.test(String(pos?.sha256)) && /^https:\/\/site\.voorbeeld\.test\/icoon\.png$/.test(String(pos?.bronUrl)) && Math.abs((pos!.geldigTot - Date.now()) - 30 * dag) < 60_000);
    check('negatieve rij: geen data, fout, 1 dag geldig', !!neg && !neg.data && neg.fout === 'SVG_ELEMENT_SCRIPT' && Math.abs((neg.geldigTot - Date.now()) - dag) < 60_000);
    const voor = web.verzoeken.length;
    const tweede = await mb.merkBeelden(['site.voorbeeld.test', 'script.voorbeeld.test']);
    check('cache: tweede vraag geeft het logo uit de database, zonder één nieuw verzoek (ook niet voor de negatieve rij)', tweede.beelden.get('site.voorbeeld.test')?.data?.equals(PNG_SITE) === true && tweede.wachtrij.length === 0 && web.verzoeken.length === voor);
    await sys().query(`UPDATE app.merk_beeld SET geldig_tot = now() - interval '1 second' WHERE sleutel = 'site.voorbeeld.test'`);
    const binnenInterval = await mb.merkBeelden(['site.voorbeeld.test']);
    check('verlopen, maar binnen 10 minuten na de vorige poging: het oude logo, geen nieuw verzoek (frequentiegrens per domein)', binnenInterval.beelden.size === 1 && binnenInterval.wachtrij.length === 0 && web.verzoeken.length === voor);
    mb._merkBronVergeten();
    const verlopen = await mb.merkBeelden(['site.voorbeeld.test']);
    await mb.wachtrijLeeg();
    const vernieuwd = (await mb.merkRijen(['site.voorbeeld.test'])).get('site.voorbeeld.test');
    check('verlopen en buiten de grens: het oude logo meteen, en opnieuw opgehaald (weer 30 dagen)', verlopen.beelden.size === 1 && verlopen.wachtrij.length === 1 && !!vernieuwd && vernieuwd.geldigTot > Date.now() + 29 * dag);
    await mb.domeinOphalenZetten(false, 'eenheidstest');
    const uit = await mb.merkBeelden(['favicon.voorbeeld.test']);
    await mb.wachtrijLeeg();
    check('schakelaar van de eigenaar UIT: geen wachtrij, geen verzoek naar het domein', uit.wachtrij.length === 0 && web.aantal('favicon.voorbeeld.test') === 2 /* alleen de 2 van zoekLogo hierboven */ && !(await mb.merkRijen(['favicon.voorbeeld.test'])).size);
    await mb.domeinOphalenZetten(true, 'eenheidstest');

    // ================================================================ 4. afzenders: domein, gratis mailbox, personen
    await sys().query(`INSERT INTO app.merk_beeld (sleutel, bron, mime, data, sha256, geldig_tot) VALUES ('gmail.com', 'favicon', 'image/png', $1, $2, now() + interval '1 day') ON CONFLICT (sleutel) DO NOTHING`, [PNG_SITE, createHash('sha256').update(PNG_SITE).digest('hex')]);
    const a1 = await mb.afzenderBeelden(P, ['Info <info@mail.orgbedrijf.test>', 'anna@gmail.com', 'geen-adres', 'x@site.voorbeeld.test']);
    await mb.wachtrijLeeg();
    const a2 = await mb.afzenderBeelden(P, ['info@mail.orgbedrijf.test', 'anna@gmail.com', 'x@site.voorbeeld.test']);
    const per = (l: typeof a2.beelden, a: string) => l.find((x) => x.adres === a);
    check('afzender van een organisatie: eerst niets (wachtrij), daarna het logo van zijn domein (BIMI van orgbedrijf.test) als data-URI', per(a1.beelden, 'info@mail.orgbedrijf.test')?.soort === 'geen' && a1.wachtrij >= 1 && per(a2.beelden, 'info@mail.orgbedrijf.test')?.soort === 'merk' && per(a2.beelden, 'info@mail.orgbedrijf.test')?.bron === 'bimi' && /^data:image\/svg\+xml;base64,/.test(String(per(a2.beelden, 'info@mail.orgbedrijf.test')?.data)), JSON.stringify(a2.beelden).slice(0, 200));
    check('gratis mailbox (gmail.com): nooit het Gmail-logo als foto, ook al staat het in de database', per(a2.beelden, 'anna@gmail.com')?.soort === 'geen');
    check('ongeldig adres valt weg; een bekend logo komt meteen mee', !a1.beelden.some((x) => x.adres === 'geen-adres') && per(a2.beelden, 'x@site.voorbeeld.test')?.soort === 'merk');
    check('Gravatar en Google standaard UIT: geen enkele vraag naar gravatar.com of googleusercontent.com', !opgezocht.includes('gravatar.com') && !web.verzoeken.some((v) => v.host === 'gravatar.com' || v.host === 'lh3.googleusercontent.com') && a2.voorkeur.gravatar === false && a2.voorkeur.googleContacten === false);

    // --- Google People API (nagebootst)
    const googleVragen: string[] = [];
    mb._zetGoogleFotoBron({
      accounts: async (l) => (l.userId === U ? [{ id: 'acc-1', email: 'eigenaar@test.invalid' }] : []),
      pagina: async (_l, _acc, soort, token) => {
        googleVragen.push(`${soort}:${token}`);
        if (soort === 'connections') return token ? { antwoord: { connections: [{ emailAddresses: [{ value: 'bob@voorbeeld-persoon.test' }], photos: [{ url: 'https://lh3.googleusercontent.com/standaard-bob', default: true }] }] }, volgende: '' }
          : { antwoord: { connections: [{ emailAddresses: [{ value: 'anna@voorbeeld-persoon.test' }], photos: [{ url: 'https://lh3.googleusercontent.com/foto-anna', metadata: { primary: true } }] }] }, volgende: 'p2' };
        return { antwoord: { otherContacts: [{ emailAddresses: [{ value: 'carla@voorbeeld-persoon.test' }], photos: [{ url: 'https://boos.voorbeeld.test/carla.jpg' }] }] }, volgende: '' };
      },
    });
    await mb.voorkeurZetten(P, { googleContacten: true });
    const g1 = await mb.afzenderBeelden(P, ['anna@voorbeeld-persoon.test', 'bob@voorbeeld-persoon.test', 'carla@voorbeeld-persoon.test']);
    await mb.wachtrijLeeg();
    const g2 = await mb.afzenderBeelden(P, ['anna@voorbeeld-persoon.test', 'bob@voorbeeld-persoon.test', 'carla@voorbeeld-persoon.test']);
    const anna = per(g2.beelden, 'anna@voorbeeld-persoon.test');
    check('Google-contacten aan: alle pagina\'s van connections + otherContacts gelezen', g1.wachtrij >= 3 && googleVragen.join(' ') === 'connections: connections:p2 otherContacts:', googleVragen.join(' '));
    check('foto uit de contacten → soort persoon, bron google-contact, de JPEG van googleusercontent', anna?.soort === 'persoon' && anna.bron === 'google-contact' && anna.data === `data:image/jpeg;base64,${FOTO_ANNA.toString('base64')}`);
    check('standaardfoto van Google (`default: true`) NIET opgehaald en niet getoond; vreemde host ook niet', per(g2.beelden, 'bob@voorbeeld-persoon.test')?.soort !== 'persoon' && !web.verzoeken.some((v) => v.pad === '/standaard-bob') && per(g2.beelden, 'carla@voorbeeld-persoon.test')?.soort !== 'persoon' && !opgezocht.includes('boos.voorbeeld.test'));
    const rij = (await sys().query(`SELECT row_to_json(r)::text AS t, adres_hash FROM app.afzender_beeld r WHERE user_id = $1 AND ruimte = 'prive' AND bron = 'google-contact'`, [U])).rows;
    const pepper = String(process.env.AFZENDER_BEELD_PEPPER || '').trim().length >= 32 ? String(process.env.AFZENDER_BEELD_PEPPER).trim() : String(process.env.AUDIT_IP_PEPPER || '').trim();
    const verwacht = createHmac('sha256', pepper).update('afzender-beeld-v1|anna@voorbeeld-persoon.test').digest('hex');
    check('adres alleen als HMAC met de serverpepper (niet de kale SHA-256, nergens het adres zelf in de rij)', rij.length === 1 && rij[0].adres_hash === verwacht && rij[0].adres_hash !== sha('anna@voorbeeld-persoon.test') && !/anna|voorbeeld-persoon/i.test(String(rij[0].t)));
    check('bron_host = alleen de host, geen pad', (await sys().query(`SELECT bron_host FROM app.afzender_beeld WHERE user_id = $1 AND bron = 'google-contact'`, [U])).rows[0]?.bron_host === 'lh3.googleusercontent.com');

    // --- scheiding: persoonlijk ≠ technisch
    const t1 = await mb.afzenderBeelden(T, ['anna@voorbeeld-persoon.test']);
    check('de foto uit de PERSOONLIJKE ruimte is in de TECHNISCHE niet te zien (eigen voorkeur, eigen rijen)', per(t1.beelden, 'anna@voorbeeld-persoon.test')?.soort !== 'persoon' && t1.voorkeur.googleContacten === false && (await mb.persoonBeelden(T, ['anna@voorbeeld-persoon.test'])).size === 0);

    // --- vCard + herversleutelen + sleutelkluis
    check('vCard van een afzender (technische ruimte, sleutelkluis nog uit) → onversleuteld bewaard', await mb.afzenderBeeldUitVcard(T, 'frank@voorbeeld-persoon.test', `BEGIN:VCARD\nVERSION:4.0\nPHOTO:data:image/jpeg;base64,${b64}\nEND:VCARD`) === 'ok'
      && !!(await sys().query(`SELECT data FROM app.afzender_beeld WHERE user_id = $1 AND ruimte = 'technisch' AND bron = 'vcard'`, [U])).rows[0]?.data);
    await sk.inschakelen(T, { soort: 'intern', id: 'merkbron-test' });
    const her = await sk.herversleutelen(T);
    const naHer = (await sys().query(`SELECT data, data_versleuteld FROM app.afzender_beeld WHERE user_id = $1 AND ruimte = 'technisch' AND bron = 'vcard'`, [U])).rows[0];
    check('«Перешифрувати мої дані зараз»: de oude foto staat daarna alleen als dek1-envelop', her.tabellen.some((x) => x.tabel === 'app.afzender_beeld' && x.herversleuteld === 1) && naHer?.data === null && /^dek1\./.test(String(naHer?.data_versleuteld)));
    await mb.voorkeurZetten(T, { googleContacten: true });
    await mb.afzenderBeelden(T, ['anna@voorbeeld-persoon.test']);
    await mb.wachtrijLeeg();
    const tRij = (await sys().query(`SELECT data, data_versleuteld FROM app.afzender_beeld WHERE user_id = $1 AND ruimte = 'technisch' AND bron = 'google-contact'`, [U])).rows[0];
    const t2 = await mb.afzenderBeelden(T, ['anna@voorbeeld-persoon.test', 'frank@voorbeeld-persoon.test']);
    check('sleutelkluis aan + open: nieuwe foto ALLEEN als dek1-envelop (data NULL)', !!tRij && tRij.data === null && /^dek1\./.test(String(tRij.data_versleuteld)));
    check('… en leesbaar terug in dezelfde lade (JPEG ongewijzigd), vCard-foto ook', per(t2.beelden, 'anna@voorbeeld-persoon.test')?.data === `data:image/jpeg;base64,${FOTO_ANNA.toString('base64')}` && per(t2.beelden, 'frank@voorbeeld-persoon.test')?.bron === 'vcard');
    sk.sleutelVergrendelen(T);
    const t3 = await mb.afzenderBeelden(T, ['anna@voorbeeld-persoon.test']);
    const dicht = await mb.persoonOpslaan(T, 'dora@voorbeeld-persoon.test', 'vcard', { mime: 'image/jpeg', inhoud: FOTO_ANNA, host: '' });
    await new Promise((ok) => setTimeout(ok, 300)); // journaalTellen schrijft op de achtergrond
    const dora = (await sys().query(`SELECT count(*)::int AS n FROM app.afzender_beeld WHERE user_id = $1 AND ruimte = 'technisch' AND adres_hash = $2`, [U, createHmac('sha256', pepper).update('afzender-beeld-v1|dora@voorbeeld-persoon.test').digest('hex')])).rows[0].n;
    check('sleutel DICHT: geen foto maar «gesloten» (nooit stil onversleuteld bewaren): niets geschreven', per(t3.beelden, 'anna@voorbeeld-persoon.test')?.soort !== 'persoon' && per(t3.beelden, 'anna@voorbeeld-persoon.test')?.sleutel === 'gesloten' && dicht === 'gesloten' && dora === 0);
    check('… en het journaal van de kluis telt het overslaan', ((await sys().query(`SELECT aantal FROM app.sleutelkluis_journaal WHERE user_id = $1 AND ruimte = 'technisch' AND tabel = 'app.afzender_beeld' AND soort = 'gesloten-overgeslagen'`, [U])).rows[0]?.aantal ?? 0) >= 1);

    // --- Gravatar (alleen na aanzetten) en uitzetten wist
    await mb.voorkeurZetten(P, { gravatar: true });
    await mb.afzenderBeelden(P, [EVA, 'niemand@voorbeeld-persoon.test']);
    await mb.wachtrijLeeg();
    const grav = await mb.afzenderBeelden(P, [EVA, 'niemand@voorbeeld-persoon.test']);
    const gv = web.verzoeken.filter((v) => v.host === 'gravatar.com');
    check('Gravatar aan: foto via de SHA-256 van het adres (d=404), nooit het adres zelf in de URL', per(grav.beelden, EVA)?.bron === 'gravatar' && gv.some((v) => v.pad === `/avatar/${sha(EVA)}?s=128&d=404`) && !gv.some((v) => /eva|voorbeeld-persoon/.test(v.pad)));
    check('geen Gravatar voor een adres → negatieve rij (1 dag), geen foto', per(grav.beelden, 'niemand@voorbeeld-persoon.test')?.soort !== 'persoon' && (await sys().query(`SELECT fout FROM app.afzender_beeld WHERE user_id = $1 AND bron = 'gravatar' AND fout IS NOT NULL`, [U])).rows[0]?.fout === 'GEEN_FOTO');
    await mb.voorkeurZetten(P, { gravatar: false, googleContacten: false });
    check('uitzetten wist meteen de foto\'s van die bronnen in deze lade (gegevensminimalisatie)', (await sys().query(`SELECT count(*)::int AS n FROM app.afzender_beeld WHERE user_id = $1 AND ruimte = 'prive' AND bron IN ('gravatar', 'google-contact')`, [U])).rows[0].n === 0);

    // ================================================================ 5. de routes
    let sessie: { service: string; user: { id: string; email: string; status: string; role?: string } } = { service: 'mail', user: { id: U, email: 'eigenaar@test.invalid', status: 'approved', role: 'user' } };
    const routes = mb.merkBronRoutes({ requireSession: async () => sessie });
    const roep = (pad: string, body: Record<string, unknown>) => routes[pad][0]({ event: {}, body } as never) as Promise<{ statusCode: number; headers: Record<string, string>; body: string }>;
    const zonder = await roep('POST /api/owner/mail/afzender-beelden', { adressen: ['x@site.voorbeeld.test'] });
    check('route zonder ruimtepoort (geen lade gebonden) → geen gegevens (RUIMTE_POORT_ONTBREEKT)', zonder.statusCode === 500 && /RUIMTE_POORT_ONTBREEKT/.test(zonder.body));
    check('de route valt onder de poort van de post (dienst «mail», niet vrijgesteld)', isPostPad('/api/owner/mail/afzender-beelden') && dienstVoorPad('/api/owner/mail/afzender-beelden') === 'mail' && !VRIJ_VAN_POORT.some((r) => r.includes('afzender-beelden')));
    const met = await metLade(P, 'mail', () => roep('POST /api/owner/mail/afzender-beelden', { adressen: ['x@site.voorbeeld.test', 'info@mail.orgbedrijf.test'] }));
    const metBody = JSON.parse(met.body) as { beelden: Array<{ adres: string; data?: string }> };
    check('route met lade: 200, Cache-Control privé, X-Content-Type-Options nosniff, data-URI per adres', met.statusCode === 200 && /private/.test(met.headers['Cache-Control']) && met.headers['X-Content-Type-Options'] === 'nosniff' && metBody.beelden.every((b) => /^data:image\/(png|svg\+xml);base64,/.test(String(b.data))));
    sessie = { ...sessie, service: 'hub' };
    check('route alleen vanuit de mail (andere dienst → 403)', (await metLade(P, 'mail', () => roep('POST /api/owner/mail/afzender-beelden', { adressen: [] }))).statusCode === 403);
    const merk = await roep('POST /api/owner/merk-beeld', { domeinen: ['site.voorbeeld.test', 'onzin', 'http://x'] });
    const merkBody = JSON.parse(merk.body) as { beelden: Array<{ domein: string; data: string }> };
    check('merken-route (elke goedgekeurde sessie, geen lade: publiek logo): data-URI, onzin genegeerd', merk.statusCode === 200 && merkBody.beelden.length === 1 && merkBody.beelden[0].domein === 'site.voorbeeld.test' && merkBody.beelden[0].data.startsWith('data:image/png;base64,') && merk.headers['X-Content-Type-Options'] === 'nosniff');
    const vreemd = await roep('POST /api/owner/merk-beeld', { domeinen: ['favicon.voorbeeld.test'] });
    await mb.wachtrijLeeg();
    check('merken-route laat de server alleen de merken van de site zelf ophalen (een willekeurig domein: lezen ja, halen nee)', vreemd.statusCode === 200 && (JSON.parse(vreemd.body) as { wachtrij: string[] }).wachtrij.length === 0 && web.aantal('favicon.voorbeeld.test') === 2);
    sessie = { ...sessie, user: { ...sessie.user, status: 'pending' } };
    check('zonder goedgekeurde sessie: niets', (await roep('POST /api/owner/merk-beeld', { domeinen: ['site.voorbeeld.test'] })).statusCode === 403);
    sessie = { service: 'admin', user: { id: U, email: 'iemand@test.invalid', status: 'approved', role: 'user' } };
    check('beheer van de schakelaar: alleen de eigenaar (anders OWNER_REQUIRED)', (await roep('POST /api/owner/admin/merk-bron/zetten', { aan: false })).statusCode === 403 && await mb.domeinOphalenAan() === true);
  } finally {
    await mb.wachtrijLeeg();
    mb._zetMerkNet(null);
    mb._zetGoogleFotoBron(null);
    mb._merkBronVergeten();
    sk.sleutelVergrendelen(T);
    await sys().query('DELETE FROM app.afzender_beeld WHERE user_id = $1', [U]);
    await sys().query('DELETE FROM app.afzender_beeld_voorkeur WHERE user_id = $1', [U]);
    await sys().query('DELETE FROM app.sleutelkluis_journaal WHERE user_id = $1', [U]);
    await sys().query('DELETE FROM app.sleutelkluis WHERE user_id = $1', [U]);
    await sys().query('DELETE FROM app.merk_beeld WHERE sleutel = ANY($1::text[]) OR sleutel LIKE $2', [testDomeinen, '%.voorbeeld.test']);
    if (!gmailVoor) await sys().query(`DELETE FROM app.merk_beeld WHERE sleutel = 'gmail.com'`);
    if (schakelaarVoor) await mb.domeinOphalenZetten(schakelaarVoor.aan, 'eenheidstest'); else await sys().query(`DELETE FROM app.merk_bron_instelling WHERE sleutel = 'afzender-domeinen'`);
    await web.sluit();
  }
  return einde();
}
