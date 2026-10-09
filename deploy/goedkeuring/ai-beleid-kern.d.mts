// Types voor ai-beleid-kern.mjs (gebruikt door backend/ai-beleid.ts en de tests).
export const BELEID_VERSIE: 1;
export const ED25519_DOMEIN: string;
export const MAX_BELEID_BYTES: number;
export function canoniek(waarde: unknown): string;
export function beleidHash(beleid: unknown): string;
export function ed25519Bericht(beleid: unknown): Buffer;
export function sleutelVingerafdruk(spkiB64u: string): string;
export function beleidFout(b: unknown): string | null;
export function controleerEd25519(beleid: unknown, handtekening: { keyId?: string; signature?: string } | null | undefined, sleutels: unknown): { ok: true; keyId: string; vingerafdruk: string } | { ok: false; code: string };
export type KetenVersie = { beleid: any; hash?: string; ondertekend?: Record<string, unknown>; op?: string };
export function ketenFout(versies: unknown): { ok: true; laatste: any; hash: string } | { ok: false; code: string; index: number };
export function volgendeFout(laatste: any, nieuw: any, nu?: number): string | null;
