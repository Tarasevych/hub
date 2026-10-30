// Bouwstenen van de bijlageviewer v2: pictogramknop met tooltip (muis, toetsenbord, lang indrukken op aanraakscherm),
// segmentschakelaar en zoomgroep. Alle doelen zijn minstens 44×44 px (de rand is onzichtbaar), het pictogram blijft klein.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type KnopStaat = 'normaal' | 'bezig' | 'gelukt' | 'fout';
type Toon = 'neutraal' | 'hoofd' | 'ai' | 'gevaar';

/** Lang indrukken (500 ms) op aanraakscherm toont de uitleg; de klik die daarop volgt wordt dan niet uitgevoerd. */
export function useAanraakUitleg() {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined), getoond = useRef(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), 2200);
    return () => window.clearTimeout(t);
  }, [open]);
  return {
    open,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        getoond.current = false;
        if (e.pointerType !== 'touch') return;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => { getoond.current = true; setOpen(true); }, 500);
      },
      onPointerUp: () => window.clearTimeout(timer.current),
      onPointerCancel: () => window.clearTimeout(timer.current),
      onContextMenu: (e: React.MouseEvent) => { if (getoond.current) e.preventDefault(); },
    },
    slikKlik: () => { if (getoond.current) { getoond.current = false; return true; } return false; },
  };
}

export function Tip({ id, tekst, open }: { id: string; tekst: string; open: boolean }) {
  return <span role='tooltip' id={id} className='bv2-tip' data-open={open ? '1' : undefined}>{tekst}</span>;
}

export function IconKnop(p: {
  label: string; onClick?: () => void; children: ReactNode; toon?: Toon; actief?: boolean; uit?: boolean; staat?: KnopStaat;
  kort?: string; toonLabel?: boolean; href?: string; download?: string; data?: string; sneltoets?: string; ariaExpanded?: boolean;
}) {
  const id = useId(), u = useAanraakUitleg();
  const tekst = p.sneltoets ? `${p.label} (${p.sneltoets})` : p.label;
  const inhoud = <>
    <span className='bv2-pict' aria-hidden='true'>{p.staat === 'bezig' ? <span className='bv2-draai' /> : p.children}</span>
    {p.toonLabel && <span className='bv2-label'>{p.kort || p.label}</span>}
    <Tip id={`${id}-tip`} tekst={tekst} open={u.open} />
  </>;
  const gemeen = {
    className: `bv2-knop is-${p.toon || 'neutraal'}${p.toonLabel ? ' met-label' : ''}`,
    'aria-label': p.label, 'aria-describedby': `${id}-tip`, 'data-staat': p.staat && p.staat !== 'normaal' ? p.staat : undefined,
    'data-bv2': p.data, ...u.handlers,
  };
  if (p.href) return <a {...gemeen} href={p.href} download={p.download} onClick={(e) => { if (u.slikKlik()) { e.preventDefault(); return; } p.onClick?.(); }}>{inhoud}</a>;
  return <button type='button' {...gemeen} aria-pressed={p.actief === undefined ? undefined : p.actief} aria-expanded={p.ariaExpanded}
    disabled={p.uit} aria-busy={p.staat === 'bezig' || undefined}
    onClick={() => { if (u.slikKlik()) return; p.onClick?.(); }}>{inhoud}</button>;
}

/** Wederzijds uitsluitende keuzes als één schakelaar (radiogroep, pijltjestoetsen wisselen). */
export function Segmenten<T extends string>({ label, waarde, keuzes, onKies, data }: {
  label: string; waarde: T | null; data?: string;
  keuzes: Array<{ waarde: T; label: string; kort?: string; pict: ReactNode }>; onKies: (v: T) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const toets = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = Math.max(0, keuzes.findIndex((k) => k.waarde === waarde));
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? keuzes.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + keuzes.length) % keuzes.length;
    onKies(keuzes[n].waarde);
    window.requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLButtonElement>('[role=radio]')[n]?.focus());
  };
  const actiefIndex = keuzes.findIndex((k) => k.waarde === waarde);
  return <div ref={ref} className='bv2-segmenten' role='radiogroup' aria-label={label} onKeyDown={toets} data-bv2={data}
    style={{ ['--bv2-n' as string]: keuzes.length, ['--bv2-i' as string]: Math.max(0, actiefIndex) }} data-leeg={actiefIndex < 0 ? '1' : undefined}>
    <span className='bv2-segment-glijder' aria-hidden='true' />
    {keuzes.map((k) => <SegmentKnop key={k.waarde} k={k} actief={k.waarde === waarde} focusbaar={k.waarde === waarde || (actiefIndex < 0 && k === keuzes[0])} onKies={() => onKies(k.waarde)} />)}
  </div>;
}
function SegmentKnop({ k, actief, focusbaar, onKies }: { k: { waarde: string; label: string; kort?: string; pict: ReactNode }; actief: boolean; focusbaar: boolean; onKies: () => void }) {
  const id = useId(), u = useAanraakUitleg();
  return <button type='button' role='radio' aria-checked={actief} tabIndex={focusbaar ? 0 : -1} className='bv2-segment' aria-label={k.label}
    aria-describedby={`${id}-tip`} data-waarde={k.waarde} {...u.handlers} onClick={() => { if (!u.slikKlik()) onKies(); }}>
    <span className='bv2-pict' aria-hidden='true'>{k.pict}</span>{k.kort && <span className='bv2-label'>{k.kort}</span>}
    <Tip id={`${id}-tip`} tekst={k.label} open={u.open} />
  </button>;
}

