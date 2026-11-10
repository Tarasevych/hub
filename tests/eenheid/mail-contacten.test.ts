// «Контакти й відправники» (19.10.2026, migratie 0074): volledige controle van alle adressen met bewijs uit officiële bronnen.
//  1. bronnen (puur): SPF/DMARC/BIMI-parsers, adreslijsten, gemengd schrift, uitgebreide lijst officiële domeinen, imitatie
//     zonder vals alarm, bewijsregels met bron + tijdstip, vertrouwensniveau;
//  2. DNS met een nep-DNS (geen netwerk): MX/SPF/DMARC (+ terugval op het organisatiedomein met sp=)/BIMI+VMC, NXDOMAIN,
//     time-out, cache 24 u, begrensde gelijktijdigheid;
//  3. volledige controle met een nep-Gmail over twee mailboxen: ontvangen + verzonden («ви писали») + concepten, hervatten na een
//     onderbreking zonder dubbel tellen, pauze/stop, automatische start één keer, incrementeel alleen nieuwe berichten;
//  4. lijst: filters (Перевірені/Неперевірені/Підозрілі/Ви писали/Офіційні/Мої контакти), zoeken, sorteren; detail met bewijs en
//     verwante adressen; acties (verdacht, contact) met logboek zonder adressen;
//  5. RLS: een ander account ziet niets (route en database);
//  6. UI (react-dom/server): filters, zoeken, rijen, detailpaneel met «Чому так», voortgang met «Пауза/Зупинити».
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { closePool, getPool, appRolActief } from '../../server/platform/pg';
import {
  adressenVan, bewijsRegels, classificeer, adresVan, gemengdSchrift, lijktOpMerk, bekendeDienstVoor, parseAuthResults, parseBimi, parseDmarc, parseSpf, regelTekst,
  vertrouwenVan, GEEN_AUTH, REGEL_TEKST, type ContactInvoer,
} from '../../shared/mail-afzenders';
import { BEKENDE_DIENSTEN, GRATIS_MAILBOXEN } from '../../shared/mail-bekende-afzenders';
import { beperkt, domeinDns, gmailFout, gmailFoutVan, zetDnsBron, type DnsBron, type ScanBron, type ScanKop } from '../../backend/mail-afzender-bronnen';
import { contactenScanAuto, contactenScanStand, contactenScanWachten, mailAfzenderRoutes, markeringenAan, waarnemingenVan, zetScanBron, zetScanPauze } from '../../backend/mail-afzenders';
import { alsGebruiker } from '../../backend/ai-toestemmingen';
import { driveZoekClausule } from '../../backend/google-suite-browser';
import { isTijdelijkeScanFout } from '../../shared/mail-scan-beleid';
import { checker } from './hulp/nep-google';
import { _zonderPoortIsPrive } from '../../backend/mail-ruimte';

type Res = { statusCode: number; body: string };
const lees = (r: unknown) => { const x = r as Res; let b: any = {}; try { b = JSON.parse(x.body); } catch { /* geen json */ } return { status: x.statusCode, b }; };
const pass = (d: string, arc = false) => [`mx.google.com; dkim=pass header.i=@${d} header.s=s1 header.b=x; ${arc ? 'arc=pass (i=1); ' : ''}spf=pass (google.com: domain of b@${d} designates 1.2.3.4) smtp.mailfrom=b@${d}; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=${d}`];
const fail = (d: string) => [`mx.google.com; dkim=fail header.i=@${d}; spf=fail smtp.mailfrom=x@evil.example; dmarc=fail (p=REJECT dis=REJECT) header.from=${d}`];
const kl = (from: string) => { const a = adresVan(from); return classificeer({ ...a, auth: GEEN_AUTH }); };
const ORIGIN = 'https://mail.tarasevych.com';

function nepBrowser() {
  const g = globalThis as Record<string, unknown>;
  if (g.window) return;
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(`${ORIGIN}/contacts`);
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  if (!g.document) g.document = { hidden: false, title: '', cookie: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } }, body: null };
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: { ...(g.document as object), head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
}

