// «ПІДТВЕРДЖЕННЯ НА САЙТІ» — de server-kant van de ene wachtrij (migratie 0098; model en regels in shared/ai-bevestiging.ts).
//
// HOE EEN HULPMIDDEL DIT GEBRUIKT (ook voor de andere rechten van connector v2 — zie de API-notitie in de kop van
// shared/ai-bevestiging.ts en tests/eenheid/ai-bevestiging-20261021.test.ts):
//
//   registreerBevestigSoort({
//     soort: 'mail.verzenden', dienst: 'mail', ruimtes: ['prive'], risico: 'hoog',
//     valideer: (ruw) => ({ ok: true, params }),        // bij het AANMAKEN: normaliseren, nooit iets uitvoeren
//     beschrijf: (params) => ({ titel, samenvatting, details }), // wat de mens ziet (uk + nl)
//     voerUit: async ({ userId, lade, params, keuze }) => ({ ok: true, resultaat }), // pas NA «Підтвердити»
//   });
//   const uit = await vraagEnWacht({ userId, ruimte: huidigeRuimte(), soort: 'mail.verzenden', params, tool: 'mail_send' });
//   return agentTekst(uit);           // JSON voor de AI: status, bevestiging_id, resultaat of fout, en wat nu te doen
//   // later, met alleen het id:      agentTekst(await bevestigingVoorAgent(userId, id, huidigeRuimte()))
//
// Poorten, in deze volgorde, en elke weigering komt in het journaal (owner.ai.bevestiging.*):
//   AANMAKEN   soort bekend · ruimte toegestaan voor de soort · gegevenslade van de dienst open (gegevensLade) · parameters geldig ·
//              hoogstens BEVESTIG_MAX_OPEN open · versleutelen (DEK als de kluis aan staat; gesloten = SLEUTELKLUIS_GESLOTEN) · melding
//              in DE ruimte van het verzoek.
//   BEVESTIGEN zelfde mens (WHERE user_id) · zelfde ruimte als het tabblad NU · nog 'wacht' en niet verlopen · hash van het scherm =
//              opgeslagen hash = hash opnieuw uit de ontsleutelde parameters · verse sterke step-up bij hoog/kritiek · keuze van
//              de mens geldig · gegevenslade nog open → atomair wacht→bezig → uitvoeren in die lade → uitgevoerd/mislukt.
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import {
  BEVESTIG_MAX_OPEN, BEVESTIG_TERMIJN_MS, BEVESTIG_WACHT_MS, HASH_RE, ID_RE, SOORT_RE, bevestigLink, foutUitleg, hashInvoer, hoogste,
  isBevestigRisico, isBevestigStatus, isEindStatus, ruimteVan, stapOpNodig, volgendeStap,
  type AgentUitslag, type BevestigBeschrijving, type BevestigDetail, type BevestigRisico, type BevestigRuimte, type BevestigStatus,
  type BevestigingWeergave, type Tweetalig,
} from '../shared/ai-bevestiging';
import type { DeelbareDienst, Lade } from '../shared/ruimte-scheiding';
import { gegevensLade } from './ruimte-scheiding';
import { metLade } from './ruimte-cloud-agenda';
import { herversleutelEnvelop, isGeslotenFout, ontzegel, registreerHerversleutelaar, verzegel } from './sleutelkluis';
import { SLEUTEL_GESLOTEN_CODE, isServerEnvelop } from '../shared/sleutelkluis';
import { meld } from './melder';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { huidigeNamens } from './mcp-namens';
import { bijNoodstop } from './ai-toestemmingen';

const sys = () => getPool('systeem');
export const TABEL = 'app.ai_bevestiging';
/** Serversleutel als de kluis uit staat: een eigen sleutel als die bestaat, anders de TOTP-sleutel (bestaat op elke uitrol). */
const serverSleutelNaam = () => (process.env.AI_BEVESTIGING_SLEUTEL_V1 ? 'AI_BEVESTIGING_SLEUTEL_V1' : 'TOTP_ENCRYPTION_KEY_V1');
const aad = (userId: string, ruimte: BevestigRuimte, id: string, deel: 'parameters' | 'resultaat') => `ai-bevestiging|${userId}|${ruimte}|${id}|${deel}`;
export const parameterHash = (v: { soort: string; ruimte: BevestigRuimte; userId: string; params: unknown }): string =>
  createHash('sha256').update(hashInvoer(v), 'utf8').digest('hex');
