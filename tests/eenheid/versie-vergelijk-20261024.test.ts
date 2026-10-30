// «Порівняти версії» in het contextpaneel van de lezer (pakket 3 «Adaptive Mail Canvas», 24.10.2026).
// Draaien: node scripts/eenheidstests.mjs versie-vergelijk-20261024
// Макет (власник): «вкладення: група версій одного документа (v3 · остання, v2, v1) · Порівняти».
//  A. puur (src/mail/tekst-verschil.ts): blokken (alinea's, lijstpunten, korte regels, afbreking, zeer lange alinea in zinnen zonder te
//     knippen na «art.»/«ст.»/«вул.»), gelijke teksten, één gewijzigde zin → één rij «gewijzigd» met de juiste woorden, toegevoegde en
//     weggevallen alinea's, verplaatste alinea's (geen explosie, naar elkaar verwezen), typografie telt niet, gesplitste alinea,
//     alinea die in één versie in zinnen gaat, Oekraïens en Nederlands, begrenzing (afgekapt, geen verzonnen «weg»), snelheid.
//  B. tekst uit bijlagen (src/mail/bijlage-tekst.ts): welke lezer (extensie/MIME), decoderen (UTF-8, 1251, 1252, afgeknipt), platte
//     tekst en CSV, onbekend formaat; PDF-pagina's (kop/voet en paginanummers weg, alinea's, doorlopen over de pagina); een echte pdf
//     (pdf-lib → pdf.js, dezelfde worker als het voorbeeld).
//  C. structuur (renderToStaticMarkup): modaal venster (role, aria-modal, labelledby/describedby, data-versie-vergelijk), keuze van de
//     versies (standaard vorige ↔ laatste, «v2 · datum · naam»), samenvatting, legenda, ingeklapte ongewijzigde alinea's, <del>/<ins>,
//     eerlijke noten; laden, fout, onleesbaar formaat, scan zonder tekst, gelijke tekst — nooit een verzonnen uitkomst.
//  D. bron en CSS: Escape (capture op window, stopPropagation), focus erin/terug, Tab binnen, portal; pdf zoals MailPdfVoorbeeld; de
//     bestaande documentlader; alleen tokens, geen hex, koppen zonder Georgia, 360 px, 44 px bij aanraken.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { tekstBlokken, vergelijkTeksten, woordVerschil, type VerschilRij } from '../../src/mail/tekst-verschil';
import { bijlageSoort, bijlageTekst, decodeerTekst, pdfPaginasTekst, PDF_MAX_PAGINAS, TEKST_MAX_BYTES, type PdfPagina } from '../../src/mail/bijlage-tekst';
import { bijlageVersies } from '../../src/mail/gesprek-context';

