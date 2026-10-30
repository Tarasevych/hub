// Routes van de gescheiden gegevensruimtes (backend/ruimte-scheiding.ts, migratie 0082). Zelfde vorm als backend/tech-routes.ts:
// elke route vraagt een sessie, de tabcontext komt uit de body, en wat VERBINDT vraagt bovendien een verse bevestiging
// (step-up). Wijzigen mag IEDEREEN met technische toegang (geldig profiel met een rol die een eigen lade rechtvaardigt) ÉN een
// lopende activering in dit tabblad — precies dezelfde poort als de beheerpagina's, zodat er geen tweede manier bestaat om de
// scheiding te veranderen. Besluiten over BEVROREN gegevens blijven bij de eigenaar van de server.
//
//   POST /api/owner/ruimte/overzicht   stand van alles (keuze, per dienst, live rechten) — ook zonder activering leesbaar,
//                                      zodat het scherm kan uitleggen waarom het leeg is in plaats van leeg te blijven.
//   POST /api/owner/ruimte/keuze       de eenmalige keuze (apart / samen / per_dienst). Step-up: «samen» voegt in één keer
//                                      persoonlijke gegevens samen met de technische ruimte.
//   POST /api/owner/ruimte/dienst      één dienst verbinden (step-up) of losmaken (onmiddellijk, zonder bevestiging).
//   POST /api/owner/ruimte/besluit     besluit van de SERVEREIGENAAR over bevroren gegevens: teruggeven / overdragen /
//                                      verwijderen — ook over de lade van iemand anders (body.userId). Het echte verplaatsen
//                                      of wissen doen de uitvoerders die elke dienst aanmeldt (registreerLadeUitvoerder).
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { DEELBARE_DIENSTEN, DIENST_NAAM, KEUZES, KEUZE_NAAM, KEUZE_UITLEG, ROLLEN_MET_EIGEN_LADE, STAND_NAAM, STAND_UITLEG, actieOf, isEigenaarsBesluit } from '../shared/ruimte-scheiding';
import * as rs from './ruimte-scheiding';
import { actieveActivatie, isEigenaar, TAB_RE, type Gebruiker, type Sessie } from './tech-profiel';

type SessionOk = { user: Gebruiker; service: string; session?: { id: string; createdAt: number } | null; tabSession?: { id: string } | null };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
export type RuimteRouteDeps = { stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> };

const bodyOf = (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {});
const sessieVan = (auth: SessionOk): Sessie | null => auth.session?.id ? { id: String(auth.session.id), createdAt: Number(auth.session.createdAt) || 0, tabSessieId: auth.tabSession?.id ? String(auth.tabSession.id) : null } : null;

/** De catalogus voor het scherm: welke diensten bestaan, hoe heten de standen, en wat betekent elke keuze (beide talen). */
const catalogus = () => ({
  diensten: DEELBARE_DIENSTEN.map((d) => ({ id: d, naam: DIENST_NAAM[d] })),
  standen: STAND_NAAM, standUitleg: STAND_UITLEG,
  keuzes: KEUZES.map((k) => ({ id: k, naam: KEUZE_NAAM[k], uitleg: KEUZE_UITLEG[k] })),
  rollenMetEigenLade: ROLLEN_MET_EIGEN_LADE,
});

