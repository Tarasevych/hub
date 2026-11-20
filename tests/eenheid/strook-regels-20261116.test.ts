// STROOK-002 (16.11.2026). Павло: «варто перебрати принципи роботи і також додати інші варіанти … не показувати смугу для певної мови
// листів чи наприклад для певного відправника; це дуже розумна система, коли вона має пропозиції».
// Zonder de wijziging faalt deze test: er waren geen blijvende regels, geen tellingen voor voorstellen, geen keuzeregel na ✕, geen lijst
// in «Вигляд» en geen melding met «Скасувати». Bewaakt ook: een regel verbergt alleen de strook (beelden blijven verborgen), regels zijn
// per account + mailbox, afmelden wist ze, en kapotte opslag levert geen regels op.
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';

const { check, einde } = checker('strook-regels-20261116');

// nagebootste browser: localStorage, sessionStorage, window met events
class Opslag { m = new Map<string, string>(); get length() { return this.m.size; } key(i: number) { return [...this.m.keys()][i] ?? null; } getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, String(v)); } removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } }
const lokaal = new Opslag();
const meldingen: Array<{ text: string; kind?: string; action?: { label: string; onAction: () => void } ; explain?: string }> = [];
const venster = new EventTarget() as EventTarget & Record<string, unknown>;
Object.assign(globalThis, { localStorage: lokaal, sessionStorage: new Opslag(), window: venster, CustomEvent: class<T> extends Event { detail: T; constructor(t: string, o?: { detail?: T }) { super(t); this.detail = o?.detail as T; } } });
venster.addEventListener('tsv:canonical-notice', (e) => meldingen.push((e as unknown as { detail: (typeof meldingen)[number] }).detail));
Object.assign(venster, { setTimeout, clearTimeout });