const gelijk = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const kort = (v: unknown, max = 80) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const code = (v: unknown) => (/^[A-Z0-9_]{1,80}$/.test(String(v ?? '')) ? String(v) : 'BEVESTIGING_UITVOEREN_MISLUKT');

export class BevestigFout extends Error { constructor(public code: string, public status = 400) { super(code); } }
const fout = (c: string, status = 400): never => { throw new BevestigFout(c, status); };

// ------------------------------------------------------------------------------------------------ het register van soorten
export type UitvoerContext<P> = {
  userId: string; ruimte: BevestigRuimte; lade: Lade; params: P; keuze: Record<string, unknown>;
  aanvraag: { id: string; agent: string; klant: string; grantId: string; tool: string; soort: string };
  /** Wie bevestigde en hoe: het tabblad (tabContext) en de step-up-methode van de bevestigende sessie ('passkey' | 'totp' | …). */
  bevestiger?: { tabContext?: string; stapOpMethode?: string };
};
export type UitvoerUitslag = { ok: true; resultaat: unknown; uitkomst?: BevestigDetail[] } | { ok: false; fout: string; resultaat?: unknown };
export type BevestigSoortDef<P = Record<string, unknown>> = {
  /** 'groep.handeling', bv. 'mail.verzenden' (SOORT_RE). */
  soort: string;
  /** De dienst waarvan de GEGEVENSLADE open moet zijn (backend/ruimte-scheiding.ts → gegevensLade). */
  dienst: DeelbareDienst;
  /** In welke ruimtes deze soort mag bestaan. */
  ruimtes: readonly BevestigRuimte[];
  /** Vast risico, of per verzoek (nooit lager dan `risicoMinimaal`). */
  risico: BevestigRisico | ((params: P) => BevestigRisico);
  /** Bij het AANMAKEN: controleren en normaliseren. Gooit niet; geeft een foutcode. */
  valideer: (ruw: unknown) => { ok: true; params: P } | { ok: false; fout: string };
  /** Wat de mens ziet (uk + nl). Puur. */
  beschrijf: (params: P) => BevestigBeschrijving;
  /** Bij het BEVESTIGEN: de eigen keuze van de mens (bv. «voor iedereen met de link»). null = goed; anders een foutcode. */
  valideerKeuze?: (keuze: Record<string, unknown>, params: P) => string | null;
  /** Pas na de bevestiging, in de gegevenslade van het verzoek. Geeft een foutcode, gooit liever niet. */
  voerUit: (ctx: UitvoerContext<P>) => Promise<UitvoerUitslag>;
  /** Hoe lang het verzoek open blijft (hoogstens BEVESTIG_TERMIJN_MS). */
  termijnMs?: number;
};
const REGISTER = new Map<string, BevestigSoortDef<any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
export function registreerBevestigSoort<P>(def: BevestigSoortDef<P>): void {
  if (!SOORT_RE.test(def.soort)) throw new Error(`BEVESTIGING_SOORT_ONGELDIG:${def.soort}`);
  REGISTER.set(def.soort, def as BevestigSoortDef<any>); // eslint-disable-line @typescript-eslint/no-explicit-any
}
export const bevestigSoort = (soort: string): BevestigSoortDef<any> | undefined => REGISTER.get(soort); // eslint-disable-line @typescript-eslint/no-explicit-any
export const geregistreerdeSoorten = (): string[] => [...REGISTER.keys()].sort();
const risicoVan = (def: BevestigSoortDef<any>, params: unknown): BevestigRisico => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = typeof def.risico === 'function' ? def.risico(params) : def.risico;
  return isBevestigRisico(r) ? r : 'kritiek';
};

