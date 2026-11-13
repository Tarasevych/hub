// SEC-002 (post-11): «Скасувати підписку» відкривала адресу із заголовка List-Unsubscribe листа (її пише ВІДПРАВНИК), показавши лише
// загальне запитання без адреси. Фішинговий лист міг так привести користувача з довіреного розділу на підроблену сторінку входу.
// Тут: одне місце, що з адреси робить запитання ІЗ ЦІЛЛЮ переходу (вузол сайту або поштова адреса) і попередженням «!», якщо ціль
// не належить домену відправника. Усе інше, крім https: і mailto:, не відкривається взагалі.
//
// NL: de afmeldlink komt uit de kopregel List-Unsubscribe (geschreven door de afzender). De vraag toont nu het doel en waarschuwt
// als dat niet bij het domein van de afzender hoort. Alleen https: en mailto: worden geopend.

export type AfmeldDoel = { soort: 'web' | 'mail'; doel: string; url: string };

/** Ціль переходу: вузол (для https, у punycode — без підміни схожими літерами) або адреса (для mailto). null = не відкривати. */
export function afmeldDoelVan(ruw: unknown): AfmeldDoel | null {
  const tekst = String(ruw || '').trim();
  if (!tekst || tekst.length > 2000) return null;
  let url: URL;
  try { url = new URL(tekst); } catch { return null; }
  if (url.protocol === 'https:' && url.hostname && !url.username && !url.password) return { soort: 'web', doel: url.hostname.toLowerCase(), url: url.toString() };
  if (url.protocol === 'mailto:') {
    let adres = '';
    try { adres = decodeURIComponent(url.pathname.split(',')[0] || '').trim().toLowerCase(); } catch { return null; }
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(adres) ? { soort: 'mail', doel: adres, url: url.toString() } : null;
  }
  return null;
}

/**
 * Текст підтвердження з ціллю. `afzenderKlopt` — відповідь сервера (externalSenderMatch): чи належить ціль домену відправника.
 * null = адресу відкривати не можна (не https/mailto або нерозбірлива).
 */
export function afmeldVraag(lang: 'uk' | 'nl', ruw: unknown, afzenderKlopt: boolean): { vraag: string; doel: AfmeldDoel } | null {
  const doel = afmeldDoelVan(ruw);
  if (!doel) return null;
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const kort = doel.url.length > 160 ? `${doel.url.slice(0, 160)}…` : doel.url;
  const waarschuwing = afzenderKlopt ? '' : doel.soort === 'web'
    ? t('! Увага: цей сайт не належить домену відправника листа. Якщо не впізнаєте адресу — не відкривайте; не вводьте там пароль чи платіжні дані.\n\n',
      '! Let op: deze website hoort niet bij het domein van de afzender. Herkent u het adres niet, open het dan niet; vul daar geen wachtwoord of betaalgegevens in.\n\n')
    : t('! Увага: ця адреса не належить домену відправника листа. Лист на неї покаже отримувачеві вашу адресу.\n\n',
      '! Let op: dit adres hoort niet bij het domein van de afzender. Een bericht daarheen toont de ontvanger uw adres.\n\n');
  const vraag = doel.soort === 'web'
    ? t(`Щоб скасувати підписку, потрібно відкрити сторінку відправника:\n\n${doel.doel}\n${kort}\n\n${waarschuwing}Підписку ще не скасовано. Відкрити цю адресу в новій вкладці?`,
      `Om af te melden moet de pagina van de afzender worden geopend:\n\n${doel.doel}\n${kort}\n\n${waarschuwing}De afmelding is nog niet voltooid. Dit adres in een nieuw tabblad openen?`)
    : t(`Щоб скасувати підписку, потрібно надіслати лист на адресу:\n\n${doel.doel}\n\n${waarschuwing}Підписку ще не скасовано. Відкрити поштову програму з цим листом?`,
      `Om af te melden moet een bericht worden gestuurd naar:\n\n${doel.doel}\n\n${waarschuwing}De afmelding is nog niet voltooid. De e-mailapp met dit bericht openen?`);
  return { vraag, doel };
}
