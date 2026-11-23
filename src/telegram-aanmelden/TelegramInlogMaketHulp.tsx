// Віха M2 (макет вікна входу Telegram, №169): візуальні зручності зі збереженого макета як взаємосумісна можливість:
//   · жива шкала залишку часу очікування (.tga-voortgang);
//   · наочні кроки входу зі станами проходження;
//   · знак підтвердженого замка з галочкою (.tga-slot-ok);
//   · зразок очікуваного повідомлення бота з двомовним попередженням про підозрілий запит;
//   · перемикач між компактним (типово) та студійним поданням.
import { Check, Lock, ShieldAlert } from 'lucide-react';
import PictogramTegel from '../apparaat-bevestiging/PictogramTegel';
import TelegramLogo from './TelegramLogo';
import type { TelegramInlogStijl } from './vlag';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);

export function TelegramStijlKiezer({
  lang,
  stijl,
  onKies,
}: {
  lang: Lang;
  stijl: TelegramInlogStijl;
  onKies: (s: TelegramInlogStijl) => void;
}) {
  return (
    <div
      className='tga-stijl-balk'
      role='radiogroup'
      aria-label={tr(lang, 'Стиль вікна входу через Telegram', 'Weergavestijl van het Telegram-aanmeldvenster')}
    >
      <span className='tga-stijl-label'>{tr(lang, 'Вигляд', 'Weergave')}</span>
      <div className='tga-stijl-knoppen'>
        <button
          type='button'
          role='radio'
          aria-checked={stijl === 'compact'}
          data-tg-inlog-stijl='compact'
          className={`tga-stijl-knop${stijl === 'compact' ? ' is-actief' : ''}`}
          onClick={() => onKies('compact')}
        >
          {tr(lang, 'Компактний', 'Compact')}
        </button>
        <button
          type='button'
          role='radio'
          aria-checked={stijl === 'maket'}
          data-tg-inlog-stijl='maket'
          className={`tga-stijl-knop${stijl === 'maket' ? ' is-actief' : ''}`}
          onClick={() => onKies('maket')}
        >
          {tr(lang, 'Студійний', 'Uitgebreid')}
        </button>
      </div>
    </div>
  );
}

export function TelegramTijdBalk({
  lang,
  restSec,
  totaalSec = 180,
}: {
  lang: Lang;
  restSec: number;
  totaalSec?: number;
}) {
  const veiligTotaal = Math.max(30, totaalSec);
  const veiligRest = Math.max(0, Math.min(veiligTotaal, restSec));
  const deel = Math.round((veiligRest / veiligTotaal) * 100);
  const bijnaOp = veiligRest > 0 && veiligRest < 45;
  return (
    <div
      className={`tga-voortgang${bijnaOp ? ' is-let' : ''}`}
      role='progressbar'
      aria-valuemin={0}
      aria-valuemax={veiligTotaal}
      aria-valuenow={veiligRest}
      aria-label={tr(lang, 'Залишок часу на підтвердження входу', 'Resterende tijd om de aanmelding te bevestigen')}
    >
      <span className='tga-voortgang-vulling' style={{ width: `${deel}%` }} />
    </div>
  );
}

export function TelegramSlotBevestigd({ lang }: { lang: Lang }) {
  return (
    <span className='tga-slot-ok' aria-label={tr(lang, 'Підтверджено захищеним каналом', 'Bevestigd via beveiligd kanaal')}>
      <Lock aria-hidden='true' className='tga-slot-icoon' />
      <Check aria-hidden='true' className='tga-slot-vink' />
    </span>
  );
}

