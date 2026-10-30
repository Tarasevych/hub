// «Створювати схеми» (21.10.2026): de AI geeft Mermaid-code, de server CONTROLEERT die en bewaart haar als .mmd in de hmara van
// de mens; de site tekent haar in de browser met de eigen gebundelde Mermaid (geen CDN), met securityLevel «strict».
//
// Deze controle is bewust STRENG en eerlijk over wat zij is: geen volledige Mermaid-parser (die heeft een DOM nodig), maar de
// regels die ertoe doen vóór iets in iemands opslag komt:
//   • een bekend diagramtype op de eerste betekenisvolle regel (flowchart/graph met richting, sequenceDiagram, classDiagram, …);
//   • GEEN init-directives (%%{init: …}%%) en geen frontmatter-config: daarmee kan een diagram securityLevel, thema-CSS of
//     scripts omzetten. Alleen «title:» in frontmatter mag;
//   • geen HTML-tags die iets laden of uitvoeren (<script>, <iframe>, <img>, <object>, <embed>, <style>, on…=), geen
//     javascript:/data:/vbscript:-adressen, geen url(…) in stijlen, geen click-callbacks — alleen `click X "https://…"`;
//   • haakjes en aanhalingstekens per regel in evenwicht; subgraph/end en de blokken van sequenceDiagram (loop/alt/opt/par/
//     critical/break/rect … end) kloppen;
//   • grenzen: hoogstens 20 000 tekens en 800 regels.
// De browser parseert daarna echt (mermaid.parse); faalt dat, dan toont de pagina de code met de fout — nooit iets half.
// Puur: server, pagina en test gebruiken dezelfde functie.

export const MERMAID_MAX_TEKENS = 20_000;
export const MERMAID_MAX_REGELS = 800;
export const MERMAID_TYPES = Object.freeze([
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'classDiagram-v2', 'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'journey', 'gantt', 'pie',
  'quadrantChart', 'requirementDiagram', 'gitGraph', 'mindmap', 'timeline', 'sankey-beta', 'xychart-beta', 'block-beta', 'packet-beta', 'architecture-beta',
  'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment', 'kanban', 'radar-beta', 'treemap-beta',
] as const);
export type MermaidType = typeof MERMAID_TYPES[number];

export type MermaidOordeel = { ok: true; type: MermaidType; code: string; regels: number; titel: string } | { ok: false; code: string; regel: number; uitleg: string };

