// Koppelcode voor de SERVER ZELF als apparaat van de eigenaar (zone G, 22.10.2026). Wordt door de installer (root) gestart als de
// dienstgebruiker met de geheimen van de dienst (systemd-run -p User=mijnruimte -p EnvironmentFile=geheimen.env, precies zoals
// migrate.mjs en rook.mjs), NOOIT door de site zelf: de site mag zichzelf geen toegang tot haar eigen host geven. De code is dezelfde
// eenmalige koppelcode als op mcp.* → Пристрої (5 minuten, alleen de hash in de database, ruimte 'technisch'), en wordt door
// deploy/apparaat-inrichten.sh via stdin aan `agent.mjs pair --code -` gegeven — hij komt nooit in een procestabel of logboek.
//   node dist-server/apparaat-koppelcode.mjs [--ruimte technisch|prive] [--eigenaar <e-mail>]   → de code op stdout (één regel)
// Weigert als de eigenaar (OWNER_EMAIL) nog geen goedgekeurd account heeft (eerst één keer aanmelden op id.*), of als hij al 10 apparaten
// heeft, of bij de limiet van 5 codes per 10 minuten. Exitcode 0 = code gegeven; 3 = eigenaar nog niet aangemeld; 1 = andere fout.
import { auditToevoegen } from './platform/audit';
import { ownerEmail } from './platform/beveiliging';
import { closePool, getPool } from './platform/pg';
import * as store from '../backend/connectors-opslag';
import { pairingCode, sha256 } from '../backend/connectors-crypto';
import { ruimteOf } from '../shared/ai-ruimte';

export async function koppelcodeVoorEigenaar(opties: { ruimte?: unknown; eigenaar?: string } = {}): Promise<{ code: string; userId: string; verlooptMs: number; ruimte: 'prive' | 'technisch' }> {
  const email = String(opties.eigenaar || ownerEmail()).trim().toLowerCase();
  if (!email) throw Object.assign(new Error('OWNER_EMAIL ontbreekt'), { code: 'GEEN_EIGENAAR' });
  const r = (await getPool('systeem').query(`SELECT id FROM app.records WHERE tbl = 'users' AND lower(data->>'email') = $1 AND data->>'role' = 'owner' AND data->>'status' = 'approved' ORDER BY created_at NULLS LAST LIMIT 1`, [email])).rows[0];
  if (!r) throw Object.assign(new Error(`de eigenaar ${email} heeft nog geen goedgekeurd account: meld u eerst één keer aan op de site`), { code: 'EIGENAAR_NIET_AANGEMELD' });
  const userId = String(r.id);
  if ((await store.countAgents(userId)) >= store.AGENT_LIMITS.agentsPerUser) throw Object.assign(new Error('de eigenaar heeft al het maximum aantal apparaten (10): verwijder er eerst een op mcp.* → Пристрої'), { code: 'AGENT_LIMIT_REACHED' });
  const ruimte = ruimteOf(opties.ruimte ?? 'technisch');
  const code = pairingCode();
  const verloopt = await store.createPairingCode(userId, sha256(code), ruimte);
  if (!verloopt) throw Object.assign(new Error('te veel koppelcodes in 10 minuten: wacht even'), { code: 'PAIRING_CODE_RATE_LIMITED' });
  await store.purgeOldPairingCodes().catch(() => undefined);
  await auditToevoegen({ ownerId: userId, actorId: null, action: 'owner.agent.pairing_code', result: 'success', details: { ruimte, bron: 'installer', doel: 'server-apparaat' } }).catch(() => undefined);
  return { code, userId, verlooptMs: new Date(verloopt).getTime(), ruimte };
}

const alsProgramma = typeof process !== 'undefined' && /apparaat-koppelcode\.(mjs|ts)$/.test(String(process.argv[1] || ''));
if (alsProgramma) {
  const args = process.argv.slice(2);
  const waarde = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  koppelcodeVoorEigenaar({ ruimte: waarde('--ruimte'), eigenaar: waarde('--eigenaar') })
    .then(async (r) => { process.stdout.write(`${r.code}\n`); await closePool().catch(() => undefined); process.exit(0); })
    // Vast codewoord vóór de uitleg: deploy/apparaat-inrichten.sh herkent EIGENAAR_NIET_AANGEMELD ook als systemd-run de exitcode niet doorgeeft.
    .catch(async (e: Error & { code?: string }) => { console.error(`[apparaat-koppelcode] ${e.code || 'FOUT'}: ${e.message}`); await closePool().catch(() => undefined); process.exit(e.code === 'EIGENAAR_NIET_AANGEMELD' ? 3 : 1); });
}
