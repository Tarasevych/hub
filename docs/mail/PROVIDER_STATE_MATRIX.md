# PROVIDER STATE MATRIX — N‑21, кроки 1–3

- Дата фіксації: 2026‑08‑12; OPEN‑015 повторно звірено 2026‑08‑25.
- Runtime-база перед N‑21 кроками 2–3: Version ID `1786319470714`.
- Офіційна Gmail REST surface повторно звірена 2026‑08‑25; нові Classification Labels зафіксовано окремо й не змішано зі звичайними Gmail labels.
- Scope: canonical §4.11 capability-safe matrix + D‑22 snooze boundary + N‑21 state convergence. Gmail Snooze є provider→UI read projection без return deadline; локальний snooze залишається local-only. Двостороння синхронізація вимагається тільки для фактично документованих Gmail write capabilities.
- Статуси нижче: **CURRENT** — підтверджено кодом; **TARGET** — контракт для наступного окремого кроку; **BLOCKED** — команду не можна відправляти без підтвердженої capability.

## 1. Межа відповідальності

Наш сервіс є надмножиною Gmail: спільні поштові стани можуть сходитися з provider, а локальні UX-стани залишаються нашими. Локальний стан не маскується під Gmail-стан.

- Спільні стани: read/unread, star, inbox/archive, trash, spam, Gmail user labels. Для Gmail snooze доступна лише read-проєкція membership через офіційний search query; write — тільки якщо з’явиться офіційно підтримана capability.
- Локальні стани: поточний snooze `mail_snoozes_v1` і його badge/remaining UI, іконки локальних labels, density, reading pane, thread grouping, кольори рядків, sender rules, priority signals, collapse/navigation preferences.
- Provider projection: список повідомлень, `labelIds`, category work-area view, unread counters, Gmail `in:snoozed` membership без deadline, `historyId` там, де він доступний, та normalized private cache — це проєкція Gmail, не окремий авторитетний стан.
- Жодний локальний UX-стан не повинен породжувати виклик Gmail API.

## 2. Матриця станів

