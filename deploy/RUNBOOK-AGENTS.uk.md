> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./RUNBOOK-AGENTS.md)) · [🇳🇱 **Nederlandse versie**](./RUNBOOK-AGENTS.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

# Runbook: розгортання Local Machine Connector (агентів)

Ця інструкція (runbook) розгортає міграцію `0009_agents.sql`, WebSocket-канал `/agent/ws`, API `/api/owner/agents/*` та
екран **Агенти (Agenten)** на `mcp.tarasevych.com` за допомогою звичайного скрипта `deploy/installeer-app.sh`. Вона написана для
розгортання власником із першим тестом на власному пристрої.

**Нових секретів чи змінних середовища немає.** Новим є: таблиці `app.agents`, `app.agent_pairing_codes`,
`app.agent_commands`, рантайм-залежність `ws` (встановлюється через `npm ci` з `package-lock.json`) і правило тунелю.

**Порядок дій:** (0) зібрати tarball на ПК → (1) попередні перевірки на ВМ → (2) встановити застосунок → (3) перевірити застосунок локально →
(4) лише після цього змінити тунель → (5) наскрізний тест від початку до кінця → (6) за потреби виконати повернення стану. Отже, застосунок запускається **перед**
тунелем: доки тунель не змінено, для `mcp.*` нічого не змінюється (цей хост усе ще вказує на міст на порту 8091).

Повернення стану в один рядок: застосунок `installeer-app.sh terugdraaien`, тунель `cp` із резервної копії + `systemctl restart cloudflared`.
Міграція 0009 лише додає таблиці; попередній випуск безперешкодно працює поруч із ними (див. §6).

---

## 0. На ПК: створення tarball (усе на диску T:)

Враховується лише **закомічений** стан. Спершу перевірте, чи гілка є на GitHub і чи немає незакомічених змін.

```powershell
cd T:\mijn-ruimte\ontwikkeling\hub
git status --short                       # має бути порожньо
git log --oneline -3
git fetch origin; git status -sb         # "ahead 0"? інакше спершу: git push origin feature/connectors-agent
```

```powershell
$sha   = git rev-parse HEAD
$kort  = git rev-parse --short HEAD
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$naam  = "mijn-ruimte-agents-$stamp-$kort.tar.gz"
$stage = "T:\mijn-ruimte\ontwikkeling\staging\$stamp"
New-Item -ItemType Directory -Force $stage | Out-Null
Set-Content -Path "$stage\BRON-COMMIT" -Value $sha -Encoding ascii -NoNewline
# Один виклик git archive: зберігає біти виконання (.sh) і не передає бінарні дані через конвеєр PowerShell.
git archive --format=tar.gz --prefix=mijn-ruimte/ --add-file="$stage\BRON-COMMIT" -o "T:\mijn-ruimte\uitrol\$naam" HEAD
$hash = (Get-FileHash "T:\mijn-ruimte\uitrol\$naam" -Algorithm SHA256).Hash.ToLower()
"$hash  $naam" | Set-Content "T:\mijn-ruimte\uitrol\$naam.sha256" -Encoding ascii
$naam
```

`BRON-COMMIT` гарантує, що випуск отримає правильну мітку коміту (без цього файлу буде «onbekend» / «unknown»).
Перевірка перед надсиланням (необов'язково): `tar -tvzf T:\mijn-ruimte\uitrol\$naam | Select-String 'installeer-app.sh$'`
має показати `-rwxr-xr-x`/`-rwxrwxr-x`. **Не** створюйте архів шляхом розпакування й повторного запакування у Windows:
так губляться біти виконання.

Передача на ВМ (як і під час попереднього розгортання):

```powershell
$sleutel = 'T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver'
scp -i $sleutel "T:\mijn-ruimte\uitrol\$naam" "T:\mijn-ruimte\uitrol\$naam.sha256" beheer@<VM-IP>:/tmp/
ssh -i $sleutel beheer@<VM-IP>
```

## 1. На ВМ: попередні перевірки

```bash
cd /tmp && sha256sum -c mijn-ruimte-agents-*.tar.gz.sha256        # має видати "OK", інакше СТОП
sudo -i
/srv/mijn-ruimte/current/deploy/installeer-app.sh lijst           # занотуйте активний випуск = точка повернення стану
node -v                                                           # >= v24
df -h /srv /var | tail -n +2                                      # достатньо місця (складання ~1 ГБ)
free -m | head -2                                                 # складання використовує макс. 3 ГБ (cgroup)
curl -sI https://registry.npmjs.org/ws | head -1                  # HTTP/2 200: npm ci має змогу завантажити 'ws'
bash /srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh status   # ролі наявні, 'afdwingen=uit' або 'aan' (обидва варіанти добрі)
systemctl start mijn-ruimte-backup.service && journalctl -u mijn-ruimte-backup -n 12 --no-pager
```

Переконайтеся, що резервна копія завершилася без помилок. Скрипт `installeren` також створює резервну копію перед міграцією
(`ZONDER_BACKUP=1` пропускає це; не робіть цього).

## 2. Встановлення застосунку

```bash
mkdir -p /root/bron-agents && tar -xzf /tmp/mijn-ruimte-agents-*.tar.gz -C /root/bron-agents
bash /root/bron-agents/mijn-ruimte/deploy/installeer-app.sh installeren /root/bron-agents/mijn-ruimte
```

Що відбувається (у такому порядку): копіювання вихідного коду → складання від імені користувача `mijnruimte` (`npm ci`, аудити, vite,
серверний бандл; кілька хвилин) → резервна копія → міграції (`0009_agents` + `rechten.sql`) від імені `mijnruimte_migrator` →
атомарне перемикання `current` → перезапуск → перевірка працездатності (health перевірка). Якщо перевірка не проходить, скрипт **сам виконує повернення стану**
до попереднього випуску. Невдала складання чи міграція залишає активний випуск недоторканим.

Очікуваний підсумковий рядок: `[installeer] klaar: release <stempel> (commit <sha>)`.

## 3. Перевірка застосунку (ще без тунелю)

```bash
curl -s http://127.0.0.1:8080/__gezondheid ; echo                  # {"ok":true,"db":true}
journalctl -u mijn-ruimte -n 25 --no-pager                         # без помилок; "luistert op http://127.0.0.1:8080"
sudo -u postgres psql -d mijnruimte -Atc "select version from app.schema_migrations order by 1 desc limit 2"   # ...0009_agents
sudo -u postgres psql -d mijnruimte -Atc "select tablename||' '||tableowner from pg_tables where tablename like 'agent%' order by 1"
sudo -u postgres psql -d mijnruimte -Atc "select has_table_privilege('mijnruimte_app','app.agents','INSERT'), (select relrowsecurity from pg_class where oid='app.agents'::regclass)"   # t|t
```

Три таблиці з власником `mijnruimte_migrator`, `t|t` в останньому запиті.

Перевірка каналу та публічного маршруту безпосередньо на застосунку (порт 8080, з правильним заголовком Host):

```bash
H='Host: mcp.tarasevych.com'
# 1. недійсний код під'єднання -> 400 PAIRING_CODE_INVALID (маршрут публічний, але відхиляє запит без дійсного коду)
curl -s -w ' %{http_code}\n' -X POST -H "$H" -H 'Content-Type: application/json' -d '{"code":"AAAAAAAA"}' http://127.0.0.1:8080/api/owner/agents/pair
# 2. WebSocket-upgrade -> HTTP/1.1 101 (після цього curl чекає; --max-time закриває з'єднання, код виходу 28 є нормальним)
curl -s -i -N --max-time 3 -H "$H" -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://127.0.0.1:8080/agent/ws | head -1
# 3. невідомий хост і невідомий шлях -> без upgrade
curl -s -i -N --max-time 3 -H 'Host: kwaad.example.com' -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://127.0.0.1:8080/agent/ws | head -1
curl -s -i -N --max-time 3 -H "$H" -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://127.0.0.1:8080/agent/anders | head -1
# 4. без сесії немає доступу до маршрутів керування
curl -s -w ' %{http_code}\n' -X POST -H "$H" -H 'Origin: https://mcp.tarasevych.com' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8080/api/owner/agents/list
```

Очікується: (1) `{"error":"PAIRING_CODE_INVALID"} 400`; (2) `HTTP/1.1 101 Switching Protocols`; (3) `HTTP/1.1 404 Not Found`
двічі; (4) 401 або 403, ніколи не 200.

Якщо тут щось не збігається: **не** переходьте до тунелю. Виконайте повернення стану (§6) або спершу знайдіть причину.

## 4. Тунель: розділення `mcp.tarasevych.com` за шляхами

Навіщо: ім'я хоста `mcp.` виконує роль «налаштування MCP, агенти, ключі та інструменти». Зараз воно повністю вказує на
MCP-міст лише для читання (порт 8091). Після розділення двері мосту залишаються там, а все інше
(екрани, `/api/*`, WSS `/agent/ws`) іде до основного застосунку (8080).

> **Стан на 2026-10-06:** на ВМ це розділення вже активне (резервні копії: `config.yml.bak-mcp`, `config.yml.bak-mcp-ui`).
> Перша версія зіставляла `Grok` лише з великої літери, через що `/grok` потрапляв до застосунку (200, SPA) замість
> мосту. О 21:37 правило зробили нечутливим до регістру (резервна копія `config.yml.voor-hoofdletters-20261006-213725`)
> і після перезапуску перевірили публічно: `/Grok` та `/grok` -> 401 (міст), `/agents` -> 200, WSS `/agent/ws` -> 4401.
> Тому використовуйте цей розділ насамперед для **перевірки** (а на новій ВМ — для налаштування).

**Застосовуйте це лише після того, як §3 став зеленим, і спершу перегляньте свій справжній `/etc/cloudflared/config.yml`:** шаблон у
репозиторії не обов'язково збігається з живою конфігурацією.

```bash
cp -a /etc/cloudflared/config.yml /etc/cloudflared/config.yml.voor-agents-$(date +%F)
grep -n -B1 -A3 'mcp' /etc/cloudflared/config.yml        # поточні правила для mcp.tarasevych.com
```

Наявне правило `mcp.tarasevych.com` (на `http://127.0.0.1:8091`) замініть на **ці два, саме в такому порядку**,
перед завершальним `http_status:404`:

```yaml
  - hostname: mcp.tarasevych.com
    path: ^/((?i:grok|claude|chatgpt|gemini|copilot)|oauth|health|\.well-known)(/|$)
    service: http://127.0.0.1:8091
  - hostname: mcp.tarasevych.com
    service: http://127.0.0.1:8080
```

Перевірте **без перезапуску**, яке правило отримує кожен шлях. Вивід показує знайдене правило та службу:

```bash
CF='cloudflared tunnel --config /etc/cloudflared/config.yml ingress'
$CF validate                                                    # "OK"
for p in Grok grok claude chatgpt gemini copilot health oauth/token oauth/authorize .well-known/oauth-authorization-server .well-known/oauth-protected-resource; do
  printf '%-52s ' "/$p"; $CF rule "https://mcp.tarasevych.com/$p" | grep -E '^Matched|service' | tr '\n' ' '; echo
done
echo ---; for p in '' overview agents access connect tools api/owner/agents/pair api/owner/agents/list agent/ws assets/index.js; do
  printf '%-52s ' "/$p"; $CF rule "https://mcp.tarasevych.com/$p" | grep -E '^Matched|service' | tr '\n' ' '; echo
done
```

| Шлях | Має вести на |
|---|---|
| `/Grok`, `/grok`, `/claude`, `/chatgpt`, `/gemini`, `/copilot`, `/health`, `/oauth/*`, `/.well-known/*` | **8091** (міст) |
| `/`, `/overview`, `/agents`, `/access`, `/connect`, `/tools`, `/api/*`, `/agent/ws`, `/assets/*` | **8080** (основний застосунок) |

Якщо хоча б один шлях веде не на той порт або виникла помилка під час `validate`: **не перезапускайте**; виправте регулярний вираз або порядок і повторіть перевірку.
(Регулярний вираз використовує Go-RE2; лише сам `cloudflared` може його підтвердити, саме тому потрібна ця перевірка.)

Застосуйте зміни (усі імена хостів коротко перепід'єднаються на кілька секунд):

```bash
systemctl restart cloudflared && sleep 4
systemctl status cloudflared --no-pager | head -6
journalctl -u cloudflared -n 15 --no-pager | grep -iE 'registered|connection|error|ERR' | tail -8   # "Registered tunnel connection"
```

Повернення стану лише тунелю:

```bash
cp -a /etc/cloudflared/config.yml.voor-agents-<datum> /etc/cloudflared/config.yml && systemctl restart cloudflared
```

## 5. Наскрізний тест від початку до кінця

### 5a. Зовнішній, через Cloudflare (ще на ВМ; з'єднання проходить ВМ → Cloudflare → тунель → ВМ)

```bash
# Міст усе ще працює (порт 8091): /health, двері без токена = 401 із www-authenticate, метадані OAuth
curl -s -w ' %{http_code}\n' https://mcp.tarasevych.com/health
curl -s -i https://mcp.tarasevych.com/Grok | sed -n '1p;/^www-authenticate/Ip'
curl -s -w ' %{http_code}\n' https://mcp.tarasevych.com/.well-known/oauth-authorization-server | tail -c 80
# Основний застосунок доступний на тому самому хості
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://mcp.tarasevych.com/agents                  # 200 text/html
curl -s -w ' %{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{"code":"AAAAAAAA"}' https://mcp.tarasevych.com/api/owner/agents/pair   # PAIRING_CODE_INVALID 400
# WSS через тунель: "open", через ~5 с "close code=4401 reason=auth timeout", exit 0
node /srv/mijn-ruimte/current/deploy/agent/ws-check.mjs wss://mcp.tarasevych.com/agent/ws ; echo "exit=$?"
```

`/health` → `{"ok":true,"service":"mijn-ruimte-mcp"} 200`; `/Grok` → `401` із `www-authenticate: Bearer …`.
**Якщо міст більше недоступний** (напр., 404 або HTML від SPA на `/Grok`): правило тунелю в §4 неправильне.
Негайно поверніть попередню конфігурацію (§4, «Повернення стану лише тунелю») і знову перевірте доступ Grok.

Таку саму перевірку WSS можна виконати на ПК: `node T:\mijn-ruimte\ontwikkeling\hub\deploy\agent\ws-check.mjs` (з
портативним Node у `T:\mijn-ruimte\hulpmiddelen\node`).

### 5b. Екран і справжній пристрій (ПК), усе на диску T:

1. Увійдіть на `https://mcp.tarasevych.com/agents` як власник. Очікується: екран **Агенти (Agenten)** з блоком
   *Мої пристрої (Mijn apparaten)*, список порожній.
2. На ПК: тестова тека і власна конфігурація, **нічого на C:**. Почніть із локального тесту безпеки агента
   (16 перевірок: вихід за межі через `..`, абсолютний шлях, сусідня тека з тим самим префіксом, symlink/junction,
   список дозволених команд allow-list, ліміти розміру; сам прибирає за собою):

   ```powershell
   . T:\mijn-ruimte\hulpmiddelen\node\env.ps1
   $t = 'T:\mijn-ruimte\ontwikkeling\agent-test'
   New-Item -ItemType Directory -Force $t | Out-Null
   Copy-Item T:\mijn-ruimte\ontwikkeling\hub\deploy\agent\agent.mjs $t\agent.mjs
   node $t\agent.mjs selftest --root $t                    # має завершитися з "alles OK" та exit 0
   $env:HUB_AGENT_CONFIG = "$t\agent-config.json"        # типово це потрапило б у C:\Users\...
   ```
3. В інтерфейсі: **+ Під'єднати ПК або віртуальну машину (+ Pc of virtuele machine koppelen)** → з'являється код (10 хв). На ПК:

   ```powershell
   node $t\agent.mjs pair --server https://mcp.tarasevych.com --code <CODE> --name "Test-pc" --root $t --allow node,git
   node $t\agent.mjs run
   ```
   Очікується: `Paired. …` і далі `[agent] connected as <id>`. В інтерфейсі пристрій за ~4 с переходить у стан **Connected**.
   Конфігураційний файл містить токен агента: залиште його в `$t`, нікому не передавайте.
4. **Перевірити з'єднання (Verbinding testen)** → *Остання дія (Laatste actie)* стає `sys.info · succeeded` з іменем хоста, платформою та вашою текою (команда читання, виконується одразу).
   *Агент 0.2.0:* додаткові команди `sys.metrics` (одразу), `docker.ps` (одразу, вимагає `--allow docker`) та `docker.manage` (завжди з підтвердженням); міграція 0011 розширює обмеження CHECK.
5. **Тест підтвердження (Test goedkeuring)** → під *Очікують вашого підтвердження (Wachten op uw goedkeuring)* з'являється `fs.write` зі шляхом `hub-agent-test.txt`.
   Спершу натисніть **Відхилити (Weigeren)** (повторіть крок 5, щоб знову отримати запит): статус `rejected`, файл не створено.
   Потім натисніть **Дозволити (Toestaan)**: статус `succeeded`, і файл `T:\mijn-ruimte\ontwikkeling\agent-test\hub-agent-test.txt` існує.
   Якщо `failed` із помилкою про права запису: захист Windows на диску T: блокує `node.exe`; це робота системи безпеки ОС,
   а не помилка в застосунку.
6. **Перезапуск**: `systemctl restart mijn-ruimte` на ВМ. Агент повідомляє `[agent] disconnected (<code>), retry in 1s`
   (час очікування зростає до 30 с) і після цього сам перепід'єднується; інтерфейс коротко показує Disconnected, а потім знову Connected.
7. **Відкликання**: натисніть **Відкликати (Intrekken)**. Агент повідомляє `токен відкликано або недійсний. Виконайте pair заново.` і зупиняється.
   Пристрій зникає зі списку. Запустіть `node $t\agent.mjs run` ще раз: те саме повідомлення (сервер закриває з'єднання з кодом 4403).
8. **Ліміт**: запросіть 6 кодів під'єднання протягом 10 хвилин; 6-й поверне повідомлення про перевищення ліміту (5 на 10 хвилин на користувача).

Вихід за межі дозволеної теки через інтерфейс викликати неможливо (кнопки надсилають фіксовані безпечні команди); це покриває `selftest` у кроці 2.
ШІ-інструменти (`machine_*`) доступні в межах сесії через `/api/owner/agents/tools/call`, але ще не мають окремого екрана.

### 5c. Перевірка на ВМ після тесту

```bash
journalctl -u mijn-ruimte --since '-30 min' --no-pager | grep -iE 'agent|upgrade|error' | tail -15
sudo -u postgres psql -d mijnruimte -Atc "select name, status, platform, revoked_at is not null as ingetrokken from app.agents order by created_at"
sudo -u postgres psql -d mijnruimte -Atc "select type, status, to_char(created_at,'HH24:MI:SS') from app.agent_commands order by created_at desc limit 8"
```

Аудит-слід (`owner.agent.paired`, `owner.agent.command`, `.approved`, `.rejected`, `.revoked`) відображається в журналі аудиту адмінпанелі.

## 6. Повернення стану

| Що | Як | Примітка |
|---|---|---|
| Лише тунель | `cp -a /etc/cloudflared/config.yml.voor-agents-<datum> /etc/cloudflared/config.yml && systemctl restart cloudflared` | `mcp.*` знову повністю вказує на 8091 |
| Застосунок | `/srv/mijn-ruimte/current/deploy/installeer-app.sh terugdraaien` | Міграції не повертаються до попереднього стану; 0009 лише додає таблиці, попередній випуск їх ігнорує |
| Один пристрій | Інтерфейс → Відкликати (Intrekken) | Токен миттєво стає недійсним, з'єднання закривається |
| Вимкнути всі агенти | `UPDATE app.agents SET revoked_at = now()` від імені `mijnruimte_system`; потім `systemctl restart mijn-ruimte` | Потрібно за підозри витоку токена |
| Видалити таблиці | Лише за явним запитом, від імені `mijnruimte_migrator`: `DROP TABLE app.agent_commands, app.agents, app.agent_pairing_codes` | Тоді також видаліть рядок `0009_agents` із `app.schema_migrations`, інакше таблиці не створяться заново |

## 7. Відомі обмеження

- WebSocket-з'єднання живуть у пам'яті **одного** процесу застосунку (як і зараз). Більше процесів вимагатимуть LISTEN/NOTIFY.
- Cloudflare обриває HTTP-запити через 100 с. Тому очікування підтвердження ШІ-інструментом триває максимум 60 с; після цього
  інструмент повідомляє, що запит на підтвердження відкритий. Сам WebSocket не обмежений.
- У Windows скрипти `.cmd` (`npm`, `npx`) не можна запустити без shell; дозволяйте лише `node`, `git`, `python`.
- Не входить у це розгортання: OAuth-під'єднання (Gmail, Notion, Slack, …) та оновлення токенів (token-refresh). Google працює через наявні гранти.
- ШІ-інструменти (`machine_*`, `github_get`) доступні через `/api/owner/agents/tools/*` у межах сесії; зовнішні
  MCP-клієнти (Grok тощо) їх поки не отримують. Це вимагає окремих токенів доступу.

## 8. Контрольний список

- [ ] Tarball створено, sha256 на ВМ `OK`
- [ ] Резервна копія перед розгортанням успішна
- [ ] `installeren` завершено, `0009_agents` у `schema_migrations`
- [ ] §3: 400 / 101 / 404 / 404 / 401-або-403
- [ ] Конфігурацію тунелю скопійовано, `validate` OK, усі шляхи в таблиці ведуть на правильний порт
- [ ] §5a: `/health` 200, `/Grok` 401, `/agents` 200, WSS `4401` та exit 0
- [ ] §5b: `selftest` alles OK, під'єднання (pairing), Connected, `sys.info`, відхилення, дозвіл, перезапуск, відкликання, ліміт
- [ ] Доступ Grok до мосту все ще працює (наявний робочий процес)
