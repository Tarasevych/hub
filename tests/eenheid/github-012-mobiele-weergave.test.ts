// Модульний і структурний тест GITHUB-012: повна адаптація мобільної, планшетної та настільної версій https://github.tarasevych.com/
// у всіх 13 розділах і просторах (prive / technisch).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORTEL = process.cwd();
const lees = (pad: string) => readFileSync(join(WORTEL, pad), 'utf8');

let geslaagd = 0;
function test(naam: string, fn: () => void) {
  fn();
  geslaagd += 1;
  console.log(`  ✓ ${naam}`);
}

console.log('GITHUB-012 · перевірка повної мобільної та адаптивної версії розділу GitHub');

const css = lees('src/github-weergave.css');
const weergave = lees('src/GitHubWeergave.tsx');
const codePaneel = lees('src/github/CodeEnEditorPaneel.tsx');
const eenklikPaneel = lees('src/github/EenklikKoppelPaneel.tsx');
const actiesPaneel = lees('src/github/ActiesEnUitgavenPaneel.tsx');
const zakenPaneel = lees('src/github/ZakenEnSamenvoegingenPaneel.tsx');
const spiegelPaneel = lees('src/github/SpiegelEnBrugPaneel.tsx');
const clientHulp = lees('src/github/github-client.tsx');

test('1. Контейнер .gh-root має container-type:inline-size та @container запити для планшетів і відкритої бічної панелі', () => {
  assert.ok(css.includes('container-type:inline-size;container-name:gh-root'), 'Очікувався container-type:inline-size на .gh-root');
  assert.ok(css.includes('@container gh-root (max-width: 820px)'), 'Очікувався @container запит 820px');
  assert.ok(css.includes('@container gh-root (max-width: 620px)'), 'Очікувався @container запит 620px');
  assert.ok(css.includes('@media (max-width:860px)'), 'Очікувався @media запит 860px');
  assert.ok(css.includes('@media (max-width:700px)'), 'Очікувався @media запит 700px');
  assert.ok(css.includes('@media (max-width:420px)'), 'Очікувався @media запит 420px');
});

test('2. Захист карток .gh-card та списків <select> від глобального правила flat-content у canoniek-omlijsting.css', () => {
  assert.ok(
    css.includes(".canonical-chrome[data-surface-model='flat-content'] .canonical-content .gh-root :is(.gh-card,.gh-me"),
    'Картки .gh-card та .gh-me мають бути захищені від скидання бічних рамок правилом flat-content',
  );
  assert.ok(
    css.includes('.canonical-chrome .gh-root .gh-select-wikkel select:not([multiple]):not([size])'),
    'Елемент <select> у .gh-select-wikkel має бути захищений від подвійної рамки',
  );
});

test('3. Навігаційна стрічка GhAfdelingNav охоплює всі 13 розділів GitHub і захищена від випадкового свайпу меню', () => {
  const verwachteAfdelingen = [
    'overview', 'repositories', 'code', 'issues', 'pulls', 'actions',
    'releases', 'sync', 'projects', 'documentation', 'research', 'activity', 'accounts',
  ];
  for (const afd of verwachteAfdelingen) {
    assert.ok(weergave.includes(`['${afd}',`), `Розділ ${afd} має бути присутнім у GhAfdelingNav`);
  }
  assert.ok(weergave.includes('<nav className="gh-snel-nav" data-no-edge-swipe'), 'Навігація має містити data-no-edge-swipe');
});

test('4. Мобільне перемикання панелей працює у провіднику коду та двоколонкових вкладках «Сховища» і «Документація»', () => {
  assert.ok(
    codePaneel.includes("gh-boom-kolom${mobielPaneel !== 'boom' ? ' is-verborgen-mobiel' : ''}"),
    'Ліва колонка дерева файлів має отримувати клас is-verborgen-mobiel',
  );
  assert.ok(
    codePaneel.includes("gh-bestand-kolom${mobielPaneel !== 'bestand' ? ' is-verborgen-mobiel' : ''}"),
    'Права колонка перегляду/редактора має отримувати клас is-verborgen-mobiel',
  );
  assert.ok(
    weergave.includes("gh-split-lijst${splitMobielPaneel !== 'lijst' ? ' is-verborgen-mobiel' : ''}"),
    'Список сховищ у .gh-split має отримувати клас is-verborgen-mobiel',
  );
  assert.ok(
    weergave.includes("gh-split-detail${splitMobielPaneel !== 'detail' ? ' is-verborgen-mobiel' : ''}"),
    'Панель деталей сховища у .gh-split має отримувати клас is-verborgen-mobiel',
  );
});

