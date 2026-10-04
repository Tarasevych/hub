// Publieke juridische pagina's (Google OAuth-merkverificatie): GET /privacy en GET /terms.
// Echte HTML zonder JavaScript en zonder aanmelding, zodat een crawler/beoordelaar de tekst ziet. Exact pad
// (geen prefix), opgenomen in PUBLIEKE_ROUTES. server/start.ts stuurt alleen deze twee paden naar de router en
// zet de gewone app-CSP; geen noindex (Google moet ze kunnen lezen; robots.txt staat alleen deze twee toe).
// Talen: Oekraïens eerst, daarna Nederlands, op één pagina met ankers (#uk, #nl).
// Inhoud afgeleid van de code (zie SECURITY-NOTES.md, backend/privacy.ts, google-suite-onboarding.ts,
// mail-platform.ts, server/platform/ai.ts, deploy/backup-maken.sh, deploy/cloud/cloud-reservekopie.ps1).
// Bij wijzigingen in gegevensverwerking: deze tekst en BIJGEWERKT aanpassen.
import type { RouterResponse, RouterRoutes } from '../server/platform/router';

export const BIJGEWERKT = '2026-10-04';
export const CONTACT = 'tarasevych.pavlo@gmail.com';
const GOOGLE_BELEID = 'https://developers.google.com/terms/api-services-user-data-policy';
const GBA = 'https://www.gegevensbeschermingsautoriteit.be';

const pagina = (titel: string, ander: { pad: string; uk: string; nl: string }, uk: string, nl: string): string => `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titel}</title>
<link rel="stylesheet" href="/juridisch.css">
</head>
<body>
<header class="kop">
<nav aria-label="Навігація / Navigatie">
<a href="/">Мій простір · Mijn Ruimte</a>
<span class="talen"><a href="#uk" hreflang="uk">Українська</a> · <a href="#nl" hreflang="nl">Nederlands</a></span>
<span class="pagina"><a href="${ander.pad}">${ander.uk}</a> · <a href="${ander.pad}#nl">${ander.nl}</a></span>
</nav>
</header>
<main>
<section id="uk" lang="uk">
${uk}
</section>
<hr>
<section id="nl" lang="nl">
${nl}
</section>
</main>
<footer class="voet">
<p><a href="/">Головна / Start</a> · <a href="/privacy">Політика конфіденційності / Privacybeleid</a> · <a href="/terms">Умови користування / Gebruiksvoorwaarden</a></p>
<p>Павло Тарасевич / Pavlo Tarasevych · <a href="mailto:${CONTACT}">${CONTACT}</a> · ${BIJGEWERKT}</p>
</footer>
</body>
</html>
`;

