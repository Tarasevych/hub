// Kluis-terugval voor de Google OAuth-client (Майстер підключень, 20.10.2026).
//
// Tot nu toe kon de Google-client (client id + secret) ALLEEN uit /etc/mijn-ruimte/geheimen.env komen: root schrijft het bestand,
// de dienst herstart. Dat blijft de voorkeursweg en env WINT altijd. Maar de eigenaar wil «één veld, één knop»: hier staat de
// terugval — staat er in env niets, dan leest de server client id + secret uit de versleutelde kluis van de EIGENAAR (doel
// «google», AES-256-GCM met OWNER_VAULT_ENCRYPTION_KEY_V1, opslaan alleen met passkey/TOTP). Geen herstart nodig.
//
// Veiligheid en eerlijkheid:
//  - de lezing loopt als systeem (alsSysteem): de Google-flow van een GEWONE gebruiker heeft de client van de eigenaar nodig,
//    en onder diens RLS zou de kluis van de eigenaar onzichtbaar zijn;
//  - alleen een item van de eigenaar (OWNER_EMAIL → users) telt; items van andere accounts worden nooit gelezen;
//  - de waarde komt nooit verder dan resolveGoogleContour(); er is geen route die haar teruggeeft;
//  - korte cache (30 s) zodat access-plane (die het contour per verzoek opvraagt) de database niet bij elk verzoek raakt;
//    de wizard wist de cache na een wijziging (kluisCacheWissen).
import { getPool } from '../server/platform/pg';
import { alsSysteem } from '../server/platform/context';
import { ownerEmail } from '../server/platform';
import { leesGoogleKluis } from '../shared/integraties-wizard';

const CACHE_MS = 30_000;
let eigenaarCache: { id: string; tot: number } | null = null;
let googleCache: { waarde: { clientId: string; clientSecret: string } | 'onleesbaar' | null; tot: number } | null = null;

/** Alleen voor tests: eigenaar en kluis vervangen. */
type Deps = { eigenaarId?: () => Promise<string>; kluisRijen?: (userId: string) => Promise<Array<{ keyName: string; purpose: string }>>; kluisWaarde?: (userId: string, keyName: string, purpose: string) => Promise<string> };
let deps: Deps = {};
export const setIntegratiesKluis = (d: Deps | null) => { deps = d ?? {}; kluisCacheWissen(); };
export const kluisCacheWissen = () => { eigenaarCache = null; googleCache = null; };

/** De gebruikers-id van de eigenaar (OWNER_EMAIL), of '' als die (nog) geen account heeft. */
export async function eigenaarUserId(nu = Date.now()): Promise<string> {
  if (deps.eigenaarId) return deps.eigenaarId();
  if (eigenaarCache && eigenaarCache.tot > nu) return eigenaarCache.id;
  const email = ownerEmail();
  if (!email) return '';
  try {
    const { rows } = await getPool('systeem').query(`SELECT id FROM app.records WHERE tbl = 'users' AND lower(data->>'email') = $1 ORDER BY created_at ASC LIMIT 1`, [email]);
    const id = rows[0] ? String(rows[0].id) : '';
    eigenaarCache = { id, tot: nu + CACHE_MS };
    return id;
  } catch { return ''; }
}

async function rijen(userId: string) {
  if (deps.kluisRijen) return deps.kluisRijen(userId);
  const m = await import('./api-platform-kluis');
  return alsSysteem(() => m.apiPlatformVaultItems(userId)) as unknown as Promise<Array<{ keyName: string; purpose: string }>>;
}
async function waarde(userId: string, keyName: string, purpose: string) {
  if (deps.kluisWaarde) return deps.kluisWaarde(userId, keyName, purpose);
  const m = await import('./api-platform-kluis');
  return alsSysteem(() => m.readOwnerVaultPlaintext(userId, keyName, purpose as never));
}

/**
 * De Google-client uit de kluis van de eigenaar. `null` = niets met doel «google»; `'onleesbaar'` = er staat wel iets, maar het
 * zijn geen client id + secret (de wizard toont dat verschil, zodat niemand naar een lege knop staart).
 */
export async function googleClientUitKluis(nu = Date.now()): Promise<{ clientId: string; clientSecret: string } | 'onleesbaar' | null> {
  if (googleCache && googleCache.tot > nu) return googleCache.waarde;
  let uit: { clientId: string; clientSecret: string } | 'onleesbaar' | null = null;
  try {
    const eigenaar = await eigenaarUserId(nu);
    if (eigenaar) {
      const rij = (await rijen(eigenaar)).find((r) => r.purpose === 'google');
      if (rij) uit = leesGoogleKluis(await waarde(eigenaar, rij.keyName, 'google')) ?? 'onleesbaar';
    }
  } catch { uit = null; }
  googleCache = { waarde: uit, tot: nu + CACHE_MS };
  return uit;
}
