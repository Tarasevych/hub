// Merken zonder officieel bestand in een open pakket én zonder vorm met herkomst (21.10.2026): hun logo haalt de SERVER van het
// eigen domein van de dienst (BIMI of de website) en bewaart het in app.merk_beeld (backend/merk-bron.ts). Eén lijst voor de browser
// (src/merk/merk-register.ts → merkLaag 'database') en de server (POST /api/owner/merk-beeld haalt alleen deze domeinen op).
// Puur: geen imports, geen DOM.
export const MERK_DOMEIN: Readonly<Record<string, string>> = Object.freeze({
  ukrnet: 'ukr.net', iua: 'i.ua', onlineua: 'online.ua',
  microsoftentra: 'entra.microsoft.com', fastmail: 'fastmail.com', freshdesk: 'freshdesk.com', mollie: 'mollie.com', tuya: 'tuya.com',
  // AutoClaw (16.11.2026): справжній знак уже лежить у вбудованій базі (src/merk/officieel/autoclaw.png, з власного сайту виробника);
  // домен тут — щоб джерело було перевірюване й щоб сервер міг оновити знак. NL: het echte beeldmerk staat al in de ingebouwde basis.
  autoclaw: 'autoclaw.z.ai', windsurf: 'windsurf.com', opencode: 'opencode.ai', cline: 'cline.bot',
  // Copilot: знак лежить на домені статичних файлів GitHub (github.githubassets.com/favicons/). NL: het assetdomein van GitHub.
  copilot: 'githubassets.com',
  // Microsoft Copilot (16.11.2026): de kleurige strik komt van het CDN waar copilot.com zelf naar verwijst (res.cdn.office.net).
  mscopilot: 'cdn.office.net',
});
/** REESTR-LOGO-001 (16.11.2026): het eigen domein van merken waarvan het OFFICIËLE bestand van de website van de dienst komt (en niet
 *  uit de merkendatabase): de test merk-officieel-20261021 eist dat bronUrl (of de pagina die het bestand toont) op dit domein staat. */
export const MERK_SITE_DOMEIN: Readonly<Record<string, string>> = Object.freeze({
  honor: 'honor.com', huawei: 'huawei.com', pcloud: 'pcloud.com', colornote: 'colornote.com', freshdesk: 'freshworks.com', microsoftentra: 'microsoft.com',
  // PLAATS-TEKENS-001 (17.11.2026): providers, Xiaomi en het passkey-teken van de FIDO Alliance, elk van de eigen website.
  proximus: 'proximus.com', telenet: 'telenet.be', voo: 'voo.be', kpn: 'kpn.com', odido: 'odido.nl', ukrtelecom: 'ukrtelecom.ua', xiaomi: 'mi.com',
  passkey: 'fidoalliance.org', starlink: 'starlink.com',
});
export const MERK_DOMEINEN: ReadonlySet<string> = new Set(Object.values(MERK_DOMEIN));
