// Afzenders per account (audit 18.10.2026, artefact-draad f252547a, migratie 0064):
//  1. regels: «geverifieerd» alleen handmatig of bekende dienst + DMARC/DKIM pass van de vertrouwde server; imitatie → verdacht;
//  2. samenvoegen: handmatig blijft handmatig, verdacht blijft verdacht;
//  3. API onder RLS (een ander account ziet niets), bevestigen/intrekken/vervangen/verwijderen met geschiedenis en logboek;
//  4. eerste controle in pagina's met een nep-Gmail: hervatbaar na een fout, niets dubbel geteld, niets geverifieerd zonder regel.
import { randomUUID } from 'node:crypto';
import { closePool, getPool, appRolActief } from '../../server/platform/pg';
import {
  adresVan, authGeslaagdVoor, bekendeDienstVoor, classificeer, lijktOpMerk, merkInNaam, parseAuthResults, GEEN_AUTH, AFZENDER_REDENEN,
} from '../../shared/mail-afzenders';
import { BEKENDE_DIENSTEN, GRATIS_MAILBOXEN } from '../../shared/mail-bekende-afzenders';
import {
  auditStand, auditWachten, mailAfzenderRoutes, samenvoegen, zetAuditPauze, zetGmailBron, type GmailBron, type GmailKop, type AfzenderRij,
} from '../../backend/mail-afzenders';
import { alsGebruiker } from '../../backend/ai-toestemmingen';
import { checker } from './hulp/nep-google';
import { _zonderPoortIsPrive } from '../../backend/mail-ruimte';

type Res = { statusCode: number; body: string };
const lees = (r: unknown) => { const x = r as Res; let b: any = {}; try { b = JSON.parse(x.body); } catch { /* geen json */ } return { status: x.statusCode, b }; };
const AR = (s: string) => [s];
const passGoogle = (d: string) => AR(`mx.google.com; dkim=pass header.i=@${d} header.s=x header.b=y; spf=pass (google.com: domain of bounce@${d} designates 1.2.3.4) smtp.mailfrom=bounce@${d}; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=${d}`);
const failGoogle = (d: string) => AR(`mx.google.com; dkim=fail header.i=@${d}; spf=fail smtp.mailfrom=x@evil.example; dmarc=fail (p=REJECT dis=REJECT) header.from=${d}`);
const kl = (from: string, auth = GEEN_AUTH, contacten?: Map<string, string[]>) => { const a = adresVan(from); return classificeer({ ...a, auth, contacten }); };

