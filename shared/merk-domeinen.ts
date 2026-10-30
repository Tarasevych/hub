// Merken zonder officieel bestand in een open pakket én zonder vorm met herkomst (21.10.2026): hun logo haalt de SERVER van het
// eigen domein van de dienst (BIMI of de website) en bewaart het in app.merk_beeld (backend/merk-bron.ts). Eén lijst voor de browser
// (src/merk/merk-register.ts → merkLaag 'database') en de server (POST /api/owner/merk-beeld haalt alleen deze domeinen op).
// Puur: geen imports, geen DOM.
export const MERK_DOMEIN: Readonly<Record<string, string>> = Object.freeze({
  ukrnet: 'ukr.net', iua: 'i.ua', onlineua: 'online.ua',
  microsoftentra: 'entra.microsoft.com', fastmail: 'fastmail.com', freshdesk: 'freshdesk.com', mollie: 'mollie.com', tuya: 'tuya.com',
});
export const MERK_DOMEINEN: ReadonlySet<string> = new Set(Object.values(MERK_DOMEIN));
