import { useCallback, useSyncExternalStore } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { emitCanonicalNotice } from './canoniek-meldingen';

export type Agent = {
  id: string; name: string; platform: string | null; status: 'connected' | 'disconnected';
  lastSeenAt: number | null; createdAt: number; policy: { autoApprove: string[]; enabled?: string[] };
  enabled?: boolean; armedUntil?: number | null;
  /** Technisch (uitklapbare rij op /agents). */
  version?: string | null; tokenExpiresAt?: number | null; pairingId?: string | null; capabilities?: Record<string, unknown>; enabledCapabilities?: string[];
  /** Ruimte van het apparaat (0042): 'prive' (eigen pc/browser) of 'technisch' (server/beheer); gezet bij het koppelen. */
  ruimte?: 'prive' | 'technisch';
};
/** SEC-002 interface-02: WIE vroeg dit (de server geeft de naam van de klant uit de geauthenticeerde verbinding; leeg = onbekend). */
export type Aanvrager = { client: string; agent: string; verbinding: string; site: boolean };
export type Pending = { id: string; agentId: string; agentName: string; type: string; params: unknown; createdAt: number; aanvrager?: Aanvrager };
export type LastCommand = { id: string; agentId: string; type: string; status: string; preview: string; createdAt: number };
type Tr = (uk: string, nl: string) => string;

