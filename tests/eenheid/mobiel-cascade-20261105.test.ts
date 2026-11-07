// MOBIELE LAAG VERLIEST VAN DE BASISREGEL (ORCH-001, oude fouten, 05.11.2026). Zonder database, zonder browser.
//
// Gevonden in de volledige ronde en het visuele onderzoek van PR #30. Eén foutklasse, vier keer: een @media (max-width:…)-blok staat
// MIDDEN in een CSS-bestand, en een latere basisregel met dezelfde selector zet dezelfde eigenschap terug — op de telefoon wint dan de
// pc-waarde (gelijke specificiteit, de laatste wint). Zo bleven de knoppen van de geheimenkluis 38 px (460b215) en de catalogus van het
// werkblad een lijst van 58vh met eigen scroll. Twee varianten: een sterkere basisregel (contacten.css, (0,2,0) tegen (0,1,0)) en een
// regel die pas werkt sinds het bestand geladen wordt (mail-accounts-hub.css, bfd54ac).
//
// Deze test REKENT de cascade na: een kleine CSS-lezer (geen afhankelijkheden) en twee profielen — telefoon (390×844, pointer:coarse)
// en pc (1280×800, pointer:fine). Deel 1–4: de gerepareerde regels per breedte. Deel 5: de foutklasse over ALLE CSS-bestanden in src/,
// met een vaste lijst bewuste uitzonderingen (MOB-6 uit het onderzoek): een nieuwe dode mobiele regel laat deze test falen.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checker } from './hulp/nep-google';

type Profiel = { breedte: number; hoogte: number; pointer: 'coarse' | 'fine'; hover: 'none' | 'hover' };
const TELEFOON: Profiel = { breedte: 390, hoogte: 844, pointer: 'coarse', hover: 'none' };
const pc = (breedte = 1280): Profiel => ({ breedte, hoogte: 800, pointer: 'fine', hover: 'hover' });
const telefoon = (breedte = 390): Profiel => ({ ...TELEFOON, breedte });

type Decl = { eig: string; waarde: string; belangrijk: boolean };
type Regel = { selectors: string[]; decls: Decl[]; media: string[]; overig: boolean; volg: number };

/** Splitst op een scheidingsteken buiten haakjes en aanhalingstekens. */
const splits = (s: string, teken: string): string[] => {
  const uit: string[] = []; let diep = 0, q = '', start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '(' || c === '[') diep++;
    else if (c === ')' || c === ']') diep--;
    else if (c === teken && diep === 0) { uit.push(s.slice(start, i)); start = i + 1; }
  }
  uit.push(s.slice(start));
  return uit.map((x) => x.trim()).filter(Boolean);
};
const normSel = (s: string) => s.replace(/\s+/g, ' ').replace(/\s*>\s*/g, '>').trim();

