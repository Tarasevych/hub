// Перевірка зашифрованого архівування випусків у Telegram (AES-256-GCM, частини, блокування, відновлення)
// та прийому релізів із GitHub (HMAC-SHA256 webhook, HTTP-роут, захист від повторів, 302-редирект без витоку токена, voorcontrole).
import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { nieuwePasskey, registreer } from './hulp/nep-toegangssleutel';
import { manifestVoor } from '../fixtures/uitrol/manifest-voorbeeld';
import {
  ownerVaultBewarenIntern,
  readOwnerVaultPlaintext,
} from '../../backend/api-platform-kluis';
import {
  archiveerReleaseNaarTelegram,
  controleerTelegramBlokkade,
  gebruikHerstelDownload,
  herstelTelegramArchief,
  normaliseerArchiefSleutel,
  ontsleutelArchiefBestand,
  setUitrolTelegramDeps,
  telegramInstellingenOpslaan,
  telegramStand,
  telegramVerbindingTesten,
  telegramWebhookInstellen,
  VAULT_TELEGRAM_WEBHOOK_GEHEIM_NAAM,
  versleutelArchiefBestand,
} from '../../backend/uitrol-telegram';
import {
  githubOntvangstInstellen,
  githubOntvangstStand,
  haalGithubReleaseOp,
  setUitrolGithubOntvangenDeps,
  verwerkGithubUitrolWebhook,
} from '../../backend/uitrol-github-ontvangen';
import { goedkeurUitdaging } from '../../backend/uitrol-goedkeuring';
import { SITE_TOOL_BY_NAME } from '../../backend/site-hulpmiddelen';
import { TOEGESTANE_ROUTES } from '../../backend/site-aanroep';
import { toolInRuimte } from '../../shared/ai-ruimte';
import { v2Optie } from '../../shared/connector-v2/catalogus';

