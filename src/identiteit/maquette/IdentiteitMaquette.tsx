// Вигляд «Макет» центру облікового запису (IDENTITEIT-007): розмітка, стилі й поведінка макета власника один в один — власна шапка,
// смуга сервісів, герой, картки з елементами макета; під ними в згортаному блоці «Чинні налаштування» — справжні панелі сайту з чинними
// діями та правами. Оболонка сайту на час вигляду схована; тема й мова беруться із сайту, адресу змінює застосунок.
// De weergave «Ontwerp»: het ontwerp van de eigenaar één op één, de echte onderdelen van de site in een inklapbaar blok onder de kaarten.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './maquette-stijlen.css';
import './maquette-omlijsting.css';
import { MAQUETTE_SJABLOON } from './maquette-sjabloon';
import { startMaquette, type Maquette, type MaquetteOpties } from './maquette-motor';
import { VormgevingKiezer } from '../VormgevingKiezer';
import { GA_NAAR_DIENST } from '../identiteit-vormgeving';

export type MaquetteGebruiker = { naam: string; foto: string } | null;

/** Типовий розділ адреси: з ним сторінка відкривається на герої макета, як і сам макет; інші розділи прокручуються до себе. */
const TYPISCH = 'personalization';

type Sectie = { id: string; titel: string; inhoud: ReactNode };
type Props = {
  lang: 'uk' | 'nl';
  /** Поточний розділ з адреси (`p.tab`). */
  actief: string;
  secties: readonly Sectie[];
  /** Перехід до розділу користувачем: застосунок змінює адресу. */
  onKies: (id: string) => void;
  /** Ім'я та світлина облікового запису — для аватарів макета (файл тут не обирають; це робить розділ «Акаунт»). */
  gebruiker?: MaquetteGebruiker;
};

/** Ідентифікатори макета ↔ сайту: лише «identities» ↔ «identity» відрізняються. */
export const naarSite = (id: string) => (id === 'identities' ? 'identity' : id);
export const naarOntwerp = (id: string) => (id === 'identity' ? 'identities' : id);

const helder = () => typeof document !== 'undefined' &&
  (document.documentElement.classList.contains('theme-light') || document.documentElement.classList.contains('theme-plum-light'));

const profiel = (g: MaquetteGebruiker | undefined): MaquetteOpties['profiel'] =>
  g && (g.naam || g.foto) ? { bevestigd: true, naam: g.naam || '', foto: g.foto || '' } : null;

/** Меню облікового запису сайту (інші акаунти, вихід) живе в схованій оболонці: на ПК у верхній смузі, на телефоні — у шухляді бічного
 *  меню. Відкриваємо його кнопкою-аватаром сайту; на телефоні спершу відчиняємо шухляду (її показує правило в maquette-omlijsting.css). */
const openAccountMenu = () => {
  const druk = (knop: HTMLButtonElement | null) => { if (knop && knop.getAttribute('aria-expanded') !== 'true') knop.click(); };
  const boven = document.querySelector<HTMLButtonElement>('.canonical-topbar .canonical-avatar-trigger');
  if (boven) { druk(boven); return; }
  const lade = document.querySelector<HTMLButtonElement>('.canonical-chrome .canonical-menu-toggle');
  if (!lade) return;
  const alOpen = Boolean(document.querySelector('.canonical-chrome.sidebar-drawer'));
  if (!alOpen) lade.click();
  // Шухляда малює свою шапку з аватаром після відкриття; тиснемо на нього наступним кадром і прибираємо шухляду після закриття меню.
  requestAnimationFrame(() => {
    const trekker = document.querySelector<HTMLButtonElement>('.canonical-drawer-account .canonical-avatar-trigger');
    druk(trekker);
    if (alOpen || typeof MutationObserver !== 'function') return;
    let gezien = false;
    const w = new MutationObserver(() => {
      const open = Boolean(document.querySelector('.am3-mobiel-laag')) || trekker?.getAttribute('aria-expanded') === 'true';
      if (open) { gezien = true; return; }
      if (!gezien) return;
      w.disconnect();
      if (document.documentElement.dataset.identiteitMaquette !== 'aan') return;
      document.querySelector<HTMLElement>('.canonical-drawer-close, .canonical-sidebar-scrim.drawer')?.click();
    });
    w.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });
    window.setTimeout(() => w.disconnect(), 60_000);
  });
};

