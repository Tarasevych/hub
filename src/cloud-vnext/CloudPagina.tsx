// Cloud vNext — de pagina (vlag cloud-vnext, migratie 0130), binnen de bestaande CanonicalChrome; de onderdelen zijn de
// tabbladen van de dienst cloud (public/canonical-service.js). De oude pagina (src/CloudFunctioneelWeergave.tsx) blijft achter
// de vlag UIT volledig bestaan; beide lezen dezelfde records. Agenda en Foto's hergebruiken de bestaande Google-weergaven.
import IntegratieStrook from '../integraties/IntegratieStrook'; // UI-013 fase 2: gedeelde verbindingenstrook (vlag integraties-catalogus-v2)
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Cloud, FolderOpen, Images, Inbox, Link2, LayoutDashboard, MoreHorizontal, Plus, Search, Share2, Upload, Users } from 'lucide-react';
import { cloudClient, CloudFout, type Overzicht as OverzichtUit } from './cloud-client';
import { foutTekst, tr, useSmal, type Lang } from './tekst';
import { paginaVerborgen } from '../foto/foto-vlaggen';
import { DIEPE_PARAMS, diepeWaarde, wisDiepeParams } from '../../shared/zoek-diepe-link';
import { sessieZet } from './hulp';
import './cloud-vnext.css';
import './cloud-vnext-integraties.css';
import './cloud-vnext-delen.css';
import './cloud-vnext-mobiel.css';

const Overzicht = lazy(() => import('./onderdelen/Overzicht'));
const Bestanden = lazy(() => import('./onderdelen/Bestanden'));
const Gedeeld = lazy(() => import('./onderdelen/Gedeeld'));
const Werkruimtes = lazy(() => import('./onderdelen/Werkruimtes'));
const Vastleggen = lazy(() => import('./onderdelen/Vastleggen'));
const PostvakIn = lazy(() => import('./onderdelen/PostvakIn'));
const Zoeken = lazy(() => import('./onderdelen/Zoeken'));
const Recent = lazy(() => import('./onderdelen/Recent'));
const Integraties = lazy(() => import('./onderdelen/Integraties'));
const Bron = lazy(() => import('./onderdelen/Bron'));
const AgendaFotos = lazy(() => import('./onderdelen/AgendaFotos'));

export type CloudTab = 'overview' | 'files' | 'shared' | 'workspaces' | 'capture' | 'inbox' | 'search' | 'recent' | 'calendar' | 'photos' | 'accounts' | 'google' | 'onedrive' | 'dropbox';
const TABS: readonly CloudTab[] = ['overview', 'files', 'shared', 'workspaces', 'capture', 'inbox', 'search', 'recent', 'calendar', 'photos', 'accounts', 'google', 'onedrive', 'dropbox'];
export type OnderdeelProps = {
  lang: Lang; smal: boolean; userEmail: string; sourceOrigin: string; tabContext: string;
  ov: OverzichtUit | null; vernieuw: () => Promise<void>; toon: (t: string) => void; naarTab: (t: CloudTab) => void;
};
const LABEL: Record<CloudTab, [string, string]> = {
  overview: ['Огляд', 'Overzicht'], files: ['Мої файли', 'Mijn bestanden'], shared: ['Спільний доступ', 'Gedeeld'],
  workspaces: ['Робочі простори', 'Werkruimtes'], capture: ['Швидко зберегти', 'Snel opslaan'],
  inbox: ['Швидкий вхід', 'Snelle invoer'], search: ['Пошук', 'Zoeken'], recent: ['Останні', 'Recent'], calendar: ['Календар', 'Agenda'], photos: ['Фото', 'Foto’s'],
  accounts: ['Інтеграції', 'Integraties'], google: ['Google Drive', 'Google Drive'], onedrive: ['OneDrive', 'OneDrive'], dropbox: ['Dropbox', 'Dropbox'],
};
/**
 * ZOEKDIEP-001 (05.11.2026): een diepe link uit de zoekindex (?open_item_id= of ?open_file_id=&open_drive_principal=) gaat naar de
 * bestaande overdracht tussen onderdelen (sessionStorage 'cvn-open' / 'cvn-drive-open'), en de parameters verdwijnen uit het adres.
 * Geeft het tabblad terug dat de overdracht oppakt. Draait tijdens de render; gooit React die render weg (Suspense), dan staat
 * de uitkomst nog in diepWachtend, want het adres is dan al schoon. Het effect van de pagina wist haar.
 */
let diepWachtend: CloudTab | '' = '';
function neemDiepeLink(): CloudTab | '' {
  if (typeof location === 'undefined') return '';
  const item = diepeWaarde(location.search, DIEPE_PARAMS.item);
  const bestand = diepeWaarde(location.search, DIEPE_PARAMS.bestand);
  if (item) { sessieZet('cvn-open', item); wisDiepeParams(DIEPE_PARAMS.item); return (diepWachtend = 'files'); }
  if (bestand) {
    sessieZet('cvn-drive-open', JSON.stringify({ bestand, principal: diepeWaarde(location.search, DIEPE_PARAMS.drivePrincipal) }));
    wisDiepeParams(DIEPE_PARAMS.bestand, DIEPE_PARAMS.drivePrincipal); return (diepWachtend = 'google');
  }
  return diepWachtend;
}
const ICOON: Record<CloudTab, typeof Cloud> = { overview: LayoutDashboard, files: FolderOpen, shared: Share2, workspaces: Users, capture: Upload, inbox: Inbox, search: Search, recent: CalendarDays, calendar: CalendarDays, photos: Images, accounts: Link2, google: Cloud, onedrive: Cloud, dropbox: Cloud };

