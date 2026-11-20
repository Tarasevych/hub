// BIJDRAGE-001: облік авторства, досьє функцій, старт сеансу й злиття без утрат — перевірка справжньої поведінки
// (справжній git-репозиторій у тимчасовій теці, справжній CLI scripts/orch.mjs, справжні файли репозиторію).
// BIJDRAGE-001: auteurschap, dossiers, sessiestart en samenvoegen zonder verlies — echt gedrag met echte git en CLI.
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
// @ts-expect-error — JS-module zonder typen
import { valideerBijdrage, maakBijdrage, valideerOnderwerp, behoudVergelijk, vaardighedenBehoud, kiesOnderwerpen, deelnemersUitBijdragen, manifestBijdragen } from '../../scripts/orch/bijdragen.mjs';
// @ts-expect-error — JS-module zonder typen
import { spiegelVaardigheden, behoudTegen } from '../../scripts/orch/begin.mjs';
import { valideerManifest } from '../../shared/uitrol-manifest';

const WORTEL = process.cwd();
const basisB = () => ({
  taakId: 'TEST-001', tijd: '2026-11-18T08:00:00Z', agent: 'claude', platform: 'Claude Code', modelId: 'claude-opus-5-5', modelBron: 'omgeving',
  opdrachtgever: 'Павло Тарасевич', soort: 'nieuw', watUk: 'Створено нову панель сповіщень із трьома частинами.',
});
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export async function main(): Promise<number> {
  const { check, einde } = checker('bijdragen-001');

  // 1. Запис внеску: обов'язкові людина, агент, платформа, конкретна модель, вид, «що».
  const r = maakBijdrage(basisB());
  check('правильний запис проходить перевірку', r.zaken.length === 0, JSON.stringify(r.zaken));
  check('шлях і id однозначні: orchestratie/bijdragen/TEST-001/20261118-080000-claude.json', r.pad === 'orchestratie/bijdragen/TEST-001/20261118-080000-claude.json' && r.bijdrage.id === 'TEST-001/20261118-080000-claude');
  const familie = maakBijdrage({ ...basisB(), modelId: 'Claude' });
  check('лише назва родини («Claude») замість моделі відхиляється', familie.zaken.some((z: any) => z.code === 'BIJDRAGE_MODEL'));
  const alias = maakBijdrage({ ...basisB(), opdrachtgever: 'Власник' });
  check('псевдонім «Власник» замість імені людини відхиляється', alias.zaken.some((z: any) => z.code === 'BIJDRAGE_OPDRACHTGEVER'));
  const herwerkt = maakBijdrage({ ...basisB(), soort: 'herwerkt' });
  check('переробка без «чому» і без попередника відхиляється', herwerkt.zaken.some((z: any) => z.code === 'BIJDRAGE_VOORGANGER') && herwerkt.zaken.some((z: any) => z.code === 'BIJDRAGE_VELD'));
  const herwerktGoed = maakBijdrage({ ...basisB(), soort: 'herwerkt', waaromUk: 'Власник просив змінити лише вигляд стрілки.', bouwtVoortOp: ['TEST-001/20261118-080000-claude'], bekendeIds: new Set(['TEST-001/20261118-080000-claude']) });
  check('переробка з причиною й посиланням на попередній запис приймається', herwerktGoed.zaken.length === 0, JSON.stringify(herwerktGoed.zaken));
  const onbekend = maakBijdrage({ ...basisB(), soort: 'afgerond', waaromUk: 'Доробка після вичерпання ліміту.', bouwtVoortOp: ['TEST-001/19990101-000000-gemini'], bekendeIds: new Set() });
  check('посилання на неіснуючий запис виявляється', onbekend.zaken.some((z: any) => z.code === 'BIJDRAGE_VOORGANGER_ONBEKEND'));
  const zonderRecord = maakBijdrage({ ...basisB(), soort: 'overname', waaromUk: 'Fable 5.2 вичерпав ліміт.', bouwtVoortOp: [{ beschrijving: 'гілка claude/project-thread-0u9ig1, PR 142' }] });
  check('попередник без запису описується текстом (гілка, PR)', zonderRecord.zaken.length === 0, JSON.stringify(zonderRecord.zaken));
  const rus = maakBijdrage({ ...basisB(), watUk: 'Сделаны новые уведомления для панели.' });
  check('мовний закон: літери поза українською абеткою відхиляються', rus.zaken.some((z: any) => z.code === 'BIJDRAGE_TAAL'));
  const mens = maakBijdrage({ ...basisB(), agent: null, mens: 'Павло Тарасевич' });
  check('внесок людини без ШІ теж записується (ярлик mens-…)', mens.zaken.length === 0 && /-mens/.test(mens.pad), mens.pad);

  // 2. Досьє «Сповіщення» з репозиторію дійсне й знаходиться за словами завдання та за файлами.
  const meldingen = JSON.parse(readFileSync(join(WORTEL, 'orchestratie/onderwerpen/meldingen.json'), 'utf8'));
  check('досьє meldingen дійсне', valideerOnderwerp(meldingen, { pad: 'orchestratie/onderwerpen/meldingen.json' }).length === 0, JSON.stringify(valideerOnderwerp(meldingen)));
  check('досьє містить обидві панелі (INTEG-001 і GEMINI-002) з гілками', meldingen.werk.some((w: any) => w.taakId === 'INTEG-001') && meldingen.werk.some((w: any) => w.taakId === 'GEMINI-002' && w.pr === 88));
  check('пошук «об’єднати панель сповіщень» знаходить досьє', kiesOnderwerpen([meldingen], { tekst: 'Треба об’єднати панель сповіщень' })[0]?.naam === 'meldingen');
  check('пошук за зміненим файлом src/meldingen/… знаходить досьє', kiesOnderwerpen([meldingen], { bestanden: ['src/meldingen/ecosysteem/MeldingenPortaal.tsx'] })[0]?.naam === 'meldingen');
  check('не пов’язане завдання досьє не підтягує', kiesOnderwerpen([meldingen], { tekst: 'полагодити календар', bestanden: ['src/agenda/Agenda.tsx'] }).length === 0);
  const zonderReden = { ...meldingen, mogelijkheden: [{ id: 'x-test', uk: 'Можливість для перевірки', staat: 'verloren' }] };
  check('утрачена можливість без причини відхиляється', valideerOnderwerp(zonderReden).some((z: any) => z.code === 'MOGELIJKHEID_REDEN'));
  const opm = { ...meldingen, opmerkingenEigenaar: [{ betreft: 'стрілка', uk: 'Стрілка не там, де дзвіночок' }] };
  check('зауваження власника без «що лишається» відхиляється (зауваження — про одну річ)', valideerOnderwerp(opm).some((z: any) => z.code === 'OPMERKING_BEHOUDEN'));

  // 3. Злиття без утрат: зникнення, редагування записів, можливостей і навичок.
  const oud = { bijdragen: new Map([['orchestratie/bijdragen/A-001/x.json', '{"a":1}']]), onderwerpen: new Map([['meldingen', meldingen]]), catalogus: null };
  check('без змін — нічого не втрачено', behoudVergelijk(oud, oud).length === 0);
  check('зниклий запис обліку виявляється', behoudVergelijk(oud, { ...oud, bijdragen: new Map() }).some((z: any) => z.code === 'BIJDRAGE_VERWIJDERD'));
  check('відредагований запис обліку виявляється', behoudVergelijk(oud, { ...oud, bijdragen: new Map([['orchestratie/bijdragen/A-001/x.json', '{"a":2}']]) }).some((z: any) => z.code === 'BIJDRAGE_GEWIJZIGD'));
  const minder = { ...meldingen, mogelijkheden: meldingen.mogelijkheden.filter((m: any) => m.id !== 'drie-delen') };
  check('зникла можливість панелі («drie-delen») виявляється', behoudVergelijk(oud, { ...oud, onderwerpen: new Map([['meldingen', minder]]) }).some((z: any) => z.code === 'MOGELIJKHEID_VERDWENEN'));
  const gemarkeerd = { ...meldingen, mogelijkheden: meldingen.mogelijkheden.map((m: any) => (m.id === 'drie-delen' ? { ...m, staat: 'verloren', reden: 'Під час об’єднання панелей поки не перенесено.' } : m)) };
  check('позначена «verloren» з причиною можливість — дозволено', behoudVergelijk(oud, { ...oud, onderwerpen: new Map([['meldingen', gemarkeerd]]) }).length === 0);
  const cat = JSON.parse(readFileSync(join(WORTEL, 'scripts/vaardigheden/catalogus.json'), 'utf8'));
  check('каталог навичок без змін — нічого не втрачено', vaardighedenBehoud(cat, cat).length === 0);
  const zonderNavik = { ...cat, vaardigheden: cat.vaardigheden.filter((v: any) => v.naam !== 'bijdragen-vastleggen') };
  check('зникла навичка виявляється', vaardighedenBehoud(cat, zonderNavik).some((z: any) => z.code === 'VAARDIGHEID_VERDWENEN'));
  const lager = { ...cat, vaardigheden: cat.vaardigheden.map((v: any) => (v.naam === 'bijdragen-vastleggen' ? { ...v, versie: '0.9.0' } : v)) };
  check('нижча версія навички (затирання новішої) виявляється', vaardighedenBehoud(cat, lager).some((z: any) => z.code === 'VAARDIGHEID_VERSIE'));
  const minderMog = { ...cat, vaardigheden: cat.vaardigheden.map((v: any) => (v.naam === 'bijdragen-vastleggen' ? { ...v, mogelijkheden: v.mogelijkheden.slice(1) } : v)) };
  check('зникла можливість навички виявляється (непідтримувану позначають у agenten)', vaardighedenBehoud(cat, minderMog).some((z: any) => z.code === 'VAARDIGHEID_MOGELIJKHEID_VERDWENEN'));
  const beperkt = { ...cat, vaardigheden: cat.vaardigheden.map((v: any) => (v.naam === 'bijdragen-vastleggen' ? { ...v, mogelijkheden: v.mogelijkheden.map((m: any, i: number) => (i === 0 ? { ...m, agenten: ['claude'] } : m)) } : v)) };
  check('обмеження можливості агентами (agenten) — дозволено', vaardighedenBehoud(cat, beperkt).length === 0);

  // 4. Учасники й «Хто що зробив» для пакета та сайту; маніфест приймає й перевіряє поле bijdragen.
  const b1 = maakBijdrage(basisB()).bijdrage;
  const b2 = maakBijdrage({ ...basisB(), tijd: '2026-11-18T09:00:00Z', agent: 'gemini', platform: 'Google Antigravity', modelId: 'Gemini 4 Hydrogen (high)', modelBron: 'eigenaar', soort: 'afgerond', waaromUk: 'Доробка розпочатої роботи.', bouwtVoortOp: [b1.id] }).bijdrage;
  const dn = deelnemersUitBijdragen([b1, b2]);
  check('учасники: людина-замовник і дві пари агент/модель', dn.filter((d: any) => d.soort === 'mens').length === 1 && dn.filter((d: any) => d.soort === 'ai').length === 2);
  check('модель «зі слів власника» потрапляє в маніфест як «auteur» (не як підтверджене середовищем)', dn.find((d: any) => d.naam === 'gemini')?.model.bron === 'auteur');
  const mf = { schema: 1, versie: '20261118-120000', aangemaakt: '2026-11-18T12:00:00Z', herkomst: 'Tarasevych/hub feature/test', auteur: 'Павло Тарасевич', zonderAi: false,
    deelnemers: dn, bijdragen: manifestBijdragen([b1, b2]),
    beschrijving: { uk: { titel: 'Тест', samenvatting: 'Перевірка поля bijdragen у маніфесті.', wijzigingen: [], fixes: [], beperkingen: [], instructies: '' }, nl: { titel: 'Test', samenvatting: 'Controle van het veld bijdragen.', wijzigingen: [], fixes: [], beperkingen: [], instructies: '' } } };
  const vm = valideerManifest(JSON.stringify(mf), '20261118-120000');
  check('маніфест із bijdragen дійсний і зберігає «хто що зробив»', vm.fouten.length === 0 && vm.manifest?.bijdragen?.length === 2 && vm.manifest.bijdragen[1].wie.model === 'Gemini 4 Hydrogen (high)', JSON.stringify(vm.fouten));
  const vmSlecht = valideerManifest(JSON.stringify({ ...mf, bijdragen: [{ ...mf.bijdragen[0], wie: { soort: 'ai', naam: 'claude', model: 'Claude' } }] }), '20261118-120000');
  check('маніфест: модель лише родиною в bijdragen відхиляється', vmSlecht.fouten.some((f) => f.veld.includes('bijdragen[0].wie.model')));
  const vmOud = valideerManifest(JSON.stringify({ ...mf, bijdragen: undefined }), '20261118-120000');
  check('старі маніфести без bijdragen лишаються дійсними', vmOud.fouten.length === 0 && vmOud.manifest?.bijdragen === undefined);

  // 5. Справжній git: behoud проти бази й CLI (bijdrage, versheid overdracht, begin з дзеркалом навичок).
  const tmp = mkdtempSync(join(tmpdir(), 'bijdrage-001-'));
  try {
    const repo = join(tmp, 'repo');
    mkdirSync(repo);
    for (const p of ['scripts', 'orchestratie', '.agents', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github', '.cursorrules', 'CODEX.md', 'GROK.md', 'ANTIGRAVITY.md', 'AUTOCLAW.md', 'CHATGPT.md', 'shared', '.gitignore']) {
      if (existsSync(join(WORTEL, p))) cpSync(join(WORTEL, p), join(repo, p), { recursive: true });
    }
    git(repo, 'init', '-q', '-b', 'werk'); git(repo, 'config', 'user.email', 't@t'); git(repo, 'config', 'user.name', 'Тест');
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'basis');
    const basis = git(repo, 'rev-parse', 'HEAD');
    check('behoud: свіжа копія без змін — чисто', behoudTegen(repo, basis).filter((z: any) => z.ernst === 'fout').length === 0);
    const orch = (...a: string[]) => spawnSync('node', ['scripts/orch.mjs', ...a], { cwd: repo, encoding: 'utf8' });
    const t = orch('taak-start', '--id', 'TEST-002', '--agent', 'claude', '--basis', basis, '--tak', 'feature/test-002-20261118-090000', '--omschrijving', 'Перевірка обліку авторства в справжньому репозиторії.');
    check('taak-start у копії працює', t.status === 0, t.stdout + t.stderr);
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'taak');
    const v1 = orch('versheid', '--taak', 'TEST-002', '--fase', 'overdracht');
    check('versheid overdracht без запису обліку — червоне (BIJDRAGE_ONTBREEKT)', v1.status !== 0 && v1.stdout.includes('BIJDRAGE_ONTBREEKT'), v1.stdout);
    const nieuw = orch('bijdrage', '--taak', 'TEST-002', '--agent', 'claude', '--platform', 'Claude Code', '--model', 'claude-opus-5-5', '--opdrachtgever', 'Павло Тарасевич', '--soort', 'nieuw', '--wat', 'Створено перевірку обліку авторства в копії репозиторію.', '--onderwerp', 'meldingen');
    check('orch bijdrage записує файл', nieuw.status === 0 && readdirSync(join(repo, 'orchestratie/bijdragen/TEST-002')).length === 1, nieuw.stdout);
    const zonderModel = orch('bijdrage', '--taak', 'TEST-002', '--agent', 'gemini', '--platform', 'Google Antigravity', '--model', 'Gemini', '--opdrachtgever', 'Павло Тарасевич', '--soort', 'nieuw', '--wat', 'Спроба запису без конкретної моделі агента.');
    check('orch bijdrage без конкретної моделі не записує нічого', zonderModel.status !== 0 && readdirSync(join(repo, 'orchestratie/bijdragen/TEST-002')).length === 1);
    git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'bijdrage');
    const v2 = orch('versheid', '--taak', 'TEST-002', '--fase', 'overdracht');
    check('versheid overdracht із записом обліку — без BIJDRAGE_ONTBREEKT', !v2.stdout.includes('BIJDRAGE_ONTBREEKT'), v2.stdout);
    const ctl = orch('controleer');
    check('controleer бачить і перевіряє записи обліку й досьє', ctl.status === 0, ctl.stdout.split('\n').filter((l) => l.startsWith('FOUT')).join('\n'));
    const na = git(repo, 'rev-parse', 'HEAD');
    // Хтось під час злиття «прибрав» досьє й запис обліку.
    rmSync(join(repo, 'orchestratie/bijdragen/TEST-002'), { recursive: true });
    const m = JSON.parse(readFileSync(join(repo, 'orchestratie/onderwerpen/meldingen.json'), 'utf8'));
    m.mogelijkheden = m.mogelijkheden.filter((x: any) => x.id !== 'ecosysteem-venster');
    writeFileSync(join(repo, 'orchestratie/onderwerpen/meldingen.json'), JSON.stringify(m, null, 2));
    const bh = orch('behoud', '--tegen', na);
    check('orch behoud ловить зниклий запис обліку й зниклу можливість панелі', bh.status !== 0 && bh.stdout.includes('BIJDRAGE_VERWIJDERD') && bh.stdout.includes('MOGELIJKHEID_VERDWENEN'), bh.stdout);
    git(repo, 'checkout', '-q', '--', '.');
    const bg = orch('begin', '--agent', 'claude', '--tekst', 'об’єднати панель сповіщень', '--kort');
    check('begin --kort завжди код 0 і показує досьє «Сповіщення»', bg.status === 0 && bg.stdout.includes('Досьє «Сповіщення'), bg.stdout.slice(0, 400));
    check('begin завантажує навички в .claude/skills з позначкою дзеркала', existsSync(join(repo, '.claude/skills/bijdragen-vastleggen/SKILL.md')) && existsSync(join(repo, '.claude/skills/bijdragen-vastleggen/.gespiegeld.json')));
    check('дзеркало навичок не потрапляє в git', git(repo, 'status', '--porcelain', '--', '.claude/skills') === '');
    // Власну теку агента без позначки дзеркало не чіпає.
    mkdirSync(join(repo, '.claude/skills/site-ontwikkelen-eigen'), { recursive: true });
    rmSync(join(repo, '.claude/skills/project-verkennen'), { recursive: true });
    mkdirSync(join(repo, '.claude/skills/project-verkennen'));
    writeFileSync(join(repo, '.claude/skills/project-verkennen/SKILL.md'), 'власна');
    const sp = spiegelVaardigheden(repo, '.claude/skills');
    check('власну теку агента без позначки не перезаписано', sp.overgeslagen.includes('project-verkennen') && readFileSync(join(repo, '.claude/skills/project-verkennen/SKILL.md'), 'utf8') === 'власна');
    check('повторне дзеркалення без змін нічого не копіює', sp.bijgewerkt.length === 0 && sp.ongewijzigd.length > 5);
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  // 6. Записи обліку в самому репозиторії дійсні; правила й перехідники вказують на старт сеансу.
  const echte = readdirSync(join(WORTEL, 'orchestratie/bijdragen')).flatMap((t) => readdirSync(join(WORTEL, 'orchestratie/bijdragen', t)).map((f) => `orchestratie/bijdragen/${t}/${f}`));
  const ids = new Set(echte.map((p) => JSON.parse(readFileSync(join(WORTEL, p), 'utf8')).id));
  check('усі записи обліку в репозиторії дійсні', echte.length >= 2 && echte.every((p) => valideerBijdrage(JSON.parse(readFileSync(join(WORTEL, p), 'utf8')), { pad: p, bekendeIds: ids }).length === 0));
  const agents = readFileSync(join(WORTEL, 'AGENTS.md'), 'utf8');
  check('AGENTS.md: перший крок — orch begin, розділ §9 і правило про зауваження власника', agents.includes('node scripts/orch.mjs begin --agent') && agents.includes('## 9. Авторство') && agents.includes('### 9.4 Зауваження власника'));
  for (const a of ['CLAUDE.md', 'GEMINI.md', 'ANTIGRAVITY.md', 'CODEX.md', '.cursorrules', '.github/copilot-instructions.md']) {
    check(`перехідник ${a} вказує на orch begin і запис обліку`, /orch\.mjs begin/.test(readFileSync(join(WORTEL, a), 'utf8')) && /orch bijdrage/.test(readFileSync(join(WORTEL, a), 'utf8')));
  }
  const inst = JSON.parse(readFileSync(join(WORTEL, '.claude/settings.json'), 'utf8'));
  check('Claude запускає orch begin автоматично на старті сеансу (SessionStart)', JSON.stringify(inst.hooks?.SessionStart ?? []).includes('orch.mjs begin --agent claude --kort'));
  return einde();
}
