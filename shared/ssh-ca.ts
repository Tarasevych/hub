// SSH-certificaat voor één uur (architectuur 14.10.2026, etap C deel 2).
// De site vraagt alleen; root (deploy/ssh-ca/mijn-ruimte-ssh-ca.sh) tekent. Een vlag verbergt de knop en geeft nooit dit recht:
// dat blijft ssh.host (alleen Власник) in een actief technisch profiel, plus de schakelaar ssh-ca die standaard uit staat.
import type { HelpLagen, TechRol } from './tech-rollen';

export const SSH_CA_MINUTEN = 60;
export const SSH_CA_PRINCIPAL = 'beheer';
/** Geldigheid die de site mag vragen (root dwingt hetzelfde af: SSH_CA_DUUR buiten 5–60). */
export const SSH_CA_MIN_MINUTEN = 5;
export const SSH_CA_MAX_MINUTEN = 60;
export const SSH_CA_DUREN: readonly number[] = Object.freeze([5, 15, 30, 60]);
/**
 * Principals per technische rol. Alleen Власник heeft ssh.host, dus alleen hij krijgt iets; root accepteert daarbovenop alleen
 * wat in /etc/mijn-ruimte/ssh-ca/toegestaan.json staat (standaard ["beheer"]). Een nieuwe rol hier toevoegen geeft dus nog geen toegang.
 */
export const SSH_CA_PRINCIPALS_PER_ROL: Readonly<Partial<Record<TechRol, readonly string[]>>> = Object.freeze({ eigenaar: Object.freeze([SSH_CA_PRINCIPAL]) });
export function principalsVoor(rollen: readonly string[]): string[] {
  const set = new Set<string>();
  for (const r of rollen) for (const p of SSH_CA_PRINCIPALS_PER_ROL[r as TechRol] || []) set.add(p);
  return [...set].sort();
}
/** 5–60 hele minuten, anders null. Niets opgegeven = standaard (60). */
export function minutenUit(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return SSH_CA_MINUTEN;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isInteger(n) && n >= SSH_CA_MIN_MINUTEN && n <= SSH_CA_MAX_MINUTEN ? n : null;
}
/** Acties op /api/ssh-ca/beheer. «inrichten» en «aan» vragen een passkey die ROOT zelf controleert; de rest neemt alleen rechten weg. */
export const SSH_CA_BEHEER_ACTIES = Object.freeze(['status', 'inrichten', 'aan', 'uit', 'ontmantelen'] as const);
export type SshCaBeheerActie = typeof SSH_CA_BEHEER_ACTIES[number];
export const SSH_CA_PASSKEY_ACTIES: readonly SshCaBeheerActie[] = Object.freeze(['inrichten', 'aan']);
/** Stand zoals root die schrijft (beheer-status.json). */
export type SshCaStand = {
  bijgewerkt: string; ca: boolean; vinger: string; include: boolean; dropin: boolean; sshdVertrouwt: boolean; krl: boolean;
  ingetrokken: number; schakelaar: boolean; pathUnit: boolean; account: string; principals: string[];
};
export type SshCaCertRij = {
  serie: number; vinger: string; door: string; aangemaakt: string; geldigTot: string; principals: string[]; minuten: number;
  ingetrokken: string | null; ingetrokkenDoor: string | null; reden: string; actief: boolean;
};
/** Alleen de knop. Afwezig of uit = verborgen. */
export const SSH_CA_VLAG = 'ssh-certificaat';
/** OpenSSH ed25519-publieke sleutel: 51 byte wireformaat → 68 tekens base64, zonder commentaar of opties. */
export const PUBLIEK_RE = /^ssh-ed25519 [A-Za-z0-9+/]{68}$/;
const IDENT_RE = /^[A-Za-z0-9._@-]{1,64}$/;

export function publiekeSleutel(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return PUBLIEK_RE.test(s) ? s : null;
}

