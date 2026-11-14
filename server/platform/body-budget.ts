// SEC-002 (http-rand-06, keten-config-05): begrensd lezen van verzoeklichamen, VÓÓR routering en aanmelding.
//
// Vroeger las server/start.ts elk POST-lichaam op /api/* tot 12 MB in het geheugen, zonder vooraf Content-Length te bekijken,
// zonder plafond op het aantal gelijktijdige lichamen en met 120 s om een half lichaam vast te houden. Een anonieme aanvaller met
// een paar honderd trage POST's van 11,9 MB bracht de RSS van het proces tot gigabytes (OOM: proces of PostgreSQL weg).
//
// Nu, per verzoek:
//   1. Content-Length groter dan de grens → meteen 413, zonder één byte te lezen;
//   2. grens per soort: met Cookie of Authorization de gewone grens (12 MB); ZONDER (anoniem) 256 KB — publieke routes (aanmelden,
//      OAuth, koppelen, webhooks) hebben nooit meer nodig; uitzondering: de ondertekende GitHub-webhook;
//   3. hoogstens N lichamen tegelijk per IP (IPv6: per /64) → 429: anoniem 8, met Cookie/Authorization 64 (hmara-upload van een map);
//      «met Cookie/Authorization» telt pas na een goedkope controle dat de sessie of het token echt bestaat (body-aanmelding.ts),
//      en per IP hoogstens 96 MB gebufferd tegelijk (een vals of echt account neemt nooit het hele budget);
//   4. één budget voor ALLE lichamen die nu in het geheugen worden opgebouwd (256 MB) → 503 met Retry-After;
//   5. anoniem: het lichaam moet binnen 15 s binnen zijn (een half lichaam vasthouden kost dan geen twee minuten geheugen).
// Alles is in te stellen met omgevingsvariabelen (zie hieronder); de standaardwaarden passen bij de kleine VM (2 GB).
import type http from 'node:http';
import { limietSleutel } from '../../shared/ip-limiet';

export class BodyFout extends Error {
  constructor(public status: number, public code: string, public retryAfter = 0) { super(code); }
}
const getal = (v: unknown, standaard: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : standaard; };
export const BODY_GRENZEN = {
  max: getal(process.env.MAX_BODY_BYTES, 12 * 1024 * 1024),
  anoniem: getal(process.env.MAX_BODY_ANONIEM_BYTES, 256 * 1024),
  budget: getal(process.env.MAX_BODY_BUDGET_BYTES, 256 * 1024 * 1024),
  /** Anonieme lichamen (zonder Cookie en Authorization) tegelijk per IP. */
  perIp: getal(process.env.MAX_BODY_PER_IP, 8),
  /**
   * SEC-002 (toets g10e-toets-1): lichamen MET Cookie/Authorization tegelijk per IP. De hmara uploadt elk bestand in 3 stukken tegelijk
   * en een map is vele bestanden tegelijk (src/cloud-vnext/overdracht-beheer.ts); ook meerdere mensen achter één NAT. Die mogen
   * nooit op 8 vastlopen — het gezamenlijke budget (256 MB) blijft de eigenlijke geheugengrens.
   */
  perIpAangemeld: getal(process.env.MAX_BODY_PER_IP_AANGEMELD, 64),
  anoniemMs: getal(process.env.BODY_TIMEOUT_ANONIEM_MS, 15_000),
  /** SEC-002 (toets g10e-toets-2): hoogstens zoveel gebufferde bytes tegelijk per IP (/64) — één adres neemt nooit het hele budget in. */
  perIpBytes: getal(process.env.MAX_BODY_PER_IP_BYTES, 96 * 1024 * 1024),
  /** (toets g10e-toets-6) Lichamen tot deze grootte vallen nooit onder het budget of het bytesplafond per IP. */
  klein: getal(process.env.MAX_BODY_KLEIN_BYTES, 64 * 1024),
};
/**
 * SEC-002 (toets g10e-toets-2): controle of een Cookie/Bearer ECHT is (server/platform/body-aanmelding.ts, gezet door server/start.ts).
 * Zonder controle (losse tests van dit bestand) telt de aanwezigheid van de kop, zoals vroeger.
 */
let aanmeldControle: ((headers: http.IncomingHttpHeaders) => Promise<boolean>) | null = null;
export const zetAanmeldControle = (fn: typeof aanmeldControle) => { aanmeldControle = fn; };
/** Anonieme routes die wél een groot lichaam mogen sturen (ondertekend; de handtekening wordt pas na het lezen gecontroleerd). */
const GROOT_ANONIEM: readonly RegExp[] = [/^\/api\/github\/webhook\/[^/]+$/];

