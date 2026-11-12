// Serverroutes en opslag voor het open AI-ecosysteem van Mijn Ruimte (ai.* en mcp.*, 11.11.2026).
//
// Elke lees- en schrijfactie loopt onder `alsGebruiker(lade.userId, ...)` (RLS op user_id = app.huidige_gebruiker())
// én draagt `WHERE user_id = $1 AND ruimte = $2`. De ruimte ('prive' | 'technisch') wordt live uit de sessie/tabContext
// of uit de MCP-aanroepcontext bepaald — nooit blind uit invoer van een model of browser.
import { error, json, rateLimit } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import type { RouterMiddleware } from '../server/platform/router';
import { alsGebruiker } from './ai-toestemmingen';
import { GEEN_RECHT, heeftApiRecht, weigerCode } from './api-recht';
import { huidigeNamens, huidigeRuimte } from './mcp-namens';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import type { Lade } from '../shared/ruimte-scheiding';
import type { AiRuimte } from '../shared/ai-ruimte';
import { AI_AANBIEDERS } from '../shared/ai-aanbieders';
import { V2_AGENTEN } from '../shared/connector-v2/agenten';
import {
  bouwZelfHostPakket,
  normaliseerBronnen,
  normaliseerOmgevingen,
  rijNaarContext,
  rijNaarOverdracht,
  rijNaarUitbreiding,
  rijNaarWerkruimte,
  schoonAgentLijst,
  schoonContextSleutel,
  schoonKoppelingen,
  schoonModelLijst,
  schoonUitbreidingSlug,
  STANDAARD_WERKRUIMTE_SJABLONEN,
  type AiAgentOverdracht,
  type AiAgentWerkruimte,
  type AiGedeeldeContextItem,
  type AiRuimteUitbreiding,
  type OverdrachtStatus,
  type UitbreidingSoort,
} from '../shared/ai-ecosysteem';

