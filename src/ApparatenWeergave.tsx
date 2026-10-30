import { useState } from 'react';
import { Check, Clock, PlugZap, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { api } from './platform/client';
import { agentLogo, Help, IconButton, Logo, Section, StatusDot, type Tr } from './mcp-ui';
import { ago, commandLabel, sessionBody, statusLabel, type Agent, type LastCommand, type Pending } from './agenten-gegevens';
import { foutTekst } from './agenten/fouten';

/** Welke opdrachten van een pc zonder klik mogen (de rest wacht altijd op uw "Toestaan"). */
const MACHINE_AUTO: Array<{ type: string; uk: [string, string]; nl: [string, string]; help: { what: [string, string]; on: [string, string]; off: [string, string] } }> = [
  { type: 'fs.read', uk: ['Читання файлів', 'Bestanden lezen'], nl: ['', ''], help: { what: ['Агент читає текстові файли з дозволених папок.', 'De agent leest tekstbestanden uit toegestane mappen.'], on: ['Claude читає ці файли без кліку; вміст бачить Anthropic.', 'Claude leest deze bestanden zonder klik; de inhoud wordt door Anthropic gezien.'], off: ['Кожне читання чекає вашого «Дозволити».', 'Elke leesactie wacht op uw "Toestaan".'] } },
  { type: 'fs.list', uk: ['Перегляд папок', 'Mappen bekijken'], nl: ['', ''], help: { what: ['Агент показує імена файлів у дозволених папках.', 'De agent toont bestandsnamen in toegestane mappen.'], on: ['Claude бачить структуру папок без кліку.', 'Claude ziet de mapstructuur zonder klik.'], off: ['Кожен перегляд чекає «Дозволити».', 'Elk overzicht wacht op "Toestaan".'] } },
  { type: 'sys.info', uk: ['Інформація про пристрій', 'Apparaatinformatie'], nl: ['', ''], help: { what: ['Система, дозволені папки й команди агента.', 'Systeem, toegestane mappen en commando\'s van de agent.'], on: ['Claude знає межі агента без кліку.', 'Claude kent de grenzen van de agent zonder klik.'], off: ['Кожен запит чекає «Дозволити».', 'Elke aanvraag wacht op "Toestaan".'] } },
  { type: 'sys.metrics', uk: ['Метрики системи', 'Systeemmetrics'], nl: ['', ''], help: { what: ['Навантаження процесора, пам’ять, диски.', 'Processorbelasting, geheugen, schijven.'], on: ['Claude бачить стан ресурсів без кліку.', 'Claude ziet de toestand van resources zonder klik.'], off: ['Кожен запит метрик чекає «Дозволити».', 'Elke metrics-aanvraag wacht op "Toestaan".'] } },
  { type: 'docker.ps', uk: ['Список контейнерів Docker', 'Lijst van Docker-containers'], nl: ['', ''], help: { what: ['Показує контейнери (лише перелік).', 'Toont containers (alleen de lijst).'], on: ['Claude бачить контейнери без кліку.', 'Claude ziet containers zonder klik.'], off: ['Кожен перегляд чекає «Дозволити».', 'Elk overzicht wacht op "Toestaan".'] } },
];

const prettyParams = (value: unknown) => { try { return JSON.stringify(value, null, 2).slice(0, 1200); } catch { return ''; } };

/** Wachtende acties met Toestaan / Weigeren; één lijst voor de hele pagina. */
export function PendingList({ tr, pending, reload, compact = false }: { tr: Tr; pending: Pending[]; reload: () => Promise<void>; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const decide = async (id: string, verdict: 'approve' | 'reject') => {
    setBusy(true); setNotice('');
    try { await api.post(`/api/owner/agents/commands/${id}/${verdict}`, sessionBody()); await reload(); setNotice(verdict === 'approve' ? tr('Дозволено: дію надіслано на пристрій.', 'Toegestaan: de actie is naar het apparaat gestuurd.') : tr('Відхилено: дію не буде виконано.', 'Geweigerd: de actie wordt niet uitgevoerd.')); }
    catch (e) { setNotice(foutTekst(e, tr, ['Дія вже недійсна', 'Deze actie is niet meer geldig'])); await reload().catch(() => undefined); }
    setBusy(false);
  };
  if (!pending.length) return (
    <div className='hub-empty'><ShieldCheck aria-hidden='true' /><span>{tr('Нічого не чекає вашого рішення.', 'Er wacht niets op uw beslissing.')}</span></div>
  );
  return (
    <div className='hub-feed' data-agents-pending={String(pending.length)}>
      {pending.map((item) => (
        <div key={item.id} className='hub-feed-item'>
          <Clock aria-hidden='true' />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className='hub-row start'><b>{commandLabel(item.type, tr)}</b><span className='hub-pill warn'>{item.agentName}</span></div>
            <small>{ago(item.createdAt, tr)}</small>
            {!compact ? <code className='hub-code'>{prettyParams(item.params)}</code> : null}
            <div className='hub-actions' style={{ marginTop: 8 }}>
              <IconButton tone='primary' icon={<Check />} disabled={busy} onClick={() => void decide(item.id, 'approve')}>{tr('Дозволити', 'Toestaan')}</IconButton>
              <IconButton icon={<X />} disabled={busy} onClick={() => void decide(item.id, 'reject')}>{tr('Відхилити', 'Weigeren')}</IconButton>
            </div>
          </div>
        </div>
      ))}
      {notice ? <p role='status' className='hub-note warn'>{notice}</p> : null}
    </div>
  );
}

export { PairCard } from './AgentInrichtingWizard';

/** Eén pc: status, laatste actie, wat zonder klik mag, testen en loskoppelen. */
export function DeviceDetail({ tr, agent, last, reload, compact = false }: { tr: Tr; agent: Agent; last?: LastCommand; reload: () => Promise<void>; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [ok, setOk] = useState('');
  const run = async (action: () => Promise<void>, failure: string, gelukt = '') => {
    setBusy(true); setNotice(''); setOk('');
    try { await action(); await reload(); setOk(gelukt); } catch (e) { setNotice(`${failure} ${foutTekst(e, tr)}`); }
    setBusy(false);
  };
  const auto = agent.policy?.autoApprove ?? [];
  const toggle = (type: string, on: boolean) => run(async () => {
    const next = on ? [...new Set([...auto, type])] : auto.filter((t) => t !== type);
    await api.post(`/api/owner/agents/${agent.id}/policy`, { ...sessionBody(), autoApprove: next });
  }, tr('Не вдалося змінити.', 'Wijzigen mislukt.'), on ? tr('Тепер виконується без кліку.', 'Wordt nu zonder klik uitgevoerd.') : tr('Тепер чекає вашого «Дозволити».', 'Wacht nu op uw "Toestaan".'));
  const probe = (kind: 'verbinding' | 'goedkeuring') => run(async () => {
    const payload = kind === 'verbinding' ? { type: 'sys.info', params: {} } : { type: 'fs.write', params: { path: 'hub-agent-test.txt', content: `test ${new Date().toISOString()}\n` } };
    await api.post(`/api/owner/agents/${agent.id}/command`, { ...sessionBody(), ...payload });
  }, tr('Агент не відповідає (офлайн?).', 'Agent reageert niet (offline?).'), kind === 'verbinding' ? tr('Запит надіслано: результат з’явиться в «Остання дія» та в журналі.', 'Aanvraag verstuurd: het resultaat verschijnt bij "Laatste actie" en in het logboek.') : tr('Тестовий запис чекає вашого рішення — див. «Очікують рішення».', 'De testschrijfactie wacht op uw beslissing — zie "Wachten op beslissing".'));
  const revoke = () => run(async () => { setConfirm(false); await api.post(`/api/owner/agents/${agent.id}/revoke`, sessionBody()); }, tr('Не вдалося відключити.', 'Loskoppelen mislukt.'));
  const online = agent.status === 'connected';
  return (
    <article className={`hub-agent${compact ? ' is-compact' : ''}`} data-agent-status={agent.status} data-device={agent.id}>
      {compact ? null : <div className='hub-agent-head'>
        <Logo kind={agentLogo(agent)} size={40} label={agent.platform || 'pc'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{agent.name}</h2>
          <span className='hub-meta'>{[agent.platform, `${tr('остання активність', 'laatst gezien')}: ${ago(agent.lastSeenAt, tr)}`].filter(Boolean).join(' · ')}</span>
        </div>
        <span className={`hub-pill ${online ? 'ok' : 'off'}`}><StatusDot state={online ? 'on' : 'off'} label={online ? tr('в мережі', 'online') : tr('не в мережі', 'offline')} />{online ? tr('в мережі', 'online') : tr('не в мережі', 'offline')}</span>
      </div>}

      {last ? (
        <div className='hub-note' data-agent-last={last.status}>
          <b>{tr('Остання дія', 'Laatste actie')}:</b> {commandLabel(last.type, tr)} · {statusLabel(last.status, tr)} · {ago(last.createdAt, tr)}
          {last.preview ? <code className='hub-code'>{last.preview}</code> : null}
        </div>
      ) : null}

      <Section id={`dev-${agent.id}-auto`} icon={<PlugZap />} title={tr('Що можна без вашого кліку', 'Wat mag zonder uw klik')} subtitle={tr('Лише безпечне читання. Запис, команди й керування Docker завжди чекають «Дозволити».', 'Alleen veilig lezen. Schrijven, commando\'s en Docker-beheer wachten altijd op "Toestaan".')} defaultOpen={false}>
        <div className='hub-switch-list'>
          {MACHINE_AUTO.map((item) => {
            const on = auto.includes(item.type);
            return (
              <div key={item.type} className='hub-switch' data-policy={item.type}>
                <span className='hub-switch-text'>
                  <b>{tr(item.uk[0], item.uk[1])} <Help tr={tr} content={{ title: tr(item.uk[0], item.uk[1]), what: tr(item.help.what[0], item.help.what[1]), touches: tr(`Лише цей пристрій: «${agent.name}»`, `Alleen dit apparaat: «${agent.name}»`), on: tr(item.help.on[0], item.help.on[1]), off: tr(item.help.off[0], item.help.off[1]) }} /></b>
                  <small>{on ? tr('Виконується без кліку', 'Wordt zonder klik uitgevoerd') : tr('Чекає вашого «Дозволити»', 'Wacht op uw "Toestaan"')}</small>
                </span>
                <button type='button' className='hub-toggle' role='switch' aria-checked={on} aria-label={tr(item.uk[0], item.uk[1])} disabled={busy} onClick={() => void toggle(item.type, !on)} />
              </div>
            );
          })}
        </div>
      </Section>

      <div className='hub-actions'>
        <IconButton icon={<RefreshCw />} disabled={busy || !online} onClick={() => void probe('verbinding')} title={tr('Надсилає безпечний запит «інформація про пристрій»', 'Stuurt een veilige aanvraag "apparaatinformatie"')}>{tr('Перевірити зв’язок', 'Verbinding testen')}</IconButton>
        <IconButton icon={<ShieldCheck />} disabled={busy || !online} onClick={() => void probe('goedkeuring')} title={tr('Створює тестовий запис файлу, що має чекати вашого рішення', 'Maakt een test-schrijfactie die op uw beslissing moet wachten')}>{tr('Тест підтвердження', 'Test goedkeuring')}</IconButton>
        {confirm || compact ? null : <IconButton tone='danger' icon={<Trash2 />} disabled={busy} onClick={() => setConfirm(true)}>{tr('Відключити', 'Loskoppelen')}</IconButton>}
      </div>
      {confirm ? (
        <div className='hub-confirm' role='alertdialog' aria-label={tr('Підтвердження відключення', 'Bevestig loskoppelen')}>
          <span>{tr(`Відключити «${agent.name}»? Його токен стане недійсним, Claude більше не бачитиме цей пристрій.`, `«${agent.name}» loskoppelen? Het token wordt ongeldig en Claude ziet dit apparaat niet meer.`)}</span>
          <IconButton tone='danger' icon={<Trash2 />} disabled={busy} onClick={() => void revoke()}>{tr('Так, відключити', 'Ja, loskoppelen')}</IconButton>
          <IconButton icon={<X />} onClick={() => setConfirm(false)}>{tr('Скасувати', 'Annuleren')}</IconButton>
        </div>
      ) : null}
      {ok ? <p role='status' className='ag-melding ag-melding-ok'>{ok}</p> : null}
      {notice ? <p role='alert' className='ag-melding ag-melding-fout'>{notice}</p> : null}
    </article>
  );
}
