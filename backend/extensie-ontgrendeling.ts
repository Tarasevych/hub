// Ontgrendeling van de browserextensie (0.5 → 0.6, migraties 0072/0073). Zie shared/extensie-ontgrendeling.ts.
//
// Twee sloten per browser = twee koppelingen (agents) met elk een eigen ruimte (app.agents.ruimte, shared/ai-ruimte.ts). Een rij in
// app.extensie_ontgrendelingen hoort bij precies één agent EN één ruimte; ze telt alleen als de ruimte van die agent dezelfde is.
//
// Regels (alle hier, op de server, afgedwongen — de extensie controleert daarnaast zelf de handtekening):
//  - standaard vergrendeld: zonder lopende rij gaat er GEEN browseropdracht naar een browseragent (dispatchCommand →
//    controleerBrowserOpdracht; ook callTool controleert vooraf, zodat er niets op goedkeuring blijft wachten);
//  - technisch: ingelogd + technisch profiel met een LOPENDE activering in dit tabblad (tech-profiel.ts) + verse assertie (UV) van een
//    EIGEN passkey (app.passkeys), op een challenge die gebonden is aan agent|caps|domeinen|eind|nonce|activering, eenmalig en ≤ 5 minuten
//    (app.passkey_uitdagingen, doel 'extensie-ontgrendelen'); caps = CAPS_PER_ROL ∩ beleid; domeinen ⊂ ADMIN_HOSTS_TOEGESTAAN;
//    eind = min(nu + minuten, einde activering, nu + beleid, nu + 8 uur);
//  - prive: ingelogd + geldige step-up van DEZE sessie (stap-op.ts: passkey, TOTP/herstelcode of Google-herbevestiging); caps =
//    browser-caps uit de ACTIEVE AI-toestemmingen (ai-grants) van DEZE browser ∩ beleid; domeinen ⊂ PRIVE_HOSTS (nooit admin.*);
//    eind = min(einde toestemmingen, nu + dagen, nu + beleid, nu + 30 dagen); nooit gekoppeld aan een technische activering;
//  - beleid (app.extensie_beleid, backend/extensie-beleid.ts) kapt alles, ook vlak vóór elke opdracht;
//  - de server ondertekent met de opdrachtsleutel van de koppeling (HMAC-SHA256, signOntgrendeling, tekst v2 met ruimte) en duwt
//    {t:'ontgrendeling'} naar DIE agent (opnieuw na elke 'ready'; geen lopende rij → {t:'vergrendel'} zonder gid);
//  - einde: duur voorbij, einde van de activering ('tech-einde'/'uitgelogd'), intrekken op de site of door beheer, in de extensie
//    (WS 'vergrendel-verzoek' of HTTP met het agenttoken), strenger beleid, noodstop, een nieuwe ontgrendeling ('nieuw'). Alles in app.audit.
import { createHash, randomBytes } from 'node:crypto';
import { auditToevoegen } from '../server/platform/audit';
import { rateLimit } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import * as grants from './ai-toestemmingen';
import { openCommandKey, signOntgrendeling } from './connectors-crypto';
import * as store from './connectors-opslag';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { capsBinnenBeleid, leesBeleid, maxDuurMs, ruimteAan } from './extensie-beleid';
import { huidigeNamens } from './mcp-namens';
import * as agentKleuren from './agent-kleuren';
import { aiDienstStand, aiTechnischToegestaan } from './ai-ruimte-poort';
import { stapOpGeldig, stapOpMethode, type StapOpAuth } from './stap-op';
import * as tp from './tech-profiel';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';
import {
  ADMIN_HOSTS_STANDAARD, AI_ACTIEF_MS, BROWSER_CAPS, BROWSER_CAPS_OUD, capsVoorRollen, EXTENSIE_VERSIE_MATRIX, isBrowserCap, isDiagRechtStand, isEindeSoort, isPriveHost, isToegestaneHost,
  MAX_DUUR_MS, MAX_MINUTEN, MAX_MINUTEN_OUD, MIN_EXTENSIE_VERSIE, PRIVE_DAGEN_KEUZES, PRIVE_HOSTS, PRIVE_MAX_DAGEN_OUD, PRIVE_STANDAARD_DAGEN, weigerUitleg,
  type BrowserCap, type DiagRechtStand, type EindeSoort, type ExtensieAgentStatus, type ExtensieBeleid, type ExtensieBrowser, type ExtensieStaat, type ExtensieStatusAntwoord, type Ontgrendeling,
  type OntgrendelingWeergave, type RechtPrive, type RechtTechnisch, type VergrendelReden, type Weigercode,
} from '../shared/extensie-ontgrendeling';
import { aanBrowserGebonden, BROWSER_BEHEER_PAD_EN, capsVoorRuimte, matrixCap, moetVernieuwen, termijnEinde, termijnVan, vernieuwEinde, TERMIJN_ACHTERVANG_MS, type Termijn, type TermijnId } from '../shared/extensie-matrix';
import { meld } from './melder';
import * as matrix from './extensie-matrix';
import type { TabProfiel } from '../shared/browser-technisch-slot';

const sys = () => getPool('systeem');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64U = /^[A-Za-z0-9_-]+$/;
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : 0);
/** Kortste duur van een technische ontgrendeling (minuten). */
export const MIN_MINUTEN = 5;
/** Challenge: eenmalig en hoogstens 5 minuten (zelfde grens als 0023). */
export const UITDAGING_MS = 5 * 60 * 1000;
/** Redenen die de extensie zelf mag opgeven (WS 'vergrendel-verzoek' en de HTTP-terugval). */
export const EXTENSIE_REDENEN = ['popup', 'zijpaneel', 'opties', 'noodstop'] as const;

// ---------------------------------------------------------------- weigeringen
const STATUS: Record<Weigercode, number> = {
  NIET_INGELOGD: 401, ACCOUNT_GEBLOKKEERD: 403, GEEN_TECH_PROFIEL: 403, TECH_NIET_ACTIEF: 403, GEEN_BROWSER_RECHTEN: 403, GEEN_PASSKEY: 409,
  AGENT_ONBEKEND: 409, GEEN_BROWSER_AGENT: 409, GEEN_OPDRACHTSLEUTEL: 409, EXTENSIE_TE_OUD: 409, DOMEIN_ONGELDIG: 400, DUUR_ONGELDIG: 400,
  UITDAGING_ONGELDIG: 403, PASSKEY_ONGELDIG: 403, TE_VEEL_POGINGEN: 429,
  STEP_UP_REQUIRED: 403, BELEID_UIT: 403, VERKEERDE_RUIMTE: 409, GEEN_BEHEERRECHT: 403, GEBRUIKER_ONBEKEND: 404, EIGENAAR_ONAANTASTBAAR: 403,
  NIET_AAN_JEZELF: 403, BUITEN_BELEID: 409, ONTGRENDELING_ONBEKEND: 404, ONGELDIG: 400, RUIMTE_DIENST_UIT: 403, TERMIJN_VEREIST_UPDATE: 409,
};
export class Weigering extends Error {
  constructor(public code: Weigercode, public detail = '', public ruimte: AiRuimte | null = null) { super(code); }
  get status(): number { return STATUS[this.code] ?? 403; }
}
export type WeigerAntwoord = {
  error: Weigercode; uitleg: { uk: string; nl: string }; actie?: { uk: string; nl: string; url: string };
  /** Alleen bij STEP_UP_REQUIRED: zelfde velden als de andere step-up-routes (src/platform/client.ts opent «Підтвердіть доступ»). */
  reasonCode?: 'STEP_UP_REQUIRED'; methods?: string[]; maxAgeSeconds?: number;
};
/** Antwoordvorm van elke weigering: {error, uitleg:{uk,nl}, actie?} (+ step-up-velden bij STEP_UP_REQUIRED). */
export function weigerAntwoord(code: Weigercode, ruimte: AiRuimte | null = null): WeigerAntwoord {
  const w = weigerUitleg(code, ruimte);
  return {
    error: code, uitleg: { uk: w.uk, nl: w.nl }, ...(w.actie ? { actie: { ...w.actie } } : {}),
    ...(code === 'STEP_UP_REQUIRED' ? { reasonCode: 'STEP_UP_REQUIRED' as const, methods: ['passkey', 'totp', 'google'], maxAgeSeconds: 300 } : {}),
  };
}
const weiger = (code: Weigercode, detail = '', ruimte: AiRuimte | null = null): never => { throw new Weigering(code, detail, ruimte); };

// Een mislukte auditregel breekt de actie niet, maar verdwijnt ook niet stil.
export const audit = (ownerId: string, action: string, result: string, details: Record<string, unknown>, actorId: string | null = ownerId) =>
  auditToevoegen({ ownerId, actorId, action, type: 'ai', result, details }).catch((err) => { console.error(`[extensie-ontgrendeling] AUDIT MISLUKT (${action}):`, (err as Error).message); });

