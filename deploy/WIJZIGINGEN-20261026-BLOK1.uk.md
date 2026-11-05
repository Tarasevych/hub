> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./WIJZIGINGEN-20261026-BLOK1.md)) · [🇳🇱 **Nederlandse versie**](./WIJZIGINGEN-20261026-BLOK1.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

## AX. Блок 1 «швидкі виправлення» (26.10.2026)

Перший із восьми блоків плану `PLAN-8-BLOKIV-2026-10-25.md` (пп. 1.1–1.4, 2.5, 6.1, 6.3, 8.1–8.3, 8.6). Зведення з `concept-AX.md`. База: `374dde7` (`werk-20261024`).

Дії листа з одного реєстру, панель рядка в межах рядка, «Перегляд» першою дією, згорнуті листи без `bottom !important`, вкладення не ростуть у рядку, шапки вікон беруть виміряну `--plaats-boven-reserve`, інструкції ChatGPT в перших 512 знаках, вікно «Підтвердіть доступ» не розтягує прапорець.

### Перевірки ({{PEREVIRKY}})

Середовище продовження: Node v22.23.3 (репозиторій просить ≥ 24; `npm ci` пройшов із попередженням EBADENGINE). Postgres у цьому середовищі немає.

| Набір | Результат |
| --- | --- |
| `bevestig-toegang-opmaak-20261025` | 19/19 |
| `connector-instructies-20261025` | усі перелічені перевірки OK (разом із рештою фільтра `20261025`) |
| `mail-acties-20261025` | 52/52 |
| `mail-geminimaliseerd-20261025` | 39/39 |
| `plaatsing-20261025` | 68/68 після дозволу старої резерви в `scripts/plaatsing-vaste-elementen.json` → `kopReserves` |
| `agent-verbinden-20261020` | 65/65 |
| `lees-venster-20261024` | 46/46 |
| `mail-rij-mobiel-20261021` | 34/34 |
| `mail-ux-beoordeling-20261021` | 47/47 |
| `rls.test` і `audit-rls` | OVERGESLAGEN: немає `DATABASE_URL_APP` і ролей Postgres. Це не доказ RLS. |

Повний `eenheidstests.mjs` без фільтра і стенд (`keten-b1.sh`) тут не запускались: стенд, Playwright і Postgres 55432 у переданих архівах відсутні. Файл `keten-b1.voortgang` обірвався на `blok1-voor`; каталоги знімків `uit-na` / `uit-voor` не передані, тож зображень «до/після» зі стенду немає.

Виправлення під час цієї перевірки: один запис у `kopReserves` для старого `padding-right:4rem` шапки робочого місця вкладень. Без нього `plaatsing-20261025` падав на перевірці K (1 з 68).
