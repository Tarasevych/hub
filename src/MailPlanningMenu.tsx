import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, CircleAlert, Clock, LoaderCircle, Trash2, X } from 'lucide-react';
import { cancelScheduledRemote, composeErrorText, listScheduledRemote, schedulePresets, type Context, type Lang, type ScheduledItem } from './mail-opstel-api';
import './mail-planning-menu.css';

type Props = { lang: Lang; context: Context; canSchedule: boolean; onSchedule: (at: number) => Promise<void>; busy: boolean };

const fmt = (ms: number, lang: Lang) => new Date(ms).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const localInput = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** "Відкласти відправлення": швидкі варіанти, власний час і список запланованих листів зі скасуванням. */
export default function MailScheduleMenu({ lang, context, canSchedule, onSchedule, busy }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(() => localInput(Date.now() + 2 * 3600_000));
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await listScheduledRemote(context)).items); setError(''); } catch (e) { setError(composeErrorText(e, t)); }
    setLoading(false);
  }, [context, lang]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const pick = async (at: number) => { setError(''); try { await onSchedule(at); setOpen(false); } catch (e) { setError(composeErrorText(e, t)); } };
  const cancel = async (id: string) => { try { await cancelScheduledRemote(context, id); await load(); } catch (e) { setError(composeErrorText(e, t)); } };
  const statusText = (s: ScheduledItem['status']) => ({ scheduled: t('заплановано', 'gepland'), sending: t('надсилається', 'wordt verzonden'), sent: t('надіслано', 'verzonden'), failed: t('не вдалося', 'mislukt'), cancelled: t('скасовано', 'geannuleerd') }[s]);
  const waiting = items.filter((i) => i.status === 'scheduled').length;
  const presets = schedulePresets(new Date(), t);

  return (
    <div className='mail-sched' ref={rootRef}>
      <button type='button' className={`mail-sched-trigger${open ? ' is-open' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)} data-schedule-open='true'
        title={t('Надіслати пізніше або переглянути заплановані листи', 'Later versturen of geplande berichten bekijken')}>
        <CalendarClock aria-hidden='true' />{t('Пізніше', 'Later')}{waiting ? <span className='mail-sched-count'>{waiting}</span> : null}
      </button>
      {open ? (
        <div className='mail-sched-pop' role='dialog' aria-label={t('Відкладене відправлення', 'Uitgesteld verzenden')}>
          <div className='mail-sched-head'><b>{t('Надіслати пізніше', 'Later versturen')}</b><button type='button' aria-label={t('Закрити', 'Sluiten')} onClick={() => setOpen(false)}><X /></button></div>
          {!canSchedule ? <p className='mail-sched-note'>{t('Спершу вкажіть одержувача й напишіть лист.', 'Geef eerst een ontvanger op en schrijf het bericht.')}</p> : null}
          <div className='mail-sched-presets'>
            {presets.map((p) => (
              <button key={p.id} type='button' disabled={!canSchedule || busy} onClick={() => void pick(p.at)} data-schedule-preset={p.id}>
                <Clock aria-hidden='true' /><span>{p.label}</span><small>{fmt(p.at, lang)}</small>
              </button>
            ))}
          </div>
          <form className='mail-sched-custom' onSubmit={(e) => { e.preventDefault(); const at = new Date(custom).getTime(); if (Number.isFinite(at)) void pick(at); }}>
            <label>{t('Свій час', 'Eigen tijd')}<input type='datetime-local' value={custom} onChange={(e) => setCustom(e.target.value)} min={localInput(Date.now() + 60_000)} /></label>
            <button type='submit' disabled={!canSchedule || busy}>{busy ? <LoaderCircle className='mail-sched-spin' /> : t('Запланувати', 'Plannen')}</button>
          </form>
          <p className='mail-sched-note'>{t(`Час вашого пристрою: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Лист надсилає сервер, тож вимикати комп’ютер можна.`, `Tijd van uw apparaat: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. De server verstuurt het bericht, uw computer mag uit.`)}</p>
          {error ? <p className='mail-sched-error' role='alert'><CircleAlert aria-hidden='true' />{error}</p> : null}
          <div className='mail-sched-list-title'>{t('Заплановані й останні', 'Gepland en recent')}{loading ? <LoaderCircle className='mail-sched-spin' /> : null}</div>
          {items.length ? (
            <ul className='mail-sched-list'>
              {items.slice(0, 12).map((i) => (
                <li key={i.id} className={`st-${i.status}`} data-scheduled={i.status}>
                  <div><b>{i.subject || t('(без теми)', '(geen onderwerp)')}</b><small>{i.to}</small><small>{fmt(i.sendAt, lang)} · {statusText(i.status)}{i.status === 'failed' && i.lastError ? ` · ${i.lastError === 'MAIL_QUEUE_UNCERTAIN' ? t('невідомо, чи надіслано: перевірте «Надіслані»', 'onzeker of verzonden: controleer "Verzonden"') : t('помилка', 'fout')}` : ''}</small></div>
                  {i.status === 'scheduled' ? <button type='button' title={t('Скасувати відправлення', 'Verzending annuleren')} aria-label={t('Скасувати відправлення', 'Verzending annuleren')} onClick={() => void cancel(i.id)}><Trash2 /></button> : null}
                </li>
              ))}
            </ul>
          ) : <p className='mail-sched-note'>{t('Запланованих листів немає.', 'Geen geplande berichten.')}</p>}
        </div>
      ) : null}
    </div>
  );
}
