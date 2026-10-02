import type { ReactNode } from 'react';

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
  'owner.identity.workspace.restored': { uk: 'Простір відновлено', nl: 'Werkruimte hersteld' }
};

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
 * Показує технічний код мовою сайту.
 * Оригінал завжди доступний у підказці (title), а коли увімкнено «технічні коди» —
 * ще й поруч, щоб адміністратор бачив рівно те, що повертає система.
 */
export function Term({ lang, raw, codes = false }: { lang: Lang; raw: unknown; codes?: boolean }): ReactNode {
  const code = String(raw ?? '').trim();
  if (!code) return null;
  const label = termLabel(lang, code);
  const known = termKnown(code);
  if (!known) return <code className='admin-term-code' title={code}>{code}</code>;
  return (
    <span className='admin-term' title={code}>
      {label}
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
