// Fase 3: API-platform (tokens, kluis, koppelingen) alleen voor de eigenaar of accounts met het recht
// 'api-platform' (toe te kennen door de beheerder, zoals 'plum-theme').
import { isOwnerEmail } from '../server/platform';
export const API_RECHT = 'api-platform';
export const heeftApiRecht = (user: { role?: string; email?: string; entitlements?: unknown } | null | undefined): boolean =>
  !!user && ((user.role === 'owner' && isOwnerEmail(user.email)) || (Array.isArray(user.entitlements) && user.entitlements.includes(API_RECHT)));
