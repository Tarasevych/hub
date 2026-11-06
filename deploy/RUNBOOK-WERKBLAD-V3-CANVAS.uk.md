> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./RUNBOOK-WERKBLAD-V3-CANVAS.md)) · [🇳🇱 **Nederlandse versie**](./RUNBOOK-WERKBLAD-V3-CANVAS.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

# Робочий аркуш v3 — полотно (canvas)

Шар взаємодії вільного робочого аркуша (Етап C). Ще НЕ підключено до `src/werkblad/Werkblad.tsx` — це робить інтегратор
за прапорцем функції `werkblad-v3`. Нічого в цьому компоненті не звертається до сервера; збереження відбувається через `onCommit` батьківського компонента.

## Файли
- `src/werkblad/canvas/kern.ts` — чисте ядро (без React/DOM): перетягування, зміна розміру (8 країв), обмеження (klemmen), сітка, політика перекриття,
  z-порядок, закріплення, видалення, «Розмістити тут…», кроки клавіатурою, скасування/повтор, клас пристрою, адаптація
  комп’ютерної розкладки для планшета/телефону, тексти uk/nl.
- `src/werkblad/canvas/hooks.ts` — `useContainerBreedte` (ResizeObserver на справжньому контейнері) та `usePointerGestures`.
- `src/werkblad/canvas/Canvas.tsx` + `canvas.css` — компонент.
- Тести: `tests/eenheid/werkblad-canvas-kern.test.ts`, `tests/e2e/werkblad-canvas.e2e.ts`, стенд `tests/e2e/hulp/canvas-stand/`.

## Компонент
```tsx
<Canvas layout={CanvasLayout} render={(entry, { bewerken, schaal }) => …} limieten={(itemId) => ({ minW, minH, maxW, maxH })}
  onCommit={(layout) => …} editMode={bool} onRequestAdd={(plek?) => …}
  status="idle|saving|error|conflict" onRetry onReload lang="uk|nl" beleid={{ snap, raster, overlap }}
  titel={(entry) => string} onApparaat={(klasse, breedte) => …} />
```
- `onCommit` викликається рівно один раз на завершену зміну: `pointerup`, дія меню, скасування/повтор або через 600 мс після останньої
  клавіші зі стрілкою. `Escape`, `pointercancel`, `touchCancel`, втрата захоплення вказівника (`pointer capture`) або вимкнення режиму редагування посеред жесту → без коміту.
- Коміт обчислюється із синхронного об’єкта жесту (`Gebaar`), ніколи не зі стану React (гонитва v2 `eindMaat`).
- Політика з `layout.mode`: `free` = перекриття дозволено (перетягнута плитка стає зверху), `snap` = сітка 8 px + без перекриття,
  `flow` = без перекриття. За умови «без перекриття» переміщення переходить на найближче вільне місце; зміна розміру, що натрапляє на
  сусіда, відскакує назад. Сусіди ніколи не зсуваються (без автоущільнення).
- Позиції — це логічні px від `layout.canvasWidth`; на екрані × `schaal` (= ширина контейнера / `canvasWidth`). Отже, масштабування, бічна панель
  і поворот екрана не змінюють збережених значень.
- Клас пристрою за шириною контейнера: < 600 — телефон, < 1024 — планшет, інакше — комп’ютер. Якщо клас ще не має власної розкладки,
  батьківський компонент створює її за допомогою `aanpassenVanaf(computerLayout, STANDAARD_CANVASBREEDTE[klasse], limieten)` (лише вперше).

## Керування
- Миша: перетягування після 5 px. Дотик/перо: утримання 500 мс на місці (≤ 8 px), рух раніше = звичайне прокручування. Довге утримання без руху
  або права кнопка миші → меню «Додати / Розмістити тут… / Змінити розмір / Вперед / На передній план / Зафіксувати / Видалити».
- Ручки зміни розміру лише в режимі редагування, зона дотику 44 px. Поза режимом редагування жестів немає: вміст працює як зазвичай (посилання, прокручування).
- Клавіатура (WCAG 2.5.7): стрілки = 8 px (сітка при `snap`), Ctrl = 1 px, Shift = розмір, Enter / Shift+F10 / клавіша меню = меню,
  Видалити = видалити, PageUp = вперед, Ctrl+Z / Ctrl+Y = скасувати/повторити, Escape = скасувати жест. Оголошення через `aria-live`.

## z-index
Усе всередині `.wbc` (`isolation:isolate`): елементи 1…n, фантом (`geest`) 8000, перетягуваний елемент 8100, меню 9000, панель стану 9100. Полотно в цілому є
одним шаром; `CanonicalChrome` та діалогові вікна лежать поверх нього. Жодних `position:fixed` (контроль розміщення).

## Запуск тестів
```bash
export PATH=/opt/node24/bin:$PATH
node scripts/eenheidstests.mjs werkblad-canvas            # ядро, БД не потрібна
PLAYWRIGHT_CORE=/pad/naar/playwright-core E2E_SCREENSHOTS=/workspace/audit-werkblad \
  node scripts/e2e-lokaal.mjs werkblad-canvas              # vite на 127.0.0.1:5391 + Chrome, лише локально
```
E2E-тест не запускає бекенд і базу даних; Chrome отримує `chromeArgs()` (усе, крім loopback → `~NOTFOUND`) та блокування маршрутів.

## Обмеження
- Множинний вибір відсутній (одночасно лише один вибраний елемент).
- Теки (`parent`) не малюються на полотні; сама плитка теки малюється (вміст: Етап B).
- Масштаб 200 % протестовано як зменшений удвічі CSS-viewport (так працює масштабування в Chrome) і окремо DPR 2; справжній `Ctrl+plus` у headless-режимі надіслати неможливо.
