// Menu v2 fase B1: «stale-while-revalidate» voor LEZENDE lijsten binnen één onderdeel + afbreken bij een nieuwe navigatie.
// - Alleen in het geheugen van deze pagina (nooit localStorage/IndexedDB): weg bij herladen, afmelden of ander account.
// - Sleutel = account + pad + body; een ander account (of geen) wist alles.
// - `swrPost` roept `bijData` eerst meteen aan met de bewaarde versie (als die er is) en daarna met de verse.
// - Afbreken: de component geeft een AbortSignal mee dat afgaat zodra hij verdwijnt (navigatie naar een andere pagina); zo wordt
//   alleen een lezend verzoek afgebroken dat niemand meer nodig heeft. Schrijvende acties gaan nooit via deze module.
import { api, isAfgebroken } from './platform/client';

const MAX = 40, MAX_LEEFTIJD = 10 * 60_000;
type Item = { data: unknown; op: number };
const cache = new Map<string, Item>();
const lopend = new Map<string, Promise<{ data: unknown }>>();
let account = '';

/** Uit de bootstrap: id van het goedgekeurde account ('' = geen). Ander account → cache leeg. */
export function leesCacheAccount(id: string) { const nieuw = String(id || ''); if (nieuw !== account) { cache.clear(); lopend.clear(); account = nieuw; } }
export const leesCacheAccountId = () => account;
export function leesCacheWissen() { cache.clear(); lopend.clear(); }
export const __leesCacheGrootte = () => cache.size;

const sleutelVan = (pad: string, body: unknown) => {
  const b = body && typeof body === 'object' ? { ...(body as Record<string, unknown>) } : {};
  delete b.tabContext; delete b.sourceOrigin; // wisselen per tabblad, veranderen de inhoud niet
  return `${account}|${pad}|${JSON.stringify(b)}`;
};
export function leesBewaard<T>(pad: string, body: unknown): T | undefined {
  if (!account) return undefined;
  const it = cache.get(sleutelVan(pad, body));
  return it && Date.now() - it.op < MAX_LEEFTIJD ? it.data as T : undefined;
}

/** Lezen met directe bewaarde versie + verversen. Gooit fouten van het verse verzoek door (behalve «afgebroken»: stil). */
export async function swrPost<T>(pad: string, body: unknown, bijData: (d: T, vers: boolean) => void, opties: { signal?: AbortSignal; alleenVers?: boolean } = {}): Promise<void> {
  if (!/^\/api\/owner\/[a-z0-9/_-]+$/i.test(pad)) throw new Error('SWR_PAD_ONGELDIG');
  const k = sleutelVan(pad, body), wasAccount = account;
  const oud = leesBewaard<T>(pad, body);
  if (oud !== undefined && !opties.alleenVers) bijData(oud, false);
  try {
    let belofte = !opties.signal ? lopend.get(k) : undefined;
    if (!belofte) {
      belofte = api.post(pad, body, { signal: opties.signal });
      if (!opties.signal) {
        lopend.set(k, belofte);
        void belofte.finally(() => { if (lopend.get(k) === belofte) lopend.delete(k); }).catch(() => undefined);
      }
    }
    const r = await belofte;
    if (account === wasAccount && account) {
      cache.delete(k); cache.set(k, { data: r.data, op: Date.now() });
      while (cache.size > MAX) cache.delete(cache.keys().next().value as string);
    }
    if (opties.signal?.aborted) return;
    bijData(r.data as T, true);
  } catch (e) {
    if (isAfgebroken(e)) return; // de pagina is weg; niets te doen
    throw e;
  }
}
/** Na een schrijvende actie: bewaarde versie(s) van dit pad vergeten (de volgende `swrPost` haalt vers op). */
export function leesVergeten(pad: string) {
  for (const k of [...cache.keys()]) if (k.split('|')[1] === pad) cache.delete(k);
  for (const k of [...lopend.keys()]) if (k.split('|')[1] === pad) lopend.delete(k);
}
