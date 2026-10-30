// Pakket 3 «Adaptive Mail Canvas» (24.10.2026): de pure regels achter «Що від вас потрібно?», «Звідки це?» en «Порівняти»
// (shared/ai-bronnen.ts — dezelfde in de browser en op de server).
// Draaien: node scripts/eenheidstests.mjs ai-bronnen-20261024
// Макет (власник): «кожен пункт має чип джерела «лист 3 · §3» і, якщо є, термін»; «Кожен пункт знайдено дослівно в оригіналі (3 з 3)»;
// «Знайдено дослівно в оригіналі. Дату й термін звірено з текстом листа, а не з перекладом»; en de harde regel «нічого не вигадувати».
//  A. alinea's: lege regel, HTML-brief zonder lege regels, citaatkop («Op … schreef …:», «… пише:», Outlook), handtekening, «>»-regels;
//     nummering per brief; label «лист 3 · §2»; invoer voor het model «[3.2] …».
//  B. letterlijk zoeken: andere aanhalingstekens/hoofdletters/spaties, «…» in volgorde, te kort telt nooit, voorkeur voor de genoemde §.
//  C. controle: letterlijk, verplaatst, verzonnen; termijn alleen als hij in de ORIGINELE bronalinea staat (een vertaalde valt weg).
//  D. datums en termijnen: nl/uk/en/pl, tijd, jaar erbij (ook over de jaargrens), 31 februari, termijn zonder de punt van de zin.
//  E. eenvoudig ontleden zonder model: vragen, verzoeken (ook Oekraïens en Pools: woordgrenzen buiten A–Z), termijnen; «Коротко»:
//     datum+tijd, bijlage, bedrag (ook «500 грн»); groeten tellen niet; begrensd; elk punt staat letterlijk in de brief.
//  F. «Потребує відповіді», markeren in het origineel (ook met «…» en tekens buiten het BMP), taal, normaliseren.
import { checker } from './hulp/nep-google';
import {
  alineasVan, alineasVoorModel, antwoordNodig, bronLabel, controleerPunten, datumUit, eenvoudigeOntleding, gespreksAlineas,
  markeerCitaat, normaliseer, taalVan, telGevonden, termijnInBron, termijnInZin, termijnWoorden, zinnenVan, zoekCitaat,
  type GecontroleerdPunt,
} from '../../shared/ai-bronnen';

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
const UK = [
  'Добрий день, Павле!',
  '',
  'Нагадуємо, що оплату за жовтень потрібно здійснити до 28 жовтня. Сума — 500 грн.',
  '',
  'У вкладенні рахунок і акт. Чи зможете ви підтвердити отримання?',
  '',
  'З повагою,',
  'Олена',
].join('\n');
const PL = 'Dzień dobry,\n\nproszę o potwierdzenie spotkania. Proszę przesłać dokumenty do 30 października.\n\nZ poważaniem';
const REF = new Date(2026, 9, 24, 12, 0).getTime(); // za 24 okt. 2026, 12:00 (lokale tijd van de test)
const dag = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-bronnen-20261024');

  // ------------------------------------------------------------------ A. alinea's
  {
    const a = alineasVan(NL);
    check('A lege regel scheidt alinea\'s; regels binnen een alinea samengevoegd (4 alinea\'s, «Met vriendelijke groet, Jan Peeters» is er één)',
      a.length === 4 && a[3] === 'Met vriendelijke groet, Jan Peeters' && a[1].startsWith('Kunt u de huurovereenkomst'), JSON.stringify(a));
    const html = alineasVan('Beste Pavlo,\nKunt u bevestigen?\nDank u.');
    check('A HTML-brief zonder lege regels (server: </p> en <br> = één regeleinde) → elke regel is een alinea', html.length === 3 && html[1] === 'Kunt u bevestigen?', JSON.stringify(html));
    const citaat = alineasVan('Prima, tot dan.\n\nOp 22 okt. 2026 om 18:00 schreef Jan Peeters <jan@voorbeeld.be>:\n> Kunt u komen?\n> Groet');
    check('A het geciteerde vorige bericht hoort er niet bij («Op … schreef …:» en «>»-regels)', citaat.length === 1 && citaat[0] === 'Prima, tot dan.', JSON.stringify(citaat));
    const uk = alineasVan('Добре, домовились.\n\nОлена Коваль пише:\nЧи можете прийти?');
    check('A Oekraïense citaatkop «… пише:» stopt de brief', uk.length === 1 && uk[0] === 'Добре, домовились.', JSON.stringify(uk));
    const outlook = alineasVan('Zie hieronder.\n\nVan: Jan Peeters\nVerzonden: woensdag 21 oktober 2026 09:12\nAan: Pavlo\nOnderwerp: Huur\n\nKunt u tekenen?');
    check('A Outlook-kop «Van: … / Verzonden: …» stopt de brief (maar «Van:» alleen niet)', outlook.length === 1 && alineasVan('Van: de buren kreeg ik een pakje.\n\nDank!').length === 2, JSON.stringify(outlook));
    const hand = alineasVan('Tot morgen.\n\n-- \nJan Peeters\nMakelaar');
    check('A handtekening («-- ») hoort er niet bij', hand.length === 1 && hand[0] === 'Tot morgen.', JSON.stringify(hand));
    check('A lege of ontbrekende tekst → geen alinea\'s (geen fout)', alineasVan('').length === 0 && alineasVan(undefined as unknown as string).length === 0 && alineasVan('\n\n  \n').length === 0);
    const g = gespreksAlineas([{ brief: 1, tekst: 'Een.\n\nTwee.' }, { brief: 2, tekst: 'Drie.' }]);
    check('A gesprek: per brief (1 = oudste) en per alinea (1, 2, …)', JSON.stringify(g.map((x) => [x.brief, x.nr, x.tekst])) === JSON.stringify([[1, 1, 'Een.'], [1, 2, 'Twee.'], [2, 1, 'Drie.']]));
    check('A label van de bronchip: «лист 3 · §2» (uk) en «bericht 3 · §2» (nl)', bronLabel('uk', { brief: 3, nr: 2 }) === 'лист 3 · §2' && bronLabel('nl', { brief: 3, nr: 2 }) === 'bericht 3 · §2');
    check('A invoer voor het model: één regel per alinea «[brief.alinea] tekst»', alineasVoorModel(g) === '[1.1] Een.\n[1.2] Twee.\n[2.1] Drie.');
  }

  // ------------------------------------------------------------------ B. letterlijk zoeken
  const alineas = gespreksAlineas([{ brief: 1, tekst: 'Goedemiddag,\n\nin bijlage het concept van het huurcontract.' }, { brief: 2, tekst: NL }]);
  {
    const p = zoekCitaat('Kunt u de huurovereenkomst vóór maandag 26 oktober ondertekend terugsturen?', alineas);
    check('B letterlijk citaat → brief 2 · §2', !!p && p.brief === 2 && p.nr === 2, JSON.stringify(p));
    const q = zoekCitaat('  KUNT U DE HUUROVEREENKOMST   VÓÓR maandag 26 oktober  ', alineas);
    const aanh = zoekCitaat('de "huurovereenkomst" terugsturen', [{ brief: 1, nr: 1, tekst: 'Kunt u de „huurovereenkomst” terugsturen?' }]);
    check('B hoofdletters, spaties en de soort aanhalingstekens tellen niet (aanhalingstekens zelf wel: ze staan in het origineel)', !!q && q.brief === 2 && q.nr === 2 && !!aanh, JSON.stringify([q, aanh]));
    check('B «…» in het citaat = de stukken in volgorde in dezelfde alinea', !!zoekCitaat('De sleuteloverdracht is … om 10:00', alineas) && !zoekCitaat('om 10:00 … De sleuteloverdracht is', alineas));
    check('B stukken uit twee verschillende alinea\'s → niet gevonden', !zoekCitaat('in bijlage het concept … De sleuteloverdracht', alineas));
    check('B te kort telt nooit (minder dan 8 tekens of één woord): «так», «oktober», «v3)»', !zoekCitaat('так', [{ brief: 1, nr: 1, tekst: 'так, так' }]) && !zoekCitaat('oktober', alineas) && !zoekCitaat('v3)', alineas));
    check('B verzonnen citaat → null', zoekCitaat('De huur bedraagt € 950 per maand', alineas) === null);
    const dubbel = [{ brief: 1, nr: 1, tekst: 'Graag een bevestiging per mail.' }, { brief: 2, nr: 3, tekst: 'Nogmaals: graag een bevestiging per mail.' }];
    const v = zoekCitaat('graag een bevestiging per mail', dubbel, { brief: 2, nr: 3 });
    check('B staat het citaat op twee plaatsen, dan wint de alinea die het model noemde', !!v && v.brief === 2 && v.nr === 3, JSON.stringify(v));
    const w = zoekCitaat('graag een bevestiging per mail', dubbel, { brief: 2, nr: 1 });
    check('B noemt het model een § zonder het citaat, dan telt waar het WEL staat', !!w && w.brief === 1 && w.nr === 1, JSON.stringify(w));
  }

  // ------------------------------------------------------------------ C. controle
  {
    const c = controleerPunten([
      { id: 'a', tekst: 'Contract getekend terugsturen', citaat: 'huurovereenkomst vóór maandag 26 oktober ondertekend', brief: 2, alinea: 2, termijn: 'vóór 26 oktober', soort: 'verzoek' },
      { id: 'b', tekst: 'Contract getekend terugsturen', citaat: 'huurovereenkomst vóór maandag 26 oktober ondertekend', brief: 2, alinea: 3, termijn: 'vóór 26 oktober' },
      { id: 'c', tekst: '950 euro betalen', citaat: 'u moet 950 euro betalen', brief: 2, alinea: 3, termijn: 'morgen' },
      { id: 'd', tekst: 'Sleutels', citaat: 'De sleuteloverdracht is op woensdag … om 10:00', brief: 2, alinea: 2, termijn: '29 oktober' },
      { id: 'e', tekst: 'Termijn', citaat: 'Kunt u de huurovereenkomst', brief: 2, alinea: 2, termijn: 'до 26 жовтня' },
    ], alineas);
    const [a, b, cc, d, e] = c;
    check('C letterlijk gevonden, termijn staat in de bronalinea → behouden («in-bron»)', a.status === 'letterlijk' && a.bron?.brief === 2 && a.bron?.nr === 2 && !a.verplaatst && a.termijn === 'vóór 26 oktober' && a.termijnStaat === 'in-bron');
    check('C verkeerd alineanummer van het model → gevonden, met het JUISTE nummer en «verplaatst»', b.status === 'letterlijk' && b.bron?.nr === 2 && b.verplaatst);
    check('C verzonnen citaat → «niet-gevonden», zonder bron en zonder termijn', cc.status === 'niet-gevonden' && cc.bron === null && cc.termijn === '' && cc.termijnStaat === 'niet-in-bron');
    check('C termijn die niet in de bronalinea staat («29 oktober») → weggelaten', d.status === 'letterlijk' && d.termijn === '' && d.termijnStaat === 'niet-in-bron');
    check('C vertaalde termijn («до 26 жовтня» bij een Nederlandse brief) telt niet — datum gecontroleerd in het origineel', e.status === 'letterlijk' && e.termijn === '' && e.termijnStaat === 'niet-in-bron');
    check('C punt zonder termijn → termijnStaat «geen»', controleerPunten([{ id: 'x', tekst: 'x', citaat: 'In bijlage vindt u de nieuwe versie' }], alineas)[0].termijnStaat === 'geen');
    const t = telGevonden(c);
    check('C teller voor de voet: 4 van 5 letterlijk', t.gevonden === 4 && t.totaal === 5, JSON.stringify(t));
    check('C termijn als geheel of per getal/maand/weekdag: «maandag 26 okt.» telt niet (okt ≠ oktober? wel: beide zijn maand 10 maar het woord moet er staan)',
      termijnInBron('vóór maandag 26 oktober', NL) === 'in-bron' && termijnInBron('26 oktober, maandag', NL) === 'in-bron' && termijnInBron('maandag 27 oktober', NL) === 'niet-in-bron' && termijnInBron('', NL) === 'geen');
    check('C woorden van een termijn: getallen zonder voorloopnul, maanden en weekdagen', JSON.stringify(termijnWoorden('vóór maandag 06 oktober 2026')) === JSON.stringify(['6', '2026', 'maandag', 'oktober']), JSON.stringify(termijnWoorden('vóór maandag 06 oktober 2026')));
  }

  // ------------------------------------------------------------------ D. datums en termijnen
  {
    const a = datumUit('vóór maandag 26 oktober', REF);
    check('D «vóór maandag 26 oktober» → 26.10.2026, hele dag', !!a && dag(a.start) === '2026-10-26 0:00' && a.heleDag, a ? dag(a.start) : 'null');
    const b = datumUit('De sleuteloverdracht is op woensdag 28 oktober om 10:00.', REF);
    check('D «woensdag 28 oktober om 10:00» → 28.10.2026 10:00 (geen hele dag)', !!b && dag(b.start) === '2026-10-28 10:00' && !b.heleDag, b ? dag(b.start) : 'null');
    const c = datumUit('до 3 січня', REF);
    check('D zonder jaar en meer dan 30 dagen in het verleden → volgend jaar («до 3 січня» → 3.1.2027)', !!c && dag(c.start) === '2027-1-3 0:00', c ? dag(c.start) : 'null');
    const d = datumUit('op 20 oktober', REF);
    check('D zonder jaar, kort geleden → dit jaar (20.10.2026: een termijn die net voorbij is, blijft voorbij)', !!d && dag(d.start) === '2026-10-20 0:00', d ? dag(d.start) : 'null');
    const e = datumUit('28.10 om 14u30', REF), f = datumUit('2026-11-02', REF), g = datumUit('by October 28 at 9:15', REF);
    check('D «28.10 om 14u30» (dag.maand), «2026-11-02», «October 28 at 9:15»', !!e && dag(e.start) === '2026-10-28 14:30' && !!f && dag(f.start) === '2026-11-2 0:00' && !!g && dag(g.start) === '2026-10-28 9:15',
      [e, f, g].map((x) => (x ? dag(x.start) : 'null')).join(' | '));
    check('D 31 februari en tekst zonder datum → null (niets verzonnen)', datumUit('31 februari', REF) === null && datumUit('zo snel mogelijk', REF) === null);
    check('D termijn uit een zin, zoals hij er staat: nl, uk (zonder de punt van de zin), en, pl',
      termijnInZin('Kunt u tekenen vóór maandag 26 oktober?') === 'vóór maandag 26 oktober' && termijnInZin('Оплатіть до 28 жовтня.') === 'до 28 жовтня'
      && termijnInZin('Please reply by October 26.') === 'by October 26' && termijnInZin('Proszę przesłać dokumenty do 30 października.') === 'do 30 października',
      [termijnInZin('Оплатіть до 28 жовтня.'), termijnInZin('Please reply by October 26.')].join(' | '));
    check('D een datum zonder termijnwoord is geen termijn («Op 28 oktober is het feest»; «credo 26 oktober» telt niet als «do»)', termijnInZin('Op 28 oktober is het feest.') === '' && termijnInZin('Het credo 26 oktober.') === '');
    check('D zinnen: tijden en afkortingen blijven heel, «?»/«!» splitsen', JSON.stringify(zinnenVan('Kom om 10:00 aan. Lukt dat? Graag!')) === JSON.stringify(['Kom om 10:00 aan.', 'Lukt dat?', 'Graag!']));
  }

  // ------------------------------------------------------------------ E. eenvoudig ontleden (zonder model)
  {
    const nl = eenvoudigeOntleding([{ brief: 1, tekst: NL }]);
    check('E nl: de vraag met termijn is een punt (soort vraag, termijn «vóór maandag 26 oktober», bron 1 · §2)',
      nl.punten.length === 1 && nl.punten[0].soort === 'vraag' && nl.punten[0].termijn === 'vóór maandag 26 oktober' && nl.punten[0].bron?.nr === 2, JSON.stringify(nl.punten.map((p) => [p.soort, p.tekst, p.termijn])));
    check('E nl «Коротко»: datum met tijd, bijlage, bedrag (€ 875)', nl.kort.length === 3 && nl.kort.some((k) => k.tekst.includes('10:00')) && nl.kort.some((k) => k.tekst.startsWith('In bijlage')) && nl.kort.some((k) => k.tekst.includes('€ 875')), JSON.stringify(nl.kort.map((k) => k.tekst)));
    const uk = eenvoudigeOntleding([{ brief: 1, tekst: UK }]);
    check('E uk: verzoek («потрібно … до 28 жовтня») en vraag («Чи зможете …?»)',
      uk.punten.length === 2 && uk.punten[0].soort === 'verzoek' && uk.punten[0].termijn === 'до 28 жовтня' && uk.punten[1].soort === 'vraag', JSON.stringify(uk.punten.map((p) => [p.soort, p.tekst, p.termijn])));
    check('E uk «Коротко»: «Сума — 500 грн.» en «У вкладенні …» (woordgrenzen ook buiten A–Z; vóór de fix ontbraken ze)', uk.kort.some((k) => k.tekst.includes('500 грн')) && uk.kort.some((k) => k.tekst.startsWith('У вкладенні')), JSON.stringify(uk.kort.map((k) => k.tekst)));
    const pl = eenvoudigeOntleding([{ brief: 1, tekst: PL }]);
    check('E pl: «proszę …» is een verzoek (ę aan het eind van het woord)', pl.punten.length === 2 && pl.punten.every((p) => p.soort === 'verzoek'), JSON.stringify(pl.punten.map((p) => [p.soort, p.tekst])));
    check('E groeten tellen niet («Met vriendelijke groet», «З повагою»)', ![...nl.punten, ...nl.kort, ...uk.punten, ...uk.kort].some((p) => /groet|повагою/i.test(p.tekst)));
    const alle = [...nl.punten, ...nl.kort, ...uk.punten, ...uk.kort, ...pl.punten];
    const bron = normaliseer(`${NL}\n${UK}\n${PL}`);
    check('E niets verzonnen: elk punt is een zin uit de brief (tekst = citaat), letterlijk, met bron', alle.length > 0 && alle.every((p) => p.status === 'letterlijk' && !!p.bron && p.tekst === p.citaat && bron.includes(normaliseer(p.citaat))));
    const veel = Array.from({ length: 9 }, (_, i) => `Kunt u punt ${i + 1} nakijken? Op ${i + 1} november om 10:00 is er overleg.`).join('\n\n');
    const r = eenvoudigeOntleding([{ brief: 1, tekst: veel }]);
    check('E begrensd: hoogstens 5 punten en 3 feiten', r.punten.length === 5 && r.kort.length === 3, `${r.punten.length}/${r.kort.length}`);
    check('E dezelfde zin twee keer → één punt; lege brief → niets', eenvoudigeOntleding([{ brief: 1, tekst: 'Kunt u bevestigen?' }, { brief: 2, tekst: 'Kunt u bevestigen?' }]).punten.length === 1 && eenvoudigeOntleding([{ brief: 1, tekst: '' }]).punten.length === 0);
    check('E ids zijn stabiel (dezelfde brief → dezelfde ids: «Пункт хибний — прибрати» blijft bij het juiste punt)', JSON.stringify(eenvoudigeOntleding([{ brief: 1, tekst: NL }]).punten.map((p) => p.id)) === JSON.stringify(nl.punten.map((p) => p.id)));
  }

  // ------------------------------------------------------------------ F. «Потребує відповіді», markeren, taal, normaliseren
  {
    const vraag = (brief: number): GecontroleerdPunt => ({ id: `v${brief}`, tekst: 'Kunt u bevestigen?', citaat: 'Kunt u bevestigen?', soort: 'vraag', status: 'letterlijk', bron: { brief, nr: 1, van: 0, tot: 18 }, verplaatst: false, termijnStaat: 'geen' });
    const gesprek = [{ from: 'Jan <jan@voorbeeld.be>' }, { from: 'Pavlo <pavlo@voorbeeld.ua>' }, { from: 'jan@voorbeeld.be' }];
    check('F wacht op mijn antwoord: vraag in een brief na mijn laatste brief → dat punt', antwoordNodig(gesprek, ['PAVLO@voorbeeld.ua'], [vraag(3)])?.id === 'v3');
    check('F vraag alleen vóór mijn laatste brief → null; laatste brief van mij → null', antwoordNodig(gesprek, ['pavlo@voorbeeld.ua'], [vraag(1)]) === null && antwoordNodig(gesprek.slice(0, 2), ['pavlo@voorbeeld.ua'], [vraag(1)]) === null);
    check('F een niet-gevonden punt of een feit maakt geen «Потребує відповіді»', antwoordNodig(gesprek, ['pavlo@voorbeeld.ua'], [{ ...vraag(3), status: 'niet-gevonden' }, { ...vraag(3), soort: 'feit' }]) === null);
    const m = markeerCitaat('Kunt u de „huurovereenkomst” vóór maandag terugsturen?', 'de "huurovereenkomst" vóór');
    check('F markeren in het ORIGINEEL (met zijn eigen aanhalingstekens)', m.length === 3 && m[1].mark && m[1].tekst === 'de „huurovereenkomst” vóór' && m.map((x) => x.tekst).join('') === 'Kunt u de „huurovereenkomst” vóór maandag terugsturen?', JSON.stringify(m));
    const m2 = markeerCitaat('De sleuteloverdracht is op woensdag 28 oktober om 10:00.', 'De sleuteloverdracht is … om 10:00');
    check('F «…» → elk stuk apart gemarkeerd, de tekst ertussen niet', m2.filter((x) => x.mark).map((x) => x.tekst).join('|') === 'De sleuteloverdracht is|om 10:00', JSON.stringify(m2));
    const m3 = markeerCitaat('Tot morgen 🙂 en  graag op tijd komen!', 'en graag op tijd komen');
    check('F tekens buiten het BMP (emoji) en dubbele spaties verschuiven de markering niet', m3.some((x) => x.mark && x.tekst === 'en  graag op tijd komen'), JSON.stringify(m3));
    check('F niet gevonden → één ongemarkeerd stuk (de alinea zelf)', JSON.stringify(markeerCitaat('Dag Jan.', 'iets anders hier')) === JSON.stringify([{ tekst: 'Dag Jan.', mark: false }]));
    check('F taal: uk, nl, en (zelfde ruwe regels als de server)', taalVan(UK) === 'uk' && taalVan(NL) === 'nl' && taalVan('Please confirm the meeting.') === 'en');
    check('F normaliseren: NFKC, aanhalingstekens, streepjes, harde spatie, zacht afbreekteken, hoofdletters',
      normaliseer('„Ｈuur” –­bedrag ’s') === '"huur" -bedrag \'s', JSON.stringify(normaliseer('„Ｈuur” –­bedrag ’s')));
  }

  return einde();
}
