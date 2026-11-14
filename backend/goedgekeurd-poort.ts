// SEC-002 (autorisatie-09): sessiecontrole die óók goedkeuring eist.
//
// ownerRequireSession (backend/index.ts) laat bewust ook niet-goedgekeurde accounts (status new/pending) door: het wachtscherm,
// de toegangsaanvraag en het afmelden hebben een sessie nodig. Elke routefabriek moet de goedkeuring daarna zelf controleren.
// Een paar fabrieken deden dat niet (apparaatbevestiging «Це ви?» en haar stroom). Deze wikkel geeft zo'n fabriek een
// sessiecontrole die voor een niet-goedgekeurd account een fout teruggeeft, zodat de fabriek zelf niets hoeft te weten.
//
// De code bevat «FORBIDDEN»: backend/apparaat-bevestiging/routes.ts antwoordt daarop met 403 (anders 401, en 401 betekent
// voor de client «sessie weg» — dat is hier niet zo: de sessie is geldig, het account wacht op goedkeuring).
export const NIET_GOEDGEKEURD = 'ACCOUNT_NOT_APPROVED_FORBIDDEN' as const;

type MetFout = { errorCode: string };
type MetGebruiker = { user?: { status?: string } | null };

/** Wikkelt een sessiecontrole: geldige sessie van een niet-goedgekeurd account → { errorCode: NIET_GOEDGEKEURD }. */
export function alleenGoedgekeurd<A extends unknown[], R extends object>(requireSession: (...args: A) => Promise<R>): (...args: A) => Promise<R | MetFout> {
  return async (...args: A) => {
    const uitkomst = await requireSession(...args);
    if (uitkomst && typeof uitkomst === 'object' && !('errorCode' in uitkomst) && (uitkomst as MetGebruiker).user?.status !== 'approved') return { errorCode: NIET_GOEDGEKEURD };
    return uitkomst;
  };
}
