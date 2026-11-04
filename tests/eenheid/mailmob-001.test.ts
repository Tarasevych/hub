// MAILMOB-001 · mobiele e-mail op 320–620px + veilige 12-uurs-step-up.
// Zonder databases, OAuth-gegevens of echte gebruikersdata.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { actieVoorPad } from '../../shared/stap-op-acties';
import { onthoudMagVoorPad } from '../../backend/stap-op';

export async function main(): Promise<number> {
  const { check, einde } = checker('mailmob-001');
  const lees = (p: string) => readFileSync(p, 'utf8');
  const orbit = lees('src/mail/MailOrbitIntro.tsx');
  const stijl = lees('src/mail/mail-orbit-intro.css');
  const modal = lees('src/mail/MailKoppelVenster.tsx');
  const sheet = lees('src/mail/mail-koppel-mobile-sheet.css');
  const passCss = lees('src/platform/bevestig-toegang.css');
  const client = lees('src/platform/stap-op.ts');
  const ui = lees('src/platform/bevestig-toegang.tsx');
  const server = lees('backend/stap-op.ts');
  const passkey = lees('backend/toegangssleutels.ts');

  check('mobiel: de baan en centrale envelop blijven zichtbaar', stijl.includes('.mail-orbit-baan,.mail-orbit-kern{display:block}'));
  check('mobiel: zes merkomslagen hebben absolute posities', stijl.includes('.mail-orbit-positie{position:absolute') && stijl.includes("data-mail-orbit-provider='iua'"));
  check('mobiel: het rooster is compact en bevat minimaal 44px aanraakdoelen',
    stijl.includes('grid-template-columns:repeat(2,minmax(0,1fr))') && stijl.includes('min-height:57px'));
  check('mobiel: een echt hoofdknop koppelt de geselecteerde dienst', orbit.includes('className=\'mail-orbit-mobiel-hoofdknop\'') && orbit.includes('onClick={() => onSelect(hoofdDienst)}'));
  check('mobiel: snelle serviceknoppen gebruiken hetzelfde aanbodregister en echte actie',
    orbit.includes('KOPPELBAAR.slice(0, 4).map') && orbit.includes('onClick={() => onSelect(a)}'));
  check('mobiel: geen knop voor niet-beschikbare diensten', orbit.includes('NIET_KOPPELBAAR.map') && orbit.includes("a.wijze") === false);
  check('mobiel: scherm past ook tot 360 pixels', stijl.includes('@media(max-width:360px)') && stijl.includes('min-width:0'));
  check('mobiel: verminderde beweging respecteren', stijl.includes('prefers-reduced-motion:reduce'));
  check('mobiel: koppeling gebruikt een echte gedeelde popup als onderpaneel', modal.includes("className='mail-koppel-mobile-sheet'") && sheet.includes('.venster.mail-koppel-mobile-sheet.is-max'));
  check('mobiel: de kritieke Passkey popup is geen schermvullend raam', passCss.includes('.venster.bevestig-toegang-venster.is-max') && passCss.includes('height:auto!important'));

  check('onthouden: client en backend gebruiken dezelfde route-functie',
    client.includes("import { actieVoorPad } from '../../shared/stap-op-acties'") && server.includes("import { actieVoorPad } from '../shared/stap-op-acties'"));
  check('onthouden: onbekend pad is veilig niet onthoudbaar',
    actieVoorPad('/api/owner/email/onbekende/actie') === 'onbekend' && !onthoudMagVoorPad('/api/owner/email/onbekende/actie'));
  check('onthouden: gewone bekende activering wel onthoudbaar',
    actieVoorPad('/api/owner/tech/activeren') === 'bevestigen' && onthoudMagVoorPad('/api/owner/tech/activeren'));
  check('onthouden: vertrouwde agent-actie wel onthoudbaar', actieVoorPad('/api/owner/mcp-connector/consent') === 'agenten' && onthoudMagVoorPad('/api/owner/mcp-connector/consent'));
  check('onthouden: uitrol, wachtwoord en herstel blijven beschermd',
    !onthoudMagVoorPad('/api/owner/uitrol/goedkeuren')
    && !onthoudMagVoorPad('/api/owner/access/password')
    && !onthoudMagVoorPad('/api/owner/access/recovery/rotate'));
  check('onthouden: kluis, SSH, terminal en onbekende API blijven beschermd',
    !onthoudMagVoorPad('/api/owner/vault/geheim')
    && !onthoudMagVoorPad('/api/owner/ssh-ca/uitgeven')
    && !onthoudMagVoorPad('/api/owner/terminal/start'));
  check('onthouden: bij onbekende route geen misleidend 12-uurs-vinkje', client.includes("actieVoorUrl = actieVoorPad") && ui.includes("actie: opties.actie || 'onbekend'"));
  check('onthouden: Passkey-resultaat bevestigt afzonderlijk het serverveld onthouden',
    client.includes("antwoord?.data?.onthouden !== true ? 'ONTHOUD_NIET_OPGESLAGEN'") && passkey.includes('onthouden: onthoudTot > 0'));
  check('onthouden: TOTP-resultaat controleert onthouden en meldt mislukte opslag',
    ui.includes("antwoord?.data?.onthouden !== true) meldOnthoudMislukt()"));
  check('onthouden: falen van geheugen bewaart wel geslaagde 5-minuten-Step-up',
    ui.includes("f === 'ONTHOUD_NIET_OPGESLAGEN'") && ui.includes("klaar({ ok: true, methode: 'passkey' })"));
  check('onthouden: codewoord toont geen niet-werkend 12-uurs-vinkje',
    ui.includes("weergave !== 'codewoord'") && ui.includes("t('onthoudCodewoord')"));
  check('onthouden: terugkeer van Google checkt echte opslag op de server', client.includes("antwoord?.data?.onthouden === true"));
  return einde();
}