// ---------------------------------------------------------------- versie
/** 'a.b.c' → [a,b,c]; iets anders → null. */
const delen = (v: string): number[] | null => { const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,6})/.exec(String(v || '').trim()); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
export function versieMinstens(v: string | null | undefined, min = MIN_EXTENSIE_VERSIE): boolean {
  const a = delen(String(v ?? '')), b = delen(min)!;
  if (!a) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

// ---------------------------------------------------------------- live stand (gateway meldt; alleen in het geheugen van dit proces)
/** `sessie` (0111): browsersessie-id die de extensie ≥ 0.7.0 bij de verbinding meldt (chrome.storage.session); null = niet gemeld. */
type Verbinding = { userId: string; platform: string | null; versie: string; sessie: string | null };
const SESSIE_RE = /^[A-Za-z0-9_-]{16,64}$/;
// `profielTab` en `diagRecht` (0.6.1, 20.10.2026): het laatst gemelde profiel van het ACTIEVE tabblad en de stand van het
// Chrome-recht `debugger`. Alleen om een technische browseropdracht vooraf uitlegbaar te kunnen weigeren
// (shared/browser-technisch-slot.ts); nooit om iets TOE te staan — de extensie controleert alles zelf opnieuw.
type Melding = { staat: ExtensieStaat; gid: string | null; exp: number | null; lokaal: boolean; lokaalVerbonden: boolean; versie: string; at: number;
  profielTab: TabProfiel | null; diagRecht: DiagRechtStand | null };
const verbindingen = new Map<string, Verbinding>();
const meldingen = new Map<string, Melding>();
const STAATEN: readonly ExtensieStaat[] = ['niet-gekoppeld', 'vergrendeld', 'ontgrendeld', 'agent'];
export const isVerbonden = (agentId: string) => verbindingen.has(agentId);
export const liveVersie = (agentId: string) => meldingen.get(agentId)?.versie || verbindingen.get(agentId)?.versie || '';
/** Laatst gemelde stand van het actieve tabblad van deze extensie (null = nooit gemeld of oudere extensie). */
export const gemeldeTab = (agentId: string): { profielTab: TabProfiel | null; diagRecht: DiagRechtStand | null } | null => {
  const m = meldingen.get(agentId);
  return m ? { profielTab: m.profielTab, diagRecht: m.diagRecht } : null;
};
/** Alleen voor tests: een gemelde stand zetten zonder WebSocket. */
export const _zetGemeldeTab = (agentId: string, v: { profielTab?: TabProfiel | null; diagRecht?: DiagRechtStand | null }): void => {
  const m = meldingen.get(agentId) ?? { staat: 'ontgrendeld' as ExtensieStaat, gid: null, exp: null, lokaal: false, lokaalVerbonden: false, versie: MIN_EXTENSIE_VERSIE, at: Date.now(), profielTab: null, diagRecht: null };
  meldingen.set(agentId, { ...m, profielTab: v.profielTab ?? m.profielTab, diagRecht: v.diagRecht ?? m.diagRecht });
};

export function bijVerbonden(agentId: string, userId: string, platform: string | null, versie: string, sessie?: unknown): void {
  verbindingen.set(agentId, { userId, platform, versie: String(versie || '').slice(0, 40), sessie: typeof sessie === 'string' && SESSIE_RE.test(sessie) ? sessie : null });
}
export function bijVerbroken(agentId: string): void { verbindingen.delete(agentId); meldingen.delete(agentId); }

/** {t:'status'} of {t:'pong'} met statusvelden van de extensie. Ongeldige velden worden genegeerd (nooit vertrouwd voor rechten). */
export function bijStatus(agentId: string, msg: Record<string, unknown>): void {
  if (!verbindingen.has(agentId) || !STAATEN.includes(msg.staat as ExtensieStaat)) return;
  const gid = typeof msg.gid === 'string' && UUID.test(msg.gid) ? msg.gid : null;
  const exp = typeof msg.exp === 'number' && Number.isSafeInteger(msg.exp) && msg.exp > 0 ? msg.exp : null;
  const versie = typeof msg.version === 'string' ? msg.version.slice(0, 40) : (meldingen.get(agentId)?.versie ?? verbindingen.get(agentId)!.versie);
  const vorig = meldingen.get(agentId);
  // Een oudere extensie stuurt deze velden niet: dan de vorige waarde houden, anders «onbekend» (null) — nooit raden.
  const profielTab = msg.profielTab === 'technisch' || msg.profielTab === 'gebruiker' ? msg.profielTab as TabProfiel : (msg.profielTab === null ? null : vorig?.profielTab ?? null);
  const diagRecht = isDiagRechtStand(msg.diagRecht) ? msg.diagRecht : (vorig?.diagRecht ?? null);
  meldingen.set(agentId, { staat: msg.staat as ExtensieStaat, gid, exp, lokaal: msg.lokaal === true, lokaalVerbonden: msg.lokaalVerbonden === true, versie, at: Date.now(), profielTab, diagRecht });
  // Review 18.10 (1): een 'vergrendel' kan verloren zijn gegaan (WS-onderbreking, herstart). Meldt de extensie een gid die op de server
  // niet (meer) loopt — of 'ontgrendeld' zonder gid — dan meteen opnieuw vergrendelen.
  const userId = verbindingen.get(agentId)!.userId;
  if (gid || msg.staat === 'ontgrendeld') void nogActief(agentId, userId, gid).then((actief) => {
    if (!actief) grants.pushNaarAgent(userId, agentId, { t: 'vergrendel', ...(gid ? { gid } : {}), reden: 'ingetrokken' });
  });
}
/** Loopt deze gid (of, zonder gid, een willekeurige rij) nog voor deze agent? Bij een DB-fout: true (geen vals vergrendelen; dispatch blijft streng). */
async function nogActief(agentId: string, userId: string, gid: string | null): Promise<boolean> {
  try {
    const r = await actieveOntgrendeling(agentId, userId);
    return !!r && (!gid || String(r.id) === gid);
  } catch { return true; }
}

// ---------------------------------------------------------------- AI-activiteit per agent (laatste browseropdracht van een AI)
type Ai = { userId: string; namen: Map<string, number>; actief: boolean; timer: ReturnType<typeof setTimeout> | null };
const ai = new Map<string, Ai>();
const AI_LIJST_MS = 60 * 60 * 1000;
function aiStand(agentId: string, nu = Date.now()): ExtensieAgentStatus['ai'] {
  const a = ai.get(agentId);
  if (!a) return { verbonden: false, agenten: [] };
  const agenten = [...a.namen].filter(([, t]) => nu - t < AI_LIJST_MS).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([naam, laatst]) => ({ naam, laatst }));
  return { verbonden: agenten.some((x) => nu - x.laatst < AI_ACTIEF_MS), agenten };
}
/**
 * 0.6.2: bij de AI-stand gaan ook de AGENTKLEUREN mee (migratie 0088): de extensie tekent de rand en de badge in de kleur die
 * de eigenaar aan die AI gaf. Mislukt de query, dan gaat het bericht zonder kleuren weg en gebruikt de extensie het
 * standaardaccent uit shared/markering-agenten.ts — nooit een reden om de stand niet te melden.
 */
const pushAiStand = (agentId: string, userId: string) => {
  void agentKleuren.lijst(userId)
    .then((rijen) => grants.pushNaarAgent(userId, agentId, { t: 'agent-status', ...aiStand(agentId), kleuren: agentKleuren.voorExtensie(rijen) }))
    .catch(() => grants.pushNaarAgent(userId, agentId, { t: 'agent-status', ...aiStand(agentId) }));
};
/** De kleuren opnieuw naar alle verbonden extensies van deze gebruiker duwen (nadat de eigenaar een kleur wijzigde). */
export async function pushKleuren(userId: string): Promise<number> {
  const rijen = await agentKleuren.lijst(userId);
  let n = 0;
  for (const [agentId, v] of verbindingen) {
    if (v.userId !== userId) continue;
    grants.pushNaarAgent(userId, agentId, { t: 'agent-status', ...aiStand(agentId), kleuren: agentKleuren.voorExtensie(rijen) });
    n += 1;
  }
  return n;
}

/** Gateway: een browseropdracht van een AI is naar deze agent verstuurd. `naam` = de AI-verbinding (mcp-namens), anders de vorige/«AI». */
export function aiActiviteit(agentId: string, userId: string, naam?: string): void {
  const nu = Date.now();
  let a = ai.get(agentId);
  if (!a || a.userId !== userId) { a = { userId, namen: new Map(), actief: false, timer: null }; ai.set(agentId, a); }
  const wie = String(naam || huidigeNamens()?.client || [...a.namen].sort((x, y) => y[1] - x[1])[0]?.[0] || 'AI').slice(0, 80);
  const nieuw = !a.namen.has(wie);
  a.namen.set(wie, nu);
  for (const [n, t] of a.namen) if (nu - t > AI_LIJST_MS) a.namen.delete(n);
  const wasActief = a.actief;
  a.actief = true;
  if (a.timer) clearTimeout(a.timer);
  a.timer = setTimeout(() => {
    const b = ai.get(agentId);
    if (!b) return;
    b.timer = null;
    if (!aiStand(agentId).verbonden) { b.actief = false; pushAiStand(agentId, b.userId); }
  }, AI_ACTIEF_MS + 50);
  a.timer.unref?.();
  if (!wasActief || nieuw) pushAiStand(agentId, userId);
}

// ---------------------------------------------------------------- DB-rijen
export type Rij = {
  id: string; agent_id: string; user_id: string; activatie_id: string | null; caps: string[]; domeinen: string[]; lokaal: boolean; rollen: string[];
  nonce: string; begin_op: Date; eind_op: Date; ruimte: AiRuimte; bevestigd_met: string | null;
  /** 0110: hoe de rij eindigt en of ze de technische activering overleeft (keuze van de eigenaar, shared/extensie-matrix.ts). */
  einde_soort?: string | null; overleeft_activatie?: boolean | null;
  /** 0111: browsersessie waaraan de rij hangt (NULL = niet gebonden, '?' = bindt bij de eerste verbinding). */
  browser_sessie?: string | null;
};
/**
 * Lopende rij: niet ingetrokken, niet voorbij, (als hij aan een activering hangt en die NIET mag overleven — 0110) die activering
 * loopt nog, en de agent bestaat nog in DEZELFDE ruimte als de rij (een rij van het andere slot telt nooit).
 * Een rij die de activering overleeft, opent op zichzelf niets technisch: elk technisch hulpmiddel eist bij gebruik een lopende
 * activering (connector v2 TECH_PROFILE_OFF, backend/browser-technisch.ts). De rij bespaart alleen de passkey-stap.
 */
export const ACTIEF = `o.ingetrokken_op IS NULL AND o.eind_op > now()
  AND (o.activatie_id IS NULL OR COALESCE(o.overleeft_activatie, false) OR EXISTS (SELECT 1 FROM app.tech_activaties a WHERE a.id::text = o.activatie_id AND a.user_id = o.user_id AND a.beeindigd_op IS NULL AND a.eind_op > now()))
  AND EXISTS (SELECT 1 FROM app.agents g WHERE g.id::text = o.agent_id AND g.user_id = o.user_id AND g.revoked_at IS NULL AND COALESCE(g.ruimte, 'prive') = o.ruimte)`;
export async function actieveOntgrendeling(agentId: string, userId: string): Promise<Rij | null> {
  if (!UUID.test(agentId)) return null;
  const r = (await sys().query(`SELECT o.* FROM app.extensie_ontgrendelingen o WHERE o.agent_id = $1 AND o.user_id = $2 AND ${ACTIEF} ORDER BY o.begin_op DESC LIMIT 1`, [agentId, userId])).rows[0];
  return (r as Rij | undefined) ?? null;
}
export async function lopendeRijen(userIds: string[]): Promise<Rij[]> {
  if (!userIds.length) return [];
  return (await sys().query(`SELECT o.* FROM app.extensie_ontgrendelingen o WHERE o.user_id = ANY($1) AND ${ACTIEF} ORDER BY o.begin_op DESC`, [userIds])).rows as Rij[];
}
export const ontgrendelingVan = (r: Rij): OntgrendelingWeergave => ({
  gid: String(r.id), ruimte: ruimteOf(r.ruimte), caps: r.caps.filter(isBrowserCap), domeinen: [...r.domeinen], lokaal: !!r.lokaal, begin: ms(r.begin_op), eind: ms(r.eind_op),
  rollen: [...(r.rollen || [])], bevestigdMet: r.bevestigd_met ? String(r.bevestigd_met) : (r.activatie_id ? 'passkey' : null),
  eindeSoort: isEindeSoort(r.einde_soort) ? r.einde_soort : (r.activatie_id ? 'tech-einde' : 'duur'), overleeftActivatie: r.overleeft_activatie === true,
});
/**
 * 0110: een extensie vóór 0.7.0 kent 'browser.console' en 'browser.script' niet en zou de hele ontgrendeling weigeren (CAPS).
 * De server tekent voor zo'n extensie alleen de oude vijf; de server weigert de nieuwe opdrachten dan zelf (controleerBrowserOpdracht).
 */
export const capsVoorVersie = (caps: readonly string[], versie: string | null | undefined): BrowserCap[] =>
  BROWSER_CAPS.filter((c) => caps.includes(c) && (versieMinstens(versie, EXTENSIE_VERSIE_MATRIX) || BROWSER_CAPS_OUD.includes(c)));
export const grantVan = (r: Rij): Ontgrendeling => ({
  v: 2, gid: String(r.id), agentId: String(r.agent_id), userId: String(r.user_id), ruimte: ruimteOf(r.ruimte), caps: capsVoorVersie(r.caps, liveVersie(String(r.agent_id))),
  domeinen: [...r.domeinen].sort(), lokaal: !!r.lokaal, iat: ms(r.begin_op), exp: ms(r.eind_op), nonce: String(r.nonce),
});

