// «Доступи»: gegevens en acties. Eén kleine store per onderdeel («Мої доступи», «Усі користувачі»), gelezen met useSyncExternalStore,
// zodat een actie de lijst METEEN bijwerkt (optimistisch) en daarna de server opnieuw vraagt — nooit de pagina herladen.
// Alleen bestaande routes (TabAi, TabTokens, AiToestemmingen, ExtensieOntgrendeling) plus de nieuwe uit contract 0.6 §2/§3.
// Netwerk via vervangbare deps (tests: zetToegangDeps). Step-up (403 STEP_UP_REQUIRED) handelt platform/client.ts zelf af:
// venster «Підтвердіть доступ», daarna één herhaling.
import { useSyncExternalStore } from 'react';
import { api } from '../../platform/client';
import { sessionBody } from '../../agenten-gegevens';
import { techBody } from '../../tech/tech-opslag';
import {
  beleidVelden, bouwRijen, normApparaten, normBeheer, normBeleid, normExtStatus, normGrants, normOauth, normOntgrendeling, normTokens,
  type Apparaat, type BeheerGebruiker, type Beleid, type ExtStatus, type Grant, type Oauth, type Ruimte, type ToegangRij, type Token,
} from './model';

type Antwoord = { data: unknown };
export type TechOntgrendelInvoer = { agentId: string; minuten: number; domeinen: string[]; lokaal: boolean };
export type ToegangDeps = {
  post: (url: string, data: Record<string, unknown>) => Promise<Antwoord>;
  get: (url: string, data: Record<string, unknown>) => Promise<Antwoord>;
  /** Sessievelden voor /api/owner/agents/*, /api/mcp/*, /api/owner/ai/* (zoals TabAi/TabTokens). */
  sessie: () => Record<string, unknown>;
  /** Sessievelden met de tabcontext van het technisch profiel (extensie-status/-beheer, ontgrendeling). */
  tech: () => Record<string, unknown>;
  /** Technisch slot opnieuw openen: uitdaging → eigen passkey → ontgrendeling (ExtensieOntgrendeling.ontgrendelen). */
  techOntgrendel: (inv: TechOntgrendelInvoer) => Promise<{ ok: true } | { ok: false; code: string; uk: string; nl: string }>;
};
const STANDAARD: ToegangDeps = {
  post: (u, d) => api.post(u, d),
  get: (u, d) => api.get(u, d),
  sessie: () => sessionBody('mcp'),
  tech: () => techBody(),
  techOntgrendel: async (inv) => {
    const { ontgrendelen } = await import('../../extensie/ExtensieOntgrendeling');
    const r = await ontgrendelen(inv);
    return r.ok ? { ok: true } : { ok: false, code: r.weigering.code, uk: r.weigering.uk, nl: r.weigering.nl };
  },
};
let deps: ToegangDeps = STANDAARD;
/** Voor tests: netwerk/passkey vervangen (null = standaard). Wist ook de stores. */
export function zetToegangDeps(d: Partial<ToegangDeps> | null): void { deps = d ? { ...STANDAARD, ...d } : STANDAARD; mijn = LEEG_MIJN; beheer = LEEG_BEHEER; meld(); }

/** Fout met eigen uitleg (uk/nl), bijv. een weigering van de passkey-ontgrendeling. */
export class ToegangFout extends Error {
  constructor(public code: string, public uk: string, public nl: string) { super(code); this.name = 'ToegangFout'; }
}

const statusVan = (e: unknown) => Number((e as { status?: number })?.status || (e as { response?: { status?: number } })?.response?.status || 0);
/** GET met de sessievelden als query; kent de server de GET niet (404/405), dan dezelfde route als POST. */
async function haal(url: string, body: Record<string, unknown>): Promise<unknown> {
  try { return (await deps.get(url, body)).data; }
  catch (e) { const s = statusVan(e); if (s === 404 || s === 405) return (await deps.post(url, body)).data; throw e; }
}

// ------------------------------------------------------------------------------------------------ store
type Bron = 'oauth' | 'tokens' | 'apparaten' | 'grants' | 'ext';
export type MijnStaat = { geladen: boolean; oauth: Oauth[]; tokens: Token[]; apparaten: Apparaat[]; grants: Grant[]; ext: ExtStatus | null; fouten: Partial<Record<Bron, unknown>>; versie: number };
export type BeheerStaat = { geladen: boolean; gebruikers: BeheerGebruiker[]; fout: unknown; verboden: boolean; versie: number };
const LEEG_MIJN: MijnStaat = Object.freeze({ geladen: false, oauth: [], tokens: [], apparaten: [], grants: [], ext: null, fouten: {}, versie: 0 }) as MijnStaat;
const LEEG_BEHEER: BeheerStaat = Object.freeze({ geladen: false, gebruikers: [], fout: null, verboden: false, versie: 0 }) as BeheerStaat;
let mijn: MijnStaat = LEEG_MIJN;
let beheer: BeheerStaat = LEEG_BEHEER;
const luisteraars = new Set<() => void>();
function meld() { luisteraars.forEach((f) => f()); }
const zetMijn = (p: Partial<MijnStaat>) => { mijn = { ...mijn, ...p, versie: mijn.versie + 1 }; meld(); };
const zetBeheer = (p: Partial<BeheerStaat>) => { beheer = { ...beheer, ...p, versie: beheer.versie + 1 }; meld(); };
const abonneer = (f: () => void) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; };
export const mijnToegang = () => mijn;
export const beheerToegang = () => beheer;
export const useMijnToegang = () => useSyncExternalStore(abonneer, mijnToegang, mijnToegang);
export const useBeheerToegang = () => useSyncExternalStore(abonneer, beheerToegang, beheerToegang);
/** Alle rijen van «Мої доступи» uit de huidige staat. */
export const rijenVan = (s: MijnStaat, nu = Date.now()): ToegangRij[] => bouwRijen({ oauth: s.oauth, tokens: s.tokens, apparaten: s.apparaten, grants: s.grants, ext: s.ext }, nu);

