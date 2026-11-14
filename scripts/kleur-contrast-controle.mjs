// Контроль контрасту токенів дизайну (фундамент 20.10.2026). Читає src/ontwerp/tokens.css (статуси, фокус, текст на
// заливці) та ВСІ палітри (grifel/violet із src/canoniek-omlijsting.css, «Чистий» і «Кольоровий» із src/thema/paletten.ts)
// і перевіряє числом (WCAG 2.x): текст ≥ 4,5:1, великий текст/іконки/рамки фокуса ≥ 3:1 — в обох темах.
// Падає з кодом 1, якщо хоч одна пара не проходить. Викликається з `npm run build` і з тесту ontwerp-fundament-20261020.
// Gebruik: node scripts/kleur-contrast-controle.mjs [--stil]
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const stil = process.argv.includes('--stil');
// Шляхи відносно робочої теки (репозиторій): так само працює в бандлі тестів (tests/eenheid).
const lees = (p) => readFileSync(join(process.cwd(), p), 'utf8');

// ---------------------------------------------------------------- kleur
const hex = (h) => { let v = h.replace('#', ''); if (v.length === 3 || v.length === 4) v = v.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
const lum = (h) => { const [r, g, b] = hex(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const isHex = (v) => /^#[0-9a-f]{3,8}$/i.test(String(v).trim());

// ---------------------------------------------------------------- tokens.css → { licht:{naam:waarde}, donker:{…} }
function parseerTokens(css) {
  const uit = { licht: {}, donker: {} };
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  while ((m = re.exec(css))) {
    const sel = m[1].trim(), body = m[2];
    const donker = /theme-dark|theme-plum-dark/.test(sel), licht = /:root|theme-light|theme-plum-light/.test(sel);
    if (!donker && !licht) continue;
    for (const d of body.split(';')) {
      const i = d.indexOf(':'); if (i < 0) continue;
      const k = d.slice(0, i).trim(), v = d.slice(i + 1).trim();
      if (!k.startsWith('--')) continue;
      (donker ? uit.donker : uit.licht)[k] = v;
    }
  }
  return uit;
}
// canoniek-omlijsting.css: .canonical-chrome.theme-light{…} enz.
function parseerChrome(css) {
  const uit = {};
  for (const naam of ['theme-light', 'theme-dark', 'theme-plum-light', 'theme-plum-dark']) {
    const m = css.match(new RegExp(`\\.canonical-chrome\\.${naam}\\{([^}]*)\\}`));
    if (!m) throw new Error(`canoniek-omlijsting.css: .canonical-chrome.${naam} niet gevonden`);
    const w = {};
    for (const d of m[1].split(';')) { const i = d.indexOf(':'); if (i > 0 && d.trim().startsWith('--')) w[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
    uit[naam] = w;
  }
  return uit;
}
async function paletten() {
  const tmp = mkdtempSync(join('rapporten', 'contrast-'));
  try {
    const uitJs = join(tmp, 'paletten.mjs');
    await build({ entryPoints: ['src/thema/paletten.ts'], outfile: uitJs, bundle: true, platform: 'node', format: 'esm', logLevel: 'warning' });
    const { PUUR, KLASSIEK_WIT, KLASSIEK_ZWART, SECTIES, kleurWaarden } = await import(pathToFileURL(join(process.cwd(), uitJs)).href);
    const lijst = [
      { naam: 'puur licht', donker: false, w: PUUR.licht },
      { naam: 'puur donker', donker: true, w: PUUR.donker },
      { naam: 'klassiek-wit', donker: false, w: KLASSIEK_WIT },
      { naam: 'klassiek-zwart', donker: true, w: KLASSIEK_ZWART },
    ];
    for (const s of SECTIES) { const k = kleurWaarden(s); lijst.push({ naam: `kleur ${s} licht`, donker: false, w: k.licht }, { naam: `kleur ${s} donker`, donker: true, w: k.donker }); }
    return lijst.map((p) => ({ naam: p.naam, donker: p.donker, w: { '--bg': p.w.bg, '--panel': p.w.panel, '--surface': p.w.surface, '--surface2': p.w.surface2, '--line': p.w.line, '--text': p.w.text, '--muted': p.w.muted, '--faint': p.w.faint, '--accent': p.w.accent, '--accentText': p.w.accentText, '--accent-soft': p.w.accentSoft } }));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** Alle 26 paletten (grifel, violet, puur, 10 × kleur — elk licht en donker) als { naam, donker, w: {'--bg': hex, …} }, plus de
 *  tokens van tokens.css per modus. Ook gebruikt door tests/eenheid/contrast-knoppen-logos-20261021 (logo's, monogrammen). */
export async function allePaletten() {
  const tokens = parseerTokens(lees('src/ontwerp/tokens.css'));
  const chrome = parseerChrome(lees('src/canoniek-omlijsting.css'));
  const vlakken = [
    { naam: 'grifel licht', donker: false, w: chrome['theme-light'] }, { naam: 'grifel donker', donker: true, w: chrome['theme-dark'] },
    { naam: 'violet licht', donker: false, w: chrome['theme-plum-light'] }, { naam: 'violet donker', donker: true, w: chrome['theme-plum-dark'] },
    ...(await paletten()),
  ];
  // #fff → #ffffff, zodat elke waarde met dezelfde rekenregels werkt.
  for (const v of vlakken) for (const k of Object.keys(v.w)) if (/^#[0-9a-f]{3}$/i.test(v.w[k])) v.w[k] = `#${v.w[k].slice(1).split('').map((c) => c + c).join('')}`;
  return { tokens, vlakken };
}

export async function controleer() {
  const { tokens, vlakken } = await allePaletten();
  const fouten = [], paren = [];
  const eis = (naam, voor, achter, min) => {
    if (!isHex(voor) || !isHex(achter)) { fouten.push(`${naam}: geen hex (${voor} / ${achter})`); return; }
    const c = contrast(voor, achter); paren.push({ naam, c, min });
    if (c < min) fouten.push(`${naam}: ${c.toFixed(2)} < ${min}`);
  };
  const STATUS = ['ok', 'warn', 'fout', 'info'];
  // 1. tokens.css zelf: per modus verplicht aanwezig
  for (const modus of ['licht', 'donker']) {
    const t = tokens[modus];
    for (const s of STATUS) for (const suf of ['', '-zacht', '-vlak']) if (!isHex(t[`--${s}${suf}`])) fouten.push(`tokens.css ${modus}: --${s}${suf} ontbreekt of is geen hex`);
    for (const k of ['--text-on-vlak', '--focus', '--text-on-licht', '--text-on-donker']) if (!isHex(t[k])) fouten.push(`tokens.css ${modus}: ${k} ontbreekt of is geen hex`);
  }
  // 2. per palet (alle 14 × 2) tegen de statuskleuren en de eigen oppervlakken
  for (const v of vlakken) {
    const t = tokens[v.donker ? 'donker' : 'licht'], w = v.w;
    const opp = [['bg', w['--bg']], ['panel', w['--panel']], ['surface', w['--surface']], ['surface2', w['--surface2']]];
    for (const [on, bgk] of opp) {
      eis(`${v.naam}: text/${on}`, w['--text'], bgk, 4.5);
      eis(`${v.naam}: muted/${on}`, w['--muted'], bgk, 4.5);
      eis(`${v.naam}: faint/${on}`, w['--faint'], bgk, on === 'surface2' ? 3 : 4.5);
      eis(`${v.naam}: accent/${on}`, w['--accent'], bgk, on === 'bg' || on === 'panel' ? 4.5 : 3);
      for (const s of STATUS) { eis(`${v.naam}: ${s}/${on}`, t[`--${s}`], bgk, 4.5); eis(`${v.naam}: ${s}-vlak/${on} (rand, icoon)`, t[`--${s}-vlak`], bgk, 3); }
      eis(`${v.naam}: focus/${on}`, t['--focus'], bgk, 3);
    }
    eis(`${v.naam}: accentText/accent`, w['--accentText'], w['--accent'], 4.5);
    eis(`${v.naam}: accent/accent-soft`, w['--accent'], w['--accent-soft'], 4.5);
    eis(`${v.naam}: text/accent-soft`, w['--text'], w['--accent-soft'], 4.5);
    for (const s of STATUS) {
      eis(`${v.naam}: ${s}/${s}-zacht`, t[`--${s}`], t[`--${s}-zacht`], 4.5);
      eis(`${v.naam}: text/${s}-zacht`, w['--text'], t[`--${s}-zacht`], 4.5);
      eis(`${v.naam}: muted/${s}-zacht`, w['--muted'], t[`--${s}-zacht`], 4.5);
      eis(`${v.naam}: text-on-vlak/${s}-vlak`, t['--text-on-vlak'], t[`--${s}-vlak`], 4.5);
    }
    eis(`${v.naam}: text-on-licht/panel-licht`, t['--text-on-licht'], '#ffffff', 4.5);
    eis(`${v.naam}: text-on-donker/zwart`, t['--text-on-donker'], '#000000', 4.5);
  }
  return { fouten, paren, vlakken: vlakken.length };
}

const direct = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (direct) {
  const { fouten, paren, vlakken } = await controleer();
  const laagste = [...paren].sort((a, b) => a.c - b.c).slice(0, 5).map((p) => `${p.naam} ${p.c.toFixed(2)} (eis ${p.min})`);
  if (!stil) console.log(`kleur-contrast: ${paren.length} paren over ${vlakken} paletten; laagste: ${laagste.join(' | ')}`);
  if (fouten.length) { console.error(`kleur-contrast: ${fouten.length} paar/paren onder de eis:\n  ${fouten.join('\n  ')}`); process.exit(1); }
  if (!stil) console.log('kleur-contrast: alles ≥ eis');
}
