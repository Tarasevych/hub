// Mobiele pass mail (19.10.2026, agent M). Melding: «вкладення не підлаштовуються до розмірів та теми, документи, листи просто
// вилазять за межі». Bewaakt de oorzaken en de fixes (de browserproef zelf staat in /tmp/m-proef, harness/m4-mobiel.tsx):
//  1. HTML-mail breder dan het kader werd afgekapt (body overflow-x:hidden) → meten en verkleinen binnen het kader, of ware grootte
//     met een eigen horizontale scroll in het kader (knop «Оригінальний розмір»).
//  2. Globale footer-regel uit index.css lekte in de bijlagekaart (marge 2rem) → naam/knoppen buiten de kaart.
//  3. Werkbank: .mail-viewer-cache-panel had inset:14px én width:100% → 28 px breder dan het kader.
//  4. Smal scherm: kaarten als raster, 44 px-doelen, PDF-bediening loopt door, vensters schermvullend met safe-area.
//  5. Thema: ШІ-balk volgde de OS-voorkeur i.p.v. het site-thema; PDF-omgeving vast lichtgrijs in donker; HTML-mail = helder papier.
import { readFileSync } from 'node:fs';
import { mailBodySchaal, pasMailDocumentAan, mailDocumentHoogte, MAIL_BODY_MIN_SCHAAL } from '../../src/mail-tekst-passend';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const zonderCommentaar = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** Inhoud van het eerste @media-blok dat met `kop` begint (haakjes geteld). */
const mediaBlok = (css: string, kop: string) => {
  const i = css.indexOf(kop); if (i < 0) return '';
  let d = 0, j = css.indexOf('{', i);
  for (let k = j; k < css.length; k++) { if (css[k] === '{') d++; else if (css[k] === '}' && --d === 0) return css.slice(j + 1, k); }
  return '';
};

