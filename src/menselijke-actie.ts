// SEC-002 extensie-02 / extensie-09 (12.11.2026): knoppen die een AI rechten of uitvoering geven, mag alleen de MENS bedienen.
//
// Een AI met «Клік і введення» in de browserextensie klikte vroeger zelf op «Дозволити» voor zijn eigen wachtende opdracht, op
// «Дозволити» in het OAuth-venster van een vreemde klant en op «Зберегти» in de matrix «Браузер і агенти». Twee lagen:
//   1. de site markeert zulke zones met data-ai-geen-actie: de brug van de extensie (extension/bridge.js) weigert daar elke klik,
//      invoer, toets en Enter; een snapshot markeert de elementen als «blocked»;
//   2. de knop zelf reageert alleen op een ECHTE gebeurtenis (isTrusted). Een klik vanuit een script — ook van een oudere extensie
//      zonder regel 1 — is nooit «trusted»; een formulier dat door zo'n klik verstuurd wordt evenmin (zie doorMens).
// data-ai-verborgen: tekst die een AI niet mag LEZEN (koppelcodes, zojuist gemaakte tokens): de brug laat hem weg uit snapshot,
// «wacht op tekst» en schermafbeelding.

export const AI_GEEN_ACTIE_ATTR = 'data-ai-geen-actie';
export const AI_VERBORGEN_ATTR = 'data-ai-verborgen';
/** Spreid op een element: <section {...geenAi}> — de extensie bedient hier niets. */
export const geenAi = { 'data-ai-geen-actie': '1' } as const;
/** Spreid op een element: <code {...verborgenVoorAi}> — de extensie leest dit niet en fotografeert het niet. */
export const verborgenVoorAi = { 'data-ai-verborgen': '1' } as const;

type Gebeurtenis = { nativeEvent?: { isTrusted?: boolean; type?: string } | null; isTrusted?: boolean; type?: string; preventDefault?: () => void } | null | undefined;
type Activering = { isActive?: boolean } | undefined;
const activering = (): Activering => {
  try { return (typeof navigator !== 'undefined' ? (navigator as unknown as { userActivation?: Activering }).userActivation : undefined); } catch { return undefined; }
};

/**
 * Komt deze gebeurtenis van de mens? Een klik of toets: alleen isTrusted. Een «submit»: die vuurt de browser zelf (ook na een
 * scriptklik op de verzendknop of requestSubmit), dus daar telt bovendien dat er NU een gebruikersgebaar actief is
 * (navigator.userActivation; een scriptklik geeft geen activering). Geen gebeurtenis = nee.
 */
export function doorMens(e: Gebeurtenis, ua: Activering = activering()): boolean {
  const n = (e && (e.nativeEvent ?? e)) as { isTrusted?: boolean; type?: string } | null | undefined;
  if (!n || n.isTrusted !== true) return false;
  if (n.type === 'submit' && ua && ua.isActive === false) return false;
  return true;
}

/** Handler-omhulsel: niet van de mens → de standaardactie gaat niet door (ook geen verzending, geen vinkje) en fn loopt niet. */
export function alleenMens<E extends Gebeurtenis>(fn: (e: E) => void): (e: E) => void {
  return (e: E) => {
    if (!doorMens(e)) { try { e?.preventDefault?.(); } catch { /* niets */ } return; }
    fn(e);
  };
}
