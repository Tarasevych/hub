> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./HERSTEL.md)) · [🇳🇱 **Nederlandse versie**](./HERSTEL.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

# HERSTEL — Відновлення «Mijn Ruimte» після втрати віртуальної машини (VM)

> Втрачено весь ПК? Скористайтеся **офлайн-набором для відновлення** (`R:\mijn-ruimte-reservekopie\herstelset\`, копія на
> зовнішньому диску): покроковий план `00-BEGIN-HIER-UA.txt/.pdf` і `00-BEGIN-HIER-NL.txt`, зі скриптами
> `scripts\herstel-vm.sh` та `scripts\ontsleutel-naar-vm.ps1`. Цей файл — коротка версія.
>
> Зовнішній диск теж втрачено? Щодня ті самі **зашифровані** резервні копії та весь набір для відновлення
> (`herstelset-<дата>.zip.age`) зберігаються на Google Диску в папці `mijn-ruimte-reservekopie/` (див. `deploy/cloud/UITLEG-LEESMIJ.txt`
> і розділ 4 файлу `00-BEGIN-HIER-NL.txt`). Там лежать лише файли `.age` + SHA256; ключа відновлення там ніколи немає.

Вам потрібні чотири речі. Без **ключа відновлення** пункти 3 і 4 непридатні до використання.

| # | Що | Де |
|---|---|---|
| 1 | Ключ відновлення (приватний ключ age) | `R:\mijn-ruimte-reservekopie\sleutels\herstelsleutel-age.txt` + офлайн USB-диск/папір |
| 2 | Вихідний код | GitHub `Tarasevych/hub`, гілка `zelf-hosten`; офлайн: `R:\mijn-ruimte-reservekopie\broncode\zelf-hosten\<дата-коміт>\` (git-bundle + tar.gz + SHA256SUMS) |
| 3 | Зашифрована резервна копія (база даних + завантаження) | `R:\mijn-ruimte-reservekopie\vm-back-ups\<штамп>\` (`database.dump.age`, `uploads.tar.gz.age`) |
| 4 | Зашифровані секрети (`geheimen.env` + облікові дані тунелю) | `R:\mijn-ruimte-reservekopie\geheimen\geheimen-<штамп>\geheimen-<штамп>.tar.age` |

Публічний ключ (не секретний, лежить на VM у `/etc/mijn-ruimte/backup-ontvanger.age.pub`):
див. `herstelsleutel-age.pub.txt`. Сама VM **не може** розшифрувати власні резервні копії; це можливо лише за допомогою пункту 1.
Ніколи не кладіть приватний ключ на VM, у GitHub або на диск `T:\`. Нижче розшифрування виконується виключно на ПК,
а відкритий потік передається через SSH безпосередньо на нову VM.

## Найшвидший шлях: повний архів (один файл, одна команда)
На сайті `mcp.tarasevych.com` → «Архів на ПК» → «Зібрати повний архів» створює `mijn-ruimte-<штамп>-volledig.tar.age` (root-скрипт
`/usr/local/sbin/mijn-ruimte-archief`, запускається через `mijn-ruimte-archief.path`; перебіг у `kit-status.txt`; результат у root-папці
`/var/lib/mijn-ruimte-archief/uitgifte` під постійною назвою `archief-laatste.tar.age`; зберігаються два останні покоління, найстаріше
видаляється; кількість регулює `ARCHIEF_BEWAAR` у скрипті). Завантажити його може лише власник, після додаткового підтвердження (step-up), через
одноразовий ідентифікатор завантаження. **Увесь архів** зашифровано за допомогою age для наявного публічного ключа (починаючи з 2026-10; раніше шифрувалися лише база даних,
файли та секрети). Вміст: код, MCP-двері, git-бандли, база даних + ролі, файли, системні юніти/конфігурація тунелю (без sudoers), секрети,
`LEES-MIJ.txt`, `SHA256SUMS` і `vidnovyty.sh`. На новій машині з Ubuntu/Debian (віртуальній або фізичній, x86-64 чи ARM64):
```bash
age -d -i /pad/naar/herstelsleutel-age.txt mijn-ruimte-<stempel>-volledig.tar.age | tar -x && cd mijn-ruimte-<stempel>-volledig
# (Windows: & "$env:ProgramFiles\age\age.exe" -d -i T:\herstelsleutel-age.txt -o archief.tar mijn-ruimte-…-volledig.tar.age; daarna tar -xf archief.tar)
sudo bash vidnovyty.sh --sleutel /pad/naar/herstelsleutel-age.txt --proefrun   # спершу лише показати план
sudo bash vidnovyty.sh --sleutel /pad/naar/herstelsleutel-age.txt              # виконати насправді
```
Скрипт перевіряє контрольні суми, встановлює Node/PostgreSQL 17/age/cloudflared, розшифровує дані, відновлює базу даних і файли, збирає сайт під поточну
архітектуру (`installeer-app.sh`) та чекає на перевірку працездатності. Повний прохід на порожній машині ще не виконувався; пробний запуск (`--proefrun`) і створення архіву
протестовані на робочій VM. Правило двох поколінь, жорстке посилання (hard link) та відновлення git-репозиторіїв ще не перевірялися на VM.
Ручні кроки нижче залишаються перевіреним шляхом.

Git-репозиторії (`kod/repos/*.bundle`, з `INDEX.tsv`) відновлюються за власними шляхами в `/srv/mijn-ruimte`, лише якщо відповідний шлях ще
не існує. Старі незашифровані архіви (`mijn-ruimte-*-volledig.tar`, `*.tar.gz`) у `/srv/data/uploads/mcp-archives` інсталятор
**не** видаляє, а лише повідомляє про них. Перевірте й видаліть їх самостійно.

## 0. Перевірка (PowerShell на ПК)
```powershell
cd R:\mijn-ruimte-reservekopie\vm-back-ups\<stempel>
Get-Content SHA256SUMS | % { $h,$n = $_ -split '\s+',2; if ((Get-FileHash $n).Hash.ToLower() -ne $h) { "FOUT $n" } else { "OK $n" } }
```

## 1. Нова VM
Ubuntu з LUKS, користувач `beheer` із SSH-ключем `T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver(.pub)`.
Пакети: Node 24, npm, git, rsync, curl, PostgreSQL 17 (+ клієнт), `age`, `cloudflared` (див. `deploy/LEESMIJ.md`).

## 2. Вихідний код і початкове налаштування (на VM)
```bash
git clone -b zelf-hosten https://github.com/Tarasevych/hub.git ~/hub     # або: git clone <bundle> ~/hub
sudo bash ~/hub/deploy/installeer-app.sh inrichten ~/hub
```
Створіть роль і базу даних `mijnruimte` (команда виводиться під час виконання `inrichten`).

## 3. Відновлення секретів (з ПК)
Використовується `cmd /c`, оскільки PowerShell 5.1 псує бінарні потоки (pipes); не використовуйте `>` або `&` всередині `cmd /c "…"`.
```powershell
$age = 'T:\mijn-ruimte\hulpmiddelen\age\age\age.exe'
$sl  = 'R:\mijn-ruimte-reservekopie\sleutels\herstelsleutel-age.txt'
$k   = 'T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver'
$vm  = 'beheer@203.0.113.10'
$g   = 'R:\mijn-ruimte-reservekopie\geheimen\geheimen-<stempel>\geheimen-<stempel>.tar.age'
cmd /c "$age -d -i $sl $g | ssh -i $k $vm sudo -n tar -xpf - -C /"
```
Це повертає `/etc/mijn-ruimte/geheimen.env` і `/etc/cloudflared/<ID>.json` (root, 0600); архіви, створені після
виправлення аудиту 4 (`env-splitsen`), містять також `/etc/mijn-ruimte/migratie.env` (саме там тоді лежить `DATABASE_URL`). Перевірте
`DATABASE_URL` (пароль нової ролі Postgres має збігатися) і поверніть публічний ключ:
`scp herstelsleutel-age.pub.txt` → `sudo install -m 0644 … /etc/mijn-ruimte/backup-ontvanger.age.pub`.

## 4. Встановлення застосунку (на VM)
```bash
sudo ZONDER_BACKUP=1 bash ~/hub/deploy/installeer-app.sh installeren ~/hub
sudo systemctl stop mijn-ruimte 'mijn-ruimte-*.timer'
```

## 5. Відновлення бази даних і завантажень (з ПК)
```powershell
$b = 'R:\mijn-ruimte-reservekopie\vm-back-ups\<stempel>'
cmd /c "$age -d -i $sl $b\database.dump.age | ssh -i $k $vm sudo -n install -o postgres -m 0600 /dev/stdin /var/tmp/database.dump"
cmd /c "$age -d -i $sl $b\uploads.tar.gz.age | ssh -i $k $vm sudo -n tar -xzpf - -C /srv/data"
```
Після цього на VM:
```bash
sudo -u postgres dropdb mijnruimte && sudo -u postgres createdb -O mijnruimte mijnruimte
sudo -u postgres pg_restore --no-owner --role=mijnruimte -d mijnruimte /var/tmp/database.dump
sudo shred -u /var/tmp/database.dump
sudo chown -R mijnruimte:mijnruimte /srv/data/uploads
sudo systemctl start mijn-ruimte 'mijn-ruimte-*.timer'
curl -s http://127.0.0.1:8080/__gezondheid
```

### 5b. Системний архів (код, юніти, конфігурація тунелю, MCP-міст)
Кожна папка резервної копії містить також `systeem.tar.gz.age` і `systeem-info.txt` (відкритий текст: версії node/postgres/cloudflared/age, служби, порти
та шляхи, які не вдалося прочитати). Архів містить активний реліз, systemd-юніти й таймери, `/etc/cloudflared/config.yml` (без
облікових даних), MCP-міст з оверлеєм та `/etc/mijn-ruimte` без секретів. Це потрібно, якщо втрачено реліз чи юніт, або щоб
точно відновити міст (порт 8091) і конфігурацію тунелю після повної втрати:
```powershell
cmd /c "$age -d -i $sl $b\systeem.tar.gz.age | ssh -i $k $vm sudo -n sh -c 'mkdir -p /var/tmp/systeem-herstel && tar -xzpf - -C /var/tmp/systeem-herstel'"
```
Далі свідомо скопіюйте потрібні компоненти окремо (юніти в `/etc/systemd/system`, `systemctl daemon-reload`); ніколи не перезаписуйте наосліп працюючий сервер.

## 6. Тунель
Із відновленими обліковими даними: встановіть `deploy/cloudflared.service` і виконайте `systemctl enable --now cloudflared`
(див. `deploy/LEESMIJ.md`, розділ «Tunnel»). Новий тунель або записи DNS не потрібні, доки ідентифікатор тунелю (tunnel-ID) залишається тим самим.

## Після відновлення
- Одразу створіть нову резервну копію (`sudo systemctl start mijn-ruimte-backup.service`) і заберіть її
  скриптом `T:\mijn-ruimte\scripts\reservekopie-ophalen.ps1`.
- Якщо ключ відновлення будь-коли буде скомпрометовано: створіть нову пару ключів, замініть публічний ключ на VM,
  створіть новий архів секретів і виконайте ротацію самих секретів (ключів у `geheimen.env`).
