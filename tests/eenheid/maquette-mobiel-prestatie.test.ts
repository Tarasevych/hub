// GEMINI-003: модульна перевірка мобільної швидкодії режиму «Макет», захисту пошти,
// єдиного rAF-спостерігача перекривних шарів, лінивого завантаження важких панелей,
// прискореного попереднього з’єднання між піддоменами та мобільного CSS без розмиття тла.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { abonneerElementAttributen, abonneerOpenLaag } from '../../src/maquette-kern/laag-waarnemer';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('maquette-mobiel-prestatie');

  // 1. Жива поведінка спільного спостерігача abonneerOpenLaag: групування у rAF та безпечне від’єднання.
  const echteDoc = (globalThis as { document?: unknown }).document;
  const echteWin = (globalThis as { window?: unknown }).window;
  const echteMo = (globalThis as { MutationObserver?: unknown }).MutationObserver;
  const echteRaf = (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  const echteCancelRaf = (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;

  try {
    let zichtbaar = false;
    let rafQueue: FrameRequestCallback[] = [];
    let nextRafId = 1;
    let observerCallbacks: MutationCallback[] = [];
    let disconnected = 0;

    (globalThis as { document: unknown }).document = {
      body: { nodeName: 'BODY' },
      documentElement: { nodeName: 'HTML' },
      querySelector: (sel: string) => (sel === '.demo-modal' && zichtbaar ? {} : null),
    };
    (globalThis as { window: unknown }).window = {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    (globalThis as { MutationObserver: unknown }).MutationObserver = class {
      private cb: MutationCallback;
      constructor(cb: MutationCallback) {
        this.cb = cb;
        observerCallbacks.push(cb);
      }
      observe() { /* імітатор */ }
      disconnect() { disconnected += 1; }
    };
    (globalThis as { requestAnimationFrame: unknown }).requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return nextRafId++;
    };
    (globalThis as { cancelAnimationFrame: unknown }).cancelAnimationFrame = () => {
      rafQueue = [];
    };

    const wijzigingen: boolean[] = [];
    const unsub = abonneerOpenLaag('.demo-modal', (open) => wijzigingen.push(open), {
      wortel: 'beide',
      attributeFilter: ['class', 'open'],
    });
    check('abonneerOpenLaag викликає початковий стан одразу (false)', wijzigingen.length === 1 && wijzigingen[0] === false);

    // Імітуємо 3 мутації в одному кадрі до появи модального вікна: не має викликатися повторно без зміни стану.
    zichtbaar = true;
    observerCallbacks.forEach((cb) => cb([], {} as MutationObserver));
    observerCallbacks.forEach((cb) => cb([], {} as MutationObserver));
    observerCallbacks.forEach((cb) => cb([], {} as MutationObserver));
    check('три мутації в одному кадрі планують лише один requestAnimationFrame', rafQueue.length === 1);

    const frame = rafQueue.shift();
    frame?.(16);
    check('після виконання rAF надходить єдина зміна стану (true)', wijzigingen.length === 2 && wijzigingen[1] === true);

    // Повторна мутація без зміни результату не спричиняє зайвого setState.
    observerCallbacks.forEach((cb) => cb([], {} as MutationObserver));
    rafQueue.shift()?.(32);
    check('повторна перевірка без реальної зміни не викликає onChange', wijzigingen.length === 2);

    unsub();
    check('відписка відключає MutationObserver', disconnected === 1);

    // Жива поведінка abonneerElementAttributen: початковий синхронний виклик та групування мутацій атрибутів у rAF.
    let attrAantal = 0;
    const obsIndex = observerCallbacks.length;
    const stopAttr = abonneerElementAttributen({} as Element, ['class'], () => { attrAantal += 1; }, { meteen: true });
    observerCallbacks[obsIndex]([], {} as MutationObserver);
    observerCallbacks[obsIndex]([], {} as MutationObserver);
    const attrEenRaf = rafQueue.length === 1;
    rafQueue.shift()?.(48);
    stopAttr();
    check(
      'abonneerElementAttributen пакетує серію змін класу в один rAF і безпечно відписується',
      attrEenRaf && attrAantal === 2 && disconnected === 2,
    );
  } finally {
    if (echteDoc === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document: unknown }).document = echteDoc;
    if (echteWin === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = echteWin;
    if (echteMo === undefined) delete (globalThis as { MutationObserver?: unknown }).MutationObserver;
    else (globalThis as { MutationObserver: unknown }).MutationObserver = echteMo;
    if (echteRaf === undefined) delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    else (globalThis as { requestAnimationFrame: unknown }).requestAnimationFrame = echteRaf;
    if (echteCancelRaf === undefined) delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
    else (globalThis as { cancelAnimationFrame: unknown }).cancelAnimationFrame = echteCancelRaf;
  }

  // 2. Захист поштової сторінки від падіння за неповного або початкового bootstrap.
  const mailFunc = lees('src/MailFunctioneelWeergave.tsx');
  check(
    'MailFunctioneelWeergave захищено INITIAL_BOOTSTRAP та безпечним звертанням до notificationPreference та metrics',
    mailFunc.includes('const INITIAL_BOOTSTRAP:Bootstrap=')
      && mailFunc.includes('useState<Bootstrap>(INITIAL_BOOTSTRAP)')
      && mailFunc.includes("notificationPreference?.minimum??'action'")
      && mailFunc.includes('metrics?.focusViews??0')
      && mailFunc.includes('metrics?.taskConversions??0'),
  );

  // 3. Ліниве завантаження важких панелей макета, служб і сповіщень із Suspense.
  const idMq = lees('src/identiteit/maquette/IdentiteitMaquette.tsx');
  const app = lees('src/App.tsx');
  const cnc = lees('src/CanoniekMeldingencentrum.tsx');
  check(
    'IdentiteitMaquette завантажує шаблон, двигун і стилі ліниво через Promise.all і не тримає dangerouslySetInnerHTML',
    idMq.includes("import('./maquette-sjabloon')")
      && idMq.includes("import('./maquette-motor')")
      && idMq.includes("import('./maquette-stijlen.css')")
      && !idMq.includes('dangerouslySetInnerHTML')
      && idMq.includes('w.observe(document.body, { childList: true, subtree: false })'),
  );
  check(
    'App.tsx ліниво підвантажує UnifiedServiceApp у Suspense fallback={null}',
    /const UnifiedServiceApp\s*=\s*lazyZoek\(\(\)\s*=>\s*import\('\.\/VerenigdDienstApp'\)\)/.test(app)
      && app.includes('<Suspense fallback={null}><UnifiedServiceApp active/></Suspense>'),
  );
  check(
    'CanoniekMeldingencentrum.tsx ліниво підвантажує MeldingenV2, MeldingVoorkeurenPaneel і MeldingenPortaal у Suspense',
    cnc.includes("const MeldingenV2 = lazy(() => import('./meldingen/v2/MeldingenV2'))")
      && cnc.includes("const MeldingVoorkeurenPaneel = lazy(() => import('./meldingen/MeldingVoorkeurenPaneel'))")
      && cnc.includes("const MeldingenPortaal = lazy(() => import('./meldingen/ecosysteem/MeldingenPortaal'))")
      && (cnc.match(/<Suspense fallback=\{null\}>/g) || []).length >= 3,
  );

  // 4. Усі піддомени використовують єдиний спостерігач abonneerOpenLaag без власних некерованих MutationObserver.
  const onderdomeinen = [
    'src/App.tsx',
    'src/AIDienstWeergave.tsx',
    'src/ApiPlatformWeergave.tsx',
    'src/BeheerConsoleWeergave.tsx',
    'src/McpDienstWeergave.tsx',
    'src/GitHubWeergave.tsx',
    'src/AfstemmingWissel.tsx',
    'src/huis/HuisPagina.tsx',
    'src/cloud-vnext/CloudPagina.tsx',
    'src/CloudFunctioneelWeergave.tsx',
    'src/GoogleMailWerkruimte.tsx',
  ];
  const zonderAb = onderdomeinen.filter((p) => {
    const s = lees(p);
    return !s.includes('abonneerOpenLaag(') || s.includes('new MutationObserver(');
  });
  check('усі піддомени й пошта перейшли на спільний abonneerOpenLaag без локальних MutationObserver', zonderAb.length === 0, zonderAb.join(', '));

  // 5. Пакетування rAF і запам’ятовування меж замість повторних вимірювань компонування.
  const rail = lees('src/maquette-kern/MaquetteAnkerRail.tsx');
  const motor = lees('src/identiteit/maquette/maquette-motor.ts');
  const omlijsting = lees('src/CanoniekOmlijsting.tsx');
  const concepten = lees('src/concepten.ts');
  const voorladen = lees('src/zichtbaar-voorladen.ts');
  check(
    'MaquetteAnkerRail зберігає межі через WeakMap, пакетує ResizeObserver/scroll у rAF і захищає setPointerCapture',
    rail.includes('grenzenCacheRef = useRef(new WeakMap<HTMLElement, string>())')
      && rail.includes('if (grenzenCacheRef.current.get(el) === sleutel) return;')
      && rail.includes('setVoortgang((vorige) => (vorige === nieuw ? vorige : nieuw))')
      && /try\s*\{\s*e\.currentTarget\.setPointerCapture/.test(rail),
  );
  check(
    'maquette-motor запам’ятовує змінні та синхронізує оновлення меж і вкладок у requestAnimationFrame',
    motor.includes('vorMaten') && motor.includes('scheduleMaten') && motor.includes('schedulePillUpdate') && motor.includes('vorigeSyncKey'),
  );
  check(
    'CanoniekMeldingencentrum, concepten і zichtbaar-voorladen пакетують спостерігачі в rAF',
    cnc.includes('window.visualViewport?.addEventListener(\'resize\', update)')
      && (cnc.match(/requestAnimationFrame\(/g) || []).length >= 3
      && concepten.includes('requestAnimationFrame(verwerk)')
      && concepten.includes('cancelAnimationFrame(wachtRaf)')
      && voorladen.includes('requestAnimationFrame(flush)')
      && voorladen.includes('cancelAnimationFrame(mutRaf)'),
  );

  // 6. Прискорення навігації між піддоменами та дотику на смартфонах.
  const navSnel = lees('src/navigatie-snel.ts');
  const mainTsx = lees('src/main.tsx');
  check(
    'navigatie-snel допускає до 10 спекулятивних переходів і додає одноразовий preconnect у document.head',
    navSnel.includes('const MAX_VOORUIT = 10;')
      && navSnel.includes("pre.rel = 'preconnect'")
      && navSnel.includes('document.head.appendChild(pre)'),
  );
  const downStart = omlijsting.indexOf('const down=(event:TouchEvent)=>');
  const upStart = omlijsting.indexOf('const up=(event:TouchEvent)=>');
  const touchDownDeel = downStart >= 0 && upStart > downStart ? omlijsting.slice(downStart, upStart) : '';
  check(
    'CanoniekOmlijsting переносить важку перевірку змаху в touchend, прогріває перші 8 посилань на сенсорах і пакетує підказки',
    omlijsting.includes('if(el.scrollWidth<=el.clientWidth+4)continue')
      && touchDownDeel.length > 0
      && !touchDownDeel.includes('sideways(')
      && omlijsting.includes('if(dx>0&&!drawerOpen){')
      && omlijsting.includes('||sideways(target)||')
      && omlijsting.includes('slice(0,8)')
      && omlijsting.includes('requestAnimationFrame(zet)'),
  );
  check(
    'main.tsx відкладає registration.update() у requestIdleCallback за межами naActivering',
    (mainTsx.includes('registration.update()') || mainTsx.includes('registration?.update?.()')) && mainTsx.includes('requestIdleCallback') && (mainTsx.match(/createRoot\(/g) || []).length === 5,
  );

  // 7. Скасування важких backdrop-filter та перемикання плавної прокрутки на auto для смартфонів.
  const mqOmlijstingCss = lees('src/identiteit/maquette/maquette-omlijsting.css');
  const mqOppCss = lees('src/maquette-kern/maquette-oppervlakken.css');
  const mqAanmeldCss = lees('src/maquette-kern/maquette-aanmelden.css');
  check(
    'мобільні таблиці стилів вимикають backdrop-filter і scroll-behavior: smooth на малих екранах',
    mqOmlijstingCss.includes('@media(max-width:730px){html[data-identiteit-maquette=\'aan\'] .canonical-chrome .canonical-workspace{scroll-behavior:auto}')
      && mqOmlijstingCss.includes('backdrop-filter:none')
      && !mqOmlijstingCss.includes('backdrop-filter:none!important')
      && mqOppCss.includes('.mq-held-voet')
      && mqOppCss.includes('.mq-anker-rail.mq-anker-rail[data-mobiel-open="ja"]')
      && mqOppCss.includes('scroll-behavior: auto;')
      && mqAanmeldCss.includes('.gast-inhoud')
      && mqAanmeldCss.includes('backdrop-filter: none !important;'),
  );

  // 8. Абсолютний мовний закон: відсутність заборонених літер російської абетки у всіх змінених і нових файлах.
  const teControleren = [
    ...onderdomeinen,
    'src/MailFunctioneelWeergave.tsx',
    'src/identiteit/maquette/IdentiteitMaquette.tsx',
    'src/identiteit/maquette/maquette-motor.ts',
    'src/identiteit/maquette/maquette-omlijsting.css',
    'src/maquette-kern/laag-waarnemer.ts',
    'src/maquette-kern/MaquetteAnkerRail.tsx',
    'src/maquette-kern/index.ts',
    'src/maquette-kern/maquette-oppervlakken.css',
    'src/maquette-kern/maquette-aanmelden.css',
    'src/CanoniekMeldingencentrum.tsx',
    'src/CanoniekOmlijsting.tsx',
    'src/concepten.ts',
    'src/zichtbaar-voorladen.ts',
    'src/navigatie-snel.ts',
    'src/main.tsx',
    'src/sessies/vite-glob.d.ts',
    'tests/eenheid/maquette-mobiel-prestatie.test.ts',
  ];
  const verbodenCyr = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const foutenTaal = teControleren.filter((p) => verbodenCyr.test(lees(p)));
  check('усі змінені й нові файли чисті від заборонених літер російської абетки', foutenTaal.length === 0, foutenTaal.join(', '));

  return einde();
}
