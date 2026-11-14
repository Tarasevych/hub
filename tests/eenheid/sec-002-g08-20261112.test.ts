// SEC-002, groep g08 (12.11.2026): regressie- en verificatiesuite voor vier bevindingen rond de externe agenda's.
//
//   integraties-02  CalDAV: het ontleden van het antwoord van een vreemde server was KWADRATISCH (drie reguliere
//                   uitdrukkingen in caldavOntdekken, caldavWaarden en het CDATA-patroon). Eén antwoord van 1 MB hield
//                   het hoofdproces een minuut vast; 8 MB uren. Hier: elke «kwaadaardige» vorm moet binnen GRENS_MS klaar zijn.
//   http-rand-02 /  pinnedFetch bouwde in de luisteraar van 'end' een Response met de status van de vreemde server. Voor
//   integraties-03  101 of 600–999 gooit die constructor een RangeError BUITEN de belofte → uncaughtException → het hele
//                   proces stopt. Hier: zo'n status wordt een nette afwijzing (REMOTE_STATUS_INVALID) en een stabiele foutcode.
//   integraties-07  CalDAV: geen bovengrens op het aantal afspraken per agenda/account en één INSERT per afspraak in één
//                   lange transactie. Hier: grenzen per agenda en per account, pakketten, en een grens op de frequentie.
//
// Er gaat niets naar buiten: de vreemde server is een stopcontact op 127.0.0.1 (de adrescontrole van de veilige ophaler
// weigert dat terecht, dus alléén in deze test wordt https.request naar die lokale server omgelegd), en CalDAV krijgt
// zijn antwoorden via zetCaldavVerzoekerVoorTest. Alle geheimen hier zijn verzonnen.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { sealWithEnvKey } from '../../server/platform';
import { getPool } from '../../server/platform/pg';
import { pinnedFetch, pinnedStream } from '../../backend/veilige-fetch';
import { auditLijst } from '../../server/platform/audit';
import { registreerMelder } from '../../backend/melder';