const PRIVACY_UK = `
<h1>Політика конфіденційності</h1>
<p class="datum">Чинна з ${BIJGEWERKT}. Українська версія · <a href="#nl">Nederlandse versie</a></p>

<h2>1. Хто відповідає за ваші дані</h2>
<p>«Мій простір» (hub.tarasevych.com та піддомени tarasevych.com) — приватний особистий онлайн-сервіс. Розпорядник (контролер) даних: <strong>Павло Тарасевич</strong>, Бельгія. Контакт з усіх питань щодо даних: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
<p>Сервіс не є публічним: обліковий запис можна створити лише через вхід Google, після чого власник вручну схвалює доступ (або ви приєднуєтеся за запрошенням до спільного робочого простору). Сервіс безкоштовний, без реклами, не призначений для дітей до 16 років.</p>

<h2>2. Вхід через Google: які дані і навіщо</h2>
<p>Для входу ми використовуємо Google OAuth/OpenID Connect лише з дозволами <code>openid</code>, <code>email</code> і <code>profile</code>. Ми отримуємо і зберігаємо:</p>
<ul>
<li><strong>ідентифікатор облікового запису Google</strong> (<code>sub</code>) — щоб упізнавати вас при наступних входах;</li>
<li><strong>адресу електронної пошти</strong> (лише підтверджену Google) — для облікового запису, схвалення доступу, запрошень і повідомлень у сервісі;</li>
<li><strong>ім'я та фото профілю</strong> — щоб показувати їх у вашому обліковому записі та у спільних просторах (фото можна замінити своїм);</li>
<li><strong>час останньої автентифікації</strong> (<code>auth_time</code>) — лише щоб перевірити, що ви щойно повторно ввійшли перед чутливою дією (повторне підтвердження), та як частину журналу безпеки.</li>
</ul>
<p>Вхід не надає нам доступу до вашої пошти, файлів чи інших даних Google; для входу ми не запитуємо офлайн-доступ.</p>

<h2>3. Підключені сервіси (лише якщо ви самі їх підключите)</h2>
<p>У сервісі можна окремо, за вашою явною згодою на екрані Google, підключити:</p>
<ul>
<li><strong>Gmail</strong>: <code>gmail.readonly</code>, <code>gmail.modify</code>, <code>gmail.send</code>, <code>gmail.labels</code> — щоб показувати ваші листи, мітки та вкладення, позначати/архівувати/переміщати листи, керувати мітками і надсилати листи, які ви самі пишете в сервісі;</li>
<li><strong>Google Drive</strong>: <code>drive</code> — щоб переглядати ваші файли й папки та зберігати в Drive вибрані вами файли (наприклад, вкладення з пошти);</li>
<li><strong>Google Calendar</strong>: <code>calendar.readonly</code> — лише читання подій для показу у сервісі;</li>
<li><strong>Google Photos</strong>: <code>photospicker.mediaitems.readonly</code> — лише фото, які ви самі вибираєте у вікні вибору Google;</li>
<li>якщо увімкнено: <strong>Microsoft Outlook</strong> (Microsoft Graph <code>Mail.Read</code>, <code>Mail.ReadWrite</code>, <code>Mail.Send</code>) з тією самою метою, що й Gmail.</li>
</ul>
<p>Токени доступу зберігаються на сервері лише в зашифрованому вигляді (AES-256-GCM). Для роботи інтерфейсу на сервері можуть зберігатися копії або метадані (наприклад, заголовки, мітки, стан прочитання, структура папок, події календаря). Ви можете будь-коли від'єднати сервіс у налаштуваннях або відкликати доступ на <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>

<h2>4. Політика Google щодо даних користувачів API (Limited Use)</h2>
<p>Використання та передача будь-якої інформації, отриманої від API Google, до будь-якого іншого застосунку відповідає <a href="${GOOGLE_BELEID}">Google API Services User Data Policy</a>, зокрема вимогам обмеженого використання (Limited Use). Конкретно:</p>
<ul>
<li>дані Google використовуються лише для того, щоб надавати вам функції, які ви бачите й використовуєте в сервісі;</li>
<li>ми <strong>не продаємо</strong> їх і <strong>не передаємо</strong> третім особам (крім технічних обробників із розділу 6, без яких сервіс не працює, або якщо цього вимагає закон);</li>
<li>ми <strong>не використовуємо</strong> їх для реклами, ретаргетингу, профілювання чи оцінки кредитоспроможності;</li>
<li>ніхто не читає ваші дані Google, крім вас, — за винятком вашої явної згоди для конкретного повідомлення, потреб безпеки (розслідування зловживань) або вимог закону;</li>
<li>дані Google <strong>не передаються жодним моделям штучного інтелекту</strong> і не використовуються для навчання чи вдосконалення моделей ШІ. Функції ШІ в сервісі зараз вимкнені; якщо це зміниться, ми спершу оновимо цю політику.</li>
</ul>

<h2>5. Інші дані, які ми обробляємо</h2>
<ul>
<li><strong>Вміст, який ви створюєте</strong>: робочі простори, блоки, нотатки, налаштування, завантажені файли, учасники спільних просторів.</li>
<li><strong>Сесії та пристрої</strong>: IP-адреса, опис браузера/пристрою і приблизне місце (місто/країна з заголовків Cloudflare) зберігаються разом із вашими сесіями, щоб ви бачили активні сесії й могли їх завершити. IP-адреси також короткочасно використовуються для обмеження кількості спроб входу (видаляються через добу).</li>
<li><strong>Журнал безпеки (аудит)</strong>: важливі дії з обліковим записом (вхід, зміна способів входу, адміністративні дії) з часом, ідентифікатором облікового запису і хешем IP-адреси з секретним ключем (не сама IP-адреса).</li>
<li><strong>Додаткові способи входу</strong>, якщо ви їх налаштуєте: TOTP-код (секрет зашифрований), коди відновлення та пароль (лише хеші), номер телефону (лише збережений, SMS не надсилаються).</li>
<li><strong>Технічні журнали сервера</strong>: метод, хост, шлях (без параметрів запиту), код відповіді і тривалість — без IP-адрес.</li>
</ul>

<h2>6. Де зберігаються дані і хто їх обробляє</h2>
<ul>
<li>Дані зберігаються на власному сервері, яким керує розпорядник (не у сторонньому хмарному хостингу застосунку).</li>
<li><strong>Cloudflare</strong> (Cloudflare, Inc.) забезпечує захищене з'єднання (TLS) і тунель до сервера; через нього проходить увесь трафік. Cloudflare діє як обробник для передачі даних і може обробляти їх за межами ЄЕЗ згідно з власними умовами обробки даних.</li>
<li><strong>Google</strong> і, якщо підключено, <strong>Microsoft</strong> — як постачальники входу та підключених сервісів.</li>
<li><strong>Резервні копії</strong>: щодня, зашифровані (age, публічний ключ; сервер не може їх розшифрувати). Зберігаються 7 днів на сервері, а також на комп'ютері розпорядника та в його власному Google Drive (лише зашифровані файли): до 30 щоденних і по одній на місяць до 12 місяців.</li>
</ul>

<h2>7. Підстави обробки (GDPR)</h2>
<ul>
<li>надання сервісу, який ви запросили (ст. 6(1)(b));</li>
<li>ваша згода — для підключення сервісів Google/Microsoft і для анонімної аналітики (ст. 6(1)(a)); згоду можна відкликати будь-коли;</li>
<li>законний інтерес — безпека, запобігання зловживанням, журнал безпеки, резервні копії (ст. 6(1)(f)).</li>
</ul>

<h2>8. Строки зберігання</h2>
<ul>
<li>Сесія: до 30 днів, завершується після 7 днів неактивності або при виході; транзакція входу — близько 15 хвилин; повторне підтвердження діє 5 хвилин.</li>
<li>Від'єднаний спосіб входу можна відновити протягом 7 днів.</li>
<li>Видалений обліковий запис можна відновити протягом <strong>30 днів</strong>; після цього обліковий запис, його вміст, ідентичності й файли підлягають остаточному видаленню (виконує розпорядник; на запит — одразу після цього строку). У зашифрованих резервних копіях дані можуть залишатися до завершення строку їх зберігання (до 12 місяців).</li>
<li>Журнал безпеки зберігається, поки він потрібен для безпеки; записи можуть містити адресу електронної пошти чи ідентифікатори і видаляються лише вручну адміністратором.</li>
<li>Після від'єднання підключеного сервісу ми більше не звертаємося до нього, а доступ відкликається; збережені копії та метадані видаляються разом з обліковим записом або раніше — на ваш запит.</li>
</ul>

<h2>9. Аналітика</h2>
<p>Аналітика за замовчуванням <strong>вимкнена</strong>. Лише якщо ви її самі ввімкнете, ми рахуємо анонімні щоденні лічильники подій (без ідентифікатора облікового запису, IP-адреси чи пристрою). Сторонніх систем аналітики чи реклами немає.</p>

<h2>10. Файли cookie та локальне сховище</h2>
<p>Ми використовуємо лише функціональні cookie, без яких вхід не працює: cookie сесії (HttpOnly, Secure), прив'язку транзакції входу (близько 15 хвилин), cookie вкладки/сервісу та, якщо ви обираєте «запам'ятати», запам'ятований браузер. Локальне сховище браузера містить налаштування інтерфейсу (мова, тема, меню) і кеш для швидшого відображення. Сторонніх cookie немає.</p>

<h2>11. Безпека</h2>
<p>HTTPS/HSTS, сувора політика безпеки вмісту (CSP), захист від CSRF, обмеження кількості спроб, шифрування токенів і секретів, окремі ролі бази даних із захистом на рівні рядків, незмінний журнал безпеки з ланцюжком хешів, повторне підтвердження (Google або TOTP) для чутливих дій, необов'язкова двофакторна автентифікація, зашифровані резервні копії.</p>

<h2>12. Ваші права</h2>
<p>Ви маєте право на доступ до даних і їх копію (в сервісі є експорт ваших даних у JSON), виправлення (фото профілю можна змінити в сервісі, ім'я та e-mail надходять від Google; інше — на запит), видалення (видалення облікового запису в сервісі або на запит), обмеження обробки, заперечення проти обробки, перенесення даних і відкликання згоди. Напишіть на <a href="mailto:${CONTACT}">${CONTACT}</a> — відповідь протягом одного місяця.</p>
<p>Ви також можете подати скаргу до органу захисту даних. У Бельгії це <a href="${GBA}">Gegevensbeschermingsautoriteit / Autorité de protection des données (GBA/APD)</a>, або орган країни, де ви живете.</p>

<h2>13. Зміни</h2>
<p>Про суттєві зміни ми повідомимо в сервісі. Дата останньої редакції: ${BIJGEWERKT}.</p>
`;

