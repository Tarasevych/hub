// Вигляд «Макет» центру облікового запису (IDENTITEIT-007): розмітка, стилі й поведінка макета власника один в один — власна шапка,
// смуга сервісів, герой, картки з елементами макета; під ними в згортаному блоці «Чинні налаштування» — справжні панелі сайту з чинними
// діями та правами. Оболонка сайту на час вигляду схована; тема й мова беруться із сайту, адресу змінює застосунок.
// De weergave «Ontwerp»: het ontwerp van de eigenaar één op één, de echte onderdelen van de site in een inklapbaar blok onder de kaarten.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './maquette-stijlen.css';
import './maquette-omlijsting.css';
import { MAQUETTE_SJABLOON } from './maquette-sjabloon';
import { startMaquette, type Maquette, type MaquetteOpties, type MaquetteWeergave } from './maquette-motor';
import { useThemaStand, zetWeergaveStijl } from '../../thema/useThema';
import type { WeergaveStijl } from '../../thema/weergave-stijl';
import { useZijbalkVoorkeuren, zetZijbalk } from '../../zijbalk-voorkeuren';
import { UITERLIJK_EFFECTEN_STANDAARD } from '../../../shared/uiterlijk';
import { ProfielRuimteKaart } from '../ProfielRuimteKaart';
import { VormgevingKiezer } from '../VormgevingKiezer';
import { GA_NAAR_DIENST } from '../identiteit-vormgeving';
import { AtelierInhoud } from '../atelier-inhoud';

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
  /** IDENTITEIT-015: справжня зміна мови сайту (changeLanguage: cookie, <html lang>, обліковий запис). Echte taalwissel. */
  onTaal?: (lang: 'uk' | 'nl') => void;
};

/** IDENTITEIT-015: зміна в елементі макета → справжнє налаштування сайту. Вигляд (щільність, рух, акцент, ефекти) — у спільних
 *  уподобаннях облікового запису; меню (стиль піктограм, положення, режим) — у налаштуваннях меню. Обидва зберігає сервер.
 *  Wijziging in het ontwerp → echte instelling: weergave via de gedeelde voorkeuren, menu via de zijbalkvoorkeuren. */
export function weergaveNaarSite(patch: Partial<MaquetteWeergave>) {
  const stijl: WeergaveStijl = {};
  if ('dichtheid' in patch) stijl.dichtheid = patch.dichtheid === 'normaal' ? undefined : patch.dichtheid;
  if ('beweging' in patch) stijl.beweging = patch.beweging === 'minder' ? 'minder' : undefined;
  if ('accent' in patch) stijl.accent = patch.accent;
  if ('effecten' in patch) stijl.effecten = patch.effecten === UITERLIJK_EFFECTEN_STANDAARD ? undefined : patch.effecten;
  if (Object.keys(stijl).length) zetWeergaveStijl(stijl);
  if (patch.icoonStijl || patch.positie || patch.modus) {
    zetZijbalk((z) => ({ ...z, ...(patch.icoonStijl ? { icoonStijl: patch.icoonStijl } : {}), ...(patch.modus ? { modus: patch.modus } : {}), ...(patch.positie ? { dock: { ...z.dock, positie: patch.positie } } : {}) }));
  }
}

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

