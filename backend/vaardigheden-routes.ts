// HTTP-routes voor het ecosysteem van agentvaardigheden (/api/owner/vaardigheden/*).
// Verzorgt voor zowel de webinterface als de MCP-hulpmiddelen (via site-aanroep):
//   • gecombineerd overzicht van systeemvaardigheden (.agents/skills/*), protocolvaardigheden, eigen vaardigheden, agentprofielen en revisies;
//   • zoeken en aanbevelen op onderwerp met eerlijke zichtbaarheidscontrole van hulpmiddelen;
//   • aanmaken, bijwerken, importeren (SKILL.md of JSON), uitschakelen per agent, verwijderen en revisies herstellen;
//   • strikte scheiding tussen de privéruimte en de technische ruimte (gegevensRuimteVeilig + huidigeNamens).

import { error, json, rateLimit, type RouterMiddleware } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { GEEN_RECHT, heeftApiRecht, weigerCode } from './api-recht';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import { huidigeNamens, huidigeRuimte } from './mcp-namens';
import { taalVanGebruiker } from './connectors-hulpmiddelen';
import { meldBronnenGewijzigd } from './connector-v2-stroom';
import { isAgentSlug, V2_AGENTEN, type AgentSlug } from '../shared/connector-v2/agenten';
import {
  bouwVaardigheidPakket,
  parseerVaardigheidInvoerPakket,
  standaardAgentProfielen,
  vaardFoutTekst,
  valideerVaardigheidInvoer,
  VAARD_SLUG_RE,
  zoekEnRankVaardigheden,
  type VaardigheidRuimte,
} from '../shared/vaardigheden-ecosysteem';
import { pgVaardighedenOpslag, type VaardighedenOpslag } from './vaardigheden-opslag';
import * as v2 from './connector-v2';

type User = { id: string; status: string; email?: string; role?: string };
type AuthSuccess = { service: string; user: User };
type AuthFailure = { errorCode: string };

export interface VaardighedenRoutesDeps {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<AuthSuccess | AuthFailure>;
  opslag?: VaardighedenOpslag;
  ladeVoor?: (userId: string, body: unknown) => Promise<{ ok: true; userId: string; ruimte: VaardigheidRuimte } | { ok: false; code: string }>;
  limiet?: (userId: string) => Promise<boolean>;
  audit?: (ownerId: string, action: string, result: 'success' | 'denied', details: Record<string, unknown>) => Promise<void>;
  meldWijziging?: (userId: string, agent?: string) => void;
  zichtbareHulpmiddelenVoor?: (userId: string, agentSlug?: AgentSlug) => Promise<string[] | null>;
}

const DIENSTEN = ['mcp', 'hub', 'admin', 'ai'] as const;
const lichaam = (body: unknown): Record<string, unknown> =>
  (body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {});

async function standaardLade(userId: string, body: unknown): Promise<{ ok: true; userId: string; ruimte: VaardigheidRuimte } | { ok: false; code: string }> {
  const b = lichaam(body);
  const namens = huidigeNamens();
  if (namens) {
    const rm = huidigeRuimte() === 'technisch' ? 'technisch' : 'prive';
    if (b.ruimte === 'technisch' && rm !== 'technisch') {
      return { ok: false, code: 'VAARD_TECH_PROFIEL_VEREIST' };
    }
    return { ok: true, userId, ruimte: rm };
  }
  const tabContext = typeof b.tabContext === 'string' ? b.tabContext : '';
  const g = await gegevensRuimteVeilig(userId, { tabContext });
  const rm: VaardigheidRuimte = g === 'technisch' ? 'technisch' : 'prive';
  if (b.ruimte === 'technisch' && rm !== 'technisch') {
    return { ok: false, code: 'VAARD_TECH_PROFIEL_VEREIST' };
  }
  return { ok: true, userId, ruimte: rm };
}

