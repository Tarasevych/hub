// Leesvenster, pakket 2 «Adaptive Mail Canvas» (24.10.2026): contextpaneel, brieven, «Вигляд», sneltoetsen en de telefoonbalk.
// Draaien: node scripts/eenheidstests.mjs lezer-context-20261024
// Макет (власник): «Контекст (колонка; на телефоні аркуш із вкладками): Хронологія · Вкладення · Зв'язки · Завдання; відправник:
// перевірка + вибір кольору контакту з палітри Пошти; безпека: TLS, зображення через сервер, трекери»; «Esc і «Назад» закривають
// спершу аркуш, потім лист»; «щільність не залежить від режиму вікна»; «клавіші: R, A, F, E, J/K, F6 (лист ⇄ контекст), ?».
//  A. puur (src/mail/lees-modus.ts): vorm van de context per breedte, «Вигляд» normaliseren, sneltoetsen (Latijns, AZERTY, Oekraïens via de
//     plaats van de toets, nooit met Ctrl/Alt/Meta of tijdens het typen), wanneer ze mogen, stap in de geschiedenis voor het blad.
//  B. puur (src/mail/gesprek-context.ts, src/mail-tekst-passend.ts): beelden tellen (extern/pixel/http, ook background="…"), .ics-tijd met
//     TZID (Brussel winter/zomer), hele dag; tekstgrootte in de HTML-brief (opmaak op breedte/k, ×k tonen; te breed → passend, nooit
//     groter dan gevraagd); de zoekopdrachten voor «Зв'язки».
//  C. structuur (renderToStaticMarkup): contextpaneel als kolom (breed) met alle secties, versiegroep, 13 kleuren (de gekozen aangevinkt),
//     «без ШІ», veiligheid; kader zet data-context / data-lezer-dichtheid / --lz-tekst; werkbalk: ∧ N з M ∨, «Відповісти», Контекст, Вигляд.
//  D. bron: werkruimte (sneltoetsen, context, antwoordvorm, afspraak uit .ics), brieftekst (geen enkele bron rechtstreeks: background,
//     <source>, SVG-href; toetsen uit het iframe), werkbalk (telefoonbalk, bel boven de balk), N10 (voorstel), kaart van de bestanden.
//  E. CSS: vaste rijen (lagen duwen niets weg), kolom/blad, telefoon tot onderaan, balk in «order», alleen tokens.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { BLAD_SLEUTEL, CONTEXT_SLEUTEL, GESCHIEDENIS_SLEUTEL, STANDAARD_WEERGAVE, TEKST_STAPPEN, WEERGAVE_SLEUTEL, bladStap, contextVorm, normaliseerWeergave, sneltoets, sneltoetsMag } from '../../src/mail/lees-modus';
import { beeldenTellen, icsHeleDag, icsTijd } from '../../src/mail/gesprek-context';
import { BEELDEN_MAX, BEELDEN_SLEUTEL, beeldenAltijd, vergeetBeeldenCache, zetBeeldenAltijd } from '../../src/mail/beelden-toestemming';
import { MAIL_BODY_MIN_SCHAAL, pasMailDocumentAan, tekstSchaal } from '../../src/mail-tekst-passend';

const lees = (f: string) => readFileSync(f, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Zelfde nagebootste browser als lees-venster-20261024 (canonical-service leest window bij het laden).
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'matchMedia', 'navigator', 'CSS', 'innerWidth', 'innerHeight'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://mail.tarasevych.com/postvak-in');
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = { hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null, addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } } };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  Object.defineProperty(g, 'navigator', { value: { platform: 'Linux', userAgent: 'eenheid' }, configurable: true, writable: true });
  Object.defineProperty(g, 'innerWidth', { value: 1600, configurable: true, writable: true });
  Object.defineProperty(g, 'innerHeight', { value: 900, configurable: true, writable: true });
  g.CSS = { escape: (s: string) => s };
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

/** Nagebootst maildocument voor pasMailDocumentAan: body is `inhoud` px breed, behalve als er meer plaats is (dan zo breed als body). */
function nepDoc(inhoud: number, viewport: number, hoogte = 500) {
  const px = (v: string) => (v && /px$/.test(v) ? parseFloat(v) : NaN);
  const body = { style: {} as Record<string, string>, get scrollWidth() { const w = px(this.style.width); return Math.max(Number.isFinite(w) ? w : viewport, inhoud); }, get offsetHeight() { const w = px(this.style.width); return Math.round(hoogte * (viewport / (Number.isFinite(w) ? w : viewport))); }, children: [] as unknown[] };
  const html = { style: {} as Record<string, string>, get scrollWidth() { return Math.max(viewport, body.scrollWidth); }, get offsetHeight() { return body.offsetHeight; }, getBoundingClientRect: () => ({ top: 0 }) };
  return { body, documentElement: html } as unknown as Document & { body: { style: Record<string, string> } };
}

