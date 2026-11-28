// HERSTEL-001 — Перевірочні випробування 4 складових вади сторінки повернення входу Google (id.tarasevych.com, STATE_EXPIRED · HTTP 400)
// за знімком екрана власника:
//   - Screenshot_20261125_125840_com.android.chrome.jpg
//
// Цей тестовий набір зберігає точні вимоги, оцінює стан виправлення (GOOG-1..GOOG-4) та захищає всі інженерні
// гарантії D-1..D-7 і межові інваріанти U2-1..U2-6 (реєстрація завіси, безпечний вивід <code>{diagnostic.code}</code>,
// ідеальне коло (i) 32×32 px з вагою (0,4,1), повнорозмірна завіса без смуги 16 px і role='dialog' на аркуші з циклічним
// утриманням фокуса Tab/Shift+Tab, рівновисока сітка кнопок дій grid-auto-rows: 1fr (min-height: 44 px) на змінних tokens.css
// із підтримкою theme-plum-dark та надвузьких екранів 320 px, нормалізований код у failureCopy, захист safeBack від вбудованих
// повноважень username:password@ та повна двомовність для входу й підключення служби).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const VERBODEN_TEKENREEKS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

export interface GoogleTerugkeerGebrekContract {
  readonly id: 'GOOG-1' | 'GOOG-2' | 'GOOG-3' | 'GOOG-4';
  readonly schermafdruk: string;
  readonly titelUk: string;
  readonly titelNl: string;
  readonly doelBestanden: readonly string[];
  readonly oorzaakUk: string;
  readonly oorzaakNl: string;
  readonly herstelEisUk: string;
  readonly herstelEisNl: string;
}

