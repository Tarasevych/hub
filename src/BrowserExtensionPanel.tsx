import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, FileArchive, Globe, Link2, Package, PlugZap, Power, Trash2, X } from 'lucide-react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { AUTO_HELP, CAPABILITIES, DEFAULT_ENABLED, GROUPS, type Cap, type CapGroup } from './browser-capabilities-ui';
import { clearWelcome, welcomePending } from './extension-welcome-store';
import { agentLogo, Help, IconButton, Logo, Section, StatusDot } from './mcp-ui';
import './agents-panel.css';

type Tr = (uk: string, nl: string) => string;
type BrowserAgent = {
  id: string; name: string; platform: string | null; status: 'connected' | 'disconnected'; lastSeenAt: number | null;
  policy: { autoApprove: string[]; enabled?: string[] }; enabled: boolean; armedUntil: number | null; enabledCapabilities?: string[];
};
type Presence = 'checking' | 'present' | 'absent';
type Release = { version?: string; storeUrl?: string; installers?: string[]; crx?: { file: string; extensionId: string; version: string } | null };

const sessionBody = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const DOWNLOAD = '/downloads/mijn-ruimte-extension.zip';
const GROUP_ORDER: CapGroup[] = ['read', 'navigate', 'interact', 'advanced'];

const browserName = () => {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : 'Browser';
  return `${name} (${navigator.platform || 'pc'})`;
};
const osKind = (): 'windows' | 'unix' => (/Win/i.test(navigator.platform || navigator.userAgent) ? 'windows' : 'unix');

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
  const [downloaded, setDownloaded] = useState(false);
  const [crxInfo, setCrxInfo] = useState(false);
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

  const agent = agents[0];
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
  const toggleCap = (a: BrowserAgent, cap: Cap, on: boolean) => {
    const { enabled, auto } = policyOf(a);
    void savePolicy(a, on ? [...new Set([...enabled, cap.type])] : enabled.filter((t) => t !== cap.type), auto);
  };
  const toggleAuto = (a: BrowserAgent, cap: Cap, on: boolean) => {
    const { enabled, auto } = policyOf(a);
    void savePolicy(a, enabled, on ? [...new Set([...auto, cap.type])] : auto.filter((t) => t !== cap.type));
  };
  const preset = (a: BrowserAgent, kind: 'read' | 'all') => {
    const enabled = kind === 'read' ? DEFAULT_ENABLED : CAPABILITIES.map((c) => c.type);
    void savePolicy(a, enabled, kind === 'read' ? DEFAULT_ENABLED : []);
  };

  const revoke = async (a: BrowserAgent) => {
    setConfirm(null); setBusy(true); setNotice('');
    try { await api.post(`/api/owner/agents/${a.id}/revoke`, sessionBody()); await load(); setNotice(tr('Браузер відключено. Розширення покаже «Не підключено».', 'Browser losgekoppeld. De extensie toont "Niet verbonden".')); }
    catch { setNotice(tr('Не вдалося відкликати.', 'Intrekken mislukt.')); }
    setBusy(false);
  };

  const lastSeen = (ms: number | null) => (ms ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZoneName: 'short' }).format(new Date(ms)) : '—');
  const helper = osKind() === 'windows' ? 'Install-MijnRuimte.cmd' : 'install-mijn-ruimte.sh';
  const hasHelper = (release.installers ?? []).includes(helper);

  const steps: Array<{ ok: boolean; title: string }> = [
    { ok: presence === 'present', title: tr('Встановіть розширення', 'Installeer de extensie') },
    { ok: true, title: tr('Ви ввійшли в акаунт', 'U bent aangemeld') },
    { ok: presence === 'present' && paired && !!agent, title: tr('Підключіть розширення до акаунта', 'Koppel de extensie aan uw account') },
    { ok: !!agent && agent.enabled, title: tr('Оберіть, що дозволено, і ввімкніть для ШІ', 'Kies wat mag en zet aan voor de AI') },
    { ok: allDone, title: tr('Готово: ШІ активний, поки ви на сайті', 'Klaar: de AI is actief zolang u op de site bent') },
  ];

  const installBlock = (
    <section ref={rootRef} className={`hub-card${welcome ? ' mcp-welcome' : ''}`} data-browser-extension='true' data-welcome={welcome ? 'true' : 'false'}>
      <h3>{welcome ? tr('Вітаємо! Завершіть налаштування розширення', 'Welkom! Rond de installatie van de extensie af') : tr('Встановлення й підключення', 'Installeren en koppelen')}</h3>
      <p>{tr('Розширення дозволяє вашому ШІ-помічнику (Claude через наш конектор) читати сторінки цього сайту й виконувати дії в них. Воно працює лише на *.tarasevych.com, лише поки ви ввійшли на сайті, і лише з тим, що ви дозволили.', 'Met de extensie kan uw AI-assistent (Claude via onze connector) pagina\'s van deze site lezen en er acties in uitvoeren. Hij werkt alleen op *.tarasevych.com, alleen zolang u op de site bent aangemeld, en alleen met wat u hebt toegestaan.')}</p>

      <ol className='hub-steps' aria-label={tr('Кроки налаштування', 'Stappen')}>
        {steps.map((s, i) => <li key={i} className={s.ok ? 'done' : ''} aria-current={!s.ok && steps.slice(0, i).every((p) => p.ok) ? 'step' : undefined}>{s.ok ? '✓ ' : ''}{s.title}</li>)}
      </ol>

      <p className={`hub-note${presence === 'absent' ? ' warn' : ''}`} role='status' data-ext-presence={presence}>
        {presence === 'checking' ? tr('Перевіряємо, чи розширення встановлене…', 'Controleren of de extensie is geïnstalleerd…')
          : presence === 'absent' ? tr('Розширення в цьому браузері не виявлено.', 'De extensie is in deze browser niet gevonden.')
          : paired ? tr('Розширення встановлене й підключене.', 'De extensie is geïnstalleerd en gekoppeld.')
          : tr('Розширення встановлене, але ще не підключене.', 'De extensie is geïnstalleerd maar nog niet gekoppeld.')}
      </p>

      {presence !== 'present' ? (
        <>
          <div className='hub-actions'>
            {release.storeUrl ? <a className='hub-btn tone-primary' href={release.storeUrl} target='_blank' rel='noopener noreferrer'><span className='hub-btn-icon'><Globe /></span>{tr('Встановити з Chrome Web Store', 'Installeren uit de Chrome Web Store')}</a> : null}
            {hasHelper ? (
              <a className={`hub-btn${release.storeUrl ? '' : ' tone-primary'}`} href={`/downloads/${helper}`} download onClick={() => setDownloaded(true)}>
                <span className='hub-btn-icon'><Download /></span>
                {osKind() === 'windows' ? tr('Помічник встановлення (Windows)', 'Installatiehulp (Windows)') : tr('Помічник встановлення (macOS / Linux)', 'Installatiehulp (macOS / Linux)')}
              </a>
            ) : null}
            <a className='hub-btn' href={DOWNLOAD} download onClick={() => setDownloaded(true)}><span className='hub-btn-icon'><FileArchive /></span>{tr('Лише ZIP (вручну)', 'Alleen ZIP (handmatig)')}</a>
            {release.crx ? <a className='hub-btn' href={`/downloads/${release.crx.file}`} download data-ext-crx='true' onClick={() => setCrxInfo(true)}><span className='hub-btn-icon'><Package /></span>{tr('Завантажити CRX', 'CRX downloaden')}</a> : null}
          </div>
          {crxInfo && release.crx ? (
            <p className='hub-note' role='status' data-ext-crx-info='true'>{tr(`CRX-файл підписаний нашим ключем (ідентифікатор ${release.crx.extensionId}). Перетягніть його на сторінку chrome://extensions. Chrome на Windows і macOS може відхилити пакети поза магазином; тоді скористайтеся помічником або ZIP.`, `Het CRX-bestand is ondertekend met onze sleutel (id ${release.crx.extensionId}). Sleep het naar de pagina chrome://extensions. Chrome op Windows en macOS kan pakketten buiten de winkel weigeren; gebruik dan de installatiehulp of de ZIP.`)}</p>
          ) : null}
          {downloaded ? (
            <p className='hub-note' role='status' data-ext-downloaded='true'>{tr('Файл завантажується. Відкрийте його з панелі завантажень браузера. Помічник сам завантажить розширення й покаже останні кроки.', 'Het bestand wordt gedownload. Open het in de downloadlijst van de browser. De hulp haalt de extensie zelf op en toont de laatste stappen.')}</p>
          ) : (
            <p className='hub-meta'>{tr('Chrome не дозволяє встановлювати розширення поза магазином «в один клік», тому помічник виконує все, крім двох натискань у самому браузері.', 'Chrome staat installatie buiten de winkel niet "met één klik" toe; de hulp doet alles behalve twee klikken in de browser zelf.')}</p>
          )}
          <ol className='hub-steps'>
            <li>{tr('Відкрийте завантажений файл (або розпакуйте ZIP в окрему папку).', 'Open het gedownloade bestand (of pak de ZIP uit in een eigen map).')}</li>
            <li>{tr('У Chrome або Edge відкрийте chrome://extensions (edge://extensions) і ввімкніть «Режим розробника».', 'Open in Chrome of Edge chrome://extensions (edge://extensions) en zet "Ontwikkelaarsmodus" aan.')}</li>
            <li>{tr('Натисніть «Завантажити розпаковане» й виберіть папку розширення.', 'Klik op "Uitgepakte extensie laden" en kies de map van de extensie.')}</li>
          </ol>
        </>
      ) : null}

      {presence === 'present' ? <p className='hub-meta' data-ext-pin-tip='true'>{tr('Порада: закріпіть значок розширення (значок «пазл» на панелі Chrome, потім шпилька біля «Mijn Ruimte»), щоб бачити стан одним поглядом.', 'Tip: zet het extensiepictogram vast (puzzelstuk in de Chrome-balk, dan de punaise naast "Mijn Ruimte") om de status in één oogopslag te zien.')}</p> : null}
      {presence === 'present' && (!paired || !agent) ? (
        <div className='hub-actions'>
          <IconButton tone='primary' icon={<Link2 />} disabled={busy} onClick={() => void connect()}>{tr('Підключити до мого облікового запису', 'Koppelen aan mijn account')}</IconButton>
        </div>
      ) : null}
      {welcome && !allDone ? <div className='hub-actions'><IconButton icon={<X />} onClick={() => { clearWelcome(); setWelcome(false); }}>{tr('Закрити підказку', 'Hulp sluiten')}</IconButton></div> : null}
      {notice ? <p className='hub-note' role='status'>{notice}</p> : null}
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

        <div className='hub-actions'>
          <IconButton icon={<Check />} disabled={busy} onClick={() => preset(a, 'read')}>{tr('Лише читання (рекомендовано)', 'Alleen lezen (aanbevolen)')}</IconButton>
          <IconButton icon={<PlugZap />} disabled={busy} onClick={() => preset(a, 'all')}>{tr('Увімкнути всі можливості', 'Alle mogelijkheden aanzetten')}</IconButton>
        </div>

        {GROUP_ORDER.map((g) => (
          <Section key={g} id={`ext-${a.id}-${g}`} icon={<Power />} title={tr(GROUPS[g].uk, GROUPS[g].nl)} subtitle={tr(GROUPS[g].hint[0], GROUPS[g].hint[1])} defaultOpen={g === 'read'} tone={g === 'advanced' || g === 'interact' ? 'warn' : 'default'}
            badge={<span className='hub-pill off'>{CAPABILITIES.filter((c) => c.group === g && enabled.includes(c.type)).length}/{CAPABILITIES.filter((c) => c.group === g).length}</span>}>
            <div className='hub-switch-list'>
              {CAPABILITIES.filter((c) => c.group === g).map((c) => {
                const on = enabled.includes(c.type);
                return (
                  <div key={c.type} className={`hub-switch${on ? '' : ' is-off'}`} data-capability={c.type}>
                    <span className='hub-switch-text'>
                      <b>{tr(c.uk, c.nl)}
                        <Help tone={g === 'interact' || g === 'advanced' ? 'warn' : 'info'} tr={tr} content={{ title: tr(c.uk, c.nl), what: on ? tr(c.on[0], c.on[1]) : tr(c.off[0], c.off[1]), touches: tr(`Лише браузер «${a.name}»`, `Alleen de browser «${a.name}»`), on: tr(c.on[0], c.on[1]), off: tr(c.off[0], c.off[1]) }} /></b>
                      <small>{on ? tr('Увімкнено', 'Aan') : tr('Вимкнено', 'Uit')}{on && c.auto ? ` · ${auto.includes(c.type) ? tr('без підтвердження', 'zonder bevestiging') : tr('з підтвердженням', 'met bevestiging')}` : ''}</small>
                    </span>
                    <span className='mcp-cap-controls' style={{ display: 'inline-flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      {c.auto ? (
                        <label className='hub-meta' title={tr(AUTO_HELP[0], AUTO_HELP[1])} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <input type='checkbox' role='switch' checked={on && auto.includes(c.type)} disabled={busy || !on} onChange={(e) => toggleAuto(a, c, e.target.checked)} />
                          <span>{tr('без підтвердження', 'zonder bevestiging')}</span>
                        </label>
                      ) : null}
                      <button type='button' className='hub-toggle' role='switch' aria-checked={on} disabled={busy} aria-label={`${tr(c.uk, c.nl)}: ${on ? tr('увімкнено', 'aan') : tr('вимкнено', 'uit')}`} onClick={() => toggleCap(a, c, !on)} />
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        ))}

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
