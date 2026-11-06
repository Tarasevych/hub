// Live status van de browserextensie op de site (extensie 0.5, 18.10.2026): ÉÉN bron van waarheid voor het extensiepaneel
// (src/extensie/ExtensieOntgrendeling.tsx), de toestandsmachine in het paneel en de statusregel in het menu «⋯» (src/tech/TechLaag.tsx).
//
// Drie bronnen, samengevoegd:
//  (a) de extensie zelf via de brug (bridge.js) op DEZE pagina: window.postMessage({mrExt:true, type:'status'|'hello', …}). Alleen
//      berichten van dit venster en deze origin; alleen velden uit de whitelist (publiek uit contract §7) worden overgenomen.
//      Bij start vraagt de site er zelf om: window.postMessage({mrExtStatus:true}) (+ mrExtPing voor de «hello» met het extensie-id).
//  (b) de server: GET /api/owner/agents/extensie-status elke 10 s zolang het tabblad zichtbaar is, meteen na elke actie en bij
//      terugkeer naar het tabblad; bij fouten met terugval (10 → 20 → 40 → 60 s). Alleen op mcp.* en admin.* wordt er herhaald
//      gepold (daar staat het paneel); op de andere diensten één keer bij start/terugkeer/actie. Een 403 (dienst niet toegestaan,
//      oude server) stopt het pollen helemaal (G3: geen 403-ruis elke 5 s in het journaal).
//  (c) terugval als de brug zwijgt: externally_connectable PING naar het extensie-id uit de «hello» (of het vaste CRX-id).
// Regel: voor DEZE browser (agentId uit de extensie) wint het lokale bericht als het nieuwer is dan het laatste serverantwoord.
// De site kan hiermee niets ontgrendelen: de ontgrendeling is door de server ondertekend en de extensie controleert hem zelf.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  PRIVE_HOSTS, PRIVE_MAX_DAGEN, STAAT_TEKST, isBrowserCap, isDiagRechtStand, isPriveHost, isToegestaneHost,
  type BrowserCap, type DiagRechtStand, type ExtensieAgentStatus, type ExtensieStaat,
} from '../../shared/extensie-ontgrendeling';
import { vergelijkVersie } from '../../shared/extensie-update';
import { filterLokaleAiKeuze, type LokaleAiKeuze } from '../../shared/lokale-ai-model';

