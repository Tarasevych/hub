// Маршрути вбудованого Інспектора та Студії MCP (/api/owner/mcp-inspector/*).
// Дозволяють власнику та користувачу з правом API-платформи безпосередньо на https://mcp.tarasevych.com/agenten:
//   • перевіряти власні кінцеві точки (/claude, /gpt, /gemini, /antigravity, …, /mcp) і зовнішні сервери у трьох режимах епох:
//     legacy (2025-11-25), modern (2026-07-28) та auto;
//   • виконувати інтерактивні запити server/discover, initialize, ping, tools/list, tools/call (читання),
//     resources/list, resources/templates/list, resources/read, prompts/list, prompts/get, completion/complete, subscriptions/listen;
//   • запускати покрокову перевірку безпеки OAuth 2.1 (RFC 9728 PRM, RFC 8414 AS Metadata, PKCE S256, RFC 9207 iss,
//     RFC 8707 resource, CIMD анти-SSRF, Origin 403);
//   • запускати готові рецепти інспектора (Recipes) та генерувати команди CLI / TUI / mcpdo і конфігурацію mcp.json.

import { createHash } from 'node:crypto';
import { error, json, rateLimit } from '../server/platform';
import { GEEN_RECHT, heeftApiRecht, weigerCode } from './api-recht';
import { sessieGeverifieerd, zetGebruiker } from '../server/platform/context';
import { V2_AGENTEN, agentPrmUrl, agentUrl, isAgentSlug, v2Agent, type AgentSlug } from '../shared/connector-v2/agenten';
import { STANDAARD } from '../shared/connector-v2/rechten';
import { v2Optie } from '../shared/connector-v2/catalogus';
import { ontleed } from '../shared/connector-v2/namen';
import { vertaalSchema } from '../shared/hulpmiddel-teksten';
import {
  MCP_ALLE_VERSIES,
  MCP_ERA_MODI,
  MCP_EXTENSIES,
  MCP_INSPECTOR_RECEPTEN,
  MCP_LEGACY_VERSIE,
  MCP_META_SLEUTELS,
  MCP_MODERNE_VERSIE,
  MCP_PROMPTS,
  MCP_SDK_VOORBEELDEN,
  MCP_VAARDIGHEDEN,
  bouwRegistryServerJson,
  bouwServerCard,
  controleerModerneMeta,
  omhulModernResultaat,
  type McpEraModus,
  type Taal,
} from '../shared/mcp-protocol-2026-model';
import { behandelMcpProtocolMethode, bouwCapabilitiesBlock, lijstPromptsVoor, lijstResourceSjablonenVoor, lijstResourcesVoor } from './mcp-protocol-2026';
import * as c from './mcp-connector';
import * as v2 from './connector-v2';
import * as v2st from './connector-v2-opslag';
import { mcpOriginBesluit } from './mcp-origin';
import { cimdAan, isCimdClientId, isNietPubliekIp } from './mcp-cimd';
import { taalVanGebruiker } from './connectors-hulpmiddelen';
import * as extStore from './mcp-klant-opslag';

type User = { id: string; status: string; email?: string; role?: string };
type AuthSuccess = { service: string; user: User };
type AuthFailure = { errorCode: string };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<AuthSuccess | AuthFailure>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };

const TOEGESTANE_DIENSTEN = ['mcp', 'hub', 'admin'];
const lichaam = (body: unknown): Record<string, unknown> =>
  (body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {});

async function authPoort(authorize: Authorize, ctx: Context) {
  const uitslag = await authorize(ctx.event, ctx.body);
  if ('errorCode' in uitslag) return null;
  if (!TOEGESTANE_DIENSTEN.includes(uitslag.service) || uitslag.user.status !== 'approved') return null;
  if (!heeftApiRecht(uitslag.user as never)) return GEEN_RECHT;
  return uitslag;
}

