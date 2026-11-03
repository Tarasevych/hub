// Lokale meldingen van de diensten zelf (emitCanonicalNotice / de `notice`-prop): de lijst die het meldingencentrum per account in
// localStorage bewaart. Uit src/CanoniekMeldingencentrum.tsx gehaald (INTEG-001) zodat het bijwerken tussen tabbladen zonder browser
// te toetsen is (tests/eenheid/meldingen-integ-20261103.test.ts).
//
// INTEG-001 — oorzaak van «сповіщення повторюються, хоча їх уже бачили»: elk tabblad hield een eigen kopie in het geheugen en schreef
// die bij elke wijziging in zijn geheel weg (laatste wint). Las u een melding in tabblad A, dan zette tabblad B haar bij zijn volgende
// melding weer op «ongelezen» (en een verwijderde regel kwam terug). Nu is de opslag de bron van waarheid: elke wijziging begint bij wat
// er NU staat (werkRijenBij), en andere tabbladen volgen via het `storage`-event (CanoniekMeldingencentrum).
import { resolveCanonicalNoticeAction, type CanonicalNoticeAction, type CanonicalNoticeDetailIcon, type CanonicalNoticeKind, type CanonicalNoticeSection } from '../canoniek-meldingen';

export type BewaardeRij = {
  id: string;
  text: string;
  kind: CanonicalNoticeKind;
  createdAt: number;
  source: string;
  read: boolean;
  link?: { href: string; label: string };
  action?: CanonicalNoticeAction;
  actionExpiresAt?: number;
  details?: CanonicalNoticeSection[];
  /** Uitleg in gewone taal: de oorzaak en wat u nu kunt doen. */
  explain?: string;
  /** Over wie of wat het gaat (account, app, apparaat), als de bron dat meegeeft. */
  context?: string;
  /** Samenvoeg-sleutel: dezelfde melding binnen het venster wordt één regel met een teller. */
  groep?: string;
  /** Onderwerp van de actie: een latere gelukte stap lost de eerdere fouten met hetzelfde onderwerp op. */
  onderwerp?: string;
  /** Hoe vaak deze melding zich herhaalde (samengevoegd tot één regel). */
  count?: number;
  /** Opgelost door een latere gelukte stap. */
  opgelost?: boolean;
  /**
   * De rij heeft een knop (bv. «Скасувати») — ook als die functie in DIT tabblad niet bestaat (een ander tabblad maakte de melding).
   * Vroeger viel `hasAction` weg zodra een ander tabblad de lijst opsloeg: dat tabblad wist van de knop niets en schreef hem weg.
   */
  heeftActie?: boolean;
};

/** Hoeveel meldingen de lijst bewaart; ouder dan dit valt er vanzelf af. */
export const MAX_RIJEN = 50;
export const historyKey = (scope: string) => `tsv:canonical-notification-history-v2:${scope || 'anon'}`;
const legacyKey = (scope: string) => `tsv:canonical-notification-retained-v1:${scope || 'anon'}`;
const DETAIL_ICONS: CanonicalNoticeDetailIcon[] = ['scope', 'query', 'server', 'provider', 'results', 'durable', 'request', 'saved', 'cursor', 'duration', 'accounts', 'error'];

export const normalizeDetails = (value: unknown): CanonicalNoticeSection[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const section = raw as Record<string, unknown>;
    const title = String(section.title || '').trim().slice(0, 120);
    const items = Array.isArray(section.items)
      ? section.items.slice(0, 20).flatMap((rawItem) => {
        if (!rawItem || typeof rawItem !== 'object') return [];
        const item = rawItem as Record<string, unknown>;
        const label = String(item.label || '').trim().slice(0, 160);
        const detailValue = String(item.value || '').trim().slice(0, 2000);
        const rawIcon = String(item.icon || 'query') as CanonicalNoticeDetailIcon;
        const icon = DETAIL_ICONS.includes(rawIcon) ? rawIcon : 'query';
        return label && detailValue ? [{ icon, label, value: detailValue }] : [];
      })
      : [];
    return title && items.length ? [{ title, items }] : [];
  });
};

/** Alleen interne paden (/…) of https-adressen op tarasevych.com; alles anders valt weg. */
export const normalizeLink = (value: unknown): { href: string; label: string } | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const href = String(raw.href || '').trim().slice(0, 300);
  const label = String(raw.label || '').trim().slice(0, 60);
  if (!label || !href) return undefined;
  if (href.startsWith('/') && !href.startsWith('//')) return { href, label };
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'tarasevych.com' || url.hostname.endsWith('.tarasevych.com'))
      ? { href: url.toString(), label }
      : undefined;
  } catch {
    return undefined;
  }
};

