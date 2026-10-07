import { useCallback, useEffect, useState } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import './api-platform-view.css';
import './agents-panel.css';

type Tr = (uk: string, nl: string) => string;
type Mode = 'always' | 'ask' | 'off';
type Group = 'devices' | 'browser' | 'mail' | 'calendar' | 'drive' | 'site' | 'github';
type Tool = {
  name: string; title: string; description: string; kind: string; group: Group; mode: Mode; defaultMode: 'always' | 'ask';
  canAlways: boolean; needsApproval: boolean; readOnly: boolean; destructive: boolean; enabled: boolean;
};
type Call = { id: string; tool: string; args: Record<string, unknown>; status: string; createdAt: number; preview: string };

const sessionBody = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const GROUPS: Array<{ id: Group; uk: string; nl: string; hint: [string, string] }> = [
  { id: 'devices', uk: 'Пристрої й сервер', nl: 'Apparaten en server', hint: ['Файли, команди, Docker і метрики ваших ПК/VM через агента.', 'Bestanden, commando\'s, Docker en metrics van uw pc\'s/VM\'s via de agent.'] },
  { id: 'browser', uk: 'Браузер (розширення)', nl: 'Browser (extensie)', hint: ['Читання й керування сторінками сайту через розширення. Детальні перемикачі на кожен браузер нижче.', 'Pagina\'s van de site lezen en bedienen via de extensie. Gedetailleerde schakelaars per browser staan hieronder.'] },
  { id: 'mail', uk: 'Пошта (Gmail)', nl: 'E-mail (Gmail)', hint: ['Пошук, читання й зміна листів у підключеному Gmail.', 'Zoeken, lezen en wijzigen van berichten in het gekoppelde Gmail.'] },
  { id: 'calendar', uk: 'Календар', nl: 'Agenda', hint: ['Календарі й події Google Calendar.', 'Agenda\'s en afspraken van Google Agenda.'] },
  { id: 'drive', uk: 'Диск (Google Drive)', nl: 'Schijf (Google Drive)', hint: ['Перегляд папок і читання файлів Google Drive.', 'Mappen bekijken en bestanden lezen op Google Drive.'] },
  { id: 'site', uk: 'Пошук по сайту', nl: 'Zoeken op de site', hint: ['Єдиний пошук по всьому, що вже проіндексовано в Mijn Ruimte.', 'Eén zoekopdracht over alles wat Mijn Ruimte heeft geïndexeerd.'] },
  { id: 'github', uk: 'GitHub', nl: 'GitHub', hint: ['Лише читання через ваш токен із сховища.', 'Alleen lezen met uw token uit de kluis.'] },
];

function Tip({ text }: { text: string }) {
  return (
    <span className='mcp-q' tabIndex={0} aria-label={text}>
      ?
      <span className='mcp-tip' role='tooltip'>{text}</span>
    </span>
  );
}

/** Drie knoppen: Завжди / Питати / Вимк. De eerste is uitgeschakeld voor wat nooit automatisch mag (server begrenst dat ook zelf). */
function ModeSwitch({ value, canAlways, disabled, onChange, label, tr }: { value: Mode; canAlways: boolean; disabled: boolean; onChange: (m: Mode) => void; label: string; tr: Tr }) {
  const items: Array<{ mode: Mode; text: string; help: string }> = [
    { mode: 'always', text: tr('Завжди', 'Altijd'), help: canAlways ? tr('Завжди: Claude викликає без додаткового запиту від сайту. Для пристроїв і браузера діють ще й їхні власні правила («без підтвердження»).', 'Altijd: Claude roept het aan zonder extra vraag van de site. Voor apparaten en browsers gelden ook hun eigen regels ("zonder bevestiging").') : tr('Цей інструмент змінює дані або показує приватне, тому завжди чекає вашого «Дозволити».', 'Dit hulpmiddel wijzigt gegevens of toont iets privés en wacht daarom altijd op uw "Toestaan".') },
    { mode: 'ask', text: tr('Питати', 'Vragen'), help: tr('Питати: кожен виклик чекає вашого «Дозволити» на цій сторінці.', 'Vragen: elke aanroep wacht op uw "Toestaan" op deze pagina.') },
    { mode: 'off', text: tr('Вимк.', 'Uit'), help: tr('Вимкнено: Claude цього інструмента не бачить і викликати не може.', 'Uit: Claude ziet dit hulpmiddel niet en kan het niet aanroepen.') },
  ];
  return (
    <span className='mcp-seg' role='radiogroup' aria-label={label}>
      {items.map((it) => (
        <button key={it.mode} type='button' role='radio' aria-checked={value === it.mode} data-mode={it.mode} title={it.help}
          disabled={disabled || (it.mode === 'always' && !canAlways)} onClick={() => value !== it.mode && onChange(it.mode)}>
          {it.text}
        </button>
      ))}
    </span>
  );
}

