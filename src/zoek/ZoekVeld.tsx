// /zoek — het zoekveld met autodoploen (specificatie 6.1), gedeeld door de pagina /zoek (groot) en het palet ⌘K (compact).
//   • WAI-ARIA combobox: input[role=combobox] + aria-expanded/-controls/-activedescendant/-autocomplete=list; ul[role=listbox] > li[role=option];
//   • toetsen: ↓/↑ (rond), Home/End (alleen als een optie actief is — anders blijft de cursor in het veld), Enter (actieve optie of de
//     getypte tekst), Escape (lijst dicht; tweede keer: veld leeg), Tab laat de lijst dicht zonder de standaard te blokkeren;
//   • aanraking: mousedown op een optie (vóór blur) kiest; het veld blijft gefocust;
//   • de teller van suggesties wordt één keer per wijziging aangekondigd (role=status, niet bij elke toets).
// Suggesties komen van de ouder (server /zoek/suggesties + eigen geschiedenis); dit onderdeel raadt niets.
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent as RKE, type ReactNode } from 'react';
import { CircleHelp, FileText, History, Languages, LayoutGrid, Search, Sparkles, X, Zap } from 'lucide-react';
import { volgendeIndex } from '../platform/toegankelijk';
import { highlightParts, norm } from './zoek-kern';
import type { Lang } from './zoek-kern';
import type { ZoekSuggestie } from '../../shared/zoek-model';

/** `meta` (bv. «Пошта · 5 хв тому») en `icoon` (type zoekopdracht) zijn alleen voor recente zoekopdrachten van de bovenbalk. */
export type VeldSuggestie = ZoekSuggestie | { soort: 'geschiedenis'; tekst: string; id: string; aantal?: number; label?: { uk: string; nl: string }; meta?: string; icoon?: typeof Search };
export const SUGGESTIE_LABEL: Readonly<Record<VeldSuggestie['soort'], { uk: string; nl: string }>> = Object.freeze({
  aanvulling: { uk: 'Завершення', nl: 'Aanvulling' }, functie: { uk: 'Функція', nl: 'Functie' }, pagina: { uk: 'Сторінка', nl: 'Pagina' }, categorie: { uk: 'Категорія', nl: 'Categorie' },
  correctie: { uk: 'Виправлення', nl: 'Correctie' }, synoniem: { uk: 'Синонім', nl: 'Synoniem' }, geschiedenis: { uk: 'Нещодавній пошук', nl: 'Recente zoekopdracht' },
});
const ICOON: Record<VeldSuggestie['soort'], typeof Search> = { aanvulling: Search, functie: Zap, pagina: FileText, categorie: LayoutGrid, correctie: Sparkles, synoniem: Languages, geschiedenis: History };

export const Hl = ({ text, terms }: { text: string; terms: readonly string[] }) => <>{highlightParts(text, terms).map((p, i) => (p.hit ? <mark key={i}>{p.t}</mark> : <Fragment key={i}>{p.t}</Fragment>))}</>;

export type ZoekVeldProps = {
  lang: Lang; value: string; onChange: (v: string) => void;
  /** Enter zonder keuze, of een gekozen suggestie zonder route: zoeken met deze tekst. */
  onSubmit: (tekst: string) => void;
  /** Een gekozen suggestie (functie/pagina met route, geschiedenisrij, …): de ouder beslist (navigeren of zoeken). true = afgehandeld. */
  onKies?: (s: VeldSuggestie) => boolean | void;
  suggesties: readonly VeldSuggestie[];
  placeholder: string; label: string; groot?: boolean; autoFocus?: boolean; beschrijvingId?: string;
  /** Extra knoppen rechts in het veld (bv. de zoekknop). */
  rechts?: ReactNode;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onEscapeLeeg?: () => void;
  /** Vaste rij onder de lijst (bv. «Wis recente zoekopdrachten»). Zet de lijst dan in een uitklapvenster met die rij. */
  voet?: ReactNode;
};

