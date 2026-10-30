# Правила пакета оновлення · Regels voor een uitrolpakket

Для кожного, хто збирає пакет для Mijn Ruimte: людини чи ШІ-агента (Claude, GPT, Cursor, …), навіть якщо ви не знаєте історії проєкту.
Сервер перевіряє ці правила **тричі**: у браузері (майстер «Нове оновлення»), на сайті (попередня перевірка) і в root-скрипті
(`deploy/uitrol/mijn-ruimte-uitrol.sh`). Пакет, що порушує правило, **не встановлюється**, а користувач бачить код і пояснення.

Voor iedereen die een pakket voor Mijn Ruimte bouwt — mens of AI-agent — ook zonder voorkennis van het project. De server controleert deze
regels **drie keer**: in de browser (wizard «Нове оновлення»), op de site (voorcontrole) en in het root-script. Een pakket dat een regel
breekt, wordt **niet** geïnstalleerd; de gebruiker ziet een code met uitleg.

## 1. Обов'язкові файли · Verplichte bestanden

Усі файли лежать у **єдиній верхній теці** `mijn-ruimte-<ВЕРСІЯ>/` архіву `mijn-ruimte-<ВЕРСІЯ>.tar.gz`.
Alle bestanden staan in **één bovenmap** `mijn-ruimte-<VERSIE>/` van `mijn-ruimte-<VERSIE>.tar.gz`.

| Файл · Bestand | Вміст · Inhoud | Навіщо · Waarom | Без нього · Zonder |
|---|---|---|---|
| `UITROL-VERSIE` | `РРРРММДД-ГГХХСС`, дорівнює версії в назві й **новіша** за встановлену · gelijk aan de naam en **nieuwer** dan de geïnstalleerde | захист від відкату старим пакетом · geen terugrol met een oud pakket | `GEEN_VERSIE`, `VERSIE_VERSCHILT`, `NIET_NIEUWER` |
| `AUTEUR` | хто автор (≥ 3 символи), напр. `Eigenaar Test` · wie de auteur is | відповідальність · verantwoordelijkheid | `GEEN_AUTEUR`, `AUTEUR_ONGELDIG` |
| `AGENT` | через якого агента: `claude`, `cursor`, `gpt`… (малі літери) · via welke agent | видно, хто готував · zichtbaar wie voorbereidde | `GEEN_AGENT`, `AGENT_ONGELDIG` |
| `SAMENVATTING` | що змінено й навіщо, що було/з'явилося/зникло (≥ 20 символів) · wat en waarom | власник бачить, що схвалює · de eigenaar ziet wat hij goedkeurt | `GEEN_SAMENVATTING`, `SAMENVATTING_TE_KORT` |
| `BRON-COMMIT` | **повний** git-коміт (40 hex) **або** `zonder-git:<причина>` · **volledige** commit **of** `zonder-git:<reden>` | видно, який код працює; збірку можна відтворити · welke code draait; build is te herhalen | `GEEN_BRON_COMMIT` |
| `deploy/installeer-app.sh` | інсталятор з цього ж коду · de installer uit dezelfde code | встановлення · installatie | `GEEN_INSTALLER` |

Заборонено в архіві · Verboden in het archief: символьні/жорсткі посилання, пристрої, абсолютні шляхи, `..`, більше однієї верхньої теки
(`INHOUD_ONVEILIG`); `node_modules`, `dist`, звіти (розмір ≤ 300 МБ, `TE_GROOT`).

### Правило 3: BRON-COMMIT (з 18.10.2026) · Regel 3

- `unknown`, порожньо, короткий хеш (`abc1234`) → **відмова** `GEEN_BRON_COMMIT`. Раніше живий сайт показував «unknown», і ніхто не міг сказати, який код працює.
- `zonder-git:<причина>` (причина ≥ 5 символів) дозволено **лише явно**, коли git справді недоступний. На сайті це видно як попередження «зібрано поза git: причина».
- «unknown», leeg of een korte hash → **geweigerd**. `zonder-git:<reden>` mag alleen **uitdrukkelijk**; de site toont dit als waarschuwing.

## 2. Як зібрати · Hoe bouwen

```bash
# 1) з git (рекомендовано · aanbevolen): BRON-COMMIT = HEAD, лише закомічений код
AUTEUR="Eigenaar Test" AGENT=claude SAMENVATTING="Що змінено і навіщо (мінімум 20 символів)" \
  deploy/uitrol/maak-voorstelpakket.sh /tmp/uit            # непідписаний пакет → сайт → passkey власника
AUTEUR=… AGENT=… SAMENVATTING=… deploy/uitrol/maak-uitrolpakket.sh ~/.ssh/uitrol-sleutel /tmp/uit   # підписаний ключем

# 2) поза git — лише з явною причиною · buiten git — alleen met een reden
AUTEUR=… AGENT=claude SAMENVATTING=… deploy/uitrol/maak-voorstelpakket.sh --zonder-git "збірка в пісочниці агента без історії git" /tmp/uit
```

