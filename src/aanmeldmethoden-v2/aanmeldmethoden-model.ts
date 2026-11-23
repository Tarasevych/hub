// Віха M2 (UI-015A, №167): чиста модель карткового подання розділу «Способи входу» / «Aanmeldmethoden».
// Жодних залежностей від React, мережі чи оглядача: перетворення знімка /api/owner/access/snapshot на картки,
// двомовний пошук без урахування регістру й діакритики та динамічний розподіл за групами.

export type Taal = 'uk' | 'nl';
export type Tweetalig = { uk: string; nl: string };

export const AANBIEDER_IDS = ['microsoft', 'apple', 'discord', 'telegram'] as const;
export type BekendeAanbiederId = (typeof AANBIEDER_IDS)[number];
export type AanbiederStatus = 'actief' | 'gereed-om-te-koppelen' | 'niet-geconfigureerd' | 'uitgeschakeld' | 'onbekend';
export const AANBIEDER_STATUSSEN: readonly AanbiederStatus[] = [
  'actief',
  'gereed-om-te-koppelen',
  'niet-geconfigureerd',
  'uitgeschakeld',
  'onbekend',
];

export interface Aanbieder {
  id: BekendeAanbiederId | string;
  status: AanbiederStatus;
  reden?: Tweetalig | string;
  accountLabel?: string;
  gekoppeldOp?: string;
  actieKoppelUrl?: string;
  kanLosmaken: boolean;
  losmaakUrl?: string;
  zelftest?: 'ok' | 'fout' | 'niet-uitgevoerd';
  aanmeldenVoorGebruiker?: boolean;
  ontbrekendeSleutels?: string[];
  vormFouten?: string[];
}

/** Безпечний відносний шлях того ж вузла: починається з однієї '/', без '//', '\\' та пробілів. */
export function isVeiligPad(u: unknown): u is string {
  return typeof u === 'string' && /^\/(?![/\\])/.test(u) && !/[\\\s]/.test(u) && !u.includes('//') && u.length <= 512;
}

/** Перевіряє запис зовнішнього постачальника зі знімка сервера. */
export function isAanbieder(x: unknown): x is Aanbieder {
  if (!x || typeof x !== 'object') return false;
  const a = x as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    a.id.length > 0 &&
    a.id.length <= 40 &&
    AANBIEDER_STATUSSEN.includes(a.status as AanbiederStatus) &&
    typeof a.kanLosmaken === 'boolean'
  );
}

export type KaartId =
  | 'google'
  | 'password'
  | 'passkey'
  | 'totp'
  | 'recovery'
  | 'vault'
  | 'guest-code'
  | `aanbieder:${string}`;

export type KaartStaat =
  | 'loading'
  | 'active'
  | 'ready'
  | 'not-configured'
  | 'attention'
  | 'unavailable'
  | 'unknown'
  | 'neutral';

export type KaartActie = 'manage' | 'setup' | 'connect' | 'view' | 'retry' | 'none';
export type Categorie = 'vhod' | 'passkey' | 'zakhyst' | 'dostup';
export type Groep = 'hoofd' | 'extra' | 'beschikbaar' | 'anderen';
export type Vermogen = 'sign-in' | 'step-up' | 'recovery' | 'encryption' | 'delegation';

