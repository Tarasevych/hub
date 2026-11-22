// KLIMOP-018 (21.11.2026): перша хвиля виправлень за незалежною перевіркою «Плюща» (GPT-6.2 Astra (Ультра))
// робіт KLIMOP-001–017 (Gemini 4 Carbon (High)); виправлення виконує Claude Opus 5.5 (High) у Google Antigravity.
//   1. Межа «клієнт ↔ сервер»: жоден власний модуль, досяжний від src/main.tsx, не імпортує вбудованих модулів Node.js
//      (вада: KlimopPaneel.tsx через shared/klimop/diensten.ts затягнув node:crypto, чисте складання падало з кодом 1);
//      негативний зразок у тимчасовій теці доводить, що перевірка справді ловить порушення.
//   2. Пошуковий покажчик актуальний, панель «Плюща» має доступ «technisch» і перехід #orch.
//   3. Спільна навичка movnyi-zakon у сховищі, у каталозі для всіх 14 агентів і в кожному перехіднику.
//   4. Облік авторства: запис «correctie» з полем corrigeert виправляє виконавця без редагування первинного запису;
//      сторінка оновлень і пакет випуску показують правильну модель і первинний запис як «було».
// KLIMOP-018 · Eerste herstelgolf na de onafhankelijke controle: browsergrens, zoekindex, taalvaardigheid, auteurscorrectie.
// Запуск: node scripts/eenheidstests.mjs klimop-018-klientbouw-zoek-taalvaardigheid-20261121.test.ts

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
// @ts-expect-error — JS-module zonder typen
import { klantServergrensFouten } from '../../scripts/klant-servergrens-controle.mjs';
// @ts-expect-error — JS-module zonder typen
import { valideerVaardigheden, adaptersZonderTaalwet, VERPLICHTE_VAARDIGHEDEN, TAALWET_VERWIJZING } from '../../scripts/vaardigheden/valideer.mjs';
// @ts-expect-error — JS-module zonder typen
import { maakBijdrage, valideerBijdrage, pasCorrectiesToe, bijdragenTijdlijn, deelnemersUitBijdragen, manifestBijdragen } from '../../scripts/orch/bijdragen.mjs';
import { KLIMOP_ELF_DIENSTEN, isKlimopDienstId } from '../../shared/klimop/diensten-catalogus';
import * as dienstenServer from '../../shared/klimop/diensten';

