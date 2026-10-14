// Feature flags in de browser (etap F). Eén verzoek per pagina (POST /api/flags), daarna uit het geheugen.
// Een vlag bepaalt alleen wat de pagina TOONT; de server controleert rechten altijd zelf (zie shared/flags.ts).
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { serviceFromLocation } from '../canonical-navigation';
import { ecosystemTabContext } from '../tab-context';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';
import type { Uitkomst } from '../../shared/flags';

const body = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
let cache: Map<string, Uitkomst> | null = null;
let bezig: Promise<Map<string, Uitkomst>> | null = null;
const luisteraars = new Set<() => void>();

/** Alle vlaggen voor deze gebruiker. Bij een fout: leeg (alles «uit»), nooit een kapotte pagina. */
export function laadVlaggen(opnieuw = false): Promise<Map<string, Uitkomst>> {
  if (cache && !opnieuw) return Promise.resolve(cache);
  if (bezig && !opnieuw) return bezig;
  bezig = api.post('/api/flags', body()).then(
    (r) => new Map(((r.data?.vlaggen ?? []) as Uitkomst[]).map((x) => [x.key, x])),
    () => new Map<string, Uitkomst>(),
  ).then((m) => { cache = m; bezig = null; luisteraars.forEach((f) => f()); return m; });
  return bezig;
}

/** Na een wijziging in het venster «Прапорці»: opnieuw ophalen en alle useVlag-gebruikers bijwerken. */
export const vlaggenVernieuwen = () => laadVlaggen(true);

/** true/false voor een vlag; tot het antwoord er is: `standaard` (meestal false: een nieuwe functie verschijnt pas als ze aan staat). */
export function useVlag(sleutel: string, standaard = false): boolean {
  const [, setTik] = useState(0);
  useEffect(() => {
    const f = () => setTik((x) => x + 1);
    luisteraars.add(f);
    void laadVlaggen();
    return () => { luisteraars.delete(f); };
  }, []);
  const x = cache?.get(sleutel);
  return x ? x.value : standaard;
}
