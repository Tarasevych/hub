// SEC-002 · slot m (13.11.2026): наскрізні захисти SEC-002 у новому коді MCP-001 (встановлена версія 20261112-215622).
//  1. MR-1/MRG-06: mr://identiteit/profiel і mr://status/overzicht — лише з правом v2_whoami (ctx.magProfiel); без нього немає в
//     resources/list, а resources/read → -32602 і запис у журнал (meldWeigering).
//  2. MR-2/MRG-01/NET-3: зарезервовані назви клієнта (g10a-4) діють і для CIMD (klantNaamFout → valideerCimd), і в aanvragerNu.
//  3. NET-1/MRG-03: IP-літерал як client_id CIMD відхиляється; реальний https до 127.0.0.1 не відкриває з'єднання.
//  4. MR-4/NET-2/MRG-04: жорсткий загальний дедлайн завантаження; негативний кеш; об'єднання однакових запитів; стеля паралельності.
//  5. MR-3/MRG-02: новий CIMD-id підлягає денному ліміту на IP (/64) ще до завантаження; authorize → 429, рядок не створюється.
//  6. MR-6: маршрути студії-інспектора закриті для impersonatie та для агентів (namens).
//  7. NET-4: мапа демпфування eenKeerPer має жорстку межу.
//  8. MRG-08: версія протоколу від клієнта у тексті помилки обрізається.
//  9. MR-5: /uitvoeren студії має ліміт 120/хв (перевірка за джерелом — маршрут потребує повної сесії).
// Slot m2 (зауваження перевіряльника, toets.bezwaren):
//  2a. зарезервовані назви з символами \p{Cf} (нульової ширини) і подвійними пробілами відхиляються — у DCR, CIMD і aanvragerNu.
//  4a. стеля MAX_GELIJKTIJDIG → власний код CIMD_BEZET («сервер зайнятий»), а не CIMD_LIMIET («з цієї адреси»);
//      відомий клієнт із простроченим (але не надто старим) кешем при повній стелі отримує перевірену копію.
//  10. гонка в ліміті «2 одночасні завантаження на IP /64» у klantVoorId закрита; лічильник звільняється у finally;
//      authorize при повній стелі → 503 з точним двомовним текстом.
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { behandelMcpProtocolMethode, lijstResourcesVoor, type McpProtocolContext } from '../../backend/mcp-protocol-2026';
import { _httpsHalen, _legeCimdCache, CimdFoutmelding, cimdKlant, cimdLopend, httpsOphaler, isCimdClientId, isNietPubliekIp, MAX_GELIJKTIJDIG, valideerCimd, VEROUDERD_MAX_MS, type Ophaler } from '../../backend/mcp-cimd';
import { authorize, gereserveerdeKlantNaam, klantNaamFout, klantVoorId, redirectUriAllowed, registerClient } from '../../backend/mcp-connector';
import * as st from '../../backend/mcp-connector-opslag';
import { aanvragerNu } from '../../backend/connectors-opslag';
import { metNamens } from '../../backend/mcp-namens';
import { routeOordeel } from '../../shared/impersonatie';
import { agentRouteVerboden } from '../../backend/agent-namens';
import { _dempingGrootte, _resetDemping, DEMPING_MAX, eenKeerPer } from '../../backend/beheer-journaal';
import { controleerModerneMeta } from '../../shared/mcp-protocol-2026-model';

