// Вигляд «Макет» центру облікового запису (IDENTITEIT-007): розмітка, стилі й поведінка макета власника один в один — власна шапка,
// смуга сервісів, герой, картки з елементами макета; під ними в згортаному блоці «Чинні налаштування» — справжні панелі сайту з чинними
// діями та правами. Оболонка сайту на час вигляду схована; тема й мова беруться із сайту, адресу змінює застосунок.
// De weergave «Ontwerp»: het ontwerp van de eigenaar één op één, de echte onderdelen van de site in een inklapbaar blok onder de kaarten.
import { Bell } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './maquette-omlijsting.css';
import type { Maquette, MaquetteLiveStand, MaquetteOpties, MaquetteWeergave } from './maquette-motor';
import { api } from '../../platform/client';
import { ecosystemTabContext } from '../../tab-context';
import { MELDINGEN_OPENEN_EVENT } from '../../canoniek-meldingen';
import { useThemaStand, zetWeergaveStijl } from '../../thema/useThema';
import type { WeergaveStijl } from '../../thema/weergave-stijl';
import { useZijbalkVoorkeuren, zetZijbalk } from '../../zijbalk-voorkeuren';
import { UITERLIJK_EFFECTEN_STANDAARD } from '../../../shared/uiterlijk';
import { ProfielRuimteKaart } from '../ProfielRuimteKaart';
import { VormgevingKiezer } from '../VormgevingKiezer';
import { GA_NAAR_DIENST } from '../identiteit-vormgeving';
import { AtelierInhoud, RuimtewisselElders } from '../atelier-inhoud';

export type MaquetteGebruiker = { naam: string; foto: string } | null;

/** Жива пігулка дзвіночка у верхній смузі «Макета» (MELDPANEEL-003): синхронізує лічильник і стан зі схованою оболонкою сайту. */
function MaquetteBelKnop({ lang }: { lang: 'uk' | 'nl' }) {
  const [teller, setTeller] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return undefined;
    const lees = () => {
      const bel = document.querySelector<HTMLButtonElement>('.canonical-notification-bell');
      if (!bel) return;
      setOpen(bel.getAttribute('aria-expanded') === 'true');
      setTeller((bel.querySelector('small')?.textContent || '').trim());
    };
    lees();
    const doel = document.querySelector('.canonical-chrome') || document.body;
    const w = new MutationObserver(lees);
    w.observe(doel, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-expanded'],
    });
    return () => w.disconnect();
  }, []);

  const label = teller
    ? lang === 'uk'
      ? `Непрочитаних сповіщень: ${teller}`
      : `Ongelezen meldingen: ${teller}`
    : lang === 'uk'
      ? 'Сповіщення'
      : 'Meldingen';

  const klik = () => {
    const bel = document.querySelector<HTMLButtonElement>('.canonical-notification-bell');
    if (bel) {
      bel.click();
      return;
    }
    window.dispatchEvent(new CustomEvent(MELDINGEN_OPENEN_EVENT));
  };

  return (
    <button
      type='button'
      className='mq-bel-knop'
      data-bel-anker='maquette'
      data-qa-id='maquette-notification-bell'
      aria-expanded={open}
      aria-label={label}
      title={label}
      onClick={klik}
    >
      <Bell aria-hidden='true' />
      {teller ? <b className='mq-bel-teller'>{teller}</b> : null}
    </button>
  );
}

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
  /** Ім'я та світлина облікового запису — для аватарів макета (файл тут не обирають; це робить розділ «Обліковий запис»). */
  gebruiker?: MaquetteGebruiker;
  /** IDENTITEIT-015: справжня зміна мови сайту (changeLanguage: cookie, <html lang>, обліковий запис). Echte taalwissel. */
  onTaal?: (lang: 'uk' | 'nl') => void;
};

/** IDENTITEIT-015: зміна в елементі макета → справжнє налаштування сайту. Вигляд (щільність, рух, акцент, ефекти) — у спільних
 *  уподобаннях облікового запису; стиль піктограм — у налаштуваннях меню сайту. Обидва зберігає сервер.
 *  ANKERS-001: положення й поведінка навігації якорів цієї сторінки — власне поле `paginaNav` у тих самих налаштуваннях облікового
 *  запису, а НЕ положення (`dock.positie`) і режим (`modus`) меню сайту: одне меню більше не рухає інше.
 *  Wijziging in het ontwerp → echte instelling; positie en gedrag van de ankernavigatie staan los van het sitemenu. */
