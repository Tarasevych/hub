// Meldingen: gedeelde types, het venster van de bel, en de zuivere regels (samenvoegen, oplossen, opruimen, looptijd van de pop-up).
// Zuiver waar mogelijk, zodat de regels zonder browser getest kunnen worden (tests/eenheid/notice-dedupe.test.ts).

export type CanonicalNoticeKind = 'info' | 'success' | 'warning' | 'error';
export type CanonicalNoticeAction = { label: string; onAction: () => void | Promise<void> };
export type CanonicalNoticeDetailIcon = 'scope' | 'query' | 'server' | 'provider' | 'results' | 'durable' | 'request' | 'saved' | 'cursor' | 'duration' | 'accounts' | 'error';
export type CanonicalNoticeDetail = { icon: CanonicalNoticeDetailIcon; label: string; value: string };
export type CanonicalNoticeSection = { title: string; items: CanonicalNoticeDetail[] };

export type CanonicalNoticeInput = {
  text: string;
  kind?: CanonicalNoticeKind;
  source?: string;
  action?: CanonicalNoticeAction;
  retain?: boolean;
  transient?: boolean;
  link?: { href: string; label: string };
  dedupeSeconds?: number;
  actionExpiresAt?: number;
  details?: CanonicalNoticeSection[];
  /** Uitleg in gewone taal: wat de oorzaak is en wat de gebruiker nu kan doen. */
  explain?: string;
  /** Stabiele sleutel van de gebeurtenis; anders afgeleid van bron, soort en tekst. */
  key?: string;
};

export type CanonicalServerNotification = { id: string; kind: string; title: string; message: string; createdAt: number; read?: boolean };

const canonicalNoticeActionRegistry = new Map<string, CanonicalNoticeAction>();
export const registerCanonicalNoticeAction = (id: string, action: CanonicalNoticeAction) => { if (id) canonicalNoticeActionRegistry.set(id, action); };
export const resolveCanonicalNoticeAction = (id: string) => canonicalNoticeActionRegistry.get(id);
export const releaseCanonicalNoticeAction = (id: string) => { if (id) canonicalNoticeActionRegistry.delete(id); };

export const CANONICAL_NOTICE_EVENT = 'tsv:canonical-notice';
const RECENT_KEY = 'tsv:notice-recent-v1';

/** Dezelfde melding (bron + soort + tekst) binnen korte tijd verschijnt maar één keer, ook als meerdere tabbladen dezelfde gebeurtenis zien. Meldingen met een knop (actie) worden nooit onderdrukt. */
const isRecentDuplicate = (notice: CanonicalNoticeInput) => {
  if (notice.action) return false;
  try {
    const ttl = Math.max(5, notice.dedupeSeconds ?? 90) * 1000;
    const now = Date.now();
    const key = `${notice.source || ''}|${notice.kind || 'info'}|${notice.text}`;
    const map = JSON.parse(localStorage.getItem(RECENT_KEY) || '{}') as Record<string, number>;
    for (const k of Object.keys(map)) if (now - map[k] > 6 * 3600_000) delete map[k];
    const last = map[key];
    if (last && now - last < ttl) return true;
    map[key] = now;
    const keys = Object.keys(map);
    if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete map[k];
    localStorage.setItem(RECENT_KEY, JSON.stringify(map));
    return false;
  } catch {
    return false;
  }
};

export const emitCanonicalNotice = (notice: CanonicalNoticeInput) => {
  if (isRecentDuplicate(notice)) return;
  window.dispatchEvent(new CustomEvent<CanonicalNoticeInput>(CANONICAL_NOTICE_EVENT, { detail: notice }));
};

/* ---------- Gegevens die tegen de site en de opslag worden gecontroleerd ---------- */

const DETAIL_ICONS: CanonicalNoticeDetailIcon[] = ['scope', 'query', 'server', 'provider', 'results', 'durable', 'request', 'saved', 'cursor', 'duration', 'accounts', 'error'];

export function normalizeDetails(value: unknown): CanonicalNoticeSection[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const section = raw as Record<string, unknown>;
    const title = String(section.title || '').trim().slice(0, 120);
    const items = Array.isArray(section.items) ? section.items.slice(0, 20).flatMap((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object') return [];
      const item = rawItem as Record<string, unknown>;
      const label = String(item.label || '').trim().slice(0, 160);
      const detailValue = String(item.value || '').trim().slice(0, 2000);
      const rawIcon = String(item.icon || 'query') as CanonicalNoticeDetailIcon;
      const icon = DETAIL_ICONS.includes(rawIcon) ? rawIcon : 'query';
      return label && detailValue ? [{ icon, label, value: detailValue }] : [];
    }) : [];
    return title && items.length ? [{ title, items }] : [];
  });
}

