// TELEGRAM-AANMELDEN v1 — sterktecontrole van de «таємний код» (geheime code). Puur, ook in de browser (directe uitleg)
// en opnieuw op de server (die beslist). Wat geweigerd wordt, met de reden in mensentaal:
//  - te kort of te lang (grenzen van de beheerder, 6–12);
//  - één teken herhaald (111111, aaaaaa) of een kort herhaald patroon (121212, abcabc);
//  - oplopende of aflopende reeksen (123456, 654321, abcdef, qwerty-rijen);
//  - datumpatronen (01011990, 1990-01-01, 19900101, 010190);
//  - cijfers uit het eigen telefoonnummer (≥ 4 opeenvolgende);
//  - een lijst van veelgebruikte codes.
import type { Tekst } from './model';

export type CodeReden = 'LENGTE' | 'HERHALING' | 'REEKS' | 'DATUM' | 'TELEFOON' | 'VEELGEBRUIKT' | 'TEKENS';
export const CODE_REDENEN: Record<CodeReden, Tekst> = {
  LENGTE: ['Код має бути від {min} до {max} символів.', 'De code moet {min} tot {max} tekens lang zijn.'],
  HERHALING: ['Код складається з повторів (наприклад 111111 чи 121212). Такий легко вгадати.', 'De code bestaat uit herhalingen (bijv. 111111 of 121212). Die is makkelijk te raden.'],
  REEKS: ['Код — це послідовність (наприклад 123456 чи abcdef). Такий легко вгадати.', 'De code is een reeks (bijv. 123456 of abcdef). Die is makkelijk te raden.'],
  DATUM: ['Код схожий на дату (наприклад день народження). Дати легко дізнатися.', 'De code lijkt op een datum (bijv. een verjaardag). Datums zijn makkelijk te achterhalen.'],
  TELEFOON: ['Код містить цифри з вашого номера телефону.', 'De code bevat cijfers uit uw telefoonnummer.'],
  VEELGEBRUIKT: ['Цей код є в списку найпоширеніших. Оберіть інший.', 'Deze code staat in de lijst van meest gebruikte codes. Kies een andere.'],
  TEKENS: ['Код може містити лише літери, цифри та звичайні знаки, без пробілів.', 'De code mag alleen letters, cijfers en gewone tekens bevatten, zonder spaties.'],
};

const VEELGEBRUIKT = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890', '000000', '111111', '121212', '123123', '654321', '666666', '696969',
  '112233', '159753', '147258', '147258369', '987654', '987654321', '123321', '777777', '888888', '999999', '555555', '131313',
  'qwerty', 'qwertz', 'azerty', 'qwerty123', 'password', 'wachtwoord', 'passw0rd', 'iloveyou', 'admin123', 'letmein', 'welkom',
  'welkom01', 'abc123', 'abcdef', 'abcd1234', 'a1b2c3', 'zaq12wsx', '1q2w3e', '1q2w3e4r', 'qazwsx', 'monkey', 'dragon', 'master',
  'sunshine', 'princess', 'football', 'baseball', 'shadow', 'superman', 'trustno1', 'hello123', 'secret', 'geheim', 'пароль',
  'йцукен', 'привіт', 'qwe123', '123qwe', '11111111', '00000000', '12341234', '11223344', '20202020', '19191919', '7777777',
]);
const RIJEN = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'abcdefghijklmnopqrstuvwxyz', 'йцукенгшщзхї', 'фівапролджє', 'ячсмитьбю', 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя'];

