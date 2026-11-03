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

/** Blok "Нічні копії сервера": lijst per nachtelijke kopie, met de bestanden die elk downloadbaar zijn. */
export default function McpBackupsCard({ tr }: { tr: Tr }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setRows(((await api.post('/api/mcp/backups', ctx())).data.backups ?? []) as Row[]); } catch { setError(tr('Не вдалося отримати список копій. Перевірте, що дозвіл «Читати сайт і код» увімкнено.', 'De lijst met kopieën kon niet worden opgehaald. Controleer of het recht "Site en code lezen" aan staat.')); }
  }, [tr]);
  useEffect(() => { void load(); }, [load]);
  const save = async (stamp: string, name: string) => {
    setBusy(`${stamp}/${name}`); setError('');
    try {
      const res = await fetch('/api/mcp/backups/file', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ctx(), stamp, name }) });
      if (!res.ok) throw new Error('x');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a'); a.href = url; a.download = `${stamp}-${name}`; a.click(); URL.revokeObjectURL(url);
    } catch { setError(tr('Файл не вдалося завантажити.', 'Het bestand kon niet worden gedownload.')); } finally { setBusy(''); }
  };
  return <section className="mcp-block mbk">
    <header className="mcp-block-head">
      <span className="mcp-block-icon" aria-hidden="true"><ServerCog /></span>
      <div className="mcp-block-title">
        <h2>{tr('Нічні копії сервера', 'Nachtelijke serverkopieën')}</h2>
        <p>{tr('Щоночі сервер робить зашифровану копію всього сайту. Секрети зберігаються окремо; розшифрувати може лише ваш офлайн-ключ.', 'Elke nacht maakt de server een versleutelde kopie van de hele site. Geheimen worden apart bewaard; alleen uw offline sleutel ontsleutelt ze.')}</p>
      </div>
      <div className="mcp-block-actions">
        <button type="button" className="mcp-btn ghost small" onClick={() => void load()} aria-label={tr('Оновити', 'Vernieuwen')}><RefreshCw />{tr('Оновити', 'Vernieuwen')}</button>
      </div>
    </header>
    <div className="mcp-block-body">
      {error && <p className="mcp-error" role="alert">{error}</p>}
      {rows === null && !error ? <p className="mbk-busy"><Loader2 size={14} className="mbk-spin" /> {tr('Завантаження…', 'Laden…')}</p> : rows && rows.length === 0 ? (
        <div className="mcp-empty"><ServerCog /><p>{tr('Копій ще немає.', 'Er zijn nog geen kopieën.')}</p></div>
      ) : (
        <ul className="mbk-list">{(rows ?? []).map((r, i) => <li key={r.stamp} className={r.ready ? '' : 'is-partial'}>
          <details open={i === 0}>
            <summary><span className="mbk-when"><Database size={15} />{stampDate(r.stamp).toLocaleString()}</span>
              <span className="mbk-meta">{size(r.totalBytes)}{r.release ? ` · ${r.release}` : ''}</span>
              <span className={`mbk-badge ${r.ready ? 'ok' : 'warn'}`}>{r.ready ? tr('завершено', 'voltooid') : tr('незавершено', 'onvoltooid')}</span>
              {r.encrypted && <span className="mbk-badge"><ShieldCheck size={12} />age</span>}
              {!r.hasSystem && <span className="mbk-badge warn" title={tr('Ця копія зроблена до появи системного архіву', 'Deze kopie is gemaakt voordat het systeemarchief bestond')}>{tr('без системи', 'zonder systeem')}</span>}</summary>
            <ul className="mbk-files">{r.files.map((f) => { const k = KIND[f.name] ?? KIND[f.name.replace(/\.age$/, '') + '.age'] ?? { uk: f.name, nl: f.name, hint: ['', ''] as [string, string] };
              return <li key={f.name}><FileArchive size={14} /><span><b>{tr(k.uk, k.nl)}</b><small>{tr(k.hint[0], k.hint[1])} · {f.name} · {size(f.bytes)}</small></span>
                <button type="button" className="mcp-btn ghost small" disabled={!!busy} onClick={() => void save(r.stamp, f.name)}>{busy === `${r.stamp}/${f.name}` ? <Loader2 size={14} className="mbk-spin" /> : <Download size={14} />}{tr('Завантажити', 'Downloaden')}</button></li>; })}</ul>
          </details></li>)}</ul>
      )}
      <p className="mbk-note">{tr('Відновлення: інструкція deploy/HERSTEL.md (розділ «5b. Системний архів»). Після завантаження перевіряйте суми: sha256sum -c SHA256SUMS.', 'Herstel: handleiding deploy/HERSTEL.md (sectie "5b. Systeemarchief"). Controleer na het downloaden de sommen: sha256sum -c SHA256SUMS.')}</p>
    </div>
  </section>;
}