// ------------------------------------------------------------------------------------------------ «Мої доступи»
let laadTeller = 0;
const post = async (url: string, body: Record<string, unknown>) => (await deps.post(url, body)).data;
/** Alle bronnen tegelijk; elke bron mag apart mislukken (de rest blijft zichtbaar). */
export async function laadMijn(): Promise<MijnStaat> {
  const n = ++laadTeller;
  const nu = Date.now();
  const s = deps.sessie();
  const [ov, tok, ag, gr, ext] = await Promise.allSettled([
    post('/api/owner/agents/overzicht', s), post('/api/mcp/tokens/list', s), post('/api/owner/agents/list', s),
    post('/api/owner/ai/grants/list', s), haal('/api/owner/agents/extensie-status', deps.tech()),
  ]);
  if (n !== laadTeller) return mijn; // een nieuwere lading is onderweg
  const fouten: MijnStaat['fouten'] = {};
  const neem = <T>(r: PromiseSettledResult<unknown>, bron: Bron, f: (d: unknown) => T, oud: T): T => {
    if (r.status === 'fulfilled') return f(r.value);
    fouten[bron] = r.reason; return oud;
  };
  zetMijn({
    geladen: true,
    oauth: neem(ov, 'oauth', (d) => normOauth((d as { oauth?: unknown })?.oauth), mijn.oauth),
    tokens: neem(tok, 'tokens', (d) => normTokens((d as { tokens?: unknown })?.tokens, nu), mijn.tokens),
    apparaten: neem(ag, 'apparaten', (d) => normApparaten((d as { agents?: unknown })?.agents), mijn.apparaten),
    grants: neem(gr, 'grants', (d) => normGrants(d, nu), mijn.grants),
    ext: neem(ext, 'ext', (d) => normExtStatus(d), mijn.ext),
    fouten,
  });
  return mijn;
}
const opnieuw = () => { void laadMijn().catch(() => undefined); };

/** «Відкликати»: direct, zonder extra bevestiging (de UI vraagt één klik op de pagina). Meteen weg uit de lijst. */
export async function intrekken(rij: ToegangRij): Promise<void> {
  const d = rij.doel, s = deps.sessie();
  if (d.soort === 'oauth') {
    await deps.post(`/api/owner/mcp-connector/grants/${encodeURIComponent(d.id)}/revoke`, s);
    zetMijn({ oauth: mijn.oauth.filter((g) => g.id !== d.id) });
  } else if (d.soort === 'token') {
    await deps.post('/api/mcp/tokens/revoke', { ...s, id: d.id });
    zetMijn({ tokens: mijn.tokens.filter((t) => t.id !== d.id) });
  } else if (d.soort === 'grants') {
    await deps.post('/api/owner/ai/grants/revoke', { ...s, agentId: d.agentId });
    zetMijn({ grants: mijn.grants.filter((g) => g.agentId !== d.agentId) });
  } else {
    await deps.post('/api/owner/agents/ontgrendeling/intrekken', { ...deps.tech(), agentId: d.agentId, gid: d.gid });
    zetSlot(d.agentId, null);
  }
  opnieuw();
}
function zetSlot(agentId: string, o: ExtStatus['sloten'][number]['ontgrendeling']) {
  if (!mijn.ext) return;
  zetMijn({ ext: { ...mijn.ext, sloten: mijn.ext.sloten.map((x) => (x.agentId === agentId ? { ...x, ontgrendeling: o, staat: o ? 'ontgrendeld' : 'vergrendeld' } : x)) } });
}

export type Heropenen = { agentId: string; ruimte: Ruimte; domeinen: string[]; lokaal: boolean; dagen?: number; minuten?: number };
/**
 * «Продовжити» = opnieuw ontgrendelen MET bevestiging: privé → POST …/ontgrendeling/prive (de server eist een verse step-up van deze
 * sessie; client.ts toont dan «Підтвердіть доступ» en herhaalt); technisch → eigen passkey (uitdaging + assertie).
 */
