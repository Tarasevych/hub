// De twee paneeltjes van de technische strook (zoekronde 02.11.2026, herzien 03.11.2026):
//  • StrookInstelPaneel: het instellingen-icoon op de strook → modus, grootte, vorm van de knoppen, en de knoppen met hun volgorde
//    (aanvinken, slepen aan de greep, of ↑/↓);
//  • StrookKnopMenu: rechtermuisknop (of lang tikken, of Shift+F10) op een knop → de eigen opties van die knop, plaats, vorm, instellingen
//    (inhoud: strook-menu.ts).
// 03.11.2026 (eigenaar: «вигляд має відповідати стилю вікон сайту»): kop, randen, schaduw en knoppen zoals de vensters van het platform
// (src/platform/vensters.css): vlak var(--panel), kop var(--surface) met titel en sluitknop 40×40, focusring var(--venster-actief).
// Beide zijn geportaleerd naar body; de *Inhoud-delen hebben geen portaal en geen document nodig (getest met react-dom/server).
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent as RKE } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Check, GripVertical, RotateCcw, X } from 'lucide-react';
import { GROOTTE_NAMEN, LABEL_NAMEN, MODUS_NAMEN, MODUS_UITLEG, STROOK_GROOTTES, STROOK_LABELS, STROOK_MODI, STROOK_NAMEN, STROOK_STANDAARD, dropPlek, metModus, paneelLijst, verplaats, zetAan, zetOp, type StrookGrootte, type StrookLabel, type StrookModus, type StrookVoorkeur } from './strook-voorkeur';
import { groepeer, type KnopMenuItem } from './strook-menu';

export type { KnopMenuItem } from './strook-menu';

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

type InhoudProps = { uk: boolean; voorkeur: StrookVoorkeur; onWijzig: (v: StrookVoorkeur) => void; onSluit: () => void };

