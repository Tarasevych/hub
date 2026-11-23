// Спільний перегляд вкладень, етап 1 (22.11.2026, migratie 0309, Grok: hub.tarasevych.com).
// Vlag bijlage-weergave-gedeeld-v1 standaard UIT; deze tests dekken de pure modules en de bedrading.
import { readFileSync, existsSync } from 'node:fs';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { checker } from './hulp/nep-google';
import { WEERGAVE_VLAG, formaatVan, grootteTekst, soortVan } from '../../src/bijlage-weergave/soort';
import { vertrouwenUit, werkelijkeSoort } from '../../src/bijlage-weergave/vertrouwen';
import { technischeRijen } from '../../src/bijlage-weergave/details';
import { actiesVoor, bewerkLabel } from '../../src/bijlage-weergave/acties';

const VERBODEN = /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/;
const DEELWOORD = /[а-яіїєґ]+(уч|юч|ач|яч)(ий|а|е|і|ого|ої|им|их|ому|ій|у)\b/iu;
const bytes = (...x: (number | string)[]) => Uint8Array.from(x.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])));
const PDF = bytes('%PDF-1.7\n'), PNG = bytes(0x89, 'PNG', 13, 10, 26, 10), JPG = bytes(0xff, 0xd8, 0xff, 0xe0), ZIP = bytes('PK', 3, 4, 20, 0), EXE = bytes('MZ', 0x90, 0);
const TXT = new TextEncoder().encode('Рядок 1: звичайний текст\nRegel 2\n');