| Наш стан | Аналог у Gmail | Напрямок (двосторонній / лише локальний) | Capability до відправки | Timestamp / ordering | Conflict | Idempotency | Retry / rollback | Audit | CURRENT runtime / gap |
|---|---|---|---|---|---|---|---|---|---|
| `unread: true/false` | Наявність/відсутність system label `UNREAD` | Двосторонній | Google account + provider message ID + `gmail.modify`; action map `unread/read` | Локальний intent: server-accepted time; provider: `historyId` лише в межах mailbox + observed-at | Найновіший порівнюваний intent для ключа `message:unread`; при неоднозначності refresh і divergence log | Відправляти бажане значення: add/remove `UNREAD`; повтор того самого intent безпечний після reconcile | 408/429/5xx/network — backoff+jitter; permanent failure — refresh і rollback optimistic UI | account, message ID, desired boolean, source, timestamps, result/error; без body/token | **CURRENT N‑21:** single read/unread row intents мають durable outbox ID, desired state, read-before-write convergence, retry/lease, terminal rollback signal і compact event audit; UI patch-ить row/cache до send. **GAP:** category/bulk path ще використовує direct batch route |
| `starred: true/false` | `STARRED` | Двосторонній | Google account + message ID + `gmail.modify`; action `star/unstar` | Як для unread | Latest-by-time на ключі `message:starred`; однакове значення = convergence | Desired add/remove `STARRED` | Як для unread | Як для unread, state key `starred` | **CURRENT N‑21:** row star/unstar проходить durable desired-state outbox з idempotent replay, retry і rollback; bulk Star лишається direct batch path |
| `inInbox: true/false` / archive | `INBOX`; archive = відсутність `INBOX` | Двосторонній | Google account + message ID + `gmail.modify`; action `inbox/archive` | Як для unread | Latest-by-time на `message:inInbox`; provider refresh перед повтором після невідомого результату | Desired add/remove `INBOX` | Transient retry; permanent failure — повернути рядок у provider-normalized location | action, source folder/selection, target boolean, IDs, result | **CURRENT N‑21:** row archive intent optimistic прибирає рядок, durable outbox підтверджує Gmail або повертає snapshot/cache при terminal failure; bulk/category та поточний inverse Undo ще direct |
| `trashed: true/false` | `messages.trash/untrash` або `TRASH` | Двосторонній | Google account + message ID + `gmail.modify`; використовувати підтриманий trash/untrash route | Server-accepted time + provider observation | Latest-by-time на `message:trashed`; не виводити стан лише зі старого списку | Desired trash/untrash; retry тільки з тим самим intent ID і перевіркою стану | Невідомий результат — read-after-write; permanent failure — rollback | Окремо позначати destructive intent, але не логувати content | **CURRENT §4.11a1:** durable state-intent contract підтримує `trash/untrash` через official Gmail trash/untrash route з read-before/read-after convergence; UI direct paths мігруються окремим атомом |
| `spam: true/false` | System label `SPAM` | Двосторонній | `SPAM` офіційно manually applicable; current single `message/modify` і bulk `messages/bulk-modify` мають explicit `spam/unspam` action map | Provider-confirmed mutation time + наступна provider observation | Latest comparable provider/local event; stale projection не повинна перемагати confirmed write | Desired add/remove `SPAM`; bulk розбивається в provider limit | Provider rejection не маскувати archive/trash; після confirmed write виконувати reconcile | action, account/message IDs, capability/result, safe provider error | **CURRENT §4.11a1:** durable state-intent contract підтримує `spam/unspam` з read-before/read-after convergence; single/bulk UI direct paths мігруються окремими атомами |
| membership у Gmail user label | Provider user label ID у `labelIds` | Двосторонній | Existing provider label ID + `gmail.modify`; для definition CRUD додатково labels capability/scope | Intent time + provider history observation | Latest-by-time для пари `message:labelId`; незалежно для кожного label | Desired membership add/remove; batch не більше provider limit | Retry transient; unknown label/404 → refresh label catalog, без blind recreate | message ID, label ID, add/remove, source, result | **CURRENT:** apply/remove/move та live provider-normalized response підтримано |
| Gmail user label definition: name/visibility/color | `users.labels` user resource | Двосторонній | Label type must be `user`; provider label ID; create/update/delete capability; system labels заборонено змінювати як definitions | Server intent time + provider response observation | Latest-by-time для `labelId:field`; rename collision → explicit divergence, не auto-merge | Update by label ID + desired fields; create не є природно idempotent — reconcile by stored intent and provider catalog before retry; delete повторювати лише після absence check | 400/403 — permanent/capability; 404 — refresh/reconcile; 429/5xx — backoff | label ID/name fingerprint, operation, attempt/result; без mailbox content | **CURRENT:** direct create/update/delete існує. **GAP:** durable create idempotency ledger відсутній |
| Gmail Classification Label values | `classificationLabelValues` / `ClassificationLabelValue`, окремі від inbox labels | **BLOCKED / out of current scope** | Окрема explicit capability і schema lookup; не використовувати current `label`/`unlabel` action map | Не визначено для нашого runtime | Не змішувати з membership звичайного Gmail label | Окремий desired schema value + intent ID після окремого дизайну | Жодного guessed write через `addLabelIds`; unsupported → без optimistic patch | capability probe, schema/label ID fingerprint, outcome | **CURRENT:** current normalization/action map Classification Labels не підтримують; їх поява в офіційній API surface не активує runtime автоматично |
| `important: true/false` | `IMPORTANT` | TARGET: двосторонній; CURRENT projection | Офіційно manually applicable, але поточний mutation action allowlist не містить important/unimportant → **BLOCKED** | Загальні правила shared state | Provider classifier та user intent можуть конфліктувати; latest comparable event + divergence log | Desired add/remove після окремої capability/action реалізації | Не виконувати через guessed action | capability/result audit | **GAP:** читається як label, окремої команди немає |
| Gmail snooze membership | Snooze у Gmail UI | Provider → UI read-проєкція; provider write **BLOCKED** | Read: `users.messages.list` з `q=in:snoozed`. Write/deadline: `unsupported`; не відправляти guessed/hidden label | `observedAt` нашої search-відповіді; Gmail return deadline API не надає | Новіша request generation перемагає; local snooze не стирає provider membership і навпаки | Read dedupe за account + message ID; provider write idempotency відсутня, бо write заборонений | Read failure показує local rows + safe status; provider retry не створюється | account, shown/estimated total, observedAt, capability; без fabricated write | **CURRENT D‑22:** first-page `in:snoozed` projection з окремим Gmail badge; час повернення явно unavailable. Повний двосторонній sync не заявляється |
| Локальний snooze `mail_snoozes_v1` | Немає підтвердженого write API-аналога | Лише локальний | Owner + account + message IDs; майбутній час ≤ 370 днів; response фіксує `scope:local_only`, `providerWrite:not_attempted`, Gmail write capability `unsupported` | `createdAt/updatedAt`; expiry за server time | Latest local update for owner/account/message; expired record видаляється; cancel local не прибирає Gmail-projected row | Upsert desired `snoozedUntil`; cancel desired absence | Local DB failure — no provider call; UI rollback/notice | owner/account/message IDs, until, result; без summary content у telemetry | **CURRENT OPEN‑015:** set/list/cancel зберігаються server-side у `mail_snoozes_v1`; product write = `local_persistent`, provider read = `search_projection`, provider write = `unsupported`, provider deadline = `unavailable`; UI не маскує локальний deadline під Gmail return time |
| Іконка локального label | Немає | Лише локальний | Local preferences write only | preference `updatedAt` | Latest local preference update | Upsert by local label key | Local retry only | preference key/result | **CURRENT:** `labelIcons` у `mail_view_preferences_v1`; ніколи не Gmail API |
| Density, reading pane, thread grouping, row colors, sender rules, priority signals, collapsed/navigation state | Немає mailbox-state аналога | Лише локальний | Local preferences validation only | preference `updatedAt` | Latest local preference update | Whole validated preference patch або field-level desired value | Local retry; invalid payload — reject | owner, changed field names, result; не значення sensitive rules | **CURRENT:** `mail_view_preferences_v1`; ніколи не Gmail API |
| Message list/cache projection | Gmail message/label/history data | Provider → local projection; не user mutation | Read capability; valid account; cursor/history capability | Provider `historyId` + observed-at. `internalDate` не є mutation time | Provider observation refreshes stale cache; cache ніколи не write-back source | Deduplicate by account + provider message ID + history event | `history.list` 404 → full sync; stale response discarded by request generation | sync cursor/range/count/result; без body | **CURRENT OPEN‑016:** live list і Gmail history sync є provider-authoritative; warmed reload використовує bounded owner/account/route snapshot. Account switch читає тільки exact owner+account+route snapshot і ніколи не реконструює folder membership із generic account-wide cache; provider refresh перезаписує read/star/labels та видаляє stale head-membership. `persisted:false` для browser list |
| Category work-area view + category selection | Gmail `messages.list` predicate + live selection resolution | Provider → ephemeral UI projection; bulk intent окремий | Read capability для preview; modify capability лише після окремої bulk action | Provider response observed-at; request generation відсікає stale response | Category predicate не створює mailbox state; після mutation показується provider-compatible projection | Preview dedupe за account + message ID; bulk materializes exact affected IDs | Preview failure повертає попередній список; mutation retry правила не успадковуються від preview | category, account, shown/total/truncated, result; без content | **CURRENT D‑17/D‑21:** provider-backed first page, honest shown/total, category-specific empty state; це не outbox |
| UI unread counters | Gmail label metadata `messagesUnread` + message `UNREAD` projection | Provider → UI | Read capability + verified account/label snapshot | Provider `observedAt`; не message `internalDate` | Request generation не дозволяє старій відповіді перемогти; confirmed mutation/Undo/Refresh запускає reconcile | Shared snapshot key: account + provider observation | Refresh/reconcile; arithmetic-only delta заборонена | account, label, old/new count, watermark/result | **CURRENT D‑13:** workspace і sidebar споживають один `gmail.labels.get` snapshot; direct ± не використовується |

