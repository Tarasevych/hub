// Cloud vNext — de pagina (vlag cloud-vnext, migratie 0130), binnen de bestaande CanonicalChrome; de onderdelen zijn de
// tabbladen van de dienst cloud (public/canonical-service.js). De oude pagina (src/CloudFunctioneelWeergave.tsx) blijft achter
// de vlag UIT volledig bestaan; beide lezen dezelfde records. Agenda en Foto's hergebruiken de bestaande Google-weergaven.
import IntegratieStrook from '../integraties/IntegratieStrook'; // UI-013 fase 2: gedeelde verbindingenstrook (vlag integraties-catalogus-v2)
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Cloud, FolderOpen, Images, Inbox, Link2, LayoutDashboard, MoreHorizontal, Plus, Search, Share2, Upload, Users } from 'lucide-react';
import { MaquetteAnkerRail, MaquetteHeld, type MaquetteAnkerItem, type MaquetteHeldStatistiek } from '../maquette-kern';
import { useIsMaquette } from '../thema/useThema';
import { cloudClient, CloudFout, type Overzicht as OverzichtUit } from './cloud-client';
import { bytesTekst, foutTekst, tr, useSmal, type Lang } from './tekst';
import { paginaVerborgen } from '../foto/foto-vlaggen';
import { DIEPE_PARAMS, diepeWaarde, wisDiepeParams } from '../../shared/zoek-diepe-link';
import { sessieZet } from './hulp';
import './cloud-vnext.css';
import './cloud-vnext-integraties.css';
import './cloud-vnext-delen.css';
import './cloud-vnext-mobiel.css';
import './cloud-kern-maquette.css';

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
const VOLLEDIG_HELD_TABS: ReadonlySet<CloudTab> = new Set(['overview', 'workspaces', 'accounts']);
const OVERLAP_SELECTOR = '.cvn-laag, [data-cvn-mapkiezer], [data-cvn-upload-scherm], .cvn-uploads.is-scherm, .drive-viewer-backdrop, .cloud-dialog-backdrop, [data-universeel-bestand-open], .universeel-bestand-venster:not([hidden])';

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

type HeldInhoud = {
  boven: [string, string];
  voor: [string, string];
  cursief: [string, string];
  beschrijving: [string, string];
};

