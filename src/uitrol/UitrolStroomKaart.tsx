// Компактна картка розумного потоку розгортання для «Огляду», очікуваних схвалень та деталей запуску.
// Compacte kaart voor de slimme uitrolstroom in Overzicht, wachtende goedkeuringen en run-details.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileCheck2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { api } from '../platform/client';
import { foutCode } from '../platform/webauthn';
import { VERSIE_RE, type StroomOverzicht, type StroomRisico } from '../../shared/uitrol-stroom';
import { foutTekst } from './fouten';
import { tr, type Lang } from './types';
import './stroom.css';

type Props = {
  lang: Lang;
  context: Record<string, unknown>;
  versie?: string;
  compact?: boolean;
  refreshSleutel?: unknown;
  naarStroom?: (versie: string) => void;
};

export const risicoTekst = (lang: Lang, r: StroomRisico): string => {
  if (r === 'laag') return tr(lang, 'Низький ризик', 'Laag risico');
  if (r === 'verhoogd') return tr(lang, 'Підвищений ризик', 'Verhoogd risico');
  if (r === 'kritiek') return tr(lang, 'Критичний ризик', 'Kritiek risico');
  return tr(lang, 'Стандартний ризик', 'Normaal risico');
};

export default function UitrolStroomKaart({ lang, context, versie, compact = false, refreshSleutel, naarStroom }: Props) {
  const [stand, setStand] = useState<StroomOverzicht | null>(null);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState('');

  const geldigeVersie = versie && VERSIE_RE.test(versie) ? versie : '';

  const haalStand = useCallback(async () => {
    setLaden(true);
    setFout('');
    try {
      const r = await api.post('/api/owner/uitrol/stroom/stand', {
        ...context,
        ...(geldigeVersie ? { versie: geldigeVersie } : {}),
      });
      setStand(r.data as StroomOverzicht);
    } catch (e) {
      setFout(foutTekst(lang, foutCode(e)));
    } finally {
      setLaden(false);
    }
  }, [context, geldigeVersie, lang]);

  useEffect(() => {
    void haalStand();
  }, [haalStand, refreshSleutel]);

  if (!stand && !fout) {
    return (
      <div className='ut-stroom-compact' role='status'>
        <span className='ut-stroom-tegel-label'><RefreshCw size={14} className='ut-draai' aria-hidden='true' /> {tr(lang, 'Завантажуємо контрольний потік і докази…', 'Uitrolstroom en bewijs laden…')}</span>
      </div>
    );
  }

  if (fout && !stand) {
    return (
      <div className='ut-stroom-compact' data-ut-stroom-kaart='fout'>
        <div className='ut-stroom-compact-kop'>
          <strong>{tr(lang, 'Потік розгортання', 'Uitrolstroom')}</strong>
          <button type='button' className='ut-knop' onClick={() => void haalStand()}>{tr(lang, 'Повторити', 'Opnieuw')}</button>
        </div>
        <small>{fout}</small>
      </div>
    );
  }

  if (!stand) return null;
  const g = stand.gereedheid;
  const openHandmatig = stand.controlelijst.filter((c) => c.handmatigBevestigen && c.status === 'open');
  const eigenNotities = stand.notities.filter((n) => n.soort === 'eigenaar');

  if (compact) {
    return (
      <div className='ut-stroom-compact' data-ut-stroom-compact={stand.versie}>
        <div className='ut-stroom-compact-kop'>
          <div className='ut-stroom-punt-labels'>
            <span className='ut-stroom-risico' data-risico={stand.duiding.risico}>
              {stand.duiding.risico === 'kritiek' ? <ShieldAlert size={14} aria-hidden='true' /> : <ShieldCheck size={14} aria-hidden='true' />}
              {risicoTekst(lang, stand.duiding.risico)} ({stand.duiding.score}/100)
            </span>
            <span className='ut-stroom-status-pil' data-status={stand.ketenIntegriteit.ok ? 'geslaagd' : 'mislukt'}>
              <FileCheck2 size={13} aria-hidden='true' />
              {stand.bewijzen.length} {tr(lang, 'доказів', 'bewijzen')} · {stand.ketenIntegriteit.ok ? tr(lang, 'ланцюг цілий', 'keten heel') : tr(lang, 'порушення хешів', 'ketenfout')}
            </span>
          </div>
          {naarStroom && (
            <button type='button' className='ut-knop' onClick={() => naarStroom(stand.versie)}>
              <ClipboardCheck size={15} aria-hidden='true' />
              {tr(lang, 'Відкрити потік', 'Stroom openen')}
            </button>
          )}
        </div>
        <div className='ut-stroom-voortgang' data-ok={!g.geblokkeerd && g.voortgangPct === 100} data-fout={g.mislukt > 0}>
          <span style={{ width: `${g.voortgangPct}%` }} />
        </div>
        <div className='ut-stroom-compact-stats'>
          <span>{tr(lang, `Контрольний список: ${g.afgerond}/${g.totaal} (${g.voortgangPct}%)`, `Controlelijst: ${g.afgerond}/${g.totaal} (${g.voortgangPct}%)`)}</span>
          {g.openVerplicht > 0 && <strong><AlertTriangle size={13} aria-hidden='true' /> {tr(lang, `Обов’язкових відкрито: ${g.openVerplicht}`, `Open verplicht: ${g.openVerplicht}`)}</strong>}
          {eigenNotities.length > 0 && <span>{tr(lang, `Нотаток власника: ${eigenNotities.length}`, `Eigen notities: ${eigenNotities.length}`)}</span>}
        </div>
      </div>
    );
  }

  return (
    <section className='ut-kaart' data-ut-stroom-kaart={stand.versie} aria-labelledby='ut-stroom-kaart-titel'>
      <header className='ut-kaart-kop'>
        <div>
          <h2 id='ut-stroom-kaart-titel'><ClipboardCheck aria-hidden='true' /> {tr(lang, 'Розумний потік розгортання', 'Slimme uitrolstroom')}</h2>
          <p className='ut-sub'>
            {tr(lang, `Аналіз ризиків, контекстний контрольний список і криптографічні докази для версії `, `Risicoduiding, contextafhankelijke controlelijst en cryptografisch bewijs voor versie `)}
            <code className='ut-mono'>{stand.versie}</code>.
          </p>
        </div>
        <div className='ut-stroom-kop-acties'>
          <button type='button' className='ut-knop' disabled={laden} onClick={() => void haalStand()}>
            <RefreshCw size={15} className={laden ? 'ut-draai' : undefined} aria-hidden='true' />
            {tr(lang, 'Оновити', 'Vernieuwen')}
          </button>
          {naarStroom && (
            <button type='button' className='ut-knop ut-knop-primair' onClick={() => naarStroom(stand.versie)}>
              <ClipboardCheck size={15} aria-hidden='true' />
              {tr(lang, 'Керувати потоком і доказами', 'Stroom en bewijs beheren')}
            </button>
          )}
        </div>
      </header>

      <div className='ut-stroom-overzicht-balk'>
        <div className='ut-stroom-tegel'>
          <span className='ut-stroom-tegel-label'>{tr(lang, 'Оцінка ризику', 'Risicobeoordeling')}</span>
          <div className='ut-stroom-tegel-waarde'>
            <span className='ut-stroom-risico' data-risico={stand.duiding.risico}>{risicoTekst(lang, stand.duiding.risico)}</span>
            <span>{stand.duiding.score}/100</span>
          </div>
        </div>
        <div className='ut-stroom-tegel'>
          <span className='ut-stroom-tegel-label'>{tr(lang, 'Контрольний список', 'Controlelijst')}</span>
          <div className='ut-stroom-tegel-waarde'>
            <span>{g.afgerond}/{g.totaal} ({g.voortgangPct}%)</span>
            {g.openVerplicht > 0 && <small>{tr(lang, `обов’язкових: ${g.openVerplicht}`, `verplicht: ${g.openVerplicht}`)}</small>}
          </div>
        </div>
        <div className='ut-stroom-tegel'>
          <span className='ut-stroom-tegel-label'>{tr(lang, 'Автоматичні докази', 'Automatisch bewijs')}</span>
          <div className='ut-stroom-tegel-waarde'>
            <CheckCircle2 size={16} aria-hidden='true' />
            <span>{stand.bewijzen.length} · {stand.ketenIntegriteit.ok ? tr(lang, 'SHA-ланцюг цілий', 'SHA-keten heel') : tr(lang, 'є розбіжності', 'afwijking')}</span>
          </div>
        </div>
      </div>

      <p className='ut-sub'>{lang === 'uk' ? stand.duiding.samenvattingUk : stand.duiding.samenvattingNl}</p>

      {openHandmatig.length > 0 && (
        <div className='ut-stroom-compact'>
          <strong>{tr(lang, 'Потрібні ручні підтвердження у потоці:', 'Handmatige bevestiging nodig in de stroom:')}</strong>
          <ul className='ut-stroom-lijst'>
            {openHandmatig.slice(0, 3).map((item) => (
              <li key={item.id} className='ut-stroom-punt' data-status={item.status}>
                <div className='ut-stroom-punt-boven'>
                  <div className='ut-stroom-punt-titel'>
                    <strong>{lang === 'uk' ? item.titelUk : item.titelNl}</strong>
                    <small>{lang === 'uk' ? item.toelichtingUk : item.toelichtingNl}</small>
                  </div>
                  {naarStroom && (
                    <button type='button' className='ut-knop' onClick={() => naarStroom(stand.versie)}>
                      {tr(lang, 'Підтвердити в потоці', 'Bevestigen in stroom')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
