// SITE-001 (пункт 12): сторож швидкості завантаження без мережі.
// 1) src/main.tsx завантажує App динамічно (import('./App')), щоб гостьова сторінка /toegang та повернення OAuth не тягнули ядро застосунку.
// 2) Шар технічного профілю TechLaag вантажиться лише за наявності сеансу (ecosystemSessionLikely / wachtOpSessieHint / listenCanonicalAuthChanges).
// 3) CanoniekMeldingencentrum не запитує правила власника без входу і не монтує важкий MeldingenPortaal на закритій панелі.
// 4) regels-opslag передає meldingLichaam(), а uitrol-achtergrond-beheer передає tabContext і перевіряє сеанс.
// 5) Сервер віддає попередньо стиснені .br/.gz файли з Cache-Control: immutable для хешованих ресурсів.
// nl: bewaking van de laadsnelheid zonder netwerk.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-snelheid');
  const root = process.cwd();
  try {
    const main = await readFile(join(root, 'src/main.tsx'), 'utf8');
    check('main.tsx: немає статичного import App from ./App', !/^import\s+App\s+from\s+['"]\.\/App['"]/m.test(main));
    check('main.tsx: динамічний import(./App) у гілці застосунку', /import\(['"]\.\/App['"]\)/.test(main));
    check('main.tsx: TechLaag чекає підтвердження сеансу', main.includes('ecosystemSessionLikely()') && main.includes('wachtOpSessieHint()') && main.includes('listenCanonicalAuthChanges('));

    const cnc = await readFile(join(root, 'src/CanoniekMeldingencentrum.tsx'), 'utf8');
    check('CanoniekMeldingencentrum: useLeverRegels лише для увійшлого запису', /useLeverRegels\(aangemeld\s*&&/.test(cnc));
    check('CanoniekMeldingencentrum: MeldingenPortaal не монтується на закритій панелі без пігулки', /ecosysteemActief\s*&&\s*\(panelOpen\s*\|\|/.test(cnc));

    const regels = await readFile(join(root, 'src/meldingen/v2/regels-opslag.ts'), 'utf8');
    check('regels-opslag: передає meldingLichaam() у запити', regels.includes("api.post('/api/owner/meldingen/regels', meldingLichaam())") && regels.includes('meldingLichaam({ regels: volgende })'));

    const bg = await readFile(join(root, 'src/platform/uitrol-achtergrond-beheer.ts'), 'utf8');
    check('uitrol-achtergrond-beheer: перевіряє сеанс і передає tabContext', bg.includes('!ecosystemSessionLikely()') && bg.includes('tabContext: ecosystemTabContext()') && bg.includes('tsv:canonical-auth-change'));

    const start = await readFile(join(root, 'server/start.ts'), 'utf8');
    check('server/start.ts: immutable для хешованих ресурсів /assets/', start.includes('max-age=31536000, immutable'));
    const comp = await readFile(join(root, 'server/platform/statisch-comprimeren.ts'), 'utf8');
    check('statisch-comprimeren: підтримка brotli та gzip у памʼяті', comp.includes('brotliCompress') && comp.includes('gzip') && comp.includes("'br'"));
  } catch (e) {
    check('сторож виконано без винятків', false, String(e));
  }
  return einde();
}
