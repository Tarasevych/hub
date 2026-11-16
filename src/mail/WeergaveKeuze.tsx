// «Вигляд» van de open brief (pakket 2 «Adaptive Mail Canvas», 24.10.2026): dichtheid binnen de brief (compact · normaal · ruim) en
// tekstgrootte (90–130 %), per apparaat bewaard door het kader (src/mail/LeesVenster.tsx → weergave). Макет: «Вигляд (щільність і
// розмір)»; «щільність не залежить від режиму вікна». Twee vormen: een knop met paneel in de kop, en een blok in ⋮ op de telefoon
// (daar is geen plaats in de kop — макет: «Аркуш «Ще» … Вигляд: Щільність, Мова листа, Зовнішні зображення»). Externe beelden: «Питати»
// (standaard; de brief toont een strook «N … приховано · Показати один раз») of «Завжди показувати» (via de eigen server, zoals vroeger).
// Pakket 3: «Мова листа» — «Оригінал» (standaard) of «Перекладати» (een brief in een andere taal wordt bij het openen vertaald door de
// privé-AI-agent; dat de tekst dan naar die agent gaat, staat eronder — zonder agent blijft alles in het origineel).
import { SlidersHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { TEKST_STAPPEN, type LezerBeelden, type LezerDichtheid, type LezerTaal } from './lees-modus';
import { useLeesVenster } from './LeesVenster';
import { useLaatsteAiStaat, zetAiBalkTonen } from './ai-staat';
import AiUitleg from './AiUitleg';
import { StrookRegelsLijst } from './StrookNazorg';
import { formaatGrootte, useVoorraad, wisVoorraad, zetBijOntvangst } from './beelden-voorraad';
import './beelden-voorraad.css';

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
 *  die keuze staat op de server (alle apparaten), de andere twee op dit apparaat. De drie sluiten elkaar uit; wisselen kan altijd. */
type BeeldKeuze = LezerBeelden | 'ontvangst';
const BEELDEN: Array<{ id: BeeldKeuze; uk: string; nl: string; tipUk: string; tipNl: string }> = [
  { id: 'vragen', uk: 'Питати', nl: 'Vragen',
    tipUk: 'Зображення приховані, доки ви не натиснете «Показати». Нічого не завантажується наперед — відправник не дізнається, що лист відкрито. Типово.',
    tipNl: 'Afbeeldingen blijven verborgen tot u «Tonen» kiest. Er wordt niets vooraf geladen — de afzender weet niet dat het bericht geopend is. Standaard.' },
  { id: 'ontvangst', uk: 'При отриманні (приватно)', nl: 'Bij ontvangst (privé)',
    tipUk: 'Ваш сервер завантажує зображення нових листів одразу при надходженні (крім Спаму) і зберігає їх зашифрованими. Під час читання нічого не йде назовні: відправник не знає, чи й коли ви відкрили лист, і не бачить вашої IP-адреси — лише що лист доставлено. Діє для облікового запису на всіх пристроях.',
    tipNl: 'Uw server laadt de afbeeldingen van nieuwe berichten direct bij aankomst (behalve Spam) en bewaart ze versleuteld. Bij het lezen gaat er niets naar buiten: de afzender weet niet óf en wanneer u het bericht opende en ziet uw IP-adres niet — alleen dat het is afgeleverd. Geldt voor uw account op elk apparaat.' },
  { id: 'altijd', uk: 'Завжди показувати', nl: 'Altijd tonen',
    tipUk: '! Зображення завантажуються в момент відкриття листа (через ваш сервер): відправник може дізнатися, що й коли ви прочитали лист. Діє лише на цьому пристрої.',
    tipNl: '! Afbeeldingen worden geladen op het moment dat u het bericht opent (via uw server): de afzender kan zien dat en wanneer u het las. Geldt alleen op dit apparaat.' },
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

function Keuzes({ lang }: { lang: 'uk' | 'nl' }) {
  const lv = useLeesVenster(), id = useId();
  const ai = useLaatsteAiStaat();
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  if (!lv) return null;
  const w = lv.weergave;
  const geenAgent = Boolean(ai?.geladen && !ai.agent);
  return (
    <div className='lz-weergave-keuzes'>
      <AiBalkKeuze lang={lang} />
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
      <BeeldenKeuze lang={lang} naam={`${id}-b`} lokaal={w.beelden} zetLokaal={(b) => lv.zetWeergave({ beelden: b })} />
      {/* STROOK-002: regels «смугу не показувати» (taal, afzender, alle berichten), elk met ✕ */}
      <StrookRegelsLijst lang={lang} />
      <small>{t('Діє лише на цьому пристрої, в усіх режимах вікна (крім «ШІ-аналіз» і «При отриманні» — вони для облікового запису).', 'Geldt alleen op dit apparaat, in elke vorm van het venster (behalve «AI-analyse» en «Bij ontvangst» — die gelden voor het account).')}</small>
    </div>
  );
}

/** «Зовнішні зображення»: drie standen, op elk moment te wisselen (MAILBEELD-001). Onder de keuze: wat er nu gebeurt, hoeveel er
 *  bewaard is en een compacte wisknop (alleen als er iets bewaard is). */
function BeeldenKeuze({ lang, naam, lokaal, zetLokaal }: { lang: 'uk' | 'nl'; naam: string; lokaal: LezerBeelden; zetLokaal: (b: LezerBeelden) => void }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const vr = useVoorraad();
  const [bezig, setBezig] = useState(false);
  const huidig: BeeldKeuze = vr.bijOntvangst ? 'ontvangst' : lokaal;
  const kies = (b: BeeldKeuze) => {
    if (b === 'ontvangst') { zetLokaal('vragen'); void zetBijOntvangst(lang, true); return; }
    zetLokaal(b);
    if (vr.bijOntvangst) void zetBijOntvangst(lang, false);
  };
  const wis = () => { setBezig(true); void wisVoorraad(lang).finally(() => setBezig(false)); };
  return (
    <fieldset data-weergave-beelden={huidig}>
      <legend>{t('Зовнішні зображення', 'Externe afbeeldingen')}</legend>
      <span className='lz-segment'>
        {BEELDEN.map((b) => (
          <label key={b.id} title={t(b.tipUk, b.tipNl)}>
            <input type='radio' name={naam} value={b.id} checked={huidig === b.id} disabled={b.id === 'ontvangst' && vr.fout && !vr.bijOntvangst} onChange={() => kies(b.id)} />
            <span>{t(b.uk, b.nl)}</span>
          </label>
        ))}
      </span>
      <small className='lz-weergave-noot'>
        {huidig === 'ontvangst'
          ? t('Зображення нових листів (крім Спаму) сервер завантажує при отриманні й зберігає зашифрованими; під час читання нічого не йде назовні. Старі листи питають, як раніше.',
            'Afbeeldingen van nieuwe berichten (behalve Spam) laadt de server bij ontvangst en bewaart ze versleuteld; bij het lezen gaat er niets naar buiten. Oude berichten vragen zoals voorheen.')
          : huidig === 'altijd'
            ? t('Зображення завантажуються під час відкриття листа: відправник може дізнатися, що й коли ви його прочитали.', 'Afbeeldingen worden bij het openen geladen: de afzender kan zien dat en wanneer u het bericht las.')
            : t('Зображення приховані, доки ви не натиснете «Показати» в листі.', 'Afbeeldingen blijven verborgen tot u in het bericht «Tonen» kiest.')}
        {vr.fout && !vr.bijOntvangst ? ` ${t('Режим «При отриманні» зараз недоступний: сервер не відповів.', 'De stand «Bij ontvangst» is nu niet beschikbaar: de server antwoordde niet.')}` : ''}
      </small>
      {(vr.aantal > 0 || vr.wachtrij > 0) && (
        <span className='lz-beelden-voorraad' data-beelden-voorraad>
          <small>
            {vr.aantal > 0 && t(`Збережено: ${vr.aantal} · ${formaatGrootte('uk', vr.bytes)}`, `Bewaard: ${vr.aantal} · ${formaatGrootte('nl', vr.bytes)}`)}
            {vr.wachtrij > 0 && ` ${t(`· ${vr.wachtrij} листів чекають відкриття сховища ключів`, `· ${vr.wachtrij} berichten wachten op het openen van de sleutelkluis`)}`}
          </small>
          {vr.aantal > 0 && (
            <button type='button' className='lz-beelden-wis' disabled={bezig} onClick={wis}
              aria-label={t('Видалити збережені зображення листів', 'Bewaarde afbeeldingen van berichten wissen')}
              title={t('Видаляє всі зображення, які сервер зберіг при отриманні. Їх не можна повернути: старі листи знову питатимуть перед показом (і тоді відправник може побачити відкриття). Вибір режиму не змінюється.', 'Wist alle afbeeldingen die de server bij ontvangst bewaarde. Niet terug te halen: oude berichten vragen weer voordat ze tonen (en dan kan de afzender het openen zien). De gekozen stand blijft.')}>
              <Trash2 aria-hidden='true' />
            </button>
          )}
        </span>
      )}
    </fieldset>
  );
}

/** Knop in de kop met een klein paneel; Escape sluit het (de werkbalk sluit eerst een open <details> in de brief). */
export function WeergaveKnop({ lang }: { lang: 'uk' | 'nl' }) {
  const ref = useRef<HTMLDetailsElement | null>(null);
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  useEffect(() => {
    const buiten = (e: PointerEvent) => { const d = ref.current; if (d?.open && e.target instanceof Node && !d.contains(e.target)) d.removeAttribute('open'); };
    document.addEventListener('pointerdown', buiten);
    return () => document.removeEventListener('pointerdown', buiten);
  }, []);
  if (!useLeesVenster()) return null;
  return (
    <details ref={ref} className='mail-reader-weergave'>
      <summary className='mail-reader-icon-action' aria-label={t('Вигляд: ШІ-аналіз над листом, щільність і розмір тексту', 'Weergave: AI-analyse boven het bericht, dichtheid en tekstgrootte')} data-tooltip={t('Вигляд', 'Weergave')}>
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
