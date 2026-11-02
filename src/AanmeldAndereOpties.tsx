// LOGIN-001 — «Інші способи входу» op de afgemelde pagina: een uitklapbare lijst met merklogo's (Google, Apple, Microsoft, GitHub,
// passkey). Eerlijk: alleen Google is nu echt bruikbaar; de andere staan er met hun echte stand bij (sleutels van de eigenaar nodig,
// gepland, of pas na aanmelden). Geen knop die stil niets doet. Logo's komen uit het merkregister (src/merk/Merk.tsx), niet uit eigen tekenwerk.
import { useId, useState } from 'react';
import { ChevronDown, KeyRound } from 'lucide-react';
import Merk from './merk/Merk';
import { AANBIEDER_STAND_LABEL } from '../shared/aanmeld-vnext-model';

type Lang = 'uk' | 'nl';
type Optie = {
  id: string;
  naam: string;
  /** Merksleutel voor Merk; leeg = geen merk (passkey is geen merk, dus een gewoon pictogram). */
  merk: string;
  uitleg: readonly [string, string];
  /** Stand (tweetalig). Weg = de optie werkt nu. */
  stand?: readonly [string, string];
  actief: boolean;
};

// Tekst van de passkey-uitleg: dezelfde woorden als in de bevestigingsstap (src/platform/bevestig-toegang.tsx).
const PASSKEY_UITLEG: readonly [string, string] = [
  'Підтвердіть відбитком, обличчям, PIN-кодом або телефоном, на якому збережено passkey.',
  'Bevestig met vingerafdruk, gezicht, pincode of de telefoon waarop de passkey staat.',
];

const OPTIES: readonly Optie[] = [
  { id: 'google', naam: 'Google', merk: 'google', uitleg: ['Ваш обліковий запис Google. Адресу змінюєте лише в Google.', 'Uw Google-account. Een adres wijzigt u alleen bij Google.'], actief: true },
  { id: 'apple', naam: 'Apple', merk: 'apple', uitleg: ['Вхід з Apple ID.', 'Aanmelden met Apple ID.'], stand: AANBIEDER_STAND_LABEL['sleutels-nodig'], actief: false },
  { id: 'microsoft', naam: 'Microsoft', merk: 'microsoft', uitleg: ['Вхід з обліковим записом Microsoft.', 'Aanmelden met een Microsoft-account.'], stand: AANBIEDER_STAND_LABEL['sleutels-nodig'], actief: false },
  { id: 'github', naam: 'GitHub', merk: 'github', uitleg: ['Вхід з обліковим записом GitHub.', 'Aanmelden met een GitHub-account.'], stand: AANBIEDER_STAND_LABEL.gepland, actief: false },
  { id: 'passkey', naam: 'Passkey', merk: '', uitleg: PASSKEY_UITLEG, stand: ['Після входу: додайте passkey у налаштуваннях доступу', 'Na aanmelden: voeg een passkey toe bij de toegangsinstellingen'], actief: false },
];

export default function AanmeldAndereOpties({ lang, onGoogle }: { lang: Lang; onGoogle: () => void }) {
  const [open, setOpen] = useState(false);
  const basis = `mr-andere-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <div className='mr-sign-in-andere'>
      <button type='button' className='mr-sign-in-alternative' aria-expanded={open} aria-controls={`${basis}-lijst`} onClick={() => setOpen((v) => !v)}>
        <span>{lang === 'uk' ? 'Інші способи входу' : 'Andere aanmeldmethoden'}</span>
        <ChevronDown className='mr-sign-in-alt-pijl' aria-hidden='true' />
      </button>
      {open && (
        <ul id={`${basis}-lijst`} className='mr-sign-in-opties' aria-label={lang === 'uk' ? 'Способи входу' : 'Aanmeldmethoden'}>
          {OPTIES.map((o) => {
            const uitleg = lang === 'uk' ? o.uitleg[0] : o.uitleg[1];
            const stand = o.stand ? (lang === 'uk' ? o.stand[0] : o.stand[1]) : '';
            return (
              <li key={o.id}>
                <button
                  type='button'
                  className={`mr-sign-in-optie${o.actief ? '' : ' is-uit'}`}
                  disabled={!o.actief}
                  aria-describedby={`${basis}-${o.id}`}
                  onClick={o.actief ? onGoogle : undefined}
                >
                  <span className='mr-sign-in-optie-logo' aria-hidden='true'>
                    {o.merk ? <Merk merk={o.merk} vorm='gliefje' maat={22} terugval={null} /> : <KeyRound />}
                  </span>
                  <span className='mr-sign-in-optie-tekst'>
                    <strong>{o.naam}</strong>
                    <small id={`${basis}-${o.id}`}>
                      {uitleg}
                      {stand ? <em>{stand}</em> : null}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
