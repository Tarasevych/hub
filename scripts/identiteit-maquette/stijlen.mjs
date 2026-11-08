// Перетворює styles.css макета ChatGPT на стилі, вкладені в .mr-mq (простір імен сайту).
// body → .mr-mq; :root → .mr-mq; @media (max/min-width) → класи bp-max-N / bp-min-N на корені (ширина робочої області, не вікна).
import postcss from 'postcss';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const WORTEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');


const BRON = path.join(WORTEL, 'docs/ontwerp/identiteit-account/maquette-bron/') + 'styles.css';
const UIT = path.join(WORTEL, 'src/identiteit/maquette/') + 'maquette-stijlen.css';
// Чотири класи (0,4,0): перемагає правило flat-content сайту (0,3,0), яке знімає радіуси й тіні, а разом із !important на transition —
// і правило оболонки «.canonical-chrome button:not(…)×3{transition:none!important}» (0,4,1), яке вимикає анімації кнопок.
const PREFIX = '.mr-mq.mr-mq.mr-mq.mr-mq';
const LICHAAM = new Set(['light','rail-left','rail-right','rail-top','rail-bottom','rail-pills','rail-icons','rail-compact','rail-mode-auto','rail-smart-condensed','rail-smart-open','dragging-rail','drawer-open','demo-colorful-icons','demo-dense','demo-motion-off','demo-widgets-hidden','demo-widgets-large','demo-technical-identity','demo-hide-identity-badge']);
const ECHT = ':not(.mq-echt *)'; // справжні панелі сайту всередині макета не отримують його глобальних правил для svg/button/input
const drempels = new Set();

function splitsCompound(sel) {
  // перший складений селектор (до першого пробіла/комбінатора на верхньому рівні)
  let diepte = 0, i = 0;
  for (; i < sel.length; i++) {
    const c = sel[i];
    if (c === '(' || c === '[') diepte++;
    else if (c === ')' || c === ']') diepte--;
    else if (diepte === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) break;
  }
  return [sel.slice(0, i), sel.slice(i)];
}
function compoundKlassen(c) {
  // класи у складеному селекторі без псевдо/атрибутів
  return [...c.replace(/\[[^\]]*\]|:[a-z-]+(\([^)]*\))?/g, '').matchAll(/\.([A-Za-z0-9_-]+)/g)].map(m => m[1]);
}
function elementOnly(c) { return /^[a-z*][a-z0-9-]*(::?[a-z-]+(\([^)]*\))?)*$/i.test(c) && !c.startsWith('.') && !c.startsWith('#'); }

