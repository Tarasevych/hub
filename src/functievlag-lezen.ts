// Gezamenlijk lezen van de zichtbare functievlaggen. Geen beheermogelijkheden of rechten.
// Dit bestand is openbaar. Het technische beheervenster gebruikt dezelfde cache via zijn verwijzer.
import { useEffect, useState } from 'react';
import { api } from './platform/client';
import { sessieDienst } from './canoniek-navigatie';
import { ecosystemSessionHint, ecosystemTabContext } from './tab-context';
import type { Uitkomst } from '../shared/vlaggen';
import { geenSessieVerwacht } from './vlaggen/sessie-verwacht';

const body = () => ({ service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
let cache: Map<string, Uitkomst> | null = null;
let bezig: Promise<Map<string, Uitkomst>> | null = null;
let gebruikerId: string | null | undefined = undefined;
const luisteraars = new Set<() => void>();

const meldLuisteraars = () => { luisteraars.forEach((f) => f()); };

function wisVlagOpslag(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const sleutels: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('mr-vlag:')) sleutels.push(k);
    }
    for (const k of sleutels) sessionStorage.removeItem(k);
  } catch { /* поза оглядачем або сховище недоступне */ }
}

function stuurVernieuwdEvent(): void {
  wisVlagOpslag();
  try { window.dispatchEvent(new CustomEvent('mr:vlaggen-vernieuwd', { detail: { intern: true } })); } catch { /* поза оглядачем */ }
}

/** Alle vlaggen voor deze gebruiker. Bij een fout of zonder sessie: leeg (alles «uit»), nooit een kapotte pagina of verzoeklus. */
export function laadVlaggen(opnieuw = false): Promise<Map<string, Uitkomst>> {
  if (gebruikerId === null || (gebruikerId === undefined && typeof window !== 'undefined' && geenSessieVerwacht(location.pathname, ecosystemSessionHint()))) {
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
  wisVlagOpslag();
  if (nieuw === null) {
    cache = new Map();
    meldLuisteraars();
    stuurVernieuwdEvent();
    return;
  }
  cache = null;
  if (luisteraars.size > 0) {
    void laadVlaggen(true).then(() => {
      stuurVernieuwdEvent();
    });
  } else {
    stuurVernieuwdEvent();
  }
}

/** Na een wijziging in het venster: nieuwe waarden ophalen, alle pagina's bijwerken. */
export const vlaggenVernieuwen = () => {
  wisVlagOpslag();
  return laadVlaggen(true).then((m) => {
    stuurVernieuwdEvent();
    return m;
  });
};

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('mr:vlaggen-vernieuwd', (e: Event) => {
    if ((e as CustomEvent<{ intern?: boolean }>)?.detail?.intern) return;
    wisVlagOpslag();
    cache = null;
    bezig = null;
    if (luisteraars.size > 0) void laadVlaggen(true);
  });
}

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
