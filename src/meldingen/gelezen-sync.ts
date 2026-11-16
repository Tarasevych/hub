// UI-014 (bugfix, zonder vlag): «gelezen» van activiteiten (acties van agenten, browser, site) stond ALLEEN in localStorage van één
// subdomein. Wie op admin.tarasevych.com las, zag op id.tarasevych.com of op de telefoon dezelfde kaart nog als ongelezen.
// Nu bewaart de server een begrensde lijst gelezen activiteit-ids per account (backend/meldingen-gelezen.ts) en volgen alle
// tabbladen en apparaten die lijst. Mislukt de server (oud pakket, offline), dan blijft het gedrag zoals vroeger: alleen lokaal.
import { api } from '../platform/client';
import { meldingLichaam } from './sessie-context';

type Luisteraar = (ids: string[]) => void;
const luisteraars = new Set<Luisteraar>();
let geladen: Promise<void> | null = null;
let wachtrij = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let uit = false;

const geldig = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 120;
export function laadGelezen(): Promise<void> {
  if (uit) return Promise.resolve();
  if (!geladen) geladen = api.post('/api/owner/meldingen/gelezen', meldingLichaam()).then((r) => {
    const ids = Array.isArray(r.data?.ids) ? (r.data.ids as unknown[]).filter(geldig) as string[] : [];
    if (ids.length) luisteraars.forEach((f) => f(ids));
  }, (e: { status?: number }) => { if (e?.status === 404) uit = true; geladen = null; });
  return geladen;
}
export function abonneerGelezen(f: Luisteraar): () => void {
  luisteraars.add(f); void laadGelezen();
  const zicht = () => { if (!document.hidden) { geladen = null; void laadGelezen(); } };
  document.addEventListener('visibilitychange', zicht);
  return () => { luisteraars.delete(f); document.removeEventListener('visibilitychange', zicht); };
}
/** Bundelt markeringen 400 ms (alles gelezen = één verzoek). */
export function stuurGelezen(ids: readonly string[]): void {
  if (uit) return;
  for (const id of ids) if (geldig(id)) wachtrij.add(id);
  if (timer || !wachtrij.size) return;
  timer = setTimeout(() => {
    timer = null; const stuk = [...wachtrij].slice(0, 500); wachtrij = new Set([...wachtrij].slice(500));
    void api.post('/api/owner/meldingen/gelezen/toevoegen', meldingLichaam({ ids: stuk })).catch((e: { status?: number }) => { if (e?.status === 404) uit = true; });
  }, 400);
}