/** Alleen interne paden (/…) of https-adressen op tarasevych.com; alles anders wordt weggelaten. */
export function normalizeLink(value: unknown): { href: string; label: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const href = String(raw.href || '').trim().slice(0, 300);
  const label = String(raw.label || '').trim().slice(0, 60);
  if (!label || !href) return undefined;
  if (href.startsWith('/') && !href.startsWith('//')) return { href, label };
  try {
    const url = new URL(href);
    const ok = url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'tarasevych.com' || url.hostname.endsWith('.tarasevych.com'));
    return ok ? { href: url.toString(), label } : undefined;
  } catch {
    return undefined;
  }
}

/* ---------- Voorkeuren: per soort melding (pop-up, geluid, blijft staan, duur) ---------- */

export type NoticePolicyKind = { toast: boolean; sound: boolean; sticky: boolean; seconds: number };
export type NoticePolicy = Record<CanonicalNoticeKind, NoticePolicyKind>;
export const NOTICE_KINDS: CanonicalNoticeKind[] = ['error', 'warning', 'success', 'info'];
export const NOTICE_SECONDS_CHOICES = [3, 5, 7, 10, 14, 20, 30, 60];
export const NOTICE_POLICY_KEY = 'tsv:notice-policy-v1';
export const DEFAULT_NOTICE_POLICY: NoticePolicy = {
  error: { toast: true, sound: true, sticky: false, seconds: 14 },
  warning: { toast: true, sound: true, sticky: false, seconds: 10 },
  success: { toast: true, sound: false, sticky: false, seconds: 5 },
  info: { toast: true, sound: false, sticky: false, seconds: 7 },
};

const clampSeconds = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(60, Math.max(3, Math.round(n))) : fallback;
};

export function normalizeNoticePolicy(raw: unknown): NoticePolicy {
  const source = raw && typeof raw === 'object' ? raw as Record<string, Partial<NoticePolicyKind>> : {};
  const out = {} as NoticePolicy;
  for (const kind of NOTICE_KINDS) {
    const base = DEFAULT_NOTICE_POLICY[kind];
    const row = source[kind] && typeof source[kind] === 'object' ? source[kind] : {};
    out[kind] = {
      toast: typeof row.toast === 'boolean' ? row.toast : base.toast,
      sound: typeof row.sound === 'boolean' ? row.sound : base.sound,
      sticky: typeof row.sticky === 'boolean' ? row.sticky : base.sticky,
      seconds: clampSeconds(row.seconds, base.seconds),
    };
  }
  return out;
}

export function readNoticePolicy(): NoticePolicy {
  try { return normalizeNoticePolicy(JSON.parse(localStorage.getItem(NOTICE_POLICY_KEY) || 'null')); } catch { return normalizeNoticePolicy(null); }
}

export function writeNoticePolicy(policy: NoticePolicy) {
  try { localStorage.setItem(NOTICE_POLICY_KEY, JSON.stringify(policy)); } catch { /* geen opslag: de voorkeur geldt dan alleen deze keer */ }
}

/** Hoe lang een pop-up blijft staan: de duur van de soort, plus wat extra tijd voor een lange tekst en een uitleg. Null = blijft staan tot u sluit. */
export function toastLifetimeMs(policy: NoticePolicy, kind: CanonicalNoticeKind, text: string, explain?: string): number | null {
  const row = policy[kind];
  if (row.sticky) return null;
  const lengthExtra = Math.min(4000, Math.floor(text.length / 60) * 1000);
  const explainExtra = explain ? Math.min(6000, 2000 + Math.floor(explain.length / 120) * 1000) : 0;
  return row.seconds * 1000 + lengthExtra + explainExtra;
}

/* ---------- Het meldingenarchief: samenvoegen, oplossen en opruimen ---------- */

export type NoticeState = 'open' | 'resolved' | 'archived';
export type NoticeOrigin = 'local' | 'activity' | 'server';
export type StoredNotice = {
  id: string; origin: NoticeOrigin; kind: CanonicalNoticeKind; source: string; text: string; explain?: string;
  /** Samenvoeg-sleutel: gelijke meldingen binnen het venster worden één regel met een teller. */
  group: string;
  /** Onderwerp: alle stappen van dezelfde actie (bv. "in behandeling" en "mislukt"); een later gelukte stap lost de eerdere op. */
  topic: string;
  status?: string; ids?: string[]; link?: { href: string; label: string }; details?: CanonicalNoticeSection[];
  createdAt: number; updatedAt: number; count: number; read: boolean; state: NoticeState;
  /** De gebruiker heeft de staat zelf gekozen; een nieuwe gebeurtenis verandert die dan niet meer. */
  manual?: boolean;
  /** Automatisch gearchiveerd door de houdbaarheidsregels. */
  auto?: boolean;
  /** Had een knop (actie) toen het werd gemeld. */
  action?: boolean;
};

export const NOTICE_LIMITS = { max: 200, openDays: 14, resolvedDays: 30, archivedDays: 60, collapseMs: 10 * 60_000 };
const DAY = 86_400_000;

