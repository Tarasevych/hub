// Testhulp (geen test zelf): runnercontract voor suites in node:test-stijl. scripts/eenheidstests.mjs roept main() aan; een kale
// «export async function main() { return 0; }» liet een falende node:test-test groen eindigen (05.11.2026). Deze hulp houdt elke
// test bij: main() wacht tot alle tests klaar zijn en geeft 1 terug zodra er één faalde. `node --test` blijft gewoon werken.
import nodeTest from 'node:test';

// Echte timers, vastgelegd bij het laden (06.11.2026, ORCH-001, стара помилка): main() nam setTimeout/setImmediate pas bij de aanroep.
// Een suite die mock.timers van node:test aanzet en niet terugzet, liet main() dan nooit afronden: exit 13 («unsettled top-level
// await») of, met een open server, eeuwig hangen. Deze module laadt vóór de suite-code, dus dit zijn altijd de echte functies.
const echteSetTimeout = globalThis.setTimeout;
const echteSetImmediate = globalThis.setImmediate;
// Kortlevende bronnen waarop main() wacht voordat de uitslag vastligt: timers, immediates en losse bestands-/DNS-verzoeken.
// Blijvende handles (servers, sockets, pijpen) niet: die gaan nooit vanzelf weg, en de uitvoerder sluit ze met process.exit af.
const VLUCHTIG = new Set(['Timeout', 'Immediate', 'FSReqCallback', 'FSReqPromise', 'GetAddrInfoReqWrap', 'FileHandleCloseReq']);
// Bovengrens voor dat wachten. Een fout die later komt (of uit een setInterval die blijft lopen) ziet de uitvoerder niet meer:
// process.exit(main()) beëindigt het proces eerder. Dat is een grens, geen garantie; `node --test` meldt zo'n fout wel.
const WACHT_MAX_MS = 2000;

const vluchtigeBronnen = () => process.getActiveResourcesInfo().filter((s) => VLUCHTIG.has(s)).length;

export function nodeTestSuite() {
  let gefaald = 0;
  const lopend: Promise<void>[] = [];
  // Een fout die pas ná het eind van een test komt (timer die gooit, niet-afgewachte promise), ziet try/catch niet. node:test
  // meldt hem wel, maar zet alleen process.exitCode, en de uitvoerder overschrijft dat met process.exit(main()). Hier telt hij mee.
  // Vroeger alleen geteld: de uitslag werd rood zonder één regel uitleg (node:test drukt zijn melding pas aan het eind van de
  // hoofdtest, en daar komt het door process.exit niet meer aan). Nu staat de fout zelf in stderr.
  const telFout = (fout: unknown) => {
    gefaald += 1;
    const tekst = fout instanceof Error ? (fout.stack || `${fout.name}: ${fout.message}`) : String(fout);
    console.error(`FOUT niet-opgevangen fout buiten de testfunctie (timer, callback of niet-afgewachte promise) / неперехоплена помилка поза тестовою функцією (таймер, колбек або непочекана обіцянка):\n${tekst}`);
  };
  process.on('uncaughtException', telFout);
  process.on('unhandledRejection', telFout);
  const test = (naam: string, fn: () => unknown) => {
    lopend.push(nodeTest(naam, async () => {
      try { await fn(); } catch (e) { gefaald += 1; throw e; }
    }));
  };
  const main = async (): Promise<number> => {
    await Promise.all(lopend);
    // Late callbacks nog laten lopen vóór de uitslag vastligt: wachten tot er geen kortlevende bron meer openstaat (max. WACHT_MAX_MS).
    // Vroeger een vaste pauze van 25 ms: een timer die na 60 ms gooide, eindigde groen.
    const start = performance.now();
    while (vluchtigeBronnen() > 0 && performance.now() - start < WACHT_MAX_MS) await new Promise((r) => echteSetTimeout(r, 10));
    await new Promise((r) => echteSetImmediate(r));
    process.off('uncaughtException', telFout);
    process.off('unhandledRejection', telFout);
    return gefaald ? 1 : 0;
  };
  return { test, main };
}
