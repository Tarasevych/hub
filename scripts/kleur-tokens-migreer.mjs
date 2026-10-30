// Міграція «сирих» кольорів у CSS сторінок на токени фундаменту (src/ontwerp/tokens.css). 20.10.2026.
// Що робить (тільки однозначні випадки, по контексту властивості):
//   • color/fill/stroke/border*/outline з hex сірого тексту → var(--text|--muted|--faint); лінії → var(--line)
//   • background з білого/світло-сірого → var(--panel|--surface|--surface2)
//   • статусні кольори (червоний/бурштиновий/зелений/синій): текст/рамка → var(--fout|--warn|--ok|--info),
//     суцільна заливка → var(--…-vlak) (і color:#fff у тому самому блоці → var(--text-on-vlak)), світла підкладка → var(--…-zacht)
//   • акцент grifel (#2f6f73 / #8dbab7) → var(--accent); color:#fff поруч із background:accent → var(--text-on-accent)
//   • @media (prefers-color-scheme:dark){…} → .theme-dark …,.theme-plum-dark … (тема сайту, не пристрою)
//   • font-size < 12px для тексту (10–11.5px, .62–.74rem) → 12px / .75rem (мініатюри ≤ 9px не чіпає)
// Запасні значення var(--x,#hex) не чіпає (вони безпечні, коли --x визначено — tokens.css визначає всі псевдоніми).
// Gebruik: node scripts/kleur-tokens-migreer.mjs [--schrijf] [--alleen=pad,pad] [--sla-over=pad,pad]   (без --schrijf лише звіт)
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const schrijf = argv.includes('--schrijf');
const alleen = (argv.find((a) => a.startsWith('--alleen=')) || '').slice(9).split(',').filter(Boolean);
const slaOver = (argv.find((a) => a.startsWith('--sla-over=')) || '').slice(11).split(',').filter(Boolean);

/** Файли тем/токенів/бренду — єдине місце, де hex дозволений. */
export const TOKENBESTANDEN = ['src/ontwerp/tokens.css', 'src/thema/paletten.css', 'src/canoniek-omlijsting.css', 'src/merk/merk.css', 'src/vlaggen/vlaggen.css'];

