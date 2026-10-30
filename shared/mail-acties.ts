// Acties met een brief — één bron van waarheid (blok 1, 25.10.2026, punt 1.2). Puur (geen DOM, geen React), zoals shared/plaatsing.ts.
//
// Vroeger had elk oppervlak zijn eigen kopie: knoppen en ⋮ van de rij (MailRijSnelleActies), de instellingen van de snelle acties,
// de selectiebalk met zijn menu «›» op de telefoon, de acties van het leesvenster (GoogleMailWerkruimte), de onderbalk op de telefoon
// (MailLezerWerkbalk), de veegknoppen (MailBerichtRij) en het sneltoetsenoverzicht — met verschillende namen en vijf manieren om
// te kleuren (o.a. CSS op de tekst van aria-label). Nu geeft dit register per actie: groep, toon, teksten (uk + nl, lang en kort,
// voor meerdere brieven, voor de instellingen en het overzicht), sneltoets en toestanden (gelezen/ongelezen, ster aan/uit …).
//
// De toon is betekenis, geen kleur: src/mail/mail-acties.css is de ENIGE plek die een toon in kleur vertaalt
// ([data-toon=gevaar] → --fout, [data-toon=info] → --info …); elk oppervlak leest color:var(--actie-kleur,var(--muted)).
// De ids zijn dezelfde als in de opgeslagen voorkeuren (mailRowQuickActionIds, mailReaderToolbarActionIds): niet hernoemen.

export type MailTaal = 'uk' | 'nl';
export type MailTekst = { uk: string; nl: string };
/** Betekenis van een actie voor de kleur: gevaar = verwijderen/melden (rood), info = opbergen/verplaatsen (blauw), let-op = belang
 *  en blokkeren (amber), etiket = labels (paars), neutraal = de rest (--muted). */
export type MailActieToon = 'neutraal' | 'gevaar' | 'info' | 'let-op' | 'etiket';
export const MAIL_ACTIE_TONEN: readonly MailActieToon[] = ['neutraal', 'gevaar', 'info', 'let-op', 'etiket'];
/** Groep in «Додаткові дії» (⋮ van het leesvenster); dezelfde volgorde als het menu. */
export type MailActieGroep = 'antwoord' | 'ordenen' | 'bekijken' | 'veilig' | 'wissen';
/** Vorm van een tekst: lang = naam van de knop (aria-label, tooltip, menu); kort = onderbalk en veegknop; bulk = voor de gekozen
 *  brieven (selectiebalk); bulkKort = menu «›» van de selectie op de telefoon; instelling = lijst «Швидкі дії у рядку»; hulp = overzicht «?». */
export type MailTekstVorm = 'lang' | 'kort' | 'bulk' | 'bulkKort' | 'instelling' | 'hulp';

type Teksten = { lang: MailTekst } & Partial<Record<Exclude<MailTekstVorm, 'lang'>, MailTekst>>;
type Toestand = Partial<Teksten> & { toon?: MailActieToon };
export type MailActieDef = Teksten & { groep: MailActieGroep; toon: MailActieToon; sneltoets?: string; toestanden?: Record<string, Toestand> };

const t = (uk: string, nl: string): MailTekst => ({ uk, nl });

