process.env.MR_BEHEERSUBNET = '203.0.113.0/24';
// Testhulp (geen test zelf): een NAGEBOOTSTE Home Assistant op een niet-loopback-adres van deze machine (de adapter weigert
// loopback), met het stukje REST-API dat backend/huis-adapter-thuis-assistent.ts gebruikt: /api/, /api/config, /api/states,
// /api/states/:id, /api/services/:domein/:dienst, /api/history/period/:van. Een dienst verandert de toestand pas na `vertragingMs`
// (zo is de ACK-wachttijd echt te toetsen) of nooit (`doof`), en elke aanroep wordt opgenomen.
import http, { createServer, type Server } from 'node:http';
import net from 'node:net';

// SEC-002 (slot v, 13.11.2026) — DE TEST HANGT NIET MEER AF VAN HET NETWERK VAN DE MACHINE.
// Vroeger luisterde de nagebootste bron op het eerste niet-loopback-adres van deze machine. In een cloudcontainer is dat
// 192.0.2.2 (documentatiereeks, voor de adapter «publiek»): onversleuteld http naar een publiek IP weigert de adapter terecht
// (ADRES_GEWEIGERD), dus huis-vnext en sec-002-g02 vielen daar — ook op de basis 11e0aad8 — en slaagden alleen op een machine
// met een privé-adres (bv. een CI-runner met 10.x). Nu: de bron heeft altijd een vast PRIVÉ-adres (VIRTUEEL_LAN_ADRES, RFC 1918),
// net als een echt toestel thuis; alle controles van de adapter (loopback, verboden reeksen, http naar publiek, lijst van
// vertrouwde toestellen, vastgepinde lookup) zien dus precies dat LAN-adres. Alleen het BEZORGEN van het pakket is nagebootst: de
// http-agent van dit testproces stuurt verbindingen naar precies dat adres + die poort door naar 127.0.0.1 (waar de bron luistert).
// In de code van de site verandert niets en niets wordt soepeler.
// Тест більше не залежить від мережі машини: підробка завжди має приватну адресу (як справжній пристрій удома); перевірки адаптера
// бачать саме її, а агент http цього тестового процесу лише доставляє з'єднання на 127.0.0.1. Код сайту не змінено, захист не послаблено.
export const VIRTUEEL_LAN_ADRES = '10.254.82.17';
const doorsturen = new Map<string, number>(); // `${adres}:${poort}` → lokale poort
let agentGepatcht = false;
function patchAgent(): void {
  if (agentGepatcht) return;
  agentGepatcht = true;
  const agent = http.globalAgent as http.Agent & { createConnection: (o: net.NetConnectOpts & { host?: string; port?: number | string }, cb?: () => void) => net.Socket };
  const vorige = agent.createConnection;
  agent.createConnection = function (opties, cb) {
    const lokaal = doorsturen.get(`${String(opties.host ?? '')}:${Number(opties.port)}`);
    const o = lokaal === undefined ? opties : { ...opties, host: '127.0.0.1', port: lokaal, lookup: undefined };
    return vorige.call(this, o as never, cb);
  } as typeof agent.createConnection;
}
/**
 * Laat `server` luisteren op 127.0.0.1 en geeft het adres waaronder de adapter hem ziet: http://VIRTUEEL_LAN_ADRES:<poort>.
 * De doorsturing blijft staan als de server sluit: daarna ECONNREFUSED op 127.0.0.1 → «geen antwoord», zoals een uitgeschakeld toestel
 * (en nooit een echte verbinding naar het LAN-adres).
 */
export async function luisterOpLanAdres(server: Server): Promise<{ adres: string; poort: number; url: string }> {
  patchAgent();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const poort = (server.address() as { port: number }).port;
  doorsturen.set(`${VIRTUEEL_LAN_ADRES}:${poort}`, poort);
  return { adres: VIRTUEEL_LAN_ADRES, poort, url: `http://${VIRTUEEL_LAN_ADRES}:${poort}` };
}

