// MAILORBIT-001: de nieuwe lege pagina moet een echte koppelweg en dezelfde herstelbare vensters houden.
// Deze broncontroles draaien zonder database, echte Google-login of browser.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { MAIL_AANBIEDERS, mailAanbiederHeeftKnop } from '../../shared/mail-aanbieders';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-orbit-001');
  const bron = (pad: string) => readFileSync(pad, 'utf8');
  const orbit = bron('src/mail/MailOrbitIntro.tsx');
  const css = bron('src/mail/mail-orbit-intro.css');
  const accounts = bron('src/MailAccountsHub.tsx');
  const inbox = bron('src/GoogleMailWerkruimte.tsx');
  const venster = bron('src/platform/VensterHerstel.tsx');
  const modal = bron('src/mail/MailKoppelVenster.tsx');

  const echt = MAIL_AANBIEDERS.filter(mailAanbiederHeeftKnop);
  const nogNiet = MAIL_AANBIEDERS.filter((a) => !mailAanbiederHeeftKnop(a));
  check('zes aanbieders hebben een echte, bestaande actie', echt.length === 6,
    echt.map((a) => a.id).join(', '));
  check('onbeschikbare aanbieders hebben geen verbindingknop', nogNiet.length === 2
    && nogNiet.every((a) => a.wijze === 'nog-niet' && (a.ontbreekt || []).length >= 2));
  check('alle aanbieders komen uit het ene register, nooit uit tweede hardcoded lijst',
    orbit.includes('MAIL_AANBIEDERS.filter(mailAanbiederHeeftKnop)')
    && orbit.includes('MAIL_AANBIEDERS.filter((a) => !mailAanbiederHeeftKnop(a))'));
  check('ieder aanklikbaar merk komt met echt logo en gebruikt onSelect',
    orbit.includes('<Logo id={a.id}') && orbit.includes('onClick={() => onSelect(a)}')
    && orbit.includes('onClick={() => onSelect(actief)}'));
  check('onbeschikbare diensten tonen redenen, niet een schijn-actie',
    orbit.includes('<details key={a.id} data-mail-orbit-onbeschikbaar={a.id}>')
    && orbit.includes('(a.ontbreekt || []).map')
    && !orbit.includes('onClick={() => onSelect(a)}\n                <details'));
  check('het lege accountscherm toont orbit, bestaande accounts blijven beheren',
    accounts.includes("alleKoppelingen.length === 0") && accounts.includes('<MailOrbitIntro lang={lang} onSelect={openen}')
    && accounts.includes("data-mail-accounts-empty='true'")
    && accounts.includes("data-mail-provider-knop='nee'")
    && accounts.includes('mailKoppelenOpenen(a.id'));
  check('de lege inbox toont dezelfde orbit, zonder de site te verlaten',
    inbox.includes("accountResolution==='empty'?<div className='google-mail-orbit'")
    && inbox.includes("variant='inbox'")
    && inbox.includes("onSelect={a=>mailKoppelenOpenen(a.id"));
  check('de bestaande vensterlaag en OAuth/IMAP endpoints blijven intact',
    venster.includes('mailKoppelenOpenen') &&
    modal.includes('/api/owner/mail/google-suite/onboarding/start') &&
    modal.includes('/connect/start') &&
    modal.includes('/api/owner/mail/imap/koppelen'));
  check('zowel Oekraïense als Nederlandse interface en toegankelijke knoppen',
    orbit.includes("lang === 'uk'") && orbit.includes('Уся пошта. Один простір.')
    && orbit.includes('Al uw e-mail. Eén ruimte.')
    && orbit.includes("aria-expanded={catalogus}") && orbit.includes("aria-label={t(")
    && orbit.includes('onFocus={() => setHover(a.id)}'));
  check('catalogus blijft op dezelfde pagina en gebruikt uitsluitend echte aanbieders',
    orbit.includes("hidden={!catalogus}") && orbit.includes('KOPPELBAAR.map((a)')
    && orbit.includes('NIET_KOPPELBAAR.map((a)'));
  check('animatie brengt enveloppen met merkvormen rondom een centrale brief',
    css.includes('@keyframes mail-orbit-aankomst') && css.includes('@keyframes mail-orbit-kern-start')
    && css.includes('mail-orbit-merk-aan') && css.includes('--orbit-x:'));
  check('aanwijzen vergroot het aanbod en toont een detailscherm',
    css.includes('.mail-orbit-dienst:hover') && css.includes('scale(1.16)')
    && orbit.includes("data-mail-orbit-voorbeeld={actief.id}"));
  check('mobiel tot 360 pixels is expliciet ondersteund zonder vaste zijbreedte',
    css.includes('@media(max-width:620px)') && css.includes('@media(max-width:360px)')
    && css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
  check('voorkeur voor minder beweging wordt gerespecteerd',
    css.includes('@media(prefers-reduced-motion:reduce)') && css.includes('animation:none!important'));
  check('privacy en echte IMAP-beperking blijven zichtbaar',
    orbit.includes('Підключення пошти не змінює ваш вхід') &&
    orbit.includes('завантаження листів ще не ввімкнене.'));
  return einde();
}
