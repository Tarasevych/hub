// LOGIN-001 / INTEG-001 — «Інші способи входу» op de afgemelde pagina: een uitklapbare lijst met GitHub, Apple, Microsoft en passkey
// (volgorde en woorden van de eigenaar, 03.11.2026). Google staat hier NIET: dat is de hoofdknop erboven.
//
// EERLIJK, nagekeken in de code van 03.11.2026 — vandaag geeft de server ALLEEN via Google een sessie uit:
//   • GitHub: backend/github-oauth.ts koppelt GitHub na het aanmelden als DIENST (repositories, token in de kluis); een aanmeldweg
//     «увійти через GitHub» bestaat niet;
//   • Apple en Microsoft: backend/aanmeld-koppel.ts heeft de volledige OAuth-contour, maar KOPPELT de identiteit alleen aan een al
//     ingelogd account als extra aanmeldweg en geeft «GEEN sessies uit» (zie de kop van dat bestand); bovendien pas met de sleutels
//     van de eigenaar (AANMELD_APPLE_* / AANMELD_MICROSOFT_*) en een geslaagde zelftest;
//   • passkey: backend/toegangssleutels.ts — een passkey bevestigt gevoelige acties ná het aanmelden; «inloggen zonder Google met
//     alleen een passkey kan (nog) NIET» (RUNBOOK-VEILIGE-UITROL.md §13).
// Daarom staat elke optie hier als UITGESCHAKELDE knop met de reden eronder, nooit als een knop die stil niets doet of een verzonnen
// aanmelding. Gaat een weg later echt werken, dan zet men `beschikbaar` op true en geeft men `onKies` mee — de weergave is klaar.
// Logo's: GitHub en Apple uit het merkregister (simple-icons, CC0), Microsoft het officiële bestand (src/merk/officieel); voor
// passkey bestaat in de open pakketten van de site geen merklogo — dan een neutraal pictogram (vingerafdruk), niets nagetekend.
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, Fingerprint } from 'lucide-react';
import Merk from './merk/Merk';

type Lang = 'uk' | 'nl';
type T2 = readonly [uk: string, nl: string];
export type AanmeldIngang = {
  id: 'github' | 'apple' | 'microsoft' | 'passkey';
  /** Merksleutel voor <Merk>; leeg = geen merklogo (passkey). */
  merk: string;
  titel: T2;
  /** Waarom de weg nu (niet) werkt — staat altijd zichtbaar onder de titel. */
  reden: T2;
  beschikbaar: boolean;
};

const NIET_BESCHIKBAAR: T2 = ['Недоступно', 'Niet beschikbaar'];

/** De vier wegen, in de volgorde van de eigenaar. Puur gegeven: de eenheidstest leest deze lijst. */
export const AANMELD_INGANGEN: readonly AanmeldIngang[] = Object.freeze([
  {
    id: 'github', merk: 'github', titel: ['Увійти через GitHub', 'Aanmelden met GitHub'], beschikbaar: false,
    reden: ['Сервер не видає вхід через GitHub: GitHub підключається лише після входу — як служба для репозиторіїв.',
      'De server kent geen aanmelding met GitHub: GitHub wordt pas na het aanmelden gekoppeld, als dienst voor repositories.'],
  },
  {
    id: 'apple', merk: 'apple', titel: ['Увійти через Apple', 'Aanmelden met Apple'], beschikbaar: false,
    reden: ['Ще не працює для входу: Apple ID можна лише прив’язати до вже відкритого облікового запису, коли власник сервера додасть ключі Apple.',
      'Werkt nog niet voor aanmelden: een Apple ID kan alleen aan een al geopend account worden gekoppeld, zodra de servereigenaar de Apple-sleutels zet.'],
  },
  {
    id: 'microsoft', merk: 'microsoft', titel: ['Увійти через Microsoft', 'Aanmelden met Microsoft'], beschikbaar: false,
    reden: ['Ще не працює для входу: обліковий запис Microsoft можна лише прив’язати до вже відкритого облікового запису, коли власник сервера додасть ключі Microsoft.',
      'Werkt nog niet voor aanmelden: een Microsoft-account kan alleen aan een al geopend account worden gekoppeld, zodra de servereigenaar de Microsoft-sleutels zet.'],
  },
  {
    id: 'passkey', merk: '',
    // Dezelfde woorden als de bevestigingsstap (src/platform/bevestig-toegang.tsx) en als de eigenaar ze vroeg.
    titel: ['Підтвердіть відбитком, обличчям, PIN-кодом або телефоном, на якому збережено ключ доступу', 'Bevestig met vingerafdruk, gezicht, pincode of de telefoon waarop de toegangssleutel staat'],
    beschikbaar: false,
    reden: ['Вхід лише з ключем доступу ще не працює. Зараз ключ доступу підтверджує важливі дії після входу через Google; додати його можна в «Способи входу».',
      'Aanmelden met alleen een toegangssleutel werkt nog niet. Nu bevestigt een toegangssleutel belangrijke acties na het aanmelden met Google; toevoegen kan bij «Aanmeldmethoden».'],
  },
]);

