// Overzicht — «Продукт під контролем»: telbare cijfers uit de echte serverkant, wat een MENSELIJK besluit vraagt,
// de link-kandidaten (bevestigen/afwijzen — nooit auto-merge) en de jongste gebeurtenissen. De levensloopstrook uit het
// dossier staat erbij als stille raadgever. Alles leeg = een eerlijke lege toestand, geen verzonnen tellers.
import { useEffect } from 'react';
import { CircleAlert, Link2, ListChecks, ScrollText } from 'lucide-react';
import { KOPPEL_LABEL, LEVENSFASE_LABEL, afstemmingTekst } from '../../../shared/afstemming-model';
import { afstemmingClient } from '../afstemming-client';
import type { OnderdeelProps } from '../AfstemmingPagina';
import { actorTekst, afstemmingFoutTekst, gebeurtenisTekst, kleineDatum, sessieZet } from '../hulp';
import { tr } from '../tekst';

const PIJPLIJN: ReadonlyArray<[string, string, string, string]> = [
  ['Ідея', 'Захопити задум', 'Idee', 'Vastleggen'], ['Картка', 'Уточнити вимоги', 'Kaart', 'Eisen aanscherpen'],
  ['Код', 'PR і збірка', 'Code', 'PR en build'], ['Докази', 'Тести й випуск', 'Bewijs', 'Tests en release'],
  ['Підтверджено', 'Реально працює', 'Bevestigd', 'Werkt echt'],
];

