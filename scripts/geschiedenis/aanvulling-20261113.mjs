#!/usr/bin/env node
// HISTORIE-001: одноразове доповнення оглядових документів станом на 13.11.2026 (жива версія 20261113-121403).
// Текст лише дописується в кінець файлу з позначкою; повторний запуск нічого не змінює. Наявний текст не чіпається.
// HISTORIE-001: eenmalige aanvulling van de overzichtsdocumenten; alleen achteraan toevoegen, met markering; herhaalbaar zonder effect.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MARK = '<!-- HISTORIE-001:aanvulling-20261113 -->';
const R = 'https://github.com/Tarasevych/hub';
const prs = JSON.parse(fs.readFileSync(path.join(WORTEL, 'scripts/geschiedenis/samenvoegverzoeken.json'), 'utf8')).verzoeken;

// Етап VII: стислий підсумок робіт між 05.11 і 13.11.2026 (джерело — orchestratie/taken і хронологія).
const ETAP = [
  ['IDENTITEIT-003…007, MOBIEL-001', '07–09.11', 'центр облікового запису: оформлення з безпечним поверненням, версія 49, «Студія», вигляд «Макет» за дизайном власника, адаптація до смартфонів', 'accountcentrum: vormgeving met veilige terugkeer, versie 49, «Studio», weergave «Ontwerp» naar het ontwerp van de eigenaar, aanpassing aan smartphones'],
  ['TRACE-002, UITROL-001, PERF-001', '08–09.11', 'захищене походження пакетів, модернізоване оновлення з пробою міграцій, швидший старт сторінок', 'beschermde herkomst van pakketten, vernieuwde update met proefmigraties, snellere paginastart'],
  ['APPARAAT-001, TELEGRAM-001', '09.11', 'підтвердження з іншого пристрою, вхід і підтвердження через Telegram, розміщення способів входу', 'bevestigen vanaf een ander apparaat, aanmelden en bevestigen via Telegram, plaatsing van aanmeldmethoden'],
  ['MAILBG-001, MAILSCAN-002', '09–10.11', 'рухоме тло пошти з лінзою, добровільна перевірка адрес', 'bewegende mailachtergrond met lens, vrijwillige adrescontrole'],
  ['HUIS-001', '10–12.11', 'розумний будинок «Живий дім»: специфікація і клікабельний макет', 'slim huis «Levend huis»: specificatie en klikbaar ontwerp'],
  ['IDENTITEIT-008…010', '11–12.11', 'меню облікового запису v3, мобільна адаптація трьох виглядів, цілісний вхід на всіх піддоменах', 'accountmenu v3, mobiele aanpassing van drie weergaven, samenhangend aanmelden op alle subdomeinen'],
  ['GITHUB-010…012, CLOUD-001', '11–12.11', 'двостороннє середовище GitHub і його адаптація, завантаження тек і спільний доступ у хмарі', 'tweerichtings-GitHub-omgeving en aanpassing, mappen uploaden en delen in de cloud'],
  ['MCP-001', '12.11', 'підтримка MCP 2026-07-28 і 2025-11-25, безпека OAuth 2.1', 'ondersteuning van MCP 2026-07-28 en 2025-11-25, OAuth 2.1-beveiliging'],
  ['SEC-002', '12–13.11', 'глибокий аудит безпеки; випуск 20261113-121403 — поточна жива версія', 'diepe beveiligingsaudit; release 20261113-121403 is de huidige live versie'],
  ['MAQUETTE-001, HISTORIE-001, IDENTITEIT-011', '13.11', 'у роботі: тема «Макет» (Хвиля 0), хронологія гілок, план доопрацювання «Макета» (PR #76)', 'in uitvoering: thema «Ontwerp» (Golf 0), kroniek van takken, plan voor het «Ontwerp» (PR #76)'],
];

const prRegels = (taal) => prs.filter((p) => p.nummer >= 28).map((p) => {
  const st = p.samengevoegd ? (taal === 'uk' ? `влито ${p.samengevoegd.slice(0, 10)}` : `samengevoegd ${p.samengevoegd.slice(0, 10)}`) : p.staat === 'open' ? (taal === 'uk' ? 'відкритий' : 'open') : (taal === 'uk' ? 'закритий' : 'gesloten');
  return `| [#${p.nummer}](${R}/pull/${p.nummer}) | ${p.aangemaakt} | \`${p.kop}\` → \`${p.basis}\` | ${st} | ${p.titel.replace(/\|/g, '·')} |`;
}).join('\n');

