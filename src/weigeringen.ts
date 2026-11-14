// SEC-002 (afwerking): teksten voor weigeringen die de server sinds het audit geeft, voor schermen zonder eigen foutentabel.
// Zuiver (geen DOM, geen fetch): een paar [uk, nl] of null. null = geen bekende weigering → het scherm houdt zijn eigen tekst.
// Elke tekst zegt wat er gebeurde én wat de mens nu kan doen (geen «Спробуйте ще раз» waar opnieuw proberen niets oplost).
export type Paar = readonly [string, string];

const codeVan = (e: unknown): string => {
  const f = (e ?? {}) as { message?: unknown; response?: { data?: { error?: unknown } } };
  const uitLichaam = f.response?.data && typeof f.response.data === 'object' ? f.response.data.error : undefined;
  return String(uitLichaam || f.message || '');
};
const minuten = (e: unknown): number => {
  const f = (e ?? {}) as { retryAfter?: unknown; response?: { data?: { retryAfter?: unknown } } };
  const s = Number(f.retryAfter) > 0 ? Number(f.retryAfter) : Number(f.response?.data?.retryAfter) || 0;
  return s > 0 ? Math.max(1, Math.ceil(s / 60)) : 0;
};

/** Delen van een werkruimte per e-mail (POST /api/share/email). Grens: 20 uitnodigingen per uur (g02, opmerking 13). */
export function deelWeigering(e: unknown): Paar | null {
  const code = codeVan(e);
  if (code === 'RATE_LIMITED') {
    const m = minuten(e);
    return [
      `Забагато запрошень за годину — це запрошення не надіслано. Спробуйте ${m ? `через ~${m} хв` : 'пізніше'}.`,
      `Te veel uitnodigingen in een uur — deze uitnodiging is niet verstuurd. Probeer het ${m ? `over ~${m} min.` : 'later'} opnieuw.`,
    ];
  }
  if (code === 'SHARE_SELF') return ['Собі надати доступ не можна — ви вже власник цього простору.', 'U kunt uzelf geen toegang geven — u bent al de eigenaar van deze ruimte.'];
  if (code === 'RBAC_ROLE_FORBIDDEN') return ['Ви не можете надати таку роль: вона вища за вашу власну. Виберіть нижчу роль.', 'U kunt deze rol niet geven: hij is hoger dan uw eigen rol. Kies een lagere rol.'];
  if (code === 'SCOPE_BLOCKS_INVALID') return ['Вибрані блоки більше не належать до цього простору. Оновіть сторінку й виберіть їх знову.', 'De gekozen blokken horen niet meer bij deze ruimte. Ververs de pagina en kies ze opnieuw.'];
  if (code === 'Valid email required') return ['Перевірте адресу пошти: вона не схожа на справжню.', 'Controleer het e-mailadres: het lijkt niet echt.'];
  // IDENTITEIT-014: відмови під час вступу за запрошенням (POST /api/share/join) — що сталося і що робити далі.
  // Weigeringen bij aansluiten via een uitnodiging: wat er gebeurde en wat de mens nu kan doen.
  if (code === 'invite_expired') return ['Запрошення прострочене: воно діяло 7 днів. Попросіть того, хто вас запросив, надіслати нове.', 'De uitnodiging is verlopen: ze was 7 dagen geldig. Vraag wie u uitnodigde om een nieuwe te sturen.'];
  if (code === 'invite_used') return ['Це посилання вже використано: воно одноразове. Попросіть нове посилання.', 'Deze link is al gebruikt: hij werkt maar één keer. Vraag om een nieuwe link.'];
  if (code === 'invite_revoked') return ['Запрошення відкликали — доступу за ним немає. Якщо це помилка, зверніться до того, хто вас запросив.', 'De uitnodiging is ingetrokken — ze geeft geen toegang. Is dat een vergissing, neem dan contact op met wie u uitnodigde.'];
  if (code === 'invite_not_found') return ['Запрошення не знайдено: посилання неповне або неправильне. Перевірте, чи скопійовано його повністю.', 'Uitnodiging niet gevonden: de link is onvolledig of fout. Controleer of hij helemaal is gekopieerd.'];
  if (code === 'invite_not_allowed') return ['Це запрошення призначене для іншої адреси. Увійдіть з тією адресою, на яку його надіслали.', 'Deze uitnodiging is voor een ander adres. Meld u aan met het adres waarnaar ze is gestuurd.'];
  if (code === 'INVITE_INVITER_NOT_ALLOWED') return ['Той, хто вас запросив, більше не може надавати доступ до цього простору, тож запрошення не діє. Попросіть власника простору.', 'Wie u uitnodigde, mag geen toegang tot deze werkruimte meer geven, dus de uitnodiging werkt niet. Vraag het de eigenaar van de werkruimte.'];
  return null;
}

