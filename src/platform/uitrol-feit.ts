// Punt 4 van de eigenaar (audit 19.10.2026): «Не показуй здогад „встановлюється оновлення“, якщо сайт цього не знає. Якщо справді
// йде розгортання — це можна перевірити фактом». Dit bestand is die controle, en niets meer:
//
//  - admin.* (eigenaar): POST /api/owner/uitrol/live geeft de LOPENDE run (backend/uitrol-goedkeuring.ts). Alleen staat 'bezig'
//    betekent «іде встановлення версії X, крок Y» (shared/foutuitleg.ts: uitrolFeitUitLive).
//  - elke andere host: die route is daar niet van deze gebruiker. Dan weet de site het NIET en zwijgt de plakkaat erover; wat wél
//    een feit is, is de versie die /api/version noemt (voor en na de storing: uitrolFeitUitVersie).
//
// Rechtstreeks met fetch, nooit via platform/client.ts: deze controle mag de storingsmelding zelf niet als nieuwe poging tellen.
import { dienstVanHostnaam, uitrolFeitUitLive, uitrolFeitUitVersie, type UitrolFeit } from '../../shared/foutuitleg';

const TIJDSLIMIET_MS = 4_000;

async function vraag(url: string, methode: 'GET' | 'POST'): Promise<unknown | null> {
  const afbreken = new AbortController();
  const klok = window.setTimeout(() => afbreken.abort(), TIJDSLIMIET_MS);
  try {
    const r = await fetch(url, {
      method: methode, credentials: 'same-origin', cache: 'no-store', signal: afbreken.signal,
      headers: methode === 'POST' ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: methode === 'POST' ? '{}' : undefined,
    });
    if (!r.ok) return null; // 401/403 = deze gebruiker mag de uitrolstand niet zien → de site WEET het niet
    return await r.json();
  } catch { return null; } finally { window.clearTimeout(klok); }
}

/** De versie die het draaiende proces zelf noemt (/api/version), of '' als dat nu niet lukt. */
export async function draaiendeVersie(): Promise<string> {
  const v = await vraag('/api/version', 'GET');
  return String((v as { versie?: unknown } | null)?.versie || '');
}

/**
 * Een GEMETEN uitrolstand, of null als de site het niet weet.
 * @param versieVoor de versie die vóór de storing draaide (uit de versie-poll); maakt «nieuwe versie geïnstalleerd» een feit.
 */
export async function uitrolFeit(versieVoor = ''): Promise<UitrolFeit | null> {
  if (typeof window === 'undefined') return null;
  if (dienstVanHostnaam(location.hostname) === 'admin') {
    const feit = uitrolFeitUitLive(await vraag('/api/owner/uitrol/live', 'POST'));
    if (feit) return feit;
  }
  const nu = await draaiendeVersie();
  return uitrolFeitUitVersie(versieVoor, nu);
}
