// Routes van het technisch profiel (zie backend/tech-profiel.ts). Elke route vraagt een sessie; activeren en toekennen ook een verse
// bevestiging van de aanmelding (stap-op). De tabcontext komt uit de body (zelfde als elke sessieroute) en bindt de activering aan dat tabblad.
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { BAND_KLEUREN, BAND_PATRONEN, DUUR_KEUZES, TECH_ROLLEN, maxMinutenVoor, mogelijkhedenVan } from '../shared/tech-rollen';
import * as tp from './tech-profiel';
import { assetCookieVoor } from './tech-bundels';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string; session?: { id: string; createdAt: number } | null; tabSession?: { id: string } | null };
/** De aanmeldsessie van dit verzoek (anker + tab-overlay), waaraan een activering wordt gebonden (migratie 0060). */
const sessieVan = (auth: SessionOk): tp.Sessie | null => auth.session?.id ? { id: String(auth.session.id), createdAt: Number(auth.session.createdAt) || 0, tabSessieId: auth.tabSession?.id ? String(auth.tabSession.id) : null } : null;
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
export type TechRouteDeps = {
  stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null>;
  /** SEC-002 (geheimen-03, afwerking A): STERKE bevestiging (passkey/TOTP/herstelcode) om een profiel met ssh.host te activeren. */
  sterkeStapOp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null>;
};

const bodyOf = (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {});

export function techRoutes(requireSession: RequireSession, deps: TechRouteDeps = {}): Record<string, RouterMiddleware[]> {
  const gate = (opts: { stepUp?: boolean }, run: (ctx: Ctx, auth: SessionOk, tab: string) => Promise<Resp>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved' && !tp.isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    const tab = String(bodyOf(ctx.body).tabContext || '');
    if (!tp.TAB_RE.test(tab)) return error('TAB_ONGELDIG', 400);
    if (opts.stepUp) {
      if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403);
      const su = await deps.stepUp(ctx, auth);
      if (su) return su;
    }
    try { return await run(ctx, auth, tab); }
    catch (err) { if (err instanceof tp.TechFout) return error(err.code, err.status); throw err; }
  }) as RouterMiddleware;

  const status = async (auth: SessionOk, tab: string) => {
    const profiel = await tp.profielVan(auth.user);
    const sessie = sessieVan(auth);
    // Geen eigen activering in dit tabblad → een open activering van dezelfde sessie erven (0071; nooit van een andere sessie/browser).
    const actief = profiel && !profiel.ingetrokkenOp ? (await tp.actieveActivatie(auth.user.id, tab, sessie)) ?? (await tp.ervenOpen(auth.user, tab, sessie)) : null;
    return {
      profiel: profiel && !profiel.ingetrokkenOp ? { ...profiel, maxNu: maxMinutenVoor(profiel.rollen, profiel.maxMinuten) } : null,
      activatie: actief, nu: Date.now(),
      catalogus: { rollen: TECH_ROLLEN.map((r) => ({ id: r.id, naam: r.naam, kort: r.kort, plafondMinuten: r.plafondMinuten })), kleuren: BAND_KLEUREN, patronen: BAND_PATRONEN, duren: DUUR_KEUZES },
    };
  };

  // Toegangscookie voor /assets/tech/* (backend/tech-bundels.ts): alleen bij een actieve activering in dit tabblad uitgegeven.
  const metAssetCookie = async (ctx: Ctx, auth: SessionOk, tab: string): Promise<Resp> => {
    const s = await status(auth, tab);
    const resp = json(s);
    try {
      const h = (ctx.event.headers || {}) as Record<string, string | undefined>;
      const kop = await assetCookieVoor(h.cookie || h.Cookie, s.activatie ? { id: s.activatie.id, eind: s.activatie.eind } : null, auth.user.id);
      if (kop) (resp.headers as Record<string, string>)['Set-Cookie'] = kop;
    } catch (e) { console.error('[tech-assets] cookie', (e as Error).message); }
    return resp;
  };

  return {
    'POST /api/owner/tech/status': [gate({}, async (ctx, auth, tab) => metAssetCookie(ctx, auth, tab))],
    'POST /api/owner/tech/activeren': [gate({ stepUp: true }, async (ctx, auth, tab) => {
      const b = bodyOf(ctx.body);
      // SEC-002 (geheimen-03, afwerking A): een profiel met «ssh.host» (SSH-sertificaten voor de server) vraagt een STERKE bevestiging
      // — opnieuw inloggen bij Google of een onthouden browser is daarvoor te zwak. Профіль із ssh.host — лише після сильного підтвердження.
      if (deps.sterkeStapOp) {
        const profiel = await tp.profielVan(auth.user);
        if (profiel && mogelijkhedenVan(profiel.rollen).includes('ssh.host')) { const su = await deps.sterkeStapOp(ctx, auth); if (su) return su; }
      }
      await tp.activeren(auth.user, tab, Number(b.minuten), String(b.reden ?? ''), sessieVan(auth));
      return metAssetCookie(ctx, auth, tab);
    })],
    // Zelf verlaten: in alle tabbladen van deze aanmeldsessie (0071); de andere tabbladen horen het via BroadcastChannel 'mr-tech' of
    // bij hun volgende status.
    'POST /api/owner/tech/beeindigen': [gate({}, async (ctx, auth, tab) => { await tp.beeindigen(auth.user, tab, sessieVan(auth)); return metAssetCookie(ctx, auth, tab); })],
    // Activering op tijd delen met een nieuw tabblad dat vanuit DIT tabblad werd geopend (0071). Het bron-tabblad roept dit aan.
    'POST /api/owner/tech/delen': [gate({}, async (ctx, auth, tab) => {
      const a = await tp.delen(auth.user, tab, String(bodyOf(ctx.body).doel || ''), sessieVan(auth));
      return json({ ok: true, eind: a.eind, modus: a.modus });
    })],
    // Nieuwe tabbladen technisch of gebruiker (migratie 0080). Standaard GEBRUIKER: zo blijft de AI in de privéruimte werken.
    'POST /api/owner/tech/erven': [gate({}, async (ctx, auth, tab) => {
      await tp.ervenZetten(auth.user, bodyOf(ctx.body).aan);
      return metAssetCookie(ctx, auth, tab);
    })],
    'POST /api/owner/tech/band': [gate({}, async (ctx, auth, tab) => {
      const b = bodyOf(ctx.body);
      await tp.bandZetten(auth.user, b.kleur, b.patroon);
      return json(await status(auth, tab));
    })],
    'POST /api/owner/tech/profielen': [gate({}, async (_ctx, auth, tab) => json({ profielen: await tp.profielenLijst(auth.user, tab) }))],
    'POST /api/owner/tech/toekennen': [gate({ stepUp: true }, async (ctx, auth, tab) => {
      const b = bodyOf(ctx.body);
      const p = await tp.toekennen(auth.user, tab, { email: String(b.email ?? ''), rollen: b.rollen, maxMinuten: b.maxMinuten, notitie: b.notitie });
      return json({ profiel: p, profielen: await tp.profielenLijst(auth.user, tab) });
    })],
    'POST /api/owner/tech/intrekken': [gate({}, async (ctx, auth, tab) => {
      const b = bodyOf(ctx.body);
      await tp.intrekken(auth.user, tab, String(b.userId ?? ''), b.reden);
      return json({ ok: true, profielen: await tp.profielenLijst(auth.user, tab) });
    })],
  };
}
