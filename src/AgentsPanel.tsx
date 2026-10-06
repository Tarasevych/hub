import { useCallback, useEffect, useState } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import './api-platform-view.css';
import './agents-panel.css';

type Tr = (uk: string, nl: string) => string;
type Agent = {
  id: string; name: string; platform: string | null; status: 'connected' | 'disconnected';
  lastSeenAt: number | null; createdAt: number; policy: { autoApprove: string[] };
};
type Pending = { id: string; agentId: string; agentName: string; type: string; params: unknown; createdAt: number };
type Pairing = { code: string; expiresAt: number };

const POLL_MS = 4000;
const sessionBody = (service: string) => ({ service, tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const when = (value: number | null) => (value ? new Date(value).toLocaleString() : '—');
const preview = (value: unknown) => JSON.stringify(value, null, 2).slice(0, 1200);

/** Local Machine Connector: eigen apparaten koppelen, status volgen en schrijf-/uitvoeracties goedkeuren. */
export default function AgentsPanel({ tr, service = 'mcp' }: { tr: Tr; service?: 'mcp' | 'api' }) {
  const body = () => sessionBody(service);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const res = await api.post('/api/owner/agents/list', body());
    setAgents(res.data?.agents ?? []);
    setPending(res.data?.pending ?? []);
  }, []);

  // Status in (bijna) realtime: pollen zolang het tabblad zichtbaar is.
  useEffect(() => {
    let active = true;
    const tick = () => { if (active && !document.hidden) void load().catch(() => undefined); };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [load]);

  const run = async (action: () => Promise<void>, failure: string) => {
    if (busy) return;
    setBusy(true); setNotice('');
    try { await action(); await load(); } catch { setNotice(failure); }
    setBusy(false);
  };

  const createCode = () => run(async () => {
    const res = await api.post('/api/owner/agents/pairing-code', body());
    setPairing({ code: String(res.data.code), expiresAt: Number(res.data.expiresAt) });
  }, tr('Не вдалося створити код (ліміт: 5 за 10 хвилин).', 'Code aanmaken mislukt (limiet: 5 per 10 minuten).'));

  const revoke = (agent: Agent) => {
    if (!window.confirm(tr(`Відключити «${agent.name}»? Токен буде знецінено.`, `«${agent.name}» ontkoppelen? Het token wordt ongeldig.`))) return;
    void run(async () => { await api.post(`/api/owner/agents/${agent.id}/revoke`, body()); },
      tr('Не вдалося відкликати.', 'Intrekken mislukt.'));
  };

  const decide = (id: string, verdict: 'approve' | 'reject') => run(async () => {
    await api.post(`/api/owner/agents/commands/${id}/${verdict}`, body());
  }, tr('Дія вже недійсна.', 'Deze actie is niet meer geldig.'));

  const command = pairing
    ? `node agent.mjs pair --server ${location.origin} --code ${pairing.code} --name "${tr('Мій ПК', 'Mijn pc')}" --root <${tr('ДОЗВОЛЕНА_ПАПКА', 'TOEGESTANE_MAP')}> --allow git,node\nnode agent.mjs run`
    : '';

  return (
    <section className='api-platform agents-wrap'>
    <article className='api-platform-panel agents-panel' data-agents-panel='true'>
      <strong>{tr('Мої пристрої (Local Machine Connector)', 'Mijn apparaten (Local Machine Connector)')}</strong>
      {notice ? <p role='status'>{notice}</p> : null}

      {agents.length ? (
        <ul className='api-platform-connections'>
          {agents.map((agent) => (
            <li key={agent.id} data-agent-status={agent.status}>
              <div className='agents-row'>
                <b>{agent.name}</b>
                <span className={`agents-badge agents-${agent.status}`}>
                  {agent.status === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <small>{[agent.platform, tr('остання активність', 'laatst gezien'), when(agent.lastSeenAt)].filter(Boolean).join(' · ')}</small>
              <button type='button' disabled={busy} onClick={() => revoke(agent)}>{tr('Відкликати', 'Intrekken')}</button>
            </li>
          ))}
        </ul>
      ) : <p>{tr('Пристроїв ще немає.', 'Nog geen apparaten.')}</p>}

      <button type='button' disabled={busy} onClick={() => void createCode()}>
        {tr('+ Підключити ПК / віртуальну машину', '+ Pc of virtuele machine koppelen')}
      </button>

      {pairing ? (
        <div className='api-platform-secret' data-agents-pairing='true'>
          <span>{tr('Код дійсний 10 хвилин і спрацьовує один раз. Node.js 22+ та agent.mjs мають бути на машині.', 'De code is 10 minuten geldig en werkt één keer. Node.js 22+ en agent.mjs moeten op de machine staan.')}</span>
          <code>{command}</code>
          <div className='api-platform-secret-actions'>
            <button type='button' onClick={() => void navigator.clipboard?.writeText(command)}>{tr('Скопіювати', 'Kopiëren')}</button>
            <button type='button' onClick={() => setPairing(null)}>{tr('Закрити', 'Sluiten')}</button>
          </div>
        </div>
      ) : null}

      <strong>{tr('Очікують вашого підтвердження', 'Wachten op uw goedkeuring')}</strong>
      {pending.length ? (
        <ul className='api-platform-connections' data-agents-pending={String(pending.length)}>
          {pending.map((item) => (
            <li key={item.id}>
              <b>{item.agentName}: {item.type}</b>
              <pre className='agents-params'>{preview(item.params)}</pre>
              <div className='api-platform-secret-actions'>
                <button type='button' disabled={busy} onClick={() => void decide(item.id, 'approve')}>{tr('Дозволити', 'Toestaan')}</button>
                <button type='button' disabled={busy} onClick={() => void decide(item.id, 'reject')}>{tr('Відхилити', 'Weigeren')}</button>
              </div>
            </li>
          ))}
        </ul>
      ) : <p>{tr('Немає дій, що чекають підтвердження.', 'Geen acties die op goedkeuring wachten.')}</p>}
    </article>
    </section>
  );
}
