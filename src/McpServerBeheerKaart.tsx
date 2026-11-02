import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Loader2, RefreshCw, Rocket, ServerCog, ShieldCheck, Undo2 } from 'lucide-react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import TerugdraaiMeester from './besluit/TerugdraaiMeester';
import './mcp-backups-kaart.css';

// Methode 3 (gepantserde opdracht): vaste werkwoorden, de server controleert alles opnieuw als root.
// Uitrol-nu vraagt een bevestiging van de aanmelding (client.ts vraagt die zelf bij STEP_UP_REQUIRED).
// Terugdraaien (22.10.2026, zone B, RUNBOOK §15): niet meer via de gepantserde opdracht (die staat standaard UIT in mcp-rechten.json),
// maar als BESLUIT MET PASSKEY: de wizard src/besluit/TerugdraaiMeester.tsx toont van → naar, de browser tekent met de passkey van de
// eigenaar, root controleert de handtekening zelf en voert `mijn-ruimte-installeer terugdraaien <naar>` uit. Geen SSH meer nodig.
type Tr = (uk: string, nl: string) => string;
type Status = { actief?: string; vorige?: string; diensten?: Record<string, string>; laatsteVersie?: string; laatsteTag?: string; uitrol?: { code?: string; uk?: string; nl?: string; tijd?: string } | null; gitops?: { code?: string; uk?: string; nl?: string; tijd?: string } | null };
type Release = { naam: string; commit: string; actief: boolean; vorige: boolean; bruikbaar: boolean };
const ctx = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const when = (v?: string) => (v ? new Date(v).toLocaleString() : '—');

