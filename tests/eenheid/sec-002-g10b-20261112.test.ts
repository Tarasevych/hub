// SEC-002 (12.11.2026), група «g10b»: відтворення й регресія знахідок privacy-logboek-01/07/08, http-rand-01/09,
// autorisatie-04, geheimen-02/04/06/07/08, extensie-06, aanv-gat-a-02. Лише вигадані секрети; нічого не йде назовні.
// Запуск: DATABASE_URL=<власна тестова база> node scripts/eenheidstests.mjs sec-002-g10b-20261112.test.ts
import { createCipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer as maakHttpServer, request as httpVerzoek } from 'node:http';
import { connect as netVerbind } from 'node:net';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isServerEnvelop } from '../../shared/sleutelkluis';
import { checker, nepGoogle, type NepGoogle } from './hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { gcmOpenStrikt, openWithEnvKey, sealWithEnvKey } from '../../server/platform/beveiliging';
import { decryptCloudGrant, encryptCloudGrant } from '../../backend/cloud-verbinding-m4-pg';
import { persoonsgegevensExport, verlopenVerwijderingenAfronden, zonderGeheimen } from '../../backend/privacy';
import { attachAgentGateway } from '../../backend/connectors-gateway';
import * as sk from '../../backend/sleutelkluis';
import * as diagnose from '../../backend/diagnose';
import { opruimen } from '../../backend/opruimen';
import { sleutelkluisRoutes } from '../../backend/sleutelkluis-routes';

