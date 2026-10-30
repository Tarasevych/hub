// «⋯» van de editor «Новий лист» (29.10.2026, Pavlo: «rommelig menu»): vier tabbladen in plaats van één lange kolom —
// «Текст» (stijl, uitlijning, lettertype, maat), «Вставити» (raster met korte labels), «Шаблони», «Дії» (скасувати/повторити).
// WAI-ARIA tabs: role=tablist/tab/tabpanel, aria-selected, aria-controls; ←/→/Home/End (rondgaand) met automatische activatie;
// alleen het gekozen tabblad is een Tab-stop (roving tabindex). Het gekozen tabblad blijft bewaard zolang het venster open is.
// De inhoud (knoppen, keuzelijsten, sjablonen) komt van MailComposeEditor — dezelfde acties als vroeger; alleen de ordening is nieuw.
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import './meer-tabs.css';

export type MeerTab = { id: string; uk: string; nl: string; inhoud: ReactNode };

export default function MeerTabs({ lang, tabs, actief, onKies }: { lang: 'uk' | 'nl'; tabs: MeerTab[]; actief: string; onKies: (id: string) => void }) {
  const basis = useId();
  const lijst = useRef<HTMLDivElement | null>(null);
  const huidig = tabs.find((t) => t.id === actief) || tabs[0];
  const t = (x: MeerTab) => (lang === 'uk' ? x.uk : x.nl);
  const toets = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((x) => x.id === huidig.id);
    const n = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (n < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); e.stopPropagation();
    onKies(tabs[n].id);
    requestAnimationFrame(() => lijst.current?.querySelector<HTMLElement>(`[data-meer-tab="${tabs[n].id}"]`)?.focus());
  };
  return (
    <div className='mm' data-meer-tabs>
      <div ref={lijst} className='mm-tabs' role='tablist' aria-label={lang === 'uk' ? 'Розділи меню' : 'Onderdelen van het menu'} onKeyDown={toets} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((x) => {
          const gekozen = x.id === huidig.id;
          return (
            <button key={x.id} type='button' role='tab' id={`${basis}-tab-${x.id}`} data-meer-tab={x.id} aria-selected={gekozen} aria-controls={`${basis}-paneel-${x.id}`} tabIndex={gekozen ? 0 : -1}
              onClick={(e) => { onKies(x.id); e.currentTarget.focus({ preventScroll: true }); }}>{t(x)}</button>
          );
        })}
      </div>
      {tabs.map((x) => (
        <div key={x.id} role='tabpanel' id={`${basis}-paneel-${x.id}`} aria-labelledby={`${basis}-tab-${x.id}`} className='mm-paneel' hidden={x.id !== huidig.id} data-meer-paneel={x.id}>
          {x.id === huidig.id ? x.inhoud : null}
        </div>
      ))}
    </div>
  );
}

/** Tegel voor het raster: pictogram boven, kort label eronder. */
export function Tegel({ label, Icoon, onClick, actief, uitgeklapt, sluit, titel }: { label: string; Icoon: any; onClick: () => void; actief?: boolean; uitgeklapt?: boolean; sluit?: boolean; titel?: string }) {
  return (
    <button type='button' className='mm-tegel' title={titel || label} aria-pressed={actief || undefined} aria-expanded={uitgeklapt} data-menu-sluit={sluit ? '' : undefined}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icoon aria-hidden='true' /><span className='mm-label'>{label}</span>
    </button>
  );
}
