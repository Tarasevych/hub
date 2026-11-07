// IDENTITY-002 · один екран для 12 сторінок категорії `identity`.
// Перелік ідентичний shared/menu-model.ts:23 і public/canonical-service.js:6; порядок — як у меню.
export type IdentiteitTab =
  | 'personalization' | 'menu' | 'themes' | 'languages' | 'widgets' | 'sharing'
  | 'identity' | 'account' | 'sessions' | 'methods' | 'security' | 'recovery';

export type IdentiteitTabTitel = { id: IdentiteitTab; uk: string; nl: string };

export const IDENTITEIT_TABS: readonly IdentiteitTabTitel[] = [
  { id: 'personalization', uk: 'Персоналізація', nl: 'Personalisatie' },
  { id: 'menu', uk: 'Меню', nl: 'Menu' },
  { id: 'themes', uk: 'Теми', nl: 'Thema’s' },
  { id: 'languages', uk: 'Мови', nl: 'Talen' },
  { id: 'widgets', uk: 'Віджети', nl: 'Widgets' },
  { id: 'sharing', uk: 'Спільний доступ', nl: 'Delen' },
  { id: 'identity', uk: 'Ідентичності', nl: 'Identiteiten' },
  { id: 'account', uk: 'Акаунт і дані', nl: 'Account en gegevens' },
  { id: 'sessions', uk: 'Сесії та пристрої', nl: 'Sessies en apparaten' },
  { id: 'methods', uk: 'Способи входу', nl: 'Aanmeldmethoden' },
  { id: 'security', uk: 'Безпека', nl: 'Beveiliging' },
  { id: 'recovery', uk: 'Відновлення доступу', nl: 'Toegangsherstel' },
];

export const isIdentiteitTab = (id: string): id is IdentiteitTab =>
  IDENTITEIT_TABS.some((t) => t.id === id);

/** Заголовок секції мовою інтерфейсу; невідомий id не вигадує текст, а повертає сам id. */
export const identiteitTitel = (id: string, lang: 'uk' | 'nl'): string => {
  const tab = IDENTITEIT_TABS.find((t) => t.id === id);
  return tab ? tab[lang] : id;
};
