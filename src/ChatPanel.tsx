import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import './chat-panel.css';

type Tr = (uk: string, nl: string) => string;
type Msg = { role: 'user' | 'assistant'; content: string };
type Step = { tool: string; isError: boolean };
type Pending = { id: string; agentName: string; type: string; params: unknown };
type Status = { hasKey: boolean; tools: string[]; machines: { total: number; online: number } };

const sessionBody = () => ({ service: 'ai', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const preview = (value: unknown) => JSON.stringify(value, null, 2).slice(0, 800);

/** Chat met het eigen Claude-sleutel van de gebruiker. Acties op apparaten worden hier goedgekeurd. */
export default function ChatPanel({ tr, status }: { tr: Tr; status: Status }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadPending = useCallback(async () => {
    const res = await api.post('/api/owner/agents/list', sessionBody());
    setPending(res.data?.pending ?? []);
  }, []);

  // Tijdens een verzoek kan een actie op goedkeuring wachten: vaak verversen zolang we bezig zijn.
  useEffect(() => {
    void loadPending().catch(() => undefined);
    const timer = window.setInterval(() => { if (!document.hidden) void loadPending().catch(() => undefined); }, busy ? 1500 : 5000);
    return () => window.clearInterval(timer);
  }, [busy, loadPending]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, busy, pending.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next); setInput(''); setBusy(true); setError(''); setSteps([]);
    try {
      const res = await api.post('/api/owner/agents/chat', { ...sessionBody(), messages: next });
      setMessages([...next, { role: 'assistant', content: String(res.data?.reply ?? '') }]);
      setSteps((res.data?.steps ?? []) as Step[]);
    } catch (e) {
      const code = String((e as Error)?.message || '');
      setError(code.includes('RATE_LIMITED') ? tr('Забагато запитів. Зачекайте хвилину.', 'Te veel verzoeken. Wacht even.')
        : code.includes('NO_API_KEY') ? tr('Ключ Anthropic не знайдено у сховищі.', 'Geen Anthropic-sleutel in de kluis.')
        : code.includes('PROVIDER_ERROR_401') ? tr('Anthropic відхилив ключ. Перевірте його у сховищі.', 'Anthropic weigert de sleutel. Controleer hem in de kluis.')
        : code.includes('PROVIDER_ERROR') ? tr('Помилка постачальника ШІ. Спробуйте ще раз.', 'Fout bij de AI-aanbieder. Probeer opnieuw.')
        : tr('Не вдалося отримати відповідь.', 'Geen antwoord gekregen.'));
    }
    setBusy(false);
    void loadPending().catch(() => undefined);
  };

  const decide = async (id: string, verdict: 'approve' | 'reject') => {
    try { await api.post(`/api/owner/agents/commands/${id}/${verdict}`, sessionBody()); } catch { /* al afgehandeld */ }
    void loadPending().catch(() => undefined);
  };

  return (
    <section className='chat-panel' data-chat-panel='true'>
      <header className='chat-head'>
        <h1>{tr('ШІ Робочий простір', 'AI-werkruimte')}</h1>
        <p className='chat-meta'>
          {tr('Пристроїв онлайн', 'Apparaten online')}: {status.machines.online}/{status.machines.total}
          {' · '}{tr('Інструменти', 'Hulpmiddelen')}: {status.tools.length ? status.tools.join(', ') : tr('немає (підключіть пристрій)', 'geen (koppel een apparaat)')}
        </p>
      </header>

      <div className='chat-log' role='log' aria-live='polite'>
        {messages.length === 0 ? (
          <p className='chat-empty'>{tr('Запитайте, наприклад: «Покажи вміст папки проєкту на моєму ПК».', 'Vraag bijvoorbeeld: "Toon de inhoud van de projectmap op mijn pc".')}</p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-${m.role}`}>
            <b>{m.role === 'user' ? tr('Ви', 'U') : 'Claude'}</b>
            <p>{m.content}</p>
          </div>
        ))}
        {steps.length ? (
          <ul className='chat-steps' aria-label={tr('Виконані кроки', 'Uitgevoerde stappen')}>
            {steps.map((s, i) => <li key={i} className={s.isError ? 'chat-step-err' : 'chat-step-ok'}>{s.tool}</li>)}
          </ul>
        ) : null}
        {busy ? <p className='chat-busy'>{tr('Claude працює…', 'Claude is bezig…')}</p> : null}
        <div ref={endRef} />
      </div>

      {pending.length ? (
        <div className='chat-approvals' data-chat-approvals={String(pending.length)}>
          <b>{tr('Потрібне ваше підтвердження', 'Uw goedkeuring is nodig')}</b>
          {pending.map((item) => (
            <div key={item.id} className='chat-approval'>
              <span>{item.agentName}: <code>{item.type}</code></span>
              <pre>{preview(item.params)}</pre>
              <div className='chat-approval-actions'>
                <button type='button' onClick={() => void decide(item.id, 'approve')}>{tr('Дозволити', 'Toestaan')}</button>
                <button type='button' className='chat-secondary' onClick={() => void decide(item.id, 'reject')}>{tr('Відхилити', 'Weigeren')}</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className='chat-error' role='alert'>{error}</p> : null}

      <form className='chat-form' onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea
          value={input} rows={2} disabled={busy} data-concept='ai-chat'
          placeholder={tr('Повідомлення…', 'Bericht…')}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}
        />
        <button type='submit' disabled={busy || !input.trim()}>{tr('Надіслати', 'Verstuur')}</button>
      </form>
    </section>
  );
}
