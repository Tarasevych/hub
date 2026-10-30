// Haalt de EIGEN logo's van de beheerder op (één keer per sessie). Los bestand zodat het register zelf puur blijft (geen fetch).
// Alleen met een (waarschijnlijke) sessie: op het aanmeldscherm geen verzoek, dus ook geen 401/403 in de console of het netwerk.
import { laadEigenMerken, type EigenMerk } from './merk-register';

export function eigenMerkenOphalen(): void {
  if (typeof window === 'undefined') return;
  // Lui: src/tab-context.ts en de api-client raken bij het importeren `window` aan; <Merk> wordt ook buiten de browser getekend.
  void laadEigenMerken(async () => {
    const [{ ecosystemSessionLikely, ecosystemTabContext }, { sessieDienst }, { api }] = await Promise.all([import('../tab-context'), import('../canoniek-navigatie'), import('../platform/client')]);
    if (!ecosystemSessionLikely()) return null;
    // Zelfde context als elke andere aanroep (dienst + tabblad): zonder die twee weigert de sessiecontrole met 403.
    return (await api.post('/api/owner/merk-eigen/lijst', { service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin })).data as { merken?: EigenMerk[] };
  });
}
