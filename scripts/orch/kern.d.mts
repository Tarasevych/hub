// Typen voor scripts/orch/kern.mjs — alleen wat de backend (backend/orch-opslag.ts) en de app gebruiken. De kern zelf blijft puur
// JavaScript (draait ook zonder build op de server en bij elke agent). Tests bundelen met esbuild en gebruiken deze typen niet.
// ORCH-001 етап 3 (31.10.2026).
export type Zaak = { code: string; ernst: 'fout' | 'waarschuwing'; uk: string; nl: string; [k: string]: unknown };
export type Lock = { schema: number; regelsVersie: string; hash: string; kritiekHash: string; bestanden: Record<string, string>; eigenaar: Record<string, any> | null };
export type Verschil = { toegevoegd: number; verwijderd: number; gewijzigd: boolean };

export const SCHEMA: number;
export const STATUSSEN: readonly string[];
export const TAAK_STATEN: readonly string[];
export const TAAK_ID: RegExp;
export const SHA40: RegExp;
export const VERSIE: RegExp;
export const SEMVER: RegExp;
export const AGENT_ID: RegExp;
export const VOORSTEL_ID: RegExp;
export const CONTEXT_PAD: RegExp;
export const REGELS_NAMESPACE: string;
export const KANALEN: readonly string[];
export const INLEVERING_UITKOMSTEN: readonly string[];
export const WACHTRIJ_STATEN: readonly string[];
export const BASIS_VERPLICHT_VANAF: string;

export function sha256(tekst: string): string;
export function normaliseer(tekst: unknown): string;
export function stabielJson(w: unknown): string;
export function vergelijkSemver(a: string, b: string): number;
export function valideerBeleid(b: unknown): Zaak[];
export function regelsAfdruk(bestanden: Record<string, string>): { hash: string; bestanden: Record<string, string> };
export function kritiekAfdruk(beleid: unknown): string;
export function vergrendel(beleid: any, bestanden: Record<string, string>, vorige: Lock | null | undefined): { lock?: Lock; fout?: Zaak };
export function controleerLock(beleid: any, bestanden: Record<string, string>, lock: Lock | null): Zaak[];
export function eigenaarStatus(lock: Lock | null | undefined, verifieerUitslag: { ok: boolean; reden?: string } | null): Zaak | null;
export function bevestigMetPasskey(lock: Lock | null | undefined, b: { regelsVersie: string; hash: string; kritiekHash: string; voorstel: string; passkey: string; besluit: string; op?: string }): { lock?: Lock; fout?: Zaak };
export function regelVerschil(oud: string | undefined, nieuw: string | undefined): Verschil;
export function beoordeelVoorstel(huidig: { beleid: any; bestanden: Record<string, string>; lock: Lock | null }, nieuw: { bestanden: Record<string, string> }): { zaken: Zaak[]; regelsVersie?: string; hash?: string; kritiekHash?: string; kritiekGewijzigd?: boolean; verschil?: Record<string, Verschil>; beleid?: any; bestanden?: Record<string, string>; lock?: Lock };
export function controleerAdapter(pad: string, tekst: string, maxRegels: number): Zaak[];
export function compacteContext(agentsMd: string, beleid: any, lock: Lock | null): string;
export function valideerTaak(t: any, beleid: any): Zaak[];
export function versheid(feiten: any): Zaak[];
export function statusAfleiden(taak: any, geinstalleerd: { versie?: string; bronCommit: string } | null, isVoorouder: (a: string, b: string) => boolean): { status: string; [k: string]: unknown };
export function valideerOverdracht(o: any, beleid: any): Zaak[];
export function herkenKanaal(bron: string, isMap: boolean, expliciet?: string | null): string | null;
export const padVeilig: (p: string) => boolean;
export const UITGESLOTEN_PADEN: RegExp;
export const OVERDRACHT_ZIP: RegExp;
export const TAR_NAAM: RegExp;
export function leesBasisBestand(tekst: string): Record<string, string>;
export function controleerBasis(basis: any, geinstalleerd: any, pakketVersie: string): Zaak[];
export const basisBestandTekst: (versie: string, commit: string, lock: Lock | null) => string;
export const kritiekBericht: (lock: Lock) => string;
export function sshsigGegevens(namespace: string, bericht: Buffer): Buffer;
export function verifieerSshsig(o: { handtekening: string; bericht: string | Buffer; namespace: string; toegestaan: string; principal?: string }): { ok: boolean; reden?: string; sleutel?: string };
export function maakRapport(r: any): string;
