// UI-015 (vlag `aanmeldmethoden-v2`, standaard UIT) — model van de nieuwe pagina «Способи входу» / «Aanmeldmethoden».
// PUUR: geen React, geen netwerk. Twee dingen:
//  1. Het contract `Aanbieder` (UI-015A ↔ UI-015B, zie /workspace/wp-ui015/CONTRACT-AANBIEDERS.md): externe aanmeldaanbieders
//     (Microsoft, Apple, Discord, Telegram) zoals de server ze in de snapshot (`aanbieders`) meldt.
//  2. `snapshotToMethodCards()`: zet de echte snapshot van /api/owner/access/snapshot om in kaarten. Regel: nooit «Підключено»
//     zonder bevestiging van de server; mislukt laden = «Стан не вдалося перевірити»; 403 = «Немає доступу»; laden = skelet.

export type Taal = 'uk' | 'nl';
export type Tweetalig = { uk: string; nl: string };

// ── Contract aanbieders ─────────────────────────────────────────────────────────────────────────────────────────────
export const AANBIEDER_IDS = ['microsoft', 'apple', 'discord', 'telegram'] as const;
export type BekendeAanbiederId = typeof AANBIEDER_IDS[number];
export type AanbiederStatus = 'actief' | 'gereed-om-te-koppelen' | 'niet-geconfigureerd' | 'uitgeschakeld' | 'onbekend';
export const AANBIEDER_STATUSSEN: readonly AanbiederStatus[] = ['actief', 'gereed-om-te-koppelen', 'niet-geconfigureerd', 'uitgeschakeld', 'onbekend'];
export interface Aanbieder {
  id: BekendeAanbiederId | string;
  status: AanbiederStatus;
  /** Mensentaal (uk+nl), nooit geheimen. Een kale string geldt voor beide talen. */
  reden?: Tweetalig | string;
  /** Alleen bij 'actief': e-mail of gebruikersnaam zoals de aanbieder die gaf (geen tokens of subject-id's). */
  accountLabel?: string;
  /** Alleen bij 'actief': ISO 8601. */
  gekoppeldOp?: string;
  /** Alleen bij 'gereed-om-te-koppelen': same-origin pad dat de echte koppelflow start. */
  actieKoppelUrl?: string;
  /** false als dit de laatste werkende aanmeldmethode is of het beleid losmaken verbiedt. */
  kanLosmaken: boolean;
  /** Optioneel: same-origin POST-route om los te koppelen (UI roept die pas aan na bevestigToegang). */
  losmaakUrl?: string;
}

/** Veilig same-origin pad: begint met één '/', geen '//' of '\\', geen schema. */
export function isVeiligPad(u: unknown): u is string {
  return typeof u === 'string' && /^\/(?![/\\])/.test(u) && !/[\\\s]/.test(u) && !u.includes('//') && u.length <= 512;
}

/** Valideert één aanbieder uit de server (alles wat niet klopt wordt weggelaten, niet geraden). */
export function isAanbieder(x: unknown): x is Aanbieder {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  return typeof a.id === 'string' && a.id.length > 0 && a.id.length <= 40 && AANBIEDER_STATUSSEN.includes(a.status as AanbiederStatus) && typeof a.kanLosmaken === 'boolean';
}

// ── Kaarten ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export type KaartId = 'google' | 'password' | 'passkey' | 'totp' | 'recovery' | 'vault' | 'guest-code' | `aanbieder:${string}`;
/** UI-staat (UI ≠ bevestiging backend; alleen 'active' zegt «Підключено»/«Активний», en alleen als de server het zei). */
export type KaartStaat = 'loading' | 'active' | 'ready' | 'not-configured' | 'attention' | 'unavailable' | 'unknown' | 'neutral';
export type KaartActie = 'manage' | 'setup' | 'connect' | 'view' | 'retry' | 'none';
export type Categorie = 'vhod' | 'passkey' | 'zakhyst' | 'dostup';
export type Groep = 'hoofd' | 'extra' | 'beschikbaar' | 'anderen';
export type Vermogen = 'sign-in' | 'step-up' | 'recovery' | 'encryption' | 'delegation';