const VANDAAG = Date.UTC(2026, 9, 24, 12, 0, 0);
const pdf = (naam: string, kb: number) => ({ providerAttachmentId: `bijl-${naam}`, filename: naam, contentType: 'application/pdf', sizeBytes: kb * 1024 });
const details = { dateHeader: '', via: '', mailedBy: '', signedBy: '', signatureDomain: '', authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' }, transport: { status: 'encrypted_observed' as const, evidence: '' }, list: { id: '', unsubscribeMode: '', oneClick: false }, headerCount: 10 };
const AFZ = 'Lotte Vermeulen <lotte.vermeulen@immo-voorbeeld.example>', IK = 'Pavlo <pavlo@ik.example>';
const brief = (id: string, from: string, dagen: number, att: ReturnType<typeof pdf>[], html = '<p>tekst</p>') => ({
  id, threadId: 't0', internetMessageId: '', subject: 'Huurcontract Voorbeeldstraat 12', from, to: 'pavlo@ik.example', cc: 'Bart Peeters <bart@immo-voorbeeld.example>', replyTo: '',
  receivedAt: VANDAAG - dagen * 864e5, snippet: `brief ${id}`, plainText: 'tekst', renderBody: { kind: 'html' as const, html, text: 'tekst', inlineResources: [] }, labelIds: ['INBOX'], attachments: att, details,
});
const GESPREK = [
  brief('m1', AFZ, 2, [pdf('Huurcontract-concept.pdf', 1600)]),
  brief('m2', IK, 1, [pdf('Huurcontract-getekend.pdf', 1700)]),
  brief('m3', AFZ, 0, [pdf('Huurcontract-ondertekend.pdf', 1800), { providerAttachmentId: 'bijl-ics', filename: 'plaatsbeschrijving.ics', contentType: 'text/calendar', sizeBytes: 900 }],
    '<table background="https://cdn.x.example/bg.png"><tr><td><img src="https://cdn.x.example/logo.png" width="120" height="32"></td></tr></table><p>tekst</p><img src="https://t.x.example/o.gif" width="1" height="1"><img src="http://oud.x.example/a.png">'),
];

export async function main(): Promise<number> {
  const { check, einde } = checker('lezer-context-20261024');

  // ------------------------------------------------------------------ A. puur: context, weergave, sneltoetsen
  check('A context: breed → kolom (aan) of uit; smaller → alleen een blad op verzoek (de kolom-voorkeur telt daar niet)',
    contextVorm('breed', true, false) === 'kolom' && contextVorm('breed', false, true) === 'uit' && contextVorm('midden', true, false) === 'uit'
    && contextVorm('midden', false, true) === 'blad' && contextVorm('smal', true, true) === 'blad');
  check('A «Вигляд»: onbekende of kapotte waarden → normaal/100 %; alleen de stappen 90/100/115/130 %',
    JSON.stringify(normaliseerWeergave(null)) === JSON.stringify(STANDAARD_WEERGAVE) && normaliseerWeergave({ dichtheid: 'ruim', tekst: 1.3 }).tekst === 1.3
    && normaliseerWeergave({ dichtheid: 'reus', tekst: 2 }).dichtheid === 'normaal' && normaliseerWeergave({ tekst: '1.15' }).tekst === 1.15 && normaliseerWeergave({ tekst: 1.2 }).tekst === 1
    && TEKST_STAPPEN.join() === '0.9,1,1.15,1.3');
  check('A externe beelden: standaard «Питати» (vragen), alleen «altijd» als het zo bewaard is',
    STANDAARD_WEERGAVE.beelden === 'vragen' && normaliseerWeergave({ beelden: 'altijd' }).beelden === 'altijd' && normaliseerWeergave({ beelden: 'ja' }).beelden === 'vragen' && normaliseerWeergave({}).beelden === 'vragen');
  {
    const g = globalThis as Record<string, unknown>, voor = Object.getOwnPropertyDescriptor(g, 'localStorage'), m = new Map<string, string>();
    Object.defineProperty(g, 'localStorage', { value: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); } }, configurable: true, writable: true });
    try {
      vergeetBeeldenCache();
      const leeg = beeldenAltijd('lotte@x.example');
      zetBeeldenAltijd('Lotte Vermeulen <LOTTE@X.example>', true);
      const na = beeldenAltijd('lotte@x.example') && beeldenAltijd('"L" <lotte@x.example>') && JSON.parse(m.get(BEELDEN_SLEUTEL) || '[]').join() === 'lotte@x.example';
      zetBeeldenAltijd('lotte@x.example', false);
      const weg = !beeldenAltijd('lotte@x.example');
      for (let i = 0; i < BEELDEN_MAX + 5; i++) zetBeeldenAltijd(`a${i}@x.example`, true);
      const lijst = JSON.parse(m.get(BEELDEN_SLEUTEL) || '[]') as string[];
      check('A «Завжди від цього відправника»: per adres (genormaliseerd), op dit apparaat, uit te zetten, hoogstens 300 (de oudste valt weg)',
        !leeg && na && weg && lijst.length === BEELDEN_MAX && lijst[0] === 'a5@x.example' && !beeldenAltijd('a0@x.example') && beeldenAltijd(`a${BEELDEN_MAX + 4}@x.example`) && !beeldenAltijd('geen-adres'));
    } finally { if (voor) Object.defineProperty(g, 'localStorage', voor); else delete g.localStorage; vergeetBeeldenCache(); }
  }
  check('A sleutels: «Вигляд» en «Контекст» per apparaat, blad met een eigen stap naast die van de brief',
    WEERGAVE_SLEUTEL === 'mail-lezer-weergave-v1' && CONTEXT_SLEUTEL === 'mail-lezer-context-v1' && BLAD_SLEUTEL === 'mrLezerBlad' && GESCHIEDENIS_SLEUTEL !== BLAD_SLEUTEL);
  const k = (key: string, extra: Record<string, unknown> = {}) => sneltoets({ key, ...extra } as { key: string }, false);
  check('A sneltoetsen: R A F E J K → antwoord, allen, doorsturen, archief, volgende, vorige; hoofdletter (CapsLock) ook',
    ['r', 'a', 'f', 'e', 'j', 'k'].map((x) => k(x)).join() === 'antwoord,allen,doorsturen,archief,volgende,vorige' && k('R') === 'antwoord');
  check('A nooit met Ctrl/Alt/Meta (browser en systeem), nooit met Shift+letter, nooit bij ingedrukt houden of tijdens het samenstellen (IME)',
    k('r', { ctrlKey: true }) === null && k('a', { metaKey: true }) === null && k('e', { altKey: true }) === null && k('j', { shiftKey: true }) === null && k('j', { repeat: true }) === null && k('k', { isComposing: true }) === null);
  check('A tijdens het typen niets (behalve F6, dat typt niets); «?» = overzicht op elke indeling (ook Shift+/), Shift+F6 niets',
    sneltoets({ key: 'r' }, true) === null && sneltoets({ key: 'F6' }, true) === 'wissel' && k('?', { shiftKey: true }) === 'hulp' && k('F6', { shiftKey: true }) === null);
  check('A Oekraïense indeling: de letter is «к» maar de toets is R → antwoord (KeyR); AZERTY: de letter telt («a» op de plaats van Q)',
    sneltoets({ key: 'к', code: 'KeyR' }, false) === 'antwoord' && sneltoets({ key: 'о', code: 'KeyJ' }, false) === 'volgende' && sneltoets({ key: 'ф', code: 'KeyA' }, false) === 'allen'
    && sneltoets({ key: 'a', code: 'KeyQ' }, false) === 'allen' && sneltoets({ key: 'й', code: 'KeyQ' }, false) === null && k('ArrowDown') === null && k('Enter') === null);
  check('A sneltoetsen mogen zoals Escape: volledig/telefoon altijd, naast de lijst en zwevend alleen met de focus in de brief, nooit geminimaliseerd',
    sneltoetsMag({ modus: 'volledig', geminimaliseerd: false, focusBinnen: false }) && !sneltoetsMag({ modus: 'rechts', geminimaliseerd: false, focusBinnen: false })
    && sneltoetsMag({ modus: 'zwevend', geminimaliseerd: false, focusBinnen: true }) && !sneltoetsMag({ modus: 'telefoon', geminimaliseerd: true, focusBinnen: true }));
  check('A blad met een eigen stap in de geschiedenis alleen waar de brief er zelf één heeft (telefoon, volledig)',
    bladStap('telefoon') && bladStap('volledig') && !bladStap('rechts') && !bladStap('onder') && !bladStap('zwevend'));

  // ------------------------------------------------------------------ B. puur: beelden, .ics, tekstgrootte, verbanden
  const b3 = beeldenTellen(GESPREK[2].renderBody.html);
  check('B beelden: logo + pixel + background="…" = 3 extern, 1 pixel (1×1), 1 onveilig (http)', b3.extern === 3 && b3.pixels === 1 && b3.onveilig === 1, JSON.stringify(b3));
  check('B pixels ook verborgen of via style (display:none, visibility:hidden, 1px); cid:/data: zijn geen externe beelden; zonder maat geen pixel',
    beeldenTellen('<img src="https://a.example/x" style="display:none">').pixels === 1 && beeldenTellen('<img src="https://a.example/x" style="width:1px;height:1px">').pixels === 1
    && beeldenTellen('<img src="cid:logo@x"><img src="data:image/png;base64,AA">').extern === 0 && beeldenTellen('<img src="https://a.example/x">').pixels === 0
    && beeldenTellen('<div style="background:url(https://a.example/b.png)">').extern === 1);
  // Brussel: winter UTC+1, zomer UTC+2 (de omrekening hangt niet af van de tijdzone van deze computer)
  check('B .ics met TZID=Europe/Brussels: 28 okt. 10:00 → 09:00 UTC (winter); 15 juli 10:00 → 08:00 UTC (zomer); met Z = UTC',
    icsTijd('20261028T100000', 'Europe/Brussels') === Date.UTC(2026, 9, 28, 9) && icsTijd('20260715T100000', 'Europe/Brussels') === Date.UTC(2026, 6, 15, 8)
    && icsTijd('20261028T100000Z', 'Europe/Brussels') === Date.UTC(2026, 9, 28, 10) && icsTijd('20261028T100000', 'Asia/Tokyo') === Date.UTC(2026, 9, 28, 1));
  check('B .ics: onbekende zone (Windows-naam) → plaatselijke tijd van de browser i.p.v. een fout; onleesbaar → 0; hele dag herkend',
    icsTijd('20261028T100000', 'W. Europe Standard Time') === new Date(2026, 9, 28, 10).getTime() && icsTijd('morgen') === 0 && icsHeleDag('20261028') && !icsHeleDag('20261028T100000'));
  check('B tekstgrootte: past de inhoud op breedte/k → precies k; te breed → zo groot als het kader toelaat, nooit groter dan gevraagd',
    tekstSchaal(615, 615, 800, 1.3) === 1.3 && Math.abs(tekstSchaal(700, 615, 800, 1.3) - 1.142) < 0.001 && tekstSchaal(889, 889, 800, 0.9) === 0.9 && Math.abs(tekstSchaal(1200, 889, 800, 0.9) - 0.666) < 0.001);
  const d130 = nepDoc(300, 800), p130 = pasMailDocumentAan(d130, 800, false, 1.3);
  check('B HTML-brief 130 %: opgemaakt op 615 px en ×1,3 getoond (zo breed als het kader), hoogte ×1,3, geen «зменшено»-balk',
    d130.body.style.width === '615px' && d130.body.style.transform === 'scale(1.3)' && p130.schaal === 1.3 && !p130.breed && p130.hoogte === Math.ceil(d130.body.offsetHeight * 1.3), JSON.stringify({ p130, s: d130.body.style }));
  const dBreed = nepDoc(1200, 800), pBreed = pasMailDocumentAan(dBreed, 800, false, 0.9), dGewoon = nepDoc(300, 800), pGewoon = pasMailDocumentAan(dGewoon, 800, false, 1);
  check('B HTML-brief 90 % en te breed (nieuwsbrief 1200 px): passend verkleind met de balk; 100 % blijft precies zoals vóór pakket 2 (geen transform)',
    pBreed.breed && Math.abs(pBreed.schaal - 0.666) < 0.001 && dBreed.body.style.width === '1200px' && !pGewoon.breed && pGewoon.schaal === 1 && !dGewoon.body.style.transform && MAIL_BODY_MIN_SCHAAL === 0.3, JSON.stringify({ pBreed, pGewoon }));
  const dOrig = nepDoc(1200, 800), pOrig = pasMailDocumentAan(dOrig, 800, true, 1.3);
  check('B «Оригінальний розмір» blijft ware grootte (de tekstgrootte telt dan niet): schuiven in de brief', pOrig.breed && pOrig.schaal === 1 && !dOrig.body.style.transform, JSON.stringify(pOrig));

  // ------------------------------------------------------------------ C. structuur
  const herstel = nepBrowser();
  try {
    const { verwantVragen } = await import('../../src/mail/ContextPaneel');
    const vr = verwantVragen(GESPREK, ['pavlo@ik.example']);
    check('B «Зв\'язки» zonder ШІ: zoeken op de afzenders (zonder mij) en op de onderscheidende woorden van het onderwerp',
      vr.length === 2 && vr[0] === 'from:lotte.vermeulen@immo-voorbeeld.example' && /^subject:\(huurcontract voorbeeldstraat\)$/.test(vr[1]), JSON.stringify(vr));
    check('B zoekopdracht veilig: geen aanhalingstekens/haakjes uit een adres in de zoektaal van Gmail',
      // SEC-002 (aanv-ronde1-02): normalizeMailAddress neemt het adres uit de LAATSTE <…> en weigert een ongeldig adres (aanhalingsteken,
      // haakjes) helemaal — vroeger werden die tekens weggeknipt en werd er toch op «abc@d.example» gezocht. Veilig is: nooit zulke tekens
      // in de zoektaal; een gewoon adres geeft nog steeds from:.
      !verwantVragen([{ from: 'X <a"b(c)@d.example>', subject: 'kort' }], []).some((q) => /["()]/.test(q))
      && verwantVragen([{ from: 'X <ab.c@d.example>', subject: 'kort' }], [])[0] === 'from:ab.c@d.example');

    const { default: LeesVenster } = await import('../../src/mail/LeesVenster');
    const { default: ContextPaneel } = await import('../../src/mail/ContextPaneel');
    const noop = () => undefined;
    const paneel = createElement(ContextPaneel, {
      lang: 'uk', thread: GESPREK as never, openId: 'm3', bron: { context: {}, accountId: 'a1', cacheAccountId: 'a1' }, mijnAdressen: ['pavlo@ik.example'],
      regels: [{ email: 'lotte.vermeulen@immo-voorbeeld.example', color: '#4a86e8' }], onKleur: noop, zoekBrieven: async () => [], onOpenBericht: noop, onToonInGesprek: noop,
      onOpenBijlage: noop, onDownloadBijlage: noop, onBewaarAlles: noop, onAfspraak: noop, onTaak: noop,
    });
    const html = renderToStaticMarkup(createElement(LeesVenster, { lang: 'uk', berichtId: 'm3', laden: false, paneel: 'none', geminimaliseerd: false, onMinimaliseer: noop, onSluit: noop }, paneel));
    check('C kader: data-context="kolom" in een breed venster (1600 px), dichtheid normaal, --lz-tekst 1 op het <article>',
      /<article[^>]*data-context="kolom"[^>]*data-lezer-dichtheid="normaal"[^>]*style="--lz-tekst:1"/.test(html), (/<article[^>]*>/.exec(html) || [''])[0]);
    check('C kolom: role=complementary met kop «Контекст» (без ШІ) en alle secties onder elkaar, geen tabbladen',
      /data-context-paneel="true" data-vorm="kolom" role="complementary"/.test(html) && ['Хронологія', 'Вкладення', 'Зв&#x27;язки', 'Завдання й події', 'Відправник', 'Безпека'].every((s) => new RegExp(`<h3 id="[^"]*"><svg[\\s\\S]*?</svg>${s}`).test(html)) && !html.includes('role="tablist"'), `${(/data-context-paneel[^>]*>/.exec(html) || [''])[0]} ${(html.match(/<h3[^>]*>[\s\S]{0,4000}?<\/h3>/g) || []).map((h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '§')).join(' | ')}`);
    check('C tijdlijn: drie brieven, één «ви тут» (de open brief, met v3), versies v1/v2/v3 bij hun brief',
      (html.match(/data-soort="bericht"/g) || []).length === 3 && (html.match(/data-hier="ja"/g) || []).length === 1 && /data-hier="ja"[\s\S]*?<em>v3<\/em>/.test(html) && html.includes('<em>v1</em>') && html.includes('<em>v2</em>'));
    check('C kleur van het contact op de tijdlijn (--ctx-kleur bij Lotte, niet bij mij)', (html.match(/--ctx-kleur:#4a86e8/g) || []).length >= 2 && /data-soort="bericht" style="--ctx-kleur:#4a86e8"/.test(html));
    check('C bijlagen: één versiegroep «3 версії» (v3 · остання … v1), de .ics bij «Інші файли», «Зберегти всі»',
      html.includes('3 версії') && html.includes('v3 · остання') && html.includes('Інші файли') && html.includes('plaatsbeschrijving.ics') && html.includes('Зберегти всі'));
    check('C verbanden: «без ШІ» en eerst «Шукаємо…» (zoeken loopt pas in de browser)', html.includes('без ШІ') && html.includes('Шукаємо в цій скриньці'));
    const radios = html.match(/<input type="radio"[^>]*>/g) || [];
    check('C kleur van het contact: 13 keuzes (geen + 12 van het palet), de blauwe aangevinkt, elk met een naam voor de schermlezer',
      radios.length === 13 && radios.filter((r) => /checked/.test(r)).length === 1 && html.includes('синій') && html.includes('Без кольору'), `${radios.length}`);
    check('C veiligheid: TLS gezien, 3 externe beelden via de server, 1 pixel, 1 http-beeld niet geladen, eerlijke noot over de controle',
      html.includes('Шифрування в дорозі (TLS)') && html.includes('Зовнішні зображення: 3') && html.includes('пікселі стеження: 1') && html.includes('(http) зображення не завантажено: 1') && html.includes('без списку трекерів'));
    check('C afzender: de laatste brief van iemand anders dan ik, met de controle van de provider (domein, SPF/DKIM/DMARC)',
      html.includes('lotte.vermeulen@immo-voorbeeld.example') && html.includes('з домену відправника') && html.includes('SPF pass · DKIM pass · DMARC pass'));

    // werkbalk in het kader: navigator, «Відповісти», Контекст, Вигляд
    const { default: MailReaderToolbar } = await import('../../src/MailLezerWerkbalk');
    const { defaultMailReaderToolbarPreference } = await import('../../src/MailSnelleInstellingen');
    const acties = ['archive', 'trash', 'read', 'star', 'snooze'].map((id) => ({ id, label: `actie ${id}`, icon: null, onSelect: noop })) as unknown as Parameters<typeof MailReaderToolbar>[0]['actions'];
    const kop = renderToStaticMarkup(createElement(LeesVenster, { lang: 'uk', berichtId: 'm3', laden: false, paneel: 'none', geminimaliseerd: false, onMinimaliseer: noop, onSluit: noop },
      createElement('header', null, createElement(MailReaderToolbar, { lang: 'uk', actions: acties, preference: defaultMailReaderToolbarPreference, busy: false, saving: false, error: '', onChange: noop, minimizeLabel: 'Згорнути лист', onMinimize: noop, closeLabel: 'Закрити', onClose: noop,
        navigatie: { index: 2, totaal: 18, vorige: noop, volgende: noop }, onReply: noop, zoeken: createElement('button', { className: 'zoek-proef' }) }))));
    check('C kop: ∧ «3 з 18» ∨ (groep met naam, K/J), «Відповісти» (R) vóór de acties, zoeken na de acties, Контекст (F6, aria-expanded/-controls), Вигляд',
      /role="group" aria-label="Лист 3 з 18"/.test(kop) && kop.includes('3 з 18') && /aria-keyshortcuts="K"/.test(kop) && /aria-keyshortcuts="J"/.test(kop)
      && /mail-reader-primair-antwoord" aria-label="Відповісти \(R\)"/.test(kop) && kop.indexOf('mail-reader-primair-antwoord') < kop.indexOf('data-reader-action-id="archive"')
      && kop.indexOf('zoek-proef') > kop.indexOf('data-reader-action-id="archive"') && /mail-reader-context-knop" aria-expanded="true" aria-controls="mail-context-paneel" aria-keyshortcuts="F6"/.test(kop)
      && kop.includes('mail-reader-weergave'));
    check('C eerste/laatste brief: ∧ uit op de eerste, ∨ uit op de laatste',
      /aria-label="Попередній лист \(K\)"[^>]*disabled=""/.test(renderToStaticMarkup(createElement(MailReaderToolbar, { lang: 'uk', actions: acties, preference: defaultMailReaderToolbarPreference, busy: false, saving: false, error: '', onChange: noop, minimizeLabel: 'x', onMinimize: noop, closeLabel: 'x', onClose: noop, navigatie: { index: 0, totaal: 18, vorige: noop, volgende: noop } }))));
  } finally { herstel(); }

  // ------------------------------------------------------------------ D. bron
  const ws = lees('src/GoogleMailWerkruimte.tsx'), wb = lees('src/MailLezerWerkbalk.tsx'), bt = lees('src/MailBerichtTekst.tsx'), gi = lees('src/MailGesprekInhoud.tsx'), n10 = lees('src/MailLezerN10Dialoog.tsx'), lv = lees('src/mail/LeesVenster.tsx');
  check('D werkruimte: sneltoetsen (R afzender, A allen, F doorsturen, E archiveren alleen als niets bezig is, J/K)',
    ws.includes("sneltoetsen={{antwoord:()=>{setReaderComposeMode('sender');setReaderReplySignal(value=>value+1)},allen:()=>{setReaderComposeMode('all');setReaderReplySignal(value=>value+1)},doorsturen:()=>setForwardAttachmentOpen(true),archief:()=>{if(!busy)void modifyMessage('archive')},volgende:()=>openReaderAdjacent(1),vorige:()=>openReaderAdjacent(-1)}}"));
  check('D werkruimte: antwoordvorm is een toestand (was vast «all»), «Відповісти всім» en de ШІ-concepten blijven «allen» (pakket 3: de ШІ-knoppen staan in de antwoordregel van het gesprek)',
    ws.includes('composeMode={readerComposeMode}') && !ws.includes("composeMode='all'") && ws.includes("onSelect:()=>{setReaderComposeMode('all');setReaderReplySignal(value=>value+1)}") && gi.includes("onUseReply={html=>{setReply(html);startReply('all')}}"));
  check('D werkruimte: contextpaneel met de brieven, mijn adressen, afzenderregels, zoeken in DEZE mailbox, kleur via setSenderColor, afspraak via N10',
    ws.includes('<ContextPaneel lang={lang} thread={threadMessages.length?threadMessages:[detail]} openId={detail.id}') && ws.includes('mijnAdressen={snapshot.accounts.map(item=>item.email)}') && ws.includes('regels={viewPreferences.senderRules}')
    && ws.includes("requestMailMessages({accountId:currentDetailAccountId,labelId:'',query:zoekterm,maxResults:max})") && ws.includes('onKleur={(from,kleur)=>void setSenderColor(') && ws.includes("onAfspraak={voorstel=>{setReaderAfspraakVoorstel(voorstel);void openReaderN10('event')}}"));
  check('D werkruimte: N10 krijgt het voorstel voor «event» en (pakket 3) «tasks»; gewone «Створити подію» en «Додати до завдань» beginnen leeg, sluiten wist het voorstel',
    ws.includes("voorstel={readerN10Mode==='event'||readerN10Mode==='tasks'?readerAfspraakVoorstel:null}") && ws.includes("onSelect:()=>{setReaderAfspraakVoorstel(null);void openReaderN10('event')}") && ws.includes("onSelect:()=>{setReaderAfspraakVoorstel(null);void openReaderN10('tasks')}") && ws.includes("onTaak={()=>{setReaderAfspraakVoorstel(null);void openReaderN10('tasks')}}") && ws.includes('setReaderN10Mode(null);setReaderAfspraakVoorstel(null)'));
  check('D werkruimte: «mail:open-related-message» (verwante brief uit de ШІ-vertaalbalk) opent de brief — alleen in een eigen account, anders dit account',
    ws.includes("window.addEventListener('mail:open-related-message',open);return()=>window.removeEventListener('mail:open-related-message',open)") && ws.includes('acc=cit.accountId&&snapshot.accounts.some(item=>item.id===cit.accountId)?String(cit.accountId):currentDetailAccountId'));
  check('D N10: titel, begin, duur en plaats uit het voorstel; plaats ook in de Google-concept-URL en in de .ics (LOCATION)',
    n10.includes('p.voorstel?.titel||p.subject') && n10.includes('localInput(new Date(p.voorstel.start))') && n10.includes('(p.voorstel.einde-p.voorstel.start)/60000') && n10.includes('location:eventPlace.trim()') && n10.includes('`LOCATION:${icsText(eventPlace.trim())}`'));
  check('D brieftekst: background="…" via de server (zoals <img>), <source>/<video>/<audio>/<track> zonder bron, SVG-href alleen #…, image-set weg',
    bt.includes("const bg=node.getAttribute('background');") && bt.includes("node.dataset.mailBackgroundSrc=v;node.removeAttribute('background')") && bt.includes("if(/^(SOURCE|VIDEO|AUDIO|TRACK|PICTURE)$/i.test(node.tagName))for(const a of['src','srcset','poster'])node.removeAttribute(a)")
    && bt.includes("if(node.namespaceURI==='http://www.w3.org/2000/svg')for(const a of['href','xlink:href'])") && bt.includes(".replace(/(?:-webkit-)?image-set\\([^)]*\\)/gi,'none')"));
  check('D brieftekst: externe beelden pas na «Показати» (geen verzoek, ook niet via de server), inline (cid:) altijd; buiten het leesvenster: bewaarde instelling, anders vragen (SEC-002 post-05)',
    bt.includes("if(!externToestaan&&/^https:/i.test(source)&&!inlineVan(source)){node.dataset.mailResourceState='verborgen';verborgen+=1;continue}") && bt.includes('instelling=beeldenInstelling(lv?.weergave)')
    && bt.includes("toestaan=instelling==='altijd'||altijdAfzender||eenmaal") && bt.includes('<BeeldenStrook lang={lang} aantal={verborgen}') && bt.includes("t('Показати один раз','Eén keer tonen')") && bt.includes('zetBeeldenAltijd(afzender,true)')
    && gi.includes('messageId={message.id} afzender={message.from}'));
  check('D brieftekst: sneltoetsen en Escape ook met de focus in de tekst (toets op het iframe, preventDefault terug), tekstgrootte uit het kader',
    bt.includes("doc.addEventListener('keydown',doorToets)") && bt.includes('frame.dispatchEvent(kopie);if(kopie.defaultPrevented)event.preventDefault()') && bt.includes("frame.contentDocument?.removeEventListener('keydown',doorToets)")
    && bt.includes('tekst=useLeesVenster()?.weergave.tekst??1') && bt.includes('origineelRef.current,tekstRef.current)'));
  check('D gesprek: «N попередні листи», foto + kleur, «кому/копія», ↩ op de laatste brief, versie op de kaart, afspraak uit de .ics, brief tonen vanuit de tijdlijn',
    gi.includes('<EerdereBrieven lang={lang}') && gi.includes("<span className='mail-thread-avatar' aria-hidden='true'><AfzenderFoto") && gi.includes("data-afz-kleur={kleur?'ja':undefined}") && gi.includes('ontvangerLijst(ontv.aan,lang,regels)')
    && gi.includes("{last&&<button type='button' className='mail-thread-message-antwoord'") && gi.includes('versie={versieVan(versieGroepen,message.id,item.providerAttachmentId)}') && gi.includes('<BriefAfspraken lang={lang}') && gi.includes('},[toonSignal?.n]);'));
  check('D telefoon: een blad boven de brief (Контекст, «Ще»/⋮, «?») ligt boven de meldingsbel — de bel is zolang verborgen en komt daarna terug',
    wb.includes(`const BLAD=".google-mail-reader[data-context='blad'],.google-mail-reader details.google-mail-reader-more[open],.google-mail-reader [data-lezer-hulp],.google-mail-reader [data-bron-blad]"`) && wb.includes("if(onderBlad&&!bel.dataset.lzOnderBlad){bel.dataset.lzOnderBlad='1';bel.style.visibility='hidden'}")
    && wb.includes("if(bel.dataset.lzOnderBlad){bel.style.visibility='';delete bel.dataset.lzOnderBlad}") && wb.includes("mo3.observe(art,{attributes:true,subtree:true,childList:true,attributeFilter:['open','data-context']})"));
  check('D onderwerp: eigen labels (naam + kleur) onder «N листів у гілці», hoogstens zes + «+N»; alleen voor het eigen account (de labellijst hoort bij dat account)',
    gi.includes("{briefLabels.length>0&&<span className='mail-thread-labels' role='list' aria-label={t('Мітки','Labels')}>") && gi.includes('briefLabels.slice(0,6).map(') && gi.includes("{'--label-kleur':item.kleur} as CSSProperties")
    && gi.includes('+{briefLabels.length-6}') && ws.includes("briefLabels={currentDetailAccountId===accountId?labels.filter(item=>item.type==='user'&&(detail.labelIds||[]).includes(item.id)&&item.name)"));
  check('D werkbalk: telefoon — Архів · Відкласти · Кошик · Ще · Відповісти onderaan («Ще» opent ⋮), Вигляд en «Згорнути» in ⋮ (ook in een smal venster); de bel schuift boven de balk',
    wb.includes("className='mail-reader-onderbalk'") && wb.includes("(['archive','snooze','trash'] as const)") && wb.includes('data-onderbalk-meer') && wb.includes("lv&&(lv.modus==='telefoon'||lv.breedte==='smal')&&<><WeergaveBlok") && wb.includes("[data-qa-id='canonical-notification-bell']") && wb.includes('bel.style.translate=`0 ${-nodig}px`'));
  check('D kader: Escape sluit eerst het blad (capture, lagen erboven gaan voor), «Назад» eerst het blad (eigen stap), F6 brief ⇄ context, «?» overzicht',
    lv.includes("document.addEventListener('keydown', opToets, true)") && lv.includes('sluitBlad(true)') && lv.includes('eigenBladStap.current = zetStap(\'1\', BLAD_SLEUTEL)') && lv.includes("if (s === 'wissel') { e.preventDefault(); wisselFocus(); return; }") && lv.includes('<SneltoetsenHulp'));
  const kaart = JSON.parse(lees('docs/kaart/bestandskaart.json')) as { toegevoegd: Array<{ pad: string; wat: string }> };
  const nieuw = ['src/mail/ContextPaneel.tsx', 'src/mail/context-paneel.css', 'src/mail/gesprek-context.ts', 'src/mail/gesprek-opmaak.css', 'src/mail/ics-gebeurtenissen.ts', 'src/mail/SneltoetsenHulp.tsx', 'src/mail/WeergaveKeuze.tsx', 'src/mail/beelden-toestemming.ts', 'tests/eenheid/gesprek-context-20261024.test.ts', 'tests/eenheid/lezer-context-20261024.test.ts'];
  check('D kaart «wat staat waar»: elk nieuw bestand van pakket 2 staat bij «toegevoegd» met wat erin staat', nieuw.every((p) => kaart.toegevoegd.some((t) => t.pad === p && t.wat.length > 20)), nieuw.filter((p) => !kaart.toegevoegd.some((t) => t.pad === p)).join(', '));

  // ------------------------------------------------------------------ E. CSS
  const cp = zc(lees('src/mail/context-paneel.css')), go = zc(lees('src/mail/gesprek-opmaak.css')), lvc = zc(lees('src/mail/lees-venster.css'));
  check('E vaste rijen: kop 1, ШІ-balk 2, gesprek de laatste rij — lagen met een eigen plaats (blad, overzicht) duwen niets naar nieuwe rijen',
    cp.includes('html body .google-mail-reader>header{grid-row:1;grid-column:1/-1}') && cp.includes('html body .google-mail-reader>section.mra{grid-row:2;grid-column:1/-1}') && cp.includes('html body .google-mail-reader>:is(section.mail-thread-content,section.mail-reader-content-loading){grid-row:-2;grid-column:1/-1}'));
  check('E kolom: tweede kolom van 368 px naast ШІ-balk en gesprek; blad: boven de brief onder de kop, op smal van onderen over de volle breedte',
    cp.includes("html body .google-mail-reader[data-context='kolom']{grid-template-columns:minmax(0,1fr) var(--ctx-breedte,368px)}") && cp.includes("[data-context='kolom']>.ctx-paneel{grid-column:2;grid-row:2/-1")
    && cp.includes("[data-context='blad']>.ctx-paneel{grid-area:2/1/-1/-1;z-index:31;justify-self:end") && cp.includes("[data-context='blad'][data-lees-breedte='smal']>.ctx-paneel{justify-self:stretch;align-self:end;width:auto;max-width:none;"));
  check('E telefoon: het venster tot onderaan (100 %, niet 98vh), de balk in «order»-volgorde onderaan, kop zonder ⋮/«Згорнути»/«Відповісти» (die staan onderaan of in ⋮)',
    lvc.includes("html body .google-mail-reader-backdrop[data-lees-modus='telefoon']>.google-mail-reader{height:100%;max-height:100%}") && go.includes('.mail-reader-onderbalk{order:10;grid-column:1/-1;')
    && go.includes("[data-lees-modus='telefoon'] .mail-reader-toolbar>.google-mail-reader-more>summary{display:none!important}"));
  check('E «Вигляд»: dichtheid compact/ruim in de brief, tekstgrootte voor tekstbrieven via --lz-tekst; koppen in het paneel zonder de schreefletter van h1–h3',
    go.includes("html body .google-mail-reader .mail-message-text-body{font-size:calc(var(--lz-tekst,1) * 1em)}") && go.includes("[data-lezer-dichtheid='compact'] .mail-thread-message-head") && go.includes("[data-lezer-dichtheid='ruim'] .mail-thread-message-body")
    && cp.includes('font-family:inherit;font-size:15px'));
  check('E «?»-overzicht boven de werkbalk (z-index 700): op een lage telefoon lag de kop er anders over',
    lvc.includes('html body .google-mail-reader>.lz-hulp-scherm{grid-area:1/1/-1/-1;z-index:710;') && lvc.includes('html body .google-mail-reader>.lz-hulp{grid-area:1/1/-1/-1;z-index:711;'));
  check('E labels: kleurstip uit de aanbieder, tekst in themakleur, lange namen met … (nooit breder dan de kop)',
    go.includes("background:var(--label-kleur,var(--muted))") && go.includes('max-width:min(24ch,100%)') && go.includes('.mail-thread-label-naam{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'));
  check('E geen hex-kleuren in de nieuwe CSS (alleen tokens); aanraken: doelen van 44 px', ![cp, go].some((c) => /#[0-9a-fA-F]{3,8}\b/.test(c)) && cp.includes('@media (pointer:coarse)') && go.includes('@media (pointer:coarse)'));

  return einde();
}
