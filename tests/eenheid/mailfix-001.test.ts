// MAILFIX-001 · Regressies uit de echte Android-schermen van 04.11.2026.
// Dit controleert broncontracten. Het bewijst GEEN Google OAuth-consent op een echte telefoon;
// daarvoor is de eigenaarssessie en de echte callbackreden nodig.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mailfix-001');
  const source = (path: string) => readFileSync(path, 'utf8');
  const css = source('src/mailfix-001-accounts.css');
  const page = source('src/MailFunctioneelWeergave.tsx');
  const callback = source('src/EigenaarIdentiteitTerug.tsx');
  const koppel = source('src/mail/MailKoppelVenster.tsx');

  check('de tweede strook verdwijnt alleen wanneer de echte lege orbit zichtbaar is',
    css.includes(":has([data-mail-accounts-empty='true']) > .is2")
    && page.includes('<IntegratieStrook dienst=\'mail\'/>')
    && css.includes('.mail-functional:has'));
  check('catalogus en dienstkeuze blijven aanwezig in de originele interactieve orbit',
    source('src/mail/MailOrbitIntro.tsx').includes('mail-orbit-catalogus')
    && source('src/mail/MailOrbitIntro.tsx').includes('mail-orbit-mobiel-snel'));
  check('de drie mobiele kaders stapelen geen 28px padding of dubbele kaarten meer',
    css.includes('max-width: 620px')
    && css.includes('padding: 0;')
    && css.includes('box-shadow: none;')
    && css.includes('.mail-accounts-orbit-mode .mail-orbit-intro'));
  check('de accountbeheer-intro wordt alleen bij een lege orbit visueel samengevoegd',
    css.includes(".mail-account-intro")
    && css.includes(":has([data-mail-accounts-empty='true'])"));
  check('Google-status wordt niet langer gefabriceerd als een API-opvraag mislukt',
    koppel.includes('setGoogleStand(null); setGoogleStandFout')
    && !koppel.includes("setGoogleStand({ accounts: [], sessionEmail: '', connectEnabled: true })"));
  check('de Google-knop is niet beschikbaar voordat de echte accountstatus bekend is',
    koppel.includes('if (!googleStand || googleStand.connectEnabled === false) return;')
    && koppel.includes('!googleStand.connectEnabled ?'));
  check('een fout in de accountopvraag heeft een echte herstelactie',
    koppel.includes('setGoogleStandHerlaad((v) => v + 1)'));
  check('de OAuth-callback toont een veilige foutcode zonder state of autorisatiecode',
    callback.includes('veiligeFoutcode')
    && callback.includes('{diagnostic.code}</code>')
    && !callback.includes('<code>{state}</code>')
    && !callback.includes('<code>{code}</code>'));
  check('de terugknop na een mislukte Gmail-toestemming wijst naar Mail Accounts',
    callback.includes("suiteState?'https://mail.tarasevych.com/accounts'"));
  check('een tijdelijke netwerk-/gatewayfout wordt beperkt herhaald op dezelfde OAuth-state',
    callback.includes("attempt<2&&(reason==='NETWORK_ERROR'||['502','503','504'].includes(status))"));
  check('browserbinding, tokenwisseling en ontbrekend OAuth-materiaal hebben concrete verklaringen',
    ['GOOGLE_SUITE_BROWSER_BINDING_MISMATCH', 'GOOGLE_SUITE_TOKEN_EXCHANGE_REJECTED', 'GOOGLE_SUITE_OAUTH_MATERIAL_MISSING']
      .every((code) => callback.includes(code)));
  check('de Google-tokenstroom blijft strikt beveiligd en de PKCE-callback bestaat ongewijzigd',
    source('backend/google-suite-inrichting.ts').includes("koppelBindingKlopt(event, 'gsuite'")
    && source('backend/google-suite-inrichting.ts').includes('code_verifier: material.verifier')
    && callback.includes("'/api/owner/google-suite/callback'"));
  return einde();
}
