// SEC-002 / groep g04 (12.11.2026): notities vNext — regressie voor wolk-01 (ReDoS) en wolk-11 (lijst onder «alleen lezen»).
//
// WAT DEZE TEST VASTHOUDT:
//   wolk-01  Geen enkele bewerking in shared/notities-vnext-model.ts mag méér dan lineair groeien met de invoer: één verzoek met
//            «# a» + spaties, 200 000 regeleinden of 200 000 haken hield vroeger de hele (één-draads) server vast. Elke proef
//            loopt TRAPSGEWIJS op (klein → groot) en stopt bij de eerste maat boven het tijdsbudget, zodat de test zelf nooit
//            minutenlang hangt als de kwadratische vorm terugkomt.
//            Daarnaast: de nieuwe (lineaire) ontleders geven HETZELFDE als de oude regexen — uitputtend vergeleken op alle korte
//            invoeren uit een klein alfabet (de oude regexen staan hieronder als referentie; op korte invoer zijn zij snel).
//            NA DE TOETS (notitie 1 van de toetser): ook de frontmatter («title:»/«tags:» + witruimte + U+2028) en de lijstregels
//            («- »/«1. » + witruimte + U+2028) waren kwadratisch; deel (e) houdt dat vast, met een tussenmaat in de trap.
//   wolk-11  POST /api/notities/lijst onder impersonatie «alleen lezen» geeft de lijst (geen 25P02/500); het opruimen van de
//            prullenbak gebeurt dan niet, en een mislukte opruiming breekt de transactie van de lezer nooit.
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { metImpersonatie } from '../../server/platform/context';
import { alsGebruiker } from '../../backend/ai-toestemmingen';
import * as vn from '../../backend/notities-vnext';
import { router } from '../../server/platform/router';
import { som, _tellerLeeg } from '../../server/platform/antwoord-teller';
import { registreerMelder } from '../../backend/melder';
import {
  VN_MAX_ETIKETTEN, VN_MAX_INHOUD, lijstRegels, markdownNaarHtml, naarChecklist, parseerImport, platteTekst, schoneInvoer, titelUitInhoud, vingerafdruk, vnEtiketten, vnKoppelingen,
  vnSchoonEtiket, vnVeiligeKoppeling, zoekWoorden,
} from '../../shared/notities-vnext-model';
import { checker } from './hulp/nep-google';

const BUDGET_MS = 200;
const tijd = (fn: () => unknown) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; };
/** Trapsgewijs meten: stopt bij de eerste maat die het budget overschrijdt (één herkansing tegen ruis van een drukke machine). */
function binnenBudget(maten: readonly number[], maak: (n: number) => string, doe: (s: string) => unknown, budget = BUDGET_MS): { ok: boolean; info: string } {
  for (const n of maten) {
    const s = maak(n);
    let ms = tijd(() => doe(s));
    if (ms > budget && ms < budget * 4) ms = Math.min(ms, tijd(() => doe(s)));
    if (ms > budget) return { ok: false, info: `n=${n}: ${ms.toFixed(0)} ms (budget ${budget} ms)` };
  }
  return { ok: true, info: '' };
}

