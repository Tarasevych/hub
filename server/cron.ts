// Cron-CLI: voert één geplande taak uit en stopt (aan te roepen door een systemd-timer).
// Gebruik: node dist-server/cron.mjs <naam>      (namen en payloads uit cron.json)
//          node dist-server/cron.mjs --lijst
// Overlap wordt voorkomen met een Postgres advisory lock per taak; elke run komt in app.cron_runs.
import { randomUUID } from 'node:crypto';
import cronDefinitions from '../cron.json';
import * as backend from '../backend/index';
import { closePool, getPool } from './platform/pg';
import { procesVangnetInstellen, procesVangnetStand } from './platform/proces-vangnet';

// SEC-002 (keten-config-01): een onopgevangen uitzondering of afgewezen belofte in achtergrondwerk van een backend-module mag
// de run niet halverwege afbreken (rij in app.cron_runs bleef dan op «bezig» staan). Het vangnet logt en laat de run afmaken;
// de run eindigt daarna wél met een foutcode (zie onderaan), zodat de timer-unit het als mislukt meldt — net als vroeger.
procesVangnetInstellen();

type CronDefinition = { name: string; cron: string; handler: string; timezone?: string; payload?: Record<string, unknown> };
const definitions = cronDefinitions as CronDefinition[];
type CronHandler = (event: Record<string, unknown>) => Promise<{ statusCode?: number; body?: string } | undefined>;

/** Een taak meldt "gelukt" met statusCode 200, maar het lichaam kan een fout bevatten ({ok:false} of een reden per eigenaar). Dat moet zichtbaar zijn. */
function summarize(result: { statusCode?: number; body?: string } | undefined): { ok: boolean; text: string } {
  const code = result?.statusCode ?? 'geen';
  let ok = (result?.statusCode ?? 200) < 400;
  let extra = '';
  try {
    const body = typeof result?.body === 'string' ? JSON.parse(result.body) : null;
    if (body && typeof body === 'object') {
      if (body.ok === false) { ok = false; extra = ` reden=${String(body.reason || 'onbekend')}`; }
      const failures = Array.isArray(body.results) ? body.results.filter((r: any) => r && typeof r === 'object' && r.reason).map((r: any) => String(r.reason)) : [];
      if (failures.length) extra += ` eigenaarfouten=${[...new Set(failures)].join(',')}`;
      const jobs = Array.isArray(body.results) ? body.results.flatMap((r: any) => (Array.isArray(r?.jobs) ? r.jobs : [])) : [];
      if (jobs.length) extra += ` jobs=${jobs.map((j: any) => String(j?.status || '?')).join(',')}`;
    }
  } catch { /* geen JSON-lichaam */ }
  const raw = typeof result?.body === 'string' ? ` body=${result.body.replace(/\s+/g, '')}` : '';
  return { ok, text: `statusCode=${code}${extra}${raw}`.slice(0, 900) };
}

async function run(name: string): Promise<number> {
  const def = definitions.find((d) => d.name === name);
  if (!def) { console.error(`[cron] onbekende taak: ${name}`); return 2; }
  const fn = (backend as unknown as Record<string, CronHandler>)[def.handler];
  if (typeof fn !== 'function') { console.error(`[cron] handler ontbreekt: ${def.handler}`); return 2; }

  const client = await getPool().connect();
  let runId: number | null = null;
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [`cron:${name}`]);
    if (!lock.rows[0]?.ok) {
      await client.query("INSERT INTO app.cron_runs (name, status, finished_at, detail) VALUES ($1,'skipped',now(),'vorige run loopt nog')", [name]);
      console.log(`[cron] ${name}: overgeslagen, vorige run loopt nog`);
      return 0;
    }
    runId = (await client.query('INSERT INTO app.cron_runs (name) VALUES ($1) RETURNING id', [name])).rows[0].id;
    const now = new Date().toISOString();
    const started = Date.now();
    const result = await fn({ type: 'cron', name, invocationId: randomUUID(), payload: def.payload || {}, scheduledTime: now, invokedTime: now });
    const { ok, text } = summarize(result);
    await client.query('UPDATE app.cron_runs SET finished_at = now(), status = $2, detail = $3 WHERE id = $1', [runId, ok ? 'ok' : 'error', text]);
    console.log(`[cron] ${name}: ${ok ? 'ok' : 'fout'} (${text}, ${Date.now() - started}ms)`);
    return ok ? 0 : 1;
  } catch (err) {
    console.error(`[cron] ${name}: fout:`, err);
    if (runId !== null) await client.query("UPDATE app.cron_runs SET finished_at = now(), status = 'error', detail = $2 WHERE id = $1", [runId, String((err as Error)?.message || err).slice(0, 500)]).catch(() => undefined);
    return 1;
  } finally {
    await client.query('SELECT pg_advisory_unlock_all()').catch(() => undefined);
    client.release();
  }
}

const arg = process.argv[2] || '';
if (!arg || arg === '--lijst') {
  for (const d of definitions) console.log(`${d.name}\t${d.cron}\t${d.handler}\t${JSON.stringify(d.payload || {})}`);
  // Ook hier expliciet stoppen: backend-modules starten bij import timers (bv. Google-client verversen).
  process.exit(arg ? 0 : 2);
} else {
  run(arg)
    .then((code) => {
      // Was er onderweg een onopgevangen fout (vangnet), dan is «0» niet eerlijk: meld de run als mislukt.
      const v = procesVangnetStand();
      const onopgevangen = v.uitzonderingen + v.afwijzingen;
      if (onopgevangen) console.error(`[cron] ${arg}: ${onopgevangen} onopgevangen fout(en) tijdens de run (zie hierboven)`);
      process.exitCode = code || (onopgevangen ? 1 : 0);
    })
    // Kan de run niet eens beginnen (bv. geen databaseverbinding), dan eindigde het proces vroeger met code 0: stil «gelukt».
    .catch((err) => { console.error(`[cron] ${arg}: niet gestart:`, String((err as Error)?.message || err).slice(0, 300)); process.exitCode = 1; })
    .finally(async () => {
      await closePool().catch(() => undefined);
      // Backend-modules kunnen timers hebben; expliciet stoppen zodat de oneshot-unit eindigt.
      process.exit(process.exitCode ?? 0);
    });
}
