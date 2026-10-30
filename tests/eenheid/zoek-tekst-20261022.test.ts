// Zoeken Z3 (22.10.2026): tekstextractie per formaat, OCR-plan en OCR-cache per gebruiker/ruimte, archieven veilig,
// werker-thread met tijdslimiet. Fixtures worden hier gemaakt (fflate, pdf-lib, eigen PNG-encoder); geen netwerk.
// OCR: als er op deze machine een engine is (systeem-tesseract of tesseract.js + taalbestand), draait een echte herkenning
// op een gegenereerde afbeelding met tekst (via pdftoppm, als dat er is); anders worden plan en eerlijke status getest.
import { build } from 'esbuild';
import { gzipSync, strToU8, zipSync } from 'fflate';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { archiefUitpakken, isPakketBestand } from '../../backend/zoek/archief';
import { inhoudNaarTekst } from '../../backend/zoek/inhoud';
import { programmaPad, procesUitvoeren, talenInMappen, talenKiezen, SYSTEEM_TESSDATA } from '../../backend/zoek/ocr-engines';
import { engineResetten, geheugenOcrCache, ocrBeschikbaarheid, ocrCacheInstellen, ocrPlan, ocrUitvoeren, pgOcrTekstCache, tekstUit, werkerPadResetten, werkerSluiten, FORMATEN } from '../../backend/zoek/tekst-extractie';
import pg from 'pg';
import { naarPng } from '../../backend/zoek/tekst-kern';
import { formaatVan, nietOndersteundReden } from '../../shared/zoek-formaten';
import { checker } from './hulp/nep-google';

