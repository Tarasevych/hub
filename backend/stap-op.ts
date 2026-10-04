// Step-up (opnieuw bevestigen) voor gevoelige acties (beveiliging fase 3).
// Een actie mag als binnen 5 minuten op DEZE sessie (sessie-id, tab-overlay of anker):
//   a) een Google-aanmelding is afgerond waarvan Google zelf bevestigt (auth_time in het id_token) dat de
//      gebruiker zich minder dan 5 minuten geleden echt heeft aangemeld. Onthouden browser (complete-remembered)
//      en handoff tellen nooit: daar is geen nieuw id_token. (Audit-fix 5.)
//   b) een geldige TOTP-code is ingevoerd via POST /api/owner/access/stap-op.
// Opt-in noodpad: STAP_OP_GOOGLE_ZONDER_AUTH_TIME=1 laat een expliciete step-up-transactie (prompt=login) zonder
// auth_time-claim tellen als het OAuth-verloop binnen 5 minuten na de start is afgerond. Standaard uit.
// Noodschakelaar: STAP_OP_UIT=1 (alles mag weer zonder step-up, zoals vóór fase 3).
// Opslag: één record per account in owner_step_up_v1 (eigen rij → werkt onder RLS).
import { db } from '../server/platform';

export const STAP_OP_TABEL = 'owner_step_up_v1';
export const STAP_OP_MS = 5 * 60 * 1000;
type StapOpRecord = { id: string; userId: string; googleAt?: number; sessies?: Record<string, number>; updatedAt: number };
const TOEKOMST_SPELING_MS = 60 * 1000;
export type StapOpSessie = { id: string; createdAt: number };
export type StapOpAuth = { user: { id: string }; session?: StapOpSessie | null; tabSession?: StapOpSessie | null };

export const stapOpUit = () => process.env.STAP_OP_UIT === '1';
const sessieVan = (auth: StapOpAuth): StapOpSessie | null => auth.tabSession || auth.session || null;

async function recordVan(userId: string): Promise<StapOpRecord | null> {
  const rows = await db.list<Omit<StapOpRecord, 'id'>>(STAP_OP_TABEL, { filter: { userId }, limit: 1 });
  return (rows.items[0] as StapOpRecord | undefined) || null;
}
async function schrijf(userId: string, wijzig: (r: Omit<StapOpRecord, 'id'>) => Omit<StapOpRecord, 'id'>) {
  const bestaand = await recordVan(userId);
  const nu = Date.now();
  const basis: Omit<StapOpRecord, 'id'> = bestaand ? (({ id: _id, ...rest }) => rest)(bestaand) : { userId, sessies: {}, updatedAt: nu };
  const volgend = wijzig({ ...basis, sessies: Object.fromEntries(Object.entries(basis.sessies || {}).filter(([, at]) => nu - at < STAP_OP_MS)), updatedAt: nu });
  if (bestaand) await db.update(STAP_OP_TABEL, [{ id: bestaand.id, record: volgend }]);
  else await db.add(STAP_OP_TABEL, [volgend]);
}

/** Is een Google auth_time (ms) vers genoeg voor step-up? */
export function googleAuthTijdVers(authTimeMs: number, nu = Date.now()): boolean {
  return Number.isFinite(authTimeMs) && authTimeMs > 0 && authTimeMs <= nu + TOEKOMST_SPELING_MS && nu - authTimeMs < STAP_OP_MS;
}
/**
 * Aanroepen nadat een Google-aanmelding sessie(s) heeft opgeleverd. Legt step-up vast voor precies die sessie-id's,
 * alleen als auth_time vers is. Tijdstip = auth_time (dus de 5 minuten lopen vanaf de echte aanmelding).
 */
export async function googleStapOpVastleggen(userId: string, sessieIds: Array<string | null | undefined>, authTimeMs: number): Promise<boolean> {
  const ids = sessieIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (!ids.length || !googleAuthTijdVers(authTimeMs)) return false;
  const at = Math.min(authTimeMs, Date.now());
  await schrijf(userId, (r) => { const { googleAt: _oud, ...rest } = r; return { ...rest, sessies: { ...(r.sessies || {}), ...Object.fromEntries(ids.map((id) => [id, at])) } }; });
  return true;
}
/** Aanroepen na een geldige TOTP-code op deze sessie. */
export async function totpStapOpVastleggen(auth: StapOpAuth): Promise<void> {
  const s = sessieVan(auth);
  if (!s) return;
  await schrijf(auth.user.id, (r) => ({ ...r, sessies: { ...(r.sessies || {}), [s.id]: Date.now() } }));
}

/** Is de step-up voor deze sessie nog vers? */
export async function stapOpGeldig(auth: StapOpAuth, nu = Date.now()): Promise<boolean> {
  if (stapOpUit()) return true;
  const s = sessieVan(auth);
  if (!s) return false;
  const r = await recordVan(auth.user.id);
  if (!r) return false;
  // Alleen per sessie-id (Google met verse auth_time of TOTP). Het oude account-brede googleAt telt niet meer.
  const at = Number(r.sessies?.[s.id] || 0);
  return at > 0 && nu - at < STAP_OP_MS;
}

/** Foutcode als step-up nodig is, anders ''. 403 (geen 401: de sessie zelf is geldig). */
export async function stapOpFout(auth: StapOpAuth): Promise<'' | 'STEP_UP_REQUIRED'> {
  return (await stapOpGeldig(auth)) ? '' : 'STEP_UP_REQUIRED';
}
