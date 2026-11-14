// SEC-002 (post-11): «Скасувати підписку» відкривало адресу з заголовка List-Unsubscribe листа, не показавши її.
// Тепер підтвердження завжди називає ціль (домен сторінки або адресу mailto:) і попереджає знаком «!», коли вона
// не належить організаційному домену відправника (ознаку обчислює сервер: externalHost / externalSenderMatch).
// Zonder doel (oude server, onleesbare link) wordt de host hier zelf uit de link gehaald; zonder host wordt niets geopend.

export type AfmeldAntwoord = { externalUrl?: unknown; externalHost?: unknown; externalSenderMatch?: unknown; mode?: unknown };

/** Host (https) of adres (mailto) van het afmelddoel; '' als de link geen https:/mailto: is of niet te lezen. */
export function afmeldDoelHost(url: string, opgegeven?: unknown): string {
  const gegeven = String(opgegeven || '').trim().toLowerCase().slice(0, 320);
  try {
    const doel = new URL(url);
    if (doel.protocol === 'https:') return gegeven || doel.hostname.toLowerCase();
    if (doel.protocol === 'mailto:') return gegeven || decodeURIComponent(doel.pathname.split(',')[0] || '').trim().toLowerCase().slice(0, 320);
  } catch { /* geen geldige link */ }
  return '';
}

/**
 * Tekst voor de bevestiging vóór het openen. Toont altijd het doel; bij een ander domein dan de afzender een
 * waarschuwing met «!» en uitleg van het risico. Geeft '' als er niets veilig te openen is.
 */
export function afmeldBevestiging(lang: 'uk' | 'nl', antwoord: AfmeldAntwoord): { tekst: string; url: string; vreemd: boolean } {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const url = String(antwoord.externalUrl || '');
  const host = afmeldDoelHost(url, antwoord.externalHost);
  if (!url || !host) return { tekst: '', url: '', vreemd: false };
  const email = /^mailto:/i.test(url);
  const vreemd = antwoord.externalSenderMatch !== true;
  const doel = email
    ? t(`Буде створено лист на адресу: ${host}`, `Er wordt een e-mail aangemaakt aan: ${host}`)
    : t(`Буде відкрито сторінку на сайті: ${host}`, `Er wordt een pagina geopend op de site: ${host}`);
  const waarschuwing = vreemd
    ? t(`\n\n! ${email ? 'Ця адреса' : 'Цей сайт'} не належить домену відправника листа. Шахраї так ведуть на підроблені сторінки входу. Не вводьте там паролів і платіжних даних.`,
      `\n\n! Dit ${email ? 'adres' : 'domein'} hoort niet bij het domein van de afzender. Oplichters sturen zo naar nagemaakte inlogpagina's. Vul daar geen wachtwoorden of betaalgegevens in.`)
    : '';
  const vraag = email
    ? t('Підписку ще не скасовано. Відкрити поштову програму?', 'De afmelding is nog niet voltooid. De e-mailapp openen?')
    : t('Підписку ще не скасовано. Відкрити сторінку відправника?', 'De afmelding is nog niet voltooid. De pagina van de afzender openen?');
  return { tekst: `${doel}${waarschuwing}\n\n${vraag}`, url, vreemd };
}
