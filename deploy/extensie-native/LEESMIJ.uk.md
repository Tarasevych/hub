> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./LEESMIJ.md)) · [🇳🇱 **Nederlandse versie**](./LEESMIJ.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../../docs/INDEX.md)

# Локальний агент для розширення «Мій простір» (0.5.0)

Необов’язковий **другий канал** між розширенням браузера і ШІ-агентом на **вашому власному комп’ютері** (Claude Desktop або
Claude Code через MCP stdio). Основний канал не змінюється: захищений WebSocket через сервер `mcp.tarasevych.com`.

```
Claude Desktop / Claude Code ⇄ mr-native-mcp.mjs ⇄ локальний сокет (лише ви) ⇄ mr-native-host.mjs ⇄ Chrome Native Messaging ⇄ розширення
```

## Що він робить

- Дає локальному ШІ **лише читання** сторінок «Мого простору», відкритих у вашому браузері. Шість інструментів:

  | Інструмент MCP     | Команда розширення     | Що повертає |
  |--------------------|------------------------|-------------|
  | `lokaal_status`    | `browser.self_test`    | стан розширення (заблоковано/розблоковано, до коли, права) і самоперевірка |
  | `lokaal_snapshot`  | `browser.snapshot`     | адреса (без запит), заголовок, видимий текст, назви елементів |
  | `lokaal_diagnose`  | `browser.diagnostics`  | помилки JavaScript, консолі, невдалі запити, базові метрики |
  | `lokaal_console`   | `browser.console`      | останні повідомлення консолі (`types`: помилка, warn, log, info, debug) |
  | `lokaal_netwerk`   | `browser.network`      | останні запити: метод, адреса без запит, статус, тривалість (`failed_only`) |
  | `lokaal_audit`     | `browser.audit`        | продуктивність, знахідки безпеки, структура DOM (`soort`: alles, prestaties, beveiliging, dom) |

- Працює **тільки** після розблокування на сайті вашим passkey з позначкою **«локальний агент»** і лише до кінця вибраного часу
  (або до блокування, кінця технічної активації, виходу, перезапуску браузера). Після блокування розширення закриває канал,
  Chrome зупиняє хост, токен видаляється.
- Вміст сторінок у відповідях позначено як **недовірені дані** (`<untrusted-data …>`): це дані, ніколи не інструкції.

## Чого він ніколи не робить

- Ніколи не клікає, не друкує, не переходить за адресами, не робить знімків екрана і не вмикає налагоджувач — лише 6 команд
  читання (білий список і в хості, і в розширенні; розширення ще раз перевіряє розблокування, права `browser.read`, домени й обліковий запис).
- Ніколи не передає ключі, токени, cookies, значення полів, паролі чи query-рядки. До хоста йдуть лише `{staat, exp, caps}`.
- Не відкриває мережевих портів: лише named pipe `\\.\pipe\mijn-ruimte-extensie-<користувач>` (Windows) або unix-сокет
  `$XDG_RUNTIME_DIR/mijn-ruimte-extensie.sock` чи `~/.mijn-ruimte/extensie.sock` з правами 0600.
- Не пускає чужих: клієнт має довести знання токена з `~/.mijn-ruimte/extensie-token` (32 випадкові байти, новий при кожному
  запуску хоста, файл лише для вас) через HMAC; сам токен по сокету не передається, і хост теж доводить, що знає токен.
  Лише один клієнт одночасно, одна команда одночасно, не більше 30 команд на хвилину, тайм-аут 30 с, повідомлення до 1 МБ.
- Нічого не пише в журнали зі сторінок: хост і MCP-сервер логують у stderr лише тип команди, ok/помилку і тривалість.

## Встановлення

Потрібно: Node.js 18+ і розширення «Мій простір» 0.5.0 (id `ofpffonakgjioahgfejmiblfmbkobmmi`).

### Windows (без прав адміністратора)

```powershell
cd <тека з цими файлами>
powershell -ExecutionPolicy Bypass -File .\installeer-windows.ps1 -ClaudeDesktop
```