/** Beheer: besluit over een toegangsaanvraag en wijziging van een gebruiker (g11 aanv-gat-a-01, g10c autorisatie-02). */
export function beheerWeigering(e: unknown): Paar | null {
  switch (codeVan(e)) {
    case 'ADMIN_ACCESS_REQUEST_NOT_PENDING':
      return ['Цей запит уже розглянуто (можливо, іншим адміністратором). Нічого не змінено — оновлений список показано нижче.', 'Deze aanvraag is al afgehandeld (misschien door een andere beheerder). Er is niets gewijzigd — de bijgewerkte lijst staat hieronder.'];
    case 'ADMIN_ACCESS_REQUEST_TARGET_LOCKED':
      return ['Обліковий запис заблоковано або видалено: через запит доступу його не відкрити. Розблокуйте чи відновіть його в списку користувачів.', 'Het account is geblokkeerd of verwijderd: via een toegangsaanvraag gaat het niet open. Deblokkeer of herstel het in de lijst van gebruikers.'];
    case 'ADMIN_OWNER_ACCOUNT_PROTECTED':
      return ['Обліковий запис власника захищено: його не можна змінити звідси.', 'Het eigenaarsaccount is beschermd: het kan hier niet worden gewijzigd.'];
    case 'RBAC_ROLE_FORBIDDEN':
      return ['Ви не можете надати чи змінити цю роль: вона не нижча за вашу власну.', 'U kunt deze rol niet geven of wijzigen: hij is niet lager dan uw eigen rol.'];
    case 'ADMIN_ACCESS_REQUEST_UPDATE_FAILED':
    case 'ADMIN_USER_UPDATE_FAILED':
      return ['Зміну не збережено: обліковий запис тим часом змінили в іншому місці або база даних не відповіла. Нічого не змінено — оновіть список і спробуйте ще раз.', 'De wijziging is niet opgeslagen: het account is intussen elders gewijzigd of de database antwoordde niet. Er is niets gewijzigd — ververs de lijst en probeer het opnieuw.'];
    default:
      return null;
  }
}

