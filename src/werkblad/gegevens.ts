// Echte gegevens voor de widgets van het werkblad. Eén lader per bron met een korte cache (tien widgets vragen dezelfde route
// niet tien keer). Alles komt van een route die de HUB mag aanroepen — de laders van het oude bureaublad (src/bureau/gegevens.ts)
// worden hergebruikt, niet nagemaakt:
//   POST /api/owner/hub/blocks/data             e-mail, bestanden, agenda, opslag (backend/hub-blok-gegevens.ts)
//   POST /api/mcp/board/list                    taken en notities (backend/mcp-console.ts)
//   POST /api/owner/diagnostiek/mijn-diensten   stand van de eigen diensten (backend/beheer-diagnostiek.ts)
//   POST /api/owner/zoek/geschiedenis/lijst     recente zoekopdrachten van deze lade (backend/zoek-geschiedenis.ts)
//   GET  /__gezondheid                          antwoordt de site (server/start.ts)
//   POST /api/owner/hub/werkblad/tech           technische samenvatting (backend/werkblad.ts, alleen technische lade)
// Mislukt een route, dan zegt de widget dat met de code van de server — nooit een nagemaakt lijstje.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { api } from '../platform/client';
import { hubAuthBody } from '../useCanoniekHubAuth';
import { haalBord, haalDiensten, loadHubBlockData, readHubBlockDataCache, bordVergeten, type Bord, type BordTaak, type BordNotitie } from '../bureau/gegevens';
import type { HubBlockDataPayload } from '../hub-blok-gegevens';
import { haalTech } from './api';
import type { TechSamenvatting } from '../../shared/werkblad-indeling';

export type { Bord, BordTaak, BordNotitie, HubBlockDataPayload, TechSamenvatting };
export { haalBord, haalDiensten, loadHubBlockData, readHubBlockDataCache, bordVergeten };

/** Opslag (quota) zoals backend/hub-blok-gegevens.ts die sinds 22.10 meegeeft; oudere server → leeg. */
export type Opslag = { id: string; provider: string; email: string; limiet: number; gebruik: number; bijgewerktOp: number };
export const opslagUit = (p: HubBlockDataPayload | null): Opslag[] => {
  const raw = (p as unknown as { opslag?: unknown })?.opslag;
  return Array.isArray(raw) ? raw.filter((r) => r && typeof r === 'object').map((r) => { const o = r as Record<string, unknown>; return { id: String(o.id || ''), provider: String(o.provider || ''), email: String(o.email || ''), limiet: Number(o.limiet) || 0, gebruik: Number(o.gebruik) || 0, bijgewerktOp: Number(o.bijgewerktOp) || 0 }; }) : [];
};

const VERS = 60_000;
type Bak<T> = { waarde: T | null; op: number; lopend: Promise<T> | null };
const bak = <T,>(): Bak<T> => ({ waarde: null, op: 0, lopend: null });
function viaBak<T>(b: Bak<T>, force: boolean, laad: () => Promise<T>): Promise<T> {
  if (!force && b.waarde && Date.now() - b.op < VERS) return Promise.resolve(b.waarde);
  if (b.lopend) return b.lopend;
  const v = laad().then((w) => { b.waarde = w; b.op = Date.now(); return w; }).finally(() => { b.lopend = null; });
  b.lopend = v;
  return v;
}

export type ZoekRecent = { id: string; vraag: string; laatstOp: number; totaal: number; aantalKeer: number };
const zoekBak = bak<ZoekRecent[]>();
export const haalZoekRecent = (force = false) => viaBak(zoekBak, force, async () => {
  const r = await api.post('/api/owner/zoek/geschiedenis/lijst', hubAuthBody({ limiet: 10 }));
  const items = (r.data as { items?: unknown })?.items;
  return (Array.isArray(items) ? items : []).map((x) => { const o = (x || {}) as Record<string, unknown>; return { id: String(o.id || ''), vraag: String(o.vraag || '').slice(0, 300), laatstOp: Number(o.laatstOp || 0), totaal: Number(o.totaal || 0), aantalKeer: Number(o.aantalKeer || 1) }; }).filter((x) => x.vraag);
});
export const wisZoekRecent = async (id: string) => { await api.post('/api/owner/zoek/geschiedenis/wis', hubAuthBody({ id })); zoekBak.waarde = null; };
export const wisAlleZoekRecent = async () => { await api.post('/api/owner/zoek/geschiedenis/wis-alles', hubAuthBody()); zoekBak.waarde = null; };

export type Gezondheid = { ok: boolean; db: boolean; ms: number; op: number };
const gezondBak = bak<Gezondheid>();
export const haalGezondheid = (force = false) => viaBak(gezondBak, force, async () => {
  const t0 = Date.now();
  try {
    const r = await fetch('/__gezondheid', { cache: 'no-store', credentials: 'omit' });
    const d = (await r.json().catch(() => ({}))) as { ok?: unknown; db?: unknown };
    return { ok: r.ok && d.ok === true, db: d.db === true, ms: Date.now() - t0, op: Date.now() };
  } catch { return { ok: false, db: false, ms: Date.now() - t0, op: Date.now() }; }
});

const techBak = bak<TechSamenvatting>();
export const haalTechSamenvatting = (force = false) => viaBak(techBak, force, haalTech);

/** «Перевірити зараз» bij de stand van de diensten: dezelfde controle als «Налаштування» → «Акаунт» (alleen het eigen account; server begrenst 10 / 10 min). */
export const dienstenControleren = async () => { await api.post('/api/owner/diagnostiek/mijn-diensten', hubAuthBody({ uitvoeren: true })); };

/** Alles vergeten (na «Оновити» op het werkblad). */
export const allesVergeten = () => { zoekBak.waarde = null; gezondBak.waarde = null; techBak.waarde = null; bordVergeten(); };

/** Eén lader per widget: skelet zolang het laadt, foutcode als het misgaat; `herlaad()` haalt opnieuw op. */
export function useBron<T>(laad: (force: boolean) => Promise<T>, begin: T | null = null, actief = true) {
  const [waarde, setWaarde] = useState<T | null>(begin);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(actief);
  const [ronde, setRonde] = useState(0);
  const forceRef = useRef(false);
  useEffect(() => {
    if (!actief) return;
    let leeft = true;
    setBezig(true);
    laad(forceRef.current).then((v) => { if (leeft) { setWaarde(v); setFout(''); } })
      .catch((e: unknown) => { if (leeft) setFout(String((e as Error)?.message || 'FOUT')); })
      .finally(() => { if (leeft) setBezig(false); forceRef.current = false; });
    return () => { leeft = false; };
  }, [actief, ronde]); // eslint-disable-line react-hooks/exhaustive-deps
  const herlaad = () => { forceRef.current = true; setRonde((n) => n + 1); };
  return { waarde, fout, bezig, herlaad };
}

/** Lui laden: pas als de tegel (bijna) in beeld is, gaat de widget haar gegevens halen. Zonder IntersectionObserver: meteen. */
export function useZichtbaar<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [zichtbaar, setZichtbaar] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || zichtbaar || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setZichtbaar(true); io.disconnect(); } }, { rootMargin: '240px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [zichtbaar]);
  return [ref, zichtbaar];
}
