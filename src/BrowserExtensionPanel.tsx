import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Globe, Power, Trash2, X, Ban, Hand, ShieldCheck } from 'lucide-react';
import './ext-permissions.css';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { CAPABILITIES, DEFAULT_ENABLED, GROUPS, type Cap, type CapGroup } from './browser-capabilities-ui';
import { clearWelcome, welcomePending } from './extension-welcome-store';
import { agentLogo, Help, IconButton, Logo, Section, StatusDot } from './mcp-ui';
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
const GROUP_ORDER: CapGroup[] = ['read', 'navigate', 'interact', 'advanced'];

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
  const pending = useRef<((ok: boolean, reason: string) => void) | null>(null);
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
      if (event.data.type === 'hello') { setPresence('present'); setPaired(!!event.data.paired); }
      if (event.data.type === 'paired') pending.current?.(true, '');
      if (event.data.type === 'pair-failed') pending.current?.(false, String(event.data.reason || ''));
    };
    window.addEventListener('message', onMessage);
    const ping = () => window.postMessage({ mrExtPing: true }, location.origin);
    ping();
    const retry = window.setInterval(ping, 3000);
    const giveUp = window.setTimeout(() => setPresence((p) => (p === 'checking' ? 'absent' : p)), 2500);
    return () => { window.removeEventListener('message', onMessage); window.clearInterval(retry); window.clearTimeout(giveUp); };
  }, [part]);

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
      const result = await new Promise<{ ok: boolean; reason: string }>((resolve) => {
        const timer = window.setTimeout(() => { pending.current = null; resolve({ ok: false, reason: 'TIMEOUT' }); }, 10000);
        pending.current = (ok, reason) => { window.clearTimeout(timer); pending.current = null; resolve({ ok, reason }); };
        window.postMessage({ mrExtPair: true, code, name: browserName() }, location.origin);
      });
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

  const policyOf = (a: BrowserAgent) => ({ enabled: a.policy.enabled ?? a.enabledCapabilities ?? DEFAULT_ENABLED, auto: a.policy.autoApprove ?? [] });
  const savePolicy = async (a: BrowserAgent, enabled: string[], auto: string[]) => {
    setBusy(true); setNotice('');
    try { await api.post(`/api/owner/agents/${a.id}/policy`, { ...sessionBody(), enabled, autoApprove: auto.filter((t) => enabled.includes(t)) }); await load(); }
    catch { setNotice(tr('Не вдалося змінити дозвіл.', 'Recht wijzigen mislukt.')); }
    setBusy(false);
  };
  const AUTO_ABLE = CAPABILITIES.filter((c) => c.auto).map((c) => c.type);
  // Пресети самі виставляють і «дозволено», і «без підтвердження» (де сервер це допускає): нічого не треба дозбирати галочками.
  const preset = (a: BrowserAgent, kind: 'read' | 'all' | 'none') => {
    if (kind === 'none') return void savePolicy(a, [], []);
    const enabled = kind === 'read' ? DEFAULT_ENABLED : CAPABILITIES.map((c) => c.type);
    void savePolicy(a, enabled, enabled.filter((t) => AUTO_ABLE.includes(t)));
  };
  const setGroup = (a: BrowserAgent, g: CapGroup, on: boolean) => {
    const { enabled, auto } = policyOf(a);
    const types = CAPABILITIES.filter((c) => c.group === g).map((c) => c.type);
    void savePolicy(a, on ? [...new Set([...enabled, ...types])] : enabled.filter((t) => !types.includes(t)), on ? [...new Set([...auto, ...types.filter((t) => AUTO_ABLE.includes(t))])] : auto.filter((t) => !types.includes(t)));
  };
  const setCapState = (a: BrowserAgent, cap: Cap, state: 'off' | 'ask' | 'auto') => {
    const { enabled, auto } = policyOf(a);
    const nextEnabled = state === 'off' ? enabled.filter((t) => t !== cap.type) : [...new Set([...enabled, cap.type])];
    const nextAuto = state === 'auto' ? [...new Set([...auto, cap.type])] : auto.filter((t) => t !== cap.type);
    void savePolicy(a, nextEnabled, nextAuto);
  };

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
    const { enabled, auto } = policyOf(a);
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

        <div className='hub-actions ext-bulk'>
          <IconButton icon={<Check />} disabled={busy} onClick={() => preset(a, 'read')}>{tr('Лише читання (рекомендовано)', 'Alleen lezen (aanbevolen)')}</IconButton>
          {CAPABILITIES.every((c) => enabled.includes(c.type))
            ? <IconButton tone='danger' icon={<Ban />} disabled={busy} onClick={() => preset(a, 'none')}>{tr('Зняти всі дозволи', 'Alle rechten intrekken')}</IconButton>
            : <IconButton icon={<ShieldCheck />} disabled={busy} onClick={() => preset(a, 'all')}>{tr('Надати всі дозволи', 'Alle rechten toekennen')}</IconButton>}
          {enabled.length > 0 && !CAPABILITIES.every((c) => enabled.includes(c.type)) ? <IconButton tone='danger' icon={<Ban />} disabled={busy} onClick={() => preset(a, 'none')}>{tr('Зняти всі дозволи', 'Alle rechten intrekken')}</IconButton> : null}
        </div>
        <p className='hub-meta ext-legend'><Ban size={13} /> {tr('заборонено', 'verboden')} · <Hand size={13} /> {tr('дозволено, щоразу питає вас', 'toegestaan, vraagt telkens uw akkoord')} · <ShieldCheck size={13} /> {tr('дозволено без підтвердження', 'toegestaan zonder bevestiging')}</p>

        {GROUP_ORDER.map((g) => {
          const members = CAPABILITIES.filter((c) => c.group === g);
          const allOn = members.every((c) => enabled.includes(c.type));
          return (
          <Section key={g} id={`ext-${a.id}-${g}`} icon={<Power />} title={tr(GROUPS[g].uk, GROUPS[g].nl)} subtitle={tr(GROUPS[g].hint[0], GROUPS[g].hint[1])} defaultOpen={g === 'read'} tone={g === 'advanced' || g === 'interact' ? 'warn' : 'default'}
            badge={<span className='hub-pill off'>{members.filter((c) => enabled.includes(c.type)).length}/{members.length}</span>}>
            <div className='ext-group-bulk'>
              <button type='button' className={`ext-bulk-btn${allOn ? ' is-deny' : ''}`} disabled={busy} onClick={() => setGroup(a, g, !allOn)}>{allOn ? <Ban size={14} /> : <Check size={14} />}{allOn ? tr('Заборонити всю групу', 'Hele groep verbieden') : tr('Дозволити всю групу', 'Hele groep toestaan')}</button>
            </div>
            <div className='hub-switch-list'>
              {members.map((c) => {
                const on = enabled.includes(c.type);
                const state: 'off' | 'ask' | 'auto' = !on ? 'off' : c.auto && auto.includes(c.type) ? 'auto' : 'ask';
                const opts: Array<['off' | 'ask' | 'auto', ReactNode, string]> = [['off', <Ban size={15} />, tr('Заборонено', 'Verboden')], ['ask', <Hand size={15} />, c.auto ? tr('Питати щоразу', 'Telkens vragen') : tr('Дозволено (питає щоразу)', 'Toegestaan (vraagt telkens)')]];
                if (c.auto) opts.push(['auto', <ShieldCheck size={15} />, tr('Без підтвердження', 'Zonder bevestiging')]);
                return (
                  <div key={c.type} className={`hub-switch${on ? '' : ' is-off'}`} data-capability={c.type}>
                    <span className='hub-switch-text'>
                      <b>{tr(c.uk, c.nl)}
                        <Help tone={g === 'interact' || g === 'advanced' ? 'warn' : 'info'} tr={tr} content={{ title: tr(c.uk, c.nl), touches: tr(`Лише браузер «${a.name}»`, `Alleen de browser «${a.name}»`), on: tr(c.on[0], c.on[1]), off: tr(c.off[0], c.off[1]) }} /></b>
                      <small>{state === 'off' ? tr('Заборонено', 'Verboden') : state === 'auto' ? tr('Дозволено без підтвердження', 'Toegestaan zonder bevestiging') : tr('Дозволено, щоразу питає вас', 'Toegestaan, vraagt telkens uw akkoord')}</small>
                    </span>
                    <span className='ext-tri' role='radiogroup' aria-label={tr(c.uk, c.nl)}>
                      {opts.map(([value, icon, label]) => (
                        <button key={value} type='button' role='radio' aria-checked={state === value} aria-label={label} title={label} data-state={value} className={state === value ? 'is-on' : ''} disabled={busy} onClick={() => setCapState(a, c, value)}>{icon}</button>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
          );
        })}

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
