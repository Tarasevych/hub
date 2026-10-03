// Melding aan een account vanuit modules zonder toegang tot backend/index.ts (fase 3). index.ts registreert
// zijn notify(); zonder registratie (tests) wordt er alleen gelogd.
type Melder = (userId: string, email: string, kind: string, title: string, message: string) => Promise<unknown>;
let melder: Melder | null = null;
export function registreerMelder(fn: Melder): void { melder = fn; }
export async function meld(userId: string, kind: string, title: string, message: string): Promise<void> {
  try { if (melder) await melder(userId, '', kind, title, message); }
  catch (err) { console.error('[melder] melding mislukt:', (err as Error).message); }
}
