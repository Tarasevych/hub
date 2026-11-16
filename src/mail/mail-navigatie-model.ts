// MAILANKER-001 (15.11.2026): одна модель лівого меню пошти для двох місць — бічного меню (MailZijbalkNavigatie.tsx)
// і меню якорів сторінки (GoogleMailWerkruimte.tsx, «Макет»). Тут лише склад, порядок, видимість і лічильники:
// що людина змінила через «Редагувати меню» (navigationItems), те однаково видно в обох меню.
// Eén model van het linkermenu van E-mail voor het zijmenu én het ankermenu van de pagina: samenstelling, volgorde,
// zichtbaarheid en tellers. Wat u via «Menu bewerken» wijzigt, ziet u in beide menu's.
import { gezienStaat } from '../mail-gezien';

export type MailNavZone = 'primary' | 'more' | 'labels';
export type MailNavId =
  | 'inbox' | 'unread' | 'starred' | 'snoozed' | 'sent' | 'drafts' | 'all' | 'contacts'
  | 'important' | 'spam' | 'trash' | 'scheduled' | 'subscriptions' | 'archive' | 'accounts';

export interface MailNavDefinitie { id: MailNavId; uk: string; nl: string; zone: MailNavZone; order: number }

/** Вбудовані пункти лівого меню пошти в типовому порядку. / Ingebouwde menu-items in de standaardvolgorde. */
export const MAIL_NAV_DEFINITIES: ReadonlyArray<MailNavDefinitie> = [
  { id: 'inbox', uk: 'Вхідні', nl: 'Postvak IN', zone: 'primary', order: 10 },
  { id: 'unread', uk: 'Непрочитані', nl: 'Ongelezen', zone: 'primary', order: 20 },
  { id: 'starred', uk: 'Із зірочкою', nl: 'Met ster', zone: 'primary', order: 30 },
  { id: 'snoozed', uk: 'Відкладені', nl: 'Uitgesteld', zone: 'primary', order: 40 },
  { id: 'sent', uk: 'Надіслані', nl: 'Verzonden', zone: 'primary', order: 50 },
  { id: 'drafts', uk: 'Чернетки', nl: 'Concepten', zone: 'primary', order: 60 },
  { id: 'all', uk: 'Уся пошта', nl: 'Alle e-mail', zone: 'primary', order: 70 },
  { id: 'contacts', uk: 'Контакти й відправники', nl: 'Contacten en afzenders', zone: 'primary', order: 75 },
  { id: 'important', uk: 'Важливі', nl: 'Belangrijk', zone: 'more', order: 10 },
  { id: 'spam', uk: 'Спам', nl: 'Spam', zone: 'more', order: 20 },
  { id: 'trash', uk: 'Кошик', nl: 'Prullenbak', zone: 'more', order: 30 },
  { id: 'scheduled', uk: 'Заплановано', nl: 'Gepland', zone: 'more', order: 40 },
  { id: 'subscriptions', uk: 'Керування підписками', nl: 'Abonnementen beheren', zone: 'more', order: 50 },
  { id: 'archive', uk: 'Архів', nl: 'Archief', zone: 'more', order: 60 },
  { id: 'accounts', uk: 'Акаунти', nl: 'Accounts', zone: 'more', order: 70 },
];

/** Яка системна мітка Gmail дає лічильник непрочитаних для пункту меню. / Welk Gmail-systeemlabel de teller levert. */
export const MAIL_NAV_PROVIDER_LABEL: Readonly<Record<string, string>> = {
  inbox: 'INBOX', unread: 'INBOX', starred: 'STARRED', snoozed: 'SNOOZED', sent: 'SENT', drafts: 'DRAFT', all: 'ALL',
  important: 'IMPORTANT', spam: 'SPAM', trash: 'TRASH', scheduled: 'SCHEDULED',
};

export interface MailNavLabel {
  id: string; name: string; type: 'system' | 'user'; messagesUnread: number;
  labelListVisibility?: string; color?: { textColor?: string; backgroundColor?: string };
}
export interface MailNavVoorkeur { key: string; visible: boolean; zone: MailNavZone; order: number }
export interface MailNavBezoek { key: string; activityAt?: number; seenUnread?: number }

export interface MailNavPunt {
  key: string;
  soort: 'builtin' | 'label';
  /** id вкладки для вбудованого пункту або id мітки Gmail. / tab-id of Gmail-label-id. */
  id: string;
  naam: string;
  zone: MailNavZone;
  order: number;
  zichtbaar: boolean;
  /** Непрочитані, які людина ще не бачила (як у бічному меню). / Ongelezen die nog niet gezien zijn. */
  teller: number;
  uitgeschakeld: boolean;
  kleur?: { textColor?: string; backgroundColor?: string };
}

