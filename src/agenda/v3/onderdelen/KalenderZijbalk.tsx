// Zijbalk (computer): «Нова подія», minikalender en «Мої календарі» met aan/uit per agenda. Kleur staat altijd naast de naam.
import { ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react';
import { maandRaster, weekDagen } from '../../../../shared/agenda-model';
import { fmt, tr, type Lang } from '../tekst';


export type KalenderRegel = { sleutel: string; naam: string; kleur: string; alleenLezen: boolean; bron: string };

export function MiniKalender({ lang, datum, vandaag, metPunt, onKies }: { lang: Lang; datum: string; vandaag: string; metPunt: (dag: string) => boolean; onKies: (dag: string) => void }) {
  const [j, m] = datum.split('-').map(Number);
  const raster = maandRaster(j, m);
  const maandTekst = fmt(lang, `${datum.slice(0, 7)}-15`, { month: 'long', year: 'numeric' });
  const verschuifMaand = (r: number) => { const d = new Date(Date.UTC(j, m - 1 + r, 1, 12)); onKies(d.toISOString().slice(0, 10)); };
  return (
    <div className='agv-mini' aria-label={tr(lang, 'Мінікалендар', 'Minikalender')} role='group'>
      <div className='agv-mini-kop'>
        <strong>{maandTekst.charAt(0).toUpperCase() + maandTekst.slice(1)}</strong>
        <span>
          <button type='button' className='agv-icoonknop is-klein' onClick={() => verschuifMaand(-1)} aria-label={tr(lang, 'Попередній місяць', 'Vorige maand')}><ChevronLeft aria-hidden='true' /></button>
          <button type='button' className='agv-icoonknop is-klein' onClick={() => verschuifMaand(1)} aria-label={tr(lang, 'Наступний місяць', 'Volgende maand')}><ChevronRight aria-hidden='true' /></button>
        </span>
      </div>
      <div className='agv-mini-rooster'>
        {weekDagen(raster[0][0]).map((d) => <span key={`k${d}`} className='agv-mini-dagnaam' aria-hidden='true'>{fmt(lang, d, { weekday: 'short' }).slice(0, 2)}</span>)}
        {raster.flat().map((dag) => (
          <button key={dag} type='button' className='agv-mini-dag' data-buiten={dag.slice(5, 7) !== datum.slice(5, 7) ? '1' : undefined}
            aria-current={dag === vandaag ? 'date' : undefined} aria-pressed={dag === datum}
            aria-label={fmt(lang, dag, { weekday: 'long', day: 'numeric', month: 'long' })} onClick={() => onKies(dag)}>
            {Number(dag.slice(8))}{metPunt(dag) ? <i aria-hidden='true' /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

type Props = {
  lang: Lang; datum: string; vandaag: string; kalenders: KalenderRegel[]; verborgen: ReadonlySet<string>;
  magNieuw: boolean; metPunt: (dag: string) => boolean;
  onNieuw: () => void; onKies: (dag: string) => void; onWissel: (sleutel: string) => void; onVerbindingen: () => void;
};
export default function KalenderZijbalk({ lang, datum, vandaag, kalenders, verborgen, magNieuw, metPunt, onNieuw, onKies, onWissel, onVerbindingen }: Props) {
  return (
    <aside className='agv-zijbalk' aria-label={tr(lang, 'Календарі', 'Agenda’s')}>
      <button type='button' className='agv-hoofdknop' onClick={onNieuw} data-agenda-nieuw='1' aria-describedby={magNieuw ? undefined : 'agv-nieuw-uitleg'}>
        <Plus aria-hidden='true' />{tr(lang, 'Нова подія', 'Nieuwe afspraak')}
      </button>
      {!magNieuw ? <small id='agv-nieuw-uitleg' className='agv-klein'>{tr(lang, 'Зараз лише читання — натисніть, щоб дізнатися, як дозволити створення.', 'Nu alleen lezen — klik om te zien hoe u aanmaken toestaat.')}</small> : null}
      <MiniKalender lang={lang} datum={datum} vandaag={vandaag} metPunt={metPunt} onKies={onKies} />
      <section className='agv-kalenders'>
        <h3>{tr(lang, 'Мої календарі', 'Mijn agenda’s')}</h3>
        {kalenders.length ? (
          <ul>
            {kalenders.map((k) => (
              <li key={k.sleutel}>
                <label className='agv-kalender-regel' data-agenda-v3-kalender={k.sleutel}>
                  <input type='checkbox' checked={!verborgen.has(k.sleutel)} onChange={() => onWissel(k.sleutel)} style={{ accentColor: k.kleur }} />
                  <i className='agv-kleurvak' style={{ background: k.kleur }} aria-hidden='true' />
                  <span>{k.naam}</span>
                  {k.alleenLezen ? <small className='agv-label'>{tr(lang, 'читання', 'lezen')}</small> : null}
                </label>
              </li>
            ))}
          </ul>
        ) : <p className='agv-klein'>{tr(lang, 'Ще немає календарів.', 'Nog geen agenda’s.')}</p>}
      </section>
      <button type='button' className='agv-tekstknop agv-zijbalk-voet' onClick={onVerbindingen}><Settings2 aria-hidden='true' />{tr(lang, 'Календарі та сервіси', 'Agenda’s en diensten')}</button>
    </aside>
  );
}