export const MAIL_ACTIES = {
  // ---------------------------------------------------------------- beantwoorden en doorsturen
  reply: { groep: 'antwoord', toon: 'neutraal', lang: t('Відповісти', 'Beantwoorden'), hulp: t('Відповісти відправнику', 'De afzender beantwoorden'), sneltoets: 'R' },
  'reply-all': { groep: 'antwoord', toon: 'neutraal', lang: t('Відповісти всім', 'Allen beantwoorden'), sneltoets: 'A' },
  'emoji-reply': { groep: 'antwoord', toon: 'neutraal', lang: t('Відповісти emoji', 'Met emoji reageren') },
  'forward-attachment': { groep: 'antwoord', toon: 'neutraal', lang: t('Переслати як вкладення', 'Doorsturen als bijlage'), sneltoets: 'F' },
  translate: { groep: 'antwoord', toon: 'neutraal', lang: t('Перекласти', 'Vertalen'), toestanden: { aan: {}, uit: { lang: t('Показати оригінал', 'Origineel tonen') } } },
  // ---------------------------------------------------------------- ordenen
  archive: { groep: 'ordenen', toon: 'info', lang: t('Архівувати', 'Archiveren'), kort: t('Архів', 'Archief'), sneltoets: 'E' },
  read: {
    groep: 'ordenen', toon: 'neutraal', lang: t('Позначити прочитаним', 'Markeren als gelezen'), kort: t('Прочитано', 'Gelezen'), instelling: t('Стан прочитаності', 'Leesstatus'),
    toestanden: { gelezen: {}, ongelezen: { lang: t('Позначити непрочитаним', 'Markeren als ongelezen'), kort: t('Непрочитано', 'Ongelezen') } },
  },
  star: { groep: 'ordenen', toon: 'neutraal', lang: t('Додати зірочку', 'Ster toevoegen'), toestanden: { aan: {}, uit: { lang: t('Прибрати зірочку', 'Ster verwijderen') } } },
  snooze: { groep: 'ordenen', toon: 'neutraal', lang: t('Відкласти', 'Uitstellen'), kort: t('Відкласти', 'Uitstellen'), toestanden: { nieuw: {}, wijzig: { lang: t('Змінити відкладання', 'Uitstel wijzigen') }, lokaal: { lang: t('Задати локальний час', 'Lokale tijd instellen') } } },
  move: { groep: 'ordenen', toon: 'info', lang: t('Перемістити', 'Verplaatsen') },
  inbox: { groep: 'ordenen', toon: 'info', lang: t('Перемістити у Вхідні', 'Naar Postvak IN verplaatsen'), kort: t('Вхідні', 'Postvak IN'), toestanden: { verplaats: {}, herstel: { lang: t('Відновити у Вхідні', 'Herstellen in Postvak IN') } } },
  labels: { groep: 'ordenen', toon: 'etiket', lang: t('Мітки', 'Labels') },
  tasks: { groep: 'ordenen', toon: 'neutraal', lang: t('Додати до завдань', 'Aan taken toevoegen') },
  event: { groep: 'ordenen', toon: 'neutraal', lang: t('Створити подію', 'Afspraak maken') },
  'filter-similar': { groep: 'ordenen', toon: 'neutraal', lang: t('Фільтрувати подібні', 'Vergelijkbare berichten filteren') },
  'ignore-thread': { groep: 'ordenen', toon: 'neutraal', lang: t('Ігнорувати ланцюжок', 'Gesprek negeren') },
  unsubscribe: { groep: 'ordenen', toon: 'neutraal', lang: t('Скасувати підписку', 'Afmelden') },
  classifyPeople: {
    groep: 'ordenen', toon: 'neutraal', lang: t('Запам’ятати відправника: Від людей', 'Afzender onthouden: van mensen'),
    bulk: t('Позначити вибрані як «Від людей»', 'Geselecteerde markeren als ‘van mensen’'), bulkKort: t('Від людей', 'Van mensen'),
  },
  classifySystem: {
    groep: 'ordenen', toon: 'neutraal', lang: t('Запам’ятати відправника: Системні / розсилки / сповіщення', 'Afzender onthouden: systeem / nieuwsbrieven / meldingen'),
    bulk: t('Позначити вибрані як «Системні / розсилки / сповіщення»', 'Geselecteerde markeren als ‘systeem / nieuwsbrieven / meldingen’'), bulkKort: t('Системні / розсилки', 'Systeem / nieuwsbrieven'),
  },
  attention: {
    groep: 'ordenen', toon: 'let-op', lang: t('Важливий / звичайний відправник', 'Belangrijke / gewone afzender'),
    toestanden: {
      belangrijk: { lang: t('Позначити відправника важливим', 'Afzender als belangrijk markeren'), bulk: t('Позначити відправників важливими', 'Afzenders als belangrijk markeren'), bulkKort: t('Позначити важливими', 'Als belangrijk markeren') },
      gewoon: { lang: t('Позначити відправника звичайним', 'Afzender als gewoon markeren'), bulk: t('Позначити відправників звичайними', 'Afzenders als gewoon markeren'), bulkKort: t('Позначити звичайними', 'Als gewoon markeren') },
    },
  },
  select: { groep: 'ordenen', toon: 'neutraal', lang: t('Обрати лист', 'Bericht selecteren') },
  senderColor: { groep: 'ordenen', toon: 'neutraal', lang: t('Колір відправника', 'Kleur van afzender') },
  promoteMessage: { groep: 'ordenen', toon: 'neutraal', lang: t('Цей лист: Важливий / Від людей', 'Dit bericht: belangrijk / van mensen') },
  promoteSender: { groep: 'ordenen', toon: 'neutraal', lang: t('Відправник: Важливий / Від людей', 'Afzender: belangrijk / van mensen') },
  // ---------------------------------------------------------------- bekijken
  preview: { groep: 'bekijken', toon: 'neutraal', lang: t('Попередній перегляд: текст, зображення, вкладення', 'Voorbeeld: tekst, afbeeldingen, bijlagen'), kort: t('Перегляд', 'Voorbeeld') },
  previous: { groep: 'bekijken', toon: 'neutraal', lang: t('Попередній лист', 'Vorig bericht'), kort: t('Попередній', 'Vorig'), sneltoets: 'K' },
  next: { groep: 'bekijken', toon: 'neutraal', lang: t('Наступний лист', 'Volgend bericht'), kort: t('Наступний', 'Volgend'), sneltoets: 'J' },
  details: { groep: 'bekijken', toon: 'neutraal', lang: t('Деталі листа', 'Berichtdetails') },
  'copy-from': { groep: 'bekijken', toon: 'neutraal', lang: t('Копіювати відправника', 'Afzender kopiëren') },
  print: { groep: 'bekijken', toon: 'neutraal', lang: t('Друк листа', 'Bericht afdrukken') },
  popout: { groep: 'bekijken', toon: 'neutraal', lang: t('Відкрити лист у новому вікні', 'Bericht in nieuw venster openen') },
  // ---------------------------------------------------------------- veiligheid
  spam: { groep: 'veilig', toon: 'gevaar', lang: t('Позначити як спам', 'Als spam markeren'), toestanden: { spam: {}, 'geen-spam': { toon: 'neutraal', lang: t('Це не спам', 'Geen spam') } } },
  block: { groep: 'veilig', toon: 'let-op', lang: t('Заблокувати відправника', 'Afzender blokkeren') },
  phishing: { groep: 'veilig', toon: 'gevaar', lang: t('Повідомити про фішинг', 'Phishing melden') },
  illegal: { groep: 'veilig', toon: 'gevaar', lang: t('Повідомити про незаконний вміст', 'Illegale inhoud melden') },
  // ---------------------------------------------------------------- verwijderen
  trash: { groep: 'wissen', toon: 'gevaar', lang: t('До кошика', 'Naar prullenbak'), kort: t('Кошик', 'Prullenbak'), bulk: t('Перемістити до кошика', 'Naar prullenbak verplaatsen') },
} as const satisfies Record<string, MailActieDef>;

