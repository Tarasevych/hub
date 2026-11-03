import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Bell, ChevronDown, ChevronUp, CircleCheck, Layers, Minimize2, RotateCcw, Search, Settings2, Undo2, Volume2, VolumeX, X } from 'lucide-react';
import { Logo } from './mcp-ui';
import { readSharedPreferences, writeSharedPreferences } from './shared-preferences';
import {
  CANONICAL_NOTICE_EVENT, REPORTABLE_STATUS, NOTICE_LIMITS, collapseKeyOf, ingestNotice, normalizeDetails, normalizeLink, pruneNotices, readNoticePolicy,
  registerCanonicalNoticeAction, releaseCanonicalNoticeAction, resolveCanonicalNoticeAction, toastLifetimeMs, writeNoticePolicy,
  type CanonicalNoticeAction, type CanonicalNoticeInput, type CanonicalNoticeKind, type CanonicalServerNotification, type NoticePolicy, type NoticeState, type StoredNotice,
} from './canonical-notifications';
import './canonical-notification-center.css';
import NotificationPanelBody, { IconButton, NoticeSettings, countTabs, tabLabel, tabMatches, TAB_IDS, type BodyActions, type SortId, type TabId } from './NotificationPanelBody';
import { useConnectorActivity, activityLink, activityTitle, statusInfo, type ActivityEvent } from './connector-activity';
import { placeNear } from './notification-position';
import { kindOfStatus, noticeExplain, sectionLabel, siteActionText, statusWord, styleOf, SECTION_SERVICE, type Section, type StatusGroup } from './notification-style';
import { canonicalServiceUrl } from './canonical-service';

type Lang = 'uk' | 'nl';
type Pos = { x: number; y: number };
type ToastItem = {
  key: string; entryId: string; kind: CanonicalNoticeKind; text: string; explain?: string; source: string; link?: { href: string; label: string };
  action?: CanonicalNoticeAction; actionUntil?: number; sticky: boolean; lifetimeMs: number; sound: boolean; origin: 'prop' | 'other'; propText?: string;
};
type Props = {
  lang: Lang; scope: string; notice?: CanonicalNoticeInput | null; serverItems?: CanonicalServerNotification[];
  onDismissNotice?: (text: string) => void; onReadServer?: (id: string) => void | Promise<void>; onReadAllServer?: () => void | Promise<void>;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const storeKey = (scope: string) => `tsv:notice-store-v3:${scope || 'anon'}`;
const legacyKey = (scope: string) => `tsv:canonical-notification-history-v2:${scope || 'anon'}`;
const TAB_KEY = 'tsv:notice-tab-v1';
const GROUP_KEY = 'mr.notif.group';
const WINDOW_SLACK_MS = 3000;
const KINDS = new Set(['info', 'success', 'warning', 'error']);
const STATES = new Set(['open', 'resolved', 'archived']);
const TAB_SET = new Set<string>(TAB_IDS);

/** Oude of beschadigde opslag wordt veilig gelezen: onbekende velden vallen weg, lege regels worden overgeslagen. */
function sanitizeRows(raw: unknown): StoredNotice[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): StoredNotice[] => {
    if (!item || typeof item !== 'object') return [];
    const r = item as Record<string, unknown>;
    const id = String(r.id || '').slice(0, 120);
    const text = String(r.text || '').trim().slice(0, 400);
    if (!id || !text) return [];
    const kind = KINDS.has(String(r.kind)) ? (r.kind as CanonicalNoticeKind) : 'info';
    const state = STATES.has(String(r.state)) ? (r.state as NoticeState) : 'resolved';
    const origin = r.origin === 'activity' || r.origin === 'server' ? r.origin : 'local';
    const createdAt = Number(r.createdAt) || Date.now();
    const updatedAt = Number(r.updatedAt) || createdAt;
    const source = String(r.source || '').slice(0, 80);
    const group = typeof r.group === 'string' && r.group ? r.group : collapseKeyOf(source, kind, text);
    const topic = typeof r.topic === 'string' && r.topic ? r.topic : group;
    const ids = Array.isArray(r.ids) ? r.ids.map((v) => String(v)).slice(-30) : undefined;
    const details = normalizeDetails(r.details);
    return [{
      id, origin, kind, source, text, explain: typeof r.explain === 'string' ? r.explain.slice(0, 1200) : undefined, group, topic,
      status: typeof r.status === 'string' ? r.status : undefined, ids, link: normalizeLink(r.link), details: details.length ? details : undefined,
      createdAt, updatedAt, count: Math.max(1, Math.min(9999, Number(r.count) || 1)), read: Boolean(r.read), state,
      ...(r.manual ? { manual: true } : {}), ...(r.auto ? { auto: true } : {}), ...(r.action ? { action: true } : {}),
    }];
  });
}

/** Vorige versie (alleen lokale meldingen): één keer omzetten; de oude opslag blijft staan. */
function migrateLegacy(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const r = item as Record<string, unknown>;
    const kind = String(r.kind || 'info');
    const text = String(r.text || '');
    const source = String(r.source || '');
    return [{
      id: `n:${String(r.id || '')}`, origin: 'local', kind, source, text, group: collapseKeyOf(source, kind, text), topic: collapseKeyOf(source, kind, text),
      createdAt: r.createdAt, updatedAt: r.createdAt, count: 1, read: Boolean(r.read), state: kind === 'error' || kind === 'warning' ? 'open' : 'resolved',
      link: r.link, details: r.details,
    }];
  });
}