// ---------------------------------------------------------------- referentie: de OUDE (traag op lange invoer, juist op korte) vormen
const OUD_KOP = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const OUD_IMPORT_KOP = /^\s{0,3}#\s+(.+?)\s*#*\s*$/m;
const OUD_CODE = /^\s{0,3}```\s*([\w+-]*)\s*$/;
const platteTekstOud = (md: string) => String(md ?? '')
  .replace(/```[\s\S]*?```/g, (b) => b.replace(/```[^\n]*\n?/g, ''))
  .replace(/^\s{0,3}#{1,6}\s+/gm, '')
  .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, '')
  .replace(/^\s*[-*+]\s+/gm, '')
  .replace(/^\s*\d+[.)]\s+/gm, '')
  .replace(/^\s*>\s?/gm, '')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1 $2')
  .replace(/[*_~`]+/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
// Na de toets (notitie 1): de oude frontmatter-ontleder en de oude lijstregels, letterlijk zoals ze in het model stonden.
function uitFrontmatterOud(tekst: string): { tekst: string; etiketten: string[]; titel: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(tekst);
  if (!m) return { tekst, etiketten: [], titel: '' };
  let titel = ''; let etiketten: string[] = [];
  for (const regel of m[1].split('\n')) {
    const t = /^(title|titel|назва)\s*:\s*(.+)$/i.exec(regel); if (t) titel = t[2].trim().replace(/^["']|["']$/g, '');
    const e = /^(tags|etiketten|теги)\s*:\s*(.+)$/i.exec(regel); if (e) etiketten = vnEtiketten(e[2].replace(/^\[|\]$/g, '').split(','));
  }
  return { tekst: tekst.slice(m[0].length), etiketten, titel };
}
const OUD_PUNT = /^\s*[-*+]\s+(.+)$/;
const OUD_NUMMER = /^\s*\d+[.)]\s+(.+)$/;
const OUD_LIJN = /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/;
const veiligOud = (raw: unknown): string => {
  const w = String(raw ?? '').trim();
  if (!w || /[\s<>"']/.test(w)) return '';
  try { const u = new URL(w); return u.protocol === 'https:' ? u.toString() : ''; } catch { return ''; }
};
/** Alle woorden over een alfabet tot en met een lengte (uitputtend, deterministisch). */
function* woorden(alfabet: readonly string[], maxLengte: number): Generator<string> {
  const stapel: string[] = [''];
  while (stapel.length) {
    const w = stapel.pop() as string;
    yield w;
    if (w.length < maxLengte) for (const c of alfabet) stapel.push(w + c);
  }
}
const eenWit = (s: string) => s.replace(/\s+/g, ' ').trim();
// Na de toets (notitie 4): vnEtiketten zoals het vóór de invoergrens was (referentie voor gewone invoer).
const vnEtikettenOud = (raw: unknown): string[] => {
  const uit: string[] = [];
  for (const e of Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\n]/) : []) { const s = vnSchoonEtiket(e); if (s && !uit.includes(s) && uit.length < VN_MAX_ETIKETTEN) uit.push(s); }
  return uit;
};

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g04-20261112');

  // ================================================================ wolk-01 (a): kop in import en weergave — vroeger kubisch
  {
    const kopMaten = [300, 1500, 20_000, 200_000];
    const r1 = binnenBudget(kopMaten, (n) => `# a${' '.repeat(n)}b`, (s) => parseerImport({ naam: 'a.md', tekst: s }));
    check('wolk-01: parseerImport met «# a» + spaties + «b» blijft binnen het tijdsbudget (tot 200 000 spaties)', r1.ok, r1.info);
    const r2 = binnenBudget(kopMaten, (n) => `# a${' '.repeat(n)}b`, (s) => markdownNaarHtml(s));
    check('wolk-01: markdownNaarHtml met dezelfde kopregel blijft binnen het budget (de browser van de eigenaar hangt niet)', r2.ok, r2.info);
    const r3 = binnenBudget(kopMaten, (n) => `# a${' #'.repeat(n / 2)} b`, (s) => { markdownNaarHtml(s); parseerImport({ naam: 'a.md', tekst: s }); });
    check('wolk-01: kopregel met afwisselend spaties en hekjes blijft binnen het budget', r3.ok, r3.info);
    const r4 = binnenBudget([5000, 20_000, 200_000], (n) => `\`\`\`${' '.repeat(n)}!`, (s) => markdownNaarHtml(s));
    check('wolk-01: markdownNaarHtml met «```» + spaties + «!» (codeblok-opener) blijft binnen het budget', r4.ok, r4.info);
    const r5 = binnenBudget([5000, 20_000, 200_000], (n) => `\`\`\`js\n${`\`\`\`${' '.repeat(40)}x\n`.repeat(n / 44)}`, (s) => markdownNaarHtml(s));
    check('wolk-01: markdownNaarHtml met veel bijna-sluiters van een codeblok blijft binnen het budget', r5.ok, r5.info);
  }

  // ================================================================ wolk-01 (b): platteTekst — vroeger kwadratisch (regeleinden, haken)
  {
    const pt = [20_000, VN_MAX_INHOUD];
    const gevallen: Array<[string, (n: number) => string]> = [
      ['regeleinden', (n) => '\n'.repeat(n)],
      ['x + regeleinden + y', (n) => `x${'\n'.repeat(n - 2)}y`],
      ['spatie+regeleinde', (n) => ' \n'.repeat(n / 2)],
      ['regelscheiders U+2028', (n) => '\u2028'.repeat(n)],
      ['wagenterugloop', (n) => '\r'.repeat(n)],
      ['haken «[»', (n) => '['.repeat(n)],
      ['beeldhaken «![»', (n) => '!['.repeat(n / 2)],
      ['open koppelingen «[a](»', (n) => '[a]('.repeat(n / 4)],
      ['open beelden «![a](»', (n) => '![a]('.repeat(n / 5)],
      ['haken met één sluiter zonder «(»', (n) => `${'['.repeat(n - 1)}]`],
      ['koppelingen met één late «)»', (n) => `${'[a]('.repeat(n / 4)})`],
      ['backticks', (n) => '`'.repeat(n)],
      ['open codeblokken', (n) => '```a'.repeat(n / 4)],
      ['cijfers', (n) => '1'.repeat(n)],
      ['streepjes met witruimte', (n) => '- \n'.repeat(n / 3)],
      ['lange witregel vóór elk punt', (n) => `${' '.repeat(200)}x\n`.repeat(n / 202)],
      ['hekjes en regeleinden', (n) => '#\n'.repeat(n / 2)],
    ];
    for (const [naam, maak] of gevallen) {
      const r = binnenBudget(pt, maak, (s) => platteTekst(s));
      check(`wolk-01: platteTekst — ${naam} — binnen het budget (tot ${VN_MAX_INHOUD} tekens)`, r.ok, r.info);
    }
    // De hele schrijfweg van één notitie (wat POST /api/notities/nieuw vóór de database doet) op de ergste invoer.
    const r = binnenBudget(pt, (n) => '\n'.repeat(n), (s) => { const i = schoneInvoer({ titel: 'x', inhoud: s }); if (i.ok) { platteTekst(i.invoer.inhoud); lijstRegels(i.invoer.inhoud); vingerafdruk(i.invoer.titel, i.invoer.inhoud); } });
    check('wolk-01: schoneInvoer + platteTekst + lijstRegels + vingerafdruk op 200 000 regeleinden binnen het budget', r.ok, r.info);
  }

  // ================================================================ wolk-01 (c): aangrenzende vormen in hetzelfde bestand
  {
    const groot = [20_000, VN_MAX_INHOUD];
    const a1 = binnenBudget(groot, (n) => `https://a.b/${'.'.repeat(1900)}x `.repeat(Math.ceil(n / 1914)), (s) => markdownNaarHtml(s));
    check('wolk-01: markdownNaarHtml — adressen met lange reeksen leestekens — binnen het budget', a1.ok, a1.info);
    const a2 = binnenBudget(groot, (n) => Array.from({ length: Math.ceil(n / 16) }, (_, i) => `https://a.b/${String(i).padStart(4, '0')}`).join(' '), (s) => vnKoppelingen(s));
    check('wolk-01: vnKoppelingen — duizenden verschillende adressen — binnen het budget (stopt na 20)', a2.ok, a2.info);
    const regelGevallen: Array<[string, (n: number) => string]> = [
      ['één lange regel spaties', (n) => ' '.repeat(n)], ['streepje + spaties', (n) => `-${' '.repeat(n)}`], ['spaties + streepje + spaties', (n) => `${' '.repeat(n / 2)}-${' '.repeat(n / 2)}`],
      ['cijfers', (n) => '1'.repeat(n)], ['sterretjes', (n) => '*'.repeat(n)], ['afwisselend «*a»', (n) => '*a'.repeat(n / 2)], ['onderstrepingen', (n) => '_a'.repeat(n / 2)], ['tildes', (n) => '~a'.repeat(n / 2)],
      ['haken', (n) => '['.repeat(n)], ['open koppelingen', (n) => '[a](https://x'.repeat(n / 13)], ['lijnen', (n) => `${'-'.repeat(n)}x`], ['citaten', (n) => '>\n'.repeat(n / 2)], ['regeleinden', (n) => '\n'.repeat(n)],
    ];
    for (const [naam, maak] of regelGevallen) {
      const r = binnenBudget(groot, maak, (s) => { markdownNaarHtml(s); lijstRegels(s); naarChecklist(s); titelUitInhoud(s); }, 400);
      check(`wolk-01: weergave/checklist/titel — ${naam} — binnen het budget`, r.ok, r.info);
    }
    // Import: de grootste toegestane partij (4 000 000 tekens) mag de server hoogstens kort bezighouden.
    const importGevallen: Array<[string, string, (n: number) => string]> = [
      ['regeleinden', 'a.md', (n) => `${'\n'.repeat(n)}x`],
      ['frontmatter met komma\'s', 'a.md', (n) => `---\ntags: ${','.repeat(n)}\n---\ntekst`],
      ['frontmatter-titel met spaties', 'a.md', (n) => `---\ntitle${' '.repeat(n)}\n---\ntekst`],
      ['vinkjes', 'a.txt', (n) => '- [ ] a\n'.repeat(n / 8)],
      ['JSON met reusachtige etikettenlijst', 'a.json', (n) => JSON.stringify([{ titel: 't', inhoud: 'i', etiketten: Array.from({ length: n / 4 }, () => '') }])],
      ['kopregel met spaties en hekjes', 'a.md', (n) => `# a${' #'.repeat(n / 2)} b`],
      ['kopregel met alleen spaties', 'a.md', (n) => `# a${' '.repeat(n)}`],
    ];
    for (const [naam, bestand, maak] of importGevallen) {
      const r = binnenBudget([20_000, 3_900_000], maak, (s) => parseerImport({ naam: bestand, tekst: s }), 1500);
      check(`wolk-01: parseerImport — ${naam} (tot ≈ 4 MB, de grootste partij) — binnen 1500 ms`, r.ok, r.info);
    }
    const etiketMs = tijd(() => vnEtiketten(Array.from({ length: 1_000_000 }, (_, i) => (i % 2 ? '' : 'a'))));
    check('wolk-01: vnEtiketten met een miljoen lege/dubbele etiketten blijft binnen het budget', etiketMs < 400, `${etiketMs.toFixed(0)} ms`);
  }

  // ================================================================ wolk-01 (d): hetzelfde resultaat als de oude regexen
  {
    // Kop: uitputtend over een klein alfabet (met de vreemde gevallen: alleen witruimte, alleen hekjes, U+2028).
    let kopFout = ''; let kopAantal = 0;
    for (const w of woorden(['#', ' ', 'a', '\t', '\u2028'], 7)) {
      if (!w.trim()) continue; // lege regels handelt markdownNaarHtml eerder af
      kopAantal++;
      const oud = OUD_KOP.exec(w);
      const html = markdownNaarHtml(w);
      const verwacht = oud ? `<h${Math.min(6, oud[1].length + 1)}>${oud[2]}</h${Math.min(6, oud[1].length + 1)}>` : null;
      if (verwacht ? html !== verwacht : /^<h\d>/.test(html)) { kopFout = `${JSON.stringify(w)} → ${html} (verwacht ${verwacht ?? 'geen kop'})`; break; }
    }
    check(`wolk-01: de lineaire kop-ontleder geeft voor alle ${kopAantal} korte regels exact wat de oude regex gaf`, !kopFout && kopAantal > 50_000, kopFout);
    // Import: titel uit de eerste kop (zonder de bijzondere regelscheiders: daar liet de oude vorm stil tekst vallen).
    let impFout = ''; let impAantal = 0;
    for (const w of woorden(['#', ' ', 'a', 'b'], 7)) {
      const tekst = `${w}\nrest`;
      const inhoud = tekst.trim(); const eerste = inhoud.split('\n')[0] ?? '';
      const oud = OUD_IMPORT_KOP.exec(eerste);
      const verwachtTitel = oud && oud[1].trim() ? eenWit(oud[1]) : 'zonder'; // schoneInvoer maakt van elke witruimte één spatie
      const uit = parseerImport({ naam: 'zonder.md', tekst });
      impAantal++;
      if (uit.items[0]?.titel !== verwachtTitel || uit.items[0]?.inhoud !== (oud ? inhoud.split('\n').slice(1).join('\n').trim() : inhoud)) { impFout = `${JSON.stringify(w)} → ${JSON.stringify(uit.items[0])} (verwacht titel ${JSON.stringify(verwachtTitel)})`; break; }
    }
    check(`wolk-01: parseerImport haalt voor alle ${impAantal} korte eerste regels dezelfde titel en inhoud uit de kop als vroeger`, !impFout && impAantal > 20_000, impFout);
    // Codeblok-opener: zelfde beslissing en dezelfde taal als de oude regex.
    let codeFout = ''; let codeAantal = 0;
    for (const w of woorden(['`', ' ', 'j', '+', '!'], 7)) {
      if (!w.includes('```')) continue;
      codeAantal++;
      const oud = OUD_CODE.exec(w);
      const html = markdownNaarHtml(`${w}\nx`);
      const isCode = html.startsWith('<pre');
      const taal = /^<pre data-taal="([^"]*)"/.exec(html)?.[1] ?? '';
      if (isCode !== Boolean(oud) || (oud && taal !== oud[1])) { codeFout = `${JSON.stringify(w)} → ${html}`; break; }
    }
    check(`wolk-01: de codeblok-opener beslist voor alle ${codeAantal} korte regels zoals de oude regex`, !codeFout && codeAantal > 1000, codeFout);
    // platteTekst zonder regeleinden: byte voor byte gelijk aan de oude vorm (koppelingen, beelden, opmaak).
    let ptFout = ''; let ptAantal = 0;
    for (const w of woorden(['[', ']', '(', ')', '!', 'a', ' '], 7)) {
      ptAantal++;
      if (platteTekst(w) !== platteTekstOud(w)) { ptFout = `${JSON.stringify(w)} → ${JSON.stringify(platteTekst(w))} (oud ${JSON.stringify(platteTekstOud(w))})`; break; }
    }
    check(`wolk-01: platteTekst (koppelingen/beelden) is voor alle ${ptAantal} korte invoeren byte voor byte gelijk aan de oude vorm`, !ptFout && ptAantal > 900_000, ptFout);
    let pt2Fout = ''; let pt2Aantal = 0;
    for (const w of woorden(['[', ']', '(', ')', '\n', 'a', '`', '#'], 6)) {
      pt2Aantal++;
      if (platteTekst(w) !== platteTekstOud(w)) { pt2Fout = `${JSON.stringify(w)} → ${JSON.stringify(platteTekst(w))} (oud ${JSON.stringify(platteTekstOud(w))})`; break; }
    }
    check(`wolk-01: platteTekst met regeleinden, codeblokken en koppen in koppelingen is voor alle ${pt2Aantal} korte invoeren gelijk aan de oude vorm`, !pt2Fout && pt2Aantal > 250_000, pt2Fout);
    // Regelvoorvoegsels (lijst, vinkje, nummer, citaat): dezelfde woorden; alleen lege regels vóór een punt blijven nu staan.
    let rvFout = ''; let rvAantal = 0;
    for (const w of woorden(['-', ' ', '\n', '1', '.', '>', 'a', '[', ']', 'x'], 5)) {
      rvAantal++;
      if (eenWit(platteTekst(w)) !== eenWit(platteTekstOud(w))) { rvFout = `${JSON.stringify(w)} → ${JSON.stringify(platteTekst(w))} (oud ${JSON.stringify(platteTekstOud(w))})`; break; }
    }
    check(`wolk-01: platteTekst (lijsttekens, vinkjes, nummers, citaten) geeft voor alle ${rvAantal} korte invoeren dezelfde woorden als de oude vorm`, !rvFout && rvAantal > 100_000, rvFout);
    // Gewone notities: precies wat de bestaande test al vasthoudt, plus een paar herkenbare vormen.
    const gewoon = '## Titel\n\n1. een\n2) twee\n> citaat\n* punt\n![plaat](https://c.d/p.png) en [tekst](https://a.b) ~~weg~~\n```js\nconst a = 1;\n```';
    check('wolk-01: platteTekst op een gewone notitie geeft dezelfde woorden; het enige verschil is dat een lege regel vóór een punt blijft staan',
      platteTekst('# Kop\n- [ ] **melk** [site](https://a.b)') === 'Kop\nmelk site https://a.b'
      && platteTekst(gewoon) === 'Titel\n\neen\ntwee\ncitaat\npunt\nplaat en tekst https://a.b weg\nconst a = 1;' && eenWit(platteTekst(gewoon)) === eenWit(platteTekstOud(gewoon))
      && platteTekst('[a [b](https://x.y/(z))') === platteTekstOud('[a [b](https://x.y/(z))'));
    const h = markdownNaarHtml('# Kop #\n## Twee ##  \n####### zeven\n#geen\n```js \nlet a;\n```\nna https://los.nl/pad... en https://x.y/a?b=1!');
    check('wolk-01: markdownNaarHtml — koppen, sluitende hekjes, codeblok met taal en adressen met leestekens erachter — ongewijzigd',
      /<h2>Kop<\/h2>/.test(h) && /<h3>Twee<\/h3>/.test(h) && !/<h\d>zeven/.test(h) && /<pre data-taal="js"><code>let a;<\/code><\/pre>/.test(h) && /href="https:\/\/los\.nl\/pad"/.test(h) && /href="https:\/\/x\.y\/a\?b=1"/.test(h));
    const imp = parseerImport({ naam: 'x.md', tekst: '# Mijn titel ##\n\ntekst' });
    check('wolk-01: parseerImport — titel uit de eerste kop, de kop uit de inhoud — ongewijzigd', imp.items[0]?.titel === 'Mijn titel' && imp.items[0]?.inhoud === 'tekst');
    check('wolk-01: parseerImport — te lange inhoud wordt nog steeds geweigerd met INHOUD_TE_LANG (nu vóór het zware werk)',
      parseerImport({ naam: 'x.md', tekst: `# T\n${'x'.repeat(VN_MAX_INHOUD + 1)}` }).fouten[0]?.fout === 'INHOUD_TE_LANG'
      && parseerImport({ naam: 'x.md', tekst: `# T\n${'x'.repeat(VN_MAX_INHOUD)}` }).items.length === 1
      && parseerImport({ naam: 'x.md', tekst: `# ${'t'.repeat(301)}\nx` }).fouten[0]?.fout === 'TITEL_ONGELDIG');
    check('wolk-01: vnKoppelingen geeft dezelfde eerste adressen, zonder dubbelen, hoogstens 20',
      vnKoppelingen('zie https://a.b/1 en (https://a.b/2) en https://a.b/1 http://nee.nl').join() === 'https://a.b/1,https://a.b/2'
      && vnKoppelingen(Array.from({ length: 50 }, (_, i) => `https://a.b/${i}`).join(' ')).length === 20);
  }

  // ================================================================ wolk-01 (e): NA DE TOETS, notitie 1 — frontmatter en lijstregels
  // De toetser vond dezelfde fout op een plek die de eerste ronde miste: «\s*(.+)$» / «\s+(.+)$» op een regel die op U+2028/U+2029
  // eindigt. «.» neemt die tekens niet en «$» (zonder vlag m) is alleen het einde van de tekst, dus elke splitsing van de witruimte
  // werd opnieuw geprobeerd: kwadratisch. Bereikbaar via POST /api/notities/import/voorbeeld (frontmatter «title:»/«tags:»).
  {
    const LS = '\u2028', PS = '\u2029';
    // Trap MET een tussenmaat: de kwadratische vorm bleef op 20 000 tekens nog onder het budget (≈ 0,2 s) en zou daarna op de
    // grootste partij uren hangen. Met 100 000 ertussen valt hij binnen seconden door de mand.
    const trap = [20_000, 100_000, 3_900_000];
    const fmGevallen: Array<[string, string, (n: number) => string]> = [
      ['«title:» + spaties + U+2028', 'a.md', (n) => `---\ntitle:${' '.repeat(n)}${LS}\n---\nx`],
      ['«tags:» + spaties + U+2028', 'a.md', (n) => `---\ntags:${' '.repeat(n)}${LS}\n---\nx`],
      ['«titel :» + tabs + U+2029', 'a.txt', (n) => `---\ntitel :${'\t'.repeat(n)}${PS}\n---\nx`],
      ['«теги:» + spaties + U+2028 + tekst', 'a.md', (n) => `---\nтеги:${' '.repeat(n)}${LS}a\n---\nx`],
      ['«назва» + spaties zonder dubbele punt', 'a.md', (n) => `---\nназва${' '.repeat(n)}${LS}\n---\nx`],
      ['veel korte regels «title: » + U+2028', 'a.md', (n) => `---\n${`title: ${LS}\n`.repeat(n / 9)}---\nx`],
      ['veel regels «tags: a,b»', 'a.md', (n) => `---\n${'tags: a,b\n'.repeat(n / 10)}---\nx`],
      ['«tags: a,a,a,…» op één regel', 'a.md', (n) => `---\ntags: ${'a,'.repeat(n / 2)}\n---\nx`],
      ['alleen regeleinden tussen de streepjes', 'a.md', (n) => `---\n${'\n'.repeat(n)}\n---\nx`],
      ['frontmatter zonder sluiter', 'a.md', (n) => `---\n${`title:${' '.repeat(90)}${LS}\n`.repeat(n / 98)}`],
    ];
    for (const [naam, bestand, maak] of fmGevallen) {
      const r = binnenBudget(trap, maak, (s) => parseerImport({ naam: bestand, tekst: s }), 1500);
      check(`toets 1: parseerImport — frontmatter ${naam} (tot ≈ 4 MB) — binnen 1500 ms`, r.ok, r.info);
    }
    // Een partij mag 200 bestanden tellen: ook 195 bestanden die elk nét onder de grens voor frontmatter blijven moeten vlot gaan
    // (alleen een grens op de lengte was dus niet genoeg — de ontleding per regel zelf moet lineair zijn).
    const bijnaVol = `---\ntitle:${' '.repeat(19_900)}${LS}\n---\nx`;
    const partij = binnenBudget([10, 195], (n) => String(n), (s) => { for (let i = 0; i < Number(s); i++) parseerImport({ naam: `b${i}.md`, tekst: bijnaVol }); }, 1500);
    check('toets 1: een partij van 195 bestanden met elk 20 000 tekens vijandige frontmatter (samen ≈ 3,9 MB) — binnen 1500 ms', partij.ok, partij.info);

    // Dezelfde vorm in de weergave (de browser van de eigenaar): «- » / «1. » + witruimte + U+2028.
    const lijstGevallen: Array<[string, (n: number) => string]> = [
      ['«- » + spaties + U+2028', (n) => `- ${' '.repeat(n)}${LS}`],
      ['«1. » + spaties + U+2028', (n) => `1. ${' '.repeat(n)}${LS}`],
      ['«* » + tabs + U+2029 + x', (n) => `* ${'\t'.repeat(n)}${PS}x`],
      ['«12) » + spaties + U+2028 + x', (n) => `12) ${' '.repeat(n)}${LS}x`],
      ['«+» + spaties (geen tekst)', (n) => `+${' '.repeat(n)}`],
      ['veel regels «- » + 200 spaties + U+2028', (n) => `- ${' '.repeat(200)}${LS}\n`.repeat(n / 204)],
      ['cijfers zonder punt', (n) => `${'1'.repeat(n)} x`],
    ];
    for (const [naam, maak] of lijstGevallen) {
      const r = binnenBudget([5000, 40_000, VN_MAX_INHOUD], maak, (s) => markdownNaarHtml(s));
      check(`toets 1: markdownNaarHtml — lijstregel ${naam} — binnen het budget (tot ${VN_MAX_INHOUD} tekens)`, r.ok, r.info);
    }
    // Losse adressen: honderdduizend stukjes die geen adres zijn kostten elk een (dure) uitzondering van new URL().
    const adr = binnenBudget([20_000, VN_MAX_INHOUD], (n) => '(a'.repeat(n / 2), (s) => vnKoppelingen(s));
    check('toets 1: vnKoppelingen — 100 000 stukjes die geen adres zijn — binnen het budget', adr.ok, adr.info);

    // ---- hetzelfde resultaat als de oude vormen (uitputtend op korte regels; de oude regexen staan bovenaan als referentie)
    let fmFout = ''; let fmAantal = 0;
    const sleutels = ['title', 'TITEL', 'назва', 'Tags', 'etiketten', 'ТЕГИ', 'titl', 'xtags'];
    for (const staart of woorden([' ', ':', 'a', 'B', LS, '"', ','], 5)) {
      for (const sleutel of sleutels) {
        const tekst = `---\n${sleutel}${staart}\n---\nrest`;
        const oud = uitFrontmatterOud(tekst);
        const uit = parseerImport({ naam: 'zonder.md', tekst }).items[0];
        fmAantal++;
        // Titel uit de frontmatter (witruimte samengevoegd door schoneInvoer); is die leeg, dan de bestandsnaam; bestaat zij alleen
        // uit witruimte, dan de eerste regel van de inhoud — precies wat de keten ná uitFrontmatter altijd al deed.
        const verwachtTitel = oud.titel ? (eenWit(oud.titel) || 'rest') : 'zonder';
        if (uit?.titel !== verwachtTitel || uit?.etiketten.join() !== oud.etiketten.join() || uit?.inhoud !== 'rest') { fmFout = `${JSON.stringify(`${sleutel}${staart}`)} → ${JSON.stringify(uit)} (verwacht titel ${JSON.stringify(verwachtTitel)}, etiketten ${JSON.stringify(oud.etiketten)})`; break; }
      }
      if (fmFout) break;
    }
    check(`toets 1: de lineaire frontmatter-ontleder geeft voor alle ${fmAantal} korte regels dezelfde titel en etiketten als de oude regexen`, !fmFout && fmAantal > 150_000, fmFout);
    // Twee regels: de laatste treffer wint, en een regel met alleen witruimte als waarde wist de eerdere — zoals altijd.
    let fm2Fout = ''; let fm2Aantal = 0;
    for (const s1 of woorden([' ', 'a', LS, ','], 3)) {
      for (const s2 of woorden([' ', 'b', LS], 3)) {
        for (const [k1, k2] of [['title:', 'titel:'], ['tags:', 'теги:'], ['title:', 'tags:']]) {
          const tekst = `---\n${k1}${s1}\n${k2}${s2}\n---\n\nrest`;
          const oud = uitFrontmatterOud(tekst);
          const uit = parseerImport({ naam: 'zonder.md', tekst }).items[0];
          fm2Aantal++;
          if (uit?.titel !== (oud.titel ? (eenWit(oud.titel) || 'rest') : 'zonder') || uit?.etiketten.join() !== oud.etiketten.join() || uit?.inhoud !== 'rest') { fm2Fout = `${JSON.stringify(tekst)} → ${JSON.stringify(uit)}`; break; }
        }
        if (fm2Fout) break;
      }
      if (fm2Fout) break;
    }
    check(`toets 1: twee frontmatter-regels (${fm2Aantal} combinaties) — de laatste wint, een lege waarde wist — zoals vroeger`, !fm2Fout && fm2Aantal > 9000, fm2Fout);
    // Waar de frontmatter eindigt: dezelfde plek als de oude regex (ook «----», «---x», lege frontmatter, geen sluiter).
    let grensFout = ''; let grensAantal = 0;
    for (const w of woorden(['-', '\n', 'a', ':'], 9)) {
      if (!w.startsWith('--')) continue;
      grensAantal++;
      const tekst = `-${w}`;
      const oud = uitFrontmatterOud(tekst);
      // Zonder treffer voor titel/etiketten zegt het resultaat genoeg over de grens: de inhoud is wat ná de frontmatter overblijft.
      const uit = parseerImport({ naam: 'zonder.md', tekst });
      const verwachtInhoud = oud.tekst.trim();
      const kreeg = uit.items[0]?.inhoud ?? (uit.fouten[0]?.fout === 'LEEG' || uit.fouten[0]?.fout === 'TITEL_ONGELDIG' ? '' : '?');
      if (kreeg !== verwachtInhoud) { grensFout = `${JSON.stringify(tekst)} → ${JSON.stringify(uit)} (verwacht inhoud ${JSON.stringify(verwachtInhoud)})`; break; }
    }
    check(`toets 1: begin en einde van de frontmatter liggen voor alle ${grensAantal} korte teksten waar de oude regex ze legde`, !grensFout && grensAantal > 15_000, grensFout);

    const fm = parseerImport({ naam: 'n.md', tekst: `---\nTitle :  "Mijn titel" \nsoort: tekst\nTags: [Idee, план, idee]\nназва: 'Інша назва'\n---\n# Kop\n\ntekst` }).items[0];
    check('toets 1: gewone frontmatter — titel (laatste wint, aanhalingstekens eraf), etiketten uit «[a, b]», de rest is de inhoud — ongewijzigd',
      fm?.titel === 'Інша назва' && fm?.etiketten.join() === 'idee,план' && fm?.inhoud === '# Kop\n\ntekst');
    // Frontmatter heeft nu een grens (20 000 tekens). Wat daarboven tussen twee «---» staat is gewoon tekst: er valt niets weg.
    const fmVan = (lengte: number) => `---\ntitle: T\n${'x: y\n'.repeat((lengte - 9) / 5 - 1)}${'z'.repeat(5 + ((lengte - 9) % 5))}\n---\ntekst`; // precies `lengte` tekens tussen de streepjes
    const opGrens = fmVan(20_000); const overGrens = fmVan(20_001);
    const g1 = parseerImport({ naam: 'groot.md', tekst: opGrens }).items[0];
    const g2 = parseerImport({ naam: 'groot.md', tekst: overGrens }).items[0];
    check('toets 1: frontmatter tot en met 20 000 tekens wordt gelezen; grotere blijft als gewone tekst in de notitie staan (niets valt weg)',
      opGrens.indexOf('\n---', 4) === 20_004 && overGrens.indexOf('\n---', 4) === 20_005
      && g1?.titel === 'T' && g1?.inhoud === 'tekst' && g2?.titel === 'groot' && g2?.inhoud === overGrens.trim());

    // Lijstregels in de weergave: zelfde beslissing en zelfde tekst als de oude regexen (alfabet zonder opmaaktekens, dus de
    // tekst komt letterlijk in de uitvoer). Regels die vóór de lijst al iets anders zijn (leeg, lijn) slaan we over.
    let lrFout = ''; let lrAantal = 0;
    for (const w of woorden(['-', ' ', 'a', '\t', LS, '1', ')'], 6)) {
      if (!w.trim() || OUD_LIJN.test(w)) continue;
      lrAantal++;
      const punt = OUD_PUNT.exec(w); const nummer = punt ? null : OUD_NUMMER.exec(w);
      const verwacht = punt ? `<ul><li>${punt[1]}</li></ul>` : nummer ? `<ol><li>${nummer[1]}</li></ol>` : `<p>${w}</p>`;
      const html = markdownNaarHtml(w);
      if (html !== verwacht) { lrFout = `${JSON.stringify(w)} → ${JSON.stringify(html)} (verwacht ${JSON.stringify(verwacht)})`; break; }
    }
    check(`toets 1: lijst- en nummerregels geven voor alle ${lrAantal} korte regels exact de uitvoer van de oude regexen`, !lrFout && lrAantal > 100_000, lrFout);
    check('toets 1: markdownNaarHtml — gewone lijsten en nummering — ongewijzigd',
      markdownNaarHtml('- een\n  * twee **vet**\n+ drie\n\n1. a\n 2) b\n3.c\n-x') === '<ul><li>een</li><li>twee <strong>vet</strong></li><li>drie</li></ul>\n<ol><li>a</li><li>b</li></ol>\n<p>3.c<br>-x</p>');

    // De adrescontrole: de snelle voorselectie laat precies dezelfde adressen door als new URL() alleen.
    let vkFout = ''; let vkAantal = 0;
    const kandidaten: string[] = [];
    for (const voor of ['', '\u0001', '\u001f\u0000', 'x', '-']) for (const schema of ['https:', 'HTTPS:', 'hTtPs:', 'http:', 'https', 'httpſ:', 'ftp:', 'javascript:', 'data:', 'https\u0000:', 'https;', ':https:']) for (const rest of ['//a.b', '/a.b', 'a.b', '', '//', '//a.b/p?q=1#r', '\\\\a.b', '//[::1]/', '//a.b:99999']) kandidaten.push(`${voor}${schema}${rest}`);
    for (const w of woorden(['h', 's', ':', '/', 'a', '.', '\u0001'], 4)) kandidaten.push(w, `http${w}`, `HTTPS${w}`);
    for (const k of kandidaten) { vkAantal++; if (vnVeiligeKoppeling(k) !== veiligOud(k)) { vkFout = `${JSON.stringify(k)} → ${JSON.stringify(vnVeiligeKoppeling(k))} (oud ${JSON.stringify(veiligOud(k))})`; break; } }
    check(`toets 1: vnVeiligeKoppeling geeft voor alle ${vkAantal} kandidaten hetzelfde als vóór de voorselectie (alleen https, verder niets)`, !vkFout && vkAantal > 8000, vkFout);
  }

  // ================================================================ NA DE TOETS, notities 2 en 4 (model): grenzen op de invoer
  // Notitie 4: lineair maar zwaar zonder grens — één verzoek van 12 MB (de grens van het verzoeklichaam) hield de draad 1–2 s vast.
  // Notitie 2 (modelkant): een zoekvraag van willekeurige lengte ging als ILIKE-patroon naar PostgreSQL (kosten tekst × patroon).
  {
    const z1 = binnenBudget([1_000_000, 12_000_000], (n) => ' a'.repeat(n / 2), (s) => zoekWoorden(s));
    check('toets 4: zoekWoorden op een vraag van 12 MB — binnen het budget', z1.ok, z1.info);
    const e1 = binnenBudget([1_000_000, 12_000_000], (n) => 'a,'.repeat(n / 2), (s) => schoneInvoer({ titel: 't', inhoud: 'x', etiketten: s }));
    check('toets 4: schoneInvoer met een etikettenreeks van 12 MB — binnen het budget', e1.ok, e1.info);
    let e2 = '';
    for (const n of [256_000, 3_000_000]) { const lijst = Array.from({ length: n }, (_, i) => `e${i}`); const ms = tijd(() => vnEtiketten(lijst)); if (ms > BUDGET_MS) { e2 = `n=${n}: ${ms.toFixed(0)} ms (budget ${BUDGET_MS} ms)`; break; } }
    check('toets 4: vnEtiketten met een lijst van 3 miljoen verschillende etiketten — binnen het budget', !e2, e2);
    let e3 = '';
    for (const n of [256_000, 3_000_000]) { const lijst = Array.from({ length: n }, () => '#'); const ms = tijd(() => schoneInvoer({ titel: 't', inhoud: 'x', etiketten: lijst })); if (ms > BUDGET_MS) { e3 = `n=${n}: ${ms.toFixed(0)} ms (budget ${BUDGET_MS} ms)`; break; } }
    check('toets 4: schoneInvoer met 3 miljoen onbruikbare etiketten — binnen het budget', !e3, e3);

    // Gewone etiketten: precies wat de oude vorm gaf (lijsten en reeksen, met lege, dubbele, gereserveerde en te veel etiketten).
    let etFout = ''; let etAantal = 0;
    const bouw = ['Idee', 'idee', '', ' ', '#werk', 'план', 'hub', 'soort:x', 'a b', 'x'.repeat(50), '#', 'Één'];
    for (let lengte = 0; lengte <= 40 && !etFout; lengte++) {
      for (let s = 0; s < bouw.length && !etFout; s++) {
        const lijst = Array.from({ length: lengte }, (_, i) => (i % 3 === 0 ? `t${(i * 7 + s) % 31}` : bouw[(i + s) % bouw.length]));
        for (const invoer of [lijst, lijst.join(','), lijst.join('\n'), lijst.join(', ')]) {
          etAantal++;
          if (vnEtiketten(invoer).join('|') !== vnEtikettenOud(invoer).join('|')) { etFout = `${JSON.stringify(invoer).slice(0, 200)} → ${JSON.stringify(vnEtiketten(invoer))} (oud ${JSON.stringify(vnEtikettenOud(invoer))})`; break; }
        }
      }
    }
    check(`toets 4: vnEtiketten geeft voor ${etAantal} gewone invoeren precies wat het vroeger gaf (hoogstens 24, eerste wint)`, !etFout && etAantal > 1500, etFout);
    check('toets 4: vnEtiketten — tot 500 elementen (of stukken van een reeks) telt elk mee, ook na honderden lege',
      vnEtiketten([...Array.from({ length: 499 }, () => ''), 'laatste']).join() === 'laatste' && vnEtiketten(`${','.repeat(499)}laatste`).join() === 'laatste');
    // De bewuste grens (alleen voor vijandige invoer): voorbij 500 elementen / 500 stukken / 20 000 tekens telt niets meer mee.
    check('toets 4: vnEtiketten — voorbij de invoergrens telt niets meer mee (500 elementen, 500 stukken, 20 000 tekens)',
      vnEtiketten([...Array.from({ length: 500 }, () => ''), 'x']).length === 0 && vnEtiketten(`${','.repeat(500)}x`).length === 0
      && vnEtiketten(`a,${' '.repeat(20_000)}b`).join() === 'a');
    const json200 = binnenBudget([200, 1900],(n) => JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ titel: `t${i}`, inhoud: 'x', tags: 'a,'.repeat(n * 5) }))), (s) => parseerImport({ naam: 'n.json', tekst: s }));
    check('toets 4: import van 200 JSON-notities met elk een lange etikettenreeks (≈ 4 MB) — binnen het budget', json200.ok, json200.info);

    // Zoekwoorden: begrensd in lengte, gewone vragen ongewijzigd.
    const lang = zoekWoorden(`${'a'.repeat(100_000)}b c`);
    check('toets 2: zoekWoorden — een woord van 100 000 tekens gaat ingekort (64) naar SQL; de hele vraag telt hoogstens 200 tekens',
      lang.length === 1 && lang[0] === 'a'.repeat(64), JSON.stringify(lang.map((w) => w.length)));
    const veel = zoekWoorden(Array.from({ length: 50 }, (_, i) => `w${i}${'x'.repeat(30)}`).join(' '));
    check('toets 2: zoekWoorden — hoogstens 8 woorden, elk ≤ 64 tekens, samen ≤ 200 tekens', veel.length <= 8 && veel.every((w) => w.length <= 64) && veel.join(' ').length <= 200);
    check('toets 2: zoekWoorden — gewone vragen ongewijzigd (kleine letters, NFC, Oekraïense letters, hoogstens 8 woorden)',
      zoekWoorden('  Привіт   Wereld ').join() === 'привіт,wereld' && zoekWoorden('й').join() === 'й' && zoekWoorden('a b c d e f g h i j').join('') === 'abcdefgh'
      && zoekWoorden(`${'x'.repeat(64)} y`).join() === `${'x'.repeat(64)},y` && zoekWoorden('').length === 0 && zoekWoorden(undefined).length === 0);
  }

  // ================================================================ wolk-11: lijst onder «alleen lezen» + opruimen van de prullenbak
  {
    const pool = getPool('systeem');
    const sfx = randomBytes(4).toString('hex');
    const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved' }]); return id; };
    const a = await mk(`sec2-g04-a-${sfx}@eenheid.test`);
    const beheerder = await mk(`sec2-g04-b-${sfx}@eenheid.test`);
    const prive = { userId: a, ruimte: 'prive' as const };
    try {
      const n = await vn.notitieMaken(prive, { titel: 'Zichtbaar', inhoud: 'tekst', soort: 'tekst', kleur: 'geen', etiketten: [], mapId: null, vast: false });
      if ('fout' in n) throw new Error('maken mislukt');
      const verlopen = String((await pool.query(`INSERT INTO app.notities (user_id, ruimte, titel, inhoud_md, inhoud_plat, verwijderd_op) VALUES ($1, 'prive', 'Verlopen in de prullenbak', 'oud', 'oud', now() - interval '40 days') RETURNING id`, [a])).rows[0].id);
      const bestaat = async () => (await pool.query('SELECT 1 FROM app.notities WHERE id = $1', [verlopen])).rows.length === 1;

      let fout = ''; let lijst: vn.LijstUit | null = null; let geblokkeerd = false;
      try { const r = await metImpersonatie({ id: a, door: beheerder }, true, () => vn.notitiesLijst(prive, {})); lijst = r.waarde; geblokkeerd = r.geblokkeerd; }
      catch (err) { fout = `${(err as { code?: string }).code ?? ''} ${(err as Error).message}`; }
      check('wolk-11: de lijst onder impersonatie «alleen lezen» komt terug (geen 25P02 / 500)', Boolean(lijst) && lijst?.notities.some((x) => x.id === n.id) === true && lijst?.telling.alle === 1, fout);
      check('wolk-11: … en dat telt niet als een geblokkeerde schrijfpoging van de beheerder', Boolean(lijst) && !geblokkeerd);
      check('wolk-11: onder «alleen lezen» wordt de prullenbak NIET opgeruimd (de kijker verandert niets)', await bestaat());
      const prullenbak = await metImpersonatie({ id: a, door: beheerder }, true, () => vn.notitiesLijst(prive, { weergave: 'prullenbak' })).catch(() => null);
      check('wolk-11: ook de weergave «prullenbak» is onder «alleen lezen» te bekijken', prullenbak?.waarde.notities.some((x) => x.id === verlopen) === true);

      // Een mislukte opruiming (hier: DELETE in een alleen-lezen-transactie) mag de transactie van de lezer nooit breken.
      let na = 0; let fout2 = '';
      try { na = (await metImpersonatie({ id: a, door: beheerder }, true, () => alsGebruiker(a, async (q) => { await vn.prullenbakOpruimen(q, prive); return Number((await q('SELECT count(*)::int AS n FROM app.notities WHERE user_id = $1', [a])).rows[0].n); }))).waarde; }
      catch (err) { fout2 = `${(err as { code?: string }).code ?? ''} ${(err as Error).message}`; }
      check('wolk-11: een mislukte opruiming breekt de transactie niet (SAVEPOINT): de volgende SELECT werkt', na === 2, fout2);

      // Schrijven blijft onder «alleen lezen» geweigerd (de bestaande bescherming is niet verzwakt).
      const schrijf = await metImpersonatie({ id: a, door: beheerder }, true, () => vn.notitieMaken(prive, { titel: 'mag niet', inhoud: '', soort: 'tekst', kleur: 'geen', etiketten: [], mapId: null, vast: false })).then(() => 'gelukt', (err) => (err as Error).message);
      check('wolk-11: schrijven onder «alleen lezen» blijft geweigerd (IMPERSONATIE_ALLEEN_LEZEN)', schrijf === 'IMPERSONATIE_ALLEEN_LEZEN', schrijf);

      // De eigenaar zelf: de lijst ruimt de verlopen notitie op, zoals altijd.
      const eigen = await vn.notitiesLijst(prive, {});
      check('wolk-11: bij de eigenaar zelf ruimt de lijst de verlopen prullenbak nog steeds op (30 dagen)', eigen.telling.alle === 1 && eigen.telling.prullenbak === 0 && !(await bestaat()));
    } finally {
      await pool.query('DELETE FROM app.notities WHERE user_id = $1', [a]).catch(() => undefined);
      await pool.query('DELETE FROM app.mcp_console_items WHERE user_id = $1', [a]).catch(() => undefined);
      await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [[a, beheerder]]).catch(() => undefined);
    }
  }

  // ================================================================ NA DE TOETS, notitie 2: zoeken met een (heel) lang woord
  // ILIKE '%woord%' kost in PostgreSQL tekstlengte × woordlengte per rij. Vroeger ging het woord ongeknipt mee: een woord van
  // 100 000 tekens over een notitie van 200 000 tekens hield één verbinding tientallen seconden bezig (geen tijdslimiet), tien
  // zulke verzoeken namen de hele pool in. Nu: woord ≤ 64, vraag ≤ 200, en een tijdslimiet op de zoektransactie.
  {
    const pool = getPool('systeem');
    const sfx = randomBytes(4).toString('hex');
    const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved' }]); return id; };
    const z = await mk(`sec2-g04-z-${sfx}@eenheid.test`);
    const kijker = await mk(`sec2-g04-k-${sfx}@eenheid.test`);
    const lade = { userId: z, ruimte: 'prive' as const };
    const leeg = { soort: 'tekst' as const, kleur: 'geen' as const, etiketten: [], mapId: null, vast: false };
    try {
      for (const titel of ['Doel 1', 'Doel 2']) await vn.notitieMaken(lade, { ...leeg, titel, inhoud: 'a'.repeat(VN_MAX_INHOUD) });
      await vn.notitieMaken(lade, { ...leeg, titel: 'Boodschappen', inhoud: 'Melk en brood, 50% korting' });

      let info = '';
      for (const n of [200, 4000, 100_000]) {
        const t0 = process.hrtime.bigint();
        try { await vn.notitiesLijst(lade, { vraag: `${'a'.repeat(n)}b` }); } catch (err) { info = `n=${n}: ${(err as Error).message}`; break; }
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        if (ms > 1500) { info = `n=${n}: ${ms.toFixed(0)} ms (budget 1500 ms)`; break; }
      }
      check('toets 2: zoeken met een woord tot 100 000 tekens over notities van 200 000 tekens — binnen 1500 ms (het woord gaat ingekort naar SQL)', !info, info);

      const melk = await vn.notitiesLijst(lade, { vraag: 'MELK brood' });
      const procent = await vn.notitiesLijst(lade, { vraag: '50%' });
      const jokers = await vn.notitiesLijst(lade, { vraag: '%_%' });
      check('toets 2: gewoon zoeken werkt zoals altijd (hoofdletters, meerdere woorden, % en _ letterlijk)',
        melk.totaal === 1 && melk.notities[0]?.titel === 'Boodschappen' && procent.totaal === 1 && jokers.totaal === 0, `${melk.totaal}/${procent.totaal}/${jokers.totaal}`);

      // De tijdslimiet: een zoekvraag die te lang duurt wordt door PostgreSQL afgebroken en geeft een nette code, geen 500.
      let fout = ''; let oud = 0;
      const meldingen: string[] = [];
      registreerMelder(async (uid, _e, kind, titel) => { meldingen.push(`${uid}|${kind}|${titel}`); });
      try {
        oud = vn.zoekGrens.tijdslimietMs; vn.zoekGrens.tijdslimietMs = 1;
        await vn.notitiesLijst(lade, { vraag: `${'a'.repeat(63)}b` }); fout = 'geen fout';
      } catch (err) { fout = (err as Error).message; }
      finally { if (oud) vn.zoekGrens.tijdslimietMs = oud; }
      check('toets 2: een zoekvraag boven de tijdslimiet van PostgreSQL geeft de code ZOEKEN_TE_ZWAAR (geen 500)', fout === 'ZOEKEN_TE_ZWAAR', fout);
      // Ronde 2, notitie 7: de weigering laat een spoor na (audit «denied», zonder de zoektekst) en één melding per uur.
      const sporen = (await pool.query(`SELECT result, details FROM app.audit WHERE owner_id = $1 AND action = 'notitie.zoeken.te_zwaar'`, [z])).rows;
      check('toets 7 (ronde 2): ZOEKEN_TE_ZWAAR schrijft een auditregel (result denied, aantal woorden en lengte, NIET de zoektekst)',
        sporen.length === 1 && sporen[0].result === 'denied' && Number(sporen[0].details?.woorden) === 1 && Number(sporen[0].details?.lengte) === 64 && !JSON.stringify(sporen[0].details).includes('aaaa'),
        JSON.stringify(sporen).slice(0, 300));
      try {
        vn.zoekGrens.tijdslimietMs = 1;
        for (let i = 0; i < 3; i++) await vn.notitiesLijst(lade, { vraag: `${'a'.repeat(63)}b` }).catch(() => undefined);
      } finally { vn.zoekGrens.tijdslimietMs = oud || 5000; registreerMelder(async () => undefined); }
      check('toets 7 (ronde 2): de eigenaar van de notities krijgt een melding (soort security, uk/nl) — hoogstens één per uur, ook bij herhaling',
        meldingen.length === 1 && meldingen[0].startsWith(`${z}|security|`) && /\//.test(meldingen[0]), JSON.stringify(meldingen));
      const na = await vn.notitiesLijst(lade, {});
      check('toets 2: … daarna werkt de lijst gewoon (de limiet geldt alleen binnen die ene transactie)', na.totaal === 3 && vn.zoekGrens.tijdslimietMs >= 1000);

      // Zoeken onder impersonatie «alleen lezen» (SET LOCAL mag in een alleen-lezen-transactie).
      const ro = await metImpersonatie({ id: z, door: kijker }, true, () => vn.notitiesLijst(lade, { vraag: 'melk' })).then((r) => r.waarde.totaal, (err) => (err as Error).message);
      check('toets 2: zoeken onder impersonatie «alleen lezen» werkt', ro === 1, String(ro));
    } finally {
      await pool.query('DELETE FROM app.notities WHERE user_id = $1', [z]).catch(() => undefined);
      await pool.query('DELETE FROM app.mcp_console_items WHERE user_id = $1', [z]).catch(() => undefined);
      await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [[z, kijker]]).catch(() => undefined);
    }
  }

  // ================================================================ RONDE 2, notitie 6: lengte van ÉÉN veld vóór het normaliseren
  // Grenzen op het aantal hielpen niet tegen één heel lang element: «- »×6 miljoen als één etiket, een titel of mapnaam van 12 MB
  // of 12 MB «\r» werden eerst volledig genormaliseerd en pas daarna te lang bevonden (1–2,4 s per verzoek, ook voor een kijker).
  {
    const MB12 = [1_000_000, 12_000_000];
    const gevallen: Array<[string, (n: number) => string, (s: string) => unknown]> = [
      ['vnEtiketten met één etiket «- »×6 mln (ook het etiketfilter van de lijst)', (n) => '- '.repeat(n / 2), (s) => vnEtiketten([s])],
      ['schoneInvoer met één etiket «- »×6 mln', (n) => '- '.repeat(n / 2), (s) => schoneInvoer({ titel: 't', inhoud: 'x', etiketten: [s] })],
      ['schoneInvoer met een titel «a »×6 mln', (n) => 'a '.repeat(n / 2), (s) => schoneInvoer({ titel: s, inhoud: 'x' })],
      ['schoneInvoer met inhoud «\\r»×12 mln', (n) => '\r'.repeat(n), (s) => schoneInvoer({ titel: 't', inhoud: s })],
    ];
    for (const [naam, maak, doe] of gevallen) {
      const r = binnenBudget(MB12, maak, doe);
      check(`toets 6 (ronde 2): ${naam} — binnen het budget (tot 12 MB)`, r.ok, r.info);
    }
    const kop = binnenBudget([100_000, 3_900_000], (n) => `# a${' #'.repeat((n - 4) / 2)}b`, (s) => parseerImport({ naam: 'a.md', tekst: s }));
    check('toets 6 (ronde 2): import met een kopregel «# a» + « #»×1,95 mln + «b» (3,9 MB) — binnen het budget', kop.ok, kop.info);
    // Gewone invoer: zelfde uitkomst; de grens ligt ruim boven wat ooit geldig kan zijn.
    const t1 = schoneInvoer({ titel: `a${' '.repeat(9000)}b`, inhoud: 'x' });
    const i1 = schoneInvoer({ titel: 't', inhoud: '\r\n'.repeat(VN_MAX_INHOUD) });
    const i2 = schoneInvoer({ titel: 't', inhoud: `${'\r\n'.repeat(VN_MAX_INHOUD)}x` });
    check('toets 6 (ronde 2): titel met veel witruimte (tot 10 000 tekens ruw) en inhoud met CRLF (tot 2× de grens ruw) — zoals vroeger',
      t1.ok && t1.invoer.titel === 'a b' && i1.ok && i1.invoer.inhoud.length === VN_MAX_INHOUD && !i2.ok && i2.fout === 'INHOUD_TE_LANG');
    check('toets 6 (ronde 2): etiket tot 400 tekens ruw — zelfde uitkomst als vroeger (eerste 40 tekens na het opschonen)',
      vnSchoonEtiket(`##  ${'b'.repeat(300)}`) === 'b'.repeat(40) && vnSchoonEtiket('#Idee Twee') === 'idee-twee');
  }

  // ================================================================ RONDE 2, notitie 5: geen 500 voor vreemde invoer (zekering)
  // Een diep genest JSON-array (JSON.parse kan het, String() niet: RangeError) of een offset als 1e300/«Infinity» gaf 500. Elke 500
  // telt mee in de zekering van de beschermingen (antwoord-teller → zekeringOordeel): een kijker kon zo RLS/auth-poort laten uitzetten.
  {
    const diep = (n: number) => `${'['.repeat(n)}${']'.repeat(n)}`;
    let modelFout = '';
    for (const tekst of [`[{"titel":"t","inhoud":${diep(200_000)}}]`, `[{"titel":${diep(200_000)},"inhoud":"x"}]`, `[{"titel":"t","tags":[${diep(200_000)}]}]`, `[{"titel":"t","soort":"lijst","items":[{"text":${diep(200_000)}}]}]`]) {
      try { parseerImport({ naam: 'a.json', tekst }); } catch (err) { modelFout = `${tekst.slice(0, 40)}… → ${(err as Error).message}`; break; }
    }
    check('toets 5 (ronde 2): parseerImport met diep geneste JSON-waarden gooit niets (geen RangeError)', !modelFout, modelFout);
    let invoerFout = '';
    const genest = JSON.parse(diep(200_000)) as unknown;
    for (const veld of ['titel', 'inhoud', 'mapId', 'etiketten']) {
      try { schoneInvoer({ titel: 't', inhoud: 'x', [veld]: veld === 'etiketten' ? [genest] : genest }); } catch (err) { invoerFout = `${veld} → ${(err as Error).message}`; break; }
    }
    check('toets 5 (ronde 2): schoneInvoer met diep geneste waarden in titel/inhoud/map/etiketten gooit niets', !invoerFout, invoerFout);

    const pool = getPool('systeem');
    const sfx = randomBytes(4).toString('hex');
    const mk = async (email: string, role: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status: 'approved' }]); return { id, email, role, status: 'approved' }; };
    const kijker = await mk(`sec2-g04-r2k-${sfx}@eenheid.test`, 'viewer');
    const lid = await mk(`sec2-g04-r2l-${sfx}@eenheid.test`, 'member');
    try {
      const h = (u: typeof kijker) => router(vn.notitiesRoutes((async () => ({ user: u, service: 'hub' })) as never));
      const hk = h(kijker), hl = h(lid);
      let laatsteBody = '';
      const roep = async (hh: typeof hk, pad: string, body: string) => { const r = await hh({ rawPath: pad, body, requestContext: { http: { method: 'POST' } } } as never); laatsteBody = String(r.body); return Number(r.statusCode); };
      const D = diep(200_000);
      const n0 = await vn.notitieMaken({ userId: lid.id, ruimte: 'prive' }, { titel: 'Bestaand', inhoud: 'x', soort: 'tekst', kleur: 'geen', etiketten: [], mapId: null, vast: false });
      const nid = 'fout' in n0 ? '' : n0.id;
      const gevallen: Array<[string, typeof hk, string, string]> = [
        ['kijker: import, inhoud diep genest', hk, '/api/notities/import/voorbeeld', JSON.stringify({ bestanden: [{ naam: 'a.json', tekst: `[{"titel":"t","inhoud":${D}}]` }] })],
        ['kijker: import, titel diep genest', hk, '/api/notities/import/voorbeeld', JSON.stringify({ bestanden: [{ naam: 'a.json', tekst: `[{"titel":${D}}]` }] })],
        ['kijker: import, bestandsnaam diep genest', hk, '/api/notities/import/voorbeeld', `{"bestanden":[{"naam":${D},"tekst":"x"}]}`],
        ['kijker: lijst, offset 1e300', hk, '/api/notities/lijst', '{"offset":1e300}'],
        ['kijker: lijst, offset «Infinity»', hk, '/api/notities/lijst', '{"offset":"Infinity"}'],
        ['kijker: lijst, offset 1e21', hk, '/api/notities/lijst', '{"offset":1e21}'],
        ['kijker: lijst, offset −1e300', hk, '/api/notities/lijst', '{"offset":-1e300}'],
        ['kijker: lijst, offset diep genest', hk, '/api/notities/lijst', `{"offset":${D}}`],
        ['kijker: lijst, limiet diep genest', hk, '/api/notities/lijst', `{"limiet":${D}}`],
        ['kijker: lijst, limiet 0.5', hk, '/api/notities/lijst', '{"limiet":0.5}'],
        ['kijker: mappen, actie diep genest', hk, '/api/notities/mappen', `{"actie":${D}}`],
        ['lid: nieuw, titel diep genest', hl, '/api/notities/nieuw', `{"titel":${D},"inhoud":"x"}`],
        ['lid: nieuw, inhoud diep genest', hl, '/api/notities/nieuw', `{"titel":"t","inhoud":${D}}`],
        ['lid: nieuw, etiket diep genest', hl, '/api/notities/nieuw', `{"titel":"t","inhoud":"x","etiketten":[${D}]}`],
        ['lid: nieuw, mapId diep genest', hl, '/api/notities/nieuw', `{"titel":"t","inhoud":"x","mapId":${D}}`],
        ['lid: wijzig, versie diep genest', hl, '/api/notities/wijzig', `{"id":"${nid}","versie":${D},"vast":true}`],
        ['lid: wijzig, titel diep genest', hl, '/api/notities/wijzig', `{"id":"${nid}","titel":${D}}`],
        ['lid: revisie-herstel, revisieId diep genest', hl, '/api/notities/revisie-herstel', `{"id":"${nid}","revisieId":${D}}`],
        ['lid: mappen nieuw, naam diep genest', hl, '/api/notities/mappen', `{"actie":"nieuw","naam":${D}}`],
        ['lid: import uitvoeren, inhoud diep genest', hl, '/api/notities/import/uitvoeren', JSON.stringify({ bestanden: [{ naam: 'a.json', tekst: `[{"titel":"t","inhoud":${D}}]` }] })],
      ];
      _tellerLeeg();
      const vijfhonderd: string[] = [];
      const vangnet: string[] = [];
      for (const [naam, hh, pad, body] of gevallen) { const s = await roep(hh, pad, body); if (s >= 500) vijfhonderd.push(`${naam} → ${s}`); if (laatsteBody.includes('VERZOEK_ONGELDIG')) vangnet.push(naam); }
      check('toets 5 (ronde 2): elk geval wordt gericht afgevangen (tekst/getal-controle), niet pas door het vangnet voor RangeError', !vangnet.length, vangnet.join('; '));
      check(`toets 5 (ronde 2): ${gevallen.length} vreemde verzoeken via de echte router — geen enkel 5xx (alleen 200/400)`, !vijfhonderd.length, vijfhonderd.join('; '));
      const teller = som(Date.now() - 120_000);
      check('toets 5 (ronde 2): de antwoord-teller (zekering van de beschermingen) ziet geen 5xx', Number(teller['5xx'] || 0) === 0, JSON.stringify(teller));
      check('toets 5 (ronde 2): gewone verzoeken via dezelfde router — 200',
        (await roep(hk, '/api/notities/lijst', '{"offset":0}')) === 200 && (await roep(hk, '/api/notities/import/voorbeeld', JSON.stringify({ bestanden: [{ naam: 'a.json', tekst: '[{"titel":"t","inhoud":"x"}]' }] }))) === 200);

      // Notitie 6 via de route: een mapnaam van 12 MB wordt geweigerd vóór het normaliseren (en vóór de database).
      const naam12 = JSON.stringify({ actie: 'nieuw', naam: 'a '.repeat(6_000_000) });
      const t0 = process.hrtime.bigint(); const sMap = await roep(hl, '/api/notities/mappen', naam12); const msMap = Number(process.hrtime.bigint() - t0) / 1e6;
      const t1m = process.hrtime.bigint(); const fMap = await vn.mapMaken({ userId: lid.id, ruimte: 'prive' }, 'a '.repeat(6_000_000)); const msMaken = Number(process.hrtime.bigint() - t1m) / 1e6;
      check('toets 6 (ronde 2): mapnaam van 12 MB — NAAM_ONGELDIG binnen het budget (mapMaken zelf ≤ 200 ms; route incl. JSON-ontleding ≤ 600 ms)',
        sMap === 400 && 'fout' in fMap && fMap.fout === 'NAAM_ONGELDIG' && msMaken <= BUDGET_MS && msMap <= 600, `route ${sMap} ${msMap.toFixed(0)} ms, mapMaken ${msMaken.toFixed(0)} ms`);
    } finally {
      await pool.query('DELETE FROM app.notities WHERE user_id = ANY($1)', [[kijker.id, lid.id]]).catch(() => undefined);
      await pool.query('DELETE FROM app.notities_mappen WHERE user_id = ANY($1)', [[kijker.id, lid.id]]).catch(() => undefined);
      await pool.query('DELETE FROM app.mcp_console_items WHERE user_id = ANY($1)', [[kijker.id, lid.id]]).catch(() => undefined);
      await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [[kijker.id, lid.id]]).catch(() => undefined);
    }
  }

  return einde();
}