const pad = 'src/mail/strook-regels.ts';
check('src/mail/strook-regels.ts bestaat', existsSync(pad));
if (existsSync(pad)) {
  const R = await import('../../src/mail/strook-regels');
  const N = await import('../../src/mail/StrookNazorg');
  const S = await import('../../src/mail/stroken-sluiten');
  const sporen = await import('../../src/lokale-sporen');
  const A = 'eigenaar-1\u001fgmail-a', B = 'eigenaar-2\u001fgmail-b';
  const doccle = 'Doccle <Community@Doccle.be>';

  // 1. regels: taal, afzender, overal; volgorde overal > taal > afzender
  R.vergeetRegelsCache();
  check('zonder regels: niets verborgen', R.regelVoor(R.leesRegels(A), 'taal', { taal: 'nl', afzender: doccle }) === null);
  R.zetRegel(A, { strook: 'taal', soort: 'afzender', waarde: doccle }, true);
  check('afzenderregel, adres genormaliseerd', R.regelVoor(R.leesRegels(A), 'taal', { taal: 'de', afzender: 'community@doccle.be' })?.soort === 'afzender');
  R.zetRegel(A, { strook: 'taal', soort: 'taal', waarde: 'NL' }, true);
  check('taalregel gaat vóór afzender', R.regelVoor(R.leesRegels(A), 'taal', { taal: 'nl', afzender: doccle })?.soort === 'taal');
  check('andere taal, andere afzender: niets', R.regelVoor(R.leesRegels(A), 'taal', { taal: 'en', afzender: 'x@y.z' }) === null);
  check('taalregel geldt niet voor de beeldenstrook', R.regelVoor(R.leesRegels(A), 'beelden', { afzender: 'x@y.z' }) === null && !R.zetRegel(A, { strook: 'beelden', soort: 'taal', waarde: 'nl' }, true));
  R.zetRegel(A, { strook: 'beelden', soort: 'overal', waarde: '' }, true);
  check('overal op de beeldenstrook', R.regelVoor(R.leesRegels(A), 'beelden', { afzender: 'iemand@x.be' })?.soort === 'overal');
  check('twee keer aanzetten = geen tweede wijziging', R.zetRegel(A, { strook: 'beelden', soort: 'overal', waarde: '' }, true) === false);

  // 2. per bereik (account + mailbox), opslag, afmelden
  check('ander account ziet de regels niet', R.alleRegels(R.leesRegels(B)).length === 0);
  check('opgeslagen onder eigen sleutel', !!lokaal.getItem(R.regelsSleutel(A)) && R.regelsSleutel(A).startsWith(sporen.STROOK_REGELS_VOORVOEGSEL));
  R.vergeetRegelsCache();
  check('na herladen nog 3 regels', R.alleRegels(R.leesRegels(A)).length === 3);
  lokaal.setItem(R.regelsSleutel(B), JSON.stringify({ taal: { talen: ['nl', '<script>', 5], afzenders: ['geen-adres'], overal: 'ja' }, beelden: { overal: true }, tel: { 'taal|t:nl': 'x', 'iets|t:nl': 3, 'taal|t:de': 2 } }));
  R.vergeetRegelsCache();
  const b = R.leesRegels(B);
  check('kapotte opslag wordt opgeschoond', b.taal.talen.join() === 'nl' && b.taal.afzenders.length === 0 && b.taal.overal === false && b.beelden.overal === true && Object.keys(b.tel).join() === 'taal|t:de');
  sporen.wisLokaleSporen('eigenaar-1', lokaal as never);
  check('afmelden wist de regels van dat account', !lokaal.getItem(R.regelsSleutel(A)) && R.alleRegels(R.leesRegels(A)).length === 0);
  check('regels van het andere account blijven', !!lokaal.getItem(R.regelsSleutel(B)));

  // 3. voorstellen na herhaald ✕ (nooit automatisch)
  R.vergeetRegelsCache(); lokaal.clear();
  const k = { taal: 'nl', afzender: doccle };
  R.telSluiten(A, 'taal', k);
  check('na 1× ✕: geen voorstel', R.voorstelVoor(R.leesRegels(A), 'taal', k) === null);
  R.telSluiten(A, 'taal', k);
  const v = R.voorstelVoor(R.leesRegels(A), 'taal', k);
  check('na 2× ✕: voorstel taal (dekt meer brieven)', v?.soort === 'taal' && v.keer === 2);
  check('voorstel zet geen regel', R.regelVoor(R.leesRegels(A), 'taal', k) === null);
  R.telSluiten(A, 'taal', { taal: 'en', afzender: doccle });
  check('andere taal, zelfde afzender 3×: voorstel afzender', R.voorstelVoor(R.leesRegels(A), 'taal', { taal: 'en', afzender: doccle })?.soort === 'afzender');
  R.telSluiten(A, 'beelden', { afzender: doccle }); R.telSluiten(A, 'beelden', { afzender: doccle });
  check('beeldenstrook: voorstel afzender', R.voorstelVoor(R.leesRegels(A), 'beelden', { afzender: doccle })?.soort === 'afzender');

  // 4. sluitStrook: ✕ sluit voor de brief, telt, toont de keuzeregel; met al een regel geen keuzeregel en geen telling
  S.herstelStrokenVoorTest(); lokaal.clear(); R.vergeetRegelsCache();
  S.sluitStrook('m1', 'taal', A, k, R.leesRegels(A));
  const lees = () => { let s = null as unknown as ReturnType<typeof S.useStroken>; const L = () => { s = S.useStroken(); return null; }; renderToString(createElement(L)); return s; };
  let st = lees();
  check('✕: gesloten voor deze brief + keuzeregel', S.isGesloten(st, 'm1', 'taal') && S.isNazorg(st, 'm1', 'taal') && !S.isGesloten(st, 'm2', 'taal'));
  check('✕ telt mee', R.leesRegels(A).tel['taal|t:nl'] === 1);
  R.zetRegel(A, { strook: 'taal', soort: 'taal', waarde: 'nl' }, true);
  S.toonStrookWeer('m1', 'taal');
  st = lees();
  const stand = S.strookStaat(st, R.leesRegels(A), 'm1', 'taal', k);
  check('terugknop: getoond ondanks regel, met de regel erbij', !stand.verborgen && stand.getoond && stand.regel?.soort === 'taal');
  check('andere brief: regel verbergt', S.strookStaat(st, R.leesRegels(A), 'm2', 'taal', k).verborgen);
  S.sluitStrook('m1', 'taal', A, k, R.leesRegels(A));
  st = lees();
  check('✕ met bestaande regel: geen keuzeregel, geen extra telling', !S.isNazorg(st, 'm1', 'taal') && R.leesRegels(A).tel['taal|t:nl'] === 1);

  // 5. keuzeregel na ✕: voorstel voorop, tooltips met gevolg en weg terug, uk + nl
  lokaal.clear(); R.vergeetRegelsCache();
  R.telSluiten(A, 'taal', k); R.telSluiten(A, 'taal', k);
  const html = (lang: 'uk' | 'nl', strook: 'taal' | 'beelden') => renderToString(createElement(N.StrookNazorg, { lang, strook, bereik: A, kenmerken: strook === 'taal' ? k : { afzender: doccle }, onKlaar: () => {} }));
  const uk = html('uk', 'taal'), nl = html('nl', 'taal');
  check('keuzes: taal, afzender, alle', uk.includes('data-regel="taal"') && uk.includes('data-regel="afzender"') && uk.includes('data-regel="overal"'));
  check('voorstel staat voorop en is gemarkeerd', uk.indexOf('data-voorstel="ja"') > 0 && uk.indexOf('data-regel="taal"') < uk.indexOf('data-regel="afzender"') && /Пропозиція: ви вже 2 рази/.test(uk));
  check('tooltip uk: gevolg + переклад лишається + де скасувати', /не показуватиметься/.test(uk) && /Переклад лишається/.test(uk) && /Сховані смуги/.test(uk));
  check('nl-teksten', /Voortaan verbergen/.test(nl) && /Verborgen stroken/.test(nl) && /Voorstel: u verborg/.test(nl));
  const bk = html('uk', 'beelden');
  check('beeldenstrook: geen taalkeuze; beelden blijven verborgen in tooltip', !bk.includes('data-regel="taal"') && /лишаються прихованими/.test(bk));

  // 6. kiesRegel → meldingencentrum met «Скасувати» die echt terugdraait
  meldingen.length = 0;
  N.kiesRegel('uk', A, { strook: 'taal', soort: 'afzender', waarde: doccle }, true);
  const m = meldingen.at(-1);
  check('melding in het meldingencentrum', !!m && /більше не показується/.test(m.text) && m.kind === 'success' && !!m.explain);
  check('melding heeft «Скасувати»', m?.action?.label === 'Скасувати');
  m?.action?.onAction();
  check('«Скасувати» wist de regel en meldt dat', R.regelVoor(R.leesRegels(A), 'taal', { afzender: doccle }) === null && /знову показується/.test(meldingen.at(-1)?.text || ''));

  // 7. lijst in «Вигляд»
  R.zetRegel(A, { strook: 'taal', soort: 'taal', waarde: 'nl' }, true);
  R.zetActiefBereik(A);
  const lijst = renderToString(createElement(N.StrookRegelsLijst, { lang: 'uk' }));
  check('«Сховані смуги» toont de regel met ✕', /Сховані смуги/.test(lijst) && lijst.includes('data-strook-regel="taal|taal"') && /Прибрати правило/.test(lijst));
  R.zetActiefBereik(B);
  check('lijst volgt het bereik van de open brief', !renderToString(createElement(N.StrookRegelsLijst, { lang: 'uk' })).includes('data-strook-regel="taal|taal"'));
}