export const POLL_MS = 10_000;
/** Diensten waarop herhaald gepold wordt (zelfde set als EXTENSIE_DIENSTEN op de server). */
export const POLL_DIENSTEN: readonly string[] = ['mcp', 'admin'];
export const pollDienst = (host: string): boolean => POLL_DIENSTEN.some((d) => host === d || host.startsWith(`${d}.`));
export const MAX_TERUGVAL_MS = 60_000;
export const PING_MS = 15_000;
/** Lokaal bericht ouder dan dit → PING als terugval. */
export const LOKAAL_OUD_MS = 20_000;
export const VAST_EXTENSIE_ID = 'ofpffonakgjioahgfejmiblfmbkobmmi';
const EXTENSIE_ID_RE = /^[a-p]{32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSIE_RE = /^\d{1,3}(\.\d{1,4}){0,3}$/;
const STATEN: readonly ExtensieStaat[] = ['niet-gekoppeld', 'vergrendeld', 'ontgrendeld', 'agent'];
const isStaat = (v: unknown): v is ExtensieStaat => typeof v === 'string' && (STATEN as readonly string[]).includes(v);

/** Ruimte van een slot in de extensie (0.6, contract EXT-06 §1). Onbekend → 'prive' (minste rechten). */
export type Slot = 'prive' | 'technisch';
export const SLOTS: readonly Slot[] = ['prive', 'technisch'];
export const slotVan = (v: unknown): Slot => (v === 'technisch' ? 'technisch' : 'prive');

/**
 * 0.6.1 (punt 7 eigenaar 19.10.2026): stand van het Chrome-recht `debugger` in DEZE browser, zoals de extensie hem publiek meldt.
 * De site kan er niets mee veranderen (alleen Chrome geeft rechten) — ze toont hem, zodat «дозвіл є / немає / відкликано» ook
 * buiten de extensie te zien is en de gebruiker niet hoeft te gokken waarom diepe diagnose niets oplevert.
 */
export type LokaalDiagnostiek = { stand: DiagRechtStand; optIn: boolean; actief: boolean; aanvraagbaar: boolean };

/** Eén slot zoals de extensie 0.6 het publiek meldt (`publiek.prive` / `publiek.technisch`). */
export type LokaalSlot = {
  gekoppeld?: boolean; verbonden?: boolean; staat?: ExtensieStaat; exp?: number | null;
  caps?: BrowserCap[]; domeinen?: string[]; aiVerbonden?: boolean; agentId?: string;
};

/** Wat de extensie in DEZE browser over zichzelf zegt (whitelist van «publiek», contract §7). Ontbrekend = niet gemeld. */
export type LokaalPubliek = {
  versie?: string; gekoppeld?: boolean; verbonden?: boolean; staat?: ExtensieStaat; exp?: number | null;
  caps?: BrowserCap[]; domeinen?: string[]; aiVerbonden?: boolean; lokaalVerbonden?: boolean; agentId?: string;
  account?: 'ok' | 'mismatch' | 'unknown'; extensieId?: string;
  /** 0.6: profiel van het tabblad volgens de extensie (uit <meta name="mjn-profiel">). */
  profielTab?: 'gebruiker' | 'technisch';
  /** 0.6: per slot; `technisch: null` = de extensie heeft (en kent) geen technisch slot. */
  prive?: LokaalSlot; technisch?: LokaalSlot | null;
  /** 0.6.1: stand van het debuggerrecht (diepe diagnose). Ontbreekt bij 0.6.0 en ouder. */
  diagnostiek?: LokaalDiagnostiek;
  /** 0.9.0 (EXT090-001): keuzes voor de ingebouwde AI van Chrome (hoofdschakelaar + API's); null = extensie meldt niets. */
  lokaleAi?: LokaleAiKeuze | null;
};

const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
/** Velden die zowel bovenaan (0.5) als per slot (0.6) kunnen staan. */
function filterSlotVelden(d: Record<string, unknown>, uit: LokaalSlot): void {
  const gekoppeld = bool(d.gekoppeld) ?? bool(d.paired); if (gekoppeld !== undefined) uit.gekoppeld = gekoppeld;
  const verbonden = bool(d.verbonden) ?? bool(d.connected); if (verbonden !== undefined) uit.verbonden = verbonden;
  if (isStaat(d.staat)) uit.staat = d.staat;
  if (d.exp === null) uit.exp = null; else if (typeof d.exp === 'number' && Number.isFinite(d.exp) && d.exp > 0) uit.exp = d.exp;
  if (Array.isArray(d.caps)) uit.caps = [...new Set(d.caps.filter(isBrowserCap))];
  if (Array.isArray(d.domeinen)) uit.domeinen = [...new Set(d.domeinen.filter(isToegestaneHost))];
  const ai = bool(d.aiVerbonden); if (ai !== undefined) uit.aiVerbonden = ai;
  if (typeof d.agentId === 'string' && UUID_RE.test(d.agentId)) uit.agentId = d.agentId.toLowerCase();
}
/** Neemt alleen bekende velden met het juiste type over; al het andere (sleutels, tokens, onbekende velden) valt weg. */
export function filterPubliek(data: unknown): LokaalPubliek | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const uit: LokaalPubliek = {};
  const versie = typeof d.versie === 'string' ? d.versie : typeof d.version === 'string' ? d.version : undefined;
  if (versie && VERSIE_RE.test(versie)) uit.versie = versie;
  filterSlotVelden(d, uit);
  const lv = bool(d.lokaalVerbonden); if (lv !== undefined) uit.lokaalVerbonden = lv;
  if (d.account === 'ok' || d.account === 'mismatch' || d.account === 'unknown') uit.account = d.account;
  if (typeof d.extensionId === 'string' && EXTENSIE_ID_RE.test(d.extensionId)) uit.extensieId = d.extensionId;
  if (d.profielTab === 'gebruiker' || d.profielTab === 'technisch') uit.profielTab = d.profielTab;
  // 0.6.1: alleen deze vier velden, elk met het juiste type; een onbekende stand valt weg (dan weet de site het gewoon niet).
  if (d.diagnostiek && typeof d.diagnostiek === 'object' && !Array.isArray(d.diagnostiek)) {
    const g = d.diagnostiek as Record<string, unknown>;
    if (isDiagRechtStand(g.stand)) uit.diagnostiek = { stand: g.stand, optIn: g.optIn === true, actief: g.actief === true, aanvraagbaar: g.aanvraagbaar === true };
  }
  if ('lokaleAi' in d) uit.lokaleAi = filterLokaleAiKeuze(d.lokaleAi);
  for (const s of SLOTS) {
    const v = d[s];
    if (v === null && s === 'technisch') uit.technisch = null;
    else if (v && typeof v === 'object' && !Array.isArray(v)) { const slot: LokaalSlot = {}; filterSlotVelden(v as Record<string, unknown>, slot); uit[s] = slot; }
  }
  return uit;
}

