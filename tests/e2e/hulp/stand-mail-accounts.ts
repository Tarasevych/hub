// Stand (21.10.2026, агент D): «Поштові акаунти» з ПІДКЛЮЧЕНИМИ акаунтами — справжні рядки в базі (як у
// tests/eenheid/mail-accounts-beheer-20261021.test.ts): основна Gmail власника + додаткова Gmail, Outlook зі станом «потрібен
// повторний вхід», Ukr.net по IMAP. Кроки:
//   mail-accounts-gekoppeld    — у «Підключені акаунти» є «Відключити» для кожного; окремої секції Microsoft немає;
//   mail-gmail-additional      — плитка Gmail → вікно → «Вибрати інший акаунт Google» → перехід на nep-Google з prompt=…select_account;
//   mail-outlook-venster       — плитка Outlook → вікно з полем адреси.
// Нічого не йде назовні: accounts.google.com перехоплює page.route і показує параметри запиту (nep-Google).
import { createHash, randomBytes } from 'node:crypto';
import { db } from '../../../server/platform';
import { getPool } from '../../../server/platform/pg';
import { alsSysteem } from '../../../server/platform/context';

type Page = import('playwright-core').Page;
export type AccCtx = { uid: () => string; eigenaar: string; sub: string; zeg: (s: string) => void; meting: (naam: string, p: Page, slecht: string, detail: string) => void };

const MAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.labels'];
const CLIENT_REF = 'google_suite_web_oauth_client';
let gezaaid = '';

async function principalMet(uid: string, sub: string, email: string, rol: 'primary' | 'additional') {
  const nu = Date.now();
  const [pid] = await db.add('provider_principals_v1', [{ ownerUserId: uid, provider: 'google', providerAccountId: sub, identityProviderAccountId: sub, email, displayName: email.split('@')[0], picture: '', accountRole: rol, identityLinked: rol === 'primary', createdAt: nu, updatedAt: nu }]);
  // Dummy-envelop: de pagina ontsleutelt niets (de stand vangt de enige route die dat zou doen, /preview, in de browser af).
  const [gid] = await db.add('google_oauth_grant_v1', [{ ownerUserId: uid, principalId: pid, providerAccountId: sub, provider: 'google', clientRef: CLIENT_REF, tokenKind: 'refresh_token', algorithm: 'AES-256-GCM', keyVersion: 1, ciphertext: randomBytes(24).toString('base64'), iv: randomBytes(12).toString('base64'), authTag: randomBytes(16).toString('base64'), grantedScopes: ['openid', 'email', 'profile', ...MAIL_SCOPES], grantStatus: 'active', issuedAt: nu, lastVerifiedAt: nu, updatedAt: nu, revokedAt: 0 }]);
  await db.add('provider_service_tokens_v1', [{ ownerUserId: uid, principalId: pid, provider: 'google', service: 'mail', tokenName: 'google_mail_token', tokenKind: 'logical_handle', oauthGrantId: gid, requiredScopes: MAIL_SCOPES, status: 'active', createdAt: nu, updatedAt: nu, revokedAt: 0 }]);
  await db.add('provider_service_grants_v1', [{ ownerUserId: uid, principalId: pid, provider: 'google', service: 'mail', tokenName: 'google_mail_token', oauthClientName: CLIENT_REF, status: 'connected', accountId: pid, grantedScopes: MAIL_SCOPES, runtimeBinding: 'grant_captured_mail_runtime_not_migrated', createdAt: nu, updatedAt: nu, disconnectedAt: 0 }]);
}

