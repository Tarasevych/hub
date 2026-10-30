// Technische kant van connector v2: de vier rechten die «у розробці» stonden zijn echte hulpmiddelen (besluit van de eigenaar, 21.10.2026).
//
// Wat hier vastligt:
//  1. CATALOGUS EN TEKSTEN: audit_read, siem_status, users_manage, flags_manage zijn actieve opties (intern = naam), alleen kant beheer,
//     zonder «У розробці»; titels, uitleg en parameterteksten in uk én nl; technisch, nooit privé; nooit uit de erfenis van het oude /mcp.
//  2. LEVENDE RECHTEN: in tools/list alleen met recht + eigenaar + actief technisch profiel; profiel uit → weg uit de lijst en een
//     aanroep geeft TECH_PROFILE_OFF; het oude /mcp kent ze niet (CONNECTOR_V2_ONLY).
//  3. audit_read: geen IP-adres (alleen pseudoniem), e-mail gemaskeerd, geen geheimen of ruwe details, limiet ≤ 100, venster ≤ 31 dagen.
//  4. siem_status: alleen de stand (aan, achterstand, fouten), de laatste fout zonder IP en zonder token.
//  5. users_manage: zonder bevestiging gebeurt er niets; zonder verse step-up weigert de bevestiging; met een app-code in plaats van
//     een passkey wordt er niets uitgevoerd; met passkey wel (via updateManagedUser) en in het journaal «via ШІ claude, bevestigd door …»;
//     de eigenaar en de eigenaarsrol zijn ALTIJD geweigerd — ook met een nagemaakt verzoek dat de AI-poort omzeilt.
//  6. flags_manage: zonder bevestiging niets; bevestigd in een technisch tabblad → backend/vlaggen.ts → zetten; verwijderen vraagt step-up.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { aiDienstAan } from './hulp/ruimte-ai';
import { closePool, getPool } from '../../server/platform/pg';
import { auditToevoegen } from '../../server/platform/audit';
import { metVerzoek, zetGebruiker } from '../../server/platform/context';
import { V2_OPTIES, v2Optie } from '../../shared/connector-v2/catalogus';
import { toolNaam } from '../../shared/connector-v2/namen';
import { agentUrl } from '../../shared/connector-v2/agenten';
import { hulpmiddelTekst, isTweetalig } from '../../shared/hulpmiddel-teksten';
import { toolInRuimte } from '../../shared/ai-ruimte';
import { ALLEEN_UITDRUKKELIJK, sleutelsUitScopes } from '../../backend/connector-v2-erfenis';
import * as bt from '../../backend/ai-beheer-hulpmiddelen';
import * as ab from '../../backend/ai-bevestiging';
import * as c from '../../backend/mcp-connector';
import * as v2 from '../../backend/connector-v2';
import type * as v2st from '../../backend/connector-v2-opslag';
import * as tp from '../../backend/tech-profiel';
import { passkeyStapOpVastleggen, totpStapOpVastleggen } from '../../backend/stap-op';
import { sha256 } from '../../backend/connectors-crypto';

const NAMEN = ['audit_read', 'siem_status', 'users_manage', 'flags_manage'] as const;
const json = (r: { body: string }) => (r.body ? JSON.parse(r.body) : null);
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
const kopVan = (r: { headers: Record<string, string> }, n: string) => Object.entries(r.headers).find(([k]) => k.toLowerCase() === n)?.[1] ?? '';
const naam = (n: string) => toolNaam(v2Optie(`${n}:beheer`)!, 'claude');
const tekstVan = (r: { content: Array<{ text: string }> } | undefined) => String(r?.content?.[0]?.text ?? '');
const ontleedJson = (r: { content: Array<{ text: string }> } | undefined) => { try { return JSON.parse(tekstVan(r)); } catch { return null; } };