function loadStore(scope: string): StoredNotice[] {
  try {
    const saved = localStorage.getItem(storeKey(scope));
    if (saved !== null) return pruneNotices(sanitizeRows(JSON.parse(saved)), Date.now());
    const legacy = localStorage.getItem(legacyKey(scope));
    if (legacy) return pruneNotices(sanitizeRows(migrateLegacy(JSON.parse(legacy))), Date.now());
  } catch { /* beschadigde opslag: opnieuw beginnen */ }
  return [];
}

function persistStore(scope: string, rows: StoredNotice[]) {
  try { localStorage.setItem(storeKey(scope), JSON.stringify(rows)); } catch { /* geen opslag: alleen deze sessie */ }
}

function readTab(): TabId {
  try { const v = localStorage.getItem(TAB_KEY); return v && TAB_SET.has(v) ? (v as TabId) : 'all'; } catch { return 'all'; }
}
function readGroupPref() {
  try { return localStorage.getItem(GROUP_KEY) !== '0'; } catch { return true; }
}

/* ---------- Activiteit omzetten naar een melding: sectie, wat er gebeurde, oorzaak, en waar u heen kunt ---------- */

function sourceOfEvent(e: ActivityEvent): string {
  if (e.kind === 'site') return e.source;
  if (e.source === 'claude') return 'claude';
  if (e.source === 'browser') return `browser:${/edge/i.test(e.subject) ? 'edge' : /opera/i.test(e.subject) ? 'opera' : /firefox/i.test(e.subject) ? 'firefox' : 'chrome'}`;
  return `agent:${/win/i.test(e.platform || '') ? 'windows' : /darwin|mac/i.test(e.platform || '') ? 'macos' : 'linux'}`;
}

function whatOfEvent(e: ActivityEvent, section: Section, lang: Lang, reason: string): string {
  let what: string;
  if (e.kind === 'site') {
    const title = activityTitle(e, lang);
    const generic = title.startsWith('Дія на сайті') || title.startsWith('Actie op de site');
    what = generic ? siteActionText(e.type, lang) : `${sectionLabel(section, lang)}: ${title}`;
  } else if (e.kind === 'grant') {
    what = activityTitle(e, lang);
  } else {
    what = `${sectionLabel(section, lang)}: ${activityTitle(e, lang)}`;
  }
  // Een korte foutcode (bv. AI_NIET_TOEGESTAAN) hoort zichtbaar bij de titel; de uitleg staat in de zin eronder.
  if (/^[A-Z0-9_]{3,60}$/.test(reason)) what += ` (${reason})`;
  return what;
}

/** Directe knop naar het onderdeel waar de melding te repareren of op te ruimen is. */
function sectionLink(section: Section, lang: Lang): { href: string; label: string } | undefined {
  const service = SECTION_SERVICE[section];
  if (!service) return undefined;
  try {
    const href = canonicalServiceUrl(service, '', lang);
    return { href, label: lang === 'uk' ? `Відкрити: ${sectionLabel(section, lang)}` : `Open: ${sectionLabel(section, lang)}` };
  } catch {
    return undefined;
  }
}

function linkOfEvent(e: ActivityEvent, section: Section, lang: Lang): { href: string; label: string } | undefined {
  if (e.kind !== 'site') {
    const link = activityLink(e, lang);
    return link.href ? link : undefined;
  }
  return sectionLink(section, lang);
}

/** Wat nu te doen bij een melding zonder eigen uitleg (fout of waarschuwing): de melding blijft niet zonder richting. */
const FALLBACK_EXPLAIN: Record<Lang, string> = {
  uk: 'Деталі є в історії. Що зробити: спробуйте ще раз; якщо помилка повторюється, відкрийте розділ і перевірте з’єднання та вхід.',
  nl: 'De details staan in de geschiedenis. Wat nu: probeer het opnieuw; blijft het mislukken, open dan het onderdeel en controleer de verbinding en de aanmelding.',
};

