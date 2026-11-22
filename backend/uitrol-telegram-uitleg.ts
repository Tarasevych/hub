// Пояснення до випуску для публікації в Telegram: двомовний текст із UITROL-MANIFEST.json.
// Release-uitleg voor publicatie in Telegram: tweetalige tekst uit UITROL-MANIFEST.json.
// Окремий модуль без залежностей від бази даних, щоб його можна було перевіряти модульним тестом.
import type { ReleaseInfo } from './uitgave-info';

const MAX_TEKST = 3900; // Telegram: 4096 символів на повідомлення; лишаємо запас
const MAX_PUNTEN = 5;
const MAX_PUNT_LENGTE = 280;

const schoon = (v: unknown, max = MAX_PUNT_LENGTE): string =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const lijst = (waarden: unknown, max = MAX_PUNTEN): string[] =>
  (Array.isArray(waarden) ? waarden : [])
    .map((w) => schoon(w))
    .filter(Boolean)
    .slice(0, max);

const sectie = (kop: string, punten: string[]): string[] =>
  punten.length ? ['', kop, ...punten.map((p) => `• ${p}`)] : [];

/**
 * Складає пояснення до випуску двома мовами (UK + NL) з опису манифесту.
 * Повертає порожній рядок, якщо манифест не містить опису — тоді публікувати нічого.
 */
export function bouwUitgaveUitleg(info: ReleaseInfo): string {
  const m = info.manifest;
  const uk = m?.beschrijving?.uk;
  const nl = m?.beschrijving?.nl;
  if (!m || !uk?.samenvatting || !nl?.samenvatting) return '';

  const versie = schoon(m.versie || info.versie || '', 40);
  const regels: string[] = [
    `📦 Mijn Ruimte · випуск ${versie || '—'}`,
    `📦 Mijn Ruimte · uitgave ${versie || '—'}`,
    '',
    `🇺🇦 ${schoon(uk.titel, 120)}`,
    schoon(uk.samenvatting, 700),
    '',
    `🇳🇱 ${schoon(nl.titel, 120)}`,
    schoon(nl.samenvatting, 700),
  ];

  regels.push(...sectie('📝 Зміни / Wijzigingen', lijst(uk.wijzigingen)));
  regels.push(...sectie('🔧 Виправлення / Fixes', lijst(uk.fixes)));
  regels.push(...sectie('⚠️ Обмеження / Beperkingen', lijst(uk.beperkingen)));

  const instructiesUk = schoon(uk.instructies, 500);
  const instructiesNl = schoon(nl.instructies, 500);
  if (instructiesUk || instructiesNl) {
    regels.push('', '▶️ Далі / Instructies');
    if (instructiesUk) regels.push(`🇺🇦 ${instructiesUk}`);
    if (instructiesNl) regels.push(`🇳🇱 ${instructiesNl}`);
  }

  regels.push('', `🔗 https://${process.env.ADMIN_HOST || 'admin.tarasevych.com'}/updates`);
  const commit = schoon(info.releaseCommit || info.commit || '', 12);
  if (commit) regels.push(`• Фіксація / Vastlegging: ${commit}`);
  const auteur = schoon(info.auteur || '', 80);
  if (auteur) regels.push(`• Автор / Auteur: ${auteur}`);

  return regels.join('\n').slice(0, MAX_TEKST);
}
