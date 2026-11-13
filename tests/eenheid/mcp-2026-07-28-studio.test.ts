// MCP-001 · R2/R3/R4/R8/R9 (12.11.2026): протокол MCP 2026-07-28 + 2025-11-25,
// ресурси, шаблони запитів, автодоповнення, навички агента, рецепти інспектора,
// картка сервера (.well-known/mcp-server-card.json) та маніфест реєстру (/server.json).
// Без підключення до бази даних.

import {
  MCP_MODERNE_VERSIE,
  MCP_LEGACY_VERSIE,
  MCP_ALLE_VERSIES,
  MCP_EXTENSIES,
  MCP_VAARDIGHEDEN,
  MCP_PROMPTS,
  MCP_SDK_VOORBEELDEN,
  MCP_INSPECTOR_RECEPTEN,
  verrijkToolAnnotaties,
  controleerModerneMeta,
  omhulModernResultaat,
  voltooiMcpArgument,
  bouwServerCard,
  bouwRegistryServerJson,
  WHOAMI_OUTPUT_SCHEMA,
} from '../../shared/mcp-protocol-2026-model.ts';
import {
  behandelMcpProtocolMethode,
  bouwCapabilitiesBlock,
  type McpProtocolContext,
} from '../../backend/mcp-protocol-2026.ts';
import { serverCardMetadata, registryServerMetadata } from '../../backend/mcp-connector.ts';
import { MCP_KLANT_VERSIES, MCP_KLANT_VOORKEUR } from '../../shared/mcp-klant-model.ts';

