// STROOK-002 (16.11.2026): wat er na een ✕ op een strook boven de brief gebeurt, en waar de regels te zien en te wissen zijn.
//  - StrookNazorg: een smalle regel op de plaats van de gesloten strook: «Сховано для цього листа. Ховати й надалі: мова · відправник ·
//    усі листи». De keuze die u al vaker maakte, staat voorop met een ✦ (voorstel, src/mail/strook-regels.ts voorstelVoor) — nooit
//    automatisch. De regel verdwijnt na 12 s (pauze zolang muis of focus erop staan), bij een keuze, of met zijn eigen ✕.
//  - StrookRegelsLijst: «Вигляд» → «Сховані смуги»: elke regel met ✕ om hem te wissen.
//  - meldRegel: elke nieuwe of gewiste regel in het meldingencentrum, met «Скасувати».
// Een regel verbergt alleen de strook; het gedrag blijft (beelden verborgen, taalweergave ongewijzigd). Terug: knop in de kop van de brief.
import { ImageOff, Languages, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import { taalLabel } from '../../shared/ai-vertaling';
import {
  alleRegels, normAfzender, normTaal, useActiefBereik, useStrookRegels, voorstelVoor, zetRegel,
  type BriefKenmerken, type RegelSoort, type StrookRegel, type StrookSoort,
} from './strook-regels';
import './stroken-sluiten.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang) => (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const taalNaam = (lang: Lang, code: string) => taalLabel(lang, code) || code.toUpperCase();

/** Korte naam van de strook. */
export const strookNaam = (lang: Lang, strook: StrookSoort) =>
  tr(lang)(strook === 'taal' ? 'Смуга мови' : 'Смуга про зображення', strook === 'taal' ? 'Taalstrook' : 'Beeldenstrook');

/** Waarvoor de regel geldt, kort: «мова: Нідерландська», «відправник x@y», «усі листи». */
export function regelDoel(lang: Lang, regel: Pick<StrookRegel, 'soort' | 'waarde'>): string {
  const t = tr(lang);
  if (regel.soort === 'taal') return t(`мова: ${taalNaam(lang, regel.waarde)}`, `taal: ${taalNaam(lang, regel.waarde)}`);
  if (regel.soort === 'afzender') return t(`відправник ${regel.waarde}`, `afzender ${regel.waarde}`);
  return t('усі листи', 'alle berichten');
}

/** Wat een regel doet, voor tooltips: gevolg, wat blijft, en waar terug. */
export function regelGevolg(lang: Lang, regel: StrookRegel): string {
  const t = tr(lang);
  const voor = regel.soort === 'taal'
    ? t(`над листами мовою «${taalNaam(lang, regel.waarde)}»`, `boven berichten in de taal «${taalNaam(lang, regel.waarde)}»`)
    : regel.soort === 'afzender'
      ? t(`над листами від ${regel.waarde}`, `boven berichten van ${regel.waarde}`)
      : t('над усіма листами', 'boven alle berichten');
  const blijft = regel.strook === 'taal'
    ? t('Переклад лишається: кнопка з літерами в шапці листа поверне смугу для одного листа.', 'Vertalen blijft: de knop met letters in de kop van het bericht haalt de strook voor één bericht terug.')
    : t('Зображення й далі лишаються прихованими; кнопка з перекресленим зображенням у шапці листа поверне смугу для одного листа.', 'De afbeeldingen blijven verborgen; de knop met de doorgestreepte afbeelding in de kop haalt de strook voor één bericht terug.');
  return t(
    `${strookNaam(lang, regel.strook)} не показуватиметься ${voor} у цій скриньці на цьому пристрої. ${blijft} Скасувати — «Вигляд» → «Сховані смуги».`,
    `${strookNaam(lang, regel.strook)} wordt niet meer getoond ${voor} in deze mailbox op dit apparaat. ${blijft} Ongedaan maken — «Weergave» → «Verborgen stroken».`,
  );
}

/** Zet of wist een regel en meldt dat in het meldingencentrum (met «Скасувати» / «Повернути правило»). */
export function kiesRegel(lang: Lang, bereik: string, regel: StrookRegel, aan: boolean): boolean {
  if (!zetRegel(bereik, regel, aan)) return false;
  const t = tr(lang);
  const doel = regelDoel(lang, regel);
  emitCanonicalNotice({
    text: aan
      ? t(`${strookNaam(lang, regel.strook)} більше не показується (${doel})`, `${strookNaam(lang, regel.strook)} niet meer getoond (${doel})`)
      : t(`${strookNaam(lang, regel.strook)} знову показується (${doel})`, `${strookNaam(lang, regel.strook)} weer getoond (${doel})`),
    kind: aan ? 'success' : 'info',
    source: 'mail',
    explain: aan ? regelGevolg(lang, regel) : t('Правило прибрано. Смуга знову з’являтиметься над такими листами.', 'Regel verwijderd. De strook verschijnt weer boven zulke berichten.'),
    topic: `mail|strook-regel|${regel.strook}|${regel.soort}|${regel.waarde}`,
    action: { label: aan ? t('Скасувати', 'Ongedaan maken') : t('Повернути правило', 'Regel terugzetten'), onAction: () => { kiesRegel(lang, bereik, regel, !aan); } },
  });
  return true;
}

const NAZORG_MS = 12_000;

/** De smalle regel na ✕: «Сховано для цього листа. Ховати й надалі: …». */
export function StrookNazorg({ lang, strook, bereik, kenmerken, onKlaar }: { lang: Lang; strook: StrookSoort; bereik: string; kenmerken: BriefKenmerken; onKlaar: () => void }) {
  const t = tr(lang);
  const regels = useStrookRegels(bereik);
  const [pauze, setPauze] = useState(false);
  const klaarRef = useRef(onKlaar); klaarRef.current = onKlaar;
  useEffect(() => {
    if (pauze) return;
    const id = window.setTimeout(() => klaarRef.current(), NAZORG_MS);
    return () => window.clearTimeout(id);
  }, [pauze]);
  const taal = strook === 'taal' ? normTaal(kenmerken.taal) : '';
  const afz = normAfzender(kenmerken.afzender);
  const keuzes: StrookRegel[] = [];
  if (taal) keuzes.push({ strook, soort: 'taal', waarde: taal });
  if (afz) keuzes.push({ strook, soort: 'afzender', waarde: afz });
  keuzes.push({ strook, soort: 'overal', waarde: '' });
  const voorstel = voorstelVoor(regels, strook, kenmerken);
  const gesorteerd = voorstel ? [...keuzes.filter((k) => k.soort === voorstel.soort), ...keuzes.filter((k) => k.soort !== voorstel.soort)] : keuzes;
  const label = (k: StrookRegel) => k.soort === 'taal'
    ? t(`Мова: ${taalNaam(lang, k.waarde)}`, `Taal: ${taalNaam(lang, k.waarde)}`)
    : k.soort === 'afzender' ? t(`Відправник: ${k.waarde}`, `Afzender: ${k.waarde}`) : t('Усі листи', 'Alle berichten');
  const waarom = (soort: RegelSoort, keer: number) => soort === 'taal'
    ? t(`Пропозиція: ви вже ${keer} рази ховали цю смугу в листах мовою «${taalNaam(lang, taal)}».`, `Voorstel: u verborg deze strook al ${keer} keer bij berichten in de taal «${taalNaam(lang, taal)}».`)
    : t(`Пропозиція: ви вже ${keer} рази ховали цю смугу в листах від ${afz}.`, `Voorstel: u verborg deze strook al ${keer} keer bij berichten van ${afz}.`);
  return (
    <div className='mail-strook-nazorg' role='status' data-strook-nazorg={strook} data-mail-translation-skip='true'
      onPointerEnter={() => setPauze(true)} onPointerLeave={() => setPauze(false)}
      onFocusCapture={() => setPauze(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPauze(false); }}>
      <span className='mail-strook-nazorg-tekst'>
        {strook === 'taal' ? t('Смугу мови сховано для цього листа.', 'Taalstrook verborgen voor dit bericht.') : t('Смугу про зображення сховано для цього листа.', 'Beeldenstrook verborgen voor dit bericht.')}
        {' '}<b>{t('Ховати й надалі:', 'Voortaan verbergen:')}</b>
      </span>
      <span className='mail-strook-nazorg-keuzes'>
        {gesorteerd.map((k) => {
          const isVoorstel = voorstel?.soort === k.soort;
          return (
            <button key={k.soort} type='button' data-regel={k.soort} data-voorstel={isVoorstel ? 'ja' : undefined}
              className={isVoorstel ? 'is-voorstel' : undefined}
              title={`${isVoorstel ? `${waarom(k.soort, voorstel!.keer)} ` : ''}${regelGevolg(lang, k)}`}
              onClick={() => { kiesRegel(lang, bereik, k, true); onKlaar(); }}>
              {isVoorstel && <Sparkles aria-hidden='true' />}
              <span>{label(k)}</span>
            </button>
          );
        })}
      </span>
      <button type='button' className='mail-strook-nazorg-sluit' aria-label={t('Лише для цього листа', 'Alleen voor dit bericht')}
        title={t('Лишити як є: смугу сховано тільки для цього листа. Інші листи показуватимуть її як раніше.', 'Laten zo: de strook is alleen voor dit bericht verborgen. Andere berichten tonen hem zoals vroeger.')}
        onClick={onKlaar}><X aria-hidden='true' /></button>
    </div>
  );
}

/** «Вигляд» → «Сховані смуги»: de regels van de open mailbox, elk met ✕. */
export function StrookRegelsLijst({ lang }: { lang: Lang }) {
  const t = tr(lang);
  const bereik = useActiefBereik();
  const regels = alleRegels(useStrookRegels(bereik));
  return (
    <fieldset data-weergave-stroken>
      <legend>{t('Сховані смуги', 'Verborgen stroken')}</legend>
      {regels.length ? (
        <ul className='lz-strook-regels'>
          {regels.map((r) => (
            <li key={`${r.strook}|${r.soort}|${r.waarde}`} data-strook-regel={`${r.strook}|${r.soort}`}>
              <span title={regelGevolg(lang, r)}><b>{strookNaam(lang, r.strook)}</b> · {regelDoel(lang, r)}</span>
              <button type='button' aria-label={t(`Прибрати правило: ${strookNaam(lang, r.strook)}, ${regelDoel(lang, r)}`, `Regel verwijderen: ${strookNaam(lang, r.strook)}, ${regelDoel(lang, r)}`)}
                title={t('Прибрати правило: смуга знову з’являтиметься над такими листами. Скасувати можна в центрі сповіщень.', 'Regel verwijderen: de strook verschijnt weer boven zulke berichten. Ongedaan maken kan in het meldingencentrum.')}
                onClick={() => kiesRegel(lang, bereik, r, false)}><X aria-hidden='true' /></button>
            </li>
          ))}
        </ul>
      ) : null}
      <small className='lz-weergave-noot'>
        {regels.length
          ? t('Діє в цій скриньці на цьому пристрої. Сховане правилом можна показати для одного листа кнопкою в шапці листа.', 'Geldt in deze mailbox op dit apparaat. Wat een regel verbergt, toont de knop in de kop van het bericht voor één bericht.')
          : t('Немає. Хрестик на смузі ховає її для одного листа, а потім пропонує ховати для мови, відправника чи всіх листів.', 'Geen. Het kruisje op een strook verbergt hem voor één bericht en stelt daarna voor om hem te verbergen per taal, afzender of voor alle berichten.')}
      </small>
    </fieldset>
  );
}

/** In een strook die een regel verbergt maar die hier toch getoond wordt: «Сховано правилом … · Прибрати правило». */
export function RegelHint({ lang, bereik, regel }: { lang: Lang; bereik: string; regel: StrookRegel }) {
  const t = tr(lang);
  return (
    <small className='mail-strook-regel-hint' data-strook-regel-hint={regel.soort}>
      {t(`Зазвичай сховано правилом (${regelDoel(lang, regel)}), показано лише для цього листа.`, `Normaal verborgen door een regel (${regelDoel(lang, regel)}), alleen voor dit bericht getoond.`)}
      {' '}
      <button type='button' title={t('Прибрати правило: смуга знову показуватиметься над такими листами. Скасувати можна в центрі сповіщень.', 'Regel verwijderen: de strook verschijnt weer boven zulke berichten. Ongedaan maken kan in het meldingencentrum.')}
        onClick={() => kiesRegel(lang, bereik, regel, false)}>{t('Показувати завжди', 'Altijd tonen')}</button>
    </small>
  );
}

/** Terugknop in de kop van de brief (naast ↩ en ⓘ) voor een verborgen strook. */
export function StrookTerugKnop({ lang, strook, regel, aantal = 0, onTerug }: { lang: Lang; strook: StrookSoort; regel: StrookRegel | null; aantal?: number; onTerug: () => void }) {
  const t = tr(lang);
  const wat = strook === 'taal'
    ? t('смугу мови листа (перемикач «Оригінал / Переклад / Порівняти»)', 'de taalstrook (keuze «Origineel / Vertaling / Vergelijken»)')
    : t(`смугу про ${aantal} приховані зовнішні зображення (звідти їх можна показати)`, `de strook over ${aantal} verborgen externe afbeeldingen (daar kunt u ze tonen)`);
  const title = regel
    ? t(`Сховано правилом (${regelDoel(lang, regel)}). Натисніть, щоб показати ${wat} для цього листа. Прибрати правило — «Вигляд» → «Сховані смуги».`,
      `Verborgen door een regel (${regelDoel(lang, regel)}). Klik om ${wat} voor dit bericht te tonen. Regel verwijderen — «Weergave» → «Verborgen stroken».`)
    : t(`Повернути ${wat} для цього листа`, `${wat} voor dit bericht terughalen`);
  return (
    <button type='button' className='mail-thread-message-antwoord mail-thread-strook-terug' data-strook-terug={strook} data-door-regel={regel ? 'ja' : undefined}
      aria-label={strook === 'taal' ? t('Показати смугу мови листа', 'Taalstrook tonen') : t(`Показати смугу про приховані зображення (${aantal})`, `Strook over verborgen afbeeldingen tonen (${aantal})`)}
      title={title} onClick={(e) => { e.stopPropagation(); onTerug(); }}>
      {strook === 'taal' ? <Languages aria-hidden='true' /> : <ImageOff aria-hidden='true' />}
    </button>
  );
}