test('5. Перемикач переносу довгих рядків коду та захист прокручуваних блоків (data-no-edge-swipe)', () => {
  assert.ok(codePaneel.includes('regelTerugloop'), 'Провідник коду має підтримувати перемикач переносу рядків');
  assert.ok(css.includes('.gh-code-tabel.is-terugloop .gh-code-regel'), 'CSS має підтримувати клас .is-terugloop для коду');
  assert.ok(css.includes('.gh-diff-tabel.is-terugloop .gh-diff-tekst'), 'CSS має підтримувати клас .is-terugloop для різниці змін');
  assert.ok(codePaneel.includes('className="gh-code-tabel-wikkel" data-no-edge-swipe'), 'Таблиця коду має містити data-no-edge-swipe');
  assert.ok(clientHulp.includes('className="gh-diff-wikkel" data-no-edge-swipe'), 'Таблиця diff має містити data-no-edge-swipe');
  assert.ok(actiesPaneel.includes('className="gh-logboek-vak" data-no-edge-swipe'), 'Журнал конвеєра має містити data-no-edge-swipe');
});

test('6. Виправлено оформлення деталей задачі/злиття (.gh-zaak-inhoud), міток (.is-actief), повідомлень фіксацій та коду пристрою', () => {
  assert.ok(css.includes('.gh-zaak-inhoud{display:grid;gap:12px;min-width:0'), '.gh-zaak-inhoud має бути сітковим контейнером із відступами');
  assert.ok(css.includes('.gh-label-knop.is-on,.gh-label-knop.is-actief'), '.gh-label-knop має підтримувати .is-actief');
  assert.ok(css.includes('.gh-kleur-knop.is-on,.gh-kleur-knop.is-actief'), '.gh-kleur-knop має підтримувати .is-actief');
  assert.ok(css.includes('.gh-commit-bericht{'), 'Має бути стиль для .gh-commit-bericht із переносом рядків');
  assert.ok(css.includes('.gh-diff-bestand>summary{'), 'Має бути стиль для заголовка розгортання файла .gh-diff-bestand>summary');
  assert.ok(eenklikPaneel.includes('className="gh-apparaatcode-rij"'), 'Код пристрою та кнопка копіювання мають бути розділені в .gh-apparaatcode-rij');
  assert.ok(weergave.includes("String(r.sha || '').slice(0, 7)"), '40-символьний SHA у списку запусків CI має бути скорочений до 7 символів');
});

test('7. Дотримання мовного закону (відсутність заборонених несловникових літер у всіх файлах розділу GitHub)', () => {
  const verboden = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  for (const [naam, inhoud] of [
    ['src/github-weergave.css', css],
    ['src/GitHubWeergave.tsx', weergave],
    ['src/github/CodeEnEditorPaneel.tsx', codePaneel],
    ['src/github/EenklikKoppelPaneel.tsx', eenklikPaneel],
    ['src/github/ActiesEnUitgavenPaneel.tsx', actiesPaneel],
    ['src/github/ZakenEnSamenvoegingenPaneel.tsx', zakenPaneel],
    ['src/github/SpiegelEnBrugPaneel.tsx', spiegelPaneel],
    ['src/github/github-client.tsx', clientHulp],
  ] as const) {
    assert.ok(!verboden.test(inhoud), `Виявлено заборонені символи у файлі ${naam}`);
  }
});

console.log(`Усі перевірки GITHUB-012 пройдено успішно (${geslaagd}).`);

export async function main(): Promise<number> {
  return 0;
}

