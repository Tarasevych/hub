// Stand «leesvenster» (pakket 1 «Adaptive Mail Canvas», 24.10.2026): één geopende brief (gesprek van drie) in elke vorm van het
// leesvenster — volledig, rechts, onder, zwevend en telefoon — met meting van geometrie en gedrag. Eigenaar: «один переглядач, який
// виглядає як професійна поштова програма на комп'ютері, залишається простим на телефоні та не втрачає можливостей під час зміни
// розміру вікна»; повний / розділений / плаваючий / мобільний «поводяться однаково».
//
// Per vorm en maat (mail-lezer-<vorm>):
//   geometrie — de brief overlapt de lijst niet in de gesplitste vormen (rechts: lijst links, brief rechts; onder: lijst boven), de kop
//               van de brief staat binnen het scherm, de knoppen van de kop zijn zelf aanklikbaar (elementFromPoint), het ⋮-paneel
//               hangt aan zijn knop;
//   gedrag    — focus gaat bij het openen naar de brief (volledig, telefoon, zwevend) of blijft in de lijst (rechts, onder);
//               Escape met de focus in de LIJST laat de brief open in de gesplitste vormen; Escape in de brief sluit hem en de focus
//               komt terug op de rij; «Назад» (telefoon) sluit de brief en blijft op de post;
//   telefoon  — geen kopactie verdwijnt: wat niet in de kop past, staat in ⋮.
import { join } from 'node:path';
import { mailNep, wachtOpLijst } from './stand-mail-nep';

type Page = import('playwright-core').Page;
export type LezerCtx = { uit: string; zeg: (s: string) => void; meting: (naam: string, p: Page, slecht: string, detail: string) => void };
export type LezerVorm = 'volledig' | 'rechts' | 'onder' | 'zwevend';

const AFZENDER = 'Lotte Vermeulen <lotte.vermeulen@immo-voorbeeld.example>';
// pakket 2: «ik» = het gekoppelde account van de nagebootste post (stand-mail-nep), zodat «кому: мені» te zien is
const IK = 'Pavlo <pavlo.tarasevych.stand@example.test>';
const IK_ADRES = 'pavlo.tarasevych.stand@example.test';
export const ALINEAS = [
  'Goedemorgen Pavlo,',
  'Bedankt om zo snel te tekenen. In bijlage vindt u de definitieve versie van het huurcontract, ondertekend door beide partijen, en het grondplan van het appartement.',
  'Ik stel voor om de plaatsbeschrijving te doen op woensdag 28 oktober om 10:00 ter plaatse. Kunt u dit tijdstip bevestigen vóór maandag 26 oktober en uw identiteitskaart meebrengen?',
  'De sleutels overhandigen we meteen na de plaatsbeschrijving.',
  'Met vriendelijke groeten,<br>Lotte Vermeulen<br>Immo Voorbeeld · Voorbeeldstraat 12, 9000 Gent',
];
const html = (a: string[]) => `<div>${a.map((p) => `<p>${p}</p>`).join('')}</div>`;
/** Pakket 2: een extern logo, een pixel van 1×1 en een tabel met background="…" — de browser mag geen van drie zelf ophalen (alles via de
 *  eigen server, /reader/remote-image); het contextpaneel telt ze («Безпека»). */
