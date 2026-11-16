// SEC-002 (12.11.2026), groep g10c: regressie- en bewijssuite voor de bevindingen autorisatie-02/06/08, post-02/03/04/09/10/11,
// keten-config-04, ai-mcp-08 en ai-mcp-13. Elk blok toont de fout vóór de patch (zie het verslag) en bewaakt de patch erna.
// Alleen verzonnen geheimen; er gaat niets naar buiten (fetch wordt onderschept of niet gebruikt).
import { checker } from './hulp/nep-google';
import { mailHtmlToPlainText, normalizeOutboundMailHtml } from '../../backend/mail-opstel-html';
import { _mailBrowserIntern, createGoogleSuiteMailBrowserRoutes } from '../../backend/google-suite-mail-browser';
import { isMutationPath, SCHRIJFWACHT, wrapFactoryMutations } from '../../backend/rbac';
import { closePool, getPool } from '../../server/platform/pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { db } from '../../server/platform/db';
import { runGoogleSuiteMailStateOutbox } from '../../backend/google-suite-mail-browser';
import { afmeldBevestiging } from '../../src/mail-afmelddoel';
import { afdrukSoort, afdrukUrl } from '../../src/mail-bijlage-afdruk';
import { normalizeMailAddress } from '../../src/mail-email';
import { annuleerGeplandeMail, enqueue, MAX_HTML_INVOER, runMailQueue, saveDraft, setMailTransport, type MailTransport } from '../../backend/mail-opstel';
import { untrustedEmailText, userTextBlock } from '../../backend/ai-mail-assistent';
import { MAX_PAKKET, pakketToegestaan, pakketUitvoeren } from '../../backend/mcp-pakket';
import { leesGebruikerCaps, leesStaat, vergeetStaat } from '../../backend/ai-site-schakelaars';
import { extractSignificantKeywords, stripTrackingAndSecrets } from '../../shared/ai-vertaling';
import { _vertalingIntern, AI_VERTALING_MAX, begrensAiVertalingInvoer } from '../../backend/ai-vertaling-routes';
import { gebruikerVeldenZetten, toegangAanvraagStatus } from '../../backend/gebruiker-schrijven';
import { nepGoogle } from './hulp/nep-google';
import { _zonderPoortIsPrive } from '../../backend/mail-ruimte';
import { classifyMailMessage } from '../../shared/mail-slimme-inbox';
import { antwoordNodig } from '../../shared/ai-bronnen';
import { registreerMelder } from '../../backend/melder';
import { roepTool } from '../../backend/mcp-connector';
import { accountVerwijderdZetten } from '../../backend/gebruiker-schrijven';

