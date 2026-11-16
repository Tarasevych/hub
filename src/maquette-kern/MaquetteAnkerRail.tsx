// Перетягувана на 4 сторони якірна навігація розділів або вкладок піддомену «Макет» (MAQUETTE-001).
// Вимірює справжні межі .canonical-workspace через ResizeObserver, зберігає положення в localStorage,
// показує відсоток перегляду та на вузьких екранах (<= 960px) перетворюється на липку підсмугу розділів.
// Versleepbare ankernavigatie voor 4 zijden met echte werkgebiedmeting en mobiele sectiebalk.

import {
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Settings, type LucideIcon } from 'lucide-react';
import { useIsKlassiekMaquette } from './klassiek-hulp';

export type MaquetteRailZijde = 'rechts' | 'links' | 'boven' | 'onder';
export type MaquetteAnkerSoort = 'item' | 'groep' | 'actie';

export interface MaquetteAnkerItem {
  id: string;
  label: string;
  badge?: string | number;
  icoon?: LucideIcon | ReactNode;
  soort?: MaquetteAnkerSoort;
  actiefBij?: ReadonlyArray<string>;
  kinderen?: ReadonlyArray<MaquetteAnkerItem>;
  openStandaard?: boolean;
  kiesbaar?: boolean;
  onActie?: () => void;
}

export interface MaquetteAnkerRailProps {
  lang: 'uk' | 'nl';
  titel: string;
  ondertitel?: string;
  items: ReadonlyArray<MaquetteAnkerItem>;
  actief: string;
  onKies: (id: string) => void;
  opslagSleutel?: string;
}

const OPSLAG_SLEUTEL = 'mr-maquette-rail-v1';
const OPSLAG_SLEUTEL_KLASSIEK = 'mr-klassiek-rail-v1';
const CIRKEL_OMTREK = 113.097;

interface OpgeslagenRailStaat {
  zijde: MaquetteRailZijde;
  compact: boolean;
  perSleutel?: Record<string, { zijde?: MaquetteRailZijde; compact?: boolean }>;
}

interface OpgeslagenKlassiekRailStaat {
  zijde: MaquetteRailZijde;
  compact: boolean;
  ingeklapt: boolean;
  perSleutel?: Record<
    string,
    { zijde?: MaquetteRailZijde; compact?: boolean; ingeklapt?: boolean }
  >;
}

const GELDIGE_ZIJDEN: ReadonlySet<string> = new Set(['rechts', 'links', 'boven', 'onder']);

function isZijde(waarde: unknown): waarde is MaquetteRailZijde {
  return typeof waarde === 'string' && GELDIGE_ZIJDEN.has(waarde);
}

function leesRailStaat(extraSleutel?: string): { zijde: MaquetteRailZijde; compact: boolean } {
  if (typeof window === 'undefined') {
    return { zijde: 'rechts', compact: false };
  }
  try {
    const rauw = window.localStorage.getItem(OPSLAG_SLEUTEL);
    if (!rauw) return { zijde: 'rechts', compact: false };
    const data = JSON.parse(rauw) as Partial<OpgeslagenRailStaat>;
    const specifiek = extraSleutel && data.perSleutel ? data.perSleutel[extraSleutel] : undefined;
    const zijde = isZijde(specifiek?.zijde)
      ? specifiek.zijde
      : isZijde(data.zijde)
        ? data.zijde
        : 'rechts';
    const compact =
      typeof specifiek?.compact === 'boolean'
        ? specifiek.compact
        : typeof data.compact === 'boolean'
          ? data.compact
          : false;
    return { zijde, compact };
  } catch {
    return { zijde: 'rechts', compact: false };
  }
}

function schrijfRailStaat(
  zijde: MaquetteRailZijde,
  compact: boolean,
  extraSleutel?: string,
): void {
  if (typeof window === 'undefined') return;
  try {
    let huidig: Partial<OpgeslagenRailStaat> = {};
    const rauw = window.localStorage.getItem(OPSLAG_SLEUTEL);
    if (rauw) {
      const parsed = JSON.parse(rauw) as unknown;
      if (parsed && typeof parsed === 'object') {
        huidig = parsed as Partial<OpgeslagenRailStaat>;
      }
    }
    const volgende: OpgeslagenRailStaat = {
      zijde,
      compact,
      perSleutel: extraSleutel
        ? { ...(huidig.perSleutel ?? {}), [extraSleutel]: { zijde, compact } }
        : huidig.perSleutel,
    };
    window.localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(volgende));
  } catch {
    // Ігноруємо помилки запису в обмеженому режимі оглядача
  }
}

