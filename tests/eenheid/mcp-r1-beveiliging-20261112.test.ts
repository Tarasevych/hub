// MCP-001 · R1 (12.11.2026): безпека транспорту й OAuth за MCP 2025-11-25. Без бази даних.
//  1. Origin (DNS-rebinding, MUST): без Origin — пропуск; дозволені — пропуск; чужі, «null», з шляхом — 403; режим «melden» не блокує.
//  2. CIMD (SEP-991): адреса client_id, SSRF-захист (приватні/loopback/link-local/CGNAT/ULA/IPv4-в-IPv6), перевірка документа,
//     кеш за Cache-Control, відмова на переадресацію/не-JSON/завеликий документ; справжній https.get на 127.0.0.1 блокується lookup-ом.
//  3. RFC 9207: метадані містять authorization_response_iss_parameter_supported і client_id_metadata_document_supported.
//  4. Пакети JSON-RPC: дозволені лише без заголовка версії або для 2025-03-26/2024-11-05.
import { isMcpRpcPad, mcpOriginBesluit, normaliseerOrigin, originModus } from '../../backend/mcp-origin';
import { _legeCimdCache, bewaarTijd, CimdFoutmelding, cimdKlant, httpsOphaler, isCimdClientId, isNietPubliekIp, valideerCimd, veiligeLookup, type Ophaler } from '../../backend/mcp-cimd';
import { authorizationServerMetadata, batchToegestaan, klantNaamFout, redirectUriAllowed } from '../../backend/mcp-connector';

