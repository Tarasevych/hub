// TELEGRAM-004 (16.11.2026, eis van de eigenaar) — de plaats volgens het TOESTEL (geolocatie van de browser, na toestemming)
// naast de plaats volgens het IP-ADRES, en het verschil ertussen. Puur (geen database, geen netwerk): we sturen de coördinaten
// NIET naar een externe dienst om een adres op te zoeken — de dichtstbijzijnde stad komt uit deze eigen lijst.
// Українською: місце за пристроєм поруч із місцем за IP і відстань між ними; жодних зовнішніх служб.
import { landNaam, stadNaam } from './plaatsnamen';

export type Punt = { lat: number; lon: number };
type Stad = Punt & { land: string };

/** Zelfde sleutels als STEDEN in plaatsnamen.ts (één sleutel per stad; «kiev»/«odessa»/«frankfurt am main» zijn daar alleen schrijfwijzen). */
export const STAD_PUNTEN: Readonly<Record<string, Stad>> = Object.freeze({
  brussels: { lat: 50.85, lon: 4.35, land: 'BE' }, antwerp: { lat: 51.22, lon: 4.4, land: 'BE' }, ghent: { lat: 51.05, lon: 3.72, land: 'BE' },
  bruges: { lat: 51.21, lon: 3.22, land: 'BE' }, leuven: { lat: 50.88, lon: 4.7, land: 'BE' }, mechelen: { lat: 51.03, lon: 4.48, land: 'BE' },
  liege: { lat: 50.63, lon: 5.57, land: 'BE' }, charleroi: { lat: 50.41, lon: 4.44, land: 'BE' }, namur: { lat: 50.47, lon: 4.87, land: 'BE' },
  hasselt: { lat: 50.93, lon: 5.34, land: 'BE' }, kortrijk: { lat: 50.83, lon: 3.26, land: 'BE' }, ostend: { lat: 51.23, lon: 2.92, land: 'BE' },
  aalst: { lat: 50.94, lon: 4.04, land: 'BE' }, genk: { lat: 50.97, lon: 5.5, land: 'BE' }, mons: { lat: 50.45, lon: 3.95, land: 'BE' },
  zaventem: { lat: 50.88, lon: 4.47, land: 'BE' }, 'sint-niklaas': { lat: 51.16, lon: 4.14, land: 'BE' },
  amsterdam: { lat: 52.37, lon: 4.9, land: 'NL' }, rotterdam: { lat: 51.92, lon: 4.48, land: 'NL' }, 'the hague': { lat: 52.08, lon: 4.31, land: 'NL' },
  utrecht: { lat: 52.09, lon: 5.12, land: 'NL' }, eindhoven: { lat: 51.44, lon: 5.48, land: 'NL' }, maastricht: { lat: 50.85, lon: 5.69, land: 'NL' },
  breda: { lat: 51.59, lon: 4.78, land: 'NL' }, groningen: { lat: 53.22, lon: 6.57, land: 'NL' },
  kyiv: { lat: 50.45, lon: 30.52, land: 'UA' }, lviv: { lat: 49.84, lon: 24.03, land: 'UA' }, kharkiv: { lat: 49.99, lon: 36.23, land: 'UA' },
  odesa: { lat: 46.48, lon: 30.73, land: 'UA' }, dnipro: { lat: 48.46, lon: 35.05, land: 'UA' }, zaporizhzhia: { lat: 47.84, lon: 35.14, land: 'UA' },
  vinnytsia: { lat: 49.23, lon: 28.47, land: 'UA' }, poltava: { lat: 49.59, lon: 34.55, land: 'UA' }, chernihiv: { lat: 51.5, lon: 31.29, land: 'UA' },
  cherkasy: { lat: 49.44, lon: 32.06, land: 'UA' }, zhytomyr: { lat: 50.25, lon: 28.66, land: 'UA' }, rivne: { lat: 50.62, lon: 26.25, land: 'UA' },
  lutsk: { lat: 50.75, lon: 25.33, land: 'UA' }, ternopil: { lat: 49.55, lon: 25.59, land: 'UA' }, 'ivano-frankivsk': { lat: 48.92, lon: 24.71, land: 'UA' },
  uzhhorod: { lat: 48.62, lon: 22.29, land: 'UA' }, chernivtsi: { lat: 48.29, lon: 25.94, land: 'UA' }, khmelnytskyi: { lat: 49.42, lon: 26.99, land: 'UA' },
  sumy: { lat: 50.91, lon: 34.8, land: 'UA' }, mykolaiv: { lat: 46.97, lon: 32.0, land: 'UA' }, kherson: { lat: 46.64, lon: 32.61, land: 'UA' },
  kropyvnytskyi: { lat: 48.51, lon: 32.26, land: 'UA' },
  paris: { lat: 48.86, lon: 2.35, land: 'FR' }, lille: { lat: 50.63, lon: 3.06, land: 'FR' }, luxembourg: { lat: 49.61, lon: 6.13, land: 'LU' },
  cologne: { lat: 50.94, lon: 6.96, land: 'DE' }, aachen: { lat: 50.78, lon: 6.08, land: 'DE' }, dusseldorf: { lat: 51.23, lon: 6.78, land: 'DE' },
  frankfurt: { lat: 50.11, lon: 8.68, land: 'DE' }, berlin: { lat: 52.52, lon: 13.4, land: 'DE' }, munich: { lat: 48.14, lon: 11.58, land: 'DE' },
  hamburg: { lat: 53.55, lon: 9.99, land: 'DE' }, london: { lat: 51.51, lon: -0.13, land: 'GB' }, warsaw: { lat: 52.23, lon: 21.01, land: 'PL' },
  krakow: { lat: 50.06, lon: 19.94, land: 'PL' }, wroclaw: { lat: 51.11, lon: 17.04, land: 'PL' }, prague: { lat: 50.08, lon: 14.44, land: 'CZ' },
  vienna: { lat: 48.21, lon: 16.37, land: 'AT' }, rome: { lat: 41.9, lon: 12.5, land: 'IT' }, milan: { lat: 45.46, lon: 9.19, land: 'IT' },
  madrid: { lat: 40.42, lon: -3.7, land: 'ES' }, barcelona: { lat: 41.39, lon: 2.17, land: 'ES' }, lisbon: { lat: 38.72, lon: -9.14, land: 'PT' },
  dublin: { lat: 53.35, lon: -6.26, land: 'IE' }, stockholm: { lat: 59.33, lon: 18.07, land: 'SE' }, copenhagen: { lat: 55.68, lon: 12.57, land: 'DK' },
  helsinki: { lat: 60.17, lon: 24.94, land: 'FI' }, oslo: { lat: 59.91, lon: 10.75, land: 'NO' }, zurich: { lat: 47.38, lon: 8.54, land: 'CH' },
  geneva: { lat: 46.2, lon: 6.15, land: 'CH' }, bucharest: { lat: 44.43, lon: 26.1, land: 'RO' }, chisinau: { lat: 47.01, lon: 28.86, land: 'MD' },
  vilnius: { lat: 54.69, lon: 25.28, land: 'LT' }, riga: { lat: 56.95, lon: 24.11, land: 'LV' }, tallinn: { lat: 59.44, lon: 24.75, land: 'EE' },
  budapest: { lat: 47.5, lon: 19.04, land: 'HU' }, bratislava: { lat: 48.15, lon: 17.11, land: 'SK' }, 'new york': { lat: 40.71, lon: -74.01, land: 'US' },
  ashburn: { lat: 39.04, lon: -77.49, land: 'US' },
});
const SCHRIJFWIJZE: Record<string, string> = { kiev: 'kyiv', odessa: 'odesa', 'frankfurt am main': 'frankfurt' };
const norm = (v: string): string => { const s = String(v || '').split(',')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); return SCHRIJFWIJZE[s] || s; };

