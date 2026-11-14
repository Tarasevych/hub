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
import { MaquetteAnkerRail, MaquetteHeld, type MaquetteAnkerItem, type MaquetteHeldStatistiek } from '../maquette-kern';
import { useIsMaquette } from '../thema/useThema';
import './huis.css';
import './huis-kern-maquette.css';
// SEC-002 (g02): wie zelf nog geen woning heeft, ziet de uitnodigingen al op het startscherm (anders pas onder «Налаштування»).
import UitnodigingenVoorMij from './onderdelen/UitnodigingenVoorMij';

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

const HUIS_LAAG_SELECTOR = ".hv-laag, .hv-bevestig, [data-mq-laag-open='1'], dialog[open], [role='dialog'][aria-modal='true']";

type HeldTekst = {
  boven: readonly [string, string];
  voor: readonly [string, string];
  cursief: readonly [string, string];
  beschrijving: readonly [string, string];
  secundairDoel: HuisTab;
};

const HUIS_HELD_START: Omit<HeldTekst, 'secundairDoel'> = {
  boven: ['ПОЧАТОК ОСЕЛІ · HUIS.TARASEVYCH.COM', 'START VAN UW WONING · HUIS.TARASEVYCH.COM'],
  voor: ['Ваша оселя починається з', 'Uw woning begint met'],
  cursief: ['чистого аркуша.', 'een schone lei.'],
  beschrijving: [
    'Дайте назву своєму домові, підключіть локальний шлюз Home Assistant або огляньте інтерактивну вітрину. Тут відображаються лише справжні спостереження ваших пристроїв.',
    'Geef uw woning een naam, koppel uw lokale Home Assistant-gateway of bekijk de interactieve toonzaal. Hier verschijnen uitsluitend echte waarnemingen van uw apparaten.',
  ],
};

