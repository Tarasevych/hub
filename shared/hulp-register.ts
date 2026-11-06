// Eén register voor de uitleg «?» bij ELKE optie en schakelaar van het technisch profiel en de beheerpagina's (18.10.2026).
// Vier lagen, elk in het Oekraïens en het Nederlands:
//   wat     — wat het is
//   gevolg  — wat er verandert als u het kiest
//   risico  — wat er mis kan gaan / waarom voorzichtig (ook «laag risico» moet uitgelegd zijn)
//   dev     — voor ontwikkelaars: waar het zit (sleutel, bestand, tabel), waarom zo gebouwd, alternatieven
// plus `bron`: het bestand waar de optie leeft (wordt bij «Для розробників» getoond, samen met de sleutel).
//
// Afdwinging: tests/eenheid/hulp-register.test.ts faalt (met de lijst van wat ontbreekt) als
//   - een element met type=checkbox/radio, role=switch/radio/checkbox of een <select> in de mappen van het technisch profiel
//     en het beheer geen data-hulp='<sleutel>' (of uitdrukkelijk data-hulp-vrij='filter|sortering|keuze') heeft;
//   - die sleutel hier niet staat, een laag ontbreekt, te kort is of uk == nl;
//   - in hetzelfde bestand geen «?» (<HulpVraag k='<sleutel>' …/>) voor die sleutel staat;
//   - een catalogus (rollen, root-schakelaars in mcp-rechten.json, beveiligingsschakelaars 0066, SSH-CA-onderdelen) een id
//     heeft zonder vermelding hier.
// Uitbreiden (andere onderdelen): voeg een blok toe aan HULP_REGISTER hieronder, of roep hulpRegistreren() aan in een eigen
// shared-module die hier geïmporteerd wordt. Dubbele sleutels zijn een fout.
import type { HelpLagen, Tekst } from './tech-rollen';
import { HELP_TECH, TECH_ROLLEN } from './tech-rollen';
import { HELP_SSH, HELP_SSH_BEHEER } from './ssh-ca';
import { HELP_TERMINAL } from './terminal';
import { HELP_TERMINAL_OPDRACHT } from './terminal-opdrachten';
import { HELP_IMP_AANVRAGEN, HELP_IMP_TOESTEMMING } from './impersonatie';
import { HELP_ONDERSTEUNING, HELP_TOESTEMMING } from './ondersteuning';
import { HELP_BESLUIT } from './eigenaar-besluit';
import { HELP_ORCH } from './orch-model'; // ORCH-001 етап 3: координація агентів на mcp.*/agenten
import { HELP_MATRIX } from './extensie-matrix';
import { HELP_WERKBLAD } from './werkblad-indeling'; // zone F 22.10.2026: knoppen van de instelmodus van het werkblad
import { HELP_ZOEK_INDEX } from './zoek-hulp';   // zone D 22.10.2026: indexvenster op /zoek

export type HulpItem = { wat: Tekst; gevolg: Tekst; risico: Tekst; dev: Tekst; bron: string };
/** Minimale lengte per laag en taal (tekens). Korter is geen uitleg. */
export const HULP_MIN = Object.freeze({ wat: 25, gevolg: 25, risico: 20, dev: 30 });
/** Toegestane redenen voor data-hulp-vrij: geen optie van het systeem, alleen weergave of het kiezen van een item. */
export const HULP_VRIJ = Object.freeze(['filter', 'sortering', 'keuze'] as const);

const T = (uk: string, nl: string): Tekst => [uk, nl];
/** Bestaande uitleg (HelpLagen) aanvullen tot een volledig item. */
const van = (h: HelpLagen, bron: string, extra: Partial<HulpItem> = {}): HulpItem => ({ wat: h.wat, gevolg: h.gevolg, risico: (extra.risico ?? h.risico) as Tekst, dev: (extra.dev ?? h.dev) as Tekst, bron, ...extra });
const item = (bron: string, wat: Tekst, gevolg: Tekst, risico: Tekst, dev: Tekst): HulpItem => ({ wat, gevolg, risico, dev, bron });

const R: Record<string, HulpItem> = {};
export function hulpRegistreren(items: Readonly<Record<string, HulpItem>>): void {
  for (const [k, v] of Object.entries(items)) {
    if (!/^[a-z0-9][a-z0-9.-]{1,80}$/.test(k)) throw new Error(`HULP_SLEUTEL_ONGELDIG:${k}`);
    if (R[k]) throw new Error(`HULP_DUBBEL:${k}`);
    R[k] = Object.freeze({ ...v });
  }
}
export const hulpVan = (k: string): HulpItem | undefined => R[k];
export const hulpSleutels = (): string[] => Object.keys(R).sort();

