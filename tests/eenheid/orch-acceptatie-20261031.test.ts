// ORCH-001 етап 4: приймальні тести — наскрізні сценарії з ТЗ на СПРАВЖНЬОМУ git-репозиторії через CLI (scripts/orch.mjs), справжньому
// root-інсталяторі (deploy/uitrol/mijn-ruimte-uitrol.sh під uid 65534) і справжньому root-скрипті рішень (deploy/besluit/mijn-ruimte-besluit.sh):
//   1 паралельні агенти (різні файли, одна черга, нічого не губиться)      5 зміна політики (REGELS_VEROUDERD → taak-herlees → прийнято)
//   2 конфлікти git при здачі й при злитті, відновлення після rebase       6 «заморожений» агент (bevroren, terugtrekken, відновлення)
//   3 застарілий випуск (orch pakket → root: OK, потім BASIS_VEROUDERD)    7 одночасні установки (flock: друга чекає, нічого не перемішується)
//   4 імпорт архіву від агента без git (CONTEXT-COMPACT + zip)             8 відкат (passkey-рішення → інсталятор → статус знову released)
// Перевіряється вміст (файли в integratie, записи, статуси), не метадані. Acceptatietests ORCH-001 etappe 4 — echte repo's, echte root-scripts.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { manifestVoor } from '../fixtures/uitrol/manifest-voorbeeld';
import { ALS_ROOT, HEEFT_SETPRIV, ORIGIN_ADMIN, RP, alsTest, besluitBestand, omgeving, sleutelUit } from './besluit-root-20261022.test';
import { checker } from './hulp/nep-google';
import { nieuwePasskey } from './hulp/nep-toegangssleutel';

