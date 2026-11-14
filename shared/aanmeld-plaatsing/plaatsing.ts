// AANMELD-PLAATSING v1 (TELEGRAM-001, 09.11.2026) — waar elke aanmeldmethode op het aanmeldscherm staat. Eén bron voor server
// (validatie bij opslaan), aanmeldscherm (weergave) en beheer (voorbeeld). Puur: geen I/O.
// Розміщення способів входу: «На головній» / «У «Інші способи входу»» / «Приховано» + порядок. Адміністратор визначає; типово —
// як було (Google і Telegram на головній, решта в «Інші способи входу»). Захист від блокування: завжди лишається хоча б один
// робочий спосіб; якщо жодного не видно, сторінка входу сама показує Google.

// IDENTITEIT-015 (aanmelden): 'discord' en 'wachtwoord' achteraan — een opgeslagen plaatsing zonder deze twee krijgt ze bij het
// normaliseren gewoon achteraan met hun standaardplek (oude rijen blijven geldig).
export const METHODEN = ['google', 'telegram', 'github', 'apple', 'microsoft', 'passkey', 'discord', 'wachtwoord'] as const;
export type MethodeId = typeof METHODEN[number];
export const PLEKKEN = ['hoofd', 'andere', 'verborgen'] as const;
export type Plek = typeof PLEKKEN[number];
export type Plaatsing = { volgorde: MethodeId[]; plek: Record<MethodeId, Plek> };

export const METHODE_NAMEN: Record<MethodeId, [string, string]> = {
  google: ['Google', 'Google'],
  telegram: ['Telegram', 'Telegram'],
  github: ['GitHub', 'GitHub'],
  apple: ['Apple', 'Apple'],
  microsoft: ['Microsoft', 'Microsoft'],
  passkey: ['Ключ доступу', 'Toegangssleutel'],
  discord: ['Discord', 'Discord'],
  wachtwoord: ['Пароль', 'Wachtwoord'],
};
export const PLEK_NAMEN: Record<Plek, [string, string]> = {
  hoofd: ['На головній (поруч з іншими головними)', 'Op het hoofdscherm (naast de andere hoofdknoppen)'],
  andere: ['У «Інші способи входу»', 'Onder «Andere aanmeldmethoden»'],
  verborgen: ['Приховано', 'Verborgen'],
};

/** Gedrag van vóór deze functie: Google en Telegram op het hoofdscherm, de rest onder «Інші способи входу». */
export const STANDAARD_PLAATSING: Plaatsing = Object.freeze({
  volgorde: [...METHODEN],
  plek: { google: 'hoofd', telegram: 'hoofd', github: 'andere', apple: 'andere', microsoft: 'andere', passkey: 'andere', discord: 'andere', wachtwoord: 'andere' },
}) as Plaatsing;

const isMethode = (v: unknown): v is MethodeId => typeof v === 'string' && (METHODEN as readonly string[]).includes(v);
const isPlek = (v: unknown): v is Plek => typeof v === 'string' && (PLEKKEN as readonly string[]).includes(v);

/** Ruwe invoer → geldige plaatsing: onbekende sleutels weg, ontbrekende methoden achteraan met hun standaardplek. */
export function plaatsingNormaliseren(ruw: unknown): Plaatsing {
  const o = (ruw && typeof ruw === 'object' ? ruw : {}) as { volgorde?: unknown; plek?: unknown };
  const volgorde: MethodeId[] = [];
  for (const m of Array.isArray(o.volgorde) ? o.volgorde : []) if (isMethode(m) && !volgorde.includes(m)) volgorde.push(m);
  for (const m of METHODEN) if (!volgorde.includes(m)) volgorde.push(m);
  const ruwPlek = (o.plek && typeof o.plek === 'object' ? o.plek : {}) as Record<string, unknown>;
  const plek = {} as Record<MethodeId, Plek>;
  for (const m of METHODEN) plek[m] = isPlek(ruwPlek[m]) ? ruwPlek[m] as Plek : STANDAARD_PLAATSING.plek[m];
  return { volgorde, plek };
}

