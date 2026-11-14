// /zoek — het filterpaneel (specificatie §11): bron, type, formaat, taal, datum (presets + eigen periode), minimale
// overeenkomst, stand van de index, sortering. Elke keuze gaat ECHT naar de server (zoek-logica.ts → bouwVraag); de tellers
// komen uit de facets van de server (geen teller = geen getal). Op de computer een vaste kolom rechts; op de telefoon een
// onderblad (role=dialog, aria-modal, Tab blijft binnen, Escape sluit, focus terug naar de knop «Фільтри») — zoals het meldingenpaneel.
import { useEffect, useId, useRef, type KeyboardEvent as RKE } from 'react';
import { X } from 'lucide-react';
import { focusTerug, focusbaar, houdTab } from '../platform/toegankelijk';
import { BRON_NAAM, BRON_STAND_NAAM, type ZoekBron, type ZoekBronStand, type ZoekFacets, type ZoekSoort, type ZoekTaal } from '../../shared/zoek-model';
import { ALLE_BRONNEN, ALLE_FORMATEN, ALLE_SOORTEN, ALLE_TALEN, DATUM_PRESETS, MIN_PERCENTEN, SORTERINGEN, SOORT_NAAM, TAAL_NAAM, aantalFilters, type DatumPreset, type ZoekFilters } from './zoek-logica';
import type { Lang } from './zoek-kern';

const T = {
  uk: { filters: 'Фільтри', reset: 'Очистити', sluit: 'Закрити фільтри', bron: 'Джерела', soort: 'Типи', formaat: 'Формати', taal: 'Мови', alleTalen: 'Усі мови', datum: 'Дата', van: 'Від', tot: 'До', min: 'Мінімальна відповідність', minAll: 'Будь-яка', index: 'Статус індексації', indexAlle: 'Усі джерела', indexKlaar: 'Лише повністю проіндексовані', sorteer: 'Сортування', naZoeken: 'Зʼявляться після пошуку (лічильники з сервера)',
    sort: { relevantie: 'За релевантністю', nieuwste: 'Спочатку нові', oudste: 'Спочатку старі', titel: 'За назвою' }, dates: { any: 'Усі дати', d1: 'Сьогодні', d7: 'Останні 7 днів', d30: 'Останні 30 днів', y1: 'Останній рік', eigen: 'Вибрати період' }, toepassen: 'Показати результати' },
  nl: { filters: 'Filters', reset: 'Wissen', sluit: 'Filters sluiten', bron: 'Bronnen', soort: 'Types', formaat: 'Formaten', taal: 'Talen', alleTalen: 'Alle talen', datum: 'Datum', van: 'Van', tot: 'Tot', min: 'Minimale overeenkomst', minAll: 'Elke', index: 'Stand van de index', indexAlle: 'Alle bronnen', indexKlaar: 'Alleen volledig geïndexeerd', sorteer: 'Sortering', naZoeken: 'Verschijnen na het zoeken (tellers van de server)',
    sort: { relevantie: 'Op relevantie', nieuwste: 'Nieuwste eerst', oudste: 'Oudste eerst', titel: 'Op titel' }, dates: { any: 'Alle datums', d1: 'Vandaag', d7: 'Laatste 7 dagen', d30: 'Laatste 30 dagen', y1: 'Laatste jaar', eigen: 'Periode kiezen' }, toepassen: 'Resultaten tonen' },
};

// data-hulp-vrij='filter|sortering' (zone D, 22.10.2026): src/zoek staat nu in HULP_MAPPEN van tests/eenheid/hulp-register.test.ts;
// dit zijn filters/sorteringen, geen systeemopties — de opties van het indexvenster hebben wél een «?» (zoek.index.*).
// Buiten de render (anders remount bij elke wijziging → de focus van het vinkje gaat verloren).
const Groep = ({ kop, kind, children }: { kop: string; kind: string; children: React.ReactNode }) => <fieldset className={`zk-groep zk-groep-${kind}`}><legend>{kop}</legend>{children}</fieldset>;
const Vink = ({ aan, label, aantal, onChange, disabled, hint }: { aan: boolean; label: string; aantal?: number; onChange: () => void; disabled?: boolean; hint?: string }) => (
  <label className={`zk-vink${disabled ? ' is-uit' : ''}`}><input type='checkbox' data-hulp-vrij='filter' checked={aan} onChange={onChange} disabled={disabled} /><span className='zk-vink-tekst'>{label}{hint && <small className='zk-vink-hint'> · {hint}</small>}</span>{typeof aantal === 'number' && <span className='zk-vink-n'>{aantal}</span>}</label>);

