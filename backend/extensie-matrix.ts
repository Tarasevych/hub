// Matrix «Браузер і агенти» (zone E, 22.10.2026; migratie 0110; shared/extensie-matrix.ts).
//
// Eén bron voor wat elke AI-agent (claude, gpt, grok, …) via de browserextensie mag, per slot (prive | technisch) en per mogelijkheid.
// Wordt op drie plaatsen afgedwongen, alle op de server:
//   1. backend/ai-toestemmingen.ts checkCommand (via registreerBrowserMatrix): zonder toestemming per browser (erfenis) telt de matrix als
//      toestemming; `zonder_bevestiging` bepaalt of een destructieve opdracht op een klik wacht;
//   2. backend/extensie-ontgrendeling.ts controleerBrowserOpdracht: vlak vóór het versturen — de mogelijkheid moet in de ontgrendeling
//      ÉN in het beleid ÉN in de matrix voor DEZE agent staan; anders EXTENSIE_CAP/EXTENSIE_AGENT met het exacte pad naar dit scherm;
//   3. backend/connector-v2-browser.ts: evaluate_script (browser.script) bestaat alleen met het vinkje «Скрипти» in het technische slot.
// Welke agent? Uit het connectortoken (mcp-namens.agent), nooit uit wat de client over zichzelf zegt; een oude /mcp-koppeling of de
// sitechat heeft geen slug en krijgt de rij '*'.
// Lezen en schrijven via de systeemrol; wie mag schrijven beslist de route (eigen sessie; ruimer = step-up).
import { auditToevoegen } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';
import { V2_AGENTEN, isAgentSlug, type AgentSlug } from '../shared/connector-v2/agenten';
import { klantVan } from '../shared/ai-verbinding';
import {
  BROWSER_BEHEER_PAD_EN, CAP_INFO, MATRIX_AGENT_ALLE, SNEL_SETS, STANDAARD_INSTELLINGEN, capsUnie, capsVoorAgent, capsVoorRuimte, isMatrixAgent, legeMatrix, matrixCap,
  matrixIngesteld, type Matrix, type MatrixAgent, type MatrixInvoer, type MatrixRij, type SlotInstellingen,
} from '../shared/extensie-matrix';
import { BROWSER_CAPS, isBrowserCap, type BrowserCap } from '../shared/extensie-ontgrendeling';
import * as grants from './ai-toestemmingen';
import { huidigeNamens } from './mcp-namens';
import { V2_OPTIES } from '../shared/connector-v2/catalogus';
import type { KetenAgent } from '../shared/extensie-matrix';
import * as connStore from './connectors-opslag';

const sys = () => getPool('systeem');

// ---------------------------------------------------------------- lezen
function rijVan(r: Record<string, any>): MatrixRij {
  return {
    ruimte: ruimteOf(r.ruimte), agent: isMatrixAgent(r.agent) ? r.agent : MATRIX_AGENT_ALLE,
    caps: BROWSER_CAPS.filter((c) => Array.isArray(r.caps) && r.caps.includes(c)),
    gewijzigdOp: r.gewijzigd_op ? new Date(r.gewijzigd_op).getTime() : null, gewijzigdDoor: r.gewijzigd_door ? String(r.gewijzigd_door) : null,
  };
}
export async function leesMatrix(userId: string): Promise<Matrix> {
  const m = legeMatrix();
  const { rows } = await sys().query('SELECT * FROM app.extensie_matrix WHERE user_id = $1 ORDER BY ruimte, agent', [userId]);
  for (const r of rows) {
    const rij = rijVan(r);
    m.rijen.push(rij);
    if (rij.agent === MATRIX_AGENT_ALLE) m.instellingen[rij.ruimte] = { zonderBevestiging: r.zonder_bevestiging === true, devtoolsNamen: r.devtools_namen === true };
  }
  return m;
}

