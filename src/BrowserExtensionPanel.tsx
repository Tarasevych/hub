import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import './api-platform-view.css';
import './agents-panel.css';

type Tr = (uk: string, nl: string) => string;
type BrowserAgent = { id: string; name: string; platform: string | null; status: 'connected' | 'disconnected'; lastSeenAt: number | null; policy: { autoApprove: string[] } };
type Presence = 'checking' | 'present' | 'absent';

const sessionBody = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const DOWNLOAD = '/downloads/mijn-ruimte-extension.zip';

const browserName = () => {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : 'Browser';
  return `${name} (${navigator.platform || 'pc'})`;
};

/** Browserextensie van Mijn Ruimte: downloaden, koppelen, rechten per browser en intrekken. Werkt alleen op tarasevych.com. */
export default function BrowserExtensionPanel({ tr }: { tr: Tr }) {
  const [agents, setAgents] = useState<BrowserAgent[]>([]);
  const [presence, setPresence] = useState<Presence>('checking');
  const [paired, setPaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const pending = useRef<((ok: boolean, reason: string) => void) | null>(null);

  const load = useCallback(async () => {
    const res = await api.post('/api/owner/agents/list', sessionBody());
    setAgents(((res.data?.agents ?? []) as BrowserAgent[]).filter((a) => a.platform === 'browser'));
  }, []);

  useEffect(() => { void load().catch(() => undefined); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

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
      if (result.ok) { setPaired(true); setNotice(tr('Розширення підключено до вашого облікового запису.', 'De extensie is gekoppeld aan uw account.')); await load(); }
      else setNotice(tr(`Не вдалося підключити (${result.reason}). Перевірте, що розширення встановлене й увімкнене, і спробуйте ще раз.`, `Koppelen mislukt (${result.reason}). Controleer of de extensie is geïnstalleerd en aan staat en probeer opnieuw.`));
    } catch (e) {
      const code = String((e as Error)?.message || '');
      setNotice(code.includes('AGENT_LIMIT') ? tr('Досягнуто ліміт пристроїв (10). Відкличте зайві.', 'Limiet van 10 apparaten bereikt. Trek oude apparaten in.') : tr('Не вдалося отримати код підключення.', 'Koppelcode ophalen mislukt.'));
    }
    setBusy(false);
  };

  const setNavigation = async (agent: BrowserAgent, on: boolean) => {
    setBusy(true); setNotice('');
    const next = on ? ['browser.snapshot', 'browser.navigate'] : ['browser.snapshot'];
    try { await api.post(`/api/owner/agents/${agent.id}/policy`, { ...sessionBody(), autoApprove: next }); await load(); }
    catch { setNotice(tr('Не вдалося змінити дозвіл.', 'Recht wijzigen mislukt.')); }
    setBusy(false);
  };

  const revoke = async (agent: BrowserAgent) => {
    setConfirm(null); setBusy(true); setNotice('');
    try { await api.post(`/api/owner/agents/${agent.id}/revoke`, sessionBody()); await load(); setNotice(tr('Браузер відключено. Розширення покаже «Не підключено».', 'Browser losgekoppeld. De extensie toont "Niet verbonden".')); }
    catch { setNotice(tr('Не вдалося відкликати.', 'Intrekken mislukt.')); }
    setBusy(false);
  };

  const lastSeen = (ms: number | null) => (ms ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', timeZoneName: 'short' }).format(new Date(ms)) : '—');

  return (
    <section className='api-platform agents-wrap' data-browser-extension='true'>
      <article className='api-platform-panel'>
        <strong>{tr('Розширення браузера', 'Browserextensie')}</strong>
        <p>{tr('Дозволяє вашому ШІ-помічнику (Claude через наш конектор) читати сторінки цього сайту й виконувати дії в них. Розширення працює лише на tarasevych.com і нічого не бачить на інших сайтах. Читання виконується одразу, а навігація, кліки й введення чекають вашого «Дозволити» (навігацію можна дозволити автоматично нижче).', 'Laat uw AI-assistent (Claude via onze connector) de pagina\'s van deze site lezen en erin handelen. De extensie werkt alleen op tarasevych.com en ziet niets op andere sites. Lezen gebeurt direct; navigeren, klikken en typen wachten op uw "Toestaan" (navigeren kunt u hieronder automatisch toestaan).')}</p>
        <p className={`mcp-status mcp-status-${presence === 'present' ? (paired ? 'active' : 'idle') : 'none'}`} role='status' data-ext-presence={presence}>
          {presence === 'checking' ? tr('Перевіряємо, чи розширення встановлене…', 'Controleren of de extensie is geïnstalleerd…')
            : presence === 'absent' ? tr('Розширення в цьому браузері не виявлено.', 'De extensie is in deze browser niet gevonden.')
            : paired ? tr('Розширення встановлене й підключене.', 'De extensie is geïnstalleerd en gekoppeld.')
            : tr('Розширення встановлене, але ще не підключене.', 'De extensie is geïnstalleerd maar nog niet gekoppeld.')}
        </p>
        <div className='api-platform-secret-actions'>
          <a className='mcp-download' href={DOWNLOAD} download>{tr('Завантажити розширення', 'Extensie downloaden')}</a>
          {presence === 'present' ? (
            <button type='button' className='mcp-reconnect' disabled={busy} onClick={() => void connect()}>
              {paired ? tr('Підключити знову', 'Opnieuw koppelen') : tr('Підключити до мого облікового запису', 'Koppelen aan mijn account')}
            </button>
          ) : null}
        </div>
        {presence !== 'present' ? (
          <ol>
            <li>{tr('Завантажте файл і розпакуйте його в окрему папку.', 'Download het bestand en pak het uit in een eigen map.')}</li>
            <li>{tr('У Chrome або Edge відкрийте chrome://extensions (або edge://extensions) і ввімкніть «Режим розробника».', 'Open in Chrome of Edge chrome://extensions (of edge://extensions) en zet "Ontwikkelaarsmodus" aan.')}</li>
            <li>{tr('Натисніть «Завантажити розпаковане» і виберіть цю папку.', 'Klik op "Uitgepakte extensie laden" en kies die map.')}</li>
            <li>{tr('Оновіть цю сторінку й натисніть «Підключити до мого облікового запису».', 'Ververs deze pagina en klik op "Koppelen aan mijn account".')}</li>
          </ol>
        ) : null}
        {notice ? <p role='status'>{notice}</p> : null}
      </article>

      <article className='api-platform-panel' data-browser-agents={String(agents.length)}>
        <strong>{tr('Підключені браузери', 'Gekoppelde browsers')}</strong>
        {agents.length ? (
          <ul className='api-platform-connections mcp-grants'>
            {agents.map((a) => {
              const nav = a.policy.autoApprove.includes('browser.navigate');
              return (
                <li key={a.id} className='mcp-grant'>
                  <div className='mcp-grant-main'>
                    <div className='agents-row'>
                      <b>{a.name}</b>
                      <span className={`agents-badge ${a.status === 'connected' ? 'agents-connected' : 'agents-idle'}`}>{a.status === 'connected' ? tr('підключено', 'verbonden') : tr('не в мережі', 'offline')}</span>
                    </div>
                    <small>{tr('востаннє', 'laatst gezien')}: {lastSeen(a.lastSeenAt)}</small>
                    <label className='mcp-switch'>
                      <input type='checkbox' role='switch' checked={nav} disabled={busy} onChange={(e) => void setNavigation(a, e.target.checked)} />
                      <span>{tr('Дозволити відкривати сторінки без підтвердження', 'Pagina\'s openen zonder bevestiging toestaan')}</span>
                    </label>
                    <small>{tr('Кліки, введення й дії сайту завжди чекають вашого «Дозволити».', 'Klikken, typen en siteacties wachten altijd op uw "Toestaan".')}</small>
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
