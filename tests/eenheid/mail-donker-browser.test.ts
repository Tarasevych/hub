// Donkere mailweergave in een echte Chrome (playwright-core): voor elke brief uit tests/hulp/mails/ op 390/768/1440 px
// — alle zichtbare tekst haalt WCAG (≥ 4,5:1, grote tekst ≥ 3:1), de opmaak (vakken van alle elementen) is identiek aan licht,
// en 1 MB HTML wordt in < 300 ms omgezet. Geen Chrome op deze machine → de test meldt dat en slaagt niet stilzwijgend.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-donker-browser');
  if (!existsSync(process.env.CHROME_PAD || '/usr/bin/google-chrome')) { check('Chrome aanwezig (CHROME_PAD)', false); return einde(); }
  const { meet } = await import(pathToFileURL(resolve('scripts/visueel-mail.mjs')).href);
  const v = await meet({ breedtes: [390, 768, 1440], themas: ['licht', 'donker'], filter: '', uit: resolve('rapporten/visueel-mail'), basislijn: resolve('rapporten/visueel-mail/basislijn'), drempel: 0.5, bijwerken: false, json: '', schermafdrukken: false });
  check('corpus: minstens 25 brieven × 3 breedtes', v.resultaten.length >= 75, `${v.resultaten.length}`);
  for (const r of v.resultaten) check(`${r.id}: opmaak gelijk, contrast in orde`, r.opmaakGelijk && !v.fouten.some((f: string) => f.startsWith(r.id + ':')), `laagste ${r.laagste}`);
  check('1 MB HTML omgezet in < 300 ms', v.snelheid.omzetting < 300, `${v.snelheid.omzetting.toFixed(0)} ms`);
  for (const f of v.fouten) console.log('  ' + f);
  return einde();
}
