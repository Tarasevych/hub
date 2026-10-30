// «Власний домен для додатка» (21.10.2026, recht dev.app_domain → app_domain, kant BEHEER). Een zelf gehoste app op de server
// (deploy/agent/agent.mjs → apps.route, lokale Caddy) krijgt een eigen hostnaam. Omdat DNS en de tunnel daarbij veranderen en
// een vergissing de site onbereikbaar kan maken, controleert de server hier VOORAF wat er mag:
//   • een volledige hostnaam (minstens twee labels), kleine letters, geen IP-adres, geen jokerteken;
//   • NOOIT een adres van de site zelf (hub, id, mail, cloud, ai, github, huis, api, admin, mcp, dashboard) of het kale domein
//     daarvan — anders zou een app het verkeer van de site kunnen overnemen;
//   • en elk voorstel wordt pas uitgevoerd nadat de eigenaar het op de site met zijn passkey bevestigde (backend/ai-bevestiging.ts).
// Puur: server, bevestigingskaart en test lezen dezelfde regels.

export const APP_NAAM = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Hostnamen die van de site zelf zijn (en hun kale domein): een app mag ze nooit krijgen. */
export function siteHosts(hosts: Readonly<Record<string, string>>, extra: readonly string[] = []): Set<string> {
  const uit = new Set<string>();
  for (const h of [...Object.values(hosts), ...extra]) {
    const v = String(h || '').trim().toLowerCase();
    if (!v) continue;
    uit.add(v);
    const delen = v.split('.');
    if (delen.length >= 2) uit.add(delen.slice(-2).join('.'));
  }
  return uit;
}

export type DomeinVoorstel = { app: string; domain: string; machine: string; dns: DnsStand | null };
export type DnsStand = { cname: string[]; a: string[]; aaaa: string[]; tunnel: boolean; fout: string };

/**
 * Wat de AI stuurt → een gecontroleerd voorstel, of een Engelse foutmelding voor het model.
 * `cookieDomein` = het domein waarvoor de site haar aanmeldcookies zet (bv. «tarasevych.com» voor Domain=.tarasevych.com). Een app
 * onder dat domein krijgt die cookies bij elk verzoek mee — de code van de app (vaak door een AI geschreven) zou zo de sessie van
 * de eigenaar kunnen lezen. Daarom: nooit een hostnaam onder het cookiedomein.
 */
export function leesDomeinVoorstel(a: Record<string, unknown>, verboden: ReadonlySet<string>, cookieDomein = ''): { ok: true; voorstel: Omit<DomeinVoorstel, 'dns'> } | { ok: false; fout: string } {
  const app = typeof a.name === 'string' ? a.name.trim() : typeof a.app === 'string' ? a.app.trim() : '';
  if (!APP_NAAM.test(app)) return { ok: false, fout: 'Invalid "name": the app name from app_list (3-32 characters, lowercase letters, digits and "-").' };
  const domain = typeof a.domain === 'string' ? a.domain.trim().toLowerCase().replace(/\.$/, '') : '';
  if (!HOST.test(domain) || domain.startsWith('*') || /^\d+(\.\d+){3}$/.test(domain)) return { ok: false, fout: 'Invalid "domain": a full host name such as "notes.example.com" (no IP address, no wildcard).' };
  if (verboden.has(domain)) {
    return { ok: false, fout: domain.split('.').length < 3
      ? 'Refused: this is the bare domain of the site itself. A mistake there makes the whole site unreachable, so an app never gets it.'
      : `Refused: "${domain}" is an address of the Mijn Ruimte site itself. Pick another host name for the app.` };
  }
  const cd = String(cookieDomein || '').trim().toLowerCase().replace(/^\./, '');
  if (cd && (domain === cd || domain.endsWith(`.${cd}`))) {
    return { ok: false, fout: `Refused: every host under ".${cd}" receives the login cookies of the Mijn Ruimte site, so the app could read the owner's session. Use a host name outside "${cd}" (for example "notes.example.org").` };
  }
  const machine = a.machine === undefined ? '' : String(a.machine).trim().slice(0, 120);
  return { ok: true, voorstel: { app, domain, machine } };
}

/** Uitleg bij de DNS-stand (voor de kaart en het resultaat), uk + nl. */
export function dnsUitleg(d: DnsStand | null): { uk: string; nl: string } {
  if (!d) return { uk: 'DNS ще не перевірено.', nl: 'DNS nog niet gecontroleerd.' };
  if (d.fout === 'NXDOMAIN' || (!d.cname.length && !d.a.length && !d.aaaa.length)) return { uk: 'Запису DNS для цієї назви ще немає: його треба створити (CNAME на тунель або A-запис на сервер).', nl: 'Er is nog geen DNS-record voor deze naam: maak er een (CNAME naar de tunnel of een A-record naar de server).' };
  if (d.tunnel) return { uk: `DNS уже вказує на тунель (${d.cname[0]}).`, nl: `DNS wijst al naar de tunnel (${d.cname[0]}).` };
  const waar = [...d.cname, ...d.a, ...d.aaaa].slice(0, 4).join(', ');
  return { uk: `DNS вказує на ${waar}. Перевірте, що це ваш сервер або тунель.`, nl: `DNS wijst naar ${waar}. Controleer dat dit uw server of tunnel is.` };
}