Скрипт знаходить `node.exe` (або `-NodePad 'C:\шлях\node.exe'`), копіює файли до `%LOCALAPPDATA%\MijnRuimte\extensie-native`,
створює `mr-native-host.cmd` і `com.tarasevych.mijnruimte.json`, реєструє хост у
`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.tarasevych.mijnruimte` (а також Edge і Chromium), обмежує доступ до
`%USERPROFILE%\.mijn-ruimte` (лише ви і SYSTEM) і з `-ClaudeDesktop` додає сервер до `%APPDATA%\Claude\claude_desktop_config.json`
(копія `.bak`). Без `-ClaudeDesktop` він лише показує, що вписати.

Видалення: `powershell -ExecutionPolicy Bypass -File .\verwijder-windows.ps1 -ClaudeDesktop`

### Linux / macOS

```sh
sh installeer-unix.sh            # або: sh installeer-unix.sh --node /opt/node/bin/node
```

Linux: файли в `~/.local/share/mijn-ruimte/extensie-native`, маніфест у `~/.config/google-chrome/NativeMessagingHosts`
(і `chromium`, `microsoft-edge`, Brave, якщо є). macOS: `~/Library/Application Support/MijnRuimte/extensie-native` і
`~/Library/Application Support/Google/Chrome/NativeMessagingHosts` (і Chromium, Edge, Brave). Видалення: `sh verwijder-unix.sh`.

### Після встановлення

1. Перезапустіть браузер.
2. У налаштуваннях розширення увімкніть **«Нативні повідомлення»** (Chrome попросить дозвіл `nativeMessaging`).
3. На сайті: технічний профіль активний → «Розблокувати розширення» → позначте **«локальний агент»** → підтвердіть passkey.
4. У Claude: `lokaal_status` має показати `"staat": "ontgrendeld"`.

## Налаштування MCP

**Claude Desktop** — `%APPDATA%\Claude\claude_desktop_config.json` (Windows) або
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "mijn-ruimte-lokaal": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\<ви>\\AppData\\Local\\MijnRuimte\\extensie-native\\mr-native-mcp.mjs"]
    }
  }
}
```

**Claude Code**:

```sh
# Windows (PowerShell):
claude mcp add mijn-ruimte-lokaal -- "C:\Program Files\nodejs\node.exe" "$env:LOCALAPPDATA\MijnRuimte\extensie-native\mr-native-mcp.mjs"
# Linux/macOS:
claude mcp add mijn-ruimte-lokaal -- node ~/.local/share/mijn-ruimte/extensie-native/mr-native-mcp.mjs
```

Інсталятор друкує ці рядки з точними шляхами вашого комп’ютера.

## Якщо не працює

| Повідомлення | Причина / що зробити |
|---|---|
| `GEEN_HOST` | розширення не запустило хост: немає розблокування з «локальний агент», вимкнено «Нативні повідомлення», або хост не встановлено (перезапустіть браузер після встановлення) |
| `EXTENSIE_VERGRENDELD` | час розблокування минув або доступ відкликано — розблокуйте знову на сайті |
| `LOKAAL_GEWEIGERD` | команда не з білого списку (локальний агент лише читає) |
| `LOKAAL_TE_SNEL` / `LOKAAL_BEZIG` | понад 30 команд на хвилину / ще виконується попередня команда |
| `BEZET` | уже під’єднано інший локальний агент, або хост уже працює для іншого браузера чи профілю (одночасно лише один) |
| `HOST_ONECHT` | щось інше слухає на імені сокета і не знає токена — з’єднання розірвано; перевірте, хто створив pipe/сокет |

## Файли

- `mr-native-host.mjs` — хост Native Messaging (запускає Chrome; аргумент — origin розширення, інші відхиляє).
- `mr-native-mcp.mjs` — MCP-сервер stdio (JSON-RPC 2.0, протокол 2025-06-18; також 2025-11-25 і 2025-03-26).
- `mr-native-gemeen.mjs` — спільне: фреймінг, шляхи, токен, взаємна автентифікація.
- `com.tarasevych.mijnruimte.json` — шаблон маніфесту хоста (`allowed_origins` рівно `chrome-extension://ofpffonakgjioahgfejmiblfmbkobmmi/`).
- `installeer-windows.ps1`, `verwijder-windows.ps1`, `installeer-unix.sh`, `verwijder-unix.sh`.
- У розширенні: `extension/native.js`. Тест: `tests/eenheid/extensie-native.test.ts`.
