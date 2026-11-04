// Tweede factor bij het koppelen van een AI-connector.
// Alleen als het account die factor zelf aan heeft gezet (passkey, app-code, herstelcode, of later e-mail/sms-code).
// Zonder factor blokkeert koppelen niet: de site legt in de beveiligingssectie uit waarom aanzetten zin heeft.
// Puur.

export type Factoren = {
  passkey?: boolean;
  totp?: boolean;
  herstelcode?: boolean;
  email?: boolean;
  sms?: boolean;
};

export function factorVerplicht(m: Factoren | null | undefined): boolean {
  if (!m) return false;
  return !!(m.passkey || m.totp || m.herstelcode || m.email || m.sms);
}
