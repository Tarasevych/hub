// INTEG-001 (03.11.2026) — meldingen: vereisten van de eigenaar (één update). Elk deel toetst echt gedrag (pure functies, opslag
// tussen tabbladen nagebootst, render met react-dom/server) en waar nodig de bron.
//   A. dubbele meldingen: oorzaken en herstel (tabbladen, herhaling, twee bronnen, servermelding in twee lijsten)
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { BRON_DUBBEL_MS, GEZIEN_VENSTER_MS, SAMENVOEG_MS, isBronDuplicaat, samenvoegDoel, uniekOpId, voegHerhalingToe } from '../../src/canoniek-meldingen';
import { historyKey, readRows, werkRijenBij, type BewaardeRij } from '../../src/meldingen/lokale-rijen';
import { ontdubbelBronnen, zelfdeGebeurtenis, type V2Melding } from '../../shared/meldingen-v2/groepering';

const lees = (p: string) => readFileSync(p, 'utf8');
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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

  return einde();
}
