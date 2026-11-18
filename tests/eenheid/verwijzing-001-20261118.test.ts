// VERWIJZING-001: посилання з людською назвою, підсумком і станом (злито, закрито, видалено) замість голих номерів і «404».
// Справжній git-репозиторій у тимчасовій теці, справжній CLI scripts/orch.mjs, справжня перевірка маніфесту й показ на сторінці.
// VERWIJZING-001: verwijzingen met titel, samenvatting en staat — echte git, echte CLI, echte manifestcontrole en weergave.
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
// @ts-expect-error — JS-module zonder typen
import { bouwVerwijzingen, maakGebeurtenis, valideerGebeurtenis, korteTitel, manifestVerwijzingen } from '../../scripts/orch/verwijzingen.mjs';
// @ts-expect-error — JS-module zonder typen
import { maakGit } from '../../scripts/orch/begin.mjs';
import { valideerManifest, type ManifestVerwijzing } from '../../shared/uitrol-manifest';
import { VerwijzingRij, staatTekst, verwijzingKnoppen } from '../../src/uitrol/Verwijzingen';

const WORTEL = process.cwd();
const sh = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const commit = (cwd: string, pad: string, inhoud: string, bericht: string) => { mkdirSync(join(cwd, pad, '..'), { recursive: true }); writeFileSync(join(cwd, pad), inhoud); sh(cwd, 'add', '-A'); sh(cwd, 'commit', '-q', '-m', bericht); return sh(cwd, 'rev-parse', 'HEAD'); };
const bijdrage = (taakId: string, tak: string | null, pr: number | null, wat: string) => ({ schema: 1, id: `${taakId}/20261118-080000-claude`, taakId, tijd: '2026-11-18T08:00:00Z', uitvoerder: { soort: 'ai', agent: 'claude', model: { id: 'claude-opus-5-5', bron: 'omgeving' } }, soort: 'nieuw', wat: { uk: wat }, tak, pr });

