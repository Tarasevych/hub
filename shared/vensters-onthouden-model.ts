// Vensters die een SUBDOMEIN OVERLEVEN: de zuivere regels (geen React, geen DOM, geen opslag — de tests lezen dit bestand).
//
// DE KLACHT VAN DE EIGENAAR (20.10.2026): «треба, щоб відкривалися вікна, які можна згорнути та повернутися до них пізніше,
// але щоб вони не пропадали згорнутими … згорнуті вікна в одному просторі втрачаються, якщо я переходжу на інший піддомен».
// Het vensterbeheer (src/platform/vensters.tsx) houdt zijn lijst in het GEHEUGEN van het tabblad: hub → mail is een echte
// navigatie, dus alles wat geminimaliseerd was, bestond daarna niet meer. Positie en grootte stonden al in localStorage,
// maar het BESTAAN van het venster niet.
//
// HOE HET NU WERKT. Hetzelfde model als het menu en het uiterlijk (shared/uiterlijk.ts): de SERVER is de waarheid, per
// ACCOUNT en per RUIMTE, en de browser houdt alleen een snelle cache voor het eerste beeld. Een venster staat als een
// kleine, hervatbare BESCHRIJVING in die lade (welke dienst, welke stap, welk adres) — niet als een React-boom. Wie op
// mail een koppelvenster minimaliseert en naar hub loopt, vindt het daar terug in hetzelfde dok.
//
// WAT ER NOOIT IN MAG. Een wachtwoord, een token, een code, een cookie. Punt 3 van de opdracht: «Якщо вікно містить секрет,
// при згортанні секрет має зникати, а людина — бачити чесне "введіть пароль ще раз"». Daarom:
//   • `zonderGeheimen()` gooit elk veld met een geheime naam weg vóór het bewaren — ook als de aanroeper het meestuurt;
//   • een venster dat op een geheime stap stond (`wachtwoord`), wordt bewaard op de stap `wachtwoord-opnieuw`: het komt dus
//     leeg terug met de eerlijke vraag om het app-wachtwoord nog eens in te vullen.

/** Welke soorten vensters zich laten onthouden. Elke soort heeft één hersteller in de weergave (src/platform/VensterHerstel.tsx). */
export const VENSTER_SOORTEN = ['mail-koppelen'] as const;
export type VensterSoort = typeof VENSTER_SOORTEN[number];

/** Stappen van het koppelvenster. `wachtwoord-opnieuw` bestaat alleen ná bewaren: het geheim is weg, de vraag blijft. */
export const VENSTER_STAPPEN = ['adres', 'wachtwoord', 'wachtwoord-opnieuw', 'controle', 'klaar'] as const;
export type VensterStap = typeof VENSTER_STAPPEN[number];

/** Veldnamen die een geheim (kunnen) dragen: ze gaan nooit de lade in. */
export const VENSTER_GEHEIME_VELDEN: readonly string[] = Object.freeze([
  'wachtwoord', 'appWachtwoord', 'password', 'geheim', 'secret', 'token', 'code', 'pin', 'cookie', 'authorization',
]);

export type OnthoudenVenster = {
  /** Stabiele id; bepaalt ook de bewaarde positie/grootte in vensters.tsx. */
  id: string;
  soort: VensterSoort;
  titel: string;
  /** Geminimaliseerd (in het dok) of open. Beide standen overleven de navigatie. */
  klein: boolean;
  /** Waar het venster geopend werd (hub/mail/cloud…). Alleen informatief: het dok toont het venster overal. */
  dienst: string;
  /** Welke maildienst het venster koppelt (shared/mail-aanbieders.ts). */
  aanbieder: string;
  /** Het ingevulde adres — veilig om te bewaren, dat vroeg de eigenaar expliciet («введена адреса»). */
  adres: string;
  stap: VensterStap;
  /** Wanneer deze beschrijving voor het laatst veranderde (ms). Bepaalt wie wint bij samenvoegen. */
  op: number;
};

export type VensterStand = { vensters: readonly OnthoudenVenster[]; op: number };
export const LEGE_VENSTERSTAND: VensterStand = Object.freeze({ vensters: Object.freeze([]), op: 0 });

/** Hoeveel vensters er hoogstens onthouden worden (daarboven valt het oudste weg). Meerdere naast elkaar is de bedoeling. */
export const VENSTER_MAX = 8;
const TEKST_MAX = 200;

const tekst = (value: unknown, max = TEKST_MAX) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const getal = (value: unknown) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };

/** Account + ruimte = de lade waarin een venster hoort. Twee accounts in dezelfde browser zien elkaars vensters nooit. */
export const vensterScope = (account: unknown, ruimte: unknown): string => {
  const a = tekst(account, 180).toLowerCase() || 'anon';
  const r = String(ruimte ?? '') === 'technisch' ? 'technisch' : 'prive';
  return `${a}|${r}`;
};

/** Elk veld met een geheime naam eruit — ongeacht hoe diep de aanroeper het meegaf. */
export const zonderGeheimen = <T>(waarde: T): T => {
  if (Array.isArray(waarde)) return waarde.map((x) => zonderGeheimen(x)) as unknown as T;
  if (!waarde || typeof waarde !== 'object') return waarde;
  const uit: Record<string, unknown> = {};
  for (const [sleutel, inhoud] of Object.entries(waarde as Record<string, unknown>)) {
    if (VENSTER_GEHEIME_VELDEN.includes(sleutel.toLowerCase())) continue;
    uit[sleutel] = zonderGeheimen(inhoud);
  }
  return uit as T;
};