const lees = (f: string) => readFileSync(f, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const soorten = (r: VerschilRij[]) => r.map((x) => x.soort).join(',');

const HUUR_V2 = [
  'Artikel 1 – Voorwerp',
  'De verhuurder verhuurt aan de huurder de woning gelegen te Voorbeeldstraat 12, 2000 Antwerpen.',
  'Artikel 2 – Huurprijs',
  'De huurder betaalt elke maand een huur van 850 euro op de rekening van de verhuurder, uiterlijk op de vijfde dag van de maand.',
  'Artikel 3 – Waarborg',
  'De waarborg bedraagt twee maanden huur en wordt op een geblokkeerde rekening gezet.',
].join('\n\n');
const HUUR_V3 = HUUR_V2.replace('850 euro', '875 euro');
const UK_V1 = ['Стаття 1. Предмет договору', 'Орендодавець передає орендареві квартиру за адресою вул. Шевченка, 12, м. Київ.', 'Орендар сплачує 20000 гривень щомісяця до п’ятого числа.', 'Ключі передаються в день підписання.'].join('\n\n');
const UK_V2 = ['Стаття 1. Предмет договору', 'Орендодавець передає орендареві квартиру за адресою вул. Шевченка, 12, м. Київ.', 'Орендар сплачує 22000 гривень щомісяця до п’ятого числа.', 'Домашні тварини дозволені лише за письмовою згодою орендодавця.'].join('\n\n');

// gesprek met drie versies van hetzelfde contract (zoals lezer-context-20261024)
const T = Date.UTC(2026, 9, 24, 12, 0, 0);
const pdf = (naam: string, kb: number) => ({ providerAttachmentId: `bijl-${naam}`, filename: naam, contentType: 'application/pdf', sizeBytes: kb * 1024 });
const GESPREK = [
  { id: 'm1', threadId: 't0', from: 'Lotte Vermeulen <lotte.vermeulen@immo-voorbeeld.example>', subject: 'Huurcontract', receivedAt: T - 2 * 864e5, attachments: [pdf('Huurcontract-concept.pdf', 1600)] },
  { id: 'm2', threadId: 't0', from: 'Pavlo <pavlo@ik.example>', subject: 'Re: Huurcontract', receivedAt: T - 864e5, attachments: [pdf('Huurcontract-getekend.pdf', 1700)] },
  { id: 'm2b', threadId: 't0', from: 'Pavlo <pavlo@ik.example>', subject: 'Fwd: Huurcontract', receivedAt: T - 864e5 + 6e5, attachments: [pdf('Huurcontract-getekend.pdf', 1700)] },
  { id: 'm3', threadId: 't0', from: 'Lotte Vermeulen <lotte.vermeulen@immo-voorbeeld.example>', subject: 'Re: Huurcontract', receivedAt: T, attachments: [pdf('Huurcontract-ondertekend.pdf', 1800)] },
];

/** Tekstitem zoals pdf.js het geeft (transform[4] = x, transform[5] = y). */
const item = (str: string, x: number, y: number, breedte: number, h = 11, hasEOL = true) => ({ str, transform: [h, 0, 0, h, x, y], width: breedte, height: h, hasEOL });

export async function main(): Promise<number> {
  const { check, einde } = checker('versie-vergelijk-20261024');

  // ------------------------------------------------------------------ A. puur: blokken en verschil
  const bl = tekstBlokken('  Eerste regel van\neen alinea die door-\nloopt\u00A0hier.  \r\n\r\n\r\n- punt een\n- punt twee\n\nLotte Vermeulen\nVoorbeeldstraat 12\n2000 Antwerpen\n\n   \n\nDe \uFB01rma tekent.');
  check('A blokken: alinea\'s op lege regels, witruimte genormaliseerd (ook NBSP en CRLF), afbreking aan het regeleinde hersteld, lijstpunten en adresregels apart, ligatuur «\uFB01» → «fi», lege weg',
    JSON.stringify(bl) === JSON.stringify(['Eerste regel van een alinea die doorloopt hier.', '- punt een', '- punt twee', 'Lotte Vermeulen', 'Voorbeeldstraat 12', '2000 Antwerpen', 'De firma tekent.']), JSON.stringify(bl));
  const nlLang = Array.from({ length: 24 }, (_, i) => `Volgens art. 5 betaalt dhr. Peeters o.a. de kosten van zaak ${i + 1} aan J. Janssens.`).join(' ');
  const nlZinnen = tekstBlokken(nlLang);
  check('A zeer lange alinea (> 1500 tekens) in zinnen; niet geknipt na «art.», «dhr.», «o.a.» of een initiaal',
    nlLang.length > 1500 && nlZinnen.length === 24 && nlZinnen.every((z) => z.startsWith('Volgens art. 5 betaalt dhr. Peeters o.a. de kosten') && z.endsWith('aan J. Janssens.')), `${nlZinnen.length}: ${nlZinnen.slice(0, 2).join(' | ')}`);
  const ukLang = Array.from({ length: 22 }, (_, i) => `Відповідно до ст. 5 договору орендар № ${i + 1} мешкає за адресою вул. Шевченка, 12, м. Київ, і сплачує внесок.`).join(' ');
  const ukZinnen = tekstBlokken(ukLang);
  check('A те саме українською: не ріже після «ст.», «вул.», «м.»',
    ukLang.length > 1500 && ukZinnen.length === 22 && ukZinnen.every((z) => z.includes('ст. 5 договору') && z.includes('вул. Шевченка, 12, м. Київ') && z.endsWith('сплачує внесок.')), `${ukZinnen.length}: ${ukZinnen[0]}`);

  const gelijk = vergelijkTeksten(HUUR_V2, HUUR_V2);
  check('A gelijke teksten: alleen «gelijk», niets afgekapt', gelijk.telling.gelijk === 6 && gelijk.telling.weg + gelijk.telling.nieuw + gelijk.telling.gewijzigd === 0 && !gelijk.afgekapt, JSON.stringify(gelijk.telling));
  const typo = vergelijkTeksten('Hij zei: “ja” – zeker…', 'Hij zei:  "ja" - zeker...');
  check('A typografie telt niet als wijziging (aanhalingstekens, streepjes, …, dubbele spaties)', soorten(typo.rijen) === 'gelijk', JSON.stringify(typo.rijen));

  const een = vergelijkTeksten(HUUR_V2, HUUR_V3);
  const gw = een.rijen.find((r) => r.soort === 'gewijzigd');
  check('A één gewijzigde zin → precies één rij «gewijzigd», de rest gelijk',
    een.telling.gewijzigd === 1 && een.telling.gelijk === 5 && een.telling.weg === 0 && een.telling.nieuw === 0 && een.rijen[3]?.soort === 'gewijzigd', JSON.stringify(een.telling));
  check('A woorden: «850» weg, «875» nieuw, leestekens en de rest van de zin blijven gelijk',
    JSON.stringify(gw?.woorden) === JSON.stringify([
      { soort: 'gelijk', tekst: 'De huurder betaalt elke maand een huur van' }, { soort: 'weg', tekst: '850' }, { soort: 'nieuw', tekst: '875' },
      { soort: 'gelijk', tekst: 'euro op de rekening van de verhuurder, uiterlijk op de vijfde dag van de maand.' },
    ]), JSON.stringify(gw?.woorden));
  const lp = woordVerschil('De huurder betaalt, uiterlijk morgen.', 'De huurder betaalt; uiterlijk overmorgen!');
  check('A leestekens blijven aan hun woord («betaalt,» → «betaalt;», «morgen.» → «overmorgen!»)',
    JSON.stringify(lp) === JSON.stringify([{ soort: 'gelijk', tekst: 'De huurder' }, { soort: 'weg', tekst: 'betaalt,' }, { soort: 'nieuw', tekst: 'betaalt;' }, { soort: 'gelijk', tekst: 'uiterlijk' }, { soort: 'weg', tekst: 'morgen.' }, { soort: 'nieuw', tekst: 'overmorgen!' }]), JSON.stringify(lp));
  const schoon = woordVerschil('x y z de u v en de rest', 'p q r de s t en de rest');
  check('A leesbaar: een los gelijk woordje tussen twee wijzigingen gaat in de wijziging op', JSON.stringify(schoon) === JSON.stringify([{ soort: 'weg', tekst: 'x y z de u v' }, { soort: 'nieuw', tekst: 'p q r de s t' }, { soort: 'gelijk', tekst: 'en de rest' }]), JSON.stringify(schoon));

  const erbij = vergelijkTeksten(HUUR_V2, `${HUUR_V2}\n\nArtikel 4 – Huisdieren\n\nHuisdieren zijn toegestaan na schriftelijk akkoord.`);
  const eraf = vergelijkTeksten(HUUR_V2, HUUR_V2.replace('\n\nArtikel 3 – Waarborg\n\nDe waarborg bedraagt twee maanden huur en wordt op een geblokkeerde rekening gezet.', ''));
  check('A toegevoegde alinea\'s: «nieuw» op hun plaats (achteraan); weggevallen: «weg»',
    soorten(erbij.rijen) === 'gelijk,gelijk,gelijk,gelijk,gelijk,gelijk,nieuw,nieuw' && erbij.rijen[7].nieuw === 'Huisdieren zijn toegestaan na schriftelijk akkoord.'
    && soorten(eraf.rijen) === 'gelijk,gelijk,gelijk,gelijk,weg,weg' && eraf.telling.weg === 2, `${soorten(erbij.rijen)} / ${soorten(eraf.rijen)}`);
  const midden = vergelijkTeksten('Een.\n\nTwee drie vier.\n\nVijf.', 'Een.\n\nTwee drie vier.\n\nNieuw stuk tekst hier.\n\nVijf.');
  check('A nieuwe alinea in het midden: precies daar', soorten(midden.rijen) === 'gelijk,gelijk,nieuw,gelijk', soorten(midden.rijen));

  const al = ['Een twee drie vier.', 'Vijf zes zeven acht.', 'Negen tien elf twaalf.', 'Dertien veertien vijftien zestien.'];
  const om = vergelijkTeksten(al.join('\n\n'), [al[2], al[3], al[0], al[1]].join('\n\n'));
  const wegRij = om.rijen.findIndex((r) => r.soort === 'weg');
  check('A herschikken explodeert niet: 6 rijen (2 gelijk, 2 weg, 2 nieuw), beide kanten als «verplaatst» naar elkaar verwezen',
    om.rijen.length === 6 && om.telling.gelijk === 2 && om.telling.weg === 2 && om.telling.nieuw === 2 && om.telling.gewijzigd === 0
    && typeof om.rijen[wegRij].verplaatst === 'number' && om.rijen[om.rijen[wegRij].verplaatst as number].verplaatst === wegRij
    && om.rijen.filter((r) => r.soort !== 'gelijk').every((r) => typeof r.verplaatst === 'number'), JSON.stringify(om.rijen.map((r) => [r.soort, r.verplaatst])));
  const gesplitst = vergelijkTeksten('Kop\n\nDe huurder betaalt de huur op tijd. De verhuurder herstelt gebreken binnen een maand.', 'Kop\n\nDe huurder betaalt de huur op tijd.\n\nDe verhuurder herstelt gebreken binnen een maand.');
  check('A alinea in twee gesplitst (zelfde tekst): gelijk — alleen de opmaak veranderde', soorten(gesplitst.rijen) === 'gelijk,gelijk', soorten(gesplitst.rijen));
  const zin = (i: number) => `Zin ${i} met wat woorden erin om de alinea lang genoeg te maken.`;
  const p2 = Array.from({ length: 23 }, (_, i) => zin(i + 1)).join(' ');
  const p3 = `${p2.replace('Zin 5 met', 'Zin 5 zonder')} Een extra zin die de grens van vijftienhonderd tekens overschrijdt, zodat deze versie in zinnen wordt gesplitst.`;
  const grens = vergelijkTeksten(`Kop\n\n${p2}\n\nSlot`, `Kop\n\n${p3}\n\nSlot`);
  const grensW = grens.rijen.find((r) => r.soort === 'gewijzigd')?.woorden?.filter((w) => w.soort !== 'gelijk');
  check('A alinea die in één versie over 1500 tekens gaat (daar in zinnen): één «gewijzigd» («met» → «zonder») + de nieuwe zin, geen tientallen rijen',
    p2.length < 1500 && p3.length > 1500 && tekstBlokken(p3).length > 20 && soorten(grens.rijen) === 'gelijk,gewijzigd,nieuw,gelijk'
    && JSON.stringify(grensW) === JSON.stringify([{ soort: 'weg', tekst: 'met' }, { soort: 'nieuw', tekst: 'zonder' }]), `${soorten(grens.rijen)} ${JSON.stringify(grensW)}`);

  const uk = vergelijkTeksten(UK_V1, UK_V2);
  const ukW = uk.rijen.find((r) => r.soort === 'gewijzigd')?.woorden?.filter((w) => w.soort !== 'gelijk');
  check('A українською: змінена сума → один «gewijzigd» (20000 → 22000), прибраний і доданий абзаци',
    soorten(uk.rijen) === 'gelijk,gelijk,gewijzigd,weg,nieuw' && JSON.stringify(ukW) === JSON.stringify([{ soort: 'weg', tekst: '20000' }, { soort: 'nieuw', tekst: '22000' }])
    && uk.rijen[3].oud === 'Ключі передаються в день підписання.' && uk.rijen[4].nieuw === 'Домашні тварини дозволені лише за письмовою згодою орендодавця.', `${soorten(uk.rijen)} ${JSON.stringify(ukW)}`);

  // begrenzing: 50 nieuwe alinea's vooraan, hoogstens 100 blokken → afgekapt, en géén «weg» voor wat na de knip nog bestaat
  const basis = Array.from({ length: 150 }, (_, i) => `Bepaling ${i} geldt voor de hele looptijd van deze overeenkomst.`);
  const voor = Array.from({ length: 50 }, (_, i) => `Nieuwe bepaling ${i} over iets heel anders dan voorheen.`);
  const kap = vergelijkTeksten(basis.join('\n\n'), [...voor, ...basis].join('\n\n'), { maxBlokken: 100 });
  check('A te veel blokken: afgekapt, en wat na de laatste zekere gelijke rij kwam staat er niet (geen verzonnen «weg»)',
    kap.afgekapt && kap.telling.weg === 0 && kap.telling.nieuw === 50 && kap.telling.gelijk === 50 && kap.rijen[kap.rijen.length - 1].soort === 'gelijk', JSON.stringify(kap.telling));
  const enorm = Array.from({ length: 4500 }, (_, i) => `Regel ${i} van een heel groot bestand.`).join('\n\n');
  const enormUit = vergelijkTeksten(enorm, enorm.replace('Regel 10 van', 'Regel tien van'));
  check('A standaardgrens (4000 blokken per kant): een bestand van 4500 alinea\'s → afgekapt, wijziging vooraan wel gevonden', enormUit.afgekapt && enormUit.telling.gewijzigd === 1 && enormUit.telling.weg === 0, JSON.stringify(enormUit.telling));
  const budget = { cellen: 40_000_000, afgekapt: false };
  const veel = woordVerschil(Array.from({ length: 2500 }, (_, i) => `a${i}`).join(' '), Array.from({ length: 2500 }, (_, i) => `b${i}`).join(' '), budget);
  check('A paar met meer dan 4000 woorden: geen verschil per woord (afgekapt), wel eerlijk weg + nieuw', budget.afgekapt && veel.length === 2 && veel[0].soort === 'weg' && veel[1].soort === 'nieuw');

  // snelheid: contract van ~30 pagina's (600 alinea's, 5 wijzigingen) en twee volledig verschillende versies van 3000 alinea's
  const contract = Array.from({ length: 600 }, (_, i) => `Artikel ${i}. De partijen komen overeen dat bepaling ${i} geldt voor de duur van de overeenkomst en dat elke wijziging schriftelijk gebeurt, met een termijn van ${i % 30} dagen.`);
  let t0 = performance.now();
  const c30 = vergelijkTeksten(contract.join('\n\n'), contract.map((s, i) => (i % 120 === 7 ? s.replace('schriftelijk', 'per e-mail') : s)).join('\n\n'));
  const ms30 = performance.now() - t0;
  t0 = performance.now();
  const anders = vergelijkTeksten(Array.from({ length: 3000 }, (_, i) => `Alinea ${i} met tekst ${i * 7}.`).join('\n\n'), Array.from({ length: 3000 }, (_, i) => `Alinea ${i} met andere tekst ${i * 3}.`).join('\n\n'));
  const msAnders = performance.now() - t0;
  check('A snel genoeg: contract van 30 pagina\'s < 1 s (5 wijzigingen gevonden), 3000 × 3000 verschillende alinea\'s < 5 s zonder afkappen',
    ms30 < 1000 && c30.telling.gewijzigd === 5 && c30.telling.gelijk === 595 && msAnders < 5000 && !anders.afgekapt && anders.telling.gewijzigd === 3000, `${ms30.toFixed(0)} ms / ${msAnders.toFixed(0)} ms ${JSON.stringify(anders.telling)}`);

  // ------------------------------------------------------------------ B. tekst uit bijlagen
  check('B lezer per bestand: pdf (extensie of MIME), tekst (.txt/.md/.csv, text/plain), docx/odt/rtf; .xlsx als text/plain, .doc en .jpg: onbekend',
    bijlageSoort('application/octet-stream', 'Huurcontract.PDF') === 'pdf' && bijlageSoort('application/pdf', 'contract.v2') === 'pdf' && bijlageSoort('text/plain', 'notities.md') === 'tekst'
    && bijlageSoort('', 'lijst.csv') === 'tekst' && bijlageSoort('text/plain; charset=utf-8', 'bericht') === 'tekst' && bijlageSoort('', 'brief.docx') === 'docx' && bijlageSoort('', 'brief.odt') === 'docx'
    && bijlageSoort('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'contract') === 'docx' && bijlageSoort('text/plain', 'tabel.xlsx') === 'onbekend'
    && bijlageSoort('application/msword', 'oud.doc') === 'onbekend' && bijlageSoort('image/jpeg', 'scan.jpg') === 'onbekend' && bijlageSoort('application/zip', 'map.zip') === 'onbekend');
  const utf8 = new TextEncoder().encode('Договір оренди — één');
  const w1251 = Uint8Array.from([0xc4, 0xee, 0xe3, 0xee, 0xe2, 0xb3, 0xf0, 0x20, 0xee, 0xf0, 0xe5, 0xed, 0xe4, 0xe8]); // «Договір оренди»
  const w1252 = Uint8Array.from([...new TextEncoder().encode('Hu'), 0xe9, ...new TextEncoder().encode('t of '), 0xe9, 0xe9, ...new TextEncoder().encode('n keer')]); // «Huét of één keer»
  check('B decoderen: UTF-8, Windows-1251 (Oekraïens), Windows-1252 (Nederlands), afgeknipt midden in een teken',
    decodeerTekst(utf8) === 'Договір оренди — één' && decodeerTekst(w1251) === 'Договір оренди' && decodeerTekst(w1252) === 'Huét of één keer' && decodeerTekst(utf8.subarray(0, 3), true) === 'Д',
    `${decodeerTekst(w1251)} | ${decodeerTekst(w1252)} | ${JSON.stringify(decodeerTekst(utf8.subarray(0, 3), true))}`);
  const txt = await bijlageTekst(new Blob([HUUR_V2]), 'text/plain', 'contract.txt');
  const csv = await bijlageTekst(new Blob(['naam;bedrag\r\nhuur;850\r\nwaarborg;1700']), 'text/csv', 'kosten.csv');
  const groot = await bijlageTekst(new Blob([new Uint8Array(TEKST_MAX_BYTES + 10).fill(0x61)]), 'text/plain', 'groot.txt');
  const onbekend = await bijlageTekst(new Blob([new Uint8Array([0xff, 0xd8, 0xff])]), 'image/jpeg', 'scan.jpg');
  check('B platte tekst: soort «tekst»; CSV: elke regel een rij; boven 2 MB alleen het begin (afgekapt); een foto: «onbekend» zonder tekst',
    txt.soort === 'tekst' && txt.tekst === HUUR_V2 && !txt.afgekapt && JSON.stringify(tekstBlokken(csv.tekst)) === JSON.stringify(['naam;bedrag', 'huur;850', 'waarborg;1700'])
    && groot.afgekapt && groot.tekst.length === TEKST_MAX_BYTES && onbekend.soort === 'onbekend' && onbekend.tekst === '' && !onbekend.afgekapt, JSON.stringify({ csv: csv.tekst, groot: groot.tekst.length, onbekend }));

  // PDF zonder pdf.js: pagina's met kop, voet (paginanummer), alinea's, een alinea die doorloopt naar de volgende pagina
  const pagina = (n: number, totaal: number, regels: Array<ReturnType<typeof item>>): PdfPagina => ({ hoogte: 842, onder: 0, items: [item('Huurovereenkomst Voorbeeldstraat 12', 50, 800, 160, 9), ...regels, item(`Pagina ${n} van ${totaal}`, 270, 30, 60, 9)] });
  const paginas = [
    pagina(1, 3, [item('Artikel 1 – Huurprijs', 50, 760, 100), item('De huurder betaalt elke maand een huur van 850 euro op de rekening van de', 50, 735, 380), item('verhuurder, uiterlijk op de vijfde dag van de maand. De huurder mag niet ver-', 50, 720, 380), item('rekenen met tegoeden.', 50, 705, 100), item('De waarborg bedraagt twee maanden huur en wordt op een geblokkeerde', 50, 680, 380)]),
    pagina(2, 3, [item('rekening gezet op naam van de huurder.', 50, 760, 190), item('Artikel 2 – Duur', 50, 735, 90), item('De overeenkomst geldt voor negen jaar.', 50, 710, 200)]),
    pagina(3, 3, [item('Opgemaakt te Antwerpen in twee exemplaren.', 50, 760, 220)]),
  ];
  const pt = pdfPaginasTekst(paginas);
  check('B pdf-pagina\'s: kop- en voetregels (herhaald, «Pagina N van M») weg, alinea\'s uit witruimte en korte regels, afbreking hersteld, alinea loopt door over de pagina',
    pt === ['Artikel 1 – Huurprijs', 'De huurder betaalt elke maand een huur van 850 euro op de rekening van de verhuurder, uiterlijk op de vijfde dag van de maand. De huurder mag niet verrekenen met tegoeden.',
      'De waarborg bedraagt twee maanden huur en wordt op een geblokkeerde rekening gezet op naam van de huurder.', 'Artikel 2 – Duur', 'De overeenkomst geldt voor negen jaar.', 'Opgemaakt te Antwerpen in twee exemplaren.'].join('\n\n'), JSON.stringify(pt));
  const eenPagina = pdfPaginasTekst([{ hoogte: 842, items: [item('Korte brief zonder kop.', 50, 760, 120), item('3', 290, 30, 6, 9)] }]);
  const regelsZonderEol = pdfPaginasTekst([{ hoogte: 842, items: [item('Eerste deel ', 50, 760, 60, 11, false), item('van de zin', 110, 760, 50, 11, false), item('Volgende regel.', 50, 745, 80, 11, false)] }]);
  check('B pdf: één pagina — los paginanummer weg, de tekst blijft; regels ook zonder hasEOL: stukken op dezelfde hoogte één regel, een sprong in y een nieuwe regel (met spatie)',
    eenPagina === 'Korte brief zonder kop.' && regelsZonderEol === 'Eerste deel van de zin Volgende regel.', `${JSON.stringify(eenPagina)} ${JSON.stringify(regelsZonderEol)}`);

  // een echte pdf: pdf-lib maakt twee versies, pdf.js (zelfde pakket en worker als het voorbeeld) leest ze
  try {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const maak = async (huur: string, aantal: number) => {
      const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
      for (let p = 1; p <= aantal; p++) {
        const page = doc.addPage([595, 842]);
        page.drawText('Huurovereenkomst Voorbeeldstraat 12', { x: 50, y: 800, size: 9, font });
        let y = 760;
        for (const r of [`Artikel ${p} - Huurprijs`, null, `De huurder betaalt elke maand een huur van ${huur} euro op de rekening van de`, 'verhuurder, uiterlijk op de vijfde dag van de maand.']) {
          if (r === null) { y -= 10; continue; }
          page.drawText(r, { x: 50, y, size: 11, font }); y -= 15;
        }
        page.drawText(`Pagina ${p} van ${aantal}`, { x: 270, y: 30, size: 9, font });
      }
      return doc.save();
    };
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs')).href;
    const a = await bijlageTekst(new Blob([await maak('850', 2)]), 'application/pdf', 'Huurcontract-concept.pdf');
    const b = await bijlageTekst(new Blob([await maak('875', 2)]), 'application/octet-stream', 'Huurcontract-getekend.pdf');
    const ab = vergelijkTeksten(a.tekst, b.tekst);
    check('B echte pdf (pdf.js): soort «pdf», 2 pagina\'s, kop/voet weg, alinea\'s goed; het verschil is alleen 850 → 875 (op beide pagina\'s)',
      a.soort === 'pdf' && a.paginas === 2 && !a.afgekapt && !a.tekst.includes('Pagina') && !a.tekst.includes('Huurovereenkomst')
      && a.tekst.startsWith('Artikel 1 - Huurprijs\n\nDe huurder betaalt elke maand een huur van 850 euro op de rekening van de verhuurder, uiterlijk op de vijfde dag van de maand.')
      && ab.telling.gewijzigd === 2 && ab.telling.weg === 0 && ab.telling.nieuw === 0
      && ab.rijen.filter((r) => r.soort === 'gewijzigd').every((r) => JSON.stringify(r.woorden?.filter((w) => w.soort !== 'gelijk')) === JSON.stringify([{ soort: 'weg', tekst: '850' }, { soort: 'nieuw', tekst: '875' }])),
      JSON.stringify({ a: a.tekst.slice(0, 200), telling: ab.telling }));
    const kapot = await bijlageTekst(new Blob([new TextEncoder().encode('%PDF-1.7 geen echte pdf')]), 'application/pdf', 'kapot.pdf').then(() => 'gelezen', (e: Error) => e.message);
    check('B kapotte pdf: een fout (PDF_…), nooit een lege «gelijke» tekst', /^PDF_(ONGELDIG|ONLEESBAAR)$/.test(kapot), kapot);
  } catch (e) {
    check('B echte pdf (pdf.js)', false, String((e as Error)?.stack || e));
  }

  // ------------------------------------------------------------------ C. structuur
  const { VersieVergelijkLaag, VerschilWeergave, samenvatting, standaardKeuze, versieLabel, versiesVan } = await import('../../src/mail/VersieVergelijk');
  const groep = bijlageVersies(GESPREK).groepen[0];
  const versies = versiesVan(groep);
  check('C versies: één keuze per versie (doorgestuurde v2 telt één keer), oudste eerst; standaard vorige ↔ laatste (v2 ↔ v3)',
    groep.items.length === 4 && versies.map((v) => v.nummer).join(',') === '1,2,3' && versies[1].berichtId === 'm2' && JSON.stringify(standaardKeuze(versies)) === JSON.stringify({ oud: 2, nieuw: 3 }));
  check('C label «v2 · 23 жовт., 12:00 · Pavlo» (versie · datum · naam)', /^v2 · \d{1,2} жовт\.?, \d{2}:\d{2} · Pavlo$/.test(versieLabel(versies[1], 'uk')) && /^v3 · \d{1,2} okt\.?,? \d{2}:\d{2} · Lotte Vermeulen$/.test(versieLabel(versies[2], 'nl')), `${versieLabel(versies[1], 'uk')} | ${versieLabel(versies[2], 'nl')}`);
  const noop = () => undefined;
  const pdfTekst = (tekst: string) => ({ tekst, soort: 'pdf' as const, paginas: 1, afgekapt: false });
  const laag = (stand: Parameters<typeof VersieVergelijkLaag>[0]['stand'], lang: 'uk' | 'nl' = 'uk') => renderToStaticMarkup(createElement(VersieVergelijkLaag, { lang, titel: 'Huurcontract · PDF', versies, oudNummer: 2, nieuwNummer: 3, stand, onKies: noop, onSluit: noop, onOpnieuw: noop }));
  const klaar = vergelijkTeksten(HUUR_V2, `${HUUR_V3}\n\nArtikel 4 – Huisdieren\n\nHuisdieren zijn toegestaan na schriftelijk akkoord.`);
  const html = laag({ soort: 'klaar', uitkomst: klaar, oud: pdfTekst(HUUR_V2), nieuw: pdfTekst(HUUR_V3) });
  const kop = /aria-labelledby="([^"]+)"/.exec(html)?.[1] || '-', beschr = /aria-describedby="([^"]+)"/.exec(html)?.[1] || '-';
  check('C modaal venster: data-versie-vergelijk op de laag, role=dialog + aria-modal, labelledby → kop «Порівняння версій», describedby → de eerlijke noot, focusbaar (tabindex -1)',
    /^<div class="vv-laag" data-versie-vergelijk="">/.test(html) && /role="dialog" aria-modal="true" aria-labelledby="[^"]+" aria-describedby="[^"]+" tabindex="-1"/.test(html)
    && html.includes(`<h2 id="${kop}">Порівняння версій</h2>`) && html.includes(`<p id="${beschr}">`) && new RegExp(`<p id="${beschr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"><svg[\\s\\S]*?</svg>Порівнюється лише текст: форматування, підписи, печатки й зображення не порівнюються\\.</p>`).test(html)
    && html.includes('aria-label="Закрити порівняння"'), (/<div class="vv-venster"[^>]*>/.exec(html) || [''])[0]);
  const selects = html.match(/<select>[\s\S]*?<\/select>/g) || [];
  check('C keuze: «Старіша версія» / «Новіша версія», v1–v3 in elk, v2 en v3 gekozen',
    html.includes('<span>Старіша версія</span>') && html.includes('<span>Новіша версія</span>') && selects.length === 2 && selects.every((s) => (s.match(/<option /g) || []).length === 3)
    && /<option value="2" selected="">v2 · /.test(selects[0]) && /<option value="3" selected="">v3 · /.test(selects[1]));
  check('C samenvatting en legenda: «Змінено 1 абзац · додано 2 · прибрано 0», legenda прибрано/додано/змінений абзац',
    html.includes('<p class="vv-samenvatting" role="status">Змінено 1 абзац · додано 2 · прибрано 0</p>') && html.includes('<span class="vv-weg">прибрано</span>') && html.includes('<span class="vv-nieuw">додано</span>') && html.includes('змінений абзац'));
  check('C rij «gewijzigd»: oud met <del>850</del>, nieuw met <ins>875</ins> (en een woord voor de schermlezer), beide kanten met hun versielabel',
    /<li class="vv-rij" data-soort="gewijzigd"><span class="vv-sr">Змінений абзац<\/span><div class="vv-kant" data-kant="oud"><span class="vv-kant-label">v2 · [^<]+<\/span><p class="vv-tekst">De huurder betaalt elke maand een huur van <span class="vv-sr">прибрано: <\/span><del>850<\/del> euro op/.test(html)
    && /<div class="vv-kant" data-kant="nieuw"><span class="vv-kant-label">v3 · [^<]+<\/span><p class="vv-tekst">De huurder betaalt elke maand een huur van <span class="vv-sr">додано: <\/span><ins>875<\/ins> euro op/.test(html)
    && (html.match(/<del>/g) || []).length === 1 && (html.match(/<ins>/g) || []).length === 3);
  check('C ongewijzigde alinea\'s ingeklapt: «3 незмінні абзаци — показати» en «2 незмінні абзаци — показати» (aria-expanded=false), hun tekst staat er niet; «Показати незмінні»',
    html.includes('<button type="button" aria-expanded="false">3 незмінні абзаци — показати</button>') && html.includes('<button type="button" aria-expanded="false">2 незмінні абзаци — показати</button>')
    && !html.includes('data-soort="gelijk"') && !html.includes('Voorbeeldstraat 12') && html.includes('aria-pressed="false">Показати незмінні</button>'));
  check('C toegevoegde alinea: aan de oude kant «— немає в цій версії» (verborgen voor de schermlezer), nieuw met <ins>; noot over pdf (kop/voet, typografie)',
    /<li class="vv-rij" data-soort="nieuw"><span class="vv-sr">Доданий абзац<\/span><div class="vv-kant" data-kant="oud" data-leeg="ja">[\s\S]*?<p class="vv-leeg" aria-hidden="true">— немає в цій версії<\/p>/.test(html)
    && html.includes('<ins>Huisdieren zijn toegestaan na schriftelijk akkoord.</ins>') && html.includes('У PDF пропущено колонтитули й номери сторінок.'));
  const nl = laag({ soort: 'klaar', uitkomst: klaar, oud: pdfTekst(HUUR_V2), nieuw: pdfTekst(HUUR_V3) }, 'nl');
  check('C Nederlands: «Versies vergelijken», «1 alinea gewijzigd · 2 toegevoegd · 0 verwijderd», «3 ongewijzigde alinea\'s — tonen», noot «Alleen de tekst wordt vergeleken»',
    nl.includes('Versies vergelijken') && nl.includes('1 alinea gewijzigd · 2 toegevoegd · 0 verwijderd') && nl.includes('3 ongewijzigde alinea&#x27;s — tonen') && nl.includes('Alleen de tekst wordt vergeleken: opmaak, handtekeningen, stempels en afbeeldingen niet.')
    && nl.includes('<span>Oudere versie</span>') && nl.includes('<span class="vv-sr">verwijderd: </span><del>850</del>'));
  const ukMv = (g: number) => samenvatting(Array.from({ length: g }, () => ({ soort: 'gewijzigd' as const })), 'uk');
  check('C українські відмінки: 1 абзац, 2 абзаци, 5 абзаців, 11 абзаців, 21 абзац', ukMv(1).startsWith('Змінено 1 абзац ·') && ukMv(2).startsWith('Змінено 2 абзаци ·') && ukMv(5).startsWith('Змінено 5 абзаців ·') && ukMv(11).startsWith('Змінено 11 абзаців ·') && ukMv(21).startsWith('Змінено 21 абзац ·'));
  const verpl = renderToStaticMarkup(createElement(VerschilWeergave, { lang: 'uk', rijen: om.rijen, oudLabel: 'v1', nieuwLabel: 'v2' }));
  check('C verplaatste alinea\'s: zichtbaar merk «Абзац перенесено нижче» / «Перенесений абзац (був вище)», niet doorgestreept, samenvatting «перенесено 2» (niet «прибрано»)',
    verpl.includes('<span class="vv-merk">Абзац перенесено нижче</span>') && verpl.includes('<span class="vv-merk">Перенесений абзац (був вище)</span>') && !verpl.includes('<del>') && !verpl.includes('<ins>')
    && verpl.includes('Змінено 0 абзаців · додано 0 · прибрано 0 · перенесено 2') && verpl.includes('data-verplaatst="ja"'), (/vv-samenvatting[^<]*<[^]*?<\/p>/.exec(verpl) || [''])[0]);

  const gelijkHtml = laag({ soort: 'klaar', uitkomst: gelijk, oud: pdfTekst(HUUR_V2), nieuw: pdfTekst(HUUR_V2) });
  const gelijkNl = laag({ soort: 'klaar', uitkomst: gelijk, oud: pdfTekst(HUUR_V2), nieuw: pdfTekst(HUUR_V2) }, 'nl');
  const gelijkKap = laag({ soort: 'klaar', uitkomst: { ...gelijk, afgekapt: true }, oud: pdfTekst(HUUR_V2), nieuw: { ...pdfTekst(HUUR_V2), paginas: 85, afgekapt: true } });
  check('C gelijke tekst: «Текст версій однаковий.» zonder rijen; afgekapt: alleen «у порівняній частині» + hoeveel pagina\'s gelezen',
    gelijkHtml.includes('Текст версій однаковий.') && !gelijkHtml.includes('vv-rij') && gelijkNl.includes('De tekst van beide versies is gelijk.')
    && !gelijkKap.includes('Текст версій однаковий.') && gelijkKap.includes('У порівняній частині текст однаковий') && gelijkKap.includes(`Версія v3: прочитано перші ${PDF_MAX_PAGINAS} з 85 сторінок.`));
  const laden = laag({ soort: 'laden' }), zelfde = laag({ soort: 'zelfde' });
  const fout = laag({ soort: 'fout', welke: 3, code: 'NETWERK' }), groot32 = laag({ soort: 'fout', welke: 2, code: 'MAIL_ATTACHMENT_PREVIEW_TOO_LARGE' }), wachtwoord = laag({ soort: 'fout', welke: 3, code: 'PDF_WACHTWOORD' });
  check('C laden (role=status) en twee keer dezelfde versie: eigen melding, geen rijen',
    /<p class="vv-laden" role="status">[\s\S]*Завантажуємо й читаємо обидві версії…<\/p>/.test(laden) && zelfde.includes('Виберіть дві різні версії.') && ![laden, zelfde].some((h) => h.includes('vv-rij') || h.includes('vv-samenvatting')));
  check('C fouten (role=alert): opnieuw proberen bij een gewone fout; te groot (32 МБ) en wachtwoord: uitleg + sluiten, geen «opnieuw»',
    /role="alert"[\s\S]*Не вдалося завантажити або прочитати версію v3\.[\s\S]*Спробувати ще раз/.test(fout) && groot32.includes('Версія v2 завелика для порівняння тут (понад 32 МБ). Відкрийте обидві версії.') && !groot32.includes('Спробувати ще раз')
    && wachtwoord.includes('PDF версії v3 захищено паролем') && wachtwoord.includes('>Закрити</button>') && ![fout, groot32, wachtwoord].some((h) => h.includes('vv-rij')));
  const onleesbaar = laag({ soort: 'onleesbaar', welke: [2, 3] }), onleesbaarNl = laag({ soort: 'onleesbaar', welke: [3] }, 'nl');
  check('C onleesbaar formaat: «Цей формат не вдається прочитати як текст — порівняння недоступне. Відкрийте обидві версії.» + «Закрити», geen verzonnen uitkomst',
    onleesbaar.includes('Цей формат не вдається прочитати як текст — порівняння недоступне. Відкрийте обидві версії.') && onleesbaar.includes('<button type="button" class="vv-knop">Закрити</button>')
    && onleesbaarNl.includes('Dit formaat kan niet als tekst worden gelezen — vergelijken is niet mogelijk. Open beide versies.') && !onleesbaar.includes('vv-samenvatting') && !onleesbaar.includes('однаковий'));
  const scan = laag({ soort: 'leeg', welke: [3], oud: pdfTekst(HUUR_V2), nieuw: pdfTekst('') });
  check('C scan zonder tekst: «немає тексту, який можна прочитати (можливо, це скан…)» — nooit «однаковий»', scan.includes('У версії v3 немає тексту, який можна прочитати (можливо, це скан або порожній файл)') && !scan.includes('однаковий') && !scan.includes('vv-rij'));
  const lange = renderToStaticMarkup(createElement(VerschilWeergave, { lang: 'uk', rijen: anders.rijen, oudLabel: 'v1', nieuwLabel: 'v2' }));
  check('C 3000 gewijzigde rijen: eerst 150 op het scherm, dan «Показати ще»', (lange.match(/<li class="vv-rij"/g) || []).length === 150 && lange.includes('>Показати ще</button>'));

  // ------------------------------------------------------------------ D. bron en CSS
  const vv = lees('src/mail/VersieVergelijk.tsx'), bt = lees('src/mail/bijlage-tekst.ts'), pv = lees('src/MailPdfVoorbeeld.tsx'), css = zc(lees('src/mail/versie-vergelijk.css'));
  check('D Escape: capture op window, preventDefault + stopPropagation (de lezer en het contextblad erachter sluiten niet mee), niet als de focus in een laag erboven staat',
    vv.includes("window.addEventListener('keydown', opToets, true)") && vv.includes("window.removeEventListener('keydown', opToets, true)") && /e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*sluitRef\.current\(\);/.test(vv)
    && vv.includes('if (!laag || (actief && actief !== document.body && !laag.contains(actief))) return;'));
  check('D focus: naar het venster bij openen, terug naar de opener bij sluiten (focusTerug), Tab binnen het venster (houdTab), portal naar <body>, React-gebeurtenissen gestopt',
    vv.includes('vensterRef.current?.focus({ preventScroll: true })') && vv.includes('focusTerug(vorige)') && vv.includes('houdTab(e, focusbaar(v), { houder: v })') && vv.includes('createPortal(') && vv.includes('document.body,')
    && vv.includes('onClick={stop} onPointerDown={stop} onTouchStart={stop} onKeyDown={stop} onKeyUp={stop}'));
  check('D bijlagen lezen via loadMailAttachmentBlob (met maxBytes), onbekend formaat zonder downloaden; tekst één keer per bijlage onthouden',
    vv.includes('loadMailAttachmentBlob({ context: bron.context, accountId: bron.accountId, cacheAccountId: bron.cacheAccountId, messageId: it.berichtId, item: it.bijlage, maxBytes: VERGELIJK_MAX_BYTES })')
    && vv.indexOf("=== 'onbekend') return") < vv.indexOf('loadMailAttachmentBlob({') && vv.includes('TEKSTEN.set(sleutel, taak)'));
  const werker = "new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url)";
  check('D pdf zoals MailPdfVoorbeeld: dezelfde worker-URL, pdfjs-dist pas bij nood geladen, zonder eval, hoogstens 60 pagina\'s; docx via de bestaande documentlader',
    pv.includes(`GlobalWorkerOptions.workerSrc=${werker}.toString()`) && bt.replace(/\s+/g, '').includes(werker.replace(/\s+/g, '')) && bt.includes("await import('pdfjs-dist')") && bt.includes('isEvalSupported: false')
    && PDF_MAX_PAGINAS === 60 && bt.includes("await import('../mail-document-inhoud')") && bt.includes('loadMailDocumentContent(blob, mogelijkheid)') && bt.includes('mailDocumentCapability(filename, contentType)'));
  check('D CSS: alleen tokens — geen hex-, rgb()- of hsl()-kleuren', !/#[0-9a-fA-F]{3,8}\b/.test(css) && !/\b(?:rgba?|hsla?)\(/.test(css) && css.includes('var(--fout-zacht)') && css.includes('var(--ok-zacht)') && css.includes('var(--overlay)') && css.includes('var(--schaduw-3)'));
  check('D CSS: kop zonder Georgia (font-family:inherit), smal venster (< 560 px) onder elkaar via containerquery, past op 360 px, 44 px bij aanraken, laag boven de lezer',
    css.includes('html body .vv-venster .vv-kop h2{margin:0;font-family:inherit;') && css.includes('container:vv/inline-size') && css.includes('@container vv (max-width:559px)') && css.includes('.vv-rij{grid-template-columns:minmax(0,1fr);')
    && css.includes('width:min(1120px,100%);max-width:100%') && css.includes('@media (max-width:560px)') && /@media \(pointer:coarse\)\{[^}]*\.vv-sluit\{width:44px;height:44px/.test(css) && css.includes('min-height:44px') && css.includes('z-index:760'));
  check('D doorhalen en onderstrepen: ook zonder kleur te onderscheiden', /\.vv-tekst del,\.vv-weg\{[^}]*text-decoration:line-through/.test(css) && /\.vv-tekst ins,\.vv-nieuw\{[^}]*text-decoration:underline/.test(css));

  return einde();
}