// ------------------------------------------------------------------------------------------------ rij
type Rij = {
  id: string; user_id: string; ruimte: string; agent: string; klant: string; grant_id: string; soort: string; tool: string; risico: string;
  parameters: string; sleutel_naam: string; hash: string; status: string; aangemaakt_op: Date | string; verloopt_op: Date | string;
  besloten_op: Date | string | null; besloten_door: string; stap_op: string; resultaat: string | null; fout: string; opgehaald_op: Date | string | null;
};
const ms = (v: Date | string | null | undefined) => (v ? new Date(v as string).getTime() : 0);
const statusVan = (r: Rij): BevestigStatus => {
  const s = isBevestigStatus(r.status) ? r.status : 'mislukt';
  return s === 'wacht' && ms(r.verloopt_op) <= Date.now() ? 'verlopen' : s;
};
async function journaal(r: Pick<Rij, 'id' | 'user_id' | 'ruimte' | 'agent' | 'klant' | 'soort' | 'tool' | 'risico'>, actie: string, result: string, extra: Record<string, unknown> = {}) {
  try {
    await auditToevoegen({
      ownerId: r.user_id, actorId: r.user_id, action: `owner.ai.bevestiging.${actie}`, type: 'ai', result,
      details: { bevestigingId: r.id, soort: r.soort, tool: r.tool, ruimte: r.ruimte, risico: r.risico, ...(r.agent ? { agent: r.agent } : {}), ...(r.klant ? { client: r.klant } : {}), ...extra },
    });
  } catch { /* het journaal mag het verzoek niet breken */ }
}
async function lees(userId: string, id: string): Promise<Rij | null> {
  if (!ID_RE.test(id) || !userId) return null;
  const r = await sys().query(`SELECT * FROM ${TABEL} WHERE id = $1 AND user_id = $2`, [id, userId]);
  return (r.rows[0] as Rij | undefined) ?? null;
}
async function paramsVan(r: Rij): Promise<unknown> {
  const tekst = await ontzegel({ userId: r.user_id, ruimte: ruimteVan(r.ruimte) }, TABEL, r.parameters, aad(r.user_id, ruimteVan(r.ruimte), r.id, 'parameters'), r.sleutel_naam || serverSleutelNaam());
  return JSON.parse(tekst);
}
async function resultaatVan(r: Rij): Promise<{ resultaat?: unknown; uitkomst?: BevestigDetail[] } | null> {
  if (!r.resultaat) return null;
  const tekst = await ontzegel({ userId: r.user_id, ruimte: ruimteVan(r.ruimte) }, TABEL, r.resultaat, aad(r.user_id, ruimteVan(r.ruimte), r.id, 'resultaat'), r.sleutel_naam || serverSleutelNaam());
  return JSON.parse(tekst);
}
async function taalVan(userId: string): Promise<'uk' | 'nl'> {
  try {
    const { rows } = await sys().query(`SELECT data->>'language' AS taal FROM app.records WHERE tbl = 'owner_ui_preferences_v1' AND data->>'userId' = $1
      ORDER BY COALESCE((data->>'updatedAt')::numeric, 0) DESC LIMIT 1`, [userId]);
    return rows[0]?.taal === 'nl' ? 'nl' : 'uk';
  } catch { return 'uk'; }
}

/** Verlopen open verzoeken op 'verlopen' zetten (lui bij elk lezen, en door de opruimer). Geeft het aantal. */
export async function verloopOpen(userId?: string): Promise<number> {
  const r = await sys().query(`UPDATE ${TABEL} SET status = 'verlopen', besloten_op = now() WHERE status = 'wacht' AND verloopt_op <= now() ${userId ? 'AND user_id = $1' : ''}
    RETURNING id, user_id, ruimte, agent, klant, soort, tool, risico`, userId ? [userId] : []);
  for (const rij of r.rows as Rij[]) await journaal(rij, 'verlopen', 'expired');
  return r.rowCount ?? 0;
}

/**
 * Een TECHNISCH verzoek mag alleen in een technische lade lopen, of in de persoonlijke als de mens die dienst bewust «спільно» zette
 * (gedeeld). Geeft de poort de persoonlijke lade zonder «gedeeld», dan is de technische ruimte nu niet actief (rechten weg, geen
 * activering): weigeren, nooit stil in de persoonlijke lade uitvoeren.
 */
const ladePastBij = (ruimte: BevestigRuimte, b: { ok: true; lade: Lade; gedeeld: boolean }): boolean =>
  ruimte !== 'technisch' || b.lade.ruimte === 'technisch' || b.gedeeld;

// ------------------------------------------------------------------------------------------------ AANMAKEN (de agent)
export type VraagInvoer = {
  userId: string; ruimte: BevestigRuimte; soort: string; params: unknown;
  /** Hulpmiddel dat het verzoek maakte (interne naam). */
  tool?: string;
  /** Standaard uit de lopende MCP-aanroep (backend/mcp-namens.ts); meegeven alleen in tests of vanuit de chat. */
  agent?: string; klant?: string; grantId?: string;
};
export type VraagUitslag = { ok: true; id: string; hash: string; verlooptOp: number; risico: BevestigRisico; link: string } | { ok: false; fout: string };

