// «Рішення власника з підписом passkey» (22.10.2026, zone B; RUNBOOK-VEILIGE-UITROL.md §15) — gedeelde, zuivere vorm voor
// backend/eigenaar-besluit.ts, src/besluit/* en de tests: soorten, staten, de teksten van de codes van root (uk/nl) en de «?»-uitleg.
// De cryptografische kern (normaliseren, hash) staat in deploy/goedkeuring/besluit-kern.mjs (gedeeld met root, nooit twee keer).
import type { Tekst } from './tech-rollen';

// ORCH-001 етап 3 (31.10.2026): «orch-regels» — підтвердження нової версії правил координації агентів (shared/orch-model.ts).
export const BESLUIT_SOORTEN = ['terugdraaien', 'externe-hosts', 'orch-regels'] as const;
export type BesluitSoort = (typeof BESLUIT_SOORTEN)[number];
export const BESLUIT_STATEN = ['ontwerp', 'ondertekend', 'klaar', 'geweigerd', 'mislukt', 'verlopen'] as const;
export type BesluitStaat = (typeof BESLUIT_STATEN)[number];
/** Inhoud van een besluit «orch-regels»: de afdruk van het regelvoorstel (scripts/orch/kern.mjs regelsAfdruk/kritiekAfdruk) en zijn id. */
export type OrchRegelsInhoud = { regelsVersie: string; hash: string; kritiekHash: string; voorstel: string };
export type BesluitInhoud = { van: string; naar: string } | { hosts: string[] } | OrchRegelsInhoud;

/** Grenzen van het kanaal (app-kant). Root heeft zijn eigen, strengere controles (besluit-kern.mjs, mijn-ruimte-besluit.sh). */
export const BESLUIT_LIMIETEN = Object.freeze({
  /** Zoveel besluiten mag de eigenaar per uur starten (daarboven RATE_LIMITED). */
  perUur: 30,
  /** Zo lang wacht de route «ondertekenen» op het antwoord van root voordat ze «in behandeling» teruggeeft (ms). */
  wachtMs: 12_000,
  /** Zonder uitkomst van root na zoveel minuten sluit de app een ondertekend besluit af als «verlopen» (GEEN_UITKOMST). */
  uitkomstMinuten: 15,
  maxHosts: 50,
});

/** Eén rij zoals de pagina hem krijgt (backend/eigenaar-besluit.ts → UI). */
export type BesluitUit = {
  id: string; soort: BesluitSoort; inhoud: BesluitInhoud; hash: string; staat: BesluitStaat; code: string;
  uitkomst: { uk?: string; nl?: string; tijd?: string; detail?: string; actief?: string; toegevoegd?: string[]; verwijderd?: string[] } | null;
  passkey: string; door: string; aangemaaktOp: string; ondertekendOp: string; afgerondOp: string;
};

/** Stand die root schrijft (besluit-stand.json) — de bron voor «huidige lijst uit het bestand» en «van welke naar welke release». */
export type BesluitStand = {
  bijgewerkt: string; rechtenLeesbaar: boolean; hosts: string[];
  schakelaars: { terugdraaienDirect: boolean; terugdraaienPasskey: boolean; externeHostsPasskey: boolean; orchRegelsPasskey?: boolean };
  actief: string; vorige: string; releases: Array<{ naam: string; commit: string; actief: boolean; vorige: boolean; bruikbaar: boolean; versie?: string; auteur?: string; agent?: string; bronCommit?: string; samenvatting?: string }>;
};

const T = (uk: string, nl: string): Tekst => [uk, nl];
export const BESLUIT_STAAT_TEKST: Readonly<Record<BesluitStaat, Tekst>> = Object.freeze({
  ontwerp: T('Чернетка (ще не підписано)', 'Ontwerp (nog niet ondertekend)'),
  ondertekend: T('Передано, root перевіряє підпис…', 'Doorgegeven, root controleert de handtekening…'),
  klaar: T('Виконано', 'Uitgevoerd'),
  geweigerd: T('Відхилено root-ом', 'Geweigerd door root'),
  mislukt: T('Не вдалося', 'Mislukt'),
  verlopen: T('Минув строк', 'Verlopen'),
});
export const BESLUIT_SOORT_TEKST: Readonly<Record<BesluitSoort, Tekst>> = Object.freeze({
  terugdraaien: T('Відкат до випуску', 'Terugdraaien naar release'),
  'externe-hosts': T('Білий список зовнішніх MCP-хостів', 'Witte lijst van externe MCP-hosts'),
  'orch-regels': T('Нова версія правил координації агентів', 'Nieuwe versie van de regels voor agentcoördinatie'),
});