/** De agent van de LOPENDE aanroep (connector v2: slug uit het token; oud /mcp: klantnaam → slug; sitechat/onbekend: null). */
export function agentSlugNu(): AgentSlug | null {
  const n = huidigeNamens();
  if (!n) return null;
  if (n.agent && isAgentSlug(n.agent)) return n.agent;
  const klant = klantVan(n.client);
  return V2_AGENTEN.find((a) => a.klant === klant)?.slug ?? null;
}
/** Naam voor in een fouttekst. */
export const agentNaamNu = (): string => { const s = agentSlugNu(); return s ? (V2_AGENTEN.find((a) => a.slug === s)?.naam ?? s) : (huidigeNamens()?.client || 'this AI'); };

/** Caps die de matrix DEZE aanroep in deze ruimte geeft; null = matrix niet ingesteld voor die ruimte (erfenis geldt). */
export async function capsNu(userId: string, ruimte: AiRuimte): Promise<BrowserCap[] | null> {
  return capsVoorAgent(await leesMatrix(userId), ruimte, agentSlugNu());
}
export async function instellingenVan(userId: string, ruimte: AiRuimte): Promise<SlotInstellingen> {
  return (await leesMatrix(userId)).instellingen[ruimte] ?? { ...STANDAARD_INSTELLINGEN };
}
/** Unie van alle agenten in een ruimte (wat een nieuwe ontgrendeling van dat slot hoogstens draagt); null = niet ingesteld. */
export async function unieVan(userId: string, ruimte: AiRuimte): Promise<BrowserCap[] | null> {
  return capsUnie(await leesMatrix(userId), ruimte);
}

// ---------------------------------------------------------------- weigering met het exacte pad (klacht 1: «де це вмикається»)
const capNaam = (c: string) => (isBrowserCap(c) ? CAP_INFO[c].uk[0] : c);
/**
 * EXTENSIE_CAP / EXTENSIE_AGENT met rij en kolom: de AI leest het en zegt de mens precies waar te klikken. Geeft null als de
 * matrix dit toestaat of niet ingesteld is (dan beslissen ontgrendeling + beleid alleen, zoals vóór 0110).
 */
export async function matrixWeigering(userId: string, ruimte: AiRuimte, cap: BrowserCap): Promise<string | null> {
  const m = await leesMatrix(userId);
  const slug = agentSlugNu();
  const caps = capsVoorAgent(m, ruimte, slug);
  if (caps === null || caps.includes(cap)) return null;
  // Welke kolom geldt NU: de eigen kolom van deze agent, of — zonder eigen kolom — «*» (alle agenten). De tekst noemt beide wegen.
  const eigen = !!slug && m.rijen.some((r) => r.ruimte === ruimte && r.agent === slug);
  const kolom = eigen ? `column «${slug}»` : `column «${MATRIX_AGENT_ALLE}» (all agents${slug ? `; or give ${agentNaamNu()} its own column «${slug}»` : ''})`;
  const slot = ruimte === 'technisch' ? 'technical' : 'private';
  if (!caps.length) {
    return `EXTENSIE_AGENT: the ${slot} slot of the Mijn Ruimte extension allows NOTHING for ${agentNaamNu()} (${kolom} of the matrix is empty). `
      + `The user switches it on at ${BROWSER_BEHEER_PAD_EN}: slot «${ruimte}», ${kolom}, tick the rows this agent needs (at least «${capNaam('browser.read')}»). Tell the user this exact place; do not retry until they confirm.`;
  }
  return `EXTENSIE_CAP: the ${slot} slot of the Mijn Ruimte extension does not allow "${cap}" for ${agentNaamNu()} (allowed now: ${caps.join(', ')}). `
    + `The user switches it on at ${BROWSER_BEHEER_PAD_EN}: slot «${ruimte}», row «${capNaam(cap)}» (${cap}), ${kolom}. Tell the user this exact place; do not retry until they confirm.`;
}

// ---------------------------------------------------------------- haak voor ai-grants.checkCommand
/**
 * Toestemming per browser (ai_grants) is de erfenis van vóór 0110; de matrix is de nieuwe weg. Zonder grant-rij telt de matrix
 * als toestemming voor de ruimte van de browseragent. `zonderBevestiging` komt altijd uit de matrix (ook met een grant).
 */