function isReeks(s: string): boolean {
  const l = s.toLowerCase();
  for (const rij of RIJEN) {
    const terug = [...rij].reverse().join('');
    if (rij.includes(l) || terug.includes(l)) return true;
  }
  // rekenkundige reeks van tekencodes (stap ±1 of ±2), ook buiten de rijen
  const c = [...l].map((x) => x.codePointAt(0) || 0);
  const stap = c[1] - c[0];
  return Math.abs(stap) >= 1 && Math.abs(stap) <= 2 && c.every((v, i) => i === 0 || v - c[i - 1] === stap);
}
function isHerhaling(s: string): boolean {
  if (new Set(s).size <= 2 && s.length >= 6) return true;
  for (let p = 1; p <= Math.floor(s.length / 2); p++) {
    if (s.length % p !== 0) continue;
    if (s.slice(0, p).repeat(s.length / p) === s) return true;
  }
  return false;
}
function isDatum(s: string): boolean {
  const d = s.replace(/[./\-\s]/g, '');
  if (!/^\d{6}$|^\d{8}$/.test(d)) return false;
  const geldigDM = (dd: number, mm: number) => dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12;
  if (d.length === 8) {
    const jaarVoor = Number(d.slice(0, 4)), jaarAchter = Number(d.slice(4));
    if (jaarVoor >= 1900 && jaarVoor <= 2099 && geldigDM(Number(d.slice(6, 8)), Number(d.slice(4, 6)))) return true;
    if (jaarAchter >= 1900 && jaarAchter <= 2099 && (geldigDM(Number(d.slice(0, 2)), Number(d.slice(2, 4))) || geldigDM(Number(d.slice(2, 4)), Number(d.slice(0, 2))))) return true;
    return false;
  }
  return geldigDM(Number(d.slice(0, 2)), Number(d.slice(2, 4))) || geldigDM(Number(d.slice(2, 4)), Number(d.slice(0, 2))) || geldigDM(Number(d.slice(4, 6)), Number(d.slice(2, 4)));
}
function bevatTelefoon(s: string, telefoon: string): boolean {
  const cijfers = String(telefoon || '').replace(/\D/g, '');
  const codeCijfers = s.replace(/\D/g, '');
  if (cijfers.length < 4 || codeCijfers.length < 4) return false;
  for (let i = 0; i + 4 <= codeCijfers.length; i++) if (cijfers.includes(codeCijfers.slice(i, i + 4))) return true;
  return false;
}

export function codeZwakte(code: string, opties: { min: number; max: number; telefoon?: string }): CodeReden | null {
  const s = String(code ?? '');
  if ([...s].length < opties.min || [...s].length > opties.max) return 'LENGTE';
  if (!/^[\p{L}\p{N}!#$%&*+\-./:;=?@^_~]+$/u.test(s)) return 'TEKENS';
  if (VEELGEBRUIKT.has(s.toLowerCase())) return 'VEELGEBRUIKT';
  if (isHerhaling(s.toLowerCase())) return 'HERHALING';
  if (isReeks(s)) return 'REEKS';
  if (isDatum(s)) return 'DATUM';
  if (opties.telefoon && bevatTelefoon(s, opties.telefoon)) return 'TELEFOON';
  return null;
}

export const codeRedenTekst = (r: CodeReden, taal: 'uk' | 'nl', min: number, max: number): string =>
  CODE_REDENEN[r][taal === 'nl' ? 1 : 0].replace('{min}', String(min)).replace('{max}', String(max));

/** Lijkt een chatbericht op een code of wachtwoord? Dan verwijdert de bot het en vraagt een nieuwe code (punt A.4). */
export function lijktOpGeheim(tekst: string, bekendeHash?: (kandidaat: string) => boolean): boolean {
  const t = String(tekst || '').trim();
  if (!t || t.startsWith('/')) return false;
  if (bekendeHash) for (const woord of t.split(/\s+/)) if (woord.length >= 6 && woord.length <= 12 && bekendeHash(woord)) return true;
  if (/(пароль|таємн\S* код|wachtwoord|geheime code|pin|код доступу)\s*[:=]?\s*\S{4,}/iu.test(t)) return true;
  // één los «woord» van 6–12 tekens met cijfers én letters of alleen cijfers: typisch een code
  return /^\S{6,12}$/u.test(t) && (/^\d{6,12}$/.test(t) || (/\d/.test(t) && /\p{L}/u.test(t)));
}