export async function vraagBevestiging(inv: VraagInvoer): Promise<VraagUitslag> {
  const def = bevestigSoort(inv.soort);
  if (!def) return { ok: false, fout: 'BEVESTIGING_SOORT_ONBEKEND' };
  const ruimte = ruimteVan(inv.ruimte);
  if (!def.ruimtes.includes(ruimte)) return { ok: false, fout: 'BEVESTIGING_RUIMTE_NIET_TOEGESTAAN' };
  // Brama van de ruimte: de gegevenslade van de dienst moet open zijn (bevroren of «uit» in de technische ruimte = weigeren).
  const lade = await gegevensLade({ userId: inv.userId, aiRuimte: ruimte, dienst: def.dienst });
  if (!lade.ok) return { ok: false, fout: `RUIMTE_GESLOTEN_${lade.code}` };
  if (!ladePastBij(ruimte, lade)) return { ok: false, fout: 'RUIMTE_GESLOTEN_TECHNISCH' };
  const geldig = def.valideer(inv.params);
  if (!geldig.ok) return { ok: false, fout: code(geldig.fout) };
  const namens = huidigeNamens();
  const agent = kort(inv.agent ?? namens?.agent ?? '', 24).toLowerCase().replace(/[^a-z0-9-]/g, '');
  const klant = kort(inv.klant ?? namens?.client ?? '', 80);
  const grantId = kort(inv.grantId ?? namens?.grantId ?? '', 120);
  const tool = kort(inv.tool ?? '', 64).replace(/[^a-z0-9_]/g, '');
  await verloopOpen(inv.userId);
  const open = await sys().query(`SELECT count(*)::int AS n FROM ${TABEL} WHERE user_id = $1 AND status = 'wacht'`, [inv.userId]);
  if (Number(open.rows[0]?.n || 0) >= BEVESTIG_MAX_OPEN) return { ok: false, fout: 'BEVESTIGING_TE_VEEL_OPEN' };
  const id = randomUUID();
  const risico = risicoVan(def, geldig.params);
  const hash = parameterHash({ soort: def.soort, ruimte, userId: inv.userId, params: geldig.params });
  const sleutelNaam = serverSleutelNaam();
  let envelop: string;
  try { envelop = await verzegel({ userId: inv.userId, ruimte }, TABEL, JSON.stringify(geldig.params), aad(inv.userId, ruimte, id, 'parameters'), sleutelNaam); }
  catch (e) { return { ok: false, fout: isGeslotenFout(e) ? SLEUTEL_GESLOTEN_CODE : 'BEVESTIGING_SLEUTEL_ONTBREEKT' }; }
  const termijn = Math.max(60_000, Math.min(BEVESTIG_TERMIJN_MS, def.termijnMs ?? BEVESTIG_TERMIJN_MS));
  const r = await sys().query(`INSERT INTO ${TABEL} (id, user_id, ruimte, agent, klant, grant_id, soort, tool, risico, parameters, sleutel_naam, hash, verloopt_op)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() + make_interval(secs => $13)) RETURNING *`,
    [id, inv.userId, ruimte, agent, klant, grantId, def.soort, tool, risico, envelop, isServerEnvelop(envelop) ? sleutelNaam : '', hash, Math.round(termijn / 1000)]);
  const rij = r.rows[0] as Rij;
  await journaal(rij, 'gevraagd', 'pending');
  const link = bevestigLink(SERVICE_HOSTS.mcp, id, agent);
  // Melding in DE ruimte van het verzoek (backend/meldingen-ruimte.ts leest de lade van de lopende aanroep).
  const taal = await taalVan(inv.userId);
  const b = def.beschrijf(geldig.params);
  const wie = klant || agent || (taal === 'nl' ? 'Een AI' : 'ШІ');
  await metLade({ userId: inv.userId, ruimte }, 'ai', () => meld(inv.userId, 'ai_bevestiging',
    taal === 'nl' ? `${wie} vraagt uw bevestiging` : `${wie} просить вашого підтвердження`,
    `${b.titel[taal]}: ${b.samenvatting[taal]} ${taal === 'nl' ? 'Geldig 30 minuten; zonder uw klik gebeurt er niets.' : 'Діє 30 хвилин; без вашого кліку нічого не станеться.'}`, link)).catch(() => undefined);
  return { ok: true, id, hash, verlooptOp: ms(rij.verloopt_op), risico, link };
}