function herschrijf(sel, bpPrefix) {
  sel = sel.trim();
  if (!sel) return null;
  if (/^html\b/.test(sel)) return null;
  if (/^(\.app-rail(-[a-z]+)?|\.app-shell|\.app-icon|\.brand-mark)\b/.test(sel) && !sel.includes(' ')) return null;
  if (sel === '.main-content') return null;
  if (sel === ':root') return PREFIX + bpPrefix;
  if (/^body\b/.test(sel)) return PREFIX + bpPrefix + sel.slice(4);
  if (sel.startsWith('*')) return PREFIX + bpPrefix + ' ' + sel + ECHT;
  if (sel.startsWith('::')) return PREFIX + bpPrefix + ' ' + sel;
  const [eerste, rest] = splitsCompound(sel);
  const klassen = compoundKlassen(eerste);
  if (klassen.length && klassen.every(k => LICHAAM.has(k)) && !/^#|^[a-z]/i.test(eerste)) return PREFIX + bpPrefix + eerste + rest;
  if (elementOnly(eerste.split('::')[0]) && !rest.trim()) {
    const [basis, pseudo] = eerste.includes('::') ? [eerste.slice(0, eerste.indexOf('::')), eerste.slice(eerste.indexOf('::'))] : [eerste, ''];
    return PREFIX + bpPrefix + ' ' + basis + ECHT + pseudo;
  }
  return PREFIX + bpPrefix + ' ' + sel;
}

function mediaNaarKlassen(params) {
  // (max-width:730px) | (min-width:731px) and (max-width:900px) → '.bp-max-730.bp-min-731' ; null = не про ширину
  const delen = [...params.matchAll(/\((max|min)-width\s*:\s*(\d+)px\)/g)];
  if (!delen.length) return null;
  const overig = params.replace(/\((max|min)-width\s*:\s*\d+px\)/g, '').replace(/\band\b/g, '').trim();
  if (overig) throw new Error('Невідомий медіазапит: ' + params);
  return delen.map(([, soort, n]) => { drempels.add(Number(n)); return `.bp-${soort}-${n}`; }).join('');
}

/** true — правило лишається (селектори переписано); false — правило не стосується сайту (лівa смуга, html, .main-content). */
function verwerkRegel(regel, bpPrefix) {
  const nieuw = regel.selectors.map(s => herschrijf(s, bpPrefix)).filter(Boolean);
  if (!nieuw.length) return false;
  regel.selectors = nieuw;
  regel.walkDecls(d => {
    // зсуви під оболонку сайту: лівий бік (бічне меню сайту) і верх (командна смуга сайту + верхня планка макета)
    if (/^(left|inset|margin-left)$/.test(d.prop)) d.value = d.value.replace(/\b74px\b/g, 'var(--mq-links)');
    if (/^(inset|top)$/.test(d.prop)) d.value = d.value.replace(/\b77px\b/g, 'var(--mq-boven)').replace(/\b96px\b/g, 'calc(var(--mq-boven) + 19px)').replace(/\b86px\b/g, 'calc(var(--mq-boven) + 9px)').replace(/\b76px\b/g, 'calc(var(--mq-boven) - 1px)');
    if (d.prop === 'scroll-margin-top') d.value = d.value.replace(/\b95px\b/g, 'calc(var(--mq-boven) + 18px)');
    const vast = regel.selectors.some(s => /(\.anchor-rail|\.popover-panel|\.adaptive-nav-scrim(:not\(\[hidden\]\))?|\.adaptive-nav-edge|\.horizontal-nav-popup|\.section-inline-settings)$/.test(s.trim()));
    const mobiel = regel.selectors.some(s => /\.bp-max-7[23]0\b/.test(s));
    if (vast && /^(left|top|scroll-margin-top)$/.test(d.prop)) {
      d.value = d.value.replace(/^(-?\d+)px(!important)?$/, (_, n, imp) => {
        n = Number(n);
        if (d.prop === 'left') return n >= 45 ? `calc(var(--mq-links) + ${n - 74}px)${imp || ''}` : `${n}px${imp || ''}`;
        if (n < 60) return `${n}px${imp || ''}`;
        return `calc(var(--mq-boven) + ${n - (mobiel ? 64 : 77)}px)${imp || ''}`;
      });
    }
    if (vast && d.prop === 'inset') d.value = d.value.replace(/^64px 0 0$/, 'var(--mq-boven) 0 0');
    if (d.prop === 'z-index') { const z = Number(d.value); if (Number.isFinite(z) && z >= 49) d.value = String(z + 400); }
    // Оболонка сайту вимикає transition кнопок і посилань через !important; анімації макета повертаємо тим самим способом.
    if (d.prop === 'transition' || d.prop.startsWith('transition-')) d.important = true;
    if (d.prop === 'position' && d.value === 'sticky' && regel.selector.includes('.topbar')) { /* top ставимо окремо */ }
    if (d.prop === 'top' && regel.selectors.some(s => /\.scroll-progress$/.test(s)) && d.value === '0') d.value = 'var(--mq-site)';
  });
  return true;
}

const wortel = postcss.parse(fs.readFileSync(BRON, 'utf8'));
const uitvoer = postcss.root();
for (const node of [...wortel.nodes]) {
  if (node.type === 'comment') continue;
  if (node.type === 'rule') { const k = node.clone(); if (verwerkRegel(k, '')) uitvoer.append(k); continue; }
  if (node.type === 'atrule') {
    if (node.name === 'media') {
      const bp = mediaNaarKlassen(node.params);
      if (bp === null) {
        // prefers-reduced-motion тощо: лишаємо @media, перетворюємо правила всередині
        const kopie = node.clone();
        kopie.walkRules(r => { if (!verwerkRegel(r, '')) r.remove(); });
        uitvoer.append(kopie);
      } else {
        for (const kind of node.nodes) {
          if (kind.type === 'rule') { const k = kind.clone(); if (verwerkRegel(k, bp) && k.nodes.length) uitvoer.append(k); }
          else if (kind.type === 'atrule') { const k = kind.clone(); k.walkRules(r => { if (!verwerkRegel(r, bp)) r.remove(); }); uitvoer.append(k); }
        }
      }
      continue;
    }
    uitvoer.append(node.clone()); // @keyframes, @supports, @property…
  }
}
const kop = `/* Стилі вигляду «Макет» центру облікового запису (IDENTITEIT-007). ЗГЕНЕРОВАНО з styles.css макета власника (ChatGPT, 2026-11-06)
   скриптом перетворення; не редагуйте вручну — зміни робіть у src/identiteit/maquette/maquette-omlijsting.css.
   Правила: body → ${PREFIX}; @media (max/min-width:N) → класи .bp-max-N/.bp-min-N, які двигун виставляє за шириною робочої області
   (не вікна: бічне меню сайту забирає ширину). Потрійний клас перемагає правило flat-content оболонки сайту (0,3,0), яке знімає радіуси й тіні.
   Зсуви: --mq-links (бічне меню сайту), --mq-site (командна смуга сайту), --mq-boven (смуга сайту + верхня планка макета). */
`;
fs.writeFileSync(UIT, kop + uitvoer.toString().replace(/\n{3,}/g, '\n\n'));
fs.writeFileSync(UIT.replace(/\.css$/, '-drempels.json'), JSON.stringify([...drempels].sort((a, b) => a - b)));
console.log('регул:', uitvoer.nodes.length, 'пороги:', [...drempels].sort((a, b) => a - b).join(','));
