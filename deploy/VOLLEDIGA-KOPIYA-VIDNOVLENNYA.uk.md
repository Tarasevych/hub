> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./VOLLEDIGA-KOPIYA-VIDNOVLENNYA.md)) · [🇳🇱 **Nederlandse versie**](./VOLLEDIGA-KOPIYA-VIDNOVLENNYA.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

# Повна копія «Mijn Ruimte»: що всередині і як відновити

Цей набір створює `T:\mijn-ruimte\scripts\volledige-kopie.ps1` (можна запускати повторно: щоразу нова тека з міткою часу).
Мета: усе, що потрібно, щоб відновити сайт і всю нашу розробку з нуля, **без втрати жодного байта**. Стан робіт: `05-status\STATUS-ROBOTA-*.md`.

## Що в теці

| Тека | Вміст | Шифрування |
|---|---|---|
| `01-broncode\` | `hub-alle-branches.bundle` (уся історія git, усі гілки), `hub-werkmap.tar.gz` (уся робоча тека проєкту разом із `.git`, невідстежуваними файлами; без `node_modules`, `dist`, `dist-server`, `rapporten`: це відтворюється), перелік гілок і стан git | ні (код) |
| `02-ontwikkeling\` | `ontwikkeling-overig.tar.gz` (staging-скрипти, тести, журнали), `uitrol.tar` (усі зібрані релізні пакети з контрольними сумами), `scripts.tar.gz`, `broncode-archieven.tar` | ні |
| `03-server\` | `vm-back-up-<мітка>\` (свіжа **зашифрована** копія бази й завантажень, з `SHA256SUMS`) і `server-bestanden.tar.age` (код поточного релізу без `node_modules`, overlay моста, конфіги Cloudflare, `/etc/mijn-ruimte`, юніти systemd, скрипти `/usr/local/sbin`, sudoers) | **так** (age) |
| `04-geheimen-versleuteld\` | `geheimen-pc.tar.age` (ключ підпису розширення, SSH-ключ входу на сервер), `gesprekken-en-geheugen.tar.age` (журнали розмов і пам'ять асистента) | **так** (age) |
| `05-status\` | що запроваджено, а що ні, журнали змін, плани, пам'ять асистента (текст, без секретів) | ні |
| `SHA256SUMS`, `controleer.ps1`, `inhoud-*.txt` | контрольні суми всіх файлів, скрипт перевірки, переліки назв файлів у зашифрованих архівах (без вмісту) | ні |

## ВАЖЛИВО про ключ
Зашифровані файли відкриває лише **приватний ключ age**: `R:\mijn-ruimte-reservekopie\sleutels\herstelsleutel-age.txt`.
Якщо покласти його на ту саму зовнішню флешку, шифрування нічого не дає. Тримайте ключ **окремо** (інша флешка, папір, менеджер паролів). Без ключа `.age`-файли не відкрити нікому, ні Вам, ні мені.

## 1. Перевірити цілісність (PowerShell, у теці копії)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\controleer.ps1
```
Усі рядки мають бути `OK`.

## 2. Відновити код
```powershell
git clone .\01-broncode\hub-alle-branches.bundle hub
cd hub; git branch -a            # усі гілки, зокрема feature/connectors-agent-v2 і zelf-hosten
git checkout feature/connectors-agent-v2
```
Або розпакувати `hub-werkmap.tar.gz` (там вже готова робоча тека з усіма незакоміченими файлами й історією), потім `npm ci`.
Збірка й тести: `T:\mijn-ruimte\hulpmiddelen\node\env.ps1`, `npm run build`, перевірки `testdb.ps1` (див. `deploy/LEESMIJ.md`).

## 3. Відновити сервер
Основний сценарій такий самий, як у `deploy/HERSTEL.md` (він теж у теці `02-ontwikkeling\scripts.tar.gz` разом зі скриптами):
1. Нова VM (Ubuntu), пакети, `git clone` коду, `installeer-app.sh inrichten`.
2. Зашифровані файли сервера (конфіги, секрети, код релізу, overlay, юніти) повертаються з ПК потоком, без проміжної розшифровки на диск:
```powershell
$age='T:\mijn-ruimte\hulpmiddelen\age\age\age.exe'; $sl='<шлях до herstelsleutel-age.txt>'; $k='T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver'
cmd /c "$age -d -i $sl 03-server\server-bestanden.tar.age | ssh -i $k beheer@<VM-IP> sudo -n tar -xpf - -C /"
ssh -i $k beheer@<VM-IP> sudo -n systemctl daemon-reload
```
3. База й завантаження з `03-server\vm-back-up-<мітка>\` за кроком 5 з `HERSTEL.md` (`database.dump.age`, `uploads.tar.gz.age`).
4. `sudo systemctl start mijn-ruimte 'mijn-ruimte-*.timer'`, перевірка `curl http://127.0.0.1:8080/__gezondheid` → `ok:true`.
5. Тунель Cloudflare: файл облікових даних уже в `server-bestanden.tar.age` (`/etc/cloudflared`). `sudo systemctl enable --now cloudflared`.

## 4. Відновити ключі й секрети на ПК
```powershell
cmd /c "$age -d -i $sl 04-geheimen-versleuteld\geheimen-pc.tar.age | tar -xf - -C T:\mijn-ruimte"
```
Повертає `T:\mijn-ruimte\geheim\extension-signing-key.pem` (ключ підпису розширення, id `ofpffonakgjioahgfejmiblfmbkobmmi`) і `T:\mijn-ruimte\hulpmiddelen\ssh\...` (SSH-ключ входу на сервер).
Журнали розмов і пам'ять асистента (необов'язково): `gesprekken-en-geheugen.tar.age` розпаковується у `C:\Users\<ви>\.claude\projects\` (`tar -xf - -C ...`).

## 5. Що не входить (і чому)
- Диск самої віртуальної машини (`*.vhdx`): робоча зашифрована (LUKS) VM, її не можна консистентно скопіювати «на ходу». Замість неї: база, завантаження, конфіги, секрети й код: цього досить, щоб підняти сайт на новій VM.
- `node_modules`, `dist`, `dist-server`: відтворюються з `package-lock.json` і `npm run build`.
- Портативні інструменти (`hulpmiddelen\node`, `postgres`, `rclone`): завантажуються заново (контрольні суми в `hulpmiddelen\*\VERIFICATIE.txt`).
- Публічний код також лежить у GitHub (`Tarasevych/hub`), але Chrome Web Store, акаунти й паролі в GitHub не зберігаються.