export function weergaveNaarSite(patch: Partial<MaquetteWeergave>) {
  const stijl: WeergaveStijl = {};
  if ('dichtheid' in patch) stijl.dichtheid = patch.dichtheid === 'normaal' ? undefined : patch.dichtheid;
  if ('beweging' in patch) stijl.beweging = patch.beweging === 'minder' ? 'minder' : undefined;
  if ('accent' in patch) stijl.accent = patch.accent;
  if ('effecten' in patch) stijl.effecten = patch.effecten === UITERLIJK_EFFECTEN_STANDAARD ? undefined : patch.effecten;
  if (Object.keys(stijl).length) zetWeergaveStijl(stijl);
  if (patch.icoonStijl || patch.positie || patch.modus) {
    zetZijbalk((z) => ({
      ...z,
      ...(patch.icoonStijl ? { icoonStijl: patch.icoonStijl } : {}),
      ...(patch.positie || patch.modus ? { paginaNav: { ...z.paginaNav, ...(patch.positie ? { positie: patch.positie } : {}), ...(patch.modus ? { modus: patch.modus } : {}) } } : {}),
    }));
  }
}

/** Ідентифікатори макета ↔ сайту: лише «identities» ↔ «identity» відрізняються. */
export const naarSite = (id: string) => (id === 'identities' ? 'identity' : id);
export const naarOntwerp = (id: string) => (id === 'identity' ? 'identities' : id);

const helder = () => typeof document !== 'undefined' &&
  (document.documentElement.classList.contains('theme-light') || document.documentElement.classList.contains('theme-plum-light'));

const profiel = (g: MaquetteGebruiker | undefined): MaquetteOpties['profiel'] =>
  g && (g.naam || g.foto) ? { bevestigd: true, naam: g.naam || '', foto: g.foto || '' } : null;

