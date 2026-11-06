// Typen voor scripts/orch/inleveren.mjs — de pijplijn die CLI (scripts/orch.mjs) én site/MCP (backend/orch-opslag.ts) gebruiken.
// ORCH-001 етап 3 (31.10.2026).
import type { Zaak } from './kern.mjs';

export const BESCHERMDE_STAAT: RegExp;
export type InleverRecord = {
  schema: number; id: string; taakId: string | null; agent: string | null; door?: string | null; kanaal: string | null; bron: string; bronSha256: string | null;
  basisCommit: string | null; tak: string | null; commit: string | null; bestanden: string[]; conflicten: string[];
  tests: { overgeslagen?: boolean; geslaagd: number; mislukt: number; reden?: string; uitvoer?: unknown[] } | null;
  zaken: Zaak[]; uitkomst: 'aanvaard' | 'geweigerd'; aangemaakt: string; integratieRef: string | null; pr: unknown; [k: string]: unknown;
};
export function veiligeTestEnv(env?: NodeJS.ProcessEnv): Record<string, string>;
export function inleveren(o: {
  wortel: string; beleid: any; lock: any; bron: string; kanaal?: string | null; taakId?: string | null; overdrachtPad?: string | null;
  tests?: string[] | null; standaardTests?: boolean; zonderTests?: string | null; alleenVeiligeControle?: boolean; integratieRef?: string | null; push?: boolean; nu?: string;
  /** Сервер: агент MCP-підключення — пакет мусить бути від його імені (AGENT_VERSCHILT). */ verwachteAgent?: string | null;
  /** Хто фактично доставив (власник / MCP-підключення з grant-id) — у записі передачі. */ door?: string | null;
  /** Межа розпакованого обсягу на архів (типово 1 ГіБ). */ maxUitgepaktBytes?: number;
}): InleverRecord;
export function registreerInlevering(wortel: string, record: InleverRecord): { recordPad: string; taakBijgewerkt: boolean; wachtrij: unknown };
