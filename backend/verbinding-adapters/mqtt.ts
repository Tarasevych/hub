// MQTT 3.1.1 (OASIS): verbindingscontrole = CONNECT → CONNACK → DISCONNECT. Publiceert en abonneert NIETS (geen schrijfacties).
// Zigbee2MQTT en Home Assistant gebruiken dezelfde broker; deze controle bewijst alleen dat de broker bereikbaar is en de gegevens klopt.
import { connect as tcp, type Socket } from 'node:net';
import { connect as tls } from 'node:tls';
import { randomBytes } from 'node:crypto';
import type { Uitslag } from './gemeen';

const lengte = (n: number) => { const b: number[] = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; b.push(d); } while (n > 0); return Buffer.from(b); };
const str = (s: string) => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([Buffer.from([b.length >> 8, b.length & 255]), b]); };
export function mqttConnectPakket(clientId: string, gebruiker?: string, wachtwoord?: string, keepAlive = 30): Buffer {
  let vlaggen = 0x02; // clean session
  if (gebruiker) vlaggen |= 0x80; if (gebruiker && wachtwoord) vlaggen |= 0x40;
  const variabel = Buffer.concat([str('MQTT'), Buffer.from([0x04, vlaggen, keepAlive >> 8, keepAlive & 255])]);
  const inhoud = Buffer.concat([variabel, str(clientId), ...(gebruiker ? [str(gebruiker)] : []), ...(gebruiker && wachtwoord ? [str(wachtwoord)] : [])]);
  return Buffer.concat([Buffer.from([0x10]), lengte(inhoud.length), inhoud]);
}
const CONNACK_FOUT: Record<number, string> = { 1: 'MQTT_PROTOCOL_GEWEIGERD', 2: 'MQTT_CLIENT_GEWEIGERD', 3: 'MQTT_SERVER_NIET_BESCHIKBAAR', 4: 'MQTT_TOEGANG_GEWEIGERD', 5: 'MQTT_TOEGANG_GEWEIGERD' };

export function mqttControle(host: string, poort: number, opties: { tls?: boolean; gebruiker?: string; wachtwoord?: string; timeoutMs?: number; tlsServernaam?: string; ca?: string } = {}): Promise<Uitslag<{ sessieAanwezig: boolean; ms: number }>> {
  const begin = Date.now();
  if (!host || !(poort > 0 && poort < 65536)) return Promise.resolve({ ok: false, fout: 'MQTT_ADRES_ONGELDIG' });
  return new Promise((klaar) => {
    let s: Socket, gedaan = false;
    const eind = (u: Uitslag<{ sessieAanwezig: boolean; ms: number }>) => { if (gedaan) return; gedaan = true; try { s.end(Buffer.from([0xe0, 0x00])); s.destroy(); } catch { /* al dicht */ } klaar(u); };
    const timer = setTimeout(() => eind({ ok: false, fout: 'MQTT_TIJD_VERSTREKEN' }), opties.timeoutMs ?? 8000);
    const open = () => s.write(mqttConnectPakket(`mr-controle-${randomBytes(4).toString('hex')}`, opties.gebruiker, opties.wachtwoord));
    s = opties.tls ? tls({ host, port: poort, servername: opties.tlsServernaam || host, ...(opties.ca ? { ca: opties.ca } : {}) }, open) : tcp({ host, port: poort }, open);
    let buf = Buffer.alloc(0);
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.length < 4) return;
      clearTimeout(timer);
      if (buf[0] !== 0x20 || buf[1] !== 0x02) return eind({ ok: false, fout: 'MQTT_ANTWOORD_ONGELDIG' });
      if (buf[3] !== 0) return eind({ ok: false, fout: CONNACK_FOUT[buf[3]] || 'MQTT_GEWEIGERD' });
      eind({ ok: true, waarde: { sessieAanwezig: (buf[2] & 1) === 1, ms: Date.now() - begin } });
    });
    s.on('error', (e) => { clearTimeout(timer); eind({ ok: false, fout: 'MQTT_ONBEREIKBAAR', detail: String(e.message).slice(0, 120) }); });
    s.on('close', () => { clearTimeout(timer); eind({ ok: false, fout: 'MQTT_VERBINDING_GESLOTEN' }); });
  });
}
