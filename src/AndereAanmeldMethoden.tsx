// IDENTITEIT-014: «Інші способи входу» в старій панелі способів входу (розділ «Вхід»): стан входу через Telegram зі спільного
// запиту /api/aanmelden/telegram/config (кеш 30 с) і — лише власнику, коли розміщення ввімкнено — перехід до «Розміщення способів
// входу» в адмініструванні (PlaatsingBeheer, admin.tarasevych.com/sso). Тут лише вигляд без запитів; дані дає AndereAanmeldMethodenLaden
// (модуль конфігу Telegram читає window під час завантаження, тож панель вантажить його ліниво).
// Andere aanmeldmethoden in het oude paneel: stand van Telegram en (eigenaar) de plaatsing in Beheer. Lui geladen.
import {ExternalLink,Send} from 'lucide-react';
import type {Lang} from './toegangslaag-teksten';
import type {AanmeldConfig} from './telegram-aanmelden/aanmeld-config';
import {statusNaam} from './telegram-aanmelden/namen';

const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;
const TG_TOON:Record<string,string>={werkt:'good',traag:'warn',storing:'warn'};
export type AndereMethodenProps={lang:Lang;admin:boolean;telegramSectie:boolean};
type Props=AndereMethodenProps;
/** Стан входу через Telegram і (для власника) перехід до розміщення. cfg: undefined — вантажиться, null — недоступно. */
export function AndereMethodenWeergave({lang,admin,telegramSectie,cfg}:Props&{cfg:AanmeldConfig|null|undefined}){
  const stand=cfg?.status?.stand||cfg?.stand||'';
  const badge=cfg===undefined?tr(lang,'Завантаження…','Laden…'):cfg===null?tr(lang,'Стан недоступний','Stand niet beschikbaar'):!cfg.zichtbaar?tr(lang,'Не ввімкнено','Niet ingeschakeld'):statusNaam(lang,stand);
  const toon=cfg&&cfg.zichtbaar?TG_TOON[stand]||'muted':'muted';
  const naarSectieTelegram=()=>{const s=document.querySelector<HTMLElement>('[data-telegram-sectie]');if(!s)return;try{s.scrollIntoView({behavior:'smooth',block:'start'})}catch{/* geen scroll */}s.querySelector<HTMLElement>('button:not(:disabled)')?.focus();};
  return <div className='access-plane-box' data-andere-methoden>
    <div className='access-plane-row' data-access-method='telegram'>
      <Send className='access-plane-row-icon'/>
      <div className='access-plane-row-main'>
        <span className='access-plane-row-title'><strong>Telegram</strong><span className={`access-plane-badge tone-${toon}`} data-telegram-stand={stand||undefined}>{badge}</span></span>
        {cfg!==undefined&&<small>{cfg===null?tr(lang,'Стан не вдалося перевірити — оновіть сторінку пізніше. Інші способи входу це не зачіпає.','De stand kon niet worden gecontroleerd — vernieuw de pagina later. Andere aanmeldmethoden merken hier niets van.')
          :cfg.zichtbaar?tr(lang,'На сторінці входу є кнопка «Увійти через Telegram»: вхід підтверджується в самому Telegram.','Op de aanmeldpagina staat de knop «Aanmelden met Telegram»: u bevestigt in Telegram zelf.')
          :tr(lang,'Кнопки «Увійти через Telegram» на сторінці входу зараз немає.','Op de aanmeldpagina staat nu geen knop «Aanmelden met Telegram».')}</small>}
      </div>
      {telegramSectie&&<div className='access-plane-row-actions'><button type='button' className='secondary' onClick={naarSectieTelegram}><Send/>{tr(lang,'Налаштувати Telegram','Telegram instellen')}</button></div>}
    </div>
    {admin&&cfg?.plaatsing&&<div className='access-plane-row' data-plaatsing-beheer>
      <ExternalLink className='access-plane-row-icon'/>
      <div className='access-plane-row-main'>
        <span className='access-plane-row-title'><strong>{tr(lang,'Розміщення способів входу','Plaatsing van aanmeldmethoden')}</strong></span>
        <small>{tr(lang,'Лише для власника: які кнопки входу бачать усі відвідувачі й у якому порядку. Зміна діє для всіх одразу.','Alleen voor de eigenaar: welke aanmeldknoppen alle bezoekers zien en in welke volgorde. Een wijziging geldt meteen voor iedereen.')}</small>
      </div>
      <div className='access-plane-row-actions'><a className='access-plane-button secondary' href='https://admin.tarasevych.com/sso'><ExternalLink/>{tr(lang,'Відкрити в адмініструванні','Openen in Beheer')}</a></div>
    </div>}
  </div>;
}
