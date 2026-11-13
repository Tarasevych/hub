// CLOUD-001 — CONTRACT, ARCHIEFLEZER, ROUTERING EN TAALZUIVERHEID ZONDER DATABANK (12.11.2026).
// Draaien: node scripts/eenheidstests.mjs cloud-001-ui-contract.test.ts
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { checker } from './hulp/nep-google';
import {
  cloudSoort,
  leesGedeeldKoppelingUitPadOfZoek,
  veiligUploadMime,
} from '../../shared/cloud-vnext-model';
import { leesArchiefUitBuffer } from '../../backend/cloud-vnext-bestanden';
import { foutTekst } from '../../src/cloud-vnext/tekst';

const lees = (pad: string) => readFileSync(pad, 'utf8');
const zonderCommentaar = (bron: string) => bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function maakTarBuffer(items: Array<{ pad: string; inhoud?: Buffer; map?: boolean }>): Buffer {
  const blokken: Buffer[] = [];
  for (const item of items) {
    const kop = Buffer.alloc(512, 0);
    const data = item.map ? Buffer.alloc(0) : (item.inhoud ?? Buffer.alloc(0));
    kop.write(item.pad, 0, Math.min(100, Buffer.byteLength(item.pad)), 'utf8');
    kop.write(item.map ? '0000755\0' : '0000644\0', 100, 8, 'ascii');
    kop.write('0001000\0', 108, 8, 'ascii');
    kop.write('0001000\0', 116, 8, 'ascii');
    kop.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
    kop.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii');
    kop.fill(0x20, 148, 156);
    kop.write(item.map ? '5' : '0', 156, 1, 'ascii');
    kop.write('ustar\0', 257, 6, 'ascii');
    kop.write('00', 263, 2, 'ascii');
    let som = 0;
    for (let i = 0; i < 512; i += 1) som += kop[i];
    kop.write(`${som.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    blokken.push(kop);
    if (data.length > 0) {
      blokken.push(data);
      const rest = data.length % 512;
      if (rest > 0) blokken.push(Buffer.alloc(512 - rest, 0));
    }
  }
  blokken.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blokken);
}

export async function main(): Promise<number> {
  const { check, einde } = checker('cloud-001-ui-contract');

  // ================================================================ A. veiligUploadMime & cloudSoort
  check(
    'A lege MIME bij archieven en tekstbestanden krijgt een passend veilig type',
    veiligUploadMime('', 'bundel.tar.gz') === 'application/gzip'
      && veiligUploadMime('', 'pakket.7z') === 'application/x-7z-compressed'
      && veiligUploadMime('', 'archief.rar') === 'application/vnd.rar'
      && veiligUploadMime('', 'notitie.md') === 'text/markdown'
      && veiligUploadMime('', '.gitkeep') === 'application/octet-stream',
  );
  check(
    'A actieve browsertypen (html, svg, javascript) worden opgeslagen als veilige tekst/bytes zonder scriptuitvoering',
    veiligUploadMime('text/html; charset=utf-8', 'index.html') === 'text/plain'
      && veiligUploadMime('application/javascript', 'app.js') === 'text/plain'
      && veiligUploadMime('image/svg+xml', 'icoon.svg') === 'text/plain'
      && veiligUploadMime('application/x-msdownload', 'tool.exe') === 'application/octet-stream',
  );
  check(
    'A cloudSoort herkent moderne archieven (.tar.gz, .7z, .rar, .zst, .iso) en broncode',
    cloudSoort('', 'uitgave.tar.gz') === 'archief'
      && cloudSoort('application/x-7z-compressed', 'data.7z') === 'archief'
      && cloudSoort('', 'schijf.iso') === 'archief'
      && cloudSoort('', 'server.ts') === 'code',
  );

  // ================================================================ B. leesGedeeldKoppelingUitPadOfZoek
  const voorbeeldCode = 'AbCdEfGhIjKlMnOpQrStUvWx_123456';
  check(
    'B koppelingscode wordt gelezen uit /gedeeld/<code>, /shared/<code> en ?koppeling=<code>',
    leesGedeeldKoppelingUitPadOfZoek(`/gedeeld/${voorbeeldCode}`, '') === voorbeeldCode
      && leesGedeeldKoppelingUitPadOfZoek(`/shared/${voorbeeldCode}`, '') === voorbeeldCode
      && leesGedeeldKoppelingUitPadOfZoek('/gedeeld', `?koppeling=${voorbeeldCode}`) === voorbeeldCode,
  );
  check(
    'B ongeldige of te korte codes en andere paden geven een lege tekenreeks',
    leesGedeeldKoppelingUitPadOfZoek('/gedeeld/kort', '') === ''
      && leesGedeeldKoppelingUitPadOfZoek('/gedeeld/onveilig..pad..1234567890', '') === ''
      && leesGedeeldKoppelingUitPadOfZoek(`/bestanden/${voorbeeldCode}`, '') === '',
  );

  // ================================================================ C. leesArchiefUitBuffer (.zip en .tar.gz + padbescherming)
  const zipBuf = Buffer.from(
    zipSync({
      'project/README.md': new TextEncoder().encode('# Опис проєкту\nДругий рядок'),
      'project/src/kern.ts': new TextEncoder().encode('export const waarde = 42;\n'),
      '../buiten.txt': new TextEncoder().encode('mag niet zichtbaar zijn'),
    }),
  );
  const zipGelezen = leesArchiefUitBuffer(zipBuf, 'project.zip');
  check(
    'C .zip: ondersteund, mappen en bestanden herkend, pad buiten de wortel (..) geweerd',
    zipGelezen.ondersteund === true
      && zipGelezen.ingangen.some((i) => i.pad === 'project' && i.map)
      && zipGelezen.ingangen.some((i) => i.pad === 'project/README.md' && !i.map)
      && zipGelezen.ingangen.some((i) => i.pad === 'project/src/kern.ts' && !i.map)
      && !zipGelezen.ingangen.some((i) => i.pad.includes('buiten')),
  );
  check(
    'C .zip: bestandsinhoud komt byte voor byte overeen',
    Buffer.from(zipGelezen.bestandenData.get('project/src/kern.ts') || []).toString('utf8') === 'export const waarde = 42;\n',
  );

  const tarGzBuf = gzipSync(
    maakTarBuffer([
      { pad: 'pakket/', map: true },
      { pad: 'pakket/manifest.json', inhoud: Buffer.from('{"versie":1}', 'utf8') },
      { pad: '../../geheim.txt', inhoud: Buffer.from('verboden', 'utf8') },
    ]),
  );
  const tarGelezen = leesArchiefUitBuffer(tarGzBuf, 'pakket.tar.gz');
  check(
    'C .tar.gz: ondersteund, inhoud exact gelezen en onveilige paden geweerd',
    tarGelezen.ondersteund === true
      && tarGelezen.ingangen.some((i) => i.pad === 'pakket/manifest.json' && !i.map)
      && !tarGelezen.ingangen.some((i) => i.pad.includes('geheim'))
      && Buffer.from(tarGelezen.bestandenData.get('pakket/manifest.json') || []).toString('utf8') === '{"versie":1}',
  );

  const zevenZGelezen = leesArchiefUitBuffer(Buffer.from('7z\xbc\xaf\x27\x1c'), 'bundel.7z', { alleenLijst: true });
  check(
    'C niet-ondersteund archiefformaat (.7z) geeft eerlijk ondersteund=false zonder uitzondering',
    zevenZGelezen.ondersteund === false && Boolean(zevenZGelezen.reden),
  );

  // ================================================================ D. routering, menu en publieke toegangspoort
  const canonicalJs = lees('public/canonical-service.js');
  const menuModel = lees('shared/menu-model.ts');
  const werkbladReg = lees('shared/werkblad-register.ts');
  const authPoort = lees('server/platform/auth-poort.ts');
  const verenigd = lees('src/VerenigdDienstApp.tsx');
  const wissel = lees('src/CloudVnextWissel.tsx');

  check(
    'D tabblad shared (/gedeeld) is geregistreerd in canonical-service.js, menu-model en werkblad-register',
    canonicalJs.includes(`'shared'`)
      && canonicalJs.includes(`shared:'gedeeld'`)
      && menuModel.includes(`'files', 'shared'`)
      && werkbladReg.includes(`shared: 'link'`),
  );
  check(
    'D publieke deelroutes staan open op de auth-poort en /gedeeld/<code> laadt GedeeldWeergave ook voor gasten',
    authPoort.includes(`POST /api/cloud/gedeeld/info`)
      && authPoort.includes(`POST /api/cloud/gedeeld/inhoud`)
      && authPoort.includes(`POST /api/cloud/gedeeld/download`)
      && verenigd.includes('leesGedeeldKoppelingUitPadOfZoek')
      && verenigd.includes('GedeeldWeergave')
      && wissel.includes(`props.tab === 'shared'`),
  );

  // ================================================================ E. nieuwe UI-bestanden, CSS-regels en taalzuiverheid
  const uiBestanden = [
    'src/cloud-vnext/DeelVenster.tsx',
    'src/cloud-vnext/GedeeldWeergave.tsx',
    'src/cloud-vnext/map-upload-hulp.ts',
    'src/cloud-vnext/onderdelen/Gedeeld.tsx',
    'src/cloud-vnext/onderdelen/Bestanden.tsx',
    'src/cloud-vnext/DetailPaneel.tsx',
    'src/cloud-vnext/BestandKaart.tsx',
    'src/cloud-vnext/tekst.ts',
    'backend/bestanden-delen.ts',
  ];
  const verbodenLetters = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  for (const pad of uiBestanden) {
    const inhoud = lees(pad);
    check(`E ${pad}: geen innerHTML en geen verboden tekens`, !/innerHTML/i.test(zonderCommentaar(inhoud)) && !verbodenLetters.test(inhoud));
  }

  const delenCss = lees('src/cloud-vnext/cloud-vnext-delen.css').replace(/\/\*[\s\S]*?\*\//g, '');
  check(
    'E cloud-vnext-delen.css gebruikt uitsluitend ontwerptokens (geen hexkleuren, geen position:fixed)',
    !/#[0-9a-fA-F]{3,8}\b/.test(delenCss) && !/position\s*:\s*fixed/i.test(delenCss),
  );

  check(
    'E tweetalige foutteksten (uk + nl) voor delen en archieven zijn aanwezig en verschillend',
    foutTekst('uk', 'WACHTWOORD_VEREIST') !== foutTekst('nl', 'WACHTWOORD_VEREIST')
      && foutTekst('uk', 'KOPPELING_INGETROKKEN') !== foutTekst('nl', 'KOPPELING_INGETROKKEN')
      && foutTekst('uk', 'LIMIET_WEERGAVEN_BEREIKT') !== foutTekst('nl', 'LIMIET_WEERGAVEN_BEREIKT')
      && foutTekst('uk', 'ARCHIEF_NIET_ONDERSTEUND') !== foutTekst('nl', 'ARCHIEF_NIET_ONDERSTEUND'),
  );

  // ================================================================ F. migratie 0210 en rechten.sql
  const migratie = lees('migrations/0210_bestanden_delen_koppelingen.sql');
  const rechten = lees('migrations/rechten.sql');
  check(
    'F migratie 0210 bevat RLS + FORCE RLS en GIN-index op ontvanger_emails; rechten.sql geeft mijnruimte_app toegang',
    migratie.includes('CREATE TABLE IF NOT EXISTS app.cloud_deel_koppelingen')
      && migratie.includes('CREATE TABLE IF NOT EXISTS app.cloud_deel_gebeurtenissen')
      && migratie.includes('ENABLE ROW LEVEL SECURITY')
      && migratie.includes('FORCE ROW LEVEL SECURITY')
      && migratie.includes('USING GIN (ontvanger_emails)')
      && rechten.includes('app.cloud_deel_koppelingen')
      && rechten.includes('app.cloud_deel_gebeurtenissen')
      && rechten.includes('app.cloud_deel_gebeurtenissen_id_seq'),
  );

  return einde();
}
