/**
 * Канонічний JSON і base64url — однаково працюють у Node і в браузері.
 *
 * Підпис власника ставиться під КАНОНІЧНИМ записом політики. Браузер сам
 * перераховує цей запис із чернетки й порівнює з тим, що надіслав сервер, —
 * тож сервер не може підмінити те, що власник бачить на екрані, на те, що він підписує.
 */

export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalError';
  }
}

/** Детермінований JSON: ключі відсортовано, undefined/NaN/Infinity заборонено. */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string': return JSON.stringify(value);
    case 'boolean': return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new CanonicalError('Число має бути скінченним.');
      if (Object.is(value, -0)) return '0';
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v)).join(',')}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts: string[] = [];
      for (const k of keys) {
        const v = obj[k];
        if (v === undefined) throw new CanonicalError(`Поле «${k}» не визначене.`);
        parts.push(`${JSON.stringify(k)}:${canonicalize(v)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new CanonicalError(`Тип «${typeof value}» не можна підписувати.`);
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new CanonicalError('Некоректний base64url.');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, '0');
  return out;
}

/** Домени підпису: підпис під політикою не можна видати за підпис під погодженням. */
export const DOMAIN_POLICY = 'MR-ACCESS/policy/v1';
export const DOMAIN_APPROVAL = 'MR-ACCESS/approval/v1';

/** Байти, що йдуть під хеш для виклику (challenge). */
export function challengeInput(domain: string, value: unknown): Uint8Array {
  return utf8(`${domain}\n${canonicalize(value)}`);
}

/** Для браузера: `crypto.subtle.digest('SHA-256', challengeInput(...))` → base64url → challenge у WebAuthn. */
export async function browserChallenge(domain: string, value: unknown): Promise<string> {
  const input = challengeInput(domain, value);
  const buf = new ArrayBuffer(input.byteLength);
  new Uint8Array(buf).set(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return toBase64Url(new Uint8Array(digest));
}
