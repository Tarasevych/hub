// Etap B (14.10.2026): «beheerrechten alleen in een actief technisch profiel» — schakelaar van root, standaard UIT, fail-closed.
// Met de echte OPA-binaire op een vrije poort (zoals beleid.test.ts) en de echte database voor technische profielen.
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getPool } from '../../server/platform/pg';
import * as tp from '../../backend/tech-profiel';
import { _afdwingenCacheLeeg, afdwingAdmin, afdwingenAan, DOEL_TECH, doelLokaal, vraagOpa } from '../../backend/beleid';
import { TECH_ROLLEN } from '../../shared/tech-rollen';
import { checker } from './hulp/nep-google';

const OPA = [process.env.OPA_BIN, '/home/claude/e2e-tools/opa'].find((p) => p && existsSync(p)) as string | undefined;
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function main(): Promise<number> {
  const { check, einde } = checker('beleid-afdwingen');
  const data = JSON.parse(readFileSync('deploy/opa/beleid/data.json', 'utf8'));
  check('DOEL_TECH = doel_tech in data.json (OPA en app delen één regel)', JSON.stringify(DOEL_TECH) === JSON.stringify(data.mijnruimte.doel_tech));
  check('doelLokaal: geen profiel → weigeren; leeg recht → elk actief profiel; ontbrekend recht → weigeren',
    !doelLokaal('admin.read', { actief: false, mogelijkheden: [] }).allow && doelLokaal('admin.read', { actief: true, mogelijkheden: [] }).allow
    && doelLokaal('users.manage', { actief: true, mogelijkheden: ['diagnose.lezen'] }).reden === 'tech-mist-users.manage' && !doelLokaal('onbekend.x', { actief: true, mogelijkheden: ['users.manage'] }).allow);
  const index = readFileSync('backend/index.ts', 'utf8');
  check('adminContext: afdwingen NA het gewone besluit en vóór de toegang (fout = errorCode, 403)', /return\{errorCode:'OWNER_ADMIN_CAPABILITY_REQUIRED'\}as const;[^]*?const afgedwongen=await afdwingAdmin\(/.test(index) && /if\(afgedwongen\)return\{errorCode:afgedwongen\}as const;return\{\.\.\.auth,tenantKey,adminRole:role,capabilities\}/.test(index));
  check('installer: nieuwe servers krijgen "beheer-alleen-tech": false (nooit aan)', /"beheer-alleen-tech": false/.test(readFileSync('deploy/installeer-app.sh', 'utf8')) && !/"beheer-alleen-tech": true/.test(readFileSync('deploy/installeer-app.sh', 'utf8')));

  // ---------------------------------------------------------------- schakelaar
  const map = mkdtempSync(join(tmpdir(), 'afdwingen-'));
  const rechten = join(map, 'mcp-rechten.json');
  const oudPad = process.env.MCP_RECHTEN_PAD, oudUrl = process.env.OPA_URL;
  process.env.MCP_RECHTEN_PAD = rechten;
  const zet = async (inhoud: string | null) => { if (inhoud === null) { try { writeFileSync(rechten, ''); } catch { /* */ } } else writeFileSync(rechten, inhoud); _afdwingenCacheLeeg(); };
  await zet(null);
  check('schakelaar: geen of leeg bestand = uit', (await afdwingenAan()) === false);
  await zet('{"beheer-alleen-tech": "true"}');
  check('schakelaar: de tekst "true" is uit (alleen de boolean)', (await afdwingenAan()) === false);
  await zet('{"beheer-alleen-tech": true}');
  check('schakelaar: true = aan', (await afdwingenAan()) === true);

  if (!OPA) { check('OPA-binaire niet gevonden — dienstproeven overgeslagen', true); process.env.MCP_RECHTEN_PAD = oudPad; return einde(); }
  const beleid = mkdtempSync(join(tmpdir(), 'opa-afdw-'));
  for (const f of ['toegang.rego', 'data.json']) copyFileSync(resolve('deploy/opa/beleid', f), join(beleid, f));
  const poort = 30000 + Math.floor(Math.random() * 20000);
  const proc = spawn(OPA, ['run', '--server', `--addr=127.0.0.1:${poort}`, '--disable-telemetry', '--log-level=error', beleid], { stdio: 'ignore' });
  process.env.OPA_URL = `http://127.0.0.1:${poort}`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${process.env.OPA_URL}/health`)).ok) break; } catch { /* nog niet */ } await wacht(100); }

  const sys = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string) => { const id = randomUUID(); await sys.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'user', status: 'approved', name: 'Тест' }]); return { id, email, role: 'user', status: 'approved' }; };
  const bestaand = (await sys.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eig = bestaand ? { id: String(bestaand.id), email: String(bestaand.email), role: 'owner', status: 'approved' } : await mk(String(process.env.OWNER_EMAIL || 'eigenaar@eenheid.test'));
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  const eigProfielVooraf = (await sys.query('SELECT 1 FROM app.tech_profielen WHERE user_id=$1', [eig.id])).rows.length;
  const steun = await mk(`afdw-steun-${sfx}@eenheid.test`);
  try {
    // Gelijkheid lokaal ↔ OPA «doel» voor elke capability × elk profiel (rollen uit de catalogus, plus «geen profiel»).
    const profielen: Array<{ actief: boolean; mogelijkheden: string[] }> = [{ actief: false, mogelijkheden: [] }, { actief: true, mogelijkheden: [] }, ...TECH_ROLLEN.map((r) => ({ actief: true, mogelijkheden: [...r.mogelijkheden] }))];
    let gelijk = 0, totaal = 0; const afwijking: string[] = [];
    for (const cap of Object.keys(DOEL_TECH)) for (const tech of profielen) {
      const opa = await vraagOpa({ soort: 'admin', capability: cap, subject: { eigenaar: true, adminRol: 'super_admin', status: 'approved', dienst: 'admin' }, tech }, 2000);
      totaal++;
      if (opa && opa.doel.allow === doelLokaal(cap, tech).allow) gelijk++; else afwijking.push(`${cap}/${tech.mogelijkheden.join('+') || (tech.actief ? 'leeg' : 'geen')}`);
    }
    check(`lokale regel = OPA «doel» in alle ${totaal} combinaties`, gelijk === totaal, afwijking.slice(0, 5).join(', '));

    const base = { userId: eig.id, eigenaar: true, adminRol: 'super_admin', status: 'approved', dienst: 'admin' };
    await zet('{"beheer-alleen-tech": false}');
    check('uit: alles zoals vroeger (ook zonder technisch profiel)', (await afdwingAdmin({ ...base, capability: 'users.manage', tab: '' })) === null);
    await zet('{"beheer-alleen-tech": true}');
    check('aan, zonder tabblad/profiel: OWNER_ADMIN_TECH_REQUIRED', (await afdwingAdmin({ ...base, capability: 'users.manage', tab: '' })) === 'OWNER_ADMIN_TECH_REQUIRED');
    const tE = randomBytes(24).toString('hex');
    await tp.activeren(eig, tE, 30, 'afdwingen');
    check('aan, eigenaar met actief profiel in DIT tabblad: toegestaan', (await afdwingAdmin({ ...base, capability: 'users.manage', tab: tE })) === null);
    check('aan, ander tabblad (geen activering daar): geweigerd', (await afdwingAdmin({ ...base, capability: 'users.manage', tab: randomBytes(24).toString('hex') })) === 'OWNER_ADMIN_TECH_REQUIRED');
    await tp.toekennen(eig, tE, { email: steun.email, rollen: ['ondersteuning'], maxMinuten: 60 });
    const tS = randomBytes(24).toString('hex');
    await tp.activeren(steun, tS, 30, 'steun');
    const steunBase = { userId: steun.id, eigenaar: false, adminRol: 'super_admin', status: 'approved', dienst: 'admin' };
    check('aan, profiel zonder het recht (Підтримка → users.manage): geweigerd; admin.read wel', (await afdwingAdmin({ ...steunBase, capability: 'users.manage', tab: tS })) === 'OWNER_ADMIN_TECH_REQUIRED' && (await afdwingAdmin({ ...steunBase, capability: 'admin.read', tab: tS })) === null);
    process.env.OPA_URL = 'http://127.0.0.1:1';
    check('aan, OPA onbereikbaar: BELEID_ONBEREIKBAAR (fail-closed), ook voor de eigenaar', (await afdwingAdmin({ ...base, capability: 'users.manage', tab: tE })) === 'BELEID_ONBEREIKBAAR');
    const log = (await sys.query(`SELECT details FROM app.audit WHERE owner_id = ANY($1) AND action='owner.beleid.geweigerd' ORDER BY id`, [[eig.id, steun.id]])).rows.map((r) => r.details.code);
    check('elke weigering in het journaal (code), zonder inhoud', log.includes('OWNER_ADMIN_TECH_REQUIRED') && log.includes('BELEID_ONBEREIKBAAR'), log.join(','));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    proc.kill('SIGTERM');
    if (oudPad === undefined) delete process.env.MCP_RECHTEN_PAD; else process.env.MCP_RECHTEN_PAD = oudPad;
    if (oudUrl === undefined) delete process.env.OPA_URL; else process.env.OPA_URL = oudUrl;
    _afdwingenCacheLeeg();
    const ids = [steun.id];
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [eigProfielVooraf ? ids : [...ids, eig.id]]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [eigProfielVooraf ? ids : [...ids, eig.id]]).catch(() => undefined);
    await sys.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [ids]).catch(() => undefined);
  }
  return einde();
}
