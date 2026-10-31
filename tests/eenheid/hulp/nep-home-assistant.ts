// Testhulp (geen test zelf): een NAGEBOOTSTE Home Assistant op een niet-loopback-adres van deze machine (de adapter weigert
// loopback), met het stukje REST-API dat backend/huis-adapter-home-assistant.ts gebruikt: /api/, /api/config, /api/states,
// /api/states/:id, /api/services/:domein/:dienst, /api/history/period/:van. Een dienst verandert de toestand pas na `vertragingMs`
// (zo is de ACK-wachttijd echt te toetsen) of nooit (`doof`), en elke aanroep wordt opgenomen.
import { createServer, type Server } from 'node:http';
import { networkInterfaces } from 'node:os';

export type NepEntiteit = { entity_id: string; state: string; attributes: Record<string, unknown>; last_changed: string; last_updated: string };
export function nietLoopbackAdres(): string | null {
  for (const lijst of Object.values(networkInterfaces())) {
    for (const i of lijst ?? []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('203.0.113.')) return i.address;
    }
  }
  return null;
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
  const adres = nietLoopbackAdres();
  if (!adres) throw new Error('GEEN_NIET_LOOPBACK_ADRES');
  await new Promise<void>((r) => server.listen(0, adres, () => r()));
  const poort = (server.address() as { port: number }).port;
  return { s, zet, url: `http://${adres}:${poort}`, stop: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }) };
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
