import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, Trash2, X } from 'lucide-react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { ago } from './agenten-gegevens';
import { Help, IconButton, Logo, StatusDot } from './mcp-ui';
import { OUD_GEDEELD_URL } from '../shared/connector-v2/agenten';
import './agenten-paneel.css';

type Tr = (uk: string, nl: string) => string;
type Grant = { id: string; clientName: string; scope: string; createdAt: number; lastUsedAt: number | null; expiresAt: number };

const sessionBody = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
// Tijden altijd in de tijdzone van het apparaat (verandert mee tijdens reizen), met de zone erbij vermeld.
// Let op: dateStyle/timeStyle mag niet samen met timeZoneName (gooit een TypeError en geeft een wit scherm), dus losse velden.
const dateFmt = () => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
const when = (value: number | null) => {
  if (!value) return '—';
  try { return dateFmt().format(new Date(value)); } catch { return new Date(value).toLocaleString(); }
};
const zoneName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
const IDLE_MS = 24 * 60 * 60 * 1000;
const CLAUDE_CONNECTORS = 'https://claude.ai/code#customize/connectors';

/** Connector voor Claude (claude.ai > Customize > Connectors): URL en beheer van verleende toegang. Het toestemmingsscherm zelf is McpConsentModal. */
export default function McpConnectorPanel({ tr }: { tr: Tr }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  // Beginwaarde = het oude gedeelde adres; de server stuurt het echte adres mee (per agent) en dat overschrijft dit.
  const [url, setUrl] = useState(OUD_GEDEELD_URL);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [, setTick] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.post('/api/owner/mcp-connector/grants', sessionBody());
    setGrants(res.data?.grants ?? []);
    if (res.data?.url) setUrl(String(res.data.url));
  }, []);

  useEffect(() => { void load().catch(() => undefined); }, [load]);

  // Relatieve tijden verversen.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // De bevestiging staat op de pagina zelf (geen window.confirm: sommige ingebedde browsers onderdrukken die stilletjes).
  const revoke = async (grant: Grant) => {
    setConfirm(null); setBusy(true); setNotice('');
    try { await api.post(`/api/owner/mcp-connector/grants/${grant.id}/revoke`, sessionBody()); await load(); setNotice(tr('Доступ відкликано. Claude побачить це при наступному зверненні.', 'Toegang ingetrokken. Claude merkt dat bij de volgende aanroep.')); } catch { setNotice(tr('Не вдалося відкликати.', 'Intrekken mislukt.')); }
    setBusy(false);
  };

  const copy = async () => { try { await navigator.clipboard?.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* geen klembord */ } };

  // Opnieuw koppelen: oude toegang van Claude intrekken (als die er is), adres kopiëren en de connectorpagina van Claude openen.
  const reconnect = async (confirmed = false) => {
    if (busy) return;
    if (grants.length && !confirmed) { setConfirm('reconnect'); return; }
    setConfirm(null); setBusy(true); setNotice('');
    try {
      for (const g of grants) await api.post(`/api/owner/mcp-connector/grants/${g.id}/revoke`, sessionBody());
      await load();
    } catch { setNotice(tr('Не вдалося відкликати старий доступ. Спробуйте ще раз.', 'Oude toegang intrekken mislukt. Probeer opnieuw.')); setBusy(false); return; }
    await copy();
    window.open(CLAUDE_CONNECTORS, '_blank', 'noopener,noreferrer');
    setNotice(tr('Адресу скопійовано. У Claude натисніть Add custom connector і вставте її, далі «Sign in now».', 'Adres gekopieerd. Klik in Claude op Add custom connector, plak het adres en kies "Sign in now".'));
    setBusy(false);
  };

  const active = grants.some((g) => g.lastUsedAt && Date.now() - g.lastUsedAt <= IDLE_MS);
  const status: 'active' | 'idle' | 'none' = !grants.length ? 'none' : active ? 'active' : 'idle';
  const statusText = {
    active: tr('Claude підключено й працює.', 'Claude is verbonden en actief.'),
    idle: tr('Доступ є, але Claude давно не звертався. Якщо не працює, перепідключіть.', 'Toegang bestaat, maar Claude was lang niet actief. Werkt het niet, koppel dan opnieuw.'),
    none: tr('Claude не підключено (доступ відсутній, відкликаний або закінчився).', 'Claude is niet verbonden (geen, ingetrokken of verlopen toegang).'),
  }[status];

  return (
    <div data-mcp-connector='true' className='hub-connector'>
      <div className={`hub-note${status === 'none' ? ' bad' : status === 'idle' ? ' warn' : ''}`} role='status' data-mcp-status={status}>
        <div className='hub-row start'>
          <Logo kind='claude' size={30} label='Claude' />
          <b>{statusText}</b>
        </div>
      </div>

      <div className='hub-card' data-mcp-connector-url='true'>
        <h3>{tr('Адреса конектора', 'Adres van de connector')}
          <Help tr={tr} content={{ title: tr('Адреса конектора', 'Adres van de connector'), what: tr('Це адреса, яку Claude відкриває, щоб працювати з вашим сайтом. Вставте її в Claude: Customize → Connectors → Add custom connector.', 'Dit is het adres dat Claude opent om met uw site te werken. Plak het in Claude: Customize → Connectors → Add custom connector.'), touches: tr('Лише ваш обліковий запис: Claude бачить тільки те, що ви дозволили нижче.', 'Alleen uw account: Claude ziet alleen wat u hieronder toestaat.'), on: tr('Після «Sign in now» і вашого «Дозволити» Claude отримує доступ.', 'Na "Sign in now" en uw "Toestaan" krijgt Claude toegang.'), off: tr('Без додавання адреси Claude нічого не знає про сайт.', 'Zonder het adres toe te voegen weet Claude niets van de site.') }} />
        </h3>
        <code className='hub-code'>{url}</code>
        <div className='hub-actions'>
          <IconButton icon={copied ? <Check /> : <Copy />} onClick={() => void copy()}>{copied ? tr('Скопійовано', 'Gekopieerd') : tr('Скопіювати адресу', 'Adres kopiëren')}</IconButton>
          {confirm === 'reconnect' ? null : (
            <IconButton tone='primary' icon={<RefreshCw />} disabled={busy} onClick={() => void reconnect()}>
              {status === 'none' ? tr('Підключити Claude', 'Claude koppelen') : tr('Перепідключити Claude', 'Claude opnieuw koppelen')}
            </IconButton>
          )}
        </div>
        {confirm === 'reconnect' ? (
          <div className='hub-confirm' role='alertdialog' aria-label={tr('Підтвердження перепідключення', 'Bevestig opnieuw koppelen')}>
            <span>{tr('Старий доступ Claude буде відкликано, адресу скопійовано, і відкриється Claude.', 'De oude toegang van Claude wordt ingetrokken, het adres gekopieerd en Claude geopend.')}</span>
            <IconButton tone='primary' icon={<RefreshCw />} disabled={busy} onClick={() => void reconnect(true)}>{tr('Продовжити', 'Doorgaan')}</IconButton>
            <IconButton icon={<X />} onClick={() => setConfirm(null)}>{tr('Скасувати', 'Annuleren')}</IconButton>
          </div>
        ) : null}
        <ol className='hub-steps'>
          <li>{tr('У Claude вставте адресу й натисніть Add.', 'Plak het adres in Claude en klik op Add.')}</li>
          <li>{tr('Claude відкриє цей сайт: увійдіть, у вікні запиту натисніть «Дозволити».', 'Claude opent deze site: meld u aan en klik in het venster op "Toestaan".')}</li>
          <li>{tr('У чаті ввімкніть конектор (+ → Connectors) і попросіть, наприклад: «покажи мої пристрої».', 'Zet de connector aan in een chat (+ → Connectors) en vraag bijvoorbeeld: "toon mijn apparaten".')}</li>
        </ol>
      </div>

      <div className='hub-card' data-mcp-grants={String(grants.length)}>
        <h3>{tr('Надані доступи', 'Verleende toegang')}
          <Help tr={tr} content={{ title: tr('Надані доступи', 'Verleende toegang'), what: tr('Кожен рядок — це одне підключення Claude до вашого облікового запису.', 'Elke regel is één verbinding van Claude met uw account.'), touches: tr('Відкликання діє лише на це підключення, не на інші доступи.', 'Intrekken geldt alleen voor deze verbinding, niet voor andere toegang.'), off: tr('Після відкликання Claude одразу втрачає доступ і має підключитися знову.', 'Na intrekken verliest Claude meteen de toegang en moet opnieuw koppelen.') }} />
        </h3>
        <small data-mcp-timezone='true' className='hub-meta'>{tr('Час показано за часовим поясом вашого пристрою', 'Tijden in de tijdzone van uw apparaat')}: {zoneName() || '—'}</small>
        {grants.length ? (
          <div className='hub-feed mcp-grants'>
            {grants.map((g) => {
              const idle = !g.lastUsedAt || Date.now() - g.lastUsedAt > IDLE_MS;
              return (
                <div key={g.id} className='hub-feed-item mcp-grant'>
                  <Logo kind='claude' size={28} label='Claude' />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className='hub-row start'>
                      <b>{g.clientName}</b>
                      <span className={`hub-pill ${idle ? 'off' : 'ok'}`}><StatusDot state={idle ? 'off' : 'on'} label={idle ? tr('простоює', 'inactief') : tr('активний', 'actief')} />{idle ? tr('простоює', 'inactief') : tr('активний', 'actief')}</span>
                    </div>
                    <p className='mcp-grant-last' title={when(g.lastUsedAt)} style={{ margin: 0 }}>{tr('Востаннє підключався', 'Laatst verbonden')}: <b>{ago(g.lastUsedAt, tr)}</b></p>
                    <small className='hub-meta'>{tr('надано', 'verleend')}: {when(g.createdAt)} · {tr('діє до', 'geldig tot')}: {when(g.expiresAt)}</small>
                    {confirm === g.id ? (
                      <div className='hub-confirm' role='alertdialog' aria-label={tr('Підтвердження відкликання', 'Bevestig intrekken')} style={{ marginTop: 8 }}>
                        <span>{tr('Claude більше не зможе користуватися вашими пристроями. Відкликати?', 'Claude kan uw apparaten dan niet meer gebruiken. Intrekken?')}</span>
                        <IconButton tone='danger' icon={<Trash2 />} disabled={busy} onClick={() => void revoke(g)}>{tr('Так, відкликати', 'Ja, intrekken')}</IconButton>
                        <IconButton icon={<X />} onClick={() => setConfirm(null)}>{tr('Скасувати', 'Annuleren')}</IconButton>
                      </div>
                    ) : (
                      <div className='hub-actions' style={{ marginTop: 8 }}>
                        <IconButton tone='danger' icon={<Trash2 />} disabled={busy} onClick={() => setConfirm(g.id)}>{tr('Відкликати', 'Intrekken')}</IconButton>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <div className='hub-empty'><Logo kind='claude' size={34} /><span>{tr('Claude ще не має доступу.', 'Claude heeft nog geen toegang.')}</span></div>}
        {notice ? <p role='status' className='hub-note'>{notice}</p> : null}
      </div>
    </div>
  );
}