export function IdentiteitMaquette({ lang, actief, secties, onKies, gebruiker, onTaal }: Props) {
  // IDENTITEIT-015: справжній стан сайту для елементів макета (вигляд облікового запису + меню).
  const { stijl } = useThemaStand();
  const zijbalk = useZijbalkVoorkeuren();
  const weergave: MaquetteWeergave = {
    dichtheid: stijl.dichtheid || 'normaal', beweging: stijl.beweging || 'systeem', accent: stijl.accent, effecten: stijl.effecten ?? UITERLIJK_EFFECTEN_STANDAARD,
    icoonStijl: zijbalk.icoonStijl, positie: zijbalk.dock.positie, modus: zijbalk.modus,
  };
  const weergaveRef = useRef(weergave);
  weergaveRef.current = weergave;
  const onTaalRef = useRef(onTaal);
  onTaalRef.current = onTaal;
  const wortel = useRef<HTMLDivElement>(null);
  const motor = useRef<Maquette | null>(null);
  // Гнізда .mq-echt у живій розмітці; картки будуються рядком HTML, тож після кожного перемальовування збираємо їх знову.
  const [gaten, setGaten] = useState<HTMLElement[]>([]);
  // IDENTITEIT-011: один сталий контейнер на розділ. Двигун перемальовує картки рядком HTML і створює нові гнізда, а контейнер
  // лише переноситься в нове гніздо — React-стан панелі (введений текст, відкриті форми) не губиться.
  // Eén vaste houder per onderdeel: bij hertekenen verhuist alleen de houder, de React-toestand van het paneel blijft behouden.
  const houders = useRef(new Map<string, HTMLDivElement>());
  // Панель монтується лише після першого відкриття її блоку «Чинні налаштування» й далі лишається (без зайвих запитів до того).
  const [gemonteerd, setGemonteerd] = useState<ReadonlySet<string>>(() => new Set());
  const onKiesRef = useRef(onKies);
  onKiesRef.current = onKies;
  // Перехід, що почався в самому макеті: зміна адреси у відповідь не має відкривати панель удруге.
  const eigenKeuze = useRef<string | null>(null);

  const verzamelGaten = () => {
    const root = wortel.current;
    if (!root) return;
    const lijst = Array.from(root.querySelectorAll<HTMLElement>('.mq-echt[data-echt]'));
    const open: string[] = [];
    for (const gat of lijst) {
      const id = gat.dataset.echt || '';
      let houder = houders.current.get(id);
      if (!houder) {
        houder = document.createElement('div');
        houder.className = id.startsWith('vormgeving') || id === 'ruimtewissel' ? 'mq-echt-houder' : 'mq-echt-houder mq-echt-inhoud';
        houders.current.set(id, houder);
      }
      if (houder.parentNode !== gat) gat.appendChild(houder);
      const blok = gat.closest('details.mq-echt-blok') as HTMLDetailsElement | null;
      if (!blok || blok.open) open.push(id);
    }
    setGaten(lijst);
    setGemonteerd((oud) => (open.every((id) => oud.has(id)) ? oud : new Set([...oud, ...open])));
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
      weergave: weergaveRef.current,
      bijWeergave: weergaveNaarSite,
      // Без обробника мови (старі виклики) — кнопки змінюють лише тексти макета, як раніше.
      ...(onTaalRef.current ? { bijTaal: (l: 'uk' | 'nl') => onTaalRef.current?.(l) } : {}),
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

  // IDENTITEIT-015: налаштування змінилося на сайті (справжня панель нижче, інший пристрій, меню) — макет показує те саме.
  const weergaveSleutel = JSON.stringify(weergave);
  const vorigeWeergave = useRef(weergaveSleutel);
  useEffect(() => {
    if (vorigeWeergave.current === weergaveSleutel) return;
    vorigeWeergave.current = weergaveSleutel;
    motor.current?.zetWeergave(weergaveRef.current);
  }, [weergaveSleutel]);

  return (
    <>
      <div ref={wortel} className='mr-mq' lang={lang} data-vormgeving='maquette'
        // Розмітка макета незмінна й згенерована з його index.html; динамічні частини малює двигун.
        dangerouslySetInnerHTML={{ __html: MAQUETTE_SJABLOON }} />
      {/* Межі розділів, як у класичному вигляді: гнізда «Способи входу», «Безпека», «Відновлення» показують лише свій розділ. */}
      <AtelierInhoud.Provider value={true}>
        {gaten.map((gat) => {
          const id = gat.dataset.echt || '';
          const houder = houders.current.get(id);
          if (!houder || !gemonteerd.has(id)) return null;
          if (id.startsWith('vormgeving')) return createPortal(<VormgevingKiezer lang={lang} className='mq-kiezer' />, houder, id);
          if (id === 'ruimtewissel') return createPortal(<ProfielRuimteKaart lang={lang} />, houder, id);
          const sectie = secties.find((s) => s.id === naarSite(id));
          return sectie ? createPortal(sectie.inhoud, houder, id) : null;
        })}
      </AtelierInhoud.Provider>
    </>
  );
}
