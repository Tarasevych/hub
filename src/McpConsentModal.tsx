import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Eye, Pencil, ShieldCheck, Terminal, TriangleAlert } from 'lucide-react';
import { api } from './platform/client';
import { clearPendingConsent, getPendingConsent } from './mcp-consent-store';
import { ecosystemTabContext } from './tab-context';
import './mcp-consent-modal.css';

type Tr = (uk: string, nl: string) => string;
type Info = { clientName: string; redirectHost: string; loopback: boolean; scope: string; expiresAt: number };
type Phase = 'loading' | 'ready' | 'deciding' | 'redirecting' | 'gone' | 'forbidden' | 'limit' | 'error';

const sessionBody = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const statusOf = (e: unknown): number => Number((e as { status?: number })?.status ?? 0);
const codeOf = (e: unknown): string => String((e as Error)?.message ?? '');
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * Toestemmingsscherm voor Claude (OAuth). Verschijnt als venster boven elk scherm van mcp.* zodra er een openstaand verzoek
 * is (uit ?consent=<id>, ook bewaard over het aanmelden heen, zie mcp-consent-store.ts). Wordt alleen gemount voor een
 * aangemelde gebruiker (McpServiceView), dus na het inloggen verschijnt het meteen.
 */
export default function McpConsentModal({ tr }: { tr: Tr }) {
  const [rid, setRid] = useState<string | null>(() => getPendingConsent());
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [left, setLeft] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Een nieuw ?consent= (bijv. een tweede verzoek in dezelfde sessie) oppikken bij terug/vooruit-navigatie.
  useEffect(() => {
    const onPop = () => { setRid(getPendingConsent()); setDismissed(false); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!rid) return;
    let active = true;
    setPhase('loading'); setInfo(null);
    api.post('/api/owner/mcp-connector/consent/info', { ...sessionBody(), rid })
      .then((res) => { if (!active) return; setInfo(res.data as Info); setPhase('ready'); })
      .catch((e) => {
        if (!active) return;
        const status = statusOf(e);
        if (status === 404) { clearPendingConsent(); setPhase('gone'); } else if (status === 403) setPhase('forbidden'); else setPhase('error');
      });
    return () => { active = false; };
  }, [rid]);

  // Aftellen tot het verzoek op de server verloopt.
  useEffect(() => {
    if (!info || phase !== 'ready') return;
    const tick = () => { const ms = info.expiresAt - Date.now(); setLeft(ms); if (ms <= 0) { clearPendingConsent(); setPhase('gone'); } };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [info, phase]);

  const open = !!rid && !dismissed;

  // Achtergrond niet laten scrollen, focus in het venster en Tab binnen het venster houden.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return; // Escape beslist bewust niets: toestemming vraagt een keuze
    const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]');
    if (!items || !items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const decide = useCallback(async (approve: boolean) => {
    if (!rid || phase !== 'ready') return;
    setPhase('deciding');
    try {
      const res = await api.post('/api/owner/mcp-connector/consent', { ...sessionBody(), rid, approve });
      setPhase('redirecting');
      clearPendingConsent();
      location.assign(String(res.data.redirect)); // terug naar Claude (of de loopback van Claude Code) met de code
    } catch (e) {
      const status = statusOf(e);
      if (status === 409 || codeOf(e).includes('GRANT_LIMIT')) setPhase('limit');
      else if (status === 404) { clearPendingConsent(); setPhase('gone'); }
      else setPhase('ready');
    }
  }, [rid, phase]);

  const close = () => { setDismissed(true); };
  const done = () => { clearPendingConsent(); setRid(null); };

  if (!open) return null;

  const busy = phase === 'deciding' || phase === 'redirecting';
  const name = info?.clientName || 'Claude';

  const groups: Array<{ id: string; Icon: typeof Eye; title: string; note?: string; items: string[] }> = [
    { id: 'read', Icon: Eye, title: tr('Читання', 'Lezen'), items: [
      tr('Бачити ваші пристрої та їхній стан', 'Uw apparaten en hun status zien'),
      tr('Читати файли й папки в дозволених агентом місцях', 'Bestanden en mappen lezen op de plekken die de agent toestaat'),
      tr('Список контейнерів Docker та метрики системи (ЦП, пам’ять, диск)', 'Docker-containers en systeemmetrics (cpu, geheugen, schijf)'),
    ] },
    { id: 'write', Icon: Pencil, title: tr('Запис', 'Schrijven'), note: tr('кожен запис — лише після вашого «Дозволити»', 'elke schrijfactie pas na uw "Toestaan"'), items: [
      tr('Створювати й змінювати файли в дозволених папках', 'Bestanden maken en wijzigen in de toegestane mappen'),
    ] },
    { id: 'run', Icon: Terminal, title: tr('Виконання', 'Uitvoeren'), note: tr('кожна дія — лише після вашого «Дозволити»', 'elke actie pas na uw "Toestaan"'), items: [
      tr('Запускати команди зі списку, дозволеного агентом (без shell)', 'Commando\'s uit de lijst van de agent starten (zonder shell)'),
      tr('Запускати, зупиняти й перезапускати контейнери Docker', 'Docker-containers starten, stoppen en herstarten'),
    ] },
  ];

  return createPortal(
    <div className='mcp-consent-backdrop' role='presentation' data-mcp-consent-modal='true'>
      <div
        ref={dialogRef} className='mcp-consent-dialog' role='dialog' aria-modal='true'
        aria-labelledby='mcp-consent-title' aria-describedby='mcp-consent-desc' tabIndex={-1} onKeyDown={onKeyDown}
      >
        <div className='mcp-consent-head'>
          <span className='mcp-consent-icon' aria-hidden='true'><ShieldCheck size={26} /></span>
          <div>
            <h2 id='mcp-consent-title'>
              {tr(`${name} просить доступ до ваших пристроїв / ПК`, `${name} vraagt toegang tot uw apparaten / pc`)}
            </h2>
            <p id='mcp-consent-desc' className='mcp-consent-sub'>
              {phase === 'ready' || busy
                ? tr('Після вашого рішення ви повернетеся на', 'Na uw keuze keert u terug naar') + ` ${info?.redirectHost ?? ''}`
                : tr('Запит на підключення конектора Mijn Ruimte', 'Verzoek om de Mijn Ruimte-connector te koppelen')}
            </p>
          </div>
        </div>

        {phase === 'loading' ? <p className='mcp-consent-msg'>{tr('Завантаження запиту…', 'Verzoek laden…')}</p> : null}

        {phase === 'gone' ? (
          <>
            <p className='mcp-consent-msg' role='alert'>{tr('Запит застарів або вже оброблений. Почніть підключення в Claude знову (Customize → Connectors).', 'Dit verzoek is verlopen of al afgehandeld. Begin de koppeling opnieuw in Claude (Customize → Connectors).')}</p>
            <div className='mcp-consent-actions'><button type='button' className='mcp-consent-secondary' onClick={done}>{tr('Закрити', 'Sluiten')}</button></div>
          </>
        ) : null}

        {phase === 'forbidden' ? (
          <>
            <p className='mcp-consent-msg' role='alert'>{tr('Цей акаунт не має права керувати конекторами (потрібне право «api-platform»). Увійдіть акаунтом власника.', 'Dit account mag geen connectors beheren (recht "api-platform" nodig). Meld u aan met het eigenaarsaccount.')}</p>
            <div className='mcp-consent-actions'><button type='button' className='mcp-consent-secondary' onClick={close}>{tr('Закрити', 'Sluiten')}</button></div>
          </>
        ) : null}

        {phase === 'error' ? (
          <>
            <p className='mcp-consent-msg' role='alert'>{tr('Не вдалося завантажити запит. Перевірте з’єднання й спробуйте ще раз.', 'Het verzoek kon niet worden geladen. Controleer de verbinding en probeer opnieuw.')}</p>
            <div className='mcp-consent-actions'>
              <button type='button' className='mcp-consent-secondary' onClick={close}>{tr('Закрити', 'Sluiten')}</button>
              <button type='button' className='mcp-consent-primary' onClick={() => { setRid(null); window.setTimeout(() => setRid(getPendingConsent()), 0); }}>{tr('Спробувати ще раз', 'Opnieuw proberen')}</button>
            </div>
          </>
        ) : null}

        {phase === 'limit' ? (
          <>
            <p className='mcp-consent-msg' role='alert'>{tr('Досягнуто ліміт активних доступів (10). Відкличте непотрібні у списку «Надані доступи» нижче й підключіть Claude знову.', 'Limiet van actieve toegangen bereikt (10). Trek oude toegang in onder "Verleende toegang" en koppel Claude opnieuw.')}</p>
            <div className='mcp-consent-actions'><button type='button' className='mcp-consent-secondary' onClick={close}>{tr('Показати мої доступи', 'Mijn toegang tonen')}</button></div>
          </>
        ) : null}

        {(phase === 'ready' || busy) && info ? (
          <>
            <ul className='mcp-consent-groups' aria-label={tr('Які дозволи запитуються', 'Welke rechten worden gevraagd')}>
              {groups.map(({ id, Icon, title, note, items }) => (
                <li key={id} className={`mcp-consent-group mcp-consent-${id}`}>
                  <span className='mcp-consent-group-icon' aria-hidden='true'><Icon size={18} /></span>
                  <div>
                    <b>{title}{note ? <span className='mcp-consent-note'>{note}</span> : null}</b>
                    <ul>{items.map((text) => <li key={text}>{text}</li>)}</ul>
                  </div>
                </li>
              ))}
            </ul>

            {info.loopback ? (
              <p className='mcp-consent-warn' role='alert'>
                <TriangleAlert size={16} aria-hidden='true' /> {tr('Це локальний клієнт (Claude Code на вашому комп’ютері). Дозволяйте, лише якщо ви самі його запустили.', 'Dit is een lokale client (Claude Code op uw computer). Sta alleen toe als u hem zelf hebt gestart.')}
              </p>
            ) : null}

            <p className='mcp-consent-meta'>
              <Clock size={14} aria-hidden='true' /> {tr('Запит діє ще', 'Verzoek nog geldig')}: <b>{mmss(left)}</b>
              {' · '}{tr('Доступ можна відкликати будь-коли в розділі «Агенти».', 'U kunt de toegang altijd intrekken onder "Agenten".')}
            </p>

            <div className='mcp-consent-actions'>
              <button type='button' className='mcp-consent-secondary' disabled={busy} onClick={() => void decide(false)}>{tr('Заборонити', 'Weigeren')}</button>
              <button type='button' className='mcp-consent-primary' disabled={busy} onClick={() => void decide(true)}>
                {phase === 'redirecting' ? tr('Повертаємо в Claude…', 'Terug naar Claude…') : phase === 'deciding' ? tr('Зачекайте…', 'Even geduld…') : tr('Дозволити', 'Toestaan')}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
