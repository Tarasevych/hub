// Technisch profiel (architectuur 13.10.2026): rollen, wat ze mogen, hoe lang één activering hoogstens duurt, de kleuren van de band
// en de uitleg achter elk «?» — met een laag «для розробників» die alleen in een actief technisch profiel zichtbaar is.
// Eén catalogus voor server (backend/tech-profiel.ts) en UI (src/tech/*): wat hier niet staat, bestaat niet.

export type Tekst = readonly [uk: string, nl: string];
/** Uitleg bij een «?»: wat het is, wat er verandert, risico's, en (alleen technisch profiel) waarom zo gebouwd + alternatieven. */
export type HelpLagen = { wat: Tekst; gevolg: Tekst; risico?: Tekst; dev?: Tekst };

export type TechRol = 'ondersteuning' | 'tester' | 'ontwikkelaar' | 'beheerder' | 'auditor' | 'eigenaar';
export type TechMogelijkheid =
  | 'diagnose.lezen' | 'journaal.metadata' | 'journaal.lezen' | 'opnames.bekijken' | 'impersonatie.aanvragen'
  | 'flags.test' | 'testruimtes' | 'uitrol.voorbereiden' | 'logboeken.diensten' | 'terminal.test' | 'terminal.servers'
  | 'diensten.beheren' | 'users.manage' | 'roles.delegate';

export type RolInfo = { id: TechRol; naam: Tekst; kort: Tekst; mogelijkheden: readonly TechMogelijkheid[]; plafondMinuten: number; help: HelpLagen };

