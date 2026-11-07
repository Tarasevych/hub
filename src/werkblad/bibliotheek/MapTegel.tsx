// Map op het werkblad (kind 'folder'): één niveau diep. Klik/Enter opent een popover met de snelkoppelingen; Escape sluit
// en zet de focus terug. Mappen in mappen bestaan niet (WERKBLAD_V3_LIMIETEN.maxMapNiveaus = 1): kinderen van kind 'folder' worden genegeerd.
import { useEffect, useId, useRef, useState } from 'react';
import type { DesktopEntry } from '../../../shared/werkblad-v3-types';
import { registerItem, type RegisterContext, type RegisterRegel } from '../../../shared/werkblad-register';
import { RegisterIcoon } from './icoon';
import { ShortcutTegel } from './ShortcutTegel';
import { tr, type Lang } from '../soorten';
import './bibliotheek.css';

export type MapTegelProps = {
  map: Pick<DesktopEntry, 'instanceId' | 'titleOverride' | 'iconOverride'>;
  kinderen: ReadonlyArray<Pick<DesktopEntry, 'instanceId' | 'itemId' | 'kind' | 'titleOverride' | 'iconOverride'>>;
  lang: Lang; ctx: RegisterContext; donker?: boolean; persoonlijk?: readonly RegisterRegel[]; instellen?: boolean; navigeer?: (url: string) => void;
  /** Integratie: een snelkoppeling uit de map halen (terug op het werkblad). */
  onUitnemen?: (instanceId: string) => void;
};

export function MapTegel(p: MapTegelProps) {
  const [open, setOpen] = useState(false);
  const knop = useRef<HTMLButtonElement>(null);
  const paneel = useRef<HTMLDivElement>(null);
  const id = useId();
  const naam = p.map.titleOverride || tr(p.lang, 'Тека', 'Map');
  const kinderen = p.kinderen.filter((k) => k.kind === 'shortcut');
  useEffect(() => {
    if (!open) return;
    paneel.current?.querySelector<HTMLElement>('button')?.focus();
    const weg = (e: PointerEvent) => { if (!paneel.current?.contains(e.target as Node) && !knop.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', weg);
    return () => document.removeEventListener('pointerdown', weg);
  }, [open]);
  return (
    <div className='bib-map'>
      <button ref={knop} type='button' className='bib-tegel' aria-expanded={open} aria-controls={id} onClick={() => !p.instellen && setOpen((o) => !o)}
        aria-label={tr(p.lang, `Тека «${naam}», елементів: ${kinderen.length}`, `Map «${naam}», items: ${kinderen.length}`)} data-werkblad-map={p.map.instanceId} title={naam}>
        <span className='bib-tegel-icoon bib-map-icoon'>{kinderen.length ? kinderen.slice(0, 4).map((k) => <RegisterIcoon key={k.instanceId} icoon={k.iconOverride || registerItem(k.itemId, p.persoonlijk)?.icoon || 'dot'} />) : <RegisterIcoon icoon={p.map.iconOverride || 'folder'} />}</span>
        <span className='bib-tegel-naam'>{naam}</span>
      </button>
      {open && (
        <div ref={paneel} id={id} className='bib-map-paneel' role='dialog' aria-label={naam} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); knop.current?.focus(); } }}>
          {kinderen.length === 0 ? <p className='bib-leeg'>{tr(p.lang, 'Тека порожня.', 'De map is leeg.')}</p> : (
            <ul>{kinderen.map((k) => <li key={k.instanceId}><ShortcutTegel itemId={k.itemId} lang={p.lang} ctx={p.ctx} donker={p.donker} titleOverride={k.titleOverride} iconOverride={k.iconOverride} persoonlijk={p.persoonlijk} navigeer={p.navigeer} />{p.onUitnemen && <button type='button' className='bib-map-uit' data-werkblad-uitnemen={k.instanceId} onClick={() => p.onUitnemen!(k.instanceId)}>{tr(p.lang, 'Вийняти', 'Eruit halen')}</button>}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