const DIENSTEN = ['ai', 'mcp', 'api', 'hub'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ecosysteemLade(userId: string, body: unknown): Promise<Lade> {
  const namens = huidigeNamens();
  if (namens) {
    return { userId, ruimte: huidigeRuimte() };
  }
  const tab = body && typeof body === 'object' ? String((body as Record<string, unknown>).tabContext ?? '') : '';
  try {
    return { userId, ruimte: await gegevensRuimteVeilig(userId, { tabContext: tab }) };
  } catch {
    return { userId, ruimte: 'prive' };
  }
}

export interface EcosysteemOpslag {
  overzicht(lade: Lade): Promise<{
    werkruimtes: AiAgentWerkruimte[];
    contextItems: AiGedeeldeContextItem[];
    overdrachten: AiAgentOverdracht[];
    uitbreidingen: AiRuimteUitbreiding[];
  }>;
  contextLijst(lade: Lade, filter?: { sleutel?: string; werkruimteId?: string; zoek?: string; limiet?: number }): Promise<AiGedeeldeContextItem[]>;
  werkruimteVoorChat(lade: Lade, werkruimteId: string): Promise<AiAgentWerkruimte | null>;
  contextVoorSleutels(lade: Lade, sleutels: readonly string[]): Promise<AiGedeeldeContextItem[]>;
  werkruimteOpslaan(lade: Lade, invoer: Record<string, unknown>): Promise<{ ok: true; werkruimte: AiAgentWerkruimte } | { ok: false; code: string }>;
  werkruimteVerwijderen(lade: Lade, id: string): Promise<boolean>;
  contextOpslaan(lade: Lade, invoer: Record<string, unknown>, bronAgent?: string): Promise<{ ok: true; item: AiGedeeldeContextItem } | { ok: false; code: string }>;
  contextVerwijderen(lade: Lade, sleutel: string): Promise<boolean>;
  overdrachtAanmaken(lade: Lade, invoer: Record<string, unknown>, bronAgent?: string): Promise<{ ok: true; overdracht: AiAgentOverdracht } | { ok: false; code: string }>;
  overdrachtBijwerken(lade: Lade, invoer: Record<string, unknown>): Promise<{ ok: true; overdracht: AiAgentOverdracht } | { ok: false; code: string }>;
  uitbreidingOpslaan(lade: Lade, invoer: Record<string, unknown>, bronAgent?: string): Promise<{ ok: true; uitbreiding: AiRuimteUitbreiding } | { ok: false; code: string }>;
  uitbreidingVerwijderen(lade: Lade, slug: string): Promise<boolean>;
}

const WK_KOL = `id, ruimte, naam, beschrijving, agenten, modellen, omgevingen, bronnen, actief, (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt`;
const CTX_KOL = `id, ruimte, werkruimte_id, sleutel, titel, inhoud, bron_dienst, bron_agent, koppelingen, (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt`;
const OVD_KOL = `id, ruimte, werkruimte_id, van_agent, naar_agent, doel_dienst, opdracht, context_sleutels, status, resultaat, (extract(epoch FROM aangemaakt_op) * 1000)::bigint AS aangemaakt, (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt`;
const UIT_KOL = `id, ruimte, slug, naam, beschrijving, soort, doel_diensten, omgevingen, config, gemaakt_door_agent, actief, (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt`;

export const pgEcosysteemOpslag: EcosysteemOpslag = {
  async overzicht(lade) {
    return alsGebruiker(lade.userId, async (q) => {
      const [wk, ctx, ovd, uit] = await Promise.all([
        q(`SELECT ${WK_KOL} FROM app.ai_agent_werkruimtes WHERE user_id = $1 AND ruimte = $2 ORDER BY bijgewerkt_op DESC LIMIT 40`, [lade.userId, lade.ruimte]),
        q(`SELECT ${CTX_KOL} FROM app.ai_gedeelde_context WHERE user_id = $1 AND ruimte = $2 ORDER BY bijgewerkt_op DESC LIMIT 60`, [lade.userId, lade.ruimte]),
        q(`SELECT ${OVD_KOL} FROM app.ai_agent_overdrachten WHERE user_id = $1 AND ruimte = $2 ORDER BY bijgewerkt_op DESC LIMIT 40`, [lade.userId, lade.ruimte]),
        q(`SELECT ${UIT_KOL} FROM app.ai_ruimte_uitbreidingen WHERE user_id = $1 AND ruimte = $2 ORDER BY bijgewerkt_op DESC LIMIT 40`, [lade.userId, lade.ruimte]),
      ]);
      return {
        werkruimtes: wk.rows.map(rijNaarWerkruimte),
        contextItems: ctx.rows.map(rijNaarContext),
        overdrachten: ovd.rows.map(rijNaarOverdracht),
        uitbreidingen: uit.rows.map(rijNaarUitbreiding),
      };
    });
  },

  async contextLijst(lade, filter = {}) {
    const limiet = Math.max(1, Math.min(50, Math.trunc(Number(filter.limiet) || 25)));
    return alsGebruiker(lade.userId, async (q) => {
      if (filter.sleutel) {
        const s = schoonContextSleutel(filter.sleutel);
        if (!s) return [];
        const r = await q(`SELECT ${CTX_KOL} FROM app.ai_gedeelde_context WHERE user_id = $1 AND ruimte = $2 AND sleutel = $3`, [lade.userId, lade.ruimte, s]);
        return r.rows.map(rijNaarContext);
      }
      if (filter.werkruimteId && UUID_RE.test(filter.werkruimteId)) {
        const r = await q(
          `SELECT ${CTX_KOL} FROM app.ai_gedeelde_context WHERE user_id = $1 AND ruimte = $2 AND werkruimte_id = $3::uuid ORDER BY bijgewerkt_op DESC LIMIT $4`,
          [lade.userId, lade.ruimte, filter.werkruimteId, limiet],
        );
        return r.rows.map(rijNaarContext);
      }
      if (filter.zoek && filter.zoek.trim()) {
        const patroon = `%${filter.zoek.trim().slice(0, 80)}%`;
        const r = await q(
          `SELECT ${CTX_KOL} FROM app.ai_gedeelde_context WHERE user_id = $1 AND ruimte = $2 AND (titel ILIKE $3 OR sleutel ILIKE $3 OR inhoud ILIKE $3) ORDER BY bijgewerkt_op DESC LIMIT $4`,
          [lade.userId, lade.ruimte, patroon, limiet],
        );
        return r.rows.map(rijNaarContext);
      }
      const r = await q(`SELECT ${CTX_KOL} FROM app.ai_gedeelde_context WHERE user_id = $1 AND ruimte = $2 ORDER BY bijgewerkt_op DESC LIMIT $3`, [lade.userId, lade.ruimte, limiet]);
      return r.rows.map(rijNaarContext);
    });
  },

  async werkruimteVoorChat(lade, werkruimteId) {
    if (!UUID_RE.test(werkruimteId)) return null;
    return alsGebruiker(lade.userId, async (q) => {
      const r = (await q(`SELECT ${WK_KOL} FROM app.ai_agent_werkruimtes WHERE user_id = $1 AND ruimte = $2 AND id = $3::uuid AND actief = true`, [lade.userId, lade.ruimte, werkruimteId])).rows[0];
      return r ? rijNaarWerkruimte(r) : null;
    });
  },

  async contextVoorSleutels(lade, sleutels) {
    const schone = sleutels.map((s) => schoonContextSleutel(s)).filter(Boolean).slice(0, 12);
    if (!schone.length) return [];
    return alsGebruiker(lade.userId, async (q) => {
      const r = await q(
        `SELECT ${CTX_KOL} FROM app.ai_gedeelde_context WHERE user_id = $1 AND ruimte = $2 AND sleutel = ANY($3::text[]) ORDER BY bijgewerkt_op DESC`,
        [lade.userId, lade.ruimte, schone],
      );
      return r.rows.map(rijNaarContext);
    });
  },

  async werkruimteOpslaan(lade, invoer) {
    const naam = String(invoer.naam ?? '').trim().slice(0, 120);
    if (!naam) return { ok: false, code: 'ECOSYSTEEM_NAAM_VERPLICHT' };
    const beschrijving = String(invoer.beschrijving ?? '').trim().slice(0, 1000);
    const agenten = schoonAgentLijst(invoer.agenten);
    const modellen = schoonModelLijst(invoer.modellen);
    const omgevingen = normaliseerOmgevingen(invoer.omgevingen, lade.ruimte as AiRuimte);
    const bronnen = normaliseerBronnen(invoer.bronnen, lade.ruimte as AiRuimte);
    const actief = invoer.actief !== false;
    const id = typeof invoer.id === 'string' && UUID_RE.test(invoer.id) ? invoer.id : '';

    return alsGebruiker(lade.userId, async (q) => {
      if (id) {
        const r = (await q(
          `UPDATE app.ai_agent_werkruimtes
              SET naam = $4, beschrijving = $5, agenten = $6::text[], modellen = $7::text[], omgevingen = $8::jsonb, bronnen = $9::jsonb, actief = $10, bijgewerkt_op = now()
            WHERE user_id = $1 AND ruimte = $2 AND id = $3::uuid
            RETURNING ${WK_KOL}`,
          [lade.userId, lade.ruimte, id, naam, beschrijving, agenten, modellen, JSON.stringify(omgevingen), JSON.stringify(bronnen), actief],
        )).rows[0];
        if (!r) return { ok: false, code: 'ECOSYSTEEM_NIET_GEVONDEN' };
        return { ok: true, werkruimte: rijNaarWerkruimte(r) };
      }
      const aantal = Number((await q(`SELECT count(*)::int AS n FROM app.ai_agent_werkruimtes WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte])).rows[0]?.n || 0);
      if (aantal >= 24) return { ok: false, code: 'ECOSYSTEEM_LIMIET_BEREIKT' };
      const r = (await q(
        `INSERT INTO app.ai_agent_werkruimtes (user_id, ruimte, naam, beschrijving, agenten, modellen, omgevingen, bronnen, actief)
         VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7::jsonb, $8::jsonb, $9)
         RETURNING ${WK_KOL}`,
        [lade.userId, lade.ruimte, naam, beschrijving, agenten, modellen, JSON.stringify(omgevingen), JSON.stringify(bronnen), actief],
      )).rows[0];
      return { ok: true, werkruimte: rijNaarWerkruimte(r) };
    });
  },

  async werkruimteVerwijderen(lade, id) {
    if (!UUID_RE.test(id)) return false;
    return alsGebruiker(lade.userId, async (q) => ((await q(`DELETE FROM app.ai_agent_werkruimtes WHERE user_id = $1 AND ruimte = $2 AND id = $3::uuid`, [lade.userId, lade.ruimte, id])).rowCount || 0) > 0);
  },

  async contextOpslaan(lade, invoer, bronAgent = '') {
    const sleutel = schoonContextSleutel(invoer.sleutel || invoer.titel);
    const titel = String(invoer.titel ?? '').trim().slice(0, 160);
    const inhoud = String(invoer.inhoud ?? '').trim().slice(0, 16000);
    if (!sleutel || !titel || !inhoud) return { ok: false, code: 'ECOSYSTEEM_CONTEXT_ONGELDIG' };
    const bronDienst = String(invoer.bronDienst ?? 'ai').trim().slice(0, 40) || 'ai';
    const agent = (bronAgent || String(invoer.bronAgent ?? '')).trim().slice(0, 40);
    const koppelingen = schoonKoppelingen(invoer.koppelingen);
    const wkId = typeof invoer.werkruimteId === 'string' && UUID_RE.test(invoer.werkruimteId) ? invoer.werkruimteId : null;

    return alsGebruiker(lade.userId, async (q) => {
      let geldigeWk: string | null = null;
      if (wkId) {
        const bestaat = (await q(`SELECT id FROM app.ai_agent_werkruimtes WHERE user_id = $1 AND ruimte = $2 AND id = $3::uuid`, [lade.userId, lade.ruimte, wkId])).rows[0];
        geldigeWk = bestaat ? wkId : null;
      }
      const r = (await q(
        `INSERT INTO app.ai_gedeelde_context (user_id, ruimte, werkruimte_id, sleutel, titel, inhoud, bron_dienst, bron_agent, koppelingen)
         VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (user_id, ruimte, sleutel) DO UPDATE
           SET werkruimte_id = EXCLUDED.werkruimte_id,
               titel = EXCLUDED.titel,
               inhoud = EXCLUDED.inhoud,
               bron_dienst = EXCLUDED.bron_dienst,
               bron_agent = EXCLUDED.bron_agent,
               koppelingen = EXCLUDED.koppelingen,
               bijgewerkt_op = now()
         WHERE app.ai_gedeelde_context.user_id = $1 AND app.ai_gedeelde_context.ruimte = $2
         RETURNING ${CTX_KOL}`,
        [lade.userId, lade.ruimte, geldigeWk, sleutel, titel, inhoud, bronDienst, agent, JSON.stringify(koppelingen)],
      )).rows[0];
      return { ok: true, item: rijNaarContext(r) };
    });
  },

  async contextVerwijderen(lade, sleutel) {
    const s = schoonContextSleutel(sleutel);
    if (!s) return false;
    return alsGebruiker(lade.userId, async (q) => ((await q(`DELETE FROM app.ai_gedeelde_context WHERE user_id = $1 AND ruimte = $2 AND sleutel = $3`, [lade.userId, lade.ruimte, s])).rowCount || 0) > 0);
  },

  async overdrachtAanmaken(lade, invoer, bronAgent = '') {
    const vanAgent = (bronAgent || String(invoer.vanAgent ?? 'gebruiker')).trim().slice(0, 40) || 'gebruiker';
    const naarAgent = String(invoer.naarAgent ?? '').trim().toLowerCase().slice(0, 40);
    const opdracht = String(invoer.opdracht ?? '').trim().slice(0, 8000);
    if (!naarAgent || !opdracht) return { ok: false, code: 'ECOSYSTEEM_OVERDRACHT_ONGELDIG' };
    const doelDienst = String(invoer.doelDienst ?? 'ai').trim().slice(0, 40) || 'ai';
    const contextSleutels = Array.isArray(invoer.contextSleutels)
      ? invoer.contextSleutels.map((s) => schoonContextSleutel(s)).filter(Boolean).slice(0, 20)
      : [];
    const wkId = typeof invoer.werkruimteId === 'string' && UUID_RE.test(invoer.werkruimteId) ? invoer.werkruimteId : null;

    return alsGebruiker(lade.userId, async (q) => {
      let geldigeWk: string | null = null;
      if (wkId) {
        const bestaat = (await q(`SELECT id FROM app.ai_agent_werkruimtes WHERE user_id = $1 AND ruimte = $2 AND id = $3::uuid`, [lade.userId, lade.ruimte, wkId])).rows[0];
        geldigeWk = bestaat ? wkId : null;
      }
      const r = (await q(
        `INSERT INTO app.ai_agent_overdrachten (user_id, ruimte, werkruimte_id, van_agent, naar_agent, doel_dienst, opdracht, context_sleutels, status)
         VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8::text[], 'open')
         RETURNING ${OVD_KOL}`,
        [lade.userId, lade.ruimte, geldigeWk, vanAgent, naarAgent, doelDienst, opdracht, contextSleutels],
      )).rows[0];
      return { ok: true, overdracht: rijNaarOverdracht(r) };
    });
  },

  async overdrachtBijwerken(lade, invoer) {
    const id = typeof invoer.id === 'string' && UUID_RE.test(invoer.id) ? invoer.id : '';
    const st = String(invoer.status ?? '');
    const status: OverdrachtStatus | null = st === 'open' || st === 'bezig' || st === 'voltooid' || st === 'geannuleerd' ? st : null;
    if (!id || !status) return { ok: false, code: 'ECOSYSTEEM_OVERDRACHT_ONGELDIG' };
    const resultaat = String(invoer.resultaat ?? '').trim().slice(0, 8000);

    return alsGebruiker(lade.userId, async (q) => {
      const r = (await q(
        `UPDATE app.ai_agent_overdrachten
            SET status = $4, resultaat = CASE WHEN $5 = '' THEN resultaat ELSE $5 END, bijgewerkt_op = now()
          WHERE user_id = $1 AND ruimte = $2 AND id = $3::uuid
          RETURNING ${OVD_KOL}`,
        [lade.userId, lade.ruimte, id, status, resultaat],
      )).rows[0];
      if (!r) return { ok: false, code: 'ECOSYSTEEM_NIET_GEVONDEN' };
      return { ok: true, overdracht: rijNaarOverdracht(r) };
    });
  },

  async uitbreidingOpslaan(lade, invoer, bronAgent = '') {
    const naam = String(invoer.naam ?? '').trim().slice(0, 120);
    const slug = schoonUitbreidingSlug(invoer.slug || naam);
    if (!naam || !slug) return { ok: false, code: 'ECOSYSTEEM_UITBREIDING_ONGELDIG' };
    const beschrijving = String(invoer.beschrijving ?? '').trim().slice(0, 1500);
    const srt = String(invoer.soort ?? 'systeem_brug');
    const soort: UitbreidingSoort = srt === 'werkstroom' || srt === 'paneel_actie' ? srt : 'systeem_brug';
    const doelDiensten = Array.isArray(invoer.doelDiensten)
      ? invoer.doelDiensten.map((d) => String(d ?? '').trim().slice(0, 32)).filter(Boolean).slice(0, 16)
      : ['ai'];
    const omgevingen = Array.isArray(invoer.omgevingen)
      ? invoer.omgevingen.map(String).filter((x) => x === 'pc' || x === 'browser' || (x === 'server' && lade.ruimte === 'technisch'))
      : ['browser'];
    const cfgRaw = invoer.config && typeof invoer.config === 'object' ? (invoer.config as Record<string, unknown>) : {};
    const config = {
      ...(cfgRaw.startVraag ? { startVraag: String(cfgRaw.startVraag).trim().slice(0, 2000) } : {}),
      ...(cfgRaw.eindpunt ? { eindpunt: String(cfgRaw.eindpunt).trim().slice(0, 300) } : {}),
      ...(cfgRaw.instructie ? { instructie: String(cfgRaw.instructie).trim().slice(0, 4000) } : {}),
      ...(Array.isArray(cfgRaw.contextSleutels)
        ? { contextSleutels: cfgRaw.contextSleutels.map((k) => schoonContextSleutel(k)).filter(Boolean).slice(0, 16) }
        : {}),
    };
    const gemaaktDoorAgent = (bronAgent || String(invoer.gemaaktDoorAgent ?? '')).trim().slice(0, 40);
    const actief = invoer.actief !== false;

    return alsGebruiker(lade.userId, async (q) => {
      const r = (await q(
        `INSERT INTO app.ai_ruimte_uitbreidingen (user_id, ruimte, slug, naam, beschrijving, soort, doel_diensten, omgevingen, config, gemaakt_door_agent, actief)
         VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[], $9::jsonb, $10, $11)
         ON CONFLICT (user_id, ruimte, slug) DO UPDATE
           SET naam = EXCLUDED.naam,
               beschrijving = EXCLUDED.beschrijving,
               soort = EXCLUDED.soort,
               doel_diensten = EXCLUDED.doel_diensten,
               omgevingen = EXCLUDED.omgevingen,
               config = EXCLUDED.config,
               gemaakt_door_agent = CASE WHEN EXCLUDED.gemaakt_door_agent = '' THEN app.ai_ruimte_uitbreidingen.gemaakt_door_agent ELSE EXCLUDED.gemaakt_door_agent END,
               actief = EXCLUDED.actief,
               bijgewerkt_op = now()
         WHERE app.ai_ruimte_uitbreidingen.user_id = $1 AND app.ai_ruimte_uitbreidingen.ruimte = $2
         RETURNING ${UIT_KOL}`,
        [lade.userId, lade.ruimte, slug, naam, beschrijving, soort, doelDiensten, omgevingen, JSON.stringify(config), gemaaktDoorAgent, actief],
      )).rows[0];
      return { ok: true, uitbreiding: rijNaarUitbreiding(r) };
    });
  },

  async uitbreidingVerwijderen(lade, slug) {
    const s = schoonUitbreidingSlug(slug);
    if (!s) return false;
    return alsGebruiker(lade.userId, async (q) => ((await q(`DELETE FROM app.ai_ruimte_uitbreidingen WHERE user_id = $1 AND ruimte = $2 AND slug = $3`, [lade.userId, lade.ruimte, s])).rowCount || 0) > 0);
  },
};

export async function leesWerkruimteEnContextVoorChat(
  lade: Lade,
  werkruimteId: string,
  contextSleutels: readonly string[],
  opslag: EcosysteemOpslag = pgEcosysteemOpslag,
): Promise<{ werkruimte: AiAgentWerkruimte | null; contextItems: AiGedeeldeContextItem[] }> {
  const [werkruimte, contextItems] = await Promise.all([
    werkruimteId ? opslag.werkruimteVoorChat(lade, werkruimteId).catch(() => null) : Promise.resolve(null),
    contextSleutels.length ? opslag.contextVoorSleutels(lade, contextSleutels).catch(() => []) : Promise.resolve([]),
  ]);
  return { werkruimte, contextItems };
}

type SessieUitkomst = { errorCode: string } | { user: { id: string; email: string; role: string; status: string; entitlements?: unknown }; service: string };

export interface AiEcosysteemDeps {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessieUitkomst>;
  opslag?: EcosysteemOpslag;
  ladeVan?: (userId: string, body: unknown) => Promise<Lade>;
  limiet?: (userId: string) => Promise<boolean>;
}

const lichaam = (body: unknown): Record<string, unknown> => (body && typeof body === 'object' ? (body as Record<string, unknown>) : {});

export function aiEcosysteemRoutes(deps: AiEcosysteemDeps): Record<string, RouterMiddleware[]> {
  const opslag = deps.opslag ?? pgEcosysteemOpslag;
  const ladeVan = deps.ladeVan ?? ecosysteemLade;
  const limiet = deps.limiet ?? (async (userId: string) => (await rateLimit(`ai-ecosysteem:${userId}`, 60, 60)).ok);

  const poort = async (ctx: { event: Record<string, unknown>; body: unknown }) => {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth || !(DIENSTEN as readonly string[]).includes(auth.service) || auth.user.status !== 'approved') {
      return { fout: error(weigerCode(undefined), 403) };
    }
    if (!heeftApiRecht(auth.user as never)) return { fout: error(weigerCode(GEEN_RECHT), 403) };
    if (!(await limiet(auth.user.id))) return { fout: error('ECOSYSTEEM_TE_VEEL_VERZOEKEN', 429) };
    const lade = await ladeVan(auth.user.id, ctx.body);
    return { user: auth.user, lade };
  };

  return {
    'POST /api/owner/ai/ecosysteem/overzicht': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const stand = await opslag.overzicht(p.lade);
      return json({
        ruimte: p.lade.ruimte,
        ...stand,
        aanbieders: AI_AANBIEDERS.map((a) => ({ id: a.id, naamUk: a.naamUk, naamNl: a.naamNl, standaardModel: a.standaardModel })),
        agenten: V2_AGENTEN.map((a) => ({ slug: a.slug, naam: a.naam })),
        sjablonen: STANDAARD_WERKRUIMTE_SJABLONEN.filter((s) => s.ruimte === 'beide' || s.ruimte === p.lade.ruimte),
      });
    }) as RouterMiddleware],

    'POST /api/owner/ai/ecosysteem/context/lijst': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const items = await opslag.contextLijst(p.lade, {
        sleutel: typeof b.sleutel === 'string' ? b.sleutel : undefined,
        werkruimteId: typeof b.werkruimteId === 'string' ? b.werkruimteId : undefined,
        zoek: typeof b.zoek === 'string' ? b.zoek : undefined,
        limiet: typeof b.limiet === 'number' ? b.limiet : undefined,
      });
      return json({ ruimte: p.lade.ruimte, items });
    }) as RouterMiddleware],

    'POST /api/owner/ai/ecosysteem/werkruimte/opslaan': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const res = await opslag.werkruimteOpslaan(p.lade, b);
      if (!res.ok) return error(res.code, 400);
      await auditToevoegen({ ownerId: p.user.id, action: 'owner.ai.ecosysteem.werkruimte.opslaan', result: 'success', details: { ruimte: p.lade.ruimte, werkruimteId: res.werkruimte.id } }).catch(() => undefined);
      return json({ ruimte: p.lade.ruimte, werkruimte: res.werkruimte });
    }) as RouterMiddleware],

    'POST /api/owner/ai/ecosysteem/werkruimte/verwijderen': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const id = String(lichaam(ctx.body).id ?? '');
      const verwijderd = await opslag.werkruimteVerwijderen(p.lade, id);
      if (!verwijderd) return error('ECOSYSTEEM_NIET_GEVONDEN', 404);
      await auditToevoegen({ ownerId: p.user.id, action: 'owner.ai.ecosysteem.werkruimte.verwijderen', result: 'success', details: { ruimte: p.lade.ruimte, werkruimteId: id } }).catch(() => undefined);
      return json({ ok: true, verwijderd: true });
    }) as RouterMiddleware],

    'POST /api/owner/ai/ecosysteem/context/opslaan': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const wie = huidigeNamens();
      const res = await opslag.contextOpslaan(p.lade, lichaam(ctx.body), wie?.agent || wie?.client || '');
      if (!res.ok) return error(res.code, 400);
      await auditToevoegen({ ownerId: p.user.id, action: 'owner.ai.ecosysteem.context.opslaan', result: 'success', details: { ruimte: p.lade.ruimte, sleutel: res.item.sleutel } }).catch(() => undefined);
      return json({ ruimte: p.lade.ruimte, item: res.item });
    }) as RouterMiddleware],

    'POST /api/owner/ai/ecosysteem/context/verwijderen': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const sleutel = String(lichaam(ctx.body).sleutel ?? '');
      const verwijderd = await opslag.contextVerwijderen(p.lade, sleutel);
      if (!verwijderd) return error('ECOSYSTEEM_NIET_GEVONDEN', 404);
      return json({ ok: true, verwijderd: true });
    }) as RouterMiddleware],

    'POST /api/owner/ai/ecosysteem/overdracht/aanmaken': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const wie = huidigeNamens();
      const res = await opslag.overdrachtAanmaken(p.lade, lichaam(ctx.body), wie?.agent || wie?.client || '');
      if (!res.ok) return error(res.code, 400);
      await auditToevoegen({ ownerId: p.user.id, action: 'owner.ai.ecosysteem.overdracht.aanmaken', result: 'success', details: { ruimte: p.lade.ruimte, naarAgent: res.overdracht.naarAgent } }).catch(() => undefined);
      return json({ ruimte: p.lade.ruimte, overdracht: res.overdracht });
    }) as RouterMiddleware],

    'POST /api/owner/ai/ecosysteem/overdracht/bijwerken': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const res = await opslag.overdrachtBijwerken(p.lade, lichaam(ctx.body));
      if (!res.ok) return error(res.code, res.code === 'ECOSYSTEEM_NIET_GEVONDEN' ? 404 : 400);
      return json({ ruimte: p.lade.ruimte, overdracht: res.overdracht });
    }) as RouterMiddleware],

    'POST /api/owner/ai/ecosysteem/uitbreiding/opslaan': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const wie = huidigeNamens();
      const res = await opslag.uitbreidingOpslaan(p.lade, lichaam(ctx.body), wie?.agent || wie?.client || '');
      if (!res.ok) return error(res.code, 400);
      await auditToevoegen({ ownerId: p.user.id, action: 'owner.ai.ecosysteem.uitbreiding.opslaan', result: 'success', details: { ruimte: p.lade.ruimte, slug: res.uitbreiding.slug } }).catch(() => undefined);
      return json({ ruimte: p.lade.ruimte, uitbreiding: res.uitbreiding });
    }) as RouterMiddleware],

    'POST /api/owner/ai/ecosysteem/uitbreiding/verwijderen': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const slug = String(lichaam(ctx.body).slug ?? '');
      const verwijderd = await opslag.uitbreidingVerwijderen(p.lade, slug);
      if (!verwijderd) return error('ECOSYSTEEM_NIET_GEVONDEN', 404);
      return json({ ok: true, verwijderd: true });
    }) as RouterMiddleware],

    'POST /api/owner/ai/ecosysteem/zelf-hosten/pakket': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const pakket = bouwZelfHostPakket({
        domein: typeof b.domein === 'string' ? b.domein : undefined,
        poort: typeof b.poort === 'number' ? b.poort : undefined,
        metLokaleModellen: b.metLokaleModellen !== false,
        ruimte: p.lade.ruimte as AiRuimte,
      });
      return json({ ruimte: p.lade.ruimte, pakket });
    }) as RouterMiddleware],
  };
}
