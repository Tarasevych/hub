// Fase 3: delen van werkruimtes beslist uitsluitend op de rol IN DIE werkruimte (niet op de globale rol),
// scopeBlockIds worden gevalideerd, e-mailadressen van leden zijn verborgen voor kijkers,
// en uitnodigingslinks zijn eenmalig (optioneel gebonden aan een e-mailadres) met vervaldatum.
import { db } from '../server/platform';
import { canManageRole, type WorkspaceRole } from './rbac';

export const UITNODIGING_GELDIG_MS = 7 * 24 * 60 * 60 * 1000;
/** Oude e-mailuitnodigingen (zonder verlooptOp) blijven ruimer geldig: createdAt + 30 dagen. */
export const OUDE_UITNODIGING_GELDIG_MS = 30 * 24 * 60 * 60 * 1000;

type Toegang = { permission: string; workspaceRole?: string } | null | undefined;

export function werkruimteRol(toegang: Toegang): WorkspaceRole | null {
  if (!toegang) return null;
  if (toegang.permission === 'owner') return 'owner';
  const r = String(toegang.workspaceRole || '');
  if (r === 'admin' || r === 'member' || r === 'viewer') return r;
  return toegang.permission === 'editor' ? 'member' : 'viewer';
}
export const magDelen = (rol: WorkspaceRole | null): boolean => rol === 'owner' || rol === 'admin';
/** Mag deze werkruimterol een lid met rol `huidig` naar rol `doel` zetten? */
export function magRolBeheren(rol: WorkspaceRole | null, doel: WorkspaceRole, huidig?: WorkspaceRole): boolean {
  if (!magDelen(rol)) return false;
  const actor = { role: rol as string, accessLevel: 'full', email: '' };
  return canManageRole(actor, doel) && (huidig === undefined || canManageRole(actor, huidig));
}

/** Geeft de gevalideerde lijst blok-id's terug, of null als er een id bij zit dat niet tot de werkruimte hoort. */
export async function scopeBlokkenControleren(workspaceId: string, invoer: unknown): Promise<string[] | null> {
  if (invoer === undefined || invoer === null) return [];
  if (!Array.isArray(invoer)) return null;
  const ids = [...new Set(invoer.map((v) => String(v || '').trim()).filter(Boolean))];
  if (ids.length > 200) return null;
  if (!ids.length) return [];
  const rijen = await db.get<{ workspaceId?: string }>('workspace_blocks', ids);
  if (rijen.length !== ids.length) return null;
  return rijen.every((rij) => rij && rij.workspaceId === workspaceId) ? ids : null;
}

export function emailMaskeren(email: string): string {
  const [naam, domein] = String(email || '').split('@');
  if (!domein) return '';
  return `${(naam || '').slice(0, 1)}***@${domein}`;
}
/** Kijkers zien geen volledige e-mailadressen van andere leden. */
export function ledenVoorWeergave<T extends { email: string; userId: string }>(leden: T[], rol: WorkspaceRole | null, eigenId: string): T[] {
  if (rol !== 'viewer') return leden;
  return leden.map((lid) => (lid.userId === eigenId ? lid : { ...lid, email: emailMaskeren(lid.email) }));
}

export function uitnodigingVerlopen(lid: { verlooptOp?: number; createdAt?: number }, nu = Date.now()): boolean {
  const grens = Number(lid.verlooptOp || 0) || Number(lid.createdAt || 0) + OUDE_UITNODIGING_GELDIG_MS;
  return grens <= nu;
}

const RANG: Record<WorkspaceRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
/** Bij aansluiten via link: nooit een bestaande hogere rol verlagen. */
export const hoogsteRol = (a: WorkspaceRole | null, b: WorkspaceRole): WorkspaceRole => (a && RANG[a] > RANG[b] ? a : b);
