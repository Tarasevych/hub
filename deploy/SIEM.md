# Журнал → ваш SIEM (етап E)

Кожен запис журналу безпеки (`app.audit`) тепер має три поля контексту:

| Поле | Що означає | Звідки |
|---|---|---|
| `profiel` | дію виконано з **технічного профілю** (`tech-…`), активного в цій вкладці | сервер, автоматично |
| `namens` | перегляд **від імені** користувача (запит підтримки, лише за згодою) | модуль підтримки |
| `ruimte` | робочий **простір**, якого стосується дія | дані дії (`workspaceId`) |

Поля зберігаються в `details._ctx`, тобто **під тим самим ланцюжком хешів**, що й увесь запис: змінити їх непомітно не можна.
Для фільтрів у базі є похідні колонки `ctx_profiel`, `ctx_namens`, `ctx_ruimte` (міграція 0039). На сайті в журналі
(«Агенти → Журнал») такі записи позначено «ТЕХ» (жовтим) і «від імені» (червоним).

## Експорт у SIEM на цьому ж сервері

За замовчуванням **вимкнено**. Нічого не йде назовні: є лише два напрямки, обидва на цій машині.

1. **Файл NDJSON** `/var/log/mijn-ruimte/audit.ndjson`: один JSON на рядок. Його читає агент вашого SIEM (Wazuh agent,
   Promtail/Grafana Alloy, Vector, Fluent Bit). Тека `2750`, група `adm` (якщо є), logrotate щодня, 30 днів.
2. **Loki** через push-API, **лише** `http://127.0.0.1`, `localhost` або `[::1]`. Іншу адресу відхиляють і інсталятор, і сайт.
   Щоб журнал потрапив на іншу машину, поставте там агент, який читає файл з пункту 1.

### Увімкнути (як beheer, після встановлення цього випуску)
```bash
sudo /usr/local/sbin/mijn-ruimte-installeer siem aan --bestand
# або Loki на цьому сервері:
sudo /usr/local/sbin/mijn-ruimte-installeer siem aan --loki http://127.0.0.1:3100
# обидва одразу; --vanaf-begin = також уся наявна історія (за замовчуванням — лише нові записи)
sudo /usr/local/sbin/mijn-ruimte-installeer siem aan --bestand --loki http://127.0.0.1:3100
```
Команда пише в `/etc/mijn-ruimte/siem.env` лише рядки `SIEM_…` (root:mijnruimte, 0640) і перезапускає сайт.

### Вимкнути
```bash
sudo /usr/local/sbin/mijn-ruimte-installeer siem uit
```
Видаляє лише `siem.env`. Наявні файли в `/var/log/mijn-ruimte` лишаються.

### Стан
Технічний профіль з правом читати журнал (Адміністратор, Аудитор, Власник) → «Щось не працює? Перевірка» → «Журнал і SIEM»:
скільки надіслано, скільки чекає, остання помилка. Кожен напрямок має свій курсор: якщо Loki недоступний, файл пишеться далі.
Після відновлення Loki отримує ті самі записи без пропусків. Кожен рядок має `id` і `hash`, тож дублікати SIEM розпізнає.

## Формат рядка
```json
{"@timestamp":"2026-10-14T09:12:28.123Z","host":"mijn-ruimte-webserver","bron":"mijn-ruimte","id":"81234","seq":512,
 "hash":"…","prev_hash":"…","event":{"action":"owner.flags.gewijzigd","category":"beveiliging","outcome":"success"},
 "owner":"…","actor":"…","service":"mcp","device":"Chrome/Windows","ip_hash":"…",
 "profiel":"tech-3f9a1c0b7e2d","activatie":"…","namens":null,"ruimte":null,"details":{"sleutel":"nieuwe-editor","aan":true}}
```
Ніколи не експортуються:
- поля, схожі на секрети (`token`, `secret`, `password`, `key`, `code`, `cookie`, `ticket`, `signature`, `nonce`, `pkce` — також вкладені);
- IP-адреса у відкритому вигляді (лише HMAC-хеш, як у самому журналі).

## Приклади для поширених SIEM
- **Wazuh agent** (`/var/ossec/etc/ossec.conf`):
  ```xml
  <localfile><log_format>json</log_format><location>/var/log/mijn-ruimte/audit.ndjson</location></localfile>
  ```
  Користувач `wazuh` має бути в групі `adm`.
- **Promtail** (до Loki): `job_name: mijn-ruimte`, `__path__: /var/log/mijn-ruimte/audit.ndjson`, `pipeline_stages: [json: {expressions: {action: event.action}}]`.
- **Loki напряму**: `--loki http://127.0.0.1:3100`; мітки `app="mijn-ruimte"`, `bron="audit"`, `categorie=<тип>`.
  Запит: `{app="mijn-ruimte"} | json | profiel != ""` — дії з технічного профілю.

## Чому так
- Без зовнішніх хмар (BYOS): експорт лише на цій машині; передавати далі — рішення власника і його агента.
- Журнал на сайті лишається головним (ланцюжок хешів, видалення лише через `audit_verwijderen`); SIEM — копія для пошуку,
  кореляції й зберігання поза базою сайту.
- Нові поля не змінюють `app.audit_hash`: старі й нові записи перевіряються однаково.
