// Імена файлів у zip лише з хвоста (EOCD + центральний каталог). Вміст не розпаковується.
// Якщо каталог не вмістився у переданий хвіст — чесно «staart-te-klein», без здогадок.

export type ZipNamenFout = 'beschadigd' | 'zip64' | 'staart-te-klein';
export type ZipNamenUitslag = { namen: string[]; aantal: number; fout?: ZipNamenFout };

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const utf8 = new TextDecoder('utf-8', { fatal: false });

function veilig(naam: string): string {
  if (!naam || naam.length > 1000 || /[\u0000-\u001f]/.test(naam)) return '';
  if (naam.endsWith('/')) return '';
  if (naam.includes('\\') || naam.startsWith('/') || /^[A-Za-z]:/.test(naam)) return '';
  const delen = naam.split('/').filter((d) => d !== '' && d !== '.');
  if (!delen.length || delen.some((d) => d === '..')) return '';
  return delen.join('/');
}

/** `staart` — останні байти файла. `bestandGrootte` — повний розмір, щоб зміщення каталогу лягло на хвіст. */
export function zipNamenUitStaart(staart: Uint8Array, bestandGrootte: number, maxNamen = 8): ZipNamenUitslag {
  const leeg = (fout: ZipNamenFout, aantal = 0): ZipNamenUitslag => ({ namen: [], aantal, fout });
  if (staart.length < 22 || bestandGrootte < staart.length || bestandGrootte < 22) return leeg('beschadigd');
  const basis = bestandGrootte - staart.length;
  let eocd = -1;
  for (let i = staart.length - 22; i >= Math.max(0, staart.length - 22 - 65535); i--) if (u32(staart, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0 || eocd + 22 > staart.length) return leeg('beschadigd');
  const aantal = u16(staart, eocd + 10);
  const cdGrootte = u32(staart, eocd + 12);
  const cdOff = u32(staart, eocd + 16);
  if (aantal === 0xffff || cdOff === 0xffffffff || cdGrootte === 0xffffffff) return leeg('zip64', aantal === 0xffff ? 0 : aantal);
  for (let i = eocd - 20; i >= Math.max(0, eocd - 24); i--) if (u32(staart, i) === 0x07064b50) return leeg('zip64');
  if (cdOff < basis) return leeg('staart-te-klein', aantal);
  const start = cdOff - basis;
  if (start + cdGrootte > staart.length || start + cdGrootte > eocd) return leeg('beschadigd', aantal);
  const namen: string[] = [];
  let p = start;
  const grens = Math.min(aantal, 500);
  for (let n = 0; n < grens; n++) {
    if (p + 46 > staart.length || u32(staart, p) !== 0x02014b50) return namen.length ? { namen, aantal } : leeg('beschadigd', aantal);
    const nl = u16(staart, p + 28), xl = u16(staart, p + 30), cl = u16(staart, p + 32);
    const eind = p + 46 + nl;
    if (eind > staart.length) return namen.length ? { namen, aantal } : leeg('beschadigd', aantal);
    const naam = veilig(utf8.decode(staart.subarray(p + 46, eind)));
    if (naam && namen.length < maxNamen) namen.push(naam);
    p = eind + xl + cl;
  }
  return { namen, aantal };
}
