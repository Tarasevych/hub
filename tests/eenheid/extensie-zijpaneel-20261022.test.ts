// Zijpaneel van de extensie 0.7.0 — chat «ШІ для вас» bij het actieve tabblad (zone E, 22.10.2026; backend/extensie-zijpaneel.ts).
//  - alleen met het agenttoken van een slot dat NU een lopende ontgrendeling heeft; technisch slot alleen met een levende technische
//    kant; alleen met het recht «API-platform»; anders een eerlijke code (401 TOKEN_INVALID, 403 EXTENSIE_VERGRENDELD,
//    403 TECH_PROFILE_OFF, 403 API_RECHT_VEREIST);
//  - het model krijgt ALLEEN browserhulpmiddelen (browser_* en devtools-namen) — geen mail, geen apparaten;
//  - elke aanroep gaat naar DEZE browser (args.browser overschreven, ook als het model een andere noemt), met de bron
//    ZIJPANEEL_KLANT en de ruimte van het slot in mcp-namens; niet-browserhulpmiddelen → NOT_ALLOWED zonder uitvoering;
//  - het adres van het tabblad gaat zonder query mee; app.audit krijgt de chat; CSRF: alleen chrome-extension:// zonder cookie.
import { randomBytes } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';
import { newCommandKey, randomToken, sealCommandKey, sha256 } from '../../backend/connectors-crypto';
import * as store from '../../backend/connectors-opslag';
import * as eo from '../../backend/extensie-ontgrendeling';
import { extensieZijpaneelRoutes, ZIJPANEEL_KLANT } from '../../backend/extensie-zijpaneel';
import { huidigeNamens } from '../../backend/mcp-namens';
import { ontgrendelVoorTest } from './hulp/extensie-ontgrendeling';

