import { error } from '../server/platform/antwoord';
import { huidigeContext } from '../server/platform/context';
import { can, denyMutation, rejectForeignOwnerUserId } from './rbac';
import { ruimteVanSessie } from './ruimte-sessie';

export type Klantgebruiker = { id: string; status: string; email?: string; role?: string; accessLevel?: string };
export type Klantsessie = (event: Record<string, unknown>, body: unknown) => Promise<
  { service: string; user: Klantgebruiker; tab?: string } | { errorCode: string }
>;
export type Klantverzoek = { event: Record<string, unknown>; body: unknown };

export async function klanttoegang(sessie: Klantsessie, ctx: Klantverzoek, schrijven: boolean) {
  const toegang = await sessie(ctx.event, ctx.body);
  if ('errorCode' in toegang) return { weigering: error(toegang.errorCode, 401) } as const;
  const { user } = toegang;
  if (!user.id || user.status !== 'approved' || toegang.service !== 'crm') return { weigering: error('KLANT_TOEGANG_GEWEIGERD', 403) } as const;
  if (!can(user, 'workspace.read')) return { weigering: error('KLANT_TOEGANG_GEWEIGERD', 403) } as const;
  const vreemd = rejectForeignOwnerUserId(user, ctx.body);
  if (vreemd) return { weigering: vreemd } as const;
  const alleenLezen = huidigeContext()?.alleenLezen === true;
  if (schrijven) {
    const verboden = denyMutation(user, 'workspace.write');
    if (verboden || alleenLezen) return { weigering: verboden || error('KLANT_ALLEEN_LEZEN', 403) } as const;
  }
  const ruimte = await ruimteVanSessie();
  return { user, lade: { userId: user.id, ruimte }, tabContext: toegang.tab || '', magSchrijven: can(user, 'workspace.write') && !alleenLezen } as const;
}
