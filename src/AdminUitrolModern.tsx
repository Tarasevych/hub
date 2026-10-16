import { useState, useEffect } from 'react';
import { Check, Package, Activity, AlertCircle, RefreshCw, Server, Shield, Download, History, Upload, Users, Clock } from 'lucide-react';

type Lang = 'uk' | 'nl';
type RootStatus = { staat?: string; versie?: string; code?: string; uk?: string; nl?: string; tijd?: string; methode?: string } | null;
type Installatie = { id: string; tijd: string; code: string; herkomst: string; wie: string; pakket: string; release: string; commit: string; uk: string; nl: string };
type Voorstel = { id: string; versie: string; status: string; commit?: string; sha256?: string; samenvatting?: string; wie?: string; tijd?: string; beslistOp?: string; aangemaaktOp?: string; beslistDoor?: string; voorbereider?: string; uitkomst?: { uk?: string; nl?: string } | null };
type Kandidaat = { id: string; naam: string; email?: string };

type Props = {
  lang: Lang;
  rootStatus: RootStatus;
  installaties?: Installatie[];
  voorstellen?: Voorstel[];
  currentVersion?: string;
  onRefresh?: () => void;
  onUpload?: (file: File, note: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onGrant?: (soort: string, id: string, dagen: number, naam: string) => void;
  onRevoke?: (id: string) => void;
  onPasskeyClick?: () => void;
  passkeys?: { id?: string; naam?: string; naamWeergave?: string }[];
  schakelaar?: boolean;
  kandidaten?: { accounts: Kandidaat[]; agenttokens: Kandidaat[]; koppelingen: Kandidaat[] };
};

const stages = [
  { id: 'prep', uk: 'Підготовка', nl: 'Voorbereiding' },
  { id: 'check', uk: 'Перевірки', nl: 'Controles' },
  { id: 'approve', uk: 'Схвалення', nl: 'Goedkeuring' },
  { id: 'deploy', uk: 'Розгортання', nl: 'Uitrol' },
];

const steps = [
  { id: 'archive', uk: 'Архів перевірено', nl: 'Archief gecontroleerd' },
  { id: 'sign', uk: 'Підпис перевірено', nl: 'Handtekening gecontroleerd' },
  { id: 'backup', uk: 'Резервна копія', nl: 'Back-up' },
  { id: 'install', uk: 'Версію встановлено', nl: 'Versie geïnstalleerd' },
  { id: 'health', uk: 'Перевірка роботи', nl: 'Gezondheidscontrole' },
  { id: 'done', uk: 'Готово', nl: 'Klaar' },
];

function stageFromStatus(status: RootStatus): number {
  if (!status) return 0;
  const s = status.staat || '';
  const c = status.code || '';
  if (s === 'klaar' || c === 'OK') return 4;
  if (s === 'bezig') return 3;
  if (c === 'CONTROLE' || c === 'HANDTEKENING') return 2;
  return 1;
}

function isOk(code: string) {
  return !code || code === 'OK' || code === 'GEINSTALLEERD';
}

export default function AdminUitrolModern({
  lang, rootStatus, installaties = [], voorstellen = [], currentVersion,
  onRefresh, onUpload, onApprove, onReject, onGrant, onPasskeyClick,
  passkeys = [], schakelaar = false,
}: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const stageIdx = stageFromStatus(rootStatus);
  const isRunning = rootStatus?.staat === 'bezig';
  const isFailed = rootStatus?.staat === 'mislukt' || rootStatus?.staat === 'geweigerd';
  const progress = Math.min(100, Math.round((stageIdx / 4) * 100));
  const recent = installaties.slice(0, 8);
  const statusText = (s: string) => {
    const map: Record<string, [string, string]> = {
      'goedgekeurd': ['Схвалено', 'Goedgekeurd'],
      'geinstalleerd': ['Встановлено', 'Geïnstalleerd'],
      'uploaden': ['Завантажується', 'Uploaden'],
      'wacht-op-goedkeuring': ['Чекає схвалення', 'Wacht op goedkeuring'],
      'afgebroken': ['Перервано', 'Afgebroken'],
      'afgewezen': ['Відхилено', 'Afgewezen'],
      'mislukt': ['Не вдалося', 'Mislukt'],
      'geweigerd': ['Відмовлено', 'Geweigerd'],
      'verlopen': ['Прострочено', 'Verlopen'],
    };
    return map[s] ? t(map[s][0], map[s][1]) : s;
  };
  const history = [
    ...installaties.map(i => ({ id: i.id, ver: i.release || i.pakket, tijd: i.tijd, wie: i.wie, ok: isOk(i.code) || (i.uk || i.nl || '').includes('встановлено'), text: i.uk || i.nl })),
    ...voorstellen.filter(v => v.status !== 'wacht-op-goedkeuring').map(v => ({ id: v.id, ver: v.versie, tijd: v.beslistOp || v.aangemaaktOp, wie: v.beslistDoor || v.voorbereider, ok: v.status === 'goedgekeurd' || v.status === 'geinstalleerd', text: v.uitkomst?.uk || v.uitkomst?.nl || statusText(v.status) })),
  ].sort((a, b) => (b.tijd || '').localeCompare(a.tijd || '')).slice(0, 50);
  const pending = voorstellen.filter(v => v.status === 'wacht-op-goedkeuring');
  const [pageSize, setPageSize] = useState(() => Number(localStorage.getItem('uitrol-page-size') || 10));
  const [liveLog, setLiveLog] = useState('');
  useEffect(() => {
    if (!isRunning) { setLiveLog(''); return; }
    const id = setInterval(async () => {
      try {
        const r = await fetch('/api/owner/uitrol/log', { credentials: 'include' });
        const j = await r.json();
        if (j.log) setLiveLog(j.log);
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(id);
  }, [isRunning]);
  useEffect(() => {
    const id = setInterval(() => { onRefresh?.(); }, 10000);
    return () => clearInterval(id);
  }, [onRefresh]);
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(history.length / pageSize));
  const pageItems = history.slice(page * pageSize, (page + 1) * pageSize);
  const downloadRelease = (ver?: string) => {
    if (!ver) return;
    window.open(`/api/owner/uitrol/archief/${encodeURIComponent(ver)}.tar.gz`, '_blank');
  };
const openPc = (ver?: string) => {
    if (!ver) return;
    // Opens a file:// or shows the expected path; actual file access depends on the browser
    alert(`Очікуваний шлях на ПК:\nR:\\mijn-ruimte-reservekopie\\mijn-ruimte-${ver}.tar.gz`);
  };

  return (
    <div className="uitrol-modern">
      <div className="uitrol-stages">
        {stages.map((s, i) => {
          const done = i < stageIdx;
          const current = i === stageIdx - 1 && isRunning;
          return (
            <div key={s.id} className={`uitrol-stage${done ? ' done' : ''}${current ? ' current' : ''}`}>
              <span className="uitrol-stage-dot">{done ? <Check size={12} /> : i + 1}</span>
              <span className="uitrol-stage-label">{t(s.uk, s.nl)}</span>
            </div>
          );
        })}
      </div>

      <div className="uitrol-card">
        <div className="uitrol-card-head">
          <div>
            <div className="uitrol-title">
              <Package size={18} />
              <span>{t('Розгортання версії', 'Uitrol versie')} {rootStatus?.versie || '—'}</span>
              {isRunning && <span className="uitrol-badge busy">{t('Виконується', 'Bezig')}</span>}
              {isFailed && <span className="uitrol-badge fail">{t('Не вдалося', 'Mislukt')}</span>}
              {!isRunning && !isFailed && rootStatus?.versie && <span className="uitrol-badge ok">{t('Встановлено', 'Geïnstalleerd')}</span>}
            </div>
            {rootStatus?.versie && <div className="uitrol-sub">mijn-ruimte-{rootStatus.versie}.tar.gz</div>}
          </div>
          <button type="button" className="uitrol-refresh" onClick={onRefresh}><RefreshCw size={16} /> {t('Оновити', 'Vernieuwen')}</button>
        </div>

        <div className="uitrol-steps">
          {steps.map((s, i) => {
            const done = i < Math.min(stageIdx + 1, 6);
            const current = i === stageIdx - 1 && isRunning;
            return (
              <div key={s.id} className={`uitrol-step${done ? ' done' : ''}${current ? ' current' : ''}`}>
                <span className="uitrol-step-dot">{done ? <Check size={12} /> : i + 1}</span>
                <span className="uitrol-step-label">{t(s.uk, s.nl)}</span>
              </div>
            );
          })}
        </div>

        <div className="uitrol-progress"><div className="uitrol-progress-bar" style={{ width: `${progress}%`, background: isFailed ? '#ef4444' : '#3b82f6' }} /></div>
        <div className="uitrol-progress-label">{progress}%</div>
        {isRunning && liveLog && <pre className="uitrol-live-log">{liveLog}</pre>}
        {rootStatus && (rootStatus.uk || rootStatus.nl) && (
          <div className={`uitrol-status${isFailed ? ' fail' : ''}`}>{isFailed && <AlertCircle size={14} />}{lang === 'uk' ? rootStatus.uk : rootStatus.nl}</div>
        )}
      </div>

      <div className="uitrol-card">
        <div className="uitrol-card-head">
          <div className="uitrol-title"><Activity size={16} /> {t('Події розгортання', 'Uitrolgebeurtenissen')}</div>
          <span className="uitrol-live">● {t('Реальний час', 'Realtime')}</span>
        </div>
        {recent.length === 0 ? <div className="uitrol-empty">{t('Немає подій', 'Geen gebeurtenissen')}</div> : recent.map(i => (
          <div key={i.id} className="uitrol-event">
            <span className={`uitrol-dot${isOk(i.code) ? ' ok' : ' fail'}`} />
            <div className="uitrol-event-body">
              <div className="uitrol-event-title">{i.release || i.pakket}</div>
              <div className="uitrol-event-desc">{i.uk || i.nl}</div>
            </div>
            <span className="uitrol-event-time">{i.tijd?.slice(11, 16) || ''}</span>
          </div>
        ))}
      </div>

      <div className="uitrol-card" id="uitrol-history">
        <div className="uitrol-card-head">
          <div className="uitrol-title"><History size={16} /> {t('Історія розгортань', 'Uitrolgeschiedenis')}</div>
          <select className="uitrol-page-size" value={pageSize} onChange={e => { const n = Number(e.target.value); setPageSize(n); setPage(0); localStorage.setItem('uitrol-page-size', String(n)); }}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="uitrol-history">
          {pageItems.map(i => (
            <div key={i.id} className="uitrol-history-row">
              <div className="uitrol-history-main">
                <span className="uitrol-history-ver">{i.ver || '—'}</span>
                <span className={`uitrol-history-status${i.ok ? ' ok' : ' fail'}`}>● {i.ok ? t('Встановлено', 'Geïnstalleerd') : t('Не вдалося', 'Mislukt')}</span>
              </div>
              <div className="uitrol-history-meta"><span>{i.tijd?.replace('T', ' ').slice(0, 16) || '—'}</span><span>{i.wie || '—'}</span></div>
              <div className="uitrol-history-comment">{i.text || '—'}</div>
              <span className="uitrol-history-actions">
                <button type="button" className="uitrol-icon-btn" onClick={() => downloadRelease(i.ver)} title={t('З сервера', 'Van server')}><Download size={14} /></button>
                <button type="button" className="uitrol-icon-btn" onClick={() => openPc(i.ver)} title="R:\mijn-ruimte-reservekopie">💾</button>
                <a className="uitrol-gh-btn" href={`https://github.com/Tarasevych/hub/releases/tag/uitrol-${i.ver || ''}`} target="_blank" rel="noreferrer" title="GitHub"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg></a>
              </span>
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="uitrol-pager">
            <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} type="button" className={i === page ? 'active' : ''} onClick={() => setPage(i)}>{i + 1}</button>
            ))}
            <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>›</button>
          </div>
        )}
      </div>

      {/* Upload form integrated */}
      <div className="uitrol-card" id="uitrol-upload">
        <div className="uitrol-title"><Upload size={16} /> {t('Завантажити архів', 'Archief uploaden')}</div>
        <p className="uitrol-sub">{t('Виберіть .tar.gz з UITROL-VERSIE всередині.', 'Kies een .tar.gz met UITROL-VERSIE erin.')}</p>
        <input type="file" accept=".tar.gz,.tgz" id="uitrol-file" className="uitrol-file" onChange={e => { const f = e.target.files?.[0]; if (f && onUpload) onUpload(f, ''); }} />
        <label htmlFor="uitrol-file" className="uitrol-btn primary">{t('Вибрати файл', 'Bestand kiezen')}</label>
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="uitrol-card">
          <div className="uitrol-title"><Clock size={16} /> {t('Чекають схвалення', 'Wachten op goedkeuring')}</div>
          {pending.map(v => (
            <div key={v.id} className="uitrol-pending">
              <div><strong>{v.versie}</strong> · {v.wie}</div>
              <div className="uitrol-pending-actions">
                <button type="button" className="uitrol-btn primary" onClick={() => onApprove?.(v.id)}>{t('Схвалити', 'Goedkeuren')}</button>
                <button type="button" className="uitrol-btn" onClick={() => onReject?.(v.id)}>{t('Відхилити', 'Afwijzen')}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Grants */}
      <div className="uitrol-card">
        <div className="uitrol-title"><Users size={16} /> {t('Хто може готувати оновлення', 'Wie mag updates voorbereiden')}</div>
        <p className="uitrol-sub">{t('Дозвольте акаунту або агенту готувати пакети.', 'Sta een account of agent toe om pakketten voor te bereiden.')}</p>
        <button type="button" className="uitrol-btn" onClick={() => onGrant?.('account', '', 7, '')}>{t('Додати дозвіл', 'Toestemming toevoegen')}</button>
      </div>

      <div className="uitrol-side">
        <div className="uitrol-card">
          <div className="uitrol-title"><Server size={16} /> {t('Стан системи', 'Systeemstatus')}</div>
          <div className="uitrol-kv"><span>{t('Середовище', 'Omgeving')}</span><span className="ok">Production</span></div>
          <div className="uitrol-kv"><span>{t('Активний випуск', 'Actieve release')}</span><span>{currentVersion || rootStatus?.versie || '—'}</span></div>
          <div className="uitrol-kv"><span>{t('Passkey', 'Passkey')}</span><span className={schakelaar && passkeys.length ? 'ok' : ''}>{schakelaar && passkeys.length ? t('Активно', 'Actief') : t('Немає', 'Geen')}</span></div>
        </div>
        <div className="uitrol-card">
          <div className="uitrol-title">{t('Швидкі дії', 'Snelle acties')}</div>
          <button type="button" className="uitrol-btn primary" onClick={() => document.getElementById('uitrol-upload')?.scrollIntoView({ behavior: 'smooth' })}><Download size={16} /> {t('Оновити з архіву', 'Bijwerken vanuit archief')}</button>
          <button type="button" className="uitrol-btn" onClick={() => document.getElementById('uitrol-history')?.scrollIntoView({ behavior: 'smooth' })}><History size={16} /> {t('Переглянути історію', 'Geschiedenis bekijken')}</button>
          <button type="button" className="uitrol-btn" onClick={onPasskeyClick}><Shield size={16} /> {t('Керувати passkey', 'Passkeys beheren')}</button>
        </div>
        <div className="uitrol-card tip">
          <div className="uitrol-title">💡 {t('Корисна інформація', 'Nuttige informatie')}</div>
          <ul>
            <li>{t('Оновлення через архів перевіряється за підписом.', 'Bijwerken via archief wordt op handtekening gecontroleerd.')}</li>
            <li>{t('Статус оновлюється автоматично кожні 20 секунд.', 'Status wordt elke 20 seconden automatisch bijgewerkt.')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
