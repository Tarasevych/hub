// Routes voor toegangscodes (RUNBOOK §13.11).
//  Eigenaar (id.tarasevych.com, sessie van de eigenaar):
//    POST /api/owner/access/toegangscodes/{lijst,maken,wijzigen,intrekken}   maken = sterke step-up; verlengen = sterke step-up
//    POST /api/owner/access/gast-sessies/{lijst,intrekken}                     voor «Сесії»
//  Gast (alleen host id.tarasevych.com, eigen cookie tsv_gast, Path=/api/gast, HttpOnly, Secure, SameSite=Strict):
//    POST /api/gast/inwisselen   publiek: code → gastsessie (per IP strikt begrensd + blokkade na 5 mislukte pogingen)
//    POST /api/gast/sessie       wie/wat/tot wanneer (banner «Гостьовий доступ від … до …»)
//    POST /api/gast/bekijk       {scope} → alleen scopes van de code (standaard weigeren), gelogd met de code-id
//    POST /api/gast/uitloggen    publiek, idempotent
// De gastcookie geeft NERGENS anders toegang: alle /api/owner/*-routes kijken alleen naar de sessie van een account.
import { error, json } from '../server/platform';
import { ipHash } from '../server/platform/audit';
import { clearLoginFailures, pogingReserveren, rateLimit } from '../server/platform/beveiliging';
import { huidigeContext, sessieGeverifieerd } from '../server/platform/context';
import type { RouterMiddleware, RouterResponse } from '../server/platform/router';
import { isEigenaarGebruiker, type PasskeyAuth } from './toegangssleutels';
import { ToegangFout, sessieInfo } from './toegang-context';
import {
  GAST_COOKIE, GAST_SCOPES, NOOIT, PRESETS, codeIntrekken, codeMaken, codesLijst, gastBekijken, gastEigenaarNaam, gastSessieIntrekken, gastSessiesVan,
  gastUitloggen, gastVanCookie, inwisselen, verloopVoorWijziging, verloopWijzigen, type Gast,
} from './toegangscodes';

type SessionOk = PasskeyAuth;
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Resp = ReturnType<typeof json>;
type Ctx = { event: Record<string, unknown>; body: unknown };
export type ToegangscodeRouteDeps = { requireSession: RequireSession; sterkeStapOp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> };
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
const fout = (code: string, status = 400): never => { throw new ToegangFout(code, status); };
const ID_HOST = 'id.tarasevych.com', ID_ORIGIN = `https://${ID_HOST}`;
const kop = (event: Record<string, unknown>, naam: string) => {
  const h = (event.headers || {}) as Record<string, string | undefined>;
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === naam) return String(v ?? '');
  return '';
};
const cookie = (event: Record<string, unknown>, naam: string) => {
  for (const deel of kop(event, 'cookie').split(';')) { const i = deel.indexOf('='); if (i > 0 && deel.slice(0, i).trim() === naam) { try { return decodeURIComponent(deel.slice(i + 1).trim()); } catch { return ''; } } }
  return '';
};
const BEVEILIGING = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
const metCookie = (r: RouterResponse, waarde: string, maxAge: number): RouterResponse => ({ ...r, headers: { ...r.headers, ...BEVEILIGING, 'Set-Cookie': `${GAST_COOKIE}=${waarde}; Path=/api/gast; Max-Age=${Math.max(0, Math.floor(maxAge))}; HttpOnly; Secure; SameSite=Strict` } });
const zonder = (r: RouterResponse) => metCookie(r, '', 0);
/** Alleen op id.tarasevych.com en (als de browser hem meestuurt) met Origin id.tarasevych.com. */
const juisteHost = (event: Record<string, unknown>) => kop(event, 'host').split(':')[0].toLowerCase() === ID_HOST && (!kop(event, 'origin') || kop(event, 'origin') === ID_ORIGIN);