// ------------------------------------------------------------------------------------------------ recht (0.5 én 0.6)
/** Recht op het technische slot (0.5: het hele `recht`; 0.6: `recht.technisch`). */
export type TechRecht = { magOntgrendelen: boolean; code?: string; rollen: string[]; caps: BrowserCap[]; activatieTot: number | null; passkeys: number };
/** Recht op het slot «як користувач» (0.6: `recht.prive`). */
export type PriveRecht = { mag: boolean; code?: string; caps: BrowserCap[]; maxDagen: number; domeinen: string[]; lokaal: boolean; stapOpGeldig: boolean };
/** Genormaliseerd: `techProfiel` null = onbekend (oude server zonder `recht.technisch`). */
export type Recht = { technisch: TechRecht | null; prive: PriveRecht | null; techProfiel: boolean | null };
const caps = (v: unknown): BrowserCap[] => (Array.isArray(v) ? [...new Set(v.filter(isBrowserCap))] : []);
const code = (v: unknown) => (typeof v === 'string' && /^[A-Z_]{2,40}$/.test(v) ? v : undefined);
const getal = (v: unknown, std: number) => (typeof v === 'number' && Number.isFinite(v) ? v : std);
function techRechtVan(r: Record<string, unknown>, mag: unknown): TechRecht {
  const c = code(r.code);
  return {
    magOntgrendelen: mag === true, ...(c ? { code: c } : {}), rollen: Array.isArray(r.rollen) ? r.rollen.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
    caps: caps(r.caps), activatieTot: typeof r.activatieTot === 'number' && r.activatieTot > 0 ? r.activatieTot : null, passkeys: getal(r.passkeys, 0),
  };
}
/** 0.5-vorm `{magOntgrendelen, …}` of 0.6-vorm `{prive:{mag,…}, technisch:{mag,…}|null}` → één vorm. */
export function normaliseerRecht(recht: unknown): Recht {
  if (!recht || typeof recht !== 'object') return { technisch: null, prive: null, techProfiel: null };
  const r = recht as Record<string, unknown>;
  if ('prive' in r || 'technisch' in r) {
    const p = r.prive && typeof r.prive === 'object' ? r.prive as Record<string, unknown> : null;
    const t = r.technisch && typeof r.technisch === 'object' ? r.technisch as Record<string, unknown> : null;
    const pc = p ? code(p.code) : undefined;
    return {
      prive: p ? {
        mag: p.mag === true, ...(pc ? { code: pc } : {}), caps: caps(p.caps), maxDagen: Math.max(1, Math.min(PRIVE_MAX_DAGEN, getal(p.maxDagen, PRIVE_MAX_DAGEN))),
        domeinen: Array.isArray(p.domeinen) ? [...new Set(p.domeinen.filter(isPriveHost))] : [...PRIVE_HOSTS], lokaal: p.lokaal !== false, stapOpGeldig: p.stapOpGeldig === true,
      } : null,
      technisch: t ? techRechtVan(t, t.mag ?? t.magOntgrendelen) : null,
      techProfiel: r.technisch === null ? false : t ? true : null,
    };
  }
  const tr = techRechtVan(r, r.magOntgrendelen);
  return { technisch: tr, prive: null, techProfiel: tr.code === 'GEEN_TECH_PROFIEL' ? false : null };
}

type Bericht = { source: unknown; origin: string; data: unknown };
/** Alleen berichten van dit venster, deze origin, van de extensie (mrExt) en van het type status of hello. */
export function lokaalBericht(e: Bericht, venster: unknown, origin: string): { type: 'status' | 'hello'; publiek: LokaalPubliek } | null {
  if (e.source !== venster || e.origin !== origin || !e.data || typeof e.data !== 'object') return null;
  const d = e.data as Record<string, unknown>;
  if (d.mrExt !== true || (d.type !== 'status' && d.type !== 'hello')) return null;
  const publiek = filterPubliek(d);
  return publiek ? { type: d.type, publiek } : null;
}

/** Eén gekoppelde browser-koppeling (= één slot) zoals de server hem meldt; 0.6 voegt `ruimte` toe. */
export type AgentStatus = Omit<ExtensieAgentStatus, 'ruimte' | 'browserId' | 'ontgrendeling'> & { ruimte?: unknown; browserId?: string; ontgrendeling: Ontgrendeling };
/** Antwoord van GET extensie-status: 0.5 (`recht` plat) of 0.6 (`recht.prive`/`recht.technisch`, `ruimte` per agent). */
export type StatusAntwoord = { agenten: AgentStatus[]; recht?: unknown; nu: number };