export const VIER_GOOGLE_TERUGKEER_GEBREKEN_CONTRACTEN: readonly GoogleTerugkeerGebrekContract[] = [
  {
    id: 'GOOG-1',
    schermafdruk: 'Screenshot_20261125_125840_com.android.chrome.jpg',
    titelUk: 'Дизайн сторінки повернення id.tarasevych.com: голий білий екран без картки «Мого простору» та чорне слово «Назад» без вигляду кнопки',
    titelNl: 'Ontwerp van de terugkeerpagina id.tarasevych.com: kaal wit scherm zonder Mijn Ruimte-kaart en zwart woord «Terug» zonder knopvorm',
    doelBestanden: ['src/EigenaarIdentiteitTerug.tsx', 'src/google-terugkeer-kaart.css'],
    oorzaakUk:
      'OwnerIdentityCallback відмальовує голий <main> і <section> з вбудованими стилями без картки стану входу, знака «Мій простір» чи значка Google із src/merk, а посилання «Назад» не має рамки, плашки й висоти 44 px.',
    oorzaakNl:
      'OwnerIdentityCallback tekent een kale <main> en <section> met ingebedde stijlen zonder aanmeldkaart, Mijn Ruimte-teken of Google-merk uit src/merk, en de koppeling «Terug» mist rand, vlak en aanraakhoogte van 44 px.',
    herstelEisUk:
      'Оформити сторінку повернення id.tarasevych.com як компактну картку «Мого простору» (min(100%, 388px)) зі змінними оформлення tokens.css, підтримкою світлої й темних тем, знаком із реєстру src/merk, ідеально круглою кнопкою (i) 32×32 px та двома рівновисокими кнопками дій 44 px.',
    herstelEisNl:
      'Geef de terugkeerpagina id.tarasevych.com vorm als een compacte Mijn Ruimte-kaart (min(100%, 388px)) op basis van tokens.css, ondersteuning voor lichte en donkere thema’s, merk uit src/merk, een ronde knop (i) van 32×32 px en twee even hoge actieknoppen van 44 px.',
  },
  {
    id: 'GOOG-2',
    schermafdruk: 'Screenshot_20261125_125840_com.android.chrome.jpg',
    titelUk: 'Взаємодія з кодом проблеми: «Код збою: STATE_EXPIRED · HTTP 400» виглядає як мертвий текст без кнопки копіювання та розшифрування',
    titelNl: 'Interactie met de foutcode: «Foutcode: STATE_EXPIRED · HTTP 400» oogt als dode tekst zonder kopieerknop en verklaring',
    doelBestanden: ['src/EigenaarIdentiteitTerug.tsx', 'src/google-terugkeer-kaart.css', 'scripts/plaatsing-vaste-elementen.json'],
    oorzaakUk:
      'Блок <details><summary> у EigenaarIdentiteitTerug.tsx не мав видимого покажчика взаємодії, кнопки копіювання коду збою в буфер обміну та людського розшифрування коду всередині спливного вікна.',
    oorzaakNl:
      'Het <details><summary>-blok in EigenaarIdentiteitTerug.tsx miste een zichtbare interactie-aanduiding, een knop om de foutcode te kopiëren en een menselijke verklaring van de code binnen het dialoogvenster.',
    herstelEisUk:
      'Винести причини та інтерактивну плашку коду збою (<code>{diagnostic.code}</code>) у спливний аркуш «Чому так сталося» за круглою кнопкою (i) з повнорозмірною завісою 100%×100%, копіюванням у буфер обміну та розкривним поясненням «Докладно».',
    herstelEisNl:
      'Breng de oorzaken en het interactieve foutcodeblok (<code>{diagnostic.code}</code>) onder in het venster «Waarom dit gebeurde» achter de ronde knop (i) met volledige sluier van 100%×100%, kopieerknop en uitklapbare uitleg «Meer details».',
  },
  {
    id: 'GOOG-3',
    schermafdruk: 'Screenshot_20261125_125840_com.android.chrome.jpg',
    titelUk: 'Відповідь для користувача: серверний код STATE_EXPIRED не розпізнається в callbackUitleg/failureCopy і підміняється загальною заглушкою',
    titelNl: 'Antwoord voor de gebruiker: servercode STATE_EXPIRED wordt niet herkend in callbackUitleg/failureCopy en valt terug op een algemene fouttekst',
    doelBestanden: ['src/EigenaarIdentiteitTerug.tsx', 'backend/index.ts'],
    oorzaakUk:
      'ownerGoogleCallbackPost повертає STATE_EXPIRED, STATE_NOT_FOUND, TIMEOUT, TRANSACTION_NOT_FOUND, TRANSACTION_NOT_ATTACHED, STATE_TRANSACTION_MISMATCH, але failureCopy та callbackUitleg раніше перевіряли лише GOOGLE_SUITE_STATE_EXPIRED і OWNER_OAUTH_EXPIRED.',
    oorzaakNl:
      'ownerGoogleCallbackPost geeft STATE_EXPIRED, STATE_NOT_FOUND, TIMEOUT, TRANSACTION_NOT_FOUND, TRANSACTION_NOT_ATTACHED en STATE_TRANSACTION_MISMATCH terug, maar failureCopy en callbackUitleg controleerden eerder alleen GOOGLE_SUITE_STATE_EXPIRED en OWNER_OAUTH_EXPIRED.',
    herstelEisUk:
      'Додати в callbackUitleg та failureCopy точні двомовні пояснення для STATE_EXPIRED, STATE_NOT_FOUND, TIMEOUT, TRANSACTION_NOT_FOUND, TRANSACTION_NOT_ATTACHED, STATE_TRANSACTION_MISMATCH окремо для входу в «Мій простір» і окремо для підключення пошти.',
    herstelEisNl:
      'Voeg in callbackUitleg en failureCopy nauwkeurige tweetalige verklaringen toe voor STATE_EXPIRED, STATE_NOT_FOUND, TIMEOUT, TRANSACTION_NOT_FOUND, TRANSACTION_NOT_ATTACHED en STATE_TRANSACTION_MISMATCH, afzonderlijk voor aanmelden bij Mijn Ruimte en voor e-mailkoppeling.',
  },
  {
    id: 'GOOG-4',
    schermafdruk: 'Screenshot_20261125_125840_com.android.chrome.jpg',
    titelUk: 'Починання подальших дій із причиною: втрата returnTo при STATE_EXPIRED на сервері та відсутність передачі ?aanmeld_fout і кнопки повторного входу',
    titelNl: 'Vervolgstappen met oorzaak: verlies van returnTo bij STATE_EXPIRED op de server en ontbreken van ?aanmeld_fout-overdracht en knop om opnieuw aan te melden',
    doelBestanden: ['backend/index.ts', 'src/EigenaarIdentiteitTerug.tsx', 'src/weigeringen.ts'],
    oorzaakUk:
      'При STATE_EXPIRED сервер повертав порожній sourceOrigin і не передавав returnTo з транзакції OwnerTx, а кнопка повернення не передавала ?aanmeld_fout=<КОД> на сторінку входу.',
    oorzaakNl:
      'Bij STATE_EXPIRED gaf de server een lege sourceOrigin terug zonder returnTo uit OwnerTx en gaf de terugkeeractie geen ?aanmeld_fout=<CODE> door naar de aanmeldpagina.',
    herstelEisUk:
      'Відновлювати returnTo та sourceOrigin із транзакції OwnerTx навіть при STATE_EXPIRED, додати на сторінці повернення головну дію повторного входу з передачею причини (?aanmeld_fout) та додати відповідні коди до словника AANMELDEN у src/weigeringen.ts.',
    herstelEisNl:
      'Herstel returnTo en sourceOrigin uit de OwnerTx-transactie ook bij STATE_EXPIRED, bied op de terugkeerpagina een primaire actie om opnieuw aan te melden met oorzaakoverdracht (?aanmeld_fout) en voeg de codes toe aan AANMELDEN in src/weigeringen.ts.',
  },
] as const;

