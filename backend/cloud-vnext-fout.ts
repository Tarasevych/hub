// SEC-002 (wolk-10, 12.11.2026): één plek die beslist welke fouttekst van cloud vNext de server mag VERLATEN.
//
// Tot nu toe gaven de drie routebestanden bij een onverwachte fout de eerste 80 tekens van err.message terug. Dat is bij een
// fout van het bestandssysteem een absoluut pad («ENOENT: no such file or directory, open '/srv/data/uploads/…») en bij een
// fout van PostgreSQL de naam van een tabel, een beperking of een stuk SQL — hulp voor wie de server verkent.
//
// Regel: alleen een VASTE code (hoofdletters en underscores, door onze eigen code gegooid) gaat naar de client. Al het andere
// wordt de vaste code CLOUD_VNEXT_FOUT met een kort willekeurig incidentnummer; de volledige tekst staat alleen in het
// serverlogboek, onder hetzelfde nummer, zodat de eigenaar een melding van een gebruiker kan terugvinden.
import { randomBytes } from 'node:crypto';
import { json } from '../server/platform';

/** Vorm van een code uit het contract of uit onze eigen `throw new Error('CLOUD_…')`. */
export const CODE_PATROON = /^[A-Z][A-Z_]{2,39}$/;

/** De code van deze fout als het een vaste code is, anders `standaard`. Nooit een stuk van een vrije fouttekst. */
export function veiligeFoutcode(err: unknown, standaard: string): string {
  const code = String((err as { message?: unknown } | null)?.message || '');
  return CODE_PATROON.test(code) ? code : standaard;
}

/**
 * Antwoord voor een fout die geen contractcode is (de aanroeper heeft de contractcodes met 400/404 al zelf beantwoord).
 * Een vaste interne code (CLOUD_…, DB_…) blijft zichtbaar — daar staat niets in; een vrije tekst wordt CLOUD_VNEXT_FOUT + incident.
 */
export function vnextFoutAntwoord(bron: string, err: unknown) {
  const tekst = String((err as { message?: unknown } | null)?.message || '');
  if (CODE_PATROON.test(tekst)) {
    console.error(`[${bron}]`, tekst);
    return json({ error: tekst }, 500);
  }
  const incident = randomBytes(4).toString('hex');
  console.error(`[${bron}] incident ${incident}:`, tekst.slice(0, 2000) || 'onbekende fout');
  return json({ error: 'CLOUD_VNEXT_FOUT', incident }, 500);
}
