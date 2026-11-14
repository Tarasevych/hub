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