function leesKlassiekRailStaat(extraSleutel?: string): {
  zijde: MaquetteRailZijde;
  compact: boolean;
  ingeklapt: boolean;
} {
  if (typeof window === 'undefined') {
    return { zijde: 'rechts', compact: false, ingeklapt: true };
  }
  try {
    const rauw = window.localStorage.getItem(OPSLAG_SLEUTEL_KLASSIEK);
    if (!rauw) return { zijde: 'rechts', compact: false, ingeklapt: true };
    const data = JSON.parse(rauw) as Partial<OpgeslagenKlassiekRailStaat>;
    const specifiek = extraSleutel && data.perSleutel ? data.perSleutel[extraSleutel] : undefined;
    const zijde = isZijde(specifiek?.zijde)
      ? specifiek.zijde
      : isZijde(data.zijde)
        ? data.zijde
        : 'rechts';
    const compact =
      typeof specifiek?.compact === 'boolean'
        ? specifiek.compact
        : typeof data.compact === 'boolean'
          ? data.compact
          : false;
    const ingeklapt =
      typeof specifiek?.ingeklapt === 'boolean'
        ? specifiek.ingeklapt
        : typeof data.ingeklapt === 'boolean'
          ? data.ingeklapt
          : true;
    return { zijde, compact, ingeklapt };
  } catch {
    return { zijde: 'rechts', compact: false, ingeklapt: true };
  }
}

function schrijfKlassiekRailStaat(
  zijde: MaquetteRailZijde,
  compact: boolean,
  ingeklapt: boolean,
  extraSleutel?: string,
): void {
  if (typeof window === 'undefined') return;
  try {
    let huidig: Partial<OpgeslagenKlassiekRailStaat> = {};
    const rauw = window.localStorage.getItem(OPSLAG_SLEUTEL_KLASSIEK);
    if (rauw) {
      const parsed = JSON.parse(rauw) as unknown;
      if (parsed && typeof parsed === 'object') {
        huidig = parsed as Partial<OpgeslagenKlassiekRailStaat>;
      }
    }
    const volgende: OpgeslagenKlassiekRailStaat = {
      zijde,
      compact,
      ingeklapt,
      perSleutel: extraSleutel
        ? { ...(huidig.perSleutel ?? {}), [extraSleutel]: { zijde, compact, ingeklapt } }
        : huidig.perSleutel,
    };
    window.localStorage.setItem(OPSLAG_SLEUTEL_KLASSIEK, JSON.stringify(volgende));
  } catch {
    // Ігноруємо помилки запису в обмеженому режимі оглядача
  }
}

function heeftExactActief(item: MaquetteAnkerItem, actief: string): boolean {
  if (item.id === actief) return true;
  if (item.actiefBij?.includes(actief)) return true;
  return false;
}

function heeftActiefInTak(item: MaquetteAnkerItem, actief: string): boolean {
  if (heeftExactActief(item, actief)) return true;
  return Boolean(item.kinderen?.some((kind) => heeftActiefInTak(kind, actief)));
}

function vindActiefItem(items: ReadonlyArray<MaquetteAnkerItem>, actief: string): MaquetteAnkerItem | null {
  for (const item of items) {
    if (item.kinderen?.length) {
      const diep = vindActiefItem(item.kinderen, actief);
      if (diep) return diep;
    }
    if (heeftExactActief(item, actief)) return item;
  }
  return items[0] ?? null;
}

function verzamelOpenGroepen(
  items: ReadonlyArray<MaquetteAnkerItem>,
  actief: string,
  doel: Set<string>,
): void {
  for (const item of items) {
    if (item.kinderen && item.kinderen.length > 0) {
      if (item.openStandaard || heeftActiefInTak(item, actief)) {
        doel.add(item.id);
      }
      verzamelOpenGroepen(item.kinderen, actief, doel);
    }
  }
}

function renderIcoon(icoon: MaquetteAnkerItem['icoon'], volgnummer: string): ReactNode {
  if (!icoon) {
    return <span className="mq-anker-nummer">{volgnummer}</span>;
  }
  if (isValidElement(icoon)) {
    return (
      <span className="mq-anker-icoon" aria-hidden="true">
        {icoon}
      </span>
    );
  }
  if (typeof icoon === 'function' || typeof icoon === 'object') {
    const IcoonComp = icoon as LucideIcon;
    return (
      <span className="mq-anker-icoon" aria-hidden="true">
        <IcoonComp size={17} strokeWidth={1.85} />
      </span>
    );
  }
  return <span className="mq-anker-nummer">{volgnummer}</span>;
}