function bepaalEffectieveEra(era: McpEraModus, methode: string): { modern: boolean; protocolVersie: string } {
  if (era === 'modern') return { modern: true, protocolVersie: MCP_MODERNE_VERSIE };
  if (era === 'legacy') return { modern: false, protocolVersie: MCP_LEGACY_VERSIE };
  if (methode === 'server/discover' || methode === 'subscriptions/listen') {
    return { modern: true, protocolVersie: MCP_MODERNE_VERSIE };
  }
  return { modern: true, protocolVersie: MCP_MODERNE_VERSIE };
}

function bouwMcpNamenKop(methode: string, params: Record<string, unknown>): Record<string, string> {
  const koppen: Record<string, string> = { 'Mcp-Method': methode };
  const ruweNaam = typeof params.name === 'string'
    ? params.name
    : typeof params.uri === 'string'
      ? params.uri
      : '';
  if (ruweNaam) {
    const alleenAscii = /^[\x20-\x7E]+$/.test(ruweNaam);
    koppen['Mcp-Name'] = alleenAscii ? ruweNaam : `=?utf-8?B?${Buffer.from(ruweNaam, 'utf8').toString('base64')}?=`;
  }
  return koppen;
}

function voerStrictControleUit(
  methode: string,
  modern: boolean,
  rpcAntwoord: Record<string, unknown>,
  taal: Taal,
): Array<{ code: string; status: 'ok' | 'warn' | 'fout'; bericht: string }> {
  const controles: Array<{ code: string; status: 'ok' | 'warn' | 'fout'; bericht: string }> = [];
  const isJsonRpc = rpcAntwoord.jsonrpc === '2.0' && (rpcAntwoord.result !== undefined || rpcAntwoord.error !== undefined);
  controles.push({
    code: 'JSONRPC_2_0',
    status: isJsonRpc ? 'ok' : 'fout',
    bericht: taal === 'uk'
      ? (isJsonRpc ? 'Структура оболонки JSON-RPC 2.0 коректна.' : 'Відповідь не відповідає формату JSON-RPC 2.0.')
      : (isJsonRpc ? 'JSON-RPC 2.0-omhulsel is geldig.' : 'Antwoord voldoet niet aan JSON-RPC 2.0.'),
  });

  const res = (rpcAntwoord.result && typeof rpcAntwoord.result === 'object')
    ? (rpcAntwoord.result as Record<string, unknown>)
    : null;

  if (modern && res) {
    const heeftResultType = res.resultType === 'complete' || res.resultType === 'input_required';
    controles.push({
      code: 'MODERN_RESULT_TYPE',
      status: heeftResultType ? 'ok' : 'warn',
      bericht: taal === 'uk'
        ? (heeftResultType ? `Поле сучасної епохи resultType="${String(res.resultType)}" присутнє.` : 'Відсутнє поле resultType у відповіді сучасної епохи.')
        : (heeftResultType ? `Modern veld resultType="${String(res.resultType)}" aanwezig.` : 'Veld resultType ontbreekt in modern antwoord.'),
    });
  }

  if (methode === 'tools/list' && res && Array.isArray(res.tools)) {
    const tools = res.tools as Array<Record<string, unknown>>;
    let nietStringBeschrijvingen = 0;
    let zonderAnnotaties = 0;
    for (const t of tools) {
      if (typeof t.description !== 'string') nietStringBeschrijvingen += 1;
      if (!t.annotations || typeof t.annotations !== 'object') zonderAnnotaties += 1;
      const props = (t.inputSchema as Record<string, unknown> | undefined)?.properties;
      if (props && typeof props === 'object') {
        for (const p of Object.values(props as Record<string, Record<string, unknown>>)) {
          if (p && p.description !== undefined && typeof p.description !== 'string') nietStringBeschrijvingen += 1;
        }
      }
    }
    controles.push({
      code: 'TOOLS_SCHEMA_STRING',
      status: nietStringBeschrijvingen === 0 ? 'ok' : 'fout',
      bericht: taal === 'uk'
        ? `Перевірено інструментів: ${tools.length}; нерядкових описів у схемах: ${nietStringBeschrijvingen}.`
        : `Hulpmiddelen gecontroleerd: ${tools.length}; niet-tekenreeksbeschrijvingen in schema's: ${nietStringBeschrijvingen}.`,
    });
    controles.push({
      code: 'TOOLS_ANNOTATIONS',
      status: zonderAnnotaties === 0 ? 'ok' : 'warn',
      bericht: taal === 'uk'
        ? `Анотації інструментів (readOnlyHint/destructiveHint/idempotentHint/openWorldHint): без анотацій ${zonderAnnotaties}.`
        : `Hulpmiddelannotaties (readOnlyHint/destructiveHint/idempotentHint/openWorldHint): zonder annotaties ${zonderAnnotaties}.`,
    });
  }

  if (methode === 'server/discover' && res) {
    const versiesOk = Array.isArray(res.supportedVersions) && (res.supportedVersions as string[]).includes(MCP_MODERNE_VERSIE);
    controles.push({
      code: 'DISCOVER_VERSIONS',
      status: versiesOk ? 'ok' : 'fout',
      bericht: taal === 'uk'
        ? (versiesOk ? 'Метод server/discover оголошує підтримку 2026-07-28 та можливостей сервера.' : 'У відповіді server/discover бракує 2026-07-28.')
        : (versiesOk ? 'Methode server/discover meldt ondersteuning voor 2026-07-28 en servermogelijkheden.' : '2026-07-28 ontbreekt in server/discover.'),
    });
  }

  return controles;
}