const T = {
  text: ['#0f172a', '#17212b', '#111', '#111111', '#1d2329', '#172033', '#111827', '#1f2937', '#0d1117', '#24292f', '#1e293b', '#0b1220', '#101418', '#1a1a1a', '#222', '#222222', '#333', '#333333', '#000', '#000000', '#35243a', '#1f1f1f', '#202124', '#0d1b2a', '#102426'],
  muted: ['#64748b', '#4b5563', '#6a7580', '#6b7280', '#475569', '#57606a', '#667085', '#5b6570', '#5f6b76', '#55616c', '#334155', '#374151', '#5f6873', '#5a6672', '#4b4b4b', '#444', '#444444', '#555', '#555555', '#5c6670', '#5d6b7a', '#5f6368', '#616e7c', '#6e7781', '#746077'],
  faint: ['#94a3b8', '#9ca3af', '#8a949e', '#89949e', '#a1a1aa', '#8f9aa4', '#9aa5b0', '#8b949e', '#6b7681', '#a3aeb9', '#8a8f98', '#9aa0a6', '#888', '#888888', '#999', '#999999'],
  line: ['#d7dee8', '#dce1e6', '#e1e5e9', '#cbd5e1', '#d6dde4', '#c4ccd4', '#d0d7de', '#d7e0ea', '#d5dbe1', '#e5e7eb', '#dbe2e8', '#dbe3ec', '#e2e8f0', '#e6edf3', '#b6c2d0', '#e7edf3', '#edf1f5', '#d8dee4', '#dde3e8', '#d9dee3', '#e3e8ee', '#e5eaf0', '#dfe5ec', '#ccc', '#cccccc', '#ddd', '#dddddd', '#eee', '#eeeeee', '#e0e0e0', '#d4d4d4', '#dadce0', '#c8d1dc', '#d1d5db'],
  panel: ['#fff', '#ffffff', '#fffafd', '#fafcfc', '#fbfbfb', '#fdfdfd'],
  surface: ['#f8fafc', '#f6f7f9', '#f1f5f9', '#f7f9fb', '#f9fafb', '#f3f4f6', '#eef1f4', '#eef3f8', '#f6f8fb', '#f5f5f5', '#f1f3f5', '#f4f6f8', '#f7f8fa', '#f5f7f9', '#f5f7fa', '#f4f7fb', '#f9f9f9', '#fafafa', '#f3f5f8', '#f6f8fa', '#f0f2f5', '#f0f3f6', '#f2f4f7'],
  surface2: ['#edf2f5', '#e7ebef', '#eef2f7', '#e9edf1', '#e9ecef', '#eaeef2', '#e8ecf0', '#ebebeb', '#e4e8ec'],
  fout: ['#b42318', '#b91c1c', '#b3261e', '#dc2626', '#a4161a', '#c0392b', '#b13b42', '#7a1610', '#991b1b', '#ef4444', '#f87171', '#fca5a5', '#cf222e', '#e11d48', '#c53030', '#d03b3b', '#ec6b6b', '#a63f57', '#ff9db3', '#ffaaa3', '#7f1d1d', '#660708', '#f85149', '#ff8a7a', '#ff8a80', '#fecaca', '#e5484d', '#d1242f', '#9f1239', '#be123c'],
  warn: ['#b45309', '#d97706', '#f59e0b', '#fbbf24', '#92400e', '#9a6700', '#b9770e', '#b7791f', '#c2410c', '#f5b400', '#d29922', '#78350f', '#8a4b06', '#a8660a', '#f0b255', '#b97a00', '#fab219', '#f5a524', '#d98a14', '#c2603d', '#ea580c', '#fb923c', '#fdba74', '#c2570c', '#a16207', '#ca8a04', '#eab308', '#fcd34d', '#fde68a', '#ffd60a', '#e3b341', '#bf8700'],
  ok: ['#1a7f37', '#15803d', '#16a34a', '#4ade80', '#4ac26b', '#2f7d5a', '#2b8a57', '#22c55e', '#34d399', '#6ee7b7', '#166534', '#0e7c6b', '#267653', '#3fb950', '#10b981', '#059669', '#047857', '#064e3b', '#065f46', '#1d7a4c', '#0f766e', '#1f8a4c', '#5fd08d', '#11552b', '#7ee2a8', '#0c8a0c', '#4cc24c', '#95c8a8', '#9dc0a7', '#4f775e', '#6fd69b', '#86efac', '#2da44e', '#1a7f37', '#067647', '#0d9488', '#14b8a6', '#5eead4', '#0f5132'],
  info: ['#1d4ed8', '#2563eb', '#1a73e8', '#1f5fbf', '#3b82f6', '#93c5fd', '#60a5fa', '#0969da', '#58a6ff', '#1a5fd6', '#2a78d6', '#1e40af', '#4285d4', '#2f4b80', '#6da7ec', '#7aa7ff', '#a5c8ff', '#1e3a8a', '#0284c7', '#027fbd', '#6aa4ec', '#bcd0f7', '#4e6f8e', '#2563eb', '#1d4ed8', '#0969da', '#1f6feb'],
  accent: ['#2f6f73', '#8dbab7', '#2d6a6d', '#7fd1c9', '#146b6d', '#173b3d'],
  zacht: { fout: ['#fee2e2', '#fef2f2', '#fecaca', '#fde8e8', '#fff1f2', '#ffe4e6', '#fdecea', '#fbe9e7', '#fde2e1'], warn: ['#fef3c7', '#fffbeb', '#fff4e5', '#fef9c3', '#fdf6e3', '#fff7ed', '#ffedd5', '#fef0c7', '#fde68a'], ok: ['#dcfce7', '#f0fdf4', '#d1fae5', '#ecfdf5', '#e6f4ea', '#e3f6ea', '#def7ec', '#e0f2e9', '#d8f3dc'], info: ['#dbeafe', '#eff6ff', '#e0f2fe', '#f0f9ff', '#e8f0fe', '#dbe9fd', '#e6f0ff', '#e3eefc'] },
};
const lower = (h) => h.toLowerCase();
const set = (arr) => new Set(arr.map(lower));
const S = { text: set(T.text), muted: set(T.muted), faint: set(T.faint), line: set(T.line), panel: set(T.panel), surface: set(T.surface), surface2: set(T.surface2), fout: set(T.fout), warn: set(T.warn), ok: set(T.ok), info: set(T.info), accent: set(T.accent) };
const ZACHT = {}; for (const [k, v] of Object.entries(T.zacht)) for (const h of v) ZACHT[lower(h)] = k;
const statusVan = (h) => (S.fout.has(h) ? 'fout' : S.warn.has(h) ? 'warn' : S.ok.has(h) ? 'ok' : S.info.has(h) ? 'info' : null);
const LICHTTEKST = new Set(['#fff', '#ffffff', '#f8fafc', '#f3f6f8', '#fafafa', '#f9fafb', '#eef1f3', '#f4f7f9', '#e6edf3']);

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
/** Замінює hex у значенні (поза var(…)) через функцію; var(--x,#hex) лишає як є. */
function vervangBuitenVar(val, fn) {
  let uit = '', i = 0;
  while (i < val.length) {
    const j = val.indexOf('var(', i);
    if (j < 0) { uit += val.slice(i).replace(HEX, fn); break; }
    uit += val.slice(i, j).replace(HEX, fn);
    let d = 0, k = j;
    for (; k < val.length; k++) { if (val[k] === '(') d++; else if (val[k] === ')') { d--; if (d === 0) { k++; break; } } }
    uit += val.slice(j, k); i = k;
  }
  return uit;
}

