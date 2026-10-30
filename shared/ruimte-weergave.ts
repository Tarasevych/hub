// WAT HET SCHERM OVER DE GEGEVENSRUIMTE MOET ZEGGEN — zuiver, dus server, browser en test rekenen hetzelfde.
//
// De opdracht van de eigenaar, punt 6: op de pagina's van taken, notities, het bureaublad en GitHub moet te ZIEN zijn in
// welke ruimte iemand staat, en bij «uit» of «bevroren» moet er een eerlijke uitleg staan — geen lege lijst waarvan niemand
// begrijpt waarom zij leeg is. Dit bestand leest daarvoor twee dingen:
//   • het veld `ruimte` dat elke geslaagde route meestuurt (backend/ruimte-bord-github.ts → ruimteKop);
//   • het antwoord van een WEIGERING (403) met de code en de uitleg in beide talen (→ ruimteWeigering).
// De teksten zelf worden hier niet verzonnen: zij komen uit shared/ruimte-scheiding.ts (STAND_NAAM, STAND_UITLEG,
// WEIGERING_UITLEG), zodat er maar één waarheid is.
import { STAND_NAAM, STAND_UITLEG, WEIGERING_UITLEG, dienstOf, standOf, type DeelbareDienst, type DienstStand, type LadeWeigering } from './ruimte-scheiding';

export type Tweetalig = { uk: string; nl: string };
/** Hoe de ruimte eruitziet op een geslaagd antwoord. */
export type RuimteFeiten = {
  ruimte: 'prive' | 'technisch';
  stand: DienstStand;
  gedeeld: boolean;
  dienst: DeelbareDienst | null;
  naam: Tweetalig;
  uitleg: Tweetalig;
  /** `true` = een strook met uitleg hoort zichtbaar te zijn. In de persoonlijke ruimte verandert er niets, dus daar niet. */
  tonen: boolean;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});
const tweetalig = (v: unknown, terugval: Tweetalig): Tweetalig => {
  const o = obj(v);
  const uk = typeof o.uk === 'string' ? o.uk : '';
  const nl = typeof o.nl === 'string' ? o.nl : '';
  return uk || nl ? { uk: uk || nl, nl: nl || uk } : terugval;
};

/**
 * De feiten uit een GESLAAGD antwoord. `null` als de route niets over de ruimte zei (een oudere server, of een route die er
 * niet bij hoort) — het scherm toont dan niets extra in plaats van iets te verzinnen.
 */
export function ruimteFeitenUit(data: unknown): RuimteFeiten | null {
  const k = obj(obj(data).ruimte);
  if (!Object.keys(k).length) return null;
  const ruimte = String(k.ruimte ?? '') === 'technisch' ? 'technisch' as const : 'prive' as const;
  const stand = standOf(k.stand);
  const dienst = dienstOf(k.dienst);
  return {
    ruimte, stand, gedeeld: k.gedeeld === true, dienst,
    naam: tweetalig(k.naam, { uk: 'Служба', nl: 'Dienst' }),
    uitleg: tweetalig(k.uitleg, STAND_UITLEG[stand]),
    // In de persoonlijke ruimte is er niets bijzonders te melden: daar verandert door de scheiding niets, voor niemand.
    tonen: ruimte === 'technisch',
  };
}

/** Hoe het scherm de ruimte in één woord noemt. */
export const RUIMTE_NAAM: Readonly<Record<'prive' | 'technisch', Tweetalig>> = Object.freeze({
  prive: { uk: 'Особистий простір', nl: 'Persoonlijke ruimte' },
  technisch: { uk: 'Технічний простір', nl: 'Technische ruimte' },
});

/** Eén regel voor de strook: «Технічний простір · Окремі дані». */
export const ruimteRegel = (f: RuimteFeiten, lang: 'uk' | 'nl'): string =>
  `${RUIMTE_NAAM[f.ruimte][lang]} · ${(f.gedeeld ? STAND_NAAM.gedeeld : STAND_NAAM[f.stand])[lang]}`;

// ------------------------------------------------------------------------------------------------ de weigering
export type RuimteGesloten = { code: LadeWeigering; dienst: DeelbareDienst | null; dienstNaam: Tweetalig; uitleg: Tweetalig };
const WEIGERINGEN = Object.keys(WEIGERING_UITLEG) as LadeWeigering[];
export const isRuimteCode = (v: unknown): v is LadeWeigering => WEIGERINGEN.includes(String(v ?? '') as LadeWeigering);

/**
 * Herkent een weigering van de poort in het antwoord van een mislukt verzoek. De aanroeper geeft mee wat hij heeft: het
 * object uit `error.response.data`, of (voor een hulpmiddel van een AI) de meldingstekst `RUIMTE_GESLOTEN:<code> — …`.
 * `null` = dit was een gewone fout en hoort gewoon als fout gemeld te worden.
 */
export function ruimteGeslotenUit(bron: unknown): RuimteGesloten | null {
  if (typeof bron === 'string') {
    const m = /^RUIMTE_GESLOTEN:([A-Z_]+)/.exec(bron.trim());
    if (!m || !isRuimteCode(m[1])) return null;
    return { code: m[1], dienst: null, dienstNaam: { uk: 'Служба', nl: 'Dienst' }, uitleg: WEIGERING_UITLEG[m[1]] };
  }
  const o = obj(bron);
  const code = String(o.error ?? '');
  if (!isRuimteCode(code)) return null;
  return {
    code: code as LadeWeigering,
    dienst: dienstOf(o.dienst),
    dienstNaam: tweetalig(o.dienstNaam, { uk: 'Служба', nl: 'Dienst' }),
    uitleg: tweetalig(o.uitleg, WEIGERING_UITLEG[code as LadeWeigering]),
  };
}
