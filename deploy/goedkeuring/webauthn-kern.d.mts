// Typen voor webauthn-kern.mjs (gebruikt door backend/uitrol-goedkeuring.ts en de tests).
export type Jwk = Record<string, string>;
export type Sleutel = { credentialId: string; alg: number; jwk: Jwk; label?: string; vingerafdruk?: string; toegevoegd?: string; door?: string };
export type Assertie = { credentialId: string; clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string | null };
export type Doel = 'goedkeuren' | 'sleutel-toevoegen' | 'sleutel-verwijderen';
export const KERN_VERSIE: number;
export const UITDAGING_MAX_MS: number;
export const KLOK_SPELING_MS: number;
export const ALGORITMEN: Readonly<{ ES256: -7; EdDSA: -8; RS256: -257 }>;
export const VLAG: Readonly<{ UP: number; UV: number; BE: number; BS: number; AT: number; ED: number }>;
export const STANDAARD_RP: Readonly<{ rpId: string; origins: readonly string[] }>;
export function b64u(buf: Uint8Array | ArrayBuffer | string): string;
export function vanB64u(s: string, max?: number): Buffer;
export function cborLees(buf: Buffer, pos?: number, diepte?: number): { waarde: unknown; pos: number };
export function leesAuthData(buf: Buffer): { rpIdHash: Buffer; vlaggen: number; signCount: number; credentialId: Buffer | null; cose: Map<number | string, unknown> | null };
export function coseNaarJwk(cose: Map<number | string, unknown>): { alg: number; jwk: Jwk };
export function sleutelObject(sleutel: { alg: number; jwk: Jwk }): import('node:crypto').KeyObject;
export function vingerafdruk(sleutel: { alg: number; jwk: Jwk }): string;
export function vingerafdrukKort(hex: string): string;
export function uitdagingVoor(doel: Doel, velden: { nonce: string; verloopt: number; voorstelId?: string; versie?: string; sha256?: string; vingerafdruk?: string }): string;
export function verlooptGeldig(verloopt: number, nu?: number): string | null;
export function verifieerRegistratie(i: { credentialId?: string; clientDataJSON: string; attestationObject: string; verwachteUitdaging: string; rpId: string; origins: readonly string[] }):
  | { ok: true; credentialId: string; alg: number; jwk: Jwk; vingerafdruk: string; signCount: number; aaguid: string; fmt: string }
  | { ok: false; code: string };
export function verifieerAssertie(i: { assertie: Assertie; verwachteUitdaging: string; rpId: string; origins: readonly string[]; sleutels: readonly Sleutel[] }):
  | { ok: true; credentialId: string; vingerafdruk: string; signCount: number; vlaggen: number; label?: string }
  | { ok: false; code: string };
export function tellerOk(opgeslagen: number | undefined, nieuw: number): boolean;
export function normaliseerSleutelbestand(data: unknown): { versie: 1; rpId: string; origins: string[]; sleutels: Array<Required<Pick<Sleutel, 'credentialId' | 'alg' | 'jwk' | 'label' | 'vingerafdruk' | 'toegevoegd' | 'door'>>> };