/** Leest een stylesheet in regels met hun @media-context. @container/@supports/@layer/@keyframes/@font-face: `overig` (niet meegeteld). */
export const leesCss = (bron: string): Regel[] => {
  const css = bron.replace(/\/\*[\s\S]*?\*\//g, '');
  const regels: Regel[] = [];
  let i = 0, volg = 0;
  const blok = (media: string[], overig: boolean) => {
    while (i < css.length) {
      let kop = '', q = '';
      while (i < css.length) {
        const c = css[i];
        if (q) { kop += c; if (c === '\\') { kop += css[i + 1] || ''; i += 2; continue; } if (c === q) q = ''; i++; continue; }
        if (c === '"' || c === "'") { q = c; kop += c; i++; continue; }
        if (c === '{' || c === '}' || c === ';') break;
        kop += c; i++;
      }
      const c = css[i];
      if (c === undefined) return;
      if (c === '}') { i++; return; }
      if (c === ';') { i++; continue; }
      i++; // '{'
      const k = kop.trim();
      if (k.startsWith('@')) {
        const naam = k.slice(1).split(/[\s(]/)[0].toLowerCase();
        if (naam === 'media') blok([...media, k.slice(6).trim()], overig);
        else if (naam === 'keyframes' || naam.endsWith('keyframes') || naam === 'font-face' || naam === 'page' || naam === 'property') slaOver();
        else blok(media, true);
        continue;
      }
      let lijf = '', diep = 0; q = '';
      while (i < css.length) {
        const d = css[i];
        if (q) { lijf += d; if (d === '\\') { lijf += css[i + 1] || ''; i += 2; continue; } if (d === q) q = ''; i++; continue; }
        if (d === '"' || d === "'") { q = d; lijf += d; i++; continue; }
        if (d === '{') diep++;
        if (d === '}') { if (diep === 0) { i++; break; } diep--; }
        lijf += d; i++;
      }
      const decls = splits(lijf, ';').map((d): Decl | null => {
        const p = d.indexOf(':'); if (p < 0) return null;
        let waarde = d.slice(p + 1).trim(); const belangrijk = /!\s*important\s*$/i.test(waarde);
        if (belangrijk) waarde = waarde.replace(/!\s*important\s*$/i, '').trim();
        return { eig: d.slice(0, p).trim().toLowerCase(), waarde: waarde.replace(/\s+/g, ' '), belangrijk };
      }).filter((d): d is Decl => !!d);
      regels.push({ selectors: splits(k, ',').map(normSel), decls, media, overig, volg: volg++ });
    }
  };
  const slaOver = () => { let diep = 1; while (i < css.length && diep) { if (css[i] === '{') diep++; else if (css[i] === '}') diep--; i++; } };
  blok([], false);
  return regels;
};

const px = (w: string) => { const m = /^([\d.]+)(px|rem|em)$/.exec(w.trim()); return m ? Number(m[1]) * (m[2] === 'px' ? 1 : 16) : NaN; };
/** Media query voor een profiel. Onbekende kenmerken (prefers-*, print, …) gelden als NIET van toepassing. */
export const mediaPast = (q: string, p: Profiel): boolean => splits(q, ',').some((deel) => {
  let d = deel.trim().toLowerCase(); let niet = false;
  if (d.startsWith('not ')) { niet = true; d = d.slice(4); }
  d = d.replace(/^only\s+/, '');
  const delen = d.split(/\s+and\s+/);
  const ok = delen.every((f) => {
    const t = f.trim();
    if (t === 'screen' || t === 'all') return true;
    if (t === 'print' || t === 'speech') return false;
    const m = /^\(\s*([a-z-]+)\s*(?::\s*([^)]+))?\)$/.exec(t);
    if (!m) return false;
    const [, k, v = ''] = m; const w = v.trim();
    switch (k) {
      case 'max-width': return p.breedte <= px(w);
      case 'min-width': return p.breedte >= px(w);
      case 'max-height': return p.hoogte <= px(w);
      case 'min-height': return p.hoogte >= px(w);
      case 'pointer': case 'any-pointer': return w === p.pointer;
      case 'hover': case 'any-hover': return w === p.hover;
      case 'orientation': return w === (p.hoogte >= p.breedte ? 'portrait' : 'landscape');
      case 'prefers-reduced-motion': return w === 'no-preference';
      default: return false;
    }
  });
  return niet ? !ok : ok;
});
const contextPast = (r: Regel, p: Profiel) => !r.overig && r.media.every((q) => mediaPast(q, p));
/** Winnende waarde van `eig` voor een EXACTE selector in deze regels (zelfde specificiteit: !important, dan de laatste). */
export const wint = (regels: Regel[], selector: string, eig: string, p: Profiel): { waarde: string; regel: Regel } | null => {
  const s = normSel(selector); let best: { waarde: string; regel: Regel; belangrijk: boolean } | null = null;
  for (const r of regels) {
    if (!r.selectors.includes(s) || !contextPast(r, p)) continue;
    for (const d of r.decls) if (d.eig === eig && (!best || d.belangrijk || !best.belangrijk)) best = { waarde: d.waarde, regel: r, belangrijk: d.belangrijk };
  }
  return best ? { waarde: best.waarde, regel: best.regel } : null;
};
const lees = (p: string) => readFileSync(p, 'utf8');
const css = (p: string) => leesCss(lees(p));
const waarde = (regels: Regel[], sel: string, eig: string, p: Profiel) => wint(regels, sel, eig, p)?.waarde ?? '(geen)';

const alleCss = (map: string): string[] => readdirSync(map).flatMap((n) => {
  const p = join(map, n);
  return statSync(p).isDirectory() ? alleCss(p) : n.endsWith('.css') ? [p] : [];
});

/** Bewuste of onschadelijke gevallen (onderzoek MOB-6, 05.11.2026): «bestand|selector|eigenschap». Nieuw geval → eerst begrijpen. */
const BEKEND = new Set<string>([
  // bewust: «Tuimelaar altijd 44×24 (ook als de site op de telefoon knoppen groter maakt)» — commentaar 28.10.2026 in vlaggen.css
  'src/vlaggen/vlaggen.css|.vlag-tuimel|width', 'src/vlaggen/vlaggen.css|.vlag-tuimel|height',
  'src/vlaggen/vlaggen.css|.vlag-tuimel span|width', 'src/vlaggen/vlaggen.css|.vlag-tuimel span|height',
  'src/vlaggen/vlaggen.css|.vlag-tuimel[aria-pressed=true] span|left',
  // bewust: HUB-10 — de werkbalk van een klein blok loopt binnen het blok om (100 %), ook op de telefoon
  'src/ecosysteem-productie.css|.block-head-actions|max-width',
  // geen effect: height:100% van een ouder met hoogte auto = auto; de rijen zet @container (max-width:380px) r. 232 (niet meegeteld)
  'src/werkblad/werkblad.css|.wb-snel|height', 'src/werkblad/werkblad.css|.wb-snel|grid-auto-rows',
  // geen zichtbaar effect: de knop is ±86 px breed, het maximum (112/100 tegen 180 px) wordt niet bereikt
  'src/mail-opstel-bewerker.css|.mail-compose-dropdown-trigger|max-width',
  // verschil < 3 px / 0,001em
  'src/mail-minimum-rij.css|.mail-minimum-sender|max-width', 'src/mail/mail-orbit-intro.css|.mail-orbit-kop h2|letter-spacing',
]);
/** Profielen waarop «breder» getoetst wordt. */
const BREDER: Profiel[] = [pc(), pc(1024), pc(800), { breedte: 800, hoogte: 1180, pointer: 'coarse', hover: 'none' }];

export async function main(): Promise<number> {
  const { check, einde } = checker('mobiel-cascade-20261105');

  // ------------------------------------------------------------------ 0. de lezer zelf
  const proef = leesCss(`/* x{a:b} */ .a{color:red}@media (max-width:700px){.a, .b > .c{color:blue!important;min-height:44px}}
    @container (min-width:1px){.a{color:green}} @keyframes k{from{opacity:0}to{opacity:1}} .s{content:"{;}";color:x}`);
  check('0a lezer: regels, selectorlijst, media, !important, @container apart, keyframes overgeslagen, string met { ; }',
    proef.length === 4 && proef[1].selectors.join('|') === '.a|.b>.c' && proef[1].media[0] === '(max-width:700px)'
      && proef[1].decls[0].belangrijk && proef[2].overig && proef[3].decls.find((d) => d.eig === 'color')?.waarde === 'x',
    JSON.stringify(proef.map((r) => [r.selectors, r.media, r.overig, r.decls])));
  check('0b media: komma = of, and = en, pointer/hover, onbekend = nee',
    mediaPast('(pointer:coarse),(max-width:700px)', pc(600)) && !mediaPast('(pointer:coarse),(max-width:700px)', pc(800))
      && mediaPast('(min-width:481px) and (max-width:700px)', telefoon(640)) && !mediaPast('(prefers-color-scheme:dark)', TELEFOON)
      && mediaPast('(max-width: 560px)', TELEFOON) && mediaPast('(hover:none)', TELEFOON) && !mediaPast('print', TELEFOON));
  check('0c winnaar: !important wint van later, anders de laatste', waarde(proef, '.a', 'color', TELEFOON) === 'blue'
    && waarde(proef, '.a', 'color', pc()) === 'red' && waarde(proef, '.b>.c', 'min-height', TELEFOON) === '44px');

  // ------------------------------------------------------------------ 1. werkblad: catalogus in het venster
  const wb = css('src/werkblad/werkblad.css');
  const wbT = ['max-height', 'overflow'].map((e) => waarde(wb, '.wb-catalogus-lijst', e, TELEFOON));
  check('1a werkblad 390: catalogus zonder eigen hoogte en scroll (alleen het venster scrollt)', wbT.join('|') === 'none|visible', wbT.join('|'));
  const wbP = ['max-height', 'overflow'].map((e) => waarde(wb, '.wb-catalogus-lijst', e, pc()));
  check('1b werkblad pc: catalogus blijft min(58vh,560px) met eigen scroll', wbP.join('|') === 'min(58vh,560px)|auto', wbP.join('|'));
  const wbBasis = wint(wb, '.wb-catalogus-lijst', 'max-height', pc())?.regel.volg ?? Infinity;
  const wbMobiel = wb.filter((r) => r.selectors.includes('.wb-catalogus-lijst') && r.media.some((q) => /max-width:\s*700px/.test(q)));
  check('1c werkblad: precies één mobiele catalogusregel, en die staat NA de basisregel (de oude in het eerste blok is weg)',
    wbMobiel.length === 1 && wbMobiel[0].volg > wbBasis, `${wbMobiel.map((r) => r.volg).join(',')} vs basis ${wbBasis}`);

  // ------------------------------------------------------------------ 2. contacten: knoppen van een contact
  const ctv = css('src/afzenders/contacten.css');
  for (const [sel, pcWaarde] of [['.ctv-acties .afz-knop', '40px'], ['.ctv-eigen-foto .afz-knop', '32px']] as const) {
    const per = [telefoon(390), telefoon(640), pc(700)].map((p) => waarde(ctv, sel, 'min-height', p));
    check(`2a ${sel}: 390/640/700 px → var(--tik-hoogte) (44 px op de telefoon)`, per.every((v) => v === 'var(--tik-hoogte)'), per.join('|'));
    const desk = [pc(), pc(701)].map((p) => waarde(ctv, sel, 'min-height', p));
    check(`2b ${sel}: pc ongewijzigd ${pcWaarde}`, desk.every((v) => v === pcWaarde), desk.join('|'));
  }
  const afz = lees('src/afzenders/afzenders.css');
  check('2c afzenders.css: dezelfde grens (≤700 px) voor de mobiele .afz-knop', /@media\s*\(max-width:\s*700px\)\s*\{[^}]*\.afz-knop[^{]*\{[^}]*min-height:\s*var\(--tik-hoogte\)/.test(afz.replace(/\/\*[\s\S]*?\*\//g, '')));

  // ------------------------------------------------------------------ 3. postaccounts: belvenster en schild
  const mah = css('src/mail-accounts-hub.css');
  const belT = {
    bel: waarde(mah, '.mail-melding-bel', 'position', TELEFOON),
    pos: waarde(mah, '.mail-melding-venster', 'position', TELEFOON),
    links: waarde(mah, '.mail-melding-venster', 'left', TELEFOON),
    rechts: waarde(mah, '.mail-melding-venster', 'right', TELEFOON),
    breed: waarde(mah, '.mail-melding-venster', 'width', TELEFOON),
    top: waarde(mah, '.mail-melding-venster', 'top', TELEFOON),
  };
  check('3a postaccounts 390: venster absoluut binnen de KAART (bel static, links/rechts ruimte-3, direct onder de knop)',
    belT.bel === 'static' && belT.pos === 'absolute' && belT.links === 'var(--ruimte-3)' && belT.rechts === 'var(--ruimte-3)' && belT.breed === 'auto' && belT.top === 'auto',
    JSON.stringify(belT));
  check('3b postaccounts 390: het venster wordt nooit static (dat gaf de adreskolom 0 px)',
    [320, 390, 480].every((b) => waarde(mah, '.mail-melding-venster', 'position', telefoon(b)) === 'absolute'));
  check('3c postaccounts: de kaart is het ankerpunt (.mail-koppeling position:relative)', waarde(mah, '.mail-koppeling', 'position', TELEFOON) === 'relative');
  const belP = [waarde(mah, '.mail-melding-bel', 'position', pc()), waarde(mah, '.mail-melding-venster', 'right', pc()), waarde(mah, '.mail-melding-venster', 'width', pc())];
  check('3d postaccounts pc (≥481 px): ongewijzigd — venster rechts onder de bel, max. 320 px', belP.join('|') === 'relative|0|min(320px,calc(100vw - 32px))'
    && waarde(mah, '.mail-melding-bel', 'position', pc(481)) === 'relative', belP.join('|'));
  check('3e postaccounts: het schild in de noot krimpt niet (flex:none)', ['none'].includes(waarde(mah, '.mail-koppeling-noot>svg', 'flex', TELEFOON))
    && waarde(mah, '.mail-koppeling-noot', 'display', TELEFOON) === 'flex');
  check('3f postaccounts: de stylesheet wordt echt geladen', /import '\.\/mail-accounts-hub\.css';/.test(lees('src/MailAccountsHub.tsx')));

  // ------------------------------------------------------------------ 4. geheimenkluis (460b215) en het vangnet
  const gm = css('src/geheimen/geheimen.css');
  const gmT = ['.gm-root .gm-knop', '.gm-kluis-formulier .gm-knop'].map((s) => waarde(gm, s, 'min-height', TELEFOON));
  check('4a geheimenkluis 390: beide knopregels var(--tik-hoogte)', gmT.every((v) => v === 'var(--tik-hoogte)'), gmT.join('|'));
  check('4b geheimenkluis pc: formulierknop blijft 38 px', waarde(gm, '.gm-kluis-formulier .gm-knop', 'min-height', pc()) === '38px');
  const fund = lees('src/ontwerp/mobiel.css');
  check('4c ontwerp/mobiel.css: commentaar noemt de echte specificiteit (0,3,1) en de svg-plus-tekst-uitzondering',
    fund.includes('(0,3,1)') && /svg \+ текст/.test(fund) && fund.includes(':not(:has(> svg:only-child)):not(.is-icoon)'));

  // ------------------------------------------------------------------ 5. de foutklasse over alle CSS in src/
  const dood: string[] = [];
  let bestanden = 0, mobiel = 0;
  for (const p of alleCss('src')) {
    const rel = relative('.', p).replace(/\\/g, '/');
    const regels = css(p); bestanden++;
    for (const r of regels) {
      // alleen regels die op de telefoon WEL en op de pc NIET gelden (het mobiele blok)
      if (!contextPast(r, TELEFOON) || contextPast(r, pc()) || !r.media.length) continue;
      mobiel++;
      for (const s of r.selectors) for (const d of r.decls) {
        const w = wint(regels, s, d.eig, TELEFOON);
        if (!w || w.waarde === d.waarde) continue;
        // Een later blok dat even smal of smaller is, zet het bewust anders: geen fout. Fout = de winnaar is BREDER (geldt ook op een
        // tablet of pc waar de mobiele regel niet geldt): dan verliest de telefoon zijn eigen waarde aan de algemene.
        if (!BREDER.some((q) => contextPast(w.regel, q) && !contextPast(r, q))) continue;
        const sleutel = `${rel}|${s}|${d.eig}`;
        if (!BEKEND.has(sleutel)) dood.push(`${sleutel}: mobiel «${d.waarde}» → wint «${w.waarde}»`);
      }
    }
  }
  check(`5a ${bestanden} CSS-bestanden, ${mobiel} mobiele regels gelezen`, bestanden > 100 && mobiel > 200, `${bestanden}/${mobiel}`);
  check('5b geen mobiele regel die verliest van een latere basisregel met dezelfde selector', dood.length === 0, dood.join('\n     '));

  return einde();
}
