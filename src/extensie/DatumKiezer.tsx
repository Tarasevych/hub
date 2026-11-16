// EXTUI-001 (16.11.2026, побажання Павла): «Закрити до дати» — власний календар у стилі сайту замість системного.
// Три рівні, як у звичних календарях: дні → місяці → роки (натиск на заголовок), час закриття окремо.
// Eigen kalender in de stijl van de site: dagen → maanden → jaren (klik op de titel), sluittijd apart.
// Дні поза межами [min, max] вимкнені: межі ставить сервер (максимум простору й правила власника).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Moon, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
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
      {tijdOpen ? <TijdWiel uk={uk} tijd={tijd} onTijd={setTijd} onKlaar={() => setTijdOpen(false)} /> : null}
      {gekozen !== null ? <p className='dk-samenvatting'>{uk ? 'Закриється ' : 'Sluit op '}<b>{new Date(gekozen).toLocaleString(taal, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</b></p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- час: частини доби + колесо годин
// 16.11 (Павло: «не калькулятор, а частини доби з логотипами й відтінком, смужка, що гортається, як колесо»).
// Tijd: dagdelen met pictogram en tint, plus een uurwiel dat horizontaal scrolt en op het midden klikt (scroll-snap).
type Dagdeel = { id: 'nacht' | 'ochtend' | 'dag' | 'avond'; van: number; icoon: LucideIcon; uk: string; nl: string };
const DAGDELEN: readonly Dagdeel[] = [
  { id: 'nacht', van: 0, icoon: Moon, uk: 'Ніч', nl: 'Nacht' },
  { id: 'ochtend', van: 6, icoon: Sunrise, uk: 'Ранок', nl: 'Ochtend' },
  { id: 'dag', van: 12, icoon: Sun, uk: 'День', nl: 'Dag' },
  { id: 'avond', van: 18, icoon: Sunset, uk: 'Вечір', nl: 'Avond' },
];
const deelVan = (u: number) => DAGDELEN[Math.min(3, Math.floor(u / 6))];
const UUR_B = 48; // ширина однієї години в колесі, px

function TijdWiel({ uk, tijd, onTijd, onKlaar }: { uk: boolean; tijd: string; onTijd: (t: string) => void; onKlaar: () => void }) {
  const uur = Number(tijd.slice(0, 2)) || 0;
  const min = tijd.slice(3);
  const deel = deelVan(uur);
  const wiel = useRef<HTMLDivElement>(null);
  const wacht = useRef<number>(0);
  const zet = (u: number, m = min) => onTijd(`${String(u).padStart(2, '0')}:${m}`);
  const rolNaar = (u: number, zacht: boolean) => wiel.current?.scrollTo({ left: u * UUR_B, behavior: zacht ? 'smooth' : 'auto' });
  useEffect(() => { rolNaar(uur, false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Колесо зупинилося — година посередині стає вибраною («клац»). Het wiel staat stil: het middelste uur is gekozen.
  const opRol = () => {
    window.clearTimeout(wacht.current);
    wacht.current = window.setTimeout(() => {
      const el = wiel.current; if (!el) return;
      const u = Math.max(0, Math.min(23, Math.round(el.scrollLeft / UUR_B)));
      if (u !== uur) zet(u);
    }, 110);
  };
  const kies = (u: number) => { zet(u); rolNaar(u, true); };
  return (
    <div className='dk-tijdpaneel' data-dagdeel={deel.id} data-dk-tijdpaneel='1'>
      <div className='dk-dagdelen' role='group' aria-label={uk ? 'Частина доби' : 'Dagdeel'}>
        {DAGDELEN.map((d) => {
          const I = d.icoon;
          return (
            <button key={d.id} type='button' className={`dk-dagdeel${d.id === deel.id ? ' is-aan' : ''}`} data-dagdeel={d.id} aria-pressed={d.id === deel.id}
              onClick={() => kies(d.id === deel.id ? uur : d.van + (d.id === 'nacht' ? 0 : 2))}
              title={uk ? `${d.uk}: ${String(d.van).padStart(2, '0')}:00–${String(d.van + 5).padStart(2, '0')}:59` : `${d.nl}: ${String(d.van).padStart(2, '0')}:00–${String(d.van + 5).padStart(2, '0')}:59`}>
              <I aria-hidden='true' /><span>{uk ? d.uk : d.nl}</span>
            </button>
          );
        })}
      </div>
      <div className='dk-wielkader'>
        <button type='button' className='dk-wielpijl' onClick={() => kies(Math.max(0, uur - 1))} disabled={uur === 0} aria-label={uk ? 'На годину раніше' : 'Een uur eerder'}><ChevronLeft aria-hidden='true' /></button>
        <div className='dk-wiel' ref={wiel} onScroll={opRol} role='listbox' aria-label={uk ? 'Година закриття' : 'Uur van sluiten'} data-dk-wiel='1'>
          {Array.from({ length: 24 }, (_, u) => {
            const afstand = Math.abs(u - uur);
            return (
              <button key={u} type='button' role='option' aria-selected={u === uur} className={`dk-uur${u === uur ? ' is-aan' : ''}`} data-dagdeel={deelVan(u).id}
                data-afstand={Math.min(afstand, 3)} onClick={() => kies(u)} data-dk-uur={String(u).padStart(2, '0')}>
                {String(u).padStart(2, '0')}
              </button>
            );
          })}
        </div>
        <button type='button' className='dk-wielpijl' onClick={() => kies(Math.min(23, uur + 1))} disabled={uur === 23} aria-label={uk ? 'На годину пізніше' : 'Een uur later'}><ChevronRight aria-hidden='true' /></button>
      </div>
      <div className='dk-minuten' role='group' aria-label={uk ? 'Хвилини' : 'Minuten'}>
        {['00', '15', '30', '45'].map((m) => (
          <button key={m} type='button' className={`dk-minuut${m === min ? ' is-aan' : ''}`} aria-pressed={m === min}
            onClick={() => { zet(uur, m); onKlaar(); }} data-dk-minuut={m}>{String(uur).padStart(2, '0')}:{m}</button>
        ))}
      </div>
    </div>
  );
}
