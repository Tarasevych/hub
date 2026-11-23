// Werkgebied «ШІ для вас» op ai.tarasevych.com: de twee routes die het scherm nodig heeft (punt 13 eigenaarslijst, 19.10.2026).
//
//   POST /api/owner/ai/werkruimte/overzicht  → de ECHTE stand van dit account (recht, sleutel, modellen, hulpmiddelen,
//                                              apparaten, browsers, GitHub, Google Suite, AI-koppelingen).
//   POST /api/owner/ai/werkruimte/chat       → één vraag aan het model, met keuze uit de modellen die de SERVER echt
//                                              heeft ingesteld. Hergebruikt runChat() van backend/connectors-chat.ts;
//                                              hier staat geen tweede chatmotor.
//
// Waarom een eigen module en geen extra route in connectors-routes.ts:
//   - het bestaande POST /api/owner/agents/chat kiest het model niet (env of standaard) en kent alleen de codes
//     CHAT_*; dit scherm moet de gebruiker per fout de ECHTE reden kunnen tonen, inclusief een onbekend model;
//   - het overzicht bestond nergens: /api/owner/agents/chat/status geeft alleen sleutel + hulpmiddelnamen, niets over
//     het recht, de integraties of de koppelingen. Zonder die feiten kan de startpagina niet eerlijk zijn.
//
// Belangrijkste regel (audit 19.10, U-03): een GELDIGE sessie zonder het recht 'api-platform' krijgt API_RECHT_VEREIST,
// NOOIT OWNER_API_SESSION_REQUIRED. Anders leest de gebruiker «Сесія закінчилася» terwijl alleen het recht ontbreekt.
import { error, json, rateLimit } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import type { RouterMiddleware } from '../server/platform/router';
import { GEEN_RECHT, heeftApiRecht, weigerCode } from './api-recht';
import { DEFAULT_MODEL, defaultChatDeps, runChat, sanitizeHistory, type ChatDeps } from './connectors-chat';
import { listTools } from './connectors-hulpmiddelen';
import { agentOnline } from './connectors-gateway';
import { CHAT_KLANT, metNamens } from './mcp-namens';
import * as store from './connectors-opslag';
import { githubKoppeling } from './github-platform';
import { googleSuiteOnboardingSnapshot } from './google-suite-inrichting';
import { listUserGrants } from './mcp-connector';
import { aanbiederFout, LEGE_FEITEN, pasGekozenApparaatToe, startStaat, WERKRUIMTE_FOUTEN, type Feiten, type ModelKeuze } from '../shared/ai-werkruimte';
import { AI_AANBIEDERS } from '../shared/ai-aanbieders';
import { apparaatInRuimte, type AiRuimte } from '../shared/ai-ruimte';
import {
  bouwWerkruimteSysteemInstructie,
  controleerAanroepVoorWerkruimte,
  filterHulpmiddelenVoorWerkruimte,
} from '../shared/ai-ecosysteem';
import { ecosysteemLade, leesWerkruimteEnContextVoorChat, type EcosysteemOpslag } from './ai-ecosysteem';
import { leesGeheugenPakketVoorChat, pgStroomOpslag, type StroomOpslag } from './geheugen-stroom';

/** Diensten waarvan dit scherm bereikbaar is: ai.* (het scherm zelf), mcp.* (de hub ernaast) en 'api' voor clients. */
const DIENSTEN = ['ai', 'mcp', 'api'] as const;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;

/**
 * Modellen die de eigenaar van de SERVER echt heeft ingesteld: CHAT_MODELLEN (komma's, eerste = standaard), anders
 * CHAT_MODEL, anders het standaardmodel van de code. Een naam die er niet uitziet als een model-id valt weg: het
 * scherm mag nooit een keuze tonen die de aanbieder zeker weigert.
 */