// ------------------------------------------------------------------------------------------------ STAND voor de agent
/** De stand voor de agent die het verzoek maakte: zelfde mens, zelfde ruimte, zelfde agent (als die bekend is). */
export async function bevestigingVoorAgent(userId: string, id: string, ruimte: BevestigRuimte, opties: { wachtMs?: number; agent?: string } = {}): Promise<AgentUitslag | { fout: string }> {
  const eind = Date.now() + Math.max(0, Math.min(BEVESTIG_WACHT_MS + 5000, opties.wachtMs ?? 0));
  const agent = kort(opties.agent ?? huidigeNamens()?.agent ?? '', 24);
  for (;;) {
    const r = await lees(userId, id);
    if (!r) return { fout: 'BEVESTIGING_ONBEKEND' };
    if (ruimteVan(r.ruimte) !== ruimteVan(ruimte)) return { fout: 'BEVESTIGING_ANDERE_RUIMTE' };
    if (r.agent && agent && r.agent !== agent) return { fout: 'BEVESTIGING_ANDERE_AGENT' };
    const status = statusVan(r);
    if (status === 'verlopen' && r.status === 'wacht') await verloopOpen(userId);
    if (isEindStatus(status) || Date.now() >= eind) {
      const uit: AgentUitslag = { status, bevestiging_id: r.id, verloopt_op: new Date(ms(r.verloopt_op)).toISOString(), next: volgendeStap(status) };
      if (status === 'mislukt' && r.fout) uit.fout = r.fout;
      if (status === 'uitgevoerd' || status === 'mislukt') {
        try { const res = await resultaatVan(r); if (res && res.resultaat !== undefined) uit.resultaat = res.resultaat; }
        catch (e) { uit.fout = isGeslotenFout(e) ? SLEUTEL_GESLOTEN_CODE : 'BEVESTIGING_RESULTAAT_ONLEESBAAR'; }
        if (!r.opgehaald_op) await sys().query(`UPDATE ${TABEL} SET opgehaald_op = now() WHERE id = $1 AND user_id = $2`, [r.id, userId]).catch(() => undefined);
      }
      return uit;
    }
    await new Promise((res) => setTimeout(res, 400));
  }
}

/** Aanmaken en dan wachten op het besluit (tot `wachtMs`, standaard ~50 s). Het gewone pad voor een hulpmiddel. */
export async function vraagEnWacht(inv: VraagInvoer & { wachtMs?: number }): Promise<AgentUitslag | { fout: string }> {
  const v = await vraagBevestiging(inv);
  if (!v.ok) return { fout: v.fout };
  return bevestigingVoorAgent(inv.userId, v.id, inv.ruimte, { wachtMs: inv.wachtMs ?? BEVESTIG_WACHT_MS, agent: inv.agent });
}

/** Tool-resultaat (MCP) voor de agent: JSON met de stand; een fout of weigering als isError met de uitleg in beide talen. */
export function agentTekst(uit: AgentUitslag | { fout: string }): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  if ('fout' in uit && !('status' in uit)) {
    const c = uit.fout;
    return { content: [{ type: 'text', text: `${c}: ${foutUitleg(c, 'uk')} / ${foutUitleg(c, 'nl')} Do not try another way; tell the user.` }], isError: true };
  }
  const u = uit as AgentUitslag;
  const fouteStand = u.status === 'geweigerd' || u.status === 'verlopen' || u.status === 'mislukt' || u.status === 'ingetrokken';
  return { content: [{ type: 'text', text: JSON.stringify(u) }], ...(fouteStand ? { isError: true } : {}) };
}

// ------------------------------------------------------------------------------------------------ voor de MENS (routes)
async function weergave(r: Rij): Promise<BevestigingWeergave> {
  const def = bevestigSoort(r.soort);
  const status = statusVan(r);
  let beschrijving: BevestigBeschrijving | null = null;
  let gesloten = false;
  let uitkomst: BevestigDetail[] = [];
  try {
    const params = await paramsVan(r);
    beschrijving = def ? def.beschrijf(params) : null;
  } catch (e) { gesloten = isGeslotenFout(e); }
  if (status === 'uitgevoerd' || status === 'mislukt') {
    try { uitkomst = (await resultaatVan(r))?.uitkomst ?? []; } catch { uitkomst = []; }
  }
  const risico = isBevestigRisico(r.risico) ? r.risico : 'kritiek';
  return {
    id: r.id, soort: r.soort, tool: r.tool, agent: r.agent, klant: r.klant, ruimte: ruimteVan(r.ruimte), risico, stapOp: stapOpNodig(risico),
    status, aangemaaktOp: ms(r.aangemaakt_op), verlooptOp: ms(r.verloopt_op), beslotenOp: r.besloten_op ? ms(r.besloten_op) : null,
    hash: r.hash, beschrijving, gesloten, fout: r.fout || '', uitkomst,
  };
}

