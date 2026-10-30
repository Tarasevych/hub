// De wissel op api/afstemming tussen de oude «Матриця фактичної реалізації» en Afstemming vNext (UI-014, vlag
// afstemming-vnext, migratie 0197) — zelfde patroon als src/CloudVnextWissel.tsx. Vlag UIT = exact de oude matrixpagina
// (synchronoon geïmporteerd, zoals vroeger rechtstreeks in VerenigdDienstApp); de nieuwe pagina laadt lui.
import { Suspense, lazy } from 'react';
import CanonicalImplementationTruthMatrix from './CanoniekImplementatieWaarheidMatrix';
import { useAfstemmingVnext } from './afstemming-vnext/afstemming-vlag';

const Nieuw = lazy(() => import('./afstemming-vnext/AfstemmingPagina'));

type Props = { lang: 'uk' | 'nl'; sourceOrigin: string; tabContext: string };
export default function AfstemmingWissel({ lang, sourceOrigin, tabContext }: Props) {
  const vnext = useAfstemmingVnext();
  if (!vnext) return <CanonicalImplementationTruthMatrix lang={lang} />;
  return (
    <Suspense fallback={<p role='status' aria-busy='true' style={{ margin: 16 }}>…</p>}>
      <Nieuw lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} />
    </Suspense>
  );
}
