// Alle uitkomst- en weigercodes van de uitrolketen met een leesbare titel (uk/nl) en, waar zinvol, wat de gebruiker kan doen.
// Bron van de codes: deploy/uitrol/mijn-ruimte-uitrol.sh (weiger/status/gebeurtenis), deploy/gitops/gitops-ophalen.sh,
// deploy/uitrol/mijn-ruimte-nazorg.sh, deploy/installeer-app.sh (noteer_ssh), deploy/goedkeuring/goedkeur-hulp.mjs + webauthn-kern.mjs
// (de passkey-controle van root; die codes komen via `weiger <code>` in de status) en de app zelf (RUN_STIL, GEEN_UITKOMST, …).
//
// Audit 18.10.2026, punt 2: «усі можливі причини відмови мають мати переклад у інтерфейсі, а не показуватися голим кодом».
// tests/eenheid/uitrol-codes.test.ts leest de scripts en faalt zodra een code in een script staat die hier ontbreekt — wie een nieuwe
// `weiger NIEUWE_CODE` toevoegt, moet hem dus ook hier vertalen.
export type UitrolCode = { uk: string; nl: string; doenUk?: string; doenNl?: string };

const passkeyTechnisch = (code: string): UitrolCode => ({
  uk: `Дані passkey пошкоджені або непідтримувані (${code})`, nl: `Passkey-gegevens beschadigd of niet ondersteund (${code})`,
  doenUk: 'Схваліть ще раз з того самого пристрою; якщо повторюється — додайте passkey заново у «Налаштування».',
  doenNl: 'Keur opnieuw goed vanaf hetzelfde apparaat; blijft het, voeg de passkey dan opnieuw toe in «Налаштування».',
});
const opnieuwPakket = { doenUk: 'Виправте пакет і завантажте його ще раз (див. deploy/REGELS-UITROLPAKKET.md).', doenNl: 'Herstel het pakket en upload het opnieuw (zie deploy/REGELS-UITROLPAKKET.md).' };
const opnieuwGoedkeuren = { doenUk: 'Схваліть пакет ще раз своїм passkey.', doenNl: 'Keur het pakket opnieuw goed met uw passkey.' };
const viaSsh = { doenUk: 'Потрібне втручання на сервері через SSH (див. RUNBOOK-VEILIGE-UITROL.md).', doenNl: 'Ingrijpen op de server via SSH is nodig (zie RUNBOOK-VEILIGE-UITROL.md).' };