Windows: `powershell -File deploy\uitrol\maak-uitrolpakket.ps1 [-ZonderGit "причина"]`.

Збираєте пакет вручну (без скриптів)? Покладіть усі шість файлів з таблиці у верхню теку, а `BRON-COMMIT` візьміть з `git rev-parse HEAD`
(не `--short`). Перевірка перед завантаженням: майстер на сайті одразу покаже, чого бракує.
Handmatig? Zet alle zes bestanden in de bovenmap; `BRON-COMMIT` uit `git rev-parse HEAD` (niet `--short`).

## 3. Що бачить власник · Wat de eigenaar ziet

- Відмова: статус «Відхилено сервером · <назва коду>», текст причини й «Що робити» (`shared/uitrol-codes.ts` — переклад **кожного** коду; тест `uitrol-codes` перевіряє скрипти).
- Збій встановлення: «Причина» — **перший** справжній рядок помилки (напр. `error TS6133 …`) і кілька рядків контексту; крок, на якому зламалося.
- Перерване ззовні (зупинка служби, тайм-аут systemd 45 хв) → `ONDERBROKEN`; внутрішня помилка скрипта → `AFGEBROKEN`. Статус «встановлюється» більше ніколи не «висить».
- Weigering: code + uitleg + «wat nu». Mislukte installatie: de eerste echte foutregel + context. Onderbroken → `ONDERBROKEN`, interne fout → `AFGEBROKEN`.

## 4. Для розробників скриптів · Voor wie de scripts wijzigt

- Нова відмова в root-скрипті? `weiger НОВИЙ_КОД "uk" "nl"` **і** запис у `shared/uitrol-codes.ts` — інакше тест `uitrol-codes` впаде.
- Новий крок інсталятора? `voortgang <id> <pct> "tekst"` у `deploy/installeer-app.sh` + текст у `installeer_stappen()` root-скрипта + `subVanRegel` у `backend/uitrol-runs.ts`.
- Тайм-аути: `shared/uitrol-tijden.ts` (тест `uitrol-tijden` звіряє їх із `TimeoutStartSec` у service-файлах).

## 5. UITROL-MANIFEST.json і TESTRESULTATEN v2 (UI-010, з 29.10.2026) · UITROL-MANIFEST.json en TESTRESULTATEN v2

**Обов'язково для `UITROL-VERSIE` ≥ `20261101-000000`** (`shared/uitrol-manifest.ts`, `MANIFEST_VERPLICHT_VANAF`). Старі пакети без нього
й надалі встановлюються, але бачать попередження «старий формат». Перевіряють браузер (майстер) і попередня перевірка сайту; той самий модуль.
**Verplicht vanaf `UITROL-VERSIE` `20261101-000000`.** Oudere pakketten zonder manifest blijven installeerbaar (waarschuwing «oud formaat»).
Gecontroleerd door de wizard (browser) en de voorcontrole van de site, met dezelfde module. Het root-script controleert het manifest (nog) niet;
een SSH-installatie zonder voorcontrole slaat deze regel dus over (zie STATUS UI-010).

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
- `model.bron`: `omgeving` (підтверджено середовищем · door de omgeving bevestigd), `auteur` (заявлено автором · door de auteur opgegeven),
  `onbekend` (тоді `id` = null). «Claude», «Grok», «GPT» — це не id моделі й відхиляються · zijn geen model-id en worden geweigerd.
- Без ШІ · zonder AI: `"zonderAi": true` + людина з роллю `ontwikkeling`.
- Переліки `wijzigingen/fixes/beperkingen` uk і nl мають однакову кількість пунктів · evenveel punten in uk en nl.
- Помилки показуються з точною назвою поля (`beschrijving.uk.titel`, `deelnemers[1].model.id` …) · fouten tonen de exacte veldnaam.
  Codes: `GEEN_MANIFEST`, `MANIFEST_ONGELDIG`.

**TESTRESULTATEN v2** (вільний, але рекомендований · vrijwillig, aanbevolen):

```json
{ "geslaagd": 10103, "mislukt": 61,
  "basis": { "versie": "20261029-131639", "geslaagd": 9893, "mislukt": 62 },
  "falend": [ { "bestand": "tests/eenheid/agent-namens.test.ts", "aantal": 3, "ookOpBasis": true, "reden": "geen lokale instellingen" } ],
  "uitleg": { "uk": "Старі тести, що падали й до змін", "nl": "Oude tests die ook vóór de wijzigingen faalden" } }
```

Сайт показує, які саме файли падали, і чи падали вони на базовій версії («ook op basis») чи нові («NIEUW»). Без `falend` — «деталі недоступні в цьому пакеті».

Збірка · bouwen: `MANIFEST=pad/UITROL-MANIFEST.json TESTRESULTATEN_BESTAND=pad/testen.json AUTEUR=… AGENT=… SAMENVATTING=… deploy/uitrol/maak-voorstelpakket.sh /tmp/uit`
