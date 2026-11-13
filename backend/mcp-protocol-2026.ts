// Серверна реалізація методів протоколу MCP 2026-07-28 та розширених можливостей 2025-11-25:
//   • server/discover (виявлення без стану за специфікацією 2026-07-28)
//   • resources/list, resources/templates/list, resources/read (ізольовані за користувачем та активним простором)
//   • prompts/list, prompts/get (двомовні шаблони запитів uk/nl)
//   • completion/complete (автодоповнення аргументів)
//   • subscriptions/listen та logging/setLevel
//
// Усі операції виконуються в межах уже перевіреного облікового запису користувача (userId) та живого простору (ruimte).

import { randomUUID } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import type { AiRuimte } from '../shared/ai-ruimte';
import { V2_AGENTEN, agentUrl, isAgentSlug, v2Agent, type AgentSlug } from '../shared/connector-v2/agenten';
import type { Kant } from '../shared/connector-v2/catalogus';
import {
  MCP_ALLE_VERSIES,
  MCP_EXTENSIES,
  MCP_LOG_NIVEAUS,
  MCP_PROMPTS,
  MCP_RPC_FOUTCODES,
  MCP_SDK_VOORBEELDEN,
  MCP_VAARDIGHEDEN,
  omhulModernResultaat,
  voltooiMcpArgument,
  type Taal,
} from '../shared/mcp-protocol-2026-model';
import { taalVanGebruiker } from './connectors-hulpmiddelen';
import { knipTekst, tekstVeilig } from '../shared/tekst-veilig';

export type McpProtocolContext = {
  userId: string;
  clientName: string;
  ruimte: AiRuimte;
  agent?: AgentSlug;
  kanten?: readonly Kant[];
  sleutelsAantal?: number;
  /**
   * SEC-002 (slot m, MR-1/MRG-06): mag deze verbinding de bronnen met accountgegevens zien (mr://identiteit/profiel, mr://status/overzicht)?
   * Alleen true als het recht «Хто я / tonen_mijn_account» (v2_whoami) is toegekend én geen site-schakelaar de verbinding stopt.
   * Ontbreekt = false: zonder uitdrukkelijk recht geen e-mail, naam of rol.
   */
  magProfiel?: boolean;
  /** Schrijft de weigering in het logboek (owner.mcp.tool denied, reden recht-uit); de aanroeper kent de verbinding. */
  meldWeigering?: (uri: string) => Promise<void> | void;
  instructions: string;
  modern: boolean;
  taal?: Taal;
};

async function taalVoorContext(ctx: McpProtocolContext, expliciet?: Taal): Promise<Taal> {
  if (expliciet === 'uk' || expliciet === 'nl') return expliciet;
  if (ctx.taal === 'uk' || ctx.taal === 'nl') return ctx.taal;
  try {
    return await taalVanGebruiker(ctx.userId);
  } catch {
    return 'uk';
  }
}

export type RpcUitkomst =
  | { soort: 'result'; result: Record<string, unknown> }
  | { soort: 'error'; code: number; message: string; data?: Record<string, unknown> }
  | null;

export function bouwCapabilitiesBlock() {
  return {
    tools: { listChanged: true },
    resources: { subscribe: true, listChanged: true },
    prompts: { listChanged: true },
    completions: {},
    logging: {},
    extensions: Object.fromEntries(MCP_EXTENSIES.map((e) => [e.id, { version: e.versie, status: e.status }])),
  };
}

export function bouwDiscoverResultaat(ctx: McpProtocolContext): Record<string, unknown> {
  const serverInfo = ctx.agent
    ? { name: `mijn-ruimte-${ctx.agent}`, title: `Mijn Ruimte · ${v2Agent(ctx.agent).naam}`, version: '2.0.0' }
    : { name: 'mijn-ruimte', title: 'Mijn Ruimte', version: '2.0.0' };
  return {
    resultType: 'complete',
    supportedVersions: [...MCP_ALLE_VERSIES],
    serverInfo,
    capabilities: bouwCapabilitiesBlock(),
    instructions: ctx.instructions,
    ttlMs: 300_000,
    cacheScope: 'private',
  };
}

