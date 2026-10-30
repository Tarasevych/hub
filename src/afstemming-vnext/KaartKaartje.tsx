// Eén kaartje in de kartotheek (en in «Важливе зараз»): korte zin, de TWEE assen als TEKST (kleur is alleen een stip,
// nooit de enige drager), telbare voortgang (AC n/m — geen verzonnen percentages) en de signalen die een besluit vragen.
import { CircleAlert, FileCheck2, Link2 } from 'lucide-react';
import { GEZONDHEID_LABEL, LEVENSFASE_LABEL, afstemmingTekst, voortgangTekst, type Kaart } from '../../shared/afstemming-model';
import { tr, type Lang } from './tekst';

export default function KaartKaartje({ lang, kaart, onOpen }: { lang: Lang; kaart: Kaart; onOpen: (k: Kaart) => void }) {
  const voortgang = kaart.criteriaTotaal > 0 ? Math.round((kaart.criteriaGeslaagd / kaart.criteriaTotaal) * 100) : 0;
  return (
    <article className='afv-kaartje' data-afv-kaart={kaart.id} role='listitem' tabIndex={0}
      onClick={() => onOpen(kaart)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(kaart); } }}>
      <header className='afv-kaartje-kop'>
        <code>{kaart.externId}</code>
        <span className='afv-chip is-stil'>{kaart.prioriteit}</span>
        {kaart.legacy ? <span className='afv-chip is-stil' data-afv-legacy={kaart.legacy.claimId}>legacy</span> : null}
        {kaart.openConflicten > 0 ? <span className='afv-chip is-conflict' data-afv-conflictchip=''><CircleAlert aria-hidden='true' />{tr(lang, 'конфлікт', 'conflict')}</span> : null}
      </header>
      <strong className='afv-kaartje-titel'>{afstemmingTekst(kaart.titel, lang)}</strong>
      <p className='afv-kaartje-samenvatting'>{afstemmingTekst(kaart.samenvatting, lang)}</p>
      <div className='afv-kaartje-assen'>
        <span className='afv-chip'>{afstemmingTekst(LEVENSFASE_LABEL[kaart.levensfase], lang)}</span>
        <span className='afv-chip' data-afv-gezondheid={kaart.gezondheid}><i className='afv-stip' aria-hidden='true' />{afstemmingTekst(GEZONDHEID_LABEL[kaart.gezondheid], lang)}</span>
      </div>
      <footer className='afv-kaartje-voet'>
        <span className='afv-vooruitgang' aria-hidden='true'><i style={{ width: `${voortgang}%` }} /></span>
        <small>{voortgangTekst(kaart.criteriaGeslaagd, kaart.criteriaTotaal, lang)}</small>
        <small className='afv-kaartje-tellers'>
          <Link2 aria-hidden='true' />{kaart.koppelingen}
          <FileCheck2 aria-hidden='true' />{kaart.bewijs}
        </small>
      </footer>
    </article>
  );
}