// IDENTITEIT-013: загальні відмови для видалення облікового запису, віджетів, способів входу й спільного доступу. Код береться і з
// `error`, і з `reasonCode` (step-up віддає саме його). Спершу — точніші таблиці deelWeigering/beheerWeigering.
// Algemene weigeringen voor account verwijderen, widgets, aanmeldmethoden en delen; leest error én reasonCode.
const volleCode = (e: unknown): string => {
  const f = (e ?? {}) as { message?: unknown; response?: { data?: { error?: unknown; reasonCode?: unknown } } };
  const d = f.response?.data && typeof f.response.data === 'object' ? f.response.data : undefined;
  return String(d?.error || d?.reasonCode || f.message || '');
};
const ALGEMEEN: Record<string, Paar> = {
  OWNER_NIET_WISSEN: ['Обліковий запис власника сайту не можна видалити.', 'Het account van de eigenaar van de site kan niet worden verwijderd.'],
  OWNER_EMAIL_CONFIRMATION_MISMATCH: ['Адреса для підтвердження не збігається з адресою облікового запису. Введіть її точно.', 'Het bevestigingsadres komt niet overeen met het adres van het account. Typ het exact over.'],
  CODEWOORD_ONJUIST: ['Кодове слово не збігається. Нічого не змінено.', 'Het codewoord klopt niet. Er is niets gewijzigd.'],
  CODEWOORD_VERPLICHT: ['Для цієї дії потрібне ваше кодове слово.', 'Voor deze handeling is uw codewoord nodig.'],
  CODEWOORD_GEBLOKKEERD: ['Забагато спроб кодового слова. Зачекайте 15 хвилин.', 'Te veel pogingen met het codewoord. Wacht 15 minuten.'],
  STEP_UP_REQUIRED: ['Потрібно підтвердити доступ (passkey, код або повторний вхід Google). Нічого не змінено.', 'Bevestiging van toegang is nodig (passkey, code of opnieuw aanmelden bij Google). Er is niets gewijzigd.'],
  STEP_UP_STRONG_REQUIRED: ['Потрібне сильне підтвердження: passkey, код із застосунку або код відновлення. Нічого не змінено.', 'Sterke bevestiging nodig: passkey, app-code of herstelcode. Er is niets gewijzigd.'],
  STAP_OP_VENSTER_FOUT: ['Не вдалося відкрити вікно «Підтвердіть доступ». Оновіть сторінку й спробуйте ще раз.', 'Het venster «Toegang bevestigen» kon niet openen. Vernieuw de pagina en probeer het opnieuw.'],
  LAST_LOGIN_METHOD_PROTECTED: ['Це ваш останній спосіб входу — його не можна прибрати, інакше ви втратите доступ.', 'Dit is uw laatste aanmeldmethode — die kan niet weg, anders verliest u de toegang.'],
  ACCESS_PASSWORD_TOO_SHORT: ['Пароль закороткий: потрібно щонайменше 10 символів.', 'Het wachtwoord is te kort: minstens 10 tekens.'],
  ACCESS_PASSWORD_TOO_LONG: ['Пароль задовгий: щонайбільше 1024 символи.', 'Het wachtwoord is te lang: hoogstens 1024 tekens.'],
  // IDENTITEIT-014: автентифікатор (налаштування, заміна, вимкнення) — раніше всі ці коди ставали одним «Код не підходить».
  ACCESS_TOTP_REUSED: ['Цей код уже використано (можливо, для підтвердження доступу). Дочекайтеся наступного коду в застосунку (до 30 с) і спробуйте ще раз.', 'Deze code is al gebruikt (misschien voor het bevestigen van toegang). Wacht op de volgende code in de app (tot 30 s) en probeer het opnieuw.'],
  ACCESS_TOTP_INVALID: ['Код не підходить. Перевірте, що час на телефоні точний, і введіть свіжий код.', 'De code klopt niet. Controleer of de tijd op de telefoon klopt en voer een verse code in.'],
  ACCESS_TOTP_CODE_REQUIRED: ['Потрібен чинний код зі старого застосунку-автентифікатора або невикористаний код відновлення. Нічого не змінено.', 'Een geldige code uit de oude authenticator-app of een ongebruikte herstelcode is nodig. Er is niets gewijzigd.'],
  ACCESS_TOTP_REPLACE_EXPIRED: ['Минуло понад 15 хвилин — заміну скасовано, старий автентифікатор діє далі. Почніть заміну знову.', 'Er zijn meer dan 15 minuten verstreken — het vervangen is geannuleerd en de oude authenticator werkt nog. Begin opnieuw.'],
  ACCESS_TOTP_NOT_STARTED: ['Налаштування автентифікатора не розпочато в цьому вікні. Натисніть «Налаштувати» ще раз.', 'Het instellen van de authenticator is niet in dit venster begonnen. Klik nogmaals op «Instellen».'],
  ACCESS_TOTP_ALREADY_ENROLLED: ['Автентифікатор уже налаштовано — підтверджувати нічого. Щоб змінити його, скористайтеся «Замінити автентифікатор».', 'De authenticator is al ingesteld — er valt niets te bevestigen. Gebruik «Authenticator vervangen» om hem te wijzigen.'],
  ACCESS_TOTP_KEY_MISSING: ['Сервер зараз не може працювати з автентифікаторами (немає ключа шифрування). Нічого не змінено — повідомте власника сайту.', 'De server kan nu niet met authenticators werken (de versleutelingssleutel ontbreekt). Er is niets gewijzigd — meld het aan de eigenaar van de site.'],
  ACCESS_RECOVERY_PEPPER_MISSING: ['Сервер зараз не може створити коди відновлення. Нічого не змінено — повідомте власника сайту.', 'De server kan nu geen herstelcodes maken. Er is niets gewijzigd — meld het aan de eigenaar van de site.'],
  ACCESS_LOCKED_TEMPORARILY: ['Забагато спроб коду. Зачекайте кілька хвилин і спробуйте знову.', 'Te veel pogingen met een code. Wacht een paar minuten en probeer het opnieuw.'],
  // IDENTITEIT-015: відновлення облікового запису, правило другого чинника, фіолетова палітра.
  RECOVERY_WINDOW_EXPIRED: ['Минуло понад 30 днів після видалення — обліковий запис уже стерто остаточно. Можна почати з новим обліковим записом.', 'Er zijn meer dan 30 dagen verstreken sinds het verwijderen — het account is definitief gewist. U kunt opnieuw beginnen met een nieuw account.'],
  RECOVERY_ADMIN_DELETED: ['Цей обліковий запис видалив адміністратор, тому відновити його самостійно не можна. Зверніться до власника сайту.', 'Dit account is door een beheerder verwijderd en kan niet zelf worden hersteld. Neem contact op met de eigenaar van de site.'],
  RECOVERY_NOT_ALLOWED: ['Стан облікового запису щойно змінився (наприклад, його заблоковано). Оновіть сторінку.', 'De toestand van het account is net gewijzigd (bijvoorbeeld geblokkeerd). Vernieuw de pagina.'],
  ACCESS_MFA_EIGEN_FACTOR_VEREIST: ['Спершу налаштуйте для себе застосунок-автентифікатор або ключ доступу: інакше правило вимагало б від інших те, чого немає у вас.', 'Stel eerst voor uzelf een authenticator-app of passkey in: anders zou de regel van anderen eisen wat u zelf niet hebt.'],
  BLOK_URL_VEREIST: ['Зовнішньому блоку потрібне посилання https://: без нього блок нічого не відкриває. Для внутрішнього сервісу оберіть джерело «Внутрішній».', 'Een extern blok heeft een https://-link nodig: zonder link opent het blok niets. Kies voor een interne dienst de bron «Intern».'],
  BLOK_URL_ONGELDIG: ['Посилання має починатися з https:// і не містити логіна чи пароля.', 'De link moet met https:// beginnen en mag geen gebruikersnaam of wachtwoord bevatten.'],
  BLOK_TITEL_TE_LANG: ['Назва задовга: щонайбільше 120 символів.', 'De naam is te lang: hoogstens 120 tekens.'],
  BLOK_OMSCHRIJVING_TE_LANG: ['Опис задовгий: щонайбільше 500 символів.', 'De beschrijving is te lang: hoogstens 500 tekens.'],
  'Title is required': ['Вкажіть назву блоку.', 'Geef het blok een naam.'],
  'Write access required': ['У цьому просторі у вас лише перегляд — додавати блоки не можна.', 'In deze werkruimte kunt u alleen kijken — blokken toevoegen kan niet.'],
  'Approval required': ['Обліковий запис ще не схвалено, тож змінювати простір не можна.', 'Het account is nog niet goedgekeurd, dus de werkruimte wijzigen kan niet.'],
  // IDENTITEIT-015 (profiel-blokken): передача простору (POST /api/owner/identity/workspaces/:id/overdragen).
  WERKRUIMTE_NIET_GEVONDEN: ['Простір не знайдено — можливо, його вже видалено. Оновіть сторінку.', 'De werkruimte is niet gevonden — misschien is ze al verwijderd. Vernieuw de pagina.'],
  WERKRUIMTE_NIET_EIGENAAR: ['Передати простір може лише його власник. Нічого не змінено.', 'Alleen de eigenaar kan de werkruimte overdragen. Er is niets gewijzigd.'],
  WERKRUIMTE_GEARCHIVEERD: ['Простір в архіві. Спершу відновіть його, потім передайте.', 'De werkruimte staat in het archief. Herstel haar eerst en draag haar dan over.'],
  WERKRUIMTE_TECHNISCH: ['Технічний простір передати не можна: у ньому немає учасників.', 'Een technische werkruimte kan niet worden overgedragen: er zijn geen leden.'],
  OVERDRACHT_ZELF: ['Оберіть іншу людину — собі передати простір не можна.', 'Kies iemand anders — aan uzelf overdragen kan niet.'],
  OVERDRACHT_GEEN_LID: ['Ця людина більше не учасник простору. Оновіть список і оберіть іншого.', 'Deze persoon is geen lid meer van de werkruimte. Vernieuw de lijst en kies iemand anders.'],
  OVERDRACHT_ROL: ['Передати можна лише учасникові з роллю «Адміністратор» або «Редагування». Спершу змініть роль у «Доступ до простору».', 'Overdragen kan alleen aan een lid met de rol «Beheerder» of «Bewerken». Wijzig eerst de rol onder «Toegang tot werkruimte».'],
  OVERDRACHT_ACCOUNT: ['Обліковий запис цієї людини зараз не активний (не схвалений, заблокований або видалений). Оберіть іншого.', 'Het account van deze persoon is nu niet actief (niet goedgekeurd, geblokkeerd of verwijderd). Kies iemand anders.'],
  OVERDRACHT_GELIJKTIJDIG: ['Простір щойно передано іншим запитом. Оновіть сторінку, щоб побачити нового власника.', 'De werkruimte is net via een ander verzoek overgedragen. Vernieuw de pagina om de nieuwe eigenaar te zien.'],
  ZELFTEST_ALLEEN_BEHEER: ['Самоперевірку способу входу запускає лише власник або адміністратор.', 'Alleen de eigenaar of een beheerder voert de zelftest van een aanmeldmethode uit.'],
  NETWORK_ERROR: ['Немає зв’язку з сервером. Перевірте інтернет і спробуйте ще раз — нічого не змінено.', 'Geen verbinding met de server. Controleer het internet en probeer het opnieuw — er is niets gewijzigd.'],
  ABORTED: ['Запит перервано. Нічого не змінено.', 'Het verzoek is afgebroken. Er is niets gewijzigd.'],
};
/** Зрозумілий текст відмови [uk, nl] для відомого коду; null — екран показує свій загальний текст. */
export function foutNaarTekst(e: unknown): Paar | null {
  const specifiek = deelWeigering(e) || beheerWeigering(e);
  if (specifiek) return specifiek;
  const code = volleCode(e);
  if (code === 'RATE_LIMITED') { const m = minuten(e); return [`Забагато спроб. Спробуйте ${m ? `через ~${m} хв` : 'пізніше'}.`, `Te veel pogingen. Probeer het ${m ? `over ~${m} min.` : 'later'} opnieuw.`]; }
  return ALGEMEEN[code] || null;
}

