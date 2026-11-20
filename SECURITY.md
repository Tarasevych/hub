> 🌐 **Мова / Taal:** **Українська (`uk`)** · **Nederlands (`nl`)** | [Головна · Hoofdpagina](README.md) · [Покажчик документації · Documentatie-index](docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md)

# Політика безпеки · Beveiligingsbeleid (`SECURITY.md`)

<!-- lang:uk -->
## Українська (`uk`)

### Підтримувані версії

Нижче наведено перелік гілок і випусків платформи **Mijn Ruimte**, для яких готуються та публікуються виправлення безпеки.

| Версія / Гілка | Стан підтримки | Примітка |
|---|---|---|
| Гілка `voornaamst` і поточний випуск сервера `20261105-061659` (`SEC-001`+, `ORCH-001`, `TRACE-001`, `SEC-003`) | :white_check_mark: Підтримується | Основна робоча гілка сховища та чинна основа розгортання, що отримує виправлення безпеки |
| Гілка `integratie` та лінія випусків безпеки `20261113-121403` (`SEC-002`) .. `20261116-221401` (`UPD-002`, `ANKERS-002`, `UPD-003`) | :white_check_mark: Підтримується | Активна інтеграційна й випускна лінія з розширеним захистом `SEC-002`, `VEILIG-002` і захистом пакунків `#145` |
| Старіші випуски власного розміщення до `SEC-001` (`< 20261031`) та допереписні гілки без виправлень | :x: Не підтримується | Вимагають обов'язкового оновлення до чинної основи з виправленнями `SEC-001`–`SEC-003` |
| Застаріла лінія середовища `AppDeploy` | :x: Не підтримується | Повністю виведена з експлуатації та не отримує жодних оновлень |

### Повідомлення про вразливості

Про виявлені вади безпеки, помилки налаштування або підозрілу поведінку слід повідомляти **виключно приватно** через захищений канал повідомлень про вразливості GitHub:

