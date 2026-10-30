// Catalogus van de ALLEEN-LEZENDE controles in Admin → «Оновлення» → «Діагностика» → «Перевірки».
// Eén bron voor server (backend/uitrol-diagnose-run.ts: vaste whitelist, geen vrije opdrachten) en scherm (src/uitrol/Diagnose.tsx:
// groepen, pictogram, hulp-popover «?», gelijkwaardige SSH-opdracht om te kopiëren).
export type Tekst = readonly [string, string];
export type CheckGroep = 'keten' | 'diensten' | 'pakketten' | 'server';
export type CheckBron = 'live' | 'live-of-root' | 'root' | 'database' | 'app';
export type CheckInfo = {
  id: string; groep: CheckGroep; pictogram: string; bron: CheckBron;
  titel: Tekst; kort: Tekst;
  /** Waarvoor dient deze controle? */
  doel: Tekst;
  /** Hoe ziet een gezond resultaat eruit? */
  gezond: Tekst;
  /** Veelvoorkomende afwijkingen: wat zie je, wat betekent het. */
  fouten: ReadonlyArray<{ teken: Tekst; betekenis: Tekst }>;
  /** Gelijkwaardige opdracht voor SSH (alleen lezen); null = alleen op de site beschikbaar. */
  ssh: string | null;
};

export const CHECK_GROEPEN: ReadonlyArray<{ id: CheckGroep; pictogram: string; naam: Tekst; uitleg: Tekst }> = [
  { id: 'keten', pictogram: 'keten', naam: ['Ланцюг встановлення', 'Installatieketen'], uitleg: ['Шлях пакета: inbox → служба схвалень → root-скрипт', 'De weg van een pakket: inbox → goedkeur-dienst → root-script'] },
  { id: 'diensten', pictogram: 'diensten', naam: ['Служби та сайт', 'Diensten en site'], uitleg: ['Чи працюють служби systemd і сам сайт', 'Draaien de systemd-diensten en de site zelf'] },
  { id: 'pakketten', pictogram: 'pakketten', naam: ['Пакети та журнали', 'Pakketten en logboeken'], uitleg: ['Що завантажено, що записав root', 'Wat is geüpload, wat schreef root'] },
  { id: 'server', pictogram: 'server', naam: ['Сервер', 'Server'], uitleg: ['Диск, пам’ять, навантаження', 'Schijf, geheugen, belasting'] },
];

