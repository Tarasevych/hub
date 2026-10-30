// Beleid van de browserextensie per gebruiker (extensie 0.6, migratie 0073; shared/extensie-ontgrendeling.ts → ExtensieBeleid).
//
// Wat het beleid doet: elke ontgrendeling (prive en technisch) wordt erop gekapt — aan/uit per slot, welke caps (null = alle), hoe lang
// hoogstens, en of de lokale agent mag. De server controleert het opnieuw vóór elke browseropdracht (controleerBrowserOpdracht).
// Ontbreekt de rij, dan geldt STANDAARD_BELEID (alles aan). Lezen en schrijven via de systeemrol; wie mag schrijven beslist
// backend/extensie-beheer.ts (eigenaar of lopende activering met 'users.manage', nooit het beleid van de eigenaar door een ander).
import { getPool } from '../server/platform/pg';
import type { AiRuimte } from '../shared/ai-ruimte';
import {
  BROWSER_CAPS, isBrowserCap, MAX_MINUTEN, PRIVE_MAX_DAGEN, STANDAARD_BELEID,
  type BrowserCap, type ExtensieBeleid, type ExtensieBeleidInvoer,
} from '../shared/extensie-ontgrendeling';

const sys = () => getPool('systeem');
const capsUit = (v: unknown): BrowserCap[] | null => (Array.isArray(v) ? BROWSER_CAPS.filter((c) => (v as unknown[]).includes(c)) : null);

export function beleidUitRij(r: Record<string, any> | undefined | null): ExtensieBeleid {
  if (!r) return { ...STANDAARD_BELEID };
  return {
    priveAan: r.prive_aan !== false, technischAan: r.technisch_aan !== false,
    priveCaps: capsUit(r.prive_caps), technischCaps: capsUit(r.technisch_caps),
    priveMaxDagen: Math.min(PRIVE_MAX_DAGEN, Math.max(1, Number(r.prive_max_dagen) || PRIVE_MAX_DAGEN)),
    technischMaxMinuten: Math.min(MAX_MINUTEN, Math.max(5, Number(r.technisch_max_minuten) || MAX_MINUTEN)),
    lokaalAan: r.lokaal_aan !== false, notitie: String(r.notitie || ''),
    gewijzigdDoor: r.gewijzigd_door ? String(r.gewijzigd_door) : null, gewijzigdOp: r.gewijzigd_op ? new Date(r.gewijzigd_op).getTime() : null,
  };
}

/** Beleid van één gebruiker (standaard als er geen rij is). Gooit bij een DB-fout: wie afdwingt, weigert dan. */
export async function leesBeleid(userId: string): Promise<ExtensieBeleid> {
  return beleidUitRij((await sys().query('SELECT * FROM app.extensie_beleid WHERE user_id = $1', [userId])).rows[0]);
}
export async function leesBeleidVoor(userIds: string[]): Promise<Map<string, ExtensieBeleid>> {
  const m = new Map<string, ExtensieBeleid>();
  if (!userIds.length) return m;
  for (const r of (await sys().query('SELECT * FROM app.extensie_beleid WHERE user_id = ANY($1)', [userIds])).rows) m.set(String(r.user_id), beleidUitRij(r));
  return m;
}

/** Ligt het slot open volgens het beleid? */
export const ruimteAan = (b: ExtensieBeleid, ruimte: AiRuimte) => (ruimte === 'prive' ? b.priveAan : b.technischAan);
/** caps ∩ beleid van die ruimte (null = alle). */
export function capsBinnenBeleid(b: ExtensieBeleid, ruimte: AiRuimte, caps: readonly string[]): BrowserCap[] {
  const plafond = ruimte === 'prive' ? b.priveCaps : b.technischCaps;
  return BROWSER_CAPS.filter((c) => caps.includes(c) && (!plafond || plafond.includes(c)));
}
/** Langste duur (ms) die het beleid voor één ontgrendeling in deze ruimte toelaat. */
export const maxDuurMs = (b: ExtensieBeleid, ruimte: AiRuimte) => (ruimte === 'prive' ? b.priveMaxDagen * 86_400_000 : b.technischMaxMinuten * 60_000);

