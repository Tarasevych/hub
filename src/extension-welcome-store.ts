// Onthoudt dat de extensie na het installeren de site opende met ?extension=welcome, ook als de gebruiker nog niet is ingelogd.
//
// De extensie opent https://mcp.tarasevych.com/agents?extension=welcome. Is de gebruiker daar niet aangemeld, dan loopt hij via Google
// en id.tarasevych.com terug naar deze site (de querystring kan onderweg verdwijnen). Daarom bewaren we de vlag meteen bij het laden in
// localStorage (zelfde aanpak als mcp-consent-store.ts); na het inloggen toont het kabinet dan de installatiehulp.
const KEY = 'mr.ext.welcome';
const TTL_MS = 60 * 60 * 1000;

const inUrl = (): boolean => {
  try { return new URLSearchParams(location.search).get('extension') === 'welcome'; } catch { return false; }
};

export function captureWelcomeFromUrl(): void {
  if (!inUrl()) return;
  try { localStorage.setItem(KEY, String(Date.now())); } catch { /* opslag geblokkeerd: de URL blijft over */ }
}

/** Is de installatiehulp gevraagd (en nog niet afgerond of weggeklikt)? */
export function welcomePending(): boolean {
  if (inUrl()) return true;
  try {
    const at = Number(localStorage.getItem(KEY));
    if (!at || Date.now() - at > TTL_MS) { localStorage.removeItem(KEY); return false; }
    return true;
  } catch { return false; }
}

export function clearWelcome(): void {
  try { localStorage.removeItem(KEY); } catch { /* niets te doen */ }
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('extension') === 'welcome') {
      u.searchParams.delete('extension');
      history.replaceState(history.state, '', u.toString());
    }
  } catch { /* geen history-toegang */ }
}

captureWelcomeFromUrl();
