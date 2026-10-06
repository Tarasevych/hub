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
