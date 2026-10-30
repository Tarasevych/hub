// Afstemming vNext (UI-014, vlag afstemming-vnext) — de schil: eigen linkernavigatie (acht onderdelen uit het dossier §2)
// binnen het ENE canonical-tabblad api/afstemming; geen nieuwe diensttabbladen, dus geen registerwijzigingen. Op de telefoon
// een eigen onderbalk (Огляд / Картотека / + / Мапа / Ще), geregistreerd in scripts/plaatsing-vaste-elementen.json.
// De onderdelen zelf zijn eigendom van de uitvoerders C3/D3; dit bestand regelt navigatie, kop, meldingen en gedeelde props.
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { CircleCheckBig, GitCompareArrows, History, LayoutDashboard, Library, MoreHorizontal, Plug2, Plus, Rocket, Search, Sparkles } from 'lucide-react';
import { AFSTEMMING_SECTIES, SECTIE_LABEL, afstemmingTekst, type AfstemmingSectie } from '../../shared/afstemming-model';
import { afstemmingClient, AfstemmingFout, type Overzicht as OverzichtUit } from './afstemming-client';
import { foutTekst, tr, useSmal, type Lang } from './tekst';
import './afstemming.css';

const Overzicht = lazy(() => import('./onderdelen/Overzicht'));
const Kartotheek = lazy(() => import('./onderdelen/Kartotheek'));
const Relatiekaart = lazy(() => import('./onderdelen/Relatiekaart'));
const Controles = lazy(() => import('./onderdelen/Controles'));
const Releases = lazy(() => import('./onderdelen/Releases'));
const Mogelijkheden = lazy(() => import('./onderdelen/Mogelijkheden'));
const Geschiedenis = lazy(() => import('./onderdelen/Geschiedenis'));
const Bronnen = lazy(() => import('./onderdelen/Bronnen'));
const Toevoegen = lazy(() => import('./onderdelen/Toevoegen'));

const ICOON: Record<AfstemmingSectie, typeof Library> = {
  overzicht: LayoutDashboard, kartotheek: Library, 'kaart-grafiek': GitCompareArrows, controles: CircleCheckBig,
  releases: Rocket, mogelijkheden: Sparkles, geschiedenis: History, bronnen: Plug2,
};
export type OnderdeelProps = {
  lang: Lang; smal: boolean; sourceOrigin: string; tabContext: string;
  ov: OverzichtUit | null; vernieuw: () => Promise<void>; toon: (t: string) => void;
  naarSectie: (s: AfstemmingSectie) => void; openKaart: (id: string) => void; openKaartId: string;
  zoek: string;
};