/** SEC-002 (slot m): bronnen met accountgegevens — alleen met het recht v2_whoami (ctx.magProfiel). */
export const PROFIEL_BRONNEN: ReadonlySet<string> = new Set(['mr://identiteit/profiel', 'mr://status/overzicht']);

export async function lijstResourcesVoor(ctx: McpProtocolContext, taal?: Taal) {
  const t: Taal = await taalVoorContext(ctx, taal);
  const alles = [
    {
      uri: 'mr://identiteit/profiel',
      name: t === 'uk' ? 'Профіль і активний простір' : 'Profiel en actieve ruimte',
      description: t === 'uk'
        ? 'Відомості про поточний обліковий запис, роль і активний простір підключення (приватний або технічний).'
        : 'Gegevens over het huidige account, de rol en de actieve koppelingsruimte (privé of technisch).',
      mimeType: 'application/json',
    },
    {
      uri: 'mr://status/overzicht',
      name: t === 'uk' ? 'Стан підключення ШІ та дозволів' : 'Status van AI-koppeling en rechten',
      description: t === 'uk'
        ? 'Живий стан поточного конектора, активних сторін (gebruiker/beheer) і кількості наданих інструментів.'
        : 'Levende stand van de huidige connector, actieve kanten (gebruiker/beheer) en het aantal toegekende hulpmiddelen.',
      mimeType: 'application/json',
    },
    {
      uri: 'mr://protocol/spec-2026-07-28',
      name: t === 'uk' ? 'Паспорт підтримки MCP 2026-07-28 та OAuth 2.1' : 'Ondersteuningspaspoort MCP 2026-07-28 en OAuth 2.1',
      description: t === 'uk'
        ? 'Перелік підтримуваних версій протоколу, розширень, захистів Origin/CIMD/PKCE та кінцевих точок.'
        : 'Overzicht van ondersteunde protocolversies, extensies, Origin/CIMD/PKCE-waarborgen en eindpunten.',
      mimeType: 'application/json',
    },
    {
      uri: 'mr://skills/overzicht',
      name: t === 'uk' ? 'Каталог навичок агента (Skills over MCP)' : 'Catalogus van agentvaardigheden (Skills over MCP)',
      description: t === 'uk'
        ? 'Перелік усіх доступних навичок платформи Мій простір для ШІ-агентів.'
        : 'Lijst van alle beschikbare platformvaardigheden van Mijn Ruimte voor AI-agenten.',
      mimeType: 'application/json',
    },
    ...MCP_VAARDIGHEDEN.map((v) => ({
      uri: v.uri,
      name: v.titel[t],
      description: v.beschrijving[t],
      mimeType: 'text/markdown',
    })),
  ];
  const basis = ctx.magProfiel === true ? alles : alles.filter((r) => !PROFIEL_BRONNEN.has(r.uri));

  if (ctx.ruimte === 'technisch') {
    basis.push({
      uri: 'mr://uitrol/huidig',
      name: t === 'uk' ? 'Поточний випуск та основа оркестрації (технічний простір)' : 'Huidige uitrol en orkestratiebasis (technische ruimte)',
      description: t === 'uk'
        ? 'Відомості про поточний стан випусків і правила оркестрації (доступно лише за активного технічного профілю).'
        : 'Gegevens over de huidige uitrolstand en orkestratieregels (alleen beschikbaar met actief technisch profiel).',
      mimeType: 'application/json',
    });
  }

  return basis;
}