grants.registreerBrowserMatrix(async (agent, capability) => {
  const { rows } = await sys().query("SELECT ruimte FROM app.agents WHERE id::text = $1 AND user_id = $2 AND platform = 'browser' AND revoked_at IS NULL", [agent.id, agent.user_id]);
  if (!rows[0]) return null;
  const ruimte = ruimteOf(rows[0].ruimte);
  const m = await leesMatrix(agent.user_id);
  const caps = capsVoorAgent(m, ruimte, agentSlugNu());
  if (caps === null) return null;
  return { toegestaan: caps.includes(capability as BrowserCap), zonderBevestiging: m.instellingen[ruimte].zonderBevestiging };
});

grants.registreerBrowserMatrixCaps(async (agent) => {
  const { rows } = await sys().query("SELECT ruimte FROM app.agents WHERE id::text = $1 AND user_id = $2 AND platform = 'browser' AND revoked_at IS NULL", [agent.id, agent.user_id]);
  if (!rows[0]) return null;
  const ruimte = ruimteOf(rows[0].ruimte);
  const m = await leesMatrix(agent.user_id);
  const unie = capsUnie(m, ruimte);
  return unie === null ? null : { caps: unie, zonderBevestiging: m.instellingen[ruimte].zonderBevestiging };
});

// ---------------------------------------------------------------- schrijven
export class MatrixFout extends Error { constructor(public veld: string) { super(`MATRIX_ONGELDIG:${veld}`); } }
export function valideerInvoer(input: Record<string, unknown>): MatrixInvoer {
  const ruimte = input.ruimte === 'prive' || input.ruimte === 'technisch' ? input.ruimte : null;
  if (!ruimte) throw new MatrixFout('ruimte');
  if (!Array.isArray(input.rijen) || input.rijen.length > 10) throw new MatrixFout('rijen');
  const gezien = new Set<string>();
  const toegestaan = capsVoorRuimte(ruimte);
  const rijen: MatrixInvoer['rijen'] = [];
  for (const r of input.rijen as unknown[]) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
    if (!isMatrixAgent(o.agent) || gezien.has(o.agent)) throw new MatrixFout('agent');
    gezien.add(o.agent);
    if (!Array.isArray(o.caps) || !(o.caps as unknown[]).every(isBrowserCap)) throw new MatrixFout('caps');
    // «Консоль і мережа» zonder «Читати» bestaat niet (console/netwerk vallen in ai-grants onder lezen): lezen komt erbij.
    const ruw = (o.caps as string[]).includes('browser.console') ? [...(o.caps as string[]), 'browser.read'] : (o.caps as string[]);
    const caps = BROWSER_CAPS.filter((c) => ruw.includes(c));
    if (caps.some((c) => !toegestaan.includes(c))) throw new MatrixFout('caps-ruimte');
    rijen.push({ agent: o.agent as MatrixAgent, caps });
  }
  // De rij '*' bestaat altijd zodra de matrix is ingesteld: zonder haar zou «geen eigen kolom» niets betekenen.
  if (!gezien.has(MATRIX_AGENT_ALLE)) rijen.push({ agent: MATRIX_AGENT_ALLE, caps: [] });
  const inst: Partial<SlotInstellingen> = {};
  const i = (input.instellingen && typeof input.instellingen === 'object' ? input.instellingen : {}) as Record<string, unknown>;
  for (const k of ['zonderBevestiging', 'devtoolsNamen'] as const) {
    if (i[k] === undefined) continue;
    if (typeof i[k] !== 'boolean') throw new MatrixFout(k);
    inst[k] = i[k] as boolean;
  }
  return { ruimte, rijen, instellingen: inst };
}

