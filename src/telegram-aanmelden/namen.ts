// TELEGRAM-AANMELDEN v1 — leesbare namen (uk/nl) voor interne codes, zodat de interface nooit een ruwe code toont.
// Читабельні назви (uk/nl) для внутрішніх кодів: інтерфейс ніколи не показує сирий код. Невідомий код → нейтральний текст.
type Lang = 'uk' | 'nl';

type Paar = [string, string];
const kies = (lang: Lang, p: Paar | undefined, terugval: Paar) => (lang === 'nl' ? (p ?? terugval)[1] : (p ?? terugval)[0]);

const STATUS: Record<string, Paar> = {
  werkt: ['Працює', 'Werkt'], traag: ['Повільно', 'Traag'], storing: ['Збій', 'Storing'],
  onbekend: ['Стан невідомий', 'Stand onbekend'], 'niet-ingesteld': ['Не налаштовано', 'Niet ingesteld'],
};
const KOPPELING: Record<string, Paar> = {
  actief: ['Працює', 'Actief'], gepauzeerd: ['Призупинено', 'Gepauzeerd'], geblokkeerd: ['Заблоковано', 'Geblokkeerd'], uitgeschakeld: ['Вимкнено', 'Uitgeschakeld'],
};
const REDEN: Record<string, Paar> = {
  alarmcode: ['введено тривожний код', 'alarmcode ingegeven'], alarm: ['введено тривожний код', 'alarmcode ingegeven'],
  'door-beheer': ['вимкнув адміністратор', 'uitgezet door de beheerder'], ontkoppeld: ['відв’язано власником', 'ontkoppeld door de eigenaar'],
  'telefoon-gewijzigd': ['змінився номер телефону', 'telefoonnummer gewijzigd'], 'profiel-gewijzigd': ['змінилися дані профілю Telegram', 'Telegram-profiel gewijzigd'],
  'opnieuw-koppelen': ['потрібне повторне прив’язування', 'opnieuw koppelen vereist'], 'niet-bevestigd': ['зміну не підтверджено вчасно', 'wijziging niet op tijd bevestigd'],
  vervalsing: ['спроба підробки', 'poging tot vervalsing'], 'te-veel-pogingen': ['забагато невдалих спроб', 'te veel mislukte pogingen'],
  beheer: ['вимкнув адміністратор', 'uitgezet door de beheerder'], nee: ['відповідь «Ні»', 'antwoord «Nee»'],
};
const BRON: Record<string, Paar> = {
  kluis: ['у захищеному сховищі', 'in de beveiligde kluis'],
  'kluis-integratie': ['у захищеному сховищі (інтеграція Telegram)', 'in de beveiligde kluis (Telegram-integratie)'],
  omgeving: ['у змінній середовища сервера', 'in een omgevingsvariabele van de server'],
  geen: ['немає', 'geen'],
};
const RESULTAAT: Record<string, Paar> = {
  success: ['успішно', 'gelukt'], failed: ['помилка', 'mislukt'], denied: ['відмовлено', 'geweigerd'], partial: ['частково', 'gedeeltelijk'],
};
const INLOG_STAND: Record<string, Paar> = {
  ingewisseld: ['Увійшли', 'Aangemeld'],
  goedgekeurd: ['Підтверджено в Telegram', 'Bevestigd in Telegram'],
  geweigerd: ['Відхилено', 'Geweigerd'],
  verlopen: ['Час вийшов', 'Verlopen'],
  wacht: ['Очікує підтвердження', 'Wacht op bevestiging'],
};

export const statusNaam = (lang: Lang, c: string) => kies(lang, STATUS[c], ['Стан невідомий', 'Stand onbekend']);
export const koppelStandNaam = (lang: Lang, c: string) => kies(lang, KOPPELING[c], ['Невідомий стан', 'Onbekende stand']);
export const redenNaam = (lang: Lang, c: string) => (c ? kies(lang, REDEN[c], ['інша причина', 'andere reden']) : '');
export const bronNaam = (lang: Lang, c: string) => kies(lang, BRON[c], ['невідоме джерело', 'onbekende bron']);
export const resultaatNaam = (lang: Lang, c: string) => kies(lang, RESULTAAT[c], ['інший результат', 'ander resultaat']);
export const inlogStandNaam = (lang: Lang, c: string) => kies(lang, INLOG_STAND[c], ['Невідомий стан', 'Onbekende stand']);
