import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { AUTO_HELP, CAPABILITIES, DEFAULT_ENABLED, GROUPS, type Cap, type CapGroup } from './browser-capabilities-ui';
import { clearWelcome, welcomePending } from './extension-welcome-store';
import './api-platform-view.css';
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

/** Kleine uitleg bij een schakelaar: verschijnt bij aanwijzen of focus (zelfde stijl als elders in het kabinet). */
function Tip({ text }: { text: string }) {
  return (
    <span className='mcp-q' tabIndex={0} aria-label={text}>
      ?
      <span className='mcp-tip' role='tooltip'>{text}</span>
    </span>
  );
}

/**
 * Browserextensie van Mijn Ruimte: installeren (helper-bestand of ZIP), koppelen, per browser kiezen welke mogelijkheden aan staan,
 * zonder bevestiging toestaan waar dat mag, en het geheel aan- of uitzetten. Na het installeren opent de extensie deze pagina zelf
 * (?extension=welcome) en loopt de gebruiker stap voor stap door de activering heen, ook als hij eerst moet inloggen.
 */
export default function BrowserExtensionPanel({ tr }: { tr: Tr }) {
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
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 10000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    fetch('/downloads/extension-version.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => setRelease(j as Release)).catch(() => undefined);
  }, []);

  // Is de extensie in deze browser aanwezig? De content script antwoordt op een ping met een "hello".
  useEffect(() => {
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
  }, []);

  // Bij de installatiehulp (na installeren of na inloggen): naar dit blok scrollen.
  useEffect(() => { if (welcome) rootRef.current?.scrollIntoView({ block: 'start' }); }, [welcome]);

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
      if (result.ok) { setPaired(true); setNotice(tr('Розширення підключено до вашого облікового запису. Оберіть, що йому дозволено, і ввімкніть його для ШІ нижче.', 'De extensie is gekoppeld aan uw account. Kies hieronder wat hij mag en zet hem aan voor de AI.')); await load(); }
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

  const steps: Array<{ ok: boolean; title: string; body?: string }> = [
    { ok: presence === 'present', title: tr('Встановіть розширення', 'Installeer de extensie') },
    { ok: true, title: tr('Ви ввійшли в акаунт', 'U bent aangemeld') },
    { ok: presence === 'present' && paired && !!agent, title: tr('Підключіть розширення до акаунта', 'Koppel de extensie aan uw account') },
    { ok: !!agent && agent.enabled, title: tr('Оберіть, що дозволено, і ввімкніть для ШІ', 'Kies wat mag en zet aan voor de AI') },
    { ok: allDone, title: tr('Готово: ШІ активний, поки ви на сайті', 'Klaar: de AI is actief zolang u op de site bent') },
  ];

  return (
    <section ref={rootRef} className={`api-platform agents-wrap${welcome ? ' mcp-welcome' : ''}`} data-browser-extension='true' data-welcome={welcome ? 'true' : 'false'}>
      <article className='api-platform-panel'>
        <strong>{welcome ? tr('Вітаємо! Завершіть налаштування розширення', 'Welkom! Rond de installatie van de extensie af') : tr('Розширення браузера', 'Browserextensie')}</strong>
        <p>{tr('Дозволяє вашому ШІ-помічнику (Claude через наш конектор) читати сторінки цього сайту й виконувати дії в них. Розширення працює лише на tarasevych.com і нічого не бачить на інших сайтах. Ви самі обираєте, що саме дозволено, кожну можливість можна ввімкнути чи вимкнути окремо, а дії зі змінами завжди чекають вашого «Дозволити».', 'Laat uw AI-assistent (Claude via onze connector) de pagina\'s van deze site lezen en erin handelen. De extensie werkt alleen op tarasevych.com en ziet niets op andere sites. U kiest zelf wat mag: elke mogelijkheid staat apart aan of uit, en acties die iets wijzigen wachten altijd op uw "Toestaan".')}</p>

        <ol className='mcp-steps' aria-label={tr('Кроки налаштування', 'Stappen')}>
          {steps.map((s, i) => <li key={i} className={s.ok ? 'done' : ''} aria-current={!s.ok && steps.slice(0, i).every((p) => p.ok) ? 'step' : undefined}>{s.ok ? '✓ ' : ''}{s.title}</li>)}
        </ol>

        <p className={`mcp-status mcp-status-${presence === 'present' ? (paired ? 'active' : 'idle') : 'none'}`} role='status' data-ext-presence={presence}>
          {presence === 'checking' ? tr('Перевіряємо, чи розширення встановлене…', 'Controleren of de extensie is geïnstalleerd…')
            : presence === 'absent' ? tr('Розширення в цьому браузері не виявлено.', 'De extensie is in deze browser niet gevonden.')
            : paired ? tr('Розширення встановлене й підключене.', 'De extensie is geïnstalleerd en gekoppeld.')
            : tr('Розширення встановлене, але ще не підключене.', 'De extensie is geïnstalleerd maar nog niet gekoppeld.')}
        </p>

        {presence !== 'present' ? (
          <>
            <div className='api-platform-secret-actions'>
              {release.storeUrl ? <a className='mcp-download' href={release.storeUrl} target='_blank' rel='noopener noreferrer'>{tr('Встановити з Chrome Web Store', 'Installeren uit de Chrome Web Store')}</a> : null}
              {hasHelper ? (
                <a className={release.storeUrl ? 'mcp-download-secondary' : 'mcp-download'} href={`/downloads/${helper}`} download onClick={() => setDownloaded(true)}>
                  {osKind() === 'windows' ? tr('Завантажити помічник встановлення (Windows)', 'Installatiehulp downloaden (Windows)') : tr('Завантажити помічник встановлення (macOS / Linux)', 'Installatiehulp downloaden (macOS / Linux)')}
                </a>
              ) : null}
              <a className='mcp-download-secondary' href={DOWNLOAD} download onClick={() => setDownloaded(true)}>{tr('Лише ZIP (вручну)', 'Alleen ZIP (handmatig)')}</a>
              {release.crx ? <a className='mcp-download-secondary' href={`/downloads/${release.crx.file}`} download data-ext-crx='true' onClick={() => setCrxInfo(true)}>{tr('Завантажити CRX', 'CRX downloaden')}</a> : null}
            </div>
            {crxInfo && release.crx ? (
              <p role='status' data-ext-crx-info='true'>{tr(`CRX-файл підписаний нашим ключем (ідентифікатор ${release.crx.extensionId}). Перетягніть його на сторінку chrome://extensions. Увага: Chrome на Windows і macOS зазвичай відхиляє CRX не з магазину («Пакет недійсний»): це захист Chrome, а не помилка. Такий файл приймають деякі Chromium-браузери, Linux і комп'ютери, де адміністратор дозволив розширення за політикою (тоді розширення ще й саме оновлюється). Якщо Chrome відхилив файл, скористайтеся помічником встановлення вище.`, `Het CRX-bestand is ondertekend met onze sleutel (id ${release.crx.extensionId}). Sleep het naar chrome://extensions. Let op: Chrome op Windows en macOS weigert een CRX van buiten de winkel meestal ("Pakket ongeldig"): dat is een beveiliging van Chrome, geen fout. Sommige Chromium-browsers, Linux en computers waar een beheerder de extensie via beleid toestaat accepteren hem wel (dan werkt hij zichzelf ook bij). Weigert Chrome het bestand, gebruik dan de installatiehulp hierboven.`)}</p>
            ) : null}
            {downloaded ? (
              <p role='status' data-ext-downloaded='true'>{tr('Файл завантажується. Відкрийте його з панелі завантажень браузера. Помічник сам завантажить розширення, перевірить контрольну суму, розпакує його й відкриє сторінку розширень. Далі лишиться ввімкнути «Режим розробника» і вибрати папку (шлях уже в буфері обміну). Після цього розширення саме поверне вас сюди.', 'Het bestand wordt gedownload. Open het via de downloadbalk van uw browser. De hulp haalt de extensie op, controleert de controlesom, pakt hem uit en opent de extensiepagina. Daarna hoeft u alleen "Ontwikkelaarsmodus" aan te zetten en de map te kiezen (het pad staat op het klembord). Daarna brengt de extensie u hier terug.')}</p>
            ) : (
              <p className='mcp-hint'>{tr('Chrome не дозволяє встановлювати розширення поза магазином «в один клік», тому помічник виконує все, крім двох натискань у самому браузері. Коли розширення з’явиться в Chrome Web Store, тут буде кнопка «Встановити».', 'Chrome laat extensies buiten de winkel niet "in één klik" installeren; de hulp doet alles behalve twee klikken in de browser zelf. Zodra de extensie in de Chrome Web Store staat, verschijnt hier een knop "Installeren".')}</p>
            )}
            <ol>
              <li>{tr('Відкрийте завантажений файл (або розпакуйте ZIP в окрему папку).', 'Open het gedownloade bestand (of pak de ZIP uit in een eigen map).')}</li>
              <li>{tr('У Chrome або Edge відкрийте chrome://extensions (edge://extensions) і ввімкніть «Режим розробника».', 'Open in Chrome of Edge chrome://extensions (edge://extensions) en zet "Ontwikkelaarsmodus" aan.')}</li>
              <li>{tr('Натисніть «Завантажити розпаковане» й виберіть папку розширення.', 'Klik op "Uitgepakte extensie laden" en kies de map van de extensie.')}</li>
            </ol>
          </>
        ) : null}

        {presence === 'present' ? <p className='mcp-hint' data-ext-pin-tip='true'>{tr('Порада: закріпіть значок розширення (значок «пазл» на панелі Chrome, потім шпилька біля «Mijn Ruimte»), щоб завжди бачити його стан: «ШІ активний» або що саме треба зробити.', 'Tip: zet het pictogram van de extensie vast (puzzelstuk in de werkbalk van Chrome, dan het speldje bij "Mijn Ruimte"), zodat u altijd de status ziet: "AI actief" of wat er nog moet gebeuren.')}</p> : null}
        {presence === 'present' && (!paired || !agent) ? (
          <div className='api-platform-secret-actions'>
            <button type='button' className='mcp-reconnect' disabled={busy} onClick={() => void connect()}>{tr('Підключити до мого облікового запису', 'Koppelen aan mijn account')}</button>
          </div>
        ) : null}
        {welcome && !allDone ? <p><button type='button' className='mcp-cancel' onClick={() => { clearWelcome(); setWelcome(false); }}>{tr('Закрити підказку', 'Hulp sluiten')}</button></p> : null}
        {notice ? <p role='status'>{notice}</p> : null}
      </article>

      <article className='api-platform-panel' data-browser-agents={String(agents.length)}>
        <strong>{tr('Підключені браузери', 'Gekoppelde browsers')}</strong>
        {agents.length ? (
          <ul className='api-platform-connections mcp-grants'>
            {agents.map((a) => {
              const { enabled, auto } = policyOf(a);
              const state: 'on' | 'wait' | 'off' = !a.enabled ? 'off' : armed(a) ? 'on' : 'wait';
              return (
                <li key={a.id} className='mcp-grant mcp-browser'>
                  <div className='mcp-grant-main'>
                    <div className='agents-row'>
                      <b>{a.name}</b>
                      <span className={`agents-badge ${a.status === 'connected' ? 'agents-connected' : 'agents-idle'}`}>{a.status === 'connected' ? tr('підключено', 'verbonden') : tr('не в мережі', 'offline')}</span>
                      <span className={`agents-badge ${state === 'on' ? 'agents-connected' : 'agents-idle'}`} data-browser-state={state}>
                        {state === 'on' ? tr('ШІ активний (вхід підтверджено)', 'AI actief (aanmelding bevestigd)') : state === 'wait' ? tr('очікує входу на сайті', 'wacht op aanmelding op de site') : tr('вимкнено для ШІ', 'uit voor AI')}
                      </span>
                    </div>
                    <small>{tr('востаннє', 'laatst gezien')}: {lastSeen(a.lastSeenAt)}</small>
                    <label className='mcp-switch'>
                      <input type='checkbox' role='switch' checked={a.enabled} disabled={busy} onChange={(e) => void setEnabled(a, e.target.checked)} />
                      <span><b>{tr('Дозволити ШІ користуватися цим браузером', 'AI mag deze browser gebruiken')}</b>
                        <Tip text={tr('Увімкнено: ШІ може користуватися лише тим, що ви дозволили нижче, і лише поки ви ввійшли на сайті. Вимкнено: розширення нічого не бачить і не робить, навіть якщо підключене.', 'Aan: de AI mag alleen gebruiken wat u hieronder toestaat, en alleen zolang u op de site bent aangemeld. Uit: de extensie ziet en doet niets, ook al is hij gekoppeld.')} />
                      </span>
                    </label>
                    <small>{tr('Працює лише поки ви ввійшли на сайті: вихід або закриття сайту вимикає ШІ за кілька хвилин, навіть якщо розширення залишилось.', 'Werkt alleen zolang u op de site bent aangemeld: uitloggen of de site sluiten zet de AI binnen enkele minuten stil, ook als de extensie blijft staan.')}</small>

                    <div className='mcp-presets'>
                      <button type='button' className='mcp-cancel' disabled={busy} onClick={() => preset(a, 'read')}>{tr('Лише читання (рекомендовано)', 'Alleen lezen (aanbevolen)')}</button>
                      <button type='button' className='mcp-cancel' disabled={busy} onClick={() => preset(a, 'all')}>{tr('Увімкнути всі можливості', 'Alle mogelijkheden aanzetten')}</button>
                    </div>

                    {GROUP_ORDER.map((g) => (
                      <div key={g} className={`mcp-tool-group mcp-cap-${g}`}>
                        <b>{tr(GROUPS[g].uk, GROUPS[g].nl)} <small>{tr(GROUPS[g].hint[0], GROUPS[g].hint[1])}</small></b>
                        <ul>
                          {CAPABILITIES.filter((c) => c.group === g).map((c) => {
                            const on = enabled.includes(c.type);
                            return (
                              <li key={c.type} className={`mcp-tool-row${on ? '' : ' is-off'}`} data-capability={c.type}>
                                <span className='mcp-cap-name'>{tr(c.uk, c.nl)} <Tip text={on ? tr(`Зараз увімкнено. ${c.on[0]}`, `Staat nu aan. ${c.on[1]}`) : tr(`Зараз вимкнено. ${c.off[0]} Якщо ввімкнути: ${c.on[0]}`, `Staat nu uit. ${c.off[1]} Als u dit aanzet: ${c.on[1]}`)} /></span>
                                <span className='mcp-cap-controls'>
                                  {c.auto ? (
                                    <label className='mcp-switch mcp-auto' title={tr(AUTO_HELP[0], AUTO_HELP[1])}>
                                      <input type='checkbox' role='switch' checked={on && auto.includes(c.type)} disabled={busy || !on} onChange={(e) => toggleAuto(a, c, e.target.checked)} />
                                      <span>{tr('без підтвердження', 'zonder bevestiging')}</span>
                                    </label>
                                  ) : null}
                                  <button type='button' className={`mcp-tool-toggle ${on ? 'on' : 'off'}`} role='switch' aria-checked={on} disabled={busy}
                                    aria-label={`${tr(c.uk, c.nl)}: ${on ? tr('увімкнено', 'aan') : tr('вимкнено', 'uit')}`} onClick={() => toggleCap(a, c, !on)}>
                                    {on ? tr('Увімкнено', 'Aan') : tr('Вимкнено', 'Uit')}
                                  </button>
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {confirm === a.id ? (
                    <div className='mcp-confirm' role='alertdialog' aria-label={tr('Підтвердження відключення', 'Bevestig loskoppelen')}>
                      <span>{tr('Відключити цей браузер? ШІ більше не бачитиме ваші сторінки.', 'Deze browser loskoppelen? De AI ziet uw pagina\'s dan niet meer.')}</span>
                      <button type='button' className='mcp-revoke' disabled={busy} onClick={() => void revoke(a)}>{tr('Так, відключити', 'Ja, loskoppelen')}</button>
                      <button type='button' className='mcp-cancel' onClick={() => setConfirm(null)}>{tr('Скасувати', 'Annuleren')}</button>
                    </div>
                  ) : (
                    <button type='button' className='mcp-revoke' disabled={busy} onClick={() => setConfirm(a.id)}>{tr('Відключити', 'Loskoppelen')}</button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <p>{tr('Ще жоден браузер не підключений.', 'Er is nog geen browser gekoppeld.')}</p>}
      </article>
    </section>
  );
}
