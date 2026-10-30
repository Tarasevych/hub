// «Інтеграції» — een apart scherm, niet op de hoofdpagina. Elke bron met de EERLIJKE stand uit shared/notities-vnext-model.ts:
// «werkt» alleen voor de bestandsweg van deze release; «alleen bestandsimport» met de formaten; «beperkt»; «gepland» met wat er
// op de server ontbreekt. Een knop doet iets (bestanden importeren) of er is geen knop — nooit een «Koppelen» die niets doet.
import { AlertCircle, ExternalLink, FileText, Upload } from 'lucide-react';
import { BRON_STAND_LABEL, NOTITIE_BRONNEN, vnTekst } from '../../shared/notities-vnext-model';
import { tr, type Lang } from './tekst';

export default function NotitiesBronnen({ lang, onImport }: { lang: Lang; onImport: () => void }) {
  return (
    <section className='vn-bronnen' aria-labelledby='vn-bronnen-kop' data-vn-bronnen={String(NOTITIE_BRONNEN.length)}>
      <h2 id='vn-bronnen-kop'>{tr(lang, 'Інтеграції та імпорт', 'Integraties en import')}</h2>
      <p className='vn-hint'>{tr(lang,
        'Чесний стан кожного джерела. «Працює» — лише те, що цей випуск справді робить. Там, де офіційного API немає або він обмежений, ми не обіцяємо двосторонньої синхронізації — лише перевірений шлях через файли.',
        'De eerlijke stand van elke bron. «Werkt» is alleen wat deze release werkelijk doet. Waar geen of een beperkte officiële API bestaat, beloven wij geen tweerichtingssynchronisatie — alleen de bevestigde weg via bestanden.')}</p>
      <ul className='vn-bronnen-lijst'>
        {NOTITIE_BRONNEN.map((b) => (
          <li key={b.id} data-vn-bron={b.id} data-vn-bron-stand={b.stand}>
            <span className='vn-monogram' aria-hidden='true'>{b.naam.slice(0, 1)}</span>
            <div className='vn-bron-tekst'>
              <strong>{b.naam} <small>· {vnTekst(b.soort, lang)}</small></strong>
              <p>{vnTekst(b.uitleg, lang)}</p>
              <em className={b.stand === 'beschikbaar' ? 'is-ok' : ''}>{b.stand === 'beschikbaar' ? <FileText aria-hidden='true' /> : <AlertCircle aria-hidden='true' />}{vnTekst(b.wat, lang)}</em>
              <a href={b.bron} target='_blank' rel='noopener noreferrer' className='vn-bron-link'><ExternalLink aria-hidden='true' />{tr(lang, 'Джерело', 'Bron')}</a>
            </div>
            <span className={`vn-bron-stand is-${b.stand}`}>{vnTekst(BRON_STAND_LABEL[b.stand], lang)}</span>
            {b.formaten.length
              ? <button type='button' className='vn-knop is-klein' onClick={onImport} data-vn-bron-import={b.id}><Upload aria-hidden='true' />{tr(lang, 'Імпортувати', 'Importeren')} .{b.formaten.join(' .')}</button>
              : <span className='vn-bron-geen'>{tr(lang, 'Кнопки «Підключити» немає — конектора ще не існує.', 'Geen knop «Koppelen» — de connector bestaat nog niet.')}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