export interface MethodeKaart {
  id: KaartId;
  /** Sectie-anker (deep-link-compatibel), bv. 'aanmeldmethoden-google'. */
  anker?: string;
  groep: Groep;
  categorieen: Categorie[];
  vermogen: Vermogen;
  /** Sleutel van logo of semantisch icoon (src/aanmeldmethoden-v2/iconen). */
  icoon: string;
  titel: Tweetalig;
  ondertitel: Tweetalig;
  staat: KaartStaat;
  /** Gelokaliseerde reden bij not-configured/unavailable/unknown/attention. */
  reden?: Tweetalig;
  accountLabel?: string;
  /** Kleine extra feit uit de server (bv. «3 ключі», «7 кодів залишилось»). */
  feit?: Tweetalig;
  actie: KaartActie;
  /** Alleen bij 'connect': same-origin pad. */
  koppelUrl?: string;
  /** Laatste werkende aanmeldmethode: niet uit te schakelen. */
  beschermd?: boolean;
  /** Alleen externe aanbieder, 'active': ISO-datum van de koppeling (server). */
  gekoppeldOp?: string;
  /** Alleen externe aanbieder, 'active' en kanLosmaken: same-origin POST-route. */
  losmaakUrl?: string;
}

export type Fase = 'laden' | 'klaar' | 'fout' | 'geen-toegang';

type M = { id: string; enabled?: boolean; configured?: boolean; bound?: boolean; status?: string; honest?: string };
type F = { id: string; enabled?: boolean; enrolled?: boolean; status?: string; remaining?: number; count?: number };
export interface SnapshotInvoer {
  methods?: M[];
  factors?: F[];
  bindings?: Array<{ method?: string; email?: string; status?: string }>;
  lockout?: { protected?: boolean };
  password?: { configured?: boolean; mustChange?: boolean };
  totp?: { enrolled?: boolean };
  aanbieders?: unknown;
}

const tw = (uk: string, nl: string): Tweetalig => ({ uk, nl });
export const tekstVan = (t: Tweetalig | string | undefined, taal: Taal): string => (t == null ? '' : typeof t === 'string' ? t : t[taal]);

const NAMEN: Record<string, Tweetalig> = {
  microsoft: tw('Microsoft', 'Microsoft'), apple: tw('Apple', 'Apple'), discord: tw('Discord', 'Discord'), telegram: tw('Telegram', 'Telegram'),
};
const AANBIEDER_ONDERTITEL: Record<string, Tweetalig> = {
  microsoft: tw('Вхід через обліковий запис Microsoft', 'Aanmelden met een Microsoft-account'),
  apple: tw('Вхід через Apple ID', 'Aanmelden met Apple ID'),
  discord: tw('Вхід через Discord', 'Aanmelden met Discord'),
  telegram: tw('Швидкий вхід через Telegram', 'Snel aanmelden met Telegram'),
};

export const REDEN = {
  nietGecontroleerd: tw('Стан не вдалося перевірити', 'Status kon niet worden gecontroleerd'),
  sleutelsNodig: tw('Потрібні ключі провайдера', 'Sleutels van de aanbieder nodig'),
  serverNogNiet: tw('Сервер ще не підтримує цей спосіб', 'De server ondersteunt deze methode nog niet'),
  uitgeschakeld: tw('Вимкнено адміністратором', 'Uitgeschakeld door de beheerder'),
  googleSleutels: tw('Ключі Google на сервері не налаштовано', 'Google-sleutels op de server niet ingesteld'),
  enige: tw('Єдиний спосіб входу — вимкнути не можна', 'Enige aanmeldmethode — kan niet uit'),
  tijdelijk: tw('Тимчасовий пароль — потрібно змінити', 'Tijdelijk wachtwoord — wijzigen vereist'),
  weinigCodes: tw('Залишилося мало кодів — створіть нові', 'Nog maar weinig codes — maak nieuwe'),
};