/** Opdrachtsleutel van de koppeling (alleen hier en in de extensie bekend). null = oude koppeling zonder sleutel. */
async function opdrachtSleutel(agentId: string): Promise<string | null> {
  const k = await store.getCommandKeyEnc(agentId);
  return k ? openCommandKey(k.sealed, k.userId, k.tokenHash) : null;
}
/**
 * Ondertekend bericht voor de extensie, of null zonder sleutel. `einde` (0.7.0) staat NAAST de grant en is niet ondertekend: alleen
 * weergave in de pop-up/het zijpaneel («до виходу з акаунта», «до відкликання», «до закриття браузера» i.p.v. «ще 365 дн.»). Het
 * einde zelf blijft exp in de ondertekende grant; de server trekt in. Een oudere extensie negeert het veld.
 */
export async function ondertekend(r: Rij): Promise<{ t: 'ontgrendeling'; grant: Ontgrendeling; sig: string; einde: EindeSoort } | null> {
  const key = await opdrachtSleutel(String(r.agent_id));
  if (!key) return null;
  const grant = grantVan(r);
  return { t: 'ontgrendeling', grant, sig: signOntgrendeling(key, grant), einde: ontgrendelingVan(r).eindeSoort ?? 'duur' };
}

// ---------------------------------------------------------------- intrekken
type Ingetrokken = { id: string; agent_id: string; user_id: string; reden_einde: string; ruimte?: string };
async function naIntrekken(rows: Ingetrokken[], door: string, actorId: string | null): Promise<void> {
  for (const r of rows) {
    grants.pushNaarAgent(r.user_id, r.agent_id, { t: 'vergrendel', gid: String(r.id), reden: r.reden_einde as VergrendelReden });
    await audit(r.user_id, 'owner.extensie.ingetrokken', 'success', { agentId: r.agent_id, gid: String(r.id), reden: r.reden_einde, door, ...(r.ruimte ? { ruimte: r.ruimte } : {}) }, actorId);
  }
}
/** Lopende rijen intrekken. `wie`: één agent, één rij (gid), één ruimte, of alles van de gebruiker. Geeft de ingetrokken rijen. */
export async function intrekkenRijen(userId: string, wie: { agentId?: string | null; gid?: string | null; ruimte?: AiRuimte | null; alles?: boolean }, reden: VergrendelReden, door: string, actorId: string | null = userId): Promise<Ingetrokken[]> {
  const agentId = wie.agentId && UUID.test(wie.agentId) ? wie.agentId : null;
  const gid = wie.gid && UUID.test(wie.gid) ? wie.gid : null;
  const ruimte = wie.ruimte === 'prive' || wie.ruimte === 'technisch' ? wie.ruimte : null;
  if (!wie.alles && !agentId && !gid && !ruimte) return [];
  const rows = (await sys().query(`UPDATE app.extensie_ontgrendelingen o SET ingetrokken_op = now(), ingetrokken_door = $4, reden_einde = $5
     WHERE o.user_id = $1 AND o.ingetrokken_op IS NULL AND o.eind_op > now() AND ($2::text IS NULL OR o.agent_id = $2) AND ($3::uuid IS NULL OR o.id = $3)
       AND ($6::text IS NULL OR o.ruimte = $6)
     RETURNING o.id, o.agent_id, o.user_id, o.reden_einde, o.ruimte`, [userId, agentId, gid, door.slice(0, 40), reden, ruimte])).rows as Ingetrokken[];
  await naIntrekken(rows, door, actorId);
  return rows;
}
export async function intrekken(userId: string, wie: { agentId?: string | null; gid?: string | null; ruimte?: AiRuimte | null; alles?: boolean }, reden: VergrendelReden, door: string, actorId: string | null = userId): Promise<number> {
  return (await intrekkenRijen(userId, wie, reden, door, actorId)).length;
}

/** Einde van een technische activering (bijTechEinde): elke lopende ontgrendeling waarvan de activering niet meer loopt, intrekken. */
export async function naTechEinde(userId: string): Promise<number> {
  try {
    // v2: een ontgrendeling kan aan een technische sessie (tech_ruimte_sessies) hangen in plaats van aan een activering.
    const v2 = await (await import('./tech-ruimtes-kern')).v2Aan(userId);
    const rows = (await sys().query(`UPDATE app.extensie_ontgrendelingen o SET ingetrokken_op = now(), ingetrokken_door = 'systeem',
         reden_einde = CASE WHEN EXISTS (SELECT 1 FROM app.tech_activaties a WHERE a.id::text = o.activatie_id AND a.beeindigd_reden = 'uitgelogd') THEN 'uitgelogd' ELSE 'tech-einde' END
       WHERE o.user_id = $1 AND o.ingetrokken_op IS NULL AND o.activatie_id IS NOT NULL AND NOT COALESCE(o.overleeft_activatie, false)
         AND NOT EXISTS (SELECT 1 FROM app.tech_activaties a WHERE a.id::text = o.activatie_id AND a.user_id = o.user_id AND a.beeindigd_op IS NULL AND a.eind_op > now())${v2
           ? ` AND NOT EXISTS (SELECT 1 FROM app.tech_ruimte_sessies v WHERE v.id::text = o.activatie_id AND v.user_id = o.user_id AND v.beeindigd_op IS NULL AND v.grens_op > now() AND (v.modus <> 'tijd' OR v.eind_op > now()))` : ''}
       RETURNING o.id, o.agent_id, o.user_id, o.reden_einde, o.ruimte`, [userId])).rows as Ingetrokken[];
    await naIntrekken(rows, 'systeem', null);
    return rows.length;
  } catch (err) { console.error('[extensie-ontgrendeling] intrekken na einde activering mislukt:', (err as Error).message); return 0; }
}
tp.bijTechEinde((userId) => { void naTechEinde(userId); });

/**
 * Opdracht E2: «Вихід з акаунта завжди скидає». Uitloggen van dit account (elke vorm: tabblad, browser, overal, en een accountwissel
 * in een tabblad — tech-profiel.bijUitloggen) beëindigt ELKE lopende ontgrendeling van dat account, in beide ruimtes en ongeacht de
 * gekozen termijn (ook 1 тиждень … 1 рік, «до відкликання» en «до закриття браузера»). Andere accounts blijven ongemoeid.
 */
export async function naUitloggen(userId: string, tabContext?: string): Promise<number> {
  try {
    // Technische ruimtes v2 (besluit van de eigenaar 27.10.2026): uitloggen in ÉÉN tabblad haalt geen ontgrendelingen weg
    // (ook niet «1 рік» of «Без обмеження»); alleen uitloggen van de site (browser/account) of «вийти всюди» doet dat.
    // Ontgrendelingen «до кінця технічної активації» eindigen via naTechEinde als de technische sessie eindigt.
    if (tabContext) {
      const { v2Aan } = await import('./tech-ruimtes-kern');
      if (await v2Aan(userId)) return 0;
    }
    const rows = (await sys().query(`UPDATE app.extensie_ontgrendelingen o SET ingetrokken_op = now(), ingetrokken_door = 'systeem', reden_einde = 'uitgelogd'
       WHERE o.user_id = $1 AND o.ingetrokken_op IS NULL AND o.eind_op > now()
       RETURNING o.id, o.agent_id, o.user_id, o.reden_einde, o.ruimte`, [userId])).rows as Ingetrokken[];
    await naIntrekken(rows, 'systeem', null);
    return rows.length;
  } catch (err) { console.error('[extensie-ontgrendeling] intrekken na uitloggen mislukt:', (err as Error).message); return 0; }
}
tp.bijUitloggen((userId, tabContext) => { void naUitloggen(userId, tabContext); });

/**
 * «Без обмеження» (einde_soort handmatig): de rij zelf blijft ≤ 366 dagen (CHECK + extensie 0.7.0).
 * Binnen 30 dagen een NIEUWE rij (nieuwe gid, begin = nu, zelfde caps), eerst duwen, daarna de oude intrekken
 * zonder 'vergrendel' op de nieuwe gid. eindeZetten mag hier niet: die houdt begin_op en dezelfde gid.
 * Blokkeert het beleid een echte verlenging, dan één melding op 30 dagen en één op 1 dag — geen stille afloop.
 */
