// Eenheidstests voor auth fase 1 (zie docs/ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.md):
// rate limiter faalt dicht op gevoelige buckets; browserbinding van de Google-aanmelding (login-CSRF);
// accountkoppeling zonder stille e-mailsamenvoeging.
// Draaien: DATABASE_URL=... node scripts/eenheidstests.mjs
import { rateLimit } from '../../server/platform/beveiliging';
import { closePool, getPool } from '../../server/platform/pg';
import { db } from '../../server/platform/db';
import { besluitGoogleKoppeling, magEigenaarZijn } from '../../backend/account-koppeling';
import { AANMELD_BINDING_COOKIE, aanmeldBindingKlopt, aanmeldBindingVoorAanmaken, aanmeldBindingWissen } from '../../backend/aanmeld-binding';

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

  // Login-CSRF: browserbinding van de aanmeldtransactie.
  const nieuw = aanmeldBindingVoorAanmaken({ headers: {} });
  const waarde = nieuw.setCookie.split(';')[0].split('=')[1];
  const browser = { headers: { cookie: `a=1; ${AANMELD_BINDING_COOKIE}=${waarde}; b=2` } };
  check('aanmeld-binding: cookie __Secure-, HttpOnly, Secure, SameSite=Lax, Domain=.tarasevych.com, kort geldig', nieuw.setCookie.startsWith('__Secure-tsv_aanmeld_binding=') && /; HttpOnly; Secure; SameSite=Lax$/.test(nieuw.setCookie) && /Domain=\.tarasevych\.com; Path=\//.test(nieuw.setCookie) && /Max-Age=900;/.test(nieuw.setCookie) && /^[a-f0-9]{64}$/.test(nieuw.bindingHash));
  check('aanmeld-binding: zelfde browser klopt; bestaande cookie wordt hergebruikt', aanmeldBindingKlopt(browser, nieuw.bindingHash) && aanmeldBindingVoorAanmaken(browser).bindingHash === nieuw.bindingHash);
  const ander = { headers: { cookie: `${AANMELD_BINDING_COOKIE}=${'A'.repeat(43)}` } };
  check('aanmeld-binding: andere browser, geen cookie, misvormde cookie → geweigerd', !aanmeldBindingKlopt(ander, nieuw.bindingHash) && !aanmeldBindingKlopt({ headers: {} }, nieuw.bindingHash) && !aanmeldBindingKlopt({ headers: { cookie: `${AANMELD_BINDING_COOKIE}=kort` } }, nieuw.bindingHash));
  check('aanmeld-binding: transactie zonder (geldige) hash faalt dicht', !aanmeldBindingKlopt(browser, undefined) && !aanmeldBindingKlopt(browser, '') && !aanmeldBindingKlopt(browser, 'x'.repeat(64)));
  check('aanmeld-binding: wissen = lege waarde met Max-Age=0', aanmeldBindingWissen().startsWith(`${AANMELD_BINDING_COOKIE}=;`) && /Max-Age=0;/.test(aanmeldBindingWissen()));

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
  check('koppeling: eigenaar zonder gekoppelde identiteit (gemigreerde DB) mag eenmalig koppelen; daarna vast', b4.soort === 'bestaand' && b4.accountId === 'E' && b4.reden === 'eigenaar-eerste-koppeling' && b5.soort === 'nieuw' && b5.emailConflictAccountId === 'E');
  const b6 = besluitGoogleKoppeling({ ...basis, eigenaarEmail: '', email: '', emailAccountId: 'E' });
  check('koppeling: lege OWNER_EMAIL geeft geen eigenaarsuitzondering; geen treffer → nieuw zonder conflict', b6.soort === 'nieuw' && b6.emailConflictAccountId === 'E' && JSON.stringify(besluitGoogleKoppeling(basis)) === JSON.stringify({ soort: 'nieuw', emailConflictAccountId: '' }));
  check('eigenaarsrol: alleen met OWNER_EMAIL en alleen als er nog geen ander eigenaarsaccount is', magEigenaarZijn({ email: 'eigenaar@example.test', eigenaarEmail: 'eigenaar@example.test', accountId: '', bestaandEigenaarId: '' }) && magEigenaarZijn({ email: 'eigenaar@example.test', eigenaarEmail: 'eigenaar@example.test', accountId: 'E', bestaandEigenaarId: 'E' }) && !magEigenaarZijn({ email: 'eigenaar@example.test', eigenaarEmail: 'eigenaar@example.test', accountId: 'X', bestaandEigenaarId: 'E' }) && !magEigenaarZijn({ email: 'eigenaar@example.test', eigenaarEmail: 'eigenaar@example.test', accountId: '', bestaandEigenaarId: 'E' }) && !magEigenaarZijn({ email: 'iemand@example.test', eigenaarEmail: 'eigenaar@example.test', accountId: '', bestaandEigenaarId: '' }) && !magEigenaarZijn({ email: '', eigenaarEmail: '', accountId: '', bestaandEigenaarId: '' }));

  // Accountkoppeling met echte database (ensureUser uit backend/index.ts; OWNER_EMAIL voor het laden zetten).
  const vorigeEigenaar = process.env.OWNER_EMAIL;
  const tijd = Date.now();
  const eigenaarMail = `eenheid-eigenaar-${tijd}@example.test`, lidMail = `eenheid-lid-${tijd}@example.test`;
  process.env.OWNER_EMAIL = eigenaarMail;
  const { ensureUserVoorTests } = await import('../../backend/index');
  const ids: string[] = [];
  try {
    // Gemigreerde DB: eigenaarsaccount zonder identiteit en met een andere (oude) sub.
    const [eigenaarId] = await db.add('users', [{ email: eigenaarMail, sub: 'oud-sub', name: 'E', picture: '', role: 'owner', status: 'approved', accessLevel: 'full', createdAt: tijd, updatedAt: tijd }]);
    ids.push(eigenaarId!);
    const g = (sub: string, email: string) => ({ aud: 'x', iss: 'https://accounts.google.com', exp: 0, sub: `${sub}-${tijd}`, email, email_verified: true, name: 'T' });
    const e1 = await ensureUserVoorTests(g('eigenaar-nieuw', eigenaarMail)); ids.push(e1.id);
    const e2 = await ensureUserVoorTests(g('eigenaar-ander', eigenaarMail)); ids.push(e2.id);
    check('DB: eigenaar zonder identiteit koppelt eenmalig zijn Google-subject; daarna krijgt een ander subject met OWNER_EMAIL een apart account zonder eigenaarsrol', e1.id === eigenaarId && e1.role === 'owner' && e2.id !== eigenaarId && e2.role === 'member' && e2.status === 'new', `${e1.id === eigenaarId} ${e2.role}/${e2.status}`);
    const l1 = await ensureUserVoorTests(g('lid-a', lidMail)); ids.push(l1.id);
    const l1b = await ensureUserVoorTests(g('lid-a', lidMail));
    const l2 = await ensureUserVoorTests(g('lid-b', lidMail)); ids.push(l2.id);
    const meldingen = (await db.list<{ kind: string; recipientEmail: string }>('site_notifications', { filter: { recipientUserId: l1.id, kind: 'account_email_conflict' } })).items;
    const conflict = (await db.list<{ newAccountId: string }>('account_email_conflicts_v1', { filter: { existingAccountId: l1.id } })).items;
    check('DB: zelfde subject → zelfde account; ander subject met zelfde e-mail → nieuw account (status new), melding alleen op id bij het bestaande account + koppelhint', l1b.id === l1.id && l2.id !== l1.id && l2.status === 'new' && meldingen.length === 1 && meldingen[0].recipientEmail === '' && conflict.length === 1 && conflict[0].newAccountId === l2.id, `${l1b.id === l1.id} ${l2.id !== l1.id} meldingen=${meldingen.length} conflict=${conflict.length}`);
    let geweigerd = '';
    try { await ensureUserVoorTests({ ...g('niet-geverifieerd', `x-${tijd}@example.test`), email_verified: false }); } catch (e) { geweigerd = (e as Error).message; }
    check('DB: niet-geverifieerd e-mailadres → geweigerd, geen account', geweigerd === 'Unverified identity' && (await db.list('users', { filter: { email: `x-${tijd}@example.test` } })).items.length === 0);
  } finally {
    if (ids.length) await getPool().query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'existingAccountId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    if (vorigeEigenaar === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = vorigeEigenaar;
  }

  await closePool();
  const mis = resultaten.filter(r => !r.ok).length;
  console.log(`\n${resultaten.length - mis}/${resultaten.length} geslaagd (aanmelden)`);
  return mis ? 1 : 0;
}
