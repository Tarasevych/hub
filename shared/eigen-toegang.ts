// IDENTITEIT-012: одна умова доступу до власних налаштувань входу й захисту (площина доступу, ключі доступу, сховище ключів,
// прив'язка зовнішніх способів входу). Раніше площина доступу вимагала «approved» навіть від власника, а решта пропускала власника
// з будь-яким статусом. Тепер скрізь однаково: схвалений обліковий запис або власник сайту.
// Eén voorwaarde voor de eigen aanmeld- en beveiligingsinstellingen: goedgekeurd account of de eigenaar van de site.
export const magEigenToegang = (user: { status?: string; role?: string } | null | undefined): boolean =>
  !!user && (user.status === 'approved' || user.role === 'owner');
