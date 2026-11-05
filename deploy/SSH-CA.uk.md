> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./SSH-CA.md)) · [🇳🇱 **Nederlandse versie**](./SSH-CA.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

# SSH-сертифікат на одну годину (етап C, частина 2)

Вхід по SSH на сервер «Мій простір» без постійного ключа. Сайт лише **просить**, а **root підписує** сертифікат:
- лише для користувача `beheer`;
- лише термінал (`permit-pty`): без пересилання портів, агента чи X11;
- на 60 хвилин (плюс 5 хвилин на розбіжність годинників).

Приватний ключ ніколи не залишає ваш комп'ютер: на сайт вставляється лише публічний рядок `ssh-ed25519 …`.

## Хто може отримати сертифікат
Потрібні **всі чотири** умови:
1. Активний технічний профіль у цій вкладці з правом **`ssh.host`**. Його має лише роль **Власник**: SSH як `beheer` означає доступ
   до самого сервера, а це більше, ніж термінал у контейнері без мережі. Тому роль «Адміністратор» (`terminal.servers`) сертифікат не отримує.
2. Свіже підтвердження входу (passkey або Google).
3. Root увімкнув перемикач `"ssh-ca": true` у `/etc/mijn-ruimte/mcp-rechten.json`. За замовчуванням `false`, і інсталятор його не змінює.
4. Прапорець функції `ssh-certificaat` увімкнено. Він **лише показує кнопку** і прав не дає.

Обмеження: не більше 12 сертифікатів на годину на весь сервер. Кожна видача й відмова записуються в журнал сайту
(лише відбиток, без самого сертифіката) і в журнал root (`gebeurtenissen.jsonl`).

## Увімкнути (один раз, на сервері; потрібна консоль або чинний SSH-ключ)
Спершу встановіть випуск з цією функцією (`mijn-ruimte-installeer installeren …`). Інсталятор кладе скрипт `/usr/local/sbin/mijn-ruimte-ssh-ca`,
створює теки і додає правило polkit. Ключа він **не** створює, sshd **не** змінює, перемикач **не** вмикає.

```bash
# 1. Створити ключ CA (лише root; повторний запуск наявний ключ не перезапише)
sudo /usr/local/sbin/mijn-ruimte-ssh-ca inrichten

# 2. Показати рядки для sshd
sudo /usr/local/sbin/mijn-ruimte-ssh-ca publiek

# 3. Дозволити принципал beheer
sudo install -d -m 0755 /etc/ssh/auth_principals
echo beheer | sudo tee /etc/ssh/auth_principals/beheer >/dev/null

# 4. Довірити CA у sshd (окремим файлом; ваш наявний вхід за ключем лишається)
printf '%s\n' 'TrustedUserCAKeys /etc/mijn-ruimte/ssh-ca/ca.pub' 'AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u' \
  | sudo tee /etc/ssh/sshd_config.d/60-mijn-ruimte-ssh-ca.conf >/dev/null
sudo sshd -t && sudo systemctl reload ssh

# 5. Увімкнути перемикач (лише root може писати цей файл)
sudo nano /etc/mijn-ruimte/mcp-rechten.json        # "ssh-ca": true

# 6. (Необов'язково) path-unit як запасний шлях; сайт і так запускає службу підпису через polkit
sudo systemctl enable --now mijn-ruimte-ssh-ca.path
```
Потім на сайті: технічний профіль Власника → «Прапорці» → `ssh-certificaat` → увімкнути.

**Не закривайте поточний сеанс SSH, доки не перевірите новий вхід.** `AuthorizedPrincipalsFile` стосується лише входу за
сертифікатом: звичайні ключі в `authorized_keys` працюють як раніше.

## Використання (на вашому комп'ютері)
```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519      # якщо ключа ще немає
cat ~/.ssh/id_ed25519.pub                         # цей рядок вставити на сайті: смуга технічного профілю → «Сертифікат SSH»
# сертифікат із сайту зберегти поруч із ключем:
#   ~/.ssh/id_ed25519-cert.pub
ssh beheer@<VM-IP>                              # SSH підхопить сертифікат сам; через годину він перестане діяти
ssh-keygen -L -f ~/.ssh/id_ed25519-cert.pub       # перевірити: Principals beheer, Extensions permit-pty, Valid …
```

## Вимкнути
```bash
sudo nano /etc/mijn-ruimte/mcp-rechten.json        # "ssh-ca": false  — нових сертифікатів не буде
# повністю: прибрати довіру в sshd
sudo rm /etc/ssh/sshd_config.d/60-mijn-ruimte-ssh-ca.conf && sudo sshd -t && sudo systemctl reload ssh
sudo systemctl disable --now mijn-ruimte-ssh-ca.path
```
Уже видані сертифікати закінчуються самі не пізніше ніж за 65 хвилин. Щоб негайно відкликати всіх, приберіть довіру в sshd.

## Чому так
- Без постійних ключів: доступ одноразовий, з часом і прив'язаний до людини (Key ID = ім'я з пошти, видно в журналі sshd).
- Root-скрипт сам обирає принципал, термін і опції; запит сайту на це не впливає.
- Скрипт ніколи не редагує sshd і не вмикає перемикач: довіру налаштовує лише власник вручну.
- Доступ лише з профілю Власника: вхід на хост сильніший за термінал у контейнері (етап C, частина 1).