export type FiltersProps = {
  lang: Lang; f: ZoekFilters; setF: (f: ZoekFilters) => void; facets?: ZoekFacets; stand: readonly ZoekBronStand[] | null;
  /** Telefoon: open als onderblad. */
  mobiel: boolean; open: boolean; onClose: () => void; openerRef: React.RefObject<HTMLElement | null>;
};

export default function ZoekFilters({ lang, f, setF, facets, stand, mobiel, open, onClose, openerRef }: FiltersProps) {
  const t = T[lang]; const uid = useId(); const paneel = useRef<HTMLElement | null>(null);
  const n = aantalFilters(f);
  const standVan = (b: ZoekBron) => stand?.find(s => s.bron === b);
  const beschikbaar = (b: ZoekBron) => !stand || standVan(b)?.stand !== 'niet_gekoppeld';
  const tel = (soort: keyof ZoekFacets, k: string) => (facets ? facets[soort][k] ?? 0 : undefined);
  const toggle = <K extends 'bronnen' | 'soorten' | 'formaten' | 'talen'>(k: K, v: string) => { const l = f[k] as string[]; setF({ ...f, [k]: l.includes(v) ? l.filter(y => y !== v) : [...l, v] }); };
  // Onderblad: focus erin bij openen, Tab binnen, terug naar de knop bij sluiten.
  useEffect(() => { if (!mobiel || !open) return; const eerste = focusbaar(paneel.current)[0]; (eerste || paneel.current)?.focus({ preventScroll: true }); return () => { if (!focusTerug(openerRef.current)) document.body.focus(); }; }, [mobiel, open]);
  const onKey = (e: RKE<HTMLElement>) => { if (!mobiel || !open) return; if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; } houdTab(e, focusbaar(paneel.current), { houder: paneel.current }); };
  const inhoud = (
    <>
      <div className='zk-paneel-kop'>
        <h2 id={`${uid}-h`}>{t.filters}{n > 0 && <span className='pil pil-info zk-filter-n'>{n}</span>}</h2>
        {n > 0 && <button type='button' className='knop knop-stil is-klein' onClick={() => setF({ ...f, bronnen: [], soorten: [], formaten: [], talen: [], datum: 'any', van: '', tot: '', minPercent: 0, indexStand: 'alle', sorteer: 'relevantie' })}>{t.reset}</button>}
        {mobiel && <button type='button' className='knop-icoon zk-paneel-sluit' aria-label={t.sluit} onClick={onClose}><X aria-hidden='true' /></button>}
      </div>
      <Groep kop={t.bron} kind='bron'>
        {ALLE_BRONNEN.map(b => { const s = standVan(b); const uit = !beschikbaar(b); return <Vink key={b} aan={f.bronnen.includes(b)} label={BRON_NAAM[b][lang]} aantal={uit ? undefined : tel('bron', b)} onChange={() => toggle('bronnen', b)} disabled={uit} hint={s && s.stand !== 'klaar' ? BRON_STAND_NAAM[s.stand][lang] + (s.stand === 'indexeert' ? ` ${s.voortgang}%` : '') : undefined} />; })}
      </Groep>
      <Groep kop={t.soort} kind='soort'>
        {ALLE_SOORTEN.filter(s => (facets && (facets.soort[s] || 0) > 0) || f.soorten.includes(s)).map(s => <Vink key={s} aan={f.soorten.includes(s as ZoekSoort)} label={SOORT_NAAM[s][lang]} aantal={tel('soort', s)} onChange={() => toggle('soorten', s)} />)}
        {!ALLE_SOORTEN.some(s => (facets && (facets.soort[s] || 0) > 0) || f.soorten.includes(s)) && <p className='zk-groep-leeg'>{facets ? '—' : t.naZoeken}</p>}
      </Groep>
      <Groep kop={t.formaat} kind='formaat'>
        {ALLE_FORMATEN.filter(x => (facets && (facets.formaat[x] || 0) > 0) || f.formaten.includes(x)).map(x => <Vink key={x} aan={f.formaten.includes(x)} label={x.toUpperCase()} aantal={tel('formaat', x)} onChange={() => toggle('formaten', x)} />)}
        {!ALLE_FORMATEN.some(x => (facets && (facets.formaat[x] || 0) > 0) || f.formaten.includes(x)) && <p className='zk-groep-leeg'>{facets ? '—' : t.naZoeken}</p>}
      </Groep>
      <Groep kop={t.taal} kind='taal'>
        <label className='zk-select'><span className='zk-sr'>{t.taal}</span>
          <select data-hulp-vrij='filter' value={f.talen.length === 1 ? f.talen[0] : f.talen.length ? 'meer' : ''} onChange={e => { const v = e.target.value; setF({ ...f, talen: v && v !== 'meer' ? [v as ZoekTaal] : [] }); }}>
            <option value=''>{t.alleTalen}</option>
            {ALLE_TALEN.map(l => <option key={l} value={l}>{TAAL_NAAM[l]}{facets && facets.taal[l] ? ` (${facets.taal[l]})` : ''}</option>)}
            {f.talen.length > 1 && <option value='meer'>{f.talen.map(l => TAAL_NAAM[l]).join(', ')}</option>}
          </select></label>
      </Groep>
      <Groep kop={t.datum} kind='datum'>
        {DATUM_PRESETS.map((d: DatumPreset) => <label key={d} className='zk-vink'><input type='radio' data-hulp-vrij='filter' name={`${uid}-d`} checked={f.datum === d} onChange={() => setF({ ...f, datum: d })} /><span className='zk-vink-tekst'>{t.dates[d]}</span></label>)}
        {f.datum === 'eigen' && <div className='zk-periode'>
          <label><span>{t.van}</span><input type='date' value={f.van} max={f.tot || undefined} onChange={e => setF({ ...f, van: e.target.value })} /></label>
          <label><span>{t.tot}</span><input type='date' value={f.tot} min={f.van || undefined} onChange={e => setF({ ...f, tot: e.target.value })} /></label>
        </div>}
      </Groep>
      <Groep kop={t.min} kind='min'>
        {MIN_PERCENTEN.map(m => <label key={m} className='zk-vink'><input type='radio' data-hulp-vrij='filter' name={`${uid}-m`} checked={f.minPercent === m} onChange={() => setF({ ...f, minPercent: m })} /><span className='zk-vink-tekst'>{m ? `≥ ${m}%` : t.minAll}</span></label>)}
      </Groep>
      <Groep kop={t.index} kind='index'>
        <label className='zk-vink'><input type='radio' data-hulp-vrij='filter' name={`${uid}-i`} checked={f.indexStand === 'alle'} onChange={() => setF({ ...f, indexStand: 'alle' })} /><span className='zk-vink-tekst'>{t.indexAlle}</span></label>
        <label className='zk-vink'><input type='radio' data-hulp-vrij='filter' name={`${uid}-i`} checked={f.indexStand === 'klaar'} onChange={() => setF({ ...f, indexStand: 'klaar' })} /><span className='zk-vink-tekst'>{t.indexKlaar}</span></label>
      </Groep>
      <Groep kop={t.sorteer} kind='sorteer'>
        <label className='zk-select'><span className='zk-sr'>{t.sorteer}</span><select data-hulp-vrij='sortering' value={f.sorteer} onChange={e => setF({ ...f, sorteer: SORTERINGEN.find(s => s === e.target.value) || 'relevantie' })}>{SORTERINGEN.map(s => <option key={s} value={s}>{t.sort[s]}</option>)}</select></label>
      </Groep>
      {mobiel && <div className='zk-paneel-voet'><button type='button' className='knop knop-primair' onClick={onClose}>{t.toepassen}</button></div>}
    </>);
  if (mobiel) {
    if (!open) return null;
    return (
      <>
        <div className='zk-scrim' onClick={onClose} aria-hidden='true' />
        <section ref={paneel} className='zk-paneel is-onderblad' role='dialog' aria-modal='true' aria-labelledby={`${uid}-h`} tabIndex={-1} onKeyDown={onKey} data-zoek-filters='onderblad' data-mq-laag-open='1'>{inhoud}</section>
      </>);
  }
  return <aside ref={paneel as React.RefObject<HTMLElement>} className='zk-paneel kaart' aria-labelledby={`${uid}-h`} data-zoek-filters='kolom'>{inhoud}</aside>;
}
