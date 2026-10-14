// Облікове меню і технічний розділ не ділять одні й ті самі пункти управління.
import { checker } from './hulp/nep-google';
import { menuWeergave } from '../../shared/menu-indeling';
import { normaliseerZijbalk } from '../../shared/menu-model';
import { accountMenuIds, defaultMenuPreferences, menuPreferencesForRole, menuVoorOppervlak, ownerLockedMenuItem } from '../../src/menu-preferences';

export async function main(): Promise<number> {
  const { check, einde } = checker('menu-oppervlak');
  const allesAan = defaultMenuPreferences().map((item) => ({ ...item, visible: true }));
  const owner = menuPreferencesForRole(allesAan, 'owner');
  const account = menuVoorOppervlak(owner, 'account');
  check('обліковий запис не містить api та admin, навіть якщо їх увімкнено', !account.some((item) => item.id === 'api' || item.id === 'admin'));
  check('налаштування і міст лишаються в обліковому меню', account.some((item) => item.id === 'identity' && item.visible) && account.some((item) => item.id === 'mcp' && item.visible));
  check('для власника заблоковано лише налаштування', ownerLockedMenuItem('identity') && !ownerLockedMenuItem('api') && !ownerLockedMenuItem('admin'));
  const verborgen = defaultMenuPreferences().map((item) => (item.id === 'api' || item.id === 'admin' ? { ...item, visible: false } : item));
  const tech = menuVoorOppervlak(verborgen, 'technisch');
  check('технічний розділ — лише api та admin, обидва видимі', tech.length === 2 && tech.every((item) => item.visible) && tech.map((item) => item.id).join() === 'api,admin');
  const ids = accountMenuIds(owner);
  check('спільне меню вкладок не несе управління', !ids.includes('api') && !ids.includes('admin') && ids.includes('mcp'));
  const voorkeur = normaliseerZijbalk({ kopieen: [{ id: 'k-ad01', item: 'pg:admin/updates', plaats: 'zijbalk', ouder: 'svc:hub', volgorde: 0 }, { id: 'k-hb01', item: 'pg:hub/tasks', plaats: 'zijbalk', ouder: null, volgorde: 1 }] });
  const accountWeergave = menuWeergave(voorkeur, { diensten: account.filter((item) => item.visible).map((item) => item.id), toegestaan: account.map((item) => item.id) });
  const techWeergave = menuWeergave(voorkeur, { diensten: tech.map((item) => item.id), toegestaan: tech.map((item) => item.id) });
  const plat = (w: typeof accountWeergave) => JSON.stringify(w);
  check('копія сторінки адміністрування не лишається в обліковому меню', !plat(accountWeergave).includes('admin'));
  check('технічний розділ не показує сторінки облікового запису', !plat(techWeergave).includes('hub') && plat(techWeergave).includes('admin'));
  return einde();
}
