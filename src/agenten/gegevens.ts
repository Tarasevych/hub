// Gegevens voor /agents. Eén poller voor apparaten en wachtende acties (agents-data), de rest alleen bij openen, na een actie
// en daarna rustig (60 s); nooit in een lus. Zie RUNBOOK §13.9 (oorzaak van «RATE_LIMITED»).
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../platform/client';
import { sessionBody } from '../agenten-gegevens';
import type { LogoKind } from '../mcp-ui';
import { ruimteOf, type AiRuimte } from '../../shared/ai-ruimte';
import { agentSlugUitNaam } from '../../shared/markering-agenten';
import type { AgentSlug } from '../../shared/connector-v2/agenten';
import type { AgentToegangDiagnose } from '../../shared/ai-toegang-diagnose';
import { isRechtFout } from './fouten';

export type OauthVerbinding = { id: string; clientId: string; clientName: string; scope: string; createdAt: number; lastUsedAt: number | null; expiresAt: number; accessExpiresAt: number; revokedAt: number | null; status: 'active' | 'revoked' | 'expired'; ruimte?: AiRuimte };
export type Losgekoppeld = { id: string; name: string; platform: string | null; version: string | null; createdAt: number | null; revokedAt: number | null; lastSeenAt: number | null; reason: string; pairingId: string | null };
export type Overzicht = { oauth: OauthVerbinding[]; losgekoppeld: Losgekoppeld[]; toestemmingen: Record<string, { actief: number; altijd: number; eersteEinde: number | null }>; mcpUrl: string; now: number };
export type DeurToken = { id: string; name: string; prefix: string; scopes?: string[] | string | null; createdAt: string; expiresAt: string; revokedAt: string; calls: number; lastSeenAt: string; ruimte?: AiRuimte };
/** Alleen de rijen van één ruimte (shared/ai-ruimte.ts): de accountruimte toont nooit technische verbindingen, en omgekeerd. */
export const inRuimte = <T extends { ruimte?: unknown }>(lijst: readonly T[] | null | undefined, ruimte: AiRuimte): T[] => (lijst ?? []).filter((x) => ruimteOf(x.ruimte) === ruimte);
export type JournaalItem = {
  id: string; at: number; actie: string; soort: string; resultaat: string;
  onderwerp: { id: string; naam: string; soort: 'apparaat' | 'ai' | 'token'; platform: string | null } | null;
  details: Record<string, unknown>; ipHash: string | null; apparaat: string | null; dienst: string | null;
};

const RUSTIG_MS = 60_000;

/** Herlaadt bij openen, op verzoek en rustig op de achtergrond (alleen zichtbaar tabblad). */
function useRustig<T>(laadFn: () => Promise<T>, interval = RUSTIG_MS) {
  const [data, setData] = useState<T | null>(null);
  const [fout, setFout] = useState<unknown>(null);
  const fn = useRef(laadFn); fn.current = laadFn;
  // Audit 19.10 (U-03): zonder het recht «API-платформа» stopt het herladen — de muur blijft staan tot de pagina opnieuw opent.
  const geenRecht = useRef(false);
  const laad = useCallback(async () => {
    if (geenRecht.current) return null;
    try { const d = await fn.current(); setData(d); setFout(null); return d; } catch (e) { if (isRechtFout(e)) geenRecht.current = true; setFout(e); return null; }
  }, []);
  useEffect(() => {
    void laad();
    const t = window.setInterval(() => { if (!document.hidden && !geenRecht.current) void laad(); }, interval);
    return () => window.clearInterval(t);
  }, [laad, interval]);
  return { data, fout, laad };
}

export const useOverzicht = () => useRustig<Overzicht>(async () => (await api.post('/api/owner/agents/overzicht', sessionBody())).data as Overzicht);
/** De stand van connector v2 per agent (zelfde verzoek als «Конектори» en de pagina van één agent): voor de ingangen op het overzicht. */
export const useV2Overzicht = () => useRustig<V2OverzichtData>(async () => (await api.post('/api/owner/connector-v2/overzicht', sessionBody())).data as V2OverzichtData);
export type V2OverzichtData = { agenten: Array<{ slug: AgentSlug; koppelingen: unknown[]; erfenis?: unknown[]; deur?: unknown[] | null; voorkeur: { herverbinden: boolean } | null; diagnose?: AgentToegangDiagnose }>; poort?: { ruimte: AiRuimte; stand: string; code: string | null } };