export const sessionBody = (service = 'mcp') => ({ service, tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

/** Leesbare naam van een opdrachttype van een agent, in de taal van de site. */
export const COMMAND_LABELS: Record<string, [string, string]> = {
  'fs.read': ['Читання файлу', 'Bestand lezen'], 'fs.list': ['Перегляд теки', 'Map bekijken'], 'fs.write': ['Запис файлу', 'Bestand schrijven'],
  exec: ['Виконання команди', 'Commando uitvoeren'], 'sys.info': ['Інформація про пристрій', 'Apparaatinformatie'], 'sys.metrics': ['Метрики системи', 'Systeemmetrics'],
  'docker.ps': ['Список контейнерів', 'Containerlijst'], 'docker.manage': ['Керування контейнером', 'Container beheren'],
  'apps.deploy': ['Розгортання додатка', 'App uitrollen'], 'apps.status': ['Хід розгортання', 'Voortgang uitrol'], 'apps.list': ['Список додатків', 'Lijst van apps'],
  'apps.logs': ['Журнал додатка', 'Logboek van een app'], 'apps.versions': ['Версії додатка', 'Versies van een app'], 'apps.rollback': ['Відкат додатка', 'App terugdraaien'],
  'apps.control': ['Керування додатком', 'App beheren'], 'apps.route': ['Домен додатка', 'Domein van een app'], 'apps.secret.list': ['Назви секретів', 'Namen van geheimen'],
  'apps.secret.set': ['Збереження секрету (ввели ви)', 'Geheim opslaan (door u ingevoerd)'], 'apps.secret.delete': ['Видалення секрету', 'Geheim verwijderen'],
  'browser.snapshot': ['Читання сторінки', 'Pagina lezen'], 'browser.diagnostics': ['Діагностика сторінки', 'Paginadiagnose'], 'browser.tabs': ['Список вкладок', 'Tabbladenlijst'],
  'browser.scroll': ['Прокручування', 'Scrollen'], 'browser.wait': ['Очікування тексту', 'Wachten op tekst'], 'browser.navigate': ['Відкриття сторінки', 'Pagina openen'],
  'browser.history': ['Назад/вперед/оновити', 'Terug/vooruit/vernieuwen'], 'browser.invoke': ['Дія сайту', 'Actie van de site'], 'browser.click': ['Клік', 'Klik'],
  'browser.type': ['Введення тексту', 'Tekst typen'], 'browser.select': ['Вибір у списку', 'Keuze in lijst'], 'browser.key': ['Натискання клавіші', 'Toetsaanslag'],
  'browser.screenshot': ['Знімок екрана', 'Schermafbeelding'], 'browser.deep_diagnostics': ['Глибока діагностика', 'Diepe diagnose'],
  // SEC-002 interface-01: ook deze typen kregen tot nu toe hun ruwe code in het beslisvenster (bv. «browser.fill_form»).
  'fs.stat': ['Відомості про файл', 'Bestandsgegevens'], 'fs.search': ['Пошук файлів', 'Bestanden zoeken'],
  'browser.hover': ['Наведення на елемент', 'Element aanwijzen'], 'browser.fill_form': ['Заповнення форми', 'Formulier invullen'], 'browser.pages': ['Керування вкладками (відкрити/перемкнути/закрити)', 'Tabbladen beheren (openen/wisselen/sluiten)'],
  'browser.console': ['Читання консолі сторінки', 'Console van de pagina lezen'], 'browser.network': ['Читання мережевих запитів сторінки', 'Netwerkverzoeken van de pagina lezen'],
  'browser.self_test': ['Самоперевірка розширення', 'Zelftest van de extensie'], 'browser.audit': ['Аудит сторінки', 'Paginacontrole'], 'browser.script': ['Виконання скрипту на сторінці', 'Script uitvoeren op de pagina'],
};
export const commandLabel = (type: string, tr: Tr) => { const l = COMMAND_LABELS[type]; return l ? tr(l[0], l[1]) : tr(`Невідома дія «${type}»`, `Onbekende actie «${type}»`); };
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

/** Pollinterval van de pagina /agents (HUB-04: één poller per bron, nooit sneller dan 10 s; vroeger 5 s per component → ~100 verzoeken/min). */
export const AGENTS_POLL_MS = 10_000;

/** Eén gedeelde poller voor een bron: hoeveel componenten er ook luisteren, er loopt maar één timer en één verzoek tegelijk. */
export function maakGedeeldePoller<T>(laadFn: () => Promise<T>, interval: number, opties: { nu?: () => number } = {}) {
  let waarde: T | null = null, geladen = false, versie = 0, timer: number | undefined, bezig: Promise<T | null> | null = null, laatstOp = 0;
  // Audit 19.10 (U-03): laatste fout bewaren; bij API_RECHT_VEREIST (geldige sessie zonder recht) stopt de poller — de hub toont één muur.
  let fout: unknown = null, gestopt = false;
  const isRechtFout = (e: unknown) => String((e as { message?: string } | null)?.message || '') === 'API_RECHT_VEREIST';
  const luisteraars = new Set<() => void>();
  const meld = () => { versie += 1; for (const f of luisteraars) f(); };
  const nu = opties.nu ?? (() => Date.now());
  const laad = (): Promise<T | null> => {
    if (bezig) return bezig;
    if (gestopt) return Promise.resolve(waarde);
    bezig = laadFn().then((d) => { waarde = d; geladen = true; laatstOp = nu(); fout = null; meld(); return d; }).catch((e: unknown) => { fout = e; if (isRechtFout(e)) { gestopt = true; geladen = true; stop(); } meld(); return null; }).finally(() => { bezig = null; });
    return bezig;
  };
  const tick = () => { if (gestopt) return; if (typeof document === 'undefined' || !document.hidden) void laad(); };
  const zichtbaar = () => { if (!document.hidden && nu() - laatstOp >= Math.min(interval, 3_000)) tick(); };
  const start = () => { tick(); timer = window.setInterval(tick, interval); document.addEventListener('visibilitychange', zichtbaar); };
  const stop = () => { window.clearInterval(timer); timer = undefined; document.removeEventListener('visibilitychange', zichtbaar); };
  return {
    get: () => waarde, geladen: () => geladen, versie: () => versie, laad, fout: () => fout, gestopt: () => gestopt,
    subscribe: (f: () => void) => { luisteraars.add(f); if (luisteraars.size === 1) start(); return () => { luisteraars.delete(f); if (luisteraars.size === 0) stop(); }; },
    info: () => ({ luisteraars: luisteraars.size, actief: timer !== undefined }),
  };
}

type AgentsLijst = { agents: Agent[]; pending: Pending[]; last: Record<string, LastCommand> };
let agentsPoller: ReturnType<typeof maakGedeeldePoller<AgentsLijst>> | null = null;
let vorigeStatus: Map<string, string> | null = null;
let meldTr: Tr | null = null;
/** Toast «підключився/відключився» alleen bij een ECHTE overgang tussen twee geslaagde antwoorden (fouten/herstel van de server tellen niet). */
export function agentOvergangen(voor: Map<string, string> | null, na: Agent[]): Array<{ agent: Agent; verbonden: boolean }> {
  if (!voor) return [];
  const uit: Array<{ agent: Agent; verbonden: boolean }> = [];
  for (const a of na) { const was = voor.get(a.id); if (was && was !== a.status) uit.push({ agent: a, verbonden: a.status === 'connected' }); }
  return uit;
}
function agentsPollerVan() {
  if (agentsPoller) return agentsPoller;
  agentsPoller = maakGedeeldePoller<AgentsLijst>(async () => {
    const res = await api.post('/api/owner/agents/list', sessionBody());
    const agents: Agent[] = res.data?.agents ?? [];
    const pending: Pending[] = res.data?.pending ?? [];
    const last = Object.fromEntries(((res.data?.last ?? []) as LastCommand[]).map((c) => [c.agentId, c]));
    const t = meldTr;
    if (t) for (const { agent: a, verbonden } of agentOvergangen(vorigeStatus, agents)) {
      emitCanonicalNotice({ text: verbonden ? t(`«${a.name}» підключився`, `«${a.name}» is verbonden`) : t(`«${a.name}» відключився`, `«${a.name}» is losgekoppeld`), kind: verbonden ? 'success' : 'warning', source: 'mcp' });
    }
    vorigeStatus = new Map(agents.map((a) => [a.id, a.status]));
    return { agents, pending, last };
  }, AGENTS_POLL_MS);
  return agentsPoller;
}
/** Voor tests: de gedeelde poller vergeten (volgende hook maakt een nieuwe). */
export function resetAgentsPoller(): void { agentsPoller = null; vorigeStatus = null; approvalsPoller = null; }

const LEEG_LIJST: AgentsLijst = { agents: [], pending: [], last: {} };
/**
 * Eén bron van waarheid voor apparaten, wachtende acties en laatste opdrachten voor de hele pagina (zijbalk, overzicht, details).
 * Alle componenten delen ÉÉN poller (HUB-04); pollt zolang het tabblad zichtbaar is en meldt wat verandert (apparaat online/offline) via het meldingencentrum.
 */
export function useAgentsData(tr: Tr) {
  meldTr = tr;
  const p = agentsPollerVan();
  useSyncExternalStore(p.subscribe, p.versie, p.versie);
  const d = p.get() ?? LEEG_LIJST;
  const reload = useCallback(async () => { await p.laad(); }, [p]);
  return { agents: d.agents, pending: d.pending, last: d.last, loaded: p.geladen(), reload, fout: p.fout() };
}

export type ToolCall = { id: string; tool: string; args: Record<string, unknown>; status: string; createdAt: number; preview: string; aanvrager?: Aanvrager };

let approvalsPoller: ReturnType<typeof maakGedeeldePoller<ToolCall[]>> | null = null;
/** Aanroepen van site-hulpmiddelen in de modus "Vragen": één poller voor de hele pagina. Meldingen komen van het meldingencentrum (connector-activiteit.ts). */
export function useToolApprovals() {
  approvalsPoller ??= maakGedeeldePoller<ToolCall[]>(async () => ((await api.post('/api/owner/mcp-connector/approvals', sessionBody())).data?.calls ?? []) as ToolCall[], AGENTS_POLL_MS);
  const p = approvalsPoller;
  useSyncExternalStore(p.subscribe, p.versie, p.versie);
  const reload = useCallback(async () => { await p.laad(); }, [p]);
  return { calls: p.get() ?? LEEG_CALLS, reload };
}
const LEEG_CALLS: ToolCall[] = [];