// IDENTITEIT-014: вивантаження даних (POST /api/owner/privacy/export). Власні тексти для ліміту й сеансу: deelWeigering відповів би
// на RATE_LIMITED текстом про запрошення, а OWNER_IDENTITY_SESSION_REQUIRED загальна таблиця не знає. Решта — через foutNaarTekst.
// Export van gegevens: eigen tekst voor de limiet (5 per uur, met wachttijd) en voor een ontbrekende sessie; de rest via foutNaarTekst.
export const UITVOER_PER_UUR = 5;
export function uitvoerWeigering(e: unknown): Paar | null {
  const code = volleCode(e);
  if (code === 'RATE_LIMITED') {
    const m = minuten(e);
    return [
      `Вивантажувати дані можна до ${UITVOER_PER_UUR} разів на годину — цей файл не створено. Спробуйте ${m ? `через ~${m} хв` : 'пізніше'}.`,
      `U kunt tot ${UITVOER_PER_UUR} keer per uur exporteren — dit bestand is niet gemaakt. Probeer het ${m ? `over ~${m} min.` : 'later'} opnieuw.`,
    ];
  }
  if (code === 'OWNER_IDENTITY_SESSION_REQUIRED') return ['Сеанс налаштувань закінчився або обліковий запис ще не схвалено. Увійдіть знову — після цього дані можна буде вивантажити.', 'De sessie van de instellingen is verlopen of het account is nog niet goedgekeurd. Meld u opnieuw aan — daarna kunt u de gegevens exporteren.'];
  return foutNaarTekst(e);
}