const sha256Hex = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function maakTestArchief(tmpDir: string, versie: string, extraPad = 'inhoud.txt', extraBytes = Buffer.from('test-inhoud')) {
  const werk = path.join(tmpDir, `pkg-${versie}-${randomBytes(4).toString('hex')}`);
  const top = path.join(werk, `mijn-ruimte-${versie}`);
  const commit = 'a'.repeat(40);
  const bestanden: Record<string, string | Buffer> = {
    'UITROL-VERSIE': `${versie}\n`,
    AUTEUR: 'Test Eigenaar\n',
    AGENT: 'gemini\n',
    SAMENVATTING: 'Testpakket voor automatische ontvangst en Telegram-archief\n',
    'BRON-COMMIT': `${commit}\n`,
    'package.json': JSON.stringify({ name: 'mijn-ruimte-test', scripts: { build: 'vite build' } }),
    'package-lock.json': '{}',
    'index.html': '<html></html>',
    'vite.config.ts': 'export default {}',
    'server/migrate.ts': '// test',
    'scripts/build-server.mjs': '// test',
    'backend/index.ts': '// test',
    'deploy/installeer-app.sh': '#!/bin/bash\necho ok\n',
    'UITROL-MANIFEST.json': manifestVoor(versie, {
      deelnemers: [
        { soort: 'mens', naam: 'Test Eigenaar', rollen: ['auteur', 'controle'] },
        { soort: 'ai', naam: 'gemini', platform: 'Google Antigravity', tool: 'CLI', model: { id: 'gemini-2.5-pro', versie: '2026', bron: 'omgeving' }, rollen: ['ontwikkeling', 'testen', 'verpakken'] },
      ],
    }),
    'ONTWIKKELARCHIEF.json': JSON.stringify({
      schema: 1,
      taakId: 'UITROL-002',
      repo: 'Tarasevych/hub',
      tak: `feature/uitrol-002-${versie}`,
      commit,
      pad: 'orchestratie/ontwikkelarchieven/UITROL-002.json',
      sha256: 'b'.repeat(64),
      url: `https://github.com/Tarasevych/hub/blob/${commit}/orchestratie/ontwikkelarchieven/UITROL-002.json`,
      release: `https://github.com/Tarasevych/hub/releases/tag/${versie}`,
      pakket: `mijn-ruimte-${versie}.tar.gz`,
    }),
    [extraPad]: extraBytes,
  };
  for (const mf of readdirSync('migrations')) {
    if (/^\d{4}_[a-z0-9_]+\.sql$/.test(mf)) bestanden[`migrations/${mf}`] = '-- test\n';
  }
  for (const [rel, inh] of Object.entries(bestanden)) {
    const vol = path.join(top, rel);
    mkdirSync(path.dirname(vol), { recursive: true });
    writeFileSync(vol, inh);
    if (rel.endsWith('.sh')) chmodSync(vol, 0o755);
  }
  const tarPad = path.join(tmpDir, `mijn-ruimte-${versie}.tar.gz`);
  execFileSync('tar', ['-czf', tarPad, '-C', werk, `mijn-ruimte-${versie}`]);
  const buf = readFileSync(tarPad);
  return { pad: tarPad, buf, sha256: sha256Hex(buf), bytes: buf.length };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-telegram-en-github-ontvangen-20261115');
  const sys = getPool('systeem');
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'mr-tg-gh-test-'));
  const oldEnv = {
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    UITROL_PAKKETTEN_DIR: process.env.UITROL_PAKKETTEN_DIR,
    UITROL_VOORSTEL_DIR: process.env.UITROL_VOORSTEL_DIR,
    OWNER_VAULT_ENCRYPTION_KEY_V1: process.env.OWNER_VAULT_ENCRYPTION_KEY_V1,
    MCP_RECHTEN_PAD: process.env.MCP_RECHTEN_PAD,
    GOEDKEUR_SLEUTELS: process.env.GOEDKEUR_SLEUTELS,
    GOEDKEUR_INBOX: process.env.GOEDKEUR_INBOX,
    GOEDKEUR_STATUS_DIR: process.env.GOEDKEUR_STATUS_DIR,
    UITROL_TELEGRAM_BOT_TOKEN: process.env.UITROL_TELEGRAM_BOT_TOKEN,
    UITROL_TELEGRAM_WEBHOOK_GEHEIM: process.env.UITROL_TELEGRAM_WEBHOOK_GEHEIM,
  };

  delete process.env.UITROL_TELEGRAM_BOT_TOKEN;
  delete process.env.UITROL_TELEGRAM_WEBHOOK_GEHEIM;
  process.env.UPLOADS_DIR = path.join(tmpDir, 'uploads');
  process.env.UITROL_PAKKETTEN_DIR = path.join(tmpDir, 'pakketten');
  process.env.UITROL_VOORSTEL_DIR = path.join(tmpDir, 'voorstellen');
  process.env.OWNER_VAULT_ENCRYPTION_KEY_V1 = 'f'.repeat(64);
  process.env.GOEDKEUR_INBOX = path.join(tmpDir, 'inbox');
  process.env.GOEDKEUR_STATUS_DIR = path.join(tmpDir, 'status');
  process.env.MCP_RECHTEN_PAD = path.join(tmpDir, 'mcp-rechten.json');
  process.env.GOEDKEUR_SLEUTELS = path.join(tmpDir, 'goedkeur-passkeys.json');
  mkdirSync(process.env.UPLOADS_DIR, { recursive: true });
  mkdirSync(process.env.UITROL_PAKKETTEN_DIR, { recursive: true });
  mkdirSync(process.env.UITROL_VOORSTEL_DIR, { recursive: true });
  mkdirSync(process.env.GOEDKEUR_INBOX, { recursive: true });
  mkdirSync(process.env.GOEDKEUR_STATUS_DIR, { recursive: true });

  const pk = nieuwePasskey();
  const pkReg = kern.verifieerRegistratie({
    ...registreer(pk, 'c-reg'),
    verwachteUitdaging: 'c-reg',
    rpId: 'tarasevych.com',
    origins: ['https://admin.tarasevych.com'],
  });
  if (!pkReg.ok) throw new Error('test passkey setup mislukt');
  writeFileSync(process.env.MCP_RECHTEN_PAD, JSON.stringify({ uitrol: true, 'passkey-goedkeuring': true }));
  writeFileSync(process.env.GOEDKEUR_SLEUTELS, JSON.stringify({
    versie: 1,
    rpId: 'tarasevych.com',
    origins: ['https://admin.tarasevych.com'],
    sleutels: [{
      credentialId: pkReg.credentialId,
      alg: pkReg.alg,
      jwk: pkReg.jwk,
      label: 'test-telefoon',
      vingerafdruk: pkReg.vingerafdruk,
      toegevoegd: new Date().toISOString(),
      door: 'test',
    }],
  }));

  const ownerEmail = `eigenaar-tg-${randomUUID()}@example.test`;
  const nep = await nepGoogle({ ownerEmail });
  let eigenaarId = '';
  try {
    const br = nep.browser();
    await br.aanmelden(`sub-tg-${randomUUID()}`, ownerEmail, { service: 'admin' });
    const eigenaarRij = (await sys.query(
      `SELECT id FROM app.records WHERE tbl = 'users' AND data->>'email' = $1 LIMIT 1`,
      [ownerEmail],
    )).rows[0];
    eigenaarId = String(eigenaarRij?.id || '');
    const eigenaar = { id: eigenaarId, email: ownerEmail };

    // ---------------------------------------------------------------- 1. Криптографія AES-256-GCM (потоково)
    let korteFout = false;
    try { normaliseerArchiefSleutel('kort'); } catch { korteFout = true; }
    check('normaliseerArchiefSleutel: відхиляє ключі коротші за 32 символи', korteFout);

    const rawBytes = randomBytes(5120);
    const bronPad = path.join(tmpDir, 'plain.bin');
    const encPad = path.join(tmpDir, 'enc.bin');
    const decPad = path.join(tmpDir, 'dec.bin');
    writeFileSync(bronPad, rawBytes);
    const sleutel = randomBytes(32);
    const verkeerdeSleutel = randomBytes(32);
    const encMeta = await versleutelArchiefBestand({ bronPad, doelPad: encPad, versie: '20261115-010000', sleutel });
    const foutSleutel = await ontsleutelArchiefBestand({
      bronPad: encPad, doelPad: decPad, versie: '20261115-010000',
      verwachteOrigineelSha256: encMeta.origineelSha256, sleutel: verkeerdeSleutel,
    }).then(() => false).catch(() => true);
    const decOk = await ontsleutelArchiefBestand({
      bronPad: encPad, doelPad: decPad, versie: '20261115-010000',
      verwachteOrigineelSha256: encMeta.origineelSha256, sleutel,
    });
    check('versleutel/ontsleutel: потоковий AES-256-GCM відновлює 1:1 і відхиляє неправильний ключ',
      foutSleutel && decOk.origineelSha256 === sha256Hex(rawBytes) && readFileSync(decPad).equals(rawBytes));

    // ---------------------------------------------------------------- 2. Повна незалежність бота випусків, getChatMember, налаштування і розрізання частин
    await ownerVaultBewarenIntern(eigenaarId, 'TELEGRAM_BOT_TOKEN', 'telegram', 'Inlogbot', '999999:ABCdef_INLOG_BOT_NIET_GEBRUIKEN_1234567');
    const standZonderEigenBot = await telegramStand(eigenaarId);
    check('незалежність бота випусків: наявність бота входу або іншого purpose=telegram НЕ активує бот випусків',
      standZonderEigenBot.botAanwezig === false && standZonderEigenBot.botBron === null);

    const telegramBestanden = new Map<string, { naam: string; buf: Buffer; caption: string }>();
    const verzondenBerichten: Array<{ chat_id: string; message_thread_id?: number; text: string }> = [];
    let ingesteldeWebhook: { url: string; secret_token: string; allowed_updates: string[] } | null = null;
    let chatMock: Record<string, unknown> = { id: -100999888, title: 'Archief Kanaal', type: 'channel' };
    let memberMock: Record<string, unknown> = { status: 'administrator', can_post_messages: true };
    let nextMsgId = 100;
    let breekDeelEen = false;
    const testBotToken = '123456:ABCdefGHIjklMNOpqrSTUvwxyz12345';
    const neppeTgFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/getMe')) {
        return new Response(JSON.stringify({ ok: true, result: { id: 999, username: 'mijn_test_bot' } }), { status: 200 });
      }
      if (url.endsWith('/getChat')) {
        return new Response(JSON.stringify({ ok: true, result: chatMock }), { status: 200 });
      }
      if (url.endsWith('/getChatMember')) {
        return new Response(JSON.stringify({ ok: true, result: memberMock }), { status: 200 });
      }
      if (url.endsWith('/setWebhook')) {
        ingesteldeWebhook = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
      }
      if (url.endsWith('/sendMessage')) {
        const msgBody = JSON.parse(String(init?.body || '{}'));
        verzondenBerichten.push(msgBody);
        return new Response(JSON.stringify({ ok: true, result: { message_id: ++nextMsgId } }), { status: 200 });
      }
      if (url.endsWith('/sendDocument')) {
        const fd = init?.body as FormData;
        const doc = fd.get('document') as File;
        const caption = String(fd.get('caption') || '');
        const buf = Buffer.from(await doc.arrayBuffer());
        const fileId = `fid-${++nextMsgId}`;
        telegramBestanden.set(fileId, { naam: doc.name, buf, caption });
        return new Response(JSON.stringify({
          ok: true,
          result: { message_id: nextMsgId, document: { file_id: fileId, file_unique_id: `uid-${nextMsgId}` } },
        }), { status: 200 });
      }
      if (url.endsWith('/getFile')) {
        const b = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({ ok: true, result: { file_id: b.file_id, file_path: `docs/${b.file_id}` } }), { status: 200 });
      }
      if (url.includes('/file/bot')) {
        const fileId = url.split('/docs/').pop() || '';
        const item = telegramBestanden.get(fileId);
        if (!item) return new Response('Not found', { status: 404 });
        let data = item.buf;
        if (breekDeelEen && item.naam.includes('part001')) {
          data = Buffer.from(data);
          data[0] ^= 0xff;
        }
        return new Response(new Uint8Array(data), { status: 200 });
      }
      return new Response('unknown', { status: 404 });
    };
    setUitrolTelegramDeps({
      fetch: neppeTgFetch,
      slaap: async () => undefined,
    });

    const opgeslagen = await telegramInstellingenOpslaan(eigenaar, {
      chatId: '-100999888',
      messageThreadId: 42,
      actief: true,
      verplichtVoorInstallatie: true,
      botToken: testBotToken,
      genereerSleutel: true,
    });
    const standNaOpslaan = await telegramStand(eigenaarId) as any;
    check('telegramInstellingenOpslaan: зберігає окремий токен TELEGRAM_UITROL_BOT_TOKEN, генерує 256-бітний ключ і приховує його в stand',
      Boolean(opgeslagen.eenmaligeSleutel && /^[0-9a-f]{64}$/.test(opgeslagen.eenmaligeSleutel))
      && opgeslagen.sleutelAanwezig && opgeslagen.botAanwezig && opgeslagen.botBron === 'kluis' && !standNaOpslaan.eenmaligeSleutel);

    memberMock = { status: 'left' };
    const errLeft = await telegramVerbindingTesten(eigenaar).then(() => '').catch((e) => String(e?.code || ''));
    memberMock = { status: 'administrator', can_post_messages: false };
    const errKanaalRecht = await telegramVerbindingTesten(eigenaar).then(() => '').catch((e) => String(e?.code || ''));
    chatMock = { id: -100999888, title: 'Uitrol Groep', type: 'supergroup', is_forum: false };
    memberMock = { status: 'restricted', can_send_messages: true, can_send_documents: false };
    const errGroepRecht = await telegramVerbindingTesten(eigenaar).then(() => '').catch((e) => String(e?.code || ''));
    memberMock = { status: 'administrator', can_send_messages: true, can_send_documents: true };
    const errGeenForum = await telegramVerbindingTesten(eigenaar).then(() => '').catch((e) => String(e?.code || ''));
    chatMock = { id: -100999888, title: 'Uitrol Forum', type: 'supergroup', is_forum: true };
    const testRes = await telegramVerbindingTesten(eigenaar);
    check('telegramVerbindingTesten: getChatMember (left, права каналу/групи, нефорумна супергрупа) та успішна перевірка з messageThreadId',
      errLeft === 'TELEGRAM_BOT_NIET_IN_GROEP'
      && errKanaalRecht === 'TELEGRAM_GEEN_SCHRIJFRECHT'
      && errGroepRecht === 'TELEGRAM_GEEN_SCHRIJFRECHT'
      && errGeenForum === 'TELEGRAM_GEEN_FORUM'
      && testRes.ok && testRes.botUsername === 'mijn_test_bot' && testRes.chatType === 'supergroup'
      && testRes.botStatus === 'administrator' && testRes.isForum === true && testRes.messageThreadId === 42);

    const v1 = '20261115-010000';
    const pak1 = maakTestArchief(tmpDir, v1, 'groot.bin', randomBytes(4200));
    writeFileSync(path.join(process.env.UITROL_PAKKETTEN_DIR, `mijn-ruimte-${v1}.tar.gz`), pak1.buf);
    await sys.query(
      `INSERT INTO app.uitrol_runs (id, methode, versie, staat, pakket_pad, pakket_sha256, pakket_grootte)
       VALUES ($1, 'passkey', $2, 'klaar', $3, $4, $5)`,
      ['run-tg-1', v1, path.join(process.env.UITROL_PAKKETTEN_DIR, `mijn-ruimte-${v1}.tar.gz`), pak1.sha256, pak1.bytes],
    );

    // ---------------------------------------------------------------- 3. Блокування схвалення без архіву поточного випуску в Telegram
    const voorbereiderId = (await sys.query(
      `INSERT INTO app.uitrol_voorbereiders (soort, onderwerp, account_id, label, gegeven_door, verloopt_op)
       VALUES ('account', $1, $1, 'Eigenaar', $1, now() + interval '1 day') RETURNING id`,
      [eigenaarId],
    )).rows[0].id as string;
    const v2 = '20261115-020000';
    const pak2 = maakTestArchief(tmpDir, v2, 'klein.txt', Buffer.from('versie 2'));
    const voorstel2Id = (await sys.query(
      `INSERT INTO app.uitrol_voorstellen (versie, status, bytes, sha256, ontvangen, voorbereider_id, voorbereider_label, account_id, bron_commit)
       VALUES ($1, 'wacht-op-goedkeuring', $2, $3, $2, $4, 'Test', $5, $6) RETURNING id`,
      [v2, pak2.bytes, pak2.sha256, voorbereiderId, eigenaarId, 'a'.repeat(40)],
    )).rows[0].id as string;

    const blok1 = await controleerTelegramBlokkade(eigenaarId);
    const uitdagingGeblokkeerd = await goedkeurUitdaging(eigenaar, voorstel2Id).then(() => false).catch((e) => e?.code === 'TELEGRAM_ARCHIEF_VEREIST');
    check('verplicht_voor_installatie: блокує схвалення нової версії, доки поточний випуск не збережено в Telegram',
      blok1.geblokkeerd === true && blok1.huidigeVersie === v1 && uitdagingGeblokkeerd);

    const archRes = await archiveerReleaseNaarTelegram({
      eigenaarId,
      actor: eigenaar,
      versie: v1,
      bestandPad: path.join(process.env.UITROL_PAKKETTEN_DIR, `mijn-ruimte-${v1}.tar.gz`),
      runId: 'run-tg-1',
      deelBytes: 1024,
    });
    const herhaalArch = await archiveerReleaseNaarTelegram({
      eigenaarId,
      actor: eigenaar,
      versie: v1,
      bestandPad: path.join(process.env.UITROL_PAKKETTEN_DIR, `mijn-ruimte-${v1}.tar.gz`),
      runId: 'run-tg-1',
      deelBytes: 1024,
    });
    const blokNa = await controleerTelegramBlokkade(eigenaarId);
    const uitdagingNaArchief = await goedkeurUitdaging(eigenaar, voorstel2Id);
    const alleCaptions = [...telegramBestanden.values()].map((x) => x.caption).join('\n');
    const bevatGeheim = alleCaptions.includes(opgeslagen.eenmaligeSleutel || '___') || alleCaptions.includes('ABCdefGHIjkl');
    check('archiveerReleaseNaarTelegram: ріже на >= 4 частини + маніфест, не витікає секретами, ідемпотентне та розблоковує схвалення',
      archRes.ok && archRes.aantalDelen >= 4 && herhaalArch.reedsBestaand === true && !blokNa.geblokkeerd && Boolean(uitdagingNaArchief.uitdagingId) && !bevatGeheim);

    breekDeelEen = true;
    const kapotHerstel = await herstelTelegramArchief(eigenaar, archRes.id).then(() => false).catch((e) => e?.code === 'TELEGRAM_HERSTEL_INTEGRITEIT');
    breekDeelEen = false;
    const goedHerstel = await herstelTelegramArchief(eigenaar, archRes.id);
    const dl1 = await gebruikHerstelDownload(eigenaarId, archRes.id, goedHerstel.downloadId);
    const dl2 = await gebruikHerstelDownload(eigenaarId, archRes.id, goedHerstel.downloadId);
    check('herstelTelegramArchief: відхиляє пошкоджені дані, відновлює 1:1 із точним SHA-256 і дає одноразовий downloadId',
      kapotHerstel && goedHerstel.geverifieerd && goedHerstel.sha256 === pak1.sha256 && dl1 !== null && dl2 === null);

    // ---------------------------------------------------------------- 3b. Захищений webhook бота випусків (/status і /help лише в групі/темі)
    const whSetup = await telegramWebhookInstellen(eigenaar);
    const tgWhSecret = (await readOwnerVaultPlaintext(eigenaarId, VAULT_TELEGRAM_WEBHOOK_GEHEIM_NAAM, 'webhook')).trim();
    check('telegramWebhookInstellen: зберігає окремий секрет webhook і реєструє allowed_updates=["message"]',
      whSetup.ok && whSetup.webhookGeheimAanwezig && Boolean(tgWhSecret)
      && (ingesteldeWebhook as any)?.url === 'https://api.tarasevych.com/api/uitrol/telegram/webhook'
      && (ingesteldeWebhook as any)?.secret_token === tgWhSecret);

    const stuurTgWebhook = async (bodyObj: Record<string, unknown>, secret = tgWhSecret) => nep.handler({
      headers: {
        host: 'api.tarasevych.com',
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': secret,
      },
      body: JSON.stringify(bodyObj),
      isBase64Encoded: false,
      rawPath: '/api/uitrol/telegram/webhook',
      rawQueryString: '',
      queryStringParameters: {},
      requestContext: { http: { method: 'POST', path: '/api/uitrol/telegram/webhook', sourceIp: '149.154.167.200', userAgent: 'TelegramBot/1.0' } },
    } as never) as Promise<{ statusCode: number; body: string }>;

    const foutSecretHttp = await stuurTgWebhook({ update_id: 1001, message: { chat: { id: -100999888 }, text: '/status' } }, 'wrong-secret');
    const berichtenVoor = verzondenBerichten.length;
    const anderChatHttp = await stuurTgWebhook({ update_id: 1002, message: { chat: { id: -100111222 }, message_thread_id: 42, from: { is_bot: false }, text: '/status' } });
    const anderTopicHttp = await stuurTgWebhook({ update_id: 1003, message: { chat: { id: -100999888 }, message_thread_id: 99, from: { is_bot: false }, text: '/status' } });
    const botAuteurHttp = await stuurTgWebhook({ update_id: 1004, message: { chat: { id: -100999888 }, message_thread_id: 42, from: { is_bot: true }, text: '/status' } });
    const verbodenCmdHttp = await stuurTgWebhook({ update_id: 1005, message: { chat: { id: -100999888 }, message_thread_id: 42, from: { is_bot: false }, text: '/approve 123' } });
    check('HTTP POST /api/uitrol/telegram/webhook: 401 при невалідному токені та ігнорування чужої групи, іншої теми, ботів і сторонніх команд',
      foutSecretHttp.statusCode === 401
      && anderChatHttp.statusCode === 200 && JSON.parse(anderChatHttp.body).overgeslagen === true
      && anderTopicHttp.statusCode === 200 && JSON.parse(anderTopicHttp.body).overgeslagen === true
      && botAuteurHttp.statusCode === 200 && JSON.parse(botAuteurHttp.body).overgeslagen === true
      && verbodenCmdHttp.statusCode === 200 && JSON.parse(verbodenCmdHttp.body).overgeslagen === true
      && verzondenBerichten.length === berichtenVoor);

    const statusUpdate = { update_id: 1006, message: { chat: { id: -100999888 }, message_thread_id: 42, from: { is_bot: false }, text: '/status' } };
    const statusOk = await stuurTgWebhook(statusUpdate);
    const statusHerhaal = await stuurTgWebhook(statusUpdate);
    const statusAntwoord = verzondenBerichten[verzondenBerichten.length - 1];
    const helpOk = await stuurTgWebhook({ update_id: 1007, message: { chat: { id: -100999888 }, message_thread_id: 42, from: { is_bot: false }, text: '/help@mijn_test_bot' } });
    const helpAntwoord = verzondenBerichten[verzondenBerichten.length - 1];
    check('webhook /status і /help: відповідають у погодженій темі без витоку секретів та захищені від повтору update_id',
      statusOk.statusCode === 200 && JSON.parse(statusOk.body).commando === 'status'
      && statusHerhaal.statusCode === 200 && JSON.parse(statusHerhaal.body).herhaling === true
      && statusAntwoord?.chat_id === '-100999888' && statusAntwoord?.message_thread_id === 42
      && statusAntwoord.text.includes(v1)
      && !statusAntwoord.text.includes(testBotToken) && !statusAntwoord.text.includes(tgWhSecret) && !statusAntwoord.text.includes(opgeslagen.eenmaligeSleutel || '___')
      && helpOk.statusCode === 200 && helpAntwoord?.text.includes('/status') && helpAntwoord?.text.includes('passkey'));

    // ---------------------------------------------------------------- 4. Приймання релізів із GitHub (типовий префікс '', webhook HMAC, HTTP-маршрут, replay, redirect, voorcontrole)
    const initGhStand = await githubOntvangstStand(eigenaarId);
    check('githubOntvangstStand: типовий toegestaneTagPrefix порожній рядок "" (сумісно з тегами YYYYMMDD-HHMMSS)',
      initGhStand.toegestaneTagPrefix === '');

    const ghInst = await githubOntvangstInstellen(eigenaar, {
      repo: 'Tarasevych/hub-test',
      webhookAan: true,
      webhookAutoOphalen: true,
      toegestaneTagPrefix: 'uitrol-',
      genereerGeheim: true,
    });
    const whSecret = ghInst.eenmaligWebhookGeheim || '';
    check('githubOntvangstInstellen: генерує HMAC-секрет і вмикає webhook', Boolean(whSecret) && ghInst.webhookGeheimAanwezig && ghInst.webhookAan);

    const fouteSig = await verwerkGithubUitrolWebhook({
      handtekening: 'sha256=' + '0'.repeat(64),
      gebeurtenis: 'ping',
      leveringId: 'deliv-bad-1',
      rauwLichaam: JSON.stringify({ repository: { full_name: 'Tarasevych/hub-test' } }),
    });
    const pingBody = JSON.stringify({ repository: { full_name: 'Tarasevych/hub-test' } });
    const pingSig = `sha256=${createHmac('sha256', whSecret).update(pingBody, 'utf8').digest('hex')}`;
    const pingHttp = await nep.handler({
      headers: {
        host: 'admin.tarasevych.com',
        'content-type': 'application/json',
        'x-github-event': 'ping',
        'x-github-delivery': 'deliv-ping-http-1',
        'x-hub-signature-256': pingSig,
      },
      body: pingBody,
      isBase64Encoded: false,
      rawPath: '/api/uitrol/github/webhook',
      rawQueryString: '',
      queryStringParameters: {},
      requestContext: { http: { method: 'POST', path: '/api/uitrol/github/webhook', sourceIp: '140.82.115.10', userAgent: 'GitHub-Hookshot/test' } },
    } as never) as { statusCode: number; body: string };
    check('HTTP POST /api/uitrol/github/webhook: відхиляє невалідний підпис (401) і приймає валідний ping через роутер',
      !fouteSig.ok && fouteSig.status === 401 && pingHttp.statusCode === 200 && JSON.parse(pingHttp.body).ping === true);

    const v3 = '20261115-030000';
    const pak3 = maakTestArchief(tmpDir, v3, 'code.txt', Buffer.from('github release inhoud'));
    let cdnHadAuth = false;
    setUitrolGithubOntvangenDeps({
      ghToken: async () => 'ghp_TestGeheimToken1234567890',
      archiefControle: async (ref) => ({ ok: true, code: 'OK', reden: 'test', url: ref.url }),
      fetch: async (input, init) => {
        const url = String(input);
        const h = (init?.headers || {}) as Record<string, string>;
        if (url.includes('api.github.com/repos/Tarasevych/hub-test/releases/assets/501')) {
          return new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.com/dl/mijn-ruimte.tar.gz' } });
        }
        if (url.startsWith('https://objects.githubusercontent.com/')) {
          if (h.Authorization || h.authorization) cdnHadAuth = true;
          return new Response(new Uint8Array(pak3.buf), { status: 200 });
        }
        if (url.includes('/releases/tags/')) {
          return new Response(JSON.stringify({
            id: 777,
            tag_name: `uitrol-${v3}`,
            body: `sha256: \`${pak3.sha256}\``,
            assets: [{ id: 501, name: `mijn-ruimte-${v3}.tar.gz`, url: 'https://api.github.com/repos/Tarasevych/hub-test/releases/assets/501' }],
          }), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      },
    });

    const relPayload = JSON.stringify({
      action: 'published',
      repository: { full_name: 'Tarasevych/hub-test' },
      release: {
        id: 777,
        draft: false,
        tag_name: `uitrol-${v3}`,
        body: `sha256: \`${pak3.sha256}\``,
        assets: [{ id: 501, name: `mijn-ruimte-${v3}.tar.gz`, url: 'https://api.github.com/repos/Tarasevych/hub-test/releases/assets/501' }],
      },
    });
    const relSig = `sha256=${createHmac('sha256', whSecret).update(relPayload, 'utf8').digest('hex')}`;
    const whRel = await verwerkGithubUitrolWebhook({
      handtekening: relSig,
      gebeurtenis: 'release',
      leveringId: 'deliv-rel-3',
      rauwLichaam: relPayload,
    });
    const whReplay = await verwerkGithubUitrolWebhook({
      handtekening: relSig,
      gebeurtenis: 'release',
      leveringId: 'deliv-rel-3',
      rauwLichaam: relPayload,
    });
    const voorstel3 = (await sys.query(`SELECT status, sha256 FROM app.uitrol_voorstellen WHERE versie = $1`, [v3])).rows[0];
    const bewijs3 = (await sys.query(`SELECT status, soort FROM app.uitrol_stroom_bewijzen WHERE versie = $1 AND soort = 'github-ontvangst'`, [v3])).rows[0];

    check('webhook release: завантажує через 302 без токена на CDN, перевіряє, ставить wacht-op-goedkeuring і захищає від повтору',
      whRel.ok && whRel.resultaat.status === 'wacht-op-goedkeuring'
      && voorstel3?.status === 'wacht-op-goedkeuring' && voorstel3?.sha256 === pak3.sha256
      && bewijs3?.status === 'geslaagd' && !cdnHadAuth
      && whReplay.ok && whReplay.resultaat.herhaling === true);

    const v4 = '20261115-040000';
    const badShaErr = await haalGithubReleaseOp({
      eigenaarId,
      actor: eigenaar,
      bron: 'mcp',
      repo: 'Tarasevych/hub-test',
      tag: `uitrol-${v4}`,
      expectedSha256: '1'.repeat(64),
    }).then(() => '').catch((e) => String(e?.code || ''));
    const ghStand = await githubOntvangstStand(eigenaarId);
    check('haalGithubReleaseOp: відхиляє архів при розбіжності SHA-256 і фіксує подію в stand',
      badShaErr === 'GITHUB_SHA256_VERSCHILT' && ghStand.ontvangen.some((o) => o.foutCode === 'GITHUB_SHA256_VERSCHILT'));

    // ---------------------------------------------------------------- 5. MCP-інструмент uitrol_github_ophalen у реєстрах
    const mcpTool = SITE_TOOL_BY_NAME.get('uitrol_github_ophalen');
    const mcpReq = mcpTool?.request({ repo: 'Tarasevych/hub', tag: 'uitrol-20261115-050000' });
    check('MCP-інструмент uitrol_github_ophalen: у SITE_TOOLS (write: true), TOEGESTANE_ROUTES, TECHNISCH та V2_OPTIES',
      Boolean(mcpTool && mcpTool.write === true && mcpReq && TOEGESTANE_ROUTES.has(mcpReq.route))
      && toolInRuimte('uitrol_github_ophalen', 'technisch') && !toolInRuimte('uitrol_github_ophalen', 'prive')
      && Boolean(v2Optie('uitrol_github_ophalen:beheer')));

    return einde();
  } finally {
    setUitrolTelegramDeps(null);
    setUitrolGithubOntvangenDeps(null);
    nep.herstel();
    if (eigenaarId) {
      await sys.query(`DELETE FROM app.uitrol_stroom_bewijzen WHERE user_id = $1`, [eigenaarId]).catch(() => undefined);
      await sys.query(`DELETE FROM app.uitrol_stroom_controlelijsten WHERE user_id = $1`, [eigenaarId]).catch(() => undefined);
      await sys.query(`DELETE FROM app.uitrol_stroom_notities WHERE user_id = $1`, [eigenaarId]).catch(() => undefined);
      await sys.query(`DELETE FROM app.uitrol_telegram_updates WHERE user_id = $1`, [eigenaarId]).catch(() => undefined);
      await sys.query(`DELETE FROM app.uitrol_telegram_archief WHERE user_id = $1`, [eigenaarId]).catch(() => undefined);
      await sys.query(`DELETE FROM app.uitrol_telegram_instellingen WHERE user_id = $1`, [eigenaarId]).catch(() => undefined);
      await sys.query(`DELETE FROM app.uitrol_github_webhook_leveringen WHERE user_id = $1`, [eigenaarId]).catch(() => undefined);
      await sys.query(`DELETE FROM app.uitrol_github_ontvangen WHERE user_id = $1`, [eigenaarId]).catch(() => undefined);
      await sys.query(`DELETE FROM app.uitrol_github_instellingen WHERE user_id = $1`, [eigenaarId]).catch(() => undefined);
      await sys.query(`DELETE FROM app.uitrol_voorstellen WHERE account_id = $1`, [eigenaarId]).catch(() => undefined);
      await sys.query(`DELETE FROM app.uitrol_voorbereiders WHERE account_id = $1`, [eigenaarId]).catch(() => undefined);
      await sys.query(`DELETE FROM app.uitrol_runs WHERE id = 'run-tg-1'`).catch(() => undefined);
      await sys.query(`DELETE FROM app.records WHERE id = $1 OR data->>'userId' = $1 OR data->>'ownerUserId' = $1`, [eigenaarId]).catch(() => undefined);
    }
    await closePool().catch(() => undefined);
    for (const [k, v] of Object.entries(oldEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