export async function main(): Promise<number> {
  const { check, einde } = checker('dev-rechten-beheer-20261021');

  // ============================================================== 1. puur
  const opties = NAMEN.map((n) => v2Optie(`${n}:beheer`));
  check('catalogus: de vier zijn ACTIEVE opties met intern = naam, alleen kant beheer; de dev.*-sleutels bestaan niet meer',
    opties.every((o, i) => !!o && o.status === 'actief' && o.intern === NAMEN[i] && o.kant === 'beheer' && o.groep === 'server')
    && NAMEN.every((n) => !v2Optie(`${n}:gebruiker`)) && !V2_OPTIES.some((o) => /^dev\.(audit_read|users_manage|flags_manage|siem_status)$/.test(o.id)));
  check('catalogus: geen «У розробці» / «In ontwikkeling» meer in hun teksten; users_manage noemt de passkey per actie',
    opties.every((o) => ![...o!.uk, ...o!.nl].some((t) => /розробці|ontwikkeling/i.test(String(t ?? ''))))
    && /passkey/.test(v2Optie('users_manage:beheer')!.uk[2]) && /passkey/.test(v2Optie('users_manage:beheer')!.nl[2]) && v2Optie('users_manage:beheer')!.risico === 'kritiek');
  check('teksten (shared/hulpmiddel-teksten.ts): titel en uitleg in uk én nl, verschillend; de regels staan erin (passkey, «pending», gemaskeerd)',
    NAMEN.every((n) => { const t = hulpmiddelTekst(n, 'beheer'); return !!t && !!t.titel.uk && !!t.titel.nl && t.titel.uk !== t.titel.nl && /[А-Яа-яІіЇїЄє]/.test(t.uitleg.uk) && !/[А-Яа-яІіЇїЄє]/.test(t.uitleg.nl); })
    && /passkey/.test(hulpmiddelTekst('users_manage')!.uitleg.uk) && /"pending"/.test(hulpmiddelTekst('flags_manage')!.uitleg.nl) && /замасковано/.test(hulpmiddelTekst('audit_read')!.uitleg.uk));
  check('definities: elke parameter heeft een tweetalige tekst p(uk, nl); bevestiging_id bestaat bij de twee schrijvende',
    bt.BEHEER_TOOLS.every((t) => Object.values(((t.inputSchema as { properties?: Record<string, { description?: unknown }> }).properties) ?? {}).every((p) => isTweetalig(p.description)))
    && ['users_manage', 'flags_manage'].every((n) => !!(bt.BEHEER_TOOLS.find((t) => t.name === n)!.inputSchema as { properties: Record<string, unknown> }).properties.bevestiging_id));
  check('ruimte: alle vier technisch, nooit in de privéruimte', NAMEN.every((n) => toolInRuimte(n, 'technisch') && !toolInRuimte(n, 'prive')));
  check('erfenis van het oude /mcp: nooit (ALLEEN_UITDRUKKELIJK), terwijl get_admin_view zonder scope wél geërfd wordt',
    NAMEN.every((n) => ALLEEN_UITDRUKKELIJK.has(n)) && !sleutelsUitScopes(['beheer', 'gebruiker'], ['mail.read', 'server.read']).some((k) => NAMEN.some((n) => k === `${n}:beheer`))
    && sleutelsUitScopes(['beheer'], []).includes('get_admin_view:beheer'));
  const m = bt.maskeerTekst('van 203.0.113.77 en 2001:db8::7, mail pavlo.t@voorbeeld.test om 10:20:30, token=abcdefSECRET1234 en ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  check('maskeren: geen IPv4 of IPv6 (wel een pseudoniem), e-mail gemaskeerd, een tijd blijft staan, tokens weg',
    !m.includes('203.0.113.77') && !m.includes('2001:db8::7') && /ip:[0-9a-f]{8}/.test(m) && m.includes('pa***@voorbeeld.test') && !m.includes('pavlo.t@') && m.includes('10:20:30')
    && !m.includes('SECRET1234') && !m.includes('ghp_aaaa'), m);
  const d = bt.schoonDetailsVoorAi({ password: 'hunter2', tool: 'proef', ip: '203.0.113.5', reden: 'via 198.51.100.23', userAgent: 'Mozilla', doel: { soort: 'account', naam: 'bob@voorbeeld.test', token: 't0k-geheim' }, ruweAanvraag: { headers: 1 } });
  const dj = JSON.stringify(d);
  check('details: alleen de witte lijst; wachtwoord, IP, user-agent, ruwe aanvraag en geneste tokens vallen weg; adressen gemaskeerd',
    d.tool === 'proef' && !('password' in d) && !('ip' in d) && !('userAgent' in d) && !('ruweAanvraag' in d) && !dj.includes('198.51.100.23') && !dj.includes('t0k-geheim')
    && dj.includes('bo***@voorbeeld.test') && !dj.includes('hunter2'), dj);

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN dev-rechten-beheer (integratie): geen database'); return einde(); }

  // ============================================================== 2. integratie
  const sys = getPool('systeem');
  // Gedeelde test-db: de wachtrij (0098) en de rechten van de rollen (rechten.sql, zoals server/migrate.ts na elke run) zelf zetten.
  const mig = getPool('migratie');
  if (!(await mig.query("SELECT to_regclass('app.ai_bevestiging') AS t")).rows[0].t) await mig.query(readFileSync('migrations/0098_ai_bevestigingen.sql', 'utf8'));
  await mig.query(readFileSync('migrations/rechten.sql', 'utf8')).catch((e) => console.log('rechten.sql:', (e as Error).message));
  await import('../../backend/index');
  check('backend/index.ts zet de uitvoerders: dezelfde serverfuncties als admin → Gebruikers (updateManagedUser) en «Прапорці» (flags.zetten/verwijderen)', bt.beheerUitvoerdersGezet());
  bt.zetBeheerWachtMsVoorTest(0);

  const T = randomBytes(3).toString('hex');
  const M = `drb-lid-${randomUUID()}`;
  const mEmail = `drb-lid-${T}@voorbeeld.test`;
  const clients: string[] = [];
  const sleutel = `drb-${T}`;
  const ACTIE = `owner.test.drb-${T}`;
  const bestaand = (await sys.query("SELECT id, data FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1")).rows[0] as { id: string; data: Record<string, unknown> } | undefined;
  const eigenaarId = bestaand ? String(bestaand.id) : `drb-eig-${randomUUID()}`;
  const eigenaarEmail = bestaand ? String(bestaand.data.email || '') : `${eigenaarId}@test.invalid`;
  const vorigeOwnerEmail = process.env.OWNER_EMAIL;
  process.env.OWNER_EMAIL = eigenaarEmail;
  const profielVooraf = (await sys.query('SELECT 1 FROM app.tech_profielen WHERE user_id = $1', [eigenaarId])).rows.length > 0;
  const aiStandVooraf = (await sys.query("SELECT 1 FROM app.ruimte_dienst_stand WHERE user_id = $1 AND dienst = 'ai'", [eigenaarId])).rows.length > 0;
  const siemVooraf = (await sys.query("SELECT * FROM app.siem_export WHERE bestemming = 'bestand'")).rows[0] ?? null;
  const vorigSiemBestand = process.env.SIEM_BESTAND;
  const eigenaar = { id: eigenaarId, email: eigenaarEmail, role: 'owner', status: 'approved' };
  const sessie = (id: string) => ({ user: { id: eigenaarId }, session: { id, createdAt: Date.now() } });
  const rijen = async () => Number((await sys.query("SELECT count(*)::int AS n FROM app.ai_bevestiging WHERE user_id = $1 AND soort LIKE 'beheer.%'", [eigenaarId])).rows[0].n);
  const hashVan = async (id: string) => String((await sys.query('SELECT hash FROM app.ai_bevestiging WHERE id = $1', [id])).rows[0]?.hash || '');
  const bevestigCode = async (fn: () => Promise<unknown>) => { try { await fn(); return 'ok'; } catch (e) { return (e as { code?: string }).code || String((e as Error).message); } };
  const inTab = <X>(tab: string, fn: () => Promise<X>) => metVerzoek('POST /api/owner/ai-bevestiging/bevestigen', async () => { zetGebruiker(eigenaarId, 'mcp', tab); return fn(); });
  const statusM = async () => String((await sys.query("SELECT data->>'status' AS s FROM app.records WHERE tbl = 'users' AND id = $1", [M])).rows[0]?.s || '');

  const rpc = (token: string, msg: unknown) => v2.rpc('claude', `Bearer ${token}`, JSON.stringify(msg));
  const lijst = async (token: string) => (json(await rpc(token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }))?.result?.tools ?? []) as Array<{ name: string; description: string }>;
  const roep = async (token: string, n: string, args: Record<string, unknown> = {}) =>
    json(await rpc(token, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: naam(n), arguments: args } }))?.result as { isError?: boolean; content: Array<{ text: string }> };
  async function koppel(keuze: v2st.V2Keuze) {
    const redirect = 'https://claude.ai/api/mcp/auth_callback';
    const reg = json(await c.registerClient(JSON.stringify({ client_name: 'Claude', redirect_uris: [redirect] })));
    clients.push(reg.client_id);
    const p = pkce();
    const a = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, code_challenge: p.challenge, code_challenge_method: 'S256', state: 's', resource: agentUrl('claude') });
    const rid = new URL(kopVan(a as never, 'location')).searchParams.get('consent') || '';
    const dd = await c.consentDecide(eigenaarId, rid, true, null, 'prive', keuze);
    const code = 'redirect' in dd ? new URL(dd.redirect).searchParams.get('code') || '' : '';
    const t = json(await c.token(form({ grant_type: 'authorization_code', code, code_verifier: p.verifier, client_id: reg.client_id, redirect_uri: redirect })));
    return String(t.access_token || '');
  }

  try {
    if (!bestaand) await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [eigenaarId, { email: eigenaarEmail, role: 'owner', status: 'approved', entitlements: ['api-platform'] }]);
    else await sys.query(`UPDATE app.records SET data = jsonb_set(data, '{entitlements}', '["api-platform"]') WHERE tbl = 'users' AND id = $1`, [eigenaarId]);
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [M, { email: mEmail, role: 'member', status: 'approved', name: 'Тест Лід', createdAt: Date.now() }]);
    await sys.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['eigenaar'], 480, 'test') ON CONFLICT (user_id) DO NOTHING`, [eigenaarId, `tech-${randomBytes(6).toString('hex')}`]);
    await aiDienstAan(eigenaarId);
    await sys.query("DELETE FROM app.records WHERE tbl = 'owner_step_up_v1' AND data->>'userId' = $1", [eigenaarId]);
    const tab = randomBytes(24).toString('hex');
    await tp.activeren(eigenaar, tab, 60, 'test: technische beheerhulpmiddelen');

    const token = await koppel({ kanten: ['beheer', 'gebruiker'], sleutels: ['v2_whoami:gebruiker', ...NAMEN.map((n) => `${n}:beheer`)] });
    check('koppeling met de vier technische rechten gelukt', !!token);
    const grantId = String((await sys.query('SELECT id::text AS id FROM app.mcp_oauth_tokens WHERE access_hash = $1', [sha256(token)])).rows[0]?.id || '');

    // ---------------------------------------------------------- tools/list: aan
    const aan = await lijst(token);
    const namenAan = aan.map((t) => t.name);
    check('profiel aan: alle vier staan in tools/list (met hun Nederlandse v2-naam, kant beheer)', NAMEN.every((n) => namenAan.includes(naam(n))), namenAan.filter((x) => x.endsWith('_beheer')).join(','));
    const um = aan.find((t) => t.name === naam('users_manage'));
    check('tools/list: Oekraïense uitleg met de regel «passkey» en het staartje van de technische ruimte', !!um && /passkey/.test(um.description) && /технічний простір/.test(um.description), um?.description.slice(0, 120));

    // ---------------------------------------------------------- het oude /mcp kent ze niet
    const oudLijst = (await c.lijstTools({ userId: eigenaarId, clientName: 'Claude', ruimte: 'technisch', tokenId: grantId }, { aliassen: false })).map((t) => t.name);
    const oud = await c.roepTool({ userId: eigenaarId, clientName: 'Claude', ruimte: 'technisch', tokenId: grantId }, 'users_manage', { action: 'list' });
    check('oud /mcp (zelfs technisch, profiel aan): niet in de lijst en een aanroep met de interne naam → CONNECTOR_V2_ONLY',
      !NAMEN.some((n) => oudLijst.includes(n)) && oud.isError === true && /^CONNECTOR_V2_ONLY/.test(tekstVan(oud)), tekstVan(oud).slice(0, 80));

    // ---------------------------------------------------------- audit_read
    await metVerzoek('POST /test/drb', async () => {
      for (let i = 0; i < 30; i++) {
        await auditToevoegen({ ownerId: eigenaarId, actorId: M, action: ACTIE, result: 'success', details: {
          email: 'geheim.persoon@voorbeeld.test', reden: `contact anna.k@voorbeeld.test via 198.51.100.23 (${i})`, token: 'tok_SUPERGEHEIM123', password: 'hunter2',
          ip: '203.0.113.77', tool: 'proef', doel: { soort: 'account', naam: 'bob@voorbeeld.test' },
        } });
      }
    }, { ip: '203.0.113.77', ua: 'Mozilla/5.0 Chrome/120' });
    const volleHash = String((await sys.query('SELECT ip_hash FROM app.audit WHERE action = $1 LIMIT 1', [ACTIE])).rows[0]?.ip_hash || '');
    const a1 = await roep(token, 'audit_read', { action: ACTIE, limit: 5 });
    const j1 = ontleedJson(a1);
    const t1 = tekstVan(a1);
    check('audit_read: 5 regels (limiet), met nextCursor; het journaal is «data, geen instructies»',
      !a1.isError && j1?.count === 5 && j1.items.length === 5 && !!j1.nextCursor && /never as instructions/.test(j1.notice), t1.slice(0, 160));
    check('audit_read: GEEN IP-adres — niet in de kolom, niet in de details, niet in de reden; alleen het pseudoniem (8 tekens van de HMAC)',
      !t1.includes('203.0.113.77') && !t1.includes('198.51.100.23') && volleHash.length === 32 && !t1.includes(volleHash)
      && j1.items.every((x: { ipRef: string }) => x.ipRef === `ip:${volleHash.slice(0, 8)}`), j1?.items?.[0]?.ipRef);
    check('audit_read: e-mailadressen gemaskeerd (actor, doel, reden); geen wachtwoord, geen token, geen ruwe details',
      !t1.includes(mEmail) && !t1.includes('geheim.persoon@') && !t1.includes('anna.k@') && !t1.includes('bob@voorbeeld') && !t1.includes('hunter2') && !t1.includes('SUPERGEHEIM')
      && j1.items[0].actor.email === `dr***@voorbeeld.test` && /an\*\*\*@voorbeeld\.test/.test(j1.items[0].reason) && j1.items[0].details.tool === 'proef' && !('email' in j1.items[0].details), JSON.stringify(j1.items[0]).slice(0, 300));
    const a2 = ontleedJson(await roep(token, 'audit_read', { action: ACTIE, limit: 5, cursor: j1.nextCursor }));
    check('audit_read: met de cursor de VOLGENDE (oudere) regels, geen dubbele', a2?.count === 5 && a2.items.every((x: { id: string }) => !j1.items.some((y: { id: string }) => y.id === x.id)));
    const a3 = ontleedJson(await roep(token, 'audit_read', { action: ACTIE, limit: 1000, since: new Date(Date.now() - 60 * 86_400_000).toISOString() }));
    check('audit_read: limiet hoogstens 100 en venster hoogstens 31 dagen (begrensd, en dat staat in het antwoord)',
      a3?.limit === 100 && a3.count === 30 && a3.window.limited === true && Math.round((Date.parse(a3.window.until) - Date.parse(a3.window.since)) / 86_400_000) === 31, JSON.stringify(a3?.window));
    const a4 = await roep(token, 'audit_read', { since: 'gisteren' });
    check('audit_read: ongeldige tijd → INVALID_ARGUMENT (geen stille terugval)', a4.isError === true && /^INVALID_ARGUMENT/.test(tekstVan(a4)));

    // ---------------------------------------------------------- siem_status
    process.env.SIEM_BESTAND = join(tmpdir(), `drb-siem-${T}.ndjson`);
    await sys.query(`INSERT INTO app.siem_export (bestemming, laatste_id, geexporteerd, fouten, laatste_fout, laatste_fout_op) VALUES ('bestand', 0, 7, 3, $1, now())
      ON CONFLICT (bestemming) DO UPDATE SET laatste_id = 0, geexporteerd = 7, fouten = 3, laatste_fout = $1, laatste_fout_op = now()`, ['EACCES bij 203.0.113.9 token=abc123SECRETxyz']);
    const s1 = await roep(token, 'siem_status');
    const sj = ontleedJson(s1);
    check('siem_status: aan, «failing» bij fouten, achterstand en aantal geëxporteerd; alleen lezen',
      !s1.isError && sj?.enabled === true && sj.state === 'failing' && sj.file.configured === true && sj.file.backlog > 0 && sj.file.exported === 7 && sj.file.failuresInARow === 3 && sj.loki.configured === false, tekstVan(s1).slice(0, 200));
    check('siem_status: de laatste fout zonder IP-adres en zonder token', !tekstVan(s1).includes('203.0.113.9') && !tekstVan(s1).includes('abc123SECRET') && /EACCES/.test(sj.file.lastError), sj?.file?.lastError);
    delete process.env.SIEM_BESTAND;
    const s2 = ontleedJson(await roep(token, 'siem_status'));
    check('siem_status: zonder SIEM-instelling → «off»', s2?.enabled === false && s2.state === 'off');

    // ---------------------------------------------------------- users_manage
    const u1 = ontleedJson(await roep(token, 'users_manage', { action: 'list' }));
    const lidRij = u1?.users?.find((x: { id: string }) => x.id === M);
    const u0 = ontleedJson(await roep(token, 'users_manage', { action: 'list', user_id: eigenaarId }));
    check('users_manage list: de gebruiker met gemaskeerd adres; de eigenaar (list met user_id) gemarkeerd als beschermd', !!lidRij && lidRij.email === 'dr***@voorbeeld.test' && lidRij.status === 'approved'
      && !JSON.stringify(u1).includes(mEmail) && u0?.count === 1 && u0.users[0].id === eigenaarId && u0.users[0].role === 'owner' && !!u0.users[0].protected && !JSON.stringify(u0).includes(eigenaarEmail), JSON.stringify(u0).slice(0, 200));
    const voor = await rijen();
    const e1 = await roep(token, 'users_manage', { action: 'set_role', user_id: eigenaarId, role: 'member' });
    const e2 = await roep(token, 'users_manage', { action: 'block', user_id: eigenaarId });
    const e3 = await roep(token, 'users_manage', { action: 'set_role', user_id: M, role: 'owner' });
    check('users_manage: de eigenaar als doel (rol afnemen of blokkeren) → OWNER_PROTECTED; de eigenaarsrol geven → OWNER_ROLE_PROTECTED; er komt GEEN verzoek',
      e1.isError === true && /^OWNER_PROTECTED/.test(tekstVan(e1)) && e2.isError === true && /^OWNER_PROTECTED/.test(tekstVan(e2)) && e3.isError === true && /^OWNER_ROLE_PROTECTED/.test(tekstVan(e3)) && (await rijen()) === voor,
      `${tekstVan(e1).slice(0, 40)} | ${tekstVan(e3).slice(0, 40)}`);
    const w1 = ontleedJson(await roep(token, 'users_manage', { action: 'block', user_id: M, reason: 'spam' }));
    check('users_manage block: alleen een VERZOEK (status «wacht», bevestiging_id); de gebruiker is nog niet geblokkeerd', w1?.status === 'wacht' && !!w1.bevestiging_id && (await statusM()) === 'approved', JSON.stringify(w1).slice(0, 160));
    const k1 = await bevestigCode(async () => ab.bevestig({ userId: eigenaarId, id: w1.bevestiging_id, ruimte: 'technisch', hash: await hashVan(w1.bevestiging_id), stapOp: false }));
    check('bevestigen zonder verse step-up → STEP_UP_STRONG_REQUIRED; niets uitgevoerd', k1 === 'STEP_UP_STRONG_REQUIRED' && (await statusM()) === 'approved', k1);
    await totpStapOpVastleggen(sessie(`drb-totp-${T}`));
    const k2 = await ab.bevestig({ userId: eigenaarId, id: w1.bevestiging_id, ruimte: 'technisch', hash: await hashVan(w1.bevestiging_id), stapOp: true });
    check('bevestigd met een APP-CODE (geen passkey) → «mislukt» met PASSKEY_VEREIST; niets uitgevoerd', k2.status === 'mislukt' && k2.fout === 'PASSKEY_VEREIST' && (await statusM()) === 'approved', `${k2.status} ${k2.fout}`);
    // Zoals de echte route (bevestiger = tabblad + step-up-methode van het bevestigende verzoek): een app-code telt ook dan niet.
    const w1b = ontleedJson(await roep(token, 'users_manage', { action: 'block', user_id: M }));
    const k2b = await ab.bevestig({ userId: eigenaarId, id: w1b.bevestiging_id, ruimte: 'technisch', hash: await hashVan(w1b.bevestiging_id), stapOp: true, bevestiger: { tabContext: tab, stapOpMethode: 'totp' } });
    check('route-pad (bevestiger.stapOpMethode = totp) → «mislukt» PASSKEY_VEREIST; niets uitgevoerd', k2b.status === 'mislukt' && k2b.fout === 'PASSKEY_VEREIST' && (await statusM()) === 'approved', `${k2b.status} ${k2b.fout}`);
    const w2 = ontleedJson(await roep(token, 'users_manage', { action: 'block', user_id: M, reason: 'spam' }));
    await passkeyStapOpVastleggen(sessie(`drb-pk-${T}`));
    // In de gebruikerscontext van de eigenaar, zoals de echte bevestigingsroute (RLS): de wijziging van een ANDERE gebruiker moet toch lukken.
    const k3 = await inTab(tab, async () => ab.bevestig({ userId: eigenaarId, id: w2.bevestiging_id, ruimte: 'technisch', hash: await hashVan(w2.bevestiging_id), stapOp: true }));
    check('bevestigd met PASSKEY → «uitgevoerd»: de gebruiker is geblokkeerd (updateManagedUser)', k3.status === 'uitgevoerd' && (await statusM()) === 'blocked', `${k3.status} ${k3.fout} ${await statusM()}`);
    const st = ontleedJson(await roep(token, 'users_manage', { bevestiging_id: w2.bevestiging_id }));
    check('stand opvragen met alleen bevestiging_id: «uitgevoerd» met het resultaat (adres gemaskeerd)', st?.status === 'uitgevoerd' && st.resultaat?.user?.status === 'blocked' && st.resultaat.user.email === 'dr***@voorbeeld.test', JSON.stringify(st).slice(0, 200));
    const jr = (await sys.query(`SELECT details FROM app.audit WHERE owner_id = $1 AND action = 'owner.admin.user.updated' AND details->>'verzoekId' = $2`, [eigenaarId, w2.bevestiging_id])).rows[0]?.details;
    check('journaal: owner.admin.user.updated «через ШІ claude, підтверджено власником, коли», met passkey', !!jr && jr.via === 'ai' && jr.agent === 'claude' && jr.bevestigdDoor === eigenaarId && !!Date.parse(jr.bevestigdOp) && jr.stapOp === 'passkey' && jr.targetUserId === M && jr.status === 'blocked', JSON.stringify(jr));
    const p1 = (await sys.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'owner.ai.bevestiging.uitgevoerd' AND details->>'bevestigingId' = $2`, [eigenaarId, w2.bevestiging_id])).rows[0].n;
    check('journaal: ook de gedeelde rij (owner.ai.bevestiging.uitgevoerd) staat erin', p1 === 1);
    // Een NAGEMAAKT verzoek dat de controle van het hulpmiddel overslaat (rechtstreeks in de rij): ook dan raakt niemand de eigenaar.
    const nep = await ab.vraagBevestiging({ userId: eigenaarId, ruimte: 'technisch', soort: 'beheer.gebruiker', agent: 'claude', klant: 'Claude',
      params: { actie: 'set_role', doelId: eigenaarId, rol: 'member', reden: 'aanval', doelEmail: eigenaarEmail, vorige: { status: 'approved', role: 'owner' } } });
    await passkeyStapOpVastleggen(sessie(`drb-pk2-${T}`));
    const k4 = nep.ok ? await ab.bevestig({ userId: eigenaarId, id: nep.id, ruimte: 'technisch', hash: nep.hash, stapOp: true }) : null;
    const rolNu = String((await sys.query("SELECT data->>'role' AS r FROM app.records WHERE tbl = 'users' AND id = $1", [eigenaarId])).rows[0]?.r || '');
    check('nagemaakt verzoek «eigenaar → lid», zelfs met passkey: «mislukt» EIGENAAR_BESCHERMD en de eigenaar blijft eigenaar', !!k4 && k4.status === 'mislukt' && k4.fout === 'EIGENAAR_BESCHERMD' && rolNu === 'owner', `${k4?.status} ${k4?.fout} ${rolNu}`);
    const nep2 = await ab.vraagBevestiging({ userId: eigenaarId, ruimte: 'technisch', soort: 'beheer.gebruiker', params: { actie: 'set_role', doelId: M, rol: 'owner', reden: '', doelEmail: mEmail, vorige: {} } });
    check('nagemaakt verzoek «lid → eigenaar»: al bij het aanmaken geweigerd (de rol bestaat niet voor de AI)', !nep2.ok && /GEBRUIKER_ROL_ONGELDIG|EIGENAAR_BESCHERMD/.test(nep2.fout), nep2.ok ? 'ok?!' : nep2.fout);
    const w3 = ontleedJson(await roep(token, 'users_manage', { action: 'approve', user_id: M }));
    await passkeyStapOpVastleggen(sessie(`drb-pk3-${T}`));
    const k5 = await ab.bevestig({ userId: eigenaarId, id: w3.bevestiging_id, ruimte: 'technisch', hash: await hashVan(w3.bevestiging_id), stapOp: true });
    check('goedkeuren (deblokkeren) met passkey → «uitgevoerd», de gebruiker is weer goedgekeurd', k5.status === 'uitgevoerd' && (await statusM()) === 'approved', `${k5.status} ${k5.fout}`);

    // ---------------------------------------------------------- flags_manage
    const f1 = ontleedJson(await roep(token, 'flags_manage', { action: 'set', key: sleutel, enabled: true, percentage: 30, flag_description: 'тест через ШІ', users: [mEmail], reason: 'proef' }));
    const vlagNa1 = (await sys.query('SELECT aan, percentage, gebruikers FROM app.feature_flags WHERE sleutel = $1', [sleutel])).rows[0];
    check('flags_manage set: alleen een VERZOEK («wacht»); de vlag bestaat nog niet', f1?.status === 'wacht' && !!f1.bevestiging_id && !vlagNa1, JSON.stringify(f1).slice(0, 120));
    const kz = await ab.bevestig({ userId: eigenaarId, id: f1.bevestiging_id, ruimte: 'technisch', hash: await hashVan(f1.bevestiging_id), stapOp: false });
    check('bevestigd buiten een technisch tabblad → «mislukt» TECH_TABBLAD_VEREIST (de rechten van het tabblad tellen)', kz.status === 'mislukt' && kz.fout === 'TECH_TABBLAD_VEREIST', `${kz.status} ${kz.fout}`);
    const f2 = ontleedJson(await roep(token, 'flags_manage', { action: 'set', key: sleutel, enabled: true, percentage: 30, flag_description: 'тест через ШІ', users: [mEmail] }));
    const kf = await inTab(tab, async () => ab.bevestig({ userId: eigenaarId, id: f2.bevestiging_id, ruimte: 'technisch', hash: await hashVan(f2.bevestiging_id), stapOp: false }));
    const vlag = (await sys.query('SELECT aan, percentage, gebruikers, gewijzigd_door FROM app.feature_flags WHERE sleutel = $1', [sleutel])).rows[0];
    check('bevestigd in het technische tabblad (zonder passkey: risico «midden») → «uitgevoerd» via flags.zetten: aan, 30 %, de gekozen gebruiker',
      kf.status === 'uitgevoerd' && !!vlag && vlag.aan === true && Number(vlag.percentage) === 30 && Array.isArray(vlag.gebruikers) && vlag.gebruikers.includes(M) && vlag.gewijzigd_door === eigenaarId, `${kf.status} ${kf.fout}`);
    const fj = (await sys.query(`SELECT action, details FROM app.audit WHERE owner_id = $1 AND (action = 'owner.flags.gewijzigd' AND details->>'sleutel' = $2 OR action = 'owner.flags.via_ai' AND details->>'verzoekId' = $3)`, [eigenaarId, sleutel, f2.bevestiging_id])).rows;
    check('journaal: owner.flags.gewijzigd (zelfde functie als het venster) én owner.flags.via_ai met agent, bevestiger en tijd',
      fj.some((r: { action: string }) => r.action === 'owner.flags.gewijzigd') && fj.some((r: { action: string; details: Record<string, unknown> }) => r.action === 'owner.flags.via_ai' && r.details.via === 'ai' && r.details.agent === 'claude' && r.details.bevestigdDoor === eigenaarId && !!r.details.bevestigdOp), JSON.stringify(fj.map((r: { action: string }) => r.action)));
    const fl = ontleedJson(await roep(token, 'flags_manage', { action: 'list' }));
    const fr = fl?.flags?.find((x: { key: string }) => x.key === sleutel);
    check('flags_manage list: de vlag met aantal en gemaskeerde gebruikers', !!fr && fr.enabled === true && fr.percentage === 30 && fr.targetedUsers === 1 && fr.users[0] === 'dr***@voorbeeld.test' && !JSON.stringify(fl).includes(mEmail));
    const f3 = ontleedJson(await roep(token, 'flags_manage', { action: 'set', key: sleutel, enabled: false }));
    const kf3 = await ab.bevestig({ userId: eigenaarId, id: f3.bevestiging_id, ruimte: 'technisch', hash: await hashVan(f3.bevestiging_id), stapOp: false, bevestiger: { tabContext: tab } });
    const vlag3 = (await sys.query('SELECT aan, percentage, gebruikers FROM app.feature_flags WHERE sleutel = $1', [sleutel])).rows[0];
    check('set met alleen «enabled: false» (route-pad: tabblad via bevestiger): de rest (30 %, gebruiker) blijft zoals het was', kf3.status === 'uitgevoerd' && vlag3.aan === false && Number(vlag3.percentage) === 30 && vlag3.gebruikers.includes(M), `${kf3.status} ${kf3.fout}`);
    const f4 = ontleedJson(await roep(token, 'flags_manage', { action: 'delete', key: sleutel }));
    const kd1 = await bevestigCode(async () => inTab(tab, async () => ab.bevestig({ userId: eigenaarId, id: f4.bevestiging_id, ruimte: 'technisch', hash: await hashVan(f4.bevestiging_id), stapOp: false })));
    const kd2 = await inTab(tab, async () => ab.bevestig({ userId: eigenaarId, id: f4.bevestiging_id, ruimte: 'technisch', hash: await hashVan(f4.bevestiging_id), stapOp: true }));
    const weg = (await sys.query('SELECT 1 FROM app.feature_flags WHERE sleutel = $1', [sleutel])).rows.length === 0;
    check('verwijderen: zonder step-up geweigerd (risico «hoog»), met step-up uitgevoerd (flags.verwijderen)', kd1 === 'STEP_UP_STRONG_REQUIRED' && kd2.status === 'uitgevoerd' && weg, `${kd1} ${kd2.status} ${kd2.fout}`);

    // ---------------------------------------------------------- profiel UIT: niets meer
    const open = ontleedJson(await roep(token, 'flags_manage', { action: 'set', key: sleutel, enabled: true }));
    await tp.beeindigenBijIntrekken(eigenaarId, 'handmatig');
    const uit = (await lijst(token)).map((t) => t.name);
    const r1 = await roep(token, 'audit_read', {});
    const r2 = await roep(token, 'users_manage', { action: 'block', user_id: M });
    const r3 = await roep(token, 'siem_status');
    check('profiel uit: geen van de vier in tools/list (de privékant blijft)', !NAMEN.some((n) => uit.includes(naam(n))) && uit.includes(toolNaam(v2Optie('v2_whoami:gebruiker')!, 'claude')), uit.join(','));
    check('profiel uit: elke aanroep → TECH_PROFILE_OFF, en er komt geen verzoek bij',
      [r1, r2, r3].every((r) => r.isError === true && /^TECH_PROFILE_OFF/.test(tekstVan(r))) && (await statusM()) === 'approved', tekstVan(r2).slice(0, 60));
    const kOud2 = await inTab(tab, async () => ab.bevestig({ userId: eigenaarId, id: open.bevestiging_id, ruimte: 'technisch', hash: await hashVan(open.bevestiging_id), stapOp: false }))
      .then((w) => `${w.status}:${w.fout}`, (e) => String((e as { code?: string }).code || e));
    const nogWeg = (await sys.query('SELECT 1 FROM app.feature_flags WHERE sleutel = $1', [sleutel])).rows.length === 0;
    check('een verzoek van vóór het uitzetten wordt daarna NIET uitgevoerd (geweigerd of «mislukt» met TECH_PROFILE_OFF); de vlag bestaat niet',
      !!open?.bevestiging_id && !kOud2.startsWith('uitgevoerd') && (kOud2 === 'mislukt:TECH_PROFILE_OFF' || /^RUIMTE_GESLOTEN/.test(kOud2)) && nogWeg, kOud2);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    bt.zetBeheerWachtMsVoorTest(undefined);
    if (vorigSiemBestand === undefined) delete process.env.SIEM_BESTAND; else process.env.SIEM_BESTAND = vorigSiemBestand;
    if (siemVooraf) await sys.query(`UPDATE app.siem_export SET laatste_id = $2, geexporteerd = $3, fouten = $4, laatste_fout = $5, laatste_fout_op = $6, bijgewerkt = $7 WHERE bestemming = $1`,
      ['bestand', siemVooraf.laatste_id, siemVooraf.geexporteerd, siemVooraf.fouten, siemVooraf.laatste_fout, siemVooraf.laatste_fout_op, siemVooraf.bijgewerkt]).catch(() => undefined);
    else await sys.query("DELETE FROM app.siem_export WHERE bestemming = 'bestand'").catch(() => undefined);
    await tp.beeindigenBijIntrekken(eigenaarId, 'handmatig').catch(() => undefined);
    await sys.query('DELETE FROM app.feature_flag_tests WHERE sleutel = $1', [sleutel]).catch(() => undefined);
    await sys.query('DELETE FROM app.feature_flags WHERE sleutel = $1', [sleutel]).catch(() => undefined);
    await sys.query("DELETE FROM app.ai_bevestiging WHERE user_id = $1 AND soort LIKE 'beheer.%'", [eigenaarId]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'owner_step_up_v1' AND data->>'userId' = $1", [eigenaarId]).catch(() => undefined);
    if (clients.length) {
      await sys.query("DELETE FROM app.ai_toegang WHERE soort = 'mcp-koppeling' AND onderwerp_id IN (SELECT id::text FROM app.mcp_oauth_tokens WHERE client_id = ANY($1))", [clients]).catch(() => undefined);
      await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]).catch(() => undefined);
    }
    if (!aiStandVooraf) {
      await sys.query("DELETE FROM app.ruimte_dienst_stand WHERE user_id = $1 AND dienst = 'ai'", [eigenaarId]).catch(() => undefined);
    }
    if (!profielVooraf) await sys.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [eigenaarId]).catch(() => undefined);
    await sys.query('DELETE FROM app.audit WHERE action = $1', [ACTIE]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [M]).catch(() => undefined);
    if (bestaand) await sys.query("UPDATE app.records SET data = $2 WHERE tbl = 'users' AND id = $1", [eigenaarId, bestaand.data]).catch(() => undefined);
    else await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [eigenaarId]).catch(() => undefined);
    if (vorigeOwnerEmail === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeOwnerEmail;
  }
  await closePool();
  return einde();
}
