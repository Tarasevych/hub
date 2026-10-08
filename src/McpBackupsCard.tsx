import { useCallback, useEffect, useState } from 'react';
import { Database, Download, FileArchive, Loader2, RefreshCw, ServerCog, ShieldCheck } from 'lucide-react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import './mcp-backups-card.css';

type Tr = (uk: string, nl: string) => string;
type Row = { stamp: string; at: string; ready: boolean; release: string; encrypted: boolean; migrations: number; files: { name: string; bytes: number }[]; hasSystem: boolean; totalBytes: number };
const ctx = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const size = (n: number) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const stampDate = (s: string) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}`);
const KIND: Record<string, { uk: string; nl: string; hint: [string, string] }> = {
  'database.dump.age': { uk: 'База даних', nl: 'Database', hint: ['усі таблиці сайту (pg_dump)', 'alle tabellen van de site (pg_dump)'] },
  'uploads.tar.gz.age': { uk: 'Файли користувачів', nl: 'Bestanden van gebruikers', hint: ['завантажені файли й вкладення', 'geüploade bestanden en bijlagen'] },
  'systeem.tar.gz.age': { uk: 'Система', nl: 'Systeem', hint: ['код релізу, служби systemd, конфіг тунелю, міст MCP (без секретів)', 'releasecode, systemd-diensten, tunnelconfig, MCP-brug (zonder geheimen)'] },
  'systeem-info.txt': { uk: 'Опис системи', nl: 'Systeembeschrijving', hint: ['версії node/postgres/cloudflared, служби, порти', 'versies van node/postgres/cloudflared, diensten, poorten'] },
  'info.txt': { uk: 'Інформація про копію', nl: 'Info over de kopie', hint: ['час, реліз, міграції', 'tijd, release, migraties'] },
  SHA256SUMS: { uk: 'Контрольні суми', nl: 'Controlesommen', hint: ['перевірка цілісності: sha256sum -c', 'integriteitscontrole: sha256sum -c'] },
};

export default function McpBackupsCard({ tr }: { tr: Tr }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setRows(((await api.post('/api/mcp/backups', ctx())).data.backups ?? []) as Row[]); } catch { setError(tr('Не вдалося отримати список копій. Список бачить лише власник сервера, і дозвіл «Читати сайт і код» має бути увімкнений.', 'De lijst met kopieën kon niet worden opgehaald. Alleen de eigenaar van de server ziet de lijst, en het recht "Site en code lezen" moet aan staan.')); }
  }, [tr]);
  useEffect(() => { void load(); }, [load]);
  const save = async (stamp: string, name: string) => {
    setBusy(`${stamp}/${name}`); setError('');
    try {
      // Eerst een eenmalige downloadId (alleen de eigenaar, na step-up die client.ts zelf vraagt), dan het bestand.
      const link = (await api.post('/api/mcp/backups/link', { ...ctx(), stamp, name })).data as { downloadId: string };
      const res = await fetch('/api/mcp/backups/file', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ctx(), downloadId: link.downloadId }) });
      if (!res.ok) throw new Error('x');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url; a.download = `${stamp}-${name}`; a.click(); URL.revokeObjectURL(url);
    } catch { setError(tr('Файл не вдалося завантажити (потрібне повторне підтвердження входу; посилання діє 5 хвилин).', 'Het bestand kon niet worden gedownload (een nieuwe bevestiging van de aanmelding is nodig; de link geldt 5 minuten).')); } finally { setBusy(''); }
  };
  return <article className="mcp-card mbk">
    <header className="mbk-head"><h2><ServerCog size={18} />{tr('Нічні копії сервера', 'Nachtelijke serverkopieën')}</h2>
      <button type="button" className="mcp-ghost" onClick={() => void load()} aria-label={tr('Оновити', 'Vernieuwen')}><RefreshCw size={14} /></button></header>
    <p>{tr('Щоночі сервер сам робить зашифровану (age) копію всього, на чому працює сайт: бази, файлів користувачів та системи (код, служби, тунель, міст MCP). Секрети зберігаються окремо. Розшифрувати може лише ваш офлайн-ключ.', 'Elke nacht maakt de server zelf een versleutelde (age) kopie van alles waarop de site draait: database, bestanden van gebruikers en systeem (code, diensten, tunnel, MCP-brug). Geheimen worden apart bewaard. Alleen uw offline sleutel kan ze ontsleutelen.')}</p>
    {error && <p className="mbk-error" role="alert">{error}</p>}
    {rows === null && !error ? <p className="mbk-busy"><Loader2 size={14} className="mbk-spin" /> {tr('Завантаження…', 'Laden…')}</p> : rows && rows.length === 0 ? <p>{tr('Копій ще немає.', 'Er zijn nog geen kopieën.')}</p> : (
      <ul className="mbk-list">{(rows ?? []).map((r, i) => <li key={r.stamp} className={r.ready ? '' : 'is-partial'}>
        <details open={i === 0}>
          <summary><span className="mbk-when"><Database size={15} />{stampDate(r.stamp).toLocaleString()}</span>
            <span className="mbk-meta">{size(r.totalBytes)}{r.release ? ` · ${r.release}` : ''}</span>
            <span className={`mbk-badge ${r.ready ? 'ok' : 'warn'}`}>{r.ready ? tr('завершено', 'voltooid') : tr('незавершено', 'onvoltooid')}</span>
            {r.encrypted && <span className="mbk-badge"><ShieldCheck size={12} />age</span>}
            {!r.hasSystem && <span className="mbk-badge warn" title={tr('Ця копія зроблена до появи системного архіву', 'Deze kopie is gemaakt voordat het systeemarchief bestond')}>{tr('без системи', 'zonder systeem')}</span>}</summary>
          <ul className="mbk-files">{r.files.map((f) => { const k = KIND[f.name] ?? KIND[f.name.replace(/\.age$/, '') + '.age'] ?? { uk: f.name, nl: f.name, hint: ['', ''] as [string, string] };
            return <li key={f.name}><FileArchive size={14} /><span><b>{tr(k.uk, k.nl)}</b><small>{tr(k.hint[0], k.hint[1])} · {f.name} · {size(f.bytes)}</small></span>
              <button type="button" className="mcp-ghost" disabled={!!busy} onClick={() => void save(r.stamp, f.name)}>{busy === `${r.stamp}/${f.name}` ? <Loader2 size={14} className="mbk-spin" /> : <Download size={14} />}{tr('Завантажити', 'Downloaden')}</button></li>; })}</ul>
        </details></li>)}</ul>)}
    <p className="mbk-note">{tr('Відновлення: інструкція deploy/HERSTEL.md (розділ «5b. Системний архів»). Після завантаження перевіряйте суми: sha256sum -c SHA256SUMS.', 'Herstel: handleiding deploy/HERSTEL.md (sectie "5b. Systeemarchief"). Controleer na het downloaden de sommen: sha256sum -c SHA256SUMS.')}</p>
  </article>;
}
