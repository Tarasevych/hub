// Beleidsdienst OPA in SCHADUW (architectuur 13.10.2026, etap 6). De app beslist zoals altijd; daarnaast — zonder te wachten — vragen
// we OPA op 127.0.0.1:8181 wat het beleid zegt («huidig» = hoe de app nu beslist, «doel» = alleen in een actief technisch profiel) en
// tellen we de uitkomst in app.beleid_schaduw. In schaduw heeft OPA NOOIT invloed op het antwoord: onbereikbaar of fout = alleen tellen.
// Afdwingen (fail-closed, etap B) staat onderaan (afdwingAdmin) en is UIT tot root "beheer-alleen-tech": true zet — pas doen als
// «verschil» = 0 en «doel-weigert» ≈ 0 gedurende een periode (tabblad «Правила (OPA)»).
// Uitzetten: OPA_SCHADUW=uit (dan geen enkele aanroep). Andere adres alleen voor tests: OPA_URL.
import { readFile } from 'node:fs/promises';
import { auditToevoegen } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import { actieveActivatie, TAB_RE } from './tech-profiel';
import { envGeforceerd, schakelaarTabel } from '../server/platform/schakelaars';
import { tel as telZekering } from '../server/platform/antwoord-teller';

export type Uitkomst = 'gelijk' | 'verschil' | 'doel-weigert' | 'onbereikbaar';
type Besluit = { allow: boolean; reden: string };
export type AdminInvoer = { soort: 'admin'; capability: string; subject: { eigenaar: boolean; adminRol: string; status: string; dienst: string }; tech: { actief: boolean; mogelijkheden: string[] } };

const opaUrl = () => (process.env.OPA_URL || 'http://127.0.0.1:8181').replace(/\/$/, '');
export const schaduwAan = () => process.env.OPA_SCHADUW !== 'uit';

/** Eén vraag aan OPA; null = onbereikbaar/ongeldig (binnen 300 ms). */
export async function vraagOpa(input: AdminInvoer, timeoutMs = 300): Promise<{ huidig: Besluit; doel: Besluit } | null> {
  try {
    const r = await fetch(`${opaUrl()}/v1/data/mijnruimte/toegang`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }), signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: { huidig?: Besluit; doel?: Besluit } };
    const h = j.result?.huidig, d = j.result?.doel;
    return h && d && typeof h.allow === 'boolean' && typeof d.allow === 'boolean' ? { huidig: h, doel: d } : null;
  } catch { return null; }
}

/** Puur (getest): uitkomst uit het besluit van de app en dat van OPA. */
export function vergelijk(app: boolean, opa: { huidig: Besluit; doel: Besluit } | null): { uitkomst: Uitkomst; reden: string } {
  if (!opa) return { uitkomst: 'onbereikbaar', reden: '' };
  if (opa.huidig.allow !== app) return { uitkomst: 'verschil', reden: String(opa.huidig.reden || '').slice(0, 60) };
  if (app && !opa.doel.allow) return { uitkomst: 'doel-weigert', reden: String(opa.doel.reden || '').slice(0, 60) };
  return { uitkomst: 'gelijk', reden: '' };
}

// Tellers in het geheugen, elke 10 s naar de database (zoals rls-audit.ts).
const teller = new Map<string, number>();
let timer: NodeJS.Timeout | null = null;
function tel(actie: string, uitkomst: Uitkomst, reden: string) {
  const k = `${actie}\u0000${uitkomst}\u0000${reden}`;
  teller.set(k, (teller.get(k) || 0) + 1);
  if (!timer) { timer = setTimeout(() => { timer = null; void schaduwWegschrijven(); }, 10_000); timer.unref?.(); }
}
export async function schaduwWegschrijven(): Promise<void> {
  if (!teller.size) return;
  const items = [...teller.entries()].map(([k, aantal]) => { const [actie, uitkomst, reden] = k.split('\u0000'); return { actie, uitkomst, reden, aantal }; });
  teller.clear();
  try {
    await getPool('systeem').query(`INSERT INTO app.beleid_schaduw (actie, uitkomst, reden, aantal)
      SELECT x.actie, x.uitkomst, x.reden, x.aantal FROM jsonb_to_recordset($1::jsonb) AS x(actie text, uitkomst text, reden text, aantal bigint)
      ON CONFLICT (actie, uitkomst, reden) DO UPDATE SET aantal = app.beleid_schaduw.aantal + EXCLUDED.aantal, laatst = now()`, [JSON.stringify(items)]);
  } catch (err) { console.error('[beleid] wegschrijven mislukt:', (err as Error).message); }
}

