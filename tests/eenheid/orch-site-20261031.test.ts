// ORCH-001 етап 3 (31.10.2026): координація через сайт / MCP / HTTP — backend/orch-opslag.ts, backend/orch-routes.ts,
// backend/orch-hulpmiddelen.ts на СПРАВЖНЬОМУ тимчасовому git-репозиторії (копія правил і scripts/orch, bare-origin для push), без бази
// даних: requireSession / isOwnerEmail / besluitZoeken — стаби (так само робить backend/index.ts, лише з pg). Перевіряється поведінка:
// поорт власника; чесне ORCH_GEEN_REPO; реєстрація задачі + staat-commit; завантаження пакета фрагментами з SHA-256 → ТОЙ САМИЙ конвеєр
// inleveren (прийнято / відхилено з причинами, гілка від бази, черга); MCP-інструменти orch_* тим самим шляхом; пропозиція правил (коди
// kern.beoordeelVoorstel); застосування ЛИШЕ з рішенням власника й записом root (гілка regels/<versie>-<tijd>, lock eigenaar.soort=passkey,
// CONTEXT-COMPACT.md, `orch controleer` зелений, push в origin, integratie не торкається); застарілі/брудні стани; реєстри інструментів
// (каталог v2, довжина назв ≤ 64 для кожного агента, тексти uk/nl без англійської, actieSoort, TOOL_CAPABILITY).
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as k from '../../scripts/orch/kern.mjs';
import { ORCH_CODES, ORCH_LIMIETEN, ORCH_ROUTES, ORCH_TOOL_NAMEN, orchCodeTekst } from '../../shared/orch-model';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import { MAX_NAAM, ontleed, toolNaam } from '../../shared/connector-v2/namen';
import { hulpmiddelTekst, isTweetalig } from '../../shared/hulpmiddel-teksten';
import { actieSoort, actieZin } from '../../shared/mcp-acties';
import { TOOL_CAPABILITY } from '../../shared/ai-beleid/catalogus';
import { ORCH_TOOLS, orchToolNamenGelijk } from '../../backend/orch-hulpmiddeldefinities';
import { taalFouten } from './hulp/taalcontrole';
import { checker } from './hulp/nep-google';