/** Меню облікового запису сайту (інші облікові записи, вихід) живе в схованій оболонці: на ПК у верхній смузі, на телефоні — у шухляді бічного
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
    w.observe(document.body, { childList: true, subtree: false });
    if (trekker) w.observe(trekker, { attributes: true, attributeFilter: ['aria-expanded'] });
    window.setTimeout(() => w.disconnect(), 60_000);
  });
};

export function IdentiteitMaquette({ lang, actief, secties, onKies, gebruiker, onTaal }: Props) {
  // IDENTITEIT-015: справжній стан сайту для елементів макета (вигляд облікового запису + меню).
  const { stijl } = useThemaStand();
  const zijbalk = useZijbalkVoorkeuren();
  const weergave: MaquetteWeergave = {
    dichtheid: stijl.dichtheid || 'normaal', beweging: stijl.beweging || 'systeem', accent: stijl.accent, effecten: stijl.effecten ?? UITERLIJK_EFFECTEN_STANDAARD,
    icoonStijl: zijbalk.icoonStijl, positie: zijbalk.paginaNav.positie, modus: zijbalk.paginaNav.modus, // ANKERS-001: не меню сайту
  };
  const weergaveRef = useRef(weergave);
  weergaveRef.current = weergave;
  const onTaalRef = useRef(onTaal);
  onTaalRef.current = onTaal;
  const actiefRef = useRef(actief);
  actiefRef.current = actief;
  const gebruikerRef = useRef(gebruiker);
  gebruikerRef.current = gebruiker;
  const wortel = useRef<HTMLDivElement>(null);
  const motor = useRef<Maquette | null>(null);
  const liveStandRef = useRef<MaquetteLiveStand | null>(null);
  // Гнізда .mq-echt у живій розмітці; картки будуються рядком HTML, тож після кожного перемальовування збираємо їх знову.
  const [gaten, setGaten] = useState<HTMLElement[]>([]);
  const [belHouder, setBelHouder] = useState<HTMLElement | null>(null);
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
    // ZAVYSANNIA-001: той самий набір гнізд — без нового рендеру всіх порталів.
    setGaten((oud) => (oud.length === lijst.length && oud.every((g, i) => g === lijst[i]) ? oud : lijst));
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
    let actiefMount = true;
    let motorActief: Maquette | null = null;
    let kijker: MutationObserver | null = null;

    void Promise.all([
      import('./maquette-sjabloon'),
      import('./maquette-motor'),
      import('./maquette-stijlen.css'),
    ]).then(([{ MAQUETTE_SJABLOON }, { startMaquette }]) => {
      if (!actiefMount || !wortel.current) return;
      root.innerHTML = MAQUETTE_SJABLOON;
      const topActies = root.querySelector<HTMLElement>('.topbar .top-actions');
      if (topActies) {
        const anker = document.createElement('span');
        anker.className = 'mq-bel-houder';
        const avatar = topActies.querySelector('.top-avatar');
        if (avatar) topActies.insertBefore(anker, avatar);
        else topActies.appendChild(anker);
        setBelHouder(anker);
      }
      const m = startMaquette(root, {
        lang,
        licht: helder(),
        profiel: profiel(gebruikerRef.current),
        bijKies: (id) => { const s = naarSite(id); eigenKeuze.current = s; onKiesRef.current(s); },
        bijOpenen: verzamelGaten,
        bijRender: verzamelGaten,
        bijDienst: (id) => window.dispatchEvent(new CustomEvent(GA_NAAR_DIENST, { detail: id })),
        bijAccountMenu: openAccountMenu,
        weergave: weergaveRef.current,
        bijWeergave: weergaveNaarSite,
        liveStand: liveStandRef.current,
        // Без обробника мови (старі виклики) — кнопки змінюють лише тексти макета, як раніше.
        ...(onTaalRef.current ? { bijTaal: (l: 'uk' | 'nl') => onTaalRef.current?.(l) } : {}),
      });
      motorActief = m;
      motor.current = m;
      if (liveStandRef.current) m.zetLiveStand(liveStandRef.current);
      verzamelGaten();
      // Пряме посилання на розділ: показуємо його зі справжніми налаштуваннями. Типовий розділ — сторінка починається з героя, як макет.
      if (actief && actief !== 'intro' && actief !== TYPISCH) m.ga(naarOntwerp(actief), true);
      if (actiefRef.current !== actief && actiefRef.current && actiefRef.current !== 'intro' && actiefRef.current !== TYPISCH) {
        m.ga(naarOntwerp(actiefRef.current), true);
      }
      // Тема сайту може змінитися, поки вигляд відкритий (перемикач у меню облікового запису або в розділі «Теми»).
      // ZAVYSANNIA-001: лише коли світла/темна справді змінилася — інакше кожна зміна класу <html> (палітра, щільність, технічний
      // профіль) перемальовувала прев’ю карток двигуна.
      let laatsteLicht = helder();
      kijker = new MutationObserver(() => { const l = helder(); if (l === laatsteLicht) return; laatsteLicht = l; m.zetLicht(l); });
      kijker.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    });

    return () => {
      actiefMount = false;
      kijker?.disconnect();
      motorActief?.stop();
      motor.current = null;
      setBelHouder(null);
      root.innerHTML = '';
    };
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

  // З-12: фонове зчитування справжнього живого стану постачальників входу, дозволів і засобів відновлення з сервера.
  useEffect(() => {
    let actiefEffect = true;
    const ctx = { service: 'identity', tabContext: ecosystemTabContext(), sourceOrigin: location.origin };
    void Promise.all([
      api.post('/api/owner/access/snapshot', ctx).then((r) => r.data as Record<string, unknown>).catch(() => null),
      api.post('/api/owner/aanmeld/vnext/aanbieders', ctx).then((r) => r.data as Record<string, unknown>).catch(() => null),
      api.post('/api/owner/sleutelkluis/stand', ctx).then((r) => r.data as Record<string, unknown>).catch(() => null),
      api.post('/api/owner/access/gast-sessies/lijst', ctx).then((r) => r.data as Record<string, unknown>).catch(() => null),
      api.post('/api/owner/session/bootstrap', ctx).then((r) => r.data as Record<string, unknown>).catch(() => null),
    ]).then(([snap, aanb, kluis, gasten, ruimtes]) => {
      if (!actiefEffect) return;
      if (!snap && !aanb && !kluis && !gasten && !ruimtes) return;
      const aanbiedersMap: NonNullable<MaquetteLiveStand['aanbieders']> = {};
      const lijst = Array.isArray(aanb?.aanbieders)
        ? (aanb!.aanbieders as Array<{ id?: string; klaarVoorKoppeling?: boolean; gekoppeld?: unknown }>)
        : [];
      for (const id of ['microsoft', 'discord', 'telegram', 'apple'] as const) {
        const rij = lijst.find((x) => x.id === id);
        if (rij) aanbiedersMap[id] = { klaar: Boolean(rij.klaarVoorKoppeling), gekoppeld: Boolean(rij.gekoppeld) };
      }
      const phone = (snap?.phone && typeof snap.phone === 'object' ? snap.phone : null) as
        | { verified?: boolean; sms?: { klaar?: boolean } }
        | null;
      if (phone) {
        aanbiedersMap.sms = { klaar: Boolean(phone.sms?.klaar), gekoppeld: Boolean(phone.verified) };
      }
      const factors = Array.isArray(snap?.factors)
        ? (snap!.factors as Array<{ id?: string; enrolled?: boolean; count?: number; remaining?: number }>)
        : [];
      const pk = factors.find((f) => f.id === 'passkey');
      const tp = factors.find((f) => f.id === 'totp');
      const rc = factors.find((f) => f.id === 'recovery');
      const kluisStandRuw = String(kluis?.stand || '');
      const kluisStand: 'uit' | 'open' | 'gesloten' | 'onbekend' =
        kluisStandRuw === 'open' || kluisStandRuw === 'gesloten' || kluisStandRuw === 'uit' ? kluisStandRuw : 'onbekend';
      const gastLijst = Array.isArray(gasten?.sessies) ? (gasten!.sessies as Array<{ actief?: boolean }>) : [];
      const ruimteLijst = Array.isArray(ruimtes?.workspaces)
        ? (ruimtes!.workspaces as Array<{ archived?: boolean }>)
        : Array.isArray(ruimtes?.items)
          ? (ruimtes!.items as Array<{ archived?: boolean }>)
          : [];
      const stand: MaquetteLiveStand = {
        ...(Object.keys(aanbiedersMap).length > 0 ? { aanbieders: aanbiedersMap } : {}),
        ...(snap
          ? {
              herstel: {
                passkeys: typeof pk?.count === 'number' ? pk.count : pk?.enrolled ? 1 : 0,
                totpActief: Boolean(tp?.enrolled),
                herstelcodesOver: typeof rc?.remaining === 'number' ? rc.remaining : 0,
                kluisStand,
              },
            }
          : {}),
        ...(gasten || ruimtes
          ? {
              delen: {
                actieveRuimtes: Math.max(1, ruimteLijst.filter((w) => !w?.archived).length),
                gastSessies: gastLijst.filter((g) => g?.actief !== false).length,
              },
            }
          : {}),
      };
      liveStandRef.current = stand;
      motor.current?.zetLiveStand(stand);
    });
    return () => {
      actiefEffect = false;
    };
  }, []);

  return (
    <>
      <div ref={wortel} className='mr-mq' lang={lang} data-vormgeving='maquette' />
      {belHouder ? createPortal(<MaquetteBelKnop lang={lang} />, belHouder, 'mq-bel') : null}
      {/* Межі розділів, як у класичному вигляді: гнізда «Способи входу», «Безпека», «Відновлення» показують лише свій розділ. */}
      <AtelierInhoud.Provider value={true}><RuimtewisselElders.Provider value={true}>
        {gaten.map((gat) => {
          const id = gat.dataset.echt || '';
          const houder = houders.current.get(id);
          if (!houder || !gemonteerd.has(id)) return null;
          if (id.startsWith('vormgeving')) return createPortal(<VormgevingKiezer lang={lang} className='mq-kiezer' />, houder, id);
          if (id === 'ruimtewissel') return createPortal(<ProfielRuimteKaart lang={lang} />, houder, id);
          const sectie = secties.find((s) => s.id === naarSite(id));
          return sectie ? createPortal(sectie.inhoud, houder, id) : null;
        })}
      </RuimtewisselElders.Provider></AtelierInhoud.Provider>
    </>
  );
}
