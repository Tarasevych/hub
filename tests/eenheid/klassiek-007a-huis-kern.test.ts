// KLASSIEK-007A (Хвиля 6 тем оформлення «Біла класика» та «Чорна класика» для піддомену huis.tarasevych.com):
// перевірка інформаційного екрана DomoticaWeergave, ядра HuisPagina, портального шару HuisLaag та розділів Overzicht, Showroom, Planner —
// відсікання студійних правил світлого режиму й примусового нічного склепіння шапки через :not([data-maquette-stijl="klassiek"]),
// переведення на беззасічкові шрифти та чисті змінні класичної палітри (разом із портальним .hv-laag), прибирання кольорових акцентів карток,
// ущільнення вступної смуги .smart-home-hero та внутрішньої шапки header.hv-kop до однорядкових ділових панелей,
// суцільні матові поверхні без градієнтів і розмиття, первинні кнопки на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без #fff,
// заокруглення 16px (картки/панелі) та 11px (кнопки/поля), табличні цифри tabular-nums, чесні семантичні індикатори var(--ok)/var(--warn)/var(--fout),
// ізоляція :not(#_mqk) винятково без padding і gap та дисципліна мобільного каскаду.
// Eenheidstest voor DomoticaWeergave, HuisPagina, HuisLaag, Overzicht, Showroom en Planner op huis.tarasevych.com (KLASSIEK-007A).