export async function lijstResourceSjablonenVoor(ctx: McpProtocolContext, taal?: Taal) {
  const t: Taal = await taalVoorContext(ctx, taal);
  return [
    {
      uriTemplate: 'mr://skills/{id}',
      name: t === 'uk' ? 'Навичка агента за ідентифікатором' : 'Agentvaardigheid op ID',
      description: t === 'uk'
        ? 'Прочитати повний текст навички агента (movnyi-zakon, mijn-ruimte-orch, mcp-beveiliging, mcp-inspector-recepten).'
        : 'Volledige tekst van een agentvaardigheid lezen (movnyi-zakon, mijn-ruimte-orch, mcp-beveiliging, mcp-inspector-recepten).',
      mimeType: 'text/markdown',
    },
    {
      uriTemplate: 'mr://sdk/{taal}/voorbeeld',
      name: t === 'uk' ? 'Шаблон сервера й клієнта MCP за мовою SDK' : 'MCP-server- en clientsjabloon per SDK-taal',
      description: t === 'uk'
        ? 'Отримати зразок коду створення сервера та клієнта MCP (typescript, python, go, rust).'
        : 'Voorbeeldcode ophalen voor het bouwen van een MCP-server en -client (typescript, python, go, rust).',
      mimeType: 'application/json',
    },
    {
      uriTemplate: 'mr://agent/{slug}/info',
      name: t === 'uk' ? 'Картка окремого конектора ШІ' : 'Kaart van een specifieke AI-connector',
      description: t === 'uk'
        ? 'Метадані кінцевої точки конкретного ШІ-агента (claude, gpt, gemini, grok, codex, copilot, cursor, antigravity, autoclaw).'
        : 'Metadata van het eindpunt van een specifieke AI-agent (claude, gpt, gemini, grok, codex, copilot, cursor, antigravity, autoclaw).',
      mimeType: 'application/json',
    },
  ];
}