export class BeleidFout extends Error { constructor(public veld: string) { super(`BELEID_ONGELDIG:${veld}`); } }

const VELDEN = new Set(['priveAan', 'technischAan', 'priveCaps', 'technischCaps', 'priveMaxDagen', 'technischMaxMinuten', 'lokaalAan', 'notitie']);
/** Lijkt op een beleidsveld (tikfout als «priveCap»): weigeren in plaats van stil negeren — anders denkt de beheerder dat hij beperkte. */
const LIJKT_BELEID = /^(prive|technisch|lokaal|max|caps|beleid|notitie)/i;

/** Invoer controleren. Geeft alleen de meegegeven velden terug; andere sleutels (sessievelden van de route) blijven buiten beschouwing. */
export function valideerBeleidInvoer(input: Record<string, unknown>): ExtensieBeleidInvoer {
  for (const k of Object.keys(input)) if (!VELDEN.has(k) && LIJKT_BELEID.test(k)) throw new BeleidFout(k);
  const uit: ExtensieBeleidInvoer = {};
  const bool = (k: 'priveAan' | 'technischAan' | 'lokaalAan') => { if (input[k] === undefined) return; if (typeof input[k] !== 'boolean') throw new BeleidFout(k); uit[k] = input[k] as boolean; };
  bool('priveAan'); bool('technischAan'); bool('lokaalAan');
  const caps = (k: 'priveCaps' | 'technischCaps') => {
    if (input[k] === undefined) return;
    if (input[k] === null) { uit[k] = null; return; }
    if (!Array.isArray(input[k]) || (input[k] as unknown[]).length > BROWSER_CAPS.length || !(input[k] as unknown[]).every(isBrowserCap)) throw new BeleidFout(k);
    uit[k] = BROWSER_CAPS.filter((c) => (input[k] as unknown[]).includes(c));
  };
  caps('priveCaps'); caps('technischCaps');
  const getal = (k: 'priveMaxDagen' | 'technischMaxMinuten', min: number, max: number) => {
    if (input[k] === undefined) return;
    const n = input[k];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw new BeleidFout(k);
    uit[k] = n;
  };
  getal('priveMaxDagen', 1, PRIVE_MAX_DAGEN); getal('technischMaxMinuten', 5, MAX_MINUTEN);
  if (input.notitie !== undefined) {
    if (typeof input.notitie !== 'string' || input.notitie.length > 300 || /[\u0000-\u001f\u007f]/.test(input.notitie)) throw new BeleidFout('notitie');
    uit.notitie = input.notitie.trim();
  }
  return uit;
}

/** Opslaan (upsert, alleen de meegegeven velden). Geeft {voor, na}. */
export async function schrijfBeleid(userId: string, invoer: ExtensieBeleidInvoer, door: string): Promise<{ voor: ExtensieBeleid; na: ExtensieBeleid }> {
  const voor = await leesBeleid(userId);
  const na: ExtensieBeleid = { ...voor, ...invoer };
  const r = (await sys().query(`INSERT INTO app.extensie_beleid (user_id, prive_aan, technisch_aan, prive_caps, technisch_caps, prive_max_dagen, technisch_max_minuten, lokaal_aan, notitie, gewijzigd_door, gewijzigd_op)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (user_id) DO UPDATE SET prive_aan = EXCLUDED.prive_aan, technisch_aan = EXCLUDED.technisch_aan, prive_caps = EXCLUDED.prive_caps,
       technisch_caps = EXCLUDED.technisch_caps, prive_max_dagen = EXCLUDED.prive_max_dagen, technisch_max_minuten = EXCLUDED.technisch_max_minuten,
       lokaal_aan = EXCLUDED.lokaal_aan, notitie = EXCLUDED.notitie, gewijzigd_door = EXCLUDED.gewijzigd_door, gewijzigd_op = now()
     RETURNING *`,
    [userId, na.priveAan, na.technischAan, na.priveCaps, na.technischCaps, na.priveMaxDagen, na.technischMaxMinuten, na.lokaalAan, na.notitie.slice(0, 300), door.slice(0, 200)])).rows[0];
  return { voor, na: beleidUitRij(r) };
}