/** Geldig punt (eindige getallen binnen de aardbol) of null. Geen (0,0): dat is de «geen waarde» van veel toestellen. */
export function geldigPunt(lat: unknown, lon: unknown): Punt | null {
  const a = typeof lat === 'number' ? lat : typeof lat === 'string' && lat.trim() ? Number(lat) : NaN;
  const o = typeof lon === 'number' ? lon : typeof lon === 'string' && lon.trim() ? Number(lon) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(o) || a < -90 || a > 90 || o < -180 || o > 180 || (a === 0 && o === 0)) return null;
  return { lat: a, lon: o };
}
/** Afstand over de bol in hele kilometers (haversine). */
export function afstandKm(a: Punt, b: Punt): number {
  const r = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h))));
}
/** Punt van een stad zoals de tunnel die noemt («Brussels»), of null als de stad niet in de lijst staat. */
export const stadPunt = (plaats: string): Punt | null => { const s = STAD_PUNTEN[norm(plaats)]; return s ? { lat: s.lat, lon: s.lon } : null; };
/** Dichtstbijzijnde stad uit de eigen lijst. */
export function dichtstbij(p: Punt): { sleutel: string; land: string; km: number } {
  let beste = { sleutel: '', land: '', km: Infinity };
  for (const [sleutel, s] of Object.entries(STAD_PUNTEN)) { const km = afstandKm(p, s); if (km < beste.km) beste = { sleutel, land: s.land, km }; }
  return beste;
}

