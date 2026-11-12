// APPARAAT-001 — «Підтвердження з іншого пристрою» (bevestigen vanaf een ander apparaat): gedeeld model voor server én browser.
//
// Wat dit is: de gebruiker zit op een apparaat zónder toegangssleutel (passkey) en moet een gevoelige actie bevestigen. In het
// venster «Підтвердіть доступ» kiest hij «Інший пристрій» (of «У Telegram»). Op zijn andere, al aangemelde apparaten verschijnt een
// zwevend venster «Це ви?» met dezelfde drie symbolen; op het vragende apparaat is er één uitgelicht. Tikt hij op het andere
// apparaat het uitgelichte symbool en bevestigt hij daar met zijn toegangssleutel, dan is de actie op het eerste apparaat bevestigd.
// Model: itsme (zelfde set op beide schermen, één uitgelicht) + Google/Microsoft (één poging, aftelling, «Ні» wint altijd).
//
// Vlag `apparaat-bevestiging-v1` (migratie 0204) staat standaard AAN; de beheerder heeft een noodschakelaar (aan: false).
// Geen methode wordt hier een recht: de server beslist (backend/apparaat-bevestiging/kern.ts) met dezelfde poort als TELEGRAM-001.

export const APPARAAT_VLAG = 'apparaat-bevestiging-v1';

export type Taal = 'uk' | 'nl';
export type Tekst = readonly [uk: string, nl: string];
export const tekstIn = (t: Tekst, taal: Taal): string => (taal === 'nl' ? t[1] : t[0]);

/** Soort symbolen op beide schermen. «gemengd» kiest per verzoek willekeurig één van de drie soorten. */
export const SYMBOOL_SOORTEN = ['pictogrammen', 'cijfers', 'letters', 'gemengd'] as const;
export type SymboolSoort = typeof SYMBOOL_SOORTEN[number];
export const isSymboolSoort = (v: unknown): v is SymboolSoort => typeof v === 'string' && (SYMBOOL_SOORTEN as readonly string[]).includes(v);
export const SYMBOOL_SOORT_NAMEN: Record<SymboolSoort, Tekst> = {
  pictogrammen: ['Піктограми (з назвою)', 'Pictogrammen (met naam)'],
  cijfers: ['Цифри 2–9', 'Cijfers 2–9'],
  letters: ['Латинські літери без двійників', 'Latijnse letters zonder dubbelgangers'],
  gemengd: ['Щоразу інший вид', 'Elke keer een andere soort'],
};

/** Standen van één verzoek — dezelfde woorden als app.tg_bevestigingen, zodat de poort beide tabellen samen kan lezen. */
export const STANDEN = ['wacht', 'bevestigd', 'geweigerd', 'verlopen', 'gebruikt', 'ingetrokken'] as const;
export type Stand = typeof STANDEN[number];
export const isStand = (v: unknown): v is Stand => typeof v === 'string' && (STANDEN as readonly string[]).includes(v);

/** Waarmee het andere apparaat (B) zijn tik heeft bekrachtigd. */
export const METHODEN_B = ['passkey', 'totp'] as const;
export type MethodeB = typeof METHODEN_B[number];