export async function main(): Promise<number> {
  // Deze test meet de POSTLAAG zelf en roept haar rechtstreeks aan, zonder route en dus zonder de ruimtepoort ervoor
  // (backend/mail-ruimte.ts, migratie 0083). «Geen lade» betekent hier dus: de persoonlijke lade — precies wat deze test
  // altijd bedoelde. De scheiding zelf wordt in tests/eenheid/ruimte-mail-20261020.test.ts bewezen, met de poort erbij.
  _zonderPoortIsPrive(true);
  const { check, einde } = checker('mail-afzenders');

  // ------------------------------------------------------------------ 1. adres en Authentication-Results
  const a1 = adresVan('"Amazon Web Services" <No-Reply@AmazonAWS.com>');
  check('adres: naam en adres uit «"Naam" <adres>», adres in kleine letters', a1.naam === 'Amazon Web Services' && a1.adres === 'no-reply@amazonaws.com' && a1.domein === 'amazonaws.com', JSON.stringify(a1));
  check('adres: los adres zonder naam; rommel → leeg adres', adresVan('jan@example.be').adres === 'jan@example.be' && adresVan('niet een adres').adres === '' && adresVan('').adres === '');
  const forged = parseAuthResults(['evil.example; dmarc=pass header.from=paypal.com', 'mx.google.com; dmarc=fail header.from=paypal.com']);
  check('auth: alleen de BOVENSTE regel telt, en alleen van mx.google.com (vervalste regel van de afzender → niet betrouwbaar)', forged.betrouwbaar === false && forged.dmarc === '', JSON.stringify(forged));
  const echt = parseAuthResults([...passGoogle('paypal.com'), 'evil.example; dmarc=fail header.from=paypal.com']);
  check('auth: bovenste mx.google.com-regel wordt gelezen (spf, dkim met domein, dmarc met header.from)', echt.betrouwbaar && echt.dmarc === 'pass' && echt.dmarcDomein === 'paypal.com' && echt.spf === 'pass' && echt.dkim[0]?.domein === 'paypal.com', JSON.stringify(echt));
  check('auth: geen kopregel → niets', parseAuthResults([]).betrouwbaar === false && parseAuthResults(undefined).dkim.length === 0);

  // ------------------------------------------------------------------ 2. classificeren
  check('regel: bekende dienst + DMARC pass van Gmail → geverifieerd (bron bekende-dienst)', (() => { const k = kl('PayPal <service@paypal.com>', parseAuthResults(passGoogle('paypal.com'))); return k.status === 'geverifieerd' && k.bron === 'bekende-dienst'; })());
  check('regel: subdomein van een merkdomein (accounts.google.com) + DMARC pass → geverifieerd', kl('Google <no-reply@accounts.google.com>', parseAuthResults(passGoogle('accounts.google.com'))).status === 'geverifieerd');
  check('regel: DKIM pass van hetzelfde organisatiedomein (email.apple.com ↔ apple.com) zonder DMARC-regel → geverifieerd', kl('Apple <no_reply@email.apple.com>', parseAuthResults(AR('mx.google.com; dkim=pass header.i=@apple.com; spf=pass smtp.mailfrom=x@email.apple.com'))).status === 'geverifieerd');
  check('regel: bekende dienst ZONDER authenticatie → onbekend (nooit «ziet er officieel uit»)', (() => { const k = kl('PayPal <service@paypal.com>'); return k.status === 'onbekend' && k.reden === 'BEKENDE_DIENST_ZONDER_AUTH'; })());
  check('regel: bekende dienst met alleen een vervalste Authentication-Results → onbekend', kl('PayPal <service@paypal.com>', forged).status === 'onbekend');
  check('regel: bekende dienst + DMARC fail bij Gmail → verdacht (DMARC_MISLUKT)', (() => { const k = kl('PayPal <service@paypal.com>', parseAuthResults(failGoogle('paypal.com'))); return k.status === 'verdacht' && k.reden === 'DMARC_MISLUKT'; })());
  check('regel: DMARC pass voor een ANDER domein telt niet (niet aligned) → onbekend', kl('PayPal <service@paypal.com>', parseAuthResults(AR('mx.google.com; dmarc=pass header.from=mailer.example'))).status === 'onbekend');
  check('regel: DKIM pass van een ander domein telt niet', kl('AWS <no-reply@amazonaws.com>', parseAuthResults(AR('mx.google.com; dkim=pass header.i=@sendgrid.net'))).status === 'onbekend');
  check('regel: onbekend domein met DMARC pass → onbekend (DMARC bewijst alleen het domein)', kl('Shop <info@winkel.example>', parseAuthResults(passGoogle('winkel.example'))).status === 'onbekend');
  check('regel: gratis mailbox blijft onbekend, ook met DMARC pass', (() => { const k = kl('Jan <jan@gmail.com>', parseAuthResults(passGoogle('gmail.com'))); return k.status === 'onbekend' && k.reden === 'GRATIS_MAILBOX'; })());
  check('imitatie: «PayPal» als naam vanaf gmail.com → verdacht (NAAM_MERK_ANDER_DOMEIN)', (() => { const k = kl('PayPal <paypal.service.team@gmail.com>'); return k.status === 'verdacht' && k.reden === 'NAAM_MERK_ANDER_DOMEIN' && k.merk === 'PayPal'; })());
  check('imitatie: merknaam + geslaagde DMARC van het eigen (vreemde) domein blijft verdacht', kl('Amazon Klantenservice <help@amzn-support.example>', parseAuthResults(passGoogle('amzn-support.example'))).status === 'verdacht');
  check('imitatie: lijkende domeinen (paypa1.com, paypal-security.net, paypal.com.evil.ru, amaz0n.de, Cyrillisch «раураl.com») → verdacht',
    ['Support <a@paypa1.com>', 'Support <a@paypal-security.net>', 'Support <a@paypal.com.evil.ru>', 'Support <a@amaz0n.de>', 'Support <a@раураl.com>'].every((f) => { const k = kl(f); return k.status === 'verdacht' && k.reden === 'DOMEIN_LIJKT_OP_MERK'; }),
    ['paypa1.com', 'paypal-security.net', 'paypal.com.evil.ru', 'amaz0n.de', 'раураl.com'].map((d) => `${d}:${lijktOpMerk(d)?.id || '-'}`).join(' '));
  const puny = new URL('http://раураl.com').hostname;
  check('imitatie: hetzelfde homoglief-domein in punycode (zoals Gmail het kan tonen) → verdacht; punycode wordt ontcijferd', kl(`PayPal Team <service@${puny}>`).status === 'verdacht' && kl(`Support <a@${puny}>`).reden === 'DOMEIN_LIJKT_OP_MERK', puny);
  check('imitatie: merklabel op een vreemd TLD (paypal.xyz, ing.top) → verdacht', kl('X <a@paypal.xyz>').status === 'verdacht' && kl('X <a@ing.top>').status === 'verdacht');
  check('geen vals alarm: echte (sub)domeinen, gewone domeinen en «Ing.» als titel', !lijktOpMerk('accounts.google.com') && !lijktOpMerk('email.apple.com') && !lijktOpMerk('bouwbedrijf.be') && !lijktOpMerk('googlemail.com')
    && kl('Ing. Jan Peeters <jan@bouwbedrijf.be>').status === 'onbekend' && kl('Claude Dubois <claude@atelier.example>').status === 'onbekend' && kl('Marketing Team <news@winkel.example>').status === 'onbekend');
  check('imitatie: «ING België» vanaf een ander domein → verdacht (hoofdlettergevoelig merk)', kl('ING België <info@ing-beveiliging.example>').status === 'verdacht' && !!merkInNaam('ING Bank') && !merkInNaam('Ing. Jan'));
  check('imitatie: weergavenaam met een ander adres erin → verdacht (NAAM_BEVAT_ANDER_ADRES)', kl('service@paypal.com <x@evil.example>').reden === 'NAAM_BEVAT_ANDER_ADRES');
  const contacten = new Map([['jan peeters', ['jan@peeters.be']]]);
  check('imitatie: naam van een bevestigd contact met een ander adres → verdacht; het echte adres niet', kl('Jan Peeters <jan.peeters@gmail.com>', GEEN_AUTH, contacten).reden === 'NAAM_VAN_CONTACT_ANDER_ADRES' && kl('Jan Peeters <jan@peeters.be>', GEEN_AUTH, contacten).status === 'onbekend');
  // Live-audit 19.10 (F3): vals «Підозрілий» voor noreply@tm.openai.com (contact «OpenAI» = noreply@openai.com).
  const contactenOrg = new Map([['jan peeters', ['jan@peeters.be']], ['paypal', ['service@paypal.com']]]);
  check('F3: zelfde organisatiedomein als het contactadres (nieuws.peeters.be ↔ peeters.be) is geen contact-imitatie', kl('Jan Peeters <jan@nieuws.peeters.be>', GEEN_AUTH, contactenOrg).reden !== 'NAAM_VAN_CONTACT_ANDER_ADRES');
  check('F3: officieel merkdomein + aligned DMARC pass gaat vóór de contact-naamregel → geverifieerd', (() => { const k = kl('PayPal <noreply@tm.paypal.com>', parseAuthResults(passGoogle('tm.paypal.com')), contactenOrg); return k.status === 'geverifieerd' && k.reden === 'BEKENDE_DIENST_DMARC'; })());
  check('F3: contactnaam vanaf een vreemd domein zonder bewijs blijft verdacht', kl('Jan Peeters <jan.peeters@outlook.com>', GEEN_AUTH, contactenOrg).reden === 'NAAM_VAN_CONTACT_ANDER_ADRES');
  check('lijst: geen gratis mailbox als bekende dienst; elke dienst heeft een bron; geen dubbele domeinen',
    BEKENDE_DIENSTEN.every((d) => d.bron.length > 10 && d.domeinen.every((x) => !GRATIS_MAILBOXEN.includes(x.domein))) && new Set(BEKENDE_DIENSTEN.flatMap((d) => d.domeinen.map((x) => x.domein))).size === BEKENDE_DIENSTEN.flatMap((d) => d.domeinen).length
    && !bekendeDienstVoor('gmail.com') && !bekendeDienstVoor('bucket.s3.amazonaws.com') && !!bekendeDienstVoor('amazonaws.com'));
  check('teksten: elke reden-code heeft uk en nl', Object.values(AFZENDER_REDENEN).every(([uk, nl]) => uk.length > 10 && nl.length > 10));
  check('auth: authGeslaagdVoor vereist betrouwbaarheid', !authGeslaagdVoor({ ...parseAuthResults(passGoogle('paypal.com')), betrouwbaar: false }, 'paypal.com'));

  // ------------------------------------------------------------------ 3. samenvoegen (puur)
  const leeg = (status: AfzenderRij['status'], bron: AfzenderRij['bron'] = null): AfzenderRij => ({ adres: 'x@paypal.com', naam: 'X', domein: 'paypal.com', status, bron, reden: bron === 'handmatig' ? 'HANDMATIG' : '', merk: '', bewijs: {}, eersteOp: null, laatsteOp: null, aantal: 3, notitie: '', historie: [], geverifieerdOp: null, geverifieerdDoor: null, bijgewerktOp: '' });
  const verd = { status: 'verdacht' as const, bron: null, reden: 'DMARC_MISLUKT', merk: 'PayPal' };
  const s1 = samenvoegen(leeg('geverifieerd', 'handmatig'), { adres: 'x@paypal.com', naam: 'X', domein: 'paypal.com', klass: verd, auth: parseAuthResults(failGoogle('paypal.com')), tijd: Date.now(), telt: true });
  check('samenvoegen: handmatig bevestigd blijft bevestigd na een vervalst bericht; poging geteld en in de geschiedenis', s1.status === 'geverifieerd' && s1.bron === 'handmatig' && s1.bewijs.verdachtePogingen === 1 && s1.bewijs.fail === 1 && s1.aantal === 4 && s1.historie.some((h) => h.op === 'verdachte-poging'));
  const s2 = samenvoegen(leeg('verdacht'), { adres: 'x@paypal.com', naam: 'X', domein: 'paypal.com', klass: { status: 'onbekend', bron: null, reden: 'NIET_BEVESTIGD', merk: '' }, auth: GEEN_AUTH, tijd: 0, telt: true });
  check('samenvoegen: verdacht blijft verdacht (een «schoon» bericht wist imitatie niet uit)', s2.status === 'verdacht');
  const s3 = samenvoegen(leeg('onbekend'), { adres: 'x@paypal.com', naam: 'X', domein: 'paypal.com', klass: { status: 'geverifieerd', bron: 'bekende-dienst', reden: 'BEKENDE_DIENST_DMARC', merk: 'PayPal' }, auth: parseAuthResults(passGoogle('paypal.com')), tijd: Date.now(), telt: false });
  check('samenvoegen: onbekend → geverifieerd via regel, met geschiedenis «automatisch» en zonder extra telling (telt=false)', s3.status === 'geverifieerd' && s3.geverifieerdDoor === 'systeem' && s3.aantal === 3 && s3.historie.at(-1)?.op === 'automatisch');
  const automatischeVerdenking = { ...leeg('verdacht'), reden: 'BEKENDE_DIENST_ZONDER_PASS' };
  const schoon = { status: 'geverifieerd' as const, bron: 'bekende-dienst' as const, reden: 'BEKENDE_DIENST_DMARC', merk: 'PayPal' };
  const s4 = samenvoegen(automatischeVerdenking, { adres: 'x@paypal.com', naam: 'X', domein: 'paypal.com', klass: schoon, auth: parseAuthResults(passGoogle('paypal.com')), tijd: Date.now(), telt: false });
  check('samenvoegen: automatische verdenking wijkt voor een geslaagde verificatie', s4.status === 'geverifieerd' && s4.reden === 'BEKENDE_DIENST_DMARC');
  const handmatigVerdacht = { ...leeg('verdacht'), reden: 'HANDMATIG_VERDACHT' };
  const s5 = samenvoegen(handmatigVerdacht, { adres: 'x@paypal.com', naam: 'X', domein: 'paypal.com', klass: schoon, auth: parseAuthResults(passGoogle('paypal.com')), tijd: Date.now(), telt: false });
  check('samenvoegen: handmatige verdenking blijft staan', s5.status === 'verdacht' && s5.reden === 'HANDMATIG_VERDACHT');

  // ------------------------------------------------------------------ 4. API + RLS
  const sys = getPool('systeem');
  const A = `afz-a-${randomUUID()}`, B = `afz-b-${randomUUID()}`;
  let wie = A, dienst = 'mail';
  const sessie = async () => ({ user: { id: wie, status: 'approved', role: 'member' }, service: dienst });
  const R = mailAfzenderRoutes({ requireSession: sessie as never });
  const roep = async (pad: string, body: Record<string, unknown> = {}) => lees(await (R[`POST /api/owner/mail/afzenders/${pad}`][0] as (c: unknown) => Promise<unknown>)({ event: {}, body }));

  // nep-Gmail: berichten per account
  const berichten: Array<{ id: string; kop: GmailKop }> = [];
  const kopVoor = new Map<string, GmailKop>();
  let lijstFout: ((pageToken: string) => string | null) | null = null;
  let kopAanroepen = 0;
  const nep: GmailBron = {
    async accounts() { return [{ id: 'acc-1', email: 'eigen@example.test' }]; },
    async lijst(_u, _a, pageToken, max) {
      const fout = lijstFout?.(pageToken); if (fout) throw new Error(fout);
      const start = pageToken ? Number(pageToken.slice(1)) : 0, ids = berichten.slice(start, start + max).map((b) => b.id), volgende = start + max;
      return { ids, next: volgende < berichten.length ? `p${volgende}` : '' };
    },
    async kop(_u, _a, id) { kopAanroepen += 1; return kopVoor.get(id) || berichten.find((b) => b.id === id)?.kop || null; },
  };
  zetGmailBron(nep); zetAuditPauze(0);
  try {
    dienst = 'hub';
    check('route: alleen met een mail-sessie (andere dienst → 403)', (await roep('lijst')).status === 403);
    dienst = 'mail';

    kopVoor.set('m-paypal', { from: 'PayPal <service@paypal.be>', auth: passGoogle('paypal.be'), tijd: Date.now() - 1000 });
    const st = await roep('status', { items: [
      { from: 'PayPal <paypal.team@gmail.com>' }, { from: 'PayPal <service@paypal.be>', messageId: 'm-paypal', accountId: 'acc-1' }, { from: 'Lopke <lopke@cursisten.example>' }, { from: '' },
    ] });
    const it = st.b.items || [];
    check('status: imitatie meteen verdacht (zonder Gmail), bekende dienst via luie controle geverifieerd, rest onbekend met adres', st.status === 200 && it[0]?.status === 'verdacht' && it[1]?.status === 'geverifieerd' && it[1]?.bron === 'bekende-dienst' && it[2]?.status === 'onbekend' && it[2]?.adres === 'lopke@cursisten.example' && it[3]?.reden === 'GEEN_ADRES', JSON.stringify(it));
    const aanroepenNa1 = kopAanroepen;
    await roep('status', { items: [{ from: 'PayPal <service@paypal.be>', messageId: 'm-paypal', accountId: 'acc-1' }] });
    check('status: luie controle één keer per bericht (daarna uit de database, geen nieuwe Gmail-aanroep)', kopAanroepen === aanroepenNa1);
    const opgeslagen = (await sys.query('SELECT status, bron, bewijs FROM app.mail_afzenders WHERE user_id = $1 AND adres = $2', [A, 'service@paypal.be'])).rows[0];
    check('status: luie controle bewaard met bewijs (DMARC pass) — telt geen bericht (aantal blijft 0 tot de audit)', opgeslagen?.status === 'geverifieerd' && opgeslagen?.bewijs?.pass === 1, JSON.stringify(opgeslagen));

    check('bevestigen: zonder uitdrukkelijke bevestiging geweigerd', (await roep('verifieren', { from: 'Lopke <lopke@cursisten.example>' })).b.error === 'AFZENDER_BEVESTIG_VEREIST');
    const v1 = await roep('verifieren', { from: 'Lopke <lopke@cursisten.example>', naam: 'Lopke Van Acker', notitie: 'docent', bevestig: true });
    check('bevestigen: handmatig → geverifieerd met naam, notitie en geschiedenis', v1.status === 200 && v1.b.afzender?.status === 'geverifieerd' && v1.b.afzender?.bron === 'handmatig' && v1.b.afzender?.notitie === 'docent' && v1.b.afzender?.historie?.at(-1)?.op === 'handmatig-bevestigd', JSON.stringify(v1.b));
    const v2 = await roep('verifieren', { from: 'PayPal <paypal.team@gmail.com>', bevestig: true });
    check('bevestigen: verdacht vraagt een tweede bevestiging (409), met ookVerdacht wel', v2.status === 409 && v2.b.error === 'AFZENDER_VERDACHT_BEVESTIG' && (await roep('verifieren', { from: 'PayPal <paypal.team@gmail.com>', bevestig: true, ookVerdacht: true })).b.afzender?.status === 'geverifieerd');
    const sp = await roep('status', { items: [{ from: 'Lopke Van Acker <lopke.vanacker@gmail.com>' }] });
    check('na bevestigen: zelfde naam met een ander adres → verdacht (contact-imitatie)', sp.b.items?.[0]?.status === 'verdacht' && sp.b.items?.[0]?.reden === 'NAAM_VAN_CONTACT_ANDER_ADRES', JSON.stringify(sp.b.items));

    const l = await roep('lijst', { status: 'geverifieerd' });
    check('lijst: filter op status, tellers per status, zonder geschiedenis in de lijst', l.status === 200 && l.b.afzenders.length === 3 && l.b.tellers.geverifieerd === 3 && l.b.afzenders.every((x: any) => x.historie === undefined), JSON.stringify(l.b.tellers));
    check('lijst: zoeken op domein', (await roep('lijst', { zoek: 'cursisten' })).b.afzenders.length === 1);

    // RLS: account B ziet niets van A — via de route en (met app-rol) ook rechtstreeks zonder WHERE.
    wie = B;
    check('RLS/route: een ander account ziet een lege database', (await roep('lijst')).b.totaal === 0 && (await roep('detail', { adres: 'lopke@cursisten.example' })).status === 404);
    check('RLS/route: een ander account kan het adres van A niet intrekken of verwijderen', (await roep('intrekken', { adres: 'lopke@cursisten.example' })).status === 404 && (await roep('verwijderen', { adres: 'lopke@cursisten.example' })).status === 404);
    if (appRolActief()) {
      const n = await alsGebruiker(B, async (q) => Number((await q('SELECT count(*)::int AS n FROM app.mail_afzenders')).rows[0].n));
      check('RLS/database: app-rol als B ziet 0 rijen ZONDER WHERE (policy mail_afzenders_eigen)', n === 0, String(n));
      const ins = await alsGebruiker(B, async (q) => q(`INSERT INTO app.mail_afzenders (user_id, adres, domein) VALUES ($1, 'x@y.example', 'y.example')`, [A])).then(() => 'ok', (e) => String(e.message));
      check('RLS/database: app-rol als B kan geen rij voor A schrijven', ins !== 'ok', ins);
    } else console.log('OVERGESLAGEN RLS/database: geen aparte app-rol (draai met /tmp/run-test-rls.sh)');
    wie = A;

    const iv = await roep('intrekken', { adres: 'lopke@cursisten.example', reden: 'test' });
    check('intrekken: geverifieerd → onbekend (INGETROKKEN), geschiedenis', iv.b.afzender?.status === 'onbekend' && iv.b.afzender?.reden === 'INGETROKKEN' && iv.b.afzender?.historie?.at(-1)?.op === 'ingetrokken');
    await roep('verifieren', { adres: 'lopke@cursisten.example', bevestig: true });
    const bw = await roep('bijwerken', { adres: 'lopke@cursisten.example', naam: 'Lopke V.', notitie: '' });
    check('bijwerken: naam en notitie', bw.b.afzender?.naam === 'Lopke V.' && bw.b.afzender?.notitie === '');
    const vv = await roep('vervangen', { adres: 'lopke@cursisten.example', nieuwAdres: 'Lopke@CVOFocus.example' });
    const oud = await roep('detail', { adres: 'lopke@cursisten.example' });
    check('vervangen: bevestiging verhuist naar het nieuwe adres, het oude wordt onbekend; beide met geschiedenis', vv.b.afzender?.adres === 'lopke@cvofocus.example' && vv.b.afzender?.status === 'geverifieerd' && oud.b.afzender?.status === 'onbekend' && oud.b.afzender?.historie?.some((h: any) => h.op === 'vervangen-door'), JSON.stringify([vv.b, oud.b.afzender?.status]));
    check('vervangen: ongeldig of hetzelfde adres geweigerd', (await roep('vervangen', { adres: 'lopke@cvofocus.example', nieuwAdres: 'geen-adres' })).b.error === 'AFZENDER_ADRES_ONGELDIG' && (await roep('vervangen', { adres: 'lopke@cvofocus.example', nieuwAdres: 'lopke@cvofocus.example' })).b.error === 'AFZENDER_ZELFDE_ADRES');
    check('verwijderen: weg uit de database', (await roep('verwijderen', { adres: 'lopke@cursisten.example' })).status === 200 && (await roep('detail', { adres: 'lopke@cursisten.example' })).status === 404);
    const log = (await sys.query(`SELECT action, details::text AS d FROM app.audit WHERE owner_id = $1 AND action LIKE 'owner.mail.afzender.%' ORDER BY seq`, [A])).rows;
    check('logboek: elke wijziging staat erin (geverifieerd, ingetrokken, bijgewerkt, vervangen, verwijderd)', ['geverifieerd', 'ingetrokken', 'bijgewerkt', 'vervangen', 'verwijderd'].every((x) => log.some((r) => r.action === `owner.mail.afzender.${x}`)), log.map((r) => r.action).join(','));
    check('logboek: nooit het volledige adres (alleen domein + hash)', log.every((r) => !/lopke@|paypal\.team@/i.test(r.d)), log.map((r) => r.d).join(' | ').slice(0, 300));

    // ------------------------------------------------------------------ 5. eerste controle (audit) met nep-Gmail
    await sys.query('DELETE FROM app.mail_afzenders WHERE user_id = $1', [A]);
    for (let i = 0; i < 120; i++) {
      const soort = i % 4;
      const kop: GmailKop = soort === 0 ? { from: 'Amazon Web Services <no-reply@amazonaws.com>', auth: passGoogle('amazonaws.com'), tijd: 1_700_000_000_000 + i * 1000 }
        : soort === 1 ? { from: 'AWS Billing <aws-billing@amazon-aws.example>', auth: passGoogle('amazon-aws.example'), tijd: 1_700_000_000_000 + i * 1000 }
          : soort === 2 ? { from: `Klant ${i % 3} <klant${i % 3}@example.be>`, auth: passGoogle('example.be'), tijd: 1_700_000_000_000 + i * 1000 }
            : { from: 'PayPal <service@paypal.com>', auth: AR('evil.example; dmarc=pass header.from=paypal.com'), tijd: 1_700_000_000_000 + i * 1000 };
      berichten.push({ id: `b${i}`, kop });
    }
    // Pagina 2 (token p50) faalt steeds met een tijdelijke limiet → na de herhalingen staat de controle op «fout».
    lijstFout = (tok) => (tok === 'p50' ? 'GOOGLE_MAIL_RATE_LIMITED' : null);
    // Draad f252547a punt 4: oranje pastilles pas na de eerste volledige controle. Oud gedrag: status gaf geen «markeringen» → altijd oranje.
    const st0 = await roep('status', { items: [{ from: 'Klant 0 <klant0@example.be>', messageId: '', accountId: '' }] });
    check('markeringen: vóór de eerste volledige controle uit (geen oranje «не перевірено» in de lijst)', st0.status === 200 && st0.b.markeringen === false, JSON.stringify(st0.b).slice(0, 200));
    const s0 = await roep('audit/start', { limiet: 5000 });
    check('audit: gestart (bezig)', s0.status === 200 && s0.b.audit?.staat === 'bezig', JSON.stringify(s0.b));
    await auditWachten(A);
    const naFout = await auditStand(A);
    check('audit: tijdelijke Gmail-limiet → na herhalingen «fout» met code, na pagina 1 (50 berichten), hervatbaar', naFout.staat === 'fout' && naFout.fout === 'GOOGLE_MAIL_RATE_LIMITED' && naFout.verwerkt === 50, JSON.stringify(naFout));
    const naFoutStatus = await roep('status', { items: [] });
    check('markeringen: een afgebroken controle («fout») zet ze NIET aan', naFout.staat === 'fout' && naFoutStatus.b.markeringen === false, JSON.stringify(naFoutStatus.b));
    const tellingNaPagina1 = Number((await sys.query(`SELECT aantal FROM app.mail_afzenders WHERE user_id = $1 AND adres = 'no-reply@amazonaws.com'`, [A])).rows[0]?.aantal || 0);
    lijstFout = null;
    const hv = await roep('audit/start', { hervatten: true });
    await auditWachten(A);
    const klaar = await auditStand(A);
    const naKlaarStatus = await roep('status', { items: [] });
    check('markeringen: na de eerste volledige controle aan', klaar.staat === 'klaar' && naKlaarStatus.b.markeringen === true, JSON.stringify(naKlaarStatus.b));
    check('audit: hervat vanaf pagina 2 en wordt klaar met precies 120 berichten', hv.b.audit?.staat === 'bezig' && klaar.staat === 'klaar' && klaar.verwerkt === 120, JSON.stringify(klaar));
    const rij = async (adres: string) => (await sys.query('SELECT status, bron, reden, aantal FROM app.mail_afzenders WHERE user_id = $1 AND adres = $2', [A, adres])).rows[0];
    const aws = await rij('no-reply@amazonaws.com'), nepAws = await rij('aws-billing@amazon-aws.example'), klant = await rij('klant0@example.be'), pp = await rij('service@paypal.com');
    check('audit: niets dubbel geteld na hervatten (30 berichten van AWS, 13 na pagina 1)', aws?.aantal === 30 && tellingNaPagina1 === 13, `${aws?.aantal} / ${tellingNaPagina1}`);
    check('audit: AWS (bekend + DMARC pass) → geverifieerd; «AWS Billing» van een ander domein → verdacht', aws?.status === 'geverifieerd' && aws?.bron === 'bekende-dienst' && nepAws?.status === 'verdacht', JSON.stringify([aws, nepAws]));
    check('audit: gewone afzenders met DMARC pass → onbekend; PayPal met alleen een vervalste kopregel → onbekend (niet geverifieerd)', klant?.status === 'onbekend' && pp?.status === 'onbekend' && pp?.reden === 'BEKENDE_DIENST_ZONDER_AUTH', JSON.stringify([klant, pp]));
    const totaal = (await sys.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'geverifieerd')::int AS g FROM app.mail_afzenders WHERE user_id = $1`, [A])).rows[0];
    check('audit: tellers in de voortgang kloppen met de database (6 adressen, 1 geverifieerd)', totaal.n === 6 && totaal.g === 1 && klaar.adressen === 6 && klaar.geverifieerd === 1, JSON.stringify([totaal, klaar]));
    const auditLog = (await sys.query(`SELECT action FROM app.audit WHERE owner_id = $1 AND action LIKE 'owner.mail.afzender.audit.%'`, [A])).rows.map((r) => r.action);
    check('audit: start en einde in het logboek', auditLog.includes('owner.mail.afzender.audit.gestart') && auditLog.includes('owner.mail.afzender.audit.klaar'));
    // Handmatige bevestiging overleeft een nieuwe controle.
    await roep('verifieren', { adres: 'klant1@example.be', bevestig: true });
    await roep('audit/start', {}); await auditWachten(A);
    check('audit: opnieuw uitvoeren draait een handmatige bevestiging niet terug', (await rij('klant1@example.be'))?.status === 'geverifieerd');
    // Stoppen tijdens het lopen → gepauzeerd.
    const traag: GmailBron = { ...nep, async kop(u, a, id) { await new Promise((r) => setTimeout(r, 20)); return nep.kop(u, a, id); } };
    zetGmailBron(traag); zetAuditPauze(5);
    await roep('audit/start', {});
    const gestopt = await roep('audit/stop');
    check('audit: stoppen tijdens het lopen → gepauzeerd (hervatbaar)', gestopt.b.audit?.staat === 'gepauzeerd' && gestopt.b.audit?.loopt === false, JSON.stringify(gestopt.b.audit));
    zetGmailBron(nep);
    check('audit: geen account → 409', await (async () => { zetGmailBron({ ...nep, async accounts() { return []; } }); const r = await roep('audit/start', { hervatten: true }); zetGmailBron(nep); return r.status === 409; })());
  } finally {
    zetGmailBron(null); zetAuditPauze(300);
    await sys.query('DELETE FROM app.mail_afzenders WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query('DELETE FROM app.mail_afzender_audit WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await closePool();
  }
  return einde();
}