export function useDeurTokens() {
  return useRustig<{ tokens: DeurToken[]; rechten: Record<string, boolean>; catalogus: Array<{ id: string; uk: string; nl: string; group?: string }>; bestand: string }>(async () => {
    const [r, t] = await Promise.all([api.post('/api/mcp/permissions', sessionBody()), api.post('/api/mcp/tokens/list', sessionBody())]);
    return { tokens: (t.data?.tokens ?? []) as DeurToken[], rechten: r.data?.permissions ?? {}, catalogus: r.data?.catalog ?? [], bestand: String(r.data?.file || '') };
  });
}

export function useJournaal(filter: { soort: string; onderwerp: string; limit?: number }, actief: boolean, versie: number) {
  const [items, setItems] = useState<JournaalItem[] | null>(null);
  const [volgende, setVolgende] = useState<string | null>(null);
  const [fout, setFout] = useState<unknown>(null);
  const [bezig, setBezig] = useState(false);
  const foutRef = useRef<unknown>(null);
  const laad = useCallback(async (voor?: string) => {
    setBezig(true);
    try {
      const r = await api.post('/api/owner/agents/journaal', { ...sessionBody(), soort: filter.soort, onderwerp: filter.onderwerp, limit: filter.limit ?? 100, ...(voor ? { voor } : {}) });
      const lijst = (r.data?.items ?? []) as JournaalItem[];
      setItems((oud) => (voor && oud ? [...oud, ...lijst.filter((x) => !oud.some((o) => o.id === x.id))] : lijst));
      setVolgende(r.data?.nextCursor ?? null); setFout(null); foutRef.current = null;
    } catch (e) { setFout(e); foutRef.current = e; if (isRechtFout(e)) setItems((oud) => oud ?? []); } finally { setBezig(false); }
  }, [filter.soort, filter.onderwerp, filter.limit]);
  useEffect(() => {
    if (!actief) return;
    void laad();
    const t = window.setInterval(() => { if (!document.hidden && !isRechtFout(foutRef.current)) void laad(); }, 30_000);
    return () => window.clearInterval(t);
  }, [laad, actief, versie]);
  return { items, volgende, fout, bezig, laad };
}

/** HUB-02: ÉÉN teller «ШІ підключено» voor overzicht, tabrij en connectors: het aantal VERSCHILLENDE AI-clients met een actieve
 * verbinding (Claude ×3 + een token van Claude = 1), niet het aantal grants + tokens. */
export function aiTeller(oauth: readonly { clientName: string; status?: string }[] | null | undefined, tokens: readonly { name: string; revokedAt?: string | null; expiresAt?: string | null }[] | null | undefined = [], nu = Date.now()): number {
  const sleutel = (naam: string) => { const k = aiLogo(naam); return k === 'aiclient' ? `naam:${naam.trim().toLowerCase()}` : k; };
  const s = new Set<string>();
  for (const g of oauth ?? []) if (g.status === undefined || g.status === 'active') s.add(sleutel(g.clientName));
  for (const t of tokens ?? []) if (!t.revokedAt && (isoMs(t.expiresAt) ?? 0) > nu && aiLogo(t.name) !== 'aiclient') s.add(sleutel(t.name));
  return s.size;
}

/**
 * Merkteken voor een AI-client op naam (Claude, Grok, Cursor, ChatGPT, Gemini, Copilot…); onbekend = generiek. Dezelfde naamregel
 * als de logo's en de markering (shared/markering-agenten.ts), zodat Gemini en Copilot geen «pseudo-logo» (sterretje) meer krijgen
 * maar hun merk uit het ene register (src/merk). De sleutels zijn die van het merkregister (`gpt` heet daar 'openai' als alias).
 */
const LOGO_PER_SLUG: Readonly<Record<AgentSlug, LogoKind>> = Object.freeze({ claude: 'claude', gpt: 'openai', codex: 'codex', grok: 'grok', gemini: 'gemini', copilot: 'copilot', cursor: 'cursor', antigravity: 'antigravity', autoclaw: 'autoclaw' });
export function aiLogo(naam: string): LogoKind {
  const slug = agentSlugUitNaam(naam);
  return slug ? LOGO_PER_SLUG[slug] : 'aiclient';
}
const EIGENAAR_PER_SLUG: Readonly<Record<AgentSlug, string>> = Object.freeze({ claude: 'Anthropic', gpt: 'OpenAI', codex: 'OpenAI', grok: 'xAI', gemini: 'Google', copilot: 'GitHub / Microsoft', cursor: 'Anysphere', antigravity: 'Google DeepMind', autoclaw: 'Z.ai (Zhipu AI)' });
export function aiEigenaar(naam: string): string {
  const slug = agentSlugUitNaam(naam);
  return slug ? EIGENAAR_PER_SLUG[slug] : '';
}
export const isoMs = (v: string | null | undefined) => { if (!v) return null; const t = new Date(v).getTime(); return Number.isNaN(t) ? null : t; };