/** De verzoeken van deze mens in DEZE ruimte (de ruimte van het tabblad, live berekend door de route). Nieuwste eerst. */
export async function lijstVoorMens(userId: string, ruimte: BevestigRuimte, opties: { agent?: string; ookAfgerond?: boolean } = {}): Promise<BevestigingWeergave[]> {
  await verloopOpen(userId);
  const agent = opties.agent && /^[a-z0-9-]{1,24}$/.test(opties.agent) ? opties.agent : '';
  const r = await sys().query(`SELECT * FROM ${TABEL} WHERE user_id = $1 AND ruimte = $2 ${agent ? 'AND agent = $3' : ''}
      AND (status IN ('wacht', 'bezig') ${opties.ookAfgerond ? "OR aangemaakt_op > now() - interval '24 hours'" : ''})
    ORDER BY aangemaakt_op DESC LIMIT 60`, agent ? [userId, ruimteVan(ruimte), agent] : [userId, ruimteVan(ruimte)]);
  return Promise.all((r.rows as Rij[]).map(weergave));
}
/**
 * Kop van één verzoek van DEZE mens (voor een route die bij een verzoek iets voorbereidt, bv. de fotokiezer openen): soort, stand,
 * ruimte en — als de sleutel open is — de parameters. null = bestaat niet of is niet van deze mens.
 */
export async function bevestigingKop(userId: string, id: string): Promise<({ id: string; soort: string; status: BevestigStatus; ruimte: BevestigRuimte; agent: string } & Record<string, unknown>) | null> {
  const r = await lees(userId, id);
  if (!r) return null;
  let params: Record<string, unknown> = {};
  try { const p = await paramsVan(r); if (p && typeof p === 'object') params = p as Record<string, unknown>; } catch { params = {}; }
  return { ...params, id: r.id, soort: r.soort, status: statusVan(r), ruimte: ruimteVan(r.ruimte), agent: r.agent };
}

/** Hoeveel verzoeken in deze ruimte op een besluit wachten (badge). */
export async function aantalOpen(userId: string, ruimte: BevestigRuimte): Promise<number> {
  const r = await sys().query(`SELECT count(*)::int AS n FROM ${TABEL} WHERE user_id = $1 AND ruimte = $2 AND status = 'wacht' AND verloopt_op > now()`, [userId, ruimteVan(ruimte)]);
  return Number(r.rows[0]?.n || 0);
}

export type BevestigInvoer = {
  userId: string; id: string;
  /** De ruimte van het tabblad NU (de route rekent haar uit met gegevensRuimteVeilig; nooit uit de body). */
  ruimte: BevestigRuimte;
  /** De hash die het scherm toonde. */
  hash: string;
  /** Verse sterke bevestiging (passkey/TOTP/herstelcode) van deze sessie — de route kijkt dat na en verbruikt hem daarna. */
  stapOp: boolean;
  /** De eigen keuze van de mens bij dit verzoek (per soort gecontroleerd). */
  keuze?: Record<string, unknown>;
  /** Doorgegeven aan voerUit (bv. voor «alleen met passkey»): tabblad en step-up-methode van de bevestigende sessie. */
  bevestiger?: { tabContext?: string; stapOpMethode?: string };
};

