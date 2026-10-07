// Site-hulpmiddelen van de MCP-connector (mail, agenda, schijf, zoeken), modi per hulpmiddel (always / ask / off), de wachtrij voor
// goedkeuring, en het interne aanroepen van routes van de site namens de gebruiker (backend/site-dispatch.ts).
// Tegen een wegwerp-PG. Google wordt nagebootst: de interne aanroeper is vervangen door een stub, behalve in het blok over de echte router.
import { randomUUID } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import * as store from '../../backend/connectors-store';
import { approveToolCall, callTool, defaultMode, describeTools, effectiveMode, listTools, RISKY_TOOLS, rejectToolCall } from '../../backend/connectors-tools';
import { callSite, gedelegeerdeSessie, TOEGESTANE_ROUTES, zetSiteAanroeper } from '../../backend/site-dispatch';
import { compact, explainSiteError, SITE_TOOLS } from '../../backend/site-tools';
import { checker, nepGoogle } from './hulp/nep-google';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => Promise<boolean> | boolean, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(50); }
  return false;
}
const body = (r: { content: Array<{ text?: string }> }) => JSON.parse(String(r.content[0].text));

export async function main(): Promise<number> {
  const { check, einde } = checker('site-tools');
  const sys = getPool('systeem');
  const A = `site-A-${randomUUID()}`;
  const B = `site-B-${randomUUID()}`;
  const gebruikers: string[] = [];
  const nep = await nepGoogle({ ownerEmail: `eigenaar-site-${randomUUID()}@example.test` });
  try {
    // ---- catalogus ----
    const namen = SITE_TOOLS.map((s) => s.tool.name);
    check('catalogus: 26 site-hulpmiddelen, unieke namen, elk met titel en annotaties; lezen is readOnly, wijzigen niet',
      SITE_TOOLS.length === 26 && new Set(namen).size === 26 && SITE_TOOLS.every((s) => !!s.tool.title && !!s.tool.annotations)
      && SITE_TOOLS.filter((s) => !s.write).every((s) => s.tool.annotations?.readOnlyHint === true) && SITE_TOOLS.filter((s) => s.write).every((s) => s.tool.annotations?.readOnlyHint === false), namen.join(','));
    const voorbeeld = (schema: any) => {
      const args: Record<string, unknown> = {};
      for (const k of schema.required ?? []) { const p = schema.properties[k]; args[k] = p.enum ? p.enum[0] : p.type === 'string' ? 'abc123' : 1; }
      return args;
    };
    check('catalogus: elke route van elk hulpmiddel staat in de toegestane lijst (en alleen routes met methode + pad)',
      SITE_TOOLS.every((s) => TOEGESTANE_ROUTES.has(s.request(voorbeeld(s.tool.inputSchema)).route)) && [...TOEGESTANE_ROUTES].every((r) => /^POST \/api\/(owner|mcp)\//.test(r)));
    check('catalogus: elke parameter is beschreven en onbekende velden zijn niet toegestaan',
      SITE_TOOLS.every((s) => (s.tool.inputSchema as any).additionalProperties === false && Object.values((s.tool.inputSchema as any).properties as Record<string, any>).every((p) => typeof p.description === 'string' && p.description.length > 10)));
    check('standaardmodus: lezen = always; schrijven op de site = ask; riskant = off, maar de gebruiker mag het zelf op always zetten',
      defaultMode('mail_search_messages') === 'always' && defaultMode('mail_modify_message') === 'ask' && defaultMode('machine_read_file') === 'always'
      && defaultMode('machine_exec') === 'off' && effectiveMode('machine_exec', 'always') === 'always' && effectiveMode('mail_modify_message', 'always') === 'always'
      && effectiveMode('browser_click', undefined) === 'off' && effectiveMode('browser_snapshot', 'off') === 'off' && RISKY_TOOLS.size === 10);
    check('inkorten: HTML en andere zware velden verdwijnen, lange teksten en lijsten worden afgekapt',
      JSON.stringify(compact({ a: 'x'.repeat(5000), renderBody: '<b>x</b>', lijst: Array.from({ length: 80 }, (_, i) => i) }))
        .includes('[cut]') && !JSON.stringify(compact({ renderBody: '<b>x</b>' })).includes('<b>') && (compact({ lijst: Array.from({ length: 80 }, (_, i) => i) }) as any).lijst.length === 61);
    check('foutmeldingen: "niet gekoppeld" en "geen recht" worden duidelijke uitleg voor het model',
      /No Google account is connected/.test(explainSiteError(409, { error: 'GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED' })) && /no permission/.test(explainSiteError(403, { error: 'GOOGLE_MAIL_SCOPE_MISSING' })));

    // ---- gedrag met een nagebootste site ----
    const aanroepen: Array<{ userId: string; service: string; route: string; body: any }> = [];
    let antwoord: { status: number; data: any } = { status: 200, data: { messages: [{ id: 'm1', subject: 'Hallo', from: 'anna@example.test', snippet: 'tekst', renderBody: '<p>zwaar</p>' }], resultSizeEstimate: 1 } };
    zetSiteAanroeper(async (userId, service, route, b) => { aanroepen.push({ userId, service, route, body: b }); return antwoord; });

    const zoek = await callTool(A, 'mail_search_messages', { query: 'from:anna', max_results: 7 });
    check('lezen (standaard always): direct uitgevoerd via de route van de site, camelCase-body, antwoord ingekort en als onbetrouwbaar gemarkeerd',
      !zoek.isError && aanroepen.length === 1 && aanroepen[0].route === 'POST /api/owner/mail/google-suite/messages' && aanroepen[0].userId === A && aanroepen[0].service === 'mail'
      && aanroepen[0].body.query === 'from:anna' && aanroepen[0].body.maxResults === 7 && body(zoek).data.count === 1 && !JSON.stringify(body(zoek)).includes('zwaar') && /untrusted/i.test(body(zoek).notice));
    const slecht = [await callTool(A, 'mail_read_message', { message_id: 'a;b' }), await callTool(A, 'mail_modify_message', { message_id: 'abc123', action: 'delete' }),
      await callTool(A, 'calendar_list_events', { time_min: 'gisteren' }), await callTool(A, 'drive_browse', { folder_id: '../x' }), await callTool(A, 'mail_search_messages', { max_results: 500 })];
    check('ongeldige parameters worden op de server geweigerd, vóór de site wordt aangeroepen', slecht.every((r) => r.isError === true && /Invalid/.test(r.content[0].text as string)) && aanroepen.length === 1);
    const voorGh = aanroepen.length;
    antwoord = { status: 200, data: { repos: [{ fullName: 'o/a', stars: 1 }], page: 1 } };
    const gh = await callTool(A, 'github_list_repos', { query: 'a' });
    const ghSlecht = [await callTool(A, 'github_list_issues', { repo: '../etc/passwd' }), await callTool(A, 'github_list_issues', { repo: 'o/a', state: 'bogus' }), await callTool(A, 'github_create_issue', { repo: 'o/a', title: 'x' })];
    check('github-hulpmiddelen: lezen via de github-route met service "github", ongeldige repo/state/titel geweigerd vóór de site, schrijven staat standaard op "vragen"',
      !gh.isError && aanroepen[voorGh].route === 'POST /api/owner/github/repos' && aanroepen[voorGh].service === 'github' && ghSlecht.every((r) => r.isError === true) && aanroepen.length === voorGh + 1);
    antwoord = { status: 409, data: { error: 'GITHUB_TOKEN_MISSING' } };
    const ghGeenToken = await callTool(A, 'github_status', {});
    check('GitHub zonder token geeft een uitleg met de stappen om te koppelen', ghGeenToken.isError === true && /key vault/.test(ghGeenToken.content[0].text as string));
    antwoord = { status: 409, data: { error: 'GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED' } };
    const nietGekoppeld = await callTool(A, 'mail_list_accounts', {});
    check('een fout van de site wordt een duidelijke melding (isError)', nietGekoppeld.isError === true && /No Google account is connected/.test(nietGekoppeld.content[0].text as string));
    antwoord = { status: 200, data: { ok: true } };

    // wijzigen: standaard ask -> wachtrij, nog niets uitgevoerd tot de gebruiker goedkeurt
    const voor = aanroepen.length;
    const wacht = callTool(A, 'mail_modify_message', { message_id: 'abc123', action: 'archive' });
    check('wijzigen (standaard ask): komt in de wachtrij en de site wordt nog NIET aangeroepen', await until(async () => (await store.listToolCalls(A)).filter((c) => c.status === 'pending_approval').length === 1) && aanroepen.length === voor);
    const open = (await store.listToolCalls(A)).find((c) => c.status === 'pending_approval')!;
    check('een andere gebruiker ziet de wachtrij niet en kan niets goedkeuren of weigeren',
      (await store.listToolCalls(B)).length === 0 && (await approveToolCall(B, open.id)) === null && (await rejectToolCall(B, open.id)) === null && aanroepen.length === voor);
    const goedgekeurd = await approveToolCall(A, open.id);
    const uitkomst = await wacht;
    check('na goedkeuren: de wijziging wordt uitgevoerd en de wachtende AI krijgt het resultaat',
      goedgekeurd?.status === 'succeeded' && !uitkomst.isError && aanroepen.length === voor + 1 && aanroepen[voor].route === 'POST /api/owner/mail/google-suite/message/modify'
      && aanroepen[voor].body.messageId === 'abc123' && aanroepen[voor].body.action === 'archive');
    check('dubbel goedkeuren kan niet (alleen vanuit "wacht op goedkeuring")', (await approveToolCall(A, open.id)) === null && aanroepen.length === voor + 1);

    const w2 = callTool(A, 'mail_modify_message', { message_id: 'def456', action: 'trash' });
    await until(async () => (await store.listToolCalls(A)).filter((c) => c.status === 'pending_approval').length === 1);
    await rejectToolCall(A, (await store.listToolCalls(A)).find((c) => c.status === 'pending_approval')!.id);
    const geweigerd = await w2;
    check('weigeren: de AI hoort dat de gebruiker weigerde en de site wordt niet aangeroepen', geweigerd.isError === true && /rejected/.test(geweigerd.content[0].text as string) && aanroepen.length === voor + 1);

    // verlopen aanroepen kunnen niet meer goedgekeurd worden
    const oud = await store.createToolCall(A, 'mail_modify_message', { message_id: 'abc123', action: 'archive' });
    await sys.query("UPDATE app.connector_tool_calls SET created_at = now() - interval '11 minutes' WHERE id = $1", [oud.id]);
    await store.listToolCalls(A);
    check('verlopen wachtende aanroep (>10 min): niet meer goed te keuren', (await approveToolCall(A, oud.id)) === null && (await store.getToolCall(A, oud.id))?.status === 'timeout' && aanroepen.length === voor + 1);

    // modi
    await store.setToolModes(A, { mail_modify_message: 'always' });
    const direct = await callTool(A, 'mail_modify_message', { message_id: 'abc123', action: 'read' });
    check('modus always (gekozen door de gebruiker): wijziging zonder wachtrij', !direct.isError && aanroepen.length === voor + 2);
    await store.setToolModes(A, { mail_search_messages: 'ask' });
    const w3 = callTool(A, 'mail_search_messages', { query: 'x' });
    const gevraagd = await until(async () => (await store.listToolCalls(A)).filter((c) => c.status === 'pending_approval').length === 1);
    await rejectToolCall(A, (await store.listToolCalls(A)).find((c) => c.status === 'pending_approval')!.id);
    await w3;
    check('modus ask op een leesopdracht: de gebruiker kan ook lezen laten wachten op een klik', gevraagd === true);
    await store.setToolModes(A, { mail_search_messages: 'off', machine_exec: 'always' });
    const weg = await callTool(A, 'mail_search_messages', { query: 'x' });
    const lijst = (await listTools(A, { alwaysMachine: true })).map((t) => t.name);
    const info = await describeTools(A);
    const exec = info.find((t) => t.name === 'machine_exec')!;
    check('modus off: weg uit de lijst en geweigerd; riskant staat standaard uit en "always" wordt gehonoreerd (geen begrenzing meer)',
      weg.isError === true && /turned off/.test(weg.content[0].text as string) && !lijst.includes('mail_search_messages') && lijst.length === 39 && lijst.includes('machine_exec') && !lijst.includes('browser_click')
      && exec.mode === 'always' && exec.risky === true && info.find((t) => t.name === 'browser_click')!.mode === 'off' && info.find((t) => t.name === 'mail_search_messages')!.mode === 'off' && info.length === 49);
    check('groepen in het overzicht: apparaten, browser, mail, agenda, schijf, zoeken',
      ['devices', 'browser', 'mail', 'calendar', 'drive', 'site'].every((g) => info.some((t) => t.group === g)) && info.filter((t) => t.group === 'mail').length === 5 && info.filter((t) => t.group === 'browser').length === 14);
    await store.setToolModes(A, { mail_search_messages: null, machine_exec: null, mail_modify_message: null });
    check('terug naar de standaard (modus verwijderen)', (await store.getToolModes(A)).mail_modify_message === undefined && (await describeTools(A)).find((t) => t.name === 'mail_modify_message')!.mode === 'ask');
    check('oude lijst "uitgezet" (0012) blijft werken: telt als off, en terugzetten verwijdert het',
      await (async () => { await store.setDisabledTools(A, ['drive_browse']); const off = (await store.getToolModes(A)).drive_browse === 'off'; await store.setDisabledTools(A, []); return off && (await store.getToolModes(A)).drive_browse === undefined; })());

    // ---- echte router: de gedelegeerde sessie ----
    zetSiteAanroeper(null);
    const aanmaken = async (status: string, role = 'member') => {
      const id = randomUUID();
      await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [id, { email: `site-${id}@example.test`, role, status, accessLevel: 'full', name: 'Test' }]);
      gebruikers.push(id);
      return id;
    };
    const goed = await aanmaken('approved');
    const geblokkeerd = await aanmaken('blocked');
    const echt = await callSite(goed, 'hub', 'POST /api/owner/global-search', { query: 'testzoekterm' });
    check('echte router: een gedelegeerde aanroep krijgt de sessie van precies die gebruiker (200 op een route die anders een sessie vraagt)', echt.status === 200 && Array.isArray(echt.data?.results ?? echt.data?.items ?? []), JSON.stringify(echt).slice(0, 160));
    const blok = await callSite(geblokkeerd, 'hub', 'POST /api/owner/global-search', { query: 'testzoekterm' });
    const onbekend = await callSite(randomUUID(), 'hub', 'POST /api/owner/global-search', { query: 'testzoekterm' });
    check('echte router: een geblokkeerde of onbekende gebruiker krijgt geen sessie (403)', blok.status === 403 && onbekend.status === 403);
    const anoniem = await nep.handler({ headers: { host: 'hub.tarasevych.com', origin: 'https://hub.tarasevych.com', 'content-type': 'application/json', 'x-mcp-gedelegeerd': goed, 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify({ query: 'testzoekterm', service: 'hub' }), isBase64Encoded: false,
      rawPath: '/api/owner/global-search', rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: '/api/owner/global-search', sourceIp: '203.0.113.9', userAgent: 'x' } } } as never);
    check('echte router: een gewoon HTTP-verzoek is nooit "gedelegeerd" (ook niet met een verzonnen header): 403', (anoniem as { statusCode: number }).statusCode === 403 && gedelegeerdeSessie({}) === undefined && gedelegeerdeSessie(null) === undefined && gedelegeerdeSessie({ headers: { 'x-mcp-gedelegeerd': goed } }) === undefined);
    let geweigerdeRoute = '';
    try { await callSite(goed, 'hub', 'POST /api/owner/admin/users/delete', {}); } catch (e) { geweigerdeRoute = (e as Error).message; }
    check('alleen toegestane routes zijn bereikbaar voor de hulpmiddelen', geweigerdeRoute === 'SITE_ROUTE_NOT_ALLOWED');
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    zetSiteAanroeper(null);
    nep.herstel();
    await sys.query('DELETE FROM app.connector_tool_calls WHERE user_id = ANY($1)', [[A, B]]);
    await sys.query('DELETE FROM app.connector_tool_settings WHERE user_id = ANY($1)', [[A, B]]);
    if (gebruikers.length) await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [gebruikers]);
  }
  await closePool();
  return einde();
}
