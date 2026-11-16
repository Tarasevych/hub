// SEC-002 (aanmelden-02): wie in «Сесії» één aanmelding beëindigt, trekt daarmee ook haar «onthouden browser» in.
//
// Wat hier fout was: POST /api/owner/identity/security/items/:id/revoke zette alleen revokedAt op de sessierij. De rij in
// owner_browser_grants_v1 waar die sessie naar wijst (grantId) bleef geldig, en het token van die rij is af te leiden uit de
// sessiecookie zelf. De ingetrokken (gestolen of verloren) browser maakte daarna zonder Google een nieuwe volledige sessie
// via /transactions/complete-remembered. «revoke-others» en «revoke-all» trokken de grants wél in; deze ene route niet.
//
// Nu, in dezelfde stap als het intrekken:
//  - soort 'session' (anker): de grant van de sessie, alle tabbladrijen van DEZE gebruiker onder dat anker (afgemeld) en hun grants;
//    die grants ALTIJD (na controle g10g-T1), samen met elke andere sessie/elk tabblad met dezelfde grant (= dezelfde browser),
//    behalve de eigen huidige sessie van wie intrekt;
//  - soort 'tab': de grant van het tabblad, tenzij een andere nog levende aanmelding van deze gebruiker dezelfde grant gebruikt
//    (het anker van de browser of een ander tabblad): dan blijft die browser bewust onthouden tot zijn sessie zelf weg is.
// Alleen rijen van de gebruiker zelf: een tabblad van een ANDER account onder hetzelfde anker (accountwissel) en diens grant
// blijven van dat account. Daarnaast: de open gegevenssleutel van die sessies dicht (sleutelkluis) en hun snelle stromen
// (GET /api/owner/stroom) meteen gesloten.
import { db } from '../server/platform/db';
import { sleutelSluitenVoorHouder } from './sleutelkluis';
import { sluitStromenVan } from './apparaat-bevestiging/stroom';

const TAB = 'owner_tab_sessions_v1', SESSIE = 'owner_service_sessions_v1', GRANT = 'owner_browser_grants_v1';
type Rij = Record<string, unknown> & { id: string };
const zonderId = (r: Rij) => { const { id: _id, ...rest } = r; return rest; };
const alleRijen = async (tabel: string, filter: Record<string, unknown>): Promise<Rij[]> => {
  const uit: Rij[] = []; let nextToken: string | undefined;
  do { const p = await db.list<Record<string, unknown>>(tabel, { filter, limit: 1000, nextToken }); uit.push(...(p.items as Rij[])); nextToken = p.nextToken; } while (nextToken && uit.length < 50000);
  return uit;
};

export type GrantsIngetrokken = { grants: number; tabs: number; stromen: number; sessies: number };

/**
 * Aanroepen NADAT de sessie- of tabbladrij zelf is ingetrokken. `doel` = de rij zoals zij vóór het intrekken was (voor grantId
 * en anker); `doel.behoud` = de eigen, huidige sessie van wie intrekt (die blijft altijd leven). Geeft terug hoeveel grants,
 * extra sessies en tabbladrijen er zijn ingetrokken (voor de audit en het antwoord).
 *
 * SEC-002 na controle (g10g-T1): bij soort 'session' wordt de grant ALTIJD ingetrokken, ook als een andere levende sessie hem nog
 * draagt. Zo'n sessie is dezelfde «onthouden browser»: complete-remembered + redeem maken een nieuwe sessie met DEZELFDE grantId.
 * Wie het profiel gestolen heeft, maakte vooraf een «reservesessie» uit de grant; elke intrekking van één sessie liet de grant dan
 * leven en hij maakte meteen de volgende. Nu gaan grant, alle sessies en tabbladen met die grant tegelijk dicht.
 */
