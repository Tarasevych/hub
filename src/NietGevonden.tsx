// 404-pagina van de app (19.10.2026): elk adres waarvan het eerste padsegment geen tabblad van deze dienst is (hub/id/admin/api/github/huis
// gaven vroeger stil het standaardtabblad). Zelfde opmaak op elke dienst; links naar de start van deze dienst en naar de hub.
import { SearchX } from 'lucide-react';
import { canonicalServiceUrl, resolveCanonicalRoute } from './canoniek-dienst';
import './niet-gevonden.css';

export default function NietGevonden({ lang }: { lang: 'uk' | 'nl' }) {
  const route = resolveCanonicalRoute();
  const uk = lang === 'uk';
  const start = canonicalServiceUrl(route.service, '', lang, false);
  const hub = canonicalServiceUrl('hub', '', lang, false);
  return (
    <section className='niet-gevonden' role='main' aria-labelledby='niet-gevonden-kop' data-niet-gevonden={route.path}>
      <SearchX aria-hidden='true' />
      <p className='niet-gevonden-code'>404</p>
      <h1 id='niet-gevonden-kop'>{uk ? 'Сторінку не знайдено' : 'Pagina niet gevonden'}</h1>
      <p>{uk ? 'Такої адреси на цьому сайті немає: ' : 'Dit adres bestaat niet op deze site: '}<code>{route.path}</code></p>
      <div className='niet-gevonden-acties'>
        <a className='primary' href={start}>{uk ? 'На початок розділу' : 'Naar de start van dit onderdeel'}</a>
        {route.service !== 'hub' ? <a href={hub}>{uk ? 'До «Мого простору»' : 'Naar «Mijn ruimte»'}</a> : null}
      </div>
    </section>
  );
}
