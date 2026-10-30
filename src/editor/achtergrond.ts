/** Фон листа з обгортки, не з першого чужого background (цитата, код). */
const HEX = '#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})';

function langHex(value: string): string {
  const raw = value.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(raw)) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  return raw;
}

export function leesBriefAchtergrond(value: string): string {
  const bron = String(value || '');
  const gemarkeerd = bron.match(new RegExp(`data-mail-bg=["'](${HEX})["']`, 'i'));
  if (gemarkeerd) return langHex(gemarkeerd[1]);
  const omhulsel = bron.match(new RegExp(`<div\\b[^>]*\\bstyle=["'][^"']*\\bbackground(?:-color)?:\\s*(${HEX})`, 'i'));
  if (omhulsel) return langHex(omhulsel[1]);
  return '#ffffff';
}
