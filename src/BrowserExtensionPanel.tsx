import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Globe, Trash2, X, FlaskConical, Settings2, RefreshCw, Power } from 'lucide-react';
import './ext-permissions.css';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import AiToestemmingen, { AiStopKnop } from './AiToestemmingen';
import { deriveExtState, EXT_TEXT, EXTENSION_ID_RE, sendToExtension, type ExtAction } from './extensie-toestand';
import { clearWelcome, welcomePending } from './extension-welcome-store';
import { agentLogo, Help, IconButton, Logo, StatusDot } from './mcp-ui';
import ExtensionWizard from './ExtensionWizard';
import './agents-panel.css';

type Tr = (uk: string, nl: string) => string;
type BrowserAgent = {
  id: string; name: string; platform: string | null; status: 'connected' | 'disconnected'; lastSeenAt: number | null;
  policy: { autoApprove: string[]; enabled?: string[] }; enabled: boolean; armedUntil: number | null; enabledCapabilities?: string[];
};
type Presence = 'checking' | 'present' | 'absent';
type Release = { version?: string; storeUrl?: string; installers?: string[]; crx?: { file: string; extensionId: string; version: string } | null };

const sessionBody = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const MIN_VERSION = '0.4.0';
const FALLBACK_EXTENSION_ID = 'ofpffonakgjioahgfejmiblfmbkobmmi';
type Ping = { ok: boolean; version?: string; paired?: boolean; connected?: boolean; account?: 'ok' | 'mismatch' | 'unknown'; agentId?: string; caps?: number; blocked?: boolean };
type SelfTest = { ok: boolean; version?: string; checks?: Array<{ id: string; ok: boolean; detail: string }> };
const CHECK_TEXT: Record<string, [string, string]> = {
  paired: ['підключено до облікового запису', 'gekoppeld aan het account'], command_key: ['ключ підпису команд', 'sleutel voor ondertekende opdrachten'],
  connected: ['з’єднання із сервером', 'verbinding met de server'], settings: ['дозволи отримано', 'toestemmingen ontvangen'],
  debugger_permission: ['дозвіл debugger', 'debugger-recht'], diag_opt_in: ['діагностика ввімкнена (необов’язково)', 'diagnose aan (optioneel)'],
  site_tab: ['відкрита вкладка сайту', 'open tabblad van de site'], bridge: ['зв’язок зі сторінкою', 'verbinding met de pagina'], account: ['той самий обліковий запис', 'hetzelfde account'],
};

const browserName = () => {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : 'Browser';
  return `${name} (${navigator.platform || 'pc'})`;
};

/**
 * Browserextensie van Mijn Ruimte. `part` bepaalt wat er getoond wordt:
 *  - 'install': installeren, koppelen en de stappenlijst (voor de hele site);
 *  - 'agent': de instellingen van één gekoppelde browser (`agentId`): activering en wat de AI daar mag doen;
 *  - 'all': beide (oude gedrag).
 * Na het installeren opent de extensie de pagina zelf (?extension=welcome) en loopt de gebruiker stap voor stap door de activering heen.
 */
