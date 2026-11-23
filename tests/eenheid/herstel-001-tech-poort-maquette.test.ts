// HERSTEL-001 (пункт 1): регресійне випробування адаптивної розкладки захищеної технічної брами TechPoort у системі «Макет» і базових темах.
// Перевіряє дворядкову сітку .mq-tech-poort-stil-kern, перенесення прямого нащадка .tech-poort-stil-acties на grid-column: 1 / -1,
// відсутність пастки вкладеного grid-column на кнопці, незмінний розмір іконки щита (flex: none), сенсорну висоту >= 44px у студії,
// класиці й кольоровій темі та охайне перенесення довгих українських і нідерландських написів на вузьких екранах (<= 560px).
// Regressietest voor de technische poort TechPoort op smalle en brede schermen in studio-, klassieke en standaardopmaak (HERSTEL-001).

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { build } from 'esbuild';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const GEDEELDE_OPSLAG_SLEUTEL = 'tsv-ecosystem-presentation-v2';
const RUIMTES_SLEUTEL = 'mr-vlag:tech-ruimtes-v2';

function maakNepOmgeving() {
  const g = globalThis as Record<string, unknown>;
  const vorige = new Map(
    ['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history'].map((sleutel) => [
      sleutel,
      Object.getOwnPropertyDescriptor(g, sleutel),
    ]),
  );
  const maakOpslag = () => {
    const kaart = new Map<string, string>();
    return {
      getItem: (k: string) => kaart.get(k) ?? null,
      setItem: (k: string, v: string) => { kaart.set(k, String(v)); },
      removeItem: (k: string) => { kaart.delete(k); },
      clear: () => kaart.clear(),
      key: () => null,
      get length() { return kaart.size; },
    };
  };

  const local = maakOpslag();
  const session = maakOpslag();
  const klassen = new Set<string>();
  const dataset: Record<string, string> = {};
  const adres = new URL('https://admin.tarasevych.com/sso#telegram-beheer');

  const doc = {
    hidden: false,
    visibilityState: 'visible',
    title: '',
    cookie: '',
    head: { appendChild: (x: unknown) => x },
    body: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ getContext: () => null, dataset: {}, style: {} }),
    documentElement: {
      lang: 'uk',
      dataset,
      style: { setProperty: () => undefined },
      classList: {
        contains: (naam: string) => klassen.has(naam),
        add: (...namen: string[]) => namen.forEach((n) => klassen.add(n)),
        remove: (...namen: string[]) => namen.forEach((n) => klassen.delete(n)),
      },
    },
  };

  g.document = doc;
  g.location = {
    href: adres.href,
    origin: adres.origin,
    host: adres.host,
    hostname: adres.hostname,
    pathname: adres.pathname,
    search: adres.search,
    hash: adres.hash,
    protocol: adres.protocol,
    assign: () => undefined,
    replace: () => undefined,
    reload: () => undefined,
  };
  g.localStorage = local;
  g.sessionStorage = session;
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.window = Object.assign(g, {
    name: '',
    localStorage: local,
    sessionStorage: session,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    postMessage: () => undefined,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (f: () => void) => setTimeout(f, 0),
  });

  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), {
    window: g,
    location: g.location,
    document: doc,
    addEventListener: () => undefined,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    JSON,
    URLSearchParams,
    URL,
  });

  return {
    stelIn: (palet: 'kleur' | 'maquette' | 'klassiek-wit' | 'klassiek-zwart', v2: boolean) => {
      local.clear();
      session.clear();
      klassen.clear();
      for (const k of Object.keys(dataset)) delete dataset[k];

      const modus = palet === 'klassiek-wit' ? 'light' : 'dark';
      const opslagWaarde = {
        versie: 3,
        revisie: 1,
        accountPerDienst: {},
        accounts: {},
        ruimtes: { 'anon|gebruiker': { versie: 1, modus, palet, op: 1 } },
      };
      session.setItem(GEDEELDE_OPSLAG_SLEUTEL, encodeURIComponent(JSON.stringify(opslagWaarde)));
      session.setItem(RUIMTES_SLEUTEL, v2 ? '1' : '0');

      klassen.add(`palet-${palet}`);
      if (palet === 'klassiek-wit' || palet === 'klassiek-zwart') {
        klassen.add('palet-maquette');
        dataset.maquetteStijl = 'klassiek';
      } else if (palet === 'maquette') {
        dataset.maquetteStijl = 'studio';
      }
    },
    ruimOp: () => {
      for (const [sleutel, beschr] of vorige) {
        if (beschr) Object.defineProperty(g, sleutel, beschr);
        else delete g[sleutel];
      }
      delete g.__TSV_CANONICAL_SERVICE__;
    },
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('herstel-001-tech-poort-maquette');

  const poortTsx = readFileSync('src/tech/TechPoort.tsx', 'utf8');
  const maqCssBron = readFileSync('src/tech/tech-maquette.css', 'utf8');
  const techCssBron = readFileSync('src/tech/tech.css', 'utf8');
  const zelfBron = readFileSync('tests/eenheid/herstel-001-tech-poort-maquette.test.ts', 'utf8');

  const maqRegels = leesCss(maqCssBron);
  const techRegels = leesCss(techCssBron);

  const mobiel360 = { breedte: 360, hoogte: 800, pointer: 'coarse' as const, hover: 'none' as const };
  const tablet768 = { breedte: 768, hoogte: 1024, pointer: 'coarse' as const, hover: 'none' as const };
  const midden900 = { breedte: 900, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const bureaublad1280 = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };

  // 1. Перевірка фактичної будови DOM тихої брами у TechPoort: рівно три прямі дочірні вузли в .mq-tech-poort-stil-kern.
  const gebundeld = await build({
    entryPoints: ['src/tech/TechPoort.tsx'],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    loader: { '.css': 'empty' },
  });
  const poortCode = gebundeld.outputFiles[0]?.text ?? '';
  const lokaleRequire = createRequire(import.meta.url);
  const omg = maakNepOmgeving();

  try {
    for (const palet of ['maquette', 'klassiek-wit', 'klassiek-zwart'] as const) {
      for (const lang of ['uk', 'nl'] as const) {
        omg.stelIn(palet, true);
        const mod: { exports: { default?: (p: { lang: 'uk' | 'nl'; onAccount: () => void; heeftProfiel?: boolean }) => ReturnType<typeof createElement> } } = { exports: {} };
        new Function('require', 'module', 'exports', poortCode)(lokaleRequire, mod, mod.exports);
        const html = renderToString(createElement(mod.exports.default!, { lang, onAccount: () => undefined, heeftProfiel: true }));
        check(
          `DOM тихої брами (${palet}, ${lang}): .mq-tech-poort-stil-kern містить медальйон, .mq-tech-poort-stil-tekst і групу дій .tech-poort-stil-acties з обома кнопками`,
          /<div class="mq-tech-poort-stil-kern"><span class="mq-tech-poort-medaillon"[\s\S]*?<\/span><div class="mq-tech-poort-stil-tekst"><p>[\s\S]*?<\/p><\/div><div class="tech-poort-stil-acties"><button[^>]*class="tech-poort-naar"[\s\S]*?<\/button><button[^>]*class="tech-poort-account"[\s\S]*?<\/button><\/div><\/div>/.test(html),
        );
      }
    }
  } finally {
    omg.ruimOp();
  }

  // 2. Дворядкова сітка .mq-tech-poort-stil-kern і grid-column: 1 / -1 саме на прямому нащадку .tech-poort-stil-acties на всіх ширинах.
  const kernSel = 'html.palet-maquette .mq-tech-poort-stil-kern';
  const actiesSel = 'html.palet-maquette .mq-tech-poort-stil-kern>.tech-poort-stil-acties';
  const tekstSel = 'html.palet-maquette .mq-tech-poort-stil-tekst';

  for (const [naam, profiel] of [
    ['360×800', mobiel360],
    ['768×1024', tablet768],
    ['900×800', midden900],
    ['1280×800', bureaublad1280],
  ] as const) {
    check(
      `сітка .mq-tech-poort-stil-kern на ${naam} має двоколонкову шапку auto minmax(0, 1fr), min-width: 0 на тексті та grid-column: 1 / -1 на прямому нащадку .tech-poort-stil-acties`,
      wint(maqRegels, kernSel, 'display', profiel)?.waarde === 'grid' &&
        wint(maqRegels, kernSel, 'grid-template-columns', profiel)?.waarde === 'auto minmax(0, 1fr)' &&
        wint(maqRegels, tekstSel, 'min-width', profiel)?.waarde === '0' &&
        wint(maqRegels, actiesSel, 'grid-column', profiel)?.waarde === '1 / -1',
    );
  }

  // 3. Відсутність пастки вкладеного grid-column на кнопках технічної брами.
  const genesteGridColumn = maqRegels.filter(
    (r) =>
      r.selectors.some((s) => /tech-poort.*button|tech-poort-(naar|account)/.test(s)) &&
      r.decls.some((d) => d.eig === 'grid-column'),
  );
  check(
    'жодна вкладена кнопка технічної брами у tech-maquette.css не містить помилкового grid-column (який раніше розпирав колонку auto й стискав текст по одній літері)',
    genesteGridColumn.length === 0,
    genesteGridColumn.map((r) => r.selectors.join(', ')).join(' | '),
  );

  // 4. Адаптивне перенесення слів і повна ширина обох кнопок на вузьких екранах (<= 560px) при збереженні однорядковості на широкому екрані.
  const naarSel = 'html.palet-maquette .tech-poort button.tech-poort-naar';
  const stilKnopSel = 'html.palet-maquette .tech-poort.tech-poort-stil .tech-poort-stil-acties>button';
  const volKnopSel = 'html.palet-maquette .tech-poort .tech-poort-knoppen button';
  const naarSvgSel = 'html.palet-maquette .tech-poort button.tech-poort-naar svg';

  check(
    'на 360×800 у tech-maquette.css кнопки тихої і повної брами переходять на повну ширину з white-space: normal, min-height: 44px, padding: 10px 16px, line-height: 1.3 і фіксованою іконкою svg (flex: none)',
    wint(maqRegels, actiesSel, 'width', mobiel360)?.waarde === '100%' &&
      wint(maqRegels, naarSel, 'white-space', mobiel360)?.waarde === 'normal' &&
      wint(maqRegels, naarSel, 'width', mobiel360)?.waarde === '100%' &&
      wint(maqRegels, naarSel, 'min-height', mobiel360)?.waarde === '44px' &&
      wint(maqRegels, naarSel, 'height', mobiel360)?.waarde === 'auto' &&
      wint(maqRegels, naarSel, 'padding', mobiel360)?.waarde === '10px 16px' &&
      wint(maqRegels, naarSel, 'line-height', mobiel360)?.waarde === '1.3' &&
      wint(maqRegels, naarSel, 'text-align', mobiel360)?.waarde === 'center' &&
      wint(maqRegels, stilKnopSel, 'width', mobiel360)?.waarde === '100%' &&
      wint(maqRegels, stilKnopSel, 'white-space', mobiel360)?.waarde === 'normal' &&
      wint(maqRegels, stilKnopSel, 'min-height', mobiel360)?.waarde === '44px' &&
      wint(maqRegels, volKnopSel, 'width', mobiel360)?.waarde === '100%' &&
      wint(maqRegels, volKnopSel, 'white-space', mobiel360)?.waarde === 'normal' &&
      wint(maqRegels, volKnopSel, 'min-height', mobiel360)?.waarde === '44px' &&
      wint(maqRegels, naarSvgSel, 'flex', mobiel360)?.waarde === 'none' &&
      wint(maqRegels, naarSel, 'white-space', bureaublad1280)?.waarde === 'nowrap',
  );

  // 5. Класичний підрежим макета та стандартна тема tech.css: висота кнопок >= 44px на сенсорних екранах і гнучке перенесення на <= 560px.
  const klassiekKnopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .tech-poort button';
  check(
    'у класичному підрежимі макета кнопки брами отримують min-height: 44px на екранах <= 768px зі збереженням настільної висоти 42px',
    wint(maqRegels, klassiekKnopSel, 'min-height', mobiel360)?.waarde === '44px' &&
      wint(maqRegels, klassiekKnopSel, 'min-height', tablet768)?.waarde === '44px' &&
      wint(maqRegels, klassiekKnopSel, 'min-height', bureaublad1280)?.waarde === '42px',
  );

  check(
    'у базовому tech.css кнопки .tech-poort-naar і .tech-poort-account мають min-height: 44px, flex: none на іконці та перенесення на повну ширину на екранах <= 560px',
    wint(techRegels, '.tech-poort .tech-poort-naar', 'min-height', bureaublad1280)?.waarde === '44px' &&
      wint(techRegels, '.tech-poort .tech-poort-account', 'min-height', bureaublad1280)?.waarde === '44px' &&
      wint(techRegels, '.tech-poort .tech-poort-naar', 'width', mobiel360)?.waarde === '100%' &&
      wint(techRegels, '.tech-poort .tech-poort-naar', 'white-space', mobiel360)?.waarde === 'normal' &&
      wint(techRegels, '.tech-poort .tech-poort-account', 'width', mobiel360)?.waarde === '100%' &&
      wint(techRegels, '.tech-poort-naar svg', 'flex', mobiel360)?.waarde === 'none',
  );

  // 6. Чистота стилів без !important у tech-maquette.css та дотримання мовного закону.
  const bestanden: readonly [string, string][] = [
    ['src/tech/TechPoort.tsx', poortTsx],
    ['src/tech/tech-maquette.css', maqCssBron],
    ['src/tech/tech.css', techCssBron],
    ['tests/eenheid/herstel-001-tech-poort-maquette.test.ts', zelfBron],
  ];
  const taalFouten = bestanden.filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud)).map(([pad]) => pad);
  check(
    'у tech-maquette.css немає жодного !important, а всі файли контуру відповідають Абсолютному мовному закону',
    !/!\s*important/i.test(maqCssBron) && taalFouten.length === 0,
    taalFouten.join(', '),
  );

  return einde();
}
