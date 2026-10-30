// De wissel tussen de oude cloudpagina en Cloud vNext (vlag cloud-vnext, migratie 0130) — zelfde patroon als
// src/DomoticaWeergave.tsx (huis) en src/HubNotities.tsx (notities): vlag UIT = exact de oude pagina, met dezelfde props.
// Het tabblad 'files' bestaat alleen in vNext; valt de vlag uit, dan toont de oude pagina het overzicht.
import { Suspense, lazy } from 'react';
import { useCloudVnext } from './cloud-vnext/cloud-vlag';
import { useVerbindingenV2 } from './verbindingen/verbindingen-vlag';

// UI-003: vlag verbindingen-centrum-v2 AAN → op «Акаунти» het nieuwe verbindingencentrum, los van cloud-vnext. UIT = ongewijzigd.
const Verbindingen = lazy(() => import('./verbindingen/VerbindingenCentrum'));

const Oud = lazy(() => import('./CloudFunctioneelWeergave'));
const Nieuw = lazy(() => import('./cloud-vnext/CloudPagina'));

type Props = { lang: 'uk' | 'nl'; tab: string; userEmail: string; sourceOrigin: string; tabContext: string; onFocusChange: (aan: boolean) => void; onNavigateTab: (id: string) => void };
export default function CloudVnextWissel(props: Props) {
  const vnext = useCloudVnext();
  const wachten = <p role='status' aria-busy='true' style={{ margin: 16 }}>…</p>;
  const v2 = useVerbindingenV2();
  if (v2 && props.tab === 'accounts') { // «Керувати» gaat naar 'google': daar blijft het bestaande beheer (kiezen, loskoppelen)
    return <Suspense fallback={wachten}><Verbindingen lang={props.lang} naarTab={props.onNavigateTab} /></Suspense>;
  }
  if (vnext) {
    return (
      <Suspense fallback={wachten}>
        <Nieuw lang={props.lang} tab={props.tab} userEmail={props.userEmail} sourceOrigin={props.sourceOrigin} tabContext={props.tabContext} onNavigateTab={props.onNavigateTab} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={wachten}>
      <Oud {...props} tab={props.tab === 'files' ? 'overview' : props.tab} />
    </Suspense>
  );
}
