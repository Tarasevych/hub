import { Check, Package, AlertCircle } from 'lucide-react';

type Lang = 'uk' | 'nl';
type RootStatus = { staat?: string; versie?: string; code?: string; uk?: string; nl?: string; tijd?: string; methode?: string } | null;

type Props = {
  lang: Lang;
  rootStatus: RootStatus;
  currentVersion?: string;
};

const stages = [
  { id: 'prepared', uk: 'Пакет підготовлено', nl: 'Pakket voorbereid' },
  { id: 'signature', uk: 'Перевірка підпису', nl: 'Handtekeningcontrole' },
  { id: 'install', uk: 'Встановлення', nl: 'Installatie' },
  { id: 'health', uk: 'Перевірка роботи', nl: 'Gezondheidscontrole' },
  { id: 'done', uk: 'Готово', nl: 'Klaar' },
];

function stageIndex(status: RootStatus): number {
  if (!status) return 0;
  const s = status.staat || '';
  const c = status.code || '';
  if (s === 'klaar' || c === 'OK') return 5;
  if (s === 'bezig' && c === 'INSTALLEREN') return 3;
  if (s === 'bezig' && c === 'CONTROLE') return 2;
  if (s === 'mislukt' || s === 'geweigerd') return 0;
  return 1;
}

export default function AdminUitrolProgress({ lang, rootStatus, currentVersion }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const idx = stageIndex(rootStatus);
  const progress = Math.min(100, Math.round((idx / 5) * 100));
  const isRunning = rootStatus?.staat === 'bezig';
  const isFailed = rootStatus?.staat === 'mislukt' || rootStatus?.staat === 'geweigerd';

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.06)', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            <Package size={18} />
            {t('Розгортання оновлення', 'Update uitrollen')}
            {isRunning && <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 12, padding: '2px 8px', borderRadius: 999 }}>{t('У процесі', 'Bezig')}</span>}
            {isFailed && <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 12, padding: '2px 8px', borderRadius: 999 }}>{t('Не вдалося', 'Mislukt')}</span>}
          </div>
          {rootStatus?.versie && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{t('Випуск', 'Release')} {rootStatus.versie}</div>}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: `conic-gradient(#3b82f6 ${progress * 3.6}deg, #e2e8f0 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{progress}%</div>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{isRunning ? t('Триває встановлення...', 'Bezig met installeren...') : t('Очікування', 'Wachten')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16 }}>
        {stages.map((s, i) => {
          const done = i < idx;
          const current = i === idx - 1 && isRunning;
          return (
            <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? '#22c55e' : current ? '#3b82f6' : '#e2e8f0', color: done || current ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, zIndex: 1 }}>
                {done ? <Check size={14} /> : i + 1}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'center', maxWidth: 80 }}>{t(s.uk, s.nl)}</div>
              {i < stages.length - 1 && <div style={{ position: 'absolute', top: 14, left: '50%', width: '100%', height: 2, background: done ? '#22c55e' : '#e2e8f0', zIndex: 0 }} />}
            </div>
          );
        })}
      </div>

      {rootStatus && (rootStatus.uk || rootStatus.nl) && (
        <div style={{ background: isFailed ? '#fef2f2' : '#f0f9ff', borderRadius: 12, padding: 12, fontSize: 13, color: isFailed ? '#991b1b' : '#1e40af' }}>
          {isFailed && <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />}
          {lang === 'uk' ? rootStatus.uk : rootStatus.nl}
        </div>
      )}

      {currentVersion && (
        <div style={{ marginTop: 16, display: 'flex', gap: 24, fontSize: 13, color: '#64748b' }}>
          <div><span style={{ fontWeight: 500, color: '#0f172a' }}>{t('Поточна версія', 'Huidige versie')}:</span> {currentVersion}</div>
          {rootStatus?.versie && <div><span style={{ fontWeight: 500, color: '#0f172a' }}>{t('Цільова', 'Doel')}:</span> {rootStatus.versie}</div>}
        </div>
      )}
    </div>
  );
}
