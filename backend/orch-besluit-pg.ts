// ORCH-001 етап 3 (31.10.2026) · Єдине місце, де координація торкається бази: виконане рішення власника «orch-regels»
// (app.eigenaar_besluiten, staat klaar) для «regels/toepassen». Окремий файл, щоб backend/orch-routes.ts і backend/orch-opslag.ts
// (та їхній тест) не залежали від pg. De rij komt uit dezelfde tabel die backend/eigenaar-besluit.ts bijhoudt.
import { getPool } from '../server/platform/pg';
import type { BesluitVoorToepassen } from './orch-opslag';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function besluitZoekenPg(e: { id: string }, besluitId: string): Promise<BesluitVoorToepassen | null> {
  if (!UUID.test(besluitId)) return null;
  const { rows } = await getPool('systeem').query(`SELECT id, inhoud, passkey FROM app.eigenaar_besluiten WHERE id = $1 AND user_id = $2 AND soort = 'orch-regels' AND staat = 'klaar'`, [besluitId, e.id]);
  const r = rows[0] as { id: string; inhoud: Record<string, unknown>; passkey: string } | undefined;
  if (!r || !r.inhoud || typeof r.inhoud !== 'object') return null;
  const i = r.inhoud;
  return { id: String(r.id), passkey: String(r.passkey || ''), inhoud: { regelsVersie: String(i.regelsVersie || ''), hash: String(i.hash || ''), kritiekHash: String(i.kritiekHash || ''), voorstel: String(i.voorstel || '') } };
}
