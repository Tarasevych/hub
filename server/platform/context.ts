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
  /** Lui geladen: ruimtes (workspaces) waarvan userId eigenaar of actief lid is, met de rol daarin (alleen voor audit). */
  werkruimtes?: Promise<Map<string, string>>;
  /**
   * Audit-fix 8: is er in dit verzoek een échte referentie gecontroleerd (sessie via zetGebruiker /
   * sessieGeverifieerd, of een API-token)? Gedeeld object, zodat het ook vanuit alsSysteem() doorwerkt.
   */
  poort?: { geverifieerd: boolean };
  /** Tabbladcontext van de sessie (48 hex): bindt een actief technisch profiel aan dit verzoek (journaalveld «профіль», etap E). */
  tab?: string;
  /** Id van een toegestaan ondersteuningsverzoek als dit verzoek «van naam van» iemand gebeurt (journaalveld «від імені»). */
  namens?: string;
  /** Audit 18.10.2026 (K1): dit verzoek doet een AI-agent (slug) namens de eigenaar (namens-sessie, backend/agent-namens.ts). */
  agent?: string;
  /**
   * «Подивитися як користувач» (backend/impersonatie.ts, 0068): een beheerder bekijkt met toestemming de site van userId.
   * id = de impersonatie-rij, door = de beheerder (komt als actor in ELKE journaalregel, actorType 'impersonatie').
   */
  impersonatie?: { id: string; door: string; doorEmail?: string; /** db.ts zet dit als een schrijfpoging is geweigerd */ geblokkeerd?: boolean };
  /** In dit verzoek mag niets in app.records geschreven worden (impersonatie zonder recht op acties): db.ts weigert. */
  alleenLezen?: boolean;
  /** Lui: context voor de audit (één opzoeking per verzoek). */
  auditCtx?: Promise<Record<string, string>>;
  /** Ruimtes-scheiding (0123): id van de ANKER-aanmeldsessie van de site die dit verzoek droeg (alleen gezet na een geslaagde sessiecontrole). */
  sessieId?: string;
  /** Ruimtes-scheiding (0123): de door de server berekende ruimte van dit verzoek (backend/ruimte-sessie.ts → ruimteVanSessie). Nooit uit de client. */
  ruimte?: 'prive' | 'technisch';
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
  const basis: VerzoekContext = { route, ip: meta.ip ? String(meta.ip).slice(0, 64) : undefined, ua: meta.ua ? String(meta.ua).slice(0, 300) : undefined, poort: { geverifieerd: false } };
  // Impersonatie (0068): een in-process aanroep binnen metImpersonatie erft de markering (zelfde object) en «alleen lezen».
  // Een HTTP-verzoek heeft nooit een ouder-context (server/start.ts roept de handler buiten elke context aan).
  const ouder = opslag.getStore();
  if (ouder?.impersonatie) { basis.impersonatie = ouder.impersonatie; basis.namens = ouder.impersonatie.id; if (ouder.alleenLezen) basis.alleenLezen = true; }
  return opslag.run(isSysteemRoute(route) ? { ...basis, systeem: true } : basis, fn);
}

/**
 * Markeer het lopende verzoek als "van gebruiker userId" (na een geslaagde sessiecontrole). Vanaf hier
 * lopen db-queries van dit verzoek in gebruikerscontext. Ongeldige id's en systeemcontext: genegeerd.
 */
export function zetGebruiker(userId: string, service?: string, tab?: string, sessieId?: string): void {
  const c = opslag.getStore();
  if (!c || !ID.test(String(userId || ''))) return;
  // Andere gebruiker of andere sessie in hetzelfde verzoek: een eerder berekende ruimte geldt niet meer.
  const sid = sessieId && ID.test(String(sessieId)) ? String(sessieId) : undefined;
  if (c.actor !== userId || (sid && c.sessieId !== sid)) c.ruimte = undefined;
  if (sid) c.sessieId = sid;
  if (c.poort) c.poort.geverifieerd = true;
  if (c.actor !== userId) c.auditCtx = undefined;
  c.actor = userId;
  // Ook op systeemroutes (beheer): juist daar telt welk technisch profiel de actie deed.
  if (tab && /^[a-f0-9]{48}$/.test(tab) && c.tab !== tab) { c.tab = tab; c.auditCtx = undefined; }
  if (c.systeem) return;
  if (c.userId !== userId) c.werkruimtes = undefined;
  c.userId = userId;
  if (service) c.service = String(service).slice(0, 40);
}

