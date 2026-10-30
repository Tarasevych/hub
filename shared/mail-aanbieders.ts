// DE ENE lijst van maildiensten die op de pagina «Підключіть свої поштові акаунти» staan (src/MailAccountsHub.tsx) — met per
// dienst de ECHTE manier om te koppelen, of eerlijk: wat er precies nog ontbreekt.
//
// WAAROM DIT BESTAAND MOET (opdracht van de eigenaar, 20.10.2026): «Немає опцій підключення пошти — лише всевдо-блоки без
// реальної можливості підключення». De acht tegels stonden hardgecodeerd in de weergave; zes ervan deden letterlijk niets
// (een melding «поки не підключається») en toch stond er een knop. Een knop die niets doet is een leugen tegen de gebruiker.
// Daarom staat hier per dienst, zuiver en testbaar (geen React, geen DOM — de tests lezen dit bestand):
//   • `wijze`  — hoe er ECHT gekoppeld wordt: via de bestaande Google-OAuth, via de bestaande Microsoft-OAuth, via
//                IMAP/SMTP met een app-wachtwoord, of `nog-niet`;
//   • `imap`/`smtp` — de host, poort en versleuteling die de server daadwerkelijk gebruikt (backend/mail-imap.ts). Alleen
//                deze VASTE hosts mogen gekozen worden: de gebruiker typt nooit een eigen host, dus er is geen weg naar een
//                binnenadres (SSRF) zoals bij een vrij in te vullen adresveld;
//   • `ontbreekt` — bij `nog-niet`: de concrete lijst van wat er mist, in beide talen. De tegel krijgt dan GEEN knop.
// Wie hier een dienst toevoegt, voegt hem ook toe aan het merkregister (src/merk/merk-tabel.ts): zonder embleem geen tegel.

/** Hoe een dienst gekoppeld wordt. `nog-niet` = er is (nog) geen echte weg; de tegel toont dan de lijst `ontbreekt`. */
export type MailKoppelWijze = 'oauth-google' | 'oauth-microsoft' | 'imap-app-wachtwoord' | 'nog-niet';

export type MailServerAdres = {
  host: string;
  poort: number;
  /** 'tls' = de verbinding begint versleuteld (993/465); 'starttls' = eerst platte verbinding, dan STARTTLS (587). */
  versleuteling: 'tls' | 'starttls';
};

export type MailAanbieder = {
  id: string;
  naam: string;
  /** Sleutel in het merkregister (src/merk/merk-register.ts). Elke dienst heeft een echt embleem, nooit een letter. */
  merk: string;
  /** Tweede regel op de tegel. */
  onder: readonly [uk: string, nl: string];
  wijze: MailKoppelWijze;
  imap?: MailServerAdres;
  smtp?: MailServerAdres;
  /** Waar de mens zijn app-wachtwoord maakt (alleen https, alleen de officiële pagina van de dienst). */
  hulpAdres?: string;
  /** Uitleg bij het app-wachtwoord: wat de mens moet doen vóórdat het koppelen lukt. */
  hulp?: readonly [uk: string, nl: string];
  /** Bij `nog-niet`: wat er precies nog nodig is. Nooit leeg als wijze 'nog-niet' is (de test let erop). */
  ontbreekt?: readonly (readonly [uk: string, nl: string])[];
};