const PRIVACY_NL = `
<h1>Privacybeleid</h1>
<p class="datum">Geldig vanaf ${BIJGEWERKT}. Nederlandse versie · <a href="#uk">Українська версія</a></p>

<h2>1. Wie is verantwoordelijk</h2>
<p>‘Mijn Ruimte’ (hub.tarasevych.com en subdomeinen van tarasevych.com) is een privé, persoonlijke onlinedienst. Verwerkingsverantwoordelijke: <strong>Pavlo Tarasevych</strong>, België. Contact voor alle vragen over gegevens: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
<p>De dienst is niet openbaar: een account ontstaat alleen via aanmelden met Google, waarna de eigenaar de toegang handmatig goedkeurt (of u sluit aan via een uitnodiging voor een gedeelde werkruimte). De dienst is gratis, zonder advertenties en niet bedoeld voor kinderen jonger dan 16 jaar.</p>

<h2>2. Aanmelden met Google: welke gegevens en waarom</h2>
<p>Voor het aanmelden gebruiken we Google OAuth/OpenID Connect met alleen de rechten <code>openid</code>, <code>email</code> en <code>profile</code>. We ontvangen en bewaren:</p>
<ul>
<li>de <strong>Google-account-id</strong> (<code>sub</code>) — om u bij een volgende aanmelding te herkennen;</li>
<li>het <strong>e-mailadres</strong> (alleen als Google het heeft bevestigd) — voor uw account, de goedkeuring van toegang, uitnodigingen en meldingen in de dienst;</li>
<li><strong>naam en profielfoto</strong> — om ze in uw account en in gedeelde werkruimtes te tonen (de foto kunt u vervangen);</li>
<li>het <strong>tijdstip van de laatste authenticatie</strong> (<code>auth_time</code>) — alleen om te controleren dat u zich net opnieuw hebt aangemeld vóór een gevoelige actie (herbevestiging), en als onderdeel van het beveiligingslogboek.</li>
</ul>
<p>Aanmelden geeft ons geen toegang tot uw mail, bestanden of andere Google-gegevens; voor het aanmelden vragen we geen offline toegang.</p>

<h2>3. Gekoppelde diensten (alleen als u ze zelf koppelt)</h2>
<p>U kunt in de dienst apart, met uw uitdrukkelijke toestemming op het Google-scherm, koppelen:</p>
<ul>
<li><strong>Gmail</strong>: <code>gmail.readonly</code>, <code>gmail.modify</code>, <code>gmail.send</code>, <code>gmail.labels</code> — om uw berichten, labels en bijlagen te tonen, berichten te markeren/archiveren/verplaatsen, labels te beheren en berichten te versturen die u zelf in de dienst schrijft;</li>
<li><strong>Google Drive</strong>: <code>drive</code> — om uw bestanden en mappen te bekijken en door u gekozen bestanden (bijvoorbeeld mailbijlagen) in Drive op te slaan;</li>
<li><strong>Google Agenda</strong>: <code>calendar.readonly</code> — alleen afspraken lezen om ze in de dienst te tonen;</li>
<li><strong>Google Foto's</strong>: <code>photospicker.mediaitems.readonly</code> — alleen foto's die u zelf in het keuzevenster van Google selecteert;</li>
<li>indien ingeschakeld: <strong>Microsoft Outlook</strong> (Microsoft Graph <code>Mail.Read</code>, <code>Mail.ReadWrite</code>, <code>Mail.Send</code>) met hetzelfde doel als Gmail.</li>
</ul>
<p>Toegangstokens worden op de server alleen versleuteld bewaard (AES-256-GCM). Voor de werking van de interface kunnen kopieën of metadata op de server staan (bijvoorbeeld kopteksten, labels, gelezen-status, mapstructuur, agenda-afspraken). U kunt een dienst altijd ontkoppelen in de instellingen of de toegang intrekken via <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>

<h2>4. Beleid van Google voor API-gebruikersgegevens (Limited Use)</h2>
<p>Het gebruik en de overdracht naar een andere app van informatie die van Google-API's is ontvangen, voldoet aan de <a href="${GOOGLE_BELEID}">Google API Services User Data Policy</a>, inclusief de vereisten voor beperkt gebruik (Limited Use). Concreet:</p>
<ul>
<li>Google-gegevens worden alleen gebruikt om u de functies te bieden die u in de dienst ziet en gebruikt;</li>
<li>we <strong>verkopen</strong> ze niet en <strong>delen</strong> ze niet met derden (behalve de technische verwerkers uit punt 6 waarzonder de dienst niet werkt, of als de wet dat vereist);</li>
<li>we gebruiken ze <strong>niet</strong> voor advertenties, retargeting, profilering of kredietwaardigheid;</li>
<li>niemand leest uw Google-gegevens behalve uzelf — tenzij u daar voor een specifiek bericht uitdrukkelijk toestemming voor geeft, voor beveiliging (onderzoek naar misbruik) of als de wet het vereist;</li>
<li>Google-gegevens worden <strong>aan geen enkel AI-model doorgegeven</strong> en niet gebruikt om AI-modellen te trainen of te verbeteren. AI-functies staan in de dienst momenteel uit; verandert dat, dan passen we eerst dit beleid aan.</li>
</ul>

<h2>5. Andere gegevens die we verwerken</h2>
<ul>
<li><strong>Inhoud die u maakt</strong>: werkruimtes, blokken, notities, instellingen, geüploade bestanden, leden van gedeelde werkruimtes.</li>
<li><strong>Sessies en apparaten</strong>: IP-adres, browser-/apparaatbeschrijving en een globale locatie (stad/land uit de Cloudflare-headers) worden bij uw sessies bewaard, zodat u actieve sessies kunt zien en beëindigen. IP-adressen worden ook kort gebruikt om aanmeldpogingen te beperken (na een dag verwijderd).</li>
<li><strong>Beveiligingslogboek (audit)</strong>: belangrijke accountacties (aanmelden, aanmeldmethoden wijzigen, beheeracties) met tijd, account-id en een met een geheime sleutel gehashte IP-waarde (niet het IP-adres zelf).</li>
<li><strong>Extra aanmeldmethoden</strong>, als u ze instelt: TOTP (geheim versleuteld), herstelcodes en wachtwoord (alleen hashes), telefoonnummer (alleen bewaard; er worden geen sms'en verstuurd).</li>
<li><strong>Technische serverlogboeken</strong>: methode, host, pad (zonder queryparameters), statuscode en duur — zonder IP-adressen.</li>
</ul>

<h2>6. Waar de gegevens staan en wie ze verwerkt</h2>
<ul>
<li>De gegevens staan op een eigen server die de verantwoordelijke zelf beheert (geen externe cloudhosting van de app).</li>
<li><strong>Cloudflare</strong> (Cloudflare, Inc.) verzorgt de beveiligde verbinding (TLS) en de tunnel naar de server; al het verkeer loopt erdoor. Cloudflare treedt op als verwerker voor het transport en kan gegevens buiten de EER verwerken volgens de eigen verwerkersvoorwaarden van Cloudflare.</li>
<li><strong>Google</strong> en, indien gekoppeld, <strong>Microsoft</strong> — als aanbieders van het aanmelden en van gekoppelde diensten.</li>
<li><strong>Back-ups</strong>: dagelijks, versleuteld (age, publieke sleutel; de server kan ze zelf niet ontsleutelen). Ze staan 7 dagen op de server en daarnaast op de computer van de verantwoordelijke en in diens eigen Google Drive (alleen versleutelde bestanden): tot 30 dagelijkse en één per maand tot 12 maanden.</li>
</ul>

<h2>7. Rechtsgronden (AVG)</h2>
<ul>
<li>het leveren van de dienst die u hebt gevraagd (art. 6, lid 1, b);</li>
<li>uw toestemming — voor het koppelen van Google-/Microsoft-diensten en voor anonieme analyse (art. 6, lid 1, a); intrekken kan altijd;</li>
<li>gerechtvaardigd belang — beveiliging, misbruikpreventie, beveiligingslogboek, back-ups (art. 6, lid 1, f).</li>
</ul>

<h2>8. Bewaartermijnen</h2>
<ul>
<li>Sessie: maximaal 30 dagen, eindigt na 7 dagen zonder gebruik of bij afmelden; een aanmeldtransactie ongeveer 15 minuten; een herbevestiging geldt 5 minuten.</li>
<li>Een ontkoppelde aanmeldmethode kan 7 dagen worden teruggezet.</li>
<li>Een verwijderd account kan <strong>30 dagen</strong> worden hersteld; daarna worden het account, de inhoud, identiteiten en bestanden definitief gewist (uitgevoerd door de verantwoordelijke; op verzoek direct na die termijn). In versleutelde back-ups kunnen gegevens blijven staan tot hun bewaartermijn afloopt (maximaal 12 maanden).</li>
<li>Het beveiligingslogboek wordt bewaard zolang het voor de beveiliging nodig is; regels kunnen een e-mailadres of id's bevatten en worden alleen handmatig door een beheerder verwijderd.</li>
<li>Na het ontkoppelen van een dienst benaderen we die niet meer en wordt de toegang ingetrokken; bewaarde kopieën en metadata worden met het account verwijderd, of eerder op uw verzoek.</li>
</ul>

<h2>9. Analyse</h2>
<p>Analyse staat standaard <strong>uit</strong>. Alleen als u het zelf aanzet, tellen we anonieme dagtellers per gebeurtenis (zonder account-id, IP-adres of apparaat). Er zijn geen externe analyse- of advertentiesystemen.</p>

<h2>10. Cookies en lokale opslag</h2>
<p>We gebruiken alleen functionele cookies waarzonder aanmelden niet werkt: de sessiecookie (HttpOnly, Secure), de binding van een aanmeldtransactie (ongeveer 15 minuten), tabblad-/dienstcookies en, als u ‘onthouden’ kiest, de onthouden browser. De lokale opslag van de browser bevat interface-instellingen (taal, thema, menu) en een cache om sneller te tonen. Er zijn geen cookies van derden.</p>

<h2>11. Beveiliging</h2>
<p>HTTPS/HSTS, strikte Content Security Policy, CSRF-bescherming, limieten op pogingen, versleuteling van tokens en geheimen, aparte databaserollen met beveiliging op rijniveau, een onveranderlijk beveiligingslogboek met hashketen, herbevestiging (Google of TOTP) voor gevoelige acties, optionele tweestapsverificatie, versleutelde back-ups.</p>

<h2>12. Uw rechten</h2>
<p>U hebt recht op inzage en een kopie (in de dienst kunt u uw gegevens als JSON exporteren), rectificatie (de profielfoto kunt u in de dienst wijzigen, naam en e-mailadres komen van Google; de rest op verzoek), wissing (account verwijderen in de dienst of op verzoek), beperking, bezwaar, overdraagbaarheid en het intrekken van toestemming. Mail naar <a href="mailto:${CONTACT}">${CONTACT}</a> — u krijgt binnen een maand antwoord.</p>
<p>U kunt ook een klacht indienen bij een toezichthouder. In België is dat de <a href="${GBA}">Gegevensbeschermingsautoriteit (GBA/APD)</a>, of de toezichthouder van het land waar u woont.</p>

<h2>13. Wijzigingen</h2>
<p>Belangrijke wijzigingen melden we in de dienst. Laatst bijgewerkt: ${BIJGEWERKT}.</p>
`;