/**
 * Schaduw voor adminContext (backend/index.ts). Niet awaiten: loopt na het besluit, raakt het antwoord nooit.
 * Het technisch profiel van DIT tabblad (zelfde tabcontext als de sessie) bepaalt «doel».
 */
export function schaduwAdmin(a: { userId: string; eigenaar: boolean; adminRol: string; status: string; dienst: string; capability: string; allow: boolean; tab: unknown }): Promise<void> {
  if (!schaduwAan()) return Promise.resolve();
  return (async () => {
    const tab = typeof a.tab === 'string' && TAB_RE.test(a.tab) ? a.tab : '';
    const act = tab ? await actieveActivatie(a.userId, tab).catch(() => null) : null;
    const input: AdminInvoer = { soort: 'admin', capability: a.capability, subject: { eigenaar: a.eigenaar, adminRol: a.adminRol, status: a.status, dienst: a.dienst }, tech: { actief: !!act, mogelijkheden: act?.mogelijkheden ?? [] } };
    const v = vergelijk(a.allow, await vraagOpa(input));
    if (v.uitkomst === 'verschil') console.warn(`[beleid] VERSCHIL tussen app en OPA: admin:${a.capability} app=${a.allow} reden=${v.reden}`);
    tel(`admin:${a.capability}`, v.uitkomst, v.reden);
  })().catch(() => undefined);
}

/** Overzicht voor het beheerpaneel: gezondheid van OPA + tellers. */
export async function schaduwStand() {
  const t0 = Date.now();
  let gezond = false;
  try { gezond = (await fetch(`${opaUrl()}/health`, { signal: AbortSignal.timeout(800) })).ok; } catch { gezond = false; }
  const ms = Date.now() - t0;
  const rijen = (await getPool('systeem').query('SELECT actie, uitkomst, reden, aantal, eerst, laatst FROM app.beleid_schaduw ORDER BY actie, uitkomst, reden')).rows;
  return { gezond, ms, aan: schaduwAan(), afdwingen: await afdwingenAan(), rijen: rijen.map((r) => ({ actie: r.actie, uitkomst: r.uitkomst as Uitkomst, reden: r.reden, aantal: Number(r.aantal), eerst: new Date(r.eerst).getTime(), laatst: new Date(r.laatst).getTime() })) };
}

// ---------------------------------------------------------------- etap B: afdwingen (standaard UIT)
// «Beheerrechten alleen in een actief technisch profiel.» Aan alleen als root in /etc/mijn-ruimte/mcp-rechten.json
// "beheer-alleen-tech": true zet (exact de boolean; de site kan dit bestand niet schrijven). Dan, NA het gewone besluit van de app:
//  1. de lokale regel (doelLokaal, gelijk aan «doel» in toegang.rego) moet toestaan, én
//  2. OPA moet bereikbaar zijn en huidig + doel toestaan — onbereikbaar of fout = WEIGEREN (fail-closed).
// Herstel als OPA stuk is: root zet de schakelaar terug op false (of herstart mijn-ruimte-opa). Een vlag of de site kan dat niet.
// Waarom pas nu en uit: eerst moeten «Розбіжність» en «Без тех. профілю» in het tabblad «Правила (OPA)» lang 0 zijn.

/** Spiegel van deploy/opa/beleid/data.json → doel_tech (tests/eenheid/beleid-afdwingen.test.ts houdt ze gelijk). */
export const DOEL_TECH: Readonly<Record<string, string>> = {
  'admin.read': '', 'users.manage': 'users.manage', 'roles.manage': 'roles.delegate', 'audit.read': 'journaal.lezen',
  'devices.read': 'diagnose.lezen', 'apps.manage': 'diensten.beheren', 'sso.manage': 'diensten.beheren', 'directories.manage': 'users.manage',
};

/** «doel» van toegang.rego, als het gewone besluit al toestaat. Puur. */
export function doelLokaal(capability: string, tech: { actief: boolean; mogelijkheden: readonly string[] }): { allow: boolean; reden: string } {
  if (!tech.actief) return { allow: false, reden: 'tech-niet-actief' };
  const nodig = DOEL_TECH[capability];
  if (nodig === undefined) return { allow: false, reden: 'tech-mist-onbekend' };
  if (nodig === '' || tech.mogelijkheden.includes(nodig)) return { allow: true, reden: 'tech' };
  return { allow: false, reden: `tech-mist-${nodig}` };
}