export async function main(): Promise<number> {
  let fouten = 0, ok = 0;
  const is = (v: boolean, m: string) => { if (v) ok++; else { fouten++; console.error(`✗ ${m}`); } };

  // ---------------------------------------------------------------- 1. profielbronnen alleen met recht
  const gemeld: string[] = [];
  const basis: McpProtocolContext = { userId: '00000000-0000-0000-0000-000000000000', clientName: 'Proef', ruimte: 'prive', instructions: '', modern: true, taal: 'nl', meldWeigering: (u) => { gemeld.push(u); } };
  const zonder = await lijstResourcesVoor(basis);
  is(!zonder.some((r) => r.uri === 'mr://identiteit/profiel') && !zonder.some((r) => r.uri === 'mr://status/overzicht'), 'zonder recht: profiel en status niet in resources/list');
  is(zonder.some((r) => r.uri === 'mr://protocol/spec-2026-07-28'), 'zonder recht: openbare bronnen blijven');
  const met = await lijstResourcesVoor({ ...basis, magProfiel: true });
  is(met.some((r) => r.uri === 'mr://identiteit/profiel') && met.some((r) => r.uri === 'mr://status/overzicht'), 'met recht: profiel en status zichtbaar');
  for (const uri of ['mr://identiteit/profiel', 'mr://status/overzicht']) {
    const uit = await behandelMcpProtocolMethode(basis, 'resources/read', { uri });
    is(uit !== null && uit.soort === 'error' && uit.code === -32602 && /немає дозволу/.test(uit.message) && /geen toestemming/.test(uit.message), `resources/read ${uri} zonder recht → -32602 (uk/nl)`);
  }
  is(gemeld.length === 2 && gemeld[0] === 'mr://identiteit/profiel', 'weigering naar het logboek gemeld');
  const zonderVlag = await behandelMcpProtocolMethode({ ...basis, magProfiel: undefined }, 'resources/read', { uri: 'mr://identiteit/profiel' });
  is(zonderVlag !== null && zonderVlag.soort === 'error', 'ontbrekende vlag = geen toegang (veilige standaard)');
  const statusMet = await behandelMcpProtocolMethode({ ...basis, magProfiel: true }, 'resources/read', { uri: 'mr://status/overzicht' });
  is(statusMet !== null && statusMet.soort === 'result', 'met recht: status leesbaar');
  // bron bij v2 en het oude /mcp: de vlag wordt gezet op grond van het recht v2_whoami en de site-schakelaars
  const v2Bron = readFileSync('backend/connector-v2.ts', 'utf8');
  is(/magProfiel: rechten\.sleutels\.includes\('v2_whoami:gebruiker'\) && await profielNietGestopt\(/.test(v2Bron), 'connector v2: magProfiel volgt v2_whoami + verbindingStop');
  const mcpBron = readFileSync('backend/mcp-connector.ts', 'utf8');
  is(/const magProfiel = !techNuUit && await profielNietGestopt\(who\)/.test(mcpBron), 'oud /mcp: magProfiel volgt techNuUit + verbindingStop');

  // ---------------------------------------------------------------- 2. gereserveerde namen ook bij CIMD
  for (const n of ['site:eigenaar', ' site : x', '?', '???', 'Ви (з сайту)', 'You (site)', 'jij (van de site)', 'U (site)', 'ｓｉｔｅ:x', 'Ｙｏｕ（site）']) is(gereserveerdeKlantNaam(n), `gereserveerd: «${n}»`);
  for (const n of ['Claude', 'Cursor', 'Mijn site-assistent', 'Youtube helper']) is(!gereserveerdeKlantNaam(n), `gewone naam: «${n}»`);
  is(klantNaamFout('Ви (з сайту)', ['https://claude.ai/api/mcp/auth_callback']) === 'client_name is gereserveerd', 'klantNaamFout weigert gereserveerde naam');
  const regels = { redirectToegestaan: redirectUriAllowed, naamFout: klantNaamFout };
  const id = 'https://claude.ai/oauth/mcp-client.json';
  for (const naam of ['Ви (з сайту)', 'site:eigenaar', 'You (site)']) {
    try { valideerCimd({ client_id: id, client_name: naam, redirect_uris: ['http://localhost:1234/cb'] }, id, regels); is(false, `CIMD had «${naam}» moeten weigeren`); }
    catch (e) { is(e instanceof CimdFoutmelding && e.code === 'CIMD_ONGELDIG' && /gereserveerd/.test(e.message), `CIMD weigert «${naam}» → CIMD_ONGELDIG`); }
  }
  const aanvrager = await metNamens({ client: 'You (site)', grantId: 'g1' }, async () => aanvragerNu());
  is(aanvrager.client.startsWith('ШІ «') && aanvrager.client.includes('You (site)'), 'aanvragerNu: «You (site)» krijgt het voorvoegsel ШІ');
  const gewoon = await metNamens({ client: 'Claude', grantId: 'g1' }, async () => aanvragerNu());
  is(gewoon.client === 'Claude', 'aanvragerNu: gewone naam ongewijzigd');

  // ---------------------------------------------------------------- 2a. (slot m2) onzichtbare tekens en dubbele spaties
  // Tekens via String.fromCharCode: zo blijft het bestand vrij van letterlijke onzichtbare tekens.
  const nulb = String.fromCharCode(0x200b), wv = String.fromCharCode(0x2060), lrm = String.fromCharCode(0x200e), shy = String.fromCharCode(0x00ad);
  const listig = [`Ви${nulb} (з сайту)`, 'Ви (з  сайту)', `Ви (з${nulb}${nulb} сайту)`, `You${wv} (site)`, `jij (van${lrm} de  site)`, `Y${shy}ou (site)`, `s${nulb}ite:eigenaar`];
  for (const n of listig) is(gereserveerdeKlantNaam(n), `gereserveerd ondanks onzichtbare tekens/spaties: ${JSON.stringify(n)}`);
  is(!gereserveerdeKlantNaam(`Claude${nulb} Desktop`) && !gereserveerdeKlantNaam('Mijn  site-assistent'), 'gewone namen met onzichtbare tekens/spaties blijven toegestaan');
  for (const naam of [`Ви${nulb} (з сайту)`, 'Ви (з  сайту)']) {
    const r = await registerClient(JSON.stringify({ client_name: naam, redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }), '');
    is(r.statusCode === 400 && /gereserveerd/.test(String(r.body)), `DCR weigert ${JSON.stringify(naam)} (${r.statusCode})`);
    try { valideerCimd({ client_id: id, client_name: naam, redirect_uris: ['http://localhost:1234/cb'] }, id, regels); is(false, `CIMD had ${JSON.stringify(naam)} moeten weigeren`); }
    catch (e) { is(e instanceof CimdFoutmelding && e.code === 'CIMD_ONGELDIG' && /gereserveerd/.test(e.message), `CIMD weigert ${JSON.stringify(naam)} → CIMD_ONGELDIG`); }
    const av = await metNamens({ client: naam, grantId: 'g1' }, async () => aanvragerNu());
    is(av.client.startsWith('ШІ «'), `aanvragerNu: ${JSON.stringify(naam)} krijgt het voorvoegsel ШІ`);
  }

  // ---------------------------------------------------------------- 3. IP-letterlijke adressen
  for (const u of ['https://127.0.0.1/c.json', 'https://[::1]/c.json', 'https://0x7f000001/c.json', 'https://2130706433/c', 'https://169.254.169.254/latest', 'https://10.0.0.5/x.json', 'https://[::ffff:7f00:1]/c.json']) is(!isCimdClientId(u), `geen CIMD-id: ${u}`);
  is(isCimdClientId('https://claude.ai/oauth/mcp-client.json'), 'domeinnaam blijft geldig');
  for (const ip of ['::ffff:7f00:1', '0:0:0:0:0:0:0:1', '2001::1', '64:ff9b:1::1', '2002:7f00:1::1']) is(isNietPubliekIp(ip), `niet-publiek: ${ip}`);
  is(!isNietPubliekIp('1.1.1.1') && !isNietPubliekIp('2606:4700::1111'), 'publieke adressen blijven publiek');
  // echte poort op 127.0.0.1: httpsOphaler mag er geen verbinding mee maken
  let verbindingen = 0;
  const srv = net.createServer((s) => { verbindingen++; s.destroy(); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const poort = (srv.address() as net.AddressInfo).port;
  try { await httpsOphaler(`https://127.0.0.1:${poort}/c.json`); is(false, 'IP-letterlijk had geweigerd moeten worden'); }
  catch (e) { is(e instanceof CimdFoutmelding && e.code === 'CIMD_SSRF_GEBLOKKEERD', `httpsOphaler weigert IP-letterlijk (${(e as Error).message})`); }
  is(verbindingen === 0, 'geen TCP-verbinding naar 127.0.0.1');

  // ---------------------------------------------------------------- 4. harde tijdslimiet, negatieve cache, samenvoegen, plafond
  // Server die de verbinding aanneemt en NIETS terugstuurt: de inactiviteitstijd (5 s) zou pas veel later afgaan; de harde klok moet winnen.
  const stil: net.Socket[] = [];
  const stilSrv = net.createServer((s) => { stil.push(s); });
  await new Promise<void>((r) => stilSrv.listen(0, '127.0.0.1', () => r()));
  const stilPoort = (stilSrv.address() as net.AddressInfo).port;
  const nepLookup = ((_h: string, o: { all?: boolean }, cb: (e: null, a: unknown, f?: number) => void) => (o?.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4))) as never;
  const t0 = Date.now();
  try { await _httpsHalen(`https://cimd-toets.invalid:${stilPoort}/c.json`, 300, nepLookup); is(false, 'stille server had moeten falen'); }
  catch (e) { is(e instanceof CimdFoutmelding && e.code === 'CIMD_NETWERK' && /tijdslimiet/.test(e.message), `harde klok → CIMD_NETWERK tijdslimiet (${(e as Error).message})`); }
  const duur = Date.now() - t0;
  is(duur < 2500, `harde klok binnen de grens (${duur} ms, inactiviteitstijd is 5000 ms)`);
  for (const s of stil) s.destroy();
  await new Promise<void>((r) => stilSrv.close(() => r()));
  await new Promise<void>((r) => srv.close(() => r()));

  _legeCimdCache();
  let aanroepen = 0;
  const kapot: Ophaler = async () => { aanroepen++; return { status: 404, contentType: 'application/json', body: '{}', cacheControl: '' }; };
  for (let i = 0; i < 3; i++) { try { await cimdKlant(id, regels, kapot, 5_000_000); } catch { /* verwacht */ } }
  is(aanroepen === 1, `negatieve cache: hetzelfde slechte adres één keer opgehaald (${aanroepen})`);
  try { await cimdKlant(id, regels, kapot, 5_000_000 + 61_000); } catch { /* verwacht */ }
  is(aanroepen === 2, 'negatieve cache verloopt na 60 s');

  _legeCimdCache();
  aanroepen = 0;
  const goed = { client_id: id, client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] };
  let loslaten: () => void = () => undefined;
  const wacht = new Promise<void>((r) => { loslaten = r; });
  const traag: Ophaler = async () => { aanroepen++; await wacht; return { status: 200, contentType: 'application/json', body: JSON.stringify(goed), cacheControl: 'max-age=600' }; };
  const p1 = cimdKlant(id, regels, traag, 6_000_000), p2 = cimdKlant(id, regels, traag, 6_000_000);
  loslaten();
  const [a1, a2] = await Promise.all([p1, p2]);
  is(aanroepen === 1 && a1.client_id === id && a2.client_id === id, 'gelijktijdige verzoeken voor hetzelfde adres samengevoegd');

  _legeCimdCache();
  // slot m2: verlopen cachewaarden klaarzetten — één net verlopen (60 s geleden), één te oud (meer dan VEROUDERD_MAX_MS na het verlopen).
  const idBekend = 'https://claude.ai/oauth/bekend.json', idOud = 'https://claude.ai/oauth/oud.json';
  const doc = (cid: string): Ophaler => async () => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...goed, client_id: cid }), cacheControl: 'max-age=60' });
  await cimdKlant(idBekend, regels, doc(idBekend), 7_000_000 - 120_000);
  await cimdKlant(idOud, regels, doc(idOud), 7_000_000 - VEROUDERD_MAX_MS - 200_000);
  let open: () => void = () => undefined;
  const hang = new Promise<void>((r) => { open = r; });
  const hangend: Ophaler = async () => { await hang; return { status: 404, contentType: 'application/json', body: '{}', cacheControl: '' }; };
  const lopers = Array.from({ length: MAX_GELIJKTIJDIG }, (_, i) => cimdKlant(`https://voorbeeld.example/c${i}.json`, regels, hangend, 7_000_000).catch(() => null));
  is(cimdLopend() === MAX_GELIJKTIJDIG, `plafond bereikt (${cimdLopend()})`);
  // slot m2: het procesbrede plafond heeft een eigen code CIMD_BEZET («server bezet»); CIMD_LIMIET blijft voor de grens per IP (/64).
  // (Vroeger toetste deze regel CIMD_LIMIET — dat gaf de mens de onjuiste tekst «з цієї адреси / vanaf dit adres».)
  try { await cimdKlant('https://voorbeeld.example/extra.json', regels, hangend, 7_000_000); is(false, 'boven het plafond had moeten weigeren'); }
  catch (e) { is(e instanceof CimdFoutmelding && e.code === 'CIMD_BEZET', `boven het plafond → CIMD_BEZET (${(e as Error).message})`); }
  let verouderdGemeld = 0;
  const bekendRegels = { ...regels, verouderdBijDrukte: true, bijVerouderd: () => { verouderdGemeld++; } };
  const kb = await cimdKlant(idBekend, bekendRegels, hangend, 7_000_000).catch((e: Error) => e);
  is(!(kb instanceof Error) && kb.client_id === idBekend && verouderdGemeld === 1, `bekende klant, vol plafond: verlopen cachewaarde gebruikt en gemeld (${kb instanceof Error ? kb.message : 'ok'})`);
  for (const [naam, pId, r] of [['zonder vlag (nieuwe klant)', idBekend, regels], ['te oude cachewaarde', idOud, bekendRegels], ['cachewaarde voldoet niet meer aan de regels', idBekend, { ...bekendRegels, redirectToegestaan: () => false }]] as const) {
    try { await cimdKlant(pId, r, hangend, 7_000_000); is(false, `${naam}: had moeten weigeren`); }
    catch (e) { is(e instanceof CimdFoutmelding && e.code === 'CIMD_BEZET', `${naam} → CIMD_BEZET`); }
  }
  open();
  await Promise.all(lopers);
  is(cimdLopend() === 0, 'teller terug op nul');
  _legeCimdCache();

  // ---------------------------------------------------------------- 5. grenzen van DCR gelden ook voor een NIEUW CIMD-adres
  const oudDag = st.LIMITS.maxRegistratiesPerIpPerDag;
  st.LIMITS.maxRegistratiesPerIpPerDag = 0; // daglimiet al op: weigeren vóór het ophalen (geen netwerk nodig)
  try {
    const nieuw = `https://cimd-slot-m-${Date.now()}.example/c.json`;
    const k = await klantVoorId(nieuw, '203.0.113.77');
    is(!!k && 'fout' in k && k.fout === 'CIMD_LIMIET', `nieuw CIMD-adres boven de daglimiet → CIMD_LIMIET (${JSON.stringify(k)})`);
    is((await st.getClient(nieuw)) === null, 'geen rij in app.mcp_oauth_clients');
    const a = await authorize({ client_id: nieuw, redirect_uri: 'http://localhost:1234/cb', response_type: 'code' }, '203.0.113.77');
    is(a.statusCode === 429 && /Забагато/.test(String(a.body)) && /Te veel/.test(String(a.body)), `authorize → 429 met uitleg uk/nl (${a.statusCode})`);
  } finally { st.LIMITS.maxRegistratiesPerIpPerDag = oudDag; _legeCimdCache(); }

  // ---------------------------------------------------------------- 10. (slot m2) wedloop per IP; vol plafond bij authorize
  {
    const stempel = Date.now();
    const ipW = `198.51.100.${(stempel % 200) + 20}`;
    let gestart = 0;
    let vrij: () => void = () => undefined;
    const poort10 = new Promise<void>((r) => { vrij = r; });
    const wachtend: Ophaler = async () => { gestart++; await poort10; return { status: 404, contentType: 'application/json', body: '{}', cacheControl: '' }; };
    // Drie gelijktijdige authorize-verzoeken voor nieuwe adressen vanaf één IP: hoogstens twee mogen gaan ophalen.
    const drie = [0, 1, 2].map((i) => klantVoorId(`https://wedloop-${stempel}-${i}.example/c.json`, ipW, wachtend));
    const uitkomst: Array<Awaited<(typeof drie)[number]>> = [null, null, null];
    drie.forEach((p, i) => { void p.then((k) => { uitkomst[i] = k; }); });
    const grens = Date.now() + 3000;
    while (Date.now() < grens && gestart + uitkomst.filter(Boolean).length < 3) await new Promise((r) => setTimeout(r, 20));
    const limieten = uitkomst.filter((k) => !!k && 'fout' in k && k.fout === 'CIMD_LIMIET').length;
    is(gestart === 2 && limieten === 1, `gelijktijdig per IP: 2 ophalingen, 1 × CIMD_LIMIET (gestart ${gestart}, CIMD_LIMIET ${limieten})`);
    vrij();
    await Promise.all(drie);
    // De teller is in finally vrijgegeven: een volgend verzoek van hetzelfde IP mag weer ophalen.
    const daarna = await klantVoorId(`https://wedloop-${stempel}-3.example/c.json`, ipW, async () => ({ status: 404, contentType: 'application/json', body: '{}', cacheControl: '' }));
    is(!!daarna && 'fout' in daarna && daarna.fout === 'CIMD_STATUS', `teller per IP vrijgegeven (${JSON.stringify(daarna)})`);

    // Vol procesplafond: bekende klant (rij in de tabel, verlopen cachewaarde) gaat door; een nieuwe klant krijgt 503 «server bezet».
    _legeCimdCache();
    const idTabel = `https://bekend-${stempel}.example/c.json`;
    const cb = 'https://claude.ai/api/mcp/auth_callback';
    await st.upsertClient(idTabel, 'Claude', [cb]);
    await cimdKlant(idTabel, regels, async () => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ client_id: idTabel, client_name: 'Claude', redirect_uris: [cb] }), cacheControl: 'max-age=60' }), Date.now() - 120_000);
    let los: () => void = () => undefined;
    const vast = new Promise<void>((r) => { los = r; });
    const bezet = Array.from({ length: MAX_GELIJKTIJDIG }, (_, i) => cimdKlant(`https://bezet-${stempel}-${i}.example/c.json`, regels, async () => { await vast; return { status: 404, contentType: 'application/json', body: '{}', cacheControl: '' }; }).catch(() => null));
    try {
      const kt = await klantVoorId(idTabel, '198.51.100.9', async () => { throw new Error('mag niet ophalen'); });
      is(!!kt && !('fout' in kt) && kt.client_id === idTabel, `bekende klant bij vol plafond: verlopen cachewaarde (${JSON.stringify(kt)})`);
      const a = await authorize({ client_id: `https://nieuw-bezet-${stempel}.example/c.json`, redirect_uri: cb, response_type: 'code' }, '198.51.100.10');
      const tekst = String(a.body);
      is(a.statusCode === 503 && /Сервер зараз зайнятий/.test(tekst) && /De server is nu bezet/.test(tekst) && /CIMD_BEZET/.test(tekst) && !/з цієї адреси|vanaf dit adres/.test(tekst), `authorize bij vol plafond → 503 «server bezet» uk/nl (${a.statusCode}: ${tekst.slice(0, 80)})`);
    } finally { los(); await Promise.all(bezet); _legeCimdCache(); }
  }

  // ---------------------------------------------------------------- 6. studio niet onder impersonatie en niet voor agenten
  for (const r of ['POST /api/owner/mcp-inspector/overzicht', 'POST /api/owner/mcp-inspector/uitvoeren', 'POST /api/owner/mcp-inspector/klanten']) {
    is(routeOordeel(r, false) === 'IMPERSONATIE_VERBODEN' && routeOordeel(r, true) === 'IMPERSONATIE_VERBODEN', `impersonatie verboden: ${r}`);
    is(agentRouteVerboden(r), `agent (namens) verboden: ${r}`);
  }

  // ---------------------------------------------------------------- 7. demping begrensd
  _resetDemping();
  const nu = 9_000_000;
  for (let i = 0; i < DEMPING_MAX + 1500; i++) eenKeerPer(`proef:${i}`, 10 * 60 * 1000, nu);
  is(_dempingGrootte() <= DEMPING_MAX, `demping blijft binnen ${DEMPING_MAX} (${_dempingGrootte()})`);
  is(!eenKeerPer(`proef:${DEMPING_MAX + 1499}`, 10 * 60 * 1000, nu), 'recente sleutel blijft gedempt');
  _resetDemping();
  const startBron = readFileSync('server/start.ts', 'utf8');
  is(startBron.indexOf('rateLimitAfwijzingDetail(method, apiUrl.pathname, ip)') < startBron.indexOf('if (connector && isMcpRpcPad(apiUrl.pathname) && mcpOriginGeweigerd(req))'), 'Origin-controle na de limiet per IP');
  is(!/ip: clientIp\(req\) \}/.test(startBron) && /ipHash: ipHash\(ip\)/.test(startBron), 'geen leesbaar IP in owner.mcp.origin.denied');

  // ---------------------------------------------------------------- 8. geen echo van grote waarden
  const lang = `2026-${'x'.repeat(10_000)}`;
  const m1 = controleerModerneMeta({ jsonrpc: '2.0', method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': lang } } }, '2026-07-28');
  const m2 = controleerModerneMeta({ jsonrpc: '2.0', method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': lang } } });
  for (const m of [m1, m2]) is(!m.ok && m.message.length < 400, `versie afgekapt in melding (${m.ok ? 'ok' : m.message.length})`);
  const lvl = await behandelMcpProtocolMethode(basis, 'logging/setLevel', { level: 'y'.repeat(5000) });
  is(lvl !== null && lvl.soort === 'error' && lvl.message.length < 200, 'logniveau afgekapt in melding');
  const bron = await behandelMcpProtocolMethode(basis, 'resources/read', { uri: `mr://${'z'.repeat(5000)}` });
  is(bron !== null && bron.soort === 'error' && bron.message.length < 400, 'onbekende bron afgekapt in melding');

  // ---------------------------------------------------------------- 9. studio: limiet per gebruiker
  const insp = readFileSync('backend/mcp-inspector-routes.ts', 'utf8');
  const u = insp.indexOf("'POST /api/owner/mcp-inspector/uitvoeren'");
  is(u > 0 && insp.indexOf('rateLimit(`mcp-rpc:insp:${userId}`, 120, 60)', u) > u && insp.indexOf('rateLimit(`mcp-rpc:insp:${userId}`, 120, 60)', u) < insp.indexOf('const body = lichaam(ctx.body);', u), '/uitvoeren: limiet 120/min vóór elk werk');

  if (fouten) { console.error(`sec-002-slot-m: ${fouten} fout(en), ${ok} goed`); return 1; }
  console.log(`✓ sec-002-slot-m: ${ok} controles goed`);
  return 0;
}
