// Fase 3: bij het opstarten verouderde eigenaarsrollen intrekken. Eigenaar = OWNER_EMAIL (isOwnerEmail);
// een account met role 'owner' maar een ander adres (bijv. na wijziging van OWNER_EMAIL of oude data) wordt
// 'member' en dat wordt gelogd + in app.audit vastgelegd. Zonder OWNER_EMAIL gebeurt er niets (nooit iedereen
// degraderen bij een configuratiefout).
import { db, isOwnerEmail, ownerEmail } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { rechtenVerloren } from './ruimte-scheiding';

type Rij = { id: string; email?: string; role?: string; updatedAt?: number } & Record<string, unknown>;

export async function verouderdeEigenarenIntrekken(): Promise<string[]> {
  if (!ownerEmail()) return [];
  const rows = await db.list<Omit<Rij, 'id'>>('users', { filter: { role: 'owner' }, limit: 100 });
  const ingetrokken: string[] = [];
  for (const row of rows.items as Rij[]) {
    if (isOwnerEmail(row.email)) continue;
    const { id, ...rest } = row;
    const [ok] = await db.update('users', [{ id, record: { ...rest, role: 'member', updatedAt: Date.now() } }]);
    if (!ok) continue;
    ingetrokken.push(id);
    console.warn(`[eigenaar] verouderde eigenaarsrol ingetrokken: account ${id} (adres is niet OWNER_EMAIL) → member`);
    // 0082: met de eigenaarsrol verdwijnt ook de technische gegevensruimte — meteen alle technische verbindingen intrekken
    // en de laden bevriezen (de poort zou het bij het eerste verzoek ook doen; hier gebeurt het al bij het opstarten).
    await rechtenVerloren(id, 'rol-weg', 'systeem').catch((err) => console.error('[ruimte-scheiding] bevriezen bij verouderde eigenaarsrol mislukt', (err as Error).message));
    await auditToevoegen({ ownerId: id, actorId: null, action: 'owner.role.demoted-stale', type: 'beheer', result: 'success', details: { van: 'owner', naar: 'member', reden: 'not OWNER_EMAIL' }, service: 'systeem' }).catch(() => undefined);
  }
  return ingetrokken;
}
