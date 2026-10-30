// «Немає опцій підключення пошти — лише всевдо-блоки без реальної можливості підключення» (eigenaar, 20.10.2026).
// Deze test legt vast dat elke tegel van «Підключіть свої поштові акаунти» ÓF naar een echte handeling leidt, ÓF eerlijk
// als «nog niet gebouwd» staat — zonder knop en met de concrete lijst van wat ontbreekt. En: dat een app-wachtwoord
// alleen versleuteld bestaat en nooit in een antwoord kan komen, en dat elke dienst een embleem uit het ENE register heeft.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  MAIL_AANBIEDERS, MAIL_IMAP_AANBIEDERS, MAIL_IMAP_GEHEIME_VELDEN, geldigMailAdres, mailAanbieder,
  mailAanbiederHeeftKnop, mailAanbiederVolledig, mailImapFoutTekst, schoonAppWachtwoord,
} from '../../shared/mail-aanbieders';
import { LOGOS } from '../../src/merk/merk-logos';
import { MERKEN } from '../../src/merk/merk-tabel';
import { merkDef } from '../../src/merk/merk-register';
import { openWithEnvKey, sealWithEnvKey } from '../../server/platform/beveiliging';
import { mailImapAad } from '../../backend/mail-imap';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-koppelen-20261020');
  const bron = (pad: string) => readFileSync(pad, 'utf8');

  // ------------------------------------------------------------------ 1. de acht tegels van het scherm van de eigenaar
  const verwacht = ['gmail', 'outlook', 'icloud', 'ukrnet', 'yahoo', 'onlineua', 'iua', 'proton'];
  check('alle acht diensten van de pagina staan in de ene lijst', verwacht.every((id) => Boolean(mailAanbieder(id))),
    verwacht.filter((id) => !mailAanbieder(id)).join());

  const zonderWeg = MAIL_AANBIEDERS.filter((a) => !mailAanbiederVolledig(a));
  check('elke tegel is volledig: echte weg met host/poort/hulp, of «nog-niet» met een lijst', zonderWeg.length === 0,
    zonderWeg.map((a) => a.id).join());

  const knopZonderWeg = MAIL_AANBIEDERS.filter((a) => mailAanbiederHeeftKnop(a) && a.wijze === 'nog-niet');
  const wegZonderKnop = MAIL_AANBIEDERS.filter((a) => !mailAanbiederHeeftKnop(a) && a.wijze !== 'nog-niet');
  check('geen knop zonder handeling, en geen handeling zonder knop', knopZonderWeg.length === 0 && wegZonderKnop.length === 0);

  const nogNiet = MAIL_AANBIEDERS.filter((a) => a.wijze === 'nog-niet');
  check(`wat niet kan, zegt precies WAT er ontbreekt (${nogNiet.map((a) => a.id).join(', ')})`,
    nogNiet.length > 0 && nogNiet.every((a) => (a.ontbreekt || []).length >= 2 && (a.ontbreekt || []).every((r) => r[0].length > 20 && r[1].length > 20)));

  check('IMAP-diensten hebben een VASTE host (geen veld waarin een binnenadres past)',
    MAIL_IMAP_AANBIEDERS.length >= 4 && MAIL_IMAP_AANBIEDERS.every((a) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(a.imap!.host) && [993, 143].includes(a.imap!.poort) && [465, 587].includes(a.smtp!.poort)),
    MAIL_IMAP_AANBIEDERS.map((a) => `${a.id}:${a.imap?.host}:${a.imap?.poort}`).join(' '));
  check('de app-wachtwoordhulp wijst naar https van de dienst zelf',
    MAIL_IMAP_AANBIEDERS.every((a) => a.hulpAdres!.startsWith('https://') && !a.hulpAdres!.includes('tarasevych')));

  // ------------------------------------------------------------------ 2. de weergave: geen letter in een vierkant meer
  const hub = bron('src/MailAccountsHub.tsx');
  check('de pagina tekent logo\'s uit het register en geen beginletter meer',
    hub.includes('<Logo') && !hub.includes('{p.name[0]}') && !/\{a\.provider\[0\]\}/.test(hub));
  check('de pagina haalt haar diensten uit de ene lijst (geen tweede, hardgecodeerde reeks tegels)',
    hub.includes("from '../shared/mail-aanbieders'") && hub.includes('MAIL_AANBIEDERS.map'));
  check('een tegel zonder handeling is geen knop', hub.includes("data-mail-provider-knop='nee'") && hub.includes('mailAanbiederHeeftKnop'));
  check('het lege vak legt uit wat een koppeling geeft (punt 5)', hub.includes("data-mail-leeg='uitleg'") && !/Ще немає підключених акаунтів<\//.test(hub));

  const post = bron('src/MailFunctioneelWeergave.tsx');
  check('de melding «цей сервіс поки не підключається» is weg: elke tegel opent nu een venster',
    !post.includes('поки не підключається') && post.includes('mailKoppelenOpenen'));
  const venster = bron('src/mail/MailKoppelVenster.tsx');
  check('het koppelvenster gebruikt de bestaande vensterlaag en de bestaande OAuth-paden',
    venster.includes("from '../platform/vensters'") && venster.includes('/api/owner/mail/google-suite/onboarding/start')
    && venster.includes('/connect/start') && venster.includes('/api/owner/mail/imap/koppelen'));

  // ------------------------------------------------------------------ 3. elk merk bestaat in het ENE register
  const zonderMerk = MAIL_AANBIEDERS.filter((a) => !merkDef(a.merk) && !LOGOS[a.merk]);
  check(`elke maildienst heeft een echt embleem (${MAIL_AANBIEDERS.length} diensten)`, zonderMerk.length === 0,
    zonderMerk.map((a) => `${a.id}(${a.merk})`).join());
  check('de drie nieuwe Oekraïense merken staan in de ene merkentabel en nergens anders',
    Boolean(MERKEN.ukrnet && MERKEN.iua && MERKEN.onlineua) && !LOGOS.ukrnet && !LOGOS.iua && !LOGOS.onlineua);

  // ------------------------------------------------------------------ 4. het app-wachtwoord: alleen versleuteld
  const sleutel = 'MAIL_APP_WACHTWOORD_SLEUTEL_V1';
  const vorig = process.env[sleutel];
  process.env[sleutel] = Buffer.alloc(32, 9).toString('base64');
  const wachtwoord = 'abcd-efgh-ijkl-mnop';
  const envelop = sealWithEnvKey(sleutel, wachtwoord, mailImapAad('gebruiker-1', 'rij-1'));
  check('de envelop is AES-256-GCM in de vorm v1.<iv>.<ct>.<tag> en bevat het wachtwoord niet',
    envelop.startsWith('v1.') && envelop.split('.').length === 4 && !envelop.includes(wachtwoord));
  check('alleen met dezelfde rij-AAD te openen', openWithEnvKey(sleutel, envelop, mailImapAad('gebruiker-1', 'rij-1')) === wachtwoord);
  let andereRij = false; let andereRuimte = false; let andereGebruiker = false;
  try { openWithEnvKey(sleutel, envelop, mailImapAad('gebruiker-1', 'rij-2')); } catch { andereRij = true; }
  try { openWithEnvKey(sleutel, envelop, mailImapAad('gebruiker-1', 'rij-1', 'technisch')); } catch { andereRuimte = true; }
  try { openWithEnvKey(sleutel, envelop, mailImapAad('gebruiker-2', 'rij-1')); } catch { andereGebruiker = true; }
  check('een envelop van een andere rij, ruimte of gebruiker is niet te openen', andereRij && andereRuimte && andereGebruiker);
  if (vorig === undefined) delete process.env[sleutel]; else process.env[sleutel] = vorig;

  const imapBron = bron('backend/mail-imap.ts');
  const selects = [...imapBron.matchAll(/SELECT ([^`]*?) FROM app\.mail_imap_koppeling/g)].map((m) => m[1]);
  check('de lijst voor de pagina vraagt het geheim niet eens op', selects.length > 0 && !selects[0].includes('geheim'), selects.join(' | '));
  check('het antwoord wordt uit vaste velden gebouwd, dus het geheim kan er niet in',
    imapBron.includes('const publiek = (rij: Record<string, unknown>)') && MAIL_IMAP_GEHEIME_VELDEN.every((veld) => !new RegExp(`${veld}:`).test(imapBron.slice(imapBron.indexOf('const publiek'), imapBron.indexOf('export async function mailImapLijst')))));
  check('de route geeft nooit een wachtwoordveld terug', !/json\(\{[^}]*wachtwoord/.test(imapBron));

  const migratie = bron('migrations/0089_mail_imap_en_vensters.sql');
  check('de database laat alleen een envelop toe (platte tekst kan er niet in)',
    /geheim\s+text\s+NOT NULL CHECK \(geheim ~ '\^v1\\\.'\)/.test(migratie) && migratie.includes('ENABLE ROW LEVEL SECURITY'));
  check('de koppeltabel heeft geen host-kolom: de host komt uit de vaste lijst', !/\bhost\b/.test(migratie.split('CREATE TABLE IF NOT EXISTS app.venster_stand')[0]));

  // ------------------------------------------------------------------ 5. kleine, zuivere hulpjes
  check('adres: alleen een gewoon e-mailadres, klein geschreven',
    geldigMailAdres(' eigenaar@example.test ') === 'eigenaar@example.test' && !geldigMailAdres('geen-adres') && !geldigMailAdres(`${'a'.repeat(330)}@x.nl`));
  check('app-wachtwoord: de groepjes van vier van Apple/Yahoo mogen met spaties ingetypt worden',
    schoonAppWachtwoord(' abcd efgh ijkl mnop ') === 'abcdefghijklmnop');
  check('elke foutcode heeft een mensentekst in beide talen',
    mailImapFoutTekst('MAIL_IMAP_AANMELDEN_GEWEIGERD', 'uk').includes('пароль') && mailImapFoutTekst('MAIL_IMAP_AANMELDEN_GEWEIGERD', 'nl').includes('app-wachtwoord')
    && mailImapFoutTekst('ONBEKENDE_CODE', 'nl').length > 5);

  return einde();
}
