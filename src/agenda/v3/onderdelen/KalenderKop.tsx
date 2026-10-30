// Kop: «Мій простір · Планування», titel «Календар», zoeken (met wissen) en de knop naar «Календарі та сервіси».
import { useRef, useState } from 'react';
import { Search, Settings2, X } from 'lucide-react';
import { tr, type Lang } from '../tekst';

type Props = { lang: Lang; zoek: string; onZoek: (z: string) => void; onVerbindingen: () => void; smal: boolean; aantalGevonden: number | null };
export default function KalenderKop({ lang, zoek, onZoek, onVerbindingen, smal, aantalGevonden }: Props) {
  const [zoekOpen, setZoekOpen] = useState(false);
  const veld = useRef<HTMLInputElement | null>(null);
  const toonVeld = !smal || zoekOpen || zoek;
  return (
    <header className='agv-kop'>
      <div className='agv-kop-titel'>
        <small className='agv-bovenregel'>{tr(lang, 'Мій простір · Планування', 'Mijn ruimte · Planning')}</small>
        <h1 id='agv-titel'>{tr(lang, 'Календар', 'Agenda')}</h1>
      </div>
      <div className='agv-kop-acties'>
        {toonVeld ? (
          <label className='agv-zoek'>
            <Search aria-hidden='true' />
            <input ref={veld} type='search' value={zoek} onChange={(e) => onZoek(e.target.value)} placeholder={tr(lang, 'Знайти подію…', 'Afspraak zoeken…')}
              aria-label={tr(lang, 'Пошук подій за назвою, місцем або календарем', 'Afspraken zoeken op titel, plaats of agenda')} data-agenda-v3-zoek='1'
              onKeyDown={(e) => { if (e.key === 'Escape') { onZoek(''); setZoekOpen(false); } }} autoFocus={smal && zoekOpen} />
            {zoek ? <button type='button' className='agv-icoonknop is-klein' onClick={() => { onZoek(''); veld.current?.focus(); }} aria-label={tr(lang, 'Очистити пошук', 'Zoeken wissen')}><X aria-hidden='true' /></button> : null}
          </label>
        ) : (
          <button type='button' className='agv-icoonknop' onClick={() => setZoekOpen(true)} aria-label={tr(lang, 'Пошук', 'Zoeken')} data-agenda-v3-zoek-open='1'><Search aria-hidden='true' /></button>
        )}
        <button type='button' className='agv-icoonknop' onClick={onVerbindingen} aria-label={tr(lang, 'Календарі та сервіси', 'Agenda’s en diensten')} title={tr(lang, 'Календарі та сервіси', 'Agenda’s en diensten')} data-agenda-v3-verbindingen='1'><Settings2 aria-hidden='true' /></button>
      </div>
      {zoek && aantalGevonden !== null ? <p className='agv-zoek-uitslag' role='status'>{tr(lang, `Знайдено: ${aantalGevonden}`, `Gevonden: ${aantalGevonden}`)}</p> : null}
    </header>
  );
}
