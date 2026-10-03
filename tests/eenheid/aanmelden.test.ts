// Eenheidstests voor auth fase 1 (zie docs/ontwerp/ONTWERP-ACCOUNTS-EN-BEVEILIGING.md):
// rate limiter faalt dicht op gevoelige buckets; browserbinding van de Google-aanmelding (login-CSRF).
// Draaien: DATABASE_URL=... node scripts/eenheidstests.mjs
import { rateLimit } from '../../server/platform/beveiliging';
import { closePool } from '../../server/platform/pg';
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

  await closePool();
  const mis = resultaten.filter(r => !r.ok).length;
  console.log(`\n${resultaten.length - mis}/${resultaten.length} geslaagd (aanmelden)`);
  return mis ? 1 : 0;
}
