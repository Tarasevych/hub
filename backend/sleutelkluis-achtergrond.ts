// De ACHTERGRONDRONDE van de sleutelkluis — in het SERVERPROCES, want daar staat de gegevenssleutel open (0092).
//
// WAAROM DIT NODIG IS. De crons draaien als aparte oneshot-processen (deploy/mijn-ruimte-cron@.service → server/cron.ts). Het
// geheugen van zo'n proces is leeg: voor een mens die de kluis aanzette, is de sleutel daar ALTIJD dicht, ook terwijl hij op de
// site werkt. Die crons slaan hem dus eerlijk over (SLEUTELKLUIS_GESLOTEN in het journaal). Het werk dat de open sleutel nodig
// heeft — Drive/agenda/CalDAV-synchronisatie en het postonderhoud — gebeurt daarom HIER, in het proces waar de sleutel staat,
// met dezelfde handlers en onder DEZELFDE Postgres-advisory-lock als de cron (cron:<naam>), zodat beide nooit tegelijk lopen.
// Zo hoeft er geen sleutel tussen processen te reizen: geen bestand, geen socket, niets op schijf.
//
// De ronde doet NIETS zolang er geen enkele sleutel open staat (dan doet de gewone cron alles, exact als vroeger). Elke run
// staat in app.cron_runs als '<naam>@server', zodat /admin hem naast de gewone runs ziet.
import { randomUUID } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { openLaden } from './sleutelkluis';

type Handler = (event: Record<string, unknown>) => Promise<{ statusCode?: number; body?: string } | undefined>;
export type AchtergrondTaak = { naam: string; handler: Handler; payload?: Record<string, unknown> };
export const ACHTERGROND_INTERVAL_MS = 5 * 60 * 1000;

let lopend = false;
/** Eén ronde: alle taken, elk onder de advisory lock van de cron. Geeft per taak wat er gebeurde (voor tests en logregels). */
export async function sleutelkluisAchtergrondRonde(taken: AchtergrondTaak[]): Promise<Array<{ naam: string; status: 'overgeslagen' | 'ok' | 'fout' | 'bezet'; detail?: string }>> {
  const open = openLaden();
  if (!open.length) return taken.map((t) => ({ naam: t.naam, status: 'overgeslagen' as const, detail: 'geen open sleutel' }));
  if (lopend) return taken.map((t) => ({ naam: t.naam, status: 'bezet' as const, detail: 'vorige ronde loopt nog' }));
  lopend = true;
  const uit: Array<{ naam: string; status: 'overgeslagen' | 'ok' | 'fout' | 'bezet'; detail?: string }> = [];
  try {
    for (const t of taken) {
      const client = await getPool('systeem').connect();
      let runId: number | null = null;
      try {
        const lock = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [`cron:${t.naam}`]);
        if (!lock.rows[0]?.ok) { uit.push({ naam: t.naam, status: 'bezet', detail: 'cron loopt' }); continue; }
        runId = (await client.query('INSERT INTO app.cron_runs (name) VALUES ($1) RETURNING id', [`${t.naam}@server`])).rows[0].id;
        const now = new Date().toISOString();
        const r = await t.handler({ type: 'cron', name: t.naam, invocationId: randomUUID(), payload: t.payload || {}, scheduledTime: now, invokedTime: now });
        let ok = (r?.statusCode ?? 200) < 400;
        try { const b = typeof r?.body === 'string' ? JSON.parse(r.body) : null; if (b && b.ok === false) ok = false; } catch { /* geen JSON */ }
        await client.query('UPDATE app.cron_runs SET finished_at = now(), status = $2, detail = $3 WHERE id = $1', [runId, ok ? 'ok' : 'error', `open sleutels=${open.length}`]);
        uit.push({ naam: t.naam, status: ok ? 'ok' : 'fout' });
      } catch (err) {
        if (runId !== null) await client.query("UPDATE app.cron_runs SET finished_at = now(), status = 'error', detail = $2 WHERE id = $1", [runId, String((err as Error)?.message || err).slice(0, 500)]).catch(() => undefined);
        uit.push({ naam: t.naam, status: 'fout', detail: String((err as Error)?.message || err).slice(0, 200) });
      } finally {
        await client.query('SELECT pg_advisory_unlock_all()').catch(() => undefined);
        client.release();
      }
    }
  } finally { lopend = false; }
  return uit;
}
