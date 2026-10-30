// Etap 6 (13.10.2026): beleidsdienst OPA in schaduw. Met de echte OPA-binaire (versie uit deploy/opa/versie.env, OPA_BIN) als aparte
// dienst op een vrije poort: het beleid «huidig» moet voor ELKE combinatie gelijk zijn aan de app (ADMIN_CAPABILITIES in backend/index.ts),
// «doel» vraagt een actief technisch profiel; schaduw blokkeert nooit en telt alleen; het ophaalscript weigert een verkeerde SHA-256.
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getPool } from '../../server/platform/pg';
import { schaduwAdmin, schaduwWegschrijven, vergelijk, vraagOpa, type AdminInvoer } from '../../backend/beleid';
import { checker } from './hulp/nep-google';

const OPA = [process.env.OPA_BIN, '/home/claude/e2e-tools/opa'].find((p) => p && existsSync(p)) as string | undefined;

export async function main(): Promise<number> {
  const { check, einde } = checker('beleid');
  const b = (allow: boolean, reden = '') => ({ allow, reden });

  // ---------------------------------------------------------------- puur
  check('vergelijk: gelijk', vergelijk(true, { huidig: b(true), doel: b(true) }).uitkomst === 'gelijk' && vergelijk(false, { huidig: b(false), doel: b(false) }).uitkomst === 'gelijk');
  check('vergelijk: verschil', vergelijk(true, { huidig: b(false, 'geen-recht'), doel: b(false) }).uitkomst === 'verschil');
  check('vergelijk: doel-weigert alleen als de app toestaat', vergelijk(true, { huidig: b(true), doel: b(false, 'tech-niet-actief') }).reden === 'tech-niet-actief' && vergelijk(false, { huidig: b(false), doel: b(false) }).uitkomst === 'gelijk');
  check('vergelijk: geen antwoord = onbereikbaar', vergelijk(true, null).uitkomst === 'onbereikbaar');

  // ---------------------------------------------------------------- bestanden
  const index = readFileSync('backend/index.ts', 'utf8');
  const tabelApp = JSON.parse(`{${(/const ADMIN_CAPABILITIES:Record<AdminRole,AdminCapability\[\]>=\{(.*?)\};/.exec(index)?.[1] ?? '').replace(/(\w+):\[/g, '"$1":[').replace(/'/g, '"')}}`);
  const data = JSON.parse(readFileSync('deploy/opa/beleid/data.json', 'utf8'));
  check('data.json = ADMIN_CAPABILITIES van de app (geen afwijking mogelijk)', JSON.stringify(tabelApp) === JSON.stringify(data.mijnruimte.admin_capabilities), JSON.stringify(tabelApp));
  check('doel: elke capability heeft een technische mogelijkheid (of leeg = elk actief profiel)', Object.values(tabelApp).flat().every((c) => typeof data.mijnruimte.doel_tech[c as string] === 'string'));
  check('adminContext roept de schaduw aan NA het besluit, zonder te wachten', /void schaduwAdmin\(\{[^}]*allow:!!role&&capabilities\.includes\(capability\)/.test(index));
  const unit = readFileSync('deploy/opa/mijn-ruimte-opa.service', 'utf8');
  check('dienst: alleen 127.0.0.1, geen netwerk naar buiten, DynamicUser, geen telemetrie', /--addr=127\.0\.0\.1:8181/.test(unit) && /IPAddressDeny=any/.test(unit) && /IPAddressAllow=localhost/.test(unit) && /DynamicUser=yes/.test(unit) && /--disable-telemetry/.test(unit) && !/--bundle|services\./.test(unit));
  const inst = readFileSync('deploy/installeer-app.sh', 'utf8');
  check('installer: alleen toegang.rego + data.json, check --strict, mislukken = waarschuwing', /for f in toegang\.rego data\.json/.test(inst) && /opa" check --strict/.test(inst) && /opa_inrichten "\$doel"/.test(inst) && !/opa_inrichten[\s\S]{0,1500}fout "/.test(inst.slice(inst.indexOf('opa_inrichten() {'), inst.indexOf('opa_inrichten() {') + 1500)));
  const versie = readFileSync('deploy/opa/versie.env', 'utf8');
  check('versie vast (geen latest) met SHA-256 voor amd64 en arm64', /^OPA_VERSIE=\d+\.\d+\.\d+$/m.test(versie) && /^OPA_SHA256_AMD64=[0-9a-f]{64}$/m.test(versie) && /^OPA_SHA256_ARM64=[0-9a-f]{64}$/m.test(versie));

  if (!OPA) { check('OPA-binaire niet gevonden (OPA_BIN) — dienstproeven overgeslagen', true); return einde(); }

  // ---------------------------------------------------------------- ophaalscript (file://, geen netwerk)
  const v = /^OPA_VERSIE=(.+)$/m.exec(versie)![1];
  const bron = mkdtempSync(join(tmpdir(), 'opa-bron-'));
  mkdirSync(join(bron, `v${v}`));
  copyFileSync(OPA, join(bron, `v${v}`, 'opa_linux_amd64_static'));
  const doelMap = mkdtempSync(join(tmpdir(), 'opa-doel-'));
  const ophalen = (extra: Record<string, string> = {}) => { try { return { ok: true, uit: execFileSync('bash', ['deploy/opa/opa-ophalen.sh', join(doelMap, 'opa')], { env: { ...process.env, OPA_BRON: `file://${bron}`, ...extra }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { const x = e as { stdout?: string; stderr?: string }; return { ok: false, uit: `${x.stdout || ''}${x.stderr || ''}` }; } };
  const eerst = ophalen();
  check('ophalen: juiste SHA-256 → geïnstalleerd', eerst.ok && /gecontroleerd/.test(eerst.uit) && existsSync(join(doelMap, 'opa')), eerst.uit);
  check('ophalen: tweede keer «al aanwezig»', /al aanwezig/.test(ophalen().uit));
  const vals = mkdtempSync(join(tmpdir(), 'opa-vals-'));
  mkdirSync(join(vals, `v${v}`)); writeFileSync(join(vals, `v${v}`, 'opa_linux_amd64_static'), 'nep');
  const doel2 = mkdtempSync(join(tmpdir(), 'opa-doel2-'));
  const fout = (() => { try { execFileSync('bash', ['deploy/opa/opa-ophalen.sh', join(doel2, 'opa')], { env: { ...process.env, OPA_BRON: `file://${vals}` }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return 'ok'; } catch (e) { return String((e as { stderr?: string }).stderr || ''); } })();
  check('ophalen: verkeerde SHA-256 → geweigerd, niets geplaatst', /KLOPT NIET/.test(fout) && !existsSync(join(doel2, 'opa')), fout.slice(0, 160));

  // ---------------------------------------------------------------- echte dienst
  const beleid = mkdtempSync(join(tmpdir(), 'opa-beleid-'));
  for (const f of ['toegang.rego', 'data.json']) copyFileSync(resolve('deploy/opa/beleid', f), join(beleid, f));
  const poort = 30000 + Math.floor(Math.random() * 20000);
  const proc = spawn(OPA, ['run', '--server', `--addr=127.0.0.1:${poort}`, '--disable-telemetry', '--log-level=error', beleid], { stdio: ['ignore', 'pipe', 'pipe'] });
  process.env.OPA_URL = `http://127.0.0.1:${poort}`;
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(`${process.env.OPA_URL}/health`)).ok) break; } catch { /* nog niet */ } await new Promise((r) => setTimeout(r, 100)); }
    // Elke combinatie rol × capability × eigenaar × dienst × status: OPA «huidig» = app.
    const rollen = ['', ...Object.keys(tabelApp)], caps = [...new Set(Object.values(tabelApp).flat())] as string[];
    let n = 0, mis: string[] = [];
    for (const rol of rollen) for (const cap of caps) for (const eigenaar of [false, true]) for (const dienst of ['admin', 'mail']) for (const status of ['approved', 'pending']) {
      const app = dienst === 'admin' && status === 'approved' && (eigenaar || (!!rol && (tabelApp[rol] as string[]).includes(cap)));
      const input: AdminInvoer = { soort: 'admin', capability: cap, subject: { eigenaar, adminRol: rol, status, dienst }, tech: { actief: false, mogelijkheden: [] } };
      const r = await vraagOpa(input, 2000);
      n++;
      if (!r || r.huidig.allow !== app) mis.push(`${rol}/${cap}/${eigenaar}/${dienst}/${status}`);
      if (r && app && r.doel.allow) mis.push(`doel-zonder-tech:${rol}/${cap}`);
    }
    check(`OPA «huidig» = app voor alle ${n} combinaties; «doel» weigert zonder technisch profiel`, mis.length === 0 && n === rollen.length * caps.length * 8, mis.slice(0, 5).join(' '));
    const met = await vraagOpa({ soort: 'admin', capability: 'roles.manage', subject: { eigenaar: true, adminRol: '', status: 'approved', dienst: 'admin' }, tech: { actief: true, mogelijkheden: ['roles.delegate'] } }, 2000);
    check('doel: eigenaar met tech-profiel (roles.delegate) mag rollen beheren', met?.doel.allow === true);
    const t0 = Date.now();
    const weg = await vraagOpa({ soort: 'admin', capability: 'admin.read', subject: { eigenaar: true, adminRol: '', status: 'approved', dienst: 'admin' }, tech: { actief: false, mogelijkheden: [] } }, 300).then(() => null);
    void weg;
    // schaduw → tellers
    const sys = getPool('systeem');
    await sys.query("DELETE FROM app.beleid_schaduw WHERE actie LIKE 'admin:%'");
    await schaduwAdmin({ userId: 'eenheid-beleid', eigenaar: true, adminRol: 'super_admin', status: 'approved', dienst: 'admin', capability: 'users.manage', allow: true, tab: '' });
    await schaduwAdmin({ userId: 'eenheid-beleid', eigenaar: false, adminRol: 'support_viewer', status: 'approved', dienst: 'admin', capability: 'users.manage', allow: true, tab: '' }); // app «staat toe» → verschil
    await schaduwWegschrijven();
    const rijen = (await sys.query("SELECT actie, uitkomst, reden, aantal FROM app.beleid_schaduw WHERE actie = 'admin:users.manage' ORDER BY uitkomst")).rows;
    check('schaduw telt doel-weigert (geen tech) en verschil (app ≠ beleid)', rijen.some((r) => r.uitkomst === 'doel-weigert' && r.reden === 'tech-niet-actief') && rijen.some((r) => r.uitkomst === 'verschil'), JSON.stringify(rijen));
    proc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
    const t1 = Date.now();
    await schaduwAdmin({ userId: 'eenheid-beleid', eigenaar: true, adminRol: 'super_admin', status: 'approved', dienst: 'admin', capability: 'audit.read', allow: true, tab: '' });
    await schaduwWegschrijven();
    check('OPA weg: telt «onbereikbaar», binnen ~300 ms, nooit een fout', (await sys.query("SELECT 1 FROM app.beleid_schaduw WHERE actie='admin:audit.read' AND uitkomst='onbereikbaar'")).rowCount === 1 && Date.now() - t1 < 1500, `${Date.now() - t1} ms`);
    void t0;
    await sys.query("DELETE FROM app.beleid_schaduw WHERE actie LIKE 'admin:%'");
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    proc.kill('SIGKILL');
    delete process.env.OPA_URL;
  }
  return einde();
}
