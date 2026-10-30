# CanonicalAccountMenu: архітектура станів і контракти

## 1. Призначення

`CanonicalAccountMenu` є канонічним presentation-шаром для вибору вже відомого акаунта, запуску нового входу, завершення поточного входу та керування фото профілю. Компонент не визначає auth-політики й не створює власних account/session джерел.

Архітектура розділена на:

- `src/CanoniekAccountMenu.tsx` — відкриття/закриття, expanded/collapsed UI, виклик переданих user actions і рендеринг;
- `src/canoniek-account-menu-model.ts` — identity, deduplication, classification, MRU, visibility, preview candidates і photo resolution;
- `src/canoniek-account-menu.css` — виключно стилі CanonicalAccountMenu;
- backend session endpoints — авторитетний стан browser grants та активних сесій.

## 2. Карта джерел даних

| Дані | Джерело | Авторитетність | Використання |
|---|---|---:|---|
| Поточний акаунт | активний tab/session payload (`user`) | найвища | лише header меню |
| Відомі акаунти | `/api/owner/session/accounts → accounts` | авторитетне | known/signed-in/reauth класифікації |
| `snapshot.previews` | backend-проєкція тих самих browser grants | legacy, не окреме джерело | зберігається для сумісності, не використовується як provider candidate |
| External candidates | `externalCandidates` із явним `source: provider або browser` | авторитетне лише за наявності реального feed | add-account preview |
| Локальна history | `tsv-recent-account-previews-v1` (legacy `tsv_recent_account_previews_v1` мігрується один раз і видаляється) | допоміжна | лише уточнює MRU вже авторитетних identity |
| Custom photo | `user.customPicture === true` + `user.picture`, або `customPhoto/customPicture` URL | авторитетне для presentation | перший photo priority |
| Provider photo | `providerPicture` або звичайне `picture` | вторинне | другий photo priority |

History не створює `knownAccounts`, `signedInAccounts`, `reauthAccounts` або `externalConnectableCandidates`.

## 3. Попереднє дублювання та рішення

До консолідації `CanoniekAccountMenu.tsx` окремо формував:

1. `previewCandidates` із `accounts + previews + history`;
2. `quickPreviews` через повторну status/grant-фільтрацію;
3. `connectionPreviews` через другу, конфліктну status/history-фільтрацію;
4. `authorizedAccountCount` через третю identity/status-фільтрацію;
5. `accountRows = snapshot.accounts`, що повторно показувало current account у expanded list.

`App.tsx` і `VerenigdDienstApp.tsx` додатково підміняли відсутні `previews` масивом `accounts`, створюючи ще одну паралельну preview-модель.

Доведення неавторитетності старої connection-preview логіки: backend `ownerGrantMenuData` формував `accounts` і `previews` з одного набору browser grant cookies. `previews` відрізнявся лише правилом menu visibility і лімітом, але не був provider/browser discovery feed. Тому він не може бути джерелом `externalConnectableCandidates`.

## 4. Identity та deduplication

Єдиний контракт — `isSameAccount(left, right)`:

1. якщо обидві сторони мають stable `id/accountId`, порівнюються тільки ці ID;
2. normalized email використовується лише коли stable ID відсутній хоча б з одного боку;
3. account-specific винятків немає.

`accountIdentityKey` використовується лише як стабільний React/key та допоміжний deterministic tie-breaker. Усі масиви deduplicate через `isSameAccount`.

## 5. Єдина модель

`buildCanonicalAccountMenuModel` повертає:

- `currentAccount`;
- `knownAccounts`;
- `otherKnownAccounts`;
- `signedInAccounts`;
- `otherSignedInAccounts`;
- `reauthAccounts`;
- `visibleExpandedAccounts`;
- `externalConnectableCandidates`;
- `collapsedSwitchPreviewAccounts`;
- `expandedAddPreviewAccounts`;
- `shouldShowOtherAccountsToggle`;
- `shouldShowLogoutAll`;
- `isFirstLogin`.