const BASIS: Record<'google' | 'password' | 'passkey' | 'totp' | 'recovery' | 'vault' | 'guest-code', Omit<MethodeKaart, 'staat' | 'actie'>> = {
  google: { id: 'google', anker: 'aanmeldmethoden-google', groep: 'hoofd', categorieen: ['vhod'], vermogen: 'sign-in', icoon: 'google', titel: tw('Google', 'Google'), ondertitel: tw('Вхід через Google-акаунт', 'Aanmelden met je Google-account') },
  password: { id: 'password', groep: 'hoofd', categorieen: ['vhod'], vermogen: 'sign-in', icoon: 'wachtwoord', titel: tw('Пароль', 'Wachtwoord'), ondertitel: tw('Вхід за паролем', 'Aanmelden met wachtwoord') },
  passkey: { id: 'passkey', anker: 'aanmeldmethoden-passkeys', groep: 'hoofd', categorieen: ['passkey', 'zakhyst'], vermogen: 'step-up', icoon: 'passkey', titel: tw('Ключі доступу (passkey)', 'Toegangssleutels (passkey)'), ondertitel: tw('Відбиток, обличчя або ключ безпеки', 'Vingerafdruk, gezicht of beveiligingssleutel') },
  totp: { id: 'totp', anker: 'aanmeldmethoden-2fa', groep: 'hoofd', categorieen: ['zakhyst'], vermogen: 'step-up', icoon: 'totp', titel: tw('Застосунок-автентифікатор', 'Authenticator-app'), ondertitel: tw('6-значні коди з телефону, без SMS', '6-cijferige codes op je telefoon, zonder sms') },
  recovery: { id: 'recovery', anker: 'aanmeldmethoden-herstel', groep: 'extra', categorieen: ['zakhyst'], vermogen: 'recovery', icoon: 'herstel', titel: tw('Коди відновлення', 'Herstelcodes'), ondertitel: tw('Запасний вхід, якщо інше недоступне', 'Reserve-toegang als de rest niet werkt') },
  vault: { id: 'vault', anker: 'aanmeldmethoden-sleutelkluis', groep: 'extra', categorieen: ['zakhyst'], vermogen: 'encryption', icoon: 'kluis', titel: tw('Шифрування моїх даних', 'Versleuteling van mijn gegevens'), ondertitel: tw('Ключ, яким зашифровано ваші дані', 'De sleutel waarmee je gegevens versleuteld zijn') },
  'guest-code': { id: 'guest-code', groep: 'anderen', categorieen: ['dostup'], vermogen: 'delegation', icoon: 'toegangscode', titel: tw('Коди доступу для інших', 'Toegangscodes voor anderen'), ondertitel: tw('Обмежений доступ на час, з відкликанням', 'Beperkte toegang voor een tijd, intrekbaar') },
};

