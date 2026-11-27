// Зашифроване резервне архівування встановлених випусків у Telegram (AES-256-GCM, розбиття на частини, відновлення й перевірка).
// Versleutelde reserve-archivering van geïnstalleerde releases in Telegram (AES-256-GCM, opsplitsing in delen, herstel en verificatie).
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { error, fileDownload, json } from '../server/platform';
import { rateLimit } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import {
  apiPlatformVaultItems,
  ownerVaultBewarenIntern,
  readOwnerVaultPlaintext,
} from './api-platform-kluis';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { releaseInfo } from './uitgave-info';
import { pakkettenDir } from './uitrol-github';
import { bouwUitgaveUitleg } from './uitrol-telegram-uitleg';

const VERSIE_RE = /^\d{8}-\d{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_ID_RE = /^[A-Za-z0-9:_.-]{3,80}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const CHAT_ID_RE = /^(?:-?\d{4,20}|@[A-Za-z][A-Za-z0-9_]{3,60})$/;
const BOT_TOKEN_RE = /^\d{5,20}:[A-Za-z0-9_-]{20,100}$/;

export const VAULT_TELEGRAM_BOT_NAAM = 'TELEGRAM_UITROL_BOT_TOKEN';
export const VAULT_TELEGRAM_SLEUTEL_NAAM = 'UITROL_ARCHIEF_SLEUTEL';
export const VAULT_TELEGRAM_WEBHOOK_GEHEIM_NAAM = 'TELEGRAM_UITROL_WEBHOOK_GEHEIM';

// HERSTEL-001 (24.11.2026): менші частини (15 МБ замість 45 МБ) і суто потокове надсилання без копій Buffer/Blob.
const STANDAARD_DEEL_BYTES = 15 * 1024 * 1024;
const STREAM_CHUNK_BYTES = 64 * 1024;
const MAX_POGINGEN = 3;
const HERSTEL_TTL_MS = 5 * 60_000;
const BEZIG_VERLOPEN_MIN = 15;
const TMP_OPRUIM_MS = 30 * 60_000;
const MAGIC = Buffer.from('MRTG1\x01', 'ascii'); // 6 байт: магічний заголовок + версія формату

const sys = () => getPool('systeem');
const uploadsDir = () => (process.env.UPLOADS_DIR || '/srv/data/uploads').replace(/\/+$/, '');
const telegramTmpDir = () => path.join(uploadsDir(), 'uitrol-telegram-tmp');
export const telegramHerstelDir = () => path.join(uploadsDir(), 'uitrol-telegram-herstel');

export class TelegramArchiefFout extends Error {
  constructor(public code: string, public status = 400, public tijdelijk = false) {
    super(code);
  }
}

export type TelegramDeelInfo = {
  deelNr: number;
  totaalDelen: number;
  naam: string;
  sha256: string;
  bytes: number;
  messageId: number;
  fileId: string;
  fileUniqueId: string;
};

export type TelegramArchiefInstellingen = {
  chatId: string;
  messageThreadId: number | null;
  actief: boolean;
  verplichtVoorInstallatie: boolean;
  laatstGetestOp: string;
  laatsteTestOk: boolean;
  laatsteTestFout: string;
  bijgewerktOp: string;
};

type BotTokenBron = (eigenaarId: string) => Promise<{ token: string; bron: 'kluis' | 'omgeving' } | null>;
type SleutelBron = (eigenaarId: string) => Promise<string | null>;
type WebhookGeheimBron = (eigenaarId: string) => Promise<string | null>;

const telegramBasis = () => (process.env.TELEGRAM_API_BASIS || 'https://api.telegram.org').replace(/\/+$/, '');
let doFetch: typeof fetch = (...a) => fetch(...a);
let slaap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let botBronOverride: BotTokenBron | null = null;
let sleutelBronOverride: SleutelBron | null = null;
let webhookGeheimOverride: WebhookGeheimBron | null = null;

/** Лише для модульних перевірок. */
export function setUitrolTelegramDeps(d: {
  fetch?: typeof fetch;
  slaap?: (ms: number) => Promise<void>;
  botToken?: BotTokenBron;
  archiefSleutel?: SleutelBron;
  webhookGeheim?: WebhookGeheimBron;
} | null) {
  doFetch = d?.fetch ?? ((...a) => fetch(...a));
  slaap = d?.slaap ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  botBronOverride = d?.botToken ?? null;
  sleutelBronOverride = d?.archiefSleutel ?? null;
  webhookGeheimOverride = d?.webhookGeheim ?? null;
}

const isOntbrekendeTabel = (e: unknown) => String((e as { code?: string })?.code || '') === '42P01';
const telegramWebhookUrl = () => `https://${SERVICE_HOSTS.api || 'api.tarasevych.com'}/api/uitrol/telegram/webhook`;

// ------------------------------------------------------------------------------------------------ робота з ключами (ніколи не повертаємо значення)
export function normaliseerArchiefSleutel(invoer: string): Buffer {
  const s = String(invoer || '').trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex');
  if (/^[A-Za-z0-9+/=_-]{43,48}$/.test(s)) {
    const b = Buffer.from(s, s.includes('-') || s.includes('_') ? 'base64url' : 'base64');
    if (b.length === 32) return b;
  }
  if (s.length >= 32) return createHash('sha256').update(s, 'utf8').digest();
  throw new TelegramArchiefFout('TELEGRAM_SLEUTEL_ONGELDIG', 400);
}

/** Читає ВИКЛЮЧНО ключ доступу власного бота випусків (`TELEGRAM_UITROL_BOT_TOKEN`), ніколи не перемикається на бот входу. */
async function leesBotToken(eigenaarId: string): Promise<{ token: string; bron: 'kluis' | 'omgeving' } | null> {
  if (botBronOverride) return botBronOverride(eigenaarId);
  try {
    const items = await apiPlatformVaultItems(eigenaarId);
    const eigen = items.find((i) => i.keyName === VAULT_TELEGRAM_BOT_NAAM);
    if (eigen) {
      const val = (await readOwnerVaultPlaintext(eigenaarId, eigen.keyName, eigen.purpose)).trim();
      if (BOT_TOKEN_RE.test(val)) return { token: val, bron: 'kluis' };
    }
  } catch { /* пробуємо змінну оточення */ }
  const envToken = String(process.env.UITROL_TELEGRAM_BOT_TOKEN || '').trim();
  if (BOT_TOKEN_RE.test(envToken)) return { token: envToken, bron: 'omgeving' };
  return null;
}

async function leesArchiefSleutel(eigenaarId: string): Promise<string | null> {
  if (sleutelBronOverride) return sleutelBronOverride(eigenaarId);
  try {
    const items = await apiPlatformVaultItems(eigenaarId);
    const item = items.find((i) => i.keyName === VAULT_TELEGRAM_SLEUTEL_NAAM);
    if (item) {
      const val = (await readOwnerVaultPlaintext(eigenaarId, item.keyName, item.purpose)).trim();
      if (val) return val;
    }
  } catch { /* не знайдено або закрито */ }
  const envKey = String(process.env.UITROL_TELEGRAM_ARCHIEF_SLEUTEL || '').trim();
  return envKey || null;
}

async function leesTelegramWebhookGeheim(eigenaarId: string): Promise<string | null> {
  if (webhookGeheimOverride) return webhookGeheimOverride(eigenaarId);
  try {
    const items = await apiPlatformVaultItems(eigenaarId);
    const item = items.find((i) => i.keyName === VAULT_TELEGRAM_WEBHOOK_GEHEIM_NAAM);
    if (item) {
      const val = (await readOwnerVaultPlaintext(eigenaarId, item.keyName, item.purpose)).trim();
      if (val) return val;
    }
  } catch { /* пробуємо змінну оточення */ }
  const envVal = String(process.env.UITROL_TELEGRAM_WEBHOOK_GEHEIM || '').trim();
  return envVal || null;
}

// ------------------------------------------------------------------------------------------------ потокове шифрування та розшифрування
async function sha256Bestand(pad: string): Promise<{ sha256: string; bytes: number }> {
  const h = createHash('sha256');
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    const st = createReadStream(pad);
    st.on('data', (chunk) => {
      const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += b.length;
      h.update(b);
    });
    st.on('end', () => resolve());
    st.on('error', reject);
  });
  return { sha256: h.digest('hex'), bytes };
}

export function archiefAad(versie: string, origineelSha256: string): Buffer {
  return Buffer.from(`mijn-ruimte-uitrol-telegram|v1|${versie}|${origineelSha256}`, 'utf8');
}

/**
 * Шифрує вихідний архів у формат `MRTG1\x01 + IV(12) + шифротекст + AuthTag(16)` (потоково, без завантаження усього файла в RAM).
 */
export async function versleutelArchiefBestand(invoer: {
  bronPad: string;
  doelPad: string;
  versie: string;
  sleutel: Buffer;
}): Promise<{ origineelSha256: string; origineelBytes: number; versleuteldSha256: string; versleuteldBytes: number }> {
  const orig = await sha256Bestand(invoer.bronPad);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', invoer.sleutel, iv);
  cipher.setAAD(archiefAad(invoer.versie, orig.sha256));

  await mkdir(path.dirname(invoer.doelPad), { recursive: true, mode: 0o750 });
  const fh = await open(invoer.doelPad, 'w', 0o600);
  try {
    await fh.write(Buffer.concat([MAGIC, iv]));
  } finally {
    await fh.close();
  }

  await pipeline(
    createReadStream(invoer.bronPad),
    cipher,
    createWriteStream(invoer.doelPad, { flags: 'a', mode: 0o600 }),
  );
  const tag = cipher.getAuthTag();
  const tail = await open(invoer.doelPad, 'a', 0o600);
  try {
    await tail.write(tag);
  } finally {
    await tail.close();
  }

  const enc = await sha256Bestand(invoer.doelPad);
  return {
    origineelSha256: orig.sha256,
    origineelBytes: orig.bytes,
    versleuteldSha256: enc.sha256,
    versleuteldBytes: enc.bytes,
  };
}

/**
 * Розшифровує контейнер `MRTG1\x01` потоково та перевіряє AuthTag і вихідний SHA-256.
 */
export async function ontsleutelArchiefBestand(invoer: {
  bronPad: string;
  doelPad: string;
  versie: string;
  verwachteOrigineelSha256: string;
  sleutel: Buffer;
}): Promise<{ origineelSha256: string; origineelBytes: number }> {
  const st = await stat(invoer.bronPad);
  const kopLen = MAGIC.length + 12;
  const tagLen = 16;
  if (st.size < kopLen + tagLen + 1) throw new TelegramArchiefFout('TELEGRAM_HERSTEL_INTEGRITEIT', 422);

  const kop = Buffer.alloc(kopLen);
  const tag = Buffer.alloc(tagLen);
  const fh = await open(invoer.bronPad, 'r');
  try {
    await fh.read(kop, 0, kopLen, 0);
    await fh.read(tag, 0, tagLen, st.size - tagLen);
  } finally {
    await fh.close();
  }
  if (!kop.subarray(0, MAGIC.length).equals(MAGIC)) throw new TelegramArchiefFout('TELEGRAM_HERSTEL_INTEGRITEIT', 422);

  const iv = kop.subarray(MAGIC.length, kopLen);
  const decipher = createDecipheriv('aes-256-gcm', invoer.sleutel, iv);
  decipher.setAAD(archiefAad(invoer.versie, invoer.verwachteOrigineelSha256));
  decipher.setAuthTag(tag);

  await mkdir(path.dirname(invoer.doelPad), { recursive: true, mode: 0o750 });
  try {
    await pipeline(
      createReadStream(invoer.bronPad, { start: kopLen, end: st.size - tagLen - 1 }),
      decipher,
      createWriteStream(invoer.doelPad, { mode: 0o600 }),
    );
  } catch {
    await rm(invoer.doelPad, { force: true }).catch(() => undefined);
    throw new TelegramArchiefFout('TELEGRAM_HERSTEL_INTEGRITEIT', 422);
  }

  const hersteld = await sha256Bestand(invoer.doelPad);
  if (hersteld.sha256 !== invoer.verwachteOrigineelSha256) {
    await rm(invoer.doelPad, { force: true }).catch(() => undefined);
    throw new TelegramArchiefFout('TELEGRAM_HERSTEL_INTEGRITEIT', 422);
  }
  return { origineelSha256: hersteld.sha256, origineelBytes: hersteld.bytes };
}

