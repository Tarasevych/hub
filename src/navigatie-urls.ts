// Menu v2 fase B1: pure URL-hulpjes (zonder app-modules, testbaar in Node).
const HOST_DIENST: Record<string, string> = { hub: 'hub', ai: 'ai', mail: 'mail', cloud: 'cloud', github: 'github', huis: 'huis', id: 'identity', api: 'api', admin: 'admin', mcp: 'mcp' };
const VERBODEN_PARAM = /^(code|state|token|proof|transaction|redeem|handoff|auth_broker|oauth_code|oauth_error|consent|invite)$/i;
const hier = () => (typeof location !== 'undefined' ? location.href : 'https://hub.tarasevych.com/');

/** Dienst bij een URL op het eigen domein ('' = niet van ons). */
export function dienstVanUrl(href: string, basis = hier()): string {
  try {
    const u = new URL(href, basis);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost') return '';
    const m = /^([a-z]+)\.tarasevych\.com$/.exec(u.hostname);
    return m ? HOST_DIENST[m[1]] || '' : u.hostname === 'tarasevych.com' ? 'hub' : '';
  } catch { return ''; }
}
/** Veilige doel-URL voor vooruitladen: https op een ANDERE host van het eigen domein, zonder gevoelige parameters, zonder hash. */
export function vooruitUrl(href: string, basis = hier()): string {
  let u: URL; try { u = new URL(href, basis); } catch { return ''; }
  if (u.protocol !== 'https:' || !dienstVanUrl(u.href, basis) || u.origin === new URL(basis).origin || u.username || u.password) return '';
  for (const k of [...u.searchParams.keys()]) if (VERBODEN_PARAM.test(k)) return '';
  u.hash = '';
  return u.href;
}
