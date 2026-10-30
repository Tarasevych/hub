// FOTO'S EN LOGO'S VAN AFZENDERS in de browser (21.10.2026): per adres het beeld dat de EIGEN server geeft
// (POST /api/owner/mail/afzender-beelden, backend/merk-bron.ts): de foto van de mens (Google-contacten, vCard, Gravatar — alleen
// wat de mens zelf aanzette), anders het logo van zijn domein (BIMI / website van het domein), anders niets → de beginletters.
// Eén verzoek voor alle zichtbare rijen (≤ 50 adressen), 10 minuten in het geheugen. Altijd een data-URI van de eigen server: de
// browser laadt NOOIT een beeld van buiten (CSP img-src 'self' data:). Wat de server nog moet ophalen, wordt één keer later
// opnieuw gevraagd — zonder dat de rij verspringt (de plaats van het rondje staat vast).
import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../platform/client';
import { mailContext } from './api';
import { noteerBeeld, gebruikGekozenBeeld, wisBeeldGeschiedenis } from './beeld-geschiedenis';

export type AfzenderBeeld = { data: string; soort: 'persoon' | 'merk'; bron: string; domein?: string };
type Uit = { adres: string; soort: 'persoon' | 'merk' | 'geen'; data?: string; bron?: string; domein?: string };

const TTL = 10 * 60_000;
const LATER_MS = 30_000;
const cache = new Map<string, { v: AfzenderBeeld | null; t: number }>();
const wachtrij = new Set<string>();
const bezig = new Set<string>();
const nogEens = new Set<string>();
const luisteraars = new Set<() => void>();
let klok = 0;
const melden = () => { for (const l of luisteraars) l(); };
const abonneer = (l: () => void) => { luisteraars.add(l); return () => { luisteraars.delete(l); }; };
const BEELD = /^data:image\/(png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/;

async function versturen(): Promise<void> {
  klok = 0;
  const deel = [...wachtrij].slice(0, 50);
  for (const a of deel) { wachtrij.delete(a); bezig.add(a); }
  if (wachtrij.size) klok = window.setTimeout(() => void versturen(), 30);
  if (!deel.length) return;
  let later = false;
  try {
    const r = await api.post('/api/owner/mail/afzender-beelden', { ...mailContext(), adressen: deel });
    const lijst = (r.data?.beelden || []) as Uit[];
    later = Number(r.data?.wachtrij || 0) > 0;
    const per = new Map(lijst.map((x) => [String(x.adres || '').toLowerCase(), x]));
    for (const a of deel) {
      const x = per.get(a);
      const v = x && x.soort !== 'geen' && typeof x.data === 'string' && BEELD.test(x.data) ? { data: x.data, soort: x.soort, bron: String(x.bron || ''), domein: x.domein } : null;
      cache.set(a, { v, t: Date.now() });
      if (v?.data && v.bron) noteerBeeld(a, v.bron, v.data);
    }
  } catch { for (const a of deel) cache.set(a, { v: null, t: Date.now() }); }
  finally { for (const a of deel) bezig.delete(a); melden(); }
  // De server zette iets in zijn wachtrij (logo van een domein, foto uit de contacten): één keer later opnieuw vragen.
  if (later) window.setTimeout(() => { for (const a of deel) if (!cache.get(a)?.v && !nogEens.has(a)) { nogEens.add(a); cache.delete(a); vraag(a); } }, LATER_MS);
}
function vraag(adres: string): void {
  const c = cache.get(adres);
  if ((c && Date.now() - c.t < TTL) || bezig.has(adres) || wachtrij.has(adres)) return;
  wachtrij.add(adres);
  if (!klok) klok = window.setTimeout(() => void versturen(), 50);
}
const adresVan = (v: string | undefined): string => {
  const ruw = String(v || '').trim();
  const m = /<([^<>]+)>\s*$/.exec(ruw);
  const a = (m ? m[1] : ruw).trim().toLowerCase();
  return /^[^\s@<>"]{1,64}@[a-z0-9.-]{3,253}$/.test(a) ? a : '';
};

/** Het beeld van de afzender (adres of «Naam <adres>»), of null zolang er geen is. `aan: false` = niets vragen. */
export function useAfzenderBeeld(van: string | undefined, aan = true): AfzenderBeeld | null {
  const adres = adresVan(van);
  const v = useSyncExternalStore(abonneer, () => (adres ? cache.get(adres)?.v ?? null : null), () => null);
  const gekozen = gebruikGekozenBeeld(adres);
  useEffect(() => { if (aan && adres && typeof window !== 'undefined') vraag(adres); }, [adres, aan]);
  if (gekozen?.data) {
    const merk = gekozen.bron === 'bimi' || gekozen.bron === 'favicon' || gekozen.bron === 'manifest' || gekozen.bron === 'officieel';
    return { data: gekozen.data, soort: merk ? 'merk' : 'persoon', bron: gekozen.bron };
  }
  return v;
}
/** Na het wijzigen van de voorkeuren (Gravatar/Google aan of uit): alles opnieuw laten vragen. */
export function afzenderBeeldenVergeten(): void { cache.clear(); nogEens.clear(); wisBeeldGeschiedenis(); melden(); }
