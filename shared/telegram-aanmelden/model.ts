// TELEGRAM-AANMELDEN v1 — gedeeld model (server én browser). Vlag `telegram-aanmelden-v1` (migratie 0201), standaard UIT:
// met de vlag uit gedraagt de site zich exact als 20261109-105221 (geen knop, geen route die iets doet, geen bot).
//
// Bouwt voort op UI-015 (`aanmeldmethoden-vnext`, backend/aanmeld-koppel.ts met de aanmeldvenster-controle) en vervangt die
// niet: dit is de «slimme» laag erbovenop (bot, kaarten, wijzigingsdetectie, bevestigingsmatrix, geheime code, statusdienst).

export const TELEGRAM_VLAG = 'telegram-aanmelden-v1';

export type Taal = 'uk' | 'nl';
export type Tekst = readonly [uk: string, nl: string];
export const tekstIn = (t: Tekst, taal: Taal): string => (taal === 'nl' ? t[1] : t[0]);

/** Wat één koppeling mag (per koppeling instelbaar door de eigenaar van het account). */
export const KOPPEL_RECHTEN = ['aanmelden', 'bevestigen', 'meldingen'] as const;
export type KoppelRecht = typeof KOPPEL_RECHTEN[number];
export const isKoppelRecht = (v: unknown): v is KoppelRecht => typeof v === 'string' && (KOPPEL_RECHTEN as readonly string[]).includes(v);

/**
 * Stand van een koppeling:
 *  - actief        : alles werkt volgens de rechten;
 *  - gepauzeerd    : er is een wijziging gezien (gebruikersnaam/naam/foto/apparaat) die nog met een toegangssleutel bevestigd moet worden;
 *  - geblokkeerd   : telefoonnummer gewijzigd → alleen volledig opnieuw koppelen (nieuw contact + toegangssleutel);
 *  - uitgeschakeld : «Це не я», verdachte gebeurtenis, onbeantwoorde wijziging of ontkoppeld → alleen opnieuw koppelen vanaf nul.
 */
export const KOPPEL_STANDEN = ['actief', 'gepauzeerd', 'geblokkeerd', 'uitgeschakeld'] as const;
export type KoppelStand = typeof KOPPEL_STANDEN[number];

/** De vingerafdruk van een Telegram-account zoals bij het koppelen vastgelegd — altijd VOLLEDIG getoond aan eigenaar en beheer. */
export type Vingerafdruk = {
  telegramId: string;        // onveranderlijk; afwijking = vervalsing
  telefoon: string;          // alleen uit een eigen gedeeld contact (request_contact), nooit getypt
  gebruikersnaam: string;    // zonder @, kan leeg zijn
  voornaam: string;
  achternaam: string;
  fotoId: string;            // file_unique_id van de profielfoto (of leeg)
};
export const VINGERAFDRUK_VELDEN = ['telegramId', 'telefoon', 'gebruikersnaam', 'voornaam', 'achternaam', 'fotoId'] as const;
export type VingerafdrukVeld = typeof VINGERAFDRUK_VELDEN[number];

export type KoppelingPubliek = {
  id: string;
  naam: string;              // eigen naam, bv. «Особистий»
  rechten: KoppelRecht[];
  stand: KoppelStand;
  vingerafdruk: Vingerafdruk;
  aangemaaktOp: string;
  laatstGebruiktOp: string | null;
  kleur: string;             // kleur van de strook «🔵 Мій простір · Ім'я»
};