/** Instellingen van de beheerder (app.apparaat_instellingen, rij 'actief'). Alles data, geen nieuwe bouw nodig. */
export type ApparaatInstellingen = {
  /** Noodschakelaar: uit = voor iedereen dicht (de knop verdwijnt, routes antwoorden «niet beschikbaar»). */
  aan: boolean;
  /** Hoe lang een verzoek open staat (seconden). Google/Microsoft: 1–3 minuten. */
  wachtSeconden: number;
  /** Aftelling vóór de symbolen op B aanklikbaar zijn (gewoon / gevoelige actie). Door de server afgedwongen. */
  aftelSeconden: number;
  aftelSecondenGevoelig: number;
  /** Welke symbolen als de gebruiker niets kiest. */
  symbolenStandaard: Exclude<SymboolSoort, never>;
  /** Hoeveel symbolen op beide schermen (3–5). Meer = kleiner raadkans, drukker scherm. */
  aantalKandidaten: number;
  /** Mag B zonder toegangssleutel bekrachtigen met een authenticator-code? (standaard nee: alleen de toegangssleutel) */
  totpToegestaan: boolean;
  /** Telt een bevestiging met toegangssleutel op B als «sterke» step-up op A? (standaard ja) */
  sterkBijPasskey: boolean;
  /** Ook in de Telegram-kaart van de dienst step-up drie symboolknoppen in plaats van één «Так, це я». */
  telegramSymbolen: boolean;
  /** Snelheidslimiet: verzoeken per account per 10 minuten. */
  maxPerTienMinuten: number;
  /** Fouten: na `pauzeNa` verkeerde symbolen een pauze van `pauzeMinuten`; na `uitNa` staat de methode uit tot herstel met toegangssleutel. */
  pauzeNa: number;
  pauzeMinuten: number;
  uitNa: number;
  /** Een ander apparaat telt als «levend» als het de site zo recent nog gebruikte (minuten). */
  levendMinuten: number;
  /** Wie de methode mag gebruiken. */
  wieMag: 'iedereen' | 'eigenaar';
};

export const STANDAARD_INSTELLINGEN: ApparaatInstellingen = {
  aan: true,
  wachtSeconden: 120,
  aftelSeconden: 5,
  aftelSecondenGevoelig: 10,
  symbolenStandaard: 'pictogrammen',
  aantalKandidaten: 3,
  totpToegestaan: false,
  sterkBijPasskey: true,
  telegramSymbolen: true,
  maxPerTienMinuten: 10,
  pauzeNa: 3,
  pauzeMinuten: 15,
  uitNa: 5,
  levendMinuten: 15,
  wieMag: 'iedereen',
};

const tussen = (v: unknown, min: number, max: number, std: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : std;
};
const vlag = (v: unknown, std: boolean): boolean => (typeof v === 'boolean' ? v : std);

/** Normaliseert invoer van de beheerder naar veilige grenzen; onbekende velden vallen weg. Puur, getest. */
export function instellingenNormaliseren(v: unknown): ApparaatInstellingen {
  const i = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const s = STANDAARD_INSTELLINGEN;
  const pauzeNa = tussen(i.pauzeNa, 1, 10, s.pauzeNa);
  return {
    aan: vlag(i.aan, s.aan),
    wachtSeconden: tussen(i.wachtSeconden, 60, 300, s.wachtSeconden),
    aftelSeconden: tussen(i.aftelSeconden, 3, 30, s.aftelSeconden),
    aftelSecondenGevoelig: tussen(i.aftelSecondenGevoelig, 5, 60, s.aftelSecondenGevoelig),
    symbolenStandaard: isSymboolSoort(i.symbolenStandaard) ? i.symbolenStandaard : s.symbolenStandaard,
    aantalKandidaten: tussen(i.aantalKandidaten, 3, 5, s.aantalKandidaten),
    totpToegestaan: vlag(i.totpToegestaan, s.totpToegestaan),
    sterkBijPasskey: vlag(i.sterkBijPasskey, s.sterkBijPasskey),
    telegramSymbolen: vlag(i.telegramSymbolen, s.telegramSymbolen),
    maxPerTienMinuten: tussen(i.maxPerTienMinuten, 3, 30, s.maxPerTienMinuten),
    pauzeNa,
    pauzeMinuten: tussen(i.pauzeMinuten, 1, 240, s.pauzeMinuten),
    uitNa: Math.max(pauzeNa + 1, tussen(i.uitNa, 2, 20, s.uitNa)),
    levendMinuten: tussen(i.levendMinuten, 1, 60, s.levendMinuten),
    wieMag: i.wieMag === 'eigenaar' ? 'eigenaar' : 'iedereen',
  };
}

