// Onthoudt een openstaand toestemmingsverzoek van Claude (?consent=<id>), ook als de gebruiker nog niet is ingelogd.
//
// Claude stuurt de browser naar https://mcp.tarasevych.com/agents?consent=<id>. Is de gebruiker daar niet aangemeld, dan
// loopt hij via Google en id.tarasevych.com terug naar deze site; bij een tabwissel wordt de querystring bovendien
// verwijderd (canonical-navigation.ts). Daarom bewaren we het id meteen bij het laden in localStorage van deze origin
// (niet sessionStorage: aanmelden kan in een ander tabblad eindigen). Het id is 10 minuten geldig, net als op de server.
const KEY = 'mr.mcp.consent';
const TTL_MS = 10 * 60 * 1000;
const ID = /^[A-Za-z0-9_-]{20,100}$/;

const fromUrl = (): string | null => {
  try {
    const rid = new URLSearchParams(location.search).get('consent');
    return rid && ID.test(rid) ? rid : null;
  } catch { return null; }
};

/** Legt het id uit de URL vast. Wordt bij het laden van de module meteen uitgevoerd (zie onderaan). */
export function captureConsentFromUrl(): void {
  const rid = fromUrl();
  if (!rid) return;
  try { localStorage.setItem(KEY, JSON.stringify({ rid, savedAt: Date.now() })); } catch { /* opslag geblokkeerd: de URL blijft over */ }
}

/** Het openstaande verzoek: eerst uit de URL (directe bezoeker), anders uit de opslag (na aanmelden of tabwissel). */
export function getPendingConsent(): string | null {
  const direct = fromUrl();
  if (direct) return direct;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { rid?: unknown; savedAt?: unknown };
    if (typeof saved.rid !== 'string' || !ID.test(saved.rid) || typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return saved.rid;
  } catch { return null; }
}

/** Na een beslissing of als het verzoek verlopen is: opslag leegmaken en `consent` uit de adresbalk halen. */
export function clearPendingConsent(): void {
  try { localStorage.removeItem(KEY); } catch { /* niets te doen */ }
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('consent')) {
      u.searchParams.delete('consent');
      history.replaceState(history.state, '', u.toString());
    }
  } catch { /* geen history-toegang */ }
}

captureConsentFromUrl();