## 3. Capability gate перед будь-якою provider-командою

Команда може покинути сервіс лише коли всі перевірки пройдені:

1. `provider === google`, account належить поточному owner і доступний.
2. Operation є в явному provider action map; жодних guessed labels/routes.
3. Є необхідний scope/capability: message state — modify; label definition — labels CRUD capability.
4. Є provider entity ID; local IDs не відправляються як Gmail IDs.
5. System label допускає цю зміну. `SENT`/`DRAFT` не змінюються через generic label command; draft messages не отримують labels. Classification Labels є окремою schema/capability і не проходять через current `addLabelIds/removeLabelIds` contract.
6. Batch розбито в межах офіційного limit: `batchModify` — максимум 1000 message IDs; single `modify` — до 100 add і 100 remove label IDs.
7. Для Gmail snooze read дозволено лише explicit `messages.list?q=in:snoozed`; write gate завжди повертає `unsupported`, deadline — `unavailable`, до появи офіційно задокументованої capability.
8. Failure capability gate не змінює optimistic UI на success і не запускає retry.

## 4. Timestamp і conflict contract (TARGET)

- Порівнюється лише той самий state key одного owner/account/provider/entity, наприклад `message:123:unread`.
- Client timestamp є контекстом, не джерелом істини. Локальна команда отримує authoritative `serverAcceptedAt`.
- Provider event отримує `providerObservedAt`; `historyId` використовується для порядку тільки всередині одного Gmail mailbox. Його не можна порівнювати між accounts і не можна трактувати як wall-clock timestamp.
- `internalDate` повідомлення не використовується для порядку state mutations.
- Правило: найновіша подія за порівнюваним authoritative time перемагає. Якщо порядок не доводиться, виконується refresh/reconcile, конфлікт фіксується як divergence, а blind overwrite заборонений.
- Якщо desired state вже дорівнює provider state, це convergence: команда завершується без додаткового write.

