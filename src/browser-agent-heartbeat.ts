// Houdt een door de gebruiker aangezette browserextensie actief zolang er een INGELOGDE pagina van de site open is.
//
// De extensie meldt via window.postMessage welke agent hij is (alleen de agent-id, nooit het token). Deze pagina stuurt elke twee
// minuten een bevestiging naar de server met de gewone sessie van de gebruiker. Zonder geldige sessie (uitgelogd, verlopen, ander
// account) weigert de server dat en verloopt de activering vanzelf: dan doet de extensie niets meer, ook niet met een gestolen token.
// De server beslist (backend/connectors-store.ts: browserActive); dit bestand is alleen de bode.
import { serviceFromLocation } from './canonical-navigation';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';

const BEAT_MS = 120_000;
const PING_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let agentId = '';
let beatTimer: number | undefined;

async function beat() {
  if (!agentId || document.visibilityState === 'hidden') return;
  try {
    await api.post(`/api/owner/agents/${agentId}/heartbeat`, { service: serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
  } catch { /* geen sessie of geen rechten: de server laat de activering dan verlopen */ }
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin || !event.data || event.data.mrExt !== true || event.data.type !== 'hello') return;
  const id = event.data.paired && typeof event.data.agentId === 'string' && UUID.test(event.data.agentId) ? event.data.agentId : '';
  if (id === agentId) return;
  agentId = id;
  window.clearInterval(beatTimer);
  if (id) { void beat(); beatTimer = window.setInterval(() => { void beat(); }, BEAT_MS); }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void beat(); });

// Is de extensie er (en gekoppeld)? Een ping is goedkoop; een nieuwe koppeling wordt zo binnen een minuut opgemerkt.
const ping = () => window.postMessage({ mrExtPing: true }, location.origin);
window.setTimeout(ping, 1500);
window.setInterval(ping, PING_MS);
