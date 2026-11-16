// MELDINGEN-UX-001 (16.11.2026): één getal op de bel — hetzelfde als «Нові» in het gekozen paneel (venster of compact).
// Vroeger: bel 3 / lijst 2 (paginasignalen meegeteld die de compacte panel niet toont), bel 1 / «Нові» 2 terwijl de panel open stond,
// en het venster telde iets anders dan de bel. Єдине число на дзвіночку = кількість рядків у «Нові» вибраного вигляду.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checker } from './hulp/nep-google';
import { belAantal } from '../../shared/meldingen-v2/bel-teller';

const lees = (rel: string) => readFileSync(resolve(rel), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('meldingen-bel-teller-20261116');
  const basis = { vensterNieuw: 3, compactNieuw: 2, compactOpenNieuw: null, klassiekOngelezen: 5, tech: 1 } as const;

  check('venster: bel = «нових» in het venster (geen tech, geen groepen erbij)', belAantal({ ...basis, vorm: 'venster' }) === 3);
  check('compact dicht: bel = «Нові» + technische regel', belAantal({ ...basis, vorm: 'compact' }) === 3);
  check('compact open: bel = wat de panel in «Нові» toont (ook net gezien)', belAantal({ ...basis, vorm: 'compact', compactOpenNieuw: 4 }) === 5);
  check('compact open met 0 in «Нові»: 0 wint van de dichte telling', belAantal({ ...basis, vorm: 'compact', compactOpenNieuw: 0, tech: 0 }) === 0);
  check('klassiek: ongelezen regels + technische regel', belAantal({ ...basis, vorm: 'klassiek' }) === 6);
  check('onzin (negatief, NaN) wordt 0', belAantal({ vorm: 'venster', vensterNieuw: -2, compactNieuw: NaN, compactOpenNieuw: null, klassiekOngelezen: 0, tech: 0 }) === 0);

  const centrum = lees('src/CanoniekMeldingencentrum.tsx');
  check('centrum: de bel gebruikt belAantal — geen losse optelsom meer', centrum.includes('const unreadCount = belAantal({') && !centrum.includes('ecoExtraUnread') && !centrum.includes('unreadCountOud'));
  check('centrum: venster telt de hele stroom «nieuw»', centrum.includes("const vensterNieuw = eco.stroom.filter((g) => g.status === 'nieuw').length;"));
  check('centrum: compact telt de sectie «Нові» (zelfde functie als de panel)', centrum.includes("sectieLijst(v2Model.groepen, 'nieuw', Date.now()).length"));
  check('centrum: open compacte panel meldt haar «Нові»; bij sluiten of venster weer leeg', centrum.includes('onNieuwAantal={setV2OpenNieuw}') && centrum.includes('if (!panelOpen || ecosysteemActief) setV2OpenNieuw(null);'));
  check('centrum: venster krijgt dezelfde gefilterde bronnen (verborgen types weg, afgehandeld = gelezen)', centrum.includes('serverItems: ecoServerItems,') && centrum.includes('localRows: ecoLokaal,') && centrum.includes('activityRead: ecoActiviteitGelezen,') && /ecoServerItems = useMemo\(\(\) => server\.map\(/.test(centrum));
  check('centrum: stroom vooraf laden als het venster de gekozen vorm is', centrum.includes('telVooraf: ecosysteemActief,'));

  const v2 = lees('src/meldingen/v2/MeldingenV2.tsx');
  check('compacte panel: meldt «Нові» zonder filters, met wat tot sluiten blijft staan', v2.includes("sectieLijst(groepen, 'nieuw', nu, { vastNieuw: vastNieuw.current })") && v2.includes('meldNieuw?.(nieuwVoorBel)'));
  const opslag = lees('src/meldingen/ecosysteem/ecosysteem-opslag.ts');
  check('opslag: telVooraf laadt de stroom één keer (geen extra interval)', /if \(opties\.telVooraf\) void verversStroom\(\);\n  \}, \[opties\.telVooraf, verversStroom\]\);/.test(opslag));

  return einde();
}
