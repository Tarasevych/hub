// IDENTITEIT-012 (13.11.2026): виправлення безпеки сервера, знайдені під час звірки «Макета» з кодом. Кожна вада спершу описана,
// потім перевірена через справжні маршрути backend/index.ts проти одноразової бази. Лише вигадані дані; нічого не йде назовні.
// Herstel van serverbeveiliging uit de vergelijking van het «Ontwerp» met de code; elke fout via de echte routes getest.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-012-server-veiligheid.test.ts
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';
import { googleStapOpVastleggen } from '../../backend/stap-op';
import { BLOK_GRENZEN, blokInvoerFout, veiligeBlokUrl } from '../../shared/blok-invoer';
import { magEigenToegang } from '../../shared/eigen-toegang';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const HOST = 'id.tarasevych.com';
const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-012-server-veiligheid');

  // ---------------------------------------------------------------- 5. посилання блоку: лише https, без облікових даних, межі
  check('блок: https-посилання прийнято й нормалізовано', veiligeBlokUrl(' https://example.org/pad?x=1 ').ok === true);
  check('блок: порожнє посилання дозволене (внутрішній блок)', JSON.stringify(veiligeBlokUrl('')) === JSON.stringify({ ok: true, url: '' }));
  const slecht = ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://example.org/', 'https://user:pass@example.org/', 'https://exa mple.org', 'ftp://example.org/', `https://example.org/${'a'.repeat(BLOK_GRENZEN.url)}`, 'https://example.org/\u0000'];
  const doorgelaten = slecht.filter((u) => veiligeBlokUrl(u).ok);
  check('блок: javascript:, data:, http:, облікові дані, пробіли, керівні символи й задовгі посилання відхилено', doorgelaten.length === 0, doorgelaten.join(' | '));
  check('блок: задовга назва чи опис → окремі коди помилок', blokInvoerFout({ title: 'н'.repeat(BLOK_GRENZEN.titel + 1) }) === 'BLOK_TITEL_TE_LANG' && blokInvoerFout({ description: 'о'.repeat(BLOK_GRENZEN.omschrijving + 1) }) === 'BLOK_OMSCHRIJVING_TE_LANG' && blokInvoerFout({ title: 'Нотатки', url: 'https://hub.tarasevych.com/' }) === null);
  const index = lees('backend/index.ts');
  check('блок: перевірка стоїть і в додаванні, і в оновленні блоку', (index.match(/blokInvoerFout\(/g) || []).length === 2 && index.includes("{ const f = blokInvoerFout({ title: body.title, description: body.description, url: body.url }); if (f) return error(f, 400);"));

  // ---------------------------------------------------------------- 11. одна умова доступу до власних налаштувань захисту
  check('доступ: схвалений обліковий запис і власник — так; очікування, видалений, порожній — ні',
    magEigenToegang({ status: 'approved', role: 'member' }) && magEigenToegang({ status: 'pending', role: 'owner' }) && !magEigenToegang({ status: 'pending', role: 'member' }) && !magEigenToegang({ status: 'deleted', role: 'admin' }) && !magEigenToegang(null));
  check('доступ: площина доступу, сховище ключів і зовнішні способи входу користуються однією умовою',
    ['backend/toegangslaag.ts', 'backend/sleutelkluis-routes.ts', 'backend/aanmeld-koppel.ts'].every((p) => lees(p).includes('magEigenToegang(')));

  // ---------------------------------------------------------------- маршрути проти бази
  const pool = getPool('systeem');
  const { handler } = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
  const uid = randomUUID();
  const email = `i012-${randomBytes(4).toString('hex')}@eenheid.test`;
  await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email, role: 'member', status: 'approved', name: 'Проба 012' }]);
  const epoch = async () => Number((await pool.query(`SELECT (data->>'epoch')::int AS e FROM app.records WHERE tbl='owner_revocation_state_v1' AND data->>'userId'=$1 ORDER BY (data->>'epoch')::int DESC LIMIT 1`, [uid])).rows[0]?.e || 0);
  const sessie = async () => {
    const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
    const rec = { tokenHash: sha(token), userId: uid, service: 'identity', sourceOrigin: `https://${HOST}`, tabHash: sha('ecosystem'), grantId: '', createdAt: now, authenticatedAt: now, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: await epoch(), scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.12', userAgent: 'eenheid' };
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, rec]);
    return { id, createdAt: now, cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}` };
  };
  const roep = async (pad: string, s: { cookie: string }, body: Record<string, unknown> = {}) => {
    const evt = { headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', cookie: s.cookie, 'user-agent': 'eenheid' }, body: JSON.stringify({ service: 'identity', tabContext: randomBytes(24).toString('hex'), sourceOrigin: `https://${HOST}`, ...body }), httpMethod: 'POST', path: pad, rawPath: pad, requestContext: { http: { method: 'POST', path: pad } } };
    const r = await handler(evt as never);
    let data: Record<string, any> = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ }
    return { status: r.statusCode, data };
  };
  const gastSessie = async () => {
    const code = await pool.query(`INSERT INTO app.toegangscodes (user_id, naam, code_hash, code_hint, scopes, verloopt_op) VALUES ($1,'Проба',$2,'AB12',ARRAY['profiel.lezen'], now() + interval '1 day') RETURNING id`, [uid, sha(randomBytes(16).toString('hex'))]);
    const s = await pool.query(`INSERT INTO app.gast_sessies (code_id, user_id, token_hash, verloopt_op) VALUES ($1,$2,$3, now() + interval '1 day') RETURNING id`, [code.rows[0].id, uid, sha(randomBytes(16).toString('hex'))]);
    return String(s.rows[0].id);
  };
  const gastActief = async (id: string) => !(await pool.query('SELECT ingetrokken_op FROM app.gast_sessies WHERE id=$1', [id])).rows[0]?.ingetrokken_op;

  try {
    // 7+8. Меню: «Налаштування» не ховається; «Міст ШІ» (mcp) зберігається.
    const s1 = await sessie();
    const menu = [{ id: 'identity', visible: false, order: 0, icon: 'settings' }, { id: 'mcp', visible: false, order: 1, icon: 'cable' }, { id: 'hub', visible: true, order: 2, icon: 'home' }];
    const opgeslagen = await roep('/api/owner/ui/preferences/save', s1, { menu });
    const terug = (opgeslagen.data.preferences?.menu || opgeslagen.data.menu || []) as Array<{ id: string; visible: boolean; icon: string }>;
    check('меню: «Налаштування» (identity) лишаються видимими, навіть якщо клієнт просить сховати', opgeslagen.status === 200 && terug.find((m) => m.id === 'identity')?.visible === true, JSON.stringify(opgeslagen.data).slice(0, 300));
    check('меню: «Міст ШІ» (mcp) зберігається сервером із вибором видимості й піктограмою cable', terug.find((m) => m.id === 'mcp')?.visible === false && terug.find((m) => m.id === 'mcp')?.icon === 'cable');

    // 4. Застарілий webauthn/remove закрито.
    const oud = await roep('/api/owner/access/webauthn/remove', s1, { id: randomUUID() });
    check('застарілий webauthn/remove → 410 LEGACY_ROUTE_GONE (без «успіху» в журналі)', oud.status === 410 && oud.data.error === 'LEGACY_ROUTE_GONE', JSON.stringify(oud.data));

    // 6. Пароль понад 1024 символи відхиляє сервер ще до підтвердження й гешування.
    const lang = await roep('/api/owner/access/password/set', s1, { password: 'п'.repeat(1025) });
    check('пароль: понад 1024 символи → 400 ACCESS_PASSWORD_TOO_LONG', lang.status === 400 && lang.data.error === 'ACCESS_PASSWORD_TOO_LONG', JSON.stringify(lang.data));

    // 9. Перейменування ключа доступу без підтвердження → STEP_UP.
    const hernoem = await roep('/api/owner/access/passkeys/hernoemen', s1, { id: randomUUID(), naam: 'Чужий' });
    check('ключ доступу: перейменування без підтвердження → 403 STEP_UP_REQUIRED', hernoem.status === 403 && /STEP_UP/.test(String(hernoem.data.reasonCode || hernoem.data.error)), JSON.stringify(hernoem.data));

    // 10. «Завершити всі інші входи»: без підтвердження — відмова; з підтвердженням — працює й завершує гостьові входи (gast:true).
    const s2 = await sessie();
    const g1 = await gastSessie();
    const zonder = await roep('/api/owner/identity/security/revoke-others', s1, { gast: true });
    check('«Завершити всі інші входи» без підтвердження → 403, інший вхід і гість лишаються', zonder.status === 403 && await gastActief(g1), JSON.stringify(zonder.data));
    await googleStapOpVastleggen(uid, [s1.id], Date.now());
    const met = await roep('/api/owner/identity/security/revoke-others', s1, { gast: true });
    check('«Завершити всі інші входи» після підтвердження → інший вхід і гостьовий вхід завершено', met.status === 200 && met.data.sessions >= 1 && met.data.gast >= 1 && !(await gastActief(g1)), JSON.stringify(met.data));

    // 1+10. «Вийти всюди»: потрібне підтвердження; гостьові входи теж завершуються (раніше лишалися).
    const s3 = await sessie();
    const g2 = await gastSessie();
    const raZonder = await roep('/api/owner/identity/security/revoke-all', s3);
    check('«Вийти всюди» без підтвердження → 403, гостьовий вхід лишається', raZonder.status === 403 && await gastActief(g2), JSON.stringify(raZonder.data));
    await googleStapOpVastleggen(uid, [s3.id], Date.now());
    const ra = await roep('/api/owner/identity/security/revoke-all', s3);
    check('«Вийти всюди» після підтвердження завершує й гостьові входи за кодами доступу', ra.status === 200 && ra.data.gast >= 1 && !(await gastActief(g2)), JSON.stringify(ra.data));
    const audit = await pool.query(`SELECT 1 FROM app.records WHERE tbl='owner_audit_v1' AND data->>'userId'=$1 AND data->>'action'='owner.security.revoke-all' AND (data->'details'->>'gast')::int >= 1`, [uid]).catch(() => ({ rowCount: 0 }));
    check('«Вийти всюди»: кількість завершених гостьових входів записано в журнал аудиту', (audit.rowCount || 0) >= 1 || index.includes("'owner.security.revoke-all','success',{epoch,sessions:sessions.items.length,tabs:tabs.items.length,grants:grants.items.length,gast,"));

    // 1. Аварійне завершення теж завершує гостьові входи.
    const s4 = await sessie();
    const g3 = await gastSessie();
    const nood = await roep('/api/owner/identity/security/emergency-revoke', s4);
    check('аварійне завершення завершує гостьові входи', nood.status === 200 && !(await gastActief(g3)), JSON.stringify(nood.data));
  } finally {
    await pool.query(`DELETE FROM app.toegangscodes WHERE user_id=$1`, [uid]).catch(() => undefined);
  }

  // ---------------------------------------------------------------- 4. застарілі маршрути, які кликав hub
  // IDENTITEIT-015 (етап 1.1): hub перейшов на /api/owner/identity/account/*, а /api/account/{delete,workspaces/:id/restore} → 410.
  // Тому ті самі наслідки тепер перевіряються на ЄДИНОМУ маршруті видалення (нова епоха, усі входи, сховище ключів, гостьові входи,
  // аудит) і на маршруті відновлення простору. Фрагмент законно переїхав; вимоги не послаблено.
  const delNieuw = index.slice(index.indexOf("'POST /api/owner/identity/account/delete'"), index.indexOf("'POST /api/owner/identity/account/workspaces/:id/restore'"));
  check('видалення облікового запису (hub і id.*): нова епоха, завершення всіх входів і гостей, аудит; старий маршрут — 410',
    delNieuw.includes("await deleteRecoverably(auth.user, 'self')") && delNieuw.includes("ownerBumpRevocation(auth.user.id,'account-delete')") && delNieuw.includes('await ownerAllesIntrekken(auth.user.id,now);await gastSessieIntrekken(')
    && delNieuw.includes("'owner.identity.account.delete','success'") && index.includes("'POST /api/account/delete': VEROUDERDE_ROUTE_WEG"));
  check('відновлення простору (hub і id.*) пише аудит; старий маршрут — 410', index.includes("await ownerAudit(auth.user.id,'owner.identity.workspace.restored','success',{workspaceId:ctx.params.id})") && index.includes("'POST /api/account/workspaces/:id/restore': VEROUDERDE_ROUTE_WEG"));
  check('інтерфейс: кнопка «Вийти всюди» блокується, поки дія виконується', lees('src/BeveiligingSessiesPaneel.tsx').includes("data-sessies-overal disabled={busy}"));
  return einde();
}
