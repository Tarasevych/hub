// SEC-002 (autorisatie-04): schrijfrecht op een blok volgt het HUIDIGE recht in de werkruimte van dat blok, niet alleen
// «ik heb het blok ooit gemaakt». Een voormalig lid (toegang ingetrokken) of een lid dat kijker is geworden, wijzigt en
// verwijdert dus niets meer in de werkruimte van een ander. Zelfde bedoeling als de RLS-regel in 0007
// («workspace_blocks in een ruimte: ook de maker kan als kijker niet meer schrijven»), nu ook in de app-laag.
import { db } from '../server/platform';
import { alsSysteem } from '../server/platform/context';

type Toegang = { permission: string; scopeBlockIds?: string[] } | null | undefined;

/** Mag deze toegang het blok wijzigen of verwijderen? Eigenaar: altijd. Bewerker: ja, binnen zijn afbakening (als die er is). */
export function magBlokSchrijven(toegang: Toegang, blokId: string): boolean {
  if (!toegang) return false;
  if (toegang.permission === 'owner') return true;
  if (toegang.permission !== 'editor') return false;
  const afbakening = toegang.scopeBlockIds || [];
  return !afbakening.length || afbakening.includes(blokId);
}

/**
 * Blokken die een (voormalig) lid in de werkruimte van een ander heeft gezet, gaan over op de eigenaar van die werkruimte.
 * Zonder dit blijft na intrekken of terugzetten naar «alleen lezen» een blok achter dat niemand meer kan wijzigen of
 * weghalen: het oude lid niet meer (autorisatie-04) en de eigenaar niet, omdat het blok niet van hem is.
 * Alleen `ownerUserId` verandert; de lade (`ruimte`) blijft, want delen bestaat alleen in de persoonlijke ruimte.
 */
/** toets-g10b #5: `behouden` = blokken die het lid binnen zijn (nieuwe) bereik nog mag schrijven en dus houdt. */
export async function blokkenNaarEigenaar(werkruimteId: string, vanUserId: string, eigenaarId: string, behouden: readonly string[] = []): Promise<number> {
  if (!werkruimteId || !vanUserId || !eigenaarId || vanUserId === eigenaarId) return 0;
  return alsSysteem(async () => {
    let aantal = 0;
    // Hoogstens 20 pagina's: elke ronde verdwijnen de overgedragen blokken uit het filter, dus steeds de eerste pagina.
    for (let ronde = 0; ronde < 20; ronde += 1) {
      const { items } = await db.list<{ id: string; workspaceId?: string; ownerUserId?: string }>('workspace_blocks', { filter: { workspaceId: werkruimteId, ownerUserId: vanUserId } });
      const eigen = items.filter((b) => b.workspaceId === werkruimteId && b.ownerUserId === vanUserId && !behouden.includes(b.id));
      if (!eigen.length) break;
      const gelukt = await db.update('workspace_blocks', eigen.map(({ id, ...rest }) => ({ id, record: { ...rest, ownerUserId: eigenaarId } })));
      const nu = gelukt.filter(Boolean).length;
      aantal += nu;
      if (!nu) break;
    }
    return aantal;
  });
}
