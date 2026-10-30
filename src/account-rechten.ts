// Rechten van het account voor WEERGAVE (audit 19.10.2026, U-03/2c). De server beslist (backend/api-recht.ts, tech-profiel.ts);
// hier alleen: welke menu-items en snelkoppelingen een account te zien krijgt, zodat er geen dode «Міст ШІ → сайт» of
// «Оновлення (Адміністрування)» staat voor wie het recht of het technisch profiel niet heeft.
import { isSiteBeheer } from './menu-voorkeuren';

export type AccountRechten = { apiPlatform: boolean; eigenaar: boolean };
export const API_RECHT = 'api-platform';
type RechtUser = { role?: string; entitlements?: unknown } | null | undefined;
/** Zelfde regel als backend/api-recht.ts: eigenaar, of het recht 'api-platform'. */
export const heeftApiRecht = (user: RechtUser): boolean => !!user && (user.role === 'owner' || (Array.isArray(user.entitlements) && user.entitlements.includes(API_RECHT)));
export const accountRechten = (user: RechtUser): AccountRechten => ({ apiPlatform: heeftApiRecht(user), eigenaar: user?.role === 'owner' });
/** Mag deze dienst in het menu/de snelbalk van het account staan? mcp = brug ШІ → сайт (recht api-platform of technisch profiel); api/admin = technisch profiel. */
export const dienstToegestaan = (dienst: string, r: AccountRechten | undefined, techProfiel: boolean): boolean => {
  if (dienst === 'mcp') return !!r?.apiPlatform || techProfiel;
  if (isSiteBeheer(dienst)) return techProfiel;
  return true;
};
