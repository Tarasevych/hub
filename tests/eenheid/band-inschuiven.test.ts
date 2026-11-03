// Technische band: in- en uitschuiven (band-inschuiven.ts). Geschiedenis van deze test:
//  • 18.10.2026 «headroom»: live gaf de eerste versie 305 wissels in 15 s — verbergen veranderde de geometrie (top van #root 40→0), de
//    scrollcontainer werd hoger, de browser klemde scrollTop → scroll-gebeurtenis naar boven → tonen → … De eigenaar wees toen ook een
//    knop «Згорнути» af; deze test eiste daarom dat die knop en band-inklappen.ts weg waren.
//  • 03.11.2026 BESLISSING EIGENAAR: «Ця панель має працювати … за аналогією з меню сайту: згортатися в тонку смужку … і розгортатися,
//    коли наводжу на верхню область вікна. Режими: розгорнуто / згорнуто / автоматично». Het inklappen tot een dunne strook is dus
//    WEL gewenst. De controle «knop Згорнути weg» (sectie 3) is vervangen door controles van het nieuwe gedrag; ALLE controles van de
//    lusbescherming blijven: de nagebootste lus van 305 wissels, drempel, tussentijden, rubberband, containerfilter en «geen geometrie».
// Secties:
//  1. de oude lus nagebootst (oude beslisregel + geometrie die bij elke wissel scrollTop klemt) → wisselt aan één stuk door;
//  2. de beslisregel bij scrollen: drempel 24 px, ≥ 300 ms tussen wissels, niets binnen 220 ms na een wissel, bovenaan altijd zichtbaar,
//     rubberband begrensd, alleen grote containers; zelfs mét klemmende geometrie geen lus; 15 s intensief scrollen → hooguit zoveel
//     wissels als echte richtingswissels, 0 bij kleine bewegingen;
//  2c. (nieuw) de muis zoals het menu: hysterese + vertraging; een trillende muis aan de rand gaf met een naïeve regel honderden
//     wissels, nu hooguit enkele;
//  3. CSS/TechLaag: drie modi voor iedereen, vaste modusknop, in-/uitschuiven verandert NOOIT de geometrie van de pagina;
//  4. (nieuw) de koppeling zelf met een nagebootste pagina: muis, Esc, klik ernaast, scrollen, modi — en niets op <html>.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { DICHT_NA_MS, DREMPEL_PX, MARGE_PX, MIN_TUSSEN_MS, OPEN_NA_MS, OVERGANG_MS, RAND_PX, beginPiek, beginStaat, inZone, koppelInschuiven, teltMee, toonNu, verwerkScroll, verwerkWijzer, zetPiek, type Modus, type PiekStaat, type Staat } from '../../src/tech/band-inschuiven';

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

  // ---------------------------------------------------------------- 2c. muis: hysterese en vertraging (zoals het menu van de site)
  {
    const STROOK = 24, VOL = 40;
    const rect = (open: boolean) => ({ left: 0, right: 1280, bottom: open ? VOL : STROOK });
    check(`zone dicht = alleen de bovenrand (≤ strookhoogte ${STROOK} px, minstens ${RAND_PX} px)`, inZone(false, 600, STROOK, rect(false), STROOK) && !inZone(false, 600, STROOK + 1, rect(false), STROOK) && inZone(false, 5, RAND_PX, null, 0));
    check(`zone open = band + ${MARGE_PX} px marge (de uitgeschoven band zet de muis nooit «buiten»)`, inZone(true, 600, VOL + MARGE_PX, rect(true), STROOK) && !inZone(true, 600, VOL + MARGE_PX + 1, rect(true), STROOK));
    const p0 = beginPiek();
    const a = verwerkWijzer(p0, { tijd: 1000, binnen: true });
    check(`uitschuiven niet meteen: eerst ${OPEN_NA_MS} ms in de bovenrand (opnieuwOm)`, !a.gewisseld && a.opnieuwOm === 1000 + OPEN_NA_MS);
    const b = verwerkWijzer(a.staat, { tijd: 1000 + OPEN_NA_MS, binnen: true });
    check('… daarna uit', b.gewisseld && b.staat.open);
    const kort = verwerkWijzer(verwerkWijzer(p0, { tijd: 1000, binnen: true }).staat, { tijd: 1000 + OPEN_NA_MS - 50, binnen: false });
    check('kort langs de rand strijken (naar de tabbladen van de browser) opent niets', !kort.gewisseld && !kort.staat.open && kort.staat.wens === null);
    const weg = verwerkWijzer(b.staat, { tijd: 1000 + OPEN_NA_MS + 10, binnen: false });
    check(`inschuiven pas na ${DICHT_NA_MS} ms buiten de band`, !weg.gewisseld && weg.opnieuwOm === 1000 + OPEN_NA_MS + 10 + DICHT_NA_MS);
    const vastOpen = verwerkWijzer(b.staat, { tijd: 9000, binnen: false, vast: true });
    check('menu/paneel open (vast) → blijft uit, ook met de muis ver weg', !vastOpen.gewisseld && vastOpen.staat.open);
    const snel = zetPiek(b.staat, false, 1000 + OPEN_NA_MS + 20);
    const terug = verwerkWijzer(snel.staat, { tijd: 1000 + OPEN_NA_MS + 30, binnen: true, vast: true });
    check(`ook «vast» wacht op ${MIN_TUSSEN_MS} ms tussen twee wissels`, snel.gewisseld && !terug.gewisseld && terug.opnieuwOm === 1000 + OPEN_NA_MS + 20 + MIN_TUSSEN_MS);
    check('op verzoek (klik, Esc, klik ernaast): meteen', zetPiek(p0, true, 5).gewisseld && zetPiek(p0, true, 5).staat.open && !zetPiek(p0, false, 5).gewisseld);

    // Reproductie: naïeve regel (uit zodra y ≤ strook, in zodra y > strook, meteen) en een muis die 15 s rond de rand trilt (60 fps).
    const trilY = (i: number) => STROOK - 3 + (i % 7);           // 21 … 27 px: telkens over de rand heen
    let naief = false, naiefW = 0;
    for (let i = 0; i < 15_000 / 16; i++) { const v = trilY(i) <= STROOK; if (v !== naief) { naief = v; naiefW++; } }
    check(`reproductie: naïeve regel + trillende muis aan de rand wisselt aan één stuk door (${naiefW} wissels in 15 s)`, naiefW > 100);
    let s: PiekStaat = beginPiek(), w = 0, wacht: number | undefined;
    for (let i = 0, t = 0; i < 15_000 / 16; i++, t += 16) {
      if (wacht !== undefined && wacht <= t) { const u = verwerkWijzer(s, { tijd: wacht, binnen: inZone(s.open, 600, trilY(i), rect(s.open), STROOK) }); s = u.staat; wacht = u.opnieuwOm; if (u.gewisseld) w++; }
      const u = verwerkWijzer(s, { tijd: t, binnen: inZone(s.open, 600, trilY(i), rect(s.open), STROOK) });
      s = u.staat; wacht = u.opnieuwOm; if (u.gewisseld) w++;
    }
    check(`nieuwe regel met dezelfde muis: hooguit één wissel (${w}) — de uitgeschoven band houdt de muis binnen (hysterese)`, w <= 1);
    // Zelfs als de band de muis «buiten» zou zetten (zone zonder hysterese), dan nog hooguit één wissel per MIN_TUSSEN_MS + vertraging.
    let s2: PiekStaat = beginPiek(), w2 = 0, n2 = 0, naief2 = false;
    for (let t = 0; t < 15_000; t += 16) {
      const u = verwerkWijzer(s2, { tijd: t, binnen: !s2.open }); s2 = u.staat; if (u.gewisseld) w2++;
      if (!naief2 !== naief2) { naief2 = !naief2; n2++; } // naïef: elke gebeurtenis een wissel
    }
    check(`slechtste geval (de band zelf zet de muis buiten): ${w2} wissels in 15 s ≤ 15000 / ${MIN_TUSSEN_MS} en < 1/10 van naïef (${n2})`, w2 <= Math.floor(15_000 / MIN_TUSSEN_MS) && w2 * 10 < n2);
  }

  // ---------------------------------------------------------------- 3. CSS en TechLaag (nieuw gedrag, beslissing eigenaar 03.11.2026)
  {
    const css = lees('src/tech/tech.css'), strook = lees('src/tech/strook.css'), laag = lees('src/tech/TechLaag.tsx'), hr = lees('src/tech/band-inschuiven.ts');
    const zc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
    // Vervangt «knop Згорнути en band-inklappen.ts zijn weg» (18.10.2026): de eigenaar wil nu juist inklappen tot een dunne strook.
    check('oude losse oplossingen blijven weg (band-verbergen.ts, band-inklappen.ts); één mechanisme in band-inschuiven.ts', !existsSync(join(W, 'src/tech/band-verbergen.ts')) && !existsSync(join(W, 'src/tech/band-inklappen.ts')) && !/koppelHeadroom|band-verbergen|band-inklappen/.test(laag) && /from '\.\/band-inschuiven'/.test(laag));
    check('drie modi voor iedereen (niet meer alleen met de vlag tech-ruimtes-v2): ingeklapt = elke modus behalve «uitgeklapt»', /const bandIngeklapt = modus !== 'uitgeklapt';/.test(laag) && !/bandIngeklapt = v2/.test(laag));
    check('vaste modusknop «Розгорнути / Закріпити / Згорнути» (data-tech-knop=inklappen), ook in de dunne strook', /vasteKnop\('modus', <button[^>]*data-tech-knop='inklappen'/.test(laag) && /'Розгорнути смугу'/.test(laag) && /'Закріпити смугу'/.test(laag) && /'Згорнути смугу'/.test(laag) && /\.tech-band\.is-ingeklapt \.tech-band-knoppen>\.tech-strook-vast-modus\{display:inline-flex\}/.test(strook));
    check('TechLaag koppelt het mechanisme alleen als de band actief is', /koppelInschuiven\(\{ band: \(\) => bandRef\.current/.test(laag) && /\[bandAan\]\)/.test(laag));
    // Geometrie (lusbescherming): in- en uitschuiven raakt de pagina niet.
    check('#root: top = var(--tech-band-h), en geen enkele regel verschuift #root nog (geen data-tech-verborgen, geen translate van #root)', /html\[data-tech=aan\] #root\{position:fixed;top:var\(--tech-band-h\)/.test(css) && !/data-tech-verborgen/.test(zc(css) + zc(strook)) && !/#root\{[^}]*translate:/.test(zc(css)));
    const bandH = (zc(strook).match(/[^{}]*\{[^}]*--tech-band-h:[^}]*\}/g) || []).map((r) => r.trim());
    check(`--tech-band-h (gereserveerde ruimte) alleen per modus/grootte, nooit per uitschuiven (${bandH.length} regels)`, bandH.length >= 2 && bandH.every((r) => /data-tech-ingeklapt/.test(r) && !/is-piek|data-tech-open/.test(r)));
    const piek = zc(strook).match(/[^{}]*\.is-piek[^{]*\{[^}]*\}/g) || [];
    check('uitgeschoven (.is-piek): alleen de band zelf wordt hoger (height/box-shadow), niets in #root', piek.length >= 1 && piek.every((r) => !/#root/.test(r) && /\{(height|box-shadow)[^}]*\}$/.test(r.trim())));
    check('band-inschuiven.ts schrijft niets op <html> (geen kenmerk, stijl of klasse)', !/documentElement\.(setAttribute|removeAttribute|dataset|style|classList)/.test(hr) && !/html\.(setAttribute|removeAttribute)/.test(hr));
    check('werkruimte en zijbalk zijn niet meer verlengd onder #root (dat was alleen nodig voor verbergen bij scrollen)', !/bottom:calc\(-1 \* var\(--tech-band-h\)\)/.test(zc(css)) && !/calc\(100% \+ var\(--tech-band-h\)\)/.test(zc(css)));
    check('tussentijden van headroom blijven de basis (OVERGANG_MS 220, MIN_TUSSEN_MS 300, DREMPEL_PX 24)', hr.includes('OVERGANG_MS = 220') && hr.includes('MIN_TUSSEN_MS = 300') && hr.includes('DREMPEL_PX = 24'));
    check('prefers-reduced-motion: geen animatie van de knoppen', /prefers-reduced-motion:reduce\)\{\s*\.tech-band \.tech-band-knoppen>\.tech-strook-item\{transition:none\}/.test(strook));
    check('scroll-luisteraar met capture op het document (echte container via e.target), passief', /addEventListener\('scroll', opScroll, \{ capture: true, passive: true \}\)/.test(hr) && hr.includes('e.target'));
    check('scrollen schuift alleen IN (een uitgeschoven band), nooit uit', /if \(u\.gewisseld && scroll\.verborgen\) \{ vertrekNodig = true; pas\(zetPiek\(piek, false, nu\(\)\)\); \}/.test(hr) && !/scroll\.verborgen\)?\s*\?\s*.*zetPiek\(piek, true/.test(hr));
  }

  // ---------------------------------------------------------------- 4. de koppeling met een nagebootste pagina
  {
    const oud = { document: (globalThis as any).document, window: (globalThis as any).window, Element: (globalThis as any).Element, Node: (globalThis as any).Node };
    class NepNode { contains(x: unknown) { return x === this; } closest() { return null; } }
    class NepElement extends NepNode { scrollTop = 0; scrollHeight = 4000; clientHeight = 760; }
    const luister: Record<string, Array<(e: any) => void>> = {};
    const htmlSchrijf: string[] = [];
    const html = new Proxy({}, { get: (_d, k) => { if (k === 'setAttribute' || k === 'removeAttribute') return (...a: unknown[]) => htmlSchrijf.push(`${String(k)}(${a.join(',')})`); return undefined; }, set: (_d, k) => { htmlSchrijf.push(`set ${String(k)}`); return true; } });
    let klok = 0;
    const timers: Array<{ t: number; f: () => void; id: number }> = [];
    let volgende = 1;
    (globalThis as any).document = { documentElement: html, scrollingElement: null, addEventListener: (t: string, f: (e: any) => void) => { (luister[t] ||= []).push(f); }, removeEventListener: (t: string, f: (e: any) => void) => { luister[t] = (luister[t] || []).filter((x) => x !== f); } };
    (globalThis as any).window = { innerHeight: 800, setTimeout: (f: () => void, ms: number) => { const id = volgende++; timers.push({ t: klok + ms, f, id }); return id; }, clearTimeout: (id: number) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); } };
    (globalThis as any).Element = NepElement; (globalThis as any).Node = NepNode;
    try {
      const band = new NepElement();
      let open = false;
      const bandRect = () => ({ left: 0, right: 1280, top: 0, bottom: open ? 40 : 24 });
      (band as any).getBoundingClientRect = bandRect;
      let modus: Modus = 'auto', vast = false;
      const wissels: boolean[] = [];
      const k = koppelInschuiven({ band: () => band as unknown as Element, modus: () => modus, strookH: () => 24, vast: () => vast, zet: (v) => { open = v; wissels.push(v); }, nu: () => klok });
      const zend = (t: string, e: any) => (luister[t] || []).forEach((f) => f(e));
      const loop = (ms: number) => { const eind = klok + ms; for (;;) { timers.sort((x, y) => x.t - y.t); const v = timers[0]; if (!v || v.t > eind) break; timers.shift(); klok = v.t; v.f(); } klok = eind; };
      const muis = (y: number) => zend('pointermove', { pointerType: 'mouse', clientX: 600, clientY: y });
      muis(10); loop(OPEN_NA_MS + 20);
      check('auto: muis tegen de bovenrand → na de vertraging uitgeschoven', open && wissels.length === 1);
      muis(35); loop(DICHT_NA_MS + 50);
      check('auto: muis op de uitgeschoven band (35 px) → blijft uit', open);
      muis(300); loop(DICHT_NA_MS + 20);
      check('auto: muis weg → na de vertraging weer ingeschoven', !open && wissels.length === 2);
      muis(10); loop(OPEN_NA_MS + 20); vast = true; muis(500); loop(2000);
      check('auto: met een open menu/paneel (vast) blijft de band uit, ook met de muis weg', open);
      vast = false; zend('keydown', { key: 'Escape' });
      check('Esc schuift meteen in', !open);
      muis(10); muis(12); loop(1000);
      check('na Esc met de muis nog aan de rand: blijft in (geen terugveren onder de muis)', !open);
      muis(300); muis(10); loop(MIN_TUSSEN_MS + OPEN_NA_MS + 20);
      check('… pas na wegbewegen en terugkomen weer uit', open);
      zend('pointerdown', { target: { closest: () => null } });
      check('klik ernaast (buiten band, paneel, menu, venster) → in', !open);
      k.open();
      const cont = new NepElement(); cont.scrollTop = 1000;
      const scrol = (top: number) => { cont.scrollTop = top; zend('scroll', { target: cont }); };
      klok += 400; muis(300); scrol(1000); klok += 50; scrol(1010); klok += 50; scrol(1040);
      check(`scrollen ≥ ${DREMPEL_PX} px naar beneden schuift een aangeklikte band weer in`, !open);
      const voor = wissels.length;
      for (let i = 0; i < 40; i++) { klok += 16; scrol(1040 - i * 20); }
      check('scrollen naar boven schuift nooit uit (geen nieuwe wissel)', wissels.length === voor && !open);
      modus = 'ingeklapt'; k.herstel();
      const na = wissels.length;
      muis(5); loop(1000);
      check('«Згорнуто»: de muis aan de rand schuift NIETS uit (zoals het menu «dicht»)', !open && wissels.length === na);
      k.open(); muis(200); loop(DICHT_NA_MS + 50);
      check('«Згорнуто»: op verzoek uit (knop ▾), en weer in als de muis weggaat', !open && wissels.slice(-2).join() === 'true,false');
      modus = 'uitgeklapt'; k.herstel(); muis(5); loop(1000); k.open();
      check('«Розгорнуто»: muis, klik en scrollen doen niets (de band is gewoon vol)', !open);
      check('de koppeling schreef niets op <html>', htmlSchrijf.length === 0, htmlSchrijf.join(' '));
      k.stop();
      check('stop: alle luisteraars weg', Object.values(luister).every((l) => l.length === 0));
    } finally {
      (globalThis as any).document = oud.document; (globalThis as any).window = oud.window; (globalThis as any).Element = oud.Element; (globalThis as any).Node = oud.Node;
    }
  }
  return einde();
}
