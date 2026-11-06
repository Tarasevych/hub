// WIT OP HET ACCENT EN OP STATUSVLAKKEN (ORCH-001, oude fout, 05.11.2026). Zonder database.
//
// Gevonden in de volledige ronde van PR #30: contrast-knoppen-logos-20261021 check 7 faalde al op d0e6481 en 10a9278. Tien CSS-regels
// zetten #fff op var(--accent), op --mv2-fout (= --danger) of op de tegelkleur van de bibliotheek. In donkere paletten zijn die
// vlakken licht: wit haalt daar 1,2–2,6:1. Regel uit contrast-knoppen-logos-20261021: tekst op het accent = var(--text-on-accent),
// op een statusvlak = var(--text-on-vlak). De tegelkleur (ACCENT_KLEUREN.hoofd) heeft geen token: tegel-kleur.ts zet kleur én tekst
// met dezelfde vlag. Deze test REKENT het contrast van elke tegelkleur × modus en bewaakt de tien regels in de bron.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { ACCENT_KLEUREN, type Accent } from '../../shared/menu-model';
import { BIB_TEKST, accentStijl } from '../../src/werkblad/bibliotheek/tegel-kleur';
import { merkContrast } from '../../src/merk/merk-register';

const lees = (p: string) => readFileSync(p, 'utf8');
/** Declaraties van alle CSS-regels waarvan de VOLLEDIGE selector gelijk is aan `selector` (zonder commentaar), in bronvolgorde
 *  (zoals de cascade ze leest; ook een kleinere variant in @container telt mee); null als er geen is. */
const regel = (css: string, selector: string): string | null => {
  const treffers = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].trim() === selector);
  return treffers.length ? treffers.map((m) => m[2]).join(';') : null;
};
/** Laatste waarde van een eigenschap (de cascade: de laatste wint). */
const laatste = (body: string | null, rx: RegExp) => ([...(body || '').matchAll(rx)].at(-1)?.[1] || '').trim();
const kleurVan = (body: string | null) => laatste(body, /(?<![-\w])color\s*:\s*([^;}]+)/g);
const vlakVan = (body: string | null) => laatste(body, /background(?:-color)?\s*:\s*([^;}]+)/g);