/** Instellingen die de beheerder in «Способи входу» → Telegram/Захист zet. Alles data, geen nieuwe bouw nodig. */
export type TelegramInstellingen = {
  aan: boolean;                         // noodschakelaar: uit = Telegram-aanmelden voor iedereen dicht
  afbeeldingen: boolean;                // kaarten als afbeelding (sendPhoto)
  animatie: boolean;                    // korte animatie bij succes (sendAnimation)
  koppelLimiet: number;                 // max. Telegram-koppelingen per account (standaard 3)
  aftelSeconden: number;                // «Так, це я» bij gewone wijzigingen (standaard 5)
  aftelSecondenErnstig: number;         // ernstige wijzigingen (standaard 10) + vinkje
  onbeantwoordUren: number;             // geen antwoord → koppeling uit (standaard 24)
  knopTokenSeconden: number;            // levensduur van een knoptoken (120..300)
  pogingenPerMinuut: number;            // snelheidslimiet per Telegram-gebruiker
  code: { minLengte: number; maxLengte: number; pauzeNa: number; pauzeMinuten: number; uitNa: number; verplichtVoor: string[] };
  telefoonVerplicht: true;              // vast: zonder eigen gedeeld nummer geen koppeling (besluit van de eigenaar)
  wieMag: 'eigenaar' | 'eigenaar-en-gasten' | 'niemand';
  /** Verwachte gebruikersnaam van de bot (zonder @). «Налаштувати бота» controleert met getMe dat de sleutel bij deze bot hoort. */
  botGebruikersnaam: string;
  bot: { naam: Record<string, string>; kort: Record<string, string>; omschrijving: Record<string, string>; talen: string[] };
};

export const STANDAARD_INSTELLINGEN: TelegramInstellingen = {
  aan: true,
  afbeeldingen: true,
  animatie: true,
  koppelLimiet: 3,
  aftelSeconden: 5,
  aftelSecondenErnstig: 10,
  onbeantwoordUren: 24,
  knopTokenSeconden: 180,
  pogingenPerMinuut: 20,
  code: { minLengte: 6, maxLengte: 12, pauzeNa: 3, pauzeMinuten: 15, uitNa: 5, verplichtVoor: [] },
  telefoonVerplicht: true,
  wieMag: 'eigenaar-en-gasten',
  botGebruikersnaam: 'MijnRuimte_Bot',
  bot: {
    naam: { uk: 'Мій простір — вхід', nl: 'Mijn Ruimte — aanmelden', standaard: 'Мій простір · Mijn Ruimte' },
    kort: {
      uk: 'Безпечний вхід і сповіщення для «Мій простір».',
      nl: 'Veilig aanmelden en meldingen voor «Mijn Ruimte».',
      standaard: 'Безпечний вхід · Veilig aanmelden — «Мій простір / Mijn Ruimte».',
    },
    omschrijving: {
      uk: 'Офіційний бот сайту «Мій простір» (id.tarasevych.com). Підтверджує вхід і важливі дії, показує сповіщення. Я ніколи не прошу паролів чи кодів.',
      nl: 'Officiële bot van «Mijn Ruimte» (id.tarasevych.com). Bevestigt aanmeldingen en belangrijke handelingen en toont meldingen. Ik vraag nooit om wachtwoorden of codes.',
      standaard: 'Офіційний бот «Мій простір» · Officiële bot van «Mijn Ruimte». Я ніколи не прошу паролів чи кодів. · Ik vraag nooit om wachtwoorden of codes.',
    },
    talen: ['uk', 'nl'],
  },
};

const tussen = (v: unknown, min: number, max: number, std: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : std;
};
const tekstKaart = (v: unknown, std: Record<string, string>, max: number): Record<string, string> => {
  const uit: Record<string, string> = { ...std };
  if (v && typeof v === 'object') for (const [k, w] of Object.entries(v as Record<string, unknown>)) {
    if (/^[a-z]{2}$|^standaard$/.test(k) && typeof w === 'string') uit[k] = w.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  }
  return uit;
};

/** Telegram: 5–32 tekens, letters/cijfers/_, begint met een letter, eindigt op «bot» (bv. MijnRuimte_Bot). */
export const isBotGebruikersnaam = (v: unknown): boolean => typeof v === 'string' && /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v) && /bot$/i.test(v);

