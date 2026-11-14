// IDENTITEIT-013: спільний діалог підтвердження небезпечних дій. Тонка обгортка над Venster (спільний стек вікон, фокус-пастка,
// Esc, телефон, тема через токени). Пояснює наслідки, показує кількість зачеплених елементів і, де треба, просить причину.
// Небезпечна кнопка позначена «!», фокус спершу стоїть на «Скасувати», підтвердити може лише людина (не скрипт і не ШІ).
// Gedeelde bevestigingsdialoog voor gevaarlijke handelingen, bovenop Venster: gevolgen, aantal, eventueel een reden; alleen een mens bevestigt.
import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Venster } from './vensters';
import { focusTerug } from './toegankelijk';
import { doorMens, geenAi } from '../menselijke-actie';
import './bevestig-dialoog.css';

export type BevestigDialoogProps = {
  open: boolean;
  titel: string;
  /** Головне пояснення: що станеться. */
  uitleg?: string;
  /** Перелік наслідків («що зміниться»). */
  gevolgen?: string[];
  /** Скільки елементів зачепить дія; показується біля кнопки. */
  aantal?: number;
  /** Поле «Причина» (щонайменше 3 символи); значення отримує onBevestig. */
  redenVereist?: boolean;
  bevestigTekst: string;
  annuleerTekst?: string;
  /** Руйнівна дія: червона кнопка зі знаком «!», фокус спершу на «Скасувати». */
  gevaarlijk?: boolean;
  /** Дія виконується: кнопки й закриття заблоковано. */
  bezig?: boolean;
  onBevestig: (reden?: string) => void | Promise<void>;
  onAnnuleer: () => void;
  lang: 'uk' | 'nl';
  /** Ідентифікатор вікна і data-bevestig (для тестів і спільного стеку вікон). */
  id?: string;
};

const tr = (lang: 'uk' | 'nl', uk: string, nl: string) => (lang === 'nl' ? nl : uk);

export function BevestigDialoog(p: BevestigDialoogProps) {
  const titelId = useId();
  const uitlegId = useId();
  const [reden, setReden] = useState('');
  const [fout, setFout] = useState('');
  const [eigenBezig, setEigenBezig] = useState(false);
  const terug = useRef<HTMLElement | null>(null);
  const bezig = !!p.bezig || eigenBezig;

  // Звідки відкрили — туди повертаємо фокус після закриття.
  useEffect(() => {
    if (!p.open) return;
    terug.current = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null;
    setReden(''); setFout('');
    return () => { focusTerug(terug.current); };
  }, [p.open]);

  if (!p.open) return null;
  const redenOk = !p.redenVereist || reden.trim().length >= 3;

  const bevestig = async (e: React.MouseEvent) => {
    // Лише людина: клік зі скрипту або від ШІ-розширення нічого не підтверджує.
    if (!doorMens(e) || bezig || !redenOk) return;
    setFout(''); setEigenBezig(true);
    try { await p.onBevestig(p.redenVereist ? reden.trim() : undefined); }
    catch { setFout(tr(p.lang, 'Не вдалося виконати дію. Спробуйте ще раз.', 'De handeling is mislukt. Probeer het opnieuw.')); }
    finally { setEigenBezig(false); }
  };
  // Esc у вкладеній модалці (наприклад, бічна панель способів входу) не має закривати й зовнішнє вікно.
  const toets = (e: React.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!bezig) p.onAnnuleer(); } };

  return (
    <Venster id={p.id || 'bevestig-dialoog'} titel={p.titel} breedte={440} onSluit={bezig ? undefined : p.onAnnuleer} sluitenUit={bezig}
      labelledBy={titelId} describedBy={p.uitleg ? uitlegId : undefined} lang={p.lang} className='bevestig-dialoog-venster'>
      <div className={`bevestig-dialoog${p.gevaarlijk ? ' is-gevaarlijk' : ''}`} data-bevestig={p.id || 'bevestig-dialoog'} onKeyDown={toets}>
        <h2 id={titelId} className='bevestig-dialoog-titel'>{p.titel}</h2>
        {(p.gevaarlijk || p.uitleg) && (
          <div className='bevestig-dialoog-kop'>
            {p.gevaarlijk && <span className='bevestig-dialoog-teken' aria-hidden='true'><AlertTriangle /></span>}
            {p.uitleg && <p id={uitlegId} className='bevestig-dialoog-uitleg'>{p.uitleg}</p>}
          </div>
        )}
        {!!p.gevolgen?.length && (
          <div className='bevestig-dialoog-gevolgen' role='note'>
            <strong>{tr(p.lang, 'Що станеться', 'Wat er gebeurt')}</strong>
            <ul>{p.gevolgen.map((g) => <li key={g}>{g}</li>)}</ul>
          </div>
        )}
        {p.redenVereist && (
          <label className='bevestig-dialoog-reden'>
            {tr(p.lang, 'Причина (щонайменше 3 символи)', 'Reden (minstens 3 tekens)')}
            <textarea value={reden} onChange={(e) => setReden(e.target.value)} maxLength={300} rows={2} disabled={bezig} />
          </label>
        )}
        {fout && <p className='bevestig-dialoog-fout' role='alert'>{fout}</p>}
        <div className='bevestig-dialoog-voet'>
          <button type='button' className='bevestig-dialoog-annuleer' onClick={p.onAnnuleer} disabled={bezig} autoFocus={p.gevaarlijk} data-autofocus={p.gevaarlijk ? '' : undefined}>
            <X aria-hidden='true' />{p.annuleerTekst || tr(p.lang, 'Скасувати', 'Annuleren')}
          </button>
          <button type='button' className={`bevestig-dialoog-ja${p.gevaarlijk ? ' is-gevaar' : ''}`} onClick={(e) => void bevestig(e)} disabled={bezig || !redenOk}
            autoFocus={!p.gevaarlijk} {...(p.gevaarlijk ? geenAi : {})}>
            {p.gevaarlijk ? <span className='bevestig-dialoog-uitroep' aria-hidden='true'>!</span> : <Check aria-hidden='true' />}
            {bezig ? tr(p.lang, 'Виконую…', 'Bezig…') : p.bevestigTekst}
            {typeof p.aantal === 'number' && p.aantal > 0 && !bezig ? <span className='bevestig-dialoog-aantal'>({p.aantal})</span> : null}
          </button>
        </div>
      </div>
    </Venster>
  );
}
