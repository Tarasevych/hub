// Eenheidstest 21.10.2026 — het VENSTERDOK ligt nooit meer over een venster.
//
// KLACHT EIGENAAR (telefoon 390 px, mcp.tarasevych.com, «Підключення Claude» = toestemming v2): het dok («Відкриті вікна: 2» met
// de lijst altijd uitgeklapt: «Підключення Claude», «Підключення: Gmail») lag BOVEN het toestemmingsvenster en dekte «Далі»,
// «Заборонити», «Пізніше» en rijen met rechten; verplaatsen kon niet; het open venster stond er ook nog eens in.
// OORZAAK: src/platform/vensters.tsx — <nav class=venster-dok> met z-index VENSTER_BASIS + n·10 + 5 (boven ELK venster) rechtsonder,
// `useState(true)` (lijst open), en niets dat vensters van die plek weghield; ui-golf-11.css tilde het nog 84 px op (!important).
// Stand ДО (tests/e2e/hulp/stand-dok.ts, 390×844): elementFromPoint in het midden van «Далі» = button.venster-dok-item, «Заборонити»
// = venster-dok-item, «Пізніше» = ul van het dok; op 360 ook; en de knoppen van latere stappen lagen buiten beeld.
// NU: dok aan een schermrand dat die strook vrijhoudt (venster-dok-logica.ts), menu alleen op een tik, slepen + knoppen «Перемістити»,
// plaats bewaard, het bovenste venster niet dubbel; KoppelWizard met een vaste (sticky) onderste knoppenrij.
// 25.10.2026: de hindernis is de ACTIESTAPEL («Написати», «Вгору», eventueel de bel — shared/plaatsing.ts), niet meer bel + fabPlaats.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  DOK_AFSTAND, DOK_H, DOK_RUIMTE, DOK_STANDAARD, dokHindernissen, dokMenuRichting, dokNaarRand, dokPlaats, dokRuimte, dokStandVanPunt,
  dokVorm, normaliseerDokStand, type DokRand, type DokRect,
} from '../../src/platform/venster-dok-logica';
import type { Randen } from '../../src/mail-opstel-plaats';
import { klasseVan, stapelRechthoek } from '../../shared/plaatsing';
import { binnenZone, RAND } from '../../src/platform/vensters-logica';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const GEEN: Randen = { boven: 0, onder: 0, links: 0, rechts: 0 };
const raakt = (a: DokRect, b: DokRect) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
const binnen = (a: DokRect, vw: number, vh: number) => a.left >= 0 && a.top >= 0 && a.left + a.width <= vw && a.top + a.height <= vh;
const MATEN = [[360, 740], [390, 844], [768, 1024], [1280, 800]] as const;
const RANDEN: DokRand[] = ['onder', 'boven', 'links', 'rechts'];
/** De actiestapel van de post (2 gniezda: «Написати» + «Вгору») op deze maat, zoals src/plaatsing/plaatsing.css hem tekent. */
const stapel = (vw: number, vh: number, r: Randen = GEEN, n = 2, onder = 0) => { const s = stapelRechthoek(klasseVan(vw), n, vw, vh, r, onder); return { left: s.left, top: s.top, width: s.width, height: s.height }; };

