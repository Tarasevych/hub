// INTEG-001 (03.11.2026) — meldingen: vereisten van de eigenaar (één update). Elk deel toetst echt gedrag (pure functies, opslag
// tussen tabbladen nagebootst, render met react-dom/server) en waar nodig de bron.
//   A. dubbele meldingen: oorzaken en herstel (tabbladen, herhaling, twee bronnen, servermelding in twee lijsten)
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { AUTO_SECONDEN, BRON_DUBBEL_MS, GEZIEN_VENSTER_MS, SAMENVOEG_MS, isBronDuplicaat, popupLevensduurMs, samenvoegDoel, uniekOpId, voegHerhalingToe } from '../../src/canoniek-meldingen';
import { MIN_NA_PAUZE_MS, fractie, gepauzeerd, klaar, nieuweAftelling, pauze, tik, verleng } from '../../src/meldingen/aftelling';
import { MELDING_TYPES, MELDING_TYPE_IDS, MELDING_WEERGAVEN, isKritiekType, metWeergave, normaliseerTypeVoorkeuren, standaardTypeVoorkeur, voorkeurVoor, weergaveVan } from '../../shared/melding-typen';
import { historyKey, readRows, werkRijenBij, type BewaardeRij } from '../../src/meldingen/lokale-rijen';
import { groepeer, ontdubbelBronnen, tellers, zelfdeGebeurtenis, type V2Melding } from '../../shared/meldingen-v2/groepering';
import { ARCHIEF_NA_DAGEN, beginSectie, sectieLijst, sectieTellers, sectieVan } from '../../shared/meldingen-v2/secties';
import { legeRegels } from '../../shared/meldingen-v2/beleid';
import { pasStatusToe } from '../../shared/meldingen-v2/status';
import { pijlNaarBel, placeNear, zonderDok } from '../../src/melding-positie';
import { siteActieTekst } from '../../src/melding-stijl';
import type { ActivityEvent } from '../../src/connector-activiteit';

const lees = (p: string) => readFileSync(p, 'utf8');
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Minimale nagebootste browser (zoals meldingen-mobiel-20261021): genoeg om de panelen in node te renderen. */
function nepBrowser(host = 'https://hub.tarasevych.com/'): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'navigator'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(host);
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = {
    hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } },
  };
  Object.defineProperty(g, 'document', { value: doc, configurable: true, writable: true });
  Object.defineProperty(g, 'location', { value: { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined }, configurable: true, writable: true });
  Object.defineProperty(g, 'sessionStorage', { value: opslag(), configurable: true, writable: true });
  Object.defineProperty(g, 'localStorage', { value: opslag(), configurable: true, writable: true });
  Object.defineProperty(g, 'history', { value: { pushState: () => undefined, replaceState: () => undefined, state: null }, configurable: true, writable: true });
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0), matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