export interface GoogleTerugkeerHerstelStatus {
  readonly id: GoogleTerugkeerGebrekContract['id'];
  readonly hersteld: boolean;
  readonly detail: string;
}

export function evalueerVierGoogleTerugkeerGebrekenHerstel(rootDir = process.cwd()): readonly GoogleTerugkeerHerstelStatus[] {
  const terugPad = join(rootDir, 'src/EigenaarIdentiteitTerug.tsx');
  const kaartCssPad = join(rootDir, 'src/google-terugkeer-kaart.css');
  const plaatsingPad = join(rootDir, 'scripts/plaatsing-vaste-elementen.json');
  const backendPad = join(rootDir, 'backend/index.ts');
  const weigeringenPad = join(rootDir, 'src/weigeringen.ts');

  const terugTekst = existsSync(terugPad) ? readFileSync(terugPad, 'utf8') : '';
  const kaartCss = existsSync(kaartCssPad) ? readFileSync(kaartCssPad, 'utf8') : '';
  const plaatsingTekst = existsSync(plaatsingPad) ? readFileSync(plaatsingPad, 'utf8') : '';
  const backendTekst = existsSync(backendPad) ? readFileSync(backendPad, 'utf8') : '';
  const weigeringenTekst = existsSync(weigeringenPad) ? readFileSync(weigeringenPad, 'utf8') : '';

  const goog1Hersteld =
    terugTekst.includes('data-google-terug-kaart') &&
    terugTekst.includes("className='mr-google-terug-info-knop is-icoon'") &&
    kaartCss.includes('width: min(100%, 388px);') &&
    kaartCss.includes('grid-template-columns: minmax(0, 1fr);') &&
    kaartCss.includes('grid-auto-rows: 1fr;') &&
    kaartCss.includes('.mr-google-terug-scherm .mr-google-terug-kaart .mr-google-terug-titelrij button.mr-google-terug-info-knop') &&
    kaartCss.includes('min-height: 44px;') &&
    !kaartCss.includes('!important') &&
    !kaartCss.toLowerCase().includes('#0f9488') &&
    kaartCss.includes('html.theme-plum-dark');

  const goog2Hersteld =
    plaatsingTekst.includes('"src/google-terugkeer-kaart.css :: .mr-google-terug-sluier"') &&
    terugTekst.includes('<code>{diagnostic.code}</code>') &&
    terugTekst.includes('data-google-foutcode-kopieer') &&
    terugTekst.includes('bladRef') &&
    /<div[\s\S]*?className='mr-google-terug-blad'[\s\S]*?role='dialog'[\s\S]*?aria-modal='true'/.test(terugTekst) &&
    !/<div[\s\S]*?className='mr-google-terug-sluier'[^>]*role='dialog'/.test(terugTekst) &&
    kaartCss.includes('max-width: none;') &&
    kaartCss.includes('max-height: none;');

  const goog3Hersteld =
    terugTekst.includes("'STATE_EXPIRED'") &&
    terugTekst.includes("'STATE_NOT_FOUND'") &&
    terugTekst.includes("'TIMEOUT'") &&
    terugTekst.includes("code==='ACCESS_DENIED'") &&
    !terugTekst.includes('Статус HTTP') &&
    !terugTekst.includes('статусом HTTP');

  const goog4Hersteld =
    weigeringenTekst.includes('STATE_EXPIRED') &&
    weigeringenTekst.includes('ACCESS_DENIED') &&
    terugTekst.includes('!url.username&&!url.password') &&
    terugTekst.includes('aanmeld_fout') &&
    backendTekst.includes('STATE_EXPIRED');

  return [
    {
      id: 'GOOG-1',
      hersteld: goog1Hersteld,
      detail: goog1Hersteld
        ? 'Сторінка повернення id.tarasevych.com оформлена як компактна картка 388 px із колом (i) 32×32 px та рівновисокими кнопками 44 px на tokens.css'
        : 'Очікує на виправлення: потрібна компактна картка 388 px, коло (i) 32×32 px з вагою (0,4,1) та рівновисокі кнопки 44 px на tokens.css',
    },
    {
      id: 'GOOG-2',
      hersteld: goog2Hersteld,
      detail: goog2Hersteld
        ? 'Спливне вікно за (i) має повнорозмірну завісу 100%×100%, role=dialog на аркуші, <code>{diagnostic.code}</code>, копіювання й блок «Докладно»'
        : 'Очікує на виправлення: потрібні реєстрація завіси, role=dialog на аркуші та безпечний вивід <code>{diagnostic.code}</code>',
    },
    {
      id: 'GOOG-3',
      hersteld: goog3Hersteld,
      detail: goog3Hersteld
        ? 'Серверні коди STATE_EXPIRED, STATE_NOT_FOUND, TIMEOUT і ACCESS_DENIED розпізнаються на клієнті з точним двомовним поясненням без кальок'
        : 'Очікує на виправлення: STATE_EXPIRED або мовні формулювання потребують уточнення у callbackUitleg/failureCopy',
    },
    {
      id: 'GOOG-4',
      hersteld: goog4Hersteld,
      detail: goog4Hersteld
        ? 'Повернення передає безпечний returnTo та причину (?aanmeld_fout) для негайного продовження входу'
        : 'Очікує на виправлення: втрачається returnTo при STATE_EXPIRED і причина не передається на сторінку входу',
    },
  ];
}

