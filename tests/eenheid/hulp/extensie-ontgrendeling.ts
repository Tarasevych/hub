// Testfixture (extensie 0.5/0.6, migraties 0072/0073): een lopende ontgrendeling voor een browseragent, rechtstreeks in de database.
// Sinds 0.5 stuurt de server GEEN browseropdracht naar een browseragent zonder ontgrendeling (dispatchCommand). Tests die de keten
// AI → server → extensie testen (browser-keten, ai-grants-contract) gaan daarom eerst langs deze fixture; de echte wegen (prive met
// step-up, technisch met profiel + eigen passkey) test tests/eenheid/extensie-ontgrendeling.test.ts.
// 0.6: de rij krijgt de ruimte van de agent (een rij van het andere slot telt nooit); voor 'prive' standaard PRIVE_HOSTS (nooit admin.*).
import { getPool } from '../../../server/platform/pg';
import { ADMIN_HOSTS_TOEGESTAAN, BROWSER_CAPS, PRIVE_HOSTS } from '../../../shared/extensie-ontgrendeling';

export async function ontgrendelVoorTest(agentId: string, userId: string, o: { caps?: readonly string[]; domeinen?: readonly string[]; minuten?: number; ruimte?: 'prive' | 'technisch'; activatieId?: string | null; lokaal?: boolean } = {}): Promise<string> {
  const pool = getPool('systeem');
  const ruimte = o.ruimte ?? ((await pool.query('SELECT ruimte FROM app.agents WHERE id::text = $1', [agentId])).rows[0]?.ruimte === 'technisch' ? 'technisch' : 'prive');
  const domeinen = o.domeinen ?? (ruimte === 'prive' ? PRIVE_HOSTS : ADMIN_HOSTS_TOEGESTAAN);
  const { rows } = await pool.query(
    `INSERT INTO app.extensie_ontgrendelingen (agent_id, user_id, caps, domeinen, nonce, eind_op, rollen, ruimte, activatie_id, lokaal)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6), $7, $8, $9, $10) RETURNING id`,
    [agentId, userId, [...(o.caps ?? BROWSER_CAPS)], [...domeinen], 'testfixture-nonce-0123456789', o.minuten ?? 60, ruimte === 'prive' ? [] : ['test'], ruimte, o.activatieId ?? null, o.lokaal === true]);
  return String(rows[0].id);
}