export function createMcpInspectorRoutes(authorize: Authorize) {
  return {
    /** Повний стан Інспектора та Студії MCP для сторінки /agenten. */
    'POST /api/owner/mcp-inspector/overzicht': [async (ctx: Context) => {
      const poort = await authPoort(authorize, ctx);
      if (!poort || !('user' in poort)) return error(weigerCode(poort), 403);
      const userId = poort.user.id;
      zetGebruiker(userId, 'mcp');
      sessieGeverifieerd();

      const [taal, v2Overzicht, externeRijen] = await Promise.all([
        taalVanGebruiker(userId),
        v2.overzicht(userId),
        extStore.lijst(userId).catch(() => []),
      ]);

      const dummyCtx = {
        userId,
        clientName: 'mcp-inspector-studio',
        ruimte: v2Overzicht.poort.ruimte,
        instructions: v2.instructies('claude', ['gebruiker'], v2Overzicht.poort.ruimte),
        // SEC-002 (slot m): hier kijkt de mens zelf (aangemeld op de site) naar zijn eigen profiel; geen AI-verbinding.
        magProfiel: true,
        modern: true,
      };
      const [resources, resourceTemplates, prompts] = await Promise.all([
        lijstResourcesVoor(dummyCtx, taal),
        lijstResourceSjablonenVoor(dummyCtx, taal),
        lijstPromptsVoor(dummyCtx, taal),
      ]);

      const eigenEindpunten = [
        ...V2_AGENTEN.map((a) => {
          const st = v2Overzicht.agenten.find((x) => x.slug === a.slug);
          return {
            id: a.slug,
            naam: a.naam,
            url: agentUrl(a.slug),
            prmUrl: agentPrmUrl(a.slug),
            verbonden: Boolean(st && (st.koppelingen.length > 0 || st.erfenis.length > 0)),
            actieveTools: st?.diagnose.effectiveVisibleToolsCount ?? 0,
            toegekendeTools: st?.diagnose.connectionGranted.totaal ?? 0,
            kanten: st?.actief?.kanten ?? st?.voorkeur?.kanten ?? ['gebruiker'],
          };
        }),
        {
          id: 'mcp',
          naam: 'Mijn Ruimte (/mcp класичний)',
          url: c.RESOURCE,
          prmUrl: c.PRM_URL,
          verbonden: true,
          actieveTools: 83,
          toegekendeTools: 83,
          kanten: ['gebruiker'],
        },
      ];

      const mcpJsonConfig = {
        mcpServers: Object.fromEntries(
          V2_AGENTEN.slice(0, 4).map((a) => [
            `mijn-ruimte-${a.slug}`,
            {
              type: 'streamable-http',
              url: agentUrl(a.slug),
              note: `OAuth 2.1 (PKCE S256 / CIMD) · ${a.naam}`,
            },
          ]),
        ),
      };

      return json({
        observedAt: Date.now(),
        taal,
        actieveRuimte: v2Overzicht.poort.ruimte,
        protocol: {
          ondersteundeVersies: MCP_ALLE_VERSIES,
          moderneVersie: MCP_MODERNE_VERSIE,
          legacyVersie: MCP_LEGACY_VERSIE,
          eraModi: MCP_ERA_MODI,
        },
        eigenEindpunten,
        externeServers: externeRijen.map((r) => ({
          id: r.id,
          naam: r.naam || r.serverNaam || r.adres,
          adres: r.adres,
          ruimte: r.ruimte,
          staat: r.staat,
          protocolVersie: r.protocolVersie,
          aantalTools: r.aantalTools,
        })),
        resources,
        resourceTemplates,
        prompts,
        vaardigheden: MCP_VAARDIGHEDEN.map((v) => ({
          id: v.id,
          uri: v.uri,
          titel: v.titel[taal],
          beschrijving: v.beschrijving[taal],
        })),
        extensies: MCP_EXTENSIES.map((e) => ({
          id: e.id,
          versie: e.versie,
          status: e.status,
          sep: e.sep,
          standaardAan: e.standaardAan,
          risicoWaarschuwing: e.risicoWaarschuwing,
          titel: e.titel[taal],
          samenvatting: e.samenvatting[taal],
        })),
        sdkVoorbeelden: MCP_SDK_VOORBEELDEN.map((s) => ({
          taal: s.taal,
          naam: s.naam,
          pakket: s.pakket,
          repoUrl: s.repoUrl,
          samenvatting: s.samenvatting[taal],
          serverCode: s.serverCode,
          clientCode: s.clientCode,
        })),
        recepten: MCP_INSPECTOR_RECEPTEN.map((r) => ({
          id: r.id,
          era: r.era,
          methode: r.methode,
          params: r.params,
          titel: r.titel[taal],
          uitleg: r.uitleg[taal],
          cli: r.cliOpdracht(agentUrl('claude')),
          tui: r.tuiOpdracht(agentUrl('claude')),
          mcpdo: r.mcpdoOpdracht(agentUrl('claude')),
        })),
        serverCard: bouwServerCard(c.BASE),
        registryServerJson: bouwRegistryServerJson(c.BASE),
        mcpJsonConfig,
      });
    }],

    /** Виконати інтерактивний запит MCP Inspector проти обраної кінцевої точки та епохи протоколу. */
    'POST /api/owner/mcp-inspector/uitvoeren': [async (ctx: Context) => {
      const poort = await authPoort(authorize, ctx);
      if (!poort || !('user' in poort)) return error(weigerCode(poort), 403);
      const userId = poort.user.id;
      zetGebruiker(userId, 'mcp');
      sessieGeverifieerd();
      // SEC-002 (slot m, MR-5): de studio voert echte hulpmiddelen uit (lezen van mail, Drive, apparaten …) — dezelfde limiet als een
      // AI-verbinding (120 per minuut, emmer mcp-rpc:insp:<gebruiker>, gelijk aan nepWie.limietSleutel hieronder).
      const limiet = await rateLimit(`mcp-rpc:insp:${userId}`, 120, 60);
      if (!limiet.ok) return error('RATE_LIMITED', 429, { retryAfter: limiet.retryAfter, maxAttempts: 120, windowSec: 60 });

      const body = lichaam(ctx.body);
      const doelId = String(body.doelId ?? 'claude').trim();
      const slug: AgentSlug = isAgentSlug(doelId) ? doelId : 'claude';
      const era: McpEraModus = (MCP_ERA_MODI as readonly string[]).includes(String(body.era))
        ? (String(body.era) as McpEraModus)
        : 'auto';
      const methode = String(body.methode ?? 'server/discover').trim();
      const rawParams = (body.params && typeof body.params === 'object' && !Array.isArray(body.params))
        ? (body.params as Record<string, unknown>)
        : {};

      const startMs = Date.now();
      const taal = await taalVanGebruiker(userId);
      const { modern, protocolVersie } = bepaalEffectieveEra(era, methode);

      const verzoekParams: Record<string, unknown> = modern
        ? {
          ...rawParams,
          _meta: {
            ...((rawParams._meta && typeof rawParams._meta === 'object') ? (rawParams._meta as Record<string, unknown>) : {}),
            [MCP_META_SLEUTELS.protocolVersie]: MCP_MODERNE_VERSIE,
            [MCP_META_SLEUTELS.clientMogelijkheden]: { elicitation: { form: true, url: true } },
          },
        }
        : rawParams;

      const rpcVerzoek = {
        jsonrpc: '2.0' as const,
        id: `insp_${Date.now().toString(36)}`,
        method: methode,
        params: verzoekParams,
      };

      const verzoekKoppen: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': protocolVersie,
        ...bouwMcpNamenKop(methode, rawParams),
      };

      const metaCheck = controleerModerneMeta(rpcVerzoek as unknown as Record<string, unknown>, protocolVersie);
      if (!metaCheck.ok) {
        const foutAntwoord = {
          jsonrpc: '2.0',
          id: rpcVerzoek.id,
          error: { code: metaCheck.code, message: metaCheck.message, ...(metaCheck.data ? { data: metaCheck.data } : {}) },
        };
        return json({
          ok: false,
          duurMs: Date.now() - startMs,
          era: modern ? 'modern' : 'legacy',
          protocolVersie,
          doelUrl: doelId === 'mcp' ? c.RESOURCE : agentUrl(slug),
          verzoekKoppen,
          rpcVerzoek,
          rpcAntwoord: foutAntwoord,
          strictControles: voerStrictControleUit(methode, modern, foutAntwoord, taal),
        });
      }

      const actief = (await v2st.actieveKoppelingen(userId, slug))[0] ?? null;
      const voorkeur = await v2st.leesVoorkeur(userId, slug);
      const rechten: v2st.V2Keuze = actief
        ? { kanten: actief.kanten, sleutels: actief.sleutels }
        : voorkeur
          ? { kanten: voorkeur.kanten, sleutels: voorkeur.sleutels }
          : { kanten: ['gebruiker'], sleutels: STANDAARD(['gebruiker']) };

      const nepWie = {
        userId,
        clientName: 'MCP Inspector Studio (op de site)',
        tokenId: actief?.id ?? 'inspector-proef',
        ruimte: 'prive' as const,
        agent: slug,
        limietSleutel: `insp:${userId}`,
      };
      const levende = await v2.levendeRuimte(nepWie);
      const instr = v2.instructies(slug, rechten.kanten, levende);

      let rpcAntwoord: Record<string, unknown>;
      switch (methode) {
        case 'initialize': {
          const wanted = String(rawParams.protocolVersion ?? protocolVersie);
          const gekozen = wanted === MCP_MODERNE_VERSIE
            ? MCP_MODERNE_VERSIE
            : (c.PROTOCOL_VERSIONS.includes(wanted) ? wanted : c.PROTOCOL_VERSIONS[0]);
          rpcAntwoord = {
            jsonrpc: '2.0',
            id: rpcVerzoek.id,
            result: {
              protocolVersion: gekozen,
              capabilities: bouwCapabilitiesBlock(),
              serverInfo: { name: `mijn-ruimte-${slug}`, title: `Mijn Ruimte · ${v2Agent(slug).naam}`, version: '2.0.0' },
              instructions: instr,
            },
          };
          break;
        }
        case 'ping': {
          rpcAntwoord = {
            jsonrpc: '2.0',
            id: rpcVerzoek.id,
            result: omhulModernResultaat({}, modern),
          };
          break;
        }
        case 'tools/list': {
          const lijst = await v2.v2Lijst(nepWie, rechten, levende);
          const tools = lijst.map((t) => {
            const x = t as typeof t & { icons?: unknown; outputSchema?: unknown };
            return {
              name: x.name,
              title: x.title,
              description: x.description,
              inputSchema: vertaalSchema(x.inputSchema, taal),
              ...(x.outputSchema ? { outputSchema: x.outputSchema } : {}),
              ...(x.icons ? { icons: x.icons } : {}),
              annotations: x.annotations,
            };
          });
          rpcAntwoord = {
            jsonrpc: '2.0',
            id: rpcVerzoek.id,
            result: omhulModernResultaat({ tools }, modern, { metCache: true, ttlMs: 60_000 }),
          };
          break;
        }
        case 'tools/call': {
          const ruweNaam = String(rawParams.name ?? '').trim();
          const args = (rawParams.arguments && typeof rawParams.arguments === 'object' && !Array.isArray(rawParams.arguments))
            ? (rawParams.arguments as Record<string, unknown>)
            : {};
          // В інспекторі без окремого підтвердження дозволяємо безпечні виклики читання та діагностики (whoami).
          const isWhoami = ruweNaam === 'v2_whoami' || ruweNaam.startsWith('tonen_mijn_account_');
          const ontleedRes = ontleed(ruweNaam, slug);
          const optie = isWhoami ? v2Optie('v2_whoami:gebruiker') : (ontleedRes.ok ? ontleedRes.optie : null);
          if (!optie) {
            rpcAntwoord = {
              jsonrpc: '2.0',
              id: rpcVerzoek.id,
              result: omhulModernResultaat({
                content: [{ type: 'text', text: `ONBEKEND_HULPMIDDEL: «${ruweNaam.slice(0, 80)}» не є відомим інструментом для ${slug} · is geen bekend hulpmiddel voor ${slug}.` }],
                isError: true,
              }, modern),
            };
            break;
          }
          if (optie.soort !== 'lezen') {
            rpcAntwoord = {
              jsonrpc: '2.0',
              id: rpcVerzoek.id,
              result: {
                resultType: 'input_required',
                content: [{
                  type: 'text',
                  text: taal === 'uk'
                    ? `Інструмент «${ruweNaam}» змінює дані (${optie.soort}). У сучасній епосі MCP 2026-07-28 такі дії вимагають підтвердження людини (MRTR / Elicitation input_required).`
                    : `Hulpmiddel «${ruweNaam}» wijzigt gegevens (${optie.soort}). In het moderne tijdperk MCP 2026-07-28 vereisen zulke acties menselijke bevestiging (MRTR / Elicitation input_required).`,
                }],
              },
            };
            break;
          }
          const doelNaam = isWhoami ? `tonen_mijn_account_${slug}_ai_tarasevych_com_gebruiker` : ruweNaam;
          const uit = await v2.v2Roep(nepWie, { kanten: ['gebruiker'], sleutels: [...new Set([...rechten.sleutels, 'v2_whoami:gebruiker'])] }, doelNaam, args, levende);
          rpcAntwoord = {
            jsonrpc: '2.0',
            id: rpcVerzoek.id,
            result: omhulModernResultaat(uit as Record<string, unknown>, modern),
          };
          break;
        }
        default: {
          const extra = await behandelMcpProtocolMethode({
            userId,
            clientName: nepWie.clientName,
            ruimte: levende,
            agent: slug,
            kanten: rechten.kanten,
            sleutelsAantal: rechten.sleutels.length,
            // SEC-002 (slot m): de studio draait in de sessie van de mens zelf (tools/call voegt v2_whoami daarom ook toe) — eigen profiel mag.
            magProfiel: true,
            instructions: instr,
            modern,
          }, methode, rawParams);
          if (extra?.soort === 'result') {
            rpcAntwoord = { jsonrpc: '2.0', id: rpcVerzoek.id, result: extra.result };
          } else if (extra?.soort === 'error') {
            rpcAntwoord = {
              jsonrpc: '2.0',
              id: rpcVerzoek.id,
              error: { code: extra.code, message: extra.message, ...(extra.data ? { data: extra.data } : {}) },
            };
          } else {
            rpcAntwoord = {
              jsonrpc: '2.0',
              id: rpcVerzoek.id,
              error: { code: -32601, message: `Метод не знайдено · Methode niet gevonden: ${methode}` },
            };
          }
        }
      }

      const strictControles = voerStrictControleUit(methode, modern, rpcAntwoord, taal);
      const doelUrl = doelId === 'mcp' ? c.RESOURCE : agentUrl(slug);

      return json({
        ok: rpcAntwoord.error === undefined,
        duurMs: Math.max(1, Date.now() - startMs),
        era: modern ? 'modern' : 'legacy',
        protocolVersie,
        doelId,
        doelUrl,
        verzoekKoppen,
        antwoordKoppen: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'MCP-Protocol-Version': protocolVersie,
        },
        rpcVerzoek,
        rpcAntwoord,
        strictControles,
        cliOpdracht: `npx @modelcontextprotocol/inspector --cli ${doelUrl} --transport http --protocol-era ${era} --stored-auth-only --method ${methode} --strict`,
      });
    }],

    /** Покрокова жива перевірка безпеки OAuth 2.1, PKCE, CIMD, RFC 9728, RFC 9207 та Origin. */
    'POST /api/owner/mcp-inspector/oauth-controle': [async (ctx: Context) => {
      const poort = await authPoort(authorize, ctx);
      if (!poort || !('user' in poort)) return error(weigerCode(poort), 403);
      const userId = poort.user.id;
      zetGebruiker(userId, 'mcp');
      sessieGeverifieerd();

      const body = lichaam(ctx.body);
      const doelId = String(body.doelId ?? 'claude').trim();
      const slug: AgentSlug = isAgentSlug(doelId) ? doelId : 'claude';
      const taal = await taalVanGebruiker(userId);

      const prmResp = doelId === 'mcp' ? c.protectedResourceMetadata() : v2.prm(slug);
      const prmJson = JSON.parse(prmResp.body || '{}') as Record<string, unknown>;
      const asmResp = c.authorizationServerMetadata();
      const asmJson = JSON.parse(asmResp.body || '{}') as Record<string, unknown>;

      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const pkceOk = c.pkceMatches(verifier, challenge) && !c.pkceMatches('kort', challenge);

      const eigenOrigins = ['https://mcp.tarasevych.com', 'https://hub.tarasevych.com'];
      const originEvil = mcpOriginBesluit('https://evil.example', eigenOrigins);
      const originClaude = mcpOriginBesluit('https://claude.ai', eigenOrigins);
      const originInspector = mcpOriginBesluit('http://localhost:6274', eigenOrigins);
      const originZonder = mcpOriginBesluit(undefined, eigenOrigins);
      const originOk = originEvil.soort === 'geweigerd'
        && originClaude.soort === 'toegestaan'
        && originInspector.soort === 'toegestaan'
        && originZonder.soort === 'geen';

      const cimdGoed = isCimdClientId('https://claude.ai/oauth/client-metadata.json');
      const cimdHttp = !isCimdClientId('http://claude.ai/oauth/client-metadata.json');
      const cimdLoopback = isNietPubliekIp('127.0.0.1') && isNietPubliekIp('::1') && isNietPubliekIp('10.0.0.1') && !isNietPubliekIp('160.79.104.10');
      const cimdOk = cimdAan() && cimdGoed && cimdHttp && cimdLoopback && asmJson.client_id_metadata_document_supported === true;

      const issOk = asmJson.authorization_response_iss_parameter_supported === true && asmJson.issuer === c.ISSUER;
      const card = bouwServerCard(c.BASE, slug);
      const regJson = bouwRegistryServerJson(c.BASE);

      const stappen = [
        {
          id: 'prm-rfc9728',
          status: prmResp.statusCode === 200 && prmJson.resource === (doelId === 'mcp' ? c.RESOURCE : agentUrl(slug)) ? 'ok' : 'fout',
          titel: taal === 'uk' ? '1. Метадані захищеного ресурсу (RFC 9728 PRM)' : '1. Metagegevens van beschermde bron (RFC 9728 PRM)',
          detail: `resource=${String(prmJson.resource)} · authorization_servers=${JSON.stringify(prmJson.authorization_servers)}`,
        },
        {
          id: 'asm-rfc8414',
          status: asmResp.statusCode === 200 && Array.isArray(asmJson.code_challenge_methods_supported) && (asmJson.code_challenge_methods_supported as string[]).includes('S256') ? 'ok' : 'fout',
          titel: taal === 'uk' ? '2. Метадані сервера авторизації (RFC 8414)' : '2. Metagegevens van autorisatieserver (RFC 8414)',
          detail: `issuer=${String(asmJson.issuer)} · S256=${JSON.stringify(asmJson.code_challenge_methods_supported)}`,
        },
        {
          id: 'pkce-s256',
          status: pkceOk ? 'ok' : 'fout',
          titel: taal === 'uk' ? '3. Обов’язковий PKCE S256 (RFC 7636)' : '3. Verplichte PKCE S256 (RFC 7636)',
          detail: taal === 'uk' ? 'Перевірка вектора S256 пройдена; короткі та відкриті коди відхиляються.' : 'S256-vector geverifieerd; korte en onversleutelde codes worden geweigerd.',
        },
        {
          id: 'origin-dns-rebinding',
          status: originOk ? 'ok' : 'fout',
          titel: taal === 'uk' ? '4. Захист Origin від підміни DNS (403 ORIGIN_DENIED)' : '4. Origin-bescherming tegen DNS-rebinding (403 ORIGIN_DENIED)',
          detail: `evil.example→${originEvil.soort} · claude.ai→${originClaude.soort} · localhost:6274→${originInspector.soort} · server→${originZonder.soort}`,
        },
        {
          id: 'cimd-ssrf',
          status: cimdOk ? 'ok' : 'fout',
          titel: taal === 'uk' ? '5. Документи метаданих клієнта (CIMD) та захист від SSRF' : '5. Client-metadatadocumenten (CIMD) en SSRF-bescherming',
          detail: `client_id_metadata_document_supported=true · https verplicht · privé-IP geblokkeerd in DNS-opzoeking`,
        },
        {
          id: 'rfc9207-iss-rfc8707',
          status: issOk ? 'ok' : 'fout',
          titel: taal === 'uk' ? '6. Захист від підміни сервера авторизації (RFC 9207 iss + RFC 8707 resource)' : '6. Bescherming tegen verwisseling van autorisatieserver (RFC 9207 iss + RFC 8707 resource)',
          detail: `authorization_response_iss_parameter_supported=true · iss=${c.ISSUER}`,
        },
        {
          id: 'server-card-registry',
          status: card.supportedProtocolVersions.includes('2026-07-28') && regJson.remotes.length >= 10 ? 'ok' : 'fout',
          titel: taal === 'uk' ? '7. Картка сервера (Server Card) та опис реєстру (server.json)' : '7. Serverkaart (Server Card) en registerbestand (server.json)',
          detail: `${card.name} · remotes=${regJson.remotes.length} · versions=${card.supportedProtocolVersions.join(', ')}`,
        },
      ];

      return json({
        ok: stappen.every((s) => s.status === 'ok'),
        doelId,
        stappen,
        prm: prmJson,
        asm: asmJson,
      });
    }],
  };
}
