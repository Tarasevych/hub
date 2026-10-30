// Maand: op de computer een rooster van 6×7 met tot 3 afspraken per dag en «ще N»; op de telefoon cijfers met gekleurde stippen,
// en de afspraken van de gekozen dag als lijst eronder. Pijltjestoetsen bewegen tussen de dagen; Enter opent de dag.
import { useRef, type KeyboardEvent } from 'react';
import { maandRaster, weekDagen, type AgendaItem } from '../../../../shared/agenda-model';
import { agendaSleutel, itemsOpDag, plusDagen } from '../agenda-tijd';
import { fmt, tr, type Lang } from '../tekst';
import GebeurtenisLijst, { GebeurtenisKnop } from './GebeurtenisLijst';

type Props = {
  lang: Lang; datum: string; vandaag: string; items: AgendaItem[]; smal: boolean; kleur: (s: string) => string;
  onKiesDag: (dag: string) => void; onOpenDag: (dag: string) => void; onOpen: (i: AgendaItem, knop: HTMLElement) => void;
};
export default function MaandRooster({ lang, datum, vandaag, items, smal, kleur, onKiesDag, onOpenDag, onOpen }: Props) {
  const [j, m] = datum.split('-').map(Number);
  const raster = maandRaster(j, m);
  const vak = useRef<HTMLDivElement | null>(null);
  const toets = (e: KeyboardEvent<HTMLButtonElement>, dag: string) => {
    const stap = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
    if (!stap) return;
    e.preventDefault();
    const naar = plusDagen(dag, stap);
    onKiesDag(naar);
    requestAnimationFrame(() => vak.current?.querySelector<HTMLButtonElement>(`[data-agenda-dag="${naar}"] .agv-dagnummer`)?.focus());
  };
  return (
    <div className={`agv-maand${smal ? ' is-smal' : ''}`} data-agenda-maand={datum.slice(0, 7)}>
      <div className='agv-maand-rooster' ref={vak} role='grid' aria-label={fmt(lang, datum, { month: 'long', year: 'numeric' })}>
        <div className='agv-maand-rij is-kop' role='row'>
          {weekDagen(raster[0][0]).map((d) => <span key={d} role='columnheader' className='agv-maand-dagnaam'>{fmt(lang, d, { weekday: 'short' })}</span>)}
        </div>
        {raster.map((week) => (
          <div key={week[0]} className='agv-maand-rij' role='row'>
            {week.map((dag) => {
              const lijst = itemsOpDag(items, dag);
              const buiten = dag.slice(5, 7) !== datum.slice(5, 7);
              return (
                <div key={dag} role='gridcell' className='agv-maand-cel' data-agenda-dag={dag} data-agenda-dag-vandaag={dag === vandaag ? '1' : undefined}
                  data-agenda-dag-buiten={buiten ? '1' : undefined} aria-selected={dag === datum}>
                  <button type='button' className='agv-dagnummer' tabIndex={dag === datum ? 0 : -1} onKeyDown={(e) => toets(e, dag)}
                    onClick={() => (smal ? onKiesDag(dag) : onOpenDag(dag))} aria-current={dag === vandaag ? 'date' : undefined}
                    aria-label={`${fmt(lang, dag, { weekday: 'long', day: 'numeric', month: 'long' })}${lijst.length ? `, ${tr(lang, 'подій', 'afspraken')}: ${lijst.length}` : ''}`}>
                    {Number(dag.slice(8))}
                  </button>
                  {smal ? (
                    <span className='agv-stippen' aria-hidden='true'>{lijst.slice(0, 3).map((i) => <i key={i.id} style={{ background: kleur(agendaSleutel(i)) }} />)}</span>
                  ) : (
                    <>
                      {lijst.slice(0, 3).map((i) => <GebeurtenisKnop key={i.id} lang={lang} item={i} kleur={kleur(agendaSleutel(i))} soort='chip' onOpen={onOpen} />)}
                      {lijst.length > 3 ? <button type='button' className='agv-meer' onClick={() => onOpenDag(dag)}>{tr(lang, `ще ${lijst.length - 3}`, `nog ${lijst.length - 3}`)}</button> : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {smal ? (
        <section className='agv-maand-dag' aria-label={fmt(lang, datum, { weekday: 'long', day: 'numeric', month: 'long' })}>
          <h3>{fmt(lang, datum, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          <GebeurtenisLijst lang={lang} items={itemsOpDag(items, datum)} kleur={kleur} onOpen={onOpen} kopjes={false} leeg={tr(lang, 'На цей день подій немає.', 'Op deze dag staat niets.')} />
        </section>
      ) : null}
    </div>
  );
}
