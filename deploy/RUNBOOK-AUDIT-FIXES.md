> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./RUNBOOK-AUDIT-FIXES.uk.md) · [🇳🇱 **Nederlandse versie**](./RUNBOOK-AUDIT-FIXES.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей / Index](../docs/INDEX.md)

# Runbook: розгортання виправлень за аудитом (гілка `beveiliging-fixes-audit`)

Мета: розгорнути випуск із виправленнями за аудитом (A1–A10, див. `SECURITY-NOTES.md` §3d) зі шляхом відкату після кожного кроку.
Цей випуск також містить усе з етапів 2 + 3 (`RUNBOOK-FASE-2-3.md`); якщо їх ще не розгорнуто на живому сервері, то
на кроці 3 також виконаються міграції 0003–0006, а крім того діятимуть §0 (pg_hba) та §4–9 тієї інструкції.

Усі команди виконуються від імені `root` на ВМ (`ssh … beheer@<VM-IP>`, далі `sudo -i`). Ніколи не показуйте і не копіюйте
значення секретів (не виконуйте `cat geheimen.env`; скрипти показують лише назви та довжину).
Час у журналах зазначено в UTC, якщо не вказано інше.

Короткий порядок дій: **резервна копія → перевірка tarball → `AUDIT_IP_PEPPER` → встановлення застосунку (міграції 0007 +
0008) → налаштування ролей → розділення середовища (`migratie.env`) → призначення адміністратора аудиту → оновлення архіву секретів →
перевірка.** Відкат: §9 (спершу `env-samenvoegen`!).

## 0. Попередні кроки

- [ ] Занотувати поточний випуск і стан схеми БД:
  ```
  /srv/mijn-ruimte/current/deploy/installeer-app.sh lijst
  runuser -u postgres -- psql -d mijnruimte -Atc "select version from app.schema_migrations order by 1"
  ```
- [ ] Свіжа резервна копія (`installeren` також створює її самостійно):
  ```
  systemctl start mijn-ruimte-backup.service && journalctl -u mijn-ruimte-backup -n 20 --no-pager
  ls -l /srv/backups/mijn-ruimte/ | tail -3        # найновіша тека з KLAAR
  ```
- [ ] Лише якщо ролі бази даних ще не існують (етап 2 ще не розгорнуто): перевірка `pg_hba` з
      `RUNBOOK-FASE-2-3.md` §0.
- [ ] Google (рекомендовано, можна й пізніше): Google Auth Platform → проєкт → **Settings** → **Advanced Settings** →
      увімкнути **Сесія age claims**. Без цього Google не надсилає `auth_time`, і повторний вхід через
      Google **не** зараховується як step-up (безпечна відмова / fail-closed); водночас step-up за допомогою TOTP-коду працює. Google може
      передавати `auth_time` лише для опублікованого/верифікованого OAuth-застосунку.
- [ ] Не вмикати під час розгортання: `AUTH_POORT_AFDWINGEN`, `ACCOUNT_DEFINITIEF_WISSEN`, RLS (`rls-aan`).

## 1. Передача tarball на ВМ і перевірка

На ПК (або там, де лежить tarball):
```
scp mijn-ruimte-beveiliging-fixes-audit-<stempel>-<sha>.tar.gz{,.sha256} beheer@<VM-IP>:/tmp/
```
На ВМ:
```
cd /tmp && sha256sum -c mijn-ruimte-beveiliging-fixes-audit-*.tar.gz.sha256        # має видати "OK"
rm -rf /root/bron-audit-fixes && mkdir -p /root/bron-audit-fixes
tar -xzf mijn-ruimte-beveiliging-fixes-audit-*.tar.gz -C /root/bron-audit-fixes
cat /root/bron-audit-fixes/mijn-ruimte/BRON-COMMIT                                  # коміт випуску
```

## 2. Створення `AUDIT_IP_PEPPER` (обов'язково)

```
/root/bron-audit-fixes/mijn-ruimte/deploy/geheimen-aanvullen.sh
grep -c '^AUDIT_IP_PEPPER=' /etc/mijn-ruimte/geheimen.env                           # 1
```
Скрипт додає лише відсутні ключі (наявні залишаються без змін) і не показує значень. Новий
застосунок не запуститься без цього pepper (≥ 32 символи), а `installeren` заздалегідь відмовить у встановленні. Старі значення `ip_hash` у
`app.audit` після цього неможливо пов'язати з новими (втрати даних немає). Поточний випуск ігнорує цю
змінну.

