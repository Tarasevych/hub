// IDENTITEIT-003: nieuwe, omkeerbare vorm van het bestaande accountcentrum.
// Geen eigen opslag of schijnhandelingen: inhoud en rechten komen uit de huidige onderdelen.
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowUpRight, BookOpen, CalendarDays, Check, ChevronDown, ChevronUp,
  ContactRound, Database, Eye, Fingerprint, FolderLock, Globe2, IdCard,
  KeyRound, Languages, LayoutGrid, LifeBuoy, Link2, LockKeyhole, LogOut,
  Menu, Monitor, Moon, Palette, PanelLeft, PencilRuler, Settings2,
  ShieldCheck, SlidersHorizontal, Smartphone, StickyNote, Sun, UserRound,
  UsersRound, type LucideIcon,
} from 'lucide-react';
import { GOOGLE_G_DATA_URI } from '../merk/google-g-officieel';
import { IDENTITEIT_TABS, type IdentiteitTab } from './identiteit-tabs';
import type { IdentiteitSectie } from './IdentiteitAccountPagina';
import './identiteit-atelier.css';

type Taal = 'uk' | 'nl';
type Gegevens = {
  symbool: LucideIcon;
  extra: [LucideIcon, LucideIcon];
  kleur: string;
  uk: string;
  nl: string;
};

// Een vaste, inhoudelijke koppeling. De afbeeldingen worden nooit op volgnummer toegekend.
const ONDERDELEN: Record<IdentiteitTab, Gegevens> = {
  personalization: { symbool: SlidersHorizontal, extra: [PencilRuler, Eye], kleur: 'violet', uk: 'Ваш простір — ваші вподобання.', nl: 'Uw ruimte, uw voorkeuren.' },
  menu: { symbool: PanelLeft, extra: [Menu, Settings2], kleur: 'cyaan', uk: 'Розташування та вигляд навігації.', nl: 'Indeling en vorm van de navigatie.' },
  themes: { symbool: Palette, extra: [Moon, Sun], kleur: 'roze', uk: 'Світло, темрява й власний колір.', nl: 'Licht, donker en een eigen kleur.' },
  languages: { symbool: Languages, extra: [Globe2, BookOpen], kleur: 'mint', uk: 'Однакові можливості обома мовами.', nl: 'Dezelfde mogelijkheden in beide talen.' },
  widgets: { symbool: LayoutGrid, extra: [CalendarDays, StickyNote], kleur: 'amber', uk: 'Ваші інструменти на своєму місці.', nl: 'Uw hulpmiddelen op de juiste plek.' },
  sharing: { symbool: UsersRound, extra: [Link2, LockKeyhole], kleur: 'blauw', uk: 'Керуйте тим, хто бачить ваш простір.', nl: 'Bepaal wie uw ruimte kan zien.' },
  identity: { symbool: ContactRound, extra: [UserRound, ShieldCheck], kleur: 'violet', uk: 'Особиста й технічна ідентичності.', nl: 'Persoonlijke en technische identiteit.' },
  account: { symbool: IdCard, extra: [Database, FolderLock], kleur: 'amber', uk: 'Ваші відомості залишаються вашими.', nl: 'Uw gegevens blijven van u.' },
  sessions: { symbool: Monitor, extra: [Smartphone, LogOut], kleur: 'blauw', uk: 'Переглядайте пристрої та завершення входів.', nl: 'Bekijk apparaten en beëindig aanmeldingen.' },
  methods: { symbool: KeyRound, extra: [Fingerprint, ShieldCheck], kleur: 'cyaan', uk: 'Вхід і підтвердження — різні дії.', nl: 'Aanmelden en bevestigen zijn verschillende handelingen.' },
  security: { symbool: ShieldCheck, extra: [LockKeyhole, Smartphone], kleur: 'mint', uk: 'Захист важливих дій і відомостей.', nl: 'Bescherming van belangrijke handelingen en gegevens.' },
  recovery: { symbool: LifeBuoy, extra: [KeyRound, LockKeyhole], kleur: 'roze', uk: 'Шляхи відновлення, коли доступ утрачено.', nl: 'Herstelmogelijkheden wanneer toegang verloren is.' },
};

type Props = {
  lang: Taal;
  actief: string;
  inBeeld: string;
  secties: readonly IdentiteitSectie[];
  onKies: (id: string) => void;
};

const schrijf = (taal: Taal, uk: string, nl: string) => taal === 'uk' ? uk : nl;
const sectieId = (id: string) => `identity-sectie-${id}`;