/** "Інструменти й дозволи": per hulpmiddel Altijd / Vragen / Uit, "Set all tools", per groep, en de wachtrij voor goedkeuring van hulpmiddelen van de site. */
export default function McpToolsPanel({ tr }: { tr: Tr }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadTools = useCallback(async () => {
    const res = await api.post('/api/owner/mcp-connector/tools', sessionBody());
    setTools(res.data?.tools ?? []);
  }, []);
  const loadCalls = useCallback(async () => {
    const res = await api.post('/api/owner/mcp-connector/approvals', sessionBody());
    setCalls(res.data?.calls ?? []);
  }, []);

  useEffect(() => { void loadTools().catch(() => undefined); void loadCalls().catch(() => undefined); }, [loadTools, loadCalls]);
  useEffect(() => {
    const timer = window.setInterval(() => { void loadCalls().catch(() => undefined); }, 4000);
    return () => window.clearInterval(timer);
  }, [loadCalls]);

  const setMode = async (tool: Tool, mode: Mode) => {
    setBusy(true); setNotice('');
    try { const res = await api.post('/api/owner/mcp-connector/tools/set', { ...sessionBody(), name: tool.name, mode }); setTools(res.data?.tools ?? []); }
    catch { setNotice(tr('Не вдалося змінити режим інструмента.', 'Modus van het hulpmiddel wijzigen mislukt.')); }
    setBusy(false);
  };
  const setAll = async (mode: Mode | 'default', group?: Group) => {
    setBusy(true); setNotice('');
    try { const res = await api.post('/api/owner/mcp-connector/tools/set-all', { ...sessionBody(), mode, ...(group ? { group } : {}) }); setTools(res.data?.tools ?? []); }
    catch { setNotice(tr('Не вдалося змінити режим.', 'Modus wijzigen mislukt.')); }
    setBusy(false);
  };
  const decide = async (call: Call, approve: boolean) => {
    setBusy(true); setNotice('');
    try {
      await api.post(`/api/owner/mcp-connector/approvals/${call.id}/${approve ? 'approve' : 'reject'}`, sessionBody());
      await loadCalls();
    } catch { setNotice(tr('Запит уже недійсний (час вийшов або його вже оброблено).', 'Dit verzoek is niet meer geldig (verlopen of al afgehandeld).')); await loadCalls().catch(() => undefined); }
    setBusy(false);
  };

  const titleOf = (name: string) => tools.find((t) => t.name === name)?.title || name;
  const pending = calls.filter((c) => c.status === 'pending_approval');
  const recent = calls.filter((c) => c.status !== 'pending_approval').slice(0, 5);
  const statusText = (s: string) => ({ succeeded: tr('виконано', 'uitgevoerd'), failed: tr('помилка', 'mislukt'), rejected: tr('відхилено', 'geweigerd'), timeout: tr('час вийшов', 'verlopen'), approved: tr('схвалено', 'goedgekeurd') } as Record<string, string>)[s] || s;

  return (
    <section className='api-platform agents-wrap' data-mcp-tools-panel='true'>
      <article className='api-platform-panel' data-mcp-tools={String(tools.length)}>
        <strong>{tr('Інструменти й дозволи', 'Hulpmiddelen en rechten')}</strong>
        <p>{tr('Це той самий список, що бачить Claude. Для кожного інструмента оберіть: «Завжди» (без додаткового запиту від сайту), «Питати» (кожен виклик чекає вашого «Дозволити» тут) або «Вимк.» (Claude його не бачить, а виклик відхиляється на сервері). Те, що змінює дані чи показує приватне, завжди лишається на «Питати».', 'Dit is dezelfde lijst die Claude ziet. Kies per hulpmiddel: "Altijd" (geen extra vraag van de site), "Vragen" (elke aanroep wacht hier op uw "Toestaan") of "Uit" (Claude ziet het niet en een aanroep wordt op de server geweigerd). Wat gegevens wijzigt of iets privés toont, blijft altijd op "Vragen".')}</p>

        <div className='mcp-setall' data-mcp-setall='true'>
          <span className='mcp-setall-label'>{tr('Усі інструменти', 'Alle hulpmiddelen')} <Tip text={tr('Змінює режим усіх інструментів одразу. «Завжди» не вмикається для тих, що змінюють дані чи показують приватне: вони стають «Питати». «За замовчуванням»: читання «Завжди», зміни «Питати».', 'Wijzigt de modus van alle hulpmiddelen tegelijk. "Altijd" geldt niet voor wat gegevens wijzigt of iets privés toont: dat wordt "Vragen". "Standaard": lezen "Altijd", wijzigen "Vragen".')} /></span>
          <span className='mcp-seg' role='group' aria-label={tr('Усі інструменти', 'Alle hulpmiddelen')}>
            <button type='button' disabled={busy} onClick={() => void setAll('always')}>{tr('Завжди', 'Altijd')}</button>
            <button type='button' disabled={busy} onClick={() => void setAll('ask')}>{tr('Питати', 'Vragen')}</button>
            <button type='button' disabled={busy} onClick={() => void setAll('off')}>{tr('Вимк.', 'Uit')}</button>
            <button type='button' disabled={busy} onClick={() => void setAll('default')}>{tr('За замовч.', 'Standaard')}</button>
          </span>
        </div>

        {GROUPS.map((g) => {
          const rows = tools.filter((t) => t.group === g.id);
          if (!rows.length) return null;
          const active = rows.filter((t) => t.mode !== 'off').length;
          return (
            <div key={g.id} className='mcp-tool-group' data-tool-group={g.id}>
              <b>{tr(g.uk, g.nl)} <span className='agents-badge'>{active}/{rows.length}</span> <small>{tr(g.hint[0], g.hint[1])}</small></b>
              <span className='mcp-group-actions'>
                <button type='button' className='mcp-mini' disabled={busy} onClick={() => void setAll('off', g.id)}>{tr('Вимкнути групу', 'Groep uit')}</button>
                <button type='button' className='mcp-mini' disabled={busy} onClick={() => void setAll('default', g.id)}>{tr('За замовчуванням', 'Standaard')}</button>
              </span>
              <ul>
                {rows.map((x) => (
                  <li key={x.name} className={`mcp-tool-row${x.mode === 'off' ? ' is-off' : ''}`} data-tool={x.name} data-mode={x.mode}>
                    <span className='mcp-tool-text'>
                      <code>{x.name}</code> <b>{x.title}</b>
                      <span className='mcp-tool-desc'>{x.description.split('. ')[0].replace(/\.$/, '')}</span>
                    </span>
                    <ModeSwitch value={x.mode} canAlways={x.canAlways} disabled={busy} tr={tr} label={`${x.title}`} onChange={(m) => void setMode(x, m)} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {notice ? <p role='status'>{notice}</p> : null}
      </article>

      <article className='api-platform-panel' data-mcp-approvals={String(pending.length)}>
        <strong>{tr('Очікують вашого рішення', 'Wachten op uw beslissing')}</strong>
        {pending.length ? (
          <ul className='api-platform-connections mcp-grants'>
            {pending.map((c) => (
              <li key={c.id} className='mcp-grant' data-approval={c.id}>
                <div className='mcp-grant-main'>
                  <div className='agents-row'><b>{titleOf(c.tool)}</b><code>{c.tool}</code></div>
                  <small className='mcp-approval-args'>{JSON.stringify(c.args).slice(0, 240)}</small>
                </div>
                <span className='mcp-approval-actions'>
                  <button type='button' className='mcp-reconnect' disabled={busy} onClick={() => void decide(c, true)}>{tr('Дозволити', 'Toestaan')}</button>
                  <button type='button' className='mcp-cancel' disabled={busy} onClick={() => void decide(c, false)}>{tr('Відхилити', 'Weigeren')}</button>
                </span>
              </li>
            ))}
          </ul>
        ) : <p>{tr('Немає запитів, що чекають. Коли Claude викличе інструмент у режимі «Питати», запит з’явиться тут.', 'Geen verzoeken in de wacht. Roept Claude een hulpmiddel in de modus "Vragen" aan, dan verschijnt het hier.')}</p>}
        {recent.length ? (
          <small className='mcp-approval-recent'>{tr('Останні', 'Recent')}: {recent.map((c) => `${titleOf(c.tool)}: ${statusText(c.status)}`).join(' · ')}</small>
        ) : null}
      </article>
    </section>
  );
}