export default function ZoekVeld({ lang, value, onChange, onSubmit, onKies, suggesties, placeholder, label, groot, autoFocus, beschrijvingId, rechts, inputRef, onEscapeLeeg, voet }: ZoekVeldProps) {
  const uid = useId(); const lb = `${uid}-lb`; const eigenRef = useRef<HTMLInputElement | null>(null); const ref = inputRef || eigenRef;
  const [open, setOpen] = useState(false); const [actief, setActief] = useState(-1);
  const [melding, setMelding] = useState('');
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const toon = open && suggesties.length > 0;
  // Aankondiging: alleen als het AANTAL verandert en de lijst open is (niet bij elke toets).
  const vorigAantal = useRef(-1);
  useEffect(() => {
    if (!toon) { vorigAantal.current = -1; if (melding) setMelding(''); return; }
    if (suggesties.length === vorigAantal.current) return;
    vorigAantal.current = suggesties.length;
    const id = window.setTimeout(() => setMelding(lang === 'uk' ? `Підказок: ${suggesties.length}. Стрілки вгору/вниз — вибір, Enter — пошук.` : `${suggesties.length} suggesties. Pijl omhoog/omlaag kiest, Enter zoekt.`), 400);
    return () => window.clearTimeout(id);
  }, [toon, suggesties.length, lang]);
  useEffect(() => { if (actief >= suggesties.length) setActief(-1); }, [suggesties.length, actief]);
  const kies = (s: VeldSuggestie) => { setOpen(false); setActief(-1); if (onKies && onKies(s) === true) return; onSubmit(s.tekst); };
  const onKey = (e: RKE<HTMLInputElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || ((e.key === 'Home' || e.key === 'End') && toon && actief >= 0)) {
      if (!suggesties.length) return;
      e.preventDefault(); setOpen(true);
      const n = volgendeIndex(e.key, actief, suggesties.length, { rond: true }); if (n !== null) setActief(n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (toon && actief >= 0 && suggesties[actief]) kies(suggesties[actief]); else { setOpen(false); setActief(-1); onSubmit(value); }
    } else if (e.key === 'Escape') {
      if (toon) { e.preventDefault(); e.stopPropagation(); setOpen(false); setActief(-1); }
      else if (value) { e.preventDefault(); e.stopPropagation(); onChange(''); onEscapeLeeg?.(); }
    } else if (e.key === 'Tab') { setOpen(false); setActief(-1); }
  };
  const lijst = (
    <ul id={lb} role='listbox' aria-label={t('Підказки пошуку', 'Zoeksuggesties')} className={voet ? 'zk-pop zk-pop-in-kader' : 'zk-pop'} hidden={!toon}>
      {suggesties.map((s, i) => { const I = ('icoon' in s && s.icoon) || ICOON[s.soort] || CircleHelp; const lbl = s.label && s.label[lang] && s.label[lang] !== s.tekst ? s.label[lang] : SUGGESTIE_LABEL[s.soort][lang]; // label gelijk aan de tekst zegt niets → soort tonen
        return (
          <li key={`${s.soort}:${s.tekst}:${'id' in s ? s.id || '' : ''}`} id={`${uid}-o${i}`} role='option' aria-selected={i === actief} className={`zk-optie${i === actief ? ' is-actief' : ''} soort-${s.soort}`}
            onMouseEnter={() => setActief(i)} onMouseDown={e => { e.preventDefault(); kies(s); }}>
            <I aria-hidden='true' />
            <span className='zk-optie-tekst'><Hl text={s.tekst} terms={norm(value).split(' ')} /></span>
            <span className='zk-optie-soort'>{'meta' in s && s.meta ? s.meta : lbl}{typeof s.aantal === 'number' ? ` · ${s.aantal}` : ''}</span>
          </li>);
      })}
    </ul>);
  return (
    <div className={`zk-veld${groot ? ' is-groot' : ''}`}>
      <label htmlFor={`${uid}-in`} className='zk-sr'>{label}</label>
      <div className='zk-box'>
        <Search aria-hidden='true' className='zk-box-ic' />
        <input id={`${uid}-in`} ref={ref} type='text' inputMode='search' enterKeyHint='search' role='combobox' aria-expanded={toon} aria-controls={lb} aria-autocomplete='list' aria-haspopup='listbox'
          aria-activedescendant={toon && actief >= 0 ? `${uid}-o${actief}` : undefined} aria-describedby={beschrijvingId} autoComplete='off' autoCorrect='off' autoCapitalize='off' spellCheck={false} maxLength={300}
          value={value} placeholder={placeholder} autoFocus={autoFocus} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={e => { onChange(e.target.value); setOpen(true); setActief(-1); }} onKeyDown={onKey} />
        {value && <button type='button' className='knop-icoon zk-wis' aria-label={t('Очистити поле', 'Veld wissen')} onClick={() => { onChange(''); ref.current?.focus(); }}><X aria-hidden='true' /></button>}
        {rechts}
      </div>
      {voet ? <div className='zk-pop-kader' hidden={!open}>{lijst}{voet}</div> : lijst}
      <p role='status' aria-live='polite' className='zk-sr'>{melding}</p>
    </div>);
}