export const UITROL_CODES: Readonly<Record<string, UitrolCode>> = Object.freeze({
  // ---- uitkomsten
  OK: { uk: 'Готово', nl: 'Klaar' },
  GOEDGEKEURD: { uk: 'Схвалено', nl: 'Goedgekeurd' },
  GEWEIGERD: { uk: 'Сервер відмовив', nl: 'Door de server geweigerd' },
  CONTROLE: { uk: 'Перевірка пакета', nl: 'Pakket wordt gecontroleerd' },
  INSTALLEREN: { uk: 'Встановлення', nl: 'Installeren' },
  EXPORT: { uk: 'Експорт з GitOps', nl: 'Export uit GitOps' },
  WACHT: { uk: 'Очікує', nl: 'Wacht' },
  UIT: { uk: 'Вимкнено на сервері', nl: 'Uitgeschakeld op de server', doenUk: 'Увімкнення — лише власником через SSH.', doenNl: 'Aanzetten kan alleen de eigenaar via SSH.' },
  GEEN_NIEUWE: { uk: 'Нових випусків немає', nl: 'Geen nieuwe releases' },
  INSTALLATIE_MISLUKT: { uk: 'Встановлення не вдалося', nl: 'Installatie mislukt', doenUk: 'Попередній випуск лишився активним. Причину й контекст показано нижче; виправте помилку й зберіть новий пакет.', doenNl: 'De vorige release blijft actief. Oorzaak en context staan hieronder; herstel de fout en bouw een nieuw pakket.' },
  AFGEBROKEN: { uk: 'Перервано внутрішньою помилкою сервера', nl: 'Afgebroken door een interne serverfout', doenUk: 'Нічого не встановлено. Відкрийте журнал і «Діагностика»; потім повторіть завантаження.', doenNl: 'Er is niets geïnstalleerd. Open het logboek en «Діагностика»; upload daarna opnieuw.' },
  ONDERBROKEN: { uk: 'Перервано ззовні (зупинка, тайм-аут)', nl: 'Van buitenaf onderbroken (gestopt, timeout)', doenUk: 'Попередній випуск лишився активним. Повторіть завантаження; якщо тайм-аут повторюється — перевірте вільну памʼять і диск.', doenNl: 'De vorige release blijft actief. Upload opnieuw; herhaalt de timeout zich, controleer dan geheugen en schijf.' },
  RUN_STIL: { uk: 'Сервер не повідомив результат', nl: 'De server meldde geen uitkomst', doenUk: 'Сервер довго не писав нічого (можливо, вимкнення живлення або OOM). Див. «Діагностика».', doenNl: 'De server schreef lange tijd niets (mogelijk stroomuitval of OOM). Zie «Діагностика».' },
  GEEN_UITKOMST: { uk: 'Немає результату після схвалення', nl: 'Geen uitkomst na goedkeuring', doenUk: 'Сервер не підхопив пакет вчасно. Див. «Діагностика» (path-юніт, служба, блокування).', doenNl: 'De server pakte het pakket niet op tijd op. Zie «Діагностика» (path-unit, dienst, vergrendeling).' },
  VOORCONTROLE_MISLUKT: { uk: 'Попередня перевірка не пройдена', nl: 'Voorcontrole niet geslaagd', ...opnieuwPakket },

  // ---- pogingen die niet tot een installatie kwamen (migratie 0081, eigenaar 20.10.2026)
  // Eerlijk onbekend: de browser meldde niets meer. Dit mag nooit op een bekende oorzaak lijken.
  ZONDER_REDEN: {
    uk: 'Обірвано без причини — вкладку закрито або зникла мережа. Сайт більше нічого не знає: браузер не встиг повідомити код.',
    nl: 'Afgebroken zonder reden — het tabblad werd gesloten of het netwerk verdween. De site weet niets meer: de browser kon geen code meer melden.',
    doenUk: 'Оберіть той самий файл ще раз: якщо сервер уже має частину, завантаження продовжиться з місця зупинки; відсоток видно в історії.',
    doenNl: 'Kies hetzelfde bestand opnieuw: heeft de server al een deel, dan gaat de upload verder waar hij stopte; het percentage staat in de geschiedenis.',
  },
  UPLOAD_NIET_VOLTOOID: {
    uk: 'Завантаження не завершено: сервер отримав лише частину пакета й більше не отримував нічого.',
    nl: 'De upload is niet afgemaakt: de server kreeg maar een deel van het pakket en daarna niets meer.',
    doenUk: 'Оберіть той самий файл ще раз — завантаження продовжиться з місця зупинки. Якщо файл змінився, зберіть пакет заново.',
    doenNl: 'Kies hetzelfde bestand opnieuw — de upload gaat verder waar hij stopte. Is het bestand gewijzigd, bouw het pakket dan opnieuw.',
  },
  UPLOAD_STIL: {
    uk: 'Завантаження спинилося: понад 30 хв сервер не отримував нових частин, тому пакет закрито як незавершений.',
    nl: 'De upload viel stil: de server kreeg meer dan 30 minuten geen nieuwe stukken, daarom is het pakket als onvoltooid afgesloten.',
    doenUk: 'Оберіть той самий файл ще раз і не закривайте вкладку, доки триває завантаження.',
    doenNl: 'Kies hetzelfde bestand opnieuw en sluit het tabblad niet zolang de upload loopt.',
  },
  UPLOAD_TE_OUD: {
    uk: 'Завантаження почалося понад добу тому й так і не завершилося, тому пакет закрито.',
    nl: 'De upload begon meer dan een etmaal geleden en is nooit afgemaakt, daarom is het pakket afgesloten.',
    doenUk: 'Зберіть пакет із новою версією (UITROL-VERSIE) і завантажте його заново.',
    doenNl: 'Bouw het pakket met een nieuwere versie (UITROL-VERSIE) en upload het opnieuw.',
  },
  GEANNULEERD: { uk: 'Скасовано вручну', nl: 'Handmatig geannuleerd' },
  SSH_OK: { uk: 'Встановлено через SSH', nl: 'Via SSH geïnstalleerd' },
  SSH_TERUG: { uk: 'Відкат через SSH', nl: 'Terugdraaien via SSH' },
  // deploy/installeer-app.sh noteer_mcp_deur: відкат удався, двері MCP (порт 8091) — ні. Terugdraaien gelukt, MCP-deur niet teruggezet.
  MCP_DEUR_NIET_TERUGGEZET: {
    uk: 'Двері MCP (порт 8091) не повернуто після відкату', nl: 'MCP-deur (poort 8091) niet teruggezet na terugdraaien',
    doenUk: 'Сайт уже на попередньому випуску й працює; MCP-конектор може лишатися на іншому. Через SSH перевірте /srv/mijn-ruimte/mcp/server.mjs і unit mijn-ruimte-mcp, далі systemctl daemon-reload && systemctl try-restart mijn-ruimte-mcp. Відкат не повторюйте — він поверне ще давніший випуск.',
    doenNl: 'De site draait al op de vorige release; de MCP-connector mogelijk nog op een andere. Controleer via SSH /srv/mijn-ruimte/mcp/server.mjs en de unit mijn-ruimte-mcp, daarna systemctl daemon-reload && systemctl try-restart mijn-ruimte-mcp. Niet opnieuw terugdraaien — dat zet een nog oudere release terug.',
  },
  NAZORG_TERUGGEDRAAID: { uk: 'Автовідкат після збою', nl: 'Automatisch teruggedraaid na storing' },
  NAZORG_MISLUKT: { uk: 'Автовідкат не вдався', nl: 'Automatisch terugdraaien mislukt', ...viaSsh },
  // ---- rendercontrole (deploy/installeer-app.sh noteer_rook, scripts/rook-controle.mjs; zone A 22.10.2026)
  ROOK_TERUGGEDRAAID: { uk: 'Відкочено автоматично: сторінка не рендериться', nl: 'Automatisch teruggedraaid: pagina rendert niet', doenUk: 'Попередній випуск знову активний. Причина (сторінка, помилка) — у тексті події та в «Діагностика» → «Рендеринг сторінок»; виправте й зберіть новий пакет.', doenNl: 'De vorige release is weer actief. De oorzaak (pagina, fout) staat in de tekst van de gebeurtenis en in «Діагностика» → «Rendering van pagina’s»; herstel en bouw een nieuw pakket.' },
  ROOK_MISLUKT: { uk: 'Сторінки не рендеряться, відкат неможливий', nl: 'Pagina’s renderen niet, terugdraaien onmogelijk', ...viaSsh },
  ROOK_KAPOT: { uk: 'Рендер-контроль: сторінка не рендериться', nl: 'Rendercontrole: pagina rendert niet', doenUk: 'Ручна або планова перевірка знайшла білу сторінку; відкат не виконувався. Див. «Діагностика» → «Рендеринг сторінок».', doenNl: 'Een handmatige of geplande controle vond een witte pagina; er is niet teruggedraaid. Zie «Діагностика» → «Rendering van pagina’s».' },
  ROOK_WAARSCHUWING: { uk: 'Рендер-контроль: попередження', nl: 'Rendercontrole: waarschuwing' },
  // ---- besluiten van de eigenaar met passkey (deploy/goedkeuring/goedkeur-hulp.mjs verifieer-besluit, deploy/besluit/mijn-ruimte-besluit.sh; zone B 22.10.2026, §15)
  BESLUIT_ONGELDIG: { uk: 'Файл рішення пошкоджений або невідомого типу', nl: 'Besluitbestand beschadigd of van onbekend soort' },
  BESLUIT_INHOUD_ONGELDIG: { uk: 'Вміст рішення не пройшов перевірку', nl: 'Inhoud van het besluit ongeldig', doenUk: 'Випуск або хост у недопустимій формі; відкрийте майстер заново.', doenNl: 'Release of host in een onjuiste vorm; open de wizard opnieuw.' },
  BESLUITHASH_ONGELDIG: { uk: 'Хеш рішення у challenge недійсний', nl: 'Besluithash in de challenge ongeldig' },
  BESLUIT_UIT: { uk: 'Цей тип рішення вимкнено на сервері', nl: 'Dit soort besluit staat uit op de server', doenUk: 'У /etc/mijn-ruimte/mcp-rechten.json стоїть «…-passkey»: false; змінити можна лише через SSH.', doenNl: 'In /etc/mijn-ruimte/mcp-rechten.json staat «…-passkey»: false; wijzigen kan alleen via SSH.' },
  BESLUIT_HASH_VERSCHILT: { uk: 'Вміст рішення змінено після підпису', nl: 'Inhoud van het besluit na het ondertekenen gewijzigd', doenUk: 'Root відмовив: підпишіть рішення заново.', doenNl: 'Root weigerde: onderteken het besluit opnieuw.' },
  BESLUIT_TERUGDRAAIEN_OK: { uk: 'Відкат за рішенням власника (passkey)', nl: 'Teruggedraaid op besluit van de eigenaar (passkey)' },
  BESLUIT_EXTERNE_HOSTS_OK: { uk: 'Білий список зовнішніх MCP-хостів оновлено (passkey)', nl: 'Witte lijst van externe MCP-hosts bijgewerkt (passkey)' },
  // ORCH-001 етап 3: root зафіксував підтвердження правил координації агентів (застосунок застосовує їх у git-гілці).
  BESLUIT_ORCH_REGELS_OK: { uk: 'Правила координації агентів підтверджено власником (passkey)', nl: 'Coördinatieregels van de agenten bevestigd door de eigenaar (passkey)' },
  BESLUIT_TERUGDRAAIEN_MISLUKT: { uk: 'Відкат за рішенням власника не вдався', nl: 'Terugdraaien op besluit van de eigenaar mislukt', ...viaSsh },
  BESLUIT_STAND_VERANDERD: { uk: 'Рішення застаріло: активний випуск уже інший', nl: 'Besluit verouderd: de actieve release is al een andere' },
  BESLUIT_RELEASE_ONBEKEND: { uk: 'Випуск відсутній або неповний', nl: 'Release ontbreekt of is onvolledig' },
  BESLUIT_TE_SNEL: { uk: 'Повторний відкат відхилено (ліміт 10 хв)', nl: 'Opnieuw terugdraaien geweigerd (limiet 10 min)' },
  BESLUIT_RECHTEN: { uk: 'Файл перемикачів пошкоджений або має неправильні права', nl: 'Schakelaarbestand beschadigd of met onjuiste rechten', ...viaSsh },
  BESLUIT_CONTROLE: { uk: 'Внутрішня помилка root-скрипта рішень', nl: 'Interne fout in het root-script voor besluiten', ...viaSsh },

  // ---- weigeringen door root (mijn-ruimte-uitrol.sh)
  GOEDKEURING_ONTBREEKT: { uk: 'Немає файлу схвалення passkey', nl: 'Goedkeuringsbestand ontbreekt', ...opnieuwGoedkeuren },
  SIG_ONTBREEKT: { uk: 'Немає підпису пакета (.sig)', nl: 'Handtekening (.sig) ontbreekt', doenUk: 'Підпишіть пакет ключем випуску (maak-uitrolpakket) або завантажте його через сайт і схваліть passkey.', doenNl: 'Onderteken het pakket met de uitrolsleutel (maak-uitrolpakket) of upload het via de site en keur goed met een passkey.' },
  SYMLINK: { uk: 'Пакет у inbox є символьним посиланням', nl: 'Het pakket in de inbox is een symlink', ...opnieuwPakket },
  KOPIE: { uk: 'Не вдалося скопіювати пакет', nl: 'Kopiëren van het pakket mislukt', doenUk: 'Перевірте вільне місце на диску («Діагностика») і повторіть.', doenNl: 'Controleer de vrije schijfruimte («Діагностика») en probeer opnieuw.' },
  TE_GROOT: { uk: 'Пакет завеликий', nl: 'Pakket te groot', doenUk: 'Не додавайте node_modules, dist, звіти й медіа до пакета.', doenNl: 'Laat node_modules, dist, rapporten en media uit het pakket.' },
  GOEDKEURING_ONGELDIG: { uk: 'Файл схвалення пошкоджений', nl: 'Goedkeuringsbestand beschadigd', ...opnieuwGoedkeuren },
  SIG_ONGELDIG: { uk: 'Підпис має неправильний розмір', nl: 'Handtekening heeft een onjuiste grootte', ...opnieuwPakket },
  GEEN_SLEUTEL: { uk: 'На сервері немає ключа випуску', nl: 'Geen uitrolsleutel op de server', ...viaSsh },
  SLEUTEL_EIGENAAR: { uk: 'Файл ключів не належить root', nl: 'Sleutelbestand is niet van root', ...viaSsh },
  SLEUTEL_RECHTEN: { uk: 'Файл ключів доступний для запису іншим', nl: 'Sleutelbestand is schrijfbaar voor anderen', ...viaSsh },
  GEEN_SSH_KEYGEN: { uk: 'На сервері немає ssh-keygen', nl: 'ssh-keygen ontbreekt op de server', ...viaSsh },
  HANDTEKENING_ONGELDIG: { uk: 'Підпис недійсний', nl: 'Ongeldige handtekening', doenUk: 'Пакет змінено після підпису або підписано чужим ключем. Зберіть і підпишіть заново.', doenNl: 'Het pakket is na ondertekenen gewijzigd of met een andere sleutel ondertekend. Bouw en onderteken opnieuw.' },
  INHOUD_ONVEILIG: { uk: 'Архів містить недозволені елементи', nl: 'Archief bevat niet-toegestane onderdelen', doenUk: 'Приберіть символьні посилання, пристрої й шляхи поза текою; збирайте git archive.', doenNl: 'Verwijder symlinks, apparaten en paden buiten de map; bouw met git archive.' },
  GEEN_VERSIE: { uk: 'У пакеті немає UITROL-VERSIE', nl: 'UITROL-VERSIE ontbreekt', ...opnieuwPakket },
  VERSIE_VERSCHILT: { uk: 'Версія не збігається', nl: 'Versie wijkt af', ...opnieuwPakket },
  NIET_NIEUWER: { uk: 'Версія не новіша за встановлену', nl: 'Versie niet nieuwer dan geïnstalleerd', doenUk: 'Зберіть пакет з новою версією (дата й час збирання). Відкат — лише через SSH.', doenNl: 'Bouw een pakket met een nieuwere versie (datum en tijd van bouwen). Terugdraaien kan alleen via SSH.' },
  GEEN_INSTALLER: { uk: 'У пакеті немає deploy/installeer-app.sh', nl: 'deploy/installeer-app.sh ontbreekt', ...opnieuwPakket },
  GEEN_AUTEUR: { uk: 'У пакеті немає AUTEUR', nl: 'AUTEUR ontbreekt', ...opnieuwPakket },
  AUTEUR_ONGELDIG: { uk: 'AUTEUR закороткий', nl: 'AUTEUR te kort', ...opnieuwPakket },
  GEEN_AGENT: { uk: 'У пакеті немає AGENT', nl: 'AGENT ontbreekt', ...opnieuwPakket },
  AGENT_ONGELDIG: { uk: 'AGENT має неправильний формат', nl: 'AGENT heeft een ongeldige vorm', ...opnieuwPakket },
  GEEN_MANIFEST: { uk: 'У пакеті немає UITROL-MANIFEST.json (опис uk+nl, учасники)', nl: 'UITROL-MANIFEST.json ontbreekt (beschrijving uk+nl, deelnemers)', ...opnieuwPakket },
  MANIFEST_ONGELDIG: { uk: 'UITROL-MANIFEST.json неповний або неправильний', nl: 'UITROL-MANIFEST.json onvolledig of ongeldig', ...opnieuwPakket },
  GEEN_SAMENVATTING: { uk: 'У пакеті немає SAMENVATTING', nl: 'SAMENVATTING ontbreekt', ...opnieuwPakket },
  SAMENVATTING_TE_KORT: { uk: 'SAMENVATTING закороткий', nl: 'SAMENVATTING te kort', ...opnieuwPakket },
  // ---- ORCH-001 (31.10.2026): basis, regels en modus van het pakket (deploy/uitrol/mijn-ruimte-uitrol.sh, gitops-ophalen.sh)
  BASIS_ONGELDIG: { uk: 'UITROL-BASIS у пакеті неповний', nl: 'UITROL-BASIS in het pakket is onvolledig', doenUk: 'Збирайте пакет через node scripts/orch.mjs pakket — він сам пише versie= і commit= встановленої бази.', doenNl: 'Bouw het pakket met node scripts/orch.mjs pakket — dat schrijft versie= en commit= van de geïnstalleerde basis zelf.' },
  BASIS_VEROUDERD: { uk: 'Пакет зібрано на застарілій базі', nl: 'Pakket gebouwd op een verouderde basis', doenUk: 'На сервері вже стоїть новіша версія. Перебазуйте зміни на встановлену версію (git rebase на integratie), повторіть тести й зберіть знову.', doenNl: 'Op de server staat al een nieuwere versie. Rebase op de geïnstalleerde versie (git rebase op integratie), test opnieuw en bouw opnieuw.' },
  BASIS_COMMIT_VERSCHILT: { uk: 'Базовий commit пакета не збігається зі встановленим', nl: 'Basiscommit van het pakket is niet de geïnstalleerde', doenUk: 'Код на сервері відрізняється від того, від якого працював агент. Звірте orchestratie/geinstalleerd.json з сервером і перебазуйтесь.', doenNl: 'De code op de server verschilt van waar de agent van vertrok. Vergelijk orchestratie/geinstalleerd.json met de server en rebase.' },
  GEEN_BASIS: { uk: 'У пакеті немає UITROL-BASIS', nl: 'UITROL-BASIS ontbreekt', doenUk: 'Для нових випусків обовʼязково: збирайте через node scripts/orch.mjs pakket або задайте BASIS_VERSIE і BASIS_COMMIT при maak-voorstelpakket.sh.', doenNl: 'Verplicht voor nieuwe releases: bouw met node scripts/orch.mjs pakket of geef BASIS_VERSIE en BASIS_COMMIT aan maak-voorstelpakket.sh.' },
  REGELS_NIET_VERGRENDELD: { uk: 'Правила в пакеті не збігаються з lock', nl: 'Regels in het pakket wijken af van de lock', doenUk: 'Підвищте regelsVersie в orchestratie/beleid.json, додайте рішення в BESLUITEN.md, виконайте node scripts/orch.mjs vergrendel і зберіть знову.', doenNl: 'Verhoog regelsVersie in orchestratie/beleid.json, voeg een besluit toe in BESLUITEN.md, voer node scripts/orch.mjs vergrendel uit en bouw opnieuw.' },
  MODUS_NIET_TOEGESTAAN: { uk: 'Режим встановлення не дозволений політикою', nl: 'Installatiemodus niet toegestaan door het beleid', doenUk: 'Автоматичний режим (GitOps) потребує «automatisch_beperkt» у kritiek.installatieModi і підпису власника в regels.lock.json. Встановіть через підтвердження passkey або вручну.', doenNl: 'Automatische modus (GitOps) vraagt «automatisch_beperkt» in kritiek.installatieModi en de handtekening van de eigenaar in regels.lock.json. Installeer via passkey-bevestiging of handmatig.' },
  GEEN_BRON_COMMIT: { uk: 'Немає дійсного BRON-COMMIT', nl: 'Geen geldige BRON-COMMIT', doenUk: 'Збирайте пакет з git (maak-voorstelpakket.sh / maak-uitrolpakket.sh пишуть коміт самі) або вкажіть явно --zonder-git "причина".', doenNl: 'Bouw het pakket vanuit git (maak-voorstelpakket.sh / maak-uitrolpakket.sh schrijven de commit zelf) of geef uitdrukkelijk --zonder-git "reden".' },

  // ---- passkey-hulp (webauthn-kern.mjs): SSH-CA-goedkeuring met een onbekende actie (alleen «voorbereiden»/«aanzetten» zijn geldig)
  ACTIE_ONGELDIG: { uk: 'Невідома дія для SSH-сертифікатів', nl: 'Onbekende actie voor SSH-certificaten', doenUk: 'Оновіть сторінку «SSH-сертифікати» і повторіть дію; підтвердження passkey діє лише для «Підготувати» або «Увімкнути».', doenNl: 'Vernieuw de pagina «SSH-certificaten» en herhaal de actie; de passkey-bevestiging geldt alleen voor «Voorbereiden» of «Aanzetten».' },
  // ---- GitOps (gitops-ophalen.sh)
  ENV_RECHTEN: { uk: 'gitops.env має неправильні права', nl: 'gitops.env heeft verkeerde rechten', ...viaSsh },
  REPO_ONGELDIG: { uk: 'Неправильна адреса репозиторію GitOps', nl: 'Ongeldig GitOps-repository-adres', ...viaSsh },
  TOKEN_ONGELDIG: { uk: 'Ключ доступу GitOps недійсний', nl: 'GitOps-toegangssleutel ongeldig', ...viaSsh },
  KNOWN_HOSTS: { uk: 'Немає відомого ключа сервера GitHub', nl: 'Bekende hostsleutel van GitHub ontbreekt', ...viaSsh },
  OPHALEN_MISLUKT: { uk: 'Не вдалося отримати теги з GitHub', nl: 'Ophalen van tags uit GitHub mislukt', doenUk: 'Перевірте мережу сервера й ключ доступу; наступна спроба — автоматично.', doenNl: 'Controleer het netwerk van de server en de toegangssleutel; de volgende poging gaat vanzelf.' },

  // ---- passkey-controle door root (goedkeur-hulp.mjs, webauthn-kern.mjs)
  GEEN_SLEUTELS: { uk: 'На сервері немає passkey власника', nl: 'Geen passkey van de eigenaar op de server', doenUk: 'Додайте passkey у «Налаштування»; перший підтверджується через SSH.', doenNl: 'Voeg een passkey toe in «Налаштування»; de eerste wordt via SSH bevestigd.' },
  SLEUTEL_ONBEKEND: { uk: 'Passkey не зареєстрований на сервері', nl: 'Passkey niet geregistreerd op de server', doenUk: 'Схваліть passkey, що доданий у «Налаштування» і підтверджений сервером.', doenNl: 'Keur goed met een passkey die in «Налаштування» is toegevoegd en door de server bevestigd.' },
  SLEUTELBESTAND_RECHTEN: { uk: 'Файл passkey-ключів має неправильні права', nl: 'Passkey-sleutelbestand heeft verkeerde rechten', ...viaSsh },
  UITDAGING_ONJUIST: { uk: 'Підтвердження для іншого запиту', nl: 'Bevestiging hoort bij een ander verzoek', ...opnieuwGoedkeuren },
  PAKKET_GEWIJZIGD: { uk: 'Пакет змінено після схвалення', nl: 'Pakket gewijzigd na goedkeuring', doenUk: 'Завантажте пакет заново й схваліть ще раз.', doenNl: 'Upload het pakket opnieuw en keur opnieuw goed.' },
  VERLOPEN: { uk: 'Час підтвердження минув', nl: 'Bevestiging verlopen', ...opnieuwGoedkeuren },
  VERLOOPT_TE_LAAT: { uk: 'Термін підтвердження задовгий', nl: 'Geldigheid van de bevestiging te lang', ...opnieuwGoedkeuren },
  VERLOOPT_ONGELDIG: { uk: 'Неправильний термін підтвердження', nl: 'Ongeldige vervaltijd van de bevestiging', ...opnieuwGoedkeuren },
  HERGEBRUIKT: { uk: 'Підтвердження вже використано', nl: 'Bevestiging al gebruikt', ...opnieuwGoedkeuren },
  TELLER_TERUG: { uk: 'Лічильник passkey пішов назад', nl: 'Teller van de passkey ging terug', doenUk: 'Можлива копія ключа. Відкличте цей passkey і додайте новий.', doenNl: 'Mogelijk een gekopieerde sleutel. Trek deze passkey in en voeg een nieuwe toe.' },
  RPID_ONJUIST: { uk: 'Passkey для іншого сайту', nl: 'Passkey hoort bij een andere site', ...opnieuwGoedkeuren },
  ORIGIN_ONJUIST: { uk: 'Підтвердження з іншої адреси', nl: 'Bevestiging van een ander adres', doenUk: 'Схвалюйте лише на admin.tarasevych.com.', doenNl: 'Keur alleen goed op admin.tarasevych.com.' },
  CROSS_ORIGIN: { uk: 'Підтвердження з вбудованої сторінки', nl: 'Bevestiging vanuit een ingesloten pagina', doenUk: 'Відкрийте сайт напряму, не у вбудованому вікні.', doenNl: 'Open de site rechtstreeks, niet in een ingesloten venster.' },
  TYPE_ONJUIST: { uk: 'Неправильний тип підтвердження', nl: 'Verkeerd type bevestiging', ...opnieuwGoedkeuren },
  GEEN_VERIFICATIE: { uk: 'Пристрій не перевірив вас', nl: 'Het apparaat heeft u niet geverifieerd', doenUk: 'Підтвердіть відбитком, обличчям або PIN.', doenNl: 'Bevestig met vingerafdruk, gezicht of pincode.' },
  GEEN_AANWEZIGHEID: { uk: 'Немає підтвердження присутності', nl: 'Geen bevestiging van aanwezigheid', doenUk: 'Торкніться ключа або підтвердьте на пристрої.', doenNl: 'Raak de sleutel aan of bevestig op het apparaat.' },
  EERSTE_SLEUTEL_VIA_SSH: { uk: 'Перший passkey — лише через SSH', nl: 'De eerste passkey alleen via SSH', ...viaSsh },
  TE_VEEL_SLEUTELS: { uk: 'Забагато passkey-ключів', nl: 'Te veel passkey-sleutels' },
  BESTAAT_AL: { uk: 'Passkey уже додано', nl: 'Passkey al toegevoegd' },
  NIET_GEVONDEN: { uk: 'Ключ не знайдено', nl: 'Sleutel niet gevonden' },
  OPNIEUW_VIA_SSH: { uk: 'Повернути право — лише через SSH', nl: 'Recht terugzetten alleen via SSH', ...viaSsh },
  REDEN_ONGELDIG: { uk: 'Потрібна причина', nl: 'Een reden is nodig' },
  GEEN_GEWOON_BESTAND: { uk: 'Очікувався звичайний файл', nl: 'Een gewoon bestand werd verwacht', ...viaSsh },
  DOEL_ONBEKEND: passkeyTechnisch('DOEL_ONBEKEND'), NONCE_ONGELDIG: passkeyTechnisch('NONCE_ONGELDIG'), VOORSTEL_ONGELDIG: passkeyTechnisch('VOORSTEL_ONGELDIG'),
  VERSIE_ONGELDIG: passkeyTechnisch('VERSIE_ONGELDIG'), SHA256_ONGELDIG: passkeyTechnisch('SHA256_ONGELDIG'), VINGERAFDRUK_ONGELDIG: passkeyTechnisch('VINGERAFDRUK_ONGELDIG'),
  BELEIDHASH_ONGELDIG: passkeyTechnisch('BELEIDHASH_ONGELDIG'), CLIENTDATA_ONGELDIG: passkeyTechnisch('CLIENTDATA_ONGELDIG'), CREDENTIAL_ONGELDIG: passkeyTechnisch('CREDENTIAL_ONGELDIG'),
  CREDENTIAL_VERSCHILT: passkeyTechnisch('CREDENTIAL_VERSCHILT'), ATTESTATION_ONGELDIG: passkeyTechnisch('ATTESTATION_ONGELDIG'), SLEUTEL_ONGELDIG: passkeyTechnisch('SLEUTEL_ONGELDIG'),
  SLEUTEL_TE_ZWAK: passkeyTechnisch('SLEUTEL_TE_ZWAK'), B64U_ONGELDIG: passkeyTechnisch('B64U_ONGELDIG'),
  AUTHDATA_COSE: passkeyTechnisch('AUTHDATA_COSE'), AUTHDATA_CREDENTIAL: passkeyTechnisch('AUTHDATA_CREDENTIAL'), AUTHDATA_LENGTE: passkeyTechnisch('AUTHDATA_LENGTE'), AUTHDATA_RESTBYTES: passkeyTechnisch('AUTHDATA_RESTBYTES'),
  CBOR_DUBBELE_SLEUTEL: passkeyTechnisch('CBOR_DUBBELE_SLEUTEL'), CBOR_EINDE: passkeyTechnisch('CBOR_EINDE'), CBOR_NIET_ONDERSTEUND: passkeyTechnisch('CBOR_NIET_ONDERSTEUND'), CBOR_SLEUTEL: passkeyTechnisch('CBOR_SLEUTEL'),
  CBOR_TE_DIEP: passkeyTechnisch('CBOR_TE_DIEP'), CBOR_TE_GROOT: passkeyTechnisch('CBOR_TE_GROOT'),
  COSE_ALG: passkeyTechnisch('COSE_ALG'), COSE_EC2: passkeyTechnisch('COSE_EC2'), COSE_OKP: passkeyTechnisch('COSE_OKP'), COSE_ONGELDIG: passkeyTechnisch('COSE_ONGELDIG'), COSE_RSA: passkeyTechnisch('COSE_RSA'),
  // AI-beleid (zelfde root-hulp; komt in de uitrolgeschiedenis alleen terecht als gebeurtenis van de goedkeuring)
  BELEID_NIET_GESTART: { uk: 'Політику ШІ ще не встановлено', nl: 'AI-beleid nog niet geïnstalleerd', ...viaSsh },
  BELEID_KETEN_ONGELDIG: { uk: 'Ланцюжок версій політики пошкоджено', nl: 'Keten van beleidsversies beschadigd', ...viaSsh },
  VERSIE_VERSCHILT_BELEID: { uk: 'Політику вже змінено іншим підписом', nl: 'Beleid intussen anders ondertekend' },
  ONTWERP_VERLOPEN: { uk: 'Чернетка політики застаріла', nl: 'Beleidsontwerp verouderd' },
  BELEID_ONGELDIG: { uk: 'Чернетка політики недійсна', nl: 'Beleidsontwerp ongeldig' },
  BELEID_EIGENAAR_ALLEEN: { uk: 'Це право не можна видати агентові', nl: 'Dit recht kan niet aan een agent worden gegeven' },
});

const kies = (lang: 'uk' | 'nl', uk: string, nl: string) => (lang === 'uk' ? uk : nl);
/** Titel van een code; een onbekende code blijft zichtbaar als code (nooit een lege tekst). */
export const uitrolCodeTitel = (lang: 'uk' | 'nl', code: string): string => { const t = UITROL_CODES[code]; return t ? kies(lang, t.uk, t.nl) : code; };
/** Wat de gebruiker kan doen (leeg als er niets te doen is of de code onbekend is). */
export const uitrolCodeDoen = (lang: 'uk' | 'nl', code: string): string => { const t = UITROL_CODES[code]; return t?.doenUk ? kies(lang, t.doenUk, t.doenNl || t.doenUk) : ''; };
