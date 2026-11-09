// Feature flags (architectuur 13.10.2026, etap F). Eigen tabel op de eigen server, antwoord in de vorm van OpenFeature (OFREP).
//
// Waarom zo (en niet anders):
//  - Een vlag zet een FUNCTIE aan of uit (wat iemand ziet of kan proberen), NOOIT een recht. Rechten blijven op de server: sessie,
//    rollen, technisch profiel, OPA. tests/eenheid/vlaggen.test.ts controleert dat geen autorisatiemodule deze code importeert.
//    Alternatief «vlag = recht» afgewezen: dan wordt een UI-schakelaar een toegangsbron die niemand als zodanig controleert.
//  - Eigen tabel in plaats van een externe dienst (LaunchDarkly, Unleash Cloud): BYOS — niets verlaat de server.
//  - Antwoord in OFREP-vorm (key, value, reason, variant, metadata): een OpenFeature-provider voor OFREP werkt met
//    baseUrl = https://<host>/api, zonder eigen SDK.
//  - Procent-uitrol per gebruiker met een vaste emmer (FNV-1a van sleutel + gebruiker): dezelfde persoon ziet bij 30 % altijd
//    hetzelfde, en verhogen naar 40 % neemt niemand iets af die het al had.
//  - Testers (recht flags.test) zetten een vlag alleen VOOR ZICHZELF en alleen tot het einde van hun technisch profiel.
import type { HelpLagen } from './tech-rollen';

export const SLEUTEL_RE = /^[a-z][a-z0-9-]{2,40}$/;
export const MAX_GEBRUIKERS = 200;

export type Vlag = {
  sleutel: string; omschrijving: string;
  /** Hoofdschakelaar: uit = voor iedereen uit (behalve een tester die het voor zichzelf test). */
  aan: boolean;
  /** Waarde voor wie niet in de lijst of de procent-uitrol valt. */
  standaard: boolean;
  /** 0 = geen uitrol; 1..100 = dit deel van de gebruikers krijgt «aan». */
  percentage: number;
  /** Gebruikers (id) die de vlag altijd aan hebben. */
  gebruikers: string[];
};

export type Reden = 'STATIC' | 'TARGETING_MATCH' | 'SPLIT' | 'DISABLED' | 'ERROR';
export type Uitkomst = {
  key: string; value: boolean; variant: 'aan' | 'uit'; reason: Reden;
  errorCode?: 'FLAG_NOT_FOUND';
  metadata?: { test?: boolean };
};

