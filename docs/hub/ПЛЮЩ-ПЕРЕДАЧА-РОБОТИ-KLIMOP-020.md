> 🌐 **Мова:** **Українська** · [Nederlands](KLIMOP-020-WERKOVERDRACHT.nl.md) | [Виправлення за незалежною перевіркою](ПЛЮЩ-ВИПРАВЛЕННЯ-ЗА-НЕЗАЛЕЖНОЮ-ПЕРЕВІРКОЮ.uk.md)

# Передача роботи KLIMOP-020: межі довіри (Хвиля 3)

**Статус:** проміжний стан фіксації `add014c5` перейнято після вичерпання ліміту і **повністю завершено** моделлю `Gemini 4 Carbon (High)` на платформі `Google Antigravity`.
**Дата передачі та завершення:** 21.11.2026 (передача близько 15:27 UTC, завершення Хвилі 3 того самого дня).
**Гілка:** `fix/klimop-020-vertrouwensgrenzen-20261121-151312` (основа — фіксація `4ec0c22c` гілки KLIMOP-019, запит на злиття №201).

## 1. Хто що зробив

| Роль | Агент і модель | Платформа | Що саме |
|---|---|---|---|
| Доручив | Тарасевич Павло (власник) | — | Виправлення за звітом незалежної перевірки `AUDIT-002`, чотири хвилі |
| Початкова розробка KLIMOP-001…017 | Gemini 4 Carbon (High) | Google Antigravity | Етапи 0–16 «Плюща» |
| Незалежна перевірка `AUDIT-002` | GPT-6.2 Astra (Ультра) | платформу не підтверджено | 55 вад (20 високих, 24 середні, 11 низьких) |
| Хвилі 1–2 (KLIMOP-018, KLIMOP-019) і початок Хвилі 3 (KLIMOP-020, фіксація `add014c5`) | Claude Opus 5.5 (High) | Google Antigravity | Запити на злиття №200, №201 і перша проміжна фіксація Хвилі 3 |
| Завершення KLIMOP-020 з місця зупинки, далі KLIMOP-021 | Gemini 4 Carbon (High) | Google Antigravity | Повне виконання пунктів 3.1–3.7 після вичерпання п'ятигодинного ліміту Claude Opus 5.5 (High) |

Облік внеску Claude Opus 5.5 (High) у KLIMOP-020 записано в `orchestratie/bijdragen/KLIMOP-020/20261121-152856-antigravity.json` (BIJDRAGE-001). Gemini 4 Carbon (High) додала **власний окремий запис** обліку з `--bouwt-voort-op KLIMOP-020/20261121-152856-antigravity`; наявні записи не редагуються.

## 2. Що було зроблено до моменту передачі в KLIMOP-020 (Claude Opus 5.5 (High), фіксація `add014c5`)

### 2.1. Мандати: хто має право на конкретну дію й об'єкт (вада звіту «мандат не встановлює, хто має право видати дозвіл»)

- `shared/klimop/kern.ts`:
  - `KlimopMandaatInhoud` має необов'язкові поля `toegestaneActies`, `objectIds`, `gemachtigdeAfzenders`;
  - `canoniekeJson` пропускає ключі зі значенням `undefined` (інакше підпис не збігався після передачі мережею);
  - `verifieerKlimopMandaat` приймає `vertrouwdeUitgevers`, `actie`, `objectId`, `vereisActieBereik`, `sessieAfzenderKnooppuntId` і повертає коди `UITGEVER_NIET_VERTROUWD`, `ONDERTEKENAAR_NIET_VERTROUWD:<id>`, `MANDAAT_ACTIE_NIET_TOEGESTAAN`, `MANDAAT_ZONDER_ACTIEBEREIK`, `MANDAAT_OBJECT_NIET_TOEGESTAAN`, `MANDAAT_AFZENDER_NIET_GEMACHTIGD`.
