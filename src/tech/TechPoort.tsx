// Двері розділу управління: сторінки адміністрування й API не відкриваються, доки в цій вкладці не увімкнено технічний профіль.
import { openTechVenster } from './tech-store';
import './tech.css';

export default function TechPoort({ lang, onAccount }: { lang: 'uk' | 'nl'; onAccount: () => void }) {
  const uk = lang === 'uk';
  return (
    <section className='tech-poort' data-tech-poort='1'>
      <h1>{uk ? 'Управління сайтом' : 'Beheer van de site'}</h1>
      <p>{uk
        ? 'Адміністрування та API відкриваються лише в технічному профілі цієї вкладки. Пункти облікового запису тут не змішуються з управлінням.'
        : 'Beheer en API openen alleen in het technisch profiel van dit tabblad. Accountpunten mengen zich hier niet met beheer.'}</p>
      <div className='tech-poort-knoppen'>
        <button type='button' className='is-hoofd' onClick={() => openTechVenster('activeren')} data-tech-poort='activeren'>{uk ? 'Увімкнути технічний профіль' : 'Technisch profiel aanzetten'}</button>
        <button type='button' onClick={onAccount} data-tech-poort='account'>{uk ? 'До облікового запису' : 'Naar het account'}</button>
      </div>
    </section>
  );
}
