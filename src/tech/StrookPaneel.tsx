// De twee paneeltjes van de technische strook (zoekronde 02.11.2026):
//  • StrookInstelPaneel: het instellingen-icoon op de strook → modus, grootte, tekst bij de knoppen, en de knoppen met hun volgorde;
//  • StrookKnopMenu: rechtermuisknop (of lang tikken op de telefoon) op een knop → links/rechts, van de strook halen, instellingen.
// Beide zijn geportaleerd naar body, omdat de strook overflow:hidden heeft en de knoppen anders worden afgesneden.
import { useEffect, useRef, type KeyboardEvent as RKE } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, RotateCcw, X } from 'lucide-react';
import { GROOTTE_NAMEN, LABEL_NAMEN, MODUS_NAMEN, STROOK_NAMEN, STROOK_STANDAARD, paneelLijst, verplaats, zetAan, type StrookGrootte, type StrookLabel, type StrookModus, type StrookVoorkeur } from './strook-voorkeur';

const L = (uk: boolean, m: { uk: string; nl: string } | undefined) => (m ? (uk ? m.uk : m.nl) : '');

/** Eén rij met vaste keuzes (segmenten), toegankelijk als radiogroep. */
function Keuze<T extends string>({ uk, label, opties, waarde, naam, onKies }: { uk: boolean; label: string; opties: readonly T[]; waarde: T; naam: (v: T) => { uk: string; nl: string }; onKies: (v: T) => void }) {
  return (
    <div className='tech-strook-keuze' role='radiogroup' aria-label={label}>
      {opties.map(v => (
        <button key={v} type='button' role='radio' aria-checked={v === waarde} className={`tech-strook-optie${v === waarde ? ' is-gekozen' : ''}`} onClick={() => onKies(v)}>{L(uk, naam(v))}</button>
      ))}
    </div>
  );
}

type InstelProps = { uk: boolean; voorkeur: StrookVoorkeur; onWijzig: (v: StrookVoorkeur) => void; top: number; onSluit: () => void };

