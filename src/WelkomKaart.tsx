// Початкова картка «Живий простір» (аудит 19.10.2026, пункт 4): органічна асиметрична композиція без вкладених прямокутників,
// єдина лінія взаємодії між кроками (пошта → хмара й календар → ШІ, останній лише за права «api-platform»), кільце поступу
// та вбудовані тактильні кнопки дії. Закриття зберігається на сервері (ui-voorkeuren.welkomGesloten) на всіх пристроях.
import type { ReactElement } from 'react';
import { ArrowRight, Bot, CalendarDays, Leaf, Mail, X } from 'lucide-react';
import { canonicalNavigationUrl } from './canoniek-navigatie';
import { useIsMaquette } from './thema/useThema';
import './welkom-kaart.css';

type Service = 'mail' | 'cloud' | 'mcp';
type Props = { lang: 'uk' | 'nl'; ai: boolean; onOpen: (service: 'mail' | 'cloud', tab: string) => void; onClose: () => void };

export default function WelkomKaart({ lang, ai, onOpen, onClose }: Props) {
  const uk = lang === 'uk';
  const isMaquette = useIsMaquette();
  const stappen: Array<{ id: Service; nr: number; icoon: ReactElement; titel: string; tekst: string; knop: string; ga: () => void }> = [
    {
      id: 'mail',
      nr: 1,
      icoon: <Mail aria-hidden='true' />,
      titel: uk ? 'Підключіть пошту' : 'Koppel uw e-mail',
      tekst: uk ? 'Gmail або Microsoft — листи, контакти й вкладення.' : 'Gmail of Microsoft — berichten, contacten en bijlagen.',
      knop: uk ? 'Акаунти' : 'Accounts',
      ga: () => onOpen('mail', 'accounts'),
    },
    {
      id: 'cloud',
      nr: 2,
      icoon: <CalendarDays aria-hidden='true' />,
      titel: uk ? 'Хмара й календар' : 'Cloud en agenda',
      tekst: uk ? 'Диск, Календар і Фото того самого акаунта Google.' : 'Drive, Agenda en Foto’s van hetzelfde Google-account.',
      knop: uk ? 'Хмара' : 'Cloud',
      ga: () => onOpen('cloud', 'overview'),
    },
  ];
  if (ai) {
    stappen.push({
      id: 'mcp',
      nr: 3,
      icoon: <Bot aria-hidden='true' />,
      titel: uk ? 'Підключіть ШІ' : 'Koppel een AI',
      tekst: uk ? 'Claude, ChatGPT чи Grok — лише з вашого дозволу.' : 'Claude, ChatGPT of Grok — alleen met uw toestemming.',
      knop: uk ? 'ШІ-міст' : 'AI-brug',
      ga: () => {
        location.assign(`${canonicalNavigationUrl('mcp', 'agents', lang).replace(/#.*$/, '')}#overzicht`);
      },
    });
  }
  const aantal = stappen.length;
  const aantalTekst = uk ? `${aantal} кроки` : `${aantal} stappen`;
  const eersteActie = stappen[0];

  return (
    <section
      className={`welkom-kaart welkom-levend${isMaquette ? ' is-maquette' : ''}`}
      data-hub-welkom={ai ? 'met-ai' : 'zonder-ai'}
      data-welkom-stijl='levende-ruimte'
      data-mq-dienst={isMaquette ? 'hub' : undefined}
      aria-labelledby='welkom-kaart-titel'
    >
      <header>
        <div className='welkom-kop'>
          {isMaquette ? <span className='welkom-bovenregel'>{uk ? 'Живий простір · Мій простір' : 'Levende ruimte · Mijn Ruimte'}</span> : null}
          <div className='welkom-titel-rij'>
            <h2 id='welkom-kaart-titel'>{uk ? 'Що далі' : 'Wat nu'}</h2>
            <span className='welkom-teller'>{aantalTekst}</span>
          </div>
          <p>{uk ? 'Підключіть дані, щоб робочий простір наповнився вашим змістом.' : 'Koppel uw gegevens zodat uw werkruimte tot leven komt.'}</p>
          <span className='welkom-accent-lijn' aria-hidden='true' />
        </div>
        <div className='welkom-kop-acties'>
          <div
            className='welkom-voortgang'
            aria-label={uk ? `Виконано 0 з ${aantal} кроків` : `0 van ${aantal} stappen voltooid`}
            title={uk ? `Поступ: 0 з ${aantal}` : `Voortgang: 0 van ${aantal}`}
          >
            <svg viewBox='0 0 48 48' aria-hidden='true'>
              <circle className='welkom-ring-spoor' cx='24' cy='24' r='20' />
              <circle className='welkom-ring-boog' cx='24' cy='24' r='20' />
            </svg>
            <span>0/{aantal}</span>
          </div>
          <button
            type='button'
            className='welkom-snelstart'
            onClick={eersteActie.ga}
            aria-label={uk ? `Почати з першого кроку: ${eersteActie.titel}` : `Start met eerste stap: ${eersteActie.titel}`}
            title={eersteActie.titel}
          >
            <ArrowRight aria-hidden='true' />
          </button>
          <button
            type='button'
            className='icon-button welkom-sluit'
            onClick={onClose}
            aria-label={uk ? 'Закрити блок «Що далі»' : 'Onderdeel «Wat nu» sluiten'}
            title={uk ? 'Закрити й більше не показувати' : 'Sluiten en niet meer tonen'}
            data-hub-welkom-sluiten='1'
          >
            <X aria-hidden='true' />
          </button>
        </div>
      </header>

      <div className='welkom-landschap'>
        <div className='welkom-stappen-baan'>
          <svg className='welkom-verbindingslijn' viewBox='0 0 600 220' preserveAspectRatio='none' aria-hidden='true'>
            <path d='M 430 58 C 520 96, 120 112, 165 162 C 195 196, 460 198, 495 215' />
          </svg>
          <ol>
            {stappen.map((s) => (
              <li
                key={s.id}
                className={`welkom-stap-vorm is-stap-${s.nr}`}
                data-welkom-stap={s.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement | null)?.closest('button')) return;
                  s.ga();
                }}
              >
                <span className={`welkom-icoon is-vorm-${s.nr}`}>
                  {s.icoon}
                  <span className='welkom-nr' aria-hidden='true'>{s.nr}</span>
                </span>
                <div className='welkom-inhoud'>
                  <strong>{s.titel}</strong>
                  <p>{s.tekst}</p>
                </div>
                <button type='button' className='secondary welkom-actie' onClick={s.ga} aria-label={`${s.titel}: ${s.knop}`}>
                  <span className='welkom-actie-tekst'>{s.knop}</span>
                  <ArrowRight aria-hidden='true' />
                </button>
              </li>
            ))}
          </ol>
        </div>

        <aside className='welkom-zijpad' aria-hidden='true'>
          <span className='welkom-zijpad-blad'><Leaf /></span>
          <span className='welkom-zijpad-lijn' />
          <span className='welkom-zijpad-stip is-actief' />
          <span className='welkom-zijpad-stip' />
          {ai ? <span className='welkom-zijpad-stip' /> : null}
          <span className='welkom-zijpad-tekst'>
            {uk ? 'Крок за кроком до повного контролю' : 'Stap voor stap naar volledig overzicht'}
          </span>
        </aside>
      </div>
    </section>
  );
}