export async function main(): Promise<number> {
  let fouten = 0;
  let ok = 0;
  const is = (voorwaarde: boolean, melding: string) => {
    if (voorwaarde) {
      ok++;
    } else {
      fouten++;
      console.error(`✗ ${melding}`);
    }
  };

  // ---------------------------------------------------------------- 1. Версії специфікації та двосторонній клієнт
  is(MCP_MODERNE_VERSIE === '2026-07-28', 'MCP_MODERNE_VERSIE === 2026-07-28');
  is(MCP_LEGACY_VERSIE === '2025-11-25', 'MCP_LEGACY_VERSIE === 2025-11-25');
  is(MCP_ALLE_VERSIES.includes('2026-07-28'), 'MCP_ALLE_VERSIES містить 2026-07-28');
  is(MCP_ALLE_VERSIES.includes('2025-11-25'), 'MCP_ALLE_VERSIES містить 2025-11-25');
  is(MCP_KLANT_VERSIES.includes('2026-07-28'), 'MCP_KLANT_VERSIES містить 2026-07-28');
  is(MCP_KLANT_VERSIES.includes('2025-11-25'), 'MCP_KLANT_VERSIES містить 2025-11-25');
  is(MCP_KLANT_VOORKEUR === '2025-06-18', 'MCP_KLANT_VOORKEUR зберігає зворотну сумісність 2025-06-18');

  // ---------------------------------------------------------------- 2. Перевірка _meta та заголовків (controleerModerneMeta)
  const geldigeModerne = controleerModerneMeta(
    { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/logLevel': 'info' } },
    '2026-07-28',
  );
  is(geldigeModerne.ok === true && geldigeModerne.modern === true && geldigeModerne.versie === '2026-07-28' && geldigeModerne.logNiveau === 'info', 'controleerModerneMeta: дійсний сучасний запит 2026-07-28');

  const conflict = controleerModerneMeta(
    { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
    '2025-06-18',
  );
  is(conflict.ok === false && conflict.code === -32020, 'controleerModerneMeta: конфлікт заголовка й _meta → -32020');

  const onbekend = controleerModerneMeta(
    { _meta: { 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } },
    undefined,
  );
  is(
    onbekend.ok === false && onbekend.code === -32022 && Array.isArray(onbekend.data?.supported),
    'controleerModerneMeta: невідома версія → -32022 зі списком supported',
  );

  // ---------------------------------------------------------------- 3. omhulModernResultaat
  const klassiek = omhulModernResultaat({ tools: [] }, false, { metCache: true });
  is(!('resultType' in klassiek) && !('ttlMs' in klassiek), 'omhulModernResultaat: класичний режим не додає resultType/ttlMs');

  const modernMetCache = omhulModernResultaat({ tools: [] }, true, { metCache: true, ttlMs: 45_000 });
  is(
    modernMetCache.resultType === 'complete' && modernMetCache.ttlMs === 45_000 && modernMetCache.cacheScope === 'private',
    'omhulModernResultaat: сучасний режим додає resultType=complete, ttlMs та cacheScope=private',
  );

  // ---------------------------------------------------------------- 4. server/discover та bouwCapabilitiesBlock
  const ctxPrive: McpProtocolContext = {
    userId: 'gebruiker-test-1',
    clientName: 'MCP Inspector Studio',
    ruimte: 'prive',
    agent: 'antigravity',
    instructions: 'Тестові настанови',
    modern: true,
    taal: 'uk',
  };
  const ctxTech: McpProtocolContext = {
    ...ctxPrive,
    ruimte: 'technisch',
  };

  const discoverUit = await behandelMcpProtocolMethode(ctxPrive, 'server/discover', {});
  is(
    discoverUit !== null &&
      discoverUit.soort === 'result' &&
      discoverUit.result.resultType === 'complete' &&
      Array.isArray(discoverUit.result.supportedVersions) &&
      discoverUit.result.cacheScope === 'private',
    'server/discover повертає можливості сервера та підтримувані версії',
  );

  const caps = bouwCapabilitiesBlock();
  is(
    Boolean(caps.tools && caps.resources && caps.prompts && caps.completions && caps.extensions),
    'bouwCapabilitiesBlock містить tools, resources, prompts, completions, extensions',
  );

  // ---------------------------------------------------------------- 5. Ресурси та суворе розмежування просторів (prive / technisch)
  const lijstPrive = await behandelMcpProtocolMethode(ctxPrive, 'resources/list', {});
  is(lijstPrive !== null && lijstPrive.soort === 'result', 'resources/list працює у приватному просторі');
  if (lijstPrive && lijstPrive.soort === 'result') {
    const resources = lijstPrive.result.resources as Array<{ uri: string }>;
    is(resources.some((r) => r.uri === 'mr://protocol/spec-2026-07-28'), 'resources/list містить mr://protocol/spec-2026-07-28');
    is(!resources.some((r) => r.uri === 'mr://uitrol/huidig'), 'resources/list у prive НЕ показує mr://uitrol/huidig');
  }

  const lijstTech = await behandelMcpProtocolMethode(ctxTech, 'resources/list', {});
  if (lijstTech && lijstTech.soort === 'result') {
    const resources = lijstTech.result.resources as Array<{ uri: string }>;
    is(resources.some((r) => r.uri === 'mr://uitrol/huidig'), 'resources/list у technisch показує mr://uitrol/huidig');
  }

  const sjablonenUit = await behandelMcpProtocolMethode(ctxPrive, 'resources/templates/list', {});
  is(
    sjablonenUit !== null &&
      sjablonenUit.soort === 'result' &&
      Array.isArray(sjablonenUit.result.resourceTemplates) &&
      (sjablonenUit.result.resourceTemplates as unknown[]).length === 3,
    'resources/templates/list повертає 3 шаблони ресурсів',
  );

  const verbodenUitrol = await behandelMcpProtocolMethode(ctxPrive, 'resources/read', { uri: 'mr://uitrol/huidig' });
  is(
    verbodenUitrol !== null && verbodenUitrol.soort === 'error' && verbodenUitrol.code === -32602,
    'resources/read блокує mr://uitrol/huidig у приватному просторі (-32602)',
  );

  const toegestaanUitrol = await behandelMcpProtocolMethode(ctxTech, 'resources/read', { uri: 'mr://uitrol/huidig' });
  is(
    toegestaanUitrol !== null && toegestaanUitrol.soort === 'result',
    'resources/read дозволяє mr://uitrol/huidig у технічному просторі',
  );

  const skillRead = await behandelMcpProtocolMethode(ctxPrive, 'resources/read', { uri: 'mr://skills/movnyi-zakon' });
  is(
    skillRead !== null &&
      skillRead.soort === 'result' &&
      ((skillRead.result.contents as Array<{ text: string }>)[0]?.text ?? '').includes('Мовний закон Мій простір'),
    'resources/read повертає вміст навички mr://skills/movnyi-zakon',
  );

  const sdkRead = await behandelMcpProtocolMethode(ctxPrive, 'resources/read', { uri: 'mr://sdk/typescript/voorbeeld' });
  is(
    sdkRead !== null &&
      sdkRead.soort === 'result' &&
      ((sdkRead.result.contents as Array<{ text: string }>)[0]?.text ?? '').includes('McpServer'),
    'resources/read повертає зразок коду TypeScript SDK',
  );

  const agentInfoRead = await behandelMcpProtocolMethode(ctxPrive, 'resources/read', { uri: 'mr://agent/antigravity/info' });
  is(
    agentInfoRead !== null &&
      agentInfoRead.soort === 'result' &&
      ((agentInfoRead.result.contents as Array<{ text: string }>)[0]?.text ?? '').includes('https://mcp.tarasevych.com/antigravity'),
    'resources/read повертає картку агента mr://agent/antigravity/info',
  );

  // ---------------------------------------------------------------- 6. Шаблони запитів (prompts), автодоповнення, підписки та журнали
  const promptsUit = await behandelMcpProtocolMethode(ctxPrive, 'prompts/list', {});
  is(
    promptsUit !== null &&
      promptsUit.soort === 'result' &&
      (promptsUit.result.prompts as unknown[]).length === MCP_PROMPTS.length,
    'prompts/list повертає всі 6 двомовних шаблонів запитів',
  );

  const promptGetUit = await behandelMcpProtocolMethode(ctxPrive, 'prompts/get', {
    name: 'mcp_beveiligingsaudit',
    arguments: { doel: 'antigravity', era: '2026-07-28' },
  });
  is(
    promptGetUit !== null &&
      promptGetUit.soort === 'result' &&
      ((promptGetUit.result.messages as Array<{ content: { text: string } }>)[0]?.content.text ?? '').includes('antigravity'),
    'prompts/get формує повідомлення шаблону mcp_beveiligingsaudit',
  );

  const compUit = await behandelMcpProtocolMethode(ctxPrive, 'completion/complete', {
    ref: { type: 'ref/resource', uri: 'mr://skills/{id}' },
    argument: { name: 'id', value: 'mov' },
  });
  is(
    compUit !== null &&
      compUit.soort === 'result' &&
      ((compUit.result.completion as { values: string[] }).values ?? [])[0] === 'movnyi-zakon',
    'completion/complete доповнює ідентифікатор навички movnyi-zakon',
  );

  const subUit = await behandelMcpProtocolMethode(ctxPrive, 'subscriptions/listen', {});
  is(
    subUit !== null && subUit.soort === 'result' && subUit.result.acknowledged === true,
    'subscriptions/listen повертає acknowledged=true',
  );

  const logOk = await behandelMcpProtocolMethode(ctxPrive, 'logging/setLevel', { level: 'warning' });
  is(logOk !== null && logOk.soort === 'result' && logOk.result.level === 'warning', 'logging/setLevel приймає дійсний рівень warning');

  const logFout = await behandelMcpProtocolMethode(ctxPrive, 'logging/setLevel', { level: 'onzin' });
  is(logFout !== null && logFout.soort === 'error' && logFout.code === -32602, 'logging/setLevel відхиляє недійсний рівень (-32602)');

  // ---------------------------------------------------------------- 7. Анотації інструментів, Server Card та Registry server.json
  is(MCP_EXTENSIES.length === 4, '4 офіційні розширення MCP_EXTENSIES');
  is(MCP_VAARDIGHEDEN.length === 4, '4 вбудовані навички MCP_VAARDIGHEDEN');
  is(MCP_SDK_VOORBEELDEN.length === 4, '4 мови SDK у MCP_SDK_VOORBEELDEN');
  is(MCP_INSPECTOR_RECEPTEN.length === 6, '6 готових рецептів у MCP_INSPECTOR_RECEPTEN');
  is(Boolean(WHOAMI_OUTPUT_SCHEMA.properties), 'WHOAMI_OUTPUT_SCHEMA визначено за JSON Schema 2020-12');

  const annLezen = verrijkToolAnnotaties('mail', 'lezen');
  is(
    annLezen.readOnlyHint === true && annLezen.destructiveHint === false && annLezen.idempotentHint === true && annLezen.openWorldHint === true,
    'verrijkToolAnnotaties: читання пошти має readOnlyHint=true, idempotentHint=true, openWorldHint=true',
  );

  const annWissen = verrijkToolAnnotaties('bestanden', 'wissen');
  is(
    annWissen.readOnlyHint === false && annWissen.destructiveHint === true && annWissen.openWorldHint === false,
    'verrijkToolAnnotaties: видалення файлів має destructiveHint=true, openWorldHint=false',
  );

  const card = bouwServerCard('https://mcp.tarasevych.com', 'antigravity');
  is(
    card.name === 'com.tarasevych/mijn-ruimte-antigravity' &&
      card.authentication.pkceRequired === true &&
      card.authentication.codeChallengeMethodsSupported[0] === 'S256',
    'bouwServerCard формує картку для окремого агента з PKCE S256',
  );

  const reg = bouwRegistryServerJson('https://mcp.tarasevych.com');
  is(
    reg.name === 'com.tarasevych/mijn-ruimte' && Array.isArray(reg.remotes) && reg.remotes.length === 10,
    'bouwRegistryServerJson формує маніфест реєстру з усіма 9 агентами та /mcp',
  );

  const cCardResp = serverCardMetadata();
  const cRegResp = registryServerMetadata();
  const cCardBody = JSON.parse(cCardResp.body);
  const cRegBody = JSON.parse(cRegResp.body);
  is(
    cCardResp.statusCode === 200 &&
      cRegResp.statusCode === 200 &&
      cCardBody.name === 'com.tarasevych/mijn-ruimte' &&
      cRegBody.name === 'com.tarasevych/mijn-ruimte',
    'serverCardMetadata та registryServerMetadata працюють з backend/mcp-connector.ts',
  );

  const argAgents = voltooiMcpArgument(undefined, { name: 'agent', value: 'anti' });
  is(argAgents.values.length === 1 && argAgents.values[0] === 'antigravity', 'voltooiMcpArgument знаходить antigravity за префіксом anti');

  console.log(`mcp-2026-07-28-studio: ${ok} controles goed, ${fouten} fout`);
  return fouten ? 1 : 0;
}
