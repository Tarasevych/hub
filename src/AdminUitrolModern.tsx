import { Check, Package, Activity, AlertCircle, RefreshCw, Server, Shield, Download, History } from 'lucide-react';

type Lang = 'uk' | 'nl';
type RootStatus = { staat?: string; versie?: string; code?: string; uk?: string; nl?: string; tijd?: string; methode?: string } | null;
type Installatie = { id: string; tijd: string; code: string; herkomst: string; wie: string; pakket: string; release: string; commit: string; uk: string; nl: string };

type Props = {
  lang: Lang;
  rootStatus: RootStatus;
  installaties?: Installatie[];
  currentVersion?: string;
  onRefresh?: () => void;
  onUploadClick?: () => void;
  onHistoryClick?: () => void;
  onPasskeyClick?: () => void;
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

export default function AdminUitrolModern({ lang, rootStatus, installaties = [], currentVersion, onRefresh, onUploadClick, onHistoryClick, onPasskeyClick }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const stageIdx = stageFromStatus(rootStatus);
  const isRunning = rootStatus?.staat === 'bezig';
  const isFailed = rootStatus?.staat === 'mislukt' || rootStatus?.staat === 'geweigerd';
  const progress = Math.min(100, Math.round((stageIdx / 4) * 100));
  const recent = installaties.slice(0, 5);
  const history = installaties.slice(0, 12);

  return (
    <div className="uitrol-modern">
      {/* Top stages */}
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

      {/* Current deployment */}
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
            const done = i < stageIdx;
            const current = i === stageIdx - 1 && isRunning;
            return (
              <div key={s.id} className={`uitrol-step${done ? ' done' : ''}${current ? ' current' : ''}`}>
                <span className="uitrol-step-dot">{done ? <Check size={12} /> : i + 1}</span>
                <span className="uitrol-step-label">{t(s.uk, s.nl)}</span>
              </div>
            );
          })}
        </div>

        <div className="uitrol-progress">
          <div className="uitrol-progress-bar" style={{ width: `${progress}%`, background: isFailed ? '#ef4444' : '#3b82f6' }} />
        </div>
        <div className="uitrol-progress-label">{progress}%</div>

        {rootStatus && (rootStatus.uk || rootStatus.nl) && (
          <div className={`uitrol-status${isFailed ? ' fail' : ''}`}>
            {isFailed && <AlertCircle size={14} />}
            {lang === 'uk' ? rootStatus.uk : rootStatus.nl}
          </div>
        )}
      </div>

      {/* Events */}
      <div className="uitrol-card">
        <div className="uitrol-card-head">
          <div className="uitrol-title"><Activity size={16} /> {t('Події розгортання', 'Uitrolgebeurtenissen')}</div>
          <span className="uitrol-live">● {t('Реальний час', 'Realtime')}</span>
        </div>
        {recent.length === 0 ? (
          <div className="uitrol-empty">{t('Немає подій', 'Geen gebeurtenissen')}</div>
        ) : recent.map(i => (
          <div key={i.id} className="uitrol-event">
            <span className={`uitrol-dot${i.code === 'OK' || !i.code ? ' ok' : ' fail'}`} />
            <div className="uitrol-event-body">
              <div className="uitrol-event-title">{i.release || i.pakket}</div>
              <div className="uitrol-event-desc">{i.uk || i.nl}</div>
            </div>
            <span className="uitrol-event-time">{i.tijd?.slice(11, 16) || ''}</span>
          </div>
        ))}
      </div>

      {/* History */}
      <div className="uitrol-card">
        <div className="uitrol-title"><History size={16} /> {t('Історія розгортань', 'Uitrolgeschiedenis')}</div>
        <div className="uitrol-history">
          {history.map(i => (
            <div key={i.id} className="uitrol-history-row">
              <div className="uitrol-history-main">
                <span className="uitrol-history-ver">{i.release || '—'}</span>
                <span className={`uitrol-history-status${i.code === 'OK' || !i.code ? ' ok' : ' fail'}`}>
                  ● {i.code === 'OK' || !i.code ? t('Встановлено', 'Geïnstalleerd') : t('Не вдалося', 'Mislukt')}
                </span>
              </div>
              <div className="uitrol-history-meta">
                <span>{i.tijd?.replace('T', ' ').slice(0, 16) || '—'}</span>
                <span>{i.wie || '—'}</span>
              </div>
              <div className="uitrol-history-comment">{i.uk || i.nl || '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar-like blocks */}
      <div className="uitrol-side">
        <div className="uitrol-card">
          <div className="uitrol-title"><Server size={16} /> {t('Стан системи', 'Systeemstatus')}</div>
          <div className="uitrol-kv"><span>{t('Середовище', 'Omgeving')}</span><span className="ok">Production</span></div>
          <div className="uitrol-kv"><span>{t('Активний випуск', 'Actieve release')}</span><span>{currentVersion || rootStatus?.versie || '—'}</span></div>
          <div className="uitrol-kv"><span>{t('Схвалення passkey', 'Passkey-goedkeuring')}</span><span className="ok">{t('Активно', 'Actief')}</span></div>
        </div>
        <div className="uitrol-card">
          <div className="uitrol-title">{t('Швидкі дії', 'Snelle acties')}</div>
          <button type="button" className="uitrol-btn primary" onClick={onUploadClick}><Download size={16} /> {t('Оновити з архіву', 'Bijwerken vanuit archief')}</button>
          <button type="button" className="uitrol-btn" onClick={onHistoryClick}><History size={16} /> {t('Переглянути історію', 'Geschiedenis bekijken')}</button>
          <button type="button" className="uitrol-btn" onClick={onPasskeyClick}><Shield size={16} /> {t('Керувати passkey', 'Passkeys beheren')}</button>
        </div>
        <div className="uitrol-card tip">
          <div className="uitrol-title">💡 {t('Корисна інформація', 'Nuttige informatie')}</div>
          <ul>
            <li>{t('Оновлення через архів — це безпечно. Пакет перевіряється за підписом.', 'Bijwerken via archief is veilig. Het pakket wordt op handtekening gecontroleerd.')}</li>
            <li>{t('Після встановлення статус з’явиться тут за кілька хвилин.', 'Na installatie verschijnt de status hier binnen enkele minuten.')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
