// Regressietests audit-fixes 2 (TOTP vervangen), 6 (method/herstel), 7 (stap-op lockout atomisch) en
// 10 (wachtwoord: geen MFA-orakel, lockout per (e-mail, IP)). Wegwerp-PG + nagebootste Google.
import { randomBytes } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle, totpCode } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('audit-toegang');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const eigenaar = `tg-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  const oud = Math.floor(Date.now() / 1000) - 3600;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [email])).rows[0]?.id as string;
  // Niet vlak voor een 30s-grens beginnen: de test gebruikt drie opeenvolgende tijdvakken.
  if (Date.now() % 30000 > 22000) await new Promise(r => setTimeout(r, 30000 - (Date.now() % 30000) + 200));
  const stap = Math.floor(Date.now() / 30000);
  try {
    const O = G.browser();
    await O.aanmelden(`sub-o-${T}`, eigenaar, { authTime: oud });
    const id = (pad: string, extra: Record<string, unknown> = {}, b = O) => b.verzoek('id.tarasevych.com', pad, b.ctxBody('identity', extra));
    const oId = await idRij(eigenaar);

    // ---- fix 2: TOTP vervangen ----
    const s1 = await id('/api/owner/access/totp/start');
    const c1 = await id('/api/owner/access/totp/confirm', { code: totpCode(s1.data.secret, stap - 1) });
    const herstelcodes: string[] = c1.data.recoveryCodes || [];
    check('TOTP eerste keer instellen werkt (zonder step-up)', s1.status === 200 && c1.status === 200 && herstelcodes.length > 0, `${s1.status} ${c1.status} ${c1.body.slice(0, 100)}`);
    const totpRij = async () => (await pool.query("select data from app.records where tbl='identity_totp_v1' and data->>'userId'=$1", [oId])).rows[0]?.data as Record<string, any>;
    const geheimVoor = (await totpRij()).secretEnc;
    const s2zonder = await id('/api/owner/access/totp/start');
    // INTEG-001 (03.11.2026): kritieke acties vragen sterke step-up; de server geeft dan STEP_UP_STRONG_REQUIRED (toegang-context.ts).
    check('bevestigde TOTP vervangen zonder step-up → 403 STEP_UP(_STRONG)_REQUIRED', s2zonder.status === 403 && ['STEP_UP_REQUIRED', 'STEP_UP_STRONG_REQUIRED'].includes(s2zonder.data.error), `${s2zonder.status} ${s2zonder.data.error}`);
    const so = await id('/api/owner/access/stap-op', { code: totpCode(s1.data.secret, stap) });
    const s2geenCode = await id('/api/owner/access/totp/start');
    check('met step-up maar zonder huidige code → geweigerd, geheim ongewijzigd', so.status === 200 && s2geenCode.status === 400 && s2geenCode.data.error === 'ACCESS_TOTP_CODE_REQUIRED' && (await totpRij()).secretEnc === geheimVoor && !(await totpRij()).pendingSecretEnc, `${so.status} ${s2geenCode.status} ${s2geenCode.body.slice(0, 80)}`);
    const s2 = await id('/api/owner/access/totp/start', { currentCode: herstelcodes[0] });
    const naStart = await totpRij();
    check('met step-up + herstelcode: nieuw geheim klaargezet, oude blijft actief tot bevestiging', s2.status === 200 && !!s2.data.secret && s2.data.secret !== s1.data.secret && naStart.secretEnc === geheimVoor && !!naStart.pendingSecretEnc && naStart.confirmed === true, `${s2.status} ${s2.body.slice(0, 80)}`);
    const oudWerkt = await id('/api/owner/access/stap-op', { code: totpCode(s1.data.secret, stap + 1) });
    check('oude TOTP werkt nog zolang de vervanging niet bevestigd is', oudWerkt.status === 200, `${oudWerkt.status} ${oudWerkt.body.slice(0, 80)}`);
    const c2 = await id('/api/owner/access/totp/confirm', { code: totpCode(s2.data.secret, stap) });
    const naConfirm = await totpRij();
    const audit = (await pool.query("select count(*)::int n from app.audit where owner_id=$1 and action='access.totp.replace'", [oId])).rows[0].n;
    const melding = (await pool.query("select count(*)::int n from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'='access_totp_replaced'", [oId])).rows[0].n;
    check('vervanging bevestigd met code van het nieuwe geheim: geheim gewisseld, audit + melding', c2.status === 200 && naConfirm.secretEnc === naStart.pendingSecretEnc && !naConfirm.pendingSecretEnc && audit === 1 && melding === 1, `${c2.status} audit=${audit} melding=${melding} ${c2.body.slice(0, 80)}`);
    const c3 = await id('/api/owner/access/totp/confirm', { code: totpCode(s2.data.secret, stap + 1) });
    check('nogmaals bevestigen zonder lopende vervanging → 409 (geen nieuwe herstelcodes buiten rotate om)', c3.status === 409 && !c3.data.recoveryCodes, `${c3.status}`);

    // ---- fix 7: atomische lockout op stap-op ----
    const parallel = await Promise.all(Array.from({ length: 12 }, () => id('/api/owner/access/stap-op', { code: '000000' })));
    const doorgelaten = parallel.filter(r => r.status !== 429).length;
    const daarna = await id('/api/owner/access/stap-op', { code: totpCode(s2.data.secret, stap + 1) });
    check('12 gelijktijdige foute stap-op-codes: hoogstens 5 gecontroleerd, daarna geblokkeerd (ook met juiste code)', doorgelaten <= 5 && doorgelaten >= 1 && daarna.status === 429, `doorgelaten=${doorgelaten} daarna=${daarna.status}`);
    await pool.query("delete from app.login_lockouts where subject=$1", [`stap-op:${oId}`]);

    // ---- fix 6: method/herstel ----
    const ww = await id('/api/owner/access/password/set', { password: `Wachtwoord-${T}` });
    const ontk = await id('/api/owner/access/method/unbind', { method: 'password' });
    const O2 = G.browser(); await O2.aanmelden(`sub-o-${T}`, eigenaar, { authTime: oud });
    const herstelZonder = await id('/api/owner/access/method/herstel', {}, O2);
    const herstelMet = await id('/api/owner/access/method/herstel');
    check('zelf ontkoppeld → terugzetten vereist step-up, met step-up lukt het', ww.status === 200 && ontk.status === 200 && herstelZonder.status === 403 && ['STEP_UP_REQUIRED', 'STEP_UP_STRONG_REQUIRED'].includes(herstelZonder.data.error) && herstelMet.status === 200, `${ww.status} ${ontk.status} ${herstelZonder.status} ${herstelZonder.data.error} ${herstelMet.status} ${herstelMet.body.slice(0, 80)}`);
    // gebruiker U (approved) met Google + wachtwoord; beheerder ontkoppelt het wachtwoord
    const U = G.browser(); const uMail = `tg-u-${T}@example.test`;
    await U.aanmelden(`sub-u-${T}`, uMail, { authTime: oud });
    const uId = await idRij(uMail);
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and id=$1", [uId]);
    await U.aanmelden(`sub-u-${T}`, uMail, { intent: 'step-up' });
    const uw = await id('/api/owner/access/password/set', { password: `Gebruiker-${T}` }, U);
    const beheerOntk = await id(`/api/owner/access/user/${uId}/method`, { method: 'password', action: 'unbind' });
    const uHerstel = await id('/api/owner/access/method/herstel', {}, U);
    const beheerHerstel = await id(`/api/owner/access/user/${uId}/method`, { method: 'password', action: 'restore' });
    const wwRij = (await pool.query("select data from app.records where tbl='identity_passwords_v1' and data->>'userId'=$1", [uId])).rows[0]?.data || {};
    check('door beheerder ontkoppeld → zelf terugzetten 403 ACCESS_RESTORE_ADMIN_ONLY; beheerder kan het wel', uw.status === 200 && beheerOntk.status === 200 && uHerstel.status === 403 && uHerstel.data.error === 'ACCESS_RESTORE_ADMIN_ONLY' && beheerHerstel.status === 200 && !wwRij.ontkoppeldAt, `${uw.status} ${beheerOntk.status} ${uHerstel.status} ${beheerHerstel.status} ${JSON.stringify(Object.keys(wwRij))}`);

    // ---- fix 10: wachtwoord-aanmelding ----
    const login = (email: string, password: string, ip: string, totp = '') => G.browser().verzoek('id.tarasevych.com', '/api/owner/access/password/login', { email, password, totp }, { ip });
    const goedZonderTotp = await login(eigenaar, `Wachtwoord-${T}`, '198.51.100.1');
    const foutZonderTotp = await login(eigenaar, 'fout-wachtwoord', '198.51.100.1');
    const goedFouteTotp = await login(eigenaar, `Wachtwoord-${T}`, '198.51.100.1', '000000');
    check('geen MFA-orakel: met TOTP-account geeft goed én fout wachtwoord zonder code hetzelfde antwoord; foute code → algemeen ongeldig', goedZonderTotp.status === foutZonderTotp.status && goedZonderTotp.data.status === 'mfa' && foutZonderTotp.data.status === 'mfa' && goedFouteTotp.status === 401 && goedFouteTotp.data.error === 'ACCESS_CREDENTIALS_INVALID', `${goedZonderTotp.status}/${goedZonderTotp.data.status} ${foutZonderTotp.status}/${foutZonderTotp.data.status} ${goedFouteTotp.status} ${goedFouteTotp.data.error}`);
    const fouten = []; for (let i = 0; i < 6; i++) fouten.push((await login(uMail, 'fout', '198.51.100.7')).status);
    const zelfdeIp = await login(uMail, `Gebruiker-${T}`, '198.51.100.7');
    const anderIp = await login(uMail, `Gebruiker-${T}`, '198.51.100.8');
    check('lockout per (e-mail, IP): aanvaller-IP geblokkeerd, eigenaar vanaf ander IP kan nog aanmelden', fouten.includes(429) && zelfdeIp.status === 429 && anderIp.status === 200 && anderIp.data.ok === true, `${fouten.join(',')} ${zelfdeIp.status} ${anderIp.status}`);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`tg-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    await pool.query("delete from app.login_lockouts where subject like 'wachtwoord:tg-%' or subject = any($1)", [ids.map(i => `stap-op:${i}`)]);
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool();
  return einde();
}