export async function main(): Promise<number> {
  let fouten = 0, ok = 0;
  const is = (v: boolean, m: string) => { if (v) ok++; else { fouten++; console.error(`✗ ${m}`); } };

  // ---------------------------------------------------------------- 1. Origin
  const eigen = ['https://mcp.tarasevych.com', 'https://hub.tarasevych.com'];
  is(mcpOriginBesluit(undefined, eigen, { modus: 'weigeren', extra: [] }).soort === 'geen', 'zonder Origin → doorlaten');
  is(mcpOriginBesluit('', eigen, { modus: 'weigeren', extra: [] }).soort === 'geen', 'lege Origin → doorlaten');
  is(mcpOriginBesluit('https://claude.ai', eigen, { modus: 'weigeren', extra: [] }).soort === 'toegestaan', 'claude.ai toegestaan');
  is(mcpOriginBesluit('https://Claude.AI/', eigen, { modus: 'weigeren', extra: [] }).soort === 'toegestaan', 'hoofdletters + slash genormaliseerd');
  is(mcpOriginBesluit('https://mcp.tarasevych.com', eigen, { modus: 'weigeren', extra: [] }).soort === 'toegestaan', 'eigen site toegestaan');
  is(mcpOriginBesluit('http://localhost:6274', eigen, { modus: 'weigeren', extra: [] }).soort === 'toegestaan', 'MCP Inspector lokaal toegestaan');
  for (const slecht of ['https://evil.example', 'http://claude.ai', 'https://claude.ai.evil.example', 'null', 'https://claude.ai/pad', 'file://x', 'http://localhost:8091', 'https://u:p@claude.ai']) {
    const b = mcpOriginBesluit(slecht, eigen, { modus: 'weigeren', extra: [] });
    is(b.soort === 'geweigerd' && b.blokkeren, `«${slecht}» → 403`);
  }
  const melden = mcpOriginBesluit('https://evil.example', eigen, { modus: 'melden', extra: [] });
  is(melden.soort === 'geweigerd' && !melden.blokkeren && melden.melden, 'modus melden: niet blokkeren, wel melden');
  is(mcpOriginBesluit('https://tool.example', eigen, { modus: 'weigeren', extra: ['https://tool.example'] }).soort === 'toegestaan', 'MCP_EXTRA_ORIGINS werkt');
  is(originModus(undefined) === 'weigeren' && originModus('melden') === 'melden' && originModus('iets') === 'weigeren', 'standaardmodus is weigeren');
  is(normaliseerOrigin('https://*.example.com') === null, 'jokers nooit toegestaan');
  is(isMcpRpcPad('/api/mcp-connector/rpc') && isMcpRpcPad('/api/connector-v2/claude/rpc') && !isMcpRpcPad('/api/mcp-connector/token') && !isMcpRpcPad('/api/connector-v2/claude/prm'), 'alleen RPC-paden');

  // ---------------------------------------------------------------- 2. CIMD
  is(isCimdClientId('https://claude.ai/oauth/mcp-client.json'), 'CIMD-adres herkend');
  for (const nee of ['mcpc_abc', 'http://claude.ai/x.json', 'https://claude.ai/', 'https://claude.ai', 'https://u:p@claude.ai/x', 'https://claude.ai/x#f', 'https://claude.ai:8443/x']) is(!isCimdClientId(nee), `geen CIMD: ${nee}`);
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '2001:db8::1', 'onzin']) is(isNietPubliekIp(ip), `geblokkeerd IP ${ip}`);
  for (const ip of ['1.1.1.1', '160.79.104.10', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8']) is(!isNietPubliekIp(ip), `publiek IP ${ip}`);

  // veiligeLookup met een nep-DNS: één privé-adres in de lijst blokkeert alles (DNS-rebinding met gemengde antwoorden)
  const nepDns = (adressen: Array<{ address: string; family: number }>) => ((_h: string, _o: unknown, cb: (e: null, a: unknown) => void) => cb(null, adressen)) as any;
  const lookupUitkomst = (adressen: Array<{ address: string; family: number }>) => new Promise<string>((res) => veiligeLookup('x.example', {}, (e, a) => res(e ? String(e.code) : String(a)), nepDns(adressen)));
  is(await lookupUitkomst([{ address: '1.1.1.1', family: 4 }]) === '1.1.1.1', 'publiek adres → verbinden');
  is(await lookupUitkomst([{ address: '1.1.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }]) === 'CIMD_SSRF_GEBLOKKEERD', 'gemengd antwoord met loopback → blok');
  is(await lookupUitkomst([]) === 'CIMD_SSRF_GEBLOKKEERD', 'leeg DNS-antwoord → blok');

  // echte https.get naar localhost: de lookup moet blokkeren vóór er een verbinding is
  try { await httpsOphaler('https://localhost/client.json'); is(false, 'localhost had geblokkeerd moeten worden'); }
  catch (e) { is(e instanceof CimdFoutmelding && e.code === 'CIMD_SSRF_GEBLOKKEERD', `echte ophaler blokkeert localhost (${(e as Error).message})`); }

  const regels = { redirectToegestaan: redirectUriAllowed, naamFout: klantNaamFout };
  const id = 'https://claude.ai/oauth/mcp-client.json';
  const goed = { client_id: id, client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' };
  is(valideerCimd(goed, id, regels).client_name === 'Claude', 'geldig document aanvaard');
  const weiger = (doc: unknown, waarom: string) => { try { valideerCimd(doc, id, regels); is(false, `had moeten weigeren: ${waarom}`); } catch (e) { is(e instanceof CimdFoutmelding && e.code === 'CIMD_ONGELDIG', `weigert: ${waarom}`); } };
  weiger({ ...goed, client_id: 'https://evil.example/c.json' }, 'client_id wijkt af');
  weiger({ ...goed, client_id: `${id}/` }, 'client_id niet exact (slash)');
  weiger({ ...goed, client_name: '' }, 'geen client_name');
  weiger({ ...goed, redirect_uris: ['https://evil.example/cb'] }, 'onbekende redirect_uri');
  weiger({ ...goed, redirect_uris: [] }, 'lege redirect_uris');
  weiger({ ...goed, token_endpoint_auth_method: 'private_key_jwt' }, 'geen publieke klant');
  weiger({ ...goed, client_name: 'ChatGPT' }, 'naam van andere aanbieder bij claude.ai-adres (SEC-001-10)');
  weiger([goed], 'array in plaats van object');

  _legeCimdCache();
  let aanroepen = 0;
  const nep = (r: Partial<Awaited<ReturnType<Ophaler>>>): Ophaler => async () => { aanroepen++; return { status: 200, contentType: 'application/json', body: JSON.stringify(goed), cacheControl: 'max-age=600', ...r }; };
  const k1 = await cimdKlant(id, regels, nep({}), 1_000_000);
  const k2 = await cimdKlant(id, regels, nep({}), 1_000_000 + 500_000);
  is(k1.client_id === id && k2.client_id === id && aanroepen === 1, 'cache: tweede aanroep binnen max-age haalt niet opnieuw');
  await cimdKlant(id, regels, nep({}), 1_000_000 + 700_000);
  is(aanroepen === 2, 'cache verlopen na max-age → opnieuw ophalen');
  const fout = async (o: Ophaler, code: string, waarom: string) => { _legeCimdCache(); try { await cimdKlant(id, regels, o); is(false, waarom); } catch (e) { is(e instanceof CimdFoutmelding && e.code === code, `${waarom} → ${code}`); } };
  await fout(nep({ status: 302 }), 'CIMD_STATUS', 'omleiding');
  await fout(nep({ status: 404 }), 'CIMD_STATUS', 'niet gevonden');
  await fout(nep({ contentType: 'text/html' }), 'CIMD_GEEN_JSON', 'HTML in plaats van JSON');
  await fout(nep({ body: '{kapot' }), 'CIMD_GEEN_JSON', 'ongeldige JSON');
  await fout(nep({ body: 'x'.repeat(17 * 1024) }), 'CIMD_TE_GROOT', 'groter dan 16 KB');
  _legeCimdCache();
  is((await cimdKlant(id, regels, nep({ contentType: 'application/oauth-client-metadata+json; charset=utf-8' }))).client_id === id, 'vendor-JSON-type aanvaard');
  is(bewaarTijd('no-store') === 60_000 && bewaarTijd('max-age=999999') === 86_400_000 && bewaarTijd('') === 3_600_000 && bewaarTijd('max-age=5') === 60_000, 'bewaartijd begrensd');
  const oud = process.env.MCP_CIMD; process.env.MCP_CIMD = 'uit';
  await fout(nep({}), 'CIMD_UIT', 'MCP_CIMD=uit');
  process.env.MCP_CIMD = oud;

  // ---------------------------------------------------------------- 3. metadata
  const asm = JSON.parse(String(authorizationServerMetadata().body));
  is(asm.authorization_response_iss_parameter_supported === true, 'RFC 9207 in metadata');
  is(asm.client_id_metadata_document_supported === true, 'CIMD in metadata');
  is(Array.isArray(asm.code_challenge_methods_supported) && asm.code_challenge_methods_supported.includes('S256'), 'PKCE S256 blijft');
  is(typeof asm.registration_endpoint === 'string', 'DCR blijft (claude.ai gebruikt het nog)');

  // ---------------------------------------------------------------- 4. batches
  is(batchToegestaan(undefined) && batchToegestaan('') && batchToegestaan('2025-03-26'), 'batch zonder kop / 2025-03-26 toegestaan');
  is(!batchToegestaan('2025-06-18') && !batchToegestaan('2025-11-25') && !batchToegestaan('2026-07-28'), 'batch bij nieuwere versies geweigerd');

  if (fouten) { console.error(`mcp-r1-beveiliging: ${fouten} fout(en), ${ok} goed`); return 1; }
  console.log(`✓ mcp-r1-beveiliging: ${ok} controles goed`);
  return 0;
}
