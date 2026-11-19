import type { ReactNode } from 'react';
import { Code2 } from 'lucide-react';

export type Lang = 'uk' | 'nl';

type Pair = { uk: string; nl: string };

// Технічні коди, які приходять з backend або від зовнішніх систем.
// Ключ — рівно той рядок, що приходить у даних. Значення — підпис мовою сайту.
// Невідомий код НЕ перекладається і НЕ вигадується: показуємо його як є.
const TERMS: Record<string, Pair> = {
  // повноваження адміністратора
  'users.manage': { uk: 'Керування користувачами', nl: 'Gebruikersbeheer' },
  'apps.manage': { uk: 'Керування додатками', nl: 'Appbeheer' },
  'sso.manage': { uk: 'Керування єдиним входом', nl: 'Beheer eenmalige aanmelding' },
  'directories.manage': { uk: 'Керування каталогами', nl: 'Directorybeheer' },
  'roles.manage': { uk: 'Керування ролями', nl: 'Rolbeheer' },
  'keys.manage': { uk: 'Керування ключами', nl: 'Sleutelbeheer' },
  'audit.read': { uk: 'Читання журналу', nl: 'Logboek lezen' },
  'diagnostics.read': { uk: 'Читання діагностики', nl: 'Diagnostiek lezen' },
  // стан облікового запису
  approved: { uk: 'Схвалено', nl: 'Goedgekeurd' },
  pending: { uk: 'Очікує рішення', nl: 'In afwachting' },
  blocked: { uk: 'Заблоковано', nl: 'Geblokkeerd' },
  new: { uk: 'Новий', nl: 'Nieuw' },
  deleted: { uk: 'Видалено', nl: 'Verwijderd' },
  denied: { uk: 'Відмовлено', nl: 'Geweigerd' },
  // ролі у просторі
  owner: { uk: 'Власник', nl: 'Eigenaar' },
  admin: { uk: 'Адміністратор', nl: 'Beheerder' },
  member: { uk: 'Учасник', nl: 'Deelnemer' },
  viewer: { uk: 'Глядач', nl: 'Kijker' },
  // політика зовнішніх додатків
  allowed: { uk: 'Дозволено', nl: 'Toegestaan' },
  review: { uk: 'Потребує перевірки', nl: 'Beoordeling vereist' },
  active: { uk: 'Активний', nl: 'Actief' },
  inactive: { uk: 'Неактивний', nl: 'Inactief' },
  // постачальники входу
  google: { uk: 'Google', nl: 'Google' },
  microsoft: { uk: 'Microsoft', nl: 'Microsoft' },
  internal: { uk: 'Внутрішній', nl: 'Intern' },
  // доступ до пошти
  none: { uk: 'Немає', nl: 'Geen' },
  required: { uk: 'Потрібен дозвіл', nl: 'Toestemming vereist' },
  granted: { uk: 'Надано', nl: 'Verleend' },
  not_granted: { uk: 'Не надано', nl: 'Niet verleend' },
  // стан зовнішнього каталогу
  connected: { uk: 'Підключено', nl: 'Verbonden' },
  disconnected: { uk: 'Не підключено', nl: 'Niet verbonden' },
  not_configured: { uk: 'Не налаштовано', nl: 'Niet ingesteld' },
  configured: { uk: 'Налаштовано', nl: 'Ingesteld' },
  missing: { uk: 'Відсутні', nl: 'Ontbreekt' },
  unverified: { uk: 'Не перевірено', nl: 'Niet geverifieerd' },
  // відповідність політикам пристрою
  compliant: { uk: 'Відповідає політиці', nl: 'Voldoet aan beleid' },
  non_compliant: { uk: 'Не відповідає політиці', nl: 'Voldoet niet aan beleid' },
  enforced: { uk: 'Політику застосовано', nl: 'Beleid toegepast' },
  not_enforced: { uk: 'Політику не застосовано', nl: 'Beleid niet toegepast' },
  none_detected: { uk: 'Нічого не виявлено', nl: 'Niets gedetecteerd' },
  detected: { uk: 'Виявлено', nl: 'Gedetecteerd' },
  not_supported: { uk: 'Не підтримується', nl: 'Niet ondersteund' },
  unknown: { uk: 'Невідомо', nl: 'Onbekend' },
  // журнал
  success: { uk: 'Успішно', nl: 'Gelukt' },
  failure: { uk: 'Помилка', nl: 'Mislukt' },
  valid: { uk: 'Цілісність підтверджено', nl: 'Integriteit bevestigd' },
  sign_in: { uk: 'Вхід', nl: 'Aanmelding' },
  sign_out: { uk: 'Вихід', nl: 'Afmelding' },
  account_deleted_recoverably: { uk: 'Обліковий запис видалено з можливістю відновлення', nl: 'Account verwijderd met herstelmogelijkheid' },
  account_recovered: { uk: 'Обліковий запис відновлено', nl: 'Account hersteld' },
  admin_user_deleted_recoverably: { uk: 'Адміністратор видалив обліковий запис', nl: 'Beheerder heeft account verwijderd' },
  admin_user_recovered: { uk: 'Адміністратор відновив обліковий запис', nl: 'Beheerder heeft account hersteld' },
  'owner.admin.user.updated': { uk: 'Змінено користувача', nl: 'Gebruiker gewijzigd' },
  'owner.admin.role.updated': { uk: 'Змінено адміністративну роль', nl: 'Beheerdersrol gewijzigd' },
  'owner.admin.access-request.decided': { uk: 'Рішення щодо запиту доступу', nl: 'Beslissing over toegangsaanvraag' },
  'owner.identity.account.delete': { uk: 'Самостійне видалення облікового запису', nl: 'Account door gebruiker verwijderd' },
  'owner.identity.workspace.restored': { uk: 'Простір відновлено', nl: 'Werkruimte hersteld' },
  // пристрої (Адміністрування → Пристрої): події та політики, що приходять з backend/index.ts — audit 19.10.2026: раніше показувались як сирі коди
  session_active: { uk: 'Активний вхід', nl: 'Actieve aanmelding' },
  session_policy_active: { uk: 'Політика сесії діє', nl: 'Sessiebeleid actief' },
  tab_active: { uk: 'Активна вкладка', nl: 'Actief tabblad' },
  tab_policy_active: { uk: 'Політика вкладки діє', nl: 'Tabbladbeleid actief' },
  browser_grant_active: { uk: 'Доступ розширення браузера активний', nl: 'Toegang browserextensie actief' },
  browser_grant_revoked: { uk: 'Доступ розширення браузера відкликано', nl: 'Toegang browserextensie ingetrokken' },
  remembered_profile_active: { uk: 'Запам’ятований профіль активний', nl: 'Onthouden profiel actief' },
  revoked: { uk: 'Відкликано', nl: 'Ingetrokken' },
  expired: { uk: 'Строк минув', nl: 'Verlopen' },
  mdm_not_connected: { uk: 'MDM не підключено', nl: 'MDM niet verbonden' },
  edr_not_connected: { uk: 'EDR не підключено', nl: 'EDR niet verbonden' },
  // «Технічні дані» (Діагностика): стани служб Google і прив’язки середовища (backend/google-suite-inrichting.ts)
  not_connected: { uk: 'Не підключено', nl: 'Niet verbonden' },
  reauth_required: { uk: 'Потрібен повторний вхід', nl: 'Opnieuw aanmelden vereist' },
  not_started: { uk: 'Не розпочато', nl: 'Niet gestart' },
  in_progress: { uk: 'Триває', nl: 'Bezig' },
  complete: { uk: 'Завершено', nl: 'Voltooid' },
  failed: { uk: 'Не вдалося', nl: 'Mislukt' },
  cancelled: { uk: 'Скасовано', nl: 'Geannuleerd' },
  processing: { uk: 'Обробляється', nl: 'In verwerking' },
  grant_captured_mail_runtime_not_migrated: { uk: 'Дозвіл отримано; середовище пошти ще не перенесено', nl: 'Toestemming vastgelegd; mailruntime nog niet gemigreerd' },
  drive_grant_only_sync_not_started: { uk: 'Лише дозвіл Drive; синхронізацію не запущено', nl: 'Alleen Drive-toestemming; synchronisatie niet gestart' },
  grant_only_calendar_runtime_not_active: { uk: 'Лише дозвіл Календаря; середовище не активне', nl: 'Alleen agenda-toestemming; runtime niet actief' },
  // 20.10.2026: de agenda is tweerichtings geworden. De oude code blijft hierboven staan voor accounts die
  // nog niet opnieuw hebben toegestemd; nieuwe koppelingen krijgen deze.
  calendar_tweerichting_lezen_en_schrijven: { uk: 'Календар: читання й запис (події, учасники, відповіді)', nl: 'Agenda: lezen en schrijven (afspraken, gasten, antwoorden)' },
  active_tweerichting_sync_token_en_etag: { uk: 'Активно: двостороння синхронізація (syncToken) із контролем версій (etag)', nl: 'Actief: tweewegsynchronisatie (syncToken) met versiecontrole (etag)' },
  active_readonly_sync_token_projection: { uk: 'Активно: лише читання через syncToken', nl: 'Actief: alleen lezen via syncToken' },
  grant_only_photos_picker_runtime_not_active: { uk: 'Лише дозвіл Google Photos; вибір фото не активний', nl: 'Alleen Google Photos-toestemming; fotokiezer niet actief' }
};