- `backend/klimop-knooppunt-agent.ts`:
  - конфігурація вузла `vertrouwdeUitgevers?: string[]` вмикає **суворий режим** (`streng`), без неї — явний режим `open_proef` лише для штучних випробувань;
  - `controleerRolEnMandaat(rol, mandaat, sessie, opdracht)` у всіх 9 місцях; об'єкт дії визначає `objectIdVanOpdracht` (`setId`, `blokSha256`, `persoonsId`, `dienstId`, `operatieId`);
  - метод `vertrouwensModus()` і поле `vertrouwensModus` у відповіді `pong`.
- Клієнти: мандати мають явний перелік дій (`klimop-drempel-client.ts` — сталий перелік `KLIMOP_DREMPEL_MANDAAT_ACTIES` і `objectIds: [setId]`; `klimop-opslag-client.ts` — дії над блоками й `objectIds` лише зі смуг, призначених цьому вузлу; також клієнти audit, bestuur, diensten, hechtranken, identiteit, mensbescherming, zaden).
- Стенд `scripts/klimop-etappe4-frost-proef.mjs` працює в суворому режимі й має новий рядок «Суворий режим довіри» (8 рядків ok).

### 2.2. Відновлення особи й права коренів (вади «споживач не може перевірити, що опікуни уповноважили новий корінь» і «старий корінь зберігає право посвідчувати пристрої»)

- `shared/klimop/identiteit.ts`:
  - нові типи `KlimopHerstelBeleidVerankering`, `KlimopHerstelCertificaat`; поле `herstelBeleidVerankeringen` у стані особи; функції `verankerHerstelBeleid`, `berekenHerstelBeleidSha256`;
  - ротація відновлення несе повний сертифікат переходу (політика, заявка зі строками, голоси опікунів) у підписаному змісті; `verifieerPersoonsStaat` перевіряє його: закріплення політики коренем чинної епохи до відкриття заявки, поріг, мінімальне вікно оскарження, завершення після строку, дійсні голоси;
  - голос опікуна (домен `klimop-herstel-voogd-stem-v2|`) охоплює умову відновлення, строки й відбиток політики;
  - невідомий вид переходу відхиляється (`PERSOON_ONBEKEND_ROTATIETYPE`);
  - право видавати посвідчення має лише корінь, чинний на момент видачі; після законного відновлення попередні корені втрачають право для будь-якого використання після моменту відновлення; аварійний пристрій, який сам відкликаний, не може відкликати інших;
  - ненормативні дати в сертифікаті пристрою дають закриту відмову (`APPARAAT_CERTIFICAAT_TIJD_ONGELDIG`).
- `backend/klimop-identiteit-client.ts`: історії ротацій усіх відповідей мають бути префіксами одна одної (`TEGENSTRIJDIGE_IDENTITEITSGESCHIEDENIS_GEDETECTEERD`), а голова обирається лише якщо її містять щонайменше `quorumDrempel` вузлів.
- Стенди 5, 7, 9 і тести klimop-006, klimop-008, klimop-010 закріплюють політику відновлення перед заявкою.

### 2.3. Конституція (вада «рішення ради не прив'язане до фактично застосованих правил і ключів»), розпочато в `add014c5`

- `shared/klimop/bestuur.ts`: нові `maakGrondwetWijzigingInhoud` і `berekenGrondwetWijzigingSha256`; `verifieerBestuursBesluitLogboek` тепер повторює перевірки часової політики, підпису ініціатора, відсутності вета й складу кворуму.

## 3. Що завершено після передачі в KLIMOP-020 (Gemini 4 Carbon (High))

