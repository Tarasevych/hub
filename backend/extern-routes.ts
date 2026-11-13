// Routes van het externe bureaublad (backend/remote-bureaublad.ts). Alleen de eigenaar. Verbindingen wijzigen, toegestane hosts
// wijzigen en een sessie openen vragen een verse PASSKEY-bevestiging (geen Google/TOTP): één bevestiging = één handeling.
// De WS-tunnel zelf (/api/owner/remote/tunnel) zit in de gateway (backend/connectors-gateway.ts → registreerWsPad).
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import * as rb from './remote-bureaublad';
import { isEigenaar, TechFout, type Sessie } from './tech-profiel';
import { metStapOpEenmalig, passkeyStapOpGeldig, stapOpVerbruiken, type StapOpAuth } from './stap-op';
import { registreerWsPad } from './connectors-gateway';

registreerWsPad(rb.REMOTE_WS_PATH, rb.upgrade);

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string; session?: { id: string; createdAt: number } | null; tabSession?: { id: string } | null };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
const sessieVan = (auth: SessionOk): Sessie | null => auth.session?.id ? { id: String(auth.session.id), createdAt: Number(auth.session.createdAt) || 0, tabSessieId: auth.tabSession?.id ? String(auth.tabSession.id) : null } : null;

export type RemoteDeps = { passkeyGeldig?: (auth: StapOpAuth) => Promise<boolean>; passkeyVerbruiken?: (auth: StapOpAuth) => Promise<void> };

export function remoteRoutes(requireSession: RequireSession, deps: RemoteDeps = {}): Record<string, RouterMiddleware[]> {
  const geldig = deps.passkeyGeldig ?? passkeyStapOpGeldig, verbruik = deps.passkeyVerbruiken ?? stapOpVerbruiken;
  // SEC-002 (g06): met de echte step-up controleren en verbruiken in één ondeelbare stap (bij een fout teruggezet); tests mogen eigen
  // functies injecteren en houden dan de oude volgorde.
  const echt = !deps.passkeyGeldig && !deps.passkeyVerbruiken;
  const gate = (opts: { passkey?: boolean }, run: (b: Record<string, unknown>, auth: SessionOk) => Promise<unknown> | unknown) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (!isEigenaar(auth.user)) return error('REMOTE_ALLEEN_EIGENAAR', 403);
    const b = ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {};
    if (opts.passkey && echt) {
      try {
        const stap = await metStapOpEenmalig(auth as StapOpAuth, passkeyStapOpGeldig, async () => run(b, auth));
        return stap.ok ? json(stap.uit) : json({ error: 'STEP_UP_REQUIRED', reasonCode: 'STEP_UP_REQUIRED', methods: ['passkey'], maxAgeSeconds: 300 }, 403);
      } catch (e) { if (e instanceof TechFout) return error(e.code, e.status); throw e; }
    }
    if (opts.passkey && !(await geldig(auth as StapOpAuth))) return json({ error: 'STEP_UP_REQUIRED', reasonCode: 'STEP_UP_REQUIRED', methods: ['passkey'], maxAgeSeconds: 300 }, 403);
    try {
      const uit = await run(b, auth);
      if (opts.passkey) await verbruik(auth as StapOpAuth);
      return json(uit);
    } catch (e) { if (e instanceof TechFout) return error(e.code, e.status); throw e; }
  }) as RouterMiddleware;
  const tab = (b: Record<string, unknown>) => String(b.tabContext || '');
  return {
    'POST /api/owner/remote/stand': [gate({}, (b, a) => rb.stand(a.user, tab(b), sessieVan(a)))],
    'POST /api/owner/remote/verbinding/opslaan': [gate({ passkey: true }, (b, a) => rb.opslaan(a.user, b))],
    'POST /api/owner/remote/verbinding/verwijderen': [gate({ passkey: true }, (b, a) => rb.verwijderen(a.user, String(b.id || '')))],
    'POST /api/owner/remote/verbinding/testen': [gate({}, (b, a) => rb.testen(a.user, String(b.id || '')))],
    'POST /api/owner/remote/hosts/opslaan': [gate({ passkey: true }, (b, a) => rb.hostsZetten(a.user, b.hosts))],
    'POST /api/owner/remote/openen': [gate({ passkey: true }, (b, a) => rb.openen(a.user, tab(b), sessieVan(a), b))],
    'POST /api/owner/remote/sluiten': [gate({}, (b, a) => rb.sluitEigen(a.user, String(b.sid || '')))],
    'POST /api/owner/remote/sessies': [gate({}, (_b, a) => rb.geschiedenis(a.user))],
  };
}