export const MAIL_AANBIEDERS: readonly MailAanbieder[] = Object.freeze([
  {
    id: 'gmail', naam: 'Gmail', merk: 'gmail', onder: ['Google Workspace', 'Google Workspace'],
    wijze: 'oauth-google',
  },
  {
    id: 'outlook', naam: 'Outlook', merk: 'microsoftoutlook', onder: ['Microsoft 365', 'Microsoft 365'],
    wijze: 'oauth-microsoft',
  },
  {
    id: 'icloud', naam: 'iCloud Mail', merk: 'icloud', onder: ['Apple', 'Apple'],
    wijze: 'imap-app-wachtwoord',
    imap: { host: 'imap.mail.me.com', poort: 993, versleuteling: 'tls' },
    smtp: { host: 'smtp.mail.me.com', poort: 587, versleuteling: 'starttls' },
    hulpAdres: 'https://account.apple.com/account/manage',
    hulp: [
      'Apple дозволяє сторонні застосунки лише з паролем для застосунку. Створіть його в Apple Account → «Паролі для програм» (потрібна двоетапна перевірка).',
      'Apple staat externe programma\'s alleen toe met een app-wachtwoord. Maak het aan in uw Apple Account → «App-specifieke wachtwoorden» (tweestapsverificatie vereist).',
    ],
  },
  {
    id: 'ukrnet', naam: 'Ukr.net', merk: 'ukrnet', onder: ['Українська пошта', 'Oekraïense e-maildienst'],
    wijze: 'imap-app-wachtwoord',
    imap: { host: 'imap.ukr.net', poort: 993, versleuteling: 'tls' },
    smtp: { host: 'smtp.ukr.net', poort: 465, versleuteling: 'tls' },
    hulpAdres: 'https://mail.ukr.net/',
    hulp: [
      'У Ukr.net створіть окремий пароль для зовнішніх програм: «Налаштування → Пароль для зовнішніх програм». Звичайний пароль від пошти тут не працює.',
      'Maak in Ukr.net een apart wachtwoord voor externe programma\'s: «Instellingen → Wachtwoord voor externe programma\'s». Het gewone mailwachtwoord werkt hier niet.',
    ],
  },
  {
    id: 'yahoo', naam: 'Yahoo! Mail', merk: 'yahoo', onder: ['Yahoo', 'Yahoo'],
    wijze: 'imap-app-wachtwoord',
    imap: { host: 'imap.mail.yahoo.com', poort: 993, versleuteling: 'tls' },
    smtp: { host: 'smtp.mail.yahoo.com', poort: 465, versleuteling: 'tls' },
    hulpAdres: 'https://login.yahoo.com/account/security',
    hulp: [
      'Yahoo вимагає «App Password»: «Account Security → Generate app password». Пароль від акаунта зовнішні програми не приймають.',
      'Yahoo vereist een «App Password»: «Account Security → Generate app password». Het accountwachtwoord wordt door externe programma\'s niet geaccepteerd.',
    ],
  },
  {
    id: 'iua', naam: 'I.ua', merk: 'iua', onder: ['Українська пошта', 'Oekraïense e-maildienst'],
    wijze: 'imap-app-wachtwoord',
    imap: { host: 'imap.i.ua', poort: 993, versleuteling: 'tls' },
    smtp: { host: 'smtp.i.ua', poort: 465, versleuteling: 'tls' },
    hulpAdres: 'https://mail.i.ua/',
    hulp: [
      'Увімкніть доступ IMAP у налаштуваннях I.ua («Пошта → Налаштування → POP3/IMAP»); пароль — той самий, що й для вебпошти.',
      'Zet IMAP-toegang aan in de instellingen van I.ua («Пошта → Налаштування → POP3/IMAP»); het wachtwoord is hetzelfde als voor de webmail.',
    ],
  },
  {
    // Online.ua: er is GEEN door de dienst gepubliceerde IMAP/SMTP-host (gecontroleerd op 20.10.2026). Een host raden zou
    // betekenen dat de gebruiker op een knop drukt die bij de eerste poging faalt — dus geen knop, wel de echte lijst.
    id: 'onlineua', naam: 'Online.ua', merk: 'onlineua', onder: ['Українська пошта', 'Oekraïense e-maildienst'],
    wijze: 'nog-niet',
    ontbreekt: [
      ['Online.ua не публікує адреси IMAP/SMTP, тому підключити скриньку зовнішньою програмою немає куди.',
        'Online.ua publiceert geen IMAP/SMTP-adres, dus er is geen server om een externe cliënt op aan te sluiten.'],
      ['Потрібні: підтверджені хост і порт IMAP, хост і порт SMTP та офіційний спосіб створити пароль для застосунку.',
        'Nodig: een bevestigde IMAP-host en -poort, een SMTP-host en -poort, en een officiële manier om een app-wachtwoord te maken.'],
      ['Якщо сервіс дає доступ лише через власний вебінтерфейс — підключення тут не буде, і ми цього не приховуємо.',
        'Geeft de dienst alleen toegang via haar eigen webinterface, dan komt er hier geen koppeling — en dat verzwijgen we niet.'],
    ],
  },
  {
    // Proton: geen directe IMAP vanaf een server. Proton Mail Bridge draait op het TOESTEL van de mens (127.0.0.1:1143 /
    // :1025, eigen certificaat) en is van buiten niet te bereiken; onze server staat niet op dat toestel.
    // Merksleutel 'protonmail': zo staat Proton al in de grote merkentabel (src/merk/merk-logos.ts) — geen tweede vorm.
    id: 'proton', naam: 'Proton Mail', merk: 'protonmail', onder: ['Безпека та приватність', 'Veiligheid en privacy'],
    wijze: 'nog-niet',
    ontbreekt: [
      ['Proton не дає IMAP напряму: доступ іде лише через Proton Mail Bridge, який працює на вашому комп’ютері (127.0.0.1:1143/1025) і недосяжний для сервера.',
        'Proton biedt geen directe IMAP: toegang loopt alleen via Proton Mail Bridge, die op uw eigen computer draait (127.0.0.1:1143/1025) en voor de server onbereikbaar is.'],
      ['Потрібен тунель від ПК-агента до Bridge і довіра до його власного сертифіката — цього в нас ще немає.',
        'Nodig is een tunnel van de pc-agent naar Bridge plus vertrouwen in het eigen certificaat van Bridge — dat hebben we nog niet.'],
      ['Альтернатива — платний Proton Business із SMTP-передачею; це інша підписка, а не кнопка тут.',
        'Alternatief is het betaalde Proton Business met SMTP-verzending; dat is een andere abonnementsvorm, geen knop hier.'],
    ],
  },
]);