// ------------------------------------------------------------------------------------------------ клієнт Telegram Bot API
async function tgApi<T = Record<string, unknown>>(token: string, methode: string, body?: Record<string, unknown> | FormData): Promise<T> {
  let laatsteFout: TelegramArchiefFout = new TelegramArchiefFout('TELEGRAM_BOT_FOUT', 502, true);
  for (let poging = 1; poging <= MAX_POGINGEN; poging++) {
    try {
      const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
      const res = await doFetch(`${telegramBasis()}/bot${token}/${methode}`, {
        method: 'POST',
        signal: AbortSignal.timeout(isForm ? 120_000 : 20_000),
        headers: isForm ? undefined : { 'Content-Type': 'application/json' },
        body: isForm ? body : body ? JSON.stringify(body) : undefined,
      });
      const jsonBody = await res.json().catch(() => null) as { ok?: boolean; result?: T; error_code?: number; parameters?: { retry_after?: number } } | null;
      if (res.ok && jsonBody?.ok && jsonBody.result !== undefined) return jsonBody.result;
      const retryAfter = Number(jsonBody?.parameters?.retry_after || 0);
      const status = res.status;
      if (status === 401 || status === 403) throw new TelegramArchiefFout('TELEGRAM_BOT_ONGELDIG', 400, false);
      if (status === 400 || status === 404) throw new TelegramArchiefFout(`TELEGRAM_HTTP_${status}`, 400, false);
      laatsteFout = new TelegramArchiefFout(`TELEGRAM_HTTP_${status || 502}`, 502, status === 429 || status >= 500);
      if (!laatsteFout.tijdelijk || poging === MAX_POGINGEN) throw laatsteFout;
      await slaap(retryAfter > 0 ? Math.min(retryAfter, 15) * 1000 : poging * 1000);
    } catch (e) {
      if (e instanceof TelegramArchiefFout) {
        if (!e.tijdelijk || poging === MAX_POGINGEN) throw e;
        laatsteFout = e;
      } else {
        laatsteFout = new TelegramArchiefFout('TELEGRAM_NETWERK', 502, true);
        if (poging === MAX_POGINGEN) throw laatsteFout;
      }
      await slaap(poging * 1000);
    }
  }
  throw laatsteFout;
}

/** Потоковий підрахунок SHA-256 та фактичної довжини зрізу файла без завантаження частини в пам'ять. */
export async function sha256Deel(pad: string, start: number, endInclusive: number): Promise<{ sha256: string; bytes: number }> {
  const h = createHash('sha256');
  let bytes = 0;
  const st = createReadStream(pad, { start, end: endInclusive, highWaterMark: STREAM_CHUNK_BYTES });
  for await (const chunk of st) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += b.length;
    h.update(b);
  }
  return { sha256: h.digest('hex'), bytes };
}