/** «Підтвердити». Gooit BevestigFout(code, status) bij elke weigering (en schrijft die in het journaal). */
export async function bevestig(inv: BevestigInvoer): Promise<BevestigingWeergave> {
  const r = await lees(inv.userId, inv.id);
  if (!r) fout('BEVESTIGING_ONBEKEND', 404);
  const rij = r as Rij;
  const ruimte = ruimteVan(rij.ruimte);
  const weiger = async (c: string, status: number): Promise<never> => { await journaal(rij, 'poging-geweigerd', 'denied', { reden: c }); return fout(c, status); };
  if (ruimteVan(inv.ruimte) !== ruimte) await weiger('BEVESTIGING_ANDERE_RUIMTE', 403);
  const status = statusVan(rij);
  if (status === 'verlopen') { await verloopOpen(inv.userId); await weiger('BEVESTIGING_VERLOPEN', 409); }
  if (status !== 'wacht') await weiger('BEVESTIGING_NIET_OPEN', 409);
  const def = bevestigSoort(rij.soort);
  if (!def) await weiger('BEVESTIGING_SOORT_ONBEKEND', 409);
  // De hash: wat het scherm toonde = wat bewaard is = wat de parameters nu werkelijk zijn.
  if (!HASH_RE.test(String(inv.hash || '')) || !gelijk(String(inv.hash), rij.hash)) await weiger('BEVESTIGING_PARAMETERS_GEWIJZIGD', 409);
  let params: unknown;
  try { params = await paramsVan(rij); }
  catch (e) { if (isGeslotenFout(e)) await weiger(SLEUTEL_GESLOTEN_CODE, 423); await weiger('BEVESTIGING_PARAMETERS_GEWIJZIGD', 409); }
  if (!gelijk(parameterHash({ soort: rij.soort, ruimte, userId: inv.userId, params }), rij.hash)) await weiger('BEVESTIGING_PARAMETERS_GEWIJZIGD', 409);
  // Het risico kan alleen stijgen: opnieuw uit de parameters, en nooit lager dan wat bij het aanmaken gold.
  const risico = hoogste(isBevestigRisico(rij.risico) ? rij.risico : 'kritiek', risicoVan(def!, params));
  if (stapOpNodig(risico) && !inv.stapOp) await weiger('STEP_UP_STRONG_REQUIRED', 403);
  const keuze = inv.keuze && typeof inv.keuze === 'object' && !Array.isArray(inv.keuze) ? inv.keuze : {};
  const keuzeFout = def!.valideerKeuze ? def!.valideerKeuze(keuze, params) : null;
  if (keuzeFout) await weiger(code(keuzeFout), 400);
  const lade = await gegevensLade({ userId: inv.userId, aiRuimte: ruimte, dienst: def!.dienst });
  if (!lade.ok) await weiger(`RUIMTE_GESLOTEN_${lade.code}`, 403);
  if (lade.ok && !ladePastBij(ruimte, lade)) await weiger('RUIMTE_GESLOTEN_TECHNISCH', 403);
  // Atomair: alleen wie de rij van 'wacht' naar 'bezig' krijgt, voert uit (twee klikken = één uitvoering).
  const methode = stapOpNodig(risico) ? (/^[a-z-]{1,20}$/.test(String(inv.bevestiger?.stapOpMethode || '')) ? String(inv.bevestiger?.stapOpMethode) : 'sterk') : '';
  const claim = await sys().query(`UPDATE ${TABEL} SET status = 'bezig', besloten_op = now(), besloten_door = $3, stap_op = $4
    WHERE id = $1 AND user_id = $2 AND status = 'wacht' AND verloopt_op > now() AND hash = $5 RETURNING *`,
    [rij.id, inv.userId, inv.userId, methode, rij.hash]);
  if (!claim.rowCount) await weiger('BEVESTIGING_NIET_OPEN', 409);
  await journaal(rij, 'bevestigd', 'success', { stapOp: methode || 'geen' });
  let uitslag: UitvoerUitslag;
  const ladeOk = (lade as { ok: true; lade: Lade }).lade;
  try {
    uitslag = await metLade(ladeOk, def!.dienst, () => def!.voerUit({
      userId: inv.userId, ruimte, lade: ladeOk, params, keuze,
      aanvraag: { id: rij.id, agent: rij.agent, klant: rij.klant, grantId: rij.grant_id, tool: rij.tool, soort: rij.soort },
      ...(inv.bevestiger ? { bevestiger: { ...(inv.bevestiger.tabContext ? { tabContext: String(inv.bevestiger.tabContext).slice(0, 120) } : {}), ...(inv.bevestiger.stapOpMethode ? { stapOpMethode: String(inv.bevestiger.stapOpMethode).slice(0, 20) } : {}) } } : {}),
    }));
  } catch (e) { uitslag = { ok: false, fout: code((e as Error)?.message) }; }
  const opslag = uitslag.ok ? { resultaat: uitslag.resultaat, uitkomst: uitslag.uitkomst ?? [] } : { resultaat: uitslag.resultaat, uitkomst: [] };
  let resEnvelop: string | null = null;
  try { resEnvelop = await verzegel({ userId: inv.userId, ruimte }, TABEL, JSON.stringify(opslag), aad(inv.userId, ruimte, rij.id, 'resultaat'), rij.sleutel_naam || serverSleutelNaam()); }
  catch { resEnvelop = null; }
  await sys().query(`UPDATE ${TABEL} SET status = $3, resultaat = $4, fout = $5 WHERE id = $1 AND user_id = $2 AND status = 'bezig'`,
    [rij.id, inv.userId, uitslag.ok ? 'uitgevoerd' : 'mislukt', resEnvelop, uitslag.ok ? '' : code(uitslag.fout)]);
  await journaal(rij, uitslag.ok ? 'uitgevoerd' : 'mislukt', uitslag.ok ? 'success' : 'failure', uitslag.ok ? {} : { fout: code(uitslag.fout) });
  return weergave((await lees(inv.userId, rij.id)) as Rij);
}

