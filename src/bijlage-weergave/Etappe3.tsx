// НЕ ПЕРЕВІРЕНО (очікує перевірки наступним агентом): тести, перевірку типів і складання не проганяли
// за прямою вказівкою власника (режим економії ліміту, 22.11.2026).
// Спільний перегляд вкладень, етап 3: смуга під шапкою — швидка картка рахунку (15.2) і дії етапу 3.
// Виконавець: Claude Opus 5.5 (High) через Google Antigravity (antigravity), продовження роботи Grok (grok).
// Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений: цей компонент живе лише всередині WeergaveKop,
// а WeergaveKop з’являється лише за ввімкненого прапорця.
//
// Правила відмальовування:
//   • рядок картки показуємо лише тоді, коли поле справді знайдено в тексті документа; порожньо — смуги немає;
//   • поки текст читається, нічого не стрибає: смуга з’являється лише з готовими даними;
//   • мінімалізм для розсіяної людини: одна тонка смуга, значок, коротке слово й число, колір лише для терміновості.
import { useMemo } from 'react';
import { CalendarClock, Hash, Wallet } from 'lucide-react';
import { kies, soortVan, type Taal } from './soort';
import { rekeningVelden, type RekeningVelden } from './rekening-velden';
import { snelkaartRijen, termijnHint, type SnelkaartSleutel } from './snelkaart';
import { useBijlageTekst } from './tekst';

const ICOON: Record<SnelkaartSleutel, typeof Wallet> = { bedrag: Wallet, termijn: CalendarClock, nummer: Hash };

/**
 * Що джерело (Пошта; на етапі 4 — Диск, чат, дошка, сповіщення) знає про відкрите вкладення.
 * Усе необов’язкове: без поля відповідна дія просто не з’являється.
 */
export type WeergaveExtra = {
  /** Для ключа проти подвійного запису й внутрішнього посилання на лист (розділ 15.3). */
  profielId?: string;
  rekeningId?: string;
  briefId?: string;
  bijlageId?: string;
  afzender?: string;
  tijdzone?: string;
};

export type Etappe3Props = {
  taal: Taal;
  naam: string;
  contentType: string;
  blob?: Blob | null;
  extra?: WeergaveExtra | null;
};

/** Поля рахунку з тексту відкритого вкладення. Для не-рахунку текст навіть не читаємо. */
export function useRekeningVelden(p: { naam: string; contentType: string; blob?: Blob | null }): { velden: RekeningVelden | null; tekst: string } {
  const isRekening = soortVan(p.naam, p.contentType).sleutel === 'rekening';
  const stand = useBijlageTekst(p.blob, p.contentType, p.naam, isRekening);
  return useMemo(() => {
    if (!isRekening || stand.fase !== 'klaar') return { velden: null, tekst: '' };
    return { velden: rekeningVelden(stand.tekst), tekst: stand.tekst };
  }, [isRekening, stand]);
}

export function WeergaveSnelkaart(p: { taal: Taal; velden: RekeningVelden | null }) {
  const rijen = p.velden ? snelkaartRijen(p.velden) : [];
  if (!rijen.length) return null;
  const hint = p.velden?.termijn ? termijnHint(p.velden.termijn.iso, p.taal) : null;
  return (
    <dl className='weergave-snelkaart' aria-label={kies(p.taal, ['Головне з рахунку', 'Belangrijkste uit de factuur'])}>
      {rijen.map((r) => {
        const Icoon = ICOON[r.sleutel];
        return (
          <div key={r.sleutel} className='weergave-snelkaart-rij' data-sleutel={r.sleutel} data-dringend={r.sleutel === 'termijn' && hint ? hint.dringend : undefined}>
            <dt><Icoon aria-hidden='true' /><span>{kies(p.taal, r.label)}</span></dt>
            <dd>
              <b>{kies(p.taal, r.waarde)}</b>
              {r.sleutel === 'termijn' && hint ? <small>{hint.tekst}</small> : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Уся смуга етапу 3. На цьому кроці — лише швидка картка; дії додаються наступними фіксаціями змін. */
export function WeergaveEtappe3(p: Etappe3Props) {
  const { velden } = useRekeningVelden(p);
  const kaart = <WeergaveSnelkaart taal={p.taal} velden={velden} />;
  if (!velden) return null;
  return <div className='weergave-etappe3' data-weergave-etappe3=''>{kaart}</div>;
}