/** Vaste emmer 0..99 per (sleutel, gebruiker): FNV-1a 32-bit. Zelfde invoer = zelfde emmer, in de browser en op de server. */
export function emmer(sleutel: string, userId: string): number {
  let h = 0x811c9dc5;
  const s = `${sleutel}:${userId}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 100;
}

const uit = (key: string, value: boolean, reason: Reden, extra: Partial<Uitkomst> = {}): Uitkomst =>
  ({ key, value, variant: value ? 'aan' : 'uit', reason, ...extra });

/**
 * Waarde van één vlag voor één gebruiker. Volgorde:
 *  1. vlag bestaat niet          → false, ERROR / FLAG_NOT_FOUND (code die naar een oude vlag vraagt blijft werken: «uit»);
 *  2. eigen test van de tester   → die waarde, TARGETING_MATCH, metadata.test (ook als de hoofdschakelaar uit staat);
 *  3. hoofdschakelaar uit        → false, DISABLED;
 *  4. gebruiker in de lijst      → true, TARGETING_MATCH;
 *  5. procent-uitrol > 0         → emmer < percentage, SPLIT;
 *  6. anders                     → standaard, STATIC.
 */
export function evalueer(key: string, vlag: Vlag | undefined, userId: string, test?: boolean | null): Uitkomst {
  if (!vlag) return uit(key, false, 'ERROR', { errorCode: 'FLAG_NOT_FOUND' });
  if (typeof test === 'boolean') return uit(key, test, 'TARGETING_MATCH', { metadata: { test: true } });
  if (!vlag.aan) return uit(key, false, 'DISABLED');
  if (vlag.gebruikers.includes(userId)) return uit(key, true, 'TARGETING_MATCH');
  if (vlag.percentage > 0) return uit(key, emmer(vlag.sleutel, userId) < vlag.percentage, 'SPLIT');
  return uit(key, vlag.standaard, 'STATIC');
}

/** Controle van invoer bij opslaan (server). Geeft een foutcode of null. */
export function vlagFout(v: Partial<Vlag>): string | null {
  if (typeof v.sleutel !== 'string' || !SLEUTEL_RE.test(v.sleutel)) return 'SLEUTEL_ONGELDIG';
  if (typeof v.omschrijving !== 'string' || v.omschrijving.length > 300) return 'OMSCHRIJVING_ONGELDIG';
  if (typeof v.aan !== 'boolean' || typeof v.standaard !== 'boolean') return 'WAARDE_ONGELDIG';
  if (!Number.isInteger(v.percentage) || (v.percentage as number) < 0 || (v.percentage as number) > 100) return 'PERCENTAGE_ONGELDIG';
  if (!Array.isArray(v.gebruikers) || v.gebruikers.length > MAX_GEBRUIKERS) return 'GEBRUIKERS_ONGELDIG';
  return null;
}

/**
 * Uitleg in gewone woorden per bekende schakelaar (20261028, vraag van Pavlo: «що і для чого незрозуміло»).
 * [wat het doet, wanneer aanzetten, wat er gebeurt] — Oekraïens en Nederlands apart, zonder vreemde woorden.
 * De omschrijving in de database blijft ongemoeid (geen migratie); onbekende sleutels tonen die omschrijving.
 */
export type VlagUitleg = { naam: [string, string]; wat: [string, string]; wanneer: [string, string]; gevolg: [string, string] };
export const VLAG_UITLEG: Record<string, VlagUitleg> = {
  'identiteit-account-atelier': {
    naam: ['Нове оформлення «Керування обліковим записом»', 'Nieuwe vorm van «Accountbeheer»'],
    wat: ['Оновлене оформлення сторінки облікового запису: дванадцять зрозумілих розділів, змістовні кольорові піктограми, ілюстрації та розгортні налаштування. Справжні дії залишаються незмінними.', 'Vernieuwde accountpagina met twaalf duidelijke onderdelen, betekenisvolle gekleurde pictogrammen, illustraties en uitklapbare instellingen. De echte handelingen blijven hetzelfde.'],
    wanneer: ['Увімкніть спершу тільки для себе. Потім можна відкрити для вибраних людей, частини користувачів або всіх.', 'Zet eerst alleen voor uzelf aan. Daarna eventueel voor gekozen mensen, een deel van de gebruikers of iedereen.'],
    gevolg: ['Вимкнення негайно повертає попереднє оформлення без втрати налаштувань. Перемикач не змінює прав доступу й способів входу.', 'Uitschakelen brengt de vorige vorm onmiddellijk terug zonder instellingen te verliezen. De schakelaar verandert geen rechten of aanmeldmethoden.'],
  },
  'identiteit-account-maquette': {
    naam: ['Вигляд «Макет» у «Керуванні обліковим записом»', 'Weergave «Ontwerp» in «Accountbeheer»'],
    wat: ['Дизайн власника як типовий вигляд сторінки облікового запису: герой, картки чотирьох груп, якірне меню з будь-якого краю, швидкий пошук Ctrl+K. Справжні дії й права ті самі; у вигляді лишається вибір «Студія» або класичний.', 'Het ontwerp van de eigenaar als standaardweergave van de accountpagina: hero, kaarten in vier groepen, een ankermenu aan elke rand, snel zoeken met Ctrl+K. Echte handelingen en rechten blijven gelijk; de keuze «Studio» of klassiek blijft.'],
    wanneer: ['Потребує ввімкненого прапорця «Нове оформлення». Спершу тільки для себе, потім для частини людей або всіх. Надалі цей вигляд планується як тема сайту.', 'Vereist de vlag «Nieuwe vorm». Eerst alleen voor uzelf, daarna voor een deel of iedereen. Later is deze weergave bedoeld als thema van de site.'],
    gevolg: ['Вимкнення прибирає вигляд «Макет» з вибору; хто його обрав, бачить «Студію». Налаштування й дані не змінюються.', 'Uitschakelen haalt «Ontwerp» uit de keuze; wie het koos, ziet de Studio. Instellingen en gegevens veranderen niet.'],
  },
  'apparaat-bevestiging-v1': {
    naam: ['Підтвердження з іншого пристрою', 'Bevestigen vanaf een ander apparaat'],
    wat: ['У вікні «Підтвердіть доступ» з’являються вкладки «Інший пристрій» і «У Telegram». На іншому увійденому пристрої вискакує вікно «Це ви?» з тими самими трьома символами; на запитувачі один виділено. Одна спроба, відлік, «Це не я» завжди перемагає. Налаштування — у «Способах входу» й в адмініструванні → «Єдиний вхід».', 'In het venster «Toegang bevestigen» komen de tabbladen «Ander apparaat» en «In Telegram». Op een ander aangemeld apparaat verschijnt «Bent u het?» met dezelfde drie symbolen; op het vragende apparaat is er één uitgelicht. Eén poging, aftelling, «Dit ben ik niet» wint altijd. Instellingen bij «Aanmeldmethoden» en in beheer → «Eenmalige aanmelding».'],
    wanneer: ['Типово увімкнено: не потребує ключа бота чи зовнішніх служб. Вимкніть, якщо хочете, щоб підтвердження відбувалося лише ключем доступу чи кодом на самому пристрої.', 'Standaard aan: geen botsleutel of externe dienst nodig. Zet uit als bevestigen alleen met toegangssleutel of code op het apparaat zelf mag.'],
    gevolg: ['Вимкнення одразу ховає вкладки й зупиняє швидкий потік; відкриті запити згасають самі. Налаштування й лічильники зберігаються. Інші способи підтвердження не змінюються.', 'Uitschakelen verbergt meteen de tabbladen en stopt de snelle stroom; open verzoeken verlopen vanzelf. Instellingen en tellers blijven bewaard. Andere bevestigingsmanieren veranderen niet.'],
  },
  'telegram-aanmelden-v1': {
    naam: ['Вхід і підтвердження через Telegram', 'Aanmelden en bevestigen via Telegram'],
    wat: ['Офіційна кнопка Telegram на сторінці входу, прив’язка Telegram з обов’язковим власним номером телефону, підтвердження дій у боті @MijnRuimte_Bot, гарні картки сповіщень, таблиця «що чим підтверджувати», таємний код і чесна служба стану. В адмінці з’являється розділ «Способи входу» → Telegram.', 'Officiële Telegram-knop op het aanmeldscherm, Telegram koppelen met verplicht eigen telefoonnummer, handelingen bevestigen in de bot @MijnRuimte_Bot, mooie meldingskaarten, een tabel «wat waarmee bevestigen», een geheime code en een eerlijke statusdienst. In het beheer verschijnt «Aanmeldmethoden» → Telegram.'],
    wanneer: ['Спершу тільки для себе: у адмінці введіть ключ бота й натисніть «Налаштувати бота», прив’яжіть свій Telegram і перевірте. Потім — для частини людей або всіх.', 'Eerst alleen voor uzelf: voer in het beheer de botsleutel in en kies «Bot instellen», koppel uw eigen Telegram en test. Daarna voor een deel van de mensen of iedereen.'],
    gevolg: ['Вимкнення одразу ховає кнопку Telegram і зупиняє бота; прив’язки, коди й налаштування зберігаються до наступного вмикання. Інші способи входу не змінюються.', 'Uitschakelen verbergt de Telegram-knop meteen en zet de bot stil; koppelingen, codes en instellingen blijven bewaard tot de volgende inschakeling. Andere aanmeldmethoden veranderen niet.'],
  },
  'aanmeldmethoden-vnext': {
    naam: ['Нові «Способи входу» (UI-015)', 'Nieuwe aanmeldmethoden (UI-015)'],
    wat: ['Сучасна сторінка способів входу: банер, зрозумілі картки методів з однією дією, деталі в бокових панелях. Усі чинні механізми (Google, passkeys, TOTP, коди відновлення, шифрування, коди доступу, step-up) — ті самі, лише в новому поданні; плюс чесний каталог майбутніх провайдерів.', 'Moderne aanmeldmethoden-pagina: hero, duidelijke methodekaarten met één hoofdactie, details in zijpanelen. Alle bestaande mechanismen (Google, passkeys, TOTP, herstelcodes, versleuteling, toegangscodes, step-up) blijven dezelfde; plus een eerlijke catalogus van toekomstige aanbieders.'],
    wanneer: ['Вмикайте, щоб отримати нове подання; стара форма завжди доступна вимкненням прапорця.', 'Zet aan voor de nieuwe weergave; het oude formulier blijft via de vlag altijd beschikbaar.'],
    gevolg: ['Вимкнено — стара сторінка без змін. «Безпека» і «Відновлення» в обох станах лишаються на чинній формі.', 'Uit = de huidige pagina, ongewijzigd. «Beveiliging» en «Herstel» blijven in beide standen op het bestaande formulier.'],
  },
  'afstemming-vnext': {
    naam: ['Нова «Звірка» (UI-014, Afstemming vNext)', 'Nieuwe afstemming (UI-014, Afstemming vNext)'],
    wat: ['Розумна картотека розвитку продукту на api/afstemming: картки з життєвим циклом і ЧЕСНИМ станом придатності, незмінна історія рішень, зв’язки/дублікати/конфлікти з рішенням власника, прив’язка до реальних випусків, звіти.', 'Slimme productkartotheek op api/afstemming: kaarten met levensloop en EERLIJKE gezondheid, onveranderlijke beslisgeschiedenis, relaties/duplicaten/conflicten met eigenaarsbesluit, koppeling aan echte releases, rapporten.'],
    wanneer: ['Вмикайте, щоб вести задуми, вимоги й докази в одному місці; 25 старих тверджень матриці мігрують як legacy-картки без підвищення доказовості.', 'Zet aan om ideeën, eisen en bewijs op één plek te beheren; de 25 oude matrix-claims migreren als legacy-kaarten zonder hogere bewijslaag.'],
    gevolg: ['Вимкнено — стара «Матриця фактичної реалізації» без змін. Дані карток зберігаються і чекають наступного вмикання.', 'Uit = de oude waarheidsmatrix, ongewijzigd. De kaartgegevens blijven bewaard tot de volgende inschakeling.'],
  },
  'cloud-vnext': {
    naam: ['Нова «Хмара» (Cloud vNext)', 'Nieuwe cloud (Cloud vNext)'],
    wat: ['Нова сторінка хмари: «Мої файли» з теками, тегами, обраним, кошиком (30 днів) і версіями; завантаження частинами до 64 МБ; огляд із реальною статистикою; чесний центр інтеграцій (Google працює; OneDrive/Dropbox/Box — після ключів власника; iCloud/Proton — чому неможливо).', 'Nieuwe cloudpagina: «Mijn bestanden» met mappen, labels, favorieten, prullenbak (30 dagen) en versies; upload in stukken tot 64 MB; overzicht met echte cijfers; eerlijk integratiecentrum (Google werkt; OneDrive/Dropbox/Box na sleutels van de eigenaar; iCloud/Proton: waarom niet kan).'],
    wanneer: ['Увімкніть спершу лише для себе; дані спільні зі старою сторінкою, нічого не переноситься.', 'Zet eerst alleen voor uzelf aan; de gegevens zijn gedeeld met de oude pagina, er wordt niets gemigreerd.'],
    gevolg: ['Старі записи й файли видно одразу (без тек, доки ви їх не створите). Вимкнено — стара сторінка хмари без змін.', 'Bestaande records en bestanden zijn meteen zichtbaar (zonder mappen tot u ze maakt). Uit = de oude cloudpagina, ongewijzigd.'],
  },
  'foto-dienst': {
    naam: ['Новий розділ «Фото»', 'Nieuwe dienst «Foto’s»'],
    wat: ['Розділ «Фото» в «Моєму просторі»: одна стрічка всіх фото й відео, альбоми, пошук і фільтри, дублікати, імпорт архівів Google Takeout, Instagram, Facebook, VK, Telegram, Flickr, ZIP і тек.', 'Onderdeel «Foto’s» in «Mijn ruimte»: één tijdlijn van alle foto’s en video’s, albums, zoeken en filters, duplicaten, import van Google Takeout, Instagram, Facebook, VK, Telegram, Flickr, ZIP en mappen.'],
    wanneer: ['Увімкніть спершу лише для себе. Фото з «Хмарного сховища» з’являться без копіювання.', 'Zet eerst alleen voor uzelf aan. Foto’s uit «Cloudopslag» verschijnen zonder kopie.'],
    gevolg: ['Нічого не видаляється із зовнішніх сервісів. Вимкнено — розділу немає, імпортовані фото лишаються на сервері.', 'Er wordt niets uit externe diensten verwijderd. Uit = geen onderdeel, geïmporteerde foto’s blijven op de server.'],
  },
  'menu-kalender-foto-eigen': {
    naam: ['Календар і Фото в «Моєму просторі»', 'Agenda en Foto’s in «Mijn ruimte»'],
    wat: ['Прибирає «Календар» і «Фото» з меню «Хмарне сховище» і показує їх у «Моєму просторі». Старі адреси переводять на нові.', 'Haalt «Agenda» en «Foto’s» uit het menu «Cloudopslag» en toont ze in «Mijn ruimte». Oude adressen sturen door.'],
    wanneer: ['Разом із «Новий розділ «Фото»» або окремо.', 'Samen met «Nieuwe dienst «Foto’s»» of los.'],
    gevolg: ['Сам календар не змінюється. Вимкнено — меню як раніше.', 'De agenda zelf verandert niet. Uit = menu zoals vroeger.'],
  },
  'huis-vnext': {
    naam: ['Новий «Розумний будинок» (Huis vNext)', 'Nieuw slim huis (Huis vNext)'],
    wat: ['Нова сторінка huis: кімнати з планом, пристрої, сцени, автоматизації (чернетки й симуляція), безпека, енергія, події, інтеграції (Home Assistant), ШІ-пропозиції, showroom, калькулятор.', 'Nieuwe huis-pagina: kamers met plattegrond, apparaten, scènes, automatiseringen (concept en simulatie), beveiliging, energie, gebeurtenissen, integraties (Home Assistant), AI-voorstellen, showroom, planner.'],
    wanneer: ['Увімкніть спершу лише для себе; без підключеного Home Assistant сторінка чесно порожня.', 'Zet eerst alleen voor uzelf aan; zonder gekoppelde Home Assistant is de pagina eerlijk leeg.'],
    gevolg: ['Стани лише з підтверджених джерел; команди — лише після окремого дозволу на запис; замки/охорона — лише людина з підтвердженням входу. Вимкнено — стара інформаційна сторінка.', 'Toestanden alleen uit bevestigde bronnen; opdrachten alleen na aparte schrijftoestemming; sloten/alarm alleen een mens met bevestiging van de aanmelding. Uit = de oude informatiepagina.'],
  },
  'notities-vnext': {
    naam: ['Нові нотатки (Notities vNext)', 'Nieuwe notities (Notities vNext)'],
    wat: ['Нова сторінка «Нотатки»: теки, теги, закріплення, архів і кошик, редактор Markdown із чеклістами, імпорт/експорт файлів.', 'Nieuwe pagina «Notities»: mappen, etiketten, vastzetten, archief en prullenbak, Markdown-editor met checklists, bestandsimport/-export.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати нові нотатки.', 'Zet eerst alleen voor uzelf aan om de nieuwe notities te proberen.'],
    gevolg: ['Записи ті самі (старі нотатки перенесено без втрат, дошка й інструмент manage_hub_notes працюють як раніше). Вимкнено — стара сторінка, усі нотатки на місці.', 'Dezelfde notities (oude zijn zonder verlies overgezet; het bord en manage_hub_notes werken als voorheen). Uit = de oude pagina, alle notities blijven.'],
  },
  'bijlage-viewer-v2': {
    naam: ['Новий перегляд вкладень у пошті', 'Nieuwe bijlageviewer in mail'],
    wat: ['Компактні кнопки зі значками й підказками, документ займає майже все вікно, переклад і відомості про файл відкриваються збоку на вимогу.', 'Compacte knoppen met pictogrammen en uitleg, het document vult bijna het hele venster, vertaling en bestandsgegevens openen op verzoek opzij.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий вигляд.', 'Zet eerst alleen voor uzelf aan om de nieuwe weergave te proberen.'],
    gevolg: ['Усі дії ті самі (завантажити, зберегти, друк, редагувати, переклад); змінюється лише вигляд. Вимкнено — старий перегляд без змін.', 'Alle acties blijven (downloaden, opslaan, afdrukken, bewerken, vertalen); alleen het uiterlijk verandert. Uit = de oude viewer, ongewijzigd.'],
  },
  'accountmenu-v2': {
    naam: ['Охайніше меню акаунта', 'Verfijnd accountmenu'],
    wat: ['Велике фото й імʼя лишаються, кнопки компактні й згруповані, пояснення сховані під ⓘ, справжні прапорці мов, перемикач «Звичайний / Технічний» унизу меню.', 'Grote foto en naam blijven, knoppen compact en gegroepeerd, uitleg achter ⓘ, echte taalvlaggen, wissel «Gewone / Technische» onderaan het menu.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий вигляд.', 'Zet eerst alleen voor uzelf aan om de nieuwe weergave te proberen.'],
    gevolg: ['Усі дії ті самі; змінюється лише вигляд. Вимкнено — старе меню без змін.', 'Alle acties blijven; alleen het uiterlijk verandert. Uit = het oude menu, ongewijzigd.'],
  },
  'integraties-catalogus-v2': {
    naam: ['Новий каталог інтеграцій (теми й групи)', 'Nieuwe integratiecatalogus (thema’s en groepen)'],
    wat: ['Каталог на «Інтеграціях» групується за темами, а в кожній темі — за справжнім станом: підключені, можна підключити, потребують уваги, потребують налаштування, у розробці. Замість «Скоро» — чесний план.', 'De catalogus op «Integraties» staat per thema en daarbinnen per echte stand: gekoppeld, klaar om te koppelen, vraagt aandacht, instellen nodig, in ontwikkeling. In plaats van «Binnenkort» een eerlijk plan.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий вигляд.', 'Zet eerst alleen voor uzelf aan om de nieuwe weergave te proberen.'],
    gevolg: ['Усі 160 карток лишаються, нічого не підключається й не відключається само. Вимкнено — старий каталог без змін.', 'Alle 160 kaarten blijven; niets wordt vanzelf gekoppeld of losgekoppeld. Uit = de oude catalogus, ongewijzigd.'],
  },
  'verbindingen-centrum-v2': {
    naam: ['Новий центр підключень («Акаунти»)', 'Nieuw verbindingencentrum («Accounts»)'],
    wat: ['Сторінка «Акаунти» у Хмарному сховищі: короткий стан, мої підключення, каталог сервісів, синхронізація та історія, по одному «?» на блок.', 'De pagina «Accounts» in de cloud: korte status, mijn verbindingen, catalogus, synchronisatie en geschiedenis, één «?» per blok.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати нову сторінку.', 'Zet eerst alleen voor uzelf aan om de nieuwe pagina te proberen.'],
    gevolg: ['Підключення ті самі, нічого не видаляється й не відключається. Вимкнено — стара сторінка «Акаунти».', 'Dezelfde verbindingen; niets wordt gewist of losgekoppeld. Uit = de oude pagina «Accounts».'],
  },
  'uitrol-weergave-v2': {
    naam: ['Новий вигляд «Оновлення»', 'Nieuwe weergave «Updates»'],
    wat: ['Термінал українською (оригінал завжди доступний), учасники кожного випуску, компактний блок «Хто має доступ до підготовки», історія з групами спроб і діями відновлення, короткий підсумок проблем в «Огляді».', 'Terminal in het Oekraïens (origineel altijd beschikbaar), deelnemers per release, compact blok «Wie heeft toegang tot voorbereiden», geschiedenis met gegroepeerde pogingen en herstelacties, korte probleemsamenvatting op «Overzicht».'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий вигляд.', 'Zet eerst alleen voor uzelf aan om de nieuwe weergave te proberen.'],
    gevolg: ['Розгортання, passkey, перевірки, журнал і відкат ті самі; змінюється лише вигляд. Вимкнено — стара сторінка.', 'Uitrol, passkey, controles, logboek en terugdraaien blijven gelijk; alleen de weergave verandert. Uit = de oude pagina.'],
  },
  'mail-zoeken-v2': {
    naam: ['Новий пошук і фільтри в Пошті', 'Nieuw zoeken en filters in Mail'],
    wat: ['Одна компактна панель пошуку: швидкі фільтри, згруповані умови, зручний вибір періоду. Пошук запускається лише кнопкою «Шукати».', 'Eén compact zoekpaneel: snelle filters, gegroepeerde voorwaarden, eenvoudige periodekeuze. Zoeken start pas met «Zoeken».'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий пошук.', 'Zet eerst alleen voor uzelf aan om het nieuwe zoeken te proberen.'],
    gevolg: ['Умови пошуку, збережені пошуки й результати ті самі; змінюється лише панель. Вимкнено — стара панель фільтрів і «Ще умови».', 'Zoekvoorwaarden, opgeslagen zoekopdrachten en resultaten blijven gelijk; alleen het paneel verandert. Uit = het oude filterpaneel en «Meer voorwaarden».'],
  },
  'agenda-v3': {
    naam: ['Новий календар (Agenda v3)', 'Nieuwe agenda (Agenda v3)'],
    wat: ['Нова сторінка «Календар»: великий календар, мінікалендар, список календарів, зручний вигляд на телефоні.', 'Nieuwe pagina «Agenda»: grote agenda, minikalender, lijst met agenda’s, prettig op de telefoon.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий вигляд календаря.', 'Zet eerst alleen voor uzelf aan om de nieuwe agenda te proberen.'],
    gevolg: ['Події, підключення й дозволи ті самі; змінюється лише вигляд. Вимкнено — старий календар без змін.', 'Afspraken, koppelingen en rechten blijven gelijk; alleen het uiterlijk verandert. Uit = de oude agenda, ongewijzigd.'],
  },
  'meldingen-v2': {
    naam: ['Новий центр сповіщень', 'Nieuw meldingencentrum'],
    wat: ['Компактний список: повтори зливаються в один рядок, окремий лічильник «потребує уваги», правила для кожного сервісу й акаунта, «Не турбувати».', 'Compacte lijst: herhalingen worden één regel, aparte teller «vraagt aandacht», regels per dienst en account, «Niet storen».'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий центр сповіщень.', 'Zet eerst alleen voor uzelf aan om het nieuwe meldingencentrum te proberen.'],
    gevolg: ['Сповіщення ті самі, нічого не видаляється. Важливі сповіщення безпеки не можна приглушити. Вимкнено — старий центр.', 'Dezelfde meldingen, niets wordt gewist. Belangrijke beveiligingsmeldingen kunnen niet gedempt worden. Uit = het oude centrum.'],
  },
  'meldingen-uitleg-v3': {
    naam: ['Зрозумілі сповіщення й розмір панелі', 'Begrijpelijke meldingen en paneelgrootte'],
    wat: ['У кожному сповіщенні: хто, що саме, коли, чому, чим загрожує й що робити, плюс кнопки швидких дій (відкрити, переглянути зміну, відкликати, вимкнути цей тип). Розмір тексту й панелі можна обрати.', 'In elke melding: wie, wat precies, wanneer, waarom, wat het gevolg is en wat te doen, plus snelle acties (openen, wijziging bekijken, intrekken, dit soort uitzetten). Tekst- en paneelgrootte instelbaar.'],
    wanneer: ['Потрібен увімкнений «Новий центр сповіщень». Увімкніть спершу лише для себе.', 'Vereist «Nieuw meldingencentrum». Zet eerst alleen voor uzelf aan.'],
    gevolg: ['Сповіщення ті самі. Небезпечні дії (відкликати, заборонити) ведуть на сторінку, де їх треба підтвердити; самі не виконуються. Вимкнено — як зараз.', 'Dezelfde meldingen. Gevaarlijke acties (intrekken, verbieden) leiden naar de pagina waar u ze bevestigt; ze gebeuren nooit vanzelf. Uit = zoals nu.'],
  },
  'ruimtes-scheiding': {
    naam: ['Суворе розділення просторів', 'Strikte scheiding van de ruimtes'],
    wat: ['Технічний простір працює лише, поки ви увійшли на сайт у цьому самому вході.', 'De technische ruimte werkt alleen zolang u in dezelfde aanmelding op de site bent.'],
    wanneer: ['Увімкніть, щоб перевірити нове, суворіше розділення звичайного й технічного простору.', 'Zet aan om de nieuwe, strengere scheiding van gewone en technische ruimte te proberen.'],
    gevolg: ['Після виходу з сайту технічний простір закривається сам; журнали ведуться окремо. Прав не додає.', 'Na afmelden sluit de technische ruimte vanzelf; logboeken apart. Geeft geen rechten.'],
  },
  'ssh-certificaat': {
    naam: ['Кнопка «Сертифікат SSH»', 'Knop «SSH-certificaat»'],
    wat: ['Показує в технічному профілі кнопку для короткого сертифіката входу на сервер.', 'Toont in het technisch profiel een knop voor een kort certificaat om op de server in te loggen.'],
    wanneer: ['Увімкніть, якщо хочете спробувати вхід на сервер через сайт.', 'Zet aan als u inloggen op de server via de site wilt proberen.'],
    gevolg: ['З’явиться лише кнопка; підписати сертифікат можна тільки з окремим дозволом. Прав не додає.', 'Alleen de knop verschijnt; ondertekenen kan alleen met een aparte toestemming. Geeft geen rechten.'],
  },
  'tech-ruimtes-v2': {
    naam: ['Два простори одного акаунта (нова версія)', 'Twee ruimtes van één account (nieuwe versie)'],
    wat: ['Звичайний і технічний простір поруч: три терміни, пауза, перемикач угорі.', 'Gewone en technische ruimte naast elkaar: drie termijnen, pauze, schakelaar bovenaan.'],
    wanneer: ['Увімкніть, щоб працювати з новим перемикачем просторів.', 'Zet aan om met de nieuwe ruimteschakelaar te werken.'],
    gevolg: ['Змінюється лише вигляд і порядок входу в технічний простір. Прав не додає й не забирає.', 'Alleen het uiterlijk en de manier van binnengaan veranderen. Geeft of neemt geen rechten.'],
  },
  'tech-ruimtes-v2-schaduw': {
    naam: ['Тихе порівняння перевірок', 'Stille vergelijking van controles'],
    wat: ['Сайт тихо порівнює стару й нову перевірку доступу і записує розбіжності в журнал.', 'De site vergelijkt stil de oude en nieuwe toegangscontrole en schrijft verschillen in het logboek.'],
    wanneer: ['Увімкніть перед переходом на нову версію, щоб побачити, чи щось відрізняється.', 'Zet aan vóór de overstap naar de nieuwe versie, om te zien of er iets verschilt.'],
    gevolg: ['Для вас нічого не змінюється; лише з’являються записи в журналі.', 'Voor u verandert niets; er komen alleen regels in het logboek.'],
  },
  'werkblad-v3': {
    naam: ['Новий робочий стіл', 'Nieuw werkblad'],
    wat: ['Вільне полотно: значки й вікна можна ставити будь-де, окремо для ПК, планшета й телефона.', 'Vrij vlak: pictogrammen en vensters overal neerzetten, apart voor pc, tablet en telefoon.'],
    wanneer: ['Увімкніть, щоб спробувати новий робочий стіл.', 'Zet aan om het nieuwe werkblad te proberen.'],
    gevolg: ['Вимкнення повертає старий стіл; ваші розкладки не видаляються. Прав не додає.', 'Uitzetten geeft het oude werkblad terug; uw indelingen blijven bewaard. Geeft geen rechten.'],
  },
  'werkblad-blokken': {
    naam: ['Блоки на робочому столі', 'Blokken op het werkblad'],
    wat: ['Значки можна групувати в блоки (і блок у блоці) з власним розміром.', 'Pictogrammen in blokken groeperen (ook blok in blok) met een eigen grootte.'],
    wanneer: ['Увімкніть, щоб спробувати блоки.', 'Zet aan om blokken te proberen.'],
    gevolg: ['Вимкнення ховає блоки, але не видаляє їх. Прав не додає.', 'Uitzetten verbergt de blokken maar wist ze niet. Geeft geen rechten.'],
  },
};

export const HELP_FLAGS: HelpLagen = {
  wat: ['Перемикачі функцій вмикають нову можливість сайту поступово: спершу для себе, потім для вибраних людей або частини користувачів.',
    'Functieschakelaars zetten een nieuwe mogelijkheid van de site stap voor stap aan: eerst voor uzelf, dan voor gekozen mensen of een deel van de gebruikers.'],
  gevolg: ['Перемикач змінює лише те, що людина бачить або може спробувати. Прав він не дає й не забирає.',
    'Een schakelaar verandert alleen wat iemand ziet of kan proberen. Rechten geeft of neemt hij niet.'],
  risico: ['Головний вимикач вимикає функцію для всіх одразу. «Увімкнено для мене» діє лише для вас і лише до кінця технічного сеансу (не довше 8 годин).',
    'De hoofdschakelaar zet de functie voor iedereen meteen uit. «Aan voor mij» geldt alleen voor u en alleen tot het einde van de technische sessie (hoogstens 8 uur).'],
  dev: ['Таблиця app.feature_flags на вашому сервері; відповідь у форматі OpenFeature OFREP: POST /api/ofrep/v1/evaluate/flags[/<ключ>]. Частка — постійний «кошик» FNV-1a(ключ:користувач) % 100. Порядок: тест тестувальника → головний перемикач → список → частка → типове значення.',
    'Tabel app.feature_flags op uw server; antwoord in OpenFeature-OFREP-vorm: POST /api/ofrep/v1/evaluate/flags[/<sleutel>]. Deel = vaste emmer FNV-1a(sleutel:gebruiker) % 100. Volgorde: test van de tester → hoofdschakelaar → lijst → deel → standaard.'],
};
