// AGENTSCHEIDING-001 (16.11.2026) — «Керувати Claude» змінює лише Claude, а назва в інтерфейсі — саме того ШІ.
//
// Павло: «якщо керувати клаудом раптово змінює не лише для claude то це не нормально … даєш дозвіл одному і десь раптом спливає
// назва claude». Знайдені причини (усі перевіряються тут на справжній базі через справжні маршрути):
//   (1) сторінка агента без активного підключення слала verbindingId '*', а activeer-tech робив з цього alleVerbindingen=true —
//       дозвіл технічного простору ВСІМ ШІ;
//   (2) activeer-tech приймав verbindingId іншого агента (токен ChatGPT або 'agent:gpt') і змінював доступ того ШІ;
//   (3) клієнт без назви ставав «Claude» (реєстрація), і такий токен вважався токеном Claude (agentSlugUitNaam);
//   (4) усі події підключень ШІ в центрі сповіщень мали розділ і логотип «Claude».
// Без мережі; потрібна база (DATABASE_URL). Запуск: node scripts/eenheidstests.mjs agentscheiding-20261116
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checker, nepGoogle } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';
import { agentUrl, weergaveNaam, type AgentSlug } from '../../shared/connector-v2/agenten';
import { pasModusToe } from '../../shared/connector-v2/rechten';
import { aiBron, siteEventsFromAudit } from '../../backend/site-activiteit';
import { bootsKlantNa } from '../../shared/ai-verbinding';

const parseJson = (s: string) => (s ? JSON.parse(s) : null);
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const kopVan = (r: { headers: Record<string, string> }, n: string) => Object.entries(r.headers).find(([k]) => k.toLowerCase() === n)?.[1] ?? '';
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };

