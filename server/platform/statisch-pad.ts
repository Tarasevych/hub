// SEC-002 (http-rand-04, 12.11.2026): het pad van een statisch bestand, één keer gedecodeerd en genormaliseerd.
//
// server/start.ts besliste op het RUWE pad van de URL (verborgen bestand? technische bundel? onveranderlijk cachen?) en opende
// daarna het bestand op het GEDECODEERDE pad. «/assets/%74ech/x.js» en «/assets%2Ftech/x.js» waren voor de poort dus geen
// technische bundel, maar leverden wel het bestand uit dist/assets/tech/ — zonder toegangscookie en met
// «Cache-Control: public, immutable». «x.js%2Emap», «/%2Eenv» en «/l002-diagnostic%2Ejson» omzeilden zo het verbod op
// sourcemaps, verborgen bestanden en audit-uitvoer; en bestanden in een verborgen MAP («/.vite/manifest.json») werden zelfs
// zonder codering geserveerd, omdat alleen het laatste padsegment werd bekeken.
//
// Hier wordt het pad precies één keer gedecodeerd; ALLE beslissingen én het bestandspad komen uit hetzelfde resultaat.
import path from 'node:path';

/**
 * Nooit publiceren, ook niet als het per ongeluk in de build belandt:
 *   • elk padsegment dat met een punt begint — bestand OF map (.env, .git/…, .vite/…); alleen «.well-known» is een openbare map;
 *   • sourcemaps (*.map) en de audit-uitvoer l002-diagnostic.json.
 */
export const VERBORGEN_STATISCH = /(^|\/)\.(?!well-known(\/|$))[^/]*(\/|$)|(^|\/)(l002-diagnostic\.json|[^/]*\.map)$/i;

export type StatischDoel = {
  /** Gedecodeerd en genormaliseerd URL-pad («/assets/tech/x.js»): hierop beslist de server. */
  pad: string;
  /** Het bestand binnen de wortel dat bij dit pad hoort (bij een pad op «/»: index.html in die map). */
  file: string;
  /** Mag nooit geserveerd worden (zie VERBORGEN_STATISCH). */
  verborgen: boolean;
  /** Ligt onder de technische bundels: alleen met een geldige toegangscookie, nooit in een gedeelde cache. */
  tech: boolean;
};

/**
 * null = ongeldige codering, NUL-teken of buiten de wortel (de aanroeper antwoordt 400).
 * `tech` kijkt naar het pad én — als tweede hek — naar de plaats van het bestand zelf op schijf.
 */
export function statischDoel(root: string, urlPad: string, techPrefix: string): StatischDoel | null {
  let gedecodeerd: string;
  try { gedecodeerd = decodeURIComponent(String(urlPad || '/')); } catch { return null; }
  if (gedecodeerd.includes('\0')) return null;
  const pad = path.posix.normalize('/' + gedecodeerd);
  const file = path.resolve(root, '.' + (pad.endsWith('/') ? pad + 'index.html' : pad));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  const techMap = path.resolve(root, '.' + techPrefix);
  const tech = pad.startsWith(techPrefix) || file === techMap || file.startsWith(techMap + path.sep);
  return { pad, file, verborgen: VERBORGEN_STATISCH.test(pad), tech };
}