export const TECH_ROLLEN: readonly RolInfo[] = Object.freeze([
  { id: 'ondersteuning', naam: ['Підтримка', 'Ondersteuning'], kort: ['діагностика й журнал без вмісту', 'diagnose en logboek zonder inhoud'],
    mogelijkheden: ['diagnose.lezen', 'journaal.metadata', 'impersonatie.aanvragen'], plafondMinuten: 240,
    help: { wat: ['Бачить стан служб і помилки клієнтів, але не їхні листи чи файли.', 'Ziet de stand van diensten en fouten van klanten, maar niet hun mail of bestanden.'],
      gevolg: ['Може попросити клієнта про «Увійти як»; сам увійти без згоди не може.', 'Kan de klant om «Inloggen als» vragen; zonder toestemming kan het niet.'],
      dev: ['Мінімальна роль для розбору звернень (принцип найменших прав). Альтернатива — дати support_viewer назавжди, як раніше; відкинуто, бо постійні права = ціль для атаки.', 'Minimale rol voor meldingen (least privilege). Alternatief: support_viewer permanent zoals vroeger; afgewezen, permanente rechten zijn een doelwit.'] } },
  { id: 'tester', naam: ['Тестувальник', 'Tester'], kort: ['тестові простори й прапорці', 'testruimtes en vlaggen'],
    mogelijkheden: ['diagnose.lezen', 'flags.test', 'testruimtes'], plafondMinuten: 480,
    help: { wat: ['Вмикає нові функції лише в тестових просторах і перевіряє їх.', 'Zet nieuwe functies alleen in testruimtes aan en test ze.'],
      gevolg: ['Справжні клієнти нічого не бачать, доки функцію не ввімкне адміністратор.', 'Echte klanten zien niets tot een beheerder de functie aanzet.'],
      dev: ['Прапорець лише показує або ховає функцію, прав не дає (права вирішує рушій політик OPA).', 'Een vlag toont of verbergt alleen; rechten beslist de policy-engine (OPA).'] } },
  { id: 'ontwikkelaar', naam: ['Розробник', 'Ontwikkelaar'], kort: ['випуски до підпису, журнали служб, тестові термінали', 'releases tot ondertekenen, dienstlogs, testterminals'],
    mogelijkheden: ['diagnose.lezen', 'flags.test', 'testruimtes', 'uitrol.voorbereiden', 'logboeken.diensten', 'terminal.test'], plafondMinuten: 240,
    help: { wat: ['Готує випуски й бачить журнали служб; встановлює лише власник своїм підписом.', 'Bereidt releases voor en ziet dienstlogs; installeren doet alleen de eigenaar met zijn handtekening.'],
      gevolg: ['Може відкрити термінал лише тестових машин.', 'Kan alleen terminals van testmachines openen.'],
      risico: ['Журнали служб можуть містити адреси й назви — не копіюйте їх назовні.', 'Dienstlogs kunnen adressen en namen bevatten — kopieer ze niet naar buiten.'],
      dev: ['Поділ «готує / підписує» як у наявному uitrol-goedkeuring: ключ підпису лишається на ПК власника.', 'Scheiding voorbereiden / ondertekenen zoals in uitrol-goedkeuring: de sleutel blijft op de pc van de eigenaar.'] } },
  { id: 'beheerder', naam: ['Адміністратор', 'Beheerder'], kort: ['користувачі, доступи, служби, термінали серверів', 'gebruikers, toegang, diensten, serverterminals'],
    mogelijkheden: ['diagnose.lezen', 'journaal.lezen', 'diensten.beheren', 'users.manage', 'roles.delegate', 'terminal.servers'], plafondMinuten: 60,
    help: { wat: ['Керує користувачами й доступами, може призначати технічні профілі (не більше своїх прав).', 'Beheert gebruikers en toegang, kan technische profielen toekennen (niet meer dan de eigen rechten).'],
      gevolg: ['Найсильніша делегована роль, тому найкоротша: одна активація ≤ 1 год.', 'Sterkste gedelegeerde rol, dus de kortste: één activering ≤ 1 uur.'],
      risico: ['Помилка тут зачіпає всіх користувачів сервера.', 'Een fout hier raakt alle gebruikers van de server.'],
      dev: ['Делегування обмежене підмножиною власних ролей — класичний захист від ескалації прав.', 'Delegeren is beperkt tot een deelverzameling van de eigen rollen — klassieke bescherming tegen escalatie.'] } },
  { id: 'auditor', naam: ['Аудитор', 'Auditor'], kort: ['лише читання журналу й записів сеансів', 'alleen logboek en sessieopnames lezen'],
    mogelijkheden: ['journaal.lezen', 'opnames.bekijken'], plafondMinuten: 480,
    help: { wat: ['Читає повний журнал і записи сеансів; нічого не змінює.', 'Leest het volledige logboek en sessieopnames; wijzigt niets.'],
      gevolg: ['Кожен перегляд запису сам потрапляє в журнал.', 'Elk bekijken van een opname komt zelf in het logboek.'],
      dev: ['Окрема роль, щоб контролер не міг сам себе перевіряти (розділення обов\'язків).', 'Aparte rol zodat de controleur zichzelf niet controleert (functiescheiding).'] } },
  { id: 'eigenaar', naam: ['Власник сервера', 'Eigenaar van de server'], kort: ['усе + делегування', 'alles + delegeren'],
    mogelijkheden: ['diagnose.lezen', 'journaal.lezen', 'opnames.bekijken', 'impersonatie.aanvragen', 'flags.test', 'testruimtes', 'uitrol.voorbereiden', 'logboeken.diensten', 'terminal.test', 'terminal.servers', 'diensten.beheren', 'users.manage', 'roles.delegate'], plafondMinuten: 120,
    help: { wat: ['Власник сервера (OWNER_EMAIL). Профіль створюється сам і не може бути відкликаний через сайт.', 'Eigenaar van de server (OWNER_EMAIL). Het profiel ontstaat vanzelf en kan niet via de site worden ingetrokken.'],
      gevolg: ['Root-дії все одно лише через підпис на вашому ПК.', 'Root-acties blijven alleen via een handtekening op uw pc.'],
      dev: ['Власник теж активує профіль на час: викрадена клієнтська сесія не дає адмін-прав навіть йому.', 'Ook de eigenaar activeert op tijd: een gestolen klantsessie geeft zelfs hem geen beheerrechten.'] } },
]);
export const rolInfo = (id: string): RolInfo | undefined => TECH_ROLLEN.find((r) => r.id === id);
export const isTechRol = (v: unknown): v is TechRol => typeof v === 'string' && TECH_ROLLEN.some((r) => r.id === v);
export const mogelijkhedenVan = (rollen: readonly string[]): TechMogelijkheid[] => [...new Set(rollen.flatMap((r) => rolInfo(r)?.mogelijkheden ?? []))].sort();
/** Langste toegestane activering: de strengste rol telt (sterkere rol = korter), begrensd door het plafond van het profiel. */
export const maxMinutenVoor = (rollen: readonly string[], profielMax: number): number =>
  Math.max(15, Math.min(profielMax, ...rollen.map((r) => rolInfo(r)?.plafondMinuten ?? 15)));
