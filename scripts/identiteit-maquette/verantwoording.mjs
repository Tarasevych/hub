// IDENTITEIT-015: відомість дій центру облікового запису. Джерело позицій — погоджене оформлення v49
// (src/identiteit/atelier-v49-gegevens.json: 12 розділів, 43 групи, 153 позиції) плюс позиції, додані живою картою
// (станНаСайті.додати у docs/ontwerp/identiteit-account/maquette-bron/реєстр.js). Рядки дій лежать у
// docs/ontwerp/identiteit-account/verantwoording/rijen-<розділ>.json — по рядку на кожну дію людини (одна позиція може мати кілька дій).
// Скрипт лише читає ці файли, перевіряє покриття й будує ВІДОМІСТЬ-ДІЙ.uk.md і ВІДОМІСТЬ-ДІЙ.json. Нічого не вигадує.
// Verantwoording van alle acties: dekking van de 153 posities controleren en de tabel opbouwen.
// Gebruik: node scripts/identiteit-maquette/verantwoording.mjs [--controleer]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MAP = 'docs/ontwerp/identiteit-account/verantwoording';
const UIT_MD = 'docs/ontwerp/identiteit-account/ВІДОМІСТЬ-ДІЙ.uk.md';
const UIT_JSON = 'docs/ontwerp/identiteit-account/ВІДОМІСТЬ-ДІЙ.json';
export const STATEN = ['працює в цьому оформленні', 'працює в іншому місці', 'частково працює', 'є лише в макеті', 'потребує налаштування власника', 'недоступно за задумом'];

