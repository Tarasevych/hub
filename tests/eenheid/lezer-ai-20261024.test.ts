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
    (globalThis as { localStorage: Storage }).localStorage.setItem('mail-lezer-weergave-v1', JSON.stringify({ taal: 'vertaling' }));
    const vg2 = kader(createElement(WeergaveBlok, { lang: 'uk' }));
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