export const DUUR_KEUZES = Object.freeze([15, 30, 60, 120, 240, 480]);

// ---------------------------------------------------------------- band: kleur en patroon (keuze van de gebruiker zelf)
export type BandKleur = 'amber' | 'oranje' | 'paars' | 'blauw' | 'groen' | 'grafiet' | 'roze' | 'turkoois';
export type BandPatroon = 'geen' | 'strepen' | 'stippen';
/** Vaste kleuren, los van het thema; tekstcontrast ≥ 4,5:1 (gecontroleerd in tests/eenheid/tech-profiel.test.ts). Rood is voorbehouden aan «Увійти як». */
export const BAND_KLEUREN: Readonly<Record<BandKleur, { bg: string; fg: string; naam: Tekst }>> = Object.freeze({
  amber: { bg: '#f2b705', fg: '#1d1300', naam: ['Бурштин', 'Amber'] },
  oranje: { bg: '#c2410c', fg: '#ffffff', naam: ['Помаранчевий', 'Oranje'] },
  paars: { bg: '#6d28d9', fg: '#ffffff', naam: ['Фіолетовий', 'Paars'] },
  blauw: { bg: '#1d4ed8', fg: '#ffffff', naam: ['Синій', 'Blauw'] },
  groen: { bg: '#15803d', fg: '#ffffff', naam: ['Зелений', 'Groen'] },
  grafiet: { bg: '#27272a', fg: '#fafafa', naam: ['Графіт', 'Grafiet'] },
  roze: { bg: '#be185d', fg: '#ffffff', naam: ['Малиновий', 'Framboos'] },
  turkoois: { bg: '#0f766e', fg: '#ffffff', naam: ['Бірюзовий', 'Turkoois'] },
});
export const BAND_PATRONEN: Readonly<Record<BandPatroon, Tekst>> = Object.freeze({ geen: ['Суцільний', 'Effen'], strepen: ['Смуги', 'Strepen'], stippen: ['Крапки', 'Stippen'] });
export const STANDAARD_BAND = Object.freeze({ kleur: 'amber' as BandKleur, patroon: 'strepen' as BandPatroon });
export const isBandKleur = (v: unknown): v is BandKleur => typeof v === 'string' && Object.prototype.hasOwnProperty.call(BAND_KLEUREN, v);
export const isBandPatroon = (v: unknown): v is BandPatroon => typeof v === 'string' && Object.prototype.hasOwnProperty.call(BAND_PATRONEN, v);

