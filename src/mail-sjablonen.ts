// 10 сучасних шаблонів листа (1.7): один стиль (спокійні кольори, контраст ≥ 4.5:1, ширина для телефона), ті самі блоки редактора —
// шапка, виноска, кнопка, колонки, підвал, — тож у Gmail вони виглядають так само (таблиці з вбудованими стилями при надсиланні).
// Квадратні дужки [ ] — місця, які треба заповнити.
const kop = (bg: string, tekst: string) => `<header class="mail-pm-email-header" style="background:${bg}"><p style="text-align:center"><strong>${tekst}</strong></p></header>`;
const accent = (soort: string, bg: string, html: string) => `<div class="mail-pm-callout" data-kind="${soort}" style="background:${bg}">${html}</div>`;
const knop = (tekst: string, bg: string) => `<a data-mail-block="button" href="https://" style="background:${bg};color:#fff">${tekst}</a>`;
const voet = (tekst: string) => `<footer class="mail-pm-email-footer" style="background:#f8fafc"><p style="text-align:center">${tekst}</p></footer>`;
const kolommen = (items: Array<[string, string]>) => `<div class="mail-pm-columns" data-columns="${items.length}">${items.map(([k, t]) => `<div class="mail-pm-column"><h3>${k}</h3><p>${t}</p></div>`).join('')}</div>`;

export const MAIL_SJABLONEN: ReadonlyArray<readonly [string, string, string]> = [
  ['Діловий лист', 'Офіційне звернення з головною думкою й підписом',
    `<p>Шановний(а) [ім’я],</p><p>[Одне речення: навіщо цей лист.]</p>${accent('info', '#eef6ff', '<p><strong>Коротко:</strong> [головна думка або рішення].</p>')}<p>[Деталі, 2–3 речення.]</p><p>З повагою,<br>[Ваше ім’я]<br>[Посада · телефон]</p>`],
  ['Пропозиція співпраці', 'Що пропонуєте, вигода, наступний крок',
    `${kop('#eff6ff', '[Назва компанії]')}<h2>Пропозиція для [компанія отримувача]</h2><p>Добрий день, [ім’я]!</p><p>[Хто ви й чому пишете саме їм.]</p>${kolommen([['Що пропонуємо', '[суть]'], ['Ваша вигода', '[результат]'], ['Строки', '[коли]']])}${knop('Домовитися про дзвінок', '#1d4ed8')}<p>З повагою,<br>[Ваше ім’я]</p>`],
  ['Запрошення на зустріч', 'Дата, час, місце й кнопка підтвердження',
    `${kop('#f5f3ff', 'Запрошення')}<h2>[Назва зустрічі / події]</h2><p>Вітаю, [ім’я]! Запрошую вас на [що].</p>${accent('note', '#f8fafc', '<p><strong>Коли:</strong> [дата], [час]<br><strong>Де:</strong> [адреса або посилання]<br><strong>Тривалість:</strong> [хв]</p>')}${knop('Підтвердити участь', '#6d28d9')}<p>Якщо час не підходить — просто відпишіть, підберемо інший.</p>`],
  ['Нагадування про оплату', 'Рахунок, сума, строк — ввічливо й чітко',
    `<p>Добрий день, [ім’я]!</p><p>Нагадуємо про рахунок <strong>№ [номер]</strong>.</p>${accent('warning', '#fffbeb', '<p><strong>Сума:</strong> [сума] ·<strong> Строк:</strong> [дата]</p>')}${knop('Переглянути рахунок', '#b45309')}<p>Якщо оплату вже здійснено — дякуємо, просто проігноруйте цей лист.</p><p>З повагою,<br>[Ваше ім’я]</p>`],
  ['Підтвердження замовлення', 'Замовлення прийнято: що, коли, що далі',
    `${kop('#ecfdf5', '[Назва магазину]')}<h2>Дякуємо! Замовлення № [номер] прийнято</h2>${accent('success', '#ecfdf5', '<p>Ми отримали оплату й готуємо відправлення.</p>')}<ul><li>[Товар] — [кількість] × [ціна]</li><li>Доставка: [спосіб], орієнтовно [дата]</li><li>Разом: <strong>[сума]</strong></li></ul>${knop('Відстежити замовлення', '#15803d')}${voet('Питання? Просто відповідайте на цей лист.')}`],
  ['Звіт про проєкт', 'Зроблено · в роботі · далі, ризики',
    `<h2>[Проєкт]: стан на [дата]</h2>${kolommen([['Зроблено', '[1–3 пункти]'], ['В роботі', '[1–3 пункти]'], ['Далі', '[1–3 пункти]']])}${accent('warning', '#fffbeb', '<p><strong>Ризики / потрібне рішення:</strong> [що й від кого].</p>')}<p>Повний звіт: [посилання].</p>`],
  ['Розсилка / новини', 'Три новини з кнопкою «Детальніше»',
    `${kop('#eff6ff', '[Назва розсилки] · [місяць]')}<h2>Головне за [період]</h2><h3>1. [Новина]</h3><p>[Два речення.]</p><h3>2. [Новина]</h3><p>[Два речення.]</p><h3>3. [Новина]</h3><p>[Два речення.]</p>${knop('Читати повністю', '#1d4ed8')}${voet('Ви отримали цей лист, бо підписані на [назва]. Відписатися: [посилання].')}`],
  ['Вибачення / інцидент', 'Що сталося, що вже зроблено, компенсація',
    `<p>Шановний(а) [ім’я],</p><p>Перепрошуємо: [що сталося, одне речення].</p>${accent('error', '#fef2f2', '<p><strong>Що вже зроблено:</strong> [дії]. <strong>Як запобігаємо:</strong> [дії].</p>')}<p>[Компенсація або що отримає клієнт.]</p><p>Дякуємо за терпіння,<br>[Ваше ім’я]</p>`],
  ['Подяка', 'Тепла подяка за співпрацю чи допомогу',
    `${kop('#faf5ff', 'Дякуємо!')}<p>[Ім’я], щиро дякую за [що саме].</p><p>[Чим це допомогло — одне-два речення.]</p>${accent('success', '#ecfdf5', '<p>Буду радий(а) працювати разом і надалі.</p>')}<p>З найкращими побажаннями,<br>[Ваше ім’я]</p>`],
  ['Вітання зі святом', 'Святкове вітання з побажанням',
    `${kop('#fff7ed', 'З [назва свята]!')}<h2>[Ім’я], вітаю!</h2><p>[Побажання, два-три речення.]</p>${accent('note', '#fff7ed', '<p>[Коротке тепле побажання.]</p>')}<p>[Ваше ім’я]</p>`],
];

