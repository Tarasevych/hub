// KLASSIEK-009C (Хвиля 8В тем оформлення «Біла класика» та «Чорна класика»: захищена технічна брама TechPoort і наскрізний позаоболонковий контур #tech-laag / .tech-band):
// перевірка прибирання декоративної вітрини MaquetteKunst і класу mq-tech-poort-vol у класиці за рішенням A2 при збереженні їх у студійному maquette,
// серверного відмальовування renderToString для повного й тихого станів брами, відсікання світлого студійного блоку, матової смуги .tech-band без порушення --tech-band-h і data-pas,
// одноколонкової картки .tech-poort до 560px, вікон .venster:has(.tech-venster) із правим відступом шапки <= 20px, спливних панелей 16px, кутів 16px/11px/999px,
// суцільних первинних кнопок на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst), правил :not(#_mqk) без padding/gap, мобільного каскаду та мовної чистоти.
// Eenheidstest voor de klassieke beveiligde poort TechPoort en de doorlopende technische laag #tech-laag / .tech-band (KLASSIEK-009C).

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

function inhoudBuitenMediaBlokken(cssInhoud: string, eersteMediaIndex: number): string {
  if (eersteMediaIndex < 0) return 'GEEN_MEDIA';
  const staart = cssInhoud.slice(eersteMediaIndex);
  let diepte = 0;
  let inMedia = false;
  let buiten = '';
  let i = 0;
  while (i < staart.length) {
    if (!inMedia) {
      const rest = staart.slice(i);
      const treffer = rest.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*@media\s*\([^)]*\)\s*\{/);
      if (treffer) {
        inMedia = true;
        diepte = 1;
        i += treffer[0].length;
        continue;
      }
      buiten += staart[i];
      i += 1;
    } else {
      const teken = staart[i];
      if (teken === '{') diepte += 1;
      else if (teken === '}') {
        diepte -= 1;
        if (diepte === 0) inMedia = false;
      }
      i += 1;
    }
  }
  return buiten.replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