/** − / waarde / +. De waarde opent een klein venster voor een precieze instelling (25–400 %) en snelle keuzes. */
export function ZoomGroep({ lang, procent, onZet, onMin, onPlus, onPassend, min = 25, max = 400, data, compact = false }: {
  lang: 'uk' | 'nl'; procent: number; compact?: boolean; onZet: (p: number) => void; onMin: () => void; onPlus: () => void; onPassend?: () => void; min?: number; max?: number; data?: string;
}) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [open, setOpen] = useState(false), [invoer, setInvoer] = useState(String(procent));
  const wortel = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (open) setInvoer(String(procent)); }, [open, procent]);
  useEffect(() => {
    if (!open) return;
    const buiten = (e: PointerEvent) => { if (!wortel.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', buiten, true); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', buiten, true); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  const zet = (v: number) => { if (!Number.isFinite(v)) return; onZet(Math.min(max, Math.max(min, Math.round(v)))); setOpen(false); };
  const id = useId();
  // compact (smalle kop): alleen de waarde; − en + staan dan in het venster.
  const min_ = <IconKnop label={t('Зменшити', 'Uitzoomen')} sneltoets='−' onClick={onMin} uit={procent <= min} data='zoom-min'><Min /></IconKnop>;
  const plus = <IconKnop label={t('Збільшити', 'Inzoomen')} sneltoets='+' onClick={onPlus} uit={procent >= max} data='zoom-plus'><Plus /></IconKnop>;
  return <div ref={wortel} className={`bv2-groep bv2-zoom${compact ? ' is-compact' : ''}`} role='group' aria-label={t('Масштаб', 'Zoom')} data-bv2={data}>
    {!compact && min_}
    <button type='button' className='bv2-zoom-waarde' aria-haspopup='dialog' aria-expanded={open} aria-controls={`${id}-z`}
      aria-label={t(`Масштаб ${procent}%. Точне значення`, `Zoom ${procent}%. Precieze waarde`)} onClick={() => setOpen((o) => !o)} data-bv2='zoom-waarde'>{procent}%</button>
    {!compact && plus}
    {open && <div className='bv2-zwevend bv2-zoom-venster' role='dialog' id={`${id}-z`} aria-label={t('Точний масштаб', 'Precieze zoom')}>
      {compact && <div className='bv2-zoom-stap'>{min_}<b>{procent}%</b>{plus}</div>}
      <form onSubmit={(e) => { e.preventDefault(); zet(Number(invoer)); }} className='bv2-zoom-invoer'>
        <label><span className='bv2-sr'>{t('Масштаб у відсотках', 'Zoom in procenten')}</span>
          <input autoFocus type='number' inputMode='numeric' min={min} max={max} step={5} value={invoer} onChange={(e) => setInvoer(e.target.value)} data-bv2='zoom-invoer' />
        </label><span aria-hidden='true'>%</span>
        <button type='submit' className='bv2-tekstknop is-hoofd'>{t('Застосувати', 'Toepassen')}</button>
      </form>
      <div className='bv2-zoom-keuzes'>
        {[50, 75, 100, 125, 150, 200].map((v) => <button key={v} type='button' className='bv2-tekstknop' aria-pressed={v === procent} onClick={() => zet(v)}>{v}%</button>)}
        {onPassend && <button type='button' className='bv2-tekstknop' onClick={() => { onPassend(); setOpen(false); }}>{t('Вписати', 'Passend')}</button>}
      </div>
    </div>}
  </div>;
}

const Min = () => <svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><path d='M5 12h14' /></svg>;
const Plus = () => <svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'><path d='M12 5v14M5 12h14' /></svg>;
