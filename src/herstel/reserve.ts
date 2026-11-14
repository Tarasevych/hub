// IDENTITEIT-014 (фаза 3, «Відновлення»): чиста логіка огляду резервного доступу — без React і без мережі, щоб модульні тести
// перевіряли її напряму. Дані: знімок /api/owner/access/snapshot (вже в пам'яті AccessPlaneView), відповідь
// POST /api/owner/access/stap-op/methoden і POST /api/owner/sleutelkluis/stand. Нічого не вигадуємо: невідоме лишається «не перевірено».
// Pure logica voor het overzicht van reservetoegang: snapshot + stap-op/methoden + sleutelkluis/stand → drie controles en één eerste stap.
import type { KluisStand } from '../../shared/sleutelkluis';
import { KLUIS_TEKST } from '../../shared/sleutelkluis';
import { eersteInTeStellen, snapshotNaarKaarten, type SnapshotLike } from '../aanmeld-vnext/snapshotNaarKaarten';

export type Paar = readonly [string, string];
/** Розділи сторінки облікового запису, куди веде червоний пункт (ті самі id, що в IDENTITEIT_TABS). */
export type HerstelSectie = 'methods' | 'security' | 'recovery' | 'sessions';
/** `methoden` з stap-op/methoden. `google` сервер завжди ставить true — його тут свідомо немає (див. onafhankelijkeMethoden). */
export type ReserveMethoden = Partial<Record<'passkey' | 'totp' | 'herstelcode' | 'codewoord' | 'telegram' | 'apparaat', boolean>>;
/** Потрібна частина відповіді sleutelkluis/stand (повний тип — у SleutelkluisSectie). */
export type KluisKern = {
  stand: KluisStand;
  omslagen: { herstelcode: { aangemaaktOp: number } | null; passkeys: Array<{ prf: boolean }> };
  herstelcodeWacht?: boolean;
  zonderOmslag?: boolean;
};
export type ControleToon = 'goed' | 'slecht' | 'aandacht' | 'neutraal' | 'onbekend';
export type Controle = {
  id: 'onafhankelijk' | 'codes' | 'kluis';
  toon: ControleToon;
  titel: Paar;
  uitleg: Paar;
  /** Куди веде пункт (лише для червоних і жовтих). */
  sectie?: HerstelSectie;
  actie?: Paar;
};

const P = (uk: string, nl: string): Paar => [uk, nl] as const;
const kluisP = (t: { uk: string; nl: string }): Paar => [t.uk, t.nl] as const;

const NAMEN: Record<string, Paar> = {
  passkey: P('passkey', 'passkey'),
  totp: P('застосунок-автентифікатор', 'authenticator-app'),
  herstelcode: P('коди відновлення', 'herstelcodes'),
  codewoord: P('кодове слово', 'codewoord'),
  telegram: P('Telegram', 'Telegram'),
  apparaat: P('інший пристрій', 'ander apparaat'),
  google: P('Google', 'Google'),
};

/**
 * Незалежні способи підтвердити, що це ви. Google рахується лише тоді, коли знімок показує прив'язку
 * (stap-op/methoden завжди повертає google:true). Без відповіді methoden — лише те, що знає знімок.
 */
export function onafhankelijkeMethoden(snapshot: SnapshotLike, methoden: ReserveMethoden | null): string[] {
  const f = (id: string) => snapshot.factors.find((x) => x.id === id);
  const uit = new Set<string>();
  if (f('passkey')?.enrolled) uit.add('passkey');
  if (f('totp')?.enrolled || snapshot.totp.enrolled) uit.add('totp');
  if (Number(f('recovery')?.remaining) > 0) uit.add('herstelcode');
  for (const k of ['passkey', 'totp', 'herstelcode', 'codewoord', 'telegram', 'apparaat'] as const) if (methoden?.[k] === true) uit.add(k);
  const google = snapshot.methods.find((m) => m.id === 'google');
  if (google?.bound || snapshot.bindings.some((b) => b.method === 'google')) uit.add('google');
  return [...uit];
}

export const methodeNaam = (id: string): Paar => NAMEN[id] || P(id, id);

/** Набір кодів облікового запису був, але жодного чинного не лишилось (використано або відкликано). */
export function codesOp(snapshot: SnapshotLike): boolean {
  const r = snapshot.factors.find((x) => x.id === 'recovery');
  return !!r && r.status !== 'loading' && Number(r.remaining) === 0 && Number(r.createdAt) > 0;
}

