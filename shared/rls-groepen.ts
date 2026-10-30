// Namen en uitleg van de RLS-groepen (migratie 0033). De tabellen en de stand komen uit de database (app.rls_groepen).
import type { HelpLagen, Tekst } from './tech-rollen';

export const RLS_GROEP_NAAM: Record<string, Tekst> = {
  voorkeuren: ['Налаштування', 'Voorkeuren'],
  meldingen: ['Сповіщення', 'Meldingen'],
  mail: ['Пошта', 'E-mail'],
  werkruimtes: ['Робочі простори', 'Werkruimtes'],
  verbindingen: ['Підключення й сховище ключів', 'Koppelingen en kluis'],
  identiteit: ['Облікові записи', 'Accounts'],
};

export const HELP_RLS: HelpLagen = {
  wat: ['Ізоляція даних у базі: навіть якщо в коді сайту буде помилка, база сама не віддасть одному користувачу чужі записи.', 'Isolatie in de database: zelfs bij een fout in de code geeft de database geen gegevens van een ander account.'],
  gevolg: ['Вмикається по групах, від найменшого ризику. Поки група в режимі «аудит», база лише рахує, що б заборонила.', 'Per groep aan te zetten, van laag naar hoog risico. In «audit» telt de database alleen wat ze zou weigeren.'],
  risico: ['Якщо ввімкнути групу, де ще є порушення, частина сайту перестане бачити свої ж дані. Тому спершу — нуль порушень.', 'Een groep aanzetten met nog overtredingen breekt een deel van de site. Daarom eerst nul overtredingen.'],
  dev: ['PostgreSQL Row-Level Security для ролі mijnruimte_app (системна роль — BYPASSRLS). Політики app.records із 0007 + app.rls_afgedwongen() (0033): таблиці груп «aan». Лічильник — app.rls_audit (route/tbl/actie). Перемикає лише root через db-rollen-instellen.sh rls-groep: у системної ролі (тобто сайту) немає права запису в app.rls_groepen — вкрадена сесія адміністратора не вимкне ізоляцію. Альтернативи: усе одразу (rls-aan) — ризик зламати сервіс; перевірки лише в коді — одна забута умова = витік.', 'PostgreSQL RLS voor mijnruimte_app (systeemrol: BYPASSRLS). Policy\'s van 0007 + app.rls_afgedwongen() (0033). Teller: app.rls_audit. Schakelen alleen root via rls-groep: de systeemrol (= de site) mag app.rls_groepen niet schrijven — een gestolen beheerderssessie zet de isolatie niet uit. Alternatieven: alles tegelijk (rls-aan) — risico; alleen controles in code — één vergeten voorwaarde = lek.'],
};
