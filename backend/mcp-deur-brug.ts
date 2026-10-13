// Brug tussen de site en de MCP-deur (deploy/mcp/server.mjs, poort 8091) voor «Підключити в один клік».
//
// De deur blijft de enige die zijn tokens uitgeeft (hashes in zijn eigen toestand, geen database). De site doet alleen wat de deur
// niet kan: weten wie er aangemeld is. Daarom:
//   - de deur stuurt de browser met een verzoek-id (mrd_…) naar het venster «Дозволити» van de site;
//   - de site vraagt de deur via loopback om de gegevens van dat verzoek en geeft hem het besluit (met de gekozen duur en wie);
//   - de deur vraagt de site of een agenttoken tvh_… geldig is («Підключити вручну»).
// Beide richtingen gebruiken één willekeurige sleutel die de deur bij elke start in mcp-state/intern.sleutel zet (zelfde systeemgebruiker
// mijnruimte, 0640). /intern/* van de deur staat niet in de tunnelregel; /api/mcp/deur/token-check weigert alles met cf-koppen of niet
// van loopback. Zonder sleutel (deur niet gestart): netjes «DEUR_ONBEREIKBAAR», nooit stilletjes toegang.
import { timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isDuurId, type DuurId } from '../shared/ai-verbinding';

const sleutelPad = () => process.env.MCP_INTERN_SLEUTEL || '/srv/mijn-ruimte/mcp-state/intern.sleutel';
const deurUrl = () => process.env.MCP_DEUR_URL || 'http://127.0.0.1:8091';
export const isDeurRid = (rid: string) => /^mrd_[A-Za-z0-9_-]{20,60}$/.test(rid);

let cache: { sleutel: string; waarde: string } | null = null;
export async function internSleutel(): Promise<string> {
  try {
    const st = await stat(sleutelPad());
    const k = `${st.mtimeMs}:${st.size}:${st.ino}`;
    if (cache?.sleutel === k) return cache.waarde;
    const waarde = (await readFile(sleutelPad(), 'utf8')).trim();
    cache = { sleutel: k, waarde: /^[A-Za-z0-9_-]{40,100}$/.test(waarde) ? waarde : '' };
    return cache.waarde;
  } catch { cache = null; return ''; }
}

export class DeurFout extends Error { constructor(public code: string, public status = 502) { super(code); } }

async function deur(method: 'GET' | 'POST', pad: string, body?: unknown): Promise<{ status: number; data: any }> {
  const sleutel = await internSleutel();
  if (!sleutel) throw new DeurFout('DEUR_ONBEREIKBAAR', 503);
  let res: Response;
  try {
    res = await fetch(new URL(pad, deurUrl()), {
      method, headers: { 'x-mijn-ruimte-intern': sleutel, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(4000), redirect: 'manual',
    });
  } catch { throw new DeurFout('DEUR_ONBEREIKBAAR', 503); }
  let data: any = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

export type DeurVerzoek = { clientName: string; redirectHost: string; redirectSoort: 'web' | 'loopback' | 'app' | null; deur: string; resource: string; expiresAt: number; scope: string };
export async function deurVerzoek(rid: string): Promise<DeurVerzoek | null> {
  if (!isDeurRid(rid)) return null;
  const r = await deur('GET', `/intern/verzoek?rid=${encodeURIComponent(rid)}`);
  if (r.status === 404) return null;
  if (r.status !== 200 || !r.data) throw new DeurFout('DEUR_FOUT');
  return {
    clientName: String(r.data.clientName || 'MCP-client').slice(0, 80), redirectHost: String(r.data.redirectHost || '').slice(0, 200),
    redirectSoort: ['web', 'loopback', 'app'].includes(r.data.redirectSoort) ? r.data.redirectSoort : null,
    deur: String(r.data.deur || '').slice(0, 40), resource: String(r.data.resource || '').slice(0, 200), expiresAt: Number(r.data.expiresAt) || 0, scope: 'read',
  };
}
export async function deurBesluit(rid: string, approve: boolean, duur: DuurId, wie: { id: string; email?: string }): Promise<{ redirect: string } | null> {
  if (!isDeurRid(rid)) return null;
  const r = await deur('POST', '/intern/besluit', { rid, approve, duur: isDuurId(duur) ? duur : '1u', wie });
  if (r.status === 404) return null;
  if (r.status !== 200 || typeof r.data?.redirect !== 'string') throw new DeurFout('DEUR_FOUT');
  return { redirect: r.data.redirect };
}
export type DeurVerbinding = { id: string; klant: string; deur: string; duur: string; aangemaakt: number; laatst: number; accessTot: number; refreshTot: number; wie: { id: string; email: string } | null; via: string };
export async function deurVerbindingen(): Promise<DeurVerbinding[]> {
  const r = await deur('GET', '/intern/verbindingen');
  if (r.status !== 200 || !Array.isArray(r.data?.verbindingen)) throw new DeurFout('DEUR_FOUT');
  return r.data.verbindingen as DeurVerbinding[];
}
export async function deurIntrekken(id: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return false;
  const r = await deur('POST', '/intern/intrekken', { id });
  return r.status === 200;
}

/** Komt dit verzoek van de deur zelf? (loopback, geen tunnelkoppen, juiste sleutel; tijdconstant vergeleken) */
export async function vanDeur(headers: Record<string, string | undefined>): Promise<boolean> {
  const h = (n: string) => String(headers[n] ?? '');
  if (h('cf-connecting-ip') || h('cf-ray')) return false;
  const ip = h('x-forwarded-for').replace(/^::ffff:/, '');
  if (ip !== '127.0.0.1' && ip !== '::1') return false;
  const sleutel = await internSleutel();
  const got = h('x-mijn-ruimte-intern');
  if (!sleutel || !got) return false;
  const a = Buffer.from(sleutel), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