/** Три перевірки огляду. `kluis === undefined` — ще завантажується, `null` — не вдалося прочитати. */
export function reserveControles(snapshot: SnapshotLike, methoden: ReserveMethoden | null, kluis: KluisKern | null | undefined): Controle[] {
  const laden = snapshot.factors.some((x) => x.status === 'loading');
  const uit: Controle[] = [];

  // 1. Щонайменше два незалежні способи.
  const lijst = onafhankelijkeMethoden(snapshot, methoden);
  const opsomming = (i: 0 | 1) => lijst.map((id) => methodeNaam(id)[i]).join(', ');
  if (laden) uit.push({ id: 'onafhankelijk', toon: 'onbekend', titel: P('Незалежні способи підтвердження', 'Onafhankelijke manieren om te bevestigen'), uitleg: P('Перевіряємо…', 'Bezig met controleren…') });
  else if (lijst.length >= 2) uit.push({ id: 'onafhankelijk', toon: 'goed', titel: P(`Незалежних способів підтвердження: ${lijst.length}`, `Onafhankelijke manieren om te bevestigen: ${lijst.length}`), uitleg: P(`Якщо один стане недоступним, лишиться інший: ${opsomming(0)}.`, `Valt er één weg, dan blijft er een andere: ${opsomming(1)}.`) });
  else uit.push({
    id: 'onafhankelijk', toon: 'slecht', sectie: 'security',
    titel: P(lijst.length ? `Лише один незалежний спосіб: ${opsomming(0)}` : 'Немає жодного незалежного способу підтвердження', lijst.length ? `Maar één onafhankelijke manier: ${opsomming(1)}` : 'Geen enkele onafhankelijke manier om te bevestigen'),
    uitleg: P('Якщо втратите цей доступ, повернути обліковий запис буде нічим. Додайте passkey або застосунок-автентифікатор — тоді важливі дії можна буде підтвердити іншим способом.', 'Raakt u deze toegang kwijt, dan is er niets om het account terug te krijgen. Voeg een passkey of authenticator-app toe — dan kunt u belangrijke handelingen op een andere manier bevestigen.'),
    actie: P('Додати спосіб', 'Manier toevoegen'),
  });

  // 2. Коди облікового запису є і збережені.
  const r = snapshot.factors.find((x) => x.id === 'recovery');
  const rest = Number(r?.remaining) || 0;
  if (laden || !r) uit.push({ id: 'codes', toon: 'onbekend', titel: P('Коди відновлення облікового запису', 'Herstelcodes van het account'), uitleg: P('Перевіряємо…', 'Bezig met controleren…') });
  else if (rest > 0 && Number(r.bekekenOp) > 0) uit.push({ id: 'codes', toon: 'goed', titel: P(`Коди відновлення є (${rest}) і збережені`, `Herstelcodes aanwezig (${rest}) en bewaard`), uitleg: P('Кожен код діє один раз. Тримайте їх окремо від телефону.', 'Elke code werkt één keer. Bewaar ze los van uw telefoon.') });
  else if (rest > 0) uit.push({ id: 'codes', toon: 'slecht', sectie: 'recovery', titel: P('Коди є, але не позначені як збережені', 'Codes aanwezig, maar niet als bewaard gemarkeerd'), uitleg: P('Показати їх ще раз не можна. Якщо ви їх не записали, створіть нові: старі тоді перестануть діяти.', 'Opnieuw tonen kan niet. Hebt u ze niet genoteerd, maak dan nieuwe: de oude werken dan niet meer.'), actie: P('До кодів відновлення', 'Naar de herstelcodes') });
  else if (codesOp(snapshot)) uit.push({ id: 'codes', toon: 'slecht', sectie: 'recovery', titel: P('Коди відновлення закінчилися', 'De herstelcodes zijn op'), uitleg: P('Жоден код більше не діє. Без них автентифікатор не вимкнути, якщо телефон загубиться.', 'Geen enkele code werkt nog. Zonder codes zet u de authenticator niet uit als de telefoon zoek is.'), actie: P('Створити нові коди', 'Nieuwe codes maken') });
  else uit.push({ id: 'codes', toon: 'slecht', sectie: 'recovery', titel: P('Кодів відновлення немає', 'Geen herstelcodes'), uitleg: P('Це запасний вхід на випадок, коли телефон або ключ доступу недоступні.', 'Dit is de reserve voor als de telefoon of de toegangssleutel niet beschikbaar is.'), actie: P('Створити коди відновлення', 'Herstelcodes maken') });

  // 3. Сховище ключів: passkey з PRF і код відновлення сховища.
  const kluisTitel = P('Ключ зашифрованих даних', 'Sleutel van de versleutelde gegevens');
  if (kluis === undefined) uit.push({ id: 'kluis', toon: 'onbekend', titel: kluisTitel, uitleg: P('Перевіряємо…', 'Bezig met controleren…') });
  else if (kluis === null) uit.push({ id: 'kluis', toon: 'onbekend', titel: kluisTitel, uitleg: P('Не вдалося перевірити сховище ключів. Відкрийте розділ «Безпека», щоб побачити його стан.', 'De sleutelkluis kon niet worden gecontroleerd. Open «Beveiliging» om de stand te zien.'), sectie: 'security', actie: P('До сховища ключів', 'Naar de sleutelkluis') });
  else if (kluis.stand === 'uit') uit.push({ id: 'kluis', toon: 'neutraal', titel: kluisTitel, uitleg: [`${KLUIS_TEKST.stand.uit.uk}. Окремий резерв для ключа не потрібен.`, `${KLUIS_TEKST.stand.uit.nl}. Een aparte reserve voor de sleutel is niet nodig.`] });
  else if (kluis.zonderOmslag) uit.push({ id: 'kluis', toon: 'slecht', sectie: 'security', titel: kluisTitel, uitleg: kluisP(KLUIS_TEKST.zonderOmslag), actie: P('До сховища ключів', 'Naar de sleutelkluis') });
  else {
    const prf = kluis.omslagen.passkeys.some((x) => x.prf);
    const code = kluis.omslagen.herstelcode !== null;
    if (prf && code && !kluis.herstelcodeWacht) uit.push({ id: 'kluis', toon: 'goed', titel: kluisTitel, uitleg: P('Ключ відкривається passkey з PRF, а в запасі є код відновлення сховища.', 'De sleutel opent met een passkey met PRF, en de herstelcode van de kluis ligt in reserve.') });
    else if (prf && code) uit.push({ id: 'kluis', toon: 'aandacht', sectie: 'security', titel: kluisTitel, uitleg: kluisP(KLUIS_TEKST.codeWacht), actie: P('Підтвердити новий код', 'Nieuwe code bevestigen') });
    else {
      const mist: Paar[] = [];
      if (!prf) mist.push(P('немає passkey з PRF — щоразу доведеться вводити код сховища', 'geen passkey met PRF — u moet telkens de kluiscode typen'));
      if (!code) mist.push(P('немає коду відновлення сховища — втрата всіх passkey означатиме втрату даних', 'geen herstelcode van de kluis — alle passkeys kwijt betekent de gegevens kwijt'));
      uit.push({ id: 'kluis', toon: 'slecht', sectie: 'security', titel: kluisTitel, uitleg: [mist.map((m) => m[0]).join('; ') + '.', mist.map((m) => m[1]).join('; ') + '.'], actie: P('До сховища ключів', 'Naar de sleutelkluis') });
    }
  }
  return uit;
}

/** Куди веде картка способу з eersteInTeStellen (passkey і автентифікатор — у «Безпеці», коди — у «Відновленні»). */
const KAART_SECTIE: Record<string, HerstelSectie> = { passkey: 'security', totp: 'security', recovery: 'recovery' };

/**
 * Що зробити першим. Пріоритет — той самий, що й у героя «Способів входу» (eersteInTeStellen); якщо там усе налаштовано,
 * перший червоний пункт огляду. Нічого не лишилось — null.
 */
export function eersteStap(snapshot: SnapshotLike, controles: Controle[]): { sectie: HerstelSectie; titel: Paar } | null {
  const kaart = eersteInTeStellen(snapshotNaarKaarten(snapshot));
  if (kaart && KAART_SECTIE[kaart.id]) return { sectie: KAART_SECTIE[kaart.id], titel: [`Налаштувати: ${kaart.titel[0]}`, `Instellen: ${kaart.titel[1]}`] };
  const rood = controles.find((c) => c.toon === 'slecht' && c.sectie);
  return rood ? { sectie: rood.sectie!, titel: rood.actie || rood.titel } : null;
}
