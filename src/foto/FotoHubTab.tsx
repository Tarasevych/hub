// UI-002: «Мій простір» → «Фото». Vlag foto-dienst AAN → de nieuwe fotodienst. Alleen de menuvlag AAN → de bestaande
// Google-fotokiezer (dezelfde weergave als vroeger onder «Хмарне сховище», geen tweede implementatie). Beide UIT → eerlijk bericht.
import { Suspense, lazy } from 'react';
import type { Lang } from '../cloud-vnext/tekst';
import './foto.css';
import './foto-maquette.css';
const FotoPagina = lazy(() => import('./FotoPagina'));
const OudeFotos = lazy(() => import('./OudeFotos'));
export default function FotoHubTab({ lang, vlaggen }: { lang: Lang; vlaggen: { foto: boolean; menu: boolean } }) {
  const laden = <p className='foto-hint' role='status' aria-busy='true'>{lang === 'uk' ? 'Завантаження…' : 'Laden…'}</p>;
  if (vlaggen.foto) return <Suspense fallback={laden}><FotoPagina lang={lang} /></Suspense>;
  if (vlaggen.menu) return <Suspense fallback={laden}><OudeFotos lang={lang} /></Suspense>;
  return <p className='foto-hint' data-foto-uit='true'>{lang === 'uk' ? 'Розділ «Фото» ще не ввімкнено.' : 'Het onderdeel «Foto’s» staat nog niet aan.'}</p>;
}
