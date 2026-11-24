// Початкова картка (аудит 19.10.2026, пункт 4): після схвалення новий користувач бачить «Що далі» у компактному вигляді
// з точним числом доступних кроків (пошта → хмара й календар → ШІ, останній лише за права «api-platform»). Закриття
// зберігається на сервері (ui-voorkeuren.welkomGesloten) на всіх пристроях. Без власного сховища й опитування.
import type { ReactElement } from 'react';
import { Bot, CalendarDays, ChevronRight, Mail, X } from 'lucide-react';
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
  const aantalTekst = uk ? `${stappen.length} кроки` : `${stappen.length} stappen`;

  return (
    <section
      className={`welkom-kaart${isMaquette ? ' is-maquette' : ''}`}
      data-hub-welkom={ai ? 'met-ai' : 'zonder-ai'}
      data-mq-dienst={isMaquette ? 'hub' : undefined}
      aria-labelledby='welkom-kaart-titel'
    >
      <header>
        <div className='welkom-kop'>
          {isMaquette ? <span className='welkom-bovenregel'>{uk ? 'Швидкий старт · Мій простір' : 'Snelstart · Mijn Ruimte'}</span> : null}
          <div className='welkom-titel-rij'>
            <h2 id='welkom-kaart-titel'>{uk ? 'Що далі' : 'Wat nu'}</h2>
            <span className='welkom-teller'>{aantalTekst}</span>
          </div>
          <p>{uk ? 'Підключіть дані, щоб робочий стіл наповнився вашим змістом.' : 'Koppel uw gegevens om uw werkblad direct te vullen.'}</p>
        </div>
        <button
          type='button'
          className='icon-button welkom-sluit'
          onClick={onClose}
          aria-label={uk ? 'Закрити картку «Що далі»' : 'Kaart «Wat nu» sluiten'}
          title={uk ? 'Закрити й більше не показувати' : 'Sluiten en niet meer tonen'}
          data-hub-welkom-sluiten='1'
        >
          <X aria-hidden='true' />
        </button>
      </header>
      <ol>
        {stappen.map((s) => (
          <li
            key={s.id}
            data-welkom-stap={s.id}
            onClick={(e) => {
              if ((e.target as HTMLElement | null)?.closest('button')) return;
              s.ga();
            }}
          >
            <span className='welkom-icoon'>
              {s.icoon}
              <span className='welkom-nr' aria-hidden='true'>{s.nr}</span>
            </span>
            <div className='welkom-inhoud'>
              <strong>{s.titel}</strong>
              <p>{s.tekst}</p>
            </div>
            <button type='button' className='secondary welkom-actie' onClick={s.ga} aria-label={`${s.titel}: ${s.knop}`}>
              <span className='welkom-actie-tekst'>{s.knop}</span>
              <ChevronRight aria-hidden='true' />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
