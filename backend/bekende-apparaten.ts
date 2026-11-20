// IDENTITEIT-015 (крок apparaten-uitvoer): «Сесії та пристрої» → «Попереджати про новий пристрій».
//
// (1) Вибір людини «Завжди / Вимкнено» — поле `nieuwApparaatMelding` у записі облікового запису (users, JSON). Старі записи без поля
//     = «Завжди» (попередження безпеки типово увімкнене). Вимкнення — повторне підтвердження доступу (ніколи не запам'ятовується),
//     аудит і сповіщення безпеки; увімкнення — аудит і сповіщення без підтвердження (воно лише посилює захист).
//     backend/nieuw-apparaat.ts читає цей вибір під час кожного входу: «Вимкнено» → без спливного сповіщення, але запис у журналі
//     безпеки (app.audit) лишається завжди.
// (2) Перелік відомих пристроїв (app.bekende_apparaten, міграція 0192, RLS за user_id) — лише власні рядки; «Цей пристрій» за
//     хешем cookie пристрою; «Це був я» (bevestigd_op) і «Забути пристрій» (рядок видаляється → наступний вхід із нього знову
//     дає попередження). Забути — з підтвердженням доступу, аудитом і сповіщенням; повтор того самого id — ok без нового сповіщення.
//
// Keuze «Altijd / Uit» voor de melding over een nieuw apparaat (veld in het accountrecord; zonder veld = altijd) en de lijst van
// bekende apparaten met «Dit was ik» en «Apparaat vergeten». Rechten op de server, audit, melding; uitzetten en vergeten met step-up.
import { error, json, rateLimit } from '../server/platform';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { magEigenToegang } from '../shared/eigen-toegang';
import { apparaatCookieHash } from './apparaat-cookie';
import { meldBeveiligingsWijziging } from './beveiliging-meldingen';
import { gebruikerVeldenZetten } from './gebruiker-schrijven';
import { apparaatCookieSleutel, bekendBevestigen } from './nieuw-apparaat';

export type ApparaatKeuze = 'altijd' | 'uit';
/** Veldnaam in het accountrecord. Ontbreekt het veld (oude records), dan geldt «altijd». */
export const KEUZE_VELD = 'nieuwApparaatMelding';
export const keuzeVan = (v: unknown): ApparaatKeuze => (v === 'uit' ? 'uit' : 'altijd');
/** Zoveel keuzewijzigingen per uur per account (anders een stroom meldingen). */
export const KEUZE_PER_UUR = 20;
/** Zoveel «vergeten» per uur per account. */
export const VERGETEN_PER_UUR = 30;
const UUID = /^[0-9a-f-]{36}$/i;
const sys = () => getPool('systeem');

/** De huidige keuze uit de database (niet uit een momentopname van het verzoek). Fout → «altijd» (veilige kant). */
export async function apparaatKeuzeLezen(userId: string): Promise<ApparaatKeuze> {
  try {
    const r = await sys().query("SELECT data->>'nieuwApparaatMelding' AS k FROM app.records WHERE tbl = 'users' AND id = $1", [String(userId || '')]);
    return keuzeVan(r.rows[0]?.k);
  } catch { return 'altijd'; }
}

export type BekendApparaat = { id: string; apparaat: string; eerstGezien: string; laatstGezien: string; bevestigdOp: string | null; ditApparaat: boolean };
/** Eigen bekende apparaten, laatst gezien eerst (max. 100). `huidigeSleutel`: sleutel van de browser van dit verzoek. */
export async function bekendeApparatenLijst(userId: string, huidigeSleutel = ''): Promise<BekendApparaat[]> {
  const r = await sys().query(
    'SELECT id, sleutel, apparaat, eerst_gezien, laatst_gezien, bevestigd_op FROM app.bekende_apparaten WHERE user_id = $1 ORDER BY laatst_gezien DESC LIMIT 100',
    [userId]);
  return r.rows.map((x) => ({
    id: String(x.id), apparaat: String(x.apparaat || ''),
    eerstGezien: new Date(x.eerst_gezien).toISOString(), laatstGezien: new Date(x.laatst_gezien).toISOString(),
    bevestigdOp: x.bevestigd_op ? new Date(x.bevestigd_op).toISOString() : null,
    ditApparaat: !!huidigeSleutel && x.sleutel === huidigeSleutel,
  }));
}

/** Eén eigen apparaat vergeten. Onbekend of al weg → { vergeten: false } (herhaling is veilig). */
export async function apparaatVergeten(userId: string, id: unknown): Promise<{ vergeten: boolean; apparaat: string }> {
  if (!userId || !UUID.test(String(id || ''))) return { vergeten: false, apparaat: '' };
  const r = await sys().query('DELETE FROM app.bekende_apparaten WHERE id = $1 AND user_id = $2 RETURNING apparaat', [String(id), userId]);
  return { vergeten: r.rows.length > 0, apparaat: String(r.rows[0]?.apparaat || '') };
}