const TERMS_UK = `
<h1>Умови користування</h1>
<p class="datum">Чинні з ${BIJGEWERKT}. Українська версія · <a href="#nl">Nederlandse versie</a></p>
<ol>
<li><strong>Сервіс.</strong> «Мій простір» — приватний особистий сервіс Павла Тарасевича (Бельгія), безкоштовний і без реклами. Як ми обробляємо дані — у <a href="/privacy">Політиці конфіденційності</a>.</li>
<li><strong>Доступ.</strong> Доступ надається лише після схвалення власником або за запрошенням. Права на доступ немає; власник може відмовити, обмежити або припинити доступ, зокрема при порушенні цих умов чи загрозі безпеці.</li>
<li><strong>Ваш обліковий запис.</strong> Ви відповідаєте за безпеку свого облікового запису Google та додаткових способів входу і повідомляєте про підозрілу активність на <a href="mailto:${CONTACT}">${CONTACT}</a>.</li>
<li><strong>Допустиме використання.</strong> Заборонено: незаконний вміст чи дії; спроби обійти захист, отримати чужі дані або перевантажити сервіс; автоматизований масовий доступ без дозволу; використання сервісу для спаму чи шкідливого ПЗ. У спільних просторах поважайте дані інших учасників.</li>
<li><strong>Ваш вміст.</strong> Вміст і дані залишаються вашими. Ви надаєте лише ті права, які потрібні, щоб зберігати й показувати їх вам і тим, з ким ви ними ділитеся.</li>
<li><strong>Підключені сервіси.</strong> Для Gmail, Google Drive, Google Calendar, Google Photos чи Outlook діють також умови Google або Microsoft. Ви можете від'єднати їх будь-коли.</li>
<li><strong>Без гарантій.</strong> Сервіс надається «як є», без гарантії доступності, безперервності чи відсутності помилок. Робіть власні копії важливих даних.</li>
<li><strong>Відповідальність.</strong> У межах, дозволених законом, розпорядник не відповідає за непрямі збитки чи втрату даних. Це не обмежує відповідальність за умисел, грубу недбалість чи права, яких закон не дозволяє позбавити.</li>
<li><strong>Припинення.</strong> Ви можете будь-коли видалити обліковий запис у сервісі (30 днів на відновлення). Сервіс або його частини можуть бути змінені чи припинені; про суттєві зміни ми повідомимо заздалегідь, якщо це можливо.</li>
<li><strong>Право і спори.</strong> Діє право Бельгії; спори розглядає компетентний суд згідно із законом, без обмеження ваших прав як споживача.</li>
<li><strong>Контакт.</strong> <a href="mailto:${CONTACT}">${CONTACT}</a>.</li>
</ol>
`;

