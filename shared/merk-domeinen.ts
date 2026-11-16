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
});
export const MERK_DOMEINEN: ReadonlySet<string> = new Set(Object.values(MERK_DOMEIN));
