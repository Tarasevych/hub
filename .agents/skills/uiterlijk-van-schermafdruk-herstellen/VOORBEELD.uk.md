# Відтворюваний приклад: виправлення вигляду сторінки за знімком екрана

## Призначення зразка

Показує послідовність навички `uiterlijk-van-schermafdruk-herstellen` на реальному прецеденті проєкту `UPD-001` (гострі кути карток та центрування на `admin.tarasevych.com/updates`) і правилі специфічності в `src/ontwerp/mobiel.css`.

## Складники в коді

- Конфлікт глобального каскаду: `src/canoniek-omlijsting.css` (`flat-content` для `<section>`) перебивав заокруглення карток у `src/uitrol/uitrol.css` у частині палітр. Виправлення: точне виключення `:not(.mr-mq *):not(.ut-root *)` замість `!important`.
- Контейнер і поля «Макета»: `src/beheer-uitrol.css` (`html:not(#_uitrol) .admin-console:has([data-admin-uitrol]){max-width:1180px}`) та розрахунок симетричних полів у `@media (min-width:961px)` із запасом під бокове меню (`--ut-rail`).
- Увага до каскаду в `src/ontwerp/mobiel.css`: більшість правил мають `:where(...)` (специфічність `0`), однак правило сенсорної висоти кнопок має `(0,3,1)`, тож довільне переміщення правил у кінець файла без перевірки `cssCodeSplit: true` і `(0,4,0)` в окремих компонентах ламає сусідні сторінки.

## Команди відтворення й перевірки

```bash
node scripts/eenheidstests.mjs uitrol-centrering-20261115.test.ts
node scripts/l002-audit.mjs
node scripts/plaatsing-controle.mjs --stil
node scripts/kleur-contrast-controle.mjs --stil
node scripts/zoek-ui-catalogus.mjs --controle
```

## Обов’язкова перевірка в переглядачі (до й після)

- Ширини: `390 px` (вузький телефон), `768 px` (планшет), `1366 px`, `1536 px`, `1920 px` (ПК).
- Теми й мови: світла та темна теми, стандартна палітра і «Макет», обидві мови (`uk` + `nl`).
- Критерії: `scrollWidth <= clientWidth`, відсутність обрізаних написів конвеєра (`white-space: normal`), сенсорні кнопки ≥ 44 px, збережені знеособлені знімки до/після.

## Фактично спостережені результати (15.11.2026, дерево `stroom-vaard`)

- `uitrol-centrering-20261115.test.ts`: **10/10 пройдено**.
- `scripts/l002-audit.mjs`, `scripts/plaatsing-controle.mjs --stil`, `scripts/kleur-contrast-controle.mjs --stil`: вихід `0`.
- `scripts/zoek-ui-catalogus.mjs --controle`: `actueel (1646 elementen)`.

## Перевірені обмеження

- Статичні тести правил стилів і контрасту не замінюють візуального перегляду в справжньому переглядачі (`Chromium` / `scripts/rook-controle.mjs`) на вузькому телефоні та на реальному моніторі власника.
- Під час кожного подальшого правлення інтерфейсу знімки до/після формуються на знеособленому стенді без особистих листів і ключів.

## Запис передавання роботи (`WERKOVERDRACHT`)

- **Ідентифікатор завдання:** `VAARD-002`
- **Складник:** стилі та перевірка інтерфейсу (`src/canoniek-omlijsting.css`, `src/ontwerp/mobiel.css`, `src/beheer-uitrol.css`)
- **Що перевірено й посилання:** `tests/eenheid/uitrol-centrering-20261115.test.ts` (10/10), `l002-audit.mjs`, `plaatsing-controle.mjs`, `kleur-contrast-controle.mjs`, `zoek-ui-catalogus.mjs`
- **Невиконане й наступний крок:** у разі кожної живої UI-правки додавати знеособлені знімки до/після на `390 px` і комп’ютері (`1280–1920 px`) у світлому/темному оформленні двома мовами.
