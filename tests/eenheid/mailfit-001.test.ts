// MAILFIT-001 · Visuele en functionele contracten voor een lege inbox.
// Broncontrole; een echte OAuth-sessie of een browser-screenshot is apart vereist.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mailfit-001');
  const component = readFileSync('src/mail/MailOrbitIntro.tsx', 'utf8');
  const css = readFileSync('src/mail/mail-orbit-intro.css', 'utf8');
  const workspace = readFileSync('src/GoogleMailWerkruimte.tsx', 'utf8');

  check('lege inbox behoudt de originele interactieve providerknoppen',
    component.includes("data-mail-orbit-intro={variant}")
    && component.includes('onClick={() => onSelect(a)}')
    && workspace.includes("<MailOrbitIntro lang={lang} variant='inbox'"));
  check('duidelijke desktop-CTA gebruikt dezelfde bestaande koppelroute',
    component.includes('mail-orbit-desktop-hoofdknop')
    && component.includes('onClick={() => onSelect(KOPPELBAAR[0])}'));
  check('onbelangrijke knoppen verdwijnen uitsluitend bij een lege inbox',
    css.includes(".google-mail-workspace:has(.google-mail-orbit[data-mail-account-resolution-empty='true']) > .mail-pagination-selection-dock")
    && css.includes(".google-mail-workspace:has(.google-mail-orbit[data-mail-account-resolution-empty='true']) > .mail-workspace-heading")
    && css.includes(".mail-functional:has(.google-mail-orbit[data-mail-account-resolution-empty='true']) .mail-top-command-bar"));
  check('geen dubbel omkaderde site-in-site bij de lege inbox',
    css.includes(".google-mail-workspace:has(.google-mail-orbit[data-mail-account-resolution-empty='true']){")
    && css.includes('border:0!important;')
    && css.includes('background:transparent!important;'));
  check('desktopkaart past zich aan de beschikbare kolombreedte aan',
    css.includes('grid-template-columns:minmax(290px,.93fr) minmax(440px,1.3fr)')
    && css.includes('@container mail-list (max-width:940px)')
    && css.includes('height:clamp(318px,42dvh,370px)'));
  check('telefoon houdt één duidelijke hoofdactie en geen herhaalde snelcatalogus',
    css.includes('.mail-orbit-intro.is-inbox .mail-orbit-mobiel-snel,')
    && css.includes('grid-area:mobile-action;display:flex')
    && css.includes('padding:5px 0 max(76px,env(safe-area-inset-bottom))'));

  return einde();
}