type SessionOk = { user: { id: string; status?: string; role?: string }; service: string; session?: { id: string; createdAt: number } | null; tabSession?: { id: string; createdAt: number } | null };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
export type ApparatenDeps = {
  /** Verse bevestiging van toegang (stapOpVereist in backend/index.ts); null = in orde, anders het 403-antwoord. */
  stepUp: (ctx: Ctx, auth: SessionOk) => Promise<Resp | null>;
  audit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown>;
  /** Vlag `meldingen-uitleg-v3` voor dit account (de melding zelf hangt daar nog van af). */
  vlagAan: (userId: string) => Promise<boolean>;
};
const DIENSTEN: ReadonlySet<string> = new Set(['identity', 'hub']);

export function bekendeApparatenRoutes(requireSession: RequireSession, deps: ApparatenDeps): Record<string, RouterMiddleware[]> {
  const route = (run: (ctx: Ctx, auth: SessionOk, d: Record<string, unknown>) => Promise<Resp>): RouterMiddleware[] => [(async (raw: unknown) => {
    const ctx = raw as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error('OWNER_IDENTITY_SESSION_REQUIRED', 401);
    if (!DIENSTEN.has(auth.service)) return error('OWNER_IDENTITY_SESSION_REQUIRED', 401);
    if (!magEigenToegang(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    return run(ctx, auth, (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>);
  }) as unknown as RouterMiddleware];
  const stand = async (ctx: Ctx, userId: string) => {
    const keuze = await apparaatKeuzeLezen(userId);
    const vlag = await deps.vlagAan(userId).catch(() => false);
    const cookie = apparaatCookieHash(ctx.event);
    return { ok: true, keuze, vlag, meldingActief: vlag && keuze === 'altijd', apparaten: await bekendeApparatenLijst(userId, cookie ? apparaatCookieSleutel(userId, cookie) : '') };
  };
  return {
    'POST /api/owner/identity/apparaten/lijst': route(async (ctx, auth) => json(await stand(ctx, auth.user.id))),
    'POST /api/owner/identity/apparaten/melding': route(async (ctx, auth, d) => {
      if (d.keuze !== 'altijd' && d.keuze !== 'uit') return error('KEUZE_ONGELDIG', 400);
      const naar: ApparaatKeuze = d.keuze;
      const van = await apparaatKeuzeLezen(auth.user.id);
      // Herhaling of een tweede tabblad: niets te doen, geen step-up, geen nieuwe melding.
      if (van === naar) return json({ ...(await stand(ctx, auth.user.id)), gewijzigd: false });
      if (naar === 'uit') { const stap = await deps.stepUp(ctx, auth); if (stap) return stap; }
      const limiet = await rateLimit(`apparaat-melding:${auth.user.id}`, KEUZE_PER_UUR, 3600, { failClosed: true });
      if (!limiet.ok) return error('RATE_LIMITED', 429, { retryAfter: limiet.retryAfter, maxAttempts: KEUZE_PER_UUR, windowSec: 3600 });
      if (!(await gebruikerVeldenZetten(auth.user.id, { [KEUZE_VELD]: naar, updatedAt: Date.now() }))) return error('KEUZE_OPSLAAN_MISLUKT', 500);
      await deps.audit(auth.user.id, 'owner.apparaat.melding', 'success', { van, naar });
      await meldBeveiligingsWijziging(auth.user.id, naar === 'uit' ? 'apparaat-melding-uit' : 'apparaat-melding-aan');
      return json({ ...(await stand(ctx, auth.user.id)), gewijzigd: true });
    }),
    'POST /api/owner/identity/apparaten/vergeten': route(async (ctx, auth, d) => {
      if (!UUID.test(String(d.id || ''))) return error('APPARAAT_ONBEKEND', 400);
      const stap = await deps.stepUp(ctx, auth); if (stap) return stap;
      const limiet = await rateLimit(`apparaat-vergeten:${auth.user.id}`, VERGETEN_PER_UUR, 3600, { failClosed: true });
      if (!limiet.ok) return error('RATE_LIMITED', 429, { retryAfter: limiet.retryAfter, maxAttempts: VERGETEN_PER_UUR, windowSec: 3600 });
      const r = await apparaatVergeten(auth.user.id, d.id);
      if (r.vergeten) {
        await deps.audit(auth.user.id, 'owner.apparaat.vergeten', 'success', { id: String(d.id), apparaat: r.apparaat });
        await meldBeveiligingsWijziging(auth.user.id, 'apparaat-vergeten', { apparaat: r.apparaat || '—' });
      }
      return json({ ...(await stand(ctx, auth.user.id)), vergeten: r.vergeten });
    }),
    'POST /api/owner/identity/apparaten/bevestigen': route(async (ctx, auth, d) => {
      const al = (await bekendeApparatenLijst(auth.user.id)).find((a) => a.id === String(d.id || ''));
      if (!al) return error('APPARAAT_ONBEKEND', 404);
      const { ok, nieuw } = await bekendBevestigen(auth.user.id, d.id);
      // IDENTITEIT-015 (herstel): позначка «Це був я» — і в центр сповіщень (на інших пристроях видно, що пристрій назвали своїм). Повтор — без нового запису.
      if (ok && nieuw) {
        await deps.audit(auth.user.id, 'owner.apparaat.bevestigd', 'success', { id: al.id, apparaat: al.apparaat });
        await meldBeveiligingsWijziging(auth.user.id, 'apparaat-bevestigd', { apparaat: al.apparaat || '—' });
      }
      return json({ ...(await stand(ctx, auth.user.id)), bevestigd: ok });
    }),
  };
}