export default function CanonicalNotificationCenter(p: Props) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const prefs = readSharedPreferences();
  const initialPos = prefs.notificationBellPosition || { x: 1, y: 1 };

  const [bellPos, setBellPos] = useState<Pos>({ x: clamp(initialPos.x), y: clamp(initialPos.y) });
  const [sound, setSound] = useState(prefs.notificationSound !== false);
  const [policy, setPolicy] = useState<NoticePolicy>(readNoticePolicy);
  const [store, setStore] = useState<StoredNotice[]>(() => loadStore(p.scope));
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useState<'list' | 'settings'>('list');
  const [tab, setTab] = useState<TabId>(readTab);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortId>('new');
  const [grouped, setGrouped] = useState<boolean>(readGroupPref);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number; maxHeight?: number }>({ left: 8, top: 8 });
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [toastPos, setToastPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const [toastExpanded, setToastExpanded] = useState(false);
  const [toastPaused, setToastPaused] = useState(false);
  const [pct, setPct] = useState(1);
  const [viewportRev, setViewportRev] = useState(0);

  const storeRef = useRef<StoredNotice[]>(store);
  const scopeRef = useRef(p.scope);
  scopeRef.current = p.scope;
  const propsRef = useRef(p);
  propsRef.current = p;
  const policyRef = useRef(policy);
  const soundRef = useRef(sound);
  const toastRef = useRef<ToastItem | null>(null);
  const queueRef = useRef<ToastItem[]>([]);
  const pauseRef = useRef(new Set<string>());
  const unlocked = useRef(false);
  const mountedAt = useRef(Date.now());
  const serverKnown = useRef<Set<string> | null>(null);
  const unreadShownRef = useRef<string[]>([]);
  const closeToastRef = useRef<() => void>(() => {});
  const receiveRef = useRef<(notice: CanonicalNoticeInput) => void>(() => {});
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const toastElRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ id: number; dx: number; dy: number; moved: boolean } | null>(null);
  const ignoreClick = useRef(false);

  const activity = useConnectorActivity(p.scope, p.lang, () => {});

  /* ---------- Opslag ---------- */

  const commit = (rows: StoredNotice[]) => {
    const next = pruneNotices(rows, Date.now());
    storeRef.current = next;
    setStore(next);
    persistStore(scopeRef.current, next);
  };

  const markRead = (id: string) => {
    const rows = storeRef.current;
    const row = rows.find((r) => r.id === id);
    if (!row || row.read) return;
    commit(rows.map((r) => (r.id === id ? { ...r, read: true } : r)));
    if (row.origin === 'server') void propsRef.current.onReadServer?.(id.slice(2));
  };

  /** Alleen meldingen die daadwerkelijk getoond zijn, worden gelezen. */
  const markManyRead = (ids: string[]) => {
    if (!ids.length) return;
    const want = new Set(ids);
    const rows = storeRef.current;
    const serverIds: string[] = [];
    const next = rows.map((r) => {
      if (!want.has(r.id) || r.read) return r;
      if (r.origin === 'server') serverIds.push(r.id.slice(2));
      return { ...r, read: true };
    });
    if (next.every((r, i) => r === rows[i])) return;
    commit(next);
    for (const sid of serverIds) void propsRef.current.onReadServer?.(sid);
  };

  const setRowState = (id: string, state: NoticeState) => {
    const rows = storeRef.current;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    commit(rows.map((r) => (r.id === id ? { ...r, state, manual: true, read: true } : r)));
    if (row.origin === 'server' && !row.read) void propsRef.current.onReadServer?.(id.slice(2));
  };

  /** Alleen lokale meldingen verdwijnen echt; activiteit en site-meldingen blijven in het archief (anders komen ze terug bij het volgende ophalen). */
  const removeRow = (id: string) => {
    const row = storeRef.current.find((r) => r.id === id);
    if (!row || row.origin !== 'local') return;
    releaseCanonicalNoticeAction(id);
    commit(storeRef.current.filter((r) => r.id !== id));
  };

  const markAll = () => {
    const rows = storeRef.current;
    const serverIds = rows.filter((r) => r.origin === 'server' && !r.read).map((r) => r.id.slice(2));
    commit(rows.map((r) => (r.state === 'archived' || r.read ? r : { ...r, read: true })));
    if (serverIds.length) void propsRef.current.onReadAllServer?.();
  };

  /* ---------- Pop-up ---------- */

  const playChime = () => {
    if (!soundRef.current || !(unlocked.current || navigator.userActivation?.hasBeenActive)) return;
    try {
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      gain.connect(ctx.destination);
      for (const [freq, delay] of [[660, 0], [880, 0.075]] as const) {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        osc.type = 'sine';
        osc.connect(gain);
        osc.start(now + delay);
        osc.stop(now + delay + 0.13);
      }
      window.setTimeout(() => void ctx.close(), 400);
    } catch { /* geen geluid beschikbaar */ }
  };

  const showToast = (item: ToastItem) => {
    toastRef.current = item;
    pauseRef.current.clear();
    setToast(item);
    setToastExpanded(false);
    setToastPaused(false);
    setToastPos(null);
    if (item.sound) playChime();
  };

  /** Pop-up tonen, of in de wachtrij zetten als er al een staat. Een soort met "pop-up uit" komt alleen in de geschiedenis. */
  const offerToast = (entry: StoredNotice, opts: { origin: 'prop' | 'other'; action?: CanonicalNoticeAction; actionUntil?: number; propText?: string }) => {
    const row = policyRef.current[entry.kind];
    if (!row.toast) return;
    const lifetime = toastLifetimeMs(policyRef.current, entry.kind, entry.text, entry.explain);
    const item: ToastItem = {
      key: `${entry.id}|${Date.now()}|${Math.random().toString(36).slice(2, 7)}`, entryId: entry.id, kind: entry.kind, text: entry.text, explain: entry.explain,
      source: entry.source, link: entry.link, action: opts.action, actionUntil: opts.actionUntil, sticky: lifetime === null, lifetimeMs: lifetime ?? 0, sound: row.sound,
      origin: opts.origin, propText: opts.propText,
    };
    if (!toastRef.current) {
      showToast(item);
    } else {
      queueRef.current.push(item);
      if (queueRef.current.length > 6) queueRef.current.splice(0, queueRef.current.length - 6);
    }
  };

  const closeToast = () => {
    const current = toastRef.current;
    if (current?.origin === 'prop' && current.propText) propsRef.current.onDismissNotice?.(current.propText);
    const next = queueRef.current.shift() ?? null;
    toastRef.current = next;
    pauseRef.current.clear();
    setToast(next);
    setToastExpanded(false);
    setToastPaused(false);
    setToastPos(null);
    if (next?.sound) playChime();
  };
  closeToastRef.current = closeToast;

  const pauseFor = (source: string, on: boolean) => {
    const set = pauseRef.current;
    if (on) set.add(source); else set.delete(source);
    setToastPaused(set.size > 0);
  };

  const toggleToastExpanded = () => {
    const next = !toastExpanded;
    setToastExpanded(next);
    pauseFor('expanded', next);
  };

  const runAction = async (id: string, action: CanonicalNoticeAction, closeAfter: boolean) => {
    markRead(id);
    try {
      await action.onAction();
      releaseCanonicalNoticeAction(id);
      const rows = storeRef.current;
      commit(rows.map((r) => (r.id === id ? { ...r, action: undefined } : r)));
      setToast((cur) => (cur && cur.entryId === id ? { ...cur, action: undefined, actionUntil: undefined } : cur));
      if (closeAfter && toastRef.current?.entryId === id) closeToast();
    } catch { /* de actie meldt zelf wat er misging */ }
  };

  /* ---------- Binnenkomende meldingen ---------- */

  /** Een losse melding (venster-gebeurtenis of prop). Gelijke meldingen binnen het venster worden één regel met een teller. */
  const receive = (notice: CanonicalNoticeInput, origin: 'prop' | 'other') => {
    const text = String(notice.text || '').trim();
    if (!text) return;
    const kind: CanonicalNoticeKind = notice.kind || 'info';
    const source = String(notice.source || '');
    const now = Date.now();
    const id = notice.key ? `n:${notice.key}` : `n:${now}-${Math.random().toString(36).slice(2, 8)}`;
    if (notice.action) registerCanonicalNoticeAction(id, notice.action);
    const group = collapseKeyOf(source, kind, text);
    const details = normalizeDetails(notice.details);
    const lang = propsRef.current.lang;
    const explain = notice.explain ? notice.explain.slice(0, 1200) : (kind === 'error' || kind === 'warning' ? FALLBACK_EXPLAIN[lang] : undefined);
    const link = normalizeLink(notice.link) || (source ? sectionLink(styleOf(source, lang).section, lang) : undefined);
    const result = ingestNotice(storeRef.current, {
      id, origin: 'local', kind, source, text, explain, group, topic: group,
      link, details: details.length ? details : undefined,
      state: kind === 'error' || kind === 'warning' ? 'open' : 'resolved', read: false, action: Boolean(notice.action), now,
      collapseMs: notice.action ? 0 : (notice.dedupeSeconds ? notice.dedupeSeconds * 1000 : NOTICE_LIMITS.collapseMs),
    });
    commit(result.rows);
    if (result.change === 'new') offerToast(result.entry, { origin, action: notice.action, actionUntil: notice.actionExpiresAt, propText: origin === 'prop' ? text : undefined });
  };
  receiveRef.current = (notice) => receive(notice, 'other');

  /** Activiteit van Claude en uw apparaten: nieuwe of gewijzigde stand wordt een regel; een herhaling met dezelfde stand niet. */
  const ingestActivity = (events: ActivityEvent[]) => {
    if (!events.length) return;
    const lang = propsRef.current.lang;
    const now = Date.now();
    let rows = storeRef.current;
    const toasts: StoredNotice[] = [];
    for (const e of events) {
      const existing = rows.find((r) => r.id === `a:${e.id}` || (r.ids?.includes(e.id) ?? false));
      if (existing && existing.status === e.status) continue;
      const info = statusInfo(e.status, lang);
      const group = info.group as StatusGroup;
      const source = sourceOfEvent(e);
      const section = styleOf(source, lang).section;
      const reason = String((e as ActivityEvent & { reason?: string }).reason || '').trim().slice(0, 160);
      const what = whatOfEvent(e, section, lang, reason);
      const grant = e.kind === 'grant';
      const text = grant ? what : `${what} — ${statusWord(group, lang)}`;
      const explain = grant
        ? (lang === 'uk' ? 'Claude має доступ. Його можна будь-коли відкликати в розділі «Агенти».' : 'Claude heeft toegang. Die kunt u altijd intrekken onder Agenten.')
        : noticeExplain({ group, section, lang, reason });
      const topic = `${e.source}|${e.kind}|${e.type}|${e.subject || ''}`;
      const kind: CanonicalNoticeKind = grant ? 'success' : kindOfStatus(group);
      const state: NoticeState = group === 'done' || grant ? 'resolved' : 'open';
      const result = ingestNotice(rows, {
        id: existing ? existing.id : `a:${e.id}`, origin: 'activity', kind, source, text, explain, group: `${topic}|${group}`, topic, status: e.status, ids: [e.id],
        link: linkOfEvent(e, section, lang), state, read: false, now, collapseMs: NOTICE_LIMITS.collapseMs,
      });
      rows = result.rows;
      const reportable = grant ? result.change === 'new' : REPORTABLE_STATUS.has(group) && (e.kind !== 'site' || group === 'failed');
      const fresh = typeof e.createdAt === 'number' && e.createdAt >= mountedAt.current - WINDOW_SLACK_MS;
      if (reportable && (result.change === 'updated' || (result.change === 'new' && fresh))) toasts.push(result.entry);
    }
    if (rows !== storeRef.current) commit(rows);
    for (const entry of toasts) offerToast(entry, { origin: 'other' });
  };

  /** Site-meldingen van de server: mee in het overzicht; een gelezen melding op de server is hier ook gelezen. */
  const ingestServer = (items: CanonicalServerNotification[]) => {
    let rows = storeRef.current;
    let changed = false;
    for (const item of items) {
      const id = `s:${item.id}`;
      const serverRead = Boolean(item.read);
      const existing = rows.find((r) => r.id === id);
      if (!existing) {
        const kind: CanonicalNoticeKind = /error|fail/i.test(item.kind) ? 'error' : /warn/i.test(item.kind) ? 'warning' : 'info';
        const title = String(item.title || '').slice(0, 300);
        const group = collapseKeyOf('site', kind, title);
        rows = [{ id, origin: 'server', kind, source: 'site', text: title, explain: item.message ? String(item.message).slice(0, 1200) : undefined, group, topic: id, createdAt: item.createdAt, updatedAt: item.createdAt, count: 1, read: serverRead, state: serverRead ? 'resolved' : 'open' }, ...rows];
        changed = true;
      } else if (serverRead && !existing.read) {
        rows = rows.map((r) => (r.id === id ? { ...r, read: true, state: r.manual || r.state !== 'open' ? r.state : 'resolved' } : r));
        changed = true;
      }
    }
    if (changed) commit(rows);
  };

  /* ---------- Effecten ---------- */

  useEffect(() => {
    const next = loadStore(p.scope);
    storeRef.current = next;
    setStore(next);
    serverKnown.current = null;
  }, [p.scope]);

  useEffect(() => { soundRef.current = sound; }, [sound]);

  useEffect(() => {
    const unlock = () => { unlocked.current = true; };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => { window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => receiveRef.current((event as CustomEvent<CanonicalNoticeInput>).detail);
    window.addEventListener(CANONICAL_NOTICE_EVENT, handler);
    return () => window.removeEventListener(CANONICAL_NOTICE_EVENT, handler);
  }, [p.scope]);

  const noticeSignature = p.notice ? `${p.notice.kind || 'info'}\u001f${p.notice.text}` : '';
  const lastNoticeSignature = useRef('');
  useEffect(() => {
    if (!noticeSignature) { lastNoticeSignature.current = ''; return; }
    if (noticeSignature === lastNoticeSignature.current) return;
    lastNoticeSignature.current = noticeSignature;
    if (p.notice) receive(p.notice, 'prop');
  }, [noticeSignature]);

  useEffect(() => { ingestActivity(activity.events); }, [activity.events]);

  const serverSig = (p.serverItems || []).map((item) => `${item.id}:${item.read ? 1 : 0}`).join('|');
  useEffect(() => {
    ingestServer(p.serverItems || []);
    const unreadIds = new Set((p.serverItems || []).filter((item) => !item.read).map((item) => item.id));
    if (serverKnown.current === null) { serverKnown.current = unreadIds; return; }
    const added = [...unreadIds].some((id) => !serverKnown.current?.has(id));
    serverKnown.current = unreadIds;
    if (added) playChime();
  }, [serverSig]);

  // De pop-up van een melding telt als gelezen zodra die op het scherm staat.
  useEffect(() => { if (toast) markRead(toast.entryId); }, [toast?.key]);

  // Pop-up met een knop: de knop verdwijnt na de geldigheidsduur.
  useEffect(() => {
    if (!toast?.action || !toast.actionUntil) return;
    const key = toast.key;
    const wait = Math.max(0, toast.actionUntil - Date.now()) + 25;
    const timer = window.setTimeout(() => setToast((cur) => (cur && cur.key === key ? { ...cur, action: undefined, actionUntil: undefined } : cur)), wait);
    return () => window.clearTimeout(timer);
  }, [toast?.key]);

  // Aftellen van de pop-up. Hover, focus of uitklappen houdt hem open; loslaten telt verder.
  useEffect(() => {
    setPct(1);
    if (!toast || toast.sticky || toast.lifetimeMs <= 0) return;
    let left = toast.lifetimeMs;
    const timer = window.setInterval(() => {
      if (pauseRef.current.size) return;
      left -= 100;
      if (left <= 0) { window.clearInterval(timer); closeToastRef.current(); return; }
      setPct(left / toast.lifetimeMs);
    }, 100);
    return () => window.clearInterval(timer);
  }, [toast?.key]);

  useEffect(() => {
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* geen opslag */ }
  }, [tab]);

  // Ongelezen meldingen die in het open venster zichtbaar zijn, tellen als gelezen (na een korte weergave).
  // Op het tabblad Ongelezen blijven ze staan tot het venster dicht gaat, anders verdwijnt de lijst terwijl u kijkt.
  const shownUnreadIds = panelOpen && view === 'list' ? store.filter((r) => tabMatches(tab, r) && !r.read).map((r) => r.id) : [];
  const shownKey = shownUnreadIds.join(',') + `|${tab}`;
  useEffect(() => {
    if (!shownUnreadIds.length) return;
    if (tab === 'unread') { unreadShownRef.current = shownUnreadIds; return; }
    const timer = window.setTimeout(() => markManyRead(shownUnreadIds), 700);
    return () => window.clearTimeout(timer);
  }, [shownKey]);

  // Bij sluiten van het venster op het tabblad Ongelezen: wat daar getoond werd, is gezien.
  useEffect(() => {
    if (panelOpen) return;
    const ids = unreadShownRef.current;
    unreadShownRef.current = [];
    markManyRead(ids);
  }, [panelOpen]);

  useEffect(() => {
    const update = () => setViewportRev((value) => value + 1);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setPanelOpen(false);
      bellRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('.cnc-window') || target.closest('.canonical-notification-bell') || target.closest('.cnc-toast')) return;
      const control = target.closest('button,a,input,select,textarea,[role="button"],[role="menuitem"],[role="checkbox"]');
      const functional = Boolean(control && !control.matches('.google-mail-open'));
      if (functional) { window.setTimeout(() => setPanelOpen(false), 0); return; }
      const blockClick = (next: MouseEvent) => { next.preventDefault(); next.stopPropagation(); };
      document.addEventListener('click', blockClick, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener('click', blockClick, true), 450);
      event.preventDefault();
      event.stopPropagation();
      setPanelOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [panelOpen]);

  const viewport = () => {
    const vv = window.visualViewport;
    return { left: vv?.offsetLeft || 0, top: vv?.offsetTop || 0, width: vv?.width || window.innerWidth, height: vv?.height || window.innerHeight };
  };
  const overlaySafeInset = () => (window.self !== window.top ? 72 : 0);
  const bellStyle = () => {
    const v = viewport();
    const size = 48; const pad = 10; const overlaySafe = overlaySafeInset();
    const maxX = Math.max(0, v.width - size - pad * 2 - overlaySafe);
    const maxY = Math.max(0, v.height - size - pad * 2 - overlaySafe);
    return { left: v.left + pad + bellPos.x * maxX, top: v.top + pad + bellPos.y * maxY };
  };
  const bellCss = bellStyle();

  // Het venster naast de bel plaatsen, binnen het scherm.
  useLayoutEffect(() => {
    if (!panelOpen) return;
    const panel = panelRef.current;
    const bell = bellRef.current;
    if (!panel || !bell) return;
    const v = viewport();
    const rect = bell.getBoundingClientRect();
    const previous = panel.style.maxHeight;
    panel.style.maxHeight = 'none';
    const natural = Math.min(panel.offsetHeight, 760);
    panel.style.maxHeight = previous;
    const place = placeNear({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, { width: panel.offsetWidth, height: natural }, v);
    setPanelPos((current) => (current.left === place.left && current.top === place.top && current.maxHeight === place.maxHeight ? current : { left: place.left, top: place.top, maxHeight: place.maxHeight }));
  }, [panelOpen, bellPos.x, bellPos.y, viewportRev, store.length, view, tab]);

  useEffect(() => {
    if (!panelOpen || typeof ResizeObserver === 'undefined') return;
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => setViewportRev((value) => value + 1));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panelOpen]);

  // De pop-up naast de bel, zodat die bij de bel hoort en niet midden op het scherm verschijnt.
  useLayoutEffect(() => {
    const el = toastElRef.current;
    const bell = bellRef.current;
    if (!toast || !el || !bell) return;
    const v = viewport();
    const rect = bell.getBoundingClientRect();
    const place = placeNear({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, { width: el.offsetWidth, height: el.offsetHeight }, v, { gap: 10 });
    setToastPos((current) => (current && current.left === place.left && current.top === place.top && current.maxHeight === place.maxHeight ? current : { left: place.left, top: place.top, maxHeight: place.maxHeight }));
  }, [toast?.key, toastExpanded, bellPos.x, bellPos.y, viewportRev]);

  useEffect(() => {
    const el = toastElRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setViewportRev((value) => value + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [toast?.key]);

  /* ---------- Bel verslepen ---------- */

  const onBellDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top, moved: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* niet nodig */ }
  };
  const onBellMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const v = viewport();
    const size = 48; const pad = 10; const overlaySafe = overlaySafeInset();
    const maxX = Math.max(1, v.width - size - pad * 2 - overlaySafe);
    const maxY = Math.max(1, v.height - size - pad * 2 - overlaySafe);
    const left = Math.max(v.left + pad, Math.min(event.clientX - drag.dx, v.left + v.width - size - pad - overlaySafe));
    const top = Math.max(v.top + pad, Math.min(event.clientY - drag.dy, v.top + v.height - size - pad - overlaySafe));
    if (Math.abs(event.movementX) + Math.abs(event.movementY) > 1) drag.moved = true;
    setBellPos({ x: clamp((left - v.left - pad) / maxX), y: clamp((top - v.top - pad) / maxY) });
  };
  const onBellUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    if (drag.moved) {
      ignoreClick.current = true;
      writeSharedPreferences({ notificationBellPosition: bellPos });
    }
  };
  const toggleBell = () => {
    if (ignoreClick.current) { ignoreClick.current = false; return; }
    setPanelOpen((value) => !value);
  };
  const resetPosition = () => {
    const next = { x: 1, y: 1 };
    setBellPos(next);
    writeSharedPreferences({ notificationBellPosition: next });
  };
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    soundRef.current = next;
    writeSharedPreferences({ notificationSound: next });
  };
  const savePolicy = (next: NoticePolicy) => {
    policyRef.current = next;
    setPolicy(next);
    writeNoticePolicy(next);
  };
  const selectTab = (next: TabId) => { setTab(next); setView('list'); };

  /* ---------- Weergave ---------- */

  const counts = useMemo(() => countTabs(store), [store]);
  const unreadCount = store.filter((r) => r.state !== 'archived' && !r.read).length;
  const storedCount = store.filter((r) => r.state !== 'archived').length;
  const archivedCount = counts.archive;
  const toastStyle = toastPos ? { left: toastPos.left, top: toastPos.top, maxHeight: toastPos.maxHeight } : { opacity: 0 };

  const bodyActions: BodyActions = {
    open: (id) => markRead(id),
    toggleRead: (id) => {
      const row = storeRef.current.find((r) => r.id === id);
      if (!row) return;
      if (row.read) commit(storeRef.current.map((r) => (r.id === id ? { ...r, read: false } : r)));
      else markRead(id);
    },
    setState: setRowState,
    remove: removeRow,
    run: (id) => {
      const action = resolveCanonicalNoticeAction(id);
      if (action) void runAction(id, action, false);
    },
    actionLabel: (id) => resolveCanonicalNoticeAction(id)?.label,
  };

  const toastStyleInfo = toast ? styleOf(toast.source, p.lang) : null;

  return (
    <>
      {toast && toastStyleInfo ? (
        <section
          ref={toastElRef as never}
          data-qa-id='canonical-notification-toast'
          className={`cnc-toast kind-${toast.kind} sec-${toastStyleInfo.section}${toast.sticky ? ' is-sticky' : ''}${toastPaused ? ' is-paused' : ''}${toastExpanded ? ' is-expanded' : ''}`}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          style={toastStyle}
          onPointerEnter={() => pauseFor('hover', true)}
          onPointerLeave={() => pauseFor('hover', false)}
          onFocus={() => pauseFor('focus', true)}
          onBlur={() => pauseFor('focus', false)}
        >
          <span className='cnc-toast-icon' aria-hidden='true' title={`${toastStyleInfo.label}${toastStyleInfo.providerLabel ? ` · ${toastStyleInfo.providerLabel}` : ''}`}>
            <toastStyleInfo.Icon aria-hidden='true' />
            {toastStyleInfo.provider ? <span className='cnc-provider'><Logo kind={toastStyleInfo.provider} size={12} label={toastStyleInfo.providerLabel} /></span> : null}
          </span>
          <div className='cnc-toast-body'>
            <span className='cnc-toast-sec'>{toastStyleInfo.label}{toastStyleInfo.providerLabel && toastStyleInfo.providerLabel !== toastStyleInfo.label ? ` · ${toastStyleInfo.providerLabel}` : ''}</span>
            <strong className='cnc-toast-title'>{toast.text}</strong>
            {toast.explain ? <p className='cnc-toast-explain'>{toast.explain}</p> : null}
            {toast.link ? <a className='cnc-toast-link' href={toast.link.href} onClick={() => markRead(toast.entryId)}>{toast.link.label} →</a> : null}
          </div>
          <div className='cnc-toast-side'>
            {toast.action ? <IconButton label={toast.action.label} onClick={() => void runAction(toast.entryId, toast.action!, true)}><Undo2 /></IconButton> : null}
            {toast.explain ? (
              <IconButton label={toastExpanded ? t('Менше', 'Minder') : t('Докладніше', 'Meer')} expanded={toastExpanded} onClick={toggleToastExpanded}>
                {toastExpanded ? <ChevronUp /> : <ChevronDown />}
              </IconButton>
            ) : null}
            <IconButton label={t('Закрити', 'Sluiten')} onClick={closeToast}><X /></IconButton>
          </div>
          {toast.sticky ? null : (
            <div className='cnc-toast-bar' aria-hidden='true'>
              <i style={{ transform: `scaleX(${pct})` }} />
            </div>
          )}
        </section>
      ) : null}

      <button
        ref={bellRef}
        data-qa-id='canonical-notification-bell'
        type='button'
        className='canonical-notification-bell'
        style={{ left: bellCss.left, top: bellCss.top }}
        aria-expanded={panelOpen}
        aria-label={unreadCount ? t(`Непрочитаних сповіщень: ${unreadCount}`, `Ongelezen meldingen: ${unreadCount}`) : storedCount ? t(`Історія сповіщень: ${storedCount}`, `Meldingsgeschiedenis: ${storedCount}`) : t('Сповіщення', 'Meldingen')}
        onPointerDown={onBellDown}
        onPointerMove={onBellMove}
        onPointerUp={onBellUp}
        onClick={toggleBell}
      >
        <Bell />
        {unreadCount > 0 ? <small>{unreadCount > 99 ? '99+' : unreadCount}</small> : null}
      </button>

      {panelOpen ? (
        <section
          ref={panelRef as never}
          data-qa-id='canonical-notification-panel'
          className='cnc-window'
          role='dialog'
          aria-label={t('Центр сповіщень', 'Meldingencentrum')}
          style={panelPos}
        >
          <header className='cnc-titlebar'>
            <span className='cnc-titlebar-icon' aria-hidden='true'><Bell /></span>
            <div className='cnc-titlebar-text'>
              <strong>{view === 'settings' ? t('Налаштування сповіщень', 'Instellingen meldingen') : t('Сповіщення', 'Meldingen')}</strong>
              <small>{unreadCount ? t(`Непрочитаних: ${unreadCount}`, `Ongelezen: ${unreadCount}`) : t('Усе прочитано', 'Alles gelezen')}</small>
            </div>
            <div className='cnc-titlebar-actions'>
              <IconButton label={view === 'settings' ? t('Назад до списку', 'Terug naar de lijst') : t('Налаштування', 'Instellingen')} pressed={view === 'settings'} onClick={() => setView((v) => (v === 'settings' ? 'list' : 'settings'))}>
                <Settings2 />
              </IconButton>
              <IconButton label={sound ? t('Звук вимкнути', 'Geluid uit') : t('Звук увімкнути', 'Geluid aan')} pressed={sound} onClick={toggleSound}>
                {sound ? <Volume2 /> : <VolumeX />}
              </IconButton>
              <IconButton label={t('Усе позначити прочитаним', 'Alles als gelezen markeren')} onClick={() => markAll()}><CircleCheck /></IconButton>
              <IconButton label={t('Повернути піктограму в кут', 'Bel terug naar de hoek')} onClick={resetPosition}><RotateCcw /></IconButton>
              <IconButton label={t('Згорнути', 'Inklappen')} onClick={() => setPanelOpen(false)}><Minimize2 /></IconButton>
            </div>
          </header>

          {view === 'list' ? (
            <>
              <nav className='cnc-tabs' role='tablist' aria-label={t('Вигляд', 'Weergave')}>
                {TAB_IDS.map((id) => (
                  <button key={id} type='button' role='tab' aria-selected={tab === id} className={`cnc-tab${tab === id ? ' is-active' : ''}`} onClick={() => selectTab(id)}>
                    <span>{tabLabel(id, p.lang)}</span>
                    <b className='cnc-tab-n'>{counts[id]}</b>
                  </button>
                ))}
              </nav>
              <div className='cnc-tools'>
                <label className='cnc-search'>
                  <Search aria-hidden='true' />
                  <input type='search' value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Пошук у сповіщеннях', 'Zoeken in meldingen')} aria-label={t('Пошук у сповіщеннях', 'Zoeken in meldingen')} />
                </label>
                <select className='cnc-sort' aria-label={t('Порядок', 'Volgorde')} value={sort} onChange={(e) => setSort(e.target.value as SortId)}>
                  <option value='new'>{t('Спершу нові', 'Nieuwste eerst')}</option>
                  <option value='old'>{t('Спершу старі', 'Oudste eerst')}</option>
                  <option value='unread'>{t('Непрочитані зверху', 'Ongelezen bovenaan')}</option>
                  <option value='kind'>{t('Найважливіші зверху', 'Belangrijkste eerst')}</option>
                </select>
                <IconButton
                  label={grouped ? t('Групування: увімкнено', 'Groeperen: aan') : t('Групування: вимкнено', 'Groeperen: uit')}
                  pressed={grouped}
                  onClick={() => { const next = !grouped; setGrouped(next); try { localStorage.setItem(GROUP_KEY, next ? '1' : '0'); } catch { /* geen opslag */ } }}
                >
                  <Layers />
                </IconButton>
              </div>
              <NotificationPanelBody lang={p.lang} rows={store} tab={tab} query={query} sort={sort} grouped={grouped} actions={bodyActions} />
            </>
          ) : (
            <NoticeSettings lang={p.lang} policy={policy} onChange={savePolicy} sound={sound} onSound={(on) => { setSound(on); soundRef.current = on; writeSharedPreferences({ notificationSound: on }); }} />
          )}

          <footer className='cnc-statusbar'>
            <span>{t(`Історія: ${storedCount} · в архіві: ${archivedCount}`, `Geschiedenis: ${storedCount} · archief: ${archivedCount}`)}</span>
            <span>{t('Старі повідомлення чистяться самі', 'Oude meldingen worden vanzelf opgeruimd')}</span>
          </footer>
        </section>
      ) : null}
    </>
  );
}