const rechtenPad = () => process.env.MCP_RECHTEN_PAD || '/etc/mijn-ruimte/mcp-rechten.json';
let schakelaarCache: { tot: number; aan: boolean } | null = null;
/** Root-schakelaar, 10 s in het geheugen (één bestand lezen per 10 s, niet per verzoek). Ontbreekt of iets anders dan true = uit. */
export async function rootAfdwingenAan(nu = Date.now()): Promise<boolean> {
  if (schakelaarCache && schakelaarCache.tot > nu) return schakelaarCache.aan;
  let aan = false;
  try { const d = JSON.parse(await readFile(rechtenPad(), 'utf8')); aan = !!d && typeof d === 'object' && (d as Record<string, unknown>)['beheer-alleen-tech'] === true; } catch { aan = false; }
  schakelaarCache = { tot: nu + 10_000, aan };
  return aan;
}
/** 0066: waar de stand vandaan komt. OPA_AFDWINGEN=1/0 forceert; root-bestand true = aan (de site kan dat niet uitzetten);
 *  anders de schakelaar van de eigenaar op de site (/diagnostiek → «Захист», aan/uit zonder herstart). */
export async function afdwingenBron(nu = Date.now()): Promise<{ aan: boolean; bron: 'env' | 'root' | 'site' }> {
  const env = envGeforceerd('opa-afdwingen');
  if (env) return { aan: env === 'aan', bron: 'env' };
  if (await rootAfdwingenAan(nu)) return { aan: true, bron: 'root' };
  return { aan: schakelaarTabel('opa-afdwingen'), bron: 'site' };
}
export async function afdwingenAan(nu = Date.now()): Promise<boolean> { return (await afdwingenBron(nu)).aan; }
export const _afdwingenCacheLeeg = () => { schakelaarCache = null; };

/**
 * Na het gewone besluit (dat al TOESTAAT): null = doorgaan; anders de foutcode voor de site.
 * OWNER_ADMIN_TECH_REQUIRED — geen actief technisch profiel in dit tabblad, of het mist de mogelijkheid;
 * BELEID_ONBEREIKBAAR      — OPA antwoordde niet binnen 800 ms (fail-closed).
 */
export async function afdwingAdmin(a: { userId: string; eigenaar: boolean; adminRol: string; status: string; dienst: string; capability: string; tab: unknown }): Promise<null | 'OWNER_ADMIN_TECH_REQUIRED' | 'BELEID_ONBEREIKBAAR'> {
  if (!(await afdwingenAan())) return null;
  const tab = typeof a.tab === 'string' && TAB_RE.test(a.tab) ? a.tab : '';
  const act = tab ? await actieveActivatie(a.userId, tab).catch(() => null) : null;
  const tech = { actief: !!act, mogelijkheden: act?.mogelijkheden ?? [] };
  const weiger = async (code: 'OWNER_ADMIN_TECH_REQUIRED' | 'BELEID_ONBEREIKBAAR', reden: string) => {
    await auditToevoegen({ ownerId: a.userId, actorId: a.userId, action: 'owner.beleid.geweigerd', type: 'beveiliging', result: 'denied', details: { capability: a.capability, code, reden } }).catch(() => undefined);
    return code;
  };
  const lokaal = doelLokaal(a.capability, tech);
  if (!lokaal.allow) return weiger('OWNER_ADMIN_TECH_REQUIRED', lokaal.reden);
  const opa = await vraagOpa({ soort: 'admin', capability: a.capability, subject: { eigenaar: a.eigenaar, adminRol: a.adminRol, status: a.status, dienst: a.dienst }, tech: { actief: tech.actief, mogelijkheden: [...tech.mogelijkheden] } }, 800);
  if (!opa) { telZekering('opa'); return weiger('BELEID_ONBEREIKBAAR', 'opa'); } // zekering (antwoord-teller.ts)
  if (!opa.huidig.allow || !opa.doel.allow) return weiger('OWNER_ADMIN_TECH_REQUIRED', String(opa.doel.reden || opa.huidig.reden || 'opa').slice(0, 60));
  return null;
}
