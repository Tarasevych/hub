// Regressietest audit-fix 11: globale serverrijen zonder eigenaar (provider_endpoint_verifications_v1,
// mail_endpoint_verifications_v1, oauth_pkce_v1) liepen vanuit ingelogde routes via mijnruimte_app en zouden
// onder RLS geweigerd worden (live app.rls_audit 2026-10-04). Nu via de systeemrol (alsSysteem).
// Controle met de echte handler: audit-modus → geen telling voor deze routes; afdwingen aan → routes werken en
// de rijen worden geschreven; een gewone gebruikersquery op deze tabellen ziet ze nog steeds niet.
import { randomBytes } from 'node:crypto';
import { db } from '../../server/platform/db';
import { metVerzoek, zetGebruiker } from '../../server/platform/context';
import { appRolActief, closePool, getPool } from '../../server/platform/pg';
import { rlsAuditWegschrijven } from '../../server/platform/rls-audit';
import { createOAuthMaterial, takeOAuthMaterial } from '../../backend/oauth-pkce';
import { checker, nepGoogle } from './hulp/nep-google';

const TABELLEN = ['provider_endpoint_verifications_v1', 'mail_endpoint_verifications_v1', 'oauth_pkce_v1'];
const als = <T>(userId: string, fn: () => Promise<T>) => metVerzoek('POST /api/eenheid/systeemrijen', async () => { zetGebruiker(userId, 'hub'); return fn(); });

