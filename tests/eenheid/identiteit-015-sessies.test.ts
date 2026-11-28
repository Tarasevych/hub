// IDENTITEIT-015 (приймання «sessies»): вади, знайдені e2e tests/e2e/identiteit-015-sessies.e2e.ts, і їхні виправлення.
//   (1) «Зберегти цей обліковий запис для наступних сесій» → вимкнути: обліковий запис зникає зі списку швидкого входу НА ЦЬОМУ ПРИСТРОЇ —
//       разом із давнішими «підказками» (гранти revokedAt + hintOnlyAt після звичайного «Вийти») цього ж облікового запису в цьому
//       браузері (backend/grant-browser-vergeten.ts + маршрут security/items/:id/revoke, kind=grant). Інший браузер і інший обліковий
//       запис не зачіпаються. Чисті функції + справжні маршрути проти одноразової бази з підробленим Google.
//   (2) Телефон (≤ 640 px): позначку «Цей пристрій» на картці пристрою більше не сховано — вона в рядку позначок.
// Лише вигадані дані (@example.test); назовні не йде нічого.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-015-sessies.test.ts
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { GRANT_COOKIE_VOORVOEGSEL, accountInBrowserVergeten, grantCookiesVanBrowser, teVergetenGrants, vergetenGrant, type GrantRij } from '../../backend/grant-browser-vergeten';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-sessies');

  // ================================================================ (1a) чисті функції
  {
    const nu = 1_800_000_000_000;
    const ids = { doel: 'grant-doel-0001', hint: 'grant-hint-0002', ander: 'grant-ander-003', vreemd: 'grant-vreemd-04', weg: 'grant-weg-00005' };
    const tok = (k: string) => `token-${k}`;
    const rijen = new Map<string, GrantRij>([
      [ids.doel, { userId: 'u1', tokenHash: sha(tok('doel')), revokedAt: nu - 5 }],
      [ids.hint, { userId: 'u1', tokenHash: sha(tok('hint')), revokedAt: nu - 1000, hintOnlyAt: nu - 1000 }],
      [ids.ander, { userId: 'u2', tokenHash: sha(tok('ander')), revokedAt: nu - 1000, hintOnlyAt: nu - 1000 }],
      [ids.vreemd, { userId: 'u1', tokenHash: sha('ander-token'), revokedAt: nu - 1000, hintOnlyAt: nu - 1000 }],
      [ids.weg, { userId: 'u1', tokenHash: sha(tok('weg')), revokedAt: nu - 9, menuHiddenAt: nu - 9 }],
    ]);
    const cookies: Array<[string, string]> = [
      [`${GRANT_COOKIE_VOORVOEGSEL}${ids.doel}`, tok('doel')], [`${GRANT_COOKIE_VOORVOEGSEL}${ids.hint}`, tok('hint')], [`${GRANT_COOKIE_VOORVOEGSEL}${ids.ander}`, tok('ander')],
      [`${GRANT_COOKIE_VOORVOEGSEL}${ids.vreemd}`, tok('vreemd')], [`${GRANT_COOKIE_VOORVOEGSEL}${ids.weg}`, tok('weg')], ['__Secure-tsv_apparaat', 'x'], [`${GRANT_COOKIE_VOORVOEGSEL}../kwaad`, 'x'],
    ];
    check('cookie браузера: лише tsv_ot_grant_<id> з правильним форматом id', JSON.stringify(grantCookiesVanBrowser(cookies).map((c) => c.id)) === JSON.stringify([ids.doel, ids.hint, ids.ander, ids.vreemd, ids.weg]));
    const v = vergetenGrant({ userId: 'u1', revokedAt: nu - 1000, hintOnlyAt: nu - 1000, tokenHash: 'h' }, nu);
    check('забутий грант: revokedAt лишається (не відновлюється), hintOnlyAt прибрано, menuHiddenAt поставлено', v.revokedAt === nu - 1000 && !('hintOnlyAt' in v) && v.menuHiddenAt === nu && v.tokenHash === 'h');
    check('забутий грант без revokedAt — відкликається зараз', vergetenGrant({ userId: 'u1' }, nu).revokedAt === nu);
    const w = teVergetenGrants({ cookies, doelId: ids.doel, userId: 'u1', rijen, nu });
    check('вимкнення в цьому браузері: забуто сам грант і давнішу підказку того самого облікового запису',
      JSON.stringify(w.map((x) => x.id).sort()) === JSON.stringify([ids.doel, ids.hint].sort()) && w.every((x) => !('hintOnlyAt' in x.record) && Number(x.record.menuHiddenAt) > 0));
    check('не зачеплено: інший обліковий запис у тому самому браузері, грант із чужим токеном, уже забутий', !w.some((x) => [ids.ander, ids.vreemd, ids.weg].includes(x.id)));
    check('відкликають ІНШИЙ браузер (cookie цього гранту в запиті немає) — підказки цього браузера не чіпаються',
      teVergetenGrants({ cookies: cookies.filter(([n]) => !n.endsWith(ids.doel)), doelId: ids.doel, userId: 'u1', rijen, nu }).length === 0);
    check('cookie гранту з чужим токеном (підробка) — нічого', teVergetenGrants({ cookies: cookies.map(([n, t]) => [n, n.endsWith(ids.doel) ? 'vals' : t] as [string, string]), doelId: ids.doel, userId: 'u1', rijen, nu }).length === 0);
    check('грант іншого облікового запису як мета — нічого', teVergetenGrants({ cookies, doelId: ids.ander, userId: 'u1', rijen, nu }).length === 0);
    let geschreven: Array<{ id: string; record: GrantRij }> = [];
    const n = await accountInBrowserVergeten({ lees: async (l) => l.map((id) => rijen.get(id)), schrijf: async (r) => { geschreven = r; } }, { cookies, doelId: ids.doel, userId: 'u1', nu });
    check('виконання: читає гранти з cookie браузера, пише лише змінені', n === 2 && geschreven.length === 2);
  }

  // ================================================================ (2) телефон: «Цей пристрій» видно
  {
    const css = lees('src/sessies/sessies.css');
    const media = css.slice(css.indexOf('@media (max-width:640px)'));
    const mediaBlok = media.slice(0, media.indexOf('}}') + 2);
    check('CSS: на вузькому екрані права позначка схована, але друга (у рядку позначок) — display:inline-flex',
      mediaBlok.includes('.sessie-kop .security-current-badge{display:none}') && /\.sessie-kop \.security-current-badge\.sessie-huidig-mobiel\{display:inline-flex/.test(mediaBlok));
    check('CSS: на широкому екрані друга позначка схована (одна позначка «Цей пристрій» на картку)', css.slice(0, css.indexOf('@media (max-width:640px)')).includes('.sessie-kop .sessie-huidig-mobiel{display:none}'));
    const tsx = lees('src/BeveiligingSessiesPaneel.tsx');
    const badges = tsx.slice(tsx.indexOf("<span className='sessie-badges'>"), tsx.indexOf("<span className='sessie-badges'>") + 700);
    check('картка поточного пристрою: друга позначка «Цей пристрій» (sessie-huidig-mobiel) — у рядку позначок і лише для поточного (a.huidig)',
      badges.includes("a.huidig&&<b className='security-current-badge sessie-huidig-mobiel'>{tr('Цей пристрій','Dit apparaat')}</b>"), badges.slice(-260));
    check('права позначка «Цей пристрій» лишилась для широкого екрана', tsx.includes("{a.huidig&&<b className='security-current-badge'>{tr('Цей пристрій','Dit apparaat')}</b>}"));
  }

  // ================================================================ (1b) справжні маршрути: вимкнення прибирає обліковий запис зі швидкого входу
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const G = await nepGoogle({ ownerEmail: `i015s-eig-${T}@example.test` });
  const pool = getPool();
  const emails: string[] = [];
  try {
    const email = `i015s-a-${T}@example.test`, sub = `i015s-a-${T}`; emails.push(email);
    const tweedeEmail = `i015s-b-${T}@example.test`, tweedeSub = `i015s-b-${T}`; emails.push(tweedeEmail);
    const b = G.browser();
    const id = (body: Record<string, unknown> = {}) => b.ctxBody('identity', body);
    await b.aanmelden(sub, email, { service: 'identity', intent: 'login', remember: true, tabContext: b.tab });
    const userId = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [userId, JSON.stringify({ status: 'approved', name: 'Проба А' })]);
    // інший браузер того самого облікового запису (його підказка має лишитися)
    const ander = G.browser();
    await ander.aanmelden(sub, email, { service: 'identity', intent: 'login', remember: true, tabContext: ander.tab });
    await ander.verzoek('id.tarasevych.com', '/api/owner/session/logout-account-browser', ander.ctxBody('identity'));
    // «Вийти» в цьому браузері (грант → підказка), знову вхід зі «Зберегти» (новий грант)
    const uit = await b.verzoek('id.tarasevych.com', '/api/owner/session/logout-account-browser', id());
    const accountsNaUit = await b.verzoek('id.tarasevych.com', '/api/owner/session/accounts', id());
    check('підготовка: після «Вийти» обліковий запис лишається в швидкому вході як підказка', uit.status === 200 && (accountsNaUit.data.accounts || []).some((a: { user?: { email?: string } }) => a.user?.email === email), JSON.stringify(accountsNaUit.data).slice(0, 200));
    await b.aanmelden(sub, email, { service: 'identity', intent: 'login', remember: true, tabContext: b.tab });
    // інший обліковий запис у тому самому браузері (його запис має лишитися)
    await b.aanmelden(tweedeSub, tweedeEmail, { service: 'identity', intent: 'login', remember: true, tabContext: randomBytes(24).toString('hex') });
    await b.aanmelden(sub, email, { service: 'identity', intent: 'login', remember: true, tabContext: b.tab });
    const ov = await b.verzoek('id.tarasevych.com', '/api/owner/identity/security/overview', id());
    const huidig = ((ov.data.items || []) as Array<{ id: string; kind: string; current?: boolean }>).find((x) => x.kind === 'grant' && x.current);
    const grantCookies = [...b.jar.keys()].filter((k) => k.startsWith(GRANT_COOKIE_VOORVOEGSEL));
    check('підготовка: поточний грант є; у браузері кілька cookie грантів (давніша підказка, інший обліковий запис)', !!huidig && grantCookies.length >= 3, `${grantCookies.length}`);
    // вимкнення «Зберегти…» = відкликати поточний грант (як робить SessiesOverzicht)
    const r = await b.verzoek('id.tarasevych.com', `/api/owner/identity/security/items/${encodeURIComponent(String(huidig?.id))}/revoke`, id({ kind: 'grant' }));
    check('відкликання поточного гранту — 200; сервер каже, скільки записів забуто на цьому пристрої (≥ 2: поточний і давніша підказка)', r.status === 200 && Number(r.data.vergetenOpDitApparaat) >= 2, JSON.stringify(r.data));
    const auditRij = (await pool.query("select details from app.audit where owner_id=$1 and action='owner.browser.grant.revoked' order by id desc limit 1", [userId])).rows[0]?.details as Record<string, unknown> | undefined;
    check('аудит owner.browser.grant.revoked містить кількість забутих на цьому пристрої', Number(auditRij?.vergetenOpDitApparaat) >= 2, JSON.stringify(auditRij));
    await b.verzoek('id.tarasevych.com', '/api/owner/session/logout-account-browser', id());
    const na = await b.verzoek('id.tarasevych.com', '/api/owner/session/accounts', b.ctxBody('identity'));
    const emailsNa = ((na.data.accounts || []) as Array<{ user?: { email?: string } }>).map((a) => a.user?.email);
    check('після вимкнення й «Вийти» цього облікового запису немає в швидкому вході цього браузера', !emailsNa.includes(email), JSON.stringify(emailsNa));
    check('інший обліковий запис у тому самому браузері лишився', emailsNa.includes(tweedeEmail), JSON.stringify(emailsNa));
    const anderNa = await ander.verzoek('id.tarasevych.com', '/api/owner/session/accounts', ander.ctxBody('identity'));
    check('інший браузер того самого облікового запису: його підказка лишилась (вибір діє лише на цьому пристрої)', ((anderNa.data.accounts || []) as Array<{ user?: { email?: string } }>).some((a) => a.user?.email === email), JSON.stringify(anderNa.data).slice(0, 200));
    const opnieuw = await b.verzoek('id.tarasevych.com', `/api/owner/identity/security/items/${encodeURIComponent(String(huidig?.id))}/revoke`, id({ kind: 'grant' }));
    check('повтор (сеанс уже завершено) — без входу, нічого не відновлено', opnieuw.status === 401);
  } finally {
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [emails]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) {
      await pool.query('delete from app.bekende_apparaten where user_id = any($1)', [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    }
    G.herstel();
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);
  return einde();
}
