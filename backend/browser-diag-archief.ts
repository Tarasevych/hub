// Archief van diagnosebuffers van de browserextensie (migratie 0020).
// De extensie houdt zelf hoogstens 200 items (console/netwerk, zonder query-strings, bodies of headers) met een TTL; een vol of oud
// buffer gaat hierheen. Opslag alleen versleuteld (AES-256-GCM via sealWithEnvKey, AAD gebonden aan gebruiker + agent) en per
// gebruiker onder strikte RLS; na 90 dagen weg. Lezen gebeurt alleen door de eigen gebruiker (en wordt als onbetrouwbaar behandeld).
import { envKey32, openWithEnvKey, sealWithEnvKey } from '../server/platform/beveiliging';
import { alsGebruiker } from './ai-grants';

export const DIAG_LIMITS = Object.freeze({ maxEntries: 200, maxEntryChars: 2000, retentionDays: 90, maxArchivesPerAgent: 500 });
const keyName = () => (envKey32('AI_ARCHIEF_SLEUTEL_V1') ? 'AI_ARCHIEF_SLEUTEL_V1' : 'TOTP_ENCRYPTION_KEY_V1');
const aad = (userId: string, agentId: string) => `diag:${userId}:${agentId}`;

type Entry = { t: number; kind: string; level?: string; text?: string; url?: string; status?: number; ms?: number };

/** Alleen bekende velden, ingekort; URL's zonder query-string en fragment. */
export function cleanEntries(input: unknown[]): Entry[] {
  const out: Entry[] = [];
  for (const raw of input.slice(0, DIAG_LIMITS.maxEntries)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    let url: string | undefined;
    if (typeof r.url === 'string') { try { const u = new URL(r.url); url = `${u.origin}${u.pathname}`.slice(0, 500); } catch { url = undefined; } }
    out.push({
      t: Number.isFinite(Number(r.t)) ? Number(r.t) : Date.now(),
      kind: ['console', 'network', 'exception'].includes(String(r.kind)) ? String(r.kind) : 'console',
      level: typeof r.level === 'string' ? r.level.slice(0, 10) : undefined,
      text: typeof r.text === 'string' ? r.text.slice(0, DIAG_LIMITS.maxEntryChars) : undefined,
      url,
      status: Number.isInteger(r.status) ? Number(r.status) : undefined,
      ms: Number.isFinite(Number(r.ms)) ? Math.round(Number(r.ms)) : undefined,
    });
  }
  return out;
}

export async function archiveDiagnostics(userId: string, agentId: string, entries: unknown[]) {
  const clean = cleanEntries(entries);
  const sealed = sealWithEnvKey(keyName(), JSON.stringify(clean), aad(userId, agentId));
  return alsGebruiker(userId, async (q) => {
    await q('DELETE FROM app.browser_diag_archive WHERE user_id = $1 AND expires_at < now()', [userId]);
    const { rows } = await q(
      `INSERT INTO app.browser_diag_archive (user_id, agent_id, entries, sealed, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(days => $5)) RETURNING id, created_at, expires_at`,
      [userId, agentId, clean.length, sealed, DIAG_LIMITS.retentionDays]);
    await q(`DELETE FROM app.browser_diag_archive WHERE user_id = $1 AND agent_id = $2 AND id NOT IN (
               SELECT id FROM app.browser_diag_archive WHERE user_id = $1 AND agent_id = $2 ORDER BY created_at DESC LIMIT $3)`, [userId, agentId, DIAG_LIMITS.maxArchivesPerAgent]);
    return { id: rows[0].id as string, entries: clean.length, expiresAt: new Date(rows[0].expires_at).getTime() };
  });
}

export async function readDiagnostics(userId: string, agentId: string, limit = 5): Promise<{ id: string; createdAt: number; entries: Entry[] }[]> {
  return alsGebruiker(userId, async (q) => {
    const { rows } = await q(
      `SELECT id, agent_id, created_at, sealed FROM app.browser_diag_archive
        WHERE user_id = $1 AND agent_id = $2 AND expires_at > now() ORDER BY created_at DESC LIMIT $3`, [userId, agentId, Math.min(50, limit)]);
    return rows.map((r) => {
      let entries: Entry[] = [];
      try { entries = JSON.parse(openWithEnvKey(keyName(), r.sealed, aad(userId, r.agent_id))) as Entry[]; } catch { entries = []; }
      return { id: r.id, createdAt: new Date(r.created_at).getTime(), entries };
    });
  });
}

/** Opruimen bij het opstarten (verlopen archieven van alle gebruikers; via het eigen beheer, niet via de app-rol). */
export async function purgeExpiredDiagnostics(systeemQuery: (sql: string) => Promise<unknown>) {
  await systeemQuery('DELETE FROM app.browser_diag_archive WHERE expires_at < now()');
}
