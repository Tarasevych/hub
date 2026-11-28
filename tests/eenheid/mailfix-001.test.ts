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

  // MAILACC-002 (15.11.2026): de strook «Що можна підключити тут» dubbelde ook bij gekoppelde accounts de orbit eronder —
  // op het tabblad «accounts» staat ze nu helemaal niet meer; de orbit is de enige catalogus.
  check('op «Поштові облікові записи» staat geen tweede strook «Що можна підключити тут» naast de orbit',
    !page.includes('<IntegratieStrook dienst=\'mail\'/>') && !page.includes('IntegratieStrook')
    && page.includes("if(tab==='accounts')body=accountView;"));
  // MAILHOEK-001: de afgeronde paginakaart mag na het laden niet meer platgemaakt worden (rechte hoeken op de telefoon).
  check('MAILHOEK-001: met accounts één afgeronde kaart vóór én na het laden, de orbit erin zonder tweede kader',
    !css.includes(".mail-provider-view:has([data-mail-accounts-orbit='ja']) {")
    && css.includes(".mail-functional .mail-provider-view:has(.mail-accounts-met-orbit),")
    && css.includes(".mail-functional .mail-provider-view:has([data-mail-accounts-laden='ja']) {")
    && /has\(\[data-mail-accounts-laden='ja'\]\) \{\s*padding: 0;\s*border-radius: var\(--straal-l, 16px\);\s*overflow: hidden;/.test(css)
    && css.includes('.mail-provider-view .mail-accounts-met-orbit .mail-orbit-intro {'));
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