export default function CloudPagina({ lang, tab, userEmail, sourceOrigin, tabContext, onNavigateTab }: { lang: Lang; tab: string; userEmail: string; sourceOrigin: string; tabContext: string; onNavigateTab: (id: string) => void }) {
  const smal = useSmal();
  const huidig: CloudTab = (TABS as readonly string[]).includes(tab) ? (tab as CloudTab) : 'overview';
  // Tijdens de eerste render (vóór de effecten van de onderdelen), zodat «Мої файли» de overdracht bij binnenkomst al vindt.
  const diep = useRef<CloudTab | '' | null>(null);
  if (diep.current === null) diep.current = neemDiepeLink();
  const [ov, setOv] = useState<OverzichtUit | null>(null);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const toon = useCallback((t: string) => { setMelding(t); window.setTimeout(() => setMelding(''), 4500); }, []);
  const vernieuw = useCallback(async () => {
    try { setOv(await cloudClient.overzicht()); setFout(''); }
    catch (e) { const code = e instanceof CloudFout ? e.code : 'FOUT'; if (code !== 'NOG_NIET_GEBOUWD') setFout(foutTekst(lang, code)); }
  }, [lang]);
  useEffect(() => { void vernieuw(); }, [vernieuw]);
  const naarTab = useCallback((t: CloudTab) => onNavigateTab(t), [onNavigateTab]);
  useEffect(() => { const d = diep.current; diepWachtend = ''; if (d && d !== huidig) naarTab(d); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const props: OnderdeelProps = useMemo(() => ({ lang, smal, userEmail, sourceOrigin, tabContext, ov, vernieuw, toon, naarTab }), [lang, smal, userEmail, sourceOrigin, tabContext, ov, vernieuw, toon, naarTab]);

  const onderdeel = () => {
    switch (huidig) {
      case 'files': return <Bestanden {...props} />;
      case 'shared': return <Gedeeld {...props} />;
      case 'workspaces': return <Werkruimtes {...props} />;
      case 'capture': return <Vastleggen {...props} />;
      case 'inbox': return <PostvakIn {...props} />;
      case 'search': return <Zoeken {...props} />;
      case 'recent': return <Recent {...props} />;
      case 'calendar': return <><IntegratieStrook lang={props.lang} dienst='agenda' /><AgendaFotos {...props} deel='calendar' /></>;
      case 'photos': return <><IntegratieStrook lang={props.lang} dienst='foto' /><AgendaFotos {...props} deel='photos' /></>;
      case 'accounts': return <><IntegratieStrook lang={props.lang} dienst='cloud' /><Integraties {...props} /></>;
      case 'google': return <Bron {...props} bron='google-drive' />;
      case 'onedrive': return <Bron {...props} bron='onedrive' />;
      case 'dropbox': return <Bron {...props} bron='dropbox' />;
      default: return <Overzicht {...props} />;
    }
  };
  const Titel = ICOON[huidig];
  return (
    <section className={`cvn${smal ? ' is-smal' : ''}`} data-cvn-pagina={huidig} aria-labelledby='cvn-kop'>
      <header className='cvn-kop'>
        <h2 id='cvn-kop'><Titel aria-hidden='true' />{tr(lang, LABEL[huidig][0], LABEL[huidig][1])}</h2>
      </header>
      {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
      {melding ? <p className='cvn-toost' role='status' aria-live='polite'>{melding}</p> : null}
      <div className='cvn-inhoud'>
        <Suspense fallback={<p className='cvn-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження…', 'Laden…')}</p>}>{onderdeel()}</Suspense>
      </div>
      {smal ? (
        <nav className='cvn-onderbalk' aria-label={tr(lang, 'Розділи', 'Onderdelen')}>
          {(['overview', 'files', 'shared', 'search'] as CloudTab[]).map((t) => { const I = ICOON[t]; return <button key={t} type='button' className={huidig === t ? 'is-actief' : ''} aria-current={huidig === t ? 'page' : undefined} onClick={() => naarTab(t)} data-cvn-onderbalk={t}><I aria-hidden='true' /><span>{tr(lang, LABEL[t][0], LABEL[t][1])}</span></button>; })}
          <button type='button' className='cvn-plus' onClick={() => naarTab('capture')} aria-label={tr(lang, 'Швидко зберегти', 'Snel opslaan')} data-cvn-onderbalk='capture'><Plus aria-hidden='true' /></button>
          <details className='cvn-onderbalk-meer'>
            <summary aria-label={tr(lang, 'Інші розділи', 'Meer onderdelen')}><MoreHorizontal aria-hidden='true' /><span>{tr(lang, 'Ще', 'Meer')}</span></summary>
            <div className='cvn-onderbalk-menu'>
              {(['accounts', 'workspaces', 'inbox', 'recent', 'calendar', 'photos', 'google'] as CloudTab[]).filter((t) => !paginaVerborgen('cloud', t)/* UI-002 */).map((t) => { const I = ICOON[t]; return <button key={t} type='button' onClick={(e) => { naarTab(t); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}><I aria-hidden='true' />{tr(lang, LABEL[t][0], LABEL[t][1])}</button>; })}
            </div>
          </details>
        </nav>
      ) : null}
    </section>
  );
}