export function StrookInstelPaneel({ uk, voorkeur, onWijzig, top, onSluit }: InstelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const t = (a: string, b: string) => (uk ? a : b);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    // Escape en klik buiten sluiten het paneel. Het instellingen-icoon zelf telt niet als «buiten» (dat schakelt het paneel zelf).
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onSluit(); } };
    const buiten = (e: Event) => {
      const x = e.target as Element | null;
      if (!x || ref.current?.contains(x) || x.closest?.('[data-strook-instel-knop]')) return;
      onSluit();
    };
    document.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', buiten);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', buiten); };
  }, [onSluit]);

  const lijst = paneelLijst(voorkeur);
  return createPortal(
    <div ref={ref} className='tech-strook-paneel' role='dialog' aria-label={t('Налаштування технічної смуги', 'Instellingen van de technische strook')} style={{ top }} data-tech-strook-paneel=''>
      <header className='tech-strook-kop'>
        <strong>{t('Технічна смуга', 'Technische strook')}</strong>
        <button type='button' className='tech-strook-sluit' aria-label={t('Закрити', 'Sluiten')} title={t('Закрити', 'Sluiten')} onClick={onSluit}><X aria-hidden='true' /></button>
      </header>
      <fieldset className='tech-strook-groep'>
        <legend>{t('Вигляд', 'Weergave')}</legend>
        <div className='tech-strook-rij'><span className='tech-strook-rij-kop'>{t('Режим', 'Modus')}</span>
          <Keuze uk={uk} label={t('Режим', 'Modus')} opties={['uitgeklapt', 'ingeklapt', 'auto'] as const} waarde={voorkeur.modus} naam={(m: StrookModus) => MODUS_NAMEN[m]} onKies={m => onWijzig({ ...voorkeur, modus: m })} /></div>
        <div className='tech-strook-rij'><span className='tech-strook-rij-kop'>{t('Розмір', 'Grootte')}</span>
          <Keuze uk={uk} label={t('Розмір', 'Grootte')} opties={['klein', 'middel', 'groot'] as const} waarde={voorkeur.grootte} naam={(g: StrookGrootte) => GROOTTE_NAMEN[g]} onKies={g => onWijzig({ ...voorkeur, grootte: g })} /></div>
        <div className='tech-strook-rij'><span className='tech-strook-rij-kop'>{t('Текст', 'Tekst')}</span>
          <Keuze uk={uk} label={t('Текст', 'Tekst')} opties={['iconen', 'beide', 'tekst'] as const} waarde={voorkeur.label} naam={(l: StrookLabel) => LABEL_NAMEN[l]} onKies={l => onWijzig({ ...voorkeur, label: l })} /></div>
      </fieldset>
      <fieldset className='tech-strook-groep'>
        <legend>{t('Кнопки на смузі та їх порядок', 'Knoppen op de strook en hun volgorde')}</legend>
        <ol className='tech-strook-lijst'>
          {lijst.map(r => {
            const pos = voorkeur.knoppen.indexOf(r.id);
            const naam = L(uk, STROOK_NAMEN[r.id]);
            return (
              <li key={r.id} className={r.aan ? undefined : 'is-uit'}>
                <label className='tech-strook-vink'>
                  <input type='checkbox' checked={r.aan} onChange={e => onWijzig(zetAan(voorkeur, r.id, e.target.checked))} />
                  <span>{naam}</span>
                </label>
                <span className='tech-strook-pijlen'>
                  <button type='button' disabled={!r.aan || pos <= 0} aria-label={t(`Вище: ${naam}`, `Omhoog: ${naam}`)} title={t('Вище', 'Omhoog')} onClick={() => onWijzig(verplaats(voorkeur, r.id, -1))}><ArrowUp aria-hidden='true' /></button>
                  <button type='button' disabled={!r.aan || pos < 0 || pos >= voorkeur.knoppen.length - 1} aria-label={t(`Нижче: ${naam}`, `Omlaag: ${naam}`)} title={t('Нижче', 'Omlaag')} onClick={() => onWijzig(verplaats(voorkeur, r.id, 1))}><ArrowDown aria-hidden='true' /></button>
                </span>
              </li>);
          })}
        </ol>
      </fieldset>
      <div className='tech-strook-voet'>
        <button type='button' className='tech-strook-reset' onClick={() => onWijzig({ ...STROOK_STANDAARD, knoppen: [...STROOK_STANDAARD.knoppen] })}><RotateCcw aria-hidden='true' />{t('Типові налаштування', 'Standaard herstellen')}</button>
        <small>{t('Зберігається на цьому пристрої.', 'Onthouden op dit apparaat.')}</small>
      </div>
    </div>,
    document.body);
}

export type KnopMenuItem = { label: string; disabled?: boolean; onKies: () => void };

/** Snelmenu van één knop: pijltjes ↑↓ tussen de opties, Enter/Spatie kiest, Escape of klik ernaast sluit. */
export function StrookKnopMenu({ label, items, x, y, onSluit }: { label: string; items: KnopMenuItem[]; x: number; y: number; onSluit: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onSluit(); } };
    const buiten = (e: Event) => { const x2 = e.target as Node | null; if (x2 && !ref.current?.contains(x2)) onSluit(); };
    document.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', buiten);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', buiten); };
  }, [onSluit]);
  const toets = (e: RKE<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const knoppen = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!knoppen.length) return;
    e.preventDefault();
    const i = knoppen.indexOf(document.activeElement as HTMLButtonElement);
    const n = e.key === 'ArrowDown' ? (i + 1) % knoppen.length : (i <= 0 ? knoppen.length - 1 : i - 1);
    knoppen[n].focus();
  };
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const links = Math.max(8, Math.min(x, vw - 248));
  const boven = Math.max(8, Math.min(y, vh - 40 - 24 * items.length));
  return createPortal(
    <div ref={ref} className='tech-strook-menu' role='menu' aria-label={label} style={{ left: links, top: boven }} onKeyDown={toets}>
      {items.map(it => (
        <button key={it.label} type='button' role='menuitem' disabled={it.disabled} onClick={() => { it.onKies(); onSluit(); }}>{it.label}</button>
      ))}
    </div>,
    document.body);
}
