// Planner (structuur-calculator): type woning, m², fase, functies → zones, aantallen en complexiteitsfactoren. BEWUST ZONDER
// bedragen: er is geen geverifieerde prijslijst (valuta, btw, montage, land, geldigheid), dus de pagina belooft er geen.
import { useMemo, useState } from 'react';
import { Calculator, Store } from 'lucide-react';
import { PLANNER_FUNCTIES, huisTekst, plannerStructuur, type HuisTab, type PlannerInvoer } from '../../../shared/huis-model';
import { tr, type Lang } from '../tekst';

export default function Planner({ lang, naarTab }: { lang: Lang; naarTab: (t: HuisTab) => void }) {
  const [inv, setInv] = useState<PlannerInvoer>({ soort: 'rijhuis', oppervlakte: 120, fase: 'bewoond', functies: ['licht', 'klimaat', 'water'] });
  const uit = useMemo(() => plannerStructuur(inv), [inv]);
  const zet = <K extends keyof PlannerInvoer>(k: K, v: PlannerInvoer[K]) => setInv({ ...inv, [k]: v });
  return (
    <div className='hv-planner' data-hv-planner-totaal={uit.totaal}>
      <p className='hv-melding is-info'><Calculator aria-hidden='true' />{tr(lang, 'Калькулятор показує структуру системи (зони, кількість пристроїв, фактори складності). Він свідомо не показує цін: без перевіреного прайсу з валютою, ПДВ, монтажем і терміном дії будь-яка сума була б вигадкою.', 'De planner toont de structuur van het systeem (zones, aantallen, complexiteitsfactoren). Hij toont bewust geen prijzen: zonder een geverifieerde prijslijst met valuta, btw, montage en geldigheid zou elk bedrag verzonnen zijn.')}</p>
      <div className='hv-kolommen'>
        <form className='hv-blok' onSubmit={(e) => e.preventDefault()}>
          <h3>{tr(lang, 'Вхідні дані', 'Invoer')}</h3>
          <label className='hv-veld'><span>{tr(lang, 'Тип житла', 'Type woning')}</span><select value={inv.soort} onChange={(e) => zet('soort', e.target.value as PlannerInvoer['soort'])} data-hv-planner-soort='1'><option value='appartement'>{tr(lang, 'квартира', 'appartement')}</option><option value='rijhuis'>{tr(lang, 'таунхаус / рядний будинок', 'rijhuis')}</option><option value='vrijstaand'>{tr(lang, 'окремий будинок', 'vrijstaande woning')}</option></select></label>
          <label className='hv-veld'><span>{tr(lang, 'Площа, м²', 'Oppervlakte, m²')}</span><input type='number' min={20} max={2000} value={inv.oppervlakte} onChange={(e) => zet('oppervlakte', Number(e.target.value))} data-hv-planner-m2='1' /></label>
          <label className='hv-veld'><span>{tr(lang, 'Стадія', 'Fase')}</span><select value={inv.fase} onChange={(e) => zet('fase', e.target.value as PlannerInvoer['fase'])}><option value='nieuwbouw'>{tr(lang, 'новобудова', 'nieuwbouw')}</option><option value='renovatie'>{tr(lang, 'ремонт', 'renovatie')}</option><option value='bewoond'>{tr(lang, 'заселене житло', 'bewoond')}</option></select></label>
          <fieldset className='hv-veld'><legend>{tr(lang, 'Функції', 'Functies')}</legend>
            {PLANNER_FUNCTIES.map((f) => <label key={f.id} className='hv-keuze'><input type='checkbox' checked={inv.functies.includes(f.id)} onChange={(e) => zet('functies', e.target.checked ? [...inv.functies, f.id] : inv.functies.filter((x) => x !== f.id))} data-hv-planner-functie={f.id} /><span>{huisTekst(f.naam, lang)}</span></label>)}
          </fieldset>
        </form>
        <section className='hv-blok' aria-live='polite'>
          <h3>{tr(lang, 'Структура', 'Structuur')}</h3>
          <div className='hv-tegels'>
            <div className='hv-tegel'><strong>{uit.zones}</strong><span>{tr(lang, 'орієнтовних зон', 'zones (indicatie)')}</span></div>
            <div className='hv-tegel'><strong>{uit.totaal}</strong><span>{tr(lang, 'пристроїв (орієнтовно)', 'apparaten (indicatie)')}</span></div>
            <div className='hv-tegel'><strong>{uit.hub ? tr(lang, 'так', 'ja') : tr(lang, 'ні', 'nee')}</strong><span>{tr(lang, 'локальний хаб (Home Assistant)', 'lokale hub (Home Assistant)')}</span></div>
          </div>
          <table className='hv-tabel'><tbody>{uit.apparaten.map((a) => <tr key={a.id}><th scope='row'>{huisTekst(a.naam, lang)}</th><td>{a.aantal}</td></tr>)}</tbody></table>
          {uit.complexiteit.length ? <><h4 className='hv-sub'>{tr(lang, 'Фактори складності', 'Complexiteitsfactoren')}</h4><ul className='hv-lijst is-dicht'>{uit.complexiteit.map((c) => <li key={c.id}><span>{huisTekst(c.tekst, lang)}</span></li>)}</ul></> : null}
          <p className='hv-hint'>{tr(lang, 'Кількості — грубі коефіцієнти на 100 м² для ілюстрації структури, не кошторис. Для реального проєкту потрібен огляд на місці.', 'De aantallen zijn grove coëfficiënten per 100 m² ter illustratie van de structuur, geen bestek. Voor een echt project is een opname ter plaatse nodig.')}</p>
          <button type='button' className='hv-knop is-stil' onClick={() => naarTab('showroom')}><Store aria-hidden='true' />{tr(lang, 'До showroom', 'Naar de showroom')}</button>
        </section>
      </div>
    </div>
  );
}
