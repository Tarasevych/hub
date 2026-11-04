// Gegevens voor /agents. Eén poller voor apparaten en wachtende acties (agents-data), de rest alleen bij openen, na een actie
// en daarna rustig (60 s); nooit in een lus. Zie RUNBOOK §13.9 (oorzaak van «RATE_LIMITED»).
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../platform/client';
import { sessionBody } from '../agents-data';
import type { LogoKind } from '../mcp-ui';
import { ruimteOf, type AiRuimte } from '../../shared/ai-ruimte';

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
  const laad = useCallback(async () => {
    try { const d = await fn.current(); setData(d); setFout(null); return d; } catch (e) { setFout(e); return null; }
  }, []);
  useEffect(() => {
    void laad();
    const t = window.setInterval(() => { if (!document.hidden) void laad(); }, interval);
    return () => window.clearInterval(t);
  }, [laad, interval]);
  return { data, fout, laad };
}

export const useOverzicht = () => useRustig<Overzicht>(async () => (await api.post('/api/owner/agents/overzicht', sessionBody())).data as Overzicht);

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
  const laad = useCallback(async (voor?: string) => {
    setBezig(true);
    try {
      const r = await api.post('/api/owner/agents/journaal', { ...sessionBody(), soort: filter.soort, onderwerp: filter.onderwerp, limit: filter.limit ?? 100, ...(voor ? { voor } : {}) });
      const lijst = (r.data?.items ?? []) as JournaalItem[];
      setItems((oud) => (voor && oud ? [...oud, ...lijst.filter((x) => !oud.some((o) => o.id === x.id))] : lijst));
      setVolgende(r.data?.nextCursor ?? null); setFout(null);
    } catch (e) { setFout(e); } finally { setBezig(false); }
  }, [filter.soort, filter.onderwerp, filter.limit]);
  useEffect(() => {
    if (!actief) return;
    void laad();
    const t = window.setInterval(() => { if (!document.hidden) void laad(); }, 30_000);
    return () => window.clearInterval(t);
  }, [laad, actief, versie]);
  return { items, volgende, fout, bezig, laad };
}

/** Merkteken voor een AI-client op naam (Claude, Grok, Cursor, ChatGPT…); onbekend = generiek. */
export function aiLogo(naam: string): LogoKind {
  const n = naam.toLowerCase();
  if (/claude|anthropic/.test(n)) return 'claude';
  if (/grok|xai/.test(n)) return 'grok';
  if (/cursor/.test(n)) return 'cursor';
  if (/chatgpt|openai|gpt/.test(n)) return 'openai';
  return 'aiclient';
}
export function aiEigenaar(naam: string): string {
  const n = naam.toLowerCase();
  if (/claude|anthropic/.test(n)) return 'Anthropic';
  if (/grok|xai/.test(n)) return 'xAI';
  if (/cursor/.test(n)) return 'Anysphere';
  if (/chatgpt|openai|gpt/.test(n)) return 'OpenAI';
  return '';
}
export const isoMs = (v: string | null | undefined) => { if (!v) return null; const t = new Date(v).getTime(); return Number.isNaN(t) ? null : t; };
