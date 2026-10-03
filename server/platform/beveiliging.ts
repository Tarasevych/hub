// Beveiligingsbouwstenen voor de zelf-gehoste server (fase B):
//  - rate limiting per bucket (Postgres-tabel app.rate_limits, vaste vensters, overleeft herstart);
//  - login-lockout per onderwerp (app.login_lockouts) met oplopende blokkadeduur;
//  - sleutels/pepper uit omgevingsvariabelen (nooit hardcoded);
//  - eigenaar (OWNER_EMAIL) uit de omgeving.
// Alles faalt "dicht": ontbreekt een sleutel, dan weigert de functie die hem nodig heeft.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { getPool } from './pg';

// ---------------------------------------------------------------------------------------------
// Eigenaar
// ---------------------------------------------------------------------------------------------
/** E-mailadres van de eigenaar uit OWNER_EMAIL (kleine letters). Leeg = niemand is eigenaar. */
export const ownerEmail = () => String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
export const isOwnerEmail = (email: unknown) => {
  const owner = ownerEmail();
  return !!owner && String(email || '').trim().toLowerCase() === owner;
};

// ---------------------------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------------------------
export type RateLimitResult = { ok: boolean; hits: number; limit: number; retryAfter: number };

/**
 * Tel één hit in `bucket` binnen een vast venster van `windowSeconds`. `ok=false` zodra het aantal
 * hits `limit` overschrijdt. Bij een databasefout wordt het verzoek NIET geblokkeerd (beschikbaarheid),
 * maar wel gelogd; de in-memory limiet in server/start.ts blijft dan de vangrail.
 */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const start = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  try {
    const result = await getPool().query(
      `INSERT INTO app.rate_limits (bucket, window_start, hits) VALUES ($1, $2, 1)
       ON CONFLICT (bucket, window_start) DO UPDATE SET hits = app.rate_limits.hits + 1
       RETURNING hits`,
      [bucket.slice(0, 300), start],
    );
    const hits = Number(result.rows[0]?.hits || 0);
    const retryAfter = Math.max(1, Math.ceil((start.getTime() + windowMs - Date.now()) / 1000));
    return { ok: hits <= limit, hits, limit, retryAfter };
  } catch (err) {
    console.error('[rate-limit] databasefout, verzoek doorgelaten:', (err as Error).message);
    return { ok: true, hits: 0, limit, retryAfter: 0 };
  }
}

// ---------------------------------------------------------------------------------------------
// Login-lockout
// ---------------------------------------------------------------------------------------------
const LOCKOUT_THRESHOLD = 5; // mislukte pogingen voordat de eerste blokkade ingaat
const LOCKOUT_BASE_SECONDS = 15 * 60; // eerste blokkade 15 min, daarna verdubbelend
const LOCKOUT_MAX_SECONDS = 24 * 3600;

/** Resterende blokkadeduur in seconden (0 = niet geblokkeerd). */
export async function lockoutRemaining(subject: string): Promise<number> {
  const result = await getPool().query('SELECT locked_until FROM app.login_lockouts WHERE subject = $1', [subject]);
  const until = result.rows[0]?.locked_until as Date | null | undefined;
  return until ? Math.max(0, Math.ceil((until.getTime() - Date.now()) / 1000)) : 0;
}

/** Registreer een mislukte poging; geeft de (eventueel nieuwe) blokkadeduur in seconden terug. */
export async function registerLoginFailure(subject: string): Promise<number> {
  const result = await getPool().query(
    `INSERT INTO app.login_lockouts (subject, failures, updated_at) VALUES ($1, 1, now())
     ON CONFLICT (subject) DO UPDATE SET failures = app.login_lockouts.failures + 1, updated_at = now()
     RETURNING failures`,
    [subject],
  );
  const failures = Number(result.rows[0]?.failures || 0);
  if (failures < LOCKOUT_THRESHOLD) return 0;
  const seconds = Math.min(LOCKOUT_MAX_SECONDS, LOCKOUT_BASE_SECONDS * 2 ** Math.max(0, failures - LOCKOUT_THRESHOLD));
  await getPool().query(`UPDATE app.login_lockouts SET locked_until = now() + ($2 || ' seconds')::interval WHERE subject = $1`, [subject, String(seconds)]);
  return seconds;
}

export async function clearLoginFailures(subject: string): Promise<void> {
  await getPool().query('DELETE FROM app.login_lockouts WHERE subject = $1', [subject]);
}

// ---------------------------------------------------------------------------------------------
// Sleutels uit de omgeving
// ---------------------------------------------------------------------------------------------
/** 32-byte sleutel uit env (64 hex-tekens of base64/base64url van 32 bytes). Anders null. */
export function envKey32(name: string): Buffer | null {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return null;
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return decoded.length === 32 ? decoded : null;
}

/** AES-256-GCM-envelop `v1.<iv>.<ciphertext>.<tag>` (base64url), gebonden aan `aad`. */
export function sealWithEnvKey(keyName: string, plaintext: string, aad: string): string {
  const key = envKey32(keyName);
  if (!key) throw new Error(`SLEUTEL_ONTBREEKT:${keyName}`);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), ct.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

export function openWithEnvKey(keyName: string, envelope: string, aad: string): string {
  const key = envKey32(keyName);
  if (!key) throw new Error(`SLEUTEL_ONTBREEKT:${keyName}`);
  const [version, iv, ct, tag] = String(envelope || '').split('.');
  if (version !== 'v1' || !iv || !ct || !tag) throw new Error('ENVELOP_ONGELDIG');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

/** HMAC-SHA256 met een geheime pepper uit env (minstens 32 tekens). Gooit als die ontbreekt. */
export function pepperedHash(pepperName: string, value: string): string {
  const pepper = String(process.env[pepperName] || '').trim();
  if (pepper.length < 32) throw new Error(`SLEUTEL_ONTBREEKT:${pepperName}`);
  return createHmac('sha256', pepper).update(value).digest('hex');
}
