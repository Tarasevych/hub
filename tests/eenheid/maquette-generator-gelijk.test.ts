// BLOKKEN-001 (15.11.2026): згенеровані файли «Макета» (src/identiteit/maquette) мають точно збігатися з тим, що дає
// генератор scripts/identiteit-maquette/bouw.mjs. Інакше ручна правка двигуна тихо зникає при наступному перезбиранні:
// так було з KLEUREN-001 (#128, повертались 4 акценти) і HINT-001 (#130). Генератор запускається в тимчасовій копії,
// робоче дерево не змінюється. Без браузера й бази.
// NL: de gegenereerde bestanden van het ontwerp moeten gelijk zijn aan de uitvoer van de generator (draait in een tijdelijke kopie).
import { cpSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('maquette-generator-gelijk');
  const wortel = resolve('.');
  const tmp = mkdtempSync(join(tmpdir(), 'maquette-gen-'));
  for (const d of ['scripts/identiteit-maquette', 'docs/ontwerp/identiteit-account/maquette-bron', 'src/identiteit/maquette'])
    cpSync(join(wortel, d), join(tmp, d), { recursive: true });
  if (existsSync(join(wortel, 'node_modules'))) symlinkSync(join(wortel, 'node_modules'), join(tmp, 'node_modules'), 'dir');
  let fout = '';
  try { execFileSync(process.execPath, [join(tmp, 'scripts/identiteit-maquette/bouw.mjs')], { cwd: tmp, stdio: 'pipe' }); }
  catch (e) { fout = String((e as { stderr?: Buffer }).stderr || e).slice(0, 400); }
  check('генератор «Макета» відпрацьовує без помилок (усі кроки v() знаходять свій текст)', !fout, fout);
  const map = 'src/identiteit/maquette';
  const verschil = readdirSync(join(wortel, map)).filter(f => /\.(ts|css|json)$/.test(f) && existsSync(join(tmp, map, f)))
    .filter(f => readFileSync(join(wortel, map, f), 'utf8') !== readFileSync(join(tmp, map, f), 'utf8'));
  check('згенеровані файли «Макета» збігаються з виходом генератора (ручні правки перенесено в generator)', !fout && verschil.length === 0, verschil.join(', '));
  return einde();
}