type Antw = { statusCode: number; body: string };
const lees = (r: unknown) => JSON.parse((r as Antw).body || '{}');

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-zijpaneel-20261022');
  const sys = getPool('systeem');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const A = `ezp-a-${T}`, B = `ezp-b-${T}`;
  const ids = [A, B];
  try {
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3), ($4, $5, $6)', [
      'users', A, { email: `${A}@example.test`, role: 'user', status: 'approved', name: A, entitlements: ['api-platform'] },
      'users', B, { email: `${B}@example.test`, role: 'user', status: 'approved', name: B }]);
    const browser = async (uid: string, ruimte: 'prive' | 'technisch') => {
      const tok = randomToken(32);
      const agent = await store.createAgent(uid, `Chrome ${ruimte} ${uid}`, 'browser', sha256(tok), {}, undefined, { pairingId: `p${uid}${ruimte}`.replace(/[^A-Za-z0-9]/g, ''), commandKeyEnc: sealCommandKey(newCommandKey(), uid, sha256(tok)), version: '0.7.0', ruimte });
      return { agent, tok };
    };
    const AP = await browser(A, 'prive'), AT = await browser(A, 'technisch'), BP = await browser(B, 'prive');
    const tokZonder = await browser(A, 'prive'); // tweede privékoppeling van A, ZONDER ontgrendeling
    await ontgrendelVoorTest(AP.agent.id, A, { caps: ['browser.read', 'browser.interact'], minuten: 60 });
    await ontgrendelVoorTest(AT.agent.id, A, { caps: ['browser.read'], domeinen: ['admin.tarasevych.com'], minuten: 60 });
    await ontgrendelVoorTest(BP.agent.id, B, { caps: ['browser.read'], minuten: 60 });

    // nep-model: eerst twee tool_use (browser_snapshot met een VREEMDE browser, en mail_send), daarna tekst
    const verzoeken: Array<{ tools: string[]; laatste: string }> = [];
    const aanroepen: Array<{ name: string; args: Record<string, unknown>; client: string; ruimte: string }> = [];
    let ronde = 0;
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body || '{}'));
      const laatsteUser = [...b.messages].reverse().find((m: { role: string; content: unknown }) => m.role === 'user' && typeof m.content === 'string');
      verzoeken.push({ tools: (b.tools || []).map((t: { name: string }) => t.name), laatste: laatsteUser ? laatsteUser.content : '' });
      ronde += 1;
      const content = ronde % 2 === 1
        ? [{ type: 'tool_use', id: 't1', name: 'browser_snapshot', input: { browser: BP.agent.id } }, { type: 'tool_use', id: 't2', name: 'mail_send', input: { to: 'x@example.test' } }]
        : [{ type: 'text', text: 'Готово: я прочитав сторінку.' }];
      return new Response(JSON.stringify({ content, stop_reason: ronde % 2 === 1 ? 'tool_use' : 'end_turn' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const chatDeps = {
      getApiKey: async () => 'sk-test-niet-echt',
      listTools: async () => ['browser_snapshot', 'take_snapshot', 'browser_click', 'mail_send', 'machine_exec', 'drive_read_file'].map((name) => ({ name, description: name, inputSchema: { type: 'object' } })),
      callTool: async (_userId: string, name: string, args: unknown) => {
        const n = huidigeNamens();
        aanroepen.push({ name, args: args as Record<string, unknown>, client: String(n?.client || ''), ruimte: String(n?.ruimte || '') });
        return { content: [{ type: 'text' as const, text: '{"url":"https://mail.tarasevych.com/"}' }] };
      },
      fetchImpl,
    };
    const routes = extensieZijpaneelRoutes({ chatDeps, limiet: async () => true });
    const roep = (tok: string, body: Record<string, unknown>) => routes['POST /api/owner/agents/extensie/chat'][0]({ event: { headers: { authorization: `Bearer ${tok}` } }, body } as never);
    const vraag = { messages: [{ role: 'user', content: 'Що на цій сторінці?' }], tab: { url: 'https://mail.tarasevych.com/postvak-in?q=geheim#x', title: 'Пошта' } };

    // ---------------------------------------------------------------- toegang
    check('ongeldig token → 401 TOKEN_INVALID', (await roep('kort', vraag) as Antw).statusCode === 401 && lees(await roep(randomToken(32), vraag)).error === 'TOKEN_INVALID');
    const zonder = await roep(tokZonder.tok, vraag) as Antw;
    check('slot zonder lopende ontgrendeling → 403 EXTENSIE_VERGRENDELD (het model wordt niet eens gevraagd)', zonder.statusCode === 403 && lees(zonder).error === 'EXTENSIE_VERGRENDELD' && verzoeken.length === 0);
    const tech = await roep(AT.tok, vraag) as Antw;
    check('technisch slot met ontgrendeling maar zonder levende technische kant → 403 TECH_PROFILE_OFF', tech.statusCode === 403 && lees(tech).error === 'TECH_PROFILE_OFF');
    const geenRecht = await roep(BP.tok, vraag) as Antw;
    check('gebruiker zonder «API-platform» → 403 API_RECHT_VEREIST', geenRecht.statusCode === 403 && lees(geenRecht).error === 'API_RECHT_VEREIST');
    check('laatste bericht moet een vraag zijn → 400', (await roep(AP.tok, { messages: [{ role: 'assistant', content: 'x' }] }) as Antw).statusCode === 400);

    // ---------------------------------------------------------------- de chat zelf
    const ok = await roep(AP.tok, vraag) as Antw;
    const d = lees(ok);
    check('geldige chat → 200 met antwoord, stappen en model', ok.statusCode === 200 && /Готово/.test(d.reply) && Array.isArray(d.steps) && d.steps.length === 2 && typeof d.model === 'string', ok.body.slice(0, 200));
    check('het model krijgt ALLEEN browserhulpmiddelen (browser_* en devtools-namen)', JSON.stringify(verzoeken[0]?.tools) === '["browser_snapshot","take_snapshot","browser_click"]', JSON.stringify(verzoeken[0]?.tools));
    check('elke aanroep gaat naar DEZE browser: args.browser overschreven (het model noemde de browser van B)', aanroepen.length === 1 && aanroepen[0].name === 'browser_snapshot' && aanroepen[0].args.browser === AP.agent.id, JSON.stringify(aanroepen));
    check('mail_send (geen browserhulpmiddel) → NOT_ALLOWED zonder uitvoering; stap gemeld als fout', !aanroepen.some((x) => x.name === 'mail_send') && d.steps.find((s: { tool: string; isError: boolean }) => s.tool === 'mail_send')?.isError === true);
    check('bron in mcp-namens: ZIJPANEEL_KLANT met de ruimte van het slot (prive)', aanroepen[0].client === ZIJPANEEL_KLANT && aanroepen[0].ruimte === 'prive');
    check('adres van het tabblad zonder query en fragment in de vraag', /\[Активна вкладка: https:\/\/mail\.tarasevych\.com\/postvak-in — «Пошта»/.test(verzoeken[0].laatste) && !verzoeken[0].laatste.includes('geheim'), verzoeken[0].laatste.slice(0, 120));
    const audit = (await sys.query("SELECT result, details FROM app.audit WHERE owner_id = $1 AND action = 'owner.extensie.zijpaneel.chat' ORDER BY created_at DESC LIMIT 1", [A])).rows[0];
    check('app.audit: owner.extensie.zijpaneel.chat met agent, ruimte en stappen', audit?.result === 'success' && audit.details.agentId === AP.agent.id && audit.details.ruimte === 'prive' && audit.details.stappen.join() === 'browser_snapshot,mail_send');
    // intrekken → meteen dicht
    await eo.intrekken(A, { agentId: AP.agent.id }, 'site', 'site');
    check('na intrekken van de ontgrendeling → 403 EXTENSIE_VERGRENDELD', lees(await roep(AP.tok, vraag)).error === 'EXTENSIE_VERGRENDELD');

    // ---------------------------------------------------------------- CSRF-regel van de site
    const { csrfAfwijzing } = await import('../../server/start');
    const ext = 'chrome-extension://ofpffonakgjioahgfejmiblfmbkobmmi';
    check('CSRF: zijpaneelroute vanaf chrome-extension:// zonder cookie toegestaan; mét cookie of een andere route geweigerd',
      csrfAfwijzing('POST', { origin: ext }, '/api/owner/agents/extensie/chat') === '' && csrfAfwijzing('POST', { origin: ext, cookie: 'x=y' }, '/api/owner/agents/extensie/chat') === 'CSRF_ORIGIN_DENIED'
      && csrfAfwijzing('POST', { origin: ext }, '/api/owner/ai/werkruimte/chat') === 'CSRF_ORIGIN_DENIED');
  } finally {
    await sys.query('DELETE FROM app.extensie_ontgrendelingen WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [ids]).catch(() => undefined);
    eo._testReset();
    await closePool();
  }
  return einde();
}
