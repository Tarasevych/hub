// Toestand van de twee ruimtes (vlag tech-ruimtes-v2). Eén bron voor wisselknop, startvenster en «Доступ і терміни».
// Versheid tussen subdomeinen: geen 60 s wachten maar elke 15 s zolang het tabblad zichtbaar is, plus meteen bij focus/zichtbaar
// worden en bij een bericht van een ander tabblad (BroadcastChannel, zelfde origin). Na elke wijziging ook de oude tech-status
// vernieuwen, zodat de band en html[data-tech] meteen (zonder herladen) meegaan.
import { useSyncExternalStore } from 'react';
import { ruimtesApi, type Ruimte, type RuimtesStatus, type TermijnModus } from '../ruimtes-api';
import { techVernieuwen } from '../tech-opslag';
import { huidigeRuimte, meldRuimte, ruimteVanStatus } from './ruimte-signaal';

export type RuimtesToestand = { geladen: boolean; status: RuimtesStatus | null; bezig: '' | 'wisselen' | 'starten' | 'beeindigen' | 'verlengen'; fout: string; nu: number; uitleg: string };
let toestand: RuimtesToestand = { geladen: false, status: null, bezig: '', fout: '', nu: Date.now(), uitleg: '' };
const luisteraars = new Set<() => void>();
// Na elke wijziging: welke ruimte is actief? Bij een wissel maakt ruimte-signaal alle ruimte-afhankelijke toestand leeg.
const zet = (x: Partial<RuimtesToestand>) => { toestand = { ...toestand, ...x, nu: Date.now() }; luisteraars.forEach((f) => f()); if ('status' in x) meldRuimte(ruimteVanStatus(toestand.status)); };
export const ruimtesToestand = () => toestand;
export const useRuimtes = () => useSyncExternalStore((f) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; }, () => toestand, () => toestand);

export const POLL_MS = 15_000;
let kanaal: BroadcastChannel | null = null;
const meld = () => { try { kanaal?.postMessage({ t: 'ruimtes' }); } catch { /* geen kanaal: poll vangt het op */ } };
const code = (e: unknown) => String((e as Error)?.message || 'FOUT');

export async function ruimtesVernieuwen(): Promise<void> {
  try { zet({ geladen: true, status: await ruimtesApi.status(), fout: '' }); }
  catch (e) { const st = Number((e as { status?: number })?.status || 0); zet({ geladen: true, ...(st === 401 || st === 403 || st === 404 ? { status: null } : {}), fout: st >= 500 || !st ? 'NETWERK' : String((e as { code?: string })?.code || (e as Error)?.message || `HTTP ${st}`) }); }
}
async function actie(soort: RuimtesToestand['bezig'], f: () => Promise<RuimtesStatus>): Promise<RuimtesStatus> {
  zet({ bezig: soort, fout: '', uitleg: '' }); laatsteActie = Date.now();
  try { const s = await f(); zet({ status: s, bezig: '' }); meld(); void techVernieuwen(); return s; }
  catch (e) { zet({ bezig: '', fout: code(e) }); throw e; }
  finally { laatsteActie = Date.now(); }
}
/** Wisselen zonder herladen: optimistisch tonen, server bevestigt (of zet terug). */
export async function wissel(naar: Ruimte): Promise<RuimtesStatus> {
  const oud = toestand.status;
  if (oud) zet({ status: { ...oud, actief: naar, pauze: naar === 'prive' && !!oud.sessie } });
  try { return await actie('wisselen', () => ruimtesApi.wisselen(naar)); } catch (e) { if (oud) zet({ status: oud }); throw e; }
}
export const starten = (modus: TermijnModus, reden: string, minuten?: number) => actie('starten', () => ruimtesApi.starten(modus, reden, minuten));
export const verlengen = (minuten: number, soort: 'bijtellen' | 'vervangen') => actie('verlengen', () => ruimtesApi.verlengen(minuten, soort));
export const beeindigen = () => actie('beeindigen', () => ruimtesApi.beeindigen());

/**
 * Ruimtes-scheiding: mag de technische ruimte nu nog? Vraagt de controle-route (200 | 401 | 403 {error, uitleg:{uk,nl}}). Bij een
 * weigering: de Oekraïense (of Nederlandse) uitleg tonen en de status vernieuwen (de wissel valt dan terug naar de gewone ruimte).
 */
let controleBezig = false;
let laatsteActie = 0;
const RUIMTE_CODES = /^(SITE_SESSIE_WEG|ACCOUNT_NIET_ACTIEF|GEEN_TECH_SESSIE|VERLOPEN|GRENS_VOORBIJ|PAUZE|NIET_GEBONDEN|TECH_PROFILE_OFF|TECH_[A-Z_]+)$/;
export async function ruimteControle(taal: 'uk' | 'nl' = 'uk'): Promise<void> {
  if (controleBezig || !toestand.status?.aan || toestand.bezig || huidigeRuimte() !== 'technisch') return;
  controleBezig = true;
  try { await ruimtesApi.controle(); if (toestand.uitleg) zet({ uitleg: '' }); }
  catch (e) {
    const st = Number((e as { status?: number })?.status || 0);
    const d = (e as { data?: { uitleg?: { uk?: string; nl?: string } } })?.data;
    if (st === 401 || st === 403) { zet({ uitleg: String(d?.uitleg?.[taal] || d?.uitleg?.uk || (taal === 'uk' ? 'Технічний простір зараз недоступний.' : 'De technische ruimte is nu niet beschikbaar.')) }); await ruimtesVernieuwen(); }
  } finally { controleBezig = false; }
}
export const uitlegWeg = () => zet({ uitleg: '' });

let gestart = false;
export function startRuimtes(): void {
  if (gestart || typeof window === 'undefined') return;
  gestart = true;
  try { kanaal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('mr-ruimtes') : null; if (kanaal) kanaal.onmessage = () => { void ruimtesVernieuwen(); void techVernieuwen(); }; } catch { kanaal = null; }
  void ruimtesVernieuwen();
  const zichtbaar = () => { if (!document.hidden) { void ruimtesVernieuwen(); void ruimteControle(); } };
  // Een 401/403 van een ruimte-API of een kop X-Ruimte die niet past bij wat de pagina denkt: meteen controleren.
  window.addEventListener('mr-ruimte-antwoord', (ev) => {
    const d = (ev as CustomEvent<{ status: number; ruimte: string | null; pad: string; code?: string }>).detail;
    // Niet tijdens een eigen actie (wisselen/starten: de status is dan even optimistisch) en niet kort daarna.
    if (!d || d.pad.includes('/ruimtes/') || toestand.bezig || Date.now() - laatsteActie < 4000) return;
    if (huidigeRuimte() !== 'technisch') return;
    const mis = d.ruimte === 'prive';
    const weigering = d.status === 401 || (d.status === 403 && RUIMTE_CODES.test(String(d.code || '')));
    if (mis || weigering) void ruimteControle();
  });
  document.addEventListener('visibilitychange', zichtbaar);
  window.addEventListener('focus', zichtbaar);
  window.setInterval(() => { if (!document.hidden) void ruimtesVernieuwen(); }, POLL_MS);
  window.setInterval(() => zet({}), 15_000); // resterende tijd bijwerken
}
