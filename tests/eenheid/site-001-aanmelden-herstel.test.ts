// SITE-001 (пункт 25): наскрізна перевірка реєстрації нового облікового запису, запиту на доступ і схвалення,
// входу без Google (пароль + двочинниковий код TOTP), відновлення доступу одноразовим кодом відновлення,
// зміни та скидання пароля, 7-денного повернення від'єднаного способу входу, 30-денного відновлення
// видаленого облікового запису та миттєвого очищення пам'яті прапорців при остаточному стиранні.
// Volledige ketentest voor punt 25: registratie, aanmelden met wachtwoord + TOTP, herstelcodes, wachtwoordherstel en accountherstel.
import { randomBytes } from 'node:crypto';
import { accountMeteenWissen } from '../../backend/account-wissen';
import { alleGecacheteVlagRijen, wisVlagGeheugen } from '../../backend/vlaggen-geheugen';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle, totpCode } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-aanmelden-herstel');
  const sys = getPool('systeem');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = {
    owner: process.env.OWNER_EMAIL,
    id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    totp: process.env.TOTP_ENCRYPTION_KEY_V1,
    pepper: process.env.RECOVERY_CODE_PEPPER,
  };
  if (!process.env.TOTP_ENCRYPTION_KEY_V1) process.env.TOTP_ENCRYPTION_KEY_V1 = randomBytes(32).toString('base64');
  if (!process.env.RECOVERY_CODE_PEPPER || process.env.RECOVERY_CODE_PEPPER.length < 16) {
    process.env.RECOVERY_CODE_PEPPER = `eenheid-herstel-pepper-${randomBytes(16).toString('hex')}`;
  }

  // Тимчасово паркуємо наявного власника в базі (унікальний індекс records_een_eigenaar гарантує щонайбільше одного власника).
  const geparkeerd = (await sys.query(`SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner'`)).rows as Array<{ id: string }>;
  for (const r of geparkeerd) {
    await sys.query(`UPDATE app.records SET data = data || '{"role":"member","_p25_geparkeerd":true}'::jsonb WHERE id=$1`, [r.id]);
  }

  const eigenaarMail = `p25-eig-${T}@example.test`;
  const nieuwMail = `p25-lid-${T}@example.test`;
  const wisMail = `p25-wis-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaarMail });
  const vlagVooraf = (await sys.query(`SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = 'aanmelden-wachtwoord'`)).rows[0];
  const proefVlag = `p25-vlag-${randomBytes(3).toString('hex')}`;

  type Browser = ReturnType<typeof G.browser>;
  const ip = () => `198.51.100.${10 + Math.floor(Math.random() * 220)}`;
  const idPost = (b: Browser, pad: string, extra: Record<string, unknown> = {}, adres?: string) =>
    b.verzoek('id.tarasevych.com', pad, b.ctxBody('identity', extra), adres ? { ip: adres } : {});
  const hubPost = (b: Browser, pad: string, extra: Record<string, unknown> = {}) =>
    b.verzoek('hub.tarasevych.com', pad, b.ctxBody('hub', extra));
  const adminPost = (b: Browser, pad: string, extra: Record<string, unknown> = {}) =>
    b.verzoek('admin.tarasevych.com', pad, b.ctxBody('admin', extra));
  const ctx = (b: Browser) => ({
    service: 'identity',
    tabContext: b.tab,
    sourceOrigin: 'https://id.tarasevych.com',
    returnTo: 'https://id.tarasevych.com/',
    locale: 'uk',
    remember: false,
  });

  try {
    // 1. Власник входить і отримує роль owner; новий користувач уперше входить через Google → стан «new».
    const E = G.browser();
    await E.aanmelden(`sub-p25-eig-${T}`, eigenaarMail, { service: 'admin' });
    const eigId = String((await sys.query(`SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1`, [eigenaarMail])).rows[0]?.id || '');

    const L = G.browser();
    await L.aanmelden(`sub-p25-lid-${T}`, nieuwMail, { service: 'identity' });
    const bootNieuw = await idPost(L, '/api/owner/session/bootstrap');
    const lidId = String(bootNieuw.data?.user?.id || '');
    const wsVoorGoedkeuring = await hubPost(L, '/api/workspace/load');
    check(
      '1. реєстрація: перший вхід створює обліковий запис у стані «new»; до схвалення робочий простір недоступний (403)',
      Boolean(eigId && lidId) && bootNieuw.data?.user?.status === 'new' && wsVoorGoedkeuring.status === 403,
      `status=${bootNieuw.data?.user?.status} ws=${wsVoorGoedkeuring.status}`,
    );

    // 2. Подання запиту на доступ → перехід new → pending + сповіщення власника.
    const aanvraag = await idPost(L, '/api/owner/access/request');
    const verzoekRij = (await sys.query(`SELECT id, data FROM app.records WHERE tbl='access_requests' AND data->>'userId'=$1 LIMIT 1`, [lidId])).rows[0];
    const meldingEig = (await sys.query(`SELECT 1 FROM app.records WHERE tbl='site_notifications' AND data->>'recipientUserId'=$1 AND data->>'kind'='access_request'`, [eigId])).rowCount || 0;
    check(
      '2. запит на доступ: статус переходить у «pending», створено запис запиту й сповіщення власника',
      aanvraag.status === 200 && aanvraag.data?.user?.status === 'pending' && Boolean(verzoekRij?.id) && meldingEig >= 1,
      `${aanvraag.status} ${aanvraag.data?.user?.status} req=${verzoekRij?.id}`,
    );

    // 3. Схвалення власником зі свіжим підтвердженням → статус «approved» і готовий особистий простір.
    await E.aanmelden(`sub-p25-eig-${T}`, eigenaarMail, { intent: 'step-up', service: 'admin', returnTo: 'https://admin.tarasevych.com/' });
    const besluit = await adminPost(E, `/api/owner/admin/access-requests/${verzoekRij.id}`, {
      decision: 'approve',
      confirmation: 'ADMIN_POLICY_CHANGE',
    });
    const Lhub = G.browser();
    await Lhub.aanmelden(`sub-p25-lid-${T}`, nieuwMail, { service: 'hub' });
    const wsNa = await hubPost(Lhub, '/api/workspace/load');
    const wsId = String(wsNa.data?.workspace?.id || '');
    check(
      '3. схвалення доступу: власник схвалює запит → обліковий запис «approved» і особистий простір створено',
      besluit.status === 200 && besluit.data?.user?.status === 'approved' && wsNa.status === 200 && Boolean(wsId),
      `besluit=${besluit.status} ws=${wsNa.status} wsId=${wsId}`,
    );

    // Увімкнемо вхід паролем для нашого перевіркового облікового запису.
    await sys.query(`UPDATE app.feature_flags SET aan = true, standaard = false, percentage = 0, gebruikers = $1 WHERE sleutel = 'aanmelden-wachtwoord'`, [[eigId, lidId]]);
    wisVlagGeheugen();

    // 4. Перевірка валідації пароля та встановлення власного пароля.
    await L.aanmelden(`sub-p25-lid-${T}`, nieuwMail, { intent: 'step-up', service: 'identity', returnTo: 'https://id.tarasevych.com/security' });
    const teKort = await idPost(L, '/api/owner/access/password/set', { password: 'kort' });
    const ww1 = `Sterk-Wachtwoord-1-${T}`;
    const zetWw1 = await idPost(L, '/api/owner/access/password/set', { password: ww1 });
    check(
      '4. встановлення пароля: короткий пароль (< 10 символів) відхилено (400), надійний збережено з прив’язкою способу входу',
      teKort.status === 400 && teKort.data?.error === 'ACCESS_PASSWORD_TOO_SHORT' && zetWw1.status === 200 && zetWw1.data?.password?.configured === true,
      `kort=${teKort.status} zet=${zetWw1.status}`,
    );

    // 5. Увімкнення двочинникової перевірки (TOTP) і випуск одноразових кодів відновлення.
    const totpStart = await idPost(L, '/api/owner/access/totp/start');
    const geheim = String(totpStart.data?.secret || '');
    const stapNu = Math.floor(Date.now() / 30000);
    const totpBevestig = await idPost(L, '/api/owner/access/totp/confirm', { code: totpCode(geheim, stapNu - 1) });
    const herstelCodes: string[] = Array.isArray(totpBevestig.data?.recoveryCodes) ? totpBevestig.data.recoveryCodes : [];
    const herstelRij = (await sys.query(`SELECT data FROM app.records WHERE tbl='identity_recovery_v1' AND data->>'userId'=$1 LIMIT 1`, [lidId])).rows[0]?.data;
    check(
      '5. двочинниковий захист і коди відновлення: TOTP підтверджено, видано 10 одноразових кодів (у базі лише геші, жодного відкритого коду)',
      totpStart.status === 200 && totpBevestig.status === 200 && herstelCodes.length === 10
        && !JSON.stringify(herstelRij || {}).includes(herstelCodes[0]),
      `codes=${herstelCodes.length}`,
    );

    // 6. Вхід паролем без Google: хибний пароль, відсутній TOTP, уже використаний крок TOTP та свіжий крок TOTP.
    const wwAanmelden = async (b: Browser, password: string, code = '') => {
      const a = ip();
      const s = await b.verzoek('id.tarasevych.com', '/api/aanmelden/wachtwoord/start', ctx(b), { ip: a });
      const v = await b.verzoek('id.tarasevych.com', '/api/aanmelden/wachtwoord/voltooien', { pogingId: s.data.pogingId, email: nieuwMail, password, code }, { ip: a });
      return { s, v };
    };
    const foutWw = await wwAanmelden(G.browser(), 'Verkeerd-Wachtwoord-999', totpCode(geheim, stapNu));
    const zonderTotp = await wwAanmelden(G.browser(), ww1, '');
    const hergebruiktTotp = await wwAanmelden(G.browser(), ww1, totpCode(geheim, stapNu - 1));
    await sys.query(`DELETE FROM app.login_lockouts WHERE subject LIKE $1`, [`wachtwoord:${nieuwMail}:%`]);
    const B1 = G.browser();
    const goedMetTotp = await wwAanmelden(B1, ww1, totpCode(geheim, stapNu));
    const bootB1 = await idPost(B1, '/api/owner/session/bootstrap');
    check(
      '6. вхід паролем + TOTP: хибний пароль, відсутній і повторно використаний TOTP дають 401; свіжий TOTP створює сеанс',
      foutWw.v.status === 401 && foutWw.v.data?.error === 'ACCESS_CREDENTIALS_INVALID'
        && zonderTotp.v.status === 401 && zonderTotp.v.data?.error === 'ACCESS_CREDENTIALS_INVALID'
        && hergebruiktTotp.v.status === 401
        && goedMetTotp.v.status === 200 && goedMetTotp.v.data?.sessionCreated === true && bootB1.data?.user?.id === lidId,
      `fout=${foutWw.v.status} zonder=${zonderTotp.v.status} her=${hergebruiktTotp.v.status} goed=${goedMetTotp.v.status}`,
    );

    // 7. Відновлення входу за одноразовим кодом відновлення (при втраті застосунку TOTP) і перевірка одноразовості.
    const B2 = G.browser();
    const metHerstel1 = await wwAanmelden(B2, ww1, herstelCodes[0]);
    const herhaalHerstel1 = await wwAanmelden(G.browser(), ww1, herstelCodes[0]);
    await sys.query(`DELETE FROM app.login_lockouts WHERE subject LIKE $1`, [`wachtwoord:${nieuwMail}:%`]);
    const overzichtNa1 = await idPost(L, '/api/owner/access/recovery/overzicht');
    check(
      '7. вхід кодом відновлення: перший код відкриває сеанс і зменшує залишок до 9; повтор того самого коду відхиляється (401)',
      metHerstel1.v.status === 200 && metHerstel1.v.data?.sessionCreated === true
        && herhaalHerstel1.v.status === 401 && overzichtNa1.data?.resterend === 9,
      `eerste=${metHerstel1.v.status} tweede=${herhaalHerstel1.v.status} over=${overzichtNa1.data?.resterend}`,
    );

    // 8. Зміна пароля після підтвердження одноразовим кодом відновлення та скидання пароля адміністратором.
    const Loud = G.browser();
    const oudTijd = Math.floor(Date.now() / 1000) - 3600;
    await Loud.aanmelden(`sub-p25-lid-${T}`, nieuwMail, { service: 'identity', authTime: oudTijd, iat: oudTijd });
    // За наявності TOTP звичайний вхід відкриває ворота другого чинника — проходимо їх одноразовим кодом відновлення!
    const stapMetCode = await idPost(Loud, '/api/owner/access/stap-op', { methode: 'herstelcode', code: herstelCodes[1], actie: 'aanmeldmethode' });
    const ww2 = `Nieuw-Sterk-Wachtwoord-2-${T}`;
    const zetWw2 = await idPost(Loud, '/api/owner/access/password/set', { password: ww2 });
    const oudWeigert = await wwAanmelden(G.browser(), ww1, herstelCodes[2]);
    await sys.query(`DELETE FROM app.login_lockouts WHERE subject LIKE $1`, [`wachtwoord:${nieuwMail}:%`]);
    const B3 = G.browser();
    const nieuwWerkt = await wwAanmelden(B3, ww2, herstelCodes[2]);
    check(
      '8. зміна забутого пароля через код відновлення: після stap-op кодом старий пароль більше не діє (401), новий працює (200)',
      stapMetCode.status === 200 && stapMetCode.data?.resterend === 8 && zetWw2.status === 200
        && oudWeigert.v.status === 401 && nieuwWerkt.v.status === 200 && nieuwWerkt.v.data?.sessionCreated === true,
      `stap=${stapMetCode.status} zet=${zetWw2.status} oud=${oudWeigert.v.status} nieuw=${nieuwWerkt.v.status}`,
    );

    // Скидання пароля власником/адміністратором → тимчасовий пароль mustChange відхиляється до зміни на власний.
    const E_id = G.browser();
    await E_id.aanmelden(`sub-p25-eig-${T}`, eigenaarMail, { service: 'identity' });
    await E_id.aanmelden(`sub-p25-eig-${T}`, eigenaarMail, { intent: 'step-up', service: 'identity', returnTo: 'https://id.tarasevych.com/security' });
    const resetAdmin = await idPost(E_id, `/api/owner/access/user/${lidId}/reset-password`);
    const tmpWw = String(resetAdmin.data?.temporaryPassword || '');
    const tmpPoging = await wwAanmelden(G.browser(), tmpWw, herstelCodes[3]);
    await sys.query(`DELETE FROM app.login_lockouts WHERE subject LIKE $1`, [`wachtwoord:${nieuwMail}:%`]);
    const ww3 = `Eigen-Na-Reset-3-${T}`;
    await idPost(Loud, '/api/owner/access/stap-op', { methode: 'herstelcode', code: herstelCodes[3], actie: 'aanmeldmethode' });
    const zetWw3 = await idPost(Loud, '/api/owner/access/password/set', { password: ww3 });
    const naResetEigen = await wwAanmelden(G.browser(), ww3, herstelCodes[4]);
    check(
      '9. скидання пароля адміністратором: тимчасовий пароль має mustChange=true і не пускає напряму (403), новий власний — пускає (200)',
      resetAdmin.status === 200 && resetAdmin.data?.mustChange === true && tmpPoging.v.status === 403
        && tmpPoging.v.data?.error === 'ACCESS_PASSWORD_MUST_CHANGE' && zetWw3.status === 200 && naResetEigen.v.status === 200,
      `reset=${resetAdmin.status} tmp=${tmpPoging.v.status}(${tmpPoging.v.data?.error}) eigen=${naResetEigen.v.status}`,
    );

    // 10. Від'єднання пароля та 7-денне відновлення способу входу («Повернути спосіб входу»).
    const wegWw = await idPost(Loud, '/api/owner/access/password/remove');
    const herstelbaarLijst = wegWw.data?.herstelbaar || [];
    const terugWw = await idPost(Loud, '/api/owner/access/method/herstel', { method: 'password' });
    check(
      '10. повернення від’єднаного способу входу: після вилучення пароль у списку 7-денного відновлення, після herstel — знову активний',
      wegWw.status === 200 && herstelbaarLijst.some((x: { method?: string }) => x.method === 'password')
        && terugWw.status === 200 && terugWw.data?.password?.configured === true,
      `weg=${wegWw.status} terug=${terugWw.status}`,
    );

    // 11. Видалення облікового запису з 30-денним вікном та повне відновлення облікового запису й простору.
    await Loud.aanmelden(`sub-p25-lid-${T}`, nieuwMail, { intent: 'step-up', service: 'identity', returnTo: 'https://id.tarasevych.com/recovery' });
    await idPost(Loud, '/api/owner/access/stap-op', { methode: 'herstelcode', code: herstelCodes[5], actie: 'account-verwijderen' });
    const verwijder = await idPost(Loud, '/api/owner/identity/account/delete', { confirmEmail: nieuwMail });
    const wsArch = (await sys.query(`SELECT data->>'archivedReason' AS r FROM app.records WHERE tbl='workspaces' AND id=$1`, [wsId])).rows[0]?.r;
    const Lherstel = G.browser();
    await Lherstel.aanmelden(`sub-p25-lid-${T}`, nieuwMail, { service: 'identity' });
    const bootVerwijderd = await idPost(Lherstel, '/api/owner/session/bootstrap');
    const herstelAcc = await idPost(Lherstel, '/api/owner/identity/account/recover', { mode: 'restore' });
    const wsHersteld = (await sys.query(`SELECT COALESCE((data->>'archivedAt')::bigint, 0) AS a FROM app.records WHERE tbl='workspaces' AND id=$1`, [wsId])).rows[0]?.a;
    check(
      '11. видалення та 30-денне відновлення облікового запису: delete переводить у «deleted» й архівує простір, recover повертає «approved» і простір',
      verwijder.status === 200 && wsArch === 'account_deleted' && bootVerwijderd.data?.user?.status === 'deleted'
        && herstelAcc.status === 200 && herstelAcc.data?.user?.status === 'approved' && Number(wsHersteld) === 0,
      `del=${verwijder.status} arch=${wsArch} boot=${bootVerwijderd.data?.user?.status} rec=${herstelAcc.status} wsA=${wsHersteld}`,
    );

    // 12. Перевірка виправлення SITE-001 у accountMeteenWissen: миттєве очищення пам'яті прапорців без очікування 15 с.
    const wisId = `p25-wis-${T}`;
    await sys.query(`INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2::jsonb)`, [
      wisId,
      JSON.stringify({ email: wisMail, role: 'member', status: 'approved', name: 'Проба стирання' }),
    ]);
    await sys.query(`INSERT INTO app.feature_flags (sleutel, omschrijving, aan, gebruikers, gewijzigd_door) VALUES ($1, 'proef p25', true, $2::text[], $3)`, [
      proefVlag,
      [eigId, wisId],
      eigId,
    ]);
    wisVlagGeheugen();
    const voorWis = (await alleGecacheteVlagRijen()).find((r) => r.sleutel === proefVlag)?.gebruikers as string[] | undefined;
    await accountMeteenWissen(wisId, wisMail);
    const naWis = (await alleGecacheteVlagRijen()).find((r) => r.sleutel === proefVlag)?.gebruikers as string[] | undefined;
    check(
      '12. остаточне стирання (accountMeteenWissen): пам’ять прапорців очищується миттєво — стертого ID немає в кеші одразу після COMMIT',
      Array.isArray(voorWis) && voorWis.includes(wisId) && Array.isArray(naWis) && !naWis.includes(wisId) && naWis.includes(eigId),
      `voor=${JSON.stringify(voorWis)} na=${JSON.stringify(naWis)}`,
    );
  } catch (e) {
    check('неочікувана помилка у наскрізному сценарії п. 25', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    await sys.query(`DELETE FROM app.feature_flags WHERE sleutel = $1`, [proefVlag]).catch(() => undefined);
    if (vlagVooraf) {
      await sys.query(
        `UPDATE app.feature_flags SET aan=$2, standaard=$3, percentage=$4, gebruikers=$5 WHERE sleutel=$1`,
        [vlagVooraf.sleutel, vlagVooraf.aan, vlagVooraf.standaard, vlagVooraf.percentage, vlagVooraf.gebruikers],
      ).catch(() => undefined);
    }
    wisVlagGeheugen();
    const ids = (await sys.query(`SELECT id FROM app.records WHERE tbl='users' AND data->>'email' LIKE $1`, [`p25-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      for (const t of ['passkeys', 'passkey_uitdagingen', 'toegang_gebruik', 'toegang_notities', 'bekende_apparaten', 'sleutelkluis_omslag', 'sleutelkluis_journaal', 'sleutelkluis']) {
        await sys.query(`DELETE FROM app.${t} WHERE user_id = ANY($1)`, [ids]).catch(() => undefined);
      }
      await sys.query(`DELETE FROM app.records WHERE tbl IN ('workspace_members','workspace_blocks') AND data->>'workspaceId' IN (SELECT id FROM app.records WHERE tbl='workspaces' AND data->>'ownerUserId' = ANY($1))`, [ids]).catch(() => undefined);
      await sys.query(`DELETE FROM app.records WHERE id = ANY($1) OR data->>'userId' = ANY($1) OR data->>'accountId' = ANY($1) OR data->>'recipientUserId' = ANY($1) OR data->>'ownerUserId' = ANY($1)`, [ids]).catch(() => undefined);
      await sys.query(`DELETE FROM app.login_lockouts WHERE subject = ANY($1)`, [ids.map((i) => `stap-op:${i}`)]).catch(() => undefined);
    }
    await sys.query(`DELETE FROM app.login_lockouts WHERE subject LIKE $1`, [`wachtwoord:${nieuwMail}:%`]).catch(() => undefined);
    await sys.query(`DELETE FROM app.aanmeld_uitdagingen WHERE aangemaakt_op > now() - interval '1 hour'`).catch(() => undefined);
    for (const r of geparkeerd) {
      await sys.query(`UPDATE app.records SET data = (data - '_p25_geparkeerd') || '{"role":"owner"}'::jsonb WHERE id=$1`, [r.id]).catch(() => undefined);
    }
    for (const [k, v] of Object.entries({
      OWNER_EMAIL: vorige.owner,
      GOOGLE_OAUTH_CLIENT_ID: vorige.id,
      GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret,
      TOTP_ENCRYPTION_KEY_V1: vorige.totp,
      RECOVERY_CODE_PEPPER: vorige.pepper,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  await closePool().catch(() => undefined);
  return einde();
}