/**
 * Controle bij opslaan. `werkend` = methoden die NU een sessie kunnen geven (Google; Telegram als de bot is ingesteld).
 * Fouten: GEEN_WERKENDE_METHODE (alles wat werkt verborgen → niemand kan nog aanmelden).
 */
export function plaatsingControleren(p: Plaatsing, werkend: readonly MethodeId[]): string[] {
  const fouten: string[] = [];
  if (!werkend.some((m) => p.plek[m] !== 'verborgen')) fouten.push('GEEN_WERKENDE_METHODE');
  return fouten;
}

/** Methoden zonder eerlijke «niet beschikbaar»-regel: werken ze niet (bv. geen botsleutel), dan zijn ze gewoon onzichtbaar. */
// IDENTITEIT-015 (aanmelden): Discord en wachtwoord hebben geen vaste «недоступно»-regel op het aanmeldscherm — onzichtbaar tot ze werken.
export const STIL_ALS_ONBESCHIKBAAR: readonly MethodeId[] = ['telegram', 'discord', 'wachtwoord'];

export type Indeling = { hoofd: MethodeId[]; andere: MethodeId[]; noodGoogle: boolean };

/**
 * Wat het aanmeldscherm toont. `beschikbaar` = methoden die nu werken. Een methode die niet werkt komt NOOIT op het hoofdscherm
 * (alleen, als de beheerder dat wil, onder «Інші способи входу» met de eerlijke reden). Werkt geen enkele zichtbare methode,
 * dan verschijnt Google toch op het hoofdscherm (noodGoogle) — niemand wordt buitengesloten.
 */
export function indelen(p: Plaatsing, beschikbaar: readonly MethodeId[]): Indeling {
  const hoofd: MethodeId[] = [], andere: MethodeId[] = [];
  for (const m of p.volgorde) {
    const plek = p.plek[m];
    if (plek === 'verborgen') continue;
    if (STIL_ALS_ONBESCHIKBAAR.includes(m) && !beschikbaar.includes(m)) continue;
    if (plek === 'hoofd' && beschikbaar.includes(m)) hoofd.push(m);
    else andere.push(m);
  }
  const zichtbaarWerkend = [...hoofd, ...andere].some((m) => beschikbaar.includes(m));
  if (!zichtbaarWerkend) return { hoofd: ['google', ...hoofd.filter((m) => m !== 'google')], andere: andere.filter((m) => m !== 'google'), noodGoogle: true };
  return { hoofd, andere, noodGoogle: false };
}

/** Eén plaats omhoog (-1) of omlaag (+1) in de volgorde. */
export function verschuiven(p: Plaatsing, m: MethodeId, richting: -1 | 1): Plaatsing {
  const v = [...p.volgorde]; const i = v.indexOf(m); const j = i + richting;
  if (i < 0 || j < 0 || j >= v.length) return p;
  [v[i], v[j]] = [v[j], v[i]];
  return { ...p, volgorde: v };
}

/**
 * Het aanmeldscherm. cfg = antwoord van /api/aanmelden/telegram/config (of null/undefined bij laden, fout of vlag uit).
 * Zonder plaatsing: exact het scherm van vóór deze functie — Google, Telegram (als die zichtbaar is), dan alle vier onder «Інші».
 */
export function aanmeldIndeling(cfg: { zichtbaar?: boolean; plaatsing?: Plaatsing | null; methoden?: readonly string[] | null } | null | undefined): Indeling {
  // IDENTITEIT-015 (aanmelden): `methoden` = wat de server NU als werkend opgeeft (passkey, wachtwoord, microsoft, discord, apple).
  const extra = (Array.isArray(cfg?.methoden) ? cfg!.methoden : []).filter(isMethode).filter((m) => m !== 'google' && m !== 'telegram');
  if (!cfg?.plaatsing) {
    const andere: MethodeId[] = ['github', 'apple', 'microsoft', 'passkey'];
    for (const m of extra) if (!andere.includes(m)) andere.push(m);
    return { hoofd: ['google', 'telegram'], andere, noodGoogle: false };
  }
  return indelen(plaatsingNormaliseren(cfg.plaatsing), [...(cfg.zichtbaar ? ['google', 'telegram'] as MethodeId[] : ['google'] as MethodeId[]), ...extra]);
}