/** Eén keer per run: twee Gmail-mailboxen, één Outlook (opnieuw aanmelden nodig), één Ukr.net (IMAP) + Google-instellingen van de server. */
export async function zaaiMailAccounts(c: AccCtx): Promise<void> {
  const uid = c.uid();
  // Google Suite «klaar» op deze stand: sleutel in de omgeving en de terugkeerpagina als «geverifieerd» (de server zou haar anders zelf
  // proberen op te halen, en dat mag hier niet — alleen loopback).
  process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 ||= `stand-mail-accounts-${randomBytes(12).toString('hex')}`;
  if (gezaaid === uid) return;
  gezaaid = uid;
  const redirectHash = createHash('sha256').update('google_suite|https://id.tarasevych.com/').digest('hex');
  await alsSysteem(async () => {
    const rec = { provider: 'google_suite', redirectHash, status: 'verified', reasonCode: 'OK', checkedAt: Date.now() + 24 * 3600_000 };
    const al = (await db.list<Record<string, unknown>>('provider_endpoint_verifications_v1', { filter: { provider: 'google_suite', redirectHash } })).items as Array<{ id: string }>;
    if (al.length) await db.update('provider_endpoint_verifications_v1', al.map((r) => ({ id: r.id, record: rec })));
    else await db.add('provider_endpoint_verifications_v1', [rec]);
  });
  await principalMet(uid, c.sub, c.eigenaar, 'primary');
  await principalMet(uid, `sub-werk-${randomBytes(3).toString('hex')}`, 'robota.pavla.stand@gmail.test', 'additional');
  const nu = Date.now();
  await db.add('mail_accounts_v1', [{ ownerUserId: uid, ruimte: 'prive', provider: 'microsoft', email: 'pavlo.stand@outlook.test', primary: false, identityLinked: false, status: 'reauth_required', createdAt: nu, updatedAt: nu }]);
  await getPool('systeem').query(`INSERT INTO app.mail_imap_koppeling (user_id, id, aanbieder, adres, geheim, ruimte, actief, mappen, smtp_goed, laatst_goed_op, fout) VALUES ($1,$2,'ukrnet','eigenaar@example.test','v1.stand.stand.stand','prive',true,7,true,now(),'') ON CONFLICT DO NOTHING`, [uid, `stand-imap-${uid.slice(0, 8)}`]);
  c.zeg(`   mail-accounts: gezaaid voor ${uid} (2× Gmail, 1× Outlook reauth, 1× Ukr.net)`);
}

/** Vangt in DEZE tab de Gmail-voorvertoning af (die zou de dummy-grant proberen te ontsleutelen) en speelt nep-Google. */
export async function mailAccountsRoutes(page: Page, c: AccCtx): Promise<void> {
  await zaaiMailAccounts(c);
  await page.route('**/api/owner/mail/google-suite/preview', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  // De dummy-grant kan niet ontsleuteld worden: de live-oproepen naar Gmail (etiketten, contactenscan) krijgen hier een rustig, leeg antwoord.
  await page.route('**/api/owner/mail/google-suite/labels', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ source: 'live_on_demand', persisted: false, labels: [], activity: {} }) }));
  await page.route('**/api/owner/mail/contacten/scan/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, scan: null }) }));
  await page.route('https://accounts.google.com/**', (r) => {
    const u = new URL(r.request().url());
    const p = (k: string) => (u.searchParams.get(k) || '—').replace(/[<&>]/g, '');
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width"><title>nep-Google</title><body style="font:16px system-ui;margin:16px;background:#fff;color:#111"><h1 style="font-size:20px">nep-Google (стенд)</h1><dl data-nep-google><dt>prompt</dt><dd data-prompt>${p('prompt')}</dd><dt>login_hint</dt><dd data-login-hint>${p('login_hint')}</dd><dt>state</dt><dd data-state style="overflow-wrap:anywhere">${p('state').slice(0, 40)}…</dd><dt>scope</dt><dd style="overflow-wrap:anywhere">${p('scope')}</dd></dl></body></html>` });
  });
}