export function TelegramStappenBalk({
  lang,
  stap,
  heeftCode,
}: {
  lang: Lang;
  stap: 1 | 2 | 3 | 4;
  heeftCode?: boolean;
}) {
  const items: Array<{ nr: number; label: string }> = [
    { nr: 1, label: tr(lang, 'Відкриття бота', 'Bot openen') },
    { nr: 2, label: tr(lang, 'Звірка знака', 'Teken controleren') },
    ...(heeftCode ? [{ nr: 3, label: tr(lang, 'Таємний код', 'Geheime code') }] : []),
    { nr: heeftCode ? 4 : 3, label: tr(lang, 'Вхід відкрито', 'Toegang gereed') },
  ];
  const actieveIndex = !heeftCode && stap >= 3 ? (stap === 4 ? 3 : 2) : stap;

  return (
    <ol className='tga-maket-stappen' aria-label={tr(lang, 'Етапи підтвердження входу', 'Stappen van de aanmeldcontrole')}>
      {items.map((item) => {
        const klaar = item.nr < actieveIndex;
        const actief = item.nr === actieveIndex;
        return (
          <li key={item.nr} className={klaar ? 'is-klaar' : actief ? 'is-actief' : 'is-wacht'}>
            <span className='tga-maket-stap-bol' aria-hidden='true'>
              {klaar ? <Check /> : item.nr}
            </span>
            <span>{item.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function TelegramBotVoorbeeld({
  lang,
  bot,
  pictogram,
  tegelNaam,
  symbool,
}: {
  lang: Lang;
  bot: string;
  pictogram?: number | null;
  tegelNaam?: string;
  symbool?: { emoji: string; uk: string; nl: string } | null;
}) {
  return (
    <div className='tga-bot-voorbeeld' role='note' data-tg-maket-voorbeeld=''>
      <div className='tga-bot-voorbeeld-kop'>
        <TelegramLogo maat={18} />
        <strong>{tr(lang, `Як виглядає повідомлення від @${bot}`, `Zo ziet het bericht van @${bot} eruit`)}</strong>
      </div>
      <div className='tga-bot-kaart'>
        <span className='tga-voorbeeld-strook' aria-hidden='true' />
        <div className='tga-bot-kaart-inhoud'>
          <span className='tga-bot-kaart-titel'>
            {tr(lang, 'Запит на вхід у «Мій простір»', 'Aanmeldverzoek voor Mijn Ruimte')}
          </span>
          {typeof pictogram === 'number' ? (
            <div className='tga-bot-kaart-teken'>
              <PictogramTegel index={pictogram} lang={lang} />
              <span>
                {tr(
                  lang,
                  `Контрольна піктограма на вашому екрані: «${tegelNaam || ''}»`,
                  `Controlepictogram op uw scherm: «${tegelNaam || ''}»`,
                )}
              </span>
            </div>
          ) : symbool ? (
            <div className='tga-bot-kaart-teken'>
              <span className='tga-bot-emoji' aria-hidden='true'>
                {symbool.emoji}
              </span>
              <span>{tr(lang, `Символ цього входу: ${symbool.uk}`, `Symbool van deze aanmelding: ${symbool.nl}`)}</span>
            </div>
          ) : null}
          <div className='tga-bot-knoppen-voorbeeld' aria-hidden='true'>
            <span className='tga-bot-knop-voorbeeld is-ok'>{tr(lang, 'Підтвердити вхід', 'Aanmelding bevestigen')}</span>
            <span className='tga-bot-knop-voorbeeld is-nee'>{tr(lang, 'Ні, це не я', 'Nee, dit ben ik niet')}</span>
          </div>
        </div>
      </div>
      <p className='tga-verdacht-waarschuwing'>
        <ShieldAlert aria-hidden='true' />
        <span>
          {tr(
            lang,
            'Бот ніколи не просить паролів чи таємних кодів у бесіді. Якщо надійшов підозрілий запит без відкритого вами екрана входу або з іншим знаком — натисніть у боті «Ні, це не я», щоб миттєво заблокувати чужу спробу.',
            'De bot vraagt nooit om wachtwoorden of geheime codes in het gesprek. Verschijnt er een verdacht verzoek zonder dit door u geopende aanmeldscherm of met een ander teken — tik in de bot op «Nee, dit ben ik niet» om de vreemde poging direct te blokkeren.',
          )}
        </span>
      </p>
    </div>
  );
}