## 5. Idempotency contract (CURRENT для single read/star/archive; TARGET для решти)

- Кожен user/system intent має стабільний `intentId`; повторна доставка цього самого intent використовує той самий `idempotencyKey`.
- Key scope: owner + account + provider + entity ID + state key + intent ID. Новий user intent отримує новий ID, навіть якщо бажане значення збігається.
- State commands описують бажане значення, а не toggle. `toggle` дозволений лише в UI; перед provider write він перетворюється на explicit `true/false` або add/remove set.
- Поточний 30‑секундний Undo є UX inverse-командою в пам’яті вкладки; він не є durable idempotency record, intent ledger або outbox.
- Після timeout/unknown result обов’язковий read-after-write/reconcile.
- Label create, send і permanent delete не можна blind-retry як звичайні state sets. Для label create спочатку звіряються intent record і provider catalog. Send/outbox не входить у цей крок.

## 6. Retry, rollback і audit contract (CURRENT для state outbox; TARGET для решти)

- Retry: network, 408, 429 і 5xx; exponential backoff + jitter; враховувати `Retry-After`.
- Не blind-retry: validation 400, capability/scope 403, stale/missing entity 404, unsupported action. 401 переводить capability в auth-required до окремого owner flow; цей документ не запускає auth.
- Gmail history cursor 404 означає full sync, а не повтор старого cursor.
- Після permanent failure optimistic projection відкочується до свіжого provider/local state з видимим status, а не залишається як success.
- Durable audit має містити: owner/account/provider, action/state key, provider target IDs, desired-state fingerprint, source, intent/idempotency IDs, accepted/observed/completed times, attempt, outcome, safe error code.
- Audit не містить OAuth tokens, raw headers, body, subject, snippet, attachment content або recipient lists.

## 7. Поточні runtime-факти та відкриті gaps

