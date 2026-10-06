import { useCallback, useEffect, useState } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import './api-platform-view.css';
import './agents-panel.css';

type Tr = (uk: string, nl: string) => string;
type Grant = { id: string; clientName: string; scope: string; createdAt: number; lastUsedAt: number | null; expiresAt: number };

const sessionBody = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const when = (value: number | null) => (value ? new Date(value).toLocaleString() : '—');
const IDLE_MS = 24 * 60 * 60 * 1000;

/** "5 хв тому" / "5 min geleden"; nooit gebruikt: "nog niet gebruikt". */
const ago = (value: number | null, tr: Tr): string => {
  if (!value) return tr('ще не використовувався', 'nog niet gebruikt');
  const s = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (s < 60) return tr('щойно', 'zojuist');
  const m = Math.round(s / 60);
  if (m < 60) return tr(`${m} хв тому`, `${m} min geleden`);
  const h = Math.round(m / 60);
  if (h < 48) return tr(`${h} год тому`, `${h} uur geleden`);
  const d = Math.round(h / 24);
  return tr(`${d} дн. тому`, `${d} dagen geleden`);
};

/** Connector voor Claude (claude.ai > Customize > Connectors): URL en beheer van verleende toegang. Het toestemmingsscherm zelf is McpConsentModal. */
export default function McpConnectorPanel({ tr }: { tr: Tr }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [url, setUrl] = useState('https://mcp.tarasevych.com/mcp');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const res = await api.post('/api/owner/mcp-connector/grants', sessionBody());
    setGrants(res.data?.grants ?? []);
    if (res.data?.url) setUrl(String(res.data.url));
  }, []);

  useEffect(() => { void load().catch(() => undefined); }, [load]);

  // Relatieve tijden minuutwaarden verversen en na een nieuwe goedkeuring de lijst herladen.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const revoke = async (grant: Grant) => {
    if (!window.confirm(tr(`Відкликати доступ «${grant.clientName}»? Claude більше не зможе користуватися вашими пристроями.`, `Toegang van «${grant.clientName}» intrekken? Claude kan uw apparaten dan niet meer gebruiken.`))) return;
    setBusy(true); setNotice('');
    try { await api.post(`/api/owner/mcp-connector/grants/${grant.id}/revoke`, sessionBody()); await load(); } catch { setNotice(tr('Не вдалося відкликати.', 'Intrekken mislukt.')); }
    setBusy(false);
  };

  const copy = async () => { try { await navigator.clipboard?.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* geen klembord */ } };

  return (
    <section className='api-platform agents-wrap' data-mcp-connector='true'>
      <article className='api-platform-panel' data-mcp-connector-url='true'>
        <strong>{tr('Конектор для Claude', 'Connector voor Claude')}</strong>
        <p>{tr('Додайте цю адресу в Claude: Customize → Connectors → Add custom connector. Автентифікація: «Sign in now» (OAuth), без заголовків і ключів.', 'Voeg dit adres toe in Claude: Customize → Connectors → Add custom connector. Authenticatie: "Sign in now" (OAuth), zonder headers of sleutels.')}</p>
        <div className='api-platform-secret'>
          <code>{url}</code>
          <div className='api-platform-secret-actions'>
            <button type='button' onClick={() => void copy()}>{copied ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати адресу', 'Adres kopiëren')}</button>
          </div>
        </div>
        <ol>
          <li>{tr('У Claude вставте адресу й натисніть Add.', 'Plak het adres in Claude en klik op Add.')}</li>
          <li>{tr('Claude відкриє цей сайт: увійдіть, у вікні запиту натисніть «Дозволити».', 'Claude opent deze site: meld u aan en klik in het venster op "Toestaan".')}</li>
          <li>{tr('У чаті ввімкніть конектор (+ → Connectors) і попросіть, наприклад: «покажи мої пристрої».', 'Zet de connector aan in een chat (+ → Connectors) en vraag bijvoorbeeld: "toon mijn apparaten".')}</li>
        </ol>
      </article>

      <article className='api-platform-panel' data-mcp-grants={String(grants.length)}>
        <strong>{tr('Надані доступи', 'Verleende toegang')}</strong>
        {grants.length ? (
          <ul className='api-platform-connections mcp-grants'>
            {grants.map((g) => {
              const idle = !g.lastUsedAt || Date.now() - g.lastUsedAt > IDLE_MS;
              return (
                <li key={g.id} className='mcp-grant'>
                  <div className='mcp-grant-main'>
                    <div className='agents-row'>
                      <b>{g.clientName}</b>
                      <span className={`agents-badge ${idle ? 'agents-idle' : 'agents-connected'}`}>{idle ? tr('простоює', 'inactief') : tr('активний', 'actief')}</span>
                      <span className='agents-badge'>{g.scope}</span>
                    </div>
                    <p className='mcp-grant-last' title={when(g.lastUsedAt)}>
                      {tr('Востаннє підключався', 'Laatst verbonden')}: <b>{ago(g.lastUsedAt, tr)}</b>
                    </p>
                    <small>{tr('надано', 'verleend')}: {when(g.createdAt)} · {tr('діє до', 'geldig tot')}: {when(g.expiresAt)}</small>
                  </div>
                  <button type='button' className='mcp-revoke' disabled={busy} onClick={() => void revoke(g)}>{tr('Відкликати', 'Intrekken')}</button>
                </li>
              );
            })}
          </ul>
        ) : <p>{tr('Claude ще не має доступу.', 'Claude heeft nog geen toegang.')}</p>}
        {notice ? <p role='status'>{notice}</p> : null}
      </article>
    </section>
  );
}