/** Wat laden/fout/403 met ELKE server-afhankelijke kaart doet. */
function zonderData(k: Omit<MethodeKaart, 'staat' | 'actie'>, fase: Fase): MethodeKaart {
  if (fase === 'laden') return { ...k, staat: 'loading', actie: 'none' };
  if (fase === 'geen-toegang') return { ...k, staat: 'unavailable', reden: tw('Немає доступу', 'Geen toegang'), actie: 'none' };
  return { ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' };
}

function aanbiederKaart(id: string, a: Aanbieder | undefined, fase: Fase, veldAanwezig: boolean): MethodeKaart {
  const basis: Omit<MethodeKaart, 'staat' | 'actie'> = { id: `aanbieder:${id}`, groep: 'beschikbaar', categorieen: ['vhod'], vermogen: 'sign-in', icoon: id, titel: NAMEN[id] || tw(id, id), ondertitel: AANBIEDER_ONDERTITEL[id] || tw('Зовнішній вхід', 'Externe aanmelding') };
  if (fase !== 'klaar') return zonderData(basis, fase);
  if (!veldAanwezig) return { ...basis, staat: 'unavailable', reden: REDEN.serverNogNiet, actie: 'none' };
  if (!a) return { ...basis, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'none' };
  const reden = a.reden ? (typeof a.reden === 'string' ? tw(a.reden, a.reden) : a.reden) : undefined;
  switch (a.status) {
    case 'actief': return { ...basis, groep: 'hoofd', staat: 'active', accountLabel: typeof a.accountLabel === 'string' ? a.accountLabel.slice(0, 120) : undefined, gekoppeldOp: typeof a.gekoppeldOp === 'string' ? a.gekoppeldOp : undefined, losmaakUrl: a.kanLosmaken && isVeiligPad(a.losmaakUrl) ? a.losmaakUrl : undefined, actie: 'manage', beschermd: !a.kanLosmaken };
    case 'gereed-om-te-koppelen': return isVeiligPad(a.actieKoppelUrl)
      ? { ...basis, staat: 'ready', reden, actie: 'connect', koppelUrl: a.actieKoppelUrl }
      : { ...basis, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'none' };
    case 'niet-geconfigureerd': return { ...basis, staat: 'not-configured', reden: REDEN.sleutelsNodig, actie: 'none' };
    case 'uitgeschakeld': return { ...basis, staat: 'unavailable', reden: reden || REDEN.uitgeschakeld, actie: 'none' };
    default: return { ...basis, staat: 'unknown', reden: reden || REDEN.nietGecontroleerd, actie: 'none' };
  }
}

/** Externe aanbieders uit de snapshot: alleen geldige items; de vier bekende altijd (eerlijke staat), onbekende id's genegeerd. */
export function aanbiedersUit(s: SnapshotInvoer | undefined): { aanwezig: boolean; lijst: Aanbieder[] } {
  const ruw = s?.aanbieders;
  if (!Array.isArray(ruw)) return { aanwezig: false, lijst: [] };
  return { aanwezig: true, lijst: ruw.filter(isAanbieder) };
}

/**
 * Snapshot → kaarten. Puur. `fase`: laden (skelet), klaar (snapshot gelezen), fout (netwerk/5xx: «не вдалося перевірити»),
 * geen-toegang (403). Volgorde = weergavevolgorde.
 */
export function snapshotToMethodCards(fase: Fase, s?: SnapshotInvoer): MethodeKaart[] {
  const uit: MethodeKaart[] = [];
  const klaar = fase === 'klaar' && !!s;
  const f = klaar ? fase : (fase === 'klaar' ? 'fout' : fase);
  const methode = (id: string) => s?.methods?.find((m) => m.id === id);
  const factor = (id: string) => s?.factors?.find((m) => m.id === id);
  const beschermd = !!s?.lockout?.protected;

  // Google
  {
    const k = BASIS.google; const m = methode('google');
    if (!klaar) uit.push(zonderData(k, f));
    else if (!m) uit.push({ ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
    else {
      const email = s!.bindings?.find((b) => b.method === 'google' && b.status !== 'revoked')?.email || undefined;
      if (m.status === 'loading') uit.push({ ...k, staat: 'loading', actie: 'none' });
      else if (m.enabled === false || m.status === 'disabled') uit.push({ ...k, staat: 'unavailable', reden: REDEN.uitgeschakeld, actie: 'view' });
      else if (m.status === 'active' || m.bound) uit.push({ ...k, staat: 'active', accountLabel: email, actie: 'manage', beschermd, reden: beschermd ? REDEN.enige : undefined });
      else if (m.status === 'ready') uit.push({ ...k, staat: 'ready', actie: 'view' });
      else if (m.status === 'not_configured') uit.push({ ...k, staat: 'not-configured', reden: REDEN.googleSleutels, actie: 'view' });
      else uit.push({ ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
    }
  }
  // Wachtwoord: alleen als het echt bestaat (bound/configured) — anders geen kaart.
  if (klaar) {
    const m = methode('password');
    if (m && (m.bound || s!.password?.configured)) {
      const k = BASIS.password;
      if (s!.password?.mustChange) uit.push({ ...k, staat: 'attention', reden: REDEN.tijdelijk, actie: 'manage', beschermd });
      else uit.push({ ...k, staat: m.enabled === false ? 'unavailable' : 'active', reden: m.enabled === false ? REDEN.uitgeschakeld : undefined, actie: 'manage', beschermd });
    }
  }
  // Externe aanbieders die de server als actief meldt komen bij «Підключені» (hoofd); de rest bij «Доступні».
  const { aanwezig, lijst } = aanbiedersUit(klaar ? s : undefined);
  const aanbiederKaarten = AANBIEDER_IDS.map((id) => aanbiederKaart(id, lijst.find((a) => a.id === id), f, aanwezig));
  uit.push(...aanbiederKaarten.filter((k) => k.staat === 'active'));
  // Passkey
  {
    const k = BASIS.passkey; const x = factor('passkey');
    if (!klaar) uit.push(zonderData(k, f));
    else if (!x || x.status === 'loading') uit.push(x ? { ...k, staat: 'loading', actie: 'none' } : { ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
    else if (x.enabled === false) uit.push({ ...k, staat: 'unavailable', reden: REDEN.uitgeschakeld, actie: 'none' });
    else if ((x.count || 0) > 0 || x.enrolled) uit.push({ ...k, staat: 'active', feit: tw(`Ключів: ${x.count || 0}`, `Sleutels: ${x.count || 0}`), actie: 'manage' });
    else uit.push({ ...k, staat: 'ready', actie: 'setup' });
  }
  // TOTP
  {
    const k = BASIS.totp; const x = factor('totp');
    if (!klaar) uit.push(zonderData(k, f));
    else if (!x || x.status === 'loading') uit.push(x ? { ...k, staat: 'loading', actie: 'none' } : { ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
    else if (x.enrolled) uit.push({ ...k, staat: 'active', actie: 'manage' });
    else if (x.enabled === false) uit.push({ ...k, staat: 'unavailable', reden: REDEN.uitgeschakeld, actie: 'none' });
    else uit.push({ ...k, staat: 'ready', actie: 'setup' });
  }
  // Herstelcodes: alleen het echte aantal.
  {
    const k = BASIS.recovery; const x = factor('recovery');
    if (!klaar) uit.push(zonderData(k, f));
    else if (!x || x.status === 'loading') uit.push(x ? { ...k, staat: 'loading', actie: 'none' } : { ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
    else {
      const rest = typeof x.remaining === 'number' ? x.remaining : null;
      if (rest === null) uit.push({ ...k, staat: 'unknown', reden: tw('Не вдалося визначити', 'Kon niet worden bepaald'), actie: 'view' });
      else if (rest > 0) uit.push({ ...k, staat: rest <= 2 ? 'attention' : 'active', reden: rest <= 2 ? REDEN.weinigCodes : undefined, feit: tw(`Залишилося кодів: ${rest}`, `Codes over: ${rest}`), actie: 'manage' });
      else uit.push({ ...k, staat: 'ready', actie: 'setup' });
    }
  }
  // Kluis en toegangscodes laden hun eigen gegevens in de details (eigen API's): hier geen bewering over de staat.
  uit.push(f === 'klaar' || f === 'laden' ? { ...BASIS.vault, staat: f === 'laden' ? 'loading' : 'neutral', actie: f === 'laden' ? 'none' : 'view' } : zonderData(BASIS.vault, f));
  uit.push(f === 'klaar' || f === 'laden' ? { ...BASIS['guest-code'], staat: f === 'laden' ? 'loading' : 'neutral', actie: f === 'laden' ? 'none' : 'view' } : zonderData(BASIS['guest-code'], f));
  uit.push(...aanbiederKaarten.filter((k) => k.staat !== 'active'));
  return uit;
}

export const CATEGORIEEN: Array<{ id: 'alle' | Categorie; titel: Tweetalig }> = [
  { id: 'alle', titel: tw('Усі', 'Alle') },
  { id: 'vhod', titel: tw('Вхід', 'Aanmelden') },
  { id: 'passkey', titel: tw('Passkey', 'Passkey') },
  { id: 'zakhyst', titel: tw('Захист', 'Beveiliging') },
  { id: 'dostup', titel: tw('Доступ іншим', 'Toegang voor anderen') },
];

/** Zoeken in titel/ondertitel/accountlabel in BEIDE talen; hoofdletter- en accentongevoelig. */
export function filterKaarten(kaarten: MethodeKaart[], categorie: 'alle' | Categorie, zoek: string): MethodeKaart[] {
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(zoek.trim());
  return kaarten.filter((k) => (categorie === 'alle' || k.categorieen.includes(categorie)) &&
    (!q || norm([k.titel.uk, k.titel.nl, k.ondertitel.uk, k.ondertitel.nl, k.accountLabel || ''].join(' ')).includes(q)));
}

/** Groep voor de weergave: actief → «Підключені», anders volgens de basisgroep. */
export function weergaveGroep(k: MethodeKaart): 'verbonden' | 'beschikbaar' | 'extra' | 'anderen' {
  if (k.groep === 'anderen') return 'anderen';
  if (k.groep === 'extra') return 'extra';
  if (k.groep === 'beschikbaar') return 'beschikbaar';
  return k.staat === 'active' || k.staat === 'attention' ? 'verbonden' : 'beschikbaar';
}

/** Tab-route → kaart die moet openen/oplichten (deep-links blijven werken). */
export const TAB_NAAR_KAART: Record<string, KaartId> = { methods: 'google', security: 'totp', recovery: 'recovery' };
/** Oude sectie-ankers → kaart (bv. #aanmeldmethoden-passkeys). */
export const ANKER_NAAR_KAART: Record<string, KaartId> = {
  'aanmeldmethoden-google': 'google', 'aanmeldmethoden-2fa': 'totp', 'aanmeldmethoden-herstel': 'recovery', 'aanmeldmethoden-passkeys': 'passkey', 'aanmeldmethoden-sleutelkluis': 'vault',
};
