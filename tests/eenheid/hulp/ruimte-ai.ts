// Testhulp (geen test zelf): de dienst «ai» AANZETTEN in de technische gegevensruimte van een gebruiker.
//
// Waarom dit bestaat. Sinds 20.10.2026 is de technische kant van de AI ondergeschikt aan de stand van de dienst «ai» in de
// gescheiden gegevensruimtes (migratie 0082, app.ruimte_dienst_stand; backend/ai-ruimte-poort.ts → aiPoortNu). Een technisch
// profiel met een lopende activering is dus niet meer genoeg: zolang die dienst op «uit» staat — en dat is de standaard, de
// veilige richting — bestaat er geen technisch hulpmiddel, geen technisch apparaat en geen technisch browserslot.
//
// Tests die OVER IETS ANDERS gaan (de connector, de extensie, de vreemde MCP-servers) zetten die dienst daarom hier in één
// regel aan, zodat ze niet per ongeluk de ruimtescheiding meetesten. De standen zelf worden nagelopen in
// tests/eenheid/ruimte-ai-20261020.test.ts en tests/eenheid/ruimte-scheiding-20261020.test.ts.
import { getPool } from '../../../server/platform/pg';

/** De eenmalige keuze zetten (als die er nog niet is) en de dienst «ai» op `stand` (standaard «eigen gegevens»). */
export async function aiDienstAan(userId: string, stand: 'eigen' | 'gedeeld' = 'eigen'): Promise<void> {
  const sys = getPool('systeem');
  await sys.query(`INSERT INTO app.ruimte_keuze (user_id, gekozen, gekozen_door) VALUES ($1,'per_dienst',$1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
  await sys.query(`INSERT INTO app.ruimte_dienst_stand (user_id, dienst, stand, vorige_stand, bevestigd_door)
    VALUES ($1,'ai',$2,'uit','eenheidstest')
    ON CONFLICT (user_id, dienst) DO UPDATE SET stand = EXCLUDED.stand, gewijzigd_op = now(), bevroren_op = NULL, bevroren_oorzaak = ''`, [userId, stand]);
}

/** Opruimen in `finally`: de rijen van deze gebruikers weer weg. Faalt nooit hard. */
export async function aiDienstOpruimen(userIds: readonly string[]): Promise<void> {
  const ids = userIds.filter(Boolean);
  if (!ids.length) return;
  const sys = getPool('systeem');
  await sys.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
  await sys.query('DELETE FROM app.ruimte_keuze WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
}