export type LiveToestand = {
  geladen: boolean;                       // eerste serverantwoord (of fout) binnen
  antwoord: StatusAntwoord | null;
  serverOp: number;                       // lokale tijd van het laatste serverantwoord
  scheef: number;                         // servertijd − lokale tijd
  lokaal: LokaalPubliek | null;
  lokaalOp: number;                       // lokale tijd van het laatste extensiebericht
  staatOp: number;                        // … waarin een staat stond (alleen dan kan lokaal winnen)
  extensieId: string;
  fout: string;                           // laatste foutcode van de server ('' = geen)
};
export const LEEG: LiveToestand = Object.freeze({ geladen: false, antwoord: null, serverOp: 0, scheef: 0, lokaal: null, lokaalOp: 0, staatOp: 0, extensieId: '', fout: '' }) as LiveToestand;

type Ontgrendeling = ExtensieAgentStatus['ontgrendeling'];
export type ExtensieLive = {
  geladen: boolean;
  staat: ExtensieStaat | 'onbekend';
  ontgrendeling: Ontgrendeling;
  ai: ExtensieAgentStatus['ai'];
  lokaal: { verbonden: boolean; toegestaan: boolean };
  online: boolean;
  /** Recht op het TECHNISCHE slot (passkey-ontgrendeling; 0.5-vorm). */
  recht: TechRecht | null;
  /** 0.6: recht op het slot «як користувач» (null = oude server). */
  rechtPrive: PriveRecht | null;
  /** 0.6: heeft het account een technisch profiel? null = onbekend (oude server). */
  techProfiel: boolean | null;
  /** Slot van de getoonde koppeling ('prive' bij oude servers zonder ruimte). */
  ruimte: Slot;
  bijgewerkt: number;                     // lokale tijd van de laatste gebruikte bron
  bron: 'lokaal' | 'server' | 'geen';
  agent: AgentStatus | null;
  agentId: string | null;
  agenten: AgentStatus[];
  /** Heeft deze gebruiker minstens één gekoppelde browser (server) of meldt de extensie hier een koppeling? */
  heeftBrowser: boolean;
  /** Hoort de getoonde agent bij de extensie in DEZE browser? */
  dezeBrowser: boolean;
  versie: string;
  extensie: LokaalPubliek | null;
  /** 0.6.1: stand van het debuggerrecht in DEZE browser; null als de extensie hier niet draait of het (nog) niet meldt. */
  diagnostiek: LokaalDiagnostiek | null;
  scheef: number;
  fout: string;
};

/** Welke agent tonen: gevraagd id → extensie in deze browser → online → laatst gezien. */
function kiesAgent(agenten: AgentStatus[], gevraagd: string | undefined, lokaalId: string | undefined): AgentStatus | null {
  if (gevraagd) return agenten.find((a) => a.agentId === gevraagd) ?? null;
  if (lokaalId) { const a = agenten.find((x) => x.agentId === lokaalId); if (a) return a; }
  if (!agenten.length) return null;
  return [...agenten].sort((a, b) => Number(b.online) - Number(a.online) || (b.laatstGezien ?? 0) - (a.laatstGezien ?? 0))[0];
}

/** Lokaal bericht voor één slot: 0.6 per slot (`l.prive`/`l.technisch`), 0.5 bovenaan (één koppeling, toen altijd technisch bedoeld,
 * maar zonder ruimte: we nemen hem voor de koppeling met dezelfde agentId, ongeacht het slot). */
function lokaalSlot(l: LokaalPubliek | null, slot: Slot | undefined): LokaalSlot | null {
  if (!l) return null;
  if (slot && (l.prive !== undefined || l.technisch !== undefined)) return l[slot] ?? null;
  if (!slot && (l.prive || l.technisch)) return l.technisch?.agentId && l.technisch.gekoppeld !== false ? l.technisch : l.prive ?? null;
  return l;
}