function Kunst({ id, lang }: { id: IdentiteitTab; lang: Taal }) {
  const gegevens = ONDERDELEN[id];
  const Hoofd = gegevens.symbool;
  const [Links, Rechts] = gegevens.extra;
  return (
    <div className={`ia-at-kunst ia-at-kleur-${gegevens.kleur}`} aria-hidden='true'>
      <span className='ia-at-kunst-baan ia-at-kunst-baan-een' />
      <span className='ia-at-kunst-baan ia-at-kunst-baan-twee' />
      <div className='ia-at-kunst-hoofd'>
        {id === 'methods' ? <div className='ia-at-google'><img src={GOOGLE_G_DATA_URI} alt='' draggable={false} /><span>Google</span></div> : <Hoofd size={55} strokeWidth={1.3} />}
      </div>
      <div className='ia-at-kunst-bij ia-at-kunst-bij-links'><Links size={24} strokeWidth={1.6} /></div>
      <div className='ia-at-kunst-bij ia-at-kunst-bij-rechts'><Rechts size={24} strokeWidth={1.6} /></div>
      <span className='ia-at-kunst-bijschrift'>{schrijf(lang, 'ВАШ ПРОСТІР · ВАШІ ПРАВИЛА', 'UW RUIMTE · UW REGELS')}</span>
    </div>
  );
}

function Vooruitzicht({ lang }: { lang: Taal }) {
  return (
    <details className='ia-at-vooruitzicht'>
      <summary>
        <span className='ia-at-vooruitzicht-teken'><PencilRuler size={23} strokeWidth={1.6} /></span>
        <span className='ia-at-vooruitzicht-tekst'>
          <strong>{schrijf(lang, 'Можливості для доопрацювання', 'Mogelijkheden voor verdere ontwikkeling')}</strong>
          <small>{schrijf(lang, 'Окремі дії ще потребують справжнього підключення й перевірки.', 'Sommige handelingen hebben nog een werkelijke koppeling en controle nodig.')}</small>
        </span>
        <ChevronDown className='ia-at-vooruitzicht-pijl' size={21} />
      </summary>
      <div className='ia-at-vooruitzicht-inhoud'>
        <p>{schrijf(lang,
          'Ці пункти є планом розвитку, а не ввімкненими функціями. Чинні способи входу, права та дані не змінюються.',
          'Deze punten zijn plannen, geen ingeschakelde functies. Aanmelden, rechten en gegevens blijven ongewijzigd.')}</p>
        <ul>
          <li><strong>{schrijf(lang, 'Світлина', 'Profielfoto')}</strong> — {schrijf(lang, 'окреме перевірене вилучення особистої світлини.', 'een afzonderlijke, gecontroleerde verwijdering van de eigen foto.')}</li>
          <li><strong>{schrijf(lang, 'Спільний доступ', 'Delen')}</strong> — {schrijf(lang, 'точна перевірка прав у кожному просторі.', 'nauwkeurige rechtencontrole in elke werkruimte.')}</li>
          <li><strong>{schrijf(lang, 'Ключі доступу', 'Toegangssleutels')}</strong> — {schrijf(lang, 'окреме випробування входу та підтвердження дій.', 'het afzonderlijk testen van aanmelden en handelingen bevestigen.')}</li>
        </ul>
      </div>
    </details>
  );
}

