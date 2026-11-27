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

    // SITE-001 (повернення до вкладки та переходи між піддоменами без повторного перезавантаження пошти, вкладень і сторінок):
    const mailFn = await readFile(join(root, 'src/MailFunctioneelWeergave.tsx'), 'utf8');
    check('MailFunctioneelWeergave: синхронне відновлення знімку пошти з sessionStorage/localStorage без скидання в loading',
      mailFn.includes('leesMailBootstrapCache') && mailFn.includes('schrijfMailBootstrapCache') && mailFn.includes('tsv:mail-bootstrap-cache-v1:'));

    const labels = await readFile(join(root, 'src/mail-aanbieder-toestand.ts'), 'utf8');
    check('mail-aanbieder-toestand: збереження міток між переходами та 5-хвилинне вікно свіжості без зайвих запитів',
      labels.includes('readCachedMailProviderLabelSnapshot') && labels.includes('LABELS_FRESH_TTL_MS=300_000') && labels.includes('tsv:mail-labels-snapshot-v1:'));

    const cache = await readFile(join(root, 'src/mail-bijlage-cache.ts'), 'utf8');
    check('mail-bijlage-cache: збереження attachmentsByMessage у MailListViewSnapshot та узгоджена політика просторів',
      cache.includes('attachmentsByMessage?:Record<string,unknown[]>') && cache.includes('BOOTSTRAP_CACHE_PREFIX') && cache.includes('LABELS_CACHE_PREFIX'));

    const werk = await readFile(join(root, 'src/GoogleMailWerkruimte.tsx'), 'utf8');
    check('GoogleMailWerkruimte: збереження тимчасового стану в sessionStorage+localStorage, 5-хвилинна свіжість списку та миттєве відкриття листів/вкладень із кешу',
      werk.includes('readMailTransient') && werk.includes('writeMailTransient') && werk.includes('freshCacheTtlMs=300000')
      && werk.includes('sourceBlob:cachedBlob.blob') && werk.includes("minInterval=reden==='zichtbaar'&&snapshot.accounts.length>0?300000:4000"));

    const verApp = await readFile(join(root, 'src/VerenigdDienstApp.tsx'), 'utf8');
    const hubApp = await readFile(join(root, 'src/App.tsx'), 'utf8');
    check('VerenigdDienstApp та App: фонова звірка при поверненні до вкладки не частіше ніж раз на 5 хв за незмінного облікового запису',
      verApp.includes('300000') && hubApp.includes('300000'));

    const techOpslag = await readFile(join(root, 'src/tech/tech-opslag.ts'), 'utf8');
    const ruimtesOpslag = await readFile(join(root, 'src/tech/ruimtes/ruimtes-opslag.ts'), 'utf8');
    check('tech-opslag та ruimtes-opslag: дроселювання фонових запитів при visibilitychange/focus (60 с за незмінного простору)',
      techOpslag.includes('laatsteTechSync') && ruimtesOpslag.includes('laatsteRuimtesSync') && ruimtesOpslag.includes('laatsteRuimteBijSync'));

    const client = await readFile(join(root, 'src/platform/client.ts'), 'utf8');
    const navSnel = await readFile(join(root, 'src/navigatie-snel.ts'), 'utf8');
    check('client та navigatie-snel: фонові маршрути синхронізації не запускають видиму смугу завантаження на вже відмальованій сторінці',
      client.includes('ACHTERGROND_PAD') && navSnel.includes('if (stand.alleenAchtergrond && paginaHeeftZichtbareInhoud()) return;'));
  } catch (e) {
    check('сторож виконано без винятків', false, String(e));
  }
  return einde();
}
