// Typen voor besluit-kern.mjs (gebruikt door backend/eigenaar-besluit.ts, backend/orch-opslag.ts en de tests).
// ORCH-001 етап 3 (31.10.2026): soort «orch-regels» (bevestiging van de coördinatieregels met passkey).
export const BESLUIT_VERSIE: 1;
export const BESLUIT_SOORTEN: readonly ['terugdraaien', 'externe-hosts', 'orch-regels'];
export const BESLUIT_MAX_HOSTS: number;
export type BesluitSoort = 'terugdraaien' | 'externe-hosts' | 'orch-regels';
export type OrchRegelsInhoud = { regelsVersie: string; hash: string; kritiekHash: string; voorstel: string };
export type BesluitInhoud = { van: string; naar: string } | { hosts: string[] } | OrchRegelsInhoud;
export function isBesluitSoort(s: unknown): s is BesluitSoort;
export function isBesluitId(s: unknown): boolean;
export function hostRegelOk(regel: unknown): boolean;
export function normaliseerInhoud(soort: 'terugdraaien', inhoud: unknown): { van: string; naar: string };
export function normaliseerInhoud(soort: 'externe-hosts', inhoud: unknown): { hosts: string[] };
export function normaliseerInhoud(soort: 'orch-regels', inhoud: unknown): OrchRegelsInhoud;
export function normaliseerInhoud(soort: string, inhoud: unknown): BesluitInhoud;
export function canoniekeTekst(soort: string, inhoud: unknown): string;
export function besluitHash(soort: string, inhoud: unknown): string;
export function besluitKanaalOpen(soort: string, rechten: unknown): boolean;