/** Один блок декларацій (між { і }). `donkerScope` = селектор обмежений темною темою (.theme-dark / prefers dark):
 *  там темний текст (#0b1220) означає «текст на світлому вкрапленні» → --text-on-licht, а світлий фон (#fff/#e5e7eb) —
 *  «завжди світлий папір» (лист HTML, плитка логотипа) → --papier/--papier-zacht, а не --panel/--line. */
function migreerBlok(body, stat, donkerScope = false) {
  const decls = body.split(';');
  // контекст: чи є в блоці заливка акцентом/статусом (для color:#fff)
  let vlakContext = null;
  for (const d of decls) {
    const m = d.match(/^\s*(background|background-color)\s*:(.*)$/); if (!m) continue;
    if (/var\(--accent[,)]/.test(m[2]) && !/accent-soft/.test(m[2])) vlakContext = 'accent';
    const vl = m[2].match(/var\(--(ok|warn|fout|info)(-vlak)?[,)]/); if (vl) vlakContext = vl[1];
    const hs = (m[2].replace(/var\([^)]*\)/g, '').match(HEX) || []).map(lower);
    for (const h of hs) { if (S.accent.has(h)) vlakContext = 'accent'; else { const s = statusVan(h); if (s && !ZACHT[h]) vlakContext = s; } }
  }
  return decls.map((d) => {
    const m = d.match(/^(\s*)([a-zA-Z-]+)(\s*):(.*)$/); if (!m) return d;
    const [, voor, prop, tussen, val] = m;
    if (prop.startsWith('--')) return d; // локальні токени сторінок лишаються
    let nieuw = val;
    const fs = prop === 'font-size' ? val.trim() : null;
    if (fs) {
      const px = fs.match(/^(1[01](?:\.\d+)?|10\.5)px$/), rem = fs.match(/^0?\.(6[2-9]|7[0-4])\d*rem$/);
      if (px) { stat.font++; return `${voor}${prop}${tussen}:12px`; }
      if (rem) { stat.font++; return `${voor}${prop}${tussen}:.75rem`; }
      return d;
    }
    const kleurProp = /^(color|fill|stroke|border|border-color|border-top|border-right|border-bottom|border-left|border-top-color|border-right-color|border-bottom-color|border-left-color|outline|outline-color|background|background-color|box-shadow|accent-color|caret-color|text-decoration-color)$/.test(prop);
    if (!kleurProp) return d;
    const isBg = prop === 'background' || prop === 'background-color';
    const isRand = /^border|^outline/.test(prop);
    nieuw = vervangBuitenVar(val, (h0) => {
      const h = lower(h0);
      if (prop === 'box-shadow') return h0; // тіні лишаємо (напівпрозорі rgba і так переважають)
      if (isBg) {
        if (donkerScope) { if (S.panel.has(h)) return 'var(--papier)'; if (S.surface.has(h) || S.surface2.has(h) || S.line.has(h)) return 'var(--papier-zacht)'; }
        if (S.panel.has(h)) return 'var(--panel)';
        if (S.surface.has(h)) return 'var(--surface)';
        if (S.surface2.has(h)) return 'var(--surface2)';
        if (S.accent.has(h)) return 'var(--accent)';
        if (ZACHT[h]) return `var(--${ZACHT[h]}-zacht)`;
        const s = statusVan(h); if (s) return `var(--${s}-vlak)`;
        if (S.line.has(h)) return 'var(--line)';
        return h0; // чорні/темні заливки (термінал, відео) лишаються — це не текст
      }
      if (isRand) {
        if ((prop === 'outline' || prop === 'outline-color') && (S.info.has(h) || S.warn.has(h) || S.accent.has(h))) return 'var(--focus)';
        if (donkerScope && (S.line.has(h) || S.surface2.has(h))) return 'var(--papier-zacht)';
        if (S.line.has(h)) return 'var(--line)';
        const s = statusVan(h); if (s) return `var(--${s})`;
        if (S.accent.has(h)) return 'var(--accent)';
        if (S.panel.has(h)) return 'var(--panel)';
        if (S.muted.has(h) || S.faint.has(h)) return 'var(--line)';
        return h0;
      }
      // color / fill / stroke / accent-color / caret-color
      if (donkerScope) { if (S.text.has(h) || S.muted.has(h)) return vlakContext === 'accent' ? 'var(--text-on-accent)' : vlakContext ? 'var(--text-on-vlak)' : 'var(--text-on-licht)'; if (LICHTTEKST.has(h)) return vlakContext ? 'var(--text-on-vlak)' : 'var(--text)'; }
      if (LICHTTEKST.has(h)) return vlakContext === 'accent' ? 'var(--text-on-accent)' : vlakContext ? 'var(--text-on-vlak)' : h0;
      if (S.text.has(h)) return vlakContext ? 'var(--text-on-vlak)' : 'var(--text)';
      if (S.muted.has(h)) return 'var(--muted)';
      if (S.faint.has(h)) return 'var(--faint)';
      if (S.accent.has(h)) return 'var(--accent)';
      const s = statusVan(h); if (s) return `var(--${s})`;
      if (S.line.has(h)) return 'var(--line)';
      return h0;
    });
    if (nieuw !== val) stat.kleur += (val.match(HEX) || []).length - (nieuw.match(HEX) || []).length;
    return `${voor}${prop}${tussen}:${nieuw}`;
  }).join(';');
}