export function ingesteldeModellen(): ModelKeuze[] {
  const lijst = String(process.env.CHAT_MODELLEN ?? '').split(',').map((s) => s.trim()).filter((s) => MODEL_ID.test(s));
  const uit = lijst.length ? lijst : [String(process.env.CHAT_MODEL ?? DEFAULT_MODEL).trim()].filter((s) => MODEL_ID.test(s));
  return uit.slice(0, 12).map((id, i) => ({ id, standaard: i === 0 }));
}

/**
 * Bepaalt welke onafhankelijke AI-aanbieders (anthropic, gemini, openai, grok, autoclaw) een actieve sleutel
 * in de Sleutelkluis van deze gebruiker hebben, en stelt de beschikbare modellen samen.
 */
export async function modellenVoorGebruiker(
  userId: string,
  chatDeps: ChatDeps = defaultChatDeps,
): Promise<{ sleutel: boolean; modellen: ModelKeuze[] }> {
  const serverModellen = ingesteldeModellen();
  const leesSleutel = async (purpose: 'anthropic' | 'gemini' | 'openai' | 'grok' | 'autoclaw'): Promise<boolean> => {
    try {
      if (chatDeps.getApiKeyForPurpose) return !!(await chatDeps.getApiKeyForPurpose(userId, purpose));
      if (purpose === 'anthropic') return !!(await chatDeps.getApiKey(userId));
      return false;
    } catch {
      return false;
    }
  };
  const statussen = await Promise.all(AI_AANBIEDERS.map(async (a) => ({ aanbieder: a, heeftSleutel: await leesSleutel(a.id) })));
  const actieve = statussen.filter((s) => s.heeftSleutel).map((s) => s.aanbieder);
  if (actieve.length === 0) {
    return { sleutel: false, modellen: serverModellen };
  }
  const heeftAnthropic = actieve.some((a) => a.id === 'anthropic');
  const ids: string[] = [];
  if (heeftAnthropic) {
    for (const m of serverModellen) {
      if (!ids.includes(m.id)) ids.push(m.id);
    }
  }
  for (const a of actieve) {
    if (!ids.includes(a.standaardModel) && MODEL_ID.test(a.standaardModel)) ids.push(a.standaardModel);
  }
  if (ids.length === 0) {
    for (const m of serverModellen) ids.push(m.id);
  }
  return {
    sleutel: true,
    modellen: ids.slice(0, 12).map((id, i) => ({ id, standaard: i === 0 })),
  };
}

/** Google Suite per dienst. Lukt het lezen niet, dan `bekend: false` — dan beweert het scherm nergens «підключено». */
async function googleStand(userId: string, email: string): Promise<Feiten['google']> {
  try {
    const snapshot = await googleSuiteOnboardingSnapshot(userId, email);
    const lijst = Array.isArray(snapshot?.services) ? snapshot.services : [];
    const aan = (id: string) => lijst.some((s: { id?: string; granted?: boolean }) => s?.id === id && s?.granted === true);
    return { bekend: true, post: aan('mail'), agenda: aan('calendar'), schijf: aan('drive') };
  } catch { return { bekend: false, post: false, agenda: false, schijf: false }; }
}

const isBrowser = (a: store.AgentRow) => a.platform === 'browser';
const browserActief = (a: store.AgentRow) => a.browser_enabled === true && !!a.armed_until && new Date(a.armed_until).getTime() > Date.now();

/**
 * Alle feiten van één account. Elk onderdeel apart in try/catch: één kapotte bron (bv. Google) mag de startpagina
 * niet leegmaken — ze toont dan voor dat ene onderdeel «стан не вдалося прочитати».
 */
