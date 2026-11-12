// MAILSCAN-002 · Перевірка контактів лише за окремою згодою власника кожної скриньки.
// Відсутність запису ніколи не означає згоду. Налаштування повторних спроб існують окремо.

export type ScanWerkwijze = 'handmatig' | 'bij-openen' | 'periodiek';
export type ScanVoorwaarde = 'zichtbaar' | 'verbonden';
export type ScanMelding = 'geen' | 'begin' | 'fout';
export type ScanVoorkeur = {
  aan: boolean;
  werkwijze: ScanWerkwijze;
  intervalMinuten: number;
  voorwaarde: ScanVoorwaarde;
  melding: ScanMelding;
};

export const SCAN_INTERVAL_MINUTEN = [15, 60, 360, 1440, 10080] as const;
export const STANDAARD_SCAN_VOORKEUR: Readonly<ScanVoorkeur> = Object.freeze({
  aan: false,
  werkwijze: 'handmatig',
  intervalMinuten: 1440,
  voorwaarde: 'zichtbaar',
  melding: 'geen',
});

export function normaliseerScanVoorkeur(ruw: unknown): ScanVoorkeur {
  const v = ruw && typeof ruw === 'object' && !Array.isArray(ruw) ? ruw as Partial<ScanVoorkeur> : {};
  return {
    aan: v.aan === true,
    werkwijze: v.werkwijze === 'bij-openen' || v.werkwijze === 'periodiek' ? v.werkwijze : 'handmatig',
    intervalMinuten: SCAN_INTERVAL_MINUTEN.includes(v.intervalMinuten as typeof SCAN_INTERVAL_MINUTEN[number]) ? v.intervalMinuten! : 1440,
    voorwaarde: v.voorwaarde === 'verbonden' ? 'verbonden' : 'zichtbaar',
    melding: v.melding === 'begin' || v.melding === 'fout' ? v.melding : 'geen',
  };
}

export function magScanAutomatisch(voorkeur: ScanVoorkeur, laatste: number | null, nu: number): boolean {
  if (!voorkeur.aan || voorkeur.werkwijze === 'handmatig') return false;
  if (voorkeur.werkwijze === 'bij-openen') return true;
  return laatste === null || !Number.isFinite(laatste) || nu - laatste >= voorkeur.intervalMinuten * 60_000;
}
