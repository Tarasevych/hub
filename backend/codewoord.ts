// Кодове слово: scrypt + перець з середовища. Значення в журнал не пишеться.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getPool } from '../server/platform/pg';
import { CODEWOORD_BLOK_MS, CODEWOORD_MAX_MISLUKT, codewoordSterk, normaliseerCodewoord, pogingToegestaan } from '../shared/codewoord';
import { codewoordSessieId, loginVers } from '../shared/codewoord-poort';
import { codewoordStapOpVastleggen, type StapOpAuth } from './stap-op';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>;
const TBL = 'codewoord_v1';
const N = 16384, R = 8, P = 1;

type Rij = { userId: string; salt: string; hash: string; n: number; r: number; p: number; mislukt: number; geblokkeerdTot: number; updatedAt: number; loginSessies?: Record<string, number> };

export const peperActief = () => !!process.env.CODEWOORD_PEPER;

const materiaal = (woord: string) => `${normaliseerCodewoord(woord)}\0${process.env.CODEWOORD_PEPER || ''}`;
const idVan = (userId: string) => `codewoord:${userId}`;

async function lees(userId: string): Promise<Rij | null> {
  const r = await getPool().query('SELECT data FROM app.records WHERE tbl = $1 AND id = $2', [TBL, idVan(userId)]);
  const d = r.rows[0]?.data as Rij | undefined;
  return d && d.hash ? d : null;
}

