// Wachttijden van de uitrolketen op één plek (audit 18.10.2026, punt 6).
//
// Waarom zo: systemd geeft het root-script (mijn-ruimte-uitrol.service én mijn-ruimte-goedkeuring.service) TimeoutStartSec=45min.
// Vroeger sloot de app een goedgekeurd voorstel al na 30 min als «verlopen GEEN_UITKOMST», terwijl de installatie (npm ci + build +
// migraties op een kleine VM) nog mocht lopen — de gebruiker zag «прострочено» bij een levende installatie. Regel nu:
//   app-wachttijden  >  systemd-limiet  (+ marge voor het oppakken door de path-unit en het wegschrijven van de uitkomst)
// Wordt het root-script bij die limiet door systemd gestopt (SIGTERM), dan schrijft het zelf `mislukt ONDERBROKEN` (trap) — de app
// hoeft dan niet te raden. RUN_STIL vangt alleen nog wat geen trap kan vangen (SIGKILL, OOM-killer, stroomuitval).
// tests/eenheid/uitrol-tijden.test.ts leest de service-bestanden en faalt als deze getallen uit de pas raken.

/** TimeoutStartSec van deploy/mijn-ruimte-uitrol.service en deploy/mijn-ruimte-goedkeuring.service (minuten). */
export const UITROL_SYSTEMD_LIMIET_MINUTEN = 45;
/** Na een passkey-goedkeuring zonder uitkomst van root: zo lang wacht de app voor «verlopen GEEN_UITKOMST». */
export const GOEDGEKEURD_WACHT_MINUTEN = UITROL_SYSTEMD_LIMIET_MINUTEN + 5;
/** Een run zonder nieuwe stap- of logregel (en niet «bezig» volgens status.json) geldt na zo lang als vastgelopen (RUN_STIL). */
export const RUN_STIL_MINUTEN = UITROL_SYSTEMD_LIMIET_MINUTEN + 15;
