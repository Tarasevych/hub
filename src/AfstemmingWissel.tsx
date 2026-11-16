// De wissel op api/afstemming tussen de oude «Матриця фактичної реалізації» en Afstemming vNext (UI-014, vlag
// afstemming-vnext, migratie 0197) — zelfde patroon als src/CloudVnextWissel.tsx. Vlag UIT = exact de oude matrixpagina
// (synchronoon geïmporteerd, zoals vroeger rechtstreeks in VerenigdDienstApp); de nieuwe pagina laadt lui.
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircleCheckBig,
  Filter,
  GitCompareArrows,
  History,
  LayoutDashboard,
  Library,
  Plug2,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
} from 'lucide-react';
import CanonicalImplementationTruthMatrix from './CanoniekImplementatieWaarheidMatrix';
import { useAfstemmingVnext } from './afstemming-vnext/afstemming-vlag';
import { useSmal } from './afstemming-vnext/tekst';
import type { AfstemmingSectie } from '../shared/afstemming-model';
import { canonicalNavigationUrl } from './canoniek-navigatie';
import {
  MaquetteAnkerRail,
  MaquetteHeld,
  abonneerOpenLaag,
  type MaquetteAnkerItem,
  type MaquetteHeldStatistiek,
} from './maquette-kern';
import { useIsMaquette } from './thema/useThema';
import './afstemming-vnext/afstemming-maquette.css';
import './afstemming-vnext/afstemming-klassiek.css';

const Nieuw = lazy(() => import('./afstemming-vnext/AfstemmingPagina'));

const LAAG_OPEN_SELECTOR =
  ".afv-laag, .venster-achter, .venster:not([hidden]), [data-mq-laag-open='1'], dialog[open], [role='dialog'][aria-modal='true']";

type AfvStand = {
  sectie: AfstemmingSectie;
  kaarten?: number;
  aandacht?: number;
  conflicten?: number;
  kandidaten?: number;
};

const HELD_TEKSTEN = {
  uk: {
    bovenregel: 'ПРОГРАМНІ ШЛЮЗИ · ЗВІРКА ПРОДУКТУ',
    titelVoor: 'Задум, код і',
    titelCursief: 'підтверджені докази',
    beschrijving:
      'Єдиний простір звірки між ідеями власника, канонічним кодом та перевіреними свідченнями роботи продукту без припущень і самовільних схвалень.',
    primair: 'До доступу',
    secundair: 'Сховище таємниць',
    railTitelVnext: 'Картотека звірки',
    railTitelMatrix: 'Матриця реалізації',
    statOnderdelen: 'розділів картотеки',
    statAssen: 'незалежні осі стану',
    statBewijs: 'перевірка доказів',
  },
  nl: {
    bovenregel: 'PROGRAMMAPOORTEN · PRODUCTAFSTEMMING',
    titelVoor: 'Ontwerp, broncode en',
    titelCursief: 'bevestigd bewijs',
    beschrijving:
      'Eén afstemmingsruimte voor ideeën van de eigenaar, canonieke broncode en getoetste bewijzen van werking zonder aannames of eigenmachtige goedkeuring.',
    primair: 'Naar toegang',
    secundair: 'Geheimenkluis',
    railTitelVnext: 'Afstemmingskartotheek',
    railTitelMatrix: 'Realisatiematrix',
    statOnderdelen: 'onderdelen',
    statAssen: 'onafhankelijke assen',
    statBewijs: 'bewijscontrole',
  },
} as const;

