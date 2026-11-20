// Zuivere regel (zonder browsermodules), gebruikt door src/functievlag-lezen.ts en de eenheidstest.
/**
 * IDENTITEIT-015 (gastcodes e2e): чи не варто питати прапорці до того, як відомий обліковий запис. «out» — вийшли; на сторінці гостя
 * /toegang (гість без облікового запису, лише cookie tsv_gast) — доки сесія власника не відома напевно, інакше кожен гість отримує 401.
 * Geen vlaggen vragen zolang er geen account bekend is: na uitloggen, of op de gastpagina /toegang zonder bekende sessie.
 */
export const geenSessieVerwacht = (pad: string, hint: string | undefined): boolean => hint === 'out' || (/^\/toegang\/?$/.test(pad) && hint !== 'known');
