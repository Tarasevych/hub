// UPD-010: глобальний плаваючий індикатор фонового завантаження та встановлення оновлень.
// Працює у власному корені React (src/main.tsx) на всіх піддоменах (hub, mail, admin, ai тощо),
// тому процес оновлення не зникає при переході на іншу вкладку або інший піддомен.
import { useEffect } from 'react';
import { ArrowUpRight, ChevronDown, ChevronUp, CloudDownload, Loader2, Rocket, UploadCloud } from 'lucide-react';
import { routeLang } from '../canoniek-navigatie';
import {
  startUitrolAchtergrondPolling,
  useUitrolAchtergrond,
  zetBandIngeklapt,
} from './uitrol-achtergrond-beheer';
import './uitrol-achtergrond-band.css';

const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const UPDATES_URL = 'https://admin.tarasevych.com/updates';

export default function UitrolAchtergrondBand() {
  const lang = routeLang() === 'nl' ? 'nl' : 'uk';
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const snap = useUitrolAchtergrond();

  useEffect(() => startUitrolAchtergrondPolling(), []);

  const lokaal = snap.lokaal.bezigUpload ? snap.lokaal : null;
  const extern = !lokaal && snap.externLokaal && Date.now() - snap.externLokaal.tijd <= 15_000 ? snap.externLokaal : null;
  const run = snap.server?.run && snap.server.run.staat === 'bezig' ? snap.server.run : null;
  const goedgekeurd = snap.server?.goedgekeurd?.[0] || null;
  const ghBezig = snap.server?.githubBezig?.[0] || null;
  const srvUpload = !lokaal && !extern ? snap.server?.lopendeUploads?.[0] || null : null;

  let titel = '';
  let detail = '';
  let pct: number | null = null;
  let soort: 'upload' | 'github' | 'installatie' = 'installatie';

  if (run) {
    soort = 'installatie';
    pct = Math.max(0, Math.min(100, Number(run.pct || 0)));
    titel = t(`Встановлення ${run.versie || 'оновлення'}`, `Installatie van ${run.versie || 'update'}`);
    detail = (lang === 'uk' ? run.uk : run.nl) || t('Сервер виконує розгортання у фоні.', 'De server voert de uitrol op de achtergrond uit.');
  } else if (goedgekeurd) {
    soort = 'installatie';
    pct = null;
    titel = t(`Оновлення ${goedgekeurd.versie} схвалено`, `Update ${goedgekeurd.versie} goedgekeurd`);
    detail = t('Сервер щойно підхоплює пакунок для встановлення…', 'De server pakt het pakket zo op voor installatie…');
  } else if (lokaal) {
    soort = 'upload';
    pct = lokaal.voortgang ?? 0;
    titel = t(`Завантаження ${lokaal.versie || lokaal.bestandNaam}`, `Uploaden van ${lokaal.versie || lokaal.bestandNaam}`);
    detail = t(
      `Передано ${mb(lokaal.verzonden)} з ${mb(lokaal.grootte)}. Можна перемикати вкладки адмінки — не закривайте цю вкладку до завершення.`,
      `${mb(lokaal.verzonden)} van ${mb(lokaal.grootte)} verzonden. U kunt tussen beheertabs wisselen — sluit dit tabblad niet voor het klaar is.`,
    );
  } else if (extern) {
    soort = 'upload';
    pct = extern.pct;
    titel = t(`Завантаження ${extern.versie || extern.bestandNaam}`, `Uploaden van ${extern.versie || extern.bestandNaam}`);
    detail = t(
      `Триває в іншій вкладці: ${mb(extern.verzonden)} з ${mb(extern.bytes)}.`,
      `Loopt in een ander tabblad: ${mb(extern.verzonden)} van ${mb(extern.bytes)}.`,
    );
  } else if (ghBezig) {
    soort = 'github';
    pct = null;
    titel = t(`Завантаження з GitHub (${ghBezig.tag || ghBezig.versie})`, `Ophalen uit GitHub (${ghBezig.tag || ghBezig.versie})`);
    detail = (lang === 'uk' ? ghBezig.uk : ghBezig.nl) || t('Сервер завантажує й перевіряє випуск у фоні.', 'De server haalt de release op de achtergrond op en controleert die.');
  } else if (srvUpload) {
    soort = 'upload';
    pct = srvUpload.pct;
    titel = t(`Завантаження ${srvUpload.versie} на сервер`, `Uploaden van ${srvUpload.versie} naar server`);
    detail = t(
      `${srvUpload.voorbereider ? `${srvUpload.voorbereider} · ` : ''}${mb(srvUpload.ontvangen)} з ${mb(srvUpload.bytes)}`,
      `${srvUpload.voorbereider ? `${srvUpload.voorbereider} · ` : ''}${mb(srvUpload.ontvangen)} van ${mb(srvUpload.bytes)}`,
    );
  } else {
    return null;
  }

  const Icoon = soort === 'github' ? CloudDownload : soort === 'upload' ? UploadCloud : Rocket;
  const opUpdatesPagina = typeof window !== 'undefined'
    && window.location.hostname.startsWith('admin.')
    && window.location.pathname.startsWith('/updates');

  const naarUpdates = () => {
    if (opUpdatesPagina) {
      window.dispatchEvent(new CustomEvent('tsv:uitrol-nav', {
        detail: { tab: 'overzicht', anker: soort === 'installatie' ? 'ut-live-titel' : 'uitrol-upload-anchor' },
      }));
      return;
    }
    if (lokaal) {
      window.open(UPDATES_URL, '_blank', 'noopener');
      return;
    }
    window.location.href = UPDATES_URL;
  };

  if (snap.ingeklapt) {
    return (
      <aside className='ut-bg-band' data-ut-achtergrond-band data-ingeklapt='ja' role='status' aria-live='polite'>
        <button
          type='button'
          className='ut-bg-chip'
          onClick={() => zetBandIngeklapt(false)}
          aria-label={t('Розгорнути стан оновлення', 'Updatestatus uitklappen')}
        >
          <Loader2 className='ut-bg-icoon ut-bg-draai' aria-hidden='true' />
          <span>{titel}</span>
          {pct !== null && <span className='ut-bg-pct'>{pct}%</span>}
          <ChevronUp size={16} aria-hidden='true' />
        </button>
      </aside>
    );
  }

  return (
    <aside className='ut-bg-band' data-ut-achtergrond-band data-soort={soort} role='status' aria-live='polite'>
      <div className='ut-bg-kop'>
        <Icoon className='ut-bg-icoon' aria-hidden='true' />
        <span className='ut-bg-titel' title={titel}>{titel}</span>
        {pct !== null ? <span className='ut-bg-pct'>{pct}%</span> : <Loader2 className='ut-bg-icoon ut-bg-draai' aria-hidden='true' />}
        <button
          type='button'
          className='ut-bg-knop'
          onClick={() => zetBandIngeklapt(true)}
          aria-label={t('Згорнути індикатор оновлення', 'Update-indicator inklappen')}
          title={t('Згорнути', 'Inklappen')}
        >
          <ChevronDown size={15} aria-hidden='true' />
        </button>
      </div>
      <div className='ut-bg-balk' data-onbepaald={pct === null ? 'ja' : undefined} aria-hidden='true'>
        <span style={pct !== null ? { width: `${pct}%` } : undefined} />
      </div>
      <p className='ut-bg-sub'>{detail}</p>
      <div className='ut-bg-acties'>
        <button type='button' className='ut-bg-link' onClick={naarUpdates}>
          {t('Відкрити «Оновлення»', '«Updates» openen')}
          <ArrowUpRight size={14} aria-hidden='true' />
        </button>
        {snap.server && snap.server.wachtend > 0 && (
          <span className='ut-bg-sub'>
            {t(`У черзі: ${snap.server.wachtend}`, `In wachtrij: ${snap.server.wachtend}`)}
          </span>
        )}
      </div>
    </aside>
  );
}
