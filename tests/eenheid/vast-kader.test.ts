// Meldingenbel viel onder het scherm zolang de technische band zichtbaar was (melding van de eigenaar, 18.10.2026, schermafbeelding:
// bel half onder de onderrand, kwam pas terug als de band verdween). Oorzaak: met actief technisch profiel is #root (transform,
// top = bandhoogte) het containing block van de vaste bel; de bel rekende in vensterpixels. Elke check bootst eerst het oude
// gedrag na en bewijst dan dat het weg is.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { bevattendBlok, verschuiving, zichtbaarIn } from '../../src/platform/vast-kader';

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');
const BEL = 48, PAD = 10;
const belTop = (v: { top: number; height: number }, y: number) => v.top + PAD + y * Math.max(0, v.height - BEL - PAD * 2);

export async function main(): Promise<number> {
  const { check, einde } = checker('vast-kader');
  const venster = { left: 0, top: 0, width: 1280, height: 900 };

  for (const band of [40, 44]) {
    // #root: position fixed, top = bandhoogte, bottom 0, transform → kader = 0..height-band in het venster.
    const root = { left: 0, top: band, width: 1280, height: 900 - band };
    // Oud: bel in de hoek (y = 1) berekend met het venster, maar geplaatst in het kader van #root.
    const oudTop = belTop(venster, 1), oudOnderInVenster = root.top + oudTop + BEL;
    check(`oud gedrag nagebootst (band ${band}px): bel steekt ${oudOnderInVenster - 900}px onder het scherm`, oudOnderInVenster > 900, String(oudOnderInVenster));
    const v = zichtbaarIn(venster, root);
    const nieuwTop = belTop(v, 1), nieuwOnder = root.top + nieuwTop + BEL;
    check(`nieuw (band ${band}px): bel in de hoek blijft binnen het scherm met ${PAD}px marge`, nieuwOnder === 900 - PAD, String(nieuwOnder));
    check(`nieuw (band ${band}px): kx/ky = verschuiving van het kader, zichtbare hoogte = venster − band`, v.kx === 0 && v.ky === band && v.height === 900 - band && v.top === 0, JSON.stringify(v));
    // Slepen: clientY in venster − ky = kadercoördinaat (bel volgt de vinger exact).
    const clientY = 500, dy = 20, kaderTop = clientY - dy - v.ky;
    check(`slepen (band ${band}px): bel onder de vinger (vensterpositie = clientY − dy)`, root.top + kaderTop === clientY - dy, String(kaderTop));
  }
  // Band verborgen of geen technisch profiel: geen kader → identiek aan vroeger (geen regressie).
  const zonder = zichtbaarIn(venster, null);
  check('zonder kader: gedrag ongewijzigd (venster, kx = ky = 0)', zonder.kx === 0 && zonder.ky === 0 && zonder.height === 900 && belTop(zonder, 1) + BEL === 900 - PAD, JSON.stringify(zonder));
  // Ingezoomd (visualViewport verschoven): doorsnede blijft in kadercoördinaten.
  const zoom = zichtbaarIn({ left: 100, top: 300, width: 640, height: 450 }, { left: 0, top: 40, width: 1280, height: 860 });
  check('ingezoomd: zichtbaar gebied omgerekend naar het kader', zoom.left === 100 && zoom.top === 260 && zoom.width === 640 && zoom.height === 450, JSON.stringify(zoom));

  // bevattendBlok: eerste voorouder met transform (zoals #root met band), anders null (venster).
  type N = { tagName: string; parentElement: N | null; s: Record<string, string> };
  const html: N = { tagName: 'HTML', parentElement: null, s: {} };
  const body: N = { tagName: 'BODY', parentElement: html, s: {} };
  const rootMet: N = { tagName: 'DIV', parentElement: body, s: { transform: 'matrix(1, 0, 0, 1, 0, 0)' } };
  const rootZonder: N = { tagName: 'DIV', parentElement: body, s: { transform: 'none' } };
  const knop = (ouder: N): N => ({ tagName: 'BUTTON', parentElement: { tagName: 'DIV', parentElement: ouder, s: {} }, s: {} });
  const stijl = (e: Element) => ((e as unknown as N).s as never);
  check('bevattendBlok: bel in #root met transform → #root', bevattendBlok(knop(rootMet) as never, false, stijl) === (rootMet as never));
  check('bevattendBlok: zonder transform → venster (null)', bevattendBlok(knop(rootZonder) as never, false, stijl) === null);
  check('bevattendBlok: #root zelf meetellen vóór de eerste render (bel bestaat nog niet)', bevattendBlok(rootMet as never, true, stijl) === (rootMet as never));

  // Aansluiting in de componenten.
  const bel = lees('src/CanoniekMeldingencentrum.tsx'), lijst = lees('src/MailOpstelZwevend.tsx');
  check('bel: viewport() rekent in het kader (zichtbaarKader), niet meer in vensterpixels', /const viewport = \(\) => zichtbaarKader\(/.test(bel) && !/const viewport=\(\)=>\{const vv=window\.visualViewport;return\{left:vv\?\.offsetLeft/.test(bel));
  // 25.10.2026: de bel staat in een zone van de PAGINA (shared/plaatsing.ts) en schuift met #root mee; geen eigen positie, geen eigen slepen.
  check('bel: geen eigen positie of slepen meer in vensterpixels (zone in de pagina; slepen: src/plaatsing/plaats-slepen.ts)', !/event\.clientX-drag\.dx|bellStyle|bellPos/.test(bel) && bel.includes("<Plek knop='bel'>"));
  // 25.10.2026: de melding kiest een vrije plek (src/plaatsing/melding-plek.ts): de plek bij de bel in kadercoördinaten (placeNear met − kx/ky),
  // het resultaat terug naar het kader van de melding zelf (gemeten verschuiving: getBoundingClientRect − berekende left/top, zonder de
  // lopende intro-animatie).
  const mpBron = lees('src/plaatsing/melding-plek.ts');
  // Pop-up én paneel staan naast de bel (placeNear); de pop-up valt nooit meer terug op het midden van het scherm (geen meldingPlaats).
  check('bel: paneel en melding naast de bel in kadercoördinaten', (bel.match(/left: rect\.left - v\.kx, top: rect\.top - v\.ky/g) || []).length === 2
    && bel.includes('placeNear({ left: rect.left - v.kx') && !bel.includes('meldingPlaats(') && mpBron.includes('left: o.bel.left - v.kx, top: o.bel.top - v.ky')
    && mpBron.includes('const { dx, dy } = verschuivingZonderAnimatie(el);') && mpBron.includes('return { dx: r0.left - (parseFloat(cs.left) || 0), dy: r0.top - (parseFloat(cs.top) || 0) };'));
  check('bel: herberekent bij band aan/uit/verbergen (volgKader)', bel.includes('volgKader(() => setViewportRev('));
  // 25.10.2026: «Написати» staat in de actiestapel (zone); bij een verborgen band blijft de stapel aan de onderrand (tech.css), zonder JS.
  // 03.11.2026 (beslissing eigenaar, src/tech/band-inschuiven.ts): de band verbergt niet meer door #root te verschuiven maar schuift
  // in tot een dunne strook en uit OVER de pagina. #root, de bel en de actiestapel bewegen dus helemaal niet meer: geen translate-
  // compensatie in CSS nodig (die regel is weg) en nog steeds geen herberekening in JS.
  check('«Написати лист» en de actiestapel: in-/uitschuiven van de band verschuift #root niet (geen compensatie nodig), geen herberekening in JS', !/data-tech-verborgen/.test(lees('src/tech/tech.css').replace(/\/\*[\s\S]*?\*\//g, '')) && !/\.is-piek[^{]*#root/.test(lees('src/tech/strook.css')) && !/volgKader|fabPlaats/.test(lijst.replace(/\/\/.*$/gm, '')));
  const vk = lees('src/platform/vast-kader.ts');
  check('volgKader luistert naar data-tech (band aan/uit); verbergen (alleen translate) verandert het kader niet', vk.includes("'data-tech'") && !vk.includes("'data-tech-verborgen'") && !vk.includes('ingeklapt'));
  check('translate: berekende waarde ontleden ("none", "0px -40px", 3D, procenten)', JSON.stringify([verschuiving('none'), verschuiving('0px -40px'), verschuiving('3px 4px 5px'), verschuiving('-50% 0px'), verschuiving('12px')]) === JSON.stringify([[0, 0], [0, -40], [3, 4], [0, 0], [12, 0]]));
  check('losse translate-eigenschap maakt ook een kader (CSS Transforms 2)', bevattendBlok({ tagName: 'DIV', parentElement: null } as never, true, () => ({ transform: 'none', perspective: 'none', filter: 'none', contain: 'none', willChange: 'auto', backdropFilter: 'none', translate: '0px -40px' }) as never) !== null);
  const css = lees('src/tech/tech.css');
  check('oorzaak nog aanwezig en gedocumenteerd: #root krijgt transform + top = bandhoogte', /html\[data-tech=aan\] #root\{position:fixed;top:var\(--tech-band-h\)[^}]*transform:translateZ\(0\)/.test(css));
  return einde();
}