export function IdentiteitAtelierPagina({ lang, actief, inBeeld, secties, onKies }: Props) {
  // Meerdere onderdelen mogen tegelijk openblijven; taal- of themakeuze reset ze niet.
  const [open, setOpen] = useState<Set<string>>(() => new Set([actief]));
  useEffect(() => { setOpen((vorige) => new Set([...vorige, actief])); }, [actief]);

  const keerOm = (id: string) => setOpen((vorige) => {
    const volgende = new Set(vorige);
    if (volgende.has(id)) volgende.delete(id); else volgende.add(id);
    return volgende;
  });
  const kies = (id: string) => {
    setOpen((vorige) => new Set([...vorige, id]));
    onKies(id);
  };

  return (
    <div className='ia-account ia-account-atelier'>
      <header className='ia-at-hero'>
        <div className='ia-at-hero-tekst'>
          <span className='ia-at-wenkbrauw'><span className='ia-at-wenkbrauw-punt' />MIJN RUIMTE / {schrijf(lang, 'ОБЛІКОВИЙ ЗАПИС', 'ACCOUNT')}</span>
          <h1>{schrijf(lang, 'Керування', 'Uw account')}<br /><em>{schrijf(lang, 'обліковим записом', 'in eigen handen')}</em></h1>
          <p>{schrijf(lang,
            'Один простір для персоналізації, входу та захисту. Усі зміни виконуються чинними засобами сайту.',
            'Eén plek voor personalisatie, aanmelden en beveiliging. Alle wijzigingen verlopen via de bestaande diensten.')}</p>
          <div className='ia-at-hero-lich'><span><Check size={15} />{schrijf(lang, '12 розділів', '12 onderdelen')}</span><span><ShieldCheck size={16} />{schrijf(lang, 'Без зміни прав', 'Rechten blijven gelijk')}</span></div>
        </div>
        <div className='ia-at-hero-kunst' aria-hidden='true'>
          <span className='ia-at-hero-cirkel ia-at-hero-cirkel-een' />
          <span className='ia-at-hero-cirkel ia-at-hero-cirkel-twee' />
          <div className='ia-at-hero-kern'><Settings2 size={60} strokeWidth={1.15} /></div>
          <span className='ia-at-hero-satelliet ia-at-hero-satelliet-een'><Palette size={22} /></span>
          <span className='ia-at-hero-satelliet ia-at-hero-satelliet-twee'><KeyRound size={23} /></span>
          <span className='ia-at-hero-satelliet ia-at-hero-satelliet-drie'><ShieldCheck size={23} /></span>
        </div>
      </header>

      <nav className='ia-at-navigatie' aria-label={schrijf(lang, 'Розділи облікового запису', 'Accountonderdelen')}>
        {IDENTITEIT_TABS.map((tab, index) => {
          const gegevens = ONDERDELEN[tab.id];
          const Symbool = gegevens.symbool;
          return (
            <button key={tab.id} type='button'
              className={`ia-at-nav-knop ia-at-kleur-${gegevens.kleur}${inBeeld === tab.id ? ' actief' : ''}`}
              aria-current={inBeeld === tab.id ? 'true' : undefined}
              onClick={() => kies(tab.id)}>
              <span className='ia-at-nav-symbool'><Symbool size={21} strokeWidth={1.8} /></span>
              <span className='ia-at-nav-naam'>{tab[lang]}</span>
              <span className='ia-at-nav-nr'>{String(index + 1).padStart(2, '0')}</span>
            </button>
          );
        })}
      </nav>

      <div className='ia-secties ia-at-secties'>
        {secties.map((sectie, index) => {
          const id = (sectie.id in ONDERDELEN ? sectie.id : 'personalization') as IdentiteitTab;
          const gegevens = ONDERDELEN[id];
          const openNu = open.has(sectie.id);
          const inhoudId = `${sectieId(sectie.id)}-inhoud`;
          return (
            <section key={sectie.id} id={sectieId(sectie.id)} data-sectie={sectie.id}
              className={`ia-sectie ia-at-sectie ia-at-kleur-${gegevens.kleur}`}
              aria-labelledby={`${sectieId(sectie.id)}-kop`}>
              <div className='ia-at-sectie-top'>
                <div className='ia-at-sectie-verhaal'>
                  <div className='ia-at-sectie-index'><span>{String(index + 1).padStart(2, '0')} / 12</span><span className='ia-at-index-lijn' />{schrijf(lang, 'ВАШІ НАЛАШТУВАННЯ', 'UW INSTELLINGEN')}</div>
                  <h2 id={`${sectieId(sectie.id)}-kop`}>{sectie.titel}</h2>
                  <p>{gegevens[lang]}</p>
                  <button type='button' className='ia-at-openen' aria-expanded={openNu} aria-controls={inhoudId}
                    onClick={() => keerOm(sectie.id)}>
                    {openNu ? schrijf(lang, 'Згорнути налаштування', 'Instellingen sluiten') : schrijf(lang, 'Відкрити налаштування', 'Instellingen openen')}
                    {openNu ? <ChevronUp size={18} /> : <ArrowUpRight size={18} />}
                  </button>
                </div>
                <Kunst id={id} lang={lang} />
              </div>
              <div className='ia-inhoud ia-at-inhoud' id={inhoudId} hidden={!openNu}>
                {sectie.inhoud as ReactNode}
              </div>
            </section>
          );
        })}
      </div>

      <Vooruitzicht lang={lang} />
    </div>
  );
}