export type MailActieId = keyof typeof MAIL_ACTIES;
export const MAIL_ACTIE_IDS = Object.keys(MAIL_ACTIES) as MailActieId[];
export const isMailActie = (id: string): id is MailActieId => Object.prototype.hasOwnProperty.call(MAIL_ACTIES, id);
const def = (id: MailActieId): MailActieDef => MAIL_ACTIES[id];
const toestandVan = (id: MailActieId, toestand?: string): Toestand => (toestand && def(id).toestanden?.[toestand]) || {};

/** Groepen van «Додаткові дії» in menuvolgorde, met naam (was GROEPEN/GROEP_NAAM in MailLezerWerkbalk.tsx). */
export const MAIL_ACTIE_GROEPEN: ReadonlyArray<{ id: MailActieGroep; naam: MailTekst }> = [
  { id: 'antwoord', naam: t('Відповісти й переслати', 'Beantwoorden en doorsturen') },
  { id: 'ordenen', naam: t('Упорядкувати', 'Ordenen') },
  { id: 'bekijken', naam: t('Перегляд', 'Bekijken') },
  { id: 'veilig', naam: t('Безпека', 'Veiligheid') },
  { id: 'wissen', naam: t('Видалення', 'Verwijderen') },
];

export const mailActieGroep = (id: MailActieId): MailActieGroep => def(id).groep;
/** Toon in deze toestand (bv. «Це не спам» is neutraal, «Позначити як спам» gevaar). */
export const mailActieToon = (id: MailActieId, toestand?: string): MailActieToon => toestandVan(id, toestand).toon || def(id).toon;
export const mailActieSneltoets = (id: MailActieId): string => def(id).sneltoets || '';

/** Volgorde waarin een vorm terugvalt: eerst de toestand, dan de actie zelf (kort → lang, bulkKort → bulk → lang …). */
const TERUGVAL: Record<MailTekstVorm, MailTekstVorm[]> = {
  lang: ['lang'], kort: ['kort', 'lang'], bulk: ['bulk', 'lang'], bulkKort: ['bulkKort', 'bulk', 'lang'], instelling: ['instelling', 'lang'], hulp: ['hulp', 'lang'],
};
/** Tekst van een actie in een taal, vorm en toestand. */
export function mailActieTekst(id: MailActieId, taal: MailTaal, opties: { vorm?: MailTekstVorm; toestand?: string } = {}): string {
  const d = def(id), s = toestandVan(id, opties.toestand), vorm = opties.vorm || 'lang';
  // De instellingen noemen de actie zelf, niet de toestand van één brief («Стан прочитаності», niet «Позначити прочитаним»).
  const bronnen: Array<Partial<Teksten>> = vorm === 'instelling' ? [d] : [s, d];
  for (const v of TERUGVAL[vorm]) for (const b of bronnen) { const x = b[v]; if (x) return x[taal]; }
  return d.lang[taal];
}

/** Alle teksten van het register (elke vorm, elke toestand) — voor de test en de zoekcatalogus. */
export function mailActieTeksten(id: MailActieId): MailTekst[] {
  const d = def(id), uit: MailTekst[] = [];
  const voeg = (x?: MailTekst) => { if (x && !uit.some((y) => y.uk === x.uk && y.nl === x.nl)) uit.push(x); };
  const vormen: MailTekstVorm[] = ['lang', 'kort', 'bulk', 'bulkKort', 'instelling', 'hulp'];
  for (const v of vormen) voeg(d[v]);
  for (const s of Object.values(d.toestanden || {})) for (const v of vormen) voeg(s[v]);
  return uit;
}
