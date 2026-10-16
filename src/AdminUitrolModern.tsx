import { useState } from 'react';
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
  const history = [
    ...installaties.map(i => ({ id: i.id, ver: i.release || i.pakket, tijd: i.tijd, wie: i.wie, ok: isOk(i.code), text: i.uk || i.nl })),
    ...voorstellen.filter(v => v.status !== 'wacht-op-goedkeuring').map(v => ({ id: v.id, ver: v.versie, tijd: v.beslistOp || v.aangemaaktOp, wie: v.beslistDoor || v.voorbereider, ok: v.status === 'goedgekeurd' || v.status === 'geinstalleerd', text: v.uitkomst?.uk || v.uitkomst?.nl || v.status })),
  ].slice(0, 30);
  const pending = voorstellen.filter(v => v.status === 'wacht-op-goedkeuring');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(history.length / pageSize));
  const pageItems = history.slice(page * pageSize, (page + 1) * pageSize);
  const downloadRelease = (ver?: string) => {
    if (!ver) return;
    // TODO: permanent storage endpoint; for now open the known archive path if present
    window.open(`/api/owner/uitrol/archief/${encodeURIComponent(ver)}.tar.gz`, '_blank');
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
          <select className="uitrol-page-size" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}>
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
              <button type="button" className="uitrol-btn small" onClick={() => downloadRelease(i.ver)} title={t('Завантажити цей випуск', 'Deze release downloaden')}><Download size={14} /></button>
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
