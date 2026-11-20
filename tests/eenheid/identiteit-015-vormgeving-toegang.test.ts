// IDENTITEIT-015 (приймання групи «vormgeving»): вади доступності «Макета», знайдені в справжньому Chromium
// (tests/e2e/identiteit-015-vormgeving.e2e.ts), і їхні виправлення.
//  1. Вікно «Налаштування навігації»: після закриття (Esc, «×», вибір положення) фокус повертається на кнопку, що його відкрила,
//     але лише якщо він був у вікні або загубився (<body>); клік деінде на сторінці фокус не перехоплює. Перевіряється СПРАВЖНІЙ
//     фрагмент згенерованого двигуна (src/identiteit/maquette/maquette-motor.ts) у vm з мінімальним документом.
//  2. Те саме вікно на широкому екрані не вище за видиму частину й прокручується саме (CSS поза @media).
//  3. Генератор двигуна містить правку (згенерований файл не правлено руками).
// Toegankelijkheid van de weergave «Ontwerp»: focus terug naar de opener van het navigatievenster, venster past in beeld.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { checker } from './hulp/nep-google';

type El = { id: string; hidden?: boolean; isConnected: boolean; kinderen: El[]; focus: () => void; contains: (x: unknown) => boolean };
function el(id: string, doc: { activeElement: unknown }, kinderen: El[] = []): El {
  const e: El = {
    id, isConnected: true, kinderen,
    focus: () => { doc.activeElement = e; },
    contains: (x) => x === e || kinderen.some((k) => k.contains(x)),
  };
  return e;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-vormgeving-toegang');
  const motor = readFileSync('src/identiteit/maquette/maquette-motor.ts', 'utf8');
  const generator = readFileSync('scripts/identiteit-maquette/motor-aanpassingen.mjs', 'utf8');
  const omlijsting = readFileSync('src/identiteit/maquette/maquette-omlijsting.css', 'utf8');

  // ---- 1. справжній фрагмент двигуна: від «const popover=…» до першого слухача кнопки ⚙
  const begin = motor.indexOf('  const popover=byId("navSettings");');
  const eind = motor.indexOf('  byId("railConfig").addEventListener', begin);
  const fragment = begin > 0 && eind > begin ? motor.slice(begin, eind) : '';
  check('фрагмент вікна навігації знайдено в двигуні', fragment.includes('function toggleNavSettings()') && fragment.includes('function closeNavSettings()'));
  const maakWereld = () => {
    const doc: { activeElement: unknown; body: El } = { activeElement: null, body: null as unknown as El };
    doc.body = el('body', doc);
    const kruis = el('closeNavSettings', doc), positie = el('pos-left', doc);
    const popover = el('navSettings', doc, [kruis, positie]); popover.hidden = true;
    const tandwiel = el('railConfig', doc), elders = el('kaart', doc);
    doc.activeElement = doc.body;
    let geplandInklappen = 0;
    const ctx: Record<string, unknown> = {
      document: doc, doc, byId: (id: string) => (id === 'navSettings' ? popover : null),
      isAutoRail: () => false, scheduleRailAutoCollapse: () => { geplandInklappen++; }, cancelRailAutoCollapse: () => undefined, applyRailCollapsed: () => undefined,
      body: { classList: { contains: () => false } },
    };
    runInNewContext(`${fragment}\nthis.toggle=toggleNavSettings;this.close=closeNavSettings;`, ctx);
    return { doc, popover, kruis, positie, tandwiel, elders, toggle: ctx.toggle as () => void, close: ctx.close as () => void, ingeklapt: () => geplandInklappen };
  };
  if (fragment) {
    // Esc: фокус лишився на ⚙ (відкрито клавіатурою), вікно закрито — фокус на ⚙
    let w = maakWereld();
    w.tandwiel.focus(); w.toggle();
    check('відкриття ⚙ показує вікно', w.popover.hidden === false);
    w.kruis.focus(); w.close();
    check('«×» (фокус у вікні) → вікно сховано, фокус повертається на ⚙', w.popover.hidden === true && w.doc.activeElement === w.tandwiel);
    // вибір положення: натиснута кнопка у вікні, вікно закривається — фокус на ⚙, а не на схованій кнопці
    w = maakWereld(); w.tandwiel.focus(); w.toggle(); w.positie.focus(); w.close();
    check('вибір положення закриває вікно — фокус на кнопці, що відкрила вікно, а не на схованій кнопці положення', w.doc.activeElement === w.tandwiel);
    // фокус загубився на <body>
    w = maakWereld(); w.tandwiel.focus(); w.toggle(); w.doc.activeElement = w.doc.body; w.close();
    check('фокус загубився (<body>) → повертається на ⚙', w.doc.activeElement === w.tandwiel);
    // клік деінде на сторінці: фокус на іншому елементі — не перехоплюємо
    w = maakWereld(); w.tandwiel.focus(); w.toggle(); w.elders.focus(); w.close();
    check('клік поза вікном (фокус на іншому елементі сторінки) — фокус не перехоплено', w.doc.activeElement === w.elders);
    // повторний toggle тією самою кнопкою закриває й лишає фокус на ній
    w = maakWereld(); w.tandwiel.focus(); w.toggle(); w.kruis.focus(); w.toggle();
    check('друге натискання ⚙ (toggle) закриває вікно й повертає фокус', w.popover.hidden === true && w.doc.activeElement === w.tandwiel);
    // закриття вже закритого вікна (перехід до розділу, клік деінде) фокус не чіпає
    w = maakWereld(); w.elders.focus(); w.close();
    check('closeNavSettings на закритому вікні фокус не чіпає', w.doc.activeElement === w.elders && w.popover.hidden === true);
    // кнопка-відкривач зникла з документа — без помилки, фокус лишається
    w = maakWereld(); w.tandwiel.focus(); w.toggle(); w.tandwiel.isConnected = false; w.kruis.focus(); w.close();
    check('відкривач зник із документа — без помилки, фокус не переноситься на від\'єднаний елемент', w.doc.activeElement === w.kruis);
  }

  // ---- 2. CSS: вікно поміщається в екран на всіх ширинах
  const zonderMedia = omlijsting.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, '');
  check('вікно «Налаштування навігації» — max-height за видимою частиною й власна прокрутка поза @media (широкі екрани)',
    /\.mr-mq\.mr-mq\.mr-mq\.mr-mq \.popover-panel\{max-height:calc\(100dvh - var\(--mq-boven,0px\) - var\(--mq-onder,0px\) - 38px\);overflow:auto;overscroll-behavior:contain\}/.test(zonderMedia));
  check('телефонне правило (знизу, ≤730) лишилося й переважає (вища специфічність .bp-max-730)', /\.mr-mq\.mr-mq\.mr-mq\.mr-mq\.bp-max-730 \.popover-panel\{max-height:calc\(100dvh - var\(--mq-site,0px\) - 97px\)/.test(omlijsting));

  // ---- 3. правка живе в генераторі, згенерований двигун їй відповідає
  check('правка фокуса — у генераторі (motor-aanpassingen.mjs), двигун згенеровано з нею', generator.includes('function focusNaarOpener(){') && motor.includes('function focusNaarOpener(){') && motor.includes('if(was)focusNaarOpener();'));

  // ---- 3б. системне «зменшити рух» перемагає власні переходи «Макета» з !important (0,10,0 у @media prefers-reduced-motion)
  {
    const css = readFileSync('src/thema/weergave-stijl.css', 'utf8');
    const mq = readFileSync('src/identiteit/maquette/maquette-stijlen.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const blok = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] || '';
    const regel = /:root:root (\.mr-mq){8} \*,[^{]*\{[^}]*animation-duration: \.01ms !important;[^}]*transition-duration: \.01ms !important;/.test(blok);
    // специфічність правил руху «Макета» з !important: класи/атрибути/псевдокласи без :where — має бути < 10
    const klassen = (sel: string) => (sel.replace(/:where\([^)]*\)/g, '').match(/\.[\w-]+|\[[^\]]+\]|:(?!:)(?!where|before|after|first-line|first-letter)[\w-]+/g) || []).length;
    const sterker: string[] = [];
    for (const m of mq.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(transition|animation)[^;]*!important/.test(m[2]) || /(transition|animation):\s*none\s*!important/.test(m[2])) continue;
      for (const sel of m[1].split(',')) if (klassen(sel) >= 10) sterker.push(sel.trim().slice(0, 120));
    }
    check('рух: системне «зменшити рух» (prefers-reduced-motion) — правило 0,10,0 для «Макета», сильніших правил руху в макеті немає', regel && sterker.length === 0, sterker.slice(0, 5).join(' | '));
  }

  // ---- 4. пошук розділу на id: адреса — канонічний нідерландський slug, як у меню й смузі розділів (не «/security»)
  const zoek = readFileSync('src/zoek/ZoekGlobaal.tsx', 'utf8');
  check('пошук розділів (id): маршрут — id розділу без «/» (routeUrl робить /<slug>), не англійська адреса', /route: \{ host: 'id', pad: tab\.id \}/.test(zoek) && !zoek.includes("pad: `/${tab.id}`"));
  const g = globalThis as Record<string, unknown>;
  const wasWindow = Object.getOwnPropertyDescriptor(g, 'window');
  try {
    const win: Record<string, unknown> = { addEventListener: () => undefined, removeEventListener: () => undefined };
    const loc = { href: 'https://id.tarasevych.com/personalisatie', origin: 'https://id.tarasevych.com', host: 'id.tarasevych.com', hostname: 'id.tarasevych.com', pathname: '/personalisatie', search: '', hash: '', protocol: 'https:' };
    const maakEl = (): Record<string, unknown> => ({ setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined, style: {}, dataset: {} });
    const doc = { cookie: '', title: '', addEventListener: () => undefined, documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined } }, head: { appendChild: () => undefined }, body: maakEl(), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl() };
    runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: win, location: loc, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
    Object.defineProperty(g, 'window', { value: win, configurable: true, writable: true });
    const { routeUrl } = await import('../../src/zoek/zoek-kern');
    const { IDENTITEIT_TABS } = await import('../../src/identiteit/identiteit-tabs');
    const paden = IDENTITEIT_TABS.map((t) => [t.id, new URL(routeUrl({ host: 'id', pad: t.id } as never, 'uk') || 'https://x/').pathname] as const);
    const slug = (win.__TSV_CANONICAL_SERVICE__ as { tabSlug: (id: string) => string }).tabSlug;
    const fout = paden.filter(([id, p]) => p !== `/${slug(id)}` || p === '/');
    check(`пошук розділів: 13 адрес — канонічні slug (security → ${paden.find(([id]) => id === 'security')?.[1]}, languages → ${paden.find(([id]) => id === 'languages')?.[1]})`, paden.length === 13 && fout.length === 0, JSON.stringify(fout));
  } catch (e) {
    check('пошук розділів: адреси (неочікувана помилка)', false, String((e as Error)?.message || e).slice(0, 300));
  } finally {
    if (wasWindow) Object.defineProperty(g, 'window', wasWindow); else delete g.window;
  }
  return einde();
}