/** Коротке пояснення технічного коду для локальної спливаючої підказки (UPD-007). */
export function termUitleg(lang: Lang, code: string): string {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  if (/\.manage$|\.read$/.test(code)) return t('Технічний код повноваження, який сервер перевіряє перед виконанням адміністративної дії.', 'Technische bevoegdheidscode die de server controleert vóór een beheeractie.');
  if (code.startsWith('owner.')) return t('Внутрішній код події журналу аудиту для звірки з незмінним записом на сервері.', 'Interne gebeurteniscode van het auditlogboek voor controle met de serverregistratie.');
  if (['owner', 'admin', 'member', 'viewer'].includes(code)) return t('Код рівня участі облікового запису в просторі, за яким діють правила доступу.', 'Code van het deelnameniveau in de ruimte waarop toegangsregels gelden.');
  if (['approved', 'pending', 'blocked', 'new', 'deleted', 'denied'].includes(code)) return t('Службовий стан облікового запису або звернення у базі даних.', 'Systeemstatus van het account of verzoek in de gegevensbank.');
  if (['google', 'microsoft', 'internal'].includes(code)) return t('Технічний ідентифікатор постачальника посвідчення або зовнішнього входу.', 'Technische aanduiding van de aanbieder voor aanmelding of identiteit.');
  if (['none', 'required', 'granted', 'not_granted'].includes(code)) return t('Стан дозволу на доступ до поштової скриньки, повернутий сервером.', 'Status van de postvaktoestemming zoals door de server teruggestuurd.');
  if (['connected', 'disconnected', 'not_configured', 'configured', 'missing', 'unverified', 'not_connected', 'reauth_required'].includes(code)) return t('Стан підключення зовнішньої служби або каталогу за даними перевірки.', 'Verbindingsstatus van de externe dienst of map volgens de controle.');
  if (['compliant', 'non_compliant', 'enforced', 'not_enforced', 'none_detected', 'detected', 'not_supported', 'unknown', 'mdm_not_connected', 'edr_not_connected'].includes(code) || /session_|tab_|browser_grant_|remembered_profile_|revoked|expired/.test(code)) {
    return t('Технічний стан сеансу, пристрою або перевірки відповідності політиці безпеки.', 'Technische status van de sessie, het apparaat of de beleidscontrole.');
  }
  if (/sync_token|grant_|calendar_|drive_/.test(code)) return t('Технічний стан синхронізації та дозволів підключеної служби.', 'Technische status van de synchronisatie en machtigingen van de gekoppelde dienst.');
  return t('Оригінальний технічний код, який повертає сервер для цього поля.', 'Oorspronkelijke technische code die de server voor dit veld teruggeeft.');
}

