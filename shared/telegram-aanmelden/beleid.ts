// TELEGRAM-AANMELDEN v1 — de bevestigingsmatrix «дія → спосіб підтвердження» en de ENIGE beleidsfunctie die bepaalt of een
// bewaakte handeling mag. Puur (geen database): de server (backend/telegram-aanmelden/beleid-poort.ts) vult alleen in wat er
// in deze sessie al bevestigd is en welke methoden nu werken; dit bestand beslist.
//
// Vorm van een eis: een lijst van ALTERNATIEVEN (OF); elk alternatief is een verzameling methoden die SAMEN nodig zijn (EN).
//   [['telegram'], ['passkey']]   = Telegram óf toegangssleutel
//   [['telegram', 'passkey']]     = Telegram én toegangssleutel
//   [['telegram', 'code']]        = Telegram én de geheime code
// «Strenger of gelijk»: eis A is minstens zo streng als eis B als ELK alternatief van A een alternatief van B volledig bevat
// (wie A haalt, haalt dus altijd B). De gebruiker mag alleen kiezen wat minstens zo streng is als het minimum van de beheerder.
// Gevoelige handelingen vragen ALTIJD een toegangssleutel, wat de gebruiker ook kiest: de toegangssleutel wordt aan elk alternatief toegevoegd.
import type { Taal, Tekst } from './model';

export const METHODEN = ['telegram', 'passkey', 'code'] as const;
export type Methode = typeof METHODEN[number];
export type Eis = Methode[][];
export const isMethode = (v: unknown): v is Methode => typeof v === 'string' && (METHODEN as readonly string[]).includes(v);

export const METHODE_NAMEN: Record<Methode, Tekst> = {
  telegram: ['Telegram', 'Telegram'],
  passkey: ['ключ доступу', 'passkey'],
  code: ['таємний код', 'geheime code'],
};

/** Benoemde keuzes die de interface toont; elke keuze is gewoon een eis. */
export const KEUZES = {
  'telegram': [['telegram']],
  'passkey': [['passkey']],
  'telegram-of-passkey': [['telegram'], ['passkey']],
  'telegram-en-passkey': [['telegram', 'passkey']],
  'telegram-en-code': [['telegram', 'code']],
  'telegram-en-code-of-passkey': [['telegram', 'code'], ['passkey']],
  'passkey-en-code': [['passkey', 'code']],
  'alles': [['telegram', 'passkey', 'code']],
} as const satisfies Record<string, readonly (readonly Methode[])[]>;
export type KeuzeId = keyof typeof KEUZES;
export const KEUZE_IDS = Object.keys(KEUZES) as KeuzeId[];
export const isKeuze = (v: unknown): v is KeuzeId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(KEUZES, v);
export const eisVan = (k: KeuzeId): Eis => KEUZES[k].map((a) => [...a]);

export const KEUZE_NAMEN: Record<KeuzeId, Tekst> = {
  'telegram': ['Telegram', 'Telegram'],
  'passkey': ['Ключ доступу', 'Passkey'],
  'telegram-of-passkey': ['Telegram або ключ доступу', 'Telegram of toegangssleutel'],
  'telegram-en-passkey': ['Telegram і ключ доступу', 'Telegram en toegangssleutel'],
  'telegram-en-code': ['Telegram і таємний код', 'Telegram en geheime code'],
  'telegram-en-code-of-passkey': ['Telegram і таємний код, або ключ доступу', 'Telegram en geheime code, of toegangssleutel'],
  'passkey-en-code': ['Ключ доступу і таємний код', 'Toegangssleutel en geheime code'],
  'alles': ['Telegram, ключ доступу і таємний код', 'Telegram, toegangssleutel en geheime code'],
};

/** Eén soort bewaakte handeling. `gevoelig` = altijd toegangssleutel (besluit van de eigenaar, punt D). */
export type ActieSoort = { sleutel: string; naam: Tekst; minimum: KeuzeId; standaard: KeuzeId; gevoelig: boolean; ingebouwd: boolean };

