// Zijpaneel van de extensie 0.7.0 — chat «ШІ для вас» naast het huidige tabblad (zone E, 22.10.2026; extension/sidepanel.js).
//
// Waarom een eigen route en niet /api/owner/ai/werkruimte/chat: het zijpaneel is een extensiepagina (chrome-extension://…). Een
// POST met cookie en Origin chrome-extension:// wijst server/start.ts af (CSRF_ORIGIN_DENIED) — terecht. Daarom gaat dit zoals de
// andere extensieroutes: Authorization: Bearer <agenttoken> van het slot, ZONDER cookie (PUBLIEKE_ROUTES in auth-poort.ts,
// EXTENSIE_PADEN in server/start.ts).
//
// Wat het agenttoken mag — en niet meer dan dat:
//   • het token identificeert één slot (agent) van één gebruiker; dat slot moet NU een lopende, ondertekende ontgrendeling hebben
//     (de mens bevestigde dus op de site, met step-up of passkey, en kan de toegang op elk moment intrekken);
//   • de gebruiker moet het recht «API-platform» hebben (zelfde poort als het werkgebied op ai.*; de sleutel kost hem geld);
//   • het model krijgt ALLEEN de browserhulpmiddelen (browser_* en hun devtools-namen) — nooit mail, Drive, apparaten of GitHub:
//     de extensie kan in haar eigen browser toch al niets meer dan dat, en een gestolen agenttoken opent zo geen tweede deur;
//   • elke aanroep van een hulpmiddel richt zich op DEZE browser (args.browser = agent.id) en gaat door dezelfde poorten als vanuit
//     de connector: toestemmingen, ontgrendeling, beleid, matrix «Браузер і агенти» (de kolom «*»: het zijpaneel is geen v2-agent),
//     technische poort voor het technische slot. Het AI-beleid kent de bron als ZIJPANEEL_KLANT.
//   • 20 verzoeken per minuut per gebruiker (zelfde grens als het werkgebied).
import { createHash } from 'node:crypto';
import { error, json, rateLimit } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { heeftApiRecht } from './api-recht';
import { defaultChatDeps, runChat, sanitizeHistory, type ChatDeps } from './connectors-chat';
import * as store from './connectors-opslag';
import { callTool, DEVTOOLS_ALIASES, listTools } from './connectors-hulpmiddelen';
import { ingesteldeModellen } from './ai-werkruimte';
import * as eo from './extensie-ontgrendeling';
import { CHAT_KLANT, metNamens } from './mcp-namens';
import { ruimteOf } from '../shared/ai-ruimte';
import { aiPoortNu } from './ai-ruimte-poort';
import { aanbiederFout, WERKRUIMTE_FOUTEN } from '../shared/ai-werkruimte';

/**
 * Naam van de bron in het AI-beleid en het journaal. Het zijpaneel IS de chat «ШІ для вас» van de site (zelfde motor, zelfde sleutel),
 * dus ook dezelfde bron: het ondertekende AI-beleid van de eigenaar kent hem als CHAT_KLANT en beslist er dan op dezelfde manier over.
 * (Een eigen, onbekende naam zou onder een geldig beleid ALLES dicht zetten: 'agent_unknown'.) In app.audit staat de chat apart als
 * 'owner.extensie.zijpaneel.chat'.
 */
export const ZIJPANEEL_KLANT = CHAT_KLANT;
const DEVTOOLS = new Set(Object.keys(DEVTOOLS_ALIASES));
const isBrowserHulpmiddel = (naam: string) => naam.startsWith('browser_') || DEVTOOLS.has(naam);
const kop = (event: Record<string, unknown>, naam: string) => {
  const h = (event?.headers || {}) as Record<string, string | undefined>;
  return String(Object.entries(h).find(([k]) => k.toLowerCase() === naam)?.[1] ?? '');
};
const bodyOf = (b: unknown) => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {});

/** Ruwe bronnen (zonder de namens-laag van de sitechat); tests vervangen ze. */
export const ZIJPANEEL_BASIS: ChatDeps = { getApiKey: defaultChatDeps.getApiKey, listTools, callTool };
/**
 * Chatafhankelijkheden voor één slot: alleen browserhulpmiddelen, altijd op DEZE browser (args.browser wordt overschreven — ook als
 * het model een andere browser noemt), met de bron ZIJPANEEL_KLANT en de ruimte van het slot in mcp-namens.
 */
export function zijpaneelDeps(agent: store.AgentRow, basis: ChatDeps = ZIJPANEEL_BASIS): ChatDeps {
  const namens = { client: ZIJPANEEL_KLANT, ruimte: ruimteOf(agent.ruimte) };
  return {
    getApiKey: basis.getApiKey,
    listTools: async (userId) => (await metNamens(namens, () => basis.listTools(userId))).filter((t) => isBrowserHulpmiddel(t.name)),
    callTool: (userId, name, args) => {
      if (!isBrowserHulpmiddel(name)) return Promise.resolve({ content: [{ type: 'text' as const, text: `NOT_ALLOWED: the side panel only has browser tools; "${name.slice(0, 60)}" is not one of them.` }], isError: true });
      const a = args && typeof args === 'object' ? { ...(args as Record<string, unknown>) } : {};
      a.browser = agent.id;
      return metNamens(namens, () => basis.callTool(userId, name, a));
    },
    ...(basis.fetchImpl ? { fetchImpl: basis.fetchImpl } : {}), ...(basis.now ? { now: basis.now } : {}),
  };
}

