// Прагматичний класичний центр облікового запису для тем «Біла класика» та «Чорна класика» (KLASSIEK-001).
// Працює всередині штатної оболонки сайту, без декоративних вітрин і куль, із плавними заокругленнями,
// миттєвим фільтром розділів, вікном швидкого переходу Ctrl+K, згорнутою якірною панеллю та двома режимами подання.
// Pragmatisch klassiek accountcentrum voor Witte klassiek en Zwarte klassiek binnen de standaard schil van de site.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CircleHelp,
  ContactRound,
  Globe,
  KeyRound,
  LayoutGrid,
  Menu,
  MonitorSmartphone,
  Palette,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import './identiteit-klassiek-maquette.css';
import { AtelierInhoud } from './atelier-inhoud';
import { IDENTITEIT_TABS } from './identiteit-tabs';
import { VormgevingKiezer } from './VormgevingKiezer';
import type { IdentiteitSectie } from './IdentiteitAccountPagina';
import type { MaquetteGebruiker } from './maquette/IdentiteitMaquette';
import '../maquette-kern/maquette-tokens.css';
import '../maquette-kern/maquette-oppervlakken.css';
import {
  MaquetteAnkerRail,
  type MaquetteAnkerItem,
} from '../maquette-kern/MaquetteAnkerRail';
import {
  MaquetteSnelNaar,
  type MaquetteSnelNaarItem,
} from '../maquette-kern/MaquetteSnelNaar';
import { leesKeuze } from '../thema/kern';
import { useThemaStand } from '../thema/useThema';
import bron from './atelier-v49-gegevens.json';

const ATELIER_SYMBOLEN: Record<string, LucideIcon> = {
  personalization: Sparkles,
  menu: Menu,
  themes: Palette,
  languages: Globe,
  widgets: LayoutGrid,
  sharing: UsersRound,
  identities: ContactRound,
  account: Settings2,
  sessions: MonitorSmartphone,
  methods: KeyRound,
  security: ShieldCheck,
  recovery: CircleHelp,
};

const ATELIER_GROEPEN = [
  { id: 'personal', ids: ['personalization', 'menu', 'themes', 'languages', 'widgets'], uk: 'Обличчя вашого простору', nl: 'De sfeer van jouw ruimte', ukKort: 'Вигляд і меню', nlKort: 'Uiterlijk en menu', bereik: '01 — 05' },
  { id: 'social', ids: ['sharing', 'identities'], uk: 'Люди та ідентичність', nl: 'Mensen en identiteit', ukKort: 'Доступ і ролі', nlKort: 'Toegang en rollen', bereik: '06 — 07' },
  { id: 'account', ids: ['account', 'sessions', 'methods'], uk: 'Ваш обліковий запис', nl: 'Jouw account', ukKort: 'Обліковий запис', nlKort: 'Account', bereik: '08 — 10' },
  { id: 'security', ids: ['security', 'recovery'], uk: 'Безпека та відновлення', nl: 'Beveiliging en herstel', ukKort: 'Захист', nlKort: 'Bescherming', bereik: '11 — 12' },
] as const;

type Taal = 'uk' | 'nl';
type WeergaveModus = 'stroom' | 'enkel';
type GroepFilter = 'alle' | (typeof ATELIER_GROEPEN)[number]['id'];

export interface IdentiteitKlassiekMaquetteProps {
  lang: Taal;
  actief: string;
  inBeeld?: string;
  secties: readonly IdentiteitSectie[];
  onKies: (id: string) => void;
  gebruiker?: MaquetteGebruiker;
}

const OPSLAG_MODUS = 'identiteit-klassiek-weergave-modus';
const TYPISCH_EERSTE = 'personalization';

const sectieDomId = (id: string) => `identity-sectie-${id}`;
const naarAtelierId = (id: string) => (id === 'identity' ? 'identities' : id);

function normeerZoektekst(waarde: string): string {
  return waarde
    .toLowerCase()
    .replace(/[’'ʼ`«»"„“]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function leesOpgeslagenModus(): WeergaveModus {
  if (typeof window === 'undefined') return 'stroom';
  try {
    const v = window.localStorage.getItem(OPSLAG_MODUS);
    return v === 'enkel' ? 'enkel' : 'stroom';
  } catch {
    return 'stroom';
  }
}

function schrijfOpgeslagenModus(modus: WeergaveModus): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OPSLAG_MODUS, modus);
  } catch {
    // Без локального сховища режим діє в межах поточного сеансу.
  }
}