const HELD_TEKST: Record<CloudTab, HeldInhoud> = {
  overview: {
    boven: ['ХМАРНЕ СХОВИЩЕ · ОГЛЯД', 'CLOUDOPSLAG · OVERZICHT'],
    voor: ['Ваші файли у', 'Uw bestanden in'],
    cursief: ['спокійному ладі', 'rustige orde'],
    beschrijving: [
      'Власне сховище без сторонніх посередників: живі обсяги за типами даних, обране, робочі простори та швидкий перехід до потрібної теки.',
      'Eigen opslag zonder externe tussenpersonen: actuele omvang per soort, favorieten, werkruimtes en directe toegang tot elke map.',
    ],
  },
  files: {
    boven: ['ХМАРНЕ СХОВИЩЕ · МОЇ ФАЙЛИ', 'CLOUDOPSLAG · MIJN BESTANDEN'],
    voor: ['Теки, документи та', 'Mappen, documenten en'],
    cursief: ['живі архіви', 'levende archieven'],
    beschrijving: [
      'Повноцінне робоче полотно: перетягування цілих дерев тек, черга передач із відновленням, версії файлів та захищені посилання.',
      'Volwaardig werkvlak: volledige mappenbomen slepen, hervatbare overdrachten, bestandsgeschiedenis en beschermde deellinks.',
    ],
  },
  shared: {
    boven: ['ХМАРНЕ СХОВИЩЕ · СПІЛЬНИЙ ДОСТУП', 'CLOUDOPSLAG · GEDEELD'],
    voor: ['Захищені посилання та', 'Beschermde koppelingen en'],
    cursief: ['спільні теки', 'gedeelde mappen'],
    beschrijving: [
      'Створюйте керовані посилання з терміном дії, паролем і лічильником переглядів та миттєво відкликайте доступ у будь-яку мить.',
      'Maak beheerde koppelingen met vervaldatum, wachtwoord en weergaveteller en trek toegang op elk moment direct in.',
    ],
  },
  workspaces: {
    boven: ['ХМАРНЕ СХОВИЩЕ · ПРОСТОРИ', 'CLOUDOPSLAG · WERKRUIMTES'],
    voor: ['Тематичні полиці для', 'Themaplanken voor'],
    cursief: ['спільного задуму', 'elk vraagstuk'],
    beschrijving: [
      'Збирайте документи, нотатки та матеріали за напрямами — проєкти, оселя, навчання чи документація — зі швидким переходом до відбору у файлах.',
      'Bundel documenten, notities en materiaal per onderwerp — projecten, woning, studie of documentatie — met directe filtering in uw bestanden.',
    ],
  },
  capture: {
    boven: ['ХМАРНЕ СХОВИЩЕ · ШВИДКИЙ ЗАПИС', 'CLOUDOPSLAG · SNEL OPSLAAN'],
    voor: ['Миттєво збережіть', 'Leg een gedachte'],
    cursief: ['думку чи файл', 'of bestand vast'],
    beschrijving: [
      'Додайте нотатку, перевірене посилання або невеликий файл одразу до робочого простору чи нерозкладеного входу.',
      'Bewaar een notitie, gecontroleerde koppeling of compact bestand rechtstreeks in een werkruimte of in de snelle invoer.',
    ],
  },
  inbox: {
    boven: ['ХМАРНЕ СХОВИЩЕ · ШВИДКИЙ ВХІД', 'CLOUDOPSLAG · SNELLE INVOER'],
    voor: ['Нерозкладені знахідки', 'Onverdeelde vangst'],
    cursief: ['чекають на місце', 'klaar voor ordening'],
    beschrijving: [
      'Спокійно розберіть збережені без теки й простору матеріали: перемістіть до потрібної полиці або позначте зірочкою.',
      'Orden op uw gemak materiaal zonder map of werkruimte: verplaats naar de juiste plek of markeer als favoriet.',
    ],
  },
  search: {
    boven: ['ХМАРНЕ СХОВИЩЕ · ПОШУК', 'CLOUDOPSLAG · ZOEKEN'],
    voor: ['Пошук за назвами та', 'Zoeken op naam en'],
    cursief: ['вмістом документів', 'herkende inhoud'],
    beschrijving: [
      'Шукає одночасно у власному сховищі та зовнішньому диску Google Drive за назвами, текстом і розпізнаними написами.',
      'Doorzoekt gelijktijdig uw eigen opslag en de gekoppelde Google Drive op bestandsnamen, tekst en herkende inhoud.',
    ],
  },
  recent: {
    boven: ['ХМАРНЕ СХОВИЩЕ · ОСТАННІ', 'CLOUDOPSLAG · RECENT'],
    voor: ['Нещодавно відкриті й', 'Onlangs geopende en'],
    cursief: ['оновлені файли', 'bijgewerkte bestanden'],
    beschrijving: [
      'Поверніться до останніх документів, зображень або архівів зі швидким відбором за типом файла.',
      'Keer snel terug naar uw laatste documenten, afbeeldingen of archieven met directe filtering op soort.',
    ],
  },
  calendar: {
    boven: ['ХМАРНИЙ ПРОСТІР · КАЛЕНДАР', 'CLOUDRUIMTE · AGENDA'],
    voor: ['Розклад зустрічей і', 'Planning van afspraken en'],
    cursief: ['спільний ритм дня', 'dagelijks ritme'],
    beschrijving: [
      'Перегляд подій підключеного календаря в єдиній студійній оболонці вашого хмарного простору.',
      'Overzicht van afspraken uit uw gekoppelde agenda binnen dezelfde rustige studio-omgeving.',
    ],
  },
  photos: {
    boven: ['ХМАРНИЙ ПРОСТІР · СВІТЛИНИ', 'CLOUDRUIMTE · FOTO’S'],
    voor: ['Галерея спогадів і', 'Galerij van beelden en'],
    cursief: ['візуальних добірок', 'visuele collecties'],
    beschrijving: [
      'Перегляд світлин і медіафайлів підключеного облікового запису без дублювання даних.',
      'Bekijk foto’s en mediabestanden uit uw gekoppelde account zonder dubbele opslag.',
    ],
  },
  accounts: {
    boven: ['ХМАРНЕ СХОВИЩЕ · З’ЄДНАННЯ', 'CLOUDOPSLAG · KOPPELINGEN'],
    voor: ['Узгоджені джерела під', 'Verbonden bronnen onder'],
    cursief: ['вашим наглядом', 'uw regie'],
    beschrijving: [
      'Керуйте підключеними хмарними службами та перевіряйте стан доступу й пошукового покажчика без прихованих обмінів даними.',
      'Beheer gekoppelde clouddiensten en controleer de toegangsstatus en zoekindex zonder verborgen gegevensuitwisseling.',
    ],
  },
  google: {
    boven: ['ЗОВНІШНЄ ДЖЕРЕЛО · GOOGLE DRIVE', 'EXTERNE BRON · GOOGLE DRIVE'],
    voor: ['Перегляд файлів із', 'Bestanden bekijken uit'],
    cursief: ['Google Drive', 'Google Drive'],
    beschrijving: [
      'Переглядайте теки й документи зовнішнього диска та передавайте потрібні файли до власного сховища у фоновому режимі.',
      'Blader door mappen en documenten op uw externe schijf en zet gewenste bestanden op de achtergrond over naar uw eigen opslag.',
    ],
  },
  onedrive: {
    boven: ['ЗОВНІШНЄ ДЖЕРЕЛО · ONEDRIVE', 'EXTERNE BRON · ONEDRIVE'],
    voor: ['Огляд з’єднання з', 'Overzicht van koppeling met'],
    cursief: ['OneDrive', 'OneDrive'],
    beschrijving: [
      'Перевірте готовність серверних ключів та умови з’єднання із зовнішнім сховищем Microsoft OneDrive.',
      'Controleer de beschikbaarheid van serversleutels en koppelingsvoorwaarden voor externe opslag bij Microsoft OneDrive.',
    ],
  },
  dropbox: {
    boven: ['ЗОВНІШНЄ ДЖЕРЕЛО · DROPBOX', 'EXTERNE BRON · DROPBOX'],
    voor: ['Огляд з’єднання з', 'Overzicht van koppeling met'],
    cursief: ['Dropbox', 'Dropbox'],
    beschrijving: [
      'Перевірте готовність серверних ключів та умови з’єднання із зовнішнім сховищем Dropbox.',
      'Controleer de beschikbaarheid van serversleutels en koppelingsvoorwaarden voor externe opslag bij Dropbox.',
    ],
  },
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
  const isMaquette = useIsMaquette();
  const huidig: CloudTab = (TABS as readonly string[]).includes(tab) ? (tab as CloudTab) : 'overview';
  // Tijdens de eerste render (vóór de effecten van de onderdelen), zodat «Мої файли» de overdracht bij binnenkomst al vindt.
  const diep = useRef<CloudTab | '' | null>(null);
  if (diep.current === null) diep.current = neemDiepeLink();
  const [ov, setOv] = useState<OverzichtUit | null>(null);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [overlaptOpen, setOverlaptOpen] = useState<boolean>(false);
  const toon = useCallback((t: string) => { setMelding(t); window.setTimeout(() => setMelding(''), 4500); }, []);
  const vernieuw = useCallback(async () => {
    try { setOv(await cloudClient.overzicht()); setFout(''); }
    catch (e) { const code = e instanceof CloudFout ? e.code : 'FOUT'; if (code !== 'NOG_NIET_GEBOUWD') setFout(foutTekst(lang, code)); }
  }, [lang]);
  useEffect(() => { void vernieuw(); }, [vernieuw]);
  const naarTab = useCallback((t: CloudTab) => onNavigateTab(t), [onNavigateTab]);
  useEffect(() => { const d = diep.current; diepWachtend = ''; if (d && d !== huidig) naarTab(d); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Приховуємо якірну рейку Макета, коли відкрито портальний шар .cvn-laag, діалог вибору теки або переглядач файлів.
  useEffect(() => {
    if (!isMaquette || typeof document === 'undefined') {
      setOverlaptOpen(false);
      return;
    }
    const controleerOverlap = () => {
      setOverlaptOpen(Boolean(document.querySelector(OVERLAP_SELECTOR)));
    };
    controleerOverlap();
    if (typeof MutationObserver !== 'function') return;
    const obs = new MutationObserver(controleerOverlap);
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'open', 'hidden', 'data-universeel-bestand-open'],
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-universeel-bestand-open'],
    });
    return () => obs.disconnect();
  }, [isMaquette, huidig]);

  const props: OnderdeelProps = useMemo(() => ({ lang, smal, userEmail, sourceOrigin, tabContext, ov, vernieuw, toon, naarTab }), [lang, smal, userEmail, sourceOrigin, tabContext, ov, vernieuw, toon, naarTab]);

  const ankerItems = useMemo<ReadonlyArray<MaquetteAnkerItem>>(() => {
    if (!isMaquette) return [];
    return TABS.filter((t) => !paginaVerborgen('cloud', t) || t === huidig).map((t) => {
      let badge: number | undefined;
      if (ov) {
        if (t === 'files') badge = ov.stats.aantal;
        else if (t === 'workspaces') badge = ov.workspaces.length;
        else if (t === 'recent' && ov.recent.length > 0) badge = ov.recent.length;
      }
      return {
        id: t,
        label: tr(lang, LABEL[t][0], LABEL[t][1]),
        badge,
      };
    });
  }, [isMaquette, huidig, lang, ov]);

  const heldStatistieken = useMemo<ReadonlyArray<MaquetteHeldStatistiek> | undefined>(() => {
    if (!isMaquette || !ov) return undefined;
    if (huidig === 'overview' || huidig === 'files') {
      return [
        { waarde: ov.stats.aantal, label: tr(lang, 'файлів', 'bestanden') },
        { waarde: bytesTekst(lang, ov.stats.bytes), label: tr(lang, 'зайнято', 'in gebruik') },
        { waarde: ov.favorieten.length, label: tr(lang, 'в обраному', 'favorieten') },
        { waarde: ov.workspaces.length, label: tr(lang, 'просторів', 'werkruimtes') },
      ];
    }
    if (huidig === 'workspaces') {
      return [
        { waarde: ov.workspaces.length, label: tr(lang, 'просторів', 'werkruimtes') },
        { waarde: ov.stats.aantal, label: tr(lang, 'файлів у сховищі', 'bestanden in opslag') },
      ];
    }
    if (huidig === 'recent') {
      return [
        { waarde: ov.recent.length, label: tr(lang, 'нещодавніх', 'recent') },
        { waarde: ov.favorieten.length, label: tr(lang, 'в обраному', 'favorieten') },
      ];
    }
    if (huidig === 'accounts') {
      return [
        { waarde: ov.stats.aantal, label: tr(lang, 'власних файлів', 'eigen bestanden') },
        { waarde: bytesTekst(lang, ov.stats.bytes), label: tr(lang, 'обсяг на сервері', 'serveromvang') },
      ];
    }
    if (huidig === 'shared' || huidig === 'capture' || huidig === 'inbox' || huidig === 'search') {
      return [
        { waarde: ov.stats.aantal, label: tr(lang, 'файлів', 'bestanden') },
        { waarde: bytesTekst(lang, ov.stats.bytes), label: tr(lang, 'зайнято', 'in gebruik') },
      ];
    }
    return undefined;
  }, [isMaquette, ov, huidig, lang]);

  const heldActies = useMemo(() => {
    if (!isMaquette) return { primair: undefined, secundair: undefined };
    const nieuweMapViaSessie = () => {
      sessieZet('cvn-nieuwe-map', '1');
      naarTab('files');
    };
    switch (huidig) {
      case 'overview':
        return {
          primair: { label: tr(lang, 'Завантажити файли', 'Bestanden uploaden'), icoon: '↑', onClick: () => naarTab('files') },
          secundair: { label: tr(lang, 'Нова тека', 'Nieuwe map'), onClick: nieuweMapViaSessie },
        };
      case 'files':
        return {
          primair: {
            label: tr(lang, 'Завантажити', 'Uploaden'),
            icoon: '↑',
            onClick: () => document.querySelector<HTMLButtonElement>('[data-cvn-upload="knop"]')?.click(),
          },
          secundair: {
            label: tr(lang, 'Нова тека', 'Nieuwe map'),
            onClick: () => document.querySelector<HTMLButtonElement>('[data-cvn-nieuwe-map]')?.click(),
          },
        };
      case 'workspaces':
        return {
          primair: {
            label: tr(lang, 'Створити простір', 'Werkruimte aanmaken'),
            icoon: '+',
            onClick: () => document.querySelector<HTMLButtonElement>('[data-cvn-ws-nieuw]')?.click(),
          },
          secundair: { label: tr(lang, 'Мої файли', 'Mijn bestanden'), onClick: () => naarTab('files') },
        };
      case 'accounts':
        return {
          primair: { label: tr(lang, 'Мої файли', 'Mijn bestanden'), icoon: '↗', onClick: () => naarTab('files') },
          secundair: { label: tr(lang, 'Пошук у хмарі', 'Zoeken in cloud'), onClick: () => naarTab('search') },
        };
      case 'shared':
        return {
          primair: { label: tr(lang, 'Поділитися з файлів', 'Delen vanuit bestanden'), icoon: '↗', onClick: () => naarTab('files') },
          secundair: { label: tr(lang, 'Огляд сховища', 'Opslagoverzicht'), onClick: () => naarTab('overview') },
        };
      case 'capture':
        return {
          primair: undefined,
          secundair: { label: tr(lang, 'Швидкий вхід', 'Snelle invoer'), onClick: () => naarTab('inbox') },
        };
      case 'inbox':
        return {
          primair: { label: tr(lang, 'Швидко зберегти', 'Snel opslaan'), icoon: '+', onClick: () => naarTab('capture') },
          secundair: { label: tr(lang, 'Мої файли', 'Mijn bestanden'), onClick: () => naarTab('files') },
        };
      case 'search':
      case 'recent':
        return {
          primair: undefined,
          secundair: { label: tr(lang, 'Мої файли', 'Mijn bestanden'), onClick: () => naarTab('files') },
        };
      default:
        return {
          primair: undefined,
          secundair: { label: tr(lang, 'З’єднання', 'Koppelingen'), onClick: () => naarTab('accounts') },
        };
    }
  }, [isMaquette, huidig, lang, naarTab]);

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
  const heldTekst = HELD_TEKST[huidig];
  const heldModus = VOLLEDIG_HELD_TABS.has(huidig) ? 'volledig' : 'compact';

  return (
    <section
      className={`cvn${smal ? ' is-smal' : ''}${isMaquette ? ' mq-schil' : ''}`}
      data-cvn-pagina={huidig}
      data-mq-dienst={isMaquette ? 'cloud' : undefined}
      aria-labelledby='cvn-kop'
    >
      {isMaquette ? (
        <>
          <MaquetteHeld
            key={`cloud-held-${huidig}`}
            id='cvn-kop'
            dienst='cloud'
            lang={lang}
            modus={heldModus}
            opslagSleutel={`cloud-${huidig}`}
            bovenregel={tr(lang, heldTekst.boven[0], heldTekst.boven[1])}
            titelVoor={tr(lang, heldTekst.voor[0], heldTekst.voor[1])}
            titelCursief={tr(lang, heldTekst.cursief[0], heldTekst.cursief[1])}
            beschrijving={tr(lang, heldTekst.beschrijving[0], heldTekst.beschrijving[1])}
            primair={heldActies.primair}
            secundair={heldActies.secundair}
            statistieken={heldStatistieken}
          />
          {!overlaptOpen && !smal ? (
            <MaquetteAnkerRail
              lang={lang}
              titel={tr(lang, 'Розділи хмари', 'Cloudonderdelen')}
              ondertitel={tr(lang, 'Перетягніть до краю', 'Sleep naar een rand')}
              items={ankerItems}
              actief={huidig}
              onKies={(id) => {
                naarTab(id as CloudTab);
                document.querySelector('.canonical-workspace')?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              opslagSleutel='cloud-vnext'
            />
          ) : null}
        </>
      ) : (
        <header className='cvn-kop'>
          <h2 id='cvn-kop'><Titel aria-hidden='true' />{tr(lang, LABEL[huidig][0], LABEL[huidig][1])}</h2>
        </header>
      )}
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
