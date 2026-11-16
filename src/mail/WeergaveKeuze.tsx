// «Вигляд» van de open brief (pakket 2 «Adaptive Mail Canvas», 24.10.2026): dichtheid binnen de brief (compact · normaal · ruim) en
// tekstgrootte (90–130 %), per apparaat bewaard door het kader (src/mail/LeesVenster.tsx → weergave). Макет: «Вигляд (щільність і
// розмір)»; «щільність не залежить від режиму вікна». Twee vormen: een knop met paneel in de kop, en een blok in ⋮ op de telefoon
// (daar is geen plaats in de kop — макет: «Аркуш «Ще» … Вигляд: Щільність, Мова листа, Зовнішні зображення»). Externe beelden: «Питати»
// (standaard; de brief toont een strook «N … приховано · Показати один раз») of «Завжди показувати» (via de eigen server, zoals vroeger).
// Pakket 3: «Мова листа» — «Оригінал» (standaard) of «Перекладати» (een brief in een andere taal wordt bij het openen vertaald door de
// privé-AI-agent; dat de tekst dan naar die agent gaat, staat eronder — zonder agent blijft alles in het origineel).
// MAILBEELD-002 (16.11.2026): het paneel was een muur van ±900 px. Nu vier inklapbare zones (<details>) met pictogram, titel en de
// HUIDIGE waarde in de kop («Зображення · При отриманні», «Читання · Звичайно · 100 %», …): één zone tegelijk open, de laatst
// geopende onthouden per apparaat. Uk: панель «Вигляд» — чотири згортані зони з поточним значенням у заголовку.
// Afwerking (zelfde dag, na de jury): de waarde staat alleen in de kop van een DICHTE zone (open zegt de inhoud het zelf); de regel
// «Збережено …» staat er altijd (geen sprong in hoogte); de tegels zijn even breed, met een klein merk onder de naam («типово» ·
// «приватно» · «! ризик») en een vinkje op de gekozen tegel; «Докладніше» klapt een korte legenda uit voor aanraakschermen (daar is
// geen knopinfo). De zones en «Докладніше» zijn <details> ín de brief: de werkbalk en het kader tellen ze niet als open menu
// (src/MailLezerWerkbalk.tsx, src/mail/LeesVenster.tsx → ANDERE_LAGEN).
// Afwerking 1: knopinfo alleen voor muis en toetsenbord en alleen náást het paneel (links van de rij tegels) — nooit meer óver de zin
// «wat gebeurt er nu»; op een aanraakscherm geen knopinfo (een tik gaf focus en liet de knopinfo over het blok liggen): daar geeft
// «Докладніше» de uitleg. Uk: підказки плиток — лише для миші й клавіатури, збоку від панелі; на дотику їх немає.
// Afwerking 2: staat er een wachtrij, dan valt het woord «зображень» uit de regel van de voorraad («Збережено 214 (37 МБ)» + «У черзі: 3»
// op één regel — het blok groeit niet meer zodra de server een wachtrij meldt); «Докладніше» schuift in het blad «Ще» de legenda en de
// regel van de voorraad in beeld (niet de kop van de zone); in een smal venster met muis staat de knopinfo van de wisknop en van
// «У черзі» ónder het anker, niet meer over de zin «wat gebeurt er nu».
import { ALargeSmall, Check, ChevronDown, CloudOff, Database, Eye, EyeOff, Hourglass, Image, ImageOff, Languages, ShieldCheck, SlidersHorizontal, Trash2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { TEKST_STAPPEN, type LezerBeelden, type LezerDichtheid, type LezerTaal } from './lees-modus';
import { useLeesVenster } from './LeesVenster';
import { useLaatsteAiStaat, zetAiBalkTonen } from './ai-staat';
import AiUitleg from './AiUitleg';
import { StrookRegelsLijst } from './StrookNazorg';
import { formaatGrootte, useVoorraad, wisVoorraad, zetBijOntvangst } from './beelden-voorraad';
import './beelden-voorraad.css';
import { alleRegels, useActiefBereik, useStrookRegels } from './strook-regels';
import { WEERGAVE_ZONE_SLEUTEL } from '../lokale-sporen';

/**
 * MAILAI-001: «ШІ-аналіз над листом» — панель «ШІ-аналіз і переклад» над кожним листом. Типово вимкнено; налаштування облікового
 * запису (не пристрою), тому однакове на телефоні й ПК. Навіть увімкнена, панель з'являється лише за робочого ШІ (є ключ API).
 * Paneel boven de brief: standaard uit, per account; ook aan alleen zichtbaar met een werkende AI.
 */
function AiBalkKeuze({ lang }: { lang: 'uk' | 'nl' }) {
  const ai = useLaatsteAiStaat(), id = useId();
  const [fout, setFout] = useState(false);
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const aan = ai?.instellingen.balkTonen === true;
  const geenAgent = Boolean(ai?.geladen && !ai.agent);
  const zet = (v: boolean) => { setFout(false); void zetAiBalkTonen(v).catch(() => setFout(true)); };
  return (
    <fieldset data-weergave-ai-balk>
      <legend>{t('ШІ-аналіз над листом', 'AI-analyse boven het bericht')}</legend>
      <span className='lz-segment'>
        <label title={t('Панелі над листами немає. Переклад у смузі над листом лишається, якщо є робочий ШІ.', 'Geen paneel boven berichten. Vertalen in de strook boven het bericht blijft, als er een werkende AI is.')}>
          <input type='radio' name={`${id}-ai`} checked={!aan} onChange={() => zet(false)} />
          <span>{t('Вимкнено', 'Uit')}</span>
        </label>
        <label title={t('Над кожним листом — кнопки перекладу, підсумку, пояснення документа й контексту. Текст листа надсилається вашому ШІ лише після натискання.', 'Boven elk bericht knoppen voor vertalen, samenvatten, uitleg en context. De tekst gaat pas naar uw AI als u klikt.')}>
          <input type='radio' name={`${id}-ai`} checked={aan} onChange={() => zet(true)} />
          <span>{t('Увімкнено', 'Aan')}</span>
        </label>
      </span>
      <small className='lz-weergave-noot'>
        {fout
          ? t('Не вдалося зберегти. Спробуйте ще раз.', 'Opslaan is niet gelukt. Probeer het opnieuw.')
          : aan
            ? geenAgent
              ? t('Увімкнено, але робочого ШІ немає (немає ключа API), тому панель не показується. Як підключити — нижче.', 'Aan, maar er is geen werkende AI (geen API-sleutel), dus het paneel blijft weg. Hoe koppelen staat hieronder.')
              : t('Панель над листом показується. Сховати можна й хрестиком на самій панелі.', 'Het paneel staat boven het bericht. Verbergen kan ook met het kruisje op het paneel zelf.')
            : t('Панель прихована й не займає місця. Діє для вашого облікового запису на всіх пристроях.', 'Het paneel is verborgen en neemt geen ruimte in. Geldt voor uw account op elk apparaat.')}
      </small>
      {(geenAgent || !aan) && (
        <details className='lz-ai-uitleg'>
          <summary>{t('Як це працює і що підключити', 'Hoe het werkt en wat te koppelen')}</summary>
          <AiUitleg nl={lang === 'nl'} compact />
        </details>
      )}
    </fieldset>
  );
}

/** «Питати»: verborgen tot «Показати» (geen verzoek naar buiten, ook niet via de server — een pixel verraadt anders het openen).
 *  MAILBEELD-001: «При отриманні (приватно)» — de server haalt de beelden van nieuwe brieven op bij aankomst en bewaart ze versleuteld;
 *  die keuze staat op de server (alle apparaten), de andere twee op dit apparaat. De drie sluiten elkaar uit; wisselen kan altijd.
 *  MAILBEELD-002: per stand een pictogram, een korte naam voor de tegel (`kort…`), een merk van één woord onder de naam (`merk…`:
 *  «типово» · «приватно» · «ризик»), één zin «wat gebeurt er nu» (`nu…` — kort: elk van de drie past ook op een scherm van
 *  320 px in twee regels, anders hield de langste een lege derde regel vrij onder de andere twee; een vaste spatie vóór het
 *  streepje, zodat een regel nooit met «—» begint), het gevolg in één korte regel voor de legenda
 *  «Докладніше» (`kern…`, met `overal`: geldt de stand op alle apparaten of alleen hier) en de volledige uitleg als knopinfo
 *  (`tip…`). «Завжди» is de riskante stand: «!» in het merk van de tegel en een waarschuwend pictogram bij de zin. */
type BeeldKeuze = LezerBeelden | 'ontvangst';
const BEELDEN: Array<{ id: BeeldKeuze; icoon: LucideIcon; uk: string; nl: string; kortUk: string; kortNl: string; merkUk: string; merkNl: string; nuUk: string; nuNl: string; kernUk: string; kernNl: string; overal: boolean; tipUk: string; tipNl: string }> = [
  { id: 'vragen', icoon: ImageOff, uk: 'Питати', nl: 'Vragen', kortUk: 'Питати', kortNl: 'Vragen', merkUk: 'типово', merkNl: 'standaard',
    nuUk: 'Приховані, доки не покажете\u00a0— відправник нічого не бачить.',
    nuNl: 'Verborgen tot u «Tonen» kiest\u00a0— tot dan ziet de afzender niets.',
    kernUk: 'Приховані, доки самі не покажете', kernNl: 'Verborgen tot u ze zelf toont', overal: false,
    tipUk: 'Зображення приховані, доки не натиснете «Показати»: нічого не завантажується, тож відправник не дізнається, що лист відкрито. Типово. Лише на цьому пристрої.',
    tipNl: 'Afbeeldingen blijven verborgen tot u «Tonen» kiest: er wordt niets geladen, dus de afzender weet niet dat het bericht geopend is. Standaard. Alleen op dit apparaat.' },
  { id: 'ontvangst', icoon: ShieldCheck, uk: 'При отриманні (приватно)', nl: 'Bij ontvangst (privé)', kortUk: 'При отриманні', kortNl: 'Bij ontvangst', merkUk: 'приватно', merkNl: 'privé',
    nuUk: 'Сервер зберігає їх наперед\u00a0— відправник не бачить відкриття.',
    nuNl: 'De server bewaart ze vooraf\u00a0— de afzender ziet niet wanneer u leest.',
    kernUk: 'Сервер зберігає наперед — відправник не бачить, коли ви читаєте', kernNl: 'De server bewaart ze vooraf — de afzender ziet niet wanneer u leest', overal: true,
    tipUk: 'Сервер завантажує зображення нових листів при надходженні (крім Спаму) і зберігає зашифрованими. Відправник не бачить, чи й коли ви читаєте, ані вашої IP-адреси — лише що лист доставлено. Старі листи питають, як раніше. На всіх пристроях.',
    tipNl: 'De server laadt afbeeldingen van nieuwe berichten bij aankomst (behalve Spam) en bewaart ze versleuteld. De afzender ziet niet óf en wanneer u leest, en ook uw IP-adres niet — alleen dat het is afgeleverd. Oude berichten vragen zoals voorheen. Op elk apparaat.' },
  { id: 'altijd', icoon: Eye, uk: 'Завжди показувати', nl: 'Altijd tonen', kortUk: 'Завжди', kortNl: 'Altijd', merkUk: 'ризик', merkNl: 'risico',
    nuUk: 'Завантажуються під час відкриття\u00a0— відправник це бачить.',
    nuNl: 'Geladen bij het openen\u00a0— de afzender ziet wanneer u leest.',
    kernUk: 'Відправник бачить, коли ви читаєте', kernNl: 'De afzender ziet wanneer u leest', overal: false,
    tipUk: '! Зображення завантажуються, щойно ви відкриваєте лист (через ваш сервер): відправник може дізнатися, що й коли ви його прочитали. Лише на цьому пристрої.',
    tipNl: '! Afbeeldingen worden geladen zodra u het bericht opent (via uw server): de afzender kan zien dat en wanneer u het las. Alleen op dit apparaat.' },
];
const TALEN: Array<{ id: LezerTaal; uk: string; nl: string }> = [
  { id: 'origineel', uk: 'Оригінал', nl: 'Origineel' },
  { id: 'vertaling', uk: 'Перекладати', nl: 'Vertalen' },
];
const DICHTHEDEN: Array<{ id: LezerDichtheid; uk: string; nl: string }> = [
  { id: 'compact', uk: 'Компактно', nl: 'Compact' },
  { id: 'normaal', uk: 'Звичайно', nl: 'Normaal' },
  { id: 'ruim', uk: 'Просторо', nl: 'Ruim' },
];

/** Aanraakscherm (de eerste aanwijzer is grof)? Daar geeft een tik focus, en focus toont in de knopinfo-laag van de site
 *  (src/ViewportKnopinfoLaag.tsx) een knopinfo die blijft liggen tot de focus weggaat — óver de zin «wat gebeurt er nu», «Докладніше»
 *  en de regel van de voorraad. Daarom daar geen knopinfo op de tegels, het merk van de wachtrij en de wisknop: de uitleg staat in
 *  «Докладніше» en in de aria-labels. Volgt een wissel (tablet met muis erbij). Uk: на сенсорному екрані підказок немає. */
function useAanraak(): boolean {
  const [grof, setGrof] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(pointer: coarse)'), volg = () => setGrof(mq.matches);
    volg();
    // oudere Safari kent addEventListener op een MediaQueryList niet: dan volgt de stand een wissel niet, maar er breekt niets
    mq.addEventListener?.('change', volg);
    return () => mq.removeEventListener?.('change', volg);
  }, []);
  return grof;
}

