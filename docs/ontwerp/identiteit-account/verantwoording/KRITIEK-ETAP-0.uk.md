# Критика відомості v15 (rijen-*.json, 12 файлів)

Гілка: feature/identiteit-015-verantwoording-20261114-080023. У репозиторії нічого не змінено.
Допоміжні скрипти: dekking.mjs, tegen.mjs (у цій теці).

## 1. Покриття позицій
- Рядків: 301, дублікатів id немає, порожніх обов'язкових полів (actie, wie, waar, opslag, staatVoor, gereedAls) немає.
- Усі 153 позиції з src/identiteit/atelier-v49-gegevens.json мають щонайменше один рядок. **Пропущених немає.**
- 3 додані позиції зі станНаСайті.додати теж покрито: menu.сповіщення.10, security.другий-чинник.2, security.другий-чинник.3.
- Посилання на код: 1040 посилань file:line. Усі файли існують. Один номер рядка виходить за межі файлу:
  languages.мова.0.echt-paneel-uk → `IdentiteitMaquette.tsx:161-172`, а у файлі 170 рядків (має бути 161-170).
- Усі файли з поля testen існують.
- Розподіл станів: працює 204, частково 25, лише в макеті 30, в іншому місці 23, недоступно 7, потребує налаштування власника 12.

## 2. Вибіркова перевірка проти коду
### «Працює»: 12 тверджень, усі підтверджено
| Рядок | Чим підтверджено |
|---|---|
| menu.піктограми.0 | ZijbalkInstellingen.tsx:46-49 (fieldset data-icoon-stijl-keuze, input name=icoon-stijl) |
| security.ключі.0 | маршрут passkeys/lijst у ToegangssleutelsSectie.tsx |
| recovery.засоби.0.stan-kodiv | recovery/overzicht у HerstelcodesSectie.tsx і backend/toegangslaag.ts |
| security.резервні-коди.2.zavantazhyty | рядок `mijn-ruimte-herstelcodes` у HerstelcodesSectie.tsx |
| sessions.цей-пристрій.0 | атрибут data-sessies-onthouden у SessiesOverzicht.tsx |
| security.другий-чинник.3.zaminyty | toegangslaag.ts:701-708 (step-up, currentCode або код відновлення, pendingSecretEnc) |
| sharing.чинні.0.perelik-uchasnykiv | id delen-leden у delen/LedenLijst.tsx і InstellingencentrumWeergave.tsx |
| themes.розклад | id thema-auto-kop у thema/ThemaInstellingen.tsx |
| recovery.сценарії | атрибут data-scenario у herstel/Scenarios.tsx |
| recovery.поради.1 | id herstel-sleutelverlies у herstel/Scenarios.tsx |
| menu.сповіщення.10 | ZijbalkInstellingen.tsx:76 (перемикач з data-meld-schakel='reserve') |
| menu.сповіщення (група) | ZijbalkInstellingen.tsx:70 (Blok id='menu-meldingen'), id menu-meldingtypen |

### «Відсутнє» (лише в макеті / недоступно / частково): 8 тверджень, усі підтверджено
| Рядок | Чим підтверджено |
|---|---|
| security.ключі.5.dovira | vertrouwd_op і passkeys/vertrouwen ніде не знайдено |
| account.особа.1.bez-foto | geenFoto ніде не знайдено |
| methods.додаткові.5.sms-kod | server/platform/sms* не існує |
| methods.додаткові.5.nomer («частково») | маршрут POST phone/save є (toegangslaag.ts:670), але в src/ інтерфейсу немає; твердження коректне |
| methods.основні.1.vhid-kliuchem | є лише маршрути webauthn/options, register, remove і stap-op/passkey; маршруту входу ключем немає |
| sharing.чинні.0.perelik-posylan | маршруту переліку посилань немає (є лише share/link, share/link/revoke, share/members). Імовірно правильно; варто ще раз перевірити, що share/members не повертає посилань |
| menu.сповіщення.6 (тихі години, частково) | shared/menu-meldingen-voorkeuren.ts:26 «geen knipperen/herinneren (badges blijven)», isStil лише на клієнті |
| security.гостьові-коди.0.inshi-oblikovi / sessions.гості.0 (недоступно) | backend/toegangscodes-routes.ts:60, OWNER_REQUIRED |

Неточність: methods.основні.2.zaminyty пише лише «чинний код». Код (toegangslaag.ts:702-705) вимагає ще step-up і приймає також код відновлення. У security.другий-чинник.3 це описано правильно.
Неточність: methods.основні.2.vymknuty пише «вікно з кодом». Сервер (toegangslaag.ts:756) приймає також код відновлення. У security.другий-чинник.1.vymknuty це описано правильно.

## 3. Суперечності
### 3a. Карта на сайті (станНаСайті) і рядки
- **menu.сповіщення.6**: карта показує «в-чинних» (Працює), рядок каже «частково працює» (тихі години не відкладають спливні сповіщення, звук і push). Треба додати в станНаСайті.menu.сповіщення `рядки:{6:"частково"}`.
- **security.шифрування.5**: карта показує «в-чинних», рядок pereshyfruvaty каже «частково» (немає перебігу й продовження після 423). Також methods.захист.1.povtorne-shyfruvannia каже «частково». Треба додати в станНаСайті.security.шифрування `рядки:{5:"частково"}`.
- **security.ключі.5**: карта каже «заплановано», але на цій позиції стоїть рядок pravo-skhvalennia зі станом «працює». Через нього здається, що позиція частково готова. Його варто винести як примітку (herkomst) або дати йому окремий id без власного staatVoor.
- **sessions.цей-пристрій.1**: карта каже «частково» (на рівні групи), рядок каже «працює». Варто явно задати рядки:{1:"в-чинних"} або пояснити в рядку, чому позиція частково готова (немає цілі переходу).
- **widgets.створення.0-4 і 6**: карта каже «частково» на рівні групи, усі рядки кажуть «працює». Треба задати в карті рядки:{…:"в-чинних"} для цих позицій або назвати в рядках, чого бракує.
- **methods.додаткові.5**: карта каже «заплановано», рядок nomer каже «частково працює». Маршрут phone/save є, тож це точніше «частково» або «потребує налаштування власника». Треба вирівняти.

### 3b. Одна дія в різних розділах
- **Довіра до ключа доступу**: methods.основні.1.stan-vhid-vs-pidtverdzhennia («частково», показує «чи довірений») суперечить security.ключі.5.dovira («є лише в макеті», поля довіри немає). Треба прибрати «чи довірений» з першого рядка або послатися на ключі.5.
- **Заміна і вимкнення TOTP**: methods.основні.2 і security.другий-чинник описують ту саму дію з різними умовами (див. неточності в розділі 2). Треба взяти формулювання security.
- **Коди відновлення**: methods.захист.0.stvoryty («код TOTP або step-up») суперечить recovery.засоби.0.stvoryty-kody («з TOTP — лише passkey або код застосунку»). Треба звести до одного правила, перевіривши HerstelcodesSectie / toegangslaag.
- Позиції з кількома станами (menu.панель.0, menu.розташування.0, languages.мова.0, sharing.*, account.видалення.*, recovery.сценарії.*) розділено на окремі піддії. Це не суперечність, але для кожної позиції треба вказати, який підсумковий стан бачить карта.