- **Приватний канал:** [https://github.com/Tarasevych/hub/security/advisories/new](https://github.com/Tarasevych/hub/security/advisories/new)

Просимо **не створювати** публічних звернень, обговорень або відкритих запитів на злиття із подробицями невідремонтованих уразливостей до моменту виходу виправлення.

#### Вимоги до конфіденційності (`PRIVACY-001` / `B-010`)

- Суворо заборонено додавати до повідомлень, вкладень або прикладів реальні облікові дані, паролі, маркери доступу, приватні ключі, реп'яшки сеансів, вміст електронних листів чи приватних розмов, реальні приватні IP-адреси або особисті дані власника чи користувачів.
- Для підтвердження вади використовуйте лише умовні тестові значення та знеособлені відтворення.
- Звернення щодо захисту персональних даних також можна спрямовувати на контактну адресу, яку живий сервер оприлюднює на публічних сторінках `/privacy` та `/terms`.

#### Очікувані строки реагування та виправлення

1. **Первинне підтвердження отримання:** до **48 годин** з моменту подання приватного звернення.
2. **Оцінка, відтворення та визначення ваги вади:** зазвичай протягом **3–5 робочих днів**.
3. **Узгодження виправлення й оприлюднення:** підготовка і перевірка виправлення виконується в окремій робочій гілці відповідно до правил `ORCH-001` та `TRACE-001`; після встановлення виправлення на живому сервері опис виправлення додається до документації безпеки.

### Документація безпеки

- [Зведений реєстр безпеки `НОТАТКИ-БЕЗПЕКИ.uk.md`](НОТАТКИ-БЕЗПЕКИ.uk.md)
- [Звіт безпеки щодо сканування, залежностей і таємниць від 16.11.2026 (`SEC-003`)](docs/beveiliging/ЗВІТ-БЕЗПЕКИ-СКАНУВАННЯ-20261116.uk.md)
- [Детальне покриття маршрутів і захисту рядків `RLS`](docs/beveiliging/ЗАХОДИ-БЕЗПЕКИ-ЗА-МАРШРУТАМИ-20261022.uk.md)

---

<!-- lang:nl -->
## Nederlands (`nl`)

### Ondersteunde versies

Hieronder staat het overzicht van takken en uitgaven van **Mijn Ruimte** waarvoor beveiligingsupdates worden uitgebracht.

| Versie / Tak | Ondersteuningsstatus | Toelichting |
|---|---|---|
| Tak `voornaamst` en de actuele serveruitgave `20261105-061659` (`SEC-001`+, `ORCH-001`, `TRACE-001`, `SEC-003`) | :white_check_mark: Ondersteund | Hoofdtak van de opslagplaats en geldige productiebasis die beveiligingsherstel ontvangt |
| Tak `integratie` en beveiligingsuitgaven `20261113-121403` (`SEC-002`) .. `20261116-221401` (`UPD-002`, `ANKERS-002`, `UPD-003`) | :white_check_mark: Ondersteund | Actieve integratie- en uitgavelijn met uitgebreide bescherming uit `SEC-002`, `VEILIG-002` en pakketbeveiliging `#145` |
| Oudere zelfgehoste uitgaven vóór `SEC-001` (`< 20261031`) en voorhistorische takken zonder herstel | :x: Niet ondersteund | Bijwerken naar de actuele basis met `SEC-001`–`SEC-003` is verplicht |
| Verouderde `AppDeploy`-lijn | :x: Niet ondersteund | Volledig buiten gebruik gesteld en ontvangt geen updates meer |

### Kwetsbaarheden melden

Meld beveiligingskwetsbaarheden, foutieve configuraties of verdacht gedrag **uitsluitend vertrouwelijk** via GitHub Security Advisories:

- **Vertrouwelijk meldkanaal:** [https://github.com/Tarasevych/hub/security/advisories/new](https://github.com/Tarasevych/hub/security/advisories/new)

Open **geen** openbare meldingen, discussies of samenvoegverzoeken met details van niet-verholpen kwetsbaarheden voordat een hersteluitgave is geïnstalleerd.

#### Vertrouwelijkheidsregels (`PRIVACY-001` / `B-010`)

- Voeg nooit echte inloggegevens, wachtwoorden, toegangssleutels, privésleutels, sessiecookies, e-mail- of gespreksinhoud, echte privé-IP-adressen of persoonsgegevens van de eigenaar of gebruikers toe aan meldingen of bijlagen.
- Gebruik bij reproductie uitsluitend fictieve testwaarden en geschoonde voorbeelden.
- Vragen over gegevensbescherming kunnen daarnaast worden gericht aan het contactadres dat door de actieve server wordt getoond op de openbare pagina's `/privacy` en `/terms`.

#### Verwachte reactietijden en afhandeling

1. **Eerste ontvangstbevestiging:** binnen **48 uur** na indiening van de vertrouwelijke melding.
2. **Beoordeling, reproductie en ernstclassificatie:** doorgaans binnen **3–5 werkdagen**.
3. **Afstemming en publicatie:** herstel en verificatie verlopen in een afzonderlijke werktak volgens `ORCH-001` en `TRACE-001`; zodra de hersteluitgave op de productieserver actief is, wordt de toelichting vastgelegd in de beveiligingsdocumentatie.

### Beveiligingsdocumentatie

- [Overzicht en historie: `BEVEILIGINGSNOTITIES.nl.md`](BEVEILIGINGSNOTITIES.nl.md)
- [Beveiligingsrapport scans, afhankelijkheden en geheimen van 16-11-2026 (`SEC-003`)](docs/beveiliging/BEVEILIGINGSRAPPORT-SCANS-20261116.nl.md)
- [Volledig overzicht van beveiligingsmaatregelen per route en `RLS`](docs/beveiliging/MAATREGELEN-PER-ROUTE-20261022.nl.md)