type Props = { lang: 'uk' | 'nl'; sourceOrigin: string; tabContext: string };
export default function AfstemmingWissel({ lang, sourceOrigin, tabContext }: Props) {
  const vnext = useAfstemmingVnext();
  const isMaquette = useIsMaquette();
  const smal = useSmal();
  const [laagOpen, setLaagOpen] = useState(false);
  const [stand, setStand] = useState<AfvStand>({ sectie: 'overzicht' });
  const [matrixAnker, setMatrixAnker] = useState('matrix-filters');

  const taal = lang === 'nl' ? 'nl' : 'uk';
  const uk = taal === 'uk';
  const teksten = HELD_TEKSTEN[taal];

  useEffect(() => {
    if (!isMaquette || typeof document === 'undefined') {
      setLaagOpen(false);
      return;
    }
    return abonneerOpenLaag(LAAG_OPEN_SELECTOR, setLaagOpen, {
      wortel: 'beide',
      attributeFilter: ['class', 'open', 'hidden', 'aria-modal', 'data-mq-laag-open'],
      htmlAttributeFilter: ['data-mq-laag-open'],
    });
  }, [isMaquette, vnext]);

  useEffect(() => {
    const bijStand = (ev: Event) => {
      const d = (ev as CustomEvent<AfvStand>).detail;
      if (d?.sectie) setStand(d);
    };
    window.addEventListener('tsv:afstemming-stand', bijStand);
    window.dispatchEvent(new CustomEvent('tsv:afstemming-vraag-stand'));
    return () => window.removeEventListener('tsv:afstemming-stand', bijStand);
  }, []);

  const stuurVnextNav = useCallback(
    (payload: { sectie?: AfstemmingSectie; actie?: 'toevoegen' | 'vernieuw' | 'zoek' }) => {
      window.dispatchEvent(new CustomEvent('tsv:afstemming-nav', { detail: payload }));
    },
    [],
  );

  const kiesMatrixAnker = useCallback((id: string) => {
    setMatrixAnker(id);
    if (id === 'matrix-filters') {
      document.querySelector<HTMLElement>('.implementation-filters')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (id === 'matrix-zoek') {
      const inp = document.querySelector<HTMLInputElement>('.implementation-search input');
      inp?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      inp?.focus();
    } else if (id === 'matrix-lijst') {
      document.querySelector<HTMLElement>('.implementation-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const ankerItems = useMemo<ReadonlyArray<MaquetteAnkerItem>>(() => {
    if (!vnext) {
      return [
        {
          id: 'groep-matrix',
          label: uk ? 'Матриця реалізації' : 'Realisatiematrix',
          icoon: Library,
          soort: 'groep',
          openStandaard: true,
          kiesbaar: false,
          kinderen: [
            { id: 'matrix-filters', label: uk ? 'Фільтр статусів' : 'Statusfilter', icoon: Filter },
            { id: 'matrix-zoek', label: uk ? 'Пошук за кодом' : 'Zoeken op claim', icoon: Search },
            { id: 'matrix-lijst', label: uk ? 'Перелік тверджень' : 'Lijst van claims', icoon: CircleCheckBig },
          ],
        },
        {
          id: 'matrix-reset-filter',
          label: uk ? 'Показати всі' : 'Alles tonen',
          icoon: RefreshCw,
          soort: 'actie',
          onActie: () => document.querySelector<HTMLButtonElement>('.implementation-filters button:first-of-type')?.click(),
        },
      ];
    }

    const aandachtTeller = (stand.aandacht || 0) + (stand.conflicten || 0);
    return [
      {
        id: 'groep-afv-kartotheek',
        label: uk ? 'Картотека й зв’язки' : 'Kartotheek en relaties',
        icoon: Library,
        soort: 'groep',
        openStandaard: ['overzicht', 'kartotheek', 'kaart-grafiek', 'mogelijkheden'].includes(stand.sectie),
        kiesbaar: false,
        kinderen: [
          {
            id: 'overzicht',
            label: uk ? 'Огляд' : 'Overzicht',
            icoon: LayoutDashboard,
            badge: aandachtTeller > 0 ? aandachtTeller : undefined,
          },
          {
            id: 'kartotheek',
            label: uk ? 'Картотека' : 'Kartotheek',
            icoon: Library,
            badge: stand.kaarten || undefined,
          },
          {
            id: 'kaart-grafiek',
            label: uk ? 'Мапа зв’язків' : 'Relatiekaart',
            icoon: GitCompareArrows,
          },
          {
            id: 'mogelijkheden',
            label: uk ? 'Можливості' : 'Mogelijkheden',
            icoon: Sparkles,
          },
        ],
      },
      {
        id: 'groep-afv-bewijs',
        label: uk ? 'Перевірки й докази' : 'Controles en bewijs',
        icoon: CircleCheckBig,
        soort: 'groep',
        openStandaard: ['controles', 'releases', 'geschiedenis', 'bronnen'].includes(stand.sectie),
        kiesbaar: false,
        kinderen: [
          {
            id: 'controles',
            label: uk ? 'Перевірки' : 'Controles',
            icoon: CircleCheckBig,
          },
          {
            id: 'releases',
            label: uk ? 'Випуски' : 'Releases',
            icoon: Rocket,
          },
          {
            id: 'geschiedenis',
            label: uk ? 'Історія змін' : 'Geschiedenis',
            icoon: History,
          },
          {
            id: 'bronnen',
            label: uk ? 'Джерела й кандидати' : 'Bronnen',
            icoon: Plug2,
            badge: stand.kandidaten || undefined,
          },
        ],
      },
      {
        id: 'groep-afv-acties',
        label: uk ? 'Швидкі дії' : 'Snelle acties',
        icoon: Plus,
        soort: 'groep',
        openStandaard: true,
        kiesbaar: false,
        kinderen: [
          {
            id: 'afv-actie-nieuw',
            label: uk ? 'Додати ідею' : 'Idee toevoegen',
            icoon: Plus,
            soort: 'actie',
            onActie: () => stuurVnextNav({ actie: 'toevoegen' }),
          },
          {
            id: 'afv-actie-zoek',
            label: uk ? 'Знайти картку' : 'Kaart zoeken',
            icoon: Search,
            soort: 'actie',
            onActie: () => stuurVnextNav({ actie: 'zoek' }),
          },
          {
            id: 'afv-actie-vernieuw',
            label: uk ? 'Оновити зведення' : 'Overzicht verversen',
            icoon: RefreshCw,
            soort: 'actie',
            onActie: () => stuurVnextNav({ actie: 'vernieuw' }),
          },
        ],
      },
    ];
  }, [vnext, uk, stand, stuurVnextNav]);

  const statistieken = useMemo<ReadonlyArray<MaquetteHeldStatistiek>>(
    () => [
      { waarde: stand.kaarten ?? 8, label: teksten.statOnderdelen },
      { waarde: 2, label: teksten.statAssen },
      { waarde: '1:1', label: teksten.statBewijs },
    ],
    [stand.kaarten, teksten],
  );

  if (!isMaquette) {
    if (!vnext) return <CanonicalImplementationTruthMatrix lang={lang} />;
    return (
      <Suspense fallback={<p role='status' aria-busy='true' style={{ margin: 16 }}>…</p>}>
        <Nieuw lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} />
      </Suspense>
    );
  }

  const toonAnkerRail = !(vnext && smal) && !laagOpen;

  return (
    <div className='mq-schil afv-mq-schil' data-mq-dienst='api'>
      <MaquetteHeld
        dienst='api'
        lang={taal}
        modus='compact'
        opslagSleutel='api-reconciliation'
        bovenregel={teksten.bovenregel}
        titelVoor={teksten.titelVoor}
        titelCursief={teksten.titelCursief}
        beschrijving={teksten.beschrijving}
        statistieken={statistieken}
        primair={{
          label: teksten.primair,
          onClick: () => location.assign(canonicalNavigationUrl('api', 'access', taal)),
        }}
        secundair={{
          label: teksten.secundair,
          onClick: () => location.assign(canonicalNavigationUrl('api', 'vault', taal)),
        }}
      />
      {toonAnkerRail ? (
        <MaquetteAnkerRail
          lang={taal}
          titel={vnext ? teksten.railTitelVnext : teksten.railTitelMatrix}
          ondertitel='api.tarasevych.com'
          items={ankerItems}
          actief={vnext ? stand.sectie : matrixAnker}
          onKies={(id) => {
            if (vnext) stuurVnextNav({ sectie: id as AfstemmingSectie });
            else kiesMatrixAnker(id);
          }}
          opslagSleutel={vnext ? 'api-afstemming-vnext' : 'api-afstemming-matrix'}
        />
      ) : null}
      {!vnext ? (
        <CanonicalImplementationTruthMatrix lang={lang} />
      ) : (
        <Suspense fallback={<p role='status' aria-busy='true' style={{ margin: 16 }}>…</p>}>
          <Nieuw lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} />
        </Suspense>
      )}
    </div>
  );
}
