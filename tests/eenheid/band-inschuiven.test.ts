// Technische band «headroom» (18.10.2026). Live gaf de eerste versie 305 wissels in 15 s: verbergen veranderde de geometrie (top van
// #root 40→0), de scrollcontainer werd hoger, de browser klemde scrollTop → scroll-gebeurtenis naar boven → tonen → … Hier:
//  1. de oude lus nagebootst (oude beslisregel + geometrie die bij elke wissel scrollTop klemt) → wisselt aan één stuk door;
//  2. de nieuwe beslisregel: drempel 24 px, ≥ 300 ms tussen wissels, niets binnen 220 ms na een wissel, bovenaan altijd zichtbaar,
//     rubberband begrensd, alleen grote containers; zelfs mét klemmende geometrie geen lus; 15 s intensief scrollen → hooguit zoveel
//     wissels als echte richtingswissels, 0 bij kleine bewegingen;
//  3. CSS/TechLaag: geen knop «Згорнути» meer, verbergen alleen via translate (geen top/height/padding die met de stand verandert).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { DREMPEL_PX, MIN_TUSSEN_MS, OVERGANG_MS, beginStaat, teltMee, toonNu, verwerkScroll, type Staat } from '../../src/tech/band-inschuiven';

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');
const BAND = 40;
const BRON = { naam: 'werkruimte' };

/** Speelt een reeks scrollTop-waarden af (één per `stap` ms) en telt wissels; `opnieuwOm` wordt uitgevoerd zoals de koppeling dat doet. */
function speel(posities: number[], o: { stap?: number; max?: number; start?: Staat } = {}) {
  const stap = o.stap ?? 16, max = o.max ?? 10_000;
  let s = o.start ?? beginStaat(), wissels = 0, t = 1000, wacht: number | undefined, laatste = 0;
  s = verwerkScroll(s, { tijd: t, bron: BRON, scrollTop: posities[0], max, bandH: BAND }).staat;
  for (const p of posities.slice(1)) {
    t += stap;
    if (wacht !== undefined && wacht <= t) { const u = verwerkScroll(s, { tijd: wacht + 5, bron: BRON, scrollTop: laatste, max, bandH: BAND }); s = u.staat; wacht = u.opnieuwOm; if (u.gewisseld) wissels++; }
    laatste = p;
    const u = verwerkScroll(s, { tijd: t, bron: BRON, scrollTop: p, max, bandH: BAND });
    s = u.staat; wacht = u.opnieuwOm; if (u.gewisseld) wissels++;
  }
  if (wacht !== undefined) { const u = verwerkScroll(s, { tijd: wacht + 5, bron: BRON, scrollTop: laatste, max, bandH: BAND }); s = u.staat; if (u.gewisseld) wissels++; }
  return { s, wissels };
}
const lijn = (van: number, naar: number, stappen: number) => Array.from({ length: stappen + 1 }, (_, i) => van + ((naar - van) * i) / stappen);

