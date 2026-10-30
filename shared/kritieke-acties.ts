// Критичні дії (блок 4.2): свіжого входу Google недостатньо.
// Методи — ті, що вже є в сильному кроці (passkey, код застосунку, коди відновлення) і кодове слово.
// Кодове слово лишається окремою брамою (CODEWOORD_POORT / codewoordEis), цей список її не замінює.

export const KRITIEKE_METHODEN = ['passkey', 'app-code', 'herstelcode', 'codewoord'] as const;
export type KritiekeMethode = (typeof KRITIEKE_METHODEN)[number];

export type KritiekeActie = 'account-verwijderen' | 'aanmeldmethode' | 'herstelcodes' | 'ai-hoog';

export const KRITIEKE_ACTIES: Record<KritiekeActie, readonly KritiekeMethode[]> = {
  'account-verwijderen': KRITIEKE_METHODEN,
  aanmeldmethode: KRITIEKE_METHODEN,
  herstelcodes: KRITIEKE_METHODEN,
  'ai-hoog': KRITIEKE_METHODEN,
};

export const kritiekeActie = (id: string): id is KritiekeActie => Object.prototype.hasOwnProperty.call(KRITIEKE_ACTIES, id);

/** Google сам по собі ніколи не є методом критичної дії. */
export const googleAlleenVolstaat = (id: string): boolean => !kritiekeActie(id);

export const methodenVoor = (id: string): readonly KritiekeMethode[] => (kritiekeActie(id) ? KRITIEKE_ACTIES[id] : []);
