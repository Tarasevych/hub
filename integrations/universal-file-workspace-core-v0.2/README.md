# Universal File Workspace · Mijn Ruimte

Це **локальний початковий інтеграційний пакет**, а не патч production-репозиторію.

**Вміст:** `src/contracts.ts` (модель), `src/sniff.ts` (magic/ZIP manifest), `src/registry.ts` (adapters/engines/ACL), `src/default-engines.ts` (manifest кандидатів), `test/` (6 Node tests), `docs/` (аудит і план міграції), `demo/index.html` (самостійний адаптивний демо-інтерфейс).

## Перевірка

```sh
npm test
```

Requires Node.js 22+ and TypeScript (`tsc`) available locally. No network dependencies in starter. The demo is static HTML/JS/CSS with local-only file opening; all network source labels are demo.

## Не заявлено як виконане

Поточний production source не змінено, не перевірено поточний Git commit, реальні OAuth/Drive/Gmail/GitHub адаптери ще не підключено, серверних конвертацій і криптографічної валідації немає. `proposedEngines` — маніфести майбутніх інтеграцій; їхні actual packages не входять у цей starter. До включення в production потрібна реальна інтеграція, tests, security review.

## Базовий пріоритет

Reuse існуючих viewer functions перш ніж замінювати. Спочатку read-only core & consumer migration, потім повноцінний engine settings, write/convert jobs та документні редактори.