export function ruimteScheidingRoutes(requireSession: RequireSession, deps: RuimteRouteDeps = {}): Record<string, RouterMiddleware[]> {
  /**
   * `wijzigen: true` = deze route verandert de SCHEIDING VAN DE EIGEN LADEN. Dat mag IEDEREEN met technische toegang — niet
   * alleen de servereigenaar (opdracht van de eigenaar: «той, хто має технічний доступ, має сам вирішити»). De grens:
   *   • een geldig technisch profiel met een rol die een eigen lade rechtvaardigt (rs.technischeRechten, afgeleid uit
   *     shared/tech-rollen.ts), en
   *   • een LOPENDE activering in DIT tabblad (backend/tech-profiel.ts) — zelfde poort als de beheerpagina's.
   * Dit geeft geen enkele technische MOGELIJKHEID: releases, serverdeur, terminals, SSH en gebruikersbeheer blijven staan
   * waar ze stonden. `eigenaarOnly: true` is er voor de besluiten over BEVROREN gegevens: die blijven bij de servereigenaar.
   * Lezen mag ook zonder activering (anders kan het scherm niet uitleggen waarom het leeg is).
   */
  const gate = (opts: { wijzigen?: boolean; eigenaarOnly?: boolean }, run: (ctx: Ctx, auth: SessionOk, tab: string) => Promise<Resp>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved') return error('ACCOUNT_NOT_APPROVED', 403);
    const tab = String(bodyOf(ctx.body).tabContext || '');
    if (!TAB_RE.test(tab)) return error('TAB_ONGELDIG', 400);
    if (opts.eigenaarOnly && !isEigenaar(auth.user)) return error('OWNER_REQUIRED', 403);
    if (opts.wijzigen) {
      const rechten = await rs.technischeRechten(auth.user.id);
      if (!rechten.ok) return error(rechten.oorzaak === 'profiel-ingetrokken' ? 'GEEN_TECH_PROFIEL' : 'TECH_TOEGANG_VEREIST', 403);
      if (!(await actieveActivatie(auth.user.id, tab, sessieVan(auth)))) return error('TECH_PROFIEL_VEREIST', 403);
    }
    try { return await run(ctx, auth, tab); }
    catch (err) { if (err instanceof rs.RuimteFout) return error(err.code, err.status); throw err; }
  }) as RouterMiddleware;

  /** Step-up alleen waar hij hoort; geeft het antwoord van de step-uppoort terug (403 STEP_UP_REQUIRED) of null. */
  const bevestig = async (ctx: Ctx, auth: SessionOk): Promise<Resp | null> => {
    if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403);
    return deps.stepUp(ctx, auth);
  };

  return {
    'POST /api/owner/ruimte/overzicht': [gate({}, async (_ctx, auth) => json({ ...(await rs.overzichtVan(auth.user.id)), catalogus: catalogus() }))],

    'POST /api/owner/ruimte/keuze': [gate({ wijzigen: true }, async (ctx, auth) => {
      const su = await bevestig(ctx, auth);
      if (su) return su;
      const uit = await rs.keuzeZetten(auth.user.id, bodyOf(ctx.body).keuze, auth.user.id);
      return json({ ...uit, ...(await rs.overzichtVan(auth.user.id)), catalogus: catalogus() });
    })],

    'POST /api/owner/ruimte/dienst': [gate({ wijzigen: true }, async (ctx, auth) => {
      const b = bodyOf(ctx.body);
      const actie = actieOf(b.actie);
      if (!actie) return error('ACTIE_ONBEKEND', 400);
      if (isEigenaarsBesluit(actie)) return error('EIGENAARSBESLUIT_APART', 400);
      if (actie === 'bevries') return error('ACTIE_ONBEKEND', 400); // bevriezen doet de server bij rechtenverlies, niemand met de hand
      // Verbinden vraagt een verse bevestiging; losmaken NOOIT (veiligheid mag niet op een extra klik wachten).
      let stapOpGedaan = false;
      if (actie === 'verbind-eigen' || actie === 'verbind-gedeeld') {
        const su = await bevestig(ctx, auth);
        if (su) return su;
        stapOpGedaan = true;
      }
      const uit = await rs.dienstZetten(auth.user.id, b.dienst, actie, { actorId: auth.user.id, stapOpGedaan });
      return json({ standen: uit.standen, overgang: uit.overgang });
    })],

    // Besluiten over BEVROREN gegevens blijven bij de EIGENAAR VAN DE SERVER (beslissing 3 van de eigenaar): hij kan ze ook
    // nemen voor de lade van een ANDERE mens met technische toegang (body.userId), want die mens is haar rechten juist kwijt.
    'POST /api/owner/ruimte/besluit': [gate({ wijzigen: true, eigenaarOnly: true }, async (ctx, auth) => {
      const b = bodyOf(ctx.body);
      const su = await bevestig(ctx, auth);
      if (su) return su;
      const uit = await rs.eigenaarsBesluit({
        userId: String(b.userId || auth.user.id), dienst: b.dienst, besluit: b.besluit,
        eigenaarId: auth.user.id, doorEigenaar: isEigenaar(auth.user), stapOpGedaan: true,
      });
      return json({ standen: uit.standen, overgang: uit.overgang, verslag: uit.verslag });
    })],
  };
}
