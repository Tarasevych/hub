// Kleine bouwstenen voor «Доступи»: aftellen, chips, ruimte-badge, foutteksten en het bevestigingsvenster.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Tr } from '../../mcp-ui';
import { foutTekst } from '../fouten';
import { exact } from '../ui';
import { ToegangFout } from './bron';
import { restTijd, type Ruimte, type T2 } from './model';

/** Aftellen tot het einde («ще 2 год 5 хв»), exacte tijd bij aanwijzen. Tikt elke 30 s (geen aria-live: dat zou blijven praten). */
export function Aftellen({ tot, tr }: { tot: number | null; tr: Tr }) {
  const [, tik] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tik((n) => n + 1), 30_000); return () => window.clearInterval(t); }, []);
  const [uk, nl] = restTijd(tot);
  if (!tot) return <span className='tg-tijd'>{tr(uk, nl)}</span>;
  const kort = tot - Date.now() < 15 * 60_000;
  return <time className={`tg-tijd${kort ? ' is-kort' : ''}`} dateTime={new Date(tot).toISOString()} title={exact(tot)} data-tg-rest={Math.max(0, Math.ceil((tot - Date.now()) / 60000))}>{tr(uk, nl)}</time>;
}

export function Chips({ items, tr, leeg }: { items: readonly T2[]; tr: Tr; leeg?: string }) {
  if (!items.length) return <span className='tg-leeg-tekst'>{leeg ?? '—'}</span>;
  return <span className='tg-chips'>{items.map((t, i) => <span key={`${t[0]}-${i}`} className='tg-chip'>{tr(t[0], t[1])}</span>)}</span>;
}

export function RuimteBadge({ ruimte, tr }: { ruimte: Ruimte; tr: Tr }) {
  return ruimte === 'technisch'
    ? <span className='ag-badge tg-badge-tech' data-ruimte='technisch'>{tr('Технічний', 'Technisch')}</span>
    : <span className='ag-badge ag-info' data-ruimte='prive'>{tr('Користувач', 'Gebruiker')}</span>;
}

/** Fout in gewone taal; eigen uitleg (ToegangFout, bijv. passkey geweigerd) gaat voor; eigenaar beschermd → eigen zin. */
export function tgFout(e: unknown, tr: Tr, wat: [string, string]): string {
  if (e instanceof ToegangFout) return `${tr(wat[0], wat[1])}. ${tr(e.uk, e.nl)}`;
  const code = String((e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e as Error)?.message || '');
  if (/EIGENAAR|OWNER_PROTECTED|OWNER_REQUIRED/.test(code)) return `${tr(wat[0], wat[1])}. ${tr('Політику й доступи власника може змінювати лише сам власник.', 'Beleid en toegang van de eigenaar wijzigt alleen de eigenaar zelf.')} (${tr('код', 'code')}: ${code})`;
  if (code === 'BUITEN_BELEID') return `${tr(wat[0], wat[1])}. ${tr('Це виходить за межі політики цього облікового запису.', 'Dit valt buiten het beleid van dit account.')} (${tr('код', 'code')}: ${code})`;
  if (code === 'GEEN_BROWSER_RECHTEN') return `${tr(wat[0], wat[1])}. ${tr('Спершу дозвольте ШІ щось у вкладці «Розширення браузера → Що може ШІ».', 'Sta de AI eerst iets toe op het tabblad «Browserextensie → Wat mag de AI».')}`;
  return foutTekst(e, tr, wat);
}

/** Bevestigingsvenster (modaal, role=alertdialog): focus op «Скасувати», Esc sluit, focus terug naar de knop die het opende. */
export function Venster({ titel, children, ja, nee, onJa, onNee, bezig, data }: { titel: string; children: ReactNode; ja: string; nee: string; onJa: () => void; onNee: () => void; bezig?: boolean; data?: string }) {
  const id = useId();
  const neeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const terug = document.activeElement as HTMLElement | null;
    neeRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onNee(); } };
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('keydown', esc, true); try { terug?.focus?.(); } catch { /* weg */ } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className='tg-venster-achter' data-tg-venster={data}>
      <div className='tg-venster' role='alertdialog' aria-modal='true' aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`}>
        <h3 id={`${id}-t`}>{titel}</h3>
        <div id={`${id}-b`} className='tg-venster-tekst'>{children}</div>
        <div className='tg-knoppen'>
          <button type='button' className='ag-knop ag-knop-danger tg-knop' onClick={onJa} disabled={bezig} data-tg-venster-ja={data}>{ja}</button>
          <button type='button' className='ag-knop tg-knop' ref={neeRef} onClick={onNee} data-tg-venster-nee={data}>{nee}</button>
        </div>
      </div>
    </div>
  );
}