export async function main(): Promise<number> {
  // Deze test meet de POSTLAAG zelf en roept haar rechtstreeks aan, zonder route en dus zonder de ruimtepoort ervoor
  // (backend/mail-ruimte.ts, migratie 0083). «Geen lade» betekent hier dus: de persoonlijke lade — precies wat deze test
  // altijd bedoelde. De scheiding zelf wordt in tests/eenheid/ruimte-mail-20261020.test.ts bewezen, met de poort erbij.
  _zonderPoortIsPrive(true);
  const { check, einde } = checker('mail-contacten');

  // ================================================================ 1. bronnen en regels (puur)
  check('SPF: -all streng, ~all zacht, ?all neutraal, +all open, redirect, twee records = ongeldig, geen record',
    parseSpf([['v=spf1 include:_spf.google.com -all']]).beleid === 'streng' && parseSpf(['v=spf1 mx ~all']).beleid === 'zacht' && parseSpf(['v=spf1 ?all']).beleid === 'neutraal'
    && parseSpf(['v=spf1 +all']).beleid === 'open' && parseSpf(['v=spf1 redirect=_spf.x.example']).beleid === 'doorverwezen' && !parseSpf(['v=spf1 -all', 'v=spf1 ~all']).record && !parseSpf(['google-site-verification=x']).record);
  const dm = parseDmarc([['v=DMARC1; p=reject; ', 'rua=mailto:d@x.example; pct=50']]);
  check('DMARC: p=reject + pct uit gesplitste TXT-stukken; sp= telt voor een subdomein; p=none; ongeldig record → geen',
    dm.record && dm.beleid === 'reject' && dm.pct === 50 && parseDmarc(['v=DMARC1; p=none; sp=quarantine'], true).beleid === 'quarantine' && parseDmarc(['v=DMARC1; p=none']).beleid === 'none' && !parseDmarc(['v=DMARC1; p=bogus']).record, JSON.stringify(dm));
  const bimi = parseBimi(['v=BIMI1; l=https://merk.example/logo.svg; a=https://merk.example/vmc.pem']);
  check('BIMI: logo en VMC-link (alleen https); javascript:-link genegeerd', bimi.record && bimi.vmc === 'https://merk.example/vmc.pem' && bimi.logo.endsWith('logo.svg') && parseBimi(['v=BIMI1; l=javascript:alert(1)']).logo === '');
  const lijst = adressenVan('"Peeters, Jan" <Jan@Peeters.be>, b@x.example; Anna <anna@y.example>, jan@peeters.be, geen-adres');
  check('adreslijst: komma in aanhalingstekens splitst niet, dubbel en rommel weg, kleine letters', lijst.length === 3 && lijst[0].naam === 'Peeters, Jan' && lijst[0].adres === 'jan@peeters.be' && lijst[2].adres === 'anna@y.example', JSON.stringify(lijst));
  check('gemengd schrift: Latijn + Cyrillisch in één label → verdacht (DOMEIN_GEMENGD_SCHRIFT); volledig Cyrillisch (.укр) niet', gemengdSchrift('bаnk-x.example') && kl('Bank <a@bаnk-x.example>').reden === 'DOMEIN_GEMENGD_SCHRIFT' && !gemengdSchrift('пошта.укр') && !gemengdSchrift('bank.example'));
  check('lijst: overheid (gov.ua-subdomein, belastingdienst.nl, digid.nl, belgium.be, fgov.be), banken (oschadbank.ua, sns.nl), post (novaposhta.ua) erkend',
    ['tax.gov.ua', 'diia.gov.ua', 'belastingdienst.nl', 'digid.nl', 'mail.belgium.be', 'minfin.fgov.be', 'oschadbank.ua', 'sns.nl', 'novaposhta.ua', 'stripe.com'].every((d) => !!bekendeDienstVoor(d)), ['tax.gov.ua', 'digid.nl'].map((d) => bekendeDienstVoor(d)?.id).join(','));
  check('lijst: geen gratis mailbox, geen dubbele domeinen, elke dienst een bron', BEKENDE_DIENSTEN.every((d) => d.bron.length > 10 && d.domeinen.every((x) => !GRATIS_MAILBOXEN.includes(x.domein)))
    && new Set(BEKENDE_DIENSTEN.flatMap((d) => d.domeinen.map((x) => x.domein))).size === BEKENDE_DIENSTEN.flatMap((d) => d.domeinen).length);
  check('imitatie: belastingdienst-teruggave.nl, digid-verificatie.nl, «Нова пошта» van gmail, «Diia» van een vreemd domein → verdacht',
    kl('Belastingdienst <info@belastingdienst-teruggave.nl>').status === 'verdacht' && kl('X <a@digid-verificatie.nl>').reden === 'DOMEIN_LIJKT_OP_MERK' && kl('Нова пошта <np.dostavka@gmail.com>').reden === 'NAAM_MERK_ANDER_DOMEIN' && kl('Diia <noreply@diia-gov.example>').status === 'verdacht');
  check('geen vals alarm: klara.be, digit.com, svb.com, duo.com, hotel-booking.nl, mail.gov.uk, «Mollie Smith», «Zoom meeting», «Wise» als achternaam',
    ['klara.be', 'digit.com', 'svb.com', 'duo.com', 'hotel-booking.nl', 'mail.gov.uk'].every((d) => !lijktOpMerk(d)) && kl('Mollie Smith <mollie@atelier.example>').status === 'onbekend'
    && kl('Zoom meeting <team@firma.example>').status === 'onbekend' && kl('Jan Wise <jan@wise-family.example>').status === 'onbekend', ['klara.be', 'digit.com', 'svb.com', 'duo.com', 'hotel-booking.nl', 'mail.gov.uk'].map((d) => `${d}:${lijktOpMerk(d)?.id || '-'}`).join(' '));
  const arc = parseAuthResults(pass('firma.example', true));
  check('auth: ARC uit de bovenste regel van de eigen server', arc.arc === 'pass' && parseAuthResults(pass('firma.example')).arc === '');
  const inv = (p: Partial<ContactInvoer>): ContactInvoer => ({ adres: 'info@firma.example', domein: 'firma.example', status: 'onbekend', bron: null, reden: 'NIET_BEVESTIGD', merk: '', bewijs: {}, aantal: 0, laatsteOp: null, verzonden: 0, laatstVerzondenOp: null, inContacten: false, geverifieerdOp: null, bijgewerktOp: '2026-10-19T08:00:00Z', dns: null, ...p });
  const dnsStreng = { domein: 'firma.example', tijd: Date.parse('2026-10-19T09:00:00Z'), fout: '', bestaat: true, mx: 2, spf: 'streng' as const, spfRecord: true, dmarc: 'reject' as const, dmarcRecord: true, dmarcVan: 'firma.example', dmarcPct: 100, bimi: true, bimiLogo: '', bimiVmc: 'https://firma.example/vmc.pem' };
  const goed = inv({ aantal: 12, verzonden: 3, laatstVerzondenOp: '2026-10-18T10:00:00Z', laatsteOp: '2026-10-18T11:00:00Z', dns: dnsStreng, bewijs: { pass: 12, laatste: { spf: 'pass', spfDomein: 'firma.example', dkim: 'pass:firma.example', dkimDomein: 'firma.example', dmarc: 'pass', dmarcDomein: 'firma.example', authserv: 'mx.google.com', tijd: Date.parse('2026-10-18T11:00:00Z'), arc: 'pass' } } });
  const regels = bewijsRegels(goed), codes = regels.map((r) => r.code);
  check('bewijs: DKIM aligned, SPF, DMARC (Gmail), MX/SPF/DMARC p=reject/BIMI+VMC (DNS), lijst, geen imitatie, «ви писали» — elk met bron en (waar zinvol) tijdstip',
    ['DKIM_ALIGNED', 'SPF_PASS', 'DMARC_PASS', 'ARC_PASS', 'DNS_MX', 'DNS_SPF', 'DNS_DMARC_STRENG', 'DNS_BIMI_VMC', 'LIJST_NIET', 'IMITATIE_GEEN', 'VERZONDEN', 'ONTVANGEN'].every((c) => codes.includes(c))
    && regels.filter((r) => r.bron === 'gmail' || r.bron === 'dns').every((r) => typeof r.tijd === 'number' && r.tijd > 0) && regels.every((r) => !!REGEL_TEKST[r.code]), codes.join(','));
  check('bewijs: tekst uk met detail (DMARC p=reject), nl ook', regelTekst(regels.find((r) => r.code === 'DNS_DMARC_STRENG')!, 'uk').includes('p=reject') && regelTekst(regels.find((r) => r.code === 'VERZONDEN')!, 'nl').includes('3'));
  const vGoed = vertrouwenVan(goed), vKaal = vertrouwenVan(inv({ aantal: 1, bewijs: { zonder: 1 } })), vFail = vertrouwenVan(inv({ aantal: 2, bewijs: { fail: 2 }, dns: { ...dnsStreng, dmarc: '', dmarcRecord: false } }));
  check('vertrouwen: onbevestigd maar sterk bewijs → «middel» (≤ 75, nooit «hoog»); zonder signalen → «laag»',
    vGoed.niveau === 'middel' && vGoed.score === 75 && vKaal.niveau === 'laag', `${vGoed.score} ${vKaal.score}`);
  check('vertrouwen: DMARC fail of verdacht laag; handmatig hoog', vFail.score < 25 && vertrouwenVan(inv({ status: 'geverifieerd', bron: 'handmatig', reden: 'HANDMATIG' })).score === 100 && vertrouwenVan(inv({ status: 'verdacht', reden: 'DOMEIN_LIJKT_OP_MERK' })).niveau === 'geen', String(vFail.score));
  check('bewijs: gratis mailbox → geen DNS-oordeel, wel uitleg; imitatie als regel met merk', bewijsRegels(inv({ domein: 'gmail.com', adres: 'x@gmail.com' })).some((r) => r.code === 'DNS_GRATIS') && bewijsRegels(inv({ status: 'verdacht', reden: 'NAAM_MERK_ANDER_DOMEIN', merk: 'PayPal' })).some((r) => r.code === 'NAAM_MERK_ANDER_DOMEIN' && r.toon === 'slecht' && r.detail === 'PayPal'));
  const eigen = new Set(['ik@eigen.example']);
  const wSent = waarnemingenVan({ from: 'Ik <ik@eigen.example>', to: 'Jan <jan@peeters.be>, ik@eigen.example', cc: '"B, C" <b@x.example>', bcc: 'geheim@y.example', auth: [], tijd: 5, labels: ['SENT'] }, eigen);
  check('waarnemingen: verzonden → ontvangers To/Cc/Bcc (zonder eigen adres); concept → niets; ontvangen → afzender met auth',
    wSent.length === 3 && wSent.every((w) => w.soort === 'verzonden') && waarnemingenVan({ from: 'Ik <ik@eigen.example>', to: 'jan@peeters.be', cc: '', bcc: '', auth: [], tijd: 1, labels: ['DRAFT'] }, eigen).length === 0
    && (() => { const w = waarnemingenVan({ from: 'Jan <jan@peeters.be>', to: 'ik@eigen.example', cc: '', bcc: '', auth: pass('peeters.be'), tijd: 1, labels: ['INBOX'] }, eigen); return w.length === 1 && w[0].soort === 'ontvangen' && (w[0] as any).auth.dmarc === 'pass'; })(), JSON.stringify(wSent.map((w) => w.adres)));

  // ---------------- F2 (live-audit 19.10): 403 van Gmail is dubbelzinnig; proxy-403 zonder Gmail-JSON is geen scope-fout
  check('F2: 403 + insufficientPermissions → SCOPE_REQUIRED; 403 + userRateLimitExceeded → RATE_LIMITED; 403 zonder reden (proxy/herstart) → PROVIDER_UNAVAILABLE (herstelbaar); 401 → REAUTH; 429 → RATE_LIMITED',
    gmailFout(403, 'insufficientPermissions') === 'GOOGLE_MAIL_SCOPE_REQUIRED' && gmailFout(403, 'userRateLimitExceeded User-rate limit exceeded') === 'GOOGLE_MAIL_RATE_LIMITED' && gmailFout(403) === 'GOOGLE_MAIL_PROVIDER_UNAVAILABLE' && gmailFout(401) === 'GOOGLE_MAIL_REAUTH_REQUIRED' && gmailFout(429) === 'GOOGLE_MAIL_RATE_LIMITED' && gmailFout(502) === 'GOOGLE_MAIL_PROVIDER_UNAVAILABLE');
  check('F2: gmailFoutVan leest de reden uit de JSON-body (error.errors[].reason / error.status)',
    await gmailFoutVan(new Response(JSON.stringify({ error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED', errors: [{ reason: 'insufficientPermissions' }] } }), { status: 403 })) === 'GOOGLE_MAIL_SCOPE_REQUIRED'
    && await gmailFoutVan(new Response('<html>502 Bad Gateway</html>', { status: 403 })) === 'GOOGLE_MAIL_PROVIDER_UNAVAILABLE'
    && await gmailFoutVan(new Response(JSON.stringify({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }), { status: 403 })) === 'GOOGLE_MAIL_RATE_LIMITED');
  check('F15 (cloud/zoeken): «Slim» → (name contains OR fullText contains); «Slim rapport» → beide woorden verplicht; apostrof ontsnapt; leeg → geen clausule',
    driveZoekClausule('Slim') === "(name contains 'Slim' or fullText contains 'Slim')" && driveZoekClausule('  Slim   rapport ') === "(name contains 'Slim' or fullText contains 'Slim') and (name contains 'rapport' or fullText contains 'rapport')" && driveZoekClausule("d'Hont") === "(name contains 'd\\'Hont' or fullText contains 'd\\'Hont')" && driveZoekClausule('   ') === '');
  // Punt 15 (19.10.2026): de lijst «welke fout is tijdelijk» staat niet meer als losse regex in de backend maar in
  // shared/mail-scan-beleid.ts (isTijdelijkeScanFout — dezelfde code in de browser en op de server). SCOPE_REQUIRED blijft er
  // apart bij staan, omdat één verzoek na een uur bewijst of die fout nog geldt. Zie contacten-hervatten-20261019.test.ts.
  check('F2: contactenScanAuto hervat ook na een (vermeende) scope-fout ouder dan 1 u', /isTijdelijkeScanFout\(a\.fout\)/.test(readFileSync('backend/mail-afzenders.ts', 'utf8'))
    && /SCOPE_REQUIRED/.test(readFileSync('backend/mail-afzenders.ts', 'utf8'))
    && ['GOOGLE_MAIL_RATE_LIMITED', 'GOOGLE_MAIL_PROVIDER_UNAVAILABLE', 'SCAN_MISLUKT'].every((c) => isTijdelijkeScanFout(c)));

  // ================================================================ 2. DNS met nep-DNS
  const vragen: string[] = []; let tegelijk = 0, maxTegelijk = 0;
  const zone: Record<string, { mx?: Array<{ exchange: string; priority: number }>; txt?: string[][]; fout?: string }> = {
    'firma.example': { mx: [{ exchange: 'mx1.firma.example', priority: 10 }, { exchange: 'mx2.firma.example', priority: 20 }], txt: [['v=spf1 include:_spf.firma.example -all'], ['google-site-verification=abc']] },
    '_dmarc.firma.example': { txt: [['v=DMARC1; p=reject; rua=mailto:dmarc@firma.example']] },
    'default._bimi.firma.example': { txt: [['v=BIMI1; l=https://firma.example/logo.svg; a=https://firma.example/vmc.pem']] },
    'nieuws.org.example': { mx: [{ exchange: 'mx.org.example', priority: 5 }], txt: [['v=spf1 ~all']] },
    '_dmarc.org.example': { txt: [['v=DMARC1; p=none; sp=quarantine']] },
    'geenmail.example': { mx: [{ exchange: '.', priority: 0 }], txt: [] },
    'traag.example': { fout: 'ETIMEOUT' },
  };
  const nepDns: DnsBron = {
    async mx(n) { vragen.push(`mx:${n}`); tegelijk++; maxTegelijk = Math.max(maxTegelijk, tegelijk); await new Promise((r) => setTimeout(r, 2)); tegelijk--; const z = zone[n]; if (z?.fout) throw Object.assign(new Error('x'), { code: z.fout }); if (!z) throw Object.assign(new Error('x'), { code: Object.keys(zone).some((k) => k.endsWith(`.${n}`)) ? 'ENODATA' : 'ENOTFOUND' }); if (!z.mx) throw Object.assign(new Error('x'), { code: 'ENODATA' }); return z.mx; },
    async txt(n) { vragen.push(`txt:${n}`); const z = zone[n]; if (z?.fout) throw Object.assign(new Error('x'), { code: z.fout }); if (!z?.txt) throw Object.assign(new Error('x'), { code: z ? 'ENODATA' : (Object.keys(zone).some((k) => k.endsWith(`.${n}`) || n.endsWith(`.${k}`)) ? 'ENODATA' : 'ENOTFOUND') }); return z.txt; },
  };
  zetDnsBron(nepDns);
  const d1 = await domeinDns('Firma.example');
  check('DNS: MX (2), SPF -all, DMARC p=reject van het domein zelf, BIMI met VMC', d1.mx === 2 && d1.spf === 'streng' && d1.dmarc === 'reject' && d1.dmarcVan === 'firma.example' && d1.bimiVmc.endsWith('vmc.pem') && !d1.fout, JSON.stringify(d1));
  const d2 = await domeinDns('nieuws.org.example');
  check('DNS: geen eigen DMARC → organisatiedomein, en daar telt sp= (quarantine)', d2.dmarc === 'quarantine' && d2.dmarcVan === 'org.example' && d2.spf === 'zacht', JSON.stringify(d2));
  const d3 = await domeinDns('bestaatniet.example'), d4 = await domeinDns('geenmail.example'), d5 = await domeinDns('traag.example');
  check('DNS: NXDOMAIN → bestaat niet; «null MX» → geen mail; time-out → fout DNS_TIMEOUT (geen oordeel «slecht»)', !d3.bestaat && d4.mx === 0 && d4.bestaat && d5.fout === 'DNS_TIMEOUT' && !bewijsRegels(inv({ dns: d5 })).some((r) => r.code === 'DNS_GEEN_MX' || r.code === 'DNS_GEEN_DMARC'), JSON.stringify([d3.bestaat, d4.mx, d5.fout]));
  const voor = vragen.length; await domeinDns('firma.example');
  check('DNS: cache — tweede opvraging binnen 24 u stelt geen nieuwe vragen', vragen.length === voor);
  check('DNS: ongeldige naam → geen vraag', (await domeinDns('-x..example')).fout === 'DNS_ONGELDIG' && vragen.length === voor);
  const volgorde = await beperkt([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (x) => { tegelijk++; maxTegelijk = Math.max(maxTegelijk, tegelijk); await new Promise((r) => setTimeout(r, 3)); tegelijk--; return x * 2; });
  check('gelijktijdigheid: beperkt() houdt de volgorde en de grens', volgorde.join(',') === '2,4,6,8,10,12,14,16,18,20' && maxTegelijk <= 4, String(maxTegelijk));

  // ================================================================ 3. volledige controle met nep-Gmail
  const sys = getPool('systeem');
  const A = `ctv-a-${randomUUID()}`, B = `ctv-b-${randomUUID()}`;
  let wie = A;
  const sessie = async () => ({ user: { id: wie, status: 'approved', role: 'member' }, service: 'mail' });
  const R = mailAfzenderRoutes({ requireSession: sessie as never });
  const roep = async (pad: string, body: Record<string, unknown> = {}) => lees(await (R[`POST /api/owner/mail/${pad}`][0] as (c: unknown) => Promise<unknown>)({ event: {}, body }));
  const T0 = Date.parse('2026-09-01T00:00:00Z');
  const box: Record<string, Array<{ id: string; kop: ScanKop }>> = { 'acc-1': [], 'acc-2': [] };
  const zet = (acc: string, id: string, kop: Partial<ScanKop>) => box[acc].push({ id, kop: { from: '', to: '', cc: '', bcc: '', auth: [], tijd: 0, labels: ['INBOX'], ...kop } });
  for (let i = 0; i < 130; i++) {
    const t = T0 + i * 60_000, s = i % 6;
    if (s === 0) zet('acc-1', `a${i}`, { from: 'Firma <info@firma.example>', to: 'ik@eigen.example', auth: pass('firma.example'), tijd: t });
    else if (s === 1) zet('acc-1', `a${i}`, { from: 'Belastingdienst <noreply@belastingdienst.nl>', to: 'ik@eigen.example', auth: pass('belastingdienst.nl'), tijd: t });
    else if (s === 2) zet('acc-1', `a${i}`, { from: 'Belastingdienst <teruggave@belastingdienst-teruggave.nl>', to: 'ik@eigen.example', auth: pass('belastingdienst-teruggave.nl'), tijd: t });
    else if (s === 3) zet('acc-1', `a${i}`, { from: 'Ik <ik@eigen.example>', to: '"Peeters, Jan" <jan@peeters.be>', cc: 'Anna <anna@nieuws.org.example>', bcc: 'stil@geenmail.example', labels: ['SENT'], tijd: t });
    else if (s === 4) zet('acc-1', `a${i}`, { from: 'Ik <ik@eigen.example>', to: 'concept@peeters.be', labels: ['DRAFT'], tijd: t });
    else zet('acc-1', `a${i}`, { from: 'Jan Peeters <jan.peeters.prive@gmail.com>', to: 'ik@eigen.example', auth: pass('gmail.com'), tijd: t });
  }
  for (let i = 0; i < 40; i++) zet('acc-2', `b${i}`, i % 2 ? { from: 'Nieuws <nieuws@nieuws.org.example>', auth: pass('nieuws.org.example'), tijd: T0 + i * 90_000 } : { from: 'Werk <ik@werk.example>', to: 'jan@peeters.be', labels: ['SENT'], tijd: T0 + i * 90_000 });
  let lijstFout: ((acc: string, tok: string) => string | null) | null = null, kopVertraging = 0;
  const lijstVragen: Array<{ acc: string; q?: string }> = [];
  const nepScan: ScanBron = {
    async accounts() { return [{ id: 'acc-1', email: 'ik@eigen.example' }, { id: 'acc-2', email: 'ik@werk.example' }]; },
    async profiel(_u, acc) { return { email: acc === 'acc-1' ? 'ik@eigen.example' : 'ik@werk.example', totaal: box[acc].length }; },
    async lijst(_u, acc, tok, max, q) {
      lijstVragen.push({ acc, q }); const f = lijstFout?.(acc, tok); if (f) throw new Error(f);
      const na = q ? Number(/after:(\d+)/.exec(q)?.[1] || 0) * 1000 : 0;
      const alle = box[acc].filter((m) => m.kop.tijd > na).sort((x, y) => y.kop.tijd - x.kop.tijd);
      const start = tok ? Number(tok.slice(1)) : 0, ids = alle.slice(start, start + max).map((m) => m.id);
      return { ids, next: start + max < alle.length ? `p${start + max}` : '' };
    },
    async kop(_u, acc, id) { if (kopVertraging) await new Promise((r) => setTimeout(r, kopVertraging)); return box[acc].find((m) => m.id === id)?.kop || null; },
    async huidig() { return 'acc-1'; },
  };
  zetScanBron(nepScan); zetScanPauze(0);
  const rij = async (adres: string, u = A) => (await sys.query('SELECT status, reden, aantal, verzonden, accounts, officieel, organisatie, vertrouwen, in_contacten FROM app.mail_afzenders WHERE user_id = $1 AND adres = $2', [u, adres])).rows[0];
  try {
    check('vóór de controle: stand «nooit», markeringen uit', (await roep('contacten/scan/status')).b.scan?.staat === 'nooit' && !(await markeringenAan(A)));
    const zonderToestemming = await roep('contacten/scan/auto');
    check('MAILSCAN-002: без згоди жодна скринька не перевіряється', zonderToestemming.status === 200 && !zonderToestemming.b.scan?.loopt
      && zonderToestemming.b.scan?.gekoppeld?.every((x: any) => x.voorkeur.aan === false));
    for (const accountId of ['acc-1', 'acc-2']) {
      const toestemming = await roep('contacten/scan/voorkeur', { accountId, voorkeur: { aan: true, werkwijze: 'periodiek', intervalMinuten: 15 } });
      check(`MAILSCAN-002: окрема згода ${accountId}`, toestemming.status === 200
        && toestemming.b.scan?.gekoppeld?.find((x: any) => x.accountId === accountId)?.voorkeur.aan === true);
    }
    // Pagina 2 van mailbox 1 faalt steeds (tijdelijke Gmail-limiet) → «fout» na de herhalingen; mailbox 2 loopt wel door.
    lijstFout = (acc, tok) => (acc === 'acc-1' && tok === 'p50' ? 'GOOGLE_MAIL_RATE_LIMITED' : null);
    const auto = await roep('contacten/scan/auto');
    check('auto: bij het eerste openen van de mail start de controle vanzelf (automatisch, bezig, schatting uit getProfile)', auto.status === 200 && auto.b.scan?.automatisch === true && auto.b.scan?.loopt === true && auto.b.scan?.schatting === 170, JSON.stringify(auto.b.scan).slice(0, 300));
    await contactenScanWachten(A);
    const naFout = await contactenScanStand(A);
    const acc1 = naFout.accounts.find((a) => a.accountId === 'acc-1'), acc2 = naFout.accounts.find((a) => a.accountId === 'acc-2');
    check('onderbreking: mailbox 1 «fout» na pagina 1 (50), mailbox 2 wel klaar (40); totaal «fout»', naFout.staat === 'fout' && acc1?.staat === 'fout' && acc1?.verwerkt === 50 && acc1?.fout === 'GOOGLE_MAIL_RATE_LIMITED' && acc2?.staat === 'klaar' && acc2?.verwerkt === 40, JSON.stringify(naFout.accounts));
    const firmaNa1 = Number((await rij('info@firma.example'))?.aantal || 0);
    check('auto: geen tweede start binnen een minuut (geen dubbel werk)', (await contactenScanAuto(A)).automatisch !== true);
    lijstFout = null;
    const hv = await roep('contacten/scan/start', {});
    await contactenScanWachten(A);
    const klaar = await contactenScanStand(A);
    check('hervatten: vanaf pagina 2 verder, klaar met precies 130 + 40 berichten', hv.b.scan?.loopt === true && klaar.staat === 'klaar' && klaar.verwerkt === 170 && !!klaar.eersteKlaarOp, JSON.stringify(klaar.accounts));
    const firma = await rij('info@firma.example'), jan = await rij('jan@peeters.be'), anna = await rij('anna@nieuws.org.example'), bd = await rij('noreply@belastingdienst.nl'), nep = await rij('teruggave@belastingdienst-teruggave.nl'), prive = await rij('jan.peeters.prive@gmail.com');
    check('tellen: niets dubbel na hervatten (Firma: 22 berichten, na pagina 1 er 8)', firma?.aantal === 22 && firmaNa1 === 8, `${firma?.aantal} / ${firmaNa1}`);
    check('«ви писали»: ontvangers van verzonden mail (To, Cc, Bcc) uit beide mailboxen; concepten tellen niet', jan?.verzonden === 22 + 20 && anna?.verzonden === 22 && (await rij('stil@geenmail.example'))?.verzonden === 22 && !(await rij('concept@peeters.be')), JSON.stringify([jan?.verzonden, anna?.verzonden]));
    check('mailboxen: per adres onthouden waar gezien (jan@peeters.be in acc-1 én acc-2)', Array.isArray(jan?.accounts) && jan.accounts.includes('acc-1') && jan.accounts.includes('acc-2'), JSON.stringify(jan?.accounts));
    check('eigen adressen nooit als contact', !(await rij('ik@eigen.example')) && !(await rij('ik@werk.example')));
    check('officieel: Belastingdienst + DMARC pass → geverifieerd + officieel; «Belastingdienst» van een lijkend domein → verdacht', bd?.status === 'geverifieerd' && bd?.officieel === true && nep?.status === 'verdacht' && nep?.officieel === false, JSON.stringify([bd, nep]));
    check('gratis mailbox blijft onbekend (ook met DMARC pass van gmail.com)', prive?.status === 'onbekend' && prive?.reden === 'GRATIS_MAILBOX');
    const dnsRijen = (await sys.query('SELECT domein, gegevens FROM app.mail_domein_dns WHERE user_id = $1 ORDER BY domein', [A])).rows;
    check('DNS-bewijs per gebruiker bewaard (firma, org-subdomein, belastingdienst …), gratis mailboxen niet opgevraagd', dnsRijen.some((r) => r.domein === 'firma.example' && r.gegevens.dmarc === 'reject') && dnsRijen.some((r) => r.domein === 'nieuws.org.example') && !dnsRijen.some((r) => r.domein === 'gmail.com'), dnsRijen.map((r) => r.domein).join(','));
    check('vertrouwen: Firma (DMARC pass + DNS streng) hoger dan Anna (alleen ontvanger, p=quarantine via org)', Number(firma?.vertrouwen) > 40 && Number(firma?.vertrouwen) <= 75, `${firma?.vertrouwen} ${anna?.vertrouwen}`);
    check('markeringen: na de eerste volledige controle aan (ook zonder de oude audit)', await markeringenAan(A));

    // Incrementeel: nieuwe berichten (nieuwer dan het hoogwater) — alleen die worden geteld.
    zet('acc-1', 'n1', { from: 'Firma <info@firma.example>', auth: pass('firma.example'), tijd: T0 + 200 * 60_000 });
    zet('acc-1', 'n2', { from: 'Nieuw <nieuw@nieuwe-klant.example>', auth: pass('nieuwe-klant.example'), tijd: T0 + 201 * 60_000 });
    lijstVragen.length = 0;
    const bijw = await contactenScanAuto(A, Date.now() + 16 * 60_000);
    await contactenScanWachten(A);
    check('incrementeel: na ≥ 15 min vanzelf bijwerken, met Gmail «after:» (alleen nieuwere berichten)', bijw.automatisch === true && lijstVragen.length > 0 && lijstVragen.every((v) => /^after:\d+$/.test(v.q || '')), JSON.stringify(lijstVragen.slice(0, 2)));
    check('incrementeel: alleen de nieuwe berichten geteld (Firma 23, nieuwe klant 1), oude niet opnieuw', (await rij('info@firma.example'))?.aantal === 23 && (await rij('nieuw@nieuwe-klant.example'))?.aantal === 1 && (await rij('jan@peeters.be'))?.verzonden === 42);

    // Pauze en stop tijdens het lopen.
    kopVertraging = 15;
    await roep('contacten/scan/start', { bijwerken: true });
    const pz = await roep('contacten/scan/pauze');
    check('pauze: tijdens het lopen → «gepauzeerd», hervatbaar; auto start hem niet vanzelf opnieuw', pz.b.scan?.staat === 'gepauzeerd' && pz.b.scan?.loopt === false && (await contactenScanAuto(A, Date.now() + 3600_000)).automatisch !== true, JSON.stringify(pz.b.scan?.accounts));
    const st = await roep('contacten/scan/stop');
    check('stop: «gestopt» (geen automatische controles tot u verdergaat)', st.b.scan?.staat === 'gestopt');
    kopVertraging = 0;
    await roep('contacten/scan/start', {}); await contactenScanWachten(A);
    const opnieuw = await contactenScanStand(A);
    check('opnieuw + pauze + verder: klaar met dezelfde tellingen (Firma 23, jan 42)', opnieuw.staat === 'klaar' && (await rij('info@firma.example'))?.aantal === 23 && (await rij('jan@peeters.be'))?.verzonden === 42, JSON.stringify(opnieuw.accounts.map((a) => [a.staat, a.verwerkt])));

    // ================================================================ 4. lijst, detail, acties
    const alle = await roep('contacten/lijst', {});
    const t = alle.b.tellers || {};
    check('lijst: tellers per filter (alle, geverifieerd, verdacht, geschreven, officieel)', alle.status === 200 && t.alle >= 8 && t.geverifieerd === 1 && t.verdacht >= 1 && t.geschreven === 3 && t.officieel === 1, JSON.stringify(t));
    const fGeschreven = await roep('contacten/lijst', { filter: 'geschreven', sorteer: 'naam' });
    check('filter «Ви писали» + sorteren op naam', fGeschreven.b.contacten.length === 3 && fGeschreven.b.contacten.every((c: any) => c.verzonden > 0) && fGeschreven.b.contacten.map((c: any) => (c.naam || c.adres).toLowerCase()).join('|') === [...fGeschreven.b.contacten.map((c: any) => (c.naam || c.adres).toLowerCase())].sort().join('|'), fGeschreven.b.contacten.map((c: any) => c.naam || c.adres).join(','));
    check('filter «Офіційні організації» en «Підозрілі»', (await roep('contacten/lijst', { filter: 'officieel' })).b.contacten.every((c: any) => c.officieel) && (await roep('contacten/lijst', { filter: 'verdacht' })).b.contacten.every((c: any) => c.status === 'verdacht'));
    const zk = await roep('contacten/lijst', { zoek: 'org.example' });
    check('zoeken op domein (en de tellers volgen de zoekterm)', zk.b.contacten.length === 2 && zk.b.tellers.alle === 2, JSON.stringify(zk.b.contacten.map((c: any) => c.adres)));
    check('sorteren «risico»: verdacht eerst; «vertrouwen»: hoogste eerst', (await roep('contacten/lijst', { sorteer: 'risico' })).b.contacten[0]?.status === 'verdacht' && (await roep('contacten/lijst', { sorteer: 'vertrouwen' })).b.contacten[0]?.status === 'geverifieerd');
    check('ongeldige filter/sortering → standaard (geen SQL uit invoer)', (await roep('contacten/lijst', { filter: "x'; DROP", sorteer: '1;--' })).status === 200);
    const det = await roep('contacten/detail', { adres: 'info@firma.example' });
    const bronnen = new Set((det.b.regels || []).map((r: any) => r.bron));
    check('detail: bewijs uit Gmail, DNS, lijst, heuristiek en uw mail — met tijdstip; vertrouwen + niveau', det.status === 200 && ['gmail', 'dns', 'lijst', 'heuristiek', 'mail'].every((b) => bronnen.has(b)) && det.b.contact?.niveau && det.b.regels.some((r: any) => r.code === 'DNS_DMARC_STRENG' && r.tijd > 0), JSON.stringify([...bronnen]));
    const detJan = await roep('contacten/detail', { adres: 'jan@peeters.be' });
    check('detail: mailboxen met adres, huidig account voor «Відкрити листи»', detJan.b.contact?.accountsInfo?.some((a: any) => a.email === 'ik@werk.example') && detJan.b.huidigAccount === 'acc-1', JSON.stringify(detJan.b.contact?.accountsInfo));
    await sys.query('DELETE FROM app.mail_domein_dns WHERE user_id = $1 AND domein = $2', [A, 'nieuwe-klant.example']);
    vragen.length = 0; zetDnsBron(nepDns); // cache leeg → luie DNS-controle bij het openen
    const detNieuw = await roep('contacten/detail', { adres: 'nieuw@nieuwe-klant.example' });
    check('detail: luie DNS-controle als er nog geen DNS-bewijs is (bewaard, regel DNS_GEEN_DOMEIN)', vragen.some((v) => v.endsWith('nieuwe-klant.example')) && detNieuw.b.regels.some((r: any) => r.code === 'DNS_GEEN_DOMEIN') && (await sys.query('SELECT 1 FROM app.mail_domein_dns WHERE user_id = $1 AND domein = $2', [A, 'nieuwe-klant.example'])).rowCount === 1);
    await roep('afzenders/bijwerken', { adres: 'nieuws@nieuws.org.example', naam: 'Anna' });
    const verwant = await roep('contacten/detail', { adres: 'anna@nieuws.org.example' });
    check('detail: andere adressen van dezelfde organisatie/naam', verwant.b.verwant?.some((v: any) => v.adres === 'nieuws@nieuws.org.example'), JSON.stringify(verwant.b.verwant));
    check('actie: verdacht markeren vraagt bevestiging', (await roep('contacten/verdacht', { adres: 'anna@nieuws.org.example' })).b.error === 'AFZENDER_BEVESTIG_VEREIST');
    const vm = await roep('contacten/verdacht', { adres: 'anna@nieuws.org.example', bevestig: true });
    check('actie: «Позначити підозрілим» → verdacht (HANDMATIG_VERDACHT), vertrouwen 0', vm.b.afzender?.status === 'verdacht' && vm.b.afzender?.reden === 'HANDMATIG_VERDACHT' && (await rij('anna@nieuws.org.example'))?.vertrouwen === 0);
    check('actie: verdacht adres niet in contacten (409)', (await roep('contacten/contact', { adres: 'anna@nieuws.org.example', aan: true })).status === 409);
    // Live-audit 19.10 (F5): een eigen markering «підозрілий» moet weer op te heffen zijn.
    const zn = await roep('afzenders/intrekken', { adres: 'anna@nieuws.org.example' });
    check('F5: «Зняти позначку» (afzenders/intrekken op HANDMATIG_VERDACHT) → onbekend, reden MARKERING_OPGEHEVEN, historie «markering-opgeheven»', zn.status === 200 && zn.b.afzender?.status === 'onbekend' && zn.b.afzender?.reden === 'MARKERING_OPGEHEVEN' && zn.b.afzender?.historie?.at(-1)?.op === 'markering-opgeheven' && zn.b.afzender?.historie?.at(-1)?.van === 'verdacht', JSON.stringify(zn.b));
    check('F5: intrekken op een gewoon onbekend adres blijft 409', (await roep('afzenders/intrekken', { adres: 'anna@nieuws.org.example' })).status === 409);
    await roep('contacten/verdacht', { adres: 'anna@nieuws.org.example', bevestig: true });
    const ct = await roep('contacten/contact', { adres: 'jan@peeters.be', aan: true });
    check('actie: «Додати в контакти» → filter «Мої контакти»', ct.b.afzender?.inContacten === true && (await roep('contacten/lijst', { filter: 'contacten' })).b.contacten.map((c: any) => c.adres).join() === 'jan@peeters.be');
    const st2 = await roep('afzenders/status', { items: [{ from: 'Peeters, Jan <jan.vals@other.example>' }] });
    check('contact-imitatie: de naam van een contact met een ander adres → verdacht', st2.b.items?.[0]?.status === 'verdacht' && st2.b.items?.[0]?.reden === 'NAAM_VAN_CONTACT_ANDER_ADRES', JSON.stringify(st2.b.items));
    const log = (await sys.query(`SELECT action, details::text AS d FROM app.audit WHERE owner_id = $1 AND (action LIKE 'owner.mail.contacten.%' OR action LIKE 'owner.mail.afzender.%') ORDER BY seq`, [A])).rows;
    check('logboek: start/klaar/pauze/stop van de controle en de acties', ['owner.mail.contacten.scan.gestart', 'owner.mail.contacten.scan.klaar', 'owner.mail.contacten.scan.gepauzeerd', 'owner.mail.contacten.scan.gestopt', 'owner.mail.afzender.verdacht', 'owner.mail.afzender.contact'].every((a) => log.some((r) => r.action === a)), log.map((r) => r.action).join(','));
    check('logboek: nooit een volledig adres', log.every((r) => !/@[a-z0-9-]+\.[a-z]/i.test(r.d.replace(/contacten@mail|audit@mail/g, ''))), log.map((r) => r.d).join(' | ').slice(0, 300));

    // ================================================================ 5. RLS
    wie = B;
    const bl = await roep('contacten/lijst', {}), bs = await roep('contacten/scan/status'), bd2 = await roep('contacten/detail', { adres: 'info@firma.example' });
    check('RLS/route: ander account ziet een lege lijst, «nooit» als stand, detail 404', bl.b.totaal === 0 && bs.b.scan?.staat === 'nooit' && bs.b.scan?.tellers?.dns === 0 && bd2.status === 404);
    check('RLS/route: ander account kan A’s adres niet als verdacht of contact markeren', (await roep('contacten/verdacht', { adres: 'jan@peeters.be', bevestig: true })).status === 404 && (await roep('contacten/contact', { adres: 'jan@peeters.be', aan: false })).status === 404);
    if (appRolActief()) {
      const n = await alsGebruiker(B, async (q) => ({ s: Number((await q('SELECT count(*)::int AS n FROM app.mail_contacten_scan')).rows[0].n), d: Number((await q('SELECT count(*)::int AS n FROM app.mail_domein_dns')).rows[0].n), a: Number((await q('SELECT count(*)::int AS n FROM app.mail_afzenders')).rows[0].n) }));
      check('RLS/database: app-rol als B ziet 0 rijen in scan, DNS en contacten ZONDER WHERE', n.s === 0 && n.d === 0 && n.a === 0, JSON.stringify(n));
      const ins = await alsGebruiker(B, async (q) => q(`INSERT INTO app.mail_contacten_scan (user_id, account_id, staat) VALUES ($1, 'x', 'wacht')`, [A])).then(() => 'ok', (e) => String(e.message));
      const ins2 = await alsGebruiker(B, async (q) => q(`INSERT INTO app.mail_domein_dns (user_id, domein, gegevens) VALUES ($1, 'x.example', '{}')`, [A])).then(() => 'ok', (e) => String(e.message));
      check('RLS/database: app-rol als B kan geen scan- of DNS-rij voor A schrijven', ins !== 'ok' && ins2 !== 'ok', `${ins} | ${ins2}`);
    } else console.log('OVERGESLAGEN RLS/database: geen aparte app-rol (draai met /tmp/run-test-rls.sh)');
    wie = A;

    // ================================================================ 6. UI (react-dom/server)
    nepBrowser();
    const { default: ContactenWeergave } = await import('../../src/afzenders/ContactenWeergave');
    const { default: ScanPaneel } = await import('../../src/afzenders/ScanPaneel');
    const { default: AfzendersBeheer } = await import('../../src/afzenders/AfzendersBeheer');
    const lijstData = (await roep('contacten/lijst', { filter: 'geschreven', zoek: 'peeters' })).b;
    const detailData = (await roep('contacten/detail', { adres: 'jan@peeters.be' })).b;
    const scanData = { ...(await contactenScanStand(A)), staat: 'bezig' as const, loopt: true, verwerkt: 60, schatting: 172 };
    const html = renderToString(createElement(ContactenWeergave, { lang: 'uk', begin: { lijst: lijstData, detail: detailData, scan: scanData, zoek: 'peeters', filter: 'geschreven', sorteer: 'naam', open: 'jan@peeters.be' } }));
    check('UI: kop «Контакти й відправники», zoekveld met de zoekterm, sortering gekozen', html.includes('Контакти й відправники') && /type="search"[^>]*value="peeters"/.test(html) && /<option value="naam" selected="">/.test(html));
    const chips = ['alle', 'geverifieerd', 'onbekend', 'verdacht', 'geschreven', 'officieel', 'contacten'].map((f) => new RegExp(`data-filter="${f}"[^>]*aria-pressed="(true|false)"`).exec(html)?.[1]);
    check('UI: alle filters zichtbaar (Перевірені, Не підтверджені, Підозрілі, Ви писали, Офіційні організації, Мої контакти), «Ви писали» actief', chips.every(Boolean) && chips[4] === 'true' && chips.filter((c) => c === 'true').length === 1 && ['Перевірені', 'Не підтверджені', 'Підозрілі', 'Ви писали', 'Офіційні організації'].every((x) => html.includes(x)), chips.join(','));
    check('UI: rij met naam, adres, niveau en «ви писали»', html.includes('data-contact-adres="jan@peeters.be"') && html.includes('aria-current="true"') && /ви писали \d+/.test(html) && html.includes('data-niveau='));
    check('UI: detailpaneel met acties (Підтвердити вручну, Позначити підозрілим, Прибрати з контактів, Ваші листи до нього)', ['Підтвердити вручну', 'Позначити підозрілим', 'Прибрати з контактів', 'Ваші листи до нього'].every((x) => html.includes(x)), '');
    check('UI: «Чому так» met bronnen (Ваш поштовий сервер / DNS / Перелік / Перевірка на підробку / Ваша пошта) en tijdstip', html.includes('Чому так') && ['DNS домену відправника', 'Перелік офіційних доменів', 'Перевірка на підробку', 'Ваша пошта'].every((x) => html.includes(x)) && /data-code="VERZONDEN"/.test(html));
    check('UI: voortgang met progressbar (35%), «Пауза» en «Зупинити», uitleg welke bronnen', /role="progressbar"[^>]*aria-valuenow="35"/.test(html) && html.includes('Пауза') && html.includes('Зупинити') && html.includes('Які джерела використовуються'));
    check('UI: geen «undefined»/«NaN» in de uitvoer, nl-variant ook', !/undefined|NaN/.test(html) && renderToString(createElement(ContactenWeergave, { lang: 'nl', begin: { lijst: lijstData, detail: detailData, scan: scanData, filter: 'geschreven' } })).includes('Contacten en afzenders'));
    const leegHtml = renderToString(createElement(ContactenWeergave, { lang: 'uk', begin: { lijst: { ...lijstData, contacten: [], totaal: 0 }, zoek: 'zzz' } }));
    check('UI: lege zoekopdracht → «Нічого не знайдено.»; geen detailpaneel', leegHtml.includes('Нічого не знайдено.') && !leegHtml.includes('data-contact-detail'));
    const sp = renderToString(createElement(ScanPaneel, { lang: 'uk', s: { ...scanData, staat: 'gepauzeerd', loopt: false } }));
    check('UI: gepauzeerd → «Продовжити» en «Перевірити все заново»', sp.includes('Продовжити') && sp.includes('Перевірити все заново') && !sp.includes('>Пауза<'));
    const ab = renderToString(createElement(AfzendersBeheer, { lang: 'uk' }));
    check('UI: instellingen → Безпека → Відправники verwijst naar «Контакти й відправники»', ab.includes('id="mail-settings-senders"') && ab.includes('Відкрити «Контакти й відправники»'));
  } finally {
    zetScanBron(null); zetScanPauze(250); zetDnsBron(null);
    for (const tbl of ['mail_afzenders', 'mail_domein_dns', 'mail_contacten_scan', 'mail_afzender_audit']) await sys.query(`DELETE FROM app.${tbl} WHERE user_id = ANY($1)`, [[A, B]]).catch(() => undefined);
    await closePool();
  }
  return einde();
}
