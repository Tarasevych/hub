// Plaatsing van de zwevende knoppen (25.10.2026): ZONES en GNIEZDA — het zuivere model (shared/plaatsing.ts).
// Draaien: node scripts/eenheidstests.mjs plaatsing-20261025
// Eigenaar: «кнопки … мають по замовчуванням прив'язуватися до зони сайту в якій її користувач розмістив», «не буде перекривати»,
// «не бувши залежними одна від одної», «якщо простір переповнений то має спочатку звідти прибиратися», «кожен простір не буде
// розтягуватися безмірно», «телефон: фото зліва і одразу з права від фото наша кнопка дзвоника», «у повній версії — з права від фото».
//  A. klassen: grenzen 700 / 1099 (zelfde grens als de lade van het menu).
//  B. standaardindeling per klasse en pagina (post / andere dienst): bel rechts van de foto (telefoon: kop van het menu; tablet en
//     computer: bovenbalk), «Написати» onderaan in de stapel, het gniezdo van «Вгору» erboven, zoeken vooraan in de bovenbalk.
//  C. ruimte: voor ELKE combinatie van wensen (alle zones, ook verboden, index 0..3 en 20) en elke klasse en pagina: elke aanwezige
//     knop staat precies één keer, alleen in een toegestane zone, en geen zone heeft meer bezet dan haar gniezda.
//  D. deterministisch: dezelfde invoer → dezelfde indeling; een andere klasse verandert niet mee.
//  E. verplaatsen: weigeringen (niet-toegestaan, geen-zone, vol), index-betekenis (vóór/na de foto), volgorde in één zone, bron- en
//     doelzone krijgen hun echte posities, andere klassen blijven.
//  F. normalisatie (ook op de server): onbekend weg, verboden zones weg, zones die in die klasse niet bestaan weg, index begrensd.
//  G. terugzetten (één knop / alles), isVerplaatst, heeftEigen.
//  H. maten van de stapel (stapelRechthoek): telefoon 52 px, computer 48 px, gat 12, rand 12/16/20, iframe-inzet, onderbalk, menu rechts.
//  I. teksten uk/nl (zones, knoppen, «усі гнізда зайняті — спершу приберіть звідси кнопку», teller «4 з 5»).
//  J. zijbalkvoorkeuren: veld `plaatsing` in de standaard, normalisatie, «Скинути меню» laat de plaatsing staan.
//  K. bouwcontrole (scripts/plaatsing-controle.mjs), ook regel 5: geen vaste reserve voor de bovenbalk in de kop van een venster.
//  O. ruimte van de bovenbalk (2.5, 25.10.2026): de laag meet de zone en zet --plaats-boven-reserve/-onder/-paneel; koppen en vensters
//     onder de balk gebruiken die maten (google-mail-werkruimte.css, opdrachtbalk in plaatsing.css), geen 4.75rem/27.5rem/4rem meer.
import { checker } from './hulp/nep-google';
import {
  KLASSEN, KNOPPEN, KNOP_ZONES, MAX_INDEX, PLAATSEN, STANDAARD, ZONES, ZONE_NAAM, KNOP_NAAM, bezet, heeftEigen, indeling, isVerplaatst,
  klasseVan, knopAanwezig, magNaar, normaliseerPlaatsing, stapelRechthoek, standaardPlaatsing, tellerTekst, terugzetten, verplaats,
  weigeringTekst, type Klasse, type KnopId, type PaginaContext, type PlaatsingVoorkeur, type ZoneId,
} from '../../shared/plaatsing';
import { allesTerugzetten, normaliseerZijbalk, standaardZijbalk } from '../../shared/menu-model';

const lijstIds = (ind: ReturnType<typeof indeling>, z: ZoneId) => ind.zones[z].lijst.map((x) => x.id).join(',');
const ctxs = (klasse: Klasse): PaginaContext[] => [{ klasse, dienst: 'mail', zoekInMenu: true }, { klasse, dienst: 'hub', zoekInMenu: false }, { klasse, dienst: 'cloud', zoekInMenu: false }];

