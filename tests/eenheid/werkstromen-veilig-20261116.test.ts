// БЕЗПЕКА ПРОЦЕСІВ GITHUB ACTIONS (SEC-PAKKET-001, 16.11.2026). Без браузера й бази.
// VEILIGHEID VAN DE GITHUB-WERKSTROMEN. Zonder browser en zonder database.
//
// Привід: кампанія wfx-loot (листопад 2026) крала секрети й токени з процесів GitHub Actions через тригери з правами
// на чужий код, незакріплені сторонні дії та скрипти встановлення пакетів. Аудит 16.11 показав, що наші нові процеси
// захищені, а старі мали слабші місця (дії за тегом @v4, npm зі скриптами, токен у .git/config після checkout).
// Їх виправлено; ця перевірка не дає слабким процесам з'явитися знову (новий процес часто копіюють зі старого).
//
// Правила для кожного .github/workflows/*.yml:
//   1. Немає тригерів, які запускають процес із правами репозиторію на чужому коді: pull_request_target,
//      workflow_run, issue_comment.
//   2. Процес не читає секретів репозиторію (secrets.*): збірка й випуск обходяться токеном github.token.
//   3. Кожна дія закріплена за повним хешем коміту (40 знаків), не за тегом, який можна пересунути.
//   4. npm ci / npm install — лише з --ignore-scripts (скрипти встановлення пакета не бачать токена).
//   5. Кожен checkout має persist-credentials: false (токен не лишається в .git/config для наступних кроків).
//   6. Процес оголошує права верхнього рівня; contents: write на весь процес — лише з обґрунтованого переліку.
//   7. Текст PR/issue (title, body, head_ref) не підставляється прямо в команди.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

// Процеси з одним кроком, де запис потрібен на весь процес (публікація в тому самому кроці). Нові процеси так не роблять:
// запис лише в окремому кроці публікації, після перевірок.
const SCHRIJVEN_OP_WERKSTROOMNIVEAU: Record<string, string> = {
  'mcp-001-uitgave.yml': 'одна задача з публікацією; npm без скриптів, checkout без збереженого токена; гілка завершена 12.11.2026',
};

export async function main(): Promise<number> {
  const { check, einde } = checker('werkstromen-veilig-20261116');
  const map = '.github/workflows';
  const bestanden = readdirSync(map).filter((n) => /\.ya?ml$/.test(n)).sort();
  check(`знайдено процеси GitHub Actions (${bestanden.length})`, bestanden.length > 0);

  const fout: Record<string, string[]> = { trigger: [], secrets: [], pin: [], npm: [], persist: [], rechten: [], injectie: [] };
  for (const naam of bestanden) {
    const tekst = readFileSync(join(map, naam), 'utf8');
    const L = tekst.split('\n');
    if (/^\s{0,4}(pull_request_target|workflow_run|issue_comment)\s*:/m.test(tekst)) fout.trigger.push(naam);
    if (/\$\{\{\s*secrets\./.test(tekst)) fout.secrets.push(naam);
    L.forEach((r, i) => {
      const u = /^\s*-?\s*uses:\s*([^\s#]+)/.exec(r);
      if (u && !u[1].startsWith('./') && !/@[0-9a-f]{40}$/.test(u[1])) fout.pin.push(`${naam}:${i + 1} ${u[1]}`);
      if (/\bnpm\s+(ci|install|i)\b/.test(r) && !/--ignore-scripts/.test(r) && !/^\s*#/.test(r)) fout.npm.push(`${naam}:${i + 1}`);
      if (/uses:\s*actions\/checkout@/.test(r)) {
        const insp = (L[i + 1] ?? '').match(/^\s*/)![0] + '  ';
        let j = i + 2, ok = false;
        while (j < L.length && L[j].startsWith(insp)) { if (/persist-credentials:\s*false/.test(L[j])) ok = true; j++; }
        if (!/^\s*with:\s*$/.test(L[i + 1] ?? '') || !ok) fout.persist.push(`${naam}:${i + 1}`);
      }
      if (/\$\{\{\s*github\.(head_ref|event\.(pull_request|issue|comment|review)\.(title|body|head\.ref|head\.label))/.test(r)) fout.injectie.push(`${naam}:${i + 1}`);
    });
    const top = /^permissions:\s*\n((?:[ \t]+.*\n?)*)/m.exec(tekst);
    if (!top) fout.rechten.push(`${naam}: немає прав верхнього рівня`);
    else if (/contents:\s*write/.test(top[1]) && !SCHRIJVEN_OP_WERKSTROOMNIVEAU[naam]) fout.rechten.push(`${naam}: contents: write на весь процес`);
  }

  const toon = (x: string[]) => (x.length ? x.slice(0, 15).join('; ') : '');
  check('1. немає pull_request_target / workflow_run / issue_comment', !fout.trigger.length, toon(fout.trigger));
  check('2. жоден процес не читає секретів репозиторію (secrets.*)', !fout.secrets.length, toon(fout.secrets));
  check('3. кожна дія закріплена за повним хешем коміту', !fout.pin.length, toon(fout.pin));
  check('4. npm ci / install лише з --ignore-scripts', !fout.npm.length, toon(fout.npm));
  check('5. кожен checkout має persist-credentials: false', !fout.persist.length, toon(fout.persist));
  check('6. права верхнього рівня оголошено; запис на весь процес лише з переліку', !fout.rechten.length, toon(fout.rechten));
  check('7. текст PR/issue не підставляється в команди', !fout.injectie.length, toon(fout.injectie));
  check('перелік винятків не містить процесів, яких уже немає', Object.keys(SCHRIJVEN_OP_WERKSTROOMNIVEAU).every((n) => bestanden.includes(n)));
  return einde();
}