/**
 * Codes die de app zelf teruggeeft (routes) en de codes van root (mijn-ruimte-besluit.sh, goedkeur-hulp.mjs verifieer-besluit).
 * Root stuurt zijn eigen uk/nl mee; deze tabel is de uitleg voor de app-codes en de terugval als root geen tekst gaf.
 */
export const BESLUIT_CODES: Readonly<Record<string, Tekst>> = Object.freeze({
  BESLUIT_UIT: T('Цей тип рішення вимкнено на сервері: у /etc/mijn-ruimte/mcp-rechten.json стоїть «…-passkey»: false. Зміна — лише через SSH.', 'Dit soort besluit staat uit op de server: in /etc/mijn-ruimte/mcp-rechten.json staat «…-passkey»: false. Wijzigen kan alleen via SSH.'),
  GEEN_PASSKEY: T('На сервері немає підтвердженого passkey власника. Додайте його в «Способи входу» → «Може схвалювати оновлення сервера».', 'Er staat geen bevestigde passkey van de eigenaar op de server. Voeg hem toe in «Aanmeldmethoden» → «Mag serverupdates goedkeuren».'),
  SOORT_ONGELDIG: T('Невідомий тип рішення.', 'Onbekend soort besluit.'),
  INHOUD_ONGELDIG: T('Вміст рішення недійсний (випуск або хост у недопустимій формі).', 'De inhoud van het besluit is ongeldig (release of host in een onjuiste vorm).'),
  RELEASE_ONBEKEND: T('Такого випуску немає на сервері або він неповний.', 'Die release staat niet op de server of is onvolledig.'),
  RELEASE_ACTIEF: T('Цей випуск уже активний.', 'Die release is al actief.'),
  STAND_VERANDERD: T('Активний випуск змінився, поки ви вирішували. Відкрийте майстер заново.', 'De actieve release veranderde terwijl u besliste. Open de wizard opnieuw.'),
  GEEN_WIJZIGING: T('Список не змінився — підписувати нічого.', 'De lijst is niet veranderd — er is niets te ondertekenen.'),
  TE_VEEL_HOSTS: T('Забагато хостів (не більше 50).', 'Te veel hosts (hoogstens 50).'),
  UITDAGING_ONGELDIG: T('Запит підпису прострочений або вже використаний. Почніть заново.', 'De ondertekenaanvraag is verlopen of al gebruikt. Begin opnieuw.'),
  NIET_GEVONDEN: T('Рішення не знайдено.', 'Besluit niet gevonden.'),
  STATUS_ONGELDIG: T('Це рішення вже не в тому стані, щоб його підписати.', 'Dit besluit is niet meer in een toestand om te ondertekenen.'),
  RATE_LIMITED: T('Забагато рішень за годину. Зачекайте.', 'Te veel besluiten in een uur. Wacht even.'),
  GEEN_UITKOMST: T('Root не відповів протягом 15 хв. Перевірте «Діагностика» (юніт mijn-ruimte-besluit.path) або journalctl -u mijn-ruimte-besluit.', 'Root antwoordde niet binnen 15 min. Zie «Діагностика» (unit mijn-ruimte-besluit.path) of journalctl -u mijn-ruimte-besluit.'),
  BESLUIT_PASSKEY: T('Root не підтвердив підпис passkey — нічого не змінено.', 'Root heeft de passkey-handtekening niet bevestigd — niets gewijzigd.'),
  BESLUIT_PASSKEY_HERGEBRUIKT: T('Це підтвердження вже використано (повторне надсилання відхилено).', 'Deze bevestiging is al gebruikt (herhaald versturen geweigerd).'),
  BESLUIT_PASSKEY_VERLOPEN: T('Час підтвердження минув (5 хв). Підпишіть ще раз.', 'De bevestiging is verlopen (5 min). Onderteken opnieuw.'),
  BESLUIT_PASSKEY_SLEUTEL_ONBEKEND: T('Цей passkey не зареєстрований на сервері як ключ власника.', 'Deze passkey staat niet als sleutel van de eigenaar op de server.'),
  BESLUIT_PASSKEY_HANDTEKENING_ONGELDIG: T('Підпис passkey недійсний.', 'De handtekening van de passkey is ongeldig.'),
  BESLUIT_PASSKEY_UITDAGING_ONJUIST: T('Підпис стосується іншого вмісту: рішення змінено після підпису.', 'De handtekening hoort bij een andere inhoud: het besluit is na het ondertekenen gewijzigd.'),
  BESLUIT_PASSKEY_ORIGIN_ONJUIST: T('Підтвердження надійшло з іншої адреси.', 'De bevestiging kwam van een ander adres.'),
  BESLUIT_PASSKEY_GEEN_SLEUTELS: T('На сервері немає жодного підтвердженого passkey власника.', 'Er staat geen bevestigde passkey van de eigenaar op de server.'),
  BESLUIT_HASH_VERSCHILT: T('Вміст рішення змінено після підпису — root відмовив.', 'De inhoud van het besluit is na het ondertekenen gewijzigd — root weigerde.'),
  BESLUIT_INHOUD_ONGELDIG: T('Root відхилив вміст рішення.', 'Root keurde de inhoud van het besluit af.'),
  BESLUIT_ONGELDIG: T('Файл рішення пошкоджений.', 'Het besluitbestand is beschadigd.'),
  BESLUIT_STAND_VERANDERD: T('Активний випуск уже інший — рішення застаріло. Почніть заново.', 'De actieve release is al een andere — het besluit is verouderd. Begin opnieuw.'),
  BESLUIT_RELEASE_ONBEKEND: T('Випуск відсутній або неповний на сервері.', 'De release ontbreekt of is onvolledig op de server.'),
  BESLUIT_TE_SNEL: T('Відкат можливий не частіше ніж раз на 10 хвилин.', 'Terugdraaien kan hooguit één keer per 10 minuten.'),
  BESLUIT_TERUGDRAAIEN_MISLUKT: T('Відкат не вдався (див. подробиці). Активний випуск лишився або повернувся.', 'Terugdraaien mislukte (zie details). De actieve release bleef of kwam terug.'),
  BESLUIT_RECHTEN: T('Файл перемикачів пошкоджений або має неправильні права — нічого не змінено.', 'Het schakelaarbestand is beschadigd of heeft onjuiste rechten — niets gewijzigd.'),
  BESLUIT_CONTROLE: T('Внутрішня помилка root-скрипта.', 'Interne fout in het root-script.'),
  // 29.10.2026 — de app kon het besluit niet in de inbox leggen (zichtbaar in plaats van een kale 500).
  INBOX_ALLEEN_LEZEN: T('Застосунок не може записати рішення: тека besluit-inbox для нього лише для читання (systemd ProtectSystem). Встановіть цей випуск ще раз через SSH — він додає теку до дозволених для запису, а потім підпишіть рішення знову.', 'De app kan het besluit niet neerleggen: de map besluit-inbox is voor haar alleen-lezen (systemd ProtectSystem). Installeer deze release opnieuw via SSH — die zet de map bij de beschrijfbare paden — en onderteken daarna opnieuw.'),
  INBOX_GEEN_RECHT: T('Застосунок не має права писати в теку besluit-inbox. Перевірте власника й права теки через SSH (власник mijn-ruimte, група mijn-ruimte, 0770).', 'De app mag niet schrijven in de map besluit-inbox. Controleer eigenaar en rechten van de map via SSH (eigenaar mijn-ruimte, groep mijn-ruimte, 0770).'),
  INBOX_ONTBREEKT: T('Теки besluit-inbox немає на сервері. Встановіть цей випуск через SSH — інсталятор її створить.', 'De map besluit-inbox ontbreekt op de server. Installeer deze release via SSH — de installer maakt haar aan.'),
  INBOX_VOL: T('На диску сервера немає місця — рішення не записано.', 'De schijf van de server is vol — het besluit is niet weggeschreven.'),
  INBOX_NIET_BEVESTIGD: T('Рішення записано, але під час перевірки його не знайдено в теці besluit-inbox. Сервер нічого не виконав. Спробуйте ще раз.', 'Het besluit is weggeschreven, maar bij de controle niet teruggevonden in de map besluit-inbox. De server heeft niets uitgevoerd. Probeer opnieuw.'),
  INBOX_SCHRIJFFOUT: T('Не вдалося записати рішення в теку besluit-inbox (див. подробиці). Сервер нічого не виконав.', 'Het besluit kon niet in de map besluit-inbox worden gezet (zie details). De server heeft niets uitgevoerd.'),
  // ORCH-001 етап 3 (31.10.2026): рішення «orch-regels».
  GEEN_VOORSTEL: T('Пропозиції правил з таким ідентифікатором немає (її вже застосовано або відкликано). Створіть пропозицію заново.', 'Er is geen regelvoorstel met dit id (al toegepast of ingetrokken). Maak het voorstel opnieuw.'),
  VOORSTEL_VEROUDERD: T('Пропозиція правил зроблена для іншого стану репозиторію: чинні правила змінилися після її створення. Створіть пропозицію заново.', 'Het regelvoorstel hoort bij een andere staat van de repository: de geldende regels zijn na het maken veranderd. Maak het voorstel opnieuw.'),
  ORCH_GEEN_REPO: T('На сервері немає робочої копії репозиторію координації (ORCH_WORTEL). Налаштуйте її за RUNBOOK §18 — до того керувати правилами можна лише через git.', 'Op de server staat geen werkkopie van de coördinatierepository (ORCH_WORTEL). Richt die in volgens RUNBOOK §18 — tot dan zijn de regels alleen via git te beheren.'),
  BESLUIT_ORCH_REGELS_OK: T('Root записав підтвердження правил. Застосунок застосовує нову версію в git-гілці.', 'Root heeft de bevestiging van de regels vastgelegd. De app past de nieuwe versie toe in een git-tak.'),
});
export const besluitCodeTekst = (lang: 'uk' | 'nl', code: string): string => {
  const t = BESLUIT_CODES[code];
  return t ? (lang === 'uk' ? t[0] : t[1]) : code;
};