/** Zoveel ruimte vraagt de knopinfo-laag links van de rij tegels: 300 px (grootste breedte van een knopinfo) + 9 px afstand + 8 px
 *  rand van het venster. Is er minder (smal venster met muis: het blad «Ще»), dan krijgt de rij geen knopinfo — de laag zou hem
 *  anders onder de tegels leggen, over de zin «wat gebeurt er nu». */
const TIP_RUIMTE_LINKS = 317;

/** De zones van het paneel. Eén tegelijk open; de laatst geopende staat per apparaat in localStorage (alleen de naam van de zone —
 *  geen spoor van een account; de sleutel komt uit src/lokale-sporen.ts, zodat «overal afmelden» hem meeneemt). */
type Zone = 'beelden' | 'lezen' | 'taal' | 'stroken';
const ZONES: readonly Zone[] = ['beelden', 'lezen', 'taal', 'stroken'];
const leesZone = (): Zone => {
  try { const v = localStorage.getItem(WEERGAVE_ZONE_SLEUTEL) as Zone | null; return v && ZONES.includes(v) ? v : 'beelden'; } catch { return 'beelden'; }
};
const bewaarZone = (z: Zone) => { try { localStorage.setItem(WEERGAVE_ZONE_SLEUTEL, z); } catch { /* privévenster: alleen voor deze sessie */ } };