export async function heropenen(h: Heropenen): Promise<void> {
  if (h.ruimte === 'prive') {
    const r = await deps.post('/api/owner/agents/ontgrendeling/prive', { ...deps.tech(), agentId: h.agentId, dagen: h.dagen ?? 1, ...(h.domeinen.length ? { domeinen: h.domeinen } : {}), lokaal: h.lokaal });
    const o = normOntgrendeling((r.data as { ontgrendeling?: unknown } | null)?.ontgrendeling);
    if (o) zetSlot(h.agentId, o);
  } else {
    const r = await deps.techOntgrendel({ agentId: h.agentId, minuten: h.minuten ?? 60, domeinen: h.domeinen, lokaal: h.lokaal });
    if (!r.ok) throw new ToegangFout(r.code, r.uk, r.nl);
  }
  opnieuw();
}

/**
 * «Обмежити»: een lopende ontgrendeling kleiner maken zonder nieuwe bevestiging mag niet (contract §3). Dus: eerst intrekken (veilige
 * richting, meteen), daarna opnieuw openen met minder domeinen / zonder lokale agent / korter — met bevestiging zoals «Продовжити».
 * Mislukt het heropenen, dan blijft de toegang dicht (en dat zeggen we).
 */
export async function beperken(rij: ToegangRij, h: Omit<Heropenen, 'agentId' | 'ruimte'>): Promise<'heropend' | 'alleen-ingetrokken'> {
  if (rij.doel.soort !== 'ontgrendeling') throw new ToegangFout('NIET_BEPERKBAAR', 'Цей доступ так не обмежується.', 'Deze toegang beperkt u zo niet.');
  const d = rij.doel;
  const domeinen = h.domeinen.filter((x) => d.domeinen.includes(x));
  if (!domeinen.length) throw new ToegangFout('DOMEIN_LEEG', 'Залиште хоча б одну адресу.', 'Laat minstens één adres staan.');
  await intrekken(rij);
  try { await heropenen({ ...h, domeinen, lokaal: d.lokaal && h.lokaal, agentId: d.agentId, ruimte: d.ruimte }); return 'heropend'; }
  catch (e) {
    if (e instanceof ToegangFout) throw new ToegangFout(e.code, `Доступ відкликано, але заново не відкрито: ${e.uk}`, `Toegang ingetrokken, maar niet opnieuw geopend: ${e.nl}`);
    throw Object.assign(e as object, { alleenIngetrokken: true });
  }
}

// ------------------------------------------------------------------------------------------------ «Усі користувачі» (eigenaar / users.manage)
const B = '/api/owner/agents/extensie-beheer';
export async function laadBeheer(): Promise<BeheerStaat> {
  try {
    const d = await haal(B, deps.tech());
    zetBeheer({ geladen: true, gebruikers: normBeheer(d), fout: null, verboden: false });
  } catch (e) {
    const s = statusVan(e);
    zetBeheer({ geladen: true, gebruikers: s === 403 ? [] : beheer.gebruikers, fout: e, verboden: s === 403 });
  }
  return beheer;
}
/** Bij verlaten van de sectie (of van de tech-modus): andermans gegevens niet in het geheugen laten staan. */
export function wisBeheer(): void { if (beheer !== LEEG_BEHEER) { beheer = LEEG_BEHEER; meld(); } }
const herBeheer = () => { void laadBeheer().catch(() => undefined); };
const wijzigGebruiker = (userId: string, f: (u: BeheerGebruiker) => BeheerGebruiker) => zetBeheer({ gebruikers: beheer.gebruikers.map((u) => (u.userId === userId ? f(u) : u)) });

export async function beheerBeleid(userId: string, b: Beleid): Promise<Beleid> {
  const r = await deps.post(`${B}/beleid`, { ...deps.tech(), userId, ...beleidVelden(b) });
  const terug = (r.data as { beleid?: unknown } | null)?.beleid;
  const nieuw = terug ? normBeleid(terug) : b;
  wijzigGebruiker(userId, (u) => ({ ...u, beleid: nieuw }));
  herBeheer();
  return nieuw;
}
export async function beheerIntrekken(userId: string, wat: { agentId?: string; ruimte?: Ruimte } = {}): Promise<void> {
  await deps.post(`${B}/intrekken`, { ...deps.tech(), userId, ...(wat.agentId ? { agentId: wat.agentId } : {}), ...(wat.ruimte ? { ruimte: wat.ruimte } : {}) });
  wijzigGebruiker(userId, (u) => ({ ...u, browsers: u.browsers.map((x) => ((!wat.agentId || x.agentId === wat.agentId) && (!wat.ruimte || x.ruimte === wat.ruimte) ? { ...x, ontgrendeling: null } : x)) }));
  herBeheer();
}
export async function beheerVerlengen(gid: string, duur: { minuten: number } | { dagen: number }): Promise<void> {
  const r = await deps.post(`${B}/verlengen`, { ...deps.tech(), gid, ...duur });
  const o = normOntgrendeling((r.data as { ontgrendeling?: unknown } | null)?.ontgrendeling);
  if (o) zetBeheer({ gebruikers: beheer.gebruikers.map((u) => ({ ...u, browsers: u.browsers.map((x) => (x.ontgrendeling?.gid === gid ? { ...x, ontgrendeling: o } : x)) })) });
  herBeheer();
}