export async function main(): Promise<number> {
  const { check, einde } = checker('bijlage-weergave-gedeeld');

  // soort
  check('vlagnaam', WEERGAVE_VLAG === 'bijlage-weergave-gedeeld-v1');
  check('formaat: extensie in hoofdletters, anders leeg', formaatVan('a.b/factuur.Pdf') === 'PDF' && formaatVan('zonder') === '' && formaatVan('.verborgen') === '' && formaatVan('raar.ex t') === '');
  check('rekening uit de naam (uk/nl/de/en)', ['Рахунок за жовтень.pdf', 'factuur-oktober.pdf', 'Rechnung 12.pdf', 'invoice.jpg'].every((n) => soortVan(n).sleutel === 'rekening'));
  check('contract uit de naam', soortVan('Договір оренди 2026.docx').sleutel === 'contract' && soortVan('overeenkomst.pdf').sleutel === 'contract');
  check('foto, tabel, archief, bericht, tekst, onbekend', soortVan('IMG_0042.heic').sleutel === 'foto' && soortVan('x.xlsx').sleutel === 'tabel' && soortVan('archief.zip').sleutel === 'archief' && soortVan('doorgestuurd bericht.eml').sleutel === 'bericht' && soortVan('нотатки.txt').sleutel === 'tekst' && soortVan('onbekend-formaat.xyz').sleutel === 'onbekend');
  check('soort uit content-type zonder extensie', soortVan('scan', 'image/jpeg').sleutel === 'foto' && soortVan('doc', 'application/pdf').sleutel === 'document');
  check('grootte zonder Engelse eenheden', grootteTekst(0) === '0 Б' && grootteTekst(1536) === '1,5 КБ' && grootteTekst(5 * 1024 * 1024) === '5,0 МБ' && grootteTekst(1536, 'nl') === '1,5 kB');

  // vertrouwen
  check('werkelijke soort uit de eerste bytes', werkelijkeSoort(PDF) === 'pdf' && werkelijkeSoort(PNG) === 'png' && werkelijkeSoort(JPG) === 'jpeg' && werkelijkeSoort(ZIP) === 'zip' && werkelijkeSoort(EXE) === 'programma' && werkelijkeSoort(TXT) === 'tekst' && werkelijkeSoort(bytes(0, 1, 2, 3, 0xfe)) === 'binair');
  const pdfGoed = vertrouwenUit({ naam: 'factuur.pdf', kop: PDF, inhoud: '%PDF-1.7 /Type /Page /Font' });
  check('pdf zonder verborgen acties: goed, één zin', pdfGoed.niveau === 'goed' && pdfGoed.zin[0] === 'Справжній тип збігається з назвою, без прихованих дій.' && pdfGoed.kort[0] === 'Перевірено');
  const pdfJs = vertrouwenUit({ naam: 'factuur.pdf', kop: PDF, inhoud: '%PDF-1.7 /OpenAction << /JavaScript (app.alert(1)) >>' });
  check('pdf met /OpenAction of /JavaScript: let op', pdfJs.niveau === 'let-op' && pdfJs.zin[0].startsWith('Увага: документ має приховані дії'));
  check('naam pdf maar binnenin zip: let op', vertrouwenUit({ naam: 'rekening.pdf', kop: ZIP }).niveau === 'let-op');
  check('naam pdf maar binnenin programma: let op met waarschuwing', vertrouwenUit({ naam: 'rekening.pdf', kop: EXE }).zin[0].includes('програма'));
  const docxMacro = vertrouwenUit({ naam: 'contract.docx', kop: ZIP, archiefNamen: ['word/document.xml', 'word/vbaProject.bin'] });
  check('docx met vbaProject.bin: macro’s, let op', docxMacro.niveau === 'let-op' && docxMacro.bevindingen.some((b) => b.sleutel === 'macro' && b.ernst === 'let-op'));
  const docxSchoon = vertrouwenUit({ naam: 'contract.docx', kop: ZIP, archiefNamen: ['word/document.xml'] });
  check('docx zonder macro’s: goed, «без макросів»', docxSchoon.niveau === 'goed' && docxSchoon.zin[0].includes('без макросів'));
  check('xlsm/docm: altijd mogelijk macro’s', vertrouwenUit({ naam: 'tabel.xlsm', kop: ZIP }).niveau === 'let-op');
  check('onbekende extensie: niet nagegaan (eerlijk), niet «goed»', vertrouwenUit({ naam: 'x.xyz', kop: bytes(1, 2, 3) }).niveau === 'onbekend');
  check('afzender eerlijk als niet nagegaan vermeld', pdfGoed.bevindingen.some((b) => b.sleutel === 'afzender' && b.ernst === 'info'));
  check('foto: jpg klopt, png als jpg niet', vertrouwenUit({ naam: 'f.jpg', kop: JPG }).niveau === 'goed' && vertrouwenUit({ naam: 'f.jpg', kop: PNG }).niveau === 'let-op');

  // details
  const rijen = technischeRijen({ taal: 'uk', naam: 'foto.jpg', contentType: 'image/jpeg; x=1', grootte: 225811, vertrouwen: vertrouwenUit({ naam: 'foto.jpg', kop: JPG }), breedte: 1600, hoogte: 1066 });
  check('details: Oekraïense labels, geen Format/Bytes/Width/Height', rijen.map((r) => r.label).join('|') === 'Назва|Формат за назвою|Розмір|Заявлений тип|Справжній тип за вмістом|Розміри зображення' && rijen[3].waarde === 'image/jpeg' && rijen[5].waarde === '1600 × 1066 пікс.');

  // acties
  const leeg = () => undefined;
  const a1 = actiesVoor('rekening', 'PDF', { download: leeg, bewerk: leeg, druk: leeg, minimaliseer: leeg });
  check('rekening: hoofdactie «Підписати або позначити», rest onder ⋯', a1.hoofd?.sleutel === 'bewerk' && a1.hoofd.label[0] === 'Підписати або позначити' && a1.overig.map((a) => a.sleutel).join(',') === 'download,druk,minimaliseer');
  const a2 = actiesVoor('rekening', 'PDF', { download: leeg, druk: leeg });
  check('alleen echte acties: zonder bewerken wordt downloaden de hoofdactie', a2.hoofd?.sleutel === 'download' && !a2.overig.some((a) => a.sleutel === 'bewerk'));
  check('foto: delen eerst', actiesVoor('foto', 'JPG', { download: leeg, delen: leeg }).hoofd?.sleutel === 'delen');
  check('«Згорнути» nooit hoofdactie', actiesVoor('onbekend', '', { minimaliseer: leeg }).hoofd === null);
  check('bewerklabels zonder Engelse woorden', ['rekening', 'tabel', 'foto', 'archief', 'onbekend'].every((s) => !/[A-Za-z]/.test(bewerkLabel(s as never, '')[0])));

  // bedrading en vlag
  const mig = readFileSync('migrations/0310_bijlage_weergave_gedeeld.sql', 'utf8');
  const oms = /VALUES \('bijlage-weergave-gedeeld-v1',\s*'([^']*)',\s*false, false\)\s*ON CONFLICT \(sleutel\) DO NOTHING;/.exec(mig);
  check('migratie 0310: uit, standaard uit, ON CONFLICT DO NOTHING, ≤ 300 tekens', Boolean(oms) && oms![1].length <= 300);
  const u = VLAG_UITLEG['bijlage-weergave-gedeeld-v1'];
  check('uitleg aanwezig', Boolean(u && u.naam && u.wat && u.wanneer && u.gevolg));
  const gmw = readFileSync('src/GoogleMailWerkruimte.tsx', 'utf8');
  check('werkruimte: vlag standaard uit', gmw.includes('useVlag(WEERGAVE_VLAG,false)'));
  check('werkruimte: oude kop blijft bij vlag uit', gmw.includes('{gedeeldeWeergave?<WeergaveKop ') && gmw.includes(':<BijlageV2Kop oud='));

  // taalwet
  const bestanden = ['soort.ts', 'vertrouwen.ts', 'details.ts', 'acties.ts', 'gedrag.ts', 'Weergave.tsx', 'weergave.css'].map((f) => `src/bijlage-weergave/${f}`).filter(existsSync);
  const alles = [mig, ...bestanden.map((f) => readFileSync(f, 'utf8')), ...(u ? [u.naam, u.wat, u.wanneer, u.gevolg].flat() : [])].join('\n');
  check('taalwet: geen verboden letters', !VERBODEN.test(alles));
  check('taalwet: geen deelwoorden op -учий/-ючий/-ачий/-ячий', !DEELWOORD.test(alles));
  return einde();
}
