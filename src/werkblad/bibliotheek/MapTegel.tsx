// Map op het werkblad (kind 'folder'): één niveau diep. Klik/Enter opent een popover met de snelkoppelingen; Escape sluit
// en zet de focus terug. Mappen in mappen bestaan niet (WERKBLAD_V3_LIMIETEN.maxMapNiveaus = 1): kinderen van kind 'folder' worden genegeerd.
import { useEffect, useId, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
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
  /** Mapnaam op het werkblad hernoemen (max. 60 tekens zonder <>). */
  onHernoem?: (instanceId: string, nieuweTitel: string) => void;
  /** Verhoogt wanneer het contextmenu «Перейменувати» voor deze map vraagt. */
  hernoemTrigger?: number;
};

export function MapTegel(p: MapTegelProps) {
  const [open, setOpen] = useState(false);
  const [hernoemen, setHernoemen] = useState(false);
  const [conceptNaam, setConceptNaam] = useState('');
  const knop = useRef<HTMLButtonElement>(null);
  const paneel = useRef<HTMLDivElement>(null);
  const invoerRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const naam = p.map.titleOverride || tr(p.lang, 'Тека', 'Map');
  const kinderen = p.kinderen.filter((k) => k.kind === 'shortcut');

  useEffect(() => {
    if (!p.hernoemTrigger || !p.onHernoem) return;
    setConceptNaam(naam);
    setOpen(true);
    setHernoemen(true);
  }, [p.hernoemTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hernoemen) {
      invoerRef.current?.focus();
      invoerRef.current?.select();
      return;
    }
    if (!open) return;
    paneel.current?.querySelector<HTMLElement>('button')?.focus();
  }, [open, hernoemen]);

  useEffect(() => {
    if (!open) return;
    const weg = (e: PointerEvent) => {
      if (!paneel.current?.contains(e.target as Node) && !knop.current?.contains(e.target as Node)) {
        setHernoemen(false);
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', weg);
    return () => document.removeEventListener('pointerdown', weg);
  }, [open]);

  const startHernoem = () => {
    setConceptNaam(naam);
    setHernoemen(true);
  };

  const bevestigHernoem = () => {
    const schoon = conceptNaam.replace(/[<>]/g, '').trim().slice(0, 60);
    setHernoemen(false);
    if (schoon && schoon !== naam && p.onHernoem) {
      p.onHernoem(p.map.instanceId, schoon);
    }
  };

  return (
    <div className='bib-map'>
      <button ref={knop} type='button' className='bib-tegel' aria-expanded={open} aria-controls={id} onClick={() => !p.instellen && setOpen((o) => !o)}
        aria-label={tr(p.lang, `Тека «${naam}», елементів: ${kinderen.length}`, `Map «${naam}», items: ${kinderen.length}`)} data-werkblad-map={p.map.instanceId} title={naam}>
        <span className='bib-tegel-icoon bib-map-icoon'>{kinderen.length ? kinderen.slice(0, 4).map((k) => <RegisterIcoon key={k.instanceId} icoon={k.iconOverride || registerItem(k.itemId, p.persoonlijk)?.icoon || 'dot'} />) : <RegisterIcoon icoon={p.map.iconOverride || 'folder'} />}</span>
        <span className='bib-tegel-naam'>{naam}</span>
      </button>
      {open && (
        <div ref={paneel} id={id} className='bib-map-paneel' role='dialog' aria-label={naam} onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            if (hernoemen) { setHernoemen(false); return; }
            setOpen(false);
            knop.current?.focus();
          }
        }}>
          <div className='bib-map-kop'>
            {hernoemen && p.onHernoem ? (
              <form className='bib-map-hernoem' onSubmit={(e) => { e.preventDefault(); bevestigHernoem(); }}>
                <input
                  ref={invoerRef}
                  type='text'
                  maxLength={60}
                  value={conceptNaam}
                  aria-label={tr(p.lang, 'Нова назва теки', 'Nieuwe naam van de map')}
                  data-werkblad-map-invoer={p.map.instanceId}
                  onChange={(e) => setConceptNaam(e.target.value.replace(/[<>]/g, ''))}
                />
                <button type='button' className='bib-ikoonknop' aria-label={tr(p.lang, 'Зберегти назву теки', 'Mapnaam opslaan')} onClick={bevestigHernoem}><Check aria-hidden='true' /></button>
                <button type='button' className='bib-ikoonknop' aria-label={tr(p.lang, 'Скасувати перейменування', 'Hernoemen annuleren')} onClick={() => setHernoemen(false)}><X aria-hidden='true' /></button>
              </form>
            ) : (
              <>
                <strong className='bib-map-titel'>{naam}</strong>
                {p.onHernoem ? (
                  <button type='button' className='bib-ikoonknop' data-werkblad-map-hernoem={p.map.instanceId}
                    aria-label={tr(p.lang, `Перейменувати теку «${naam}»`, `Map «${naam}» hernoemen`)}
                    title={tr(p.lang, 'Перейменувати теку', 'Map hernoemen')}
                    onClick={startHernoem}>
                    <Pencil aria-hidden='true' />
                  </button>
                ) : null}
              </>
            )}
          </div>
          {kinderen.length === 0 ? <p className='bib-leeg'>{tr(p.lang, 'Тека порожня.', 'De map is leeg.')}</p> : (
            <ul>{kinderen.map((k) => <li key={k.instanceId}><ShortcutTegel itemId={k.itemId} lang={p.lang} ctx={p.ctx} donker={p.donker} titleOverride={k.titleOverride} iconOverride={k.iconOverride} persoonlijk={p.persoonlijk} navigeer={p.navigeer} />{p.onUitnemen && <button type='button' className='bib-map-uit' data-werkblad-uitnemen={k.instanceId} onClick={() => p.onUitnemen!(k.instanceId)}>{tr(p.lang, 'Вийняти', 'Eruit halen')}</button>}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
