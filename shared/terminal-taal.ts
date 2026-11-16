// UI-010 fase 2 → UITROL-002: meldingen in de installatieterminal in de taal van de pagina (uk/nl).
//
// Waarom zo (en niet in de scripts zelf): het logboek in de database blijft het ECHTE, ongewijzigde logboek (kopiëren/downloaden
// geven altijd de originele regels). De vertaling gebeurt alleen bij het tonen, dus de taal wisselt mee zonder de installatie te
// herstarten of de pagina te herladen. Variabelen (paden, versies, codes, getallen) gaan letterlijk mee uit de oorspronkelijke regel.
//
// UITROL-002 (eigenaar 16.11.2026: «термінал показується англійською»): drie bronnen van tekst, drie regels.
//   1. Eigen scripts ([installeer] / [uitrol]): Nederlandse meldingen → uk; Oekraïense meldingen → nl; tweetalige regels
//      («nl-tekst / uk-tekst») tonen alleen de helft in de paginataal.
//   2. Uitvoer van derden (npm, vite, esbuild, systemd-run, psql, tar): de BEKENDE vaste zinnen worden vertaald naar uk én nl
//      («added 1203 packages, and audited 1204 packages in 41s», «✓ built in 12.3s», «Finished with result: success»…).
//      Vrije tekst van derden (foutmeldingen van pakketten, stacktraces) blijft letterlijk: die vertalen zou de oorzaak verdoezelen.
//   3. Onbekende eigen regels: alleen het voorvoegsel (LET OP/FOUT/stap) wordt vertaald, de rest blijft letterlijk.
// Переклад лише при показі; оригінал завжди доступний («оригінал», копіювання, завантаження). Тести: tests/eenheid/terminal-taal.test.ts.
type Uit = string | { uk: string; nl: string };
type Patroon = [RegExp, (m: RegExpMatchArray) => Uit];
const v = (m: RegExpMatchArray, i: number) => m[i] ?? '';
const CYR = /[Ѐ-ӿ]/;

/** «nl-tekst / uk-tekst» (of omgekeerd) → de helft in de gevraagde taal; anders ongewijzigd. */
export function tweetaligeHelft(tekst: string, lang: 'uk' | 'nl'): string | null {
  const i = tekst.indexOf(' / ');
  if (i < 0) return null;
  const a = tekst.slice(0, i), b = tekst.slice(i + 3);
  const aCyr = CYR.test(a), bCyr = CYR.test(b);
  if (aCyr === bCyr) return null;
  const uk = aCyr ? a : b, nl = aCyr ? b : a;
  return lang === 'uk' ? uk : nl;
}

const STAPPEN: Record<string, string> = {
  'PostgreSQL-versie controleren': 'перевірка версії PostgreSQL', 'back-up van de database': 'резервна копія бази даних', databasemigraties: 'міграції бази даних',
  'overschakelen en de dienst herstarten': 'перемикання й перезапуск служби', gezondheidscontrole: 'перевірка роботи сайту', 'ontbrekende geheimen aanmaken': 'створення відсутніх секретів',
  'broncode kopiëren': 'копіювання коду', 'nieuwe migraties proberen op een kopie van het schema': 'проба нових міграцій на копії схеми',
  'npm ci': 'npm ci (встановлення залежностей)', 'npm run build': 'npm run build (збірка)',
};
/** Korte Oekraïense naam per installer-onderdeel (deploy/installeer-app.sh «stap: <id>»); de id blijft tussen haken staan. */
const STAP_NAAM_UK: Record<string, string> = { proef: 'проба міграцій', kopie: 'копіювання коду', npm: 'залежності (npm ci)', bouwen: 'збірка', pgversie: 'версія PostgreSQL', backup: 'резервна копія бази', migraties: 'міграції бази', activeren: 'перемикання служби', gezondheid: 'перевірка роботи сайту', rook: 'димова перевірка', nabewaken: 'нагляд за випуском', gestopt: 'зупинено' };
const stapNaamUk = (id: string) => (STAP_NAAM_UK[id] ? `${STAP_NAAM_UK[id]} [${id}]` : id);
const stapTekst = (t: string) => STAPPEN[t] ?? tweetaligeHelft(t, 'uk') ?? t.replace(/^rendercontrole: (.*)$/, 'перевірка відображення: $1').replace(/^nieuwe release (\S+) s onder toezicht$/, 'новий випуск $1 с під наглядом').replace(/^alleen modules$/, 'лише модулі');

