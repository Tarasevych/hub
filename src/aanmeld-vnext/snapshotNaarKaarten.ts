// UI-015 — snapshotNaarKaarten: de PURE mapper van het echte /api/owner/access/snapshot naar de methodekaarten (dossier §5,
// §8.3). Geen React, geen client-import, geen zijeffecten — zodat de node-tests hem direct kunnen draaien en elke staat
// bewijsbaar uit de server komt. Regels die hier vastliggen:
//   • niets wordt verzonnen: geen teller zonder API-getal, geen datum zonder serverwaarde, geen «актив» zonder binding;
//   • «password» bestaat alleen als de server zegt dat hij geconfigureerd/gebonden is (dossier §1.1);
//   • een onbekende serverstatus wordt eerlijk 'unknown' («Не вдалося перевірити») met hoofdactie 'retry';
//   • de kluis en de toegangscodes houden hun eigen levende staat in hun eigen secties — de kaart zegt dat eerlijk en
//     stuurt naar de details, in plaats van een verzonnen badge te tonen.
import type { Tweetalig } from '../../shared/cloud-vnext-model';
import { AANMELD_GROEPEN, type AanmeldGroep, type MethodeStaat, type MethodeUi } from '../../shared/aanmeld-vnext-model';

// Structureel dezelfde vormen als in src/ToegangslaagWeergave.tsx (de controller exporteert zijn Snapshot-type niet).
export type MethodeRij = { id: string; enabled: boolean; configured: boolean; bound?: boolean; status: string };
export type FactorRij = { id: string; enabled: boolean; enrolled: boolean; status: string; remaining?: number; count?: number; createdAt?: number; bekekenOp?: number };
export type BindingRij = { id: string; method: string; email: string; status: string };
export type SnapshotLike = {
  methods: MethodeRij[];
  factors: FactorRij[];
  bindings: BindingRij[];
  lockout: { protected: boolean; reason: string };
  password: { configured: boolean; mustChange: boolean };
  totp: { enrolled: boolean };
};

const BEKENDE_STATUSSEN = new Set(['loading', 'active', 'ready', 'not_configured', 'disabled', 'not_enrolled']);
const stilleStaat = (status: string, alsKlaar: MethodeStaat): MethodeStaat =>
  status === 'loading' ? 'loading' : BEKENDE_STATUSSEN.has(status) ? alsKlaar : 'unknown';

const T = (uk: string, nl: string): Tweetalig => [uk, nl] as unknown as Tweetalig;

