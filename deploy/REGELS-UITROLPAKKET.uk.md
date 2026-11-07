> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./REGELS-UITROLPAKKET.md)) · [🇳🇱 **Nederlandse versie**](./REGELS-UITROLPAKKET.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

# Правила пакета оновлення

Для кожного, хто збирає пакет для Mijn Ruimte: людини чи ШІ-агента (Claude, GPT, Cursor, …), навіть якщо ви не знаєте історії проєкту.
Сервер перевіряє ці правила **тричі**: у браузері (майстер «Нове оновлення»), на сайті (попередня перевірка) і в root-скрипті
(`deploy/uitrol/mijn-ruimte-uitrol.sh`). Пакет, що порушує правило, **не встановлюється**, а користувач бачить код і пояснення.

## 1. Обов'язкові файли

Усі файли лежать у **єдиній верхній теці** `mijn-ruimte-<ВЕРСІЯ>/` архіву `mijn-ruimte-<ВЕРСІЯ>.tar.gz`.

| Файл | Вміст | Навіщо | Без нього |
|---|---|---|---|
| `UITROL-VERSIE` | `РРРРММДД-ГГХХСС`, дорівнює версії в назві й **новіша** за встановлену | захист від повернення стану старим пакетом | `GEEN_VERSIE`, `VERSIE_VERSCHILT`, `NIET_NIEUWER` |
| `AUTEUR` | хто автор (≥ 3 символи), напр. `Eigenaar Test` | відповідальність | `GEEN_AUTEUR`, `AUTEUR_ONGELDIG` |
| `AGENT` | через якого агента: `claude`, `cursor`, `gpt`… (малі літери) | видно, хто готував | `GEEN_AGENT`, `AGENT_ONGELDIG` |
| `SAMENVATTING` | що змінено й навіщо, що було/з'явилося/зникло (≥ 20 символів) | власник бачить, що схвалює | `GEEN_SAMENVATTING`, `SAMENVATTING_TE_KORT` |
| `BRON-COMMIT` | **повний** git-коміт (40 hex) **або** `zonder-git:<причина>` | видно, який код працює; складання можна відтворити | `GEEN_BRON_COMMIT` |
| `ONTWIKKELARCHIEF.json` | з `20261103-211555`: SHA-256 документа історії у GitHub commit + відповідна гілка + посилання на GitHub Release із точною `.tar.gz` | повне, перевірюване походження змін | `GEEN_ONTWIKKELARCHIEF`, `ONTWIKKELARCHIEF_ONGELDIG`, `ONTWIKKELARCHIEF_ONBEREIKBAAR`, `ONTWIKKELARCHIEF_PAKKET_SHA_VERSCHILT` |
| `deploy/installeer-app.sh` | інсталятор з цього ж коду | встановлення | `GEEN_INSTALLER` |

Заборонено в архіві: символьні/жорсткі посилання, пристрої, абсолютні шляхи, `..`, більше однієї верхньої теки
(`INHOUD_ONVEILIG`); `node_modules`, `dist`, звіти (розмір ≤ 300 МБ, `TE_GROOT`).

### Правило 3: BRON-COMMIT (з 18.10.2026)

- `unknown`, порожньо, короткий хеш (`abc1234`) → **відмова** `GEEN_BRON_COMMIT`. Раніше живий сайт показував «unknown», і ніхто не міг сказати, який код працює.
- `zonder-git:<причина>` (причина ≥ 5 символів) дозволено **лише явно**, коли git справді недоступний. На сайті це видно як попередження «зібрано поза git: причина».

## 2. Як зібрати

```bash
# 1) з git (рекомендовано): BRON-COMMIT = HEAD, лише закомічений код
AUTEUR="Eigenaar Test" AGENT=claude SAMENVATTING="Що змінено і навіщо (мінімум 20 символів)" \
  deploy/uitrol/maak-voorstelpakket.sh /tmp/uit            # непідписаний пакет → сайт → passkey власника
AUTEUR=… AGENT=… SAMENVATTING=… deploy/uitrol/maak-uitrolpakket.sh ~/.ssh/uitrol-sleutel /tmp/uit   # підписаний ключем

# 2) поза git — лише з явною причиною
AUTEUR=… AGENT=claude SAMENVATTING=… deploy/uitrol/maak-voorstelpakket.sh --zonder-git "складання в пісочниці агента без історії git" /tmp/uit
```

Windows: `powershell -File deploy\uitrol\maak-uitrolpakket.ps1 [-ZonderGit "причина"]`.

Збираєте пакет вручну (без скриптів)? Покладіть усі обов'язкові файли з таблиці у верхню теку, а `BRON-COMMIT` візьміть з `git rev-parse HEAD`
(не `--short`). Перевірка перед завантаженням: майстер на сайті одразу покаже, чого бракує.

## 3. Що бачить власник

- Відмова: статус «Відхилено сервером · <назва коду>», текст причини й «Що робити» (`shared/uitrol-codes.ts` — переклад **кожного** коду; тест `uitrol-codes` перевіряє скрипти).
- Збій встановлення: «Причина» — **перший** справжній рядок помилки (напр. `error TS6133 …`) і кілька рядків контексту; крок, на якому зламалося.
- Перерване ззовні (зупинка служби, тайм-аут systemd 45 хв) → `ONDERBROKEN`; внутрішня помилка скрипта → `AFGEBROKEN`. Статус «встановлюється» більше ніколи не «висить».

## 4. Для розробників скриптів

- Нова відмова в root-скрипті? `weiger НОВИЙ_КОД "uk" "nl"` **і** запис у `shared/uitrol-codes.ts` — інакше тест `uitrol-codes` впаде.
- Новий крок інсталятора? `voortgang <id> <pct> "tekst"` у `deploy/installeer-app.sh` + текст у `installeer_stappen()` root-скрипта + `subVanRegel` у `backend/uitrol-runs.ts`.
- Тайм-аути: `shared/uitrol-tijden.ts` (тест `uitrol-tijden` звіряє їх із `TimeoutStartSec` у service-файлах).

## 5. UITROL-MANIFEST.json і TESTRESULTATEN v2 (UI-010, з 29.10.2026)

**Обов'язково для `UITROL-VERSIE` ≥ `20261101-000000`** (`shared/uitrol-manifest.ts`, `MANIFEST_VERPLICHT_VANAF`). Старі пакети без нього
й надалі встановлюються, але бачать попередження «старий формат». Перевіряють браузер (майстер) і попередня перевірка сайту; той самий модуль.
Root-скрипт маніфест (ще) не перевіряє; отже, встановлення через SSH без попередньої перевірки пропускає це правило (див. STATUS UI-010).

```json
{
  "schema": 1, "versie": "<UITROL-VERSIE>", "aangemaakt": "2026-10-29T19:00:00+01:00",
  "herkomst": "git: <branch>@<commit> (basis <versie>)", "auteur": "Eigenaar Test", "zonderAi": false,
  "deelnemers": [
    { "soort": "mens", "naam": "Eigenaar Test", "rollen": ["auteur", "controle"] },
    { "soort": "ai", "naam": "grok", "platform": "Grok Bot", "tool": "executor", "model": { "id": null, "versie": null, "bron": "onbekend" }, "rollen": ["ontwikkeling", "testen", "verpakken"] }
  ],
  "beschrijving": {
    "uk": { "titel": "…", "samenvatting": "… (≥ 20, кирилиця)", "wijzigingen": [], "fixes": [], "beperkingen": [], "instructies": "" },
    "nl": { "titel": "…", "samenvatting": "… (≥ 20)", "wijzigingen": [], "fixes": [], "beperkingen": [], "instructies": "" }
  }
}
```

- `rollen`: `ontwikkeling`, `controle`, `testen`, `verpakken`, `auteur`.
- `model.bron`: `omgeving` (підтверджено середовищем), `auteur` (заявлено автором),
  `onbekend` (тоді `id` = null). «Claude», «Grok», «GPT» — це не id моделі й відхиляються.
- Без ШІ: `"zonderAi": true` + людина з роллю `ontwikkeling`.
- Переліки `wijzigingen/fixes/beperkingen` uk і nl мають однакову кількість пунктів.
- Помилки показуються з точною назвою поля (`beschrijving.uk.titel`, `deelnemers[1].model.id` …).
  Коди: `GEEN_MANIFEST`, `MANIFEST_ONGELDIG`.

**TESTRESULTATEN v2** (необов'язковий, але рекомендований):

```json
{ "geslaagd": 10103, "mislukt": 61,
  "basis": { "versie": "20261029-131639", "geslaagd": 9893, "mislukt": 62 },
  "falend": [ { "bestand": "tests/eenheid/agent-namens.test.ts", "aantal": 3, "ookOpBasis": true, "reden": "geen lokale instellingen" } ],
  "uitleg": { "uk": "Старі тести, що падали й до змін", "nl": "Oude tests die ook vóór de wijzigingen faalden" } }
```

Сайт показує, які саме файли падали, і чи падали вони на базовій версії («ook op basis») чи нові («NIEUW»). Без `falend` — «деталі недоступні в цьому пакеті».

Складання: `MANIFEST=pad/UITROL-MANIFEST.json TESTRESULTATEN_BESTAND=pad/testen.json AUTEUR=… AGENT=… SAMENVATTING=… deploy/uitrol/maak-voorstelpakket.sh /tmp/uit`

## 6. UITROL-BASIS і пакет передачі (ORCH-001, з 31.10.2026)

**`UITROL-BASIS`** — на якій ВСТАНОВЛЕНІЙ версії й commit зібрано пакет (`key=value`, по рядку): `versie=РРРРММДД-ГГХХСС`, `commit=<40 hex>`,
за наявності `orchestratie/regels.lock.json` також `regelsVersie=`, `regelsHash=`. Пишуть `maak-voorstelpakket.sh` / `maak-uitrolpakket.sh`
із `BASIS_VERSIE` + `BASIS_COMMIT` (разом і валідні, інакше відмова); найпростіше — `node scripts/orch.mjs pakket` (бере базу з
`orchestratie/geinstalleerd.json`, інакше з `beleid.json → basis`). **Обов'язково для `UITROL-VERSIE` ≥ `20261201-000000`** (`GEEN_BASIS`);
старіші пакети без нього встановлюються з записом «oud formaat» у лозі.

Root-інсталятор (`deploy/uitrol/mijn-ruimte-uitrol.sh`) після підпису й версії перевіряє:

| Код | Коли |
|---|---|
| `BASIS_ONGELDIG` | `UITROL-BASIS` є, але без коректних `versie`/`commit` |
| `BASIS_VEROUDERD` | `versie` у `UITROL-BASIS` старіша за `$WERK_ROOT/laatste-versie` — хтось установив між складанням й цим пакетом; rebase і зібрати знову |
| `BASIS_COMMIT_VERSCHILT` | `commit` ≠ `$WERK_ROOT/laatste-commit` (root пише його після кожної вдалої встановлення з 40-hex `BRON-COMMIT`) |
| `GEEN_BASIS` | версія ≥ `20261201-000000` без `UITROL-BASIS` |
| `REGELS_NIET_VERGRENDELD` | у пакеті є `orchestratie/regels.lock.json`, але відбиток правил (`AGENTS.md`, `beleid.json`, `BESLUITEN.md`; LF, без кінцевих пробілів) або `regelsVersie` не збігається |
| `MODUS_NIET_TOEGESTAAN` | `beleid.json → kritiek.installatieModi.toegestaan` не містить потрібного режиму (`na_bevestiging` для passkey/підпису; `automatisch_beperkt` + підписаний lock для GitOps `gitops-ophalen.sh`) |

Переклади кодів — `shared/uitrol-codes.ts` (тест `uitrol-codes` стежить, щоб кожен `weiger CODE` мав uk/nl).

**Пакет передачі** `mijn-ruimte-<versie>-<agent>-overdracht.zip` (`node scripts/orch.mjs pakket --taak <ID> --auteur "…"`) містить: `mijn-ruimte-<versie>.tar.gz`
(той самий сумісний архів, встановлюється ЛИШЕ він), `.tar.gz.sha256`, `.voorstel.json`, `ORCH-OVERDRACHT.json` (taakId, agent, `basisCommit` = база
гілки задачі, `installatie` = встановлена база, коміти, файли, тести, `pakket.sha256`/`bronCommit`/`modus`), `UITROL-MANIFEST.json`, `TESTRESULTATEN.json`,
`RAPPORT.md` (uk+nl), `COMMITS.txt` + `commits.bundle`, `AGENTEN.json`, `LEESMIJ.txt`, і `.tar.gz.sig` лише якщо власник підписав на своєму ПК
(приватні ключі агентам не передаються). Перевірка без встановлення: `node scripts/orch.mjs pakket-controleer --bron <zip>` (назва, цілісність,
`UITROL-VERSIE`/`BRON-COMMIT`/`AGENT`/`UITROL-BASIS` ↔ метадані, база ↔ `geinstalleerd.json`, правила ↔ lock, `deploy/installeer-app.sh`,
без `node_modules/dist/.git`). Імпорт без git на іншому боці: `node scripts/orch.mjs inleveren --bron <zip>` — спершу цілісність, далі вміст `tar.gz`
на нову гілку від `basisCommit`; службові файли архіву (`UITROL-*`, `AUTEUR`, `AGENT`, …) у гілку не потрапляють.

## 7. TRACE-001 — обов'язковий архів процесу в GitHub (з 20261103-211555)

**Кожний новий пакет мусить містити `ONTWIKKELARCHIEF.json`.** Цей файл створює штатна команда `node scripts/orch.mjs pakket` із **вже закоміченого** документа `orchestratie/ontwikkelarchieven/<TASK-ID>.json`. Складання поза Git для наступних версій заборонена.

Документ на GitHub зберігає весь **доступний і безпечний** доказовий матеріал про завдання:

1. Запит користувача та фактичні уточнення — текст/посилання, без персональних секретів;
2. Хронологія кроків, час, спроби, помилки, успішні й невдалі результати;
3. Рішення і стислий опис причин, альтернативи, компроміси, відхилені варіанти;
4. Зміни по файлах та commit SHA, PR, посилання на CI, контрольні суми;
5. Тести: команди, вихідні результати, обмеження середовища, невиконані перевірки;
6. Вкладення, чернетки, тимчасові файли — безпечні посилання і хеші; якщо джерело тимчасово недоступне, це явно зазначається;
7. Розділ приватності: дані, які **свідомо не публікували**, і причина.

Не можна вимагати або зберігати приватний прихований процес мислення ШІ, паролі, токени, ключі, вміст листів чи неочищені приватні файли. Замість цього — рішення, перевірювані кроки, фактичні результати й пояснення.

Формат посилання в `ONTWIKKELARCHIEF.json`:

```json
{
  "schema": 1,
  "taakId": "TRACE-001",
  "repo": "Tarasevych/hub",
  "tak": "feature/trace-001-20261103-214810",
  "commit": "<40-hex git commit (тотожний BRON-COMMIT)>",
  "pad": "orchestratie/ontwikkelarchieven/TRACE-001.json",
  "sha256": "<64-hex SHA-256 документа>",
  "url": "https://github.com/Tarasevych/hub/blob/<commit>/orchestratie/ontwikkelarchieven/TRACE-001.json",
  "release": "https://github.com/Tarasevych/hub/releases/tag/<UITROL-VERSIE>",
  "pakket": "mijn-ruimte-<UITROL-VERSIE>.tar.gz"
}
```

Сайт і root-інсталятор **без винятків** відхиляють пакет, якщо:
- документа або посилання немає, JSON невалідний, SHA-256 документа неправильний;
- commit не відповідає `BRON-COMMIT` або не є предком заявленої гілки;
- GitHub Release за версією відсутній чи не містить файл `pakket`;
- `asset.digest` на GitHub не дорівнює SHA-256 **завантаженого** `.tar.gz`;
- GitHub недоступний, приватний репозиторій без налаштованого доступу або є помилка авторизації.

Перевірка GitHub відбувається **лише за фіксованою адресою API** `api.github.com/repos/Tarasevych/hub`, ніколи за довільною адресою з пакета (захист SSRF). Якщо репозиторій приватний, на сайті потрібен токен із власної захищеної скриньки GitHub; на root-інсталяторі — окремо налаштований root-only `/etc/mijn-ruimte/github-token` (0600). Якщо доступ відсутній, відмова без обходу. Власник окремо підтверджує встановлення Passkey.

Сам TAR.GZ публікується як GitHub Release asset, а вихідні файли та журнал — як git-коміт: так унеможливлюється кругове посилання, коли пакет мусив би містити свій власний SHA.