## 3. Встановлення застосунку (міграції 0007 і 0008 виконуються автоматично)

```
/root/bron-audit-fixes/mijn-ruimte/deploy/installeer-app.sh installeren /root/bron-audit-fixes/mijn-ruimte
```
Що відбувається: збірка (`npm ci`, build) → резервна копія → міграції (із `geheimen.env` + `migratie.env`, якщо він
існує) → `rechten.sql` → перемикання `current` → перезапуск → перевірка працездатності; якщо вона не проходить, відбувається автоматичний відкат
до попереднього випуску.

- `0007` змінює генеровану колонку `owner_id` (`SET EXPRESSION`): **один раз перезаписує `app.records`**
  (коротке ексклюзивне блокування; за поточного обсягу — лічені секунди). Далі політики, тригер `users`, допоміжні функції.
- `0008`: `app.audit_beheerders`, нові `audit_toevoegen`/`audit_verwijderen`. Лише додавання.
- `rechten.sql` забирає право INSERT на `app.audit`/`audit_kop`/`audit_beheerders` у ролей застосунку та системи й створює
  унікальний індекс `records_een_eigenaar`. Якщо у виводі є **ПОПЕРЕДЖЕННЯ про кількох власників**, створення індексу
  пропускається; сервер під час запуску переводить застарілого власника назад у `member`, а крок 4
  (`instellen`) достворює індекс.

Перевірка:
```
curl -s http://127.0.0.1:8080/__gezondheid                                          # {"ok":true,"db":true}
runuser -u postgres -- psql -d mijnruimte -Atc "select version from app.schema_migrations order by 1"   # до 0008 включно
journalctl -u mijn-ruimte -n 50 --no-pager | grep -E 'eigenaar|DATABASE_URL|AUDIT_IP_PEPPER|FOUT|Error'
```
Попередження `DATABASE_URL… staat in de app-omgeving` на цьому етапі ще очікуване (зникне після кроку 5).

## 4. Налаштування ролей бази даних (ідемпотентно)

```
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh instellen
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh status
```
Потрібно виконати, навіть якщо ролі вже існували: Postgres тепер отримує лише SCRAM-верифікатор (жодного пароля у SQL чи
журналі); наявні паролі використовуються повторно. Якщо перевірка працездатності не проходить, скрипт повертає старий
стан. Очікується: `afdwingen=uit`, `force_rls=t`, три ролі, `DATABASE_URL_APP/_SYSTEM=geheimen.env`.

## 5. Розділення середовища: `migratie.env`

```
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh env-splitsen
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh status
ls -l /etc/mijn-ruimte/migratie.env                                                 # -rw------- root root
```
`DATABASE_URL` (стара роль власника) і `DATABASE_URL_MIGRATIE` переносяться до `/etc/mijn-ruimte/migratie.env`;
служби `mijn-ruimte`, `-cron@`, `-backup` завантажують лише `geheimen.env`. Перезапуск + перевірка працездатності; якщо вона
не проходить, скрипт автоматично відновлює обидва файли. Повторний запуск нічого не змінює.
Очікується в `status`: `DATABASE_URL=migratie.env`, `DATABASE_URL_MIGRATIE=migratie.env`,
`DATABASE_URL_APP=geheimen.env`, `DATABASE_URL_SYSTEM=geheimen.env`, `AUDIT_IP_PEPPER=geheimen.env`,
`audit_insert_app=false audit_insert_system=false`.

## 6. Призначення адміністратора аудиту

Лише акаунти в `app.audit_beheerders` мають право видаляти старі записи аудиту (крім того потрібні: super/security-admin,
step-up, причина, вік запису понад 24 год). Сам застосунок не може змінювати цей список.
```
/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh audit-beheerder <OWNER_EMAIL>
# відкликати: … audit-beheerder-weg <e-mail|user-id>
```

## 7. Оновлення архіву секретів (офлайн-резервна копія)

