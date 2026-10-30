// «?»-uitleg van het indexvenster op /zoek (zone D, 22.10.2026; src/zoek/ZoekIndexVenster.tsx). Geregistreerd in
// shared/hulp-register.ts (hulpRegistreren(HELP_ZOEK_INDEX)); tests/eenheid/hulp-register.test.ts controleert dat elke
// optie in src/zoek een sleutel hier heeft en een <HulpVraag/> ernaast.
import type { Tekst } from './tech-rollen';

type Item = { wat: Tekst; gevolg: Tekst; risico: Tekst; dev: Tekst; bron: string };
const T = (uk: string, nl: string): Tekst => [uk, nl];
const BRON = 'src/zoek/ZoekIndexVenster.tsx';

export const HELP_ZOEK_INDEX: Readonly<Record<string, Item>> = Object.freeze({
  'zoek.index.modus': {
    wat: T('Режим примусової індексації: повна (усі джерела з нуля) або часткова (вибрані джерела та/або лише змінені з дати).', 'Modus van de geforceerde indexatie: volledig (alle bronnen van voren af aan) of gedeeltelijk (gekozen bronnen en/of alleen gewijzigd sinds een datum).'),
    gevolg: T('Повна: водяну лінію кожного джерела скинуто, усе перечитується, зниклі об’єкти видаляються з індексу. Часткова: лише вибрані джерела — повністю, або з датою лише змінене після неї.', 'Volledig: de waterlijn van elke bron gaat terug naar nul, alles wordt herlezen, verdwenen objecten verdwijnen uit de index. Gedeeltelijk: alleen de gekozen bronnen — volledig, of met een datum alleen wat daarna wijzigde.'),
    risico: T('Повна індексація великої пошти чи Drive навантажує сервер і API Google (ліміти); запуск обмежений часом і кількістю (ENV), решту добирає cron.', 'Een volledige run over veel mail of Drive belast de server en de Google-API (limieten); de run is begrensd in tijd en aantal (ENV), de cron pakt de rest.'),
    dev: T('backend/zoek/beheer.ts → runStarten → plannen: z2StandZetten(waterlijn 0, volledigOp 0) + zoekMelden(actie volledig); обробка verwerkWachtItem під advisory lock cron:zoek-index.', 'backend/zoek/beheer.ts → runStarten → plannen: z2StandZetten(waterlijn 0, volledigOp 0) + zoekMelden(actie volledig); verwerking via verwerkWachtItem onder de advisory lock cron:zoek-index.'),
    bron: BRON,
  },
  'zoek.index.bron': {
    wat: T('Джерела, які переіндексовуються в частковому режимі: інтерфейс, пошта, вкладення, хмара, Drive, календар, дошка, GitHub.', 'Bronnen die in de gedeeltelijke modus opnieuw geïndexeerd worden: interface, e-mail, bijlagen, cloud, Drive, agenda, bord, GitHub.'),
    gevolg: T('Крок сканування планується лише для вибраних джерел у ваших просторах; «Вкладення» означає повторне сканування пошти (вкладення випливають із листів).', 'Alleen voor de gekozen bronnen in uw ruimtes wordt een scanstap gepland; «Bijlagen» betekent de mailscan opnieuw (bijlagen volgen uit de brieven).'),
    risico: T('Непідключене джерело не індексується (стан «не підключено»); вибір Drive/пошти зі закритим ключем шифрування чекає вашого входу.', 'Een niet-gekoppelde bron wordt niet geïndexeerd (stand «niet gekoppeld»); Drive/mail met een gesloten versleutelingssleutel wacht op uw aanmelding.'),
    dev: T('backend/zoek/beheer.ts bronnenKiezen/stappenPlannen; INDEX_BRONNEN у backend/zoek/bronnen.ts; ui покриває pagina/instelling/hulp.', 'backend/zoek/beheer.ts bronnenKiezen/stappenPlannen; INDEX_BRONNEN in backend/zoek/bronnen.ts; ui dekt pagina/instelling/hulp.'),
    bron: BRON,
  },
  'zoek.index.sinds': {
    wat: T('Дата «лише змінені з»: часткова індексація перечитує тільки об’єкти, змінені після цієї дати.', 'Datum «alleen gewijzigd sinds»: de gedeeltelijke run herleest alleen objecten die na die datum veranderden.'),
    gevolg: T('Водяну лінію джерела відсунуто назад до цієї дати (ніколи вперед); джерело, яке ще ні разу не сканувалося, читається повністю; порожнє поле — вибрані джерела повністю.', 'De waterlijn van de bron gaat terug tot die datum (nooit vooruit); een bron die nog nooit gescand werd, wordt volledig gelezen; leeg veld = de gekozen bronnen volledig.'),
    risico: T('Дата далеко в минулому ≈ повна індексація за навантаженням; GitHub не має стрічки змін і перечитується повністю.', 'Een datum ver terug ≈ een volledige run qua belasting; GitHub heeft geen wijzigingsfeed en wordt volledig herlezen.'),
    dev: T('backend/zoek/beheer.ts nieuweWaterlijn: поточна 0 → 0, інакше min(поточна, sinds); те саме для cursor.externWaterlijn (ICS/CalDAV); src/zoek/zoek-index-logica.ts sindsVanDatum.', 'backend/zoek/beheer.ts nieuweWaterlijn: huidig 0 → 0, anders min(huidig, sinds); hetzelfde voor cursor.externWaterlijn (ICS/CalDAV); src/zoek/zoek-index-logica.ts sindsVanDatum.'),
    bron: BRON,
  },
});
