// Typen voor besluit-kern.mjs (gebruikt door backend/eigenaar-besluit.ts en de tests).
export const BESLUIT_VERSIE: 1;
export const BESLUIT_SOORTEN: readonly ['terugdraaien', 'externe-hosts'];
export const BESLUIT_MAX_HOSTS: number;
export type BesluitSoort = 'terugdraaien' | 'externe-hosts';
export type BesluitInhoud = { van: string; naar: string } | { hosts: string[] };
export function isBesluitSoort(s: unknown): s is BesluitSoort;
export function isBesluitId(s: unknown): boolean;
export function hostRegelOk(regel: unknown): boolean;
export function normaliseerInhoud(soort: 'terugdraaien', inhoud: unknown): { van: string; naar: string };
export function normaliseerInhoud(soort: 'externe-hosts', inhoud: unknown): { hosts: string[] };
export function normaliseerInhoud(soort: string, inhoud: unknown): BesluitInhoud;
export function canoniekeTekst(soort: string, inhoud: unknown): string;
export function besluitHash(soort: string, inhoud: unknown): string;
export function besluitKanaalOpen(soort: string, rechten: unknown): boolean;