/** Zuiver: voegt server en lokaal samen voor één agent. `nu` = lokale tijd. `ruimte` (0.6) = alleen koppelingen van dat slot. */
export function combineer(t: LiveToestand, agentId?: string, nu = Date.now(), ruimte?: Slot): ExtensieLive {
  const alle: AgentStatus[] = t.antwoord?.agenten ?? [];
  // Gevraagde koppeling zonder slot: het slot is dat van die koppeling (zodat het juiste lokale slot meetelt).
  const slot: Slot | undefined = ruimte ?? (agentId ? (() => { const a = alle.find((x) => x.agentId === agentId); return a ? slotVan(a.ruimte) : undefined; })() : undefined);
  const agenten = ruimte ? alle.filter((a) => slotVan(a.ruimte) === ruimte) : alle;
  const l0 = t.lokaal;
  const l = lokaalSlot(l0, slot);
  const lokaalId = l?.gekoppeld === false ? undefined : l?.agentId;
  // 0.6 zonder agentId per slot: het lokale slot hoort bij de enige koppeling van dat slot (anders weten we het niet zeker).
  const vanSlot = slot ? alle.filter((a) => slotVan(a.ruimte) === slot) : [];
  const enige = slot && l && l !== l0 && !l.agentId && l.gekoppeld !== false && vanSlot.length === 1 ? vanSlot[0].agentId : undefined;
  const agent = kiesAgent(agenten, agentId, lokaalId ?? enige);
  const id = agent?.agentId ?? (agentId || lokaalId || null);
  const dezeBrowser = !!id && ((!!lokaalId && id === lokaalId) || (!!enige && id === enige));
  const recht = normaliseerRecht(t.antwoord?.recht);
  let staat: ExtensieStaat | 'onbekend' = agent ? agent.staat : 'niet-gekoppeld';
  let ontgrendeling: Ontgrendeling = agent?.ontgrendeling ?? null;
  let ai = agent?.ai ?? { verbonden: false, agenten: [] };
  let online = !!agent?.online;
  let lokaalVerbonden = !!agent?.lokaal?.verbonden;
  let versie = agent?.versie ?? '';
  let bron: ExtensieLive['bron'] = agent ? 'server' : 'geen';
  let bijgewerkt = agent ? t.serverOp : 0;
  if (dezeBrowser && l && l.staat && t.staatOp > t.serverOp) {
    // Lokaal is nieuwer: de extensie weet het zelf het best voor deze browser.
    bron = 'lokaal'; bijgewerkt = t.staatOp;
    staat = l.staat;
    if (l.staat === 'ontgrendeld' || l.staat === 'agent') {
      const basis: NonNullable<Ontgrendeling> = ontgrendeling ?? { gid: '', caps: [], domeinen: [], lokaal: false, ruimte: slot ?? 'prive', begin: 0, eind: 0, rollen: [], bevestigdMet: null };
      // exp komt uit de door de server ondertekende ontgrendeling: al in servertijd, dus niet corrigeren.
      ontgrendeling = { ...basis, caps: l.caps ?? basis.caps, domeinen: l.domeinen ?? basis.domeinen, eind: typeof l.exp === 'number' ? l.exp : basis.eind };
    } else ontgrendeling = null;
    if (l.aiVerbonden !== undefined) ai = { verbonden: l.aiVerbonden, agenten: l.aiVerbonden ? ai.agenten : [] };
    if (l.verbonden !== undefined) online = l.verbonden;
    if (l0?.lokaalVerbonden !== undefined) lokaalVerbonden = l0.lokaalVerbonden;
  }
  if (dezeBrowser && l0?.versie) versie = l0.versie;
  // Server weet een actieve ontgrendeling, de extensie meldde (nog) niets: de server is dan de bron.
  if (staat === 'onbekend' && ontgrendeling) staat = 'ontgrendeld';
  // Verlopen telt meteen als vergrendeld (de extensie doet hetzelfde met haar alarm); tijd in servertijd.
  if (ontgrendeling && ontgrendeling.eind > 0 && ontgrendeling.eind <= nu + t.scheef) {
    ontgrendeling = null;
    if (staat === 'ontgrendeld' || staat === 'agent') staat = 'vergrendeld';
  }
  if ((staat === 'ontgrendeld' || staat === 'agent') && !ontgrendeling && bron === 'server') staat = 'vergrendeld';
  if (staat === 'ontgrendeld' && ai.verbonden) staat = 'agent';
  if (staat === 'agent' && !ai.verbonden) staat = ontgrendeling ? 'ontgrendeld' : 'vergrendeld';
  return {
    geladen: t.geladen, staat, ontgrendeling, ai, online, lokaal: { verbonden: lokaalVerbonden, toegestaan: !!ontgrendeling?.lokaal },
    recht: recht.technisch, rechtPrive: recht.prive, techProfiel: recht.techProfiel, ruimte: agent ? slotVan(agent.ruimte) : slot ?? 'prive',
    bijgewerkt, bron, agent, agentId: id, agenten,
    heeftBrowser: agenten.length > 0 || !!(l?.gekoppeld && (l.agentId || enige)), dezeBrowser, versie, extensie: l0,
    // Alleen de extensie in DEZE browser weet het; de server ziet Chrome-rechten niet en verzint ze dus ook niet.
    diagnostiek: l0?.diagnostiek ?? null,
    scheef: t.scheef, fout: t.fout,
  };
}

