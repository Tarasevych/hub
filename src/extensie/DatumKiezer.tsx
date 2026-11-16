// EXTUI-001 (16.11.2026, побажання Павла): «Закрити до дати» — власний календар у стилі сайту замість системного.
// Три рівні, як у звичних календарях: дні → місяці → роки (натиск на заголовок), час закриття окремо.
// Eigen kalender in de stijl van de site: dagen → maanden → jaren (klik op de titel), sluittijd apart.
// Дні поза межами [min, max] вимкнені: межі ставить сервер (максимум простору й правила власника).
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import './datum-kiezer.css';

type Weergave = 'dagen' | 'maanden' | 'jaren';
const D = 86_400_000;
const dagBegin = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

export type DatumKiezerProps = {
  uk: boolean;
  /** Найраніший дозволений момент (мс, годинник браузера). */
  min: number;
  /** Найпізніший дозволений момент (мс, годинник браузера). */
  max: number;
  /** Поточний вибір або null. */
  waarde: number | null;
  onKies: (ms: number) => void;
  onSluit: () => void;
};

export default function DatumKiezer({ uk, min, max, waarde, onKies, onSluit }: DatumKiezerProps) {
  const taal = uk ? 'uk-UA' : 'nl-NL';
  const start = waarde ?? Math.min(max, Math.max(min, Date.now() + 7 * D));
  const [weergave, zetWeergave] = useState<Weergave>('dagen');
  // Напрям «наближення»: вгору (дні → місяці → роки) сітка віддаляється, вниз — наближається. Richting van de zoom.
  const [richting, setRichting] = useState<'uit' | 'in'>('uit');
  const NIVEAU: Record<Weergave, number> = { dagen: 0, maanden: 1, jaren: 2 };
  const setWeergave = (w: Weergave) => { setRichting(NIVEAU[w] > NIVEAU[weergave] ? 'uit' : 'in'); zetWeergave(w); };
  const [jaar, setJaar] = useState(() => new Date(start).getFullYear());
  const [maand, setMaand] = useState(() => new Date(start).getMonth());
  const [dag, setDag] = useState<number | null>(() => (waarde ? dagBegin(waarde) : null));
  const [tijdOpen, setTijdOpen] = useState(false);
  const [tijd, setTijd] = useState(() => { const d = new Date(start); return `${String(d.getHours()).padStart(2, '0')}:${String(Math.floor(d.getMinutes() / 15) * 15).padStart(2, '0')}`; });

  const maandNamen = useMemo(() => Array.from({ length: 12 }, (_, m) => new Date(2026, m, 1).toLocaleDateString(taal, { month: 'short' }).replace('.', '')), [taal]);
  const dagNamen = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 16 + i).toLocaleDateString(taal, { weekday: 'short' })), [taal]); // 16.11.2026 — понеділок
  const minDag = dagBegin(min), maxDag = dagBegin(max);
  const minJaar = new Date(min).getFullYear(), maxJaar = new Date(max).getFullYear();

  const moment = (d: number | null): number | null => {
    if (d === null) return null;
    const [u, m] = tijd.split(':').map(Number);
    const x = new Date(d); x.setHours(u || 0, m || 0, 0, 0);
    return Math.min(max, Math.max(min, x.getTime()));
  };
  const gekozen = moment(dag);

  const vorige = () => { if (weergave === 'jaren') setJaar((j) => j - 12); else if (weergave === 'maanden') setJaar((j) => j - 1); else if (maand === 0) { setMaand(11); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (weergave === 'jaren') setJaar((j) => j + 12); else if (weergave === 'maanden') setJaar((j) => j + 1); else if (maand === 11) { setMaand(0); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };
  const kanVorige = weergave === 'dagen' ? new Date(jaar, maand, 1).getTime() > minDag : jaar > minJaar;
  const kanVolgende = weergave === 'dagen' ? new Date(jaar, maand + 1, 1).getTime() <= maxDag : (weergave === 'jaren' ? jaar + 11 : jaar) < maxJaar;

  const groot = (t: string) => t.charAt(0).toLocaleUpperCase(taal) + t.slice(1);
  const titel = weergave === 'dagen' ? groot(new Date(jaar, maand, 1).toLocaleDateString(taal, { month: 'long', year: 'numeric' }))
    : weergave === 'maanden' ? String(jaar) : `${jaar} – ${jaar + 11}`;

  const cellen = useMemo(() => {
    const eerste = new Date(jaar, maand, 1);
    const leeg = (eerste.getDay() + 6) % 7;
    const n = new Date(jaar, maand + 1, 0).getDate();
    return [...Array.from({ length: leeg }, () => null), ...Array.from({ length: n }, (_, i) => new Date(jaar, maand, i + 1).getTime())];
  }, [jaar, maand]);
  const vandaag = dagBegin(Date.now());

  return (
    <div className='dk' role='dialog' aria-label={uk ? 'Вибір дати закриття' : 'Sluitdatum kiezen'} data-datum-kiezer='1'>
      <div className='dk-kop'>
        <button type='button' className='dk-pijl' onClick={vorige} disabled={!kanVorige} aria-label={uk ? 'Назад' : 'Terug'} title={uk ? 'Попередній період' : 'Vorige periode'}><ChevronLeft aria-hidden='true' /></button>
        <button type='button' className='dk-titel' onClick={() => setWeergave(weergave === 'dagen' ? 'maanden' : weergave === 'maanden' ? 'jaren' : 'dagen')}
          title={weergave === 'dagen' ? (uk ? 'Показати всі місяці року — швидкий перехід до потрібного місяця' : 'Alle maanden van het jaar tonen — snel naar de juiste maand')
            : weergave === 'maanden' ? (uk ? 'Показати роки — швидкий перехід на інший рік' : 'Jaren tonen — snel naar een ander jaar') : (uk ? 'Повернутися до днів' : 'Terug naar de dagen')}
          aria-expanded={weergave !== 'dagen'} data-dk-titel='1' data-dk-niveau={weergave}>
          <span>{titel}</span><ChevronDown className='dk-titel-pijl' aria-hidden='true' />
        </button>
        <button type='button' className='dk-pijl' onClick={volgende} disabled={!kanVolgende} aria-label={uk ? 'Далі' : 'Verder'} title={uk ? 'Наступний період' : 'Volgende periode'}><ChevronRight aria-hidden='true' /></button>
      </div>

      {weergave === 'dagen' ? (
        <div key='dagen' className={`dk-rooster is-dagen dk-zoom-${richting}`} role='grid'>
          {dagNamen.map((n) => <span key={n} className='dk-weekdag' aria-hidden='true'>{n}</span>)}
          {cellen.map((c, i) => c === null ? <span key={`l${i}`} /> : (
            <button key={c} type='button' className={`dk-dag${c === dag ? ' is-aan' : ''}${c === vandaag ? ' is-vandaag' : ''}`} disabled={c < minDag || c > maxDag}
              onClick={() => setDag(c)} aria-pressed={c === dag} aria-label={new Date(c).toLocaleDateString(taal, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} data-dk-dag={new Date(c).getDate()}>
              {new Date(c).getDate()}
            </button>
          ))}
        </div>
      ) : weergave === 'maanden' ? (
        <div key='maanden' className={`dk-rooster is-groot dk-zoom-${richting}`} data-dk-weergave='maanden'>
          {maandNamen.map((n, m) => {
            const uit = new Date(jaar, m + 1, 0).getTime() < minDag || new Date(jaar, m, 1).getTime() > maxDag;
            return <button key={n} type='button' className={`dk-cel${m === maand ? ' is-aan' : ''}`} disabled={uit} onClick={() => { setMaand(m); setWeergave('dagen'); }} data-dk-maand={m + 1}>{n}</button>;
          })}
        </div>
      ) : (
        <div key='jaren' className={`dk-rooster is-groot dk-zoom-${richting}`} data-dk-weergave='jaren'>
          {Array.from({ length: 12 }, (_, i) => jaar + i).map((j) => (
            <button key={j} type='button' className={`dk-cel${j === new Date(start).getFullYear() ? ' is-aan' : ''}`} disabled={j < minJaar || j > maxJaar} onClick={() => { setJaar(j); setWeergave('maanden'); }} data-dk-jaar={j}>{j}</button>
          ))}
        </div>
      )}

      <div className='dk-voet'>
        <button type='button' className={`dk-tijd${tijdOpen ? ' is-open' : ''}`} onClick={() => setTijdOpen((o) => !o)} aria-expanded={tijdOpen} data-dk-tijd='1'
          title={uk ? 'О котрій доступ закриється обраного дня. Натисніть, щоб змінити годину й хвилини' : 'Hoe laat de toegang op de gekozen dag sluit. Klik om uur en minuten te wijzigen'}>
          <Clock aria-hidden='true' /><b>{tijd}</b><ChevronDown className='dk-tijd-pijl' aria-hidden='true' />
        </button>
        <span className='dk-knoppen'>
          <button type='button' className='dk-knop' onClick={onSluit}>{uk ? 'Скасувати' : 'Annuleren'}</button>
          <button type='button' className='dk-knop is-hoofd' disabled={gekozen === null} onClick={() => gekozen !== null && onKies(gekozen)} data-dk-kies='1'
            title={uk ? 'Доступ закриється сам у цей момент; раніше можна закрити кнопкою «Відкликати зараз»' : 'De toegang sluit vanzelf op dit moment; eerder sluiten kan met «Nu intrekken»'}>
            {uk ? 'Готово' : 'Klaar'}
          </button>
        </span>
      </div>
      {tijdOpen ? (
        <div className='dk-tijdpaneel' data-dk-tijdpaneel='1'>
          <span className='dk-tijdkop'>{uk ? 'Година' : 'Uur'}</span>
          <div className='dk-uren' role='group' aria-label={uk ? 'Година закриття' : 'Uur van sluiten'}>
            {Array.from({ length: 24 }, (_, u) => String(u).padStart(2, '0')).map((u) => (
              <button key={u} type='button' className={`dk-cel is-klein${tijd.slice(0, 2) === u ? ' is-aan' : ''}`} aria-pressed={tijd.slice(0, 2) === u}
                onClick={() => setTijd(`${u}:${tijd.slice(3)}`)} data-dk-uur={u}>{u}</button>
            ))}
          </div>
          <span className='dk-tijdkop'>{uk ? 'Хвилини' : 'Minuten'}</span>
          <div className='dk-minuten' role='group' aria-label={uk ? 'Хвилини закриття' : 'Minuten van sluiten'}>
            {['00', '15', '30', '45'].map((m) => (
              <button key={m} type='button' className={`dk-cel is-klein${tijd.slice(3) === m ? ' is-aan' : ''}`} aria-pressed={tijd.slice(3) === m}
                onClick={() => { setTijd(`${tijd.slice(0, 2)}:${m}`); setTijdOpen(false); }} data-dk-minuut={m}>:{m}</button>
            ))}
          </div>
        </div>
      ) : null}
      {gekozen !== null ? <p className='dk-samenvatting'>{uk ? 'Закриється ' : 'Sluit op '}<b>{new Date(gekozen).toLocaleString(taal, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</b></p> : null}
    </div>
  );
}
