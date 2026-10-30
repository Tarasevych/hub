// UI-013 fase 2 — cloud-vnext leest uit het gedeelde integratieregister (shared/integraties-register.ts).
// Koppeling aanbieder-id (cloud-vnext-model) → register-id. Geen eigen kopie van de gereedheid: alleen deze tabel.
// Gebruikt achter de vlag integraties-catalogus-v2; UIT = de bestaande badges ongewijzigd.
import { INTEGRATIES } from '../../shared/integraties-catalogus';
import { GROEPEN, groepVan, registerVan, type Groep } from '../../shared/integraties-register';

export const CLOUD_NAAR_REGISTER: Readonly<Record<string, string | null>> = Object.freeze({
  'google-drive': 'google-drive', 'google-photos': 'google-photos', onedrive: 'onedrive', dropbox: 'dropbox', box: 'box',
  'icloud-drive': 'icloud-drive', mega: 'mega', nextcloud: 'nextcloud', pcloud: null, 'proton-drive': null,
  'nas-webdav': 'nextcloud', 'gmail-bijlagen': 'gmail',
});

/** Registergroep (zonder levende stand: die blijft van de eigen cloud-route) of null als het register de aanbieder niet kent. */
export function registerGroep(aanbiederId: string): { groep: Groep; uk: string; nl: string; adapter: string | null } | null {
  const rid = CLOUD_NAAR_REGISTER[aanbiederId]; if (!rid) return null;
  const i = INTEGRATIES.find((x) => x.id === rid); const r = registerVan(rid); if (!i || !r) return null;
  const groep = groepVan(i, null, r); const g = GROEPEN.find((x) => x.id === groep)!;
  return { groep, uk: g.uk, nl: g.nl, adapter: r.adapter ?? null };
}