/** Grootte van de «kwaadaardige» lichamen. Vóór de patch duurt 1 MB minuten; met SEC002_G08_KB=256 is het bewijs korter. */
const KB = Math.max(16, Number(process.env.SEC002_G08_KB) || 1024);
/** Lineair ontleden van 1 MB kost milliseconden; kwadratisch kost (tientallen) seconden. Ruim genoeg voor een drukke machine. */
const GRENS_MS = 1500;
const meet = <T>(fn: () => T): { ms: number; uit: T | null; fout: string } => {
  const t = performance.now();
  try { const uit = fn(); return { ms: performance.now() - t, uit, fout: '' }; }
  catch (e) { return { ms: performance.now() - t, uit: null, fout: String((e as Error)?.message || e) }; }
};
const sys = () => getPool('systeem');

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g08-20261112');
  process.env.AGENDA_ABONNEMENT_SLEUTEL_V1 = Buffer.alloc(32, 7).toString('base64');
  const model = await import('../../shared/agenda-caldav-model') as unknown as Record<string, unknown> & typeof import('../../shared/agenda-caldav-model');
  const caldav = await import('../../backend/agenda-caldav');
  const spiegel = await import('../../backend/agenda-spiegel');
  const ics = await import('../../backend/agenda-ics');
  const { createAgendaRoutes } = await import('../../backend/agenda-routes');
  const n = KB * 1024;
  const opruimEigenaars: string[] = [];
  // Nacontrole g08-3: wat de site in het meldingencentrum zet, hier opvangen (backend/index.ts registreert in productie notify()).
  const meldingen: Array<{ userId: string; kind: string; title: string; message: string; link?: string }> = [];
  registreerMelder(async (userId, _email, kind, title, message, link) => { meldingen.push({ userId, kind, title, message, link }); });
  const auditVan = async (ownerId: string, action: string) => (await auditLijst({ ownerId, action, limit: 50 })).items;
  const meldingenVan = (userId: string, kind = 'agenda') => meldingen.filter((m) => m.userId === userId && m.kind === kind);
  /** Uk én nl in één melding: kyrillisch en een Nederlands woord. */
  const tweetalig = (t: string) => /[А-Яа-яІіЇїЄє]/.test(t) && /\b(de|het|een|agenda|afspraken|verzoeken)\b/i.test(t);

  // ====================================================================================== integraties-02: het model
  {
    const openZonderSluit = '<d:response>'.repeat(Math.floor(n / 12));
    const a = meet(() => model.caldavWaarden(openZonderSluit, 'response'));
    check(`integraties-02: caldavWaarden met ${KB} KB aan open tags zonder sluit-tag is lineair`, a.ms < GRENS_MS, `${a.ms.toFixed(0)} ms`);
    const b = meet(() => model.ontleedCaldavGegevens(openZonderSluit));
    check(`integraties-02: ontleedCaldavGegevens op hetzelfde lichaam is lineair`, b.ms < GRENS_MS, `${b.ms.toFixed(0)} ms`);
    // Elke tag een ANDERE prefix: een geheugen «deze naam heeft geen sluit-tag» zou hier niet helpen.
    let wisselend = '';
    for (let i = 0; wisselend.length < n; i += 1) wisselend += `<p${i}:response>`;
    const c = meet(() => model.caldavWaarden(wisselend, 'response'));
    check('integraties-02: ook met telkens een andere namespace-prefix blijft het lineair (stoppen bij de eerste tag zonder sluit-tag)', c.ms < GRENS_MS, `${c.ms.toFixed(0)} ms`);
    // Veel open tags en ÉÉN sluit-tag helemaal achteraan: vroeger zocht elke open tag opnieuw tot het einde.
    const verSluit = `${'<d:response>'.repeat(Math.floor(n / 12))}<d:href>/a</d:href></d:response>`;
    const d = meet(() => model.ontleedCaldavAgendas(verSluit, 'https://dav.example.invalid/'));
    check('integraties-02: veel open tags met één verre sluit-tag: lineair', d.ms < GRENS_MS, `${d.ms.toFixed(0)} ms`);
    const hrefs = '<href '.repeat(Math.floor(n / 6));
    const e = meet(() => model.caldavEersteHref(hrefs));
    check('integraties-02: «<href <href …» zonder één «>» is lineair', e.ms < GRENS_MS && e.uit === '', `${e.ms.toFixed(0)} ms`);
    // CDATA die nooit sluit, binnen calendar-data: het oude patroon probeerde vanaf elke «<![CDATA[» opnieuw tot het einde.
    const cdata = `<d:response><d:href>/a.ics</d:href><c:calendar-data>BEGIN:VCALENDAR${'<![CDATA['.repeat(Math.floor(n / 9))}</c:calendar-data></d:response>`;
    const f = meet(() => model.ontleedCaldavGegevens(cdata));
    check('integraties-02: CDATA zonder einde in calendar-data is lineair', f.ms < GRENS_MS && f.fout === '', `${f.ms.toFixed(0)} ms ${f.fout}`);
    const veelKleine = '<a>'.repeat(Math.floor(n / 3));
    const g = meet(() => model.caldavWaarden(veelKleine, 'response'));
    check('integraties-02: honderdduizenden kleine tags: begrensd aantal stappen', g.ms < GRENS_MS, `${g.ms.toFixed(0)} ms`);

    // Tekenverwijzingen buiten Unicode gooiden «Invalid code point» en braken de hele synchronisatie af.
    const buiten = meet(() => model.ontleedCaldavGegevens('<d:response><d:href>/a.ics</d:href><c:calendar-data>BEGIN:VCALENDAR&#9999999;X&#xFFFFFF;Y&#xD800;Z&#0;</c:calendar-data></d:response>'));
    check('integraties-02: «&#9999999;», «&#xFFFFFF;», een los surrogaat en «&#0;» worden U+FFFD in plaats van een RangeError',
      buiten.fout === '' && buiten.uit?.length === 1 && buiten.uit[0].ics === 'BEGIN:VCALENDAR�X�Y�Z�', buiten.fout || JSON.stringify(buiten.uit?.[0]?.ics));

    // ---- en het gewone werk blijft hetzelfde
    const gewoon = '<D:multistatus xmlns:D="DAV:"><D:response><D:href/><D:href>/een/</D:href><D:propstat><D:prop><D:displayname><![CDATA[Werk &amp; privé]]></D:displayname>'
      + '<D:getetag>&quot;e1&quot;</D:getetag></D:prop></D:propstat></D:response><ns0:response xmlns:ns0="DAV:"><ns0:href >/twee/</ns0:href></ns0:response></D:multistatus>';
    const waarden = model.caldavWaarden(gewoon, 'href');
    check('integraties-02: caldavWaarden vindt nog steeds elk element ongeacht de prefix, en een leeg element geeft «»',
      waarden.length === 3 && waarden[0] === '' && waarden[1] === '/een/' && waarden[2] === '/twee/' && model.caldavEersteHref(gewoon) === '/een/', JSON.stringify(waarden));
    check('integraties-02: caldavResponses geeft per resource de href en de inhoud', model.caldavResponses(gewoon).map((r) => r.href).join('|') === '/een/|/twee/');
    check('integraties-02: de grens van 500 waarden telt nu ook lege elementen mee', model.caldavWaarden('<href/>'.repeat(900) + '<href>x</href>'.repeat(900), 'href').length === 500);
    check('integraties-02: een tag zonder sluit-tag beëindigt het ontleden; wat ervoor stond blijft bruikbaar',
      model.caldavWaarden('<a:href>/goed/</a:href><b:href>/zonder-einde<c:href>/later/</c:href>', 'href').join('|') === '/goed/');
    check('integraties-02: de ontdekking krijgt een eigen, kleinere grens dan het ophalen',
      Number(model.CALDAV_MAX_PROPFIND_BYTES) > 0 && Number(model.CALDAV_MAX_PROPFIND_BYTES) <= 1024 * 1024 && Number(model.CALDAV_MAX_PROPFIND_BYTES) < model.CALDAV_MAX_BYTES,
      String(model.CALDAV_MAX_PROPFIND_BYTES));
  }

  // ====================================================================================== integraties-02: de ontdekking
  {
    const antwoord = (xml: string) => new Response(xml, { status: 207 });
    const gezien: Array<{ methode: string; url: string; maxBytes: unknown }> = [];
    const metLichamen = async (stap1: string, stap2: string, stap3: string) => {
      let stap = 0;
      caldav.zetCaldavVerzoekerVoorTest(async (v) => {
        gezien.push({ methode: v.methode, url: v.url, maxBytes: (v as unknown as { maxBytes?: number }).maxBytes });
        stap += 1;
        return antwoord(stap === 1 ? stap1 : stap === 2 ? stap2 : stap3);
      });
      const t = performance.now();
      const uit = await caldav.caldavOntdekken('https://dav.example.invalid/dav/', 'piet@example.invalid', 'verzonnen-app-wachtwoord');
      return { ms: performance.now() - t, uit };
    };
    try {
      const kwaad1 = await metLichamen('<href '.repeat(Math.floor(n / 6)), '', '');
      check(`integraties-02: caldavOntdekken, stap 1 met ${KB} KB «<href <href …» is binnen de grens klaar`, kwaad1.ms < GRENS_MS, `${kwaad1.ms.toFixed(0)} ms`);
      const kwaad2 = await metLichamen('<current-user-principal '.repeat(Math.floor(n / 24)), '', '');
      check('integraties-02: caldavOntdekken, stap 1 met «<current-user-principal …» zonder einde is binnen de grens klaar', kwaad2.ms < GRENS_MS, `${kwaad2.ms.toFixed(0)} ms`);
      const kwaad3 = await metLichamen('<d:href>/p/</d:href>', '<calendar-home-set '.repeat(Math.floor(n / 19)), '<d:response>'.repeat(Math.floor(n / 12)));
      check('integraties-02: caldavOntdekken, stap 2 en 3 met onafgesloten tags zijn binnen de grens klaar en geven eerlijk «geen agenda’s»',
        kwaad3.ms < GRENS_MS && kwaad3.uit.ok === false && kwaad3.uit.fout === 'CALDAV_GEEN_AGENDAS', `${kwaad3.ms.toFixed(0)} ms ${JSON.stringify(kwaad3.uit).slice(0, 120)}`);

      // De gewone weg (vorm van iCloud): de eerste href is de resource zelf («/», soms leeg), de principal staat IN current-user-principal.
      gezien.length = 0;
      const goed = await metLichamen(
        '<d:multistatus xmlns:d="DAV:"><d:response><d:href/><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response></d:multistatus>',
        '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/principal/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/123/calendars/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>',
        '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/calendars/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>'
        + '<d:response><d:href>/123/calendars/thuis/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Thuis</d:displayname></d:prop></d:propstat></d:response></d:multistatus>');
      check('integraties-02: de gewone ontdekking werkt als voorheen (principal → home-set → agenda’s), zonder de drie patronen',
        goed.uit.ok === true && goed.uit.principal === 'https://dav.example.invalid/123/principal/' && goed.uit.home === 'https://dav.example.invalid/123/calendars/'
        && goed.uit.agendas.length === 1 && goed.uit.agendas[0].url === 'https://dav.example.invalid/123/calendars/thuis/' && goed.uit.agendas[0].naam === 'Thuis'
        && gezien.map((g) => g.url).join('|') === 'https://dav.example.invalid/dav/|https://dav.example.invalid/123/principal/|https://dav.example.invalid/123/calendars/',
        JSON.stringify(goed.uit).slice(0, 300));
      const zonderPrincipal = await metLichamen('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href></d:response></d:multistatus>', '', '');
      check('integraties-02: zonder current-user-principal valt de ontdekking terug op de eerste href (zoals voorheen)',
        zonderPrincipal.uit.ok === false && gezien.at(-2)?.url === 'https://dav.example.invalid/dav/', JSON.stringify(gezien.slice(-3)));
      const grensVoor = (caldav as unknown as { caldavGrensVoor?: (m: string) => number }).caldavGrensVoor;
      check('integraties-02: PROPFIND leest hoogstens CALDAV_MAX_PROPFIND_BYTES, REPORT hoogstens CALDAV_MAX_BYTES',
        typeof grensVoor === 'function' && grensVoor('PROPFIND') === model.CALDAV_MAX_PROPFIND_BYTES && grensVoor('REPORT') === model.CALDAV_MAX_BYTES);
    } catch (e) { check('integraties-02: onverwachte fout in de ontdekking', false, String((e as Error)?.stack || e)); }
    finally { caldav.zetCaldavVerzoekerVoorTest(null); }
  }

  // ====================================================================================== http-rand-02 / integraties-03
  // Een «vreemde» server op 127.0.0.1 die elke gewenste statusregel teruggeeft; https.request wordt alléén hier naar die
  // server omgelegd (de adrescontrole van pinnedFetch zou loopback terecht weigeren).
  const vreemd = net.createServer((sok) => {
    sok.once('data', (d) => {
      const status = /(?:[?&]s=|\/status-)(\d+)/.exec(String(d))?.[1] || '200';
      const leeg = status === '204' || status === '304';
      sok.end(`HTTP/1.1 ${status} X\r\nContent-Type: text/calendar\r\nETag: "e-${status}"\r\n${leeg ? '' : 'Content-Length: 15\r\n'}Connection: close\r\n\r\n${leeg ? '' : 'BEGIN:VCALENDAR'}`);
    });
    sok.on('error', () => undefined);
  });
  await new Promise<void>((r) => vreemd.listen(0, '127.0.0.1', () => r()));
  const poort = (vreemd.address() as net.AddressInfo).port;
  const httpsVrij = https as unknown as { request: unknown };
  const echteRequest = httpsVrij.request;
  const naarLokaal = (doel: URL, opties: http.RequestOptions, cb: (res: http.IncomingMessage) => void) =>
    http.request({ host: '127.0.0.1', port: poort, path: `${doel.pathname}${doel.search}`, method: opties.method, headers: opties.headers, timeout: opties.timeout }, cb);
  /** Een nagemaakt antwoord, voor wat de http-ontleder van Node zelf nooit zou doorlaten (bv. een ongeldige kopnaam). */
  const nepAntwoord = (statusCode: number, headers: Record<string, unknown>) => (_doel: URL, _opties: unknown, cb: (res: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & Record<string, unknown>;
    req.write = () => true;
    req.destroy = (e?: Error) => { if (e) req.emit('error', e); req.emit('close'); };
    req.end = () => setImmediate(() => {
      const res = new EventEmitter() as EventEmitter & Record<string, unknown>;
      // Zoals een echt antwoord: bytes, tenzij de lezer om tekst vroeg (pinnedStream doet setEncoding('utf8')).
      let alsTekst = false;
      res.statusCode = statusCode; res.headers = headers; res.destroy = () => undefined; res.setEncoding = () => { alsTekst = true; };
      cb(res);
      setImmediate(() => { res.emit('data', alsTekst ? 'x' : Buffer.from('x')); res.emit('end'); req.emit('close'); });
    });
    return req;
  };
  /** Voert `fn` uit en meldt of er intussen een fout BUITEN elke belofte viel (in productie: het proces stopt). */
  const bewaakt = async <T>(fn: () => Promise<T>): Promise<{ uitslag: T | { hangt: true }; ongevangen: string }> => {
    let ongevangen = '';
    const vang = (e: Error) => { ongevangen = `${e?.name}: ${e?.message}`; };
    process.on('uncaughtException', vang);
    try {
      const uitslag = await Promise.race([fn(), new Promise<{ hangt: true }>((r) => setTimeout(() => r({ hangt: true }), 2500))]);
      await new Promise((r) => setTimeout(r, 30));
      return { uitslag, ongevangen };
    } finally { process.off('uncaughtException', vang); }
  };
  const haal = (pad: string) => pinnedFetch(`https://vreemd.example.invalid${pad}`, {}, 2000).then(
    async (r) => ({ status: r.status, tekst: await r.text(), etag: r.headers.get('etag') || '' }), (e: Error) => ({ fout: e.message }));
  try {
    httpsVrij.request = naarLokaal;
    for (const status of [999, 600, 101]) {
      const proef = await bewaakt(() => haal(`/a.ics?s=${status}`));
      check(`http-rand-02: status ${status} van een vreemde server is een nette afwijzing (REMOTE_STATUS_INVALID), geen fout buiten de belofte`,
        proef.ongevangen === '' && (proef.uitslag as { fout?: string }).fout === 'REMOTE_STATUS_INVALID', `ongevangen=«${proef.ongevangen}» uitslag=${JSON.stringify(proef.uitslag)}`);
    }
    const ok200 = await bewaakt(() => haal('/a.ics?s=200')), ok404 = await bewaakt(() => haal('/a.ics?s=404')), ok304 = await bewaakt(() => haal('/a.ics?s=304')), ok599 = await bewaakt(() => haal('/a.ics?s=599'));
    check('http-rand-02: geldige statussen komen ongewijzigd door (200 met lichaam en koppen, 404, 304 zonder lichaam, 599)',
      (ok200.uitslag as { status?: number; tekst?: string; etag?: string }).status === 200 && (ok200.uitslag as { tekst?: string }).tekst === 'BEGIN:VCALENDAR' && (ok200.uitslag as { etag?: string }).etag === '"e-200"'
      && (ok404.uitslag as { status?: number }).status === 404 && (ok304.uitslag as { status?: number; tekst?: string }).status === 304 && (ok304.uitslag as { tekst?: string }).tekst === ''
      && (ok599.uitslag as { status?: number }).status === 599 && !ok200.ongevangen && !ok404.ongevangen && !ok304.ongevangen && !ok599.ongevangen,
      JSON.stringify([ok200, ok404, ok304, ok599]).slice(0, 400));

    // De stromende variant (MCP over SSE) krijgt dezelfde regel.
    const stroom = (pad: string) => pinnedStream(`https://vreemd.example.invalid${pad}`, { stilteMs: 1500, maxTotaalMs: 2000 }).then((r) => ({ status: r.status, bytes: r.bytes }), (e: Error) => ({ fout: e.message }));
    const stroom999 = await bewaakt(() => stroom('/sse?s=999')), stroom200 = await bewaakt(() => stroom('/sse?s=200'));
    check('http-rand-02: pinnedStream weigert een status buiten 200–599 op dezelfde manier en laat 200 door',
      (stroom999.uitslag as { fout?: string }).fout === 'REMOTE_STATUS_INVALID' && (stroom200.uitslag as { status?: number; bytes?: number }).status === 200
      && (stroom200.uitslag as { bytes?: number }).bytes === 15 && !stroom999.ongevangen && !stroom200.ongevangen, JSON.stringify([stroom999, stroom200]));

    // Een kop die Headers weigert (ongeldige naam): overslaan, niet omvallen.
    httpsVrij.request = nepAntwoord(200, { 'content-type': 'text/plain', 'slechte kop': 'x', 'x-goed': ['a', 'b'] });
    const slechteKop = await bewaakt(() => pinnedFetch('https://vreemd.example.invalid/x', {}, 2000).then((r) => ({ status: r.status, goed: r.headers.get('x-goed'), soort: r.headers.get('content-type') }), (e: Error) => ({ fout: e.message })));
    check('http-rand-02: een ongeldige kop van de vreemde server wordt overgeslagen; de rest van het antwoord blijft bruikbaar',
      slechteKop.ongevangen === '' && (slechteKop.uitslag as { status?: number }).status === 200 && (slechteKop.uitslag as { goed?: string }).goed === 'a, b'
      && (slechteKop.uitslag as { soort?: string }).soort === 'text/plain', `ongevangen=«${slechteKop.ongevangen}» ${JSON.stringify(slechteKop.uitslag)}`);
    const slechteKopStroom = await bewaakt(() => pinnedStream('https://vreemd.example.invalid/x', { stilteMs: 1500, maxTotaalMs: 2000 }).then((r) => ({ status: r.status, goed: r.headers.get('x-goed') }), (e: Error) => ({ fout: e.message })));
    check('http-rand-02: pinnedStream slaat een ongeldige kop ook over',
      slechteKopStroom.ongevangen === '' && (slechteKopStroom.uitslag as { status?: number }).status === 200 && (slechteKopStroom.uitslag as { goed?: string }).goed === 'a, b',
      `ongevangen=«${slechteKopStroom.ongevangen}» ${JSON.stringify(slechteKopStroom.uitslag)}`);
    httpsVrij.request = nepAntwoord(200, {});
    const startGooit = await bewaakt(() => pinnedStream('https://vreemd.example.invalid/x', { stilteMs: 1500, maxTotaalMs: 2000, onStart: () => { throw new Error('AANROEPER_STUK'); } })
      .then((r) => ({ status: r.status }), (e: Error) => ({ fout: e.message })));
    check('http-rand-02: een fout in de onStart-haak van de aanroeper valt niet meer buiten de belofte',
      startGooit.ongevangen === '' && !('hangt' in (startGooit.uitslag as object)), `ongevangen=«${startGooit.ongevangen}» ${JSON.stringify(startGooit.uitslag)}`);

    // ---- integraties-03: de aanroepers geven een STABIELE code, en het abonnement blijft gewoon bestaan.
    httpsVrij.request = naarLokaal;
    const ontdek = await bewaakt(() => caldav.caldavOntdekken('https://vreemd.example.invalid/status-999/dav/', 'piet@example.invalid', 'verzonnen-app-wachtwoord'));
    check('integraties-03: de CalDAV-ontdekking zet een ongeldige status om in CALDAV_AANBIEDER_FOUT, niet in een val van het proces',
      ontdek.ongevangen === '' && (ontdek.uitslag as { ok?: boolean; fout?: string }).ok === false && (ontdek.uitslag as { fout?: string }).fout === 'CALDAV_AANBIEDER_FOUT',
      `ongevangen=«${ontdek.ongevangen}» ${JSON.stringify(ontdek.uitslag)}`);
    const eigenaar = `sec002-g08-ics-${randomUUID()}`; opruimEigenaars.push(eigenaar);
    for (const status of [999, 101]) {
      const id = randomUUID();
      await sys().query(`INSERT INTO app.agenda_abonnement (user_id, id, bron, naam, adres, interval_minuten, actief, laatste_staat) VALUES ($1,$2,'ics','Proef',$3,60,true,'nieuw')`,
        [eigenaar, id, `https://vreemd.example.invalid/rooster-${status}.ics?s=${status}`]);
      const proef = await bewaakt(() => ics.icsOphalen(eigenaar, id));
      const rij = (await sys().query('SELECT laatste_staat, fout, poging FROM app.agenda_abonnement WHERE user_id = $1 AND id = $2', [eigenaar, id])).rows[0];
      check(`integraties-03: een ICS-abonnement op een server die ${status} antwoordt → ICS_AANBIEDER_FOUT in de rij, geen val van het proces`,
        proef.ongevangen === '' && (proef.uitslag as { staat?: string; fout?: string }).staat === 'fout' && (proef.uitslag as { fout?: string }).fout === 'ICS_AANBIEDER_FOUT'
        && rij?.laatste_staat === 'fout' && rij?.fout === 'ICS_AANBIEDER_FOUT', `ongevangen=«${proef.ongevangen}» ${JSON.stringify(proef.uitslag)} rij=${JSON.stringify(rij)}`);
    }
    // CalDAV met een opgeslagen account: het REPORT op de agenda krijgt 999.
    const davEigenaar = `sec002-g08-dav-${randomUUID()}`, davId = randomUUID(), davAdres = 'https://vreemd.example.invalid/dav/'; opruimEigenaars.push(davEigenaar);
    await sys().query(
      `INSERT INTO app.agenda_abonnement (user_id, id, bron, naam, adres, gebruikersnaam, geheim, interval_minuten, actief, agendas, laatste_staat)
       VALUES ($1,$2,'caldav','Proef',$3,'piet@example.invalid',$4,60,true,$5::jsonb,'nieuw')`,
      [davEigenaar, davId, davAdres, sealWithEnvKey(caldav.CALDAV_SLEUTEL_NAAM, 'verzonnen-app-wachtwoord', `agenda-caldav|${davEigenaar}|${davAdres}`),
        JSON.stringify([{ url: 'https://vreemd.example.invalid/status-999/dav/werk/', naam: 'Werk', ctag: '', syncToken: '', kleur: '', gebeurtenissen: true }])]);
    const davProef = await bewaakt(() => caldav.caldavOphalen(davEigenaar, davId));
    check('integraties-03: een CalDAV-agenda op een server die 999 antwoordt → CALDAV_AANBIEDER_FOUT, geen val van het proces',
      davProef.ongevangen === '' && (davProef.uitslag as { staat?: string; fout?: string }).staat === 'fout' && (davProef.uitslag as { fout?: string }).fout === 'CALDAV_AANBIEDER_FOUT',
      `ongevangen=«${davProef.ongevangen}» ${JSON.stringify(davProef.uitslag)}`);

    // ---- Nacontrole g08-3: een ongeldige status (een teken van een opzettelijke aanval op het proces) laat een spoor na.
    const icsSpoor = await auditVan(eigenaar, 'agenda.extern.status_ongeldig');
    const davSpoor = await auditVan(davEigenaar, 'agenda.extern.status_ongeldig');
    const koppelEigenaar = `sec002-g08-koppel-${randomUUID()}`; opruimEigenaars.push(koppelEigenaar);
    const koppel999 = await bewaakt(() => caldav.caldavKoppelen(koppelEigenaar, { adres: 'https://vreemd.example.invalid/status-999/dav/', gebruikersnaam: 'piet@example.invalid', wachtwoord: 'verzonnen-app-wachtwoord' }));
    const koppelSpoor = await auditVan(koppelEigenaar, 'agenda.extern.status_ongeldig');
    const alleSporen = [...icsSpoor, ...davSpoor, ...koppelSpoor];
    check('g08-3: een status buiten 200–599 laat per keer één auditregel na (ICS 999 en 101, CalDAV-ophalen, CalDAV-koppelen)',
      icsSpoor.length === 2 && davSpoor.length === 1 && koppelSpoor.length === 1 && (koppel999.uitslag as { fout?: string }).fout === 'CALDAV_AANBIEDER_FOUT'
      && alleSporen.every((r) => r.result === 'geweigerd'), `ics=${icsSpoor.length} dav=${davSpoor.length} koppel=${koppelSpoor.length} ${JSON.stringify(koppel999.uitslag)}`);
    check('g08-3: die auditregel noemt alleen de HOST — geen pad, geen zoekreeks, geen gebruikersnaam of wachtwoord',
      alleSporen.length === 4 && alleSporen.every((r) => r.details.host === 'vreemd.example.invalid' && !/status-|rooster|\?s=|piet|verzonnen/.test(JSON.stringify(r.details))),
      JSON.stringify(alleSporen.map((r) => r.details)));
  } catch (e) { check('http-rand-02 / integraties-03: onverwachte fout', false, String((e as Error)?.stack || e)); }
  finally { httpsVrij.request = echteRequest; await new Promise<void>((r) => vreemd.close(() => r())); }

  // ====================================================================================== integraties-07: grenzen en pakketten
  try {
    const perAgenda = Number(model.CALDAV_MAX_GEBEURTENISSEN_PER_AGENDA) || 0, perAccount = Number(model.CALDAV_MAX_GEBEURTENISSEN_PER_ACCOUNT) || 0;
    const spiegelMax = Number((spiegel as unknown as { EXTERNE_SPIEGEL_MAX_RIJEN?: number }).EXTERNE_SPIEGEL_MAX_RIJEN) || 0;
    check('integraties-07: er BESTAAN grenzen per agenda, per account en per vervanging van de spiegel',
      perAgenda > 0 && perAgenda <= 2000 && perAccount >= perAgenda && perAccount <= 10000 && spiegelMax > 0 && spiegelMax <= 2000, `${perAgenda}/${perAccount}/${spiegelMax}`);

    // ---- de spiegel zelf: begrensd, in pakketten, en dubbele UID's doen wat ze altijd deden (de laatste wint)
    const eigenaar = `sec002-g08-spiegel-${randomUUID()}`, abonnement = randomUUID(); opruimEigenaars.push(eigenaar);
    const rij = (i: number, extra: Record<string, unknown> = {}) => ({
      abonnementId: abonnement, agendaUrl: '', uid: `u-${i}@example.invalid`, titel: `Afspraak ${i}`, locatie: '', beschrijving: '', begin: '2026-12-01T09:00:00Z', einde: '2026-12-01T10:00:00Z',
      heleDag: false, tijdzone: 'UTC', rrule: '', status: 'confirmed', reeks: 0, gewijzigdOp: '', url: '', ...extra,
    });
    const aantalIn = async (agendaUrl = '') => Number((await sys().query('SELECT count(*)::int AS n FROM app.agenda_externe_gebeurtenis WHERE user_id = $1 AND abonnement_id = $2 AND agenda_url = $3', [eigenaar, abonnement, agendaUrl])).rows[0].n);
    await spiegel.externeSpiegelVervang(eigenaar, abonnement, '', Array.from({ length: 2600 }, (_, i) => rij(i)));
    const naVeel = await aantalIn();
    check('integraties-07: externeSpiegelVervang bewaart nooit meer dan de grens, hoeveel rijen een aanroeper ook aanlevert', naVeel > 0 && naVeel <= 2000, String(naVeel));
    const gemengd = [
      rij(1, { titel: 'Eerste versie' }), rij(2, { titel: `Half teken ${'\uD83D'}`, url: 'http://niet-https.example.invalid/' }), rij(1, { titel: 'Laatste versie', heleDag: true, reeks: 7 }),
      rij(3, { uid: '' }), rij(4, { begin: '' }), rij(5, { uid: '   ' }), rij(6, { url: 'https://example.invalid/afspraak', locatie: 'Zaal "A" {1}\\', beschrijving: 'regel 1\nregel 2, met komma' }),
    ];
    const klein = await spiegel.externeSpiegelVervang(eigenaar, abonnement, '', gemengd).then(() => '', (e: Error) => e.message);
    const rijen = (await sys().query('SELECT uid, titel, hele_dag, reeks, url, locatie, beschrijving, ruimte FROM app.agenda_externe_gebeurtenis WHERE user_id = $1 AND abonnement_id = $2 ORDER BY uid', [eigenaar, abonnement])).rows;
    check('integraties-07: vervangen wist eerst de oude rijen; een dubbele UID overschrijft (de laatste wint); rijen zonder uid of begin vallen weg',
      klein === '' && rijen.length === 3 && rijen[0].uid === 'u-1@example.invalid' && rijen[0].titel === 'Laatste versie' && rijen[0].hele_dag === true && rijen[0].reeks === 7,
      `${klein} ${JSON.stringify(rijen).slice(0, 300)}`);
    check('integraties-07: pakketten dragen elke waarde ongeschonden over (aanhalingstekens, accolades, regeleinde, een half teken) en een niet-https-link wordt leeg',
      rijen[1]?.uid === 'u-2@example.invalid' && rijen[1]?.url === '' && String(rijen[1]?.titel).startsWith('Half teken')
      && rijen[2]?.locatie === 'Zaal "A" {1}\\' && rijen[2]?.beschrijving === 'regel 1\nregel 2, met komma' && rijen[2]?.url === 'https://example.invalid/afspraak' && rijen[2]?.ruimte === 'prive',
      JSON.stringify(rijen.slice(1)).slice(0, 300));
    const kapot = await spiegel.externeSpiegelVervang(eigenaar, abonnement, '', [rij(1), rij(2, { begin: 'te kort' })]).then(() => '', (e: Error) => e.message);
    check('integraties-07: één rij die de database weigert, draait de HELE vervanging terug (de vorige spiegel blijft staan)', kapot !== '' && (await aantalIn()) === 3, kapot.slice(0, 80));

    // ---- CalDAV: 6 agenda's × 3 bronnen × 800 afspraken = 14 400 aangeboden; er mogen er hoogstens 2000 per agenda en 10 000 per account in.
    const davEigenaar = `sec002-g08-grens-${randomUUID()}`, davId = randomUUID(), davAdres = 'https://dav.example.invalid/dav/'; opruimEigenaars.push(davEigenaar);
    const agendas = Array.from({ length: 6 }, (_, i) => ({ url: `https://dav.example.invalid/dav/agenda-${i}/`, naam: `Agenda ${i}`, ctag: '', syncToken: '', kleur: '', gebeurtenissen: true }));
    await sys().query(
      `INSERT INTO app.agenda_abonnement (user_id, id, bron, naam, adres, gebruikersnaam, geheim, interval_minuten, actief, agendas, laatste_staat)
       VALUES ($1,$2,'caldav','Groot',$3,'piet@example.invalid',$4,60,true,$5::jsonb,'nieuw')`,
      [davEigenaar, davId, davAdres, sealWithEnvKey(caldav.CALDAV_SLEUTEL_NAAM, 'verzonnen-app-wachtwoord', `agenda-caldav|${davEigenaar}|${davAdres}`), JSON.stringify(agendas)]);
    // Een spookrij van een agenda die niet meer in de lijst staat: na een volledige ronde hoort die weg te zijn (anders groeit de spiegel onbegrensd).
    await sys().query(
      `INSERT INTO app.agenda_externe_gebeurtenis (user_id, abonnement_id, agenda_url, uid, begin_waarde) VALUES ($1,$2,'https://dav.example.invalid/dav/verdwenen/','spook@example.invalid','2026-12-01T09:00:00Z')`,
      [davEigenaar, davId]);
    const stempel = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const basis = Date.now() + 2 * 86400000;
    let reports = 0;
    const report = (agenda: number) => {
      let xml = '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">';
      for (let bron = 0; bron < 3; bron += 1) {
        const regels = ['BEGIN:VCALENDAR', 'VERSION:2.0'];
        for (let i = 0; i < 800; i += 1) regels.push('BEGIN:VEVENT', `UID:a${agenda}-b${bron}-${i}@example.invalid`, `DTSTART:${stempel(new Date(basis + i * 60000))}`, 'SUMMARY:x', 'END:VEVENT');
        regels.push('END:VCALENDAR');
        xml += `<d:response><d:href>/dav/agenda-${agenda}/bron-${bron}.ics</d:href><d:propstat><d:prop><d:getetag>"e"</d:getetag><c:calendar-data>${regels.join('&#13;\n')}</c:calendar-data></d:prop></d:propstat></d:response>`;
      }
      return `${xml}</d:multistatus>`;
    };
    caldav.zetCaldavVerzoekerVoorTest(async (v) => {
      if (v.methode !== 'REPORT') return new Response('', { status: 404 });
      reports += 1;
      return new Response(report(Number(/agenda-(\d+)/.exec(v.url)?.[1] || 0)), { status: 207 });
    });
    const groot = await caldav.caldavOphalen(davEigenaar, davId) as { staat: string; aantal: number; fout: string; afgekapt?: boolean };
    const perUrl = (await sys().query('SELECT agenda_url, count(*)::int AS n FROM app.agenda_externe_gebeurtenis WHERE user_id = $1 AND abonnement_id = $2 GROUP BY agenda_url ORDER BY agenda_url', [davEigenaar, davId])).rows as Array<{ agenda_url: string; n: number }>;
    const totaal = perUrl.reduce((som, r) => som + r.n, 0);
    const grootRij = (await sys().query('SELECT laatste_staat, fout, aantal FROM app.agenda_abonnement WHERE user_id = $1 AND id = $2', [davEigenaar, davId])).rows[0];
    check('integraties-07: hoogstens 2000 afspraken per agenda en 10 000 per account in de spiegel, hoeveel de server ook stuurt',
      perUrl.length > 0 && perUrl.every((r) => r.n <= 2000) && totaal <= 10000 && totaal >= 2000, `totaal=${totaal} ${JSON.stringify(perUrl.map((r) => r.n))}`);
    check('integraties-07: het afkappen is eerlijk gemeld: de ronde is «klaar», met afgekapt = true en CALDAV_AFGEKAPT in de rij',
      groot.staat === 'klaar' && groot.afgekapt === true && groot.aantal === totaal && grootRij?.laatste_staat === 'klaar' && grootRij?.fout === 'CALDAV_AFGEKAPT' && Number(grootRij?.aantal) === totaal,
      `${JSON.stringify(groot)} rij=${JSON.stringify(grootRij)}`);
    check('integraties-07: zodra de grens van het account bereikt is, vraagt de ronde de volgende agenda’s niet eens meer op', reports <= 5, `REPORT-verzoeken: ${reports}`);
    check('integraties-07: rijen van een agenda die niet (meer) in deze ronde zat, blijven niet als spook in de spiegel staan',
      !perUrl.some((r) => r.agenda_url === 'https://dav.example.invalid/dav/verdwenen/'), JSON.stringify(perUrl.map((r) => r.agenda_url)));
    // Nacontrole g08-3: het afkappen is een daad van het systeem (de mens verliest afspraken) en hoort in de audit én in het
    // meldingencentrum — maar ÉÉN keer bij de overgang, niet bij elke ronde van de planner (elke 15 minuten).
    const tweedeGroot = await caldav.caldavOphalen(davEigenaar, davId);
    const afkapSpoor = await auditVan(davEigenaar, 'agenda.caldav.afgekapt');
    const afkapMeldingen = meldingenVan(davEigenaar);
    check('g08-3: afkappen laat precies één auditregel en één melding na, ook na een tweede afgekapte ronde',
      tweedeGroot.afgekapt === true && afkapSpoor.length === 1 && afkapSpoor[0].result === 'afgekapt' && Number(afkapSpoor[0].details.aantal) === 10000 && afkapMeldingen.length === 1,
      `audit=${afkapSpoor.length} meldingen=${afkapMeldingen.length} ${JSON.stringify(afkapSpoor[0]?.details)}`);
    check('g08-3: die melding is tweetalig, zegt wat er gebeurde en wat de mens kan doen, en linkt naar /agenda',
      afkapMeldingen.length === 1 && tweetalig(`${afkapMeldingen[0].title} ${afkapMeldingen[0].message}`) && /\b2\s?000\b/.test(afkapMeldingen[0].message)
      && /10\s?000/.test(afkapMeldingen[0].message) && afkapMeldingen[0].link === '/agenda', JSON.stringify(afkapMeldingen[0]));
    // Een gewone, kleine ronde meldt niets en laat geen CALDAV_AFGEKAPT achter.
    caldav.zetCaldavVerzoekerVoorTest(async (v) => new Response(v.methode === 'REPORT'
      ? `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/x.ics</d:href><d:propstat><d:prop><c:calendar-data>BEGIN:VCALENDAR&#13;\nBEGIN:VEVENT&#13;\nUID:een@example.invalid&#13;\nDTSTART:${stempel(new Date(basis))}&#13;\nSUMMARY:Eén&#13;\nEND:VEVENT&#13;\nEND:VCALENDAR</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`
      : '', { status: v.methode === 'REPORT' ? 207 : 404 }));
    const kleinDav = await caldav.caldavOphalen(davEigenaar, davId) as { staat: string; aantal: number; fout: string; afgekapt?: boolean };
    const kleinRij = (await sys().query('SELECT laatste_staat, fout, aantal FROM app.agenda_abonnement WHERE user_id = $1 AND id = $2', [davEigenaar, davId])).rows[0];
    check('integraties-07: een gewone ronde (6 agenda’s, elk één afspraak) blijft werken en wist de melding van het afkappen',
      kleinDav.staat === 'klaar' && kleinDav.aantal === 6 && !kleinDav.afgekapt && kleinDav.fout === '' && kleinRij?.fout === '' && Number(kleinRij?.aantal) === 6, `${JSON.stringify(kleinDav)} rij=${JSON.stringify(kleinRij)}`);
  } catch (e) { check('integraties-07: onverwachte fout', false, String((e as Error)?.stack || e)); }
  finally { caldav.zetCaldavVerzoekerVoorTest(null); }

  // ====================================================================================== integraties-07, opmerking g08-1
  // De grens per account moet ook gelden als de RONDE MISLUKT: of er een fout komt, beslist de vreemde server. Zonder dit
  // gaf de server bij elk opnieuw koppelen andere agenda-adressen, brak hij het laatste REPORT af, en bleef alles staan.
  try {
    const grens = Number(model.CALDAV_MAX_GEBEURTENISSEN_PER_ACCOUNT) || 10000;
    const stempel = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const basis = Date.now() + 2 * 86400000;
    const report = (naam: string, aantal: number) => {
      const regels = ['BEGIN:VCALENDAR', 'VERSION:2.0'];
      for (let i = 0; i < aantal; i += 1) regels.push('BEGIN:VEVENT', `UID:${naam}-${i}@example.invalid`, `DTSTART:${stempel(new Date(basis + i * 60000))}`, 'SUMMARY:x', 'END:VEVENT');
      regels.push('END:VCALENDAR');
      return new Response(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/dav/${naam}/a.ics</d:href><d:propstat><d:prop><c:calendar-data>${regels.join('&#13;\n')}</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`, { status: 207 });
    };
    const tel = async (eigenaar: string) => (await sys().query('SELECT count(*)::int AS n, count(DISTINCT agenda_url)::int AS urls FROM app.agenda_externe_gebeurtenis WHERE user_id = $1', [eigenaar])).rows[0] as { n: number; urls: number };

    // ---- 1. Elke keer koppelen geeft ANDERE agenda-adressen; het laatste REPORT van de ronde antwoordt 500.
    const eigenaar1 = `sec002-g08-ophoping-${randomUUID()}`, adres = 'https://dav.example.invalid/dav/'; opruimEigenaars.push(eigenaar1);
    let kring = 0;
    caldav.zetCaldavVerzoekerVoorTest(async (v) => {
      const ms = (xml: string) => new Response(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${xml}</d:multistatus>`, { status: 207 });
      if (v.methode === 'PROPFIND') {
        if (v.url === adres) return ms('<d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/dav/p/</d:href></d:current-user-principal></d:prop></d:propstat></d:response>');
        if (v.url.endsWith('/dav/p/')) return ms('<d:response><d:href>/dav/p/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/dav/h/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response>');
        return ms(Array.from({ length: 5 }, (_, i) => `<d:response><d:href>/dav/h/k${kring}-a${i}/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>K${kring}A${i}</d:displayname></d:prop></d:propstat></d:response>`).join(''));
      }
      const m = /k(\d+)-a(\d+)/.exec(v.url);
      if (m && Number(m[2]) === 4) return new Response('', { status: 500 });
      return report(m ? m[0] : 'x', 2000);
    });
    const standen: number[] = [];
    let accountId = '', laatsteFout = '';
    for (kring = 0; kring < 3; kring += 1) {
      const koppel = await caldav.caldavKoppelen(eigenaar1, { adres, gebruikersnaam: 'piet@example.invalid', wachtwoord: 'verzonnen-app-wachtwoord', naam: 'Proef' });
      if (!koppel.ok) { laatsteFout = koppel.fout; break; }
      accountId = koppel.account.id;
      laatsteFout = (await caldav.caldavOphalen(eigenaar1, accountId)).fout;
      standen.push((await tel(eigenaar1)).n);
    }
    const oudeAdressen = Number((await sys().query(`SELECT count(*)::int AS n FROM app.agenda_externe_gebeurtenis WHERE user_id = $1 AND agenda_url NOT LIKE '%/k2-a%'`, [eigenaar1])).rows[0].n);
    check('integraties-07 (g08-1): opnieuw koppelen met telkens andere agenda-adressen en een afgebroken laatste REPORT stapelt niets op — nooit meer dan de grens per account',
      standen.length === 3 && standen.every((n) => n > 0 && n <= grens) && laatsteFout === 'CALDAV_AANBIEDER_FOUT', `${standen.join(',')} fout=${laatsteFout}`);
    check('integraties-07 (g08-1): ook na een MISLUKTE ronde staan er geen rijen meer van agenda’s die niet in de huidige lijst van het account zitten', oudeAdressen === 0, String(oudeAdressen));

    // ---- 2. Dezelfde lijst, maar de fout schuift: wat achter de fout staat, is van een vorige ronde en telt mee voor de grens.
    const eigenaar2 = `sec002-g08-schuif-${randomUUID()}`, id2 = randomUUID(); opruimEigenaars.push(eigenaar2);
    const lijst2 = Array.from({ length: 12 }, (_, i) => ({ url: `https://dav.example.invalid/dav/s-${i}/`, naam: `S${i}`, ctag: '', syncToken: '', kleur: '', gebeurtenissen: true }));
    await sys().query(
      `INSERT INTO app.agenda_abonnement (user_id, id, bron, naam, adres, gebruikersnaam, geheim, interval_minuten, actief, agendas, laatste_staat)
       VALUES ($1,$2,'caldav','Schuif',$3,'piet@example.invalid',$4,60,true,$5::jsonb,'nieuw')`,
      [eigenaar2, id2, adres, sealWithEnvKey(caldav.CALDAV_SLEUTEL_NAAM, 'verzonnen-app-wachtwoord', `agenda-caldav|${eigenaar2}|${adres}`), JSON.stringify(lijst2)]);
    let plan: (i: number) => number | 'fout' = () => 0;
    caldav.zetCaldavVerzoekerVoorTest(async (v) => {
      const i = Number(/s-(\d+)/.exec(v.url)?.[1] ?? -1);
      const wat = plan(i);
      return wat === 'fout' ? new Response('', { status: 500 }) : report(`s${i}`, wat);
    });
    plan = (i) => (i >= 7 ? 2000 : 0);
    const rondeA = await caldav.caldavOphalen(eigenaar2, id2);
    const naA = (await tel(eigenaar2)).n;
    plan = (i) => (i < 4 ? 2000 : 'fout');
    const rondeB = await caldav.caldavOphalen(eigenaar2, id2);
    const naB = (await tel(eigenaar2)).n;
    check('integraties-07 (g08-1): een fout halverwege laat oude rijen van de nog niet gelezen agenda’s alleen staan zolang het account onder de grens blijft',
      rondeA.staat === 'klaar' && naA === grens && rondeB.staat === 'fout' && naB > 0 && naB <= grens, `A=${rondeA.staat}/${naA} B=${rondeB.staat}/${naB}`);

    // ---- 3. Het gewone geval mag er niet onder lijden: een voorbijgaande fout wist de spiegel van een klein account NIET.
    const eigenaar3 = `sec002-g08-gewoon-${randomUUID()}`, id3 = randomUUID(); opruimEigenaars.push(eigenaar3);
    await sys().query(
      `INSERT INTO app.agenda_abonnement (user_id, id, bron, naam, adres, gebruikersnaam, geheim, interval_minuten, actief, agendas, laatste_staat)
       VALUES ($1,$2,'caldav','Gewoon',$3,'piet@example.invalid',$4,60,true,$5::jsonb,'nieuw')`,
      [eigenaar3, id3, adres, sealWithEnvKey(caldav.CALDAV_SLEUTEL_NAAM, 'verzonnen-app-wachtwoord', `agenda-caldav|${eigenaar3}|${adres}`), JSON.stringify(lijst2.slice(0, 3))]);
    plan = () => 4;
    const gewoonA = await caldav.caldavOphalen(eigenaar3, id3);
    plan = (i) => (i === 0 ? 5 : 'fout');
    const gewoonB = await caldav.caldavOphalen(eigenaar3, id3);
    const gewoonNa = (await sys().query('SELECT agenda_url, count(*)::int AS n FROM app.agenda_externe_gebeurtenis WHERE user_id = $1 GROUP BY agenda_url ORDER BY agenda_url', [eigenaar3])).rows as Array<{ n: number }>;
    check('integraties-07 (g08-1): een voorbijgaande fout bij een gewoon account laat de spiegel van de niet-gelezen agenda’s staan (de cache blijft bruikbaar)',
      gewoonA.staat === 'klaar' && gewoonB.staat === 'fout' && gewoonNa.map((r) => r.n).join(',') === '5,4,4', `${gewoonA.staat}/${gewoonB.staat} ${JSON.stringify(gewoonNa)}`);
  } catch (e) { check('integraties-07 (g08-1): onverwachte fout', false, String((e as Error)?.stack || e)); }
  finally { caldav.zetCaldavVerzoekerVoorTest(null); }

  // ====================================================================================== integraties-07, opmerking g08-2
  // Twee GELIJKTIJDIGE rondes van hetzelfde account: elke ronde telde alleen haar eigen rijen. De vreemde server ziet de
  // volgorde van de verzoeken en houdt een antwoord vast: ronde B krijgt a0–a4 leeg en wacht op a5; intussen vult ronde A
  // a0–a4 tot de grens; daarna krijgt B a5–a9 vol. Resultaat vóór de fix: 20 000 rijen in één account.
  try {
    const grens = Number(model.CALDAV_MAX_GEBEURTENISSEN_PER_ACCOUNT) || 10000;
    const stempel = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const basis = Date.now() + 2 * 86400000;
    const report = (naam: string, aantal: number) => {
      const regels = ['BEGIN:VCALENDAR', 'VERSION:2.0'];
      for (let i = 0; i < aantal; i += 1) regels.push('BEGIN:VEVENT', `UID:${naam}-${i}@example.invalid`, `DTSTART:${stempel(new Date(basis + i * 60000))}`, 'SUMMARY:x', 'END:VEVENT');
      regels.push('END:VCALENDAR');
      return new Response(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/dav/${naam}/a.ics</d:href><d:propstat><d:prop><c:calendar-data>${regels.join('&#13;\n')}</c:calendar-data></d:prop></d:propstat></d:response></d:multistatus>`, { status: 207 });
    };
    const adres = 'https://dav.example.invalid/dav/';
    const nieuwAccount = async (eigenaar: string, id: string, aantalAgendas: number, extra: { staat?: string; minutenGeleden?: number } = {}) => {
      const lijst = Array.from({ length: aantalAgendas }, (_, i) => ({ url: `https://dav.example.invalid/dav/g-${i}/`, naam: `G${i}`, ctag: '', syncToken: '', kleur: '', gebeurtenissen: true }));
      await sys().query(
        `INSERT INTO app.agenda_abonnement (user_id, id, bron, naam, adres, gebruikersnaam, geheim, interval_minuten, actief, agendas, laatste_staat, laatst_op)
         VALUES ($1,$2,'caldav','Gelijktijdig',$3,'piet@example.invalid',$4,60,true,$5::jsonb,$6, CASE WHEN $7::int IS NULL THEN NULL ELSE now() - ($7::int || ' minutes')::interval END)`,
        [eigenaar, id, adres, sealWithEnvKey(caldav.CALDAV_SLEUTEL_NAAM, 'verzonnen-app-wachtwoord', `agenda-caldav|${eigenaar}|${adres}`), JSON.stringify(lijst),
          extra.staat ?? 'nieuw', extra.minutenGeleden ?? null]);
    };
    const telRijen = async (eigenaar: string) => Number((await sys().query('SELECT count(*)::int AS n FROM app.agenda_externe_gebeurtenis WHERE user_id = $1', [eigenaar])).rows[0].n);

    // ---- 1. De wedloop zoals de nacontrole hem beschreef.
    const eigenaar = `sec002-g08-wedloop-${randomUUID()}`, id = randomUUID(); opruimEigenaars.push(eigenaar);
    await nieuwAccount(eigenaar, id, 10);
    let fase: 'B' | 'A' = 'B';
    const verzoekenIn = { A: 0, B: 0 };
    let laatB!: () => void; const poortB = new Promise<void>((r) => { laatB = r; });
    let meldBWacht!: () => void; const bWacht = new Promise<void>((r) => { meldBWacht = r; });
    caldav.zetCaldavVerzoekerVoorTest(async (v) => {
      const i = Number(/g-(\d+)/.exec(v.url)?.[1] ?? -1);
      verzoekenIn[fase] += 1;
      if (fase === 'A') return report(`a${i}`, i < 5 ? 2000 : 0);
      if (i < 5) return report(`b${i}`, 0);
      if (i === 5) { meldBWacht(); await poortB; }
      return report(`b${i}`, 2000);
    });
    const rondeB = caldav.caldavOphalen(eigenaar, id);
    await Promise.race([bWacht, new Promise((r) => setTimeout(r, 5000))]);
    fase = 'A';
    const uitA = await caldav.caldavOphalen(eigenaar, id);
    const verzoekenA = verzoekenIn.A;
    fase = 'B'; laatB();
    const uitB = await rondeB;
    const naWedloop = await telRijen(eigenaar);
    check('integraties-07 (g08-2): twee gelijktijdige rondes van één account houden zich samen aan de grens per account',
      naWedloop > 0 && naWedloop <= grens, `rijen=${naWedloop} A=${JSON.stringify(uitA)} B=${JSON.stringify(uitB)}`);
    check('integraties-07 (g08-2): de tweede ronde stopt meteen met CALDAV_AL_BEZIG en stuurt GEEN enkel verzoek naar buiten; de eerste maakt haar werk af',
      uitA.staat === 'fout' && uitA.fout === 'CALDAV_AL_BEZIG' && verzoekenA === 0 && uitB.staat === 'klaar', `A=${JSON.stringify(uitA)} verzoeken A=${verzoekenA} B=${JSON.stringify(uitB)}`);
    const rijNa = (await sys().query('SELECT laatste_staat, fout FROM app.agenda_abonnement WHERE user_id = $1 AND id = $2', [eigenaar, id])).rows[0];
    check('integraties-07 (g08-2): na de wedloop staat het account weer vrij («klaar»): de geweigerde ronde schreef niets in de rij van de lopende ronde',
      rijNa?.laatste_staat === 'klaar' && rijNa?.fout === '', JSON.stringify(rijNa));

    // ---- 2. Een ronde die vastzit, mag niets blokkeren: «bezig» van een gecrashte ronde verloopt.
    caldav.zetCaldavVerzoekerVoorTest(async (v) => report(`v${/g-(\d+)/.exec(v.url)?.[1] ?? 'x'}`, 1));
    const vers = `sec002-g08-bezig-${randomUUID()}`, versId = randomUUID(), oud = `sec002-g08-vast-${randomUUID()}`, oudId = randomUUID(); opruimEigenaars.push(vers, oud);
    await nieuwAccount(vers, versId, 2, { staat: 'bezig', minutenGeleden: 1 });
    await nieuwAccount(oud, oudId, 2, { staat: 'bezig', minutenGeleden: 16 });
    const uitVers = await caldav.caldavOphalen(vers, versId), uitOud = await caldav.caldavOphalen(oud, oudId);
    const versRij = (await sys().query('SELECT laatste_staat, fout, poging FROM app.agenda_abonnement WHERE user_id = $1 AND id = $2', [vers, versId])).rows[0];
    check('integraties-07 (g08-2): een account dat net «bezig» is, wordt niet opnieuw gestart en de rij blijft onaangeroerd (geen fout, geen poging erbij)',
      uitVers.fout === 'CALDAV_AL_BEZIG' && versRij?.laatste_staat === 'bezig' && versRij?.fout === '' && Number(versRij?.poging) === 0, `${JSON.stringify(uitVers)} rij=${JSON.stringify(versRij)}`);
    check('integraties-07 (g08-2): een «bezig» van langer dan de langst mogelijke ronde geleden (een crash) blokkeert niet: die ronde loopt gewoon',
      uitOud.staat === 'klaar' && uitOud.aantal === 2, JSON.stringify(uitOud));
    check('integraties-07 (g08-2): een onbekend account blijft CALDAV_ACCOUNT_ONBEKEND (en niet «al bezig»)',
      (await caldav.caldavOphalen(vers, randomUUID())).fout === 'CALDAV_ACCOUNT_ONBEKEND');

    // ---- 3. Dezelfde wedloop één laag lager (raakt ook ICS): twee gelijktijdige vervangingen van DEZELFDE bron. Elke
    //         transactie wiste wat zij zag en voegde haar eigen 2000 rijen toe; samen bleven er 4000 staan.
    const ics2 = `sec002-g08-vervang-${randomUUID()}`, abo = randomUUID(); opruimEigenaars.push(ics2);
    const rij = (soort: string, i: number) => ({
      abonnementId: abo, agendaUrl: '', uid: `${soort}-${i}@example.invalid`, titel: soort, locatie: '', beschrijving: '', begin: '2026-12-01T09:00:00Z', einde: '',
      heleDag: false, tijdzone: 'UTC', rrule: '', status: '', reeks: 0, gewijzigdOp: '', url: '',
    });
    let hoogste = 0;
    for (let poging = 0; poging < 5; poging += 1) {
      await Promise.all(['x', 'y', 'z'].map((soort) => spiegel.externeSpiegelVervang(ics2, abo, '', Array.from({ length: 2000 }, (_, i) => rij(`${soort}${poging}`, i)))));
      hoogste = Math.max(hoogste, await telRijen(ics2));
    }
    check('integraties-07 (g08-2): drie gelijktijdige vervangingen van dezelfde bron laten samen nooit meer dan de grens van één vervanging staan (ook voor ICS)',
      hoogste > 0 && hoogste <= Number(spiegel.EXTERNE_SPIEGEL_MAX_RIJEN), `hoogste=${hoogste}`);
  } catch (e) { check('integraties-07 (g08-2): onverwachte fout', false, String((e as Error)?.stack || e)); }
  finally { caldav.zetCaldavVerzoekerVoorTest(null); }

  // ====================================================================================== integraties-02/-07: frequentie
  try {
    const gebruiker = randomUUID(); opruimEigenaars.push(gebruiker);
    const nepAuth = async () => ({ service: 'hub', user: { id: gebruiker, email: 'lid@example.invalid', name: 'Lid', status: 'approved', role: 'member' } });
    type Resp = { statusCode: number; body: string; headers?: Record<string, string> };
    const routes = createAgendaRoutes(nepAuth as never) as unknown as Record<string, Array<(ctx: unknown) => Promise<Resp>>>;
    const roep = async (route: string, extra: Record<string, unknown> = {}) => {
      const res = await routes[route][0]({ event: {}, body: { service: 'hub', ...extra }, params: {} });
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(res.body || '{}'); } catch { data = {}; }
      return { status: res.statusCode, data, headers: res.headers || {} };
    };
    /** Roept de route `keer` keer aan en geeft de statussen terug. */
    const reeks = async (route: string, keer: number, extra: Record<string, unknown> = {}) => {
      const uit: number[] = [];
      for (let i = 0; i < keer; i += 1) uit.push((await roep(route, extra)).status);
      return uit;
    };
    const eerste429 = (statussen: number[]) => statussen.indexOf(429);
    // De teller werkt met vaste vensters van tien minuten op de klok. Vlak voor een grens even wachten, anders begint
    // de telling midden in de proef opnieuw en zegt de proef niets.
    const rest = 600 - (Math.floor(Date.now() / 1000) % 600);
    if (rest < 20) await new Promise((r) => setTimeout(r, (rest + 1) * 1000));
    const koppel = await reeks('POST /api/owner/agenda/caldav/koppelen', 14, { adres: 'http://niet-https.example.invalid/', gebruikersnaam: 'x', wachtwoord: 'verzonnen' });
    check('integraties-02: caldav/koppelen heeft een grens op de frequentie per gebruiker (429 na hoogstens 12 pogingen in tien minuten)',
      koppel[0] === 400 && eerste429(koppel) > 0 && eerste429(koppel) <= 12 && koppel.slice(eerste429(koppel)).every((s) => s === 429), koppel.join(','));
    const davVernieuw = await reeks('POST /api/owner/agenda/caldav/vernieuwen', 14);
    check('integraties-07: caldav/vernieuwen heeft een grens op de frequentie (429 na hoogstens 12 keer)',
      davVernieuw[0] === 200 && eerste429(davVernieuw) > 0 && eerste429(davVernieuw) <= 12, davVernieuw.join(','));
    const icsVernieuw = await reeks('POST /api/owner/agenda/ics/vernieuwen', 14);
    check('integraties-07: ics/vernieuwen heeft een grens op de frequentie (429 na hoogstens 12 keer)',
      icsVernieuw[0] === 200 && eerste429(icsVernieuw) > 0 && eerste429(icsVernieuw) <= 12, icsVernieuw.join(','));
    const gedwongen = await reeks('POST /api/owner/agenda/synchroniseren', 8, { forceren: true });
    check('integraties-07: agenda/synchroniseren met «forceren» heeft een grens op de frequentie (429 na hoogstens 6 keer)',
      gedwongen[0] === 200 && eerste429(gedwongen) > 0 && eerste429(gedwongen) <= 6, gedwongen.join(','));
    const teVaak = await roep('POST /api/owner/agenda/caldav/vernieuwen');
    check('integraties-07: het 429-antwoord draagt een stabiele code en zegt wanneer het weer mag (Retry-After)',
      teVaak.status === 429 && teVaak.data.error === 'RATE_LIMITED' && teVaak.data.ok === false && Number(teVaak.headers['Retry-After']) >= 1, JSON.stringify(teVaak));
    // Nacontrole g08-3: een weigering laat een spoor na — maar niet één per geweigerd verzoek (een AI in een lus zou de audit
    // en het meldingencentrum anders zelf overspoelen). Per soort de EERSTE weigering in het venster in de audit; één melding.
    const tempoSpoor = await auditVan(gebruiker, 'agenda.tempo.geweigerd');
    const soorten = [...new Set(tempoSpoor.map((r) => String(r.details.soort)))].sort();
    check('g08-3: per soort route precies één auditregel bij de eerste weigering in het venster (4 soorten geweigerd, ook al werd caldav/vernieuwen vaker geweigerd)',
      tempoSpoor.length === 4 && soorten.join(',') === 'caldavKoppelen,caldavVernieuwen,icsVernieuwen,synchroniserenGedwongen' && tempoSpoor.every((r) => r.result === 'geweigerd'),
      `${tempoSpoor.length}: ${soorten.join(',')}`);
    const tempoMeldingen = meldingenVan(gebruiker);
    check('g08-3: en precies één tweetalige melding in het meldingencentrum, die zegt wanneer het weer mag en dat de planner gewoon doorloopt',
      tempoMeldingen.length === 1 && tweetalig(`${tempoMeldingen[0].title} ${tempoMeldingen[0].message}`) && /\d+\s*(хв|min)/.test(tempoMeldingen[0].message) && tempoMeldingen[0].link === '/agenda',
      JSON.stringify(tempoMeldingen));
    // Een ander mens heeft zijn eigen teller.
    const ander = randomUUID(); opruimEigenaars.push(ander);
    const routesAnder = createAgendaRoutes((async () => ({ service: 'hub', user: { id: ander, email: 'ander@example.invalid', name: 'Ander', status: 'approved', role: 'member' } })) as never) as unknown as typeof routes;
    const anderAntwoord = await routesAnder['POST /api/owner/agenda/caldav/vernieuwen'][0]({ event: {}, body: { service: 'hub' }, params: {} });
    check('integraties-07: de grens geldt per gebruiker — een ander wordt niet geraakt', anderAntwoord.statusCode === 200, String(anderAntwoord.statusCode));
    // Een alleen-lezen-rol komt nog steeds niet bij het schrijven (het bestaande hek staat vóór de teller).
    const kijker = createAgendaRoutes((async () => ({ service: 'hub', user: { id: randomUUID(), email: 'kijker@example.invalid', name: 'Kijker', status: 'approved', role: 'viewer', accessLevel: 'limited' } })) as never) as unknown as typeof routes;
    const kijkerAntwoord = await kijker['POST /api/owner/agenda/caldav/vernieuwen'][0]({ event: {}, body: { service: 'hub' }, params: {} });
    check('integraties-07: het bestaande rollenhek blijft staan (een kijker krijgt 403, geen 200 en geen 429)', kijkerAntwoord.statusCode === 403, String(kijkerAntwoord.statusCode));
  } catch (e) { check('frequentie: onverwachte fout', false, String((e as Error)?.stack || e)); }

  // ---------------------------------------------------------------------------------------------- opruimen
  for (const eigenaar of opruimEigenaars) {
    await sys().query('DELETE FROM app.agenda_externe_gebeurtenis WHERE user_id = $1', [eigenaar]).catch(() => undefined);
    await sys().query('DELETE FROM app.agenda_abonnement WHERE user_id = $1', [eigenaar]).catch(() => undefined);
    await sys().query('DELETE FROM app.rate_limits WHERE bucket LIKE $1', [`agenda-%:${eigenaar}`]).catch(() => undefined);
  }
  return einde();
}