/** Ingebouwde handelingen. De beheerder kan er zonder nieuwe bouw bij zetten (tabel app.tg_acties). */
export const INGEBOUWDE_ACTIES: readonly ActieSoort[] = Object.freeze([
  { sleutel: 'aanmelden', naam: ['Вхід на сайт', 'Aanmelden op de site'], minimum: 'telegram', standaard: 'telegram', gevoelig: false, ingebouwd: true },
  { sleutel: 'nieuw-apparaat', naam: ['Новий пристрій', 'Nieuw apparaat'], minimum: 'telegram', standaard: 'telegram-en-passkey', gevoelig: false, ingebouwd: true },
  { sleutel: 'bestanden-bekijken', naam: ['Перегляд файлів', 'Bestanden bekijken'], minimum: 'telegram', standaard: 'telegram', gevoelig: false, ingebouwd: true },
  { sleutel: 'wijziging-bevestigen', naam: ['Підтвердження зміни в Telegram', 'Wijziging in Telegram bevestigen'], minimum: 'passkey', standaard: 'passkey', gevoelig: true, ingebouwd: true },
  { sleutel: 'koppelen', naam: ['Прив’язати Telegram', 'Telegram koppelen'], minimum: 'passkey', standaard: 'passkey', gevoelig: true, ingebouwd: true },
  { sleutel: 'ontkoppelen', naam: ['Відв’язати Telegram', 'Telegram ontkoppelen'], minimum: 'passkey', standaard: 'passkey', gevoelig: true, ingebouwd: true },
  { sleutel: 'koppeling-wijzigen', naam: ['Назва й права прив’язки', 'Naam en rechten van een koppeling'], minimum: 'passkey', standaard: 'passkey', gevoelig: true, ingebouwd: true },
  { sleutel: 'aanmeldmethoden', naam: ['Способи входу та ключі', 'Aanmeldmethoden en sleutels'], minimum: 'passkey', standaard: 'telegram-en-passkey', gevoelig: true, ingebouwd: true },
  { sleutel: 'telefoon', naam: ['Зміна номера телефону', 'Telefoonnummer wijzigen'], minimum: 'passkey', standaard: 'passkey', gevoelig: true, ingebouwd: true },
  { sleutel: 'e-mail-wachtwoord', naam: ['Зміна пошти чи пароля', 'E-mail of wachtwoord wijzigen'], minimum: 'passkey', standaard: 'passkey', gevoelig: true, ingebouwd: true },
  { sleutel: 'geheime-code', naam: ['Таємний код', 'Geheime code'], minimum: 'passkey', standaard: 'passkey', gevoelig: true, ingebouwd: true },
  { sleutel: 'matrix-wijzigen', naam: ['Зміна таблиці підтверджень', 'Bevestigingstabel wijzigen'], minimum: 'passkey', standaard: 'passkey', gevoelig: true, ingebouwd: true },
  { sleutel: 'betalingen', naam: ['Платежі', 'Betalingen'], minimum: 'passkey', standaard: 'passkey', gevoelig: true, ingebouwd: true },
  { sleutel: 'beheer-instellingen', naam: ['Адміністративні налаштування', 'Beheerinstellingen'], minimum: 'passkey', standaard: 'passkey', gevoelig: true, ingebouwd: true },
  { sleutel: 'beheer-bot-sleutel', naam: ['Ключ бота', 'Botsleutel'], minimum: 'passkey', standaard: 'passkey', gevoelig: true, ingebouwd: true },
] as ActieSoort[]);

export const ACTIE_SLEUTEL_RE = /^[a-z][a-z0-9-]{1,40}$/;

/** Zet een eis in een vaste vorm: methoden gesorteerd, dubbele en overbodige (supersets) alternatieven weg. */
export function eisNormaliseren(e: Eis): Eis {
  const orde = (m: Methode) => METHODEN.indexOf(m);
  const alts = e.map((a) => [...new Set(a.filter(isMethode))].sort((x, y) => orde(x) - orde(y))).filter((a) => a.length > 0);
  const uniek: Methode[][] = [];
  for (const a of alts.sort((x, y) => x.length - y.length)) {
    if (uniek.some((b) => b.every((m) => a.includes(m)))) continue; // a is een superset van een bestaand alternatief → overbodig
    uniek.push(a);
  }
  return uniek;
}

/** true als `a` minstens zo streng is als `b`: elk alternatief van a bevat een alternatief van b volledig. */
export function minstensZoStreng(a: Eis, b: Eis): boolean {
  const A = eisNormaliseren(a), B = eisNormaliseren(b);
  if (!A.length) return false;
  return A.every((alt) => B.some((bAlt) => bAlt.every((m) => alt.includes(m))));
}

/** Gevoelig: toegangssleutel wordt aan elk alternatief toegevoegd (Telegram alleen kan nooit genoeg zijn). */
export function metVerplichtePasskey(e: Eis): Eis {
  return eisNormaliseren(e.map((a) => (a.includes('passkey') ? a : [...a, 'passkey'])));
}

/**
 * De WERKELIJKE eis voor één handeling: keuze van de gebruiker (alleen als die minstens zo streng is als het minimum),
 * anders het minimum; gevoelige handelingen altijd met toegangssleutel; verplichte geheime code van de beheerder wordt toegevoegd.
 */
export function werkelijkeEis(soort: ActieSoort, keuze: KeuzeId | null | undefined, opties: { codeVerplicht?: boolean } = {}): Eis {
  const minimum = eisVan(soort.minimum);
  let eis = keuze && isKeuze(keuze) && minstensZoStreng(eisVan(keuze), minimum) ? eisVan(keuze) : eisVan(isKeuze(soort.standaard) && minstensZoStreng(eisVan(soort.standaard), minimum) ? soort.standaard : soort.minimum);
  if (soort.gevoelig) eis = metVerplichtePasskey(eis);
  if (opties.codeVerplicht) eis = eisNormaliseren(eis.map((a) => (a.includes('telegram') && !a.includes('code') ? [...a, 'code'] : a)));
  return eisNormaliseren(eis);
}