/** standaardOpen: alleen voor een weergave die meteen uitgeklapt moet zijn (eenheidstest met react-dom/server). */
/**
 * AANMELD-PLAATSING v1: `ids` = welke methoden de beheerder hier zet, in zijn volgorde (zonder `ids`: alle vier, zoals vroeger);
 * `extra` = werkende methoden die de beheerder naar deze lijst verplaatste (Google, Telegram) als kant-en-klare knop. Is de lijst
 * leeg, dan verschijnt de knop «Інші способи входу» niet.
 */
export default function AanmeldAndereOpties({ lang, onKies, standaardOpen = false, ids, extra = {} }: { lang: Lang; onKies?: (id: AanmeldIngang['id']) => void; standaardOpen?: boolean; ids?: readonly string[]; extra?: Record<string, ReactNode> }) {
  const [open, setOpen] = useState(standaardOpen);
  const volgorde: readonly string[] = ids ?? AANMELD_INGANGEN.map((o) => o.id);
  const items = volgorde.filter((id) => extra[id] || AANMELD_INGANGEN.some((o) => o.id === id));
  const basis = `mr-andere-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const t = (p: T2) => (lang === 'uk' ? p[0] : p[1]);
  if (!items.length) return null;
  return (
    <div className='mr-sign-in-andere'>
      <button type='button' className='mr-sign-in-alternative' aria-expanded={open} aria-controls={`${basis}-lijst`} onClick={() => setOpen((v) => !v)}>
        <span>{lang === 'uk' ? 'Інші способи входу' : 'Andere aanmeldmethoden'}</span>
        <ChevronDown className='mr-sign-in-alt-pijl' aria-hidden='true' />
      </button>
      {open && (
        <ul id={`${basis}-lijst`} className='mr-sign-in-opties' aria-label={lang === 'uk' ? 'Інші способи входу' : 'Andere aanmeldmethoden'}>
          {items.map((id) => {
            if (extra[id]) return <li key={id} data-aanmeld-ingang={id}>{extra[id]}</li>;
            const o = AANMELD_INGANGEN.find((x) => x.id === id) as AanmeldIngang;
            const werkt = o.beschikbaar && !!onKies;
            return (
              <li key={o.id}>
                <button
                  type='button'
                  className={`mr-sign-in-optie${werkt ? '' : ' is-uit'}`}
                  data-aanmeld-ingang={o.id}
                  disabled={!werkt}
                  aria-describedby={`${basis}-${o.id}`}
                  onClick={werkt ? () => onKies?.(o.id) : undefined}
                >
                  <span className='mr-sign-in-optie-logo' aria-hidden='true'>
                    {o.merk ? <Merk merk={o.merk} vorm='gliefje' maat={20} terugval={null} /> : <Fingerprint />}
                  </span>
                  <span className='mr-sign-in-optie-tekst'>
                    <strong>{t(o.titel)}</strong>
                    <small id={`${basis}-${o.id}`}>{t(o.reden)}</small>
                  </span>
                  {werkt ? null : <em className='mr-sign-in-optie-stand'>{t(NIET_BESCHIKBAAR)}</em>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
