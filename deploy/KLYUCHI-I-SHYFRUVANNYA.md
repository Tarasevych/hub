# Ключі й шифрування: що чим зашифровано (одна сторінка)

## Головне правило
**Є лише ОДИН ключ шифрування для всіх архівів: age-ключ відновлення («herstelsleutel»).** Нових ключів шифрування не створювалось.

| | Де | Для чого |
|---|---|---|
| **Публічний ключ** (не секрет) `age1st2ew4cecq2slgrx6vg22wzhwmfxqt706cdmlv5tuqwa49nk4cks0hjrmk` | сервер `/etc/mijn-ruimte/backup-ontvanger.age.pub`, `R:\mijn-ruimte-reservekopie\sleutels\herstelsleutel-age.pub.txt`, `T:\mijn-ruimte\hulpmiddelen\age\backup-ontvanger.age.pub` (усі три однакові, перевірено) | ним **шифрується** |
| **Приватний ключ** (СЕКРЕТ) `herstelsleutel-age.txt` | **немає** ні на сервері, ні на R:, ні на T:. Лише у Вас, офлайн (флешка/папір) | ним **розшифровується** |

Без приватного ключа жоден `.age`-файл не відкрити: ні Вам, ні мені, ні серверу. Не кладіть його на ту саму зовнішню флешку, що й копію.

## Які файли чим зашифровані
Усі файли `*.age` у цій теці (і нічні копії на сервері та в `R:\mijn-ruimte-reservekopie\vm-back-ups\`) зашифровані **цим одним публічним ключем**:

| Файл | Що всередині |
|---|---|
| `03-server\vm-back-up-<мітка>\database.dump.age` | база даних (pg_dump) |
| `03-server\vm-back-up-<мітка>\uploads.tar.gz.age` | файли користувачів |
| `03-server\server-bestanden.tar.age` | код поточного релізу, overlay моста, конфігурація Cloudflare і `/etc/mijn-ruimte` (секрети), юніти systemd, скрипти, sudoers |
| `04-geheimen-versleuteld\geheimen-pc.tar.age` | ключ підпису розширення, SSH-ключ входу на сервер |
| `04-geheimen-versleuteld\gesprekken-en-geheugen.tar.age` | журнали розмов і пам'ять асистента |

Усе інше в теці **не шифрується** (код, плани, статус, контрольні суми), в ньому немає секретів.

## Інші ключі (це НЕ ключі шифрування)
- **SSH-ключ входу на сервер** `T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver`: лежить усередині `geheimen-pc.tar.age`.
- **Ключ підпису розширення (CRX)** `T:\mijn-ruimte\geheim\extension-signing-key.pem`: єдиний ключ, створений у цій роботі; підписує розширення (id `ofpffonakgjioahgfejmiblfmbkobmmi`), лежить усередині `geheimen-pc.tar.age`. Без нього не випустити оновлення CRX.
- Секрети сервера (`geheimen.env`, облікові дані тунелю) лежать усередині `server-bestanden.tar.age`.

## Як розшифрувати
```powershell
cmd /c "T:\mijn-ruimte\hulpmiddelen\age\age\age.exe -d -i <шлях до herstelsleutel-age.txt> <файл.age> | tar -xf - -C <куди>"
```
Увага: на цьому ПК політика Windows (Device Guard) **зараз блокує запуск `age.exe`** з `T:`. Це треба вирішити заздалегідь (дозволити програму, або розшифровувати на іншому комп'ютері/Linux із програмою `age`). Скажіть, і я підготую варіант розшифрування без `age.exe`.
