// MAILPOLISH-001 · Broncontroles voor de ontwerptrouw van de echte koppelvensters.
// Geen externe OAuth, mailboxinhoud of persoonsgegevens nodig.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mailpolish-001');
  const bron = (pad: string) => readFileSync(pad, 'utf8');
  const modal = bron('src/mail/MailKoppelVenster.tsx');
  const sheet = bron('src/mail/mail-koppel-mobiel-sheet.css');
  const orbit = bron('src/mail/MailOrbitIntro.tsx');
  const orbitCss = bron('src/mail/mail-orbit-intro.css');

  check('het mobiele koppelvenster volgt de inhoud; geen geforceerde 74dvh-witte leegte',
    sheet.includes('height:fit-content!important')
    && sheet.includes('flex:0 1 auto')
    && !sheet.includes('height:min(74dvh'));
  check('het globale vensterbeheer blijft echt, met minimaliseren en sluiten',
    modal.includes('<Venster id={id}') && modal.includes('className=\'mail-koppel-mobile-sheet\'')
    && modal.includes('onSluit={onSluit}') && sheet.includes('.venster-knoppen button'));
  check('zichtbaar merk, ontworpen titel en ondertitel per aanbieder',
    modal.includes('className=\'mail-koppel-hero\'') && modal.includes('<Logo id={dienst.id}')
    && modal.includes('Безпечне підключення через Google'));
  check('Google toont twee feitelijke veiligheidswaarheden, geen onjuiste claim over leesrechten',
    modal.includes('Вхід на стороні Google') && modal.includes('Ваш пароль залишається у Google')
    && !modal.includes('не маємо доступу до ваших листів'));
  check('hoofdmailbox en extra Google-account blijven twee echte verschillende acties',
    modal.includes("googleStarten('primary')") && modal.includes("googleStarten('additional')")
    && modal.includes("data-mail-google-start='primary'") && modal.includes("data-mail-google-start='additional'"));
  check('Google en Microsoft behouden hun echte bestaande OAuth-routes',
    modal.includes('/api/owner/mail/google-suite/onboarding/start')
    && modal.includes('/connect/start')
    && modal.includes('mail-koppel-hoofdactie'));
  check('IMAP houdt wachtwoordverwijdering, servercontrole en herstel',
    modal.includes("setWachtwoord('')")
    && modal.includes('/api/owner/mail/imap/koppelen')
    && modal.includes('wachtwoord-opnieuw'));
  check('een echte terugknop sluit het venster en brengt de gebruiker naar de aanbieders',
    modal.includes('className=\'mail-koppel-terug\' onClick={onSluit}')
    && modal.includes('Обрати інший сервіс'));
  check('de zwevende envelop toont het geselecteerde echte merkembleem, geen generieke letter',
    orbit.includes('<Logo id={hoofdDienst.id}') && orbit.includes('mail-orbit-lichtpunten')
    && orbit.includes('onClick={() => onSelect(a)}'));
  check('responsief, veilig voor de dockrand, donkere thema en verminderde beweging',
    sheet.includes('var(--venster-dok-onder,0px)')
    && sheet.includes('@media(max-width:360px)')
    && sheet.includes('prefers-reduced-motion:reduce')
    && orbitCss.includes('@media(max-width:360px)')
    && orbitCss.includes('mail-orbit-lichtpunten'));
  return einde();
}
