// Pakket 3 «Adaptive Mail Canvas» (24.10.2026): ШІ in de brief met controle van de bronnen, tweetalig lezen — de onderdelen in de lezer.
// Draaien: node scripts/eenheidstests.mjs lezer-ai-20261024
// Макет (власник): «ШІ-блок «Що від вас потрібно?» («ШІ · не частина листа»): пункти з чипом джерела «лист 3 · §3» і терміном; підвал
// «Кожен пункт знайдено дослівно в оригіналі (3 з 3)» і хто склав»; «смуга перекладу: Оригінал / Переклад / Порівняти»; «Порівняти: таблиця
// абзаців з виділеним абзацом-джерелом і позначкою «Джерело для 2 пунктів ШІ · знайдено дослівно»»; аркуш «Звідки це?»; «Контекст →
// завдання й події: з джерелами (§3, .ics)»; «вкладення: група версій … Порівняти»; «Вигляд: Щільність, Мова листа, Зовнішні зображення»;
// «рядок відповіді: Усім, Переслати, підказки ШІ (пунктир), тон»; правила «оригінал завжди доступний», «результати ШІ позначено окремо».
//  A. «Що від вас потрібно?» (renderToStaticMarkup in het kader): eenvoudig ontleden zonder model — merk «Авто», herkomst, punten met
//     bronchip en termijn, «Коротко», voet met de telling; nl; «het laatste bericht is van u»; geen knop «Уточнити з ШІ» zonder agent.
//     Voorstel voor taken/Агенда: titel, begin uit de termijn (hele dag) of uit een tijd (1 uur), bron in de beschrijving.
//  B. «Звідки це?»: dialoog, het punt, de ORIGINELE alinea met <mark>, eerlijke controle (letterlijk / niet gevonden / termijn weg /
//     verplaatst / eenvoudig), vertalen alleen met een agent (anders gezegd waarom niet), de twee knoppen.
//  C. vertaalstrook en «Порівняти»-tabel: zonder agent alleen «Оригінал» (en waarom); tabel per alinea met de bronrij en meteen «…».
//  D. contextpaneel: «Порівняти» bij een versiegroep; de punten in «Завдання й події» met bron, termijn en «До завдань»; kop eerlijk
//     («без ШІ» alleen zolang er geen punt van een model staat); «Вигляд → Мова листа» met zijn noot.
//  E. bron en bedrading: gesprek (blok, blad, strook, tabel, antwoordregel met ШІ, «Оригінал: …» bij het onderwerp, «Потребує
//     відповіді»), werkruimte (geen ШІ-rij meer in de lezer, N10 voor taken), lagen in ANDERE_LAGEN, ШІ-panel ingeklapt, staat.
//  F. CSS: alleen tokens, 44 px bij aanraken, blad boven het contextblad, telefoon van onderen, tabel onder elkaar op smal, brief
//     verborgen achter de tabel (alleen als de tabel er is).
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { eenvoudigeOntleding, type GecontroleerdPunt } from '../../shared/ai-bronnen';
import { STANDAARD_WEERGAVE, normaliseerWeergave } from '../../src/mail/lees-modus';

