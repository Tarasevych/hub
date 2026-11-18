#!/usr/bin/env node
// РЕВІЗІЯ СПОВІЩЕНЬ / REVISIE VAN MELDINGEN (17.11.2026)
// Знаходить у коді КОЖНЕ місце, яке створює сповіщення, і порівнює з єдиним реєстром shared/meldingen-catalogus.ts.
// Vindt in de code elke plek die een melding maakt en vergelijkt die met het ene register shared/meldingen-catalogus.ts.
//
//   node scripts/meldingen-zoeken.mjs            → що є в коді, але бракує в реєстрі (і навпаки); код виходу 1, якщо є розбіжність
//   node scripts/meldingen-zoeken.mjs --json     → усі знайдені місця як JSON (для ревізії)
//
// Канали / kanalen:
//   bel        — meld()/notify()/siteMelding()/deelMelden()/melder() у backend/ (дзвіночок, зберігається на сервері)
//   toast      — emitCanonicalNotice() у src/ (миттєве повідомлення сторінки)
//   activiteit — SITE_LABELS у src/connector-activiteit.ts (журнал активності в центрі сповіщень)
//   extensie   — stuurMeldingNaarServer() у extension/ (розширення Chrome → центр сповіщень)
//   telegram   — naarTelegrams() у backend/telegram-aanmelden (картки в Telegram)
//   email      — notification_jobs channel 'email' у backend/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const W = process.cwd();
const lees = (f) => readFileSync(join(W, f), 'utf8');
const bestanden = (map, re) => readdirSync(join(W, map)).flatMap((n) => {
  const p = `${map}/${n}`;
  if (n === 'node_modules' || n.startsWith('.')) return [];
  return statSync(join(W, p)).isDirectory() ? bestanden(p, re) : re.test(n) ? [p] : [];
});

/** Аргументи виклику до закривальної дужки (рядки, шаблони й вкладені дужки пропускаються правильно). */
export function argumenten(s, start) {
  let diep = 1, i = start;
  for (; i < s.length && diep > 0; i++) {
    const c = s[i];
    if (c === "'" || c === '"') { const q = c; for (i++; i < s.length && s[i] !== q; i++) if (s[i] === '\\') i++; continue; }
    if (c === '`') { let d = 0; for (i++; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '$' && s[i + 1] === '{') { d++; i++; continue; } if (s[i] === '}' && d) { d--; continue; } if (s[i] === '`' && !d) break; } continue; }
    if (c === '(' || c === '{' || c === '[') diep++; else if (c === ')' || c === '}' || c === ']') diep--;
  }
  return s.slice(start, i - 1);
}
/** Розбиває аргументи верхнього рівня за комами. */
function delen(a) {
  const uit = []; let diep = 0, begin = 0;
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (c === "'" || c === '"') { const q = c; for (i++; i < a.length && a[i] !== q; i++) if (a[i] === '\\') i++; continue; }
    if (c === '`') { let d = 0; for (i++; i < a.length; i++) { if (a[i] === '\\') { i++; continue; } if (a[i] === '$' && a[i + 1] === '{') { d++; i++; continue; } if (a[i] === '}' && d) { d--; continue; } if (a[i] === '`' && !d) break; } continue; }
    if ('([{'.includes(c)) diep++; else if (')]}'.includes(c)) diep--;
    else if (c === ',' && !diep) { uit.push(a.slice(begin, i).trim()); begin = i + 1; }
  }
  uit.push(a.slice(begin).trim());
  return uit;
}
const regel = (s, i) => s.slice(0, i).split('\n').length;
const tekstVan = (x) => String(x || '').replace(/\s+/g, ' ').slice(0, 400);
/** Сталі на кшталт `const RESERVE_SOORT = 'reserve_herinnering'` у тому ж файлі. */
const constanten = (s) => Object.fromEntries([...s.matchAll(/(?:const|let)\s+([A-Z_][A-Z0-9_]*)\s*(?::\s*[^=]+)?=\s*'([a-z0-9_.-]+)'/g)].map((m) => [m[1], m[2]]));
const literaal = (x, c) => { const m = /^'([a-z0-9_.-]+)'$/.exec(x || ''); if (m) return [m[1]]; if (c[x]) return [c[x]]; const t = [...String(x || '').matchAll(/'([a-z][a-z0-9_.]*_[a-z0-9_.]*|[a-z]+\.[a-z_.]+)'/g)].map((y) => y[1]); return t.length ? t : ['?']; };