export const mailAanbieder = (id: unknown): MailAanbieder | null =>
  MAIL_AANBIEDERS.find((a) => a.id === String(id ?? '').trim().toLowerCase()) ?? null;

/** Diensten die via IMAP/SMTP gaan — en dus een vaste, bekende host hebben. */
export const MAIL_IMAP_AANBIEDERS: readonly MailAanbieder[] =
  Object.freeze(MAIL_AANBIEDERS.filter((a) => a.wijze === 'imap-app-wachtwoord'));

/** Mag deze tegel een knop hebben? Alleen als er een echte handeling achter zit. */
export const mailAanbiederHeeftKnop = (a: MailAanbieder): boolean => a.wijze !== 'nog-niet';

/** Alles wat een tegel nodig heeft om te kloppen: wijze bekend, en bij IMAP ook host + poort + hulp. */
export const mailAanbiederVolledig = (a: MailAanbieder): boolean => {
  if (a.wijze === 'nog-niet') return Boolean(a.ontbreekt?.length) && !a.imap && !a.smtp;
  if (a.wijze === 'imap-app-wachtwoord') {
    return Boolean(a.imap?.host && a.imap.poort > 0 && a.smtp?.host && a.smtp.poort > 0 && a.hulp && a.hulpAdres?.startsWith('https://'));
  }
  return !a.imap && !a.smtp;
};

/** Adres van de mailbox: één gewoon e-mailadres, hoogstens 320 tekens (RFC-grens). */
export const geldigMailAdres = (value: unknown): string => {
  const adres = String(value ?? '').trim().toLowerCase();
  return adres.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adres) ? adres : '';
};

/** Het app-wachtwoord zoals de dienst het geeft: spaties eruit (Apple en Yahoo tonen het in groepjes van vier). */
export const schoonAppWachtwoord = (value: unknown): string => String(value ?? '').replace(/\s+/g, '').slice(0, 256);