/** WCAG-contrast tussen twee #rrggbb-kleuren (voor de test en voor de UI-keuze). */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---------------------------------------------------------------- uitleg bij de knoppen van het technisch profiel
export const HELP_TECH: Readonly<Record<'activeren' | 'duur' | 'reden' | 'band' | 'toekennen' | 'intrekken', HelpLagen>> = Object.freeze({
  activeren: { wat: ['Вмикає ваш технічний профіль лише в цій вкладці й лише на обраний час.', 'Zet uw technisch profiel alleen in dit tabblad en alleen voor de gekozen tijd aan.'],
    gevolg: ['Згори з\'явиться смуга; інші вкладки лишаються клієнтськими.', 'Bovenaan verschijnt een band; andere tabbladen blijven klantprofiel.'],
    risico: ['Поки смуга видна, ваші дії мають адмін-силу. Завершіть, щойно закінчите.', 'Zolang de band zichtbaar is, hebben uw acties beheerkracht. Beëindig zodra u klaar bent.'],
    dev: ['JIT/PIM: права існують лише в записі app.tech_activaties із жорстким кінцем (≤ 8 год, CHECK у базі). Прив\'язка до tabContext (window.name) — щоб права не перетікали в інші вкладки. Альтернатива — постійні ролі (super_admin); відкинуто.', 'JIT/PIM: rechten bestaan alleen in een rij van app.tech_activaties met een hard einde (≤ 8 u, CHECK in de database). Gebonden aan tabContext (window.name) zodat rechten niet naar andere tabbladen lekken. Alternatief: permanente rollen (super_admin); afgewezen.'] },
  duur: { wat: ['Як довго діє ця активація. Найдовший можливий час залежить від найсильнішої вашої ролі.', 'Hoe lang deze activering geldt. Het maximum hangt af van uw sterkste rol.'],
    gevolg: ['Після цього часу смуга зникне сама, а сервер відмовить у технічних діях.', 'Daarna verdwijnt de band vanzelf en weigert de server technische acties.'],
    dev: ['Кінець перевіряє сервер (eind_op), а не браузер; таймер у смузі — лише підказка.', 'Het einde controleert de server (eind_op), niet de browser; de timer in de band is alleen een hulp.'] },
  reden: { wat: ['Коротко: навіщо вмикаєте (номер запиту, задача).', 'Kort: waarom u aanzet (nummer van een melding, taak).'],
    gevolg: ['Причину видно в журналі поруч із кожною дією цієї активації.', 'De reden staat in het logboek bij elke actie van deze activering.'],
    dev: ['Обов\'язкова причина — стандартна вимога PIM для аудиту.', 'Een verplichte reden is een standaardeis van PIM voor audit.'] },
  band: { wat: ['Колір і візерунок смуги технічного режиму — як вам зручніше.', 'Kleur en patroon van de band van de technische modus — wat u prettig vindt.'],
    gevolg: ['Текст «ТЕХНІЧНИЙ» і позначка [ТЕХ] у назві вкладки є завжди, тож режим не сплутати навіть без кольору.', 'De tekst «TECHNISCH» en [TECH] in de titel van het tabblad zijn er altijd, dus zonder kleur is de modus ook herkenbaar.'],
    dev: ['WCAG 1.4.1: колір не єдиний сигнал. Червоний зарезервовано для «Увійти як».', 'WCAG 1.4.1: kleur is niet het enige signaal. Rood is voorbehouden aan «Inloggen als».'] },
  toekennen: { wat: ['Дати зареєстрованому користувачу технічний профіль за поштою.', 'Een geregistreerde gebruiker een technisch profiel geven via e-mail.'],
    gevolg: ['У його меню з\'явиться «Технічний профіль · неактивний»; права з\'являться лише після його активації.', 'In zijn menu verschijnt «Technisch profiel · inactief»; rechten pas na zijn activering.'],
    risico: ['Можна дати лише ті ролі, які маєте самі.', 'U kunt alleen rollen geven die u zelf heeft.'],
    dev: ['Перевірка підмножини ролей на сервері + повторне підтвердження входу; кожна зміна в журналі (owner.tech.toegekend).', 'Controle op deelverzameling op de server + nieuwe bevestiging van de aanmelding; elke wijziging in het logboek (owner.tech.toegekend).'] },
  intrekken: { wat: ['Забрати технічний профіль. Активні вкладки цієї людини втрачають права одразу.', 'Het technisch profiel intrekken. Actieve tabbladen van die persoon verliezen meteen hun rechten.'],
    gevolg: ['Історія лишається в журналі; профіль можна видати знову.', 'De geschiedenis blijft in het logboek; het profiel kan opnieuw worden gegeven.'],
    dev: ['М\'яке видалення (ingetrokken_op), щоб журнал лишався цілісним.', 'Zacht verwijderen (ingetrokken_op) zodat het logboek heel blijft.'] },
});
