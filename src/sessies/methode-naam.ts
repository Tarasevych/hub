// IDENTITEIT-015 (крок «aanmelden», давня вада): назва способу входу для бейджа сеансу («Сесії та пристрої»).
// Раніше все, крім passkey/пароля/TOTP, ставало «Google SSO» — і сеанс, відкритий через Telegram, виглядав як вхід через Google.
// Naam van de aanmeldweg voor de sessiebadge; vroeger werd alles behalve passkey/wachtwoord/TOTP «Google SSO» (ook Telegram).
export type MethodeIcoon = 'passkey' | 'password' | 'totp' | 'ander' | 'google';
export function methodeNaam(m: string | undefined | null): { icoon: MethodeIcoon; uk: string; nl: string } {
  switch (m) {
    case 'passkey': return { icoon: 'passkey', uk: 'Ключ доступу', nl: 'Toegangssleutel' };
    case 'password': return { icoon: 'password', uk: 'Пароль', nl: 'Wachtwoord' };
    case 'totp': return { icoon: 'totp', uk: 'Автентифікатор (2FA)', nl: 'Authenticator (2FA)' };
    case 'telegram': return { icoon: 'ander', uk: 'Telegram', nl: 'Telegram' };
    case 'microsoft': return { icoon: 'ander', uk: 'Microsoft', nl: 'Microsoft' };
    case 'discord': return { icoon: 'ander', uk: 'Discord', nl: 'Discord' };
    case 'apple': return { icoon: 'ander', uk: 'Apple', nl: 'Apple' };
    default: return { icoon: 'google', uk: 'Google SSO', nl: 'Google SSO' };
  }
}