export async function main(): Promise<number> {
  const { check, einde } = checker('band-inschuiven');

  // ---------------------------------------------------------------- 1. oude lus nagebootst
  {
    // Oude regel (band-verbergen.ts, verwijderd): verbergen bij > 80 px en ≥ 10 px omlaag, tonen bij < 40 px of ≥ 10 px omhoog.
    // Geometrie zoals live: verborgen = container 40 px hoger → onderaan klemt de browser scrollTop met 40 px (scroll-gebeurtenis);
    // weer tonen = 40 px lager → de traagheid die nog tegen de onderkant duwt, scrolt weer omlaag → verbergen → klemmen → …
    const oud = (verborgen: boolean, top: number, d: number) => (top < 40 ? false : d > 10 && top > 80 ? true : d < -10 ? false : verborgen);
    const maxZichtbaar = 2000;
    const simuleer = (beslis: (st: { v: boolean; s: Staat }, t: number, top: number, max: number) => boolean) => {
      const st = { v: false, s: beginStaat() };
      let top = maxZichtbaar - 20, wissels = 0;
      for (let t = 0; t < 15_000; t += 16) {
        const max = st.v ? maxZichtbaar - BAND : maxZichtbaar;
        const naar = Math.min(max, top + 30); // traagheid van het touchpad duwt tegen de onderkant
        const geklemd = Math.min(naar, max);
        if (geklemd !== top) { const v = beslis(st, t, geklemd, max); if (v !== st.v) { st.v = v; wissels++; } }
        top = geklemd;
        const max2 = st.v ? maxZichtbaar - BAND : maxZichtbaar;
        if (top > max2) { const v = beslis(st, t + 8, max2, max2); top = max2; if (v !== st.v) { st.v = v; wissels++; } }
      }
      return wissels;
    };
    let vorigeTop = maxZichtbaar - 20;
    const oudeWissels = simuleer((st, _t, top) => { const d = top - vorigeTop; vorigeTop = top; return oud(st.v, top, d); });
    check(`reproductie: oude regel + klemmende geometrie wisselt aan één stuk door (${oudeWissels} wissels in 15 s)`, oudeWissels > 100);
    const nieuweWissels = simuleer((st, t, top, max) => { const u = verwerkScroll(st.s, { tijd: t, bron: BRON, scrollTop: top, max, bandH: BAND }); st.s = u.staat; return st.s.verborgen; });
    check(`nieuwe regel, zelfs mét klemmende geometrie: geen lus (${nieuweWissels} wissel(s))`, nieuweWissels <= 1);
  }

  // ---------------------------------------------------------------- 2. beslisregel
  {
    const b0 = beginStaat();
    const a = verwerkScroll(b0, { tijd: 1000, bron: BRON, scrollTop: 500, max: 5000, bandH: BAND }).staat;
    const b23 = verwerkScroll(a, { tijd: 1500, bron: BRON, scrollTop: 523, max: 5000, bandH: BAND });
    check(`drempel: ${DREMPEL_PX - 1} px omlaag → niets`, !b23.gewisseld && !b23.staat.verborgen);
    const b24 = verwerkScroll(a, { tijd: 1500, bron: BRON, scrollTop: 500 + DREMPEL_PX, max: 5000, bandH: BAND });
    check(`drempel: ${DREMPEL_PX} px omlaag → verbergen`, b24.gewisseld && b24.staat.verborgen);
    const opgeteld = speel([500, 506, 512, 518, 524, 530]);
    check('weg in één richting wordt opgeteld (5 × 6 px → verborgen)', opgeteld.s.verborgen && opgeteld.wissels === 1);
    const heenEnWeer = speel([500, 515, 500, 515, 500, 515, 500, 515, 500]);
    check('richting wisselt vóór de drempel → telling begint opnieuw, niets', heenEnWeer.wissels === 0);

    const v = b24.staat; // verborgen op t=1500
    const binnen = verwerkScroll(v, { tijd: 1500 + OVERGANG_MS - 1, bron: BRON, scrollTop: 400, max: 5000, bandH: BAND });
    check(`tijdens de animatie (< ${OVERGANG_MS} ms): ook 124 px omhoog wordt genegeerd`, !binnen.gewisseld && binnen.staat.verborgen && binnen.staat.som === 0);
    const tussen = verwerkScroll(binnen.staat, { tijd: 1500 + 250, bron: BRON, scrollTop: 370, max: 5000, bandH: BAND });
    check(`na de animatie maar < ${MIN_TUSSEN_MS} ms: nog niet wisselen, wel opnieuw beslissen op ${MIN_TUSSEN_MS} ms`, !tussen.gewisseld && tussen.opnieuwOm === 1500 + MIN_TUSSEN_MS);
    const later = verwerkScroll(tussen.staat, { tijd: 1500 + MIN_TUSSEN_MS + 5, bron: BRON, scrollTop: 370, max: 5000, bandH: BAND });
    check('… en dan tonen (30 px omhoog ≥ drempel)', later.gewisseld && !later.staat.verborgen);
    const omhoog = verwerkScroll(v, { tijd: 2400, bron: BRON, scrollTop: 500, max: 5000, bandH: BAND });
    check('verborgen + 24 px omhoog (na de pauze) → tonen', omhoog.gewisseld && !omhoog.staat.verborgen);

    const top = verwerkScroll(v, { tijd: 2400, bron: BRON, scrollTop: BAND, max: 5000, bandH: BAND });
    check(`bovenaan (scrollTop ≤ ${BAND}) altijd zichtbaar`, top.gewisseld && !top.staat.verborgen);
    const topSnel = verwerkScroll(v, { tijd: 1600, bron: BRON, scrollTop: 0, max: 5000, bandH: BAND });
    check('bovenaan binnen 300 ms na verbergen: getoond zodra het mag (opnieuwOm)', !topSnel.gewisseld && topSnel.opnieuwOm === 1500 + MIN_TUSSEN_MS);
    const laag = speel([0, 10, 20, 30, 40, 30, 20, 40, 0]);
    check('heen en weer binnen de bovenste bandhoogte → nooit verborgen', laag.wissels === 0);

    const rubberTop = speel([300, 200, 100, 0, -60, -30, 0, 0]);
    check('rubberband boven (negatieve scrollTop) → zichtbaar, geen gewissel', rubberTop.wissels === 0 && !rubberTop.s.verborgen);
    const naarOnder = speel([...lijn(100, 2000, 40), 2040, 2080, 2040, 2000, 2000], { max: 2000 });
    check('naar beneden tot het einde + rubberband onder (voorbij max en terug) → één keer verbergen, niet terug tonen', naarOnder.wissels === 1 && naarOnder.s.verborgen);

    const andere = verwerkScroll(a, { tijd: 1500, bron: { naam: 'paneel' }, scrollTop: 900, max: 5000, bandH: BAND });
    check('andere container: alleen een nieuw beginpunt (sprong van 400 px telt niet)', !andere.gewisseld && !andere.staat.verborgen && andere.staat.vorige === 900);
    const vast = verwerkScroll(a, { tijd: 1500, bron: BRON, scrollTop: 800, max: 5000, bandH: BAND, vast: true });
    check('lijst «⋯»/venster open (vast) → niet verbergen', !vast.gewisseld && !vast.staat.verborgen);
    check('muis aan de bovenrand / focus / Esc → toonNu toont meteen', toonNu(v, 1600).gewisseld && !toonNu(v, 1600).staat.verborgen && !toonNu(a, 1600).gewisseld);

    check('container-filter: klein lijstje (300 px van 800) telt niet', !teltMee({ clientHeight: 300, scrollHeight: 2000 }, 800));
    check('container-filter: niet scrollbaar telt niet', !teltMee({ clientHeight: 760, scrollHeight: 760 }, 800));
    check('container-filter: werkruimte (760 van 800, scrollbaar) telt', teltMee({ clientHeight: 760, scrollHeight: 4000 }, 800));
  }

  // ---------------------------------------------------------------- 2b. 15 s intensief scrollen (constante geometrie)
  {
    // Wiel omlaag/omhoog, rukken van 600 px, naar het einde, rubberband, kleine trillingen — 60 fps.
    const pos: number[] = [];
    let p = 0;
    const push = (naar: number, stappen: number) => { for (const x of lijn(p, naar, stappen).slice(1)) pos.push(x); p = naar; };
    for (let r = 0; r < 14; r++) {
      push(p + 900, 30); push(p - 300, 12); push(p + 600, 3); push(p - 600, 3); // wiel + rukken
      for (let i = 0; i < 8; i++) push(p + (i % 2 ? 9 : -9), 2);                 // trillingen < 24 px
    }
    push(6000, 40); push(6080, 4); push(6000, 4); push(0, 60); push(-50, 4); push(0, 4); // einde, rubberband onder, naar boven, rubberband boven
    const tijdsduur = pos.length * 16;
    const r = speel([0, ...pos], { max: 6000 });
    // Echte richtingswissels: segmenten van ≥ 24 px in één richting.
    let echte = 0, richting = 0, sindsDraai = 0, vorige = 0;
    for (const x of [0, ...pos].map((y) => Math.min(Math.max(y, 0), 6000))) {
      const d = x - vorige; vorige = x;
      if (!d) continue;
      const nr = Math.sign(d);
      if (nr !== richting) { sindsDraai = 0; richting = nr; }
      sindsDraai += Math.abs(d);
      if (sindsDraai >= DREMPEL_PX && sindsDraai - Math.abs(d) < DREMPEL_PX) echte++;
    }
    check(`15 s scenario (${Math.round(tijdsduur / 1000)} s): ${r.wissels} wissels ≤ ${echte} echte richtingswissels`, tijdsduur >= 15_000 && r.wissels <= echte && r.wissels >= 2);
    check('… en eindigt bovenaan zichtbaar', !r.s.verborgen);
    const tril: number[] = [];
    for (let i = 0; i < 15_000 / 16; i++) tril.push(800 + (i % 4 < 2 ? 0 : 20) + (i % 7));
    check('15 s kleine bewegingen (< 24 px) → 0 wissels', speel(tril).wissels === 0);
  }

  // ---------------------------------------------------------------- 3. CSS en TechLaag
  {
    const css = lees('src/tech/tech.css'), laag = lees('src/tech/TechLaag.tsx'), hr = lees('src/tech/band-inschuiven.ts');
    check('knop «Згорнути смугу» en band-inklappen.ts zijn weg', !existsSync(join(W, 'src/tech/band-inklappen.ts')) && !/inklappen|ingeklapt|klap\(/.test(laag) && !/tech-band-lijn|tech-band-inklap|data-tech-ingeklapt/.test(css));
    check('TechLaag koppelt headroom alleen als de band actief is', /koppelHeadroom\(\{ band: \(\) => bandRef\.current/.test(laag) && /\[bandAan\]\)/.test(laag));
    const regels = css.match(/html\[data-tech=aan\]\[data-tech-verborgen\][^{]*\{[^}]*\}/g) || [];
    check(`verborgen-regels (${regels.length}) zetten alleen translate — geen top/height/padding/margin/inset/bottom`, regels.length >= 4 && regels.every((r) => /\{translate:[^;}]+\}$/.test(r)));
    check('#root zelf: top blijft var(--tech-band-h) in beide standen', /html\[data-tech=aan\] #root\{position:fixed;top:var\(--tech-band-h\)/.test(css) && !/data-tech-verborgen\][^{]*#root\{[^}]*top:/.test(css));
    check('band, #root, bel/melding/paneel schuiven met dezelfde duur (.22s)', (css.match(/transition:translate \.22s ease/g) || []).length >= 4 && hr.includes('OVERGANG_MS = 220'));
    check('prefers-reduced-motion: geen animatie', /prefers-reduced-motion:reduce\)\{html\[data-tech=aan\] body>#root,\.tech-band[^}]*transition:none!important\}/.test(css));
    check('scroll-luisteraar met capture op het document (echte container via e.target), passief', /addEventListener\('scroll', opScroll, \{ capture: true, passive: true \}\)/.test(hr) && hr.includes('e.target'));
    check('zijbalk: één bandhoogte langer met evenveel extra onderpadding (12/10/8 px + band) — inhoud even hoog als vroeger', /height:calc\(100% \+ var\(--tech-band-h\)\);max-height:none;box-sizing:border-box;padding-bottom:calc\(12px \+ var\(--tech-band-h\)\)/.test(css) && css.includes('padding-bottom:calc(10px + var(--tech-band-h))') && css.includes('padding-bottom:calc(8px + var(--tech-band-h))'));
  }
  return einde();
}