// ------------------------------------------------------------------------------------------------ store
type Venster = {
  addEventListener: (t: 'message', f: (e: Bericht) => void) => void;
  removeEventListener: (t: 'message', f: (e: Bericht) => void) => void;
  postMessage: (m: unknown, origin: string) => void;
};
type Doc = { hidden: boolean; addEventListener: (t: 'visibilitychange', f: () => void) => void; removeEventListener: (t: 'visibilitychange', f: () => void) => void };
export type LiveDeps = {
  haal: () => Promise<StatusAntwoord>;
  ping?: (extensieId: string) => Promise<unknown>;
  venster: Venster; document: Doc; origin: string;
  nu?: () => number;
  setTimeout?: (f: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
  /** false = niet herhaald pollen (alleen bij start, terugkeer naar het tabblad en na een actie); standaard true. */
  pollen?: boolean;
};
export type ExtensieLiveStore = {
  get: () => LiveToestand;
  subscribe: (f: () => void) => () => void;
  /** Meteen opnieuw vragen (na een actie); wacht op het antwoord. */
  vernieuw: () => Promise<void>;
  /** Optimistisch na een geslaagde actie: de server heeft het al bevestigd, de volgende poll bevestigt het nog eens. */
  zetAgent: (agentId: string, patch: Partial<ExtensieAgentStatus>) => void;
  /** Voor tests en diagnose. */
  info: () => { actief: boolean; gepland: number | null; fouten: number; pings: number; polls: number; gestopt: boolean };
};

const foutCodeVan = (e: unknown) => {
  const v = e as { status?: number; message?: string };
  return v?.status === 401 ? 'NIET_INGELOGD' : String(v?.message || 'FOUT').slice(0, 60);
};

export function maakExtensieLive(deps: LiveDeps): ExtensieLiveStore {
  const nu = deps.nu ?? (() => Date.now());
  const zetTimer = deps.setTimeout ?? ((f, ms) => globalThis.setTimeout(f, ms));
  const wisTimer = deps.clearTimeout ?? ((h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  let t: LiveToestand = LEEG;
  const luisteraars = new Set<() => void>();
  let actief = false, timer: unknown = null, gepland: number | null = null, fouten = 0, bezig: Promise<void> | null = null, laatstePing = 0, pings = 0, polls = 0;
  // gestopt: de server weigerde met 403 (dienst niet toegestaan): niet meer vragen tot een uitdrukkelijke vernieuw().
  let gestopt = false;
  const pollen = deps.pollen !== false;
  const zet = (p: Partial<LiveToestand>) => { t = { ...t, ...p }; for (const f of luisteraars) { try { f(); } catch { /* luisteraar mag de store niet breken */ } } };

  const neemLokaal = (publiek: LokaalPubliek) => {
    const op = nu();
    const vorig = t.lokaal ?? {};
    // EXT090-001: na bijwerken/herladen van de extensie kan een VERWEESDE brug van de oude versie nog op deze pagina hangen en
    // «niet gekoppeld» melden naast de nieuwe. Een bericht met een LAGERE versie dan de hoogste die deze pagina al zag, telt niet:
    // zo valt de sessie op de site niet weg en is F5 niet nodig.
    if (publiek.versie && vorig.versie && vergelijkVersie(publiek.versie, vorig.versie) < 0) return;
    // Een andere agent (opnieuw gekoppeld) → oude velden niet meenemen.
    const basis = publiek.agentId && vorig.agentId && publiek.agentId !== vorig.agentId ? {} : vorig;
    zet({ lokaal: { ...basis, ...publiek }, lokaalOp: op, ...(publiek.staat ? { staatOp: op } : {}), ...(publiek.extensieId ? { extensieId: publiek.extensieId } : {}) });
  };
  const opBericht = (e: Bericht) => { const b = lokaalBericht(e, deps.venster, deps.origin); if (b) neemLokaal(b.publiek); };

  const plan = (ms: number) => {
    if (timer !== null) wisTimer(timer);
    timer = null; gepland = null;
    if (!actief || deps.document.hidden || gestopt || !pollen) return;
    gepland = ms;
    timer = zetTimer(() => { timer = null; gepland = null; void tik(); }, ms);
  };
  const pingAls = async () => {
    if (!deps.ping || nu() - laatstePing < PING_MS || (t.lokaalOp && nu() - t.lokaalOp < LOKAAL_OUD_MS)) return;
    laatstePing = nu(); pings++;
    try { const res = await deps.ping(t.extensieId || VAST_EXTENSIE_ID); const r = res as { ok?: unknown } | null; if (r && r.ok === true) { const p = filterPubliek(r); if (p) neemLokaal(p); } } catch { /* geen extensie */ }
  };
  const haalNu = async () => {
    polls++;
    try {
      const a = await deps.haal();
      fouten = 0;
      const op = nu();
      zet({ geladen: true, antwoord: a && Array.isArray(a.agenten) ? a : { agenten: [], recht: a?.recht ?? null, nu: op } as StatusAntwoord, serverOp: op, scheef: a && Number(a.nu) > 0 ? Number(a.nu) - op : t.scheef, fout: '' });
    } catch (e) {
      fouten++;
      if ((e as { status?: number } | null)?.status === 403) gestopt = true;
      zet({ geladen: true, fout: foutCodeVan(e) });
    }
  };
  const tik = async () => {
    if (bezig) return bezig;
    if (gestopt) return;
    bezig = (async () => { await haalNu(); void pingAls(); })().finally(() => { bezig = null; });
    await bezig;
    plan(fouten ? Math.min(MAX_TERUGVAL_MS, POLL_MS * 2 ** fouten) : POLL_MS);
  };
  // Verborgen: geen timer meer (plan() plant niets als het document verborgen is). Zichtbaar: meteen vragen.
  const zichtbaar = () => { if (deps.document.hidden) plan(0); else if (!gestopt) void tik(); };

  const start = () => {
    actief = true;
    deps.venster.addEventListener('message', opBericht);
    deps.document.addEventListener('visibilitychange', zichtbaar);
    try { deps.venster.postMessage({ mrExtStatus: true }, deps.origin); deps.venster.postMessage({ mrExtPing: true }, deps.origin); } catch { /* geen venster */ }
    if (!deps.document.hidden) void tik();
  };
  const stop = () => {
    actief = false; gestopt = false;
    if (timer !== null) wisTimer(timer);
    timer = null; gepland = null;
    deps.venster.removeEventListener('message', opBericht);
    deps.document.removeEventListener('visibilitychange', zichtbaar);
  };

  return {
    get: () => t,
    subscribe: (f) => {
      luisteraars.add(f);
      if (luisteraars.size === 1 && !actief) start();
      return () => { luisteraars.delete(f); if (luisteraars.size === 0 && actief) stop(); };
    },
    vernieuw: async () => { if (bezig) await bezig; gestopt = false; await tik(); },
    zetAgent: (agentId, patch) => {
      if (!t.antwoord) return;
      zet({ antwoord: { ...t.antwoord, agenten: t.antwoord.agenten.map((a) => (a.agentId === agentId ? { ...a, ...patch } : a)) }, serverOp: Math.max(nu(), t.staatOp + 1) });
    },
    info: () => ({ actief, gepland, fouten, pings, polls, gestopt }),
  };
}

// ------------------------------------------------------------------------------------------------ standaard (browser)
let standaard: ExtensieLiveStore | null = null;
/** De gedeelde store van dit tabblad; pas bij het eerste gebruik gemaakt (geen werk bij importeren, ook niet in tests). */
export function extensieLive(): ExtensieLiveStore {
  if (standaard) return standaard;
  standaard = maakExtensieLive({
    haal: async () => {
      const [{ api, ApiError }, { techBody }] = await Promise.all([import('../platform/client'), import('../tech/tech-opslag')]);
      const body = techBody();
      try { return (await api.get('/api/owner/agents/extensie-status', body)).data as StatusAntwoord; }
      catch (e) {
        // Terugval als de server de GET (nog) niet kent: zelfde route als POST met de sessievelden in de body.
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return (await api.post('/api/owner/agents/extensie-status', body)).data as StatusAntwoord;
        throw e;
      }
    },
    ping: async (id) => (await import('../extensie-toestand')).sendToExtension(id, { type: 'PING' }, 4000),
    venster: window as unknown as Venster, document: document as unknown as Doc, origin: location.origin,
    pollen: pollDienst(location.hostname),
  });
  return standaard;
}
/** Voor tests: een eigen store als standaard gebruiken (null = terug naar de browser-store). */
export function zetExtensieLive(s: ExtensieLiveStore | null): void { standaard = s; }
export const vernieuwExtensieStatus = () => extensieLive().vernieuw();

/** React: live status van één browser (agentId) of van de browser van deze pagina. Herrendert ook op het moment dat de ontgrendeling verloopt. */
export function useExtensieLive(agentId?: string, ruimte?: Slot): ExtensieLive {
  const store = extensieLive();
  const t = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [tik, setTik] = useState(0);
  const live = useMemo(() => combineer(t, agentId, Date.now(), ruimte), [t, agentId, ruimte, tik]); // eslint-disable-line react-hooks/exhaustive-deps
  const eind = live.ontgrendeling?.eind ?? 0;
  useEffect(() => {
    if (!eind) return;
    const over = eind - (Date.now() + live.scheef);
    if (over <= 0) return;
    const h = window.setTimeout(() => setTik((x) => x + 1), Math.min(over + 50, 2 ** 31 - 1));
    return () => window.clearTimeout(h);
  }, [eind, live.scheef]);
  return live;
}

/** React: de ruwe samengevoegde toestand (voor lijsten met meerdere browsers: combineer(t, agentId) per browser). */
export function useExtensieLiveToestand(): LiveToestand {
  const store = extensieLive();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** «42 хв», «1 год 5 хв» (uk) of «42 min», «1 u 5 min» (nl).
 *  E-04: vanaf een uur op hele minuten afronden (1 u + 3 s → «1 год», niet «1 год 1 хв»); onder een uur blijft ceil (30 s → «1 хв», nooit «0 хв»). */
export function restTekst(ms: number, uk: boolean): string {
  const ruw = Math.max(0, ms / 60000);
  const m = ruw >= 59.5 ? Math.round(ruw) : Math.ceil(ruw);
  if (m >= 60) return `${Math.floor(m / 60)} ${uk ? 'год' : 'u'}${m % 60 ? ` ${m % 60} ${uk ? 'хв' : 'min'}` : ''}`;
  return `${m} ${uk ? 'хв' : 'min'}`;
}

const geenAbonnement = () => () => undefined;
const leeg = () => LEEG;
export type ExtensieRegel = { staat: ExtensieStaat; tekst: string; uitleg: string; url: string };
/** Korte statusregel (menu «⋯» van de technische band): «Розширення: Доступ відкрито · 42 хв». Alleen met `aan` wordt er
 * geabonneerd (en dus gepold); null als de gebruiker geen gekoppelde browser heeft. */
export function regelVan(live: ExtensieLive, uk: boolean, nu = Date.now(), host = typeof location !== 'undefined' ? location.host : ''): ExtensieRegel | null {
  if (!live.heeftBrowser) return null;
  const staat: ExtensieStaat = live.staat === 'onbekend' ? 'vergrendeld' : live.staat;
  const rest = live.ontgrendeling ? live.ontgrendeling.eind - (nu + live.scheef) : 0;
  const naam = uk ? STAAT_TEKST[staat][0] : STAAT_TEKST[staat][1];
  const tekst = `${uk ? 'Розширення' : 'Extensie'}: ${naam}${(staat === 'ontgrendeld' || staat === 'agent') && rest > 0 ? ` · ${restTekst(rest, uk)}` : ''}`;
  const uitleg = staat === 'vergrendeld' ? (uk ? 'Розблокувати з Passkey' : 'Ontgrendelen met passkey') : staat === 'niet-gekoppeld' ? (uk ? 'Підключити розширення' : 'Extensie koppelen') : (uk ? 'Стан і відкликання' : 'Stand en intrekken');
  // Hub «Підключення ШІ» → tab «Розширення браузера» (oude #extension blijft werken).
  const pad = '/agents?ontgrendelen=1#extensie';
  return { staat, tekst, uitleg, url: host === 'mcp.tarasevych.com' ? pad : `https://mcp.tarasevych.com${pad}` };
}
export function useExtensieRegel(aan: boolean, uk: boolean): ExtensieRegel | null {
  const store = extensieLive();
  const t = useSyncExternalStore(aan ? store.subscribe : geenAbonnement, aan ? store.get : leeg, aan ? store.get : leeg);
  // De band loopt = technisch profiel: het technische slot als dat bestaat, anders (0.5/oude server) de enige koppeling.
  if (!aan) return null;
  const tech = combineer(t, undefined, Date.now(), 'technisch');
  return regelVan(tech.heeftBrowser ? tech : combineer(t), uk);
}
