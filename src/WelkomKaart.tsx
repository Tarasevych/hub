// Початкова картка «Живий простір» (аудит 19.10.2026, пункт 4): пелюсткова геометрія без вкладених прямокутників,
// єдина лінія взаємодії між кроками (пошта → хмара й календар → ШІ, останній лише за права «api-platform»), кільце поступу
// та перемикання у спокійний однорядковий режим через м'яку кнопку-ромб. Закриття зберігається на сервері (welkomGesloten).
import { useState, type ReactElement } from 'react';
import { ArrowRight, Bot, CalendarDays, ChevronDown, ChevronUp, Leaf, Mail, X } from 'lucide-react';
import { canonicalNavigationUrl } from './canoniek-navigatie';
import { useIsMaquette } from './thema/useThema';
import './welkom-kaart.css';

type Service = 'mail' | 'cloud' | 'mcp';
type Props = { lang: 'uk' | 'nl'; ai: boolean; onOpen: (service: 'mail' | 'cloud', tab: string) => void; onClose: () => void };

export default function WelkomKaart({ lang, ai, onOpen, onClose }: Props) {
  const uk = lang === 'uk';
  const isMaquette = useIsMaquette();
  const [rustig, setRustig] = useState(false);

  const stappen: Array<{ id: Service; nr: number; icoon: ReactElement; titel: string; tekst: string; knop: string; ga: () => void }> = [
    {
      id: 'mail',
      nr: 1,
      icoon: <Mail aria-hidden='true' />,
      titel: uk ? 'Підключіть пошту' : 'Koppel uw e-mail',
      tekst: uk ? 'Gmail або Microsoft — листи, контакти й вкладення.' : 'Gmail of Microsoft — berichten, contacten en bijlagen.',
      knop: uk ? 'Облікові записи' : 'Accounts',
      ga: () => onOpen('mail', 'accounts'),
    },
    {
      id: 'cloud',
      nr: 2,
      icoon: <CalendarDays aria-hidden='true' />,
      titel: uk ? 'Хмара й календар' : 'Cloud en agenda',
      tekst: uk ? 'Диск, Календар і Фото того самого облікового запису Google.' : 'Drive, Agenda en Foto’s van hetzelfde Google-account.',
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

  if (rustig) {
    return (
      <section
        className={`welkom-kaart welkom-levend is-rustig${isMaquette ? ' is-maquette' : ''}`}
        data-hub-welkom={ai ? 'met-ai' : 'zonder-ai'}
        data-welkom-stijl='levende-ruimte'
        data-welkom-modus='rustig'
        data-mq-dienst={isMaquette ? 'hub' : undefined}
        aria-labelledby='welkom-kaart-titel'
      >
        <div className='welkom-rustig-rij'>
          <h2 id='welkom-kaart-titel'>{uk ? 'Що далі' : 'Wat nu'}</h2>
          <div className='welkom-rustig-spoor' role='list' aria-label={uk ? 'Кроки налаштування' : 'Instelstappen'}>
            {stappen.map((s, idx) => (
              <div key={s.id} className='welkom-rustig-node' role='listitem' data-welkom-stap={s.id}>
                {idx > 0 ? <span className='welkom-rustig-draad' aria-hidden='true' /> : null}
                <button
                  type='button'
                  className={`welkom-rustig-punt${idx === 0 ? ' is-volgende' : ''}`}
                  onClick={s.ga}
                  title={`${s.nr}. ${s.titel}`}
                  aria-label={`${s.nr}. ${s.titel}`}
                >
                  {s.icoon}
                </button>
              </div>
            ))}
          </div>
          <span className='welkom-rustig-teller'>{uk ? `0 з ${aantal}` : `0 van ${aantal}`}</span>
          <div className='welkom-rustig-acties'>
            <button
              type='button'
              className='secondary welkom-rustig-ga'
              onClick={eersteActie.ga}
              aria-label={uk ? `Перейти до кроку: ${eersteActie.titel}` : `Ga naar stap: ${eersteActie.titel}`}
              title={eersteActie.titel}
            >
              <ArrowRight aria-hidden='true' />
            </button>
            <button
              type='button'
              className='welkom-ruit-knop'
              data-welkom-rustig='0'
              onClick={() => setRustig(false)}
              aria-expanded='false'
              aria-label={uk ? 'Розгорнути блок «Що далі»' : 'Onderdeel «Wat nu» uitklappen'}
              title={uk ? 'Розгорнути кроки' : 'Stappen uitklappen'}
            >
              <ChevronDown aria-hidden='true' />
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
        </div>
      </section>
    );
  }

  return (
    <section
      className={`welkom-kaart welkom-levend${isMaquette ? ' is-maquette' : ''}`}
      data-hub-welkom={ai ? 'met-ai' : 'zonder-ai'}
      data-welkom-stijl='levende-ruimte'
      data-welkom-modus='volledig'
      data-mq-dienst={isMaquette ? 'hub' : undefined}
      aria-labelledby='welkom-kaart-titel'
    >
      <header className='welkom-brug-kop'>
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
            <svg viewBox='0 0 52 52' aria-hidden='true'>
              <circle className='welkom-ring-spoor' cx='26' cy='26' r='22' />
              <circle className='welkom-ring-boog' cx='26' cy='26' r='22' />
            </svg>
            <div className='welkom-voortgang-binnen'>
              <strong>0/{aantal}</strong>
              <small>{uk ? 'кроки' : 'stappen'}</small>
            </div>
          </div>
          <button
            type='button'
            className='welkom-ruit-knop'
            data-welkom-rustig='1'
            onClick={() => setRustig(true)}
            aria-expanded='true'
            aria-label={uk ? 'Згорнути у спокійний режим' : 'Inklappen naar rustige modus'}
            title={uk ? 'Спокійний однорядковий режим' : 'Rustige modus op één regel'}
          >
            <ChevronUp aria-hidden='true' />
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
          <svg className='welkom-stengel' viewBox='0 0 54 220' preserveAspectRatio='none' aria-hidden='true'>
            <path d='M 24 14 C 6 58, 42 96, 22 142 C 10 172, 26 196, 30 212' />
            <circle cx='24' cy='14' r='2.5' />
            <circle cx='30' cy='212' r='2.5' />
          </svg>
          <ol>
            {stappen.map((s) => (
              <li
                key={s.id}
                className={`welkom-stap-vorm is-bloemblad is-stap-${s.nr}`}
                data-welkom-stap={s.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement | null)?.closest('button')) return;
                  s.ga();
                }}
              >
                <span className={`welkom-icoon is-bloemblad-icoon is-vorm-${s.nr}`}>
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