export async function leesResourceVoor(
  ctx: McpProtocolContext,
  uri: string,
  taal?: Taal,
): Promise<{ ok: true; contents: Array<{ uri: string; mimeType: string; text: string }> } | { ok: false; message: string }> {
  const schoonUri = String(uri ?? '').trim();
  // SEC-002 (slot m, MR-1/MRG-06): accountgegevens alleen met het recht v2_whoami — net als tools/call van tonen_mijn_account.
  if (PROFIEL_BRONNEN.has(schoonUri) && ctx.magProfiel !== true) {
    try { await ctx.meldWeigering?.(schoonUri); } catch { /* het logboek mag de weigering niet breken */ }
    return { ok: false, message: `Недійсні параметри: немає дозволу на ресурс «${schoonUri}». Людина може ввімкнути «Хто я» для цього підключення на сторінці агента й перепідключити ШІ. · Ongeldige parameters: geen toestemming voor bron "${schoonUri}". De gebruiker kan «Wie ben ik» voor deze koppeling aanzetten op de agentpagina en de AI opnieuw verbinden.` };
  }
  const t: Taal = await taalVoorContext(ctx, taal);

  if (schoonUri === 'mr://identiteit/profiel') {
    const { rows } = await getPool('systeem')
      .query("SELECT data->>'email' AS email, data->>'name' AS name, data->>'role' AS role FROM app.records WHERE tbl = 'users' AND id = $1", [ctx.userId])
      .catch(() => ({ rows: [] as Array<{ email?: string; name?: string; role?: string }> }));
    const u = rows[0] ?? {};
    return {
      ok: true,
      contents: [{
        uri: schoonUri,
        mimeType: 'application/json',
        text: JSON.stringify({
          userId: ctx.userId,
          email: u.email ?? null,
          name: u.name ?? null,
          role: u.role ?? null,
          ruimte: ctx.ruimte,
          taal: t,
        }),
      }],
    };
  }

  if (schoonUri === 'mr://status/overzicht') {
    return {
      ok: true,
      contents: [{
        uri: schoonUri,
        mimeType: 'application/json',
        text: JSON.stringify({
          agent: ctx.agent ?? 'mcp',
          endpoint: ctx.agent ? agentUrl(ctx.agent) : 'https://mcp.tarasevych.com/mcp',
          clientName: ctx.clientName,
          actieveRuimte: ctx.ruimte,
          toegestaneKanten: ctx.kanten ?? (ctx.ruimte === 'technisch' ? ['beheer'] : ['gebruiker']),
          aantalSleutels: ctx.sleutelsAantal ?? 0,
          protocolVersies: MCP_ALLE_VERSIES,
        }),
      }],
    };
  }

  if (schoonUri === 'mr://protocol/spec-2026-07-28') {
    return {
      ok: true,
      contents: [{
        uri: schoonUri,
        mimeType: 'application/json',
        text: JSON.stringify({
          supportedVersions: MCP_ALLE_VERSIES,
          eras: {
            modern: '2026-07-28 (stateless _meta + server/discover)',
            legacy: '2025-11-25 / 2025-06-18 / 2025-03-26 (initialize)',
          },
          security: {
            originProtection: true,
            pkceS256Required: true,
            cimdSupported: true,
            cimdAntiSsrfLookup: true,
            rfc9207IssSupported: true,
            rfc8707ResourceBinding: true,
            rfc9728ProtectedResourceMetadata: true,
          },
          extensions: MCP_EXTENSIES.map((e) => ({ id: e.id, version: e.versie, status: e.status, sep: e.sep, title: e.titel[t] })),
        }),
      }],
    };
  }

  if (schoonUri === 'mr://skills/overzicht') {
    return {
      ok: true,
      contents: [{
        uri: schoonUri,
        mimeType: 'application/json',
        text: JSON.stringify({
          skills: MCP_VAARDIGHEDEN.map((v) => ({ id: v.id, uri: v.uri, title: v.titel[t], description: v.beschrijving[t] })),
        }),
      }],
    };
  }

  if (schoonUri.startsWith('mr://skills/')) {
    const id = schoonUri.slice('mr://skills/'.length).trim();
    const gevonden = MCP_VAARDIGHEDEN.find((v) => v.id === id);
    if (!gevonden) return { ok: false, message: `Недійсні параметри: невідома навичка «${knipTekst(tekstVeilig(schoonUri), 120)}» · Ongeldige parameters: onbekende vaardigheid "${knipTekst(tekstVeilig(schoonUri), 120)}"` };
    return {
      ok: true,
      contents: [{
        uri: gevonden.uri,
        mimeType: 'text/markdown',
        text: gevonden.inhoud[t],
      }],
    };
  }

  if (schoonUri.startsWith('mr://sdk/') && schoonUri.endsWith('/voorbeeld')) {
    const stuk = knipTekst(tekstVeilig(schoonUri.slice('mr://sdk/'.length, -'/voorbeeld'.length).trim().toLowerCase()), 40);
    const sdk = MCP_SDK_VOORBEELDEN.find((s) => s.taal === stuk);
    if (!sdk) return { ok: false, message: `Недійсні параметри: невідома мова SDK «${stuk}» · Ongeldige parameters: onbekende SDK-taal "${stuk}"` };
    return {
      ok: true,
      contents: [{
        uri: schoonUri,
        mimeType: 'application/json',
        text: JSON.stringify({
          language: sdk.taal,
          name: sdk.naam,
          package: sdk.pakket,
          repository: sdk.repoUrl,
          summary: sdk.samenvatting[t],
          serverTemplate: sdk.serverCode,
          clientTemplate: sdk.clientCode,
        }),
      }],
    };
  }

  if (schoonUri.startsWith('mr://agent/') && schoonUri.endsWith('/info')) {
    const slug = knipTekst(tekstVeilig(schoonUri.slice('mr://agent/'.length, -'/info'.length).trim()), 40);
    if (!isAgentSlug(slug)) return { ok: false, message: `Недійсні параметри: невідомий агент «${slug}» · Ongeldige parameters: onbekende agent "${slug}"` };
    const ag = v2Agent(slug);
    return {
      ok: true,
      contents: [{
        uri: schoonUri,
        mimeType: 'application/json',
        text: JSON.stringify({
          slug: ag.slug,
          name: ag.naam,
          endpoint: agentUrl(ag.slug),
          webHosts: ag.webHosts,
          appSchemas: ag.appSchemas,
        }),
      }],
    };
  }

  if (schoonUri === 'mr://uitrol/huidig') {
    if (ctx.ruimte !== 'technisch') {
      return { ok: false, message: 'Недійсні параметри: ресурс mr://uitrol/huidig потребує активного технічного простору · Ongeldige parameters: bron mr://uitrol/huidig vereist een actieve technische ruimte' };
    }
    return {
      ok: true,
      contents: [{
        uri: schoonUri,
        mimeType: 'application/json',
        text: JSON.stringify({
          ruimte: 'technisch',
          regelsVersie: '1.4.14',
          trace001Verplicht: true,
          installatieModus: 'na_bevestiging',
        }),
      }],
    };
  }

  return { ok: false, message: `Недійсні параметри: ресурс не знайдено «${knipTekst(tekstVeilig(schoonUri), 120)}» · Ongeldige parameters: bron niet gevonden "${knipTekst(tekstVeilig(schoonUri), 120)}"` };
}

