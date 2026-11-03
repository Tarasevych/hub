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
import { ontdubbelBronnen, zelfdeGebeurtenis, type V2Melding } from '../../shared/meldingen-v2/groepering';

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

  return einde();
}