const HUIS_HELD_TEKSTEN: Record<HuisTab, HeldTekst> = {
  overview: {
    boven: ['ПРОСТІР РОЗУМНОЇ ОСЕЛІ · HUIS.TARASEVYCH.COM', 'SLIMME WOONRUIMTE · HUIS.TARASEVYCH.COM'],
    voor: ['Затишок дому та', 'Wooncomfort en'],
    cursief: ['справжні спостереження.', 'echte waarnemingen.'],
    beschrijving: [
      'Живий огляд вашої оселі без вигаданих показників: температура з часом виміру, підтверджене освітлення, споживання енергії, охорона й останні події локального шлюзу.',
      'Een levend overzicht van uw woning zonder verzonnen cijfers: temperatuur met meettijd, bevestigde verlichting, energieverbruik, beveiliging en recente meldingen van de lokale gateway.',
    ],
    secundairDoel: 'rooms',
  },
  rooms: {
    boven: ['ПРОСТОРОВА БУДОВА · HUIS.TARASEVYCH.COM', 'RUIMTELIJKE INDELING · HUIS.TARASEVYCH.COM'],
    voor: ['Кімнати, поверхи й', 'Kamers, verdiepingen en'],
    cursief: ['живий план.', 'levende plattegrond.'],
    beschrijving: [
      'Упорядковуйте простори вашого дому за поверхами та переглядайте підтверджені стани пристроїв просто на кресленні оселі.',
      'Orden de ruimtes van uw woning per verdieping en bekijk bevestigde apparaattoestanden rechtstreeks op de plattegrond.',
    ],
    secundairDoel: 'devices',
  },
  devices: {
    boven: ['ВУЗЛИ ТА КЕРУВАННЯ · HUIS.TARASEVYCH.COM', 'APPARATEN EN BEDIENING · HUIS.TARASEVYCH.COM'],
    voor: ['Кожен пристрій із', 'Elk apparaat met'],
    cursief: ['чесною свіжістю.', 'eerlijke versheid.'],
    beschrijving: [
      'Керуйте освітленням, кліматом і механізмами з обов’язковим очікуванням відповіді шлюзу та видимою актуальністю кожного виміру.',
      'Bedien verlichting, klimaat en mechanismen met verplichte terugkoppeling van de gateway en zichtbare actualiteit van elke meting.',
    ],
    secundairDoel: 'scenes',
  },
  scenes: {
    boven: ['СЦЕНАРІЇ НАСТРОЮ · HUIS.TARASEVYCH.COM', 'SFEERSCÈNES · HUIS.TARASEVYCH.COM'],
    voor: ['Гармонія світла й тепла', 'Harmonie van licht en warmte'],
    cursief: ['одним дотиком.', 'met één aanraking.'],
    beschrijving: [
      'Поєднуйте узгоджені дії для ранку, вечора чи відпочинку з покроковою перевіркою виконання на кожному пристрої.',
      'Bundel afgestemde handelingen voor ochtend, avond of rust met stapsgewijze uitvoeringsbevestiging per apparaat.',
    ],
    secundairDoel: 'automations',
  },
  automations: {
    boven: ['ПРАВИЛА Й ЗАПОБІЖНИКИ · HUIS.TARASEVYCH.COM', 'REGELS EN VEILIGHEIDSMARGES · HUIS.TARASEVYCH.COM'],
    voor: ['Зважена автоматика', 'Doordachte automatisering'],
    cursief: ['без замкнених петель.', 'zonder eindeloze lussen.'],
    beschrijving: [
      'Визначайте прозорі умови часу й подій із перевіркою пробного прогону, періодом охолодження та забороною самовільних критичних дій.',
      'Stel heldere tijd- en gebeurtenisvoorwaarden in met proefloopcontrole, afkoeltijd en uitsluiting van zelfstandige kritieke acties.',
    ],
    secundairDoel: 'activity',
  },
  security: {
    boven: ['ОХОРОННИЙ КОНТУР · HUIS.TARASEVYCH.COM', 'BEVEILIGINGSKRING · HUIS.TARASEVYCH.COM'],
    voor: ['Спокій оселі під', 'Gemoedsrust onder'],
    cursief: ['рішенням людини.', 'menselijk besluit.'],
    beschrijving: [
      'Контролюйте датчики руху, протікання, диму, замки та охоронні режими: критичні перемикання вимагають явного підтвердження мешканця.',
      'Bewaak bewegings-, lek- en rookmelders, sloten en alarmstanden: kritieke schakelingen vereisen altijd uitdrukkelijke bevestiging van een bewoner.',
    ],
    secundairDoel: 'activity',
  },
  energy: {
    boven: ['ОБЛІК ТА ПОТУЖНІСТЬ · HUIS.TARASEVYCH.COM', 'METING EN VERMOGEN · HUIS.TARASEVYCH.COM'],
    voor: ['Прозорий баланс', 'Heldere balans van'],
    cursief: ['енергії дому.', 'huisenergie.'],
    beschrijving: [
      'Спостерігайте за миттєвою потужністю та накопиченими показниками лічильників виключно на основі датованих вимірів.',
      'Volg het actuele vermogen en opgebouwde meterstanden uitsluitend op basis van gedateerde waarnemingen.',
    ],
    secundairDoel: 'devices',
  },
  activity: {
    boven: ['ХРОНІКА СПОСТЕРЕЖЕНЬ · HUIS.TARASEVYCH.COM', 'WAARNEMINGSKRONIEK · HUIS.TARASEVYCH.COM'],
    voor: ['Послідовний літопис', 'Sluitend logboek van'],
    cursief: ['подій і команд.', 'gebeurtenissen en opdrachten.'],
    beschrijving: [
      'Переглядайте повний журнал сигналів датчиків, надісланих команд і підтверджень шлюзу з точними часовими позначками.',
      'Raadpleeg het volledige journaal van sensorsignalen, verzonden opdrachten en gatewaybevestigingen met exacte tijdstempels.',
    ],
    secundairDoel: 'security',
  },
  integrations: {
    boven: ['ЛОКАЛЬНИЙ МІСТ · HUIS.TARASEVYCH.COM', 'LOKALE BRUG · HUIS.TARASEVYCH.COM'],
    voor: ['Прямий зв’язок із', 'Rechtstreekse verbinding met'],
    cursief: ['домашнім шлюзом.', 'uw thuisgateway.'],
    beschrijving: [
      'Підключайте Home Assistant у власній мережі без сторонніх хмар і перевіряйте пульс зв’язку та перелік виявлених вузлів.',
      'Koppel Home Assistant binnen uw eigen netwerk zonder externe wolken en controleer de hartslag en gevonden eenheden.',
    ],
    secundairDoel: 'devices',
  },
  assistant: {
    boven: ['ДОРАДЧИЙ ІНТЕЛЕКТ · HUIS.TARASEVYCH.COM', 'ADVISERENDE INTELLIGENTIE · HUIS.TARASEVYCH.COM'],
    voor: ['Уважний порадник,', 'Zorgvuldige raadgever,'],
    cursief: ['де вирішуєте ви.', 'waarbij u beslist.'],
    beschrijving: [
      'Отримуйте обґрунтовані пропозиції щодо сцен і правил на основі спостережень оселі — жодна критична дія не виконується сама.',
      'Ontvang onderbouwde voorstellen voor scènes en regels op basis van woningwaarnemingen — geen enkele kritieke handeling gebeurt vanzelf.',
    ],
    secundairDoel: 'scenes',
  },
  settings: {
    boven: ['УСТРІЙ ОСЕЛІ · HUIS.TARASEVYCH.COM', 'WONINGBEHEER · HUIS.TARASEVYCH.COM'],
    voor: ['Мешканці, права й', 'Bewoners, rechten en'],
    cursief: ['спільний лад.', 'gedeelde orde.'],
    beschrijving: [
      'Керуйте назвою оселі, поверхами, учасниками, рівнями доступу та запрошеннями в єдиному захищеному просторі.',
      'Beheer de woningnaam, verdiepingen, deelnemers, toegangsniveaus en uitnodigingen in één afgeschermde omgeving.',
    ],
    secundairDoel: 'integrations',
  },
  showroom: {
    boven: ['ДЕМОНСТРАЦІЙНА ВІТРИНА · HUIS.TARASEVYCH.COM', 'DEMONSTRATIETOONZAAL · HUIS.TARASEVYCH.COM'],
    voor: ['Наочний ланцюжок', 'Zichtbare keten van'],
    cursief: ['від датчика до дії.', 'sensor tot bevestiging.'],
    beschrijving: [
      'Досліджуйте інтерактивні сценарії на умовних даних та повноцінний макет «Живий дім» без жодного впливу на ваші справжні пристрої.',
      'Verken interactieve scenario’s met voorbeeldgegevens en de volledige maquette «Levend huis» zonder enige invloed op uw echte apparaten.',
    ],
    secundairDoel: 'overview',
  },
  planner: {
    boven: ['АРХІТЕКТУРНИЙ РОЗРАХУНОК · HUIS.TARASEVYCH.COM', 'ARCHITECTURAAL ONTWERP · HUIS.TARASEVYCH.COM'],
    voor: ['Продумана будова', 'Doordachte opbouw van'],
    cursief: ['майбутньої системи.', 'uw toekomstige systeem.'],
    beschrijving: [
      'Оцінюйте орієнтовну кількість зон, вузлів та чинників складності за площею й типом житла без вигаданих цінових обіцянок.',
      'Bepaal een eerlijke indicatie van zones, eenheden en complexiteitsfactoren naar oppervlakte en woningtype zonder verzonnen prijsbeloften.',
    ],
    secundairDoel: 'showroom',
  },
};