### Непорушні інваріанти

1. `currentAccount` рендериться тільки в header.
2. `otherKnownAccounts = knownAccounts - currentAccount` через `isSameAccount`.
3. `signedInAccounts` містить лише `active` або `signed_in`.
4. `externalConnectableCandidates` походить тільки з явного external feed, не з history, grants preview або reauth list.
5. Preview не дублює current/known identity.
6. MRU виконується тільки `sortAccountsByMru`.
7. Порівняння identity виконується тільки `isSameAccount`.
8. Усі аватари використовують `resolveAccountPhoto`.

## 6. State machine і visibility

### Menu state

- `closed` — panel не змонтований;
- `open/collapsed` — panel відкритий, список інших акаунтів згорнутий;
- `open/expanded` — panel відкритий, відображається `visibleExpandedAccounts`.

Якщо `shouldShowOtherAccountsToggle === false`, `expanded` примусово повертається в `false`.

### Account scenarios

| Сценарій | Поведінка |
|---|---|
| `currentAccount === null && knownAccounts.length === 0` | CTA `Увійти в обліковий запис через`; toggle і preview відсутні |
| Один current account | toggle відсутній |
| Current + мінімум один other known | toggle видимий |
| Expanded | список містить тільки `otherKnownAccounts` |
| Два або більше signed-in identity | `Вийти з усіх акаунтів` видимий |
| Лише reauth/history identity | не збільшує signed-in count |

## 7. Preview rules

- Collapsed toggle preview: `otherSignedInAccounts`, MRU, максимум `MAX_PREVIEW_ACCOUNTS = 3`.
- Expanded add preview: тільки `externalConnectableCandidates`, MRU, максимум 3.
- `reauthAccounts`, `knownAccounts`, `signedInAccounts`, legacy `previews` та history заборонено використовувати для add preview.
- Якщо кандидатів немає, preview JSX не монтується.
- Collapsed і expanded preview взаємовиключні в JSX; CSS не приховує зайвий DOM.

Поки backend не має перевіреного provider/browser discovery feed, він повертає `externalCandidates: []`. Це навмисний fail-closed контракт: краще не показати ілюстрацію, ніж видати history або grant за доступний зовнішній акаунт.

## 8. Photo fallback

`resolveAccountPhoto(account)` має єдиний порядок:

1. custom photo;
2. provider photo;
3. initials.

URL проходить через `normalizeAvatarUrl`. Image rendering використовує `StableAvatar`, який попередньо перевіряє завантаження. Невдале зображення переходить до initials без browser broken-image icon і без циклічного `onError`.

## 9. Camera control

File-picker контракт не змінено:

- `image/jpeg`;
- `image/png`;
- `image/webp`.

Camera button має стабільний розмір, `aria-label`, native tooltip (`title`), `aria-busy`, disabled/busy state, `:focus-visible` outline і явні contrast variables для light, dark, plum-light та plum-dark themes.

Backend як і раніше перевіряє MIME, magic bytes і розмір, зберігає custom photo та не перезаписує його наступним Google sign-in.

## 10. Ризики й межі

- External add preview навмисно порожній до появи окремого, перевіреного provider/browser feed.
- Legacy `snapshot.previews` не видалений із transport type, щоб не ламати сумісність; model його ігнорує.
- Auth, remembered switch, logout-current, logout-account-browser і logout-all flows не змінюються.
- Меню не робить network polling і не зберігає auth tokens.

## 11. Регресійна матриця

Blocking test/audit покривають:

1. перший запуск;
2. один акаунт;
3. два акаунти — collapsed;
4. два акаунти — expanded;
5. logout-all visibility;
6. 3–4 акаунти та MRU limit/order;
7. broken provider photo → initials;
8. custom photo priority;
9. external candidates only для add preview;
10. current account лише у header;
11. mutual-exclusive preview JSX;
12. mobile viewport;
13. camera contrast/focus/busy contracts;
14. release і rollback metadata.