/** Inhoud van het instellingenpaneel (zonder portaal). */
export function StrookInstelInhoud({ uk, voorkeur, onWijzig, onSluit }: InhoudProps) {
  const t = (a: string, b: string) => (uk ? a : b);
  const [sleep, setSleep] = useState<string | null>(null);
  const [doel, setDoel] = useState<{ id: string; na: boolean } | null>(null);
  const lijst = paneelLijst(voorkeur);
  const overDoel = (e: DragEvent<HTMLLIElement>, id: string) => {
    if (!sleep) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const na = e.clientY > r.top + r.height / 2;
    if (!doel || doel.id !== id || doel.na !== na) setDoel({ id, na });
  };
  const losOp = (id: string) => {
    if (!sleep || !doel) return;
    const opStrook = voorkeur.knoppen.includes(id);
    // Op een knop van de strook: op die plek. Op een knop die er niet op staat: de gesleepte knop gaat ervan af (achteraan de rest).
    if (opStrook) { const p = dropPlek(voorkeur.knoppen, sleep, id, doel.na); if (p !== null) onWijzig(zetOp(voorkeur, sleep, p)); }
    else if (voorkeur.knoppen.includes(sleep)) onWijzig(zetAan(voorkeur, sleep, false));
  };
  const stopSlepen = () => { setSleep(null); setDoel(null); };
  return (
    <>
      <header className='tech-strook-kop'>
        <strong className='tech-strook-titel'>{t('Технічна смуга', 'Technische strook')}</strong>
        <button type='button' className='tech-strook-sluit' aria-label={t('Закрити', 'Sluiten')} title={t('Закрити', 'Sluiten')} onClick={onSluit}><X aria-hidden='true' /></button>
      </header>
      <div className='tech-strook-romp'>
        <fieldset className='tech-strook-groep'>
          <legend>{t('Вигляд', 'Weergave')}</legend>
          <div className='tech-strook-rij'><span className='tech-strook-rij-kop'>{t('Режим', 'Modus')}</span>
            <Keuze uk={uk} label={t('Режим', 'Modus')} opties={STROOK_MODI} waarde={voorkeur.modus} naam={(m: StrookModus) => MODUS_NAMEN[m]} onKies={m => onWijzig(metModus(voorkeur, m))} />
            <small className='tech-strook-uitleg' data-strook-modus-uitleg=''>{L(uk, MODUS_UITLEG[voorkeur.modus])}</small></div>
          <div className='tech-strook-rij'><span className='tech-strook-rij-kop'>{t('Розмір', 'Grootte')}</span>
            <Keuze uk={uk} label={t('Розмір', 'Grootte')} opties={STROOK_GROOTTES} waarde={voorkeur.grootte} naam={(g: StrookGrootte) => GROOTTE_NAMEN[g]} onKies={g => onWijzig({ ...voorkeur, grootte: g })} /></div>
          <div className='tech-strook-rij'><span className='tech-strook-rij-kop'>{t('Кнопки', 'Knoppen')}</span>
            <Keuze uk={uk} label={t('Вигляд кнопок', 'Vorm van de knoppen')} opties={STROOK_LABELS} waarde={voorkeur.label} naam={(l: StrookLabel) => LABEL_NAMEN[l]} onKies={l => onWijzig({ ...voorkeur, label: l })} /></div>
        </fieldset>
        <fieldset className='tech-strook-groep'>
          <legend>{t('Кнопки на смузі та їх порядок', 'Knoppen op de strook en hun volgorde')}</legend>
          <ol className='tech-strook-lijst' onDragEnd={stopSlepen}>
            {lijst.map(r => {
              const pos = voorkeur.knoppen.indexOf(r.id);
              const naam = L(uk, STROOK_NAMEN[r.id]);
              const klasse = [r.aan ? '' : 'is-uit', sleep === r.id ? 'is-sleept' : '', doel?.id === r.id ? (doel.na ? 'is-doel-na' : 'is-doel-voor') : ''].filter(Boolean).join(' ');
              return (
                <li key={r.id} className={klasse || undefined} data-strook-rij={r.id} draggable
                  onDragStart={(e) => { setSleep(r.id); try { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; } catch { /* oude browser */ } }}
                  onDragOver={(e) => overDoel(e, r.id)} onDragLeave={() => { if (doel?.id === r.id) setDoel(null); }}
                  onDrop={(e) => { e.preventDefault(); losOp(r.id); stopSlepen(); }}>
                  <span className='tech-strook-greep' aria-hidden='true' title={t('Перетягніть, щоб змінити порядок', 'Sleep om de volgorde te wijzigen')}><GripVertical /></span>
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
          <small className='tech-strook-uitleg'>{t('Порядок можна змінити й просто на смузі: перетягніть кнопку. Правий клік на кнопці — її додаткові дії.', 'De volgorde kan ook op de strook zelf: sleep een knop. Rechtsklikken op een knop toont zijn extra opties.')}</small>
        </fieldset>
        <div className='tech-strook-voet'>
          <button type='button' className='tech-strook-reset' onClick={() => onWijzig({ ...STROOK_STANDAARD, knoppen: [...STROOK_STANDAARD.knoppen] })}><RotateCcw aria-hidden='true' />{t('Типові налаштування', 'Standaard herstellen')}</button>
          <small>{t('Зберігається на цьому пристрої.', 'Onthouden op dit apparaat.')}</small>
        </div>
      </div>
    </>
  );
}

type InstelProps = InhoudProps & { top: number };

export function StrookInstelPaneel({ uk, voorkeur, onWijzig, top, onSluit }: InstelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const t = (a: string, b: string) => (uk ? a : b);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('.tech-strook-romp button, .tech-strook-romp input')?.focus({ preventScroll: true }); }, []);
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
  return createPortal(
    <div ref={ref} className='tech-strook-paneel' role='dialog' aria-label={t('Налаштування технічної смуги', 'Instellingen van de technische strook')} style={{ top }} data-tech-strook-paneel=''>
      <StrookInstelInhoud uk={uk} voorkeur={voorkeur} onWijzig={onWijzig} onSluit={onSluit} />
    </div>,
    document.body);
}

/** Inhoud van het snelmenu (zonder portaal): blokken met een kop; keuzes als menuitemradio met een vinkje. */
export function StrookKnopMenuInhoud({ items, onSluit }: { items: KnopMenuItem[]; onSluit: () => void }) {
  return (
    <>
      {groepeer(items).map((g, gi) => (
        <div key={`${gi}-${g.kop}`} className='tech-strook-menu-groep' role='group' aria-label={g.kop || undefined}>
          {g.kop ? <span className='tech-strook-menu-kop' aria-hidden='true'>{g.kop}</span> : null}
          {g.items.map((it) => (
            <button key={it.label} type='button' role={it.gekozen === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={it.gekozen === undefined ? undefined : it.gekozen}
              className={it.gekozen ? 'is-gekozen' : undefined} disabled={it.disabled} onClick={() => { it.onKies(); onSluit(); }}>
              <span className='tech-strook-menu-vink' aria-hidden='true'>{it.gekozen ? <Check /> : null}</span>{it.label}
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

/** Snelmenu van één knop: pijltjes ↑↓ (Home/End) tussen de opties, Enter/Spatie kiest, Escape of klik ernaast sluit. */
export function StrookKnopMenu({ label, items, x, y, onSluit, terug }: { label: string; items: KnopMenuItem[]; x: number; y: number; onSluit: () => void; /** Escape: de focus terug naar deze knop. */ terug?: HTMLElement | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [plek, setPlek] = useState<{ left: number; top: number }>({ left: x, top: y });
  useEffect(() => {
    // Binnen het scherm houden met de echte maat van het menu (eerst op de klikplek tekenen, dan meten).
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPlek({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [x, y]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onSluit(); terug?.focus({ preventScroll: true }); } };
    const buiten = (e: Event) => { const x2 = e.target as Node | null; if (x2 && !ref.current?.contains(x2)) onSluit(); };
    document.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', buiten);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', buiten); };
  }, [onSluit, terug]);
  const toets = (e: RKE<HTMLDivElement>) => {
    if (e.key === 'Tab') { e.preventDefault(); onSluit(); terug?.focus({ preventScroll: true }); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const knoppen = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!knoppen.length) return;
    e.preventDefault();
    const i = knoppen.indexOf(document.activeElement as HTMLButtonElement);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? knoppen.length - 1 : e.key === 'ArrowDown' ? (i + 1) % knoppen.length : (i <= 0 ? knoppen.length - 1 : i - 1);
    knoppen[n].focus();
  };
  return createPortal(
    <div ref={ref} className='tech-strook-menu' role='menu' aria-label={label} style={{ left: plek.left, top: plek.top }} onKeyDown={toets} onContextMenu={(e) => e.preventDefault()}>
      <StrookKnopMenuInhoud items={items} onSluit={onSluit} />
    </div>,
    document.body);
}