const RAIL_TEKSTEN = {
  uk: {
    sleepSub: 'Перетягніть до краю',
    compactKnop: 'Компактний режим панелі',
    instellingenKnop: 'Налаштувати положення панелі',
    navAria: 'Навігація за розділами',
    voortgang: 'Переглянуто',
    helpAria: 'Що показує колова шкала?',
    helpTitel: 'Показує, яку частину сторінки вже переглянуто.',
    popoverBoven: 'ПОЛОЖЕННЯ ЯКОРІВ',
    popoverTitel: 'Розташуйте як зручно',
    sluiten: 'Закрити',
    links: 'Ліворуч',
    rechts: 'Праворуч',
    boven: 'Згори',
    onder: 'Знизу',
    compactRij: 'Компактна ширина',
    aan: 'Увімкнено',
    uit: 'Вимкнено',
    inklapKnop: 'Згорнути',
    inklapRij: 'Згорнути до капсули',
    inklapAria: 'Згорнути панель розділів',
    uitklapAria: 'Розгорнути панель розділів',
    sectiesPil: 'Розділи',
    tip: 'Ви також можете перетягнути шапку панелі до будь-якого з чотирьох країв робочої області.',
    mobielOpen: 'Відкрити розділи сторінки',
    mobielSluit: 'Закрити перелік розділів',
  },
  nl: {
    sleepSub: 'Sleep naar een rand',
    compactKnop: 'Compacte weergave',
    instellingenKnop: 'Paneelpositie instellen',
    navAria: 'Sectienavigatie',
    voortgang: 'Gelezen',
    helpAria: 'Wat geeft deze cirkel aan?',
    helpTitel: 'Geeft aan welk deel van de pagina is bekeken.',
    popoverBoven: 'ANKERPOSITIE',
    popoverTitel: 'Plaats zoals gewenst',
    sluiten: 'Sluiten',
    links: 'Links',
    rechts: 'Rechts',
    boven: 'Boven',
    onder: 'Onder',
    compactRij: 'Compacte breedte',
    aan: 'Aan',
    uit: 'Uit',
    inklapKnop: 'Inklappen',
    inklapRij: 'Inklappen tot capsule',
    inklapAria: 'Sectiepaneel inklappen',
    uitklapAria: 'Sectiepaneel uitklappen',
    sectiesPil: 'Secties',
    tip: 'U kunt de kop van het paneel ook rechtstreeks naar een van de vier randen van het werkgebied slepen.',
    mobielOpen: 'Onderdelen van de pagina openen',
    mobielSluit: 'Onderdelenlijst sluiten',
  },
} as const;

function berekenDichtstbijzijndeZijde(clientX: number, clientY: number): MaquetteRailZijde {
  const ws = document.querySelector<HTMLElement>('.canonical-workspace');
  const r = ws ? ws.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const afstanden: Array<{ zijde: MaquetteRailZijde; waarde: number }> = [
    { zijde: 'links', waarde: Math.abs(clientX - r.left) },
    { zijde: 'rechts', waarde: Math.abs(r.right - clientX) },
    { zijde: 'boven', waarde: Math.abs(clientY - r.top) },
    { zijde: 'onder', waarde: Math.abs(r.bottom - clientY) },
  ];
  afstanden.sort((a, b) => a.waarde - b.waarde);
  return afstanden[0].zijde;
}