export const normalizeRows = (value: unknown): BewaardeRij[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const text = String(item.text || '').trim();
    if (!text) return [];
    const rawKind = String(item.kind || 'info');
    const kind: CanonicalNoticeKind = rawKind === 'success' || rawKind === 'warning' || rawKind === 'error' ? rawKind : 'info';
    const id = String(item.id || `notice-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const action = Boolean(item.hasAction) ? resolveCanonicalNoticeAction(id) : undefined;
    const details = normalizeDetails(item.details);
    const link = normalizeLink(item.link);
    const explain = typeof item.explain === 'string' && item.explain.trim() ? item.explain.trim().slice(0, 1200) : undefined;
    const context = typeof item.context === 'string' && item.context.trim() ? item.context.trim().slice(0, 200) : undefined;
    const groep = typeof item.groep === 'string' && item.groep ? item.groep.slice(0, 300) : undefined;
    const onderwerp = typeof item.onderwerp === 'string' && item.onderwerp ? item.onderwerp.slice(0, 300) : undefined;
    const count = Math.max(1, Math.min(9999, Math.round(Number(item.count) || 1)));
    return [{
      id, text, kind, createdAt: Number(item.createdAt || Date.now()), source: String(item.source || ''), read: Boolean(item.read),
      ...(item.hasAction ? { heeftActie: true } : {}),
      ...(details.length ? { details } : {}), ...(link ? { link } : {}), ...(action ? { action } : {}), ...(explain ? { explain } : {}), ...(context ? { context } : {}),
      ...(groep ? { groep } : {}), ...(onderwerp ? { onderwerp } : {}), ...(count > 1 ? { count } : {}), ...(item.opgelost ? { opgelost: true } : {}),
    }];
  }).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_RIJEN);
};

/** Schrijft de lijst; false als de opslag niet bruikbaar is (vol, privémodus) — dan leeft de lijst alleen in dit tabblad. */
export const writeRows = (scope: string, rows: BewaardeRij[]): boolean => {
  try {
    localStorage.setItem(historyKey(scope), JSON.stringify(rows.slice(0, MAX_RIJEN).map((item) => ({
      id: item.id, text: item.text, kind: item.kind, createdAt: item.createdAt, source: item.source, read: item.read, hasAction: Boolean(item.action) || Boolean(item.heeftActie),
      ...(item.link ? { link: item.link } : {}), ...(item.details?.length ? { details: item.details } : {}), ...(item.explain ? { explain: item.explain } : {}),
      ...(item.context ? { context: item.context } : {}),
      ...(item.groep ? { groep: item.groep } : {}), ...(item.onderwerp ? { onderwerp: item.onderwerp } : {}), ...(item.count && item.count > 1 ? { count: item.count } : {}),
      ...(item.opgelost ? { opgelost: true } : {}),
    }))));
    return true;
  } catch { return false; /* geen opslag: de lijst leeft dan alleen in dit tabblad */ }
};

/** Wat NU in de opslag staat (een ander tabblad kan het intussen bijgewerkt hebben), of null als er niets of geen opslag is. */
export const leesOpslag = (scope: string): BewaardeRij[] | null => {
  try {
    const saved = localStorage.getItem(historyKey(scope));
    return saved === null ? null : normalizeRows(JSON.parse(saved));
  } catch {
    return null;
  }
};

export const readRows = (scope: string): BewaardeRij[] => {
  try {
    const saved = localStorage.getItem(historyKey(scope));
    if (saved !== null) return normalizeRows(JSON.parse(saved));
    const legacy = normalizeRows(JSON.parse(sessionStorage.getItem(legacyKey(scope)) || '[]'));
    if (legacy.length) writeRows(scope, legacy);
    return legacy;
  } catch {
    return [];
  }
};

/**
 * Eén wijziging aan de lijst: begint bij de opslag (bron van waarheid), valt alleen terug op het geheugen van dit tabblad als de opslag
 * niet bruikbaar is. Geeft de nieuwe lijst en of het wegschrijven lukte (lukt het niet, dan blijft het tabblad op zijn geheugen werken).
 */
export function werkRijenBij(scope: string, geheugen: readonly BewaardeRij[], updater: (rows: BewaardeRij[]) => BewaardeRij[], opslagOk = true): { rijen: BewaardeRij[]; opslagOk: boolean } {
  const vers = opslagOk ? leesOpslag(scope) : null;
  const rijen = updater(vers ?? [...geheugen]).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_RIJEN);
  return { rijen, opslagOk: writeRows(scope, rijen) };
}
