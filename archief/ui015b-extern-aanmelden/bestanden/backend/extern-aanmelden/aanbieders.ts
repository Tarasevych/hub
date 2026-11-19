// UI-015B (30.10.2026) — register van de externe aanmeldaanbieders (Microsoft, Apple, Discord, Telegram) in ÉÉN bestand.
//
// Hier staat per aanbieder: welke instellingen (geheimen) nodig zijn, de eindpunten, de scopes en de terug-URL. Andere code
// (backend/extern-aanmelden/stroom.ts, routes, snapshot) leest alleen dit register; er is geen tweede lijst.
//
// Geheimen komen alleen uit de omgeving (systemd EnvironmentFile /etc/mijn-ruimte/geheimen.env), zoals de andere sleutels.
// Dit bestand geeft NOOIT een waarde terug naar buiten: alleen «aanwezig / ontbreekt» en de NAMEN van ontbrekende instellingen.
//
// Status (contract /workspace/wp-ui015/CONTRACT-AANBIEDERS.md, shared/aanmeldmethoden-model.ts):
//   actief                 = er is een echte, actieve binding in de DB voor dit account én de aanbieder is bruikbaar;
//   gereed-om-te-koppelen  = vlag `aanmeldaanbieders-v1` AAN, beleid staat de methode toe én alle instellingen zijn aanwezig;
//   niet-geconfigureerd    = instellingen ontbreken (reden noemt welke, zonder waarden);
//   uitgeschakeld          = vlag UIT of beleid (beheer) zet de methode uit.
export const EXTERNE_AANBIEDERS = ['microsoft', 'apple', 'discord', 'telegram'] as const;
export type ExternAanbiederId = typeof EXTERNE_AANBIEDERS[number];
export const isExternAanbieder = (v: unknown): v is ExternAanbiederId => typeof v === 'string' && (EXTERNE_AANBIEDERS as readonly string[]).includes(v);

export const VLAG_AANBIEDERS = 'aanmeldaanbieders-v1';
export const TERUG_BASIS = () => String(process.env.AANMELD_TERUG_BASIS || 'https://id.tarasevych.com').replace(/\/+$/, '');
/** Terug-URL (redirect URI) die de eigenaar bij de aanbieder moet registreren. */
export const terugUrl = (id: ExternAanbiederId) => `${TERUG_BASIS()}/api/owner/identity/extern/${id}/terug`;

export type AanbiederDefinitie = {
  id: ExternAanbiederId;
  naam: string;
  soort: 'oidc' | 'oauth2' | 'telegram';
  /** Verplichte instellingen (env-namen). */
  instellingen: readonly string[];
  /** Optionele instellingen met standaardwaarde. */
  optioneel?: Readonly<Record<string, string>>;
  scopes: string;
  pkce: boolean;
};

export const REGISTER: Readonly<Record<ExternAanbiederId, AanbiederDefinitie>> = Object.freeze({
  microsoft: { id: 'microsoft', naam: 'Microsoft', soort: 'oidc', instellingen: ['AANMELD_MICROSOFT_CLIENT_ID', 'AANMELD_MICROSOFT_CLIENT_SECRET'], optioneel: { AANMELD_MICROSOFT_TENANT: 'common' }, scopes: 'openid email profile', pkce: true },
  apple: { id: 'apple', naam: 'Apple', soort: 'oidc', instellingen: ['AANMELD_APPLE_SERVICES_ID', 'AANMELD_APPLE_TEAM_ID', 'AANMELD_APPLE_KEY_ID', 'AANMELD_APPLE_PRIVATE_KEY'], scopes: 'name email', pkce: false },
  discord: { id: 'discord', naam: 'Discord', soort: 'oauth2', instellingen: ['AANMELD_DISCORD_CLIENT_ID', 'AANMELD_DISCORD_CLIENT_SECRET'], scopes: 'identify email', pkce: true },
  telegram: { id: 'telegram', naam: 'Telegram', soort: 'telegram', instellingen: ['AANMELD_TELEGRAM_BOT_TOKEN', 'AANMELD_TELEGRAM_BOT_NAAM'], scopes: '', pkce: false },
});

/** Leest een instelling (alleen intern gebruiken; nooit in een antwoord, log of melding zetten). */
export function instelling(naam: string): string {
  const def = Object.values(REGISTER).find((d) => d.instellingen.includes(naam) || (d.optioneel && naam in d.optioneel));
  if (!def) throw new Error('AANMELD_INSTELLING_ONBEKEND');
  const v = String(process.env[naam] ?? '').trim();
  return v || (def.optioneel?.[naam] ?? '');
}

