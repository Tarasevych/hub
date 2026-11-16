// IDENTITEIT-014 (фаза 3, крок «rechten»): ОДНА таблиця прав у спільному просторі для сервера й інтерфейсу.
// Eén tabel met rechten in een gedeelde werkruimte, voor de server én de interface.
//
// Рішення ухвалюється за роллю В ЦЬОМУ просторі, а не за глобальною роллю на сайті:
//   • власник (owner) може надати будь-яку роль, крім owner;
//   • адміністратор простору (admin) може надати admin, member або viewer;
//   • учасник (member) і глядач (viewer) нікому нічого не надають.
// Таблиця дослівно відтворює canManageRole з backend/rbac.ts, але без імпорту серверного коду (rbac.ts тягне server/platform),
// тому цей модуль можна імпортувати в браузері. Еквівалентність перевіряє tests/eenheid/identiteit-014-rechten.test.ts.
// Puur: geen import uit backend/ of server/.

export type WerkruimteRol = 'owner' | 'admin' | 'member' | 'viewer';
export const WERKRUIMTE_ROLLEN: readonly WerkruimteRol[] = Object.freeze(['owner', 'admin', 'member', 'viewer']);

/** Toegang zoals workspaceAccess() hem geeft, of een rij uit workspace_members (permission + workspaceRole). */
export type Toegang = { permission: string; workspaceRole?: string } | null | undefined;

/** Rol in de werkruimte: owner bij permission 'owner'; anders workspaceRole, en zonder die: editor → member, rest → viewer. */
export function werkruimteRol(toegang: Toegang): WerkruimteRol | null {
  if (!toegang) return null;
  if (toegang.permission === 'owner') return 'owner';
  const r = String(toegang.workspaceRole || '');
  if (r === 'admin' || r === 'member' || r === 'viewer') return r;
  return toegang.permission === 'editor' ? 'member' : 'viewer';
}

/** Mag deze rol anderen uitnodigen, rollen wijzigen en koppelingen maken? Alleen eigenaar en beheerder van de ruimte. */
export const magDelen = (rol: WerkruimteRol | null | undefined): boolean => rol === 'owner' || rol === 'admin';

/** Welke rol mag deze werkruimterol aan een ander geven? (zelfde tabel als canManageRole in backend/rbac.ts) */
function magRolGeven(rol: WerkruimteRol, doel: WerkruimteRol): boolean {
  if (rol === 'owner') return doel !== 'owner';
  if (rol === 'admin') return doel === 'admin' || doel === 'member' || doel === 'viewer';
  return false;
}

/** Mag deze werkruimterol een lid met rol `huidig` naar rol `doel` zetten (of `huidig` intrekken)? */
export function magRolBeheren(rol: WerkruimteRol | null | undefined, doel: WerkruimteRol, huidig?: WerkruimteRol): boolean {
  if (!rol || !magDelen(rol)) return false;
  return magRolGeven(rol, doel) && (huidig === undefined || magRolGeven(rol, huidig));
}

export const RANG: Readonly<Record<WerkruimteRol, number>> = Object.freeze({ viewer: 0, member: 1, admin: 2, owner: 3 });
/** Bij aansluiten via link: nooit een bestaande hogere rol verlagen. */
export const hoogsteRol = (a: WerkruimteRol | null | undefined, b: WerkruimteRol): WerkruimteRol => (a && RANG[a] > RANG[b] ? a : b);

/**
 * Rol per werkruimte uit de actieve lidmaatschappen van één gebruiker. Staan er (door oude gegevens) twee rijen voor dezelfde ruimte,
 * dan telt de hoogste — dezelfde regel als bij aansluiten. Роль у кожному просторі з членств; за дублікатів — найвища.
 */
export function rollenUitLidmaatschappen(leden: ReadonlyArray<{ workspaceId: string; permission: string; workspaceRole?: string }>): Map<string, WerkruimteRol> {
  const rollen = new Map<string, WerkruimteRol>();
  for (const lid of leden) {
    const rol = werkruimteRol(lid);
    if (!rol || !lid.workspaceId) continue;
    rollen.set(lid.workspaceId, hoogsteRol(rollen.get(lid.workspaceId) ?? null, rol));
  }
  return rollen;
}

/** Naam van een rol voor mensen [uk, nl] — dezelfde woorden als de keuzelijsten in de interface. / Назви ролей для людей. */
export const ROL_TEKST: Readonly<Record<WerkruimteRol, readonly [string, string]>> = Object.freeze({
  owner: ['Власник', 'Eigenaar'],
  admin: ['Адміністратор', 'Beheerder'],
  member: ['Редагування', 'Bewerken'],
  viewer: ['Перегляд', 'Lezen'],
});

/** Een ruimte waarin deze gebruiker mag delen (eigen ruimtes + gedeelde waar hij beheerder is), voor de interface. */
export type DeelWerkruimte = { id: string; name: string; rol: WerkruimteRol };
