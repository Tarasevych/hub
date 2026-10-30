// Облікове меню і технічний розділ не ділять одні й ті самі пункти управління.
import { checker } from './hulp/nep-google';
import { menuWeergave } from '../../shared/menu-indeling';
import { normaliseerZijbalk } from '../../shared/menu-model';
import { isBeheerPagina, paginaZichtbaar } from '../../shared/beheer-paginas';
import { TECH_NAAM, accountMenuIds, defaultMenuPreferences, menuPreferencesForRole, menuVoorOppervlak, ownerLockedMenuItem } from '../../src/menu-voorkeuren';

export async function main(): Promise<number> {
  const { check, einde } = checker('menu-oppervlak');
  const allesAan = defaultMenuPreferences().map((item) => ({ ...item, visible: true }));
  const owner = menuPreferencesForRole(allesAan, 'owner');
  const account = menuVoorOppervlak(owner, 'account');
  check('обліковий запис не містить api та admin, навіть якщо їх увімкнено', !account.some((item) => item.id === 'api' || item.id === 'admin'));
  check('налаштування лишаються в обліковому меню, міст mcp — лише в технічному', account.some((item) => item.id === 'identity' && item.visible) && !account.some((item) => item.id === 'mcp'));
  check('для власника заблоковано лише налаштування', ownerLockedMenuItem('identity') && !ownerLockedMenuItem('api') && !ownerLockedMenuItem('admin'));
  const verborgen = defaultMenuPreferences().map((item) => (item.id === 'api' || item.id === 'admin' ? { ...item, visible: false } : item));
  const tech = menuVoorOppervlak(verborgen, 'technisch');
  check('технічний розділ — адміністрування, API і «Сервер і розгортання», усі видимі, без користувацьких служб', tech.length === 3 && tech.every((item) => item.visible) && tech.map((item) => item.id).join() === 'admin,api,mcp' && TECH_NAAM.uk.mcp === 'Сервер і розгортання');
  const ids = accountMenuIds(owner);
  check('спільне меню вкладок не несе управління і не відкриває mcp як службу облікового запису', !ids.includes('api') && !ids.includes('admin') && !ids.includes('mcp'));
  const voorkeur = normaliseerZijbalk({ kopieen: [{ id: 'k-ad01', item: 'pg:admin/updates', plaats: 'zijbalk', ouder: 'svc:hub', volgorde: 0 }, { id: 'k-hb01', item: 'pg:hub/tasks', plaats: 'zijbalk', ouder: null, volgorde: 1 }] });
  const accountWeergave = menuWeergave(voorkeur, { diensten: account.filter((item) => item.visible).map((item) => item.id), toegestaan: account.map((item) => item.id) });
  const techWeergave = menuWeergave(voorkeur, { diensten: tech.map((item) => item.id), toegestaan: tech.map((item) => item.id) });
  const plat = (w: typeof accountWeergave) => JSON.stringify(w);
  check('копія сторінки адміністрування не лишається в обліковому меню', !plat(accountWeergave).includes('admin'));
  check('технічний розділ не показує сторінки облікового запису', !plat(techWeergave).includes('hub') && plat(techWeergave).includes('admin'));
  const techMcp = (techWeergave.secties.mcp || []).filter((r) => r.pagina && isBeheerPagina(r.dienst, r.pagina));
  const techRuimte = (rs: typeof techWeergave.snelbalk) => rs.filter((r) => r.dienst === 'api' || r.dienst === 'admin' || (!!r.pagina && isBeheerPagina(r.dienst, r.pagina)));
  check('у технічній частині mcp показує лише dashboard/apps/download/verbindingen', techMcp.map((r) => r.pagina).sort().join() === 'apps,dashboard,download,verbindingen' && techRuimte(techWeergave.secties.mcp || []).length === 4);

  // Аудит 14.10: сторінки управління всередині користувацької служби (mcp) — лише в технічному профілі.
  check('панель розгортання, додатки на сервері та архів — сторінки управління', ['dashboard', 'apps', 'download'].every((tab) => isBeheerPagina('mcp', tab)));
  check('огляд, агенти, підключення, дошка — користувацькі', ['overview', 'agents', 'connect', 'board', 'services', 'tools'].every((tab) => !isBeheerPagina('mcp', tab)));
  check('в інших службах немає сторінок управління', !isBeheerPagina('identity', 'methods') && !isBeheerPagina('hub', 'overview') && !isBeheerPagina('mail', 'inbox'));
  check('без технічного профілю сторінка управління невидима, з ним — видима', !paginaZichtbaar('mcp', 'dashboard', false) && paginaZichtbaar('mcp', 'dashboard', true) && paginaZichtbaar('mcp', 'agents', false));
  const mcpVoorkeur = normaliseerZijbalk({ kopieen: [{ id: 'k-mc01', item: 'pg:mcp/download', plaats: 'snelbalk', ouder: null, volgorde: 0 }] });
  const mcpWeergave = menuWeergave(mcpVoorkeur, { diensten: ['hub', 'mcp'], toegestaan: ['hub', 'mcp'] });
  const zonderBeheer = (rs: typeof mcpWeergave.snelbalk) => rs.filter((r) => !r.pagina || paginaZichtbaar(r.dienst, r.pagina, false));
  check('копія сторінки управління зникає зі швидкого доступу без технічного профілю', mcpWeergave.snelbalk.some((r) => r.pagina === 'download') && !zonderBeheer(mcpWeergave.snelbalk).some((r) => r.pagina === 'download'));
  check('підменю mcp без технічного профілю не має dashboard/apps/download, але має agents', (() => { const rs = zonderBeheer(mcpWeergave.secties.mcp || []); return rs.some((r) => r.pagina === 'agents') && !rs.some((r) => r.pagina && isBeheerPagina('mcp', r.pagina)); })());
  return einde();
}