const fout = (code: string, regel: number, uitleg: string): MermaidOordeel => ({ ok: false, code, regel, uitleg });
const RICHTING = /^(TB|TD|BT|RL|LR)$/;
const GEVAARLIJK = [
  { re: /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|img|svg|foreignobject|form|input|base)\b/i, code: 'MERMAID_HTML' },
  { re: /\bon[a-z]+\s*=/i, code: 'MERMAID_HTML' },
  { re: /\b(javascript|vbscript)\s*:/i, code: 'MERMAID_ADRES' },
  { re: /\bdata\s*:\s*[a-z]+\/[a-z0-9.+-]+/i, code: 'MERMAID_ADRES' },
  { re: /url\s*\(/i, code: 'MERMAID_ADRES' },
  { re: /%%\s*\{/, code: 'MERMAID_DIRECTIEF' },
];

/** Haakjes en aanhalingstekens van één regel (tekst tussen "…" telt niet mee). */
function inEvenwicht(regel: string): boolean {
  let inTekst = false;
  const stapel: string[] = [];
  const paar: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (const c of regel) {
    if (c === '"') { inTekst = !inTekst; continue; }
    if (inTekst) continue;
    if (c === '(' || c === '[' || c === '{') stapel.push(c);
    else if (c === ')' || c === ']' || c === '}') { if (stapel.pop() !== paar[c]) return false; }
  }
  return !inTekst && stapel.length === 0;
}

/** Controleer Mermaid-code. `code` is daarna genormaliseerd (regeleinden \n, geen BOM, geen spaties achteraan). */
export function controleerMermaid(invoer: unknown): MermaidOordeel {
  if (typeof invoer !== 'string') return fout('MERMAID_LEEG', 0, 'Mermaid code is missing.');
  const code = invoer.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').map((r) => r.replace(/\s+$/, '')).join('\n').trim();
  if (!code) return fout('MERMAID_LEEG', 0, 'Mermaid code is empty.');
  if (code.length > MERMAID_MAX_TEKENS) return fout('MERMAID_TE_GROOT', 0, `Mermaid code is longer than ${MERMAID_MAX_TEKENS} characters.`);
  const regels = code.split('\n');
  if (regels.length > MERMAID_MAX_REGELS) return fout('MERMAID_TE_GROOT', 0, `Mermaid code has more than ${MERMAID_MAX_REGELS} lines.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(code)) return fout('MERMAID_TEKENS', 0, 'Mermaid code contains control characters.');
  for (let i = 0; i < regels.length; i++) {
    for (const g of GEVAARLIJK) if (g.re.test(regels[i])) return fout(g.code, i + 1, g.code === 'MERMAID_DIRECTIEF' ? 'Init directives (%%{ … }%%) are not allowed: they can change the security settings of the renderer.' : g.code === 'MERMAID_HTML' ? 'HTML tags and event handlers are not allowed in a diagram.' : 'javascript:, data:, vbscript: and url(…) are not allowed in a diagram.');
  }
  // Frontmatter: alleen «title:».
  let start = 0;
  let titel = '';
  if (regels[0].trim() === '---') {
    const einde = regels.findIndex((r, i) => i > 0 && r.trim() === '---');
    if (einde < 0) return fout('MERMAID_FRONTMATTER', 1, 'Frontmatter starts with "---" but never ends.');
    for (let i = 1; i < einde; i++) {
      const r = regels[i].trim();
      if (!r) continue;
      const m = /^title:\s*(.*)$/.exec(r);
      if (!m) return fout('MERMAID_FRONTMATTER', i + 1, 'Only "title:" is allowed in the frontmatter (no config).');
      titel = m[1].replace(/^["']|["']$/g, '').slice(0, 120);
    }
    start = einde + 1;
  }
  let eerste = start;
  while (eerste < regels.length && (!regels[eerste].trim() || regels[eerste].trim().startsWith('%%'))) eerste++;
  if (eerste >= regels.length) return fout('MERMAID_LEEG', 0, 'There is no diagram after the frontmatter and comments.');
  const kop = regels[eerste].trim().split(/\s+/);
  const type = (MERMAID_TYPES as readonly string[]).find((t) => t === kop[0] || kop[0] === `${t}:`) as MermaidType | undefined;
  if (!type) return fout('MERMAID_TYPE', eerste + 1, `Unknown diagram type "${kop[0].slice(0, 40)}". Start with one of: ${MERMAID_TYPES.slice(0, 12).join(', ')}, ….`);
  if ((type === 'flowchart' || type === 'graph') && kop[1] !== undefined && !RICHTING.test(kop[1])) return fout('MERMAID_RICHTING', eerste + 1, 'A flowchart direction must be TB, TD, BT, RL or LR.');
  // Inhoud: evenwicht per regel, click alleen met een https-adres, blokken kloppen.
  let subgraph = 0;
  let blokken = 0;
  const BLOK = /^(loop|alt|opt|par|critical|break|rect|box)\b/;
  for (let i = eerste + 1; i < regels.length; i++) {
    const r = regels[i].trim();
    if (!r || r.startsWith('%%')) continue;
    // Haakjes per regel alleen waar Mermaid ze per regel gebruikt (knooppunten van een flowchart, berichten van een sequentie).
    // erDiagram (`||--o{`) en klassen/toestanden (`class A {` … `}` over regels) hebben ze bewust open: daar alleen de aanhalingstekens.
    const perRegel = type === 'flowchart' || type === 'graph' || type === 'sequenceDiagram';
    if (perRegel ? !inEvenwicht(r) : (r.split('"').length - 1) % 2 !== 0) return fout('MERMAID_HAAKJES', i + 1, perRegel ? 'Brackets or quotes on this line are not balanced.' : 'Quotes on this line are not balanced.');
    if (/^click\s/i.test(r) && !/^click\s+\S+\s+(?:href\s+)?"https:\/\/[^"\s]+"(?:\s+"[^"]*")?(?:\s+_(?:blank|self))?$/.test(r)) return fout('MERMAID_CLICK', i + 1, 'Only links of the form click NODE "https://…" are allowed (no callbacks).');
    if (type === 'flowchart' || type === 'graph') {
      if (/^subgraph\b/.test(r)) subgraph++;
      else if (r === 'end') { subgraph--; if (subgraph < 0) return fout('MERMAID_BLOK', i + 1, '"end" without "subgraph".'); }
    }
    if (type === 'sequenceDiagram') {
      if (BLOK.test(r)) blokken++;
      else if (r === 'end') { blokken--; if (blokken < 0) return fout('MERMAID_BLOK', i + 1, '"end" without an opening block (loop, alt, opt, par, critical, break, rect, box).'); }
    }
  }
  if (subgraph > 0) return fout('MERMAID_BLOK', regels.length, 'A "subgraph" is not closed with "end".');
  if (blokken > 0) return fout('MERMAID_BLOK', regels.length, 'A block (loop, alt, opt, par, critical, break, rect, box) is not closed with "end".');
  return { ok: true, type, code, regels: regels.length, titel };
}

/** Een veilige bestandsnaam voor de hmara: «<titel>.mmd». */
export function mermaidBestandsnaam(titel: string): string {
  const kort = String(titel || '').normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'schema';
  return `${kort}.mmd`;
}
export const isMermaidBestand = (naam: unknown): boolean => /\.mmd$/i.test(String(naam || ''));
