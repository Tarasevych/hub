// Eenheidstests voor auth fase 1 (zie docs/ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.md):
// rate limiter faalt dicht op gevoelige buckets; browserbinding van de Google-aanmelding (login-CSRF);
// accountkoppeling zonder stille e-mailsamenvoeging.
// Draaien: DATABASE_URL=... node scripts/eenheidstests.mjs
import { rateLimit } from '../../server/platform/beveiliging';
import { closePool, getPool } from '../../server/platform/pg';
import { db } from '../../server/platform/db';
import { besluitGoogleKoppeling, magEigenaarZijn } from '../../backend/account-koppeling';
import { createHash } from 'node:crypto';
import { AANMELD_BINDING_PREFIX, aanmeldBindingKlopt, aanmeldBindingVoorAanmaken, aanmeldBindingWissen } from '../../backend/aanmeld-binding';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };

export async function main() {
  // Rate limiter: een ongeldig venster (NaN) laat de INSERT mislukken = gesimuleerde databasefout.
  const stil = console.error; console.error = () => {};
  const open = await rateLimit(`eenheidstest-open:${Date.now()}`, 10, Number.NaN);
  const dicht = await rateLimit(`eenheidstest-dicht:${Date.now()}`, 10, Number.NaN, { failClosed: true });
  console.error = stil;
  check('rate limit: DB-fout op gewone bucket → doorgelaten (open)', open.ok === true);
  check('rate limit: DB-fout op gevoelige bucket → geweigerd met Retry-After (dicht)', dicht.ok === false && dicht.retryAfter > 0, JSON.stringify(dicht));
  const bucket = `eenheidstest-normaal:${Date.now()}`;
  const normaal = [];
  for (let i = 0; i < 3; i++) normaal.push((await rateLimit(bucket, 2, 60, { failClosed: true })).ok);
  check('rate limit: zonder DB-fout telt failClosed gewoon (2 ok, 3e geweigerd)', normaal.join(',') === 'true,true,false', normaal.join(','));

  // Login-CSRF: browserbinding van de aanmeldtransactie, één cookie per transactie (parallelle tabbladen).
  const h = (v: string) => createHash('sha256').update(v).digest('hex');
  const txA = h('tx-a'), txB = h('tx-b'), tabA = h('tab-a'), tabB = h('tab-b');
  const nA = aanmeldBindingVoorAanmaken(txA, tabA), nB = aanmeldBindingVoorAanmaken(txB, tabB);
  const paar = (c: string) => c.split(';')[0];
  const jar = { headers: { cookie: `a=1; ${paar(nA.setCookie)}; ${paar(nB.setCookie)}; b=2` } };
  check('aanmeld-binding: cookienaam per transactie (__Secure-tsv_aanmeld_binding_<16 hex>), HttpOnly, Secure, SameSite=Lax, Domain=.tarasevych.com, Max-Age 900', nA.cookieNaam === `${AANMELD_BINDING_PREFIX}${txA.slice(0, 16)}` && nA.cookieNaam !== nB.cookieNaam && nA.setCookie.startsWith(`${nA.cookieNaam}=`) && /; HttpOnly; Secure; SameSite=Lax$/.test(nA.setCookie) && /Domain=\.tarasevych\.com; Path=\//.test(nA.setCookie) && /Max-Age=900;/.test(nA.setCookie) && /^[a-f0-9]{64}$/.test(nA.bindingHash));
  const recA = { transactionHash: txA, tabHash: tabA, bindingHash: nA.bindingHash }, recB = { transactionHash: txB, tabHash: tabB, bindingHash: nB.bindingHash };
  check('aanmeld-binding: twee parallelle transacties in één cookiejar kloppen allebei', aanmeldBindingKlopt(jar, recA) && aanmeldBindingKlopt(jar, recB));
  const waardeA = paar(nA.setCookie).split('=')[1];
  check('aanmeld-binding: waarde van transactie A onder de naam van B, of A met andere tabhash → geweigerd', !aanmeldBindingKlopt({ headers: { cookie: `${nB.cookieNaam}=${waardeA}` } }, recB) && !aanmeldBindingKlopt(jar, { ...recA, tabHash: tabB }));
  check('aanmeld-binding: andere browser, geen cookie, misvormde cookie → geweigerd', !aanmeldBindingKlopt({ headers: { cookie: `${nA.cookieNaam}=${'A'.repeat(43)}` } }, recA) && !aanmeldBindingKlopt({ headers: {} }, recA) && !aanmeldBindingKlopt({ headers: { cookie: `${nA.cookieNaam}=kort` } }, recA));
  check('aanmeld-binding: transactie zonder (geldige) hash of oude v1-binding faalt dicht', !aanmeldBindingKlopt(jar, { ...recA, bindingHash: undefined }) && !aanmeldBindingKlopt(jar, { ...recA, bindingHash: '' }) && !aanmeldBindingKlopt(jar, { ...recA, bindingHash: h(waardeA) }) && !aanmeldBindingKlopt(jar, null));
  check('aanmeld-binding: wissen raakt alleen de cookie van die transactie (lege waarde, Max-Age=0)', aanmeldBindingWissen(txA).startsWith(`${nA.cookieNaam}=;`) && /Max-Age=0;/.test(aanmeldBindingWissen(txA)) && !aanmeldBindingWissen(txA).includes(nB.cookieNaam));

  // Accountkoppeling: alleen (provider, subject); nooit stil op e-mail samenvoegen.
  const basis = { identiteitAccountId: '', subAccountId: '', emailAccountId: '', emailAccountHeeftGoogleIdentiteit: false, email: 'iemand@example.test', eigenaarEmail: 'eigenaar@example.test' };
  const b1 = besluitGoogleKoppeling({ ...basis, identiteitAccountId: 'A', subAccountId: 'B', emailAccountId: 'C' });
  const b2 = besluitGoogleKoppeling({ ...basis, subAccountId: 'B', emailAccountId: 'C' });
  check('koppeling: gekoppelde identiteit wint, daarna oude users.sub', b1.soort === 'bestaand' && b1.accountId === 'A' && b1.reden === 'identiteit' && b2.soort === 'bestaand' && b2.accountId === 'B' && b2.reden === 'sub');
  const b3 = besluitGoogleKoppeling({ ...basis, emailAccountId: 'C', emailAccountHeeftGoogleIdentiteit: true });
  const b3b = besluitGoogleKoppeling({ ...basis, emailAccountId: 'C', emailAccountHeeftGoogleIdentiteit: false });
  check('koppeling: zelfde e-mail, ander Google-subject → NIEUW account + conflictmelding (ook als het bestaande account nog geen identiteit heeft)', b3.soort === 'nieuw' && b3.emailConflictAccountId === 'C' && b3b.soort === 'nieuw' && b3b.emailConflictAccountId === 'C');
  const b4 = besluitGoogleKoppeling({ ...basis, email: 'Eigenaar@Example.test', emailAccountId: 'E', emailAccountHeeftGoogleIdentiteit: false });
  const b5 = besluitGoogleKoppeling({ ...basis, email: 'eigenaar@example.test', emailAccountId: 'E', emailAccountHeeftGoogleIdentiteit: true });
  check('koppeling: eigenaar zonder gekoppelde identiteit (gemigreerde DB) mag eenmalig koppelen; daarna vast', b4.soort === 'bestaand' && b4.accountId === 'E' && b4.reden === 'eigenaar-eerste-koppeling');
  check('koppeling (audit-fix punt 5): ander Google-subject met OWNER_EMAIL na vaste koppeling → GEWEIGERD, nooit een tweede account', b5.soort === 'geweigerd' && b5.reden === 'eigenaar-identiteit-vast' && b5.eigenaarAccountId === 'E');
  const b6 = besluitGoogleKoppeling({ ...basis, eigenaarEmail: '', email: '', emailAccountId: 'E' });
  check('koppeling: lege OWNER_EMAIL geeft geen eigenaarsuitzondering; geen treffer → nieuw zonder conflict', b6.soort === 'nieuw' && b6.emailConflictAccountId === 'E' && JSON.stringify(besluitGoogleKoppeling(basis)) === JSON.stringify({ soort: 'nieuw', emailConflictAccountId: '' }));
  check('eigenaarsrol: alleen met OWNER_EMAIL en alleen als er nog geen ander eigenaarsaccount is', magEigenaarZijn({ email: 'eigenaar@example.test', eigenaarEmail: 'eigenaar@example.test', accountId: '', bestaandEigenaarId: '' }) && magEigenaarZijn({ email: 'eigenaar@example.test', eigenaarEmail: 'eigenaar@example.test', accountId: 'E', bestaandEigenaarId: 'E' }) && !magEigenaarZijn({ email: 'eigenaar@example.test', eigenaarEmail: 'eigenaar@example.test', accountId: 'X', bestaandEigenaarId: 'E' }) && !magEigenaarZijn({ email: 'eigenaar@example.test', eigenaarEmail: 'eigenaar@example.test', accountId: '', bestaandEigenaarId: 'E' }) && !magEigenaarZijn({ email: 'iemand@example.test', eigenaarEmail: 'eigenaar@example.test', accountId: '', bestaandEigenaarId: '' }) && !magEigenaarZijn({ email: '', eigenaarEmail: '', accountId: '', bestaandEigenaarId: '' }));

  // Accountkoppeling met echte database (ensureUser uit backend/index.ts; OWNER_EMAIL voor het laden zetten).
  const vorigeEigenaar = process.env.OWNER_EMAIL;
  const tijd = Date.now();
  const eigenaarMail = `eenheid-eigenaar-${tijd}@example.test`, lidMail = `eenheid-lid-${tijd}@example.test`;
  process.env.OWNER_EMAIL = eigenaarMail;
  const { ensureUserVoorTests, emailZichtbaarheidVoorTests } = await import('../../backend/index');
  const ids: string[] = [];
  // Er kan maar één eigenaar zijn (unieke index records_een_eigenaar — dat is de productiegarantie «nooit twee eigenaars»).
  // De vorige fixture voegde blind een tweede owner-rij toe; met een bestaande eigenaar in de DB mislukte die INSERT stil
  // (db.add → null) en faalde de test als «false member/new» (audit 18.10.2026: artefact, geen codefout). Nu: bestaande
  // eigenaar tijdelijk parkeren als member en na afloop herstellen.
  const pool = getPool();
  const geparkeerd = (await pool.query(`SELECT id, data FROM app.records WHERE tbl='users' AND data->>'role'='owner'`)).rows as Array<{ id: string; data: Record<string, unknown> }>;
  for (const r of geparkeerd) await pool.query(`UPDATE app.records SET data = data || '{"role":"member","_eenheid_geparkeerd":true}'::jsonb WHERE id=$1`, [r.id]);
  const indexBestaat = (await pool.query(`SELECT 1 FROM pg_indexes WHERE schemaname='app' AND indexname='records_een_eigenaar'`)).rows.length === 1;
  check('DB-garantie: unieke index records_een_eigenaar bestaat (hooguit één eigenaarsrij)', indexBestaat);
  try {
    // Gemigreerde DB: eigenaarsaccount zonder identiteit en met een andere (oude) sub.
    const [eigenaarId] = await db.add('users', [{ email: eigenaarMail, sub: 'oud-sub', name: 'E', picture: '', role: 'owner', status: 'approved', accessLevel: 'full', createdAt: tijd, updatedAt: tijd }]);
    check('fixture: eigenaarsrij aangemaakt (geen tweede eigenaar in de DB)', !!eigenaarId, String(eigenaarId));
    ids.push(eigenaarId!);
    const g = (sub: string, email: string) => ({ aud: 'x', iss: 'https://accounts.google.com', exp: 0, sub: `${sub}-${tijd}`, email, email_verified: true, name: 'T' });
    const e1 = await ensureUserVoorTests(g('eigenaar-nieuw', eigenaarMail)); ids.push(e1.id);
    check('DB: eigenaar zonder identiteit koppelt eenmalig zijn Google-subject en houdt de eigenaarsrol', e1.id === eigenaarId && e1.role === 'owner', `${e1.id === eigenaarId} ${e1.role}`);
    // Audit-fix punt 5: een ander subject met OWNER_EMAIL krijgt géén tweede account — geweigerd, gelogd, gemeld.
    let geweigerdEigenaar = '';
    try { await ensureUserVoorTests(g('eigenaar-ander', eigenaarMail)); } catch (e) { geweigerdEigenaar = (e as Error).message; }
    const eigenaarRijen = (await db.list('users', { filter: { email: eigenaarMail } })).items.length;
    const weigerLog = (await pool.query(`SELECT 1 FROM app.audit WHERE owner_id=$1 AND action='owner.aanmelden.geweigerd' AND result='denied'`, [eigenaarId])).rows.length;
    const weigerMelding = (await db.list('site_notifications', { filter: { recipientUserId: eigenaarId, kind: 'owner_identity_mismatch' } })).items.length;
    check('DB (audit-fix punt 5): ander Google-subject met OWNER_EMAIL → OWNER_IDENTITY_MISMATCH, geen tweede account, hash-keten + melding aan eigenaar', geweigerdEigenaar === 'OWNER_IDENTITY_MISMATCH' && eigenaarRijen === 1 && weigerLog === 1 && weigerMelding === 1, `${geweigerdEigenaar} rijen=${eigenaarRijen} log=${weigerLog} melding=${weigerMelding}`);
    // Audit-fix punt 5: eigenaar meldt zich aan terwijl zijn rol (per ongeluk) member is → rol hersteld + owner.rol.hersteld in de keten.
    await pool.query(`UPDATE app.records SET data = data || '{"role":"member"}'::jsonb WHERE id=$1`, [eigenaarId]);
    const e3 = await ensureUserVoorTests(g('eigenaar-nieuw', eigenaarMail));
    const herstelLog = (await pool.query(`SELECT 1 FROM app.audit WHERE owner_id=$1 AND action='owner.rol.hersteld' AND result='success'`, [eigenaarId])).rows.length;
    check('DB (audit-fix punt 5): eigenaar zonder eigenaarsrol krijgt bij aanmelden de rol terug, gelogd als owner.rol.hersteld', e3.id === eigenaarId && e3.role === 'owner' && herstelLog === 1, `${e3.id === eigenaarId} ${e3.role} log=${herstelLog}`);
    const l1 = await ensureUserVoorTests(g('lid-a', lidMail)); ids.push(l1.id);
    const l1b = await ensureUserVoorTests(g('lid-a', lidMail));
    const l2 = await ensureUserVoorTests(g('lid-b', lidMail)); ids.push(l2.id);
    const meldingen = (await db.list<{ kind: string; recipientEmail: string }>('site_notifications', { filter: { recipientUserId: l1.id, kind: 'account_email_conflict' } })).items;
    const conflict = (await db.list<{ newAccountId: string }>('account_email_conflicts_v1', { filter: { existingAccountId: l1.id } })).items;
    check('DB: zelfde subject → zelfde account; ander subject met zelfde e-mail → nieuw account (status new), melding alleen op id bij het bestaande account + koppelhint', l1b.id === l1.id && l2.id !== l1.id && l2.status === 'new' && meldingen.length === 1 && meldingen[0].recipientEmail === '' && conflict.length === 1 && conflict[0].newAccountId === l2.id, `${l1b.id === l1.id} ${l2.id !== l1.id} meldingen=${meldingen.length} conflict=${conflict.length}`);
    // E-mailgeadresseerde melding/uitnodiging: alleen het oorspronkelijke account (l1), niet het tweede (l2).
    const [mId] = await db.add('site_notifications', [{ recipientUserId: '', recipientEmail: lidMail, kind: 'workspace_share', title: 't', message: 'm', read: false, createdAt: Date.now() }]); ids.push(mId!);
    const [uId] = await db.add('workspace_members', [{ workspaceId: `eenheid-ws-${tijd}`, userId: '', email: lidMail, permission: 'view', status: 'invited', createdAt: Date.now(), updatedAt: Date.now() }]); ids.push(uId!);
    const z = emailZichtbaarheidVoorTests;
    const zietL1 = (await z.emailMeldingen(l1)).items.some(x => x.id === mId), zietL2 = (await z.emailMeldingen(l2)).items.some(x => x.id === mId);
    await z.activateInvites(l2 as never);
    const naL2 = (await db.get<{ status: string; userId: string }>('workspace_members', [uId!]))[0];
    await z.activateInvites(l1 as never);
    const naL1 = (await db.get<{ status: string; userId: string }>('workspace_members', [uId!]))[0];
    check('DB: e-mailgeadresseerde melding/uitnodiging alleen voor het oorspronkelijke account; tweede account met zelfde e-mail ziet/activeert niets', await z.isEmailEigenaar(l1) && !(await z.isEmailEigenaar(l2)) && zietL1 && !zietL2 && naL2?.status === 'invited' && !naL2?.userId && naL1?.status === 'active' && naL1?.userId === l1.id, `eigenaar l1 ${await z.isEmailEigenaar(l1)}, l2 ${await z.isEmailEigenaar(l2)}, melding l1 ${zietL1} l2 ${zietL2}, uitnodiging na l2 ${naL2?.status}, na l1 ${naL1?.status}`);
    let geweigerd = '';
    try { await ensureUserVoorTests({ ...g('niet-geverifieerd', `x-${tijd}@example.test`), email_verified: false }); } catch (e) { geweigerd = (e as Error).message; }
    check('DB: niet-geverifieerd e-mailadres → geweigerd, geen account', geweigerd === 'Unverified identity' && (await db.list('users', { filter: { email: `x-${tijd}@example.test` } })).items.length === 0);
  } finally {
    if (ids.length) await getPool().query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'existingAccountId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    for (const r of geparkeerd) await pool.query(`UPDATE app.records SET data = (data - '_eenheid_geparkeerd') || '{"role":"owner"}'::jsonb WHERE id=$1`, [r.id]).catch(() => undefined);
    if (vorigeEigenaar === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeEigenaar;
  }

  await closePool();
  const mis = resultaten.filter(r => !r.ok).length;
  console.log(`\n${resultaten.length - mis}/${resultaten.length} geslaagd (aanmelden)`);
  return mis ? 1 : 0;
}
