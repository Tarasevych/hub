// «Levend» menu (menu v2, fase B2/B3): meldingen als badges op menu-items + instellingen. Puur (geen React/DOM): draait in de browser
// én op de server (normalisatie van de voorkeuren in het `sidebar`-veld). Bronnen:
//   • de bestaande bel-meldingen (site_notifications, alleen voor een goedgekeurd account — de server levert anders []),
//   • tellers die een dienst zelf publiceert (nu: aantal ongelezen in Вхідні van E-mail; ALLEEN een getal, nooit inhoud).
// Gasten (toegangscodes, /toegang) hebben geen menu en geen /api/owner-toegang: zij krijgen hier niets van.
import { DIENST_IDS, MENU_PAGINAS, isMenuItemId, type DienstId } from './menu-model';

export * from './menu-meldingen-voorkeuren';
import { MELDING_CATEGORIEEN, type MeldingCategorie, type MeldingVoorkeuren } from './menu-meldingen-voorkeuren';

// ------------------------------------------------------------------------------------------------ waar hoort een melding?
const HOST_DIENST: Record<string, DienstId> = { hub: 'hub', ai: 'ai', mail: 'mail', cloud: 'cloud', github: 'github', huis: 'huis', id: 'identity', api: 'api', admin: 'admin', mcp: 'mcp' };
const SOORT_DOEL: Record<string, [string, MeldingCategorie]> = {
  access_request: ['pg:admin/access', 'toegang'], access_decision: ['svc:hub', 'toegang'], workspace_share: ['pg:hub/overview', 'delen'],
  workspace_role_changed: ['pg:hub/overview', 'delen'], workspace_access_revoked: ['pg:hub/overview', 'delen'], workspace_invite_accepted: ['pg:hub/overview', 'delen'], workspace_share_link_created: ['pg:hub/overview', 'delen'], // IDENTITEIT-014
  workspace_ownership_transferred: ['pg:hub/overview', 'delen'], // IDENTITEIT-015 (profiel-blokken)
  account_email_conflict: ['pg:identity/account', 'beveiliging'], google_login_config: ['pg:admin/contour', 'systeem'],
};
function categorieVanSoort(soort: string): MeldingCategorie {
  if (/^(security|beveiliging|passkey|login|session|sessie|herstel|recovery|toegang_wijziging)/.test(soort)) return 'beveiliging';
  if (/^(access|toegang|invite|uitnodig)/.test(soort)) return 'toegang';
  if (/^(mail|post)/.test(soort)) return 'post';
  if (/^(share|deel|workspace)/.test(soort)) return 'delen';
  if (/^(ai|agent|mcp)/.test(soort)) return 'ai';
  return 'systeem';
}
/** Menu-item uit een (door de server gecontroleerde) link: host → dienst, eerste padsegment → pagina als die bestaat. */
export function itemVanLink(link: unknown): string | undefined {
  if (typeof link !== 'string' || !link) return undefined;
  let u: URL; try { u = new URL(link, 'https://hub.tarasevych.com'); } catch { return undefined; }
  const m = /^([a-z]+)\.tarasevych\.com$/.exec(u.hostname);
  const dienst = m ? HOST_DIENST[m[1]] : u.hostname === 'tarasevych.com' ? 'hub' : undefined;
  if (!dienst) return undefined;
  const pagina = u.pathname.split('/').filter(Boolean)[0] || '';
  return (MENU_PAGINAS[dienst] || []).includes(pagina) ? `pg:${dienst}/${pagina}` : `svc:${dienst}`;
}
/** Alleen https-links naar het eigen domein (of een relatief pad) mogen in een bel staan; al het andere valt weg. */
export function veiligeLink(link: unknown): string | undefined {
  if (typeof link !== 'string' || !link || link.length > 500) return undefined;
  if (/^\/(?!\/)/.test(link) && !/[\\\s]/.test(link)) return link;
  let u: URL; try { u = new URL(link); } catch { return undefined; }
  return u.protocol === 'https:' && (u.hostname === 'tarasevych.com' || u.hostname.endsWith('.tarasevych.com')) && !u.username && !u.password ? u.href : undefined;
}
export function meldingDoel(soort: string, link?: unknown): { item: string; categorie: MeldingCategorie } {
  const k = String(soort || '').toLowerCase().slice(0, 80);
  const vast = SOORT_DOEL[k];
  const uitLink = itemVanLink(link);
  if (vast) return { item: uitLink || vast[0], categorie: vast[1] };
  return { item: uitLink || 'svc:hub', categorie: categorieVanSoort(k) };
}