export async function feitenVan(user: { id: string; email?: string }, recht: boolean, ruimte: AiRuimte = 'prive'): Promise<Feiten> {
  const veilig = async <T>(fn: () => Promise<T>, terug: T): Promise<T> => { try { return await fn(); } catch { return terug; } };
  const [aanbiederStand, chatTools, agents, github, google, koppelingen] = await Promise.all([
    veilig(() => modellenVoorGebruiker(user.id), { sleutel: false, modellen: ingesteldeModellen() }),
    // Precies de lijst die de chat zelf krijgt: dezelfde naam in het AI-beleid en dezelfde privéruimte.
    veilig(async () => (await metNamens({ client: CHAT_KLANT }, () => listTools(user.id))).map((t) => t.name), [] as string[]),
    veilig(() => store.listAgents(user.id), [] as store.AgentRow[]),
    veilig(async () => !!(await githubKoppeling(user.id)), false),
    googleStand(user.id, String(user.email ?? '')),
    veilig(async () => (await listUserGrants(user.id)).length, 0),
  ]);
  const machines = agents.filter((a) => !isBrowser(a) && apparaatInRuimte(a, ruimte));
  const browsers = agents.filter((a) => isBrowser(a) && apparaatInRuimte(a, ruimte));
  const apparaatItems = machines.map((a) => ({
    id: a.id,
    naam: a.name,
    platform: a.platform ?? null,
    online: agentOnline(a.id),
  }));
  return {
    ...LEGE_FEITEN,
    recht,
    sleutel: aanbiederStand.sleutel,
    chatTools,
    modellen: aanbiederStand.modellen,
    apparaten: {
      totaal: machines.length,
      online: apparaatItems.filter((a) => a.online).length,
      items: apparaatItems,
    },
    browsers: { totaal: browsers.length, actief: browsers.filter(browserActief).length },
    github, google, koppelingen,
  };
}

type SessieUitkomst = { errorCode: string } | { user: { id: string; email: string; role: string; status: string; entitlements?: unknown }; service: string };
export type WerkruimteDeps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessieUitkomst>;
  /** Alleen voor tests: feiten en chat zonder database/netwerk. */
  feiten?: (user: { id: string; email?: string }, recht: boolean, ruimte?: AiRuimte) => Promise<Feiten>;
  chatDeps?: ChatDeps;
  ecosysteemOpslag?: EcosysteemOpslag;
  geheugenOpslag?: StroomOpslag;
  /** Alleen voor tests: apparatenlijst en ruimte zonder database. */
  agentenLijst?: (userId: string) => Promise<store.AgentRow[]>;
  ladeVoorVerzoek?: (userId: string, body: unknown) => Promise<{ userId: string; ruimte: AiRuimte }>;
  /** Alleen voor tests: zonder teller. Standaard 20 verzoeken per minuut per account (de sleutel kost de gebruiker geld). */
  limiet?: (userId: string) => Promise<boolean>;
  apparaatkeuzeVlagAan?: (user: { id: string; email?: string; role?: string }) => Promise<boolean>;
};

const lichaam = (body: unknown): Record<string, unknown> => (body && typeof body === 'object' ? body as Record<string, unknown> : {});