/** Шукає найближчий предок із вертикальною прокруткою (робочу область оболонки). */
function zoekSchuifouder(el: HTMLElement | null): HTMLElement | null {
  for (let huidig = el?.parentElement; huidig; huidig = huidig.parentElement) {
    const stijl = window.getComputedStyle(huidig);
    if (/(auto|scroll|overlay)/.test(stijl.overflowY)) return huidig;
  }
  return null;
}

function zonderBewegingVoorkeur(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

function eersteLetter(naam: string): string {
  const schoon = naam.trim();
  if (!schoon) return '•';
  return Array.from(schoon)[0]?.toUpperCase() ?? '•';
}

export function IdentiteitKlassiekMaquette({
  lang,
  actief,
  inBeeld,
  secties,
  onKies,
  gebruiker,
}: IdentiteitKlassiekMaquetteProps) {
  const uk = lang === 'uk';
  const wortelRef = useRef<HTMLDivElement>(null);
  const tabsRijRef = useRef<HTMLDivElement>(null);
  const filterInvoerRef = useRef<HTMLInputElement>(null);

  const stand = useThemaStand();
  const huidigPalet = String(leesKeuze(stand.theme, stand.palet).palet);
  const isWitKlassiek = huidigPalet === 'klassiek-wit';

  const [modus, setModus] = useState<WeergaveModus>(leesOpgeslagenModus);
  const [groepFilter, setGroepFilter] = useState<GroepFilter>('alle');
  const [zoekvraag, setZoekvraag] = useState('');
  const [snelNaarOpen, setSnelNaarOpen] = useState(false);
  const [zichtbaarId, setZichtbaarId] = useState<string>(inBeeld || actief);
  const [plakBoven] = useState<number>(4);
  const [fotoMislukt, setFotoMislukt] = useState(false);

  useEffect(() => {
    setFotoMislukt(false);
  }, [gebruiker?.foto]);

  // Перехоплюємо Ctrl+K / Cmd+K у фазі перехоплення, щоб відкривалося вікно швидкого переходу за розділами без подвійного діалогу.
  useEffect(() => {
    const bijToets = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setSnelNaarOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', bijToets, { capture: true });
    return () => window.removeEventListener('keydown', bijToets, { capture: true });
  }, []);

  // Довідник метаданих кожного з 12 розділів: порядковий номер, змістова група та пошуковий рядок двома мовами.
  const sectieMetaMap = useMemo(() => {
    const kaart = new Map<
      string,
      {
        volgnummer: string;
        groepId: (typeof ATELIER_GROEPEN)[number]['id'];
        groepLabel: string;
        korteBeschrijving: string;
        zoekBundel: string;
      }
    >();

    IDENTITEIT_TABS.forEach((tab, idx) => {
      const atelierId = naarAtelierId(tab.id);
      const groep =
        ATELIER_GROEPEN.find((g) => (g.ids as readonly string[]).includes(atelierId)) ??
        ATELIER_GROEPEN[0];
      const bronSectie = bron.secties.find((s) => s.id === atelierId);
      const bronGroepen =
        (bron.groepen as Record<
          string,
          Array<{ uk: string; nl: string; поясненняUk: string; поясненняNl: string }>
        >)[atelierId] ?? [];

      const groepLabel = uk ? groep.uk : groep.nl;
      const korteBeschrijving = bronSectie
        ? uk
          ? bronSectie.uk.title
          : bronSectie.nl.title
        : groepLabel;

      const extraZoek = [
        tab.uk,
        tab.nl,
        groep.uk,
        groep.nl,
        groep.ukKort,
        groep.nlKort,
        bronSectie?.uk.title ?? '',
        bronSectie?.nl.title ?? '',
        bronSectie?.uk.description ?? '',
        bronSectie?.nl.description ?? '',
        ...bronGroepen.map((g) => `${g.uk} ${g.nl}`),
      ].join(' ');

      kaart.set(tab.id, {
        volgnummer: String(idx + 1).padStart(2, '0'),
        groepId: groep.id,
        groepLabel,
        korteBeschrijving,
        zoekBundel: normeerZoektekst(extraZoek),
      });
    });

    return kaart;
  }, [uk]);

  // Позиції для клавіатурного вікна швидкого переходу MaquetteSnelNaar (Ctrl+K).
  const snelNaarItems = useMemo<ReadonlyArray<MaquetteSnelNaarItem>>(
    () =>
      secties.map((sectie, idx) => {
        const meta = sectieMetaMap.get(sectie.id);
        return {
          id: sectie.id,
          label: sectie.titel,
          beschrijving: meta?.korteBeschrijving,
          groep: meta?.groepLabel,
          badge: meta?.volgnummer ?? String(idx + 1).padStart(2, '0'),
        };
      }),
    [secties, sectieMetaMap],
  );

  // Позиції для бічної якірної панелі MaquetteAnkerRail (згорнутої за замовчуванням у Класиці).
  const ankerItems = useMemo<ReadonlyArray<MaquetteAnkerItem>>(
    () =>
      secties.map((sectie, idx) => {
        const meta = sectieMetaMap.get(sectie.id);
        return {
          id: sectie.id,
          label: sectie.titel,
          badge: meta?.volgnummer ?? String(idx + 1).padStart(2, '0'),
        };
      }),
    [secties, sectieMetaMap],
  );

  // Відфільтрований список карток для поточного режиму подання.
  const zichtbareSecties = useMemo(() => {
    if (modus === 'enkel') {
      const gekozen = secties.find((s) => s.id === actief) ?? secties[0];
      return gekozen ? [gekozen] : [];
    }

    const woorden = normeerZoektekst(zoekvraag).split(' ').filter(Boolean);
    return secties.filter((sectie) => {
      const meta = sectieMetaMap.get(sectie.id);
      if (groepFilter !== 'alle' && meta && meta.groepId !== groepFilter) {
        return false;
      }
      if (woorden.length === 0) return true;
      const bundel = `${normeerZoektekst(sectie.titel)} ${meta?.zoekBundel ?? ''}`;
      return woorden.every((w) => bundel.includes(w));
    });
  }, [modus, secties, actief, groepFilter, zoekvraag, sectieMetaMap]);

  const huidigActief = modus === 'enkel' ? actief : zichtbaarId || actief;

  const schuifNaarBoven = useCallback(() => {
    const el = wortelRef.current;
    if (!el) return;
    const ouder = zoekSchuifouder(el);
    const gedrag = zonderBewegingVoorkeur() ? 'auto' : 'smooth';
    if (ouder) {
      const pad = parseFloat(window.getComputedStyle(ouder).paddingTop) || 0;
      const doel = Math.max(
        0,
        el.getBoundingClientRect().top - ouder.getBoundingClientRect().top + ouder.scrollTop - pad,
      );
      ouder.scrollTo({ top: doel, behavior: gedrag });
    } else {
      window.scrollTo({ top: 0, behavior: gedrag });
    }
  }, []);

  const schuifNaarSectie = useCallback((id: string) => {
    const doel = document.getElementById(sectieDomId(id));
    if (doel && typeof doel.scrollIntoView === 'function') {
      doel.scrollIntoView({
        block: 'start',
        behavior: zonderBewegingVoorkeur() ? 'auto' : 'smooth',
      });
    }
  }, []);

  // Перехід до розділу з вкладок, якірної панелі або вікна Ctrl+K.
  const kiesSectie = useCallback(
    (id: string) => {
      setZichtbaarId(id);
      const meta = sectieMetaMap.get(id);
      if (groepFilter !== 'alle' && meta && meta.groepId !== groepFilter) {
        setGroepFilter('alle');
      }
      if (zoekvraag.trim()) {
        const woorden = normeerZoektekst(zoekvraag).split(' ').filter(Boolean);
        const bundel = meta?.zoekBundel ?? '';
        if (!woorden.every((w) => bundel.includes(w))) {
          setZoekvraag('');
        }
      }
      onKies(id);
      window.requestAnimationFrame(() => {
        if (modus === 'enkel') {
          schuifNaarBoven();
        } else {
          schuifNaarSectie(id);
        }
      });
    },
    [groepFilter, zoekvraag, sectieMetaMap, onKies, modus, schuifNaarBoven, schuifNaarSectie],
  );

  // Реакція на зовнішню зміну активного розділу (бічне меню сайту або пряме посилання).
  const eersteMountRef = useRef(true);
  useEffect(() => {
    setZichtbaarId(actief);
    if (eersteMountRef.current) {
      eersteMountRef.current = false;
      if (modus === 'stroom' && actief && actief !== TYPISCH_EERSTE) {
        window.requestAnimationFrame(() => schuifNaarSectie(actief));
      }
      return;
    }
    if (modus === 'enkel') {
      schuifNaarBoven();
    } else {
      schuifNaarSectie(actief);
    }
  }, [actief, modus, schuifNaarBoven, schuifNaarSectie]);

  // Спостереження за видимістю карток у потоковому режимі через IntersectionObserver.
  useEffect(() => {
    if (modus !== 'stroom' || typeof IntersectionObserver !== 'function') return;
    const waarnemer = new IntersectionObserver(
      (entries) => {
        const beste = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = beste?.target.getAttribute('data-sectie');
        if (id) setZichtbaarId(id);
      },
      { rootMargin: '-16% 0px -56% 0px', threshold: [0, 0.2, 0.5, 0.8] },
    );
    for (const sectie of zichtbareSecties) {
      const el = document.getElementById(sectieDomId(sectie.id));
      if (el) waarnemer.observe(el);
    }
    return () => waarnemer.disconnect();
  }, [modus, zichtbareSecties]);

  // Утримуємо активну капсулу по центру горизонтальної смуги вкладок на вузьких екранах.
  useEffect(() => {
    const rij = tabsRijRef.current;
    if (!rij || rij.scrollWidth <= rij.clientWidth + 2 || typeof rij.scrollTo !== 'function') {
      return;
    }
    const knop = rij.querySelector<HTMLElement>('.ikm-tab-pil.is-actief');
    if (!knop) return;
    const doelLinks = Math.max(0, knop.offsetLeft - (rij.clientWidth - knop.offsetWidth) / 2);
    rij.scrollTo({
      left: doelLinks,
      behavior: zonderBewegingVoorkeur() ? 'auto' : 'smooth',
    });
  }, [huidigActief]);

  const wisselModus = (volgende: WeergaveModus) => {
    setModus(volgende);
    schrijfOpgeslagenModus(volgende);
    if (volgende === 'enkel') {
      setGroepFilter('alle');
      setZoekvraag('');
      window.requestAnimationFrame(() => schuifNaarBoven());
    }
  };

  const kiesGroep = (groepId: GroepFilter) => {
    const volgende = groepFilter === groepId ? 'alle' : groepId;
    setGroepFilter(volgende);
    if (volgende !== 'alle') {
      const groep = ATELIER_GROEPEN.find((g) => g.id === volgende);
      if (groep) {
        const eersteRuw: string = groep.ids[0];
        const eersteId = eersteRuw === 'identities' ? 'identity' : eersteRuw;
        const huidigAtelierId = naarAtelierId(huidigActief);
        if (modus === 'enkel' && !(groep.ids as readonly string[]).includes(huidigAtelierId)) {
          onKies(eersteId);
        }
      }
    }
  };

  const actieveIndex = useMemo(
    () =>
      Math.max(
        0,
        secties.findIndex((s) => s.id === actief),
      ),
    [secties, actief],
  );
  const vorigeSectie = actieveIndex > 0 ? secties[actieveIndex - 1] : null;
  const volgendeSectie =
    actieveIndex >= 0 && actieveIndex < secties.length - 1 ? secties[actieveIndex + 1] : null;

  const themaNaam = isWitKlassiek
    ? uk
      ? 'Біла класика'
      : 'Witte klassiek'
    : uk
      ? 'Чорна класика'
      : 'Zwarte klassiek';

  const aantalTekst = uk ? `${secties.length} розділів` : `${secties.length} onderdelen`;
  const toonGebruiker = Boolean(gebruiker && (gebruiker.naam?.trim() || gebruiker.foto?.trim()));
  const wortelStijl = { '--ikm-plak-boven': `${plakBoven}px` } as CSSProperties;

  return (
    <AtelierInhoud.Provider value={true}>
      <div
        ref={wortelRef}
        className='mq-schil ia-account ikm-wortel'
        data-klassiek-modus={modus}
        style={wortelStijl}
      >
        {/* 1. Однорядкова ділова шапка центру облікового запису (~54px) */}
        <header className='ikm-kopbalk'>
          <div className='ikm-kop-links'>
            {toonGebruiker && gebruiker && (
              <div className='ikm-gebruiker'>
                <span className='ikm-gebruiker-avatar' aria-hidden='true'>
                  {gebruiker.foto && !fotoMislukt ? (
                    <img
                      src={gebruiker.foto}
                      alt=''
                      referrerPolicy='no-referrer'
                      onError={() => setFotoMislukt(true)}
                    />
                  ) : (
                    eersteLetter(gebruiker.naam || '')
                  )}
                </span>
                {gebruiker.naam && <span className='ikm-gebruiker-naam'>{gebruiker.naam}</span>}
              </div>
            )}
            <h1 className='ikm-titel'>
              {uk ? 'Обліковий запис і налаштування' : 'Account en instellingen'}
            </h1>
            <div className='ikm-kop-pillen'>
              <span className='ikm-thema-pil'>
                <span className='ikm-thema-stip' aria-hidden='true' />
                <span>{themaNaam}</span>
              </span>
              <span className='ikm-teller-pil'>{aantalTekst}</span>
            </div>
          </div>

          <div className='ikm-kop-rechts'>
            <div className='ikm-filter-veld'>
              <Search size={15} aria-hidden='true' />
              <input
                ref={filterInvoerRef}
                type='search'
                value={zoekvraag}
                onChange={(e) => {
                  const waarde = e.target.value;
                  setZoekvraag(waarde);
                  if (waarde.trim() && modus === 'enkel') {
                    setModus('stroom');
                    schrijfOpgeslagenModus('stroom');
                  }
                }}
                placeholder={uk ? 'Фільтр розділів…' : 'Onderdelen filteren…'}
                aria-label={uk ? 'Миттєвий фільтр розділів' : 'Onderdelen direct filteren'}
              />
              {zoekvraag && (
                <button
                  type='button'
                  className='ikm-filter-wis'
                  onClick={() => {
                    setZoekvraag('');
                    filterInvoerRef.current?.focus();
                  }}
                  aria-label={uk ? 'Очистити фільтр' : 'Filter wissen'}
                >
                  <X size={13} aria-hidden='true' />
                </button>
              )}
            </div>

            <button
              type='button'
              className='ikm-snel-knop'
              onClick={() => setSnelNaarOpen(true)}
              aria-haspopup='dialog'
              aria-expanded={snelNaarOpen}
            >
              <Search size={15} aria-hidden='true' />
              <span>{uk ? 'Швидкий перехід' : 'Snel naar'}</span>
              <kbd>Ctrl+K</kbd>
            </button>
          </div>
        </header>

        {/* 2. Липка панель швидкої навігації: режим подання + 4 змістові групи + 12 капсульних вкладок */}
        <nav
          className='ikm-plakbalk'
          aria-label={uk ? 'Навігація розділами облікового запису' : 'Navigatie accountonderdelen'}
        >
          <div className='ikm-nav-bovenrij'>
            <div
              className='ikm-modus-wissel'
              role='group'
              aria-label={uk ? 'Режим подання розділів' : 'Weergavemodus voor onderdelen'}
            >
              <button
                type='button'
                className={`ikm-modus-knop${modus === 'stroom' ? ' is-actief' : ''}`}
                aria-pressed={modus === 'stroom'}
                onClick={() => wisselModus('stroom')}
              >
                {uk ? 'Усі розділи поспіль' : 'Alle onderdelen achter elkaar'}
              </button>
              <button
                type='button'
                className={`ikm-modus-knop${modus === 'enkel' ? ' is-actief' : ''}`}
                aria-pressed={modus === 'enkel'}
                onClick={() => wisselModus('enkel')}
              >
                {uk ? 'Один обраний розділ' : 'Één gekozen onderdeel'}
              </button>
            </div>

            <div
              className='ikm-groep-filter'
              role='group'
              aria-label={uk ? 'Змістові групи розділів' : 'Inhoudelijke groepen'}
            >
              <button
                type='button'
                className={`ikm-groep-knop${groepFilter === 'alle' ? ' is-actief' : ''}`}
                aria-pressed={groepFilter === 'alle'}
                onClick={() => setGroepFilter('alle')}
              >
                <span>{uk ? 'Усі' : 'Alle'}</span>
                <span className='ikm-groep-bereik'>{secties.length}</span>
              </button>
              {ATELIER_GROEPEN.map((groep) => {
                const isGroepActief = groepFilter === groep.id;
                return (
                  <button
                    key={groep.id}
                    type='button'
                    className={`ikm-groep-knop${isGroepActief ? ' is-actief' : ''}`}
                    aria-pressed={isGroepActief}
                    title={uk ? groep.uk : groep.nl}
                    onClick={() => kiesGroep(groep.id)}
                  >
                    <span>{uk ? groep.ukKort : groep.nlKort}</span>
                    <span className='ikm-groep-bereik'>{groep.bereik}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div ref={tabsRijRef} data-no-edge-swipe='1' className='ikm-tabs-rij'>
            {IDENTITEIT_TABS.map((tab, index) => {
              const isTabActief = huidigActief === tab.id;
              return (
                <button
                  key={tab.id}
                  type='button'
                  className={`ikm-tab-pil${isTabActief ? ' is-actief' : ''}`}
                  aria-current={isTabActief ? 'true' : undefined}
                  onClick={() => kiesSectie(tab.id)}
                >
                  <span className='ikm-tab-nummer' aria-hidden='true'>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{tab[lang]}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* 3. Якірна панель MaquetteAnkerRail (у Класиці згорнута за замовчуванням у компактну капсулу) */}
        <MaquetteAnkerRail
          lang={lang}
          titel={uk ? 'Розділи налаштувань' : 'Onderdelen'}
          ondertitel={themaNaam}
          items={ankerItems}
          actief={huidigActief}
          onKies={kiesSectie}
          opslagSleutel='identiteit-klassiek'
        />

        {/* 4. Справжні живі панелі налаштувань у плавних класичних картках (16px) */}
        <div className='ikm-secties'>
          {zichtbareSecties.length === 0 ? (
            <div className='ikm-leeg' role='status'>
              <p>
                {uk
                  ? 'За поточним фільтром не знайдено жодного розділу налаштувань.'
                  : 'Geen onderdelen gevonden voor het huidige filter.'}
              </p>
              <button
                type='button'
                className='ikm-leeg-herstel'
                onClick={() => {
                  setZoekvraag('');
                  setGroepFilter('alle');
                }}
              >
                {uk ? 'Показати всі розділи' : 'Alle onderdelen tonen'}
              </button>
            </div>
          ) : (
            zichtbareSecties.map((sectie) => {
              const meta = sectieMetaMap.get(sectie.id);
              const Icoon = ATELIER_SYMBOLEN[naarAtelierId(sectie.id)] ?? Settings2;
              const isKaartActief = huidigActief === sectie.id;
              const domId = sectieDomId(sectie.id);

              return (
                <section
                  key={sectie.id}
                  id={domId}
                  data-sectie={sectie.id}
                  className={`ikm-kaart${isKaartActief ? ' is-actief' : ''}`}
                  aria-labelledby={`${domId}-kop`}
                >
                  <header className='ikm-kaart-kop'>
                    <div className='ikm-kaart-kop-links'>
                      <span className='ikm-kaart-icoon' aria-hidden='true'>
                        <Icoon size={18} />
                      </span>
                      <div className='ikm-kaart-titels'>
                        <div className='ikm-kaart-meta'>
                          <span className='ikm-kaart-nummer'>{meta?.volgnummer ?? '01'}</span>
                          {meta?.groepLabel && (
                            <span className='ikm-kaart-groep'>{meta.groepLabel}</span>
                          )}
                        </div>
                        <h2 id={`${domId}-kop`} className='ikm-kaart-titel'>
                          {sectie.titel}
                        </h2>
                      </div>
                    </div>
                  </header>
                  <div className='ikm-kaart-inhoud ia-inhoud'>{sectie.inhoud}</div>
                </section>
              );
            })
          )}

          {modus === 'enkel' && (vorigeSectie || volgendeSectie) && (
            <div className='ikm-enkel-stappen'>
              {vorigeSectie ? (
                <button
                  type='button'
                  className='ikm-stap-knop'
                  onClick={() => kiesSectie(vorigeSectie.id)}
                >
                  <ArrowLeft size={16} aria-hidden='true' />
                  <span>{vorigeSectie.titel}</span>
                </button>
              ) : (
                <span />
              )}
              {volgendeSectie ? (
                <button
                  type='button'
                  className='ikm-stap-knop'
                  onClick={() => kiesSectie(volgendeSectie.id)}
                >
                  <span>{volgendeSectie.titel}</span>
                  <ArrowRight size={16} aria-hidden='true' />
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* 5. Компактний перемикач вигляду у нижній частині сторінки */}
        <footer className='ikm-voet'>
          <div className='ia-vormgeving-voet'>
            <VormgevingKiezer lang={lang} />
          </div>
        </footer>

        <MaquetteSnelNaar
          open={snelNaarOpen}
          onSluit={() => setSnelNaarOpen(false)}
          lang={lang}
          titel={uk ? 'ШВИДКИЙ ПЕРЕХІД ЗА РОЗДІЛАМИ' : 'SNEL NAAR ACCOUNT-ONDERDEEL'}
          placeholder={
            uk ? 'Введіть назву розділу або налаштування…' : 'Typ de naam van een onderdeel…'
          }
          items={snelNaarItems}
          onKies={kiesSectie}
        />
      </div>
    </AtelierInhoud.Provider>
  );
}