export default function McpServerBeheerCard({ tr }: { tr: Tr }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [terugOpen, setTerugOpen] = useState(false);
  const besluitCtx = useMemo(() => ctx(), []);
  const load = useCallback(async () => {
    setError('');
    try {
      const s = (await api.post('/api/mcp/server/lezen', { ...ctx(), werkwoord: 'status' })).data;
      setStatus((s.resultaat?.gegevens ?? null) as Status | null);
      const r = (await api.post('/api/mcp/server/lezen', { ...ctx(), werkwoord: 'releases' })).data;
      setReleases(((r.resultaat?.gegevens as { releases?: Release[] } | undefined)?.releases ?? []) as Release[]);
    } catch {
      setError(tr('Стан сервера недоступний. Потрібні: власник, правило polkit на сервері і ввімкнені «Стан сервера» та «Список випусків».', 'Serverstatus niet beschikbaar. Nodig: eigenaar, de polkit-regel op de server en "Serverstatus" en "Lijst van releases" aan.'));
    }
  }, [tr]);
  useEffect(() => { void load(); }, [load]);
  const doe = async (pad: string, label: string, body: Record<string, unknown> = {}) => {
    setBusy(label); setError(''); setMsg('');
    try {
      const d = (await api.post(pad, { ...ctx(), ...body })).data as { ok?: boolean; code?: string };
      setMsg(d.ok ? tr('Команду передано серверу. Результат з’явиться в журналі аудиту.', 'Opdracht doorgegeven aan de server. De uitkomst verschijnt in het auditlogboek.') : `${tr('Відмова', 'Geweigerd')}: ${d.code || ''}`);
    } catch (e) {
      const code = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '';
      setError(code.startsWith('PERMISSION_OFF') ? tr('Цю команду вимкнено у файлі /etc/mijn-ruimte/mcp-rechten.json на сервері.', 'Deze opdracht staat uit in /etc/mijn-ruimte/mcp-rechten.json op de server.')
        : code === 'RATE_LIMITED' ? tr('Відкат можливий не частіше ніж раз на 10 хвилин.', 'Terugdraaien kan hooguit één keer per 10 minuten.')
        : tr('Не вдалося виконати команду.', 'De opdracht is niet gelukt.'));
    } finally { setBusy(''); }
  };
  // De wizard (passkey-besluit) vervangt window.confirm + de directe opdracht; na een uitgevoerd besluit de stand opnieuw lezen.
  const terug = () => { setError(''); setMsg(''); setTerugOpen(true); };
  return <section className="mcp-block mbk">
    <header className="mcp-block-head mbk-head">
      <span className="mcp-block-icon" aria-hidden="true"><ServerCog /></span>
      <div className="mcp-block-title"><h2>{tr('Керування сервером', 'Serverbeheer')}</h2></div>
      <div className="mcp-block-actions"><button type="button" className="mcp-btn ghost small mcp-ghost" onClick={() => void load()} aria-label={tr('Оновити', 'Vernieuwen')}><RefreshCw /></button></div>
    </header>
    <div className="mcp-block-body">
    <p>{tr('Лише фіксовані команди. Сервер встановлює тільки випуски, підписані вашим ключем (тег у GitHub або пакет); сайт не може запустити власний код від root.', 'Alleen vaste opdrachten. De server installeert alleen releases die met uw sleutel zijn ondertekend (tag in GitHub of pakket); de site kan geen eigen code als root starten.')}</p>
    {error && <p className="mbk-error" role="alert">{error}</p>}
    {msg && <p className="mcp-live" role="status">{msg}</p>}
    {status ? <ul className="mbk-files">
      <li><ShieldCheck size={14} /><span><b>{tr('Активний випуск', 'Actieve release')}: {status.actief || '—'}</b><small>{tr('попередній', 'vorige')}: {status.vorige || '—'} · {tr('пакет', 'pakket')}: {status.laatsteVersie || '—'} · GitOps: {status.laatsteTag || '—'}</small></span></li>
      {status.gitops && <li><History size={14} /><span><b>GitOps: {tr(status.gitops.uk || '', status.gitops.nl || '')}</b><small>{when(status.gitops.tijd)}</small></span></li>}
      {status.uitrol && <li><History size={14} /><span><b>{tr('Пакет', 'Pakket')}: {tr(status.uitrol.uk || '', status.uitrol.nl || '')}</b><small>{when(status.uitrol.tijd)}</small></span></li>}
      <li><ServerCog size={14} /><span><small>{Object.entries(status.diensten || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}</small></span></li>
    </ul> : !error ? <p className="mbk-busy"><Loader2 size={14} className="mbk-spin" /> {tr('Завантаження…', 'Laden…')}</p> : null}
    {releases && releases.length > 0 && <ul className="mbk-files">{releases.map((r) => <li key={r.naam}><History size={14} /><span><b>{r.naam}</b><small>{r.commit || '—'}{r.actief ? ` · ${tr('активний', 'actief')}` : ''}{r.vorige ? ` · ${tr('попередній', 'vorige')}` : ''}{r.bruikbaar ? '' : ` · ${tr('неповний', 'onvolledig')}`}</small></span></li>)}</ul>}
    <form className="mcp-form">
      <button type="button" className="mcp-btn ghost" disabled={!!busy} onClick={() => void doe('/api/mcp/server/backup', 'backup')}>{busy === 'backup' ? <Loader2 size={14} className="mbk-spin" /> : <ServerCog size={14} />}{tr('Резервна копія зараз', 'Nu een back-up')}</button>
      <button type="button" className="mcp-btn ghost" disabled={!!busy} onClick={() => void doe('/api/mcp/server/uitrol-nu', 'uitrol')}>{busy === 'uitrol' ? <Loader2 size={14} className="mbk-spin" /> : <Rocket size={14} />}{tr('Перевірити підписані випуски', 'Op ondertekende releases controleren')}</button>
      <button type="button" className="mcp-btn ghost" disabled={!!busy} onClick={terug} data-besluit-open="terugdraaien"><Undo2 size={14} />{tr('Відкат до попереднього', 'Terug naar de vorige')}</button>
    </form>
    <p className="mbk-note">{tr('Резервна копія і перевірка випусків вмикаються у файлі /etc/mijn-ruimte/mcp-rechten.json на сервері. Відкат — рішення з підписом вашого passkey: root перевіряє підпис сам (RUNBOOK §15).', 'Back-up en releasecontrole worden aangezet in /etc/mijn-ruimte/mcp-rechten.json op de server. Terugdraaien is een besluit met uw passkey-handtekening: root controleert die zelf (RUNBOOK §15).')}</p>
    <TerugdraaiMeester tr={tr} ctx={besluitCtx} open={terugOpen} onSluit={() => setTerugOpen(false)} onKlaar={() => { void load(); setMsg(tr('Відкат виконано. Стан сервера оновлено.', 'Terugdraaien uitgevoerd. De serverstand is vernieuwd.')); }} />
    </div>
  </section>;
}
