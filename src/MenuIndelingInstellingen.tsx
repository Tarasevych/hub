// Instellingen → Меню, fase 2: waar het menu staat (links / rechts / boven / onder), het dock (achtergrondtransparantie 0–60 %,
// vergroting bij aanwijzen — niet bij «minder beweging»), de bewerkmodus openen, en terugzetten (per item of alles) met
// ongedaan maken. Mobiel (≤ 700 px) blijft het menu altijd een lade aan de zijkant.
import { useEffect, useState, type ReactElement } from 'react';
import { Move, PanelBottom, PanelLeft, PanelRight, PanelTop, PencilRuler, RotateCcw } from 'lucide-react';
import { MAX_TRANSPARANTIE, allesTerugzetten, itemTerugzetten, type DockPositie } from '../shared/menu-model';
import { aangepasteItems, ontleed } from '../shared/menu-indeling';
import { MENU_CATALOG } from './menu-preferences';
import { serviceTabLabel } from './service-tab-labels';
import { menuWijzigen, zetMenuBewerken } from './menu-bewerken';
import { useZijbalkVoorkeuren, zetZijbalk } from './zijbalk-voorkeuren';

type Tr = (uk: string, nl: string) => string;
export function itemNaam(item: string, lang: 'uk' | 'nl') {
  const o = ontleed(item), d = MENU_CATALOG.find((e) => e.id === o?.dienst);
  const dienst = d ? d[lang] : o?.dienst || item;
  return o?.pagina ? `${serviceTabLabel(o.pagina, lang)} (${dienst})` : dienst;
}
export default function MenuIndelingInstellingen({ tr }: { tr: Tr }) {
  const v = useZijbalkVoorkeuren(), lang: 'uk' | 'nl' = tr('uk', 'nl') === 'uk' ? 'uk' : 'nl';
  const [minderBeweging, setMinderBeweging] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!m) return;
    const zet = () => setMinderBeweging(m.matches);
    zet(); m.addEventListener?.('change', zet);
    return () => m.removeEventListener?.('change', zet);
  }, []);
  const posities: Array<[DockPositie, string, string, ReactElement]> = [
    ['links', tr('Ліворуч', 'Links'), tr('Бічна панель зліва (як зараз).', 'Zijbalk links (standaard).'), <PanelLeft key='l' />],
    ['rechts', tr('Праворуч', 'Rechts'), tr('Бічна панель справа.', 'Zijbalk rechts.'), <PanelRight key='r' />],
    ['boven', tr('Вгорі', 'Boven'), tr('Док із іконками вгорі екрана.', 'Dock met iconen boven in beeld.'), <PanelTop key='b' />],
    ['onder', tr('Внизу', 'Onder'), tr('Док із іконками внизу, як на Mac чи планшеті.', 'Dock met iconen onderaan, zoals op een Mac of tablet.'), <PanelBottom key='o' />],
  ];
  const dock = v.dock, horizontaal = dock.positie === 'boven' || dock.positie === 'onder';
  const zetDock = (patch: Partial<typeof dock>) => zetZijbalk((cur) => ({ ...cur, dock: { ...cur.dock, ...patch } }));
  const aangepast = aangepasteItems(v), verplaatst = aangepast.filter((x) => x.verplaatst || x.kopieen > 0), alleenVolgorde = aangepast.filter((x) => !x.verplaatst && !x.kopieen).length;
  const bewerken = () => {
    zetMenuBewerken(true);
    window.setTimeout(() => document.querySelector<HTMLElement>('.menu-bewerkbalk button, [data-menu-sleutel] button, [data-menu-sleutel]')?.focus(), 120);
  };
  return <fieldset className='zijbalk-meldingen menu-indeling' data-menu-indeling-instellingen>
    <legend><Move aria-hidden='true' />{tr('Розташування й порядок меню', 'Plaats en indeling van het menu')}</legend>
    <div className='zijbalk-keuze compact menu-positie-keuze' role='radiogroup' aria-label={tr('Де розташоване меню', 'Waar het menu staat')}>
      {posities.map(([id, naam, uitleg, icoon]) => <label key={id} className={dock.positie === id ? 'actief' : ''} data-dock-positie={id}>
        <input type='radio' name='menu-positie' value={id} checked={dock.positie === id} onChange={() => zetDock({ positie: id })} />
        <span className='zijbalk-modus-icoon' aria-hidden='true'>{icoon}</span><span><strong>{naam}</strong><small>{uitleg}</small></span>
      </label>)}
    </div>
    <p className='zijbalk-meldingen-uitleg'>{tr('На телефоні меню завжди відкривається збоку (шухляда). Режим «завжди розгорнута/згорнута» діє лише для бічної панелі.', 'Op een telefoon opent het menu altijd als lade aan de zijkant. De weergave «altijd uitgeklapt/ingeklapt» geldt alleen voor de zijbalk.')}</p>
    <div className='zijbalk-meldingen-groep menu-dock-opties' aria-disabled={!horizontaal} data-dock-opties>
      <label className='zijbalk-meldingen-rij menu-dock-transparantie'>
        <span><strong>{tr('Прозорість фону дока', 'Transparantie van de dockachtergrond')}</strong><small>{tr('0 % — суцільний фон; більше — крізь док видно сторінку (з розмиттям).', '0 % = dichte achtergrond; hoger = de pagina schemert erdoor (met vervaging).')}</small></span>
        <span className='menu-dock-schuif'><input type='range' min={0} max={MAX_TRANSPARANTIE} step={5} value={dock.transparantie} disabled={!horizontaal} aria-valuetext={`${dock.transparantie} %`} data-dock-transparantie onChange={(e) => zetDock({ transparantie: Number(e.target.value) })} /><output>{dock.transparantie} %</output></span>
      </label>
      <label className={`zijbalk-schakel${!horizontaal ? ' uit' : ''}`} data-meld-schakel='vergroting'>
        <input type='checkbox' role='switch' checked={dock.vergroting} disabled={!horizontaal} onChange={(e) => zetDock({ vergroting: e.target.checked })} />
        <span className='zijbalk-schakel-spoor' aria-hidden='true'><i /></span>
        <span><strong>{tr('Збільшувати іконки при наведенні', 'Iconen vergroten bij aanwijzen')}</strong><small>{minderBeweging ? tr('Зараз не діє: у системі ввімкнено «менше анімацій».', 'Werkt nu niet: «minder beweging» staat aan in het systeem.') : tr('Як у доку Mac. Не діє, якщо в системі ввімкнено «менше анімацій».', 'Zoals het Mac-dock. Werkt niet als «minder beweging» aan staat.')}</small></span>
      </label>
    </div>
    <div className='menu-indeling-acties'>
      <button type='button' className='settings-primary' data-menu-bewerken-start onClick={bewerken}><PencilRuler aria-hidden='true' />{tr('Редагувати меню', 'Menu bewerken')}</button>
      <button type='button' data-menu-alles-terug disabled={!aangepast.length && dock.positie === 'links' && !dock.transparantie && !dock.vergroting} onClick={() => menuWijzigen(allesTerugzetten(v), tr('Меню повернуто до стандартного вигляду', 'Menu teruggezet naar de standaardindeling'), lang)}><RotateCcw aria-hidden='true' />{tr('Скинути все', 'Alles terugzetten')}</button>
    </div>
    <p className='zijbalk-meldingen-uitleg'>{tr('У режимі редагування перетягуйте пункти (на сенсорному екрані — довге натискання). Утримуйте Alt або Ctrl, щоб створити копію. З клавіатури: Enter на пункті відкриває дії, Alt+↑/↓ переміщує. Кожну зміну можна скасувати.', 'In de bewerkmodus sleept u items (op een aanraakscherm: lang indrukken). Houd Alt of Ctrl ingedrukt voor een kopie. Met het toetsenbord: Enter op een item opent de acties, Alt+↑/↓ verplaatst. Elke wijziging kunt u ongedaan maken.')}</p>
    {verplaatst.length > 0 && <ul className='menu-aangepast' data-menu-aangepast aria-label={tr('Змінені пункти', 'Aangepaste items')}>
      {verplaatst.map((x) => <li key={x.item} data-menu-aangepast-item={x.item}>
        <span><strong>{itemNaam(x.item, lang)}</strong><small>{[x.verplaatst ? tr('переміщено', 'verplaatst') : '', x.kopieen ? tr(`копій: ${x.kopieen}`, `kopieën: ${x.kopieen}`) : ''].filter(Boolean).join(' · ')}</small></span>
        <button type='button' data-menu-item-terug={x.item} onClick={() => menuWijzigen(itemTerugzetten(v, x.item), tr(`«${itemNaam(x.item, lang)}» повернуто на стандартне місце`, `«${itemNaam(x.item, lang)}» terug op de standaardplek`), lang)}><RotateCcw aria-hidden='true' />{tr('Скинути', 'Terugzetten')}</button>
      </li>)}
    </ul>}
    {alleenVolgorde > 0 && <p className='zijbalk-meldingen-uitleg' data-menu-alleen-volgorde>{tr(`Змінено порядок пунктів: ${alleenVolgorde}.`, `Volgorde aangepast van ${alleenVolgorde} items.`)}</p>}
  </fieldset>;
}