// IDENTITEIT-015 (profiel-blokken): світлина за посиланням (POST /api/owner/profile/photo/link) — завжди пара [uk, nl]:
// що сталося і що зробити (найчастіше — зберегти файл і вибрати «Пристрій»). Власна таблиця: RATE_LIMITED тут — не про запрошення.
// Foto via een link: altijd een paar; eigen tekst voor de limiet (deelWeigering zou die als «uitnodigingen» uitleggen).
export function fotoLinkWeigering(e: unknown): Paar {
  const code = volleCode(e);
  const bewaar = ['Збережіть зображення на пристрій і оберіть «Пристрій».', 'Bewaar de afbeelding op uw apparaat en kies «Apparaat».'] as const;
  if (code === 'RATE_LIMITED') { const m = minuten(e); return [`Забагато спроб завантажити фото за посиланням. Спробуйте ${m ? `через ~${m} хв` : 'пізніше'} або оберіть «Пристрій».`, `Te veel pogingen om een foto via een link op te halen. Probeer het ${m ? `over ~${m} min.` : 'later'} opnieuw of kies «Apparaat».`]; }
  if (code === 'FOTO_LINK_ONGELDIG') return ['Потрібне повне посилання https:// без логіна й пароля.', 'Er is een volledige https://-link nodig, zonder gebruikersnaam en wachtwoord.'];
  if (code === 'FOTO_LINK_GEWEIGERD') return [`Це посилання веде до внутрішньої або службової адреси — з міркувань безпеки сайт його не відкриває. ${bewaar[0]}`, `Deze link wijst naar een intern of dienstadres — om veiligheidsredenen opent de site hem niet. ${bewaar[1]}`];
  if (code === 'FOTO_LINK_TE_GROOT') return [`Зображення завелике (понад 8 МБ). ${bewaar[0]}`, `De afbeelding is te groot (meer dan 8 MB). ${bewaar[1]}`];
  if (code === 'FOTO_LINK_GEEN_AFBEELDING') return ['За посиланням не JPEG, PNG чи WebP (можливо, це сторінка, а не саме зображення). Скопіюйте адресу самого зображення.', 'De link geeft geen JPEG, PNG of WebP (misschien een pagina in plaats van de afbeelding zelf). Kopieer het adres van de afbeelding zelf.'];
  if (code === 'FOTO_LINK_OMLEIDING') return ['Посилання переадресовує на іншу адресу — сайт не йде за переадресаціями. Відкрийте зображення й скопіюйте його кінцеву адресу.', 'De link verwijst door naar een ander adres — de site volgt geen doorverwijzingen. Open de afbeelding en kopieer het uiteindelijke adres.'];
  if (code === 'FOTO_LINK_ONBEREIKBAAR') return [`Сайт зображення не відповів або відмовив (за 10 секунд). ${bewaar[0]}`, `De site van de afbeelding antwoordde niet of weigerde (binnen 10 seconden). ${bewaar[1]}`];
  const v = foutNaarTekst(e);
  return v || [`Не вдалося завантажити зображення за посиланням. ${bewaar[0]}`, `De afbeelding kon niet via de link worden opgehaald. ${bewaar[1]}`];
}

