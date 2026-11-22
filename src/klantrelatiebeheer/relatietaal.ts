import type { Verkoopkans } from '../../shared/klantrelatiebeheer';

export type Taal = 'uk' | 'nl';
export const tekst = (taal: Taal, uk: string, nl: string) => taal === 'uk' ? uk : nl;
export const land = (taal: Taal) => taal === 'uk' ? 'uk-UA' : 'nl-BE';
export const geld = (taal: Taal, centen: number) => new Intl.NumberFormat(land(taal), { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(centen / 100);
export const dag = (taal: Taal, waarde: number | string) => new Intl.DateTimeFormat(land(taal), { day: 'numeric', month: 'short', year: 'numeric' }).format(typeof waarde === 'string' ? new Date(waarde + 'T12:00:00') : waarde);
export function plaatselijkeDag(nu = new Date()): string {
  return [nu.getFullYear(), String(nu.getMonth() + 1).padStart(2, '0'), String(nu.getDate()).padStart(2, '0')].join('-');
}
export const faseNamen: Record<Verkoopkans['fase'], [string, string]> = {
  aanvraag: ['Звернення', 'Aanvraag'], gesprek: ['Переговори', 'Gesprek'], voorstel: ['Пропозиція', 'Voorstel'],
  gewonnen: ['Укладено', 'Gewonnen'], verloren: ['Відмовлено', 'Verloren'],
};
export const kanaalNamen: Record<string, [string, string]> = {
  post: ['Електронна пошта', 'E-mail'], telefoon: ['Телефон', 'Telefoon'], gesprek: ['Зустріч', 'Gesprek'],
  formulier: ['Форма', 'Formulier'], website: ['Сайт', 'Website'], whatsapp: ['WhatsApp', 'WhatsApp'],
  telegram: ['Telegram', 'Telegram'], instagram: ['Instagram', 'Instagram'], messenger: ['Messenger', 'Messenger'],
  linkedin: ['LinkedIn', 'LinkedIn'], sms: ['Коротке повідомлення', 'Sms'], notitie: ['Нотатка', 'Notitie'],
  ontwikkeling: ['Розробка', 'Ontwikkeling'], betaling: ['Оплата', 'Betaling'], agenda: ['Календар', 'Agenda'],
  bestand: ['Документ', 'Document'],
};
export const kanaalNaam = (taal: Taal, kanaal: string) => tekst(taal, ...(kanaalNamen[kanaal] ?? [kanaal, kanaal] as [string, string]));
export type Bewerking = 'wijzig' | 'wissen' | 'klant' | 'kans' | 'contact' | 'taak';
export const bewerkingNamen: Record<Bewerking, [string, string]> = {
  wijzig: ['Змінити дані', 'Gegevens wijzigen'], wissen: ['Видалити досьє', 'Dossier wissen'],
  klant: ['Новий клієнт', 'Nieuwe klant'], kans: ['Нова угода', 'Nieuwe verkoopkans'],
  contact: ['Записати взаємодію', 'Contact vastleggen'], taak: ['Нове завдання', 'Nieuwe taak'],
};
export const tabNamen: Record<string, [string, string]> = {
  overzicht: ['Робочий огляд', 'Werkoverzicht'], klanten: ['Клієнти', 'Klanten'],
  overeenkomsten: ['Угоди', 'Verkoopkansen'], taken: ['Завдання', 'Taken'], inzichten: ['Показники', 'Inzichten'],
  assistenten: ['Помічники', 'Assistenten'], koppelingen: ['Підключення', 'Koppelingen'],
};
