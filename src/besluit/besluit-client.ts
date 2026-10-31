// Клієнт «рішення власника з підписом passkey» (22.10.2026, зона B; RUNBOOK §15): один шлях для майстра відкату
// (src/besluit/TerugdraaiMeester.tsx) і для зовнішніх MCP-хостів (src/besluit/ExterneHosts.tsx).
//   1. starten      → сервер нормалізує вміст, рахує hash і створює одноразовий WebAuthn-challenge (≤ 5 хв);
//   2. passkey      → navigator.credentials.get (src/platform/webauthn.ts) — підпис саме над цим hash;
//   3. ondertekenen → сервер кладе підписаний запит у root-овий inbox; root сам перевіряє підпис і виконує;
//   4. status       → опитування, доки root не напише результат (klaar / geweigerd / mislukt / verlopen).
// Під час відкату сервер перезапускається: мережеві помилки в опитуванні — не помилка рішення, а очікувана пауза.
import { api } from '../platform/client';
import { foutCode, passkeyBevestigen, type AssertieOpties } from '../platform/webauthn';
import type { BesluitInhoud, BesluitSoort, BesluitStaat, BesluitStand, BesluitUit } from '../../shared/eigenaar-besluit';

export type BesluitContext = Record<string, unknown>;
export type Gestart = { id: string; soort: BesluitSoort; inhoud: BesluitInhoud; hash: string; uitdagingId: string; verloopt: number; publicKey: AssertieOpties; stand: { actief: string; vorige: string; hosts: string[] } };
export type Overzicht = { stand: BesluitStand & { hostsUitOmgeving: string[]; rootBijgewerkt: string }; inbox?: { pad: string; schrijfbaar: boolean; code: string; detail: string }; passkeys: Array<{ kort: string; label: string }>; rpId: string; besluiten: BesluitUit[]; limieten: { wachtMs: number; uitkomstMinuten: number; maxHosts: number } };
export type RootRegel = { tijd: string; code: string; niveau: string; uk: string; nl: string };
export type StatusAntwoord = { besluit: BesluitUit; stand: { actief?: string; vorige?: string; hosts?: string[]; /** orch-regels: root heeft de bevestiging vastgelegd */ bevestigd?: boolean };
  /** Ligt het besluit nog in de inbox (root heeft het niet opgepakt) en hoe lang na het ondertekenen. */
  verwerking?: { inInbox: boolean; seconden: number };
  /** Regels van root (gebeurtenissen.jsonl) sinds het ondertekenen. */
  gebeurtenissen?: RootRegel[];
  /** Controle na een uitgevoerd terugdraaien (technische ruimte + technische bestanden). */
  nacontrole?: { ok: boolean; stappen: Array<{ id: string; ok: boolean; detail: string }> } | null };
export const EIND_STATEN: readonly BesluitStaat[] = ['klaar', 'geweigerd', 'mislukt', 'verlopen'];

export const besluitOverzicht = async (ctx: BesluitContext) => (await api.post('/api/owner/besluit/overzicht', ctx)).data as Overzicht;
export const besluitStarten = async (ctx: BesluitContext, soort: BesluitSoort, inhoud: BesluitInhoud) => (await api.post('/api/owner/besluit/starten', { ...ctx, soort, inhoud })).data as Gestart;
export const besluitStatus = async (ctx: BesluitContext, id: string) => (await api.post('/api/owner/besluit/status', { ...ctx, id })).data as StatusAntwoord;

/** Крок 2+3: passkey підписує challenge, сервер передає рішення root-у. Кидає NotAllowedError, якщо людина скасувала. */
export async function besluitOndertekenen(ctx: BesluitContext, g: Gestart, signal?: AbortSignal): Promise<BesluitUit> {
  const assertie = await passkeyBevestigen(g.publicKey, signal);
  return (await api.post('/api/owner/besluit/ondertekenen', { ...ctx, id: g.id, uitdagingId: g.uitdagingId, assertie })).data as BesluitUit;
}

/**
 * Крок 4: опитувати стан, доки root не відповість. `onStap` отримує кожну відповідь (і паузи під час перезапуску: `pauze: true`).
 * Повертає кінцевий стан або null, якщо вичерпано `maxMs` (тоді сторінка показує GEEN_UITKOMST з підказкою).
 */
export async function besluitVolgen(ctx: BesluitContext, id: string, onStap: (s: StatusAntwoord | { pauze: true; fout: string }) => void, opties: { intervalMs?: number; maxMs?: number; signal?: AbortSignal } = {}): Promise<StatusAntwoord | null> {
  const interval = opties.intervalMs ?? 2000; const einde = Date.now() + (opties.maxMs ?? 16 * 60_000);
  while (Date.now() < einde) {
    if (opties.signal?.aborted) return null;
    try {
      const s = await besluitStatus(ctx, id);
      onStap(s);
      if (EIND_STATEN.includes(s.besluit.staat)) return s;
    } catch (e) {
      // Під час відкату служба перезапускається: 502/мережа — очікувано; інші коди теж не зупиняють очікування, бо root може ще працювати.
      onStap({ pauze: true, fout: foutCode(e) });
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}

/** Текст помилки запуску/підпису (коди сервера з shared/eigenaar-besluit.ts або DOMException). */
export function besluitFoutCode(e: unknown): string {
  const c = foutCode(e);
  if (c === 'NotAllowedError' || c === 'AbortError') return 'PASSKEY_GEANNULEERD';
  if (c === 'TimeoutError') return 'PASSKEY_TIJD';
  return c || 'BESLUIT_FOUT';
}
