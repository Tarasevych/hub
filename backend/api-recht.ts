// Fase 3: API-platform (tokens, kluis, koppelingen) alleen voor de eigenaar of accounts met het recht
// 'api-platform' (toe te kennen door de beheerder, zoals 'plum-theme').
import { isOwnerEmail } from '../server/platform';
export const API_RECHT = 'api-platform';
export const heeftApiRecht = (user: { role?: string; email?: string; entitlements?: unknown } | null | undefined): boolean =>
  !!user && ((user.role === 'owner' && isOwnerEmail(user.email)) || (Array.isArray(user.entitlements) && user.entitlements.includes(API_RECHT)));

// Audit 19.10.2026 (U-03/MCP-01): een GELDIGE sessie zonder het recht krijgt 'API_RECHT_VEREIST' (403), zodat de hub kan uitleggen dat
// de eigenaar het recht moet geven; echte sessiefouten (verlopen, andere dienst, niet goedgekeurd) blijven 'OWNER_API_SESSION_REQUIRED'.
export const API_RECHT_VEREIST = 'API_RECHT_VEREIST';
export type RechtWeigering = { errorCode: typeof API_RECHT_VEREIST };
export const GEEN_RECHT: RechtWeigering = Object.freeze({ errorCode: API_RECHT_VEREIST }) as RechtWeigering;
export const isGeenRecht = (x: unknown): x is RechtWeigering => !!x && typeof x === 'object' && (x as { errorCode?: unknown }).errorCode === API_RECHT_VEREIST;
/** Foutcode voor een geweigerde poort: zonder recht → API_RECHT_VEREIST, anders OWNER_API_SESSION_REQUIRED. */
export const weigerCode = (auth: unknown): 'API_RECHT_VEREIST' | 'OWNER_API_SESSION_REQUIRED' => (isGeenRecht(auth) ? API_RECHT_VEREIST : 'OWNER_API_SESSION_REQUIRED');
