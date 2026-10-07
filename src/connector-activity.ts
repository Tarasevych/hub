import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { serviceFromLocation } from './canonical-navigation';
import type { CanonicalNoticeInput } from './canonical-notifications';
import { COMMAND_LABELS } from './agents-data';
import { textOf } from './mcp-texts';

export type ActivityEvent = {
  id: string; source: 'claude' | 'agent' | 'browser'; kind: 'command' | 'tool' | 'grant'; type: string; subject: string;
  status: string; createdAt: number; finishedAt: number | null;
};
type Lang = 'uk' | 'nl';

const STATUS: Record<string, { uk: string; nl: string; group: 'waiting' | 'active' | 'done' | 'failed' | 'rejected' | 'expired' }> = {
  pending_approval: { uk: 'чекає вашого рішення', nl: 'wacht op uw beslissing', group: 'waiting' },
  approved: { uk: 'виконується', nl: 'wordt uitgevoerd', group: 'active' },
  sent: { uk: 'виконується', nl: 'wordt uitgevoerd', group: 'active' },
  active: { uk: 'активний', nl: 'actief', group: 'active' },
  succeeded: { uk: 'виконано', nl: 'uitgevoerd', group: 'done' },
  failed: { uk: 'помилка', nl: 'mislukt', group: 'failed' },
  rejected: { uk: 'відхилено', nl: 'geweigerd', group: 'rejected' },
  timeout: { uk: 'час вийшов', nl: 'verlopen', group: 'expired' },
};
export const statusInfo = (status: string, lang: Lang) => {
  const s = STATUS[status] ?? { uk: status, nl: status, group: 'active' as const };
  return { text: lang === 'uk' ? s.uk : s.nl, group: s.group };
};

/** Naam van de actie in de taal van de site (nooit de Engelse beschrijving). */
export function activityTitle(e: ActivityEvent, lang: Lang): string {
  if (e.kind === 'grant') return lang === 'uk' ? `Claude підключено: ${e.subject}` : `Claude verbonden: ${e.subject}`;
  if (e.kind === 'tool') return textOf(e.type, lang)?.title || e.type;
  const label = COMMAND_LABELS[e.type];
  return label ? (lang === 'uk' ? label[0] : label[1]) : e.type;
}
export const sourceLabel = (source: string, lang: Lang): string => ({
  claude: 'Claude', agent: lang === 'uk' ? 'Пристрій' : 'Apparaat', browser: lang === 'uk' ? 'Браузер' : 'Browser',
} as Record<string, string>)[source] || source;

/** Hoe lang het duurde of al duurt, in mensentaal ("3 с", "2 хв"). */
export function durationText(e: ActivityEvent, lang: Lang, now = Date.now()): string {
  const end = e.finishedAt ?? now;
  const s = Math.max(0, Math.round((end - e.createdAt) / 1000));
  if (s < 60) return lang === 'uk' ? `${s} с` : `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return lang === 'uk' ? `${m} хв` : `${m} min`;
  const h = Math.round(m / 60);
  return lang === 'uk' ? `${h} год` : `${h} uur`;
}

const READ_KEY = (scope: string) => `tsv:activity-read-v1:${scope || 'anon'}`;
const loadRead = (scope: string): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(READ_KEY(scope)) || '[]') as string[]); } catch { return new Set(); } };
const saveRead = (scope: string, ids: Set<string>) => { try { localStorage.setItem(READ_KEY(scope), JSON.stringify([...ids].slice(-300))); } catch { /* geen opslag */ } };

/**
 * Pollt het overzicht van wat Claude en uw apparaten of browsers doen, op elke pagina van de site (ook als u op een andere dienst zit),
 * en geeft een pop-up bij elk nieuw verzoek of elke nieuwe uitkomst. Stopt na een 401/403 (geen recht of geen sessie) tot de gebruiker wisselt.
 */
export function useConnectorActivity(scope: string, lang: Lang, toast: (notice: CanonicalNoticeInput) => void) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [read, setRead] = useState<Set<string>>(() => loadRead(scope));
  const [available, setAvailable] = useState(false);
  const known = useRef<Map<string, string> | null>(null);
  const stopped = useRef(false);
  const baselined = useRef(false);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const ref = useRef({ lang, toast });
  ref.current = { lang, toast };

  useEffect(() => { setRead(loadRead(scope)); known.current = null; baselined.current = false; stopped.current = !scope || scope === 'anon'; setEvents([]); setAvailable(false); }, [scope]);

  const poll = useCallback(async () => {
    if (stopped.current) return;
    try {
      const res = await api.post('/api/owner/agents/activity', { service: serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
      const list: ActivityEvent[] = res.data?.events ?? [];
      setEvents(list); setAvailable(true);
      // De allereerste keer op dit apparaat geldt alles wat er al was als gelezen: alleen wat daarna gebeurt telt als nieuw.
      if (!baselined.current) { baselined.current = true; try { if (localStorage.getItem(READ_KEY(scopeRef.current)) === null) { const all = new Set(list.map((e) => e.id)); saveRead(scopeRef.current, all); setRead(all); } } catch { /* geen opslag */ } }
      const { lang: l, toast: say } = ref.current;
      if (known.current) {
        for (const e of list) {
          const before = known.current.get(e.id);
          if (before === e.status) continue;
          const title = activityTitle(e, l);
          const st = statusInfo(e.status, l);
          if (e.status === 'pending_approval') {
            const who = `${sourceLabel(e.source, l)}${e.kind === 'command' ? `, ${e.subject}` : ''}`;
            say({ text: l === 'uk' ? `Очікує вашого рішення: ${title} (${who})` : `Wacht op uw beslissing: ${title} (${who})`, kind: 'warning', source: 'mcp', transient: true });
          } else if (e.kind === 'grant') say({ text: title, kind: 'success', source: 'mcp', transient: true });
          else if (st.group !== 'active' && st.group !== 'waiting') say({ text: `${title}: ${st.text}`, kind: st.group === 'done' ? 'success' : st.group === 'failed' ? 'error' : 'info', source: 'mcp', transient: true });
        }
      }
      known.current = new Map(list.map((e) => [e.id, e.status]));
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403) { stopped.current = true; setAvailable(false); }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => { if (alive && !document.hidden) void poll(); };
    tick();
    const timer = window.setInterval(tick, 8000);
    const visible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [poll, scope]);

  const markRead = (id: string) => setRead((current) => { if (current.has(id)) return current; const next = new Set(current); next.add(id); saveRead(scope, next); return next; });
  const markAllRead = () => setRead((current) => { const next = new Set(current); for (const e of events) next.add(e.id); saveRead(scope, next); return next; });
  return { events, read, available, markRead, markAllRead, refresh: poll };
}
