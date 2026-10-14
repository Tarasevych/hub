// Двері розділу управління: адміністрування, API та сторінки управління всередині користувацьких служб (панель розгортання,
// додатки на сервері, архів, підписаний доступ ШІ) не відкриваються, доки в цій вкладці не увімкнено технічний профіль.
import { openTechVenster } from './tech-store';
import './tech.css';

export default function TechPoort({ lang, onAccount }: { lang: 'uk' | 'nl'; onAccount: () => void }) {
  const uk = lang === 'uk';
  return (
    <section className='tech-poort' data-tech-poort='1'>
      <h1>{uk ? 'Управління сайтом' : 'Beheer van de site'}</h1>
      <p>{uk
        ? 'Ця сторінка стосується управління сайтом, а не вашого облікового запису. Вона відкривається лише в технічному профілі цієї вкладки; у меню облікового запису її немає.'
        : 'Deze pagina gaat over het beheer van de site, niet over uw account. Ze opent alleen in het technisch profiel van dit tabblad; in het accountmenu staat ze niet.'}</p>
      <div className='tech-poort-knoppen'>
        <button type='button' className='is-hoofd' onClick={() => openTechVenster('activeren')} data-tech-poort='activeren'>{uk ? 'Увімкнути технічний профіль' : 'Technisch profiel aanzetten'}</button>
        <button type='button' onClick={onAccount} data-tech-poort='account'>{uk ? 'До облікового запису' : 'Naar het account'}</button>
      </div>
    </section>
  );
}