/** Meet één synchrone aanroep in milliseconden. */
const meet = <T>(f: () => T): { ms: number; uit: T } => { const t = performance.now(); const uit = f(); return { ms: performance.now() - t, uit }; };
// Tijdsbudget per pad. Vóór de patch duurden deze invoeren seconden tot minuten (kwadratisch); lineair is het enkele milliseconden.
// Ruim genomen, omdat de testmachine door meerdere processen wordt gedeeld.
const BUDGET_MS = Number(process.env.SEC002_BUDGET_MS || 1500);
// SEC002_KLEIN=1: kleinere invoer, om de fout vóór de patch te tonen zonder minutenlang te wachten.
const KLEIN = process.env.SEC002_KLEIN === '1';

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g10c-20261112');

  // ---------------------------------------------------------------- post-02 & keten-config-04: uitgaande HTML en adreslijst lineair
  {
    const n = (groot: number, klein: number) => (KLEIN ? klein : groot);
    const gevallen: Array<[string, string, number?]> = [
      ['«<» × 250 000 (tokenizer)', '<'.repeat(n(250_000, 60_000))],
      ['«<» × 400 000 bij max 400 000 (AI-assistent)', '<'.repeat(n(400_000, 60_000)), 400_000],
      ['«<script>» zonder sluiting, 12 MB (vóór het afkappen)', '<script>'.repeat(n(1_500_000, 60_000))],
      ['«<svg » zonder «>», 2 MB', '<svg '.repeat(n(400_000, 40_000))],
      ['«<!--[if mso]>» zonder einde, 1 MB', '<!--[if mso]>'.repeat(n(80_000, 30_000))],
      ['«<style>…» met veel losse «</»', `<style>${'</'.repeat(n(500_000, 40_000))}`],
      ['één tag met een attribuutnaam van 240 000 tekens', `<p ${'a'.repeat(n(240_000, 60_000))}>x</p>`],
      ['één tag met 240 000 spaties', `<${' '.repeat(n(240_000, 60_000))}>x`],
      ['240 000 spaties in de tekst (platte tekst)', `<p>${' '.repeat(n(240_000, 60_000))}x</p>`],
      ['240 000 tabs gevolgd door tekst', `<p>${'\t'.repeat(n(240_000, 60_000))}x</p><p>y</p>`],
      ['veel attributen zonder waarde', `<td ${'a= '.repeat(n(80_000, 20_000))}>x</td>`],
      ['style met 240 000 «url » zonder haakje', `<p style="${'url '.repeat(n(60_000, 15_000))}">x</p>`],
    ];
    for (const [naam, invoer, max] of gevallen) {
      const { ms, uit } = meet(() => (max ? normalizeOutboundMailHtml(invoer, max) : normalizeOutboundMailHtml(invoer)));
      check(`post-02/keten-config-04: normalizeOutboundMailHtml lineair — ${naam}`, ms < BUDGET_MS && typeof uit === 'string' && uit.length <= (max || 250_000) * 6, `${ms.toFixed(0)} ms`);
    }
    const plat: Array<[string, string]> = [
      ['«<» × 100 000', '<'.repeat(n(100_000, 50_000))],
      ['«<br» met 100 000 spaties', `<br${' '.repeat(n(100_000, 40_000))}`],
      ['«<li » × 50 000 zonder «>»', '<li '.repeat(n(50_000, 20_000))],
      ['100 000 spaties zonder regeleinde', `${' '.repeat(n(100_000, 50_000))}x`],
    ];
    for (const [naam, invoer] of plat) {
      const { ms } = meet(() => mailHtmlToPlainText(invoer));
      check(`post-02/keten-config-04: mailHtmlToPlainText lineair — ${naam}`, ms < BUDGET_MS, `${ms.toFixed(0)} ms`);
    }
    const aantal = n(40_000, 15_000), adressen = Array.from({ length: aantal }, (_, i) => `a${i}@b.co`).join(',');
    const a = meet(() => _mailBrowserIntern.addressesOf(adressen));
    check('post-02: addressesOf — 40 000 adressen met komma’s binnen het budget, invoer begrensd', a.ms < BUDGET_MS && a.uit.length > 0 && a.uit.length < aantal, `${a.ms.toFixed(0)} ms, ${a.uit.length} adressen`);
    const q = meet(() => _mailBrowserIntern.addressesOf(`${'"'.repeat(n(200_000, 30_000))},x@y.zz`));
    check('post-02: addressesOf — 200 000 aanhalingstekens binnen het budget', q.ms < BUDGET_MS, `${q.ms.toFixed(0)} ms`);
    const h = meet(() => _mailBrowserIntern.addressesOf(`>${'<'.repeat(90_000)}`));
    check('post-02: addressesOf — «>» gevolgd door 90 000 × «<» binnen het budget', h.ms < BUDGET_MS, `${h.ms.toFixed(0)} ms`);

    // Gedrag blijft: opmaak behouden, gevaarlijke blokken weg mét inhoud, Outlook-VML weg, tekst ge-escaped.
    const uit = normalizeOutboundMailHtml('<p style="color:#ff0000;position:fixed" onclick="x()">Hallo <b>wereld</b></p><script>alert(1)</script><STYLE>p{}</STYLE><!--[if mso]><v:rect>VML</v:rect><![endif]--><table role="presentation" width="100%"><tr><td align="center">cel</td></tr></table><a href="javascript:alert(1)">x</a><a href="https://example.test/a?b=1&amp;c=2">y</a><img src="https://example.test/i.png" alt="i"><svg><circle/></svg ><iframe src="https://kwaad.example.test"></iframe>na');
    check('post-02: opmaak en filter ongewijzigd (toegestane tags/stijlen blijven, script/style/svg/iframe/VML weg met inhoud)',
      uit === '<p style="color:#ff0000">Hallo <b>wereld</b></p><table role="presentation" width="100%"><tr><td align="center">cel</td></tr></table><a>x</a><a href="https://example.test/a?b=1&amp;c=2">y</a><img src="https://example.test/i.png" alt="i">na', uit);
    check('post-02: «<» in een attribuutwaarde breekt de tag niet (zoals vóór de patch)', normalizeOutboundMailHtml('<img src="https://example.test/i.png" alt="1<2">tekst') === '<img src="https://example.test/i.png" alt="1&lt;2">tekst', normalizeOutboundMailHtml('<img src="https://example.test/i.png" alt="1<2">tekst'));
    check('post-02: losse «<» zonder «>» wordt geen tag; tekst blijft', normalizeOutboundMailHtml('a < b en c') === 'a  b en c' || normalizeOutboundMailHtml('a < b en c') === 'a &lt; b en c', normalizeOutboundMailHtml('a < b en c'));
    check('post-02: blok zonder sluiting — tag weg, vervolg als ge-escapete tekst (zoals vóór de patch); gesloten blok ernaast wel weg',
      normalizeOutboundMailHtml('<p>voor</p><svg>a<script>b</script>c<style>d') === '<p>voor</p>acd', normalizeOutboundMailHtml('<p>voor</p><svg>a<script>b</script>c<style>d'));
    check('post-02: entiteiten en gemengde hoofdletters in blokken', normalizeOutboundMailHtml('<P>1 &lt; 2 &amp; 3</P><ScRiPt type="x">a</sCrIpT >b<!--[IF MSO]>c<![ENDIF]-->d<!-- gewoon -->e') === '<p>1 &lt; 2 &amp; 3</p>bde', normalizeOutboundMailHtml('<P>1 &lt; 2 &amp; 3</P><ScRiPt type="x">a</sCrIpT >b<!--[IF MSO]>c<![ENDIF]-->d<!-- gewoon -->e'));
    check('post-02: platte tekst uit HTML ongewijzigd', mailHtmlToPlainText('<p>een</p><ul><li>twee</li><li class="x">drie</li></ul><br/>vier  \n\n\n\nvijf<br >zes') === 'een\n• twee\n• drie\n\nvier\n\nvijf\nzes', JSON.stringify(mailHtmlToPlainText('<p>een</p><ul><li>twee</li><li class="x">drie</li></ul><br/>vier  \n\n\n\nvijf<br >zes')));
    const adr = _mailBrowserIntern.addressesOf('"Jansen, Piet" <piet@example.test>, Anna <anna@example.test>, piet@example.test, geen-adres');
    check('post-02: addressesOf — komma binnen aanhalingstekens splitst niet; dubbelen weg', adr.length === 2 && adr[0] === 'piet@example.test' && adr[1] === 'anna@example.test', JSON.stringify(adr));
  }

  // ---------------------------------------------------------------- post-03: «Signed-by / SPF / DKIM / DMARC» alleen uit de bovenste, vertrouwde kopregel
  {
    const details = _mailBrowserIntern.messageDetailsOf;
    // De afzender stuurt een eigen «Authentication-Results» en een nep-DKIM-Signature mee; de echte regel van Gmail (bovenaan) kent alleen spf=softfail.
    const vervalst = details([
      { name: 'Delivered-To', value: 'ik@example.test' },
      { name: 'Authentication-Results', value: 'mx.google.com; spf=softfail (google.com: domain of transitioning aanval@kwaad.example.test does not designate 203.0.113.7 as permitted sender) smtp.mailfrom=aanval@kwaad.example.test' },
      { name: 'Return-Path', value: '<aanval@kwaad.example.test>' },
      { name: 'Authentication-Results', value: 'mx.google.com; dkim=pass header.i=@partner.example header.d=partner.example; dmarc=pass (p=REJECT) header.from=partner.example' },
      { name: 'DKIM-Signature', value: 'v=1; a=rsa-sha256; d=partner.example; s=sel; bh=AAAA; b=BBBB' },
      { name: 'From', value: 'Partner Finance <facturen@partner.example>' },
    ]);
    check('post-03: vervalste lagere Authentication-Results telt niet (geen «Signed-by», dkim/dmarc leeg, spf van Gmail blijft)',
      vervalst.signedBy === '' && vervalst.authentication.dkim === '' && vervalst.authentication.dmarc === '' && vervalst.authentication.spf === 'softfail' && vervalst.signatureDomain === '', JSON.stringify({ signedBy: vervalst.signedBy, signatureDomain: vervalst.signatureDomain, ...vervalst.authentication }));
    check('post-03: «Mailed-by» komt uit de vertrouwde regel (smtp.mailfrom), niet uit de vervalste', vervalst.mailedBy === 'kwaad.example.test', vervalst.mailedBy);
    // Geen regel van de eigen ontvangende server (bovenste is van een onbekende server): niets tonen wat de afzender zelf kan schrijven.
    const onbekend = details([
      { name: 'Authentication-Results', value: 'mail.kwaad.example.test; spf=pass smtp.mailfrom=bank.example; dkim=pass header.d=bank.example; dmarc=pass header.from=bank.example' },
      { name: 'DKIM-Signature', value: 'v=1; d=bank.example; s=x; b=CCCC' },
      { name: 'Return-Path', value: '<x@kwaad.example.test>' },
    ]);
    check('post-03: zonder vertrouwde regel geen uitslagen en geen «Signed-by» (ook niet uit DKIM-Signature)',
      onbekend.signedBy === '' && onbekend.signatureDomain === '' && onbekend.authentication.spf === '' && onbekend.authentication.dkim === '' && onbekend.authentication.dmarc === '' && onbekend.authentication.trusted === false,
      JSON.stringify({ signedBy: onbekend.signedBy, signatureDomain: onbekend.signatureDomain, ...onbekend.authentication }));
    // Echte, geslaagde mail: gedrag blijft.
    const echt = details([
      { name: 'Authentication-Results', value: 'mx.google.com; dkim=fail header.i=@anders.example header.s=a header.b=x; dkim=pass header.i=@partner.example header.s=sel header.b=AbCd; spf=pass (google.com: domain of bounce@mail.partner.example designates 198.51.100.4 as permitted sender) smtp.mailfrom=bounce@mail.partner.example; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=partner.example' },
      { name: 'DKIM-Signature', value: 'v=1; d=partner.example; s=sel; b=AbCd' },
      { name: 'Received', value: 'from mail.partner.example by mx.google.com with ESMTPS id x (version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384)' },
    ]);
    check('post-03: echte mail — spf/dkim/dmarc pass, «Signed-by» = domein van de geslaagde DKIM, «Mailed-by» = mailfrom-domein',
      echt.signedBy === 'partner.example' && echt.authentication.spf === 'pass' && echt.authentication.dkim === 'pass' && echt.authentication.dmarc === 'pass' && echt.mailedBy === 'mail.partner.example' && echt.authentication.trusted === true && echt.transport.status === 'encrypted_observed',
      JSON.stringify({ signedBy: echt.signedBy, mailedBy: echt.mailedBy, ...echt.authentication }));
  }

  // ---------------------------------------------------------------- post-04: kijker (alleen lezen) kan in de post niets versturen of wijzigen
  {
    const T = Date.now().toString(36);
    let user: Record<string, unknown> = {};
    const routes = createGoogleSuiteMailBrowserRoutes(async () => ({ service: 'mail', user }) as never) as Record<string, any[]>;
    const roep = async (pad: string, body: Record<string, unknown> = {}) => {
      const keten = routes[`POST /api/owner/mail/google-suite/${pad}`];
      try {
        for (const stap of keten) { const r = await stap({ event: { headers: {} }, body, params: {} }); if (r) return { status: r.statusCode as number, error: String(JSON.parse(r.body || '{}').error || JSON.parse(r.body || '{}').errorCode || '') }; }
      } catch (e) { return { status: 500, error: (e as Error).message }; }
      return { status: 0, error: 'GEEN_ANTWOORD' };
    };
    const schrijvend = ['reply', 'reply/reaction', 'forward-attachment', 'thread/ignore', 'reader/filter-similar', 'sender/block-filter', 'unsubscribe',
      'labels/create', 'labels/update', 'labels/delete', 'message/labels-set', 'message/modify', 'messages/bulk-modify', 'state-bulk/submit', 'state-intents/submit', 'save-drive', 'account/disconnect'];
    user = { id: `kijker-${T}`, email: 'kijker@example.test', name: 'Kijker', role: 'viewer', status: 'approved', accessLevel: 'limited' };
    const kijker: Array<[string, { status: number; error: string }]> = [];
    for (const pad of schrijvend) kijker.push([pad, await roep(pad, { accountId: 'acc_onbekend', threadId: 'thr_12345', messageId: 'msg_12345', html: '<p>x</p>', to: 'a@example.test', format: 'eml' })]);
    const door = kijker.filter(([, r]) => !(r.status === 403 && r.error === 'RBAC_FORBIDDEN'));
    check(`post-04: kijker krijgt op alle ${schrijvend.length} schrijvende postroutes 403 RBAC_FORBIDDEN (in de module zelf, zonder de routenaam te raden)`, door.length === 0, door.map(([p, r]) => `${p}→${r.status} ${r.error}`).join('; '));
    user = { id: `wachtend-${T}`, email: 'w@example.test', name: 'W', role: 'member', status: 'pending', accessLevel: 'full' };
    check('post-04: niet-goedgekeurd account blijft geweigerd', (await roep('reply')).status === 403);
    user = { id: `lid-${T}`, email: 'lid@example.test', name: 'Lid', role: 'member', status: 'approved', accessLevel: 'full' };
    const lid = await roep('reply', { accountId: 'acc_onbekend', threadId: 'thr_12345', html: '<p>x</p>' });
    check('post-04: lid wordt niet door RBAC geweigerd (de route zelf beslist verder)', lid.error !== 'RBAC_FORBIDDEN' && lid.status !== 403, `${lid.status} ${lid.error}`);
    check('post-04: vreemde ownerUserId in het lichaam blijft geweigerd', (await roep('reply', { ownerUserId: 'iemand-anders' })).error === 'RBAC_FOREIGN_OWNER_REJECTED');
    // Vangnet op de routenaam (wrapFactoryMutations in backend/index.ts): dezelfde routes worden nu ook daar als wijzigend herkend.
    const nietHerkend = ['reply', 'forward-attachment', 'thread/ignore', 'reader/filter-similar', 'unsubscribe'].filter((p) => !isMutationPath(`/api/owner/mail/google-suite/${p}`));
    check('post-04: isMutationPath herkent reply/forward/ignore/filter-similar/unsubscribe', nietHerkend.length === 0, nietHerkend.join(', '));
    check('post-04: leesroutes blijven lezen voor isMutationPath (lijst, bericht, gesprek, abonnementen)', ['messages', 'message', 'thread', 'subscriptions', 'labels', 'attachment', 'selection/resolve'].every((p) => !isMutationPath(`/api/owner/mail/google-suite/${p}`)));
    // Inventaris: elke route van de module is óf uitdrukkelijk «zonder schrijfrecht» óf draagt de wacht. Een nieuwe route zonder
    // indeling krijgt vanzelf de wacht (weigeren tenzij ingedeeld); deze lijst hieronder verandert alleen bewust.
    const zonderWacht = Object.keys(routes).filter((k) => !(routes[k][0] as any)?.[SCHRIJFWACHT]).map((k) => k.replace('POST /api/owner/mail/google-suite/', '')).sort();
    const verwacht = ['account/select', 'accounts', 'attachment', 'attachments/metadata', 'connect/start', 'labels', 'message', 'message/raw', 'messages', 'period-bounds', 'reader/capabilities', 'reader/n10/capabilities',
      'reader/remote-image', 'reader/translate', 'save-folders', 'save-targets', 'selection/resolve', 'state-bulk/status', 'state-intents/status', 'subscriptions', 'thread'].sort();
    check('post-04: inventaris — alleen de bekende lees-/keuzeroutes staan zonder schrijfwacht', JSON.stringify(zonderWacht) === JSON.stringify(verwacht), `zonder wacht: ${zonderWacht.join(', ')}`);
    // De buitenste laag (index.ts) zet geen tweede wacht voor een keten die er al een heeft, en nog steeds wel voor de rest.
    const buiten = wrapFactoryMutations(routes, async () => ({ service: 'mail', user }) as never);
    check('post-04: wrapFactoryMutations verdubbelt de wacht niet', buiten['POST /api/owner/mail/google-suite/reply'].length === routes['POST /api/owner/mail/google-suite/reply'].length
      && buiten['POST /api/owner/mail/google-suite/save-targets'].length === routes['POST /api/owner/mail/google-suite/save-targets'].length + 1);
    // Verzendlimiet: beantwoorden, doorsturen als bijlage en reageren delen één teller per gebruiker (60 per 10 minuten), ook voor een lid.
    let geweigerd = 0, eerste429 = 0;
    for (let i = 1; i <= 64; i += 1) { const r = await roep(i % 2 ? 'reply' : 'forward-attachment', {}); if (r.status === 429) { geweigerd += 1; if (!eerste429) eerste429 = i; } }
    check('post-04: verzendroutes hebben een limiet per gebruiker (429 na 60 in 10 minuten)', geweigerd >= 3 && eerste429 >= 59, `geweigerd=${geweigerd}, eerste 429 bij poging ${eerste429}`);
  }

  // ================================================================ ronde 2 (hervat op basis 11e0aad8)
  const bron = (pad: string) => readFileSync(new URL(`../../${pad}`, import.meta.url), 'utf8');
  const stil = console.error, stilW = console.warn; console.error = () => {}; console.warn = () => {};
  _zonderPoortIsPrive(true); // zoals tests/eenheid/mail-opstel.test.ts: concepten/wachtrij buiten een verzoek = privéruimte
  try {
    // ---------------------------------------------------------------- post-11: afmelddoel zichtbaar vóór het openen
    {
      const vreemd = afmeldBevestiging('uk', { externalUrl: 'https://login-bank.example.test/afmelden?x=1', externalHost: 'login-bank.example.test', externalSenderMatch: false });
      const eigen = afmeldBevestiging('nl', { externalUrl: 'https://lists.winkel.example.test/u/1', externalHost: 'lists.winkel.example.test', externalSenderMatch: true });
      const mail = afmeldBevestiging('nl', { externalUrl: 'mailto:afmelden@winkel.example.test?subject=stop', externalSenderMatch: true });
      const js = afmeldBevestiging('uk', { externalUrl: 'javascript:alert(1)' });
      check('post-11: bevestiging noemt de host en waarschuwt met «!» bij een ander domein dan de afzender', vreemd.tekst.includes('login-bank.example.test') && /\n! /.test(vreemd.tekst) && vreemd.vreemd, vreemd.tekst.replace(/\n/g, ' ⏎ '));
      check('post-11: zelfde domein — host genoemd, geen waarschuwing; mailto — het adres genoemd', eigen.tekst.includes('lists.winkel.example.test') && !/\n! /.test(eigen.tekst) && mail.tekst.includes('afmelden@winkel.example.test'), `${eigen.tekst} | ${mail.tekst}`.replace(/\n/g, ' ⏎ '));
      check('post-11: geen https/mailto → niets te openen', js.url === '' && js.tekst === '');
      const d = _mailBrowserIntern.afmeldDoel('https://track.kwaad.test/x', [{ name: 'From', value: 'Bank <info@bank.test>' }]);
      const d2 = _mailBrowserIntern.afmeldDoel('https://mail.bank.test/x', [{ name: 'From', value: 'Bank <info@bank.test>' }]);
      check('post-11: server geeft externalHost en de vergelijking met het domein van de afzender', d.externalHost === 'track.kwaad.test' && d.externalSenderMatch === false && d2.externalSenderMatch === true, JSON.stringify([d, d2]));
      const weergave = bron('src/MailAbonnementenWeergave.tsx'), werkruimte = bron('src/GoogleMailWerkruimte.tsx');
      check('post-11: beide afmeldknoppen gebruiken de bevestiging met doel (geen algemene vraag zonder adres meer)', weergave.includes('afmeldBevestiging(') && werkruimte.includes('afmeldBevestiging(') && !weergave.includes('Для цієї розсилки потрібно відкрити сторінку або поштову дію відправника. Продовжити?'));
    }

    // ---------------------------------------------------------------- aanv-ronde1-01: «Друк» opent nooit de ruwe blob van de afzender
    {
      const soorten = {
        html: afdrukSoort({ contentType: 'text/html', blobType: 'text/html', kind: 'text', filename: 'rekening.html' }),
        htmlTekst: afdrukSoort({ contentType: 'text/html', kind: 'text', filename: 'rekening.html', text: '<form>' }),
        svg: afdrukSoort({ contentType: 'image/svg+xml', blobType: 'image/svg+xml', kind: 'image', filename: 'logo.svg' }),
        svgAlsPng: afdrukSoort({ contentType: 'image/png', blobType: 'image/png', kind: 'image', filename: 'logo.svg' }),
        xml: afdrukSoort({ contentType: 'application/xml', filename: 'a.xml' }),
        pdf: afdrukSoort({ contentType: 'application/pdf', kind: 'pdf', filename: 'a.pdf' }),
        png: afdrukSoort({ contentType: 'image/png', blobType: 'image/png', kind: 'image', filename: 'a.png' }),
        txt: afdrukSoort({ contentType: 'text/plain', kind: 'text', text: 'hallo', filename: 'a.txt' }),
        zip: afdrukSoort({ contentType: 'application/zip', kind: 'archive', filename: 'a.zip' }),
      };
      check('aanv-ronde1-01: html/svg/xml worden nooit als document of beeld afgedrukt (alleen als ge-escapete tekst, of niet)', soorten.html === 'geen' && soorten.htmlTekst === 'tekst' && soorten.svg === 'geen' && soorten.svgAlsPng === 'geen' && soorten.xml === 'geen', JSON.stringify(soorten));
      check('aanv-ronde1-01: pdf, rasterbeeld en tekst blijven afdrukbaar; overige typen niet', soorten.pdf === 'pdf' && soorten.png === 'beeld' && soorten.txt === 'tekst' && soorten.zip === 'geen');
      const blobs: Blob[] = []; const maak = (b: Blob) => { blobs.push(b); return `blob:https://mail.example.test/${blobs.length}`; };
      const aanval = '<form action="/api/owner/mail/google-suite/messages/bulk-modify" method="post" enctype="text/plain"><button>Afdrukken</button></form><meta http-equiv="refresh" content="0;url=https://kwaad.example.test">';
      const t = await afdrukUrl({ blob: new Blob([aanval], { type: 'text/html' }), blobType: 'text/html', contentType: 'text/html', kind: 'text', filename: 'x.html', text: aanval }, maak);
      const tekstDoc = await blobs[blobs.length - 1].text();
      check('aanv-ronde1-01: html-bijlage → eigen document met ge-escapete tekst en strenge CSP (geen <form>, geen meta refresh)', !!t && !/<form|<meta http-equiv="refresh"/i.test(tekstDoc) && tekstDoc.includes('&lt;form') && /default-src 'none'/.test(tekstDoc) && /form-action 'none'/.test(tekstDoc), tekstDoc.slice(0, 160));
      blobs.length = 0;
      const p = await afdrukUrl({ blob: new Blob([aanval], { type: 'application/pdf' }), blobType: 'application/pdf', contentType: 'application/pdf', kind: 'pdf', filename: 'a.pdf' }, maak);
      check('aanv-ronde1-01: pdf → nieuwe blob met vast type application/pdf', !!p && blobs.length === 1 && blobs[0].type === 'application/pdf');
      blobs.length = 0;
      const b = await afdrukUrl({ blob: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), blobType: 'image/png', contentType: 'image/png', kind: 'image', filename: 'a.png' }, maak);
      const beeldDoc = await blobs[1].text();
      check('aanv-ronde1-01: rasterbeeld → eigen document met alleen <img src=blob:> en CSP', !!b && blobs[0].type === 'image/png' && /<img src="blob:https:\/\/mail\.example\.test\/1"/.test(beeldDoc) && /img-src blob:/.test(beeldDoc));
      check('aanv-ronde1-01: zip/onbekend → geen URL (niets geopend)', (await afdrukUrl({ blob: new Blob(['x']), contentType: 'application/zip', kind: 'archive', filename: 'a.zip' }, maak)) === null);
      const ws = bron('src/GoogleMailWerkruimte.tsx'), lader = bron('src/mail-bijlage-lader.ts');
      check('aanv-ronde1-01: printAttachment opent de ruwe renderUrl niet meer; de lader geeft html/xml-blobs geen actief type', !ws.includes('window.open(attachmentPreview.renderUrl') && ws.includes('afdrukUrl(') && /html\|xml\|xsl/.test(lader) && lader.includes("'application/octet-stream':resolvedType"));
    }

    // ---------------------------------------------------------------- aanv-ronde1-02: adres uit de LAATSTE hoekhaken
    {
      const from = '"Baas <baas@bedrijf.example.test>" <aanvaller@kwaad.example.test>';
      const a = _mailBrowserIntern.addressOf(from), m = _mailBrowserIntern.mailboxOf(from), lijst = _mailBrowserIntern.addressesOf(`${from}, Piet <piet@example.test>`), c = normalizeMailAddress(from);
      check('aanv-ronde1-02: server (addressOf/mailboxOf/addressesOf) en client (normalizeMailAddress) nemen het echte adres, niet dat uit de weergavenaam',
        a === 'aanvaller@kwaad.example.test' && m === a && c === a && JSON.stringify(lijst) === JSON.stringify(['aanvaller@kwaad.example.test', 'piet@example.test']), JSON.stringify({ a, m, c, lijst }));
      check('aanv-ronde1-02: gewone vormen ongewijzigd (kaal adres, Naam <adres>, hoofdletters)', _mailBrowserIntern.addressOf('Jan@Example.test') === 'jan@example.test' && _mailBrowserIntern.addressOf('Jan <jan@example.test>') === 'jan@example.test' && normalizeMailAddress('<x@y.test>') === 'x@y.test' && _mailBrowserIntern.addressOf('geen adres') === '');
      const lang = meet(() => _mailBrowserIntern.addressOf(`${'<'.repeat(200_000)}`));
      check('aanv-ronde1-02: addressOf blijft lineair op vijandige invoer', lang.ms < BUDGET_MS, `${lang.ms.toFixed(0)} ms`);
    }

    // ---------------------------------------------------------------- post-09/keten-config-04: AI-assistent, begrensde invoer en lineaire markers
    {
      const n = (groot: number, klein: number) => (KLEIN ? klein : groot);
      const gevallen: Array<[string, () => unknown]> = [
        ['untrustedEmailText: «<» + 60 000 × « \\n\\n» (marker-uitdrukking)', () => untrustedEmailText(`<p>&lt;${' \n\n'.repeat(n(60_000, 20_000))}</p>`, 200_000)],
        ['untrustedEmailText: 12 MB «<script>» (begrensd vóór de opschoning)', () => untrustedEmailText('<script>'.repeat(n(1_500_000, 100_000)))],
        ['userTextBlock: «<» + 20 000 spaties', () => userTextBlock(`<${' '.repeat(n(20_000, 20_000))}`)],
      ];
      for (const [naam, f] of gevallen) { const { ms } = meet(f); check(`keten-config-04: ${naam} binnen het budget`, ms < BUDGET_MS, `${ms.toFixed(0)} ms`); }
      const groot = await saveDraft(`g10c-${randomUUID()}`, { localId: `lokaal-${randomUUID().slice(0, 12)}`, html: 'x'.repeat(MAX_HTML_INVOER + 1) }) as { error?: string };
      check('keten-config-04: compose — HTML boven de bovengrens geweigerd met MAIL_BODY_TOO_LARGE, vóór de opschoning', groot.error === 'MAIL_BODY_TOO_LARGE', JSON.stringify(groot));
    }

    // ---------------------------------------------------------------- aanv-gat-b-01 / aanv-ronde1-03: AI-vertaling lineair en begrensd
    {
      const n = (groot: number, klein: number) => (KLEIN ? klein : groot);
      const gevallen: Array<[string, () => unknown]> = [
        ['stripTrackingAndSecrets: «<img » × 80 000', () => stripTrackingAndSecrets('<img '.repeat(n(80_000, 16_000)))],
        ['stripTrackingAndSecrets: «eyJaaaaaaaaaa-» × 28 000', () => stripTrackingAndSecrets('eyJaaaaaaaaaa-'.repeat(n(28_000, 6_000)))],
        ['stripTrackingAndSecrets: «-----BEGIN PRIVATE KEY-----» × 14 000', () => stripTrackingAndSecrets('-----BEGIN PRIVATE KEY-----'.repeat(n(14_000, 3_000)))],
        ['stripTrackingAndSecrets: 12 MB «<» (begrensd)', () => stripTrackingAndSecrets('<'.repeat(n(12_000_000, 200_000)))],
        ['extractSignificantKeywords: «<» × 300 000', () => extractSignificantKeywords('<'.repeat(n(300_000, 60_000)))],
        ['splitSentences: «<» × 300 000', () => _vertalingIntern.splitSentences('<'.repeat(n(300_000, 60_000)))],
        ['extractSumsFromText: «1 » × 100 000', () => _vertalingIntern.extractSumsFromText('1 '.repeat(n(100_000, 20_000)))],
        ['wrapUntrusted: «&lt;» + 50 000 × « \\n\\n»', () => _vertalingIntern.wrapUntrusted(`<p>&lt;${' \n\n'.repeat(n(50_000, 15_000))}</p>`)],
        ['wrapAlineas: «<untrusted_data » × 40 000', () => _vertalingIntern.wrapAlineas('<untrusted_data '.repeat(n(40_000, 10_000)))],
      ];
      for (const [naam, f] of gevallen) { const { ms } = meet(f); check(`aanv-gat-b-01/aanv-ronde1-03: ${naam} binnen het budget`, ms < BUDGET_MS, `${ms.toFixed(0)} ms`); }
      const b = begrensAiVertalingInvoer({ userId: 'u', mode: 'summary', targetLang: 'uk', messageId: 'm', subject: 's'.repeat(5_000_000), bodyText: 'b'.repeat(5_000_000), from: 'f'.repeat(10_000), to: Array.from({ length: 500 }, () => 'x'.repeat(1000)) });
      check('aanv-gat-b-01: invoer van /ai-vertaling/run begrensd vóór elke bewerking (tekst, onderwerp, adressen)', b.bodyText!.length === AI_VERTALING_MAX.body && b.subject!.length === AI_VERTALING_MAX.subject && b.from!.length === AI_VERTALING_MAX.adres && b.to!.length === AI_VERTALING_MAX.adressen && b.to!.every((x) => x.length <= AI_VERTALING_MAX.adres));
      const geheim = stripTrackingAndSecrets('a eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZlcnppbg b -----BEGIN RSA PRIVATE KEY-----\nMIIEverzonnen\n-----END RSA PRIVATE KEY----- c <img src="https://open.tracker.example.test/p.gif" width="1"> d');
      check('aanv-gat-b-01: gedrag blijft — JWT, PRIVATE KEY-blok en volgpixel worden nog steeds verwijderd', !/eyJhbGci|MIIEverzonnen|tracker/.test(geheim.text) && geheim.redactedSecrets === 2 && geheim.strippedTrackingPixels === 1 && /^a \[ПРИХОВАНО_СЕКРЕТ\] b \[ПРИХОВАНО_СЕКРЕТ\] c  d$/.test(geheim.text), geheim.text);
      check('aanv-ronde1-03: zinnen en bedragen ongewijzigd voor gewone tekst', JSON.stringify(_vertalingIntern.splitSentences('<p>Dit is de eerste zin.</p> En dit is de tweede zin!')) === JSON.stringify(['Dit is de eerste zin.', 'En dit is de tweede zin!']) && _vertalingIntern.extractSumsFromText('Te betalen: € 1.250,00 vóór vrijdag of 300 EUR.').length === 2);
      const routes = bron('backend/ai-vertaling-routes.ts');
      check('aanv-gat-b-01: cachesleutel heeft vaste lengte (sha256 over het hele bericht, niet het volle onderwerp)', /createHash\('sha256'\)\.update\(JSON\.stringify\(\{\s*s: input\.subject/.test(routes) && routes.includes('const input = begrensAiVertalingInvoer(invoer);'));
    }

    // ---------------------------------------------------------------- ai-mcp-08: JSON-RPC-pakket begrensd en geteld
    {
      const sleutel = `mcp-rpc:g10c-${randomUUID()}`;
      const teGroot = await pakketToegestaan(sleutel, MAX_PAKKET + 1, 120);
      check('ai-mcp-08: pakket met meer dan 20 berichten → 400 / -32600', !teGroot.ok && teGroot.status === 400 && teGroot.code === -32600);
      const leeg = await pakketToegestaan(sleutel, 0, 120);
      check('ai-mcp-08: leeg pakket → 400 / -32600 (specificatie)', !leeg.ok && leeg.status === 400);
      let toegestaan = 0, eersteWeigering = 0;
      for (let i = 1; i <= 8; i += 1) { const r = await pakketToegestaan(sleutel, 20, 120); if (r.ok) toegestaan += 1; else if (!eersteWeigering) eersteWeigering = i; }
      check('ai-mcp-08: elk bericht telt in de limiet van 120 per minuut (6 pakketten van 20 door, daarna 429)', toegestaan === 6 && eersteWeigering === 7, `toegestaan=${toegestaan} eerste weigering=${eersteWeigering}`);
      let tegelijk = 0, piek = 0;
      const uit = await pakketUitvoeren(Array.from({ length: 20 }, (_, i) => i), async (i) => { tegelijk += 1; piek = Math.max(piek, tegelijk); await new Promise((r) => setTimeout(r, 2)); tegelijk -= 1; return i * 2; });
      check('ai-mcp-08: uitvoering met hoogstens 3 tegelijk, antwoorden in de volgorde van het pakket', piek <= 3 && uit.every((v, i) => v === i * 2), `piek=${piek}`);
      const oud = bron('backend/mcp-connector.ts') + bron('backend/connector-v2.ts');
      check('ai-mcp-08: geen Promise.all over het hele pakket meer in /mcp en /<agent>', !/Promise\.all\(parsed\.map/.test(oud) && (oud.match(/pakketToegestaan\(/g) || []).length === 2);
    }

    // ---------------------------------------------------------------- ai-mcp-13: schakelaars niet «open» bij een leesfout
    {
      const pool = getPool('systeem') as unknown as { query: (...a: unknown[]) => Promise<unknown> };
      const echt = pool.query;
      const metFout = async (fout: Error & { code?: string }, f: () => Promise<unknown>) => { pool.query = async () => { throw fout; }; try { return await f().then((v) => ({ v }), (e: Error) => ({ e: e.message })); } finally { pool.query = echt; } };
      vergeetStaat();
      const time = Object.assign(new Error('timeout exceeded when trying to connect'), { code: undefined });
      const s1 = await metFout(time, () => leesStaat()) as { e?: string };
      const u1 = await metFout(time, () => leesGebruikerCaps(`g10c-${randomUUID()}`)) as { e?: string };
      check('ai-mcp-13: time-out/volle pool zonder recente stand → CAP_ONBEKEND (geweigerd), niet «alles aan»', s1.e === 'CAP_ONBEKEND' && u1.e === 'CAP_ONBEKEND', JSON.stringify([s1, u1]));
      const ontbreekt = Object.assign(new Error('relation "app.ai_site_schakelaars" does not exist'), { code: '42P01' });
      const s2 = await metFout(ontbreekt, () => leesStaat()) as { v?: { cap?: Record<string, boolean> } };
      check('ai-mcp-13: ontbrekende tabel (migratie nog niet gedraaid) → oud gedrag (standaardstand)', !!s2.v && typeof s2.v === 'object');
      vergeetStaat();
      const vers = await leesStaat();
      // Cache-venster van 5 s verlopen laten lijken: de laatste geslaagde stand geldt als noodstand (5 min).
      const nu = Date.now; Date.now = () => nu() + 10_000;
      const s3 = await metFout(time, () => leesStaat()).finally(() => { Date.now = nu; }) as { v?: unknown };
      check('ai-mcp-13: kortstondige fout met een recente geslaagde stand → die stand (geen onnodige weigering)', JSON.stringify(s3.v) === JSON.stringify(vers));
      vergeetStaat();
      const mcp = bron('backend/mcp-connector.ts');
      check('ai-mcp-13: /mcp weigert een aanroep met CAP_ONBEKEND en toont geen hulpmiddelen als de stand onleesbaar is', mcp.includes('CAP_ONBEKEND') && (mcp.match(/leesGebruikerCaps\(who\.userId\)\]\)\.catch\(\(\) => null\)/g) || []).length === 2);
    }

    // ---------------------------------------------------------------- post-10: ingeplande mail na blokkeren / alleen lezen
    {
      const verstuurd: string[] = [];
      const nep: MailTransport = {
        async resolve(_u, a) { return { accountId: a || 'acc-1', email: 'ik@example.test', displayName: 'Ik' }; },
        async send(u) { verstuurd.push(u); return { id: `m-${verstuurd.length}`, threadId: 't' }; },
        async draftUpsert() { return { id: 'd' }; },
        async draftDelete() { /* niets */ },
      };
      setMailTransport(nep);
      const pool = getPool();
      const maakGebruiker = async (data: Record<string, unknown>) => { const id = `g10c-mq-${randomUUID()}`; await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email: `${id}@example.test`, role: 'member', status: 'approved', accessLevel: 'full', ...data }]); return id; };
      try {
        const geblokkeerd = await maakGebruiker({}), kijker = await maakGebruiker({}), lid = await maakGebruiker({}), afgebroken = await maakGebruiker({});
        const plan = async (u: string) => { const r = await enqueue(u, { to: 'ontvanger@example.test', subject: 'later', html: '<p>x</p>', accountId: 'acc-1' }, Date.now() + 60_000, `g10c-${randomUUID()}`) as { item?: { id: string } }; return String(r.item?.id || ''); };
        const [q1, q2, q3] = [await plan(geblokkeerd), await plan(kijker), await plan(lid)];
        const q4 = await plan(afgebroken);
        // Daarna zet de beheerder het ene account op geblokkeerd en het andere op alleen lezen (zoals updateManagedUser).
        await pool.query(`UPDATE app.records SET data = data || '{"status":"blocked"}'::jsonb WHERE tbl='users' AND id=$1`, [geblokkeerd]);
        await pool.query(`UPDATE app.records SET data = data || '{"role":"viewer","accessLevel":"limited"}'::jsonb WHERE tbl='users' AND id=$1`, [kijker]);
        const geannuleerd = await annuleerGeplandeMail(afgebroken, 'MAIL_SENDER_BLOCKED');
        await pool.query(`UPDATE app.mail_queue SET send_at = now() - interval '1 minute' WHERE id = ANY($1::uuid[])`, [[q1, q2, q3, q4].filter(Boolean)]);
        await runMailQueue(50);
        const rij = async (id: string) => (await pool.query('SELECT status, last_error FROM app.mail_queue WHERE id=$1', [id])).rows[0] as { status: string; last_error: string };
        const [r1, r2, r3, r4] = [await rij(q1), await rij(q2), await rij(q3), await rij(q4)];
        check('post-10: na blokkeren wordt ingeplande mail niet verstuurd (failed, MAIL_SENDER_NOT_ALLOWED)', r1?.status === 'failed' && r1.last_error === 'MAIL_SENDER_NOT_ALLOWED' && !verstuurd.includes(geblokkeerd), JSON.stringify(r1));
        check('post-10: na terugzetten naar alleen lezen ook niet (MAIL_SENDER_NO_WRITE)', r2?.status === 'failed' && r2.last_error === 'MAIL_SENDER_NO_WRITE' && !verstuurd.includes(kijker), JSON.stringify(r2));
        check('post-10: een goedgekeurd lid verstuurt gewoon (geen regressie)', r3?.status === 'sent' && verstuurd.includes(lid), JSON.stringify(r3));
        check('post-10: annuleerGeplandeMail zet ingeplande mail van het account op cancelled', geannuleerd === 1 && r4?.status === 'cancelled' && !verstuurd.includes(afgebroken), JSON.stringify(r4));
        const idx = bron('backend/index.ts');
        check('post-10: updateManagedUser annuleert ingeplande mail bij blokkeren of rol viewer', /annuleerGeplandeMail\(next\.id, status === 'blocked'/.test(idx));
      } finally { setMailTransport(null); }
    }

    // ---------------------------------------------------------------- aanv-gat-c-04: wachtrij van mailstatus kijkt naar de openstaande rijen
    {
      const pool = getPool();
      const echteFetch = globalThis.fetch;
      globalThis.fetch = (async () => { throw new Error('GEEN_NETWERK_IN_TEST'); }) as typeof fetch;
      try {
        // Eigen testdatabase: resten van eerdere runs van dit blok eerst weg, zodat de telling hieronder exact is.
        await pool.query("DELETE FROM app.records WHERE tbl IN ('mail_state_intents_v1','mail_state_intent_events_v1') AND data->>'ownerUserId' LIKE 'g10c-%'");
        const eigenaar = `g10c-st-${randomUUID()}`, oud = Date.now() - 8 * 24 * 3600 * 1000;
        const basis = (over: Record<string, unknown>) => ({ ownerUserId: eigenaar, accountId: 'acc-x', provider: 'google_gmail', messageId: `m-${randomUUID()}`, stateKey: 'unread', action: 'read', desired: false, localUntil: 0, previousState: true, source: 'test', intentId: randomUUID(), idempotencyKey: randomUUID(), status: 'succeeded', capability: 'supported', attemptCount: 1, maxAttempts: 8, availableAt: 0, leaseOwner: '', leaseExpiresAt: 0, acceptedAt: oud, providerObservedAt: oud, completedAt: oud, updatedAt: oud, errorCode: '', rollbackRequired: false, converged: true, ...over });
        // 600 afgeronde rijen EERST (laagste seq), daarna pas de rijen die nog moeten.
        for (let i = 0; i < 600; i += 200) await db.add('mail_state_intents_v1', Array.from({ length: 200 }, (_, k) => basis(i + k < 300 ? {} : { completedAt: Date.now(), updatedAt: Date.now(), acceptedAt: Date.now() })));
        const [retryId] = await db.add('mail_state_intents_v1', [basis({ status: 'retry', availableAt: Date.now() - 1000, completedAt: 0, acceptedAt: Date.now() - 5000 })]) as string[];
        const [leaseId] = await db.add('mail_state_intents_v1', [basis({ status: 'leased', availableAt: 0, leaseOwner: 'dood-proces', leaseExpiresAt: Date.now() - 60_000, completedAt: 0, acceptedAt: Date.now() - 5000 })]) as string[];
        const oudId = (await pool.query(`SELECT id FROM app.records WHERE tbl='mail_state_intents_v1' AND data->>'ownerUserId'=$1 AND (data->>'completedAt')::bigint < $2 ORDER BY seq LIMIT 1`, [eigenaar, Date.now() - 7 * 24 * 3600 * 1000])).rows[0]?.id;
        await db.add('mail_state_intent_events_v1', [{ ownerUserId: eigenaar, outboxId: oudId, outcome: 'provider_write_confirmed', observedAt: oud }]);
        const uit = await runGoogleSuiteMailStateOutbox(20) as { due: number; results: Array<{ outboxId: string; status: string }>; opgeruimd?: number };
        const ids = new Set(uit.results.map((r) => r.outboxId));
        check('aanv-gat-c-04: een «retry»-rij achter 600 afgeronde rijen wordt opgepakt (vroeger due: 0 voor altijd)', ids.has(retryId), JSON.stringify({ due: uit.due, n: uit.results.length }));
        check('aanv-gat-c-04: een «leased»-rij met verlopen lease (proces viel weg) gaat weer in de wachtrij', ids.has(leaseId));
        const rest = (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='mail_state_intents_v1' AND data->>'ownerUserId'=$1 AND data->>'status'='succeeded'`, [eigenaar])).rows[0].n;
        const ev = (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='mail_state_intent_events_v1' AND data->>'outboxId'=$1`, [oudId])).rows[0].n;
        check('aanv-gat-c-04: afgeronde rijen ouder dan 7 dagen begrensd opgeruimd (200 per run), met hun gebeurtenissen; recente blijven', (uit.opgeruimd || 0) === 200 && rest === 400 && ev === 0, `opgeruimd=${uit.opgeruimd} rest=${rest} gebeurtenissen=${ev}`);
      } finally { globalThis.fetch = echteFetch; }
    }

    // ---------------------------------------------------------------- autorisatie-02 / autorisatie-06: accountrecord veldgewijs, toegangsverzoek één keer gemeld
    {
      const pool = getPool();
      const T = Date.now().toString(36);
      const G = await nepGoogle({ ownerEmail: 'eigenaar@example.invalid' });
      try {
        // Bouwsteen: veldgewijs schrijven laat gelijktijdig gezette velden staan.
        const id0 = `g10c-u-${randomUUID()}`;
        await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id0, { email: `${id0}@example.test`, status: 'approved', role: 'member', entitlements: ['api-platform'] }]);
        await pool.query(`UPDATE app.records SET data = data || '{"status":"blocked","entitlements":[]}'::jsonb WHERE tbl='users' AND id=$1`, [id0]);
        const okZet = await gebruikerVeldenZetten(id0, { picture: 'data:image/png;base64,AAAA', customPicture: true, updatedAt: Date.now() });
        const na0 = (await pool.query(`SELECT data FROM app.records WHERE tbl='users' AND id=$1`, [id0])).rows[0].data;
        check('autorisatie-02: veldgewijs schrijven (foto) laat een gelijktijdige blokkade en ingetrokken rechten staan', okZet && na0.status === 'blocked' && JSON.stringify(na0.entitlements) === '[]' && na0.customPicture === true, JSON.stringify({ status: na0.status, ent: na0.entitlements }));
        // Toegangsverzoek-status: alleen new → pending, één keer; nooit over blocked/approved heen.
        const id1 = `g10c-u-${randomUUID()}`;
        await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id1, { email: `${id1}@example.test`, status: 'new' }]);
        const [o1, o2] = [await toegangAanvraagStatus(id1), await toegangAanvraagStatus(id1)];
        await pool.query(`UPDATE app.records SET data = data || '{"status":"blocked"}'::jsonb WHERE tbl='users' AND id=$1`, [id1]);
        const o3 = await toegangAanvraagStatus(id1);
        const st1 = (await pool.query(`SELECT data->>'status' AS s FROM app.records WHERE tbl='users' AND id=$1`, [id1])).rows[0].s;
        check('autorisatie-02/-06: toegangsverzoek zet alleen new→pending, één keer, en nooit over een blokkade heen', o1.overgang && !o2.overgang && !o3.overgang && st1 === 'blocked', JSON.stringify([o1, o2, o3, st1]));

        // Echte route, echte sessie: lus op /api/owner/profile/photo terwijl de beheerder blokkeert en rechten intrekt (verloren update).
        const FOTO = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]).toString('base64');
        let terug = 0; const rondes = Number(process.env.SEC002_RONDES || 3), meldingen: string[] = [];
        for (let ronde = 0; ronde < rondes; ronde += 1) {
          const email = `g10c-race-${T}-${ronde}@example.test`, b = G.browser();
          await b.aanmelden(`g10c-race-${T}-${ronde}`, email, { intent: 'login' });
          const id = (await pool.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1", [email])).rows[0].id;
          await pool.query(`UPDATE app.records SET data = data || '{"status":"approved","entitlements":["api-platform"]}'::jsonb WHERE tbl='users' AND id=$1`, [id]);
          let klaar = false, geslaagd = 0;
          const werker = async () => { while (!klaar) { const r = await b.verzoek('hub.tarasevych.com', '/api/owner/profile/photo', b.ctxBody('hub', { data: FOTO, mimeType: 'image/png' })); if (r.status === 200) geslaagd += 1; await new Promise((x) => setImmediate(x)); } };
          const werkers = Array.from({ length: 10 }, werker);
          await new Promise((r) => setTimeout(r, 300));
          await pool.query(`UPDATE app.records SET data = data || '{"status":"blocked","entitlements":[]}'::jsonb WHERE tbl='users' AND id=$1`, [id]);
          await new Promise((r) => setTimeout(r, 300));
          klaar = true; await Promise.all(werkers);
          const na = (await pool.query(`SELECT data->>'status' AS s, data->'entitlements' AS e FROM app.records WHERE tbl='users' AND id=$1`, [id])).rows[0];
          if (na.s !== 'blocked' || JSON.stringify(na.e) !== '[]') terug += 1;
          meldingen.push(`r${ronde}: ${geslaagd}×200 → ${na.s} ${JSON.stringify(na.e)}`);
        }
        check(`autorisatie-02: lus op /profile/photo maakt blokkade en ingetrokken rechten niet ongedaan (${rondes} ronden)`, terug === 0, meldingen.join('; '));

        // autorisatie-06: niet-goedgekeurd account vraagt herhaaldelijk toegang aan.
        const eig = G.browser(); await eig.aanmelden('g10c-eigenaar-sub', 'eigenaar@example.invalid', { intent: 'login' });
        const eigId = (await pool.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'='eigenaar@example.invalid' ORDER BY seq LIMIT 1")).rows[0]?.id;
        const telMeldingen = async () => (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='site_notifications' AND data->>'recipientUserId'=$1 AND data->>'kind'='access_request'`, [eigId])).rows[0].n as number;
        const telTaken = async () => (await pool.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl='notification_jobs' AND data->>'kind'='access_request'`)).rows[0].n as number;
        const nieuw = G.browser(), mailNieuw = `g10c-nieuw-${T}@example.test`, ip = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
        await nieuw.aanmelden(`g10c-nieuw-${T}`, mailNieuw, { intent: 'login', ip });
        const [m0, j0] = [await telMeldingen(), await telTaken()];
        const statussen: number[] = [];
        for (let i = 0; i < 8; i += 1) statussen.push((await nieuw.verzoek('hub.tarasevych.com', '/api/owner/access/request', nieuw.ctxBody('hub'), { ip })).status);
        const [m1, j1] = [await telMeldingen(), await telTaken()];
        check('autorisatie-06: herhaalde toegangsverzoeken → precies 1 melding aan de eigenaar en 2 taken (alleen de eerste overgang)', !!eigId && m1 - m0 === 1 && j1 - j0 === 2, `meldingen +${m1 - m0}, taken +${j1 - j0}, statussen ${statussen.join(',')}`);
        check('autorisatie-06: limiet per account — na 5 verzoeken per uur 429', statussen.slice(0, 5).every((s) => s === 200) && statussen.slice(5).every((s) => s === 429), statussen.join(','));
        const st = (await pool.query(`SELECT data->>'status' AS s FROM app.records WHERE tbl='users' AND data->>'email'=$1`, [mailNieuw])).rows[0]?.s;
        check('autorisatie-06: het account staat daarna op pending (gewone werking blijft)', st === 'pending', String(st));
      } finally { G.herstel(); }
    }

    // ---------------------------------------------------------------- autorisatie-08: ingebouwde verzendroutes in index.ts eisen mail.write
    {
      const idx = bron('backend/index.ts');
      const routes = ['/api/owner/mail/accounts/:id/send/prepare', '/api/owner/mail/accounts/:id/send/confirm', '/api/owner/mail/accounts/:id/send', '/api/owner/mail/import'];
      const zonder = routes.filter((r) => { const i = idx.indexOf(`'POST ${r}': [`); return i < 0 || !idx.slice(i, i + 700).includes("denyMutation(auth.user,'mail.write')"); });
      check('autorisatie-08: verzenden/voorbereiden/bevestigen/importeren in index.ts weigeren een kijker (denyMutation mail.write)', zonder.length === 0, zonder.join(', '));
    }

    // ================================================================ na de controle (g10c-toets-1 … 5)
    // ---------------------------------------------------------------- g10c-toets-1: dezelfde «eerste <…>»-fout in de buren van aanv-ronde1-02
    {
      const from = '"Baas <baas@bedrijf.example.test>" <aanvaller@kwaad.example.test>';
      const besluit = classifyMailMessage({ id: 'm1', from, snippet: 'Kunt u dit vandaag betalen?' }, 'acc1', { peopleSenders: [{ accountId: 'acc1', email: 'baas@bedrijf.example.test' }], peopleMessages: [], systemSenders: [], systemMessages: [] });
      check('g10c-toets-1: slimme inbox past de handmatige regel van de ECHTE afzender toe, niet die uit de weergavenaam', besluit.reason !== 'manual_sender', JSON.stringify(besluit));
      const punt = { status: 'letterlijk', soort: 'vraag', bron: { brief: 1 } } as never;
      const nodig = antwoordNodig([{ from: '"Ik <ik@example.test>" <aanvaller@kwaad.example.test>' }], ['ik@example.test'], [punt]);
      check('g10c-toets-1: «потребує відповіді» houdt een brief met mijn adres in de weergavenaam niet voor de mijne', nodig !== null);
      const bestanden = ['shared/mail-slimme-inbox.ts', 'backend/index.ts', 'backend/mail-zoek-duurzaam.ts', 'src/MailGesprekInhoud.tsx', 'src/mail/WatNodigBlok.tsx', 'shared/ai-bronnen.ts', 'shared/ai-vertaling.ts'];
      const nog = bestanden.filter((f) => /\/<\(\[\^>\]\+\)>\/\.exec\(/.test(bron(f)));
      check('g10c-toets-1: geen adresontleding met de EERSTE «<…>» meer in de buren (slimme inbox, opslag, zoekindex, gesprek, Wat nodig, AI-bronnen, AI-vertaling)', nog.length === 0, nog.join(', '));
    }

    // ---------------------------------------------------------------- g10c-toets-2: wachtrij — ruimte gecontroleerd, weigering en annulering met spoor
    {
      const pool = getPool();
      const meldingen: Array<{ userId: string; kind: string; title: string }> = [];
      registreerMelder(async (userId, _e, kind, title) => { meldingen.push({ userId, kind, title }); });
      const nep: MailTransport = { async resolve(_u, a) { return { accountId: a || 'acc-1', email: 'ik@example.test', displayName: 'Ik' }; }, async send() { return { id: 'm', threadId: 't' }; }, async draftUpsert() { return { id: 'd' }; }, async draftDelete() { /* niets */ } };
      setMailTransport(nep);
      try {
        const id = `g10c-mq2-${randomUUID()}`;
        await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email: `${id}@example.test`, role: 'member', status: 'approved', accessLevel: 'full' }]);
        const r = await enqueue(id, { to: 'o@example.test', subject: 's', html: '<p>x</p>', accountId: 'acc-1' }, Date.now() + 60_000, `g10c-${randomUUID()}`) as { item?: { id: string } };
        await pool.query(`UPDATE app.mail_queue SET ruimte='technisch', send_at = now() - interval '1 minute' WHERE id=$1`, [r.item?.id]);
        await runMailQueue(50);
        const rij = (await pool.query('SELECT status, last_error FROM app.mail_queue WHERE id=$1', [r.item?.id])).rows[0];
        check('g10c-toets-2: ingeplande mail uit de technische ruimte zonder geldige technische lade (dienst uit/bevroren/geen keuze) wordt niet verstuurd', rij?.status === 'failed' && /^MAIL_SPACE_/.test(rij.last_error), JSON.stringify(rij));
        const audit = (await pool.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id=$1 AND action='owner.mail.queue.refused'`, [id])).rows[0].n;
        check('g10c-toets-2: weigering bij verzenden laat een auditregel (owner.mail.queue.refused) en een melding aan de gebruiker', audit === 1 && meldingen.some((m) => m.userId === id && m.kind === 'mail_queue_refused'), `audit=${audit} meldingen=${JSON.stringify(meldingen)}`);
        const id2 = `g10c-mq2-${randomUUID()}`;
        await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id2, { email: `${id2}@example.test`, role: 'member', status: 'approved', accessLevel: 'full' }]);
        await enqueue(id2, { to: 'o@example.test', subject: 's', html: '<p>x</p>', accountId: 'acc-1' }, Date.now() + 60_000, `g10c-${randomUUID()}`);
        await enqueue(id2, { to: 'p@example.test', subject: 's', html: '<p>y</p>', accountId: 'acc-1' }, Date.now() + 90_000, `g10c-${randomUUID()}`);
        const n = await annuleerGeplandeMail(id2, 'MAIL_SENDER_BLOCKED');
        const audit2 = (await pool.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id=$1 AND action='owner.mail.queue.cancelled' AND (details->>'aantal')::int = 2`, [id2])).rows[0].n;
        check('g10c-toets-2: annuleren bij blokkeren/rolwijziging laat een auditregel met het aantal en een melding', n === 2 && audit2 === 1 && meldingen.some((m) => m.userId === id2 && m.kind === 'mail_queue_cancelled'), `n=${n} audit=${audit2}`);
        const api = bron('src/mail-opstel-api.ts'), menu = bron('src/MailPlanningMenu.tsx');
        check('g10c-toets-2/-4: nieuwe codes hebben uk/nl-tekst in de client (MAIL_BODY_TOO_LARGE, MAIL_SENDER_*, MAIL_SPACE_*) en het planningsmenu toont ze', ['MAIL_BODY_TOO_LARGE', 'MAIL_SENDER_NOT_ALLOWED', 'MAIL_SENDER_NO_WRITE', 'MAIL_SENDER_BLOCKED', 'MAIL_SPACE_'].every((c) => api.includes(c)) && menu.includes('wachtrijFoutTekst('));
      } finally { setMailTransport(null); registreerMelder(async () => undefined); }
    }

    // ---------------------------------------------------------------- g10c-toets-3: CAP_ONBEKEND laat een auditregel
    {
      const pool = getPool('systeem') as unknown as { query: (...a: unknown[]) => Promise<unknown> };
      const echt = pool.query;
      const uid = `g10c-cap-${randomUUID()}`;
      vergeetStaat();
      pool.query = async (...a: unknown[]) => { if (/ai_site_schakelaars|ai_gebruiker_caps/.test(String(a[0]))) throw new Error('timeout exceeded when trying to connect'); return (echt as (...x: unknown[]) => Promise<unknown>).apply(pool, a); };
      let uit: { isError?: boolean; content?: Array<{ text: string }> } = {};
      try { uit = await roepTool({ userId: uid, clientName: 'claude', ruimte: 'prive', lade: { userId: uid, ruimte: 'prive' } } as never, 'mail_read_message', {}) as typeof uit; } catch (e) { uit = { content: [{ text: `fout ${(e as Error).message}` }] }; } finally { pool.query = echt; vergeetStaat(); }
      const n = (await getPool().query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id=$1 AND action='owner.mcp.tool' AND details->>'reden'='CAP_ONBEKEND'`, [uid])).rows[0].n;
      check('g10c-toets-3: weigering CAP_ONBEKEND in roepTool met auditregel (reden CAP_ONBEKEND)', !!uit.isError && /CAP_ONBEKEND/.test(uit.content?.[0]?.text || '') && n === 1, `n=${n} ${uit.content?.[0]?.text?.slice(0, 80)}`);
    }

    // ---------------------------------------------------------------- g10c-toets-5: verwijderen/herstellen/opheffen veldgewijs
    {
      const pool = getPool();
      const id = `g10c-del-${randomUUID()}`;
      await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email: `${id}@example.test`, status: 'approved', role: 'member', entitlements: ['api-platform'] }]);
      // De beheerder blokkeert terwijl de gebruiker zichzelf verwijdert (momentopname nog «approved»).
      await pool.query(`UPDATE app.records SET data = data || '{"status":"blocked","entitlements":[]}'::jsonb WHERE tbl='users' AND id=$1`, [id]);
      await accountVerwijderdZetten(id, { deletedAt: Date.now(), deletionSource: 'self', recoverableUntil: Date.now() + 1000, updatedAt: Date.now() });
      const na = (await pool.query(`SELECT data FROM app.records WHERE tbl='users' AND id=$1`, [id])).rows[0].data;
      check('g10c-toets-5: verwijderen bewaart de ECHTE vorige status (blocked) en laat ingetrokken rechten staan', na.status === 'deleted' && na.statusVoorVerwijdering === 'blocked' && JSON.stringify(na.entitlements) === '[]', JSON.stringify({ s: na.status, v: na.statusVoorVerwijdering, e: na.entitlements }));
      await pool.query(`UPDATE app.records SET data = data || '{"status":"blocked"}'::jsonb WHERE tbl='users' AND id=$1`, [id]);
      const hersteld = await gebruikerVeldenZetten(id, { status: 'approved', updatedAt: Date.now() }, { alsStatus: 'deleted' });
      const st = (await pool.query(`SELECT data->>'status' AS s FROM app.records WHERE tbl='users' AND id=$1`, [id])).rows[0].s;
      check('g10c-toets-5: herstellen schrijft alleen als het account nog «deleted» is (geen overschrijven van een gelijktijdige blokkade)', !hersteld && st === 'blocked', `${hersteld} ${st}`);
      const idx = bron('backend/index.ts');
      const functie = (naam: string) => { const i = idx.indexOf(`async function ${naam}(`); return i < 0 ? '' : idx.slice(i, idx.indexOf('\n', i)); };
      const nogVolledig = ['retireAccount', 'deleteRecoverably', 'recoverDeletedAccount'].filter((f) => /db\.update\('users'/.test(functie(f)));
      check('g10c-toets-5: retireAccount/deleteRecoverably/recoverDeletedAccount schrijven het accountrecord niet meer volledig uit een momentopname', nogVolledig.length === 0, nogVolledig.join(', '));
      check('g10c-toets-5: decideAccessRequest controleert het schrijven vóór het verzoek als besloten wordt gemarkeerd', /if\s*\(!await gebruikerVeldenZetten\(next\.id, \{ \.\.\.granted/.test(functie('decideAccessRequest')));
      check('g10c-toets-5: eigenaar-opschonen zet alleen de rol (geen volledig record)', !/db\.update\('users'/.test(bron('backend/eigenaar-opschonen.ts')));
    }
  } finally {
    console.error = stil; console.warn = stilW;
    await closePool().catch(() => undefined);
  }

  return einde();
}