export function aiWerkruimteRoutes(deps: WerkruimteDeps): Record<string, RouterMiddleware[]> {
  const feitenVanDeps = deps.feiten ?? feitenVan;
  const limiet = deps.limiet ?? (async (userId: string) => (await rateLimit(`ai-werkruimte:${userId}`, 20, 60)).ok);

  /**
   * De poort van dit scherm. Drie uitkomsten, elk met een eigen eerlijke code:
   *   - geen/verlopen sessie of een andere dienst → OWNER_API_SESSION_REQUIRED (echt een sessiefout);
   *   - geldige sessie zonder 'api-platform'      → API_RECHT_VEREIST (de hub legt uit wie dat geeft);
   *   - alles in orde                             → de gebruiker.
   */
  const poort = async (ctx: { event: Record<string, unknown>; body: unknown }) => {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth || !(DIENSTEN as readonly string[]).includes(auth.service) || auth.user.status !== 'approved') {
      return { fout: error(weigerCode(undefined), 403) };
    }
    if (!heeftApiRecht(auth.user as never)) return { fout: error(weigerCode(GEEN_RECHT), 403) };
    return { user: auth.user };
  };

  return {
    // De stand van dit account, zonder enige geheime waarde (nooit de sleutel zelf, nooit een tokennaam).
    'POST /api/owner/ai/werkruimte/overzicht': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const lade = deps.feiten && !deps.ladeVoorVerzoek
        ? { userId: p.user.id, ruimte: 'prive' as AiRuimte }
        : await (deps.ladeVoorVerzoek ?? ecosysteemLade)(p.user.id, ctx.body).catch(() => ({ userId: p.user.id, ruimte: 'prive' as AiRuimte }));
      const ruweFeiten = await feitenVanDeps({ id: p.user.id, email: p.user.email }, true, lade.ruimte);
      const keuzeMag = deps.apparaatkeuzeVlagAan ? await deps.apparaatkeuzeVlagAan(p.user).catch(() => false) : true;
      const feiten: Feiten = keuzeMag
        ? ruweFeiten
        : { ...ruweFeiten, apparaten: { totaal: ruweFeiten.apparaten.totaal, online: ruweFeiten.apparaten.online } };
      return json({ feiten, stand: startStaat(feiten) });
    }) as RouterMiddleware],

    // Eén vraag aan het model. Het model moet uit ingesteldeModellen() komen; de geschiedenis is platte tekst van de client.
    'POST /api/owner/ai/werkruimte/chat': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx);
      if ('fout' in p) return p.fout;
      const body = lichaam(ctx.body);

      const modellen = ingesteldeModellen();
      if (!modellen.length) return error(WERKRUIMTE_FOUTEN.geenModel, 409);
      const gevraagd = String(body.model ?? '').trim();
      const toegestaanDoorAanbieder = AI_AANBIEDERS.some((a) => a.standaardModel === gevraagd || a.standaardVertaalModel === gevraagd);
      if (gevraagd && !modellen.some((m) => m.id === gevraagd) && !toegestaanDoorAanbieder) return error(WERKRUIMTE_FOUTEN.modelOnbekend, 400);
      const model = gevraagd || (modellen.find((m) => m.standaard) ?? modellen[0]).id;

      const berichten = sanitizeHistory(body.messages);
      if (!berichten.length || berichten[berichten.length - 1].role !== 'user') return error(WERKRUIMTE_FOUTEN.laatsteMoetVraagZijn, 400);

      const gevraagdApparaatId = typeof body.apparaatId === 'string'
        ? body.apparaatId.trim()
        : typeof body.machineId === 'string'
          ? body.machineId.trim()
          : '';
      if (gevraagdApparaatId && deps.apparaatkeuzeVlagAan && !(await deps.apparaatkeuzeVlagAan(p.user).catch(() => false))) {
        return error('VLAG_UIT', 403);
      }
      if (gevraagdApparaatId.length > 80) return error(WERKRUIMTE_FOUTEN.apparaatNietGevonden, 403);

      let gekozenApparaat: store.AgentRow | null = null;
      const basisDeps = deps.chatDeps ?? defaultChatDeps;
      const werkruimteId = typeof body.werkruimteId === 'string' ? body.werkruimteId.trim() : '';
      const contextSleutels = Array.isArray(body.contextSleutels)
        ? body.contextSleutels.filter((s): s is string => typeof s === 'string').slice(0, 12)
        : [];
      const metGeheugen = body.metGeheugen === true;

      let lade: { userId: string; ruimte: AiRuimte } | null = null;
      if (gevraagdApparaatId || werkruimteId || contextSleutels.length > 0 || metGeheugen) {
        lade = await (deps.ladeVoorVerzoek ?? ecosysteemLade)(p.user.id, ctx.body);
      }

      if (gevraagdApparaatId && lade) {
        const alleAgenten = await (deps.agentenLijst ?? store.listAgents)(p.user.id);
        gekozenApparaat = alleAgenten.find((a) => a.id === gevraagdApparaatId && !isBrowser(a) && apparaatInRuimte(a, lade.ruimte)) ?? null;
        if (!gekozenApparaat) return error(WERKRUIMTE_FOUTEN.apparaatNietGevonden, 403);
      }

      if (!(await limiet(p.user.id))) return error(WERKRUIMTE_FOUTEN.teVeel, 429);

      let werkruimte = null as Awaited<ReturnType<typeof leesWerkruimteEnContextVoorChat>>['werkruimte'];
      let extraSystem = '';
      let geheugenAantal = 0;

      if (lade && (werkruimteId || contextSleutels.length > 0 || metGeheugen)) {
        if (werkruimteId || contextSleutels.length > 0) {
          const geladen = await leesWerkruimteEnContextVoorChat(lade, werkruimteId, contextSleutels, deps.ecosysteemOpslag);
          werkruimte = geladen.werkruimte;
          extraSystem = bouwWerkruimteSysteemInstructie(werkruimte, geladen.contextItems);
        }
        if (metGeheugen) {
          try {
            const laatsteVraag = String(berichten[berichten.length - 1]?.content ?? '');
            const gRes = await leesGeheugenPakketVoorChat(
              lade,
              laatsteVraag,
              werkruimteId || undefined,
              deps.geheugenOpslag ?? pgStroomOpslag,
            );
            geheugenAantal = gRes.pakket.items.length;
            if (gRes.systeemPrompt) {
              extraSystem = [extraSystem, gRes.systeemPrompt].filter(Boolean).join('\n\n');
            }
          } catch {
            // Стрім пам’яті не блокує основну відповідь чату, якщо сховище ключів тимчасово закрите чи ще не перенесене.
          }
        }
      }

      if (gekozenApparaat) {
        const apparaatInstructie = [
          `Обраний користувачем цільовий пристрій: "${gekozenApparaat.name}" (id: ${gekozenApparaat.id}). Виконуй інструменти комп’ютера саме на цьому пристрої.`,
          `Door de gebruiker gekozen doelapparaat: "${gekozenApparaat.name}" (id: ${gekozenApparaat.id}). Voer computerhulpmiddelen precies op dit apparaat uit.`,
        ].join('\n');
        extraSystem = [extraSystem, apparaatInstructie].filter(Boolean).join('\n\n');
      }

      const samengesteldeDeps: ChatDeps = {
        ...basisDeps,
        model,
        ...(extraSystem ? { extraSystem } : {}),
        listTools: async (uid) => {
          const alle = await basisDeps.listTools(uid);
          return filterHulpmiddelenVoorWerkruimte(alle, werkruimte);
        },
        callTool: async (uid, name, args) => {
          const doelArgs = pasGekozenApparaatToe(name, args, gekozenApparaat?.id ?? null);
          const controle = controleerAanroepVoorWerkruimte(name, doelArgs, werkruimte);
          if (!controle.ok) {
            return { isError: true, content: [{ type: 'text', text: controle.reden }] };
          }
          return basisDeps.callTool(uid, name, doelArgs);
        },
      };

      const uit = await runChat(samengesteldeDeps, p.user.id, berichten);
      if ('error' in uit) {
        await auditToevoegen({ ownerId: p.user.id, action: 'owner.ai.werkruimte.chat', result: 'failure', details: { model, fout: uit.error, ...(gekozenApparaat ? { apparaatId: gekozenApparaat.id } : {}) } }).catch(() => undefined);
        if (uit.error === 'no_api_key') return error(WERKRUIMTE_FOUTEN.geenSleutel, 409);
        return error(aanbiederFout(uit.status), 502);
      }
      await auditToevoegen({ ownerId: p.user.id, action: 'owner.ai.werkruimte.chat', result: 'success', details: { model, stappen: uit.steps.map((s) => s.tool), ...(gekozenApparaat ? { apparaatId: gekozenApparaat.id } : {}), ...(werkruimte ? { werkruimteId: werkruimte.id } : {}), ...(metGeheugen ? { geheugenAantal } : {}) } }).catch(() => undefined);
      return json({ ...uit, model, ...(gekozenApparaat ? { apparaatId: gekozenApparaat.id } : {}), ...(werkruimte ? { werkruimteId: werkruimte.id } : {}), ...(metGeheugen ? { geheugenAantal } : {}) });
    }) as RouterMiddleware],
  };
}