export default function HuisPagina({ lang, tab, onNavigateTab }: { lang: Lang; tab: string; onNavigateTab: (id: string) => void }) {
  const isMaquette = useIsMaquette();
  const [laagOpen, setLaagOpen] = useState(false);
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
  const zonderWoning = !publiek && Boolean(woningen && !woningen.length);

  useEffect(() => {
    if (!isMaquette || typeof document === 'undefined') {
      setLaagOpen(false);
      return;
    }
    const controleer = () => {
      setLaagOpen(Boolean(document.querySelector(HUIS_LAAG_SELECTOR)));
    };
    controleer();
    const wortel = document.documentElement ?? document.body;
    if (!wortel || typeof MutationObserver !== 'function') return;
    const waarnemer = new MutationObserver(controleer);
    waarnemer.observe(wortel, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'class', 'aria-modal', 'data-mq-laag-open'],
    });
    return () => waarnemer.disconnect();
  }, [isMaquette, huidig]);

  const statistieken = useMemo<ReadonlyArray<MaquetteHeldStatistiek>>(
    () => [
      { waarde: ov?.ruimtes.length ?? 0, label: tr(lang, 'Кімнат', 'Kamers') },
      { waarde: ov?.apparaten.length ?? 0, label: tr(lang, 'Пристроїв', 'Apparaten') },
      { waarde: ov?.scenes.length ?? 0, label: tr(lang, 'Сцен', 'Scènes') },
      { waarde: kanaal.tekst, label: tr(lang, 'Канал шлюзу', 'Gatewaykanaal') },
    ],
    [ov, kanaal.tekst, lang],
  );

  const ankerItems = useMemo<ReadonlyArray<MaquetteAnkerItem>>(
    () =>
      HUIS_TABS.map((t) => ({
        id: t,
        label: tr(lang, HUIS_TAB_LABEL[t][0], HUIS_TAB_LABEL[t][1]),
        badge:
          t === 'devices' && ov
            ? ov.apparaten.length
            : t === 'rooms' && ov
              ? ov.ruimtes.length
              : undefined,
      })),
    [lang, ov],
  );

  const heldTekst = zonderWoning ? HUIS_HELD_START : HUIS_HELD_TEKSTEN[huidig];
  const heldPrimair = zonderWoning
    ? { label: tr(lang, 'Назвати оселю', 'Woning benoemen'), onClick: () => naamVeld.current?.focus() }
    : huidig === 'overview'
      ? {
          label: ov && !ov.integraties.length ? tr(lang, 'Підключити шлюз', 'Gateway koppelen') : tr(lang, 'До пристроїв', 'Naar apparaten'),
          onClick: () => naarTab(ov && !ov.integraties.length ? 'integrations' : 'devices'),
        }
      : huidig === 'showroom'
        ? { label: tr(lang, 'Планувальник структури', 'Structuurplanner'), onClick: () => naarTab('planner') }
        : huidig === 'planner'
          ? { label: tr(lang, 'Демонстраційна вітрина', 'Demonstratietoonzaal'), onClick: () => naarTab('showroom') }
          : { label: tr(lang, 'До огляду оселі', 'Naar huisoverzicht'), onClick: () => naarTab('overview') };

  const heldSecundair = zonderWoning
    ? { label: tr(lang, 'Переглянути вітрину', 'Toonzaal bekijken'), onClick: () => naarTab('showroom') }
    : {
        label: tr(lang, HUIS_TAB_LABEL[HUIS_HELD_TEKSTEN[huidig].secundairDoel][0], HUIS_TAB_LABEL[HUIS_HELD_TEKSTEN[huidig].secundairDoel][1]),
        onClick: () => naarTab(HUIS_HELD_TEKSTEN[huidig].secundairDoel),
      };

  return (
    <section
      className={`hv${smal ? ' is-smal' : ''}${isMaquette ? ' mq-schil huis-maquette-wikkel' : ''}`}
      data-hv-pagina={huidig}
      data-mq-dienst={isMaquette ? 'huis' : undefined}
      aria-labelledby='hv-kop'
    >
      {isMaquette ? (
        <MaquetteHeld
          key={'huis-held-' + huidig}
          id='huis-maquette-held'
          dienst='huis'
          lang={lang}
          modus={huidig === 'overview' || huidig === 'showroom' || Boolean(woningen && !woningen.length) ? 'volledig' : 'compact'}
          opslagSleutel={'huis-' + huidig}
          bovenregel={tr(lang, heldTekst.boven[0], heldTekst.boven[1])}
          titelVoor={tr(lang, heldTekst.voor[0], heldTekst.voor[1])}
          titelCursief={tr(lang, heldTekst.cursief[0], heldTekst.cursief[1])}
          beschrijving={tr(lang, heldTekst.beschrijving[0], heldTekst.beschrijving[1])}
          statistieken={statistieken}
          primair={heldPrimair}
          secundair={heldSecundair}
        />
      ) : null}

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
          <UitnodigingenVoorMij lang={lang} toon={toon} naAanvaarden={async (id) => { kiesWoning(id); setWoningId(id); await laadWoningen(); }} />
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

      {isMaquette && !smal && !laagOpen && !kiezer && (publiek || (woningen && woningen.length > 0 && !lijstFout)) ? (
        <MaquetteAnkerRail
          lang={lang}
          opslagSleutel='huis-anker'
          titel={tr(lang, 'Розділи оселі', 'Onderdelen van het huis')}
          ondertitel={tr(lang, 'Перетягніть до зручного краю', 'Sleep naar een gewenste rand')}
          items={ankerItems}
          actief={huidig}
          onKies={(id) => naarTab(id as HuisTab)}
        />
      ) : null}
    </section>
  );
}