// ---- [installeer] (deploy/installeer-app.sh), nl → uk
const INSTALLEER: Patroon[] = [
  [/^migraties uitvoeren…$/, () => 'виконання міграцій…'],
  [/^back-up vóór migratie…$/, () => 'резервна копія перед міграцією…'],
  [/^back-up mislukt; oorzaak volgens de dienst:$/, () => 'резервна копія не вдалася; причина за словами служби:'],
  [/^back-up mislukt \(2 pogingen\): (.*)$/, (m) => `резервна копія не вдалася (2 спроби): ${v(m, 1)}`],
  [/^bouwen \(npm ci, audit, vite, server-bundel\)…$/, () => 'збірка (npm ci, audit, vite, серверна збірка)…'],
  [/^bouwen mislukt: (.+) ontbreekt$/, (m) => `збірка не вдалася: ${v(m, 1)} відсутній`],
  [/^bouwen mislukt \((.+)\)$/, (m) => `збірка не вдалася (${v(m, 1)})`],
  [/^migratie mislukt; de actieve release is ongewijzigd$/, () => 'міграція не вдалася; активний випуск не змінено'],
  [/^nog één poging over 20 s…$/, () => 'ще одна спроба через 20 с…'],
  [/^veilige uitrol ingericht$/, () => 'безпечне розгортання налаштовано'],
  [/^goedgekeurd: via SSH als root \(zonder passkey\)$/, () => 'схвалено: через SSH як root (без passkey)'],
  [/^map: (.+)$/, (m) => `тека: ${v(m, 1)}`],
  [/^versie in deze map \(UITROL-VERSIE\): (.*?)\s+\|\s+nu actief: (.*)$/, (m) => `версія в цій теці (UITROL-VERSIE): ${v(m, 1)}   |   зараз активна: ${v(m, 2)}`],
  [/^deze map \((.+?)\) is NIET nieuwer dan de actieve versie \((.+?)\)\. Pakte u de juiste map uit\?.*$/, (m) => `ця тека (${v(m, 1)}) НЕ новіша за активну версію (${v(m, 2)}). Ви розпакували правильну теку? Продовжую через 8 с; Ctrl+C — зупинити.`],
  [/^niet-gecommitte wijzigingen in (.+) worden NIET meegenomen \(alleen HEAD\)$/, (m) => `незакомічені зміни в ${v(m, 1)} НЕ беруться (лише HEAD)`],
  [/^bron kopiëren naar (.+)…$/, (m) => `копіювання коду до ${v(m, 1)}…`],
  [/^nabewaking: nieuwe release (\S+) s onder toezicht…$/, (m) => `нагляд: новий випуск ${v(m, 1)} с під наглядом…`],
  [/^nabewaking: (\S+) s stabiel$/, (m) => `нагляд: ${v(m, 1)} с стабільно`],
  [/^nabewaking: de dienst is zelf herstart \(pid (\S+) → (\S+)\)$/, (m) => `нагляд: служба сама перезапустилася (pid ${v(m, 1)} → ${v(m, 2)})`],
  [/^nabewaking: gezondheidscontrole mislukt \((\d+)\/3\)$/, (m) => `нагляд: перевірка роботи сайту не вдалася (${v(m, 1)}/3)`],
  [/^nabewaking mislukt; (.+)$/, (m) => `нагляд не вдався; ${v(m, 1)}`],
  [/^nazorg: (\S+) min lang wordt automatisch teruggedraaid als de site faalt$/, (m) => `нагляд після встановлення: ${v(m, 1)} хв автоматичного відкату, якщо сайт не працюватиме`],
  [/^rendercontrole \((.+)\)…$/, (m) => `перевірка відображення (${stapTekst(v(m, 1))})…`],
  [/^rendercontrole in orde: (.+)$/, (m) => `перевірка відображення в порядку: ${v(m, 1)}`],
  [/^rendercontrole KAPOT: (.+)$/, (m) => `перевірка відображення НЕ ПРОЙДЕНА: ${v(m, 1)}`],
  [/^rendercontrole niet uitgevoerd \(code (\S+)\)$/, (m) => `перевірку відображення не виконано (код ${v(m, 1)})`],
  [/^rendercontrole overgeslagen \(ROOK_UIT=1\)$/, () => 'перевірку відображення пропущено (ROOK_UIT=1)'],
  [/^rendercontrole: geen resultaat \(code (\S+); (.*)\); rendering niet gecontroleerd$/, (m) => `перевірка відображення: немає результату (код ${v(m, 1)}; ${v(m, 2)}); відображення не перевірено`],
  [/^rendercontrole: release (\S+) rendert niet — (.*)$/, (m) => `перевірка відображення: випуск ${v(m, 1)} не відображається — ${v(m, 2)}`],
  [/^rendering van (.+) is NIET gecontroleerd \(zie hierboven\); de release is wel actief$/, (m) => `відображення ${v(m, 1)} НЕ перевірено (див. вище); випуск усе ж активний`],
  [/^ook de vorige release (\S+) rendert niet: (.*)$/, (m) => `попередній випуск ${v(m, 1)} теж не відображається: ${v(m, 2)}`],
  [/^pakketten installeren: (.+)$/, (m) => `встановлення пакетів: ${v(m, 1)}`],
  [/^pakketgegevens: (.+)$/, (m) => `дані пакета: ${v(m, 1)}`],
  [/^automatisch terug naar (.+)$/, (m) => `автоматичний відкат до ${v(m, 1)}`],
  [/^vorige release draait weer$/, () => 'попередній випуск знову працює'],
  [/^ook de vorige release is niet gezond!$/, () => 'попередній випуск теж не працює!'],
  [/^migraties worden NIET teruggedraaid; het databaseschema blijft op de nieuwste stand$/, () => 'міграції НЕ відкочуються; схема бази лишається найновішою'],
  [/^gezondheidscontrole mislukt \((.+?)\); (.+)$/, (m) => `перевірка роботи сайту не вдалася (${v(m, 1)}); ${v(m, 2)}`],
  [/^diepe gezondheidscontrole in orde \(.*\)$/, () => 'глибока перевірка роботи в порядку (технічний простір + технічні файли)'],
  [/^diepe gezondheidscontrole MISLUKT: (.*)$/, (m) => `глибока перевірка роботи НЕ ПРОЙДЕНА: ${v(m, 1)}`],
  [/^diepe gezondheidscontrole niet uitgevoerd \((.*)\)$/, (m) => `глибоку перевірку роботи не виконано (${v(m, 1) === 'geen antwoord' ? 'немає відповіді' : v(m, 1)})`],
  [/^installatie van (\S+) mislukt(?:: rendercontrole — (.*))?$/, (m) => `встановлення ${v(m, 1)} не вдалося${m[2] ? `: перевірка відображення — ${m[2]}` : ''}`],
  [/^actief: (.+)$/, (m) => `активний: ${v(m, 1)}`],
  [/^klaar: release (\S+) \(commit (.+)\)$/, (m) => `готово: випуск ${v(m, 1)} (коміт ${v(m, 2)})`],
  [/^teruggedraaid naar (.+)$/, (m) => `відкочено до ${v(m, 1)}`],
  [/^oude release verwijderd: (.+)$/, (m) => `старий випуск видалено: ${v(m, 1)}`],
  [/^oude onvolledige release verwijderd: (.+)$/, (m) => `стару незавершену теку випуску видалено: ${v(m, 1)}`],
  [/^onvolledige release (\S+) verwijderd$/, (m) => `незавершений випуск ${v(m, 1)} видалено`],
  [/^migratieproef: alle nieuwe migraties slagen op de kopie van het schema$/, () => 'проба міграцій: усі нові міграції проходять на копії схеми'],
  [/^migratieproef overgeslagen \(PROEF_UIT=1\)$/, () => 'пробу міграцій пропущено (PROEF_UIT=1)'],
  [/^migratieproef: script ontbreekt; overgeslagen$/, () => 'проба міграцій: скрипту немає; пропущено'],
  [/^migratieproef niet uitgevoerd \(code (\S+)\); de installatie gaat door met back-up en transactionele migraties$/, (m) => `пробу міграцій не виконано (код ${v(m, 1)}); встановлення триває з резервною копією й транзакційними міграціями`],
  [/^migratieproef ingericht$/, () => 'пробу міграцій налаштовано'],
  [/^archief bewaard: (\S+) \(sha256 (\S+); (.*)\)$/, (m) => `архів збережено: ${v(m, 1)} (sha256 ${v(m, 2)}; ${v(m, 3).replace('geleverd', 'наданий').replace('opnieuw-ingepakt', 'перепакований')})`],
  [/^archief niet bewaard: geen geldige UITROL-VERSIE$/, () => 'архів не збережено: немає чинної UITROL-VERSIE'],
  [/^archief: kopiëren van (.+) mislukt$/, (m) => `архів: копіювання ${v(m, 1)} не вдалося`],
  [/^archief: sha256 van (\S+) \((\S+)\) wijkt af van (\S+) \((\S+)\)$/, (m) => `архів: sha256 файлу ${v(m, 1)} (${v(m, 2)}) не збігається з ${v(m, 3)} (${v(m, 4)})`],
  [/^systemd-units bijgewerkt$/, () => 'юніти systemd оновлено'],
  [/^MCP-deur bijgewerkt en herstart \(mijn-ruimte-mcp\.service, poort 8091\)$/, () => 'MCP-двері оновлено й перезапущено (mijn-ruimte-mcp.service, порт 8091)'],
  [/^mijn-ruimte-mcp\.service \(poort 8091\) kon niet worden herstart$/, () => 'службу mijn-ruimte-mcp.service (порт 8091) не вдалося перезапустити'],
  [/^MCP-deur \(poort 8091\) kon niet worden bijgewerkt .*$/, () => 'MCP-двері (порт 8091) не вдалося оновити (install або daemon-reload не спрацювали) — див. повідомлення вище'],
  [/^naar quarantaine \((.+)\): (.+)$/, (m) => `у карантин (${v(m, 1)}): ${v(m, 2)}`],
  [/^polkit-regel voor mijn-ruimte-opdracht@ geïnstalleerd$/, () => 'правило polkit для mijn-ruimte-opdracht@ встановлено'],
  [/^passkey-goedkeuring ingericht \((.*)\)$/, (m) => `схвалення passkey налаштовано (${v(m, 1)})`],
  [/^besluiten van de eigenaar \(passkey\) ingericht: .*$/, () => 'рішення власника (passkey) налаштовано: відкат і зовнішні MCP-хости із сайту'],
  [/^coördinatie van agenten: werkkopie (.+) aanwezig$/, (m) => `координація агентів: робоча копія ${v(m, 1)} є`],
  [/^coördinatie van agenten: geen werkkopie(.*)$/, (m) => `координація агентів: робочої копії немає${v(m, 1)}`],
  [/^hulp voor de app-rol \(RLS\) geïnstalleerd: (.+?) \(alleen starten via mijn-ruimte-db-rollen\.service\)$/, (m) => `помічник для ролі застосунку (RLS) встановлено: ${v(m, 1)} (запуск лише через mijn-ruimte-db-rollen.service)`],
  [/^hulpscripts bijgewerkt: (.+)$/, (m) => `допоміжні скрипти оновлено: ${v(m, 1)}`],
  [/^archief-hulp bijgewerkt$/, () => 'помічник архівів оновлено'],
  [/^agent op deze server bijgewerkt \((.*)\)$/, (m) => `агент на цьому сервері оновлено (${v(m, 1)})`],
  [/^beheer op afstand ingericht \((.*)\)$/, (m) => `віддалене керування налаштовано (${v(m, 1).replace('GitOps: aan', 'GitOps: увімкнено').replace('GitOps: uit', 'GitOps: вимкнено')})`],
  [/^beleidsdienst OPA uitgezet \((.*)\)$/, (m) => `службу політик OPA вимкнено (${v(m, 1)})`],
  [/^beleidsdienst OPA op (\S+) \(schaduwmodus\)$/, (m) => `служба політик OPA на ${v(m, 1)} (тіньовий режим)`],
  [/^OPA niet geïnstalleerd \(zie hierboven\); de site werkt zonder$/, () => 'OPA не встановлено (див. вище); сайт працює без нього'],
  [/^SSH-CA geïnstalleerd \(.*\)$/, () => 'SSH-CA встановлено (вимкнено: без ключа, перемикач ssh-ca вимкнено, sshd не змінено; див. mijn-ruimte-ssh-ca publiek)'],
  [/^extern bureaublad uit \(.*\); guacd draait niet$/, () => 'віддалений робочий стіл вимкнено (перемикач guacamole в /etc/mijn-ruimte/mcp-rechten.json); guacd не працює'],
  [/^extern bureaublad: guacd via (\S+) op (\S+) \((.*)\)$/, (m) => `віддалений робочий стіл: guacd через ${v(m, 1)} на ${v(m, 2)} (${v(m, 3) === 'nog niet luisterend' ? 'ще не слухає' : v(m, 3)})`],
  [/^server als apparaat: (.*)$/, (m) => `сервер як пристрій: ${v(m, 1)}`],
  [/^server-geheimen onvolledig (.*)$/, (m) => `секрети сервера неповні ${v(m, 1)}`],
  [/^voer dit uit als root \(sudo\)$/, () => 'виконайте це як root (sudo)'],
  [/^er loopt al een installatie$/, () => 'вже триває інше встановлення'],
  [/^(\S+) kon niet worden (gestart|ingeschakeld|herstart)$/, (m) => `${v(m, 1)} не вдалося ${v(m, 2) === 'gestart' ? 'запустити' : v(m, 2) === 'herstart' ? 'перезапустити' : 'увімкнути'}`],
  [/^(\S+) kon niet starten$/, (m) => `${v(m, 1)} не вдалося запустити`],
  [/^(\S+) herstart niet$/, (m) => `${v(m, 1)} не перезапускається`],
  [/^gebeurtenis (\S+) niet geschreven$/, (m) => `подію ${v(m, 1)} не записано`],
  [/^auditregel voor (?:deze installatie|dit terugdraaien) niet geschreven$/, () => 'запис аудиту для цієї дії не записано'],
  [/^geen (?:geldige )?release (?:gevonden|om naar terug te gaan) \((.*)\)$/, (m) => `випуск не знайдено (${v(m, 1)})`],
  [/^(\S+) is al actief$/, (m) => `${v(m, 1)} уже активний`],
  [/^(\S+) bestaat al$/, (m) => `${v(m, 1)} уже існує`],
  [/^release (\S+) start niet gezond; (.*)$/, (m) => `випуск ${v(m, 1)} не запускається справно; ${v(m, 2)}`],
  [/^stap: gestopt \((\d+)%\) зупинено власником \/ gestopt door de eigenaar$/, (m) => `крок: зупинено (${v(m, 1)}%) зупинено власником`],
  [/^gestopt door een signaal \(SIGTERM\) tijdens «(.*?)»; de vorige release blijft actief$/, (m) => `зупинено сигналом (SIGTERM) під час «${v(m, 1)}»; попередній випуск лишився активним`],
  [/^stap: (\S+) \((\d+)%\) ?(.*)$/, (m) => `крок: ${stapNaamUk(v(m, 1))} (${v(m, 2)}%) ${stapTekst(v(m, 3))}`.trimEnd()],
];
// ---- [uitrol] (deploy/uitrol/mijn-ruimte-uitrol.sh), nl → uk
const UITROL: Patroon[] = [
  [/^er loopt al een uitrol$/, () => 'вже виконується інше розгортання'],
  [/^geen pakket in de inbox$/, () => 'у вхідній теці немає пакета'],
  [/^inbox (.+) ontbreekt$/, (m) => `вхідної теки ${v(m, 1)} немає`],
  [/^run (\S+): pakket (\S+) ontvangen \((.+)\)$/, (m) => `запуск ${v(m, 1)}: пакет ${v(m, 2)} отримано (${v(m, 3)})`],
  [/^passkey-goedkeuring geldig voor (.+)$/, (m) => `схвалення passkey дійсне для ${v(m, 1)}`],
  [/^handtekening geldig voor (.+)$/, (m) => `підпис дійсний для ${v(m, 1)}`],
  [/^basis van het pakket: (\S+) @ (\S+) \(geïnstalleerd: (\S+) @ (\S+)\)$/, (m) => `основа пакета: ${v(m, 1)} @ ${v(m, 2)} (встановлено: ${v(m, 3)} @ ${v(m, 4)})`],
  [/^pakket zonder UITROL-BASIS \(oud formaat\) — basisversie en -commit niet gecontroleerd$/, () => 'пакет без UITROL-BASIS (старий формат) — базову версію й коміт не перевірено'],
  [/^regels in het pakket vergrendeld \(lock klopt\) en modus na_bevestiging toegestaan$/, () => 'правила в пакеті зафіксовано (lock збігається), режим na_bevestiging дозволено'],
  [/^archief bewaard: (\S+) \((\d+) bytes, sha256 (\S+)\)$/, (m) => `архів збережено: ${v(m, 1)} (${v(m, 2)} байт, sha256 ${v(m, 3)})`],
  [/^archief: geen kopie om te bewaren$/, () => 'архів: немає копії для збереження'],
  [/^archief: kopiëren mislukt$/, () => 'архів: копіювання не вдалося'],
  [/^archief: niet bewaard \(zie hierboven\); de site kan dit pakket later niet aanbieden om te downloaden$/, () => 'архів: не збережено (див. вище); сайт не зможе пізніше запропонувати цей пакет для завантаження'],
  [/^klaar: (.+)$/, (m) => `готово: ${v(m, 1)}`],
  [/^installatie mislukt \(afsluitcode (\S+)\): (.*)$/, (m) => `встановлення не вдалося (код виходу ${v(m, 1)}): ${v(m, 2)}`],
  [/^GEWEIGERD: (.*)$/, (m) => `ВІДХИЛЕНО: ${v(m, 1)}`],
  [/^AFGEBROKEN \((\S+)\): (.*)$/, (m) => `ПЕРЕРВАНО (${v(m, 1)}): ${v(m, 2)}`],
  // UITROL-001: stopverzoek van de eigenaar
  [/^STOP: eigenaar vraagt te stoppen bij (\d+) % \((.*?)\)(?:: (.*))? — installatie wordt afgebroken, vorige release blijft actief$/,
    (m) => `СТОП: власник просить зупинити на ${v(m, 1)} % (${v(m, 2)})${m[3] ? `: ${m[3]}` : ''} — встановлення переривається, попередній випуск лишається активним`],
  [/^STOP: verzoek van de eigenaar kwam bij (\d+) % — te laat \(het overschakelen loopt al\); de gezondheidscontrole en de automatische terugdraai beslissen$/,
    (m) => `СТОП: запит власника надійшов на ${v(m, 1)} % — запізно (перемикання вже триває); вирішать перевірка здоров’я та автоматичний відкат`],
  [/^installatie gestopt door de eigenaar \(afsluitcode (\S+)\)$/, (m) => `встановлення зупинено власником (код виходу ${v(m, 1)})`],
  [/^stopverzoek genegeerd(.*)$/, (m) => `запит на зупинку проігноровано${v(m, 1).replace(': bestand te groot', ': файл завеликий')}`],
];
// ---- eigen regels die in het Oekraïens zijn geschreven, uk → nl
const EIGEN_NL: Patroon[] = [
  [/^метадані випуску: автор=(.*) агент=(.*) commit=(.*)$/, (m) => `metadata van de uitgave: auteur=${v(m, 1)} agent=${v(m, 2)} commit=${v(m, 3)}`],
];