export async function main(): Promise<number> {
  const { check, einde } = checker('verwijzing-001');

  // 1. Запис події: видалення без причини чи без останнього коміту відхиляється; правильний приймається.
  const goed = maakGebeurtenis({ soort: 'tak', id: 'feature/oud-001', gebeurtenis: 'verwijderd', tijd: '2026-11-12T13:05:00Z', wie: 'Павло Тарасевич', waaromUk: 'Дубль, уся робота є в запиті №139.', laatsteCommit: '9c03ab34', opgenomenIn: '№139' });
  check('видалення гілки з причиною й останнім комітом записується', goed.zaken.length === 0 && goed.pad === 'orchestratie/verwijzingen/tak-feature-oud-001/20261112-130500-verwijderd.json', JSON.stringify(goed.zaken));
  const zonderWaarom = maakGebeurtenis({ soort: 'tak', id: 'feature/oud-001', gebeurtenis: 'verwijderd', wie: 'Павло Тарасевич', laatsteCommit: '9c03ab34' });
  check('видалення без причини відхиляється', zonderWaarom.zaken.some((z: any) => z.code === 'VERWIJZING_WAAROM'));
  const zonderCommit = maakGebeurtenis({ soort: 'tak', id: 'feature/oud-001', gebeurtenis: 'verwijderd', wie: 'Павло', waaromUk: 'Дубль, уся робота є в №139.' });
  check('видалення гілки без останнього коміту відхиляється (інакше її не відновити)', zonderCommit.zaken.some((z: any) => z.code === 'VERWIJZING_LAATSTE'));
  const rus = maakGebeurtenis({ soort: 'pr', id: '№77', gebeurtenis: 'gesloten', wie: 'Павло', waaromUk: 'Закрыто, всё вошло в другой запрос.' });
  check('номер запиту «№77» розпізнано, а причину з російськими літерами відхилено', rus.gebeurtenis.id === 77 && rus.zaken.some((z: any) => z.code === 'VERWIJZING_TAAL'));
  check('валідатор ловить гілку з «..»', valideerGebeurtenis({ ...goed.gebeurtenis, id: 'a/../b' }).some((z: any) => z.code === 'VERWIJZING_ID'));
  check('коротка назва: перша змістовна частина речення', korteTitel('Облік авторства (людина, агент, модель) у кожній гілці.') === 'Облік авторства' && korteTitel('Спільний випуск UPD-004 поверх живої версії: узгодження') === 'Спільний випуск UPD-004 поверх живої версії');

  // 2. Справжній репозиторій: злита гілка, злита й прибрана гілка, жива гілка, видалена з записом і без запису, міграція.
  const tmp = mkdtempSync(join(tmpdir(), 'vw-001-'));
  try {
    const repo = join(tmp, 'repo'); mkdirSync(repo);
    sh(repo, 'init', '-q', '-b', 'hoofd'); sh(repo, 'config', 'user.email', 't@t'); sh(repo, 'config', 'user.name', 't');
    const basis = commit(repo, 'a.txt', '1', 'basis');
    sh(repo, 'switch', '-q', '-c', 'feature/samen-001'); const tipSamen = commit(repo, 'b.txt', '2', 'SAMEN-001: робота');
    sh(repo, 'switch', '-q', 'hoofd'); sh(repo, 'merge', '-q', '--no-ff', '-m', 'Злиття #160 (SAMEN-001, облік авторства) у гілку спільного випуску', 'feature/samen-001');
    const mergeSamen = sh(repo, 'rev-parse', 'HEAD');
    sh(repo, 'switch', '-q', '-c', 'feature/weg-002'); const tipWeg = commit(repo, 'c.txt', '3', 'WEG-002: робота');
    sh(repo, 'switch', '-q', 'hoofd'); sh(repo, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #170 from Tarasevych/feature/weg-002\n\nНова панель сповіщень\n\nОб’єднано дві панелі в одну.', 'feature/weg-002');
    const mergeWeg = sh(repo, 'rev-parse', 'HEAD'); sh(repo, 'branch', '-q', '-D', 'feature/weg-002');
    commit(repo, 'migrations/0302_proef.sql', '-- 0302 — MIGR-003: таблиця посилань на гілки й запити\n-- друга строка опису\nSELECT 1;\n', 'MIGR-003: міграція 0302');
    sh(repo, 'switch', '-q', '-c', 'feature/open-004'); const tipOpen = commit(repo, 'd.txt', '4', 'OPEN-004: робота'); sh(repo, 'switch', '-q', 'hoofd');
    const head = sh(repo, 'rev-parse', 'HEAD');
    const bijdragen = [bijdrage('SAMEN-001', 'feature/samen-001', null, 'Облік авторства й досьє функцій для кожної гілки.'), bijdrage('WEG-002', 'feature/weg-002', 170, 'Об’єднання двох панелей сповіщень.'), bijdrage('OPEN-004', 'feature/open-004', null, 'Робота, яка ще триває у своїй гілці.'), bijdrage('DEL-005', 'feature/del-005', null, 'Гілка, яку видалили з поясненням.'), bijdrage('ZOEK-006', 'feature/zoek-006', null, 'Гілка, яку видалили мовчки.'), bijdrage('MIGR-003', null, null, 'Міграція з таблицею посилань.')];
    const register = [maakGebeurtenis({ soort: 'tak', id: 'feature/del-005', gebeurtenis: 'verwijderd', tijd: '2026-11-12T13:05:00Z', wie: 'Павло Тарасевич', waaromUk: 'Дубль, уся робота є в запиті №139.', laatsteCommit: tipWeg, opgenomenIn: '№139' }).gebeurtenis];
    const taken = new Map([['SAMEN-001', { id: 'SAMEN-001', omschrijving: 'Облік авторства (людина, агент, модель) у кожній гілці й випуску.' }]]);
    const r = bouwVerwijzingen({ git: maakGit(repo), head, basis, bijdragen, taken, register, doelTak: 'hoofd' });
    const v = (k: string) => r.verwijzingen.find((x: any) => `${x.soort}:${x.id}` === k);
    const samen = v('tak:feature/samen-001'); const pr160 = v('pr:160');
    check('злита гілка: стан «злито», коміт злиття, остання версія гілки й номер запиту з повідомлення', samen?.staat === 'samengevoegd' && samen.commit === mergeSamen && samen.laatsteCommit === tipSamen && samen.pr === 160 && samen.in === 'hoofd', JSON.stringify(samen));
    check('запит №160 відомий лише з коміту злиття — має назву «Облік авторства» і ту саму задачу', pr160?.staat === 'samengevoegd' && pr160.titel.uk === 'Облік авторства' && pr160.taken.includes('SAMEN-001'), JSON.stringify(pr160));
    const weg = v('tak:feature/weg-002'); const pr170 = v('pr:170');
    check('гілку прибрано після злиття (як на GitHub): «злито», а не «не знайдено», і останній коміт збережено', weg?.staat === 'samengevoegd' && weg.takWeg === true && weg.laatsteCommit === tipWeg && weg.commit === mergeWeg, JSON.stringify(weg));
    check('назва запиту №170 з повідомлення злиття GitHub', pr170?.titel.uk === 'Нова панель сповіщень' && pr170.staat === 'samengevoegd' && pr170.commit === mergeWeg, JSON.stringify(pr170));
    const open = v('tak:feature/open-004');
    check('жива гілка: «відкрито» з вершиною', open?.staat === 'open' && open.laatsteCommit === tipOpen && open.bestaat === true, JSON.stringify(open));
    const del = v('tak:feature/del-005');
    check('видалена гілка з записом: хто, коли, чому, куди ввійшло й останній коміт', del?.staat === 'verwijderd' && del.wie === 'Павло Тарасевич' && del.waarom?.uk.includes('Дубль') && del.opgenomenIn === '№139' && del.laatsteCommit === tipWeg, JSON.stringify(del));
    const zoek = v('tak:feature/zoek-006');
    check('мовчки видалена гілка: стан «невідомий» і попередження з командою, як записати причину', zoek?.staat === 'onbekend' && r.zaken.some((z: any) => z.code === 'VERWIJZING_ONVERKLAARD' && z.uk.includes('feature/zoek-006') && z.uk.includes('orch.mjs verwijzing')));
    const mig = v('migratie:0302');
    check('міграція: людська назва з першого рядка, задача з повідомлення коміту, файл і коміт', mig?.titel.uk === 'MIGR-003: таблиця посилань на гілки й запити' && mig.taken.includes('MIGR-003') && mig.pad === 'migrations/0302_proef.sql' && mig.bron === head && mig.commit, JSON.stringify(mig));
    const taak = v('taak:SAMEN-001');
    check('задача: коротка назва з опису й шлях до досьє', taak?.titel.uk === 'Облік авторства' && taak.pad === 'orchestratie/taken/SAMEN-001.json', JSON.stringify(taak));

    // 3. Маніфест: поле verwijzingen проходить перевірку, підроблені посилання відкидаються.
    const lijst = manifestVerwijzingen(r.verwijzingen);
    const ruw = {
      schema: 1, versie: '20261118-120000', aangemaakt: '2026-11-18T10:00:00Z', herkomst: 'Tarasevych/hub hoofd', auteur: 'Павло Тарасевич', zonderAi: false,
      deelnemers: [{ soort: 'ai', naam: 'claude', platform: 'Claude Code', tool: 'Claude Code', model: { id: 'claude-opus-5-5', versie: null, bron: 'omgeving' }, rollen: ['ontwikkeling'] }, { soort: 'mens', naam: 'Павло Тарасевич', rollen: ['auteur'] }],
      beschrijving: { uk: { titel: 'Спільний випуск', samenvatting: 'Посилання з назвами для кожної гілки й запиту.', wijzigingen: ['Посилання'], fixes: [], beperkingen: [], instructies: '' }, nl: { titel: 'Release', samenvatting: 'Verwijzingen met titels voor elke tak en PR.', wijzigingen: ['Verwijzingen'], fixes: [], beperkingen: [], instructies: '' } },
      bijdragen: [{ taakId: 'SAMEN-001', tijd: '2026-11-18T08:00:00Z', soort: 'nieuw', wie: { soort: 'ai', naam: 'claude', model: 'claude-opus-5-5' }, wat: { uk: 'Облік авторства й досьє функцій.' } }],
      verwijzingen: [...lijst, { soort: 'tak', id: 'a/../../etc', label: 'x', titel: { uk: 'зло' }, taken: [] }, { soort: 'pr', id: 'abc', label: '№x', titel: { uk: 'зло' }, taken: [] }, { soort: 'tak', id: 'feature/x', label: 'x', titel: { uk: 'x' }, commit: 'javascript:alert(1)', taken: [] }],
    };
    const { manifest, fouten } = valideerManifest(JSON.stringify(ruw), '20261118-120000');
    check('підроблені посилання (шлях із «..», номер-текст) мовчки відкидаються й не блокують встановлення', !!manifest && fouten.length === 0 && manifest.verwijzingen!.length === lijst.length + 1 && !manifest.verwijzingen!.some((x) => String(x.id).includes('..')), JSON.stringify(fouten));
    const m2 = valideerManifest(JSON.stringify({ ...ruw, verwijzingen: lijst }), '20261118-120000');
    check('чистий маніфест із посиланнями проходить без помилок', !!m2.manifest && m2.fouten.length === 0 && m2.manifest.verwijzingen!.length === lijst.length, JSON.stringify(m2.fouten));
    const m3 = valideerManifest(JSON.stringify({ ...ruw, verwijzingen: [...lijst, { soort: 'tak', id: 'feature/x', label: 'x', titel: { uk: 'Назва' }, commit: 'javascript:alert(1)', taken: [] }] }), '20261118-120000');
    check('коміт, що не є шістнадцятковим ідентифікатором, у посилання не потрапляє', !!m3.manifest && !m3.manifest.verwijzingen!.some((x) => String(x.commit ?? '').includes('javascript')));

    // 4. Показ: стан людськими словами, кнопки ведуть на запит, коміт чи останню версію, а не на видалену гілку.
    const vs = m2.manifest!.verwijzingen!;
    const delV = vs.find((x) => x.soort === 'tak' && x.id === 'feature/del-005')!;
    const tekst = staatTekst('uk', delV);
    check('текст для видаленої гілки: хто, причина без подвійної крапки, куди ввійшло, останній коміт', tekst.startsWith('Гілку видалив Павло Тарасевич') && tekst.includes('«Дубль, уся робота є в запиті №139»') && !tekst.includes('.».') && tekst.includes('Робота ввійшла в №139') && tekst.includes('лишається доступним'), tekst);
    const kn = verwijzingKnoppen('uk', delV).map((k) => k.href);
    check('кнопки видаленої гілки: останній коміт і запит, куди ввійшла робота; живої гілки немає', kn.includes(`https://github.com/Tarasevych/hub/tree/${tipWeg}`) && kn.includes('https://github.com/Tarasevych/hub/pull/139') && !kn.some((h) => h.includes('/tree/feature/')), JSON.stringify(kn));
    const openK = verwijzingKnoppen('uk', vs.find((x) => x.soort === 'tak' && x.id === 'feature/open-004')!).map((k) => k.href);
    check('жива гілка веде на саму гілку', openK.includes('https://github.com/Tarasevych/hub/tree/feature/open-004'));
    const prK = verwijzingKnoppen('uk', vs.find((x) => x.soort === 'pr' && x.id === 170)!).map((k) => k.href);
    check('злитий запит: запит, коміт злиття, остання версія гілки', prK[0] === 'https://github.com/Tarasevych/hub/pull/170' && prK.includes(`https://github.com/Tarasevych/hub/commit/${mergeWeg}`) && prK.includes(`https://github.com/Tarasevych/hub/tree/${tipWeg}`), JSON.stringify(prK));
    check('нідерландською — інший текст стану', staatTekst('nl', delV).startsWith('Tak verwijderd door'));
    const html = vs.map((x) => renderToStaticMarkup(createElement(VerwijzingRij, { lang: 'uk', v: x }))).join('');
    check('рядок посилання: позначка, людська назва й стан, а не голий номер', html.includes('data-ut-verwijzing="pr:160"') && html.includes('<b>№160</b><span class="ut-vw-titel">Облік авторства</span>') && html.includes('злито') && html.includes('гілку видалено'), html.slice(0, 300));
    check('немає слова «404», є пояснення, що дані збережено у випуску, і команда відновлення для видаленої гілки', !/(^|[^0-9a-f])404([^0-9a-f]|$)/.test(html) && html.includes('видно й без GitHub') && html.includes(`git switch -c feature/del-005 ${tipWeg.slice(0, 8)}`));
    const ub = readFileSync(join(WORTEL, 'src/uitrol/UitgaveBeschrijving.tsx'), 'utf8');
    check('«Хто що зробив» показує рядки посилань під задачею, а старі випуски без посилань — як раніше, посилання на запит', ub.includes('v.taken.includes(taak)') && ub.includes('{verwijzingen.length ? null : b.pr ?') && ub.includes("verwijzingen={m.verwijzingen ?? []}"));

    // 5. Справжній CLI: запис події, controleer бачить хибний запис, verwijzingen показує стан.
    const cli = join(tmp, 'cli'); mkdirSync(cli);
    for (const p of ['scripts', 'orchestratie', 'AGENTS.md', 'AGENTENREGELS.nl.md', 'package.json']) cpSync(join(WORTEL, p), join(cli, p), { recursive: true });
    sh(cli, 'init', '-q', '-b', 'werk'); sh(cli, 'config', 'user.email', 't@t'); sh(cli, 'config', 'user.name', 't'); sh(cli, 'add', '-A'); sh(cli, 'commit', '-q', '-m', 'basis');
    const run = (...a: string[]) => spawnSync('node', ['scripts/orch.mjs', ...a], { cwd: cli, encoding: 'utf8' });
    const w = run('verwijzing', '--soort', 'pr', '--id', '№129', '--gebeurtenis', 'gesloten', '--wie', 'Павло Тарасевич', '--waarom', 'Уся робота ввійшла у випуск UPD-002.', '--opgenomen-in', 'UPD-002', '--titel', 'Термін і скидання доступу ШІ', '--taak', 'TERMIJN-001');
    let bestanden: string[] = []; try { bestanden = readdirSync(join(cli, 'orchestratie/verwijzingen/pr-129')); } catch { /* перевірка нижче */ }
    check('CLI записує закриття запиту окремим файлом', w.status === 0 && bestanden.length === 1 && bestanden[0].endsWith('-gesloten.json'), w.stdout + w.stderr);
    const herhaal = run('verwijzing', '--soort', 'tak', '--id', 'feature/x', '--gebeurtenis', 'verwijderd', '--wie', 'Павло');
    check('CLI не записує видалення без причини й останнього коміту', herhaal.status === 1 && /VERWIJZING_WAAROM/.test(herhaal.stdout));
    const lijstCli = run('verwijzingen', '--json');
    const json = JSON.parse(lijstCli.stdout.split('\n').filter((l) => !/^(FOUT|LET OP|     nl:)/.test(l)).join('\n'));
    check('verwijzingen показує закритий запит із назвою й причиною', json.some((x: any) => x.soort === 'pr' && x.id === 129 && x.staat === 'gesloten' && x.titel.uk === 'Термін і скидання доступу ШІ' && x.opgenomenIn === 'UPD-002'), lijstCli.stdout.slice(0, 400));
    writeFileSync(join(cli, 'orchestratie/verwijzingen/pr-129/20990101-000000-verwijderd.json'), JSON.stringify({ schema: 1, soort: 'pr', id: 129, gebeurtenis: 'verwijderd', tijd: '2099-01-01T00:00:00Z', wie: { naam: 'x' } }));
    const c = run('controleer');
    check('controleer виявляє запис реєстру без причини', c.status !== 0 && /VERWIJZING_WAAROM/.test(c.stdout), c.stdout.slice(-400));
  } finally { rmSync(tmp, { recursive: true, force: true }); }

  // 6. Правила: видаляти гілку чи закривати запит лише із записом причини.
  const agents = readFileSync(join(WORTEL, 'AGENTS.md'), 'utf8'); const beleid = JSON.parse(readFileSync(join(WORTEL, 'orchestratie/beleid.json'), 'utf8'));
  check('AGENTS.md і beleid.json: перед видаленням гілки чи закриттям запиту — orch verwijzing', agents.includes('orch.mjs verwijzing') && beleid.verwijzingen?.map === 'orchestratie/verwijzingen');
  return einde();
}