type Stijl = Record<string, string>;
/** Minimaal nep-document: breedte/hoogte hangen af van de stijl zoals in de browser (max-width:100% knipt de body op het kader). */
function nepDocument(natuur: number, kader: number, hoogteBijNatuur: number, viewportHoogte = 0) {
  // scrollHeight gedraagt zich als in Chromium: minstens de viewport-hoogte (iframe) — precies wat de lus van F8 veroorzaakte.
  const body = { style: {} as Stijl, children: [] as unknown[], get scrollWidth() { return natuur; }, get scrollHeight() { return Math.max(hoogteBijNatuur, viewportHoogte); }, get offsetHeight() { return hoogteBijNatuur; }, getBoundingClientRect: () => ({ top: 0, bottom: hoogteBijNatuur, height: hoogteBijNatuur }) };
  const html = { style: {} as Stijl, get scrollWidth() { return Math.max(kader, body.style.overflowX === 'auto' ? natuur : kader); }, get scrollHeight() { return Math.max(hoogteBijNatuur, viewportHoogte); }, get offsetHeight() { return hoogteBijNatuur; }, getBoundingClientRect: () => ({ top: 0, bottom: hoogteBijNatuur, height: hoogteBijNatuur }), clientWidth: kader };
  return { doc: { body, documentElement: html } as unknown as Document, body, html };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('mobiel-mail');
  const W = '.';
  const body = lees(`${W}/src/MailBerichtTekst.tsx`), passend = zonderCommentaar(lees(`${W}/src/mail-mobiel-passend.css`)), kaart = lees(`${W}/src/MailBijlageKaart.tsx`);
  const index = zonderCommentaar(lees(`${W}/src/index.css`)), enh = zonderCommentaar(lees(`${W}/src/mail-lezer-verbeteringen.css`)), werk = zonderCommentaar(lees(`${W}/src/mail-bijlage-werkbank.css`));
  const ai = zonderCommentaar(lees(`${W}/src/mail/ai-vertaling-balk.css`));
  const smal = mediaBlok(passend, '@media (max-width:720px)');

  // ---------------- 1. mailinhoud past in het kader
  check('vóór: de sanitizer zet body overflow-x:hidden en max-width:100% (brede tabellen werden onzichtbaar afgekapt)', /body\.style\.overflowX='hidden'/.test(body) && /body\.style\.maxWidth='100%'/.test(body));
  check('schaal: 760 px nieuwsbrief in 328 px kader → 0.431; past al → 1; ongeldig → 1', mailBodySchaal(760, 328) === 0.431 && mailBodySchaal(300, 328) === 1 && mailBodySchaal(329, 328) === 1 && mailBodySchaal(0, 328) === 1 && mailBodySchaal(760, 0) === 1);
  check(`schaal: onder ${MAIL_BODY_MIN_SCHAAL} (onleesbaar) → 0 = horizontaal scrollen binnen het kader i.p.v. verder verkleinen`, mailBodySchaal(3000, 300) === 0 && mailBodySchaal(1000, 300) === 0.3);
  {
    const { doc, body: b, html } = nepDocument(760, 328, 1200);
    const r = pasMailDocumentAan(doc, 328, false);
    check('passend: body krijgt de natuurlijke breedte (max-width uit), wordt geschaald vanaf linksboven; html en body scrollen niet; iframe-hoogte = hoogte × schaal',
      r.breed && r.schaal === 0.431 && b.style.width === '760px' && b.style.maxWidth === 'none' && b.style.transform === 'scale(0.431)' && b.style.transformOrigin === '0 0' && html.style.overflow === 'hidden' && b.style.overflow === 'hidden' && r.hoogte === Math.ceil(1200 * 0.431), JSON.stringify(r));
    const o = pasMailDocumentAan(doc, 328, true);
    check('«Оригінальний розмір»: alles terug (geen transform, max-width 100%), het kader zelf scrolt horizontaal (body overflow-x:auto), +ruimte voor de schuifbalk',
      o.breed && o.schaal === 1 && b.style.transform === '' && b.style.width === '' && b.style.maxWidth === '100%' && b.style.overflowX === 'auto' && html.style.overflow === '' && o.hoogte === 1200 + 18, JSON.stringify(o));
    const { doc: smalDoc, body: b2 } = nepDocument(320, 328, 500);
    const v = pasMailDocumentAan(smalDoc, 328, false);
    check('mail die al past: niets geschaald, body blijft overflow-x:hidden', !v.breed && v.schaal === 1 && b2.style.transform === '' && b2.style.overflowX === 'hidden' && v.hoogte === 500);
  }
  check('MailMessageBody: gebruikt pasMailDocumentAan met de breedte van de iframe-viewport, volgt breedtewijziging via html van het document (ResizeObserver), toont de balk met «Оригінальний розмір»/«Вписати в екран»',
    /pasMailDocumentAan\(doc,doc\.documentElement\.clientWidth/.test(body) && /observer\.observe\(doc\.documentElement\)/.test(body) && body.includes('mail-message-fit-bar') && body.includes("'Оригінальний розмір'") && body.includes("'Вписати в екран'") && /aria-pressed=\{origineel\}/.test(body));
  // ---------------- F8 (live-audit 19.10): iframe groeide oneindig (906→1034→…→8400 px)
  check('F8 vóór/na: hoogte wordt NIET uit scrollHeight gehaald (die is in een iframe minstens de viewport-hoogte → lus) maar uit de lay-out (offsetHeight/kinderen)', !/scrollHeight/.test(lees(`${W}/src/mail-tekst-passend.ts`).replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')));
  {
    // Simulatie van de lus: iframe al 1034 px hoog, inhoud 906 px → gemeten hoogte moet 906 blijven, niet 1034.
    const { doc, html, body: b } = nepDocument(320, 328, 906, 1034);
    const r = pasMailDocumentAan(doc, 328, false);
    check('F8: bij iframe-hoogte (1034) > inhoud (906) meet pasMailDocumentAan de inhoud (906), zodat het kader weer krimpt', r.hoogte === 906, JSON.stringify(r));
    check('F8: html/body krijgen height:auto en min-height:0 (mails met body{height:100%} zouden anders het kader meten)', html.style.height === 'auto' && b.style.height === 'auto' && html.style.minHeight === '0' && b.style.minHeight === '0');
    const zwevend = { style: {} as Stijl, children: [{ getBoundingClientRect: () => ({ top: 0, bottom: 278, height: 278 }) }], offsetHeight: 0, getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }) };
    const z = mailDocumentHoogte({ body: zwevend, documentElement: { offsetHeight: 0, getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }), style: {} } } as unknown as Document);
    check('F8: alleen floats/absoluut gepositioneerde inhoud (html/body offsetHeight 0) → onderkant van de kinderen telt (278)', z === 278, String(z));
  }
  check('F8: MailMessageBody observeert het iframe zelf niet meer (eigen hoogte → ResizeObserver → opnieuw meten → lus) en negeert Δ ≤ 2 px', !/observer\.observe\(frame\)/.test(body) && /Math\.abs\(oud-nieuw\)<=2\?oud:nieuw/.test(body));
  check('MailMessageBody: geen crash als het iframe-document even geen documentElement heeft (wisselen van brief)', /if\(!doc\?\.documentElement\|\|!doc\.body\)return;/.test(body));
  check('donker thema: HTML-mail op expliciet helder papier (binnen het kader, met rand en binnenmarge)', /:where\(html\.theme-dark,html\.theme-plum-dark\) \.mail-message-html-paper\{[^}]*background:var\(--papier\)[^}]*color-scheme:light/.test(passend) /* 20.10.2026: --papier = altijd wit (src/ontwerp/tokens.css) */ && body.includes("className='mail-message-html-paper'"));
  check('balk-knop is een aanraakdoel van 44 px', /\.mail-message-fit-bar > button\{[^}]*min-height:44px/.test(passend));

  // ---------------- 2. bijlagekaart
  check('vóór: index.css heeft een globale footer-regel met marge 2rem die elke <footer> raakt', /(^|\})\s*footer\s*\{[^}]*margin:2rem auto 0/.test(index));
  check('na: de kaartvoet zet die globale footer-regel volledig terug (marge 0, geen rand, breedte auto, rij)', /html body \.mail-attachment-card > footer\{[^}]*margin:0[^}]*\}/.test(passend) && /\.mail-attachment-card > footer\{[^}]*border:0/.test(passend) && /\.mail-attachment-card > footer\{[^}]*width:auto/.test(passend));
  check('smal scherm: kaarten in een raster dat nooit breder is dan het kader (minmax(min(100%,…),1fr)), kaart 100 % breed', /\.mail-attachment-card-grid\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,240px\),1fr\)\)/.test(smal) && /\.mail-attachment-card\[data-presentation\]\{width:100%/.test(smal));
  check('smal scherm: actieknoppen van de kaart 44×44 en altijd zichtbaar (geen hover-only)', /footer > div button\{width:44px;height:44px/.test(smal) && !/\.mail-attachment-card:hover/.test(passend));
  check('PDF in een kaart altijd als miniatuur i.p.v. een <iframe> met de browser-PDF-balk en eigen scrollbar (F9, ook desktop)', /if\(kind==='pdf'\)return <MailAttachmentMiniature/.test(kaart) && !kaart.includes('<iframe'));
  // ---------------- F9 (live-audit 19.10): werkbank onder de lezer, Esc sloot niet, naam/grootte onzichtbaar, EN-labels
  check('F9: werkbank (bijlage-voorbeeld) ligt boven de lezer (z-index 232 > 230)', /html body \.google-mail-attachment-backdrop\{z-index:232\}/.test(passend) && /\.google-mail-reader-backdrop\{position:fixed;inset:0;z-index:230/.test(zonderCommentaar(lees(`${W}/src/mail-lezer-verbeteringen.css`)) + zonderCommentaar(lees(`${W}/src/google-mail-werkruimte.css`))));
  {
    const ws = lees(`${W}/src/GoogleMailWerkruimte.tsx`);
    check('F9: Esc sluit de werkbank direct (closeAttachment) en de dialoog krijgt focus bij openen (tabIndex -1 + focus), zodat Esc niet in het mail-iframe blijft hangen', /if\(event\.key==='Escape'\)\{event\.preventDefault\(\);closeAttachment\(\);return\}/.test(ws) && /dialoog\.focus\(\{preventScroll:true\}\)/.test(ws) && /ref=\{attachmentDialogRef\} tabIndex=\{-1\} className='google-mail-attachment-preview'/.test(ws));
  }
  check('F9: voorbeeldkaart — naam op een eigen regel boven de knoppen (kolom), knoppen wikkelen; op desktop 25 px zodat 5 knoppen in 132–150 px passen', /\.mail-attachment-card\[data-presentation='preview'\] > footer\{flex-direction:column/.test(passend) && /\.mail-attachment-card\[data-presentation='preview'\] > footer > div\{flex-wrap:wrap/.test(passend) && /@media \(width >= 721px\)\{html body \.mail-attachment-card\[data-presentation='preview'\] > footer > div button\{width:25px;height:25px\}\}/.test(passend));
  check('F9: kaartknoppen hebben uk/nl aria-labels (geen «Save»/«Download»/«Search match»)', !/aria-label=\{`Save /.test(kaart) && !/aria-label=\{`Download /.test(kaart) && !kaart.includes("'Search match'") && kaart.includes("t('Зберегти','Opslaan')") && kaart.includes("t('Завантажити','Downloaden')") && /<MailAttachmentCard lang=\{lang\}/.test(lees(`${W}/src/MailGesprekInhoud.tsx`)));
  // ---------------- F10/F11 (lezer): verouderde draad-cache, ⓘ-popover
  {
    const ws = lees(`${W}/src/GoogleMailWerkruimte.tsx`), draad = lees(`${W}/src/MailGesprekInhoud.tsx`), balk = lees(`${W}/src/MailLezerWerkbalk.tsx`);
    check('F10: gecachete draad zonder het geopende bericht (nieuw antwoord) wordt niet gebruikt → live ophalen', /mustInclude=''\)=>/.test(ws) && /\(!mustInclude\|\|cached\.some\(item=>item\.id===mustInclude\)\)/.test(ws) && /loadThread\(threadId,targetAccountId,false,request,messageId\)/.test(ws) && /loadThread\(detail\.threadId,currentDetailAccountId,false,detailRequest\.current,detail\.id\)/.test(ws));
    check('F11: ⓘ-popover staat bij de knop (rect.left) i.p.v. rechts uitgelijnd (altijd «links vast»); Esc sluit alleen de popover (capture + preventDefault) en de lezer negeert Esc zolang de popover open is', /Math\.max\(minLeft,rect\.left\)\)/.test(draad) && /event\.key==='Escape'&&!event\.defaultPrevented\)\{event\.preventDefault\(\);event\.stopPropagation\(\);closeDetails\(\)/.test(draad) && balk.includes(".mail-thread-message-details-popover,.mail-new-message-backdrop"));
  }
  // ---------------- F12 instellingen: twee koppen «Відправники»
  check('F12: instellingen hebben niet twee secties «Відправники»: «Фото й колір відправників» (lijstopmaak) en «Перевірка відправників» (Безпека)', lees(`${W}/src/MailSnelleInstellingen.tsx`).includes("t('Фото й колір відправників','Foto en kleur van afzenders')") && lees(`${W}/src/MailInstellingenGeraamte.tsx`).includes("label:'Перевірка відправників'") && lees(`${W}/src/afzenders/AfzendersBeheer.tsx`).includes("'Перевірка відправників', 'Afzenderverificatie'") && !lees(`${W}/src/MailSnelleInstellingen.tsx`).includes("t('Відправники','Afzenders')"));
  // ---------------- F1/F4/F6 contacten
  {
    const css = lees(`${W}/src/afzenders/contacten.css`), cw = lees(`${W}/src/afzenders/ContactenWeergave.tsx`), ws = lees(`${W}/src/GoogleMailWerkruimte.tsx`);
    // Punt 15 (19.10.2026): 240 bleek nog te laag — de zijbalk in de ladenstand staat op 260 (scrim 250), dus de melding lag
    // alsnog «під бічним меню». Nu 270, en op een breed scherm is het een echt venster (laag 100 000, vensters.tsx).
    check('F1: .ctv-melding ligt boven de zijbalk, ook in de ladenstand (260/scrim 250): z-index 270', /\.ctv-melding \{ position: fixed; z-index: 270;/.test(css) && !/z-index: 240/.test(css));
    check('F4: «Відкрити листи від нього» — de klaargezette resume-context (sessionStorage) wint van de server-context en wordt ook zonder/afwijkend accountId toegepast', /const pending=sessionStorage\.getItem\('tsv:cognitive-resume-pending:mail'\);if\(pending\)\{sessionStorage\.removeItem/.test(ws) && /saved=\{\.\.\.parsed,accountId:parsed\.accountId\|\|id\}/.test(ws) && /if\(!saved\)\{try\{saved=await loadCognitiveResume/.test(ws));
    check('F5: «Зняти позначку» in het paneel bij HANDMATIG_VERDACHT; historie toont vertaalde statussen; dialoog krijgt bekend Gmail-bewijs', cw.includes("c.status === 'verdacht' && c.reden === 'HANDMATIG_VERDACHT' && <button") && cw.includes("t(lang, 'Зняти позначку', 'Markering opheffen')") && cw.includes('statusTekst(lang, h.van)') && cw.includes('bekendeAuth={bekendeAuth(c.bewijs?.laatste)}') && lees(`${W}/src/afzenders/AfzenderDialoog.tsx`).includes('setAuth(bekendeAuth ?? null)'));
    check('F6: Esc sluit het detailpaneel; «Керування» krijgt ruimte boven het conceptwidget', /e\.key !== 'Escape' \|\| e\.defaultPrevented\) return;[^\n]*sluit\(\)/.test(cw) && /\.canonical-chrome:has\(\.mail-minimized-viewer\) \.ctv \{ padding-bottom: calc\(96px/.test(css));
  }
  // ---------------- F14/F15/F16 cloud
  {
    const drive = lees(`${W}/src/DriveBrowser.tsx`), cloud = lees(`${W}/src/CloudFunctioneelWeergave.tsx`), ccss = zonderCommentaar(lees(`${W}/src/cloud-functioneel.css`)), browser = lees(`${W}/backend/google-suite-browser.ts`);
    check('F14: bestandsviewer via portal op <body> (boven de zijbalk) en Esc sluit; MIME als leesbaar label; «Замінити файл» niet bij mappen', /return createPortal\(<div className='drive-viewer-backdrop cloud-file-workbench-backdrop'/.test(drive) && /,document\.body\)\}/.test(drive) && /event\.key==='Escape'&&!event\.defaultPrevented\)\{event\.preventDefault\(\);onClose\(\)\}/.test(drive) && drive.includes("file.folder?t('Папка','Map'):mimeLabel(file)") && drive.includes("{!file.folder&&<button onClick={()=>chooseFile(file.id)}>"));
    check('F14: «Звично» (actieve energiestand) accent + wit; «Відключити» met tekst niet in een 38 px-knop', /\.cloud-energy button\.active\{background:var\(--cf-accent,#315f7d\);[^}]*color:var\(--text-on-accent\)\}/.test(ccss) && /\.cloud-provider-account-disconnect\{width:auto;min-width:38px;white-space:nowrap/.test(ccss));
    check('F15: Drive-zoekopdracht per woord `name contains` OF `fullText contains` (Drive matcht «name contains» alleen op woordbegin/exacte frase)', browser.includes('clauses.push(driveZoekClausule(query))') && /export const driveZoekClausule=/.test(browser));
    check('F16: «Додати акаунт»/«Надати доступ» tonen eerst een korte bevestiging (uitleg + «Перейти до Google»/«Скасувати») vóór de doorverwijzing', cloud.includes('setConnectVraag({ provider, accountRole })') && cloud.includes("t('Перейти до Google', 'Naar Google')") && cloud.includes("t('Скасувати', 'Annuleren')") && /connectProviderNu\(connectVraag\.provider, connectVraag\.accountRole\)/.test(cloud) && /location\.assign\(response\.data\.authUrl\)/.test(cloud));
  }

  // ---------------- 3. werkbank
  check('vóór: cache-paneel = inset:14px (enhancements) + width:100% (workbench) → 28 px te breed', /\.mail-viewer-cache-panel\{position:absolute;inset:14px/.test(enh) && /\.mail-viewer-cache-panel\{width:100%/.test(werk));
  check('na: cache-paneel width/height auto zodat inset de maat bepaalt', /\.mail-viewer-cache-panel\{width:auto;height:auto\}/.test(passend));
  check('na: lange bestandsnaam in de kop afgekapt met … i.p.v. buiten beeld', /\.mail-workbench-title > strong\{[^}]*text-overflow:ellipsis/.test(passend));
  check('smal scherm: kop van de werkbank wikkelt, alle knoppen ≥ 44 px, «•••» blijft zichtbaar (labels-span wordt verborgen)', /\[data-workbench-layout\] > header\{display:flex;flex-wrap:wrap/.test(smal) && /min-width:44px;min-height:44px/.test(smal) && /\.mail-viewer-overflow > summary > span\{display:inline\}/.test(smal));
  check('smal scherm: PDF-bediening loopt door op een tweede regel (inline overflow-x:auto overschreven), knoppen 44 px', /\.mail-pdf-controls\{flex-wrap:wrap!important;overflow-x:visible!important/.test(smal) && /\.mail-pdf-controls button\{min-width:44px;min-height:44px\}/.test(smal));
  check('smal scherm: werkbank, bijlagevenster en voorbeeldvenster houden rekening met safe-area', (smal.match(/env\(safe-area-inset-(top|right|bottom|left),0px\)/g) || []).length >= 7 && /\.venster\.mail-bijlage-venster/.test(smal) && /\.venster\.voorbeeld-venster/.test(smal));
  check('smal scherm: voorbeeld-bijlagenlijst als raster i.p.v. een strook die buiten beeld loopt', /\.voorbeeld-bijlagenlijst\{grid-auto-flow:row!important/.test(smal));

  // ---------------- 4. thema
  check('ШІ-balk: geen prefers-color-scheme meer; donker volgt html.theme-dark/theme-plum-dark (zelfde specificiteit dankzij :where)', !/prefers-color-scheme/.test(ai) && (ai.match(/:where\(html\.theme-dark, html\.theme-plum-dark\)/g) || []).length >= 6);
  check('PDF-omgeving in donker thema = var(--surface) (pagina\'s blijven wit papier)', /:is\(html\.theme-dark,html\.theme-plum-dark\) \.mail-pdf-preview:not\(\.mail-pdf-preview-miniature\)\{background:var\(--surface\)\}/.test(passend));
  check('nieuwe CSS gebruikt alleen thematokens voor kader-/tekstkleuren (geen vaste donkere achtergronden)', !/background:#(?!fff\b)[0-9a-f]{3,6}/i.test(passend));

  // ---------------- 5. geen vaste breedtes > 320 px en overal geladen
  const vast = [...passend.matchAll(/(?<![-\w])(?:min-)?width:\s*(\d+)px/g)].map((m) => Number(m[1])).filter((n) => n > 320);
  check('mail-mobiel-passend.css zet nergens een vaste breedte > 320 px', vast.length === 0, vast.join(','));
  const laders = ['src/GoogleMailWerkruimte.tsx', 'src/MailBerichtTekst.tsx', 'src/MailBijlageKaart.tsx', 'src/MailBijlageVoorbeeld.tsx', 'src/MailBijlageVensters.tsx', 'src/voorbeeld/VoorbeeldVenster.tsx'];
  const zonder = laders.filter((f) => !/mail-mobiel-passend\.css/.test(lees(`${W}/${f}`)));
  check('de mobiele CSS wordt geladen door lezer, werkbank, kaart, losse vensters en voorbeeld (ook bij lazy laden)', zonder.length === 0, zonder.join(','));
  return einde();
}
