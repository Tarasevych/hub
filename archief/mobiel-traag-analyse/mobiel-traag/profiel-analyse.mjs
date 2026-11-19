// Zelftijd per functie uit een .cpuprofile, teruggezet naar bronbestand:regel via de verborgen bronkaarten.
import { readFileSync, existsSync } from 'node:fs';
import { TraceMap, originalPositionFor } from '/workspace/wp-telegram/boom/node_modules/@jridgewell/trace-mapping/dist/trace-mapping.mjs';
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const kaarten = new Map();
const kaart = (url) => { const f = url.replace(/^.*\/assets\//, ''); if (kaarten.has(f)) return kaarten.get(f); const m = `/workspace/mobiel-traag/dist-kaart/assets/${f}.map`; const t = existsSync(m) ? new TraceMap(readFileSync(m, 'utf8')) : null; kaarten.set(f, t); return t; };
const dt = p.timeDeltas; const zelf = new Map(); const tel = new Map();
for (let i = 0; i < p.samples.length; i++) tel.set(p.samples[i], (tel.get(p.samples[i]) || 0) + (dt[i] || 0));
const perNode = new Map(p.nodes.map((n) => [n.id, n]));
const ouder = new Map(); for (const n of p.nodes) for (const c of n.children || []) ouder.set(c, n.id);
const naam = (n) => { const cf = n.callFrame; if (!cf.url) return `(${cf.functionName || 'intern'})`; const t = cf.url.includes('/assets/') ? kaart(cf.url) : null; if (t) { const o = originalPositionFor(t, { line: cf.lineNumber + 1, column: cf.columnNumber }); if (o.source) return `${o.source.replace(/^.*?(src|shared|node_modules)\//, '$1/')}:${o.line} ${o.name || cf.functionName || ''}`; } return `${cf.url.replace(/^.*\//, '')}:${cf.lineNumber + 1} ${cf.functionName}`; };
const totaalPer = new Map();
let som = 0;
for (const [id, t] of tel) {
  const n = perNode.get(id); const k = naam(n); zelf.set(k, (zelf.get(k) || 0) + t); som += t;
  // inclusief: alle voorouders (één keer per sleutel)
  const gezien = new Set(); for (let x = id; x !== undefined; x = ouder.get(x)) { const kk = naam(perNode.get(x)); if (gezien.has(kk)) continue; gezien.add(kk); totaalPer.set(kk, (totaalPer.get(kk) || 0) + t); }
}
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(7)} ms  ${k}`).join('\n');
console.log(`totaal bemonsterd: ${(som / 1000).toFixed(0)} ms\n--- zelftijd ---\n${top(zelf, 30)}\n--- inclusief (alleen eigen bron) ---\n${top(new Map([...totaalPer].filter(([k]) => /^(src|shared)\//.test(k))), 40)}\n--- inclusief (node_modules) ---\n${top(new Map([...totaalPer].filter(([k]) => /^node_modules\//.test(k))), 15)}`);