export interface MethodeKaart {
  id: KaartId;
  anker?: string;
  groep: Groep;
  categorieen: Categorie[];
  vermogen: Vermogen;
  icoon: string;
  titel: Tweetalig;
  ondertitel: Tweetalig;
  staat: KaartStaat;
  reden?: Tweetalig;
  accountLabel?: string;
  feit?: Tweetalig;
  actie: KaartActie;
  koppelUrl?: string;
  beschermd?: boolean;
  gekoppeldOp?: string;
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

export const tekstVan = (t: Tweetalig | string | undefined, taal: Taal): string =>
  t == null ? '' : typeof t === 'string' ? t : t[taal];

export const isExterneAanbiederKaart = (k: MethodeKaart): boolean => k.id.startsWith('aanbieder:');

const NAMEN: Record<string, Tweetalig> = {
  microsoft: tw('Microsoft', 'Microsoft'),
  apple: tw('Apple', 'Apple'),
  discord: tw('Discord', 'Discord'),
  telegram: tw('Telegram', 'Telegram'),
};

const AANBIEDER_ONDERTITEL: Record<string, Tweetalig> = {
  microsoft: tw('Вхід через обліковий запис Microsoft', 'Aanmelden met een Microsoft-account'),
  apple: tw('Вхід через обліковий запис Apple', 'Aanmelden met Apple ID'),
  discord: tw('Вхід через обліковий запис Discord', 'Aanmelden met Discord'),
  telegram: tw('Швидкий вхід і підтвердження через Telegram', 'Snel aanmelden en bevestigen via Telegram'),
};

export const REDEN = {
  nietGecontroleerd: tw('Стан не вдалося перевірити', 'Status kon niet worden gecontroleerd'),
  sleutelsNodig: tw('Потрібні ключі постачальника на сервері', 'Sleutels van de aanbieder op de server nodig'),
  serverNogNiet: tw('Сервер ще не передав стан цього способу', 'De server meldde deze methode nog niet'),
  uitgeschakeld: tw('Вимкнено адміністратором', 'Uitgeschakeld door de beheerder'),
  googleSleutels: tw('Ключі Google на сервері не налаштовано', 'Google-sleutels op de server niet ingesteld'),
  enige: tw('Єдиний спосіб входу — захищено від вимкнення', 'Enige aanmeldmethode — beschermd tegen uitschakelen'),
  tijdelijk: tw('Тимчасовий пароль — потрібно змінити', 'Tijdelijk wachtwoord — wijzigen vereist'),
  weinigCodes: tw('Залишилося мало кодів — створіть нові', 'Nog weinig codes over — maak nieuwe aan'),
};

const BASIS: Record<
  'google' | 'password' | 'passkey' | 'totp' | 'recovery' | 'vault' | 'guest-code',
  Omit<MethodeKaart, 'staat' | 'actie'>
> = {
  google: {
    id: 'google',
    anker: 'aanmeldmethoden-google',
    groep: 'hoofd',
    categorieen: ['vhod'],
    vermogen: 'sign-in',
    icoon: 'google',
    titel: tw('Google', 'Google'),
    ondertitel: tw('Вхід через обліковий запис Google', 'Aanmelden met uw Google-account'),
  },
  password: {
    id: 'password',
    groep: 'hoofd',
    categorieen: ['vhod'],
    vermogen: 'sign-in',
    icoon: 'wachtwoord',
    titel: tw('Пароль', 'Wachtwoord'),
    ondertitel: tw('Вхід за паролем', 'Aanmelden met wachtwoord'),
  },
  passkey: {
    id: 'passkey',
    anker: 'aanmeldmethoden-passkeys',
    groep: 'hoofd',
    categorieen: ['passkey', 'zakhyst'],
    vermogen: 'step-up',
    icoon: 'passkey',
    titel: tw('Ключі доступу', 'Toegangssleutels'),
    ondertitel: tw('Відбиток пальця, обличчя або ключ безпеки', 'Vingerafdruk, gezicht of beveiligingssleutel'),
  },
  totp: {
    id: 'totp',
    anker: 'aanmeldmethoden-2fa',
    groep: 'hoofd',
    categorieen: ['zakhyst'],
    vermogen: 'step-up',
    icoon: 'totp',
    titel: tw('Застосунок-автентифікатор', 'Authenticator-app'),
    ondertitel: tw('6-значні коди з телефона, без SMS', '6-cijferige codes op uw telefoon, zonder sms'),
  },
  recovery: {
    id: 'recovery',
    anker: 'aanmeldmethoden-herstel',
    groep: 'extra',
    categorieen: ['zakhyst'],
    vermogen: 'recovery',
    icoon: 'herstel',
    titel: tw('Коди відновлення', 'Herstelcodes'),
    ondertitel: tw('Запасний вхід, коли основний пристрій недоступний', 'Reservetoegang wanneer uw hoofdapparaat ontbreekt'),
  },
  vault: {
    id: 'vault',
    anker: 'aanmeldmethoden-sleutelkluis',
    groep: 'extra',
    categorieen: ['zakhyst'],
    vermogen: 'encryption',
    icoon: 'kluis',
    titel: tw('Шифрування моїх даних', 'Versleuteling van mijn gegevens'),
    ondertitel: tw('Ключ, яким зашифровано ваші особисті дані', 'De sleutel waarmee uw persoonlijke gegevens versleuteld zijn'),
  },
  'guest-code': {
    id: 'guest-code',
    groep: 'anderen',
    categorieen: ['dostup'],
    vermogen: 'delegation',
    icoon: 'toegangscode',
    titel: tw('Коди доступу для інших', 'Toegangscodes voor anderen'),
    ondertitel: tw('Обмежений гостьовий перегляд на час із миттєвим відкликанням', 'Tijdelijke gastweergave met onmiddellijke intrekking'),
  },
};

function zonderData(k: Omit<MethodeKaart, 'staat' | 'actie'>, fase: Fase): MethodeKaart {
  if (fase === 'laden') return { ...k, staat: 'loading', actie: 'none' };
  if (fase === 'geen-toegang') return { ...k, staat: 'unavailable', reden: tw('Немає доступу', 'Geen toegang'), actie: 'none' };
  return { ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' };
}

function aanbiederKaart(id: string, a: Aanbieder | undefined, fase: Fase, veldAanwezig: boolean): MethodeKaart {
  const basis: Omit<MethodeKaart, 'staat' | 'actie'> = {
    id: `aanbieder:${id}`,
    groep: 'beschikbaar',
    categorieen: ['vhod'],
    vermogen: 'sign-in',
    icoon: id,
    titel: NAMEN[id] || tw(id, id),
    ondertitel: AANBIEDER_ONDERTITEL[id] || tw('Зовнішній спосіб входу', 'Externe aanmeldmethode'),
  };
  if (fase !== 'klaar') return zonderData(basis, fase);
  if (!veldAanwezig) return { ...basis, staat: 'unavailable', reden: REDEN.serverNogNiet, actie: 'none' };
  if (!a) return { ...basis, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'none' };
  const reden = a.reden ? (typeof a.reden === 'string' ? tw(a.reden, a.reden) : a.reden) : undefined;
  switch (a.status) {
    case 'actief':
      return {
        ...basis,
        groep: 'hoofd',
        staat: 'active',
        accountLabel: typeof a.accountLabel === 'string' ? a.accountLabel.slice(0, 120) : undefined,
        gekoppeldOp: typeof a.gekoppeldOp === 'string' ? a.gekoppeldOp : undefined,
        losmaakUrl: a.kanLosmaken && isVeiligPad(a.losmaakUrl) ? a.losmaakUrl : undefined,
        actie: 'manage',
        beschermd: !a.kanLosmaken,
      };
    case 'gereed-om-te-koppelen':
      return isVeiligPad(a.actieKoppelUrl)
        ? { ...basis, staat: 'ready', reden, actie: 'connect', koppelUrl: a.actieKoppelUrl }
        : { ...basis, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'none' };
    case 'niet-geconfigureerd':
      return { ...basis, staat: 'not-configured', reden: reden || REDEN.sleutelsNodig, actie: 'view' };
    case 'uitgeschakeld':
      return { ...basis, staat: 'unavailable', reden: reden || REDEN.uitgeschakeld, actie: 'none' };
    default:
      return { ...basis, staat: 'unknown', reden: reden || REDEN.nietGecontroleerd, actie: 'none' };
  }
}

export function aanbiedersUit(s: SnapshotInvoer | undefined): { aanwezig: boolean; lijst: Aanbieder[] } {
  const ruw = s?.aanbieders;
  if (!Array.isArray(ruw)) return { aanwezig: false, lijst: [] };
  return { aanwezig: true, lijst: ruw.filter(isAanbieder) };
}

/**
 * Перетворення знімка на картки способів входу без вигаданих чисел чи станів.
 */
export function snapshotNaarKaartenV2(fase: Fase, s?: SnapshotInvoer): MethodeKaart[] {
  const uit: MethodeKaart[] = [];
  const klaar = fase === 'klaar' && !!s;
  const f = klaar ? fase : fase === 'klaar' ? 'fout' : fase;
  const methode = (id: string) => s?.methods?.find((m) => m.id === id);
  const factor = (id: string) => s?.factors?.find((m) => m.id === id);
  const beschermd = !!s?.lockout?.protected;

  // Google
  {
    const k = BASIS.google;
    const m = methode('google');
    if (!klaar) uit.push(zonderData(k, f));
    else if (!m) uit.push({ ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
    else {
      const email = s!.bindings?.find((b) => b.method === 'google' && b.status !== 'revoked' && b.status !== 'disabled')?.email || undefined;
      if (m.status === 'loading') uit.push({ ...k, staat: 'loading', actie: 'none' });
      else if (m.enabled === false || m.status === 'disabled') uit.push({ ...k, staat: 'unavailable', reden: REDEN.uitgeschakeld, actie: 'view' });
      else if (m.status === 'active' || m.bound) {
        uit.push({
          ...k,
          staat: 'active',
          accountLabel: email,
          actie: 'manage',
          beschermd,
          reden: beschermd ? REDEN.enige : undefined,
        });
      } else if (m.status === 'ready') uit.push({ ...k, staat: 'ready', actie: 'view' });
      else if (m.status === 'not_configured') uit.push({ ...k, staat: 'not-configured', reden: REDEN.googleSleutels, actie: 'view' });
      else uit.push({ ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
    }
  }

  // Пароль: лише якщо він дійсно налаштований
  if (klaar) {
    const m = methode('password');
    if (m && (m.bound || s!.password?.configured)) {
      const k = BASIS.password;
      if (s!.password?.mustChange) uit.push({ ...k, staat: 'attention', reden: REDEN.tijdelijk, actie: 'manage', beschermd });
      else {
        uit.push({
          ...k,
          staat: m.enabled === false ? 'unavailable' : 'active',
          reden: m.enabled === false ? REDEN.uitgeschakeld : beschermd ? REDEN.enige : undefined,
          actie: 'manage',
          beschermd,
        });
      }
    }
  }

  // Зовнішні постачальники: активні потрапляють до «Підключених», решта — у «Доступні»
  const { aanwezig, lijst } = aanbiedersUit(klaar ? s : undefined);
  const aanbiederKaarten = AANBIEDER_IDS.map((id) => aanbiederKaart(id, lijst.find((a) => a.id === id), f, aanwezig));
  uit.push(...aanbiederKaarten.filter((k) => k.staat === 'active'));

  // Ключі доступу
  {
    const k = { ...BASIS.passkey, vermogen: beschermd ? ('step-up' as const) : ('sign-in' as const) };
    const x = factor('passkey');
    if (!klaar) uit.push(zonderData(k, f));
    else if (!x || x.status === 'loading') uit.push(x ? { ...k, staat: 'loading', actie: 'none' } : { ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
    else if (x.enabled === false) uit.push({ ...k, staat: 'unavailable', reden: REDEN.uitgeschakeld, actie: 'none' });
    else if ((x.count || 0) > 0 || x.enrolled) {
      uit.push({
        ...k,
        staat: 'active',
        feit: typeof x.count === 'number' ? tw(`Ключів: ${x.count}`, `Sleutels: ${x.count}`) : undefined,
        actie: 'manage',
      });
    } else if (x.status === 'not_enrolled' || x.status === 'not_configured') {
      uit.push({ ...k, staat: 'ready', actie: 'setup' });
    } else {
      uit.push({ ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
    }
  }

  // Застосунок-автентифікатор (TOTP)
  {
    const k = BASIS.totp;
    const x = factor('totp');
    if (!klaar) uit.push(zonderData(k, f));
    else if (!x || x.status === 'loading') uit.push(x ? { ...k, staat: 'loading', actie: 'none' } : { ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
    else if (x.enrolled || s!.totp?.enrolled) uit.push({ ...k, staat: 'active', actie: 'manage' });
    else if (x.enabled === false) uit.push({ ...k, staat: 'unavailable', reden: REDEN.uitgeschakeld, actie: 'none' });
    else if (x.status === 'not_enrolled' || x.status === 'not_configured') uit.push({ ...k, staat: 'ready', actie: 'setup' });
    else uit.push({ ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
  }

  // Коди відновлення
  {
    const k = BASIS.recovery;
    const x = factor('recovery');
    if (!klaar) uit.push(zonderData(k, f));
    else if (!x || x.status === 'loading') uit.push(x ? { ...k, staat: 'loading', actie: 'none' } : { ...k, staat: 'unknown', reden: REDEN.nietGecontroleerd, actie: 'retry' });
    else {
      const rest = typeof x.remaining === 'number' ? x.remaining : null;
      if (rest === null) uit.push({ ...k, staat: 'unknown', reden: tw('Не вдалося визначити', 'Kon niet worden bepaald'), actie: 'view' });
      else if (rest > 0) {
        uit.push({
          ...k,
          staat: rest <= 2 ? 'attention' : 'active',
          reden: rest <= 2 ? REDEN.weinigCodes : undefined,
          feit: tw(`Залишилося кодів: ${rest}`, `Resterende codes: ${rest}`),
          actie: 'manage',
        });
      } else if (x.enrolled) {
        uit.push({ ...k, staat: 'attention', reden: REDEN.weinigCodes, feit: tw('Залишилося кодів: 0', 'Resterende codes: 0'), actie: 'setup' });
      } else {
        uit.push({ ...k, staat: 'ready', actie: 'setup' });
      }
    }
  }

  // Сховище ключів та гостьові коди завантажують власний живий стан у панелі подробиць
  uit.push(f === 'klaar' || f === 'laden' ? { ...BASIS.vault, staat: f === 'laden' ? 'loading' : 'neutral', actie: f === 'laden' ? 'none' : 'view' } : zonderData(BASIS.vault, f));
  uit.push(f === 'klaar' || f === 'laden' ? { ...BASIS['guest-code'], staat: f === 'laden' ? 'loading' : 'neutral', actie: f === 'laden' ? 'none' : 'view' } : zonderData(BASIS['guest-code'], f));
  uit.push(...aanbiederKaarten.filter((k) => k.staat !== 'active'));
  return uit;
}

export const snapshotToMethodCards = snapshotNaarKaartenV2;

export const CATEGORIEEN: Array<{ id: 'alle' | Categorie; titel: Tweetalig }> = [
  { id: 'alle', titel: tw('Усі', 'Alle') },
  { id: 'vhod', titel: tw('Вхід', 'Aanmelden') },
  { id: 'passkey', titel: tw('Ключі доступу', 'Toegangssleutels') },
  { id: 'zakhyst', titel: tw('Захист', 'Beveiliging') },
  { id: 'dostup', titel: tw('Доступ іншим', 'Toegang voor anderen') },
];

export function filterKaarten(
  kaarten: MethodeKaart[],
  categorie: 'alle' | Categorie,
  zoek: string,
  alleen?: 'methods' | 'security' | 'recovery',
): MethodeKaart[] {
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = norm(zoek.trim());
  return kaarten.filter((k) => {
    if (alleen === 'methods' && ['totp', 'recovery', 'vault'].includes(k.id)) return false;
    if (alleen === 'security' && !['passkey', 'totp', 'vault', 'guest-code'].includes(k.id)) return false;
    if (alleen === 'recovery' && !['recovery', 'vault'].includes(k.id)) return false;
    const catOk = categorie === 'alle' || k.categorieen.includes(categorie);
    const zoekOk = !q || norm([k.titel.uk, k.titel.nl, k.ondertitel.uk, k.ondertitel.nl, k.accountLabel || ''].join(' ')).includes(q);
    return catOk && zoekOk;
  });
}

export function weergaveGroep(k: MethodeKaart): 'verbonden' | 'beschikbaar' | 'extra' | 'anderen' {
  if (k.groep === 'anderen') return 'anderen';
  if (k.groep === 'extra') return 'extra';
  if (k.groep === 'beschikbaar') return 'beschikbaar';
  return k.staat === 'active' || k.staat === 'attention' ? 'verbonden' : 'beschikbaar';
}

export function staatLabel(k: MethodeKaart, lang: Taal): string {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  switch (k.staat) {
    case 'active':
      return isExterneAanbiederKaart(k) ? tr('Підключено', 'Gekoppeld') : tr('Увімкнено', 'Ingeschakeld');
    case 'ready':
      return k.actie === 'connect' ? tr('Готово до підключення', 'Klaar om te koppelen') : tr('Не налаштовано', 'Niet ingesteld');
    case 'attention':
      return tekstVan(k.reden, lang) || tr('Потребує уваги', 'Vraagt aandacht');
    case 'not-configured':
    case 'unavailable':
    case 'unknown':
      return tekstVan(k.reden, lang) || tr('Стан не вдалося перевірити', 'Status kon niet worden gecontroleerd');
    default:
      return '';
  }
}

export function actieLabel(k: MethodeKaart, lang: Taal): string {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  return ({
    manage: tr('Керувати', 'Beheren'),
    setup: tr('Налаштувати', 'Instellen'),
    connect: tr('Підключити', 'Koppelen'),
    view: tr('Переглянути', 'Bekijken'),
    retry: tr('Повторити', 'Opnieuw'),
    none: '',
  } as const)[k.actie];
}

export const TAB_NAAR_KAART: Record<string, KaartId> = {
  methods: 'google',
  security: 'totp',
  recovery: 'recovery',
};

export const ANKER_NAAR_KAART: Record<string, KaartId> = {
  'aanmeldmethoden-google': 'google',
  'aanmeldmethoden-2fa': 'totp',
  'aanmeldmethoden-herstel': 'recovery',
  'aanmeldmethoden-passkeys': 'passkey',
  'aanmeldmethoden-sleutelkluis': 'vault',
};