export const SJABLOON_CATEGORIEEN = [
  { id: 'zakelijk', uk: 'Ділові', nl: 'Zakelijk' },
  { id: 'afspraak', uk: 'Зустрічі', nl: 'Afspraken' },
  { id: 'betaling', uk: 'Оплата', nl: 'Betaling' },
  { id: 'nieuws', uk: 'Новини', nl: 'Nieuws' },
  { id: 'persoonlijk', uk: 'Особисті', nl: 'Persoonlijk' },
] as const;

export type SjabloonCategorie = (typeof SJABLOON_CATEGORIEEN)[number]['id'];

const CATEGORIE_VAN: SjabloonCategorie[] = ['zakelijk', 'zakelijk', 'afspraak', 'betaling', 'betaling', 'zakelijk', 'nieuws', 'persoonlijk', 'persoonlijk', 'persoonlijk'];

const NL: ReadonlyArray<readonly [string, string, string]> = [
  ['Zakelijke brief', 'Officieel bericht met kern en ondertekening',
    `<p>Geachte [naam],</p><p>[Eén zin: waarom deze brief.]</p>${accent('info', '#eef6ff', '<p><strong>Kort:</strong> [kern of besluit].</p>')}<p>[Details, 2–3 zinnen.]</p><p>Met vriendelijke groet,<br>[Uw naam]<br>[Functie · telefoon]</p>`],
  ['Samenwerkingsvoorstel', 'Wat u biedt, de winst, de volgende stap',
    `${kop('#eff6ff', '[Bedrijfsnaam]')}<h2>Voorstel voor [bedrijf van de ontvanger]</h2><p>Goedendag, [naam]!</p><p>[Wie u bent en waarom u juist hen schrijft.]</p>${kolommen([['Ons voorstel', '[kern]'], ['Uw voordeel', '[resultaat]'], ['Termijn', '[wanneer]']])}${knop('Belafspraak maken', '#1d4ed8')}<p>Met vriendelijke groet,<br>[Uw naam]</p>`],
  ['Uitnodiging', 'Datum, tijd, plaats en een bevestigingsknop',
    `${kop('#f5f3ff', 'Uitnodiging')}<h2>[Naam van de afspraak]</h2><p>Hallo [naam]! Ik nodig u uit voor [wat].</p>${accent('note', '#f8fafc', '<p><strong>Wanneer:</strong> [datum], [tijd]<br><strong>Waar:</strong> [adres of link]<br><strong>Duur:</strong> [min]</p>')}${knop('Deelname bevestigen', '#6d28d9')}<p>Past het niet? Antwoord gerust, dan zoeken we een ander moment.</p>`],
  ['Betalingsherinnering', 'Factuur, bedrag, termijn — beleefd en duidelijk',
    `<p>Goedendag, [naam]!</p><p>Een herinnering aan factuur <strong>nr. [nummer]</strong>.</p>${accent('warning', '#fffbeb', '<p><strong>Bedrag:</strong> [bedrag] · <strong>Uiterlijk:</strong> [datum]</p>')}${knop('Factuur bekijken', '#b45309')}<p>Al betaald? Dank, u kunt deze brief negeren.</p><p>Met vriendelijke groet,<br>[Uw naam]</p>`],
  ['Orderbevestiging', 'Bestelling ontvangen: wat, wanneer, wat daarna',
    `${kop('#ecfdf5', '[Winkelnaam]')}<h2>Bedankt! Bestelling nr. [nummer] is ontvangen</h2>${accent('success', '#ecfdf5', '<p>We hebben de betaling en maken de zending klaar.</p>')}<ul><li>[Artikel] — [aantal] × [prijs]</li><li>Levering: [wijze], ongeveer [datum]</li><li>Totaal: <strong>[bedrag]</strong></li></ul>${knop('Bestelling volgen', '#15803d')}${voet('Vragen? Antwoord gewoon op deze brief.')}`],
  ['Projectverslag', 'Klaar · bezig · hierna, risico’s',
    `<h2>[Project]: stand op [datum]</h2>${kolommen([['Klaar', '[1–3 punten]'], ['Bezig', '[1–3 punten]'], ['Hierna', '[1–3 punten]']])}${accent('warning', '#fffbeb', '<p><strong>Risico / besluit nodig:</strong> [wat en van wie].</p>')}<p>Volledig verslag: [link].</p>`],
  ['Nieuwsbrief', 'Drie berichten met een knop «Verder lezen»',
    `${kop('#eff6ff', '[Naam van de brief] · [maand]')}<h2>Het belangrijkste van [periode]</h2><h3>1. [Nieuws]</h3><p>[Twee zinnen.]</p><h3>2. [Nieuws]</h3><p>[Twee zinnen.]</p><h3>3. [Nieuws]</h3><p>[Twee zinnen.]</p>${knop('Verder lezen', '#1d4ed8')}${voet('U ontvangt deze brief omdat u bent geabonneerd op [naam]. Afmelden: [link].')}`],
  ['Excuses / incident', 'Wat er gebeurde, wat al gedaan is, compensatie',
    `<p>Geachte [naam],</p><p>Onze excuses: [wat er gebeurde, één zin].</p>${accent('error', '#fef2f2', '<p><strong>Al gedaan:</strong> [acties]. <strong>Voorkomen:</strong> [acties].</p>')}<p>[Compensatie of wat de klant krijgt.]</p><p>Dank voor uw geduld,<br>[Uw naam]</p>`],
  ['Dank', 'Warme dank voor samenwerking of hulp',
    `${kop('#faf5ff', 'Dank u!')}<p>[Naam], hartelijk dank voor [wat precies].</p><p>[Waarom dat hielp — een of twee zinnen.]</p>${accent('success', '#ecfdf5', '<p>Ik werk graag opnieuw met u samen.</p>')}<p>Met vriendelijke groet,<br>[Uw naam]</p>`],
  ['Feestdag', 'Feestelijke groet',
    `${kop('#fff7ed', 'Fijne [feestdag]!')}<h2>[Naam], van harte!</h2><p>[Wens, twee of drie zinnen.]</p>${accent('note', '#fff7ed', '<p>[Korte warme wens.]</p>')}<p>[Uw naam]</p>`],
];

export type SjabloonKaart = {
  id: string;
  categorie: SjabloonCategorie;
  naam: string;
  uitleg: string;
  html: string;
  voorbeeld: string;
};

export function sjabloonKaarten(lang: 'uk' | 'nl'): SjabloonKaart[] {
  return MAIL_SJABLONEN.map((rij, index) => {
    const nl = NL[index] || rij;
    const naam = lang === 'nl' ? nl[0] : rij[0];
    const uitleg = lang === 'nl' ? nl[1] : rij[1];
    const html = lang === 'nl' ? nl[2] : rij[2];
    const kleur = html.match(/background:\s*(#[0-9a-fA-F]{3,8})/i)?.[1] || '#e8eef5';
    return { id: `sjabloon-${index}`, categorie: CATEGORIE_VAN[index] || 'zakelijk', naam, uitleg, html, voorbeeld: kleur };
  });
}

export function sjabloonRijen(lang: 'uk' | 'nl'): Array<readonly [string, string, string]> {
  return sjabloonKaarten(lang).map((kaart) => [kaart.naam, kaart.uitleg, kaart.html] as const);
}

