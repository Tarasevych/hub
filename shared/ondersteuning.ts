// Uitleg «?» voor «Підтримка від імені» (backend/ondersteuning.ts).
import type { HelpLagen } from './tech-rollen';

export const HELP_TOESTEMMING: HelpLagen = {
  wat: ['Підтримка просить подивитися огляд вашого облікового запису, щоб допомогти з проблемою.', 'Ondersteuning vraagt het overzicht van uw account te bekijken om te helpen.'],
  gevolg: ['Побачить лише: стан облікового запису, налаштування показу, пристрої, підключення ШІ, ваші звіти перевірки й останні дії (назви, без деталей). Нічого не може змінити. Кожен перегляд — у вашому журналі.', 'Ziet alleen: status, weergave, apparaten, AI-verbindingen, uw controleverslagen en recente acties (namen). Kan niets wijzigen. Elke weergave staat in uw logboek.'],
  risico: ['Не дозволяйте, якщо не просили про допомогу або не знаєте, хто це.', 'Sta het niet toe als u geen hulp vroeg of de persoon niet kent.'],
  dev: ['Підтримка НЕ отримує вашу сесію: сервер віддає фіксований огляд метаданих лише за дозволом зі статусом «goedgekeurd», до eind_op (≤ 30 хв), тій самій особі й тій самій вкладці (хеш tabContext). Дозвіл — із повторним підтвердженням входу. Альтернатива «увійти як» (повна сесія користувача) відкладена: змінює ядро перевірки сесій і дає ширший доступ, ніж потрібно для більшості звернень.', 'Ondersteuning krijgt GEEN sessie: de server geeft een vast overzicht van metadata alleen bij status «goedgekeurd», tot eind_op (≤ 30 min), aan dezelfde persoon en hetzelfde tabblad. Toestaan met verse aanmelding. «Inloggen als» uitgesteld: raakt de kern van de sessiecontrole en geeft meer toegang dan nodig.'],
};

export const HELP_ONDERSTEUNING: HelpLagen = {
  wat: ['Запит до користувача на перегляд огляду його облікового запису (лише читання, до 30 хв).', 'Verzoek aan een gebruiker om het overzicht van zijn account te bekijken (alleen lezen, tot 30 min).'],
  gevolg: ['Користувач бачить вашу пошту й причину, вирішує сам; поки триває доступ, у нього червона смуга з кнопкою «Завершити».', 'De gebruiker ziet uw e-mail en reden en beslist zelf; tijdens de toegang heeft hij een rode band met «Beëindigen».'],
  risico: ['Термінова підтримка без згоди — лише власник сервера, з негайним сповіщенням користувача і записом у журналі.', 'Noodtoegang zonder toestemming — alleen de eigenaar, met directe melding en logboek.'],
  dev: ['Таблиця app.ondersteuning_verzoeken (0035): wacht → goedgekeurd/geweigerd → beeindigd/verlopen; відповідь — 15 хв; CHECK eind_op ≤ besloten + 30 хв у базі. Журнал owner.ondersteuning.* у ланцюжку обох сторін; «bekeken» — у журналі користувача на кожен перегляд.', 'Tabel app.ondersteuning_verzoeken (0035); antwoord 15 min; CHECK eind_op ≤ besloten + 30 min. Logboek owner.ondersteuning.* bij beide; «bekeken» bij elke weergave in het logboek van de gebruiker.'],
};