export const LEZER_EXTERN = ['https://cdn.immo-voorbeeld.example/logo.png', 'https://track.immo-voorbeeld.example/o.gif?u=pavlo', 'https://cdn.immo-voorbeeld.example/achtergrond.png'];
const htmlMetBeelden = (a: string[]) => `<table background="${LEZER_EXTERN[2]}" width="100%"><tr><td><img src="${LEZER_EXTERN[0]}" alt="Immo Voorbeeld" width="120" height="32"></td></tr></table>${html(a)}<img src="${LEZER_EXTERN[1]}" width="1" height="1" alt="">`;
/** .ics-uitnodiging (pakket 2): de plaatsbeschrijving over vier dagen om 10:00 (Brusselse tijd). */
export function lezerIcs(nu = Date.now()) {
  const d = new Date(nu + 4 * 864e5), ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Immo Voorbeeld//NL', 'METHOD:REQUEST', 'BEGIN:VEVENT', 'UID:plaatsbeschrijving-12@immo-voorbeeld.example', 'DTSTAMP:20261024T080000Z',
    `DTSTART;TZID=Europe/Brussels:${ymd}T100000`, `DTEND;TZID=Europe/Brussels:${ymd}T110000`, 'SUMMARY:Plaatsbeschrijving Voorbeeldstraat 12', 'LOCATION:Voorbeeldstraat 12\\, 9000 Gent',
    'ORGANIZER;CN=Lotte Vermeulen:mailto:lotte.vermeulen@immo-voorbeeld.example', 'DESCRIPTION:Plaatsbeschrijving ter plaatse. Identiteitskaart meebrengen.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
const tekst = (a: string[]) => a.map((p) => p.replace(/<br>/g, '\n')).join('\n\n');
const pdf = (naam: string, kb: number) => ({ providerAttachmentId: `bijl-${naam}`, filename: naam, contentType: 'application/pdf', mimeType: 'application/pdf', sizeBytes: kb * 1024 });
const details = { dateHeader: '', via: '', mailedBy: 'immo-voorbeeld.example', signedBy: 'immo-voorbeeld.example', signatureDomain: 'immo-voorbeeld.example', authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' }, transport: { status: 'encrypted_observed', evidence: 'TLS 1.3' }, list: { id: '', unsubscribeMode: '', oneClick: false }, headerCount: 18 };

/** Het gesprek: twee oudere berichten en het geopende (agc-m0 uit de nagebootste lijst). */
export function lezerGesprek(nu = Date.now()) {
  const basis = { internetMessageId: '', to: IK_ADRES, cc: 'Bart Peeters <bart@immo-voorbeeld.example>', replyTo: '', labelIds: ['INBOX'], sizeBytes: 48000, parseWarnings: [] as string[], details };
  const oud1 = { ...basis, id: 'lz-m1', threadId: 'agc-t0', internetMessageId: '<lz-m1@voorbeeld.example>', subject: 'Huurcontract Voorbeeldstraat 12 — concept', from: AFZENDER, receivedAt: nu - 2 * 864e5, snippet: 'Goedemiddag Pavlo, in bijlage het concept van het huurcontract…', plainText: 'Goedemiddag Pavlo,\n\nin bijlage het concept van het huurcontract.', renderBody: { kind: 'html', html: html(['Goedemiddag Pavlo,', 'in bijlage het concept van het huurcontract voor het appartement.']), text: 'in bijlage het concept', inlineResources: [] }, attachments: [pdf('Huurcontract-concept.pdf', 1600)] };
  const oud2 = { ...basis, id: 'lz-m2', threadId: 'agc-t0', internetMessageId: '<lz-m2@voorbeeld.example>', subject: 'Re: Huurcontract Voorbeeldstraat 12 — concept', from: IK, to: 'lotte.vermeulen@immo-voorbeeld.example', receivedAt: nu - 1 * 864e5, snippet: 'Dag Lotte, dank u. Ik heb het contract ondertekend…', plainText: 'Dag Lotte,\n\ndank u. Ik heb het contract ondertekend.', renderBody: { kind: 'html', html: html(['Dag Lotte,', 'dank u. Ik heb het contract ondertekend en in bijlage teruggestuurd.']), text: 'Ik heb het contract ondertekend', inlineResources: [] }, attachments: [pdf('Huurcontract-getekend.pdf', 1700)] };
  const nieuw = { ...basis, labelIds: ['INBOX', 'Label_huur', 'Label_lang'], id: 'agc-m0', threadId: 'agc-t0', internetMessageId: '<agc-m0@voorbeeld.example>', subject: 'Huurcontract Voorbeeldstraat 12 — ondertekende versie', from: AFZENDER, receivedAt: nu - 3 * 36e5, snippet: ALINEAS[1].slice(0, 90), plainText: tekst(ALINEAS), renderBody: { kind: 'html', html: htmlMetBeelden(ALINEAS), text: tekst(ALINEAS), inlineResources: [] }, attachments: [pdf('Huurcontract-ondertekend.pdf', 1800), { providerAttachmentId: 'bijl-plaatsbeschrijving.ics', filename: 'plaatsbeschrijving.ics', contentType: 'text/calendar', mimeType: 'text/calendar', sizeBytes: 1024 }] };
  return [oud1, oud2, nieuw];
}

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const lichaam = (r: { request: () => { postData: () => string | null } }) => { try { return JSON.parse(r.request().postData() || '{}') as Record<string, unknown>; } catch { return {}; } };

/** Nagebootste post + de routes van het leesvenster; de vorm via de weergavevoorkeuren (readingPane) — zwevend via localStorage in `na`. */
/** Eigen labels van het geopende gesprek (макет «Тема: … мітки»): een korte en een lange (die met … wordt afgekapt). */
export const LEZER_LABELS = [
  { id: 'Label_huur', name: 'Huur', type: 'user' as const, messagesTotal: 1, messagesUnread: 0, color: { textColor: '#ffffff', backgroundColor: '#16a765' } },
  { id: 'Label_lang', name: 'Voorbeeldstraat 12/Plaatsbeschrijving en huurwaarborg', type: 'user' as const, messagesTotal: 1, messagesUnread: 0, color: { textColor: '#ffffff', backgroundColor: '#4a86e8' } },
];

export async function lezerNep(page: Page, vorm: LezerVorm) {
  await mailNep(page, { eigenLabels: LEZER_LABELS });
  const pane = vorm === 'rechts' ? 'right' : vorm === 'onder' ? 'below' : 'none';
  await page.route('**/api/owner/mail/view-preferences/load', (r) => r.fulfill(json({ ok: true, preferences: { readingPane: pane, threadGrouping: true, mobileOverrides: {}, senderRules: [{ email: 'lotte.vermeulen@immo-voorbeeld.example', color: '#4a86e8' }] } })));
  await page.route('**/api/owner/mail/view-preferences/save', (r) => r.fulfill(json({ ok: true })));
  const gesprek = lezerGesprek();
  await page.route('**/api/owner/mail/google-suite/message', (r) => {
    const id = String(lichaam(r).messageId || '');
    const m = gesprek.find((x) => x.id === id) || { ...gesprek[2], id, threadId: `agc-t${id.replace('agc-m', '')}`, subject: `Лист ${id}`, attachments: [] };
    return r.fulfill(json({ source: 'live_on_demand', persisted: false, message: m }));
  });
  // «gelezen» bij het openen: zonder nagebootste wachtrij gaf de stand 409 en een melding over de brief heen
  await page.route('**/api/owner/mail/google-suite/state-intents/submit', (r) => { const b = lichaam(r); return r.fulfill(json({ ok: true, intent: { outboxId: `o-${Date.now()}`, intentId: b.intentId, accountId: b.accountId || '', messageId: b.messageId, action: b.action, status: 'succeeded', capability: 'supported', providerWrite: 'done', attemptCount: 1, maxAttempts: 5, retryAt: 0, acceptedAt: Date.now(), providerObservedAt: Date.now(), completedAt: Date.now(), errorCode: '', rollbackRequired: false, converged: true } })); });
  await page.route('**/api/owner/mail/google-suite/state-intents/status', (r) => { const b = lichaam(r); return r.fulfill(json({ ok: true, intents: ((b.outboxIds as string[]) || []).map((outboxId) => ({ outboxId, status: 'succeeded', converged: true })) })); });
  // pakket 2: de .ics-bijlage, beelden via de eigen server (een PNG van 1×1) en «Зв'язки» (zoeken op afzender of onderwerp)
  await page.route('**/api/owner/mail/google-suite/attachment', (r) => {
    const b = lichaam(r);
    if (!/\.ics$/i.test(String(b.filename || ''))) return r.fallback();
    const data = Buffer.from(lezerIcs(), 'utf8');
    return r.fulfill(json({ source: 'live_on_demand_chunk', persisted: false, accountId: b.accountId || '', messageId: b.messageId, attachmentId: b.attachmentId, filename: b.filename, contentType: 'text/calendar', sizeBytes: data.length, totalBytes: data.length, offset: 0, nextOffset: data.length, done: true, data: data.toString('base64url') }));
  });
  await page.route('**/api/owner/mail/google-suite/reader/n10/capabilities', (r) => r.fulfill(json({ taskWrite: false, eventWrite: false, filterWrite: false, ignoreThread: false })));
  await page.route('**/api/owner/mail/google-suite/reader/remote-image', (r) => r.fulfill(json({ source: 'server_image_proxy', persisted: false, contentType: 'image/png', sizeBytes: 68, data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4-vw1AAVsArjSAflTAAAAAElFTkSuQmCC' })));
  await page.route('**/api/owner/mail/google-suite/messages', (r) => {
    const q = String(lichaam(r).query || '');
    if (!/\b(from|subject):/.test(q)) return r.fallback();
    const nu = Date.now();
    const verwant = [
      { id: 'lz-v1', threadId: 'lz-tv1', subject: 'Praktische info plaatsbeschrijving', from: AFZENDER, to: IK_ADRES, snippet: 'Parkeren kan in de Kortrijksesteenweg…', receivedAt: nu - 5 * 864e5, labelIds: ['INBOX'], unread: false, starred: false },
      { id: 'lz-v2', threadId: 'lz-tv2', subject: 'Waarborg huurcontract Voorbeeldstraat 12', from: 'Bart Peeters <bart@immo-voorbeeld.example>', to: IK_ADRES, snippet: 'De huurwaarborg wordt op een geblokkeerde rekening…', receivedAt: nu - 9 * 864e5, labelIds: ['INBOX'], unread: false, starred: false },
      { id: 'agc-m0', threadId: 'agc-t0', subject: 'Huurcontract Voorbeeldstraat 12 — ondertekende versie', from: AFZENDER, to: IK_ADRES, snippet: '', receivedAt: nu - 3 * 36e5, labelIds: ['INBOX'], unread: false, starred: false },
    ];
    const lijst = /^from:/.test(q) ? verwant.filter((m) => m.from === AFZENDER) : verwant.filter((m) => /huurcontract/i.test(m.subject));
    return r.fulfill(json({ source: 'live_on_demand', persisted: false, labelId: '', query: q, maxResults: 25, messages: lijst, nextPageToken: '', resultSizeEstimate: lijst.length, observedAt: nu }));
  });
  await page.route('**/api/owner/mail/google-suite/thread', (r) => {
    const t = String(lichaam(r).threadId || '');
    return r.fulfill(json({ source: 'live_on_demand', persisted: false, threadId: t, messages: t === 'agc-t0' ? gesprek : [] }));
  });
}

type Doos = { x: number; y: number; w: number; h: number } | null;
const overlap = (a: Doos, b: Doos) => !!a && !!b && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

/** Geometrie en focus van het open leesvenster. */
async function meetLezer(page: Page) {
  return page.evaluate(() => {
    const r = (e: Element | null) => { if (!e) return null; const b = e.getBoundingClientRect(); if (!b.width || !b.height) return null; return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
    const zelf = (e: Element | null) => { if (!e) return 'geen'; const b = e.getBoundingClientRect(); if (!b.width || !b.height) return 'onzichtbaar'; const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); if (!t) return 'niets'; if (t === e || e.contains(t)) return 'zelf'; const h = t as HTMLElement; return `${h.tagName.toLowerCase()}.${String(h.className).split(' ')[0]}`; };
    const bd = document.querySelector('.google-mail-reader-backdrop'), art = document.querySelector('.google-mail-reader'), kop = art?.querySelector(':scope > header') || null;
    const lijst = document.querySelector('.google-mail-list');
    // zichtbaar deel van de lijst: doorsnede met de voorouders die afsnijden (de werkruimte schuift zelf in «onder») en het scherm
    const zichtbaar = (e: Element | null) => {
      if (!e) return null; const b = e.getBoundingClientRect(); let x1 = b.left, y1 = b.top, x2 = b.right, y2 = b.bottom;
      for (let p = e.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowY + cs.overflowX)) { const q = p.getBoundingClientRect(); x1 = Math.max(x1, q.left); y1 = Math.max(y1, q.top); x2 = Math.min(x2, q.right); y2 = Math.min(y2, q.bottom); } }
      x1 = Math.max(x1, 0); y1 = Math.max(y1, 0); x2 = Math.min(x2, innerWidth); y2 = Math.min(y2, innerHeight);
      return x2 - x1 > 0 && y2 - y1 > 0 ? { x: Math.round(x1), y: Math.round(y1), w: Math.round(x2 - x1), h: Math.round(y2 - y1) } : null;
    };
    const knoppen = kop ? [...kop.querySelectorAll('button, summary')].filter((k) => { const b = k.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(k).visibility !== 'hidden'; }) : [];
    const bedekt = knoppen.map((k) => ({ k: (k.getAttribute('aria-label') || k.textContent || '').trim().slice(0, 40), op: zelf(k) })).filter((x) => x.op !== 'zelf');
    const a = document.activeElement as HTMLElement | null;
    const meer = art?.querySelector('details.google-mail-reader-more > summary') || null;
    return {
      scherm: { w: innerWidth, h: innerHeight }, backdrop: r(bd), artikel: r(art), kop: r(kop), lijst: r(lijst), lijstZichtbaar: zichtbaar(lijst),
      modus: bd?.getAttribute('data-lees-modus') || '', breedte: bd?.getAttribute('data-lees-breedte') || '', venster: bd?.getAttribute('data-reader-venster') || '',
      rol: art?.getAttribute('role') || '', modaal: art?.getAttribute('aria-modal') || '', bedekt, meer: r(meer),
      focusBinnen: !!(a && art && art.contains(a)), focus: a ? `${a.tagName.toLowerCase()}${a.getAttribute('data-mail-message-id') ? `[${a.getAttribute('data-mail-message-id')}]` : ''}.${String(a.className).split(' ')[0]}` : 'geen',
    };
  });
}

/** Alle kopacties bereikbaar? Acties die in de kop verborgen zijn (≤ 430 px), moeten in ⋮ staan. */
async function kopActiesBereikbaar(page: Page) {
  const kop = await page.evaluate(() => [...document.querySelectorAll('.google-mail-reader .surface-header [data-reader-action-id]')].map((b) => ({ id: b.getAttribute('data-reader-action-id') || '', zichtbaar: (() => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; })() })));
  const verborgen = kop.filter((k) => !k.zichtbaar).map((k) => k.id);
  if (!verborgen.length) return { verborgen, ontbreekt: [] as string[] };
  // ⋮ openen: de knop in de kop, of op de telefoon «Ще» onderaan (pakket 2: daar staat ⋮ niet meer in de kop). Alleen een OPEN paneel telt,
  // en Escape alleen als het paneel echt open is — anders sluit Escape de brief zelf (en daarmee zijn stap in de geschiedenis).
  const kopKnop = page.locator('.google-mail-reader details.google-mail-reader-more > summary').first();
  if (await kopKnop.isVisible().catch(() => false)) await kopKnop.click({ timeout: 5000 }).catch(() => undefined);
  else await page.locator('.google-mail-reader .mail-reader-onderbalk [data-onderbalk-meer]').first().click({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(250);
  const inMeer = await page.evaluate(() => [...document.querySelectorAll('.google-mail-reader details.google-mail-reader-more[open] .mail-reader-overflow-panel [data-reader-action-id]')].map((b) => b.getAttribute('data-reader-action-id') || ''));
  if (await page.evaluate(() => !!document.querySelector('.google-mail-reader details.google-mail-reader-more[open]'))) await page.keyboard.press('Escape').catch(() => undefined);
  return { verborgen, ontbreekt: verborgen.filter((id) => !inMeer.includes(id)) };
}

export async function openRij(page: Page, id = 'agc-m0') {
  const rij = page.locator(`.google-mail-row[data-mail-message-id="${id}"]`).first();
  await rij.waitFor({ timeout: 15000 });
  const punt = () => rij.evaluate((a) => { const r = a.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + Math.min(18, r.height / 2) }; });
  let doel = await punt();
  // zoals een mens: een rij die (deels) buiten beeld of onder de bovenbalk ligt eerst in beeld schuiven (op 640×400 en 852×480 lag
  // de eerste rij na het openen van een andere brief boven de rand — de klik raakte dan de bovenbalk)
  const raak = (d: { x: number; y: number }) => page.evaluate(({ x, y, id }) => !!document.elementFromPoint(x, y)?.closest(`.google-mail-row[data-mail-message-id="${id}"]`), { ...d, id });
  if (!(await raak(doel))) { await rij.evaluate((a) => a.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300); doel = await punt(); }
  await page.mouse.click(doel.x, doel.y);
  await page.waitForSelector('.google-mail-reader:not(.content-loading)', { timeout: 15000 });
  await page.waitForTimeout(700);
}
const openEerste = (page: Page) => openRij(page, 'agc-m0');

/** Het element dat de lijst laat schuiven (de werkruimte of de pagina); gemarkeerd voor de volgende metingen. */
async function lijstSchuif(page: Page, zet?: number) {
  return page.evaluate((y) => {
    let e: Element | null = document.querySelector('.google-mail-list')?.parentElement || null, host: Element | null = null;
    while (e) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 4) { host = e; break; } e = e.parentElement; }
    host = host || document.scrollingElement;
    if (!host) return { top: -1, max: 0 };
    if (typeof y === 'number') host.scrollTop = y;
    return { top: Math.round(host.scrollTop), max: Math.round(host.scrollHeight - host.clientHeight) };
  }, zet);
}
/** Eerste rij die nu helemaal in beeld staat (met `nietOnderLezer`: en niet achter het leesvenster ligt — bij «onder»). */
const zichtbareRij = (page: Page, nietOnderLezer = true) => page.evaluate((uitsluiten) => {
  const art = uitsluiten ? document.querySelector('.google-mail-reader')?.getBoundingClientRect() : undefined;
  for (const r of document.querySelectorAll<HTMLElement>('.google-mail-row[data-mail-message-id]')) {
    const b = r.getBoundingClientRect();
    if (b.top >= 60 && b.bottom <= innerHeight - 8 && b.height > 20 && !(art && b.top < art.bottom && b.bottom > art.top && b.left < art.right && b.right > art.left)) return r.dataset.mailMessageId || '';
  }
  return '';
}, nietOnderLezer);

/** «Зменшити вікно» staat per browser in localStorage: elke stap begint met de vorm die hij test (anders zweefde het venster nog
 *  van een vorige stap). */
export async function zetZwevend(page: Page, aan: boolean) {
  const nu = await page.evaluate((a) => { try { const v = JSON.parse(localStorage.getItem('mail-reader-venster-v1') || 'null'); if (Boolean(v?.zwevend) === a && (!a || v.x === Math.max(80, innerWidth - 820))) return true; localStorage.setItem('mail-reader-venster-v1', JSON.stringify({ zwevend: a, x: Math.max(80, innerWidth - 820), y: 64, w: 760, h: Math.min(760, innerHeight - 90) })); return false; } catch { return true; } }, aan);
  if (!nu) { await page.reload({ waitUntil: 'load' }); await wachtOpLijst(page); }
}

export const lezerStap = (c: LezerCtx, vorm: LezerVorm) => async (page: Page) => {
  const w = page.viewportSize()?.width || 0, h = page.viewportSize()?.height || 0, telefoon = w < 721, slecht: string[] = [];
  await wachtOpLijst(page);
  await zetZwevend(page, vorm === 'zwevend');
  // muis uit de zijbalk (een open hover-lade legt een scherm over de pagina)
  await page.mouse.move(Math.round(w * 0.62), Math.round(h * 0.55));
  await page.waitForTimeout(500);
  await openEerste(page);
  const m1 = await meetLezer(page);
  const naam = `mail-lezer-${vorm}`;
  await page.screenshot({ path: join(c.uit, `${naam}-open-${w}.png`) }).catch(() => undefined);
  const gesplitst = !telefoon && (vorm === 'rechts' || vorm === 'onder');
  const verwachtModus = telefoon ? 'telefoon' : vorm;
  // ---- vorm, rol
  if (m1.modus !== verwachtModus) slecht.push(`data-lees-modus ${m1.modus || '-'} (verwacht ${verwachtModus})`);
  const rolVerwacht = gesplitst ? 'region' : 'dialog', modaalVerwacht = telefoon || vorm === 'volledig' ? 'true' : '';
  if (m1.rol !== rolVerwacht) slecht.push(`rol ${m1.rol || '-'} (verwacht ${rolVerwacht})`);
  if (m1.modaal !== modaalVerwacht) slecht.push(`aria-modal ${m1.modaal || '-'} (verwacht ${modaalVerwacht || '-'})`);
  // ---- geometrie
  if (!m1.artikel) slecht.push('geen leesvenster zichtbaar');
  if (m1.artikel && (m1.artikel.x < -1 || m1.artikel.x + m1.artikel.w > w + 1)) slecht.push(`leesvenster buiten het scherm (x ${m1.artikel.x}, w ${m1.artikel.w})`);
  if (m1.kop && (m1.kop.y < 0 || m1.kop.y + m1.kop.h > h + 1)) slecht.push(`kop buiten het scherm (y ${m1.kop.y}, h ${m1.kop.h})`);
  if (m1.bedekt.length) slecht.push(`kopknoppen bedekt: ${m1.bedekt.map((b) => `${b.k}→${b.op}`).join(', ')}`);
  // rechts: lijst en brief naast elkaar, nergens over elkaar
  if (gesplitst && vorm === 'rechts' && overlap(m1.artikel, m1.lijstZichtbaar)) slecht.push(`brief overlapt de lijst (${JSON.stringify({ brief: m1.artikel, lijst: m1.lijstZichtbaar })})`);
  // onder: de lijst schuift achter de brief door (zoals onder een blad); eis = de open rij staat boven de brief en ook de LAATSTE rij
  // kan boven de brief komen (vroeger liep het schuifvak ~60 px achter de brief door: de laatste brief was onbereikbaar)
  let onder = '';
  if (gesplitst && vorm === 'onder' && m1.artikel) {
    const rij = await page.evaluate(() => { const b = document.querySelector('.google-mail-row[data-mail-message-id="agc-m0"]')?.getBoundingClientRect(); return b ? { y: Math.round(b.top), h: Math.round(b.height) } : null; });
    const s0 = await lijstSchuif(page), s1 = await lijstSchuif(page, 1e6); await page.waitForTimeout(300);
    await page.screenshot({ path: join(c.uit, `mail-lezer-onder-einde-${w}.png`) }).catch(() => undefined);
    const laatste = await page.evaluate(() => { const r = [...document.querySelectorAll('.google-mail-row[data-mail-message-id]')].pop()?.getBoundingClientRect(); return r ? Math.round(r.bottom) : -1; });
    await lijstSchuif(page, s0.top); await page.waitForTimeout(200);
    onder = JSON.stringify({ rij, briefBoven: m1.artikel.y, laatste, max: s1.max });
    if (!rij || rij.y + rij.h > m1.artikel.y + 1) slecht.push(`onder: de open rij staat (deels) achter de brief (${onder})`);
    if (laatste < 0 || laatste > m1.artikel.y + 1) slecht.push(`onder: de laatste rij kan niet boven de brief komen (${onder})`);
  }
  if (!telefoon && vorm === 'rechts' && m1.artikel && m1.artikel.x + m1.artikel.w < w - 2) slecht.push(`rechts: brief staat niet tegen de rechterrand (x ${m1.artikel.x}, w ${m1.artikel.w})`);
  if (!telefoon && vorm === 'zwevend' && m1.venster !== 'zwevend') slecht.push('zwevend: venster niet zwevend');
  if (telefoon && m1.artikel && (m1.artikel.x > 1 || m1.artikel.w < w - 2 || m1.artikel.y > 1)) slecht.push(`telefoon: brief vult het scherm niet (${JSON.stringify(m1.artikel)})`);
  // ---- ⋮: paneel aan de knop
  if (m1.meer) {
    await page.locator('.google-mail-reader details.google-mail-reader-more > summary').first().click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(250);
    const paneel = await page.evaluate(() => { const p = document.querySelector('.google-mail-reader .mail-reader-overflow-panel'); if (!p) return null; const b = p.getBoundingClientRect(); return b.width ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } : null; });
    const eronder = paneel && paneel.y >= m1.meer.y + m1.meer.h - 4 && paneel.y <= m1.meer.y + m1.meer.h + 24, erboven = paneel && paneel.y + paneel.h <= m1.meer.y + 4 && paneel.y + paneel.h >= m1.meer.y - 24;
    if (paneel && (!(eronder || erboven) || paneel.x > m1.meer.x + m1.meer.w || paneel.x + paneel.w < m1.meer.x)) slecht.push(`⋮-paneel los van zijn knop (${JSON.stringify({ knop: m1.meer, paneel })})`);
    if (paneel && (paneel.x < 0 || paneel.x + paneel.w > w + 1)) slecht.push(`⋮-paneel buiten het scherm (${JSON.stringify(paneel)})`);
    await page.screenshot({ path: join(c.uit, `${naam}-meer-${w}.png`) }).catch(() => undefined);
    await page.keyboard.press('Escape').catch(() => undefined); await page.waitForTimeout(200);
  }
  // ---- alle kopacties bereikbaar
  const kop = await kopActiesBereikbaar(page);
  if (kop.ontbreekt.length) slecht.push(`kopacties verborgen en niet in ⋮: ${kop.ontbreekt.join(', ')}`);
  // ---- volledig: schuifpositie per brief (sluiten en dezelfde brief weer openen → waar je was); vóór het zoeken, want zoektermen
  //      blijven bewaard en brengen je bij het heropenen terecht naar de treffer
  let positie = '';
  if (vorm === 'volledig' && !telefoon) {
    const sc = () => page.evaluate(() => { const e = document.querySelector<HTMLElement>('.google-mail-reader > section.mail-thread-content'); return e ? { top: Math.round(e.scrollTop), max: Math.round(e.scrollHeight - e.clientHeight) } : null; });
    const voor = await page.evaluate(() => { const e = document.querySelector<HTMLElement>('.google-mail-reader > section.mail-thread-content'); if (!e) return null; e.scrollTop = Math.min(300, e.scrollHeight - e.clientHeight); e.dispatchEvent(new Event('scroll')); return Math.round(e.scrollTop); });
    if (voor && voor > 40) {
      await page.waitForTimeout(200);
      await page.locator('.google-mail-reader .mail-reader-back').first().click({ timeout: 5000 }).catch(() => undefined); await page.waitForTimeout(600);
      await openEerste(page); await page.waitForTimeout(400);
      const na = await sc();
      positie = JSON.stringify({ voor, na });
      if (!na || Math.abs(na.top - voor) > 4) slecht.push(`schuifpositie van de brief niet onthouden (${positie})`);
    } else positie = `overgeslagen (${voor})`;
  }
  // ---- zoeken in de brief springt naar de treffer (de inhoud schuift — niet de ШІ-balk, die ook een <section> is)
  let zoek = '';
  if (!telefoon && vorm === 'volledig') {
    const sectie = () => page.evaluate(() => { const e = document.querySelector<HTMLElement>('.google-mail-reader > section.mail-thread-content'); return e ? { top: Math.round(e.scrollTop), max: Math.round(e.scrollHeight - e.clientHeight) } : null; });
    await page.evaluate(() => { const e = document.querySelector<HTMLElement>('.google-mail-reader > section.mail-thread-content'); if (e) e.scrollTop = 0; });
    await page.locator('.google-mail-reader .mail-reader-search-trigger').first().click({ timeout: 5000 }).catch(() => undefined);
    const veld = page.locator('.mail-reader-search-dock input').first();
    if (await veld.waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) {
      await veld.fill('sleutels'); await page.waitForTimeout(900);
      await page.keyboard.press('Enter'); await page.waitForTimeout(1000);
      const st = await sectie();
      const teller = ((await page.locator('.mail-reader-search-dock strong[aria-live="polite"]').first().textContent().catch(() => '')) || '').trim();
      zoek = JSON.stringify({ st, teller });
      if (st && st.max > 40 && st.top === 0 && /^[1-9]/.test(teller)) slecht.push(`zoeken in de brief: treffer gevonden (${teller}) maar de inhoud schoof er niet naartoe (${zoek})`);
      await page.locator('.mail-reader-search-dock [aria-label="Закрити пошук у гілці"]').first().click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(300);
    } else zoek = 'geen zoekveld';
  }
  // ---- focus bij openen
  const focusVerwacht = telefoon || vorm === 'volledig' || vorm === 'zwevend';
  if (focusVerwacht && !m1.focusBinnen) slecht.push(`focus na openen niet in de brief (${m1.focus})`);
  if (!focusVerwacht && m1.focusBinnen) slecht.push('gesplitst: focus sprong uit de lijst naar de brief');
  // ---- zwevend: greep met het toetsenbord (pijltje = 16 px verder, Shift+pijltje = 16 px groter)
  let greep = '';
  if (!telefoon && vorm === 'zwevend') {
    const g = page.locator('.google-mail-reader .mail-reader-venster-greep').first();
    if (!(await g.count())) slecht.push('zwevend: geen greep voor het toetsenbord');
    else {
      const doos = () => page.locator('.google-mail-reader').first().boundingBox();
      // eerst 16 px smaller (Shift+←, minimum 520), dan 16 px opzij in een richting met plaats (het venster blijft binnen het scherm)
      const voor = await doos();
      await g.focus(); await page.keyboard.press('Shift+ArrowLeft'); await page.waitForTimeout(150);
      const midden = await doos();
      const naarRechts = !!midden && midden.x + midden.width + 16 <= w - 8;
      await page.keyboard.press(naarRechts ? 'ArrowRight' : 'ArrowLeft'); await page.waitForTimeout(200);
      const na = await doos();
      greep = JSON.stringify({ voor, midden, na, naarRechts });
      const dw = voor && midden ? Math.round(midden.width - voor.width) : 0, dx = midden && na ? Math.round(na.x - midden.x) : 0;
      if (!voor || !midden || !na || (voor.width - 16 >= 520 && dw !== -16) || Math.abs(dx) !== 16) slecht.push(`zwevend: pijltjes op de greep veranderen de grootte/plaats niet met 16 px (${greep})`);
    }
  }
  // ---- zwevend: het browservenster kleiner maken → het venster blijft binnen het scherm (en rechts van het menu)
  let kleiner = '';
  if (!telefoon && vorm === 'zwevend') {
    const k = { width: Math.max(760, w - 320), height: Math.max(500, h - 260) };
    await page.setViewportSize(k); await page.waitForTimeout(500);
    const b = await page.locator('.google-mail-reader').first().boundingBox();
    kleiner = JSON.stringify({ scherm: k, venster: b });
    if (!b || b.x < 0 || b.y < 0 || b.x + b.width > k.width + 1 || b.y + b.height > k.height + 1) slecht.push(`zwevend: na verkleinen van het browservenster valt het venster buiten het scherm (${kleiner})`);
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(400);
  }
  // ---- Escape met de focus in de lijst (gesplitst en zwevend): brief blijft open
  let escLijst = '';
  if (gesplitst || (!telefoon && vorm === 'zwevend')) {
    await page.locator('.google-mail-row[data-mail-message-id="agc-m1"] .mail-row-open-hit').first().focus().catch(() => undefined);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    const nogOpen = await page.locator('.google-mail-reader').count();
    escLijst = nogOpen ? 'open' : 'dicht';
    if (!nogOpen) { slecht.push('Escape in de LIJST sloot de brief'); await openEerste(page); }
  }
  // ---- «Назад» (telefoon en volledig): brief dicht, nog steeds op de post
  let terug = '';
  if (telefoon || vorm === 'volledig') {
    const url = page.url();
    await page.goBack({ timeout: 6000 }).catch(() => undefined); await page.waitForTimeout(800);
    const nogOpen = await page.locator('.google-mail-reader').count();
    terug = `${nogOpen ? 'open' : 'dicht'} ${page.url() === url ? 'zelfde-url' : page.url()}`;
    if (nogOpen) slecht.push('«Назад» sloot de brief niet');
    if (!/mail\./.test(page.url())) { slecht.push(`«Назад» verliet de post (${page.url()})`); await page.goForward({ timeout: 6000 }).catch(() => undefined); await wachtOpLijst(page).catch(() => undefined); }
    if (!(await page.locator('.google-mail-reader').count())) await openEerste(page);
  }
  // ---- Escape in de brief: dicht + focus op de rij
  await page.locator('.google-mail-reader').first().focus().catch(() => undefined);
  await page.evaluate(() => { const a = document.querySelector('.google-mail-reader') as HTMLElement | null; if (a && !a.contains(document.activeElement)) { a.setAttribute('tabindex', a.getAttribute('tabindex') || '-1'); a.focus(); } });
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  const naSluiten = await page.evaluate(() => { const a = document.activeElement as HTMLElement | null; return { open: document.querySelectorAll('.google-mail-reader').length, focus: a ? (a.closest('[data-mail-message-id]')?.getAttribute('data-mail-message-id') || `${a.tagName.toLowerCase()}.${String(a.className).split(' ')[0]}`) : 'geen' }; });
  if (naSluiten.open) slecht.push('Escape in de brief sloot hem niet');
  else if (naSluiten.focus !== 'agc-m0') slecht.push(`focus na sluiten niet op de rij (${naSluiten.focus})`);
  // ---- schuifpositie van de lijst: bedekt → terug naar de plek van vóór het openen; ernaast → je ziet na het sluiten nog dezelfde rijen
  //      (de lijst wordt breder als de brief dichtgaat; de browser houdt de rij in beeld — scrollTop zelf mag daarom verschuiven)
  let lijst = '';
  if (!naSluiten.open) {
    const s0 = await lijstSchuif(page, 260); await page.waitForTimeout(300);
    const id = await zichtbareRij(page);
    if (s0.max > 300 && id) {
      // met het toetsenbord (Enter op de rij): een muisklik midden in een rij kan op het oogje (voorbeeld) of een bijlage vallen
      await page.locator(`.google-mail-row[data-mail-message-id="${id}"] .mail-row-open-hit`).first().focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('.google-mail-reader:not(.content-loading)', { timeout: 15000 });
      await page.waitForTimeout(600);
      const bedekt = telefoon || vorm === 'volledig';
      let s1 = s0.top, anker = id;
      if (!bedekt) { s1 = (await lijstSchuif(page, s0.top + 120)).top; await page.waitForTimeout(250); anker = (await zichtbareRij(page, vorm === 'onder')) || id; }
      await page.locator('.google-mail-reader .mail-reader-back').first().click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(700);
      const s2 = await lijstSchuif(page);
      const inBeeld = await page.evaluate((rid) => { const r = document.querySelector(`.google-mail-row[data-mail-message-id="${rid}"]`)?.getBoundingClientRect(); return !!r && r.bottom > 60 && r.top < innerHeight - 20; }, anker);
      lijst = JSON.stringify({ id, anker, voor: s0.top, tijdens: s1, na: s2.top, inBeeld });
      if (bedekt && Math.abs(s2.top - s0.top) > 4) slecht.push(`lijst na sluiten op ${s2.top} px (verwacht ${s0.top}: de plek van vóór het openen)`);
      if (!inBeeld) slecht.push(`lijst na sluiten verschoven: rij ${anker} niet meer in beeld (${s0.top} → ${s1} → ${s2.top})`);
      if (!bedekt && s1 - s0.top > 40 && Math.abs(s2.top - s0.top) <= 4) slecht.push(`lijst sprong na sluiten terug naar de plek van vóór het openen (${s2.top})`);
    } else lijst = `overgeslagen (max ${s0.max}, rij ${id || '-'})`;
  }
  c.meting(`${naam}`, page, slecht.join(' · '), JSON.stringify({ vorm, w, h, m1, kop, zoek, greep, kleiner, positie, onder, escLijst, terug, naSluiten, lijst }));
};

/** Geminimaliseerde brief: Escape sluit hem niet (hij is onzichtbaar; sluiten wist de concepttekst), de knop ☰ op de telefoon blijft
 *  bruikbaar zolang de brief geminimaliseerd is. */
export const lezerGeminimaliseerd = (c: LezerCtx) => async (page: Page) => {
  const w = page.viewportSize()?.width || 0, slecht: string[] = [];
  await wachtOpLijst(page);
  await zetZwevend(page, false);
  await openEerste(page);
  // «Згорнути лист»: in de kop, of in een smal venster/op de telefoon in ⋮ (pakket 2: op de telefoon via «Ще» onderaan)
  const kopMin = page.locator('.google-mail-reader .mail-reader-toolbar > .mail-reader-minimize').first();
  if (await kopMin.isVisible().catch(() => false)) await kopMin.click({ timeout: 5000 });
  else {
    const kopMeer = page.locator('.google-mail-reader details.google-mail-reader-more > summary').first();
    if (await kopMeer.isVisible().catch(() => false)) await kopMeer.click({ timeout: 5000 }); else await page.locator('.google-mail-reader .mail-reader-onderbalk [data-onderbalk-meer]').first().click({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.locator('.google-mail-reader .mail-reader-overflow-groep[data-groep="venster"] button:has-text("Згорнути")').first().click({ timeout: 5000 });
  }
  await page.waitForTimeout(500);
  const menu = await page.evaluate(() => { const b = document.querySelector('.canonical-menu-toggle[data-sidebar-action="open-drawer"]'); if (!b) return 'geen'; const r = b.getBoundingClientRect(); return r.width > 0 && getComputedStyle(b).visibility !== 'hidden' && getComputedStyle(b).display !== 'none' ? 'zichtbaar' : 'verborgen'; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const stand = await page.evaluate(() => ({ backdrop: document.querySelectorAll('.google-mail-reader-backdrop').length, geminimaliseerd: !!document.querySelector('.google-mail-reader-backdrop.reader-minimized') }));
  if (!stand.backdrop) slecht.push('Escape sloot de GEMINIMALISEERDE brief');
  if (w < 721 && menu === 'verborgen') slecht.push('☰ verborgen terwijl de brief geminimaliseerd is');
  await page.screenshot({ path: join(c.uit, `mail-lezer-geminimaliseerd-${w}.png`) }).catch(() => undefined);
  c.meting('mail-lezer-geminimaliseerd', page, slecht.join(' · '), JSON.stringify({ w, menu, stand }));
};

/** Menu van de site rechts of als dock boven/onder (Налаштування → Меню): het leesvenster («volledig») staat in het vrije deel,
 *  niet onder het menu en niet erachter (vroeger begon de brief bij de rechterkant van het menu — met het menu rechts: buiten beeld). */
export const lezerDock = (c: LezerCtx, menuUrl: string, mailUrl: string, dock: 'rechts' | 'boven' | 'onder') => async (page: Page) => {
  const w = page.viewportSize()?.width || 0, h = page.viewportSize()?.height || 0, slecht: string[] = [];
  if (w < 721) throw new Error('SKIP menu rechts/dock alleen op de computer (telefoon: lade)');
  const zet = async (pos: string) => {
    await page.goto(`${menuUrl}#menu-indeling`, { waitUntil: 'load' });
    const blok = page.locator('details#menu-indeling').first();
    await blok.waitFor({ timeout: 15000 });
    if (!(await blok.evaluate((d) => (d as HTMLDetailsElement).open))) await blok.locator(':scope > summary').click();
    const k = page.locator(`[data-dock-positie="${pos}"]`).first();
    await k.waitFor({ timeout: 15000 }); await k.click(); await page.waitForTimeout(2500);
  };
  let m: Awaited<ReturnType<typeof meetLezer>> | null = null, zijbalk: Doos = null, echt = '';
  try {
    await zet(dock);
    await page.goto(mailUrl, { waitUntil: 'load' });
    await wachtOpLijst(page);
    await zetZwevend(page, false);
    echt = await page.evaluate(() => document.querySelector('main.canonical-chrome')?.getAttribute('data-dock') || '');
    if (echt !== dock) throw new Error(`SKIP menu ${dock} niet toegepast (data-dock ${echt || '-'})`);
    await page.mouse.move(Math.round(w * 0.5), Math.round(h * 0.6)); await page.waitForTimeout(400);
    await openEerste(page);
    m = await meetLezer(page);
    zijbalk = await page.evaluate(() => { const b = document.querySelector('.canonical-sidebar')?.getBoundingClientRect(); return b ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } : null; });
    await page.screenshot({ path: join(c.uit, `mail-lezer-dock-${dock}-${w}.png`) }).catch(() => undefined);
    const a = m.artikel;
    if (!a || a.w < 300 || a.h < 200) slecht.push(`leesvenster (bijna) onzichtbaar: ${JSON.stringify(a)}`);
    else {
      if (a.x < -1 || a.x + a.w > w + 1) slecht.push(`leesvenster buiten het scherm (${JSON.stringify(a)})`);
      if (zijbalk && overlap(a, zijbalk)) slecht.push(`leesvenster onder/over het menu (${JSON.stringify({ brief: a, menu: zijbalk })})`);
    }
    if (m.bedekt.length) slecht.push(`kopknoppen bedekt: ${m.bedekt.map((b) => `${b.k}→${b.op}`).join(', ')}`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  } finally { await zet('links').catch(() => undefined); }
  c.meting(`mail-lezer-dock-${dock}`, page, slecht.join(' · '), JSON.stringify({ dock, echt, w, h, artikel: m?.artikel, kop: m?.kop, bedekt: m?.bedekt, zijbalk }));
};

// ================================================================== pakket 2 «Adaptive Mail Canvas» (24.10.2026)
/** Contextpaneel, brieven, «Вигляд», sneltoetsen en de telefoonbalk in één vorm en maat (mail-lezer-context-<vorm>):
 *  vorm van de context — kolom ≥ 1100 px (naast de brief, niet erover), anders een blad op verzoek dat de focus krijgt; Escape en
 *  «Назад» sluiten eerst het blad, de brief blijft open; tijdlijn («ви тут», versies, verwante brieven gestippeld, afspraak),
 *  versiegroep v3/v2/v1, verbanden met reden en «без ШІ», afspraak uit de .ics → «В Агенду» vult het afspraakvenster in, kleur van
 *  het contact (radiogroep, gekozen kleur aangevinkt), veiligheid (TLS, beelden via de server, pixel); in de brief: «2 попередні
 *  листи», ring en streep in de kleur van het contact, «кому: мені», ↩, «v3 · остання», kaart van de afspraak; «?» toont de
 *  toetsen, J/K bladeren, F6 brief ⇄ context; «Вигляд» → ruim en 130 % (de HTML-brief schaalt mee); geen enkel verzoek van de
 *  browser naar een externe host (alles via de eigen server); telefoon: de hoofdacties onderaan, «Ще» opent ⋮ boven de balk. */
export const lezerContextStap = (c: LezerCtx, vorm: LezerVorm) => async (page: Page) => {
  const w = page.viewportSize()?.width || 0, h = page.viewportSize()?.height || 0, telefoon = w < 721, slecht: string[] = [], info: Record<string, unknown> = {};
  const extern: string[] = [];
  let viaServer = 0;
  const opVerzoek = (r: { url: () => string }) => { if (r.url().includes('/reader/remote-image')) viaServer += 1; try { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && !/(^|\.)tarasevych\.com$/.test(u.hostname)) extern.push(u.href.slice(0, 120)); } catch { /* data:, blob: */ } };
  page.on('request', opVerzoek);
  try {
    await wachtOpLijst(page);
    await zetZwevend(page, vorm === 'zwevend');
    await page.evaluate(() => { try { localStorage.removeItem('mail-lezer-weergave-v1'); localStorage.removeItem('mail-lezer-context-v1'); localStorage.removeItem('mail-beelden-afzenders-v1'); } catch { /* */ } });
    await page.mouse.move(Math.round(w * 0.62), Math.round(h * 0.55));
    await page.waitForTimeout(400);
    await openEerste(page);
    await page.waitForTimeout(600);
    const naam = `mail-lezer-context-${vorm}`;
    const staat = () => page.evaluate(() => {
      const art = document.querySelector<HTMLElement>('.google-mail-reader'), paneel = document.querySelector<HTMLElement>('.google-mail-reader [data-context-paneel]');
      const r = (e: Element | null | undefined) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } : null; };
      const a = document.activeElement as HTMLElement | null;
      return {
        context: art?.dataset.context || '', breedte: art?.dataset.leesBreedte || '', modus: art?.dataset.leesModus || '',
        paneel: r(paneel), rol: paneel?.getAttribute('role') || '', brief: r(art?.querySelector(':scope > section.mail-thread-content')),
        knop: document.querySelector('.google-mail-reader .mail-reader-context-knop')?.getAttribute('aria-expanded') || '',
        focusInPaneel: !!(paneel && a && paneel.contains(a)), focusOpKnop: !!(a && a.classList.contains('mail-reader-context-knop')), open: !!art,
        focus: a ? `${a.tagName.toLowerCase()}.${String(a.className).split(' ')[0]}` : 'geen',
      };
    });
    let s = await staat();
    info.begin = s;
    // ---- eigen labels onder het onderwerp: beide, in de kop (nooit breder), de lange afgekapt, kleurstip uit de aanbieder
    const lbl = await page.evaluate(() => {
      const kop = document.querySelector<HTMLElement>('.google-mail-reader .mail-thread-toolbar'), blok = kop?.querySelector<HTMLElement>('.mail-thread-labels');
      const chips = blok ? [...blok.querySelectorAll<HTMLElement>('.mail-thread-label')] : [], kb = kop?.getBoundingClientRect();
      return {
        aantal: chips.length, rol: blok?.getAttribute('role') || '', naam: blok?.getAttribute('aria-label') || '', namen: chips.map((x) => x.textContent || ''),
        stip: chips.map((x) => getComputedStyle(x, '::before').backgroundColor),
        buiten: chips.filter((x) => { const b = x.getBoundingClientRect(); return !kb || b.right > kb.right + 1 || b.left < kb.left - 1; }).length,
        afgekapt: chips.filter((x) => { const n = x.querySelector<HTMLElement>('.mail-thread-label-naam'); return !!n && n.scrollWidth > n.clientWidth + 1; }).length,
        overloop: kop ? kop.scrollWidth - kop.clientWidth : -1, hoogte: blok ? Math.round(blok.getBoundingClientRect().height) : 0,
      };
    });
    info.labels = lbl;
    if (lbl.aantal !== 2) slecht.push(`labels onder het onderwerp: ${lbl.aantal} (verwacht 2)`);
    if (lbl.rol !== 'list' || lbl.naam !== 'Мітки') slecht.push(`labels: rol ${lbl.rol || '-'} / naam ${lbl.naam || '-'} (verwacht list / «Мітки»)`);
    if (lbl.buiten) slecht.push(`labels: ${lbl.buiten} buiten de kop`);
    if (lbl.overloop > 1) slecht.push(`kop van het gesprek schuift horizontaal (${lbl.overloop} px)`);
    if (lbl.aantal === 2 && lbl.afgekapt !== 1) slecht.push(`labels: ${lbl.afgekapt} afgekapt (verwacht alleen de lange)`);
    if (lbl.aantal === 2 && (lbl.stip[0] !== 'rgb(22, 167, 101)' || lbl.stip[1] !== 'rgb(74, 134, 232)')) slecht.push(`labels: kleurstip ${lbl.stip.join(' / ')} (verwacht de kleur van de aanbieder)`);
    // ---- vorm van de context
    if (s.breedte === 'breed') {
      if (s.context !== 'kolom' || !s.paneel) slecht.push(`breed venster: context geen kolom (${s.context || '-'})`);
      if (s.paneel && s.brief && s.paneel.x < s.brief.x + s.brief.w - 1) slecht.push(`kolom overlapt de brief (${JSON.stringify({ paneel: s.paneel, brief: s.brief })})`);
      if (s.rol !== 'complementary') slecht.push(`kolom: rol ${s.rol || '-'} (verwacht complementary)`);
    } else {
      if (s.context !== 'uit' || s.paneel) slecht.push(`${s.breedte}: context staat al open zonder verzoek (${s.context})`);
      await page.locator('.google-mail-reader .mail-reader-context-knop').first().click({ timeout: 5000 });
      await page.waitForTimeout(500);
      s = await staat();
      info.blad = s;
      info.debug = await page.evaluate(() => {
        const art = document.querySelector<HTMLElement>('.google-mail-reader'); if (!art) return null;
        const cs = getComputedStyle(art), bd = art.parentElement ? getComputedStyle(art.parentElement) : null;
        const pn = art.querySelector<HTMLElement>('[data-context-paneel]'), pc = pn ? getComputedStyle(pn) : null;
        return { paneelCss: pc ? { w: pc.width, maxW: pc.maxWidth, ml: pc.marginLeft, mr: pc.marginRight, js: pc.justifySelf, bs: pc.boxSizing, bl: pc.borderLeftWidth } : null, rows: cs.gridTemplateRows, cols: cs.gridTemplateColumns, h: art.getBoundingClientRect().height, display: cs.display, pos: cs.position, bdPad: bd?.padding, bdH: art.parentElement?.getBoundingClientRect().height,
          kinderen: [...art.children].map((k) => { const c = getComputedStyle(k), r = k.getBoundingClientRect(); return `${k.tagName.toLowerCase()}.${String(k.className).split(' ')[0]} ${c.display}/${c.position} rij ${c.gridRowStart}-${c.gridRowEnd} kol ${c.gridColumnStart}-${c.gridColumnEnd} ${Math.round(r.top)}+${Math.round(r.height)} ord ${c.order}`; }) };
      });
      if (s.context !== 'blad' || !s.paneel) slecht.push(`Контекст opent geen blad (${s.context})`);
      if (s.rol !== 'dialog') slecht.push(`blad: rol ${s.rol || '-'} (verwacht dialog)`);
      if (!s.focusInPaneel) slecht.push(`blad: focus niet in het blad (${s.focus})`);
      if (s.paneel && (s.paneel.x < -1 || s.paneel.x + s.paneel.w > w + 1 || s.paneel.y + s.paneel.h > h + 1)) slecht.push(`blad buiten het scherm (${JSON.stringify(s.paneel)})`);
      if (telefoon) {
        const bel = await page.evaluate(() => { const b = document.querySelector<HTMLElement>("[data-qa-id='canonical-notification-bell']"); return b ? getComputedStyle(b).visibility : 'geen'; });
        info.belBlad = bel;
        if (bel === 'visible') slecht.push('telefoon: de meldingsbel ligt over het contextblad');
      }
      if (s.breedte === 'smal' && s.paneel && s.paneel.y + s.paneel.h < (await page.evaluate(() => { const b = document.querySelector('.google-mail-reader')?.getBoundingClientRect(); const balk = document.querySelector('.google-mail-reader .mail-reader-onderbalk')?.getBoundingClientRect(); return Math.round((balk?.top ?? b?.bottom ?? innerHeight) - 2); }))) slecht.push('smal: blad staat niet onderaan');
    }
    await page.screenshot({ path: join(c.uit, `${naam}-${w}.png`) }).catch(() => undefined);
    // ---- inhoud van het paneel (kolom: alles onder elkaar; blad: per tabblad)
    const tab = async (id: string) => { if ((await staat()).context !== 'blad') return; await page.locator(`.google-mail-reader .ctx-tabs [role="tab"]:has-text("${id}")`).first().click({ timeout: 4000 }).catch(() => undefined); await page.waitForTimeout(350); };
    const paneelTekst = () => page.evaluate(() => (document.querySelector('.google-mail-reader [data-context-paneel]') as HTMLElement | null)?.innerText || '');
    await page.waitForTimeout(800); // .ics en verwante brieven laden
    await tab('Хронологія');
    const tl = await page.evaluate(() => [...document.querySelectorAll('.google-mail-reader .ctx-tijdlijn > li')].map((li) => ({ soort: (li as HTMLElement).dataset.soort || '', hier: !!(li as HTMLElement).dataset.hier, toekomst: !!(li as HTMLElement).dataset.toekomst, tekst: (li as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 90), chips: [...li.querySelectorAll('.ctx-chips em')].map((e) => e.textContent || '').join(' ') })));
    info.tijdlijn = tl;
    if (tl.filter((x) => x.soort === 'bericht').length !== 3) slecht.push(`tijdlijn: ${tl.filter((x) => x.soort === 'bericht').length} brieven (verwacht 3)`);
    if (tl.filter((x) => x.hier).length !== 1) slecht.push('tijdlijn: geen (of meer dan één) «ви тут»');
    if (!tl.some((x) => x.soort === 'gebeurtenis' && x.toekomst)) slecht.push('tijdlijn: de komende afspraak uit de .ics ontbreekt');
    if (tl.filter((x) => x.soort === 'verwant').length < 2) slecht.push(`tijdlijn: ${tl.filter((x) => x.soort === 'verwant').length} verwante brieven (verwacht 2, gestippeld)`);
    if (!tl.some((x) => x.hier && /v3/.test(x.chips))) slecht.push('tijdlijn: versie v3 niet bij de open brief');
    await tab('Вкладення');
    const bl = await paneelTekst();
    info.bijlagen = bl.slice(0, 400);
    if (!/3 версії/.test(bl) || !/v3 · остання/.test(bl) || !/v1/.test(bl)) slecht.push('bijlagen: geen versiegroep «3 версії · v3 · остання … v1»');
    if (!/plaatsbeschrijving\.ics/.test(bl)) slecht.push('bijlagen: de .ics staat niet bij «Інші файли»');
    await tab("Зв'язки");
    const vw = await paneelTekst();
    info.verwant = vw.slice(0, 400);
    if (!/той самий відправник/.test(vw) || !/схожа тема/.test(vw) || !/без ШІ/.test(vw)) slecht.push('verbanden: reden («той самий відправник», «схожа тема») of «без ШІ» ontbreekt');
    await tab('Відправник');
    const kleur = await page.evaluate(() => { const g = document.querySelector('.google-mail-reader .ctx-kleuren'); const r = g ? [...g.querySelectorAll<HTMLInputElement>('input[type=radio]')] : []; return { aantal: r.length, gekozen: r.findIndex((x) => x.checked), legend: g?.querySelector('legend')?.textContent || '' }; });
    info.kleur = kleur;
    if (kleur.aantal !== 13 || kleur.gekozen < 1) slecht.push(`kleur van het contact: ${kleur.aantal} keuzes, gekozen ${kleur.gekozen} (verwacht 13 en de blauwe)`);
    const vl = await paneelTekst();
    if (!/TLS/.test(vl) || !/Зовнішні зображення: 3/.test(vl) || !/пікселі стеження: 1/.test(vl)) slecht.push(`veiligheid: TLS, 3 externe beelden of 1 pixel niet gemeld (${(vl.match(/Зовнішні[^.]*\./) || [''])[0]})`);
    // ---- afspraak → «В Агенду» vult het afspraakvenster in
    await tab('Завдання');
    const agenda = page.locator('.google-mail-reader .ctx-afspraak button:has-text("В Агенду")').first();
    if (!(await agenda.count())) slecht.push('afspraak uit de .ics niet in «Завдання й події»');
    else {
      await agenda.click({ timeout: 4000 }); await page.waitForTimeout(800);
      const n10 = await page.evaluate(() => { const d = document.querySelector('.mail-reader-n10-backdrop'); const v = [...(d?.querySelectorAll<HTMLInputElement>('input') || [])].map((i) => i.value); return { open: !!d, velden: v.slice(0, 4) }; });
      info.n10 = n10;
      if (!n10.open || !n10.velden.some((x) => /Plaatsbeschrijving Voorbeeldstraat 12/.test(x)) || !n10.velden.some((x) => /9000 Gent/.test(x)) || !n10.velden.some((x) => /^\d{4}-\d{2}-\d{2}T(09|10):00$/.test(x))) slecht.push(`«В Агенду»: afspraakvenster niet ingevuld (${JSON.stringify(n10)})`);
      await page.screenshot({ path: join(c.uit, `${naam}-agenda-${w}.png`) }).catch(() => undefined);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    }
    // ---- blad: Escape sluit het blad (brief open, focus op «Контекст»); «Назад» ook (telefoon, volledig)
    if ((await staat()).context === 'blad') {
      await page.locator('.google-mail-reader [data-context-paneel]').first().focus().catch(() => undefined);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      const na = await staat();
      info.escBlad = na;
      if (telefoon) {
        await page.waitForTimeout(200);
        const bel = await page.evaluate(() => { const b = document.querySelector<HTMLElement>("[data-qa-id='canonical-notification-bell']"); return b ? getComputedStyle(b).visibility : 'geen'; });
        info.belNaBlad = bel;
        if (bel === 'hidden') slecht.push('telefoon: de meldingsbel komt na het sluiten van het blad niet terug');
      }
      if (!na.open) slecht.push('Escape in het blad sloot de BRIEF');
      else { if (na.context !== 'uit') slecht.push('Escape sloot het blad niet'); if (!na.focusOpKnop) slecht.push(`focus na het blad niet op «Контекст» (${na.focus})`); }
      if (na.open && (telefoon || vorm === 'volledig')) {
        await page.locator('.google-mail-reader .mail-reader-context-knop').first().click({ timeout: 4000 }); await page.waitForTimeout(400);
        await page.goBack({ timeout: 5000 }).catch(() => undefined); await page.waitForTimeout(600);
        const t1 = await staat();
        info.terugBlad = t1;
        if (!t1.open) slecht.push('«Назад» met het blad open sloot de BRIEF (verwacht: eerst het blad)');
        else if (t1.context !== 'uit') slecht.push('«Назад» sloot het blad niet');
      }
    }
    // ---- brieven in het gesprek
    const brief = await page.evaluate(() => {
      const art = document.querySelector('.google-mail-reader');
      const laatste = art?.querySelector<HTMLElement>('.mail-thread-message.latest');
      return {
        eerdere: (art?.querySelector('.mail-thread-eerdere') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ') || '',
        kleur: laatste?.dataset.afzKleur || '', ring: laatste ? getComputedStyle(laatste.querySelector('.mail-thread-avatar') || laatste).boxShadow : '',
        ontvangers: laatste?.querySelector('.mail-thread-ontvangers')?.textContent || '', antwoord: !!laatste?.querySelector('.mail-thread-message-antwoord'),
        versie: laatste?.querySelector('.mail-attachment-versie')?.textContent || '', afspraak: (laatste?.querySelector('.mail-thread-afspraak') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').slice(0, 300) || '',
      };
    });
    info.brief = brief;
    if (!/2 попередні листи/.test(brief.eerdere)) slecht.push(`«2 попередні листи» ontbreekt (${brief.eerdere || '-'})`);
    if (brief.kleur !== 'ja' || !/rgb\(74, 134, 232\)/.test(brief.ring)) slecht.push(`kleur van het contact niet op de brief (streep/ring: ${brief.kleur || '-'}, ${brief.ring.slice(0, 60)})`);
    if (!/кому: мені/.test(brief.ontvangers) || !/копія: Bart Peeters/.test(brief.ontvangers)) slecht.push(`ontvangers: «кому: мені · копія: Bart Peeters» ontbreekt (${brief.ontvangers || '-'})`);
    if (!brief.antwoord) slecht.push('↩ op de laatste brief ontbreekt');
    if (!/v3 · остання/.test(brief.versie)) slecht.push(`versie op de bijlagekaart ontbreekt (${brief.versie || '-'})`);
    if (!/Plaatsbeschrijving Voorbeeldstraat 12/.test(brief.afspraak) || !/В Агенду/.test(brief.afspraak)) slecht.push(`kaart van de afspraak in de brief ontbreekt (${brief.afspraak || '-'})`);
    // «2 попередні листи» openen → de twee brieven staan er weer, ingeklapt
    await page.locator('.google-mail-reader .mail-thread-eerdere').first().click({ timeout: 4000 }).catch(() => undefined); await page.waitForTimeout(400);
    const na = await page.evaluate(() => ({ rij: !!document.querySelector('.google-mail-reader .mail-thread-eerdere'), brieven: document.querySelectorAll('.google-mail-reader .mail-thread-message').length }));
    if (na.rij || na.brieven !== 3) slecht.push(`«2 попередні листи» openen: ${na.brieven} brieven, rij ${na.rij ? 'blijft' : 'weg'}`);
    // ---- geen enkel verzoek van de browser naar buiten (beelden, background, pixel: via de eigen server)
    await page.waitForTimeout(600);
    info.extern = [...new Set(extern)];
    if (extern.length) slecht.push(`de browser haalde zelf externe bronnen op: ${[...new Set(extern)].join(', ')}`);
    // externe beelden: verborgen tot de eigenaar ze toont (макет: «N зовнішні зображення приховано · Показати один раз») — tot dan ook
    // GEEN verzoek via de eigen server (een pixel verraadt anders het openen); daarna via de server, nooit rechtstreeks
    const beeldStaat = () => page.evaluate(() => { const art = document.querySelector('.google-mail-reader .mail-thread-message.latest'); const d = art?.querySelector<HTMLIFrameElement>('iframe')?.contentDocument; return { staten: d ? [...d.querySelectorAll<HTMLElement>('[data-mail-resource-state]')].map((x) => x.dataset.mailResourceState) : [], bg: d ? [...d.querySelectorAll('[background]')].length : -1, strook: (art?.querySelector('[data-mail-beelden-strook]') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ') || '' }; });
    const b0 = await beeldStaat(), server0 = viaServer;
    info.beeldVoor = { ...b0, viaServer: server0 };
    if (b0.bg !== 0) slecht.push(`background="…" staat nog in de brief (${b0.bg})`);
    if (b0.staten.length !== 3 || b0.staten.some((x) => x !== 'verborgen')) slecht.push(`externe beelden niet verborgen vóór «Показати» (${b0.staten.join(',')})`);
    if (server0) slecht.push(`vóór «Показати» al ${server0} verzoek(en) voor beelden via de server`);
    if (!/3 зовнішні зображення приховано/.test(b0.strook)) slecht.push(`veiligheidsstrook ontbreekt (${b0.strook || '-'})`);
    const altijd = vorm === 'rechts';
    await page.locator(`.google-mail-reader .mail-thread-message.latest [data-mail-beelden-strook] button:has-text("${altijd ? 'Завжди від цього відправника' : 'Показати один раз'}")`).first().click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const b1 = await beeldStaat();
    info.beeldNa = { ...b1, viaServer, altijd };
    if (b1.staten.length !== 3 || b1.staten.some((x) => x !== 'loaded') || viaServer < 1 || b1.strook) slecht.push(`na «${altijd ? 'Завжди' : 'Показати один раз'}»: beelden niet via de server geladen of strook blijft (${JSON.stringify(info.beeldNa)})`);
    if (altijd) {
      const bewaard = await page.evaluate(() => { try { return localStorage.getItem('mail-beelden-afzenders-v1') || ''; } catch { return ''; } });
      if (!/lotte\.vermeulen@immo-voorbeeld\.example/.test(bewaard)) slecht.push(`«Завжди від цього відправника» niet bewaard (${bewaard || '-'})`);
    }
    // ---- sneltoetsen: ? → overzicht, Escape sluit het (brief blijft), J/K bladeren, F6 brief ⇄ context
    await page.locator('.google-mail-reader').first().focus().catch(() => undefined);
    await page.evaluate(() => { const a = document.querySelector<HTMLElement>('.google-mail-reader'); if (a && !a.contains(document.activeElement)) a.focus(); });
    await page.keyboard.press('Shift+Slash'); await page.waitForTimeout(300);
    let hulp = await page.evaluate(() => !!document.querySelector('[data-lezer-hulp]'));
    if (!hulp) { await page.keyboard.type('?'); await page.waitForTimeout(300); hulp = await page.evaluate(() => !!document.querySelector('[data-lezer-hulp]')); }
    if (!hulp) slecht.push('«?» toont het overzicht van de sneltoetsen niet');
    else {
      // niets ligt over het overzicht (de werkbalk heeft z-index 700): de sluitknop en de kop zijn echt bereikbaar
      const bedekt = await page.evaluate(() => {
        const h = document.querySelector('[data-lezer-hulp]'), punten: Array<[string, Element | null]> = [['sluiten', h?.querySelector('header button') || null], ['kop', h?.querySelector('h2') || null]];
        return punten.filter(([, e]) => { if (!e) return true; const r = e.getBoundingClientRect(); const x = document.elementFromPoint(r.left + Math.min(r.width / 2, 12), r.top + r.height / 2); return !x || !h?.contains(x); }).map(([n]) => n);
      });
      info.hulpBedekt = bedekt;
      if (bedekt.length) slecht.push(`«?»-overzicht bedekt (${bedekt.join(', ')})`);
      await page.screenshot({ path: join(c.uit, `${naam}-toetsen-${w}.png`) }).catch(() => undefined);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      const st = await page.evaluate(() => ({ hulp: !!document.querySelector('[data-lezer-hulp]'), open: !!document.querySelector('.google-mail-reader') }));
      if (st.hulp || !st.open) slecht.push(`Escape bij het overzicht: ${st.hulp ? 'overzicht blijft' : ''} ${st.open ? '' : 'brief dicht'}`);
    }
    const id = () => page.evaluate(() => document.querySelector('.google-mail-reader .mail-thread-message.latest')?.getAttribute('data-mail-thread-message-id') || '');
    const id0 = await id();
    await page.evaluate(() => { const a = document.querySelector<HTMLElement>('.google-mail-reader'); if (a && !a.contains(document.activeElement)) a.focus(); });
    await page.keyboard.press('j'); await page.waitForTimeout(1200);
    const id1 = await id();
    await page.evaluate(() => { const a = document.querySelector<HTMLElement>('.google-mail-reader'); if (a && !a.contains(document.activeElement)) a.focus(); });
    await page.keyboard.press('k'); await page.waitForTimeout(1200);
    const id2 = await id();
    info.jk = { id0, id1, id2 };
    if (!id1 || id1 === id0 || id2 !== id0) slecht.push(`J/K bladeren niet (${id0} → ${id1} → ${id2})`);
    // verwante brief uit de ШІ-vertaalbalk: «mail:open-related-message» opent hem (vroeger luisterde niemand)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('mail:open-related-message', { detail: { messageId: 'agc-m2', threadId: 'agc-t2' } })));
    await page.waitForTimeout(1200);
    const id3 = await id();
    info.verwantOpen = id3;
    if (id3 !== 'agc-m2') slecht.push(`«mail:open-related-message» opende de verwante brief niet (${id3})`);
    await page.keyboard.press('Escape').catch(() => undefined); await page.waitForTimeout(500);
    if (!(await page.locator('.google-mail-reader').count())) await openEerste(page); else await openEerste(page).catch(() => undefined);
    await page.waitForTimeout(500);
    if (!telefoon) {
      await page.evaluate(() => { const a = document.querySelector<HTMLElement>('.google-mail-reader'); a?.focus(); });
      await page.keyboard.press('F6'); await page.waitForTimeout(500);
      const f1 = await staat();
      await page.keyboard.press('F6'); await page.waitForTimeout(300);
      const f2 = await page.evaluate(() => { const a = document.activeElement; return !!(a && a.closest('.google-mail-reader > section.mail-thread-content')); });
      info.f6 = { f1, f2 };
      if (!f1.focusInPaneel) slecht.push(`F6: focus niet naar de context (${f1.context}, ${f1.focus})`);
      if (!f2) slecht.push('F6 (tweede keer): focus niet terug in de brief');
      if (f1.context === 'blad') { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    }
    // ---- «Вигляд»: ruim en 130 % (de HTML-brief wordt opgemaakt op breedte/1,3 en ×1,3 getoond)
    // knop «Вигляд» in de kop; in een smal venster staat «Вигляд» in ⋮ (kop), op de telefoon in «Ще» (onderaan)
    const wKnop = page.locator('.google-mail-reader .mail-reader-weergave > summary').first(), mKnop = page.locator('.google-mail-reader details.google-mail-reader-more > summary').first();
    if (await wKnop.isVisible().catch(() => false)) await wKnop.click({ timeout: 4000 }).catch(() => undefined);
    else if (await mKnop.isVisible().catch(() => false)) await mKnop.click({ timeout: 4000 }).catch(() => undefined);
    else await page.locator('.google-mail-reader .mail-reader-onderbalk [data-onderbalk-meer]').first().click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(300);
    // :visible — in een smal venster staat «Вигляд» in ⋮; de (verborgen) knop in de kop heeft dezelfde keuzes
    await page.locator('.google-mail-reader .lz-segment label:has-text("Просторо"):visible').first().click({ timeout: 4000 }).catch(() => undefined);
    await page.locator('.google-mail-reader .lz-segment label:has-text("130 %"):visible').first().click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(700);
    const wg = await page.evaluate(() => { const a = document.querySelector<HTMLElement>('.google-mail-reader'); const f = a?.querySelector<HTMLIFrameElement>('.mail-thread-message.latest iframe'); return { dichtheid: a?.dataset.lezerDichtheid || '', tekst: a?.style.getPropertyValue('--lz-tekst') || '', transform: f?.contentDocument?.body?.style.transform || '', bewaard: (() => { try { return localStorage.getItem('mail-lezer-weergave-v1') || ''; } catch { return ''; } })() }; });
    info.weergave = wg;
    await page.screenshot({ path: join(c.uit, `${naam}-ruim-${w}.png`) }).catch(() => undefined);
    if (wg.dichtheid !== 'ruim' || wg.tekst !== '1.3' || !/scale\(1\.3\)|scale\(1\.2\d*\)/.test(wg.transform) || !/"ruim"/.test(wg.bewaard)) slecht.push(`«Вигляд»: ruim/130 % niet toegepast (${JSON.stringify(wg)})`);
    await page.locator('.google-mail-reader .lz-segment label:has-text("Звичайно"):visible').first().click({ timeout: 4000 }).catch(() => undefined);
    await page.locator('.google-mail-reader .lz-segment label:has-text("100 %"):visible').first().click({ timeout: 4000 }).catch(() => undefined);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // ---- telefoon: hoofdacties onderaan; «Ще» opent ⋮ boven de balk
    if (telefoon) {
      const balk = await page.evaluate(() => { const b = document.querySelector('.google-mail-reader .mail-reader-onderbalk'); const r = b?.getBoundingClientRect(); return { r: r ? { y: Math.round(r.top), h: Math.round(r.height) } : null, knoppen: b ? [...b.querySelectorAll('button')].map((k) => (k.textContent || '').trim()) : [] }; });
      info.balk = balk;
      if (!balk.r || Math.abs(balk.r.y + balk.r.h - h) > 2) slecht.push(`telefoon: de actiebalk staat niet onderaan (${JSON.stringify(balk.r)})`);
      if (balk.knoppen.join('|') !== 'Архів|Відкласти|Кошик|Ще|Відповісти') slecht.push(`telefoon: knoppen onderaan ${balk.knoppen.join('|')}`);
      await page.waitForTimeout(300);
      const bel = await page.evaluate(() => { const b = document.querySelector("[data-qa-id='canonical-notification-bell']")?.getBoundingClientRect(); const k = document.querySelector('.google-mail-reader .mail-reader-onderbalk')?.getBoundingClientRect(); return b && k && b.width ? { bel: { y: Math.round(b.top), onder: Math.round(b.bottom) }, balk: Math.round(k.top), over: b.bottom > k.top && b.top < k.bottom && b.right > k.left && b.left < k.right } : null; });
      info.bel = bel;
      if (bel?.over) slecht.push(`telefoon: de meldingsbel bedekt de actiebalk (${JSON.stringify(bel)})`);
      await page.locator('.google-mail-reader .mail-reader-onderbalk [data-onderbalk-meer]').first().click({ timeout: 4000 }).catch(() => undefined); await page.waitForTimeout(400);
      const meer = await page.evaluate(() => { const p = document.querySelector('.google-mail-reader .google-mail-reader-more[open] > .mail-reader-overflow-panel'); const b = document.querySelector('.google-mail-reader .mail-reader-onderbalk')?.getBoundingClientRect(); const r = p?.getBoundingClientRect(); return { open: !!p, onder: r && b ? Math.round(r.bottom) <= Math.round(b.top) + 1 : false }; });
      info.meer = meer;
      if (!meer.open || !meer.onder) slecht.push(`telefoon: «Ще» opent ⋮ niet boven de balk (${JSON.stringify(meer)})`);
      const belMeer = await page.evaluate(() => { const b = document.querySelector<HTMLElement>("[data-qa-id='canonical-notification-bell']"); return b ? getComputedStyle(b).visibility : 'geen'; });
      info.belMeer = belMeer;
      if (meer.open && belMeer === 'visible') slecht.push('telefoon: de meldingsbel ligt over het ⋮-blad');
      await page.screenshot({ path: join(c.uit, `${naam}-meer-${w}.png`) }).catch(() => undefined);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    }
    c.meting(naam, page, slecht.join(' · '), JSON.stringify({ vorm, w, h, ...info }));
  } finally {
    page.off('request', opVerzoek);
    await page.evaluate(() => { try { localStorage.removeItem('mail-lezer-weergave-v1'); localStorage.removeItem('mail-lezer-context-v1'); localStorage.removeItem('mail-beelden-afzenders-v1'); } catch { /* */ } }).catch(() => undefined);
  }
};