export function toegangscodeRoutes(deps: ToegangscodeRouteDeps): Record<string, RouterMiddleware[]> {
  const sterk = async (ctx: Ctx, auth: SessionOk) => {
    if (deps.sterkeStapOp) return deps.sterkeStapOp(ctx, auth);
    const { sterkeStapOpFout } = await import('./toegang-context');
    const f = await sterkeStapOpFout(auth); return f ? error(f, 403) : null;
  };
  const eigenaar = (opts: { sterk?: boolean; lijst?: boolean }, run: (auth: SessionOk, b: Record<string, unknown>, ctx: Ctx) => Promise<unknown | RouterResponse>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.service !== 'identity') return error('SERVICE_NOT_ALLOWED', 403);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    // Lijsten: een ander account krijgt gewoon «niet beschikbaar» (200, geen gegevens) i.p.v. een 403 in de console van elke pagina.
    if (!isEigenaarGebruiker(auth.user)) return opts.lijst ? json({ beschikbaar: false }) : error('OWNER_REQUIRED', 403);
    if (opts.sterk) { const su = await sterk(ctx, auth); if (su) return su; }
    try {
      const uit = await run(auth, lichaam(ctx.body), ctx);
      return uit && typeof uit === 'object' && 'statusCode' in (uit as object) ? uit as RouterResponse : json(uit);
    } catch (err) {
      if (err instanceof ToegangFout) return error(err.code, err.status);
      console.error('[toegangscodes]', (err as Error).message);
      return error('TOEGANGSCODE_FOUT', 500);
    }
  }) as RouterMiddleware;
  const gast = (run: (g: Gast, b: Record<string, unknown>) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    if (!juisteHost(ctx.event)) return error('GAST_ALLEEN_ID', 403);
    const g = await gastVanCookie(cookie(ctx.event, GAST_COOKIE)).catch(() => null);
    if (!g) return zonder(error('GAST_SESSIE_ONGELDIG', 401));
    sessieGeverifieerd();
    try { return { ...json(await run(g, lichaam(ctx.body))), headers: { ...json(null).headers, ...BEVEILIGING } }; }
    catch (err) {
      if (err instanceof ToegangFout) return error(err.code, err.status);
      console.error('[gast]', (err as Error).message);
      return error('GAST_FOUT', 500);
    }
  }) as RouterMiddleware;
  const dienst = (a: SessionOk) => a.service;
  const T = '/api/owner/access/toegangscodes', S = '/api/owner/access/gast-sessies';
  return {
    [`POST ${T}/lijst`]: [eigenaar({ lijst: true }, async (a) => ({
      beschikbaar: true, codes: await codesLijst(a.user.id),
      scopes: Object.entries(GAST_SCOPES).map(([id, [uk, nl]]) => ({ id, uk, nl })), nooit: NOOIT.map(([uk, nl]) => ({ uk, nl })), presets: Object.keys(PRESETS),
    }))],
    [`POST ${T}/maken`]: [eigenaar({ sterk: true }, async (a, b) => {
      const l = await rateLimit(`toegangscode-maken:${a.user.id}`, 20, 3600);
      if (!l.ok) fout('RATE_LIMITED', 429);
      return codeMaken({ id: a.user.id, email: a.user.email }, b, { sessieId: sessieInfo(a).sessieId, dienst: dienst(a) });
    })],
    // Korter maken mag zonder extra bevestiging; verlengen (of безстроково maken) vraagt een sterke step-up.
    [`POST ${T}/wijzigen`]: [eigenaar({}, async (a, b, ctx) => {
      const { verlenging } = await verloopVoorWijziging(a.user.id, b);
      if (verlenging) { const su = await sterk(ctx, a); if (su) return su; }
      return verloopWijzigen({ id: a.user.id, email: a.user.email }, b, { dienst: dienst(a) });
    })],
    [`POST ${T}/intrekken`]: [eigenaar({}, async (a, b) => codeIntrekken({ id: a.user.id, email: a.user.email }, b, { dienst: dienst(a) }))],
    [`POST ${S}/lijst`]: [eigenaar({ lijst: true }, async (a) => ({ beschikbaar: true, sessies: await gastSessiesVan(a.user.id) }))],
    [`POST ${S}/intrekken`]: [eigenaar({}, async (a, b) => gastSessieIntrekken({ id: a.user.id, email: a.user.email }, b.alle === true ? 'alle' : b.id, { dienst: dienst(a) }))],

    'POST /api/gast/inwisselen': [async (raw) => {
      const ctx = raw as unknown as Ctx;
      if (!juisteHost(ctx.event)) return error('GAST_ALLEEN_ID', 403);
      const c = huidigeContext();
      const onderwerp = `gast-inwisselen:${ipHash(c?.ip) || String(c?.ip || 'onbekend').slice(0, 64)}`;
      const poging = await pogingReserveren(onderwerp).catch(() => ({ toegestaan: false, wachtSeconden: 60 }));
      if (!poging.toegestaan) return { ...error('GAST_GEBLOKKEERD', 429), headers: { ...json(null).headers, 'Retry-After': String(poging.wachtSeconden) }, body: JSON.stringify({ error: 'GAST_GEBLOKKEERD', retryAfter: poging.wachtSeconden }) };
      try {
        const { token, gast: g } = await inwisselen(lichaam(ctx.body));
        await clearLoginFailures(onderwerp).catch(() => undefined);
        return metCookie(json({ ok: true, eigenaar: await gastEigenaarNaam(g), code: g.codeNaam, scopes: g.scopes, tot: new Date(g.verlooptOp).toISOString() }), encodeURIComponent(token), (g.verlooptOp - Date.now()) / 1000);
      } catch (err) {
        if (err instanceof ToegangFout) return error(err.code, err.status);
        console.error('[gast] inwisselen:', (err as Error).message);
        return error('GAST_FOUT', 500);
      }
    }],
    'POST /api/gast/sessie': [gast(async (g) => ({ eigenaar: await gastEigenaarNaam(g), code: g.codeNaam, scopes: g.scopes, sinds: new Date(g.gestartOp).toISOString(), tot: new Date(g.verlooptOp).toISOString() }))],
    'POST /api/gast/bekijk': [gast(async (g, b) => ({ scope: b.scope, data: await gastBekijken(g, b.scope) }))],
    'POST /api/gast/uitloggen': [async (raw) => {
      const ctx = raw as unknown as Ctx;
      if (!juisteHost(ctx.event)) return error('GAST_ALLEEN_ID', 403);
      const g = await gastVanCookie(cookie(ctx.event, GAST_COOKIE)).catch(() => null);
      if (g) await gastUitloggen(g).catch(() => undefined);
      return zonder(json({ ok: true }));
    }],
  };
}
