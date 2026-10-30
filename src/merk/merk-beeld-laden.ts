// Logo's uit de MERKENDATABASE van de eigen server (app.merk_beeld, backend/merk-bron.ts) — voor merken zonder officieel bestand
// en zonder vorm met herkomst (merk-register.ts → MERK_DOMEIN). Gebundeld (≤ 50 domeinen per verzoek), één keer per domein per
// sessie; staat het domein nog in de wachtrij van de server, dan één keer later opnieuw. Los bestand: het register blijft puur.
// De browser krijgt een data-URI van de eigen server en laadt zelf NOOIT iets van het domein van de dienst.
import { registreerDatabaseMerken, type DatabaseBeeld } from './merk-register';

const gevraagd = new Set<string>();
const opnieuw = new Set<string>();
let wacht = new Set<string>();
let klok: ReturnType<typeof setTimeout> | null = null;
const LATER_MS = 25_000;

async function versturen(): Promise<void> {
  klok = null;
  const lijst = [...wacht].slice(0, 50);
  wacht = new Set([...wacht].slice(50));
  if (wacht.size) klok = setTimeout(() => void versturen(), 40);
  if (!lijst.length) return;
  try {
    const [{ ecosystemSessionLikely, ecosystemTabContext }, { sessieDienst }, { api }] = await Promise.all([import('../tab-context'), import('../canoniek-navigatie'), import('../platform/client')]);
    if (!ecosystemSessionLikely()) return;
    const r = (await api.post('/api/owner/merk-beeld', { service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin, domeinen: lijst })).data as { beelden?: DatabaseBeeld[]; wachtrij?: string[] } | null;
    if (r?.beelden?.length) registreerDatabaseMerken(r.beelden);
    // Nog in de wachtrij van de server (eerste keer gezien): één keer later opnieuw vragen, daarna niet meer in deze sessie.
    const later = (r?.wachtrij || []).filter((d) => !opnieuw.has(d));
    if (later.length) setTimeout(() => { for (const d of later) { opnieuw.add(d); gevraagd.delete(d); merkBeeldVragen(d); } }, LATER_MS);
  } catch { /* geen antwoord: de neutrale plaat blijft staan */ }
}

/** Vraag het logo van dit domein aan de eigen server (gebundeld). Zonder browser of zonder sessie: niets. */
export function merkBeeldVragen(domein: string): void {
  if (typeof window === 'undefined') return;
  const d = String(domein || '').trim().toLowerCase();
  if (!/^[a-z0-9.-]{3,253}$/.test(d) || gevraagd.has(d)) return;
  gevraagd.add(d);
  wacht.add(d);
  klok ??= setTimeout(() => void versturen(), 40);
}