/** Усі позиції v49 (і додані живою картою) як «розділ.група.індекс». */
export function posities() {
  const v49 = JSON.parse(readFileSync('src/identiteit/atelier-v49-gegevens.json', 'utf8'));
  const uit = [];
  for (const s of v49.secties) for (const g of v49.groepen[s.id]) g.рядки.forEach((r, i) => uit.push({ sleutel: `${s.id}.${g.id}.${i}`, sectie: s.id, groep: g.id, uk: r.uk, bron: 'v49' }));
  // Додані позиції живої карти: «додати» в станНаСайті (індекси йдуть після рядків v49).
  const reg = readFileSync('docs/ontwerp/identiteit-account/maquette-bron/реєстр.js', 'utf8');
  const blok = reg.slice(reg.indexOf('станНаСайті'));
  for (const m of blok.matchAll(/додати:\[([^\]]*)\]/g)) {
    // Ключ групи — найближчий зліва «"група":{» на тій самій глибині дужок (у групі можуть бути вкладені {…}).
    let diepte = 0, i = m.index - 1, groep = '';
    for (; i >= 0; i--) { const c = blok[i]; if (c === '}') diepte++; else if (c === '{') { if (diepte === 0) { groep = (blok.slice(Math.max(0, i - 80), i).match(/"([^"]+)":\s*$/) || [])[1] || ''; break; } diepte--; } }
    m[2] = m[1];
    const sectie = uit.find((p) => p.groep === groep)?.sectie;
    if (!sectie) continue;
    const basis = uit.filter((p) => p.sectie === sectie && p.groep === groep).length;
    [...m[2].matchAll(/uk:"([^"]+)"/g)].forEach((t, j) => uit.push({ sleutel: `${sectie}.${groep}.${basis + j}`, sectie, groep, uk: t[1], bron: 'жива карта (станНаСайті.додати)' }));
  }
  return uit;
}

export function rijen() {
  if (!existsSync(MAP)) return [];
  return readdirSync(MAP).filter((n) => /^rijen-.+\.json$/.test(n)).sort().flatMap((n) => JSON.parse(readFileSync(join(MAP, n), 'utf8')));
}

/** Перевірка: кожна позиція має дію, кожен стан — з дозволеного переліку, «працює…» — з перевіркою. */
export function controleer(ps = posities(), rs = rijen()) {
  const fouten = [];
  const per = new Map();
  for (const r of rs) { const k = `${r.sectie}.${r.groep}.${r.positie}`; per.set(k, (per.get(k) || 0) + 1); }
  for (const p of ps) if (!per.get(p.sleutel)) fouten.push(`позиція без дії: ${p.sleutel} «${p.uk}»`);
  const ids = new Set();
  for (const r of rs) {
    if (ids.has(r.id)) fouten.push(`повторний id: ${r.id}`); ids.add(r.id);
    for (const veld of ['staatVoor', 'staatNa']) if (r[veld] && !STATEN.includes(r[veld])) fouten.push(`${r.id}: невідомий ${veld} «${r[veld]}»`);
    const staat = r.staatNa || r.staatVoor;
    if (/^працює/.test(staat || '') && !(r.testen || []).some((t) => existsSync(t.split('#')[0]))) fouten.push(`${r.id}: «${staat}» без наявної перевірки в tests/`);
    if (staat === 'недоступно за задумом' && !(r.reden || r.ontbreekt)) fouten.push(`${r.id}: «недоступно за задумом» без причини`);
  }
  return { fouten, posities: ps.length, acties: rs.length };
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
function tabel(ps, rs) {
  const tel = (veld) => Object.fromEntries(STATEN.map((s) => [s, rs.filter((r) => (veld === 'na' ? (r.staatNa || r.staatVoor) : r.staatVoor) === s).length]));
  const posStaat = (veld) => { const m = {}; for (const p of ps) { const eigen = rs.filter((r) => `${r.sectie}.${r.groep}.${r.positie}` === p.sleutel).map((r) => (veld === 'na' ? (r.staatNa || r.staatVoor) : r.staatVoor)); const slechtst = STATEN.slice().reverse().find((s) => eigen.includes(s) && s !== 'недоступно за задумом') || eigen[0] || '—'; const k = eigen.every((s) => /^працює/.test(s)) ? 'усі дії працюють' : slechtst; m[k] = (m[k] || 0) + 1; } return m; };
  const r = [];
  r.push('> 🌐 **Мова:** **Українська** | [Головна](../../../README.md)', '', '# Відомість дій центру облікового запису (IDENTITEIT-015)', '');
  r.push('Згенеровано скриптом `node scripts/identiteit-maquette/verantwoording.mjs` з `docs/ontwerp/identiteit-account/verantwoording/rijen-*.json`. Вручну не правити — правити рядки JSON.', '');
  r.push(`Позицій погодженого оформлення: **${ps.filter((p) => p.bron === 'v49').length}** (v49) + **${ps.filter((p) => p.bron !== 'v49').length}** додано живою картою. Дій (рядків): **${rs.length}**.`, '');
  r.push('## Підсумок за станом дій', '', '| Стан | До роботи | Після |', '|---|---|---|');
  const voor = tel('voor'), na = tel('na');
  for (const s of STATEN) r.push(`| ${s} | ${voor[s]} | ${na[s]} |`);
  r.push('', '## Підсумок за позиціями', '', '| Кінцевий стан позиції | До роботи | Після |', '|---|---|---|');
  const pv = posStaat('voor'), pn = posStaat('na');
  for (const k of [...new Set([...Object.keys(pv), ...Object.keys(pn)])]) r.push(`| ${k} | ${pv[k] || 0} | ${pn[k] || 0} |`);
  const secties = [...new Set(ps.map((p) => p.sectie))];
  for (const s of secties) {
    r.push('', `## Розділ «${s}»`, '', '| Розділ і дія | Хто й умови | Стан до роботи | Де вже працює або чого бракує | Що змінити й від чого залежить | Ознака готовності | Стан після · версія · середовище | Доказ |', '|---|---|---|---|---|---|---|---|');
    for (const x of rs.filter((q) => q.sectie === s)) {
      const waar = [x.waar, (x.code || []).join(', '), x.opslag ? `зберігання: ${x.opslag}` : '', x.ontbreekt ? `бракує: ${x.ontbreekt}` : ''].filter(Boolean).join('; ');
      const na = [x.staatNa || '—', x.versie, x.omgeving].filter(Boolean).join(' · ');
      const bewijs = [...(x.testen || []), x.schermafdruk, x.resultaat].filter(Boolean).join('; ');
      r.push(`| **${esc(x.positieUk)}** — ${esc(x.actie)} | ${esc(x.wie)}; ${esc(x.voorwaarden)} | ${esc(x.staatVoor)} | ${esc(waar)} | ${esc(x.wijziging)} | ${esc(x.gereedAls)} | ${esc(na)} | ${esc(bewijs)} |`);
    }
  }
  return r.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('verantwoording.mjs')) {
  const ps = posities(), rs = rijen();
  const c = controleer(ps, rs);
  if (process.argv.includes('--controleer')) {
    console.log(`позицій ${c.posities}, дій ${c.acties}, помилок ${c.fouten.length}`);
    c.fouten.slice(0, 60).forEach((f) => console.log(' -', f));
    process.exit(c.fouten.length ? 1 : 0);
  }
  writeFileSync(UIT_MD, tabel(ps, rs));
  writeFileSync(UIT_JSON, JSON.stringify({ gegenereerd: 'scripts/identiteit-maquette/verantwoording.mjs', posities: ps, acties: rs }, null, 1) + '\n');
  console.log(`ВІДОМІСТЬ: позицій ${c.posities}, дій ${c.acties}, помилок покриття ${c.fouten.length}`);
}
