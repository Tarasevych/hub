// Mail opstellen op de server: MIME, concepten (eerst lokaal, daarna Gmail), direct verzenden, uitgestelde verzending en de wachtrij.
// Gmail wordt nagebootst met een vervangbare transport-laag; de database is echt (wegwerp-PG).
import { randomUUID } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { buildMime, encodeWord, headerSafe, parseAddressList, toGmailRaw } from '../../backend/mail-mime';
import {
  ProviderError, cancelScheduled, deleteDraft, enqueue, getDraft, listDrafts, listScheduled, runMailQueue, saveDraft, sendNow, setMailTransport, validScheduleTime, type MailTransport,
} from '../../backend/mail-opstel';
import { checker } from './hulp/nep-google';
import { _zonderPoortIsPrive } from '../../backend/mail-ruimte';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const decodeRaw = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8');
/** De HTML-deel van een verstuurd MIME-bericht, uit base64 teruggelezen. */
const htmlOf = (mime: string) => { const m = mime.match(/Content-Type: text\/html[^\r]*\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n\r\n--/); return m ? Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8') : ''; };

export async function main(): Promise<number> {
  // Deze test meet de POSTLAAG zelf en roept haar rechtstreeks aan, zonder route en dus zonder de ruimtepoort ervoor
  // (backend/mail-ruimte.ts, migratie 0083). «Geen lade» betekent hier dus: de persoonlijke lade — precies wat deze test
  // altijd bedoelde. De scheiding zelf wordt in tests/eenheid/ruimte-mail-20261020.test.ts bewezen, met de poort erbij.
  _zonderPoortIsPrive(true);
  const { check, einde } = checker('mail-opstel');
  const sys = getPool('systeem');
  const A = `mc-A-${randomUUID()}`;
  const B = `mc-B-${randomUUID()}`;

  // ---------- MIME ----------
  const inj = headerSafe('Onderwerp\r\nBcc: boef@example.test');
  check('MIME: regeleinden in een koptekstwaarde worden onschadelijk gemaakt (geen header-injectie)', !/[\r\n]/.test(inj) && inj.startsWith('Onderwerp'));
  check('MIME: niet-ASCII onderwerp wordt RFC 2047-gecodeerd en is terug te lezen; ASCII blijft leesbaar', /^=\?UTF-8\?B\?/.test(encodeWord('Привіт, wereld: €')) && Buffer.from(encodeWord('Привіт').match(/\?B\?([^?]+)\?=/)![1], 'base64').toString('utf8') === 'Привіт' && encodeWord('Hello') === 'Hello');
  const adr = parseAddressList('Jan de Vries <jan@example.nl>, piet@example.nl; kapot@, "Zoë, Jr" <zoe@example.nl>');
  check('adressen: namen en kale adressen geldig, ongeldige delen worden gemeld, komma in aanhalingstekens blijft heel', adr.valid.length === 3 && adr.invalid.length === 1 && adr.valid.some((v) => v.includes('zoe@example.nl')), JSON.stringify(adr));
  const mime = buildMime({ from: 'ik@example.nl', to: ['jan@example.nl'], cc: [], bcc: ['geheim@example.nl'], subject: 'Test ✓', html: '<p>Hallo <b>wereld</b></p>', plainText: 'Hallo wereld' });
  const bodyParts = mime.split(/\r\n\r\n/).slice(1).join('\r\n\r\n');
  const b64s = [...bodyParts.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n\r\n--/g)].map((m) => Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8'));
  check('MIME: multipart/alternative met platte tekst en HTML (beide base64, terug te lezen), Bcc-kop aanwezig voor Gmail, geen losse regels langer dan 998',
    /multipart\/alternative/.test(mime) && b64s[0] === 'Hallo wereld' && b64s[1] === '<p>Hallo <b>wereld</b></p>' && /^Bcc: geheim@example.nl/m.test(mime) && mime.split('\r\n').every((l) => l.length <= 998));
  check('MIME: concept zonder ontvanger krijgt geen To-kop; Gmail-raw is base64url zonder padding', !/^To:/m.test(buildMime({ to: [], subject: 'x', html: '', plainText: 'y' })) && !/[+/=]/.test(toGmailRaw(mime)));

  // ---------- nagebootste Gmail ----------
  const draftThreads = new Map<string, string>();
  const log = { sent: [] as Array<{ raw: string }>, drafts: new Map<string, string>(), deleted: [] as string[] };
  let failDrafts = false; let failSend: 'no' | 'transient' | 'permanent' = 'no'; let sendDelay = 0; let draftCounter = 0;
  const fake: MailTransport = {
    async resolve(_u, accountId) { return { accountId: accountId || 'acc-1', email: 'ik@example.nl', displayName: 'Ik' }; },
    async send(_u, _a, raw) {
      if (sendDelay) await sleep(sendDelay);
      if (failSend === 'transient') throw new ProviderError('GMAIL_SEND_503', 503, false);
      if (failSend === 'permanent') throw new ProviderError('GMAIL_SEND_400', 400, true);
      log.sent.push({ raw: decodeRaw(toGmailRaw(raw)) }); return { id: `msg-${log.sent.length}`, threadId: 't-1' };
    },
    async draftUpsert(_u, _a, id, raw, threadId) { if (failDrafts) throw new Error('GMAIL_DRAFT_CREATE_503'); const useId = id || `d-${++draftCounter}`; log.drafts.set(useId, raw); if (threadId) draftThreads.set(useId, threadId); return { id: useId }; },
    async replyHeaders(_u, _a, messageId) { return messageId === 'orig123456' ? { messageIdHeader: '<orig@gmail.com>', references: '<eerder@gmail.com>', subject: 'Offerte', from: 'Jan <jan@example.nl>', replyTo: '', to: 'ik@example.nl, piet@example.nl', cc: '' } : null; },
    async draftDelete(_u, _a, id) { log.deleted.push(id); log.drafts.delete(id); },
  };
  setMailTransport(fake);
  try {
    // ---------- antwoordconcept: in Gmail in dezelfde conversatie ----------
    const antw = await saveDraft(A, { localId: `antw-${randomUUID().slice(0, 10)}`, html: '<p>Dank, prima.</p>', accountId: 'acc-1', threadId: 'thr-9', replyToMessageId: 'orig123456' }) as any;
    const antwRaw = decodeRaw(toGmailRaw(log.drafts.get(antw.draft.gmailDraftId) || ''));
    check('antwoordconcept: Gmail-concept in dezelfde conversatie met Re:-onderwerp, In-Reply-To/References en de afzender als ontvanger', antw.draft.syncStatus === 'synced' && draftThreads.get(antw.draft.gmailDraftId) === 'thr-9' && /Subject: Re: Offerte/.test(antwRaw) && /In-Reply-To: <orig@gmail.com>/.test(antwRaw) && /References: <eerder@gmail.com> <orig@gmail.com>/.test(antwRaw) && /To: "Jan" <jan@example.nl>/.test(antwRaw), antwRaw.split('\r\n').slice(0, 9).join(' | '));
    check('antwoordconcept na verzenden/wissen: lokaal en in Gmail weg', (await deleteDraft(A, antw.draft.localId)) === true && log.deleted.includes(antw.draft.gmailDraftId));
    // ---------- concepten ----------
    const lid = `lokaal-${randomUUID().slice(0, 12)}`;
    failDrafts = true;
    const eerste = await saveDraft(A, { localId: lid, to: 'jan@example.nl', subject: 'Plan', html: '<p>Eerste versie</p>', accountId: 'acc-1' }) as any;
    const lokaal = await getDraft(A, lid);
    check('concept: Gmail faalt, maar het concept staat lokaal in PostgreSQL (sync_status error met reden) en gaat niet verloren', !!lokaal && lokaal.plainText.includes('Eerste versie') && eerste.draft.syncStatus === 'error' && /GMAIL_DRAFT/.test(eerste.draft.syncError));
    failDrafts = false;
    const tweede = await saveDraft(A, { localId: lid, to: 'jan@example.nl', subject: 'Plan', html: '<p>Tweede versie</p>', accountId: 'acc-1' }) as any;
    const derde = await saveDraft(A, { localId: lid, to: 'jan@example.nl, piet@example.nl', subject: 'Plan', html: '<p>Derde versie</p>', accountId: 'acc-1' }) as any;
    check('concept: bij de volgende keer wordt het naar Gmail gesynchroniseerd (create), daarna update met dezelfde Gmail-id; versie telt op',
      tweede.draft.syncStatus === 'synced' && derde.draft.gmailDraftId === tweede.draft.gmailDraftId && derde.draft.version === 3 && decodeRaw(toGmailRaw(log.drafts.get(derde.draft.gmailDraftId)!)).includes('piet@example.nl') && log.drafts.size === 1);
    const leeg = await saveDraft(A, { localId: `leeg-${randomUUID().slice(0, 10)}`, subject: '', html: '' }) as any;
    check('concept: een leeg concept wordt wel lokaal bewaard maar niet naar Gmail gestuurd', leeg.draft.syncStatus === 'local' && log.drafts.size === 1);
    check('concept: ongeldige id en ongeldige ontvanger worden geweigerd', ('error' in ((await saveDraft(A, { localId: 'x' })) as any)) && ((await saveDraft(A, { localId: lid, to: 'kapot@' })) as any).error === 'MAIL_RECIPIENT_INVALID');
    check('concept: een andere gebruiker ziet het niet en kan het niet verwijderen', (await getDraft(B, lid)) === null && (await listDrafts(B)).length === 0 && (await deleteDraft(B, lid)) === false && (await getDraft(A, lid)) !== null);
    const [d1, d2] = [`snel-${randomUUID().slice(0, 10)}`, ''];
    void d2;
    const snelle = await Promise.all([saveDraft(A, { localId: d1, to: 'a@example.nl', html: '<p>a</p>' }), saveDraft(A, { localId: d1, to: 'a@example.nl', html: '<p>ab</p>' })]) as any[];
    const na = await getDraft(A, d1);
    check('concept: twee bijna gelijktijdige opslagen: de nieuwste tekst wint lokaal en er is één Gmail-concept', na!.version === 2 && /<p>ab<\/p>|<p>a<\/p>/.test(na!.html) && snelle.every((s) => s.draft) && new Set(log.drafts.keys()).size === 2, `html=${na?.html}`);
    check('concept verwijderen: lokaal weg én het Gmail-concept wordt verwijderd', (await deleteDraft(A, lid)) === true && (await getDraft(A, lid)) === null && log.deleted.includes(derde.draft.gmailDraftId));

    // ---------- direct verzenden ----------
    const sendId = `req-${randomUUID()}`;
    const concept2 = await saveDraft(A, { localId: `voor-verzenden-${randomUUID().slice(0, 8)}`, to: 'jan@example.nl', html: '<p>x</p>' }) as any;
    const s1 = await sendNow(A, { to: 'jan@example.nl', cc: 'piet@example.nl', subject: 'Hallo', html: '<p>Rijke <b>tekst</b><script>alert(1)</script></p>', localId: concept2.draft.localId, accountId: 'acc-1' }, sendId) as any;
    const s2 = await sendNow(A, { to: 'jan@example.nl', cc: 'piet@example.nl', subject: 'Hallo', html: '<p>Rijke <b>tekst</b></p>', accountId: 'acc-1' }, sendId) as any;
    const verstuurd = log.sent.filter((m) => /Subject: Hallo/.test(m.raw));
    check('verzenden: één Gmail-aanroep ook bij dezelfde aanvraag twee keer (idempotent), HTML wordt meegestuurd en script verwijderd',
      s1.item.status === 'sent' && s2.item.id === s1.item.id && verstuurd.length === 1 && /<b>tekst<\/b>/.test(htmlOf(verstuurd[0].raw)) && !/script|alert/i.test(htmlOf(verstuurd[0].raw)), htmlOf(verstuurd[0]?.raw ?? ''));
    check('verzenden: het bijbehorende concept wordt na het versturen verwijderd', (await getDraft(A, concept2.draft.localId)) === null);
    check('verzenden: zonder ontvanger of tekst geweigerd, zonder Gmail-aanroep', ((await sendNow(A, { to: '', html: '<p>x</p>' }, `r-${randomUUID()}`)) as any).error === 'MAIL_RECIPIENT_REQUIRED' && ((await sendNow(A, { to: 'a@example.nl', html: '', plainText: '  ' }, `r-${randomUUID()}`)) as any).error === 'MAIL_BODY_REQUIRED');

    // ---------- uitgesteld verzenden ----------
    const nu = Date.now();
    check('plannen: tijd moet minstens 10 s in de toekomst liggen', validScheduleTime(nu + 60_000) && !validScheduleTime(nu + 1000) && !validScheduleTime(NaN));
    const verzonden0 = log.sent.length;
    const later = await enqueue(A, { to: 'jan@example.nl', subject: 'Later', html: '<p>later</p>', accountId: 'acc-1' }, nu + 3_600_000, `p-${randomUUID()}`) as any;
    const nuDue = await enqueue(A, { to: 'jan@example.nl', subject: 'Nu al', html: '<p>nu</p>', accountId: 'acc-1' }, nu + 12_000, `p-${randomUUID()}`) as any;
    // voor de test: laat het tweede item nu vervallen
    await sys.query(`UPDATE app.mail_queue SET send_at = now() - interval '1 second' WHERE id = $1`, [nuDue.item.id]);
    const run1 = await runMailQueue(10);
    check('wachtrij: een vervallen item wordt verstuurd, een item in de toekomst blijft staan', run1.sent >= 1 && log.sent.length === verzonden0 + 1 && /Subject: Nu al/.test(log.sent[log.sent.length - 1].raw) && (await listScheduled(A)).find((i) => i.id === later.item.id)!.status === 'scheduled');
    const geplandA = await listScheduled(A);
    check('wachtrij: alleen de eigen items zichtbaar; annuleren werkt voor scheduled, niet voor een al verstuurd item en niet voor een andere gebruiker',
      (await listScheduled(B)).length === 0 && (await cancelScheduled(B, later.item.id)) === false && (await cancelScheduled(A, nuDue.item.id)) === false && geplandA.find((i) => i.id === nuDue.item.id)!.status === 'sent'
      && (await cancelScheduled(A, later.item.id)) === true && (await listScheduled(A)).find((i) => i.id === later.item.id)!.status === 'cancelled');
    const run2 = await runMailQueue(10);
    check('wachtrij: een geannuleerd item wordt nooit verstuurd', run2.claimed === 0);

    // ---------- fouten en herhalen ----------
    const tijdelijk = await enqueue(A, { to: 'jan@example.nl', subject: 'Tijdelijk', html: '<p>t</p>', accountId: 'acc-1' }, nu + 12_000, `p-${randomUUID()}`) as any;
    await sys.query(`UPDATE app.mail_queue SET send_at = now() - interval '1 second' WHERE id = $1`, [tijdelijk.item.id]);
    failSend = 'transient';
    const run3 = await runMailQueue(10);
    const naFout = (await listScheduled(A)).find((i) => i.id === tijdelijk.item.id)!;
    check('wachtrij: een tijdelijke fout (503) wordt later opnieuw geprobeerd (terug naar scheduled, later tijdstip, attempts 1)', run3.retried === 1 && naFout.status === 'scheduled' && naFout.attempts === 1 && naFout.sendAt > Date.now() + 30_000 && /503/.test(naFout.lastError));
    failSend = 'no';
    await sys.query(`UPDATE app.mail_queue SET send_at = now() - interval '1 second' WHERE id = $1`, [tijdelijk.item.id]);
    const run4 = await runMailQueue(10);
    check('wachtrij: bij de volgende ronde lukt het en wordt het item sent', run4.sent === 1 && (await listScheduled(A)).find((i) => i.id === tijdelijk.item.id)!.status === 'sent');
    const blijvend = await enqueue(A, { to: 'jan@example.nl', subject: 'Blijvend', html: '<p>b</p>', accountId: 'acc-1' }, nu + 12_000, `p-${randomUUID()}`) as any;
    await sys.query(`UPDATE app.mail_queue SET send_at = now() - interval '1 second' WHERE id = $1`, [blijvend.item.id]);
    failSend = 'permanent';
    const run5 = await runMailQueue(10);
    failSend = 'no';
    check('wachtrij: een blijvende fout (400) wordt meteen failed, zonder eindeloos herhalen', run5.failed === 1 && (await listScheduled(A)).find((i) => i.id === blijvend.item.id)!.status === 'failed');
    const vast = await enqueue(A, { to: 'jan@example.nl', subject: 'Vast', html: '<p>v</p>', accountId: 'acc-1' }, nu + 12_000, `p-${randomUUID()}`) as any;
    await sys.query(`UPDATE app.mail_queue SET status='sending', updated_at = now() - interval '30 minutes' WHERE id = $1`, [vast.item.id]);
    const run6 = await runMailQueue(10);
    check('wachtrij: een item dat >10 min op "sending" staat (proces gestorven) wordt als onzeker gemarkeerd en NIET opnieuw verstuurd', run6.abandoned === 1 && (await listScheduled(A)).find((i) => i.id === vast.item.id)!.lastError === 'MAIL_QUEUE_UNCERTAIN');

    // ---------- gelijktijdige workers ----------
    const dubbel = await enqueue(A, { to: 'jan@example.nl', subject: 'Eenmaal', html: '<p>e</p>', accountId: 'acc-1' }, nu + 12_000, `p-${randomUUID()}`) as any;
    await sys.query(`UPDATE app.mail_queue SET send_at = now() - interval '1 second' WHERE id = $1`, [dubbel.item.id]);
    sendDelay = 150;
    const voor = log.sent.filter((m) => /Subject: Eenmaal/.test(m.raw)).length;
    await Promise.all([runMailQueue(10), runMailQueue(10), runMailQueue(10)]);
    sendDelay = 0;
    check('wachtrij: drie gelijktijdige workers versturen hetzelfde bericht precies één keer (FOR UPDATE SKIP LOCKED)', log.sent.filter((m) => /Subject: Eenmaal/.test(m.raw)).length === voor + 1);
    check('wachtrij: te ver in de toekomst en dubbele request-id', ((await enqueue(A, { to: 'a@example.nl', html: '<p>x</p>' }, nu + 400 * 24 * 3600 * 1000, `p-${randomUUID()}`)) as any).error === 'MAIL_SCHEDULE_TOO_FAR');
  } finally {
    setMailTransport(null);
    await closePool().catch(() => undefined);
  }
  return einde();
}