export async function main(): Promise<number> {
  const rootDir = process.cwd();
  let geslaagd = 0;
  let gefaald = 0;

  const controleer = (naam: string, voorwaarde: boolean, detail = '') => {
    if (voorwaarde) {
      geslaagd++;
      console.log(`OK   ${naam}`);
    } else {
      gefaald++;
      console.error(`FOUT ${naam}${detail ? ` — ${detail}` : ''}`);
    }
  };

  controleer(
    'реєстр містить рівно 4 перевірочні контракти сторінки повернення Google (GOOG-1..GOOG-4)',
    VIER_GOOGLE_TERUGKEER_GEBREKEN_CONTRACTEN.length === 4 &&
      VIER_GOOGLE_TERUGKEER_GEBREKEN_CONTRACTEN.map((c) => c.id).join(',') === 'GOOG-1,GOOG-2,GOOG-3,GOOG-4',
  );

  for (const contract of VIER_GOOGLE_TERUGKEER_GEBREKEN_CONTRACTEN) {
    const alleBestandenAanwezig = contract.doelBestanden.every((rel) => existsSync(join(rootDir, rel)));
    controleer(
      `${contract.id}: усі цільові файли існують у сховищі (${contract.doelBestanden.join(', ')})`,
      alleBestandenAanwezig,
    );
    controleer(
      `${contract.id}: двомовні описи (uk / nl) та прив’язка до знімка екрана заповнені без заборонених символів`,
      contract.titelUk.length > 10 &&
        contract.titelNl.length > 10 &&
        contract.schermafdruk === 'Screenshot_20261125_125840_com.android.chrome.jpg' &&
        !VERBODEN_TEKENREEKS.test(contract.titelUk + contract.oorzaakUk + contract.herstelEisUk),
    );
  }

  const terugInhoud = readFileSync(join(rootDir, 'src/EigenaarIdentiteitTerug.tsx'), 'utf8');
  const kaartCssInhoud = readFileSync(join(rootDir, 'src/google-terugkeer-kaart.css'), 'utf8');
  const plaatsingInhoud = readFileSync(join(rootDir, 'scripts/plaatsing-vaste-elementen.json'), 'utf8');
  const backendInhoud = readFileSync(join(rootDir, 'backend/index.ts'), 'utf8');
  const weigeringenInhoud = readFileSync(join(rootDir, 'src/weigeringen.ts'), 'utf8');

  controleer(
    'GOOG-1..GOOG-3: EigenaarIdentiteitTerug.tsx містить OwnerIdentityCallback, callbackUitleg і failureCopy',
    terugInhoud.includes('export default function OwnerIdentityCallback') &&
      terugInhoud.includes('callbackUitleg') &&
      terugInhoud.includes('failureCopy'),
  );

  controleer(
    'D-1..D-2: завіса зареєстрована у plaatsing-vaste-elementen.json, а діагностичний блок містить <code>{diagnostic.code}</code>',
    plaatsingInhoud.includes('"src/google-terugkeer-kaart.css :: .mr-google-terug-sluier"') &&
      terugInhoud.includes('<code>{diagnostic.code}</code>') &&
      (kaartCssInhoud.match(/position:\s*fixed/g) || []).length === 1,
  );

  controleer(
    'D-3..D-4: кнопка (i) має .is-icoon та вагу селектора (0,4,1) 32×32 px (inset: -6px), а role=dialog стоїть на .mr-google-terug-blad при завісі 100%×100%',
    terugInhoud.includes("className='mr-google-terug-info-knop is-icoon'") &&
      terugInhoud.includes("className='mr-google-terug-blad-sluit is-icoon'") &&
      terugInhoud.includes("className='mr-google-terug-kopieer-icoon is-icoon'") &&
      kaartCssInhoud.includes('.mr-google-terug-scherm .mr-google-terug-kaart .mr-google-terug-titelrij button.mr-google-terug-info-knop') &&
      kaartCssInhoud.includes('inset: -6px;') &&
      kaartCssInhoud.includes('max-width: none;') &&
      kaartCssInhoud.includes('max-height: none;') &&
      /<div[\s\S]*?className='mr-google-terug-blad'[\s\S]*?role='dialog'[\s\S]*?aria-modal='true'/.test(terugInhoud),
  );

  controleer(
    'D-5..D-6: обидві кнопки дій мають єдину min-height: 44px та grid-auto-rows: 1fr на tokens.css (без !important і без --surface-2), підтримані прокручування, фокус, мова документа і prefers-reduced-motion',
    !kaartCssInhoud.includes('!important') &&
      !kaartCssInhoud.includes('--surface-2') &&
      !kaartCssInhoud.includes('min-height: 48px') &&
      !kaartCssInhoud.includes('min-height: 46px') &&
      kaartCssInhoud.includes('overflow-y: auto;') &&
      kaartCssInhoud.includes('grid-template-columns: minmax(0, 1fr);') &&
      kaartCssInhoud.includes('grid-auto-rows: 1fr;') &&
      kaartCssInhoud.includes('@media (max-width: 359px)') &&
      kaartCssInhoud.includes('place-items: safe center;') &&
      kaartCssInhoud.includes('@media (prefers-reduced-motion: reduce)') &&
      terugInhoud.includes('document.documentElement.lang') &&
      terugInhoud.includes("data.locale==='nl'||data.locale==='uk'") &&
      terugInhoud.includes('infoKnopRef') &&
      terugInhoud.includes('sluitKnopRef'),
  );

  controleer(
    'U2-2..U2-6: safeBack блокує !url.username&&!url.password, failureCopy перевіряє нормалізовані коди верхнього регістру, а діалог (i) утримує фокус Tab/Shift+Tab за участю summary',
    terugInhoud.includes('!url.username&&!url.password') &&
      terugInhoud.includes("code==='ACCESS_DENIED'") &&
      terugInhoud.includes("code==='EXPIRED'") &&
      terugInhoud.includes("code==='INVALID_STATE'||code==='STATE_MISMATCH'") &&
      terugInhoud.includes('bladRef') &&
      terugInhoud.includes("e.key!=='Tab'") &&
      terugInhoud.includes('summary, input:not([disabled])') &&
      terugInhoud.includes('redenBladPunt(locale,code,retrySec,isSuite)'),
  );

  controleer(
    'GOOG-3..GOOG-4: backend/index.ts та src/weigeringen.ts містять ownerGoogleCallbackPost, STATE_EXPIRED, ACCESS_DENIED і aanmeldWeigering',
    backendInhoud.includes('ownerGoogleCallbackPost') &&
      backendInhoud.includes('STATE_EXPIRED') &&
      weigeringenInhoud.includes('ACCESS_DENIED') &&
      weigeringenInhoud.includes('export function aanmeldWeigering'),
  );

  const statussen = evalueerVierGoogleTerugkeerGebrekenHerstel(rootDir);
  controleer(
    'функція оцінювання стану виправлення evalueerVierGoogleTerugkeerGebrekenHerstel повертає звіти для всіх 4 пунктів',
    statussen.length === 4 && statussen.every((s) => typeof s.hersteld === 'boolean' && s.detail.length > 0),
  );
  for (const s of statussen) {
    controleer(`${s.id}: виправлення впроваджено (${s.detail})`, s.hersteld === true, s.detail);
  }

  const { aanmeldWeigering } = await import('../../src/weigeringen');
  for (const code of ['STATE_EXPIRED', 'STATE_NOT_FOUND', 'TIMEOUT', 'TRANSACTION_NOT_FOUND', 'STATE_TRANSACTION_MISMATCH', 'ACCESS_DENIED']) {
    const paar = aanmeldWeigering({ message: code });
    controleer(
      `GOOG-4: aanmeldWeigering('${code}') повертає двомовну пару [uk, nl] без сирого коду`,
      Array.isArray(paar) && paar[0].length > 20 && paar[1].length > 20 && !VERBODEN_TEKENREEKS.test(paar[0]),
    );
  }

  const g = globalThis as unknown as Record<string, unknown>;
  const opslag = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: (i: number) => [...m.keys()][i] ?? null,
      get length() {
        return m.size;
      },
    };
  };
  const neppe: Record<string, unknown> = {
    window: g,
    localStorage: opslag(),
    sessionStorage: opslag(),
    navigator: { language: 'uk-UA' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
    location: {
      href: 'https://id.tarasevych.com/',
      hostname: 'id.tarasevych.com',
      origin: 'https://id.tarasevych.com',
      host: 'id.tarasevych.com',
      pathname: '/',
      search: '',
      hash: '',
      protocol: 'https:',
    },
    document: {
      addEventListener() {},
      removeEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({ style: {}, dataset: {}, setAttribute() {}, getAttribute: () => null, appendChild() {}, remove() {}, classList: { add() {}, remove() {} } }),
      documentElement: { classList: { add() {}, remove() {}, contains: () => false }, dataset: {}, style: {}, lang: 'uk' },
      head: { appendChild() {} },
      body: { appendChild() {} },
      cookie: '',
      visibilityState: 'visible',
      referrer: '',
    },
  };
  const bewaard = new Map<string, PropertyDescriptor | undefined>();
  for (const k of Object.keys(neppe)) {
    bewaard.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, { value: neppe[k], configurable: true, writable: true });
  }
  try {
    new Function(readFileSync(join(rootDir, 'public/canonical-service.js'), 'utf8'))();
    const { failureCopy, callbackUitleg } = await import('../../src/EigenaarIdentiteitTerug');
    const ukAanmeld = callbackUitleg('uk', 'STATE_EXPIRED', 0, false);
    const nlAanmeld = callbackUitleg('nl', 'STATE_EXPIRED', 0, false);
    const ukSuite = failureCopy('uk', 'STATE_EXPIRED', true);
    const nlSuite = failureCopy('nl', 'STATE_EXPIRED', true);
    const ukDeniedUpper = failureCopy('uk', 'ACCESS_DENIED', false);
    const nlDeniedUpper = failureCopy('nl', 'ACCESS_DENIED', false);
    const ukSuiteFallback = failureCopy('uk', 'UNKNOWN_SUITE_CODE', true);
    const nlSuiteFallback = failureCopy('nl', 'UNKNOWN_SUITE_CODE', true);
    controleer(
      'GOOG-3: callbackUitleg і failureCopy повертають окремі змістовні тексти uk/nl для входу (!suiteState), підключення (suiteState) та нормалізованого ACCESS_DENIED',
      ukAanmeld.includes('Обліковий запис у безпеці') &&
        !ukAanmeld.includes('Пошта →') &&
        nlAanmeld.includes('Uw account is veilig') &&
        ukSuite.includes('Пошта → Облікові записи') &&
        nlSuite.includes('E-mail → Accounts') &&
        ukDeniedUpper.includes('Доступ Google не надано') &&
        nlDeniedUpper.includes('Google-toegang is niet verleend') &&
        ukSuiteFallback.includes('підключення Google') &&
        nlSuiteFallback.includes('Google-koppeling'),
    );
  } finally {
    for (const [k, d] of bewaard) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete g[k];
    }
    delete g.__TSV_CANONICAL_SERVICE__;
  }

  const ukDocPad = join(rootDir, 'docs/identiteit/ВИПРОБУВАННЯ-СТОРИНКИ-ПОВЕРНЕННЯ-GOOGLE-HERSTEL-001.uk.md');
  const nlDocPad = join(rootDir, 'docs/identiteit/PROEVEN-GOOGLE-TERUGKEERPAGINA-HERSTEL-001.nl.md');
  controleer(
    'парні статті 4 випробувань сторінки повернення Google (uk / nl) існують у docs/identiteit/ і посилаються одна на одну',
    existsSync(ukDocPad) &&
      existsSync(nlDocPad) &&
      readFileSync(ukDocPad, 'utf8').includes('PROEVEN-GOOGLE-TERUGKEERPAGINA-HERSTEL-001.nl.md') &&
      readFileSync(nlDocPad, 'utf8').includes('ВИПРОБУВАННЯ-СТОРИНКИ-ПОВЕРНЕННЯ-GOOGLE-HERSTEL-001.uk.md'),
  );

  console.log(`\n${geslaagd}/${geslaagd + gefaald} geslaagd (herstel-001-google-terugkeer-staat-verlopen)`);
  return gefaald === 0 ? 0 : 1;
}