export default function AfstemmingPagina({ lang, sourceOrigin, tabContext }: { lang: Lang; sourceOrigin: string; tabContext: string }) {
  const smal = useSmal();
  const [sectie, setSectie] = useState<AfstemmingSectie>(() => { try { return (sessionStorage.getItem('afv-sectie') as AfstemmingSectie) || 'overzicht'; } catch { return 'overzicht'; } });
  const [openKaartId, setOpenKaartId] = useState('');
  const [zoek, setZoek] = useState('');
  const [toevoegen, setToevoegen] = useState(false);
  const [ov, setOv] = useState<OverzichtUit | null>(null);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const toon = useCallback((t: string) => { setMelding(t); window.setTimeout(() => setMelding(''), 4500); }, []);
  const vernieuw = useCallback(async () => {
    try { setOv(await afstemmingClient.overzicht()); setFout(''); }
    catch (e) { const code = e instanceof AfstemmingFout ? e.code : 'FOUT'; if (code !== 'NOG_NIET_GEBOUWD') setFout(foutTekst(lang, code)); }
  }, [lang]);
  useEffect(() => { void vernieuw(); }, [vernieuw]);
  const naarSectie = useCallback((s: AfstemmingSectie) => { setSectie(s); try { sessionStorage.setItem('afv-sectie', s); } catch { /* privémodus */ } }, []);
  const openKaart = useCallback((id: string) => { setOpenKaartId(id); naarSectie('kartotheek'); }, [naarSectie]);
  const props: OnderdeelProps = useMemo(() => ({ lang, smal, sourceOrigin, tabContext, ov, vernieuw, toon, naarSectie, openKaart, openKaartId, zoek }), [lang, smal, sourceOrigin, tabContext, ov, vernieuw, toon, naarSectie, openKaart, openKaartId, zoek]);

  const onderdeel = () => {
    switch (sectie) {
      case 'kartotheek': return <Kartotheek {...props} />;
      case 'kaart-grafiek': return <Relatiekaart {...props} />;
      case 'controles': return <Controles {...props} />;
      case 'releases': return <Releases {...props} />;
      case 'mogelijkheden': return <Mogelijkheden {...props} />;
      case 'geschiedenis': return <Geschiedenis {...props} />;
      case 'bronnen': return <Bronnen {...props} />;
      default: return <Overzicht {...props} />;
    }
  };
  const navKnop = (s: AfstemmingSectie) => { const I = ICOON[s]; return (
    <button key={s} type='button' className={sectie === s ? 'is-actief' : ''} aria-current={sectie === s ? 'page' : undefined} onClick={() => naarSectie(s)} data-afv-nav={s}>
      <I aria-hidden='true' /><span>{afstemmingTekst(SECTIE_LABEL[s], lang)}</span>
    </button>); };

  return (
    <section className={`afv${smal ? ' is-smal' : ''}`} data-afv-sectie={sectie} aria-labelledby='afv-kop'>
      <header className='afv-kop'>
        <div className='afv-kop-titel'>
          <h2 id='afv-kop'>{tr(lang, 'Звірка · Розвиток продукту', 'Afstemming · Productontwikkeling')}</h2>
          <p className='afv-hint'>{tr(lang, 'Ідеї, реалізація, перевірки й знання — в одному місці.', 'Ideeën, realisatie, controles en kennis — op één plek.')}</p>
        </div>
        <div className='afv-kop-acties'>
          <div className='afv-zoek' role='search'>
            <Search aria-hidden='true' />
            <input value={zoek} data-afv-zoek='' placeholder={tr(lang, 'Знайти картку або можливість…', 'Zoek een kaart of mogelijkheid…')}
              aria-label={tr(lang, 'Пошук у картотеці', 'Zoeken in de kartotheek')}
              onChange={(e) => setZoek(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && zoek.trim().length >= 2) naarSectie('kartotheek'); }} />
          </div>
          <button type='button' className='afv-knop is-hoofd' data-afv-toevoegen='' onClick={() => setToevoegen(true)}><Plus aria-hidden='true' />{tr(lang, 'Додати ідею', 'Idee toevoegen')}</button>
        </div>
      </header>
      {fout ? <p className='afv-melding is-fout' role='alert'>{fout}</p> : null}
      {melding ? <p className='afv-toost' role='status' aria-live='polite'>{melding}</p> : null}
      <div className='afv-romp'>
        {!smal ? <nav className='afv-zijnav' aria-label={tr(lang, 'Розділи звірки', 'Onderdelen van de afstemming')}>{AFSTEMMING_SECTIES.map(navKnop)}</nav> : null}
        <div className='afv-inhoud'>
          <Suspense fallback={<p className='afv-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження…', 'Laden…')}</p>}>{onderdeel()}</Suspense>
        </div>
      </div>
      {toevoegen ? (
        <Suspense fallback={null}><Toevoegen {...props} onSluit={() => setToevoegen(false)} /></Suspense>
      ) : null}
      {smal ? (
        <nav className='afv-onderbalk' aria-label={tr(lang, 'Розділи', 'Onderdelen')}>
          {(['overzicht', 'kartotheek'] as AfstemmingSectie[]).map((s) => { const I = ICOON[s]; return <button key={s} type='button' className={sectie === s ? 'is-actief' : ''} aria-current={sectie === s ? 'page' : undefined} onClick={() => naarSectie(s)} data-afv-onderbalk={s}><I aria-hidden='true' /><span>{afstemmingTekst(SECTIE_LABEL[s], lang)}</span></button>; })}
          <button type='button' className='afv-plus' onClick={() => setToevoegen(true)} aria-label={tr(lang, 'Додати ідею', 'Idee toevoegen')} data-afv-onderbalk='toevoegen'><Plus aria-hidden='true' /></button>
          {(['kaart-grafiek'] as AfstemmingSectie[]).map((s) => { const I = ICOON[s]; return <button key={s} type='button' className={sectie === s ? 'is-actief' : ''} onClick={() => naarSectie(s)} data-afv-onderbalk={s}><I aria-hidden='true' /><span>{tr(lang, 'Мапа', 'Kaart')}</span></button>; })}
          <details className='afv-onderbalk-meer'>
            <summary aria-label={tr(lang, 'Інші розділи', 'Meer onderdelen')}><MoreHorizontal aria-hidden='true' /><span>{tr(lang, 'Ще', 'Meer')}</span></summary>
            <div className='afv-onderbalk-menu'>
              {(['controles', 'releases', 'mogelijkheden', 'geschiedenis', 'bronnen'] as AfstemmingSectie[]).map((s) => { const I = ICOON[s]; return <button key={s} type='button' onClick={(e) => { naarSectie(s); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}><I aria-hidden='true' />{afstemmingTekst(SECTIE_LABEL[s], lang)}</button>; })}
            </div>
          </details>
        </nav>
      ) : null}
    </section>
  );
}