/** Eén ruimte in één transactie vervangen. Geeft {voor, na}. De aanroeper (route) besliste al over de step-up. */
export async function schrijfMatrix(userId: string, invoer: MatrixInvoer, door: string): Promise<{ voor: Matrix; na: Matrix }> {
  const voor = await leesMatrix(userId);
  const client = await sys().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM app.extensie_matrix WHERE user_id = $1 AND ruimte = $2', [userId, invoer.ruimte]);
    const inst = { ...voor.instellingen[invoer.ruimte], ...(invoer.instellingen ?? {}) };
    for (const r of invoer.rijen) {
      await client.query(`INSERT INTO app.extensie_matrix (user_id, ruimte, agent, caps, zonder_bevestiging, devtools_namen, gewijzigd_door, gewijzigd_op)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
        [userId, invoer.ruimte, r.agent, r.caps, r.agent === MATRIX_AGENT_ALLE ? inst.zonderBevestiging : false, r.agent === MATRIX_AGENT_ALLE ? inst.devtoolsNamen : false, door.slice(0, 200)]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally { client.release(); }
  const na = await leesMatrix(userId);
  // De extensie krijgt de nieuwe «settings» meteen (zelfde push als bij een toestemming per browser).
  await grants.pushSettings(userId).catch(() => undefined);
  await auditToevoegen({ ownerId: userId, actorId: userId, action: 'owner.extensie.matrix', type: 'ai', result: 'success', details: {
    ruimte: invoer.ruimte, rijen: invoer.rijen.map((r) => ({ agent: r.agent, caps: r.caps })), instellingen: na.instellingen[invoer.ruimte], door: door.slice(0, 40),
  } }).catch((err) => console.error('[extensie-matrix] AUDIT MISLUKT:', (err as Error).message));
  return { voor, na };
}

/** Snelle set: alles / alleen lezen / niets — voor ALLE agenten van die ruimte (eigen kolommen worden gelijkgetrokken). */
export function snelleInvoer(ruimte: AiRuimte, set: keyof typeof SNEL_SETS, bestaande: Matrix): MatrixInvoer {
  const caps = SNEL_SETS[set].caps(ruimte);
  const agenten = new Set<MatrixAgent>([MATRIX_AGENT_ALLE, ...bestaande.rijen.filter((r) => r.ruimte === ruimte).map((r) => r.agent)]);
  return { ruimte, rijen: [...agenten].map((agent) => ({ agent, caps: [...caps] })) };
}

/** Voor de stand: is de matrix ingesteld, en zo niet, wat geeft de erfenis (toestemmingen per browser) nu? */
export async function erfenisCaps(userId: string, ruimte: AiRuimte): Promise<BrowserCap[]> {
  const { rows } = await sys().query(`SELECT DISTINCT g.capability FROM app.ai_grants g JOIN app.agents a ON a.id = g.agent_id AND a.user_id = g.user_id
     WHERE g.user_id = $1 AND a.platform = 'browser' AND a.revoked_at IS NULL AND COALESCE(a.ruimte, 'prive') = $2 AND g.revoked_at IS NULL AND g.expires_at > now()`, [userId, ruimte]);
  const s = new Set(rows.map((r: { capability: string }) => r.capability));
  return BROWSER_CAPS.filter((c) => s.has(c));
}
export const ingesteld = (m: Matrix, ruimte: AiRuimte) => matrixIngesteld(m, ruimte);

// ---------------------------------------------------------------- ketting «що ще має бути дозволено» + modi van de site
const browserOpties = (kant: 'gebruiker' | 'beheer') => V2_OPTIES.filter((o) => o.groep === 'browser' && o.kant === kant && o.status === 'actief' && o.intern);
/** Mogelijkheid van een intern browserhulpmiddel (via TOOL_TO_COMMAND → ai-grants). */
export async function capVanHulpmiddel(tool: string): Promise<BrowserCap | null> {
  const { TOOL_TO_COMMAND } = await import('./connectors-hulpmiddelen');
  const type = TOOL_TO_COMMAND[tool];
  return type ? matrixCap(type, grants.capabilityFor(type)) : null;
}

/** Per agent en kant: rechten van de koppeling en de modus per hulpmiddel (ondertekend beleid of schakelaars van de site). */
export async function ketenVoor(userId: string): Promise<KetenAgent[]> {
  const [{ leesStand, beslissing }, { effectiveMode }, v2st] = await Promise.all([import('./ai-beleid'), import('./connectors-hulpmiddelen'), import('./connector-v2-opslag')]);
  const stand = await leesStand();
  const modes = await connStore.getToolModes(userId);
  const uit: KetenAgent[] = [];
  for (const a of V2_AGENTEN) {
    const k = (await v2st.actieveKoppelingen(userId, a.slug))[0] ?? null;
    const kanten = [];
    for (const kant of ['gebruiker', 'beheer'] as const) {
      const opts = browserOpties(kant);
      const rechten = k ? opts.filter((o) => k.kanten.includes(kant) && k.sleutels.includes(o.key)).length : null;
      const modus = async (tool: string) => (stand.staat === 'geldig' ? (await beslissing({ client: a.naam, agent: a.slug }, tool)).mode : stand.staat === 'ongeldig' ? 'off' : effectiveMode(tool, modes[tool]));
      const m = await Promise.all(opts.map(async (o) => [o.intern as string, await modus(o.intern as string)] as const));
      kanten.push({ kant, rechten, totaal: opts.length, uit: m.filter(([, x]) => x === 'off').map(([t]) => t).sort(), vragen: m.filter(([, x]) => x === 'ask').map(([t]) => t).sort() });
    }
    uit.push({ slug: a.slug, naam: a.naam, bron: stand.staat === 'geldig' ? 'ondertekend' : stand.staat === 'ongeldig' ? 'ongeldig' : 'site', kanten });
  }
  return uit;
}

/**
 * Na het opslaan van de matrix (alleen zonder geldig ondertekend AI-beleid — dan beslist dat beleid en blijven de schakelaars van de
 * site buiten spel): de modus van elk browserhulpmiddel volgt de matrix. Is de mogelijkheid in minstens één slot aan, dan:
 *   'always' als ELK slot waarin ze aan staat «без підтвердження» heeft, anders 'ask' voor riskante hulpmiddelen en de standaard
 *   (geen eigen keuze) voor de rest. Staat ze nergens aan, dan blijft de modus zoals hij is (de matrix weigert toch).
 * Geeft het aantal gewijzigde modi. Alleen de eigen instellingen van deze gebruiker; audit 'owner.extensie.matrix.modi'.
 */
export async function modiVolgenMatrix(userId: string, m: Matrix): Promise<number> {
  const { leesStand } = await import('./ai-beleid');
  if ((await leesStand()).staat === 'geldig') return 0;
  const { defaultMode } = await import('./connectors-hulpmiddelen');
  const huidig = await connStore.getToolModes(userId);
  const tools = [...new Set([...browserOpties('gebruiker'), ...browserOpties('beheer')].map((o) => o.intern as string))];
  const wijziging: Record<string, 'always' | 'ask' | 'off' | null> = {};
  for (const t of tools) {
    const cap = await capVanHulpmiddel(t);
    if (!cap) continue;
    const sloten = (['prive', 'technisch'] as const).filter((r) => (capsUnie(m, r) ?? []).includes(cap));
    if (!sloten.length) continue;
    const zonder = sloten.every((r) => m.instellingen[r].zonderBevestiging);
    const gewenst: 'always' | 'ask' | null = zonder ? 'always' : defaultMode(t) === 'off' ? 'ask' : null;
    const nu = huidig[t] ?? null;
    if (nu !== gewenst) wijziging[t] = gewenst;
  }
  const n = Object.keys(wijziging).length;
  if (n) {
    await connStore.setToolModes(userId, wijziging);
    await auditToevoegen({ ownerId: userId, actorId: userId, action: 'owner.extensie.matrix.modi', type: 'ai', result: 'success', details: { wijziging } }).catch(() => undefined);
  }
  return n;
}