// ------------------------------------------------------------------------------------------------ badges samenstellen
export type MenuMelding = { id: string; bron: 'server' | 'teller'; item: string; categorie: MeldingCategorie; titel: string; tekst: string; op: number; aantal?: number; link?: string };
export type ServerMelding = { id: string; kind: string; title: string; message: string; createdAt: number; read?: boolean; link?: string };
export const MAX_BELLEN = 5;
export function vanServer(n: ServerMelding[]): MenuMelding[] {
  return (Array.isArray(n) ? n : []).filter((x) => x && !x.read && typeof x.id === 'string').map((x) => {
    const link = veiligeLink(x.link), d = meldingDoel(x.kind, link);
    return { id: x.id, bron: 'server' as const, item: d.item, categorie: d.categorie, titel: String(x.title || '').slice(0, 120), tekst: String(x.message || '').slice(0, 280), op: Number(x.createdAt || 0), ...(link ? { link } : {}) };
  });
}
export type Tellers = { mail?: { ongelezen: number; op: number } };
/** Tellers → meldingen. `weg` = per teller het aantal dat de gebruiker heeft weggeklikt: pas bij MEER komt hij terug. */
export function vanTellers(t: Tellers, weg: Record<string, number>, lang: 'uk' | 'nl'): MenuMelding[] {
  const uit: MenuMelding[] = [];
  const n = Math.max(0, Math.min(99999, Math.floor(Number(t.mail?.ongelezen || 0))));
  if (n > 0 && n > Number(weg.mail ?? -1)) uit.push({ id: 'teller:mail', bron: 'teller', item: 'pg:mail/inbox', categorie: 'post', aantal: n, op: Number(t.mail?.op || 0),
    titel: lang === 'uk' ? `Непрочитані листи: ${n}` : `Ongelezen e-mails: ${n}`, tekst: lang === 'uk' ? 'У «Вхідних» є непрочитані листи.' : 'Er zijn ongelezen e-mails in Inbox.' });
  return uit;
}
export type Badge = { item: string; aantal: number; categorieen: MeldingCategorie[]; meldingen: MenuMelding[]; nieuwste: number };
const ouderVan = (id: string) => { const m = /^pg:([a-z]{2,12})\//.exec(id); return m ? `svc:${m[1]}` : undefined; };
/** Per menu-item: aantal, categorieën (sterkste eerst) en de nieuwste meldingen. Pagina-meldingen tellen ook mee bij het hoofditem. */
export function badgesBouwen(meldingen: MenuMelding[], v: MeldingVoorkeuren): Record<string, Badge> {
  if (!v.aan) return {};
  const uit: Record<string, Badge> = {};
  const voeg = (item: string, m: MenuMelding) => {
    if (!isMenuItemId(item)) return;
    const b = uit[item] || (uit[item] = { item, aantal: 0, categorieen: [], meldingen: [], nieuwste: 0 });
    b.aantal += m.aantal ?? 1; b.meldingen.push(m); b.nieuwste = Math.max(b.nieuwste, m.op);
    if (!b.categorieen.includes(m.categorie)) b.categorieen.push(m.categorie);
  };
  for (const m of meldingen) {
    if (!v.categorieen[m.categorie]) continue;
    const dienst = /^(?:svc|pg):([a-z]{2,12})/.exec(m.item)?.[1];
    if (!dienst || !(DIENST_IDS as readonly string[]).includes(dienst)) continue;
    voeg(m.item, m);
    const o = ouderVan(m.item); if (o) voeg(o, m);
  }
  const rang = (c: MeldingCategorie) => (c === 'beveiliging' ? -1 : MELDING_CATEGORIEEN.indexOf(c)); // beveiliging altijd voorop
  for (const b of Object.values(uit)) { b.meldingen.sort((a, z) => z.op - a.op); b.categorieen.sort((a, z) => rang(a) - rang(z)); b.meldingen = b.meldingen.slice(0, MAX_BELLEN); }
  return uit;
}
/** Tekst op de badge: «99+» boven 99. */
export const badgeTekst = (n: number) => (n > 99 ? '99+' : String(Math.max(0, Math.floor(n))));
