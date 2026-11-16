// Haalt de EIGEN logo's van DEZE gebruiker op (REESTR-LOGO-001, 16.11.2026) — één keer per tabblad en per account/ruimte.
// Los bestand zodat het register zelf puur blijft (geen fetch). Alleen met een (waarschijnlijke) sessie: op het aanmeldscherm geen
// verzoek. De server bepaalt zelf welke ruimte (privé/technisch) dit tabblad is en geeft een `scope` terug; hoort de lijst bij een
// ander account of een andere ruimte dan de vorige, dan is de vorige lijst meteen weg (registreerGebruikerMerken).
// Завантажує власні логотипи цього користувача; чужі ніколи не потрапляють у цей список (сервер віддає лише свої).
import { _gebruikerMerkenOpnieuw, gebruikerMerkScope, laadGebruikerMerken, registreerGebruikerMerken, type GebruikerMerk } from './merk-register';

export type GebruikerMerkenAntwoord = { merken?: GebruikerMerk[]; scope?: string; gesloten?: number; max?: number };

let gevraagd = false;

async function context() {
  const [{ ecosystemSessionLikely, ecosystemTabContext }, { sessieDienst }, { api }] = await Promise.all([import('../tab-context'), import('../canoniek-navigatie'), import('../platform/client')]);
  return { ecosystemSessionLikely, api, lijf: { service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin } };
}

/** De lijst van de server (null zonder sessie). */
export async function gebruikerMerkenLijst(): Promise<GebruikerMerkenAntwoord | null> {
  const c = await context();
  if (!c.ecosystemSessionLikely()) return null;
  return (await c.api.post('/api/owner/merk-gebruiker/lijst', c.lijf)).data as GebruikerMerkenAntwoord;
}

/** Zetten of wissen met dezelfde context als elke andere aanroep (dienst + tabblad: daaruit leidt de server de ruimte af). */
export async function merkGebruikerPost(pad: 'zetten' | 'wissen', extra: Record<string, unknown>): Promise<GebruikerMerkenAntwoord> {
  const c = await context();
  return (await c.api.post(`/api/owner/merk-gebruiker/${pad}`, { ...c.lijf, ...extra })).data as GebruikerMerkenAntwoord;
}

/** Eén keer per tabblad (en opnieuw na zetten/wissen via gebruikerMerkenVernieuwen). */
export function gebruikerMerkenOphalen(): void {
  if (typeof window === 'undefined' || gevraagd) return;
  gevraagd = true;
  void gebruikerMerkenLijst().then((r) => {
    if (!r) return;
    const scope = String(r.scope || '');
    void laadGebruikerMerken(scope, async () => r);
  }).catch(() => { gevraagd = false; });
}

/** Na zetten of wissen: de nieuwe lijst meteen in het register (alle logo's op de pagina tekenen opnieuw). */
export function gebruikerMerkenZetten(r: GebruikerMerkenAntwoord): void {
  _gebruikerMerkenOpnieuw();
  registreerGebruikerMerken(r.merken || [], String(r.scope || gebruikerMerkScope()));
}
