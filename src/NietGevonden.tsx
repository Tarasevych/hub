// 404-pagina van de app (19.10.2026): elk adres waarvan het eerste padsegment geen tabblad van deze dienst is (hub/id/admin/api/github/huis
// gaven vroeger stil het standaardtabblad). Zelfde opmaak op elke dienst; links naar de start van deze dienst en naar de hub.
import { SearchX } from 'lucide-react';
import { canonicalServiceUrl, resolveCanonicalRoute } from './canoniek-dienst';
import { leesKeuze } from './thema/kern';
import { useThemaStand } from './thema/useThema';
import './niet-gevonden.css';

const DIENST_NAAM: Record<string, { uk: string; nl: string }> = {
  hub: { uk: 'Мій простір', nl: 'Mijn ruimte' },
  identity: { uk: 'Обліковий запис', nl: 'Accountcentrum' },
  mail: { uk: 'Пошта', nl: 'E-mail' },
  cloud: { uk: 'Хмарне сховище', nl: 'Cloudopslag' },
  github: { uk: 'Сховища коду', nl: 'Codeopslag' },
  ai: { uk: 'Штучний інтелект', nl: 'Kunstmatige intelligentie' },
  huis: { uk: 'Розумний дім', nl: 'Slim huis' },
  api: { uk: 'Програмні інтерфейси', nl: 'Koppelingen' },
  admin: { uk: 'Адміністрування', nl: 'Beheer' },
  mcp: { uk: 'Координація агентів', nl: 'Agentcoördinatie' },
};

export default function NietGevonden({ lang }: { lang: 'uk' | 'nl' }) {
  const route = resolveCanonicalRoute();
  const themaStand = useThemaStand();
  const huidigPalet = String(leesKeuze(themaStand.theme, themaStand.palet).palet);
  const isKlassiekPalet = huidigPalet === 'klassiek-wit' || huidigPalet === 'klassiek-zwart';
  const isMaquette = huidigPalet === 'maquette' && !isKlassiekPalet;
  const uk = lang === 'uk';
  const start = canonicalServiceUrl(route.service, '', lang, false);
  const hub = canonicalServiceUrl('hub', '', lang, false);
  const dienst = DIENST_NAAM[route.service]?.[lang] ?? (uk ? 'Мій простір' : 'Mijn ruimte');
  return (
    <section className='niet-gevonden' role='main' aria-labelledby='niet-gevonden-kop' data-niet-gevonden={route.path}>
      {isMaquette && (
        <div className='mq-niet-gevonden-sfeer' aria-hidden='true'>
          <span className='mq-niet-gevonden-halo' />
          <span className='mq-niet-gevonden-raster' />
        </div>
      )}
      {isMaquette && (
        <div className='mq-niet-gevonden-bovenregel'>
          <span className='mq-niet-gevonden-lijn' aria-hidden='true' />
          <span>{uk ? `${dienst} · Сторінка відсутня` : `${dienst} · Pagina ontbreekt`}</span>
          <span className='mq-niet-gevonden-lijn' aria-hidden='true' />
        </div>
      )}
      {isMaquette ? (
        <div className='mq-niet-gevonden-vitrine' aria-hidden='true'>
          <span className='mq-niet-gevonden-baan mq-niet-gevonden-baan-1' />
          <span className='mq-niet-gevonden-baan mq-niet-gevonden-baan-2' />
          <span className='mq-niet-gevonden-orb'>
            <SearchX aria-hidden='true' />
          </span>
        </div>
      ) : (
        <SearchX aria-hidden='true' />
      )}
      <p className='niet-gevonden-code'>{isMaquette ? <><span>4</span><em>0</em><span>4</span></> : '404'}</p>
      <h1 id='niet-gevonden-kop'>{uk ? 'Сторінку не знайдено' : 'Pagina niet gevonden'}</h1>
      <p className='mq-niet-gevonden-uitleg'>{uk ? 'Такої адреси на цьому сайті немає: ' : 'Dit adres bestaat niet op deze site: '}<code>{route.path}</code></p>
      <div className='niet-gevonden-acties'>
        <a className='primary' href={start}>{uk ? 'На початок розділу' : 'Naar de start van dit onderdeel'}</a>
        {route.service !== 'hub' ? <a href={hub}>{uk ? 'До «Мого простору»' : 'Naar «Mijn ruimte»'}</a> : null}
      </div>
    </section>
  );
}