/** Vanaf hier noemen we het toestel «bij» de stad; verder weg tonen we de afstand erbij. */
export const NABIJ_KM = 25;
/** Tot hier past het verschil bij gewone onnauwkeurigheid van een plaats volgens het IP-adres (knooppunt van de aanbieder). */
export const GELIJK_KM = 150;
/** Vanaf hier is het verschil groot genoeg voor een waarschuwing (VPN, of iemand anders op een andere plek). */
export const AFWIJKEND_KM = 400;

export type GeoStand = '' | 'gegeven' | 'geweigerd' | 'mislukt';
export type Oordeel = 'gelijk' | 'twijfel' | 'afwijkend' | 'onbekend';
export type PlaatsVergelijking = { geoTekst: string; km: number | null; oordeel: Oordeel };

/** «поблизу: Брюссель, Бельгія» / «≈ 60 км від: Брюссель, Бельгія». */
export function geoPlaatsTekst(p: Punt, taal: 'uk' | 'nl'): string {
  const d = dichtstbij(p);
  const naam = [stadNaam(d.sleutel, taal), landNaam(d.land, taal)].filter(Boolean).join(', ');
  if (!naam) return '';
  if (d.km <= NABIJ_KM) return taal === 'nl' ? `bij ${naam}` : `поблизу: ${naam}`;
  return taal === 'nl' ? `≈ ${d.km} km van ${naam}` : `≈ ${d.km} км від: ${naam}`;
}
/** Vergelijkt het punt van het toestel met het punt volgens het IP-adres (koppen van de tunnel, anders de stad uit de lijst). */
export function vergelijkPlaats(geo: Punt | null, ip: { punt: Punt | null; plaats: string }, taal: 'uk' | 'nl'): PlaatsVergelijking {
  if (!geo) return { geoTekst: '', km: null, oordeel: 'onbekend' };
  const ipPunt = ip.punt || stadPunt(ip.plaats);
  const km = ipPunt ? afstandKm(geo, ipPunt) : null;
  const oordeel: Oordeel = km === null ? 'onbekend' : km <= GELIJK_KM ? 'gelijk' : km < AFWIJKEND_KM ? 'twijfel' : 'afwijkend';
  return { geoTekst: geoPlaatsTekst(geo, taal), km, oordeel };
}
