// APPARAAT-001 — de snelle stroom naar de tabbladen van één account: GET /api/owner/stroom met Accept: text/event-stream (SSE).
//
// Waarom: de bel van het meldingencentrum vraagt maar om de 5 minuten; het venster «Це ви?» op het andere apparaat moet er
// binnen een seconde staan. Zelfde opzet als backend/connector-v2-stroom.ts: de router kan geen open verbinding vasthouden,
// dus server/start.ts geeft het verzoek vóór de routering hierheen. De sessiecontrole is dezelfde als voor elke route
// (backend/index.ts registreert hem); zonder geldige sessie: 401 en geen stroom. Per stroom onthouden we alleen userId en het
// anker (de browser), zodat een verzoek van apparaat A niet naar A zelf gaat. Hartslag als commentaarregel voor de tunnel.
// Valt de stroom weg, dan vraagt de browser gewoon om de 5 s (src/apparaat-bevestiging/stroom.ts): de stroom is versnelling,
// geen voorwaarde.
import type http from 'node:http';
import type { StroomGebeurtenis } from '../../shared/apparaat-bevestiging/model';
import { metVerzoek } from '../../server/platform/context';

const HARTSLAG_MS = 25_000;
const MAX_STROMEN = 300;
const MAX_PER_GEBRUIKER = 8;
/**
 * SEC-002 (http-rand-08): hoogste leeftijd van één stroom. Daarna sluit de server hem; de browser verbindt vanzelf opnieuw
 * (src/apparaat-bevestiging/stroom.ts) en krijgt dan een verse sessiecontrole. Zo leeft geen stroom eindeloos door.
 */
export const STROOM_MAX_LEEFTIJD_MS = 15 * 60_000;

type Stroom = { userId: string; anker: string; res: http.ServerResponse; geopend: number; sluit: () => void; event: Record<string, unknown>; body: unknown; bezig: boolean };
const stromen = new Set<Stroom>();

export type StroomAuth = (event: Record<string, unknown>, body: unknown) => Promise<{ userId: string; anker: string } | { fout: string }>;
let authenticeer: StroomAuth | null = null;
/** backend/index.ts registreert de sessiecontrole; zonder registratie (tests, oude server) is de stroom gesloten (503). */
export function registreerStroomAuth(fn: StroomAuth | null): void { authenticeer = fn; }

const schrijf = (s: Stroom, tekst: string): boolean => { try { return s.res.write(tekst); } catch { return false; } };

/** Eén gebeurtenis naar alle open stromen van deze gebruiker (optioneel niet naar één anker). Geeft het aantal bereikte stromen. */
export function publiceer(userId: string, g: StroomGebeurtenis, o: { behalveAnker?: string } = {}): number {
  let n = 0;
  const regel = `event: ${g.soort}\ndata: ${JSON.stringify(g)}\n\n`;
  for (const s of stromen) {
    if (s.userId !== userId) continue;
    if (o.behalveAnker && s.anker === o.behalveAnker) continue;
    if (schrijf(s, regel)) n++;
  }
  return n;
}
export const openStromen = (userId?: string): number => [...stromen].filter((s) => !userId || s.userId === userId).length;
export function sluitAlleStromenApparaat(): void { for (const s of [...stromen]) s.sluit(); }
/**
 * SEC-002 (http-rand-08): sluit meteen de stromen van één gebruiker (optioneel alleen die van één anker = één browser).
 * Aan te roepen waar sessies worden ingetrokken (één sessie, «overal afmelden», blokkeren); geeft het aantal gesloten stromen.
 */
export function sluitStromenVan(userId: string, anker?: string): number {
  let n = 0;
  for (const s of [...stromen]) { if (s.userId !== userId || (anker && s.anker !== anker)) continue; s.sluit(); n++; }
  return n;
}

/**
 * SEC-002 (http-rand-08): de sessie werd alleen bij het openen gecontroleerd; wie daarna afmeldde, «overal afmelden» koos of
 * geblokkeerd werd, bleef gebeurtenissen («Це ви?») ontvangen. Nu bij elke hartslag opnieuw dezelfde sessiecontrole (in een
 * eigen verzoekcontext, zoals server/start.ts dat bij het openen doet). Faalt die, kan zij niet draaien of hoort de sessie
 * intussen bij een ander account/anker: stroom dicht. true = gesloten.
 */
async function controleer(s: Stroom, nu: number): Promise<boolean> {
  if (!stromen.has(s)) return false;
  if (nu - s.geopend >= STROOM_MAX_LEEFTIJD_MS) { s.sluit(); return true; }
  if (s.bezig) return false;
  const auth = authenticeer;
  if (!auth) { s.sluit(); return true; }
  s.bezig = true;
  try {
    const bron = ((s.event.requestContext || {}) as { http?: { sourceIp?: string; userAgent?: string } }).http || {};
    const a = await metVerzoek('GET /api/owner/stroom', () => auth(s.event, s.body), { ip: bron.sourceIp, ua: bron.userAgent });
    if ('fout' in a || a.userId !== s.userId || a.anker !== s.anker) { s.sluit(); return true; }
    return false;
  } catch { s.sluit(); return true; } finally { s.bezig = false; }
}
/** Alleen voor tests: de controle van de hartslag nu uitvoeren voor alle open stromen (`nu` om de leeftijdsgrens te toetsen). */
export async function _controleerStromen(nu = Date.now()): Promise<number> {
  let n = 0;
  for (const s of [...stromen]) if (await controleer(s, nu)) n++;
  return n;
}

/** Het verzoek zelf (server/start.ts): controleert de sessie, zet koppen, houdt de verbinding open, ruimt op bij sluiten. */
export async function stroomVerzoekApparaat(req: http.IncomingMessage, res: http.ServerResponse, event: Record<string, unknown>, body: unknown): Promise<void> {
  const weiger = (status: number, code: string) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: code, reasonCode: code })); };
  if (!authenticeer) return weiger(503, 'STROOM_NIET_BESCHIKBAAR');
  let auth: Awaited<ReturnType<StroomAuth>>;
  try { auth = await authenticeer(event, body); } catch { return weiger(401, 'OWNER_SESSION_REQUIRED'); }
  if ('fout' in auth) return weiger(401, auth.fout);
  if (stromen.size >= MAX_STROMEN || openStromen(auth.userId) >= MAX_PER_GEBRUIKER) return weiger(429, 'TE_VEEL_STROMEN');
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(': stroom open\n\n');
  const s: Stroom = { userId: auth.userId, anker: auth.anker, res, geopend: Date.now(), event, body, bezig: false, sluit: () => { stromen.delete(s); clearInterval(hart); try { res.end(); } catch { /* al dicht */ } } };
  const hart = setInterval(() => {
    if (!schrijf(s, `: hartslag ${new Date().toISOString()}\n\n`)) { s.sluit(); return; }
    void controleer(s, Date.now()); // SEC-002 (http-rand-08): sessie opnieuw controleren + leeftijdsgrens
  }, HARTSLAG_MS);
  (hart as { unref?: () => void }).unref?.();
  stromen.add(s);
  req.on('close', s.sluit);
  req.on('error', s.sluit);
}
