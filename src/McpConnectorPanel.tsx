import { useCallback, useEffect, useState } from 'react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import './api-platform-view.css';
import './agents-panel.css';

type Tr = (uk: string, nl: string) => string;
type Grant = { id: string; clientName: string; scope: string; createdAt: number; lastUsedAt: number | null; expiresAt: number };
type Consent = { clientName: string; redirectHost: string; loopback: boolean; scope: string; expiresAt: number };

const sessionBody = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const when = (value: number | null) => (value ? new Date(value).toLocaleString() : '—');
const consentId = () => new URLSearchParams(location.search).get('consent') || '';

/** Connector voor Claude (claude.ai > Customize > Connectors): URL, toestemmingsscherm en beheer van verleende toegang. */
export default function McpConnectorPanel({ tr }: { tr: Tr }) {
  const rid = consentId();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [url, setUrl] = useState('https://mcp.tarasevych.com/mcp');
  const [consent, setConsent] = useState<Consent | null>(null);
  const [consentGone, setConsentGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await api.post('/api/owner/mcp-connector/grants', sessionBody());
    setGrants(res.data?.grants ?? []);
    if (res.data?.url) setUrl(String(res.data.url));
  }, []);

  useEffect(() => { void load().catch(() => undefined); }, [load]);

  useEffect(() => {
    if (!rid) return;
    api.post('/api/owner/mcp-connector/consent/info', { ...sessionBody(), rid })
      .then((res) => setConsent(res.data as Consent))
      .catch(() => setConsentGone(true));
  }, [rid]);

  const decide = async (approve: boolean) => {
    if (busy) return;
    setBusy(true); setNotice('');
    try {
      const res = await api.post('/api/owner/mcp-connector/consent', { ...sessionBody(), rid, approve });
      // Terug naar Claude (of naar de loopback van Claude Code) met de eenmalige code.
      location.assign(String(res.data.redirect));
      return;
    } catch (e) {
      const code = String((e as Error)?.message || '');
      setNotice(code.includes('GRANT_LIMIT') ? tr('Ліміт доступів (10). Відкличте непотрібні нижче.', 'Limiet bereikt (10). Trek hieronder oude toegang in.')
        : tr('Запит застарів. Почніть підключення в Claude знову.', 'Het verzoek is verlopen. Begin de koppeling in Claude opnieuw.'));
    }
    setBusy(false);
  };

  const revoke = async (grant: Grant) => {
    if (!window.confirm(tr(`Відкликати доступ «${grant.clientName}»? Claude більше не зможе користуватися вашими пристроями.`, `Toegang van «${grant.clientName}» intrekken? Claude kan uw apparaten dan niet meer gebruiken.`))) return;
    setBusy(true);
    try { await api.post(`/api/owner/mcp-connector/grants/${grant.id}/revoke`, sessionBody()); await load(); } catch { setNotice(tr('Не вдалося відкликати.', 'Intrekken mislukt.')); }
    setBusy(false);
  };

  const copy = async () => { try { await navigator.clipboard?.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* geen klembord */ } };

  return (
    <section className='api-platform agents-wrap' data-mcp-connector='true'>
      {rid ? (
        <article className='api-platform-panel mcp-consent' data-mcp-consent='true'>
          <strong>{tr('Claude просить доступ', 'Claude vraagt toegang')}</strong>
          {consent ? (
            <>
              <p>
                {tr('Застосунок', 'Applicatie')}: <b>{consent.clientName}</b> · {tr('повернення на', 'terugkeer naar')}: <b>{consent.redirectHost}</b>
              </p>
              <p>{tr('Claude зможе (за вашими підтвердженнями на сайті):', 'Claude kan (met uw goedkeuring op de site):')}</p>
              <ul>
                <li>{tr('бачити ваші пристрої та їхній стан', 'uw apparaten en hun status zien')}</li>
                <li>{tr('читати файли у дозволених папках агента', 'bestanden lezen in de toegestane mappen van de agent')}</li>
                <li>{tr('записувати файли та виконувати команди лише після вашого «Дозволити»', 'bestanden schrijven en commando\'s uitvoeren, alleen na uw "Toestaan"')}</li>
              </ul>
              {consent.loopback ? (
                <p role='alert'>{tr('Це локальний клієнт (Claude Code на вашому комп’ютері). Дозволяйте, лише якщо ви самі його запустили.', 'Dit is een lokale client (Claude Code op uw computer). Sta alleen toe als u hem zelf hebt gestart.')}</p>
              ) : null}
              <div className='api-platform-secret-actions'>
                <button type='button' disabled={busy} onClick={() => void decide(true)}>{tr('Дозволити', 'Toestaan')}</button>
                <button type='button' disabled={busy} onClick={() => void decide(false)}>{tr('Відхилити', 'Weigeren')}</button>
              </div>
            </>
          ) : consentGone ? <p>{tr('Запит застарів або недійсний. Почніть підключення в Claude знову.', 'Dit verzoek is verlopen of ongeldig. Begin de koppeling in Claude opnieuw.')}</p>
            : <p>{tr('Завантаження…', 'Laden…')}</p>}
          {notice ? <p role='status'>{notice}</p> : null}
        </article>
      ) : null}

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
          <li>{tr('Claude відкриє цей сайт: увійдіть і натисніть «Дозволити».', 'Claude opent deze site: meld u aan en klik op "Toestaan".')}</li>
          <li>{tr('У чаті ввімкніть конектор (+ → Connectors) і попросіть, наприклад: «покажи мої пристрої».', 'Zet de connector aan in een chat (+ → Connectors) en vraag bijvoorbeeld: "toon mijn apparaten".')}</li>
        </ol>
      </article>

      <article className='api-platform-panel' data-mcp-grants={String(grants.length)}>
        <strong>{tr('Надані доступи', 'Verleende toegang')}</strong>
        {grants.length ? (
          <ul className='api-platform-connections'>
            {grants.map((g) => (
              <li key={g.id}>
                <div className='agents-row'><b>{g.clientName}</b><span className='agents-badge agents-connected'>{g.scope}</span></div>
                <small>{tr('надано', 'verleend')}: {when(g.createdAt)} · {tr('востаннє', 'laatst gebruikt')}: {when(g.lastUsedAt)} · {tr('діє до', 'geldig tot')}: {when(g.expiresAt)}</small>
                <button type='button' disabled={busy} onClick={() => void revoke(g)}>{tr('Відкликати', 'Intrekken')}</button>
              </li>
            ))}
          </ul>
        ) : <p>{tr('Claude ще не має доступу.', 'Claude heeft nog geen toegang.')}</p>}
        {!rid && notice ? <p role='status'>{notice}</p> : null}
      </article>
    </section>
  );
}
