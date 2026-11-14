// IDENTITEIT-015 (kaart-stille-uren): de telling van de stille uren per meldingenscope, gedeeld door de tabbladen (localStorage).
// Лічильник тихих годин для області сповіщень; спільний для вкладок цього піддомену. Без сховища (приватне вікно) — у пам'яті:
// підсумок однаково з'явиться один раз у цій вкладці. Перезавантаження сторінки не губить і не дублює підсумок: лічильник
// стирається в ту саму мить, коли підсумок віддається на показ.
import { stilStap, type StilTeller, type StilVoorkeur } from '../../shared/stille-uren';

const SLEUTEL = 'tsv-stille-uren-v1:';
const geheugen = new Map<string, StilTeller | null>();

function lees(scope: string): StilTeller | null {
  try {
    const raw = localStorage.getItem(SLEUTEL + scope);
    return raw ? JSON.parse(raw) as StilTeller : null;
  } catch {
    return geheugen.get(scope) ?? null;
  }
}
function schrijf(scope: string, t: StilTeller | null): void {
  geheugen.set(scope, t);
  try {
    if (t) localStorage.setItem(SLEUTEL + scope, JSON.stringify(t));
    else localStorage.removeItem(SLEUTEL + scope);
  } catch { /* geen opslag: het geheugen volstaat voor dit tabblad */ }
}

/**
 * Gebeurtenissen die door de stilte geen pop-up/geluid kregen. Geeft een eventuele samenvatting van een VORIG venster terug
 * (bijv. het tabblad sliep over het einde heen) — de aanroeper toont die eerst.
 */
export function stilTellen(scope: string, stil: StilVoorkeur | undefined, aantal: number, nu = new Date()): number | null {
  const stap = stilStap(lees(scope), stil, nu, aantal);
  schrijf(scope, stap.teller);
  return stap.samenvatting;
}

/** Na het einde van de stilte (of als ze uitgezet is): het aantal voor de ene samenvatting, en de telling is weg. Інакше null. */
export function stilAfronden(scope: string, stil: StilVoorkeur | undefined, nu = new Date()): number | null {
  const voor = lees(scope);
  if (!voor) return null;
  const stap = stilStap(voor, stil, nu, 0);
  if (stap.samenvatting === null && JSON.stringify(stap.teller) === JSON.stringify(voor)) return null;
  schrijf(scope, stap.teller);
  return stap.samenvatting;
}