const WORTEL = process.cwd();
const VERBODEN_LETTERS = new RegExp(`[${[0x401, 0x451, 0x42a, 0x44a, 0x42b, 0x44b, 0x42d, 0x44d].map((c) => String.fromCodePoint(c)).join('')}]`);
const lees = (rel: string) => readFileSync(join(WORTEL, rel), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-018');

  // 1. Межа клієнта.
  const fouten = await klantServergrensFouten({ wortel: WORTEL });
  check('від src/main.tsx жоден власний модуль не імпортує вбудованих модулів Node.js', fouten.length === 0, JSON.stringify(fouten));
  const paneel = lees('src/agenten/KlimopPaneel.tsx');
  const klant = lees('src/klimop/klimop-klant.ts');
  check('KlimopPaneel.tsx і klimop-klant.ts беруть перелік служб із чистого diensten-catalogus',
    /from '\.\.\/\.\.\/shared\/klimop\/diensten-catalogus'/.test(paneel) && /from '\.\.\/\.\.\/shared\/klimop\/diensten-catalogus'/.test(klant)
    && !/shared\/klimop\/diensten'/.test(paneel) && !/shared\/klimop\/diensten'/.test(klant));
  const catalogusBron = lees('shared/klimop/diensten-catalogus.ts');
  check('diensten-catalogus.ts не має жодного імпорту', !/^\s*import\s/m.test(catalogusBron));
  check('серверний diensten.ts повторно експортує той самий перелік (одне джерело правди)',
    (dienstenServer as any).KLIMOP_ELF_DIENSTEN === KLIMOP_ELF_DIENSTEN && KLIMOP_ELF_DIENSTEN.length === 11);
  check('isKlimopDienstId розрізняє відомі й чужі служби', isKlimopDienstId(KLIMOP_ELF_DIENSTEN[0]) && !isKlimopDienstId('onbekend'));
  check('npm run build запускає перевірку межі перед vite build',
    /klant-servergrens-controle\.mjs[^"]*&&\s*vite build|klant-servergrens-controle\.mjs[\s\S]*vite build/.test(JSON.parse(lees('package.json')).scripts.build));

  const tmp = mkdtempSync(join(tmpdir(), 'klimop-018-grens-'));
  try {
    mkdirSync(join(tmp, 'src'), { recursive: true });
    mkdirSync(join(tmp, 'shared'), { recursive: true });
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'zrazok', dependencies: { buffer: '6.0.3' } }));
    writeFileSync(join(tmp, 'shared/server.ts'), "import { createHash } from 'node:crypto';\nexport const h = (s: string) => createHash('sha256').update(s).digest('hex');\n");
    writeFileSync(join(tmp, 'shared/schoon.ts'), "import { Buffer } from 'buffer';\nexport const b = Buffer.from('a');\n");
    writeFileSync(join(tmp, 'src/main.tsx'), "import { h } from '../shared/server';\nimport { b } from '../shared/schoon';\nconsole.log(h('x'), b);\n");
    const neg = await klantServergrensFouten({ wortel: tmp });
    check('негативний зразок: імпорт node:crypto з досяжного модуля виявлено', neg.length === 1 && neg[0].module === 'node:crypto' && neg[0].importeur === join('shared', 'server.ts'), JSON.stringify(neg));
    check('клієнтський заміник із package.json (buffer) не вважається порушенням', !neg.some((f: any) => f.module === 'buffer'));
    const cli = spawnSync(process.execPath, [join(WORTEL, 'scripts/klant-servergrens-controle.mjs'), '--stil'], { cwd: tmp, encoding: 'utf8' });
    check('інструмент командного рядка завершується з кодом 1 при порушенні', cli.status === 1, String(cli.status));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // 2. Пошуковий покажчик.
  const zoek = spawnSync(process.execPath, [join(WORTEL, 'scripts/zoek-ui-catalogus.mjs'), '--controle'], { cwd: WORTEL, encoding: 'utf8' });
  check('пошуковий покажчик актуальний (zoek-ui-catalogus --controle, код 0)', zoek.status === 0, `${zoek.status} ${zoek.stdout}${zoek.stderr}`.slice(0, 400));
  const regels = lees('shared/zoek-ui-knoppen.generated.ts').split('\n').filter((r) => r.includes('src/agenten/KlimopPaneel.tsx'));
  check('елементи панелі «Плюща» є в покажчику', regels.length > 0);
  check('усі елементи панелі мають доступ technisch і перехід #orch',
    regels.length > 0 && regels.every((r) => r.includes('\\"toegang\\":\\"technisch\\"') && r.includes('\\"hash\\":\\"orch\\"')), regels.slice(0, 2).join('\n'));

  // 3. Навичка мовного закону.
  check('файли навички movnyi-zakon є (SKILL.md і VAARDIGHEID.nl.md)',
    existsSync(join(WORTEL, TAALWET_VERWIJZING)) && existsSync(join(WORTEL, '.agents/skills/movnyi-zakon/VAARDIGHEID.nl.md')));
  const cat = JSON.parse(lees('scripts/vaardigheden/catalogus.json'));
  const lijst: any[] = Array.isArray(cat) ? cat : (cat.vaardigheden ?? []);
  const mz = lijst.find((v: any) => v?.naam === 'movnyi-zakon' || v?.id === 'movnyi-zakon');
  const agentIds: string[] = JSON.parse(lees('orchestratie/beleid.json')).agenten.map((a: any) => a.id);
  check('каталог містить movnyi-zakon', Boolean(mz));
  check('movnyi-zakon доступна всім агентам із beleid.json', Boolean(mz) && agentIds.length >= 14 && agentIds.every((id) => JSON.stringify(mz).includes(`"${id}"`)), agentIds.join(','));
  check('обов\'язкові навички: movnyi-zakon, klimop-architectuur, bijdragen-vastleggen',
    ['movnyi-zakon', 'klimop-architectuur', 'bijdragen-vastleggen'].every((n) => VERPLICHTE_VAARDIGHEDEN.includes(n)));
  const v = valideerVaardigheden(WORTEL);
  check('перевіряльник навичок без помилок', (v.fouten ?? []).length === 0, JSON.stringify(v.fouten));
  check('кожен перехідник агента посилається на спільну навичку мовного закону', adaptersZonderTaalwet(WORTEL).length === 0, adaptersZonderTaalwet(WORTEL).join('; '));
  const skill = lees(TAALWET_VERWIJZING) + lees('.agents/skills/movnyi-zakon/VAARDIGHEID.nl.md');
  check('тексти навички не містять заборонених літер', !VERBODEN_LETTERS.test(skill));
  check('ресурс MCP mr://skills/movnyi-zakon посилається на SKILL.md', lees('shared/mcp-protocol-2026-model.ts').includes(TAALWET_VERWIJZING));

  // 4. Виправлення авторства.
  const basis = {
    taakId: 'TEST-018', agent: 'antigravity', platform: 'Google Antigravity', modelBron: 'omgeving', opdrachtgever: 'Тарасевич Павло',
  };
  const eerste = maakBijdrage({ ...basis, tijd: '2026-11-20T10:00:00Z', modelId: 'Gemini 3.1 Pro', soort: 'nieuw', watUk: 'Перший етап екосистеми, створено основу служб.' }).bijdrage;
  const juist = { soort: 'ai', agent: 'antigravity', platform: 'Google Antigravity', model: { id: 'Gemini 4 Carbon (High)', bron: 'eigenaar' } };
  const corr = maakBijdrage({
    ...basis, tijd: '2026-11-21T14:31:00Z', modelId: 'Claude Opus 5.5 (High)', modelBron: 'eigenaar', soort: 'correctie',
    watUk: 'Виправлено виконавця першого етапу в обліку авторства.', waaromUk: 'Власник підтвердив справжню модель.',
    bouwtVoortOp: [eerste.id], bekendeIds: new Set([eerste.id]), corrigeert: { bijdragen: [eerste.id], uitvoerder: juist },
  });
  check('правильний запис виправлення проходить перевірку', corr.zaken.length === 0, JSON.stringify(corr.zaken));
  const zonderOp = valideerBijdrage({ ...corr.bijdrage, bouwtVoortOp: ['TEST-018/20261120-100000-iets-anders'] });
  check('виправлений запис має бути в bouwtVoortOp', zonderOp.some((z: any) => z.code === 'BIJDRAGE_CORRIGEERT'));
  check('corrigeert заборонене поза видом «correctie»', valideerBijdrage({ ...corr.bijdrage, soort: 'herwerkt' }).some((z: any) => z.code === 'BIJDRAGE_CORRIGEERT'));
  check('невідомий виправлений запис відхиляється', valideerBijdrage(corr.bijdrage, { bekendeIds: new Set() }).some((z: any) => z.code === 'BIJDRAGE_CORRIGEERT_ONBEKEND'));
  check('лише назва родини як правильна модель відхиляється',
    valideerBijdrage({ ...corr.bijdrage, corrigeert: { bijdragen: [eerste.id], uitvoerder: { ...juist, model: { id: 'Gemini', bron: 'eigenaar' } } } }).some((z: any) => z.code === 'BIJDRAGE_CORRIGEERT_UITVOERDER'));

  const voor = JSON.stringify(eerste);
  const toegepast = pasCorrectiesToe([eerste, corr.bijdrage]);
  check('первинний запис не змінюється (лише копія)', JSON.stringify(eerste) === voor);
  const e2 = toegepast.find((b: any) => b.id === eerste.id);
  check('копія має правильну модель, «було» і посилання на виправлення',
    e2.uitvoerder.model.id === 'Gemini 4 Carbon (High)' && e2.eerderGeregistreerd.model.id === 'Gemini 3.1 Pro' && e2.gecorrigeerdDoor === corr.bijdrage.id);
  const tl = bijdragenTijdlijn([eerste, corr.bijdrage]);
  check('хронологія показує Gemini 4 Carbon (High) і первинний запис', tl[0].wie.includes('Gemini 4 Carbon (High)') && tl[0].eerderGeregistreerd.includes('Gemini 3.1 Pro'));
  const dn = deelnemersUitBijdragen([eerste, corr.bijdrage]);
  const gemini = dn.find((d: any) => d.model?.id === 'Gemini 4 Carbon (High)');
  const claude = dn.find((d: any) => d.model?.id === 'Claude Opus 5.5 (High)');
  check('учасники випуску: Gemini 4 Carbon (High) — розробка, Claude Opus 5.5 (High) — перевірка, хибної моделі немає',
    gemini?.rollen.includes('ontwikkeling') && gemini?.model.bron === 'auteur' && claude?.rollen.includes('controle') && !dn.some((d: any) => d.model?.id === 'Gemini 3.1 Pro'));
  const mb = manifestBijdragen([eerste, corr.bijdrage]);
  check('маніфест випуску: правильна модель і поле eerderGeregistreerd', mb[0].wie.model === 'Gemini 4 Carbon (High)' && mb[0].eerderGeregistreerd?.model === 'Gemini 3.1 Pro');

  // Справжні записи сховища: 17 виправлень і запис незалежної перевірки.
  const map = join(WORTEL, 'orchestratie/bijdragen');
  const alle: any[] = [];
  for (const t of readdirSync(map)) for (const f of readdirSync(join(map, t))) if (f.endsWith('.json')) alle.push(JSON.parse(readFileSync(join(map, t, f), 'utf8')));
  const ids = new Set(alle.map((b) => b.id));
  const echt = pasCorrectiesToe(alle);
  const klimop = echt.filter((b: any) => /^KLIMOP-0(0[1-9]|1[0-7])$/.test(b.taakId) && b.soort !== 'correctie');
  check('усі первинні записи KLIMOP-001–017 після виправлень показують Gemini 4 Carbon (High)',
    klimop.length >= 17 && klimop.every((b: any) => b.uitvoerder.model.id === 'Gemini 4 Carbon (High)'), klimop.map((b: any) => b.uitvoerder.model.id).join(','));
  const audit = alle.find((b) => b.taakId === 'AUDIT-002');
  check('запис незалежної перевірки AUDIT-002: GPT-6.2 Astra (Ультра), вид «controle», модель підтверджена власником',
    audit?.soort === 'controle' && audit?.uitvoerder.model.id === 'GPT-6.2 Astra (Ультра)' && audit?.uitvoerder.model.bron === 'eigenaar');
  const nieuweFouten = alle.filter((b) => b.taakId === 'AUDIT-002' || (b.soort === 'correctie' && b.corrigeert))
    .flatMap((b) => valideerBijdrage(b, { pad: `orchestratie/bijdragen/${b.id}.json`, bekendeIds: ids }));
  check('нові записи обліку проходять перевірку', nieuweFouten.length === 0, JSON.stringify(nieuweFouten).slice(0, 400));

  // Мовна перевірка нових і змінених файлів хвилі.
  const bestanden = ['shared/klimop/diensten-catalogus.ts', 'scripts/klant-servergrens-controle.mjs', 'scripts/vaardigheden/valideer.mjs',
    'scripts/orch/bijdragen.mjs', 'scripts/orch/begin.mjs', 'src/uitrol/UitgaveBeschrijving.tsx', 'shared/uitrol-manifest.ts'];
  const overtredingen = bestanden.filter((b) => VERBODEN_LETTERS.test(lees(b)));
  check('нові та змінені файли без заборонених літер', overtredingen.length === 0, overtredingen.join(', '));

  return einde();
}