// 8. bedrading: regel verbergt alleen de strook, niet het gedrag
const tekst = readFileSync('src/MailBerichtTekst.tsx', 'utf8');
check('beelden: «toestaan» hangt niet van regels af', /const toestaan=instelling==='altijd'\|\|altijdAfzender\|\|eenmaal,/.test(tekst) && !/toestaan=[^;]*(regel|strookStaat)/.test(tekst));
// Павло 16.11: «Завжди від цього відправника» не казало, показувати чи не показувати — назва з дієсловом
check('knop zegt wat hij doet: «Завжди показувати від цього відправника»', tekst.includes("t('Завжди показувати від цього відправника','Altijd tonen van deze afzender')") && !tekst.includes("t('Завжди від цього відправника'"));
check('beelden: keuzeregel en regelhint bedraad', tekst.includes("<StrookNazorg lang={lang} strook='beelden'") && tekst.includes('<RegelHint'));
const gesprek = readFileSync('src/MailGesprekInhoud.tsx', 'utf8');
check('taal: keuzeregel en regelhint bedraad', gesprek.includes("<StrookNazorg lang={lang} strook='taal'") && gesprek.includes('regelHint={'));
check('taal: ✕ via sluitStrook (telt mee)', gesprek.includes("onSluit={()=>sluitStrook(message.id,'taal'"));
check('«Вигляд» toont de lijst', readFileSync('src/mail/WeergaveKeuze.tsx', 'utf8').includes('<StrookRegelsLijst lang={lang} />'));
check('afmelden kent het voorvoegsel', /const VOORVOEGSELS = \[[^\]]*STROOK_REGELS_VOORVOEGSEL[^\]]*\]/.test(readFileSync('src/lokale-sporen.ts', 'utf8')));
const css = readFileSync('src/mail/stroken-sluiten.css', 'utf8');
check('CSS: geen ruwe kleuren', !/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/i.test(css));
check('CSS: keuzes 44 px op aanraakschermen', /pointer:\s*coarse[\s\S]*mail-strook-nazorg-keuzes > button[\s\S]*min-height:\s*44px/.test(css));

process.exit(einde());
