// Testhulp (geen test zelf): runnercontract voor suites in node:test-stijl. scripts/eenheidstests.mjs roept main() aan; een kale
// «export async function main() { return 0; }» liet een falende node:test-test groen eindigen (05.11.2026). Deze hulp houdt elke
// test bij: main() wacht tot alle tests klaar zijn en geeft 1 terug zodra er één faalde. `node --test` blijft gewoon werken.
import nodeTest from 'node:test';

export function nodeTestSuite() {
  let gefaald = 0;
  const lopend: Promise<void>[] = [];
  // Een fout die pas ná het eind van een test komt (timer die gooit, niet-afgewachte promise), ziet try/catch niet. node:test
  // meldt hem wel, maar zet alleen process.exitCode, en de uitvoerder overschrijft dat met process.exit(main()). Hier telt hij mee.
  const telFout = () => { gefaald += 1; };
  process.on('uncaughtException', telFout);
  process.on('unhandledRejection', telFout);
  const test = (naam: string, fn: () => unknown) => {
    lopend.push(nodeTest(naam, async () => {
      try { await fn(); } catch (e) { gefaald += 1; throw e; }
    }));
  };
  const main = async (): Promise<number> => {
    await Promise.all(lopend);
    // Late callbacks (timers, I/O) nog een kans geven om te falen vóór de uitslag vastligt.
    await new Promise((r) => setTimeout(r, 25));
    await new Promise((r) => setImmediate(r));
    process.off('uncaughtException', telFout);
    process.off('unhandledRejection', telFout);
    return gefaald ? 1 : 0;
  };
  return { test, main };
}
