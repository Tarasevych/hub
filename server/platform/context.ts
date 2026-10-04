// Verzoekcontext (AsyncLocalStorage): wie doet dit verzoek? Gebruikt door db.ts om queries van een
// ingelogde gebruiker als databaserol `mijnruimte_app` met `app.user_id` uit te voeren (RLS), en om in
// audit-modus te noteren wat RLS zou weigeren. Zonder context (cron, opstart, aanmelden vóór de sessie
// bekend is) of in `alsSysteem` gaat alles via de systeemrol, zoals vroeger.
import { AsyncLocalStorage } from 'node:async_hooks';

export type VerzoekContext = {
  route: string;
  userId?: string;
  service?: string;
  systeem?: boolean;
  /** Ingelogd account dat het verzoek doet, ook op systeemroutes (voor app.audit actor_id; niet voor RLS). */
  actor?: string;
  /** Verzoekgegevens voor de audit (ip wordt alleen gehasht opgeslagen). */
  ip?: string;
  ua?: string;
  /** Lui geladen: ruimtes (workspaces) waarvan userId eigenaar of actief lid is (alleen voor audit). */
  werkruimtes?: Promise<Set<string>>;
  /**
   * Audit-fix 8: is er in dit verzoek een échte referentie gecontroleerd (sessie via zetGebruiker /
   * sessieGeverifieerd, of een API-token)? Gedeeld object, zodat het ook vanuit alsSysteem() doorwerkt.
   */
  poort?: { geverifieerd: boolean };
};

const opslag = new AsyncLocalStorage<VerzoekContext>();
const ID = /^[A-Za-z0-9_.:@-]{1,200}$/;

export const huidigeContext = (): VerzoekContext | undefined => opslag.getStore();

/**
 * Routes die bewust over accounts heen werken (beheer, beleid, diagnose): systeemcontext (BYPASSRLS).
 * Ze controleren zelf de beheerrechten; RLS zou ze alleen breken.
 */
const SYSTEEM_ROUTES = [
  /^[A-Z]+ \/api\/owner\/admin\//,
  /^[A-Z]+ \/api\/admin\//,
  /^[A-Z]+ \/api\/owner\/identity\/admin\//,
  /^[A-Z]+ \/api\/owner\/access\/(user\/|policy\/)/,
  /^[A-Z]+ \/api\/owner\/google-contour(\/|$)/,
  /^[A-Z]+ \/api\/security\/overview$/,
  /^[A-Z]+ \/api\/owner\/system\//,
  /^[A-Z]+ \/api\/owner\/audit\/beheer(\/|$)/,
];
export const isSysteemRoute = (route: string): boolean => SYSTEEM_ROUTES.some((r) => r.test(route));

/** Voer een verzoek uit in een eigen context (router doet dit per route). */
export function metVerzoek<T>(route: string, fn: () => Promise<T>, meta: { ip?: string; ua?: string } = {}): Promise<T> {
  const basis = { route, ip: meta.ip ? String(meta.ip).slice(0, 64) : undefined, ua: meta.ua ? String(meta.ua).slice(0, 300) : undefined, poort: { geverifieerd: false } };
  return opslag.run(isSysteemRoute(route) ? { ...basis, systeem: true } : basis, fn);
}

/**
 * Markeer het lopende verzoek als "van gebruiker userId" (na een geslaagde sessiecontrole). Vanaf hier
 * lopen db-queries van dit verzoek in gebruikerscontext. Ongeldige id's en systeemcontext: genegeerd.
 */
export function zetGebruiker(userId: string, service?: string): void {
  const c = opslag.getStore();
  if (!c || !ID.test(String(userId || ''))) return;
  if (c.poort) c.poort.geverifieerd = true;
  c.actor = userId;
  if (c.systeem) return;
  if (c.userId !== userId) c.werkruimtes = undefined;
  c.userId = userId;
  if (service) c.service = String(service).slice(0, 40);
}

/** Markeer dat dit verzoek een gecontroleerde referentie heeft (geldige sessie of API-token), zonder gebruikerscontext. */
export function sessieGeverifieerd(): void {
  const c = opslag.getStore();
  if (c?.poort) c.poort.geverifieerd = true;
}
/** Heeft dit verzoek een gecontroleerde referentie? (vangnet in auth-poort.ts) */
export const isSessieGeverifieerd = (): boolean => Boolean(opslag.getStore()?.poort?.geverifieerd);

/** Voer fn uit als systeem (BYPASSRLS-rol): voor bewuste gebruikersoverstijgende stappen. */
export function alsSysteem<T>(fn: () => Promise<T>): Promise<T> {
  const c = opslag.getStore();
  return opslag.run({ ...(c || { route: 'systeem' }), systeem: true, werkruimtes: undefined }, fn);
}

/** Gebruikerscontext actief? (dan geldt RLS voor db-queries) */
export function gebruikerVanContext(): { userId: string; service: string; route: string } | null {
  const c = opslag.getStore();
  if (!c || c.systeem || !c.userId) return null;
  return { userId: c.userId, service: c.service || '', route: c.route };
}
