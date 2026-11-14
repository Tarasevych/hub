// SEC-002 (g10i jsonbTekst, g02 обрізання рядків оселі; afwerking A): ÉÉN gedeelde plek voor tekst die PostgreSQL altijd aanneemt en voor
// afkappen zonder een halve emoji. Zuiver (geen Node, geen database): bruikbaar in backend, server/platform en de browser.
// Безпечне обрізання рядків за знаками та прибирання непарних сурогатів — одна спільна функція для сервера й клієнта.
//
// Waarom: jsonb weigert U+0000 en een eenzame surrogaat (de helft van een emoji die overblijft na `tekst.slice(0, n)`, of «\ud83d» die
// iemand rechtstreeks in JSON meestuurt). JSON.stringify schrijft zo'n halve emoji als escape «\udXXX», en dan faalt de hele INSERT.
// server/platform/json-veilig.ts exporteert deze functies opnieuw (bestaande imports blijven werken).

const EENZAAM = /[\uD800-\uDFFF]/gu; // met de u-vlag past dit alleen op surrogaten ZONDER partner
const JSON_ESCAPE = /\\\\|\\u0000|\\ud[89a-f][0-9a-f]{2}/gi;

/** U+0000 en eenzame surrogaten → U+FFFD. Lineair; een gewone tekst komt ongewijzigd (zelfde waarde) terug. */
export function tekstVeilig(waarde: string): string {
  let uit = waarde;
  if (uit.includes('\u0000')) uit = uit.replaceAll('\u0000', '�');
  // Goedkope voortest: alleen als er überhaupt een surrogaat in staat, loont de vervanging.
  return /[\uD800-\uDFFF]/.test(uit) ? uit.replace(EENZAAM, '�') : uit;
}

/** Afkappen op hoogstens `n` code-eenheden zonder een halve emoji (eenzame hoge surrogaat) achter te laten. */
export function knipTekst(waarde: string, n: number): string {
  if (waarde.length <= n) return waarde;
  const eind = n > 0 && (waarde.charCodeAt(n - 1) & 0xFC00) === 0xD800 ? n - 1 : Math.max(0, n);
  return waarde.slice(0, eind);
}

/**
 * De gedeelde functie voor «afkappen vóór opslag»: elke waarde → tekst, eenzame surrogaten en U+0000 → U+FFFD, en dan afkappen op
 * hoogstens `n` code-eenheden zonder een paar te breken. Gebruik dit in plaats van `String(x).slice(0, n)` voor alles wat in een
 * jsonb-kolom of in JSON voor de database belandt.
 */
export function knipVeilig(waarde: unknown, n: number): string {
  return knipTekst(tekstVeilig(typeof waarde === 'string' ? waarde : waarde == null ? '' : String(waarde)), Math.max(0, Math.floor(n) || 0));
}

/**
 * Maakt de uitvoer van JSON.stringify geschikt voor jsonb: de escapes «\u0000» en «\udXXX» (JSON.stringify schrijft een eenzame
 * surrogaat altijd als escape, een geldig paar nooit) worden U+FFFD — in waarden én in sleutels. «\\» wordt als paar overgeslagen,
 * zodat een letterlijke backslash gevolgd door «u0000» niet wordt aangeraakt.
 */
export function jsonbVeilig(json: string): string {
  return json.includes('\\u') ? json.replace(JSON_ESCAPE, (m) => (m === '\\\\' ? m : '�')) : json;
}

/**
 * JSON.stringify + jsonbVeilig, voor een parameter `$n::jsonb`. Zoals JSON.stringify: `undefined` (of een functie) geeft `undefined`
 * terug (de parameter wordt dan NULL), zodat dit overal een directe vervanging van JSON.stringify is.
 */
export const jsonbTekst = (waarde: unknown): string => {
  const json = JSON.stringify(waarde) as string | undefined;
  return (json === undefined ? json : jsonbVeilig(json)) as string;
};
