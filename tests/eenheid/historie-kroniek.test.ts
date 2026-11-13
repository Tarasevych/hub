// HISTORIE-001: хронологія гілок лише доповнюється, кожна робота має попередника й наступника, Task ID розпізнається й кирилицею.
// HISTORIE-001: de kroniek wordt alleen aangevuld; elke taak heeft voorganger en opvolger; Oekraïense taak-ID's worden herkend.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { checker } from './hulp/nep-google';
// @ts-expect-error — JS-module zonder typen
import { aanvullen, maakZnimok, kop, taakUitOnderwerp, leesArgumenten } from '../../scripts/geschiedenis/kroniek.mjs';

type Werk = Record<string, unknown>;
const werk = (id: string, extra: Werk = {}): Werk => ({
  id, agent: 'claude', staat: 'in_progress', gestart: '2026-11-10', tak: `feature/${id.toLowerCase()}-20261110-000000`, takken: [],
  top: 'a'.repeat(40), topDatum: '2026-11-10', basis: 'b'.repeat(40), basisVersie: '20261105-061659', basisTags: [], basisIn: ['integratie'],
  omschrijving: 'Опис роботи.', prs: [], voorganger: null, voorgangerExact: false,
  in: { integratie: true, live: true, voornaamst: false }, uitgaven: [], opvolgers: [], ...extra,
});
const model = (werken: Werk[], extra: Werk = {}) => ({
  datum: '2026-11-13', live: 'c'.repeat(40), liveVersie: '20261113-121403', integratie: 'd'.repeat(40), voornaamst: 'e'.repeat(40),
  werken, zonderTaak: [], rozriv: [{ id: 'SEC-002', commits: [{ sha: '1234567', datum: '2026-11-12', onderwerp: 'SEC-002: виправлення' }] }],
  tellingen: { naarLive: '1', naarIntegratie: '0', integratieNaarLive: '1' }, aantalTakken: 3, ...extra,
});

export async function main(): Promise<number> {
  const { check, einde } = checker('historie-kroniek');

  // 1. Task ID із теми коміту: латиниця, українська назва, без ідентифікатора.
  check('Task ID розпізнається з латинської теми', taakUitOnderwerp('SEC-002: справжній Chrome') === 'SEC-002');
  check('українська назва ІДЕНТИЧНІСТЬ-004 зводиться до IDENTITEIT-004', taakUitOnderwerp('ІДЕНТИЧНІСТЬ-004 · усунуто повтори') === 'IDENTITEIT-004');
  check('тема без ідентифікатора не вигадує роботу', taakUitOnderwerp('chore: remove placeholder environment variables') === null);
  let fout = '';
  try { leesArgumenten([]); } catch (e) { fout = String(e); }
  check('без живої версії генератор не запускається (не вгадує основу)', fout.includes('--live'));

  // 2. Перший запуск: шапка, знімок, кожна робота з попередником і наступником, двомовність.
  const a = werk('IDENTITEIT-006', { opvolgers: ['IDENTITEIT-007'] });
  const b = werk('IDENTITEIT-007', { top: 'f'.repeat(40), voorganger: 'IDENTITEIT-006', voorgangerExact: true });
  const m1 = model([a, b]);
  const uk1 = aanvullen('', m1, 'uk');
  const nl1 = aanvullen('', m1, 'nl');
  check('шапка документа обома мовами з взаємними посиланнями', uk1.startsWith(kop('uk')) && uk1.includes('KRONIEK-TAKKEN.nl.md') && nl1.includes('ХРОНОЛОГІЯ-ГІЛОК.uk.md'));
  check('кожна робота має «← Попередник» і «→ Наступник»', (uk1.match(/- \*\*← Попередник:\*\*/g) || []).length === 2 && (uk1.match(/- \*\*→ Наступник:\*\*/g) || []).length === 2);
  check('нідерландська версія має «← Voorganger» і «→ Opvolger»', nl1.includes('← Voorganger') && nl1.includes('→ Opvolger'));
  check('посилання на попередню й наступну роботу ведуть на якорі', uk1.includes('[IDENTITEIT-006](#t-identiteit-006)') && uk1.includes('[IDENTITEIT-007](#t-identiteit-007)') && uk1.includes('<a id="t-identiteit-007"></a>'));
  check('розрив voornaamst ↔ жива версія пояснено, оновлення — лише власник', uk1.includes('Розрив `voornaamst`') && uk1.includes('лише власник'));

  // 3. Повторний запуск із тими самими даними нічого не змінює.
  check('повторний запуск без нових даних — без змін', aanvullen(uk1, m1, 'uk') === uk1 && maakZnimok(m1, 'uk', uk1) === '');

  // 4. Нова вершина гілки або нова робота дописуються в кінець; старий текст лишається байт-у-байт.
  const b2 = { ...b, top: '9'.repeat(40), topDatum: '2026-11-11' };
  const c = werk('IDENTITEIT-011', { gestart: '2026-11-13', voorganger: 'IDENTITEIT-007' });
  const m2 = model([a, b2, c], { datum: '2026-11-14' });
  const uk2 = aanvullen(uk1, m2, 'uk');
  check('доповнення починається зі старого тексту без змін', uk2.startsWith(uk1.replace(/\s*$/, '')));
  check('дописано новий знімок із новою вершиною й новою роботою', uk2.includes('## Знімок 2026-11-14') && uk2.includes(`k:IDENTITEIT-007@${'9'.repeat(40)}`) && uk2.includes('k:IDENTITEIT-011@'));
  check('незмінну роботу не дублюється', (uk2.match(/k:IDENTITEIT-006@/g) || []).length === 1);
  check('якір роботи не повторюється у новому знімку', (uk2.match(/<a id="t-identiteit-007"><\/a>/g) || []).length === 1);
  check('розрив з тими самими комітами не дублюється', (uk2.match(/### Розрив/g) || []).length === 1);

  // 5. Документи в репозиторії: кожна робота з orchestratie/taken має запис, обидві мови.
  const ukDoc = 'docs/hub/ХРОНОЛОГІЯ-ГІЛОК.uk.md', nlDoc = 'docs/hub/KRONIEK-TAKKEN.nl.md';
  check('хронологія є обома мовами', existsSync(ukDoc) && existsSync(nlDoc));
  if (existsSync(ukDoc) && existsSync(nlDoc)) {
    const uk = readFileSync(ukDoc, 'utf8'), nl = readFileSync(nlDoc, 'utf8');
    const ids = readdirSync('orchestratie/taken').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    const mis = ids.filter((id) => !uk.includes(`k:${id}@`) || !nl.includes(`k:${id}@`));
    check('кожна робота з orchestratie/taken має запис у хронології', mis.length === 0, mis.join(', '));
    const blokken = uk.split(/\n#### /).slice(1).filter((x) => x.includes('<!-- k:'));
    check('у кожному записі є попередник і наступник', blokken.length > 0 && blokken.every((x) => x.includes('← Попередник') && x.includes('→ Наступник')));
  }
  return einde();
}