/** Mag de gebruiker deze keuze voor deze handeling opslaan? (alleen strenger of gelijk aan het minimum) */
export function keuzeToegestaan(soort: ActieSoort, keuze: unknown): keuze is KeuzeId {
  return isKeuze(keuze) && minstensZoStreng(eisVan(keuze), eisVan(soort.minimum));
}

export type SessieNiveau = 'volledig' | 'telegram';
export type Beoordeling = {
  toegestaan: boolean;
  eis: Eis;
  /** Het goedkoopste alternatief dat nog haalbaar is (alle methoden werken) en wat daarvan ontbreekt. */
  ontbreekt: Methode[];
  /** Alternatieven die nu niet haalbaar zijn omdat een methode niet werkt (eerlijk tonen). */
  onbeschikbaar: Methode[];
  /** Er is geen enkel haalbaar alternatief: de gebruiker moet wachten of een andere toegestane weg nemen. */
  geblokkeerd: boolean;
  reden: '' | 'BEVESTIGING_NODIG' | 'METHODE_ONBESCHIKBAAR' | 'ONBEKENDE_ACTIE';
};

/**
 * DE beleidsfunctie. Elke bewaakte route gaat hierdoor (backend/telegram-aanmelden/beleid-poort.ts); er is geen tweede.
 *  - voldaan: wat in deze sessie al vers bevestigd is voor DEZE handeling;
 *  - beschikbaar: welke methoden nu werken (statusdienst) én die de gebruiker heeft (toegangssleutel ingesteld, code ingesteld…).
 */
export function beoordeel(eis: Eis, voldaan: ReadonlySet<Methode>, beschikbaar: ReadonlySet<Methode>): Beoordeling {
  const e = eisNormaliseren(eis);
  if (!e.length) return { toegestaan: false, eis: e, ontbreekt: [], onbeschikbaar: [], geblokkeerd: true, reden: 'ONBEKENDE_ACTIE' };
  if (e.some((a) => a.every((m) => voldaan.has(m)))) return { toegestaan: true, eis: e, ontbreekt: [], onbeschikbaar: [], geblokkeerd: false, reden: '' };
  const haalbaar = e.filter((a) => a.every((m) => beschikbaar.has(m) || voldaan.has(m)));
  const onbeschikbaar = [...new Set(e.flatMap((a) => a.filter((m) => !beschikbaar.has(m) && !voldaan.has(m))))];
  if (!haalbaar.length) return { toegestaan: false, eis: e, ontbreekt: [], onbeschikbaar, geblokkeerd: true, reden: 'METHODE_ONBESCHIKBAAR' };
  const kosten = (a: Methode[]) => a.filter((m) => !voldaan.has(m)).length;
  const beste = [...haalbaar].sort((x, y) => kosten(x) - kosten(y))[0];
  return { toegestaan: false, eis: e, ontbreekt: beste.filter((m) => !voldaan.has(m)), onbeschikbaar, geblokkeerd: false, reden: 'BEVESTIGING_NODIG' };
}

/** Leesbare tekst van een eis, bv. «Telegram і таємний код, або ключ доступу». */
export function eisTekst(e: Eis, taal: Taal): string {
  const i = taal === 'nl' ? 1 : 0;
  const en = taal === 'nl' ? ' en ' : ' і ';
  const of = taal === 'nl' ? ', of ' : ', або ';
  return eisNormaliseren(e).map((a) => a.map((m) => METHODE_NAMEN[m][i]).join(en)).join(of).replace(/^./, (c) => c.toUpperCase());
}

/** Snelkeuzes op de gebruikerspagina. */
export type Voorinstelling = 'telegram-overal' | 'veiligst' | 'standaard';
export function voorinstellingToepassen(v: Voorinstelling, soorten: readonly ActieSoort[]): Record<string, KeuzeId> {
  const uit: Record<string, KeuzeId> = {};
  for (const s of soorten) {
    if (v === 'standaard') { uit[s.sleutel] = s.standaard; continue; }
    if (v === 'veiligst') { uit[s.sleutel] = 'alles'; continue; }
    // «Telegram для всього, де дозволено»: Telegram alleen waar het minimum dat toelaat; anders de lichtste toegestane keuze met Telegram.
    const kandidaten: KeuzeId[] = ['telegram', 'telegram-of-passkey', 'telegram-en-code', 'telegram-en-passkey', 'alles'];
    uit[s.sleutel] = kandidaten.find((k) => keuzeToegestaan(s, k)) ?? s.standaard;
  }
  return uit;
}
