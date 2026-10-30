// Telefoon, «День»: een balk van 7 dagen om snel te wisselen, een kaart met de gekozen dag, en de afspraken als leesbare lijst
// met tijd links en een kleurstreep (geen zeven smalle kolommen tekst).
import { CalendarDays } from 'lucide-react';
import { weekDagen, type AgendaItem } from '../../../../shared/agenda-model';
import { agendaSleutel, itemsOpDag } from '../agenda-tijd';
import { fmt, tijdTekst, titelVan, tr, type Lang } from '../tekst';

type Props = { lang: Lang; datum: string; vandaag: string; items: AgendaItem[]; kleur: (s: string) => string; onKiesDag: (d: string) => void; onOpen: (i: AgendaItem, k: HTMLElement) => void };
export function DagenBalk({ lang, datum, vandaag, items, onKiesDag }: Omit<Props, 'kleur' | 'onOpen'>) {
  return (
    <div className='agv-dagenbalk' role='tablist' aria-label={tr(lang, 'Дні тижня', 'Dagen van de week')}>
      {weekDagen(datum).map((d) => (
        <button key={d} type='button' role='tab' aria-selected={d === datum} aria-current={d === vandaag ? 'date' : undefined} onClick={() => onKiesDag(d)}
          aria-label={fmt(lang, d, { weekday: 'long', day: 'numeric', month: 'long' })} data-agenda-v3-dagknop={d}>
          <small>{fmt(lang, d, { weekday: 'short' })}</small><strong>{Number(d.slice(8))}</strong>
          {itemsOpDag(items, d).length ? <i aria-hidden='true' /> : null}
        </button>
      ))}
    </div>
  );
}
export default function DagTijdlijn({ lang, datum, vandaag, items, kleur, onKiesDag, onOpen }: Props) {
  const lijst = itemsOpDag(items, datum);
  return (
    <div className='agv-dag' data-agenda-dag={datum}>
      <DagenBalk lang={lang} datum={datum} vandaag={vandaag} items={items} onKiesDag={onKiesDag} />
      <div className='agv-dagkaart'>
        <span className='agv-dagkaart-icoon' aria-hidden='true'><CalendarDays /></span>
        <div><h3>{fmt(lang, datum, { weekday: 'long', day: 'numeric', month: 'long' })}</h3><small>{tr(lang, `Подій: ${lijst.length}`, `Afspraken: ${lijst.length}`)}</small></div>
      </div>
      {lijst.length ? (
        <ol className='agv-tijdlijn'>
          {lijst.map((i) => (
            <li key={i.id}>
              <time>{tijdTekst(lang, i).split('–')[0]}</time>
              <button type='button' className='agv-tijdlijn-item' style={{ ['--agv-kleur' as string]: kleur(agendaSleutel(i)) }} onClick={(e) => onOpen(i, e.currentTarget)}
                data-agenda-item={i.id} data-agenda-item-bron={i.bron} data-agenda-item-schrijfbaar={String(i.schrijfbaar)}>
                <strong>{titelVan(lang, i)}</strong>
                <small>{[i.agendaNaam || i.bron, i.locatie, tijdTekst(lang, i)].filter(Boolean).join(' · ')}{i.schrijfbaar ? '' : ` · ${tr(lang, 'лише читання', 'alleen lezen')}`}</small>
              </button>
            </li>
          ))}
        </ol>
      ) : <p className='agv-leeg-regel'>{tr(lang, 'На цей день подій немає.', 'Op deze dag staat niets.')}</p>}
    </div>
  );
}