/** Normaliseert invoer van de beheerder naar veilige grenzen; onbekende velden vallen weg. */
export function instellingenNormaliseren(v: unknown): TelegramInstellingen {
  const i = (v && typeof v === 'object' ? v : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const s = STANDAARD_INSTELLINGEN;
  const c = (i.code && typeof i.code === 'object' ? i.code : {}) as Record<string, unknown>;
  const minLengte = tussen(c.minLengte, 6, 12, s.code.minLengte);
  const talen = Array.isArray(i.bot?.talen) ? [...new Set((i.bot.talen as unknown[]).filter((t): t is string => typeof t === 'string' && /^[a-z]{2}$/.test(t)))].slice(0, 12) : s.bot.talen;
  return {
    aan: typeof i.aan === 'boolean' ? i.aan : s.aan,
    afbeeldingen: typeof i.afbeeldingen === 'boolean' ? i.afbeeldingen : s.afbeeldingen,
    animatie: typeof i.animatie === 'boolean' ? i.animatie : s.animatie,
    koppelLimiet: tussen(i.koppelLimiet, 1, 10, s.koppelLimiet),
    aftelSeconden: tussen(i.aftelSeconden, 3, 30, s.aftelSeconden),
    aftelSecondenErnstig: tussen(i.aftelSecondenErnstig, 5, 60, s.aftelSecondenErnstig),
    onbeantwoordUren: tussen(i.onbeantwoordUren, 1, 168, s.onbeantwoordUren),
    knopTokenSeconden: tussen(i.knopTokenSeconden, 120, 300, s.knopTokenSeconden),
    pogingenPerMinuut: tussen(i.pogingenPerMinuut, 5, 60, s.pogingenPerMinuut),
    code: {
      minLengte,
      maxLengte: Math.max(minLengte, tussen(c.maxLengte, 6, 12, s.code.maxLengte)),
      pauzeNa: tussen(c.pauzeNa, 1, 10, s.code.pauzeNa),
      pauzeMinuten: tussen(c.pauzeMinuten, 1, 240, s.code.pauzeMinuten),
      uitNa: Math.max(tussen(c.pauzeNa, 1, 10, s.code.pauzeNa) + 1, tussen(c.uitNa, 2, 20, s.code.uitNa)),
      verplichtVoor: Array.isArray(c.verplichtVoor) ? (c.verplichtVoor as unknown[]).filter((x): x is string => typeof x === 'string' && /^[a-z][a-z0-9-]{1,40}$/.test(x)).slice(0, 50) : [],
    },
    telefoonVerplicht: true,
    wieMag: i.wieMag === 'eigenaar' || i.wieMag === 'niemand' ? i.wieMag : 'eigenaar-en-gasten',
    botGebruikersnaam: isBotGebruikersnaam(i.botGebruikersnaam) ? String(i.botGebruikersnaam).replace(/^@/, '') : s.botGebruikersnaam,
    bot: {
      naam: tekstKaart(i.bot?.naam, s.bot.naam, 64),
      kort: tekstKaart(i.bot?.kort, s.bot.kort, 120),
      omschrijving: tekstKaart(i.bot?.omschrijving, s.bot.omschrijving, 512),
      talen: talen.length ? talen : s.bot.talen,
    },
  };
}

/** Kleuren voor de accountstrook en de kaarten (blauw gewoon, geel nieuw apparaat, rood verdacht). */
export const KAART_KLEUREN = { gewoon: '#2AABEE', nieuwApparaat: '#F2B01E', verdacht: '#E5484D', gelukt: '#2FB36B' } as const;
export type KaartSoort = keyof typeof KAART_KLEUREN;
export const STROOK_KLEUREN = ['🔵', '🟢', '🟣', '🟠', '🟤'] as const;

/** Officiële merkkleuren van Telegram voor de knop op de site. */
export const TELEGRAM_BLAUW = '#2AABEE';
export const TELEGRAM_BLAUW_DONKER = '#229ED9';
