// Kleurcodering van terminalregels (syntax highlighting zonder bibliotheek): ANSI-kleurcodes uit het logboek worden omgezet in klassen,
// gewone tekst krijgt kleuren voor [labels], commando's, paden, vlaggen, versies, aantallen, strings en sleutelwoorden.
// Puur (geen React/DOM): getest in tests/eenheid/terminal-kleur.test.ts. Nooit HTML: de UI zet elk deel als tekst in een <span>.
export type KleurSoort = 'tag' | 'cmd' | 'pad' | 'vlag' | 'versie' | 'getal' | 'tekst' | 'fout' | 'waarsch' | 'goed' | 'dim' | 'url' | 'sleutel' | 'a-rood' | 'a-groen' | 'a-geel' | 'a-blauw' | 'a-paars' | 'a-cyaan' | 'a-dim' | 'a-vet';
export type Deel = { t: string; k?: KleurSoort };

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[([0-9;]*)m/g;
// eslint-disable-next-line no-control-regex
const ANSI_ANDERE = /\u001b\[[0-9;?]*[A-Za-ln-z]|\u001b\][^\u0007]*\u0007/g;
const ANSI_KLEUR: Record<number, KleurSoort> = { 31: 'a-rood', 32: 'a-groen', 33: 'a-geel', 34: 'a-blauw', 35: 'a-paars', 36: 'a-cyaan', 90: 'a-dim', 91: 'a-rood', 92: 'a-groen', 93: 'a-geel', 94: 'a-blauw', 95: 'a-paars', 96: 'a-cyaan' };

const COMMANDO = '(?:npm|npx|node|bash|sh|sudo|systemctl|journalctl|git|psql|pg_dump|tar|cp|mv|rm|mkdir|chmod|chown|ln|curl|cat|sed|awk|grep|tee|flock|install|vite|tsc|esbuild|docker|cloudflared)';
// Volgorde = prioriteit. Elke groep krijgt een soort.
const PATROON = new RegExp([
  String.raw`(?<url>https?:\/\/[^\s)'"]+)`,
  String.raw`(?<tag>\[[A-Za-z][\w:.-]{1,24}\])`,
  String.raw`(?<string>"[^"\n]{1,200}"|'[^'\n]{1,200}')`,
  String.raw`(?<sha>\b[0-9a-f]{40,64}\b)`,
  String.raw`(?<versie>\b\d{8}-\d{6}\b|\bv?\d+\.\d+\.\d+(?:[-+][\w.]+)?\b)`,
  String.raw`(?<pad>(?:~|\.{1,2})?\/[\w.@+\-/]{2,}|\b[\w.-]+\/[\w.@+\-/]+\.[a-z0-9]{1,6}\b)`,
  String.raw`(?<vlag>(?<![\w-])--?[a-zA-Z][\w-]*(?==|\s|$))`,
  String.raw`(?<sleutel>\b[a-z_][\w.-]{1,24}(?==[^\s=]))`,
  String.raw`(?<getal>\b\d+(?:[.,]\d+)?\s?(?:MB|KB|GB|kB|MiB|GiB|ms|s|sec|min|%|packages|pakketten|bestanden|files)\b)`,
  String.raw`(?<fout>\b(?:ERROR|FATAL|FAIL(?:ED)?|failed|mislukt|fout|error|ABORT|DENIED|geweigerd|помилк\p{L}*)\b)`,
  String.raw`(?<waarsch>\b(?:WARN(?:ING)?|warn|waarschuwing|deprecated|попередження)\b)`,
  String.raw`(?<goed>\b(?:OK|ok|klaar|done|success|actief|gezond|healthy|готово|успішно)\b)`,
  String.raw`(?<cmd>(?<=^|[\s$#>])${COMMANDO}(?=\s|$))`,
].join('|'), 'gu');
const SOORT_VAN: Record<string, KleurSoort> = { url: 'url', tag: 'tag', string: 'tekst', sha: 'dim', versie: 'versie', pad: 'pad', vlag: 'vlag', sleutel: 'sleutel', getal: 'getal', fout: 'fout', waarsch: 'waarsch', goed: 'goed', cmd: 'cmd' };

/** Gewone tekst (zonder ANSI) in gekleurde delen. */
export function kleurTekst(tekst: string): Deel[] {
  const uit: Deel[] = []; let vanaf = 0;
  PATROON.lastIndex = 0;
  for (let m = PATROON.exec(tekst); m; m = PATROON.exec(tekst)) {
    if (m[0] === '') { PATROON.lastIndex++; continue; }
    const g = m.groups || {}; const naam = Object.keys(g).find((k) => g[k] !== undefined);
    if (m.index > vanaf) uit.push({ t: tekst.slice(vanaf, m.index) });
    if (naam === 'pad' && /\d{8}-\d{6}/.test(m[0])) { // een release in een pad apart kleuren
      for (const stuk of m[0].split(/(\d{8}-\d{6})/)) if (stuk) uit.push({ t: stuk, k: /^\d{8}-\d{6}$/.test(stuk) ? 'versie' : 'pad' });
    } else uit.push({ t: m[0], k: naam ? SOORT_VAN[naam] : undefined });
    vanaf = m.index + m[0].length;
  }
  if (vanaf < tekst.length) uit.push({ t: tekst.slice(vanaf) });
  return uit;
}

/** Een regel: ANSI-codes worden klassen (en verdwijnen uit de tekst); stukken zonder ANSI-kleur krijgen de syntaxiskleuren. */
export function kleurRegel(regel: string): Deel[] {
  const schoon = regel.replace(ANSI_ANDERE, '');
  if (!schoon.includes('\u001b[')) return kleurTekst(schoon.slice(0, 4000));
  const uit: Deel[] = []; let kleur: KleurSoort | undefined; let vet = false; let vanaf = 0;
  const duw = (t: string) => { if (!t) return; if (kleur) uit.push({ t, k: kleur }); else if (vet) uit.push({ t, k: 'a-vet' }); else uit.push(...kleurTekst(t)); };
  ANSI.lastIndex = 0;
  for (let m = ANSI.exec(schoon); m; m = ANSI.exec(schoon)) {
    duw(schoon.slice(vanaf, m.index)); vanaf = m.index + m[0].length;
    for (const c of (m[1] || '0').split(';').map((x) => Number(x || 0))) {
      if (c === 0) { kleur = undefined; vet = false; } else if (c === 1) vet = true; else if (c === 22) vet = false; else if (c === 39) kleur = undefined; else if (ANSI_KLEUR[c]) kleur = ANSI_KLEUR[c];
    }
  }
  duw(schoon.slice(vanaf));
  return uit;
}
/** De tekst zonder ANSI-codes (voor kopiëren/downloaden en zoeken). */
export const zonderAnsi = (t: string) => t.replace(ANSI, '').replace(ANSI_ANDERE, '');
