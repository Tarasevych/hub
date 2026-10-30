// Onthoudt dat de extensie na het installeren de site opende met ?extension=welcome, ook als de gebruiker nog niet is ingelogd.
//
// De extensie opent https://mcp.tarasevych.com/agents?extension=welcome. Is de gebruiker daar niet aangemeld, dan loopt hij via Google
// en id.tarasevych.com terug naar deze site (de querystring kan onderweg verdwijnen). Daarom bewaren we de vlag meteen bij het laden in
// localStorage (zelfde aanpak als mcp-toestemming-opslag.ts); na het inloggen toont het kabinet dan de installatiehulp.
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

// ---------------------------------------------------------------- pagina van de extensie (18.10.2026; 0.6: tab van de hub, voor iedereen)
// mcp.*/agents#extensie (en de oude #extension, #apparaten/extensie) en ?extension=welcome|update (na installeren/bijwerken).
// 0.5 maakte dit alleen-technisch; sinds 0.6 is het het tabblad «Розширення браузера» van de hub met een gebruikerssectie voor
// iedereen en een technische sectie alleen voor accounts met een technisch profiel.
const DOORGAAN = 'mr.ext.doorgaan';
const DOORGAAN_MS = 10 * 60 * 1000;

/** Is dit de pagina van de browserextensie (hash of querystring), of loopt de installatiehulp nog? */
export function isExtensiePagina(loc: Pick<Location, 'hash' | 'search'> = location): boolean {
  const h = String(loc.hash || '').replace(/^#/, '');
  const tab = h.split('?')[0];
  // 0.6: hub-tab «Розширення браузера» (#extensie, #extensie?koppel=prive) + de oude adressen.
  if (tab === 'extension' || tab.startsWith('extension/') || tab === 'apparaten/extensie' || tab === 'extensie' || tab.startsWith('extensie/')) return true;
  try { const e = new URLSearchParams(loc.search).get('extension'); if (e === 'welcome' || e === 'update') return true; } catch { /* geen URL */ }
  return welcomePending();
}

/** «Увімкнути технічний профіль і підключити»: na de activering (stap-op) gaat de hulp zelf verder met koppelen en aanzetten. */
export function vraagDoorgaan(): void { try { sessionStorage.setItem(DOORGAAN, String(Date.now())); } catch { /* opslag geblokkeerd: dan handmatig */ } }
export function doorgaanGevraagd(): boolean {
  try { const at = Number(sessionStorage.getItem(DOORGAAN)); if (!at || Date.now() - at > DOORGAAN_MS) { sessionStorage.removeItem(DOORGAAN); return false; } return true; } catch { return false; }
}
export function doorgaanKlaar(): void { try { sessionStorage.removeItem(DOORGAAN); } catch { /* niets */ } }
