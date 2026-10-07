import { useCallback, useEffect, useState } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import './api-platform-view.css';
import './agents-panel.css';

type Tr = (uk: string, nl: string) => string;
type Mode = 'always' | 'ask' | 'off';
type Group = 'devices' | 'browser' | 'mail' | 'calendar' | 'drive' | 'site' | 'github';
type Tool = {
  name: string; title: string; description: string; kind: string; group: Group; mode: Mode; defaultMode: Mode;
  risky: boolean; needsApproval: boolean; readOnly: boolean; destructive: boolean; enabled: boolean;
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

/** Waarschuwing per riskant hulpmiddel: waarom aan- of uitzetten gevaarlijk kan zijn en waartoe het kan leiden. */
const RISK: Record<string, [string, string]> = {
  machine_write_file: ['Дозволяє Claude створювати й перезаписувати файли у дозволених папках вашого ПК. Помилка або підміна інструкцій у чужому тексті може затерти важливі дані чи підкинути шкідливий файл. Вимкнено за замовчуванням.', 'Laat Claude bestanden aanmaken en overschrijven in de toegestane mappen van uw pc. Een fout of een ingeslopen instructie in vreemde tekst kan belangrijke gegevens wissen of een schadelijk bestand plaatsen. Standaard uit.'],
  machine_exec: ['Дозволяє виконувати команди зі списку агента на вашому ПК. Навіть дозволена команда може змінити систему чи видалити дані. Вимкнено за замовчуванням.', 'Voert commando\'s uit de lijst van de agent uit op uw pc. Ook een toegestaan commando kan het systeem wijzigen of gegevens wissen. Standaard uit.'],
  docker_manage_container: ['Дозволяє запускати, зупиняти й перезапускати контейнери. Зупинка потрібного контейнера зупиняє сервіси та може призвести до простою. Вимкнено за замовчуванням.', 'Start, stopt en herstart containers. Een verkeerde container stoppen legt diensten stil en kan tot downtime leiden. Standaard uit.'],
  browser_invoke_action: ['Виконує дії сайту (відкрити сервіс тощо) від вашого імені у вашому сеансі. Вимкнено за замовчуванням.', 'Voert acties van de site uit in uw sessie, namens u. Standaard uit.'],
  browser_click: ['Клікає елементи на сторінці у вашому сеансі: може підтвердити, надіслати чи видалити щось від вашого імені. Вимкнено за замовчуванням.', 'Klikt op elementen in uw sessie: kan namens u iets bevestigen, versturen of verwijderen. Standaard uit.'],
  browser_type: ['Вводить текст у поля сторінки: може надіслати чи змінити дані від вашого імені. Не для паролів і платіжних полів. Вимкнено за замовчуванням.', 'Typt tekst in velden: kan namens u gegevens versturen of wijzigen. Niet voor wachtwoord- of betaalvelden. Standaard uit.'],
  browser_select_option: ['Змінює вибір у списках на сторінці: може змінити налаштування чи дані від вашого імені. Вимкнено за замовчуванням.', 'Wijzigt keuzes in lijsten: kan instellingen of gegevens namens u wijzigen. Standaard uit.'],
  browser_press_key: ['Надсилає натискання клавіш (Enter, Tab…) на сторінці: Enter може відправити форму. Вимкнено за замовчуванням.', 'Stuurt toetsaanslagen (Enter, Tab…): Enter kan een formulier versturen. Standaard uit.'],
  browser_screenshot: ['Робить знімок видимої вкладки: на ньому можуть бути приватні дані (пошта, платежі), які побачить Claude. Вимкнено за замовчуванням.', 'Maakt een schermafbeelding van het zichtbare tabblad: privégegevens (mail, betalingen) worden voor Claude zichtbaar. Standaard uit.'],
  browser_get_deep_diagnostics: ['Глибока діагностика через chrome.debugger: читає мережеві запити й консоль сторінки, де можуть бути токени чи приватні дані. Вимкнено за замовчуванням.', 'Diepe diagnose via chrome.debugger: leest netwerkverkeer en console van de pagina, waar tokens of privégegevens in kunnen staan. Standaard uit.'],
};

/** Drie knoppen: Завжди / Питати / Вимк. Voor riskante hulpmiddelen is "Altijd" mogelijk maar vraagt eerst een bevestiging op de pagina. */
function ModeSwitch({ value, disabled, onChange, label, tr }: { value: Mode; disabled: boolean; onChange: (m: Mode) => void; label: string; tr: Tr }) {
  const items: Array<{ mode: Mode; text: string; help: string }> = [
    { mode: 'always', text: tr('Завжди', 'Altijd'), help: tr('Завжди: Claude викликає без додаткового запиту від сайту. Для пристроїв і браузера діють ще й їхні власні правила (папки, список команд).', 'Altijd: Claude roept het aan zonder extra vraag van de site. Voor apparaten en browsers gelden ook hun eigen grenzen (mappen, lijst met commando\'s).') },
    { mode: 'ask', text: tr('Питати', 'Vragen'), help: tr('Питати: кожен виклик чекає вашого «Дозволити» на цій сторінці.', 'Vragen: elke aanroep wacht op uw "Toestaan" op deze pagina.') },
    { mode: 'off', text: tr('Вимк.', 'Uit'), help: tr('Вимкнено: Claude цього інструмента не бачить і викликати не може.', 'Uit: Claude ziet dit hulpmiddel niet en kan het niet aanroepen.') },
  ];
  return (
    <span className='mcp-seg' role='radiogroup' aria-label={label}>
      {items.map((it) => (
        <button key={it.mode} type='button' role='radio' aria-checked={value === it.mode} data-mode={it.mode} title={it.help}
          disabled={disabled} onClick={() => value !== it.mode && onChange(it.mode)}>
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

  const [riskAsk, setRiskAsk] = useState<string | null>(null);
  // Riskant hulpmiddel op "Altijd": eerst een bevestiging op de pagina (geen window.confirm: ingebedde browsers onderdrukken die).
  const chooseMode = (tool: Tool, mode: Mode) => {
    if (tool.risky && mode === 'always') { setRiskAsk(tool.name); return; }
    setRiskAsk(null); void setMode(tool, mode);
  };
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
        <p>{tr('Це той самий список, що бачить Claude. Для кожного інструмента оберіть: «Завжди» (без додаткового запиту від сайту), «Питати» (кожен виклик чекає вашого «Дозволити» тут) або «Вимк.» (Claude його не бачить, а виклик відхиляється на сервері). Інструменти, що змінюють дані чи показують приватне, позначені знаком «!» (наведіть, щоб побачити ризики): за замовчуванням вони вимкнені, але ви можете ввімкнути їх, коли це потрібно для задачі.', 'Dit is dezelfde lijst die Claude ziet. Kies per hulpmiddel: "Altijd" (geen extra vraag van de site), "Vragen" (elke aanroep wacht hier op uw "Toestaan") of "Uit" (Claude ziet het niet en een aanroep wordt op de server geweigerd). Hulpmiddelen die gegevens wijzigen of iets privés tonen hebben een "!" (beweeg erover voor de risico\'s): ze staan standaard uit, maar u kunt ze aanzetten wanneer een taak dat vraagt.')}</p>

        <div className='mcp-setall' data-mcp-setall='true'>
          <span className='mcp-setall-label'>{tr('Усі інструменти', 'Alle hulpmiddelen')} <Tip text={tr('Змінює режим усіх інструментів одразу. «Завжди» і «Питати» не чіпають інструменти зі знаком «!» (їх вмикають окремо). «За замовчуванням»: читання «Завжди», запис на сайті «Питати», небезпечні вимкнено.', 'Wijzigt de modus van alle hulpmiddelen tegelijk. "Altijd" en "Vragen" laten hulpmiddelen met "!" ongemoeid (die zet u apart aan). "Standaard": lezen "Altijd", schrijven op de site "Vragen", riskante uit.')} /></span>
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
                      {x.risky && RISK[x.name] ? <span className='mcp-warn' tabIndex={0} aria-label={tr(RISK[x.name][0], RISK[x.name][1])} data-risky='true'>!<span className='mcp-tip' role='tooltip'>{tr(RISK[x.name][0], RISK[x.name][1])}</span></span> : null}
                      <span className='mcp-tool-desc'>{x.description.split('. ')[0].replace(/\.$/, '')}</span>
                      {riskAsk === x.name ? (
                        <span className='mcp-confirm' role='alertdialog' aria-label={tr('Підтвердження', 'Bevestiging')}>
                          <span>{tr(RISK[x.name]?.[0] ?? '', RISK[x.name]?.[1] ?? '')} {tr('Увімкнути «Завжди» (без запиту на кожен виклик)?', 'Op "Altijd" zetten (zonder vraag per aanroep)?')}</span>
                          <button type='button' className='mcp-revoke' disabled={busy} onClick={() => { setRiskAsk(null); void setMode(x, 'always'); }}>{tr('Так, завжди', 'Ja, altijd')}</button>
                          <button type='button' className='mcp-cancel' onClick={() => setRiskAsk(null)}>{tr('Скасувати', 'Annuleren')}</button>
                        </span>
                      ) : null}
                    </span>
                    <ModeSwitch value={x.mode} disabled={busy} tr={tr} label={`${x.title}`} onChange={(m) => chooseMode(x, m)} />
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