import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const RUW_WIT_KLEUR = /(?<![-\w])(?:#fff(?:fff)?|white)(?![-\w])/i;

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-007a-huis-kern');

  const domoticaCss = readFileSync('src/huis/domotica-maquette.css', 'utf8');
  const kernCss = readFileSync('src/huis/huis-kern-maquette.css', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-007a-huis-kern.test.ts', 'utf8');

  const domoticaZonderCommentaar = domoticaCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const kernZonderCommentaar = kernCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxDomKlassiek = domoticaCss.indexOf('ПРАГМАТИЧНИЙ КЛАСИЧНИЙ ШАР «БІЛА КЛАСИКА» ТА «ЧОРНА КЛАСИКА» (KLASSIEK-007A)');
  const idxDomEersteMedia = domoticaCss.search(/@media\s*\(/);
  const domKlassiekPc =
    idxDomKlassiek > 0 && idxDomEersteMedia > idxDomKlassiek
      ? domoticaCss.slice(idxDomKlassiek, idxDomEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const idxKernKlassiek = kernCss.indexOf('9. ПРАГМАТИЧНИЙ КЛАСИЧНИЙ ШАР «БІЛА КЛАСИКА» ТА «ЧОРНА КЛАСИКА» (KLASSIEK-007A)');
  const idxKernEersteMedia = kernCss.search(/@media\s*\(/);
  const kernKlassiekPc =
    idxKernKlassiek > 0 && idxKernEersteMedia > idxKernKlassiek
      ? kernCss.slice(idxKernKlassiek, idxKernEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const domRegels = leesCss(domoticaCss);
  const kernRegels = leesCss(kernCss);

  // 1. Відсікання студійних блоків світлого режиму та примусового темного .mq-held у domotica-maquette.css.
  const domLichtRegels = domRegels.filter((r) =>
    r.selectors.some(
      (s) => s.includes('data-theme="light"') || s.includes('theme-light') || s.includes('theme-plum-light'),
    ),
  );
  const domHeldRegels = domRegels.filter((r) => r.selectors.some((s) => s.includes('.mq-held')));
  const domColorSchemeRegels = domRegels.filter((r) => r.decls.some((d) => d.eig === 'color-scheme'));

  check(
    'у domotica-maquette.css усі студійні блоки світлого режиму та примусовий темний блок .mq-held відсічені через :not([data-maquette-stijl="klassiek"])',
    domLichtRegels.length === 4 &&
      domLichtRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ) &&
      domHeldRegels.length === 1 &&
      domHeldRegels[0].selectors.every((s) =>
        s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])'),
      ) &&
      domColorSchemeRegels.length === 1 &&
      domColorSchemeRegels[0].selectors.every((s) =>
        s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])'),
      ),
  );

  // 2. Беззасічкові шрифти, змінні акценту, табличні цифри й скидання кольорових акцентів карток у domotica-maquette.css.
  const domVarRegel = domRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .domotica-maquette-wikkel'),
  );
  const domVarMap = new Map((domVarRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const domAccentResetRegel = domRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .domotica-maquette-wikkel .smart-home-sections article') &&
      r.decls.some((d) => d.eig === '--mq-kaart-accent'),
  );

  check(
    'у domotica-maquette.css класична обгортка переводить --domotica-mq-serif і --domotica-mq-sans на беззасічковий шрифт, вмикає tabular-nums і скидає mq-accent-*',
    domVarMap.get('--domotica-mq-serif') === 'var(--mq-font-ui, Inter, system-ui, sans-serif)' &&
      domVarMap.get('--domotica-mq-sans') === 'var(--mq-font-ui, Inter, system-ui, sans-serif)' &&
      domVarMap.get('--mq-accent-huis') === 'var(--mq-accent)' &&
      domVarMap.get('--mq-accent-huis-diep') === 'var(--mq-accent-2)' &&
      domVarMap.get('--mq-accent-huis-op') === 'var(--mq-accent-op)' &&
      domVarMap.get('font-variant-numeric') === 'tabular-nums' &&
      domAccentResetRegel !== undefined &&
      ['.mq-accent-amber', '.mq-accent-cyan', '.mq-accent-violet', '.mq-accent-mint', '.mq-accent-emerald', '.mq-accent-blue'].every(
        (kl) => domAccentResetRegel.selectors.some((s) => s.includes(kl)),
      ) &&
      domAccentResetRegel.decls.some((d) => d.eig === '--sectie-accent' && d.waarde === 'var(--mq-accent)'),
  );

  // 3. Ущільнення вступної смуги .smart-home-hero під MaquetteHeld та приховування великого декоративного знака .smart-home-mark.
  const domMarkRegel = domRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .domotica-maquette-wikkel .smart-home-mark'),
  );
  const domHeroRegel = domRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .domotica-maquette-wikkel .smart-home-hero') &&
      r.decls.some((d) => d.eig === 'padding'),
  );
  const domH1Regel = domRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .domotica-maquette-wikkel .smart-home h1'),
  );
  const domHeroMap = new Map((domHeroRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const domH1Map = new Map((domH1Regel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'у domotica-maquette.css знак .smart-home-mark прихований, а .smart-home-hero ущільнено до однорядкової смуги (padding: 12px 16px, h1: 1.05rem / 650)',
    domMarkRegel?.decls.some((d) => d.eig === 'display' && d.waarde === 'none') === true &&
      domHeroMap.get('display') === 'flex' &&
      domHeroMap.get('flex-direction') === 'row' &&
      domHeroMap.get('padding') === '12px 16px' &&
      domHeroMap.get('border-radius') === '16px' &&
      domHeroMap.get('background') === 'var(--mq-oppervlak)' &&
      domHeroMap.get('background-image') === 'none' &&
      domH1Map.get('font-size') === '1.05rem' &&
      domH1Map.get('font-weight') === '650',
  );

  // 4. Суцільні матові картки 16px та первинна кнопка переходу до макета 11px без градієнтів і розмиття в domotica-maquette.css.
  const domStatusRegel = domRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .domotica-maquette-wikkel .smart-home-status') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .domotica-maquette-wikkel .smart-home-next') &&
      r.decls.some((d) => d.eig === 'background'),
  );
  const domSectieArtRegel = domRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .domotica-maquette-wikkel .smart-home-sections article') &&
      r.decls.some((d) => d.eig === 'background'),
  );
  const domLinkRegel = domRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .domotica-maquette-wikkel .smart-home-maquette-link'),
  );
  const domStatusMap = new Map((domStatusRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const domSectieArtMap = new Map((domSectieArtRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const domLinkMap = new Map((domLinkRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'у domotica-maquette.css картки стану, розділів і наступного кроку матові з кутами 16px, а .smart-home-maquette-link має кути 11px на var(--mq-knop-primair-bg) без градієнтів',
    domStatusMap.get('background') === 'var(--mq-oppervlak)' &&
      domStatusMap.get('border') === '1px solid var(--mq-rand)' &&
      domStatusMap.get('border-radius') === '16px' &&
      domSectieArtMap.get('background') === 'var(--mq-oppervlak)' &&
      domSectieArtMap.get('border') === '1px solid var(--mq-rand)' &&
      domSectieArtMap.get('border-radius') === '16px' &&
      domLinkMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      domLinkMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      domLinkMap.get('border-radius') === '11px' &&
      domLinkMap.get('box-shadow') === 'none' &&
      !/linear-gradient|radial-gradient/i.test(domKlassiekPc) &&
      !/blur\(/i.test(domKlassiekPc) &&
      !RUW_WIT_KLEUR.test(domoticaZonderCommentaar),
  );

  // 5. Відсікання всіх студійних блоків світлого режиму (включно з :has(...) .hv-laag) та темного .mq-held у huis-kern-maquette.css.
  const kernLichtRegels = kernRegels.filter((r) =>
    r.selectors.some(
      (s) => s.includes('data-theme="light"') || s.includes('theme-light') || s.includes('theme-plum-light'),
    ),
  );
  const kernHeldRegels = kernRegels.filter((r) => r.selectors.some((s) => s.includes('.mq-held')));
  const kernColorSchemeRegels = kernRegels.filter((r) => r.decls.some((d) => d.eig === 'color-scheme'));

  check(
    'у huis-kern-maquette.css усі студійні блоки світлого режиму (разом із портальним :has(...) .hv-laag) та темний .mq-held відсічені через :not([data-maquette-stijl="klassiek"])',
    kernLichtRegels.length === 5 &&
      kernLichtRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ) &&
      kernHeldRegels.length === 1 &&
      kernHeldRegels[0].selectors.every((s) =>
        s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])'),
      ) &&
      kernColorSchemeRegels.length === 1 &&
      kernColorSchemeRegels[0].selectors.every((s) =>
        s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])'),
      ),
  );

  // 6. Узгодження всіх змінних класичної палітри на .hv і портальному шарі .hv-laag у huis-kern-maquette.css.
  const kernVarRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv-laag') &&
      r.decls.some((d) => d.eig === '--mq-huis-halo'),
  );
  const kernVarMap = new Map((kernVarRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'у huis-kern-maquette.css під .hv та портальним .hv-laag узгоджені всі чисті змінні класичної палітри й вимкнені бурштинові ореоли',
    kernVarMap.get('--huis-mq-serif') === 'var(--mq-font-ui, Inter, system-ui, sans-serif)' &&
      kernVarMap.get('--huis-mq-sans') === 'var(--mq-font-ui, Inter, system-ui, sans-serif)' &&
      kernVarMap.get('--mq-accent-huis') === 'var(--mq-accent)' &&
      kernVarMap.get('--mq-accent-huis-diep') === 'var(--mq-accent-2)' &&
      kernVarMap.get('--mq-accent-huis-op') === 'var(--mq-accent-op)' &&
      kernVarMap.get('--mq-huis-halo') === 'transparent' &&
      kernVarMap.get('--mq-huis-halo-zacht') === 'transparent' &&
      kernVarMap.get('--panel') === 'var(--mq-oppervlak)' &&
      kernVarMap.get('--surface') === 'var(--mq-oppervlak-2)' &&
      kernVarMap.get('--surface2') === 'var(--mq-oppervlak-2)' &&
      kernVarMap.get('--line') === 'var(--mq-rand)' &&
      kernVarMap.get('--text') === 'var(--mq-tekst)' &&
      kernVarMap.get('--muted') === 'var(--mq-gedempt)' &&
      kernVarMap.get('--faint') === 'var(--mq-stil)' &&
      kernVarMap.get('--accent') === 'var(--mq-accent)' &&
      kernVarMap.get('--accenttext') === 'var(--mq-accent-op)' &&
      kernKlassiekPc.includes('--accentText: var(--mq-accent-op);') &&
      kernVarMap.get('--accent-soft') === 'var(--mq-oppervlak-hover)' &&
      kernVarMap.get('font-variant-numeric') === 'tabular-nums',
  );

  // 7. Компактна однорядкова ділова шапка header.hv-kop зі збереженням вибору оселі, каналу, кнопки оновлення та позначки демонстрації.
  const kernKopRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv header.hv-kop') &&
      r.decls.some((d) => d.eig === 'padding'),
  );
  const kernKopTekstRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-kop-tekst'),
  );
  const kernKopH2Regel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-kop h2'),
  );
  const kernKopMap = new Map((kernKopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const kernKopTekstMap = new Map((kernKopTekstRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const kernKopH2Map = new Map((kernKopH2Regel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const verborgenKernOnderdelen = kernRegels.filter(
    (r) =>
      r.selectors.some(
        (s) =>
          s.includes('[data-maquette-stijl="klassiek"]') &&
          (s.includes('.hv-kiezer') || s.includes('.hv-kanaal') || s.includes('.hv-icoonknop') || s.includes('.hv-demo-label')),
      ) && r.decls.some((d) => d.eig === 'display' && d.waarde === 'none'),
  );

  check(
    'внутрішня шапка header.hv-kop ущільнена до однорядкової панелі (padding: 10px 16px, min-height: 48px, без ореолу й засічок), а .hv-kiezer, .hv-kanaal, .hv-icoonknop і .hv-demo-label збережені видимими',
    kernKopMap.get('display') === 'flex' &&
      kernKopMap.get('flex-direction') === 'row' &&
      kernKopMap.get('min-height') === '48px' &&
      kernKopMap.get('padding') === '10px 16px' &&
      kernKopMap.get('border-radius') === '16px' &&
      kernKopMap.get('background') === 'var(--mq-oppervlak)' &&
      kernKopMap.get('background-image') === 'none' &&
      kernKopTekstMap.get('display') === 'flex' &&
      kernKopTekstMap.get('flex-direction') === 'row' &&
      kernKopH2Map.get('font-family') === 'var(--huis-mq-sans)' &&
      kernKopH2Map.get('font-size') === '1.05rem' &&
      kernKopH2Map.get('font-weight') === '650' &&
      verborgenKernOnderdelen.length === 0,
  );

  // 8. Матові поверхні початкового екрана .hv-start, огляду Overzicht, вітрини Showroom та розрахункового планувальника Planner.
  const startRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-start') &&
      r.decls.some((d) => d.eig === 'background'),
  );
  const blokMaquetteRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-blok') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-maquette-kaart') &&
      r.decls.some((d) => d.eig === 'background'),
  );
  const tegelRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-tegel') &&
      r.decls.some((d) => d.eig === 'background'),
  );
  const planRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-plan'),
  );
  const sceneRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-scene-kaart') &&
      r.decls.some((d) => d.eig === 'background'),
  );
  const afspeelRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-afspeel li'),
  );
  const keuzeRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-planner .hv-keuze'),
  );

  check(
    'поверхні .hv-start, Overzicht (.hv-tegel, .hv-plan, .hv-scene-kaart), Showroom (.hv-maquette-kaart, .hv-afspeel) і Planner (.hv-keuze, .hv-tabel) матові без градієнтів із кутами 16px / 11px та tabular-nums',
    startRegel?.decls.some((d) => d.eig === 'background' && d.waarde === 'var(--mq-oppervlak)') === true &&
      startRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') === true &&
      blokMaquetteRegel?.decls.some((d) => d.eig === 'background' && d.waarde === 'var(--mq-oppervlak)') === true &&
      blokMaquetteRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') === true &&
      tegelRegel?.decls.some((d) => d.eig === 'background' && d.waarde === 'var(--mq-oppervlak)') === true &&
      tegelRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') === true &&
      tegelRegel?.decls.some((d) => d.eig === 'font-variant-numeric' && d.waarde === 'tabular-nums') === true &&
      planRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') === true &&
      sceneRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') === true &&
      afspeelRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px') === true &&
      keuzeRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px') === true &&
      kernKlassiekPc.includes('.hv-tabel td') &&
      !/linear-gradient|radial-gradient/i.test(kernKlassiekPc) &&
      !/blur\(/i.test(kernKlassiekPc),
  );

  // 9. Портальний діалоговий шар .hv-laag (padding-right <= 20px у шапці вікна) та мобільна нижня смуга .hv-onderbalk без розмиття.
  const laagRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv-laag') &&
      r.decls.some((d) => d.eig === 'backdrop-filter'),
  );
  const laagVakRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv-laag-vak'),
  );
  const laagVensterRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv-laag.is-venster .hv-laag-vak'),
  );
  const laagKopRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv-laag-kop'),
  );
  const onderbalkRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-onderbalk'),
  );
  const onderbalkKnopRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-onderbalk>button'),
  );

  check(
    'діалоговий шар .hv-laag і нижня смуга .hv-onderbalk мають матове тло var(--mq-oppervlak) без backdrop-filter, вікно має кути 16px, а шапка .hv-laag-kop має padding: 12px 16px (padding-right <= 20px)',
    laagRegel?.decls.some((d) => d.eig === 'backdrop-filter' && d.waarde === 'none') === true &&
      laagVakRegel?.decls.some((d) => d.eig === 'background' && d.waarde === 'var(--mq-oppervlak)') === true &&
      laagVakRegel?.decls.some((d) => d.eig === 'backdrop-filter' && d.waarde === 'none') === true &&
      laagVensterRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') === true &&
      laagKopRegel?.decls.some((d) => d.eig === 'padding' && d.waarde === '12px 16px') === true &&
      onderbalkRegel?.decls.some((d) => d.eig === 'background' && d.waarde === 'var(--mq-oppervlak)') === true &&
      onderbalkRegel?.decls.some((d) => d.eig === 'backdrop-filter' && d.waarde === 'none') === true &&
      onderbalkKnopRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px') === true,
  );

  // 10. Первинні кнопки .hv-knop.is-hoofd на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst), 11px, box-shadow: none, нуль #fff.
  const hoofdKnopRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] :is(.hv, .hv-laag) .hv-knop.is-hoofd'),
  );
  const hoofdKnopMap = new Map((hoofdKnopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'первинні кнопки .hv-knop.is-hoofd оформлені через var(--mq-knop-primair-bg) і var(--mq-knop-primair-tekst) із кутами 11px та box-shadow: none без жодного #fff у коді',
    hoofdKnopMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      hoofdKnopMap.get('background-image') === 'none' &&
      hoofdKnopMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      hoofdKnopMap.get('border-radius') === '11px' &&
      hoofdKnopMap.get('box-shadow') === 'none' &&
      !RUW_WIT_KLEUR.test(kernZonderCommentaar),
  );

  // 11. Чесні та читабельні семантичні індикатори стану каналу й свіжості спостережень на var(--ok), var(--warn), var(--fout).
  const kanaalLokaal = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-kanaal.is-lokaal'),
  );
  const kanaalWarn = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-kanaal:is(.is-verouderd, .is-verzwakt, .is-geconfigureerd)',
      ),
  );
  const kanaalFout = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-kanaal.is-geweigerd'),
  );
  const versRand = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .canonical-content .hv article:is(.is-vers, .is-verbonden)'),
  );
  const verouderdRand = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .canonical-content .hv article:is(.is-verouderd, .is-verzwakt, .is-geconfigureerd)',
      ),
  );
  const foutRand = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .canonical-content .hv article:is(.is-onbeschikbaar, .is-geweigerd)',
      ),
  );

  check(
    'семантичні індикатори каналу (.hv-kanaal) та свіжості спостережень (.is-vers, .is-verouderd, .is-onbeschikbaar) використовують чесні змінні var(--ok), var(--warn), var(--fout)',
    kanaalLokaal?.decls.some((d) => d.eig === 'color' && d.waarde === 'var(--ok)') === true &&
      kanaalWarn?.decls.some((d) => d.eig === 'color' && d.waarde === 'var(--warn)') === true &&
      kanaalFout?.decls.some((d) => d.eig === 'color' && d.waarde === 'var(--fout)') === true &&
      versRand?.decls.some((d) => d.eig === 'border-left-color' && d.waarde === 'var(--ok)') === true &&
      verouderdRand?.decls.some((d) => d.eig === 'border-left-color' && d.waarde === 'var(--warn)') === true &&
      foutRand?.decls.some((d) => d.eig === 'border-left-color' && d.waarde === 'var(--fout)') === true,
  );

  // 12. Окремі правила специфічності :not(#_mqk) проти flat-content (0, 19, 0) в обох файлах — винятково без padding і gap, скруглення лише 16px / 11px / 999px.
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const domMqkRegels = domRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const kernMqkRegels = kernRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const alleMqkRegels = [...domMqkRegels, ...kernMqkRegels];
  const verbodenMqkEig = alleMqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );

  const klassiekStralen = [...domRegels, ...kernRegels]
    .filter((r) =>
      r.selectors.some(
        (s) => s.includes('[data-maquette-stijl="klassiek"]') && !s.includes(':not([data-maquette-stijl="klassiek"])'),
      ),
    )
    .flatMap((r) => r.decls.filter((d) => d.eig === 'border-radius').map((d) => d.waarde));

  check(
    'в обох таблицях стилів правила html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) містять винятково border, border-inline, border-radius: 16px і box-shadow (нуль padding і gap), а всі класичні радіуси належать 16px / 11px / 999px',
    domMqkRegels.length === 1 &&
      kernMqkRegels.length === 3 &&
      alleMqkRegels.every(
        (r) =>
          r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')) &&
          r.decls.length === 4 &&
          r.decls.some((d) => d.eig === 'border') &&
          r.decls.some((d) => d.eig === 'border-inline') &&
          r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') &&
          r.decls.some((d) => d.eig === 'box-shadow'),
      ) &&
      verbodenMqkEig.length === 0 &&
      klassiekStralen.length >= 30 &&
      klassiekStralen.every((w) => w === '16px' || w === '11px' || w === '999px'),
    verbodenMqkEig.join(', ') || klassiekStralen.join(', '),
  );

  // 13. Сувора дисципліна каскаду в обох CSS-файлах: нуль !important, prefers-color-scheme, position: fixed; класика перед першим @media; мобільні відступи перемагають.
  const domEersteMediaVolg = Math.min(...domRegels.filter((r) => r.media.length > 0).map((r) => r.volg));
  const domBasisNaMedia = domRegels.filter((r) => r.media.length === 0 && !r.overig && r.volg > domEersteMediaVolg);

  const kernEersteMediaVolg = Math.min(...kernRegels.filter((r) => r.media.length > 0).map((r) => r.volg));
  const kernBasisNaMedia = kernRegels.filter((r) => r.media.length === 0 && !r.overig && r.volg > kernEersteMediaVolg);

  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };

  const domHeroSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .domotica-maquette-wikkel .smart-home-hero';
  const domArtSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .domotica-maquette-wikkel .smart-home-sections article';
  const kernKopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .hv header.hv-kop';
  const kernBlokSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-blok';
  const kernStartSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .hv .hv-start';

  check(
    'обидві таблиці стилів не містять !important, prefers-color-scheme чи position: fixed, класичні настільні правила стоять суворо перед першим @media, а мобільні відступи перемагають на вузькому екрані',
    !/!\s*important/i.test(domoticaCss) &&
      !/!\s*important/i.test(kernCss) &&
      !/prefers-color-scheme/i.test(domoticaCss) &&
      !/prefers-color-scheme/i.test(kernCss) &&
      !/position\s*:\s*fixed/i.test(domoticaCss) &&
      !/position\s*:\s*fixed/i.test(kernCss) &&
      idxDomKlassiek > 0 &&
      idxDomEersteMedia > idxDomKlassiek &&
      idxKernKlassiek > 0 &&
      idxKernEersteMedia > idxKernKlassiek &&
      domBasisNaMedia.length === 0 &&
      kernBasisNaMedia.length === 0 &&
      wint(domRegels, domHeroSel, 'padding', pcProfiel)?.waarde === '12px 16px' &&
      wint(domRegels, domHeroSel, 'padding', telProfiel)?.waarde === '10px 12px' &&
      wint(domRegels, domArtSel, 'padding', pcProfiel)?.waarde === '16px 18px' &&
      wint(domRegels, domArtSel, 'padding', telProfiel)?.waarde === '14px' &&
      wint(kernRegels, kernKopSel, 'padding', pcProfiel)?.waarde === '10px 16px' &&
      wint(kernRegels, kernKopSel, 'padding', telProfiel)?.waarde === '10px 12px' &&
      wint(kernRegels, kernBlokSel, 'padding', pcProfiel)?.waarde === '16px 18px' &&
      wint(kernRegels, kernBlokSel, 'padding', telProfiel)?.waarde === '14px' &&
      wint(kernRegels, kernStartSel, 'padding', pcProfiel)?.waarde === '20px 22px' &&
      wint(kernRegels, kernStartSel, 'padding', telProfiel)?.waarde === '16px 14px',
  );

  // 14. Абсолютна мовна чистота у всіх трьох файлах контуру KLASSIEK-007A.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/huis/domotica-maquette.css', domoticaCss],
    ['src/huis/huis-kern-maquette.css', kernCss],
    ['tests/eenheid/klassiek-007a-huis-kern.test.ts', zelfTest],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);

  check(
    'жоден файл пакета KLASSIEK-007A не містить заборонених літер російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