export type NepEntiteit = { entity_id: string; state: string; attributes: Record<string, unknown>; last_changed: string; last_updated: string };
/** Het (privé, niet-loopback) adres waaronder de adapter de nagebootste bron ziet — hetzelfde op elke machine (zie boven). */
export function nietLoopbackAdres(): string | null {
  return VIRTUEEL_LAN_ADRES;
}
export async function nepHomeAssistant(o: { token: string; entiteiten: NepEntiteit[]; vertragingMs?: number; doof?: boolean }) {
  const s = { entiteiten: new Map(o.entiteiten.map((e) => [e.entity_id, { ...e }])), aanroepen: [] as Array<{ methode: string; pad: string; body: unknown }>, vertragingMs: o.vertragingMs ?? 0, doof: Boolean(o.doof), geschiedenis: {} as Record<string, Array<{ state: string; last_changed: string }>> };
  const stamp = () => new Date().toISOString();
  const zet = (id: string, state: string, attrs: Record<string, unknown> = {}) => { const e = s.entiteiten.get(id); if (!e) return; e.state = state; e.attributes = { ...e.attributes, ...attrs }; e.last_changed = stamp(); e.last_updated = e.last_changed; };
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const pad = (req.url || '/').split('?')[0];
      s.aanroepen.push({ methode: req.method || 'GET', pad, body: body ? JSON.parse(body) : null });
      const antwoord = (code: number, data: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (req.headers.authorization !== `Bearer ${o.token}`) return antwoord(401, { message: 'Unauthorized' });
      if (pad === '/api/') return antwoord(200, { message: 'API running.' });
      if (pad === '/api/config') return antwoord(200, { version: '2026.10.1', location_name: 'Proefhuis', time_zone: 'Europe/Brussels' });
      if (pad === '/api/states') return antwoord(200, [...s.entiteiten.values()]);
      const een = /^\/api\/states\/([^/]+)$/.exec(pad);
      if (een) { const e = s.entiteiten.get(decodeURIComponent(een[1])); return e ? antwoord(200, e) : antwoord(404, { message: 'Entity not found.' }); }
      const dienst = /^\/api\/services\/([^/]+)\/([^/]+)$/.exec(pad);
      if (dienst && req.method === 'POST') {
        const d = JSON.parse(body || '{}') as Record<string, unknown>; const id = String(d.entity_id);
        const [domein, naam] = [decodeURIComponent(dienst[1]), decodeURIComponent(dienst[2])];
        const doe = () => {
          if (s.doof) return;
          if (domein === 'light' && naam === 'turn_on') zet(id, 'on', d.brightness_pct !== undefined ? { brightness: Math.round((Number(d.brightness_pct) / 100) * 255) } : d.color_temp_kelvin !== undefined ? { color_temp_kelvin: d.color_temp_kelvin } : {});
          else if ((domein === 'light' || domein === 'switch') && naam === 'turn_off') zet(id, 'off');
          else if (domein === 'switch' && naam === 'turn_on') zet(id, 'on');
          else if (domein === 'cover') zet(id, naam === 'open_cover' ? 'open' : naam === 'close_cover' ? 'closed' : s.entiteiten.get(id)?.state || 'closed', naam === 'set_cover_position' ? { current_position: d.position } : {});
          else if (domein === 'climate' && naam === 'set_temperature') zet(id, 'heat', { temperature: d.temperature });
          else if (domein === 'lock') zet(id, naam === 'lock' ? 'locked' : 'unlocked');
        };
        if (s.vertragingMs > 0) setTimeout(doe, s.vertragingMs); else doe();
        return antwoord(200, []);
      }
      const hist = /^\/api\/history\/period\/(.+)$/.exec(pad);
      if (hist) { const ids = String(new URL(req.url || '/', 'http://x').searchParams.get('filter_entity_id') || '').split(',').filter(Boolean); return antwoord(200, ids.map((id) => (s.geschiedenis[id] || []).map((x) => ({ entity_id: id, ...x })))); }
      antwoord(404, { message: 'Not found' });
    });
  });
  const { url } = await luisterOpLanAdres(server);
  return { s, zet, url, stop: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }) };
}
export const ENTITEITEN: NepEntiteit[] = [
  { entity_id: 'light.woonkamer', state: 'off', attributes: { friendly_name: 'Lamp woonkamer', supported_color_modes: ['brightness', 'color_temp'], brightness: 0, min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'switch.boiler', state: 'on', attributes: { friendly_name: 'Boiler' }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'sensor.temp_keuken', state: '21.4', attributes: { friendly_name: 'Temperatuur keuken', device_class: 'temperature', unit_of_measurement: '°C' }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'sensor.energie_totaal', state: '1234.5', attributes: { friendly_name: 'Energie totaal', device_class: 'energy', unit_of_measurement: 'kWh' }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'sensor.vermogen_nu', state: 'unavailable', attributes: { friendly_name: 'Vermogen nu', device_class: 'power', unit_of_measurement: 'W' }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'binary_sensor.voordeur', state: 'off', attributes: { friendly_name: 'Voordeur', device_class: 'door', battery_level: 87 }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'binary_sensor.lek_keuken', state: 'off', attributes: { friendly_name: 'Lekdetector keuken', device_class: 'moisture' }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'binary_sensor.rook_hal', state: 'unknown', attributes: { friendly_name: 'Rookmelder hal', device_class: 'smoke' }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'climate.thermostaat', state: 'heat', attributes: { friendly_name: 'Thermostaat', current_temperature: 20.1, temperature: 21, min_temp: 7, max_temp: 30 }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'cover.rolluik', state: 'closed', attributes: { friendly_name: 'Rolluik slaapkamer', current_position: 0 }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'lock.voordeur', state: 'locked', attributes: { friendly_name: 'Slot voordeur' }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'alarm_control_panel.huis', state: 'disarmed', attributes: { friendly_name: 'Alarm' }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'person.pavlo', state: 'home', attributes: { friendly_name: 'Pavlo' }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'automation.nachtlicht', state: 'on', attributes: { friendly_name: 'Nachtlicht' }, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
  { entity_id: 'sun.sun', state: 'above_horizon', attributes: {}, last_changed: '2026-10-28T08:00:00Z', last_updated: '2026-10-28T08:00:00Z' },
];
