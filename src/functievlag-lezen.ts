// Gezamenlijk lezen van de zichtbare functievlaggen. Geen beheermogelijkheden of rechten.
// Dit bestand is openbaar. Het technische beheervenster gebruikt dezelfde cache via zijn verwijzer.
import { useEffect, useState } from 'react';
import { api } from './platform/client';
import { sessieDienst } from './canoniek-navigatie';
import { ecosystemSessionHint, ecosystemTabContext } from './tab-context';
import type { Uitkomst } from '../shared/vlaggen';

const body = () => ({ service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
let cache: Map<string, Uitkomst> | null = null;
let bezig: Promise<Map<string, Uitkomst>> | null = null;
let gebruikerId: string | null | undefined = undefined;
const luisteraars = new Set<() => void>();

const meldLuisteraars = () => { luisteraars.forEach((f) => f()); };

/** Alle vlaggen voor deze gebruiker. Bij een fout of zonder sessie: leeg (alles «uit»), nooit een kapotte pagina of verzoeklus. */
export function laadVlaggen(opnieuw = false): Promise<Map<string, Uitkomst>> {
  if (gebruikerId === null || (gebruikerId === undefined && typeof window !== 'undefined' && ecosystemSessionHint() === 'out')) {
    if (!cache) { cache = new Map(); meldLuisteraars(); }
    return Promise.resolve(cache);
  }
  if (cache && !opnieuw) return Promise.resolve(cache);
  if (bezig && !opnieuw) return bezig;
  bezig = api.post('/api/flags', body()).then(
    (r) => new Map(((r.data?.vlaggen ?? []) as Uitkomst[]).map((x) => [x.key, x])),
    () => new Map<string, Uitkomst>(),
  ).then((m) => { cache = m; bezig = null; meldLuisteraars(); return m; });
  return bezig;
}

/** Koppelt de vlaggencache aan het huidige sessie-account zodat inloggen of accountwissel verse vlaggen laadt en uitloggen geen 401-verzoeken stuurt. */
export function vlaggenGebruiker(userId: string | null): void {
  const nieuw = userId ? String(userId) : null;
  if (nieuw === gebruikerId) return;
  gebruikerId = nieuw;
  bezig = null;
  if (nieuw === null) {
    cache = new Map();
    meldLuisteraars();
    try { window.dispatchEvent(new CustomEvent('mr:vlaggen-vernieuwd')); } catch { /* поза оглядачем */ }
    return;
  }
  cache = null;
  if (luisteraars.size > 0) {
    void laadVlaggen(true).then(() => {
      try { window.dispatchEvent(new CustomEvent('mr:vlaggen-vernieuwd')); } catch { /* поза оглядачем */ }
    });
  }
}

/** Na een wijziging in het venster: nieuwe waarden ophalen, alle pagina's bijwerken. */
export const vlaggenVernieuwen = () => laadVlaggen(true).then((m) => {
  try { window.dispatchEvent(new CustomEvent('mr:vlaggen-vernieuwd')); } catch { /* поза оглядачем */ }
  return m;
});

/** Чи вже відомі прапорці (навіть після помилки — тоді всі «вимкнені»). Is de vlaggenlijst al opgehaald (ook na een fout)? */
export const vlaggenBekend = () => cache !== null;

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
