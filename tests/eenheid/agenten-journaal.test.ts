// /agents (RUNBOOK §13.9): het journaal laat nooit geheimen zien, kent leesbare onderwerpen, het acties-filter van de audit werkt,
// losgekoppelde agents blijven als geschiedenis zichtbaar (met reden) en foutmeldingen tonen nooit een kale code.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { JOURNAAL_ACTIES, journaalItem } from '../../backend/connectors-routes';
import * as store from '../../backend/connectors-opslag';
import { sha256, randomToken } from '../../backend/connectors-crypto';
import { auditLijst, auditToevoegen } from '../../server/platform/audit';
import { metVerzoek, zetGebruiker } from '../../server/platform/context';
import { appRolActief, closePool, getPool } from '../../server/platform/pg';
import { foutTekst } from '../../src/agenten/fouten';
import { checker } from './hulp/nep-google';

const uk = (a: string) => a;
const nl = (_a: string, b: string) => b;

export async function main(): Promise<number> {
  const { check, einde } = checker('agenten-journaal');

  // ---- zuiver: journaalItem ----
  const namen = { agents: new Map([['ag-1', { name: 'Ноутбук', platform: 'win32-x64' }]]), tokens: new Map([['tok-1', 'grok']]), oauth: new Map([['gr-1', 'Claude']]) };
  const it = journaalItem({ id: '7', action: 'owner.agent.revoked', result: 'ok', createdAt: 1000, ipHash: 'abcdef0123456789abcdef', device: 'Chrome', service: 'mcp',
    details: { agentId: 'ag-1', reason: 'user', token: 'geheim', tokenHash: 'x', accessToken: 'y', refresh_token: 'z', cookie: 'c', nonce: 'n', pkceVerifier: 'p', pairingCode: '12345678', apiKey: 'k', version: '1.2.3' } }, namen);
  const json = JSON.stringify(it);
  check('journaal: geen geheim-achtige velden (token, hash, cookie, nonce, pkce, code, key)', !/geheim|"x"|"y"|"z"|"c"|"n"|"p"|12345678|"k"/.test(json) && it.details.version === '1.2.3' && it.details.reason === 'user', json);
  check('journaal: onderwerp van een agent heeft naam en platform', it.onderwerp?.id === 'ag-1' && it.onderwerp?.naam === 'Ноутбук' && it.onderwerp?.platform === 'win32-x64', JSON.stringify(it.onderwerp));
  check('journaal: ip alleen als korte hash (12 tekens)', it.ipHash === 'abcdef012345');
  check('journaal: soort per actie (apparaat/ai/token)', it.soort === 'apparaat' && JOURNAAL_ACTIES['owner.mcp.grant.revoked'] === 'ai' && JOURNAAL_ACTIES.mcp_console_token_revoked === 'token');
  const t = journaalItem({ id: '8', action: 'mcp_console_token_revoked', result: 'ok', createdAt: 1, details: { tokenId: 'tok-1' } }, namen);
  const o = journaalItem({ id: '9', action: 'owner.mcp.grant.revoked', result: 'ok', createdAt: 1, details: { grantId: 'gr-1' } }, namen);
  check('journaal: onderwerp van token en OAuth-verbinding opgelost', t.onderwerp?.naam === 'grok' && o.onderwerp?.naam === 'Claude', JSON.stringify([t.onderwerp, o.onderwerp]));
  const nodig = ['owner.agent.paired', 'owner.agent.revoked', 'owner.agent.updated', 'owner.mcp.grant.connected', 'owner.mcp.grant.revoked', 'mcp_console_token_issued', 'mcp_console_token_revoked', 'ai_grant_added', 'ai_grants_revoked', 'ai_stop_all', 'owner.browser.enabled', 'owner.browser.disabled'];
  const mist = nodig.filter((a) => !JOURNAAL_ACTIES[a]);
  check('journaal: alle gevraagde gebeurtenissen horen erbij (koppelen, bijwerken, verbinden, intrekken, toestemming, stop)', !mist.length, mist.join(','));

  // ---- zuiver: foutteksten ----
  const rl = { status: 429, response: { status: 429, data: { error: 'RATE_LIMITED', retryAfter: 12 } }, message: 'RATE_LIMITED' };
  const tU = foutTekst(rl, uk, ['Не вдалося відкликати', 'Intrekken mislukt']), tN = foutTekst(rl, nl);
  // Punt 3 van de audit 19.10.2026: de ZIN blijft vooraan (die leest de gebruiker), maar de code mag niet meer ontbreken — hij
  // staat nu in de feitenregel erachter, samen met dienst, tijd en pogingnummer (shared/foutuitleg.ts: feitRegel).
  check('fouten: RATE_LIMITED wordt een zin (UA/NL) met wachttijd; de kale code staat pas in de feitenregel erachter',
    tU.startsWith('Не вдалося відкликати. Забагато запитів') && tU.includes('12 с') && tN.startsWith('Te veel verzoeken')
    && tU.indexOf('RATE_LIMITED') > tU.indexOf('Деталі:') && tN.indexOf('RATE_LIMITED') > tN.indexOf('Details:')
    && tU.includes('спроба 1') && tN.includes('poging 1'), `${tU} | ${tN}`);
  check('fouten: 404 en STEP_UP krijgen gewone taal', foutTekst({ status: 404, message: 'AGENT_NOT_FOUND' }, uk).startsWith('Цього вже немає') && foutTekst({ status: 403, message: 'STEP_UP_REQUIRED' }, nl).startsWith('U moet de toegang'));
  check('fouten: onbekende fout is geen "geen verbinding"', !foutTekst(new Error('IETS'), uk).includes('Немає зв’язку'));

  // ---- bron: geen renderlus meer in AiToestemmingen / BrowserExtensionPanel (oorzaak van RATE_LIMITED) ----
  const ai = readFileSync('src/AiToestemmingen.tsx', 'utf8'), be = readFileSync('src/BrowserExtensiePaneel.tsx', 'utf8');
  check('lus: AiToestemmingen laadt niet opnieuw bij een nieuwe onChange (ref, alleen agentId/versie als afhankelijkheid)', /onChangeRef/.test(ai) && !/\[agentId, onChange\]|\[onChange, agentId\]/.test(ai));
  check('lus: BrowserExtensionPanel geeft een stabiele onGrants (useCallback)', /const onGrants = useCallback/.test(be));
  const sv = readFileSync('src/McpDienstWeergave.tsx', 'utf8');
  check('pagina: MCP-weergave toont geen kale foutcode meer (foutTekst)', /foutTekst\(err, t\)/.test(sv) && !/String\(err\.response\.data\?\.error/.test(sv));

  if (!appRolActief() || !process.env.DATABASE_URL_MIGRATIE) { console.log('OVERGESLAGEN agenten-journaal (db): rollen niet ingesteld'); await closePool(); return einde(); }
  const sys = getPool('systeem');
  const A = `journaal-a-${randomUUID()}`, B = `journaal-b-${randomUUID()}`;
  try {
    // ---- audit: acties-filter ----
    await auditToevoegen({ ownerId: A, action: 'owner.agent.revoked', type: 'beveiliging', result: 'ok', details: { agentId: 'x' } });
    await auditToevoegen({ ownerId: A, action: 'mcp_console_token_issued', type: 'beveiliging', result: 'ok', details: {} });
    await auditToevoegen({ ownerId: A, action: 'login', type: 'beveiliging', result: 'ok', details: {} });
    await auditToevoegen({ ownerId: B, action: 'owner.agent.revoked', type: 'beveiliging', result: 'ok', details: {} });
    const l = await auditLijst({ ownerId: A, acties: Object.keys(JOURNAAL_ACTIES), limit: 50 });
    check('audit: acties-filter geeft alleen journaalacties van deze eigenaar', l.items.length === 2 && l.items.every((r) => r.ownerId === A && r.action !== 'login'), JSON.stringify(l.items.map((r) => r.action)));
    const l2 = await auditLijst({ ownerId: A, acties: ['owner.agent.revoked'], limit: 50 });
    check('audit: acties-filter met één actie', l2.items.length === 1 && l2.items[0].action === 'owner.agent.revoked');

    // ---- losgekoppelde agents blijven als geschiedenis, met reden ----
    const ag = await store.createAgent(A, 'browser van A', 'browser', sha256(randomToken()), {}, undefined, { version: '0.9.1' });
    const als = <T>(fn: () => Promise<T>) => metVerzoek('POST /api/eenheid/journaal', async () => { zetGebruiker(A, 'eenheid'); return fn(); });
    const ok = await als(() => store.revokeAgent(A, ag.id));
    const weg = await als(() => store.listRevokedAgents(A));
    check('loskoppelen: agent staat in de geschiedenis met reden «user» en versie', ok && weg.length === 1 && weg[0].id === ag.id && weg[0].revoke_reason === 'user' && weg[0].agent_version === '0.9.1', JSON.stringify(weg));
    const vanB = await metVerzoek('POST /api/eenheid/journaal', async () => { zetGebruiker(B, 'eenheid'); return store.listRevokedAgents(B); });
    check('loskoppelen: B ziet de geschiedenis van A niet', vanB.length === 0);
    const n = await store.journaalNamen(A);
    check('journaalNamen: ook een losgekoppelde agent heeft een naam', n.agents.get(ag.id)?.name === 'browser van A');
  } finally {
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await closePool();
  }
  return einde();
}
