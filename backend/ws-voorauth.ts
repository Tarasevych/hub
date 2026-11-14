// SEC-002 (keten-config-05, http-rand-06): grenzen voor WebSocket-verbindingen op /agent/ws VÓÓR de aanmelding van de agent.
//
// Vroeger: elke upgrade naar /agent/ws werd aanvaard zonder enige limiet, en tot het eerste bericht (de aanmelding, 5 s) mocht een
// onbekende al een frame van 8 MiB sturen (maxPayload van de hele server). Een paar honderd zulke verbindingen met half verstuurde
// frames = gigabytes geheugen, zonder account en buiten elke rate limit om (de upgrade gaat niet door handle()).
//
// Nu:
//   • hoogstens VOORAUTH.totaal onaangemelde verbindingen tegelijk, en VOORAUTH.perIp per IP (IPv6: per /64) → anders 503;
//   • tot de aanmelding is een bericht hoogstens 64 KiB (het aanmeldbericht is een paar honderd bytes; ws sluit groter met 1009);
//   • pas NA de aanmelding geldt weer de gewone grens van de gateway (8 MiB, resultaten van opdrachten).
// De grens per bericht zetten we op de ontvanger van de ws-bibliotheek (_receiver._maxPayload, ws 8.x). Is die er niet (andere
// versie), dan valt alleen die ene maatregel weg; de tellers blijven werken.
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { limietSleutel } from '../shared/ip-limiet';

const getal = (v: unknown, standaard: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : standaard; };
export const VOORAUTH = {
  maxPayload: getal(process.env.AGENT_WS_VOORAUTH_MAX_BYTES, 64 * 1024),
  totaal: getal(process.env.AGENT_WS_VOORAUTH_TOTAAL, 200),
  perIp: getal(process.env.AGENT_WS_VOORAUTH_PER_IP, 10),
};

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', '']);
/** Zelfde regel als clientIp() in server/start.ts: cf-connecting-ip alleen als het verzoek via de lokale tunnel (loopback) komt. */
export function wsClientIp(req: IncomingMessage): string {
  const rauw = String(req.socket?.remoteAddress || '');
  const cf = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cf && LOOPBACK.has(rauw) && /^[0-9a-fA-F:.]{2,45}$/.test(cf)) return cf;
  return (rauw || 'unknown').replace(/^::ffff:/, '');
}

let totaal = 0;
const perIp = new Map<string, number>();
export const voorAuthStand = () => ({ totaal, perIp: perIp.size });

/** Plaats voor één onaangemelde verbinding, of null (vol). De teruggegeven functie geeft de plaats vrij (meermaals aanroepen mag). */
export function voorAuthToelaten(req: IncomingMessage): (() => void) | null {
  const sleutel = limietSleutel(wsClientIp(req)) || 'onbekend';
  const n = perIp.get(sleutel) ?? 0;
  if (totaal >= VOORAUTH.totaal || n >= VOORAUTH.perIp) return null;
  totaal += 1;
  perIp.set(sleutel, n + 1);
  let vrij = false;
  return () => {
    if (vrij) return;
    vrij = true;
    totaal = Math.max(0, totaal - 1);
    const rest = (perIp.get(sleutel) ?? 1) - 1;
    if (rest <= 0) perIp.delete(sleutel); else perIp.set(sleutel, rest);
  };
}

type MetOntvanger = { _receiver?: { _maxPayload?: number } };
/** Berichtgrens van deze ene verbinding zetten (ws 8.x). true = gelukt. */
export function zetBerichtGrens(ws: WebSocket, max: number): boolean {
  const r = (ws as unknown as MetOntvanger)._receiver;
  if (!r || typeof r._maxPayload !== 'number') return false;
  r._maxPayload = max;
  return true;
}