/** De kaarten in paginavolgorde. Elke waarde komt rechtstreeks uit de snapshot; zie de bestandskop voor de regels. */
export function snapshotNaarKaarten(data: SnapshotLike): MethodeUi[] {
  const uit: MethodeUi[] = [];
  const google = data.methods.find((m) => m.id === 'google');
  const binding = data.bindings.find((b) => b.method === 'google');
  const factor = (id: string) => data.factors.find((f) => f.id === id);

  if (google) {
    const laadt = google.status === 'loading';
    const actief = Boolean(google.bound || binding);
    const staat: MethodeStaat = laadt ? 'loading' : actief ? 'active' : google.configured ? 'ready' : stilleStaat(google.status, 'not-configured');
    uit.push({
      id: 'google', titel: T('Електронна пошта та Google', 'E-mail en Google'),
      ondertitel: T('Вхід через пов’язаний Google-акаунт', 'Aanmelden met het gekoppelde Google-account'),
      icoon: 'google', staat, hoofdActie: staat === 'unknown' ? 'retry' : staat === 'not-configured' ? 'details' : 'manage',
      vermogen: 'sign-in',
      ...(binding?.email ? { accountLabel: binding.email } : {}),
      ...(data.lockout.protected ? { beschermd: true, staatReden: T('Єдиний спосіб входу — захищено від вимкнення', 'Enige aanmeldmethode — beschermd tegen uitschakelen') } : {}),
    });
  }

  const wachtwoord = data.methods.find((m) => m.id === 'password');
  if (wachtwoord && (wachtwoord.bound || data.password.configured)) {
    const staat: MethodeStaat = wachtwoord.status === 'loading' ? 'loading' : data.password.mustChange ? 'attention' : 'active';
    uit.push({
      id: 'password', titel: T('Пароль', 'Wachtwoord'), ondertitel: T('Додатковий вхід із паролем', 'Extra aanmelding met een wachtwoord'),
      icoon: 'password', staat, hoofdActie: staat === 'loading' ? 'none' : 'manage', vermogen: 'sign-in',
      ...(data.password.mustChange ? { staatReden: T('Тимчасовий пароль — потрібно змінити', 'Tijdelijk wachtwoord — wijzigen vereist'), waarschuwingCode: 'PASSWORD_MUST_CHANGE' } : {}),
    });
  }

  const passkey = factor('passkey');
  if (passkey) {
    const staat = stilleStaat(passkey.status, passkey.enrolled ? 'active' : 'not-configured');
    uit.push({
      id: 'passkey', titel: T('Passkey', 'Passkey'),
      ondertitel: data.lockout.protected
        ? T('Підтверджує важливі дії; вхід — коли способів стане більше', 'Bevestigt belangrijke acties; aanmelden zodra er meer methoden zijn')
        : T('Вхід без пароля — відбиток, обличчя або PIN', 'Aanmelden zonder wachtwoord — vingerafdruk, gezicht of pin'),
      icoon: 'passkey', staat, hoofdActie: staat === 'unknown' ? 'retry' : staat === 'active' ? 'manage' : 'setup',
      vermogen: data.lockout.protected ? 'step-up' : 'sign-in',
      ...(typeof passkey.count === 'number' && passkey.enrolled ? { teller: passkey.count } : {}),
    });
  }

  const totp = factor('totp');
  if (totp) {
    const staat = stilleStaat(totp.status, totp.enrolled ? 'active' : 'not-configured');
    uit.push({
      id: 'totp', titel: T('Застосунок-автентифікатор', 'Authenticator-app'),
      ondertitel: totp.enrolled ? T('Коди з вашого застосунку', 'Codes uit uw app') : T('Коди з телефону, без SMS', 'Codes op uw telefoon, zonder sms'),
      icoon: 'totp', staat, hoofdActie: staat === 'unknown' ? 'retry' : staat === 'active' ? 'manage' : 'setup', vermogen: 'step-up',
    });
  }

  const herstel = factor('recovery');
  if (herstel) {
    // IDENTITEIT-014 (давня вада): сервер ставить enrolled:false, щойно remaining===0 (backend/toegangslaag.ts, snapshot), тож «коди
    // закінчилися» ніколи не показувалось — використаний набір виглядав як «не налаштовано». Набір був, якщо є createdAt.
    // De server zet enrolled:false zodra remaining 0 is; een opgebruikte set herken je aan createdAt.
    const leeg = Number(herstel.remaining) === 0 && (herstel.enrolled || Number(herstel.createdAt) > 0);
    const staat: MethodeStaat = herstel.status === 'loading' ? 'loading' : leeg ? 'attention' : stilleStaat(herstel.status, herstel.enrolled ? 'active' : 'not-configured');
    uit.push({
      id: 'recovery', titel: T('Коди відновлення', 'Herstelcodes'),
      ondertitel: T('Резервний доступ, коли інші засоби недоступні', 'Reservetoegang wanneer andere middelen niet werken'),
      icoon: 'recovery', staat, hoofdActie: staat === 'unknown' ? 'retry' : herstel.enrolled || leeg ? 'manage' : 'setup', vermogen: 'recovery',
      ...((herstel.enrolled || leeg) && typeof herstel.remaining === 'number' ? { teller: herstel.remaining } : {}),
      ...(leeg ? { staatReden: T('Коди закінчилися — створіть нові', 'De codes zijn op — maak nieuwe'), waarschuwingCode: 'RECOVERY_EMPTY' } : {}),
    });
  }

  // De kluis en de toegangscodes dragen hun LEVENDE staat in hun eigen secties (eigen API): de kaart verzint geen badge.
  uit.push({
    id: 'vault', titel: T('Шифрування моїх даних', 'Versleuteling van mijn gegevens'),
    ondertitel: T('Ключ приватних даних і стан сховища — у деталях', 'De sleutel van uw privégegevens en de kluisstatus — in de details'),
    icoon: 'vault', staat: 'unknown', staatReden: T('Живий стан видно в деталях', 'De levende status staat in de details'),
    hoofdActie: 'details', vermogen: 'encryption',
  });
  uit.push({
    id: 'guest-code', titel: T('Коди доступу для інших', 'Toegangscodes voor anderen'),
    ondertitel: T('Контрольований гостьовий доступ із визначеним строком', 'Gecontroleerde gasttoegang met een vaste looptijd'),
    icoon: 'guest-code', staat: 'unknown', staatReden: T('Живий стан видно в деталях', 'De levende status staat in de details'),
    hoofdActie: 'details', vermogen: 'delegation',
  });
  return uit;
}

/** Bij welke filtergroepen hoort een kaart (dossier §4: filters zoeken, ze veranderen niets). */
export function groepenVan(k: MethodeUi): AanmeldGroep[] {
  const uit: AanmeldGroep[] = ['alles'];
  if (k.vermogen === 'sign-in') uit.push('inloggen');
  if (k.id === 'passkey') uit.push('passkey');
  if (k.vermogen === 'step-up' || k.vermogen === 'recovery' || k.vermogen === 'encryption') uit.push('bescherming');
  if (k.vermogen === 'delegation') uit.push('delegatie');
  return uit.filter((g) => (AANMELD_GROEPEN as readonly string[]).includes(g));
}

/** Zoekfilter op titel + ondertitel in de actieve taal; leeg zoekwoord = alles. Puur, geen netwerk (dossier §7). */
export function zoekFilter(kaarten: MethodeUi[], lang: 'uk' | 'nl', zoek: string, groep: AanmeldGroep): MethodeUi[] {
  const naald = zoek.trim().toLocaleLowerCase(lang === 'uk' ? 'uk-UA' : 'nl-NL');
  return kaarten.filter((k) => {
    if (groep !== 'alles' && !groepenVan(k).includes(groep)) return false;
    if (!naald) return true;
    const tekst = `${k.titel[lang === 'uk' ? 0 : 1]} ${k.ondertitel[lang === 'uk' ? 0 : 1]}`.toLocaleLowerCase(lang === 'uk' ? 'uk-UA' : 'nl-NL');
    return tekst.includes(naald);
  });
}

/** De eerste kaart die om instelling vraagt — doel van de hero-CTA (géén auto-enable, alleen de details openen). */
export const eersteInTeStellen = (kaarten: MethodeUi[]): MethodeUi | null =>
  kaarten.find((k) => k.staat === 'not-configured' && (k.id === 'passkey' || k.id === 'totp' || k.id === 'recovery')) ?? null;