export function IdentiteitMaquette({ lang, actief, secties, onKies, gebruiker }: Props) {
  const wortel = useRef<HTMLDivElement>(null);
  const motor = useRef<Maquette | null>(null);
  // Гнізда .mq-echt у живій розмітці; картки будуються рядком HTML, тож після кожного перемальовування збираємо їх знову.
  const [gaten, setGaten] = useState<HTMLElement[]>([]);
  const onKiesRef = useRef(onKies);
  onKiesRef.current = onKies;
  // Перехід, що почався в самому макеті: зміна адреси у відповідь не має відкривати панель удруге.
  const eigenKeuze = useRef<string | null>(null);

  const verzamelGaten = () => {
    const root = wortel.current;
    if (!root) return;
    setGaten(Array.from(root.querySelectorAll<HTMLElement>('.mq-echt[data-echt]')));
  };

  // Оболонка сайту схована, поки вигляд відкритий (правила в maquette-omlijsting.css за цією ознакою).
  useLayoutEffect(() => {
    document.documentElement.dataset.identiteitMaquette = 'aan';
    return () => { delete document.documentElement.dataset.identiteitMaquette; };
  }, []);

  useLayoutEffect(() => {
    const root = wortel.current;
    if (!root) return;
    const m = startMaquette(root, {
      lang,
      licht: helder(),
      profiel: profiel(gebruiker),
      bijKies: (id) => { const s = naarSite(id); eigenKeuze.current = s; onKiesRef.current(s); },
      bijOpenen: verzamelGaten,
      bijRender: verzamelGaten,
      bijDienst: (id) => window.dispatchEvent(new CustomEvent(GA_NAAR_DIENST, { detail: id })),
      bijAccountMenu: openAccountMenu,
    });
    motor.current = m;
    verzamelGaten();
    // Пряме посилання на розділ: показуємо його зі справжніми налаштуваннями. Типовий розділ — сторінка починається з героя, як макет.
    if (actief && actief !== 'intro' && actief !== TYPISCH) m.ga(naarOntwerp(actief), true);
    // Тема сайту може змінитися, поки вигляд відкритий (перемикач у меню облікового запису або в розділі «Теми»).
    const kijker = new MutationObserver(() => m.zetLicht(helder()));
    kijker.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { kijker.disconnect(); m.stop(); motor.current = null; };
    // Мова перезапускає двигун (усі тексти макета — з його словника); решта оновлюється окремими ефектами.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Адреса змінилася ззовні (меню облікового запису, пряме посилання): показуємо розділ і його справжню панель.
  // Початкове значення обробляє запуск двигуна вище (типовий розділ лишає сторінку на герої), тож тут реагуємо лише на зміну.
  const vorige = useRef(actief);
  useEffect(() => {
    const m = motor.current;
    if (!m || !actief || vorige.current === actief) return;
    vorige.current = actief;
    if (eigenKeuze.current === actief) { eigenKeuze.current = null; return; }
    m.ga(naarOntwerp(actief), true);
  }, [actief]);

  useEffect(() => { motor.current?.zetProfiel(profiel(gebruiker)); }, [gebruiker?.naam, gebruiker?.foto]);

  return (
    <>
      <div ref={wortel} className='mr-mq' lang={lang} data-vormgeving='maquette'
        // Розмітка макета незмінна й згенерована з його index.html; динамічні частини малює двигун.
        dangerouslySetInnerHTML={{ __html: MAQUETTE_SJABLOON }} />
      {gaten.map((gat) => {
        const id = gat.dataset.echt || '';
        if (id.startsWith('vormgeving')) return createPortal(<VormgevingKiezer lang={lang} className='mq-kiezer' />, gat, id);
        const sectie = secties.find((s) => s.id === naarSite(id));
        return sectie ? createPortal(<div className='mq-echt-inhoud'>{sectie.inhoud}</div>, gat, id) : null;
      })}
    </>
  );
}