const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g10b-20261112');

  // ---------------------------------------------------------------- geheimen-06: AES-GCM — лише 12-байтовий IV і 16-байтовий тег
  {
    const sleutelNaam = 'SEC002_G10B_PROEFSLEUTEL_V1';
    process.env[sleutelNaam] = randomBytes(32).toString('hex'); // вигаданий ключ лише для цього тесту
    const aad = 'sec002|g10b|proef';
    const goed = sealWithEnvKey(sleutelNaam, 'вигаданий секрет', aad);
    const [v, iv, ct, tag] = goed.split('.');
    const tagBuf = Buffer.from(tag, 'base64url');
    const korteTags = [4, 8, 12, 15].map((n) => [v, iv, ct, tagBuf.subarray(0, n).toString('base64url')].join('.'));
    const aanvaard = korteTags.filter((e) => { try { openWithEnvKey(sleutelNaam, e, aad); return true; } catch { return false; } }).length;
    let anderIvGeweigerd = false;
    try { openWithEnvKey(sleutelNaam, [v, Buffer.concat([Buffer.from(iv, 'base64url'), Buffer.alloc(4)]).toString('base64url'), ct, tag].join('.'), aad); } catch (e) { anderIvGeweigerd = (e as Error).message === 'ENVELOP_ONGELDIG'; }
    check('geheimen-06: openWithEnvKey відкидає обрізаний тег (4/8/12/15 байтів) і IV іншої довжини, а справжній конверт відкриває',
      aanvaard === 0 && anderIvGeweigerd && openWithEnvKey(sleutelNaam, goed, aad) === 'вигаданий секрет', `прийнято коротких тегів: ${aanvaard}`);
    delete process.env[sleutelNaam];

    const vorigeCloud = process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1;
    process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1 = randomBytes(32).toString('hex'); // вигаданий ключ
    const cloudGoed = encryptCloudGrant({ token: 'вигаданий-токен' }, 'cloud|proef');
    const [cv, civ, ctag, cpayload] = cloudGoed.split('.');
    const cloudKort = [4, 8, 12].map((n) => [cv, civ, Buffer.from(ctag, 'base64url').subarray(0, n).toString('base64url'), cpayload].join('.'));
    const cloudAanvaard = cloudKort.filter((e) => { try { decryptCloudGrant(e, 'cloud|proef'); return true; } catch { return false; } }).length;
    check('geheimen-06: decryptCloudGrant відкидає обрізаний тег, а справжній конверт відкриває',
      cloudAanvaard === 0 && decryptCloudGrant<{ token: string }>(cloudGoed, 'cloud|proef').token === 'вигаданий-токен', `прийнято коротких тегів: ${cloudAanvaard}`);
    if (vorigeCloud === undefined) delete process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1; else process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1 = vorigeCloud;

    // Решта місць розшифрування не експортовані: вони мусять іти через спільний суворий помічник, без «голого» createDecipheriv.
    const kaal = ['backend/google-suite-inrichting.ts', 'backend/google-contour.ts', 'backend/cloud-verbinding-m4-pg.ts']
      .filter((p) => /createDecipheriv\(/.test(lees(p)) || !lees(p).includes('gcmOpenStrikt('));
    check('geheimen-06: Google-гранти, клієнт Google і хмарні токени розшифровуються через gcmOpenStrikt (IV 12, тег 16)', kaal.length === 0, kaal.join(', '));
    const sleutel = randomBytes(32), iv12 = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', sleutel, iv12); c.setAAD(Buffer.from('a'));
    const tekst = Buffer.concat([c.update('x'), c.final()]);
    const volleTag = c.getAuthTag();
    const strikt = (i: Buffer, t: Buffer) => { try { return gcmOpenStrikt(sleutel, i, t, tekst, Buffer.from('a')).toString() === 'x'; } catch { return false; } };
    check('geheimen-06: gcmOpenStrikt — повний тег так; тег 4/12 байтів, IV 16 байтів і зіпсований тег ні',
      strikt(iv12, volleTag) && !strikt(iv12, volleTag.subarray(0, 4)) && !strikt(iv12, volleTag.subarray(0, 12)) && !strikt(Buffer.concat([iv12, Buffer.alloc(4)]), volleTag)
      && !strikt(iv12, Buffer.from(volleTag.map((b, i) => (i === 0 ? b ^ 1 : b)))));
  }

  // ---------------------------------------------------------------- geheimen-07: ротація серверного ключа через версію конверта
  {
    const v1 = 'SEC002_G10B_ROTATIE_V1', v2 = 'SEC002_G10B_ROTATIE_V2', aad = 'sec002|g10b|rotatie';
    process.env[v1] = randomBytes(32).toString('hex'); // вигадані ключі лише для цього тесту
    delete process.env[v2];
    const oud = sealWithEnvKey(v1, 'старе значення', aad);
    process.env[v2] = randomBytes(32).toString('hex');
    let nieuw = '';
    try { nieuw = sealWithEnvKey(v1, 'нове значення', aad); } catch { nieuw = ''; }
    const open = (e: string) => { try { return openWithEnvKey(v1, e, aad); } catch (x) { return `FOUT:${(x as Error).message}`; } };
    const vervalst = nieuw ? ['v1', ...nieuw.split('.').slice(1)].join('.') : '';
    check('geheimen-07: з новим ключем <НАЗВА>_V2 нові конверти пишуться під V2 («v2.…»), старі «v1.…» читаються далі',
      nieuw.startsWith('v2.') && open(nieuw) === 'нове значення' && open(oud) === 'старе значення' && open(vervalst).startsWith('FOUT'),
      JSON.stringify({ prefix: nieuw.split('.')[0], nieuw: open(nieuw), oud: open(oud) }));
    delete process.env[v2];
    check('geheimen-07: без ключа V2 конверт «v2.…» не відкривається (жодного тихого падіння на V1)', !!nieuw && open(nieuw).startsWith('FOUT:SLEUTEL_ONTBREEKT'), open(nieuw));
    delete process.env[v1];
    check('geheimen-07: конверт «v2.…» лишається «серверним» (сховище ключів перешифровує його) і не потрапляє в експорт',
      isServerEnvelop('v2.aaaa.bbbb.cccc') && !isServerEnvelop('dek1.a.b.c') && (zonderGeheimen({ vrij: 'v2.aaaa.bbbb.cccc' }) as Record<string, unknown>).vrij === '[versleuteld, niet opgenomen]');
    // toets-g10b #2: модулі із запасним TOTP обирають назву за наявністю V1 — після прибирання V1 вони тихо перейшли б на TOTP.
    // Тому V1 не прибирається ніколи (реєстр), а для «чи є власний ключ» є спільна перевірка будь-якої версії.
    const bev = await import('../../server/platform/beveiliging') as Record<string, unknown>;
    const beschikbaar = typeof bev.envSleutelBeschikbaar === 'function' ? bev.envSleutelBeschikbaar as (n: string) => boolean : null;
    process.env.SEC002_G10B_ALLEEN_V2 = randomBytes(32).toString('hex'); // вигаданий
    const alleenV2 = !!beschikbaar && beschikbaar('SEC002_G10B_ALLEEN_V1') && !beschikbaar('SEC002_G10B_NIETS_V1');
    let v2ZonderV1 = '';
    try { v2ZonderV1 = openWithEnvKey('SEC002_G10B_ALLEEN_V1', sealWithEnvKey('SEC002_G10B_ALLEEN_V1', 'z', 'a'), 'a'); } catch (x) { v2ZonderV1 = `FOUT:${(x as Error).message}`; }
    delete process.env.SEC002_G10B_ALLEEN_V2;
    const regNl = lees('deploy/GEHEIMEN-REGISTER.nl.md');
    check('toets-g10b #2: V1 ніколи не прибирається (реєстр і скрипт), а envSleutelBeschikbaar бачить будь-яку версію ключа',
      alleenV2 && v2ZonderV1 === 'z' && !/pas daarna kan V1 weg/i.test(regNl) && /V1 nooit verwijderen/i.test(regNl)
      && !/доки є v1-записи/.test(lees('deploy/geheimen-register.sh')) && /V1 ніколи не видаляти/.test(lees('deploy/geheimen-register.sh')),
      JSON.stringify({ alleenV2, v2ZonderV1 }));
    const register = lees('deploy/geheimen-register.sh');
    check('geheimen-07: реєстр описує ротацію через _V2 для ключів конвертів (не лише «НЕ ротувати»)',
      /TOTP_ENCRYPTION_KEY_V1\)[^\n]*_V2/.test(register) && /AGENT_SLEUTEL_V1\)[^\n]*_V2/.test(register) && lees('deploy/GEHEIMEN-REGISTER.nl.md').includes('_V2'));
  }

  // ---------------------------------------------------------------- geheimen-08: права geheimen.env і таблиця реєстру
  {
    const map = mkdtempSync(join(tmpdir(), 'sec002-g10b-geheimen-'));
    try {
      const env = join(map, 'geheimen.env'), journaal = join(map, 'geheimen.journaal');
      writeFileSync(env, 'OWNER_EMAIL=eigenaar@example.invalid\n'); chmodSync(env, 0o644);
      writeFileSync(journaal, ''); chmodSync(journaal, 0o644);
      const r1 = spawnSync('bash', ['deploy/geheimen-aanmaken.sh', '--stil', env], { encoding: 'utf8' });
      const modus = statSync(env).mode & 0o777, jModus = statSync(journaal).mode & 0o777;
      check('geheimen-08: файл секретів 0644 звужується до 0640 з попередженням; журнал примусово 0600',
        r1.status === 0 && modus === 0o640 && jModus === 0o600 && /0644/.test(r1.stderr) && /0640/.test(r1.stderr),
        JSON.stringify({ status: r1.status, modus: modus.toString(8), journaal: jModus.toString(8), stderr: r1.stderr.slice(0, 200) }));
      chmodSync(env, 0o640);
      const r2 = spawnSync('bash', ['deploy/geheimen-aanmaken.sh', '--stil', env], { encoding: 'utf8' });
      check('geheimen-08: дозволені права 0640 лишаються без змін і без попередження', r2.status === 0 && (statSync(env).mode & 0o777) === 0o640 && !/LET OP/.test(r2.stderr), r2.stderr.slice(0, 200));
      const reg = join(map, 'REGISTER.md');
      const r3 = spawnSync('bash', ['deploy/geheimen-register.sh', '--env', env, '--journaal', journaal, '--uit', reg], { encoding: 'utf8' });
      const regels = existsSync(reg) ? readFileSync(reg, 'utf8').split('\n') : [];
      const kop = regels.find((x) => x.startsWith('| Назва')) || '';
      const rijen = regels.filter((x) => x.startsWith('| `')).length;
      const geteld = Number((/\((\d+) regels/.exec(r3.stdout) || [])[1] || -1);
      check('geheimen-08: реєстр — справжня таблиця з 6 стовпців (заголовок, роздільник, без «@@») і правильний лічильник рядків',
        r3.status === 0 && kop.split('|').length === 8 && regels.includes('|---|---|---|---|---|---|') && !regels.some((x) => x.includes('@@')) && rijen > 5 && geteld === rijen,
        JSON.stringify({ kop, rijen, geteld }));
    } finally { rmSync(map, { recursive: true, force: true }); }
  }

  // ---------------------------------------------------------------- extensie-06: налагоджувач не працює на сторонньому сайті
  {
    const pad = join(process.cwd(), 'extension', 'debugger-wacht.js');
    const W = existsSync(pad) ? await import(pathToFileURL(pad).href).catch(() => null) as null | {
      debugAdresMag: (url: string, domeinen: string[]) => boolean;
      contextWacht: (domeinen: string[]) => { gebeurtenis: (m: string, p: Record<string, any>) => boolean; hoofdContext: (frameId: string) => number | null };
    } : null;
    const dom = ['admin.tarasevych.com', 'mcp.tarasevych.com'];
    const adres = !!W && W.debugAdresMag('https://admin.tarasevych.com/beheer', dom) && !W.debugAdresMag('https://accounts.google.com/', dom)
      && !W.debugAdresMag('https://admin.tarasevych.com:8443/', dom) && !W.debugAdresMag('http://admin.tarasevych.com/', dom)
      && !W.debugAdresMag('https://hub.tarasevych.com/', dom) && !W.debugAdresMag('niet-een-adres', dom);
    check('extensie-06: debugAdresMag — лише https-адреси адміністративних хостів із розблокування', adres);
    let stroom = false;
    if (W) {
      const w = W.contextWacht(dom);
      const eigen = { context: { id: 1, origin: 'https://admin.tarasevych.com', auxData: { isDefault: true, frameId: 'F' } } };
      const vreemdFrame = { context: { id: 2, origin: 'https://embed.example.test', auxData: { isDefault: true, frameId: 'G' } } };
      w.gebeurtenis('Runtime.executionContextCreated', eigen); w.gebeurtenis('Runtime.executionContextCreated', vreemdFrame);
      const a = w.gebeurtenis('Runtime.consoleAPICalled', { executionContextId: 1 }) && !w.gebeurtenis('Runtime.consoleAPICalled', { executionContextId: 2 })
        && !w.gebeurtenis('Runtime.exceptionThrown', { exceptionDetails: { executionContextId: 2 } }) && w.hoofdContext('F') === 1;
      const b = w.gebeurtenis('Network.requestWillBeSent', { requestId: 'r1', documentURL: 'https://admin.tarasevych.com/beheer' })
        && !w.gebeurtenis('Network.requestWillBeSent', { requestId: 'r2', documentURL: 'https://accounts.google.com/' })
        && w.gebeurtenis('Network.loadingFinished', { requestId: 'r1' }) && !w.gebeurtenis('Network.loadingFinished', { requestId: 'r2' })
        && !w.gebeurtenis('Network.loadingFailed', { requestId: 'onbekend' });
      // Навігація головного кадру на сторонній сайт: усі контексти зникають, новий — чужий.
      w.gebeurtenis('Runtime.executionContextsCleared', {});
      w.gebeurtenis('Runtime.executionContextCreated', { context: { id: 3, origin: 'https://accounts.google.com', auxData: { isDefault: true, frameId: 'F' } } });
      const c = !w.gebeurtenis('Runtime.consoleAPICalled', { executionContextId: 1 }) && !w.gebeurtenis('Runtime.consoleAPICalled', { executionContextId: 3 }) && w.hoofdContext('F') === null;
      stroom = a && b && c;
    }
    check('extensie-06: події консолі/мережі лише з контекстів і документів дозволених хостів; після навігації на чужий сайт — нічого, головного контексту немає', stroom);
    const bg = lees('extension/background.js');
    const bijwerken = bg.slice(bg.indexOf('chrome.tabs.onUpdated.addListener((tabId, info, tab)'), bg.indexOf('chrome.tabs.onUpdated.addListener((tabId, info, tab)') + 1800);
    const diag = bg.slice(bg.indexOf('async function deepDiagnostics'), bg.indexOf('async function uitvoerScript'));
    const script = bg.slice(bg.indexOf('async function uitvoerScript'), bg.indexOf('async function screenshot'));
    check('extensie-06: background.js — навігація приєднаної вкладки поза дозволені хости одразу від’єднує налагоджувач',
      /attached\.has\(tabId\)[\s\S]{0,200}debugAdresMag\(info\.url/.test(bijwerken) && /chrome\.debugger\.detach\(\{ tabId \}\)/.test(bijwerken));
    check('extensie-06: діагностика фільтрує події через contextWacht і нічого не повертає, якщо вкладка покинула дозволені сторінки',
      diag.includes('contextWacht(') && diag.includes('DEBUG_WEIGER.VERLATEN') && bg.includes('VERLATEN:'));
    check('extensie-06: evaluate_script виконується лише в головному контексті дозволеного походження (contextId) і перевіряє адресу після виконання',
      script.includes('contextId') && script.includes('hoofdContext(') && script.includes('DEBUG_WEIGER.VERLATEN') && /Runtime\.evaluate'[\s\S]*chrome\.tabs\.get\(tab\.id\)/.test(script));
  }

  // ---------------------------------------------------------------- Тести з базою даних
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) {
    console.log('OVERGESLAGEN (DB-integratie): geen database');
    return einde();
  }
  const sys = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const opruimIds: string[] = [];
  let G: NepGoogle | null = null;
  try {
    // ------------------------------------------------------------ privacy-logboek-01: остаточне стирання після 30 днів
    {
      const weg = `sec002-g10b-weg-${sfx}`;
      const blijft = `sec002-g10b-blijft-${sfx}`;
      opruimIds.push(weg, blijft);
      const nu = Date.now();
      await sys.query("INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2::jsonb), ('users', $3, $4::jsonb)", [
        weg, JSON.stringify({ email: `weg-${sfx}@test.invalid`, name: 'Weg', role: 'member', status: 'deleted', deletedAt: nu - 31 * 864e5, recoverableUntil: nu - 864e5 }),
        blijft, JSON.stringify({ email: `blijft-${sfx}@test.invalid`, name: 'Blijft', role: 'member', status: 'deleted', deletedAt: nu - 864e5, recoverableUntil: nu + 29 * 864e5 }),
      ]);
      for (const id of [weg, blijft]) {
        await sys.query('INSERT INTO app.notities (user_id, ruimte, titel, inhoud_md) VALUES ($1, $2, $3, $4)', [id, 'prive', 'Приватна нотатка', 'вигаданий вміст']);
        await sys.query('INSERT INTO app.zoek_objecten (user_id, ruimte, bron, bron_id, titel, tekst) VALUES ($1, $2, $3, $4, $5, $6)', [id, 'prive', 'mail', `m-${id}`, 'Лист', 'повний текст вигаданого листа']);
        await sys.query('INSERT INTO app.zoek_geschiedenis (user_id, ruimte, vraag, vraag_norm) VALUES ($1, $2, $3, $4)', [id, 'prive', 'вигаданий запит', 'вигаданий запит']);
        await sys.query('INSERT INTO app.mail_drafts (user_id, local_id, subject, plain_text) VALUES ($1, $2, $3, $4)', [id, `d-${id}`, 'Чернетка', 'вигаданий текст чернетки']);
        await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)', ['workspaces', `ws-${id}`, JSON.stringify({ ownerUserId: id, accountId: id, name: 'x' })]);
      }
      const tel = async (id: string) => {
        const r = await sys.query(
          `SELECT (SELECT count(*)::int FROM app.notities WHERE user_id = $1) AS notities,
                  (SELECT count(*)::int FROM app.zoek_objecten WHERE user_id = $1) AS zoek,
                  (SELECT count(*)::int FROM app.zoek_geschiedenis WHERE user_id = $1) AS geschiedenis,
                  (SELECT count(*)::int FROM app.mail_drafts WHERE user_id = $1) AS concepten,
                  (SELECT count(*)::int FROM app.records WHERE tbl <> 'users' AND data->>'accountId' = $1) AS records`, [id]);
        return r.rows[0] as { notities: number; zoek: number; geschiedenis: number; concepten: number; records: number };
      };
      const droog = await verlopenVerwijderingenAfronden(nu, false);
      const droogWeg = droog.accounts.find((a) => a.id === weg);
      const voor = await tel(weg);
      check('privacy-logboek-01: сухий режим нічого не стирає, але рахує й реляційні рядки (за тим самим планом)',
        droog.uitgevoerd === false && !!droogWeg && droogWeg.rijen >= 5 && voor.notities === 1 && voor.zoek === 1 && voor.concepten === 1 && voor.records === 1
        && !droog.accounts.some((a) => a.id === blijft), JSON.stringify({ droogWeg, voor }));
      const echt = await verlopenVerwijderingenAfronden(nu, true);
      const na = await tel(weg);
      const naBlijft = await tel(blijft);
      const graf = (await sys.query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [weg])).rows[0]?.data || {};
      check('privacy-logboek-01: після 30 днів стерто ВСЕ — нотатки, пошуковий індекс, історію пошуку, чернетки й записи',
        echt.accounts.some((a) => a.id === weg) && na.notities === 0 && na.zoek === 0 && na.geschiedenis === 0 && na.concepten === 0 && na.records === 0,
        JSON.stringify(na));
      check('privacy-logboek-01: надгробок без персональних даних і з gewistAt; акаунт у межах 30 днів не зачеплено',
        graf.email === `gewist-${weg}@invalid` && !!graf.gewistAt && graf.name === ''
        && naBlijft.notities === 1 && naBlijft.zoek === 1 && naBlijft.geschiedenis === 1 && naBlijft.concepten === 1 && naBlijft.records === 1,
        JSON.stringify({ graf: graf.email, naBlijft }));
      const privacyBron = lees('backend/privacy.ts');
      check('privacy-logboek-01: cron-шлях іде через повне стирання accountMeteenWissen',
        /verlopenVerwijderingenAfronden[\s\S]*accountMeteenWissen\(/.test(privacyBron) && lees('backend/opruimen.ts').includes('verlopenVerwijderingenAfronden()'));

      // toets-g10b #4: таблиці із зовнішнім ключем без каскаду (cloud_overdracht_jobs ← cloud_move_proofs / cloud_m9_upload_checkpoints,
      // ON DELETE RESTRICT) не валять стирання; акаунт, що падає щоразу, не блокує інших і лишає слід в аудиті.
      const fk = `sec002-g10b-fk-${sfx}`, kapot = `sec002-g10b-kapot-${sfx}`;
      opruimIds.push(fk, kapot);
      const oudeVerwijdering = { status: 'deleted', deletedAt: nu - 31 * 864e5, recoverableUntil: nu - 864e5 };
      await sys.query("INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2::jsonb), ('users', $3, $4::jsonb)", [
        fk, JSON.stringify({ email: `fk-${sfx}@test.invalid`, name: 'FK', role: 'member', ...oudeVerwijdering }),
        kapot, JSON.stringify({ email: String(process.env.OWNER_EMAIL || 'eigenaar@example.invalid'), name: 'Kapot', role: 'member', ...oudeVerwijdering }),
      ]);
      const job = randomUUID();
      let fkOpgezet = '';
      try {
        await sys.query(`INSERT INTO app.cloud_overdracht_jobs (id, user_id, ruimte, idempotentie_sleutel, fingerprint, verzoek) VALUES ($1, $2, 'prive', $3, $4, '{}'::jsonb)`, [job, fk, `sleutel-${sfx}`, 'a'.repeat(64)]);
        await sys.query(`INSERT INTO app.cloud_move_proofs (job_id, user_id, ruimte, bewijs) VALUES ($1, $2, 'prive', '{}'::jsonb)`, [job, fk]);
        await sys.query(`INSERT INTO app.cloud_m9_upload_checkpoints (job_id, user_id, ruimte, account_id, provider, encrypted_session, doel, naam, bron_revisie, total_bytes, lease_token, lease_until)
          VALUES ($1, $2, 'prive', $2, 'dropbox', decode(repeat('00', 32), 'hex'), 'doel', 'naam', 'r1', 1, 'l', now())`, [job, fk]);
        await sys.query('INSERT INTO app.notities (user_id, ruimte, titel, inhoud_md) VALUES ($1, $2, $3, $4)', [fk, 'prive', 'нотатка', 'вигаданий вміст']);
      } catch (e) { fkOpgezet = String((e as Error).message).slice(0, 160); }
      const r1 = await verlopenVerwijderingenAfronden(nu, true);
      const rest = (await sys.query(`SELECT (SELECT count(*)::int FROM app.notities WHERE user_id = $1) AS notities, (SELECT count(*)::int FROM app.cloud_overdracht_jobs WHERE user_id = $1) AS jobs,
          (SELECT count(*)::int FROM app.cloud_move_proofs WHERE user_id = $1) AS bewijzen, (SELECT count(*)::int FROM app.cloud_m9_upload_checkpoints WHERE user_id = $1) AS checkpoints`, [fk])).rows[0];
      const grafFk = (await sys.query("SELECT data->>'gewistAt' AS g FROM app.records WHERE tbl = 'users' AND id = $1", [fk])).rows[0];
      check('toets-g10b #4: акаунт із перенесенням хмари (FK ON DELETE RESTRICT) стирається повністю: 0 рядків і gewistAt',
        !fkOpgezet && !r1.accounts.find((a) => a.id === fk)?.fout && rest.notities === 0 && rest.jobs === 0 && rest.bewijzen === 0 && rest.checkpoints === 0 && !!grafFk?.g,
        JSON.stringify({ fkOpgezet, verslag: r1.accounts.find((a) => a.id === fk), rest, gewist: grafFk?.g }));
      const kapotRij = (await sys.query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [kapot])).rows[0]?.data || {};
      const kapotAudit = (await sys.query("SELECT count(*)::int AS n FROM app.audit WHERE action = 'privacy.afronden_mislukt' AND details::text LIKE $1", [`%${kapot}%`]).catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n;
      check('toets-g10b #4: акаунт, що не стирається, позначено (лічильник спроб), записано в аудит, і він іде в кінець черги',
        !!r1.accounts.find((a) => a.id === kapot)?.fout && Number(kapotRij.afrondenMislukt) >= 1 && kapotAudit >= 1 && /ORDER BY[^;]*afrondenMislukt[^;]*recoverableUntil/.test(lees('backend/privacy.ts')),
        JSON.stringify({ mislukt: kapotRij.afrondenMislukt, kapotAudit }));
      await sys.query('DELETE FROM app.audit WHERE action = $1 AND details::text LIKE $2', ['privacy.afronden_mislukt', `%${kapot}%`]).catch(() => undefined);
      await sys.query('DELETE FROM app.cloud_move_proofs WHERE user_id = $1', [fk]).catch(() => undefined);
      await sys.query('DELETE FROM app.cloud_m9_upload_checkpoints WHERE user_id = $1', [fk]).catch(() => undefined);
      await sys.query('DELETE FROM app.cloud_overdracht_jobs WHERE user_id = $1', [fk]).catch(() => undefined);
    }

    // ------------------------------------------------------------ http-rand-01: WebSocket-upgrade з ціллю «//» не валить процес
    {
      const server = maakHttpServer((_req, res) => { res.statusCode = 200; res.end('ok'); });
      attachAgentGateway(server, new Set(['127.0.0.1']));
      await new Promise<void>((klaar) => server.listen(0, '127.0.0.1', () => klaar()));
      const poort = (server.address() as { port: number }).port;
      const onopgevangen: string[] = [];
      const vang = (e: unknown) => { onopgevangen.push(String((e as Error)?.message || e)); };
      process.on('uncaughtException', vang);
      const upgrade = (doel: string) => new Promise<string>((klaar) => {
        let uit = '';
        const s = netVerbind(poort, '127.0.0.1', () => s.write(`GET ${doel} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGVzdHRlc3R0ZXN0dGVzdA==\r\n\r\n`));
        s.on('data', (d) => { uit += String(d); });
        s.on('error', () => klaar(uit || 'FOUT'));
        s.on('close', () => klaar(uit));
        setTimeout(() => { s.destroy(); klaar(uit || 'GEEN-ANTWOORD'); }, 1500).unref();
      });
      const doelen = ['//', '//?a', '//#', '//@', '//x:y', '/\\x:y'];
      const antwoorden: string[] = [];
      for (const d of doelen) antwoorden.push((await upgrade(d)).split('\r\n')[0]);
      const onbekend = (await upgrade('/bestaat-niet')).split('\r\n')[0];
      await new Promise((r) => setTimeout(r, 50));
      process.off('uncaughtException', vang);
      const leeft = await fetch(`http://127.0.0.1:${poort}/`).then((r) => r.status).catch(() => 0);
      // До патча сокети upgrade лишаються висіти (ніхто їх не закриває), тож на закриття сервера не чекаємо довше пів секунди.
      await Promise.race([new Promise<void>((klaar) => { server.closeAllConnections?.(); server.close(() => klaar()); }), new Promise((r) => setTimeout(r, 500))]);
      check('http-rand-01: upgrade з нерозбірливою ціллю («//», «//x:y» …) не дає необробленого винятку (процес не падає)', onopgevangen.length === 0, onopgevangen.join(' | '));
      check('http-rand-01: така ціль дістає 400, невідомий шлях — 404, сервер і далі відповідає',
        antwoorden.every((a) => a === 'HTTP/1.1 400 Bad Request') && onbekend === 'HTTP/1.1 404 Not Found' && leeft === 200, JSON.stringify({ antwoorden, onbekend, leeft }));
      const startBron = lees('server/start.ts');
      check('http-rand-01: процес має запобіжник необроблених винятків і відхилень (server/platform/proces-vangnet.ts)',
        startBron.includes('procesVangnetInstellen()') && lees('server/platform/proces-vangnet.ts').includes("process.on('uncaughtException'") && lees('server/platform/proces-vangnet.ts').includes("process.on('unhandledRejection'"));
    }

    // ------------------------------------------------------------ Спільне для тестів через справжній обробник (вигаданий Google)
    const T = `${Date.now().toString(36)}${sfx}`;
    G = await nepGoogle({ ownerEmail: `sec002-g10b-eig-${T}@example.test` });
    const g = G;
    const idVan = async (email: string) => (await sys.query("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'email' = $1 ORDER BY seq DESC LIMIT 1", [email])).rows[0]?.id as string;
    const maak = async (naam: string) => {
      const email = `sec002-g10b-${naam}-${T}@example.test`, b = g.browser();
      await b.aanmelden(`sec002-g10b-${naam}-${T}`, email, { intent: 'login' });
      const id = await idVan(email);
      await sys.query("UPDATE app.records SET data = data || '{\"status\":\"approved\"}'::jsonb WHERE tbl = 'users' AND id = $1", [id]);
      opruimIds.push(id);
      return { b, email, id };
    };
    type Mens = Awaited<ReturnType<typeof maak>>;
    const hub = (u: Mens, pad: string, extra: Record<string, unknown> = {}) => u.b.verzoek('hub.tarasevych.com', pad, u.b.ctxBody('hub', extra));

    // ------------------------------------------------------------ autorisatie-04: колишній учасник не змінює «свої» блоки в чужому просторі
    {
      const O = await maak('o'), M = await maak('m'), K = await maak('k');
      const wsO = (await hub(O, '/api/workspace/load')).data.workspace?.id as string;
      await hub(M, '/api/workspace/load'); await hub(K, '/api/workspace/load');
      const lidVan = async (u: Mens) => ((await hub(O, '/api/share/members', { workspaceId: wsO })).data.members || []).find((l: { userId: string }) => l.userId === u.id)?.id as string;
      const blokVoorO = async (id: string) => ((await hub(O, '/api/workspace/load', { workspaceId: wsO })).data.blocks || []).find((x: { id: string }) => x.id === id) as { title?: string; url?: string; ownerUserId?: string } | undefined;
      // A: учасник-редактор додає блок, власник відкликає доступ
      await hub(O, '/api/share/email', { workspaceId: wsO, email: M.email, workspaceRole: 'member' });
      const blokM = (await hub(M, '/api/blocks/add', { workspaceId: wsO, title: 'блок учасника', url: 'https://example.test/eerlijk' })).data.block?.id as string;
      const alsLid = await hub(M, `/api/blocks/${blokM}/update`, { title: 'змінено учасником' });
      check('autorisatie-04: чинний учасник-редактор і далі змінює свій блок у спільному просторі (поведінку не зламано)', !!blokM && alsLid.status === 200, `${alsLid.status}`);
      const intrek = await hub(O, '/api/share/revoke', { workspaceId: wsO, memberId: await lidVan(M) });
      const wijzig = await hub(M, `/api/blocks/${blokM}/update`, { title: 'ЗМІНЕНО ПІСЛЯ ВІДКЛИКАННЯ', url: 'https://kwaad.example.test/phish' });
      const wis = await hub(M, `/api/blocks/${blokM}/delete`);
      const zicht = await blokVoorO(blokM);
      check('autorisatie-04: після відкликання доступу колишній учасник НЕ змінює і НЕ видаляє блок у чужому просторі',
        intrek.status === 200 && wijzig.status === 403 && wis.status === 403 && zicht?.title === 'змінено учасником' && zicht?.url === 'https://example.test/eerlijk',
        JSON.stringify({ intrek: intrek.status, wijzig: wijzig.status, wis: wis.status, titel: zicht?.title, url: zicht?.url }));
      const eigenaarWist = await hub(O, `/api/blocks/${blokM}/delete`);
      check('autorisatie-04: блок відкликаного учасника переходить власникові простору — власник може його прибрати',
        zicht?.ownerUserId === O.id && eigenaarWist.status === 200 && !(await blokVoorO(blokM)), JSON.stringify({ eigenaar: zicht?.ownerUserId === O.id, wis: eigenaarWist.status }));
      // B: пониження до «лише перегляд»
      await hub(O, '/api/share/email', { workspaceId: wsO, email: K.email, workspaceRole: 'member' });
      const blokK = (await hub(K, '/api/blocks/add', { workspaceId: wsO, title: 'блок другого учасника', url: 'https://example.test/twee' })).data.block?.id as string;
      const lager = await hub(O, '/api/share/role', { workspaceId: wsO, memberId: await lidVan(K), workspaceRole: 'viewer' });
      const kWijzig = await hub(K, `/api/blocks/${blokK}/update`, { url: 'https://kwaad.example.test/kijker' });
      const kWis = await hub(K, `/api/blocks/${blokK}/delete`);
      const kZicht = await blokVoorO(blokK);
      check('autorisatie-04: після пониження до «лише перегляд» колишній редактор не змінює і не видаляє блок',
        !!blokK && lager.status === 200 && kWijzig.status === 403 && kWis.status === 403 && kZicht?.url === 'https://example.test/twee',
        JSON.stringify({ lager: lager.status, wijzig: kWijzig.status, wis: kWis.status, url: kZicht?.url }));
      // toets-g10b #5: пониження повторним «Поділитися» (share/email на ту саму адресу) теж передає блоки власнику
      const S = await maak('s');
      await hub(S, '/api/workspace/load');
      await hub(O, '/api/share/email', { workspaceId: wsO, email: S.email, workspaceRole: 'member' });
      const blokS = (await hub(S, '/api/blocks/add', { workspaceId: wsO, title: 'блок третього учасника', url: 'https://example.test/s' })).data.block?.id as string;
      const herdeel = await hub(O, '/api/share/email', { workspaceId: wsO, email: S.email, workspaceRole: 'viewer' });
      const sWis = await hub(S, `/api/blocks/${blokS}/delete`);
      const sZicht = await blokVoorO(blokS);
      const oWisS = await hub(O, `/api/blocks/${blokS}/delete`);
      check('toets-g10b #5: пониження через повторне «Поділитися» — колишній редактор не видаляє, блок переходить власнику, власник його прибирає',
        !!blokS && herdeel.status === 200 && sWis.status === 403 && sZicht?.ownerUserId === O.id && oWisS.status === 200,
        JSON.stringify({ herdeel: herdeel.status, sWis: sWis.status, eigenaar: sZicht?.ownerUserId === O.id, oWis: oWisS.status }));
      // C: членство зникло іншим шляхом (без передавання блоків) — вирішує поточне право в просторі, а не «я автор блока»
      await hub(O, '/api/share/email', { workspaceId: wsO, email: M.email, workspaceRole: 'member' });
      const blokC = (await hub(M, '/api/blocks/add', { workspaceId: wsO, title: 'третій блок', url: 'https://example.test/drie' })).data.block?.id as string;
      await sys.query("DELETE FROM app.records WHERE tbl = 'workspace_members' AND data->>'workspaceId' = $1 AND data->>'userId' = $2", [wsO, M.id]);
      const cWijzig = await hub(M, `/api/blocks/${blokC}/update`, { url: 'https://kwaad.example.test/drie' });
      const cWis = await hub(M, `/api/blocks/${blokC}/delete`);
      check('autorisatie-04: без чинного членства автор блока дістає 403 «Write access required» (перевірка поточного права, не лише авторства)',
        !!blokC && cWijzig.status === 403 && cWijzig.data.error === 'Write access required' && cWis.status === 403 && cWis.data.error === 'Write access required' && (await blokVoorO(blokC))?.url === 'https://example.test/drie',
        JSON.stringify({ wijzig: [cWijzig.status, cWijzig.data.error], wis: [cWis.status, cWis.data.error] }));
      // Власний простір: без змін
      const eigen = (await hub(M, '/api/blocks/add', { workspaceId: (await hub(M, '/api/workspace/load')).data.workspace?.id, title: 'власний', url: 'https://example.test/eigen' })).data.block?.id as string;
      const eigenWijzig = await hub(M, `/api/blocks/${eigen}/update`, { title: 'власний 2' });
      const eigenWis = await hub(M, `/api/blocks/${eigen}/delete`);
      check('autorisatie-04: у власному просторі людина й далі змінює та видаляє свої блоки', eigenWijzig.status === 200 && eigenWis.status === 200, `${eigenWijzig.status}/${eigenWis.status}`);
    }

    // ------------------------------------------------------------ aanv-gat-a-02: видалений (заблокований) акаунт не скасовує видалення сам
    {
      const zet = (id: string, extra: Record<string, unknown>) => sys.query("UPDATE app.records SET data = data || $2::jsonb WHERE tbl = 'users' AND id = $1", [id, JSON.stringify(extra)]);
      const stand = async (id: string) => (await sys.query("SELECT data->>'status' AS s, data->>'deletionSource' AS d FROM app.records WHERE tbl = 'users' AND id = $1", [id])).rows[0] as { s: string; d: string };
      const nu = Date.now();
      const weg = { status: 'deleted', deletedAt: nu, recoverableUntil: nu + 29 * 864e5 };
      const opnieuw = async (u: Mens, naam: string) => { const b = g.browser(); await b.aanmelden(`sec002-g10b-${naam}-${T}`, u.email, { intent: 'login' }); return { ...u, b }; };
      // A: видалено адміністратором (був схвалений) — новий вхід дає сеанс для екрана відновлення, але не скасування
      const A = await maak('admweg');
      await zet(A.id, { ...weg, deletionSource: 'admin', statusVoorVerwijdering: 'approved' });
      const A2 = await opnieuw(A, 'admweg');
      const oudVerzoek = await hub(A2, '/api/access/request');
      // IDENTITEIT-015: /api/account/recover закрито (410); той самий шлях — новий маршрут /api/owner/identity/account/recover (теж із hub).
      const herstel = await hub(A2, '/api/owner/identity/account/recover', { mode: 'restore' });
      const naA = await stand(A.id);
      check('aanv-gat-a-02: видалений адміністратором не скасовує видалення застарілим POST /api/access/request (403, status лишається deleted)',
        oudVerzoek.status === 403 && herstel.status === 403 && naA.s === 'deleted' && naA.d === 'admin', JSON.stringify({ oud: oudVerzoek.status, herstel: herstel.status, na: naA }));
      // B: заблокований, потім видалений — жодного сеансу (ні старого, ні нового входу)
      const B = await maak('blokweg');
      await zet(B.id, { ...weg, deletionSource: 'admin', statusVoorVerwijdering: 'blocked' });
      const blijvend = await hub(B, '/api/access/request');
      const B2 = await opnieuw(B, 'blokweg');
      const naInlog = await hub(B2, '/api/access/request');
      const naB = await stand(B.id);
      check('aanv-gat-a-02: заблокований-і-видалений не має сеансу (старий відхилено, новий вхід відхилено), status лишається deleted',
        [401, 403].includes(blijvend.status) && naInlog.status === 401 && naB.s === 'deleted', JSON.stringify({ blijvend: blijvend.status, naInlog: naInlog.status, na: naB }));
      // C: поведінку не зламано — сам видалений (був схвалений) відновлюється; новий акаунт і далі просить доступ
      const C = await maak('zelfweg');
      await zet(C.id, { ...weg, deletionSource: 'self', statusVoorVerwijdering: 'approved' });
      const terug = await hub(await opnieuw(C, 'zelfweg'), '/api/owner/identity/account/recover', { mode: 'restore' });
      const N = await maak('nieuwkomer');
      await zet(N.id, { status: 'new' });
      const vraagN = await hub(N, '/api/access/request');
      check('aanv-gat-a-02: самостійне відновлення (200, approved) і запит доступу нового акаунта (200, pending) працюють як раніше',
        terug.status === 200 && (await stand(C.id)).s === 'approved' && vraagN.status === 200 && (await stand(N.id)).s === 'pending',
        JSON.stringify({ terug: terug.status, n: vraagN.status }));
    }

    // ------------------------------------------------------------ toets-g10b #6: гостьові коди видаленого (заблокованого) власника не діють
    {
      const tc = await import('../../backend/toegangscodes');
      const G6 = { id: `sec002-g10b-gastweg-${sfx}` };
      opruimIds.push(G6.id);
      await sys.query("INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2::jsonb)", [G6.id, JSON.stringify({ email: `${G6.id}@test.invalid`, name: 'G', role: 'member', status: 'approved' })]);
      const scope = Object.keys(tc.GAST_SCOPES)[0];
      // IDENTITEIT-015 (sleutels-gasten): код не-власника сайту діє лише з прапорцем gastcodes-iedereen для нього (backend/index.ts
      // реєструє цю перевірку). Тут вмикаємо прапорець саме G6, щоб перевірка #6 і далі стосувалася видалення власника коду; після — назад.
      const vlagVoor = (await sys.query("SELECT gebruikers FROM app.feature_flags WHERE sleutel = 'gastcodes-iedereen'")).rows[0]?.gebruikers as string[] | undefined;
      if (vlagVoor) await sys.query("UPDATE app.feature_flags SET gebruikers = array_append(gebruikers, $1) WHERE sleutel = 'gastcodes-iedereen'", [G6.id]);
      const gemaakt = await tc.codeMaken({ id: G6.id }, { naam: 'проба', scopes: [scope], verloop: { soort: 'nooit' } });
      const eerst = await tc.inwisselen({ code: gemaakt.code });
      const vooraf = !!(await tc.gastVanCookie(eerst.token));
      await sys.query("UPDATE app.records SET data = data || $2::jsonb WHERE tbl = 'users' AND id = $1", [G6.id, JSON.stringify({ status: 'deleted', statusVoorVerwijdering: 'blocked', deletionSource: 'admin', deletedAt: Date.now(), recoverableUntil: Date.now() + 29 * 864e5 })]);
      const naCookie = await tc.gastVanCookie(eerst.token);
      const naCode = await tc.inwisselen({ code: gemaakt.code }).then(() => 'ingewisseld', (e) => String((e as Error).message));
      check('toets-g10b #6: після «заблоковано → видалено» гостьова сесія й гостьовий код власника більше не діють',
        vooraf && naCookie === null && naCode !== 'ingewisseld', JSON.stringify({ vooraf, naCookie: !!naCookie, naCode }));
      await sys.query('DELETE FROM app.gast_sessies WHERE user_id = $1', [G6.id]).catch(() => undefined);
      await sys.query('DELETE FROM app.toegangscode_log WHERE user_id = $1', [G6.id]).catch(() => undefined);
      await sys.query('DELETE FROM app.toegangscodes WHERE user_id = $1', [G6.id]).catch(() => undefined);
      if (vlagVoor) await sys.query("UPDATE app.feature_flags SET gebruikers = $1 WHERE sleutel = 'gastcodes-iedereen'", [vlagVoor]).catch(() => undefined);
    }

    // ------------------------------------------------------------ http-rand-09: Server-Timing не є часовим оракулом входу
    {
      // Dynamisch: server/start.ts importeert backend/index, dat GOOGLE_OAUTH_CLIENT_ID bij het laden leest (pas na nepGoogle).
      const { createServer: maakAppServer } = await import('../../server/start');
      const server = maakAppServer();
      await new Promise<void>((klaar) => server.listen(0, '127.0.0.1', () => klaar()));
      const poort = (server.address() as { port: number }).port;
      const H = await maak('timing');
      const vraag = (host: string, pad: string, body: Record<string, unknown>, cookie = '') => new Promise<{ status: number; timing: string }>((klaar) => {
        const data = JSON.stringify(body);
        const r = httpVerzoek({ host: '127.0.0.1', port: poort, path: pad, method: 'POST', headers: { host, origin: `https://${host}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...(cookie ? { cookie } : {}) } },
          (res) => { res.resume(); res.on('end', () => klaar({ status: res.statusCode || 0, timing: String(res.headers['server-timing'] || '') })); });
        r.on('error', () => klaar({ status: 0, timing: '' }));
        r.end(data);
      });
      const onbekend = await vraag('id.tarasevych.com', '/api/owner/access/password/login', { email: `onbekend-${sfx}@example.test`, password: 'вигаданий-пароль-123', service: 'identity' });
      const begin = await vraag('hub.tarasevych.com', '/api/owner/identity/transactions/create', { service: 'hub', tabContext: randomBytes(24).toString('hex'), flowMode: 'redirect', returnTo: 'https://hub.tarasevych.com/', locale: 'nl', intent: 'login', remember: false });
      const koek = [...H.b.jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const gewoon = await vraag('hub.tarasevych.com', '/api/workspace/load', H.b.ctxBody('hub'), koek);
      const zonderSessie = await vraag('hub.tarasevych.com', '/api/workspace/load', H.b.ctxBody('hub'));
      await new Promise<void>((klaar) => { server.closeAllConnections?.(); server.close(() => klaar()); });
      check('http-rand-09: відмова входу (4xx), маршрути входу й відмови без сеансу не несуть Server-Timing; звичайна успішна відповідь — несе',
        onbekend.status >= 400 && onbekend.status < 500 && onbekend.timing === '' && begin.status === 200 && begin.timing === ''
        && zonderSessie.status >= 400 && zonderSessie.timing === '' && gewoon.status === 200 && /^app;dur=/.test(gewoon.timing),
        JSON.stringify({ login: [onbekend.status, onbekend.timing], begin: [begin.status, begin.timing], gewoon: [gewoon.status, gewoon.timing], zonder: [zonderSessie.status, zonderSessie.timing] }));
    }

    // ------------------------------------------------------------ Сховище ключів: маршрути з підставною сесією (без мережі)
    sk.zetHouderControle(async () => true);
    const kluisMens = (naam: string) => {
      const id = `sec002-g10b-${naam}-${sfx}`;
      opruimIds.push(id);
      return { id, auth: { user: { id, status: 'approved', role: 'member' }, service: 'identity', session: { id: `sessie-${naam}-${sfx}`, createdAt: Date.now() } } };
    };
    let huidigeAuth: ReturnType<typeof kluisMens>['auth'] | null = null;
    const kluisRoutes = sleutelkluisRoutes({ requireSession: (async () => huidigeAuth) as never, sterkeStapOp: (async () => null) as never });
    const kluis = async (mens: ReturnType<typeof kluisMens>, pad: string, body: Record<string, unknown> = {}) => {
      huidigeAuth = mens.auth;
      const r = await (kluisRoutes[`POST /api/owner/sleutelkluis/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body, params: {} });
      let data: Record<string, any> = {}; try { data = JSON.parse(r.body); } catch { /* geen JSON */ }
      return { status: r.statusCode, data };
    };

    // ------------------------------------------------------------ geheimen-02: «новий код відновлення» не зупиняє цикл подій і має ліміт
    {
      const A = kluisMens('scrypt');
      const aan = await kluis(A, 'inschakelen');
      const t0 = performance.now();
      scryptSync('VERGELIJKINGSCODE2345AB', randomBytes(16), 32, { N: sk.SCRYPT.N, r: sk.SCRYPT.r, p: sk.SCRYPT.p, maxmem: sk.SCRYPT.maxmem });
      const syncMs = performance.now() - t0;
      let grootsteGat = 0, vorige = performance.now();
      const tik = setInterval(() => { const nu = performance.now(); grootsteGat = Math.max(grootsteGat, nu - vorige); vorige = nu; }, 2);
      await new Promise((r) => setTimeout(r, 20));
      vorige = performance.now(); grootsteGat = 0;
      const eerste = await sk.herstelcodeVernieuwen({ userId: A.id, ruimte: 'prive' });
      clearInterval(tik);
      check('geheimen-02: scrypt коду відновлення рахується поза головним потоком (цикл подій не стоїть)',
        aan.status === 200 && !!eerste.herstelcode && grootsteGat < 0.6 * syncMs, `найдовша пауза ${Math.round(grootsteGat)} мс проти ${Math.round(syncMs)} мс синхронного scrypt`);
      const statussen: number[] = [];
      for (let i = 0; i < 5; i += 1) statussen.push((await kluis(A, 'herstelcode/vernieuwen')).status);
      check('geheimen-02: «новий код відновлення» — щонайбільше 3 на годину на людину, далі 429',
        statussen.slice(0, 3).every((s) => s === 200) && statussen.slice(3).every((s) => s === 429), statussen.join(','));
      const auditK = (await sys.query("SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'sleutelkluis.te_vaak'", [A.id])).rows[0].n;
      check('toets-g10b #7: перша відмова SLEUTELKLUIS_TE_VAAK у вікні лишає рівно один запис аудиту', auditK === 1, String(auditK));
    }

    // ------------------------------------------------------------ geheimen-04: увімкнення атомарне; код відновлення не губиться
    {
      // 1. Збій між рядком сховища і обгорткою: або все, або нічого.
      const stuk = `sec002-g10b-stuk-${sfx}`;
      opruimIds.push(stuk);
      let triggerGezet = false;
      try {
        await sys.query(`CREATE OR REPLACE FUNCTION app.sec002_g10b_stuk() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF NEW.user_id LIKE 'sec002-g10b-stuk-%' THEN RAISE EXCEPTION 'sec002 proef: omslag schrijven mislukt'; END IF; RETURN NEW; END $f$`);
        await sys.query('DROP TRIGGER IF EXISTS sec002_g10b_stuk ON app.sleutelkluis_omslag');
        await sys.query('CREATE TRIGGER sec002_g10b_stuk BEFORE INSERT ON app.sleutelkluis_omslag FOR EACH ROW EXECUTE FUNCTION app.sec002_g10b_stuk()');
        triggerGezet = true;
      } catch (e) { console.log('OVERGESLAGEN (geheimen-04 атомарність): немає права створити тестовий тригер —', String((e as Error).message).slice(0, 80)); }
      if (triggerGezet) {
        const mislukt = await sk.inschakelen({ userId: stuk, ruimte: 'prive' }, { soort: 'intern', id: 'proef' }).then(() => false, () => true);
        sk.standCacheLeeg();
        const rijen = (await sys.query('SELECT count(*)::int AS n FROM app.sleutelkluis WHERE user_id = $1', [stuk])).rows[0].n;
        await sys.query('DROP TRIGGER IF EXISTS sec002_g10b_stuk ON app.sleutelkluis_omslag').catch(() => undefined);
        await sys.query('DROP FUNCTION IF EXISTS app.sec002_g10b_stuk()').catch(() => undefined);
        check('geheimen-04: збій під час увімкнення не лишає сховища без жодної обгортки (одна транзакція)',
          mislukt && rijen === 0 && (await sk.kluisStand({ userId: stuk, ruimte: 'prive' })) === 'uit', JSON.stringify({ mislukt, rijen }));
        const opnieuw = await sk.inschakelen({ userId: stuk, ruimte: 'prive' }, { soort: 'intern', id: 'proef' }).then((r) => !!r.herstelcode, () => false);
        check('geheimen-04: після такого збою увімкнення вдається з другої спроби', opnieuw);
      }
      // 2. Відповідь із новим кодом не дійшла: старий код ще відкриває ключ, доки людина не підтвердить, що зберегла новий.
      const B = kluisMens('verloren');
      const code0 = String((await kluis(B, 'inschakelen')).data.herstelcode || '');
      await kluis(B, 'vergrendelen');
      const eerste = await kluis(B, 'ontgrendelen/herstelcode', { code: code0 });   // відповідь «загубилася»: новий код N1 ніхто не побачив
      await kluis(B, 'vergrendelen');
      const tweede = await kluis(B, 'ontgrendelen/herstelcode', { code: code0 });
      check('geheimen-04: загублена відповідь не замикає ключ назавжди — старий код діє до підтвердження нового',
        eerste.status === 200 && tweede.status === 200 && !!tweede.data.herstelcode && tweede.data.herstelcode !== eerste.data.herstelcode,
        JSON.stringify({ eerste: eerste.status, tweede: tweede.status, fout: tweede.data.error }));
      const n1 = String(eerste.data.herstelcode || ''), n2 = String(tweede.data.herstelcode || '');
      const standWacht = await kluis(B, 'stand');
      await kluis(B, 'vergrendelen');
      const metN1 = await kluis(B, 'ontgrendelen/herstelcode', { code: n1 });
      check('geheimen-04: перший новий код (який ніхто не побачив) не діє; сторінка показує «чекає на підтвердження»',
        metN1.status === 403 && standWacht.data.herstelcodeWacht === true && standWacht.data.zonderOmslag === false, JSON.stringify({ metN1: metN1.status, wacht: standWacht.data.herstelcodeWacht }));
      // Підтвердження вимагає відкритого ключа (щоб помилка не замкнула людину) — потім діє лише новий код.
      const dicht = await kluis(B, 'herstelcode/bevestigen');
      const open3 = await kluis(B, 'ontgrendelen/herstelcode', { code: code0 });
      const n3 = String(open3.data.herstelcode || '');
      const bevestigd = await kluis(B, 'herstelcode/bevestigen');
      const standNa = await kluis(B, 'stand');
      await kluis(B, 'vergrendelen');
      const oudNa = await kluis(B, 'ontgrendelen/herstelcode', { code: code0 });
      const n2Na = await kluis(B, 'ontgrendelen/herstelcode', { code: n2 });
      const nieuwNa = await kluis(B, 'ontgrendelen/herstelcode', { code: n3 });
      check('geheimen-04: підтвердження лише з відкритим ключем (423 із закритим); після нього діє ТІЛЬКИ новий код (одноразовість збережено)',
        dicht.status === 423 && open3.status === 200 && bevestigd.status === 200 && bevestigd.data.bevestigd === true && standNa.data.herstelcodeWacht === false
        && oudNa.status === 403 && n2Na.status === 403 && nieuwNa.status === 200,
        JSON.stringify({ dicht: dicht.status, bevestigd: bevestigd.data.bevestigd, oudNa: oudNa.status, n2Na: n2Na.status, nieuwNa: nieuwNa.status }));
      // Новий код ужито без підтвердження → це й є доказ, що він у людини: попередній одразу перестає діяти.
      const n4 = String(nieuwNa.data.herstelcode || '');
      await kluis(B, 'vergrendelen');
      const metN4 = await kluis(B, 'ontgrendelen/herstelcode', { code: n4 });
      await kluis(B, 'vergrendelen');
      const n3Na = await kluis(B, 'ontgrendelen/herstelcode', { code: n3 });
      check('geheimen-04: використання нового коду без підтвердження теж скасовує попередній', metN4.status === 200 && n3Na.status === 403, `${metN4.status}/${n3Na.status}`);
      const omslagRijen = (await sys.query("SELECT houder FROM app.sleutelkluis_omslag WHERE user_id = $1 AND soort = 'herstelcode' ORDER BY houder", [B.id])).rows.map((r) => String(r.houder));
      check('geheimen-04: обгорток коду відновлення щонайбільше дві (чинна й та, що чекає)', omslagRijen.length <= 2 && omslagRijen.includes('herstelcode'), omslagRijen.join(','));

      // 3. Сховище «увімкнено» без жодної обгортки (наслідок старого збою): чесний стан на сторінці й скидання без втрат.
      const W = kluisMens('wees');
      await sys.query("INSERT INTO app.sleutelkluis (user_id, ruimte, controle) VALUES ($1, 'prive', $2)", [W.id, 'a'.repeat(64)]);
      sk.standCacheLeeg();
      const weesStand = await kluis(W, 'stand');
      const weesAan = await kluis(W, 'inschakelen');
      const hersteld = await kluis(W, 'herstellen');
      const naHerstel = await kluis(W, 'stand');
      const weerAan = await kluis(W, 'inschakelen');
      check('geheimen-04: сховище без обгорток видно як «zonderOmslag», скидається без втрат і вмикається заново',
        weesStand.data.stand === 'gesloten' && weesStand.data.zonderOmslag === true && weesAan.status === 409
        && hersteld.status === 200 && hersteld.data.hersteld === true && naHerstel.data.stand === 'uit' && weerAan.status === 200 && !!weerAan.data.herstelcode,
        JSON.stringify({ stand: weesStand.data.stand, zonder: weesStand.data.zonderOmslag, hersteld: hersteld.status, na: naHerstel.data.stand, weer: weerAan.status }));
      const weigert = await kluis(W, 'herstellen');
      check('geheimen-04: скидання відмовляє, щойно ключ має хоч одну обгортку (дані під ключем не чіпаємо)',
        weigert.status === 409 && weigert.data.error === 'SLEUTELKLUIS_HEEFT_OMSLAGEN' && (await kluis(W, 'stand')).data.stand === 'open', `${weigert.status} ${weigert.data.error}`);
      // toets-g10b #3: кожна з цих дій — сповіщення в центрі сповіщень (сигнал власникові, якщо код украли).
      const meldingen = async (id: string) => (await sys.query("SELECT data::text AS t FROM app.records WHERE tbl = 'site_notifications' AND (owner_id = $1 OR data->>'recipientUserId' = $1)", [id])).rows.map((r) => String(r.t));
      const mB = await meldingen(B.id), mW = await meldingen(W.id);
      check('toets-g10b #3: сповіщення «відкрито кодом відновлення», «новий код підтверджено» і «сховище скинуто» надсилаються через маршрути',
        mB.some((t) => t.includes('відкрито кодом відновлення')) && mB.some((t) => t.includes('новий код відновлення підтверджено')) && mW.some((t) => t.includes('сховище без обгорток скинуто')),
        JSON.stringify({ B: mB.length, W: mW.length }));
      const sectie = lees('src/SleutelkluisSectie.tsx');
      check('geheimen-04: сторінка підтверджує новий код («Готово» → herstelcode/bevestigen) і пояснює обидва стани двома мовами',
        sectie.includes('herstelcode/bevestigen') && sectie.includes('KLUIS_TEKST.codeWacht') && sectie.includes('KLUIS_TEKST.zonderOmslag') && sectie.includes('/herstellen'));
    }

    // ------------------------------------------------------------ privacy-logboek-08: експорт без ключового матеріалу
    {
      const E = kluisMens('export');
      await sys.query("INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2::jsonb)", [E.id, JSON.stringify({ email: `export-${sfx}@test.invalid`, role: 'member', status: 'approved' })]);
      await kluis(E, 'inschakelen');
      const proefUitdaging = randomBytes(32).toString('base64url'); // вигадане значення
      await sys.query("INSERT INTO app.passkey_uitdagingen (user_id, sessie, doel, uitdaging, verloopt_op, binding) VALUES ($1, $2, 'stap-op', $3, now() + interval '4 minutes', $4::jsonb)", [E.id, 's', proefUitdaging, JSON.stringify({ proef: 'VIGADANA-BINDING' })]);
      const exp = await persoonsgegevensExport(E.id);
      const tekst = JSON.stringify(exp);
      const lekken = ['omslag1.', proefUitdaging, 'VIGADANA-BINDING', '"salt"', '"controle"', '"envelop"'].filter((x) => tekst.includes(x));
      await sys.query('DELETE FROM app.passkey_uitdagingen WHERE user_id = $1', [E.id]).catch(() => undefined);
      check('privacy-logboek-08: експорт не містить обгортки ключа даних, солі KDF, контрольного значення, і викликів passkey',
        lekken.length === 0 && Array.isArray(exp.gegevens['app.sleutelkluis_omslag']), lekken.join(', '));
      const rij = zonderGeheimen({ id: 1, soort: 'herstelcode', envelop: 'x', payload_zegel: 'x', binding_hmac: 'x', uitdaging: 'x', binding: { a: 1 }, code_challenge: 'x', omslag: 'x',
        verbinding_id: 'blijft', gecontroleerd_op: 'blijft', status: 'blijft', vrij: 'omslag1.aaaa.bbbb.cccc' }) as Record<string, unknown>;
      // За information_schema: кожна наявна колонка з ключовим матеріалом (за назвою) у таблицях акаунта відсіюється.
      const kolommen = (await sys.query(
        `SELECT DISTINCT c.column_name::text AS k FROM information_schema.columns c
          WHERE c.table_schema = 'app' AND c.column_name ~ '(envelop|zegel|hmac|uitdaging|challenge|omslag)'`)).rows.map((r) => String(r.k));
      const blijft = kolommen.filter((k) => k in (zonderGeheimen({ [k]: 'x' }) as Record<string, unknown>));
      check(`privacy-logboek-08: усі ${kolommen.length} колонок схеми app із ключовим матеріалом у назві не потрапляють в експорт`, kolommen.length >= 4 && blijft.length === 0, blijft.join(', '));
      check('privacy-logboek-08: zonderGeheimen прибирає envelop/zegel/hmac/uitdaging/binding/challenge та значення «omslag1.…», а звичайні поля лишає',
        Object.keys(rij).sort().join(',') === 'gecontroleerd_op,id,soort,status,verbinding_id,vrij' && rij.vrij === '[versleuteld, niet opgenomen]', Object.keys(rij).sort().join(','));
    }

    // ------------------------------------------------------------ privacy-logboek-07: «Повідомити про проблему» має ліміт на людину
    {
      const D = kluisMens('melder'), Stil = kluisMens('stil');
      let wie = D.auth;
      const routes = diagnose.diagnoseRoutes((async () => wie) as never);
      const meld = async () => (await (routes['POST /api/diagnose/melden'][0] as unknown as (c: unknown) => Promise<{ statusCode: number }>)({ event: {}, body: { beschrijving: 'вигадане звернення', uitslagen: [] }, params: {} })).statusCode;
      wie = Stil.auth;
      const stil = await meld();
      await sys.query("UPDATE app.diagnose_meldingen SET aangemaakt_op = now() - interval '2 hours' WHERE user_id = $1", [Stil.id]);
      wie = D.auth;
      const statussen: number[] = [];
      for (let i = 0; i < 8; i += 1) statussen.push(await meld());
      const opgeslagen = (await sys.query('SELECT count(*)::int AS n FROM app.diagnose_meldingen WHERE user_id = $1', [D.id])).rows[0].n;
      check('privacy-logboek-07: щонайбільше 5 звернень за 10 хвилин на людину, далі 429 і нічого не зберігається',
        stil === 200 && statussen.slice(0, 5).every((x) => x === 200) && statussen.slice(5).every((x) => x === 429) && opgeslagen === 5, `${statussen.join(',')} збережено ${opgeslagen}`);
      // toets-g10b #7: перша відмова у вікні лишає один запис аудиту; сторінка пояснює 429 двома мовами з часом очікування.
      const auditD = (await sys.query("SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'owner.diagnose.melden_begrensd'", [D.id])).rows[0].n;
      const ui = lees('src/diagnose/Diagnose.tsx');
      check('toets-g10b #7: відмова 429 у «Повідомити про проблему» — один запис аудиту на вікно; на сторінці пояснення uk/nl з часом очікування',
        auditD === 1 && /status === 429/.test(ui) && ui.includes('retryAfter') && ui.includes('Забагато звітів') && ui.includes('Te veel verslagen'), JSON.stringify({ auditD }));
      // Один акаунт не витісняє інших зі списку підтримки: не більше N найновіших на людину.
      await sys.query("INSERT INTO app.diagnose_meldingen (user_id, dienst, oordeel, uitslagen, beschrijving) SELECT $1, 'hub', 'onzeker', '[]'::jsonb, 'спам ' || g FROM generate_series(1, 150) g", [D.id]);
      const lijst = typeof (diagnose as Record<string, unknown>).recenteMeldingen === 'function' ? await (diagnose as unknown as { recenteMeldingen: () => Promise<Array<{ user_id: string }>> }).recenteMeldingen() : [];
      const vanMelder = lijst.filter((r) => r.user_id === D.id).length;
      check('privacy-logboek-07: у списку підтримки щонайбільше 10 найновіших звернень на людину; звернення інших лишаються видимими',
        lijst.length > 0 && vanMelder <= 10 && lijst.some((r) => r.user_id === Stil.id), JSON.stringify({ totaal: lijst.length, vanMelder }));
      await sys.query("UPDATE app.diagnose_meldingen SET aangemaakt_op = now() - interval '91 days' WHERE user_id = $1 AND beschrijving LIKE 'спам %'", [D.id]);
      const voorOpruimen = (await sys.query('SELECT count(*)::int AS n FROM app.diagnose_meldingen WHERE user_id = $1', [D.id])).rows[0].n;
      await opruimen();
      const naOpruimen = (await sys.query('SELECT count(*)::int AS n FROM app.diagnose_meldingen WHERE user_id = $1', [D.id])).rows[0].n;
      check('privacy-logboek-07: звернення, старші за 90 днів, прибирає завдання прибирання (а не кожен запит)',
        voorOpruimen === 155 && naOpruimen === 5 && !/DELETE FROM app\.diagnose_meldingen/.test(lees('backend/diagnose.ts')), `${voorOpruimen} → ${naOpruimen}`);
    }

    // ------------------------------------------------------------ toets-g10b #1 (geheimen-07): після ротації (<НАЗВА>_V2) база приймає «v2.…»
    {
      const aad = 'sec002|g10b|rotatie-db';
      const vorigeTotp2 = process.env.TOTP_ENCRYPTION_KEY_V2;
      process.env.SEC002_G10B_DB_V1 = randomBytes(32).toString('hex'); process.env.SEC002_G10B_DB_V2 = randomBytes(32).toString('hex'); // вигадані
      const v2 = sealWithEnvKey('SEC002_G10B_DB_V1', 'x', aad);
      delete process.env.SEC002_G10B_DB_V1; delete process.env.SEC002_G10B_DB_V2;
      const kolommen = [['app.mail_imap_koppeling', 'geheim'], ['app.agenda_abonnement', 'geheim'], ['app.ai_bevestiging', 'parameters'], ['app.ai_bevestiging', 'resultaat']] as const;
      const uitslag: Record<string, boolean[]> = {};
      for (const [tabel, kolom] of kolommen) {
        const defs = (await sys.query(`SELECT pg_get_constraintdef(c.oid) AS d FROM pg_constraint c WHERE c.conrelid = $1::regclass AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ~ ('\\m' || $2 || '\\M') AND pg_get_constraintdef(c.oid) LIKE '%~%'`, [tabel, kolom])).rows.map((x) => String(x.d));
        const patronen = defs.map((d) => /'(\^[^']+)'/.exec(d)?.[1]).filter(Boolean) as string[];
        uitslag[`${tabel}.${kolom}`] = await Promise.all(patronen.map(async (re) => Boolean((await sys.query('SELECT $1::text ~ $2 AS ok', [v2, re])).rows[0].ok)));
      }
      check('toets-g10b #1: обмеження бази (IMAP, CalDAV, AI-підтвердження) пропускають конверт «v2.…» після ротації',
        v2.startsWith('v2.') && Object.values(uitslag).every((l) => l.length > 0 && l.every(Boolean)), JSON.stringify(uitslag));
      // Справжній запис через робочий код: AI-підтвердження під TOTP-ключем V2 (запасний ключ, коли власного немає).
      const vorigeAi = process.env.AI_BEVESTIGING_SLEUTEL_V1;
      delete process.env.AI_BEVESTIGING_SLEUTEL_V1;
      process.env.TOTP_ENCRYPTION_KEY_V2 = randomBytes(32).toString('hex'); // вигаданий
      let aiUitslag = '';
      try {
        const ab = await import('../../backend/ai-bevestiging');
        ab.registreerBevestigSoort<{ t: string }>({
          soort: 'toets.rotatie', dienst: 'bord', ruimtes: ['prive'], risico: 'laag',
          valideer: () => ({ ok: true, params: { t: 'x' } }),
          beschrijf: () => ({ titel: { uk: 'т', nl: 't' }, samenvatting: { uk: 'т', nl: 't' }, details: [] }),
          voerUit: async () => ({ ok: true, resultaat: {} }),
        } as never);
        const R = kluisMens('rotatie');
        await sys.query("INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2::jsonb)", [R.id, JSON.stringify({ email: `${R.id}@test.invalid`, name: 'R', role: 'member', status: 'approved' })]);
        const r = await ab.vraagBevestiging({ userId: R.id, ruimte: 'prive', soort: 'toets.rotatie', params: {}, tool: 't', agent: 'claude', klant: 'Claude' } as never);
        const rij = (await sys.query('SELECT parameters FROM app.ai_bevestiging WHERE user_id = $1', [R.id])).rows[0];
        aiUitslag = `${JSON.stringify(r).slice(0, 80)} | ${String(rij?.parameters || '').split('.')[0]}`;
        await sys.query('DELETE FROM app.ai_bevestiging WHERE user_id = $1', [R.id]).catch(() => undefined);
      } catch (e) { aiUitslag = `FOUT: ${(e as Error).message.slice(0, 160)}`; }
      if (vorigeTotp2 === undefined) delete process.env.TOTP_ENCRYPTION_KEY_V2; else process.env.TOTP_ENCRYPTION_KEY_V2 = vorigeTotp2;
      if (vorigeAi !== undefined) process.env.AI_BEVESTIGING_SLEUTEL_V1 = vorigeAi;
      check('toets-g10b #1: AI-підтвердження записується після ротації TOTP-ключа (конверт «v2.…» у базі)', !aiUitslag.startsWith('FOUT') && aiUitslag.endsWith('| v2'), aiUitslag);
      check('toets-g10b #1: лічильник «ще серверним ключем» для IMAP бачить і v2-рядки (без SQL-фільтра лише за v1)',
        !/LIKE 'v1\.%'/.test(lees('backend/mail-imap.ts')));
    }
  } catch (e) {
    check('неочікувана помилка в тестах із базою', false, String((e as Error)?.stack || e));
  } finally {
    sk.geheugenLeeg();
    await sys.query('DROP TRIGGER IF EXISTS sec002_g10b_stuk ON app.sleutelkluis_omslag').catch(() => undefined);
    await sys.query('DROP FUNCTION IF EXISTS app.sec002_g10b_stuk()').catch(() => undefined);
    await sys.query('DELETE FROM app.sleutelkluis WHERE user_id = ANY($1::text[])', [opruimIds]).catch(() => undefined);
    for (const tabel of ['passkey_uitdagingen', 'notities', 'zoek_objecten', 'zoek_geschiedenis', 'mail_drafts', 'diagnose_meldingen']) {
      await sys.query(`DELETE FROM app.${tabel} WHERE user_id = ANY($1::text[])`, [opruimIds]).catch(() => undefined);
    }
    await sys.query('DELETE FROM app.records WHERE id = ANY($1::text[]) OR owner_id = ANY($1::text[]) OR data->>\'accountId\' = ANY($1::text[])', [opruimIds]).catch(() => undefined);
    void randomUUID;
    G?.herstel();
  }

  return einde();
}
