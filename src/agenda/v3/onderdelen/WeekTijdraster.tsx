// Week (7 kolommen) of dag (1 kolom) op de computer: een echt uurraster 00–24 met afspraken op hun plek (hoogte = duur),
// naast elkaar bij overlap, een rij «увесь день» bovenaan en een lijn voor «nu». Opent rond 07:00 of bij de eerste afspraak.
import { useEffect, useRef, useState } from 'react';
import type { AgendaItem } from '../../../../shared/agenda-model';
import { agendaSleutel, heleDagItems, tijdblokken } from '../agenda-tijd';
import { fmt, tr, type Lang } from '../tekst';
import { GebeurtenisKnop } from './GebeurtenisLijst';

const UUR_PX = 48;
type Props = { lang: Lang; dagen: string[]; vandaag: string; items: AgendaItem[]; kleur: (s: string) => string; onOpen: (i: AgendaItem, knop: HTMLElement) => void; onNieuw: (dag: string, uur: number) => void; onKiesDag: (dag: string) => void };
export default function WeekTijdraster({ lang, dagen, vandaag, items, kleur, onOpen, onNieuw, onKiesDag }: Props) {
  const vak = useRef<HTMLDivElement | null>(null);
  const [nu, setNu] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNu(new Date()), 60000); return () => window.clearInterval(t); }, []);
  useEffect(() => {
    const eerste = Math.min(7 * 60, ...dagen.flatMap((d) => tijdblokken(items, d).map((b) => b.boven)));
    if (vak.current) vak.current.scrollTop = Math.max(0, (eerste / 60 - 0.5) * UUR_PX);
  }, [dagen.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const nuMin = nu.getHours() * 60 + nu.getMinutes();
  const heleDag = dagen.map((d) => heleDagItems(items, d));
  return (
    <div className={`agv-raster${dagen.length === 1 ? ' is-dag' : ''}`} data-agenda-week={dagen.length === 7 ? dagen[0] : undefined} data-agenda-dagraster={dagen.length === 1 ? dagen[0] : undefined}
      style={{ ['--agv-kolommen' as string]: dagen.length, ['--agv-uur' as string]: `${UUR_PX}px` }}>
      <div className='agv-raster-kop'>
        <span />
        {dagen.map((d) => (
          <button key={d} type='button' className='agv-raster-dag' aria-current={d === vandaag ? 'date' : undefined} onClick={() => onKiesDag(d)}>
            <small>{fmt(lang, d, { weekday: 'short' })}</small><strong>{Number(d.slice(8))}</strong>
          </button>
        ))}
      </div>
      {heleDag.some((l) => l.length) ? (
        <div className='agv-raster-heledag'>
          <small>{tr(lang, 'увесь день', 'hele dag')}</small>
          {heleDag.map((l, i) => <div key={dagen[i]}>{l.map((it) => <GebeurtenisKnop key={it.id} lang={lang} item={it} kleur={kleur(agendaSleutel(it))} soort='chip' onOpen={onOpen} />)}</div>)}
        </div>
      ) : null}
      <div className='agv-raster-vak' ref={vak} tabIndex={-1}>
        <div className='agv-raster-binnen' style={{ height: 24 * UUR_PX }}>
          <div className='agv-uren' aria-hidden='true'>{Array.from({ length: 24 }, (_, u) => <span key={u} style={{ top: u * UUR_PX }}>{u ? `${String(u).padStart(2, '0')}:00` : ''}</span>)}</div>
          {dagen.map((d) => (
            <div key={d} className='agv-raster-kolom' data-agenda-dag={d} data-agenda-dag-vandaag={d === vandaag ? '1' : undefined}>
              {Array.from({ length: 24 }, (_, u) => (
                <button key={u} type='button' className='agv-uurvak' style={{ top: u * UUR_PX, height: UUR_PX }} tabIndex={-1}
                  aria-label={`${tr(lang, 'Нова подія', 'Nieuwe afspraak')} ${fmt(lang, d, { day: 'numeric', month: 'long' })} ${String(u).padStart(2, '0')}:00`} onClick={() => onNieuw(d, u)} />
              ))}
              {tijdblokken(items, d).map((b) => (
                <GebeurtenisKnop key={b.item.id} lang={lang} item={b.item} kleur={kleur(agendaSleutel(b.item))} soort='blok' onOpen={onOpen}
                  stijl={{ top: (b.boven / 60) * UUR_PX, height: Math.max(22, (b.hoogte / 60) * UUR_PX - 2), left: `calc(${(b.baan / b.banen) * 100}% + 2px)`, width: `calc(${100 / b.banen}% - 4px)` }} />
              ))}
              {d === vandaag ? <i className='agv-nu' style={{ top: (nuMin / 60) * UUR_PX }} aria-hidden='true' /> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
