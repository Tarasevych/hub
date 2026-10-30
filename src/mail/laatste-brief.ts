/** Текст рядка «Останній лист» без теми (блок 2.3). Час — локальний, без вмісту листа. */
export function briefMoment(ms: number, lang: 'uk' | 'nl', now = Date.now()): string {
  if (!ms || !Number.isFinite(ms) || ms > now + 60_000) return '';
  const d = new Date(ms);
  const nu = new Date(now);
  const tijd = d.toLocaleTimeString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { hour: '2-digit', minute: '2-digit' });
  if (d.getFullYear() === nu.getFullYear() && d.getMonth() === nu.getMonth() && d.getDate() === nu.getDate()) {
    return `${lang === 'uk' ? 'сьогодні' : 'vandaag'} ${tijd}`;
  }
  const dag = Math.floor((now - ms) / 86_400_000);
  if (dag === 1) return lang === 'uk' ? 'вчора' : 'gisteren';
  if (dag > 1 && dag < 7) return lang === 'uk' ? `${dag} ${dag < 5 ? 'дні' : 'днів'} тому` : `${dag} dagen geleden`;
  return d.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: 'numeric', month: 'short' });
}

export function zojuist(ms: number, lang: 'uk' | 'nl', now = Date.now()): string {
  if (!ms || now - ms < 60_000) return lang === 'uk' ? 'щойно' : 'zojuist';
  return briefMoment(ms, lang, now);
}

export type LaatsteBrief = { latestReceivedAt: number; empty: boolean; checkedAt: number; errorCode: '' | 'REAUTH' | 'CHECK_FAILED' };

/** Рядок під адресою. Порожній рядок = ще немає відповіді. */
export function laatsteRegel(lang: 'uk' | 'nl', rij: LaatsteBrief | undefined, now = Date.now()): string {
  if (!rij) return '';
  const uk = lang === 'uk';
  if (rij.errorCode === 'REAUTH') return uk ? 'Потрібен повторний вхід' : 'Opnieuw aanmelden nodig';
  if (rij.errorCode) return uk ? 'Не вдалося перевірити' : 'Controleren mislukt';
  const gecheckt = zojuist(rij.checkedAt, lang, now);
  if (rij.empty || !rij.latestReceivedAt) return uk ? `Вхідні порожні · перевірено ${gecheckt}` : `Postvak IN is leeg · gecontroleerd ${gecheckt}`;
  const wanneer = briefMoment(rij.latestReceivedAt, lang, now);
  return uk ? `Останній лист: ${wanneer} · перевірено ${gecheckt}` : `Laatste bericht: ${wanneer} · gecontroleerd ${gecheckt}`;
}