`migratie.env` тепер належить до секретів. Створіть новий зашифрований архів (на ВМ лежить лише публічний ключ)
і збережіть його у визначеному місці на ПК (`R:\mijn-ruimte-reservekopie\geheimen\geheimen-<stempel>\`, див.
`HERSTEL.md` §3):
```
st=$(date +%Y%m%d-%H%M%S); cd /
tar -cpf - etc/mijn-ruimte/geheimen.env etc/mijn-ruimte/migratie.env etc/cloudflared/*.json \
  | age -R /etc/mijn-ruimte/backup-ontvanger.age.pub > /root/geheimen-$st.tar.age
sha256sum /root/geheimen-$st.tar.age > /root/geheimen-$st.tar.age.sha256
```
Завантажте через `scp` на ПК, перевірте там хеш (`Get-FileHash`), після чого на ВМ виконайте `shred -u /root/geheimen-$st.*`.

## 8. Перевірка

```
D=/srv/mijn-ruimte/current/deploy
$D/db-rollen-instellen.sh status
curl -s http://127.0.0.1:8080/__gezondheid
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/        # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/api//owner/session/bootstrap   # 404
systemctl cat mijn-ruimte | grep EnvironmentFile                                     # лише geheimen.env
journalctl -u mijn-ruimte -n 50 --no-pager | grep -E 'DATABASE_URL|AUDIT_IP_PEPPER|FOUT|Error'   # порожньо
runuser -u postgres -- psql -d mijnruimte -Atc "select has_table_privilege('mijnruimte_system','app.audit','INSERT'), has_table_privilege('mijnruimte_app','app.audit','INSERT')"   # f|f
runuser -u postgres -- psql -d mijnruimte -Atc "select indexname from pg_indexes where indexname='records_een_eigenaar'"   # 1 рядок
runuser -u postgres -- psql -d mijnruimte -Atc "select count(*) from app.records where tbl='users' and data->>'role'='owner'"   # 1
systemctl start mijn-ruimte-backup.service && journalctl -u mijn-ruimte-backup -n 20 --no-pager   # має пройти успішно
systemctl list-timers 'mijn-ruimte-*'
```
Швидка перевірка (smoke test) у браузері (hub, id, admin, mail, cloud):
1. Увійти через Google; відкрити робочий простір, пошту та хмару.
2. Чутлива дія (напр., експорт даних, розкриття секрету в сховищі або блокування користувача в адмінці): з'являється запит на
   **TOTP-код**. Ввести код → дія виконується. Залишити порожнім → перенаправлення до Google (повторне введення пароля);
   після цього повторити саму дію. Якщо маршрут через Google не спрацьовує (немає `auth_time`, див. §0), скористайтеся TOTP.
3. Створити посилання спільного доступу і відкликати його; переконатися, що глядач не може змінювати вміст.
4. За кілька днів: `db-rollen-instellen.sh status` → таблиця `app.rls_audit` має залишатися порожньою (лише тоді
   можна за бажанням вмикати `rls-aan`, див. `RUNBOOK-FASE-2-3.md` §4–5).

## 9. Відкат

Порядок важливий: **спершу об'єднати файли середовища, потім відкочувати застосунок.** Попередній випуск не запуститься без
`DATABASE_URL` у `geheimen.env`.

1. Повернути середовище в один файл:
   ```
   /srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh env-samenvoegen
   ```
2. Повернути застосунок до попереднього випуску:
   ```
   /srv/mijn-ruimte/current/deploy/installeer-app.sh terugdraaien            # або: terugdraaien <випуск зі списку 'lijst'>
   ```
   Міграції не відкочуються, і в цьому немає потреби: 0007/0008 сумісні (попередній випуск викликає
   `app.audit_toevoegen` з тим самим підписом; політики пропускають стару роль; тригер `users`
   діє лише для `mijnruimte_app`). Видаляти записи аудиту після цього зможуть лише акаунти з
   `app.audit_beheerders`.
3. Лише якщо попередній випуск старіший за етап 2 (напр., `auth-fase-1`) або якщо проблема саме в ролях:
   виконайте `db-rollen-instellen.sh terugdraaien` (він також сам об'єднує файли середовища) — перед кроком 2.
4. `AUDIT_IP_PEPPER` можна залишити (старий випуск його ігнорує).
5. Лише за крайньої потреби (відкат схеми БД): відновлення з резервної копії, зробленої до кроку 3, згідно з `HERSTEL.md` (дані,
   створені після тієї резервної копії, буде втрачено; після цього знову виконайте `instellen`).

## 10. Надзвичайні ситуації

- **Step-up блокує щось термінове:** `echo 'STAP_OP_UIT=1' >> /etc/mijn-ruimte/geheimen.env && systemctl restart mijn-ruimte`;
  після вирішення приберіть рядок (`sed -i '/^STAP_OP_UIT=/d' /etc/mijn-ruimte/geheimen.env`) і перезапустіть службу.
- **Step-up через Google не працює, бо Google не надсилає `auth_time`**, а TOTP не налаштовано: тимчасово додайте
  `STAP_OP_GOOGLE_ZONDER_AUTH_TIME=1` (у такий самий спосіб; слабший захист: зараховує явний прохід `prompt=login` протягом
  5 хвилин). Краще: увімкнути Сесія age claims (§0).
- **Власника випадково заблоковано** (адреса власника більше не є винятком):
  ```
  runuser -u postgres -- psql -d mijnruimte -c "update app.records set data = jsonb_set(data, '{status}', '\"approved\"') where tbl = 'users' and lower(data->>'email') = lower('<OWNER_EMAIL>')"
  ```
  Після цього увійдіть заново (наявні сесії були відкликані під час блокування).
- **Потрібен другий акаунт власника** (напр., інша адреса Google): змініть `OWNER_EMAIL` і перезапустіть службу; сервер
  переведе старий акаунт назад у `member`. Два акаунти з роллю `owner` одночасно неможливі (унікальний індекс).

## 11. Наступний випуск: юридичні сторінки + A11 (без міграції, без змін середовища)

Поверх живого випуску виправлень за аудитом. Жодної нової міграції, жодних нових змінних; лише застосунок.
```
cd /tmp && sha256sum -c mijn-ruimte-beveiliging-fixes-audit-*.tar.gz.sha256
rm -rf /root/bron-audit-fixes && mkdir -p /root/bron-audit-fixes
tar -xzf mijn-ruimte-beveiliging-fixes-audit-<stempel>-<sha>.tar.gz -C /root/bron-audit-fixes
cat /root/bron-audit-fixes/mijn-ruimte/BRON-COMMIT
/root/bron-audit-fixes/mijn-ruimte/deploy/installeer-app.sh installeren /root/bron-audit-fixes/mijn-ruimte
```
Перевірка:
```
for h in hub id; do for p in /privacy /terms; do
  curl -s -o /dev/null -w "$h$p %{http_code} %{content_type}\n" -H "Host: $h.tarasevych.com" http://127.0.0.1:8080$p; done; done   # 200 text/html
curl -s -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/privacy | grep -c -E 'Limited Use|Privacybeleid'      # ≥ 2
curl -s -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/privacy | grep -ci noindex                            # 0
curl -s -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/ | grep -c noindex                                    # 1 (SPA залишається noindex)
curl -s -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/robots.txt                                            # Allow /privacy$, /terms$, Disallow /
curl -sI -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/privacy | grep -i content-security-policy
curl -s -o /dev/null -w '%{http_code}\n' https://hub.tarasevych.com/privacy                                       # 200 через Cloudflare
```
A11 (підрахунок RLS для серверних рядків): спершу очистьте старі лічильники, потім кілька разів скористайтеся поштою та API-платформою:
```
runuser -u postgres -- psql -d mijnruimte -c "delete from app.rls_audit where tbl in ('provider_endpoint_verifications_v1','oauth_pkce_v1','mail_endpoint_verifications_v1')"
# … після використання (відкрити пошту, підключити/запустити Google-акаунт у пошті, відкрити API-платформу):
runuser -u postgres -- psql -d mijnruimte -c "select route, tbl, actie, aantal, laatst from app.rls_audit order by laatst desc limit 30"
```
Очікується: жодних нових рядків для цих трьох таблиць. У Google Cloud Console (OAuth-бренд) вкажіть як URL:
`https://hub.tarasevych.com/privacy` та `https://hub.tarasevych.com/terms`.
Відкат: `installeer-app.sh terugdraaien` (кроки для середовища чи схеми БД не потрібні).