export type ZijpaneelDeps = {
  /** Alleen voor tests. */
  chatDeps?: ChatDeps;
  limiet?: (userId: string) => Promise<boolean>;
};

export function extensieZijpaneelRoutes(deps: ZijpaneelDeps = {}): Record<string, RouterMiddleware[]> {
  const limiet = deps.limiet ?? (async (userId: string) => (await rateLimit(`ext-zijpaneel:${userId}`, 20, 60)).ok);
  return {
    // Authorization: Bearer <agenttoken>; body {messages:[{role, content}], model?, tab?:{url,title}} → {reply, steps, truncated?, model}
    // Fouten: 401 TOKEN_INVALID · 403 EXTENSIE_VERGRENDELD (geen lopende ontgrendeling) · 403 API_RECHT_VEREIST · 409 geen model/sleutel · 429.
    'POST /api/owner/agents/extensie/chat': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const token = kop(ctx.event, 'authorization').replace(/^Bearer\s+/i, '').trim();
      if (token.length < 20 || token.length > 200) return error('TOKEN_INVALID', 401);
      const agent = await store.findAgentByTokenHash(createHash('sha256').update(token).digest('hex'));
      if (!agent || agent.platform !== 'browser') return error('TOKEN_INVALID', 401);
      if (!(await eo.actieveOntgrendeling(agent.id, agent.user_id))) return error('EXTENSIE_VERGRENDELD', 403);
      // Technisch slot: alleen zolang de technische kant van deze mens NU leeft (eigenaar + actief technisch profiel + dienst «ai» aan),
      // precies zoals connector v2 (levendeRuimte). Een ontgrendeling die de activering overleeft, opent hier dus niets.
      if (ruimteOf(agent.ruimte) === 'technisch' && (await aiPoortNu(agent.user_id).catch(() => ({ ruimte: 'prive' as const }))).ruimte !== 'technisch') return error('TECH_PROFILE_OFF', 403);
      const { rows } = await getPool('systeem').query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [agent.user_id]);
      const u = (rows[0]?.data ?? {}) as { role?: string; email?: string; entitlements?: unknown; status?: string };
      if (u.status !== 'approved' || !heeftApiRecht(u)) return error('API_RECHT_VEREIST', 403);
      const body = bodyOf(ctx.body);
      const modellen = ingesteldeModellen();
      if (!modellen.length) return error(WERKRUIMTE_FOUTEN.geenModel, 409);
      const gevraagd = String(body.model ?? '').trim();
      if (gevraagd && !modellen.some((m) => m.id === gevraagd)) return error(WERKRUIMTE_FOUTEN.modelOnbekend, 400);
      const model = gevraagd || (modellen.find((m) => m.standaard) ?? modellen[0]).id;
      const berichten = sanitizeHistory(body.messages);
      if (!berichten.length || berichten[berichten.length - 1].role !== 'user') return error(WERKRUIMTE_FOUTEN.laatsteMoetVraagZijn, 400);
      if (!(await limiet(agent.user_id))) return error(WERKRUIMTE_FOUTEN.teVeel, 429);
      // Context van het tabblad (alleen adres zonder query en titel; de inhoud leest het model zelf via take_snapshot).
      const tab = bodyOf(body.tab);
      const url = typeof tab.url === 'string' ? tab.url.split(/[?#]/)[0].slice(0, 300) : '';
      const titel = typeof tab.title === 'string' ? tab.title.replace(/[\u0000-\u001f]/g, ' ').slice(0, 200) : '';
      const laatste = berichten[berichten.length - 1];
      if (url) laatste.content = `[Активна вкладка: ${url}${titel ? ` — «${titel}»` : ''}. Сторінку читай через take_snapshot; дій лише на цій вкладці.]\n${laatste.content}`.slice(0, 20_000);
      const uit = await runChat({ ...zijpaneelDeps(agent, deps.chatDeps ?? ZIJPANEEL_BASIS), model }, agent.user_id, berichten);
      if ('error' in uit) {
        await auditToevoegen({ ownerId: agent.user_id, actorId: null, action: 'owner.extensie.zijpaneel.chat', type: 'ai', result: 'failure', details: { agentId: agent.id, model, fout: uit.error } }).catch(() => undefined);
        if (uit.error === 'no_api_key') return error(WERKRUIMTE_FOUTEN.geenSleutel, 409);
        return error(aanbiederFout(uit.status), 502);
      }
      await auditToevoegen({ ownerId: agent.user_id, actorId: null, action: 'owner.extensie.zijpaneel.chat', type: 'ai', result: 'success', details: { agentId: agent.id, ruimte: ruimteOf(agent.ruimte), model, stappen: uit.steps.map((s) => s.tool) } }).catch(() => undefined);
      return json({ reply: uit.reply, steps: uit.steps.map((s) => ({ tool: s.tool, isError: s.isError })), ...(uit.truncated ? { truncated: true } : {}), model });
    }) as RouterMiddleware],
  };
}