const UITROL = 'deploy/uitrol/mijn-ruimte-uitrol.sh';
const CONTROLEER = 'node scripts/orch.mjs controleer';
const sh = (cwd: string, cmd: string, args: string[]) => { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}${r.stdout}`); return r.stdout.trim(); };
const git = (cwd: string, ...a: string[]) => sh(cwd, 'git', a);
const gitOk = (cwd: string, ...a: string[]) => spawnSync('git', a, { cwd, encoding: 'utf8' }).status === 0;
const orch = (cwd: string, ...a: string[]) => { const r = spawnSync(process.execPath, [join(cwd, 'scripts/orch.mjs'), ...a], { cwd, encoding: 'utf8' }); return { code: r.status ?? -1, uit: `${r.stdout}${r.stderr}` }; };
const lees = (p: string) => readFileSync(p, 'utf8');
const json = (p: string) => JSON.parse(lees(p));
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Репозиторій-«integratie» з правилами, lock, контекстом, maak-voorstelpakket.sh і фактом установки (geinstalleerd = перший commit). */
function maakRepo() {
  const R = mkdtempSync(join(tmpdir(), 'orch-acc-'));
  for (const p of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'ANTIGRAVITY.md', 'CHATGPT.md', 'CODEX.md', 'GROK.md', '.cursorrules', 'scripts/orch.mjs', 'scripts/orch', 'orchestratie/beleid.json', 'orchestratie/BESLUITEN.md', 'orchestratie/eigenaar-ondertekenaars', 'orchestratie/sjablonen', 'deploy/uitrol/maak-voorstelpakket.sh']) cpSync(p, join(R, p), { recursive: true });
  cpSync('.github/copilot-instructions.md', join(R, '.github/copilot-instructions.md'));
  writeFileSync(join(R, 'deploy/installeer-app.sh'), '#!/bin/bash\necho stub\n');
  mkdirSync(join(R, 'src')); writeFileSync(join(R, 'src/a.ts'), 'export const a = 1;\n'); writeFileSync(join(R, 'src/b.ts'), 'export const b = 2;\n');
  writeFileSync(join(R, 'orchestratie/wachtrij.json'), JSON.stringify({ schema: 1, integratieTak: 'integratie', integratieHoofd: null, bezig: null, wachtrij: [] }, null, 2));
  git(R, 'init', '-q', '-b', 'integratie'); git(R, 'config', 'user.email', 'eigenaar@test'); git(R, 'config', 'user.name', 'eigenaar');
  orch(R, 'vergrendel'); orch(R, 'context'); git(R, 'add', '-A'); git(R, 'commit', '-q', '-m', 'basis');
  const basis0 = git(R, 'rev-parse', 'HEAD');
  writeFileSync(join(R, 'orchestratie/geinstalleerd.json'), JSON.stringify({ schema: 1, versie: '20261031-093842', bronCommit: basis0, bron: 'eigenaar', op: '2026-10-31T10:00:00Z' }, null, 2));
  git(R, 'add', '-A'); git(R, 'commit', '-q', '-m', 'geinstalleerd');
  return { R, basis0, basis: git(R, 'rev-parse', 'HEAD') };
}
/** Робоча тека агента БЕЗ git: export бази (git archive) — так працюють ChatGPT/Grok без репозиторію. */
function agentWerk(R: string, ref: string): string { const W = mkdtempSync(join(tmpdir(), 'orch-acc-agent-')); sh(R, 'sh', ['-c', `git -C "${R}" archive ${ref} | tar -x -C "${W}"`]); return W; }
const lockVan = (R: string) => json(join(R, 'orchestratie/regels.lock.json'));
const od = (R: string, o: Record<string, unknown>) => { const l = lockVan(R); return { schema: 1, agentPlatform: 'acceptatietest', model: { id: null, versie: null, bron: 'onbekend' }, kanaal: 'zip', zonderGit: 'агент без git (приймальний тест)', commits: [], tests: { geslaagd: 1, mislukt: 0 }, nietGedaan: { uk: '—', nl: '—' }, conflicten: [], aangemaakt: '2026-10-31T16:00:00Z', regelsVersie: l.regelsVersie, regelsHash: l.hash, samenvatting: { uk: 'Приймальний тест ORCH-001 етап 4: зміна файлів у власній гілці агента', nl: 'Acceptatietest ORCH-001 etappe 4: bestanden gewijzigd in de eigen tak' }, ...o }; };
const zipVan = (W: string, bestanden: string[], naam: string) => { const z = join(W, naam); sh(W, 'zip', ['-q', z, ...bestanden]); return z; };
const records = (R: string) => (existsSync(join(R, 'orchestratie/inleveringen')) ? readdirSync(join(R, 'orchestratie/inleveringen')) : []);
const taak = (R: string, id: string) => json(join(R, 'orchestratie/taken', `${id}.json`));
const wachtrij = (R: string) => json(join(R, 'orchestratie/wachtrij.json'));
const bestaat = (R: string, ref: string, pad: string) => gitOk(R, 'cat-file', '-e', `${ref}:${pad}`);
const toon = (R: string, ref: string, pad: string) => (bestaat(R, ref, pad) ? git(R, 'show', `${ref}:${pad}`) : null);

/** Що робить людина/агент після «wachtrij volgende»: злиття --no-ff без force; конфлікт → abort + klaar afgewezen. */
function integreer(R: string, taakId: string, tak: string) {
  orch(R, 'staat-commit');
  const v = orch(R, 'wachtrij', 'volgende');
  git(R, 'checkout', '-q', 'integratie');
  const voor = git(R, 'rev-parse', 'HEAD');
  const m = spawnSync('git', ['merge', '--no-ff', '-m', `integratie: ${taakId}`, tak], { cwd: R, encoding: 'utf8' });
  if (m.status !== 0) {
    spawnSync('git', ['merge', '--abort'], { cwd: R });
    const onveranderd = git(R, 'rev-parse', 'HEAD') === voor && git(R, 'status', '--porcelain', '--', 'src') === '';
    const k = orch(R, 'wachtrij', 'klaar', '--taak', taakId, '--uitkomst', 'afgewezen'); orch(R, 'staat-commit');
    return { ok: false, v, k, conflict: `${m.stdout}${m.stderr}`, hoofd: voor, onveranderd };
  }
  const hoofd = git(R, 'rev-parse', 'HEAD'); // merge-commit = новий вершок integratie (klaar --hoofd); staat-commit нижче додає ще один commit стану
  const k = orch(R, 'wachtrij', 'klaar', '--taak', taakId, '--uitkomst', 'integrated', '--hoofd', hoofd);
  orch(R, 'staat-commit');
  return { ok: true, v, k, conflict: '', hoofd, onveranderd: false };
}

/** Root-інсталятор у тимчасовому дереві (той самий патерн, що orch-uitrol-basis): shim ssh-keygen, стаб інсталятора, setpriv під root. */
function uitrolOmgeving(stubScript: string) {
  const basisMap = mkdtempSync('/tmp/orch-acc-uitrol-'); chmodSync(basisMap, 0o777);
  const bin = join(basisMap, 'bin'); mkdirSync(bin);
  // Shim altijd vóór in PATH (ook met een echte ssh-keygen): de .sig-bestanden zijn nep en zouden anders terecht HANDTEKENING_ONGELDIG geven.
  writeFileSync(join(bin, 'ssh-keygen'), '#!/bin/bash\n[ "$1" = "-Y" ] && [ "$2" = "verify" ] && exit 0\nexit 1\n'); chmodSync(join(bin, 'ssh-keygen'), 0o755);
  const inbox = join(basisMap, 'inbox'); const werk = join(basisMap, 'werk'); const statusMap = join(basisMap, 'status'); const pk = join(basisMap, 'pk');
  for (const d of [inbox, pk]) { mkdirSync(d); chmodSync(d, 0o777); }
  const ondertekenaars = join(basisMap, 'ondertekenaars'); writeFileSync(ondertekenaars, 'uitrol@mijn-ruimte namespaces="mijn-ruimte-uitrol" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n'); chmodSync(ondertekenaars, 0o644);
  const spoor = join(basisMap, 'spoor'); const stub = join(basisMap, 'stub.sh');
  writeFileSync(stub, stubScript.replace(/__SPOOR__/g, spoor)); chmodSync(stub, 0o755);
  const script = join(basisMap, 'uitrol.sh'); cpSync(UITROL, script); chmodSync(script, 0o755);
  const env: Record<string, string> = { PATH: `${bin}:${process.env.PATH}`, HOME: basisMap, LANG: 'C.UTF-8', UITROL_INBOX: inbox, UITROL_WERK: werk, UITROL_STATUS_DIR: statusMap, UITROL_ONDERTEKENAARS: ondertekenaars, UITROL_INSTALLEER: stub, UITROL_LOCK: join(basisMap, 'lock'), UITROL_GROEP: 'nogroup', UITROL_PAKKETTEN_DIR: join(basisMap, 'pakketten') };
  const argv = () => (ALS_ROOT ? ['setpriv', '--reuid=65534', '--regid=65534', '--clear-groups', 'bash', script] : ['bash', script]);
  const draai = () => { const a = argv(); return spawnSync(a[0], a.slice(1), { env, encoding: 'utf8' }); };
  const draaiAsync = () => new Promise<{ code: number | null; uit: string }>((res) => { const a = argv(); const c = spawn(a[0], a.slice(1), { env }); let uit = ''; c.stdout.on('data', (d) => { uit += d; }); c.stderr.on('data', (d) => { uit += d; }); c.on('close', (code) => res({ code, uit })); });
  const status = () => { try { return JSON.parse(lees(join(statusMap, 'status.json'))); } catch { return {}; } };
  const leg = (p: string) => { const naam = p.split('/').pop()!; cpSync(p, join(inbox, naam)); chmodSync(join(inbox, naam), 0o644); writeFileSync(join(inbox, `${naam}.sig`), '-----BEGIN SSH SIGNATURE-----\nshim\n-----END SSH SIGNATURE-----\n'); chmodSync(join(inbox, `${naam}.sig`), 0o644); };
  const laatste = (n: string) => (existsSync(join(werk, n)) ? lees(join(werk, n)).trim() : null);
  // «сервер уже має версію X»: werk-тека належить тестовому користувачу (під root — chown 65534), інакше скрипт не може її chmod'нути
  const zetLaatste = (versie: string, commit: string) => { mkdirSync(werk, { recursive: true }); writeFileSync(join(werk, 'laatste-versie'), `${versie}\n`); writeFileSync(join(werk, 'laatste-commit'), `${commit}\n`); if (ALS_ROOT) spawnSync('chown', ['-R', '65534:65534', werk]); else chmodSync(werk, 0o777); };
  const spoorRegels = () => (existsSync(spoor) ? lees(spoor).trim().split('\n').filter(Boolean) : []);
  const inboxInhoud = () => readdirSync(inbox).filter((n) => !n.endsWith('.sig'));
  return { basisMap, pk, draai, draaiAsync, status, leg, laatste, zetLaatste, spoorRegels, inboxInhoud };
}
/** Синтетичний пакет (як у orch-uitrol-basis) — для перевірки одночасних установок, де вміст коду не має значення. */
function synthPakket(werk: string, versie: string, basis: string | null, bronCommit: string) {
  const top = join(werk, `bron-${versie}`); const binnen = join(top, `mijn-ruimte-${versie}`);
  mkdirSync(join(binnen, 'deploy'), { recursive: true });
  writeFileSync(join(binnen, 'UITROL-VERSIE'), `${versie}\n`); writeFileSync(join(binnen, 'AUTEUR'), 'Test Auteur\n'); writeFileSync(join(binnen, 'AGENT'), 'claude\n');
  writeFileSync(join(binnen, 'SAMENVATTING'), 'Приймальний тест ORCH-001: два пакети одночасно — інсталятор має виконувати їх по черзі.\n');
  writeFileSync(join(binnen, 'BRON-COMMIT'), `${bronCommit}\n`); writeFileSync(join(binnen, 'UITROL-MANIFEST.json'), manifestVoor(versie));
  writeFileSync(join(binnen, 'deploy/installeer-app.sh'), '#!/bin/bash\necho "ECHTE INSTALLER MAG NIET DRAAIEN"; exit 99\n');
  if (basis) writeFileSync(join(binnen, 'UITROL-BASIS'), basis);
  const uit = join(werk, `mijn-ruimte-${versie}.tar.gz`);
  sh(werk, 'tar', ['-czf', uit, '-C', top, `mijn-ruimte-${versie}`]); rmSync(top, { recursive: true, force: true });
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('orch-acceptatie');
  const rootKan = !ALS_ROOT || HEEFT_SETPRIV;
  if (!rootKan) console.log('root zonder setpriv: сценарії 3 (root), 7 і 8 пропущено — git-сценарії виконуються');
  const { R, basis0, basis } = maakRepo();
  const tmp: string[] = [];
  try {
    // ============================================================ 1 + 4. Паралельні агенти; агент без git працює з CONTEXT-COMPACT + архівом
    const context = lees(join(R, 'orchestratie/CONTEXT-COMPACT.md'));
    check('4 CONTEXT-COMPACT.md для агента без GitHub містить версію й відбиток чинних правил', context.includes(lockVan(R).regelsVersie) && context.includes(lockVan(R).hash.slice(0, 12)), context.slice(0, 200));
    const W1 = agentWerk(R, basis); tmp.push(W1);
    check('4 робоча тека агента — експорт бази без .git', !existsSync(join(W1, '.git')) && lees(join(W1, 'src/a.ts')) === 'export const a = 1;\n');
    writeFileSync(join(W1, 'src/a.ts'), 'export const a = 11; // claude\n'); writeFileSync(join(W1, 'src/claude.ts'), 'export const claude = true;\n');
    writeFileSync(join(W1, 'ORCH-OVERDRACHT.json'), JSON.stringify(od(R, { taakId: 'CLD-101', agent: 'claude', basisCommit: basis, tak: 'feature/cld-101-20261031-160000', bestanden: { gewijzigd: ['src/a.ts'], toegevoegd: ['src/claude.ts'], verwijderd: [] } })));
    let r = orch(R, 'inleveren', '--bron', zipVan(W1, ['src/a.ts', 'src/claude.ts', 'ORCH-OVERDRACHT.json'], 'cld.zip'), '--tests', CONTROLEER);
    check('1 агент A (claude, zip без git): прийнято, гілка від бази', r.code === 0 && r.uit.includes('aanvaard') && git(R, 'merge-base', 'feature/cld-101-20261031-160000', 'integratie') === basis, r.uit);
    const recA = records(R).find((n) => n.startsWith('CLD-101-'));
    check('4 запис передачі: канал zip, причина «без git», sha256 архіву, 2 файли', !!recA && (() => { const j = json(join(R, 'orchestratie/inleveringen', recA!)); return j.kanaal === 'zip' && typeof j.overdracht?.zonderGit === 'string' && /^[0-9a-f]{64}$/.test(j.bronSha256) && j.bestanden.length === 2; })());

    const W2 = agentWerk(R, basis); tmp.push(W2);
    writeFileSync(join(W2, 'src/b.ts'), 'export const b = 22; // codex\n'); writeFileSync(join(W2, 'src/codex.ts'), 'export const codex = true;\n');
    writeFileSync(join(W2, 'ORCH-OVERDRACHT.json'), JSON.stringify(od(R, { taakId: 'CDX-101', agent: 'codex', kanaal: 'git_patch', basisCommit: basis, tak: 'feature/cdx-101-20261031-160100', bestanden: { gewijzigd: ['src/b.ts'], toegevoegd: ['src/codex.ts'], verwijderd: [] } })));
    r = orch(R, 'inleveren', '--bron', zipVan(W2, ['src/b.ts', 'src/codex.ts', 'ORCH-OVERDRACHT.json'], 'cdx.zip'), '--tests', CONTROLEER);
    check('1 агент B (codex) паралельно від тієї ж бази, інші файли: прийнято', r.code === 0 && r.uit.includes('aanvaard'), r.uit);
    check('1 обидва чекають у черзі в порядку подання, integratie ще без змін', wachtrij(R).wachtrij.map((x: any) => x.taakId).join(',') === 'CLD-101,CDX-101' && toon(R, 'integratie', 'src/a.ts') === 'export const a = 1;');
    const i1 = integreer(R, 'CLD-101', 'feature/cld-101-20261031-160000');
    check('1 volgende → CLD-101, злиття --no-ff, klaar integrated', i1.ok && i1.v.uit.includes('CLD-101') && i1.k.code === 0, `${i1.v.uit}\n${i1.k.uit}`);
    const i2 = integreer(R, 'CDX-101', 'feature/cdx-101-20261031-160100');
    check('1 volgende → CDX-101, злиття, klaar integrated — черга порожня', i2.ok && i2.k.code === 0 && wachtrij(R).wachtrij.length === 0 && wachtrij(R).bezig === null, i2.k.uit);
    check('1 нічого не загублено: a.ts (claude), b.ts (codex), claude.ts і codex.ts усі в integratie', toon(R, 'integratie', 'src/a.ts')?.includes('claude') === true && toon(R, 'integratie', 'src/b.ts')?.includes('codex') === true && bestaat(R, 'integratie', 'src/claude.ts') && bestaat(R, 'integratie', 'src/codex.ts'));
    check('1 обидві задачі integrated з integratieCommit; історія черги — 2 записи', taak(R, 'CLD-101').staat === 'integrated' && taak(R, 'CDX-101').staat === 'integrated' && taak(R, 'CDX-101').integratieCommit === i2.hoofd && wachtrij(R).geschiedenis.length === 2);
    check('1 база лишилась предком вершка (без force), controleer зелений', gitOk(R, 'merge-base', '--is-ancestor', basis, 'integratie') && orch(R, 'controleer').code === 0);
    r = orch(R, 'status');
    check('1 status: CLD-101 і CDX-101 integrated', /CLD-101\s+integrated/.test(r.uit) && /CDX-101\s+integrated/.test(r.uit), r.uit);

    // ============================================================ 2. Конфлікти: при здачі (застаріла база з перетином) і при злитті; відновлення через rebase
    const W3 = agentWerk(R, basis); tmp.push(W3); // gemini працював на СТАРІЙ базі й теж чіпає a.ts
    writeFileSync(join(W3, 'src/a.ts'), 'export const a = 33; // gemini op oude basis\n');
    writeFileSync(join(W3, 'ORCH-OVERDRACHT.json'), JSON.stringify(od(R, { taakId: 'GEM-101', agent: 'gemini', basisCommit: basis, tak: 'feature/gem-101-20261031-160200', bestanden: { gewijzigd: ['src/a.ts'], toegevoegd: [], verwijderd: [] } })));
    const hoofdVoor = git(R, 'rev-parse', 'integratie');
    r = orch(R, 'inleveren', '--bron', zipVan(W3, ['src/a.ts', 'ORCH-OVERDRACHT.json'], 'gem.zip'), '--tests', CONTROLEER);
    check('2 застаріла база з перетином (a.ts) → відхилено BASIS_VEROUDERD_OVERLAP + CONFLICT; гілки немає, integratie не змінено', r.code === 1 && r.uit.includes('BASIS_VEROUDERD_OVERLAP') && r.uit.includes('CONFLICT') && !gitOk(R, 'rev-parse', '--verify', '-q', 'feature/gem-101-20261031-160200') && git(R, 'rev-parse', 'integratie') === hoofdVoor && toon(R, 'integratie', 'src/a.ts')?.includes('claude') === true, r.uit);
    check('2 відмову записано (аудит), задача не в черзі', records(R).some((n) => n.startsWith('GEM-101-')) && !wachtrij(R).wachtrij.some((x: any) => x.taakId === 'GEM-101'));
    // відновлення: gemini бере свіжу базу (вершок integratie), накладає свою зміну на версію claude, нова часова мітка гілки
    const W3b = agentWerk(R, hoofdVoor); tmp.push(W3b);
    writeFileSync(join(W3b, 'src/a.ts'), 'export const a = 33; // gemini na rebase op claude\n');
    writeFileSync(join(W3b, 'ORCH-OVERDRACHT.json'), JSON.stringify(od(R, { taakId: 'GEM-101', agent: 'gemini', basisCommit: hoofdVoor, tak: 'feature/gem-101-20261031-160300', bestanden: { gewijzigd: ['src/a.ts'], toegevoegd: [], verwijderd: [] } })));
    r = orch(R, 'inleveren', '--bron', zipVan(W3b, ['src/a.ts', 'ORCH-OVERDRACHT.json'], 'gem2.zip'), '--tests', CONTROLEER);
    check('2 після rebase на свіжу базу → прийнято', r.code === 0 && r.uit.includes('aanvaard'), r.uit);
    const i3 = integreer(R, 'GEM-101', 'feature/gem-101-20261031-160300');
    check('2 GEM-101 integrated; a.ts = версія gemini, claude.ts і codex.ts збережено', i3.ok && toon(R, 'integratie', 'src/a.ts')?.includes('gemini na rebase') === true && bestaat(R, 'integratie', 'src/claude.ts') && bestaat(R, 'integratie', 'src/codex.ts'), i3.k.uit);
    // конфлікт при ЗЛИТТІ: grok і antigravity обидва прийняті від тієї ж бази й обидва змінюють b.ts — другий конфліктує лише при злитті
    const basis2 = i3.hoofd;
    const W4 = agentWerk(R, basis2); tmp.push(W4); writeFileSync(join(W4, 'src/b.ts'), 'export const b = 44; // grok\n');
    writeFileSync(join(W4, 'ORCH-OVERDRACHT.json'), JSON.stringify(od(R, { taakId: 'GRK-101', agent: 'grok', kanaal: 'mcp', basisCommit: basis2, tak: 'feature/grk-101-20261031-160400', bestanden: { gewijzigd: ['src/b.ts'], toegevoegd: [], verwijderd: [] } })));
    r = orch(R, 'inleveren', '--bron', zipVan(W4, ['src/b.ts', 'ORCH-OVERDRACHT.json'], 'grk.zip'), '--kanaal', 'mcp', '--tests', CONTROLEER);
    const W5 = agentWerk(R, basis2); tmp.push(W5); writeFileSync(join(W5, 'src/b.ts'), 'export const b = 55; // antigravity\n');
    writeFileSync(join(W5, 'ORCH-OVERDRACHT.json'), JSON.stringify(od(R, { taakId: 'AGV-101', agent: 'antigravity', basisCommit: basis2, tak: 'feature/agv-101-20261031-160500', bestanden: { gewijzigd: ['src/b.ts'], toegevoegd: [], verwijderd: [] } })));
    const r5 = orch(R, 'inleveren', '--bron', zipVan(W5, ['src/b.ts', 'ORCH-OVERDRACHT.json'], 'agv.zip'), '--tests', CONTROLEER);
    check('2 grok і antigravity (обидва b.ts від однієї бази) прийняті — конфлікту з integratie ще немає', r.code === 0 && r5.code === 0 && wachtrij(R).wachtrij.length === 2, `${r.uit}\n${r5.uit}`);
    const i4 = integreer(R, 'GRK-101', 'feature/grk-101-20261031-160400');
    const i5 = integreer(R, 'AGV-101', 'feature/agv-101-20261031-160500');
    check('2 grok злито; antigravity конфліктує при злитті → abort, klaar afgewezen, bezig порожній, integratie = після grok', i4.ok && !i5.ok && i5.conflict.includes('CONFLICT') && i5.k.code === 0 && wachtrij(R).bezig === null && i5.onveranderd && toon(R, 'integratie', 'src/b.ts')?.includes('grok') === true, `${i5.conflict}\n${i5.k.uit}`);
    check('2 задача AGV-101 повернулась у in_progress, її гілка лишилась агентові для rebase', taak(R, 'AGV-101').staat === 'in_progress' && gitOk(R, 'rev-parse', '--verify', '-q', 'feature/agv-101-20261031-160500'));
    const W5b = agentWerk(R, i4.hoofd); tmp.push(W5b); writeFileSync(join(W5b, 'src/b.ts'), 'export const b = 55; // antigravity na rebase op grok\n');
    writeFileSync(join(W5b, 'ORCH-OVERDRACHT.json'), JSON.stringify(od(R, { taakId: 'AGV-101', agent: 'antigravity', basisCommit: i4.hoofd, tak: 'feature/agv-101-20261031-160600', bestanden: { gewijzigd: ['src/b.ts'], toegevoegd: [], verwijderd: [] } })));
    r = orch(R, 'inleveren', '--bron', zipVan(W5b, ['src/b.ts', 'ORCH-OVERDRACHT.json'], 'agv2.zip'), '--tests', CONTROLEER);
    const i6 = integreer(R, 'AGV-101', 'feature/agv-101-20261031-160600');
    check('2 antigravity після rebase → прийнято й злито; b.ts = antigravity, усі попередні коміти — предки вершка', r.code === 0 && i6.ok && toon(R, 'integratie', 'src/b.ts')?.includes('antigravity na rebase') === true && [basis, i1.hoofd, i2.hoofd, i3.hoofd, i4.hoofd].every((c) => gitOk(R, 'merge-base', '--is-ancestor', c, 'integratie')), `${r.uit}\n${i6.k.uit}`);

    // ============================================================ 5. Зміна політики: власник підвищує версію → агенти зі старими правилами відхиляються до taak-herlees
    orch(R, 'taak-start', '--id', 'CHT-201', '--agent', 'chatgpt', '--basis', i6.hoofd, '--tak', 'feature/cht-201-20261031-160700', '--omschrijving', 'Приймальний тест: задача зареєстрована до зміни правил');
    const oudLock = lockVan(R);
    const beleid = json(join(R, 'orchestratie/beleid.json')); const [ma, mi] = beleid.regelsVersie.split('.').map(Number); const nieuwV = `${ma}.${mi + 1}.0`; beleid.regelsVersie = nieuwV;
    writeFileSync(join(R, 'orchestratie/beleid.json'), JSON.stringify(beleid, null, 2) + '\n');
    writeFileSync(join(R, 'orchestratie/BESLUITEN.md'), lees(join(R, 'orchestratie/BESLUITEN.md')) + `\n## B-999 · 2026-10-31 · ${nieuwV} · voorstel\n\n**Контекст.** Приймальний тест етапу 4: зміна політики під час роботи агентів.\n\n**Рішення.** Версія правил підвищена; агенти перечитують правила.\n\n**Хто.** Тест.\n`);
    r = orch(R, 'vergrendel'); const rc = orch(R, 'context');
    check('5 власник: vergrendel + context після підвищення regelsVersie', r.code === 0 && rc.code === 0 && lockVan(R).regelsVersie === nieuwV && lockVan(R).hash !== oudLock.hash, `${r.uit}${rc.uit}`);
    git(R, 'add', '-A'); git(R, 'commit', '-q', '-m', `regels ${nieuwV}`);
    check('5 controleer зелений після зміни правил', orch(R, 'controleer').code === 0);
    r = orch(R, 'versheid', '--taak', 'CHT-201', '--fase', 'start');
    check('5 задача зі старою версією правил → versheid: REGELS_VEROUDERD', r.code !== 0 && r.uit.includes('REGELS_VEROUDERD'), r.uit);
    const W6 = agentWerk(R, i6.hoofd); tmp.push(W6); writeFileSync(join(W6, 'src/chat.ts'), 'export const chat = 1;\n');
    writeFileSync(join(W6, 'ORCH-OVERDRACHT.json'), JSON.stringify({ ...od(R, { taakId: 'CHT-201', agent: 'chatgpt', basisCommit: i6.hoofd, tak: 'feature/cht-201-20261031-160700', bestanden: { gewijzigd: [], toegevoegd: ['src/chat.ts'], verwijderd: [] } }), regelsVersie: oudLock.regelsVersie, regelsHash: oudLock.hash }));
    r = orch(R, 'inleveren', '--bron', zipVan(W6, ['src/chat.ts', 'ORCH-OVERDRACHT.json'], 'cht-oud.zip'), '--tests', CONTROLEER);
    check('5 передача зі старими правилами → відхилено REGELS_VEROUDERD, гілки немає', r.code === 1 && r.uit.includes('REGELS_VEROUDERD') && !gitOk(R, 'rev-parse', '--verify', '-q', 'feature/cht-201-20261031-160700'), r.uit);
    r = orch(R, 'taak-herlees', '--id', 'CHT-201');
    check('5 taak-herlees → задача на чинних правилах, versheid start без REGELS_VEROUDERD', r.code === 0 && r.uit.includes(`→ ${nieuwV}`) && taak(R, 'CHT-201').regelsVersie === nieuwV && !orch(R, 'versheid', '--taak', 'CHT-201', '--fase', 'start').uit.includes('REGELS_VEROUDERD'), r.uit);
    const W6b = agentWerk(R, git(R, 'rev-parse', 'integratie')); tmp.push(W6b); writeFileSync(join(W6b, 'src/chat.ts'), 'export const chat = 1;\n');
    const basis6 = git(R, 'rev-parse', 'integratie');
    writeFileSync(join(W6b, 'ORCH-OVERDRACHT.json'), JSON.stringify(od(R, { taakId: 'CHT-201', agent: 'chatgpt', basisCommit: basis6, tak: 'feature/cht-201-20261031-160700', bestanden: { gewijzigd: [], toegevoegd: ['src/chat.ts'], verwijderd: [] } })));
    r = orch(R, 'inleveren', '--bron', zipVan(W6b, ['src/chat.ts', 'ORCH-OVERDRACHT.json'], 'cht-nieuw.zip'), '--tests', CONTROLEER);
    const i7 = integreer(R, 'CHT-201', 'feature/cht-201-20261031-160700');
    check('5 з чинними правилами → прийнято й злито (chat.ts в integratie)', r.code === 0 && i7.ok && bestaat(R, 'integratie', 'src/chat.ts'), `${r.uit}\n${i7.k.uit}`);

    // ============================================================ 6. «Заморожений» агент: задача в інтеграції, агент зник → terugtrekken + bevroren → черга йде далі → відновлення
    const basis7 = i7.hoofd;
    orch(R, 'taak-start', '--id', 'GRK-301', '--agent', 'grok', '--basis', basis7, '--tak', 'feature/grk-301-20261031-160800', '--omschrijving', 'Приймальний тест: агент зникає під час інтеграції');
    const W7 = agentWerk(R, basis7); tmp.push(W7); writeFileSync(join(W7, 'src/grok.ts'), 'export const grok = 1;\n');
    writeFileSync(join(W7, 'ORCH-OVERDRACHT.json'), JSON.stringify(od(R, { taakId: 'GRK-301', agent: 'grok', kanaal: 'mcp', basisCommit: basis7, tak: 'feature/grk-301-20261031-160800', bestanden: { gewijzigd: [], toegevoegd: ['src/grok.ts'], verwijderd: [] } })));
    r = orch(R, 'inleveren', '--bron', zipVan(W7, ['src/grok.ts', 'ORCH-OVERDRACHT.json'], 'grk301.zip'), '--kanaal', 'mcp', '--tests', CONTROLEER);
    orch(R, 'staat-commit'); const v7 = orch(R, 'wachtrij', 'volgende');
    check('6 GRK-301 прийнято і став bezig у черзі', r.code === 0 && v7.code === 0 && wachtrij(R).bezig === 'GRK-301', `${r.uit}\n${v7.uit}`);
    check('6 поки GRK-301 bezig, наступний volgende → WACHTRIJ_BEZIG (черга стоїть)', orch(R, 'wachtrij', 'volgende').uit.includes('WACHTRIJ_BEZIG'));
    r = orch(R, 'wachtrij', 'terugtrekken', '--taak', 'GRK-301', '--reden', 'agent reageert niet');
    const rb = orch(R, 'taak-staat', '--id', 'GRK-301', '--staat', 'bevroren');
    check('6 власник: terugtrekken (з причиною) + taak-staat bevroren → bezig порожній, в історії teruggetrokken', r.code === 0 && rb.code === 0 && wachtrij(R).bezig === null && wachtrij(R).geschiedenis.some((g: any) => g.taakId === 'GRK-301' && g.staat === 'teruggetrokken' && /reageert/.test(g.reden)) && taak(R, 'GRK-301').staat === 'bevroren', `${r.uit}\n${rb.uit}`);
    r = orch(R, 'status');
    check('6 status показує GRK-301 bevroren; controleer зелений (заморожена задача не блокує)', /GRK-301\s+bevroren/.test(r.uit) && orch(R, 'controleer').code === 0, r.uit);
    r = orch(R, 'versheid', '--taak', 'GRK-301', '--fase', 'overdracht');
    check('6 передача замороженої задачі → TAAK_BEVROREN', r.code !== 0 && r.uit.includes('TAAK_BEVROREN'), r.uit);
    check('6 черга йде далі без GRK-301: volgende → WACHTRIJ_LEEG, не WACHTRIJ_BEZIG', orch(R, 'wachtrij', 'volgende').uit.includes('WACHTRIJ_LEEG'));
    // відновлення: агент повернувся — власник знімає заморозку, агент здає заново від свіжої бази з новою міткою гілки
    r = orch(R, 'taak-staat', '--id', 'GRK-301', '--staat', 'in_progress');
    const W7b = agentWerk(R, basis7); tmp.push(W7b); writeFileSync(join(W7b, 'src/grok.ts'), 'export const grok = 2; // na herstel\n');
    writeFileSync(join(W7b, 'ORCH-OVERDRACHT.json'), JSON.stringify(od(R, { taakId: 'GRK-301', agent: 'grok', kanaal: 'mcp', basisCommit: basis7, tak: 'feature/grk-301-20261031-160900', bestanden: { gewijzigd: [], toegevoegd: ['src/grok.ts'], verwijderd: [] } })));
    const r7 = orch(R, 'inleveren', '--bron', zipVan(W7b, ['src/grok.ts', 'ORCH-OVERDRACHT.json'], 'grk301b.zip'), '--kanaal', 'mcp', '--tests', CONTROLEER);
    const i8 = integreer(R, 'GRK-301', 'feature/grk-301-20261031-160900');
    check('6 після відновлення (in_progress) нова передача прийнята й злита; стара гілка лишилась, не перезаписана', r.code === 0 && r7.code === 0 && i8.ok && toon(R, 'integratie', 'src/grok.ts')?.includes('na herstel') === true && gitOk(R, 'rev-parse', '--verify', '-q', 'feature/grk-301-20261031-160800'), `${r.uit}\n${r7.uit}\n${i8.k.uit}`);

    // ============================================================ 3. Випуск: orch pakket з integratie → root-інсталятор: свіжа база OK, застаріла → BASIS_VEROUDERD
    const uit = mkdtempSync(join(tmpdir(), 'orch-acc-uit-')); tmp.push(uit);
    const manifest = (v: string) => { const p = join(uit, `manifest-${v}.json`); writeFileSync(p, manifestVoor(v)); return p; };
    const testsJson = join(uit, 'tests.json'); writeFileSync(testsJson, JSON.stringify({ geslaagd: 275, mislukt: 0, falend: [], uitleg: { uk: 'усе зелене', nl: 'alles groen' } }));
    orch(R, 'staat-commit');
    r = orch(R, 'pakket', '--taak', 'CLD-101', '--auteur', 'Test Eigenaar', '--versie', '20261105-120000', '--uit', uit, '--manifest', manifest('20261105-120000'), '--testresultaten', testsJson, '--niet-gedaan', 'нічого не пропущено');
    const tar1 = join(uit, 'mijn-ruimte-20261105-120000.tar.gz'); const zip1 = join(uit, 'mijn-ruimte-20261105-120000-claude-overdracht.zip');
    check('3 orch pakket з integratie: tar + пакет передачі; задача CLD-101 → released', r.code === 0 && existsSync(tar1) && existsSync(zip1) && taak(R, 'CLD-101').releaseVersie === '20261105-120000', r.uit);
    const basisTekst = sh(uit, 'sh', ['-c', `tar -xzOf "${tar1}" mijn-ruimte-20261105-120000/UITROL-BASIS`]);
    check('3 UITROL-BASIS у tar = ВСТАНОВЛЕНА база (geinstalleerd.json), не вершок', basisTekst.includes('versie=20261031-093842') && basisTekst.includes(`commit=${basis0}`), basisTekst);
    check('3 pakket-controleer: гаразд проти встановленої бази', orch(R, 'pakket-controleer', '--bron', zip1).code === 0);
    if (rootKan) {
      const u = uitrolOmgeving('#!/bin/bash\necho "$1 $(cat "$2/UITROL-VERSIE")" >> "__SPOOR__"\n'); tmp.push(u.basisMap);
      u.zetLaatste('20261031-093842', basis0);
      u.leg(tar1); let rr = u.draai();
      check('3 root-інсталятор: пакет на встановленій базі → OK, інсталятор викликано, laatste-commit = вершок пакета', rr.status === 0 && u.status().code === 'OK' && u.spoorRegels().length === 1 && u.laatste('laatste-versie') === '20261105-120000' && u.laatste('laatste-commit') === git(R, 'rev-parse', 'integratie'), `${rr.status} ${u.status().code} ${rr.stderr.slice(-300)}`);
      // факт установки пише інсталятор/власник → у координації задача стає installed
      const hoofdNu = git(R, 'rev-parse', 'integratie');
      writeFileSync(join(R, 'orchestratie/geinstalleerd.json'), JSON.stringify({ schema: 1, versie: '20261105-120000', bronCommit: hoofdNu, bron: 'installer', op: '2026-10-31T17:00:00Z' }, null, 2)); orch(R, 'staat-commit');
      r = orch(R, 'status');
      check('3 після факту установки status: CLD-101 installed (інші integrated — вони в тому ж вершку, теж installed)', /CLD-101\s+installed/.test(r.uit) && /CDX-101\s+installed/.test(r.uit), r.uit);
      // інший агент тим часом випустив і встановив 20261106 — пакет, зібраний на 20261105, застарів
      u.zetLaatste('20261106-000000', sha1('andere agent'));
      r = orch(R, 'pakket', '--taak', 'CDX-101', '--auteur', 'Test Eigenaar', '--versie', '20261107-000000', '--uit', uit, '--manifest', manifest('20261107-000000'), '--testresultaten', testsJson, '--niet-gedaan', 'нічого не пропущено');
      const tar2 = join(uit, 'mijn-ruimte-20261107-000000.tar.gz'); const zip2 = join(uit, 'mijn-ruimte-20261107-000000-codex-overdracht.zip');
      u.leg(tar2); rr = u.draai();
      check('3 застарілий випуск: root → BASIS_VEROUDERD, інсталятор НЕ викликано, laatste-* без змін', r.code === 0 && rr.status === 2 && u.status().code === 'BASIS_VEROUDERD' && u.spoorRegels().length === 1 && u.laatste('laatste-versie') === '20261106-000000', `${r.uit}\n${rr.status} ${u.status().code}`);
      writeFileSync(join(R, 'orchestratie/geinstalleerd.json'), JSON.stringify({ schema: 1, versie: '20261106-000000', bronCommit: sha1('andere agent'), bron: 'installer', op: '2026-10-31T17:30:00Z' }, null, 2));
      r = orch(R, 'pakket-controleer', '--bron', zip2);
      check('3 pakket-controleer каже те саме, що root: BASIS_VEROUDERD (обидва боки узгоджені)', r.code !== 0 && r.uit.includes('BASIS_VEROUDERD'), r.uit);
      writeFileSync(join(R, 'orchestratie/geinstalleerd.json'), JSON.stringify({ schema: 1, versie: '20261105-120000', bronCommit: hoofdNu, bron: 'installer', op: '2026-10-31T17:00:00Z' }, null, 2)); orch(R, 'staat-commit');

      // ============================================================ 7. Одночасні установки: flock — друга спроба не чіпає ні інсталятор, ні inbox; потім обидві по черзі
      const c = uitrolOmgeving('#!/bin/bash\necho "start $(cat "$2/UITROL-VERSIE") $(date +%s%N)" >> "__SPOOR__"\nsleep 3\necho "einde $(cat "$2/UITROL-VERSIE") $(date +%s%N)" >> "__SPOOR__"\n'); tmp.push(c.basisMap);
      const CA = sha1('a'); const CB = sha1('b');
      c.zetLaatste('20261101-090000', CA);
      c.leg(synthPakket(c.pk, '20261102-100000', `versie=20261101-090000\ncommit=${CA}\n`, CB));
      const eerste = c.draaiAsync();
      await slaap(1200);
      c.leg(synthPakket(c.pk, '20261103-100000', `versie=20261102-100000\ncommit=${CB}\n`, sha1('c')));
      const tweede = await c.draaiAsync();
      check('7 друга установка під час першої: «er loopt al een uitrol», вихід 0, пакет лишився в inbox, інсталятор не викликано вдруге', tweede.code === 0 && /er loopt al een uitrol/.test(tweede.uit) && c.inboxInhoud().includes('mijn-ruimte-20261103-100000.tar.gz') && c.spoorRegels().filter((l) => l.startsWith('start')).length === 1, `${tweede.code} ${tweede.uit.slice(-300)} ${c.inboxInhoud().join(',')}`);
      const e1 = await eerste;
      check('7 перша завершилась OK: laatste-versie 20261102-100000', e1.code === 0 && c.status().code === 'OK' && c.laatste('laatste-versie') === '20261102-100000', `${e1.code} ${c.status().code}`);
      const derde = c.draai();
      const sp = c.spoorRegels();
      const tijd = (pref: string, v: string) => Number((sp.find((l) => l.startsWith(`${pref} ${v}`)) ?? '0 0 0').split(' ')[2]);
      check('7 наступний прохід встановлює другий пакет; у стабі старт другого ПІСЛЯ кінця першого (без перемішування)', derde.status === 0 && c.status().code === 'OK' && c.laatste('laatste-versie') === '20261103-100000' && sp.length === 4 && tijd('start', '20261103-100000') > tijd('einde', '20261102-100000') && c.inboxInhoud().length === 0, `${derde.status} ${c.status().code} ${sp.join(' | ')}`);

      // ============================================================ 8. Відкат: passkey-рішення → root-скрипт → інсталятор terugdraaien; координація знову released
      const { p, run } = omgeving();
      const eigenaar = nieuwePasskey('es256', 1); const sleutel = sleutelUit(eigenaar);
      writeFileSync(p.sleutels, JSON.stringify({ versie: 1, rpId: RP, origins: [ORIGIN_ADMIN, 'https://id.tarasevych.com'], sleutels: [sleutel] }));
      const f = besluitBestand(eigenaar, { soort: 'terugdraaien', inhoud: { van: '20261022-120000', naar: '20261021-120000' } });
      writeFileSync(join(p.inbox, `besluit-${f.id}.json`), f.tekst);
      const rr8 = run('verwerk');
      const st = (() => { try { return JSON.parse(lees(join(p.status, `besluit-${f.id}.json`))); } catch { return null; } })();
      const log8 = existsSync(p.installeerLog) ? lees(p.installeerLog) : '';
      check('8 root: рішення terugdraaien підтверджено passkey → інсталятор «terugdraaien 20261021-120000», current → попередній випуск', rr8.status === 0 && st?.uitkomst === 'klaar' && /terugdraaien 20261021-120000/.test(log8) && readlinkSync(join(p.app, 'current')).endsWith('20261021-120000'), `${rr8.status} ${JSON.stringify(st)} ${log8} ${rr8.stderr.slice(-300)}`);
      // після відкату інсталятор/власник записує факт: встановлено знову попередню базу → задача більше не installed, а released (пакет існує)
      writeFileSync(join(R, 'orchestratie/geinstalleerd.json'), JSON.stringify({ schema: 1, versie: '20261031-093842', bronCommit: basis0, bron: 'installer', op: '2026-10-31T18:00:00Z' }, null, 2)); orch(R, 'staat-commit');
      r = orch(R, 'status');
      check('8 координація після відкату: CLD-101 released (не installed), CDX-101 released; controleer зелений', /CLD-101\s+released/.test(r.uit) && !/CLD-101\s+installed/.test(r.uit) && /CDX-101\s+released/.test(r.uit) && orch(R, 'controleer').code === 0, r.uit);
      check('8 той самий пакет 20261105 знову валідний проти відкоченої бази (pakket-controleer OK) — повторна установка можлива без перезбирання', orch(R, 'pakket-controleer', '--bron', zip1).code === 0);
      tmp.push(p.w);
    }
    check('наприкінці: дерево integratie чисте після staat-commit, controleer зелений', git(R, 'status', '--porcelain') === '' && orch(R, 'controleer').code === 0, git(R, 'status', '--porcelain'));
  } finally {
    for (const d of [R, ...tmp]) rmSync(d, { recursive: true, force: true });
  }
  return einde();
}

if (process.argv[1] && /orch-acceptatie/.test(process.argv[1])) main().then((c) => process.exit(c));