const lees = (f: string) => readFileSync(f, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const HEX = /#[0-9a-f]{3,8}\b/i;

// Zelfde nagebootste browser als lezer-context-20261024 (canonical-service leest window bij het laden).
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

const REF = new Date(2026, 9, 24, 12, 0).getTime();
const NL = [
  'Beste Pavlo,',
  '',
  'Kunt u de huurovereenkomst vóór maandag 26 oktober ondertekend terugsturen? De sleuteloverdracht is op woensdag 28 oktober om 10:00.',
  '',
  'In bijlage vindt u de nieuwe versie (v3). De huur bedraagt € 875 per maand.',
  '',
  'Met vriendelijke groet,',
  'Jan Peeters',
].join('\n');
const JAN = 'Jan Peeters <jan@voorbeeld.example>', IK = 'Pavlo <pavlo@ik.example>';
const pdf = (naam: string, kb: number) => ({ providerAttachmentId: `bijl-${naam}`, filename: naam, contentType: 'application/pdf', sizeBytes: kb * 1024 });
const details = { dateHeader: '', via: '', mailedBy: '', signedBy: '', signatureDomain: '', authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' }, transport: { status: 'encrypted_observed' as const, evidence: '' }, list: { id: '', unsubscribeMode: '', oneClick: false }, headerCount: 10 };
const brief = (id: string, from: string, dagen: number, att: ReturnType<typeof pdf>[], tekst: string) => ({
  id, threadId: 't1', internetMessageId: '', subject: 'Huurcontract Voorbeeldstraat 12', from, to: 'pavlo@ik.example', cc: '', replyTo: '',
  receivedAt: REF - dagen * 864e5, snippet: tekst.slice(0, 80), plainText: tekst, renderBody: { kind: 'text' as const, text: tekst, html: '', inlineResources: [] }, labelIds: ['INBOX'], attachments: att, details,
});
const noop = () => undefined;

export async function main(): Promise<number> {
  const { check, einde } = checker('lezer-ai-20261024');
  const herstel = nepBrowser();
  try {
    const { default: LeesVenster } = await import('../../src/mail/LeesVenster');
    const kader = (kind: ReturnType<typeof createElement>, lang: 'uk' | 'nl' = 'uk') => renderToStaticMarkup(createElement(LeesVenster, { lang, berichtId: 'm2', laden: false, paneel: 'none', geminimaliseerd: false, onMinimaliseer: noop, onSluit: noop }, kind));
    const { default: WatNodigBlok, termijnTekst, voorstelUit, BRON_GEBEURTENIS, WEG_GEBEURTENIS } = await import('../../src/mail/WatNodigBlok');
    const ont = eenvoudigeOntleding([{ brief: 1, tekst: NL }]);
    const termijn = termijnTekst('uk', 'vóór maandag 26 oktober', REF);

    // ------------------------------------------------------------------ A. «Що від вас потрібно?»
    const blokProps = (from: string, lang: 'uk' | 'nl' = 'uk') => ({ lang, context: {}, accountId: 'a1', threadId: 't1', subject: 'Huurcontract', brieven: [{ id: 'm1', from, receivedAt: REF, tekst: NL }], mijnAdressen: ['pavlo@ik.example'], onBron: noop, onConcept: noop, onTaak: noop, onAgenda: noop });
    const blok = kader(createElement(WatNodigBlok, blokProps(JAN)));
    check('A blok zonder model: data-opbouw="eenvoudig", open, merk «Авто» (geen «ШІ»), kop «Що від вас потрібно?»',
      /<section class="ai-blok" data-ai-blok="true" data-opbouw="eenvoudig" data-open="ja"/.test(blok) && blok.includes('>Авто<') && blok.includes('Що від вас потрібно?') && !/data-opbouw="model"/.test(blok));
    check('A herkomst eerlijk: «не частина листа · простий розбір у браузері, без моделі»', blok.includes('не частина листа · простий розбір у браузері, без моделі'));
    check('A het punt: vraag, letterlijk, bronchip «лист 1 · §2» (met «Звідки це?» voor de schermlezer), termijnchip «до …»',
      /data-soort="vraag" data-status="letterlijk"/.test(blok) && /class="ai-bron-chip" data-bron-chip="true" aria-label="Звідки це\? Джерело: лист 1 · §2" title="Звідки це\?">лист 1 · §2<\/button>/.test(blok)
      && termijn.startsWith('до ') && termijn.includes('26') && blok.includes(`class="ai-termijn-chip" title="vóór maandag 26 oktober"`) && blok.includes(termijn), termijn);
    check('A «Коротко»: drie feiten met hun bron (tijd, bijlage, bedrag)', blok.includes('<h4>Коротко</h4>') && (blok.match(/data-soort="feit"/g) || []).length === 3);
    check('A voet: «Кожен пункт знайдено дослівно в оригіналі (4 з 4)» en «Склав: простий розбір без моделі»',
      blok.includes('Кожен пункт знайдено дослівно в оригіналі (4 з 4)') && blok.includes('Склав: простий розбір без моделі'));
    check('A samenvatting in de kop: «1 пункт · до …»', blok.includes(`1 пункт · ${termijn}`));
    check('A acties: Чернетка відповіді · До завдань · В Агенду; ZONDER agent geen «Уточнити з ШІ» (er gaat niets weg)',
      blok.includes('Чернетка відповіді') && blok.includes('До завдань') && blok.includes('В Агенду') && !blok.includes('Уточнити з ШІ') && !/data-actie="model"/.test(blok));
    const blokNl = kader(createElement(WatNodigBlok, blokProps(JAN, 'nl')), 'nl');
    check('A nl: «Wat wordt er van u verwacht?», «bericht 1 · §2», «Elk punt staat letterlijk in het origineel (4 van 4)», geen Oekraïens',
      blokNl.includes('Wat wordt er van u verwacht?') && blokNl.includes('bericht 1 · §2') && blokNl.includes('Elk punt staat letterlijk in het origineel (4 van 4)') && !/[А-Яа-яІіЇїЄєҐґ]/.test(blokNl.replace(/title="[^"]*"/g, '')));
    const vanMij = kader(createElement(WatNodigBlok, blokProps(IK)));
    check('A laatste brief van mij: «від вас нічого не чекають», geen punten, «Чернетка відповіді» uit', vanMij.includes('Останній лист у гілці — ваш') && !vanMij.includes('data-ai-punt=') && /data-actie="concept" disabled=""/.test(vanMij));
    const taak = voorstelUit({ subject: 'Huurcontract', punten: ont.punten, kort: ont.kort, ref: REF, lang: 'uk', voor: 'taak' });
    const agenda = voorstelUit({ subject: 'Huurcontract', punten: ont.punten, kort: ont.kort, ref: REF, lang: 'uk', voor: 'agenda' });
    const d = (ms: number) => { const x = new Date(ms); return `${x.getMonth() + 1}-${x.getDate()} ${x.getHours()}:${String(x.getMinutes()).padStart(2, '0')}`; };
    check('A voorstel «До завдань»: titel = het punt, begin = de termijn (hele dag), bron in de beschrijving',
      taak.titel.startsWith('Kunt u de huurovereenkomst') && d(taak.start) === '10-26 0:00' && taak.einde - taak.start === 864e5 && taak.beschrijving.includes('— лист 1 · §2') && taak.beschrijving.includes('(vóór maandag 26 oktober)'), `${d(taak.start)} | ${taak.beschrijving}`);
    check('A voorstel «В Агенду»: de zin MET tijd (28.10 10:00, een uur), titel = onderwerp, het citaat in de beschrijving',
      agenda.titel === 'Huurcontract' && d(agenda.start) === '10-28 10:00' && agenda.einde - agenda.start === 3600e3 && agenda.beschrijving.startsWith('De sleuteloverdracht is op woensdag 28 oktober om 10:00.'), `${d(agenda.start)} | ${agenda.beschrijving}`);
    check('A gebeurtenissen voor de rest van de lezer: «mail:ai-bron» (contextpaneel → «Звідки це?») en «mail:ai-punt-weg»', BRON_GEBEURTENIS === 'mail:ai-bron' && WEG_GEBEURTENIS === 'mail:ai-punt-weg');

    // ------------------------------------------------------------------ B. «Звідки це?»
    const { default: BronBlad } = await import('../../src/mail/BronBlad');
    const al = { tekst: 'Kunt u de huurovereenkomst vóór maandag 26 oktober ondertekend terugsturen? De sleuteloverdracht is op woensdag 28 oktober om 10:00.', brief: 1, nr: 2, van: 'Jan Peeters', wanneer: REF };
    const bladProps = { lang: 'uk' as const, context: {}, accountId: 'a1', berichtId: 'm1', punt: ont.punten[0], alinea: al, opbouw: 'eenvoudig' as const, agentNaam: '', agentId: '', onToon: noop, onWeg: noop, onSluit: noop };
    const blad = kader(createElement(BronBlad, bladProps));
    check('B dialoog: role=dialog, aria-modal, aria-labelledby → kop «Звідки це?», data-bron-blad, status letterlijk',
      /class="bron-blad" role="dialog" aria-modal="true" aria-labelledby="([^"]+)-kop" data-bron-blad="true" data-status="letterlijk"/.test(blad) && /<h2 id="[^"]+-kop">Звідки це\?<\/h2>/.test(blad));
    check('B de ORIGINELE alinea met de kern van het citaat in <mark> (leestekens aan de rand niet), de rest erbij (lang="nl"); kop «Оригінал · лист 1 · §2 · Jan Peeters · …»',
      blad.includes('<blockquote lang="nl" data-bron-alinea="true"><mark>Kunt u de huurovereenkomst vóór maandag 26 oktober ondertekend terugsturen</mark><span>? De sleuteloverdracht is op woensdag 28 oktober om 10:00.</span></blockquote>') && blad.includes('</svg>Оригінал · лист 1 · §2<small> · Jan Peeters · '));
    check('B controle: «Знайдено дослівно в оригіналі.» + «Дату й термін звірено з текстом листа, а не з перекладом.» + «простий розбір без моделі»',
      blad.includes('Знайдено дослівно в оригіналі.') && blad.includes('Дату й термін звірено з текстом листа, а не з перекладом.') && blad.includes('Пункт — це речення з листа (простий розбір без моделі).') && !/is-niet/.test(blad));
    check('B zonder agent: geen vertaalknop, wel waarom («ШІ-агента не підключено … Абзац нікуди не надсилається»)', !blad.includes('Перекласти абзац') && blad.includes('Переклад недоступний: ШІ-агента не підключено («Доступ ШІ»). Абзац нікуди не надсилається.'));
    check('B knoppen «Показати абзац у листі» en «Пункт хибний — прибрати»', /data-bron-toon="true"[^>]*><svg[\s\S]*?<\/svg>Показати абзац у листі/.test(blad) && /data-bron-weg="true"[^>]*><svg[\s\S]*?<\/svg>Пункт хибний — прибрати/.test(blad));
    const verzonnen: GecontroleerdPunt = { id: 'p9', tekst: 'Betaal 950 euro', citaat: 'u moet 950 euro betalen', status: 'niet-gevonden', bron: null, verplaatst: false, termijnStaat: 'niet-in-bron' };
    const blad2 = kader(createElement(BronBlad, { ...bladProps, punt: verzonnen, alinea: null, opbouw: 'model', agentId: 'ag1', agentNaam: 'Claude' }));
    check('B verzonnen punt van het model: merk «ШІ», «Абзацу з цим текстом у листі немає», rode controle «не покладайтеся», «Показати» uit',
      blad2.includes('data-status="niet-gevonden"') && blad2.includes('Абзацу з цим текстом у листі немає.') && /class="bron-blad-controle is-niet" data-controle="niet-gevonden"/.test(blad2) && blad2.includes('не покладайтеся на цей пункт') && /data-bron-toon="true" disabled=""/.test(blad2) && /class="ai-blok-merk" data-opbouw="model"/.test(blad2));
    const verplaatst: GecontroleerdPunt = { ...ont.punten[0], id: 'p2', tekst: 'Contract terugsturen', verplaatst: true, termijn: '', termijnStaat: 'niet-in-bron' };
    const blad3 = kader(createElement(BronBlad, { ...bladProps, punt: verplaatst, opbouw: 'model', agentId: 'ag1', agentNaam: 'Claude' }));
    check('B model: termijn niet in de alinea → «його не показано»; ander alineanummer → «джерело уточнено»; met agent «Перекласти абзац»',
      blad3.includes('Термін, який назвала модель, у цьому абзаці не знайдено — його не показано.') && blad3.includes('Модель вказала інший абзац; джерело уточнено.') && blad3.includes('Перекласти абзац') && !blad3.includes('простий розбір без моделі'));
    const blad4 = kader(createElement(BronBlad, { ...bladProps, lang: 'nl', alinea: { ...al, tekst: 'Kunt u de huurovereenkomst vóór maandag 26 oktober ondertekend terugsturen?' } }), 'nl');
    check('B alinea al in de taal van de site → geen vertaalblok; nl-teksten', !blad4.includes('bron-blad-vertaling') && blad4.includes('Waar komt dit vandaan?') && blad4.includes('Letterlijk gevonden in het origineel.') && blad4.includes('Alinea in het bericht tonen'));

    // ------------------------------------------------------------------ C. vertaalstrook en «Порівняти»
    const { default: VertaalStrook } = await import('../../src/mail/VertaalStrook');
    const strook = renderToStaticMarkup(createElement(VertaalStrook, { lang: 'uk', modus: 'origineel', bronTaal: 'nl', doelTaal: 'uk', kan: false, bezig: false, onModus: noop }));
    const radios = strook.match(/<input type="radio"[^>]*>/g) || [];
    check('C strook zonder agent: drie keuzes, alleen «Оригінал» kan (aangevinkt), en waarom («без нього лист нікуди не надсилається»)',
      radios.length === 3 && radios.filter((r) => r.includes('disabled')).length === 2 && /checked/.test(radios[0]) && strook.includes('Переклад потребує ШІ-агента («Доступ ШІ»); без нього лист нікуди не надсилається.') && strook.includes('Мова листа: '));
    const strook2 = renderToStaticMarkup(createElement(VertaalStrook, { lang: 'nl', modus: 'vergelijk', bronTaal: 'nl', doelTaal: 'uk', kan: true, bezig: false, onModus: noop }));
    check('C strook met agent (nl): niets uit, «Vergelijken» aangevinkt, geen noot', !strook2.includes('disabled') && /data-modus="vergelijk"><input type="radio"[^>]*checked=""/.test(strook2) && !strook2.includes('vertaal-strook-zonder') && strook2.includes('Vergelijken'));
    const { default: VergelijkTabel } = await import('../../src/mail/VergelijkTabel');
    const tabel = renderToStaticMarkup(createElement(VergelijkTabel, { lang: 'uk', context: {}, accountId: 'a1', agentId: 'ag1', berichtId: 'm1', tekst: NL, bronTaal: 'nl', doelTaal: 'uk', bronnen: { 2: 2 } }));
    check('C tabel per alinea (§1–§4) met kop «Оригінал / Переклад ШІ», niet vertaald door de pagina zelf', (tabel.match(/<tr data-alinea="\d"/g) || []).length === 4 && tabel.includes('<th scope="col">Оригінал</th>') && tabel.includes('<th scope="col">Переклад ШІ</th>') && tabel.includes('data-mail-translation-skip="true"'));
    check('C bronrij: data-bron="ja" bij §2 met «Джерело для 2 пунктів · знайдено дослівно»', /<tr data-alinea="2" data-bron="ja">/.test(tabel) && tabel.includes('Джерело для 2 пунктів · знайдено дослівно') && (tabel.match(/data-bron="ja"/g) || []).length === 1);
    check('C meteen «…» (het verzoek loopt), geen «не перекладено» en geen «рушій не переклав» vóór het antwoord', (tabel.match(/class="vergelijk-wacht"/g) || []).length === 4 && !tabel.includes('не перекладено') && !tabel.includes('рушій не переклав'));
    check('C kop van de tabel boven de tabel (geen <caption>: die kromp op de telefoon tot een smalle kolom), de tabel heet ernaar', /<div class="vergelijk-kop" id="([^"]+)">Оригінал і переклад по абзацах · [\s\S]*?<\/div><table aria-labelledby="\1">/.test(tabel) && !tabel.includes('<caption'));
    check('C eerlijke noot: «Переклад ШІ — не частина листа. Дати, суми й терміни звіряйте з оригіналом»', tabel.includes('Переклад ШІ — не частина листа. Дати, суми й терміни звіряйте з оригіналом (ліворуч).'));
    const tabel2 = renderToStaticMarkup(createElement(VergelijkTabel, { lang: 'uk', context: {}, accountId: 'a1', agentId: '', berichtId: 'm1', tekst: NL, bronTaal: 'nl', doelTaal: 'uk', bronnen: {} }));
    check('C zonder agent: «не перекладено» en «нічого не надсилається» — geen schijn van een motor die faalde', tabel2.includes('не перекладено') && tabel2.includes('Переклад потребує ШІ-агента') && !tabel2.includes('рушій не переклав'));

    // ------------------------------------------------------------------ D. contextpaneel en «Вигляд»
    const { default: ContextPaneel } = await import('../../src/mail/ContextPaneel');
    const draad = [brief('m1', JAN, 2, [pdf('Huurcontract-concept.pdf', 1600)], 'Hierbij het concept.'), brief('m2', JAN, 0, [pdf('Huurcontract-ondertekend.pdf', 1800)], NL)];
    const paneel = (watNodig: unknown) => kader(createElement(ContextPaneel, {
      lang: 'uk', thread: draad as never, openId: 'm2', bron: { context: {}, accountId: 'a1', cacheAccountId: 'a1' }, mijnAdressen: ['pavlo@ik.example'], regels: [],
      onKleur: noop, zoekBrieven: async () => [], onOpenBericht: noop, onToonInGesprek: noop, onOpenBijlage: noop, onDownloadBijlage: noop, onBewaarAlles: noop,
      onAfspraak: noop, onTaak: noop, watNodig: watNodig as never, onTaakVoorstel: noop,
    }));
    const ctx = paneel({ punten: ont.punten, kort: ont.kort, hints: [], antwoordNodig: null, opbouw: 'eenvoudig', agentNaam: '' });
    check('D «Порівняти» bij de versiegroep (2 версії), knop met naam voor de schermlezer, buiten de kop <h4>',
      /class="ctx-versies-kop"><h4>[^<]*<small>2 версії<\/small><\/h4><button type="button" class="ctx-knop ctx-vergelijk" data-versies-vergelijken="[^"]+" aria-label="Порівняти версії: [^"]+"/.test(ctx) && ctx.includes('>Порівняти</button>'));
    check('D «Завдання й події»: blok «Що від вас потрібно?» (Авто) met het punt, bronchip, termijn en «До завдань» per punt',
      /<div class="ctx-ai" data-ctx-ai="true" data-opbouw="eenvoudig">/.test(ctx) && ctx.includes('лист 1 · §2') && ctx.includes(termijn) && /data-ai-taak="true" aria-label="До завдань: Kunt u de huurovereenkomst/.test(ctx));
    check('D eerlijk: zonder model blijft de kop «з даних листів, без ШІ» en de noot zegt «простий розбір … без моделі»', ctx.includes('з даних листів, без ШІ') && ctx.includes('Простий розбір у браузері, без моделі: це речення з листів.'));
    const ctxModel = paneel({ punten: ont.punten.map((x) => ({ ...x, id: 'm-' + x.id })), kort: [], hints: [], antwoordNodig: null, opbouw: 'model', agentNaam: 'Claude' });
    check('D met punten van een model: kop «пункти ШІ позначено «ШІ»», merk «ШІ», noot met de naam van de agent',
      ctxModel.includes('з даних листів; пункти ШІ позначено «ШІ»') && /data-ctx-ai="true" data-opbouw="model"/.test(ctxModel) && ctxModel.includes('Склав ваш ШІ-агент «Claude» — не частина листа; кожен пункт знайдено дослівно в листі.'));
    const ctxLeeg = paneel(null);
    check('D zonder punten: geen blok, kop ongewijzigd', !ctxLeeg.includes('data-ctx-ai') && ctxLeeg.includes('з даних листів, без ШІ'));
    const { WeergaveBlok } = await import('../../src/mail/WeergaveKeuze');
    const vg = kader(createElement(WeergaveBlok, { lang: 'uk' }));
    const taalRadios = (/<fieldset data-weergave-taal="true">[\s\S]*?<\/fieldset>/.exec(vg) || [''])[0];
    check('D «Вигляд → Мова листа»: «Оригінал» (standaard, aangevinkt) en «Перекладати», noot «переклад — лише коли ви оберете його»',
      taalRadios.includes('<legend>Мова листа</legend>') && /<input type="radio"[^>]*checked=""[^>]*\/><span>Оригінал<\/span>/.test(taalRadios) && taalRadios.includes('Перекладати') && taalRadios.includes('переклад — лише коли ви оберете його в листі'));
    // MAILBEELD-002 (16.11.2026): «Вигляд» у згортаних зонах — заголовок зони показує поточне значення; відкрита остання вжита (типово «Зображення»).
    const zonesVan = (h: string) => [...h.matchAll(/<details class="lz-zone" data-zone="([a-z]+)"( open="")?>/g)].map((m) => `${m[1]}${m[2] ? '*' : ''}`).join(',');
    const waardenVan = (h: string) => [...h.matchAll(/<span class="lz-zone-titel">([^<]+)<\/span><span class="lz-zone-waarde"[^>]*>(?:<i aria-hidden="true">!<\/i>)?<span>([^<]*)<\/span>/g)].map((m) => `${m[1]}=${m[2]}`).join('|');
    check('D «Вигляд» у зонах: чотири зони, відкрита «Зображення»; у заголовках поточні значення', zonesVan(vg) === 'beelden*,lezen,taal,stroken' && waardenVan(vg) === 'Зображення=Питати|Читання=Звичайно · 100 %|Мова й ШІ=Оригінал|Сховані смуги=немає', `${zonesVan(vg)} / ${waardenVan(vg)}`);
    const beeldBlok = (/<fieldset class="lz-beelden" data-weergave-beelden="vragen">[\s\S]*?<\/fieldset>/.exec(vg) || [''])[0];
    check('D «Зовнішні зображення»: три справжні радіокнопки (vragen · ontvangst · altijd), обрано «Питати»; на ризикованій — «!» і ризик у назві для читача екрана; один рядок «що відбувається зараз»',
      beeldBlok.includes('<legend>Зовнішні зображення</legend>') && ['vragen', 'ontvangst', 'altijd'].every((v) => new RegExp(`<input type="radio"[^>]*value="${v}"`).test(beeldBlok))
      && (beeldBlok.match(/<input type="radio"[^>]*>/g) || []).filter((i) => i.includes('checked=""')).join('|').replace(/.*value="([a-z]+)".*/, '$1') === 'vragen'
      && /aria-label="Завжди показувати — ризик: відправник бачить відкриття"/.test(beeldBlok) && beeldBlok.includes('<i class="lz-beelden-let" aria-hidden="true">!</i>')
      && /<small class="lz-weergave-noot lz-beelden-nu" data-stand="vragen"[^>]*>[\s\S]*?<span>Приховані, доки не покажете\u00a0— відправник нічого не бачить\.<\/span><\/small>/.test(beeldBlok),
      beeldBlok.replace(/ (?:title|data-tooltip)="[^"]*"|<svg[\s\S]*?<\/svg>/g, ''));
    // Afwerking na de jury (16.11.2026): de regel van de voorraad staat er ALTIJD (geen sprong in hoogte) — vóór het antwoord van de server zonder tekst en zonder wisknop.
    const kaal = beeldBlok.replace(/<svg[\s\S]*?<\/svg>/g, '');
    check('D сховище: рядок є завжди (без стрибка висоти); до відповіді сервера — без тексту й без кнопки стирання',
      /<span class="lz-beelden-voorraad" data-beelden-voorraad="true" data-staat="laden"><small><span aria-hidden="true">…<\/span><\/small><\/span>/.test(kaal) && !beeldBlok.includes('lz-beelden-wis'), kaal.slice(kaal.indexOf('lz-beelden-voorraad') - 20));
    check('D плитки: під назвою мітка одним словом («типово» · «приватно» · «! ризик» — знак «!» у мітці, не в кутку); на обраній плитці галочка (не лише колір); підказка наслідку — data-tooltip (шар підказок сайту), не title: одна на весь ряд плиток, ліворуч від панелі (не поверх сусідніх плиток і рядка стану), з текстом обраного режиму; у «Завжди» вона починається з «!»',
      /<label data-keuze="vragen"><input[^>]*checked=""[^>]*\/><span><span class="lz-beelden-naam">Питати<\/span><span class="lz-beelden-merk">типово<\/span>✓<\/span><\/label>/.test(beeldBlok.replace(/<svg[^>]*lz-beelden-vink[\s\S]*?<\/svg>/g, '✓').replace(/<svg[\s\S]*?<\/svg>/g, ''))
      && kaal.includes('<span class="lz-beelden-naam">Завантажити наперед</span><span class="lz-beelden-merk">приватно</span></span></label>')
      && kaal.includes('<span class="lz-beelden-naam">Завжди</span><span class="lz-beelden-merk"><i class="lz-beelden-let" aria-hidden="true">!</i>ризик</span></span></label>')
      && (beeldBlok.match(/lz-beelden-vink/g) || []).length === 1 && !/<label[^>]* (?:title|data-tooltip)=/.test(beeldBlok)
      && /<span class="lz-beelden-keuze" data-tooltip="Зображення приховані, доки не натиснете «Показати»: [^"]+" data-tooltip-placement="left"><label data-keuze="vragen">/.test(beeldBlok)
      && lees('src/mail/WeergaveKeuze.tsx').includes("tipUk: '! Зображення завантажуються, щойно ви відкриваєте лист (через ваш сервер): відправник може дізнатися, що й коли ви його прочитали.")
      && lees('src/mail/WeergaveKeuze.tsx').includes("<span className='lz-beelden-keuze' ref={rij} data-tooltip={tip(tipVan(huidig))} data-tooltip-placement='left'>"));
    // Afwerking 1 (16.11.2026, na de controle): op een aanraakscherm gaf een tik focus en bleef de knopinfo van de site over de zin «wat
    // gebeurt er nu», «Докладніше» en de regel van de voorraad liggen. Met een grove aanwijzer dus geen enkele data-tooltip in het blok
    // (de uitleg staat in «Докладніше» en de aria-labels); met muis/toetsenbord staat de knopinfo links náást het paneel of nergens.
    {
      const g = globalThis as { matchMedia?: unknown };
      const had = Object.prototype.hasOwnProperty.call(g, 'matchMedia'), oud = g.matchMedia;
      g.matchMedia = (q: string) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
      let grof = '';
      try { grof = (/<fieldset class="lz-beelden"[\s\S]*?<\/fieldset>/.exec(kader(createElement(WeergaveBlok, { lang: 'uk' }))) || [''])[0]; } finally { if (had) g.matchMedia = oud; else delete g.matchMedia; }
      const wkTip = lees('src/mail/WeergaveKeuze.tsx');
      check('D дотик (pointer: coarse): у блоці «Зовнішні зображення» немає жодної data-tooltip — тап не лишає підказку поверх рядка стану, «Докладніше» і сховища; пояснення дає «Докладніше» й aria-label',
        grof.includes('<span class="lz-beelden-keuze" data-tooltip-placement="left"><label data-keuze="vragen">') && !/data-tooltip="/.test(grof) && !/ title="/.test(grof) && grof.includes('<details class="lz-beelden-meer">') && grof.includes('aria-label="Завжди показувати — ризик: відправник бачить відкриття"')
        && wkTip.includes("const [grof, setGrof] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);") && wkTip.includes("mq.addEventListener?.('change', volg);") && wkTip.includes('const tip = (tekst: string) => (aanraak ? undefined : tekst);')
        && wkTip.includes("className='lz-beelden-rij' tabIndex={0}\n              data-tooltip={tip(t(`Листів у черзі: ") && wkTip.includes("data-tooltip={tip(t('Видаляє всі збережені зображення. "), grof.replace(/<svg[\s\S]*?<\/svg>/g, '').slice(0, 400));
      check('D миша й клавіатура: текст підказки ряду — плитки під курсором або у фокусі (слухач на window у фазі перехоплення, раніше за шар підказок); немає місця ліворуч (вузьке вікно) → підказки немає; вимкнена плитка пояснює причину',
        wkTip.includes('const TIP_RUIMTE_LINKS = 317;') && wkTip.includes("window.addEventListener('pointerover', zet, true);") && wkTip.includes("window.addEventListener('focusin', zet, true);") && wkTip.includes("window.removeEventListener('pointerover', zet, true); window.removeEventListener('focusin', zet, true);")
        && wkTip.includes("if ((e as PointerEvent).pointerType === 'touch' || !(e.target instanceof Element) || !r.contains(e.target)) return;")
        && wkTip.includes("if (r.getBoundingClientRect().left < TIP_RUIMTE_LINKS) r.removeAttribute('data-tooltip');") && wkTip.includes("else if (tip) r.setAttribute('data-tooltip', tip);")
        && wkTip.includes("return b.id === 'ontvangst' && serverWeg\n      ? t('Зараз недоступно: сервер не відповів, тож увімкнути «Завантажити наперед» не можна. Поточний режим не змінено — спробуйте пізніше.', 'Nu niet beschikbaar: de server antwoordde niet, dus «Vooraf ophalen» kan niet aan. De huidige stand blijft — probeer het later opnieuw.')")
        && !lees('src/ViewportKnopinfoLaag.tsx').includes('lz-beelden'));
    }
    check('D «Докладніше» (згорнуте; для сенсорних екранів без підказок): три режими по одному короткому рядку наслідку й тиха мітка «цей пристрій» / «усі пристрої»',
      /<details class="lz-beelden-meer"><summary><span>Докладніше<\/span><\/summary><ul>/.test(kaal)
      && kaal.includes('<li data-keuze="vragen"><span><b>Питати</b><em>цей пристрій</em><span>Приховані, доки самі не покажете</span></span></li>')
      && kaal.includes('<li data-keuze="ontvangst"><span><b>Завантажити наперед</b><em>усі пристрої</em><span>Сервер завантажує їх, щойно лист надійшов, ще до відкриття — відправник не бачить, коли ви читаєте</span></span></li>')
      && kaal.includes('<li data-keuze="altijd"><span><b>Завжди</b><em>цей пристрій</em><span>Відправник бачить, коли ви читаєте</span></span></li>'), kaal.slice(kaal.indexOf('lz-beelden-meer') - 20, kaal.indexOf('lz-beelden-voorraad')));
    const nlBlok = (/<fieldset class="lz-beelden"[\s\S]*?<\/fieldset>/.exec(kader(createElement(WeergaveBlok, { lang: 'nl' }), 'nl')) || [''])[0].replace(/<svg[\s\S]*?<\/svg>/g, '');
    check('D nl: мітки «standaard» · «privé» · «risico», «Meer uitleg» з «dit apparaat» / «alle apparaten»',
      ['<span class="lz-beelden-merk">standaard</span>', '<span class="lz-beelden-merk">privé</span>', '!</i>risico</span>', '<summary><span>Meer uitleg</span></summary>', '<em>dit apparaat</em><span>Verborgen tot u ze zelf toont</span>', '<b>Vooraf ophalen</b><em>alle apparaten</em><span>De server haalt ze op zodra de brief binnenkomt, nog vóór het openen — de afzender ziet niet wanneer u leest</span>', '<em>dit apparaat</em><span>De afzender ziet wanneer u leest</span>'].every((x) => nlBlok.includes(x)), nlBlok);
    const wkBron = lees('src/mail/WeergaveKeuze.tsx');
    check('D MAILBEELD-004: кнопка «Вигляд» має піктограму вмісту (пейзаж у кольорі сайту: вершина — літера A, що трохи виступає за низ рамки, сонце — глобус мови; 22 px), а не загальні повзунки; опис і підказка називають чотири зони меню й наслідок',
      !wkBron.includes('SlidersHorizontal') && wkBron.includes('<BeeldTekstIcoon />') && /function BeeldTekstIcoon\(\)[\s\S]*?const accent = \{ stroke: 'var\(--accent\)' \};[\s\S]*?<path d='M5\.4 20h\.1A3\.5 3\.5 0 0 1 2 16\.5V6[^']*h-\.9'[\s\S]*?<path d='M6\.6 22\.6 11\.5 8l4\.9 14\.6' strokeWidth='2\.3' \/>[\s\S]*?<circle cx='17\.6' cy='7\.5' r='2\.9'/.test(wkBron) && !/function BeeldTekstIcoon\(\)[\s\S]*?#[0-9a-f]{6}[\s\S]*?\n\}/.test(wkBron.slice(wkBron.indexOf('function BeeldTekstIcoon'), wkBron.indexOf('/** Hetzelfde als blok')))
      && /html body \.mail-reader-weergave > summary > svg\.lz-weergave-icoon \{\s*width: 22px;\s*height: 22px;/.test(lees('src/mail/beelden-voorraad.css'))
      && wkBron.includes("aria-label={t('Вигляд листа: зображення, читання, мова й ШІ, сховані смуги',") && wkBron.includes('Змінює лише показ, сам лист не змінюється.') && !wkBron.includes('Вигляд: ШІ-аналіз над листом'));
    check('D MAILBEELD-004: режим називається «Завантажити наперед» / «Vooraf ophalen» — старої двозначної назви «При отриманні» / «Bij ontvangst» немає ні в інтерфейсі, ні в сповіщеннях',
      !/'[^'\n]*(?:При отриманні|Bij ontvangst|при отриманні|bij ontvangst)[^'\n]*'/.test(wkBron + lees('src/mail/beelden-voorraad.ts'))
      && wkBron.includes("uk: 'Завантажувати наперед (приватно)', nl: 'Vooraf ophalen (privé)', kortUk: 'Завантажити наперед', kortNl: 'Vooraf ophalen',")
      && lees('src/mail/beelden-voorraad.ts').includes("t('Зображення нових листів тепер завантажуються наперед, щойно лист надходить',")
      && lees('src/mail/beelden-voorraad.ts').includes("«Вигляд» → «Зображення»") && !lees('src/mail/beelden-voorraad.ts').includes('«Зовнішні зображення»'));
    check('D сховище, тексти: порожній стан, черга коротким значком із поясненням про сховище ключів, помилка сервера — речення з іменником; нерозривний пробіл у «37 МБ»',
      wkBron.includes("t('Ще нічого не збережено', 'Nog niets bewaard')") && wkBron.includes('t(`У черзі: ${vr.wachtrij}`, `In wachtrij: ${vr.wachtrij}`)') && /data-tooltip=\{tip\(t\(`Листів у черзі: \$\{vr\.wachtrij\}\. Вони чекають, доки відкриється сховище ключів/.test(wkBron)
      && wkBron.includes("t('Режим «Завантажити наперед» зараз недоступний: сервер не відповів.', 'De stand «Vooraf ophalen» is nu niet beschikbaar: de server antwoordde niet.')")
      && (await import('../../src/mail/beelden-voorraad')).formaatGrootte('uk', 38_400_000) === '37\u00a0МБ' && (await import('../../src/mail/beelden-voorraad')).formaatGrootte('nl', 1_500_000) === '1,4\u00a0MB' && (await import('../../src/mail/beelden-voorraad')).formaatGrootte('nl', 2048) === '2\u00a0kB');
    check('D поведінка: відмова сервера на «При отриманні» повертає попередній локальний режим; кнопка стирання під час роботи — aria-disabled (фокус не падає на <body>); клік у тіло листа (iframe) закриває панель',
      wkBron.includes("if (b === 'ontvangst') { const vorig = lokaal; zetLokaal('vragen'); void zetBijOntvangst(lang, true).then((ok) => { if (!ok) zetLokaal(vorig); }); return; }")
      && wkBron.includes("aria-disabled={bezig || undefined}") && !/className='lz-beelden-wis' disabled=/.test(wkBron) && wkBron.includes("blok.current?.querySelector<HTMLInputElement>('input:checked')?.focus()")
      && wkBron.includes("window.addEventListener('blur', inBrief);") && wkBron.includes("window.removeEventListener('blur', inBrief);"));
    (globalThis as { localStorage: Storage }).localStorage.setItem('mail-lezer-weergave-v1', JSON.stringify({ taal: 'vertaling' }));
    (globalThis as { localStorage: Storage }).localStorage.setItem('mail-lezer-weergave-zone-v1', 'taal');
    const vg2 = kader(createElement(WeergaveBlok, { lang: 'uk' }));
    // Блокер рев'ю (16.11.2026): типово відкрита зона — це <details open> усередині листа навіть при закритому «Вигляд»/«Ще». Меню вона не є:
    // без винятку в обох селекторах жодна гаряча клавіша листа не працювала, а перший Escape «з'їдав» відкриту зону.
    const lvBron = lees('src/mail/LeesVenster.tsx'), wbBron = lees('src/MailLezerWerkbalk.tsx');
    check('D зони не є «відкритим меню»: ANDERE_LAGEN і Escape у werkbalk не рахують .lz-zone та розгортні блоки в ній («Докладніше», пояснення ШІ) — класи перелічено, без комбінатора в :not() (старі WebView на такому селекторі кидають SyntaxError)',
      /const ANDERE_LAGEN = '\.google-mail-reader-backdrop details\[open\]:not\(\.lz-zone\):not\(\.lz-beelden-meer\):not\(\.lz-ai-uitleg\),/.test(lvBron)
      && wbBron.includes("document.querySelector<HTMLDetailsElement>('.google-mail-reader-backdrop details[open]:not(.lz-zone):not(.lz-beelden-meer):not(.lz-ai-uitleg)')") && !wbBron.includes("'.google-mail-reader-backdrop details[open]'")
      && !/:not\([^()]*\s[^()]*\)/.test(lvBron.slice(lvBron.indexOf('const ANDERE_LAGEN'), lvBron.indexOf('\n', lvBron.indexOf('const ANDERE_LAGEN')))) && !wbBron.includes(':not(.lz-zone details)')
      // alle <details> die in een zone kunnen staan, zijn in de selector genoemd
      && [...new Set([...lees('src/mail/WeergaveKeuze.tsx').matchAll(/<details className='([a-z-]+)'/g)].map((m) => m[1]))].filter((k) => k !== 'lz-zone').sort().join() === 'lz-ai-uitleg,lz-beelden-meer'
      && !/<details/.test(lees('src/mail/AiUitleg.tsx')) && !/<details/.test(lees('src/mail/StrookNazorg.tsx'))
      && /<details class="lz-zone" data-zone="beelden" open="">/.test(vg) && /class="lz-zone-inhoud">[\s\S]*<details class="lz-beelden-meer">/.test(vg));
    check('D зони: ключ пишеться лише при справжній зміні зони (перше малювання відкритої зони — не вибір користувача)', wkBron.includes('const zetOpen = (z: Zone, aan: boolean) => { if (aan && open !== z) bewaarZone(z); setOpen((nu) => (aan ? z : nu === z ? \'\' : nu)); };'));
    check('D ⋮: aria-expanded на кнопці йде за <details> — шар підказок прибирає підказку «Додаткові дії» з-над відкритого меню (як у «Вигляд»)',
      wbBron.includes("<details ref={moreRef} onToggle={event=>{setMeerOpen(event.currentTarget.open);plaatsMeer()}} className=") && wbBron.includes("<summary data-reader-drop-surface='overflow' aria-expanded={meerOpen} aria-label={t('Додаткові дії','Meer acties')} data-tooltip={t('Додаткові дії','Meer acties')}"));
    check('D зони: остання відкрита зона запам’ятовується на пристрої; значення в заголовку йде за вибором («Переклад»); невідоме значення → «Зображення»', zonesVan(vg2) === 'beelden,lezen,taal*,stroken' && waardenVan(vg2).includes('Мова й ШІ=Переклад|')
      && ((globalThis as { localStorage: Storage }).localStorage.setItem('mail-lezer-weergave-zone-v1', 'iets'), zonesVan(kader(createElement(WeergaveBlok, { lang: 'nl' }), 'nl'))) === 'beelden*,lezen,taal,stroken', `${zonesVan(vg2)} / ${waardenVan(vg2)}`);
    const sporen = await import('../../src/lokale-sporen');
    const nepOpslag = (keys: string[]) => { const m = new Map(keys.map((k) => [k, 'x'])); return { m, o: { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, removeItem: (k: string) => { m.delete(k); }, getItem: (k: string) => m.get(k) ?? null } }; };
    const eenAccount = nepOpslag([sporen.WEERGAVE_ZONE_SLEUTEL, 'mail-lezer-weergave-v1']), alles = nepOpslag([sporen.WEERGAVE_ZONE_SLEUTEL, 'mail-lezer-weergave-v1']);
    sporen.wisLokaleSporen('user-a', eenAccount.o); sporen.wisAlleLokaleSporen(alles.o);
    check('D зони: ключ один, з src/lokale-sporen.ts (назва зони, без облікового запису) — вихід одного акаунта його лишає, «вийти всюди» стирає',
      sporen.WEERGAVE_ZONE_SLEUTEL === 'mail-lezer-weergave-zone-v1' && lees('src/mail/WeergaveKeuze.tsx').includes("import { WEERGAVE_ZONE_SLEUTEL } from '../lokale-sporen';") && !lees('src/mail/WeergaveKeuze.tsx').includes("'mail-lezer-weergave-zone")
      && eenAccount.m.has(sporen.WEERGAVE_ZONE_SLEUTEL) && !alles.m.has(sporen.WEERGAVE_ZONE_SLEUTEL) && alles.m.has('mail-lezer-weergave-v1'));
    const bv = lees('src/mail/beelden-voorraad.css'), bvMedia = bv.indexOf('\n@media');
    check('D зони, CSS: мобільний шар останній і діє також на вузькому екрані (не лише pointer:coarse); дотик 44 px (плитки й кнопка стирання); рух вимикається за prefers-reduced-motion; видимий фокус на плитці й заголовку зони',
      bvMedia > 0 && bv.indexOf('\nhtml body', bvMedia) < 0 && /\n@media \(pointer: coarse\), \(max-width: 720px\) \{[\s\S]*\}\s*$/.test(bv) && bv.lastIndexOf('\n@media') === bv.indexOf('\n@media (pointer: coarse), (max-width: 720px) {')
      && /\.lz-beelden-keuze input \+ span \{\s*min-height: 80px;/.test(bv) && /button\.lz-beelden-wis\[type\]:not\(\.x\) \{\s*width: 44px;\s*min-width: 44px;\s*height: 44px;/.test(bv)
      && /@media \(prefers-reduced-motion: reduce\) \{[^@]*transition: none;/.test(bv) && bv.includes('html body .lz-beelden-keuze input:focus-visible + span {\n  outline: 2px solid var(--focus);') && bv.includes('html body .lz-zone > summary:focus-visible {\n  outline: 2px solid var(--focus);'));
    const zc = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '');
    const bvKaal = zc(bv);
    check('D зони, CSS: тінь натиску/наведення — із заокругленням картки й без квадратного tap-highlight; hover лише в @media (hover: hover); значення (і «!») у заголовку ВІДКРИТОЇ зони сховано',
      /html body \.lz-zone > summary \{[^}]*border-radius: calc\(var\(--straal-m, 14px\) - 1px\);[^}]*-webkit-tap-highlight-color: transparent;/.test(bvKaal) && /html body \.lz-zone > summary:active \{\s*background: /.test(bvKaal)
      && !/\n(?:html body [^{\n]*):hover[^{\n]*\{/.test(bvKaal.slice(0, bvKaal.indexOf('\n@media'))) && /@media \(hover: hover\) and \(pointer: fine\) \{\s*html body \.lz-zone > summary:hover \{/.test(bvKaal)
      && /html body \.lz-zone\[open\] > summary > \.lz-zone-waarde \{\s*visibility: hidden;\s*\}/.test(bvKaal));
    check('D плитки, CSS: три РІВНІ колонки; обрана «Завжди» — рамка 2 px; недоступна плитка — пунктир; рядок «що зараз» для «Завжди» — лише значок у тоні попередження (текст звичайний)',
      /html body \.lz-beelden-keuze \{\s*display: grid;\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/.test(bvKaal) && /label\[data-keuze='altijd'\] input:checked \+ span \{[^}]*border: 2px solid /.test(bvKaal)
      && /html body \.lz-beelden-keuze input:disabled \+ span \{\s*border: 1px dashed /.test(bvKaal) && bvKaal.includes("html body .lz-beelden-nu[data-stand='altijd'] > svg {\n  color: var(--warn);\n}") && !/\.lz-beelden-nu\[data-stand='altijd'\],/.test(bvKaal) && !bvKaal.includes('lz-beelden-fout'));
    check('D рядок «що зараз»: речення двох інших режимів лежать невидимо в тій самій клітинці (висота = найдовше; без стрибка й без порожнього рядка), приховані від читача екрана',
      (beeldBlok.match(/<span class="lz-beelden-nu-maat" aria-hidden="true">/g) || []).length === 2 && !/<span class="lz-beelden-nu-maat" aria-hidden="true">Приховані, доки/.test(beeldBlok)
      && /html body \.lz-beelden-nu > span \{\s*grid-area: 1 \/ 2;/.test(bvKaal) && /html body \.lz-beelden-nu > \.lz-beelden-nu-maat \{\s*visibility: hidden;/.test(bvKaal) && !/lz-beelden-nu \{[^}]*min-height/.test(bvKaal));
    check('D сховище, CSS: кнопка стирання — по центру першого рядка (від’ємне поле), праворуч; hover не скидає background-clip (background-color) і лише в @media (hover: hover); у «Ще» підпис «Вигляд» — малий, приглушений, у будь-якій палітрі',
      /margin: calc\(\(var\(--lz-regel\) - var\(--lz-knop\)\) \/ 2\) 0;/.test(bvKaal) && !/lz-beelden-wis[^{]*\{[^}]*\n\s*background: /.test(bvKaal) && /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*button\.lz-beelden-wis\[type\]:not\(\.x\):hover \{\s*background-color: /.test(bvKaal)
      // підпис «Вигляд» — звичайний підпис групи аркуша: ті самі значення, що в src/ui-golf-11.css, і НИЗЬКА специфічність (палітра
      // перекриває його так само, як сусідні підписи) — без власного відступу 8 px і кегля 11,5 px
      && /\n\.lz-weergave-blok > \.mail-reader-overflow-groep-kop \{\s*padding: 4px 12px 2px;\s*color: var\(--muted\);\s*font-size: \.7rem;\s*font-weight: 700;\s*letter-spacing: \.04em;\s*text-transform: uppercase;\s*\}/.test(bvKaal)
      && !/html body [^{]*\.mail-reader-overflow-groep-kop/.test(bvKaal)
      && lees('src/ui-golf-11.css').includes('.mail-reader-overflow-groep-kop{padding:4px 12px 2px;font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}'));
    check('D плитки й сховище, CSS (доопрацювання 1): назва плитки не торкається країв (5 px з кожного боку); рядки значок / назва / мітка спільні для трьох плиток (subgrid); вимкнена плитка — курсор «заборонено»; на ≤ 359 px слово «зображень» у рядку сховища сховано (рядок не росте); панель 376 px',
      /html body \.lz-beelden-naam \{\s*box-sizing: border-box;\s*max-width: 100%;\s*padding: 0 5px;/.test(bvKaal)
      && /@supports \(grid-template-rows: subgrid\) \{\s*html body \.lz-beelden-keuze > label \{\s*display: grid;\s*grid-row: span 3;\s*grid-template-rows: subgrid;\s*\}\s*html body \.lz-beelden-keuze input \+ span \{\s*display: grid;\s*grid-row: 1 \/ -1;\s*grid-template-rows: subgrid;/.test(bvKaal)
      && /html body \.lz-beelden-keuze input:disabled \{\s*pointer-events: none;\s*\}\s*html body \.lz-beelden-keuze > label:has\(input:disabled\) \{\s*cursor: not-allowed;\s*\}/.test(bvKaal)
      && /@media \(max-width: 359px\) \{[\s\S]*html body \.lz-beelden-voorraad \.lz-beelden-woord \{\s*display: none;\s*\}/.test(bvKaal.slice(bvKaal.indexOf('\n@media (pointer: coarse), (max-width: 720px) {')))
      && /html body \.lz-weergave-paneel \{\s*width: min\(376px, calc\(100vw - 24px\)\);/.test(bvKaal)
      && lees('src/mail/WeergaveKeuze.tsx').includes("<span className='lz-beelden-woord'>{`\\u00a0${woordBeelden(lang, vr.aantal)}`}</span>"));
    // Afwerking 2 (16.11.2026, na de tweede controle).
    {
      const wk2 = lees('src/mail/WeergaveKeuze.tsx'), laag = lees('src/ViewportKnopinfoLaag.tsx');
      // MAILBEELD-004 (16.11.2026): grens 66 tekens, elk deel ≤ 34 — op de stand gemeten (320 px, uk): de nieuwe zin over «Завантажити наперед» staat in 2 regels
      const nuUk = [...wk2.matchAll(/nuUk: '([^']+)'/g)].map((m) => m[1].replace(/\\u00a0/g, '\u00a0'));
      check('D рядок «що зараз» (uk): три короткі речення — кожне вміщається у два рядки й на екрані 320 px (не лишається порожнього третього рядка під коротшими); наслідок для приватності названо в кожному',
        nuUk.length === 3 && nuUk.every((z) => z.length <= 66 && z.includes('\u00a0— відправник ') && z.split('\u00a0— ').every((d) => d.length <= 34))
        && nuUk[0] === 'Приховані, доки не покажете\u00a0— відправник нічого не бачить.' && nuUk[1] === 'Сервер завантажує їх до відкриття\u00a0— відправник не бачить читання.' && nuUk[2] === 'Завантажуються під час відкриття\u00a0— відправник це бачить.', nuUk.join(' | '));
      check('D рядок «що зараз»: перед тире — нерозривний пробіл (рядок ніколи не починається з «—»), обидві мови; рядки врівноважені (text-wrap: balance — без самотнього слова в другому рядку)',
        [...wk2.matchAll(/nu(?:Uk|Nl): '([^']+)'/g)].length === 6 && [...wk2.matchAll(/nu(?:Uk|Nl): '([^']+)'/g)].every((m) => m[1].includes('\\u00a0— ') && !m[1].includes(' — '))
        && /html body \.lz-beelden-nu > span \{\s*grid-area: 1 \/ 2;\s*min-width: 0;\s*text-wrap: balance;\s*\}/.test(lees('src/mail/beelden-voorraad.css')));
      check('D сховище з чергою: слово «зображень» ховається (data-rij), тож «Збережено 214 (37 МБ)» і «У черзі: 3» стоять в одному рядку — блок не росте, коли сервер повідомляє про чергу (також на ПК); без черги й за помилки сервера атрибута немає',
        wk2.includes("data-rij={!serverWeg && vr.wachtrij > 0 ? '' : undefined}") && !/data-rij=/.test(beeldBlok)
        && /\nhtml body \.lz-beelden-voorraad\[data-rij\] \.lz-beelden-woord \{\s*display: none;\s*\}/.test(lees('src/mail/beelden-voorraad.css').replace(/\/\*[\s\S]*?\*\//g, ''))
        && lees('src/mail/beelden-voorraad.css').indexOf('.lz-beelden-voorraad[data-rij] .lz-beelden-woord') < lees('src/mail/beelden-voorraad.css').indexOf('\n@media'));
      check('D вузьке вікно з мишею: підказки кошика й значка черги стають ПІД якорем (не поверх рядка «що зараз»); де ліворуч є місце — звичайне розміщення; шар підказок знає «below» (якщо вміщається) і нічого не знає про цей блок',
        wk2.includes("const anker = e.target.closest<HTMLElement>('.lz-beelden-wis, .lz-beelden-rij');") && wk2.includes("if (!anker || !blok.current?.contains(anker)) return;")
        && wk2.includes("if (r.getBoundingClientRect().left < TIP_RUIMTE_LINKS) anker.setAttribute('data-tooltip-placement', 'below'); else anker.removeAttribute('data-tooltip-placement');")
        && wk2.includes("window.addEventListener('pointerover', onder, true);") && wk2.includes("window.addEventListener('focusin', onder, true);") && wk2.includes("window.removeEventListener('pointerover', onder, true); window.removeEventListener('focusin', onder, true);")
        && laag.includes("if(target.dataset.tooltipPlacement==='below'&&belowFits){setPos({left,top:below,placement:'below'});setPlaced(true);return}") && !laag.includes('lz-beelden')
        && !/class="lz-beelden-(?:wis|rij)"[^>]*data-tooltip-placement/.test(beeldBlok));
      check('D аркуш «Ще», «Докладніше»: після розгортання у видиму частину потрапляють легенда й рядок сховища (до низу відкритої зони; саме «Докладніше» важливіше, якщо все не вміщається) — без прив’язки до заголовка зони й примітки',
        wk2.includes('function schuifInBeeld(wortel: HTMLElement | null, ookOmhoog: boolean, meer = false) {') && wk2.includes("const uitleg = meer ? zone?.querySelector<HTMLElement>('details.lz-beelden-meer') : null;")
        && wk2.includes('const onder = ((uitleg ? zone : voet) ?? zone ?? wortel).getBoundingClientRect().bottom, boven = (uitleg ?? zone ?? wortel).getBoundingClientRect().top;')
        && wk2.includes('opMaat={() => requestAnimationFrame(() => schuifInBeeld(wortel.current, false, true))}') && wk2.includes("<details className='lz-beelden-meer' onToggle={() => opMaat?.()}>"));
    }
    check('D аркуш «Ще»: рядок сховища росте вже після відповіді сервера (щось збережено, черга, сервер недоступний) — тоді примітку знову вміщуємо у видиму частину (лише вниз)',
      lees('src/mail/WeergaveKeuze.tsx').includes('useEffect(() => { if (gemonteerd.current) schuifInBeeld(wortel.current, false); }, [vr.geladen, vr.aantal, vr.wachtrij, vr.fout]);')
      && lees('src/mail/WeergaveKeuze.tsx').indexOf('[vr.geladen, vr.aantal, vr.wachtrij, vr.fout]') < lees('src/mail/WeergaveKeuze.tsx').indexOf('gemonteerd.current = true; }, [beeldId]);'));
    check('D «Перекладати» gekozen: de noot zegt dat de tekst naar de ШІ-agent gaat en waar het origineel staat', vg2.includes('Лист іншою мовою перекладається під час відкриття: текст надсилається вашому ШІ-агенту') && vg2.includes('Оригінал — у смузі перекладу.'));
    check('D «Мова листа» bewaard per apparaat: standaard origineel, alleen «vertaling» telt', STANDAARD_WEERGAVE.taal === 'origineel' && normaliseerWeergave({ taal: 'vertaling' }).taal === 'vertaling' && normaliseerWeergave({ taal: 'en' }).taal === 'origineel' && normaliseerWeergave(null).taal === 'origineel');
  } finally {
    herstel();
  }

  // ------------------------------------------------------------------ E. bron en bedrading
  const gi = lees('src/MailGesprekInhoud.tsx'), ws = lees('src/GoogleMailWerkruimte.tsx'), lv = lees('src/mail/LeesVenster.tsx'), cp = lees('src/mail/ContextPaneel.tsx');
  const bb = lees('src/mail/BronBlad.tsx'), bt = lees('src/MailBerichtTekst.tsx'), aa = lees('src/mail/alinea-aanwijzen.ts'), st = lees('src/mail/ai-staat.ts'), wn = lees('src/mail/WatNodigBlok.tsx');
  check('E gesprek: «Що від вас потрібно?» en «Звідки це?» vóór het ШІ-panel; strook en tabel vóór de brieftekst',
    gi.indexOf('<WatNodigBlok ') > 0 && gi.indexOf('<WatNodigBlok ') < gi.indexOf('<AiVertalingBalk ') && gi.indexOf('<BronBlad ') < gi.indexOf('<AiVertalingBalk ') && gi.indexOf('<VertaalStrook ') < gi.indexOf('<VergelijkTabel ') && gi.indexOf('<VergelijkTabel ') < gi.indexOf('<MailMessageBody '));
  check('E onderwerp: «Оригінал: …» (vertaald onderwerp) en de chip «Потребує відповіді» opent «Звідки це?»', gi.includes('mail-thread-onderwerp-origineel') && gi.includes("onClick={()=>setBronOpen(watNodig.antwoordNodig)}") && gi.includes("t('Потребує відповіді','Wacht op uw antwoord')"));
  check('E antwoordregel: «Переслати», hints van ШІ (stippel) of «Відповісти на лист N · §M» zonder model, ШІ-knoppen in vorm «antwoord» (ШІ-concept → «Усім»)',
    gi.includes('data-reply-doorsturen') && gi.includes("className='mail-reply-hint' data-opbouw='model'") && gi.includes("className='mail-reply-hint' data-opbouw='eenvoudig'") && gi.includes("<MailReaderAi vorm='antwoord'") && gi.includes("onUseReply={html=>{setReply(html);startReply('all')}}"));
  check('E hint of citaat invoegen: dezelfde tekst niet twee keer (dubbelklik, of terug naar de brief met een bewaard concept); tekst via DOMParser, niet via innerHTML',
    gi.includes("const kaal=(s:string)=>(new DOMParser().parseFromString(s,'text/html').body.textContent||'')") && gi.includes('setReply(!nu?html:nieuw&&nu.includes(nieuw)?reply:`${reply}${html}`)') && !/voegToe=\(html:string\)=>\{[^}]*innerHTML/.test(gi));
  check('E «Показати абзац у листі»: brief uitklappen, origineel tonen (tabel en vertaling uit), dan TOON_ALINEA (drie pogingen)',
    gi.includes('const toonBron=(punt:GecontroleerdPunt)=>') && gi.includes('setVergelijk(false);if(effectiveTranslationActive){setLocalTranslationActive(false);onTranslationFailure()}') && gi.includes('for(const ms of[80,500,1400])window.setTimeout(stuur,ms)'));
  check('E «Звідки це?» vanuit het contextpaneel: het gesprek luistert naar «mail:ai-bron» en zoekt het punt op id', gi.includes('window.addEventListener(BRON_GEBEURTENIS,op)') && cp.includes('openBron(gesprekId, x.id)'));
  check('E «Мова листа: Перекладати»: één keer per brief, alleen met agent, niet als de brief al in de taal van de site is',
    gi.includes("leesVenster?.weergave.taal!=='vertaling'||!aiStaat.agent") && gi.includes('autoVertaald.current.has(id)') && gi.includes('taalVan(tekst)===lang'));
  check('E werkruimte: geen eigen ШІ-rij meer in de lezer (die lag over de kop); uitkomst → contextpaneel; taken via N10 met voorstel',
    !ws.includes('<MailReaderAi') && ws.includes('onWatNodig={setReaderWatNodig}') && ws.includes('watNodig={readerWatNodig}') && ws.includes("onTaakVoorstel={v=>{setReaderAfspraakVoorstel(v);void openReaderN10('tasks')}}"));
  check('E lagen: «Звідки це?» en «Порівняти версії» in ANDERE_LAGEN (Escape en sneltoetsen eerst voor die laag)', /const ANDERE_LAGEN = '[^']*\[data-bron-blad\],\[data-versie-vergelijk\]'/.test(lv));
  check('E blad «Звідки це?»: Escape in capture + stopPropagation, eigen stap «Назад» alleen op de telefoon, focus terug',
    bb.includes("document.addEventListener('keydown', opToets, true)") && bb.includes('e.stopPropagation()') && bb.includes("if (lv?.modus !== 'telefoon') return;") && bb.includes("const STAP = 'mrBronBlad'") && bb.includes('vorige.focus({ preventScroll: true })'));
  check('E contextblad sluit bij «Показати абзац» (na de «Назад»-stap van «Звідки це?» — nooit twee keer history.back() tegelijk)', cp.includes('window.addEventListener(TOON_ALINEA, opToon)') && cp.includes("mrBronBlad") && cp.includes("window.addEventListener('popstate', wacht, { once: true })"));
  check('E aanwijzen in de brief zelf (iframe of tekst): CSS Custom Highlight waar het kan, anders een omlijning; de tekst blijft onaangeroerd',
    bt.includes('TOON_ALINEA') && bt.includes('wijsCitaatAan') && aa.includes('CSS') && aa.includes('highlights') && aa.includes('outline'));
  check('E uitkomst van de agent per gesprek onthouden (deze sessie, hoogstens 50); een laat antwoord na het wisselen van gesprek wordt niet getoond',
    wn.includes('const MODEL_GEHEUGEN = new Map<string, ModelUitkomst>()') && wn.includes('MODEL_GEHEUGEN.size > 50') && wn.includes('if (huidigeSleutel.current === k) setModelState(m)'));
  check('E blok: open in een hoog venster, ingeklapt onder 860 px (tenzij u het zelf open of dicht zette)', wn.includes('export const LAAG_VENSTER = 860;') && wn.includes("return typeof innerHeight === 'number' ? innerHeight >= LAAG_VENSTER : true;"));
  check('E aanwijzen in het iframe: document herkend via nodeType (ander venster), kleur via een opgebouwd stijlblad (CSP van de brief weigert <style>)',
    aa.includes('(root as Node).nodeType === 9') && aa.includes('adoptedStyleSheets') && !aa.includes("createElement('style')"));
  const vb = lees('src/mail/AiVertalingBalk.tsx');
  check('E ШІ-panel: de regels «переклад / оригінал» ook in het Nederlands, en in de brief met de weg naar de vertaalstrook', vb.includes('Het ongewijzigde origineel staat er.') && vb.includes('«Переклад» у смузі над листом поверне його миттєво.') && vb.includes('Vertaling op de plaats zelf naar het'));
  check('E staat van de agent: één verzoek per context, de laatst geladen staat voor «Вигляд», setTimeout zonder window', st.includes('export function useLaatsteAiStaat') && !st.includes('window.setTimeout') && st.includes('cache.set(k, p)'));
  check('E «Пункт хибний — прибрати» onthoudt dit apparaat per gesprek (hoogstens 40 per gesprek, 200 gesprekken), «Повернути» zet terug',
    wn.includes("const WEG_SLEUTEL = 'mail-ai-weg-v1'") && wn.includes('lijst.slice(-40)') && wn.includes('sleutels.length - 200') && wn.includes('Повернути прибрані'));
  const { aiBalkStartIngeklapt } = await import('../../src/mail/AiVertalingBalk');
  check('E ШІ-panel boven de brief begint ingeklapt (ook zonder window: SSR)', aiBalkStartIngeklapt() === true);

  // ------------------------------------------------------------------ F. CSS
  const blokCss = zc(lees('src/mail/ai-blok.css')), ctxCss = zc(lees('src/mail/context-paneel.css')), balkCss = zc(lees('src/mail/ai-vertaling-balk.css'));
  const nieuwCtx = ctxCss.slice(ctxCss.indexOf('.ctx-versies-kop'));
  check('F alleen tokens: geen hex-kleuren in ai-blok.css en in het nieuwe deel van context-paneel.css', !HEX.test(blokCss) && nieuwCtx.length > 100 && !HEX.test(nieuwCtx));
  check('F aanraken: knoppen 44 px (blok, blad, antwoordregel, «Порівняти»), chips 32 px',
    /@media \(pointer:coarse\)\{html body \.ai-blok-knop\{min-height:44px\}/.test(blokCss) && /\.bron-blad-sluit\{width:44px;height:44px\}/.test(blokCss) && /\.mail-reply-extra>button\{min-height:44px\}/.test(blokCss) && /\.ctx-vergelijk\{min-height:44px\}/.test(nieuwCtx) && /\.ai-bron-chip,\.ai-termijn-chip\{min-height:32px\}/.test(blokCss));
  const z = (re: RegExp, css: string) => Number((re.exec(css) || [])[1] || 0);
  check('F «Звідки це?» ligt boven het contextblad (z 41 > 31) in het raster van de lezer; op smal van onderen over de volle breedte',
    z(/\.google-mail-reader>\.bron-blad\{grid-area:2\/1\/-1\/-1;z-index:(\d+)/, blokCss) > z(/\[data-context='blad'\]>\.ctx-paneel\{grid-area:2\/1\/-1\/-1;z-index:(\d+)/, ctxCss) && z(/\[data-context='blad'\]>\.ctx-paneel\{grid-area:2\/1\/-1\/-1;z-index:(\d+)/, ctxCss) === 31
    && /\[data-lees-breedte='smal'\]>\.bron-blad\{justify-self:stretch;align-self:end/.test(blokCss));
  check('F tabel: op smal onder elkaar (geen kolommen op de telefoon); de brief verdwijnt alleen achter een tabel die er IS (:has)',
    /\[data-lees-breedte='smal'\] \.vergelijk table,[^{]*\{display:block\}/.test(blokCss) && blokCss.includes(".mail-thread-message[data-vergelijk='ja'] .mail-thread-message-body:has(>[data-vergelijk-tabel])>:is(.mail-message-html-body,.mail-message-text-body,.mail-vertaal-naast,.mail-vertaal-plaat,.mail-beelden-strook){display:none}"));
  check('F ШІ: indigo met stippellijn (--info), het eenvoudige ontleden grijs en doorgetrokken (geen ШІ)', /\.ai-blok\{[^}]*border:1px dashed color-mix\(in srgb,var\(--info\)/.test(blokCss) && /\.ai-blok\[data-opbouw='eenvoudig'\]\{border-style:solid/.test(blokCss));
  check('F ШІ-panel: de knop «⌄» en het inklappen gelden op elk scherm (niet meer alleen in de media query)', /\.ai-vb-inklap \{\s*display:inline-grid;/.test(balkCss.slice(0, balkCss.indexOf('@media (max-width:700px), (max-height:500px)'))) && !/\.ai-vb-inklap \{ display:none; \}/.test(balkCss));

  return einde();
}
