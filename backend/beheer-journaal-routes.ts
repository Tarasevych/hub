// Routes van het beheerlogboek (admin.tarasevych.com/audit). Alleen lezen/exporteren; schrijven gebeurt overal via journaalSchrijf().
// Allemaal met de capability audit.read (adminContext). Bekijken, exporteren en ketencontrole worden zelf ook gelogd (gedempt of bewust 1:1).
// SEC-002 (privacy-logboek-05, 12.11.2026): privéregels van ANDERE accounts zijn voor support_viewer/security_admin gemaskeerd (ook in de
// zoektekst, de statistiek en de export); exporteren vraagt een verse bevestiging van de aanmelding en is, net als de ketencontrole, begrensd per uur.
import type { JournaalFilter } from '../shared/beheer-journaal';
import { ACTIE_LABELS, ALLE_CATEGORIEEN, CATEGORIEEN } from '../shared/beheer-journaal';
import {
  eenKeerPer, journaalExport, journaalOud, journaalStatistiek, journaalZoeken, ketenControleAlles, type JournaalRij, type Persoon,
} from './beheer-journaal';
import { rateLimit } from '../server/platform/beveiliging';

type Ctx = { event: Record<string, unknown>; body: unknown };
export type JournaalRouteDeps = {
  adminContext: (event: Record<string, unknown>, body: unknown, capability: 'audit.read') => Promise<{ errorCode: string } | { user: { id: string }; adminRole: string }>;
  ownerAudit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown>;
  ownerBody: (body: unknown) => Record<string, unknown>;
  ownerResponse: (data: unknown, status?: number, extra?: unknown) => unknown;
  /** extra.retryAfter (s): server/platform error() zet dan Retry-After en retryAfter in het antwoord (SEC-002 toets-g10i №3). */
  error: (code: string, status?: number, extra?: { retryAfter?: number; maxAttempts?: number }) => unknown;
  /** id's → personen (e-mail, naam, https-foto); onbekende id's ontbreken in de map */ personen: (ids: string[]) => Promise<Map<string, Persoon>>;
  /** zoektekst → account-id's waarvan naam of e-mail past */ zoekPersonen: (q: string) => Promise<string[]>;
  safeDetails: (v: unknown) => unknown;
  /**
   * SEC-002 (privacy-logboek-05): verse bevestiging van de aanmelding (stapOpVereist in backend/index.ts). Geeft een kant-en-klaar
   * 403-antwoord terug als die ontbreekt, anders null. Verplicht voor de export: zonder deze functie wordt er NIET geëxporteerd.
   */
  stepUp?: (ctx: unknown, auth: never) => Promise<unknown | null>;
};

/** Export: hoogstens zoveel per uur per mens (tot 5000 regels met e-mailadressen per keer). */
export const EXPORT_PER_UUR = 5;
/** Volledige ketencontrole (tot 500 ketens herberekenen): hoogstens zoveel per uur per mens. */
export const KETENCONTROLE_PER_UUR = 6;

const lijst = (v: unknown, max: number, n = 30) => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').slice(0, max)).filter(Boolean).slice(0, n);
const tekst = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

export function filterUitBody(b: Record<string, unknown>): JournaalFilter {
  const bron = tekst(b.bron, 8);
  return {
    q: tekst(b.q, 120) || undefined, categorieen: lijst(b.categorieen, 20), resultaten: lijst(b.resultaten, 12) as JournaalFilter['resultaten'],
    actorId: tekst(b.actorId, 80) || undefined, doelId: tekst(b.doelId, 80) || undefined, actie: tekst(b.actie, 120) || undefined,
    bron: bron === 'oud' || bron === 'alles' ? bron : 'nieuw', van: Number(b.van) || undefined, tot: Number(b.tot) || undefined,
    // L-01: `b.service` is het sessieveld van adminContext (altijd 'admin') en mag nooit een rijfilter worden; het rijfilter heet `dienst`.
    dienst: tekst(b.dienst, 40) || undefined, verbergRuis: b.verbergRuis !== false && b.verbergRuis !== 'false' && b.verbergRuis !== 0,
    volgorde: b.volgorde === 'oud' ? 'oud' : 'nieuw', cursor: tekst(b.cursor, 20) || undefined, limiet: Math.min(200, Number(b.limiet) || 50),
  };
}