const schoonMultipartWaarde = (s: string) => s.replace(/[\r\n"]/g, '_');

/**
 * Потоково надсилає діапазон [start..endInclusive] файла як RFC 7578 multipart/form-data у Telegram sendDocument.
 * Не тримає частину архіву в Buffer/Uint8Array/Blob: у пам'яті одночасно лише порції ~64 КБ.
 */
export async function stuurDocumentVanBestand(
  token: string,
  chatId: string,
  messageThreadId: number | null,
  naam: string,
  bestandPad: string,
  start: number,
  endInclusive: number,
  deelBytes: number,
  caption: string,
): Promise<{ messageId: number; fileId: string; fileUniqueId: string }> {
  const boundary = `----MijnRuimteTg${randomBytes(12).toString('hex')}`;
  const velden: Array<[string, string]> = [
    ['chat_id', chatId],
    ...(messageThreadId ? [['message_thread_id', String(messageThreadId)] as [string, string]] : []),
    ['disable_notification', 'true'],
    ['caption', caption.slice(0, 900)],
  ];
  const kopDelen: string[] = [];
  for (const [k, v] of velden) {
    kopDelen.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  }
  kopDelen.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${schoonMultipartWaarde(naam)}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const kopBuf = Buffer.from(kopDelen.join(''), 'utf8');
  const staartBuf = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const totaalBytes = kopBuf.length + deelBytes + staartBuf.length;

  let laatsteFout: TelegramArchiefFout = new TelegramArchiefFout('TELEGRAM_BOT_FOUT', 502, true);
  for (let poging = 1; poging <= MAX_POGINGEN; poging++) {
    const nodeStream = Readable.from((async function* () {
      yield kopBuf;
      const rs = createReadStream(bestandPad, { start, end: endInclusive, highWaterMark: STREAM_CHUNK_BYTES });
      for await (const chunk of rs) {
        yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      }
      yield staartBuf;
    })());
    const webStream = Readable.toWeb(nodeStream) as unknown as RequestInit['body'];
    try {
      const init: RequestInit & { duplex?: 'half' } = {
        method: 'POST',
        duplex: 'half',
        signal: AbortSignal.timeout(120_000),
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(totaalBytes),
        },
        body: webStream,
      };
      const res = await doFetch(`${telegramBasis()}/bot${token}/sendDocument`, init);
      const jsonBody = await res.json().catch(() => null) as {
        ok?: boolean;
        result?: { message_id?: number; document?: { file_id?: string; file_unique_id?: string } };
        parameters?: { retry_after?: number };
      } | null;
      if (res.ok && jsonBody?.ok && jsonBody.result !== undefined) {
        return {
          messageId: Number(jsonBody.result?.message_id || 0),
          fileId: String(jsonBody.result?.document?.file_id || ''),
          fileUniqueId: String(jsonBody.result?.document?.file_unique_id || ''),
        };
      }
      const retryAfter = Number(jsonBody?.parameters?.retry_after || 0);
      const status = res.status;
      if (status === 401 || status === 403) throw new TelegramArchiefFout('TELEGRAM_BOT_ONGELDIG', 400, false);
      if (status === 400 || status === 404) throw new TelegramArchiefFout(`TELEGRAM_HTTP_${status}`, 400, false);
      laatsteFout = new TelegramArchiefFout(`TELEGRAM_HTTP_${status || 502}`, 502, status === 429 || status >= 500);
      if (!laatsteFout.tijdelijk || poging === MAX_POGINGEN) throw laatsteFout;
      await slaap(retryAfter > 0 ? Math.min(retryAfter, 15) * 1000 : poging * 1000);
    } catch (e) {
      nodeStream.destroy();
      if (e instanceof TelegramArchiefFout) {
        if (!e.tijdelijk || poging === MAX_POGINGEN) throw e;
        laatsteFout = e;
      } else {
        laatsteFout = new TelegramArchiefFout('TELEGRAM_NETWERK', 502, true);
        if (poging === MAX_POGINGEN) throw laatsteFout;
      }
      await slaap(poging * 1000);
    }
  }
  throw laatsteFout;
}

/** Для дрібних службових документів (маніфест частин, текстовий пробний файл <= 256 КБ). */
async function stuurDocument(
  token: string,
  chatId: string,
  messageThreadId: number | null,
  naam: string,
  inhoud: Buffer,
  caption: string,
): Promise<{ messageId: number; fileId: string; fileUniqueId: string }> {
  const form = new FormData();
  form.append('chat_id', chatId);
  if (messageThreadId) form.append('message_thread_id', String(messageThreadId));
  form.append('disable_notification', 'true');
  form.append('caption', caption.slice(0, 900));
  form.append('document', new Blob([new Uint8Array(inhoud)], { type: 'application/octet-stream' }), naam);
  const res = await tgApi<{
    message_id?: number;
    document?: { file_id?: string; file_unique_id?: string };
  }>(token, 'sendDocument', form);
  return {
    messageId: Number(res?.message_id || 0),
    fileId: String(res?.document?.file_id || ''),
    fileUniqueId: String(res?.document?.file_unique_id || ''),
  };
}

// ------------------------------------------------------------------------------------------------ налаштування й стан
export async function telegramInstellingenVan(eigenaarId: string): Promise<TelegramArchiefInstellingen> {
  try {
    const r = await sys().query(
      `SELECT chat_id, message_thread_id, actief, verplicht_voor_installatie, laatst_getest_op, laatste_test_ok, laatste_test_fout, bijgewerkt_op
         FROM app.uitrol_telegram_instellingen WHERE user_id = $1 LIMIT 1`,
      [eigenaarId],
    );
    const row = r.rows[0];
    if (!row) {
      return {
        chatId: '', messageThreadId: null, actief: false, verplichtVoorInstallatie: false,
        laatstGetestOp: '', laatsteTestOk: false, laatsteTestFout: '', bijgewerktOp: '',
      };
    }
    return {
      chatId: String(row.chat_id || ''),
      messageThreadId: row.message_thread_id != null ? Number(row.message_thread_id) : null,
      actief: Boolean(row.actief),
      verplichtVoorInstallatie: Boolean(row.verplicht_voor_installatie),
      laatstGetestOp: row.laatst_getest_op ? new Date(row.laatst_getest_op).toISOString() : '',
      laatsteTestOk: Boolean(row.laatste_test_ok),
      laatsteTestFout: String(row.laatste_test_fout || ''),
      bijgewerktOp: row.bijgewerkt_op ? new Date(row.bijgewerkt_op).toISOString() : '',
    };
  } catch (e) {
    if (isOntbrekendeTabel(e)) {
      return {
        chatId: '', messageThreadId: null, actief: false, verplichtVoorInstallatie: false,
        laatstGetestOp: '', laatsteTestOk: false, laatsteTestFout: '', bijgewerktOp: '',
      };
    }
    throw e;
  }
}

export async function telegramStand(eigenaarId: string) {
  const inst = await telegramInstellingenVan(eigenaarId);
  const bot = await leesBotToken(eigenaarId);
  const sleutel = await leesArchiefSleutel(eigenaarId);
  let archieven: Array<Record<string, unknown>> = [];
  try {
    const { rows } = await sys().query(
      `SELECT id, versie, run_id, chat_id, message_thread_id, origineel_sha256, origineel_bytes,
              versleuteld_sha256, versleuteld_bytes, algoritme, aantal_delen, delen, manifest_msg_id,
              status, fout_code, pogingen, aangemaakt_op, voltooid_op
         FROM app.uitrol_telegram_archief
        WHERE user_id = $1
        ORDER BY aangemaakt_op DESC
        LIMIT 25`,
      [eigenaarId],
    );
    archieven = rows.map((r) => ({
      id: String(r.id),
      versie: String(r.versie),
      runId: String(r.run_id || ''),
      chatId: String(r.chat_id),
      messageThreadId: r.message_thread_id != null ? Number(r.message_thread_id) : null,
      origineelSha256: String(r.origineel_sha256),
      origineelBytes: Number(r.origineel_bytes),
      versleuteldSha256: String(r.versleuteld_sha256 || ''),
      versleuteldBytes: Number(r.versleuteld_bytes || 0),
      algoritme: String(r.algoritme || 'AES-256-GCM'),
      aantalDelen: Number(r.aantal_delen || 1),
      delen: Array.isArray(r.delen) ? r.delen : [],
      manifestMsgId: r.manifest_msg_id != null ? Number(r.manifest_msg_id) : null,
      status: String(r.status),
      foutCode: String(r.fout_code || ''),
      pogingen: Number(r.pogingen || 0),
      aangemaaktOp: new Date(r.aangemaakt_op).toISOString(),
      voltooidOp: r.voltooid_op ? new Date(r.voltooid_op).toISOString() : '',
    }));
  } catch (e) {
    if (!isOntbrekendeTabel(e)) throw e;
  }

  const whGeheim = await leesTelegramWebhookGeheim(eigenaarId);
  const blokkade = await controleerTelegramBlokkade(eigenaarId).catch(() => ({ geblokkeerd: false as const }));
  return {
    ...inst,
    botAanwezig: Boolean(bot?.token),
    botBron: bot?.bron || null,
    sleutelAanwezig: Boolean(sleutel),
    webhookGeheimAanwezig: Boolean(whGeheim),
    webhookUrl: telegramWebhookUrl(),
    klaar: Boolean(bot?.token && sleutel && inst.chatId),
    blokkade,
    archieven,
  };
}

export async function telegramInstellingenOpslaan(
  eigenaar: { id: string; email?: string },
  invoer: {
    chatId?: unknown;
    messageThreadId?: unknown;
    actief?: unknown;
    verplichtVoorInstallatie?: unknown;
    botToken?: unknown;
    archiefSleutel?: unknown;
    genereerSleutel?: unknown;
  },
) {
  const voor = await telegramInstellingenVan(eigenaar.id);
  const chatId = invoer.chatId !== undefined ? String(invoer.chatId ?? '').trim() : voor.chatId;
  if (chatId && !CHAT_ID_RE.test(chatId)) throw new TelegramArchiefFout('TELEGRAM_CHAT_ONTBREEKT', 400);

  let messageThreadId = voor.messageThreadId;
  if (invoer.messageThreadId !== undefined) {
    const raw = String(invoer.messageThreadId ?? '').trim();
    if (!raw) messageThreadId = null;
    else {
      const n = Number(raw);
      if (!Number.isSafeInteger(n) || n <= 0) throw new TelegramArchiefFout('TELEGRAM_CHAT_ONTBREEKT', 400);
      messageThreadId = n;
    }
  }

  const botToken = String(invoer.botToken ?? '').trim();
  if (botToken) {
    if (!BOT_TOKEN_RE.test(botToken)) throw new TelegramArchiefFout('TELEGRAM_BOT_ONGELDIG', 400);
    await ownerVaultBewarenIntern(eigenaar.id, VAULT_TELEGRAM_BOT_NAAM, 'telegram', 'Uitrol-Telegram-archief', botToken);
  }

  let eenmaligeSleutel = '';
  const archiefSleutel = String(invoer.archiefSleutel ?? '').trim();
  if (invoer.genereerSleutel === true) {
    eenmaligeSleutel = randomBytes(32).toString('hex');
    await ownerVaultBewarenIntern(eigenaar.id, VAULT_TELEGRAM_SLEUTEL_NAAM, 'other', 'Uitrol-Telegram-archief-AES256', eenmaligeSleutel);
  } else if (archiefSleutel) {
    normaliseerArchiefSleutel(archiefSleutel);
    await ownerVaultBewarenIntern(eigenaar.id, VAULT_TELEGRAM_SLEUTEL_NAAM, 'other', 'Uitrol-Telegram-archief-AES256', archiefSleutel);
  }

  const actief = invoer.actief === undefined ? voor.actief : invoer.actief === true;
  const verplicht = invoer.verplichtVoorInstallatie === undefined ? voor.verplichtVoorInstallatie : invoer.verplichtVoorInstallatie === true;

  await sys().query(
    `INSERT INTO app.uitrol_telegram_instellingen (user_id, ruimte, chat_id, message_thread_id, actief, verplicht_voor_installatie, bijgewerkt_op)
     VALUES ($1, 'technisch', $2, $3, $4, $5, now())
     ON CONFLICT (user_id) DO UPDATE SET
       chat_id = EXCLUDED.chat_id,
       message_thread_id = EXCLUDED.message_thread_id,
       actief = EXCLUDED.actief,
       verplicht_voor_installatie = EXCLUDED.verplicht_voor_installatie,
       bijgewerkt_op = now()`,
    [eigenaar.id, chatId, messageThreadId, actief, verplicht],
  );

  await schrijfBeheerAudit({
    actor: eigenaar,
    actie: 'owner.uitrol.telegram.instellingen',
    doel: { soort: 'telegram', id: chatId || '—' },
    voor: { chatId: voor.chatId, actief: voor.actief, verplicht: voor.verplichtVoorInstallatie },
    na: { chatId, actief, verplicht, sleutelGewijzigd: Boolean(eenmaligeSleutel || archiefSleutel), botGewijzigd: Boolean(botToken) },
    service: 'admin',
  });

  const stand = await telegramStand(eigenaar.id);
  return eenmaligeSleutel ? { ...stand, eenmaligeSleutel } : stand;
}

export async function telegramVerbindingTesten(
  eigenaar: { id: string; email?: string },
  opties: { metProefDocument?: boolean } = {},
) {
  const inst = await telegramInstellingenVan(eigenaar.id);
  const bot = await leesBotToken(eigenaar.id);
  if (!bot || !inst.chatId) throw new TelegramArchiefFout('TELEGRAM_CHAT_ONTBREEKT', 400);

  try {
    const me = await tgApi<{ username?: string; id?: number }>(bot.token, 'getMe');
    const chat = await tgApi<{ title?: string; username?: string; type?: string; is_forum?: boolean }>(
      bot.token,
      'getChat',
      { chat_id: inst.chatId },
    );
    const chatType = String(chat?.type || '');
    const isForum = chat?.is_forum === true ? true : chat?.is_forum === false ? false : null;

    if (!me?.id) throw new TelegramArchiefFout('TELEGRAM_BOT_ONGELDIG', 400);
    let lid: {
      status?: string;
      can_post_messages?: boolean;
      can_send_messages?: boolean;
      can_send_documents?: boolean;
    };
    try {
      lid = await tgApi(bot.token, 'getChatMember', { chat_id: inst.chatId, user_id: me.id });
    } catch (e) {
      if (e instanceof TelegramArchiefFout && e.code === 'TELEGRAM_HTTP_400') {
        throw new TelegramArchiefFout('TELEGRAM_BOT_NIET_IN_GROEP', 400);
      }
      throw e;
    }

    const botStatus = String(lid?.status || '');
    if (!botStatus || botStatus === 'left' || botStatus === 'kicked') {
      throw new TelegramArchiefFout('TELEGRAM_BOT_NIET_IN_GROEP', 400);
    }
    if (chatType === 'channel') {
      if ((botStatus !== 'administrator' && botStatus !== 'creator') || lid?.can_post_messages === false) {
        throw new TelegramArchiefFout('TELEGRAM_GEEN_SCHRIJFRECHT', 400);
      }
    } else if (chatType === 'group' || chatType === 'supergroup') {
      if (botStatus === 'restricted') {
        if (lid?.can_send_messages !== true || lid?.can_send_documents !== true) {
          throw new TelegramArchiefFout('TELEGRAM_GEEN_SCHRIJFRECHT', 400);
        }
      } else if (botStatus !== 'administrator' && botStatus !== 'creator' && botStatus !== 'member') {
        throw new TelegramArchiefFout('TELEGRAM_BOT_NIET_IN_GROEP', 400);
      } else if (lid?.can_send_messages === false || lid?.can_send_documents === false) {
        throw new TelegramArchiefFout('TELEGRAM_GEEN_SCHRIJFRECHT', 400);
      }
    }

    if (inst.messageThreadId != null && (chatType === 'group' || (chatType === 'supergroup' && chat?.is_forum === false))) {
      throw new TelegramArchiefFout('TELEGRAM_GEEN_FORUM', 400);
    }

    await tgApi(bot.token, 'sendMessage', {
      chat_id: inst.chatId,
      ...(inst.messageThreadId ? { message_thread_id: inst.messageThreadId } : {}),
      disable_notification: true,
      text: [
        'Mijn Ruimte — перевірка архівного каналу випусків успішна.',
        'Mijn Ruimte — test van het Telegram-releasearchief geslaagd.',
      ].join('\n'),
    });
    const metProefDoc = opties.metProefDocument !== false;
    const proefDocument = metProefDoc
      ? await stuurDocument(
          bot.token,
          inst.chatId,
          inst.messageThreadId,
          'mijn-ruimte-verbindingstest.txt',
          Buffer.from(
            [
              'Mijn Ruimte — пробний файл архіву випусків.',
              'Mijn Ruimte — proefbestand van het releasearchief.',
              `Час / Tijd: ${new Date().toISOString()}`,
            ].join('\n'),
            'utf8',
          ),
          'Mijn Ruimte · пробний файл / proefbestand (не архів)',
        )
      : null;
    await sys().query(
      `UPDATE app.uitrol_telegram_instellingen SET laatst_getest_op = now(), laatste_test_ok = true, laatste_test_fout = '', bijgewerkt_op = now() WHERE user_id = $1`,
      [eigenaar.id],
    );
    await schrijfBeheerAudit({
      actor: eigenaar,
      actie: 'owner.uitrol.telegram.test',
      doel: { soort: 'telegram', id: inst.chatId },
      details: { bot: String(me?.username || ''), chatType, botStatus, isForum, messageThreadId: inst.messageThreadId, ...(proefDocument ? { documentMessageId: proefDocument.messageId } : {}) },
      service: 'admin',
    });
    return {
      ok: true,
      botUsername: String(me?.username || ''),
      chatTitle: String(chat?.title || chat?.username || inst.chatId),
      chatType,
      botStatus,
      isForum,
      messageThreadId: inst.messageThreadId,
      documentOk: Boolean(proefDocument),
      ...(proefDocument ? { documentMessageId: proefDocument.messageId } : {}),
    };
  } catch (e) {
    const code = e instanceof TelegramArchiefFout ? e.code : 'TELEGRAM_BOT_FOUT';
    await sys().query(
      `UPDATE app.uitrol_telegram_instellingen SET laatst_getest_op = now(), laatste_test_ok = false, laatste_test_fout = $2, bijgewerkt_op = now() WHERE user_id = $1`,
      [eigenaar.id, code.slice(0, 180)],
    ).catch(() => undefined);
    throw e instanceof TelegramArchiefFout ? e : new TelegramArchiefFout(code, 502);
  }
}

// ------------------------------------------------------------------------------------------------ архівування випуску
const lopendeArchieven = new Set<string>();
let archiefBezigGlobaal = false;
let autoWachtrij: Promise<void> = Promise.resolve();

/** Прибирає завислі записи bezig старше BEZIG_VERLOPEN_MIN хв та осиротілі тимчасові enc/dec-файли. */
export async function ruimOudeTgTmpEnBezigOp(): Promise<{ tmpVerwijderd: number; bezigHersteld: number }> {
  let tmpVerwijderd = 0;
  let bezigHersteld = 0;
  const nu = Date.now();
  const dir = telegramTmpDir();
  const bestanden = await readdir(dir).catch(() => [] as string[]);
  for (const f of bestanden) {
    if (!/^(?:enc|dec)-.+\.bin$/.test(f)) continue;
    const p = path.join(dir, f);
    const s = await stat(p).catch(() => null);
    if (s && nu - s.mtimeMs > TMP_OPRUIM_MS) {
      await unlink(p).catch(() => undefined);
      tmpVerwijderd += 1;
    }
  }
  try {
    const r = await sys().query(
      `UPDATE app.uitrol_telegram_archief
          SET status = 'mislukt',
              fout_code = CASE WHEN fout_code = '' THEN 'AFGEBROKEN_HERSTART' ELSE fout_code END,
              bijgewerkt_op = now()
        WHERE status = 'bezig'
          AND bijgewerkt_op < now() - make_interval(mins => $1)`,
      [BEZIG_VERLOPEN_MIN],
    );
    bezigHersteld = r.rowCount || 0;
  } catch (e) {
    if (!isOntbrekendeTabel(e)) { /* не блокуємо основну дію */ }
  }
  return { tmpVerwijderd, bezigHersteld };
}

export async function archiveerReleaseNaarTelegram(invoer: {
  eigenaarId: string;
  actor?: { id: string; email?: string } | null;
  versie: string;
  bestandPad: string;
  runId?: string;
  voorstelId?: string | null;
  deelBytes?: number;
}) {
  if (!VERSIE_RE.test(invoer.versie)) throw new TelegramArchiefFout('VERSIE_ONGELDIG', 400);
  const sleutelStr = await leesArchiefSleutel(invoer.eigenaarId);
  if (!sleutelStr) throw new TelegramArchiefFout('TELEGRAM_SLEUTEL_ONTBREEKT', 400);
  const sleutel = normaliseerArchiefSleutel(sleutelStr);

  const inst = await telegramInstellingenVan(invoer.eigenaarId);
  const bot = await leesBotToken(invoer.eigenaarId);
  if (!bot || !inst.chatId) throw new TelegramArchiefFout('TELEGRAM_CHAT_ONTBREEKT', 400);

  const st = await stat(invoer.bestandPad).catch(() => null);
  if (!st || !st.isFile() || st.size <= 0) throw new TelegramArchiefFout('ARCHIEF_ONTBREEKT', 404);

  const origineelInfo = await sha256Bestand(invoer.bestandPad);
  const lockKey = `${invoer.eigenaarId}:${invoer.versie}:${origineelInfo.sha256}`;
  if (archiefBezigGlobaal || lopendeArchieven.has(lockKey)) throw new TelegramArchiefFout('AL_BEZIG', 409);
  archiefBezigGlobaal = true;
  lopendeArchieven.add(lockKey);

  const tmpId = randomBytes(8).toString('hex');
  const tmpEnc = path.join(telegramTmpDir(), `enc-${invoer.versie}-${tmpId}.bin`);
  let recordId = '';

  try {
    // Повторостійкість: якщо такий самий оригінал цієї версії вже успішно збережено в Telegram, повертаємо наявний запис.
    const bestaand = await sys().query(
      `SELECT * FROM app.uitrol_telegram_archief WHERE user_id = $1 AND versie = $2 AND origineel_sha256 = $3 AND status = 'voltooid' LIMIT 1`,
      [invoer.eigenaarId, invoer.versie, origineelInfo.sha256],
    );
    if (bestaand.rows[0]) {
      return {
        ok: true,
        reedsBestaand: true,
        id: String(bestaand.rows[0].id),
        versie: invoer.versie,
        aantalDelen: Number(bestaand.rows[0].aantal_delen),
        origineelSha256: origineelInfo.sha256,
        versleuteldSha256: String(bestaand.rows[0].versleuteld_sha256),
      };
    }

    await ruimOudeTgTmpEnBezigOp();
    const ins = await sys().query(
      `INSERT INTO app.uitrol_telegram_archief
         (user_id, ruimte, versie, run_id, voorstel_id, chat_id, message_thread_id, origineel_sha256, origineel_bytes, status, pogingen)
       VALUES ($1, 'technisch', $2, $3, $4, $5, $6, $7, $8, 'bezig', 1)
       ON CONFLICT (user_id, versie, origineel_sha256) DO UPDATE SET
         status = 'bezig', fout_code = '', pogingen = app.uitrol_telegram_archief.pogingen + 1,
         chat_id = EXCLUDED.chat_id, message_thread_id = EXCLUDED.message_thread_id, bijgewerkt_op = now()
       RETURNING id`,
      [invoer.eigenaarId, invoer.versie, invoer.runId || '', invoer.voorstelId || null, inst.chatId, inst.messageThreadId, origineelInfo.sha256, origineelInfo.bytes],
    );
    recordId = String(ins.rows[0].id);

    const encMeta = await versleutelArchiefBestand({
      bronPad: invoer.bestandPad,
      doelPad: tmpEnc,
      versie: invoer.versie,
      sleutel,
    });

    const envDeel = Number(process.env.UITROL_TELEGRAM_DEEL_BYTES || 0);
    const deelMax = invoer.deelBytes && invoer.deelBytes >= 256
      ? invoer.deelBytes
      : envDeel >= 256 ? envDeel : STANDAARD_DEEL_BYTES;

    const totaalDelen = Math.max(1, Math.ceil(encMeta.versleuteldBytes / deelMax));
    if (totaalDelen > 256) throw new TelegramArchiefFout('TELEGRAM_TE_VEEL_DELEN', 400);

    const delen: TelegramDeelInfo[] = [];
    for (let i = 0; i < totaalDelen; i++) {
      const start = i * deelMax;
      const end = Math.min(encMeta.versleuteldBytes - 1, start + deelMax - 1);
      const { sha256: deelSha, bytes: deelLen } = await sha256Deel(tmpEnc, start, end);
      const suffix = totaalDelen === 1 ? '' : `.part${String(i + 1).padStart(3, '0')}of${String(totaalDelen).padStart(3, '0')}`;
      const naam = `mijn-ruimte-${invoer.versie}.tar.gz.enc${suffix}`;
      const caption = [
        `Mijn Ruimte ${invoer.versie} · AES-256-GCM`,
        `Частина / Deel: ${i + 1}/${totaalDelen}`,
        `sha256(orig): ${encMeta.origineelSha256}`,
        `sha256(deel): ${deelSha}`,
      ].join('\n');
      const verzonden = await stuurDocumentVanBestand(
        bot.token,
        inst.chatId,
        inst.messageThreadId,
        naam,
        tmpEnc,
        start,
        end,
        deelLen,
        caption,
      );
      delen.push({
        deelNr: i + 1,
        totaalDelen,
        naam,
        sha256: deelSha,
        bytes: deelLen,
        messageId: verzonden.messageId,
        fileId: verzonden.fileId,
        fileUniqueId: verzonden.fileUniqueId,
      });
    }

    // Надсилаємо чистий службовий маніфест частин (без секретів) для автономного відновлення навіть лише з каналу Telegram.
    const manifestJson = JSON.stringify({
      formaat: 'mijn-ruimte-telegram-archief-v1',
      versie: invoer.versie,
      algoritme: 'AES-256-GCM',
      origineelSha256: encMeta.origineelSha256,
      origineelBytes: encMeta.origineelBytes,
      versleuteldSha256: encMeta.versleuteldSha256,
      versleuteldBytes: encMeta.versleuteldBytes,
      aantalDelen: totaalDelen,
      delen: delen.map((d) => ({ deelNr: d.deelNr, naam: d.naam, sha256: d.sha256, bytes: d.bytes, messageId: d.messageId, fileId: d.fileId })),
      aangemaaktOp: new Date().toISOString(),
    }, null, 2);
    const manRes = await stuurDocument(
      bot.token,
      inst.chatId,
      inst.messageThreadId,
      `mijn-ruimte-${invoer.versie}.manifest.json`,
      Buffer.from(manifestJson, 'utf8'),
      `Маніфест частин випуску / Deelmanifest van release ${invoer.versie} (${totaalDelen} д./d.)`,
    );

    await sys().query(
      `UPDATE app.uitrol_telegram_archief
          SET versleuteld_sha256 = $2, versleuteld_bytes = $3, aantal_delen = $4, delen = $5::jsonb,
              manifest_msg_id = $6, status = 'voltooid', fout_code = '', voltooid_op = now(), bijgewerkt_op = now()
        WHERE id = $1`,
      [recordId, encMeta.versleuteldSha256, encMeta.versleuteldBytes, totaalDelen, JSON.stringify(delen), manRes.messageId || null],
    );

    await schrijfBeheerAudit({
      actor: invoer.actor || null,
      eigenaar: invoer.eigenaarId,
      actie: 'owner.uitrol.telegram.gearchiveerd',
      doel: { soort: 'release', id: invoer.versie },
      details: { archiefId: recordId, aantalDelen: totaalDelen, origineelBytes: encMeta.origineelBytes, versleuteldBytes: encMeta.versleuteldBytes },
      service: 'admin',
    });

    await import('./uitrol-stroom').then((s) => s.stroomVastleggenVanExternBewijs(invoer.eigenaarId, {
      versie: invoer.versie,
      voorstelId: invoer.voorstelId || null,
      runId: invoer.runId || '',
      soort: 'telegram-archief',
      bron: 'uitrol-telegram',
      status: 'geslaagd',
      samenvattingUk: `Зашифрований архів (${totaalDelen} част., AES-256-GCM) збережено в Telegram.`,
      samenvattingNl: `Versleuteld archief (${totaalDelen} delen, AES-256-GCM) in Telegram bewaard.`,
      pakketSha256: encMeta.origineelSha256,
      bewijsData: {
        archiefId: recordId,
        aantalDelen: totaalDelen,
        origineelBytes: encMeta.origineelBytes,
        versleuteldSha256: encMeta.versleuteldSha256,
        algoritme: 'AES-256-GCM',
      },
    })).catch(() => undefined);

    return {
      ok: true,
      reedsBestaand: false,
      id: recordId,
      versie: invoer.versie,
      aantalDelen: totaalDelen,
      origineelSha256: encMeta.origineelSha256,
      versleuteldSha256: encMeta.versleuteldSha256,
      manifestMsgId: manRes.messageId,
    };
  } catch (e) {
    const code = e instanceof TelegramArchiefFout ? e.code : 'TELEGRAM_ARCHIEF_MISLUKT';
    if (recordId) {
      await sys().query(
        `UPDATE app.uitrol_telegram_archief SET status = 'mislukt', fout_code = $2, bijgewerkt_op = now() WHERE id = $1`,
        [recordId, code.slice(0, 80)],
      ).catch(() => undefined);
    }
    await schrijfBeheerAudit({
      actor: invoer.actor || null,
      eigenaar: invoer.eigenaarId,
      actie: 'owner.uitrol.telegram.mislukt',
      doel: { soort: 'release', id: invoer.versie },
      resultaat: 'failure',
      details: { code },
      service: 'admin',
    });
    throw e instanceof TelegramArchiefFout ? e : new TelegramArchiefFout(code, 502);
  } finally {
    archiefBezigGlobaal = false;
    lopendeArchieven.delete(lockKey);
    await rm(tmpEnc, { force: true }).catch(() => undefined);
  }
}

export async function archiveerRunNaarTelegram(eigenaar: { id: string; email?: string } | 'automatisch', runId: string, eigenaarIdHint?: string) {
  if (!RUN_ID_RE.test(runId)) throw new TelegramArchiefFout('RUN_ONGELDIG', 400);
  const { rows } = await sys().query(
    `SELECT id, versie, staat, pakket_pad, pakket_sha256, voorstel_id FROM app.uitrol_runs WHERE id = $1 LIMIT 1`,
    [runId],
  );
  const run = rows[0];
  if (!run) throw new TelegramArchiefFout('RUN_ONBEKEND', 404);
  if (run.staat !== 'klaar' || !VERSIE_RE.test(String(run.versie || ''))) throw new TelegramArchiefFout('RUN_NIET_KLAAR', 409);

  const dir = pakkettenDir();
  const verwachtPad = path.join(dir, `mijn-ruimte-${run.versie}.tar.gz`);
  const bestandPad = run.pakket_pad ? path.resolve(String(run.pakket_pad)) : verwachtPad;
  const eigenaarId = eigenaar === 'automatisch' ? (eigenaarIdHint || '') : eigenaar.id;
  if (!eigenaarId) throw new TelegramArchiefFout('GEEN_EIGENAAR', 400);

  return archiveerReleaseNaarTelegram({
    eigenaarId,
    actor: eigenaar === 'automatisch' ? null : eigenaar,
    versie: String(run.versie),
    bestandPad,
    runId: String(run.id),
    voorstelId: run.voorstel_id ? String(run.voorstel_id) : null,
  });
}

/** Викликається неблокувально після успішного встановлення випуску (backend/uitrol-runs.ts), суворо послідовно в черзі. */
export function naInstallatieTelegram(runId: string) {
  autoWachtrij = autoWachtrij
    .catch(() => undefined)
    .then(async () => {
      try {
        const r = await sys().query(
          `SELECT user_id FROM app.uitrol_telegram_instellingen WHERE actief = true AND chat_id <> '' ORDER BY bijgewerkt_op DESC LIMIT 1`,
        );
        const eigenaarId = r.rows[0]?.user_id ? String(r.rows[0].user_id) : '';
        if (!eigenaarId) return;
        await archiveerRunNaarTelegram('automatisch', runId, eigenaarId);
      } catch (err) {
        if (!isOntbrekendeTabel(err)) console.error('[uitrol-telegram] wachtrij:', (err as Error).message);
      }
    });
}

// ------------------------------------------------------------------------------------------------ перевірка обов’язковості перед схваленням
export async function controleerTelegramBlokkade(eigenaarId: string): Promise<
  | { geblokkeerd: false }
  | { geblokkeerd: true; code: 'TELEGRAM_ARCHIEF_VEREIST'; huidigeVersie: string; huidigeRunId: string }
> {
  let inst: TelegramArchiefInstellingen;
  try {
    inst = await telegramInstellingenVan(eigenaarId);
  } catch (e) {
    if (isOntbrekendeTabel(e)) return { geblokkeerd: false };
    throw e;
  }
  if (!inst.verplichtVoorInstallatie) return { geblokkeerd: false };

  // HERSTEL-001 (24.11.2026): перевіряємо саме фактично запущену на сервері версію (якщо відома з UITROL-VERSIE),
  // щоб відкочена чи застаріла версія в app.uitrol_runs не створювала глухого кута.
  const actiefVersie = String(releaseInfo().versie || '').trim();
  const runRows = VERSIE_RE.test(actiefVersie)
    ? (await sys().query(
      `SELECT id, versie, pakket_sha256, pakket_pad
         FROM app.uitrol_runs
        WHERE staat = 'klaar' AND versie = $1 AND pakket_sha256 <> ''
        ORDER BY geeindigd_op DESC NULLS LAST, gestart_op DESC
        LIMIT 1`,
      [actiefVersie],
    )).rows
    : (await sys().query(
      `SELECT id, versie, pakket_sha256, pakket_pad
         FROM app.uitrol_runs
        WHERE staat = 'klaar' AND versie <> '' AND pakket_sha256 <> ''
        ORDER BY geeindigd_op DESC NULLS LAST, gestart_op DESC
        LIMIT 1`,
    )).rows;
  const huidig = runRows[0];
  if (!huidig || !SHA256_RE.test(String(huidig.pakket_sha256 || ''))) {
    // Перше встановлення (або ще немає збереженого попереднього архіву на сервері) — блокувати нема чого.
    return { geblokkeerd: false };
  }
  const verwachtPad = path.join(pakkettenDir(), `mijn-ruimte-${String(huidig.versie)}.tar.gz`);
  const bestandPad = huidig.pakket_pad ? path.resolve(String(huidig.pakket_pad)) : verwachtPad;
  const bestandAanwezig = await stat(bestandPad).then((s) => s.isFile() && s.size > 0).catch(() => false);
  if (!bestandAanwezig) {
    // Файл архіву на диску вже відсутній — фізично заархівувати його неможливо, тому не блокуємо схвалення наглухо.
    return { geblokkeerd: false };
  }
  const { rows: archRows } = await sys().query(
    `SELECT id FROM app.uitrol_telegram_archief
      WHERE user_id = $1 AND versie = $2 AND origineel_sha256 = $3 AND status = 'voltooid'
      LIMIT 1`,
    [eigenaarId, String(huidig.versie), String(huidig.pakket_sha256)],
  );
  if (archRows[0]) return { geblokkeerd: false };

  return {
    geblokkeerd: true,
    code: 'TELEGRAM_ARCHIEF_VEREIST',
    huidigeVersie: String(huidig.versie),
    huidigeRunId: String(huidig.id),
  };
}

// ------------------------------------------------------------------------------------------------ відновлення й перевірка архіву з Telegram
const herstelLinks = new Map<string, { userId: string; archiefId: string; pad: string; naam: string; sha256: string; bytes: number; tot: number }>();

async function ruimOudeHerstelBestandenOp() {
  const nu = Date.now();
  for (const [k, v] of herstelLinks) {
    if (v.tot < nu) {
      herstelLinks.delete(k);
      await rm(v.pad, { force: true }).catch(() => undefined);
    }
  }
  const dir = telegramHerstelDir();
  const bestanden = await readdir(dir).catch(() => [] as string[]);
  for (const f of bestanden) {
    const p = path.join(dir, f);
    const s = await stat(p).catch(() => null);
    if (s && nu - s.mtimeMs > HERSTEL_TTL_MS * 3) await unlink(p).catch(() => undefined);
  }
}

export async function herstelTelegramArchief(eigenaar: { id: string; email?: string }, archiefId: string) {
  if (!UUID_RE.test(archiefId)) throw new TelegramArchiefFout('TELEGRAM_ARCHIEF_NIET_GEVONDEN', 404);
  const { rows } = await sys().query(
    `SELECT * FROM app.uitrol_telegram_archief WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [archiefId, eigenaar.id],
  );
  const rij = rows[0];
  if (!rij || rij.status !== 'voltooid') throw new TelegramArchiefFout('TELEGRAM_ARCHIEF_NIET_GEVONDEN', 404);

  const bot = await leesBotToken(eigenaar.id);
  if (!bot) throw new TelegramArchiefFout('TELEGRAM_CHAT_ONTBREEKT', 400);
  const sleutelStr = await leesArchiefSleutel(eigenaar.id);
  if (!sleutelStr) throw new TelegramArchiefFout('TELEGRAM_SLEUTEL_ONTBREEKT', 400);
  const sleutel = normaliseerArchiefSleutel(sleutelStr);

  const delen = (Array.isArray(rij.delen) ? rij.delen : []) as TelegramDeelInfo[];
  if (!delen.length) throw new TelegramArchiefFout('TELEGRAM_HERSTEL_INTEGRITEIT', 422);
  delen.sort((a, b) => a.deelNr - b.deelNr);

  await ruimOudeHerstelBestandenOp();
  await mkdir(telegramTmpDir(), { recursive: true, mode: 0o750 });
  await mkdir(telegramHerstelDir(), { recursive: true, mode: 0o750 });

  const downloadId = randomBytes(24).toString('base64url');
  const tmpEnc = path.join(telegramTmpDir(), `dec-${downloadId}.bin`);
  const herstelPad = path.join(telegramHerstelDir(), `${downloadId}.tar.gz`);

  try {
    // Потоково завантажуємо частини з Telegram і дописуємо на диск без буферизації цілого файла в пам'яті.
    await writeFile(tmpEnc, Buffer.alloc(0), { mode: 0o600 });
    for (const d of delen) {
      const fMeta = await tgApi<{ file_path?: string }>(bot.token, 'getFile', { file_id: d.fileId });
      const filePath = String(fMeta?.file_path || '');
      if (!filePath || filePath.includes('..')) throw new TelegramArchiefFout('TELEGRAM_HERSTEL_INTEGRITEIT', 422);
      const res = await doFetch(`${telegramBasis()}/file/bot${bot.token}/${filePath.replace(/^\/+/, '')}`, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new TelegramArchiefFout(`TELEGRAM_HTTP_${res.status}`, 502);
      const shaHash = createHash('sha256');
      let deelBytes = 0;
      const ws = createWriteStream(tmpEnc, { flags: 'a', mode: 0o600 });
      try {
        if (res.body) {
          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value || !value.byteLength) continue;
            const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
            deelBytes += chunk.length;
            shaHash.update(chunk);
            if (!ws.write(chunk)) {
              await new Promise<void>((resolve, reject) => {
                ws.once('drain', resolve);
                ws.once('error', reject);
              });
            }
          }
        } else {
          const buf = Buffer.from(await res.arrayBuffer());
          deelBytes = buf.length;
          shaHash.update(buf);
          ws.write(buf);
        }
        await new Promise<void>((resolve, reject) => {
          ws.end(() => resolve());
          ws.once('error', reject);
        });
      } catch (streamErr) {
        ws.destroy();
        throw streamErr;
      }
      if (shaHash.digest('hex') !== d.sha256 || deelBytes !== d.bytes) {
        throw new TelegramArchiefFout('TELEGRAM_HERSTEL_INTEGRITEIT', 422);
      }
    }

    const samengevoegd = await sha256Bestand(tmpEnc);
    if (samengevoegd.sha256 !== String(rij.versleuteld_sha256)) {
      throw new TelegramArchiefFout('TELEGRAM_HERSTEL_INTEGRITEIT', 422);
    }

    const hersteld = await ontsleutelArchiefBestand({
      bronPad: tmpEnc,
      doelPad: herstelPad,
      versie: String(rij.versie),
      verwachteOrigineelSha256: String(rij.origineel_sha256),
      sleutel,
    });

    const naam = `mijn-ruimte-${String(rij.versie)}.tar.gz`;
    herstelLinks.set(downloadId, {
      userId: eigenaar.id,
      archiefId,
      pad: herstelPad,
      naam,
      sha256: hersteld.origineelSha256,
      bytes: hersteld.origineelBytes,
      tot: Date.now() + HERSTEL_TTL_MS,
    });

    await schrijfBeheerAudit({
      actor: eigenaar,
      actie: 'owner.uitrol.telegram.hersteld',
      doel: { soort: 'release', id: String(rij.versie) },
      details: { archiefId, aantalDelen: delen.length, sha256: hersteld.origineelSha256 },
      service: 'admin',
    });

    return {
      ok: true,
      geverifieerd: true,
      downloadId,
      versie: String(rij.versie),
      naam,
      sha256: hersteld.origineelSha256,
      bytes: hersteld.origineelBytes,
      geldigSec: Math.floor(HERSTEL_TTL_MS / 1000),
    };
  } catch (e) {
    await rm(herstelPad, { force: true }).catch(() => undefined);
    throw e instanceof TelegramArchiefFout ? e : new TelegramArchiefFout('TELEGRAM_HERSTEL_INTEGRITEIT', 422);
  } finally {
    await rm(tmpEnc, { force: true }).catch(() => undefined);
  }
}

export async function gebruikHerstelDownload(eigenaarId: string, archiefId: string, downloadId: string) {
  const item = herstelLinks.get(downloadId);
  if (!item || item.userId !== eigenaarId || item.archiefId !== archiefId || item.tot < Date.now()) {
    return null;
  }
  herstelLinks.delete(downloadId);
  return item;
}

// ------------------------------------------------------------------------------------------------ повний цикл подій бота випусків (лише інформування та читання стану)
export type TelegramUitrolGebeurtenisSoort =
  | 'voorstel_klaar'
  | 'voorcontrole_mislukt'
  | 'goedgekeurd'
  | 'afgewezen'
  | 'gestopt'
  | 'geinstalleerd'
  | 'mislukt'
  | 'teruggedraaid';

export type TelegramUitrolGebeurtenis = {
  soort: TelegramUitrolGebeurtenisSoort;
  eigenaarId?: string;
  versie: string;
  auteur?: string;
  agent?: string;
  voorbereider?: string;
  commit?: string;
  wijzigingenUk?: string;
  wijzigingenNl?: string;
  migraties?: string[];
  drieFactoren?: { volledig?: boolean; aantalOk?: number; totaal?: number } | null;
  fouten?: string[];
  code?: string;
  reden?: string;
  door?: string;
  diagnose?: string[];
  methode?: string;
  omvatVersies?: string[];
};

const UPDATES_URL = () => `https://${SERVICE_HOSTS.admin || 'admin.tarasevych.com'}/updates`;
const schoonRegel = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Коротке двомовне пояснення до встановленого випуску з маніфесту (лише коли версія збігається з живою). */
function korteUitgaveUitleg(versie: string): string {
  const info = releaseInfo();
  if (!versie || String(info.versie || '') !== versie) return '';
  return bouwUitgaveUitleg(info).slice(0, 1800);
}

function bouwUitrolToetsenbord(metLaatste = true) {
  const acties: Array<{ text: string; callback_data: string }> = [
    { text: '📊 Оновити стан / Status', callback_data: 'ut:status' },
  ];
  if (metLaatste) acties.push({ text: '📦 Останній випуск / Laatste', callback_data: 'ut:laatste' });
  return {
    inline_keyboard: [
      [{ text: '🌐 Сторінка оновлень / Updates', url: UPDATES_URL() }],
      acties,
    ],
  };
}

function bouwGebeurtenisTekst(g: TelegramUitrolGebeurtenis): string {
  const versie = schoonRegel(g.versie, 40) || '—';
  const commit = schoonRegel(g.commit, 12);
  const auteur = schoonRegel(g.auteur, 80);
  const agent = schoonRegel(g.agent, 40);
  const voorbereider = schoonRegel(g.voorbereider, 80);
  const door = schoonRegel(g.door, 80);
  const reden = schoonRegel(g.reden, 360);
  const code = schoonRegel(g.code, 60);
  const methode = schoonRegel(g.methode, 40);
  const migraties = (g.migraties || []).map((m) => schoonRegel(m, 80)).filter(Boolean).slice(0, 8);
  const fouten = (g.fouten || []).map((f) => schoonRegel(f, 160)).filter(Boolean).slice(0, 8);
  const diagnose = (g.diagnose || []).map((d) => schoonRegel(d, 180)).filter(Boolean).slice(0, 4);
  const omvat = (g.omvatVersies || []).map((v) => schoonRegel(v, 30)).filter(Boolean).slice(0, 6);
  const wijzUk = schoonRegel(g.wijzigingenUk, 450);
  const wijzNl = schoonRegel(g.wijzigingenNl, 450);

  const regels: string[] = [];
  if (g.soort === 'voorstel_klaar') {
    regels.push(`📦 Новий випуск готовий до схвалення: ${versie}`);
    regels.push(`📦 Nieuwe uitgave klaar voor goedkeuring: ${versie}`);
    if (auteur || voorbereider) regels.push(`• Автор / Auteur: ${auteur || voorbereider}${voorbereider && auteur && voorbereider !== auteur ? ` (${voorbereider})` : ''}`);
    if (agent) regels.push(`• Агент / Agent: ${agent}`);
    if (commit) regels.push(`• Фіксація змін / Vastlegging: ${commit}`);
    if (g.drieFactoren) {
      const ok = Number(g.drieFactoren.aantalOk ?? 0);
      const tot = Number(g.drieFactoren.totaal ?? 3);
      regels.push(`• 3-чинникова довіра / Driefactorvertrouwen: ${ok}/${tot} (${g.drieFactoren.volledig ? 'синхронізовано / gesynchroniseerd' : 'потрібна звірка / controle nodig'})`);
    }
    if (migraties.length) regels.push(`• Міграції БД / DB-migraties (${migraties.length}): ${migraties.join(', ')}`);
    if (wijzUk) regels.push(`📝 Зміни (UK): ${wijzUk}`);
    if (wijzNl && wijzNl !== wijzUk) regels.push(`📝 Wijzigingen (NL): ${wijzNl}`);
    regels.push('🔐 Схвалення лише на сайті ключем доступу власника / Goedkeuring alleen op de site met toegangssleutel van de eigenaar.');
  } else if (g.soort === 'voorcontrole_mislukt') {
    regels.push(`⛔ Передпускову перевірку не пройдено: ${versie}`);
    regels.push(`⛔ Voorcontrole mislukt: ${versie}`);
    if (voorbereider || auteur) regels.push(`• Джерело / Bron: ${voorbereider || auteur}${agent ? ` (${agent})` : ''}`);
    if (commit) regels.push(`• Фіксація змін / Vastlegging: ${commit}`);
    if (fouten.length) {
      regels.push('• Причини / Oorzaken:');
      for (const f of fouten) regels.push(`  – ${f}`);
    }
  } else if (g.soort === 'goedgekeurd') {
    regels.push(`✅ Схвалено власником для встановлення: ${versie}`);
    regels.push(`✅ Goedgekeurd door eigenaar voor installatie: ${versie}`);
    if (door) regels.push(`• Схвалив / Goedgekeurd door: ${door}`);
    if (voorbereider) regels.push(`• Підготував / Voorbereid door: ${voorbereider}`);
    if (commit) regels.push(`• Фіксація змін / Vastlegging: ${commit}`);
    if (omvat.length) regels.push(`• Охоплює попередні / Omvat eerdere: ${omvat.join(', ')}`);
  } else if (g.soort === 'afgewezen') {
    regels.push(`🚫 Випуск відхилено: ${versie}`);
    regels.push(`🚫 Uitgave afgewezen: ${versie}`);
    if (door) regels.push(`• Відхилив / Afgewezen door: ${door}`);
    if (voorbereider) regels.push(`• Підготував / Voorbereid door: ${voorbereider}`);
    if (reden) regels.push(`• Причина / Reden: ${reden}`);
  } else if (g.soort === 'gestopt') {
    regels.push(`🛑 Встановлення зупинено: ${versie}`);
    regels.push(`🛑 Installatie gestopt: ${versie}`);
    if (door) regels.push(`• Зупинив / Gestopt door: ${door}`);
    if (code) regels.push(`• Етап / Fase: ${code}`);
    if (reden) regels.push(`• Причина / Reden: ${reden}`);
  } else if (g.soort === 'geinstalleerd') {
    regels.push(`🎉 Випуск успішно встановлено: ${versie}`);
    regels.push(`🎉 Uitgave succesvol geïnstalleerd: ${versie}`);
    if (methode) regels.push(`• Спосіб / Methode: ${methode}`);
    if (door) regels.push(`• Виконавець / Uitvoerder: ${door}`);
    if (commit) regels.push(`• Фіксація змін / Vastlegging: ${commit}`);
    const uitleg = korteUitgaveUitleg(versie);
    if (uitleg) regels.push('', uitleg);
  } else if (g.soort === 'mislukt') {
    regels.push(`❌ Збій або переривання встановлення: ${versie}`);
    regels.push(`❌ Installatie mislukt of afgebroken: ${versie}`);
    if (code) regels.push(`• Код / Code: ${code}`);
    if (methode) regels.push(`• Спосіб / Methode: ${methode}`);
    if (reden) regels.push(`• Причина / Reden: ${reden}`);
    if (diagnose.length) {
      regels.push('• Фрагмент діагностики / Diagnosefragment:');
      for (const d of diagnose) regels.push(`  | ${d}`);
    }
  } else {
    regels.push(`↩️ Виконано відкат або вибіркове відкликання: ${versie}`);
    regels.push(`↩️ Terugdraaiing of selectieve intrekking uitgevoerd: ${versie}`);
    if (methode) regels.push(`• Режим / Modus: ${methode}`);
    if (door) regels.push(`• Ініціатор / Initiatiefnemer: ${door}`);
    if (code) regels.push(`• Код / Code: ${code}`);
    if (reden) regels.push(`• Причина / Reden: ${reden}`);
  }
  return regels.join('\n').slice(0, 3900);
}

/**
 * Надсилає двомовне повідомлення про подію життєвого циклу випуску в налаштовану групу/тему Telegram.
 * Працює лише коли бот налаштований і активний; ніколи не кидає помилку і не зупиняє основний потік.
 */
export async function stuurTelegramUitrolGebeurtenis(
  gebeurtenis: TelegramUitrolGebeurtenis,
): Promise<{ verzonden: boolean; reden?: string }> {
  try {
    let eigenaarId = String(gebeurtenis.eigenaarId || '').trim();
    let inst: TelegramArchiefInstellingen | null = null;
    if (eigenaarId) {
      inst = await telegramInstellingenVan(eigenaarId);
    }
    if (!inst || !inst.actief || !inst.chatId) {
      const r = await sys().query(
        `SELECT user_id, chat_id, message_thread_id, actief, verplicht_voor_installatie,
                laatst_getest_op, laatste_test_ok, laatste_test_fout, bijgewerkt_op
           FROM app.uitrol_telegram_instellingen
          WHERE actief = true AND chat_id <> ''
          ORDER BY bijgewerkt_op DESC
          LIMIT 1`,
      ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
      const row = r.rows[0];
      if (!row) return { verzonden: false, reden: 'niet-actief' };
      eigenaarId = String(row.user_id || '');
      inst = {
        chatId: String(row.chat_id || ''),
        messageThreadId: row.message_thread_id != null ? Number(row.message_thread_id) : null,
        actief: Boolean(row.actief),
        verplichtVoorInstallatie: Boolean(row.verplicht_voor_installatie),
        laatstGetestOp: '',
        laatsteTestOk: Boolean(row.laatste_test_ok),
        laatsteTestFout: '',
        bijgewerktOp: '',
      };
    }
    if (!eigenaarId || !inst.actief || !inst.chatId) return { verzonden: false, reden: 'niet-actief' };
    const bot = await leesBotToken(eigenaarId);
    if (!bot?.token) return { verzonden: false, reden: 'geen-bot' };

    const metLaatste = ['voorstel_klaar', 'goedgekeurd', 'geinstalleerd', 'teruggedraaid'].includes(gebeurtenis.soort);
    await tgApi(bot.token, 'sendMessage', {
      chat_id: inst.chatId,
      ...(inst.messageThreadId != null ? { message_thread_id: inst.messageThreadId } : {}),
      disable_notification: gebeurtenis.soort === 'goedgekeurd' || gebeurtenis.soort === 'geinstalleerd',
      text: bouwGebeurtenisTekst(gebeurtenis),
      reply_markup: bouwUitrolToetsenbord(metLaatste),
    });
    return { verzonden: true };
  } catch (err) {
    if (!isOntbrekendeTabel(err)) {
      console.error('[uitrol-telegram] gebeurtenis:', (err as Error).message);
    }
    return { verzonden: false, reden: 'fout' };
  }
}

// ------------------------------------------------------------------------------------------------ приймач команд бота випусків (/status, /laatste, /help і кнопки читання)
export async function telegramWebhookInstellen(
  eigenaar: { id: string; email?: string },
  invoer?: { vernieuwGeheim?: boolean },
) {
  const bot = await leesBotToken(eigenaar.id);
  if (!bot) throw new TelegramArchiefFout('TELEGRAM_CHAT_ONTBREEKT', 400);

  let secret = invoer?.vernieuwGeheim ? null : await leesTelegramWebhookGeheim(eigenaar.id);
  if (!secret || secret.length < 16) {
    secret = randomBytes(32).toString('hex');
    await ownerVaultBewarenIntern(
      eigenaar.id,
      VAULT_TELEGRAM_WEBHOOK_GEHEIM_NAAM,
      'webhook',
      'Uitrol-Telegram-webhook',
      secret,
    );
  }

  const webhookUrl = telegramWebhookUrl();
  await tgApi(bot.token, 'setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  });

  // Меню команд у Telegram: необов’язковий крок, помилки не блокують активацію приймача.
  const opdrachten = [
    { command: 'status', description: 'Стан випусків / Releasestatus' },
    { command: 'laatste', description: 'Останній випуск / Laatste uitgave' },
    { command: 'help', description: 'Довідка / Help' },
  ];
  for (const scope of [undefined, { type: 'all_group_chats' }] as const) {
    await tgApi(bot.token, 'setMyCommands', { commands: opdrachten, ...(scope ? { scope } : {}) }).catch(() => undefined);
  }

  await schrijfBeheerAudit({
    actor: eigenaar,
    actie: 'owner.uitrol.telegram.webhook',
    doel: { soort: 'telegram', id: webhookUrl },
    details: { vernieuwd: Boolean(invoer?.vernieuwGeheim) },
    service: 'admin',
  });

  return {
    ok: true,
    webhookUrl,
    webhookGeheimAanwezig: true,
  };
}

function bouwHelpTekst(): string {
  return [
    'Mijn Ruimte — бот випусків та архіву (лише читання):',
    '/status — активна версія сайту, черга схвалення та стан останнього архіву в Telegram',
    '/laatste — подробиці останнього випуску й черги',
    '/help — перелік безпечних команд',
    'Усі схвалення й установлення виконуються виключно через сайт із ключем доступу власника.',
    '',
    'Mijn Ruimte — release- en archiefbot (alleen lezen):',
    '/status — actieve siteversie, goedkeuringswachtrij en laatste Telegram-archief',
    '/laatste — details van de laatste uitgave en wachtrij',
    '/help — overzicht van veilige opdrachten',
    'Goedkeuren en installeren gebeurt uitsluitend op de site met de passkey van de eigenaar.',
  ].join('\n');
}

async function bouwStatusOverzicht(eigenaarId: string) {
  const actieveVersie = releaseInfo().versie || '—';
  const wachtQ = await sys().query(
    `SELECT count(*)::int AS aantal FROM app.uitrol_voorstellen WHERE status = 'wacht-op-goedkeuring'`,
  );
  const wachtAantal = Number(wachtQ.rows[0]?.aantal || 0);
  const archQ = await sys().query(
    `SELECT versie, status, voltooid_op, aangemaakt_op, aantal_delen
       FROM app.uitrol_telegram_archief
      WHERE user_id = $1
      ORDER BY aangemaakt_op DESC
      LIMIT 1`,
    [eigenaarId],
  );
  const laatst = archQ.rows[0];
  const laatstTijd = laatst?.voltooid_op
    ? new Date(laatst.voltooid_op).toISOString()
    : laatst?.aangemaakt_op
      ? new Date(laatst.aangemaakt_op).toISOString()
      : '—';
  const laatstInfoUk = laatst
    ? `${String(laatst.versie)} (${String(laatst.status)}, ${Number(laatst.aantal_delen || 1)} част., ${laatstTijd})`
    : 'ще не створено';
  const laatstInfoNl = laatst
    ? `${String(laatst.versie)} (${String(laatst.status)}, ${Number(laatst.aantal_delen || 1)} delen, ${laatstTijd})`
    : 'nog geen';

  const statusTekst = [
    'Mijn Ruimte · Стан випусків / Releasestatus',
    `• Активна версія / Actieve versie: ${actieveVersie}`,
    `• Очікує схвалення / Wacht op goedkeuring: ${wachtAantal}`,
    `• Останній архів Telegram / Laatste Telegram-archief: ${laatstInfoUk} | ${laatstInfoNl}`,
  ].join('\n');

  return { actieveVersie, wachtAantal, statusTekst };
}

async function bouwLaatsteTekst(): Promise<string> {
  const runQ = await sys().query(
    `SELECT versie, methode, staat, code, bron_commit, gestart_op, geeindigd_op
       FROM app.uitrol_runs
      ORDER BY gestart_op DESC
      LIMIT 1`,
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
  const voorstelQ = await sys().query(
    `SELECT versie, status, voorbereider_label, bron_commit, aangemaakt_op
       FROM app.uitrol_voorstellen
      ORDER BY aangemaakt_op DESC
      LIMIT 1`,
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
  const r = runQ.rows[0];
  const v = voorstelQ.rows[0];
  const lijnen = ['Mijn Ruimte · Останній випуск / Laatste uitgave'];
  if (r) {
    const tijd = r.geeindigd_op ? new Date(String(r.geeindigd_op)).toISOString() : r.gestart_op ? new Date(String(r.gestart_op)).toISOString() : '—';
    lijnen.push(`• Останній запуск / Laatste run: ${String(r.versie || '—')} · ${String(r.staat || '—')} (${String(r.methode || '—')}${r.code ? `, ${String(r.code)}` : ''}) · ${tijd}`);
    if (r.bron_commit) lijnen.push(`• Фіксація змін / Vastlegging: ${String(r.bron_commit).slice(0, 12)}`);
  } else {
    lijnen.push('• Останній запуск / Laatste run: ще немає записів / nog geen gegevens');
  }
  if (v) {
    lijnen.push(`• Остання пропозиція / Laatste voorstel: ${String(v.versie || '—')} · ${String(v.status || '—')} (${schoonRegel(v.voorbereider_label, 60) || '—'})`);
  }
  lijnen.push('🔐 Управління виключно на сайті з ключем доступу / Beheer uitsluitend op de site met toegangssleutel.');
  return lijnen.join('\n');
}

/**
 * Публікує в погоджену групу/тему повне двомовне пояснення поточного встановленого випуску
 * (назва, підсумок, зміни, виправлення, обмеження, настанови) з UITROL-MANIFEST.json.
 * Нічого не змінює на сервері — лише надсилає текст у Telegram.
 */
export async function publiceerUitgaveUitleg(eigenaar: { id: string; email?: string }) {
  const inst = await telegramInstellingenVan(eigenaar.id);
  const bot = await leesBotToken(eigenaar.id);
  if (!bot || !inst.chatId) throw new TelegramArchiefFout('TELEGRAM_CHAT_ONTBREEKT', 400);

  const info = releaseInfo();
  const tekst = bouwUitgaveUitleg(info);
  if (!tekst) throw new TelegramArchiefFout('UITGAVE_UITLEG_ONTBREEKT', 400);

  const res = await tgApi<{ message_id?: number }>(bot.token, 'sendMessage', {
    chat_id: inst.chatId,
    ...(inst.messageThreadId ? { message_thread_id: inst.messageThreadId } : {}),
    disable_notification: true,
    text: tekst,
    reply_markup: bouwUitrolToetsenbord(true),
  });

  await schrijfBeheerAudit({
    actor: eigenaar,
    actie: 'owner.uitrol.telegram.gepubliceerd',
    doel: { soort: 'release', id: String(info.versie || '—') },
    details: { messageId: Number(res?.message_id || 0), tekens: tekst.length, thread: inst.messageThreadId },
    service: 'admin',
  });

  return {
    ok: true,
    versie: String(info.versie || ''),
    messageId: Number(res?.message_id || 0),
    tekens: tekst.length,
  };
}

export async function verwerkTelegramUitrolWebhook(invoer: {
  secretHeader: string;
  rauwLichaam: string;
}): Promise<{ ok: true; resultaat: Record<string, unknown> } | { ok: false; fout: string; status: number }> {
  const secretHeader = String(invoer.secretHeader || '').trim();
  if (!secretHeader) return { ok: false, fout: 'TELEGRAM_WEBHOOK_ONGELDIG', status: 401 };
  if (Buffer.byteLength(invoer.rauwLichaam, 'utf8') > 256 * 1024) {
    return { ok: false, fout: 'WEBHOOK_TE_GROOT', status: 413 };
  }

  let payload: any;
  try {
    payload = JSON.parse(invoer.rauwLichaam);
  } catch {
    return { ok: false, fout: 'TELEGRAM_WEBHOOK_ONGELDIG', status: 400 };
  }

  const { rows: instRows } = await sys().query(
    `SELECT user_id, chat_id, message_thread_id, actief
       FROM app.uitrol_telegram_instellingen
      WHERE chat_id <> ''
      ORDER BY bijgewerkt_op DESC
      LIMIT 5`,
  );
  if (!instRows.length) return { ok: false, fout: 'TELEGRAM_WEBHOOK_ONGELDIG', status: 401 };

  let matchedInst: any = null;
  for (const r of instRows) {
    const geheim = await leesTelegramWebhookGeheim(String(r.user_id));
    if (!geheim) continue;
    const a = Buffer.from(secretHeader, 'utf8');
    const b = Buffer.from(geheim, 'utf8');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      matchedInst = r;
      break;
    }
  }
  if (!matchedInst) return { ok: false, fout: 'TELEGRAM_WEBHOOK_ONGELDIG', status: 401 };

  const eigenaarId = String(matchedInst.user_id);
  const updateIdRaw = Number(payload?.update_id);
  if (!Number.isSafeInteger(updateIdRaw) || updateIdRaw < 0) {
    return { ok: false, fout: 'TELEGRAM_WEBHOOK_ONGELDIG', status: 400 };
  }

  const bronChatId = String(payload?.message?.chat?.id ?? payload?.callback_query?.message?.chat?.id ?? '').slice(0, 80);

  // Атомарна повторостійкість за update_id: повторний виклик Telegram не виконує команду вдруге.
  const ins = await sys().query(
    `INSERT INTO app.uitrol_telegram_updates (update_id, user_id, ruimte, chat_id, uitkomst)
     VALUES ($1, $2, 'technisch', $3, 'ontvangen')
     ON CONFLICT (update_id) DO NOTHING
     RETURNING update_id`,
    [updateIdRaw, eigenaarId, bronChatId],
  );
  if (ins.rowCount === 0) {
    return { ok: true, resultaat: { ok: true, herhaling: true } };
  }

  const markeer = async (uitkomst: string) => {
    await sys().query(
      `UPDATE app.uitrol_telegram_updates SET uitkomst = $2 WHERE update_id = $1`,
      [updateIdRaw, uitkomst.slice(0, 60)],
    ).catch(() => undefined);
  };

  const doelChat = String(matchedInst.chat_id || '').trim();
  const threadOpt = matchedInst.message_thread_id != null ? { message_thread_id: Number(matchedInst.message_thread_id) } : {};

  const controleerChatEnTopic = (chatObj: any, msgThreadId: unknown): 'ok' | 'ander-chat-genegeerd' | 'andere-topic-genegeerd' => {
    const cid = String(chatObj?.id ?? '');
    const uname = chatObj?.username ? `@${String(chatObj.username).toLowerCase()}` : '';
    const zelfdeChat = cid === doelChat || (doelChat.startsWith('@') && uname === doelChat.toLowerCase());
    if (!zelfdeChat) return 'ander-chat-genegeerd';
    if (matchedInst.message_thread_id != null && Number(msgThreadId) !== Number(matchedInst.message_thread_id)) {
      return 'andere-topic-genegeerd';
    }
    return 'ok';
  };

  // Обробка вбудованих кнопок читання стану (ut:status, ut:laatste, ut:help) — жодного обходу ключа доступу!
  const cq = payload?.callback_query;
  if (cq) {
    const cqId = String(cq.id || '').trim();
    const cqMsg = cq.message;
    if (!cqId || cq?.from?.is_bot === true || cqMsg?.chat?.id === undefined) {
      await markeer('genegeerd-zonder-bericht');
      return { ok: true, resultaat: { ok: true, overgeslagen: true } };
    }
    const check = controleerChatEnTopic(cqMsg.chat, cqMsg.message_thread_id);
    if (check !== 'ok') {
      await markeer(check);
      return { ok: true, resultaat: { ok: true, overgeslagen: true } };
    }
    const knop = String(cq.data || '').trim();
    if (knop !== 'ut:status' && knop !== 'ut:laatste' && knop !== 'ut:help') {
      await markeer('onbekende-knop');
      return { ok: true, resultaat: { ok: true, overgeslagen: true } };
    }
    const bot = await leesBotToken(eigenaarId);
    if (!bot) {
      await markeer('geen-bottoken');
      return { ok: true, resultaat: { ok: true, overgeslagen: true } };
    }
    await tgApi(bot.token, 'answerCallbackQuery', { callback_query_id: cqId }).catch(() => undefined);
    if (knop === 'ut:help') {
      await tgApi(bot.token, 'sendMessage', {
        chat_id: doelChat,
        ...threadOpt,
        disable_notification: true,
        text: bouwHelpTekst(),
        reply_markup: bouwUitrolToetsenbord(true),
      });
      await markeer('callback-help');
      return { ok: true, resultaat: { ok: true, callback: 'ut:help' } };
    }
    if (knop === 'ut:laatste') {
      const tekstLaatste = await bouwLaatsteTekst();
      await tgApi(bot.token, 'sendMessage', {
        chat_id: doelChat,
        ...threadOpt,
        disable_notification: true,
        text: tekstLaatste,
        reply_markup: bouwUitrolToetsenbord(false),
      });
      await markeer('callback-laatste');
      return { ok: true, resultaat: { ok: true, callback: 'ut:laatste' } };
    }
    const { actieveVersie, wachtAantal, statusTekst } = await bouwStatusOverzicht(eigenaarId);
    await tgApi(bot.token, 'sendMessage', {
      chat_id: doelChat,
      ...threadOpt,
      disable_notification: true,
      text: statusTekst,
      reply_markup: bouwUitrolToetsenbord(true),
    });
    await markeer('callback-status');
    return { ok: true, resultaat: { ok: true, callback: 'ut:status', actieveVersie, wachtAantal } };
  }

  const msg = payload?.message;
  if (!msg || msg?.from?.is_bot === true || msg?.chat?.id === undefined) {
    await markeer('genegeerd-zonder-bericht');
    return { ok: true, resultaat: { ok: true, overgeslagen: true } };
  }

  const checkMsg = controleerChatEnTopic(msg.chat, msg.message_thread_id);
  if (checkMsg !== 'ok') {
    await markeer(checkMsg);
    return { ok: true, resultaat: { ok: true, overgeslagen: true } };
  }

  const tekst = String(msg.text || '').trim();
  const eerste = tekst.split(/\s+/)[0] || '';
  const cmdMatch = /^\/(status|laatste|help|start)(?:@[A-Za-z0-9_]{3,64})?$/i.exec(eerste);
  if (!cmdMatch) {
    await markeer('geen-commando');
    return { ok: true, resultaat: { ok: true, overgeslagen: true } };
  }

  const commando = cmdMatch[1].toLowerCase();
  const bot = await leesBotToken(eigenaarId);
  if (!bot) {
    await markeer('geen-bottoken');
    return { ok: true, resultaat: { ok: true, overgeslagen: true } };
  }

  if (commando === 'help' || commando === 'start') {
    await tgApi(bot.token, 'sendMessage', {
      chat_id: doelChat,
      ...threadOpt,
      disable_notification: true,
      text: bouwHelpTekst(),
      reply_markup: bouwUitrolToetsenbord(true),
    });
    await markeer('help-beantwoord');
    return { ok: true, resultaat: { ok: true, commando: 'help' } };
  }

  if (commando === 'laatste') {
    const tekstLaatste = await bouwLaatsteTekst();
    await tgApi(bot.token, 'sendMessage', {
      chat_id: doelChat,
      ...threadOpt,
      disable_notification: true,
      text: tekstLaatste,
      reply_markup: bouwUitrolToetsenbord(false),
    });
    await markeer('laatste-beantwoord');
    return { ok: true, resultaat: { ok: true, commando: 'laatste' } };
  }

  // Команда /status: суто несекретний огляд стану.
  const { actieveVersie, wachtAantal, statusTekst } = await bouwStatusOverzicht(eigenaarId);
  await tgApi(bot.token, 'sendMessage', {
    chat_id: doelChat,
    ...threadOpt,
    disable_notification: true,
    text: statusTekst,
    reply_markup: bouwUitrolToetsenbord(true),
  });
  await markeer('status-beantwoord');
  return { ok: true, resultaat: { ok: true, commando: 'status', actieveVersie, wachtAantal } };
}

// ------------------------------------------------------------------------------------------------ маршрути HTTP
type Ctx = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
type SessionOk = { user: { id: string; email: string; role?: string }; service?: string };
type Resp = Awaited<ReturnType<RouterMiddleware>>;
export type TelegramRouteDeps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
  isEigenaar: (u: SessionOk['user']) => boolean;
  sterkeStapOp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null>;
  koppelingVlagAan?: (user: { id: string; email?: string; role?: string }) => Promise<boolean>;
};
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;

export function uitrolTelegramRoutes(deps: TelegramRouteDeps): Record<string, RouterMiddleware[]> {
  const eigenaar = (opts: { sterk?: boolean }, run: (ctx: Ctx, auth: SessionOk) => Promise<Resp | unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    if (!deps.isEigenaar(auth.user)) return error('OWNER_REQUIRED', 403);
    if (opts.sterk) {
      if (!deps.sterkeStapOp) return error('STEP_UP_STRONG_REQUIRED', 403);
      const su = await deps.sterkeStapOp(ctx, auth);
      if (su) return su;
    }
    try {
      const uit = await run(ctx, auth);
      return uit && typeof uit === 'object' && 'statusCode' in (uit as object) ? uit as Resp : json(uit);
    } catch (e) {
      if (e instanceof TelegramArchiefFout) return error(e.code, e.status >= 400 && e.status < 500 ? e.status : 400);
      console.error('[uitrol-telegram] route:', (e as Error).message);
      return error('TELEGRAM_BOT_FOUT', 500);
    }
  }) as RouterMiddleware;
  const wie = (a: SessionOk) => ({ id: a.user.id, email: a.user.email });

  return {
    'POST /api/owner/uitrol/telegram/stand': [eigenaar({}, async (_c, a) => telegramStand(a.user.id))],
    'POST /api/owner/uitrol/telegram/instellingen': [eigenaar({ sterk: true }, async (c, a) => {
      const b = lichaam(c.body);
      return telegramInstellingenOpslaan(wie(a), {
        chatId: b.chatId,
        messageThreadId: b.messageThreadId,
        actief: b.actief,
        verplichtVoorInstallatie: b.verplichtVoorInstallatie,
        botToken: b.botToken,
        archiefSleutel: b.archiefSleutel,
        genereerSleutel: b.genereerSleutel,
      });
    })],
    'POST /api/owner/uitrol/telegram/testen': [eigenaar({ sterk: true }, async (_c, a) => {
      const limiet = await rateLimit(`uitrol-telegram-test:${a.user.id}`, 10, 3600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      const metProefDocument = deps.koppelingVlagAan ? await deps.koppelingVlagAan(a.user).catch(() => false) : true;
      return telegramVerbindingTesten(wie(a), { metProefDocument });
    })],
    'POST /api/owner/uitrol/telegram/webhook-instellen': [eigenaar({ sterk: true }, async (c, a) => {
      const limiet = await rateLimit(`uitrol-telegram-wh-setup:${a.user.id}`, 10, 3600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      const b = lichaam(c.body);
      return telegramWebhookInstellen(wie(a), { vernieuwGeheim: b.vernieuwGeheim === true });
    })],
    'POST /api/owner/uitrol/telegram/archiveren': [eigenaar({ sterk: true }, async (c, a) => {
      const limiet = await rateLimit(`uitrol-telegram-archief:${a.user.id}`, 15, 3600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      const b = lichaam(c.body);
      return archiveerRunNaarTelegram(wie(a), String(b.runId || b.run || ''));
    })],
    'POST /api/owner/uitrol/telegram/publiceren': [eigenaar({ sterk: true }, async (_c, a) => {
      const limiet = await rateLimit(`uitrol-telegram-publiceer:${a.user.id}`, 10, 3600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      return publiceerUitgaveUitleg(wie(a));
    })],
    'POST /api/owner/uitrol/telegram/archief/:id/herstel': [eigenaar({ sterk: true }, async (c, a) => {
      const limiet = await rateLimit(`uitrol-telegram-herstel:${a.user.id}`, 10, 3600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      return herstelTelegramArchief(wie(a), String(c.params?.id || ''));
    })],
    'POST /api/owner/uitrol/telegram/archief/:id/download': [eigenaar({}, async (c, a) => {
      const b = lichaam(c.body);
      const item = await gebruikHerstelDownload(a.user.id, String(c.params?.id || ''), String(b.downloadId || ''));
      if (!item) return error('DOWNLOAD_LINK_ONGELDIG', 403);
      const r = fileDownload(item.pad, item.naam, 'application/gzip');
      r.headers = { ...r.headers, 'X-Pakket-Sha256': item.sha256 };
      return r;
    })],
    'POST /api/uitrol/telegram/webhook': [async (raw) => {
      const ctx = raw as unknown as Ctx;
      if (!(await rateLimit('uitrol-tg-webhook', 180, 60, { failClosed: false })).ok) {
        return error('RATE_LIMITED', 429);
      }
      const rauw = typeof ctx.event?.body === 'string'
        ? ctx.event.body
        : typeof ctx.event?.rawBody === 'string'
          ? ctx.event.rawBody
          : typeof ctx.body === 'string'
            ? ctx.body
            : JSON.stringify(ctx.body || {});
      const headers = (ctx.event?.headers || {}) as Record<string, unknown>;
      const kop = (naam: string) => {
        for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === naam) return String(v ?? '');
        return '';
      };
      const uit = await verwerkTelegramUitrolWebhook({
        secretHeader: kop('x-telegram-bot-api-secret-token'),
        rauwLichaam: rauw,
      });
      if (!uit.ok) return error(uit.fout, uit.status);
      return json(uit.resultaat);
    }],
  };
}