let inGebruik = 0;
const perIp = new Map<string, number>();
const bytesPerIp = new Map<string, number>();
/** Voor tests en diagnose: hoeveel bytes nu worden opgebouwd en door hoeveel lezers. */
export const bodyStand = () => ({ inGebruik, lezers: [...perIp.values()].reduce((a, b) => a + b, 0), ips: bytesPerIp.size });

export const isAnoniem = (headers: http.IncomingHttpHeaders) => !headers.cookie && !headers.authorization;
/** Aangemeld = een kop is er EN (met controle) hij hoort bij een echte sessie of een echt token. */
async function isAangemeld(headers: http.IncomingHttpHeaders): Promise<boolean> {
  if (isAnoniem(headers)) return false;
  if (!aanmeldControle) return true;
  try { return await aanmeldControle(headers); } catch { return false; }
}
export function bodyMax(aangemeld: boolean, pad: string): number {
  if (aangemeld || GROOT_ANONIEM.some((r) => r.test(pad))) return BODY_GRENZEN.max;
  return Math.min(BODY_GRENZEN.anoniem, BODY_GRENZEN.max);
}

/** Leest het lichaam met alle grenzen hierboven; gooit BodyFout (413/429/503/408/400). */
export async function leesBodyBegrensd(req: http.IncomingMessage, pad: string, ip: string): Promise<string> {
  const aangemeld = await isAangemeld(req.headers);
  const max = bodyMax(aangemeld, pad);
  const net = limietSleutel(ip) || 'onbekend';
  const lengteKop = req.headers['content-length'];
  if (lengteKop !== undefined) {
    const n = Number(lengteKop);
    if (!Number.isFinite(n) || n < 0) throw new BodyFout(400, 'BODY_LENGTH_INVALID');
    if (n > max) throw new BodyFout(413, 'BODY_TOO_LARGE');
    if (n > BODY_GRENZEN.klein && inGebruik + n > BODY_GRENZEN.budget) throw new BodyFout(503, 'SERVER_BUSY', 5);
    if (n > BODY_GRENZEN.klein && (bytesPerIp.get(net) ?? 0) + n > BODY_GRENZEN.perIpBytes) throw new BodyFout(429, 'TOO_MANY_BODY_BYTES', 5);
  }
  // Anoniem en aangemeld tellen apart, elk met een eigen plafond (een vloed van anonieme lichamen blokkeert de hmara-upload niet).
  const sleutel = `${aangemeld ? 'm' : 'a'}:${net}`;
  const lopend = perIp.get(sleutel) ?? 0;
  if (lopend >= (aangemeld ? BODY_GRENZEN.perIpAangemeld : BODY_GRENZEN.perIp)) throw new BodyFout(429, 'TOO_MANY_BODIES', 5);
  perIp.set(sleutel, lopend + 1);
  let eigen = 0;
  const timer = aangemeld ? null : setTimeout(() => req.destroy(new BodyFout(408, 'BODY_TIMEOUT')), BODY_GRENZEN.anoniemMs);
  timer?.unref?.();
  try {
    const delen: Buffer[] = [];
    for await (const deel of req) {
      const len = (deel as Buffer).length;
      if (eigen + len > max) throw new BodyFout(413, 'BODY_TOO_LARGE');
      // Kleine lichamen (aanmelden, OAuth, gewone JSON) worden nooit door het budget geweigerd: een vol budget mag het inloggen niet stoppen.
      if (eigen + len > BODY_GRENZEN.klein && inGebruik + len > BODY_GRENZEN.budget) throw new BodyFout(503, 'SERVER_BUSY', 5);
      if (eigen + len > BODY_GRENZEN.klein && (bytesPerIp.get(net) ?? 0) + len > BODY_GRENZEN.perIpBytes) throw new BodyFout(429, 'TOO_MANY_BODY_BYTES', 5);
      eigen += len; inGebruik += len;
      bytesPerIp.set(net, (bytesPerIp.get(net) ?? 0) + len);
      delen.push(deel as Buffer);
    }
    return Buffer.concat(delen).toString('utf8');
  } catch (e) {
    if (e instanceof BodyFout) throw e;
    throw new BodyFout(400, 'BODY_ABORTED');
  } finally {
    if (timer) clearTimeout(timer);
    inGebruik -= eigen;
    const over = (bytesPerIp.get(net) ?? 0) - eigen;
    if (over <= 0) bytesPerIp.delete(net); else bytesPerIp.set(net, over);
    const rest = (perIp.get(sleutel) ?? 1) - 1;
    if (rest <= 0) perIp.delete(sleutel); else perIp.set(sleutel, rest);
  }
}
