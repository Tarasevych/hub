// ============================================================================
// ENIGE BRON voor de identiteit van deze deployment (zelf gehost).
//
// APP_ID stamt uit de AppDeploy-tijd en blijft alleen bestaan als deel van de cookienamen
// (wijzigen = iedereen opnieuw aanmelden). De technische AppDeploy-host en alle
// "technische"/QA-codepaden zijn verwijderd; de server bedient alleen de hostnamen hieronder.
//
// Dit bestand wordt ook in de frontend gebundeld: geen process.env of Node-API's gebruiken.
// ============================================================================
export const APP_ID = 'migrated-bg2v4h';

/** Publiek domein waaronder alle diensten draaien. */
export const PUBLIC_DOMAIN = 'tarasevych.com';

/** Hostnamen die de app (SPA + same-origin /api) bedient. */
export const SERVICE_HOSTS = {
  hub: `hub.${PUBLIC_DOMAIN}`,
  identity: `id.${PUBLIC_DOMAIN}`,
  ai: `ai.${PUBLIC_DOMAIN}`,
  mail: `mail.${PUBLIC_DOMAIN}`,
  cloud: `cloud.${PUBLIC_DOMAIN}`,
  github: `github.${PUBLIC_DOMAIN}`,
  huis: `huis.${PUBLIC_DOMAIN}`,
  api: `api.${PUBLIC_DOMAIN}`,
  admin: `admin.${PUBLIC_DOMAIN}`,
  mcp: `mcp.${PUBLIC_DOMAIN}`,
} as const;

/** Losse statische dashboard-site (geen API, geen sessie); wordt later gevuld. */
export const DASHBOARD_HOST = `dashboard.${PUBLIC_DOMAIN}`;

// Cookies: de API is nu same-origin op elke host. Eén aanmelding geldt voor alle
// *.tarasevych.com-subdomeinen via Domain=.tarasevych.com (vervangt de vroegere
// SameSite=None; Partitioned-cookies op de AppDeploy-API-host). Alle sessie-, grant- en
// tabcookies delen zo één "cookie-jar", net als vroeger op de ene API-host; daardoor blijven
// meerdere gebruikers, meerdere accounts per browser en accountwissel ongewijzigd werken.
export const COOKIE_DOMAIN = `.${PUBLIC_DOMAIN}`;
/** Pad + domein voor alle app-cookies. */
export const COOKIE_SCOPE = `Domain=${COOKIE_DOMAIN}; Path=/`;
/** Vroeger `/app/<APP_ID>/` (AppDeploy-API-pad); nu het hele domein. */
export const API_COOKIE_PATH = '/';
export const ECOSYSTEM_COOKIE = `__Secure-tsv_ecosystem_${APP_ID}`;
export const REDIRECT_COOKIE = `__Secure-tsv_redirect_${APP_ID}`;