export async function grantsIntrekkenMetSessie(userId: string, soort: 'session' | 'tab', doel: { id: string; grantId?: string; anchorSessionId?: string; behoud?: string }, nu = Date.now()): Promise<GrantsIngetrokken> {
  const uit: GrantsIngetrokken = { grants: 0, tabs: 0, stromen: 0, sessies: 0 };
  if (!userId || !doel?.id) return uit;
  const kandidaten = new Set<string>();
  if (doel.grantId) kandidaten.add(String(doel.grantId));
  const tabs = (await alleRijen(TAB, { userId })).filter((t) => t.userId === userId);
  const sessies = (await alleRijen(SESSIE, { userId })).filter((s) => s.userId === userId);
  const tabsAfmelden = async (rijen: Rij[]) => {
    const levend = rijen.filter((t) => t.status === 'active' || !t.revokedAt);
    for (let i = 0; i < levend.length; i += 500) await db.update(TAB, levend.slice(i, i + 500).map((t) => ({ id: t.id, record: { ...zonderId(t), status: 'signed_out', revokedAt: Number(t.revokedAt || 0) || nu } })));
    for (const t of rijen) sleutelSluitenVoorHouder('sessie', t.id);
    return levend.length;
  };
  if (soort === 'session') {
    // Tabbladen van deze gebruiker onder dit anker: afgemeld (ze waren al dood zonder anker, maar bleven in de lijst staan).
    const onderAnker = tabs.filter((t) => t.anchorSessionId === doel.id);
    for (const t of onderAnker) if (t.grantId) kandidaten.add(String(t.grantId));
    uit.tabs += await tabsAfmelden(onderAnker);
    sleutelSluitenVoorHouder('sessie', doel.id);
    uit.stromen += sluitStromenVan(userId, doel.id);
    if (!kandidaten.size) return uit;
    // Dezelfde onthouden browser = elke andere levende sessie (en elk tabblad) van deze gebruiker met zo'n grant: ook dicht.
    const behoud = String(doel.behoud || '');
    const zelfdeBrowser = sessies.filter((s) => s.id !== doel.id && s.id !== behoud && !s.revokedAt && s.grantId && kandidaten.has(String(s.grantId)));
    for (let i = 0; i < zelfdeBrowser.length; i += 500) await db.update(SESSIE, zelfdeBrowser.slice(i, i + 500).map((s) => ({ id: s.id, record: { ...zonderId(s), revokedAt: nu } })));
    uit.sessies = zelfdeBrowser.length;
    const ankers = new Set(zelfdeBrowser.map((s) => s.id));
    uit.tabs += await tabsAfmelden(tabs.filter((t) => t.anchorSessionId !== doel.id && t.id !== behoud && String(t.anchorSessionId || '') !== behoud && (ankers.has(String(t.anchorSessionId || '')) || (t.grantId && kandidaten.has(String(t.grantId))))));
    for (const s of zelfdeBrowser) { sleutelSluitenVoorHouder('sessie', s.id); uit.stromen += sluitStromenVan(userId, s.id); }
    for (const grantId of kandidaten) if (await grantIntrekken(userId, grantId, nu)) uit.grants += 1;
    return uit;
  }
  sleutelSluitenVoorHouder('sessie', doel.id);
  if (!kandidaten.size) return uit;
  // Tabblad: de grant blijft alleen als een ANDERE nog levende aanmelding van deze gebruiker hem gebruikt (het anker van die
  // browser of een ander tabblad) — dan blijft die browser bewust onthouden tot zijn sessie zelf wordt beëindigd.
  const levendeAnkers = new Set(sessies.filter((s) => !s.revokedAt && Number(s.idleExpiresAt || 0) > nu && Number(s.absoluteExpiresAt || 0) > nu).map((s) => s.id));
  const inGebruik = new Set<string>();
  for (const s of sessies) if (levendeAnkers.has(s.id) && s.grantId) inGebruik.add(String(s.grantId));
  for (const t of tabs) {
    if (t.id === doel.id || !t.grantId) continue;
    if (t.status === 'active' && !t.revokedAt && levendeAnkers.has(String(t.anchorSessionId || ''))) inGebruik.add(String(t.grantId));
  }
  for (const grantId of kandidaten) if (!inGebruik.has(grantId) && await grantIntrekken(userId, grantId, nu)) uit.grants += 1;
  return uit;
}