1. `backend/google-suite-mail-browser.ts` виконує current single/bulk mutations напряму й повертає provider-normalized message; action allowlist: read, unread, archive, inbox, trash, untrash, star, unstar, label, move, unlabel.
2. N‑21 single row read/star/archive patch-ять projection + private cache до send і створюють `mail_state_intents_v1`; transient outcome лишається видимим як pending, status polling/maintenance cron повторюють його, terminal failure повертає captured row/cache. Bulk та inverse Undo поки зберігають попередній direct contract.
3. D‑17 category view окремо завантажує provider-backed matching rows і live count; preview/filter не є mailbox mutation та не породжує retry intent.
4. D‑22: `backend/mail-snooze.ts` лишається local-only і повертає capability boundary; окремо `messages.list?q=in:snoozed` проєктує першу сторінку Gmail membership у UI без return deadline та без write.
5. `backend/mail-view-preferences.ts` — owner-scoped локальні preferences; Gmail API не викликається.
6. D‑13 реалізував shared timestamped `gmail.labels.get` snapshot для workspace/sidebar counters і reconcile після confirmed mutations/Undo/Refresh; stale responses відсікаються.
7. `backend/mail-platform.ts` тепер містить explicit state/action/capability contract, stable intent idempotency key і jittered exponential retry; `google-suite-mail-browser.ts` реалізує owner/account-scoped outbox, lease, read-before-write convergence, supersede та compact event audit без другого vault.
8. Існуючі sync/maintenance cron не доводять bidirectional state-command contract; їх не слід позначати як виконання N‑21.
9. Snooze set/cancel напряму commit-яться в `mail_snoozes_v1`; generic state-intent contract зберігає provider snooze capability як `unsupported`, але не використовується як другий persistence-шар для локального snooze. Provider call/retry не виконується.

## 8. Офіційна Gmail API база

Повторно перевірено 2026‑08‑25 за офіційною Google Workspace документацією. Висновок про відсутність public snooze/unsnooze write capability та return-deadline API є inference з актуального переліку публічних REST methods і documented label semantics, а не твердженням про внутрішню реалізацію Gmail UI.

- [users.messages.modify](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify) — add/remove labels, до 100 label IDs на update.
- [users.messages.batchModify](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/batchModify) — до 1000 message IDs.
- [Manage labels](https://developers.google.com/workspace/gmail/api/guides/labels) — applicable system labels і обмеження для system/draft labels.
- [users.labels resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels) — user/system label semantics і CRUD.
- [users.history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list) — cursor semantics; 404 вимагає full sync.
- [users.messages resource](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages) — актуальний перелік public methods і окремі `classificationLabelValues`; current app їх не імплементує.
- [Gmail REST v1 surface](https://developers.google.com/workspace/gmail/api/reference/rest) — публічні routes; на дату перевірки snooze method у переліку відсутній.
- [Filtering and searching messages](https://developers.google.com/workspace/gmail/api/guides/filtering) і [users.messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list) — `q` приймає Gmail search-box query format.
- [Gmail search operators](https://support.google.com/mail/answer/7190?co=GENIE.Platform%3DDesktop&hl=en) — офіційно описує `in:snoozed`; D‑22 використовує його лише для read membership.

## 9. Acceptance для N‑21 крок 1

- [x] Є явні shared/local/projection межі.
- [x] Є колонки: наш стан, Gmail analog, direction, capability, timestamp, conflict, idempotency, retry, audit.
- [x] Current runtime відділено від target contract.
- [x] Gmail snooze не сфабриковано.
- [x] Current runtime base та gaps після D‑13/D‑17/D‑20/D‑22/D‑23 зафіксовано без перебільшення capabilities.
- [x] N‑21 single state outbox додано без нового vault/API generation; Gmail snooze write/deadline не сфабриковано, bulk migration лишається чесно позначеним gap.
- [x] §4.11 capability-safe acceptance офіційно не вимагає Gmail Snooze write: Gmail Snooze = provider→UI membership projection із `deadlineCapability: unavailable`; local Snooze = `mail_snoozes_v1`, `providerWrite:not_attempted`, capability `unsupported`.
- [x] Двосторонній acceptance §4.11 застосовується тільки до документованих provider-write states: read/unread, STARRED, INBOX/archive, TRASH, SPAM і Gmail user-label membership; `IMPORTANT` лишається окремо capability-gated до явного current state-command contract.
- [x] Заборонено вважати §4.11 незавершеним лише через відсутність Gmail Snooze write API; одночасно заборонено підміняти це undocumented endpoint, Gmail UI automation або вигаданим `SNOOZED` label.