export function MaquetteAnkerRail({
  lang,
  titel,
  ondertitel,
  items,
  actief,
  onKies,
  opslagSleutel,
}: MaquetteAnkerRailProps) {
  const taal = lang === 'nl' ? 'nl' : 'uk';
  const isKlassiek = useIsKlassiekMaquette();
  const t = RAIL_TEKSTEN[taal];

  const [maquetteStaat, setMaquetteStaat] = useState(() => leesRailStaat(opslagSleutel));
  const [klassiekStaat, setKlassiekStaat] = useState(() => leesKlassiekRailStaat(opslagSleutel));
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);
  const [mobielOpen, setMobielOpen] = useState<boolean>(false);
  const [uitlegOpen, setUitlegOpen] = useState<boolean>(false);
  const [voortgang, setVoortgang] = useState<number>(0);
  const [sleepDoel, setSleepDoel] = useState<MaquetteRailZijde | null>(null);
  const [openGroepen, setOpenGroepen] = useState<ReadonlySet<string>>(() => {
    const begin = new Set<string>();
    verzamelOpenGroepen(items, actief, begin);
    return begin;
  });

  useEffect(() => {
    setMaquetteStaat(leesRailStaat(opslagSleutel));
    setKlassiekStaat(leesKlassiekRailStaat(opslagSleutel));
  }, [opslagSleutel]);

  // Автоматично розкриваємо батьківські групи для активного елемента або позначки openStandaard.
  // MAILANKER-001: лише коли змінився активний пункт або з'явилася нова група. Раніше це спрацьовувало на кожен
  // рендер (масив items щоразу новий), тож групу з активним пунктом неможливо було згорнути — вона одразу відкривалася.
  // Alleen bij een nieuw actief item of een nieuwe groep; anders klapte een groep met het actieve item meteen weer open.
  const bekendeGroepenRef = useRef<Set<string> | null>(null);
  const vorigActiefRef = useRef<string>(actief);
  useEffect(() => {
    const alleGroepen = new Set<string>();
    const nieuweGroepen: MaquetteAnkerItem[] = [];
    const eerste = bekendeGroepenRef.current === null;
    const loop = (lijst: ReadonlyArray<MaquetteAnkerItem>) => {
      for (const item of lijst) {
        if (!item.kinderen?.length) continue;
        alleGroepen.add(item.id);
        if (!eerste && !bekendeGroepenRef.current?.has(item.id)) nieuweGroepen.push(item);
        loop(item.kinderen);
      }
    };
    loop(items);
    bekendeGroepenRef.current = alleGroepen;
    const actiefGewijzigd = vorigActiefRef.current !== actief;
    vorigActiefRef.current = actief;
    if (eerste) return; // початковий стан уже враховано в useState
    const nodig = new Set<string>();
    if (actiefGewijzigd) {
      const loopActief = (lijst: ReadonlyArray<MaquetteAnkerItem>) => {
        for (const item of lijst) {
          if (!item.kinderen?.length) continue;
          if (heeftActiefInTak(item, actief)) nodig.add(item.id);
          loopActief(item.kinderen);
        }
      };
      loopActief(items);
    }
    for (const groep of nieuweGroepen) {
      if (groep.openStandaard || heeftActiefInTak(groep, actief)) nodig.add(groep.id);
    }
    if (nodig.size === 0) return;
    setOpenGroepen((oud) => {
      let gewijzigd = false;
      const nieuw = new Set(oud);
      nodig.forEach((id) => {
        if (!nieuw.has(id)) {
          nieuw.add(id);
          gewijzigd = true;
        }
      });
      return gewijzigd ? nieuw : oud;
    });
  }, [items, actief]);

  const zijde = isKlassiek ? klassiekStaat.zijde : maquetteStaat.zijde;
  const compact = isKlassiek ? klassiekStaat.compact : maquetteStaat.compact;
  const ingeklapt = isKlassiek ? klassiekStaat.ingeklapt : false;
  const toonAlsPil = isKlassiek && ingeklapt && !mobielOpen;

  const ankerPlekRef = useRef<HTMLDivElement>(null);
  const lijstRef = useRef<HTMLDivElement>(null);
  // ANKERS-002: довгий перелік прокручується всередині меню; активний пункт сам стає видимим (не ховається за нижнім краєм).
  // Het actieve anker schuift binnen de lijst in beeld, ook als de lijst langer is dan het scherm.
  useEffect(() => {
    const lijst = lijstRef.current;
    if (!lijst || lijst.scrollHeight <= lijst.clientHeight + 1) return;
    const knop = lijst.querySelector<HTMLElement>('.is-actief');
    if (!knop) return;
    const l = lijst.getBoundingClientRect(), k = knop.getBoundingClientRect();
    if (k.top < l.top + 8) lijst.scrollTop -= l.top + 8 - k.top;
    else if (k.bottom > l.bottom - 8) lijst.scrollTop += k.bottom - (l.bottom - 8);
  }, [actief, items.length]); // niet [items]: dat is bij elke render een nieuwe array en zou handmatig scrollen terugzetten
  const railRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const grenzenCacheRef = useRef(new WeakMap<HTMLElement, string>());
  const zojuistGesleeptRef = useRef<boolean>(false);
  const sleepStaat = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    actief: boolean;
  } | null>(null);

  const actiefItem = useMemo(
    () => vindActiefItem(items, actief),
    [items, actief],
  );

  const pasZijdeToe = useCallback(
    (nieuweZijde: MaquetteRailZijde) => {
      if (isKlassiek) {
        setKlassiekStaat((oud) => {
          schrijfKlassiekRailStaat(nieuweZijde, oud.compact, oud.ingeklapt, opslagSleutel);
          return { ...oud, zijde: nieuweZijde };
        });
      } else {
        setMaquetteStaat((oud) => {
          schrijfRailStaat(nieuweZijde, oud.compact, opslagSleutel);
          return { ...oud, zijde: nieuweZijde };
        });
      }
    },
    [isKlassiek, opslagSleutel],
  );

  const wisselCompact = useCallback(() => {
    if (isKlassiek) {
      setKlassiekStaat((oud) => {
        const nieuw = !oud.compact;
        schrijfKlassiekRailStaat(oud.zijde, nieuw, oud.ingeklapt, opslagSleutel);
        return { ...oud, compact: nieuw };
      });
    } else {
      setMaquetteStaat((oud) => {
        const nieuw = !oud.compact;
        schrijfRailStaat(oud.zijde, nieuw, opslagSleutel);
        return { ...oud, compact: nieuw };
      });
    }
  }, [isKlassiek, opslagSleutel]);

  const pasIngeklaptToe = useCallback(
    (nieuweIngeklapt: boolean) => {
      setKlassiekStaat((oud) => {
        schrijfKlassiekRailStaat(oud.zijde, oud.compact, nieuweIngeklapt, opslagSleutel);
        return { ...oud, ingeklapt: nieuweIngeklapt };
      });
    },
    [opslagSleutel],
  );

  const wisselGroep = useCallback((id: string) => {
    setOpenGroepen((oud) => {
      const nieuw = new Set(oud);
      if (nieuw.has(id)) {
        nieuw.delete(id);
      } else {
        nieuw.add(id);
      }
      return nieuw;
    });
  }, []);

  // Синхронізуємо ознаки відступу на найближчій оболонці .mq-schil (у Класиці при згорнутій капсулі не звужуємо робочу область!)
  useLayoutEffect(() => {
    const anker = ankerPlekRef.current;
    const schil =
      anker?.closest<HTMLElement>('.mq-schil') ??
      document.querySelector<HTMLElement>('.canonical-workspace .mq-schil');
    if (!schil) return;
    if (isKlassiek && ingeklapt) {
      schil.removeAttribute('data-mq-rail-zijde');
      schil.removeAttribute('data-mq-rail-compact');
      schil.setAttribute('data-mq-rail-ingeklapt', 'ja');
    } else {
      schil.setAttribute('data-mq-rail-zijde', zijde);
      schil.setAttribute('data-mq-rail-compact', compact ? 'ja' : 'nee');
      schil.setAttribute('data-mq-rail-ingeklapt', 'nee');
    }
    return () => {
      schil.removeAttribute('data-mq-rail-zijde');
      schil.removeAttribute('data-mq-rail-compact');
      schil.removeAttribute('data-mq-rail-ingeklapt');
    };
  }, [zijde, compact, isKlassiek, ingeklapt]);

  // Вимірюємо справжні межі .canonical-workspace, бічного меню та верхньої смуги через ResizeObserver
  const meetGrenzen = useCallback(() => {
    if (typeof window === 'undefined') return;
    const rail = railRef.current;
    if (!rail) return;

    const chrome = document.querySelector<HTMLElement>('.canonical-chrome');
    const ws = document.querySelector<HTMLElement>('.canonical-workspace');
    const sb = document.querySelector<HTMLElement>('.canonical-sidebar');
    const topAnker = document.querySelector<HTMLElement>('.canonical-topbar .canonical-account-anchor');

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wsRect = ws ? ws.getBoundingClientRect() : { left: 0, top: 0, right: vw, bottom: vh };

    let links = Math.max(0, Math.round(wsRect.left));
    let rechts = Math.max(0, Math.round(vw - wsRect.right));
    let boven = Math.max(0, Math.round(wsRect.top));
    let onder = Math.max(0, Math.round(vh - wsRect.bottom));

    const isLadeModus = Boolean(chrome?.classList.contains('sidebar-drawer-mode'));
    const focusMail = chrome?.getAttribute('data-focus-mode') === 'mail';
    const dock = chrome?.getAttribute('data-dock') || 'links';

    if (sb && !isLadeModus && !focusMail) {
      const sbRect = sb.getBoundingClientRect();
      if (sbRect.width > 0 && sbRect.height > 0) {
        if (dock === 'rechts') {
          rechts = Math.max(rechts, Math.round(vw - sbRect.left));
        } else if (dock === 'boven') {
          boven = Math.max(boven, Math.round(sbRect.bottom));
        } else if (dock === 'onder') {
          onder = Math.max(onder, Math.round(vh - sbRect.top));
        } else {
          // Якщо бічне меню відкрите лише наведенням миші, не смикаємо рейку різко, крім закріпленого стану
          const isHover = Boolean(chrome?.classList.contains('sidebar-hover') && !chrome?.classList.contains('sidebar-pinned'));
          links = Math.max(links, isHover ? 56 : Math.round(sbRect.right));
        }
      }
    }

    if (topAnker) {
      const topRect = topAnker.getBoundingClientRect();
      if (topRect.height > 0) {
        boven = Math.max(boven, Math.round(topRect.bottom + 4));
      }
    } else {
      boven = Math.max(boven, 60);
    }

    const sleutel = `${links}|${rechts}|${boven}|${onder}`;
    const pasToe = (el: HTMLElement | null) => {
      if (!el) return;
      if (grenzenCacheRef.current.get(el) === sleutel) return;
      grenzenCacheRef.current.set(el, sleutel);
      el.style.setProperty('--mq-kern-links', `${links}px`);
      el.style.setProperty('--mq-kern-rechts', `${rechts}px`);
      el.style.setProperty('--mq-kern-boven', `${boven}px`);
      el.style.setProperty('--mq-kern-onder', `${onder}px`);
    };

    pasToe(rail);
    pasToe(popoverRef.current);
  }, []);

  useLayoutEffect(() => {
    meetGrenzen();
    if (typeof window === 'undefined') return;

    const ws = document.querySelector<HTMLElement>('.canonical-workspace');
    const sb = document.querySelector<HTMLElement>('.canonical-sidebar');
    const topAnker = document.querySelector<HTMLElement>('.canonical-topbar .canonical-account-anchor');
    const chrome = document.querySelector<HTMLElement>('.canonical-chrome');

    let raf = 0;
    const plan = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        meetGrenzen();
      });
    };

    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(plan) : null;
    if (ro) {
      if (ws) ro.observe(ws);
      if (sb) ro.observe(sb);
      if (topAnker) ro.observe(topAnker);
    }

    const mo =
      typeof MutationObserver === 'function' && chrome
        ? new MutationObserver(plan)
        : null;
    if (mo && chrome) {
      mo.observe(chrome, {
        attributes: true,
        attributeFilter: ['class', 'data-dock', 'data-focus-mode'],
      });
    }

    window.addEventListener('resize', plan);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener('resize', plan);
    };
  }, [meetGrenzen, popoverOpen, mobielOpen, isKlassiek, ingeklapt]);

  // Відстежуємо відсоток прокрутки .canonical-workspace
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ws = document.querySelector<HTMLElement>('.canonical-workspace');

    const berekenVoortgang = () => {
      let nieuw = 0;
      if (ws) {
        const max = ws.scrollHeight - ws.clientHeight;
        if (max > 4) {
          const pct = Math.round((ws.scrollTop / max) * 100);
          nieuw = Math.min(100, Math.max(0, pct));
        }
      } else {
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        if (max > 4) {
          const pct = Math.round((window.scrollY / max) * 100);
          nieuw = Math.min(100, Math.max(0, pct));
        }
      }
      setVoortgang((vorige) => (vorige === nieuw ? vorige : nieuw));
    };

    let raf = 0;
    const plan = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        berekenVoortgang();
      });
    };

    berekenVoortgang();
    ws?.addEventListener('scroll', plan, { passive: true });
    window.addEventListener('scroll', plan, { passive: true });
    window.addEventListener('resize', plan);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ws?.removeEventListener('scroll', plan);
      window.removeEventListener('scroll', plan);
      window.removeEventListener('resize', plan);
    };
  }, [items.length]);

  // Закриття спливного вікна та мобільного списку клавішею Escape або кліком зовні
  useEffect(() => {
    if (!popoverOpen && !mobielOpen && !uitlegOpen) return;
    const bijToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopoverOpen(false);
        setMobielOpen(false);
        setUitlegOpen(false);
      }
    };
    const bijKlikBuiten = (e: MouseEvent) => {
      const doel = e.target as Node | null;
      if (!doel) return;
      if (popoverOpen) {
        if (popoverRef.current?.contains(doel)) return;
        if (railRef.current?.contains(doel)) return;
        if (ankerPlekRef.current?.contains(doel)) return;
        setPopoverOpen(false);
      }
      if (uitlegOpen && !railRef.current?.contains(doel)) {
        setUitlegOpen(false);
      }
    };
    window.addEventListener('keydown', bijToets);
    window.addEventListener('mousedown', bijKlikBuiten);
    return () => {
      window.removeEventListener('keydown', bijToets);
      window.removeEventListener('mousedown', bijKlikBuiten);
    };
  }, [popoverOpen, mobielOpen, uitlegOpen]);

  // Перетягування шапки рейки або згорнутої капсули до будь-якого з 4 країв
  const startSlepen = (e: ReactPointerEvent<HTMLElement>) => {
    const doelEl = e.target as HTMLElement | null;
    if (doelEl?.closest('button:not(.mq-anker-ingeklapt-pil)')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    zojuistGesleeptRef.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    sleepStaat.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      actief: false,
    };
  };

  const beweegSlepen = (e: ReactPointerEvent<HTMLElement>) => {
    const st = sleepStaat.current;
    if (!st || st.pointerId !== e.pointerId) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.actief && Math.hypot(dx, dy) < 7) return;
    st.actief = true;
    setSleepDoel(berekenDichtstbijzijndeZijde(e.clientX, e.clientY));
  };

  const eindigSlepen = (e: ReactPointerEvent<HTMLElement>) => {
    const st = sleepStaat.current;
    if (!st || st.pointerId !== e.pointerId) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    if (st.actief) {
      zojuistGesleeptRef.current = true;
      const gekozen = berekenDichtstbijzijndeZijde(e.clientX, e.clientY);
      pasZijdeToe(gekozen);
    }
    sleepStaat.current = null;
    setSleepDoel(null);
  };

  const annuleerSlepen = () => {
    sleepStaat.current = null;
    setSleepDoel(null);
  };

  const kiesOnderdeel = (item: MaquetteAnkerItem) => {
    if (item.onActie) {
      item.onActie();
    } else {
      onKies(item.id);
    }
    setMobielOpen(false);
  };

  const klikGroep = (item: MaquetteAnkerItem) => {
    const isKiesbaar = item.kiesbaar ?? item.soort !== 'groep';
    if (!isKiesbaar) {
      wisselGroep(item.id);
      return;
    }
    setOpenGroepen((oud) => {
      if (oud.has(item.id)) return oud;
      const nieuw = new Set(oud);
      nieuw.add(item.id);
      return nieuw;
    });
    kiesOnderdeel(item);
  };

  const openVanuitPil = () => {
    if (zojuistGesleeptRef.current) {
      zojuistGesleeptRef.current = false;
      return;
    }
    pasIngeklaptToe(false);
  };

  const klapIn = () => {
    setPopoverOpen(false);
    setMobielOpen(false);
    pasIngeklaptToe(true);
  };

  const dashOffset = useMemo(
    () => Number((CIRKEL_OMTREK * (1 - Math.min(100, Math.max(0, voortgang)) / 100)).toFixed(2)),
    [voortgang],
  );

  const renderItem = (item: MaquetteAnkerItem, index: number, diepte = 0): ReactNode => {
    const volgnummer = String(index + 1).padStart(2, '0');
    const heeftKinderen = Boolean(item.kinderen && item.kinderen.length > 0);
    const isExactActief = heeftExactActief(item, actief);
    const isTakActief = heeftActiefInTak(item, actief);

    if (heeftKinderen && item.kinderen) {
      const isOpen = openGroepen.has(item.id);
      return (
        <div
          key={item.id}
          className={`mq-anker-groep${isOpen ? ' is-open' : ''}${isTakActief ? ' is-huidige-groep' : ''}`}
          data-diepte={diepte}
        >
          <button
            type="button"
            className={`mq-anker-groep-toggle${isExactActief ? ' is-actief' : ''}${isTakActief ? ' is-tak-actief' : ''}`}
            aria-expanded={isOpen}
            aria-current={isExactActief ? 'true' : undefined}
            title={compact ? item.label : undefined}
            onClick={() => klikGroep(item)}
          >
            {renderIcoon(item.icoon, volgnummer)}
            <span className="mq-anker-naam">{item.label}</span>
            {item.badge !== undefined && item.badge !== '' ? (
              <span className="mq-anker-badge">{item.badge}</span>
            ) : null}
            <span
              className="mq-anker-chevron"
              aria-hidden="true"
              onClick={(e) => {
                e.stopPropagation();
                wisselGroep(item.id);
              }}
            >
              <ChevronRight size={14} strokeWidth={2.2} />
            </span>
          </button>

          {isOpen ? (
            <div className="mq-anker-sublijst">
              {item.kinderen.map((kind, kindIdx) => renderItem(kind, kindIdx, diepte + 1))}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        className={`mq-anker-knop${isExactActief ? ' is-actief' : ''}${diepte > 0 ? ' is-sub' : ''}`}
        aria-current={isExactActief ? 'true' : undefined}
        title={compact ? item.label : undefined}
        onClick={() => kiesOnderdeel(item)}
      >
        {renderIcoon(item.icoon, volgnummer)}
        <span className="mq-anker-naam">{item.label}</span>
        {item.badge !== undefined && item.badge !== '' ? (
          <span className="mq-anker-badge">{item.badge}</span>
        ) : null}
      </button>
    );
  };

  if (items.length === 0) return null;

  const railKlassen = [
    'mq-anker-rail',
    isKlassiek ? 'is-klassiek' : '',
    toonAlsPil ? 'is-ingeklapt' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const vasteLagen = (
    <>
      {mobielOpen ? (
        <button
          type="button"
          className="mq-anker-sluier"
          aria-label={t.mobielSluit}
          onClick={() => setMobielOpen(false)}
        />
      ) : null}

      <nav
        ref={railRef}
        className={railKlassen}
        aria-label={titel || t.navAria}
        data-zijde={zijde}
        data-compact={compact ? 'ja' : 'nee'}
        data-ingeklapt={toonAlsPil ? 'ja' : 'nee'}
        data-sleept={sleepDoel ? 'ja' : 'nee'}
        data-mobiel-open={mobielOpen ? 'ja' : 'nee'}
      >
        {toonAlsPil ? (
          <button
            type="button"
            className="mq-anker-ingeklapt-pil"
            aria-expanded={false}
            aria-label={`${t.uitklapAria}: ${actiefItem ? actiefItem.label : titel || t.sectiesPil}`}
            title={t.uitklapAria}
            onPointerDown={startSlepen}
            onPointerMove={beweegSlepen}
            onPointerUp={eindigSlepen}
            onPointerCancel={annuleerSlepen}
            onClick={openVanuitPil}
          >
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />
            </svg>
            <span className="mq-anker-pil-tekst">
              {actiefItem ? actiefItem.label : titel || t.sectiesPil}
            </span>
            <span className="mq-anker-pil-teller">
              {voortgang > 0 ? `${voortgang}%` : items.length}
            </span>
          </button>
        ) : (
          <>
            <div
              className="mq-rail-kop"
              onPointerDown={startSlepen}
              onPointerMove={beweegSlepen}
              onPointerUp={eindigSlepen}
              onPointerCancel={annuleerSlepen}
            >
              <button
                type="button"
                className="mq-rail-compact-knop"
                aria-pressed={compact}
                aria-label={t.compactKnop}
                title={t.compactKnop}
                onClick={wisselCompact}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="2.7" />
                  <path d="M9 4v16m7-11-3 3 3 3" />
                </svg>
              </button>

              <div className="mq-rail-titels">
                <strong>{titel}</strong>
                <small>{ondertitel || t.sleepSub}</small>
              </div>

              <button
                type="button"
                className="mq-rail-tandwiel"
                aria-label={t.instellingenKnop}
                aria-expanded={popoverOpen}
                title={t.instellingenKnop}
                onClick={() => setPopoverOpen((v) => !v)}
              >
                <Settings size={16} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </div>

            <div className="mq-rail-lijst" ref={lijstRef}>
              {items.map((item, index) => renderItem(item, index, 0))}
            </div>

            <div className="mq-rail-voet">
              <div className="mq-rail-voet-rij">
                <div
                  className="mq-rail-progress-gauge"
                  role="progressbar"
                  aria-label={t.voortgang}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={voortgang}
                >
                  <svg viewBox="0 0 44 44" aria-hidden="true">
                    <circle className="mq-rail-progress-base" cx="22" cy="22" r="18" />
                    <circle
                      className="mq-rail-progress-ring"
                      cx="22"
                      cy="22"
                      r="18"
                      style={{ strokeDashoffset: dashOffset }}
                    />
                  </svg>
                  <strong>{voortgang}%</strong>
                </div>

                <button
                  type="button"
                  className="mq-rail-progress-help"
                  aria-label={t.helpAria}
                  aria-expanded={uitlegOpen}
                  title={t.helpTitel}
                  onClick={() => setUitlegOpen((v) => !v)}
                >
                  ?
                </button>

                {isKlassiek ? (
                  <button
                    type="button"
                    className="mq-rail-inklap-knop"
                    aria-label={t.inklapAria}
                    title={t.inklapAria}
                    onClick={klapIn}
                  >
                    <span>{t.inklapKnop}</span>
                  </button>
                ) : null}
              </div>

              {uitlegOpen ? <p className="mq-rail-progress-uitleg">{t.helpTitel}</p> : null}
            </div>
          </>
        )}
      </nav>

      {sleepDoel ? (
        <div className="mq-sleep-rand-wijzer" data-doel={sleepDoel} aria-hidden="true" />
      ) : null}

      {popoverOpen ? (
        <div
          ref={popoverRef}
          className={`mq-rail-popover${isKlassiek ? ' is-klassiek' : ''}`}
          role="dialog"
          aria-modal="false"
          aria-label={t.instellingenKnop}
          data-anker-zijde={zijde}
        >
          <div className="mq-popover-kop">
            <div>
              <small>{t.popoverBoven}</small>
              <strong>{t.popoverTitel}</strong>
            </div>
            <button
              type="button"
              className="mq-popover-sluit"
              aria-label={t.sluiten}
              onClick={() => setPopoverOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="mq-zijde-kiezer">
            {(['links', 'rechts', 'boven', 'onder'] as const).map((z) => (
              <button
                key={z}
                type="button"
                className={`mq-zijde-knop${zijde === z ? ' is-gekozen' : ''}`}
                aria-pressed={zijde === z}
                onClick={() => pasZijdeToe(z)}
              >
                <span>{t[z]}</span>
              </button>
            ))}
          </div>

          <div className="mq-popover-rij">
            <span>{t.compactRij}</span>
            <button
              type="button"
              className="mq-popover-schakelaar"
              aria-pressed={compact}
              onClick={wisselCompact}
            >
              {compact ? t.aan : t.uit}
            </button>
          </div>

          {isKlassiek ? (
            <div className="mq-popover-rij">
              <span>{t.inklapRij}</span>
              <button
                type="button"
                className="mq-popover-schakelaar"
                onClick={klapIn}
              >
                {t.inklapKnop}
              </button>
            </div>
          ) : null}

          <p className="mq-popover-tip">{t.tip}</p>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <div ref={ankerPlekRef} className="mq-anker-onderbalk">
        <button
          type="button"
          className="mq-onderbalk-trekker"
          aria-expanded={mobielOpen}
          aria-label={t.mobielOpen}
          onClick={() => setMobielOpen((v) => !v)}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />
          </svg>
          <span>{actiefItem ? actiefItem.label : titel}</span>
          <span aria-hidden="true">{mobielOpen ? '▴' : '▾'}</span>
        </button>

        <div className="mq-onderbalk-rechts">
          <span className="mq-onderbalk-procent">{voortgang}%</span>
          <button
            type="button"
            className="mq-onderbalk-knop"
            aria-label={t.instellingenKnop}
            aria-expanded={popoverOpen}
            onClick={() => setPopoverOpen((v) => !v)}
          >
            <Settings size={16} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </div>
      </div>

      {typeof document !== 'undefined' ? createPortal(vasteLagen, document.body) : vasteLagen}
    </>
  );
}