export async function main(): Promise<number> {
  const { check, einde } = checker('plaatsing-20261025');

  // ------------------------------------------------------------------ A. klassen
  check('A klasse: 320/390/700 → telefoon, 701/768/1099 → tablet, 1100/1280/1920 → computer',
    [320, 390, 700].every((b) => klasseVan(b) === 'telefoon') && [701, 768, 1099].every((b) => klasseVan(b) === 'tablet') && [1100, 1280, 1920].every((b) => klasseVan(b) === 'computer'));

  // ------------------------------------------------------------------ B. standaard
  const std = standaardPlaatsing();
  const telMail = indeling(std, { klasse: 'telefoon', dienst: 'mail', zoekInMenu: true });
  check('B telefoon, post: kop van het menu = foto · дзвоник; stapel = «Написати» onder, «Вгору» erboven; bovenbalk zonder knoppen van ons',
    lijstIds(telMail, 'lade-kop') === 'account,bel' && lijstIds(telMail, 'actiestapel') === 'opstellen,naar-boven' && lijstIds(telMail, 'bovenbalk') === ''
      && telMail.zones.bovenbalk.voor.length === 0 && telMail.zones.bovenbalk.dienst === 3 && telMail.plek.bel === 'lade-kop', JSON.stringify(telMail.zones));
  const telHub = indeling(std, { klasse: 'telefoon', dienst: 'hub', zoekInMenu: false });
  check('B telefoon, andere dienst: geen «Написати»; zoeken vooraan in de bovenbalk; het gniezdo van «Вгору» onderaan in de stapel',
    lijstIds(telHub, 'actiestapel') === 'naar-boven' && telHub.zones.bovenbalk.voor.join() === 'zoeken' && lijstIds(telHub, 'lade-kop') === 'account,bel' && !('opstellen' in telHub.plek));
  for (const klasse of ['tablet', 'computer'] as const) {
    const m = indeling(std, { klasse, dienst: 'mail', zoekInMenu: true }), h = indeling(std, { klasse, dienst: 'hub', zoekInMenu: false });
    check(`B ${klasse}: bel in de bovenbalk RECHTS van de foto (post en elders), zoeken vooraan (niet op de post), geen kop van het menu`,
      lijstIds(m, 'bovenbalk') === 'account,bel' && lijstIds(h, 'bovenbalk') === 'account,bel' && h.zones.bovenbalk.voor.join() === 'zoeken' && m.zones.bovenbalk.voor.length === 0
        && lijstIds(m, 'lade-kop') === '' && lijstIds(m, 'actiestapel') === 'opstellen,naar-boven' && m.zones.bovenbalk.dienst === 2);
  }
  check('B standaard past overal (geen zone vol bij de standaard: bovenbalk 3/5 telefoon-post, 4/6 computer-post, 3/6 elders)',
    KLASSEN.every((k) => ctxs(k).every((c) => { const ind = indeling(std, c); return ZONES.every((z) => bezet(ind.zones[z]) <= PLAATSEN[z][k]) && KNOPPEN.filter((x) => knopAanwezig(x, c)).every((x) => ind.plek[x] === STANDAARD[k][x].zone); })));

  // ------------------------------------------------------------------ C. ruimte (uitputtend)
  const indices = [0, 1, 2, 3, MAX_INDEX];
  let combinaties = 0, fouten = 0, eersteFout = '';
  for (const klasse of KLASSEN) for (const ctx of ctxs(klasse)) {
    for (const zb of ZONES) for (const ib of indices) for (const zo of ZONES) for (const io of indices) for (const zn of ZONES) for (const inb of [0, 1, MAX_INDEX]) {
      const v = normaliseerPlaatsing({ versie: 1, klassen: { [klasse]: { bel: { zone: zb, index: ib }, opstellen: { zone: zo, index: io }, 'naar-boven': { zone: zn, index: inb } } } });
      const ind = indeling(v, ctx); combinaties++;
      const aanwezig = KNOPPEN.filter((k) => knopAanwezig(k, ctx));
      const tel = (k: KnopId) => ZONES.reduce((n, z) => n + ind.zones[z].lijst.filter((x) => x.id === k).length, 0);
      const goed = aanwezig.every((k) => tel(k) === 1 && ind.plek[k] && KNOP_ZONES[k].includes(ind.plek[k]!))
        && KNOPPEN.filter((k) => !knopAanwezig(k, ctx)).every((k) => tel(k) === 0)
        && ZONES.every((z) => bezet(ind.zones[z]) <= PLAATSEN[z][klasse] && (PLAATSEN[z][klasse] > 0 || ind.zones[z].lijst.length + ind.zones[z].voor.length === 0));
      if (!goed) { fouten++; if (!eersteFout) eersteFout = `${klasse}/${ctx.dienst} bel:${zb}${ib} opst:${zo}${io} nb:${zn}${inb} → ${JSON.stringify(ind.zones)}`; }
    }
  }
  check(`C ruimte: ${combinaties} combinaties — elke knop één keer, alleen in toegestane zones, geen zone boven haar gniezda`, fouten === 0, eersteFout);

  // ------------------------------------------------------------------ D. deterministisch
  const c1 = { klasse: 'telefoon', dienst: 'mail', zoekInMenu: true } as PaginaContext;
  // zoals in het echt: via verplaats (dat legt de echte posities van alle knoppen in de zone vast)
  const stap1 = verplaats(std, c1, 'bel', 'bovenbalk', 0);
  const stap2 = stap1.ok ? verplaats(stap1.v, { klasse: 'computer', dienst: 'mail', zoekInMenu: true }, 'opstellen', 'bovenbalk', 0) : stap1;
  const eigen: PlaatsingVoorkeur = stap2.ok ? stap2.v : std;
  check('D dezelfde invoer → dezelfde indeling (tien keer)', new Set(Array.from({ length: 10 }, () => JSON.stringify(indeling(eigen, c1)))).size === 1);
  const pc = indeling(eigen, { klasse: 'computer', dienst: 'mail', zoekInMenu: true }), tab = indeling(eigen, { klasse: 'tablet', dienst: 'mail', zoekInMenu: true });
  check('D per klasse: telefoon-keuze (bel in de bovenbalk) verandert niets op de tablet; computer-keuze («Написати» vóór de foto) niets op de telefoon',
    lijstIds(indeling(eigen, c1), 'bovenbalk') === 'bel' && lijstIds(indeling(eigen, c1), 'actiestapel') === 'opstellen,naar-boven' && lijstIds(tab, 'bovenbalk') === 'account,bel'
      && lijstIds(pc, 'bovenbalk') === 'opstellen,account,bel' && lijstIds(pc, 'actiestapel') === 'naar-boven');

  // ------------------------------------------------------------------ E. verplaatsen
  check('E «Вгору» naar de bovenbalk → geweigerd: niet-toegestaan', (() => { const u = verplaats(std, c1, 'naar-boven', 'bovenbalk', 0); return !u.ok && u.reden === 'niet-toegestaan'; })());
  const cPc: PaginaContext = { klasse: 'computer', dienst: 'mail', zoekInMenu: true };
  check('E bel naar de kop van het menu op de computer → geweigerd: geen-zone (die zone bestaat alleen op de telefoon)', (() => { const u = verplaats(std, cPc, 'bel', 'lade-kop', 1); return !u.ok && u.reden === 'geen-zone'; })());
  const vol = verplaats(std, c1, 'opstellen', 'lade-kop', 2);
  check('E telefoon: «Написати» naar de kop van het menu (foto + дзвоник = 2 з 2) → geweigerd: vol, er wordt niets verdrongen', !vol.ok && vol.reden === 'vol' && magNaar(std, c1, 'opstellen', 'lade-kop').ok === false);
  const e1 = verplaats(std, c1, 'bel', 'bovenbalk', 0);
  const i1 = e1.ok ? indeling(e1.v, c1) : null;
  check('E telefoon: bel naar de bovenbalk → daar (4 з 5 met ⟳ ⚙ en de foto van de mailbox); de kop van het menu houdt alleen de foto',
    e1.ok && !!i1 && lijstIds(i1, 'bovenbalk') === 'bel' && lijstIds(i1, 'lade-kop') === 'account' && bezet(i1.zones.bovenbalk) === 4 && isVerplaatst(e1.v, 'telefoon', 'bel'));
  const e2 = e1.ok ? verplaats(e1.v, c1, 'opstellen', 'lade-kop', 0) : vol;
  const i2 = e2.ok ? indeling(e2.v, c1) : null;
  check('E daarna past «Написати» wél in de kop van het menu; index 0 = vóór de foto; de stapel houdt het gniezdo van «Вгору»',
    e2.ok && !!i2 && lijstIds(i2, 'lade-kop') === 'opstellen,account' && lijstIds(i2, 'actiestapel') === 'naar-boven');
  const e3 = verplaats(std, cPc, 'naar-boven', 'actiestapel', 0);
  check('E volgorde in één zone: «Вгору» onderaan → beide krijgen hun echte positie (naar-boven 0, opstellen 1)',
    e3.ok && lijstIds(indeling(e3.v, cPc), 'actiestapel') === 'naar-boven,opstellen' && e3.v.klassen.computer?.['naar-boven']?.index === 0 && e3.v.klassen.computer?.opstellen?.index === 1);
  const e4 = verplaats(std, cPc, 'bel', 'bovenbalk', 0);
  check('E computer: bel vóór de foto (index 0) — en op een andere dienst (met zoeken vooraan) staat hij ook vóór de foto',
    e4.ok && lijstIds(indeling(e4.v, cPc), 'bovenbalk') === 'bel,account' && lijstIds(indeling(e4.v, { klasse: 'computer', dienst: 'hub', zoekInMenu: false }), 'bovenbalk') === 'bel,account');
  check('E verplaatsen op de computer laat de telefoon en de tablet staan', e4.ok && !e4.v.klassen.telefoon && !e4.v.klassen.tablet);
  const e5 = verplaats(std, cPc, 'bel', 'actiestapel', 0);
  check('E computer: bel in de stapel (3 з 3: дзвоник, «Написати», «Вгору»), daarna weigert de stapel niets meer dat er al staat (in-zone verplaatsen mag)',
    e5.ok && lijstIds(indeling(e5.v, cPc), 'actiestapel') === 'bel,opstellen,naar-boven' && verplaats(e5.v, cPc, 'opstellen', 'actiestapel', 0).ok);
  check('E index buiten de lijst wordt begrensd (99 → achteraan, −5 → vooraan)', (() => { const a = verplaats(std, cPc, 'bel', 'bovenbalk', 99), b = verplaats(std, cPc, 'bel', 'bovenbalk', -5); return a.ok && b.ok && a.index === 1 && b.index === 0; })());

  // ------------------------------------------------------------------ F. normalisatie
  const n1 = normaliseerPlaatsing({ versie: 9, klassen: { telefoon: { bel: { zone: 'hoek', index: 1 }, 'naar-boven': { zone: 'bovenbalk', index: 0 }, opstellen: { zone: 'actiestapel', index: 400 }, vreemd: { zone: 'bovenbalk', index: 0 } }, horloge: { bel: { zone: 'bovenbalk', index: 0 } }, computer: { bel: { zone: 'lade-kop', index: 0 } } } });
  check('F normalisatie: onbekende zone/knop/klasse weg, «Вгору» niet in de bovenbalk, kop van het menu niet op de computer, index ≤ 20',
    JSON.stringify(n1) === JSON.stringify({ versie: 1, klassen: { telefoon: { opstellen: { zone: 'actiestapel', index: MAX_INDEX } } } }), JSON.stringify(n1));
  check('F rommel → standaard (null, tekst, lijst, NaN)', [null, 'x', [1, 2], { klassen: { telefoon: { bel: { zone: 'bovenbalk', index: 'NaN' } } } }].every((r) => JSON.stringify(normaliseerPlaatsing(r)) === JSON.stringify(standaardPlaatsing())));
  check('F normaliseren is idempotent', JSON.stringify(normaliseerPlaatsing(normaliseerPlaatsing(eigen))) === JSON.stringify(eigen));

  // ------------------------------------------------------------------ G. terugzetten
  const g1: PlaatsingVoorkeur = e2.ok ? e2.v : std;
  const g2 = terugzetten(g1, 'telefoon', 'bel');
  check('G één knop terug: bel weer in de kop van het menu (rechts van de foto), «Написати» blijft waar de gebruiker hem zette',
    !isVerplaatst(g2, 'telefoon', 'bel') && isVerplaatst(g2, 'telefoon', 'opstellen'));
  const g3 = terugzetten(g1, 'telefoon');
  check('G alles terug (telefoon): de klasse is leeg, de standaard geldt weer', !heeftEigen(g3, 'telefoon') && JSON.stringify(indeling(g3, c1)) === JSON.stringify(indeling(std, c1)));

  // ------------------------------------------------------------------ H. maten van de stapel
  const t = stapelRechthoek('telefoon', 3, 390, 844);
  check('H telefoon 390×844, 3 gniezda: 52 px breed, 3·52+2·12 = 180 hoog, 12 px van rechts en onder', t.width === 52 && t.height === 180 && t.right === 378 && t.bottom === 832 && t.left === 326 && t.top === 652, JSON.stringify(t));
  const p = stapelRechthoek('computer', 2, 1280, 800, { boven: 0, onder: 34, links: 0, rechts: 0 }, 56, 72, 60);
  check('H computer, 2 gniezda, veilige rand 34, onderbalk 56, iframe 72, menu rechts 60: 48×108, rechts 1280−20−72−60, onder 800−34−20−72−56',
    p.width === 48 && p.height === 108 && p.right === 1128 && p.bottom === 618, JSON.stringify(p));
  check('H lege stapel heeft hoogte 0', stapelRechthoek('tablet', 0, 768, 1024).height === 0);

  // ------------------------------------------------------------------ I. teksten
  check('I elke zone en knop heeft een naam in uk en nl', ZONES.every((z) => ZONE_NAAM[z].uk && ZONE_NAAM[z].nl) && KNOPPEN.every((k) => KNOP_NAAM[k].uk && KNOP_NAAM[k].nl));
  check('I volle zone: «усі гнізда зайняті. Спершу приберіть звідси кнопку» / «alle plekken bezet»',
    weigeringTekst('uk', 'vol', 'lade-kop', c1).includes('усі гнізда зайняті. Спершу приберіть звідси кнопку') && weigeringTekst('nl', 'vol', 'lade-kop', c1).includes('alle plekken bezet'));
  check('I teller: «Верхня панель · 4 з 5» na de bel in de bovenbalk van de telefoon (post)', !!i1 && tellerTekst('uk', 'bovenbalk', i1.zones.bovenbalk, c1) === 'Верхня панель · 4 з 5' && tellerTekst('nl', 'bovenbalk', i1.zones.bovenbalk, c1) === 'Bovenbalk · 4 van 5');

  // ------------------------------------------------------------------ J. zijbalkvoorkeuren
  const z0 = standaardZijbalk();
  check('J standaardZijbalk heeft `plaatsing` = standaard', JSON.stringify(z0.plaatsing) === JSON.stringify(standaardPlaatsing()));
  const z1 = normaliseerZijbalk({ ...z0, plaatsing: { versie: 1, klassen: { telefoon: { bel: { zone: 'bovenbalk', index: 0 }, 'naar-boven': { zone: 'zijbalk', index: 0 } } } } });
  check('J normaliseerZijbalk normaliseert de plaatsing mee (verboden zone weg, rest blijft)', JSON.stringify(z1.plaatsing) === JSON.stringify({ versie: 1, klassen: { telefoon: { bel: { zone: 'bovenbalk', index: 0 } } } }));
  check('J oude voorkeuren zonder `plaatsing` → standaard (geen migratie nodig)', (() => { const { plaatsing: _w, ...oud } = z0; return JSON.stringify(normaliseerZijbalk(oud).plaatsing) === JSON.stringify(standaardPlaatsing()); })());
  check('J «Скинути меню» (allesTerugzetten) laat de plaatsing van de knoppen staan', JSON.stringify(allesTerugzetten(z1).plaatsing) === JSON.stringify(z1.plaatsing));

  // ------------------------------------------------------------------ K. bouwcontrole (scripts/plaatsing-controle.mjs)
  // @ts-expect-error — .mjs zonder typen
  const { controleer, vasteRegels } = await import('../../scripts/plaatsing-controle.mjs');
  const schoon = await controleer(process.cwd());
  check('K bouwcontrole op de repo: geen fouten (catalogus, maten CSS = model, elke knop één <Plek>, geen nieuwe vaste elementen)', schoon.fouten.length === 0, schoon.fouten.slice(0, 3).join(' | '));
  const nieuwVast = await controleer(process.cwd(), { extra: { 'src/nep-nieuwe-knop.css': '.mijn-zwevende-knop{position:fixed;right:16px;bottom:16px}' } });
  check('K een nieuwe position:fixed-knop buiten de laag → fout met de hint «hoort in een zone»', nieuwVast.fouten.some((f: string) => f.includes('src/nep-nieuwe-knop.css :: .mijn-zwevende-knop') && f.includes('hoort in een zone')));
  const nieuwePlek = await controleer(process.cwd(), { extra: { 'src/NepKnop.tsx': "export const X = () => <Plek knop='chat'>{() => null}</Plek>;" } });
  check('K <Plek knop=…> met een knop buiten de catalogus → fout', nieuwePlek.fouten.some((f: string) => f.includes("<Plek knop='chat'>") && f.includes('niet in de catalogus')));
  const dubbel = await controleer(process.cwd(), { extra: { 'src/NepBel.tsx': "export const X = () => <Plek knop='bel'>{() => null}</Plek>;" } });
  check('K een knop die twee keer getekend wordt → fout («precies één keer»)', dubbel.fouten.some((f: string) => f.includes('knop «bel» wordt 2×')));
  const maat = await controleer(process.cwd(), { extra: { 'src/plaatsing/plaatsing.css': (await import('node:fs')).readFileSync('src/plaatsing/plaatsing.css', 'utf8').replace("[data-plaats-klasse='telefoon']{--plaats-gniezdo:52px", "[data-plaats-klasse='telefoon']{--plaats-gniezdo:56px") } });
  check('K maten in CSS ≠ model (gniezdo telefoon 56 ≠ 52) → fout', maat.fouten.some((f: string) => f.includes('gniezdo telefoon') && f.includes('56')));
  check('K vasteRegels ziet ook regels in @media en negeert commentaar', vasteRegels('/* .x{position:fixed} */@media (max-width:700px){.a{position: fixed;top:0}}.b{position:sticky}').map((r: { selector: string; context: string }) => `${r.context}|${r.selector}`).join() === '@media (max-width:700px)|.a');
  // regel 5 (2.5, 25.10.2026): geen vaste reserve voor de bovenbalk in de kop van een venster
  const oudeReserve = await controleer(process.cwd(), { extra: { 'src/nep-kop.css': '.google-mail-reader>header,.google-mail-attachment-preview>header{padding-right:4.75rem}' } });
  check('K een vaste reserve in de kop van het leesvenster (padding-right:4.75rem, zoals vóór 2.5) → fout met de hint «gemeten ruimte» / --plaats-boven-reserve',
    oudeReserve.fouten.some((f: string) => f.includes('src/nep-kop.css :: .google-mail-reader>header') && f.includes('padding-right') && f.includes('76 px') && f.includes('GEMETEN') && f.includes('var(--plaats-boven-reserve)')),
    oudeReserve.fouten.filter((f: string) => f.includes('nep-kop')).join(' | ').slice(0, 300));
  // @ts-expect-error — .mjs zonder typen
  const { kopReserves } = await import('../../scripts/plaatsing-controle.mjs');
  const kr = (css: string) => kopReserves('src/x.css', css).map((r: { eigenschap: string; px: number }) => `${r.eigenschap}:${r.px}`).join();
  check('K kopreserves: shorthand (rechterwaarde), -inline-end, right, ook in @media, via een var() met vaste terugval en als afstammeling (.google-mail-reader header); gemeten ruimte, gewone binnenruimte (≤ 24 px) en de kop van een brief in het gesprek zijn geen reserve',
    kr('.venster-kop{padding:4px 80px 4px 12px}') === 'padding:80' && kr('@media (max-width:720px){html body .mail-new-message > header{padding-inline-end:3rem}}') === 'padding-inline-end:48'
      && kr('.google-mail-attachment-preview[data-workbench-layout]>header .knop{right:var(--x,76px)}') === 'right:76'
      && kr('.google-mail-reader>header{padding-right:calc(var(--plaats-boven-reserve,3.875rem) + 14px)}') === '' && kr('.google-mail-reader>header{padding:10px 12px}') === ''
      && kr('.google-mail-reader-backdrop{padding-right:200px}.mail-reader-header{padding-right:90px}') === ''
      && kr('.google-mail-reader header{padding-right:5rem}') === 'padding-right:80' && kr('.google-mail-reader .mail-thread-message header{padding-right:5rem}') === '');
  const oudToegestaan = await controleer(process.cwd(), { extra: { 'src/mail-bijlage-werkbank.css': '@media(max-width:720px){.google-mail-attachment-preview[data-workbench-layout]>header{padding:6px 8px;padding-right:4rem;gap:5px 7px}}' } });
  check('K een oude reserve van een ander team in «kopReserves» (met reden) is geen fout; de lijst noemt de reden', !oudToegestaan.fouten.some((f: string) => f.includes('kopreserve'))
    && JSON.parse((await import('node:fs')).readFileSync('scripts/plaatsing-vaste-elementen.json', 'utf8')).kopReserves.every((t: { sleutel: string; reden: string }) => t.sleutel.includes(' :: ') && t.reden.length > 40));

  // ------------------------------------------------------------------ L. weergave van een zone (src/plaatsing/Plek.tsx) en de CSS-laag
  const { zoneWeergave } = await import('../../src/plaatsing/Plek');
  const pcInd = indeling(standaardPlaatsing(), cPc);
  const w0 = zoneWeergave(pcInd.zones.bovenbalk, 'bovenbalk', null);
  check('L bovenbalk computer: foto order 0, bel order 1, geen open plek', w0.orde.account === 0 && w0.orde.bel === 1 && !w0.voorbeeld && w0.knoppen.join() === 'bel');
  const hubInd = indeling(standaardPlaatsing(), { klasse: 'computer', dienst: 'hub', zoekInMenu: false });
  const wHub = zoneWeergave(hubInd.zones.bovenbalk, 'bovenbalk', null);
  check('L met zoeken vooraan: zoeken order 0, foto 1, bel 2', wHub.orde.zoeken === 0 && wHub.orde.account === 1 && wHub.orde.bel === 2);
  const wSleep = zoneWeergave(pcInd.zones.bovenbalk, 'bovenbalk', { knop: 'opstellen', doel: { zone: 'bovenbalk', index: 1 }, vol: null });
  check('L slepen van «Написати» naar index 1: open plek tussen foto en bel (foto 0, plek 1, bel 2)', wSleep.voorbeeld && wSleep.orde.account === 0 && wSleep.orde.voorbeeld === 1 && wSleep.orde.bel === 2 && wSleep.gesleept === null);
  const wBron = zoneWeergave(pcInd.zones.bovenbalk, 'bovenbalk', { knop: 'bel', doel: { zone: 'actiestapel', index: 0 }, vol: null });
  check('L de bel wordt weggesleept: zijn gniezdo blijft bestaan (gesleept = bel), geen open plek hier', wBron.gesleept === 'bel' && !wBron.voorbeeld && wBron.knoppen.includes('bel'));
  const laag = (await import('node:fs')).readFileSync('src/plaatsing/plaatsing.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const verbergRegels = [...laag.matchAll(/([^{}]+)\{[^}]*display:none[^}]*\}/g)].map((m) => m[1].trim());
  check('L CSS-laag: alleen tokens (geen hex-kleuren); knoppen en zones nooit display:none (verbergen = visibility, er schuift niets)',
    !/#[0-9a-f]{3,8}\b/i.test(laag) && verbergRegels.every((sel) => !/plaats-gniezdo|plaats-actiestapel|data-plaats-knop|notification-bell|mail-compose-float|canonical-scroll-top|data-plaats-zone/.test(sel)), verbergRegels.join(' | '));
  check('L aanraken: gniezda ≥ 44 px (kop van het menu 44, bovenbalk telefoon = tikhoogte 44, stapel telefoon 52)', laag.includes('.plaats-lade-kop>.plaats-gniezdo{width:44px;height:44px}') && laag.includes('--plaats-boven-gniezdo:var(--tik-hoogte-mobiel,44px)') && laag.includes("[data-plaats-klasse='telefoon']{--plaats-gniezdo:52px"));
  check('L geen overgang op left/top (de oude FAB gleed 0,25 s) — alleen kleur/schaduw/doorzichtigheid', !/transition:[^;}]*(left|top)/.test(laag));

  // ------------------------------------------------------------------ N. vrije plek van de melding (QA 12.10 №11 + voorstel 25.10)
  const mp = await import('../../src/plaatsing/melding-plek');
  const kader0 = { left: 0, top: 0, width: 1280, height: 800, kx: 0, ky: 0 };
  const pcK = mp.meldingKandidaten({ klasse: 'computer', breedte: 430, hoogte: 66, vw: 1280, vh: 800, bel: { left: 1218, top: 14, width: 46, height: 46 }, balkOnder: 60, werk: { left: 60, top: 0, width: 1220, height: 800 }, stapel: { left: 1212, top: 732, width: 48, height: 48 }, onder: 0, kader: kader0 });
  check('N computer: kandidaten in volgorde onder de bel → onderaan in het midden → bovenaan in het midden; onder de bel rechts uitgelijnd, onderaan 24 px van de rand',
    pcK.map((k) => k.plek).join() === 'bel,onder,boven' && pcK[0].doos.top >= 60 && Math.abs(pcK[0].doos.left + 430 - 1264) <= 12 && pcK[1].doos.top + 66 === 776 && pcK[1].doos.left === 455 && pcK[2].doos.top === 70, JSON.stringify(pcK));
  const telK = mp.meldingKandidaten({ klasse: 'telefoon', breedte: 374, hoogte: 52, vw: 390, vh: 844, bel: null, balkOnder: 58, werk: null, stapel: { left: 326, top: 780, width: 52, height: 52 }, onder: 0, kader: { ...kader0, width: 390, height: 844 } });
  check('N telefoon: schermbreed bovenaan onder de balk (balk + 6), anders boven de stapel (8 px lucht)', telK.map((k) => k.plek).join() === 'boven,onder' && telK[0].doos.top === 64 && telK[0].doos.width === 374 && telK[1].doos.top + 52 === 772, JSON.stringify(telK));
  const knopPaginering = { left: 1120, top: 116, width: 44, height: 40 };
  const k1 = mp.kiesMeldingPlek(pcK, [knopPaginering]);
  check('N een kleine knop onder de plek bij de bel (‹ 1–10 із 18 › op de post) → de volgende vrije kandidaat (onderaan in het midden)', k1?.plek === 'onder' && k1.vrij === true, JSON.stringify(k1));
  const k2 = mp.kiesMeldingPlek(pcK, [knopPaginering, { left: 500, top: 720, width: 120, height: 40 }]);
  check('N ook onderaan een knop → bovenaan in het midden', k2?.plek === 'boven' && k2.vrij === true, JSON.stringify(k2));
  const k3 = mp.kiesMeldingPlek(pcK, [knopPaginering, { left: 500, top: 720, width: 120, height: 40 }, { left: 600, top: 80, width: 40, height: 40 }]);
  check('N alles bezet → de eerste kandidaat (onder de bel), vrij = false (zichtbaar in data-melding-vrij)', k3?.plek === 'bel' && k3.vrij === false, JSON.stringify(k3));
  check('N vrije band: eerste y onder de balk zonder knop (4 px lucht), die vóór de stapel eindigt; geen ruimte → null',
    mp.vrijeBand(64, 780, 96, [{ top: 100, height: 40 }, { top: 150, height: 30 }, { top: 300, height: 40 }]) === 184 && mp.vrijeBand(64, 780, 96, []) === 64
    && mp.vrijeBand(64, 200, 96, [{ top: 100, height: 40 }]) === null && mp.vrijeBand(64, 780, 50, [{ top: 120, height: 10 }]) === 64);
  check('N grote klikvlakken (een hele rij) tellen niet als knop; rakende randen met 4 px lucht wel', mp.GROOT_KLIKVLAK.breedte === 400 && mp.GROOT_KLIKVLAK.hoogte === 120 && mp.overlapDoos({ left: 0, top: 0, width: 10, height: 10 }, { left: 13, top: 0, width: 5, height: 5 }, 4) && !mp.overlapDoos({ left: 0, top: 0, width: 10, height: 10 }, { left: 15, top: 0, width: 5, height: 5 }, 4));
  const mcBron = (await import('node:fs')).readFileSync('src/CanoniekMeldingencentrum.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const techBron = (await import('node:fs')).readFileSync('src/tech/tech.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // De pop-up staat altijd NAAST de bel (placeNear), nooit op een vrije plek in het midden; telefoon: --melding-top (CSS-regel hierboven).
  check('N de melding staat naast de bel (placeNear, nooit midden in het scherm); --melding-top voor de telefoon; geen translate −50% meer bij een verborgen technische band',
    mcBron.includes('placeNear({ left: rect.left - v.kx') && !mcBron.includes('meldingPlaats(') && mcBron.includes("['--melding-top' as string]") && !/notification-toast\{translate:-50%/.test(techBron) && laag.includes('top:var(--melding-top,calc(64px + var(--veilig-boven,0px)))!important'));

  // ------------------------------------------------------------------ M. één Esc = één laag (stand a11y-meldingen, 25.10.2026)
  const mc = (await import('node:fs')).readFileSync('src/CanoniekMeldingencentrum.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const lagen = /ANDERE_ESC_LAGEN = '([^']+)'/.exec(mc)?.[1] || '';
  // Vergelijking zonder witruimte (de Esc-afhandeling staat in leesbare code).
  const sq = (s: string) => s.replace(/\s+/g, '');
  const escBlok = /const onKey = \(event: KeyboardEvent\) => \{[\s\S]{0,1400}?event\.preventDefault\(\)/.exec(mc)?.[0] || '';
  check('M Esc van het meldingenpaneel (vangfase) laat een andere laag met eigen Esc voor: bel van een menu-item, «Перемістити до…», contextmenu, zoeken, of een menu-item met open «bel» — vóór preventDefault, en alleen als de focus níet in het paneel zelf staat',
    ['.menu-bellen', '.plaats-acties', '.menu-acties', '.zk-palet'].every((k) => lagen.includes(k)) && sq(escBlok).includes(sq("closest('.canonical-notification-panel')")) && sq(escBlok).includes(sq('closest(ANDERE_ESC_LAGEN) ||')) && sq(escBlok).includes(sq("closest('[data-heeft-bellen]') && document.querySelector('.menu-bellen')")) && sq(mc).includes(sq("window.addEventListener('keydown', onKey, true)")), escBlok.slice(0, 200));

  // ------------------------------------------------------------------ O. ruimte van de bovenbalk (2.5: de bel lag met «99+» op «Закрити» van een brief)
  const st = await import('../../src/plaatsing/plaatsing-staat');
  check('O ruimteRechts: van de linkerrand van de zone tot de rechterrand van het venster (naar boven afgerond); geen of een leeg vak → 0',
    st.ruimteRechts({ left: 1160, width: 104, height: 46 }, 1280) === 120 && st.ruimteRechts({ left: 1159.5, width: 104, height: 46 }, 1280) === 121
      && st.ruimteRechts(null, 1280) === 0 && st.ruimteRechts({ left: 1200, width: 0, height: 46 }, 1280) === 0 && st.ruimteRechts({ left: 1400, width: 46, height: 46 }, 1280) === 0);
  check('O zonder browser geen hindernissen en geen gemeten ruimte (de pure regels van het leesvenster blijven zuiver)', st.vensterHindernissen().length === 0 && JSON.stringify(st.bovenRuimte()) === JSON.stringify({ reserve: 0, onder: 0, paneel: 0 }));
  const staatBron = (await import('node:fs')).readFileSync('src/plaatsing/plaatsing-staat.ts', 'utf8');
  check('O de laag MEET de zone «bovenbalk» (ResizeObserver, inhoud en klassen van de omlijsting, resize, visualViewport, lettertypes) en zet drie maten op <html>; één volger tegelijk',
    staatBron.includes("const stop = zone === 'bovenbalk' ? volgBovenbalk(el) : undefined;") && staatBron.includes('new ResizeObserver(plan)') && staatBron.includes("attributeFilter: ['class', 'data-dock', 'data-plaats-iframe']")
      && staatBron.includes("window.addEventListener('resize', plan)") && staatBron.includes("window.visualViewport?.addEventListener('resize', plan)") && staatBron.includes('document.fonts?.ready?.then(plan)')
      && ['--plaats-boven-reserve', '--plaats-boven-onder', '--plaats-boven-paneel'].every((v) => staatBron.includes(`s.setProperty('${v}'`)) && staatBron.includes('if (bovenVolger === volger)'));
  const gmw = (await import('node:fs')).readFileSync('src/google-mail-werkruimte.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check('O koppen gebruiken de GEMETEN ruimte: leesvenster/bijlage (basis, accountpaneel), opdrachtbalk; geen 4.75rem / 27.5rem / 4rem meer',
    !/4\.75rem|27\.5rem|padding-right:4rem/.test(gmw) && gmw.includes('.google-mail-reader>header,.google-mail-attachment-preview>header{padding-right:calc(var(--plaats-boven-reserve,3.875rem) + 14px)}')
      && gmw.includes('{padding-right:calc(max(var(--plaats-boven-reserve,3.875rem),var(--plaats-boven-paneel,26.5rem)) + 14px)}')
      && laag.includes('.canonical-chrome .mail-top-command-bar{right:calc(var(--plaats-boven-reserve,') && !laag.includes('.canonical-chrome[data-plaats-boven-n] .mail-top-command-bar'));
  // «volledig» en telefoon: naast de zone als de kop daar past (≥ 600 / 290 px), anders ONDER de zone — de stap van de CSS nagerekend
  const kopVol = /html body \.google-mail-reader-backdrop\[data-lees-modus='volledig'\] \.google-mail-reader>header\{--plaats-kop-ruim:calc\(100% - var\(--plaats-boven-reserve,3\.875rem\) - (\d+)px\);padding-right:calc\(12px \+ clamp\(0px,var\(--plaats-kop-ruim\) \* 1000,var\(--plaats-boven-reserve,3\.875rem\) \+ 2px\)\)!important;margin-top:clamp\(0px,var\(--plaats-kop-ruim\) \* -1000,var\(--plaats-boven-onder,3\.75rem\)\)\}/.exec(gmw);
  const kopTel = /@media\(max-width:720px\)\{html body \.google-mail-reader-backdrop \.google-mail-reader>header\{--plaats-kop-ruim:calc\(100% - var\(--plaats-boven-reserve,0px\) - (\d+)px\);padding-right:calc\(8px \+ clamp\(0px,var\(--plaats-kop-ruim\) \* 1000,var\(--plaats-boven-reserve,0px\) - 2px\)\)!important;margin-top:clamp\(0px,var\(--plaats-kop-ruim\) \* -1000,var\(--plaats-boven-onder,0px\)\)\}\}/.exec(gmw);
  const klem = (a: number, x: number, b: number) => Math.max(a, Math.min(x, b));
  const kop = (breed: number, reserve: number, onder: number, vast: number, links: number, gat: number) => { const ruim = breed - reserve - vast; return { rechts: links + klem(0, ruim * 1000, reserve + gat - links), boven: klem(0, -ruim * 1000, onder) }; };
  const vastVol = kopVol ? Number(kopVol[1]) : NaN, vastTel = kopTel ? Number(kopTel[1]) : NaN;
  const r1280 = kop(1220, 120, 60, vastVol, 12, 14), r768 = kop(708, 120, 60, vastVol, 12, 14), r768s = kop(708, 62, 60, vastVol, 12, 14), t1 = kop(390, 52, 52, vastTel, 8, 6), t2 = kop(390, 104, 52, vastTel, 8, 6), t0 = kop(390, 0, 0, vastTel, 8, 6);
  check('O «volledig»: 1280 px → rechts de zone vrij (134 px), 768 px met foto+bel → de kop zakt onder de zone (60 px, rechts 12 px), 768 px met alleen de foto → ernaast (76 px); telefoon: bel boven → 58 px, bel + «Написати» → onder de zone, geen zone → 8 px',
    vastVol === 626 && vastTel === 304 && r1280.rechts === 134 && r1280.boven === 0 && r768.rechts === 12 && r768.boven === 60 && r768s.rechts === 76 && r768s.boven === 0
      && t1.rechts === 58 && t1.boven === 0 && t2.rechts === 8 && t2.boven === 52 && t0.rechts === 8 && t0.boven === 0, JSON.stringify({ vastVol, vastTel, r1280, r768, r768s, t1, t2, t0 }));
  check('O met het accountpaneel open: het paneel vrij als het ernaast past, anders de zone (nooit minder dan de zone)',
    gmw.includes("html body .canonical-chrome:has(.canonical-account-panel) .google-mail-reader-backdrop[data-lees-modus='volledig'] .google-mail-reader>header{--plaats-kop-paneel:calc(100% - max(var(--plaats-boven-reserve,3.875rem),var(--plaats-boven-paneel,26.5rem)) - 626px);padding-right:calc(12px + max(clamp(0px,var(--plaats-kop-ruim) * 1000,var(--plaats-boven-reserve,3.875rem) + 2px),clamp(0px,var(--plaats-kop-paneel) * 1000,max(var(--plaats-boven-reserve,3.875rem),var(--plaats-boven-paneel,26.5rem)) + 2px)))!important}"));
  check('O ⋮ van «volledig» hangt aan zijn knop (ankerpositie 14 px eronder = de oude 68 px naast de zone), ook als de kop onder de zone zakt',
    gmw.includes("@supports (anchor-name:--a){html body .google-mail-reader-backdrop[data-lees-modus='volledig'] .google-mail-reader>header details.google-mail-reader-more>summary{anchor-name:--plaats-meer}html body .google-mail-reader-backdrop[data-lees-modus='volledig'] .google-mail-reader-more[open]>.mail-reader-overflow-panel{position-anchor:--plaats-meer;top:calc(anchor(bottom) + 14px);max-height:calc(100dvh - 84px - var(--plaats-boven-onder,0px))}}"));
  check('O inhoud van de brief en de contextkolom houdt onderaan de hoogte van de actiestapel vrij (--plaats-stapel-ruimte): elke knop is boven de stapel te scrollen',
    gmw.includes("html body .google-mail-reader>section.mail-thread-content::after,html body .google-mail-reader .ctx-inhoud::after{content:'';display:block;flex:none;height:var(--plaats-stapel-ruimte,0px);pointer-events:none}"));
  check('O vensters ONDER de balk (leesvenster rechts, bijlage) beginnen nooit boven de onderrand van de zone (58 px, of lager bij grotere letters)',
    gmw.includes("html body .google-mail-workspace[data-reading-pane='right'][data-reader-open='true'] .google-mail-reader-backdrop,html body .google-mail-workspace .google-mail-attachment-backdrop{top:max(58px,calc(var(--plaats-boven-onder,0px) - 8px))}"));


  return einde();
}
