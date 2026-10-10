// Eén venster «Налаштувати меню» met tabbladen (punt 4): vervangt de losse ⚙ (instellingen) en ✎ (bewerken) in de werkbalk.
//  • Редагування — wat je kunt doen en één knop om het bewerken te starten (slepen, verplaatsen, Ctrl+slepen = kopie, terugzetten).
//  • Вигляд — weergave van de zijbalk als duidelijke keuzekaarten met icoon, en de stijl van de iconen.
//  • Сповіщення й швидкість — korte uitleg + link naar de volledige pagina /menu op id-host (met de juiste sectie open).
// Het venster gebruikt het gezamenlijke vensterbeheer (bovenaan, verplaatsbaar, minimaliseerbaar, Esc sluit).
import { useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { BellRing, MousePointer2, Palette, PanelLeftClose, PanelLeftOpen, PencilRuler } from 'lucide-react';
import type { ZijbalkModus } from '../shared/menu-model';
import { Venster } from './platform/vensters';
import { useZijbalkVoorkeuren, zetZijbalk } from './zijbalk-voorkeuren';
import './menu-instellingen-venster.css';

type Tab = 'bewerken' | 'weergave' | 'meer';
type Props = { lang: 'uk' | 'nl'; modus: ZijbalkModus; onModus: (m: ZijbalkModus) => void; onBewerken?: () => void; instellingenHref: string; onInstellingen: (e: { preventDefault: () => void }) => void; onSluit: () => void };

export default function MenuInstellingenVenster({ lang, modus, onModus, onBewerken, instellingenHref, onInstellingen, onSluit }: Props) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const v = useZijbalkVoorkeuren();
  const [tab, setTab] = useState<Tab>(onBewerken ? 'bewerken' : 'weergave');
  const tabs: Array<[Tab, string]> = [...(onBewerken ? [['bewerken', tr('Редагування', 'Bewerken')] as [Tab, string]] : []), ['weergave', tr('Вигляд', 'Weergave')], ['meer', tr('Сповіщення й швидкість', 'Meldingen en snelheid')]];
  const knoppen = useRef<Array<HTMLButtonElement | null>>([]);
  const pijl = (e: RKeyboardEvent) => {
    const i = tabs.findIndex(([t]) => t === tab), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return; e.preventDefault(); const n = (i + d + tabs.length) % tabs.length; setTab(tabs[n][0]); knoppen.current[n]?.focus();
  };
  const modi: Array<[ZijbalkModus, string, string, typeof MousePointer2]> = [
    ['auto', tr('Автоматично', 'Automatisch'), tr('Вузька смужка; розгортається, коли наводите мишу', 'Smalle strook; klapt open als u de muis erop zet'), MousePointer2],
    ['open', tr('Завжди розгорнута', 'Altijd uitgeklapt'), tr('Меню зливається зі сторінкою, як у Google', 'Het menu loopt naadloos over in de pagina, zoals bij Google'), PanelLeftOpen],
    ['dicht', tr('Завжди згорнута', 'Altijd ingeklapt'), tr('Лише іконки, без розгортання', 'Alleen iconen, zonder openklappen'), PanelLeftClose],
  ];
  return <Venster id='menu-instellingen' titel={tr('Налаштувати меню', 'Menu instellen')} breedte={560} onSluit={onSluit} lang={lang} className='menu-instellingen-venster'>
    <div className='miv' data-menu-instellingen-venster>
      <div className='miv-tabs' role='tablist' aria-label={tr('Розділи налаштувань меню', 'Onderdelen van de menu-instellingen')} onKeyDown={pijl}>
        {tabs.map(([id, naam], i) => <button key={id} ref={(b) => { knoppen.current[i] = b; }} type='button' role='tab' id={`miv-tab-${id}`} aria-controls={`miv-paneel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={tab === id ? 'actief' : ''} onClick={() => setTab(id)} data-miv-tab={id}>{naam}</button>)}
      </div>
      {tab === 'bewerken' && onBewerken && <div className='miv-paneel' role='tabpanel' id='miv-paneel-bewerken' aria-labelledby='miv-tab-bewerken'>
        <p>{tr('У режимі редагування можна:', 'In de bewerkmodus kunt u:')}</p>
        <ul>
          <li>{tr('перетягувати пункти, щоб змінити порядок;', 'items slepen om de volgorde te wijzigen;')}</li>
          <li>{tr('переносити пункти між розділами (Швидкий доступ, основне меню);', 'items verplaatsen tussen secties (Snelle toegang, hoofdmenu);')}</li>
          <li>{tr('Ctrl + перетягнути — дублювати пункт (копія зберігає колір свого розділу);', 'Ctrl + slepen — een item dupliceren (de kopie houdt de kleur van zijn onderdeel);')}</li>
          <li>{tr('повертати пункт до початкового вигляду через його меню «⋯».', 'een item terugzetten via zijn menu «⋯».')}</li>
        </ul>
        <button type='button' className='miv-hoofdknop' data-menu-bewerken-knop aria-pressed='false' onClick={() => { onBewerken(); onSluit(); }}><PencilRuler aria-hidden='true' />{tr('Почати редагування', 'Bewerken starten')}</button>
      </div>}
      {tab === 'weergave' && <div className='miv-paneel' role='tabpanel' id='miv-paneel-weergave' aria-labelledby='miv-tab-weergave'>
        <fieldset className='miv-keuzes' data-miv-modus>
          <legend>{tr('Бічна панель', 'Zijbalk')}</legend>
          {modi.map(([id, naam, uitleg, I]) => <label key={id} className={modus === id ? 'actief' : ''}>
            <input type='radio' name='miv-modus' checked={modus === id} onChange={() => onModus(id)} data-miv-modus-keuze={id} />
            <I aria-hidden='true' /><span><strong>{naam}</strong><small>{uitleg}</small></span>
          </label>)}
        </fieldset>
        <fieldset className='miv-keuzes miv-twee'>
          <legend><Palette aria-hidden='true' />{tr('Іконки', 'Iconen')}</legend>
          {([['klassiek', tr('Класичні', 'Klassiek'), tr('Колір розділу — лише при наведенні й в активного', 'Kleur van het onderdeel alleen bij aanwijzen en actief')], ['kleur', tr('Кольорові', 'Kleurrijk'), tr('Кожен розділ завжди у своєму кольорі', 'Elk onderdeel altijd in zijn eigen kleur')]] as const).map(([id, naam, uitleg]) => <label key={id} className={v.icoonStijl === id ? 'actief' : ''}>
            <input type='radio' name='miv-stijl' checked={v.icoonStijl === id} onChange={() => zetZijbalk({ icoonStijl: id })} />
            <span><strong>{naam}</strong><small>{uitleg}</small></span>
          </label>)}
        </fieldset>
      </div>}
      {tab === 'meer' && <div className='miv-paneel' role='tabpanel' id='miv-paneel-meer' aria-labelledby='miv-tab-meer'>
        <p><BellRing aria-hidden='true' className='miv-inline' />{tr('Мітки сповіщень у меню, тихі години, смужка завантаження в кольорі розділу та підвантаження сторінок — на окремій сторінці налаштувань меню.', 'Meldingsbadges in het menu, stille uren, de laadbalk in de kleur van het onderdeel en vooraf laden — op de aparte pagina met menu-instellingen.')}</p>
        <a className='miv-hoofdknop' href={instellingenHref} data-zijbalk-instellingen-knop onClick={(e) => { onSluit(); onInstellingen(e); }}>{tr('Відкрити всі налаштування меню', 'Alle menu-instellingen openen')}</a>
      </div>}
    </div>
  </Venster>;
}