/** Wat er aan een item ontbreekt (leeg = volledig). */
export function hulpGebreken(k: string, h: HulpItem | undefined): string[] {
  if (!h) return [`${k}: ontbreekt`];
  const uit: string[] = [];
  for (const laag of ['wat', 'gevolg', 'risico', 'dev'] as const) {
    const t = h[laag];
    if (!t || !Array.isArray(t) || t.length !== 2) { uit.push(`${k}.${laag}: ontbreekt`); continue; }
    const [uk, nl] = t.map((x) => String(x ?? '').trim());
    if (uk.length < HULP_MIN[laag]) uit.push(`${k}.${laag}.uk: te kort (${uk.length} < ${HULP_MIN[laag]})`);
    if (nl.length < HULP_MIN[laag]) uit.push(`${k}.${laag}.nl: te kort (${nl.length} < ${HULP_MIN[laag]})`);
    if (uk && uk === nl) uit.push(`${k}.${laag}: uk == nl`);
    if (uk && !/[а-яіїєґ]/i.test(uk)) uit.push(`${k}.${laag}.uk: geen Oekraïense tekst`);
    if (nl && /[а-яіїєґ]{4}/i.test(nl)) uit.push(`${k}.${laag}.nl: Oekraïense tekst in de Nederlandse laag`);
  }
  if (!h.bron || !/^(src|shared|backend|deploy|migrations|server)\//.test(h.bron)) uit.push(`${k}.bron: geen bestandspad`);
  return uit;
}

// ================================================================== technisch profiel (src/tech/TechLaag.tsx)
const TECH = 'src/tech/TechLaag.tsx';
hulpRegistreren({
  'tech.activeren': van(HELP_TECH.activeren, TECH),
  'tech.duur': van(HELP_TECH.duur, TECH, { risico: T('Довгий або безстроковий режим лишає адмін-силу у вкладці, яку можна забути відкритою. Обирайте найкоротший час, якого вистачить.', 'Een lange of onbeperkte modus laat beheerkracht achter in een tabblad dat u open kunt vergeten. Kies de kortste tijd die volstaat.') }),
  'tech.reden': van(HELP_TECH.reden, TECH, { risico: T('Причину бачать усі, хто читає журнал; не пишіть туди паролі, токени чи особисті дані клієнтів.', 'Iedereen die het logboek leest ziet de reden; zet er geen wachtwoorden, tokens of persoonsgegevens van klanten in.') }),
  'tech.band': van(HELP_TECH.band, TECH, { risico: T('Лише вигляд. Напис «ТЕХНІЧНИЙ» лишається завжди; контраст перевіряється (≥ 4,5:1), тож смугу не сховати кольором.', 'Alleen weergave. De tekst «TECHNISCH» blijft altijd; het contrast wordt gecontroleerd (≥ 4,5:1), dus de band is niet weg te kleuren.') }),
  // Migratie 0080: nieuwe tabbladen technisch of gebruiker. Raakt direct de AI in de privéruimte, dus met volledige uitleg.
  'tech.erven': item(TECH,
    T('Чи відкриваються НОВІ вкладки одразу в технічному профілі (успадкування відкритої активації).',
      'Of NIEUWE tabbladen meteen in het technische profiel openen (een open activering erven).'),
    T('Увімкнено — кожна нова вкладка цього входу технічна. Вимкнено (типово) — нова вкладка звичайна, технічний профіль вмикаєте в ній окремо; вкладка, відкрита з технічної, усе одно може отримати копію.',
      'Aan — elk nieuw tabblad van deze aanmelding is technisch. Uit (standaard) — een nieuw tabblad is gewoon en u zet het profiel daar apart aan; een tabblad dat u vanuit een technisch tabblad opent kan nog wel een kopie krijgen.'),
    T('Увімкнено — адмін-сила живе в кожній новій вкладці, і ваш ШІ у приватному просторі там не працює: він ніколи не читає й не керує технічною вкладкою. Вимкнено — технічна сила лишається там, де ви її ввімкнули.',
      'Aan — beheerkracht leeft in elk nieuw tabblad, en uw AI in de privéruimte werkt daar niet: die leest of bedient een technisch tabblad nooit. Uit — de technische kracht blijft waar u haar aanzette.'),
    T('Прапорець у app.tech_profielen.erven_nieuwe_tabbladen (міграція 0080). Читає ervenOpen() у backend/tech-profiel.ts (0071); змінює POST /api/owner/tech/erven. Профіль вкладки для розширення — <meta name="mjn-profiel">.',
      'Vlag in app.tech_profielen.erven_nieuwe_tabbladen (migratie 0080). Gelezen door ervenOpen() in backend/tech-profiel.ts (0071); gezet via POST /api/owner/tech/erven. Het tabprofiel voor de extensie staat in <meta name="mjn-profiel">.')),
  'tech.toekennen': van(HELP_TECH.toekennen, TECH),
  'tech.intrekken': van(HELP_TECH.intrekken, TECH, { risico: T('Активні сеанси цієї людини одразу втрачають технічні права; незбережена робота в технічному режимі може перерватися.', 'Lopende sessies van deze persoon verliezen meteen hun technische rechten; onopgeslagen werk in de technische modus kan afbreken.') }),
  'tech.max': item(TECH,
    T('Найдовша активація, яку отримувач цього профілю зможе обрати за один раз.', 'De langste activering die de ontvanger van dit profiel in één keer kan kiezen.'),
    T('У виборі «Термін» він побачить лише значення до цієї межі. Найсильніша роль обмежує додатково (адмін ≤ 1 год).', 'In de keuze «Duur» ziet hij alleen waarden tot deze grens. De sterkste rol beperkt nog extra (beheerder ≤ 1 u).'),
    T('Довша межа — довше відкрите вікно для помилки чи викраденої вкладки. Для разових задач досить 15–60 хв.', 'Een langere grens is een langer venster voor een fout of een gestolen tabblad. Voor losse taken volstaat 15–60 min.'),
    T('Поле max_minuten у app.tech_profielen; сервер бере min(max_minuten, плафон ролі) при активації (backend/tech-profiel.ts).', 'Veld max_minuten in app.tech_profielen; de server neemt min(max_minuten, plafond van de rol) bij activeren (backend/tech-profiel.ts).')),
});
const ROL_RISICO: Record<string, Tekst> = {
  ondersteuning: T('Бачить метадані журналу й діагностику клієнтів — це теж особисті дані; видавайте лише тим, хто розбирає звернення.', 'Ziet metadata van het logboek en diagnose van klanten — ook dat zijn persoonsgegevens; geef het alleen aan wie meldingen behandelt.'),
  tester: T('Може вмикати прапорці в тестових просторах; помилкова функція може зачепити тестових користувачів, але не всіх.', 'Kan vlaggen in testruimtes aanzetten; een foute functie kan testgebruikers raken, maar niet iedereen.'),
  auditor: T('Читає повний журнал, включно з тим, хто що змінив; це чутливо, хоча змінювати нічого не може.', 'Leest het volledige logboek, ook wie wat wijzigde; dat is gevoelig, al kan hij niets wijzigen.'),
  eigenaar: T('Повна влада над сервером, включно з SSH на хост і ключами. Цю роль не можна видати іншим.', 'Volledige macht over de server, ook SSH op de host en sleutels. Deze rol kan niet aan anderen worden gegeven.'),
};
for (const r of TECH_ROLLEN) {
  hulpRegistreren({ [`tech.rol.${r.id}`]: van(r.help, 'shared/tech-rollen.ts', r.help.risico ? {} : { risico: ROL_RISICO[r.id] }) });
}

// ================================================================== SSH-сертифікати (src/ssh/SshBeheer.tsx)
const SSH = 'src/ssh/SshBeheer.tsx';
hulpRegistreren({
  'ssh.certificaat': van(HELP_SSH, 'shared/ssh-ca.ts'),
  ...Object.fromEntries(Object.entries(HELP_SSH_BEHEER).map(([k, h]) => [`ssh.${k}`, van(h, SSH)])),
  'ssh.schakelaar': item(SSH,
    T('Головний перемикач підпису SSH-сертифікатів (ssh-ca у root-файлі mcp-rechten.json).', 'Hoofdschakelaar voor het ondertekenen van SSH-certificaten (ssh-ca in het root-bestand mcp-rechten.json).'),
    T('Увімкнено: власник може отримувати сертифікати 5–60 хв. Вимкнено: нових не буде, видані діють до кінця.', 'Aan: de eigenaar kan certificaten van 5–60 min krijgen. Uit: geen nieuwe meer, uitgegeven certificaten gelden tot hun einde.'),
    T('Увімкнення відкриває вхід на сервер як beheer — потрібен passkey, який перевіряє root. Вимкнення безпечне й діє одразу.', 'Aanzetten opent een aanmelding als beheer op de server — met een passkey die root controleert. Uitzetten is veilig en werkt meteen.'),
    T('Root: mijn-ruimte-ssh-ca beheer (aan/uit) через mijn-ruimte-ssh-ca-beheer.service; змінюється лише ключ "ssh-ca" у /etc/mijn-ruimte/mcp-rechten.json і path-юніт mijn-ruimte-ssh-ca.path.', 'Root: mijn-ruimte-ssh-ca beheer (aan/uit) via mijn-ruimte-ssh-ca-beheer.service; alleen de sleutel "ssh-ca" in /etc/mijn-ruimte/mcp-rechten.json en de path-unit mijn-ruimte-ssh-ca.path veranderen.')),
});

// ================================================================== термінал (src/terminal/Terminal.tsx)
const TERM = 'src/terminal/Terminal.tsx';
hulpRegistreren({
  'terminal.openen': van(HELP_TERMINAL, TERM),
  'terminal.map': item(TERM,
    T('Тека пристрою, яку буде змонтовано в контейнер як /werk.', 'De map van het apparaat die in de container als /werk wordt aangekoppeld.'),
    T('Команди бачать лише цю теку; решта диска пристрою недоступна. Список тек задає власник пристрою в агенті.', 'Opdrachten zien alleen deze map; de rest van de schijf blijft onbereikbaar. De lijst kiest de eigenaar van het apparaat in de agent.'),
    T('Якщо обрати теку з чутливими файлами, їх можна прочитати в сеансі (і вивід потрапить у запис сеансу).', 'Kiest u een map met gevoelige bestanden, dan zijn die in de sessie te lezen (en komt de uitvoer in de opname).'),
    T('roots[] з конфігурації агента (agent.mjs terminal-config); монтування bind у podman, alleenLezen → :ro (shared/terminal.ts).', 'roots[] uit de agentconfiguratie (agent.mjs terminal-config); bind-mount in podman, alleenLezen → :ro (shared/terminal.ts).')),
  'terminal.schrijven': item(TERM,
    T('Дозволяє запис в обрану теку; типово тека лише для читання.', 'Staat schrijven in de gekozen map toe; standaard is de map alleen-lezen.'),
    T('Команди зможуть створювати, змінювати й видаляти файли в /werk — зміни лишаються на пристрої після сеансу.', 'Opdrachten kunnen bestanden in /werk maken, wijzigen en verwijderen — de wijzigingen blijven na de sessie op het apparaat.'),
    T('Помилкова команда (rm, перезапис) знищить файли без кошика. Вмикайте лише коли справді треба змінювати.', 'Een foute opdracht (rm, overschrijven) wist bestanden zonder prullenbak. Zet dit alleen aan als u echt moet wijzigen.'),
    T('Поле schrijven у запиті терміналу; агент монтує :rw лише якщо root тієї теки не позначено alleenLezen.', 'Veld schrijven in het terminalverzoek; de agent koppelt :rw alleen aan als de root van die map niet alleenLezen is.')),
  'terminal.duur': item(TERM,
    T('Скільки триває сеанс терміналу: 5–60 хв (у межах ролі).', 'Hoe lang de terminalsessie duurt: 5–60 min (binnen de rol).'),
    T('Після цього часу контейнер зупиняється, а сеанс закривається автоматично.', 'Na die tijd stopt de container en sluit de sessie automatisch.'),
    T('Довгий сеанс лишає відкриту консоль без нагляду; незбережений вивід втрачається при завершенні.', 'Een lange sessie laat een open console zonder toezicht achter; niet-bewaarde uitvoer gaat verloren bij het einde.'),
    T('maxMinuten приходить від агента/ролі (terminal.test ≤ 30, terminal.servers ≤ 60); сервер обрізає й записує в app.terminal_sessies.', 'maxMinuten komt van agent/rol (terminal.test ≤ 30, terminal.servers ≤ 60); de server kapt af en schrijft in app.terminal_sessies.')),
  // Zone G (22.10.2026): opdracht-terminal op de server zelf / PowerShell op een pc.
  'terminal.opdracht': van(HELP_TERMINAL_OPDRACHT, TERM),
  'terminal.bevestiging': item(TERM,
    T('Коли командний термінал просить підтвердити команду перед виконанням на цьому пристрої.', 'Wanneer de opdracht-terminal een opdracht laat bevestigen vóór ze op dit apparaat draait.'),
    T('«Лише команди, що змінюють»: читання (ls, git status, systemctl status, journalctl…) виконується одразу, зміни (git pull, systemctl restart…) — після кліку. «Кожна команда»: клік завжди. PowerShell підтверджується завжди.', '«Alleen wijzigende»: lezen (ls, git status, systemctl status, journalctl…) loopt meteen, wijzigingen (git pull, systemctl restart…) na een klik. «Elke opdracht»: altijd een klik. PowerShell wordt altijd bevestigd.'),
    T('Таблиця «читання/зміна» — найкраще знання, не гарантія: невідома програма чи підкоманда вважається зміною. Підтвердження — захист від одруку, а не від зловмисника з вашим сеансом.', 'De tabel «lezen/wijzigen» is beste kennis, geen garantie: een onbekend programma of werkwoord telt als wijziging. De bevestiging beschermt tegen een typefout, niet tegen een aanvaller met uw sessie.'),
    T('app.agents.policy.terminalBevestiging (wijzigend|alles) через POST /api/terminal/instelling (stap-op); класифікація opdrachtSoort у shared/terminal-opdrachten.ts, дзеркало LEZEND в agent.mjs (cwd у readonly-root лише для читання).', 'app.agents.policy.terminalBevestiging (wijzigend|alles) via POST /api/terminal/instelling (stap-op); classificatie opdrachtSoort in shared/terminal-opdrachten.ts, spiegel LEZEND in agent.mjs (cwd in een readonly-root alleen voor lezen).')),
});

// ================================================================== віддалений стіл (src/extern/ExternBureaublad.tsx)
const RB = 'src/extern/ExternBureaublad.tsx';
hulpRegistreren({
  'remote.protocol': item(RB,
    T('Як підключатися до комп’ютера: RDP (Windows), VNC (Linux/macOS) або SSH (термінал).', 'Hoe met de computer te verbinden: RDP (Windows), VNC (Linux/macOS) of SSH (terminal).'),
    T('Змінює стандартний порт і доступні налаштування (роздільність і безпека лише для RDP).', 'Verandert de standaardpoort en de beschikbare instellingen (resolutie en beveiliging alleen voor RDP).'),
    T('VNC часто без шифрування — вмикайте лише в довіреній мережі; SSH і RDP з TLS безпечніші.', 'VNC is vaak onversleuteld — gebruik het alleen in een vertrouwd netwerk; SSH en RDP met TLS zijn veiliger.'),
    T('REMOTE_PROTOCOLLEN і STANDAARD_POORT у shared/extern-bureaublad.ts; з’єднання робить guacd (Apache Guacamole) на сервері.', 'REMOTE_PROTOCOLLEN en STANDAARD_POORT in shared/extern-bureaublad.ts; de verbinding maakt guacd (Apache Guacamole) op de server.')),
  'remote.resolutie': item(RB,
    T('Розмір віддаленого екрана, якщо вікно браузера менше.', 'Schermgrootte op afstand als het browservenster kleiner is.'),
    T('Віддалений комп’ютер малює екран такого розміру; браузер масштабує його під вікно.', 'De computer op afstand tekent een scherm van die grootte; de browser schaalt het naar het venster.'),
    T('Лише вигляд і трафік: більша роздільність — більше даних і повільніше на слабкому зв’язку.', 'Alleen weergave en verkeer: een hogere resolutie is meer data en trager op een zwakke verbinding.'),
    T('instellingen.breedte/hoogte у app.remote_verbindingen; передається guacd як width/height/dpi.', 'instellingen.breedte/hoogte in app.remote_verbindingen; gaat naar guacd als width/height/dpi.')),
  'remote.beveiliging': item(RB,
    T('Тип захисту з’єднання RDP: автоматично, NLA, TLS або старий RDP.', 'Beveiliging van de RDP-verbinding: automatisch, NLA, TLS of het oude RDP.'),
    T('Визначає, як сервер і комп’ютер домовляються про шифрування та вхід.', 'Bepaalt hoe server en computer versleuteling en aanmelding afspreken.'),
    T('«RDP» без NLA/TLS слабший: пароль і екран можна перехопити в мережі. Обирайте NLA, якщо комп’ютер підтримує.', '«RDP» zonder NLA/TLS is zwakker: wachtwoord en scherm zijn in het netwerk te onderscheppen. Kies NLA als de computer het kan.'),
    T('Параметр security guacd (any|nla|tls|rdp); зберігається в instellingen.beveiliging.', 'Parameter security van guacd (any|nla|tls|rdp); bewaard in instellingen.beveiliging.')),
  'remote.klembord': item(RB,
    T('Спільний буфер обміну між вашим браузером і віддаленим комп’ютером.', 'Gedeeld klembord tussen uw browser en de computer op afstand.'),
    T('Скопійоване в одному місці можна вставити в іншому (текст).', 'Wat u op de ene plek kopieert, kunt u op de andere plakken (tekst).'),
    T('Паролі чи секрети з буфера можуть потрапити на віддалений комп’ютер або навпаки.', 'Wachtwoorden of geheimen uit het klembord kunnen op de computer op afstand belanden of omgekeerd.'),
    T('guacd disable-copy/disable-paste = !klembord; опкод clipboard рахується як активність (shared/extern-bureaublad.ts).', 'guacd disable-copy/disable-paste = !klembord; de opcode clipboard telt als activiteit (shared/extern-bureaublad.ts).')),
  'remote.bestanden': item(RB,
    T('Передавання файлів між браузером і віддаленим комп’ютером.', 'Bestandsoverdracht tussen browser en de computer op afstand.'),
    T('Файли зможуть іти в обидва боки (завантаження й вивантаження).', 'Bestanden kunnen beide kanten op (uploaden en downloaden).'),
    T('Через це можна винести дані або занести шкідливий файл. Типово вимкнено; вмикайте на час потреби.', 'Zo kunnen gegevens weg of kan een schadelijk bestand binnenkomen. Standaard uit; zet het aan zolang het nodig is.'),
    T('guacd enable-drive/SFTP лише при bestanden=true; опкоди file/put/pipe блокуються проксі, якщо вимкнено (BESTAND_OPCODES).', 'guacd enable-drive/SFTP alleen bij bestanden=true; opcodes file/put/pipe blokkeert de proxy als het uit staat (BESTAND_OPCODES).')),
  'remote.opnemen': item(RB,
    T('Записувати весь сеанс (екран) на сервері на 30 днів.', 'De hele sessie (scherm) 30 dagen op de server opnemen.'),
    T('Запис можна переглянути пізніше; у журналі буде позначка про запис.', 'De opname is later te bekijken; het logboek vermeldt de opname.'),
    T('У записі видно все на екрані, включно з особистими даними. Доступ до записів — лише в технічному профілі з правом перегляду.', 'In de opname staat alles wat op het scherm stond, ook persoonsgegevens. Opnames bekijken kan alleen in een technisch profiel met dat recht.'),
    T('guacd recording-path=/srv/data/guac-opnames (0750, 30 днів через tmpfiles.d); ім’я запису в app.remote_sessies.opname.', 'guacd recording-path=/srv/data/guac-opnames (0750, 30 dagen via tmpfiles.d); naam van de opname in app.remote_sessies.opname.')),
  'remote.cert': item(RB,
    T('Приймати самопідписаний сертифікат RDP-комп’ютера (типово в локальній мережі).', 'Een zelfondertekend certificaat van de RDP-computer aanvaarden (gebruikelijk in een lokaal netwerk).'),
    T('З’єднання не зупиниться через невідомий сертифікат.', 'De verbinding stopt niet bij een onbekend certificaat.'),
    T('Без перевірки сертифіката підмінений комп’ютер у мережі (MITM) може перехопити вхід. Вимикайте для публічних адрес.', 'Zonder certificaatcontrole kan een vervalste computer in het netwerk (MITM) de aanmelding onderscheppen. Zet het uit voor publieke adressen.'),
    T('guacd ignore-cert = certNegeren; стосується лише RDP. Альтернатива — довірений сертифікат на комп’ютері й вимкнений прапорець.', 'guacd ignore-cert = certNegeren; alleen voor RDP. Alternatief: een vertrouwd certificaat op de computer en dit vinkje uit.')),
});

// ================================================================== прапорці (src/vlaggen/Vlaggen.tsx)
// shared/vlaggen wordt bewust NIET geïmporteerd (tests/eenheid/vlaggen.test.ts: een vlag is nooit een recht; alleen de routes importeren het).
const FL = 'src/vlaggen/Vlaggen.tsx';
hulpRegistreren({
  'flags.aan': item(FL,
    T('Головний перемикач прапорця. Вимкнено — функція вимкнена для всіх, незалежно від інших полів.', 'Hoofdschakelaar van de vlag. Uit — de functie staat voor iedereen uit, wat de andere velden ook zeggen.'),
    T('Увімкнено: діють частка користувачів, список людей і «типово увімкнено».', 'Aan: het percentage, de lijst met mensen en «standaard aan» gelden.'),
    T('Прапорець лише показує чи ховає функцію; він ніколи не дає прав. Помилкова функція може зачепити обраних користувачів.', 'Een vlag toont of verbergt alleen een functie; hij geeft nooit rechten. Een foute functie kan de gekozen gebruikers raken.'),
    T('app.feature_flags.aan; обчислення в backend/vlaggen.ts (evalueer), стабільний хеш користувача для частки.', 'app.feature_flags.aan; berekening in backend/vlaggen.ts (evalueer), stabiele hash van de gebruiker voor het percentage.')),
  'flags.standaard': item(FL,
    T('Типово увімкнено для всіх (лише коли частка = 0 %).', 'Standaard aan voor iedereen (alleen als het percentage 0 % is).'),
    T('Функцію побачать усі користувачі, крім тих, кому її вимкнено окремо.', 'Alle gebruikers zien de functie, behalve wie haar apart uit heeft.'),
    T('Це фактично повне розгортання: перевірте функцію в тестовому просторі перед увімкненням.', 'Dit is in feite een volledige uitrol: test de functie eerst in een testruimte.'),
    T('app.feature_flags.standaard; має сенс лише при percentage = 0 (інакше діє частка).', 'app.feature_flags.standaard; heeft alleen zin bij percentage = 0 (anders geldt het percentage).')),
  'flags.voor-mij': item(FL,
    T('«Увімкнено для мене» вмикає або вимикає цю функцію лише для вас, щоб ви могли її спробувати.', '«Aan voor mij» zet deze functie alleen voor u aan of uit, zodat u haar kunt proberen.'),
    T('Інші люди нічого не помітять. Ваш вибір діє до кінця технічного сеансу (не довше 8 годин), потім повертається звичайний стан. «Повернути як типово» прибирає ваш вибір одразу.', 'Anderen merken niets. Uw keuze geldt tot het einde van de technische sessie (hoogstens 8 uur), daarna is alles weer gewoon. «Terug naar standaard» haalt uw keuze meteen weg.'),
    T('Перемикач сірий, якщо ваша роль у технічному профілі не може вмикати функції для себе (можуть: Тестувальник, Розробник, Власник сервера).', 'Grijs als uw rol in het technisch profiel dit niet mag (wel: Tester, Ontwikkelaar, Eigenaar van de server).'),
    T('POST /api/beheer/flags/test; app.feature_flag_tests.tot = min(кінець активації, зараз + 8 год).', 'POST /api/beheer/flags/test; app.feature_flag_tests.tot = min(einde activering, nu + 8 uur).')),
});

// ================================================================== «Увійти як» і підтримка
hulpRegistreren({
  'uitrol.toegang': item('src/uitrol/ToegangBlok.tsx',
    T('Хто зараз має дозвіл готувати й завантажувати пакети. Статус «діє» лише тоді, коли дозвіл не прострочений, не відкликаний, не заблокований політикою ШІ і підключення ще існує — так само, як у «Налаштування».', 'Wie nu pakketten mag voorbereiden en uploaden. «Actief» alleen als de toestemming niet verlopen, niet ingetrokken, niet door het AI-beleid geblokkeerd is en de koppeling nog bestaat — zoals in «Instellingen».'),
    T('Цей блок не показує, хто справді зробив випуск — це видно в описі кожного випуску (учасники).', 'Dit blok toont niet wie een release echt maakte — dat staat bij elke release (deelnemers).'),
    T('Встановлення схвалюєте лише ви (passkey).', 'Installeren keurt alleen u goed (passkey).'),
    T('Логіка: src/uitrol/weergave-v2.ts effectieveToegang.', 'Logica: src/uitrol/weergave-v2.ts effectieveToegang.')),
  'uitrol.problemen': item('src/uitrol/ProblemenSamenvatting.tsx',
    T('Спроби за останні 7 днів, які не дійшли до встановлення й ще не замінені новішим випуском. Повний перелік — в «Історії».', 'Pogingen van de laatste 7 dagen die niet tot een installatie kwamen en nog niet door een nieuwere release zijn ingehaald. De volledige lijst staat in «Geschiedenis».'),
    T('Тут лише короткий підсумок; нічого не видаляється.', 'Hier staat alleen een korte samenvatting; er wordt niets gewist.'),
    T('Ризику немає: це лише показ, спроби в журналі аудиту не змінюються.', 'Geen risico: alleen weergave, de pogingen in het auditlogboek veranderen niet.'), T('Логіка: src/uitrol/weergave-v2.ts recenteProblemen.', 'Logica: src/uitrol/weergave-v2.ts recenteProblemen.')),
  'imp.duur': van(HELP_IMP_AANVRAGEN, 'src/impersonatie/Impersonatie.tsx'),
  'imp.acties': van(HELP_IMP_TOESTEMMING, 'src/impersonatie/Impersonatie.tsx'),
  'ond.duur': van(HELP_ONDERSTEUNING, 'src/ondersteuning/Ondersteuning.tsx'),
  'ond.nood': item('src/ondersteuning/Ondersteuning.tsx',
    T('Термінова підтримка без згоди користувача — лише для власника сервера.', 'Noodondersteuning zonder toestemming van de gebruiker — alleen voor de eigenaar van de server.'),
    T('Доступ починається одразу; користувач отримує сповіщення негайно і бачить запис у журналі.', 'De toegang begint meteen; de gebruiker krijgt direct een melding en ziet de regel in het logboek.'),
    T('Це обхід згоди: використовуйте лише при аварії (злам, втрата доступу). Кожне використання видно користувачу.', 'Dit omzeilt de toestemming: gebruik het alleen bij een noodgeval (inbraak, verloren toegang). Elk gebruik ziet de gebruiker.'),
    T('Поле nood у app.ondersteuning_verzoeken; дозволено лише isEigenaar; окремий код аудиту ondersteuning.nood (shared/ondersteuning.ts).', 'Veld nood in app.ondersteuning_verzoeken; alleen isEigenaar mag het; aparte auditcode ondersteuning.nood (shared/ondersteuning.ts).')),
  'ond.toestemming': van(HELP_TOESTEMMING, 'src/ondersteuning/Ondersteuning.tsx'),
});

// ================================================================== захист (src/beveiliging/Beveiliging.tsx, міграція 0066)
const BV = 'src/beveiliging/Beveiliging.tsx';
hulpRegistreren({
  'beveiliging.auth-poort': item(BV,
    T('Сітка безпеки воріт доступу: будь-яка анонімна відповідь 2xx поза списком публічних маршрутів стає 401.', 'Vangnet van de toegangspoort: elk anoniem 2xx-antwoord buiten de lijst met publieke routes wordt 401.'),
    T('Маршрут, якому забули додати перевірку входу, перестане віддавати дані без входу.', 'Een route waar de aanmeldcontrole vergeten is, geeft zonder aanmelding geen gegevens meer.'),
    T('Публічна сторінка, якої немає в PUBLIEKE_ROUTES, зламається для гостей. Перед увімкненням сервер перевіряє готовність; 10 хв нагляду з автоматичним вимкненням.', 'Een publieke pagina die niet in PUBLIEKE_ROUTES staat, breekt voor gasten. Vóór het aanzetten controleert de server de gereedheid; 10 min bewaking met automatisch uit.'),
    T('app.beveiliging_schakelaars (sleutel auth-poort); env AUTH_POORT_AFDWINGEN має перевагу; backend/beveiliging-schakelaars.ts.', 'app.beveiliging_schakelaars (sleutel auth-poort); env AUTH_POORT_AFDWINGEN gaat voor; backend/beveiliging-schakelaars.ts.')),
  'beveiliging.opa-afdwingen': item(BV,
    T('Права адміністрування лише в активному технічному профілі; політика OPA вирішує fail-closed.', 'Beheerrechten alleen in een actief technisch profiel; het OPA-beleid beslist fail-closed.'),
    T('Без активного технічного профілю адмін-дії відхиляються, навіть для адміністраторів.', 'Zonder actief technisch profiel worden beheeracties geweigerd, ook voor beheerders.'),
    T('Якщо OPA недоступний, адмін-дії блокуються (fail-closed). Вимкнути можна завжди, без passkey.', 'Is OPA onbereikbaar, dan zijn beheeracties geblokkeerd (fail-closed). Uitzetten kan altijd, zonder passkey.'),
    T('app.beveiliging_schakelaars (opa-afdwingen); root "beheer-alleen-tech" і env OPA_AFDWINGEN мають перевагу; backend/beleid.ts afdwingAdmin.', 'app.beveiliging_schakelaars (opa-afdwingen); root "beheer-alleen-tech" en env OPA_AFDWINGEN gaan voor; backend/beleid.ts afdwingAdmin.')),
  'beveiliging.rls': item(BV,
    T('Row Level Security у базі: роль застосунку бачить лише рядки свого користувача.', 'Row Level Security in de database: de app-rol ziet alleen rijen van de eigen gebruiker.'),
    T('Навіть помилка в коді запиту не покаже чужі дані — база сама відфільтрує.', 'Zelfs een fout in een query toont geen gegevens van anderen — de database filtert zelf.'),
    T('Запит, що покладався на чужі рядки без системної ролі, почне повертати порожньо. Готовність перевіряється синтетичними рядками до увімкнення.', 'Een query die op rijen van anderen leunde zonder systeemrol, geeft dan niets meer. De gereedheid wordt vóór het aanzetten met synthetische rijen bewezen.'),
    T('app.rls_instellingen через app.rls_afdwingen_zetten() (SECURITY DEFINER); міграція 0066, пробна GUC app.rls_proef.', 'app.rls_instellingen via app.rls_afdwingen_zetten() (SECURITY DEFINER); migratie 0066, proef-GUC app.rls_proef.')),
});

// ================================================================== діагностика: рендер-контроль (src/diagnostiek/RenderingKnop.tsx, zone A 22.10.2026)
hulpRegistreren({
  'diagnostiek.rendering-aanvragen': item('src/diagnostiek/RenderingKnop.tsx',
    T('Запускає перевірку рендерингу: root відкриває ключові сторінки сайту у headless Chromium на сервері (стенд із тестовим власником і технічним профілем на одноразовій базі).', 'Start de rendercontrole: root opent de sleutelpagina’s van de site in een headless Chromium op de server (stand met testeigenaar en technisch profiel op een wegwerpdatabase).'),
    T('За хвилину root виконує перевірку (1–2 хв); результат з’являється на картці «Рендеринг сторінок» після «Перевірити». Сайт сам браузер не запускає.', 'Binnen een minuut voert root de controle uit (1–2 min); de uitslag verschijnt op de kaart «Rendering van pagina’s» na «Controleren». De site start zelf geen browser.'),
    T('Низький ризик: перевірка читає лише власні сторінки через loopback; одноразова база видаляється; не частіше 3 разів на 10 хв. Без браузера на сервері кнопка вимкнена.', 'Laag risico: de controle leest alleen eigen pagina’s via loopback; de wegwerpdatabase wordt verwijderd; hoogstens 3 keer per 10 min. Zonder browser op de server is de knop uit.'),
    T('POST /api/owner/admin/diagnostiek/rendering {aanvragen:true} → порожній файл goedkeur-inbox/rook-verzoek → mijn-ruimte-nazorg.sh (root, щохвилини) → mijn-ruimte-installeer rook-controle → rook-controle.json (backend/rook-controle.ts, scripts/rook-controle.mjs).', 'POST /api/owner/admin/diagnostiek/rendering {aanvragen:true} → leeg bestand goedkeur-inbox/rook-verzoek → mijn-ruimte-nazorg.sh (root, elke minuut) → mijn-ruimte-installeer rook-controle → rook-controle.json (backend/rook-controle.ts, scripts/rook-controle.mjs).')),
});

// ================================================================== розгортання (src/uitrol/*)
hulpRegistreren({
  'uitrol.hoofdbron': item('src/uitrol/Bronnen.tsx',
    T('Головне джерело стану розгортання для сторінки та MCP: історія запусків, status.json, карта релізів або версія.', 'Hoofdbron van de uitrolstand voor pagina en MCP: runhistorie, status.json, releasemap of versie.'),
    T('Сторінка й агенти показуватимуть стан саме з цього джерела.', 'Pagina en agents tonen de stand uit precies deze bron.'),
    T('Інші джерела не мають історії або відстають — можна побачити застарілий стан. Повертайте «Історія запусків» після діагностики.', 'Andere bronnen hebben geen historie of lopen achter — u kunt een verouderde stand zien. Zet na diagnose «Runhistorie» terug.'),
    T('Hoofdbron у backend/uitrol-bron.ts (huidigeStand); зберігається для власника; MCP читає те саме.', 'Hoofdbron in backend/uitrol-bron.ts (huidigeStand); bewaard per eigenaar; MCP leest hetzelfde.')),
  'uitrol.interval': item('src/uitrol/Bronnen.tsx',
    T('Як часто сторінка оновлює стан розгортання (10–120 с).', 'Hoe vaak de pagina de uitrolstand vernieuwt (10–120 s).'),
    T('Менший інтервал — свіжіші дані, але більше запитів до сервера.', 'Een korter interval geeft verser gegevens maar meer verzoeken aan de server.'),
    T('Низький ризик: надто частий опит навантажує сервер під час установлення; 30 с зазвичай досить.', 'Laag risico: te vaak pollen belast de server tijdens een installatie; 30 s is meestal genoeg.'),
    T('Клієнтське налаштування (інтервал опитування /api/owner/uitrol/stand); сервер має власний rate-limit.', 'Instelling aan de clientkant (polling-interval van /api/owner/uitrol/stand); de server heeft een eigen rate-limit.')),
  'uitrol.github-auto': item('src/uitrol/GithubInstellingen.tsx',
    T('Автоматично публікувати код у GitHub після кожного успішного встановлення.', 'Automatisch de code naar GitHub publiceren na elke geslaagde installatie.'),
    T('Після вдалого розгортання сервер сам створює коміт/тег у вказаному репозиторії.', 'Na een geslaagde uitrol maakt de server zelf een commit/tag in de opgegeven repository.'),
    T('Код піде в репозиторій без ручної перевірки; переконайтеся, що репозиторій приватний і в пакеті немає секретів.', 'De code gaat zonder handcontrole naar de repository; zorg dat die privé is en dat er geen geheimen in het pakket zitten.'),
    T('backend/uitrol-github.ts; токен у сховищі (GITHUB_TOKEN), не в браузері; вимкнено = лише кнопка «Опублікувати».', 'backend/uitrol-github.ts; token in de kluis (GITHUB_TOKEN), niet in de browser; uit = alleen de knop «Publiceren».')),
  'uitrol.zone': item('src/uitrol/ZoneKiezer.tsx',
    T('Часова зона для терміналу, кроків та історії розгортання.', 'Tijdzone voor de terminal, stappen en historie van de uitrol.'),
    T('Усі часи на сторінці перераховуються в обрану зону; сервер і далі пише UTC.', 'Alle tijden op de pagina worden in de gekozen zone omgerekend; de server schrijft nog steeds UTC.'),
    T('Лише вигляд. Порівнюючи з логами сервера (UTC), пам’ятайте про різницю в годинах.', 'Alleen weergave. Vergelijkt u met serverlogs (UTC), denk dan aan het verschil in uren.'),
    T('src/uitrol/tijdzone.ts (zetZone/zoneKeuze), зберігається в браузері; дані з сервера завжди ISO UTC.', 'src/uitrol/tijdzone.ts (zetZone/zoneKeuze), bewaard in de browser; gegevens van de server zijn altijd ISO UTC.')),
});

// ================================================================== сховище та інтеграції
hulpRegistreren({
  'geheimen.doel': item('src/geheimen/Geheimen.tsx',
    T('Для якого сервісу цей секрет (GitHub, Telegram, Home Assistant…).', 'Voor welke dienst dit geheim is (GitHub, Telegram, Home Assistant…).'),
    T('Визначає, хто з частин сайту може його використовувати і в якій групі він показується.', 'Bepaalt welke onderdelen van de site het mogen gebruiken en in welke groep het staat.'),
    T('Неправильне призначення — сервіс не знайде ключ або ключ потрапить туди, де він не потрібен.', 'Een fout doel: de dienst vindt de sleutel niet, of de sleutel komt waar hij niet nodig is.'),
    T('VAULT_DOELEN / DOEL_INFO у shared/kluis-meta.ts; значення шифрується в owner_vault_v1 і більше не показується.', 'VAULT_DOELEN / DOEL_INFO in shared/kluis-meta.ts; de waarde wordt versleuteld in owner_vault_v1 en daarna niet meer getoond.')),
  'keys.doel': item('src/BeheerSleutelsWeergave.tsx',
    T('Призначення ключа API, який ви додаєте до сховища.', 'Doel van de API-sleutel die u aan de kluis toevoegt.'),
    T('Ключ буде прив’язано до цього сервісу; інші сервіси його не використовуватимуть.', 'De sleutel wordt aan deze dienst gekoppeld; andere diensten gebruiken hem niet.'),
    T('Ключ зберігається зашифровано, але хто має доступ до сервісу, той фактично користується ключем.', 'De sleutel wordt versleuteld bewaard, maar wie toegang tot de dienst heeft, gebruikt de sleutel in feite.'),
    T('POST /api/owner/api-platform/vault (purpose); тексти шифруються TOTP_ENCRYPTION_KEY_V1-подібним ключем сховища.', 'POST /api/owner/api-platform/vault (purpose); waarden versleuteld met de kluissleutel (zoals TOTP_ENCRYPTION_KEY_V1).')),
  'integraties.voor-gebruikers': item('src/integraties/Detail.tsx',
    T('Чи можуть звичайні користувачі сайту бачити й підключати цю інтеграцію.', 'Of gewone gebruikers van de site deze integratie kunnen zien en koppelen.'),
    T('Увімкнено: інтеграція з’являється в користувачів. Вимкнено: лише для адміністратора.', 'Aan: de integratie verschijnt bij gebruikers. Uit: alleen voor de beheerder.'),
    T('Користувачі підключатимуть власні акаунти — перевірте, що інтеграція готова і має зрозумілі дозволи.', 'Gebruikers koppelen dan eigen accounts — controleer dat de integratie klaar is en duidelijke rechten vraagt.'),
    T('POST /api/owner/integraties/beleid (voorGebruikers); кожна зміна в журналі; каталог shared/integraties-catalogus.ts.', 'POST /api/owner/integraties/beleid (voorGebruikers); elke wijziging in het logboek; catalogus shared/integraties-catalogus.ts.')),
  'integraties.v2-catalogus': item('src/integraties/CatalogusV2.tsx',
    T('Сервіси згруповано за темами. У кожній темі: що вже підключено, що можна підключити, що потребує уваги чи налаштування, і що ще в розробці.', 'Diensten staan per thema. Per thema: wat gekoppeld is, wat u kunt koppelen, wat aandacht of instelling vraagt, en wat nog in ontwikkeling is.'),
    T('Групу визначає справжній стан, прочитаний із сервера, а не напис. «Підключено» означає, що сервер бачить підключення; час останньої перевірки показано на картці.', 'De groep komt uit de echte stand die de server las, niet uit een label. «Gekoppeld» betekent dat de server de koppeling ziet; de tijd van de laatste controle staat op de kaart.'),
    T('Згорнуті групи й вибраний вигляд зберігаються лише в цьому браузері. Помилки підключення завжди видно вгорі.', 'Ingeklapte groepen en de gekozen weergave worden alleen in deze browser bewaard. Koppelfouten staan altijd bovenaan.'),
    T('Групи: shared/integraties-register.ts → groepVan(); стан: POST /api/owner/admin/integraties/stand і /google-stand; опис усіх 160: docs/integraties/INVENTARIS.md.', 'Groepen: shared/integraties-register.ts → groepVan(); stand: POST /api/owner/admin/integraties/stand en /google-stand; alle 160 beschreven: docs/integraties/INVENTARIS.md.')),
  'integraties.strook': item('src/integraties/IntegratieStrook.tsx',
    T('Тут видно, які сервіси можна підключити саме для цього розділу.', 'Hier ziet u welke diensten u voor dit onderdeel kunt koppelen.'),
    T('Позначка показує технічну готовність із каталогу, а не стан вашого облікового запису. Стан підключення видно в блоці облікових записів нижче.', 'Het label toont de technische gereedheid uit de catalogus, niet de stand van uw account. De koppelstand staat in het accountsblok eronder.'),
    T('Щоб підключити сервіс, відкрийте «Увесь каталог» і натисніть «Підключити».', 'Om een dienst te koppelen opent u «Hele catalogus» en kiest u «Koppelen».'),
    T('Дані: shared/integraties-register.ts (doelDienst); вмикається прапорцем integraties-catalogus-v2.', 'Gegevens: shared/integraties-register.ts (doelDienst); aan via vlag integraties-catalogus-v2.')),
  'integraties.generator-soort': item('src/integraties/LokaleGenerator.tsx',
    T('Який API має ваш локальний генератор зображень (A1111/Forge або OpenAI-сумісний).', 'Welk API uw lokale afbeeldingsgenerator heeft (A1111/Forge of OpenAI-compatibel).'),
    T('Сервер звертатиметься до генератора саме цим протоколом; інший тип дасть помилку перевірки.', 'De server spreekt de generator met dit protocol aan; een verkeerd type geeft een fout bij «Controleren».'),
    T('Генератор працює лише на цьому сервері або в приватній мережі — адреси назовні заборонені.', 'De generator draait alleen op deze server of in het privénetwerk — adressen naar buiten zijn verboden.'),
    T('shared/media-generator.ts (GENERATOR_SOORTEN); backend/media-generator.ts; налаштування в app.ai_media_generator (0099).', 'shared/media-generator.ts (GENERATOR_SOORTEN); backend/media-generator.ts; instelling in app.ai_media_generator (0099).')),
  'integraties.generator-aan': item('src/integraties/LokaleGenerator.tsx',
    T('Чи може ШІ з дозволом «Створювати зображення» користуватися цим генератором.', 'Of een AI met het recht «Afbeeldingen genereren» deze generator mag gebruiken.'),
    T('Увімкнено: інструмент працює (після підтвердження на сайті). Вимкнено: інструмент відповідає, що генератор вимкнено.', 'Aan: het hulpmiddel werkt (na bevestiging op de site). Uit: het hulpmiddel meldt dat de generator uitstaat.'),
    T('Генерація навантажує ваш сервер; результат зберігається в хмару людини, яка підтвердила.', 'Genereren belast uw server; het resultaat komt in de cloud van wie bevestigde.'),
    T('app.ai_media_generator.aan (0099); backend/media-generator.ts; інструмент image_generate.', 'app.ai_media_generator.aan (0099); backend/media-generator.ts; hulpmiddel image_generate.')),
  'integraties.merk-bron': item('src/integraties/MerkBronBeheer.tsx',
    T('Чи отримує сервер логотипи відправників з їхніх доменів (BIMI-запис або значок сайту).', 'Of de server logo\'s van afzenders van hun eigen domein ophaalt (BIMI-record of site-icoon).'),
    T('Увімкнено: біля листів і на плитках сервісів з’являються справжні логотипи, збережені в базі сайту. Вимкнено: нейтральна плитка.', 'Aan: bij berichten en op diensttegels verschijnen echte logo\'s, bewaard in de database van de site. Uit: de neutrale tegel.'),
    T('Запит іде з вашого сервера: власник домену відправника бачить IP вашого сервера (не адресу людини).', 'Het verzoek vertrekt van uw server: de eigenaar van het domein ziet het IP van uw server (niet het adres van de mens).'),
    T('app.merk_bron_instelling (0097); backend/merk-bron.ts (BIMI → link rel=icon → manifest → favicon; лише https, публічні IP, 256 КБ).', 'app.merk_bron_instelling (0097); backend/merk-bron.ts (BIMI → link rel=icon → manifest → favicon; alleen https, publieke IP\'s, 256 kB).')),
  'integraties.merk-eigen': item('src/integraties/MerkEigenBeheer.tsx',
    T('Сервіс, для якого ви завантажуєте офіційний логотип (файл з офіційної сторінки бренду).', 'De dienst waarvoor u het officiële logo uploadt (bestand van de officiële merkpagina).'),
    T('Після завантаження цей логотип показується скрізь на сайті замість нейтральної плитки.', 'Na het uploaden toont de hele site dit logo in plaats van de neutrale tegel.'),
    T('Використовуйте лише файли, які бренд дозволяє показувати; SVG очищується, файли зі скриптами чи зовнішніми посиланнями відхиляються.', 'Gebruik alleen bestanden die het merk toestaat; SVG wordt opgeschoond, bestanden met scripts of externe verwijzingen worden geweigerd.'),
    T('POST /api/owner/admin/merk-eigen/zetten (passkey); тека /srv/mijn-ruimte/merk-eigen (MERK_EIGEN_MAP); до 200 КБ.', 'POST /api/owner/admin/merk-eigen/zetten (passkey); map /srv/mijn-ruimte/merk-eigen (MERK_EIGEN_MAP); tot 200 kB.')),
});

// ================================================================== адміністрування (src/BeheerConsoleWeergave.tsx)
const AC = 'src/BeheerConsoleWeergave.tsx';
hulpRegistreren({
  'admin.oauth.extern': item(AC,
    T('Стандартне рішення для зовнішніх додатків, що просять вхід через ваш акаунт: блокувати, на розгляд чи дозволити.', 'Standaardbeslissing voor externe apps die via uw account willen aanmelden: blokkeren, ter beoordeling of toestaan.'),
    T('Нові зовнішні клієнти OAuth отримають саме це рішення, доки ви не зміните його для конкретного додатка.', 'Nieuwe externe OAuth-clients krijgen precies deze beslissing tot u die per app wijzigt.'),
    T('«Дозволити» відкриває вхід будь-якому додатку без перевірки; безпечніше «на розгляд».', '«Toestaan» opent aanmelden voor elke app zonder controle; «ter beoordeling» is veiliger.'),
    T('admin_oauth_access_policy_v1.defaultExternalAccess (blocked|review|allowed); основний клієнт Core Identity захищений окремо.', 'admin_oauth_access_policy_v1.defaultExternalAccess (blocked|review|allowed); de kernclient Core Identity is apart beschermd.')),
  'admin.sso.aan': item(AC,
    T('Єдиний вхід (SSO) через Google для всіх сервісів сайту.', 'Eenmalige aanmelding (SSO) via Google voor alle diensten van de site.'),
    T('Один вхід діє на всіх піддоменах; вимкнення вимагатиме входу в кожен сервіс окремо.', 'Eén aanmelding geldt op alle subdomeinen; uitzetten vraagt aanmelden per dienst.'),
    T('Викрадений сеанс SSO дає доступ до всіх сервісів одразу — тримайте 2FA/passkey увімкненими.', 'Een gestolen SSO-sessie geeft toegang tot alle diensten tegelijk — houd 2FA/passkey aan.'),
    T('admin_sso_policy_v1.enabled; змінювати може лише роль із sso.manage, з підтвердженням ADMIN_POLICY_CHANGE.', 'admin_sso_policy_v1.enabled; alleen een rol met sso.manage wijzigt het, met bevestiging ADMIN_POLICY_CHANGE.')),
  'admin.sso.koppel-mail': item(AC,
    T('Автоматично пов’язувати особу користувача з його основною Google-поштою.', 'Automatisch de identiteit van de gebruiker aan zijn primaire Google-mailbox koppelen.'),
    T('Після входу поштова скринька з’являється в акаунті без окремого кроку (дозвіл на пошту все одно окремий).', 'Na aanmelden verschijnt de mailbox in het account zonder extra stap (de mailtoestemming blijft apart).'),
    T('Якщо людина входить чужим Google-акаунтом, до її особи прив’яжеться чужа скринька.', 'Meldt iemand zich aan met een Google-account van een ander, dan wordt die mailbox aan zijn identiteit gekoppeld.'),
    T('admin_sso_policy_v1.autoLinkPrimaryMail; mailboxAuthorization лишається required (окремий OAuth-дозвіл).', 'admin_sso_policy_v1.autoLinkPrimaryMail; mailboxAuthorization blijft required (aparte OAuth-toestemming).')),
  'admin.sso.extra-mail': item(AC,
    T('Дозволити користувачам додавати додаткові поштові акаунти.', 'Gebruikers toestaan extra e-mailaccounts toe te voegen.'),
    T('У поштовому клієнті можна підключити більше однієї скриньки.', 'In de mailclient kunnen meer mailboxen worden gekoppeld.'),
    T('Більше підключених скриньок — більше токенів доступу на сервері, які треба захищати.', 'Meer gekoppelde mailboxen betekent meer toegangstokens op de server die beschermd moeten worden.'),
    T('admin_sso_policy_v1.allowAdditionalMailAccounts; токени в сховищі, кожне підключення окремим OAuth-дозволом.', 'admin_sso_policy_v1.allowAdditionalMailAccounts; tokens in de kluis, elke koppeling met een eigen OAuth-toestemming.')),
  'admin.user.status': item(AC,
    T('Стан акаунта користувача: на розгляді, схвалено, заблоковано.', 'Status van het gebruikersaccount: in behandeling, goedgekeurd, geblokkeerd.'),
    T('Схвалений може входити й користуватися сервісами; заблокований — ні, його сеанси закриваються.', 'Een goedgekeurde gebruiker kan aanmelden en diensten gebruiken; een geblokkeerde niet, zijn sessies sluiten.'),
    T('Помилкове блокування відріже людину від пошти й файлів; помилкове схвалення відкриє доступ незнайомцю.', 'Een fout blok sluit iemand af van mail en bestanden; een foute goedkeuring geeft een onbekende toegang.'),
    T('users.status; змінює роль із users.manage; власника змінити не можна (item.owner).', 'users.status; een rol met users.manage wijzigt het; de eigenaar is niet te wijzigen (item.owner).')),
  'admin.user.rol': item(AC,
    T('Роль у робочому просторі: учасник або лише перегляд.', 'Rol in de werkruimte: lid of alleen bekijken.'),
    T('Визначає, чи може людина змінювати спільні дані, чи лише переглядати.', 'Bepaalt of iemand gedeelde gegevens kan wijzigen of alleen bekijken.'),
    T('Низький ризик для сервера, але учасник може змінювати чи видаляти спільні матеріали.', 'Laag risico voor de server, maar een lid kan gedeelde stukken wijzigen of verwijderen.'),
    T('Поле users.workspaceRole (canonicalWorkspaceRole); старе accessLevel limited відповідає viewer.', 'Veld users.workspaceRole (canonicalWorkspaceRole); het oude accessLevel limited komt overeen met viewer.')),
  'admin.user.rechten': item(AC,
    T('Права акаунта: «Доступ до ШІ-мосту (api-platform)» та «Сливова тема».', 'Rechten van het account: «Toegang tot de AI-brug (api-platform)» en «Pruimthema».'),
    T('З правом api-platform людина може підключати ШІ (конектори, розширення браузера, пристрої, токени) до СВОГО простору; без нього хаб «Підключення ШІ» показує пояснення.', 'Met api-platform kan iemand AI (connectors, browserextensie, apparaten, tokens) aan zijn EIGEN ruimte koppelen; zonder toont de hub «AI-koppelingen» alleen uitleg.'),
    T('Право не дає керування сайтом (це технічний профіль), але ШІ отримує доступ до пошти й файлів цієї людини з її дозволу.', 'Het recht geeft geen sitebeheer (dat is het technisch profiel), maar een AI krijgt met haar toestemming toegang tot mail en bestanden van die persoon.'),
    T('users.entitlements (IDENTITY_ENTITLEMENTS_V1); перевірка на сервері backend/api-recht.ts (heeftApiRecht); без права — 403 API_RECHT_VEREIST.', 'users.entitlements (IDENTITY_ENTITLEMENTS_V1); controle op de server backend/api-recht.ts (heeftApiRecht); zonder recht 403 API_RECHT_VEREIST.')),
  'admin.rol.rol': item(AC,
    T('Делегована адмін-роль для обраного користувача (безпека, додатки, каталог, підтримка).', 'Gedelegeerde beheerrol voor de gekozen gebruiker (beveiliging, apps, directory, ondersteuning).'),
    T('Людина отримує лише повноваження цієї ролі (наприклад, apps.manage), не більше.', 'De persoon krijgt alleen de bevoegdheden van die rol (bijvoorbeeld apps.manage), niet meer.'),
    T('Адмін-роль — постійне право; за можливості краще технічний профіль з терміном.', 'Een beheerrol is een permanent recht; geef waar mogelijk liever een technisch profiel met een einde.'),
    T('admin_role_assignments_v1; ADMIN_CAPABILITIES у backend/index.ts; super_admin лише власник.', 'admin_role_assignments_v1; ADMIN_CAPABILITIES in backend/index.ts; super_admin alleen de eigenaar.')),
});

// ================================================================== доступ ШІ (src/BeheerAiBeleidWeergave.tsx)
const AI = 'src/BeheerAiBeleidWeergave.tsx';
hulpRegistreren({
  'aib.duur': item(AI,
    T('Власна тривалість дозволу агенту: число й одиниця (хвилини, години, дні).', 'Eigen looptijd van een toestemming voor een agent: getal en eenheid (minuten, uren, dagen).'),
    T('Дозвіл діятиме до обчисленого моменту, потім спрацює правило «після закінчення строку».', 'De toestemming geldt tot het berekende moment; daarna geldt de regel «na afloop».'),
    T('Довгі дозволи агентам — довше вікно для зловживання токеном. Обирайте найкоротший робочий строк.', 'Lange toestemmingen voor agents zijn een langer venster voor misbruik van een token. Kies de kortste werkbare looptijd.'),
    T('Ops у ontwerp AI-beleid (buildDraft), підписує власник passkey; root перевіряє ланцюг (shared/ai-beleid).', 'Ops in het ontwerp van het AI-beleid (buildDraft), ondertekend met de passkey van de eigenaar; root controleert de keten (shared/ai-beleid).')),
  'aib.na-afloop': item(AI,
    T('Що станеться, коли строк дозволу мине: вимкнути або питати щоразу.', 'Wat er gebeurt als de looptijd voorbij is: uitzetten of elke keer vragen.'),
    T('«Вимкнути» — агент більше не зможе діяти; «питати» — кожна дія чекатиме вашого схвалення.', '«Uitzetten» — de agent kan niets meer; «vragen» — elke actie wacht op uw goedkeuring.'),
    T('«Питати» може засипати вас запитами; «вимкнути» може зупинити автоматизацію посеред роботи.', '«Vragen» kan u met verzoeken overspoelen; «uitzetten» kan een automatisering midden in het werk stoppen.'),
    T('Поле after (off|ask) у op type preset/duur; shared/ai-beleid, перевірка assertPolicy.', 'Veld after (off|ask) in de op type preset/duur; shared/ai-beleid, controle assertPolicy.')),
  'aib.bulk-groep': item(AI,
    T('Група дозволів, до якої застосувати групову зміну (або всі групи).', 'Groep rechten waarop de groepswijziging wordt toegepast (of alle groepen).'),
    T('Наступна групова дія змінить лише дозволи цієї групи в обраних агентів.', 'De volgende groepsactie wijzigt alleen de rechten van die groep bij de gekozen agents.'),
    T('«Усі групи» змінює багато дозволів одразу — перегляньте різницю перед підписом.', '«Alle groepen» wijzigt veel rechten tegelijk — bekijk het verschil voor het ondertekenen.'),
    T('Групи з каталогу інструментів (shared/connector-v2); зміна стає ops у ontwerp, нічого не діє до підпису.', 'Groepen uit de toolcatalogus (shared/connector-v2); de wijziging wordt ops in het ontwerp, niets geldt vóór ondertekening.')),
  'aib.bulk-doel': item(AI,
    T('Для кого групова зміна: лише показані агенти (з фільтром) чи всі агенти.', 'Voor wie de groepswijziging geldt: alleen de getoonde agents (met filter) of alle agents.'),
    T('Визначає, скільки агентів отримає ту саму зміну.', 'Bepaalt hoeveel agents dezelfde wijziging krijgen.'),
    T('«Для всіх» зачепить і агентів, яких зараз не видно через фільтр.', '«Voor alle» raakt ook agents die u nu door het filter niet ziet.'),
    T('zichtbareIds vs alleAgenten у AdminAiBeleidView; diff показується до підпису passkey.', 'zichtbareIds vs alleAgenten in AdminAiBeleidView; het verschil verschijnt vóór de passkey-ondertekening.')),
  'aib.nieuw-modus': item(AI,
    T('Початковий режим для нового власного агента: питати щоразу або все вимкнено.', 'Beginmodus voor een nieuwe eigen agent: elke keer vragen of alles uit.'),
    T('Новий агент стартує з цим режимом для всіх інструментів.', 'De nieuwe agent begint met deze modus voor alle tools.'),
    T('Низький ризик: обидва варіанти нічого не дозволяють без вас; «питати» рекомендовано.', 'Laag risico: beide keuzes staan niets toe zonder u; «vragen» wordt aanbevolen.'),
    T('Op add-agent з mode ask|off у ontwerp AI-beleid (shared/ai-beleid).', 'Op add-agent met mode ask|off in het ontwerp van het AI-beleid (shared/ai-beleid).')),
});

// ================================================================== root-schakelaars (/etc/mijn-ruimte/mcp-rechten.json)
const ROOT = 'deploy/installeer-app.sh';
const rootItem = (wat: Tekst, gevolg: Tekst, risico: Tekst, dev: Tekst) => item(ROOT, wat, gevolg, risico, dev);
hulpRegistreren({
  'root.read': rootItem(T('Читання через MCP-сервер (інструменти лише для перегляду).', 'Lezen via de MCP-server (alleen-lezen tools).'),
    T('Агенти з дійсним токеном можуть читати стан і дані, дозволені їхніми правами.', 'Agents met een geldig token kunnen stand en gegevens lezen die hun rechten toestaan.'),
    T('Вимкнення зупинить усі MCP-агенти; увімкнене читання — це все одно доступ до даних.', 'Uitzetten stopt alle MCP-agents; aan staand lezen is nog steeds toegang tot gegevens.'),
    T('"read" у /etc/mijn-ruimte/mcp-rechten.json, читає deploy/mcp/server.mjs (rechten()); файл root:mijnruimte 0640.', '"read" in /etc/mijn-ruimte/mcp-rechten.json, gelezen door deploy/mcp/server.mjs (rechten()); bestand root:mijnruimte 0640.')),
  'root.uitrol': rootItem(T('Дозволити завантаження пакета оновлення через MCP / сайт.', 'Uploaden van een updatepakket via MCP / site toestaan.'),
    T('Підготовлений пакет можна передати серверу для встановлення (після схвалення).', 'Een voorbereid pakket kan naar de server voor installatie (na goedkeuring).'),
    T('Це шлях до зміни коду сервера — тримайте разом зі схваленням passkey.', 'Dit is een weg om de servercode te wijzigen — houd het samen met passkey-goedkeuring aan.'),
    T('"uitrol" у mcp-rechten.json; без нього server.mjs відповідає PERMISSION_OFF:uitrol.', '"uitrol" in mcp-rechten.json; zonder dit antwoordt server.mjs PERMISSION_OFF:uitrol.')),
  'root.gitops': rootItem(T('GitOps: сервер сам забирає нові релізи з репозиторію.', 'GitOps: de server haalt zelf nieuwe releases uit de repository.'),
    T('Новий тег у репозиторії стає кандидатом на встановлення без ручного завантаження.', 'Een nieuwe tag in de repository wordt kandidaat voor installatie zonder handmatige upload.'),
    T('Хто може писати в репозиторій, той може запропонувати код серверу — захищайте гілку й теги.', 'Wie naar de repository kan schrijven, kan de server code aanbieden — bescherm branch en tags.'),
    T('"gitops" читає deploy/gitops/gitops-ophalen.sh; стан у /var/lib/mijn-ruimte-uitrol-status/gitops.json.', '"gitops" gelezen door deploy/gitops/gitops-ophalen.sh; stand in /var/lib/mijn-ruimte-uitrol-status/gitops.json.')),
  'root.passkey-goedkeuring': rootItem(T('Схвалення оновлень passkey власника, яке перевіряє root.', 'Goedkeuren van updates met de passkey van de eigenaar, gecontroleerd door root.'),
    T('Оновлення встановлюється лише після вашого підпису passkey на телефоні чи ключі.', 'Een update wordt pas geïnstalleerd na uw passkey-handtekening op telefoon of sleutel.'),
    T('Вимкнено — оновлення без вашого підпису; увімкнено без зареєстрованого ключа — нічого не встановиться.', 'Uit — updates zonder uw handtekening; aan zonder geregistreerde sleutel — er wordt niets geïnstalleerd.'),
    T('"passkey-goedkeuring"; deploy/goedkeuring/goedkeur-hulp.mjs, ключі в /etc/mijn-ruimte/goedkeur-passkeys.json.', '"passkey-goedkeuring"; deploy/goedkeuring/goedkeur-hulp.mjs, sleutels in /etc/mijn-ruimte/goedkeur-passkeys.json.')),
  'root.ssh-ca': rootItem(T('Підпис SSH-сертифікатів root-службою.', 'Ondertekenen van SSH-certificaten door de root-dienst.'),
    T('Власник у технічному профілі отримує сертифікати 5–60 хв для входу як beheer.', 'De eigenaar in het technisch profiel krijgt certificaten van 5–60 min om als beheer in te loggen.'),
    T('Відкриває SSH-вхід на хост; змінюється лише з сайту з passkey (перевіряє root) або вручну.', 'Opent SSH-toegang tot de host; alleen te wijzigen vanaf de site met passkey (root controleert) of met de hand.'),
    T('"ssh-ca" (точно true); deploy/ssh-ca/mijn-ruimte-ssh-ca.sh; картка «SSH-сертифікати» (ssh.schakelaar).', '"ssh-ca" (exact true); deploy/ssh-ca/mijn-ruimte-ssh-ca.sh; kaart «SSH-certificaten» (ssh.schakelaar).')),
  'root.beheer-alleen-tech': rootItem(T('Адмін-права лише в активному технічному профілі (примусово з боку root).', 'Beheerrechten alleen in een actief technisch profiel (afgedwongen door root).'),
    T('Без активного технічного профілю всі адмін-дії відхиляються, навіть якщо сайт вимкне захист.', 'Zonder actief technisch profiel worden alle beheeracties geweigerd, ook als de site de bescherming uitzet.'),
    T('Якщо OPA не працює, адміністрування блокується (fail-closed); вимкнути можна лише як root.', 'Werkt OPA niet, dan is beheer geblokkeerd (fail-closed); uitzetten kan alleen als root.'),
    T('"beheer-alleen-tech" читає backend/beleid.ts (afdwingAdmin); має перевагу над beveiliging.opa-afdwingen.', '"beheer-alleen-tech" gelezen door backend/beleid.ts (afdwingAdmin); gaat voor beveiliging.opa-afdwingen.')),
  'root.guacamole': rootItem(T('Віддалений стіл через Apache Guacamole (guacd) на сервері.', 'Extern bureaublad via Apache Guacamole (guacd) op de server.'),
    T('Інсталятор ставить guacd (лише 127.0.0.1), і сайт може відкривати RDP/VNC/SSH-сеанси.', 'De installer zet guacd neer (alleen 127.0.0.1) en de site kan RDP/VNC/SSH-sessies openen.'),
    T('Сервер отримує мережевий доступ до ваших комп’ютерів; вимкнено — нічого не встановлено.', 'De server krijgt netwerktoegang tot uw computers; uit — er is niets geïnstalleerd.'),
    T('"guacamole" у mcp-rechten.json; контейнер guacamole/guacd з host-мережею й -b 127.0.0.1 (deploy/installeer-app.sh).', '"guacamole" in mcp-rechten.json; container guacamole/guacd met host-netwerk en -b 127.0.0.1 (deploy/installeer-app.sh).')),
  'root.opdracht.status': rootItem(T('Агент може запитати стан сервера (команда status).', 'Een agent kan de stand van de server opvragen (opdracht status).'),
    T('Повертає зведення служб, диска й останнього розгортання.', 'Geeft een overzicht van diensten, schijf en laatste uitrol.'),
    T('Низький ризик: лише читання, але показує внутрішню будову сервера.', 'Laag risico: alleen lezen, maar het toont de interne opbouw van de server.'),
    T('"opdracht": {"status"}; deploy/opdracht/mijn-ruimte-opdracht.sh, юніт mijn-ruimte-opdracht@status.service.', '"opdracht": {"status"}; deploy/opdracht/mijn-ruimte-opdracht.sh, unit mijn-ruimte-opdracht@status.service.')),
  'root.opdracht.releases': rootItem(T('Агент може переглянути список встановлених релізів.', 'Een agent kan de lijst met geïnstalleerde releases bekijken.'),
    T('Повертає версії, дати й поточний реліз.', 'Geeft versies, datums en de huidige release.'),
    T('Низький ризик: лише читання історії версій.', 'Laag risico: alleen het lezen van de versiehistorie.'),
    T('"opdracht": {"releases"}; mijn-ruimte-opdracht@releases.service (polkit дозволяє лише start).', '"opdracht": {"releases"}; mijn-ruimte-opdracht@releases.service (polkit staat alleen start toe).')),
  'root.opdracht.backup': rootItem(T('Агент може запустити резервну копію бази.', 'Een agent kan een back-up van de database starten.'),
    T('Створюється новий знімок бази в теці резервних копій.', 'Er komt een nieuwe momentopname van de database in de back-upmap.'),
    T('Часті копії навантажують диск і базу; сама копія містить усі дані.', 'Vaak back-uppen belast schijf en database; de back-up zelf bevat alle gegevens.'),
    T('"opdracht": {"backup"}; mijn-ruimte-backup.service через mijn-ruimte-opdracht@backup.service.', '"opdracht": {"backup"}; mijn-ruimte-backup.service via mijn-ruimte-opdracht@backup.service.')),
  'root.opdracht.uitrol-nu': rootItem(T('Агент може запустити встановлення вже схваленого пакета зараз.', 'Een agent kan de installatie van een al goedgekeurd pakket nu starten.'),
    T('Не чекати планового вікна — встановлення почнеться одразу.', 'Niet op het geplande venster wachten — de installatie begint meteen.'),
    T('Перезапуск служб під час роботи користувачів; пакет усе одно має бути схвалений.', 'Diensten herstarten terwijl gebruikers werken; het pakket moet nog steeds goedgekeurd zijn.'),
    T('Ключ "opdracht": {"uitrol-nu"}; запускає mijn-ruimte-opdracht@uitrol-nu.service (polkit: лише start).', 'Sleutel "opdracht": {"uitrol-nu"}; start mijn-ruimte-opdracht@uitrol-nu.service (polkit: alleen start).')),
  'root.opdracht.terugdraaien': rootItem(T('Агент може відкотити сервер до попереднього релізу.', 'Een agent kan de server naar de vorige release terugzetten.'),
    T('Попередня версія стає активною, служби перезапускаються.', 'De vorige versie wordt actief, diensten herstarten.'),
    T('Відкат може повернути вже виправлені помилки або зламати сумісність із новою базою. Типово вимкнено.', 'Terugzetten kan opgeloste fouten terugbrengen of niet passen bij een nieuwere database. Standaard uit.'),
    T('"opdracht": {"terugdraaien"} (стандартно false); mijn-ruimte-opdracht@terugdraaien.service.', '"opdracht": {"terugdraaien"} (standaard false); mijn-ruimte-opdracht@terugdraaien.service.')),
});

// ================================================================== розширення браузера: розблокування з Passkey (src/extensie/ExtensieOntgrendeling.tsx)
const EXT = 'src/extensie/ExtensieOntgrendeling.tsx';
hulpRegistreren({
  'extensie.ontgrendeling': item(EXT,
    T('Розблокування розширення в цьому браузері вашим власним passkey. Без нього розширення не виконує жодної команди ШІ й нічого не збирає.', 'Ontgrendelen van de extensie in deze browser met uw eigen passkey. Zonder ontgrendeling voert de extensie geen enkele AI-opdracht uit en verzamelt ze niets.'),
    T('На обраний час ШІ може працювати лише на обраних сторінках сайту і лише в межах ваших технічних ролей. Потім розширення знову блокується саме.', 'Voor de gekozen tijd kan de AI alleen op de gekozen pagina’s van de site werken, binnen uw technische rollen. Daarna vergrendelt de extensie zichzelf weer.'),
    T('Відкритий доступ дозволяє ШІ бачити й натискати на адмін-сторінках. Розблоковуйте лише на потрібний час і відкликайте одразу, коли закінчите.', 'Open toegang laat de AI beheerpagina’s zien en bedienen. Ontgrendel alleen zo lang als nodig en trek meteen in als u klaar bent.'),
    T('Сервер підписує дозвіл HMAC-SHA256 ключем підключення (shared/extensie-ontgrendeling.ts ontgrendelTekst); розширення перевіряє підпис, строк, caps і домени; рядок у app.extensie_ontgrendelingen.', 'De server ondertekent de ontgrendeling met HMAC-SHA256 en de koppelsleutel (shared/extensie-ontgrendeling.ts ontgrendelTekst); de extensie controleert handtekening, termijn, caps en domeinen; rij in app.extensie_ontgrendelingen.')),
  'extensie.duur': item(EXT,
    T('Скільки триває розблокування: від 15 хвилин до 4 годин, але ніколи довше за вашу технічну активацію.', 'Hoe lang de ontgrendeling duurt: van 15 minuten tot 4 uur, maar nooit langer dan uw technische activering.'),
    T('Після цього часу розширення блокується само (також після перезапуску браузера чи виходу з технічного профілю).', 'Na die tijd vergrendelt de extensie vanzelf (ook na een herstart van de browser of het verlaten van het technisch profiel).'),
    T('Довший строк — довше вікно, у якому ШІ або викрадена вкладка можуть діяти. Обирайте найкоротший, якого вистачить.', 'Een langere duur is een langer venster waarin de AI of een gestolen tabblad kan handelen. Kies de kortste die volstaat.'),
    T('DUUR_KEUZES і MAX_MINUTEN (480) у shared/extensie-ontgrendeling.ts; сервер обрізає до кінця активації (app.tech_activaties.eind), check eind_op <= begin_op + 8 h.', 'DUUR_KEUZES en MAX_MINUTEN (480) in shared/extensie-ontgrendeling.ts; de server kapt af op het einde van de activering (app.tech_activaties.eind), check eind_op <= begin_op + 8 u.')),
  'extensie.domeinen': item(EXT,
    T('На яких сторінках власного сайту розширення може працювати й збирати діагностику під час розблокування.', 'Op welke pagina’s van de eigen site de extensie tijdens de ontgrendeling mag werken en diagnose mag verzamelen.'),
    T('На інших сайтах і піддоменах розширення відмовляє в командах і нічого не збирає. Типово — лише admin і mcp.', 'Op andere sites en subdomeinen weigert de extensie opdrachten en verzamelt ze niets. Standaard alleen admin en mcp.'),
    T('Кожен доданий піддомен (пошта, хмара) — це ваші особисті дані, які ШІ зможе бачити. Додавайте лише потрібні.', 'Elk extra subdomein (mail, cloud) zijn persoonlijke gegevens die de AI kan zien. Voeg alleen toe wat nodig is.'),
    T('ADMIN_HOSTS_TOEGESTAAN / ADMIN_HOSTS_STANDAARD у shared/extensie-ontgrendeling.ts; точний збіг host, перевіряють і сервер (dispatchCommand), і розширення.', 'ADMIN_HOSTS_TOEGESTAAN / ADMIN_HOSTS_STANDAARD in shared/extensie-ontgrendeling.ts; exacte host, gecontroleerd door de server (dispatchCommand) en door de extensie.')),
  'extensie.lokaal': item(EXT,
    T('Дозволити локальному агенту на цьому комп’ютері (Native Messaging) читати сторінки через розширення.', 'De lokale agent op deze computer (Native Messaging) toestaan pagina’s via de extensie te lezen.'),
    T('Локальний агент отримує лише читання (browser.read), без кліків, навігації чи знімків, і лише до кінця розблокування.', 'De lokale agent krijgt alleen lezen (browser.read), zonder klikken, navigeren of schermafbeeldingen, en alleen tot het einde.'),
    T('Будь-яка програма, що видає себе за локального агента, могла б читати адмін-сторінки. Вмикайте лише якщо самі його встановили.', 'Elk programma dat zich als lokale agent voordoet zou beheerpagina’s kunnen lezen. Zet het alleen aan als u die agent zelf installeerde.'),
    T('Поле lokaal у підписаному дозволі; extension/native.js (хост com.tarasevych.mijnruimte, необов’язковий дозвіл nativeMessaging), LOKAAL_CAPS.', 'Veld lokaal in de ondertekende ontgrendeling; extension/native.js (host com.tarasevych.mijnruimte, optionele permissie nativeMessaging), LOKAAL_CAPS.')),
  'extensie.intrekken': item(EXT,
    T('Негайно заблокувати розширення в цьому браузері — без passkey і без підтверджень.', 'De extensie in deze browser meteen vergrendelen — zonder passkey en zonder bevestiging.'),
    T('Сервер позначає дозвіл відкликаним і надсилає розширенню «заблокувати»; команди ШІ, що ще чекають, буде відхилено.', 'De server zet de ontgrendeling op ingetrokken en stuurt de extensie «vergrendelen»; nog wachtende AI-opdrachten worden geweigerd.'),
    T('Ризик низький: робота ШІ, що саме триває, перерветься. Знову відкрити можна лише з passkey.', 'Laag risico: lopend AI-werk breekt af. Opnieuw openen kan alleen met een passkey.'),
    T('POST /api/owner/agents/ontgrendeling/intrekken записує ingetrokken_op і ingetrokken_door=site; сервер шле WS {t:"vergrendel", reden:"site"} (backend/connectors-gateway.ts).', 'POST /api/owner/agents/ontgrendeling/intrekken → ingetrokken_op, ingetrokken_door=site; WS {t:"vergrendel", reden:"site"} (backend/connectors-gateway.ts).')),
});

// ================================================================== розширення: слот «як користувач» (0.6, src/extensie/ExtensiePrive.tsx)
const EXTP = 'src/extensie/ExtensiePrive.tsx';
hulpRegistreren({
  'extensie.prive.ontgrendeling': item(EXTP,
    T('Відкрити ШІ доступ до ваших власних сторінок через розширення в цьому браузері — як звичайний користувач, без технічного профілю.', 'De AI via de extensie in deze browser toegang geven tot uw eigen pagina’s — als gewone gebruiker, zonder technisch profiel.'),
    T('ШІ зможе лише те, що ви дозволили в «Що може ШІ», лише на обраних сторінках і лише до кінця строку. Адмін-сторінок цей доступ не відкриває ніколи.', 'De AI kan alleen wat u bij «Wat mag de AI» toestond, alleen op de gekozen pagina’s en alleen tot het einde van de termijn. Beheerpagina’s gaan hiermee nooit open.'),
    T('ШІ бачить вашу пошту, диск чи дошку, якщо ви їх обрали. Перед відкриттям сайт просить підтвердити доступ (passkey, код або Google).', 'De AI ziet uw mail, drive of bord als u die kiest. Vóór het openen vraagt de site de toegang te bevestigen (passkey, code of Google).'),
    T('POST /api/owner/agents/ontgrendeling/prive (step-up цієї сесії, 403 STEP_UP_REQUIRED → вікно «Підтвердіть доступ»); caps = ai-grants браузера ∩ app.extensie_beleid; підпис v2 з ruimte=prive.', 'POST /api/owner/agents/ontgrendeling/prive (step-up van deze sessie, 403 STEP_UP_REQUIRED → venster «Toegang bevestigen»); caps = ai-grants van de browser ∩ app.extensie_beleid; handtekening v2 met ruimte=prive.')),
  'extensie.prive.dagen': item(EXTP,
    T('Скільки діє доступ «як користувач»: 1, 7 або 30 днів, але не довше за ваші дозволи ШІ та правила власника.', 'Hoe lang de toegang «als gebruiker» geldt: 1, 7 of 30 dagen, maar niet langer dan uw AI-toestemmingen en de regels van de eigenaar.'),
    T('Після цього строку розширення саме блокує цей слот; також після перезапуску браузера чи виходу з облікового запису.', 'Na die termijn vergrendelt de extensie dit slot zelf; ook na een herstart van de browser of uitloggen.'),
    T('Довший строк — довше вікно, у якому ШІ може діяти без нового підтвердження. Обирайте найкоротший, якого вистачить.', 'Een langere termijn is een langer venster waarin de AI zonder nieuwe bevestiging kan handelen. Kies de kortste die volstaat.'),
    T('PRIVE_DAGEN_KEUZES / PRIVE_MAX_DAGEN у shared/extensie-ontgrendeling.ts; сервер обрізає до min(кінець grants, dagen, beleid.prive_max_dagen).', 'PRIVE_DAGEN_KEUZES / PRIVE_MAX_DAGEN in shared/extensie-ontgrendeling.ts; de server kapt af op min(einde grants, dagen, beleid.prive_max_dagen).')),
  'extensie.prive.domeinen': item(EXTP,
    T('На яких ваших сторінках (пошта, диск, хаб…) ШІ може працювати через розширення в цьому слоті.', 'Op welke van uw pagina’s (mail, drive, hub…) de AI in dit slot via de extensie mag werken.'),
    T('На інших сторінках розширення відмовляє в командах цього слота й нічого не збирає. Адміністрування сюди не входить ніколи.', 'Op andere pagina’s weigert de extensie opdrachten van dit slot en verzamelt ze niets. Beheer hoort hier nooit bij.'),
    T('Кожна обрана сторінка — ваші особисті дані, які ШІ зможе бачити. Залиште лише ті, що справді потрібні.', 'Elke gekozen pagina zijn persoonlijke gegevens die de AI kan zien. Laat alleen die staan die echt nodig zijn.'),
    T('PRIVE_HOSTS у shared/extensie-ontgrendeling.ts (без admin.* і api.*); точний збіг host у сервері (dispatch) і в розширенні.', 'PRIVE_HOSTS in shared/extensie-ontgrendeling.ts (zonder admin.* en api.*); exacte host in de server (dispatch) en in de extensie.')),
  'extensie.prive.lokaal': item(EXTP,
    T('Дозволити локальному агенту на цьому комп’ютері читати ваші сторінки через розширення.', 'De lokale agent op deze computer toestaan uw pagina’s via de extensie te lezen.'),
    T('Локальний агент отримує лише читання (browser.read) і лише до кінця цього доступу.', 'De lokale agent krijgt alleen lezen (browser.read) en alleen tot het einde van deze toegang.'),
    T('Програма, що видає себе за локального агента, могла б читати ваші сторінки. Вмикайте, лише якщо самі його встановили.', 'Een programma dat zich als lokale agent voordoet zou uw pagina’s kunnen lezen. Zet het alleen aan als u die agent zelf installeerde.'),
    T('Поле lokaal у підписаному дозволі (ruimte=prive); extension/native.js, LOKAAL_CAPS; beleid.lokaal_aan може це вимкнути.', 'Veld lokaal in de ondertekende ontgrendeling (ruimte=prive); extension/native.js, LOKAAL_CAPS; beleid.lokaal_aan kan het uitzetten.')),
});

// ---------------------------------------------------------------- «Доступи» op de hub (contract 0.6 §3/§4, src/agenten/TabToegang.tsx)
const TG = 'src/agenten/TabToegang.tsx';
const TGM = 'src/agenten/toegang/MijnToegang.tsx';
const TGB = 'src/agenten/toegang/AlleGebruikers.tsx';
hulpRegistreren({
  'toegang.overzicht': item(TG,
    T('«Доступи» — один список усього, що ви дали ШІ: конектори, токени, пристрої, розширення браузера й локальний агент.', '«Toegang» is één lijst van alles wat u aan AI gaf: connectors, tokens, apparaten, de browserextensie en de lokale agent.'),
    T('Тут видно, що саме ШІ може, де і до коли; будь-що можна одразу відкликати, продовжити з підтвердженням або звузити.', 'Hier ziet u wat de AI precies mag, waar en tot wanneer; alles kunt u meteen intrekken, met bevestiging verlengen of beperken.'),
    T('Список показує лише ваше. Забуті доступи — найчастіша причина витоків; переглядайте його регулярно.', 'De lijst toont alleen het uwe. Vergeten toegang is de meest voorkomende oorzaak van lekken; kijk er geregeld naar.'),
    T('Дані з наявних маршрутів (agents/overzicht, mcp/tokens/list, agents/list, ai/grants/list, agents/extensie-status), зведені в src/agenten/toegang/model.ts bouwRijen.', 'Gegevens uit bestaande routes (agents/overzicht, mcp/tokens/list, agents/list, ai/grants/list, agents/extensie-status), samengevoegd in src/agenten/toegang/model.ts bouwRijen.')),
  'toegang.intrekken': item(TGM,
    T('Відкликати цей доступ одразу, без passkey і без повторного входу.', 'Deze toegang meteen intrekken, zonder passkey en zonder opnieuw aanmelden.'),
    T('ШІ втрачає доступ із наступного виклику; рядок зникає зі списку, запис лишається в журналі.', 'De AI verliest de toegang vanaf de volgende aanroep; de rij verdwijnt uit de lijst, de regel blijft in het logboek.'),
    T('Робота ШІ, що саме триває, перерветься. Знову надати доступ можна лише з підтвердженням.', 'Lopend AI-werk breekt af. Opnieuw toegang geven kan alleen met bevestiging.'),
    T('Конектор: POST /api/owner/mcp-connector/grants/:id/revoke; токен: /api/mcp/tokens/revoke; пристрій: /api/owner/ai/grants/revoke; розширення: /api/owner/agents/ontgrendeling/intrekken.', 'Connector: POST /api/owner/mcp-connector/grants/:id/revoke; token: /api/mcp/tokens/revoke; apparaat: /api/owner/ai/grants/revoke; extensie: /api/owner/agents/ontgrendeling/intrekken.')),
  'toegang.verlengen': item(TGM,
    T('Продовжити доступ розширення: відкрити його заново на новий строк.', 'De toegang van de extensie verlengen: opnieuw openen voor een nieuwe termijn.'),
    T('Профіль користувача просить підтвердити вхід («Підтвердіть доступ»), технічний — ваш passkey. Без підтвердження нічого не зміниться.', 'Het gebruikersprofiel vraagt een bevestiging van de aanmelding («Toegang bevestigen»), het technische uw passkey. Zonder bevestiging verandert er niets.'),
    T('Довший строк — довше вікно для помилок ШІ або викраденої вкладки. Обирайте найкоротший, якого вистачить.', 'Een langere termijn is een langer venster voor fouten van de AI of een gestolen tabblad. Kies de kortste die volstaat.'),
    T('Приватний: POST /api/owner/agents/ontgrendeling/prive {agentId, dagen, domeinen} (step-up цієї сесії); технічний: uitdaging + passkey (src/extensie/ExtensieOntgrendeling.tsx ontgrendelen).', 'Privé: POST /api/owner/agents/ontgrendeling/prive {agentId, dagen, domeinen} (step-up van deze sessie); technisch: uitdaging + passkey (src/extensie/ExtensieOntgrendeling.tsx ontgrendelen).')),
  'toegang.beperken': item(TGM,
    T('Обмежити доступ: залишити менше адрес, вимкнути локального агента або скоротити строк.', 'Toegang beperken: minder adressen overhouden, de lokale agent uitzetten of de termijn inkorten.'),
    T('Чинний доступ спершу відкликається, потім відкривається заново з меншими правами — з тим самим підтвердженням, що й «Продовжити».', 'De huidige toegang wordt eerst ingetrokken en daarna opnieuw geopend met minder rechten — met dezelfde bevestiging als «Verlengen».'),
    T('Якщо підтвердження не вдасться, доступ залишиться закритим (безпечний бік); відкрийте його знову пізніше.', 'Mislukt de bevestiging, dan blijft de toegang dicht (veilige kant); open hem later opnieuw.'),
    T('Звузити підписаний дозвіл без нового підпису неможливо: розширення перевіряє HMAC усього дозволу (contract 0.6 §3). Тому intrekken + новий дозвіл.', 'Een ondertekende ontgrendeling kleiner maken zonder nieuwe handtekening kan niet: de extensie controleert de HMAC van het geheel (contract 0.6 §3). Daarom intrekken + nieuwe ontgrendeling.')),
  'toegang.domeinen': item(TGM,
    T('Адреси власного сайту, на яких ШІ може працювати через розширення.', 'Adressen van de eigen site waar de AI via de extensie mag werken.'),
    T('Зняті адреси після повторного відкриття стануть недоступні для ШІ; додати нові тут не можна.', 'Uitgevinkte adressen zijn na het heropenen niet meer bereikbaar voor de AI; nieuwe toevoegen kan hier niet.'),
    T('Кожна адреса (пошта, хмара) — це ваші особисті дані, які ШІ бачитиме. Залишайте лише потрібні.', 'Elk adres (mail, cloud) zijn persoonlijke gegevens die de AI kan zien. Laat alleen staan wat nodig is.'),
    T('Поле domeinen підписаного дозволу; точний збіг host. Лише підмножина чинних доменів (src/agenten/toegang/bron.ts beperken).', 'Veld domeinen van de ondertekende ontgrendeling; exacte host. Alleen een deelverzameling van de huidige domeinen (src/agenten/toegang/bron.ts beperken).')),
  'toegang.lokaal': item(TGM,
    T('Чи може локальний агент на цьому комп’ютері читати сторінки через розширення.', 'Of de lokale agent op deze computer pagina’s via de extensie mag lezen.'),
    T('Вимкнено — після повторного відкриття локальний агент не отримає нічого; ШІ через сайт працює далі.', 'Uit — na het heropenen krijgt de lokale agent niets meer; de AI via de site werkt gewoon verder.'),
    T('Будь-яка програма, що видає себе за локального агента, могла б читати сторінки. Вмикайте лише свій.', 'Elk programma dat zich als lokale agent voordoet zou pagina’s kunnen lezen. Alleen aanzetten voor uw eigen agent.'),
    T('Поле lokaal підписаного дозволу; LOKAAL_CAPS = лише browser.read (shared/extensie-ontgrendeling.ts), Native Messaging у extension/native.js.', 'Veld lokaal van de ondertekende ontgrendeling; LOKAAL_CAPS = alleen browser.read (shared/extensie-ontgrendeling.ts), Native Messaging in extension/native.js.')),
  'toegang.duur': item(TGM,
    T('На скільки відкрити доступ знову: дні для профілю користувача, хвилини для технічного.', 'Voor hoe lang de toegang opnieuw opengaat: dagen voor het gebruikersprofiel, minuten voor het technische.'),
    T('Строк ніколи не довший за політику власника, ваші дозволи ШІ та (для технічного) чинну активацію.', 'De termijn is nooit langer dan het beleid van de eigenaar, uw AI-toestemmingen en (technisch) de lopende activering.'),
    T('Довше — зручніше, але й довше вікно для помилок. Сервер однаково обріже до допустимого.', 'Langer is handiger, maar ook een langer venster voor fouten. De server kapt hoe dan ook af op wat mag.'),
    T('Приватний: dagen 1|7|30 ≤ recht.prive.maxDagen; технічний: duurKeuzes(activatieTot) з ExtensieOntgrendeling, ≤ 480 хв.', 'Privé: dagen 1|7|30 ≤ recht.prive.maxDagen; technisch: duurKeuzes(activatieTot) uit ExtensieOntgrendeling, ≤ 480 min.')),
  'toegang.beheer': item(TGB,
    T('«Усі користувачі»: доступи розширення в усіх облікових записах сервера та політика для кожного.', '«Alle gebruikers»: de extensietoegang van alle accounts op de server en het beleid per account.'),
    T('Можна відкликати чи продовжити чужий доступ і задати межі, які діють під час кожного наступного розблокування.', 'U kunt andermans toegang intrekken of verlengen en grenzen zetten die bij elke volgende ontgrendeling gelden.'),
    T('Зміни зачіпають інших людей; кожна дія потрапляє в журнал і людина отримує сповіщення.', 'Wijzigingen raken andere mensen; elke actie komt in het logboek en de persoon krijgt een melding.'),
    T('Лише власник або активація з users.manage (GET /api/owner/agents/extensie-beheer); для інших розділ не рендериться взагалі. Таблиця app.extensie_beleid (0073).', 'Alleen de eigenaar of een activering met users.manage (GET /api/owner/agents/extensie-beheer); voor anderen wordt de sectie niet gerenderd. Tabel app.extensie_beleid (0073).')),
  'toegang.beheer.intrekken': item(TGB,
    T('Відкликати доступ розширення цієї людини: один браузер, один профіль або все.', 'De extensietoegang van deze persoon intrekken: één browser, één profiel of alles.'),
    T('Розширення в неї одразу блокується; ШІ, що працює, зупиняється. Людина отримає сповіщення.', 'De extensie bij die persoon vergrendelt meteen; werkende AI stopt. De persoon krijgt een melding.'),
    T('Ви перериваєте чужу роботу — тому спершу вікно підтвердження. Скасувати відкликання не можна.', 'U onderbreekt andermans werk — daarom eerst een bevestigingsvenster. Intrekken is niet terug te draaien.'),
    T('POST /api/owner/agents/extensie-beheer/intrekken {userId, agentId?, ruimte?}: аудит, push {t:"vergrendel"}, melding.', 'POST /api/owner/agents/extensie-beheer/intrekken {userId, agentId?, ruimte?}: audit, push {t:"vergrendel"}, melding.')),
  'toegang.beheer.verlengen': item(TGB,
    T('Продовжити чинне розблокування цієї людини на вибраний час.', 'De lopende ontgrendeling van deze persoon met de gekozen tijd verlengen.'),
    T('Строк росте лише в межах її політики; технічний — ніколи після кінця її активації.', 'De termijn groeit alleen binnen haar beleid; technisch nooit voorbij het einde van haar activering.'),
    T('Ви продовжуєте доступ, який дала не ви. Робіть це лише на прохання людини.', 'U verlengt toegang die u niet zelf gaf. Doe dit alleen op verzoek van de persoon.'),
    T('POST /api/owner/agents/extensie-beheer/verlengen {gid, minuten|dagen}; сервер обрізає до beleid і tech_activaties.eind.', 'POST /api/owner/agents/extensie-beheer/verlengen {gid, minuten|dagen}; de server kapt af op beleid en tech_activaties.eind.')),
  'toegang.beleid.prive-aan': item(TGB,
    T('Чи може ця людина відкривати розширення в профілі користувача (свої служби).', 'Of deze persoon de extensie in het gebruikersprofiel (eigen diensten) mag openen.'),
    T('Вимкнено — чинні приватні розблокування одразу відкликаються, нові не видаються.', 'Uit — lopende privé-ontgrendelingen worden meteen ingetrokken, nieuwe worden niet gegeven.'),
    T('Людина втратить допомогу ШІ у браузері для пошти, диска тощо. Поясніть причину в нотатці.', 'De persoon verliest AI-hulp in de browser voor mail, Drive enz. Leg de reden uit in de notitie.'),
    T('app.extensie_beleid.prive_aan (типово true); перевіряється в POST /api/owner/agents/ontgrendeling/prive.', 'app.extensie_beleid.prive_aan (standaard true); gecontroleerd in POST /api/owner/agents/ontgrendeling/prive.')),
  'toegang.beleid.technisch-aan': item(TGB,
    T('Чи може ця людина відкривати розширення в технічному профілі.', 'Of deze persoon de extensie in het technische profiel mag openen.'),
    T('Вимкнено — технічні розблокування відкликаються одразу, навіть за активного технічного профілю.', 'Uit — technische ontgrendelingen worden meteen ingetrokken, ook met een actief technisch profiel.'),
    T('Технічний доступ бачить адмін-сторінки. Залишайте ввімкненим лише тим, кому це справді треба.', 'Technische toegang ziet beheerpagina’s. Laat het alleen aan voor wie het echt nodig heeft.'),
    T('app.extensie_beleid.technisch_aan (типово true); ontgrendelen() у backend/extensie-ontgrendeling.ts обрізає за політикою.', 'app.extensie_beleid.technisch_aan (standaard true); ontgrendelen() in backend/extensie-ontgrendeling.ts kapt af op het beleid.')),
  'toegang.beleid.prive-caps': item(TGB,
    T('Які можливості ШІ дозволені в профілі користувача (читати, відкривати, натискати…).', 'Welke AI-mogelijkheden in het gebruikersprofiel mogen (lezen, openen, klikken…).'),
    T('Невибране не ввійде в жодне нове розблокування; чинні, що виходять за межі, відкликаються.', 'Wat niet aangevinkt is komt in geen enkele nieuwe ontgrendeling; lopende die erbuiten vallen worden ingetrokken.'),
    T('Менше — безпечніше, але ШІ може не впоратися із завданням. «Натискати й вводити» змінює дані.', 'Minder is veiliger, maar de AI kan dan een taak niet afmaken. «Klikken en typen» wijzigt gegevens.'),
    T('app.extensie_beleid.prive_caps text[] (null = усі BROWSER_CAPS); caps = browser-grants ∩ beleid.', 'app.extensie_beleid.prive_caps text[] (null = alle BROWSER_CAPS); caps = browser-grants ∩ beleid.')),
  'toegang.beleid.technisch-caps': item(TGB,
    T('Які можливості ШІ дозволені в технічному профілі, понад межі ролей.', 'Welke AI-mogelijkheden in het technische profiel mogen, bovenop de grenzen van de rollen.'),
    T('Технічне розблокування бере ролі → можливості й перетинає з цим списком.', 'Een technische ontgrendeling neemt rollen → mogelijkheden en snijdt die met deze lijst.'),
    T('«Глибока діагностика» дає debugger браузера на адмін-сторінках. Вмикайте лише розробникам.', '«Diepe diagnose» geeft de browserdebugger op beheerpagina’s. Alleen aanzetten voor ontwikkelaars.'),
    T('app.extensie_beleid.technisch_caps text[] (null = усі); capsVoorRollen() ∩ beleid у backend/extensie-ontgrendeling.ts.', 'app.extensie_beleid.technisch_caps text[] (null = alle); capsVoorRollen() ∩ beleid in backend/extensie-ontgrendeling.ts.')),
  'toegang.beleid.max-dagen': item(TGB,
    T('Найдовший строк одного розблокування в профілі користувача (у днях).', 'De langste termijn van één ontgrendeling in het gebruikersprofiel (in dagen).'),
    T('Нові розблокування не довші за це; чинні, що довші, обрізаються.', 'Nieuwe ontgrendelingen worden niet langer; lopende die langer zijn worden ingekort.'),
    T('Довгий строк зручний, але забутий доступ живе довше. Типово 30 днів.', 'Een lange termijn is handig, maar vergeten toegang leeft langer. Standaard 30 dagen.'),
    T('app.extensie_beleid.prive_max_dagen int (типово 30); вибір 1/7/30 у POST …/ontgrendeling/prive.', 'app.extensie_beleid.prive_max_dagen int (standaard 30); keuze 1/7/30 in POST …/ontgrendeling/prive.')),
  'toegang.beleid.max-minuten': item(TGB,
    T('Найдовший строк одного технічного розблокування (у хвилинах).', 'De langste termijn van één technische ontgrendeling (in minuten).'),
    T('Технічні розблокування не довші за це й ніколи не довші за активацію профілю.', 'Technische ontgrendelingen worden niet langer en nooit langer dan de activering van het profiel.'),
    T('Технічний доступ сильний; коротший строк зменшує шкоду від помилки чи викраденої вкладки.', 'Technische toegang is sterk; een kortere termijn beperkt de schade van een fout of een gestolen tabblad.'),
    T('app.extensie_beleid.technisch_max_minuten int (типово 480 = MAX_MINUTEN).', 'app.extensie_beleid.technisch_max_minuten int (standaard 480 = MAX_MINUTEN).')),
  'toegang.beleid.lokaal': item(TGB,
    T('Чи може ця людина дозволяти локальному агентові читати сторінки через розширення.', 'Of deze persoon de lokale agent pagina’s via de extensie mag laten lezen.'),
    T('Вимкнено — у нових розблокуваннях поле lokaal завжди вимкнене; чинні з lokaal відкликаються.', 'Uit — in nieuwe ontgrendelingen staat lokaal altijd uit; lopende met lokaal worden ingetrokken.'),
    T('Локальний агент — програма на комп’ютері людини, її сайт не контролює.', 'De lokale agent is een programma op de computer van de persoon; de site controleert het niet.'),
    T('app.extensie_beleid.lokaal_aan bool (типово true); LOKAAL_CAPS лише browser.read.', 'app.extensie_beleid.lokaal_aan bool (standaard true); LOKAAL_CAPS alleen browser.read.')),
  'toegang.beleid.notitie': item(TGB,
    T('Коротка нотатка, чому політика саме така (видно адміністраторам).', 'Een korte notitie waarom het beleid zo is (zichtbaar voor beheerders).'),
    T('Зберігається разом із тим, хто й коли змінив політику.', 'Wordt bewaard samen met wie en wanneer het beleid wijzigde.'),
    T('Не пишіть сюди паролів, кодів чи особистих даних — нотатку бачать інші адміністратори.', 'Schrijf hier geen wachtwoorden, codes of persoonsgegevens — andere beheerders zien de notitie.'),
    T('app.extensie_beleid.notitie text (≤ 500 знаків), gewijzigd_door / gewijzigd_op; аудит у POST …/extensie-beheer/beleid.', 'app.extensie_beleid.notitie text (≤ 500 tekens), gewijzigd_door / gewijzigd_op; audit in POST …/extensie-beheer/beleid.')),
});

// ================================================================== besluiten van de eigenaar met passkey (zone B 22.10.2026, RUNBOOK §15)
hulpRegistreren(HELP_BESLUIT);
hulpRegistreren(HELP_ORCH);

// ================================================================== «Браузер і агенти» — matrix slot × mogelijkheid × agent (zone E 22.10.2026, 0110)
hulpRegistreren(HELP_MATRIX);
hulpRegistreren(HELP_WERKBLAD);
hulpRegistreren(HELP_ZOEK_INDEX);   // zone D 22.10.2026: zoek.index.* (src/zoek/ZoekIndexVenster.tsx)

/** Alleen-lezen weergave van het hele register (voor de test en het «?»-onderdeel). */
export const HULP_REGISTER: Readonly<Record<string, HulpItem>> = R;