// ---- fixtures ----
const docxBytes = () => zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Договір оренди</w:t></w:r><w:r><w:t xml:space="preserve"> nummer 77</w:t></w:r></w:p><w:p><w:r><w:t>Tweede alinea &amp; co</w:t></w:r></w:p></w:body></w:document>'),
});
const xlsxBytes = () => zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'),
  '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
  'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'),
  'xl/sharedStrings.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2"><si><t>Рахунок</t></si><si><t>Bedrag</t></si></sst>'),
  'xl/worksheets/sheet1.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>42</v></c><c r="B2" t="inlineStr"><is><t>inline tekst</t></is></c></row></sheetData></worksheet>'),
});
const pptxBytes = () => zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>'),
  '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'),
  'ppt/presentation.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>'),
  'ppt/_rels/presentation.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'),
  'ppt/slides/slide1.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Kwartaalcijfers Q3</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'),
});
async function tekstPdf(regels: string[], paginas = 1): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < paginas; i++) { const p = pdf.addPage([400, 220]); regels.forEach((r, j) => p.drawText(`${r}${paginas > 1 ? ` p${i + 1}` : ''}`, { x: 20, y: 160 - j * 40, size: 20, font })); }
  return pdf.save();
}
/** PNG met een zwart blok (geen leesbare tekst): genoeg voor scan-detectie. */
const blokPng = () => { const w = 60, h = 30, d = new Uint8Array(w * h * 3).fill(255); for (let y = 8; y < 22; y++) for (let x = 10; x < 50; x++) d.set([0, 0, 0], (y * w + x) * 3); return naarPng(w, h, 2, d); };
async function scanPdf(png: Uint8Array, extraTekstPagina = false): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); const img = await pdf.embedPng(png);
  const p = pdf.addPage([img.width, img.height]); p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  if (extraTekstPagina) { const font = await pdf.embedFont(StandardFonts.Helvetica); pdf.addPage([400, 200]).drawText('Tekstpagina twee', { x: 20, y: 100, size: 20, font }); }
  return pdf.save();
}
const emlBytes = (pdf: Uint8Array) => strToU8([
  'From: =?UTF-8?B?0J/QsNCy0LvQvg==?= <pavlo@example.test>', 'To: boekhouding@example.test', 'Subject: =?utf-8?Q?Factuur_oktober?=', 'Date: Wed, 22 Oct 2026 10:00:00 +0200',
  'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="GRENS1"', '', '--GRENS1', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '',
  'Hallo, in de bijlage de factuur. Vriendelijke groet =E2=80=94 Pavlo', '--GRENS1', 'Content-Type: application/pdf; name="factuur.pdf"', 'Content-Disposition: attachment; filename="factuur.pdf"', 'Content-Transfer-Encoding: base64', '',
  Buffer.from(pdf).toString('base64').replace(/(.{76})/g, '$1\n'), '--GRENS1', 'Content-Type: text/plain; name="notitie.txt"', 'Content-Disposition: attachment; filename="notitie.txt"', '', 'afspraak dinsdag 14:00', '--GRENS1--', '',
].join('\r\n'));
const zip64Bytes = () => { const z = zipSync({ 'a.txt': strToU8('a') }); let e = -1; for (let i = z.length - 22; i >= 0; i--) if (z[i] === 0x50 && z[i + 1] === 0x4b && z[i + 2] === 5 && z[i + 3] === 6) { e = i; break; } z[e + 10] = 0xff; z[e + 11] = 0xff; return z; };
const versleuteldZip = () => { const z = zipSync({ 'geheim.txt': strToU8('x') }); for (let i = 0; i + 4 <= z.length; i++) if (z[i] === 0x50 && z[i + 1] === 0x4b && (z[i + 2] === 3 || z[i + 2] === 1)) z[i + (z[i + 2] === 3 ? 6 : 8)] |= 1; return z; };

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-tekst');
  // Werker-bundel bouwen (in productie: dist-server/zoek-werker.mjs uit scripts/build-server.mjs).
  await mkdir('rapporten', { recursive: true });
  const werkerUit = resolve('rapporten', `zoek-werker-${process.pid}.mjs`);
  await build({ entryPoints: ['backend/zoek/tekst-werker.ts'], outfile: werkerUit, bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'warning', banner: { js: "import { createRequire as __mrCreateRequire } from 'node:module'; const require = __mrCreateRequire(import.meta.url);" } });
  process.env.ZOEK_WERKER_PAD = werkerUit; werkerPadResetten();
  const cache = geheugenOcrCache(); ocrCacheInstellen(cache);
  const A = { userId: '11111111-1111-4111-8111-111111111111', ruimte: 'prive' as const }, B = { userId: '22222222-2222-4222-8222-222222222222', ruimte: 'prive' as const }, A_TECH = { ...A, ruimte: 'technisch' as const };

  try {
    // ---- formaatherkenning ----
    check('formaat: bytes gaan vóór mime', formaatVan('text/plain', 'x.bin', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])) === 'pdf' && formaatVan('application/octet-stream', 'a.docx', zipSync({ 'x': strToU8('1') }).subarray(0, 64)) === 'docx');
    check('formaat: onbekend + reden', formaatVan('application/x-rar', 'a.rar', new Uint8Array([0x52, 0x61, 0x72, 0x21])) === 'onbekend' && !!nietOndersteundReden('a.rar')?.uk);
    check('formaat: lijst gedeclareerd met uk+nl', FORMATEN.length >= 15 && FORMATEN.every((f) => f.naam.uk && f.naam.nl && f.maxBytes > 0));
    check('archief: office-pakketten niet als genest archief', isPakketBestand('map/a.docx') && !isPakketBestand('a.zip'));

    // ---- platte formaten ----
    const txt = await tekstUit({ bytes: strToU8('Привіт, світ\nhallo wereld'), mime: 'text/plain', naam: 'a.txt' });
    check('txt: tekst via werker-thread', txt.status === 'ok' && txt.herkomst === 'tekst' && txt.tekst.includes('Привіт') && txt.werker === 'thread' && txt.sha256.length === 64, `${txt.status} ${txt.werker} ${txt.fout || ''}`);
    const utf16 = await tekstUit({ bytes: new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Ünïcode', 'utf16le')])), naam: 'b.txt' });
    check('txt: utf-16 met BOM', utf16.tekst === 'Ünïcode');
    const csv = await tekstUit({ bytes: strToU8('naam;bedrag\n"Jan";12,50\n'), mime: 'text/csv', naam: 'k.csv' });
    check('csv', csv.status === 'ok' && csv.herkomst === 'csv' && /naam bedrag/.test(csv.tekst) && /Jan/.test(csv.tekst));
    const json = await tekstUit({ bytes: strToU8(JSON.stringify({ titel: 'Rapport', items: [{ naam: 'Факультет' }], n: 3 })), naam: 'd.json' });
    check('json: sleutels + tekstwaarden', json.status === 'ok' && json.tekst.includes('Факультет') && json.tekst.includes('titel'));
    const html = await tekstUit({ bytes: strToU8('<html><head><title>Ti&amp;tel</title><style>p{}</style><script>evil()</script></head><body><p>Eerste</p><p>Tweede &eacute;</p></body></html>'), mime: 'text/html', naam: 'p.html' });
    check('html: zonder tags/script/style, entiteiten', html.herkomst === 'html' && /Ti&tel/.test(html.tekst) && /Eerste\nTweede é/.test(html.tekst) && !/evil|p\{\}/.test(html.tekst), JSON.stringify(html.tekst));
    const leeg = await tekstUit({ bytes: new Uint8Array(0), naam: 'leeg.txt' });
    check('leeg bestand', leeg.status === 'leeg');
    const rar = await tekstUit({ bytes: new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 7, 0]), mime: 'application/vnd.rar', naam: 'x.rar' });
    check('rar: eerlijk niet ondersteund', rar.status === 'niet_ondersteund' && !!rar.fout);
    const groot = await tekstUit({ bytes: new Uint8Array(5000), naam: 'g.txt', maxBytes: 4096 });
    check('te groot: maxBytes', groot.status === 'te_groot' && /MAX_BYTES_4096/.test(groot.fout || ''));
    async function* stroom() { yield strToU8('deel een '); yield strToU8('deel twee'); }
    const st = await tekstUit({ stream: stroom(), naam: 's.txt' });
    check('stream-invoer', st.status === 'ok' && st.tekst === 'deel een deel twee');

    // ---- office ----
    const docx = await tekstUit({ bytes: docxBytes(), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', naam: 'contract.docx' });
    check('docx', docx.status === 'ok' && docx.herkomst === 'docx' && /Договір оренди nummer 77/.test(docx.tekst) && /Tweede alinea & co/.test(docx.tekst), `${docx.status} ${docx.fout || ''} ${JSON.stringify(docx.tekst)}`);
    const xlsx = await tekstUit({ bytes: xlsxBytes(), mime: '', naam: 'budget.xlsx' });
    check('xlsx: werkbladen als pagina’s, gedeelde en inline tekst', !!(xlsx.status === 'ok' && xlsx.herkomst === 'xlsx' && /Рахунок\tBedrag/.test(xlsx.tekst) && /42\tinline tekst/.test(xlsx.tekst) && xlsx.paginas?.[0]?.tekst.startsWith('Budget'), JSON.stringify(xlsx.tekst)));
    const pptx = await tekstUit({ bytes: pptxBytes(), mime: 'application/octet-stream', naam: 'q3.pptx' });
    check('pptx', pptx.status === 'ok' && pptx.herkomst === 'pptx' && /Kwartaalcijfers Q3/.test(pptx.tekst), `${pptx.status} ${pptx.fout || ''}`);
    const kapotDocx = await tekstUit({ bytes: zipSync({ '[Content_Types].xml': strToU8('<x/>') }), naam: 'kapot.docx' });
    check('docx zonder document.xml: leeg, niet als archief uitgepakt', kapotDocx.herkomst !== 'archief' && (kapotDocx.status === 'leeg' || kapotDocx.status === 'fout'));

    // ---- pdf ----
    const pdfT = await tekstPdf(['Factuur 2026-0042 Mijn Ruimte', 'Betaal voor 30 november'], 3);
    const pdf = await tekstUit({ bytes: pdfT, mime: 'application/pdf', naam: 'f.pdf' });
    check('pdf: tekstlaag per pagina', pdf.status === 'ok' && pdf.herkomst === 'pdf_tekstlaag' && pdf.paginas?.length === 3 && /2026-0042/.test(pdf.paginas[1].tekst) && / p2/.test(pdf.paginas[1].tekst) && !pdf.ocrPlan, `${pdf.status} ${pdf.paginas?.length}`);
    const scanB = await scanPdf(blokPng());
    const scan = await tekstUit({ bytes: scanB, mime: 'application/pdf', naam: 'scan.pdf' });
    const besch = await ocrBeschikbaarheid();
    check('pdf-scan: geen tekstlaag + afbeelding → OCR-plan', !!scan.ocrPlan && scan.ocrPlan.nodig && scan.ocrPlan.reden === 'pdf_scan' && scan.ocrPlan.paginas[0] === 1 && (scan.status === (besch.beschikbaar ? 'ocr_nodig' : 'ocr_niet_beschikbaar')), `${scan.status} ${JSON.stringify(scan.ocrPlan)}`);
    const deels = await tekstUit({ bytes: await scanPdf(blokPng(), true), naam: 'deels.pdf' });
    check('pdf deels gescand: tekst van pagina 2 + plan voor pagina 1', deels.ocrPlan?.reden === 'pdf_deels_scan' && deels.ocrPlan.paginas.join() === '1' && /Tekstpagina twee/.test(deels.tekst) && deels.paginas?.length === 2);
    const leegPdf = await PDFDocument.create(); leegPdf.addPage(); const lp = await tekstUit({ bytes: await leegPdf.save(), naam: 'wit.pdf' });
    check('pdf zonder tekst en zonder afbeelding: leeg (geen OCR)', lp.status === 'leeg' && !lp.ocrPlan);
    const nooit = await tekstUit({ bytes: scanB, naam: 'scan.pdf', ocr: 'nooit' });
    check('ocr:nooit → leeg zonder plan-status', nooit.status === 'leeg' && !!nooit.ocrPlan);
    const img = await tekstUit({ bytes: blokPng(), mime: 'image/png', naam: 'foto.png' });
    check('afbeelding: OCR-plan', img.ocrPlan?.reden === 'afbeelding' && ['ocr_nodig', 'ocr_niet_beschikbaar'].includes(img.status));
    const plan = await ocrPlan({ bytes: pdfT, naam: 'f.pdf' });
    check('ocrPlan: tekst-pdf heeft niets nodig', plan.nodig === false && plan.totaalPaginas === 3 && typeof plan.beschikbaar === 'boolean');

    // ---- eml ----
    const eml = await tekstUit({ bytes: emlBytes(pdfT), mime: 'message/rfc822', naam: 'bericht.eml' });
    check('eml: koppen gedecodeerd (RFC 2047) + tekst', eml.status === 'ok' && eml.herkomst === 'eml' && /From: Власник/.test(eml.tekst) && /Subject: Factuur oktober/.test(eml.tekst) && /groet — Pavlo/.test(eml.tekst), JSON.stringify(eml.tekst.slice(0, 200)));
    check('eml: bijlagen als onderdelen met pad', eml.onderdelen?.length === 2 && eml.onderdelen.some((d) => d.pad === 'bericht.eml/factuur.pdf' && /2026-0042/.test(d.tekst)) && eml.onderdelen.some((d) => d.pad === 'bericht.eml/notitie.txt' && /dinsdag/.test(d.tekst)), JSON.stringify(eml.onderdelen?.map((d) => [d.pad, d.status])));

    // ---- archieven ----
    const binnen = zipSync({ 'diep/notitie.txt': strToU8('geheime afspraak'), 'c.docx': docxBytes() });
    const bundel = zipSync({ 'f.pdf': pdfT, 'lijst.csv': strToU8('a;b\n1;2'), 'binnen.zip': binnen, '../ontsnapt.txt': strToU8('kwaad'), 'scan.png': blokPng() });
    const z = await tekstUit({ bytes: bundel, mime: 'application/zip', naam: 'bundel.zip' });
    check('zip: onderdelen met pad (ook genest) en formaat', !!(z.status === 'ok' && z.herkomst === 'archief' && z.onderdelen?.some((d) => d.pad === 'bundel.zip/f.pdf' && /2026-0042/.test(d.tekst)) && z.onderdelen.some((d) => d.pad === 'bundel.zip/binnen.zip/diep/notitie.txt' && d.tekst === 'geheime afspraak') && z.onderdelen.some((d) => d.pad === 'bundel.zip/binnen.zip/c.docx' && /nummer 77/.test(d.tekst)), JSON.stringify(z.onderdelen?.map((d) => [d.pad, d.status]))));
    check('zip: zip-slip gemeld, niet opgenomen; scan in zip krijgt OCR-plan', !!(z.problemen?.some((p) => p.code === 'ONVEILIG_PAD') && !z.onderdelen?.some((d) => d.pad.includes('..')) && z.onderdelen?.some((d) => d.pad === 'bundel.zip/scan.png' && d.ocrPlan?.nodig)));
    check('zip: samenvattende tekst bevat paden', /f\.pdf/.test(z.tekst) && /binnen\.zip\/diep\/notitie\.txt/.test(z.tekst));
    const bom = zipSync({ 'nul.bin': new Uint8Array(30 * 1024 * 1024) }, { level: 9 });
    const zb = await tekstUit({ bytes: bom, naam: 'bom.zip', archief: { maxVerhouding: 100 } });
    check('zip-bom: te_groot + ZIP_BOM, niets uitgepakt', !!(zb.status === 'te_groot' && zb.problemen?.some((p) => p.code === 'ZIP_BOM') && !zb.onderdelen?.length), `${zb.status} ${zb.fout}`);
    const zt = await tekstUit({ bytes: bom, naam: 'bom.zip', archief: { maxVerhouding: 1e9, maxBestandBytes: 1e9, maxTotaalBytes: 2 * 1024 * 1024 } });
    check('zip: totaalgrens → te_groot', zt.status === 'te_groot' && zt.fout === 'TE_GROOT_TOTAAL');
    const n1 = zipSync({ 'diep.txt': strToU8('diep') }), n2 = zipSync({ 'n1.zip': n1 }), n3 = zipSync({ 'n2.zip': n2 }), n4 = zipSync({ 'n3.zip': n3 });
    const zd = await tekstUit({ bytes: n4, naam: 'n4.zip', archief: { maxDiepte: 3 } });
    check('zip: te diep → TE_DIEP gemeld, geen onderdelen', !!(zd.problemen?.some((p) => p.code === 'TE_DIEP') && !zd.onderdelen?.length && zd.status === 'leeg'));
    const z64 = await tekstUit({ bytes: zip64Bytes(), naam: 'groot.zip' });
    check('zip64: eerlijk niet ondersteund', z64.status === 'niet_ondersteund' && z64.fout === 'ZIP64', `${z64.status} ${z64.fout}`);
    const zv = await tekstUit({ bytes: versleuteldZip(), naam: 'pw.zip' });
    check('versleutelde zip: niet ondersteund/VERSLEUTELD', !!(zv.status === 'niet_ondersteund' && zv.problemen?.some((p) => p.code === 'VERSLEUTELD')), `${zv.status} ${JSON.stringify(zv.problemen)}`);
    const veel: Record<string, Uint8Array> = {}; for (let i = 0; i < 30; i++) veel[`f${i}.txt`] = strToU8(`x${i}`);
    const zveel = await tekstUit({ bytes: zipSync(veel), naam: 'veel.zip', archief: { maxBestanden: 10 } });
    check('zip: te veel bestanden → te_groot', zveel.status === 'te_groot' && zveel.fout === 'TE_VEEL_BESTANDEN');
    const tgz = await tekstUit({ bytes: gzipSync(strToU8('los gzip-bestand met tekst')), naam: 'notitie.txt.gz' });
    check('gzip van één bestand', tgz.herkomst === 'archief' && tgz.onderdelen?.[0]?.tekst === 'los gzip-bestand met tekst', JSON.stringify(tgz.onderdelen));
    const kapot = await tekstUit({ bytes: new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8]), naam: 'kapot.zip' });
    check('kapot archief: geen crash, eerlijke status', ['fout', 'leeg', 'niet_ondersteund'].includes(kapot.status));
    const oudPad = archiefUitpakken(zipSync({ 'a/b.docx': docxBytes() }), 'o.zip');
    check('archief.ts: docx in zip blijft één bestand', oudPad.bestanden.length === 1 && oudPad.bestanden[0].pad === 'o.zip/a/b.docx');

    // ---- compatibiliteitslaag inhoudNaarTekst ----
    const inh = await inhoudNaarTekst(bundel, 'application/zip', 'bundel.zip', null);
    check('inhoudNaarTekst: zelfde vorm als vroeger (delen per onderdeel, problemen)', inh.archief && inh.delen.length >= 4 && inh.problemen.some((p) => p.code === 'ONVEILIG_PAD') && inh.delen.some((d) => d.pad === 'bundel.zip/f.pdf'));

    // ---- werker: tijdslimiet en herstel ----
    process.env.ZOEK_TEKST_TIMEOUT_MS = '1000';
    const t0 = Date.now(); const traag = await tekstUit({ bytes: strToU8('hangt'), naam: 'hangt.txt', testVertragingMs: 20_000 }); const d1 = Date.now() - t0;
    delete process.env.ZOEK_TEKST_TIMEOUT_MS;
    const okNa = await tekstUit({ bytes: strToU8('weer goed'), naam: 'na.txt' });
    check('werker: tijdslimiet → fout TIJDSLIMIET, thread beëindigd, volgende taak werkt', traag.status === 'fout' && traag.fout === 'TIJDSLIMIET' && d1 < 5000 && okNa.status === 'ok' && okNa.werker === 'thread', `${traag.status} ${traag.fout} ${d1}ms`);
    check('werker: geheugenlimiet geconfigureerd (ZOEK_TEKST_WERKER_MB)', (await import('../../backend/zoek/tekst-extractie')).instellingen().werkerMb >= 64);

    // ---- OCR: engines en talen ----
    const mappen = talenInMappen([process.env.ZOEK_OCR_TALEN_MAP || '/srv/mijn-ruimte/ocr/tessdata', ...SYSTEEM_TESSDATA]);
    const keuze = talenKiezen(['ukr', 'nld', 'eng'], [{ map: '/x', talen: ['eng'] }, { map: '/y', talen: ['ukr', 'eng'] }]);
    check('talen: map met de meeste gewenste talen; ontbrekende gemeld', keuze.map === '/y' && keuze.talen.join() === 'ukr,eng' && keuze.ontbrekend.join() === 'nld');
    const cli = programmaPad('tesseract'), poppler = programmaPad('pdftoppm');
    console.log(`     omgeving: tesseract=${cli || '-'} pdftoppm=${poppler || '-'} talen=${JSON.stringify(mappen)}`);

    // Engine uit → eerlijk niet beschikbaar, met wat de eigenaar moet doen
    process.env.ZOEK_OCR_ENGINE = 'uit'; await engineResetten();
    const uit = await tekstUit({ bytes: blokPng(), naam: 'foto.png' });
    const uitB = await ocrBeschikbaarheid();
    check('OCR uit: status ocr_niet_beschikbaar + reden uk/nl', uit.status === 'ocr_niet_beschikbaar' && !uitB.beschikbaar && !!uitB.ontbrekend?.uk && !!uitB.ontbrekend?.nl && uit.ocrPlan?.beschikbaar === false);
    const uitR = await ocrUitvoeren({ bytes: blokPng(), naam: 'foto.png', sleutel: A });
    check('OCR uit: ocrUitvoeren doet niets, cachet niets', uitR.status === 'ocr_niet_beschikbaar' && cache.aantal() === 0);
    // Taalbestanden ontbreken → eerlijke melding
    process.env.ZOEK_OCR_ENGINE = 'auto'; process.env.ZOEK_OCR_TALEN = 'xyz'; process.env.ZOEK_OCR_TALEN_MAP = '/nergens/tessdata'; await engineResetten();
    const geenTaal = await ocrBeschikbaarheid();
    check('OCR: zonder taalbestanden → niet beschikbaar, melding noemt ocr-talen', !geenTaal.beschikbaar && /ocr-talen|tesseract/.test(geenTaal.ontbrekend?.nl || ''), JSON.stringify(geenTaal.ontbrekend));
    delete process.env.ZOEK_OCR_TALEN; delete process.env.ZOEK_OCR_TALEN_MAP; await engineResetten();

    // Echte OCR op een gegenereerde afbeelding met tekst — alleen als deze machine een engine, een taal en pdftoppm heeft.
    const engTalen = mappen.filter((m) => m.talen.includes('eng'));
    let tekstPng: Uint8Array | null = null;
    if (poppler) { try { tekstPng = await procesUitvoeren(poppler, ['-r', '150', '-png', '-f', '1', '-l', '1', '-'], await tekstPdf(['Factuur 2026-0042 Mijn Ruimte', 'Betaal voor 30 november']), 20_000); } catch { tekstPng = null; } }
    const engines: Array<'tesseract-cli' | 'tesseract-js'> = []; if (cli) engines.push('tesseract-cli'); let tjs = false; try { await import('tesseract.js' as string); tjs = true; } catch { tjs = false; } if (tjs) engines.push('tesseract-js');
    if (!tekstPng || !engTalen.length || !engines.length) {
      console.log(`     OCR-echte run overgeslagen: pdftoppm=${!!poppler} png=${!!tekstPng} eng-taal=${engTalen.length > 0} engines=${engines.join(',') || '-'}`);
      check('OCR: geen engine op deze machine → plan eerlijk (beschikbaar=false)', !(await ocrBeschikbaarheid()).beschikbaar || engines.length > 0);
    } else {
      for (const eng of engines) {
        process.env.ZOEK_OCR_ENGINE = eng; process.env.ZOEK_OCR_TALEN = 'eng'; process.env.ZOEK_OCR_TALEN_MAP = engTalen[0].map; await engineResetten();
        const b = await ocrBeschikbaarheid();
        check(`${eng}: beschikbaar met eng`, b.beschikbaar && b.engine === eng && b.talen.join() === 'eng', JSON.stringify(b));
        const voor = cache.aantal(); const t1 = Date.now();
        const r1 = await ocrUitvoeren({ bytes: tekstPng, mime: 'image/png', naam: 'factuur.png', sleutel: A });
        const d = Date.now() - t1;
        check(`${eng}: afbeelding herkend (echte run, ${d} ms)`, r1.status === 'ok' && r1.herkomst === 'ocr' && /Factuur/.test(r1.tekst) && /2026/.test(r1.tekst) && r1.paginas?.[0]?.ocr === true, `${r1.status} ${r1.fout || ''} ${JSON.stringify(r1.tekst.slice(0, 80))}`);
        check(`${eng}: resultaat in de cache onder (gebruiker, ruimte)`, cache.aantal() === voor + 1);
        const r2 = await ocrUitvoeren({ bytes: tekstPng, mime: 'image/png', naam: 'kopie.png', sleutel: A });
        check(`${eng}: tweede keer uit de cache, zonder engine`, r2.herkomst === 'ocr_cache' && r2.tekst === r1.tekst && r2.duurMs < Math.max(50, d / 2) + 300, `${r2.herkomst} ${r2.duurMs}ms`);
        const rb = await ocrUitvoeren({ bytes: tekstPng, mime: 'image/png', naam: 'factuur.png', sleutel: B });
        check(`${eng}: andere gebruiker → eigen herkenning, geen gedeelde cache`, rb.herkomst === 'ocr' && cache.aantal() === voor + 2);
        const rt = await ocrUitvoeren({ bytes: tekstPng, mime: 'image/png', naam: 'factuur.png', sleutel: A_TECH });
        check(`${eng}: andere ruimte van dezelfde gebruiker → eigen rij`, rt.herkomst === 'ocr' && cache.aantal() === voor + 3);
        check(`${eng}: cache van B onzichtbaar voor A (lees)`, (await cache.lees(A, r1.sha256, eng, 'eng', [1])).size === 1 && (await cache.lees({ userId: B.userId, ruimte: 'technisch' }, r1.sha256, eng, 'eng', [1])).size === 0);
        // PDF-scan van dezelfde afbeelding: pagina → PNG (poppler of pdfjs) → OCR; paginanummer bewaard
        const sp = await ocrUitvoeren({ bytes: await scanPdf(tekstPng, true), mime: 'application/pdf', naam: 'scan.pdf', sleutel: A });
        check(`${eng}: pdf-scan pagina 1 via OCR + pagina 2 tekstlaag, in volgorde`, sp.status === 'ok' && /Factuur/.test(sp.paginas?.[0]?.tekst || '') && sp.paginas?.[0]?.ocr === true && /Tekstpagina twee/.test(sp.paginas?.[1]?.tekst || '') && !sp.paginas?.[1]?.ocr && sp.ocrPlan?.nodig === false, `${sp.status} ${sp.fout || ''} ${JSON.stringify(sp.paginas?.map((p) => [p.nr, p.ocr, p.tekst.slice(0, 20)]))}`);
        // Zonder poppler: ingesloten afbeelding uit de PDF (pdfjs → eigen PNG-encoder)
        process.env.ZOEK_OCR_PDFTOPPM_PAD = '/nergens/pdftoppm'; await engineResetten();
        const sp2 = await ocrUitvoeren({ bytes: await scanPdf(tekstPng), mime: 'application/pdf', naam: 'scan2.pdf', sleutel: B });
        check(`${eng}: pdf-scan zonder poppler via pdfjs-afbeelding`, sp2.status === 'ok' && /Factuur/.test(sp2.tekst) && (await ocrBeschikbaarheid()).pdfRaster === 'pdfjs-afbeelding', `${sp2.status} ${sp2.fout || ''} ${JSON.stringify(sp2.tekst.slice(0, 60))}`);
        delete process.env.ZOEK_OCR_PDFTOPPM_PAD;
        // Bijlage in een zip via pad
        const za = await ocrUitvoeren({ bytes: zipSync({ 'map/factuur.png': tekstPng }), naam: 'b.zip', pad: 'b.zip/map/factuur.png', sleutel: A });
        check(`${eng}: OCR van een bijlage in een archief via pad`, za.status === 'ok' && /Factuur/.test(za.tekst), `${za.status} ${za.fout || ''}`);
        // Direct (alleen in de wachtrij-werker van Z2)
        const direct = await tekstUit({ bytes: tekstPng, naam: 'f.png', ocr: 'direct', sleutel: A });
        check(`${eng}: tekstUit ocr:'direct' → tekst uit cache`, direct.status === 'ok' && direct.herkomst === 'ocr_cache');
        // Tijdslimiet per pagina → geen cache-rij, status fout
        process.env.ZOEK_OCR_PAGINA_TIMEOUT_MS = '1000'; await engineResetten(); const voorT = cache.aantal();
        const tl = await ocrUitvoeren({ bytes: tekstPng, mime: 'image/png', naam: 'ander.png', sleutel: { userId: '33333333-3333-4333-8333-333333333333', ruimte: 'prive' } });
        delete process.env.ZOEK_OCR_PAGINA_TIMEOUT_MS; await engineResetten();
        check(`${eng}: tijdslimiet per pagina → geen cache bij fout`, tl.status === 'fout' ? cache.aantal() === voorT : tl.status === 'ok', `${tl.status} ${tl.fout || ''}`);
        // Wissen
        const gewist = await cache.wis(A, r1.sha256);
        check(`${eng}: ocrCacheWissen per document`, gewist >= 1 && (await cache.lees(A, r1.sha256, eng, 'eng', [1])).size === 0);
        await cache.wis(A); await cache.wis(B); await cache.wis(A_TECH);
      }
      delete process.env.ZOEK_OCR_ENGINE; delete process.env.ZOEK_OCR_TALEN; delete process.env.ZOEK_OCR_TALEN_MAP; await engineResetten();
    }
    // Sleutel verplicht
    let zonderSleutel = ''; try { await ocrUitvoeren({ bytes: blokPng(), naam: 'x.png', sleutel: { userId: '', ruimte: 'prive' } }); } catch (e) { zonderSleutel = String((e as any)?.code); }
    check('ocrUitvoeren: zonder geldige sleutel geweigerd', zonderSleutel === 'OCR_SLEUTEL_ONGELDIG');
    const dz = await tekstUit({ bytes: blokPng(), naam: 'x.png', ocr: 'direct' });
    check('tekstUit ocr:direct zonder sleutel → fout OCR_SLEUTEL_ONTBREEKT', dz.status === 'fout' && dz.fout === 'OCR_SLEUTEL_ONTBREEKT' || dz.status === 'ocr_niet_beschikbaar');

    // ---- OCR-cache in Postgres (migratie 0102): isolatie per gebruiker/ruimte, ook met RLS voor de app-rol ----
    if (process.env.DATABASE_URL) {
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
      try {
        const bestaat = (await pool.query("SELECT to_regclass('app.zoek_ocr_tekst') AS t")).rows[0]?.t;
        check('0102: tabel app.zoek_ocr_tekst bestaat (RLS aan)', !!bestaat && (await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'app.zoek_ocr_tekst'::regclass")).rows[0]?.relrowsecurity === true);
        if (bestaat) {
          const sha = 'a'.repeat(64); const pc = pgOcrTekstCache((sql, p = []) => pool.query(sql, p as any[]));
          await pc.wis(A); await pc.wis(B); await pc.wis(A_TECH);
          await pc.schrijf([{ userId: A.userId, ruimte: 'prive', sha256: sha, pagina: 1, engine: 'tesseract-cli', talen: 'eng', status: 'ok', tekst: 'tekst van A' }, { userId: B.userId, ruimte: 'prive', sha256: sha, pagina: 1, engine: 'tesseract-cli', talen: 'eng', status: 'ok', tekst: 'tekst van B' }]);
          const la = await pc.lees(A, sha, 'tesseract-cli', 'eng', [1, 2]), lb = await pc.lees(B, sha, 'tesseract-cli', 'eng', [1]), lt = await pc.lees(A_TECH, sha, 'tesseract-cli', 'eng', [1]);
          check('0102: zelfde sha256 bij A en B → eigen rijen, andere ruimte leeg', la.get(1)?.tekst === 'tekst van A' && lb.get(1)?.tekst === 'tekst van B' && lt.size === 0 && la.size === 1);
          await pc.schrijf([{ userId: A.userId, ruimte: 'prive', sha256: sha, pagina: 1, engine: 'tesseract-cli', talen: 'eng', status: 'ok', tekst: 'tekst van A v2' }]);
          check('0102: upsert overschrijft dezelfde sleutel', (await pc.lees(A, sha, 'tesseract-cli', 'eng', [1])).get(1)?.tekst === 'tekst van A v2');
          const rol = (await pool.query("SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app'")).rowCount;
          if (rol) {
            const c = await pool.connect();
            try {
              await c.query('BEGIN'); await c.query('SET LOCAL ROLE mijnruimte_app'); await c.query("SELECT set_config('app.user_id', $1, true)", [A.userId]);
              const r = await c.query('SELECT user_id, tekst FROM app.zoek_ocr_tekst WHERE sha256 = $1', [sha]);
              check('0102 RLS: app-rol als A ziet alleen rijen van A (ook zonder WHERE user_id)', r.rows.length === 1 && r.rows[0].user_id === A.userId, JSON.stringify(r.rows));
              let geweigerd = false; try { await c.query('SAVEPOINT s1'); await c.query("INSERT INTO app.zoek_ocr_tekst (user_id, ruimte, sha256, pagina, engine, talen, status, tekst) VALUES ($1,'prive',$2,9,'x','eng','ok','smokkel')", [B.userId, sha]); await c.query('RELEASE SAVEPOINT s1'); } catch { geweigerd = true; await c.query('ROLLBACK TO SAVEPOINT s1'); }
              check('0102 RLS: app-rol als A kan niet onder B schrijven', geweigerd);
              await c.query('ROLLBACK');
            } finally { c.release(); }
          }
          check('0102: wissen per gebruiker', (await pc.wis(A)) >= 1 && (await pc.lees(A, sha, 'tesseract-cli', 'eng', [1])).size === 0 && (await pc.lees(B, sha, 'tesseract-cli', 'eng', [1])).size === 1);
          await pc.wis(B);
        }
      } finally { await pool.end(); }
    }
  } finally {
    await werkerSluiten(); await engineResetten(); await rm(werkerUit, { force: true }); delete process.env.ZOEK_WERKER_PAD; werkerPadResetten();
  }
  return einde();
}
