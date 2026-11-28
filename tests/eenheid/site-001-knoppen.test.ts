// SITE-001 (пункт 21): постійний сторож кнопок та інтерактивних елементів.
// Перевіряє:
// 1) узгодженість доступної назви перемикача мови .gast-taal із видимим написом MOVA_NAAM (WCAG 2.5.3);
// 2) відсутність мертвого запиту /api/owner/workspaces/list (404) у всьому клієнтському коді src/;
// 3) динамічне оновлення document.title при зміні стану входу й мови у VerenigdDienstApp.tsx та App.tsx;
// 4) картку порожнього столу .wb-leeg-stol (data-wb-leeg='1') з діями бібліотеки та стандартної розкладки у WerkbladV3.tsx;
// 5) обов'язковий атрибут type на всіх інтерактивних <button> у змінених компонентах (без ненавмисного відправлення форм);
// 6) відсутність заборонених літер у перевірених компонентах і в цьому тесті.
// nl: permanente bewakingstest voor knoppen en interactieve elementen (punt 21).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

function alleBestanden(map: string, uit: string[] = []): string[] {
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) alleBestanden(pad, uit);
    else if (/\.(ts|tsx)$/.test(naam)) uit.push(pad);
  }
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-knoppen');
  const gast = readFileSync('src/GastToegang.tsx', 'utf8');
  const maq = readFileSync('src/identiteit/maquette/IdentiteitMaquette.tsx', 'utf8');
  const dienst = readFileSync('src/VerenigdDienstApp.tsx', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  const wb3 = readFileSync('src/werkblad/WerkbladV3.tsx', 'utf8');

  check(
    'GastToegang: перемикач мови .gast-taal починає aria-label із видимого напису MOVA_NAAM (WCAG 2.5.3)',
    gast.includes("className='gast-taal'") &&
      gast.includes('aria-label={`${MOVA_NAAM[volgendeTaal]} —') &&
      gast.includes('<span>{MOVA_NAAM[volgendeTaal]}</span>'),
  );

  const srcBestanden = alleBestanden('src');
  const dodeRoute = srcBestanden.filter((p) => readFileSync(p, 'utf8').includes('/api/owner/workspaces/list'));
  check(
    'жоден клієнтський файл у src/ не викликає неіснуючий маршрут /api/owner/workspaces/list (404)',
    dodeRoute.length === 0 && maq.includes("api.post('/api/owner/session/bootstrap', ctx)"),
    dodeRoute.join(', '),
  );

  check(
    'VerenigdDienstApp: document.title оновлюється зі «Вхід — Мій простір» на заголовок служби після входу',
    dienst.includes("'Налаштування — Мій простір'") &&
      dienst.includes("'Instellingen — Mijn Ruimte'") &&
      dienst.includes("service==='identity'&&state==='signed_out'") &&
      dienst.includes('if(document.title!==wens)document.title=wens;'),
  );

  check(
    'App (HubApp): document.title оновлюється при перемиканні мови зі збереженням префікса технічної смуги',
    app.includes("const basis = lang === 'nl' ? 'Mijn Ruimte' : 'Мій простір';") &&
      app.includes("document.documentElement.dataset.tech === 'aan'") &&
      app.includes('if (document.title !== wens) document.title = wens;'),
  );

  check(
    'WerkbladV3: порожній робочий стіл показує картку .wb-leeg-stol (data-wb-leeg="1") із діями додавання та стандартної розкладки',
    wb3.includes('data-wb-aantal={topAantal}') &&
      wb3.includes('wb-leeg-stol') &&
      wb3.includes("data-wb-leeg='1'") &&
      wb3.includes("data-wb3='leeg-toevoegen'") &&
      wb3.includes("data-wb3='leeg-standaard'") &&
      wb3.includes('migreerV2NaarV3(standaardWerkblad({ ruimte })'),
  );

  const knoppenZonderType = (bron: string) =>
    [...bron.matchAll(/<button\b([^>]*)>/g)].filter((m) => !/\btype\s*=/.test(m[1]));
  check(
    'усі <button> у GastToegang.tsx та WerkbladV3.tsx мають явний атрибут type',
    knoppenZonderType(gast).length === 0 && knoppenZonderType(wb3).length === 0,
  );

  const verboden = new RegExp('[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]');
  const zelf = readFileSync('tests/eenheid/site-001-knoppen.test.ts', 'utf8');
  check(
    'відсутність заборонених літер у змінених компонентах і тесті',
    ![gast, maq, dienst, app, wb3, zelf].some((t) => verboden.test(t)),
  );

  return einde();
}
