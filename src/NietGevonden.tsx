// 404-pagina van de app (19.10.2026): elk adres waarvan het eerste padsegment geen tabblad van deze dienst is (hub/id/admin/api/github/huis
// gaven vroeger stil het standaardtabblad). Zelfde opmaak op elke dienst; links naar de start van deze dienst en naar de hub.
import { useEffect } from 'react';
import { SearchX } from 'lucide-react';
import { releaseBootShell } from './opstart-schil';
import { leesbaarPad } from './niet-gevonden-pad';
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

/**
 * SITE-001 (пункт 15) · `los`: для людини без входу сторінка стоїть сама, без меню й верхньої смуги застосунку — меню служб
 * без входу нічого не дає, а на ширині 1366 бічне меню накривало картку. Для людини зі входом лишається звична оболонка.
 * nl: `los` — zonder aanmelding staat de pagina op zichzelf, zonder menu en bovenbalk van de app.
 */
export default function NietGevonden({ lang, los = false }: { lang: 'uk' | 'nl'; los?: boolean }) {
  const route = resolveCanonicalRoute();
  const themaStand = useThemaStand();
  const huidigPalet = String(leesKeuze(themaStand.theme, themaStand.palet).palet);
  const isKlassiekPalet = huidigPalet === 'klassiek-wit' || huidigPalet === 'klassiek-zwart';
  const isMaquette = huidigPalet === 'maquette' && !isKlassiekPalet;
  const uk = lang === 'uk';
  const start = canonicalServiceUrl(route.service, '', lang, false);
  const hub = canonicalServiceUrl('hub', '', lang, false);
  const dienst = DIENST_NAAM[route.service]?.[lang] ?? (uk ? 'Мій простір' : 'Mijn ruimte');
  const pad = leesbaarPad(route.path);
  // Заголовок вкладки: людина й пошукова система бачать, що сторінки немає (сервер відповідає кодом 404, server/platform/onbekend-pad.ts).
  useEffect(() => {
    const vorige = document.title;
    document.title = uk ? `Сторінку не знайдено — ${dienst}` : `Pagina niet gevonden — ${dienst}`;
    return () => { document.title = vorige; };
  }, [uk, dienst]);
  useEffect(() => { if (los) releaseBootShell(); }, [los]);
  const kaart = (
    <section className='niet-gevonden' role='main' aria-labelledby='niet-gevonden-kop' data-niet-gevonden={pad}>
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
      <p className='mq-niet-gevonden-uitleg'>{uk ? 'Такої адреси на цьому сайті немає: ' : 'Dit adres bestaat niet op deze site: '}<code>{pad}</code></p>
      <div className='niet-gevonden-acties'>
        <a className='primary' data-hoofdactie='true' href={start}>{uk ? 'На початок розділу' : 'Naar de start van dit onderdeel'}</a>
        {route.service !== 'hub' ? <a data-hoofdactie='false' href={hub}>{uk ? 'До «Мого простору»' : 'Naar «Mijn ruimte»'}</a> : null}
      </div>
    </section>
  );
  return los ? <div className='niet-gevonden-los' data-niet-gevonden-los=''>{kaart}</div> : kaart;
}