/** Commentaar op het certificaat (Key ID), nooit de principal. Vreemde tekens vallen weg. */
export function identiteitVan(email: string | undefined): string {
  const lokaal = String(email || '').split('@')[0] || '';
  const s = lokaal.replace(/[^A-Za-z0-9._@-]/g, '').slice(0, 64);
  return IDENT_RE.test(s) ? s : 'mijn-ruimte';
}

export function schakelaarAan(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { 'ssh-ca'?: unknown })['ssh-ca'] === true;
}

/** Root-schakelaar in mcp-rechten.json (SEC-002, server-uitrol-06): moet root voor ELK certificaat de passkey van de eigenaar zien? */
export const SSH_CA_TEKEN_PASSKEY = 'ssh-ca-teken-passkey';
/**
 * Zelfde regel als het root-script (deploy/ssh-ca/mijn-ruimte-ssh-ca.sh, passkey_vereist): alleen exact `false` zet de controle
 * uit; `true` zet haar altijd aan; anders geldt ze zodra het sleutelbestand van de root-passkeys bestaat (de installer maakt het
 * altijd aan). De site gebruikt dit alleen om te weten of ze de eigenaar om zijn passkey moet vragen — root beslist zelf.
 */
export function tekenPasskeyVereist(rechten: unknown, sleutelbestandBestaat: boolean): boolean {
  const modus = rechten && typeof rechten === 'object' ? (rechten as Record<string, unknown>)[SSH_CA_TEKEN_PASSKEY] : undefined;
  if (modus === false) return false;
  return modus === true || sleutelbestandBestaat;
}

export const HELP_SSH: HelpLagen = {
  wat: ['Короткоживучий сертифікат SSH (5–60 хв) для входу на цей сервер як beheer. Приватний ключ лишається на вашому комп’ютері: сюди вставляєте лише публічний рядок ssh-ed25519.',
    'Een kortlevend SSH-certificaat (5–60 min) om op deze server in te loggen als beheer. De privésleutel blijft op uw computer: hier plakt u alleen de publieke regel ssh-ed25519.'],
  gevolg: ['Сертифікат згасає сам після обраного терміну. Постійного ключа на сервері не з’являється. Лише термінал (permit-pty), без пересилання портів, агента чи екрана. Видачу видно в списку й журналі; її можна відкликати раніше.',
    'Het certificaat dooft zelf na de gekozen tijd. Er komt geen vaste sleutel op de server. Alleen een terminal (permit-pty), zonder poort-, agent- of schermdoorsturing. De uitgifte staat in de lijst en het logboek en kan eerder worden ingetrokken.'],
  risico: ['Поки сертифікат дійсний і не відкликаний, ним можна відкрити сеанс SSH як beheer. Підпис відбувається лише якщо перемикач ssh-ca увімкнено (passkey, перевіряє root) і sshd довіряє CA. Кожен окремий сертифікат root підписує лише після вашого passkey саме для цього ключа; сам вхід через Google для цього не рахується.',
    'Zolang het certificaat geldig en niet ingetrokken is, opent het een SSH-sessie als beheer. Ondertekenen gebeurt alleen als de schakelaar ssh-ca aan staat (passkey, gecontroleerd door root) en sshd de CA vertrouwt. Elk afzonderlijk certificaat tekent root pas na uw passkey voor precies deze sleutel; alleen aanmelden met Google telt daarvoor niet.'],
  dev: ['Root-служба mijn-ruimte-ssh-ca (shared/ssh-ca.ts, backend/ssh-ca.ts). Прапорець ssh-certificaat лише ховає кнопку. Право — ssh.host (лише Власник) в активному технічному профілі + сильне підтвердження (passkey, код із застосунку або код відновлення; повторний вхід Google не рахується), одне підтвердження = один сертифікат. Root перед кожним підписом сам перевіряє passkey власника: виклик охоплює відбиток ключа, principals і термін (mijn-ruimte-passkey verifieer-ssh-ca … teken; nonce одноразовий). Вимкнути це може лише root: "ssh-ca-teken-passkey": false у mcp-rechten.json — тоді root знову підписує будь-який запит застосунку. Principals за роллю: SSH_CA_PRINCIPALS_PER_ROL ∩ root-список toegestaan.json. Термін 5–60 хв: -V -5m:+Nm, -O clear -O permit-pty, серійний номер -z для KRL.',
    'Root-dienst mijn-ruimte-ssh-ca (shared/ssh-ca.ts, backend/ssh-ca.ts). De vlag ssh-certificaat verbergt alleen de knop. Het recht is ssh.host (alleen eigenaar) in een actief technisch profiel + sterke bevestiging (passkey, app-code of herstelcode; opnieuw aanmelden bij Google telt niet), één bevestiging = één certificaat. Root controleert vóór elke handtekening zelf de passkey van de eigenaar: de challenge omvat de vingerafdruk van de sleutel, de principals en de duur (mijn-ruimte-passkey verifieer-ssh-ca … teken; nonce eenmalig). Alleen root kan dit uitzetten: "ssh-ca-teken-passkey": false in mcp-rechten.json — dan tekent root weer elk verzoek van de app. Principals per rol: SSH_CA_PRINCIPALS_PER_ROL ∩ root-lijst toegestaan.json. Duur 5–60 min: -V -5m:+Nm, -O clear -O permit-pty, serienummer -z voor de KRL.'],
};

