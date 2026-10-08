// Hulpfuncties voor het koppelen van agents: koppelcodes en tokens. Alleen hashes worden bewaard.
import { createHash, randomBytes, randomInt } from 'node:crypto';

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

// Zonder O/0/I/1 zodat de code makkelijk over te typen is. 32^8 ≈ 10^12 mogelijkheden, 10 minuten geldig.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function pairingCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Normaliseer invoer van een gebruiker (spaties, streepjes, kleine letters). */
export const normalizePairingCode = (value: unknown): string =>
  String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---- opdrachten ondertekenen (audit H3) ----
// Bij het koppelen krijgt de agent één keer een eigen sleutel (naast zijn token). De server bewaart die alleen verzegeld
// (AES-256-GCM, gebonden aan gebruiker + token-hash) en ondertekent elke opdracht met HMAC-SHA256. De agent voert alleen
// opdrachten uit met een geldige, niet-verlopen handtekening; een gestolen WebSocket of een server-imitatie zonder sleutel kan
// dus niets laten uitvoeren.
import { createHmac } from 'node:crypto';
import { envKey32, openWithEnvKey, sealWithEnvKey } from '../server/platform/beveiliging';

export const COMMAND_SIG_TTL_MS = 120_000;
const keyName = () => (envKey32('AGENT_SLEUTEL_V1') ? 'AGENT_SLEUTEL_V1' : 'TOTP_ENCRYPTION_KEY_V1');
export const newCommandKey = (): string => randomBytes(32).toString('base64url');
export const sealCommandKey = (key: string, userId: string, tokenHash: string): string | null => {
  try { return sealWithEnvKey(keyName(), key, `agent-cmd-key:${userId}:${tokenHash}`); } catch { return null; }
};
export const openCommandKey = (sealed: string, userId: string, tokenHash: string): string | null => {
  try { return openWithEnvKey(keyName(), sealed, `agent-cmd-key:${userId}:${tokenHash}`); } catch { return null; }
};
/** Canonieke tekst die wordt ondertekend: versie, id, type, hash van de parameters, vervaltijd. */
export const commandSigText = (id: string, type: string, params: unknown, exp: number): string =>
  `v1\n${id}\n${type}\n${sha256(JSON.stringify(params ?? {}))}\n${exp}`;
export const signCommand = (key: string, id: string, type: string, params: unknown, exp: number): string =>
  createHmac('sha256', Buffer.from(key, 'base64url')).update(commandSigText(id, type, params, exp)).digest('hex');
