// Eenheidstests voor beveiligingsbouwstenen die niet via HTTP te testen zijn (PKCE, SSRF, sleutels, lockout).
// Draaien: DATABASE_URL=... node scripts/eenheidstests.mjs   (bundelt dit bestand met esbuild en voert het uit)
import { createHash } from 'node:crypto';
import { createOAuthMaterial, takeOAuthMaterial } from '../../backend/oauth-pkce';
import { pinnedFetch, privateAddress } from '../../backend/veilige-fetch';
import { clearLoginFailures, lockoutRemaining, openWithEnvKey, pepperedHash, registerLoginFailure, sealWithEnvKey } from '../../server/platform/beveiliging';
import { closePool } from '../../server/platform/pg';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const fout = async (fn: () => Promise<unknown>) => { try { await fn(); return ''; } catch (e) { return (e as Error).message; } };

export async function main() {
  // PKCE + nonce: willekeurig, S256, eenmalig.
  const state = `eenheidstest-${Date.now()}`;
  const a = await createOAuthMaterial('owner-google', state);
  const b = await createOAuthMaterial('owner-google', `${state}-b`);
  check('PKCE: verifier/nonce willekeurig (43 tekens base64url) en verschillend per start', a.verifier.length === 43 && a.nonce.length === 43 && a.verifier !== b.verifier && a.nonce !== b.nonce);
  check('PKCE: challenge = BASE64URL(SHA256(verifier))', a.challenge === createHash('sha256').update(a.verifier).digest('base64url'));
  const t1 = await takeOAuthMaterial('owner-google', state), t2 = await takeOAuthMaterial('owner-google', state);
  check('PKCE: materiaal is eenmalig op te halen', t1?.verifier === a.verifier && t1?.nonce === a.nonce && t2 === null);
  check('PKCE: ander doel met dezelfde state vindt niets', (await takeOAuthMaterial('google-suite', `${state}-b`)) === null && (await takeOAuthMaterial('owner-google', `${state}-b`))?.verifier === b.verifier);

  // SSRF / DNS-pinning.
  check('SSRF: privé-adressen herkend', ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.1.1', '172.16.0.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'].every(privateAddress) && !privateAddress('8.8.8.8') && !privateAddress('2606:4700::1111'));
  check('SSRF: IP-literal 127.0.0.1 geweigerd', (await fout(() => pinnedFetch('https://127.0.0.1/x', {}, 3000))) === 'SSRF_ADRES_GEWEIGERD');
  check('SSRF: hostnaam die naar loopback resolveert (localhost) geweigerd bij verbinden', (await fout(() => pinnedFetch('https://localhost/x', {}, 3000))) === 'SSRF_ADRES_GEWEIGERD');
  check('SSRF: alleen https', (await fout(() => pinnedFetch('http://example.com/', {}, 3000))) === 'REMOTE_URL_INVALID');

  // Sleutels uit env: AES-256-GCM met AAD, pepper verplicht.
  const env = sealWithEnvKey('TOTP_ENCRYPTION_KEY_V1', 'JBSWY3DPEHPK3PXP', 'identity-totp:v1:u1');
  check('envelop: roundtrip met juiste AAD', openWithEnvKey('TOTP_ENCRYPTION_KEY_V1', env, 'identity-totp:v1:u1') === 'JBSWY3DPEHPK3PXP');
  check('envelop: andere gebruiker (AAD) faalt', (await fout(async () => openWithEnvKey('TOTP_ENCRYPTION_KEY_V1', env, 'identity-totp:v1:u2'))) !== '');
  const pepper = process.env.RECOVERY_CODE_PEPPER; delete process.env.RECOVERY_CODE_PEPPER;
  check('pepper ontbreekt → weigert te hashen', (await fout(async () => pepperedHash('RECOVERY_CODE_PEPPER', 'x'))).startsWith('SLEUTEL_ONTBREEKT'));
  process.env.RECOVERY_CODE_PEPPER = pepper;

  // Lockout-teller.
  const subject = `eenheidstest:${Date.now()}`;
  const tijden: number[] = [];
  for (let i = 0; i < 6; i++) tijden.push(await registerLoginFailure(subject));
  const rest = await lockoutRemaining(subject);
  await clearLoginFailures(subject);
  check('lockout: 4× geen blokkade, 5e → 15 min, 6e → 30 min; wissen heft op', tijden.slice(0, 4).every(x => x === 0) && tijden[4] === 900 && tijden[5] === 1800 && rest > 1700 && (await lockoutRemaining(subject)) === 0, tijden.join(','));

  await closePool();
  const mis = resultaten.filter(r => !r.ok).length;
  console.log(`\n${resultaten.length - mis}/${resultaten.length} geslaagd (eenheidstests)`);
  return mis ? 1 : 0;
}
