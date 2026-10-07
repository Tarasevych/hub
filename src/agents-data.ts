import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { emitCanonicalNotice } from './canonical-notifications';

export type Agent = {
  id: string; name: string; platform: string | null; status: 'connected' | 'disconnected';
  lastSeenAt: number | null; createdAt: number; policy: { autoApprove: string[]; enabled?: string[] };
  enabled?: boolean; armedUntil?: number | null;
};
export type Pending = { id: string; agentId: string; agentName: string; type: string; params: unknown; createdAt: number };
export type LastCommand = { id: string; agentId: string; type: string; status: string; preview: string; createdAt: number };
type Tr = (uk: string, nl: string) => string;

export const sessionBody = (service = 'mcp') => ({ service, tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

/** Leesbare naam van een opdrachttype van een agent, in de taal van de site. */
export const COMMAND_LABELS: Record<string, [string, string]> = {
  'fs.read': ['Читання файлу', 'Bestand lezen'], 'fs.list': ['Перегляд папки', 'Map bekijken'], 'fs.write': ['Запис файлу', 'Bestand schrijven'],
  exec: ['Виконання команди', 'Commando uitvoeren'], 'sys.info': ['Інформація про пристрій', 'Apparaatinformatie'], 'sys.metrics': ['Метрики системи', 'Systeemmetrics'],
  'docker.ps': ['Список контейнерів', 'Containerlijst'], 'docker.manage': ['Керування контейнером', 'Container beheren'],
  'browser.snapshot': ['Читання сторінки', 'Pagina lezen'], 'browser.diagnostics': ['Діагностика сторінки', 'Paginadiagnose'], 'browser.tabs': ['Список вкладок', 'Tabbladenlijst'],
  'browser.scroll': ['Прокручування', 'Scrollen'], 'browser.wait': ['Очікування тексту', 'Wachten op tekst'], 'browser.navigate': ['Відкриття сторінки', 'Pagina openen'],
  'browser.history': ['Назад/вперед/оновити', 'Terug/vooruit/vernieuwen'], 'browser.invoke': ['Дія сайту', 'Actie van de site'], 'browser.click': ['Клік', 'Klik'],
  'browser.type': ['Введення тексту', 'Tekst typen'], 'browser.select': ['Вибір у списку', 'Keuze in lijst'], 'browser.key': ['Натискання клавіші', 'Toetsaanslag'],
  'browser.screenshot': ['Знімок екрана', 'Schermafbeelding'], 'browser.deep_diagnostics': ['Глибока діагностика', 'Diepe diagnose'],
};
export const commandLabel = (type: string, tr: Tr) => { const l = COMMAND_LABELS[type]; return l ? tr(l[0], l[1]) : type; };
export const STATUS_LABELS: Record<string, [string, string]> = {
  pending_approval: ['чекає вашого рішення', 'wacht op uw beslissing'], approved: ['схвалено', 'goedgekeurd'], succeeded: ['виконано', 'uitgevoerd'], failed: ['помилка', 'mislukt'],
  rejected: ['відхилено', 'geweigerd'], timeout: ['час вийшов', 'verlopen'],
};
export const statusLabel = (status: string, tr: Tr) => { const l = STATUS_LABELS[status]; return l ? tr(l[0], l[1]) : status; };

/** "5 хв тому" / "5 min geleden". */
export function ago(value: number | null | undefined, tr: Tr): string {
  if (!value) return tr('ще ні разу', 'nog nooit');
  const s = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (s < 60) return tr('щойно', 'zojuist');
  const m = Math.round(s / 60);
  if (m < 60) return tr(`${m} хв тому`, `${m} min geleden`);
  const h = Math.round(m / 60);
  if (h < 48) return tr(`${h} год тому`, `${h} uur geleden`);
  const d = Math.round(h / 24);
  return tr(`${d} дн. тому`, `${d} dagen geleden`);
}

/**
 * Eén bron van waarheid voor apparaten, wachtende acties en laatste opdrachten voor de hele pagina (zijbalk, overzicht, details).
 * Pollt zolang het tabblad zichtbaar is en meldt wat verandert (nieuw verzoek, apparaat online/offline) via het meldingencentrum.
 */
export function useAgentsData(tr: Tr) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [last, setLast] = useState<Record<string, LastCommand>>({});
  const [loaded, setLoaded] = useState(false);
  const prev = useRef<{ status: Map<string, string>; pending: Set<string>; done: Map<string, string> } | null>(null);
  const trRef = useRef(tr);
  trRef.current = tr;

  const reload = useCallback(async () => {
    const res = await api.post('/api/owner/agents/list', sessionBody());
    const nextAgents: Agent[] = res.data?.agents ?? [];
    const nextPending: Pending[] = res.data?.pending ?? [];
    const nextLast = Object.fromEntries(((res.data?.last ?? []) as LastCommand[]).map((c) => [c.agentId, c]));
    const t = trRef.current;
    const before = prev.current;
    if (before) {
      for (const a of nextAgents) {
        const was = before.status.get(a.id);
        if (was && was !== a.status) {
          emitCanonicalNotice({ text: a.status === 'connected' ? t(`«${a.name}» підключився`, `«${a.name}» is verbonden`) : t(`«${a.name}» відключився`, `«${a.name}» is losgekoppeld`), kind: a.status === 'connected' ? 'success' : 'warning', source: 'mcp' });
        }
      }
    }
    prev.current = { status: new Map(nextAgents.map((a) => [a.id, a.status])), pending: new Set(nextPending.map((p) => p.id)), done: new Map(Object.values(nextLast).map((c) => [c.id, c.status])) };
    setAgents(nextAgents); setPending(nextPending); setLast(nextLast); setLoaded(true);
  }, []);

  useEffect(() => {
    let active = true;
    const tick = () => { if (active && !document.hidden) void reload().catch(() => undefined); };
    tick();
    const timer = window.setInterval(tick, 4000);
    const visible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [reload]);

  return { agents, pending, last, loaded, reload };
}

export type ToolCall = { id: string; tool: string; args: Record<string, unknown>; status: string; createdAt: number; preview: string };

/** Aanroepen van site-hulpmiddelen in de modus "Vragen": één poller voor de hele pagina. Meldingen komen van het meldingencentrum (connector-activity.ts). */
export function useToolApprovals() {
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const reload = useCallback(async () => {
    const res = await api.post('/api/owner/mcp-connector/approvals', sessionBody());
    const list: ToolCall[] = res.data?.calls ?? [];
    setCalls(list);
  }, []);
  useEffect(() => {
    let active = true;
    const tick = () => { if (active && !document.hidden) void reload().catch(() => undefined); };
    tick();
    const timer = window.setInterval(tick, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [reload]);
  return { calls, reload };
}