export const collapseKeyOf = (source: string, kind: string, text: string) =>
  `${source}|${kind}|${text.toLowerCase().replace(/[\d«»"'“”‘’.,:;!?()[\]{}]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)}`;

/** Houdbaarheid: open na 14 dagen en opgeloste na 30 dagen naar het archief; het archief wordt na 60 dagen gewist; nooit meer dan 200 regels. */
export function pruneNotices(rows: StoredNotice[], now: number): StoredNotice[] {
  const aged = rows.map((row) => {
    const age = now - row.updatedAt;
    if (row.state === 'open' && age > NOTICE_LIMITS.openDays * DAY) return { ...row, state: 'archived' as NoticeState, auto: true };
    if (row.state === 'resolved' && age > NOTICE_LIMITS.resolvedDays * DAY) return { ...row, state: 'archived' as NoticeState, auto: true };
    return row;
  });
  const kept = aged.filter((row) => !(row.state === 'archived' && now - row.updatedAt > NOTICE_LIMITS.archivedDays * DAY));
  return kept.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, NOTICE_LIMITS.max);
}

export type Incoming = {
  id: string; origin: NoticeOrigin; kind: CanonicalNoticeKind; source: string; text: string; explain?: string;
  group: string; topic: string; status?: string; ids?: string[]; link?: { href: string; label: string }; details?: CanonicalNoticeSection[];
  state: NoticeState; read?: boolean; action?: boolean; now: number; collapseMs: number;
};
export type IngestResult = { rows: StoredNotice[]; change: 'new' | 'merged' | 'updated' | 'same'; entry: StoredNotice };

/**
 * Voegt één gebeurtenis toe aan het archief.
 * - zelfde id: bij een activiteit met dezelfde stand niets (geen herhaling); bij een andere stand bijwerken; bij een lokale melding een teller omhoog.
 * - zelfde samenvoeg-sleutel binnen het venster: één regel met teller ("merged"), zonder nieuwe pop-up.
 * - anders een nieuwe regel ("new").
 * Een gelukte stap (state resolved) lost openstaande stappen met hetzelfde onderwerp op.
 */
export function ingestNotice(rows: StoredNotice[], inc: Incoming): IngestResult {
  const existing = rows.find((row) => row.id === inc.id);
  let next = rows;
  let result: IngestResult;
  if (existing) {
    if (inc.origin === 'activity' && existing.status === inc.status) return { rows, change: 'same', entry: existing };
    const updated: StoredNotice = inc.origin === 'local'
      ? { ...existing, count: existing.count + 1, updatedAt: inc.now, read: false }
      : { ...existing, status: inc.status, text: inc.text, explain: inc.explain, kind: inc.kind, updatedAt: inc.now, read: existing.status === inc.status ? existing.read : false, state: existing.manual ? existing.state : inc.state, ids: unionIds(existing.ids, inc.ids) };
    next = rows.map((row) => (row.id === inc.id ? updated : row));
    result = { rows: next, change: inc.origin === 'local' ? 'merged' : 'updated', entry: updated };
  } else {
    const collapse = inc.collapseMs > 0 ? rows.find((row) => row.origin === inc.origin && row.group === inc.group && row.state !== 'archived' && inc.now - row.updatedAt <= inc.collapseMs) : undefined;
    if (collapse) {
      const merged: StoredNotice = { ...collapse, count: collapse.count + 1, updatedAt: inc.now, read: false, status: inc.status ?? collapse.status, explain: inc.explain ?? collapse.explain, state: collapse.manual ? collapse.state : inc.state, ids: unionIds(collapse.ids, inc.ids) };
      next = rows.map((row) => (row.id === collapse.id ? merged : row));
      result = { rows: next, change: 'merged', entry: merged };
    } else {
      const created: StoredNotice = {
        id: inc.id, origin: inc.origin, kind: inc.kind, source: inc.source, text: inc.text, explain: inc.explain, group: inc.group, topic: inc.topic,
        status: inc.status, ids: inc.ids, link: inc.link, details: inc.details, createdAt: inc.now, updatedAt: inc.now, count: 1,
        read: inc.read ?? false, state: inc.state, ...(inc.action ? { action: true } : {}),
      };
      next = [created, ...rows];
      result = { rows: next, change: 'new', entry: created };
    }
  }
  if (inc.state === 'resolved' && inc.topic) {
    const resolvedId = result.entry.id;
    next = next.map((row) => (row.id !== resolvedId && row.topic === inc.topic && row.state === 'open' && !row.manual ? { ...row, state: 'resolved' as NoticeState, updatedAt: row.updatedAt } : row));
    result = { ...result, rows: next };
  }
  return result;
}

function unionIds(a?: string[], b?: string[]) {
  if (!a && !b) return undefined;
  return [...new Set([...(a || []), ...(b || [])])].slice(-30);
}

/** Welke statussen een pop-up waard zijn (een tussenstand als "actief" niet). */
export const REPORTABLE_STATUS = new Set(['waiting', 'failed', 'rejected', 'expired', 'done']);