const blok = {
  geschiedenisUk: (kron) => `## Етап VII. Центр облікового запису, «Макет», безпека SEC-002 і MCP (05–13 листопада 2026)

> Доповнення від 13.11.2026 (HISTORIE-001). Попередні етапи вище не змінювалися. Повна хронологія з попередниками й наступниками кожної гілки — [ХРОНОЛОГІЯ-ГІЛОК](${kron}).

${ETAP.map(([id, d, uk]) => `- **${id} (${d}):** ${uk}.`).join('\n')}

Жива версія на 13.11.2026: \`20261113-121403\` (коміт [\`5f2325d\`](${R}/commit/5f2325d788e29c5126f9ede6975afbbac7e5aae2)). Гілка \`voornaamst\` поки її не містить — див. розділ «Розрив» у хронології.
`,
  geschiedenisNl: (kron) => `## Fase VII. Accountcentrum, «Ontwerp», beveiliging SEC-002 en MCP (5–13 november 2026)

> Aanvulling van 13-11-2026 (HISTORIE-001). Eerdere fasen hierboven zijn ongewijzigd. Volledige kroniek met voorganger en opvolger per tak: [KRONIEK-TAKKEN](${kron}).

${ETAP.map(([id, d, , nl]) => `- **${id} (${d}):** ${nl}.`).join('\n')}

Live versie op 13-11-2026: \`20261113-121403\` (commit [\`5f2325d\`](${R}/commit/5f2325d788e29c5126f9ede6975afbbac7e5aae2)). De tak \`voornaamst\` bevat die nog niet — zie «Achterstand» in de kroniek.
`,
  takkenUk: (kron) => `## Доповнення 13.11.2026: 122 гілки, PR #28–#76, випуски до 20261113-121403

> Доповнення HISTORIE-001; таблиці вище — стан на 04.11.2026 і не змінювалися. Для кожної гілки попередник і наступник — у [ХРОНОЛОГІЯ-ГІЛОК](${kron}), яка надалі лише доповнюється генератором \`scripts/geschiedenis/kroniek.mjs\`.

| PR | Створено | Гілка → основа | Стан | Назва |
|---|---|---|---|---|
${prRegels('uk')}
`,
  takkenNl: (kron) => `## Aanvulling 13-11-2026: 122 takken, PR #28–#76, releases tot 20261113-121403

> Aanvulling HISTORIE-001; de tabellen hierboven tonen de stand van 04-11-2026 en zijn ongewijzigd. Voorganger en opvolger per tak staan in [KRONIEK-TAKKEN](${kron}), die voortaan alleen wordt aangevuld door \`scripts/geschiedenis/kroniek.mjs\`.

| PR | Aangemaakt | Tak → basis | Status | Titel |
|---|---|---|---|---|
${prRegels('nl')}
`,
  overzichtUk: (kron) => `## Що змінилося з 07.11.2026

> Доповнення HISTORIE-001 від 13.11.2026. Текст вище не змінювався.

- Жива версія: \`20261113-121403\` (SEC-002). Гілка за замовчуванням \`voornaamst\` відстає на 132 коміти; оновлює її лише власник.
- Нові роботи: центр облікового запису й вигляд «Макет» (IDENTITEIT-003…010), Telegram і підтвердження з іншого пристрою, GitHub-середовище, хмарний спільний доступ, MCP-001, «Живий дім» (HUIS-001), глибокий аудит SEC-002.
- Хронологія всіх гілок із посиланнями на попередника й наступника: [ХРОНОЛОГІЯ-ГІЛОК](${kron}) · [Етап VII історії](docs/hub/ІСТОРІЯ-РОЗВИТКУ.uk.md) · [PR #28–#76](docs/hub/ГІЛКИ-ТА-ЗАПИТИ-НА-ЗЛИТТЯ.uk.md).
`,
  overzichtNl: (kron) => `## Wat is er veranderd sinds 07-11-2026

> Aanvulling HISTORIE-001 van 13-11-2026. De tekst hierboven is ongewijzigd.

- Live versie: \`20261113-121403\` (SEC-002). De standaardtak \`voornaamst\` loopt 132 commits achter; alleen de eigenaar werkt hem bij.
- Nieuw werk: accountcentrum en weergave «Ontwerp» (IDENTITEIT-003…010), Telegram en bevestigen vanaf een ander apparaat, GitHub-omgeving, delen in de cloud, MCP-001, «Levend huis» (HUIS-001), diepe audit SEC-002.
- Kroniek van alle takken met voorganger en opvolger: [KRONIEK-TAKKEN](${kron}) · [Fase VII](docs/hub/GESCHIEDENIS.nl.md) · [PR #28–#76](docs/hub/TAKKEN-EN-SAMENVOEGVERZOEKEN.nl.md).
`,
  indexUk: (kron) => `## Доповнення 13.11.2026

| Стаття / Сторінка | Опис | 🇺🇦 Українська версія | 🇳🇱 Нідерландська версія |
|---|---|---|---|
| **Хронологія гілок і робіт (HISTORIE-001)** | Кожна гілка з попередником і наступником, розрив \`voornaamst\` ↔ жива версія; документ лише доповнюється | [🇺🇦 \`ХРОНОЛОГІЯ-ГІЛОК.uk.md\`](${kron}) | [🇳🇱 \`KRONIEK-TAKKEN.nl.md\`](./hub/KRONIEK-TAKKEN.nl.md) |
| **План доопрацювання «Макета» (IDENTITEIT-011…020)** | Звірка «Можливостей для доопрацювання» з кодом і план фаз 0–5 | [🇺🇦 \`ПЛАН-МАКЕТ-ДООПРАЦЮВАННЯ.uk.md\`](https://github.com/Tarasevych/hub/blob/claude/optimistic-mayer-exvf2p/docs/ontwerp/identiteit-account/%D0%9F%D0%9B%D0%90%D0%9D-%D0%9C%D0%90%D0%9A%D0%95%D0%A2-%D0%94%D0%9E%D0%9E%D0%9F%D0%A0%D0%90%D0%A6%D0%AE%D0%92%D0%90%D0%9D%D0%9D%D0%AF.uk.md) (PR #76) | — |
`,
  indexNl: () => `## Aanvulling 13-11-2026

| Artikel | Omschrijving | 🇳🇱 Nederlands | 🇺🇦 Oekraïens |
|---|---|---|---|
| **Kroniek van takken en taken (HISTORIE-001)** | Elke tak met voorganger en opvolger, achterstand \`voornaamst\` ↔ live versie; wordt alleen aangevuld | [🇳🇱 \`KRONIEK-TAKKEN.nl.md\`](./hub/KRONIEK-TAKKEN.nl.md) | [🇺🇦 \`ХРОНОЛОГІЯ-ГІЛОК.uk.md\`](./hub/ХРОНОЛОГІЯ-ГІЛОК.uk.md) |
| **Plan «Ontwerp»-weergave (IDENTITEIT-011…020)** | Vergelijking van de ontwikkelkaart met de code en plan voor fasen 0–5 | — | [🇺🇦 \`ПЛАН-МАКЕТ-ДООПРАЦЮВАННЯ.uk.md\`](https://github.com/Tarasevych/hub/blob/claude/optimistic-mayer-exvf2p/docs/ontwerp/identiteit-account/%D0%9F%D0%9B%D0%90%D0%9D-%D0%9C%D0%90%D0%9A%D0%95%D0%A2-%D0%94%D0%9E%D0%9E%D0%9F%D0%A0%D0%90%D0%A6%D0%AE%D0%92%D0%90%D0%9D%D0%9D%D0%AF.uk.md) (PR #76) |
`,
};