export function zoek() {
  const vondsten = [];
  const voeg = (v) => vondsten.push(v);
  // ── bel: backend
  for (const f of [...bestanden('backend', /\.(ts|mts)$/), ...bestanden('server', /\.(ts|mts)$/)]) {
    const s = lees(f); const c = constanten(s);
    for (const m of s.matchAll(/(?<![\w.])(meld|notify|melder)\(/g)) {
      if (/function\s*$|async\s*$/.test(s.slice(Math.max(0, m.index - 16), m.index))) continue;
      const a = delen(argumenten(s, m.index + m[0].length));
      if (/^\{/.test(a[0] || '')) continue; // zoek-index meld({…}) — geen melding
      let soortArg, titel;
      if (m[1] === 'meld' && a.length >= 4) { // meld(userId, kind, titel, …) of meld(id, email, kind, …)
        const k1 = literaal(a[1], c), k2 = literaal(a[2], c);
        if (k1[0] !== '?' && a[1] !== "''") { soortArg = a[1]; titel = a[2]; } else { soortArg = a[2]; titel = a[3]; void k2; }
      } else if (m[1] === 'notify') {
        if (a.length >= 5) { soortArg = a[2]; titel = a[3]; } else { soortArg = a[0]; titel = a[1]; }
      } else if (m[1] === 'melder' && a.length >= 2 && /apps-overdracht/.test(f)) { soortArg = "'mcp_app_secret'"; titel = a[1]; }
      else continue;
      if (!soortArg || /^(k|kind|soort)$/.test(soortArg)) continue; // doorgeefluik (index.ts: meld: (…, kind, …) => notify(…, kind, …))
      for (const soort of literaal(soortArg, c)) voeg({ kanaal: 'bel', bestand: f, regel: regel(s, m.index), soort, titel: tekstVan(titel) });
    }
    for (const m of s.matchAll(/(?<![\w.])(?:siteMelding|aanmeldSiteMelding)\(/g)) {
      if (/function\s*$/.test(s.slice(Math.max(0, m.index - 16), m.index))) continue;
      const a = delen(argumenten(s, m.index + m[0].length));
      voeg({ kanaal: 'bel', bestand: f, regel: regel(s, m.index), soort: 'security', titel: tekstVan(a[1]) });
    }
    for (const m of s.matchAll(/(?<![\w.])beheerAlarm\(/g)) {
      if (/function\s*$/.test(s.slice(Math.max(0, m.index - 16), m.index))) continue;
      voeg({ kanaal: 'bel', bestand: f, regel: regel(s, m.index), soort: 'security', titel: '🚨 Telegram: тривога безпеки' });
    }
    for (const m of s.matchAll(/(?<![\w.])deelMelden\(/g)) {
      if (/function\s*$/.test(s.slice(Math.max(0, m.index - 16), m.index))) continue;
      const a = delen(argumenten(s, m.index + m[0].length));
      for (const soort of literaal(a[1], c)) voeg({ kanaal: 'bel', bestand: f, regel: regel(s, m.index), soort, titel: '(deelMeldingTekst)' });
    }
    for (const m of s.matchAll(/(?<![\w.])naarTelegrams\(/g)) {
      if (/function\s*$/.test(s.slice(Math.max(0, m.index - 16), m.index))) continue;
      const a = delen(argumenten(s, m.index + m[0].length));
      voeg({ kanaal: 'telegram', bestand: f, regel: regel(s, m.index), soort: literaal(a[2], c)[0], titel: '' });
    }
    for (const m of s.matchAll(/channel:\s*'email'[^}]*kind:\s*'([a-z_.]+)'/g)) voeg({ kanaal: 'email', bestand: f, regel: regel(s, m.index), soort: m[1], titel: '' });
  }
  // ── toast: src
  for (const f of bestanden('src', /\.(ts|tsx)$/)) {
    const s = lees(f);
    for (const m of s.matchAll(/emitCanonicalNotice\(/g)) {
      if (/(const|function)\s+emitCanonicalNotice\s*=?\s*$|export const\s*$/.test(s.slice(Math.max(0, m.index - 30), m.index + 19))) continue;
      const a = argumenten(s, m.index + m[0].length);
      if (!a.trim()) continue;
      const bron = /source\s*:\s*'([^']+)'/.exec(a)?.[1] || (/\bsource\b/.test(a) ? '(variabel)' : '?');
      const tekst = /text\s*:\s*(?:t|tr)\(\s*[`']([^`']{0,100})/.exec(a)?.[1] || '';
      voeg({ kanaal: 'toast', bestand: f, regel: regel(s, m.index), soort: bron, titel: tekst });
    }
  }
  // ── activiteit
  { const f = 'src/connector-activiteit.ts'; const s = lees(f);
    for (const m of s.matchAll(/'(owner\.[a-z_.]+)'\s*:\s*\['([^']+)'/g)) voeg({ kanaal: 'activiteit', bestand: f, regel: regel(s, m.index), soort: m[1], titel: m[2] }); }
  // ── extensie
  for (const f of bestanden('extension', /\.js$/)) {
    const s = lees(f);
    for (const m of s.matchAll(/stuurMeldingNaarServer\(/g)) {
      if (/function\s*$/.test(s.slice(Math.max(0, m.index - 16), m.index))) continue;
      const a = argumenten(s, m.index + m[0].length);
      const sleutel = /sleutel:\s*`ext:([a-z-]+)/.exec(a)?.[1] || '?';
      voeg({ kanaal: 'extensie', bestand: f, regel: regel(s, m.index), soort: `extensie.${sleutel}`, titel: tekstVan(/titel:\s*([^\n]+)/.exec(a)?.[1]) });
    }
  }
  return vondsten;
}

const isHoofd = process.argv[1] && relative(W, process.argv[1]).replace(/\\/g, '/') === 'scripts/meldingen-zoeken.mjs';
if (isHoofd) {
  const v = zoek();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(v, null, 1)); process.exit(0); }
  const per = {}; for (const x of v) per[x.kanaal] = (per[x.kanaal] || 0) + 1;
  console.log('Знайдено місць / gevonden plekken:', v.length, per);
}
