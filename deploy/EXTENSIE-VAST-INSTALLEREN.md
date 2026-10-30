# Розширення не зникає після перезапуску Chrome · Extensie blijft staan na een herstart van Chrome

UI-011 / BUG-005 · 29.10.2026 · extensie 0.8.0

## Українською (просто)

**Чому розширення зникало.** Розширення «Mijn Ruimte» встановлюється як «розпаковане» (папка з файлами). Chrome пам’ятає лише **шлях до цієї папки**. Якщо під час запуску Chrome папки немає (її видалили, перемістили, вона була в «Завантаженнях» чи тимчасовій папці, на мережевому, USB, OneDrive або зашифрованому диску, який підключається пізніше), Chrome **мовчки прибирає розширення зі списку**. Ми перевірили це в справжньому Chrome: папка є — розширення лишається після 5 перезапусків; папки немає — після першого ж перезапуску розширення зникає повністю.

Ще одна причина: якщо завантажити пакет «діагностика» або нову версію з **іншої** папки, Chrome запам’ятовує вже нову папку (ідентифікатор той самий). Якщо цю нову папку потім видалити — розширення зникне.

**Що робити (один раз).**
1. Завантажте `mijn-ruimte-extension.zip` з сайту.
2. Запустіть у PowerShell: `powershell -ExecutionPolicy Bypass -File .\installeer-extensie-vast-windows.ps1 -Zip "$env:USERPROFILE\Downloads\mijn-ruimte-extension.zip"` — файли ляжуть у постійну папку `%LOCALAPPDATA%\MijnRuimte\extensie`.
3. `chrome://extensions` → «Режим розробника» увімкнути → «Завантажити розпаковане» → оберіть саме цю папку.
4. Оновлення: той самий скрипт у ту саму папку, потім ↻ у `chrome://extensions`. Ідентифікатор не змінюється.

Не вимикайте «Режим розробника»: Chrome тоді вимикає розпаковані розширення (але не видаляє).

**Перевірка на вашому комп’ютері (лише читає, нічого не змінює):** `powershell -ExecutionPolicy Bypass -File .\extensie-diagnose-windows.ps1` — на робочому столі з’явиться `MijnRuimte-extensie-diagnose.txt`. Там видно, з якої папки Chrome завантажував розширення, чи вона існує, на якому диску, і чи немає правил (політик), що блокують розширення.

## Nederlands

**Oorzaak (bewezen mechanisme).** Een uitgepakte extensie bestaat in Chrome alleen als verwijzing naar haar map. Ontbreekt die map bij de start van Chrome, dan haalt Chrome de extensie stil uit chrome://extensions (het record blijft in Preferences staan, de extensie is weg). Getest in Google Chrome 156 op Linux met een echte «Uitgepakt laden» via het mapvenster: vaste map → 5+ herstarts aanwezig; map weg → na de eerste herstart volledig verdwenen. Ontwikkelaarsmodus uit → extensie UITGESCHAKELD (`unsupportedDeveloperExtension`), niet verwijderd: dat verklaart het «helemaal weg» dus niet.

Het id is stabiel: `key` staat in manifest.json → altijd `ofpffonakgjioahgfejmiblfmbkobmmi`. Een tweede map met hetzelfde id (bv. het pakket «diagnose» uit Downloads) vervangt de registratie van de eerste map.

**Ondersteunde permanente methoden op Windows (eerlijk):**
| Methode | Werkt op Pavlo's pc? | Opmerking |
|---|---|---|
| Uitgepakt laden uit een VASTE lokale map (`%LOCALAPPDATA%\MijnRuimte\extensie`) | ja | aanbevolen; ontwikkelaarsmodus moet aan blijven |
| Eigen CRX + `ExtensionInstallForcelist` (register) | **nee**, tenzij de pc lid is van een AD-/Entra-domein of ingeschreven in Chrome Enterprise Core | Chrome-beleidsdefinitie: «On Microsoft Windows instances, apps and extensions from outside the Chrome Web Store can only be forced installed if the instance is joined to … Active Directory … Azure Active Directory or enrolled in Chrome Enterprise Core.» |
| Chrome Web Store (ook «verborgen/unlisted») | ja, na publicatie | vraagt ontwikkelaarsaccount en beoordeling; `debugger` maakt de beoordeling strenger |
| CRX slepen naar chrome://extensions | nee | op Windows schakelt Chrome niet-Store-CRX's uit |

Scripts: `deploy/installeer-extensie-vast-windows.ps1` (zet de bestanden in de vaste map; wist nooit een vreemde map; raakt Chrome en het register niet) en `deploy/extensie-diagnose-windows.ps1` (alleen lezen).
