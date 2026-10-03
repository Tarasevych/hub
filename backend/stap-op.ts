// Step-up (opnieuw bevestigen) voor gevoelige acties (beveiliging fase 3).
// Een actie mag als binnen 5 minuten:
//   a) een echte Google-aanmelding van dit account is afgerond (OAuth-callback) EN de huidige sessie daarna
//      is ontstaan (dus uit die aanmelding komt; een oude, gestolen sessie telt niet), of
//   b) op deze sessie een geldige TOTP-code is ingevoerd via POST /api/owner/access/stap-op.
// Noodschakelaar: STAP_OP_UIT=1 (alles mag weer zonder step-up, zoals vóór fase 3).
// Opslag: één record per account in owner_step_up_v1 (eigen rij → werkt onder RLS).
import { db } from '../server/platform';

export const STAP_OP_TABEL = 'owner_step_up_v1';
export const STAP_OP_MS = 5 * 60 * 1000;
const SPELING_MS = 60 * 1000;
type StapOpRecord = { id: string; userId: string; googleAt?: number; sessies?: Record<string, number>; updatedAt: number };
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

/** Aanroepen na een afgeronde Google-aanmelding (transactie compleet). */
export async function googleAanmeldingVastleggen(userId: string, at = Date.now()): Promise<void> {
  await schrijf(userId, (r) => ({ ...r, googleAt: at }));
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
  const viaGoogle = !!r.googleAt && nu - r.googleAt < STAP_OP_MS && Number(s.createdAt || 0) >= r.googleAt - SPELING_MS;
  const viaTotp = !!r.sessies?.[s.id] && nu - r.sessies[s.id] < STAP_OP_MS;
  return viaGoogle || viaTotp;
}

/** Foutcode als step-up nodig is, anders ''. 403 (geen 401: de sessie zelf is geldig). */
export async function stapOpFout(auth: StapOpAuth): Promise<'' | 'STEP_UP_REQUIRED'> {
  return (await stapOpGeldig(auth)) ? '' : 'STEP_UP_REQUIRED';
}
