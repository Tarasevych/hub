// Houdt een door de gebruiker aangezette browserextensie actief zolang er een INGELOGDE pagina van de site open is.
//
// De extensie meldt via window.postMessage welke agent hij is (alleen de agent-id, nooit het token). Deze pagina stuurt elke twee
// minuten een bevestiging naar de server met de gewone sessie van de gebruiker. Zonder geldige sessie (uitgelogd, verlopen, ander
// account) weigert de server dat en verloopt de activering vanzelf: dan doet de extensie niets meer, ook niet met een gestolen token.
// De server beslist (backend/connectors-opslag.ts: browserActive); dit bestand is alleen de bode.
import { sessieDienst } from './canoniek-navigatie';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';

const BEAT_MS = 120_000;
const PING_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let agentId = '';
let beatTimer: number | undefined;
// U-04 (audit 19.10): weigert de server de bevestiging (403: ander account dan de koppeling, of geen recht «API-платформа»), dan
// stoppen de bevestigingen voor deze agent (geen 403 op elke pagina) en kan de pagina een kaart tonen. Een nieuwe «hello» met een
// andere agent-id begint opnieuw.
export const HEARTBEAT_EVENT = 'mr-ext-heartbeat';
export type HeartbeatToestand = { agentId: string; geweigerd: string };
let geweigerd = '';
export const heartbeatToestand = (): HeartbeatToestand => ({ agentId, geweigerd });
const meldHeartbeat = () => { try { window.dispatchEvent(new CustomEvent(HEARTBEAT_EVENT, { detail: heartbeatToestand() })); } catch { /* geen CustomEvent */ } };

// Ook als de tab op de achtergrond staat (de gebruiker werkt in Claude of een ander venster): een open, ingelogde tab is genoeg.
// Chrome beperkt timers in verborgen tabs tot ±1 per minuut; elke 2 minuten valt daar ruim binnen (activering geldt 10 minuten).
async function beat() {
  if (!agentId || geweigerd) return;
  try {
    await api.post(`/api/owner/agents/${agentId}/heartbeat`, { service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
    if (geweigerd) { geweigerd = ''; meldHeartbeat(); }
  } catch (e) {
    // Geen sessie of geen rechten: de server laat de activering dan verlopen. Bij 403 stoppen we zelf (U-04).
    const status = Number((e as { status?: number } | null)?.status || 0);
    if (status === 403) { geweigerd = String((e as { message?: string } | null)?.message || 'HTTP_403'); window.clearInterval(beatTimer); meldHeartbeat(); }
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin || !event.data || event.data.mrExt !== true || event.data.type !== 'hello') return;
  const id = event.data.paired && typeof event.data.agentId === 'string' && UUID.test(event.data.agentId) ? event.data.agentId : '';
  if (id === agentId) return;
  agentId = id; geweigerd = '';
  window.clearInterval(beatTimer);
  if (id) { void beat(); beatTimer = window.setInterval(() => { void beat(); }, BEAT_MS); }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void beat(); });

// Is de extensie er (en gekoppeld)? Een ping is goedkoop; een nieuwe koppeling wordt zo binnen een minuut opgemerkt.
const ping = () => window.postMessage({ mrExtPing: true }, location.origin);
window.setTimeout(ping, 1500);
window.setInterval(ping, PING_MS);