export default function BrowserExtensionPanel({ tr, part = 'all', agentId }: { tr: Tr; part?: 'install' | 'agent' | 'all'; agentId?: string }) {
  const [agents, setAgents] = useState<BrowserAgent[]>([]);
  const [presence, setPresence] = useState<Presence>('checking');
  const [paired, setPaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [, setDownloaded] = useState(false);
  const [release, setRelease] = useState<Release>({});
  const [welcome, setWelcome] = useState(() => welcomePending());
  const [extensionId, setExtensionId] = useState('');
  const [ping, setPing] = useState<Ping | null>(null);
  const [grantInfo, setGrantInfo] = useState<{ active: number; blocked: boolean }>({ active: -1, blocked: false });
  const [test, setTest] = useState<SelfTest | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    const res = await api.post('/api/owner/agents/list', sessionBody());
    setAgents(((res.data?.agents ?? []) as BrowserAgent[]).filter((a) => a.platform === 'browser'));
  }, []);

  useEffect(() => { void load().catch(() => undefined); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void load().catch(() => undefined); }, 10000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (part === 'agent') return;
    fetch('/downloads/extension-version.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => setRelease(j as Release)).catch(() => undefined);
  }, [part]);

  // Is de extensie in deze browser aanwezig? De content script antwoordt op een ping met een "hello".
  useEffect(() => {
    if (part === 'agent') return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || !event.data || event.data.mrExt !== true) return;
      if (event.data.type === 'hello') {
        setPresence('present'); setPaired(!!event.data.paired);
        if (typeof event.data.extensionId === 'string' && EXTENSION_ID_RE.test(event.data.extensionId)) setExtensionId(event.data.extensionId);
      }
    };
    window.addEventListener('message', onMessage);
    const ping = () => window.postMessage({ mrExtPing: true }, location.origin);
    ping();
    const retry = window.setInterval(ping, 3000);
    const giveUp = window.setTimeout(() => setPresence((p) => (p === 'checking' ? 'absent' : p)), 2500);
    return () => { window.removeEventListener('message', onMessage); window.clearInterval(retry); window.clearTimeout(giveUp); };
  }, [part]);

  // Versie, account en verbinding rechtstreeks bij de extensie (externally_connectable); id uit de "hello", anders uit de release.
  const extId = extensionId || (release.crx?.extensionId && EXTENSION_ID_RE.test(release.crx.extensionId) ? release.crx.extensionId : FALLBACK_EXTENSION_ID);
  const refreshPing = useCallback(async () => {
    const res = await sendToExtension<Ping>(extId, { type: 'PING' }, 4000);
    setPing(res && res.ok ? res : null);
    if (res && res.ok) { setPresence('present'); setPaired(!!res.paired); }
    return res;
  }, [extId]);
  useEffect(() => {
    void refreshPing();
    const timer = window.setInterval(() => { if (!document.hidden) void refreshPing(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refreshPing]);

  // Bij de installatiehulp (na installeren of na inloggen): naar dit blok scrollen.
  useEffect(() => { if (welcome && part !== 'agent') rootRef.current?.scrollIntoView({ block: 'start' }); }, [welcome, part]);

  const agent = agents[agents.length - 1]; // de nieuwste koppeling: dat is de agent van de extensie in deze browser
  const armed = (a: BrowserAgent) => a.enabled && !!a.armedUntil && a.armedUntil > Date.now();
  const allDone = !!agent && armed(agent);
  useEffect(() => { if (allDone && welcome) { clearWelcome(); } }, [allDone, welcome]);

  const connect = async () => {
    if (busy) return;
    setBusy(true); setNotice('');
    try {
      const res = await api.post('/api/owner/agents/pairing-code', sessionBody());
      const code = String(res.data?.code || '');
      // Koppelen gebeurt in de service worker van de extensie (externally_connectable, alleen vanaf mcp.tarasevych.com):
      // het token komt nooit in deze pagina. De code is eenmalig en 5 minuten geldig.
      const answer = await sendToExtension<{ ok: boolean; reason?: string; error?: string }>(extId, { type: 'PAIR', code, name: browserName() }, 15000);
      const result = { ok: !!answer?.ok, reason: answer ? String(answer.reason || answer.error || '') : 'NO_EXTENSION' };
      void refreshPing();
      if (result.ok) { setPaired(true); setNotice(tr('Розширення підключено до вашого облікового запису. Оберіть, що йому дозволено, і ввімкніть його для ШІ у картці браузера.', 'De extensie is gekoppeld aan uw account. Kies op de kaart van de browser wat hij mag en zet hem aan voor de AI.')); await load(); }
      else setNotice(tr(`Не вдалося підключити (${result.reason}). Перевірте, що розширення встановлене й увімкнене, і спробуйте ще раз.`, `Koppelen mislukt (${result.reason}). Controleer of de extensie is geïnstalleerd en aan staat en probeer opnieuw.`));
    } catch (e) {
      const code = String((e as Error)?.message || '');
      setNotice(code.includes('AGENT_LIMIT') ? tr('Досягнуто ліміт пристроїв (10). Відкличте зайві.', 'Limiet van 10 apparaten bereikt. Trek oude apparaten in.') : tr('Не вдалося отримати код підключення.', 'Koppelcode ophalen mislukt.'));
    }
    setBusy(false);
  };

  const setEnabled = async (a: BrowserAgent, on: boolean) => {
    setBusy(true); setNotice('');
    try { await api.post(`/api/owner/agents/${a.id}/browser-enabled`, { ...sessionBody(), enabled: on }); await load(); }
    catch { setNotice(tr('Не вдалося змінити активацію.', 'Activering wijzigen mislukt.')); }
    setBusy(false);
  };

  // Knop 'Тест': zelftest in de extensie + wat de server ziet. Resultaat per controle, in gewone taal.
  const runTest = async () => {
    setBusy(true); setNotice(''); setTest(null);
    const res = await sendToExtension<SelfTest>(extId, { type: 'SELF_TEST' }, 10000);
    await load().catch(() => undefined);
    await refreshPing();
    setTest(res && res.checks ? res : { ok: false, checks: [{ id: 'extension', ok: false, detail: tr('розширення не відповідає', 'de extensie antwoordt niet') }] });
    setBusy(false);
  };
  const openOptions = () => { void sendToExtension(extId, { type: 'OPEN_OPTIONS' }); };

  const revoke = async (a: BrowserAgent) => {
    setConfirm(null); setBusy(true); setNotice('');
    try { await api.post(`/api/owner/agents/${a.id}/revoke`, sessionBody()); await load(); setNotice(tr('Браузер відключено. Розширення покаже «Не підключено».', 'Browser losgekoppeld. De extensie toont "Niet verbonden".')); }
    catch { setNotice(tr('Не вдалося відкликати.', 'Intrekken mislukt.')); }
    setBusy(false);
  };

  const lastSeen = (ms: number | null) => (ms ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZoneName: 'short' }).format(new Date(ms)) : '—');
  const installBlock = (
    <section ref={rootRef}>
      <ExtensionWizard
        tr={tr} presence={presence} paired={paired} hasAgent={!!agent} agentEnabled={!!agent && agent.enabled} agentArmed={allDone} release={release}
        busy={busy} notice={notice} welcome={welcome} onConnect={() => void connect()} onEnable={() => { if (agent) void setEnabled(agent, true); }}
        onDownloaded={() => setDownloaded(true)} onClose={() => { clearWelcome(); setWelcome(false); }}
      />
    </section>
  );

  const agentBlock = (a: BrowserAgent) => {
    const state: 'on' | 'wait' | 'off' = !a.enabled ? 'off' : armed(a) ? 'on' : 'wait';
    const stateText = state === 'on' ? tr('ШІ активний (вхід підтверджено)', 'AI actief (aanmelding bevestigd)') : state === 'wait' ? tr('очікує входу на сайті', 'wacht op aanmelding op de site') : tr('ШІ вимкнено', 'AI uit');
    return (
      <article key={a.id} className='hub-agent mcp-browser' data-browser-agents='1' data-device={a.id}>
        <div className='hub-agent-head'>
          <Logo kind={agentLogo(a)} size={40} label={a.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{a.name}</h2>
            <span className='hub-meta'>{tr('востаннє', 'laatst gezien')}: {lastSeen(a.lastSeenAt)}</span>
          </div>
          <span className={`hub-pill ${a.status === 'connected' ? 'ok' : 'off'}`}><StatusDot state={a.status === 'connected' ? 'on' : 'off'} label={a.status === 'connected' ? tr('підключено', 'verbonden') : tr('не в мережі', 'offline')} />{a.status === 'connected' ? tr('підключено', 'verbonden') : tr('не в мережі', 'offline')}</span>
          <span className={`hub-pill ${state === 'on' ? 'ok' : state === 'wait' ? 'warn' : 'off'}`} data-browser-state={state}>{stateText}</span>
        </div>

        <div className='hub-switch'>
          <span className='hub-switch-text'>
            <b>{tr('Дозволити ШІ користуватися цим браузером', 'AI mag deze browser gebruiken')}
              <Help tr={tr} content={{ title: tr('Головний вимикач браузера', 'Hoofdschakelaar van de browser'), what: tr('Вмикає або вимикає весь доступ ШІ до цього браузера.', 'Zet alle toegang van de AI tot deze browser aan of uit.'), touches: tr(`Лише браузер «${a.name}», не інші браузери й не пристрої.`, `Alleen de browser «${a.name}», niet andere browsers of apparaten.`), on: tr('ШІ може лише те, що ви дозволили нижче, і лише поки ви ввійшли на сайті (перевірка кожні 2 хв).', 'De AI kan alleen wat u hieronder toestaat, en alleen zolang u op de site bent aangemeld (controle elke 2 min).'), off: tr('Розширення нічого не виконує, навіть якщо окремі можливості нижче ввімкнені.', 'De extensie voert niets uit, ook niet als losse mogelijkheden hieronder aan staan.') }} /></b>
            <small>{tr('Вихід із сайту або закриття вкладки вимикає ШІ за кілька хвилин, навіть якщо розширення залишається в браузері.', 'Afmelden of de site sluiten zet de AI binnen enkele minuten uit, ook als de extensie in de browser blijft.')}</small>
          </span>
          <button type='button' className='hub-toggle' role='switch' aria-checked={a.enabled} aria-label={tr('Дозволити ШІ користуватися цим браузером', 'AI mag deze browser gebruiken')} disabled={busy} onClick={() => void setEnabled(a, !a.enabled)} />
        </div>

        {(() => {
          // Toestand alleen met extensiegegevens als de extensie in DEZE browser bij deze agent hoort.
          const local = !!ping && ping.agentId === a.id;
          const view = deriveExtState({
            presence: 'present', version: local ? ping?.version : MIN_VERSION, minVersion: MIN_VERSION,
            paired: true, online: a.status === 'connected', account: local ? (ping?.account ?? 'unknown') : 'ok', blocked: grantInfo.blocked,
            activeGrants: grantInfo.active < 0 ? 1 : grantInfo.active, browserEnabled: a.enabled, armed: armed(a),
          });
          const btn: Partial<Record<ExtAction, ReactNode>> = {
            test: <IconButton key='test' icon={<FlaskConical />} disabled={busy || !local} title={local ? '' : tr('Тест працює в тому браузері, де встановлено це розширення', 'De test werkt in de browser waarin deze extensie zit')} onClick={() => void runTest()}>{tr('Тест', 'Test')}</IconButton>,
            stop: <AiStopKnop key='stop' tr={tr} onDone={() => void load()} />,
            enable: <IconButton key='enable' icon={<Power />} disabled={busy} onClick={() => void setEnabled(a, true)}>{tr('Увімкнути браузер', 'Browser aanzetten')}</IconButton>,
            repair: <IconButton key='repair' icon={<RefreshCw />} disabled={busy} onClick={() => void connect()}>{tr('Підключити знову', 'Opnieuw koppelen')}</IconButton>,
            relogin: <IconButton key='relogin' icon={<RefreshCw />} onClick={() => location.reload()}>{tr('Оновити сторінку після входу', 'Pagina verversen na aanmelden')}</IconButton>,
            options: local ? <IconButton key='options' icon={<Settings2 />} onClick={openOptions}>{tr('Налаштування розширення', 'Instellingen van de extensie')}</IconButton> : undefined,
          };
          return (
            <div className='ext-state' data-ext-state={view.state} data-ext-reason={view.reason || ''}>
              <p className={`hub-note${view.state === 'enabled' ? '' : ' is-warn'}`} role='status'>{tr(...EXT_TEXT[view.reason ?? view.state])}</p>
              <div className='hub-actions'>{view.actions.map((x) => btn[x]).filter(Boolean)}</div>
              {test ? (
                <ul className='ext-test' aria-label={tr('Результат тесту', 'Testresultaat')}>
                  <li><b>{test.ok ? tr('Тест пройдено', 'Test geslaagd') : tr('Тест не пройдено', 'Test niet geslaagd')}</b>{test.version ? ` · ${test.version}` : ''}</li>
                  {(test.checks ?? []).map((c) => <li key={c.id} className={c.ok ? 'ok' : 'bad'}>{c.ok ? '✓' : '✗'} {CHECK_TEXT[c.id] ? tr(...CHECK_TEXT[c.id]) : c.id}{c.detail ? ` — ${c.detail}` : ''}</li>)}
                </ul>
              ) : null}
            </div>
          );
        })()}
        <AiToestemmingen tr={tr} agentId={a.id} platform='browser' onChange={(active, blocked) => setGrantInfo({ active, blocked })} />

        {confirm === a.id ? (
          <div className='hub-confirm' role='alertdialog' aria-label={tr('Підтвердження відключення', 'Bevestig loskoppelen')}>
            <span>{tr('Відключити цей браузер? ШІ більше не бачитиме ваші сторінки.', 'Deze browser loskoppelen? De AI ziet uw pagina\'s dan niet meer.')}</span>
            <IconButton tone='danger' icon={<Trash2 />} disabled={busy} onClick={() => void revoke(a)}>{tr('Так, відключити', 'Ja, loskoppelen')}</IconButton>
            <IconButton icon={<X />} onClick={() => setConfirm(null)}>{tr('Скасувати', 'Annuleren')}</IconButton>
          </div>
        ) : (
          <div className='hub-actions'><IconButton tone='danger' icon={<Trash2 />} disabled={busy} onClick={() => setConfirm(a.id)}>{tr('Відключити браузер', 'Browser loskoppelen')}</IconButton></div>
        )}
        {notice ? <p className='hub-note' role='status'>{notice}</p> : null}
      </article>
    );
  };

  if (part === 'install') return installBlock;
  if (part === 'agent') {
    const a = agents.find((x) => x.id === agentId) ?? agents[0];
    return a ? agentBlock(a) : <div className='hub-empty'><Globe aria-hidden='true' /><span>{tr('Цей браузер не знайдено.', 'Deze browser is niet gevonden.')}</span></div>;
  }
  return (
    <div className='hub-main'>
      {installBlock}
      <div data-browser-agents={String(agents.length)}>{agents.length ? agents.map(agentBlock) : <div className='hub-empty'><Globe aria-hidden='true' /><span>{tr('Ще жоден браузер не підключений.', 'Er is nog geen browser gekoppeld.')}</span></div>}</div>
    </div>
  );
}
