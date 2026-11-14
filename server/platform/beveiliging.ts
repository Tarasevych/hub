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
 * hits `limit` overschrijdt.
 * Bij een databasefout:
 *  - standaard ("open"): verzoek doorgelaten (beschikbaarheid), wel gelogd; de in-memory limiet in
 *    server/start.ts blijft dan de vangrail;
 *  - met `{ failClosed: true }` (gevoelige aanmeld-buckets: wachtwoord, MFA, login-start, callbacks):
 *    verzoek geweigerd met een korte Retry-After, zodat een DB-storing geen onbeperkt raden toelaat.
 */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number, opties: { failClosed?: boolean } = {}): Promise<RateLimitResult> {
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
    if (opties.failClosed) {
      console.error('[rate-limit] databasefout, gevoelige bucket dus verzoek GEWEIGERD:', (err as Error).message);
      return { ok: false, hits: 0, limit, retryAfter: 30 };
    }
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

/**
 * Audit-fix 7: poging atomisch reserveren VÓÓR de controle. Eén statement: als het onderwerp geblokkeerd is gebeurt er
 * niets (toegestaan=false); anders telt de poging meteen als mislukt en gaat bij de drempel direct de blokkade in.
 * Bij succes daarna clearLoginFailures(). Zo kunnen gelijktijdige verzoeken samen nooit meer dan de drempel halen.
 */
export async function pogingReserveren(subject: string): Promise<{ toegestaan: boolean; wachtSeconden: number }> {
  const result = await getPool().query(
    `INSERT INTO app.login_lockouts AS l (subject, failures, updated_at) VALUES ($1, 1, now())
     ON CONFLICT (subject) DO UPDATE SET failures = l.failures + 1, updated_at = now(),
       locked_until = CASE WHEN l.failures + 1 >= $2
         THEN now() + make_interval(secs => least($4::float8, $3::float8 * power(2, greatest(0, l.failures + 1 - $2))))
         ELSE l.locked_until END
     WHERE l.locked_until IS NULL OR l.locked_until <= now()
     RETURNING failures, locked_until`,
    [subject, LOCKOUT_THRESHOLD, LOCKOUT_BASE_SECONDS, LOCKOUT_MAX_SECONDS],
  );
  if (!result.rows.length) return { toegestaan: false, wachtSeconden: Math.max(1, await lockoutRemaining(subject)) };
  return { toegestaan: true, wachtSeconden: 0 };
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

/**
 * SEC-002 (geheimen-07): sleutelversies voor rotatie. Een sleutelnaam eindigt op `_V1`; `<BASIS>_V2` … `_V9` zijn opvolgers.
 * De envelop draagt de versie (`v1.…`, `v2.…`), dus elke envelop opent met precies de sleutel waarmee hij gemaakt is.
 * Zegelen gebeurt met de NIEUWSTE versie die in de omgeving staat: na het toevoegen van `<BASIS>_V2` (en herstarten) komen alle
 * nieuwe en gewijzigde enveloppen onder V2, terwijl `v1.…` leesbaar blijft zolang V1 bestaat (deploy/GEHEIMEN-REGISTER.nl.md).
 */
const SLEUTEL_VERSIE = /^(.*_V)([1-9])$/;
function sleutelVoorVersie(keyName: string, versie: number): string {
  const m = SLEUTEL_VERSIE.exec(keyName);
  return m ? `${m[1]}${versie}` : keyName;
}
function nieuwsteSleutelVersie(keyName: string): { naam: string; versie: number } {
  const m = SLEUTEL_VERSIE.exec(keyName);
  if (!m) return { naam: keyName, versie: 1 };
  for (let v = 9; v > Number(m[2]); v -= 1) if (envKey32(`${m[1]}${v}`)) return { naam: `${m[1]}${v}`, versie: v };
  return { naam: keyName, versie: Number(m[2]) };
}

/**
 * Staat er een sleutel voor deze naam in de omgeving, in welke versie dan ook (`<BASIS>_V1` … `_V9`)? Voor modules die kiezen
 * tussen een eigen sleutel en de terugval op TOTP_ENCRYPTION_KEY_V1 (toets-g10b #2): kijken zij alleen naar `_V1`, dan zou
 * een installatie met alleen `_V2` stil terugvallen op TOTP. Alle vier modules gebruiken dit (afwerking A); V1 blijft toch nodig om
 * bestaande `v1.…`-enveloppen te lezen, dus: V1 nooit verwijderen zolang er niet opnieuw is verzegeld.
 */
export function envSleutelBeschikbaar(keyName: string): boolean {
  const m = SLEUTEL_VERSIE.exec(keyName);
  if (!m) return !!envKey32(keyName);
  for (let v = 1; v <= 9; v += 1) if (envKey32(`${m[1]}${v}`)) return true;
  return false;
}

/** AES-256-GCM-envelop `v<N>.<iv>.<ciphertext>.<tag>` (base64url), gebonden aan `aad`; N = nieuwste sleutelversie (meestal 1). */
export function sealWithEnvKey(keyName: string, plaintext: string, aad: string): string {
  const { naam, versie } = nieuwsteSleutelVersie(keyName);
  const key = envKey32(naam);
  if (!key) throw new Error(`SLEUTEL_ONTBREEKT:${naam}`);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [`v${versie}`, iv.toString('base64url'), ct.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

export function openWithEnvKey(keyName: string, envelope: string, aad: string): string {
  const [version, iv, ct, tag] = String(envelope || '').split('.');
  const vm = /^v([1-9])$/.exec(version || '');
  // v1 opent alleen met keyName zelf; v2…v9 alleen met de bijbehorende opvolger (nooit stil terugvallen op een andere versie).
  const versie = vm ? Number(vm[1]) : 0;
  const naam = versie > 1 ? sleutelVoorVersie(keyName, versie) : keyName;
  const key = envKey32(naam);
  if (!key) throw new Error(`SLEUTEL_ONTBREEKT:${naam}`); // zelfde volgorde als vroeger: eerst de sleutel, dan de envelop
  if (!versie || !iv || !ct || !tag || (versie > 1 && !SLEUTEL_VERSIE.test(keyName))) throw new Error('ENVELOP_ONGELDIG');
  return gcmOpenStrikt(key, Buffer.from(iv, 'base64url'), Buffer.from(tag, 'base64url'), Buffer.from(ct, 'base64url'), Buffer.from(aad, 'utf8')).toString('utf8');
}

/**
 * AES-256-GCM openen met VASTE lengtes: IV 12 bytes, authenticatietag 16 bytes (SEC-001-16, SEC-002 geheimen-06).
 * Zonder `authTagLength` aanvaardt Node ook een afgekapte tag van 4 bytes: wie in de database kan schrijven, heeft dan
 * ~2^32 pogingen nodig voor een vervalste envelop in plaats van 2^128. Alle plekken die een envelop openen gebruiken dit.
 */
export function gcmOpenStrikt(key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer, aad: Buffer): Buffer {
  if (iv.length !== 12 || tag.length !== 16) throw new Error('ENVELOP_ONGELDIG');
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** HMAC-SHA256 met een geheime pepper uit env (minstens 32 tekens). Gooit als die ontbreekt. */
export function pepperedHash(pepperName: string, value: string): string {
  const pepper = String(process.env[pepperName] || '').trim();
  if (pepper.length < 32) throw new Error(`SLEUTEL_ONTBREEKT:${pepperName}`);
  return createHmac('sha256', pepper).update(value).digest('hex');
}