function relatieveHelderheid(hexKleur: string): number {
  const schoon = hexKleur.replace('#', '');
  const kanalen = [0, 2, 4].map((start) => {
    const deel = parseInt(schoon.slice(start, start + 2), 16) / 255;
    return deel <= 0.03928 ? deel / 12.92 : ((deel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * kanalen[0] + 0.7152 * kanalen[1] + 0.0722 * kanalen[2];
}

function contrastVerhouding(kleurA: string, kleurB: string): number {
  const helderA = relatieveHelderheid(kleurA);
  const helderB = relatieveHelderheid(kleurB);
  const lichtste = Math.max(helderA, helderB);
  const donkerste = Math.min(helderA, helderB);
  return (lichtste + 0.05) / (donkerste + 0.05);
}

function rechtseOpvullingPx(paddingWaarde: string): number {
  const delen = paddingWaarde.trim().split(/\s+/);
  const rechts = delen.length === 1 ? delen[0] : delen[1];
  const treffer = /^([\d.]+)px$/.exec(rechts ?? '');
  return treffer ? Number(treffer[1]) : NaN;
}

type NepOmgeving = {
  stelIn: (opties: { palet: 'kleur' | 'maquette' | 'klassiek-wit' | 'klassiek-zwart'; v2: boolean }) => void;
  ruimOp: () => void;
};

function maakNepBrowser(): NepOmgeving {
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
      setItem: (k: string, v: string) => {
        kaart.set(k, String(v));
      },
      removeItem: (k: string) => {
        kaart.delete(k);
      },
      clear: () => kaart.clear(),
      key: () => null,
      get length() {
        return kaart.size;
      },
    };
  };

  const local = maakOpslag();
  const session = maakOpslag();
  const klassen = new Set<string>();
  const dataset: Record<string, string> = {};
  const adres = new URL('https://admin.tarasevych.com/overzicht');

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
    stelIn: ({ palet, v2 }) => {
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
  const { check, einde } = checker('klassiek-009c-technische-laag');

  const poortTsx = readFileSync('src/tech/TechPoort.tsx', 'utf8');
  const techCss = readFileSync('src/tech/tech-maquette.css', 'utf8');
  const maquetteKlassiekCss = readFileSync('src/maquette-kern/maquette-klassiek.css', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-009c-technische-laag.test.ts', 'utf8');

  const cssZonderCommentaar = techCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const idxKlassiek = techCss.indexOf('9. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ');
  const idxEersteMedia = techCss.search(/@media\s*\(/);
  const idxMaxWidth = techCss.search(/@media\s*\(\s*max-width/);
  const klassiekPc =
    idxKlassiek > 0 && idxEersteMedia > idxKlassiek
      ? techCss.slice(idxKlassiek, idxEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';
  const regels = leesCss(techCss);

  // 1. Рішення A2 у коді TechPoort.tsx: виклик useIsKlassiekMaquette, умовні mq-tech-poort-vol та MaquetteKunst лише для некласичної студії.
  check(
    'TechPoort.tsx викликає useIsKlassiekMaquette() і додає mq-tech-poort-vol та вітрину MaquetteKunst винятково коли !isKlassiek зі збереженням усіх кнопок і data-tech-poort',
    poortTsx.includes('useIsKlassiekMaquette') &&
      poortTsx.includes('const isKlassiek = useIsKlassiekMaquette();') &&
      poortTsx.includes("className={isKlassiek ? 'tech-poort mq-tech-poort' : 'tech-poort mq-tech-poort mq-tech-poort-vol'}") &&
      /\{!isKlassiek\s*\?\s*\(\s*<div className='mq-tech-poort-kunst'/.test(poortTsx) &&
      poortTsx.includes("data-tech-poort='1'") &&
      poortTsx.includes("data-tech-poort='activeren'") &&
      poortTsx.includes("data-tech-poort='account'") &&
      poortTsx.includes("data-tech-poort='geen-profiel'") &&
      poortTsx.includes("data-tech-poort='naar-technisch'"),
  );

  // Збирання ізольованого модуля TechPoort для перевірки серверного renderToString в усіх комбінаціях палітр і станів.
  const gebundeld = await build({
    entryPoints: ['src/tech/TechPoort.tsx'],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    loader: { '.css': 'empty' },
  });
  const poortJsCode = gebundeld.outputFiles[0]?.text ?? '';
  const lokaleRequire = createRequire(import.meta.url);

  const omgeving = maakNepBrowser();
  const renderScenario = (opties: {
    palet: 'kleur' | 'maquette' | 'klassiek-wit' | 'klassiek-zwart';
    v2: boolean;
    heeftProfiel: boolean;
    lang: 'uk' | 'nl';
  }): string => {
    omgeving.stelIn({ palet: opties.palet, v2: opties.v2 });
    const modHouder: { exports: { default?: (p: { lang: 'uk' | 'nl'; onAccount: () => void; heeftProfiel?: boolean }) => ReturnType<typeof createElement> } } = {
      exports: {},
    };
    const uitvoerder = new Function('require', 'module', 'exports', poortJsCode);
    uitvoerder(lokaleRequire, modHouder, modHouder.exports);
    const Component = modHouder.exports.default!;
    return renderToString(createElement(Component, { lang: opties.lang, onAccount: () => undefined, heeftProfiel: opties.heeftProfiel }));
  };

  try {
    // 2. Серверний renderToString повного стану брами (v2 = false): студійний maquette має MaquetteKunst і mq-tech-poort-vol, класичні теми — ні.
    const studioVol = renderScenario({ palet: 'maquette', v2: false, heeftProfiel: true, lang: 'uk' });
    const witVol = renderScenario({ palet: 'klassiek-wit', v2: false, heeftProfiel: true, lang: 'uk' });
    const zwartZonder = renderScenario({ palet: 'klassiek-zwart', v2: false, heeftProfiel: false, lang: 'nl' });
    const kleurVol = renderScenario({ palet: 'kleur', v2: false, heeftProfiel: true, lang: 'uk' });

    check(
      'renderToString повного стану TechPoort зберігає MaquetteKunst і mq-tech-poort-vol у студійному maquette, але повністю вимикає їх у Білій класиці та Чорній класиці при збереженні заголовків і кнопок',
      studioVol.includes('mq-tech-poort-vol') &&
        studioVol.includes('mq-tech-poort-kunst') &&
        studioVol.includes('data-tech-poort="activeren"') &&
        witVol.includes('class="tech-poort mq-tech-poort"') &&
        !witVol.includes('mq-tech-poort-vol') &&
        !witVol.includes('mq-tech-poort-kunst') &&
        witVol.includes('<h1>Управління сайтом</h1>') &&
        witVol.includes('data-tech-poort="activeren"') &&
        witVol.includes('data-tech-poort="account"') &&
        zwartZonder.includes('class="tech-poort mq-tech-poort"') &&
        !zwartZonder.includes('mq-tech-poort-vol') &&
        !zwartZonder.includes('mq-tech-poort-kunst') &&
        zwartZonder.includes('<h1>Beheer van de site</h1>') &&
        zwartZonder.includes('data-tech-poort="geen-profiel"') &&
        !zwartZonder.includes('data-tech-poort="activeren"') &&
        zwartZonder.includes('data-tech-poort="account"') &&
        kleurVol.includes('class="tech-poort"') &&
        !kleurVol.includes('mq-tech-poort'),
    );

    // 3. Серверний renderToString тихої брами (v2 = true && heeftProfiel = true) в усіх палітрах.
    const studioStil = renderScenario({ palet: 'maquette', v2: true, heeftProfiel: true, lang: 'uk' });
    const witStil = renderScenario({ palet: 'klassiek-wit', v2: true, heeftProfiel: true, lang: 'uk' });
    const zwartStilNl = renderScenario({ palet: 'klassiek-zwart', v2: true, heeftProfiel: true, lang: 'nl' });
    const kleurStil = renderScenario({ palet: 'kleur', v2: true, heeftProfiel: true, lang: 'uk' });

    check(
      'renderToString тихого стану TechPoort (v2 && heeftProfiel) справно відмальовує tech-poort-stil та кнопку переходу в технічний простір в українській і нідерландській мовах без декоративних сцен',
      studioStil.includes('tech-poort tech-poort-stil mq-tech-poort') &&
        witStil.includes('tech-poort tech-poort-stil mq-tech-poort') &&
        witStil.includes('data-tech-poort-soort="stil"') &&
        witStil.includes('data-tech-poort="naar-technisch"') &&
        witStil.includes('Перейти в технічний простір') &&
        !witStil.includes('mq-tech-poort-kunst') &&
        zwartStilNl.includes('tech-poort tech-poort-stil mq-tech-poort') &&
        zwartStilNl.includes('Naar de technische ruimte') &&
        !zwartStilNl.includes('mq-tech-poort-kunst') &&
        kleurStil.includes('class="tech-poort tech-poort-stil"') &&
        kleurStil.includes('data-tech-poort="naar-technisch"'),
    );
  } finally {
    omgeving.ruimOp();
  }

  // 4. Відсікання студійного світлого блоку .theme-light / .theme-plum-light та 4 студійних правил flat-content через :not([data-maquette-stijl="klassiek"]).
  const lichtRegels = regels.filter((r) =>
    r.selectors.some((s) => s.includes('theme-light') || s.includes('theme-plum-light')),
  );
  const oudeFlatRegels = regels.filter((r) =>
    r.selectors.some((s) => s.includes(':not([data-mq-a])')),
  );
  check(
    'студійний світлий блок .theme-light / .theme-plum-light та старі правила flat-content у tech-maquette.css відсічені через :not([data-maquette-stijl="klassiek"]) на кожній гілці селекторів',
    lichtRegels.length === 1 &&
      lichtRegels[0].selectors.length === 2 &&
      lichtRegels[0].selectors.every((tak) => tak.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')) &&
      oudeFlatRegels.length === 4 &&
      oudeFlatRegels.every((r) =>
        r.selectors.every((tak) => tak.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 5. Похідні матові змінні на #tech-laag і всіх позаоболонкових елементах контуру.
  const varRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] #tech-laag'),
  );
  const varMap = new Map((varRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  check(
    'похідні змінні класичного контуру перевизначені для #tech-laag та всіх позаоболонкових елементів із суцільними поверхнями --mq-tech-kaart, --mq-tech-menu-vlak, --mq-tech-invoer, --mq-tech-knop-glas та прозорим --mq-tech-glans',
    Boolean(varRegel) &&
      (varRegel?.selectors.some(
        (s) =>
          s.includes('.tech-band') &&
          s.includes('.tech-band-extra') &&
          s.includes('.tech-strook-paneel') &&
          s.includes('.tech-strook-menu') &&
          s.includes('.tech-vraag-uitleg') &&
          s.includes('.tech-poort') &&
          s.includes('.rw-dok-melding') &&
          s.includes('.venster:has(.tech-venster)'),
      ) ??
        false) &&
      varMap.get('--mq-tech-kaart') === 'var(--mq-oppervlak)' &&
      varMap.get('--mq-tech-menu-vlak') === 'var(--mq-oppervlak)' &&
      varMap.get('--mq-tech-invoer') === 'var(--mq-oppervlak-2)' &&
      varMap.get('--mq-tech-glans') === 'transparent' &&
      varMap.get('--mq-tech-knop-glas') === 'var(--mq-oppervlak-2)' &&
      varMap.get('--accent-tekst') === 'var(--mq-knop-primair-tekst)' &&
      varMap.get('--text-on-accent') === 'var(--mq-knop-primair-tekst)',
  );

  // 6. Матова інженерна смуга .tech-band:not(.is-ingeklapt) та згорнутий язичок без розмиття, градієнтів і порушення геометрії --tech-band-h / data-pas / .imp-band / .ond-band.
  const bandRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"][data-tech="aan"] .tech-band:not(.is-ingeklapt)'),
  );
  const ingeklaptRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"][data-tech="aan"] .tech-band.is-ingeklapt'),
  );
  const bandMap = new Map((bandRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const ingeklaptMap = new Map((ingeklaptRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  check(
    'розгорнута смуга .tech-band:not(.is-ingeklapt) та згорнута смужка .tech-band.is-ingeklapt не мають розмиття, градієнтів і ореолів, зберігають --tech-band-bg / --tech-band-fg і висоту --tech-band-h та не чіпають .imp-band і .ond-band',
    bandMap.get('background-color') === 'var(--mq-oppervlak)' &&
      bandMap.get('background-image') === 'none' &&
      bandMap.get('backdrop-filter') === 'none' &&
      bandMap.get('border-bottom') === '1px solid var(--mq-rand)' &&
      bandMap.get('box-shadow') === 'none' &&
      !bandMap.has('height') &&
      !bandMap.has('padding') &&
      !bandMap.has('gap') &&
      ingeklaptMap.get('background-color') === 'var(--tech-band-bg)' &&
      ingeklaptMap.get('background-image') === 'none' &&
      ingeklaptMap.get('backdrop-filter') === 'none' &&
      ingeklaptMap.get('color') === 'var(--tech-band-fg)' &&
      ingeklaptMap.get('border-bottom') === '1px solid var(--mq-rand)' &&
      ingeklaptMap.get('box-shadow') === 'none' &&
      !cssZonderCommentaar.includes('--tech-band-h') &&
      !cssZonderCommentaar.includes('.imp-band') &&
      !cssZonderCommentaar.includes('.ond-band'),
  );

  // 7. Одноколонкова ділова картка .tech-poort.mq-tech-poort (max-width: 560px, 16px) та всі її стани (.tech-poort-stil, [data-tech-bundel="fout"], [data-tech-poort="wacht"]).
  const poortRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .tech-poort.mq-tech-poort'),
  );
  const poortStilRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .tech-poort.tech-poort-stil'),
  );
  const poortFoutRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .tech-poort[data-tech-bundel="fout"]'),
  );
  const poortWachtRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .tech-poort[data-tech-poort="wacht"]'),
  );
  const poortMap = new Map((poortRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const poortStilMap = new Map((poortStilRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const poortFoutMap = new Map((poortFoutRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const poortWachtMap = new Map((poortWachtRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  check(
    'технічна брама .tech-poort.mq-tech-poort та стани .tech-poort-stil, [data-tech-bundel="fout"] і [data-tech-poort="wacht"] оформлені як одноколонкова ділова картка max-width: 560px з border-radius: 16px і матовим тлом var(--mq-oppervlak)',
    poortMap.get('max-width') === '560px' &&
      poortMap.get('border-radius') === '16px' &&
      poortMap.get('border') === '1px solid var(--mq-rand)' &&
      poortMap.get('background') === 'var(--mq-oppervlak)' &&
      poortMap.get('background-image') === 'none' &&
      poortMap.get('box-shadow') === 'var(--mq-schaduw-zacht)' &&
      poortStilMap.get('max-width') === '560px' &&
      poortStilMap.get('border-radius') === '16px' &&
      poortStilMap.get('background') === 'var(--mq-oppervlak)' &&
      poortFoutMap.get('max-width') === '560px' &&
      poortFoutMap.get('border-radius') === '16px' &&
      poortFoutMap.get('border') === '1px solid var(--fout)' &&
      poortWachtMap.get('max-width') === '560px' &&
      poortWachtMap.get('border-radius') === '16px' &&
      poortWachtMap.get('background') === 'var(--mq-oppervlak)',
  );

  // 8. Платформні вікна .venster:has(.tech-venster) (правий відступ шапки <= 20px) та спливні позаоболонкові панелі (16px, матові).
  const vensterRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .venster:has(.tech-venster)'),
  );
  const vensterKopRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .venster:has(.tech-venster) .venster-kop'),
  );
  const vensterKopMobielRegel = regels.find(
    (r) =>
      r.media.length > 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .venster:has(.tech-venster) .venster-kop'),
  );
  const vensterMap = new Map((vensterRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const kopPaddingPc = new Map((vensterKopRegel?.decls ?? []).map((d) => [d.eig, d.waarde])).get('padding') ?? '';
  const kopPaddingMobiel = new Map((vensterKopMobielRegel?.decls ?? []).map((d) => [d.eig, d.waarde])).get('padding') ?? '';
  const rechtsPc = rechtseOpvullingPx(kopPaddingPc);
  const rechtsMobiel = rechtseOpvullingPx(kopPaddingMobiel);
  check(
    'вікна .venster:has(.tech-venster) та спливні панелі (.tech-band-extra.is-open, .tech-strook-paneel, .tech-strook-menu, .tech-vraag-uitleg, .rw-dok-melding) мають матові поверхні 16px без розмиття, а правий відступ шапки вікна суворо <= 20px',
    vensterMap.get('border-radius') === '16px' &&
      vensterMap.get('background') === 'var(--mq-oppervlak)' &&
      vensterMap.get('background-image') === 'none' &&
      vensterMap.get('backdrop-filter') === 'none' &&
      Number.isFinite(rechtsPc) &&
      rechtsPc <= 20 &&
      Number.isFinite(rechtsMobiel) &&
      rechtsMobiel <= 20 &&
      klassiekPc.includes('.tech-band .tech-band-extra.is-open') &&
      klassiekPc.includes('.tech-strook-paneel') &&
      klassiekPc.includes('.tech-strook-menu') &&
      klassiekPc.includes('body .tech-vraag-uitleg') &&
      klassiekPc.includes('.rw-dok-melding'),
    `rechtsPc=${rechtsPc}, rechtsMobiel=${rechtsMobiel}`,
  );

  // 9. Узгоджена геометрія кутів: 16px для карток/панелей/вікон, 11px для кнопок і полів введення, 999px для пігулок.
  const poortKnopRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .tech-poort button'),
  );
  const vensterKnopRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .tech-venster button:not(.tech-kleur):not(.tech-vraag-knop)'),
  );
  const vensterVeldRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] .tech-venster :where(input')),
  );
  const poortKnopMap = new Map((poortKnopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const vensterKnopMap = new Map((vensterKnopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const vensterVeldMap = new Map((vensterVeldRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  check(
    'у класичному контурі картки, панелі й вікна мають border-radius: 16px, кнопки та поля введення — 11px, а пігулки (.tech-band-merk, .rw-schakel, .tech-strook-optie, .rs-chip, .mq-tech-poort-boven) — 999px',
    poortKnopMap.get('border-radius') === '11px' &&
      vensterKnopMap.get('border-radius') === '11px' &&
      vensterVeldMap.get('border-radius') === '11px' &&
      klassiekPc.includes('border-radius: 16px;') &&
      klassiekPc.includes('border-radius: 11px;') &&
      klassiekPc.includes('border-radius: 999px;') &&
      klassiekPc.includes('.mq-tech-poort-boven') &&
      klassiekPc.includes('.tech-strook-optie') &&
      klassiekPc.includes('.rs-chip'),
  );

  // 10. Первинні кнопки (.is-hoofd, .tech-poort-naar, .tech-strook-optie.is-gekozen) без градієнтів і без #fff / var(--mq-wit).
  const poortHoofdRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .tech-poort button.is-hoofd') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .tech-poort button.tech-poort-naar'),
  );
  const vensterHoofdRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .tech-venster button.is-hoofd:not(.tech-kleur):not(.tech-vraag-knop)'),
  );
  const strookGekozenRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .tech-strook-optie.is-gekozen'),
  );
  const poortHoofdMap = new Map((poortHoofdRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const vensterHoofdMap = new Map((vensterHoofdRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const strookGekozenMap = new Map((strookGekozenRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const contrastPrimairWit = contrastVerhouding('#181c24', '#ffffff');
  const contrastPrimairZwart = contrastVerhouding('#f3f4f6', '#0c0e12');
  check(
    'первинні кнопки (.is-hoofd, .tech-poort-naar, .tech-strook-optie.is-gekozen) використовують суцільні var(--mq-knop-primair-bg) та var(--mq-knop-primair-tekst) з контрастом > 14:1 без градієнтів і без #fff чи var(--mq-wit)',
    poortHoofdMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      poortHoofdMap.get('background-image') === 'none' &&
      poortHoofdMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      poortHoofdMap.get('box-shadow') === 'none' &&
      vensterHoofdMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      vensterHoofdMap.get('background-image') === 'none' &&
      vensterHoofdMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      strookGekozenMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      strookGekozenMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      !/linear-gradient|radial-gradient|repeating-linear-gradient/i.test(klassiekPc) &&
      !klassiekPc.includes('var(--mq-wit)') &&
      !/#fff\b|#ffffff\b|(?<![\w-])white(?![\w-])/i.test(cssZonderCommentaar) &&
      maquetteKlassiekCss.includes('--mq-knop-primair-bg: var(--mq-accent);') &&
      contrastPrimairWit > 14 &&
      contrastPrimairZwart > 14,
  );

  // 11. Беззасічковий гротеск заголовків без курсиву та табличні цифри tabular-nums для таймерів технічного сеансу.
  check(
    'заголовки технічної брами, діалогів і панелей використовують гротеск var(--mq-font-ui, Inter, system-ui, sans-serif) без курсиву, а таймери сеансу мають font-variant-numeric: tabular-nums',
    klassiekPc.includes('font-family: var(--mq-font-ui, Inter, system-ui, sans-serif);') &&
      klassiekPc.includes('font-style: normal;') &&
      klassiekPc.includes('.tech-poort h1') &&
      klassiekPc.includes('.tech-venster h3') &&
      klassiekPc.includes('.venster:has(.tech-venster) .venster-titel') &&
      klassiekPc.includes('font-variant-numeric: tabular-nums;') &&
      klassiekPc.includes('.tech-band-tijd') &&
      klassiekPc.includes('.rw-stand'),
  );

  // 12. Чистота правил :not(#_mqk) проти flat-content: лише border, border-radius: 16px та box-shadow (нуль padding і нуль gap).
  const mqkRegels = regels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = mqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'правила захисту html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) проти flat-content містять винятково border, border-radius: 16px та box-shadow без padding і без gap',
    mqkRegels.length === 2 &&
      mqkRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')),
      ) &&
      mqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 13. Дисципліна каскаду @media (mobiel-cascade-20261105) та відсутність заборонених CSS-конструкцій.
  const buitenMedia = inhoudBuitenMediaBlokken(techCss, idxEersteMedia);
  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };
  const poortSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .tech-poort.mq-tech-poort';
  const menuOpenSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .tech-band .tech-band-extra.is-open';
  const kopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .venster:has(.tech-venster) .venster-kop';
  check(
    'класичний настільний розділ стоїть суворо перед першим @media, поза @media немає пізніших правил, нуль !important / prefers-color-scheme / position: fixed, а мобільні значення перемагають на екрані 390×844',
    idxKlassiek > 0 &&
      idxEersteMedia > idxKlassiek &&
      idxMaxWidth > idxKlassiek &&
      buitenMedia === '' &&
      !/!\s*important/i.test(techCss) &&
      !/prefers-color-scheme/i.test(techCss) &&
      !/position\s*:\s*fixed/i.test(techCss) &&
      wint(regels, poortSel, 'padding', pcProfiel)?.waarde === '24px' &&
      wint(regels, poortSel, 'padding', telProfiel)?.waarde === '18px 16px 20px' &&
      wint(regels, menuOpenSel, 'border-radius', pcProfiel)?.waarde === '16px' &&
      wint(regels, menuOpenSel, 'border-radius', telProfiel)?.waarde === '0 0 16px 16px' &&
      wint(regels, kopSel, 'padding', pcProfiel)?.waarde === '6px 12px 6px 16px' &&
      wint(regels, kopSel, 'padding', telProfiel)?.waarde === '6px 10px 6px 14px',
  );

  // 14. Абсолютна мовна чистота у всіх 3 файлах контуру KLASSIEK-009C.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/tech/TechPoort.tsx', poortTsx],
    ['src/tech/tech-maquette.css', techCss],
    ['tests/eenheid/klassiek-009c-technische-laag.test.ts', zelfTest],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  check(
    'жоден із трьох файлів контуру KLASSIEK-009C не містить заборонених символів російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