export async function lijstPromptsVoor(ctx: McpProtocolContext, taal?: Taal) {
  const t: Taal = await taalVoorContext(ctx, taal);
  return MCP_PROMPTS.map((p) => ({
    name: p.name,
    title: p.title[t],
    description: p.description[t],
    arguments: p.arguments.map((a) => ({
      name: a.name,
      required: a.required,
      description: a.description[t],
    })),
  }));
}

export async function leesPromptVoor(
  ctx: McpProtocolContext,
  naam: string,
  rawArgs: Record<string, unknown> | undefined,
  taal?: Taal,
): Promise<{ ok: true; description: string; messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }> } | { ok: false; message: string }> {
  const prompt = MCP_PROMPTS.find((p) => p.name === String(naam ?? '').trim());
  if (!prompt) return { ok: false, message: `Недійсні параметри: невідомий шаблон запиту «${String(naam ?? '').slice(0, 80)}» · Ongeldige parameters: onbekende prompt "${String(naam ?? '').slice(0, 80)}"` };
  const t: Taal = await taalVoorContext(ctx, taal);
  const args: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawArgs ?? {})) {
    if (v !== undefined && v !== null) args[k] = String(v).slice(0, 400);
  }
  for (const reqArg of prompt.arguments) {
    if (reqArg.required && !args[reqArg.name]?.trim()) {
      return { ok: false, message: `Недійсні параметри: бракує обов’язкового аргументу «${reqArg.name}» · Ongeldige parameters: verplicht argument "${reqArg.name}" ontbreekt` };
    }
  }
  return {
    ok: true,
    description: prompt.description[t],
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: prompt.bouwTekst(args, t),
        },
      },
    ],
  };
}

/**
 * Єдиний обробник нових методів MCP (2026-07-28 та 2025-11-25) для обох конекторів (/mcp та /<agent>).
 * Повертає null, якщо метод не належить до цього розширеного набору (наприклад initialize, ping, tools/list, tools/call).
 */