async function schrijf(rij: Rij) {
  await getPool().query(
    `INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (tbl, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [TBL, idVan(rij.userId), JSON.stringify(rij)],
  );
}

export async function codewoordHeeft(userId: string): Promise<boolean> {
  return !!(await lees(userId));
}

export async function codewoordZetten(userId: string, woord: string, email: string, huidig?: string): Promise<'ZWAK' | 'ONJUIST' | 'GEBLOKKEERD' | 'OK'> {
  if (!codewoordSterk(woord, email)) return 'ZWAK';
  const bestaand = await lees(userId);
  if (bestaand) {
    const c = await codewoordControleren(userId, huidig || '');
    if (!c.ok) return c.code === 'GEBLOKKEERD' ? 'GEBLOKKEERD' : 'ONJUIST';
  }
  const salt = randomBytes(16);
  const hash = await scryptAsync(materiaal(woord), salt, 32, { N, r: R, p: P });
  await schrijf({ userId, salt: salt.toString('base64url'), hash: hash.toString('base64url'), n: N, r: R, p: P, mislukt: 0, geblokkeerdTot: 0, updatedAt: Date.now(), loginSessies: bestaand?.loginSessies });
  return 'OK';
}

export async function codewoordControleren(userId: string, woord: string): Promise<{ ok: true } | { ok: false; code: 'ONJUIST' | 'GEBLOKKEERD' | 'NIET_INGESTELD'; wachtMs?: number }> {
  const rij = await lees(userId);
  if (!rij) return { ok: false, code: 'NIET_INGESTELD' };
  const nu = Date.now();
  const poort = pogingToegestaan(rij.mislukt, rij.geblokkeerdTot, nu);
  if (!poort.ok) return { ok: false, code: 'GEBLOKKEERD', wachtMs: poort.wachtMs };
  const mislukt = rij.geblokkeerdTot > 0 && rij.geblokkeerdTot <= nu ? 0 : rij.mislukt;
  const hash = await scryptAsync(materiaal(woord), Buffer.from(rij.salt, 'base64url'), 32, { N: rij.n || N, r: rij.r || R, p: rij.p || P });
  const verwacht = Buffer.from(rij.hash, 'base64url');
  const gelijk = hash.length === verwacht.length && timingSafeEqual(hash, verwacht);
  if (gelijk) { await schrijf({ ...rij, mislukt: 0, geblokkeerdTot: 0, updatedAt: nu }); return { ok: true }; }
  const volgende = mislukt + 1;
  await schrijf({ ...rij, mislukt: volgende, geblokkeerdTot: volgende >= CODEWOORD_MAX_MISLUKT ? nu + CODEWOORD_BLOK_MS : 0, updatedAt: nu });
  return { ok: false, code: 'ONJUIST' };
}

/** null = кодового слова немає, стирати можна. Інакше код помилки для відповіді 403. */
export async function codewoordEis(userId: string, woord: unknown): Promise<null | 'CODEWOORD_ONJUIST' | 'CODEWOORD_GEBLOKKEERD' | 'CODEWOORD_VERPLICHT'> {
  if (!(await codewoordHeeft(userId))) return null;
  if (typeof woord !== 'string' || !woord) return 'CODEWOORD_VERPLICHT';
  const c = await codewoordControleren(userId, woord);
  if (c.ok) return null;
  if (c.code === 'GEBLOKKEERD') return 'CODEWOORD_GEBLOKKEERD';
  return 'CODEWOORD_ONJUIST';
}

/** true = слово задане, а ця сесія його ще не назвала. Немає рядка — ворота зачинені. */
export async function codewoordPoortOpen(userId: string, sessieId: string): Promise<boolean> {
  const rij = await lees(userId);
  if (!rij) return false;
  return !loginVers(Number(rij.loginSessies?.[sessieId] || 0), Date.now());
}

/** Після правильного слова на цьому вході. Старі сесії відпадають самі. */
export async function codewoordLoginVastleggen(userId: string, sessieId: string): Promise<void> {
  if (!sessieId) return;
  const rij = await lees(userId);
  if (!rij) return;
  const nu = Date.now();
  const loginSessies = Object.fromEntries(
    Object.entries({ ...(rij.loginSessies || {}), [sessieId]: nu }).filter(([, at]) => loginVers(Number(at), nu)).slice(-40),
  );
  await schrijf({ ...rij, loginSessies, updatedAt: nu });
}

export { codewoordRouteVrij, codewoordSessieId } from '../shared/codewoord-poort';

type Ctx = { event: unknown; body: unknown };
type Auth = { user: { id: string; email: string } } | { errorCode: string };
type VolAuth = { user: { id: string; email: string }; session?: { id: string; userId: string }; tabSession?: { id: string; userId: string } | null };
export function codewoordRoutes(deps: {
  requireSession: (event: unknown, body: unknown) => Promise<Auth>;
  fail: (code: string, status: number) => unknown;
  ok: (data: unknown) => unknown;
  body: (body: unknown) => Record<string, unknown>;
  stepUp: (ctx: Ctx, auth: Auth) => Promise<unknown>;
}) {
  const metSessie = (run: (user: { id: string; email: string }, body: Record<string, unknown>, ctx: Ctx, auth: VolAuth) => Promise<unknown>) => async (ctx: Ctx) => {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return deps.fail(auth.errorCode, 401);
    const stap = await deps.stepUp(ctx, auth);
    if (stap) return stap;
    return run(auth.user, deps.body(ctx.body), ctx, auth as VolAuth);
  };
  const sessieVan = (auth: VolAuth) => codewoordSessieId({
    userId: auth.user.id, anchorUserId: auth.session?.userId, anchorId: auth.session?.id, tabUserId: auth.tabSession?.userId, tabId: auth.tabSession?.id,
  });
  return {
    'POST /api/owner/identity/codewoord/zetten': [metSessie(async (user, body, _ctx, auth) => {
      const uit = await codewoordZetten(user.id, String(body.woord || ''), user.email, typeof body.huidig === 'string' ? body.huidig : '');
      if (uit !== 'OK') return deps.fail(uit === 'ZWAK' ? 'CODEWOORD_ZWAK' : uit === 'GEBLOKKEERD' ? 'CODEWOORD_GEBLOKKEERD' : 'CODEWOORD_ONJUIST', 400);
      await codewoordLoginVastleggen(user.id, sessieVan(auth));
      return deps.ok({ ok: true, codewoordPoort: false });
    })],
    'POST /api/owner/identity/codewoord/controleren': [metSessie(async (user, body) => {
      const c = await codewoordControleren(user.id, String(body.woord || ''));
      if (!c.ok) return deps.fail(c.code === 'NIET_INGESTELD' ? 'CODEWOORD_NIET_INGESTELD' : c.code === 'GEBLOKKEERD' ? 'CODEWOORD_GEBLOKKEERD' : 'CODEWOORD_ONJUIST', 403);
      return deps.ok({ ok: true });
    })],
    'POST /api/owner/session/codewoord': [async (ctx: Ctx) => {
      const auth = await deps.requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth) return deps.fail(auth.errorCode, 401);
      const vol = auth as VolAuth;
      const c = await codewoordControleren(vol.user.id, String(deps.body(ctx.body).woord || ''));
      if (!c.ok) return deps.fail(c.code === 'NIET_INGESTELD' ? 'CODEWOORD_NIET_INGESTELD' : c.code === 'GEBLOKKEERD' ? 'CODEWOORD_GEBLOKKEERD' : 'CODEWOORD_ONJUIST', 403);
      const sid = sessieVan(vol);
      await codewoordLoginVastleggen(vol.user.id, sid);
      await codewoordStapOpVastleggen({ user: { id: vol.user.id }, session: vol.session, tabSession: vol.tabSession } as StapOpAuth);
      return deps.ok({ ok: true, codewoordPoort: false });
    }],
  };
}