export default function Overzicht({ lang, ov, vernieuw, toon, naarSectie, openKaart }: OnderdeelProps) {
  // Bij het openen van het overzicht de cijfers verversen: tellers mogen nooit ouder zijn dan de handeling ervoor.
  useEffect(() => { void vernieuw(); }, [vernieuw]);
  if (!ov) {
    return (
      <section className='afv-leeg' data-afv-bouw='Overzicht'>
        <p>{tr(lang, 'Серверна частина огляду ще збирається — щойно вона відповість, тут з’являться реальні лічильники.', 'De serverkant van het overzicht is nog in aanbouw — zodra die antwoordt, staan hier de echte tellers.')}</p>
      </section>
    );
  }
  const t = ov.tellers;
  const naarFilter = (filter: Record<string, string>) => { sessieZet('afv-filter', JSON.stringify(filter)); naarSectie('kartotheek'); };
  const tegel = (naam: string, waarde: number, uk: string, nl: string, filter: Record<string, string> | null) => (
    <button key={naam} type='button' className='afv-tegel' data-afv-tegel={naam} disabled={!filter}
      onClick={() => { if (filter) naarFilter(filter); }}>
      <strong>{waarde}</strong><span>{tr(lang, uk, nl)}</span>
    </button>
  );
  const beslis = (id: string, actie: 'bevestig' | 'wijs-af', melding: string) => void (async () => {
    try { await afstemmingClient.koppel({ actie, id }); toon(melding); await vernieuw(); }
    catch (e) { toon(afstemmingFoutTekst(lang, e)); }
  })();

  return (
    <div className='afv-overzicht' data-afv-overzicht=''>
      <ol className='afv-pijplijn' data-afv-pijplijn='' aria-label={tr(lang, 'Шлях картки', 'De weg van een kaart')}>
        {PIJPLIJN.map(([uk1, uk2, nl1, nl2]) => <li key={uk1}><strong>{tr(lang, uk1, nl1)}</strong><small>{tr(lang, uk2, nl2)}</small></li>)}
      </ol>
      {t.kaarten === 0 ? (
        <section className='afv-leeg' data-afv-leeg='overzicht'>
          <p>{tr(lang, 'Карток ще немає. Натисніть «Додати ідею» вгорі — задум можна описати своїми словами або імпортувати файлом (.json/.md/.txt); 25 старих тверджень матриці можна мігрувати в розділі «Джерела».', 'Nog geen kaarten. Druk bovenaan op «Idee toevoegen» — een idee kan in eigen woorden of als bestand (.json/.md/.txt); de 25 oude matrix-claims migreren via «Bronnen».')}</p>
        </section>
      ) : (
        <div className='afv-tegels' data-afv-tegels=''>
          {tegel('kaarten', t.kaarten, 'Карток у картотеці', 'Kaarten in de kartotheek', {})}
          {tegel('aandacht', t.aandacht, 'Потребують уваги', 'Vragen aandacht', { snel: 'aandacht' })}
          {tegel('conflicten', t.conflicten, 'Відкриті конфлікти', 'Open conflicten', { conflict: '1' })}
          {tegel('zonderBewijs', t.zonderBewijs, 'Без жодного доказу', 'Zonder enig bewijs', { snel: 'zonder-bewijs' })}
          {tegel('kandidaten', t.kandidaten, 'Кандидати зв’язків', 'Link-kandidaten', null)}
        </div>
      )}
      <div className='afv-overzicht-kolommen'>
        <section className='afv-blok'>
          <h3><CircleAlert aria-hidden='true' />{tr(lang, 'Важливе зараз', 'Nu belangrijk')}<small className='afv-hint'>{tr(lang, 'рішення потрібне людині', 'een mens moet beslissen')}</small></h3>
          {!ov.aandacht.length ? <p className='afv-hint'>{tr(lang, 'Нічого не чекає на вас — все або вирішено, або в роботі.', 'Niets wacht op u — alles is besloten of onderweg.')}</p> : null}
          {ov.aandacht.map((k) => (
            <button key={k.id} type='button' className='afv-lijst-rij' data-afv-aandacht={k.id} onClick={() => openKaart(k.id)}>
              <code>{k.externId}</code>
              <span className='afv-lijst-titel'>{afstemmingTekst(k.titel, lang)}</span>
              <span className='afv-chip is-stil'>{afstemmingTekst(LEVENSFASE_LABEL[k.levensfase], lang)}</span>
              {k.openConflicten > 0 ? <span className='afv-chip is-conflict'>{tr(lang, 'конфлікт', 'conflict')}</span> : null}
            </button>
          ))}
        </section>
        <section className='afv-blok'>
          <h3><Link2 aria-hidden='true' />{tr(lang, 'Зв’язки, знайдені системою', 'Door het systeem gevonden relaties')}<small className='afv-hint'>{tr(lang, 'пропозиції, не факти', 'voorstellen, geen feiten')}</small></h3>
          {!ov.kandidaten.length ? <p className='afv-hint'>{tr(lang, 'Пропозицій немає.', 'Geen voorstellen.')}</p> : null}
          {ov.kandidaten.map((kd) => (
            <div key={kd.id} className='afv-lijst-rij' data-afv-kandidaat={kd.id}>
              <span className='afv-chip is-stil'>{afstemmingTekst(KOPPEL_LABEL[kd.soort], lang)}</span>
              <span className='afv-lijst-titel'>{kd.reden}</span>
              <small className='afv-hint'>{Math.round(kd.zekerheid * 100)}%</small>
              <span className='afv-rij'>
                <button type='button' className='afv-knop is-klein is-hoofd' data-afv-kandidaat-ok={kd.id} onClick={() => beslis(kd.id, 'bevestig', tr(lang, 'Зв’язок підтверджено.', 'Koppeling bevestigd.'))}>{tr(lang, 'Підтвердити', 'Bevestigen')}</button>
                <button type='button' className='afv-knop is-klein' data-afv-kandidaat-nee={kd.id} onClick={() => beslis(kd.id, 'wijs-af', tr(lang, 'Пропозицію відхилено.', 'Voorstel afgewezen.'))}>{tr(lang, 'Відхилити', 'Afwijzen')}</button>
              </span>
            </div>
          ))}
        </section>
      </div>
      <section className='afv-blok'>
        <h3><ScrollText aria-hidden='true' />{tr(lang, 'Останні події', 'Jongste gebeurtenissen')}</h3>
        {!ov.recent.length ? <p className='afv-hint'>{tr(lang, 'Подій ще немає.', 'Nog geen gebeurtenissen.')}</p> : null}
        <ul className='afv-tijdlijn' data-afv-recent=''>
          {ov.recent.map((g) => (
            <li key={g.id}>
              <button type='button' className='afv-knop is-stil is-klein' onClick={() => openKaart(g.kaartId)}>{gebeurtenisTekst(lang, g.soort)}</button>
              <small className='afv-hint'>{actorTekst(lang, g.actor)} · {kleineDatum(lang, g.op)}</small>
            </li>
          ))}
        </ul>
      </section>
      <section className='afv-blok'>
        <h3><ListChecks aria-hidden='true' />{tr(lang, 'Жодної невидимої роботи', 'Geen onzichtbaar werk')}</h3>
        <p className='afv-hint'>{tr(lang,
          'Першоджерело ідеї зберігається; всі зміни — як пропозиції з diff; агент не схвалює власну реалізацію і не запускає розгортання; «встановлено» ≠ «працює».',
          'De oorsprong van een idee blijft bewaard; wijzigingen zijn voorstellen met diff; een agent keurt zijn eigen werk niet goed en rolt niets uit; «geïnstalleerd» ≠ «werkt».')}</p>
      </section>
    </div>
  );
}