/**
 * De stap zoals die BEWAARD wordt. Stond het venster op het invullen van een app-wachtwoord, dan onthouden we alleen dat
 * dáár hervat moet worden — met een eigen stapnaam, zodat de weergave «введіть пароль ще раз» kan zeggen in plaats van te
 * doen alsof het wachtwoord er nog staat.
 */
export const stapOmTeBewaren = (stap: unknown): VensterStap => {
  const s = String(stap ?? '');
  if (s === 'wachtwoord' || s === 'wachtwoord-opnieuw') return 'wachtwoord-opnieuw';
  return (VENSTER_STAPPEN as readonly string[]).includes(s) ? s as VensterStap : 'adres';
};

/** Eén venster opschonen; null = deze beschrijving is onbruikbaar en wordt niet bewaard. */
export const normaliseerVenster = (ruw: unknown): OnthoudenVenster | null => {
  if (!ruw || typeof ruw !== 'object') return null;
  const v = zonderGeheimen(ruw as Record<string, unknown>);
  const soort = tekst(v.soort, 40);
  const id = tekst(v.id, 120);
  if (!id || !(VENSTER_SOORTEN as readonly string[]).includes(soort)) return null;
  return {
    id, soort: soort as VensterSoort, titel: tekst(v.titel), klein: v.klein === true,
    dienst: tekst(v.dienst, 40), aanbieder: tekst(v.aanbieder, 40), adres: tekst(v.adres, 320).toLowerCase(),
    stap: stapOmTeBewaren(v.stap), op: getal(v.op) || Date.now(),
  };
};

/** De hele stand opschonen: hoogstens VENSTER_MAX vensters, nieuwste eerst, elke id één keer. */
export const normaliseerVensterStand = (ruw: unknown): VensterStand => {
  const bron = ruw && typeof ruw === 'object' ? (ruw as Record<string, unknown>) : {};
  const lijst = Array.isArray(bron.vensters) ? bron.vensters : [];
  const gezien = new Set<string>();
  const vensters: OnthoudenVenster[] = [];
  for (const rij of lijst) {
    const v = normaliseerVenster(rij);
    if (!v || gezien.has(v.id)) continue;
    gezien.add(v.id);
    vensters.push(v);
  }
  vensters.sort((a, b) => b.op - a.op);
  const bewaard = vensters.slice(0, VENSTER_MAX);
  return { vensters: bewaard, op: getal(bron.op) || bewaard[0]?.op || 0 };
};

/** Venster toevoegen of bijwerken (zelfde id = bijwerken). De oudste valt weg zodra het er meer dan VENSTER_MAX zijn. */
export const metVenster = (stand: VensterStand | null | undefined, ruw: unknown, nu = Date.now()): VensterStand => {
  const venster = normaliseerVenster(ruw);
  if (!venster) return normaliseerVensterStand(stand);
  const rest = (stand?.vensters ?? []).filter((v) => v.id !== venster.id);
  return normaliseerVensterStand({ vensters: [{ ...venster, op: nu }, ...rest], op: nu });
};

export const zonderVenster = (stand: VensterStand | null | undefined, id: unknown, nu = Date.now()): VensterStand => {
  const sleutel = tekst(id, 120);
  const rest = (stand?.vensters ?? []).filter((v) => v.id !== sleutel);
  return normaliseerVensterStand({ vensters: rest, op: nu });
};

/** Alleen de minimalisatie omzetten (het dok), zonder de rest van de beschrijving aan te raken. */
export const metVensterKlein = (stand: VensterStand | null | undefined, id: unknown, klein: boolean, nu = Date.now()): VensterStand => {
  const sleutel = tekst(id, 120);
  const huidig = (stand?.vensters ?? []).find((v) => v.id === sleutel);
  if (!huidig) return normaliseerVensterStand(stand);
  return metVenster(stand, { ...huidig, klein }, nu);
};

/**
 * Twee standen samenvoegen: per venster wint de NIEUWSTE beschrijving. Zo kan een tweede tabblad (of een ander subdomein
 * dat nog niet opgeslagen had) de server niet terugdraaien, en verliest een trage server-ophaling geen verse klik.
 */
export const voegVensterStandenSamen = (a: VensterStand | null | undefined, b: VensterStand | null | undefined): VensterStand => {
  const beste = new Map<string, OnthoudenVenster>();
  for (const v of [...(a?.vensters ?? []), ...(b?.vensters ?? [])]) {
    const al = beste.get(v.id);
    if (!al || v.op > al.op) beste.set(v.id, v);
  }
  return normaliseerVensterStand({ vensters: [...beste.values()], op: Math.max(getal(a?.op), getal(b?.op)) });
};

/** Bevat deze stand (na opschonen) ergens nog een geheim? Voor de test én voor de zelfcontrole van de route. */
export const standHeeftGeheim = (stand: unknown): boolean => {
  const tekstVorm = JSON.stringify(stand ?? {});
  return VENSTER_GEHEIME_VELDEN.some((veld) => new RegExp(`"${veld}"\\s*:`, 'i').test(tekstVorm));
};