/** Namen van ontbrekende verplichte instellingen (nooit waarden). Telegram: bot-token moet de vorm «<cijfers>:<tekens>» hebben. */
export function ontbrekend(id: ExternAanbiederId): string[] {
  const def = REGISTER[id];
  const mis = def.instellingen.filter((n) => !String(process.env[n] ?? '').trim());
  if (id === 'telegram' && !mis.includes('AANMELD_TELEGRAM_BOT_TOKEN') && !/^\d{3,20}:[A-Za-z0-9_-]{20,}$/.test(instelling('AANMELD_TELEGRAM_BOT_TOKEN'))) mis.push('AANMELD_TELEGRAM_BOT_TOKEN (ongeldige vorm)');
  if (id === 'apple' && !mis.includes('AANMELD_APPLE_PRIVATE_KEY') && !/BEGIN PRIVATE KEY/.test(instelling('AANMELD_APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'))) mis.push('AANMELD_APPLE_PRIVATE_KEY (geen PEM)');
  if (id === 'microsoft' && !/^(common|consumers|organizations|[0-9a-f-]{36})$/i.test(instelling('AANMELD_MICROSOFT_TENANT'))) mis.push('AANMELD_MICROSOFT_TENANT (ongeldig)');
  return mis;
}
export const volledigGeconfigureerd = (id: ExternAanbiederId) => ontbrekend(id).length === 0;

export type Reden = { uk: string; nl: string };
export type AanbiederStatus = 'actief' | 'gereed-om-te-koppelen' | 'niet-geconfigureerd' | 'uitgeschakeld' | 'onbekend';
export type AanbiederKaart = { id: ExternAanbiederId; status: AanbiederStatus; reden?: Reden; accountLabel?: string; gekoppeldOp?: string; actieKoppelUrl?: string; kanLosmaken: boolean; losmaakUrl?: string };

/**
 * Pure statusberekening (getest). `binding` = actieve binding van DIT account (uit identity_method_bindings_v1).
 * `laatsteMethode` = losmaken zou de laatste werkende aanmeldmethode weghalen (serverregel, zie toegangslaag.ts).
 */
export function statusVan(o: { id: ExternAanbiederId; vlagAan: boolean; beleidAan: boolean; ontbreekt: string[]; binding?: { email?: string; label?: string; createdAt?: number } | null; laatsteMethode: boolean }): AanbiederKaart {
  const naam = REGISTER[o.id].naam;
  const gebonden = o.binding ? { accountLabel: String(o.binding.label || o.binding.email || '').slice(0, 80) || undefined, gekoppeldOp: o.binding.createdAt ? new Date(o.binding.createdAt).toISOString() : undefined } : {};
  const losmaken = o.binding ? { kanLosmaken: !o.laatsteMethode, losmaakUrl: `/api/owner/access/aanbieders/${o.id}/losmaken` } : { kanLosmaken: false };
  if (!o.vlagAan) return { id: o.id, status: 'uitgeschakeld', reden: { uk: `Вхід через ${naam} поки вимкнено (перемикач «aanmeldaanbieders-v1» вимкнений).`, nl: `Aanmelden met ${naam} staat nog uit (vlag «aanmeldaanbieders-v1» staat uit).` }, ...gebonden, ...losmaken };
  if (!o.beleidAan) return { id: o.id, status: 'uitgeschakeld', reden: { uk: `Адміністратор вимкнув вхід через ${naam} у правилах входу.`, nl: `De beheerder zette aanmelden met ${naam} uit in het aanmeldbeleid.` }, ...gebonden, ...losmaken };
  if (o.ontbreekt.length) return { id: o.id, status: 'niet-geconfigureerd', reden: { uk: `Бракує налаштувань ${naam} на сервері: ${o.ontbreekt.join(', ')}.`, nl: `Instellingen voor ${naam} ontbreken op de server: ${o.ontbreekt.join(', ')}.` }, ...gebonden, ...losmaken };
  if (o.binding) return { id: o.id, status: 'actief', ...gebonden, ...losmaken };
  return { id: o.id, status: 'gereed-om-te-koppelen', actieKoppelUrl: `/api/owner/identity/extern/${o.id}/koppelen`, kanLosmaken: false };
}
