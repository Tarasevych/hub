// Lijst van afspraken, gegroepeerd per dag (weergave «Список» en de dagenlijst onder de maand op de telefoon).
// GebeurtenisKnop is het ene klikbare blokje dat overal gebruikt wordt (kleurstreep + naam van de agenda, nooit alleen kleur).
import { Lock, Repeat } from 'lucide-react';
import type { AgendaItem } from '../../../../shared/agenda-model';
import { agendaSleutel, plaatselijkeDag } from '../agenda-tijd';
import { fmt, tijdTekst, titelVan, tr, type Lang } from '../tekst';

export function GebeurtenisKnop({ lang, item, kleur, soort, onOpen, stijl }: { lang: Lang; item: AgendaItem; kleur: string; soort: 'chip' | 'regel' | 'blok'; onOpen: (i: AgendaItem, knop: HTMLElement) => void; stijl?: React.CSSProperties }) {
  return (
    <button type='button' className={`agv-item is-${soort}`} style={{ ['--agv-kleur' as string]: kleur, ...stijl }}
      data-agenda-item={item.id} data-agenda-item-bron={item.bron} data-agenda-item-schrijfbaar={String(item.schrijfbaar)}
      onClick={(e) => onOpen(item, e.currentTarget)} aria-label={`${titelVan(lang, item)}, ${tijdTekst(lang, item)}, ${item.agendaNaam || item.bron}${item.schrijfbaar ? '' : `, ${tr(lang, 'лише читання', 'alleen lezen')}`}`}>
      {soort !== 'chip' ? <time className='agv-item-tijd'>{tijdTekst(lang, item)}</time> : item.heleDag ? null : <time className='agv-item-tijd'>{tijdTekst(lang, item).split('–')[0]}</time>}
      <span className='agv-item-titel'>{titelVan(lang, item)}</span>
      {soort !== 'chip' ? (
        <small className='agv-item-meta'>
          {item.agendaNaam || item.bron}{item.locatie ? ` · ${item.locatie}` : ''}
          {item.herhaling ? <Repeat aria-hidden='true' /> : null}{!item.schrijfbaar ? <Lock aria-hidden='true' /> : null}
        </small>
      ) : null}
    </button>
  );
}

type Props = { lang: Lang; items: AgendaItem[]; kleur: (sleutel: string) => string; onOpen: (i: AgendaItem, knop: HTMLElement) => void; leeg: string; kopjes?: boolean };
export default function GebeurtenisLijst({ lang, items, kleur, onOpen, leeg, kopjes = true }: Props) {
  if (!items.length) return <p className='agv-leeg-regel'>{leeg}</p>;
  const groepen = new Map<string, AgendaItem[]>();
  for (const i of items) { const d = i.heleDag || /^\d{4}-\d{2}-\d{2}$/.test(i.begin) || Number.isNaN(new Date(i.begin).getTime()) ? String(i.begin).slice(0, 10) : plaatselijkeDag(new Date(i.begin)); groepen.set(d, [...(groepen.get(d) || []), i]); }
  return (
    <div className='agv-lijst' data-agenda-lijst='1'>
      {[...groepen].map(([dag, lijst]) => (
        <section key={dag} className='agv-lijst-groep' aria-label={fmt(lang, dag, { weekday: 'long', day: 'numeric', month: 'long' })}>
          {kopjes ? <h3>{fmt(lang, dag, { weekday: 'long', day: 'numeric', month: 'long' })}</h3> : null}
          <ul>{lijst.map((i) => <li key={i.id}><GebeurtenisKnop lang={lang} item={i} kleur={kleur(agendaSleutel(i))} soort='regel' onOpen={onOpen} /></li>)}</ul>
        </section>
      ))}
    </div>
  );
}
