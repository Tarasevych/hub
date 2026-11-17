// Тест заміни xlsx та безпечного читання/запису таблиць і DBF без сторонніх уразливостей (SEC-003, 16.11.2026).
import { readFileSync } from 'node:fs';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { checker } from './hulp/nep-google';
import {
  bereidVeiligeXml,
  leesDbf,
  leesDif,
  leesOdfXml,
  leesOds,
  leesSylk,
  leesXlsx,
  ontleedXml,
  schrijfDbf,
  schrijfDif,
  schrijfFods,
  schrijfOds,
  schrijfSylk,
  schrijfXlsx,
} from '../../src/mail-rekenblad-lezer';
import { exportMailSpreadsheet, loadMailSpreadsheetContent } from '../../src/mail-rekenblad-inhoud';
import { mailSpreadsheetCapability } from '../../src/mail-rekenblad-mogelijkheden';
import { exportMailDatabaseTable, loadMailDatabaseContent } from '../../src/mail-database-inhoud';
import { mailDatabaseCapability } from '../../src/mail-database-mogelijkheden';

const blobBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-rekenblad-lezer-20261116');

  const basisBlad = {
    name: 'Звіт Q4 & "План"',
    rows: [
      ['Місто', 'Сума', 'Примітка <XML>', 'Пусто', 'Код'],
      ['Київ', '1250.50', 'A & B; C="ok"', '', '007'],
      ['Амстердам', '42', 'Рядок 1\nРядок 2', '', 'NL-01'],
    ],
  };

  // 1. OOXML (.xlsx): прямий цикл, збереження через exportMailSpreadsheet і читання через loadMailSpreadsheetContent.
  const xlsxCap = mailSpreadsheetCapability('begroting.xlsx')!;
  const xlsxBytes = schrijfXlsx(basisBlad);
  const xlsxGelezen = leesXlsx(xlsxBytes);
  check(
    'xlsx: читання повертає очищене імʼя аркуша та всі клітинки зі спецсимволами',
    xlsxGelezen.length === 1 &&
      xlsxGelezen[0].rows.length === 3 &&
      xlsxGelezen[0].rows[1][0] === 'Київ' &&
      xlsxGelezen[0].rows[1][2] === 'A & B; C="ok"' &&
      xlsxGelezen[0].rows[1][3] === '' &&
      xlsxGelezen[0].rows[1][4] === '007' &&
      xlsxGelezen[0].rows[2][2] === 'Рядок 1\nРядок 2',
  );

  const xlsxExport = await exportMailSpreadsheet(basisBlad, 'xlsx', 'csv');
  const xlsxGeladen = await loadMailSpreadsheetContent(xlsxExport.blob, xlsxCap);
  check(
    'xlsx: повний цикл exportMailSpreadsheet -> loadMailSpreadsheetContent без втрати даних',
    !xlsxGeladen.recovered &&
      xlsxGeladen.sheets.length >= 1 &&
      xlsxGeladen.sheets[0].rows[1][0] === 'Київ' &&
      xlsxGeladen.sheets[0].rows[1][2] === 'A & B; C="ok"',
  );

  // Перевірка sharedStrings.xml із фонетичним блоком <rPh> та координатами комірок.
  const sstXlsx = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    '_rels/.rels': strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Таблиця" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/sharedStrings.xml': strToU8(
      '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Ключ</t><rPh sb="0" eb="1"><t>фоно</t></rPh></si><si><r><t>Значення </t></r><r><t>А</t></r></si></sst>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="3"><c r="B3" t="b"><v>1</v></c></row></sheetData></worksheet>',
    ),
  });
  const sstBladen = leesXlsx(sstXlsx);
  check(
    'xlsx: розбір sharedStrings (без фонетичних rPh), пропусків рядків/стовпців і булевих комірок',
    sstBladen[0].name === 'Таблиця' &&
      sstBladen[0].rows.length === 3 &&
      sstBladen[0].rows[0][0] === 'Ключ' &&
      sstBladen[0].rows[0][1] === '' &&
      sstBladen[0].rows[0][2] === 'Значення А' &&
      sstBladen[0].rows[2][1] === 'TRUE',
  );

  // 2. ODF (.ods і .fods): нестиснений mimetype у .ods, повтор порожніх рядків без роздування, повний цикл.
  const odsCap = mailSpreadsheetCapability('tabel.ods')!;
  const odsExport = await exportMailSpreadsheet(basisBlad, 'same', 'ods', ',', odsCap.writer);
  const odsBytes = await blobBytes(odsExport.blob);
  const odsZip = unzipSync(odsBytes);
  const odsGelezen = leesOds(odsBytes);
  const odsGeladen = await loadMailSpreadsheetContent(odsExport.blob, odsCap);
  check(
    'ods: круговий цикл і наявність mimetype / META-INF/manifest.xml / content.xml',
    new TextDecoder().decode(odsZip['mimetype']) === 'application/vnd.oasis.opendocument.spreadsheet' &&
      Boolean(odsZip['META-INF/manifest.xml']) &&
      odsGelezen[0].rows[1][0] === 'Київ' &&
      !odsGeladen.recovered &&
      odsGeladen.sheets[0].rows[2][2].includes('Рядок 1'),
  );

  const fodsCap = mailSpreadsheetCapability('flat.fods')!;
  const fodsExport = await exportMailSpreadsheet(basisBlad, 'same', 'fods', ',', fodsCap.writer);
  const fodsGeladen = await loadMailSpreadsheetContent(fodsExport.blob, fodsCap);
  const fodsHerhaalXml =
    '<?xml version="1.0"?><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Лист"><table:table-row><table:table-cell><text:p>Заголовок</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1024"/></table:table-row><table:table-row table:number-rows-repeated="1048560"><table:table-cell table:number-columns-repeated="1024"/></table:table-row></table:table></office:spreadsheet></office:body></office:document>';
  const fodsHerhaal = leesOdfXml(fodsHerhaalXml, 'FODS');
  check(
    'fods: круговий цикл і відсікання хвостових порожніх повторів LibreOffice',
    !fodsGeladen.recovered &&
      fodsGeladen.sheets[0].rows[1][2] === 'A & B; C="ok"' &&
      fodsHerhaal[0].rows.length === 1 &&
      fodsHerhaal[0].rows[0].length === 1 &&
      fodsHerhaal[0].rows[0][0] === 'Заголовок',
  );

  // 3. DIF та SYLK (.dif, .sylk, .slk): круговий цикл.
  const difCap = mailSpreadsheetCapability('export.dif')!;
  const difExport = await exportMailSpreadsheet(basisBlad, 'same', 'dif', ',', difCap.writer);
  const difGeladen = await loadMailSpreadsheetContent(difExport.blob, difCap);
  const difNumBlad = leesDif('TABLE\r\n0,1\r\n"Число"\r\nDATA\r\n0,0\r\n""\r\n-1,0\r\nBOT\r\n0,99.5\r\nV\r\n1,0\r\n"Текст"\r\n-1,0\r\nEOD\r\n');
  check(
    'dif: круговий цикл із лапками/переносами та розбір числових кортежів',
    !difGeladen.recovered &&
      difGeladen.sheets[0].rows[1][2] === 'A & B; C="ok"' &&
      difGeladen.sheets[0].rows[2][2] === 'Рядок 1\nРядок 2' &&
      difNumBlad[0].rows[0][0] === '99.5' &&
      difNumBlad[0].rows[0][1] === 'Текст',
  );

  const sylkCap = mailSpreadsheetCapability('export.sylk')!;
  const sylkExport = await exportMailSpreadsheet(basisBlad, 'same', 'sylk', ',', sylkCap.writer);
  const sylkGeladen = await loadMailSpreadsheetContent(sylkExport.blob, sylkCap);
  const slkDirect = leesSylk('ID;PTest\nC;Y1;X1;K"Поле;;1"\nC;X3;K42\nE\n');
  check(
    'sylk/slk: круговий цикл (екранування крапки з комою) та координатний розбір',
    !sylkGeladen.recovered &&
      sylkGeladen.sheets[0].rows[1][2] === 'A & B; C="ok"' &&
      slkDirect[0].rows[0][0] === 'Поле;1' &&
      slkDirect[0].rows[0][2] === '42',
  );

  // 4. dBASE (.dbf): запис і читання через loadMailDatabaseContent та exportMailDatabaseTable + видалені записи 0x2A.
  const dbfCap = mailDatabaseCapability('klanten.dbf')!;
  const dbfTabel = {
    name: 'Data',
    columns: ['Назва', 'Код', 'Опис'],
    rows: [
      ['Клієнт Київ', 'UA-01', 'Тестовий запис із UTF-8'],
      ['Bedrijf NL', 'NL-02', 'Belangrijke klant ëïé'],
    ],
  };
  const dbfExport = await exportMailDatabaseTable(dbfTabel, 'same', dbfCap);
  const dbfGeladen = await loadMailDatabaseContent(dbfExport.blob, dbfCap);
  // Симулюємо запис із позначкою видалення 0x2A та перевіряємо, що його буде пропущено.
  const dbfRaw = schrijfDbf({ name: 'Data', columns: ['ID', 'STATUS'], rows: [['1', 'ACTIVE'], ['2', 'REMOVED']] });
  const kopBytes = new DataView(dbfRaw.buffer).getUint16(8, true);
  const recBytes = new DataView(dbfRaw.buffer).getUint16(10, true);
  dbfRaw[kopBytes + recBytes] = 0x2a; // Позначаємо 2-й запис як видалений.
  const dbfGefilterd = leesDbf(dbfRaw);
  check(
    'dbf: круговий цикл loadMailDatabaseContent/exportMailDatabaseTable і пропуск видалених записів 0x2A',
    !dbfGeladen.inspectOnly &&
      dbfGeladen.tables.length === 1 &&
      dbfGeladen.tables[0].rows.length === 2 &&
      dbfGeladen.tables[0].rows[0][0] === 'Клієнт Київ' &&
      dbfGeladen.tables[0].rows[1][2] === 'Belangrijke klant ëïé' &&
      dbfGefilterd.rows.length === 1 &&
      dbfGefilterd.rows[0][0] === '1',
  );

  // 5. Захист від XXE / <!ENTITY> та безпечне зняття <!DOCTYPE>.
  const veiligeDocXml = bereidVeiligeXml('<?xml version="1.0"?><!DOCTYPE office:document><office:document><a/></office:document>');
  let xxeGeblokkeerdFods = false;
  try {
    await loadMailSpreadsheetContent(
      new Blob(
        [
          '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY secret SYSTEM "file:///etc/passwd">]><office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table><table:table-row><table:table-cell><text:p>&secret;</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document>',
        ],
        { type: 'application/vnd.oasis.opendocument.spreadsheet-flat-xml' },
      ),
      fodsCap,
    );
  } catch (err) {
    xxeGeblokkeerdFods = (err as Error)?.message === 'SHEET_XML_UNSAFE_ENTITY';
  }

  let onbekendeEntiteitGeblokkeerd = false;
  try {
    ontleedXml('<worksheet><t>&customSecret;</t></worksheet>');
  } catch (err) {
    onbekendeEntiteitGeblokkeerd = (err as Error)?.message === 'SHEET_XML_UNSAFE_ENTITY';
  }

  let xxeGeblokkeerdXlsx = false;
  try {
    const xxeZip = zipSync({
      '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
      'xl/worksheets/sheet1.xml': strToU8(
        '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY xx SYSTEM "file:///etc/passwd">]><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&xx;</t></is></c></row></sheetData></worksheet>',
      ),
    });
    leesXlsx(xxeZip);
  } catch (err) {
    xxeGeblokkeerdXlsx = (err as Error)?.message === 'SHEET_XML_UNSAFE_ENTITY';
  }

  check(
    'xxe: зняття безпечного <!DOCTYPE> та блокування <!ENTITY> й неоголошених сутностей',
    !veiligeDocXml.includes('<!DOCTYPE') && xxeGeblokkeerdFods && onbekendeEntiteitGeblokkeerd && xxeGeblokkeerdXlsx,
  );

  // 6. Застарілі бінарні формати та Excel 2003 SpreadsheetML XML.
  const xlsCap = mailSpreadsheetCapability('oud.xls')!;
  const xlsbCap = mailSpreadsheetCapability('oud.xlsb')!;
  const wk1Cap = mailSpreadsheetCapability('oud.wk1')!;
  const ethCap = mailSpreadsheetCapability('oud.eth')!;
  const binairXls = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new TextEncoder().encode('Leesbare tekst in XLS')]);
  const binairGeladen = await loadMailSpreadsheetContent(new Blob([binairXls]), xlsCap);
  const xmlXls =
    '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet Name="Лист1"><Table><Row><Cell><Data>Перший</Data></Cell><Cell><Data>Другий</Data></Cell></Row></Table></Worksheet></Workbook>';
  const xmlXlsGeladen = await loadMailSpreadsheetContent(new Blob([xmlXls]), xlsCap);
  check(
    'legacy: бінарні формати без небезпечних writer переходять у чесне recover, а XML .xls читається структуровано',
    !xlsCap.writer &&
      !xlsbCap.writer &&
      !wk1Cap.writer &&
      !ethCap.writer &&
      !xlsbCap.exportFormats.includes('same') &&
      binairGeladen.recovered &&
      !xmlXlsGeladen.recovered &&
      xmlXlsGeladen.sheets[0].rows[0][1] === 'Другий',
  );

  // 7. AbortSignal.
  const ac = new AbortController();
  ac.abort();
  let afgebroken = false;
  try {
    await loadMailSpreadsheetContent(xlsxExport.blob, xlsxCap, ac.signal);
  } catch (err) {
    afgebroken = (err as Error)?.name === 'AbortError';
  }
  check('abort: AbortSignal скасовує завантаження з AbortError', afgebroken);

  // 8. Перевірка сумісності mdb-reader із оновленим fast-xml-parser та відсутності Node-глобалів / xlsx.
  const { XMLParser } = await import('fast-xml-parser');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: true });
  const xmlParsed = parser.parse('<keyData saltSize="16" blockSize="16"/>') as { keyData?: { saltSize?: number } };
  const lezerBron = readFileSync('src/mail-rekenblad-lezer.ts', 'utf8');
  const inhoudBron = readFileSync('src/mail-rekenblad-inhoud.ts', 'utf8');
  const dbBron = readFileSync('src/mail-database-inhoud.ts', 'utf8');
  const pkgBron = readFileSync('package.json', 'utf8');
  const lockBron = readFileSync('package-lock.json', 'utf8');
  check(
    'beveiliging: відсутні xlsx/Buffer/process у табличному коді та справний fast-xml-parser 5.12+',
    xmlParsed.keyData?.saltSize === 16 &&
      !/\b(Buffer|process|require)\b|node:/.test(lezerBron) &&
      !inhoudBron.includes("import('xlsx')") &&
      !dbBron.includes("import('xlsx')") &&
      !pkgBron.includes('"xlsx"') &&
      !lockBron.includes('"node_modules/xlsx"'),
  );

  // Пригнічуємо невикористані попередження, якщо перевіряється тип експорту напряму.
  void schrijfDif;
  void schrijfFods;
  void schrijfOds;
  void schrijfSylk;

  return einde();
}
