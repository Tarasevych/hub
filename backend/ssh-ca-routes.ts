// Uitgifte van een SSH-certificaat (backend/ssh-ca.ts) en beheer van de SSH-CA (backend/ssh-ca-beheer.ts).
//
// SEC-002 (geheimen-03): alles wat toegang tot de host geeft of de CA verandert, vraagt een STERKE bevestiging op deze sessie
// (passkey, app-code of herstelcode — backend/toegang-context.ts sterkeStapOpFout). Opnieuw aanmelden bij Google of een
// onthouden browser telt hier niet: wie alleen het Google-account of een gestolen sessie heeft, krijgt geen certificaat.
// Eén bevestiging = één certificaat: controleren en verbruiken in één ondeelbare stap (stapOpEenmalig, SEC-002 afwerking A).
// SEC-002 (server-uitrol-06): daarbovenop tekent root alleen met een passkey-assertie over precies dit certificaat
// (/api/ssh-ca/uitgifte/uitdaging → passkey in de browser → /api/ssh-ca/uitgifte).
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { tekenUitdagingVoor, uitgevenVoor } from './ssh-ca';
import { activatieVoor, beheer, intrekken, lijst, stand, standaardBeheerIo, standaardPasskey, uitdaging } from './ssh-ca-beheer';
import { stapOpVerbruiken, type StapOpAuth } from './stap-op';
import { isEigenaar, TechFout } from './tech-profiel';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
type StapOp = (ctx: unknown, auth: SessionOk) => Promise<Resp | null>;
export type SshCaDeps = {
  /** Gewone bevestiging: nergens meer gebruikt door deze routes, alleen nog aanvaard zodat oudere aanroepers blijven compileren. */
  stepUp?: StapOp;
  /** Sterke bevestiging (passkey / app-code / herstelcode). Ontbreekt ze, dan weigeren de gevoelige routes (dicht bij twijfel). */
  sterkeStapOp?: StapOp;
  /** Bevestiging van deze sessie intrekken na een geslaagde uitgifte. Standaard backend/stap-op.ts stapOpVerbruiken. */
  verbruik?: (auth: StapOpAuth) => Promise<void>;
  /**
   * SEC-002 (g06, afwerking A): «sterke bevestiging controleren en verbruiken» als één ondeelbare stap rond de uitgifte (backend/index.ts
   * geeft metStapOpEenmalig met sterkeStapOpGeldig). Zonder (oudere tests): uitgifte en daarna `verbruik`, zoals vroeger — dan konden
   * gelijktijdige aanvragen op één bevestiging elk een certificaat krijgen.
   */
  stapOpEenmalig?: <T>(auth: StapOpAuth, actie: () => Promise<T>) => Promise<{ ok: true; uit: T } | { ok: false }>;
  /** Alleen voor tests: de uitgifte zelf vervangen (standaard uitgevenVoor met de passkey-controle). De poorten blijven dezelfde. */
  uitgeven?: (u: SessionOk['user'], tab: string, publiek: unknown, minuten: unknown, passkey: { uitdagingId?: unknown; assertie?: unknown }) => Promise<unknown>;
};

export function sshCaRoutes(requireSession: RequireSession, deps: SshCaDeps): Record<string, RouterMiddleware[]> {
  const verbruik = deps.verbruik ?? stapOpVerbruiken;
  const uitgeven = deps.uitgeven ?? (async (u: SessionOk['user'], t: string, publiek: unknown, minuten: unknown, passkey: { uitdagingId?: unknown; assertie?: unknown }) =>
    uitgevenVoor(u, t, publiek, minuten, passkey, await standaardPasskey()));
  const gate = (opts: { sterk?: boolean; verbruik?: boolean }, run: (b: Record<string, unknown>, auth: SessionOk) => Promise<unknown> | unknown) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    // Agent (AGENT_NIET_TOEGESTAAN) of verboden: 403, anders niet aangemeld: 401.
    if ('errorCode' in auth) return error(auth.errorCode, /NIET_TOEGESTAAN|FORBIDDEN|IMPERSONATIE/.test(auth.errorCode) ? 403 : 401);
    if (auth.user.status !== 'approved' && !isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    if (opts.sterk) {
      // Geen terugval op de gewone bevestiging: zonder sterkeStapOp is deze route dicht.
      if (!deps.sterkeStapOp) return error('STEP_UP_STRONG_REQUIRED', 403);
      const su = await deps.sterkeStapOp(ctx, auth);
      if (su) return su;
    }
    const b = ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {};
    try {
      if (opts.verbruik && deps.stapOpEenmalig) {
        // Eén bevestiging = één certificaat, ook bij gelijktijdige aanvragen; een geweigerde poging zet de bevestiging terug.
        const stap = await deps.stapOpEenmalig(auth as unknown as StapOpAuth, async () => run(b, auth));
        return stap.ok ? json(stap.uit) : error('STEP_UP_STRONG_REQUIRED', 403);
      }
      const uit = await run(b, auth);
      // Alleen na succes: een geweigerde poging (verkeerde sleutel, schakelaar uit) kost de bevestiging niet.
      if (opts.verbruik) await verbruik(auth as unknown as StapOpAuth).catch((e) => console.error('[ssh-ca] stap-op verbruiken', (e as Error).message));
      return json(uit);
    } catch (e) { if (e instanceof TechFout) return error(e.code, e.status); throw e; }
  }) as RouterMiddleware;
  const tab = (b: Record<string, unknown>) => String(b.tabContext || '');
  return {
    // Stap 1: challenge voor precies deze sleutel en duur. Stap 2: uitgifte met de assertie; daarna is de bevestiging op.
    'POST /api/ssh-ca/uitgifte/uitdaging': [gate({ sterk: true }, async (b, a) => tekenUitdagingVoor(a.user, tab(b), b.publiek, b.minuten, await standaardPasskey(), b.sourceOrigin))],
    'POST /api/ssh-ca/uitgifte': [gate({ sterk: true, verbruik: true }, (b, a) => uitgeven(a.user, tab(b), b.publiek, b.minuten, { uitdagingId: b.uitdagingId, assertie: b.assertie }))],
    // Beheer (18.10.2026): elke route eigenaar + ssh.host in dit tabblad (backend/ssh-ca-beheer.ts poort). Lezen zonder bevestiging;
    // voorbereiden, aan/uit, ontmantelen en intrekken met de sterke bevestiging.
    'POST /api/ssh-ca/stand': [gate({}, async (b, a) => stand(a.user, await activatieVoor(a.user, tab(b)), standaardBeheerIo(), b.vernieuwen === true))],
    'POST /api/ssh-ca/lijst': [gate({}, async (b, a) => lijst(a.user, await activatieVoor(a.user, tab(b))))],
    'POST /api/ssh-ca/beheer/uitdaging': [gate({ sterk: true }, async (b, a) => uitdaging(a.user, await activatieVoor(a.user, tab(b)), b.actie, await standaardPasskey()))],
    'POST /api/ssh-ca/beheer': [gate({ sterk: true }, async (b, a) => beheer(a.user, await activatieVoor(a.user, tab(b)), b, standaardBeheerIo(), await standaardPasskey()))],
    'POST /api/ssh-ca/intrekken': [gate({ sterk: true }, async (b, a) => intrekken(a.user, await activatieVoor(a.user, tab(b)), b, standaardBeheerIo()))],
  };
}