// ---- uitvoer van derden (npm, vite, esbuild, systemd-run, psql, tar): vaste zinnen → uk én nl
const DERDEN: Patroon[] = [
  [/^added (\d+) packages?(?:, (?:and )?(?:removed (\d+) packages?,? )?(?:changed (\d+) packages?,? )?(?:and )?audited (\d+) packages?)? in (\S+)$/,
    (m) => ({ uk: `npm: додано пакетів: ${v(m, 1)}${m[2] ? `, видалено: ${m[2]}` : ''}${m[3] ? `, змінено: ${m[3]}` : ''}${m[4] ? `, перевірено: ${m[4]}` : ''} за ${v(m, 5)}`,
      nl: `npm: ${v(m, 1)} pakketten toegevoegd${m[2] ? `, ${m[2]} verwijderd` : ''}${m[3] ? `, ${m[3]} gewijzigd` : ''}${m[4] ? `, ${m[4]} gecontroleerd` : ''} in ${v(m, 5)}` })],
  [/^(?:up to date, )?audited (\d+) packages? in (\S+)$/, (m) => ({ uk: `npm: перевірено пакетів: ${v(m, 1)} за ${v(m, 2)}`, nl: `npm: ${v(m, 1)} pakketten gecontroleerd in ${v(m, 2)}` })],
  [/^(\d+) packages? (?:is|are) looking for funding$/, (m) => ({ uk: `npm: ${v(m, 1)} пакетів шукають фінансування`, nl: `npm: ${v(m, 1)} pakketten zoeken financiering` })],
  [/^\s*run `npm fund` for details$/, () => ({ uk: 'npm: подробиці — «npm fund»', nl: 'npm: details via «npm fund»' })],
  [/^found 0 vulnerabilities$/, () => ({ uk: 'npm: вразливостей не знайдено', nl: 'npm: geen kwetsbaarheden gevonden' })],
  [/^found (\d+) vulnerabilit(?:y|ies)(.*)$/, (m) => ({ uk: `npm: знайдено вразливостей: ${v(m, 1)}${v(m, 2)}`, nl: `npm: ${v(m, 1)} kwetsbaarheden gevonden${v(m, 2)}` })],
  [/^(\d+) (low|moderate|high|critical) severity vulnerabilit(?:y|ies)$/, (m) => ({ uk: `npm: ${v(m, 1)} вразливостей рівня «${({ low: 'низький', moderate: 'помірний', high: 'високий', critical: 'критичний' })[v(m, 2)]}»`, nl: `npm: ${v(m, 1)} kwetsbaarheden, ernst «${({ low: 'laag', moderate: 'matig', high: 'hoog', critical: 'kritiek' })[v(m, 2)]}»` })],
  [/^\s*run `npm audit fix` to fix them, or `npm audit` for details$/, () => ({ uk: 'npm: «npm audit fix» виправить їх, «npm audit» покаже подробиці', nl: 'npm: «npm audit fix» verhelpt ze, «npm audit» toont details' })],
  [/^npm warn deprecated (\S+): (.*)$/, (m) => ({ uk: `npm попередження: застарілий пакет ${v(m, 1)}: ${v(m, 2)}`, nl: `npm waarschuwing: verouderd pakket ${v(m, 1)}: ${v(m, 2)}` })],
  [/^npm warn (.*)$/, (m) => ({ uk: `npm попередження: ${v(m, 1)}`, nl: `npm waarschuwing: ${v(m, 1)}` })],
  [/^npm notice (.*)$/, (m) => ({ uk: `npm примітка: ${v(m, 1)}`, nl: `npm opmerking: ${v(m, 1)}` })],
  [/^npm error (.*)$/, (m) => ({ uk: `npm помилка: ${v(m, 1)}`, nl: `npm fout: ${v(m, 1)}` })],
  [/^vite v(\S+) building (?:for production|client environment|SSR bundle)(?: for production)?\.\.\.$/, (m) => ({ uk: `vite ${v(m, 1)}: збірка для production…`, nl: `vite ${v(m, 1)}: bouwen voor productie…` })],
  [/^transforming\.\.\.$/, () => ({ uk: 'vite: перетворення модулів…', nl: 'vite: modules omzetten…' })],
  [/^✓ (\d+) modules transformed\.$/, (m) => ({ uk: `✓ vite: перетворено модулів: ${v(m, 1)}`, nl: `✓ vite: ${v(m, 1)} modules omgezet` })],
  [/^rendering chunks\.\.\.$/, () => ({ uk: 'vite: формування частин…', nl: 'vite: chunks schrijven…' })],
  [/^computing gzip size\.\.\.$/, () => ({ uk: 'vite: обчислення розміру gzip…', nl: 'vite: gzip-grootte berekenen…' })],
  [/^✓ built in (\S+)$/, (m) => ({ uk: `✓ vite: зібрано за ${v(m, 1)}`, nl: `✓ vite: gebouwd in ${v(m, 1)}` })],
  [/^\(!\) Some chunks are larger than (\d+) kBs? after minification\.(.*)$/, (m) => ({ uk: `(!) vite: деякі частини більші за ${v(m, 1)} кБ після мінімізації.`, nl: `(!) vite: sommige chunks zijn groter dan ${v(m, 1)} kB na minificatie.` })],
  [/^⚡ Done in (\S+)$/, (m) => ({ uk: `⚡ esbuild: готово за ${v(m, 1)}`, nl: `⚡ esbuild: klaar in ${v(m, 1)}` })],
  [/^Done in (\S+)$/, (m) => ({ uk: `готово за ${v(m, 1)}`, nl: `klaar in ${v(m, 1)}` })],
  [/^Running as unit: (.+)$/, (m) => ({ uk: `systemd: запущено як юніт ${v(m, 1)}`, nl: `systemd: draait als unit ${v(m, 1)}` })],
  [/^Press \^\] three times within 1s to disconnect TTY\.$/, () => ({ uk: 'systemd: натисніть ^] тричі за 1 с, щоб від’єднати TTY.', nl: 'systemd: druk driemaal ^] binnen 1 s om de TTY los te koppelen.' })],
  [/^Finished with result: (\S+)$/, (m) => ({ uk: `systemd: завершено з результатом «${v(m, 1) === 'success' ? 'успіх' : v(m, 1)}»`, nl: `systemd: afgerond met resultaat «${v(m, 1) === 'success' ? 'geslaagd' : v(m, 1)}»` })],
  [/^Main processes terminated with: (.*)$/, (m) => ({ uk: `systemd: головний процес завершився: ${v(m, 1)}`, nl: `systemd: hoofdproces beëindigd: ${v(m, 1)}` })],
  [/^Service runtime: (.+)$/, (m) => ({ uk: `systemd: час роботи служби: ${v(m, 1)}`, nl: `systemd: looptijd van de dienst: ${v(m, 1)}` })],
  [/^CPU time consumed: (.+)$/, (m) => ({ uk: `systemd: спожито часу процесора: ${v(m, 1)}`, nl: `systemd: verbruikte processortijd: ${v(m, 1)}` })],
  [/^Memory peak: (.+)$/, (m) => ({ uk: `systemd: пік пам’яті: ${v(m, 1)}`, nl: `systemd: geheugenpiek: ${v(m, 1)}` })],
  [/^Created symlink (.+)$/, (m) => ({ uk: `systemd: створено символьне посилання ${v(m, 1)}`, nl: `systemd: symlink aangemaakt ${v(m, 1)}` })],
  [/^Removed "?(.+?)"?\.$/, (m) => ({ uk: `systemd: вилучено ${v(m, 1)}`, nl: `systemd: verwijderd ${v(m, 1)}` })],
  [/^NOTICE:\s+(.*)$/, (m) => ({ uk: `psql ПРИМІТКА: ${v(m, 1)}`, nl: `psql OPMERKING: ${v(m, 1)}` })],
  [/^WARNING:\s+(.*)$/, (m) => ({ uk: `ПОПЕРЕДЖЕННЯ: ${v(m, 1)}`, nl: `WAARSCHUWING: ${v(m, 1)}` })],
  [/^ERROR:\s+(.*)$/, (m) => ({ uk: `ПОМИЛКА: ${v(m, 1)}`, nl: `FOUT: ${v(m, 1)}` })],
  [/^Error: (.*)$/, (m) => ({ uk: `Помилка: ${v(m, 1)}`, nl: `Fout: ${v(m, 1)}` })],
  [/^Warning: (.*)$/, (m) => ({ uk: `Попередження: ${v(m, 1)}`, nl: `Waarschuwing: ${v(m, 1)}` })],
  [/^tar: Removing leading `\/' from member names$/, () => ({ uk: 'tar: початковий «/» у назвах прибрано', nl: 'tar: voorloop «/» uit de namen verwijderd' })],
  [/^Terminated$/, () => ({ uk: 'процес перервано (SIGTERM)', nl: 'proces beëindigd (SIGTERM)' })],
  [/^Killed$/, () => ({ uk: 'процес примусово зупинено (SIGKILL)', nl: 'proces geforceerd gestopt (SIGKILL)' })],
];

export type TerminalVertaling = { tekst: string; vertaald: boolean };
const kies = (u: Uit, lang: 'uk' | 'nl') => (typeof u === 'string' ? u : lang === 'uk' ? u.uk : u.nl);

/**
 * Vertaalt één regel naar de paginataal als het een bekende melding is; anders ongewijzigd. ANSI-codes blijven staan.
 *   uk: Nederlandse eigen meldingen en bekende Engelse regels van derden → Oekraïens.
 *   nl: Oekraïense eigen meldingen en bekende Engelse regels van derden → Nederlands.
 */
export function vertaalRegel(tekst: string, lang: 'uk' | 'nl'): TerminalVertaling {
  const m = /^((?:\x1b\[[0-9;]*m)*)\[(installeer|uitrol)\] (.*)$/s.exec(tekst);
  if (!m) {
    const a = /^((?:\x1b\[[0-9;]*m)*)(.*)$/s.exec(tekst)!;
    const [, ansi, rest] = a;
    for (const [re, f] of DERDEN) { const r = rest.match(re); if (r) return { tekst: `${ansi}${kies(f(r), lang)}`, vertaald: true }; }
    return { tekst, vertaald: false };
  }
  const [, ansi, bron, rest0] = m;
  let voor = ''; let rest = rest0;
  const pre = /^(LET OP|FOUT): (.*)$/s.exec(rest);
  if (pre) { voor = pre[1] === 'FOUT' ? (lang === 'uk' ? 'ПОМИЛКА: ' : 'FOUT: ') : (lang === 'uk' ? 'УВАГА: ' : 'LET OP: '); rest = pre[2]; }
  const uit = (t: string) => ({ tekst: `${ansi}[${bron}] ${voor}${t}`, vertaald: true });
  // Tweetalige regel («nl / uk»): alleen de helft in de paginataal.
  const helft = tweetaligeHelft(rest, lang);
  if (helft !== null && !/^stap: /.test(rest)) return uit(helft);
  for (const [re, f] of lang === 'uk' ? (bron === 'installeer' ? INSTALLEER : UITROL) : EIGEN_NL) {
    const r = rest.match(re);
    if (r) return uit(kies(f(r), lang));
  }
  if (lang === 'nl' && /^stap: (\S+) \((\d+)%\) ?(.*)$/.test(rest)) { const r = /^stap: (\S+) \((\d+)%\) ?(.*)$/.exec(rest)!; const h = tweetaligeHelft(r[3], 'nl'); if (h !== null) return uit(`stap: ${r[1]} (${r[2]}%) ${h}`); }
  return voor && lang === 'uk' ? uit(rest) : { tekst, vertaald: false };
}