/** Підпис мовою сайту для технічного коду. Невідомий код повертається без змін. */
export const termLabel = (lang: Lang, raw: unknown): string => {
  const code = String(raw ?? '').trim();
  if (!code) return '';
  const hit = TERMS[code];
  return hit ? hit[lang] : code;
};

/** Чи маємо ми переклад для цього коду. */
export const termKnown = (raw: unknown) => Boolean(TERMS[String(raw ?? '').trim()]);

/**
 * Показує технічний код мовою сайту (UPD-007):
 * замість однієї спільної кнопки «Показати технічні коди» біля кожного значення є компактна піктограма,
 * при наведенні чи фокусі на яку відкривається спливаюче вікно з назвою, технічним кодом і поясненням.
 */
export function Term({ lang, raw, codes = false }: { lang: Lang; raw: unknown; codes?: boolean }): ReactNode {
  const code = String(raw ?? '').trim();
  if (!code) return null;
  const label = termLabel(lang, code);
  const known = termKnown(code);
  if (!known) return <code className='admin-term-code' title={code}>{code}</code>;
  const uitleg = termUitleg(lang, code);
  const infoLabel = lang === 'uk' ? `Технічний код: ${code}` : `Technische code: ${code}`;
  return (
    <span className='admin-term' data-tech-code={code} data-codes={codes ? 'ja' : undefined}>
      <span className='admin-term-tekst'>{label}</span>
      <span className='admin-term-info' tabIndex={0} role='note' aria-label={`${label} — ${infoLabel}. ${uitleg}`}>
        <Code2 aria-hidden='true' />
        <span className='admin-term-popover' role='tooltip'>
          <strong className='admin-term-popover-titel'>{label}</strong>
          <code className='admin-term-code'>{code}</code>
          <span className='admin-term-popover-uitleg'>{uitleg}</span>
        </span>
      </span>
      {codes ? <code className='admin-term-code'>{code}</code> : null}
    </span>
  );
}

/** Список кодів через роздільник (повноваження, дозволи тощо). */
export function TermList({ lang, values, codes = false }: { lang: Lang; values: unknown[]; codes?: boolean }): ReactNode {
  const items = (values || []).map(item => String(item ?? '').trim()).filter(Boolean);
  if (!items.length) return null;
  return (
    <span className='admin-term-list'>
      {items.map((item, index) => (
        <span key={item + String(index)}>
          {index > 0 ? ' · ' : ''}
          <Term lang={lang} raw={item} codes={codes} />
        </span>
      ))}
    </span>
  );
}

/** Підпис поля, де оригінальна назва потрібна для звірки з чужим інтерфейсом. */
export const fieldLabel = (lang: Lang, uk: string, nl: string, original: string) =>
  `${lang === 'uk' ? uk : nl} (${original})`;