/** Het onderwerp van een besluit in één regel (voor lijsten en het journaal). */
export function besluitSamenvatting(lang: 'uk' | 'nl', soort: BesluitSoort, inhoud: BesluitInhoud): string {
  if (soort === 'terugdraaien' && 'van' in inhoud) return lang === 'uk' ? `відкат з ${inhoud.van} на ${inhoud.naar}` : `terugdraaien van ${inhoud.van} naar ${inhoud.naar}`;
  if ('hosts' in inhoud) return `${lang === 'uk' ? 'хости' : 'hosts'}: ${inhoud.hosts.length ? inhoud.hosts.join(', ') : (lang === 'uk' ? 'порожній список' : 'lege lijst')}`;
  if ('regelsVersie' in inhoud) return lang === 'uk' ? `правила координації ${inhoud.regelsVersie} (відбиток ${inhoud.hash.slice(0, 12)}…)` : `coördinatieregels ${inhoud.regelsVersie} (afdruk ${inhoud.hash.slice(0, 12)}…)`;
  return soort;
}

// ---------------------------------------------------------------- «?» (shared/hulp-register.ts)
type HulpItem = { wat: Tekst; gevolg: Tekst; risico: Tekst; dev: Tekst; bron: string };
const item = (bron: string, wat: Tekst, gevolg: Tekst, risico: Tekst, dev: Tekst): HulpItem => ({ wat, gevolg, risico, dev, bron });
const ROOT = 'deploy/installeer-app.sh';
export const HELP_BESLUIT: Readonly<Record<string, HulpItem>> = Object.freeze({
  'root.terugdraaien-passkey': item(ROOT,
    T('Чи може власник відкочувати сайт на інший випуск рішенням із підписом passkey (без SSH).', 'Of de eigenaar de site met een passkey-ondertekend besluit (zonder SSH) naar een andere release mag terugdraaien.'),
    T('Відсутній або true — майстер «Відкат» на mcp.*/dashboard працює через passkey; false — кнопка повідомляє, що шлях закрито, і лишається тільки SSH.', 'Ontbreekt of true — de wizard «Terugdraaien» op mcp.*/dashboard werkt met passkey; false — de knop meldt dat het pad dicht is en alleen SSH overblijft.'),
    T('Відкат не відкочує міграції бази; root перевіряє підпис сам, тож захоплений застосунок без вашого passkey нічого не зробить.', 'Terugdraaien draait geen databasemigraties terug; root controleert de handtekening zelf, dus een gekaapte app doet zonder uw passkey niets.'),
    T('"terugdraaien-passkey" у /etc/mijn-ruimte/mcp-rechten.json (три стани з "opdracht.terugdraaien", RUNBOOK §15); deploy/besluit/mijn-ruimte-besluit.sh, goedkeur-hulp.mjs verifieer-besluit.', '"terugdraaien-passkey" in /etc/mijn-ruimte/mcp-rechten.json (drie standen met "opdracht.terugdraaien", RUNBOOK §15); deploy/besluit/mijn-ruimte-besluit.sh, goedkeur-hulp.mjs verifieer-besluit.')),
  'root.externe-hosts-passkey': item(ROOT,
    T('Чи може власник змінювати білий список зовнішніх MCP-хостів рішенням із підписом passkey.', 'Of de eigenaar de witte lijst van externe MCP-hosts met een passkey-ondertekend besluit mag wijzigen.'),
    T('Відсутній або true — на mcp.*/agenten → «Зовнішні MCP» можна додавати й прибирати хости; false — лише ручне редагування файла через SSH.', 'Ontbreekt of true — op mcp.*/agenten → «Externe MCP» kunt u hosts toevoegen en weghalen; false — alleen handmatig bewerken via SSH.'),
    T('Кожен дозволений хост — вихідне з’єднання сайту до чужого сервера; root пише файл атомарно з резервною копією, інші ключі не чіпає.', 'Elke toegestane host is een uitgaande verbinding van de site naar een vreemde server; root schrijft het bestand atomisch met reservekopie en raakt andere sleutels niet.'),
    T('"externe-hosts-passkey" та "externeMcpHosts" у mcp-rechten.json; читає backend/mcp-klant/klant.ts toegestaneHosts(); пише лише root (mijn-ruimte-besluit.sh externe_hosts).', '"externe-hosts-passkey" en "externeMcpHosts" in mcp-rechten.json; gelezen door backend/mcp-klant/klant.ts toegestaneHosts(); alleen root schrijft (mijn-ruimte-besluit.sh externe_hosts).')),
  'besluit.terugdraaien-naar': item('src/besluit/TerugdraaiMeester.tsx',
    T('На який випуск повернути сайт: типово попередній (VORIGE), можна обрати інший повний випуск із теки releases.', 'Naar welke release de site terug moet: standaard de vorige (VORIGE); een andere volledige release uit de map releases kan ook.'),
    T('Після підпису passkey root перемкне символьне посилання current на цей випуск і перезапустить службу; поточний стає «попереднім».', 'Na de passkey-handtekening zet root de symlink current op deze release en herstart de dienst; de huidige wordt «vorige».'),
    T('Міграції бази не відкочуються: старіший код може не знати нових колонок. Не частіше ніж раз на 10 хв.', 'Databasemigraties worden niet teruggedraaid: oudere code kent nieuwe kolommen misschien niet. Hoogstens één keer per 10 min.'),
    T('POST /api/owner/besluit/starten {soort:"terugdraaien", inhoud:{van,naar}} → challenge; root: mijn-ruimte-installeer terugdraaien <naar> (modus besluit, подія TERUG_OK, wie=passkey).', 'POST /api/owner/besluit/starten {soort:"terugdraaien", inhoud:{van,naar}} → challenge; root: mijn-ruimte-installeer terugdraaien <naar> (modus besluit, gebeurtenis TERUG_OK, wie=passkey).')),
  'besluit.terugdraaien-bron': item('src/besluit/TerugdraaiMeester.tsx',
    T('Звідки взяти версію для відкату: з п’яти останніх версій, що вже лежать на сервері, або з файлу .tar.gz на цьому пристрої.', 'Waar de versie voor het terugdraaien vandaan komt: uit de vijf laatste versies die al op de server staan, of uit een .tar.gz-bestand op dit apparaat.'),
    T('Файл з пристрою лише перевіряється в браузері й зіставляється з версією на сервері; відкат іде на ту саму версію, що вже є на сервері.', 'Een bestand van het apparaat wordt alleen in de browser gecontroleerd en vergeleken met een versie op de server; het terugdraaien gaat naar diezelfde versie op de server.'),
    T('Старіший пакет, якого немає на сервері, встановити не можна: сервер приймає лише новіші пакети (правило «NIET_NIEUWER»).', 'Een ouder pakket dat niet op de server staat kan niet worden geïnstalleerd: de server neemt alleen nieuwere pakketten aan (regel «NIET_NIEUWER»).'),
    T('src/platform/tar-lezen.ts leesPakket; та сама папка besluit-inbox і passkey, що в RUNBOOK §15.', 'src/platform/tar-lezen.ts leesPakket; zelfde besluit-inbox en passkey als RUNBOOK §15.')),
  'besluit.terugdraaien-wacht': item('src/besluit/TerugdraaiMeester.tsx',
    T('Після підпису сайт кладе рішення в папку для сервера; окрема служба на сервері забирає його протягом кількох секунд.', 'Na de handtekening legt de site het besluit in een map voor de server; een aparte dienst op de server haalt het binnen enkele seconden op.'),
    T('Якщо за 60 секунд рішення ще лежить у папці, служба не працює: сторінка показує команди для перевірки.', 'Ligt het besluit na 60 seconden nog in de map, dan draait de dienst niet: de pagina toont de opdrachten om na te kijken.'),
    T('Команди лише читають стан, нічого не змінюють.', 'De opdrachten lezen alleen de toestand, ze wijzigen niets.'),
    T('служби mijn-ruimte-besluit.path → mijn-ruimte-besluit.service; папка /srv/mijn-ruimte/besluit-inbox.', 'diensten mijn-ruimte-besluit.path → mijn-ruimte-besluit.service; map /srv/mijn-ruimte/besluit-inbox.')),
  'root.orch-regels-passkey': item(ROOT,
    T('Чи може власник підтверджувати нову версію правил координації агентів (AGENTS.md, orchestratie/beleid.json) рішенням із підписом passkey.', 'Of de eigenaar een nieuwe versie van de regels voor agentcoördinatie (AGENTS.md, orchestratie/beleid.json) met een passkey-ondertekend besluit mag bevestigen.'),
    T('Відсутній або true — на mcp.*/agenten → «Координація» пропозицію правил можна підписати; root записує підтвердження, застосунок створює git-гілку з новим lock. false — лише node scripts/orch.mjs bevestig з SSH-підписом.', 'Ontbreekt of true — op mcp.*/agenten → «Coördinatie» is een regelvoorstel te ondertekenen; root legt de bevestiging vast, de app maakt een git-tak met de nieuwe lock. false — alleen node scripts/orch.mjs bevestig met een SSH-handtekening.'),
    T('Підтверджені критичні політики відкривають дорогу автоматичному режиму встановлення (GitOps), якщо він дозволений у beleid.json. Root нічого не виконує — лише фіксує підпис.', 'Bevestigde kritieke regels openen de weg naar de automatische installatiemodus (GitOps) als beleid.json die toestaat. Root voert niets uit — hij legt alleen de handtekening vast.'),
    T('"orch-regels-passkey" у /etc/mijn-ruimte/mcp-rechten.json; root: mijn-ruimte-besluit.sh orch_regels → /var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl + <status>/orch-regels-bevestigd.json; застосунок: backend/orch-opslag.ts voorstelToepassen.', '"orch-regels-passkey" in /etc/mijn-ruimte/mcp-rechten.json; root: mijn-ruimte-besluit.sh orch_regels → /var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl + <status>/orch-regels-bevestigd.json; app: backend/orch-opslag.ts voorstelToepassen.')),
  'besluit.externe-hosts': item('src/besluit/ExterneHosts.tsx',
    T('Білий список хостів, до яких сайт як MCP-клієнт може підключатися (ім’я хоста або *.суфікс).', 'De witte lijst van hosts waarmee de site als MCP-klant mag verbinden (hostnaam of *.achtervoegsel).'),
    T('Після підпису passkey root записує новий список у mcp-rechten.json; сайт одразу бачить його (кеш за mtime).', 'Na de passkey-handtekening schrijft root de nieuwe lijst in mcp-rechten.json; de site ziet hem meteen (cache op mtime).'),
    T('Порожній список = жодного вихідного MCP-з’єднання; «*» заборонено. Хости з EXTERNE_MCP_HOSTS (оточення) тут не змінити.', 'Een lege lijst = geen enkele uitgaande MCP-verbinding; «*» is verboden. Hosts uit EXTERNE_MCP_HOSTS (omgeving) zijn hier niet te wijzigen.'),
    T('POST /api/owner/besluit/starten {soort:"externe-hosts", inhoud:{hosts}}; besluit-kern.mjs normaliseerInhoud (lowercase, dedupe, regex як schoonHostLijst).', 'POST /api/owner/besluit/starten {soort:"externe-hosts", inhoud:{hosts}}; besluit-kern.mjs normaliseerInhoud (lowercase, dedupe, regex als schoonHostLijst).')),
});