export async function main(): Promise<number> {
  const { check, einde } = checker('audit-systeemrijen');
  if (!appRolActief() || !process.env.DATABASE_URL_MIGRATIE) { console.log('OVERGESLAGEN audit-systeemrijen: rollen niet ingesteld'); await closePool(); return 0; }
  const sys = getPool('systeem'), mig = getPool('migratie');
  const stand = (w: 'aan' | 'uit') => mig.query("UPDATE app.rls_instellingen SET waarde = $1 WHERE sleutel = 'afdwingen'", [w]);
  const vorigeStand = (await mig.query("SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'")).rows[0]?.waarde === 'aan' ? 'aan' : 'uit';
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const eigenaar = `sysrij-eig-${T}@example.test`;
  const vorigeSleutel = process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1;
  if (!vorigeSleutel) process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 = randomBytes(32).toString('base64');
  const vorigePush = process.env.GOOGLE_GMAIL_PUBSUB_AUDIENCE;
  process.env.GOOGLE_GMAIL_PUBSUB_AUDIENCE = 'https://mail.tarasevych.com/api/owner/mail/google/pubsub/push';
  const G = await nepGoogle({ ownerEmail: eigenaar });
  // De redirect-probe (GET https://id.tarasevych.com/) blijft lokaal: nagebootst als HTML-pagina.
  const nepFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => String(input) === 'https://id.tarasevych.com/'
    ? new Response('<!doctype html><title>id</title>', { status: 200, headers: { 'content-type': 'text/html' } })
    : nepFetch(input as never, init)) as typeof fetch;
  const waarschuwingen: string[] = []; const echteWarn = console.warn;
  console.warn = (...a: unknown[]) => { const t = a.map(String).join(' '); if (t.includes('[rls-audit]')) waarschuwingen.push(t); echteWarn(...a); };
  const rijen = async () => (await sys.query('SELECT tbl, count(*)::int AS n FROM app.records WHERE tbl = ANY($1) GROUP BY tbl', [TABELLEN])).rows as Array<{ tbl: string; n: number }>;
  const telling = async () => { await new Promise((r) => setTimeout(r, 200)); await rlsAuditWegschrijven(); return (await sys.query('SELECT route, tbl, actie, aantal FROM app.rls_audit WHERE tbl = ANY($1) ORDER BY 1, 2, 3', [TABELLEN])).rows; };
  try {
    await sys.query('DELETE FROM app.rls_audit WHERE tbl = ANY($1)', [TABELLEN]);
    await sys.query('DELETE FROM app.records WHERE tbl = ANY($1)', [TABELLEN]);
    const O = G.browser();
    await O.aanmelden(`sub-o-${T}`, eigenaar, { service: 'mail' });
    await O.aanmelden(`sub-o-${T}`, eigenaar, { service: 'api' });
    const mail = (pad: string, extra: Record<string, unknown> = {}) => O.verzoek('mail.tarasevych.com', pad, O.ctxBody('mail', extra));
    const api = (pad: string, extra: Record<string, unknown> = {}) => O.verzoek('api.tarasevych.com', pad, O.ctxBody('api', extra));
    const ronde = async () => {
      const r = {
        boot: await mail('/api/owner/mail/bootstrap'),
        accounts: await mail('/api/owner/mail/google-suite/accounts'),
        connect: await mail('/api/owner/mail/google-suite/connect/start', { accountRole: 'primary', sourceOrigin: 'https://mail.tarasevych.com', returnTo: 'https://mail.tarasevych.com/', locale: 'uk' }),
        contract: await api('/api/owner/api-platform/contract'),
        connections: await api('/api/owner/api-platform/connections'),
      };
      return r;
    };

    // 1) audit-modus (zoals productie nu)
    await stand('uit');
    const a = await ronde();
    const statusA = Object.values(a).map((x) => x.status);
    const tA = await telling();
    const rijA = await rijen();
    check('audit-modus: mail/bootstrap, google-suite/accounts + connect/start, api-platform/contract + connections antwoorden zonder 5xx',
      statusA.every((s) => s < 500), JSON.stringify(statusA) + ' ' + JSON.stringify(Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.body.slice(0, 120)]))));
    check('audit-modus: de serverrijen worden echt gelezen/geschreven (endpoint-verificatie aanwezig)', rijA.some((r) => r.tbl === 'provider_endpoint_verifications_v1'), JSON.stringify(rijA));
    check('audit-modus: geen RLS-overtreding meer voor provider_endpoint_verifications_v1 / mail_endpoint_verifications_v1 / oauth_pkce_v1', tA.length === 0 && waarschuwingen.length === 0, JSON.stringify(tA) + waarschuwingen.join(' | '));

    // 2) afdwingen aan: dezelfde routes werken (forceer opnieuw meten: verlopen check door checkedAt terug te zetten)
    await sys.query("UPDATE app.records SET data = jsonb_set(data, '{checkedAt}', '0') WHERE tbl = 'provider_endpoint_verifications_v1'");
    await stand('aan');
    const b = await ronde();
    const statusB = Object.values(b).map((x) => x.status);
    const vers = (await sys.query("SELECT (data->>'checkedAt')::bigint AS c FROM app.records WHERE tbl = 'provider_endpoint_verifications_v1'")).rows as Array<{ c: string }>;
    check('afdwingen aan: dezelfde routes geven dezelfde status als in audit-modus en de verificatierij wordt bijgewerkt',
      JSON.stringify(statusB) === JSON.stringify(statusA) && vers.length >= 1 && vers.every((r) => Number(r.c) > 0), JSON.stringify([statusA, statusB, vers]));

    // 3) PKCE: materiaal vanuit gebruikerscontext opslaan en eenmalig ophalen, ook met afdwingen aan
    const uid = String((await sys.query("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'email' = $1", [eigenaar])).rows[0]?.id || '');
    const state = `st-${T}`;
    const m = await als(uid, () => createOAuthMaterial('google-suite', state));
    const terug = await als(uid, () => takeOAuthMaterial('google-suite', state));
    const nogmaals = await als(uid, () => takeOAuthMaterial('google-suite', state));
    check('PKCE vanuit gebruikerscontext (afdwingen aan): opslaan + eenmalig ophalen werkt', !!terug && terug.verifier === m.verifier && nogmaals === null);

    // 4) niets opengezet: een gewone gebruikersquery (mijnruimte_app onder RLS) ziet deze rijen niet
    await als(uid, () => createOAuthMaterial('google-suite', `${state}-2`));
    const zichtbaar = await als(uid, async () => {
      const uit: Record<string, number> = {};
      for (const t of TABELLEN) uit[t] = (await db.list(t, { limit: 50 })).items.length;
      return uit;
    });
    const echt = await rijen();
    check('geen data opengezet: als gebruiker (RLS aan) 0 rijen zichtbaar in deze servertabellen, terwijl ze bestaan',
      Object.values(zichtbaar).every((n) => n === 0) && echt.some((r) => r.n > 0), JSON.stringify([zichtbaar, echt]));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    console.warn = echteWarn;
    await stand(vorigeStand as 'aan' | 'uit').catch(() => undefined);
    globalThis.fetch = nepFetch; G.herstel();
    if (!vorigeSleutel) delete process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1;
    if (vorigePush === undefined) delete process.env.GOOGLE_GMAIL_PUBSUB_AUDIENCE; else process.env.GOOGLE_GMAIL_PUBSUB_AUDIENCE = vorigePush;
    await sys.query('DELETE FROM app.records WHERE tbl = ANY($1)', [TABELLEN]).catch(() => undefined);
    await sys.query('DELETE FROM app.rls_audit WHERE tbl = ANY($1)', [TABELLEN]).catch(() => undefined);
    const uids = (await sys.query("select id from app.records where tbl='users' and data->>'email' like $1", [`sysrij-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (uids.length) await sys.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [uids]);
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool();
  return einde();
}