async function standaardZichtbareHulpmiddelen(userId: string, agentSlug?: AgentSlug): Promise<string[] | null> {
  if (!agentSlug) return null;
  try {
    const ov = await v2.overzicht(userId);
    const ag = ov.agenten.find((a) => a.slug === agentSlug);
    if (!ag?.actief?.sleutels?.length) return null;
    return [...new Set(ag.actief.sleutels.map((s) => s.split(':')[0]).filter(Boolean))];
  } catch {
    return null;
  }
}

export function vaardighedenRoutes(deps: VaardighedenRoutesDeps): Record<string, RouterMiddleware[]> {
  const opslag = deps.opslag ?? pgVaardighedenOpslag;
  const ladeVoor = deps.ladeVoor ?? standaardLade;
  const limiet = deps.limiet ?? (async (userId: string) => (await rateLimit(`vaardigheden:${userId}`, 90, 60)).ok);
  const audit = deps.audit ?? (async (ownerId, action, result, details) => {
    await auditToevoegen({ ownerId, actorId: ownerId, action, type: 'beveiliging', result, details, service: 'mcp' }).catch(() => undefined);
  });
  const meldWijziging = deps.meldWijziging ?? meldBronnenGewijzigd;
  const zichtbareHulpmiddelenVoor = deps.zichtbareHulpmiddelenVoor ?? standaardZichtbareHulpmiddelen;

  const poort = async (ctx: { event: Record<string, unknown>; body: unknown }) => {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth || !(DIENSTEN as readonly string[]).includes(auth.service) || auth.user.status !== 'approved') {
      return { fout: error(weigerCode(undefined), 403) };
    }
    if (!heeftApiRecht(auth.user as never)) return { fout: error(weigerCode(GEEN_RECHT), 403) };
    if (!(await limiet(auth.user.id))) return { fout: error('VAARD_TE_VEEL_VERZOEKEN', 429) };
    const ladeRes = await ladeVoor(auth.user.id, ctx.body);
    if (!ladeRes.ok) return { fout: error(ladeRes.code, 403) };
    return { user: auth.user, lade: { userId: ladeRes.userId, ruimte: ladeRes.ruimte } };
  };

  const taalVan = async (userId: string): Promise<'uk' | 'nl'> => {
    try { return await taalVanGebruiker(userId); } catch { return 'uk'; }
  };

  return {
    'POST /api/owner/vaardigheden/overzicht': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const [stand, taal] = await Promise.all([opslag.overzicht(p.lade), taalVan(p.user.id)]);
      const eigenSlugs = new Set(stand.eigen.map((e) => e.id));
      const gecombineerd = [...stand.eigen, ...stand.ingebouwd.filter((v) => !eigenSlugs.has(v.id))];
      const agentProfielen = standaardAgentProfielen(gecombineerd, stand.standen, p.lade.ruimte as VaardigheidRuimte);
      return json({
        ruimte: p.lade.ruimte,
        taal,
        vaardigheden: gecombineerd,
        ingebouwd: stand.ingebouwd,
        eigen: stand.eigen,
        standen: stand.standen,
        revisies: stand.revisies,
        agentProfielen,
        agenten: V2_AGENTEN.map((a) => ({ slug: a.slug, naam: a.naam })),
      });
    }) as RouterMiddleware],

    'POST /api/owner/vaardigheden/aanbevelen': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const namens = huidigeNamens();
      const ruwAgent = typeof b.agent === 'string' ? b.agent.trim().toLowerCase() : (namens?.agent ?? '');
      const agentSlug: AgentSlug | undefined = isAgentSlug(ruwAgent) ? ruwAgent : undefined;
      const vraag = typeof b.vraag === 'string' ? b.vraag.trim().slice(0, 400) : '';
      const leesId = typeof b.leesId === 'string' ? b.leesId.trim().toLowerCase() : '';
      const maximum = typeof b.maximum === 'number' && Number.isInteger(b.maximum) ? b.maximum : 5;

      const [stand, taal, zichtbaar] = await Promise.all([
        opslag.overzicht(p.lade),
        taalVan(p.user.id),
        zichtbareHulpmiddelenVoor(p.user.id, agentSlug),
      ]);
      const eigenSlugs = new Set(stand.eigen.map((e) => e.id));
      const gecombineerd = [...stand.eigen, ...stand.ingebouwd.filter((v) => !eigenSlugs.has(v.id))];

      const aanbevelingen = vraag
        ? zoekEnRankVaardigheden(vraag, gecombineerd, {
          standen: stand.standen,
          agentSlug,
          ruimte: p.lade.ruimte as VaardigheidRuimte,
          zichtbareHulpmiddelen: zichtbaar,
          maximum,
        })
        : [];

      let gelezen: Record<string, unknown> | null = null;
      if (leesId) {
        if (!VAARD_SLUG_RE.test(leesId)) {
          return json({ error: 'VAARD_SLUG_ONGELDIG', uitleg: vaardFoutTekst('VAARD_SLUG_ONGELDIG', taal) }, 400);
        }
        const actieve = await opslag.alleActieveVoorContext(p.lade, agentSlug);
        const gevonden = actieve.find((v) => v.id === leesId);
        if (!gevonden) {
          return json({ error: 'VAARD_NIET_GEVONDEN', uitleg: vaardFoutTekst('VAARD_NIET_GEVONDEN', taal) }, 404);
        }
        gelezen = {
          id: gevonden.id,
          uri: gevonden.uri,
          bron: gevonden.bron,
          ruimte: gevonden.ruimte,
          versie: gevonden.versie,
          titel: gevonden.titel,
          samenvatting: gevonden.samenvatting,
          inhoud: gevonden.inhoud,
          vereisteHulpmiddelen: gevonden.vereisteHulpmiddelen,
          pakket: bouwVaardigheidPakket(gevonden),
        };
      }

      return json({
        ruimte: p.lade.ruimte,
        taal,
        agent: agentSlug ?? null,
        aanbevelingen,
        gelezen,
      });
    }) as RouterMiddleware],

    'POST /api/owner/vaardigheden/opslaan': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const valid = valideerVaardigheidInvoer(b);
      const taal = await taalVan(p.user.id);
      if (!valid.ok) {
        await audit(p.user.id, 'owner.vaardigheden.opslaan', 'denied', { ruimte: p.lade.ruimte, code: valid.code });
        return json({ error: valid.code, uitleg: vaardFoutTekst(valid.code, taal) }, 400);
      }
      const wie = huidigeNamens();
      const doorAgent = wie?.agent || wie?.client || '';
      const res = await opslag.opslaan(p.lade, valid.waarde, doorAgent);
      if (!res.ok) {
        await audit(p.user.id, 'owner.vaardigheden.opslaan', 'denied', { ruimte: p.lade.ruimte, code: res.code, slug: valid.waarde.slug });
        return json({ error: res.code, uitleg: vaardFoutTekst(res.code, taal) }, 400);
      }
      await audit(p.user.id, 'owner.vaardigheden.opslaan', 'success', {
        ruimte: p.lade.ruimte,
        slug: res.item.id,
        versie: res.item.versie,
        aangemaakt: res.aangemaakt,
      });
      meldWijziging(p.user.id);
      return json({ ruimte: p.lade.ruimte, item: res.item, aangemaakt: res.aangemaakt });
    }) as RouterMiddleware],

    'POST /api/owner/vaardigheden/koppelen': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const ruwAgent = String(b.agentSlug ?? '*').trim().toLowerCase();
      if (ruwAgent !== '*' && !isAgentSlug(ruwAgent)) {
        return error('VAARD_AGENT_ONGELDIG', 400);
      }
      const agentSlug: AgentSlug | '*' = ruwAgent === '*' ? '*' : (ruwAgent as AgentSlug);
      const vaardigheidId = String(b.vaardigheidId ?? b.slug ?? '').trim().toLowerCase();
      const taal = await taalVan(p.user.id);
      const res = await opslag.zetAgentStand(p.lade, {
        agentSlug,
        vaardigheidId,
        actief: b.actief !== false,
        prioriteit: typeof b.prioriteit === 'number' ? b.prioriteit : 100,
        notitie: typeof b.notitie === 'string' ? b.notitie : '',
      });
      if (!res.ok) {
        const status = res.code === 'VAARD_TECH_PROFIEL_VEREIST' ? 403 : res.code === 'VAARD_NIET_GEVONDEN' ? 404 : 400;
        return json({ error: res.code, uitleg: vaardFoutTekst(res.code, taal) }, status);
      }
      await audit(p.user.id, 'owner.vaardigheden.koppelen', 'success', {
        ruimte: p.lade.ruimte,
        agentSlug,
        vaardigheidId,
        actief: res.stand.actief,
      });
      meldWijziging(p.user.id, agentSlug);
      return json({ ruimte: p.lade.ruimte, stand: res.stand });
    }) as RouterMiddleware],

    'POST /api/owner/vaardigheden/verwijderen': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const slug = String(lichaam(ctx.body).slug ?? '').trim().toLowerCase();
      const taal = await taalVan(p.user.id);
      const res = await opslag.verwijderen(p.lade, slug);
      if (!res.ok) {
        const status = res.code === 'VAARD_NIET_GEVONDEN' ? 404 : 400;
        return json({ error: res.code, uitleg: vaardFoutTekst(res.code, taal) }, status);
      }
      await audit(p.user.id, 'owner.vaardigheden.verwijderen', 'success', { ruimte: p.lade.ruimte, slug });
      meldWijziging(p.user.id);
      return json({ ok: true, verwijderd: true, slug });
    }) as RouterMiddleware],

    'POST /api/owner/vaardigheden/herstellen': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const revisieId = String(lichaam(ctx.body).revisieId ?? '').trim();
      const taal = await taalVan(p.user.id);
      const res = await opslag.herstelRevisie(p.lade, revisieId);
      if (!res.ok) {
        const status = res.code === 'VAARD_NIET_GEVONDEN' ? 404 : 400;
        return json({ error: res.code, uitleg: vaardFoutTekst(res.code, taal) }, status);
      }
      await audit(p.user.id, 'owner.vaardigheden.herstellen', 'success', {
        ruimte: p.lade.ruimte,
        revisieId,
        slug: res.item.id,
        versie: res.item.versie,
      });
      meldWijziging(p.user.id);
      return json({ ruimte: p.lade.ruimte, item: res.item });
    }) as RouterMiddleware],

    'POST /api/owner/vaardigheden/importeren': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const bron = b.pakket ?? b.inhoud ?? b;
      const parsed = parseerVaardigheidInvoerPakket(bron);
      const taal = await taalVan(p.user.id);
      if (!parsed.ok) {
        await audit(p.user.id, 'owner.vaardigheden.importeren', 'denied', { ruimte: p.lade.ruimte, code: parsed.code });
        return json({ error: parsed.code, uitleg: vaardFoutTekst(parsed.code, taal) }, 400);
      }
      const res = await opslag.opslaan(p.lade, { ...parsed.waarde, bron: 'geimporteerd' });
      if (!res.ok) {
        return json({ error: res.code, uitleg: vaardFoutTekst(res.code, taal) }, 400);
      }
      await audit(p.user.id, 'owner.vaardigheden.importeren', 'success', {
        ruimte: p.lade.ruimte,
        slug: res.item.id,
        versie: res.item.versie,
      });
      meldWijziging(p.user.id);
      return json({ ruimte: p.lade.ruimte, item: res.item, aangemaakt: res.aangemaakt });
    }) as RouterMiddleware],
  };
}