/** Dit verzoek gebeurt namens iemand anders (ondersteuning met toestemming): komt in het journaalveld «від імені». */
export function zetNamens(verzoekId: string, agent?: string): void {
  const c = opslag.getStore();
  if (!c || !/^[0-9a-f-]{36}$/i.test(String(verzoekId || ''))) return;
  c.namens = verzoekId; c.auditCtx = undefined;
  if (agent && /^[a-z][a-z0-9-]{1,31}$/.test(agent)) c.agent = agent;
}

/** Dit verzoek gebeurt door beheerder `door` die met toestemming de site van de gebruiker bekijkt (impersonatie, 0068). */
export function zetImpersonatie(id: string, door: string, opties: { alleenLezen: boolean; doorEmail?: string }): void {
  const c = opslag.getStore();
  if (!c || !/^[0-9a-f-]{36}$/i.test(String(id || '')) || !ID.test(String(door || ''))) return;
  c.impersonatie = { id, door, ...(opties.doorEmail ? { doorEmail: String(opties.doorEmail).slice(0, 200) } : {}) };
  c.namens = id; c.auditCtx = undefined;
  if (opties.alleenLezen) c.alleenLezen = true;
}
/** Voer fn (de in-process aanroep van backend/impersonatie.ts) uit met de impersonatie-markering; elke route daarbinnen erft ze. */
export function metImpersonatie<T>(imp: { id: string; door: string; doorEmail?: string }, alleenLezen: boolean, fn: () => Promise<T>): Promise<{ waarde: T; geblokkeerd: boolean }> {
  const markering = { id: imp.id, door: imp.door, ...(imp.doorEmail ? { doorEmail: String(imp.doorEmail).slice(0, 200) } : {}), geblokkeerd: false };
  return opslag.run({ route: 'impersonatie', impersonatie: markering, namens: imp.id, ...(alleenLezen ? { alleenLezen: true } : {}) }, async () => ({ waarde: await fn(), geblokkeerd: markering.geblokkeerd }));
}
/** Is schrijven in dit verzoek verboden (impersonatie alleen-lezen)? */
export const isAlleenLezen = (): boolean => Boolean(opslag.getStore()?.alleenLezen);

/** Markeer dat dit verzoek een gecontroleerde referentie heeft (geldige sessie of API-token), zonder gebruikerscontext. */
export function sessieGeverifieerd(): void {
  const c = opslag.getStore();
  if (c?.poort) c.poort.geverifieerd = true;
}
/** Heeft dit verzoek een gecontroleerde referentie? (vangnet in auth-poort.ts) */
export const isSessieGeverifieerd = (): boolean => Boolean(opslag.getStore()?.poort?.geverifieerd);

/**
 * SEC-002 (wolk-03, 12.11.2026): voer fn uit ZONDER de verzoekcontext van de aanroeper. Voor achtergrondwerk dat binnen een
 * verzoek gestart wordt (setInterval, setTimeout, een losgelaten belofte): AsyncLocalStorage geeft de context van het
 * verzoek anders door aan ELKE latere tik — gebruiker en RLS (app.user_id), impersonatie en «alleen lezen» van wie het eerst
 * kwam, voor altijd. Binnen fn is huidigeContext() undefined; daarna staat de context van de aanroeper er weer.
 */
export function buitenVerzoek<T>(fn: () => T): T {
  return opslag.exit(fn);
}

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

/** Ruimtes-scheiding (0123): de berekende ruimte van dit verzoek vastleggen (alleen backend/ruimte-sessie.ts roept dit aan). */
export function zetRuimte(ruimte: 'prive' | 'technisch'): void {
  const c = opslag.getStore();
  if (c && (ruimte === 'prive' || ruimte === 'technisch')) c.ruimte = ruimte;
}