export async function vernieuwOnbeperkt(): Promise<number> {
  await sys().query(`UPDATE app.extensie_ontgrendelingen o SET ingetrokken_op = now(), ingetrokken_door = 'systeem', reden_einde = 'vernieuwd'
     WHERE o.ingetrokken_op IS NULL AND o.einde_soort = 'handmatig' AND EXISTS (
       SELECT 1 FROM app.extensie_ontgrendelingen n WHERE n.agent_id = o.agent_id AND n.user_id = o.user_id
         AND n.ingetrokken_op IS NULL AND n.id <> o.id AND n.begin_op > o.begin_op)`);
  const kandidaten = (await sys().query(`SELECT o.* FROM app.extensie_ontgrendelingen o
     WHERE o.ingetrokken_op IS NULL AND o.einde_soort = 'handmatig' AND o.eind_op > now() AND o.eind_op < now() + interval '30 days'
       AND NOT EXISTS (SELECT 1 FROM app.extensie_ontgrendelingen n WHERE n.agent_id = o.agent_id AND n.user_id = o.user_id
         AND n.ingetrokken_op IS NULL AND n.einde_soort = 'handmatig' AND n.begin_op > o.begin_op)`)).rows as Rij[];
  let n = 0;
  for (const r of kandidaten) {
    try { if (await vernieuwEen(r)) n += 1; }
    catch (err) { console.error('[extensie-ontgrendeling] vernieuwen van', r.id, (err as Error).message); }
  }
  return n;
}
async function vernieuwingGemeld(userId: string, gid: string, venster: '30d' | '1d'): Promise<boolean> {
  const al = await sys().query(`SELECT 1 FROM app.audit WHERE owner_id = $1 AND action = 'owner.extensie.vernieuwing-geblokkeerd'
     AND created_at > now() - interval '40 days' AND details->>'gid' = $2 AND details->>'venster' = $3 LIMIT 1`, [userId, gid, venster]);
  return al.rows.length > 0;
}
async function vernieuwEen(r: Rij): Promise<boolean> {
  const ruimte = ruimteOf(r.ruimte);
  const beleid = await leesBeleid(r.user_id);
  const nu = Date.now();
  const eind = ms(r.eind_op);
  const plafond = Math.min(maxDuurMs(beleid, ruimte), TERMIJN_ACHTERVANG_MS);
  const caps = capsBinnenBeleid(beleid, ruimte, r.caps);
  const mag = ruimteAan(beleid, ruimte) && caps.length === r.caps.filter(isBrowserCap).length && (!r.lokaal || beleid.lokaalAan) && moetVernieuwen('handmatig', eind, nu, plafond);
  if (!mag) {
    const venster: '30d' | '1d' = eind - nu < 86_400_000 ? '1d' : '30d';
    if (await vernieuwingGemeld(r.user_id, String(r.id), venster)) return false;
    await audit(r.user_id, 'owner.extensie.vernieuwing-geblokkeerd', 'denied', { gid: String(r.id), agentId: r.agent_id, ruimte, venster, eind: new Date(eind).toISOString() });
    await meld(r.user_id, 'security', 'Доступ «без обмеження» скоро закінчиться / Toegang «onbeperkt» loopt bijna af',
      'Політика або дозволи не дають поновити цей доступ. Відкрийте його знову або змініть політику, інакше він закриється. / Het beleid of de toestemmingen laten verlengen niet toe. Open hem opnieuw of wijzig het beleid, anders sluit hij.',
      'https://mcp.tarasevych.com/agents#browser');
    return false;
  }
  const nieuwEind = vernieuwEinde(nu, plafond);
  const client = await sys().connect();
  let nieuw: Rij;
  try {
    await client.query('BEGIN');
    const nog = (await client.query(`SELECT id FROM app.extensie_ontgrendelingen WHERE id = $1 AND ingetrokken_op IS NULL AND einde_soort = 'handmatig' FOR UPDATE`, [r.id])).rows[0];
    if (!nog) { await client.query('ROLLBACK'); return false; }
    nieuw = (await client.query(`INSERT INTO app.extensie_ontgrendelingen (agent_id, user_id, activatie_id, caps, domeinen, lokaal, rollen, nonce, eind_op, passkey_vinger, ruimte, bevestigd_met, einde_soort, overleeft_activatie, browser_sessie)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, LEAST(to_timestamp($9::double precision / 1000), now() + interval '366 days'), $10, $11, $12, 'handmatig', $13, NULL) RETURNING *`,
      [r.agent_id, r.user_id, r.activatie_id, r.caps, r.domeinen, r.lokaal, r.rollen, randomBytes(16).toString('base64url'), nieuwEind, null, ruimte, r.bevestigd_met, r.overleeft_activatie === true])).rows[0] as Rij;
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally { client.release(); }
  const bericht = await ondertekend(nieuw!);
  if (bericht) grants.pushNaarAgent(r.user_id, r.agent_id, bericht);
  await sys().query(`UPDATE app.extensie_ontgrendelingen SET ingetrokken_op = now(), ingetrokken_door = 'systeem', reden_einde = 'vernieuwd' WHERE id = $1 AND ingetrokken_op IS NULL`, [r.id]);
  await store.setBrowserEnabled(r.user_id, r.agent_id, true, null).catch(() => false);
  await audit(r.user_id, 'owner.extensie.vernieuwd', 'success', { gid: String(nieuw!.id), vorige: String(r.id), agentId: r.agent_id, ruimte, tot: new Date(ms(nieuw!.eind_op)).toISOString() });
  return true;
}

/**
 * Vangnet (gateway, elke hartslag van 20 s): rijen waarvan de duur voorbij is ('verlopen') of waarvan de activering intussen eindigde
 * zonder bijTechEinde (bv. 'vervangen' door een nieuwe activering in hetzelfde tabblad, of verlopen) afsluiten en de extensie laten weten.
 */
export async function veeg(): Promise<number> {
  try {
    await vernieuwOnbeperkt().catch((err) => console.error('[extensie-ontgrendeling] vernieuwen mislukt:', (err as Error).message));
    const rows = (await sys().query(`UPDATE app.extensie_ontgrendelingen o SET ingetrokken_op = now(), ingetrokken_door = 'systeem',
         reden_einde = CASE WHEN o.eind_op <= now() THEN 'verlopen'
                            WHEN EXISTS (SELECT 1 FROM app.tech_activaties a WHERE a.id::text = o.activatie_id AND a.beeindigd_reden = 'uitgelogd') THEN 'uitgelogd'
                            ELSE 'tech-einde' END
       WHERE o.ingetrokken_op IS NULL AND (o.eind_op <= now() OR (o.activatie_id IS NOT NULL AND NOT COALESCE(o.overleeft_activatie, false)
         AND NOT EXISTS (SELECT 1 FROM app.tech_activaties a WHERE a.id::text = o.activatie_id AND a.user_id = o.user_id AND a.beeindigd_op IS NULL AND a.eind_op > now())))
       RETURNING o.id, o.agent_id, o.user_id, o.reden_einde, o.ruimte`)).rows as Ingetrokken[];
    await naIntrekken(rows, 'systeem', null);
    return rows.length;
  } catch (err) { console.error('[extensie-ontgrendeling] vegen mislukt:', (err as Error).message); return 0; }
}
// Noodstop «Стоп» (ai-grants.stopAll): ook elke ontgrendeling van de gebruiker meteen intrekken.
grants.bijNoodstop((userId, actorId) => { void intrekken(userId, { alles: true }, 'noodstop', 'site', actorId).catch(() => 0); });

/** De extensie trok zelf in (pop-up, zijpaneel, opties, noodstop van de extensie): via WS of HTTP met het agenttoken. Geen passkey. */
export async function vergrendelVerzoek(agentId: string, userId: string, input: { gid?: unknown; reden?: unknown }): Promise<number> {
  const reden = (EXTENSIE_REDENEN as readonly string[]).includes(String(input.reden)) ? String(input.reden) as VergrendelReden : 'ingetrokken';
  const gid = typeof input.gid === 'string' && UUID.test(input.gid) ? input.gid : null;
  // Met gid alleen die rij (als hij van deze agent is); zonder gid alles van deze agent — intrekken is de veilige richting.
  const rows = (await sys().query(`UPDATE app.extensie_ontgrendelingen o SET ingetrokken_op = now(), ingetrokken_door = 'extensie', reden_einde = $4
     WHERE o.user_id = $1 AND o.agent_id = $2 AND o.ingetrokken_op IS NULL AND o.eind_op > now() AND ($3::uuid IS NULL OR o.id = $3)
     RETURNING o.id, o.agent_id, o.user_id, o.reden_einde, o.ruimte`, [userId, agentId, gid, reden])).rows as Ingetrokken[];
  await naIntrekken(rows, 'extensie', null);
  return rows.length;
}

/** Nieuw einde voor een lopende rij (verlengen door beheer): bijwerken, opnieuw ondertekenen en naar de extensie duwen. */
export async function eindeZetten(r: Rij, nieuwEind: number): Promise<{ rij: Rij; verzonden: boolean } | null> {
  const n = (await sys().query(`UPDATE app.extensie_ontgrendelingen o SET eind_op = to_timestamp($3::double precision / 1000)
      WHERE o.id = $1 AND o.user_id = $2 AND ${ACTIEF} RETURNING *`, [r.id, r.user_id, nieuwEind])).rows[0] as Rij | undefined;
  if (!n) return null;
  const m = await ondertekend(n);
  return { rij: n, verzonden: !!m && grants.pushNaarAgent(n.user_id, n.agent_id, m) > 0 };
}

// ---------------------------------------------------------------- gateway: na 'ready' en vóór elke browseropdracht
/**
 * 0111 (vóór het opnieuw duwen na een verbinding): rijen van DEZE agent die aan een browsersessie hangen (shared/extensie-matrix.ts
 * aanBrowserGebonden). '?' (geopend terwijl de extensie niet verbonden was) → aan de sessie van nu binden; een ANDERE sessie (of geen:
 * een extensie die niets meldt) = de browser is gesloten en opnieuw gestart (of de extensie bijgewerkt) → intrekken, reden
 * 'browser-gesloten'. Lange termijnen (browser_sessie NULL) blijven: die overleven een herstart (de server duwt ze opnieuw).
 * Alleen eigen rijen (agent_id + user_id). Gooit bij een DB-fout: naReady duwt dan niets (veilige kant).
 */
export async function browserSessieAfstemmen(agentId: string, userId: string): Promise<number> {
  if (!UUID.test(agentId)) return 0;
  const v = verbindingen.get(agentId);
  const sessie = v && v.userId === userId ? v.sessie : null;
  if (sessie) await sys().query(`UPDATE app.extensie_ontgrendelingen o SET browser_sessie = $3
     WHERE o.agent_id = $1 AND o.user_id = $2 AND o.ingetrokken_op IS NULL AND o.browser_sessie = '?'`, [agentId, userId, sessie]);
  const rows = (await sys().query(`UPDATE app.extensie_ontgrendelingen o SET ingetrokken_op = now(), ingetrokken_door = 'systeem', reden_einde = 'browser-gesloten'
     WHERE o.agent_id = $1 AND o.user_id = $2 AND o.ingetrokken_op IS NULL AND o.eind_op > now()
       AND o.browser_sessie IS NOT NULL AND o.browser_sessie <> '?' AND o.browser_sessie IS DISTINCT FROM $3::text
     RETURNING o.id, o.agent_id, o.user_id, o.reden_einde, o.ruimte`, [agentId, userId, sessie])).rows as Ingetrokken[];
  await naIntrekken(rows, 'systeem', null);
  return rows.length;
}
/** Welke browsersessie een NIEUWE rij krijgt: NULL (niet gebonden of extensie < 0.7.0), de gemelde sessie, of '?' (niet verbonden). */
function sessieVoorRij(agentId: string, userId: string, soort: EindeSoort, duurMs: number, versie: string): string | null {
  if (!aanBrowserGebonden(soort, duurMs)) return null;
  const v = verbindingen.get(agentId);
  if (v && v.userId === userId && v.sessie) return v.sessie;
  if (!versieMinstens(v?.versie || versie, EXTENSIE_VERSIE_MATRIX)) return soort === 'browser' ? '?' : null;
  return '?';
}

/** Na 'ready': de lopende ontgrendeling van DEZE agent (dit slot) opnieuw duwen + de AI-stand; zonder lopende rij altijd vergrendelen. */
export async function naReady(agentId: string, userId: string): Promise<boolean> {
  try {
    // 0111: eerst de browsersessie: na een herstart van de browser gaan de korte termijnen en «до закриття браузера» dicht.
    await browserSessieAfstemmen(agentId, userId);
    const r = await actieveOntgrendeling(agentId, userId);
    pushAiStand(agentId, userId);
    // Review 18.10 (1): geen lopende rij = ALTIJD vergrendelen (zonder gid: de extensie wist wat ze heeft). Zo overleeft een intrekking
    // tijdens een WS-onderbreking (vergrendel-push verloren) de herverbinding niet als «nog ontgrendeld».
    const vergrendel = () => { grants.pushNaarAgent(userId, agentId, { t: 'vergrendel', reden: 'ingetrokken' }); return false; };
    if (!r) return vergrendel();
    const m = await ondertekend(r);
    if (!m) return vergrendel();
    // Race: tussen lezen en ondertekenen kan de rij zijn ingetrokken of vervangen. Alleen versturen als hij nog de lopende is.
    const nu = await actieveOntgrendeling(agentId, userId);
    if (!nu || String(nu.id) !== String(r.id) || ms(nu.eind_op) !== ms(r.eind_op)) return nu ? naReady(agentId, userId) : vergrendel();
    return grants.pushNaarAgent(userId, agentId, m) > 0;
  } catch (err) { console.error('[extensie-ontgrendeling] na ready:', (err as Error).message); return false; }
}

const VERGRENDELD_TEKST = 'EXTENSIE_VERGRENDELD: the Mijn Ruimte extension in this browser is locked for this connection (no active unlock, or its term ended). Nothing is sent to it until the user unlocks it on the site '
  + `at ${BROWSER_BEHEER_PAD_EN} → «Відкрити доступ» with a term of their choice (15 min … 1 year, until the browser closes, until logout, until revoked): as a user with a confirmation of their session, or in the technical profile with their own passkey. `
  + 'Tell the user this exact place; do not retry until they confirm.';
// Review 18.10 (3): alleen https zonder poort en zonder gebruikersgegevens; admin.tarasevych.com:8443 is NIET admin.tarasevych.com.
const hostVan = (u: string) => { try { const x = new URL(u); return x.protocol === 'https:' && !x.port && !x.username && !x.password ? x.hostname.toLowerCase() : ''; } catch { return ''; } };
/**
 * Server-afdwinging (defense in depth) voor een browseragent: lopende ontgrendeling van DEZE agent in zijn eigen ruimte, slot aan
 * volgens het beleid, cap in de ontgrendeling én in het beleid, en elke URL in de parameters op een ontgrendelde host (exact; voor
 * 'prive' bovendien ∈ PRIVE_HOSTS). Bij een DB-fout: weigeren.
 */
export async function controleerBrowserOpdracht(agentId: string, userId: string, type: string, params: unknown): Promise<{ ok: true; gid: string; ruimte: AiRuimte } | { ok: false; fout: string }> {
  let r: Rij | null = null;
  let beleid: ExtensieBeleid | null = null;
  try { r = await actieveOntgrendeling(agentId, userId); if (r) beleid = await leesBeleid(userId); } catch { r = null; }
  if (!r || !beleid) return { ok: false, fout: VERGRENDELD_TEKST };
  const ruimte = ruimteOf(r.ruimte);
  // Dezelfde zevende voorwaarde, ook hier (defense in depth): een ontgrendeling van het TECHNISCHE slot die nog loopt terwijl
  // de dienst «ai» inmiddels uit of bevroren is, geeft geen enkele opdracht meer door. Zo is er geen venster tussen het
  // uitzetten van de dienst en het verlopen van de ontgrendeling.
  if (ruimte === 'technisch' && !(await aiDienstStand(userId).then((d) => d.aan).catch(() => false))) {
    return { ok: false, fout: 'EXTENSIE_RUIMTE: in the technical space the service «AI connections» is switched off or frozen for this account, so the technical slot of the extension does not exist. Tell the user to connect that service in their technical data space (mcp.tarasevych.com → Простори даних) or to use the private slot. Do not retry.' };
  }
  // Ruimtes-scheiding (contract §4.1–4.2, docs/ontwerp/RUIMTES-COMPATIBILITEIT.md): bij ELKE technische opdracht het anker opnieuw
  // controleren. Alleen met beide vlaggen aan; anders precies het oude gedrag. naUitloggen blijft onaangeroerd.
  if (ruimte === 'technisch') {
    const anker = await technischAnkerControle(agentId, userId, r).catch(() => null);
    if (anker) return { ok: false, fout: anker };
  }
  if (!ruimteAan(beleid, ruimte)) {
    return { ok: false, fout: `EXTENSIE_VERGRENDELD: the owner or an administrator switched this browser access off for this account (extension policy, ${BROWSER_BEHEER_PAD_EN} → «Усі користувачі»). Tell the user, do not retry.` };
  }
  const cap = grants.capabilityFor(type);
  const toegestaan = capsBinnenBeleid(beleid, ruimte, r.caps);
  if (!cap || !toegestaan.includes(cap as BrowserCap)) {
    const verklaring = ruimte === 'prive'
      ? `The user switches it on at ${BROWSER_BEHEER_PAD_EN} (slot «prive», row «${cap ?? type}»); a running unlock is re-signed at once, so no new confirmation is needed`
      : `The user's technical roles and the matrix at ${BROWSER_BEHEER_PAD_EN} (slot «technisch», row «${cap ?? type}») decide this; if the unlock itself lacks it, they unlock again with their passkey`;
    return { ok: false, fout: `EXTENSIE_CAP: the current unlock of this browser does not include ${cap ?? type} (allowed: ${toegestaan.join(', ') || 'none'}). ${verklaring}. Tell the user this exact place; do not retry.` };
  }
  // 0110: de matrix «Браузер і агенти» — per agent (claude, gpt, …) in dit slot. Niet ingesteld → zoals vóór 0110.
  const mw = await matrix.matrixWeigering(userId, ruimte, matrixCap(type, cap) ?? (cap as BrowserCap)).catch(() => `EXTENSIE_VERGRENDELD: the browser matrix could not be read; tell the user to retry in a moment (${BROWSER_BEHEER_PAD_EN}).`);
  if (mw) return { ok: false, fout: mw };
  // Scripts (evaluate_script) nooit in het privéslot en nooit zonder een extensie die ze kent.
  if (cap === 'browser.script' && (ruimte !== 'technisch' || !versieMinstens(liveVersie(agentId), EXTENSIE_VERSIE_MATRIX))) {
    return { ok: false, fout: `EXTENSIE_SCRIPT: evaluate_script runs only in the TECHNICAL slot, with extension ${EXTENSIE_VERSIE_MATRIX} or newer in the «diagnose» package and the row «Скрипти» ticked at ${BROWSER_BEHEER_PAD_EN}. Tell the user; do not retry.` };
  }
  const domeinen = ruimte === 'prive' ? r.domeinen.filter(isPriveHost) : r.domeinen;
  const buiten = grants.commandUrls(params).filter((u) => !domeinen.includes(hostVan(u)));
  if (buiten.length) {
    return { ok: false, fout: `EXTENSIE_HOST: the extension is unlocked only for ${domeinen.join(', ')}; this address is outside. The user adds the page when opening access at ${BROWSER_BEHEER_PAD_EN}. Tell the user, do not retry with another address.` };
  }
  return { ok: true, gid: String(r.id), ruimte };
}

/** Technische grant: moet een activatie_id hebben en de ankersessie van de site moet nog leven. Geeft een fouttekst of null. */
async function technischAnkerControle(agentId: string, userId: string, r: Rij): Promise<string | null> {
  const { scheidingAan } = await import('./ruimte-sessie');
  const kern = await import('./tech-ruimtes-kern');
  if (!(await scheidingAan(userId)) || !(await kern.v2Aan(userId))) return null;
  const { antwoordVoorCode } = await import('./ruimtes-compatibiliteit');
  const tekst = (code: string) => { const a = antwoordVoorCode(code); return `EXTENSIE_RUIMTE: ${code}. ${a.uitleg?.nl ?? ''} Tell the user; do not retry.`; };
  if (!r.activatie_id) return tekst('NIET_GEBONDEN');
  const v = (await sys().query('SELECT sessie_id FROM app.tech_ruimte_sessies WHERE id::text = $1 AND user_id = $2', [r.activatie_id, userId])).rows[0];
  if (!v) return null; // oude activering (tech_activaties): de bestaande controles gelden
  if ((await kern.siteSessie(String(v.sessie_id))).leeft) return null;
  await intrekken(userId, { gid: String(r.id) }, 'site-sessie-weg', 'site-sessie-weg', null).catch(() => 0);
  grants.pushNaarAgent(userId, agentId, { t: 'vergrendeld', code: 'SITE_SESSIE_WEG' });
  grants.sluitAgent(userId, agentId, 4401, 'site-sessie-weg');
  return tekst('SITE_SESSIE_WEG');
}

// ---------------------------------------------------------------- recht en status (site)
export type Recht = RechtTechnisch & { magOntgrendelen: boolean; activatie: tp.Activatie | null; heeftProfiel: boolean };
const telPasskeys = async (userId: string) => Number((await sys().query('SELECT count(*)::int AS n FROM app.passkeys WHERE user_id = $1', [userId])).rows[0]?.n || 0);
const aiGeblokkeerd = async (userId: string) => !!(await sys().query('SELECT blocked_at FROM app.user_ai_settings WHERE user_id = $1', [userId])).rows[0]?.blocked_at;

/** Technisch slot: mag deze gebruiker in DIT tabblad (tabcontext + sessie, zoals backend/tech-routes.ts) nu ontgrendelen? */
export async function recht(u: tp.Gebruiker, tabContext: string, sessie?: tp.Sessie | null, beleidIn?: ExtensieBeleid): Promise<Recht> {
  const [passkeys, beleid] = await Promise.all([telPasskeys(u.id), beleidIn ? Promise.resolve(beleidIn) : leesBeleid(u.id)]);
  const maxMinuten = Math.min(MAX_MINUTEN, beleid.technischMaxMinuten);
  const leeg = (code: Weigercode, extra: Partial<Recht> = {}): Recht => ({ mag: false, magOntgrendelen: false, code, rollen: [], caps: [], activatieTot: null, passkeys, maxMinuten, activatie: null, heeftProfiel: true, ...extra });
  if (await aiGeblokkeerd(u.id)) return leeg('ACCOUNT_GEBLOKKEERD', { heeftProfiel: !!(await tp.profielVan(u).catch(() => null)) });
  const profiel = await tp.profielVan(u);
  if (!profiel || profiel.ingetrokkenOp) return leeg('GEEN_TECH_PROFIEL', { heeftProfiel: false });
  if (!beleid.technischAan) return leeg('BELEID_UIT', { rollen: [...profiel.rollen] });
  const activatie = tp.TAB_RE.test(String(tabContext || '')) ? await tp.actieveActivatie(u.id, tabContext, sessie) : null;
  if (!activatie) return leeg('TECH_NIET_ACTIEF', { rollen: [...profiel.rollen] });
  // Zevende voorwaarde (20.10.2026): het technische slot bestaat alleen zolang de dienst «ai» in de technische
  // GEGEVENSRUIMTE aanstaat ('eigen' of 'gedeeld', app.ruimte_dienst_stand). Op 'uit', 'bevroren' of zonder de eenmalige
  // keuze is er niets te ontgrendelen. De zes bestaande voorwaarden blijven onveranderd staan: dit is er één bij.
  if (!(await aiTechnischToegestaan(u.id, tabContext))) return leeg('RUIMTE_DIENST_UIT', { rollen: [...activatie.rollen], activatie });
  const rollen = [...activatie.rollen];
  const caps = capsBinnenBeleid(beleid, 'technisch', capsVoorRollen(rollen));
  const activatieTot = activatie.modus === 'tijd' ? activatie.eind : null;
  if (!caps.length) return leeg('GEEN_BROWSER_RECHTEN', { rollen, activatieTot, activatie });
  if (!passkeys) return leeg('GEEN_PASSKEY', { rollen, caps, activatieTot, activatie });
  return { mag: true, magOntgrendelen: true, rollen, caps, activatieTot, passkeys, maxMinuten, activatie, heeftProfiel: true };
}

/** Browser-caps uit de actieve AI-toestemmingen van DEZE browser (ai-grants), ∩ beleid; tot = laatste einde van die toestemmingen. */
export async function priveToestemming(userId: string, agentId: string, beleid: ExtensieBeleid): Promise<{ caps: BrowserCap[]; tot: number | null }> {
  const eff = await grants.effectiveCaps(userId, agentId);
  if (eff.blocked) return { caps: [], tot: null };
  // 0110: de matrix «Браузер і агенти» (unie over alle agenten) telt mee naast de toestemmingen per browser (erfenis).
  const unie = await matrix.unieVan(userId, 'prive').catch(() => null);
  const caps = capsBinnenBeleid(beleid, 'prive', [...eff.caps.map((c) => c.capability), ...(unie ?? [])]);
  const totGrants = eff.caps.filter((c) => caps.includes(c.capability as BrowserCap)).reduce((m, c) => Math.max(m, ms(c.expiresAt)), 0);
  const tot = unie && unie.length ? Math.max(totGrants, Date.now() + MAX_DUUR_MS.prive) : totGrants;
  return { caps, tot: tot || null };
}

const stapOpAuthVan = (u: { id: string }, sessie?: tp.Sessie | null): StapOpAuth => ({
  user: { id: u.id },
  session: sessie?.id ? { id: String(sessie.id), createdAt: Number(sessie.createdAt) || 0 } : null,
  tabSession: sessie?.tabSessieId ? { id: String(sessie.tabSessieId), createdAt: 0 } : null,
});

/** Groepeert de sloten van dezelfde installatie: pairingId (zonder een eventueel achtervoegsel -prive/-technisch), anders de agent. */
export function browserIdVan(a: { id: string; pairing_id?: string | null }): string {
  const basis = a.pairing_id ? String(a.pairing_id).replace(/[-_:.](prive|technisch|tech|gebruiker)$/i, '') : `agent:${a.id}`;
  return createHash('sha256').update(`mr-browser:${basis}`).digest('base64url').slice(0, 16);
}

/** GET /api/owner/agents/extensie-status: beide sloten per browser + recht per ruimte + eigen beleid. */
export async function extensieStatus(u: tp.Gebruiker, tabContext: string, sessie?: tp.Sessie | null): Promise<ExtensieStatusAntwoord> {
  const beleid = await leesBeleid(u.id);
  const { activatie, heeftProfiel, ...rt } = await recht(u, tabContext, sessie, beleid);
  const agents = (await store.listAgents(u.id)).filter((a) => a.platform === 'browser');
  const rijen = await lopendeRijen([u.id]);
  const nu = Date.now();
  const geblokkeerd = rt.code === 'ACCOUNT_GEBLOKKEERD';
  const agenten = await Promise.all(agents.map(async (a): Promise<ExtensieAgentStatus> => {
    const live = verbindingen.get(a.id);
    const m = live ? meldingen.get(a.id) : undefined;
    const rij = rijen.find((x) => x.agent_id === a.id);
    const ruimte = ruimteOf(a.ruimte);
    return {
      agentId: a.id, naam: a.name, ruimte, browserId: browserIdVan(a), online: !!live, versie: m?.versie || live?.versie || a.agent_version || '',
      staat: m?.staat ?? 'onbekend', ontgrendeling: rij ? ontgrendelingVan(rij) : null, ai: aiStand(a.id, nu),
      lokaal: { verbonden: m?.lokaalVerbonden === true }, laatstGezien: a.last_seen_at ? ms(a.last_seen_at) : null,
      ...(ruimte === 'prive' ? { toestemming: await priveToestemming(u.id, a.id, beleid).catch(() => ({ caps: [] as BrowserCap[], tot: null })) } : {}),
    };
  }));
  const browsers = new Map<string, ExtensieBrowser>();
  for (const a of agenten) {
    const b = browsers.get(a.browserId) ?? { browserId: a.browserId, naam: a.naam, prive: null, technisch: null };
    // Meer dan één koppeling per slot (oude installaties): de laatst geziene telt.
    const cur = b[a.ruimte];
    if (!cur || (a.laatstGezien ?? 0) >= (cur.laatstGezien ?? 0)) b[a.ruimte] = a;
    if (a.ruimte === 'prive') b.naam = a.naam;
    browsers.set(a.browserId, b);
  }
  const priveCaps = BROWSER_CAPS.filter((c) => agenten.some((a) => a.toestemming?.caps.includes(c)));
  const prive: RechtPrive = {
    mag: false, caps: priveCaps, maxDagen: beleid.priveMaxDagen, domeinen: [...PRIVE_HOSTS], lokaal: beleid.lokaalAan,
    stapOpGeldig: await stapOpGeldig(stapOpAuthVan(u, sessie), Date.now(), { onthoud: false }).catch(() => false),
  };
  if (geblokkeerd) prive.code = 'ACCOUNT_GEBLOKKEERD';
  else if (!beleid.priveAan) prive.code = 'BELEID_UIT';
  else if (!priveCaps.length) prive.code = 'GEEN_BROWSER_RECHTEN';
  else prive.mag = true;
  const technisch: RechtTechnisch | null = heeftProfiel
    ? { mag: rt.mag, ...(rt.code ? { code: rt.code } : {}), rollen: rt.rollen, caps: rt.caps, activatieTot: rt.activatieTot, passkeys: rt.passkeys, maxMinuten: rt.maxMinuten }
    : null;
  const beheer = tp.isEigenaar(u) || !!activatie?.mogelijkheden.includes('users.manage');
  return {
    agenten, browsers: [...browsers.values()],
    recht: {
      magOntgrendelen: rt.magOntgrendelen, ...(rt.code ? { code: rt.code } : {}), rollen: rt.rollen, caps: rt.caps, activatieTot: rt.activatieTot, passkeys: rt.passkeys,
      prive, technisch,
    },
    beleid, beheer, nu,
  };
}

// ---------------------------------------------------------------- ontgrendelen
/** Wie roept aan: sessie-uitkomst van ownerRequireSession (zoals toegangssleutels.ts/tech-routes.ts) + de tabcontext van het verzoek. */
export type Aanroep = {
  user: tp.Gebruiker & { name?: string }; service: string; tabContext: string;
  session?: { id: string; createdAt: number } | null; tabSession?: { id: string; createdAt?: number } | null;
};
export const sessieVan = (a: Aanroep): tp.Sessie | null => a.session?.id ? { id: String(a.session.id), createdAt: Number(a.session.createdAt) || 0, tabSessieId: a.tabSession?.id ? String(a.tabSession.id) : null } : null;
const sessieSleutel = (a: Aanroep) => String(a.tabSession?.id || a.session?.id || '');
const stapOpAuth = (a: Aanroep): StapOpAuth => ({
  user: { id: a.user.id }, session: a.session?.id ? { id: String(a.session.id), createdAt: Number(a.session.createdAt) || 0 } : null,
  tabSession: a.tabSession?.id ? { id: String(a.tabSession.id), createdAt: Number(a.tabSession.createdAt) || 0 } : null,
});

type Binding = { agentId: string; caps: BrowserCap[]; domeinen: string[]; lokaal: boolean; eind: number; nonce: string; activatieId: string; rollen: string[];
  /** 0110: gekozen termijn (null = oude vorm «minuten»), hoe de rij eindigt en of ze de activering overleeft — mee in de challenge. */
  termijn?: TermijnId | null; eindeSoort?: EindeSoort; overleeft?: boolean };
/** De challenge is de sha256 van precies deze binding (base64url, 43 tekens): wie hem ondertekent, keurt precies dit voorstel goed. */
export function uitdagingVoor(userId: string, b: Binding): string {
  const lijst = (a: readonly string[]) => [...a].sort().join(',');
  const staart = b.termijn || b.overleeft ? [`termijn=${b.termijn ?? ''}`, `einde=${b.eindeSoort ?? 'tech-einde'}`, `overleeft=${b.overleeft ? '1' : '0'}`] : [];
  return createHash('sha256').update(['mr-extensie-ontgrendelen-v2', userId, b.agentId, 'technisch', lijst(b.caps), lijst(b.domeinen), b.lokaal ? '1' : '0', String(b.eind), b.nonce, b.activatieId, ...staart].join('\n')).digest('base64url');
}

/**
 * 0110: termijn uit de invoer (`termijn` = id uit ONTGRENDEL_TERMIJNEN; anders de oude `minuten`/`dagen`). Een termijn langer dan
 * wat een extensie < 0.7.0 aanvaardt (8 u technisch / 30 d privé) gaat alleen naar een extensie die hem kan controleren
 * (TERMIJN_VEREIST_UPDATE); de bovengrens van het beleid kapt stil (het voorstel toont het werkelijke einde).
 */
function termijnKiezen(input: Record<string, unknown>, ruimte: AiRuimte, o: { nu: number; activatieEind: number | null; plafondMs: number; versie: string; oudMs: number }): { eind: number; soort: EindeSoort; overleeft: boolean; termijn: TermijnId | null } {
  const t: Termijn | null = input.termijn === undefined || input.termijn === null ? null : termijnVan(input.termijn);
  if (input.termijn !== undefined && input.termijn !== null && !t) weiger('DUUR_ONGELDIG', 'termijn', ruimte);
  if (t?.alleenTechnisch && ruimte !== 'technisch') weiger('DUUR_ONGELDIG', 'termijn-technisch', ruimte);
  if (!t) {
    // Oude vorm: minuten (technisch, binnen de activering) of dagen (privé).
    const m = ruimte === 'technisch' ? Math.round(Number(input.minuten)) : Number(input.dagen === undefined || input.dagen === null ? PRIVE_STANDAARD_DAGEN : input.dagen) * 24 * 60;
    if (ruimte === 'technisch' && (!Number.isFinite(m) || m < MIN_MINUTEN || m > MAX_MINUTEN)) weiger('DUUR_ONGELDIG');
    if (ruimte === 'prive' && !(PRIVE_DAGEN_KEUZES as readonly number[]).includes(m / (24 * 60))) weiger('DUUR_ONGELDIG');
    const eind = Math.min(o.nu + m * 60_000, o.activatieEind ?? Infinity, o.nu + o.plafondMs);
    if (eind - o.nu > o.oudMs && !versieMinstens(o.versie, EXTENSIE_VERSIE_MATRIX)) weiger('TERMIJN_VEREIST_UPDATE', o.versie, ruimte);
    return { eind, soort: ruimte === 'technisch' ? 'tech-einde' : 'duur', overleeft: false, termijn: null };
  }
  const u = termijnEinde(t, o.nu, { ruimte, activatieEind: o.activatieEind, plafondMs: o.plafondMs });
  // 0111: «до закриття браузера» kan alleen een extensie die haar browsersessie meldt (≥ 0.7.0).
  if ((u.eind - o.nu > o.oudMs || t.soort === 'browser') && !versieMinstens(o.versie, EXTENSIE_VERSIE_MATRIX)) weiger('TERMIJN_VEREIST_UPDATE', o.versie, ruimte);
  return { eind: u.eind, soort: u.soort, overleeft: u.overleeftActivatie, termijn: t.id };
}

/** Gekoppelde browser van deze gebruiker IN DEZE RUIMTE die een ondertekende ontgrendeling kan ontvangen. */
async function browserAgent(userId: string, agentId: unknown, ruimte: AiRuimte): Promise<store.AgentRow> {
  const id = String(agentId || '');
  if (!UUID.test(id)) weiger('AGENT_ONBEKEND');
  const agent = await store.getAgent(userId, id);
  if (!agent || agent.user_id !== userId) weiger('AGENT_ONBEKEND');
  if (agent!.platform !== 'browser') weiger('GEEN_BROWSER_AGENT');
  if (ruimteOf(agent!.ruimte) !== ruimte) weiger('VERKEERDE_RUIMTE', `${ruimteOf(agent!.ruimte)}≠${ruimte}`, ruimte);
  const versie = verbindingen.get(id)?.versie || agent!.agent_version || '';
  if (!versieMinstens(versie)) weiger('EXTENSIE_TE_OUD', versie);
  if (!(await opdrachtSleutel(id))) weiger('GEEN_OPDRACHTSLEUTEL');
  return agent!;
}

function domeinenUit(v: unknown, ruimte: AiRuimte): string[] {
  const lijst = ruimte === 'prive' ? PRIVE_HOSTS : null;
  if (v === undefined || v === null) return [...(lijst ?? ADMIN_HOSTS_STANDAARD)].sort();
  const max = lijst ? lijst.length : 10;
  if (!Array.isArray(v) || !v.length || v.length > max) weiger('DOMEIN_ONGELDIG', '', ruimte);
  const s = new Set<string>();
  for (const d of v as unknown[]) {
    const h = String(d ?? '').trim().toLowerCase();
    if (!(ruimte === 'prive' ? isPriveHost(h) : isToegestaneHost(h))) weiger('DOMEIN_ONGELDIG', '', ruimte);
    s.add(h);
  }
  return [...s].sort();
}

/** Een weigering vastleggen en doorgeven. */
async function metAudit<T>(u: tp.Gebruiker, agentId: unknown, ruimte: AiRuimte, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (err) {
    if (err instanceof Weigering) {
      if (!err.ruimte) err.ruimte = ruimte;
      await audit(u.id, 'owner.extensie.geweigerd', 'denied', { reden: err.code, ruimte, agentId: typeof agentId === 'string' ? agentId.slice(0, 40) : '', ...(err.detail ? { detail: err.detail.slice(0, 60) } : {}) });
    }
    throw err;
  }
}

/** Vorige rij(en) van deze agent intrekken ('nieuw') en de nieuwe rij invoegen, in één transactie; daarna duwen en vastleggen. */
async function nieuweRij(userId: string, agentId: string, waarden: { ruimte: AiRuimte; activatieId: string | null; caps: BrowserCap[]; domeinen: string[]; lokaal: boolean; rollen: string[]; nonce: string; eind: number; vinger: string | null; bevestigdMet: string; eindeSoort?: EindeSoort; overleeftActivatie?: boolean; versie?: string }) {
  const soort: EindeSoort = waarden.eindeSoort ?? (waarden.activatieId ? 'tech-einde' : 'duur');
  const browserSessie = sessieVoorRij(agentId, userId, soort, waarden.eind - Date.now(), waarden.versie ?? '');
  const client = await sys().connect();
  let nieuw: Rij; let vervangen: Ingetrokken[];
  // 0110: één bovengrens van 366 dagen in beide ruimtes (de termijn zelf is al op beleid en keuze gekapt).
  const grens = "interval '366 days'";
  try {
    await client.query('BEGIN');
    vervangen = (await client.query(`UPDATE app.extensie_ontgrendelingen SET ingetrokken_op = now(), ingetrokken_door = 'site',
        reden_einde = CASE WHEN eind_op > now() THEN 'nieuw' ELSE 'verlopen' END WHERE agent_id = $1 AND user_id = $2 AND ingetrokken_op IS NULL
        RETURNING id, agent_id, user_id, reden_einde, ruimte`, [agentId, userId])).rows as Ingetrokken[];
    nieuw = (await client.query(`INSERT INTO app.extensie_ontgrendelingen (agent_id, user_id, activatie_id, caps, domeinen, lokaal, rollen, nonce, eind_op, passkey_vinger, ruimte, bevestigd_met, einde_soort, overleeft_activatie, browser_sessie)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, LEAST(to_timestamp($9::double precision / 1000), now() + ${grens}), $10, $11, $12, $13, $14, $15) RETURNING *`,
      [agentId, userId, waarden.activatieId, waarden.caps, waarden.domeinen, waarden.lokaal, waarden.rollen, waarden.nonce, waarden.eind, waarden.vinger, waarden.ruimte, waarden.bevestigdMet,
        soort, waarden.overleeftActivatie === true, browserSessie])).rows[0] as Rij;
    if (ms(nieuw.eind_op) <= ms(nieuw.begin_op)) throw new Weigering(waarden.ruimte === 'prive' ? 'DUUR_ONGELDIG' : 'TECH_NIET_ACTIEF', '', waarden.ruimte);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally { client.release(); }
  for (const x of vervangen.filter((y) => y.reden_einde === 'nieuw')) {
    grants.pushNaarAgent(x.user_id, x.agent_id, { t: 'vergrendel', gid: String(x.id), reden: 'nieuw' });
    await audit(x.user_id, 'owner.extensie.ingetrokken', 'success', { agentId: x.agent_id, gid: String(x.id), reden: 'nieuw', door: 'site', ruimte: x.ruimte });
  }
  // HUB-05 (één bron voor de termijn): de ontgrendeling zet de browser ook AAN tot precies haar einde, zodat de hoofdschakelaar
  // («AI mag deze browser gebruiken», 0.4) nooit een andere datum toont dan de ontgrendeling. Intrekken laat de schakelaar met rust:
  // zonder lopende ontgrendeling gaat er toch niets naar de extensie (connectors-gateway).
  const minuten = Math.max(1, Math.min(store.BROWSER_MAX_MINUTEN, Math.ceil((ms(nieuw.eind_op) - Date.now()) / 60_000)));
  // «Без обмеження»: de hoofdschakelaar heeft geen einddatum (sentinel 2999). Een minuten-arm zou de browser eerder uitzetten dan de rij.
  await store.setBrowserEnabled(userId, agentId, true, soort === 'handmatig' ? null : minuten).catch(() => false);
  const bericht = await ondertekend(nieuw);
  const verzonden = !!bericht && grants.pushNaarAgent(userId, agentId, bericht) > 0;
  return { nieuw, verzonden };
}

/** Technisch, stap 1: voorstel + challenge. Body {agentId, minuten, domeinen?, lokaal?}. */
export async function uitdaging(a: Aanroep, input: Record<string, unknown>) {
  return metAudit(a.user, input.agentId, 'technisch', async () => {
    if (!(await rateLimit(`ext-ontgrendel:${a.user.id}`, 10, 60)).ok) weiger('TE_VEEL_POGINGEN');
    const sleutel = sessieSleutel(a);
    if (!sleutel) weiger('NIET_INGELOGD');
    const beleid = await leesBeleid(a.user.id);
    const r = await recht(a.user, a.tabContext, sessieVan(a), beleid);
    if (r.code) weiger(r.code);
    const agent = await browserAgent(a.user.id, input.agentId, 'technisch');
    const domeinen = domeinenUit(input.domeinen, 'technisch');
    const lokaal = input.lokaal === true && beleid.lokaalAan;
    const nu = Date.now();
    const act = r.activatie!;
    // Beleid kapt de duur (geen fout: het voorstel toont het werkelijke einde). 0110: termijn naar keuze; de activering is geen
    // grens meer als de eigenaar zelf langer koos (overleeft) — technische hulpmiddelen eisen bij gebruik toch een lopende activering.
    const activatieEind = act.modus === 'tijd' ? act.eind : null;
    const keuze = termijnKiezen(input, 'technisch', { nu, activatieEind, plafondMs: Math.min(r.maxMinuten, MAX_MINUTEN) * 60_000, versie: verbindingen.get(agent.id)?.versie || agent.agent_version || '', oudMs: MAX_MINUTEN_OUD * 60_000 });
    const eind = keuze.eind;
    if (eind <= nu + 60_000) weiger('TECH_NIET_ACTIEF');
    const binding: Binding = { agentId: agent.id, caps: r.caps, domeinen, lokaal, eind, nonce: randomBytes(16).toString('base64url'), activatieId: act.id, rollen: r.rollen,
      ...(keuze.termijn || keuze.overleeft ? { termijn: keuze.termijn, eindeSoort: keuze.soort, overleeft: keuze.overleeft } : {}) };
    const challenge = uitdagingVoor(a.user.id, binding);
    const pk = await import('./toegangssleutels');
    const { rows } = await grants.alsGebruiker(a.user.id, async (q) => {
      await q("DELETE FROM app.passkey_uitdagingen WHERE user_id = $1 AND verloopt_op < now() - interval '1 day'", [a.user.id]);
      const ins = await q(`INSERT INTO app.passkey_uitdagingen (user_id, sessie, doel, uitdaging, verloopt_op, binding) VALUES ($1, $2, 'extensie-ontgrendelen', $3, now() + make_interval(secs => $4), $5::jsonb) RETURNING id, verloopt_op`,
        [a.user.id, sleutel, challenge, UITDAGING_MS / 1000, JSON.stringify(binding)]);
      const keys = await q('SELECT credential_id, transports FROM app.passkeys WHERE user_id = $1 ORDER BY aangemaakt_op, id', [a.user.id]);
      return { rows: [{ ...ins.rows[0], keys: keys.rows }] };
    });
    const rij = rows[0] as { id: string; verloopt_op: Date; keys: Array<{ credential_id: string; transports: string[] | null }> };
    return {
      uitdagingId: String(rij.id), verloopt: ms(rij.verloopt_op),
      publicKey: {
        challenge, rpId: pk.passkeyRp().rpId, timeout: 120000, userVerification: 'required',
        allowCredentials: rij.keys.map((k) => { const t = pk.transportsVoorGet(k.transports); return { type: 'public-key', id: k.credential_id, ...(t ? { transports: t } : {}) }; }),
      },
      voorstel: { ruimte: 'technisch' as const, caps: binding.caps, domeinen, eind, rollen: binding.rollen, lokaal, eindeSoort: keuze.soort, overleeftActivatie: keuze.overleeft, termijn: keuze.termijn },
    };
  });
}

/** Technisch, stap 2: assertie van een EIGEN passkey (UV) op de challenge → rij, ondertekenen, duwen. Body {agentId, uitdagingId, assertie}. */
export async function ontgrendelen(a: Aanroep, input: Record<string, unknown>): Promise<{ ontgrendeling: OntgrendelingWeergave; verzonden: boolean }> {
  return metAudit(a.user, input.agentId, 'technisch', async () => {
    if (!(await rateLimit(`ext-ontgrendel-pk:${a.user.id}`, 20, 600)).ok) weiger('TE_VEEL_POGINGEN');
    const sleutel = sessieSleutel(a);
    if (!sleutel) weiger('NIET_INGELOGD');
    const id = String(input.uitdagingId || '');
    if (!UUID.test(id)) weiger('UITDAGING_ONGELDIG');
    // Eenmalig (atomisch): alleen deze gebruiker, deze sessie, dit doel, niet verlopen.
    const c = await grants.alsGebruiker(a.user.id, async (q) => (await q(`UPDATE app.passkey_uitdagingen SET gebruikt_op = now()
        WHERE id = $1 AND user_id = $2 AND sessie = $3 AND doel = 'extensie-ontgrendelen' AND gebruikt_op IS NULL AND verloopt_op > now() RETURNING uitdaging, binding`,
      [id, a.user.id, sleutel])).rows[0] as { uitdaging: string; binding: Binding | null } | undefined);
    if (!c?.binding) weiger('UITDAGING_ONGELDIG');
    const b = c!.binding!;
    if (String(input.agentId || '') !== b.agentId || uitdagingVoor(a.user.id, b) !== c!.uitdaging) weiger('UITDAGING_ONGELDIG');
    // Rechten opnieuw (moment van ontgrendelen): dezelfde lopende activering, niet minder rollen dan in het voorstel, beleid nog steeds ruim genoeg.
    const r = await recht(a.user, a.tabContext, sessieVan(a));
    if (r.code) weiger(r.code);
    if (r.activatie!.id !== b.activatieId || !b.caps.every((x) => r.caps.includes(x))) weiger('TECH_NIET_ACTIEF');
    // Assertie met een EIGEN passkey (zelfde controle als toegangssleutels.ts stapOp: rpId, origin, UP+UV, handtekening, teller).
    const raw = (input.assertie && typeof input.assertie === 'object' ? input.assertie : {}) as Record<string, unknown>;
    const veld = (v: unknown, max: number) => { const t = String(v ?? ''); if (!t || t.length > max || !B64U.test(t)) weiger('PASSKEY_ONGELDIG', 'ANTWOORD_ONGELDIG'); return t; };
    const kern = await import('../deploy/goedkeuring/webauthn-kern.mjs');
    const assertie = { credentialId: veld(raw.credentialId, 1400), clientDataJSON: veld(raw.clientDataJSON, 8192), authenticatorData: veld(raw.authenticatorData, 8192), signature: veld(raw.signature, 2048) };
    const pk = await import('./toegangssleutels');
    const sleutels = await grants.alsGebruiker(a.user.id, async (q) => (await q('SELECT id, credential_id, alg, jwk, naam, vingerafdruk, sign_count FROM app.passkeys WHERE user_id = $1', [a.user.id])).rows as Array<{ id: string; credential_id: string; alg: number; jwk: never; naam: string; vingerafdruk: string; sign_count: string | number }>);
    if (!sleutels.length) weiger('GEEN_PASSKEY');
    const v = kern.verifieerAssertie({ assertie, verwachteUitdaging: c!.uitdaging, rpId: pk.passkeyRp().rpId, origins: eigenOrigin(a.service, pk.passkeyRp().rpId, kern),
      sleutels: sleutels.map((x) => ({ credentialId: x.credential_id, alg: x.alg, jwk: x.jwk, label: x.naam, vingerafdruk: x.vingerafdruk })) });
    if (!v.ok) weiger('PASSKEY_ONGELDIG', String((v as { code?: string }).code || ''));
    const ok = v as { ok: true; credentialId: string; signCount: number; vlaggen: number };
    const rij = sleutels.find((x) => x.credential_id === ok.credentialId);
    if (!rij) weiger('PASSKEY_ONGELDIG', 'SLEUTEL_ONBEKEND');
    if (!kern.tellerOk(Number(rij!.sign_count), ok.signCount)) weiger('PASSKEY_ONGELDIG', 'TELLER_TERUG');
    await grants.alsGebruiker(a.user.id, (q) => q('UPDATE app.passkeys SET sign_count = GREATEST(sign_count, $3), laatst_gebruikt_op = now() WHERE id = $1 AND user_id = $2',
      [rij!.id, a.user.id, Math.max(0, ok.signCount)]));
    // Koppeling nog steeds geldig (niet ingetrokken intussen, juiste ruimte, sleutel aanwezig, versie).
    const ag = await browserAgent(a.user.id, b.agentId, 'technisch');
    const vinger = String(rij!.vingerafdruk).slice(0, 16);
    const { nieuw, verzonden } = await nieuweRij(a.user.id, b.agentId, { ruimte: 'technisch', activatieId: b.activatieId, caps: b.caps, domeinen: b.domeinen, lokaal: b.lokaal, rollen: b.rollen, nonce: b.nonce, eind: b.eind, vinger, bevestigdMet: 'passkey',
      eindeSoort: b.eindeSoort ?? 'tech-einde', overleeftActivatie: b.overleeft === true, versie: verbindingen.get(b.agentId)?.versie || ag.agent_version || '' });
    await audit(a.user.id, 'owner.extensie.ontgrendeld', 'success', {
      ruimte: 'technisch', agentId: b.agentId, gid: String(nieuw.id), caps: b.caps, domeinen: b.domeinen, lokaal: b.lokaal, rollen: b.rollen, eind: new Date(ms(nieuw.eind_op)).toISOString(),
      activatie: b.activatieId, passkey: vinger, verzonden, dienst: a.service, termijn: b.termijn ?? null, eindeSoort: b.eindeSoort ?? 'tech-einde', overleeftActivatie: b.overleeft === true,
    });
    return { ontgrendeling: ontgrendelingVan(nieuw), verzonden };
  });
}

/**
 * Privé: POST /api/owner/agents/ontgrendeling/prive {agentId, dagen?: 1|7|30, domeinen?, lokaal?}. Geen technisch profiel nodig, wel een
 * geldige step-up van DEZE sessie (elke methode). caps = actieve toestemmingen van deze browser ∩ beleid; nooit admin.*.
 */
export async function priveOntgrendelen(a: Aanroep, input: Record<string, unknown>): Promise<{ ontgrendeling: OntgrendelingWeergave; verzonden: boolean }> {
  return metAudit(a.user, input.agentId, 'prive', async () => {
    if (!(await rateLimit(`ext-ontgrendel-prive:${a.user.id}`, 10, 60)).ok) weiger('TE_VEEL_POGINGEN');
    if (!sessieSleutel(a)) weiger('NIET_INGELOGD');
    if (await aiGeblokkeerd(a.user.id)) weiger('ACCOUNT_GEBLOKKEERD');
    const beleid = await leesBeleid(a.user.id);
    if (!beleid.priveAan) weiger('BELEID_UIT');
    const agent = await browserAgent(a.user.id, input.agentId, 'prive');
    const domeinen = domeinenUit(input.domeinen, 'prive');
    const lokaal = input.lokaal === true && beleid.lokaalAan;
    const { caps, tot } = await priveToestemming(a.user.id, agent.id, beleid);
    if (!caps.length || !tot) weiger('GEEN_BROWSER_RECHTEN', '', 'prive');
    // 0110: de termijn (en of deze extensie hem kan controleren) vóór de step-up: geen venster voor iets dat toch geweigerd wordt.
    const nu = Date.now();
    const keuze = termijnKiezen(input, 'prive', { nu, activatieEind: null, plafondMs: Math.min(maxDuurMs(beleid, 'prive'), MAX_DUUR_MS.prive), versie: verbindingen.get(agent.id)?.versie || agent.agent_version || '', oudMs: PRIVE_MAX_DAGEN_OUD * 86_400_000 });
    // Pas nu (alles is verder in orde) de bevestiging van deze sessie: geen venster voor iets dat toch geweigerd wordt.
    const sa = stapOpAuth(a);
    if (!(await stapOpGeldig(sa, Date.now(), { onthoud: false }))) weiger('STEP_UP_REQUIRED'); // ontgrendelen van de extensie vraagt altijd
    const methode = (await stapOpMethode(sa).catch(() => '')) || 'stap-op';
    const eind = Math.min(tot!, keuze.eind);
    if (eind <= nu + 60_000) weiger('GEEN_BROWSER_RECHTEN', 'toestemming eindigt', 'prive');
    const { nieuw, verzonden } = await nieuweRij(a.user.id, agent.id, { ruimte: 'prive', activatieId: null, caps, domeinen, lokaal, rollen: [], nonce: randomBytes(16).toString('base64url'), eind, vinger: null, bevestigdMet: methode.slice(0, 20),
      eindeSoort: keuze.soort, overleeftActivatie: false, versie: verbindingen.get(agent.id)?.versie || agent.agent_version || '' });
    await audit(a.user.id, 'owner.extensie.ontgrendeld', 'success', {
      ruimte: 'prive', agentId: agent.id, gid: String(nieuw.id), caps, domeinen, lokaal, termijn: keuze.termijn ?? input.dagen ?? PRIVE_STANDAARD_DAGEN, eindeSoort: keuze.soort, eind: new Date(ms(nieuw.eind_op)).toISOString(), bevestigdMet: methode, verzonden, dienst: a.service,
    });
    return { ontgrendeling: ontgrendelingVan(nieuw), verzonden };
  });
}

/** Review 18.10 (2): voor het ontgrendelen telt alleen de origin van de dienst van DEZE sessie (mcp of admin), niet id/hub uit de standaardlijst. */
function eigenOrigin(service: string, rpId: string, kern: { originHoortBijRp: (o: string, rp: string) => boolean }): string[] {
  const host = (SERVICE_HOSTS as Record<string, string>)[service];
  const o = host ? `https://${host}` : '';
  return o && kern.originHoortBijRp(o, rpId) ? [o] : [];
}

/**
 * 0110: na een wijziging van de matrix «Браузер і агенти» krijgen de LOPENDE ontgrendelingen van die ruimte meteen de nieuwe
 * mogelijkheden (unie over alle agenten ∩ beleid ∩ — technisch — de rollen van de rij) en worden ze opnieuw ondertekend en geduwd.
 * Zo verdwijnt de klacht «EXTENSIE_CAP … allowed: browser.read» zonder opnieuw ontgrendelen. De route eiste al een step-up als het
 * ruimer werd. Een rij die leeg zou worden blijft staan (de matrix weigert bij dispatch toch alles). Geeft het aantal bijgewerkte rijen.
 */
export async function capsHerzien(userId: string, ruimte: AiRuimte, unie: readonly BrowserCap[]): Promise<number> {
  const beleid = await leesBeleid(userId);
  const rijen = (await lopendeRijen([userId])).filter((r) => ruimteOf(r.ruimte) === ruimte);
  let n = 0;
  for (const r of rijen) {
    const grens = ruimte === 'technisch' && r.rollen?.length ? capsVoorRollen(r.rollen) : capsVoorRuimte(ruimte);
    const nieuw = capsBinnenBeleid(beleid, ruimte, unie.filter((c) => grens.includes(c)));
    if (!nieuw.length) continue;
    const oud = BROWSER_CAPS.filter((c) => r.caps.includes(c));
    if (nieuw.length === oud.length && nieuw.every((c, i) => c === oud[i])) continue;
    const u = (await sys().query(`UPDATE app.extensie_ontgrendelingen o SET caps = $3 WHERE o.id = $1 AND o.user_id = $2 AND ${ACTIEF} RETURNING *`, [r.id, userId, nieuw])).rows[0] as Rij | undefined;
    if (!u) continue;
    const m = await ondertekend(u);
    if (m) grants.pushNaarAgent(userId, String(u.agent_id), m);
    await audit(userId, 'owner.extensie.caps-herzien', 'success', { gid: String(u.id), ruimte, agentId: String(u.agent_id), van: oud, naar: nieuw });
    n += 1;
  }
  return n;
}

/** HTTP-terugval van de extensie (WS dicht): Authorization: Bearer <agenttoken>, body {gid, reden}. */
export async function intrekkenMetAgentToken(token: string, input: { gid?: unknown; reden?: unknown }): Promise<{ ok: true; ingetrokken: number } | null> {
  if (token.length < 20 || token.length > 200) return null;
  const agent = await store.findAgentByTokenHash(createHash('sha256').update(token).digest('hex'));
  if (!agent || agent.platform !== 'browser') return null;
  if (!(await rateLimit(`ext-vergrendel:${agent.id}`, 30, 60)).ok) return { ok: true, ingetrokken: 0 };
  return { ok: true, ingetrokken: await vergrendelVerzoek(agent.id, agent.user_id, input) };
}

/** Alleen voor tests: geheugenstand leegmaken. */
export function _testReset(): void {
  for (const a of ai.values()) if (a.timer) clearTimeout(a.timer);
  ai.clear(); meldingen.clear(); verbindingen.clear();
}
