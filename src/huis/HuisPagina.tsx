// Huis vNext — de pagina (vlag huis-vnext, migratie 0128), binnen de bestaande CanonicalChrome; de onderdelen zijn de tabbladen
// van de dienst huis (public/canonical-service.js). Eén woning tegelijk (keuze in de kop); zonder woning een eerlijke start;
// zonder integratie een eerlijke lege toestand met één knop. Alles via /api/huis/*; toestanden alleen zoals waargenomen.
import IntegratieStrook from '../integraties/IntegratieStrook'; // UI-013 fase 2: gedeelde verbindingenstrook (vlag integraties-catalogus-v2)
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, Bot, Calculator, ChevronDown, CloudOff, Eye, Gauge, Home, LayoutGrid, Lightbulb, MoreHorizontal, Plug, RefreshCw, Settings, ShieldCheck, Sparkles, Store, Workflow } from 'lucide-react';
import { HUIS_TABS, HUIS_TAB_LABEL, type HuisTab } from '../../shared/huis-model';
import { HuisFout, gekozenWoning, huisClient, kiesWoning, type Overzicht as OverzichtUit } from './huis-client';
import { foutTekst, geledenTekst, serverFout, tr, useSmal, type Lang } from './tekst';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import './huis.css';

const Overzicht = lazy(() => import('./onderdelen/Overzicht'));
const Kamers = lazy(() => import('./onderdelen/Kamers'));
const Apparaten = lazy(() => import('./onderdelen/Apparaten'));
const Scenes = lazy(() => import('./onderdelen/Scenes'));
const Automatiseringen = lazy(() => import('./onderdelen/Automatiseringen'));
const Beveiliging = lazy(() => import('./onderdelen/Beveiliging'));
const Energie = lazy(() => import('./onderdelen/Energie'));
const Gebeurtenissen = lazy(() => import('./onderdelen/Gebeurtenissen'));
const Integraties = lazy(() => import('./onderdelen/Integraties'));
const Assistent = lazy(() => import('./onderdelen/Assistent'));
const Instellingen = lazy(() => import('./onderdelen/Instellingen'));
const Showroom = lazy(() => import('./onderdelen/Showroom'));
const Planner = lazy(() => import('./onderdelen/Planner'));

export type OnderdeelProps = { lang: Lang; smal: boolean; woningId: string; ov: OverzichtUit; vernieuw: () => Promise<void>; toon: (t: string, soort?: 'ok' | 'fout') => void; naarTab: (t: HuisTab) => void };
const ICOON: Record<HuisTab, typeof Home> = { overview: Home, rooms: LayoutGrid, devices: Lightbulb, scenes: Sparkles, automations: Workflow, security: ShieldCheck, energy: Gauge, activity: Activity, integrations: Plug, assistant: Bot, settings: Settings, showroom: Store, planner: Calculator };