/** Keuzes van de gebruiker (app.apparaat_voorkeuren). «standaard» = wat de beheerder koos. */
export type ApparaatVoorkeuren = {
  aan: boolean;
  symbolen: SymboolSoort | 'standaard';
  /** B mag met authenticator-code bekrachtigen — alleen als de beheerder dat toestaat (totpToegestaan). */
  totpOpApparaat: boolean;
  /** Zwevend venster meteen tonen, of alleen een regel in het meldingencentrum (de gebruiker opent het zelf). */
  toonAls: 'venster' | 'melding';
  /** Kort geluid bij een nieuw verzoek op het andere apparaat. */
  geluid: boolean;
};
export const STANDAARD_VOORKEUREN: ApparaatVoorkeuren = { aan: true, symbolen: 'standaard', totpOpApparaat: false, toonAls: 'venster', geluid: false };
export function voorkeurenNormaliseren(v: unknown): ApparaatVoorkeuren {
  const i = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const s = STANDAARD_VOORKEUREN;
  return {
    aan: vlag(i.aan, s.aan),
    symbolen: i.symbolen === 'standaard' || isSymboolSoort(i.symbolen) ? i.symbolen : s.symbolen,
    totpOpApparaat: vlag(i.totpOpApparaat, s.totpOpApparaat),
    toonAls: i.toonAls === 'melding' ? 'melding' : 'venster',
    geluid: vlag(i.geluid, s.geluid),
  };
}

/** Welke soort symbolen geldt voor één verzoek: keuze van de gebruiker, anders die van de beheerder. */
export const effectieveSoort = (inst: ApparaatInstellingen, vk: ApparaatVoorkeuren): SymboolSoort => (vk.symbolen === 'standaard' ? inst.symbolenStandaard : vk.symbolen);

/** Wat het vragende apparaat (A) en het bevestigende apparaat (B) van een verzoek zien — nooit het juiste symbool naar B. */
export type VerzoekPubliek = {
  id: string;
  actie: string;
  actieNaam: Tekst;
  dienst: string;
  gevoelig: boolean;
  soort: Exclude<SymboolSoort, 'gemengd'>;
  /** Indexen in de catalogus van `soort`, in de volgorde van tonen (op A en B gelijk). */
  kandidaten: number[];
  /** Alleen naar A: positie (0..n-1) in `kandidaten` van het uitgelichte symbool. */
  juist?: number;
  stand: Stand;
  apparaatA: string;
  regioA: string;
  aftelSec: number;
  aangemaaktOp: string;
  verlooptOp: string;
  /** Alleen naar A: hoeveel andere levende apparaten het verzoek kunnen zien. */
  apparaten?: number;
  /** Na afloop: hoe en waarmee bevestigd / waarom geweigerd. */
  methodeB?: MethodeB | '';
  apparaatB?: string;
  reden?: string;
};

/** Gebeurtenissen over de snelle stroom (SSE) naar de tabbladen van één account. */
export type StroomGebeurtenis =
  | { soort: 'apparaat.verzoek'; verzoek: VerzoekPubliek }
  | { soort: 'apparaat.afgerond'; id: string; stand: Stand }
  | { soort: 'hartslag'; op: string };

/** Foutcodes van de routes (één taal tegelijk in de browser: src/apparaat-bevestiging/teksten.ts). */
export const FOUTCODES = [
  'VLAG_UIT', 'UITGESCHAKELD', 'NIET_TOEGESTAAN', 'METHODE_UIT', 'METHODE_PAUZE', 'GEEN_ANDER_APPARAAT', 'RATE_LIMITED', 'VERZOEK_ONBEKEND',
  'VERLOPEN', 'AL_AFGEROND', 'ZELFDE_APPARAAT', 'TE_SNEL', 'KEUZE_ONGELDIG', 'FOUT_SYMBOOL', 'STEP_UP_PASSKEY_REQUIRED', 'BEHEERDER_NODIG', 'SESSIE_ONBEKEND', 'ONBEKENDE_ACTIE',
] as const;
export type Foutcode = typeof FOUTCODES[number];