const TERMS_NL = `
<h1>Gebruiksvoorwaarden</h1>
<p class="datum">Geldig vanaf ${BIJGEWERKT}. Nederlandse versie · <a href="#uk">Українська версія</a></p>
<ol>
<li><strong>De dienst.</strong> ‘Mijn Ruimte’ is een privé, persoonlijke dienst van Pavlo Tarasevych (België), gratis en zonder advertenties. Hoe we met gegevens omgaan, staat in het <a href="/privacy#nl">Privacybeleid</a>.</li>
<li><strong>Toegang.</strong> Toegang alleen na goedkeuring door de eigenaar of via een uitnodiging. Er is geen recht op toegang; de eigenaar kan toegang weigeren, beperken of beëindigen, onder meer bij schending van deze voorwaarden of een beveiligingsrisico.</li>
<li><strong>Uw account.</strong> U bent verantwoordelijk voor de beveiliging van uw Google-account en eventuele extra aanmeldmethoden en meldt verdachte activiteit via <a href="mailto:${CONTACT}">${CONTACT}</a>.</li>
<li><strong>Aanvaardbaar gebruik.</strong> Niet toegestaan: onwettige inhoud of handelingen; pogingen om de beveiliging te omzeilen, gegevens van anderen te verkrijgen of de dienst te overbelasten; geautomatiseerde massale toegang zonder toestemming; de dienst gebruiken voor spam of malware. Respecteer in gedeelde werkruimtes de gegevens van andere leden.</li>
<li><strong>Uw inhoud.</strong> Inhoud en gegevens blijven van u. U geeft alleen de rechten die nodig zijn om ze op te slaan en te tonen aan uzelf en aan wie u ze deelt.</li>
<li><strong>Gekoppelde diensten.</strong> Voor Gmail, Google Drive, Google Agenda, Google Foto's of Outlook gelden ook de voorwaarden van Google of Microsoft. U kunt ze altijd ontkoppelen.</li>
<li><strong>Geen garantie.</strong> De dienst wordt geleverd ‘zoals hij is’, zonder garantie op beschikbaarheid, continuïteit of foutloosheid. Maak zelf kopieën van belangrijke gegevens.</li>
<li><strong>Aansprakelijkheid.</strong> Voor zover de wet dat toelaat, is de verantwoordelijke niet aansprakelijk voor indirecte schade of gegevensverlies. Dit beperkt geen aansprakelijkheid voor opzet, grove nalatigheid of rechten die de wet niet laat uitsluiten.</li>
<li><strong>Beëindiging.</strong> U kunt uw account altijd in de dienst verwijderen (30 dagen herstelbaar). De dienst of onderdelen ervan kunnen wijzigen of stoppen; belangrijke wijzigingen melden we vooraf waar mogelijk.</li>
<li><strong>Recht en geschillen.</strong> Belgisch recht is van toepassing; geschillen gaan naar de volgens de wet bevoegde rechter, zonder beperking van uw rechten als consument.</li>
<li><strong>Contact.</strong> <a href="mailto:${CONTACT}">${CONTACT}</a>.</li>
</ol>
`;

export const PRIVACY_HTML = pagina('Політика конфіденційності · Privacybeleid — Мій простір / Mijn Ruimte', { pad: '/terms', uk: 'Умови користування', nl: 'Gebruiksvoorwaarden' }, PRIVACY_UK, PRIVACY_NL);
export const TERMS_HTML = pagina('Умови користування · Gebruiksvoorwaarden — Мій простір / Mijn Ruimte', { pad: '/privacy', uk: 'Політика конфіденційності', nl: 'Privacybeleid' }, TERMS_UK, TERMS_NL);

const html = (body: string): RouterResponse => ({ statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Language': 'uk, nl' }, body });

/** Publieke routes (zie PUBLIEKE_ROUTES in server/platform/auth-poort.ts). */
export const juridischeRoutes: RouterRoutes = {
  'GET /privacy': [() => html(PRIVACY_HTML)],
  'GET /terms': [() => html(TERMS_HTML)],
};