/** @media (prefers-color-scheme:dark){ A{…} B{…} } → .theme-dark A,.theme-plum-dark A{…} … */
function migreerPrefers(css, stat) {
  const re = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{/g; let m, uit = '', i = 0;
  while ((m = re.exec(css))) {
    let d = 1, k = re.lastIndex;
    for (; k < css.length && d > 0; k++) { if (css[k] === '{') d++; else if (css[k] === '}') d--; }
    const binnen = css.slice(re.lastIndex, k - 1);
    if (/@media|@supports|@container/.test(binnen)) { uit += css.slice(i, k); i = k; continue; } // вкладені at-rules не чіпаємо
    const herschreven = binnen.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel, body) => {
      const lijst = sel.split(',').map((s) => s.trim()).filter(Boolean);
      const nieuw = lijst.flatMap((s) => (/^(html|:root)\b/.test(s) ? [s.replace(/^(html|:root)/, 'html.theme-dark'), s.replace(/^(html|:root)/, 'html.theme-plum-dark')] : [`.theme-dark ${s}`, `.theme-plum-dark ${s}`]));
      return `${nieuw.join(',')}{${body}}`;
    });
    uit += css.slice(i, m.index) + herschreven.trim(); i = k; stat.prefers++;
    re.lastIndex = k;
  }
  return uit + css.slice(i);
}

export function migreerCss(css) {
  const stat = { kleur: 0, font: 0, prefers: 0 };
  let uit = migreerPrefers(css, stat);
  // блоки декларацій: усе між { і наступним } без вкладених {; селектор перед блоком визначає темний скоуп
  uit = uit.replace(/([^{}]*)\{([^{}]*)\}/g, (_, sel, body) => `${sel}{${migreerBlok(body, stat, /theme-dark|theme-plum-dark/.test((sel.split('}').pop() || '').replace(/:not\([^)]*\)/g, '')))}}`);
  return { css: uit, stat };
}

export function telHex(css) { return (css.match(HEX) || []).length; }
export function telRauweHex(css) { let n = 0; css.replace(/\{([^{}]*)\}/g, (_, body) => { for (const d of body.split(';')) { const m = d.match(/^\s*([a-zA-Z-]+)\s*:(.*)$/); if (!m || m[1].startsWith('--')) continue; n += (vervangBuitenVar(m[2], () => 'X').match(/X/g) || []).length; } return ''; }); return n; }

export function cssBestanden(wortel = 'src') { const uit = []; const loop = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) loop(p); else if (p.endsWith('.css')) uit.push(p.replace(/\\/g, '/')); } }; loop(wortel); return uit.sort(); }

const direct = process.argv[1] && process.argv[1].endsWith('kleur-tokens-migreer.mjs');
if (direct) {
  const bestanden = cssBestanden().filter((p) => !TOKENBESTANDEN.includes(p)).filter((p) => (alleen.length ? alleen.some((a) => p.startsWith(a)) : true)).filter((p) => !slaOver.some((a) => p.startsWith(a)));
  let totKleur = 0, totFont = 0, totPrefers = 0, voorHex = 0, naHex = 0;
  for (const p of bestanden) {
    const css = readFileSync(p, 'utf8');
    const { css: nieuw, stat } = migreerCss(css);
    voorHex += telHex(css); naHex += telHex(nieuw);
    totKleur += stat.kleur; totFont += stat.font; totPrefers += stat.prefers;
    if (nieuw !== css) { if (schrijf) writeFileSync(p, nieuw); console.log(`${schrijf ? 'geschreven' : 'zou wijzigen'} ${p}: ${stat.kleur} kleuren, ${stat.font} font-size, ${stat.prefers} prefers-color-scheme`); }
  }
  console.log(`${bestanden.length} bestanden; hex ${voorHex} → ${naHex}; kleuren ${totKleur}, font-size ${totFont}, prefers ${totPrefers}${schrijf ? '' : ' (droog — voeg --schrijf toe)'}`);
}