export interface MailNavModel { primair: MailNavPunt[]; meer: MailNavPunt[]; labels: MailNavPunt[] }

export interface MailNavInvoer {
  lang: 'uk' | 'nl';
  accountId: string;
  activeTab: string;
  labels: ReadonlyArray<MailNavLabel>;
  navigationItems: ReadonlyArray<MailNavVoorkeur>;
  navigationVisits: ReadonlyArray<MailNavBezoek>;
  navigationUpdatesFirst?: boolean;
  /** Вибрана мітка, коли відкрита вкладка «labels». / Gekozen label bij tab «labels». */
  gekozenLabel?: string;
}

/**
 * Будує той самий склад, що й бічне меню: вбудовані пункти й мітки користувача, з урахуванням «Редагувати меню»
 * (зона, порядок, видимість) і «пам'яті стану» лічильників. Чиста функція — її перевіряє тест без браузера.
 */
export function bouwMailNavigatie(invoer: MailNavInvoer): MailNavModel {
  const uk = invoer.lang === 'uk';
  const layout = new Map(invoer.navigationItems.map((item) => [item.key, item]));
  const bezoek = new Map(invoer.navigationVisits.map((item) => [item.key, item]));
  const gezien = (key: string, n: number) => gezienStaat(bezoek.get(key)?.seenUnread, n);
  const labelById = new Map(invoer.labels.map((label) => [label.id, label]));
  const unreadZichtbaar = (() => {
    const eigen = layout.get('nav:unread');
    return eigen ? eigen.visible : true;
  })();

  const builtin: MailNavPunt[] = MAIL_NAV_DEFINITIES.map((def) => {
    const key = `nav:${def.id}`;
    const eigen = layout.get(key);
    const providerId = MAIL_NAV_PROVIDER_LABEL[def.id] || '';
    const provider = providerId ? labelById.get(providerId) : undefined;
    const ongelezen = provider ? Math.max(0, Number(provider.messagesUnread || 0)) : 0;
    // Як у бічному меню: у «Вхідних» лічильника немає, коли окремо показано «Непрочитані»; у відкритій теці — теж.
    const verborgen = (def.id === 'inbox' && unreadZichtbaar) || invoer.activeTab === def.id || !gezien(key, ongelezen).toon;
    return {
      key, soort: 'builtin', id: def.id, naam: uk ? def.uk : def.nl,
      zone: eigen?.zone || def.zone, order: eigen?.order ?? def.order, zichtbaar: eigen ? eigen.visible : true,
      teller: verborgen ? 0 : ongelezen,
      uitgeschakeld: def.id === 'scheduled' && !labelById.has('SCHEDULED'),
    };
  });

  const userLabels = invoer.labels.filter((label) => label.type === 'user');
  const labelPunten: MailNavPunt[] = userLabels.map((label, index) => {
    const key = `label:${invoer.accountId}:${label.id}`;
    const eigen = layout.get(key);
    const ongelezen = Math.max(0, Number(label.messagesUnread || 0));
    const standaardZichtbaar = label.labelListVisibility !== 'labelHide'
      && (label.labelListVisibility !== 'labelShowIfUnread' || ongelezen > 0);
    const actief = invoer.activeTab === 'labels' && invoer.gekozenLabel === label.id;
    return {
      key, soort: 'label', id: label.id, naam: label.name,
      zone: eigen?.zone || 'labels', order: eigen?.order ?? (index + 1) * 10, zichtbaar: eigen ? eigen.visible : standaardZichtbaar,
      teller: actief || !gezien(key, ongelezen).toon ? 0 : ongelezen,
      uitgeschakeld: false, kleur: label.color,
    };
  });

  const sorteer = (rijen: MailNavPunt[]) => [...rijen].sort((a, b) =>
    (invoer.navigationUpdatesFirst ? (bezoek.get(b.key)?.activityAt || 0) - (bezoek.get(a.key)?.activityAt || 0) : 0)
    || a.order - b.order
    || a.naam.localeCompare(b.naam));
  const alle = [...builtin, ...labelPunten].filter((punt) => punt.zichtbaar);
  return {
    primair: sorteer(alle.filter((punt) => punt.zone === 'primary')),
    meer: sorteer(alle.filter((punt) => punt.zone === 'more')),
    labels: sorteer(alle.filter((punt) => punt.zone === 'labels')),
  };
}

/** Подія для діалогів меню пошти, викликаних із меню якорів. / Event voor menudialogen vanuit het ankermenu. */
export const MAIL_NAVIGATIE_ACTIE = 'tsv:mail-navigatie-actie';
export type MailNavigatieActie = 'menu-bewerken' | 'labels-beheren' | 'label-maken';
