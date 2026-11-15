// «Вигляд» van de open brief (pakket 2 «Adaptive Mail Canvas», 24.10.2026): dichtheid binnen de brief (compact · normaal · ruim) en
// tekstgrootte (90–130 %), per apparaat bewaard door het kader (src/mail/LeesVenster.tsx → weergave). Макет: «Вигляд (щільність і
// розмір)»; «щільність не залежить від режиму вікна». Twee vormen: een knop met paneel in de kop, en een blok in ⋮ op de telefoon
// (daar is geen plaats in de kop — макет: «Аркуш «Ще» … Вигляд: Щільність, Мова листа, Зовнішні зображення»). Externe beelden: «Питати»
// (standaard; de brief toont een strook «N … приховано · Показати один раз») of «Завжди показувати» (via de eigen server, zoals vroeger).
// Pakket 3: «Мова листа» — «Оригінал» (standaard) of «Перекладати» (een brief in een andere taal wordt bij het openen vertaald door de
// privé-AI-agent; dat de tekst dan naar die agent gaat, staat eronder — zonder agent blijft alles in het origineel).
import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { TEKST_STAPPEN, type LezerBeelden, type LezerDichtheid, type LezerTaal } from './lees-modus';
import { useLeesVenster } from './LeesVenster';
import { useLaatsteAiStaat, zetAiBalkTonen } from './ai-staat';
import AiUitleg from './AiUitleg';

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

/** «Питати»: verborgen tot «Показати» (geen verzoek naar buiten, ook niet via de server — een pixel verraadt anders het openen). */
const BEELDEN: Array<{ id: LezerBeelden; uk: string; nl: string }> = [
  { id: 'vragen', uk: 'Питати', nl: 'Vragen' },
  { id: 'altijd', uk: 'Завжди показувати', nl: 'Altijd tonen' },
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
      <fieldset>
        <legend>{t('Зовнішні зображення', 'Externe afbeeldingen')}</legend>
        <span className='lz-segment'>
          {BEELDEN.map((b) => (
            <label key={b.id}>
              <input type='radio' name={`${id}-b`} checked={w.beelden === b.id} onChange={() => lv.zetWeergave({ beelden: b.id })} />
              <span>{t(b.uk, b.nl)}</span>
            </label>
          ))}
        </span>
      </fieldset>
      <small>{t('Діє лише на цьому пристрої, в усіх режимах вікна.', 'Geldt alleen op dit apparaat, in elke vorm van het venster.')}</small>
    </div>
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