/** Zoals backend/toegang-context.ts sessieIntrekken (hier geïnjecteerd: geen kringverwijzing met index.ts). */
export type SessieIntrekkenFn = (userId: string, s: { tab?: string; anker?: string }, huidig: { sessieId: string; anker: string; grant: string }) => Promise<{ tab?: boolean; anker?: boolean }>;

/**
 * SEC-002 na controle (g10g-T3): «Ні, це не я» in Telegram (backend/telegram-aanmelden/wijzigingen.ts, actie 'sessies-beeindigen')
 * trok alleen de sessie-/tabbladrijen in (sessieIntrekken zonder grant). Een Telegram-aanmelding gaat via
 * ownerCompletePrimaryRedirect, standaard met «onthouden»: de grant bleef leven en de aanvaller maakte met complete-remembered +
 * redeem meteen een nieuwe volledige sessie, zonder Telegram en zonder Google. Nu na elke intrekking hetzelfde als in «Сесії»:
 * anker → grantsIntrekkenMetSessie('session') (grant altijd, plus andere sessies met die grant, sleutels, stromen); los tabblad
 * → 'tab'. `ids` = sessie_id uit app.tg_inlog_verzoeken: «a:<anker>|t:<tabblad>».
 */
export async function sessiesIntrekkenMetGrants(userId: string, ids: string[], intrekken: SessieIntrekkenFn, nu = Date.now()): Promise<{ aantal: number; grants: number; sessies: number; tabs: number }> {
  const uit = { aantal: 0, grants: 0, sessies: 0, tabs: 0 };
  for (const id of ids) {
    const delen = Object.fromEntries(String(id).split('|').map((d) => [d.slice(0, 1), d.slice(2)])) as Record<string, string>;
    const anker = delen.a || undefined, tab = delen.t || undefined;
    try {
      // De rijen zoals zij VÓÓR het intrekken waren (grantId, anker), alleen van deze gebruiker.
      const [a] = anker ? await db.get<Record<string, unknown>>(SESSIE, [anker]) : [null];
      const [t] = tab ? await db.get<Record<string, unknown>>(TAB, [tab]) : [null];
      const r = await intrekken(userId, { tab, anker }, { sessieId: '', anker: '', grant: '' });
      if (!r.tab && !r.anker) continue;
      uit.aantal += 1;
      const tel = (m: GrantsIngetrokken) => { uit.grants += m.grants; uit.sessies += m.sessies; uit.tabs += m.tabs; };
      if (anker && a && a.userId === userId) tel(await grantsIntrekkenMetSessie(userId, 'session', { id: anker, grantId: String(a.grantId || '') || undefined }, nu));
      if (tab && t && t.userId === userId && (!anker || String(t.anchorSessionId || '') !== anker)) {
        tel(await grantsIntrekkenMetSessie(userId, 'tab', { id: tab, grantId: String(t.grantId || '') || undefined, anchorSessionId: String(t.anchorSessionId || '') || undefined }, nu));
      }
    } catch { /* één rij mag de rest niet tegenhouden (zoals vroeger) */ }
  }
  return uit;
}

async function grantIntrekken(userId: string, grantId: string, nu: number): Promise<boolean> {
  const [g] = await db.get<Record<string, unknown>>(GRANT, [grantId]);
  if (!g || g.userId !== userId || g.revokedAt) return false;
  const [ok] = await db.update(GRANT, [{ id: grantId, record: { ...zonderId({ ...g, id: grantId } as Rij), revokedAt: nu } }]);
  return Boolean(ok);
}
