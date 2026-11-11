// Gezamenlijk lezen van de zichtbare functievlaggen. Geen beheermogelijkheden of rechten.
// Dit bestand is openbaar. Het technische beheervenster gebruikt dezelfde cache via zijn verwijzer.
import { useEffect, useState } from 'react';
import { api } from './platform/client';
import { serviceFromLocation } from './canoniek-navigatie';
import { ecosystemTabContext } from './tab-context';
import { zijbalkServerDienst } from './zijbalk-voorkeuren';
import type { Uitkomst } from '../shared/vlaggen';

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
  ).then((m) => { cache = m; bezig = null; luisteraars.forEach((f) => f()); try { window.dispatchEvent(new CustomEvent('mr:vlaggen-vernieuwd')); } catch { /* поза оглядачем */ } return m; });
  return bezig;
}

/** Na een wijziging in het venster: nieuwe waarden ophalen, alle pagina's bijwerken. */
export const vlaggenVernieuwen = () => laadVlaggen(true);

/** Voor een ontbrekende of nog niet opgehaalde vlag gebruiken we veilig «uit». */
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
