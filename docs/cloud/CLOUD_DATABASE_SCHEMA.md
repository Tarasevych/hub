> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./CLOUD_DATABASE_SCHEMA.uk.md) · [🇳🇱 **Nederlandse versie**](./CLOUD_DATABASE_SCHEMA.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Схема бази даних Cloud — v1

Усі записи типово є приватними та ізольованими в межах власника (`owner-scoped`). Ідентифікатори бази даних генеруються платформою.

## `cloud_workspaces_v1`

| Поле | Тип | Правило |
|---|---|---|
| `ownerUserId` | string | обов'язкова межа ізоляції власника (tenant boundary) |
| `title` | string | 2–100 символів |
| `normalizedTitle` | string | NFKC + нижній регістр; унікальність у межах власника |
| `description` | string | до 500 символів |
| `template` | enum | `project`, `documentation`, `meeting`, `personal` |
| `sections` | array | стабільні поверхневі візуальні орієнтири; не теки |
| `status` | enum | `active`, `archived` |
| `createdAt`, `updatedAt` | epoch ms | керується сервером |
| `archivedAt` | epoch ms | `0`, поки активний |

Концептуально необхідні індекси / ключі запитів:

- `(ownerUserId, status)`;
- `(ownerUserId, normalizedTitle)`.

## `cloud_items_v1`

| Поле | Тип | Правило |
|---|---|---|
| `ownerUserId` | string | обов'язкова межа ізоляції власника (tenant boundary) |
| `workspaceId` | string | порожнє значення означає Quick Capture |
| `suggestedWorkspaceId` | string | лише наявний робочий простір власника |
| `kind` | enum | `file`, `note`, `link` |
| `title` | string | ШІ або детермінований резервний варіант, макс. 120 |
| `originalName` | string | лише початкова назва файлу |
| `description` | string | макс. 500 |
| `textContent` | string | вміст нотатки, макс. 50 тис. |
| `sourceUrl` | string | нормалізований HTTP(S) URL |
| `mimeType` | string | перевірений сервером безпечний тип |
| `sizeBytes` | кількість | декодовані байти |
| `storagePath` | string | згенерований сервером, ніколи не публічний |
| `tags`, `people` | string[] | обмежені за розміром та дедупліковані |
| `status` | enum | `captured`, `waiting_review`, `in_progress`, `done` |
| `aiState` | enum | `suggested`, `fallback` |
| `aiConfidence` | кількість | у межах 0–1 |
| `createdAt`, `updatedAt`, `openedAt` | epoch ms | керується сервером |

Концептуально необхідні індекси / ключі запитів:

- `(ownerUserId, updatedAt)`;
- `(ownerUserId, workspaceId)`;
- `(ownerUserId, status)`.

## `cloud_resume_v1`

Один актуальний останній запис на кожного власника.

| Поле | Тип |
|---|---|
| `ownerUserId` | string |
| `currentWorkspaceId` | string |
| `currentItemId` | string |
| `focus` | boolean |
| `energy` | `low`, `medium`, `high` |
| `updatedAt` | epoch ms |

## `cloud_ai_decisions_v1`

Зберігає обмежені свідчення (bounded evidence) без дублювання сирого вмісту елемента.

| Поле | Тип |
|---|---|
| `ownerUserId` | string |
| `itemId` | string |
| `inputFingerprint` | SHA-256 hex |
| `state` | `suggested`, `fallback` |
| `reasonCode` | string |
| `confidence` | кількість |
| `suggestedWorkspaceId` | string |
| `createdAt` | epoch ms |

## `cloud_audit_v1`

| Поле | Тип |
|---|---|
| `ownerUserId` | string |
| `action` | рядок із простором імен |
| `entityType` | `workspace`, `item`, майбутні типи провайдерів/спільного доступу |
| `entityId` | string |
| `details` | несекретні обмежені метадані |
| `createdAt` | epoch ms |

Початкові дії:

- `cloud.workspace.created`;
- `cloud.item.captured`;
- `cloud.item.placed`;
- `cloud.item.status.changed`.

## Майбутні таблиці (не активні у runtime)

- `cloud_jobs_v1` — ідемпотентна черга воркерів з орендою (lease);
- `cloud_content_chunks_v1` — витягнуті фрагменти вмісту та відбитки (fingerprints);
- `cloud_search_documents_v1` — документи гібридного індексу;
- `cloud_provider_accounts_v1` — стан облікових записів власника/провайдера;
- `cloud_oauth_tokens_v1` — зашифровані конверти refresh-токенів;
- `cloud_sync_state_v1` — стан курсора/дельти провайдера;
- `cloud_provider_items_v1` — проєкції зовнішніх об'єктів;
- `cloud_shares_v1` — короткостроковий, відкличний та обмежений за охопленням спільний доступ;
- `cloud_item_links_v1` — пов'язані захоплені елементи / граф зв'язків;
- `cloud_reminders_v1` — м'які нагадування з контрольованою користувачем частотою.