const sh = (cwd: string, cmd: string, args: string[]) => { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}${r.stdout}`); return r.stdout.trim(); };
const git = (cwd: string, ...a: string[]) => sh(cwd, 'git', a);
const gitOk = (cwd: string, ...a: string[]) => spawnSync('git', a, { cwd, encoding: 'utf8' }).status === 0;
const lees = (p: string) => readFileSync(p, 'utf8');
const json = (p: string) => JSON.parse(lees(p));
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const CONTROLEER = 'node scripts/orch.mjs controleer';
const bump = (v: string) => v.replace(/(\d+)$/, (m) => String(Number(m) + 1));

/** Werkkopie (ORCH_WORTEL) met integratie-tak, regels, lock, context en een kale origin om naar te pushen. */
function maakRepo() {
  const R = mkdtempSync(join(tmpdir(), 'orch-site-repo-')); const O = mkdtempSync(join(tmpdir(), 'orch-site-origin-'));
  for (const p of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'ANTIGRAVITY.md', 'CHATGPT.md', 'CODEX.md', 'GROK.md', '.cursorrules', 'scripts/orch.mjs', 'scripts/orch', 'orchestratie/beleid.json', 'orchestratie/BESLUITEN.md', 'orchestratie/eigenaar-ondertekenaars', 'orchestratie/sjablonen']) cpSync(p, join(R, p), { recursive: true });
  cpSync('.github/copilot-instructions.md', join(R, '.github/copilot-instructions.md'));
  mkdirSync(join(R, 'src')); writeFileSync(join(R, 'src/a.ts'), 'export const a = 1;\n'); writeFileSync(join(R, 'src/b.ts'), 'export const b = 2;\n');
  writeFileSync(join(R, 'orchestratie/wachtrij.json'), JSON.stringify({ schema: 1, integratieTak: 'integratie', integratieHoofd: null, bezig: null, wachtrij: [] }, null, 2));
  git(R, 'init', '-q', '-b', 'integratie'); git(R, 'config', 'user.email', 'eigenaar@test'); git(R, 'config', 'user.name', 'eigenaar');
  sh(R, process.execPath, ['scripts/orch.mjs', 'vergrendel']); sh(R, process.execPath, ['scripts/orch.mjs', 'context']);
  git(R, 'add', '-A'); git(R, 'commit', '-q', '-m', 'basis');
  git(O, 'init', '-q', '--bare'); git(R, 'remote', 'add', 'origin', O); git(R, 'push', '-q', '-u', 'origin', 'integratie');
  return { R, O, basis: git(R, 'rev-parse', 'HEAD'), beleid: json(join(R, 'orchestratie/beleid.json')), lock: json(join(R, 'orchestratie/regels.lock.json')) };
}
/** Pakket van een agent zonder git: export van de basis + wijzigingen + ORCH-OVERDRACHT.json → zip of tar.gz. */
function pakket(R: string, basis: string, naam: string, od: Record<string, unknown>, wijzig: (W: string) => string[]): Buffer {
  const W = mkdtempSync(join(tmpdir(), 'orch-site-agent-'));
  sh(W, 'sh', ['-c', `git -C "${R}" archive ${basis} | tar -x -C "${W}"`]);
  const bestanden = wijzig(W);
  writeFileSync(join(W, 'ORCH-OVERDRACHT.json'), JSON.stringify(od));
  const uit = join(W, naam);
  if (naam.endsWith('.zip')) sh(W, 'zip', ['-q', uit, ...bestanden, 'ORCH-OVERDRACHT.json']); else sh(W, 'tar', ['-czf', uit, ...bestanden, 'ORCH-OVERDRACHT.json']);
  const b = readFileSync(uit); rmSync(W, { recursive: true, force: true }); return b;
}
const overdracht = (o: Record<string, unknown>) => ({ schema: 1, agentPlatform: 'test', model: { id: null, versie: null, bron: 'onbekend' }, kanaal: 'zip', zonderGit: 'агент без git у тесті', commits: [], tests: { geslaagd: 1, mislukt: 0 }, nietGedaan: { uk: '—', nl: '—' }, conflicten: [], aangemaakt: '2026-10-31T15:00:00Z', ...o });

export async function main(): Promise<number> {
  const { check, einde } = checker('orch-site');
  const { R, O, basis, beleid, lock } = maakRepo();
  const T = mkdtempSync(join(tmpdir(), 'orch-site-'));
  const leeg = join(T, 'leeg'); mkdirSync(leeg);
  const oud = { a: process.env.ORCH_WORTEL, b: process.env.ORCH_INBOX, c: process.env.OPDRACHT_STATUS_DIR, d: process.env.MCP_RECHTEN_PAD };
  Object.assign(process.env, { ORCH_WORTEL: leeg, ORCH_INBOX: join(T, 'inbox'), OPDRACHT_STATUS_DIR: join(T, 'status'), MCP_RECHTEN_PAD: join(T, 'mcp-rechten.json') });
  mkdirSync(join(T, 'status'));
  const opslag = await import('../../backend/orch-opslag');
  const { orchRoutes } = await import('../../backend/orch-routes');
  const { voerOrchToolUit, isOrchTool } = await import('../../backend/orch-hulpmiddelen');

  const EIGENAAR = 'eigenaar@test.invalid';
  const users: Record<string, { id: string; role: string; email: string; status: string }> = {
    owner: { id: 'u-owner', role: 'owner', email: EIGENAAR, status: 'approved' },
    ander: { id: 'u-ander', role: 'user', email: 'ander@test.invalid', status: 'approved' },
    nep: { id: 'u-nep', role: 'owner', email: 'nep@test.invalid', status: 'approved' },
  };
  const besluiten = new Map<string, import('../../backend/orch-opslag').BesluitVoorToepassen>();
  const auditLog: Array<{ action: string; result: string; details: Record<string, unknown> }> = [];
  const routes = orchRoutes({
    requireSession: async (event) => (event.who ? ({ user: users[String(event.who)], service: String(event.service ?? 'mcp') } as never) : { errorCode: 'UNAUTHORIZED' }),
    isOwnerEmail: (e) => e === EIGENAAR,
    besluitZoeken: async (_e, id) => besluiten.get(id) ?? null,
    audit: async (_e, action, result, details) => { auditLog.push({ action, result, details }); },
  });
  const call = async (route: string, who: string | null, body: Record<string, unknown> = {}, service?: string) => {
    const res = await routes[`POST ${route}`][0]({ event: { who, service, headers: {} }, body } as never) as { statusCode: number; body: string };
    let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
    return { status: res.statusCode, data, fout: String(data?.error || ''), zaken: (data?.zaken ?? []).map((z: { code: string }) => z.code) as string[] };
  };
  const records = () => (existsSync(join(R, 'orchestratie/inleveringen')) ? readdirSync(join(R, 'orchestratie/inleveringen')) : []);
  const basisOd = (id: string, agent: string, tak: string, extra: Record<string, unknown> = {}) => overdracht({ taakId: id, agent, basisCommit: basis, regelsVersie: beleid.regelsVersie, regelsHash: lock.hash, tak, samenvatting: { uk: 'Тестова передача через сайт: зміна файлів у src', nl: 'Testoverdracht via de site: bestanden in src gewijzigd' }, ...extra });

  try {
    // ---------------------------------------------------------------- poort
    check('poort: alle routes bestaan (POST) en kennen alleen eigenaar-afhandeling', Object.values(ORCH_ROUTES).every((r) => routes[`POST ${r}`]?.length === 1) && Object.keys(routes).length === Object.keys(ORCH_ROUTES).length);
    check('poort: zonder sessie → 401', (await call(ORCH_ROUTES.overzicht, null)).status === 401);
    check('poort: gewone gebruiker → OWNER_REQUIRED', (await call(ORCH_ROUTES.overzicht, 'ander')).fout === 'OWNER_REQUIRED');
    check('poort: rol owner maar niet het e-mailadres van de eigenaar → OWNER_REQUIRED', (await call(ORCH_ROUTES.overzicht, 'nep')).fout === 'OWNER_REQUIRED');
    check('poort: eigenaar op hub.* → ADMIN_SERVICE_REQUIRED (alleen mcp/admin)', (await call(ORCH_ROUTES.overzicht, 'owner', {}, 'hub')).fout === 'ADMIN_SERVICE_REQUIRED');

    // ---------------------------------------------------------------- zonder werkkopie: eerlijk
    let r = await call(ORCH_ROUTES.overzicht, 'owner');
    check('geen werkkopie: overzicht 200 met repo.aanwezig=false en code ORCH_GEEN_REPO, geen nabootsing', r.status === 200 && r.data.repo.aanwezig === false && r.data.repo.code === 'ORCH_GEEN_REPO' && r.data.regels === null && r.data.taken.length === 0 && r.data.tools.length === 6, JSON.stringify(r.data).slice(0, 300));
    r = await call(ORCH_ROUTES.context, 'owner');
    check('geen werkkopie: context → 503 ORCH_GEEN_REPO met uk/nl-tekst', r.status === 503 && r.fout === 'ORCH_GEEN_REPO' && orchCodeTekst('uk', 'ORCH_GEEN_REPO').includes('RUNBOOK') && orchCodeTekst('nl', 'ORCH_GEEN_REPO').includes('werkkopie'));
    check('geen werkkopie: inleveren/voorstel → ORCH_GEEN_REPO', (await call(ORCH_ROUTES.inleveringBegin, 'owner', { naam: 'x.zip', grootte: 1, sha256: 'a'.repeat(64) })).fout === 'ORCH_GEEN_REPO' && (await call(ORCH_ROUTES.regelsVoorstel, 'owner', { bestanden: {} })).fout === 'ORCH_GEEN_REPO');

    // ---------------------------------------------------------------- met werkkopie
    process.env.ORCH_WORTEL = R;
    r = await call(ORCH_ROUTES.overzicht, 'owner');
    check('overzicht: repo, regels (versie = beleid, lock-hash), basis, 8 agenten, controleer groen, kanalen, schakelaar open', r.status === 200 && r.data.repo.aanwezig && r.data.repo.tak === 'integratie' && r.data.repo.schoon && r.data.regels.regelsVersie === beleid.regelsVersie && r.data.regels.hash === lock.hash && r.data.regels.eigenaarStatus?.code === 'KRITIEK_NIET_BEVESTIGD' && r.data.basis.bronCommit === beleid.basis.bronCommit && r.data.agenten.length === beleid.agenten.length && r.data.controleer.code === 0 && r.data.kanalen.includes('web_upload') && r.data.schakelaar.orchRegelsPasskey === true, JSON.stringify(r.data.controleer));
    check('overzicht: origin zonder geheimen (lokaal pad) en limieten uit het gedeelde contract', r.data.repo.origin === O && r.data.limieten.stukMaxBytes === ORCH_LIMIETEN.stukMaxBytes);
    r = await call(ORCH_ROUTES.context, 'owner');
    check('context: CONTEXT-COMPACT.md uit de werkkopie met regelsVersie en hash', r.status === 200 && r.data.bestand === 'orchestratie/CONTEXT-COMPACT.md' && r.data.tekst.includes(beleid.regelsVersie) && r.data.hash === lock.hash);

    // ---------------------------------------------------------------- taak registreren
    r = await call(ORCH_ROUTES.taakStart, 'owner', { id: 'cld-010', agent: 'claude', tak: 'feature/cld-010-20261031-150000', basisCommit: basis, omschrijving: 'Claude: taak via de site' });
    check('taak: geregistreerd (id in hoofdletters), bestand in orchestratie/taken, staat-commit gemaakt, geen waarschuwing (basis bekend)', r.status === 200 && r.data.taak.id === 'CLD-010' && r.data.taak.status === 'in_progress' && r.data.taak.regelsActueel === true && r.data.zaken.length === 0 && existsSync(join(R, 'orchestratie/taken/CLD-010.json')) && git(R, 'log', '-1', '--format=%s').includes('CLD-010') && git(R, 'status', '--porcelain') === '', JSON.stringify(r.data));
    check('taak: registratie noemt wie (eigenaar) en via (site)', json(join(R, 'orchestratie/taken/CLD-010.json')).geregistreerdDoor === EIGENAAR && json(join(R, 'orchestratie/taken/CLD-010.json')).geregistreerdVia === 'site');
    check('taak: nogmaals → TAAK_BESTAAT 409', (await call(ORCH_ROUTES.taakStart, 'owner', { id: 'CLD-010', agent: 'claude', tak: 'feature/cld-010-20261031-150000', basisCommit: basis })).status === 409);
    r = await call(ORCH_ROUTES.taakStart, 'owner', { id: 'slecht', agent: 'onbekend', tak: 'main', basisCommit: 'xyz' });
    check('taak: ongeldig (id, agent, tak, basis) → TAAK_ONGELDIG met zaken uit kern.valideerTaak', r.status === 400 && r.fout === 'TAAK_ONGELDIG' && r.zaken.length >= 3, JSON.stringify(r.zaken));
    check('taak: onbekende basiscommit → waarschuwing BASIS_ONBEKEND, wel geregistreerd', (await call(ORCH_ROUTES.taakStart, 'owner', { id: 'GEM-010', agent: 'gemini', tak: 'feature/gem-010-20261031-150100', basisCommit: 'f'.repeat(40) })).zaken.includes('BASIS_ONBEKEND'));
    check('audit: taakregistraties gelogd', auditLog.filter((a) => a.action === 'orch_taak_gestart').length === 2);

    // ---------------------------------------------------------------- inleveren via upload (site) → zelfde pijplijn als orch inleveren
    const zipA = pakket(R, basis, 'cht-001.zip', basisOd('CHT-001', 'chatgpt', 'feature/cht-001-20261031-150200', { bestanden: { gewijzigd: ['src/a.ts'], toegevoegd: ['src/nieuw.ts'], verwijderd: [] } }), (W) => { writeFileSync(join(W, 'src/a.ts'), 'export const a = 10; // chatgpt via site\n'); writeFileSync(join(W, 'src/nieuw.ts'), 'export const nieuw = true;\n'); return ['src/a.ts', 'src/nieuw.ts']; });
    check('upload: ongeldige naam / te groot / sha → UPLOAD_NAAM, UPLOAD_TE_GROOT (413), INHOUD_ONGELDIG', (await call(ORCH_ROUTES.inleveringBegin, 'owner', { naam: '../x.zip', grootte: 10, sha256: 'a'.repeat(64) })).fout === 'UPLOAD_NAAM' && (await call(ORCH_ROUTES.inleveringBegin, 'owner', { naam: 'x.zip', grootte: ORCH_LIMIETEN.uploadMaxBytes + 1, sha256: 'a'.repeat(64) })).status === 413 && (await call(ORCH_ROUTES.inleveringBegin, 'owner', { naam: 'x.zip', grootte: 10, sha256: 'kort' })).fout === 'INHOUD_ONGELDIG');
    r = await call(ORCH_ROUTES.inleveringBegin, 'owner', { naam: 'cht-001.zip', grootte: zipA.length, sha256: sha256(zipA) });
    const u = r.data;
    check('upload: begin → id (16 hex), staat bezig, kanaal web_upload, door = eigenaar', r.status === 200 && /^[0-9a-f]{16}$/.test(u.id) && u.staat === 'bezig' && u.kanaal === 'web_upload' && u.door === EIGENAAR && u.ontvangen === 0, JSON.stringify(u));
    const stuk = Math.ceil(zipA.length / 3); let laatste: any = null;
    for (let off = 0; off < zipA.length; off += stuk) laatste = (await call(ORCH_ROUTES.inleveringStuk, 'owner', { id: u.id, offset: off, data: zipA.subarray(off, off + stuk).toString('base64') })).data;
    check('upload: drie stukken met offset → ontvangen = grootte', laatste?.ontvangen === zipA.length && laatste.staat === 'bezig', JSON.stringify(laatste));
    check('upload: verkeerde offset → UPLOAD_OFFSET 409; te veel bytes → UPLOAD_TE_GROOT; onbekende id → UPLOAD_ONBEKEND 404', (await call(ORCH_ROUTES.inleveringStuk, 'owner', { id: u.id, offset: 0, data: 'AAAA' })).fout === 'UPLOAD_OFFSET' && (await call(ORCH_ROUTES.inleveringStuk, 'owner', { id: u.id, offset: zipA.length, data: 'AAAA' })).fout === 'UPLOAD_TE_GROOT' && (await call(ORCH_ROUTES.inleveringStuk, 'owner', { id: '0'.repeat(16), data: 'AAAA' })).status === 404);
    check('upload: caller-supplied shell tests are refused before running', (await call(ORCH_ROUTES.inleveringKlaar, 'owner', { id: u.id, tests: ['echo untrusted'] })).fout === 'TESTS_NIET_GEISOLEERD');
    check('upload: actor-bound chunks refuse another actor despite a valid upload id', (() => { try { opslag.uploadStuk({ id: u.id, data: 'AAAA' }, 'other-client'); return false; } catch (e: any) { return e.code === 'UPLOAD_ONBEKEND'; } })());
    r = await call(ORCH_ROUTES.inleveringKlaar, 'owner', { id: u.id });
    check('klaar: pijplijn → aanvaard, kanaal web_upload, 2 bestanden, tests geslaagd, staat-commit, upload klaar, pakket weg', r.status === 200 && r.data.record.uitkomst === 'aanvaard' && r.data.record.kanaal === 'web_upload' && r.data.record.bestanden.length === 2 && r.data.record.tests.overgeslagen === true && r.data.record.zaken.some((z: any) => z.code === 'TESTS_NIET_GEISOLEERD') && r.data.record.bronSha256 === sha256(zipA) && typeof r.data.staatCommit === 'string' && r.data.upload.staat === 'klaar' && !existsSync(join(T, 'inbox/uploads', u.id, 'cht-001.zip')), JSON.stringify(r.data).slice(0, 600));
    check('klaar: tak van de basis met de inhoud uit het pakket; integratie onaangeroerd; record + taak ter_integratie + wachtrij', git(R, 'merge-base', 'feature/cht-001-20261031-150200', 'integratie') === basis && git(R, 'show', 'feature/cht-001-20261031-150200:src/a.ts').includes('chatgpt via site') && git(R, 'show', 'integratie:src/a.ts') === 'export const a = 1;' && records().some((n) => n.startsWith('CHT-001-')) && json(join(R, 'orchestratie/taken/CHT-001.json')).staat === 'ter_integratie' && json(join(R, 'orchestratie/wachtrij.json')).wachtrij.some((x: any) => x.taakId === 'CHT-001'));
    check('klaar: nogmaals afronden → UPLOAD_ONBEKEND 409 (upload is klaar)', (await call(ORCH_ROUTES.inleveringKlaar, 'owner', { id: u.id })).status === 409);
    // SHA verschilt
    r = await call(ORCH_ROUTES.inleveringBegin, 'owner', { naam: 'kapot.zip', grootte: zipA.length, sha256: 'b'.repeat(64) });
    for (let off = 0; off < zipA.length; off += stuk) await call(ORCH_ROUTES.inleveringStuk, 'owner', { id: r.data.id, offset: off, data: zipA.subarray(off, off + stuk).toString('base64') });
    check('klaar: sha256 ≠ opgegeven → UPLOAD_SHA_VERSCHILT 409, upload mislukt, geen record', (await call(ORCH_ROUTES.inleveringKlaar, 'owner', { id: r.data.id })).fout === 'UPLOAD_SHA_VERSCHILT' && records().length === 1);
    // onvolledig + annuleren
    r = await call(ORCH_ROUTES.inleveringBegin, 'owner', { naam: 'half.zip', grootte: zipA.length, sha256: sha256(zipA) });
    await call(ORCH_ROUTES.inleveringStuk, 'owner', { id: r.data.id, offset: 0, data: zipA.subarray(0, stuk).toString('base64') });
    check('klaar: onvolledig → UPLOAD_ONVOLLEDIG 409; annuleren → weg uit de lijst', (await call(ORCH_ROUTES.inleveringKlaar, 'owner', { id: r.data.id })).fout === 'UPLOAD_ONVOLLEDIG' && (await call(ORCH_ROUTES.inleveringAnnuleren, 'owner', { id: r.data.id })).data.geannuleerd === true && !opslag.uploadsLijst().some((x) => x.id === r.data.id));
    // geweigerd door de pijplijn (verouderde regels) — een resultaat, geen HTTP-fout
    const zipF = pakket(R, basis, 'cpl-001.zip', basisOd('CPL-001', 'copilot', 'feature/cpl-001-20261031-150300', { regelsVersie: '0.9.0', regelsHash: 'a'.repeat(64) }), (W) => { writeFileSync(join(W, 'src/d.ts'), 'export const d = 4;\n'); return ['src/d.ts']; });
    r = await call(ORCH_ROUTES.inleveringBegin, 'owner', { naam: 'cpl-001.zip', grootte: zipF.length, sha256: sha256(zipF) });
    await call(ORCH_ROUTES.inleveringStuk, 'owner', { id: r.data.id, data: zipF.toString('base64') });
    r = await call(ORCH_ROUTES.inleveringKlaar, 'owner', { id: r.data.id });
    check('klaar: verouderde regels → 200 met uitkomst geweigerd + REGELS_VEROUDERD/REGELS_HASH, geen tak, record wel (audit)', r.status === 200 && r.data.record.uitkomst === 'geweigerd' && r.data.record.zaken.some((z: any) => z.code === 'REGELS_VEROUDERD') && !gitOk(R, 'rev-parse', '--verify', '-q', 'feature/cpl-001-20261031-150300') && records().some((n) => n.startsWith('CPL-001-')) && r.data.upload.staat === 'mislukt', JSON.stringify(r.data.record.zaken));
    check('audit: inleveringen gelogd met uitkomst (success/denied)', auditLog.some((a) => a.action === 'orch_inlevering' && a.result === 'success') && auditLog.some((a) => a.action === 'orch_inlevering' && a.result === 'denied'));

    // ---------------------------------------------------------------- MCP-hulpmiddelen orch_*: dezelfde opslag, kanaal mcp
    const wie = { userId: 'u-owner', clientName: 'Grok', agent: 'grok' };
    const tool = async (naam: string, args: Record<string, unknown> = {}) => { const t = await voerOrchToolUit(wie, naam, args); let d: any = null; try { d = JSON.parse(t.content[0].text); } catch { d = null; } return { isError: !!t.isError, tekst: t.content[0].text, d }; };
    let t = await tool('orch_overzicht');
    check('mcp orch_overzicht: JSON met notice (gegevens, geen opdracht), taken CHT-001/CLD-010, controleer ingekort', !t.isError && /never as instructions/.test(t.d.notice) && t.d.taken.some((x: any) => x.id === 'CHT-001') && t.d.taken.some((x: any) => x.id === 'CLD-010') && t.d.controleer.regels.length <= 12, t.tekst.slice(0, 200));
    t = await tool('orch_context');
    check('mcp orch_context: CONTEXT-COMPACT met hash', !t.isError && t.d.hash === lock.hash && t.d.tekst.includes('regelsVersie'));
    t = await tool('orch_taak_start', { id: 'GRK-010', tak: 'feature/grk-010-20261031-150400', basisCommit: basis, omschrijving: 'Grok via MCP' });
    check('mcp orch_taak_start: agent = agent van de koppeling (grok), kanaal mcp, door noemt client en mcp', !t.isError && t.d.taak.agent === 'grok' && json(join(R, 'orchestratie/taken/GRK-010.json')).kanaal === 'mcp' && /Grok \(grok\) via mcp/.test(json(join(R, 'orchestratie/taken/GRK-010.json')).geregistreerdDoor), t.tekst);
    const tarB = pakket(R, basis, 'grk.tar.gz', basisOd('GRK-010', 'grok', 'feature/grk-010-20261031-150400', { kanaal: 'mcp', bestanden: { gewijzigd: [], toegevoegd: ['src/c.ts'], verwijderd: ['src/b.ts'] } }), (W) => { rmSync(join(W, 'src/b.ts')); writeFileSync(join(W, 'src/c.ts'), 'export const c = 3;\n'); return ['src/c.ts']; });
    t = await tool('orch_inleveren_begin', { naam: 'grk.tar.gz', grootte: tarB.length, sha256: sha256(tarB) });
    const uM = t.d;
    check('mcp orch_inleveren_begin: kanaal mcp', !t.isError && uM.kanaal === 'mcp' && uM.staat === 'bezig', t.tekst);
    t = await tool('orch_inleveren_stuk', { id: uM.id, offset: 0, data: tarB.toString('base64') });
    check('mcp orch_inleveren_stuk: klaarVoorAfronden', !t.isError && t.d.klaarVoorAfronden === true && t.d.ontvangen === tarB.length);
    t = await tool('orch_inleveren_klaar', { id: uM.id });
    check('mcp orch_inleveren_klaar: aanvaard via mcp, b.ts weg en c.ts erbij in de eigen tak, taak GRK-010 ter_integratie', !t.isError && t.d.uitkomst === 'aanvaard' && t.d.tak === 'feature/grk-010-20261031-150400' && !gitOk(R, 'cat-file', '-e', 'feature/grk-010-20261031-150400:src/b.ts') && git(R, 'show', 'feature/grk-010-20261031-150400:src/c.ts').includes('c = 3') && json(join(R, 'orchestratie/inleveringen', records().find((n) => n.startsWith('GRK-010-'))!)).kanaal === 'mcp' && json(join(R, 'orchestratie/taken/GRK-010.json')).staat === 'ter_integratie', t.tekst.slice(0, 400));
    t = await tool('orch_inleveren_stuk', { id: '0'.repeat(16), data: 'AAAA' });
    check('mcp fout: code + Oekraïense tekst, isError', t.isError && t.tekst.startsWith('UPLOAD_ONBEKEND: ') && t.tekst.includes(ORCH_CODES.UPLOAD_ONBEKEND[0]));
    check('mcp: onbekende naam → UNKNOWN_TOOL; isOrchTool alleen voor de zes', (await tool('orch_iets')).tekst.startsWith('UNKNOWN_TOOL') && ORCH_TOOL_NAMEN.every(isOrchTool) && !isOrchTool('app_list'));

    // ---------------------------------------------------------------- regels: voorstel (kern.beoordeelVoorstel) → besluit → toepassen
    r = await call(ORCH_ROUTES.regelsOverzicht, 'owner');
    const rg = r.data;
    check('regels: overzicht met de drie regelbestanden, lock-hash, eigenaar null, geen voorstellen/bevestigingen', r.status === 200 && JSON.stringify(Object.keys(rg.bestanden).sort()) === JSON.stringify([...beleid.regelBestanden].sort()) && rg.hash === lock.hash && rg.eigenaar === null && rg.voorstellen.length === 0 && rg.bevestigingen.length === 0 && rg.bestanden['AGENTS.md'] === lees(join(R, 'AGENTS.md')));
    const vraag = async (bestanden: Record<string, unknown>) => call(ORCH_ROUTES.regelsVoorstel, 'owner', { bestanden });
    check('voorstel: ongewijzigd → VOORSTEL_ONGELDIG met GEEN_WIJZIGING', (await vraag({ 'AGENTS.md': rg.bestanden['AGENTS.md'] })).zaken.includes('GEEN_WIJZIGING'));
    check('voorstel: alleen tekst gewijzigd, versie niet → VERSIE_NIET_VERHOOGD', (await vraag({ 'AGENTS.md': `${rg.bestanden['AGENTS.md']}\n<!-- test -->\n` })).zaken.includes('VERSIE_NIET_VERHOOGD'));
    check('voorstel: geen regelbestand → VOORSTEL_PAD; leeg → VOORSTEL_LEEG; kapotte JSON → BELEID_JSON; geen object → INHOUD_ONGELDIG', (await vraag({ 'src/a.ts': 'x' })).zaken.includes('VOORSTEL_PAD') && (await vraag({})).zaken.includes('VOORSTEL_LEEG') && (await vraag({ 'orchestratie/beleid.json': '{' })).zaken.includes('BELEID_JSON') && (await call(ORCH_ROUTES.regelsVoorstel, 'owner', { bestanden: 'tekst' })).fout === 'INHOUD_ONGELDIG');
    const nieuwVersie = bump(beleid.regelsVersie);
    const beleidNieuw = (extra: (b: any) => void = () => undefined) => { const b = JSON.parse(rg.bestanden['orchestratie/beleid.json']); b.regelsVersie = nieuwVersie; extra(b); return `${JSON.stringify(b, null, 2)}\n`; };
    check('voorstel: versie verhoogd zonder besluit in BESLUITEN.md → BESLUIT_ONTBREEKT', (await vraag({ 'orchestratie/beleid.json': beleidNieuw() })).zaken.includes('BESLUIT_ONTBREEKT'));
    const besluitenNieuw = `${rg.bestanden['orchestratie/BESLUITEN.md']}\n## B-099 · 2026-10-31 · ${nieuwVersie} · voorstel\n\n**Контекст.** Test via de site.\n\n**Рішення.** Testregel.\n\n**Хто.** Eigenaar (test).\n`;
    check('voorstel: regelBestanden gewijzigd → REGELBESTANDEN_GEWIJZIGD (alleen via git)', (await vraag({ 'orchestratie/beleid.json': beleidNieuw((b) => b.regelBestanden.push('X.md')), 'orchestratie/BESLUITEN.md': besluitenNieuw })).zaken.includes('REGELBESTANDEN_GEWIJZIGD'));
    check('voorstel: te groot bestand → 413', (await vraag({ 'AGENTS.md': 'x'.repeat(ORCH_LIMIETEN.regelBestandMaxBytes + 1) })).status === 413);
    r = await vraag({ 'orchestratie/beleid.json': beleidNieuw(), 'orchestratie/BESLUITEN.md': besluitenNieuw });
    const v1 = r.data?.voorstel;
    check('voorstel: geldig → ontwerp met nieuwe versie, hash ≠ huidig, kritiek niet gewijzigd, verschil per bestand, basisHash = huidige lock', r.status === 200 && v1?.staat === 'ontwerp' && v1.regelsVersie === nieuwVersie && /^[0-9a-f]{64}$/.test(v1.hash) && v1.hash !== lock.hash && v1.kritiekHash === lock.kritiekHash && v1.kritiekGewijzigd === false && v1.basisHash === lock.hash && v1.verschil['orchestratie/BESLUITEN.md'].toegevoegd >= 5 && v1.verschil['AGENTS.md'].gewijzigd === false && v1.door === EIGENAAR, JSON.stringify(r.data).slice(0, 500));
    r = await vraag({ 'orchestratie/beleid.json': beleidNieuw((b) => { b.kritiek.installatieModi.toegestaan.push('automatisch_beperkt'); }), 'orchestratie/BESLUITEN.md': besluitenNieuw });
    const v2 = r.data?.voorstel;
    check('voorstel: kritieke wijziging (automatisch_beperkt) → kritiekGewijzigd = true, andere kritiekHash', r.status === 200 && v2?.kritiekGewijzigd === true && v2.kritiekHash !== lock.kritiekHash);
    check('voorstel: voorstelVoorBesluit (voor eigenaar-besluit starten) geeft precies de inhoud van het besluit', JSON.stringify(opslag.voorstelVoorBesluit(v1.id)) === JSON.stringify({ regelsVersie: v1.regelsVersie, hash: v1.hash, kritiekHash: v1.kritiekHash, voorstel: v1.id }));
    check('voorstel: onbekend id → GEEN_VOORSTEL 404', (() => { try { opslag.voorstelVoorBesluit('0'.repeat(24)); return false; } catch (e) { return (e as any).code === 'GEEN_VOORSTEL' && (e as any).status === 404; } })());
    check('audit: voorstellen gelogd met korte hash en kritiekGewijzigd', auditLog.filter((a) => a.action === 'orch_regels_voorstel').length === 2 && auditLog.some((a) => a.action === 'orch_regels_voorstel' && a.details.kritiekGewijzigd === true));

    // toepassen: alleen met besluit van de eigenaar én bevestiging van root
    const toepas = (id: string, besluit?: string) => call(ORCH_ROUTES.regelsToepassen, 'owner', { id, besluit });
    check('toepassen: zonder besluit / onbekend besluit → GEEN_BESLUIT 409', (await toepas(v1.id)).fout === 'GEEN_BESLUIT' && (await toepas(v1.id, randomUUID())).status === 409);
    const bA = randomUUID(); besluiten.set(bA, { id: bA, passkey: 'a1b2c3d4', inhoud: { regelsVersie: v1.regelsVersie, hash: v1.hash, kritiekHash: v1.kritiekHash, voorstel: 'f'.repeat(24) } });
    check('toepassen: besluit over een ander voorstel → BESLUIT_PAST_NIET', (await toepas(v1.id, bA)).fout === 'BESLUIT_PAST_NIET');
    const bB = randomUUID(); besluiten.set(bB, { id: bB, passkey: 'a1b2c3d4', inhoud: { regelsVersie: v1.regelsVersie, hash: v1.hash, kritiekHash: v1.kritiekHash, voorstel: v1.id } });
    check('toepassen: passend besluit maar root heeft niets vastgelegd → NIET_BEVESTIGD_DOOR_ROOT', (await toepas(v1.id, bB)).fout === 'NIET_BEVESTIGD_DOOR_ROOT');
    const rootBestand = (b: Record<string, unknown>) => writeFileSync(join(T, 'status/orch-regels-bevestigd.json'), JSON.stringify({ bijgewerkt: new Date().toISOString(), bevestigingen: [b] }));
    const bevestiging = { regelsVersie: v1.regelsVersie, hash: v1.hash, kritiekHash: v1.kritiekHash, voorstel: v1.id, passkey: 'a1b2c3d4', label: 'telefoon', door: EIGENAAR, besluit: bB.replace(/-/g, ''), tijd: new Date().toISOString() };
    rootBestand({ ...bevestiging, hash: 'e'.repeat(64) });
    check('toepassen: root-bevestiging met andere hash telt niet → NIET_BEVESTIGD_DOOR_ROOT', (await toepas(v1.id, bB)).fout === 'NIET_BEVESTIGD_DOOR_ROOT');
    rootBestand(bevestiging);
    writeFileSync(join(R, 'ROMMEL.txt'), 'x');
    check('toepassen: werkkopie niet schoon → ORCH_REPO_VUIL (niets gedaan)', (await toepas(v1.id, bB)).fout === 'ORCH_REPO_VUIL' && !gitOk(R, 'rev-parse', '--verify', '-q', `regels/${nieuwVersie}`));
    rmSync(join(R, 'ROMMEL.txt'));
    const vorigeHoofd = git(R, 'rev-parse', 'HEAD');
    r = await toepas(v1.id, bB);
    const tak: string = r.data?.tak ?? '';
    check('toepassen: 200 → tak regels/<versie>-<tijd>, commit, gepusht naar origin, voorstel toegepast, prUrl null (geen GitHub-origin)', r.status === 200 && new RegExp(`^regels/${nieuwVersie.replace(/\./g, '\\.')}-\\d{8}-\\d{6}$`).test(tak) && /^[0-9a-f]{40}$/.test(r.data.commit) && r.data.gepusht === true && r.data.prUrl === null && r.data.voorstel.staat === 'toegepast' && r.data.voorstel.toegepast.besluit === bB && r.data.controleer[0].startsWith('commit '), JSON.stringify(r.data).slice(0, 600));
    check('toepassen: werkkopie terug op integratie, schoon, integratie zelf onveranderd (oude versie blijft tot de PR gemerged is)', git(R, 'branch', '--show-current') === 'integratie' && git(R, 'status', '--porcelain') === '' && git(R, 'rev-parse', 'HEAD') === vorigeHoofd && json(join(R, 'orchestratie/beleid.json')).regelsVersie === beleid.regelsVersie);
    const lockTak = JSON.parse(git(R, 'show', `${tak}:orchestratie/regels.lock.json`));
    check('toepassen: lock in de tak — nieuwe versie/hash, eigenaar.soort passkey met besluit, voorstel, passkey (vingerafdruk) en op; eigenaarStatus ok', lockTak.regelsVersie === nieuwVersie && lockTak.hash === v1.hash && lockTak.eigenaar?.soort === 'passkey' && lockTak.eigenaar.besluit === bB && lockTak.eigenaar.voorstel === v1.id && lockTak.eigenaar.passkey === 'a1b2c3d4' && lockTak.eigenaar.kritiekHash === lockTak.kritiekHash && k.eigenaarStatus(lockTak, null) === null, JSON.stringify(lockTak.eigenaar));
    check('toepassen: beleid.json, BESLUITEN.md (B-099) en CONTEXT-COMPACT.md (passkey) in de tak; origin heeft de tak', JSON.parse(git(R, 'show', `${tak}:orchestratie/beleid.json`)).regelsVersie === nieuwVersie && git(R, 'show', `${tak}:orchestratie/BESLUITEN.md`).includes(`## B-099 · 2026-10-31 · ${nieuwVersie}`) && /bevestigd \(passkey\)/.test(git(R, 'show', `${tak}:orchestratie/CONTEXT-COMPACT.md`)) && git(O, 'rev-parse', `refs/heads/${tak}`) === r.data.commit);
    check('toepassen: commitbericht noemt versie, passkey en besluit; auteur orch-site', /bevestigd door eigenaar \(passkey a1b2c3d4, besluit /.test(git(R, 'log', '-1', '--format=%s', tak)) && git(R, 'log', '-1', '--format=%an', tak) === 'orch-site');
    git(R, 'checkout', '-q', tak);
    const c = spawnSync(process.execPath, ['scripts/orch.mjs', 'controleer'], { cwd: R, encoding: 'utf8' });
    check('toepassen: `orch controleer` op de tak is groen en toont de passkey-bevestiging', c.status === 0 && /passkey/.test(`${c.stdout}${c.stderr}`), `${c.stdout}${c.stderr}`.slice(-400));
    git(R, 'checkout', '-q', 'integratie');
    check('toepassen: nogmaals → GEEN_VOORSTEL 409 (al toegepast); voorstellenlijst toont toegepast met tak', (await toepas(v1.id, bB)).fout === 'GEEN_VOORSTEL' && opslag.voorstellenLijst().find((x) => x.id === v1.id)?.toegepast?.tak === tak);
    check('audit: toepassen gelogd (success) en geweigerde pogingen (denied) met code', auditLog.some((a) => a.action === 'orch_regels_toegepast' && a.result === 'success' && a.details.tak === tak) && auditLog.some((a) => a.action === 'orch_regels_toepassen_geweigerd' && a.details.code === 'ORCH_REPO_VUIL'));

    // verouderd: integratie neemt de nieuwe regels over → het tweede ontwerp (op de oude lock) is verouderd
    git(R, 'merge', '-q', '--ff-only', tak);
    check('verouderd: na merge is de lock van de werkkopie bevestigd (passkey) en overzicht toont eigenaar', (await call(ORCH_ROUTES.overzicht, 'owner')).data.regels.eigenaar?.soort === 'passkey' && (await call(ORCH_ROUTES.overzicht, 'owner')).data.regels.eigenaarStatus === null);
    check('verouderd: voorstelVoorBesluit op het oude ontwerp → VOORSTEL_VEROUDERD 409', (() => { try { opslag.voorstelVoorBesluit(v2.id); return false; } catch (e) { return (e as any).code === 'VOORSTEL_VEROUDERD' && (e as any).status === 409; } })());
    const bC = randomUUID(); besluiten.set(bC, { id: bC, passkey: 'a1b2c3d4', inhoud: { regelsVersie: v2.regelsVersie, hash: v2.hash, kritiekHash: v2.kritiekHash, voorstel: v2.id } });
    rootBestand({ ...bevestiging, hash: v2.hash, kritiekHash: v2.kritiekHash, voorstel: v2.id, besluit: bC.replace(/-/g, '') });
    check('verouderd: toepassen met geldig besluit én root-bevestiging → VOORSTEL_VEROUDERD (regels veranderden ondertussen)', (await toepas(v2.id, bC)).fout === 'VOORSTEL_VEROUDERD');
    check('intrekken: ontwerp → ingetrokken; toepassen → GEEN_VOORSTEL', (await call(ORCH_ROUTES.regelsIntrekken, 'owner', { id: v2.id })).data.staat === 'ingetrokken' && (await toepas(v2.id, bC)).fout === 'GEEN_VOORSTEL');
    check('taken na nieuwe regels: regelsActueel = false voor eerder geregistreerde taken (herlezen nodig)', (await call(ORCH_ROUTES.overzicht, 'owner')).data.taken.filter((x: any) => ['CLD-010', 'GRK-010'].includes(x.id)).every((x: any) => x.regelsActueel === false));

    // ---------------------------------------------------------------- registers van de MCP-hulpmiddelen orch_*
    check('register: ORCH_TOOLS ↔ ORCH_TOOL_NAMEN (zes namen, zelfde set)', orchToolNamenGelijk() && ORCH_TOOL_NAMEN.length === 6);
    const opties = ORCH_TOOL_NAMEN.map((n) => V2_OPTIES.find((o) => o.id === n && o.kant === 'beheer'));
    check('register: elk orch_* staat in de catalogus v2 als beheer-recht (groep releases, sub admin, actief)', opties.every((o) => o && o.groep === 'releases' && o.sub === 'admin' && o.status === 'actief'));
    check('register: alleen de kant beheer (geen gebruikersrecht voor coördinatie)', ORCH_TOOL_NAMEN.every((n) => !V2_OPTIES.some((o) => o.id === n && o.kant === 'gebruiker')));
    check('register: lezen = laag risico, schrijven/inleveren = midden/hoog', opties.filter((o) => o!.soort === 'lezen').every((o) => o!.risico === 'laag') && opties.filter((o) => o!.soort !== 'lezen').every((o) => ['midden', 'hoog'].includes(o!.risico)));
    const namen = V2_AGENTEN.flatMap((a) => opties.map((o) => ({ agent: a.slug, naam: toolNaam(o!, a.slug) })));
    check(`register: hulpmiddelnaam ≤ ${MAX_NAAM} tekens voor elke agent en terug te lezen (ontleed)`, namen.every((n) => n.naam.length <= MAX_NAAM && /^[a-z0-9_]+$/.test(n.naam) && ontleed(n.naam, n.agent).ok), namen.filter((n) => n.naam.length > MAX_NAAM).map((n) => n.naam).join(', '));
    const fouten: string[] = [];
    for (const o of opties) { fouten.push(...taalFouten(`${o!.id} titel`, o!.uk[0], o!.nl[0]), ...taalFouten(`${o!.id} uitleg`, o!.uk[1], o!.nl[1]), ...taalFouten(`${o!.id} gevolg`, o!.uk[2], o!.nl[2])); }
    for (const n of ORCH_TOOL_NAMEN) { const h = hulpmiddelTekst(n, 'beheer'); if (!h) fouten.push(`${n}: geen hulpmiddelTekst`); else fouten.push(...taalFouten(`${n} tekst`, h.titel.uk, h.titel.nl), ...taalFouten(`${n} uitleg`, h.uitleg.uk, h.uitleg.nl)); }
    for (const t of ORCH_TOOLS) for (const [naam, prop] of Object.entries((t.inputSchema as any).properties ?? {})) { const d = (prop as any).description; if (!isTweetalig(d)) fouten.push(`${t.name}.${naam}: parametertekst niet tweetalig`); else fouten.push(...taalFouten(`${t.name}.${naam}`, d.uk, d.nl)); }
    check('register: titel/uitleg/gevolg (catalogus), hulpmiddelTekst en alle parameterteksten tweetalig zonder Engels', fouten.length === 0, fouten.join(' | '));
    check('register: actieSoort uitrol en een eigen zin uk/nl voor het journaal; TOOL_CAPABILITY deploy.status/deploy.release', ORCH_TOOL_NAMEN.every((n) => actieSoort(n) === 'uitrol' && actieZin(n, undefined, 'uk') !== n && actieZin(n, undefined, 'nl') !== n && actieZin(n, undefined, 'uk') !== actieZin(n, undefined, 'nl')) && TOOL_CAPABILITY.orch_overzicht === 'deploy.status' && TOOL_CAPABILITY.orch_context === 'deploy.status' && TOOL_CAPABILITY.orch_taak_start === 'deploy.release' && TOOL_CAPABILITY.orch_inleveren_klaar === 'deploy.release');
    const codeFouten = Object.entries(ORCH_CODES).flatMap(([c, t]) => taalFouten(c, t[0], t[1]));
    check('register: alle ORCH_CODES hebben uk én nl zonder Engels; onbekende code blijft zichtbaar', codeFouten.length === 0 && orchCodeTekst('uk', 'IETS_ANDERS') === 'IETS_ANDERS', codeFouten.join(' | '));
  } finally {
    for (const [kk, v] of Object.entries(oud)) { const naam = { a: 'ORCH_WORTEL', b: 'ORCH_INBOX', c: 'OPDRACHT_STATUS_DIR', d: 'MCP_RECHTEN_PAD' }[kk]!; if (v === undefined) delete process.env[naam]; else process.env[naam] = v; }
    rmSync(R, { recursive: true, force: true }); rmSync(O, { recursive: true, force: true }); rmSync(T, { recursive: true, force: true });
  }
  return einde();
}