const DOELEN = [
  ['docs/hub/ІСТОРІЯ-РОЗВИТКУ.uk.md', blok.geschiedenisUk, './ХРОНОЛОГІЯ-ГІЛОК.uk.md'],
  ['docs/hub/ІСТОРІЯ-РОЗВИТКУ.md', blok.geschiedenisUk, './ХРОНОЛОГІЯ-ГІЛОК.uk.md'],
  ['docs/hub/GESCHIEDENIS.nl.md', blok.geschiedenisNl, './KRONIEK-TAKKEN.nl.md'],
  ['docs/hub/ГІЛКИ-ТА-ЗАПИТИ-НА-ЗЛИТТЯ.uk.md', blok.takkenUk, './ХРОНОЛОГІЯ-ГІЛОК.uk.md'],
  ['docs/hub/ГІЛКИ-ТА-ЗАПИТИ-НА-ЗЛИТТЯ.md', blok.takkenUk, './ХРОНОЛОГІЯ-ГІЛОК.uk.md'],
  ['docs/hub/TAKKEN-EN-SAMENVOEGVERZOEKEN.nl.md', blok.takkenNl, './KRONIEK-TAKKEN.nl.md'],
  ['ОГЛЯД-ПРОЄКТУ.uk.md', blok.overzichtUk, 'docs/hub/ХРОНОЛОГІЯ-ГІЛОК.uk.md'],
  ['PROJECTOVERZICHT.nl.md', blok.overzichtNl, 'docs/hub/KRONIEK-TAKKEN.nl.md'],
  ['docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md', blok.indexUk, './hub/ХРОНОЛОГІЯ-ГІЛОК.uk.md'],
  ['docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md', blok.indexUk, './hub/ХРОНОЛОГІЯ-ГІЛОК.uk.md'],
  ['docs/INDEX.nl.md', blok.indexNl, './hub/KRONIEK-TAKKEN.nl.md'],
];

for (const [rel, maak, kron] of DOELEN) {
  const f = path.join(WORTEL, rel);
  if (!fs.existsSync(f)) { console.log(`${rel}: немає файла, пропущено`); continue; }
  const oud = fs.readFileSync(f, 'utf8');
  if (oud.includes(MARK)) { console.log(`${rel}: уже доповнено`); continue; }
  fs.writeFileSync(f, oud.replace(/\s*$/, '\n\n') + `---\n\n${MARK}\n${maak(kron)}`);
  console.log(`${rel}: доповнено`);
}