/**
 * Blad «Ще» op de telefoon (of een ander schuivend vak om de zones): na het openen van een zone of het wisselen van stand de open
 * zone én de voetnoot helemaal in beeld schuiven — anders sneed de rand van het blad de voetnoot af. De kop van de zone gaat voor
 * als niet alles past. `ookOmhoog`: na het openen van een zone mag het ook omhoog (de zone erboven klapte dicht); na een keuze
 * bínnen de zone nooit (de tegels springen dan niet onder de vinger weg). Geen schuivend vak (het paneel op de pc) → niets.
 * `meer`: «Докладніше» ging open of dicht — dan telt wat net uitklapte: de legenda en de regel van de voorraad eronder komen in
 * beeld (tot de onderkant van de open zone; «Докладніше» zelf gaat voor als niet alles past). Niet de voetnoot en niet de kop van
 * de zone: met de kop vast bovenaan bleef de voetnoot onder de rand van het blad hangen, half afgesneden.
 * Rustig schuiven, of meteen bij prefers-reduced-motion.
 */
function schuifInBeeld(wortel: HTMLElement | null, ookOmhoog: boolean, meer = false) {
  if (!wortel) return;
  let houder: HTMLElement | null = wortel.parentElement;
  while (houder && !(houder.scrollHeight > houder.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(houder).overflowY))) houder = houder.parentElement;
  if (!houder) return;
  const zone = wortel.querySelector<HTMLElement>(':scope > details.lz-zone[open]'), voet = wortel.querySelector<HTMLElement>(':scope > small');
  const vak = houder.getBoundingClientRect(), marge = 10;
  const uitleg = meer ? zone?.querySelector<HTMLElement>('details.lz-beelden-meer') : null;
  const onder = ((uitleg ? zone : voet) ?? zone ?? wortel).getBoundingClientRect().bottom, boven = (uitleg ?? zone ?? wortel).getBoundingClientRect().top;
  let d = Math.max(0, onder - (vak.bottom - marge));
  if (boven - d < vak.top + marge) d = ookOmhoog || d > 0 ? Math.min(d, boven - (vak.top + marge)) : 0;
  if (!ookOmhoog && d < 0) d = 0;
  if (Math.abs(d) < 2) return;
  houder.scrollBy({ top: d, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/** Eén inklapbare zone: pictogram, titel, de huidige waarde (alleen zichtbaar als de zone dicht is — open zegt de inhoud het zelf;
 *  dat regelt de CSS, zo blijft de waarde voor het dichte paneel in de opmaak) en de inhoud. */
function ZoneBlok({ id, open, zetOpen, icoon: Icoon, titel, waarde, letOp = false, children }: { id: Zone; open: Zone | ''; zetOpen: (z: Zone, aan: boolean) => void; icoon: LucideIcon; titel: string; waarde: string; letOp?: boolean; children: ReactNode }) {
  return (
    // onToggle borrelt niet (ook niet uit een <details> in de inhoud); de controle op het doel is een extra slot op de deur
    <details className='lz-zone' data-zone={id} open={open === id} onToggle={(e) => { if (e.target === e.currentTarget) zetOpen(id, e.currentTarget.open); }}>
      <summary>
        <span className='lz-zone-icoon' aria-hidden='true'><Icoon /></span>
        <span className='lz-zone-titel'>{titel}</span>
        <span className='lz-zone-waarde' data-let={letOp ? '' : undefined}>{letOp && <i aria-hidden='true'>!</i>}<span>{waarde}</span></span>
        <ChevronDown className='lz-zone-pijl' aria-hidden='true' />
      </summary>
      <div className='lz-zone-inhoud'>{children}</div>
    </details>
  );
}

function Keuzes({ lang }: { lang: 'uk' | 'nl' }) {
  const lv = useLeesVenster(), id = useId();
  const ai = useLaatsteAiStaat();
  const vr = useVoorraad();
  const aantalRegels = alleRegels(useStrookRegels(useActiefBereik())).length;
  const [open, setOpen] = useState<Zone | ''>(leesZone);
  const wortel = useRef<HTMLDivElement | null>(null), gemonteerd = useRef(false);
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const beeldId: BeeldKeuze = vr.bijOntvangst ? 'ontvangst' : lv?.weergave.beelden ?? 'vragen';
  // blad «Ще»: zone geopend → zone en voetnoot in beeld (mag omhoog); stand gewisseld → alleen omlaag. Niet bij het eerste tekenen.
  useEffect(() => { if (gemonteerd.current) schuifInBeeld(wortel.current, true); }, [open]);
  // de regel van de voorraad groeit pas ná het antwoord van de server (iets bewaard, wachtrij, server weg): dan opnieuw passend maken
  useEffect(() => { if (gemonteerd.current) schuifInBeeld(wortel.current, false); }, [vr.geladen, vr.aantal, vr.wachtrij, vr.fout]);
  useEffect(() => { if (gemonteerd.current) schuifInBeeld(wortel.current, false); gemonteerd.current = true; }, [beeldId]);
  if (!lv) return null;
  const w = lv.weergave;
  const geenAgent = Boolean(ai?.geladen && !ai.agent);
  // alleen een echte wissel bewaren: het <details> meldt ook bij het eerste tekenen «open» — dat is geen keuze van de gebruiker
  const zetOpen = (z: Zone, aan: boolean) => { if (aan && open !== z) bewaarZone(z); setOpen((nu) => (aan ? z : nu === z ? '' : nu)); };
  const beeld = BEELDEN.find((b) => b.id === beeldId) ?? BEELDEN[0];
  const dichtheid = DICHTHEDEN.find((d) => d.id === w.dichtheid) ?? DICHTHEDEN[1];
  // de zone «Мова й ШІ» zegt ook of de ШІ-панель aan staat (ook «вимк.» — juist dan zoekt men de schakelaar); vóór het laden niets
  const aiDeel = ai ? (ai.instellingen.balkTonen === true ? t('ШІ\u00a0увімк.', 'AI\u00a0aan') : t('ШІ\u00a0вимк.', 'AI\u00a0uit')) : '';
  const zone = { open, zetOpen };
  return (
    <div className='lz-weergave-keuzes lz-zones' ref={wortel}>
      <ZoneBlok id='beelden' {...zone} icoon={Image} titel={t('Зображення', 'Afbeeldingen')} waarde={t(beeld.kortUk, beeld.kortNl)} letOp={beeld.id === 'altijd'}>
        <BeeldenKeuze lang={lang} naam={`${id}-b`} lokaal={w.beelden} zetLokaal={(b) => lv.zetWeergave({ beelden: b })} opMaat={() => requestAnimationFrame(() => schuifInBeeld(wortel.current, false, true))} />
      </ZoneBlok>
      <ZoneBlok id='lezen' {...zone} icoon={ALargeSmall} titel={t('Читання', 'Lezen')} waarde={`${t(dichtheid.uk, dichtheid.nl)} · ${Math.round(w.tekst * 100)} %`}>
        <fieldset>
          <legend>{t('Щільність листа', 'Dichtheid van het bericht')}</legend>
          <span className='lz-segment'>
            {DICHTHEDEN.map((d) => (
              <label key={d.id}>
                <input type='radio' name={`${id}-d`} checked={w.dichtheid === d.id} onChange={() => lv.zetWeergave({ dichtheid: d.id })} />
                <span>{t(d.uk, d.nl)}</span>
              </label>
            ))}
          </span>
        </fieldset>
        <fieldset>
          <legend>{t('Розмір тексту', 'Tekstgrootte')}</legend>
          <span className='lz-segment'>
            {TEKST_STAPPEN.map((k) => (
              <label key={k}>
                <input type='radio' name={`${id}-t`} checked={w.tekst === k} onChange={() => lv.zetWeergave({ tekst: k })} />
                <span>{Math.round(k * 100)} %</span>
              </label>
            ))}
          </span>
        </fieldset>
      </ZoneBlok>
      <ZoneBlok id='taal' {...zone} icoon={Languages} titel={t('Мова й ШІ', 'Taal en AI')}
        waarde={`${w.taal === 'vertaling' ? t('Переклад', 'Vertaling') : t('Оригінал', 'Origineel')}${aiDeel ? ` · ${aiDeel}` : ''}`}>
        <fieldset data-weergave-taal>
          <legend>{t('Мова листа', 'Taal van het bericht')}</legend>
          <span className='lz-segment'>
            {TALEN.map((x) => (
              <label key={x.id}>
                <input type='radio' name={`${id}-l`} checked={w.taal === x.id} onChange={() => lv.zetWeergave({ taal: x.id })} />
                <span>{t(x.uk, x.nl)}</span>
              </label>
            ))}
          </span>
          <small className='lz-weergave-noot'>
            {w.taal === 'vertaling'
              ? geenAgent
                ? t('ШІ-агента не підключено («Доступ ШІ») — листи показуються в оригіналі й нікуди не надсилаються.', 'Er is geen AI-agent gekoppeld («AI-toegang») — berichten staan in het origineel en gaan nergens heen.')
                : t(`Лист іншою мовою перекладається під час відкриття: текст надсилається вашому ШІ-агенту${ai?.agent ? ` «${ai.agent.name}»` : ''}. Оригінал — у смузі перекладу.`, `Een bericht in een andere taal wordt bij het openen vertaald: de tekst gaat naar uw AI-agent${ai?.agent ? ` «${ai.agent.name}»` : ''}. Het origineel staat in de vertaalstrook.`)
              : t('Лист показується як прийшов; переклад — лише коли ви оберете його в листі.', 'Het bericht staat er zoals het kwam; vertalen alleen als u dat in het bericht kiest.')}
          </small>
        </fieldset>
        <AiBalkKeuze lang={lang} />
      </ZoneBlok>
      {/* STROOK-002: regels «смугу не показувати» (taal, afzender, alle berichten), elk met ✕ */}
      <ZoneBlok id='stroken' {...zone} icoon={EyeOff} titel={t('Сховані смуги', 'Verborgen stroken')} waarde={aantalRegels ? String(aantalRegels) : t('немає', 'geen')}>
        <StrookRegelsLijst lang={lang} />
      </ZoneBlok>
      <small>{t('Налаштування цього пристрою. «При отриманні» та «ШІ-аналіз» діють для облікового запису.', 'Instellingen van dit apparaat. «Bij ontvangst» en «AI-analyse» gelden voor uw account.')}</small>
    </div>
  );
}

/** Het woord bij «N зображень» / «N afbeeldingen» (uk: 1 зображення · 2–4 зображення · 5+ зображень). In de regel van de voorraad
 *  staat het in een eigen <span> (met een vaste spatie ervoor, zodat het getal bij zijn woord blijft): op het smalste scherm
 *  (≤ 359 px) en naast het merk van de wachtrij (`data-rij`) valt het weg — «Збережено 214 (37 МБ)» — en blijft de regel één
 *  regel hoog. */
const woordBeelden = (lang: 'uk' | 'nl', n: number): string => {
  if (lang === 'nl') return n === 1 ? 'afbeelding' : 'afbeeldingen';
  const e = n % 10, h = n % 100;
  return e >= 1 && e <= 4 && !(h >= 11 && h <= 14) ? 'зображення' : 'зображень';
};

/** «Зовнішні зображення»: drie even brede tegels, op elk moment te wisselen (MAILBEELD-001). Eronder één zin: wat er nu gebeurt;
 *  «Докладніше» (dicht) met de drie standen in één regel elk; en altijd de regel van de voorraad — hoeveel er bewaard is (of «Ще
 *  нічого не збережено»), de wachtrij als kort merk, en een compacte wisknop als er iets te wissen is. Antwoordt de server niet, dan
 *  staat dát in die regel en is de tegel «При отриманні» uit (gestippelde rand). */
function BeeldenKeuze({ lang, naam, lokaal, zetLokaal, opMaat }: { lang: 'uk' | 'nl'; naam: string; lokaal: LezerBeelden; zetLokaal: (b: LezerBeelden) => void; opMaat?: () => void }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const vr = useVoorraad();
  const [bezig, setBezig] = useState(false);
  const blok = useRef<HTMLFieldSetElement | null>(null), rij = useRef<HTMLSpanElement | null>(null);
  const aanraak = useAanraak();
  const huidig: BeeldKeuze = vr.bijOntvangst ? 'ontvangst' : lokaal;
  const kies = (b: BeeldKeuze) => {
    // «При отриманні» staat op de server; lokaal hoort daar «Питати» bij. Bewaart de server de keuze niet, dan terug naar wat er stond
    // (anders werd «Завжди» stil «Питати», terwijl de melding zegt dat de vorige stand blijft).
    if (b === 'ontvangst') { const vorig = lokaal; zetLokaal('vragen'); void zetBijOntvangst(lang, true).then((ok) => { if (!ok) zetLokaal(vorig); }); return; }
    zetLokaal(b);
    if (vr.bijOntvangst) void zetBijOntvangst(lang, false);
  };
  // de knop blijft tijdens het wissen focusbaar (aria-disabled, niet disabled); verdwijnt hij daarna (niets meer bewaard), dan gaat
  // de focus naar de gekozen stand in plaats van naar <body>
  const wis = (knop: HTMLButtonElement) => {
    if (bezig) return;
    setBezig(true);
    void wisVoorraad(lang).finally(() => {
      setBezig(false);
      requestAnimationFrame(() => { if (!knop.isConnected && (!document.activeElement || document.activeElement === document.body)) blok.current?.querySelector<HTMLInputElement>('input:checked')?.focus(); });
    });
  };
  const nu = BEELDEN.find((b) => b.id === huidig) ?? BEELDEN[0];
  const serverWeg = vr.fout && !vr.bijOntvangst;
  const NuIcoon = huidig === 'altijd' ? TriangleAlert : nu.icoon;
  // Knopinfo van de tegels: één anker — de hele rij — met `data-tooltip-placement='left'`: de knopinfo staat links náást het paneel,
  // nooit over de tegels ernaast of de zin eronder (per tegel zou «links» de buurtegels bedekken). De tekst is die van de tegel onder
  // de aanwijzer of met de focus; de luisteraar hangt aan window in de vangfase, dus de tekst staat er vóór de laag (document) hem
  // leest. Tussen twee renders beheert deze luisteraar het attribuut; React zet het alleen terug als de gekozen stand, de taal of
  // het soort aanwijzer wisselt. Een tegel die uit staat (server weg) zegt waaróm. Geen plaats links → geen knopinfo.
  const tipVan = (k: string | undefined): string => {
    const b = BEELDEN.find((x) => x.id === k);
    if (!b) return '';
    return b.id === 'ontvangst' && serverWeg
      ? t('Зараз недоступно: сервер не відповів, тож увімкнути «При отриманні» не можна. Поточний режим не змінено — спробуйте пізніше.', 'Nu niet beschikbaar: de server antwoordde niet, dus «Bij ontvangst» kan niet aan. De huidige stand blijft — probeer het later opnieuw.')
      : t(b.tipUk, b.tipNl);
  };
  const tipRef = useRef(tipVan);
  tipRef.current = tipVan;
  useEffect(() => {
    const r = rij.current;
    if (!r || aanraak) return;
    const zet = (e: Event) => {
      if ((e as PointerEvent).pointerType === 'touch' || !(e.target instanceof Element) || !r.contains(e.target)) return;
      const tip = tipRef.current(e.target.closest<HTMLElement>('label[data-keuze]')?.dataset.keuze);
      if (r.getBoundingClientRect().left < TIP_RUIMTE_LINKS) r.removeAttribute('data-tooltip');
      else if (tip) r.setAttribute('data-tooltip', tip);
    };
    // Smal venster met muis (het blad «Ще»): de knopinfo-laag zet een knopinfo in de onderste helft van het scherm bóven zijn anker —
    // die van de wisknop en van «У черзі» lag dan over de zin «wat gebeurt er nu». Daar dus ónder het anker (over de voetnoot: die
    // zegt niets over de stand). Waar links plaats is (het paneel op de pc) blijft de gewone plaats.
    const onder = (e: Event) => {
      if ((e as PointerEvent).pointerType === 'touch' || !(e.target instanceof Element)) return;
      const anker = e.target.closest<HTMLElement>('.lz-beelden-wis, .lz-beelden-rij');
      if (!anker || !blok.current?.contains(anker)) return;
      if (r.getBoundingClientRect().left < TIP_RUIMTE_LINKS) anker.setAttribute('data-tooltip-placement', 'below'); else anker.removeAttribute('data-tooltip-placement');
    };
    window.addEventListener('pointerover', zet, true);
    window.addEventListener('focusin', zet, true);
    window.addEventListener('pointerover', onder, true);
    window.addEventListener('focusin', onder, true);
    return () => { window.removeEventListener('pointerover', zet, true); window.removeEventListener('focusin', zet, true); window.removeEventListener('pointerover', onder, true); window.removeEventListener('focusin', onder, true); };
  }, [aanraak]);
  const tip = (tekst: string) => (aanraak ? undefined : tekst);
  return (
    <fieldset ref={blok} className='lz-beelden' data-weergave-beelden={huidig}>
      <legend>{t('Зовнішні зображення', 'Externe afbeeldingen')}</legend>
      <span className='lz-beelden-keuze' ref={rij} data-tooltip={tip(tipVan(huidig))} data-tooltip-placement='left'>
        {BEELDEN.map((b) => (
          <label key={b.id} data-keuze={b.id}>
            <input type='radio' name={naam} value={b.id} checked={huidig === b.id} disabled={b.id === 'ontvangst' && serverWeg} onChange={() => kies(b.id)}
              aria-label={b.id === 'altijd' ? t(`${b.uk} — ризик: відправник бачить відкриття`, `${b.nl} — risico: de afzender ziet het openen`) : t(b.uk, b.nl)} />
            <span>
              <b.icoon aria-hidden='true' />
              <span className='lz-beelden-naam'>{t(b.kortUk, b.kortNl)}</span>
              <span className='lz-beelden-merk'>{b.id === 'altijd' && <i className='lz-beelden-let' aria-hidden='true'>!</i>}{t(b.merkUk, b.merkNl)}</span>
              {huidig === b.id && <Check className='lz-beelden-vink' aria-hidden='true' />}
            </span>
          </label>
        ))}
      </span>
      <small className='lz-weergave-noot lz-beelden-nu' data-stand={huidig} aria-live='polite'>
        <NuIcoon aria-hidden='true' />
        {/* de zinnen van de andere standen liggen onzichtbaar in hetzelfde vak: de regel is zo hoog als de langste, dus geen
            sprong bij het wisselen en geen lege regel waar alle zinnen korter zijn (taal, schermbreedte) */}
        {BEELDEN.filter((b) => b.id !== huidig).map((b) => <span key={b.id} className='lz-beelden-nu-maat' aria-hidden='true'>{t(b.nuUk, b.nuNl)}</span>)}
        <span>{t(nu.nuUk, nu.nuNl)}</span>
      </small>
      {/* aanraakschermen hebben geen knopinfo: de drie standen in één korte regel elk, standaard dicht */}
      <details className='lz-beelden-meer' onToggle={() => opMaat?.()}>
        <summary><span>{t('Докладніше', 'Meer uitleg')}</span><ChevronDown aria-hidden='true' /></summary>
        <ul>
          {BEELDEN.map((b) => (
            <li key={b.id} data-keuze={b.id}>
              <b.icoon aria-hidden='true' />
              <span><b>{t(b.kortUk, b.kortNl)}</b><em>{b.overal ? t('усі пристрої', 'alle apparaten') : t('цей пристрій', 'dit apparaat')}</em><span>{t(b.kernUk, b.kernNl)}</span></span>
            </li>
          ))}
          {!serverWeg && vr.wachtrij > 0 && (
            <li data-keuze='wachtrij'>
              <Hourglass aria-hidden='true' />
              <span><b>{t('У черзі', 'In wachtrij')}</b><span>{t('Листи чекають, доки відкриється сховище ключів; доти вони питають перед показом', 'Berichten wachten tot de sleutelkluis open is; tot dan vragen ze vóór het tonen')}</span></span>
            </li>
          )}
        </ul>
      </details>
      <span className='lz-beelden-voorraad' data-beelden-voorraad data-staat={serverWeg ? 'fout' : !vr.geladen ? 'laden' : vr.aantal > 0 ? 'vol' : 'leeg'} data-rij={!serverWeg && vr.wachtrij > 0 ? '' : undefined} role={serverWeg ? 'status' : undefined}>
        {serverWeg ? <CloudOff aria-hidden='true' /> : <Database aria-hidden='true' />}
        <small>
          {serverWeg
            ? <span>{t('Режим «При отриманні» зараз недоступний: сервер не відповів.', 'De stand «Bij ontvangst» is nu niet beschikbaar: de server antwoordde niet.')}</span>
            : !vr.geladen
              ? <span aria-hidden='true'>…</span>
              : vr.aantal > 0
                ? <span>{t('Збережено\u00a0', '')}{vr.aantal}<span className='lz-beelden-woord'>{`\u00a0${woordBeelden(lang, vr.aantal)}`}</span>{t('', ' bewaard')} ({formaatGrootte(lang, vr.bytes)})</span>
                : <span>{t('Ще нічого не збережено', 'Nog niets bewaard')}</span>}
          {!serverWeg && vr.wachtrij > 0 && (
            <span className='lz-beelden-rij' tabIndex={0}
              data-tooltip={tip(t(`Листів у черзі: ${vr.wachtrij}. Вони чекають, доки відкриється сховище ключів: тоді сервер завантажить їхні зображення і збереже зашифрованими. Доти ці листи питають перед показом.`, `Berichten in de wachtrij: ${vr.wachtrij}. Ze wachten tot de sleutelkluis open is: dan haalt de server hun afbeeldingen op en bewaart ze versleuteld. Tot dan vragen deze berichten vóór het tonen.`))}>
              <Hourglass aria-hidden='true' />{t(`У черзі: ${vr.wachtrij}`, `In wachtrij: ${vr.wachtrij}`)}
            </span>
          )}
        </small>
        {!serverWeg && vr.aantal > 0 && (
          <button type='button' className='lz-beelden-wis' aria-disabled={bezig || undefined} aria-busy={bezig || undefined} onClick={(e) => wis(e.currentTarget)}
            aria-label={t('Видалити збережені зображення листів', 'Bewaarde afbeeldingen van berichten wissen')}
            data-tooltip={tip(t('Видаляє всі збережені зображення. Повернути їх не можна: старі листи знову питатимуть перед показом (і тоді відправник може побачити відкриття). Режим не змінюється.', 'Wist alle bewaarde afbeeldingen. Niet terug te halen: oude berichten vragen weer vóór het tonen (en dan kan de afzender het openen zien). De stand blijft.'))}>
            <Trash2 aria-hidden='true' />
          </button>
        )}
      </span>
    </fieldset>
  );
}

/** Knop in de kop met een klein paneel; Escape sluit het (de werkbalk sluit eerst een open <details> in de brief).
 *  MAILBEELD-002: `open` volgt het <details> (ook als een klik ernaast het sluit) en staat als aria-expanded op de knop — daaraan ziet
 *  de knopinfo-laag (src/ViewportKnopinfoLaag.tsx) dat het eigen paneel open is en haalt ze de knopinfo «Вигляд» weg, die anders óp
 *  het open paneel lag (zonder die laag doet de CSS-regel in gesprek-opmaak.css hetzelfde).
 *  Een klik in de brieftekst (een eigen document in een iframe) geeft hier geen pointerdown: het venster verliest dan de focus aan
 *  het iframe — ook dat sluit het paneel. */
export function WeergaveKnop({ lang }: { lang: 'uk' | 'nl' }) {
  const ref = useRef<HTMLDetailsElement | null>(null);
  const [open, setOpen] = useState(false);
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  useEffect(() => {
    const buiten = (e: PointerEvent) => { const d = ref.current; if (d?.open && e.target instanceof Node && !d.contains(e.target)) d.removeAttribute('open'); };
    const inBrief = () => window.setTimeout(() => { const d = ref.current, a = document.activeElement; if (d?.open && a instanceof HTMLIFrameElement && !d.contains(a)) d.removeAttribute('open'); }, 0);
    document.addEventListener('pointerdown', buiten);
    window.addEventListener('blur', inBrief);
    return () => { document.removeEventListener('pointerdown', buiten); window.removeEventListener('blur', inBrief); };
  }, []);
  if (!useLeesVenster()) return null;
  return (
    <details ref={ref} className='mail-reader-weergave' onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className='mail-reader-icon-action' aria-expanded={open} aria-label={t('Вигляд: ШІ-аналіз над листом, щільність і розмір тексту', 'Weergave: AI-analyse boven het bericht, dichtheid en tekstgrootte')} data-tooltip={t('Вигляд', 'Weergave')}>
        <SlidersHorizontal aria-hidden='true' />
      </summary>
      <div className='lz-weergave-paneel' role='group' aria-label={t('Вигляд листа', 'Weergave van het bericht')}>
        <Keuzes lang={lang} />
      </div>
    </details>
  );
}

/** Hetzelfde als blok, in ⋮ op de telefoon. */
export function WeergaveBlok({ lang }: { lang: 'uk' | 'nl' }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  if (!useLeesVenster()) return null;
  return (
    <div className='mail-reader-overflow-groep lz-weergave-blok' data-groep='weergave' role='group' aria-label={t('Вигляд', 'Weergave')}>
      <span className='mail-reader-overflow-groep-kop' aria-hidden='true'>{t('Вигляд', 'Weergave')}</span>
      <Keuzes lang={lang} />
    </div>
  );
}