export default function HuisPagina({ lang, tab, onNavigateTab }: { lang: Lang; tab: string; onNavigateTab: (id: string) => void }) {
  const smal = useSmal();
  const huidig: HuisTab = (HUIS_TABS as readonly string[]).includes(tab) ? (tab as HuisTab) : 'overview';
  const [woningen, setWoningen] = useState<Awaited<ReturnType<typeof huisClient.woningen>> | null>(null);
  const [woningId, setWoningId] = useState(gekozenWoning());
  const [ov, setOv] = useState<OverzichtUit | null>(null);
  const [fout, setFout] = useState('');
  const [nieuweNaam, setNieuweNaam] = useState('');
  const [bezig, setBezig] = useState(false);
  const [kiezer, setKiezer] = useState(false);
  // UI-005: de woningenlijst heeft drie eerlijke toestanden; bij een storing NIET doen alsof er geen woning is (dan geen formulier).
  const [lijstFout, setLijstFout] = useState('');
  const [naPlatform, setNaPlatform] = useState(false);
  const naamVeld = useRef<HTMLInputElement | null>(null);
  const laadTeller = useRef(0);

  // HUIS-001 (10.11.2026): elke uitkomst gaat naar het meldingencentrum van het platform (pop-up + regel in het paneel, dienst «Дім / Huis»),
  // niet meer naar een eigen regel die na 4,5 s spoorloos verdween. `context` zegt over welke woning het gaat.
  const woningNaam = useRef('');
  const toon = useCallback((t: string, soort: 'ok' | 'fout' = 'ok') => { emitCanonicalNotice({ text: t, kind: soort === 'fout' ? 'error' : 'success', source: 'huis', context: woningNaam.current || undefined }); }, []);
  const laadWoningen = useCallback(async () => {
    try { const w = await huisClient.woningen(); setWoningen(w); setFout(''); setLijstFout(''); const keuze = w.find((x) => x.id === woningId) ? woningId : (w[0]?.id ?? ''); if (keuze !== woningId) { setWoningId(keuze); kiesWoning(keuze); } }
    catch (e) { setLijstFout(foutTekst(lang, e instanceof HuisFout ? (serverFout(e.status) ? 'SERVER' : e.code) : 'NETWERK')); setWoningen(null); }
  }, [lang, woningId]);
  const vernieuw = useCallback(async () => {
    if (!woningId) { setOv(null); return; }
    const nr = ++laadTeller.current;
    try { const d = await huisClient.overzicht(woningId); if (nr === laadTeller.current) { setOv(d); setFout(''); } }
    catch (e) { if (nr === laadTeller.current) setFout(foutTekst(lang, e instanceof HuisFout ? (serverFout(e.status) ? 'SERVER' : e.code) : 'NETWERK')); }
  }, [woningId, lang]);
  useEffect(() => { void laadWoningen(); }, [laadWoningen]);
  useEffect(() => { void vernieuw(); }, [vernieuw]);
  // Polling (geen WS in deze release): elke 30 s de waarnemingen verversen zolang het tabblad zichtbaar is.
  useEffect(() => { const t = window.setInterval(() => { if (document.visibilityState === 'visible') void vernieuw(); }, 30_000); return () => window.clearInterval(t); }, [vernieuw]);
  const naarTab = useCallback((t: HuisTab) => onNavigateTab(t), [onNavigateTab]);
  woningNaam.current = woningen?.find((w) => w.id === woningId)?.naam ?? '';

  const maakWoning = async () => {
    const naam = nieuweNaam.trim(); if (!naam || bezig) return;
    setBezig(true);
    try { const w = await huisClient.woningNieuw(naam, lang); kiesWoning(w.id); setWoningId(w.id); setNieuweNaam(''); await laadWoningen(); toon(tr(lang, 'Оселю створено. Наступний крок — підключити Home Assistant.', 'Woning aangemaakt. Volgende stap: Home Assistant koppelen.')); if (naPlatform) { setNaPlatform(false); naarTab('integrations'); } }
    catch (e) { setFout(foutTekst(lang, e instanceof HuisFout ? (serverFout(e.status) ? 'SERVER' : e.code) : 'NETWERK')); } finally { setBezig(false); }
  };
  const kanaal = useMemo(() => {
    if (!ov) return { stand: 'laden', tekst: tr(lang, 'завантаження…', 'laden…') };
    if (!ov.integraties.length) return { stand: 'geen', tekst: tr(lang, 'шлюз не підключено', 'geen gateway') };
    const i = ov.integraties[0];
    const oud = i.hartslag ? Date.now() - Date.parse(i.hartslag) > 15 * 60_000 : true;
    if (i.stand === 'verbonden' && !oud) return { stand: 'lokaal', tekst: tr(lang, `локально · ${geledenTekst(lang, i.hartslag)}`, `lokaal · ${geledenTekst(lang, i.hartslag)}`) };
    if (i.stand === 'verbonden' && oud) return { stand: 'verouderd', tekst: tr(lang, `застаріло · ${geledenTekst(lang, i.hartslag)}`, `verouderd · ${geledenTekst(lang, i.hartslag)}`) };
    return { stand: i.stand, tekst: tr(lang, i.stand === 'geweigerd' ? 'відмовлено' : 'з перебоями', i.stand === 'geweigerd' ? 'geweigerd' : 'verzwakt') };
  }, [ov, lang]);

  const props: OnderdeelProps | null = ov && woningId ? { lang, smal, woningId, ov, vernieuw, toon, naarTab } : null;
  const onderdeel = () => {
    if (huidig === 'showroom') return <Showroom lang={lang} smal={smal} naarTab={naarTab} />;
    if (huidig === 'planner') return <Planner lang={lang} naarTab={naarTab} />;
    if (!props) return null;
    switch (huidig) {
      case 'rooms': return <Kamers {...props} />; case 'devices': return <Apparaten {...props} />; case 'scenes': return <Scenes {...props} />; case 'automations': return <Automatiseringen {...props} />;
      case 'security': return <Beveiliging {...props} />; case 'energy': return <Energie {...props} />; case 'activity': return <Gebeurtenissen {...props} />; case 'integrations': return <><IntegratieStrook lang={props.lang} dienst='huis' /><Integraties {...props} /></>;
      case 'assistant': return <Assistent {...props} />; case 'settings': return <Instellingen {...props} onWoningen={laadWoningen} />;
      default: return <Overzicht {...props} />;
    }
  };
  const Titel = ICOON[huidig];
  const publiek = huidig === 'showroom' || huidig === 'planner';

  return (
    <section className={`hv${smal ? ' is-smal' : ''}`} data-hv-pagina={huidig} aria-labelledby='hv-kop'>
      <header className='hv-kop'>
        <div className='hv-kop-tekst'>
          <h2 id='hv-kop'><Titel aria-hidden='true' />{tr(lang, HUIS_TAB_LABEL[huidig][0], HUIS_TAB_LABEL[huidig][1])}{publiek ? <span className='hv-demo-label' data-hv-demo-label='1'>{tr(lang, 'Демо', 'Demo')}</span> : null}</h2>
          {publiek ? <p className='hv-hint'>{tr(lang, 'Демонстраційний розділ: лише ілюстративні дані, жодних команд і жодного зв’язку з вашими пристроями.', 'Demonstratie: alleen illustratieve gegevens, geen opdrachten en geen verbinding met uw apparaten.')}</p>
            : woningen && woningen.length > 0 ? (
              <div className='hv-kop-woning'>
                {woningen.length > 1 ? (
                  <div className='hv-kiezer'>
                    <button type='button' className='hv-knop is-klein' aria-haspopup='listbox' aria-expanded={kiezer} onClick={() => setKiezer((v) => !v)} data-hv-woning-kiezer='1'><Home aria-hidden='true' />{woningen.find((w) => w.id === woningId)?.naam ?? '…'}<ChevronDown aria-hidden='true' /></button>
                    {kiezer ? <ul role='listbox' className='hv-kiezer-lijst'>{woningen.map((w) => <li key={w.id} role='option' aria-selected={w.id === woningId}><button type='button' onClick={() => { setWoningId(w.id); kiesWoning(w.id); setKiezer(false); }}>{w.naam}</button></li>)}</ul> : null}
                  </div>
                ) : <span className='hv-kop-naam'><Home aria-hidden='true' />{woningen[0].naam}</span>}
                <button type='button' className={`hv-kanaal is-${kanaal.stand}`} onClick={() => naarTab('integrations')} title={tr(lang, 'Стан каналу — відкрити інтеграції', 'Kanaalstatus — integraties openen')} data-hv-kanaal={kanaal.stand}><span aria-hidden='true' />{kanaal.tekst}</button>
                <button type='button' className='hv-icoonknop' onClick={() => void vernieuw()} aria-label={tr(lang, 'Оновити', 'Verversen')} title={tr(lang, 'Оновити', 'Verversen')} data-hv-vernieuw='1'><RefreshCw /></button>
              </div>
            ) : null}
        </div>
      </header>
      {fout ? <p className='hv-melding is-fout' role='alert'><AlertCircle aria-hidden='true' />{fout}</p> : null}

      {!publiek && lijstFout ? (
        <section className='hv-foutkaart' role='alert' data-hv-fout-kaart='1'>
          <CloudOff aria-hidden='true' />
          <div>
            <h3>{tr(lang, 'Розумний будинок зараз не відповідає', 'Het slimme huis antwoordt nu niet')}</h3>
            <p>{lijstFout} {tr(lang, 'Ваші дані в безпеці — нічого не змінено.', 'Uw gegevens zijn veilig — er is niets gewijzigd.')}</p>
          </div>
          <button type='button' className='hv-knop' onClick={() => { setLijstFout(''); void laadWoningen(); }} data-hv-opnieuw='1'><RefreshCw aria-hidden='true' />{tr(lang, 'Спробувати ще раз', 'Opnieuw proberen')}</button>
        </section>
      ) : null}
      {!publiek && !lijstFout && woningen === null ? <p className='hv-hint' role='status' aria-busy='true' data-hv-laden='1'>{tr(lang, 'Завантаження…', 'Laden…')}</p> : null}

      {!publiek && woningen && !woningen.length ? (
        <section className='hv-start' data-hv-start='1' aria-labelledby='hv-start-kop'>
          <div className='hv-start-kop'>
            <h3 id='hv-start-kop'>{tr(lang, 'Ваш розумний будинок — в одному місці', 'Uw slimme huis — op één plek')}</h3>
            <p>{tr(lang, 'Кімнати, пристрої, сцени й події. Показуємо лише те, що справді повідомив ваш шлюз, — без вигаданих станів.', 'Kamers, apparaten, scènes en gebeurtenissen. We tonen alleen wat uw gateway echt meldt — geen verzonnen toestanden.')}</p>
          </div>
          <div className='hv-start-acties'>
            <div className='hv-start-actie is-hoofd' data-hv-actie='woning'>
              <span className='hv-start-icoon' aria-hidden='true'><Home /></span>
              <h4>{tr(lang, 'Створити оселю', 'Woning aanmaken')}</h4>
              <p>{tr(lang, 'Дайте їй назву — далі додасте кімнати.', 'Geef haar een naam — daarna voegt u kamers toe.')}</p>
              <form onSubmit={(e) => { e.preventDefault(); void maakWoning(); }} className='hv-start-vorm'>
                <input ref={naamVeld} value={nieuweNaam} maxLength={80} placeholder={tr(lang, 'Напр. «Дім у Генті»', 'Bv. «Huis in Gent»')} aria-label={tr(lang, 'Назва оселі', 'Naam van de woning')} onChange={(e) => setNieuweNaam(e.target.value)} data-hv-woning-naam='1' />
                <button type='submit' className='hv-knop is-hoofd' disabled={!nieuweNaam.trim() || bezig} aria-busy={bezig || undefined} data-hv-woning-maak='1'>{bezig ? tr(lang, 'Створюємо…', 'Bezig…') : tr(lang, 'Створити', 'Aanmaken')}</button>
              </form>
            </div>
            <div className='hv-start-actie' data-hv-actie='platform'>
              <span className='hv-start-icoon' aria-hidden='true'><Plug /></span>
              <h4>{tr(lang, 'Підключити платформу', 'Platform koppelen')}</h4>
              <p>{tr(lang, 'Home Assistant: пристрої та їхні справжні стани.', 'Home Assistant: apparaten en hun echte toestanden.')}</p>
              <button type='button' className='hv-knop' onClick={() => { setNaPlatform(true); naamVeld.current?.focus(); }} data-hv-platform='1'>{tr(lang, 'Підключити', 'Koppelen')}</button>
              {naPlatform ? <p className='hv-start-uitleg' role='status' data-hv-platform-uitleg='1'>{tr(lang, 'Спершу назвіть оселю ліворуч — одразу після цього відкриється підключення.', 'Geef eerst de woning een naam — daarna opent het koppelen meteen.')}</p> : null}
            </div>
            <div className='hv-start-actie' data-hv-actie='demo'>
              <span className='hv-start-icoon' aria-hidden='true'><Eye /></span>
              <h4>{tr(lang, 'Переглянути демонстрацію', 'Demonstratie bekijken')}</h4>
              <p>{tr(lang, 'Приклад оселі з вигаданими даними, без ваших пристроїв.', 'Een voorbeeldwoning met verzonnen gegevens, zonder uw apparaten.')}</p>
              <button type='button' className='hv-knop' onClick={() => naarTab('showroom')} data-hv-demo='1'>{tr(lang, 'Відкрити демо', 'Demo openen')}</button>
            </div>
          </div>
          <ul className='hv-start-mogelijk' aria-label={tr(lang, 'Що вміє розумний будинок', 'Wat het slimme huis kan')}>
            <li><LayoutGrid aria-hidden='true' />{tr(lang, 'Кімнати й план', 'Kamers en plattegrond')}</li>
            <li><Sparkles aria-hidden='true' />{tr(lang, 'Сцени одним дотиком', 'Scènes met één tik')}</li>
            <li><ShieldCheck aria-hidden='true' />{tr(lang, 'Замки й охорона — лише з вашим підтвердженням', 'Sloten en alarm — alleen met uw bevestiging')}</li>
            <li><Activity aria-hidden='true' />{tr(lang, 'Журнал подій', 'Logboek van gebeurtenissen')}</li>
          </ul>
          <p className='hv-start-echt'><span><span className='hv-merk is-echt'>{tr(lang, 'Справжнє', 'Echt')}</span> {tr(lang, 'ваша оселя й дані шлюзу', 'uw woning en gegevens van de gateway')}</span><span><span className='hv-merk is-demo'>{tr(lang, 'Демо', 'Demo')}</span> {tr(lang, 'лише приклад, нічим не керує', 'alleen voorbeeld, bedient niets')}</span></p>
        </section>
      ) : null}

      <div className='hv-inhoud'>
        <Suspense fallback={<p className='hv-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження…', 'Laden…')}</p>}>
          {publiek || (woningen && woningen.length && !ov) ? (publiek ? onderdeel() : <p className='hv-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження…', 'Laden…')}</p>) : onderdeel()}
        </Suspense>
      </div>

      {smal ? (
        <nav className='hv-onderbalk' aria-label={tr(lang, 'Розділи', 'Onderdelen')}>
          {(['overview', 'rooms', 'devices', 'scenes'] as HuisTab[]).map((t) => { const I = ICOON[t]; return <button key={t} type='button' className={huidig === t ? 'is-actief' : ''} aria-current={huidig === t ? 'page' : undefined} onClick={() => naarTab(t)} data-hv-onderbalk={t}><I aria-hidden='true' /><span>{tr(lang, HUIS_TAB_LABEL[t][0], HUIS_TAB_LABEL[t][1])}</span></button>; })}
          <details className='hv-onderbalk-meer'>
            <summary aria-label={tr(lang, 'Інші розділи', 'Meer onderdelen')}><MoreHorizontal aria-hidden='true' /><span>{tr(lang, 'Ще', 'Meer')}</span></summary>
            <div className='hv-onderbalk-menu'>
              {(['automations', 'security', 'energy', 'activity', 'integrations', 'assistant', 'settings', 'showroom', 'planner'] as HuisTab[]).map((t) => { const I = ICOON[t]; return <button key={t} type='button' onClick={(e) => { naarTab(t); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}><I aria-hidden='true' />{tr(lang, HUIS_TAB_LABEL[t][0], HUIS_TAB_LABEL[t][1])}</button>; })}
            </div>
          </details>
        </nav>
      ) : null}
    </section>
  );
}