export async function behandelMcpProtocolMethode(
  ctx: McpProtocolContext,
  methode: string,
  params: Record<string, unknown> | undefined,
): Promise<RpcUitkomst> {
  const p = params && typeof params === 'object' ? params : {};

  switch (methode) {
    case 'server/discover': {
      return { soort: 'result', result: bouwDiscoverResultaat(ctx) };
    }
    case 'resources/list': {
      const resources = await lijstResourcesVoor(ctx);
      return {
        soort: 'result',
        result: omhulModernResultaat({ resources }, ctx.modern, { metCache: true, ttlMs: 60_000 }),
      };
    }
    case 'resources/templates/list': {
      const resourceTemplates = await lijstResourceSjablonenVoor(ctx);
      return {
        soort: 'result',
        result: omhulModernResultaat({ resourceTemplates }, ctx.modern, { metCache: true, ttlMs: 120_000 }),
      };
    }
    case 'resources/read': {
      const uri = typeof p.uri === 'string' ? p.uri.trim() : '';
      if (!uri) {
        return { soort: 'error', code: MCP_RPC_FOUTCODES.ongeldigeParams, message: 'uri ontbreekt' };
      }
      const gelezen = await leesResourceVoor(ctx, uri);
      if (!gelezen.ok) {
        return { soort: 'error', code: MCP_RPC_FOUTCODES.ongeldigeParams, message: gelezen.message };
      }
      return {
        soort: 'result',
        result: omhulModernResultaat({ contents: gelezen.contents }, ctx.modern, { metCache: true, ttlMs: 30_000 }),
      };
    }
    case 'resources/subscribe':
    case 'resources/unsubscribe': {
      const uri = typeof p.uri === 'string' ? p.uri.trim() : '';
      if (!uri) {
        return { soort: 'error', code: MCP_RPC_FOUTCODES.ongeldigeParams, message: 'uri ontbreekt' };
      }
      return {
        soort: 'result',
        result: omhulModernResultaat({}, ctx.modern),
      };
    }
    case 'prompts/list': {
      const prompts = await lijstPromptsVoor(ctx);
      return {
        soort: 'result',
        result: omhulModernResultaat({ prompts }, ctx.modern, { metCache: true, ttlMs: 120_000 }),
      };
    }
    case 'prompts/get': {
      const name = typeof p.name === 'string' ? p.name.trim() : '';
      if (!name) {
        return { soort: 'error', code: MCP_RPC_FOUTCODES.ongeldigeParams, message: 'name ontbreekt' };
      }
      const args = (p.arguments && typeof p.arguments === 'object' && !Array.isArray(p.arguments))
        ? (p.arguments as Record<string, unknown>)
        : {};
      const uit = await leesPromptVoor(ctx, name, args);
      if (!uit.ok) {
        return { soort: 'error', code: MCP_RPC_FOUTCODES.ongeldigeParams, message: uit.message };
      }
      return {
        soort: 'result',
        result: omhulModernResultaat({ description: uit.description, messages: uit.messages }, ctx.modern),
      };
    }
    case 'completion/complete': {
      const ref = (p.ref && typeof p.ref === 'object') ? (p.ref as { type?: string; name?: string; uri?: string }) : undefined;
      const arg = (p.argument && typeof p.argument === 'object') ? (p.argument as { name?: string; value?: string }) : undefined;
      if (!arg || typeof arg.name !== 'string') {
        return { soort: 'error', code: MCP_RPC_FOUTCODES.ongeldigeParams, message: 'argument.name ontbreekt' };
      }
      const completion = voltooiMcpArgument(ref, arg);
      return {
        soort: 'result',
        result: omhulModernResultaat({ completion }, ctx.modern),
      };
    }
    case 'subscriptions/listen': {
      const subscriptionId = `sub_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      return {
        soort: 'result',
        result: omhulModernResultaat({
          subscriptionId,
          acknowledged: true,
          notification: 'notifications/subscriptions/acknowledged',
          topics: ['notifications/tools/list_changed', 'notifications/resources/list_changed', 'notifications/prompts/list_changed'],
        }, ctx.modern),
      };
    }
    case 'logging/setLevel': {
      const level = typeof p.level === 'string' ? p.level.trim() : '';
      if (!(MCP_LOG_NIVEAUS as readonly string[]).includes(level)) {
        return { soort: 'error', code: MCP_RPC_FOUTCODES.ongeldigeParams, message: `Недійсний рівень журналювання · Ongeldig logniveau: ${knipTekst(tekstVeilig(level), 40)}` };
      }
      return {
        soort: 'result',
        result: omhulModernResultaat({ level }, ctx.modern),
      };
    }
    default:
      return null;
  }
}