1. **Конституція на вузлі (`shared/klimop/bestuur.ts`, `backend/klimop-knooppunt-agent.ts`, `klimop-007`):** експортовано `verifieerBestuursGrondwetVorm` і додано закриту відмову на нескінченні дати; вузол у `stel_bestuursgrondwet_in` звіряє відбиток нової конституції й ключів ролей із підписаним змістом останнього рішення (`GRONDWET_WIJZIGING_INHOUD_KOMT_NIET_OVEREEN`), контролює однократне застосування за `besluitSha256` (`GRONDWET_BESLUIT_REEDS_TOEGEPAST`) та строк дії за годинником вузла; оновлено `klimop-007`.
2. **«Насіння» (`shared/klimop/zaden.ts`, `backend/klimop-zaden-client.ts`, `backend/klimop-knooppunt-agent.ts`, стенд 12, `klimop-013`):** точна рівність множини вкладень і підписаного переліку (`ZAAD_ONGETEKEND_ONDERDEEL_AANWEZIG`), побайтовий порядок замість `localeCompare`, перевірка очікуваного ключа хранителя (`ZAAD_BEWAARDER_SLEUTEL_KOMT_NIET_OVEREEN`), налаштування `beginAnker` на вузлі (без якоря конституція з пакета не встановлюється, а спадкоємність повертає `GEEN_VERTROUWD_BEGINANKER`) і порівняння `SHA-256` повного підписаного пакета у клієнті кворуму (`QUORUM_ZAAD_PAKKET_TEGENSTRIJDIG`).
3. **Імунна перевірка (`shared/klimop/immuunsysteem.ts`, `backend/klimop-immuunsysteem-client.ts`):** позитивний висновок можливий виключно за наявності незалежного еталона й очікуваного розміру (`INTEGRITEIT_REFERENTIE_ONTBREEKT`, `INTEGRITEIT_GROOTTE_KOMT_NIET_OVEREEN`); клієнт відновлює еталонні смуги Ріда–Соломона без ключа `KEK`, а за браку еталона повертає `gezondeStrepen = 0`.
4. **Групове шифрування (`shared/klimop/identiteit.ts`, статті Етапу 5):** чесно зазначено спрощене групове епохове шифрування за мотивами ідей `RFC 9420` (не повна реалізація `MLS RFC 9420 / TreeKEM`); додано перевірку підпису пакета привітання (`MLS_WELKOM_HANDTEKENING_ONGELDIG`), одноразові ключі повідомлень за відправником і захист від повторів (`MLS_BERICHT_HERHALING_GEWEIGERD`), функцію `verversEigenMlsBladSleutel` та затирання тимчасових буферів у `finally`.
5. **Локальні корені на вузлі та оцінка Сивілли (`shared/klimop/diensten.ts`, `shared/klimop/hechtranken.ts`, `backend/klimop-knooppunt-agent.ts`):** списки пристроїв синхронізації, ключів скасування, поручителів, аудиторів і годинник беруться з локального стану вузла; прострочені приєднання відсіюються, а відсутність зовнішнього доказу фізичної незалежності позначається як `fysiekeOnafhankelijkheidExternBewezen: false`.
6. **Кворум в одному процесі (`shared/klimop-overzicht-model.ts`, `backend/klimop-overdracht-opslag.ts`):** явно позначений як `lokale_simulatie_een_proces` / `lokale_simulatie`, додано перевірку зовнішнього реєстру ключів у `verifieerQuorumAttestKeten`.
7. **Випробування й документація:** створено комплексне випробування `tests/eenheid/klimop-020-vertrouwensgrenzen-20261121.test.ts`, додано розділ «4. Хвиля 3 — KLIMOP-020» у двомовні статті виправлень, оновлено досьє `ecosysteem-klimop.json` та зареєстровано внесок завершення у `BIJDRAGE-001`.
8. Наступний крок — **KLIMOP-021** (Хвиля 4: сходинки перенесення, панель інтерфейсу, справжні виміри стендів, двомовна паритетність і решта вад).

## 4. Стан перевірок на момент передачі

Див. повідомлення фіксації змін: там наведено фактичні результати `tsc`, модульних тестів `klimop-` і стендів етапів 4, 5, 6, 7, 9, 12, зняті безпосередньо перед фіксацією.

## 5. Обмеження

- Злиття — лише власником; запити на злиття складені стосом (№200 → №201 → KLIMOP-020).
- Штучні випробування й стенди не є приймальними випробуваннями робочого середовища.
- Режим `open_proef` лишається для старих стендів, які ще не переведені на суворий режим.
- Середовище виконання має Node.js 24, а правила вимагають 26.13.0.