export async function main(): Promise<number> {
  const { check, einde } = checker('agentscheiding-20261116');

  // ------------------------------------------------------------------ чисті перевірки (без бази)
  check('weergaveNaam: підключення для агента має назву САМЕ цього агента; чужа назва чи безіменний клієнт не стає «Claude»',
    weergaveNaam('Claude', 'gpt') === 'ChatGPT' && weergaveNaam('Claude Code', 'claude') === 'Claude Code' && weergaveNaam('MCP · localhost', 'codex') === 'Codex'
    && weergaveNaam('', 'grok') === 'Grok' && weergaveNaam('Mijn tool', 'gpt') === 'ChatGPT' && weergaveNaam('Cursor', null) === 'Cursor');
  // ANTISPOOF-001: підробка через назву
  check('підробка назвою: «Сlaude» (кирилична С), «C.l.a.u.d.e», «Grоk», «0penAI» розпізнано як імітацію; справжні назви — ні',
    bootsKlantNa('Сlaude') === 'claude' && bootsKlantNa('C.l.a.u.d.e') === 'claude' && bootsKlantNa('Grоk') === 'grok' && bootsKlantNa('0penAI') === 'chatgpt'
    && ['Claude', 'Claude Code', 'ChatGPT', 'Cursor', 'GitHub Copilot', 'Gemini CLI', 'My tool'].every((n) => bootsKlantNa(n) === null));
  check('підробка назвою в списках: вільна чи схожа назва ніколи не стоїть поруч з ім’ям агента',
    weergaveNaam('Сlaude ✓ офіційний', 'gpt') === 'ChatGPT' && weergaveNaam('Claude ✓', 'claude') === 'Claude' && weergaveNaam('Claude Code', 'claude') === 'Claude Code');
  check('центр сповіщень: подія підключення ШІ має логотип свого ШІ (agent → клієнт), невідомий — без логотипа Claude',
    aiBron({ agent: 'gpt' }) === 'claude:chatgpt' && aiBron({ client: 'Grok' }) === 'claude:grok' && aiBron({ agent: 'claude' }) === 'claude:claude'
    && aiBron({ client: 'MCP · localhost' }) === 'claude' && aiBron({}) === 'claude');
  const ev = siteEventsFromAudit([{ id: '1', action: 'owner.mcp.grant.connected', result: 'success', createdAt: 1, details: { agent: 'gemini', clientName: 'Gemini' } }]);
  check('журнал → сповіщення: owner.mcp.* від Gemini йде з джерелом claude:gemini, не «Claude»', ev[0]?.source === 'claude:gemini', JSON.stringify(ev));
  const stijl = readFileSync('src/melding-stijl.tsx', 'utf8');
  check('назва розділу сповіщень — «Підключення ШІ», а не «Claude»; логотипи всіх ШІ є в реєстрі',
    stijl.includes("claude: { uk: 'Підключення ШІ', nl: 'AI-koppelingen'") && /chatgpt: \{ logo: 'openai'/.test(stijl) && /grok: \{ logo: 'grok'/.test(stijl)
    && !stijl.includes("mcp: ['Claude', 'Claude']") && !/section === 'claude' \? 'claude'/.test(stijl));
  const pagina = readFileSync('src/agenten/AgentPagina.tsx', 'utf8');
  check('сторінка агента більше не шле «*» без підключення; спільна служба позначена «! Спільна для всіх ШІ» з поясненням наслідку',
    !/grantId \|\| '\*'/.test(pagina) && pagina.includes("'! Спільна для всіх ШІ'") && /Від’єднує службу для ВСІХ ШІ, не лише для \$\{naam\}/.test(pagina));
  check('вікно згоди без назви клієнта не підставляє «Claude»', !/clientName \|\| 'Claude'/.test(readFileSync('src/McpToestemmingVenster.tsx', 'utf8')));
  check('підпис політики для одного ШІ шукає агента точно (не «назва містить slug»)',
    !/includes\(slugLaag\)/.test(readFileSync('src/agenten/beleid-ondertekenen.ts', 'utf8')));

  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_SYSTEM) {
    console.log('OVERGESLAGEN agentscheiding-20261116 (database): geen DATABASE_URL');
    return einde();
  }

  // ------------------------------------------------------------------ справжня база: власник, Claude і ChatGPT поруч
  const { getPool, closePool } = await import('../../server/platform/pg');
  const { alsSysteem } = await import('../../server/platform/context');
  const { totpStapOpVastleggen } = await import('../../backend/stap-op');
  const c = await import('../../backend/mcp-connector');
  const tp = await import('../../backend/tech-profiel');
  const trk = await import('../../backend/tech-ruimtes-kern');
  const sys = getPool('systeem');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const email = `agentscheiding-${T}@eenheid.test`;
  const sub = `sub-agentscheiding-${T}`;
  const oudeEigenaren = (await sys.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner'")).rows.map((r) => String(r.id));
  for (const id of oudeEigenaren) await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"member\"') WHERE tbl='users' AND id=$1", [id]);
  const G = await nepGoogle({ ownerEmail: email });
  const { handler } = await import('../../backend/index');
  let uid = '';
  let vlagVoor: { aan: boolean; gebruikers: string[] } | undefined;
  const clients: string[] = [];

  const koppel = async (slug: AgentSlug, naam: string | null, redirect: string) => {
    const reg = parseJson((await c.registerClient(JSON.stringify({ ...(naam ? { client_name: naam } : {}), redirect_uris: [redirect] }))).body);
    clients.push(reg.client_id);
    const p = pkce();
    const a = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, code_challenge: p.challenge, code_challenge_method: 'S256', state: 'st', resource: agentUrl(slug) });
    const rid = new URL(kopVan(a, 'location')).searchParams.get('consent') || '';
    const info = await c.consentInfo(rid, uid);
    const d = await c.consentDecide(uid, rid, true, null, 'prive', { kanten: ['gebruiker', 'beheer'], sleutels: pasModusToe([], 'alles', ['gebruiker', 'beheer']) });
    const code = 'redirect' in d ? new URL(d.redirect).searchParams.get('code') || '' : '';
    const tok = parseJson((await c.token(form({ grant_type: 'authorization_code', code, code_verifier: p.verifier, client_id: reg.client_id, redirect_uri: redirect }))).body);
    const rij = (await sys.query('SELECT id::text AS id, client_name, agent FROM app.mcp_oauth_tokens WHERE access_hash = $1', [createHash('sha256').update(String(tok?.access_token)).digest('hex')])).rows[0];
    return { grantId: String(rij?.id ?? ''), clientName: String(rij?.client_name ?? ''), agent: rij?.agent ?? null, consentNaam: String((info as any)?.naam ?? ''), regNaam: String(reg.client_name) };
  };

  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const aanm = await b.aanmelden(sub, email, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    check('власник увійшов на mcp.tarasevych.com', aanm.cb.data.sessionCreated === true);
    uid = String((await sys.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1", [email])).rows[0].id);
    await tp.profielVan({ id: uid, email, role: 'owner', status: 'approved' });
    // Прапорець спільний для всієї бази: запам'ятати й повернути у finally, інакше інші набори падають з GEBRUIK_RUIMTES_V2.
    vlagVoor = (await sys.query(`SELECT aan, gebruikers FROM app.feature_flags WHERE sleutel = 'tech-ruimtes-v2'`)).rows[0] as typeof vlagVoor;
    await sys.query(`UPDATE app.feature_flags SET aan = true, gebruikers = $1 WHERE sleutel = 'tech-ruimtes-v2'`, [[uid]]);
    trk._vlagCacheLeeg();
    await aiDienstAan(uid);
    const sessie = (await sys.query("SELECT id, (data->>'createdAt')::bigint AS created_at FROM app.records WHERE tbl='owner_service_sessions_v1' AND data->>'userId'=$1 ORDER BY (data->>'createdAt')::bigint DESC LIMIT 1", [uid])).rows[0];
    const cookie = Array.from(b.jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    const stapOp = async () => {
      const tabs = (await sys.query("SELECT id, (data->>'createdAt')::bigint AS created_at FROM app.records WHERE tbl='owner_tab_sessions_v1' AND data->>'anchorSessionId'=$1", [String(sessie.id)])).rows;
      await alsSysteem(async () => {
        await totpStapOpVastleggen({ user: { id: uid }, session: { id: String(sessie.id), createdAt: Number(sessie.created_at) } } as never);
        for (const t of tabs) await totpStapOpVastleggen({ user: { id: uid }, tabSession: { id: String(t.id), createdAt: Number(t.created_at) } } as never);
      });
    };
    const post = async (pad: string, extra: Record<string, unknown>) => {
      const host = 'mcp.tarasevych.com';
      const r = await handler({
        headers: { host, origin: `https://${host}`, 'content-type': 'application/json', cookie, 'user-agent': 'eenheid' },
        body: JSON.stringify({ service: 'mcp', tabContext: tab, sourceOrigin: `https://${host}`, ...extra }),
        isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {},
        requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } },
      } as never);
      return { status: r.statusCode, data: parseJson(String(r.body || '{}')) };
    };
    const rijen = async () => (await sys.query('SELECT verbinding_id, ingetrokken_op, ruimtes FROM app.tech_ruimte_ai WHERE user_id = $1 ORDER BY verbinding_id', [uid])).rows
      .map((r) => ({ vid: String(r.verbinding_id), actief: !r.ingetrokken_op && (r.ruimtes as string[]).includes('technisch') }));
    /** Заголовки сповіщень власника про доступ ШІ до технічного простору (центр сповіщень, app.records site_notifications). */
    const meldingen = async () => (await sys.query("SELECT data->>'title' AS t FROM app.records WHERE tbl='site_notifications' AND data->>'recipientUserId'=$1 ORDER BY (data->>'createdAt')::bigint", [uid])).rows
      .map((r) => String(r.t)).filter((t) => /технічн/i.test(t));

    const claude = await koppel('claude', 'Claude', 'https://claude.ai/api/mcp/auth_callback');
    const gpt = await koppel('gpt', 'ChatGPT', 'https://chatgpt.com/connector_platform_oauth_redirect');
    const codex = await koppel('codex', null, 'http://127.0.0.1:43123/callback');
    check('справжнє підключення Claude і ChatGPT (OAuth) — кожне зі своїм агентом', claude.grantId.length === 36 && gpt.grantId.length === 36 && claude.agent === 'claude' && gpt.agent === 'gpt',
      JSON.stringify({ claude, gpt }));
    check('клієнт без назви (локальний Codex) НЕ називається «Claude»: реєстрація нейтральна, вікно згоди й токен — «Codex»',
      codex.regNaam === 'MCP · 127.0.0.1' && codex.consentNaam === 'Codex' && codex.clientName === 'Codex' && codex.agent === 'codex', JSON.stringify(codex));

    // ANTISPOOF-001: реєстрація й вікно згоди
    const nep = parseJson((await c.registerClient(JSON.stringify({ client_name: 'Сlaude', redirect_uris: ['http://127.0.0.1:43124/cb'] }))).body);
    check('реєстрація з назвою-імітацією («Сlaude» з кириличною С) відхилена', nep?.error === 'invalid_client_metadata' && /na/.test(String(nep?.error_description)), JSON.stringify(nep));
    const infoVan = async (naam: string, redirect: string, slug: AgentSlug) => {
      const reg = parseJson((await c.registerClient(JSON.stringify({ client_name: naam, redirect_uris: [redirect] }))).body);
      clients.push(reg.client_id);
      const p = pkce();
      const a = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, code_challenge: p.challenge, code_challenge_method: 'S256', state: 's', resource: agentUrl(slug) });
      return c.consentInfo(new URL(kopVan(a, 'location')).searchParams.get('consent') || '', uid) as Promise<any>;
    };
    const echt = await infoVan('Claude', 'https://claude.ai/api/mcp/auth_callback', 'claude');
    const lokaal = await infoVan('Claude', 'http://127.0.0.1:43125/cb', 'gpt');
    check('вікно згоди: claude.ai — «підтверджено адресою»; локальна програма, що називає себе «Claude» на адресі ChatGPT — не підтверджено, і видно справжню заявлену назву (для попередження)',
      echt?.geverifieerd === true && lokaal?.geverifieerd === false && lokaal?.clientName === 'Claude' && lokaal?.klantGeclaimd === 'claude' && lokaal?.naam === 'ChatGPT' && lokaal?.klant === 'chatgpt',
      JSON.stringify({ echt: echt && { g: echt.geverifieerd }, lokaal: lokaal && { n: lokaal.clientName, k: lokaal.klantGeclaimd, g: lokaal.geverifieerd } }));
    const wiz = readFileSync('src/connector-v2/KoppelWizard.tsx', 'utf8');
    check('майстер підключення: попередження «Сайт не може перевірити, що це справді …» для непідтвердженої програми; невідповідність назви порівнюється з ЗАЯВЛЕНОЮ назвою',
      wiz.includes('data-v2-onbevestigd') && /info\.klantGeclaimd \?\? info\.klant\) === agent\.klant/.test(wiz));
    // старий токен без агента, що лише називається «Claude», не вважається підключенням Claude
    const oud = (await sys.query(`INSERT INTO app.mcp_oauth_tokens (user_id, client_id, client_name, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
      SELECT $1, client_id, 'Claude', 'mcp', $2, $3, now() + interval '1 hour', now() + interval '1 day' FROM app.mcp_oauth_tokens WHERE id::text = $4 RETURNING id::text AS id`,
      [uid, randomBytes(16).toString('hex'), randomBytes(16).toString('hex'), codex.grantId]).catch((e) => ({ rows: [{ id: '', fout: String(e.message) }] }))).rows[0] as { id: string; fout?: string };
    if (oud.id) {
      await stapOp();
      const viaNaam = await post('/api/owner/connector-v2/activeer-tech', { agent: 'claude', actie: 'alles-aan', verbindingId: oud.id });
      check('токен без агента, що лише НАЗИВАЄТЬСЯ «Claude», не приймається як підключення Claude (409), прав не отримує',
        viaNaam.status === 409 && !(await rijen()).some((r) => r.vid === oud.id), JSON.stringify(viaNaam));
    } else check('старий токен для перевірки підробки назвою створено', false, oud.fout);

    // (1) стара сторінка: «Дозволити» для Claude без підключення слала verbindingId '*'
    await stapOp();
    const aan = await post('/api/owner/connector-v2/activeer-tech', { agent: 'claude', actie: 'alles-aan', verbindingId: '*', termijn: 'tot-technisch-einde', naam: 'Hacker' });
    const na1 = await rijen();
    check('«Дозволити» для Claude з verbindingId «*» (стара сторінка): лише правило agent:claude, жодного «*» — інші ШІ нічого не отримали',
      aan.status === 200 && na1.length === 1 && na1[0].vid === 'agent:claude' && na1[0].actief && !na1.some((r) => r.vid === '*' || r.vid === 'agent:gpt' || r.vid === gpt.grantId),
      JSON.stringify({ aan, na1 }));
    const m1 = await meldingen();
    check('сповіщення про дозвіл називає «Claude» (назва від сервера), а не довільну «naam» із запиту', m1.length > 0 && m1.some((t) => /Claude/.test(t)) && !m1.some((t) => /Hacker/.test(t)), JSON.stringify(m1));

    // (2) чуже підключення через сторінку Claude
    await stapOp();
    const chuzhe = await post('/api/owner/connector-v2/activeer-tech', { agent: 'claude', actie: 'alles-aan', verbindingId: gpt.grantId, termijn: 'tot-technisch-einde' });
    const chuzheAgent = await post('/api/owner/connector-v2/activeer-tech', { agent: 'claude', actie: 'alles-aan', verbindingId: 'agent:gpt' });
    const na2 = await rijen();
    check('«Керувати Claude» з підключенням ChatGPT або agent:gpt — відмова 409 VERBINDING_ANDERE_AGENT, у ChatGPT нічого не змінилось',
      chuzhe.status === 409 && /VERBINDING_ANDERE_AGENT/.test(JSON.stringify(chuzhe.data)) && chuzheAgent.status === 409
      && JSON.stringify(na2) === JSON.stringify(na1), JSON.stringify({ chuzhe, chuzheAgent, na2 }));

    // ChatGPT отримує власний дозвіл, потім Claude знімає свій — ChatGPT лишається
    await stapOp();
    const gptAan = await post('/api/owner/connector-v2/activeer-tech', { agent: 'gpt', actie: 'alles-aan', verbindingId: gpt.grantId, termijn: 'tot-technisch-einde' });
    const ovVoor = await post('/api/owner/connector-v2/overzicht', {});
    const diag = (s: string, ov: any) => (ov.data?.agenten ?? []).find((a: any) => a.slug === s)?.diagnose ?? {};
    check('ChatGPT дозволено окремо (власне підключення): обидва ШІ мають свій доступ',
      gptAan.status === 200 && diag('gpt', ovVoor).aiSessionDelegationActive === true && diag('claude', ovVoor).aiSessionDelegationActive === true,
      JSON.stringify({ gptAan: gptAan.status, gpt: diag('gpt', ovVoor).aiSessionDelegationActive, claude: diag('claude', ovVoor).aiSessionDelegationActive }));
    const uitChuzhe = await post('/api/owner/connector-v2/activeer-tech', { agent: 'claude', actie: 'delegatie-uit', verbindingId: gpt.grantId });
    check('«Залишити лише звичайний простір» на сторінці Claude з підключенням ChatGPT — відмова, ChatGPT не знято',
      uitChuzhe.status === 409 && (await rijen()).find((r) => r.vid === gpt.grantId)?.actief === true, JSON.stringify(uitChuzhe));
    const uit = await post('/api/owner/connector-v2/activeer-tech', { agent: 'claude', actie: 'delegatie-uit' });
    const na3 = await rijen();
    const ovNa = await post('/api/owner/connector-v2/overzicht', {});
    check('Claude знімає свій доступ — у ChatGPT він лишається (і в базі, і в огляді)',
      uit.status === 200 && na3.find((r) => r.vid === 'agent:claude')?.actief === false && na3.find((r) => r.vid === gpt.grantId)?.actief === true
      && diag('gpt', ovNa).aiSessionDelegationActive === true && diag('claude', ovNa).aiSessionDelegationActive === false, JSON.stringify(na3));

    const m3 = await meldingen();
    check('сповіщення центру: дозвіл ChatGPT названо «ChatGPT», зняття Claude — «Claude»; ніде не «Усі підключення ШІ»',
      m3.some((t) => /ChatGPT/.test(t)) && m3.some((t) => /знято: Claude/.test(t)) && !m3.some((t) => /Усі підключення ШІ/.test(t)), JSON.stringify(m3));
    // журнал і сповіщення: ім'я того ШІ
    const audit = (await sys.query(`SELECT details FROM app.audit WHERE owner_id = $1 AND action = 'owner.connector.v2.tech_actief' ORDER BY created_at`, [uid]).catch(() => ({ rows: [] as any[] }))).rows
      .map((r) => r.details as Record<string, unknown>);
    check('журнал дій: кожен запис activeer-tech називає свій ШІ (Claude / ChatGPT)',
      audit.some((d) => d.agent === 'gpt' && d.client === 'ChatGPT') && audit.filter((d) => d.agent === 'claude').every((d) => d.client === 'Claude'), JSON.stringify(audit));
    const verbonden = (await sys.query(`SELECT details FROM app.audit WHERE owner_id = $1 AND action = 'owner.mcp.grant.connected'`, [uid]).catch(() => ({ rows: [] as any[] }))).rows.map((r) => r.details as Record<string, unknown>);
    const bronnen = verbonden.map((d) => aiBron(d)).sort();
    check('сповіщення «ШІ підключено» — з логотипом свого ШІ (claude, chatgpt, codex), не тричі «Claude»',
      JSON.stringify(bronnen) === JSON.stringify(['claude:chatgpt', 'claude:claude', 'claude:codex']), JSON.stringify(bronnen));
  } finally {
    if (vlagVoor) { await sys.query(`UPDATE app.feature_flags SET aan = $1, gebruikers = $2 WHERE sleutel = 'tech-ruimtes-v2'`, [vlagVoor.aan, vlagVoor.gebruikers]).catch(() => undefined); trk._vlagCacheLeeg(); }
    if (uid) {
      for (const t of ['tech_ruimte_ai', 'connector_v2_rechten', 'mcp_oauth_tokens']) await sys.query(`DELETE FROM app.${t} WHERE user_id = $1`, [uid]).catch(() => undefined);
      await aiDienstOpruimen([uid]);
    }
    for (const id of clients) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = $1', [id]).catch(() => undefined);
    for (const id of oudeEigenaren) await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner\"') WHERE tbl='users' AND id=$1", [id]).catch(() => undefined);
    await G.sluit?.();
    await closePool().catch(() => undefined);
  }
  return einde();
}
