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
  { id: 'archive', uk: 'Архів перевірено', nl: 'Archief gecontroleerd', time: '2 хв' },
  { id: 'sign', uk: 'Підпис перевірено', nl: 'Handtekening gecontroleerd', time: '4 хв' },
  { id: 'backup', uk: 'Резервну копію створено', nl: 'Back-up gemaakt', time: '8 хв' },
  { id: 'install', uk: 'Версію встановлено', nl: 'Versie geïnstalleerd', time: '12 хв' },
  { id: 'health', uk: 'Перевірка працездатності', nl: 'Gezondheidscontrole', time: '14 хв' },
  { id: 'done', uk: 'Готово', nl: 'Klaar', time: '—' },
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 16, padding: 8 }} className="uitrol-modern-grid">
      <div>
        {/* Top stages */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 20, background: '#fff', borderRadius: 16, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          {stages.map((s, i) => {
            const done = i < stageIdx;
            const current = i === stageIdx - 1 && isRunning;
            return (
              <div key={s.id} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: done ? '#22c55e' : current ? '#3b82f6' : '#e2e8f0', color: done || current ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                  {done ? <Check size={14} /> : i + 1}
                </div>
                <span style={{ fontSize: 13, fontWeight: done || current ? 600 : 400, color: done || current ? '#0f172a' : '#64748b' }}>{t(s.uk, s.nl)}</span>
                {i < stages.length - 1 && <div style={{ flex: 1, height: 2, background: done ? '#22c55e' : '#e2e8f0', margin: '0 8px' }} />}
              </div>
            );
          })}
        </div>

        {/* Current deployment card */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.06)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={18} />
                <span style={{ fontWeight: 600 }}>{t('Розгортання версії', 'Uitrol versie')} {rootStatus?.versie || '—'}</span>
                {isRunning && <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>{t('Виконується', 'Bezig')}</span>}
                {isFailed && <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>{t('Не вдалося', 'Mislukt')}</span>}
              </div>
              {rootStatus?.versie && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{t('Архів', 'Archief')}: mijn-ruimte-{rootStatus.versie}.tar.gz</div>}
            </div>
            <button type="button" onClick={onRefresh} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={14} /> {t('Оновити', 'Vernieuwen')}
            </button>
          </div>

          {/* Steps with times */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
            {steps.map((s, i) => {
              const done = i < stageIdx;
              const current = i === stageIdx - 1 && isRunning;
              return (
                <div key={s.id} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: done ? '#22c55e' : current ? '#3b82f6' : '#e2e8f0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: 11 }}>
                    {done ? <Check size={12} /> : i + 1}
                  </div>
                  <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 500 }}>{t(s.uk, s.nl)}</div>
                  <div style={{ fontSize: 10, color: '#64748b' }}>{done ? `✓ ${s.time}` : current ? s.time : '—'}</div>
                  {i < steps.length - 1 && <div style={{ position: 'absolute', top: 11, left: '50%', width: '100%', height: 2, background: done ? '#22c55e' : '#e2e8f0', zIndex: -1 }} />}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ width: `${progress}%`, height: '100%', background: isFailed ? '#ef4444' : '#3b82f6', transition: 'width .3s' }} />
          </div>
          <div style={{ fontSize: 12, color: '#64748b', textAlign: 'right' }}>{progress}%</div>

          {rootStatus && (rootStatus.uk || rootStatus.nl) && (
            <div style={{ background: isFailed ? '#fef2f2' : '#f0f9ff', borderRadius: 10, padding: 10, fontSize: 13, color: isFailed ? '#991b1b' : '#1e40af', marginTop: 8 }}>
              {isFailed && <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
              {lang === 'uk' ? rootStatus.uk : rootStatus.nl}
            </div>
          )}
        </div>

        {/* Event log */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.06)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Activity size={16} /> {t('Події розгортання', 'Uitrolgebeurtenissen')}</div>
            <span style={{ fontSize: 11, color: '#16a34a' }}>● {t('Реальний час', 'Realtime')}</span>
          </div>
          <div style={{ fontSize: 13, color: '#475569' }}>
            {(installaties.slice(0, 6)).map(i => (
              <div key={i.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: i.code === 'OK' || i.herkomst === 'passkey' || i.herkomst === 'ssh' ? '#22c55e' : '#ef4444', marginTop: 6 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{i.release || i.pakket}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{i.uk || i.nl}</div>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{i.tijd?.slice(11, 16) || ''}</div>
              </div>
            ))}
            {installaties.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>{t('Немає подій', 'Geen gebeurtenissen')}</div>}
          </div>
        </div>

        {/* History table */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><History size={16} /> {t('Історія розгортань', 'Uitrolgeschiedenis')}</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '8px 4px' }}>{t('Дата / час', 'Datum / tijd')}</th>
                <th>{t('Версія', 'Versie')}</th>
                <th>{t('Статус', 'Status')}</th>
                <th>{t('Хто', 'Wie')}</th>
                <th>{t('Коментар', 'Opmerking')}</th>
              </tr>
            </thead>
            <tbody>
              {installaties.slice(0, 8).map(i => (
                <tr key={i.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 4px' }}>{i.tijd?.replace('T', ' ').slice(0, 16) || '—'}</td>
                  <td>{i.release || '—'}</td>
                  <td>
                    <span style={{ color: i.code === 'OK' || !i.code ? '#16a34a' : '#dc2626' }}>
                      ● {i.code === 'OK' || !i.code ? t('Встановлено', 'Geïnstalleerd') : t('Не вдалося', 'Mislukt')}
                    </span>
                  </td>
                  <td>{i.wie || '—'}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.uk || i.nl || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Server size={16} /> {t('Стан системи', 'Systeemstatus')}</div>
          <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('Середовище', 'Omgeving')}</span><span style={{ color: '#16a34a' }}>Production</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('Активний випуск', 'Actieve release')}</span><span>{currentVersion || '—'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{t('Схвалення passkey', 'Passkey-goedkeuring')}</span><span style={{ color: '#16a34a' }}>{t('Активно', 'Actief')}</span></div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('Швидкі дії', 'Snelle acties')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" onClick={onUploadClick} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Download size={16} /> {t('Оновити з архіву', 'Bijwerken vanuit archief')}
            </button>
            <button type="button" onClick={onHistoryClick} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={16} /> {t('Переглянути історію', 'Geschiedenis bekijken')}
            </button>
            <button type="button" onClick={onPasskeyClick} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={16} /> {t('Керувати passkey', 'Passkeys beheren')}
            </button>
          </div>
        </div>

        <div style={{ background: '#f0f9ff', borderRadius: 16, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>💡 {t('Корисна інформація', 'Nuttige informatie')}</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
            <li>{t('Оновлення через архів — це безпечно. Пакет перевіряється за підписом.', 'Bijwerken via archief is veilig. Het pakket wordt op handtekening gecontroleerd.')}</li>
            <li>{t('Після встановлення статус з’явиться тут за кілька хвилин.', 'Na installatie verschijnt de status hier binnen enkele minuten.')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