/** «Відхилити»: zelfde mens, zelfde ruimte, nog open. */
export async function weiger(inv: { userId: string; id: string; ruimte: BevestigRuimte }): Promise<BevestigingWeergave> {
  const r = await lees(inv.userId, inv.id);
  if (!r) fout('BEVESTIGING_ONBEKEND', 404);
  const rij = r as Rij;
  if (ruimteVan(inv.ruimte) !== ruimteVan(rij.ruimte)) { await journaal(rij, 'poging-geweigerd', 'denied', { reden: 'BEVESTIGING_ANDERE_RUIMTE' }); fout('BEVESTIGING_ANDERE_RUIMTE', 403); }
  const u = await sys().query(`UPDATE ${TABEL} SET status = 'geweigerd', besloten_op = now(), besloten_door = $3 WHERE id = $1 AND user_id = $2 AND status = 'wacht' AND verloopt_op > now() RETURNING id`,
    [rij.id, inv.userId, inv.userId]);
  if (!u.rowCount) { await verloopOpen(inv.userId); fout(statusVan(rij) === 'verlopen' ? 'BEVESTIGING_VERLOPEN' : 'BEVESTIGING_NIET_OPEN', 409); }
  await journaal(rij, 'geweigerd', 'rejected');
  return weergave((await lees(inv.userId, rij.id)) as Rij);
}

/** Alles van één mens intrekken (bv. bij «Стоп» voor alle AI): open verzoeken → 'ingetrokken'. */
export async function trekAllesIn(userId: string): Promise<number> {
  const r = await sys().query(`UPDATE ${TABEL} SET status = 'ingetrokken', besloten_op = now() WHERE user_id = $1 AND status = 'wacht' RETURNING id, user_id, ruimte, agent, klant, soort, tool, risico`, [userId]);
  for (const rij of r.rows as Rij[]) await journaal(rij, 'ingetrokken', 'revoked');
  return r.rowCount ?? 0;
}
// SEC-002 ai-mcp-12: trekAllesIn bestond «voor Стоп» maar werd nergens aangeroepen — een verzoek dat een AI vlak vóór de noodstop
// had klaargezet (mail versturen, delen, agenda) bleef 30 minuten in «Підтвердження на сайті» staan en kon daarna nog worden
// bevestigd. Nu meldt deze module zich aan bij de noodstop (en bij het blokkeren van een gebruiker, dat dezelfde haak afloopt).
bijNoodstop((userId) => { void trekAllesIn(userId).catch((err) => console.error('[ai-bevestiging] intrekken bij noodstop mislukt:', (err as Error).message)); });

/** Een menselijke tekst bij een foutcode (voor routes en het scherm). */
export const bevestigFoutTekst = (c: string): Tweetalig => ({ uk: foutUitleg(c, 'uk'), nl: foutUitleg(c, 'nl') });

// Sleutelkluis (0092): open verzoeken van déze lade onder de DEK zetten («перешифрувати зараз»). Afgeronde rijen laten we staan.
registreerHerversleutelaar(TABEL, async (lade, dek) => {
  const r = await sys().query(`SELECT id, parameters, sleutel_naam FROM ${TABEL} WHERE user_id = $1 AND ruimte = $2 AND status = 'wacht'`, [lade.userId, ruimteVan(lade.ruimte)]);
  let gevonden = 0, herversleuteld = 0;
  for (const rij of r.rows as Array<{ id: string; parameters: string; sleutel_naam: string }>) {
    if (!isServerEnvelop(rij.parameters)) continue;
    gevonden++;
    try {
      const nieuw = herversleutelEnvelop(dek, rij.parameters, aad(lade.userId, ruimteVan(lade.ruimte), rij.id, 'parameters'), rij.sleutel_naam || serverSleutelNaam());
      await sys().query(`UPDATE ${TABEL} SET parameters = $3 WHERE id = $1 AND user_id = $2 AND status = 'wacht'`, [rij.id, lade.userId, nieuw]);
      herversleuteld++;
    } catch { /* blijft v1 */ }
  }
  return { gevonden, herversleuteld };
});