export const CHECKS: ReadonlyArray<CheckInfo> = [
  { id: 'goedkeur-diensten', groep: 'keten', pictogram: 'diensten', bron: 'live-of-root',
    titel: ['Служби схвалення', 'Goedkeur-diensten'], kort: ['Стан path-юніта, служби та таймера', 'Stand van de path-unit, de dienst en de timer'],
    doel: ['Показує, чи «слухає» систему тека goedkeur-inbox і чи остання обробка схвалення завершилась успішно.', 'Toont of de goedkeur-inbox wordt bewaakt en of de laatste verwerking van een goedkeuring is gelukt.'],
    gezond: ['path: active/waiting · service: inactive/dead з результатом «success» або порожнім.', 'path: active/waiting · service: inactive/dead met resultaat «success» of leeg.'],
    fouten: [
      { teken: ['path не active', 'path niet active'], betekenis: ['Схвалення нікому обробляти: пакети лежатимуть у inbox. Потрібно ввімкнути юніт на сервері.', 'Niemand verwerkt goedkeuringen: pakketten blijven in de inbox liggen. De unit moet op de server aan.'] },
      { teken: ['service: failed / exit-code', 'service: failed / exit-code'], betekenis: ['Остання обробка завершилась помилкою — дивіться «Журнал служби схвалень».', 'De laatste verwerking is mislukt — zie het «Journaal van de goedkeur-dienst».'] },
      { teken: ['not-found', 'not-found'], betekenis: ['Юніт не встановлено — на сервері ще старий випуск.', 'De unit is niet geïnstalleerd — op de server staat nog een oude release.'] },
    ], ssh: 'systemctl status mijn-ruimte-goedkeuring.path mijn-ruimte-goedkeuring.service --no-pager' },
  { id: 'goedkeur-journaal', groep: 'keten', pictogram: 'journaal', bron: 'live-of-root',
    titel: ['Журнал служби схвалень', 'Journaal goedkeur-dienst'], kort: ['Останні рядки journalctl', 'Laatste regels van journalctl'],
    doel: ['Остання робота root-служби: що вона прочитала, чому відхилила чи зупинилась.', 'Het laatste werk van de root-dienst: wat ze las, waarom ze weigerde of stopte.'],
    gezond: ['Рядки «[uitrol] …» без «ПОМИЛКА»/«failed»; завершується повідомленням про успіх.', 'Regels «[uitrol] …» zonder «FOUT»/«failed»; eindigt met een succesmelding.'],
    fouten: [
      { teken: ['Failed with result', 'Failed with result'], betekenis: ['systemd зупинив службу через помилку скрипта; причина — кількома рядками вище.', 'systemd stopte de dienst door een scriptfout; de oorzaak staat enkele regels hoger.'] },
      { teken: ['GEEN_AUTEUR / GEEN_SAMENVATTING', 'GEEN_AUTEUR / GEEN_SAMENVATTING'], betekenis: ['У пакеті бракує обов’язкових метаданих (AUTEUR, AGENT, SAMENVATTING).', 'Het pakket mist verplichte metadata (AUTEUR, AGENT, SAMENVATTING).'] },
      { teken: ['NIET_NIEUWER', 'NIET_NIEUWER'], betekenis: ['Версія пакета не новіша за встановлену.', 'De versie van het pakket is niet nieuwer dan de geïnstalleerde.'] },
    ], ssh: 'journalctl -u mijn-ruimte-goedkeuring -n 80 --no-pager' },
  { id: 'inbox', groep: 'keten', pictogram: 'inbox', bron: 'live',
    titel: ['Черга пакетів (inbox)', 'Pakketwachtrij (inbox)'], kort: ['Файли в goedkeur-inbox', 'Bestanden in de goedkeur-inbox'],
    doel: ['Показує, чи є схвалені пакети, які ще не підхопив root.', 'Toont of er goedgekeurde pakketten liggen die root nog niet oppakte.'],
    gezond: ['Порожньо — root уже забрав усе, що ви схвалили.', 'Leeg — root nam alles mee wat u goedkeurde.'],
    fouten: [
      { teken: ['Файл mijn-ruimte-….tar.gz лежить давно', 'Een bestand mijn-ruimte-….tar.gz ligt er al lang'], betekenis: ['Root не обробляє чергу: перевірте «Служби схвалення» та блокування.', 'Root verwerkt de wachtrij niet: controleer «Goedkeur-diensten» en de vergrendeling.'] },
      { teken: ['Теки немає', 'Map ontbreekt'], betekenis: ['Сервер не налаштований для схвалення через passkey.', 'De server is niet ingericht voor goedkeuring met passkey.'] },
    ], ssh: 'ls -la /srv/mijn-ruimte/goedkeur-inbox' },
  { id: 'blokkering', groep: 'keten', pictogram: 'slot', bron: 'live-of-root',
    titel: ['Блокування встановлення', 'Installatievergrendeling'], kort: ['Чи тримає хтось uitrol.lock', 'Houdt iemand uitrol.lock vast'],
    doel: ['Одночасно може йти лише одне встановлення. Блокування захищає від двох запусків.', 'Er kan maar één installatie tegelijk lopen. De vergrendeling voorkomt twee gelijktijdige runs.'],
    gezond: ['«вільне», коли нічого не встановлюється; «утримується» — лише під час роботи root.', '«vrij» als er niets wordt geïnstalleerd; «vastgehouden» alleen terwijl root bezig is.'],
    fouten: [{ teken: ['Утримується, але служба не працює', 'Vastgehouden terwijl de dienst niet draait'], betekenis: ['Завислий процес: нові пакети мовчки ігноруються, доки його не завершать.', 'Een vastgelopen proces: nieuwe pakketten worden stil genegeerd tot het is beëindigd.'] }],
    ssh: 'lslocks | grep mijn-ruimte-uitrol' },
  { id: 'root-script', groep: 'keten', pictogram: 'script', bron: 'live',
    titel: ['Root-скрипт встановлення', 'Root-installatiescript'], kort: ['Чи існує і чи виконуваний', 'Bestaat en is uitvoerbaar'],
    doel: ['Скрипт, який виконує встановлення від імені root. Нова версія скрипта діє з наступного запуску.', 'Het script dat de installatie als root uitvoert. Een nieuwe scriptversie geldt vanaf de volgende run.'],
    gezond: ['«виконуваний» і короткий відбиток sha256.', '«uitvoerbaar» en een korte sha256-vingerafdruk.'],
    fouten: [{ teken: ['відсутній / НЕ виконуваний', 'ontbreekt / NIET uitvoerbaar'], betekenis: ['Встановлення неможливе, доки root не виправить файл.', 'Installeren kan niet totdat root het bestand herstelt.'] }],
    ssh: 'ls -l /usr/local/sbin/mijn-ruimte-uitrol && sha256sum /usr/local/sbin/mijn-ruimte-uitrol' },
  { id: 'root-momentopname', groep: 'keten', pictogram: 'momentopname', bron: 'root',
    titel: ['Знімок від root', 'Momentopname van root'], kort: ['diagnose.json — щохвилини', 'diagnose.json — elke minuut'],
    doel: ['Те, що root сам записав про ланцюг (служби, блокування, диск, inbox). Сайт не має прав root і читає лише цей файл.', 'Wat root zelf over de keten opschreef (diensten, vergrendeling, schijf, inbox). De site heeft geen rootrechten en leest alleen dit bestand.'],
    gezond: ['Вік знімка до 3 хвилин, «проблем: 0».', 'Leeftijd van de momentopname hoogstens 3 minuten, «problemen: 0».'],
    fouten: [{ teken: ['Файл відсутній або старший за 3 хв', 'Bestand ontbreekt of ouder dan 3 min'], betekenis: ['Таймер mijn-ruimte-diagnose не працює або на сервері ще старий випуск.', 'De timer mijn-ruimte-diagnose draait niet of op de server staat nog een oude release.'] }],
    ssh: 'cat /var/lib/mijn-ruimte-uitrol-status/diagnose.json' },
  { id: 'passkeys-root', groep: 'keten', pictogram: 'sleutel', bron: 'live',
    titel: ['Ключі схвалення (passkey)', 'Goedkeur-sleutels (passkey)'], kort: ['Які passkey знає root', 'Welke passkeys root kent'],
    doel: ['Root приймає схвалення лише від passkey зі свого файлу ключів. Тут — їхні назви та відбитки (без секретів).', 'Root accepteert alleen goedkeuringen van passkeys uit zijn eigen sleutelbestand. Hier staan namen en vingerafdrukken (zonder geheimen).'],
    gezond: ['Принаймні один ключ і перемикач «passkey-goedkeuring» увімкнений.', 'Minstens één sleutel en de schakelaar «passkey-goedkeuring» staat aan.'],
    fouten: [
      { teken: ['0 ключів', '0 sleutels'], betekenis: ['Схвалити нічим: додайте passkey і підтвердіть її на сервері.', 'Er is niets om mee goed te keuren: voeg een passkey toe en bevestig die op de server.'] },
      { teken: ['перемикач вимкнено', 'schakelaar uit'], betekenis: ['У /etc/mijn-ruimte/mcp-rechten.json має бути "passkey-goedkeuring": true.', 'In /etc/mijn-ruimte/mcp-rechten.json moet "passkey-goedkeuring": true staan.'] },
    ], ssh: 'sudo mijn-ruimte-passkey lijst' },
  { id: 'systeemdiensten', groep: 'diensten', pictogram: 'diensten', bron: 'live-of-root',
    titel: ['Усі служби оновлення', 'Alle update-diensten'], kort: ['Шість юнітів systemd', 'Zes systemd-units'],
    doel: ['Загальний стан усіх юнітів, потрібних для оновлень, і самого сайту.', 'Overzicht van alle units die voor updates nodig zijn, plus de site zelf.'],
    gezond: ['Усі «loaded»; служби — success/порожньо, path і timer — active.', 'Alles «loaded»; diensten success/leeg, path en timer active.'],
    fouten: [{ teken: ['not-found', 'not-found'], betekenis: ['Юніта немає: випуск на сервері старіший за цей.', 'De unit ontbreekt: de release op de server is ouder dan deze.'] }],
    ssh: 'systemctl list-units "mijn-ruimte*" --all --no-pager' },
  { id: 'site-dienst', groep: 'diensten', pictogram: 'site', bron: 'live-of-root',
    titel: ['Служба сайту', 'Site-dienst'], kort: ['mijn-ruimte.service', 'mijn-ruimte.service'],
    doel: ['Чи працює сам сайт і коли він востаннє стартував (перезапуск після встановлення).', 'Draait de site zelf en wanneer ze voor het laatst startte (herstart na een installatie).'],
    gezond: ['active/running.', 'active/running.'],
    fouten: [{ teken: ['failed / activating (auto-restart)', 'failed / activating (auto-restart)'], betekenis: ['Сайт падає після старту — дивіться журнал сайту; автовідкат встановлення мав би спрацювати.', 'De site crasht na het starten — zie het sitelogboek; het automatische terugdraaien had moeten ingrijpen.'] }],
    ssh: 'systemctl status mijn-ruimte --no-pager' },
  { id: 'site-gezondheid', groep: 'diensten', pictogram: 'hart', bron: 'app',
    titel: ['Перевірка здоров’я сайту', 'Gezondheidscontrole van de site'], kort: ['GET /api/_healthcheck зсередини сервера', 'GET /api/_healthcheck van binnenuit'],
    doel: ['Те саме опитування, яким інсталятор перевіряє нову версію перед тим, як залишити її активною.', 'Dezelfde peiling waarmee het installatiescript een nieuwe versie controleert voordat het haar actief laat.'],
    gezond: ['HTTP 200 за долі секунди.', 'HTTP 200 binnen een fractie van een seconde.'],
    fouten: [{ teken: ['HTTP 5xx або тайм-аут', 'HTTP 5xx of time-out'], betekenis: ['Сайт працює з помилкою або перезапускається. Зачекайте 30 с і повторіть; якщо не минає — відкат на попередній реліз.', 'De site geeft een fout of herstart. Wacht 30 s en probeer opnieuw; blijft het zo, dan terugdraaien naar de vorige release.'] }],
    ssh: 'curl -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:8080/api/_healthcheck' },
  { id: 'releases', groep: 'diensten', pictogram: 'release', bron: 'live',
    titel: ['Релізи на сервері', 'Releases op de server'], kort: ['Яка версія активна, які є для відкату', 'Welke versie actief is, welke er voor terugdraaien zijn'],
    doel: ['Показує активну версію (current) і попередні релізи, до яких можна відкотитися.', 'Toont de actieve versie (current) en de vorige releases waarnaar u kunt terugdraaien.'],
    gezond: ['current вказує на найновіший реліз; є щонайменше ще один попередній.', 'current wijst naar de nieuwste release; er is minstens één vorige.'],
    fouten: [{ teken: ['Лише один реліз', 'Maar één release'], betekenis: ['Відкотитися нікуди — після наступного встановлення залишиться запасний.', 'Er is niets om naar terug te draaien — na de volgende installatie is er weer een reserve.'] }],
    ssh: 'ls -1t /srv/mijn-ruimte/releases | head; readlink /srv/mijn-ruimte/current' },
  { id: 'database', groep: 'diensten', pictogram: 'database', bron: 'database',
    titel: ['База даних і міграції', 'Database en migraties'], kort: ['Зв’язок і остання міграція', 'Verbinding en laatste migratie'],
    doel: ['Чи відповідає база, яка міграція була застосована останньою і скільки їх.', 'Of de database antwoordt, welke migratie het laatst is toegepast en hoeveel er zijn.'],
    gezond: ['Відповідь за мілісекунди; остання міграція збігається з найновішою у випуску.', 'Antwoord in milliseconden; de laatste migratie is de nieuwste van de release.'],
    fouten: [{ teken: ['Немає відповіді', 'Geen antwoord'], betekenis: ['Сайт втратив зв’язок з PostgreSQL — встановлення і міграції неможливі.', 'De site heeft geen verbinding met PostgreSQL — installeren en migreren kan niet.'] }],
    ssh: null },
  { id: 'voorstellen', groep: 'pakketten', pictogram: 'pakket', bron: 'database',
    titel: ['Завантажені пакети', 'Geüploade pakketten'], kort: ['Кількість за статусами і останні вісім', 'Aantallen per status en de laatste acht'],
    doel: ['Огляд пропозицій оновлень у базі: що чекає схвалення, що схвалено, що відхилено.', 'Overzicht van updatevoorstellen in de database: wat wacht, is goedgekeurd of afgewezen.'],
    gezond: ['Схвалені пакети швидко переходять у «встановлено».', 'Goedgekeurde pakketten gaan snel naar «geïnstalleerd».'],
    fouten: [{ teken: ['«goedgekeurd» довго', '«goedgekeurd» blijft lang staan'], betekenis: ['Root не відповів: перевірте «Ланцюг встановлення».', 'Root antwoordde niet: controleer de «Installatieketen».'] }],
    ssh: null },
  { id: 'uploads-map', groep: 'pakketten', pictogram: 'map', bron: 'live',
    titel: ['Тека завантажень', 'Uploadmap'], kort: ['Файли пропозицій і їхній розмір', 'Voorstelbestanden en hun grootte'],
    doel: ['Скільки місця займають завантажені пакети і чи не застрягли напівзавантажені файли.', 'Hoeveel ruimte de geüploade pakketten innemen en of er halve uploads blijven liggen.'],
    gezond: ['Кілька файлів, загальний розмір у межах сотень МБ.', 'Een paar bestanden, totaal enkele honderden MB.'],
    fouten: [{ teken: ['Багато старих файлів', 'Veel oude bestanden'], betekenis: ['Старі пакети можна скасувати у «Історії» — вони займають диск.', 'Oude pakketten kunnen in de «Geschiedenis» worden geannuleerd — ze nemen schijfruimte in.'] }],
    ssh: 'ls -la /srv/data/uploads/uitrol-voorstellen' },
  { id: 'statusmap', groep: 'pakketten', pictogram: 'map', bron: 'live',
    titel: ['Тека статусу root', 'Statusmap van root'], kort: ['Файли, які пише root, і їхній вік', 'Bestanden die root schrijft en hun leeftijd'],
    doel: ['Сайт читає прогрес і журнали встановлення саме звідси. Якщо тека нечитна — на сторінці не буде терміналу.', 'De site leest voortgang en installatielogboeken hier. Is de map onleesbaar, dan blijft het terminal leeg.'],
    gezond: ['Є status.json, stappen.jsonl, diagnose.json; diagnose.json свіжий.', 'status.json, stappen.jsonl en diagnose.json bestaan; diagnose.json is vers.'],
    fouten: [{ teken: ['Теки немає / немає доступу', 'Map ontbreekt / geen toegang'], betekenis: ['Права мають бути root:mijnruimte 0750. Виправляє встановлення нового випуску.', 'Rechten moeten root:mijnruimte 0750 zijn. Het installeren van een nieuwe release herstelt dat.'] }],
    ssh: 'ls -la /var/lib/mijn-ruimte-uitrol-status' },
  { id: 'stappen-recent', groep: 'pakketten', pictogram: 'stappen', bron: 'live',
    titel: ['Останні кроки root', 'Laatste stappen van root'], kort: ['Хвіст stappen.jsonl', 'Staart van stappen.jsonl'],
    doel: ['Кроки, які root записав під час останніх встановлень (отримано, копія, автентичність, вміст, установка).', 'De stappen die root bij de laatste installaties schreef (ontvangen, kopie, echtheid, inhoud, installeren).'],
    gezond: ['Останній рядок — «klaar» (готово) з відсотком 100.', 'De laatste regel is «klaar» met 100 procent.'],
    fouten: [{ teken: ['Ряд обривається на «installeren»', 'De rij stopt bij «installeren»'], betekenis: ['Встановлення перервалось: дивіться «Інсталяційний журнал».', 'De installatie is onderbroken: zie het «Installatielogboek».'] }],
    ssh: 'tail -n 20 /var/lib/mijn-ruimte-uitrol-status/stappen.jsonl' },
  { id: 'installatielog', groep: 'pakketten', pictogram: 'journaal', bron: 'live',
    titel: ['Інсталяційний журнал', 'Installatielogboek'], kort: ['Хвіст installeer.log', 'Staart van installeer.log'],
    doel: ['Повний вивід installeer-app.sh: збірка, міграції, перезапуск, перевірка здоров’я.', 'De volledige uitvoer van installeer-app.sh: bouwen, migraties, herstart, gezondheidscontrole.'],
    gezond: ['Закінчується «[installeer] klaar: release …».', 'Eindigt met «[installeer] klaar: release …».'],
    fouten: [{ teken: ['«terugdraaien» / «ROLLBACK»', '«terugdraaien» / «ROLLBACK»'], betekenis: ['Нова версія не пройшла перевірку, сервер автоматично повернув попередню.', 'De nieuwe versie haalde de controle niet; de server draaide automatisch de vorige terug.'] }],
    ssh: 'tail -n 60 /var/lib/mijn-ruimte-uitrol-status/installeer.log' },
  { id: 'schijf', groep: 'server', pictogram: 'schijf', bron: 'live-of-root',
    titel: ['Вільне місце на диску', 'Vrije schijfruimte'], kort: ['df для ключових тек', 'df voor de belangrijke mappen'],
    doel: ['Збірка (npm ci + vite) і резервна копія бази потребують місця; при нестачі встановлення зупиняється.', 'Het bouwen (npm ci + vite) en de databaseback-up hebben ruimte nodig; zonder valt de installatie stil.'],
    gezond: ['Вільно понад 2 ГБ (мінімум 800 МБ).', 'Meer dan 2 GB vrij (minimaal 800 MB).'],
    fouten: [{ teken: ['Використано понад 90 %', 'Meer dan 90 % in gebruik'], betekenis: ['Видаліть старі релізи/резервні копії, інакше наступне встановлення не вдасться.', 'Verwijder oude releases/back-ups, anders mislukt de volgende installatie.'] }],
    ssh: 'df -h /srv/mijn-ruimte /var/lib/mijn-ruimte-uitrol-status /tmp' },
  { id: 'geheugen', groep: 'server', pictogram: 'geheugen', bron: 'live',
    titel: ['Пам’ять', 'Geheugen'], kort: ['free -m', 'free -m'],
    doel: ['Збірка фронтенду витрачає багато пам’яті; на малому сервері може бути вбита системою.', 'Het bouwen van de frontend verbruikt veel geheugen; op een kleine server kan het door het systeem worden gestopt.'],
    gezond: ['«available» понад 500 МБ; swap майже не використовується.', '«available» meer dan 500 MB; swap nauwelijks gebruikt.'],
    fouten: [{ teken: ['available < 200 МБ', 'available < 200 MB'], betekenis: ['Збірка ризикує «Killed» (OOM). Зачекайте або зупиніть зайві програми.', 'Het bouwen kan «Killed» (OOM) worden. Wacht of stop overbodige programma’s.'] }],
    ssh: 'free -h' },
  { id: 'belasting', groep: 'server', pictogram: 'belasting', bron: 'live',
    titel: ['Навантаження і час роботи', 'Belasting en uptime'], kort: ['uptime', 'uptime'],
    doel: ['Скільки сервер працює без перезавантаження і наскільки він завантажений.', 'Hoe lang de server draait zonder herstart en hoe zwaar hij belast is.'],
    gezond: ['load average нижче за кількість ядер.', 'load average lager dan het aantal cores.'],
    fouten: [{ teken: ['load average значно більший за кількість ядер', 'load average veel hoger dan het aantal cores'], betekenis: ['Сервер перевантажений — встановлення йтиме повільно або перерветься.', 'De server is overbelast — de installatie gaat traag of breekt af.'] }],
    ssh: 'uptime' },
];

export const CHECK_IDS: ReadonlyArray<string> = CHECKS.map((c) => c.id);
export const checkInfo = (id: string): CheckInfo | undefined => CHECKS.find((c) => c.id === id);

export type CheckStatus = 'ok' | 'let-op' | 'fout' | 'info';
/** Antwoord van POST /api/owner/uitrol/diagnose/uitvoeren. */
export type CheckUitslag = {
  id: string; status: CheckStatus;
  /** live = nu uitgevoerd op de server; root-momentopname = uit diagnose.json van root (leeftijdSec); database; app. */
  bron: 'live' | 'root-momentopname' | 'database' | 'app';
  leeftijdSec?: number; duurMs: number; afgekapt: boolean; uitvoer: string;
  samenvatting: Tekst; tijd: string;
};
