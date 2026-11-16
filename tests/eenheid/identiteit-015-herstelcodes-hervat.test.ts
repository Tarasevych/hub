// IDENTITEIT-015 (лінія C2, коди відновлення): вада, яку знайшов e2e herstelcodes («download» не чекав нічого — панелі з кодами
// не було). У центрі облікового запису на одній сторінці три екземпляри AccessPlaneView (alleen = methods / security / recovery).
// Після step-up через Google дію «herstelcodes-maken» підхоплював перший екземпляр, що завантажився («Способи входу», де секції
// кодів немає): сервер створював новий набір (старий знищено), а людина нових кодів не бачила. Тут — справжні neemHervat /
// bewaarHervat із src/platform/stap-op.ts на підробленому sessionStorage/location, у тому самому порядку монтування.
// Запуск: node scripts/eenheidstests.mjs identiteit-015-herstelcodes-hervat.test.ts (база не потрібна).
// Fout uit de e2e: na Google-step-up nam het verkeerde exemplaar (zonder herstelcodesectie) de hervatting over → codes kwijt.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015 herstelcodes hervatten');
  const opslag = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.sessionStorage = { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => void opslag.set(k, String(v)), removeItem: (k: string) => void opslag.delete(k) };
  g.location = { pathname: '/aanmeldmethoden', search: '?lang=uk', origin: 'https://id.tarasevych.com' };
  const { bewaarHervat, neemHervat } = await import('../../src/platform/stap-op');
  const { magHerstelcodesHervatten } = await import('../../src/herstel/hervat-plek');

  check('лише без поділу або в «Відновленні доступу» можна підхопити створення кодів',
    magHerstelcodesHervatten(undefined) && magHerstelcodesHervatten('recovery') && !magHerstelcodesHervatten('methods') && !magHerstelcodesHervatten('security'));

  // Порядок монтування на сторінці: methods → security → recovery (як у центрі облікового запису).
  const DELEN = ['methods', 'security', 'recovery'] as const;
  const wieNeemt = (metPoort: boolean) => {
    bewaarHervat({ actie: 'herstelcodes-maken' });
    const genomen: string[] = [];
    for (const deel of DELEN) if ((!metPoort || magHerstelcodesHervatten(deel)) && neemHervat('herstelcodes-maken')) genomen.push(deel);
    return genomen;
  };
  const zonder = wieNeemt(false);
  check('відтворення вади: без перевірки дію перехоплює «Способи входу» (там секції кодів немає)', zonder.length === 1 && zonder[0] === 'methods', zonder.join(','));
  const met = wieNeemt(true);
  check('з перевіркою дію підхоплює рівно один екземпляр — «Відновлення доступу», де коди видно', met.length === 1 && met[0] === 'recovery', met.join(','));

  // AccessPlaneView справді питає magHerstelcodesHervatten(alleen) ПЕРЕД neemHervat у тому ж ефекті.
  const bron = readFileSync('src/ToegangslaagWeergave.tsx', 'utf8');
  const effect = bron.slice(bron.indexOf('const hervat=useRef(false);'), bron.indexOf("if(neemHervat('herstelcodes-maken'))") + 40);
  check('src/ToegangslaagWeergave.tsx: ефект відновлення перевіряє magHerstelcodesHervatten(alleen) до neemHervat',
    effect.includes('!magHerstelcodesHervatten(alleen)') && effect.indexOf('magHerstelcodesHervatten(alleen)') < effect.indexOf("neemHervat('herstelcodes-maken')"));

  // Супутня вада з того самого e2e: на сторінці повернення від Google оболонка питала прапорець tech-ruimtes-v2 ще без контексту вкладки → 401.
  const { opGoogleTerugkeer, markeerGoogleTerugkeer } = await import('../../src/platform/google-terugkeer');
  check('сторінку повернення Google розпізнано (state v2./gsuite.v2. + code або error), звичайні сторінки — ні',
    opGoogleTerugkeer('?state=v2.uk.abc&code=xyz') && opGoogleTerugkeer('?state=gsuite.v2.nl.q&error=access_denied')
    && !opGoogleTerugkeer('?lang=uk') && !opGoogleTerugkeer('?state=v2.uk.abc') && !opGoogleTerugkeer('?state=iets&code=1'));
  (globalThis as Record<string, unknown>).location = { pathname: '/', search: '', origin: 'https://id.tarasevych.com' };
  const voor = opGoogleTerugkeer();
  markeerGoogleTerugkeer();
  check('після очищення адреси обробником позначка все одно розпізнає сторінку повернення', voor === false && opGoogleTerugkeer() === true && opGoogleTerugkeer('?lang=uk') === false);
  const terugBron = readFileSync('src/EigenaarIdentiteitTerug.tsx', 'utf8');
  check('EigenaarIdentiteitTerug ставить позначку ДО history.replaceState', terugBron.indexOf('markeerGoogleTerugkeer();') > 0 && terugBron.indexOf('markeerGoogleTerugkeer();') < terugBron.indexOf("history.replaceState({},'',current.pathname||'/')"));
  const vlagBron = readFileSync('src/tech/ruimtes/ruimtes-vlag.ts', 'utf8');
  check('laadRuimtesVlag на сторінці повернення не робить запиту', /laadRuimtesVlag\(opnieuw = false\): Promise<boolean> \{\n  if \(opGoogleTerugkeer\(\)\) return Promise\.resolve/.test(vlagBron));
  return einde();
}
