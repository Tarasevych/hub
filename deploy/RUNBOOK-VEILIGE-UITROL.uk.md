> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./RUNBOOK-VEILIGE-UITROL.md)) · [🇳🇱 **Nederlandse versie**](./RUNBOOK-VEILIGE-UITROL.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

# Runbook: віддалене керування без шляху від застосунку до root (три методи, один ключ)

Стан: 2026-10-08, гілка `veilig-agenten-0.4`. Замінює старі «двері» (`mijn-ruimte-mcp-doen` + правило sudo + завантажувач `patch-*.py`).

## 0. Три методи та як вони пов'язані

ШІ (Grok, Claude, агент) або ви самі можете керувати сервером віддалено, але **ніщо** з того, що може записати застосунок (користувач `mijnruimte`),
ніколи не виконується від імені root. Новий код потрапляє на сервер лише тоді, коли він підписаний **вашим** ключем ed25519
(`T:\mijn-ruimte\geheim\uitrol-sleutel`, із парольною фразою).

| | Метод 1: GitOps-pull | Метод 2: підписаний пакет | Метод 3: броньована команда |
|---|---|---|---|
| Хто запускає | root-таймер на ВМ, кожні 5 хв | path-юніт щойно в inbox з'являється пакет | застосунок: `systemctl start mijn-ruimte-opdracht@<werkwoord>.service` |
| Вхідні дані | підписаний тег `uitrol-JJJJMMDD-UUMM` у GitHub | `mijn-ruimte-<versie>.tar.gz` + `.sig` (через Grok або SSH) | одне дієслово з фіксованого списку |
| Перевірка | `git verify-tag` (gpg.format=ssh) з `/etc/mijn-ruimte/uitrol-ondertekenaars` | `ssh-keygen -Y verify` з тим самим файлом | polkit (лише 5 юнітів, лише `start`) + root-скрипт |
| Може встановити новий код | так, лише підписаний | так, лише підписаний | **ні**; `uitrol-nu` лише запускає методи 1 і 2 |
| Перемикач | `"gitops"` (за замовчуванням вимкнено) | `"uitrol"` (за замовчуванням вимкнено) | `"opdracht": {…}` для кожного дієслова |
| Скрипт (root) | `/usr/local/sbin/mijn-ruimte-gitops` | `/usr/local/sbin/mijn-ruimte-uitrol` | `/usr/local/sbin/mijn-ruimte-opdracht` |

Усі перемикачі містяться в **одному root-файлі**: `/etc/mijn-ruimte/mcp-rechten.json` (`root:mijnruimte 0640`; застосунок може його читати, але не змінювати).
Усі результати записуються в `/var/lib/mijn-ruimte-uitrol-status/` (`root:mijnruimte 0750`): `status.json` (метод 2), `gitops.json` (метод 1),
`opdracht-<werkwoord>.json` (метод 3) та `gebeurtenissen.jsonl`. Застосунок кожні 5 хвилин імпортує `gebeurtenissen.jsonl` в аудит
(дія `server.gitops.*` / `server.opdracht.*`); root ніколи нічого не читає назад від застосунку.

```
PC eigenaar: uitrol-sleutel (T:\mijn-ruimte\geheim, wachtwoordzin via ssh-agent)
 ├─ scripts\onderteken-uitrol.ps1 → git tag -s uitrol-… → GitHub ──(alleen-lezen deploy key)──► mijn-ruimte-gitops.timer (root)
 │                                                                                                 verify-tag → git archive → installeer-app.sh
 └─ deploy\uitrol\maak-uitrolpakket.ps1 → pakket + .sig → Grok/SSH → uitrol-inbox ─────────────────► mijn-ruimte-uitrol.path (root)
                                                                                                   ssh-keygen -Y verify → installeer-app.sh
Site/agent (mijnruimte, NoNewPrivileges=yes) ── systemctl start mijn-ruimte-opdracht@{status|releases|backup|uitrol-nu|terugdraaien}
                                               └─ polkit: alleen deze 5 units ─► mijn-ruimte-opdracht (root, vaste lijst, geen invoer)
```

**Що МОЖЕ зробити зловмисник із повним контролем над застосунком:** запустити п'ять команд (якщо вони увімкнені): прочитати статус, запустити
резервне копіювання (воно виконується як `mijnruimte`), запустити перевірку підписаних релізів і (лише якщо `"terugdraaien": true`) щонайбільше раз на
10 хвилин відкотити до попереднього, вже встановленого релізу. Це максимум перешкода в роботі або відкат до старішого власного коду, **ніколи не власний
код від імені root**. Тому `terugdraaien` за замовчуванням вимкнено. polkit не розрізняє застосунок і MCP-двері (обидва працюють як
`mijnruimte`); двері не використовують ці команди, але межа безпеки однакова.

**Доповнення (гілка `passkey-schvalennya`): метод 2b, схвалення за допомогою passkey власника.** Окрім методу 2 (пакет, підписаний
на ПК), підготовник (агент або акаунт із тимчасовим дозволом-грантом) може завантажити **непідписаний** пакет; він буде встановлений лише
тоді, коли власник схвалить його на своєму телефоні за допомогою passkey, і root сам перевірить цей підпис passkey. Див. §13. Перемикач
`"passkey-goedkeuring"` (за замовчуванням `false`). Метод 2 продовжує працювати без змін.

## 1. Що змінилося порівняно зі старими дверима (і чому)

| Раніше (аудит C1/C3/C4) | Зараз |
|---|---|
| `mijnruimte ALL=(root) NOPASSWD: /usr/local/sbin/mijn-ruimte-mcp-doen *` | **жодного правила sudo**; інсталятор переносить старе правило в карантин і попереджає, якщо для `mijnruimte` ще залишилося правило NOPASSWD |
| root-помічник із дієсловами, які виконували підготовлений код (`kit`, `povnyj-arkhiv`, `patch-*.py` через runpy) | **жодного дієслова**; служба MCP може лише покласти пакет + окремий підпис у теку inbox |
| дозволи в `/srv/data/uploads/mcp-permissions.json` (доступні для запису застосунком) | `/etc/mijn-ruimte/mcp-rechten.json`, власність root (`root:mijnruimte 0640`); змінюється лише через SSH |
| drop-in `mijn-ruimte-mcp.service.d/write.conf` із `NoNewPrivileges=no` | прибрано; юніт має `NoNewPrivileges=yes`, `RestrictSUIDSGID=yes`; drop-in під час встановлення переноситься в карантин |
| архів частково доступний для читання (код, юніти, sudoers, git) у теці застосунку | **весь архів зашифровано через age**, у root-теці, фіксована назва, завантаження лише власником після step-up через одноразовий id |
| керування через `sudo` із застосунку | **метод 3**: polkit + `mijn-ruimte-opdracht@.service`, застосунок зберігає `NoNewPrivileges=yes` |
| немає автоматичного розгортання з git | **метод 1**: root-таймер, лише підписані теги, deploy key лише для читання |
| OAuth-токени дверей у відкритому тексті, фіксований клієнт `grok`, 30 днів | лише sha256-хеші, доступ 1 год, refresh 14 днів із ротацією + виявленням повторного використання, `/oauth/revoke`, DCR з унікальним client-id |

## 2. Одноразово: створення ключа підпису на Windows (`T:\mijn-ruimte\geheim\uitrol-sleutel`)

PowerShell (звичайний користувач):

```powershell
New-Item -ItemType Directory -Force T:\mijn-ruimte\geheim | Out-Null
ssh-keygen -t ed25519 -a 100 -C "uitrol@mijn-ruimte" -f T:\mijn-ruimte\geheim\uitrol-sleutel
#   → двічі запитає парольний вираз: оберіть довгий (≥ 5 слів), збережіть у менеджері паролів, НЕ на T:\
Get-Content T:\mijn-ruimte\geheim\uitrol-sleutel.pub
```

Одноразово увімкнути службу Windows `ssh-agent` (PowerShell **від імені адміністратора**), щоб парольний вираз потрібно було вводити лише раз за сесію:

```powershell
Set-Service ssh-agent -StartupType Manual
Start-Service ssh-agent
```

- `uitrol-sleutel` (приватний) залишається на `T:\` і ніколи не передається на ВМ, у Grok, у GitHub чи в репозиторій. Ніколи не знімайте з нього парольний вираз.
- Зробіть другу копію `T:\mijn-ruimte\geheim` на офлайн-носії (з тим самим парольним виразом).
- Покладіть `UITLEG-LEESMIJ.txt` поруч із ключем: текст міститься в `deploy/pc-uitleg/T-geheim-uitrol-sleutel-UITLEG-LEESMIJ.txt` (спочатку українською, потім нідерландською).
- Старий ключ у `T:\mijn-ruimte-uitrol\uitrolsleutel` може продовжувати працювати (той самий публічний ключ на ВМ), або ви можете створити новий і
  замінити рядок на ВМ (§10).

## 3. Одноразово на ВМ (через SSH, від імені root)

```bash
# 1. публічний ключ як єдиний підписант, для пакетів (mijn-ruimte-uitrol) ТА тегів (git)
install -d -o root -g root -m 0755 /etc/mijn-ruimte
printf 'uitrol@mijn-ruimte namespaces="mijn-ruimte-uitrol,git" %s\n' 'ssh-ed25519 AAAA…' > /etc/mijn-ruimte/uitrol-ondertekenaars
chown root:root /etc/mijn-ruimte/uitrol-ondertekenaars && chmod 0644 /etc/mijn-ruimte/uitrol-ondertekenaars
#    (лише "ssh-ed25519 AAAA…" з uitrol-sleutel.pub; коментар можна опустити)

# 2. чи встановлено polkit? (Ubuntu 24.04: polkitd 124 з правилами JavaScript)
pkaction --version || apt install -y polkitd
```

`installeer-app.sh installeren` після цього сам встановлює: три root-скрипти, юніти (`mijn-ruimte-uitrol.{path,service}`,
`mijn-ruimte-gitops.{service,timer}`, `mijn-ruimte-opdracht@.service`), правило polkit
`/etc/polkit-1/rules.d/50-mijn-ruimte-opdracht.rules`, root-копію `/usr/local/sbin/mijn-ruimte-installeer`, теки
(`/var/lib/mijn-ruimte/{gitops,opdracht}` root 0700) і стандартний `mcp-rechten.json`. Список підписантів, `gitops.env` та
перемикачі **ніколи** не беруться з пакета чи тегу.

Після збирання інсталятор повторно витягує `deploy/` із (перевіреного) джерела: те, що npm-скрипт міг би змінити в `deploy/` під час build,
ніколи не встановлюється як root-скрипт, юніт або правило polkit.

### Перевірка того, що старий root-шлях прибрано

```bash
ls -l /etc/sudoers.d/                         # немає mijn-ruimte-mcp (і немає mijn-ruimte-opdracht: polkit, без sudo)
sudo -l -U mijnruimte                         # "is not allowed to run sudo"
ls /usr/local/sbin/ | grep -E 'mcp-doen|povnyj' || echo "weg"
systemctl cat mijn-ruimte-mcp.service | grep -E 'NoNewPrivileges'   # лише NoNewPrivileges=yes, без drop-in write.conf
ls -A /srv/mijn-ruimte/mcp-staging 2>/dev/null || echo "staging weg"
ls -ld /var/lib/mijn-ruimte-quarantaine/*     # що інсталятор переніс у карантин (докази; не видаляти до завершення розслідування)
```

`oude_deur_opruimen` переміщує `/etc/sudoers.d/mijn-ruimte-mcp`, `/usr/local/sbin/mijn-ruimte-mcp-doen`, `/usr/local/sbin/mijn-ruimte-povnyj-arkhiv`,
drop-in `/etc/systemd/system/mijn-ruimte-mcp.service.d/write.conf` (`NoNewPrivileges=no`), `/srv/mijn-ruimte/mcp-staging` та старі
доступні для запису застосунком перемикачі до `/var/lib/mijn-ruimte-quarantaine/<tijd>/` (root 0700) і виконує `daemon-reload`.

## 4. Метод 1: GitOps-pull (підписані теги з GitHub)

### 4.1 Доступ до GitHub лише для читання (ніколи не використовуйте особистий токен)

**Рекомендовано: deploy key** (лише цей репозиторій, лише читання):

```bash
# на ВМ, як root; без парольної фрази (таймер працює автономно), але лише з правом читання одного репозиторію
ssh-keygen -t ed25519 -N '' -C 'gitops@mijn-ruimte (alleen lezen)' -f /etc/mijn-ruimte/gitops-deploykey
chown root:root /etc/mijn-ruimte/gitops-deploykey*; chmod 0600 /etc/mijn-ruimte/gitops-deploykey; chmod 0644 /etc/mijn-ruimte/gitops-deploykey.pub
cat /etc/mijn-ruimte/gitops-deploykey.pub
```

GitHub → репозиторій **Tarasevych/hub** → *Settings* → *Deploy keys* → *Add deploy key*: назва `mijn-ruimte VM (alleen lezen)`, вставте `.pub`,
залиште **"Allow write access" ВИМКНЕНИМ**. Після цього:

```bash
cat > /etc/mijn-ruimte/gitops.env <<'EOT'
GITOPS_REPO=git@github.com:Tarasevych/hub.git
GITOPS_SSH_SLEUTEL=/etc/mijn-ruimte/gitops-deploykey
EOT
chown root:root /etc/mijn-ruimte/gitops.env && chmod 0600 /etc/mijn-ruimte/gitops.env
```

`/etc/mijn-ruimte/gitops-known_hosts` (ключі хостів github.com) встановлює інсталятор; відбиток Ed25519
`SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU` (див. документацію GitHub «GitHub's SSH key fingerprints»).

**Альтернатива: fine-grained token** (GitHub → *Settings* → *Developer settings* → *Fine-grained tokens*): *Resource owner* Tarasevych,
*Repository access* → **Only select repositories** → `hub`, *Permissions* → *Repository* → **Contents: Read-only** (Metadata: read встановлюється автоматично),
термін дії ≤ 1 рік. У `gitops.env`:

```
GITOPS_REPO=https://github.com/Tarasevych/hub.git
GITOPS_TOKEN=github_pat_…
```

Токен передається в git через оточення (не видимий у `ps`), лише до github.com. `gitops.env` не виконується як shell: читаються лише
три ключі вище; права root 0600 обов'язкові, інакше скрипт відмовляє.

### 4.2 Увімкнення та перевірка

```bash
# у /etc/mijn-ruimte/mcp-rechten.json: "gitops": true   (див. §7)
systemctl enable --now mijn-ruimte-gitops.timer
systemctl start mijn-ruimte-gitops.service            # одразу один цикл
journalctl -u mijn-ruimte-gitops -n 30
cat /var/lib/mijn-ruimte-uitrol-status/gitops.json
```

Під час першого встановлення інсталятор записує `/var/lib/mijn-ruimte/gitops/laatste-tag` = `uitrol-<зараз в UTC>`: розглядаються лише теги,
створені після цього моменту.

### 4.3 Підписання та пуш тегу (ПК)

```powershell
cd C:\pad\naar\repo      # чистий checkout на коміті, який ви хочете розгорнути
powershell -ExecutionPolicy Bypass -File scripts\onderteken-uitrol.ps1            # або: -Ref <commit>  -ZonderPush
```

Скрипт: перевіряє робочу теку, просить `ssh-add -t 600` запитати парольний вираз (скрипт ніколи його не бачить і не зберігає), створює
`git tag -s uitrol-JJJJMMDD-UUMM` (UTC) з `gpg.format=ssh`, сам перевіряє підпис через `verify-tag`, пушить тег із
вашим власним git-доступом на ПК і видаляє ключ з агента.

Можна також вручну:

```powershell
ssh-add -t 600 T:\mijn-ruimte\geheim\uitrol-sleutel
$tag = 'uitrol-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmm')
git -c gpg.format=ssh -c user.signingkey=T:\mijn-ruimte\geheim\uitrol-sleutel.pub -c gpg.ssh.program=C:\Windows\System32\OpenSSH\ssh-keygen.exe tag -s $tag -m "Uitrol $tag"
git push origin "refs/tags/${tag}:refs/tags/${tag}"
```

### 4.4 Що перевіряє сервер

1. завантажуються лише посилання `refs/tags/uitrol-*` (голе дзеркало у `/var/lib/mijn-ruimte/gitops`, хуки вимкнено, `transfer.fsckObjects`,
   лише https/ssh);
2. кандидати: `uitrol-JJJJMMDD-UUMM`, **новіші** за `laatste-tag`, спочатку найновіші;
3. анотований тег; назва **всередині** підписаного об'єкта тегу має збігатися з ref (старий підписаний тег не можна повторно використати під новою
   назвою); ціллю має бути коміт;
4. `git -c gpg.format=ssh -c gpg.ssh.allowedSignersFile=/etc/mijn-ruimte/uitrol-ondertekenaars verify-tag` має видати
   `Good "git" signature for uitrol@mijn-ruimte`;
5. `git archive` цього коміту → розпакування в root-теку з фільтром tarfile `data`, лише звичайні файли та теки;
6. `installeer-app.sh installeren` із цього джерела. Якщо встановлення завершується помилкою, поточний реліз залишається активним, а цей тег повторно не пробується.

Коди (`gitops.json` та аудит): `UIT`, `GEEN_SLEUTEL`, `ENV_RECHTEN`, `REPO_ONGELDIG`, `TOKEN_ONGELDIG`, `SLEUTEL_RECHTEN`, `KNOWN_HOSTS`,
`OPHALEN_MISLUKT`, `NIET_ONDERTEKEND`, `NAAM_VERSCHILT`, `GEEN_COMMIT`, `HANDTEKENING_ONGELDIG`, `INHOUD_ONVEILIG`, `TE_GROOT`,
`GEEN_INSTALLER`, `INSTALLATIE_MISLUKT`, `GEEN_NIEUWE`, `OK`. Відхилений тег фіксується один раз і надалі ігнорується.

## 5. Метод 2: підписаний пакет (Grok або SSH)

### 5.1 Створення пакета (ПК)

```powershell
cd C:\pad\naar\repo
powershell -ExecutionPolicy Bypass -File deploy\uitrol\maak-uitrolpakket.ps1 -Uit $env:USERPROFILE\Desktop
#   за замовчуванням -Sleutel T:\mijn-ruimte\geheim\uitrol-sleutel; запитує парольний вираз і сам перевіряє підпис
```

Результат: `mijn-ruimte-<versie>.tar.gz`, `.tar.gz.sig`, `mijn-ruimte-<versie>.txt` (версія, байти, sha256).

### 5.2 Розгортання

**A. Через Grok (mcp.tarasevych.com)**, лише якщо `"uitrol": true`:
1. Надайте Grok пакет, текст `.sig` та значення з `.txt`.
2. Grok викликає `rollout_upload_begin {version, bytes, sha256}`, потім `rollout_upload_chunk` (фрагменти ≤ 512 КіБ) та `rollout_upload_finish {version, signature}`.
3. `rollout_status` показує: `bezig` → `klaar` або `geweigerd`/`mislukt` із кодом.
4. Після цього поверніть `"uitrol": false` (рекомендовано).

**B. Через SSH (без Grok)**:
```bash
scp mijn-ruimte-<versie>.tar.gz{,.sig} beheer@203.0.113.10:/tmp/
ssh beheer@203.0.113.10
sudo install -o mijnruimte -g mijnruimte -m 0640 /tmp/mijn-ruimte-<versie>.tar.gz{,.sig} /srv/mijn-ruimte/uitrol-inbox/
sudo -u mijnruimte touch /srv/mijn-ruimte/uitrol-inbox/aanvraag
journalctl -fu mijn-ruimte-uitrol.service
cat /var/lib/mijn-ruimte-uitrol-status/status.json
```

Коди статусу: `SIG_ONTBREEKT`, `HANDTEKENING_ONGELDIG`, `GEEN_SLEUTEL`, `INHOUD_ONVEILIG`, `VERSIE_VERSCHILT`, `NIET_NIEUWER`,
`TE_GROOT`, `GEEN_INSTALLER`, `INSTALLATIE_MISLUKT`. Відхилений пакет видаляється з inbox і ніколи не виконується.

## 6. Метод 3: броньована команда (polkit + `mijn-ruimte-opdracht@.service`)

| Дієслово | Що робить root | За замовчуванням | На сайті |
|---|---|---|---|
| `status` | активний/попередній реліз, стан служб, останній результат методів 1 і 2 | увімк. | власник (лише читання) |
| `releases` | список релізів із комітом | увімк. | власник (лише читання) |
| `backup` | `systemctl start mijn-ruimte-backup.service` (працює як mijnruimte) | увімк. | власник |
| `uitrol-nu` | `systemctl start mijn-ruimte-gitops.service` та `mijn-ruimte-uitrol.service` (встановлюють лише підписаний код) | увімк. | власник + **step-up** |
| `terugdraaien` | `/usr/local/sbin/mijn-ruimte-installeer terugdraaien` (попередній реліз), не частіше 1× на 10 хв | **вимк.** | власник + **step-up** + підтвердження |

- Скрипт (`/usr/local/sbin/mijn-ruimte-opdracht`, root 0755) приймає рівно один аргумент із цього списку, очищує все оточення, не читає
  stdin і не читає жодного файлу чи теки, куди може писати застосунок (жодних uploads, inbox чи staging; реліз, який ще збирається
  і тому належить `mijnruimte`, пропускається). Результат: `/var/lib/mijn-ruimte-uitrol-status/opdracht-<werkwoord>.json`.
- `terugdraaien` ніколи не виконує нічого з `/srv/mijn-ruimte/…/deploy`, а використовує root-копію інсталятора, яка під час встановлення
  (із перевіреного джерела) була покладена в `/usr/local/sbin/mijn-ruimte-installeer`. Мітка часу: `/var/lib/mijn-ruimte/opdracht/terugdraaien.stempel`.
- Правило polkit `/etc/polkit-1/rules.d/50-mijn-ruimte-opdracht.rules` надає `mijnruimte` лише право `start` рівно на ці п'ять юнітів; будь-яка
  інша дія systemd від `mijnruimte` (stop, restart, enable, daemon-reload, set-environment, інші юніти) явно отримує **відмову**.
- На сайті: MCP → картка **Serverbeheer** (Керування сервером). Для агентів: інструменти `server_status` і `server_releases` (лише читання); команди запису
  ніколи не проходять через токен агента, лише через сайт зі step-up.

Перевірка (від імені root, з тими самими обмеженнями, що й у застосунку):

```bash
systemd-run --uid=mijnruimte --gid=mijnruimte -p NoNewPrivileges=yes --pipe --wait \
  systemctl start --no-ask-password mijn-ruimte-opdracht@status.service && cat /var/lib/mijn-ruimte-uitrol-status/opdracht-status.json
systemd-run --uid=mijnruimte --gid=mijnruimte -p NoNewPrivileges=yes --pipe --wait \
  systemctl restart --no-ask-password ssh.service          # має видати "Access denied"
journalctl -u 'mijn-ruimte-opdracht@*' -n 20
```

## 7. Перемикачі (увімк./вимк.)

Усе в `/etc/mijn-ruimte/mcp-rechten.json` (root:mijnruimte 0640). Повний приклад зі значеннями за замовчуванням:

```json
{
  "read": true,
  "uitrol": false,
  "gitops": false,
  "passkey-goedkeuring": false,
  "terugdraaien-passkey": true,
  "externe-hosts-passkey": true,
  "externeMcpHosts": [],
  "opdracht": { "status": true, "releases": true, "backup": true, "uitrol-nu": true, "terugdraaien": false }
}
```

`terugdraaien-passkey`, `externe-hosts-passkey` та `externeMcpHosts` належать до **рішень власника з passkey** (§15):
якщо ключ `…-passkey` відсутній, цей канал ВІДКРИТИЙ (підпис passkey є захисним шлюзом); `false` закриває його. `externeMcpHosts`
root записує сам за таким рішенням; редагувати вручну також дозволено.

```bash
nano /etc/mijn-ruimte/mcp-rechten.json && python3 -m json.tool /etc/mijn-ruimte/mcp-rechten.json >/dev/null && echo geldig
chown root:mijnruimte /etc/mijn-ruimte/mcp-rechten.json && chmod 0640 /etc/mijn-ruimte/mcp-rechten.json
date +%s%3N > /etc/mijn-ruimte/mcp-intrekken      # відкликати всі сесії MCP-дверей одночасно
```

Зміни діють миттєво (скрипти читають файл при кожному запуску). Якщо файл неможливо прочитати або він не належить root, метод 1 відмовляє, а
метод 3 дозволяє лише `status` і `releases`. Вимкнути все одразу: `"uitrol": false, "gitops": false` та всі команди `false`;
або `systemctl disable --now mijn-ruimte-gitops.timer mijn-ruimte-uitrol.path` і прибрати правило polkit.

## 8. Відкат (rollback)

1. **Автоматично**: якщо перевірка працездатності після активації не проходить, `installeer-app.sh` сам повертає попередній реліз (методи 1 і 2).
   З 22.10.2026 також якщо сторінки **не рендеряться**, хоча HTTP повертає 200 — див. §8a (рендер-контроль).
2. **Через сайт із рішенням passkey** (22.10.2026, §15, за замовчуванням УВІМКНЕНО): mcp → Панель розгортання → *Відкат до попереднього* →
   майстер показує з якої на яку версію, ви підписуєте своїм passkey, root сам перевіряє підпис і виконує відкат (1× на 10 хв).
   Стара пряма кнопка (метод 3, лише якщо `"opdracht": {"terugdraaien": true}`) ще існує, але більше не потрібна.
3. **Через SSH**:
   ```bash
   ssh beheer@203.0.113.10
   sudo /usr/local/sbin/mijn-ruimte-installeer terugdraaien              # попередній реліз
   sudo /usr/local/sbin/mijn-ruimte-installeer terugdraaien 20261008-193000   # або вказаний реліз
   sudo /usr/local/sbin/mijn-ruimte-installeer lijst
   curl -fsS http://127.0.0.1:8080/__gezondheid
   ```

Повторно розгорнути старішу версію через тег або пакет не можна (`NIET_NIEUWER` / не новіший за `laatste-tag`). Якщо потрібен старий код як новий
реліз, підпишіть **новий** тег на тому старому коміті (`onderteken-uitrol.ps1 -Ref <commit>`).
Міграції бази даних працюють лише вперед; під час відкату нові таблиці залишаються (вони є адитивними).

## 8a. Рендер-контроль та автоматичний відкат при білій сторінці (22.10.2026)

**Що пішло не так.** Реліз 20261021-221718 викликав `Buffer.from(…)` на рівні модуля в технічному бандлі (`shared/merk-eigen.ts`). Браузер
не має `Buffer`: технічний бандл викидав «Buffer is not defined», і КОЖНА сторінка `admin.*` (включно з `/updates`) залишалася білою. `/__gezondheid` був
зеленим, «HTTP 200» був зеленим, післямоніторинг і нагляд нічого не помітили, «Діагностика» писала «Сторінка «Оновлення» HTTP 200 · Справно» — і
обіцяний автовідкат не спрацював. Власнику довелося встановлювати пакет через SSH.

**Що тепер відбувається при кожному встановленні** (`installeer-app.sh installeren` → `activeren`):

1. перемикання → перезапуск → `/__gezondheid` → післямоніторинг (як раніше);
2. **рендер-контроль** (`scripts/rook-controle.mjs`, крок «rook 97 %»):
   - з браузером на сервері: запускається **одноразова копія** нового релізу (`dist-server/rook.mjs`) на окремій,
     порожній базі даних `mijnruimte_rook_<stempel>` (створюється як postgres із роллю міграції як власником; у ній виконуються міграції релізу;
     після цього `DROP DATABASE`). У ній авторизується тестовий власник (імітований Google, усе всередині процесу) з активним технічним
     профілем, а headless Chromium (лише loopback, `--host-resolver-rules` → `~NOTFOUND` для всього іншого) відкриває ключові сторінки:
     hub `/overzicht` `/zoek`, mail `/postvak-in`, cloud `/overzicht`, admin `/overzicht` `/updates` `/diagnostiek` `/toegang`, mcp `/dashboard` `/agenten`,
     id (вхід, без куків), github `/overzicht`, ai. Після цього **кожен бандл** із `dist/assets/**` імпортується в браузері.
     Сторінка вважається **зламаною** у разі: `pageerror`/неперехопленої помилки, `console.error` із ReferenceError/TypeError, порожнього `#root` або лише
     смужки (без main/секції/форми), JS-бандла ≠ 200, тексту «Internal server error». Продуктивна база даних ніколи не зачіпається:
     `rook.mjs` відхиляє будь-яку назву бази даних, яка не починається з `mijnruimte_rook_`. Усе працює як `mijnruimte` (`systemd-run`,
     `NoNewPrivileges`, `ProtectSystem=strict`), ніколи як root;
   - без браузера: лише **модульний контроль** у Node — кожен бандл виконується як ES-модуль у vm-контексті без
     `Buffer`/`process`/`require` (із легкою імітацією DOM). Це ловить саме помилку 20261021 у «скелеті сторінки» (entry,
     lazy-маршрути першого рівня, tech-чанки та все, що вони статично імпортують); глибша lazy-бібліотека (напр., `mdb-reader` при
     відкритті вкладення Access) дає **попередження**, а не відкат. Журнал і «Діагностика» тоді чесно пишуть
     «рендеринг не перевірено (встановіть browser-controle)»;
3. результат **0** (усе гаразд) → «активний»; **2** (не виконано: немає браузера, немає ролі postgres, тайм-аут) → також активний, із чітким
   попередженням — ніколи не відкочувати через інфраструктурну помилку; **1** (зламано) → **автоматичний відкат** до попереднього релізу, перезапуск,
   перевірка працездатності, подія `ROOK_TERUGGEDRAAID` (warn) із причиною («сторінка admin-updates не рендериться (pageerror: Error:
   Buffer is not defined)») у `gebeurtenissen.jsonl` → видима на «Оновлення» як «Відкочено автоматично: сторінка не рендериться», а
   встановлення завершується з `FOUT: installatie van … mislukt: rendercontrole — …` (при passkey/підписі `mijn-ruimte-uitrol.sh`
   переймає цей рядок як причину: крок «рендер-контроль», код `INSTALLATIE_MISLUKT`).
4. **Без нескінченного циклу**: попередній реліз після відкату перевіряється ще **один раз наживо** (публічні сторінки, без входу) — лише
   повідомляється (`ROOK_MISLUKT`, якщо він теж зламаний), повторний відкат ніколи не виконується. Якщо попереднього релізу немає: `ROOK_MISLUKT` (error) із підказкою SSH.
5. **Міграції не відкочуються** (як завжди: схема залишається на найновішому стані; димовий стенд використовує власну базу даних
   і не чіпає продуктивну схему). Тож робіть міграції лише розширювальними (адитивними).

**Післянагляд (`mijn-ruimte-nazorg.sh`, root, щохвилини).** Окрім перевірки працездатності: через 120 с після активації (`NAZORG_ROOK_NA`) один раз
виконується `mijn-ruimte-installeer rook-controle --live` проти працюючої служби (публічні сторінки + публічні бандли, через локальний TLS-проксі, оскільки
CSP застосунку має `upgrade-insecure-requests`). Зламано = збій → такий самий відкат, як і при трьох помилках працездатності, подія
`NAZORG_TERUGGEDRAAID` із `reden: rook`. Ніколи не виконується двічі (мітка `nazorg-rook`).

**«Діагностика» → «Сторінки й маршрути».** Кожна перевірка сторінки поруч з HTTP-статусом показує, що сказала остання браузерна перевірка про ЦЮ сторінку
(`рендеринг ок у браузері (tijd)` / `рендеринг ЗЛАМАНО: …` → помилка `ROOK_KAPOT` / `лише HTTP, рендеринг не перевірено (встановіть
browser-controle)`). Пункт «Рендеринг сторінок» читає `/var/lib/mijn-ruimte-uitrol-status/rook-controle.json` (ok / kapot / verouderd /
niet gecontroleerd / nooit). Кнопка «Перевірити рендеринг» кладе **порожній** файл запиту в inbox схвалення; таймер нагляду бачить його,
видаляє і запускає `rook-controle` (стенд із тестовим власником; щонайбільше 1× на 10 хв; ніколи не відкочує). Сайт сам браузер не запускає.
Зламаний результат зберігається окремо як `rook-controle-kapot.json`.

**Встановлення браузера (одноразово, BYOS):**
```bash
sudo /usr/local/sbin/mijn-ruimte-installeer browser-controle            # apt-бібліотеки + chrome-headless-shell 156.0.8078.47 (SHA-256) у /srv/mijn-ruimte/browser
sudo /usr/local/sbin/mijn-ruimte-installeer browser-controle --controleer
sudo /usr/local/sbin/mijn-ruimte-installeer rook-controle               # вручну: стенд із тестовим власником (1–2 хв), записує rook-controle.json
sudo /usr/local/sbin/mijn-ruimte-installeer rook-controle --live        # лише публічні сторінки працюючої служби
```
Жодного `curl | bash`, жодного snap: один зафіксований архів із відомим хешем, власність root, доступний для читання службою. Дистрибутивний Chromium у
`/usr/bin/chromium` також розпізнається (в Ubuntu це snap, який під systemd не працює — використовуйте скрипт).
Змінні оточення інсталятора: `ROOK_UIT=1` (пропустити), `ROOK_CHROMIUM`, `ROOK_GEHEUGEN_MAX` (1500M), `ROOK_TIJD_SEC` (600), `ROOK_PAGINA_SEC` (20).

Тести: `tests/eenheid/rook-controle-20261022.test.ts` (оцінювання, модульний контроль на синтетичному dist із `Buffer.from` → зламано),
`uitrol-rook-terugdraai-20261022.test.ts` (bash-логіка активації/відкату з імітованими командами), `uitrol-nazorg-rook-20261022.test.ts`,
`beheer-diagnostiek-rook-20261022.test.ts`.

## 9. Чому polkit, а не sudo (та аварійне рішення)

`sudo` не працює за умови `NoNewPrivileges=yes` (setuid ігнорується). Зі sudo службі застосунку знадобилося б `NoNewPrivileges=no`, а з цим
будь-який setuid-бінарник знову стає доступним для зловмисника в застосунку. З polkit застосунок через D-Bus просить systemd (який вже є root)
запустити фіксований юніт; застосунок зберігає `NoNewPrivileges=yes`, `RestrictSUIDSGID=yes` і порожній `CapabilityBoundingSet`. Ubuntu 24.04 має polkitd 124 з
правилами JavaScript, тому polkit тут ідеально підходить; інсталятор **не** встановлює правило sudo.

Лише якщо polkit на ВМ справді неможливо використати: `deploy/opdracht/mijn-ruimte-opdracht.sudoers` (рівно п'ять команд, кожна з одним фіксованим
дієсловом, `env_reset`, `secure_path`):

```bash
install -m 0440 -o root -g root deploy/opdracht/mijn-ruimte-opdracht.sudoers /etc/sudoers.d/mijn-ruimte-opdracht && visudo -c
```

Після цього застосунок викликає `sudo -n /usr/local/sbin/mijn-ruimte-opdracht <werkwoord>`; це вимагає drop-in із `NoNewPrivileges=no` для
`mijn-ruimte.service` (і код застосунку довелося б під це адаптувати). Це свідоме послаблення захисту; краще встановити `polkitd`.

## 10. Ключ втрачено або скомпрометовано

1. Створіть нову пару ключів (§2).
2. На ВМ замініть вміст `/etc/mijn-ruimte/uitrol-ondertekenaars` новим публічним ключем (старий рядок видаліть).
3. Виконайте `date +%s%3N > /etc/mijn-ruimte/mcp-intrekken`, встановіть `"uitrol": false` та `"gitops": false`, доки все не налаштуєте.
4. Якщо скомпрометовано deploy key: у GitHub (*Settings* → *Deploy keys*) видаліть його та створіть новий (§4.1). Якщо скомпрометовано токен: відкличте в GitHub.

## 11. Остаточні кроки на ВМ (перше встановлення цієї гілки)

Перший раз виконується через SSH (старий root-шлях тоді ще існує і прибирається цим встановленням):

```bash
ssh beheer@203.0.113.10
# 0. попередньо: резервна копія та polkit
sudo systemctl start mijn-ruimte-backup.service
pkaction --version || sudo apt install -y polkitd
# 1. джерело на ВМ: чистий checkout перевіреного й запушеного коміту (НЕ через застосунок)
sudo git clone --branch veilig-agenten-0.4 https://github.com/Tarasevych/hub.git /root/hub-veilig && cd /root/hub-veilig && git log -1
# 2. файл підписантів (§3), після цього встановлення
sudo bash deploy/installeer-app.sh installeren /root/hub-veilig
# 3. перевірити, що старий root-шлях прибрано (§3) і що нові юніти на місці
systemctl list-unit-files 'mijn-ruimte-*' | grep -E 'gitops|opdracht|uitrol'
ls -l /etc/polkit-1/rules.d/50-mijn-ruimte-opdracht.rules /usr/local/sbin/mijn-ruimte-{gitops,opdracht,installeer,uitrol}
# 4. протестувати метод 3 (§6), потім за бажанням налаштувати GitOps (§4) і увімкнути (§7)
```

## 12. Текст для `T:\mijn-ruimte\geheim\UITLEG-LEESMIJ.txt`

Див. `deploy/pc-uitleg/T-geheim-uitrol-sleutel-UITLEG-LEESMIJ.txt` (спочатку українською, потім нідерландською). Скопіюйте цей файл як
`UITLEG-LEESMIJ.txt` поруч із ключем.

## 13. Схвалення оновлень за допомогою passkey на телефоні (метод 2b)

### 13.1 Як це працює

```
Voorbereider (agent tvh_…, MCP-koppeling of account met grant «Кому дозволено», ≤ 30 dagen, intrekbaar)
  └─ deploy/uitrol/maak-voorstelpakket.sh → MCP uitrol_voorstel_begin/stuk/klaar (of POST /api/uitrol/voorstel/*)
       → /srv/data/uploads/uitrol-voorstellen/<id>.tar.gz, status 'wacht-op-goedkeuring' (installeert NIETS)
Eigenaar: admin.tarasevych.com → «Оновлення» / «Updates» → «Схвалити й встановити»
  └─ challenge = sha256("mijn-ruimte-goedkeuring/v1", "goedkeuren", voorstel-id, versie, sha256, nonce, vervaltijd ≤ 5 min), eenmalig
  └─ navigator.credentials.get(userVerification: required) → telefoon: vingerafdruk/gezicht/pincode
  └─ app controleert vooraf (snelle melding) en legt pakket + .goedkeuring.json in /srv/mijn-ruimte/goedkeur-inbox, tikt `aanvraag` aan
mijn-ruimte-goedkeuring.path (root) → mijn-ruimte-uitrol --goedkeuring
  └─ kopie van het pakket naar de root-werkmap → mijn-ruimte-passkey verifieer-goedkeuring (root, omgeving gewist):
       sleutel uit /etc/mijn-ruimte/goedkeur-passkeys.json (root), sha256 van root's EIGEN kopie, rpId, origin, UV, vervaltijd,
       nonce nooit eerder gezien (/var/lib/mijn-ruimte/goedkeuring/staat.json, 0600), signCount
  └─ daarna precies dezelfde stappen als methode 2: inhoudscontrole, uitpakken, installeer-app.sh, gezondheid, rollback
```

* **Root не довіряє застосунку.** Усе, що пише застосунок (пакет, `.goedkeuring.json`, заявки), вважається вхідними даними. SHA-256 обчислюється з власної
  root-копії, публічні ключі беруться з root-файлу, захист від повторів (replay) зберігається в root-теці. Отже, скомпрометований застосунок не може
  проштовхнути встановлення пакета (немає підпису passkey над цим sha256) і не може додати ключ (root-файл доступний застосунку лише для читання;
  новий ключ вимагає асерції від існуючого ключа або SSH). Що він МОЖЕ зробити: видаляти або відхиляти запити (перешкоджання роботі).
* **Одноразовість і прив'язка.** Challenge містить id пропозиції, версію, sha256, nonce і час дії (≤ 5 хв, CHECK у базі даних). Застосунок
  споживає challenge атомарно; root реєструє nonce перед встановленням. Та сама асерція ніколи не спрацює двічі, навіть після
  невдалого встановлення.
* **Лише власник.** Схвалення: сесія на `admin.tarasevych.com` + роль `owner` + `OWNER_EMAIL`. Passkeys кожен користувач реєструє
  самостійно в Налаштування → «Способи входу» (§13.6, step-up); лише власник бачить там біля кожного passkey «Може схвалювати оновлення сервера»
  (лише на `id.`/`admin.`). Надання грантів вимагає step-up. Агенти (MCP-консоль `/api/mcp/agent` і MCP-конектор) бачать лише `uitrol_voorstel_begin|stuk|klaar|status|annuleren`, і
  лише за наявності дійсного гранту; будь-яка назва, схожа на схвалення, відхиляється (`ALLEEN_EIGENAAR_MET_PASSKEY`).
* **rpId = `tarasevych.com`** (починаючи з гілки `aanmeldmethoden`; раніше `admin.tarasevych.com`). Завдяки цьому один passkey працює і на
  `id.tarasevych.com` («Способи входу»), і на `admin.tarasevych.com` («Оновлення»). Застосунок приймає origins `id`/`admin`/`hub`; **root приймає лише
  `https://admin.tarasevych.com` та `https://id.tarasevych.com`** (hub ніколи не повинен нічого підтверджувати в root: менша поверхня атаки). Налаштовується
  в root-файлі (`rpId`, `origins`; origins поза доменом rpId, з портом або без https ігноруються). Passkey прив'язаний до
  свого rpId: ключі від старого rpId більше не працюють (див. §13.6 щодо переходу).
* Attestation = `none`: тип автентифікатора не перевіряється; довіра ґрунтується на підтвердженні через SSH (перший ключ) або
  існуючим ключем. Синхронізовані passkeys (iCloud/Google) часто повертають `signCount` 0; це дозволено (0/0).

### 13.2 Одноразово: встановлення та перший passkey (bootstrap)

```bash
ssh beheer@203.0.113.10
sudo git clone --branch aanmeldmethoden https://github.com/Tarasevych/hub.git /root/hub-passkey && cd /root/hub-passkey && git log -1
sudo bash deploy/installeer-app.sh installeren /root/hub-passkey        # міграції 0022-0023, юніти, допоміжний скрипт, порожній файл ключів (rpId tarasevych.com)
systemctl status mijn-ruimte-goedkeuring.path mijn-ruimte-goedkeur-sleutels.path --no-pager
sudo mijn-ruimte-passkey lijst                                          # rpId tarasevych.com, перемикач вимкнено, (немає ключів)
```

Після цього на **телефоні** (увійшовши як власник): `id.tarasevych.com/methods` = **«Налаштування → Способи входу»** → «Passkeys» → введіть
назву → «Додати passkey» (step-up: TOTP або повторний вхід через Google) → створіть passkey за допомогою відбитка пальця/обличчя. Passkey з'явиться зі статусом «Лише вхід».
Позначте біля цього passkey «Може схвалювати оновлення сервера» (step-up): статус зміниться на «Чекає підтвердження сервером», з **відбитком**
(`ab12 cd34 …`) та SSH-командою. На ВМ:

```bash
sudo mijn-ruimte-passkey wachtend                    # root сам обчислює відбиток із публічного ключа
sudo mijn-ruimte-passkey toevoegen ab12cd34ef56…     # ≥ 16 hex-символів, ЯК НА ТЕЛЕФОНІ; лише за наявності рівно одного збігу
sudo nano /etc/mijn-ruimte/mcp-rechten.json          # "passkey-goedkeuring": true
```

Порівняйте відбиток на телефоні з тим, що показує `wachtend`. **Обмеження:** під час цього єдиного кроку ви довіряєте тому, що сторінка на
телефоні справжня (вже скомпрометований застосунок міг би показати власний ключ із власним відбитком). Тому виконуйте bootstrap одразу
після встановлення з перевіреного коміту або перевірте через `wachtend`, що є рівно одна заявка з міткою, яку ви щойно ввели.

Після цього «Способи входу» показує біля цього passkey «Може схвалювати оновлення». Наступні passkeys (другий телефон, ноутбук): «Додати passkey»,
позначка «Може схвалювати оновлення сервера», далі «Підтвердити ключем, що вже може схвалювати» — SSH більше не потрібен; root додає його після
асерції від уже відомого ключа (`mijn-ruimte-goedkeur-sleutels.path`). Порада: майте щонайменше два passkeys із цим правом.

### 13.3 Дозвіл або відкликання підготовників

Admin → «Оновлення» → «Кому дозволено готувати оновлення»: тип (акаунт / токен агента / MCP-підключення), хто, кількість днів (1–30),
«Дозволити» (step-up). «Відкликати» миттєво скасовує дозвіл і перериває активні завантаження. Усе записується в аудит (`uitrol_voorbereider_*`). Грант
також втрачає чинність, якщо акаунт заблоковано, переведено в архів (пенсію) або якщо для цього акаунта заблоковано ШІ.

Для агента: створіть пакет за допомогою `deploy/uitrol/maak-voorstelpakket.sh` (ключ не потрібен), потім викличте `uitrol_voorstel_begin` із вмістом
`.voorstel.json`, `uitrol_voorstel_stuk` (base64, ≤ 512 КіБ на фрагмент, offset = отримані байти) та `uitrol_voorstel_klaar`.
Ліміти: 300 МБ, 3 відкриті пропозиції на грант, завантаження прострочуються через 24 години, очікуючі пропозиції — через 7 днів.

### 13.4 Відкликання та втрата телефона

* **Відкликати право (коли у вас є інший passkey):** «Способи входу» → біля passkey натисніть «Забрати право схвалювати» і підтвердьте
  іншим passkey, який має це право; root обробить запит. Лише після цього стане доступною кнопка «Видалити» (застосунок відмовляється видаляти passkey, якому root ще довіряє).
* **Втрачено телефон (і немає іншого passkey):** через SSH:
  ```bash
  sudo mijn-ruimte-passkey lijst
  sudo mijn-ruimte-passkey verwijderen <≥16 hex-символів відбитка>
  sudo mijn-ruimte-passkey alles-intrekken             # видалити всі; після цього повторити §13.2
  ```
  Схвалення через passkey після цього неможливе, доки не буде додано новий ключ; метод 2 (підпис на ПК) продовжує працювати.
* **Вимкнути все:** `"passkey-goedkeuring": false` у `mcp-rechten.json` (миттєво), або
  `systemctl disable --now mijn-ruimte-goedkeuring.path mijn-ruimte-goedkeur-sleutels.path`.

### 13.5 Файли

| Шлях | Власник / права | Хто пише |
|---|---|---|
| `/etc/mijn-ruimte/goedkeur-passkeys.json` | root:mijnruimte 0640 | лише root (`mijn-ruimte-passkey`) |
| `/var/lib/mijn-ruimte/goedkeuring/staat.json` | root 0600 (тека 0700) | лише root (nonces 24 год, лічильники) |
| `/srv/mijn-ruimte/goedkeur-inbox/` | mijnruimte 0750 | застосунок (недовірений для root) |
| `/srv/data/uploads/uitrol-voorstellen/` | mijnruimte | застосунок (завантаження від підготовників) |
| `/usr/local/lib/mijn-ruimte/goedkeuring/{webauthn-kern,goedkeur-hulp}.mjs` | root 0644 | інсталятор |
| `/usr/local/sbin/mijn-ruimte-passkey` | root 0755 | інсталятор |
| `/var/lib/mijn-ruimte-uitrol-status/{status.json,goedkeur-sleutels.json,gebeurtenissen.jsonl}` | root:mijnruimte 0640 | root |

База даних (міграція 0023, RLS на користувача): `app.passkeys` (публічний ключ, назва, AAGUID, BE/BS, лічильник, останнє використання) та
`app.passkey_uitdagingen` (≤ 5 хв, одноразові, на користувача ТА сесію). Ці таблиці **не** визначають, хто може схвалювати оновлення; це визначає лише
root-файл.

Пояснення для ПК (без секретів): `deploy/pc-uitleg/passkey-goedkeuring-UITLEG-LEESMIJ.txt`.

### 13.6 «Способи входу» / «Aanmeldmethoden» і перехід на rpId tarasevych.com

**Сторінка.** Ідентичність → «Способи входу» (`id.tarasevych.com/methods`; меню «Налаштування → Способи входу»). Єдина сторінка, як у GitHub:
ел. пошта та Google (лише читання), passkeys (додавання з `residentKey: preferred` + обов'язковий UV, перейменування, видалення зі step-up; для кожного
passkey провайдер (підказка AAGUID), «синхронізується» (BE/BS), коли додано, коли востаннє використано), двофакторна автентифікація (налаштування/вимкнення TOTP; без
SMS) та коди відновлення (статус «збережено», нові коди з кодом TOTP або свіжим підтвердженням passkey, показуються один раз). Вкладки
«Безпека» та «Відновлення» відкривають ту саму сторінку, прокручену до відповідної секції. Admin «Оновлення» показує лише поточний стан і посилання.

**Step-up: вікно «Підтвердіть доступ» / «Toegang bevestigen».** Будь-яка чутлива дія, яка повертає 403 `STEP_UP_REQUIRED`, відкриває власне
модальне вікно (як «Confirm access» у GitHub), більше жодних `window.prompt/alert/confirm`. Однією мовою (мовою сторінки), з написом
«Ви ввійшли як <e-mail>» і лише тими способами, які налаштовані в користувача (`POST /api/owner/access/stap-op/methoden`, лише так/ні):
passkey (велика кнопка), код із застосунку-автентифікатора, код відновлення (`POST /api/owner/access/stap-op` із `methode: 'herstelcode'`:
одноразове використання, таке саме блокування перебору, як і для TOTP, сповіщення користувачу) і завжди «Підтвердити повторним входом через Google»
(`prompt=login`, `max_age=0`, обов'язковий `auth_time`). Хто має лише Google, одразу бачить кнопку Google з поясненням. Підтвердження
діє 5 хвилин і лише для цієї сесії. Без послаблення безпеки: заміна кодів відновлення при увімкненому TOTP, як і раніше, вимагає коду TOTP або свіжого
passkey; вимкнення TOTP вимагає коду TOTP або коду відновлення.

**Відновлення дії після Google.** Перед перенаправленням сторінка зберігає в `sessionStorage` лише дію (напр., `passkey-toevoegen` з
обраною назвою, `herstelcodes-maken`), ніколи не коди чи паролі; дійсне 10 хвилин, лише на тому самому шляху. Step-up із
`id.tarasevych.com` повертає на ту саму сторінку (раніше — на hub); сервер перевіряє, що це той самий origin. Після повернення
сторінка сама повторно виконує дію. Інші дії: коротке повідомлення «Доступ підтверджено — повторіть дію».

**Passkeys на телефоні (QR / hybrid).** Реєстрація без `authenticatorAttachment`, `residentKey: preferred`,
`hints: ['client-device','hybrid']`; під час підтвердження кожен ключ отримує свої збережені транспорти плюс `hybrid`, щоб Windows/Chrome
показував «Використовувати телефон або планшет» із QR-кодом (Bluetooth має бути увімкнений). Для кожного passkey: тип (менеджер паролів, телефон,
ключ безпеки, пристрій), «Синхронізовано» (BE/BS), коли додано, коли востаннє використано. Ядро (включно з root) читає BE/BS лише як
інформацію; UP і UV залишаються обов'язковими, лічильник 0 → 0 (синхронізовані passkeys) є дійсним.

**Вхід лише за допомогою passkey: (поки що) ні.** Свідоме рішення: побудова сесії (вкладки, передача стану, прив'язка login-CSRF) є складною і не може бути
протестована на реальних пристроях автоматично, а рідше використання passkey зменшує ризик того, що захоплена сторінка підмінить запит схвалення (goedkeur-challenge)
у звичайному вікні входу. Зараз passkeys слугують для підтвердження дії (step-up) та схвалення оновлень; Google залишається способом входу.

**Перехід на ВМ (одноразово, як root):**
```bash
sudo mijn-ruimte-passkey lijst          # чи ще вказано rpId admin.tarasevych.com?
sudo mijn-ruimte-passkey rp-bijwerken   # порожній файл → rpId tarasevych.com + origins admin/id (інсталятор також це робить)
```
`rp-bijwerken` відмовляє (exit 1), якщо у файлі вже є ключі для старого rpId: з новою сторінкою вони більше не працюватимуть. У такому разі спочатку виконайте
`sudo mijn-ruimte-passkey alles-intrekken` (або `verwijderen <відбиток>` для кожного ключа), потім `rp-bijwerken`, і повторіть §13.2 зі сторінки
«Способи входу». До того часу сторінка показує власнику попередження, що root ще налаштований на старий rpId.


### 13.7 «Додати passkey» → «Продовжити» нічого не робило (реліз 20261009-052551) та e2e-тест

**Причина.** Після натискання «Продовжити» сторінка завантажує опції реєстрації та викликає `navigator.credentials.create()`. Якщо
step-up ще був дійсним (свіжий вхід через Google < 5 хв, напр., одразу після розгортання), то вікно
«Підтвердіть доступ» справедливо не з'являлося, і сторінка чекала на вікно passkey від браузера/Windows. Якщо це вікно не з'являлося (або зависало;
опції реєстрації містили `hints: ['client-device','hybrid']`), сторінка залишалася чекати на цей проміс без жодного повідомлення, без кнопки
«Скасувати» та без ліміту часу: кнопка була `disabled`, а в темній темі (світлий
`--boot-accent` `#8dbab7` із білим текстом) вона вже виглядала блідою/вимкненою. До того ж будь-яка помилка завантаження самого вікна
(чанк після нового релізу, помилка рендеру) тихо перетворювалася на `false`.

**Виправлення.**
- Під час очікування відображається рядок стану («Готуємо запит…» → «Відкрито вікно passkey браузера або Windows…», через 25 с —
  підказка) з працюючою кнопкою «Скасувати» (`AbortController` → «Додавання passkey скасовано.»). Будь-яка помилка виводиться як повідомлення в
  секції та в консолі.
- Якщо вікно «Підтвердіть доступ» не вдається відкрити, `client.ts` повертає помилку `STAP_OP_VENSTER_FOUT` («оновіть сторінку»);
  помилка рендеру у вікні перехоплюється (error boundary) і не проковтується тихо.
- У параметрах реєстрації більше немає `hints`: браузер показує свій повний вибір (цей пристрій, телефон через QR,
  ключ безпеки).
- Акцентні кнопки в темних темах мають темний текст (`--ap-op-accent`).
- `deploy/installeer-app.sh` тепер збирає проєкт із `NODE_ENV=production` (лише `npm ci` працює в режимі development). До релізу
  20261009-052551 включно продакшн містив dev-версію React.

**Компонування.** Passkeys розміщені в одному місці (під «Вхід»), і біля кожного passkey є перемикач власника «Може схвалювати
оновлення сервера». Під 2FA залишилися лише застосунок-автентифікатор і примітка, що passkeys також зараховуються; коди відновлення
мають власну секцію. Пояснення та підказка щодо QR винесені в `(?)` поруч із заголовком (`src/InfoTip.tsx`, поповер із
`role=tooltip`/`aria-describedby`, наведення/фокус/дотик, Esc).

**E2E.** `npx vite build && node scripts/e2e-lokaal.mjs` із тим самим оточенням, що й модульні тести, плюс
playwright-core (`PLAYWRIGHT_CORE`), Chrome (`CHROME`) і тестовий CA у `$HOME/.pki/nssdb` із сертифікатом для
`*.tarasevych.com` (`E2E_TLS`: `srv.key`/`srv.crt`). Справжній headless Chrome, `--host-resolver-rules` на локальний сервер, віртуальний
автентифікатор CDP (internal, usb, hybrid/cable), Google імітовано через `page.route`. Скриншоти зберігаються в `E2E_SCREENSHOTS`.
Тест прибирає створених ним користувачів (унікальний індекс `records_een_eigenaar`).

### 13.8 Google-step-up: цикл «Підтвердіть доступ» після повернення (реліз 20261009-055320) та коди відновлення

**Причина циклу.** URL для step-up запитував `prompt=login` + `max_age=0` + запит claims на `auth_time`. Google
не підтримує `prompt=login` і не примушує повторно вводити пароль: за наявності активної сесії Google він показує лише
вибір акаунта і повертає `id_token` зі **старим** `auth_time` (або без `auth_time`, якщо «session age claims» в
OAuth-клієнті вимкнено). Сервер зараховував step-up лише за умови `auth_time`, молодшого за 5 хвилин, а інакше
**тихо** не зберігав його; callback просто повідомляв «вхід виконано». Повернувшись на `/methods`, сторінка відновлювала дію, знову отримувала
`403 STEP_UP_REQUIRED` і відкривала те саме вікно: нескінченний цикл без жодного повідомлення.

**Нове правило (`backend/index.ts` `ownerStapOpAuthTijd`, `backend/stap-op.ts` `googleUitgifteVoorStapOpVers`).**
Google-step-up зараховується, якщо:
1. `auth_time` із підписаного `id_token` молодший за 5 хвилин (як раніше; залишається найсильнішою формою), **або**
2. ідеться про **явну транзакцію step-up** (запущену з модального вікна, `intent: step-up`, лише за наявності
   активної сесії) ТА:
   - `id_token` **щойно виданий**: `iat` ≤ 2 хвилин тому, не раніше кліку (початку транзакції, з допуском годинника 60 с),
     а сама транзакція молодша за 10 хвилин;
   - **nonce** збігається з nonce, який був створений під час кліку саме для цієї транзакції та збережений на сервері
     (`takeOAuthMaterial`, одноразовий), разом з одноразовим `state`, PKCE-verifier та кукою прив'язки входу (той самий
     браузер);
   - Google-**subject** (`sub`) належить акаунту, який запустив step-up (`account_identities`, інакше `users.sub`);
   - `email_verified` дорівнює true (`verifyGoogle`/`ensureUser` вже цього вимагають).

Тоді step-up діє 5 хвилин від моменту завершення, лише для цієї сесії (tab-overlay/якір), як і TOTP та passkey.

**Чому це обґрунтовано.** Google не надає способу примусово запитати пароль повторно; GitHub та інші сервіси із
зовнішнім IdP також не можуть довести більше, ніж «користувач щойно, у цьому браузері, активно обрав цей акаунт Google». Саме це
доводять пункти 2a–d: без кліку у виборі акаунта код не повернеться; старий код або `id_token` з іншої
транзакції не пройде перевірку `state`/`nonce`/PKCE/`iat`; інший акаунт Google не пройде перевірку `sub`. Чого це НЕ доводить, так це того, що особа
знає пароль від Google, якщо вхід у Google вже був виконаний — це та сама межа, що й при звичайному вході. Для дій, де цього
замало, залишаються суворіші шляхи: passkey-step-up (`passkeyStapOpGeldig`, схвалення root), код TOTP при заміні кодів відновлення
та вимкненні TOTP (вони свідомо не приймають Google). Звичайний вхід (не транзакція step-up) зі
свіжим `iat`, як і раніше, **не** зараховується (лише `auth_time`). Аварійний прапорець `STAP_OP_GOOGLE_ZONDER_AUTH_TIME=1` залишається, але
більше не потрібен. Авторизаційний URL тепер завжди використовує `prompt=select_account` (+ `max_age=0` і запит claims під час
step-up).

**Ніколи не мовчки.**
- Інший акаунт Google: `STEP_UP_ACCOUNT_MISMATCH` перед `ensureUser` — жодного створення нового акаунта, жодної зміни сесії, запис в аудит
  `owner.step_up.google rejected`. Немає свіжого підтвердження: `STEP_UP_NOT_FRESH`.
- Відповіді callback для step-up містять `stepUp: true`; у разі помилки `OwnerIdentityCallback` записує причину в
  `sessionStorage` (`mijn-ruimte-stap-op-fout`, лише код помилки) і повертає на сторінку. Вікно показує
  причину («Ви вибрали інший акаунт Google…», «Google не підтвердив новий вхід…»). Якщо вікно знову відкривається одразу після
  відновлення без збереженої причини, воно показує «Повторний вхід через Google не підтвердив доступ…».

**Коди відновлення (у стилі GitHub).**
- Після створення коди (`XXXX-XXXX-XXXX`) показуються один раз із кнопками Завантажити (`.txt`), Копіювати, Друкувати та «Я зберіг коди» →
  «Готово» (встановлює `bekekenOp`).
- Надалі доступний лише `POST /api/owner/access/recovery/overzicht`: для кожного коду порядковий номер, останні 2 символи (підказка), статус
  (`ongebruikt` / `gebruikt` + дата / `ingetrokken`), «Залишилося N з 10». Самі коди зберігаються лише як HMAC із перцем (pepper);
  підказка зменшує простір перебору з $2^{48}$ до $2^{40}$ на код, чого з блокуванням спроб цілком достатньо. Хеші ніколи не передаються у
  відповіді.
- «Відкликати всі»: `POST /api/owner/access/recovery/intrekken` (вимагає step-up) → `hashes: []`, `remaining: 0`,
  `ingetrokkenOp`; усі шляхи (вхід із паролем+кодом, step-up, вимкнення TOTP) використовують `herstelcodeGebruiken`,
  яка відхиляє відкликані набори. Користувачу надсилається сповіщення.
- «Створити нові» замінює набір (старі миттєво втрачають чинність; виводиться повідомлення, якщо залишалися невикористані).
- Використання фіксується атомарно: `takeArrayValue` (видалення хешу, лічильник), а потім `zetEenmaligInMap` (`gebruikt[hash] = tijd`),
  без перезапису решти запису.
- Введення може містити дефіси, пробіли та малі літери.
- Міграція не потрібна: усе зберігається в існуючому jsonb-записі `identity_recovery_codes_v1`. Старі набори (без
  `overzicht`) показують лише лічильник із підказкою «створіть нові, щоб бачити стан кожного коду».
- `/recovery/overzicht` не підпадає під суворий ліміт MFA (10/хв на IP); інші маршрути кодів відновлення підпадають.

**E2E.** `tests/e2e/herstelcodes.e2e.ts`: step-up зі старим `auth_time`, але свіжим `iat` → коди створено; завантаження,
копіювання, друк, підтвердження; використання коду у вікні (інша сесія) → закреслено, лічильник 9; відкликання →
непридатні до використання; інший акаунт → повідомлення у вікні; старий `iat` → повідомлення.

### 13.9 mcp.*/agents перебудовано (у стилі GitHub) та прибрано самотнє «RATE_LIMITED» над заголовком

**Причина «RATE_LIMITED».** Нескінченний цикл рендеру на старій сторінці агентів. Компонент `AiToestemmingen` завантажував
`/api/owner/ai/grants/list` у `useEffect` із залежністю `onChange`. Батьківський компонент
(`BrowserExtensionPanel`/`McpAgentsHub`) при кожному рендері передавав нову функцію `onChange` і всередині неї оновлював стан. Це викликало
новий рендер, новий `onChange` і новий запит без кінця: з відкритим браузерним агентом це породжувало
сотні запитів на хвилину. Загальний ліміт (`API_RATE_LIMIT_PER_MIN`, 600/хв на IP) після цього повертав 429
`{error:'RATE_LIMITED'}` на ВСІ `/api/*` із цього браузера, включно з `/api/mcp/tokens/list` та `/api/mcp/permissions`.
Ці два маршрути завантажувалися через `McpServiceView` (`run('agents', loadTokens)`), який виводив сирий код помилки в
`<p class="mcp-lead">{error}</p>` над заголовком.

**Виправлення.**
- `onChange` передається через `ref`. Завантаження залежить лише від `agentId`/`versie`, а стан оновлюється лише тоді, коли значення
  справді змінилося.
- `BrowserExtensionPanel.onGrants` обгорнуто в стабільний `useCallback`.
- Залишився лише один поллер (пристрої та очікуючі дії, 5 с). Решта завантажується під час відкриття, після дії та далі спокійно
  (60 с, лише у видимій вкладці). Журнал оновлюється кожні 30 с, лише на відкритій вкладці.
- `McpServiceView` більше нічого сам не завантажує для «agents» і показує помилки через `foutTekst()` (`src/agenten/fouten.ts`).
  При 429 виводиться зрозуміле речення з часом очікування, без технічного коду. Для інших помилок код відображається дрібним шрифтом поруч.
- E2E-тест вимірює це: з відкритим пристроєм за 8 с надходить щонайбільше 3 запити до `grants/list`.

**Сторінка** (`src/agenten/`, точка входу `src/McpAgentenHub.tsx` зберігається) має такі вкладки, доступні через
хеш в URL:

| Хеш | Вкладка |
|---|---|
| `#overzicht` | Огляд / Overzicht |
| `#ai` | Підключені ШІ / Verbonden AI |
| `#apparaten` | Пристрої й браузери / Apparaten en browsers |
| `#tokens` | Токени / Tokens (двері сервера — на mcp/verbindingen, технічний профіль) |
| `#journaal` | Журнал / Logboek |

- Відкритий рядок також відображається в хеші, наприклад `#apparaten/dev:<id>` або `#ai/oauth:<id>`.
- Старі адреси автоматично перенаправляються:

  | Стара адреса | Нова адреса |
  |---|---|
  | `#overview`, `#pending` | `#overzicht` |
  | `#claude` | `#ai` |
  | `#tools` | `#ai/hulpmiddelen` |
  | `#extension` | `#apparaten/extensie` |
  | `#doors` | `#tokens` |
  | `#pair` | `#apparaten/koppelen` |
  | `#dev:<id>` | `#apparaten/dev:<id>` |

- `?extension=welcome` продовжує працювати.
- Рядки за замовчуванням згорнуті: назва, один рядок стану та кнопка праворуч. У розгорнутому вигляді видно всі технічні деталі.
- Дії, які щось видаляють, спочатку просять підтвердження прямо на сторінці (без `window.confirm`). Після цього з'являються
  індикатор завантаження (спінер) і повідомлення про те, що змінилося і о котрій годині.
- Відкликані або відключені елементи залишаються видимими у згорнутій групі «Відкликані / Відключені» (протягом 90 днів).

**Нові серверні ендпоїнти** (власник, `ownerGate`):
- `POST /api/owner/agents/overzicht` повертає:
  - OAuth-з'єднання з їхнім статусом (`active`/`revoked`/`expired`);
  - відключені агенти за останні 90 днів із причиною (`user`/`repaired`/`blocked`);
  - кількість дозволів на кожного агента;
  - URL MCP.
- `POST /api/owner/agents/journaal` із тілом `{soort, onderwerp, voor, limit}` повертає єдину хронологію з `app.audit`.
  - Записи проходять через `JOURNAAL_ACTIES` та `journaalItem()`: поля, схожі на секрети (token, hash, cookie,
    nonce, code, key…), відкидаються, а IP-адреса представлена лише як 12-символьний хеш.
  - Прострочені дозволи та прострочені OAuth-з'єднання **обчислюються динамічно**, а не зберігаються в БД. Вони показуються лише на
    першій сторінці (90 днів).
- `auditLijst()` тепер підтримує фільтр `acties: string[]`.
- `POST /api/owner/agents/:id/revoke` тепер повертає `revokedAt`.

**Нові або доповнені записи аудиту:**

| Дія | Коли або що |
|---|---|
| `owner.mcp.grant.connected` | OAuth-клієнт отримує токени. |
| `owner.mcp.grant.revoked` | Тепер із назвою клієнта та причиною: `user`, `client` (клієнт сам відкликав) або `refresh_reuse` (автоматично, при повторному використанні refresh-токена). |
| `owner.agent.updated` | ПК-агент або розширення повідомляє іншу версію під час підключення (`from` → `to`). |
| `owner.agent.paired` | Тепер із назвою, версією та `replacedIds`: перевстановлення відображається як «Перевстановлено». |
| `owner.agent.revoked` | Тепер із назвою, платформою, версією та `reason: 'user'`. У таблиці також записується `revoke_reason = 'user'`. |
| `mcp_console_token_revoked` | Тепер із назвою та префіксом. |

**Обмеження.**
- Видалення розширення в браузері сервер не бачить миттєво. Ви помітите це лише тоді, коли токен буде відкликано чи
  відхилено, або коли розширення залишатиметься офлайн.
- Країна не зберігається, лише хеш IP-адреси.
- «Відкликати всі» відкликає елементи по одному через існуючі ендпоїнти (немає ендпоїнта, який робить усе одним
  запитом). Якщо один не вдається, процес зупиняється на ньому. Список оновлюється, а те, що вже було відкликано, переходить у
  «Відкликані».

**Тести.**
- Модульний тест: `tests/eenheid/agenten-journaal.test.ts`. Перевіряє видалення секретів, теми, фільтр
  `acties`, історію з причиною, тексти помилок і перевірку вихідного коду проти нескінченного циклу.
- E2E: `tests/e2e/agenten.e2e.ts`. Перевіряє:
  - вкладки та старі глибокі посилання (deep links);
  - згорнуті рядки та розгортання;
  - відкликання (підтвердження, спінер, повідомлення, група «Відкликані», без перезавантаження сторінки);
  - відключення з історією «Перевстановлено»;
  - журнал із фільтрами;
  - імітовану помилку 429 (дружній текст, ніде немає сирого `RATE_LIMITED`);
  - ширину 390 px без горизонтального переповнення, у світлій і темній темах.

### 13.10 Доступ у контексті: використання, нотатки, відкликання з причиною, «Це був не я» (міграція 0024)

**Використання.** Кожне використання коду відновлення та passkey фіксується в `app.toegang_gebruik` (RLS: лише власні рядки):
дія (фіксований список `ACTIES` у `backend/toegang-context.ts`, невідоме → `bevestigen`), хост, пристрій (браузер · ОС із
User-Agent), короткий хеш IP (`AUDIT_IP_PEPPER`, ніколи не сама IP-адреса). Step-up передає мітку дії (`actieVoorUrl` у
`src/platform/stap-op.ts`); сервер приймає лише мітки з білого списку. Для кожного ключа показуються останні 20 записів у розгорнутому списку.

**Нотатки.** Приватні, ≤ 500 символів, `app.toegang_notities` (RLS), для passkeys, наборів кодів, окремих кодів і (пізніше) кодів доступу.
Маршрут `POST /api/owner/access/notities/{lijst,opslaan}`.

**Відкликання права / видалення passkey для схвалення.** Лише власник. Обов'язкова причина ≥ 10 символів і *сильний* step-up
(passkey, TOTP або код відновлення); самого лише Google недостатньо, щойно в користувача є щось сильніше (403
`STEP_UP_STRONG_REQUIRED`, вікно тоді не показує кнопку Google). Записується в `app.toegang_wijzigingen` + аудит: хто,
сесія, пристрій, хеш IP, коли, причина, ключ, як підтверджено. Сповіщення в дзвіночку («Це були ви?», посилання
`/methods?wijziging=<id>`), на `/agents` → Журнал під «Права й ключі». Підготовники (admin → Оновлення) підпорядковуються тому самому правилу;
задіяний користувач отримує сповіщення та запис в історії.

**Як відкликання потрапляє до root.** Застосунок записує `sleutel-intrekken-<fp32>.json` в inbox (асерція не потрібна:
видалення є безпечним напрямком). `mijn-ruimte-goedkeur-sleutels.path` бачить файл і запускає `goedkeur-hulp.mjs verwerk`
від імені root: той перевіряє причину та відбиток, записує `staat.ingetrokken[fp] = {op, door, sessie, wijziging, reden}`,
видаляє ключ із `/etc/mijn-ruimte/goedkeur-passkeys.json`, записує статус і подію `PASSKEY_INGETROKKEN`.
Один раз відкликаний відбиток **не може** повернутися через застосунок (асерцією) (`OPNIEUW_VIA_SSH`), лише через
`sudo mijn-ruimte-passkey toevoegen <fp>` — це очищує позначку відкликання.

**«Це був не я — скасувати та захистити акаунт».** Сильний step-up. Якщо запит ще лежить в inbox: запит видаляється, право
залишається. Якщо root уже обробив: створюється нова заявка + інтерфейс чесно показує SSH-команду. Видалений passkey відновлюється в
застосунку. Сесія, яка виконала зміну, завершується (якщо це не поточна сесія). Усе фіксується в аудиті та історії.

**Ел. пошта.** Системного поштового сервера немає: листи можуть надсилатися лише через власне підключення Gmail користувача. Тому сповіщення
завжди з'являється в дзвіночку; ел. пошта (поки що) не надсилається.

Тести: `tests/eenheid/toegang-context.test.ts`, `uitrol-goedkeuring`, `passkeys`; e2e `tests/e2e/toegang-context.e2e.ts`
(скриншоти `notities-*.png`, `intrekken-*.png`). Увага: ліміт step-up діє на IP — запускайте e2e-файли з
паузою (≥ 2 хв) або окремо, інакше отримаєте 429 на `/api/owner/access/stap-op`.

### 13.11 Коди доступу для інших / коди доступу, гостьові сесії та «Сесії» (міграція 0025)

**Що.** На `id.tarasevych.com/methods` є секція «Коди доступу для інших» (лише власник; інші отримують
`OWNER_REQUIRED` і не бачать секції). «Створити код доступу» запитує назву, приватну нотатку, що гість може переглядати,
термін дії (безстроково / 1 год / 1 день / 7 днів / 30 днів / власна дата + час, ≥ 5 хв і ≤ 366 днів) та одноразовий чи
багаторазовий (опційно макс. 1–1000×). Створення вимагає **сильного** step-up (passkey, код із застосунку або код відновлення; свіжого
Google-step-up недостатньо → `STEP_UP_STRONG_REQUIRED`). Максимум 50 кодів на власника, 20 спроб створення на годину.

**Області доступу (scopes, білий список у `backend/toegangscodes.ts`, лише читання, за замовчуванням відмова):**
`profiel.lezen` (ім'я + фото Google, ніколи не ел. пошта), `apparaten.lezen` (назва, платформа, востаннє бачили, чи активний),
`journaal.lezen` (журнал агентів **без** записів про права/ключі/коди/токени). Під час завантаження модуля
перевіряється, що кожен scope закінчується на `.lezen` і не зачіпає нічого зі списку «ніколи»: способи входу, passkeys,
права схвалення, адміністрування, токени, root/оновлення, видалення/експорт акаунта. Невідомий scope → `SCOPE_NIET_TOEGESTAAN`.

**Код.** 80 бітів (Crockford base32, `XXXX-XXXX-XXXX-XXXX`; O→0, I/L→1, пробіли/малі літери дозволені). Показується один раз
із кнопками копіювання / QR / поділитися; посилання для поширення має вигляд `https://id.tarasevych.com/toegang#code=…` (фрагмент `#` → ніколи не потрапляє в логи сервера;
сторінка одразу прибирає його з адресного рядка). У базі даних зберігається лише `sha256('mijn-ruimte-toegangscode\0'+code)` + 4 символи підказки.

**Гостьова сесія (ізоляція).** `/api/gast/inwisselen` видає окрему куку `tsv_gast` (`HttpOnly`, `Secure`, `SameSite=Strict`,
**`Path=/api/gast`**, лише хост `id.tarasevych.com`; `Origin` має бути `https://id.tarasevych.com`). Це ніколи не сесія
власника: жоден маршрут `/api/owner/*` не читає цю куку (протестовано: 401). Кожен гостьовий запит заново перевіряє сесію,
код (відкликано? прострочено?) та власника (заблоковано?) → відкликання/скорочення/закінчення терміну діє миттєво. Гостьова сесія триває
щонайбільше до закінчення дії коду і ніколи не довше **24 годин** на одне погашення коду. Кожна дія гостя (переглянуто / відмовлено)
записується в `app.toegangscode_log` та в аудит з актором `gast:<code-id>`; журнал на `/agents` показує їх під «Права й ключі».
При **першому** використанні коду власник отримує сповіщення в дзвіночку (із посиланням на код). **Ел. пошта не надсилається**
(немає системного поштового сервера, див. §13.10).

**Підбір/ліміти.** На кожен IP суворий бакет `gast-inwisselen` 10/хв (Postgres) + блокування після 5 невдалих спроб
(`gast-inwisselen:<ip-hash>`, 15 хв, із подвоєнням) → 429 `GAST_GEBLOKKEERD`, навіть із дійсним кодом. Повідомлення про помилку завжди
загальне (`CODE_ONGELDIG`); спроби на існуючому коді логуються біля цього коду як «geweigerd» (відхилено).

**Керування.** Список зі статусом Діє / Використано / Закінчився / Відкликано, використанням (`x` з `max`), останнім використанням (час, пристрій,
хеш IP) та розгорнутою історією. «Відкликати» запитує причину (≥ 10 символів, без step-up: безпечний напрямок) і
миттєво завершує всі гостьові сесії цього коду. «Змінити строк»: скоротити можна без step-up (активні гостьові сесії також
скорочуються), продовжити або зробити безстроковим вимагає сильного step-up.

**«Сесії та пристрої»** (`id.tarasevych.com/sessions`, без нового пункту меню): власні сесії тепер показують справжній спосіб входу
(`authMethod`; доки немає входу за passkey, це зазвичай Google) та тривалість; нижче — «Гостьові сесії» (назва коду, пристрій,
початок, остання активність, тривалість, хеш IP) із кнопкою «Завершити гостьову сесію» для кожної сесії. «Завершити всі інші» →
`POST /api/owner/identity/security/revoke-others {gast:true}`: завершує всі інші власні сесії, вкладки поза цією сесією,
запам'ятовані браузери та всі активні гостьові сесії; поточний вхід залишається.

**Також.** «Відхилити» біля пропозиції оновлення (admin «Оновлення») тепер використовує вбудоване поле причини замість `window.prompt`.
Нова залежність: `qrcode-generator@2.0.4` (MIT, без залежностей) для генерації QR (SVG-шляхи, без `innerHTML`).

**База даних (0025).** `app.toegangscodes`, `app.gast_sessies`, `app.toegangscode_log`, із RLS `user_id = app.huidige_gebruiker()`
для `mijnruimte_app`; роль застосунку має лише `SELECT` (запис через системну роль). Розгортання: `migreer` перед перезапуском.

**Тести.** `tests/eenheid/toegangscodes.test.ts`; e2e `tests/e2e/gast-toegang.e2e.ts` (скриншоти `gast-*.png`).
E2E-сервер встановлює `E2E_LOKALE_LIMIETEN=1` (лише `tests/e2e/server.ts`): тоді суворі бакети на IP збільшуються ×20, щоб
e2e-файли могли виконуватися послідовно без 429 на `/api/owner/access/stap-op`. Сервер логує попередження, якщо цей прапорець
увімкнено; **ніколи** не вмикайте його в продакшні (`/etc/mijn-ruimte/*.env` його не містить).

## 14. Меню v2 (гілка `menu-v2`) — бічна панель етап 1 + модель даних етап 2

**Без міграції.** Налаштування зберігаються як JSON-поле `sidebar` в існуючому рядку `owner_ui_preferences_v1`
(bootstrap → `uiPreferences.sidebar`; збереження через `POST /api/owner/ui/sidebar/save`, лише схвалена сесія,
макс. 20 000 символів → інакше `413 SIDEBAR_TOO_LARGE`; сервер нормалізує все за допомогою `normaliseerZijbalk`).
Без схваленого акаунта: лише `localStorage` (`tsv-zijbalk-v2`).

Що змінюється для користувача:
- Панель інструментів угорі бічної панелі: **Завжди розгорнута** / **Завжди згорнута** (нове: ніколи не розгортається при наведенні) / **Автоматично**.
  У вузькому режимі: одна кнопка, яка відкриває компактну панель. На мобільних (≤ 700 px) залишається гамбургер + висувна панель (drawer).
- Стрілки прокручування ▲/▼ із плавним загасанням, лише коли є куди прокручувати; клік = плавний крок, утримання = безперервна прокрутка.
- Вузька рейка 60 px, без видимої смуги прокручування (орієнтиром слугують стрілки); кружальця як маркери; широкий режим: пігулка навколо іконки+тексту.
- Спливаючі підказки сайту (праворуч) на кожному пункті у вузькому режимі, включно з фокусом із клавіатури; без нативного `title`.
- Налаштування → Меню: **Стиль іконок** (Класичний / Кольоровий) та режим бічної панелі.
- Нові стандартні іконки (Налаштування = шестерня, MCP = кабель); свідомо обрана користувачем іконка зберігається.

Перевірка після розгортання: відкрити `/menu` → обрати «Кольоровий» → у другому браузері під тим самим акаунтом → кольоровий стиль також застосовано.

### 14.1 Фаза A (після рев'ю Павла, 9-10-2026) — кружальця, підменю пошти, кольори за розділами

**Без міграції, без змін на сервері** (лише CSS/TS у фронтенді + тести).
- Вузький режим: КОЖЕН пункт є кружальцем без тексту — включно з активним підпунктом і кнопкою «Написати лист» (36 px, заповнена кольором Пошти;
  анімація конверт → ручка при наведенні зберігається). Причина старої «пігулки з обрізаним текстом»: кнопка пошти не мала вузького стану.
- Вузький режим: іконки підменю пошти були приховані (CSS ховав кожен дочірній елемент, крім `.canonical-menu-icon-slot`) і стояли
  зміщеними (кнопка завширшки 119 px розширювала колонку). Тепер: приховано лише текст/лічильники, іконка відцентрована у смужці.
- Кольори за розділами (конвенції): Мій простір — бірюзовий (teal), ШІ — фіолетовий, Пошта — синій, Хмара — небесно-блакитний, GitHub — графітовий (у темній: світло-сірий),
  Розумний будинок — помаранчевий, MCP — зелений, Налаштування — сірий, API — рожевий, Адміністрування — червоний (+ завдання — лаймовий, календар — індиго, нотатки — вохра).
  Джерело: `ACCENT_KLEUREN` у `shared/menu-model.ts` (= палітра в `src/menu-v2.css`, контролюється тестом), `--a` головний, `--a2` підпункт (світліший відтінок).
  Класичний: колір лише при наведенні та для активного пункту; Кольоровий: завжди. Колір належить ДЖЕРЕЛУ походження (`itemAccent(id)`), тому копії
  та переміщені пункти у фазі 2 зберігають свій початковий колір.
- Широкий режим: з'єднувальна лінія підменю має товщину 2 px у відтінку розділу, тепер також і в Пошті.
- Тести: `tests/eenheid/menu-v2.test.ts` (контраст ≥ 3:1 у світлій/темній темах, CIEDE2000 ≥ 12 між головними розділами та ≥ 7 між усіма,
  однаковий тон кольору підпункту/головного пункту, походження), `tests/e2e/menu-v2-kleuren.e2e.ts` (кружальця ≤ 44 px усередині рейки, іконки видимі та
  відцентровані, без тексту, кольори з моделі; скриншоти `menu-12`…`menu-18`).

Перевірка після розгортання: Ctrl+F5 → меню «Завжди згорнута» → Пошта: всі підпункти як кружальця з іконкою; «Налаштування → Меню» → Кольоровий.

### 14.2 Фаза B3 + B2 (9-10-2026) — ⚙ у панелі інструментів, «живе» меню (бейджі + бульбашки сповіщень)

**Без міграції.** Нова таблиця записів `menu_tellers_v1` (універсальний RLS за `data.userId`, як у міграції 0007), два нові маршрути:
- `POST /api/owner/menu/tellers` — читання власних лічильників; лише схвалена сесія (інакше 403 `OWNER_APPROVED_SESSION_REQUIRED`).
- `POST /api/owner/menu/tellers/zet` — `{bron:'mail', ongelezen:<ціле число 0…99999>}`; лише схвалена сесія, лише з
  `mail.tarasevych.com` (служба прив'язується до хоста через `ownerService`), інакше 400 `MENU_TELLER_BRON_ONGELDIG` /
  `MENU_TELLER_WAARDE_ONGELDIG`. Зберігається ЛИШЕ число (жодних тем, відправників чи вмісту); один рядок на користувача,
  записується лише при зміні (Пошта групує зміни за 1,2 с).

B3 — ⚙ (`Settings2`) як 4-та кнопка в панелі інструментів (у широкому режимі ТА у вузькій панелі), справжнє посилання на
`https://id.tarasevych.com/menu#menu-meldingen` (на самому `id.*`: прокрутка всередині сторінки до секції). Налаштування → Меню отримало секцію
«Сповіщення в меню»: увімк./вимк., число або кольорова крапка, бульбашки при наведенні, «увага до нового» (пульсація), нагадування (ніколи/15/30/60/120
хв), тихі години (без пульсації/нагадувань, бейджі залишаються), увімк./вимк. за типами (Пошта, Безпека, Доступ і запити, Спільний доступ, ШІ та
агенти, Система). Зберігається в існуючому полі `sidebar` (`meldingen`, суворо нормалізується в браузері ТА на сервері).

B2 — джерела: існуючі сповіщення дзвіночка (`site_notifications`, лише непрочитані) + лічильник пошти. Тип → пункт меню та колір
(`shared/menu-meldingen.ts`): `access_request` → Адмін › Доступ (помаранчевий), `account_email_conflict` → Налаштування › Акаунт (червоний),
`workspace_share` → Мій простір › Огляд (зелений), `google_login_config` → Адмін › Контур (сірий), непрочитана пошта → Пошта › Вхідні (синій).
Бейдж на сторінці також підсумовується на головному пункті розділу. Наведення/фокус → бульбашки (макс. 5, спочатку найновіші; текст через React, без сирого HTML);
`×` біля серверного сповіщення = «прочитано» через існуючий маршрут `notifications/read` (за `id`, ніколи не «всі»); `×` біля лічильника пошти =
приховати в цьому браузері, доки непрочитаних не стане БІЛЬШЕ. Посилання в бульбашках дозволені лише з `https` на `*.tarasevych.com` або відносний шлях.
Клавіатура: `Tab` на пункті відкриває бульбашки, `→` переходить всередину, `Esc` повертає назад. `prefers-reduced-motion` вимикає всі анімації.

Захист: бейджі/бульбашки працюють лише за наявності схваленої сесії (`zijbalkServerDienst() !== ''`); `aria-label` містить лише кількість;
гості (коди доступу, `/toegang`, кука `tsv_gast`) не мають меню та доступу до `/api/owner`, тому нічого не отримують
(e2e гостьового доступу залишається зеленим). Обмеження: лічильник пошти оновлюється лише тоді, коли Пошта була відкрита; у мобільній
висувній панелі немає панелі інструментів і тому немає ⚙ (Налаштування → Меню залишається доступним через саме меню).

Тести: `tests/eenheid/menu-meldingen.test.ts` (35: нормалізація, тихі години, ціль/посилання, бейджі, маршрути включно з відмовами та ізоляцією),
`tests/e2e/menu-v2-meldingen.e2e.ts` (30; скриншоти `menu-20`…`menu-24`). Очищення за точною адресою ел. пошти.

Перевірка після розгортання: Ctrl+F5 → панель інструментів: ⚙ видима → клік → «Сповіщення в меню». Відкрити Пошту → бейдж на Пошті з кількістю
непрочитаних; на іншому сервісі навести курсор → бульбашка «Непрочитані листи: N» → `×` → бейдж зникає.

### 14.3 Фаза B1 (9-10-2026) — швидкі переходи, кеш читання, попереднє завантаження, зашифровані чернетки

Що змінюється:

- **Смужка прогресу** (`src/navigatie-snel.ts`, `#tsv-voortgang`): тонка смужка вгорі сторінки в кольорі розділу,
  куди ви переходите (світлий/темний відтінок). Запускається через Navigation API (подія `navigate`) або при кліку в меню;
  стає видимою лише через 120 мс (без мерехтіння); усередині розділу завершується, щойно протягом ≥ 220 мс немає активних API-запитів;
  при переході на інший піддомен триває, доки сторінка не зміниться (макс. 12 с).
- **Переходи всередині розділу**: `document.startViewTransition` лише на робочій області
  (`view-transition-name: tsv-werkruimte`), вимкнено за умови «менше руху». Між піддоменами це неможливо (інший origin);
  там білий спалах усувають `html{background:var(--boot-bg)}` та попереднє завантаження (prefetch).
- **Кеш читання + скасування запитів** (`src/lees-cache.ts`, `src/platform/client.ts`): stale-while-revalidate, лише в
  оперативній пам'яті, окремо для кожного акаунта (при зміні акаунта кеш очищується), макс. 40 елементів / 10 хв, лише
  маршрути читання `/api/owner/...`. Коди доступу, passkeys та сесії миттєво показують попередній стан і оновлюються у
  фоновому режимі; при виході зі сторінки активний запит скасовується (`AbortController`).
- **Попереднє завантаження між піддоменами**: HTTP-заголовок `Speculation-Rules: "/speculatie.json"` на HTML-відповідях
  (жодного inline-скрипту, тому CSP залишається точно `script-src 'self' 'wasm-unsafe-eval'`). Правила працюють лише на
  невидимих посиланнях із `data-tsv-vooruit` у `#tsv-vooruit`; застосунок створює їх при наведенні курсора (90 мс) або фокусі на
  пункті меню. Лише `https`, лише власні хости, ніколи не посилання з `code/state/token/proof/transaction/redeem/handoff/
  auth_broker/oauth_*/consent/invite`. HTML також отримує `Supports-Loading-Mode: credentialed-prerender`
  (необхідно для prerender між піддоменами). API-відповіді цих заголовків не отримують.
- **Service worker v10**: під час встановлення вхідні JS/CSS-файли зі стартового HTML додаються в кеш
  (макс. 24). Старі кеші (v9 тощо) під час активації прибираються, як і раніше.
- **Зашифровані чернетки** (`src/concepten.ts`): лише поля з атрибутом `data-concept` (чат ШІ, відповідь у пошті,
  GitHub-issue, дошка MCP, нотатка до коду доступу); ніколи не поля паролів чи одноразових кодів. AES-GCM 256 із
  **неекспортованим** ключем в IndexedDB `tsv-concepten`, окремо для кожного акаунта (id рядка = перші 32 hex-символи від
  SHA-256(`tsv-concept|<id>`), отже жодної ел. пошти/id у сховищі), AAD = id рядка, IV 12 байтів, термін дії 7 днів,
  макс. 50 чернеток / 20 000 символів. Відновлення після перезавантаження з повідомленням «Чернетку відновлено» та кнопкою «Відкинути».
  Вимкнення функції видаляє всі чернетки ТА ключі. Нічого не передається на сервер.

Налаштування (Налаштування → Меню → «Швидкість переходів і чернетки», `#menu-snelheid`, зберігається в налаштуванні бічної
панелі `snelheid`):

| Перемикач | За замовчуванням |
|---|---|
| Смужка завантаження (прогрес) | увімк. |
| Плавна зміна сторінок (переходи) | увімк. |
| Підвантажувати розділ при наведенні (попереднє завантаження) | увімк. |
| Повністю готувати розділ заздалегідь (prerender) — експериментально | **вимк.** |
| Зберігати чернетки (зашифровано) (чернетки) — експериментально | **вимк.** |

Обмеження: немає View Transition між піддоменами; попереднє завантаження у старіших версіях Chrome може пропускатися, якщо цільова сторінка
має service worker; чернетки працюють лише для 5 позначених полів (не для редактора Gmail) і окремо для кожного піддомену
(IndexedDB ізольована за origin); Firefox/Safari без підтримки Speculation Rules просто завантажують сторінки без попереднього завантаження.

Перевірка після розгортання:

1. `curl -sI https://id.tarasevych.com/menu | grep -i -E 'speculation-rules|supports-loading-mode|content-security'` →
   `"/speculatie.json"`, `credentialed-prerender`, CSP без змін.
2. `curl -sI https://id.tarasevych.com/speculatie.json` → `application/speculationrules+json`.
3. `curl -s https://id.tarasevych.com/service-worker.js | grep "VERSION='v10'"`.
4. У браузері: клік Налаштування → Мови: сіра смужка прогресу; навести курсор на Пошта → у DevTools (Application → Speculative
   loads) з'являється `mail.tarasevych.com` як prefetch; після цього відкриття відбувається миттєво і вже з виконаним входом.
5. Чернетки залишаються вимкненими, доки їх не увімкнуть у налаштуваннях.

### 14.4 Етап 2 (9-10-2026) — компонування меню, док праворуч/вгорі/внизу, режим редагування

Що реалізовано:
- **Місця розміщення**: «Швидкий доступ» (панель швидкого доступу вгорі меню), головне меню, секції (підменю кожного розділу) та «Стартова
  сторінка» (ярлики на Мій простір → Огляд). Розділи (`svc:`) лише на верхньому рівні; сторінки (`pg:`) будь-де.
  Відображаються лише ті розділи, до яких користувач має доступ (включно з копіями). Логіка: `shared/menu-indeling.ts` (чиста, покрита тестами).
- **Режим редагування** (✎ у панелі інструментів, у висувній панелі на мобільних або Налаштування → Меню → «Редагувати меню»): перетягування мишею,
  на сенсорних екранах — довге натискання (450 мс); `Alt`/`Ctrl`/`⌘` під час перетягування = створення копії (фантом показує «+»), `Esc` = скасування.
  Клік/`Enter` на пункті = меню дій (Вище/Нижче, «Перемістити до…», «Дублювати до…», видалити копію, скинути);
  `Alt`+стрілки = переміщення, `Ctrl`/`⌘`+`Z` = скасування останньої дії. Кожна зміна супроводжується повідомленням із кнопкою «Скасувати» + статусом для екранного диктора.
- **Копії** зберігають колір свого початкового розділу (`itemAccent`) і показують походження як мітку.
- **Скидання**: для окремого пункту (скидає override + видаляє всі копії) у меню дій та в Налаштування → Меню («Змінені пункти»);
  «Скинути все» також повертає стандартне розташування/док. Обидві дії мають кнопку «Скасувати».
- **Розташування** (Налаштування → Меню → «Розташування й порядок меню»): Ліворуч / Праворуч (віддзеркалено) / Вгорі / Внизу.
  Вгорі/внизу = плаваючий док (іконки) з прозорістю 0–60 % (із розмиттям фону) та опційним збільшенням як у macOS
  (лише для миші; вимкнено при «менше руху» та під час редагування). Клік на активному розділі відкриває панель зі
  сторінками. На телефоні (≤ 700 px) меню завжди залишається висувною панеллю ліворуч.
- Зберігається в `owner_ui_preferences_v1.sidebar` (`items`, `kopieen`, `dock`), нормалізується на сервері та в браузері; пріоритет має сервер.

E2E лише локально (вимога Павла): `scripts/e2e-lokaal.mjs` відхиляє e2e-файли із запитами Playwright API з Node
(`ctx.request`/`page.request`/`request.newContext`) або без `chromeArgs()`, і блокує в тестовому процесі будь-які сокети/DNS
поза loopback. Chrome отримує `chromeArgs()` із `tests/e2e/server.ts`: `*.tarasevych.com` (усі порти) → `127.0.0.1:<poort>`,
усе інше — `~NOTFOUND`. Новий тест додатково перевіряє, що кожен запит сторінки йде на `*.tarasevych.com` (= локально).

Перевірка після розгортання:
1. Налаштування → Меню: блок «Розташування й порядок меню»; оберіть «Внизу» → док знизу; посуньте повзунок прозорості; увімкніть збільшення.
2. ✎ → перетягніть пункт; кнопка «Скасувати» в повідомленні працює; `Ctrl`+перетягування сторінки у «Швидкий доступ» = копія в кольорі
   розділу; «Скинути все» → повернення до стандарту.
3. На телефоні: висувна панель, ✎ у заголовку, довге натискання + перетягування; закриття панелі = вихід із режиму редагування.

Модель даних етапу 2: `shared/menu-model.ts` — стабільні ідентифікатори `svc:<dienst>` / `pg:<dienst>/<pagina>`, стандартне розміщення з
`MENU_PAGINAS` (ідентичне `canonical-service.js`, контролюється тестом), перевизначення (overrides) для кожного пункту (`zichtbaar`, `volgorde`, `plaats`,
`ouder`, `icoon`), копії (`k-…` → `zijbalk`/`snelbalk`/`start`), док (`links|rechts|boven|onder`, прозорість 0–60, збільшення),
`itemTerugzetten`, `allesTerugzetten`, `menuSamenstellen`.

## 15. Рішення власника з підписом passkey: відкат і зовнішні MCP-хости без SSH (22.10.2026)

**Чому.** «Відкат до попереднього» на `mcp.*/dashboard` працював лише за умови `"opdracht": {"terugdraaien": true}` у root-файлі
(за замовчуванням вимкнено, і не дарма: захоплений застосунок не повинен мати змоги відкотити сайт), а білий список зовнішніх MCP-хостів (`externeMcpHosts`)
можна було змінити лише через SSH. Власник хоче ухвалювати обидва рішення прямо на сайті — з таким самим рівнем надійності, як і схвалення оновлень (§13).

**Принцип.** `/etc/mijn-ruimte/mcp-rechten.json` залишається власністю root і НЕ стає доступним для запису застосунком. Рішення проходить той самий шлях, що й
схвалення оновлення:

```
browser (mcp.*)  ── WebAuthn-assertie over challenge = H(doel 'eigenaar-besluit', sha256(canonieke inhoud), nonce, verloopt ≤ 5 min)
   │   POST /api/owner/besluit/starten → app.eigenaar_besluiten (0105, ontwerp) + app.goedkeur_uitdagingen (eenmalig)
   │   POST /api/owner/besluit/ondertekenen → voorcontrole in de app → /srv/mijn-ruimte/besluit-inbox/besluit-<id>.json + `aanvraag`
   ▼
mijn-ruimte-besluit.path ─► mijn-ruimte-besluit.service ─► /usr/local/sbin/mijn-ruimte-besluit verwerk (root)
   │   1. mijn-ruimte-passkey verifieer-besluit <bestand>: hash ZELF herberekend (besluit-kern.mjs), schakelaar van dit soort open,
   │      assertie tegen /etc/mijn-ruimte/goedkeur-passkeys.json (rpId/origin admin|id|mcp, UV, ≤ 5 min, nonce nooit eerder gezien)
   │   2. terugdraaien: actieve release == `van`, `naar` bestaat en is bruikbaar, ≤ 1× per 10 min → mijn-ruimte-installeer terugdraaien <naar>
   │      externe-hosts: sleutel externeMcpHosts vervangen (tmp + rename, zelfde eigenaar/rechten, reservekopie, teruglezen + JSON-controle)
   ▼
/var/lib/mijn-ruimte-uitrol-status/besluit-<id>.json (root:mijnruimte 0640) ◄── POST /api/owner/besluit/status (de pagina leest live)
gebeurtenissen.jsonl (bron «besluit»), /var/lib/mijn-ruimte/besluit/journaal.jsonl (root), app.audit (eigenaar_besluit_*)
```

Без passkey власника нічого не відбувається: скомпрометований застосунок може щонайбільше покласти файл в inbox, який root
відхилить (`SLEUTEL_ONBEKEND`, `HANDTEKENING_ONGELDIG`, `UITDAGING_ONJUIST` при зміненому вмісті, `HERGEBRUIKT` при повторній спробі, `VERLOPEN`).
Root ніколи не читає з inbox нічого іншого, крім цього єдиного JSON-файлу (без симлінків, ≤ 64 КіБ), спочатку забирає його з inbox і довіряє
лише власній нормалізації вмісту.

### 15.1 Три режими відкату (`mcp-rechten.json`)

| `"opdracht": {"terugdraaien": …}` | `"terugdraaien-passkey"` | Наслідок |
|---|---|---|
| `true` | відсутній або `true` | працює стара пряма кнопка (step-up) **ТА** рішення з passkey |
| відсутній / `false` (за замовчуванням) | відсутній або `true` (за замовчуванням) | **лише через рішення з passkey** (майстер на `mcp.*/dashboard`) |
| (будь-що) | `false` | відкат із сайту **закрито**; лише через SSH (`mijn-ruimte-installeer terugdraaien`) |

Для білого списку: `"externe-hosts-passkey": false` закриває канал; інакше відкритий. Міграції БД не відкочуються при жодному
відкаті (див. §8); майстер явно про це попереджає.

### 15.2 Керування в інтерфейсі

- **`mcp.*/dashboard` → Керування сервером → «Відкат до попереднього»**: майстер із вибором «Зараз активний» → «Повернути на» (за замовчуванням попередній,
  можна обрати будь-який повний реліз із `/srv/mijn-ruimte/releases`), попередження про міграції та 10-хвилинний ліміт, «Підписати passkey й
  відкотити» → «Рішення передано, root перевіряє підпис…» → живий статус (служба перезапускається; сторінка перечікує перезапуск) →
  «Виконано» / «Відхилено root-ом» із кодом і причиною / «Не вдалося».
- **`mcp.*/agenten` → Зовнішні MCP → «Дозволені хости»**: список із файлу (чипси), хости з `EXTERNE_MCP_HOSTS` окремо
  (не змінюються), додавання/видалення, «Підписати passkey й зберегти список» → root записує → сторінка перезавантажує білий список.
- Обидва інтерфейси чесно показують, чому дія неможлива: `BESLUIT_UIT` (перемикач вимкнено), `GEEN_PASSKEY` (немає root-passkey; «Способи входу» → «Може
  схвалювати оновлення сервера»), браузер без підтримки passkey, немає іншого повного релізу.

### 15.3 Файли, юніти, оточення

- `deploy/goedkeuring/besluit-kern.mjs` (нормалізація + хеш, спільні для застосунку та root; встановлюється поруч із ядром WebAuthn у
  `/usr/local/lib/mijn-ruimte/goedkeuring/`), `goedkeur-hulp.mjs verifieer-besluit`, `webauthn-kern.mjs` ціль `eigenaar-besluit`;
- `deploy/besluit/mijn-ruimte-besluit.sh` → `/usr/local/sbin/mijn-ruimte-besluit` (`verwerk` | `status`), юніти `mijn-ruimte-besluit.path`
  (`PathChanged` `/srv/mijn-ruimte/besluit-inbox/aanvraag`) та `mijn-ruimte-besluit.service`; інсталятор (`besluit_inrichten`) розгортає все
  і створює `/srv/mijn-ruimte/besluit-inbox` (`mijnruimte` 0750) та `/var/lib/mijn-ruimte/besluit` (`root` 0700: журнал, мітка часу,
  резервні копії `mcp-rechten.<tijd>.<id>.bak`, логи інсталятора);
- `backend/eigenaar-besluit.ts` (маршрути `/api/owner/besluit/{overzicht,starten,ondertekenen,status}`, лише власник на `mcp`/`admin`),
  міграція `0105_eigenaar_besluiten.sql` (RLS: власні рядки; роль застосунку лише читання), `shared/eigenaar-besluit.ts` (тексти, «?»),
  `src/besluit/*` (майстер, хости), `src/McpServerBeheerKaart.tsx`, `src/agenten/TabExternMcp.tsx`;
- змінні оточення (лише тести/стенд): `BESLUIT_INBOX`, `BESLUIT_APP_ROOT`, `OPDRACHT_STATUS_DIR`, `MCP_RECHTEN_PAD`, `GOEDKEUR_SLEUTELS`;
  root-скрипт поза root: `BESLUIT_*` лише зі шляхами всередині `/tmp`.
- Відкат за рішенням інсталятор записує як `TERUG_OK` із походженням `besluit` (хто = `passkey`); в «Історія» він відображається як
  метод «Опрацювання завдання» зі статусом «Відкочено».

### 15.4 Перевірка та усунення проблем

```bash
systemctl status mijn-ruimte-besluit.path; journalctl -u mijn-ruimte-besluit -n 50 --no-pager
sudo mijn-ruimte-besluit status && sudo cat /var/lib/mijn-ruimte-uitrol-status/besluit-stand.json
sudo tail -n 5 /var/lib/mijn-ruimte/besluit/journaal.jsonl
```

Немає відповіді протягом 15 хв → сайт закриває рішення як «прострочено / `GEEN_UITKOMST`» і підказує ці команди. Тести:
`besluit-root-20261022.test.ts` (справжній root-помічник + root-скрипт із тестовими шляхами та стабом інсталятора; 47 атак і коректних сценаріїв),
`besluit-app-20261022.test.ts` (маршрути, RLS), `uitrol-geschiedenis-tijdlijn-20261022.test.ts`; стенд `besluit-*` (віртуальний passkey через CDP).

## 16. Робочий стіл v3 (Werkblad v3) — дані

Етап A (рівень даних) вільного робочого столу. Файли: `migrations/0114_werkblad_v3.sql`, `shared/werkblad-v3.ts`,
`backend/werkblad-v3.ts`, `src/werkblad/api-v3.ts`, тести `tests/eenheid/werkblad-v3-*.test.ts`.

**Що робить 0114.** Три нові таблиці під RLS (така сама форма, як у 0112): `app.werkblad_v3_lade` (на `user_id` + простір:
фон, походження, `v2_backup`), `app.werkblad_layout` (на `user_id` + простір + пристрій: режим, розмір полотна, версія) та
`app.werkblad_items` (один рядок на об'єкт: `x`, `y`, `w`, `h`, `z`, `kind`, `item_id`, `overrides`, `config` ≤ 6000 байтів). Щонайбільше 400 об'єктів
на шар. Додає прапорець `werkblad-v3` зі значенням `aan=false`. Не чіпає `app.werkblad_indeling` (v2). Ідемпотентна.

**Прапорець.** `werkblad-v3` за замовчуванням ВИМКНЕНО. Вимкнено = маршрути v3 нічого не роблять (завантаження → `{aan:false}`, збереження → 403
`WERKBLAD_V3_UIT`), робочий стіл працює точно як v2. Увімкнення для однієї особи: у «Прапорці» додати користувача
(або `UPDATE app.feature_flags SET aan=true, gebruikers=ARRAY['<user-id>'] WHERE sleutel='werkblad-v3'`).
Вимкнення НЕ видаляє дані v3; повторне увімкнення покаже саме те, що там було.

**Перенесення v2 → v3.** Ліниве й одноразове: при першому `v3/laden` з увімкненим прапорцем, окремо для кожної шухляди (простору), в одній транзакції
(`INSERT … ON CONFLICT DO NOTHING`). Рядок v2 залишається без змін; копія зберігається у `werkblad_v3_lade.v2_backup`.
Комп'ютер = `plaatsen(v2.items, 12)`, перераховане в px (полотно 1280), планшет = власний шар на 768 px (6 колонок),
телефон = власний потоковий (flow) шар на 390 px.

**Відкат (для окремої особи).** `POST /api/owner/hub/werkblad/v3/terugdraaien` (працює навіть із вимкненим прапорцем): повертає
резервну копію v2 в `app.werkblad_indeling` (версія +1). Із `{"v3Wissen":true}` також очищує шухляду v3 цього простору;
тоді при наступному завантаженні одноразове перенесення виконається заново.

**Відкат (повний).** 1) вимкнути прапорець (цього завжди достатньо); 2) лише якщо справді потрібно видалити таблиці:
`DROP TABLE app.werkblad_items, app.werkblad_layout, app.werkblad_v3_lade; DROP FUNCTION app.werkblad_items_limiet();
DELETE FROM app.feature_flags WHERE sleutel='werkblad-v3';` та видалити рядок `0114_werkblad_v3` з `app.schema_migrations`. v2 продовжить працювати.

**Перевірка після розгортання.** `SELECT sleutel, aan FROM app.feature_flags WHERE sleutel='werkblad-v3';` → `werkblad-v3 | f`.
`SELECT relrowsecurity FROM pg_class WHERE relname IN ('werkblad_v3_lade','werkblad_layout','werkblad_items');` → тричі `t`.
Модульні тести: `node scripts/eenheidstests.mjs werkblad-v3`.

**Відомі межі.** Власне фонове зображення залишається в таблиці v2 (`achtergrond_eigen`); v3 зберігає лише вибір.
Починаючи з етапу D (інтеграція), `backend/index.ts` передає реєстр (`REGISTER_V3_HAKEN` із `shared/werkblad-register.ts`):
сервер зберігає лише ті елементи, які існують у реєстрі, з правильним типом, у правильному просторі та для відповідного пристрою (див. §16-D).

## Робочий стіл v3 — бібліотека

**Що:** реєстр «Все на сайті / Alles op de site» (`shared/werkblad-register.ts`) та інтерфейс бібліотеки (`src/werkblad/bibliotheek/*`).
Ще НЕ підключено до `/overzicht`: полотно (Етап C) і рівень даних (Етап A) підключають його за прапорцем `werkblad-v3`.

**Джерела (нічого вручну):** сервіси/сторінки з `shared/menu-model.ts` (14 сервісів, 90 сторінок) + `shared/beheer-paginas.ts`;
віджети з `shared/werkblad-indeling.ts` (21, ті самі id з префіксом `wdg:`); 7 безпечних команд (`cmd:`), які лише відкривають місце,
де ви щось робите (без автоматичного надсилання/видалення); особисті ярлики `usr:` (власна назва/іконка на існуючий елемент);
теки `map:` (один рівень вкладеності). Нова сторінка меню автоматично потрапляє до реєстру; модульний тест падає, якщо бракує іконки чи назви.

**Безпека:** жоден елемент не містить прямого URL. `launchDoel()` повертає `{dienst, tab}`; браузер формує адресу через канонічний роутер.
`toegestaanVoor()` обчислюється заново під час показу, додавання ТА при кожному кліку (те саме правило, що й `dienstToegestaan`): `api`/`admin` і
сторінки керування доступні лише в технічному просторі, `mcp` — лише з правом `api-platform` або технічним профілем. Елементи `planned`/`denied` залишаються
видимими з поясненням причини, але їх не можна додати чи відкрити. Власні іконки беруться лише з `ICOON_PRESETS`. Сервер має повторно валідувати кожен елемент v3
проти `registerItem()` + `toegestaanVoor()` (завдання Етапу A).

**Контракт із полотном:** `CustomEvent('werkblad-bibliotheek:toevoegen', {detail:{itemId, kind, point?}})` на `window`, а при перетягуванні —
`dataTransfer` типу `application/x-werkblad-bibliotheek` (той самий JSON, без `point`). Читання завжди через `leesVerzoek()` (суворе).

**Тестування (лише локально):**
- `node scripts/eenheidstests.mjs werkblad-register` — 30 перевірок.
- `node scripts/e2e-werkblad-bibliotheek.mjs` — Playwright на власному сервері `127.0.0.1` з dev-стендом
  `src/werkblad/bibliotheek/stand.tsx`; будь-який запит до іншого хоста переривається й підраховується (вимога: 0). Скриншоти
  `bib-*.png` у `E2E_SCREENSHOTS` (за замовчуванням `/workspace/audit-werkblad`).

**Відкат:** бібліотека використовується лише за прапорцем `werkblad-v3`; прапорець вимкнено = старий робочий стіл v2, нічого мігрувати не потрібно.

## 16-D. Робочий стіл v3 — інтеграція (етап D)

**Що.** `src/werkblad/Werkblad.tsx` тепер є шлюзом: прапорець `werkblad-v3` вимкнено → виконується точно код v2 (`WerkbladV2`, без змін);
прапорець увімкнено → `src/werkblad/WerkbladV3.tsx` (окремий чанк, завантажується лише тоді). Шлюз запитує `v3/laden` (прапорець вимкнено → `{aan:false}`,
нічого не переноситься) і запам'ятовує результат для користувача в `localStorage` (`tsv:werkblad-v3-aan:<id>`) для уникнення мерехтіння.

**WerkbladV3.** Клас пристрою визначається зі справжньої ширини контейнера (`ResizeObserver`; < 600 телефон, < 1024 планшет). Кожен клас має власний
шар; якщо він відсутній (напр., після `v3Wissen`), один раз виконується `aanpassenVanaf(PC)` (телефон у потоковому режимі) і зберігається. Полотно з живими
віджетами v2 (той самий `Inhoud`, ліниве завантаження), `ShortcutTegel`, `MapTegel`. Панель інструментів «Налаштувати робочий стіл» → «Бібліотека», «Параметри»
(фон, скидання з підтвердженням, для власника: «Повернути розкладку v2»), «Готово». Додавання через контракт
`werkblad-bibliotheek:toevoegen` (кнопка/клавіатура) та HTML5-перетягування з панелі. Збереження: один ланцюжок, версія на кожен шар;
409 → панель конфлікту «Перезавантажити», нічого не перезаписується; помилка мережі → «Повторити».

**Серверна валідація.** `REGISTER_V3_HAKEN`: `map:<naam>` = тека (шаблон `map:nieuw`), `usr:<id>` лише з `config.basis` = існуючий
ярлик, решта id мають існувати в реєстрі; тип, простір (особистий/технічний) і пристрій мають збігатися; `w`/`h` у межах
лімітів реєстру (мінімум ніколи не ширший за полотно). Елементи `planned`/legacy зберігаються (показуються як «скоро»/старі);
особисті права (`mcp`/`api-platform`) перевіряються при кожному кліку та самим цільовим сервісом — наявність ярлика на робочому столі не надає прав доступу.

**Теки та власні ярлики.** Ярлик, перетягнутий на теку, отримує `parent` (зберігається в `werkblad_items.parent`);
«Вийняти» у відкритій теці повертає його назад. Видалення теки → її вміст повертається на робочий стіл. Власні ярлики (`usr:`) зберігаються,
щойно вони розміщені на робочому столі (`titleOverride`, `iconOverride`, `config.basis`); ще не розміщені зберігаються лише локально в браузері.

**Тестування (лише локально).** Модульні: `node scripts/eenheidstests.mjs werkblad` (включно з маршрутами з реєстром на справжньому роутері + БД).
Інтерактивні проти справжнього сервера + БД: запустіть сервер/проксі як у `scripts/lokaal-e2e/test-alles.sh` (власна БД, порт), потім
`PLAYWRIGHT_CORE=… PROXY_PORT=… DATABASE_URL=… node scripts/lokaal-e2e/werkblad-v3-integratie.mjs` (створює тестовий акаунт + сесію,
вмикає прапорець лише для цього акаунта, прибирає все за собою; будь-який запит поза `*.tarasevych.com`→`127.0.0.1` блокується і підраховується).

**Увімкнення для однієї особи.** `UPDATE app.feature_flags SET aan=true, gebruikers=ARRAY['<user-id>'] WHERE sleutel='werkblad-v3';`
(або через «Прапорці»). Вимкнення: `aan=false` / прибрати особу зі списку — v2 миттєво знову працює, дані v3 залишаються.

## 17. Технічні простори v2 (прапорець `tech-ruimtes-v2`, міграція 0115)

Що: два паралельні простори одного акаунта («Звичайний» / «Технічний»), три режими тривалості (`tijd`, `tot-technisch-einde`,
`tot-site-uitloggen`), пауза (перемикання без повторного входу), єдина функція ухвалення рішення (`shared/ruimte-toegang.ts`) для сайту, ШІ/MCP та
розширення. Контракт: `docs/ontwerp/TECH-RUIMTES-API.md`. Прапорець ВИМКНЕНО = точно стара поведінка.

### 17.1 Розгортання
1. Розгорніть архів як зазвичай; `npm run migrate` виконає `0115_tech_ruimtes_v2` (ідемпотентна, можна запускати повторно).
   Перевірка: `SELECT sleutel, aan FROM app.feature_flags WHERE sleutel LIKE 'tech-ruimtes-v2%';` → два рядки, обидва `false`.
2. Нічого не змінюється, доки не буде увімкнено прапорець.

### 17.2 Крок 0 — тіньовий режим (рекомендовано спочатку, на кілька днів)
- Увімкніть `tech-ruimtes-v2-schaduw` (вікно «Прапорці» → «Змінити» → головний перемикач увімк.) або змінну оточення `TECH_RUIMTES_V2_SCHADUW=1`.
- Поведінка залишається старою. Розбіжності між старими перевірками та суворим правилом записуються в журнал як
  `owner.tech.schaduw.verschil` (точка: `tab-zonder-sessie`, `mcp-account-breed`, `eigenaar-definitie`), щонайбільше один раз на 10 хв для кожного типу.
- Перевірка: `SELECT details, created_at FROM app.audit WHERE action = 'owner.tech.schaduw.verschil' ORDER BY id DESC LIMIT 50;`

### 17.3 Увімкнення — спочатку лише для власника
- `UPDATE app.feature_flags SET aan = true, gebruikers = ARRAY['<user-id власника>'] WHERE sleutel = 'tech-ruimtes-v2';`
  (або «Прапорці» → `tech-ruimtes-v2` → «Тест: так» = лише для вас до 03:00 / закінчення технічного профілю).
- Наслідки для тих, у кого увімкнено прапорець:
  - `/api/owner/tech/activeren` → 409 `GEBRUIK_RUIMTES_V2`; запуск відбувається через новий інтерфейс (`/api/owner/hub/tech/ruimtes/starten`).
  - Активні СТАРІ активації більше не враховуються: після увімкнення потрібно запустити технічний простір заново.
  - ШІ/MCP стає технічним лише після явного вибору в «Доступ і терміни» (`ai-zetten`) ТА за наявності активної, не поставленої на паузу сесії.
  - Вихід в одній вкладці залишає розблокування розширення чинними; вихід із сайту / «вийти всюди» відкликає їх.
- Root-перемикач `beheer-alleen-tech` та аварійний вимикач залишаються точно такими, як є; v2 під час примусової перевірки читає лише нову сесію.
  Власник не може втратити свій профіль і завжди має право запустити технічний простір.

### 17.4 Відкат
- `UPDATE app.feature_flags SET aan = false, gebruikers = '{}' WHERE sleutel = 'tech-ruimtes-v2';` → протягом 3 с повертається стара поведінка
  (кеш на користувача). Рядки в `app.tech_ruimte_*` залишаються, але не читаються; повторний вхід у технічний режим = стара активація.
- Повне видалення таблиць не потрібне. Якщо все ж необхідно: `DROP TABLE app.tech_ruimte_tabs, app.tech_ruimte_ai, app.tech_ruimte_sessies;`
  та `DELETE FROM app.feature_flags WHERE sleutel LIKE 'tech-ruimtes-v2%';` (спочатку вимкніть прапорець).

### 17.5 Відомі межі
- Пауза діє на сесію входу (усі вкладки цього браузерного входу разом), а не на окрему вкладку.
- Налаштування ШІ `verbindingId` зараз застосовується на рівні акаунта (MCP-шлюз не знає id з'єднання); прив'язка до окремого з'єднання — наступний етап.
- Адмін-сторінки вимагають технічного простору лише тоді, коли увімкнено існуюче примусове обмеження (root/сайт-перемикач, §OPA).

## 18. Координація ШІ-агентів на сервері (ORCH-001 етап 3, 31.10.2026)

**Чому.** Координацією (завдання, черга, здачі робіт, правила — `AGENTS.md`, `orchestratie/*`, `scripts/orch.mjs`) можна було керувати лише з
командного рядка, а змінювати правила — лише через git + SSH-підпис на ПК власника. Власник хоче бачити огляд
на сайті, приймати пакети від агентів без SSH і змінювати правила з такою самою надійністю, як і схвалення оновлень (§13, §15).

**Принцип.** Сайт, HTTP та MCP не мають власної окремої логіки: `backend/orch-opslag.ts` викликає ті самі функції, що й CLI
(`scripts/orch/inleveren.mjs` → `inleveren`, `scripts/orch/kern.mjs` → `beoordeelVoorstel`, `vergrendel`, `compacteContext`). Застосунок працює
з власною робочою копією репозиторію і ніколи не пише в `/etc`, `/var/lib/mijn-ruimte` чи в продуктивний реліз.

```
agent / eigenaar ── mcp.*/agents «Координація» · /api/owner/orch/* (alleen eigenaar) · MCP orch_* (zie beleid.json → site)
   │   overzicht/context/taak-start → leest ORCH_WORTEL; inleveren: stukken van 512 KiB → ORCH_INBOX → SHA-256 → `inleveren` (zelfde pijplijn)
   │   regels: voorstel (beoordeelVoorstel) → POST /api/owner/besluit/starten soort «orch-regels» → passkey (§15)
   ▼
mijn-ruimte-besluit (root): verifieert de assertie en schrijft ALLEEN
   │   /var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl (root, 0600; bron van waarheid)
   │   /var/lib/mijn-ruimte-uitrol-status/orch-regels-bevestigd.json (root:mijnruimte 0640; laatste 50, kopie voor de app)
   ▼
app (regels/toepassen): bevestiging aanwezig + voorstel past + werkkopie schoon → tak regels/<versie>-<tijd>: regelbestanden, regels.lock.json
   (eigenaar.soort = passkey, besluit, passkey), CONTEXT-COMPACT.md → `orch controleer` (fout = alles weg) → commit → git push -u origin
gitops-ophalen.sh (root): vertrouwt een passkey-lock alleen als dezelfde regel (besluit/regelsVersie/hash/kritiekHash/voorstel) in het root-journaal staat
```

### 18.1 Одноразове налаштування (власник, через SSH)
1. Робоча копія координації (інсталятор свідомо її не створює: він не має ключа і не повинен його мати):
   ```bash
   sudo -u mijnruimte git clone --branch integratie git@github.com:Tarasevych/hub.git /srv/mijn-ruimte/orch-repo
   sudo -u mijnruimte git -C /srv/mijn-ruimte/orch-repo config user.name "Mijn Ruimte orch" && sudo -u mijnruimte git -C /srv/mijn-ruimte/orch-repo config user.email "orch@tarasevych.com"
   ```
   Використовуйте **deploy key із правом запису** (GitHub → repo → Settings → Deploy keys) для користувача `mijnruimte`, ніколи не особистий
   ключ власника. Без права запису все продовжить працювати, але гілка `regels/*` залишиться на сервері (`gepusht: false`,
   `PUSH_MISLUKT`), доки ви самі її не запушите. Без робочої копії сайт чесно показує `ORCH_GEEN_REPO` і нічого не імітує.
2. Inbox для завантажень: `install -d -o mijnruimte -g mijnruimte -m 0750 /srv/mijn-ruimte/orch-inbox` (інсталятор `installeer-app.sh` також це
   робить у `orch_inrichten`).
3. Змінні оточення застосунку (лише якщо шляхи відрізняються від стандартних): `ORCH_WORTEL`, `ORCH_INBOX`; крім того, застосунок читає `OPDRACHT_STATUS_DIR`
   (за замовчуванням `/var/lib/mijn-ruimte-uitrol-status`) та `MCP_RECHTEN_PAD` (`/etc/mijn-ruimte/mcp-rechten.json`), обидва лише для читання.
4. Служба рішень (§15) розпізнає тип `orch-regels` після розгортання `deploy/besluit/mijn-ruimte-besluit.sh` та `besluit-kern.mjs`.
   Перемикач у `/etc/mijn-ruimte/mcp-rechten.json`: `"orch-regels-passkey": false` закриває лише підтвердження правил (за замовчуванням відкрито;
   сторінка тоді показує `BESLUIT_UIT`). `terugdraaien` та `externe-hosts` залишаються незалежними.
5. **Публічні ключі власника для правил — root-копія (обов'язково для GitOps із SSH-підписом).** Після незалежного
   рев'ю від 31.10.2026 `gitops-ophalen.sh` по-справжньому перевіряє підписаний через SSH `regels.lock.json` (коли власник без passkey):
   `ssh-keygen -Y find-principals` + `ssh-keygen -Y verify -n mijn-ruimte-regels` проти `/etc/mijn-ruimte/eigenaar-ondertekenaars` — ніколи не проти
   `orchestratie/eigenaar-ondertekenaars` із самого релізу, оскільки той файл може підмінити агент. Створіть цей файл власноруч, так само як у §3;
   інсталятор свідомо не копіює його з пакета:
   ```bash
   printf 'eigenaar@mijn-ruimte namespaces="mijn-ruimte-regels" %s\n' 'ssh-ed25519 AAAA…' > /etc/mijn-ruimte/eigenaar-ondertekenaars
   chown root:root /etc/mijn-ruimte/eigenaar-ondertekenaars && chmod 0644 /etc/mijn-ruimte/eigenaar-ondertekenaars
   ```
   Без цього файлу GitOps відмовляється від автоматичного встановлення з повідомленням «eigenaar-ondertekenaars op de server ontbreekt»; шлях через passkey
   (root-журнал, крок 4) його не потребує. Ті самі правила (`namespaces="mijn-ruimte-regels"`, без `cert-authority`) діють для
   `node scripts/orch.mjs controleer` та `bevestig` на ПК власника.
6. **Права запису служби застосунку.** `deploy/mijn-ruimte.service` працює з `ProtectSystem=strict`; після змагального (adversarial) рев'ю від
   31.10.2026 до нього додано `ReadWritePaths=-/srv/mijn-ruimte/orch-inbox` та `ReadWritePaths=-/srv/mijn-ruimte/orch-repo` (без них перше завантаження
   падає з `EROFS`). Інсталятор оновлює юніт автоматично; якщо у вас власна копія юніта — додайте обидва рядки та виконайте
   `systemctl daemon-reload && systemctl restart mijn-ruimte`. Перевірка: `systemctl show mijn-ruimte -p ReadWritePaths`.

### 18.2 Щоденне використання
- **Огляд**: версія правил + lock, база, гілка інтеграції, встановлена версія, агенти, завдання (із позначкою «правила застаріли»), черга, останні
  здачі робіт, результат `controleer`. MCP: `orch_overzicht`, `orch_context` (компактний контекст для агента без доступу до GitHub).
- **Здача роботи із сайту**: пакет `mijn-ruimte-<versie>-<agent>-overdracht.zip`, zip/tar.gz із `ORCH-OVERDRACHT.json` або git-патч
  (≤ 300 МіБ, 20 завантажень на годину на особу). Той самий конвеєр, що й `node scripts/orch.mjs inleveren --kanaal web_upload|mcp`: гілка від
  бази, правила, конфлікти з `integratie`, тести, запис в `orchestratie/inleveringen/`, черга. Нічого автоматично не зливається (merge) і не
  встановлюється. Відхилена здача не залишає гілки (але залишає запис).
  **Безпека здачі (рев'ю 31.10.2026).** Через сайт і MCP сервер ніколи не виконує код із пакета і ніколи не запускає передані
  shell-команди: як «тест» виконується лише `node scripts/orch.mjs controleer` із **власної робочої копії** (`--wortel` вказує на
  тимчасове робоче дерево здачі) у чистому оточенні без `DATABASE_URL`, ключів чи перців (peppers). Параметр `tests` із будь-чим
  іншим повертає `TESTS_NIET_TOEGESTAAN` (400). Архіви перевіряються перед розпакуванням — симлінки, спеціальні файли, `..`,
  абсолютні шляхи або тека `.git` повертають `INHOUD_ONVEILIG`; джерело `github_pr`, що починається з «`-`», повертає `REF_ONGELDIG`. Завантаження прив'язане до
  того, хто його розпочав (власник через сайт або агент через своє MCP-з'єднання — клієнт, агент ТА grant-id, тобто не друге з'єднання з
  тією самою назвою): інший учасник на `stuk`, `klaar` та `annuleren` отримає `UPLOAD_ONBEKEND`, ніби завантаження не існує.
  **Доповнення після змагального рев'ю (31.10.2026).**
  - Довірений `controleer` виконується **завжди**, навіть із `zonderTests` / `--zonder-tests`: ця позначка пропускає лише тести агента
    (запис показує «тести агента пропущено» поруч із результатом перевірки правил). Отже, пакет, який змінює `AGENTS.md` без нового lock-файлу,
    завжди відхиляється (`TESTS_MISLUKT`, перевірка правил).
  - **CLI на вашому ПК**: `node scripts/orch.mjs inleveren` за замовчуванням виконує ЛИШЕ цей довірений `controleer` — жодного коду з пакета.
    Shell-тести (`--tests "cmd"` або `--standaardtests` = `beleid.inlevering.standaardTests`) виконують код ІЗ ПАКЕТА з вашим `HOME`
    (хоча й без `DATABASE_URL`, ключів і перців); CLI при цьому попереджає («LET OP: виконую КОД ІЗ ПАКЕТА АГЕНТА»). Використовуйте їх лише для
    пакетів, яким ви довіряєте, бажано в одноразовій ВМ. Якщо здачу вже відхилено (конфлікт, застаріла база/правила), нічого не запускається.
  - **Архівні бомби**: на кожен архів щонайбільше 1 ГіБ у розпакованому вигляді (`INHOUD_TE_GROOT`). Вимірюються **фактичні** байти (потік через
    `unzip -p` / `gzip -dc`, нічого на диску) — підроблені розміри в заголовках zip не допоможуть — плюс розміри із заголовків tar (розріджені/sparse
    файли з їхнім повним розміром), а після розпакування ще раз перевіряється видимий обсяг усіх файлів.
  - **Агент від власного імені**: MCP-з'єднання агента X не може зареєструвати завдання для агента Y і не може здати пакет із `"agent": "Y"` в
    `ORCH-OVERDRACHT.json` (`AGENT_VERSCHILT`); запис зберігає поле `door` (хто фактично це зробив, разом із grant-id).
  - **Ліміт MCP**: `orch_inleveren_begin` та `orch_inleveren_klaar` — кожен щонайбільше 20 разів на годину на власника через усі його MCP-з'єднання
    (`RATE_LIMITED`); лічильник зберігається в пам'яті застосунку, окремо від HTTP-лічильника, і скидається після перезапуску. `klaar` блокує потік застосунку, доки
    триває конвеєр (git + `controleer`, зазвичай секунди, максимум 120 с) — це відомо і свідомо, ліміт обмежує частоту.
  - **`orch_overzicht` для агентів**: показує лише власні завантаження; адреса ел. пошти власника замінюється на «eigenaar», grant-id інших
    з'єднань прибираються, підтвердження не показують відбиток passkey, мітку чи id рішення.
- **Зміна правил**: «Regels wijzigen» (Змінити правила) → відредагуйте `AGENTS.md` / `orchestratie/beleid.json` / `orchestratie/BESLUITEN.md` → «Voorstel controleren» (Перевірити пропозицію)
  (коди: `GEEN_WIJZIGING`, `VERSIE_NIET_VERHOOGD`, `BESLUIT_ONTBREEKT`, `BELEID_JSON`, `REGELBESTANDEN_GEWIJZIGD`) → «Ondertekenen met passkey
  en tak maken» (Підписати passkey і створити гілку). При зміні правил `kritiek` сторінка показує попередження: ваш passkey підтверджує саме їх. Після цього: гілка
  `regels/<versie>-<tijd>` з'являється в GitHub (посилання на сторінку compare) — злиття в `integratie` ви виконуєте самі; агенти зі старою
  `regelsVersie` отримують `REGELS_VEROUDERD` і мусять виконати `taak-herlees`.

### 18.3 Перевірка та усунення збоїв
- Журнал root: `sudo tail -n 5 /var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl`; подія `BESLUIT_ORCH_REGELS_OK` у
  `gebeurtenissen.jsonl`; аудит застосунку `eigenaar_besluit_*` та `orch.*`.
- `ORCH_GEEN_REPO` — немає робочої копії в `ORCH_WORTEL` (крок 18.1.1). `ORCH_REPO_VUIL` — незакомічені зміни в робочій копії: приберіть їх
  через SSH (`git status`), застосунок ніколи не очищує репозиторій сам.
- `NIET_BEVESTIGD_DOOR_ROOT` — рішення підписано, але root (ще) не записав результат: перевірте `systemctl status
  mijn-ruimte-besluit.path` та журнал; сторінка сама повторює спробу, доки рішення не прострочилося.
- `BESLUIT_PAST_NIET` / `VOORSTEL_VEROUDERD` — правила тим часом змінилися (інший `hash`): створіть нову пропозицію; старе підтвердження
  ніколи не можна використати повторно (root-журнал прив'язаний до конкретного `voorstel`).
- GitOps відмовляє з «passkey-bevestiging staat niet in het root-journaal» — хтось відредагував `regels.lock.json` вручну або
  журнал відсутній на цьому сервері: лише справжнє підтвердження через сайт (або SSH-підпис) робить lock знову дійсним.
- GitOps відмовляє з «eigenaar-ondertekenaars op de server ontbreekt» — не виконано крок 18.1.5; з «SSH-handtekening van eigenaar voor
  mijn-ruimte-regels is ongeldig» — підпис належить до іншої `regelsVersie`/`kritiekHash` або зроблений ключем, якого немає (з
  `namespaces="mijn-ruimte-regels"`) у root-файлі: підпишіть заново (`node scripts/orch.mjs bevestig`).
- `NIET_BEVESTIGD_DOOR_ROOT`, хоча в журналі є запис — id рішення зі сторінки має точно збігатися з id у root-журналі
  (друге рішення для тієї самої пропозиції не зараховується); почніть підтвердження заново зі сторінки.
- Зміна правил через сайт відбувається в тимчасовому `git worktree`: `ORCH_WORTEL` залишається на гілці `integratie` і ніколи не перемикається;
  якщо після збою залишилася гілка `regels/*` без коміту, видаліть її через SSH (`git branch -D`, `git worktree prune`).
- `TESTS_NIET_TOEGESTAAN` — клієнт передав власні тестові команди (див. 18.2); `INHOUD_ONVEILIG` — архів відхилено до розпакування
  (створюється запис із причиною, без гілки); `UPLOAD_ONBEKEND` на існуючому id — інший актор, ніж той, хто почав завантаження, намагається його
  використати.
- `INHOUD_TE_GROOT` — архів розпаковується у понад 1 ГіБ (або sparse-файл більший): розділіть пакет або надішліть лише
  змінені файли. `AGENT_VERSCHILT` — MCP-з'єднання одного агента намагається виконати дію від імені іншого агента; агент мусить використовувати власне
  з'єднання. `CONTEXT_PAD` — `compactContext.bestand` у `beleid.json` має бути `orchestratie/<naam>.md` (orch записує цей файл).
- GitOps відмовляє з «kritieke regels in beleid.json wijken af van regels.lock.json (kritiekHash)» — хтось змінив `kritiek` у `beleid.json`
  під раніше підтвердженим lock-файлом; з «regels gewijzigd zonder lock bij te werken: …» — `AGENTS.md`/`BESLUITEN.md`/`beleid.json`
  відрізняються від `lock.hash`; з «regelsVersie van de lock … wijkt af» — версію не оновлено. З 31.10.2026 GitOps (як і
  root-інсталятор) порівнює lock зі справжніми файлами релізу; рішення: виконати `vergrendel`, а при зміненому `kritiek` — підтвердити заново.
- Відкат зміни правил = просто не зливати гілку `regels/*` (або створити нову пропозицію з вищою версією). Нічого на сервері
  не змінюється, доки гілка не потрапить в `integratie` і пакет не буде встановлено.
- Тести, які це покривають: `node scripts/eenheidstests.mjs orch-site` (74, справжні git-репозиторії + маршрути + MCP), `orch-besluit-root` (49, справжній
  root-скрипт під непривілейованим користувачем + перевірка GitOps, зі справжніми підписами `ssh-keygen` і справжнім релізом: lock ↔
  файли), `besluit-root` (47), `orch-beoordeling` (49, регресійні тести незалежного та змагального рев'ю від 31.10.2026:
  блокування RCE, чисте оточення, SEC-001-05, пошуковий каталог, SSHSIG, попередня перевірка архівів та архівні бомби, прив'язка завантажень до актора, агент від
  власного імені, ліміт MCP і маскування, `zonderTests`, id рішення, worktree та очищення при `regels/toepassen`), `orch-inleveren` (41, зокрема CLI без
  виконання коду з пакета).

### 18.4 Приймальні тести (етап 4) та що вони фіксують щодо роботи системи
`node scripts/eenheidstests.mjs orch-acceptatie` (47) відтворює вісім сценаріїв із технічного завдання на справжніх репозиторіях і справжніх root-скриптах:
паралельні агенти, git-конфлікти під час здачі ТА під час злиття (відновлення через rebase), застарілий реліз (`BASIS_VEROUDERD` у root ТА
`pakket-controleer`), імпорт без git, зміна політики (`REGELS_VEROUDERD` → `taak-herlees`), заморожений агент (`terugtrekken` + `taak-staat bevroren`,
черга рухається далі), одночасні встановлення, відкат. Два правила поведінки, які з цього випливають і на які можна розраховувати:
- **Одночасні встановлення**: `mijn-ruimte-uitrol.sh` утримує блокування `flock`; другий запуск під час активного встановлення записує в лог «er loopt al een uitrol» (розгортання вже виконується)
  і нічого не робить. Після успішного встановлення скрипт прибирає лише ті пакети, які **не новіші** за щойно встановлену версію;
  новіший пакет, який тим часом надійшов в inbox, залишається на місці й у наступному циклі проходить звичайну перевірку (версія, `UITROL-BASIS`,
  правила). До 31.10.2026 такий пакет тихо видалявся.
- **Відкат і координація**: після `terugdraaien` інсталятор/власник повертає `orchestratie/geinstalleerd.json` до попередньої
  бази; `orch status` тоді знову показує завдання відкоченого релізу як `released` (а не `installed`), і той самий пакет можна встановити повторно
  без перезбирання (`pakket-controleer` OK).


## 19. TRACE-001 — перевірка архіву розробки GitHub перед Passkey та встановленням

Починаючи з версії `20261103-211555`, кожен новий пакет розгортання відхиляється без `ONTWIKKELARCHIEF.json` (посилання на вже закомічене досьє розробки). Штатна команда `orch pakket` формує файл посилання з `HEAD:orchestratie/ontwikkelarchieven/<TAAK-ID>.json`. Пакет повинен спочатку бути опублікований як точний `.tar.gz` у відповідному GitHub Release; завантаження на сайт відбувається лише після цього.

Під час попередньої перевірки сайт виконує зовнішню перевірку в GitHub: наявність файлу на зафіксованому 40-символьному hex-коміті, хеш джерела, спорідненість (ancestry) гілки завдання та `asset.digest=sha256:<хеш отриманого tar.gz>`. Root-скрипт встановлення незалежно повторює ці перевірки. Якщо чогось бракує або GitHub недоступний, пакет **відхиляється** (навіть при перевищенні ліміту запитів GitHub API або помилковому токені), без винятків і без резервного переходу (fallback) на URL із самого пакета.

Для приватного доступу сайт використовує існуючий захищений GitHub-токен власника (якщо він доступний); на root-хості за потреби може лежати доступний лише для root GitHub-токен у `/etc/mijn-ruimte/github-token` (власник `0`, права `0600`). **Ніколи** не додавайте токен у метадані архіву, GitHub, логи CI чи чат. Адміністратор має налаштовувати токен виключно за своєю захищеною процедурою.

Що перевірити у разі відмови: правильність коміту завдання, наявність `orchestratie/ontwikkelarchieven/<TAAK-ID>.json` у цьому коміті, історію гілки, збіг тегу Release з `UITROL-VERSIE`, назву ассета та дайджест ассета. Відсутній або недоступний GitHub Release не є дозволом продовжувати. Власник, як і раніше, схвалює встановлення за допомогою Passkey; TRACE-001 не надає автоматичних прав на встановлення.

Канон: `AGENTS.md` §5, `orchestratie/beleid.json` v1.4.1, `orchestratie/BESLUITEN.md` B-007 та `deploy/REGELS-UITROLPAKKET.md` §7.
