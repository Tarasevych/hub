// D-02 (audit fase 2): «Увімкнути» zonder reden deed NIETS (knop uit, geen uitleg, geen focus). Nu blijft de knop actief en wijst hij
// het veld aan (aria-invalid + melding + focus): dezelfde regel als de server (REDEN_VEREIST: minstens 3 tekens). Zuiver, los testbaar.
export const REDEN_MIN = 3;
export const redenFoutcode = (reden: string | undefined | null): 'REDEN_VEREIST' | null => (String(reden ?? '').trim().length < REDEN_MIN ? 'REDEN_VEREIST' : null);
