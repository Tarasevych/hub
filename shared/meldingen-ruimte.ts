// Meldingen per webruimte (14.10.2026): de bel in de accountruimte toont alleen wat de gebruiker zelf aangaat; de bel in de
// technische ruimte (admin.*, api.*, beheerpagina's van mcp.* met actief technisch profiel) alleen wat het sitebeheer aangaat.
// Zo verschijnt «Новий запит на доступ» niet tussen de post van de eigenaar, en «Passkey видалено» niet in het deploy-dashboard.
//
// De indeling is een eigenschap van de SOORT (kind) en van de link, nooit van de tekst: de server bepaalt beide. Onbekende
// soorten horen bij het account (veilige richting: sitebeheer krijgt niets wat niet aantoonbaar van het beheer is).
// Puur (geen React/DOM): dezelfde regel in de browser als in tests.
import { isBeheerPagina } from './beheer-paginas';

export type MeldingRuimte = 'prive' | 'technisch';

/** Soorten die het beheer van de site aangaan (ontvanger: de eigenaar als beheerder). */
const TECHNISCHE_SOORTEN = new Set([
  'access_request',        // iemand vraagt een account: beslist in admin → Доступ
  'google_login_config',   // Google-aanmelding van de site staat verkeerd: admin → Контур
  'mcp_app_secret',        // een AI vraagt een geheim voor een app op de server: mcp/apps (beheerpagina)
  'vault_key_expiring',    // sleutel in de kluis van het API-platform loopt af: api → Сховище
  'vault_key_expired',
  'uitrol', 'uitrol_voorstel', 'release', 'server', 'siem', 'deur',
]);
const TECHNISCH_PREFIX = /^(tech[._]|uitrol[._]|beheer[._]|deur[._]|server[._]|release[._]|siem[._]|vault_)/;
const BEHEER_HOST = /^(admin|api)\.tarasevych\.com$/;

/** Ruimte uit de link: admin.*/api.* en beheerpagina's van mcp.* zijn technisch; al het andere zegt niets (undefined). */
export function ruimteVanLink(link: unknown): MeldingRuimte | undefined {
  if (typeof link !== 'string' || !link) return undefined;
  let u: URL; try { u = new URL(link, 'https://hub.tarasevych.com'); } catch { return undefined; }
  if (BEHEER_HOST.test(u.hostname)) return 'technisch';
  if (u.hostname === 'mcp.tarasevych.com') {
    const pagina = u.pathname.split('/').filter(Boolean)[0] || '';
    return isBeheerPagina('mcp', pagina) ? 'technisch' : undefined;
  }
  return undefined;
}

export function meldingRuimte(kind: unknown, link?: unknown): MeldingRuimte {
  const k = String(kind || '').toLowerCase().slice(0, 80);
  if (TECHNISCHE_SOORTEN.has(k) || TECHNISCH_PREFIX.test(k)) return 'technisch';
  return ruimteVanLink(link) ?? 'prive';
}

/** Alleen de meldingen van deze ruimte (de bel van de andere ruimte toont ze niet, ook niet als badge). */
export function meldingenVoorRuimte<T extends { kind?: unknown; link?: unknown }>(items: readonly T[] | null | undefined, ruimte: MeldingRuimte): T[] {
  return (Array.isArray(items) ? items : []).filter((m) => meldingRuimte(m?.kind, m?.link) === ruimte);
}

/** Opslagsleutel voor lokale meldingen en «gezien»-stand: per account én per ruimte, zodat ze elkaar niet raken. */
export const meldingScope = (basis: string, ruimte: MeldingRuimte) => (ruimte === 'technisch' ? `${basis}:technisch` : basis);