export function beheerJournaalRoutes(deps: JournaalRouteDeps) {
  const metAdmin = (run: (ctx: Ctx, userId: string, rol: string, auth: never) => Promise<unknown>) => (async (raw: unknown): Promise<any> => { // any: RouterMiddleware verwacht RouterResponse; deps.respond/error geven die terug
    const ctx = raw as Ctx;
    const auth = await deps.adminContext(ctx.event, ctx.body, 'audit.read');
    if ('errorCode' in auth) return deps.error(String(auth.errorCode), 403);
    try { return await run(ctx, auth.user.id, auth.adminRole, auth as never); } catch (e) { console.error('[beheer-journaal]', (e as Error).message); return deps.error('JOURNAAL_FOUT', 500); }
  });
  // SEC-002 (privacy-logboek-05): de kijker gaat mee, zodat privéregels van andere accounts gemaskeerd worden (backend/beheer-journaal.ts).
  const opties = async (f: JournaalFilter, userId: string, rol: string) => ({ gebruikerIds: f.q ? await deps.zoekPersonen(f.q).catch(() => []) : [], kijker: { id: userId, rol } });

  return {
    'POST /api/owner/journaal/beheer/zoeken': [metAdmin(async (ctx, userId, rol) => {
      const f = filterUitBody(deps.ownerBody(ctx.body));
      const o = await opties(f, userId, rol);
      const nieuw = f.bron === 'oud' ? { items: [] as JournaalRij[] } : await journaalZoeken(f, o);
      const oud = f.bron === 'nieuw' ? { items: [] as JournaalRij[] } : await journaalOud(f, o);
      // «alles»: nieuwe ketenregels eerst, daarna het oude archief (cursor van het archief apart: oudCursor).
      const items = f.bron === 'alles' && !f.cursor ? [...nieuw.items, ...oud.items] : f.bron === 'oud' ? oud.items : nieuw.items;
      const ids = [...new Set(items.flatMap((i) => [i.actorId, i.ownerId, i.doel?.id]).filter(Boolean) as string[])].slice(0, 500);
      const personen = Object.fromEntries([...(await deps.personen(ids)).entries()]);
      // Het bekijken zelf loggen, gedempt (anders vult de lijst zich met «logboek bekeken»).
      if (eenKeerPer(`audit.viewed:${userId}`)) await deps.ownerAudit(userId, 'owner.admin.audit.viewed', 'success', { filters: Object.keys(f).filter((k) => (f as Record<string, unknown>)[k] !== undefined && !['limiet', 'cursor'].includes(k)) }).catch(() => undefined);
      return deps.ownerResponse({
        items: items.map((i) => ({ ...i, details: deps.safeDetails(i.details) })), personen,
        nextCursor: (f.bron === 'oud' ? oud.nextCursor : nieuw.nextCursor) || null, oudCursor: f.bron === 'alles' ? oud.nextCursor || null : null,
        volgorde: f.volgorde,
      });
    })],
    'POST /api/owner/journaal/beheer/statistiek': [metAdmin(async (ctx, userId, rol) => {
      const f = filterUitBody(deps.ownerBody(ctx.body));
      const s = await journaalStatistiek(f, await opties(f, userId, rol));
      const personen = Object.fromEntries([...(await deps.personen(s.actoren.map((a) => a.id))).entries()]);
      return deps.ownerResponse({
        ...s, personen,
        categorieen: ALLE_CATEGORIEEN.map((c) => ({ id: c.id, uk: c.uk, nl: c.nl })),
        bekendeActies: Object.keys(ACTIE_LABELS).length, patronen: CATEGORIEEN.length,
      });
    })],
    'POST /api/owner/journaal/beheer/export': [metAdmin(async (ctx, userId, rol, auth) => {
      // SEC-002 (privacy-logboek-05): een export neemt tot 5000 regels met e-mailadressen, apparaten en details van ALLE accounts mee.
      // Een sessiecookie alleen is daarvoor niet genoeg: eerst een verse bevestiging van de aanmelding (zoals bij de eigen
      // gegevensexport), en hoogstens EXPORT_PER_UUR keer per uur. Zonder stepUp-functie (verkeerde bedrading) wordt er niet geëxporteerd.
      if (!deps.stepUp) return deps.error('STAP_OP_NIET_BESCHIKBAAR', 403);
      const stap = await deps.stepUp(ctx, auth);
      if (stap) return stap;
      const limiet = await rateLimit(`journaal-export:${userId}`, EXPORT_PER_UUR, 60 * 60, { failClosed: true });
      if (!limiet.ok) return deps.error('RATE_LIMITED', 429, { retryAfter: limiet.retryAfter, maxAttempts: limiet.limit });
      const b = deps.ownerBody(ctx.body);
      const f = filterUitBody(b); const formaat = b.formaat === 'json' ? 'json' : 'csv';
      const uit = await journaalExport({ ...f, cursor: undefined }, await opties(f, userId, rol), deps.personen, formaat);
      // Elke export wordt 1:1 gelogd (wie kreeg welke selectie mee) — dit is bewust niet gedempt.
      await deps.ownerAudit(userId, 'owner.admin.audit.exported', 'success', { formaat, aantal: uit.aantal, afgekapt: uit.afgekapt, filters: Object.keys(f).filter((k) => (f as Record<string, unknown>)[k] !== undefined && !['limiet', 'cursor'].includes(k)) });
      return deps.ownerResponse({ bestandsnaam: uit.bestandsnaam, inhoud: uit.inhoud, aantal: uit.aantal, afgekapt: uit.afgekapt, formaat });
    })],
    'POST /api/owner/journaal/beheer/ketencontrole': [metAdmin(async (_ctx, userId) => {
      // SEC-002 (privacy-logboek-05): de volledige controle herberekent tot 500 ketens; onbegrensd herhalen belast de database voor iedereen.
      const limiet = await rateLimit(`journaal-keten:${userId}`, KETENCONTROLE_PER_UUR, 60 * 60, { failClosed: true });
      if (!limiet.ok) return deps.error('RATE_LIMITED', 429, { retryAfter: limiet.retryAfter, maxAttempts: limiet.limit });
      const u = await ketenControleAlles();
      await deps.ownerAudit(userId, 'owner.admin.audit.chain_checked', u.geldig ? 'success' : 'failure', { ketens: u.gecontroleerd, totaal: u.totaal, hashFout: u.hashFout, schakelFout: u.schakelFout, gaten: u.gaten, afgekapt: u.afgekapt });
      return deps.ownerResponse(u);
    })],
  };
}