export async function main(): Promise<number> {
  const { check, einde } = checker('contrast-tegels-20261105');

  // ------------------------------------------------------------------ 1. tegelkleur × modus: tekst/glief daarop
  const accenten = Object.keys(ACCENT_KLEUREN) as Accent[];
  check(`1a alle ${accenten.length} tegelkleuren uit ACCENT_KLEUREN`, accenten.length >= 12);
  let laagste = 99, waar = '';
  const fout: string[] = [];
  for (const a of accenten) for (const donker of [false, true]) {
    const st = accentStijl(a, donker) as Record<string, string>;
    const vlak = st['--bib-accent'], tekst = st['--bib-accent-tekst'];
    const modus = donker ? 'donker' : 'licht';
    const c = merkContrast(tekst, vlak);
    if (c < laagste) { laagste = c; waar = `${a}/${modus}`; }
    if (vlak !== ACCENT_KLEUREN[a][modus].hoofd) fout.push(`${a}/${modus}: kleur ${vlak}`);
    // De gekozen tekst is de beste van de twee (wit of bijna-zwart) op precies deze kleur.
    const ander = tekst === BIB_TEKST.licht ? BIB_TEKST.donker : BIB_TEKST.licht;
    if (merkContrast(ander, vlak) > c) fout.push(`${a}/${modus}: ${ander} haalt meer dan ${tekst}`);
  }
  check(`1b tekst/glief op elke tegelkleur ≥ 3:1 (glief, WCAG 1.4.11; laagste ${laagste.toFixed(2)} bij ${waar})`, laagste >= 3, waar);
  check('1c accentStijl zet de kleur uit ACCENT_KLEUREN en kiest per kleur de sterkste tekst', fout.length === 0, fout.slice(0, 4).join(' | '));
  const witDonker = accenten.filter((a) => merkContrast('#ffffff', ACCENT_KLEUREN[a].donker.hoofd) < 3).length;
  check(`1d wit op de donkere tegelkleur faalt bij ${witDonker} van ${accenten.length} — dáárom niet meer #fff in donker`, witDonker >= 10 && accenten.every((a) => (accentStijl(a, true) as Record<string, string>)['--bib-accent-tekst'] === BIB_TEKST.donker));
  const donkerLaagste = Math.min(...accenten.map((a) => merkContrast(BIB_TEKST.donker, ACCENT_KLEUREN[a].donker.hoofd)));
  check(`1e in donker haalt de tekst op elke tegelkleur ≥ 4,5:1 (laagste ${donkerLaagste.toFixed(2)})`, donkerLaagste >= 4.5);
  check('1f zonder accent geen inline-stijl (CSS-terugval)', accentStijl(undefined, true) === undefined && accentStijl(undefined, false) === undefined);

  // ------------------------------------------------------------------ 2. terugval in de CSS: grijs met wit
  const bib = lees('src/werkblad/bibliotheek/bibliotheek.css');
  const icoon = regel(bib, '.bib-tegel-icoon');
  const tv = /var\(--bib-accent-tekst,\s*(#[0-9a-f]{3,6})\)/i.exec(kleurVan(icoon))?.[1], vv = /var\(--bib-accent,\s*(#[0-9a-f]{6})\)/i.exec(vlakVan(icoon))?.[1];
  check(`2a .bib-tegel-icoon: tekst var(--bib-accent-tekst) en kleur var(--bib-accent), terugval ${tv} op ${vv} ≥ 4,5:1`,
    !!tv && !!vv && merkContrast(tv.length === 4 ? '#ffffff' : tv, vv) >= 4.5, `${kleurVan(icoon)} / ${vlakVan(icoon)}`);
  check('2b tegels.tsx exporteert accentStijl uit tegel-kleur.ts door (Bibliotheek en ShortcutTegel blijven werken)',
    /export \{ accentStijl \} from '\.\/tegel-kleur';/.test(lees('src/werkblad/bibliotheek/tegels.tsx'))
      && /import \{ accentStijl \} from '\.\/tegels'/.test(lees('src/werkblad/bibliotheek/Bibliotheek.tsx'))
      && /import \{ accentStijl, useRegisterBadge \} from '\.\/tegels'/.test(lees('src/werkblad/bibliotheek/ShortcutTegel.tsx')));

  // ------------------------------------------------------------------ 3. de tien regels in de bron
  const ACCENT: Array<[string, string]> = [
    ['src/foto/foto.css', '.foto-knop.is-hoofd'],
    ['src/foto/foto.css', '.foto-tegel.is-gekozen .foto-tegel-kies'],
    ['src/integraties/integraties.css', '.ic2-knop.is-primair'],
    ['src/integraties/integraties.css', '.iw2-stappen li[data-stand=nu] b'],
    ['src/werkblad/bibliotheek/bibliotheek.css', '.bib-chip[aria-pressed=true]'],
    ['src/werkblad/bibliotheek/bibliotheek.css', '.bib-primair'],
    ['src/werkblad/blokken/slepen.css', '.wb-sleep-geest[data-kopie="ja"]::after'],
    ['src/werkblad/blokken/slepen.css', '.wb-plekkiezer-knoppen button.hoofd'],
  ];
  const mis = ACCENT.filter(([f, sel]) => { const b = regel(lees(f), sel); return !b || !/^var\(--accent\b/.test(vlakVan(b)) || kleurVan(b) !== 'var(--text-on-accent)'; });
  check(`3a ${ACCENT.length} regels op het accent: tekst var(--text-on-accent)`, mis.length === 0, mis.map(([f, s]) => `${f}: ${s}`).join(' | '));
  const gevaar = regel(lees('src/meldingen/v2/meldingen-v2.css'), '.mv2u-actie.is-gevaar.is-bevestigd');
  check('3b bevestigde gevaarlijke actie (meldingen v2): vlak var(--fout-vlak) met tekst var(--text-on-vlak)',
    vlakVan(gevaar) === 'var(--fout-vlak)' && kleurVan(gevaar) === 'var(--text-on-vlak)', `${vlakVan(gevaar)} / ${kleurVan(gevaar)}`);
  return einde();
}
