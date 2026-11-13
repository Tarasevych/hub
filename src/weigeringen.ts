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