/** «?» bij elk onderdeel van de kaart «SSH-сертифікати» (src/ssh/SshBeheer.tsx). Ook in shared/hulp-register.ts opgenomen. */
export const HELP_SSH_BEHEER: Readonly<Record<'stand' | 'voorbereiden' | 'aan' | 'uit' | 'ontmantelen' | 'duur' | 'lijst' | 'intrekken', HelpLagen>> = Object.freeze({
  stand: {
    wat: ['Стан SSH-центру сертифікації: чи є CA-ключ, чи sshd йому довіряє, чи ввімкнено перемикач підпису, скільки сертифікатів відкликано.', 'Stand van de SSH-certificaatautoriteit: is er een CA-sleutel, vertrouwt sshd die, staat de ondertekenschakelaar aan, hoeveel certificaten zijn ingetrokken.'],
    gevolg: ['Лише читання. «Оновити» просить root перевірити наново (sshd -T), нічого не змінюючи.', 'Alleen lezen. «Vernieuwen» vraagt root opnieuw te controleren (sshd -T) zonder iets te wijzigen.'],
    risico: ['Низький ризик: лише показ. Стан може бути застарілим, доки root не відповість — дивіться час оновлення.', 'Laag risico: alleen weergave. De stand kan verouderd zijn tot root antwoordt — kijk naar de tijd van bijwerken.'],
    dev: ['Root пише /var/lib/mijn-ruimte/ssh-ca-uit/beheer-status.json (mijn-ruimte-ssh-ca status). «sshd довіряє» = ефективне значення TrustedUserCAKeys із `sshd -T` дорівнює нашому ca.pub.', 'Root schrijft /var/lib/mijn-ruimte/ssh-ca-uit/beheer-status.json (mijn-ruimte-ssh-ca status). «sshd vertrouwt» = de effectieve TrustedUserCAKeys uit `sshd -T` is onze ca.pub.'],
  },
  voorbereiden: {
    wat: ['Готує сервер: root створює CA-ключ (якщо його ще немає), список відкликаних (KRL), principals і власний drop-in для sshd.', 'Bereidt de server voor: root maakt de CA-sleutel (als die er nog niet is), de intrekkingslijst (KRL), principals en een eigen drop-in voor sshd.'],
    gevolg: ['sshd почне довіряти сертифікатам цього CA. Підпис лишається вимкненим, доки ви не натиснете «Увімкнути».', 'sshd gaat certificaten van deze CA vertrouwen. Ondertekenen blijft uit tot u op «Aanzetten» drukt.'],
    risico: ['Змінює конфігурацію SSH сервера. Root перевіряє її `sshd -t` до перезавантаження; при помилці повертає попередню. Потрібен ваш passkey, і його перевіряє сам root.', 'Wijzigt de SSH-configuratie van de server. Root controleert die met `sshd -t` vóór het herladen; bij een fout zet hij de vorige terug. Uw passkey is nodig, en root controleert die zelf.'],
    dev: ['mijn-ruimte-ssh-ca beheer (actie inrichten) через mijn-ruimte-ssh-ca-beheer.service; passkey: goedkeur-hulp verifieer-ssh-ca (doel ssh-ca, actie в challenge, nonce одноразовий). sshd_config не редагується: лише /etc/ssh/sshd_config.d/50-mijn-ruimte-ssh-ca.conf (TrustedUserCAKeys, RevokedKeys, AuthorizedPrincipalsFile). Без Include → SSH_CA_SSHD_GEEN_INCLUDE.', 'mijn-ruimte-ssh-ca beheer (actie inrichten) via mijn-ruimte-ssh-ca-beheer.service; passkey: goedkeur-hulp verifieer-ssh-ca (doel ssh-ca, actie in de challenge, nonce eenmalig). sshd_config wordt niet bewerkt: alleen /etc/ssh/sshd_config.d/50-mijn-ruimte-ssh-ca.conf (TrustedUserCAKeys, RevokedKeys, AuthorizedPrincipalsFile). Zonder Include → SSH_CA_SSHD_GEEN_INCLUDE.'],
  },
  aan: {
    wat: ['Вмикає підпис сертифікатів: root ставить перемикач ssh-ca = true і запускає path-юніт.', 'Zet het ondertekenen aan: root zet de schakelaar ssh-ca = true en start de path-unit.'],
    gevolg: ['Власник у технічному профілі зможе отримувати сертифікати на 5–60 хв.', 'De eigenaar in het technisch profiel kan certificaten van 5–60 min krijgen.'],
    risico: ['Відкриває шлях до входу на сервер як beheer. Потрібен passkey, перевірений root; лише після «Підготувати».', 'Opent een weg om als beheer op de server in te loggen. Een passkey is nodig, gecontroleerd door root; pas na «Voorbereiden».'],
    dev: ['/etc/mijn-ruimte/mcp-rechten.json: змінюється лише ключ "ssh-ca" (права й власник файлу зберігаються). Root відмовить SSH_CA_NIET_GEREED, якщо sshd ще не довіряє CA.', '/etc/mijn-ruimte/mcp-rechten.json: alleen de sleutel "ssh-ca" verandert (rechten en eigenaar van het bestand blijven). Root weigert met SSH_CA_NIET_GEREED als sshd de CA nog niet vertrouwt.'],
  },
  uit: {
    wat: ['Вимикає підпис нових сертифікатів.', 'Zet het ondertekenen van nieuwe certificaten uit.'],
    gevolg: ['Нових сертифікатів не буде. Уже видані діють до свого кінця — відкличте їх, якщо треба зупинити негайно.', 'Er komen geen nieuwe certificaten. Al uitgegeven certificaten gelden tot hun einde — trek ze in als het meteen moet stoppen.'],
    risico: ['Вимкнення безпечне, але не відкликає вже видані сертифікати — для негайної зупинки відкличте їх у списку.', 'Uitzetten is veilig, maar trekt uitgegeven certificaten niet in — trek ze in de lijst in om meteen te stoppen.'],
    dev: ['Безпечний напрям: root не вимагає passkey (сайт вимагає підтвердження входу). ssh-ca = false, systemctl disable --now mijn-ruimte-ssh-ca.path.', 'Veilige richting: root vraagt geen passkey (de site vraagt bevestiging van de aanmelding). ssh-ca = false, systemctl disable --now mijn-ruimte-ssh-ca.path.'],
  },
  ontmantelen: {
    wat: ['Вимикає підпис і прибирає довіру sshd до цього CA.', 'Zet ondertekenen uit en haalt het vertrouwen van sshd in deze CA weg.'],
    gevolg: ['Усі сертифікати цього CA (і ще дійсні) перестають працювати після перезавантаження sshd. CA-ключ лишається для повторного «Підготувати».', 'Alle certificaten van deze CA (ook nog geldige) werken niet meer na het herladen van sshd. De CA-sleutel blijft voor een nieuw «Voorbereiden».'],
    risico: ['Поточні SSH-сеанси через сертифікат можуть обірватися; якщо це ваш єдиний доступ — спершу переконайтеся, що є інший шлях входу.', 'Lopende SSH-sessies via een certificaat kunnen afbreken; is dit uw enige toegang, zorg dan eerst voor een andere weg naar binnen.'],
    dev: ['Drop-in видаляється, `sshd -t`, reload; при помилці — повернення. Ключ /etc/mijn-ruimte/ssh-ca/ca не видаляється.', 'De drop-in wordt verwijderd, `sshd -t`, reload; bij een fout terug. De sleutel /etc/mijn-ruimte/ssh-ca/ca blijft staan.'],
  },
  duur: {
    wat: ['Скільки діє сертифікат: від 5 до 60 хвилин.', 'Hoe lang het certificaat geldt: 5 tot 60 minuten.'],
    gevolg: ['Після цього часу сертифікат не приймається; до нього додається 5 хв запасу на розбіжність годинників.', 'Na die tijd wordt het certificaat niet meer aanvaard; er komt 5 min speling bij voor afwijkende klokken.'],
    risico: ['Довший термін — довше діє вкрадений сертифікат. Для разової дії досить 5–15 хв.', 'Een langere geldigheid laat een gestolen certificaat langer werken. Voor een losse taak volstaat 5–15 min.'],
    dev: ['minuten у запиті до root; root сам перевіряє 5–60 (SSH_CA_DUUR) і підписує -V -5m:+Nm.', 'minuten in het verzoek aan root; root controleert zelf 5–60 (SSH_CA_DUUR) en tekent met -V -5m:+Nm.'],
  },
  lijst: {
    wat: ['Видані сертифікати: серійний номер, хто отримав, коли, до коли, principals і чи відкликано.', 'Uitgegeven certificaten: serienummer, wie, wanneer, tot wanneer, principals en of het is ingetrokken.'],
    gevolg: ['Лише перегляд; сам сертифікат не зберігається — тільки відбиток публічного ключа.', 'Alleen bekijken; het certificaat zelf wordt niet bewaard — alleen de vingerafdruk van de publieke sleutel.'],
    risico: ['Список показує, хто й коли входив на хост — це чутлива інформація; доступ лише власнику.', 'De lijst toont wie wanneer op de host kon — gevoelige informatie; alleen de eigenaar ziet haar.'],
    dev: ['Таблиця app.ssh_ca_certificaten (міграція 0069), запис робить системна роль при видачі.', 'Tabel app.ssh_ca_certificaten (migratie 0069); de systeemrol schrijft bij uitgifte.'],
  },
  intrekken: {
    wat: ['Відкликає сертифікат за серійним номером до кінця його терміну.', 'Trekt een certificaat op serienummer in vóór het einde van zijn geldigheid.'],
    gevolg: ['sshd відмовляє цьому сертифікату одразу, без перезавантаження. Скасувати відкликання з сайту не можна.', 'sshd weigert dat certificaat meteen, zonder herladen. Intrekken is vanaf de site niet terug te draaien.'],
    risico: ['Якщо відкликати сертифікат, яким ви зараз підключені, нові входи з ним не вдадуться; відкликання не скасувати.', 'Trekt u het certificaat in waarmee u nu verbonden bent, dan lukt een nieuwe aanmelding ermee niet; intrekken is niet terug te draaien.'],
    dev: ['Root додає серію в /etc/mijn-ruimte/ssh-ca/krl (ssh-keygen -k, «serial: N»); sshd читає RevokedKeys при кожному вході. Безпечний напрям — без passkey root.', 'Root voegt de serie toe aan /etc/mijn-ruimte/ssh-ca/krl (ssh-keygen -k, «serial: N»); sshd leest RevokedKeys bij elke aanmelding. Veilige richting — zonder root-passkey.'],
  },
});