/** localStorage dat door «tabbladen» gedeeld wordt; sessionStorage per tabblad. */
function nepOpslag() {
  const g = globalThis as Record<string, unknown>;
  const voor = { localStorage: Object.getOwnPropertyDescriptor(g, 'localStorage'), sessionStorage: Object.getOwnPropertyDescriptor(g, 'sessionStorage') };
  const maak = () => { const m = new Map<string, string>(); return { m, api: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 } }; };
  const lokaal = maak(), sessie = maak();
  Object.defineProperty(g, 'localStorage', { value: lokaal.api, configurable: true, writable: true });
  Object.defineProperty(g, 'sessionStorage', { value: sessie.api, configurable: true, writable: true });
  return { lokaal: lokaal.m, herstel: () => { for (const [k, d] of Object.entries(voor)) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } } };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('meldingen-integ-20261103');
  const NU = 1_800_000_000_000;

  // ------------------------------------------------------------------ A. dubbele meldingen
  // A1. Twee tabbladen, één lijst: vroeger schreef elk tabblad zijn eigen geheugen weg (laatste wint).
  const opslag = nepOpslag();
  try {
    const scope = 'acc-1';
    const rij = (id: string, extra: Partial<BewaardeRij> = {}): BewaardeRij => ({ id, text: `Melding ${id}`, kind: 'error', createdAt: NU, source: 'mail', read: false, ...extra });
    // beide tabbladen openen met dezelfde lijst (X ongelezen)
    const begin = werkRijenBij(scope, [], () => [rij('X')]);
    let tabA = begin.rijen, tabB = readRows(scope);
    // A leest X
    tabA = werkRijenBij(scope, tabA, (r) => r.map((x) => (x.id === 'X' ? { ...x, read: true } : x))).rijen;
    // oud gedrag nagebootst: B schrijft zijn geheugen (X ongelezen) + een nieuwe regel Y weg
    const oudB = [{ ...rij('Y', { createdAt: NU + 1 }) }, ...tabB];
    check('A1 oud gedrag nagebootst: het geheugen van tabblad B zet de door A gelezen melding weer op «ongelezen»', oudB.find((x) => x.id === 'X')?.read === false);
    // nieuw: B werkt bij vanuit de opslag
    tabB = werkRijenBij(scope, tabB, (r) => [rij('Y', { createdAt: NU + 1 }), ...r]).rijen;
    const naB = readRows(scope);
    check('A1 nieuw: B voegt Y toe zonder A\'s «gelezen» te overschrijven (X blijft gelezen, Y nieuw)', naB.find((x) => x.id === 'X')?.read === true && naB.find((x) => x.id === 'Y')?.read === false && tabB.length === 2);
    // B verwijdert X; A (met X nog in zijn geheugen) markeert Y gelezen → X komt niet terug
    werkRijenBij(scope, tabB, (r) => r.filter((x) => x.id !== 'X'));
    tabA = werkRijenBij(scope, tabA, (r) => r.map((x) => (x.id === 'Y' ? { ...x, read: true } : x))).rijen;
    check('A1 een in een ander tabblad verwijderde regel komt niet terug', !readRows(scope).some((x) => x.id === 'X') && tabA.length === 1 && tabA[0].read === true);
    // knop uit een ander tabblad: hasAction blijft bewaard, ook al kent dit tabblad de functie niet
    werkRijenBij(scope, [], (r) => [rij('Z', { createdAt: NU + 2, heeftActie: true }), ...r]);
    werkRijenBij(scope, [], (r) => r.map((x) => (x.id === 'Y' ? { ...x, count: 2 } : x)));
    check('A1 de knop («Скасувати») van een melding uit een ander tabblad blijft bewaard als dit tabblad de lijst opslaat',
      JSON.parse(opslag.lokaal.get(historyKey(scope)) || '[]').find((x: { id: string }) => x.id === 'Z')?.hasAction === true);
    // zonder bruikbare opslag: verder op het geheugen
    const g = globalThis as Record<string, unknown>;
    const echt = g.localStorage;
    g.localStorage = { getItem: () => { throw new Error('geen opslag'); }, setItem: () => { throw new Error('geen opslag'); } };
    const zonder = werkRijenBij(scope, [rij('M')], (r) => [rij('N', { createdAt: NU + 3 }), ...r]);
    g.localStorage = echt;
    check('A1 zonder opslag: lijst uit het geheugen, opslagOk=false (geen fout)', zonder.rijen.map((x) => x.id).join() === 'N,M' && zonder.opslagOk === false);
  } finally {
    opslag.herstel();
  }

  // A2. Herhaling: één regel, en een al geziene melding wordt niet weer «нова».
  const rijen = [
    { id: 'o', groep: 'g', createdAt: NU - 60_000, read: false, count: 1 },
    { id: 'l', groep: 'h', createdAt: NU - 2 * 3600_000, read: true, count: 3 },
    { id: 'v', groep: 'k', createdAt: NU - GEZIEN_VENSTER_MS - 1, read: true },
    { id: 'p', groep: 'q', createdAt: NU - 1000, read: true, opgelost: true },
  ];
  check('A2 ongelezen herhaling binnen het venster → zelfde regel', samenvoegDoel(rijen, 'g', NU)?.id === 'o');
  check('A2 al gelezen melding die zich na 2 uur herhaalt → stil in dezelfde regel (vroeger: nieuwe regel + pop-up)', samenvoegDoel(rijen, 'h', NU)?.id === 'l' && 2 * 3600_000 > SAMENVOEG_MS);
  check('A2 na het gezien-venster (6 u) of na «opgelost» → nieuwe regel (echte nieuwe gebeurtenis)', samenvoegDoel(rijen, 'k', NU) === undefined && samenvoegDoel(rijen, 'q', NU) === undefined);
  const samen = voegHerhalingToe(rijen, 'l', NU);
  check('A2 samenvoegen: teller +1, nieuwste tijd, gelezen BLIJFT gelezen (vroeger read:false → weer in de bel)', samen.find((x) => x.id === 'l')?.count === 4 && samen.find((x) => x.id === 'l')?.createdAt === NU && samen.find((x) => x.id === 'l')?.read === true);
  const bel = code(lees('src/CanoniekMeldingencentrum.tsx'));
  check('A2 bron: het centrum gebruikt samenvoegDoel + voegHerhalingToe; nergens meer «read: false» bij samenvoegen', bel.includes('samenvoegDoel(') && bel.includes('voegHerhalingToe(rijen, bestaand.id, nu)') && !/count: \(r\.count \?\? 1\) \+ 1, createdAt: nu, read: false/.test(bel));
  check('A2 bron: andere tabbladen volgen via het storage-event; elke wijziging via werkRijenBij (opslag = bron van waarheid)', bel.includes("window.addEventListener('storage', opOpslag)") && bel.includes('werkRijenBij(p.scope, retainedRef.current, updater, opslagOk.current)'));

  // A3. Eén gebeurtenis uit twee bronnen.
  const recent = [{ sectie: 'mail', kind: 'error' as const, transient: false, t: NU - 20_000 }];
  check('A3 de dienst meldde «не вдалося» en 20 s later brengt de serveractiviteit dezelfde fout → geen tweede pop-up', isBronDuplicaat(recent, { sectie: 'mail', kind: 'error', transient: true }, NU));
  check('A3 andere sectie, andere soort, zelfde bron of buiten het venster → wél een pop-up',
    !isBronDuplicaat(recent, { sectie: 'cloud', kind: 'error', transient: true }, NU) && !isBronDuplicaat(recent, { sectie: 'mail', kind: 'warning', transient: true }, NU)
    && !isBronDuplicaat(recent, { sectie: 'mail', kind: 'error', transient: false }, NU) && !isBronDuplicaat(recent, { sectie: 'mail', kind: 'error', transient: true }, NU + BRON_DUBBEL_MS));
  check('A3 een geslaagde stap valt hier niet onder (geen onderdrukking van «готово»)', !isBronDuplicaat([{ ...recent[0], kind: 'success' }], { sectie: 'mail', kind: 'success', transient: true }, NU));
  const m = (id: string, herkomst: V2Melding['herkomst'], titel: string, tijd: number, gelezen = false): V2Melding => ({ id, dienst: 'post', ernst: 'succes', titel, tijd, gelezen, herkomst });
  const lijst = ontdubbelBronnen([m('l:1', 'lokaal', 'Лист надіслано', NU, true), m('a:1', 'activiteit', 'Лист надіслано', NU + 30_000), m('l:2', 'lokaal', 'Лист надіслано', NU - 10 * 60_000)]);
  check('A3 lijst: lokale kopie van dezelfde gebeurtenis valt weg; gelezen gaat over op de serverregel; een oudere (10 min) blijft',
    lijst.map((x) => x.id).sort().join() === 'a:1,l:2' && lijst.find((x) => x.id === 'a:1')?.gelezen === true);
  check('A3 zelfdeGebeurtenis: cijfers/leestekens tellen niet, andere dienst wel', zelfdeGebeurtenis({ dienst: 'post', titel: 'Лист «A» надіслано!', tijd: 0 }, { dienst: 'post', titel: 'лист a надіслано', tijd: 60_000 }) && !zelfdeGebeurtenis({ dienst: 'post', titel: 'X', tijd: 0 }, { dienst: 'cloud', titel: 'X', tijd: 0 }));
  check('A3 bron: het v2-model en het oude paneel ontdubbelen de bronnen', lees('src/meldingen/v2/model.ts').includes('ontdubbelBronnen([') && lees('src/MeldingenpaneelInhoud.tsx').includes('zelfdeGebeurtenis(a, sleutel(i))'));

  // A4. Servermelding in de gewone én de technische lijst.
  check('A4 uniekOpId: per id één keer (één pop-up, geen «+1» voor dezelfde melding)', uniekOpId([{ id: 'a' }, { id: 'b' }, { id: 'a' }]).map((x) => x.id).join() === 'a,b' && bel.includes('uniekOpId([...(p.serverItems || []), ...(p.techItems || [])])'));
  check('A4 «Не турбувати»: ook geen pop-up meer (beveiliging wel), niet alleen geen geluid', bel.includes('const dnd = meldingenV2Nu() && nietStorenActief() && !isKritiekType(type);') && bel.includes('opduiken: basis.opduiken && !dnd && !dubbel'));

  // ------------------------------------------------------------------ B. pop-up: tijd per soort en inhoud, pauze, balk, niet vast
  const ms = (kind: 'success' | 'info' | 'warning' | 'error', tekst = 'kort', uitleg?: string) => popupLevensduurMs({ vast: false, seconden: 0 }, tekst, uitleg, kind)!;
  check('B1 automatisch (standaard): «готово» kort, fout het langst', ms('success') === AUTO_SECONDEN.success * 1000 && ms('success') < ms('info') && ms('info') < ms('warning') && ms('warning') < ms('error'));
  check('B1 inhoud telt mee: lange tekst en uitleg geven meer tijd (begrensd)', ms('info', 'x'.repeat(130)) === ms('info') + 2000 && ms('info', 'kort', 'y'.repeat(300)) === ms('info') + 4000 && ms('info', 'x'.repeat(10_000), 'y'.repeat(10_000)) === ms('info') + 10_000);
  check('B1 een eigen keuze in seconden blijft gelden (3–60 s), «vast» = null', popupLevensduurMs({ vast: false, seconden: 20 }, 'kort', undefined, 'error') === 20_000 && popupLevensduurMs({ vast: true, seconden: 20 }, 'kort') === null);

  let a = nieuweAftelling(6000);
  a = tik(tik(a, 1000), 1000);
  check('B2 klok telt af; balk = resterend deel', a.over === 4000 && Math.abs(fractie(a) - 4000 / 6000) < 1e-9 && !klaar(a));
  a = pauze(a, 'muis', true);
  const tijdens = tik(tik(tik(a, 1000), 1000), 1000);
  check('B2 muis op de pop-up: de klok staat stil (lange tekst rustig lezen)', gepauzeerd(tijdens) && tijdens.over === 4000);
  const bijnaOp = pauze(tik(nieuweAftelling(3000), 2900), 'muis', true);
  const los = pauze(bijnaOp, 'muis', false);
  check('B2 muis weg: telt door, maar minstens nog MIN_NA_PAUZE_MS (verdwijnt niet meteen onder de cursor vandaan)', !gepauzeerd(los) && los.over === Math.min(3000, MIN_NA_PAUZE_MS));
  const twee = pauze(pauze(a, 'toets', true), 'muis', false);
  check('B2 meerdere pauzes: pas als alle weg zijn telt hij weer', gepauzeerd(twee) && twee.pauzes.join() === 'toets');
  const verborgen = pauze(pauze(nieuweAftelling(5000), 'verborgen', true), 'verborgen', false);
  check('B2 tabblad verborgen → pauze; terug zichtbaar → gewoon verder (geen extra tijd nodig)', verborgen.over === 5000 && !gepauzeerd(verborgen));
  let lang = tik(nieuweAftelling(8000), 7000);
  lang = verleng(lang, 8000);
  check('B2 uitklappen geeft de volle tijd terug (balk weer vol) maar is GEEN pauze zonder einde', lang.over === 8000 && fractie(lang) === 1 && !gepauzeerd(lang) && klaar(tik(lang, 8000)));
  check('B2 na de tijd: klaar → de pop-up sluit en staat daarna in het paneel', klaar(tik(nieuweAftelling(3000), 3000)));

  const std = normaliseerTypeVoorkeuren(null);
  check('B3 geen enkel type blijft standaard hangen tot u sluit — ook beveiliging niet (eigenaar: «не має висіти»)', MELDING_TYPE_IDS.every((t) => std[t].vast === false) && isKritiekType('beveiliging'));
  const oud = normaliseerTypeVoorkeuren({ beveiliging: { geluid: false, opduiken: true, tonen: true, vast: true, seconden: 10 }, post: { vast: true, vastGekozen: true, seconden: 2 }, agenda: { seconden: 0 } });
  check('B3 oude opslag: «vast» zonder eigen keuze (vroeger de standaard van kritiek) telt niet meer; met eigen keuze wel', oud.beveiliging.vast === false && oud.beveiliging.geluid === false && oud.post.vast === true && voorkeurVoor({ beveiliging: { geluid: true, opduiken: true, tonen: true, vast: true, seconden: 10 } }, 'beveiliging').vast === false);
  check('B3 seconden: 0 = automatisch; 1–2 → 3 (minimum); standaard automatisch', oud.agenda.seconden === 0 && oud.post.seconden === 3 && std.post.seconden === 0);

  check('B4 «hoe» per type: спливає+звук / лише спливає / лише звук / лише в панелі / не показувати',
    weergaveVan({ geluid: true, opduiken: true, tonen: true }) === 'beide' && weergaveVan({ geluid: false, opduiken: true, tonen: true }) === 'popup'
    && weergaveVan({ geluid: true, opduiken: false, tonen: true }) === 'geluid' && weergaveVan({ geluid: false, opduiken: false, tonen: true }) === 'paneel' && weergaveVan({ geluid: true, opduiken: true, tonen: false }) === 'uit');
  const basisV = standaardTypeVoorkeur('post');
  check('B4 metWeergave zet de drie velden; kritiek kan niet «uit» (wordt «лише в панелі»)',
    MELDING_WEERGAVEN.every((w) => weergaveVan(metWeergave(basisV, w, 'post')) === w) && weergaveVan(metWeergave(basisV, 'uit', 'beveiliging')) === 'paneel');

  const belB = code(lees('src/CanoniekMeldingencentrum.tsx'));
  check('B5 pop-up: muis = pauze; focus alleen via het toetsenbord (:focus-visible); geen pauze «uitgeklapt» meer',
    belB.includes("onPointerEnter={() => pauzeer('muis', true)}") && belB.includes("onPointerLeave={() => pauzeer('muis', false)}") && belB.includes("matches(':focus-visible')") && !belB.includes("pauzeer('uitgeklapt'"));
  check('B5 de klok gebruikt de aftelling (pauze/verlengen/verborgen) en sluit pas bij klaar', belB.includes('aftelRef.current = tikAftelling(a, nu - vorige);') && belB.includes('if (klaar(aftelRef.current)) { window.clearInterval(timer); dismissRef.current(); return; }') && belB.includes("pauzeer('verborgen', document.hidden);"));
  check('B5 gezien = gelezen, ook voor de regel in het paneel (activiteit a:, server s:) — niet als het tabblad verborgen is',
    belB.includes("if (next.meldingId?.startsWith('a:')) activityRef.current.markRead(next.meldingId.slice(2));") && belB.includes('if (typeof document !== \'undefined\' && document.hidden) { leesWachtend.current = next; return; }'));
  const act = lees('src/connector-activiteit.ts');
  check('B5 activiteit geeft de pop-up haar regel (meldingId a:<id>) en over wie/wat het gaat (context) mee', act.includes('const meldingId = `a:${e.id}`, context = activiteitContext(e, l);') && (act.match(/meldingId, context/g) || []).length >= 2);
  check('B5 pop-up: «Відкрити: …» (ook zonder link: het onderdeel) en «Очистити» → gelezen + Архів', belB.includes('sectieLink(toastStijl.section, p.lang)') && belB.includes("data-qa-id='melding-opruimen' onClick={ruimToastOp}") && belB.includes("status: 'archief'"));

  // ------------------------------------------------------------------ C. instellingen per type (render uk + nl)
  const herstelC = nepBrowser();
  try {
    const Paneel = (await import('../../src/meldingen/MeldingVoorkeurenPaneel')).default;
    const html = (lang: 'uk' | 'nl') => renderToStaticMarkup(createElement(Paneel, { lang, techTypen: false }));
    const uk = html('uk'), nl = html('nl');
    const rijen = (h: string) => (h.match(/class="mv-rij[^"]*" data-mv-type="/g) || []).length;
    const prive = MELDING_TYPE_IDS.filter((t) => MELDING_TYPES[t].ruimte === 'prive').length;
    check('C1 elke persoonlijke soort één rij met drie keuzes (як показувати, поведінка, тривалість) + «Приклад»',
      rijen(uk) === prive && (uk.match(/data-mv-veld="weergave"/g) || []).length === prive && (uk.match(/data-mv-veld="gedrag"/g) || []).length === prive && (uk.match(/data-mv-veld="seconden"/g) || []).length === prive && (uk.match(/data-mv-voorbeeld="/g) || []).length === prive, `${rijen(uk)}/${prive}`);
    check('C1 vier manieren + «не показувати» in gewone woorden (uk)', ['Спливає зі звуком', 'Лише спливає (без звуку)', 'Лише звук (без спливання)', 'Лише в панелі (тихо)', 'Не показувати'].every((s) => uk.includes(s)));
    check('C1 поведінка: «Зникає за таймером» / «Висить, доки не закрию»; тривалість «Авто» of seconden', uk.includes('Зникає за таймером') && uk.includes('Висить, доки не закрию') && uk.includes('Авто (за типом і текстом)') && uk.includes('>14 с<'));
    check('C1 nl: dezelfde keuzes in het Nederlands', ['Pop-up met geluid', 'Alleen pop-up (zonder geluid)', 'Alleen geluid (geen pop-up)', 'Alleen in het paneel (stil)', 'Niet tonen', 'Verdwijnt na de tijd', 'Blijft staan tot ik sluit', 'Auto (volgens soort en tekst)'].every((s) => nl.includes(s)));
    const bev = uk.slice(uk.indexOf('data-mv-type="beveiliging"'), uk.indexOf('data-mv-type="toegang"'));
    check('C1 beveiliging: «Не показувати» uitgeschakeld + uitleg; standaard «Зникає за таймером» (niet vast)', /<option value="uit" disabled="">Не показувати<\/option>/.test(bev) && bev.includes('приховати — ні') && /data-mv-veld="gedrag"[^>]*>[\s\S]*?<option value="timer" selected="">/.test(bev));
    const engels = /\b(Sound|Popup only|Show|Hide|Duration|Behaviour|Behavior|Example|Panel only)\b/;
    check('C1 geen Engelse tekst in uk of nl', !engels.test(uk.replace(/<[^>]+>/g, ' ')) && !engels.test(nl.replace(/<[^>]+>/g, ' ')));
  } finally {
    herstelC();
  }
  const v2bron = lees('src/meldingen/v2/MeldingenV2.tsx');
  check('C2 meldingen v2: dezelfde typekeuzes bovenaan «Правила сповіщень» (één systeem)', v2bron.includes("<MeldingVoorkeurenPaneel lang={lang} techTypen={!!p.techTypen} />") && v2bron.includes("data-mv2-typen='1'"));
  check('C2 een regel «Тихе/Вимкнене» per bron maakt de pop-up en het geluid stil (beveiliging niet)', belB.includes("const regelStil = !!regel && (regel.modus === 'stil' || regel.modus === 'uit') && !isKritiekType(type);") && belB.includes('!dnd && !dubbel && !regelStil'));

  // ------------------------------------------------------------------ D. paneel en pop-up aan de bel (niet midden op het scherm)
  const maten: Array<[number, number, string]> = [[1280, 800, 'computer'], [768, 1024, 'tablet'], [390, 844, 'telefoon'], [844, 390, 'liggend']];
  let foutD = '';
  for (const [vw, vh, naam] of maten) {
    const kader = { left: 0, top: 0, width: vw, height: vh };
    const bel = { left: vw - 60, top: 8, width: 44, height: 44 };
    const breedte = Math.min(vw <= 560 ? vw - 16 : 400, vw - 16);
    const p = placeNear(bel, { width: breedte, height: 600 }, kader);
    const venster = { left: p.left, top: p.top, width: breedte, height: Math.min(600, p.maxHeight) };
    const pijl = pijlNaarBel(venster, bel);
    const midden = Math.abs(venster.left + venster.width / 2 - vw / 2) < 2 && Math.abs(venster.top + venster.height / 2 - vh / 2) < 2 && vw > 560;
    if (p.side !== 'below' || p.top !== bel.top + bel.height + 8 || venster.top + venster.height > vh - 8 || !pijl || pijl.kant !== 'boven' || pijl.top !== venster.top - 7 || midden) { foutD = `${naam}: ${JSON.stringify({ p, pijl })}`; break; }
  }
  check('D1 op elke breedte (computer, tablet, telefoon, liggend): het venster begint vlak onder de bel, blijft binnen het scherm en heeft een pijltje naar de bel', !foutD, foutD);
  const belOnder = { left: 1200, top: 740, width: 44, height: 44 };
  const pOnder = placeNear(belOnder, { width: 400, height: 500 }, { left: 0, top: 0, width: 1280, height: 800 });
  const pijlOnder = pijlNaarBel({ left: pOnder.left, top: pOnder.top, width: 400, height: 500 }, belOnder);
  check('D1 bel onderaan (gesleept naar de actiestapel): venster erboven, pijltje op de onderrand', pOnder.side === 'above' && !!pijlOnder && pijlOnder.kant === 'onder' && pijlOnder.top === pOnder.top + 500 - 7);
  const pijlRand = pijlNaarBel({ left: 8, top: 60, width: 374, height: 700 }, { left: 340, top: 8, width: 44, height: 44 });
  check('D1 pijltje binnen de randen van het venster, boven het midden van de bel (telefoon: venster tussen de veilige randen)', !!pijlRand && pijlRand.left === Math.round(362 - 7) && pijlRand.left <= 8 + 374 - 12 - 14);
  check('D1 geen pijltje als het venster de bel overlapt (bel niet in beeld)', pijlNaarBel({ left: 0, top: 0, width: 400, height: 400 }, { left: 100, top: 100, width: 44, height: 44 }) === null);
  const dokKader = zonderDok({ left: 0, top: 0, width: 390, height: 844, kx: 0, ky: 0 }, { boven: 0, onder: 56, links: 0, rechts: 0 });
  check('D2 de strook van het vensterdok telt niet als ruimte (paneel eindigt erboven); kadervelden blijven', dokKader.height === 788 && dokKader.width === 390 && dokKader.kx === 0);
  const v2css = code(lees('src/meldingen/v2/meldingen-v2.css')), npcss = code(lees('src/meldingenpaneel.css')), vcss = code(lees('src/platform/vensters.css'));
  check('D3 CSS: geen uitschuifpaneel over de volle hoogte (tablet) en geen «Уся історія» over het hele scherm meer',
    !/\.canonical-notification-panel\.is-v2\{inset:0 0 0 auto!important/.test(v2css) && !/is-v2-volledig\{inset:0!important/.test(v2css) && /\.is-v2-volledig\{width:min\(760px,calc\(100vw - 16px\)\)/.test(v2css));
  check('D3 CSS telefoon/liggend/dok: geen vaste top/bottom van rand tot rand meer (het venster hangt aan de bel)',
    !/canonical-notification-panel\{[^}]*top:calc\(var\(--ruimte-2\) \+ var\(--veilig-boven\)\)!important/.test(npcss) && !/canonical-notification-panel\{[^}]*bottom:calc/.test(vcss) && !/canonical-notification-panel\{left:auto!important/.test(npcss));
  check('D4 bron: pijltje voor paneel én pop-up, gemeten na het plaatsen; de dokstrook gaat uit het kader',
    belB.includes("className='cnc-pijl' data-kant={paneelPijl.kant}") && belB.includes("className='cnc-pijl is-toast'") && belB.includes('const viewport = () => zonderDok(zichtbaarKader(') && lees('scripts/plaatsing-vaste-elementen.json').includes('canoniek-meldingencentrum.css :: .cnc-pijl'));

  // ------------------------------------------------------------------ E. «Нові» / «Прочитані» / «Архів»; gezien = gelezen
  const DAG = 86400_000;
  check('E1 sectieVan: ongezien → Нові; gezien → Прочитані; opgeruimd/opgelost/gezien > 7 dagen → Архів; stil ongezien → Прочитані',
    sectieVan({ gelezen: false, tijd: NU }, NU) === 'nieuw' && sectieVan({ gelezen: true, tijd: NU - DAG }, NU) === 'gelezen' && sectieVan({ gelezen: true, tijd: NU - ARCHIEF_NA_DAGEN * DAG }, NU) === 'archief'
    && sectieVan({ gelezen: false, toestand: 'archief', tijd: NU }, NU) === 'archief' && sectieVan({ gelezen: true, toestand: 'opgelost', tijd: NU }, NU) === 'archief' && sectieVan({ gelezen: false, tijd: NU, telt: false }, NU) === 'gelezen');
  const mv = (id: string, x: Partial<V2Melding> = {}): V2Melding => ({ id, dienst: 'post', ernst: 'info', titel: `Titel ${id}`, tijd: NU - 60_000, gelezen: false, herkomst: 'server', ...x });
  const gs = groepeer([
    mv('s:fout', { ernst: 'fout', titel: 'Синхронізація пошти не вдалася', tijd: NU - 120_000 }),
    mv('s:nieuw', { titel: 'Новий лист від банку' }),
    mv('s:gezien', { gelezen: true, titel: 'Спільний доступ до теки' }),
    mv('s:oud', { gelezen: true, titel: 'Старе сповіщення', tijd: NU - 8 * DAG }),
    mv('s:weg', { gelezen: true, toestand: 'archief', titel: 'Очищене' }),
    mv('a:klaar', { gelezen: true, ernst: 'succes', toestand: 'opgelost', afgerond: true, herkomst: 'activiteit', dienst: 'ai', procesId: 'p1', titel: 'Claude прочитав файл' }),
    mv('a:stil', { ernst: 'succes', herkomst: 'activiteit', dienst: 'ai', procesId: 'p2', titel: 'Перевірку адрес завершено' }),
  ], legeRegels(), NU);
  const titels = (s: 'nieuw' | 'gelezen' | 'archief', o = {}) => sectieLijst(gs, s, NU, o).map((g) => g.hoofd.titel);
  check('E2 Нові: ongezien, wat aandacht vraagt (fout) bovenaan', titels('nieuw').join('|') === 'Синхронізація пошти не вдалася|Новий лист від банку');
  check('E2 Прочитані: gezien, gewoon klaar proces (activiteit «виконано») en stil achtergrondwerk — niet leeg, niet in de bel', titels('gelezen').sort().join('|') === ['Claude прочитав файл', 'Перевірку адрес завершено', 'Спільний доступ до теки'].sort().join('|') && tellers(gs).bel === 2);
  check('E2 Архів: opgeruimd en gezien ouder dan een week (vroeger altijd leeg tenzij u zelf archiveerde)', titels('archief').sort().join('|') === ['Очищене', 'Старе сповіщення'].sort().join('|'));
  const vast = new Set([gs.find((g) => g.hoofd.titel === 'Спільний доступ до теки')!.sleutel]);
  check('E2 wat bij het openen nieuw was, blijft tot het sluiten in «Нові» (ook al is het intussen gelezen) en staat niet dubbel', titels('nieuw', { vastNieuw: vast }).includes('Спільний доступ до теки') && !titels('gelezen', { vastNieuw: vast }).includes('Спільний доступ до теки'));
  const tel = sectieTellers(gs, NU);
  check('E2 tellers = lijstlengtes; samen precies alle groepen (niets kwijt, niets dubbel)', tel.nieuw === 2 && tel.gelezen === 3 && tel.archief === 2 && tel.nieuw + tel.gelezen + tel.archief === gs.length);
  check('E2 beginnen in «Нові» als er iets nieuws is, anders in «Прочитані» (nooit een leeg «Важливі»)', beginSectie(gs, NU) === 'nieuw' && beginSectie(gs.filter((g) => g.ongelezen === 0), NU) === 'gelezen');
  const statusArchief = pasStatusToe([mv('a:klaar2', { afgerond: true, toestand: 'opgelost', herkomst: 'activiteit' })], { versie: 1, items: { 'a:klaar2': { s: 'opgelost', op: NU, door: 'eigenaar', hoe: 'kaart' } }, bewaarDagen: 30, bijgewerkt: NU }, NU)[0];
  check('E2 een uitdrukkelijk «вирішено» is geen «proces klaar» meer → Архів', statusArchief.afgerond === undefined && statusArchief.toestand === 'opgelost');

  const herstelE = nepBrowser();
  try {
    const V2 = (await import('../../src/meldingen/v2/MeldingenV2')).default;
    const local = [
      { id: 'n1', text: 'Не вдалося надіслати лист', kind: 'error' as const, createdAt: NU - 60_000, source: 'mail-send', read: false, link: { href: 'https://mail.tarasevych.com/postvak-in', label: 'Відкрити: Пошта' } },
      { id: 'n2', text: 'Чернетку збережено', kind: 'success' as const, createdAt: NU - 30 * 60_000, source: 'mail', read: true },
      { id: 'n3', text: 'Помилку синхронізації виправлено', kind: 'error' as const, createdAt: NU - 2 * 3600_000, source: 'cloud', read: true, opgelost: true },
    ];
    const props = (lang: 'uk' | 'nl', beginIn?: 'nieuw' | 'gelezen' | 'archief') => ({ lang, local, server: [], events: [], readEvents: new Set<string>(), regels: legeRegels(), onReadLocal: () => undefined, onReadEvent: () => undefined, onMarkAll: () => undefined, geluid: true, onGeluid: () => undefined, onSluiten: () => undefined, nu: NU, uitlegV3: false, beginIn });
    const ukV = renderToStaticMarkup(createElement(V2, props('uk'))), nlV = renderToStaticMarkup(createElement(V2, props('nl')));
    const tabs = [...ukV.matchAll(/role="tab" class="mv2-sectie" data-sectie="(\w+)" aria-selected="(true|false)" aria-label="([^"]+)" data-tip="([^"]+)"/g)].map((m) => ({ s: m[1], sel: m[2] === 'true', label: m[3], tip: m[4] }));
    check('E3 v2: drie kleine pictogrammen «Нові / Прочитані / Архів» met teller in de naam; de naam bij aanwijzen (data-tip)', tabs.map((x) => x.s).join() === 'nieuw,gelezen,archief' && tabs.map((x) => x.tip).join() === 'Нові,Прочитані,Архів' && tabs.map((x) => x.label).join() === 'Нові: 1,Прочитані: 1,Архів: 1', JSON.stringify(tabs));
    check('E3 v2: opent in «Нові» (er is iets nieuws); de kop zegt in welk deel u bent; korte uitleg van het deel', tabs[0]?.sel === true && ukV.includes('data-mv2-kop-sectie="nieuw"') && ukV.includes('data-mv2-sectie-uitleg="nieuw"') && ukV.includes('стає прочитаним'));
    check('E3 v2: per melding «Відкрити» (link naar de plek) en «Очистити» (naar Архів), plus «Очистити всі нові»', ukV.includes('data-mv2-openen="1"') && ukV.includes('href="https://mail.tarasevych.com/postvak-in"') && ukV.includes('data-mv2-opruimen="1"') && ukV.includes('aria-label="Очистити: Не вдалося надіслати лист"') && ukV.includes('data-mv2-alles-opruimen="1"'));
    const arch = renderToStaticMarkup(createElement(V2, props('uk', 'archief')));
    check('E3 v2: «Архів» toont de door een latere stap opgeloste fout (geen «Очистити» meer; terugzetten alleen voor wat u zelf opruimde)', arch.includes('Помилку синхронізації виправлено') && !arch.includes('Не вдалося надіслати лист') && !arch.includes('data-mv2-opruimen="1"') && !arch.includes('data-mv2-terug="1"'));
    const v2src = lees('src/meldingen/v2/MeldingenV2.tsx');
    check('E3 v2: «Повернути з архіву» voor wat u (of de bewaartermijn) opruimde of oploste — status op de server', v2src.includes("const isHerstelbaar = (g: V2Groep) => g.leden.some((x) => { const s = statusStand.items[x.id]?.s; return s === 'archief' || s === 'opgelost'; });") && v2src.includes("const zetTerug = (gs: V2Groep[]) => void zetGroepen(gs, 'nieuw', 'kaart'"));
    const leegArch = renderToStaticMarkup(createElement(V2, { ...props('uk', 'archief'), local: [local[0]] }));
    check('E3 v2: een leeg deel zegt wat er normaal staat (geen kaal «нічого»)', leegArch.includes('data-mv2-leeg="archief"') && leegArch.includes('Архів порожній. Сюди потрапляє'));
    check('E3 v2: voet — kleine pictogrammen (geen brede knop «Уся історія»); naam bij aanwijzen en voor de schermlezer', ukV.includes('data-mv2-historie-knop="1"') && ukV.includes('data-tip="Уся історія"') && ukV.includes('class="mv2-sr">Уся історія<') && !/class="mv2-tekstknop"[^>]*>[^<]*<svg[^>]*lucide-history/.test(ukV));
    check('E3 nl: dezelfde delen in het Nederlands', nlV.includes('data-tip="Nieuw"') && nlV.includes('data-tip="Gelezen"') && nlV.includes('data-tip="Archief"') && nlV.includes('Alle nieuwe opruimen'));
    const engelsV = /\b(New|Read|Archive|Clear|Open|History|Settings)\b/;
    check('E3 geen Engelse tekst in het v2-paneel (uk en nl)', !engelsV.test(ukV.replace(/<[^>]+>/g, ' ')) && !engelsV.test(nlV.replace(/<[^>]+>/g, ' ')));

    const Body = (await import('../../src/MeldingenpaneelInhoud')).default;
    const bodyProps = (lang: 'uk' | 'nl') => ({ lang, local: [...local, { id: 'o1', text: 'Старе прочитане', kind: 'info' as const, createdAt: NU - 9 * DAG, source: 'mail', read: true }], server: [], events: [], readEvents: new Set<string>(), onReadLocal: () => undefined, onRemoveLocal: () => undefined, onRunAction: () => undefined, onReadEvent: () => undefined, detailIcons: {}, nu: NU, onOpruimen: () => undefined, onTerug: () => undefined });
    const oud = renderToStaticMarkup(createElement(Body, bodyProps('uk')));
    check('E4 oud paneel: dezelfde delen (Нові 1, Прочитані 1, Архів 2: opgelost + ouder dan een week) + «Проблеми»', oud.includes('aria-label="Нові: 1"') && oud.includes('aria-label="Прочитані: 1"') && oud.includes('aria-label="Архів: 2"') && oud.includes('data-cnc-deel="problems"'));
    check('E4 oud paneel: «Очистити» per regel en «Очистити всі нові»; link naar de plek (ook zonder eigen link: het onderdeel)', oud.includes('data-cnc-opruimen="1"') && oud.includes('data-cnc-alles-opruimen="1"') && oud.includes('href="https://mail.tarasevych.com/postvak-in"'));
  } catch (e) {
    check('E3/E4 panelen renderen in node', false, String((e as Error).stack || e).slice(0, 600));
  } finally {
    herstelE();
  }
  const belE = code(lees('src/CanoniekMeldingencentrum.tsx'));
  check('E5 bron: de status (opgeruimd/opgelost) geldt nu altijd, ook zonder vlag v3; afgehandeld telt niet als ongelezen in de bel',
    belE.includes("const v3Status = useStatusStand(!!p.scope && p.scope !== 'anon');") && belE.includes('(ms) => pasStatusToe(ms, v3Status))') && belE.includes("!afgehandeld(`s:${item.id}`)"));

  // ------------------------------------------------------------------ F. elke melding zegt wat, over wie/wat, en waar u het oplost
  const herstelF = nepBrowser();
  const { activiteitContext, activityTitle } = await import('../../src/connector-activiteit');
  herstelF();
  check('F1 auditnaam zonder eigen label, alle woorden bekend → gewone zin («Хмара: теку створено»)', siteActieTekst('owner.cloud.folder.created', 'uk') === 'Хмара: теку створено' && siteActieTekst('owner.cloud.folder.created', 'nl') === 'Cloud: map aangemaakt' && siteActieTekst('owner.mail.label.deleted', 'uk') === 'Пошта: мітку видалено');
  const onb = siteActieTekst('owner.mail.zoekfilter.herberekend', 'uk'), onbGebied = siteActieTekst('owner.zzz.x', 'nl');
  check('F1 onbekend woord: nooit de interne code en nooit het kale «дія»/«інша дія»; wel het gebied en waar de code staat', onb.startsWith('Пошта:') && !/zoekfilter|herberekend|^Пошта: дія$/.test(onb) && onb.includes('Технічних подробицях') && !/zzz/.test(onbGebied) && onbGebied.includes('Technische details'), `${onb} / ${onbGebied}`);
  const evt = (x: Partial<ActivityEvent>): ActivityEvent => ({ id: 'e', source: 'agent', kind: 'command', type: 'fs.iets', subject: 'Pavlo-PC', status: 'failed', createdAt: NU, finishedAt: NU, platform: 'win32', ...x });
  check('F2 commando zonder naam: «Команда «…» на пристрої «Pavlo-PC»» (niet alleen de code)', activityTitle(evt({}), 'uk') === 'Команда «fs.iets» на пристрої «Pavlo-PC»' && activityTitle(evt({}), 'nl') === 'Commando «fs.iets» op apparaat «Pavlo-PC»');
  check('F2 over wie/wat: apparaat + systeem + doel; AI-verbinding bij een site-actie', activiteitContext(evt({ doel: 'T:\\notes\\a.md' }), 'uk') === 'Пристрій «Pavlo-PC» · Windows · T:\\notes\\a.md' && activiteitContext(evt({ kind: 'site', source: 'mail', client: 'Claude', platform: undefined }), 'uk') === 'Claude');
  check('F3 type «systeem» heet niet meer het vage «Інше»', MELDING_TYPES.systeem.naam[0] !== 'Інше' && /Сайт/.test(MELDING_TYPES.systeem.naam[0]) && /Site/.test(MELDING_TYPES.systeem.naam[1]));
  check('F3 standaarduitleg bij een fout noemt het onderdeel (waar u het oplost)', belE.includes("uitlegStandaard(propsRef.current.lang, styleOf(notice.source || '', propsRef.current.lang).label)") && belE.includes('спробуйте ще раз у розділі «${onderdeel}»'));
  check('F3 servermelding in de pop-up: welk soort (context) en «Відкрити: <onderdeel>» uit de link', belE.includes("...(info.type !== 'systeem' ? { context: t(...typeInfo(info.type).naam) } : {}),") && belE.includes('t(`Відкрити: ${plek}`, `Openen: ${plek}`)'));

  // ------------------------------------------------------------------ G. stip in het menu: uitleg, «Відкрити», «Очистити», ook op klik
  const herstelG = nepBrowser();
  try {
    const { MeldingBellen, MenuBadge, stipUitleg } = await import('../../src/MenuMeldingen');
    const badge = { item: 'svc:identity', aantal: 2, categorieen: ['beveiliging', 'toegang'] as Array<'beveiliging' | 'toegang'>, nieuwste: NU, meldingen: [
      { id: 's1', bron: 'server' as const, item: 'svc:identity', categorie: 'beveiliging' as const, titel: 'Новий вхід з пристрою', tekst: 'Windows · Chrome', op: NU - 60_000, link: 'https://id.tarasevych.com/account' },
      { id: 's2', bron: 'server' as const, item: 'svc:identity', categorie: 'toegang' as const, titel: 'Запит на доступ', tekst: '', op: NU - 120_000 },
    ] };
    const anker = { left: 0, top: 100, right: 220, bottom: 140, width: 220, height: 40, x: 0, y: 100, toJSON: () => ({}) } as DOMRect;
    const bellen = (lang: 'uk' | 'nl') => renderToStaticMarkup(createElement(MeldingBellen, { lang, label: lang === 'uk' ? 'Обліковий запис' : 'Account', badge, anker, onSluit: () => undefined, onOpen: () => undefined, onAllesWeg: () => undefined, onBinnen: () => undefined, onEsc: () => undefined, paneelRef: () => undefined }));
    const ukB = bellen('uk'), nlB = bellen('nl');
    check('G1 het venster zegt wat de stip betekent (hoeveel, welk soort, waar) en wat u kunt doen', ukB.includes('data-menu-bellen-uitleg="1"') && ukB.includes('Позначка на «Обліковий запис» означає') && ukB.includes('безпека, доступ і запити') && ukB.includes('позначка зникне'));
    check('G1 per melding «Відкрити» en «Очистити» als tekstknop (niet alleen ×); onderaan «Очистити все тут» en «Усі сповіщення»',
      (ukB.match(/data-menu-bel-openen="1"/g) || []).length === 2 && (ukB.match(/data-menu-bel-weg="1"[^>]*>Очистити</g) || []).length === 2 && ukB.includes('>Очистити все тут<') && ukB.includes('data-menu-bellen-paneel="1"') && ukB.includes('Усі сповіщення'));
    check('G1 nl', nlB.includes('De stip op «Account» betekent') && nlB.includes('>Opruimen<') && nlB.includes('>Alles hier opruimen<') && nlB.includes('Alle meldingen'));
    check('G1 één melding: «Очистити» (niet «Очистити все тут»), uitleg in het enkelvoud', stipUitleg('uk', 'Пошта', { ...badge, aantal: 1, categorieen: ['beveiliging'], meldingen: [badge.meldingen[0]] }).includes('є 1 непрочитане сповіщення'));
    const metKlik = renderToStaticMarkup(createElement(MenuBadge, { badge, stijl: 'punt', knipper: false, herinner: false, onOpen: () => undefined }));
    const zonder = renderToStaticMarkup(createElement(MenuBadge, { badge, stijl: 'punt', knipper: false, herinner: false }));
    check('G2 de stip is klikbaar (data-klik) als er een venster bij hoort; anders niet', metKlik.includes('data-klik="ja"') && !zonder.includes('data-klik'));
  } catch (e) {
    check('G venster bij de stip rendert in node', false, String((e as Error).stack || e).slice(0, 500));
  } finally {
    herstelG();
  }
  const chrome = lees('src/CanoniekOmlijsting.tsx');
  check('G3 menu: klik/tik op de stip opent het venster (badge onOpen → belOpenen), ook als «bellen bij aanwijzen» uit staat',
    chrome.includes("onOpen={el=>{") && chrome.includes("belOpenen(id,belLabels.current[id]||'',k,true)") && chrome.includes('const belOpenen=(id:string,label:string,el:HTMLElement,direct=false)=>{if(!badges[id])return;') && chrome.includes('ankerEl={bel.knop}'));
  check('G3 «Усі сповіщення» opent het paneel aan de bel', belE.includes('window.addEventListener(MELDINGEN_OPENEN_EVENT, openen);') && lees('src/MenuMeldingen.tsx').includes('new CustomEvent(MELDINGEN_OPENEN_EVENT)'));
  const mcss = code(lees('src/canoniek-meldingencentrum.css'));
  check('G3 CSS: alleen de klikbare stip vangt klikken (groter tikvlak); de rest van de badge blijft «pointer-events:none»', mcss.includes(".menu-badge[data-klik='ja']{pointer-events:auto;cursor:pointer}") && mcss.includes(".menu-badge[data-klik='ja']::before{content:'';position:absolute;inset:-8px}"));

  // ------------------------------------------------------------------ H. maten: de bel is een pictogram; in het paneel kleine pictogrammen
  check('H1 bel = pictogram in balk/menu (geen rand, geen schaduw); rondje alleen zwevend in de actiestapel',
    mcss.includes("html .canonical-chrome .plaats-gniezdo>.canonical-notification-bell:not([data-vorm='rij']){border-color:transparent;background:transparent;box-shadow:none;color:var(--text)}")
    && mcss.includes("html .canonical-chrome .plaats-actiestapel .plaats-gniezdo>.canonical-notification-bell:not([data-vorm='rij']){border-color:"));
  const v2cssH = code(lees('src/meldingen/v2/meldingen-v2.css'));
  check('H2 paneel: delen als kleine pictogrammen (34 px hoog, naam bij aanwijzen links uitgelijnd), geen brede segmentknoppen meer', /\.mv2 \.mv2-sectie\{[^}]*height:34px/.test(v2cssH) && v2cssH.includes('.mv2 .mv2-sectie[data-tip]:hover::after{left:0;right:auto}'));

  return einde();
}