export const MAIL_IMAP_FOUT = Object.freeze({
  MAIL_IMAP_AANBIEDER_ONBEKEND: ['Цей сервіс не підключається через IMAP.', 'Deze dienst wordt niet via IMAP gekoppeld.'],
  MAIL_IMAP_ADRES_ONGELDIG: ['Перевірте адресу пошти.', 'Controleer het e-mailadres.'],
  MAIL_IMAP_WACHTWOORD_ONTBREEKT: ['Введіть пароль застосунку.', 'Vul het app-wachtwoord in.'],
  MAIL_IMAP_AANMELDEN_GEWEIGERD: ['Сервер відмовив у входi: перевірте адресу й пароль застосунку.', 'De server weigerde de aanmelding: controleer adres en app-wachtwoord.'],
  MAIL_IMAP_TIJD_OVERSCHREDEN: ['Сервер не відповів вчасно. Спробуйте ще раз.', 'De server antwoordde niet op tijd. Probeer het opnieuw.'],
  MAIL_IMAP_VERBINDING_MISLUKT: ['Не вдалося зʼєднатися з поштовим сервером.', 'Er kon geen verbinding met de mailserver worden gemaakt.'],
  MAIL_IMAP_SMTP_GEWEIGERD: ['Вхід для надсилання (SMTP) не прийнято.', 'De aanmelding voor verzenden (SMTP) werd niet geaccepteerd.'],
  MAIL_IMAP_AL_GEKOPPELD: ['Ця скринька вже підключена.', 'Deze mailbox is al gekoppeld.'],
  MAIL_IMAP_TE_VEEL: ['Досягнуто межі підключених скриньок.', 'De grens van gekoppelde mailboxen is bereikt.'],
  MAIL_IMAP_SLEUTEL_ONTBREEKT: ['Сервер не має ключа шифрування для паролів застосунків — адміністратор має його додати.', 'De server heeft geen versleutelsleutel voor app-wachtwoorden — de beheerder moet die toevoegen.'],
  // Sleutelkluis (0092): de eigen gegevenssleutel van de mens is dicht in deze sessie — eerst ontgrendelen (Способи входу → Шифрування).
  SLEUTELKLUIS_GESLOTEN: ['Ключ ваших даних закритий. Розблокуйте його (Способи входу → Шифрування моїх даних) і спробуйте знову.', 'Uw gegevenssleutel is gesloten. Ontgrendel hem (Aanmeldmethoden → Versleuteling van mijn gegevens) en probeer opnieuw.'],
  MAIL_IMAP_ONBEKEND: ['Підключення не вдалося.', 'De koppeling is niet gelukt.'],
} as const);
export type MailImapFoutCode = keyof typeof MAIL_IMAP_FOUT;
export const mailImapFoutTekst = (code: unknown, taal: 'uk' | 'nl'): string => {
  const rij = MAIL_IMAP_FOUT[String(code ?? '') as MailImapFoutCode] ?? MAIL_IMAP_FOUT.MAIL_IMAP_ONBEKEND;
  return rij[taal === 'nl' ? 1 : 0];
};

/** Wat een koppeling naar buiten mag tonen. Het app-wachtwoord staat hier NIET in en komt nooit uit de server. */
export type MailImapKoppelingPubliek = {
  id: string;
  aanbieder: string;
  adres: string;
  actief: boolean;
  mappen: number;
  smtpGoed: boolean;
  laatstGoedOp: number;
  fout: string;
  aangemaaktOp: number;
};
/** De sleutelnamen die NOOIT in een antwoord mogen staan (de test leest deze lijst). */
export const MAIL_IMAP_GEHEIME_VELDEN: readonly string[] = Object.freeze(['geheim', 'wachtwoord', 'appWachtwoord', 'password']);
export const MAIL_IMAP_MAX_KOPPELINGEN = 12;