// IDENTITEIT-015 (крок «aanmelden»): вхід без Google (ключ доступу, пароль, Microsoft/Discord/Apple), повернення способу входу й
// підтвердження номера кодом із SMS. Кожен текст каже, що сталося й що робити далі; «нічого не змінено», де це так.
// Aanmelden zonder Google, een methode terugzetten en het telefoonnummer bevestigen met een sms-code.
const AANMELDEN: Record<string, Paar> = {
  METHODE_UIT: ['Цей спосіб входу зараз вимкнено на сайті. Увійдіть через Google або іншим способом.', 'Deze aanmeldmethode staat nu uit op de site. Meld u aan met Google of op een andere manier.'],
  METHODE_NIET_VOOR_U: ['Для вашого облікового запису цей спосіб входу ще не ввімкнено — вхід не виконано. Увійдіть через Google; власник сайту може ввімкнути його вам у «Функціях».', 'Deze aanmeldmethode staat voor uw account nog niet aan — u bent niet aangemeld. Meld u aan met Google; de site-eigenaar kan hem voor u aanzetten bij «Functies».'],
  UITDAGING_ONGELDIG: ['Запит на вхід застарів або вже використаний. Почніть вхід знову — це безпечно.', 'Het aanmeldverzoek is verlopen of al gebruikt. Begin opnieuw — dat is veilig.'],
  LOGIN_BINDING_MISMATCH: ['Цей вхід почато в іншій вкладці чи браузері, тому тут його не завершено. Почніть вхід у цій вкладці.', 'Deze aanmelding is in een ander tabblad of andere browser begonnen en is hier niet afgerond. Begin opnieuw in dit tabblad.'],
  ANDERE_BROWSER: ['Вхід почато в іншому браузері, тому тут його не завершено (нічого не змінено). Почніть вхід у цьому браузері.', 'De aanmelding begon in een andere browser en is hier niet afgerond (niets gewijzigd). Begin opnieuw in deze browser.'],
  PASSKEY_ONBEKEND: ['Цей ключ доступу не належить жодному обліковому запису сайту. Увійдіть через Google і додайте ключ у «Безпеці».', 'Deze toegangssleutel hoort bij geen enkel account van de site. Meld u aan met Google en voeg de sleutel toe bij «Beveiliging».'],
  PASSKEY_TELLER_TERUG: ['Ключ доступу повернув старий лічильник — можливо, це копія. Вхід не виконано; перевірте ключ у «Безпеці».', 'De toegangssleutel gaf een oude teller — mogelijk een kopie. Niet aangemeld; controleer de sleutel bij «Beveiliging».'],
  NotAllowedError: ['Вхід ключем доступу скасовано або час вийшов. Спробуйте ще раз.', 'Aanmelden met de toegangssleutel is geannuleerd of de tijd is om. Probeer het opnieuw.'],
  ACCESS_CREDENTIALS_INVALID: ['Адреса, пароль або код не підходять. Якщо ви налаштували застосунок-автентифікатор, введіть і його код (або код відновлення).', 'Adres, wachtwoord of code klopt niet. Hebt u een authenticator-app ingesteld, vul dan ook die code in (of een herstelcode).'],
  ACCESS_PASSWORD_DISABLED: ['Вхід паролем вимкнув власник сайту.', 'De site-eigenaar heeft aanmelden met wachtwoord uitgezet.'],
  NIET_GEKOPPELD: ['Цей обліковий запис не прив’язано до жодного облікового запису сайту. Увійдіть через Google і прив’яжіть його в «Способах входу».', 'Dit account is aan geen enkel account van de site gekoppeld. Meld u aan met Google en koppel het bij «Aanmeldmethoden».'],
  TOKEN_ONGELDIG: ['Провайдер не підтвердив вхід. Спробуйте ще раз або іншим способом.', 'De aanbieder bevestigde de aanmelding niet. Probeer opnieuw of op een andere manier.'],
  HANDTEKENING_ONGELDIG: ['Підпис відповіді провайдера не пройшов перевірку — вхід не виконано.', 'De handtekening van de aanbieder klopte niet — niet aangemeld.'],
  VERLOPEN: ['Час вийшов. Почніть вхід знову.', 'De tijd is om. Begin opnieuw.'],
  ACCOUNT_NOT_APPROVED: ['Обліковий запис ще не схвалено власником сайту, тож вхід поки неможливий.', 'Het account is nog niet goedgekeurd door de site-eigenaar; aanmelden kan nog niet.'],
  ACCESS_RESTORE_NOT_FOUND: ['Повертати нічого: 7 днів минули або спосіб уже повернуто.', 'Er is niets terug te zetten: de 7 dagen zijn voorbij of de methode is al teruggezet.'],
  ACCESS_RESTORE_ADMIN_ONLY: ['Цей спосіб від’єднав адміністратор — повернути його може лише він.', 'Deze methode is door een beheerder ontkoppeld — alleen die kan hem terugzetten.'],
  SMS_VLAG_UIT: ['Підтвердження номера кодом із SMS для вашого облікового запису ще не ввімкнено.', 'Het nummer bevestigen met een sms-code staat voor uw account nog niet aan.'],
  SMS_NIET_INGESTELD: ['Надсилання SMS ще не налаштовано власником сайту — код не надіслано.', 'Sms versturen is nog niet ingesteld door de site-eigenaar — er is geen code verstuurd.'],
  SMS_VERZENDEN_MISLUKT: ['SMS-провайдер не прийняв повідомлення. Перевірте номер і спробуйте пізніше — код не діє.', 'De sms-aanbieder weigerde het bericht. Controleer het nummer en probeer later — de code geldt niet.'],
  SMS_CODE_ONJUIST: ['Код не підходить. Перевірте SMS і введіть 6 цифр.', 'De code klopt niet. Controleer de sms en vul de 6 cijfers in.'],
  SMS_CODE_VERLOPEN: ['Код застарів (діє 10 хвилин). Надішліть новий.', 'De code is verlopen (geldt 10 minuten). Verstuur een nieuwe.'],
  SMS_CODE_TE_VEEL: ['Забагато помилок із цим кодом — він більше не діє. Надішліть новий.', 'Te veel fouten met deze code — hij geldt niet meer. Verstuur een nieuwe.'],
  ACCESS_PHONE_E164_REQUIRED: ['Введіть номер у міжнародному форматі: +, код країни й номер (наприклад, +31612345678).', 'Vul het nummer internationaal in: +, landcode en nummer (bijvoorbeeld +31612345678).'],
  ACCESS_PHONE_INVALID: ['Номер закороткий або містить зайві символи.', 'Het nummer is te kort of bevat ongeldige tekens.'],
};
/** Текст відмови для входу без Google, повернення способу й SMS [uk, nl]; решта — foutNaarTekst. */
export function aanmeldWeigering(e: unknown): Paar | null {
  const code = volleCode(e).replace(/^PASSKEY_(?!ONBEKEND|TELLER_TERUG).*/, 'PASSKEY_ONGELDIG');
  if (code === 'PASSKEY_ONGELDIG') return ['Ключ доступу не пройшов перевірку (підпис, сайт або перевірка користувача). Вхід не виконано — спробуйте ще раз.', 'De toegangssleutel kwam niet door de controle (handtekening, site of gebruikerscontrole). Niet aangemeld — probeer opnieuw.'];
  if (code === 'RATE_LIMITED' || code === 'ACCESS_LOCKED_TEMPORARILY') { const m = minuten(e); return [`Забагато спроб. Спробуйте ${m ? `через ~${m} хв` : 'за кілька хвилин'} — обліковий запис не заблоковано назавжди.`, `Te veel pogingen. Probeer het ${m ? `over ~${m} min` : 'over een paar minuten'} — het account is niet blijvend geblokkeerd.`]; }
  return AANMELDEN[code] || foutNaarTekst(e);
}