export async function main(): Promise<number> {
  const { check, einde } = checker('venster-dok-20261021');

  // ------------------------------------------------------------------ A. stand en vorm
  check('A standaard: onderaan (t = 1: op de computer naast de bel)', DOK_STANDAARD.rand === 'onder' && DOK_STANDAARD.t === 1);
  check('A opslag wordt genormaliseerd (rommel → standaard, t geklemd 0…1)', JSON.stringify(normaliseerDokStand('x')) === JSON.stringify(DOK_STANDAARD)
    && JSON.stringify(normaliseerDokStand({ rand: 'boven', t: 7 })) === '{"rand":"boven","t":1}' && normaliseerDokStand({ rand: 'midden', t: 0.3 }).rand === 'onder' && normaliseerDokStand({ rand: 'links', t: -2 }).t === 0);
  check('A vorm: telefoon onder/boven = strook, computer = pil, links/rechts = knop 44×44',
    dokVorm('onder', 390) === 'strook' && dokVorm('boven', 360) === 'strook' && dokVorm('onder', 1280) === 'pil' && dokVorm('onder', 768) === 'pil' && dokVorm('links', 390) === 'knop' && dokVorm('rechts', 1280) === 'knop');
  check('A dok is precies een tikhoogte (44 px) en houdt 4 + 44 = 48 px vrij', DOK_H === 44 && DOK_AFSTAND === 4 && DOK_RUIMTE === 48);
  check('A vrije strook alleen aan de kant van het dok (en niets zonder dok)', JSON.stringify(dokRuimte({ rand: 'onder', t: 0 })) === '{"onder":48,"boven":0,"links":0,"rechts":0}'
    && JSON.stringify(dokRuimte({ rand: 'links', t: 0 })) === '{"onder":0,"boven":0,"links":48,"rechts":0}' && JSON.stringify(dokRuimte(null)) === '{"onder":0,"boven":0,"links":0,"rechts":0}');

  // ------------------------------------------------------------------ B. plaats: standaard op 360/390/768/1280
  for (const [vw, vh] of MATEN) {
    const st = stapel(vw, vh), h = dokHindernissen(st);
    const p = dokPlaats(DOK_STANDAARD, vw, vh, GEEN, 210, h);
    check(`B ${vw}×${vh}: standaard onderaan (${p.vorm}), ${DOK_AFSTAND} px van de rand, 44 hoog, binnen beeld, raakt de actiestapel niet`,
      p.rand === 'onder' && p.top + p.height === vh - DOK_AFSTAND && p.height === 44 && binnen(p, vw, vh) && !raakt(p, st), JSON.stringify({ p, st }));
    if (vw < 560) check(`B ${vw}: strook van de linkermarge (8) tot 8 px links van de stapel`, p.vorm === 'strook' && p.left === 8 && p.left + p.width === st.left - 8, JSON.stringify(p));
    else check(`B ${vw}: pil rechts, 8 px links van de stapel (zoals vroeger rechtsonder, maar niet over «Написати»)`, p.vorm === 'pil' && p.left + p.width === st.left - 8 && p.width === 210, JSON.stringify(p));
    // vensters: de zone eindigt boven het dok
    const zone = { x: 0, y: 0, w: vw, h: vh - DOK_RUIMTE };
    const g = binnenZone({ x: 40, y: 5000, b: 520, h: 400, max: false }, zone);
    check(`B ${vw}: een venster dat naar onderen gesleept wordt, houdt zijn titelbalk boven de strook van het dok`, g.y + 48 + RAND <= vh - DOK_RUIMTE && g.y + 48 <= p.top, JSON.stringify(g));
  }
  const veilig: Randen = { boven: 47, onder: 34, links: 0, rechts: 0 };
  const pv = dokPlaats(DOK_STANDAARD, 390, 844, veilig, 0, dokHindernissen(stapel(390, 844, veilig)));
  check('B veilige zone (home-indicator 34 px): dok erboven', pv.top + pv.height === 844 - 34 - DOK_AFSTAND, JSON.stringify(pv));
  const pb = dokPlaats({ rand: 'boven', t: 0 }, 390, 844, veilig, 0, dokHindernissen(stapel(390, 844, veilig)));
  check('B bovenaan: onder de notch (47 px), over de hele breedte (de stapel staat onderaan)', pb.top === 47 + DOK_AFSTAND && pb.left === 8 && pb.width === 390 - 16, JSON.stringify(pb));
  const st390 = stapel(390, 844);
  const pr = dokPlaats({ rand: 'rechts', t: 1 }, 390, 844, GEEN, 0, dokHindernissen(st390));
  check('B rechterrand onderaan: knop 44×44 boven de actiestapel, 8 px ertussen', pr.vorm === 'knop' && pr.width === 44 && pr.height === 44 && pr.top + pr.height === st390.top - 8, JSON.stringify({ pr, st390 }));
  check('B lege of ontbrekende hindernissen tellen niet (geen stapel = hele strook)', dokHindernissen(null, undefined, { left: 0, top: 0, width: 0, height: 10 }).length === 0);

  // ------------------------------------------------------------------ C. raster: nooit over de stapel, altijd in beeld
  let fout = '', n = 0;
  for (const [vw, vh] of MATEN) for (const rand of RANDEN) for (const t of [0, 0.25, 0.5, 0.75, 1]) for (const aantal of [0, 1, 2, 3]) for (const onder of [0, 56, 120]) for (const r of [GEEN, veilig]) {
    const st = aantal ? stapel(vw, vh, r, aantal, onder) : null;
    const h = dokHindernissen(st);
    const p = dokPlaats({ rand, t }, vw, vh, r, 210, h);
    n++;
    if (!binnen(p, vw, vh) || h.some((x) => raakt(p, x)) || p.rand !== rand) { fout = `${vw}×${vh} ${rand} t=${t} stapel ${aantal}/${onder} → ${JSON.stringify(p)}`; break; }
  }
  check(`C ${n} combinaties (4 maten × 4 randen × 5 posities × 0–3 gniezda × onderbalk 0/56/120 × veilige rand): dok raakt de stapel nooit en blijft in beeld`, !fout, fout);
  // de stapel zelf hangt niet van het dok af (geen sprong als het dok verschijnt of verhuist)
  check('C de stapel hangt niet van het dok af: stapelRechthoek en de laag kennen geen dok', !/venster-dok|dokPlaats/.test((lees('src/plaatsing/Plek.tsx') + zc(lees('src/plaatsing/plaatsing.css')) + lees('shared/plaatsing.ts')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));

  // ------------------------------------------------------------------ D. slepen en de knoppen «Перемістити …»
  const s1 = dokStandVanPunt(195, 30, 390, 844), s2 = dokStandVanPunt(385, 420, 390, 844), s3 = dokStandVanPunt(4, 600, 390, 844), s4 = dokStandVanPunt(100, 840, 390, 844);
  check('D loslaten na slepen: dichtstbijzijnde rand (omhoog → boven, rechts → rechts, links → links, onder → onder)', s1.rand === 'boven' && s2.rand === 'rechts' && s3.rand === 'links' && s4.rand === 'onder', JSON.stringify([s1, s2, s3, s4]));
  check('D t = plaats langs die rand (midden van rechts ≈ 0,5; linksonder ≈ 0,7), altijd 0…1', Math.abs(s2.t - 0.5) < 0.02 && s3.t > 0.6 && s3.t < 0.8 && [s1, s2, s3, s4].every((s) => s.t >= 0 && s.t <= 1));
  check('D knop «Перемістити»: evenwijdige rand houdt t, haakse rand → einde (onder/rechts, naast bel/FAB), zelfde rand = niets',
    JSON.stringify(dokNaarRand({ rand: 'onder', t: 0.3 }, 'boven')) === '{"rand":"boven","t":0.3}' && JSON.stringify(dokNaarRand({ rand: 'onder', t: 0.3 }, 'links')) === '{"rand":"links","t":1}'
    && JSON.stringify(dokNaarRand({ rand: 'links', t: 0.4 }, 'links')) === '{"rand":"links","t":0.4}');
  const m1 = dokMenuRichting({ left: 8, top: 796, width: 316, height: 44, rand: 'onder' }, 390, 844), m2 = dokMenuRichting({ left: 1014, top: 752, width: 200, height: 44, rand: 'onder' }, 1280, 800);
  const m3 = dokMenuRichting({ left: 342, top: 678, width: 44, height: 44, rand: 'rechts' }, 390, 844), m4 = dokMenuRichting({ left: 8, top: 4, width: 374, height: 44, rand: 'boven' }, 390, 844);
  check('D menu gaat naar binnen open (onder → omhoog, boven → omlaag, rechts → naar links) en langs de as naar de ruime kant',
    m1.naar === 'boven' && m2.naar === 'boven' && m2.uitlijn === 'eind' && m3.naar === 'links' && m3.uitlijn === 'eind' && m4.naar === 'onder', JSON.stringify([m1, m2, m3, m4]));

  // ------------------------------------------------------------------ E. bron: vensters.tsx (dok + vensters)
  const v = lees('src/platform/vensters.tsx');
  const dok = v.slice(v.indexOf('function Dok()'), v.indexOf('let dokGemaakt'));
  check('E de lijst is standaard DICHT (menu alleen op een tik) — vroeger useState(true)', dok.includes('const [open, setOpen] = useState(false);') && !dok.includes('useState(true)'));
  check('E het bovenste open venster staat niet nog eens in het dok (alleen als kopje «Зараз відкрите»)', dok.includes('const anderen = [...s].reverse().filter((x) => x.id !== boven?.id);') && dok.includes('{anderen.map((x) => (') && dok.includes("<p className='venster-dok-nu'>{t('nu')}: <b>{boven.titel}</b></p>"));
  check('E menu-knop: aria-expanded + aria-controls; menu hidden als dicht', dok.includes("aria-expanded={open} aria-controls={menuId}") && dok.includes("hidden={!open}"));
  check('E menu sluit na een keuze, bij een tik erbuiten (pointerdown, capture) en bij Escape (focus terug op de knop, niet door naar een venster)',
    dok.includes('const kies = (id: string) => { setOpen(false); vensterBeheer.naarVoren(id); };') && dok.includes("document.addEventListener('pointerdown', buiten, true);")
    && dok.includes("if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); if (nav.current?.contains(document.activeElement)) kopRef.current?.focus(); }"));
  check('E slepen met pointer events: neerdrukken op het dok, bewegen/loslaten via window (de aanwijzer verlaat het dok meteen), drempel, tik blijft een tik; loslaten → dokStandVanPunt + bewaren',
    dok.includes('onPointerDown={neer}') && dok.includes("window.addEventListener('pointermove', beweeg, { passive: false }); window.addEventListener('pointerup', los); window.addEventListener('pointercancel', breek);")
    && dok.includes('DOK_SLEEPDREMPEL') && !dok.includes('setPointerCapture') && dok.includes('const n = dokStandVanPunt(ev.clientX, ev.clientY, window.innerWidth, window.innerHeight);')
    && dok.includes('negeerKlikTot.current = performance.now() + 400;') && dok.includes('if (performance.now() < negeerKlikTot.current) { e.preventDefault(); e.stopPropagation(); }'));
  const hooksVoorReturn = dok.slice(0, dok.indexOf('if (!zichtbaar) return null;'));
  check('E alle hooks van het dok staan vóór de vroege return (geen wisselend aantal hooks als het dok verschijnt/verdwijnt)', !/\buse(State|Effect|LayoutEffect|Ref|Memo|Id)\(/.test(dok.slice(dok.indexOf('if (!zichtbaar) return null;'))) && hooksVoorReturn.includes('const sleepStop = useRef'));
  check('E WCAG 2.5.7: vier knoppen «Перемістити панель …» (één aanwijzer of toetsenbord), aria-pressed = huidige rand',
    ['boven', 'onder', 'links', 'rechts'].every((r) => dok.includes(`['${r}', Arrow`)) && dok.includes("data-dok-naar={rand} aria-label={t(k)} title={t(k)} aria-pressed={stand.rand === rand}")
    && v.includes("naarBoven: ['Перемістити панель угору', 'Paneel naar boven']") && v.includes("naarLinks: ['Перемістити панель ліворуч', 'Paneel naar links']"));
  check('E plaats bewaard in localStorage (try/catch; zonder opslag werkt het dok gewoon)', v.includes("const DOK_SLEUTEL = 'mijn-ruimte-venster-dok-v1';")
    && /function leesDok\(\): DokStand \{\n  try \{[^\n]*\} catch \{ return DOK_STANDAARD; \}/.test(v) && /function bewaarDok\(s: DokStand\) \{\n  try \{ localStorage\.setItem\(DOK_SLEUTEL/.test(v));
  check('E vrije strook: CSS-variabelen --venster-dok-<rand> + data-venster-dok op <html>, zone voor de JS-geometrie, seintje aan de vensters',
    v.includes("html.style.setProperty(`--venster-dok-${k}`, `${nieuw[k]}px`)") && v.includes("html.dataset.vensterDok = rand") && v.includes("window.dispatchEvent(new Event('venster-dok-ruimte'))")
    && v.includes('const binnenScherm = (g: Geometrie) => binnenZone(g, vensterZone());') && v.includes("window.addEventListener('venster-dok-ruimte', opnieuw);"));
  check('E bovenaan komt het dok ONDER de kopbalk (menuknop, zoeken, account), en vensters laten precies dat stuk vrij',
    dok.includes("const rDok = stand.rand === 'boven' ? { ...r, boven: Math.max(r.boven, kopOnder(r.boven)) } : r;") && v.includes("'.canonical-topbar, .canonical-menu-toggle, .canonical-avatar-trigger, .mail-top-search-shell, header button, header input, header a[href]'")
    && dok.includes("plek.rand === 'boven' ? plek.top + plek.height - r.boven") && dok.includes('zetDokVrij(zichtbaar ? stand.rand : null, innameRef.current || undefined)'));
  check('E pil (computer): natuurlijke breedte gemeten zonder begrenzing, per opschrift opnieuw; alleen begrensd als hij echt niet past',
    dok.includes("const pilB = pilMaat.label === label ? pilMaat.b : 0;") && dok.includes("const pilBegrensd = plek.vorm === 'pil' && pilB > plek.width + 1;")
    && dok.includes("if (plek.vorm !== 'pil' || sleep || open || pilBegrensd || !nav.current) return;") && dok.includes("(pilBegrensd ? { maxWidth: plek.width } : {})"));
  check('E vensters (computer): max-hoogte tot boven de strook van het dok', v.includes('maxHeight: `calc(100dvh - ${Math.round(geo.y) + RAND}px - var(--venster-dok-onder, 0px))`'));
  check('E dok wijkt voor de actiestapel (het echte element met alle gereserveerde gniezda, anders uit de indeling) en hoort het als die verandert (tsv:plaatsing)', dok.includes('dokPlaats(stand, vw, vh, rDok, pilB, dokHindernissen(stapelRect(vw, vh, inzet)))') && v.includes("window.addEventListener('tsv:plaatsing', opnieuw);") && v.includes('const el = plaatsStaat().zones.actiestapel;'));
  check('E uk + nl voor alle nieuwe teksten', ["anderen: ['Інші вікна', 'Andere vensters']", "geminimaliseerd: ['Згорнуті вікна', 'Geminimaliseerd']", "nu: ['Зараз відкрите', 'Nu open']", "verplaats: ['Перемістити панель', 'Paneel verplaatsen']"].every((x) => v.includes(x)));

  // ------------------------------------------------------------------ F. CSS
  const css = zc(lees('src/platform/vensters.css'));
  const nieuw = css.slice(css.indexOf('html .venster.is-max{inset:calc(8px + var(--venster-dok-boven'));
  check('F de oude dokregels zijn weg (rechtsonder, right:76px, lijst als vaste kolom)', !css.includes('.venster-dok{position:fixed;right:12px;bottom:12px') && !css.includes('.venster-dok{right:76px}'));
  check('F bottom:84px!important van ui-golf-11.css geldt niet meer voor het dok (hogere specificiteit, right/bottom auto)', css.includes('nav.venster-dok.venster-dok{position:fixed;right:auto!important;bottom:auto!important;')
    && lees('src/ui-golf-11.css').includes('.venster-dok,.vensters-dok,[data-venster-dok]{bottom:calc(84px'));
  check('F telefoon: venster laat de strook vrij (left/right/bottom/max-height met --venster-dok-*); gemaximaliseerd ook',
    /@media \(max-width:559px\)\{\s*html \.venster\{left:calc\(8px \+ var\(--veilig-links\) \+ var\(--venster-dok-links,0px\)\)!important;right:calc\(8px \+ var\(--veilig-rechts\) \+ var\(--venster-dok-rechts,0px\)\);bottom:calc\(8px \+ var\(--veilig-onder\) \+ var\(--venster-dok-onder,0px\)\);max-height:calc\(100dvh - 16px - var\(--veilig-boven\) - var\(--veilig-onder\) - var\(--venster-dok-boven,0px\) - var\(--venster-dok-onder,0px\)\)\}/.test(nieuw)
    && /html \.venster\.is-max\{inset:calc\(8px \+ var\(--veilig-boven\) \+ var\(--venster-dok-boven,0px\)\)/.test(nieuw));
  check('F «Новий лист» (zelfde stapel) blijft ook buiten de strook', nieuw.includes('html[data-venster-dok] body .mail-new-message-backdrop{top:var(--venster-dok-boven,0px);right:var(--venster-dok-rechts,0px);bottom:var(--venster-dok-onder,0px);left:var(--venster-dok-links,0px)}'));
  check('F menu: verborgen = display:none, opent naar binnen (data-dok-menu-naar), strook-menu zo breed als de strook', nieuw.includes('.venster-dok-menu[hidden]{display:none}') && nieuw.includes('.venster-dok[data-dok-menu-naar=boven] .venster-dok-menu{bottom:calc(100% + 6px)}') && nieuw.includes('.venster-dok[data-dok-vorm=strook] .venster-dok-menu{left:0;right:0;width:auto}'));
  check('F tikvlakken: dok 44 hoog, menu-items en verplaatsknoppen = --tik-hoogte', nieuw.includes('height:44px') && nieuw.includes('.venster-dok-item{display:grid;gap:1px;width:100%;min-height:var(--tik-hoogte)') && nieuw.includes('.venster-dok-verplaats button{display:inline-grid;place-items:center;width:var(--tik-hoogte);height:var(--tik-hoogte)'));
  check('F nieuw blok: geen hex, geen prefers-color-scheme, geen breedte > 360 px, geen letter < 12 px, geen ellipsis (titels lopen om)',
    !HEX.test(nieuw) && !/prefers-color-scheme/.test(nieuw) && ![...nieuw.matchAll(/(?:^|[;{\s])(?:min-|max-)?width:\s*(\d{3,})px/g)].some((m) => Number(m[1]) > 360)
    && ![...nieuw.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) < 12) && !nieuw.includes('text-overflow:ellipsis'));

  // ------------------------------------------------------------------ G. KoppelWizard: vaste onderste knoppenrij
  const w = lees('src/connector-v2/KoppelWizard.tsx'), wc = zc(lees('src/connector-v2/koppel-wizard-plaats.css'));
  check('G knoppen gemarkeerd voor de indeling (weigeren/terug/verder/toestaan/later) en «met-terug» vanaf stap 2',
    ['weigeren', 'terug', 'verder', 'toestaan', 'later'].every((a) => w.includes(`data-v2-actie='${a}'`)) && w.includes("className={`mcp-consent-actions v2-wizard-acties${i > 0 ? ' met-terug' : ''}`}") && w.includes("import './koppel-wizard-plaats.css';"));
  check('G onderste rij sticky in de scroller van het venster (altijd zichtbaar), op tokens', wc.includes('.v2-wizard-venster .v2-wizard-acties{position:sticky;bottom:0;z-index:1;') && wc.includes('background:var(--panel);border-top:1px solid var(--line)'));
  check('G telefoon: geen tweede scroll in de stap; twee rijen [Назад][Далі|Дозволити] / [Заборонити][Пізніше]',
    wc.includes('.v2-wizard-venster .v2-wizard-deel{max-height:none;overflow:visible}') && wc.includes('grid-template-columns:repeat(2,minmax(0,1fr))')
    && wc.includes('>:is([data-v2-actie=verder],[data-v2-actie=toestaan]){grid-area:1/2}') && wc.includes('>[data-v2-actie=weigeren]{grid-area:2/1}') && wc.includes('>[data-v2-actie=later]{grid-area:2/2}')
    && wc.includes(':not(.met-terug)>:is([data-v2-actie=verder],[data-v2-actie=toestaan]){grid-column:1/-1}'));
  check('G koppel-wizard-plaats.css: geen hex, geen prefers-color-scheme', !HEX.test(wc) && !/prefers-color-scheme/.test(wc));

  // ------------------------------------------------------------------ H. vensterlade: minimaliseren op mcp.*/mail.* wordt bewaard; terughalen via het dok blijft
  const herstel = lees('src/platform/VensterHerstel.tsx');
  check('H VensterHerstel: één effect met `gezien` — terughalen via het dok wordt niet meteen weer geminimaliseerd (vroeger twee effecten met een race)',
    (herstel.match(/useEffect\(\(\) => \{\n    for \(const venster of stand\.vensters\)/g) || []).length === 1 && herstel.includes('const gezien = useRef(new Map<string, boolean>());')
    && herstel.includes('if (vorig !== venster.klein && venster.klein && !levend.klein) { vensterBeheer.minimaliseer(venster.id); continue; }')
    && herstel.includes('if (levend.klein !== venster.klein) { gezien.current.set(venster.id, levend.klein); vensterKleinOnthouden(venster.id, levend.klein); }'));
  const o = lees('src/platform/vensters-onthouden.ts');
  check('H vensterStandOphalen(dienst) onthoudt de dienst van de pagina (opslaan stuurde «hub» vanaf mcp.* → 403, stand ДО)',
    /export async function vensterStandOphalen\(dienst: string\): Promise<void> \{\n  zorgScope\(\);\n[^]*?if \(dienst\) laatsteDienst = dienst;/.test(o));

  return einde();
}
