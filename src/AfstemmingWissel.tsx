// De wissel op api/afstemming tussen de oude «Матриця фактичної реалізації» en Afstemming vNext (UI-014, vlag
// afstemming-vnext, migratie 0197) — zelfde patroon als src/CloudVnextWissel.tsx. Vlag UIT = exact de oude matrixpagina
// (synchronoon geïmporteerd, zoals vroeger rechtstreeks in VerenigdDienstApp); de nieuwe pagina laadt lui.
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import CanonicalImplementationTruthMatrix from './CanoniekImplementatieWaarheidMatrix';
import { useAfstemmingVnext } from './afstemming-vnext/afstemming-vlag';
import { useSmal } from './afstemming-vnext/tekst';
import { canonicalNavigationUrl } from './canoniek-navigatie';
import {
  MaquetteAnkerRail,
  MaquetteHeld,
  type MaquetteAnkerItem,
  type MaquetteHeldStatistiek,
} from './maquette-kern';
import { useIsMaquette } from './thema/useThema';
import './afstemming-vnext/afstemming-maquette.css';
import './afstemming-vnext/afstemming-klassiek.css';

const Nieuw = lazy(() => import('./afstemming-vnext/AfstemmingPagina'));

const LAAG_OPEN_SELECTOR =
  ".afv-laag, .venster-achter, .venster:not([hidden]), [data-mq-laag-open='1'], dialog[open], [role='dialog'][aria-modal='true']";

const HELD_TEKSTEN = {
  uk: {
    bovenregel: 'ПРОГРАМНІ ШЛЮЗИ · ЗВІРКА ПРОДУКТУ',
    titelVoor: 'Задум, код і',
    titelCursief: 'підтверджені докази',
    beschrijving:
      'Єдиний простір звірки між ідеями власника, канонічним кодом та перевіреними свідченнями роботи продукту без припущень і самовільних схвалень.',
    primair: 'До доступу',
    secundair: 'Сховище таємниць',
    railTitel: 'Розділи API',
    statOnderdelen: 'розділів картотеки',
    statAssen: 'незалежні осі стану',
    statBewijs: 'перевірка доказів',
    access: 'Доступ',
    vault: 'Сховище таємниць',
    verbindingen: 'Підключення',
    reconciliation: 'Звірка',
  },
  nl: {
    bovenregel: 'PROGRAMMAPOORTEN · PRODUCTAFSTEMMING',
    titelVoor: 'Ontwerp, broncode en',
    titelCursief: 'bevestigd bewijs',
    beschrijving:
      'Eén afstemmingsruimte voor ideeën van de eigenaar, canonieke broncode en getoetste bewijzen van werking zonder aannames of eigenmachtige goedkeuring.',
    primair: 'Naar toegang',
    secundair: 'Geheimenkluis',
    railTitel: 'API-onderdelen',
    statOnderdelen: 'onderdelen',
    statAssen: 'onafhankelijke assen',
    statBewijs: 'bewijscontrole',
    access: 'Toegang',
    vault: 'Geheimenkluis',
    verbindingen: 'Koppelingen',
    reconciliation: 'Afstemming',
  },
} as const;

type Props = { lang: 'uk' | 'nl'; sourceOrigin: string; tabContext: string };
export default function AfstemmingWissel({ lang, sourceOrigin, tabContext }: Props) {
  const vnext = useAfstemmingVnext();
  const isMaquette = useIsMaquette();
  const smal = useSmal();
  const [laagOpen, setLaagOpen] = useState(false);

  const taal = lang === 'nl' ? 'nl' : 'uk';
  const teksten = HELD_TEKSTEN[taal];

  useEffect(() => {
    if (!isMaquette || typeof document === 'undefined') {
      setLaagOpen(false);
      return;
    }
    const controleer = () => {
      setLaagOpen(Boolean(document.querySelector(LAAG_OPEN_SELECTOR)));
    };
    controleer();
    if (typeof MutationObserver !== 'function') return;
    const obs = new MutationObserver(controleer);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mq-laag-open'],
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'open', 'hidden', 'aria-modal', 'data-mq-laag-open'],
    });
    return () => obs.disconnect();
  }, [isMaquette, vnext]);

  const ankerItems = useMemo<ReadonlyArray<MaquetteAnkerItem>>(
    () => [
      { id: 'access', label: teksten.access },
      { id: 'vault', label: teksten.vault },
      { id: 'verbindingen', label: teksten.verbindingen },
      { id: 'reconciliation', label: teksten.reconciliation },
    ],
    [teksten],
  );

  const statistieken = useMemo<ReadonlyArray<MaquetteHeldStatistiek>>(
    () => [
      { waarde: 8, label: teksten.statOnderdelen },
      { waarde: 2, label: teksten.statAssen },
      { waarde: '1:1', label: teksten.statBewijs },
    ],
    [teksten],
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
          titel={teksten.railTitel}
          ondertitel='api.tarasevych.com'
          items={ankerItems}
          actief='reconciliation'
          onKies={(id) => location.assign(canonicalNavigationUrl('api', id, taal))}
          opslagSleutel='api'
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