export function mailAccountsNa(c: AccCtx) {
  return {
    gekoppeld: async (p: Page) => {
      await p.locator('[data-mail-ontkoppel]').first().waitFor({ timeout: 20000 });
      await p.waitForTimeout(600);
      const m = await p.evaluate(() => ({
        rijen: [...document.querySelectorAll('[data-mail-koppeling]')].map((e) => `${e.getAttribute('data-mail-koppeling')}:${e.getAttribute('data-mail-koppeling-stand')}`),
        ontkoppel: document.querySelectorAll('[data-mail-ontkoppel]').length,
        opnieuw: document.querySelectorAll('[data-mail-opnieuw]').length,
        nogEen: [...document.querySelectorAll('[data-mail-nog-een]')].map((e) => e.getAttribute('data-mail-nog-een')),
        hoofd: !!document.querySelector('.mail-koppeling-hoofd'),
        msSectie: !!document.querySelector('[data-mail-provider-manager="microsoft"]'),
        tegelsPerRij: (() => { const t = [...document.querySelectorAll('.mail-provider-tegel')].map((e) => Math.round(e.getBoundingClientRect().top)); return t.filter((y) => y === t[0]).length; })(),
      }));
      const slecht = [...(m.ontkoppel >= 4 && m.ontkoppel === m.rijen.length ? [] : ['ontkoppel-ontbreekt']), ...(m.msSectie ? ['dubbele-microsoft-sectie'] : []), ...(m.hoofd ? [] : ['geen-hoofdaccount'])];
      c.meting('mail-accounts-gekoppeld', p, slecht.join('; '), JSON.stringify(m));
    },
    gmailExtra: async (p: Page) => {
      await p.locator('[data-mail-provider="gmail"]').first().click({ timeout: 8000 });
      const knop = p.locator('[data-mail-google-start="additional"]').first();
      await knop.waitFor({ timeout: 15000 });
      const venster = await p.evaluate(() => ({ rol: document.querySelector('[data-mail-google-rol]')?.getAttribute('data-mail-google-rol'), fout: document.querySelector('[data-mail-koppel="gmail"] [role="alert"]')?.textContent || '' }));
      await knop.click({ timeout: 5000 });
      await p.waitForURL(/accounts\.google\.com/, { timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(500);
      const u = p.url();
      const params = u.includes('accounts.google.com') ? Object.fromEntries(new URL(u).searchParams) : {};
      const naFout = u.includes('accounts.google.com') ? '' : await p.evaluate(() => document.querySelector('[data-mail-koppel="gmail"] [role="alert"]')?.textContent || 'geen navigatie');
      const slecht = [...(venster.rol === 'additional' ? [] : [`rol=${venster.rol}`]), ...(venster.fout ? [`fout: ${venster.fout}`] : []), ...(naFout ? [`fout na klik: ${naFout}`] : []), ...(/select_account/.test(String(params.prompt || '')) ? [] : ['geen select_account']), ...(params.login_hint ? ['login_hint gezet'] : [])];
      c.meting('mail-gmail-additional', p, slecht.join('; '), JSON.stringify({ venster, prompt: params.prompt, login_hint: params.login_hint || '', state: String(params.state || '').slice(0, 24) }));
    },
    outlook: async (p: Page) => {
      await p.locator('[data-mail-provider="outlook"]').first().click({ timeout: 8000 });
      await p.locator('[data-mail-koppel="outlook"] [data-mail-koppel-adres]').first().waitFor({ timeout: 15000 });
      await p.waitForTimeout(500);
      const m = await p.evaluate(() => ({ adresVeld: !!document.querySelector('[data-mail-koppel="outlook"] [data-mail-koppel-adres]'), knop: !!document.querySelector('[data-mail-koppel="outlook"] [data-mail-koppel-start]'), msSectie: !!document.querySelector('[data-mail-provider-manager="microsoft"]') }));
      c.meting('mail-outlook-venster', p, m.adresVeld && m.knop && !m.msSectie ? '' : 'venster-onvolledig', JSON.stringify(m));
    },
  };
}
