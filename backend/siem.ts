// Export van het journaal (app.audit) naar uw EIGEN SIEM (architectuur 13.10.2026, etap E). Niets verlaat de server:
//  - bestand: NDJSON (één JSON per regel) op deze server, bv. /var/log/mijn-ruimte/audit.ndjson — lezen met Wazuh-agent, Promtail,
//    Vector of Fluent Bit; logrotate met copytruncate (deploy/SIEM.md);
//  - loki: push-API van Grafana Loki op DEZE machine. Alleen loopback (127.0.0.1, localhost, [::1]): een andere host wordt geweigerd,
//    ook als iemand hem in siem.env zet. Wie naar een andere machine wil, zet daar een agent die het bestand leest.
// Uit tenzij SIEM_BESTAND en/of SIEM_LOKI_URL gezet zijn (/etc/mijn-ruimte/siem.env, alleen root: installeer-app.sh siem …).
// Per bestemming een cursor (app.siem_export): een storing bij de ene geeft geen dubbele regels bij de andere. Na een storing
// opnieuw vanaf dezelfde plek (at-least-once): een regel heeft id + hash, dus een SIEM kan dubbelen herkennen.
// Waarom niet Wazuh/Loki in het archief meeleveren: zwaar (Elasticsearch/OpenSearch) en een eigen beheertaak; de export werkt met
// elke SIEM die een bestand of de Loki-API leest.
import { appendFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { hostname } from 'node:os';
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { getPool } from '../server/platform/pg';
import { heeftTechMogelijkheid, isEigenaar, TAB_RE, type Gebruiker } from './tech-profiel';

const sys = () => getPool('systeem');
export const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?(\/[A-Za-z0-9._~\/-]*)?$/;
const PER_RONDE = 500;

export type SiemConfig = { aan: boolean; bestand: string; loki: string; lokiGeweigerd: boolean; vanafBegin: boolean; intervalS: number };
export function siemConfig(env: NodeJS.ProcessEnv = process.env): SiemConfig {
  const b = String(env.SIEM_BESTAND || '').trim();
  const bestand = b && isAbsolute(b) && !/[\0\n]/.test(b) ? b : '';
  const l = String(env.SIEM_LOKI_URL || '').trim().replace(/\/+$/, '');
  const loki = LOOPBACK.test(l) ? l : '';
  return { aan: !!(bestand || loki), bestand, loki, lokiGeweigerd: !!l && !loki, vanafBegin: env.SIEM_VANAF === 'begin',
    intervalS: Math.min(300, Math.max(5, Math.round(Number(env.SIEM_INTERVAL_S) || 15))) };
}

// Zelfde gedachte als het journaal op de site: geheim-achtige velden gaan er nooit uit (ook niet genest).
const GEHEIM = /(token(?!Id)|secret|cookie|proof|nonce|pkce|authorization|password|passwd|code(?!s)|key|ticket|sig$|signature)/i;
function schoon(v: unknown, diepte = 0): unknown {
  if (Array.isArray(v)) return diepte > 3 ? '[…]' : v.slice(0, 50).map((x) => schoon(x, diepte + 1));
  if (v && typeof v === 'object') {
    if (diepte > 3) return '{…}';
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => k !== '_ctx' && !GEHEIM.test(k)).map(([k, w]) => [k, schoon(w, diepte + 1)]));
  }
  return typeof v === 'string' ? v.slice(0, 2000) : v;
}

export type AuditRuw = {
  id: string | number; owner_id: string | null; actor_id: string | null; action: string; type: string; result: string; details: Record<string, unknown> | null;
  ip_hash: string | null; device: string | null; service: string | null; seq: string | number; prev_hash: string; hash: string; ms: string | number;
  ctx_profiel?: string | null; ctx_namens?: string | null; ctx_ruimte?: string | null;
};
/** Eén auditregel → één SIEM-regel. Vaste veldnamen (ECS-achtig: @timestamp, event.*), zonder geheimen; IP alleen als hash. */
export function siemRegel(r: AuditRuw, host = hostname()) {
  const ctx = (r.details?._ctx ?? {}) as Record<string, unknown>;
  return {
    '@timestamp': new Date(Number(r.ms)).toISOString(),
    host, bron: 'mijn-ruimte', id: String(r.id), seq: Number(r.seq), hash: r.hash, prev_hash: r.prev_hash,
    event: { action: r.action, category: r.type, outcome: r.result || '' },
    owner: r.owner_id, actor: r.actor_id, service: r.service, device: r.device, ip_hash: r.ip_hash,
    profiel: r.ctx_profiel ?? (typeof ctx.profiel === 'string' ? ctx.profiel : null),
    activatie: typeof ctx.activatie === 'string' ? ctx.activatie : null,
    namens: r.ctx_namens ?? (typeof ctx.namens === 'string' ? ctx.namens : null),
    ruimte: r.ctx_ruimte ?? (typeof ctx.ruimte === 'string' ? ctx.ruimte : null),
    details: schoon(r.details ?? {}),
  };
}

type Bestemming = 'bestand' | 'loki';
async function verstuur(b: Bestemming, cfg: SiemConfig, rijen: AuditRuw[]): Promise<void> {
  const regels = rijen.map((r) => siemRegel(r));
  if (b === 'bestand') { await appendFile(cfg.bestand, regels.map((x) => JSON.stringify(x)).join('\n') + '\n', { mode: 0o640 }); return; }
  // Loki: weinig labels (app, bron, categorie), de rest in de regel zelf. Tijd in nanoseconden als tekst.
  const perType = new Map<string, Array<[string, string]>>();
  regels.forEach((x, i) => { const t = x.event.category || 'overig'; perType.set(t, [...(perType.get(t) ?? []), [`${BigInt(Number(rijen[i].ms)) * 1_000_000n}`, JSON.stringify(x)]]); });
  const res = await fetch(`${cfg.loki}/loki/api/v1/push`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000), redirect: 'error',
    body: JSON.stringify({ streams: [...perType].map(([type, values]) => ({ stream: { app: 'mijn-ruimte', bron: 'audit', categorie: type }, values })) }),
  });
  if (!res.ok) throw new Error(`loki HTTP ${res.status}`);
}

let bezig = false;
/** Eén ronde: per bestemming hoogstens 500 nieuwe regels. Geeft per bestemming het aantal (of de fout). Nooit een throw. */
export async function siemRonde(cfg: SiemConfig = siemConfig()): Promise<Partial<Record<Bestemming, number | string>>> {
  if (!cfg.aan || bezig) return {};
  bezig = true;
  const uit: Partial<Record<Bestemming, number | string>> = {};
  try {
    for (const b of (['bestand', 'loki'] as const).filter((x) => (x === 'bestand' ? cfg.bestand : cfg.loki))) {
      let cur = (await sys().query('SELECT laatste_id FROM app.siem_export WHERE bestemming = $1', [b])).rows[0];
      if (!cur) {
        // Eerste keer: vanaf NU (geen geschiedenis dumpen), tenzij SIEM_VANAF=begin.
        const start = cfg.vanafBegin ? 0 : Number((await sys().query('SELECT COALESCE(max(id), 0) AS m FROM app.audit')).rows[0].m);
        await sys().query('INSERT INTO app.siem_export (bestemming, laatste_id) VALUES ($1, $2) ON CONFLICT (bestemming) DO NOTHING', [b, start]);
        cur = { laatste_id: start };
      }
      const rijen = (await sys().query(`SELECT id, owner_id, actor_id, action, type, result, details, ip_hash, device, service, seq, prev_hash, hash,
          ctx_profiel, ctx_namens, ctx_ruimte, (extract(epoch FROM created_at) * 1000)::bigint AS ms
        FROM app.audit WHERE id > $1 ORDER BY id LIMIT ${PER_RONDE}`, [cur.laatste_id])).rows as AuditRuw[];
      if (!rijen.length) { await sys().query('UPDATE app.siem_export SET bijgewerkt = now() WHERE bestemming = $1', [b]); uit[b] = 0; continue; }
      try {
        await verstuur(b, cfg, rijen);
        await sys().query(`UPDATE app.siem_export SET laatste_id = $2, geexporteerd = geexporteerd + $3, fouten = 0, bijgewerkt = now() WHERE bestemming = $1`,
          [b, rijen[rijen.length - 1].id, rijen.length]);
        uit[b] = rijen.length;
      } catch (e) {
        const m = String((e as Error)?.message || e).replace(/\s+/g, ' ').slice(0, 300);
        await sys().query(`UPDATE app.siem_export SET fouten = fouten + 1, laatste_fout = $2, laatste_fout_op = now(), bijgewerkt = now() WHERE bestemming = $1`, [b, m]);
        uit[b] = m;
      }
    }
  } catch (e) {
    console.error('[siem] ronde mislukt:', (e as Error).message);
  } finally { bezig = false; }
  return uit;
}

/** Stand voor het venster «Перевірка → Журнал і SIEM»: aan/uit, per bestemming de achterstand en de laatste fout. Geen inhoud. */
export async function siemStand(cfg: SiemConfig = siemConfig()) {
  const max = Number((await sys().query('SELECT COALESCE(max(id), 0) AS m FROM app.audit')).rows[0].m);
  const rows = (await sys().query('SELECT * FROM app.siem_export')).rows;
  const per = (b: Bestemming) => {
    const r = rows.find((x) => x.bestemming === b);
    const ingesteld = b === 'bestand' ? !!cfg.bestand : !!cfg.loki;
    return { ingesteld, doel: b === 'bestand' ? cfg.bestand : cfg.loki, gestart: !!r, achterstand: r ? Math.max(0, max - Number(r.laatste_id)) : null,
      geexporteerd: r ? Number(r.geexporteerd) : 0, fouten: r ? Number(r.fouten) : 0, laatsteFout: r?.laatste_fout ?? null,
      laatsteFoutOp: r?.laatste_fout_op ? new Date(r.laatste_fout_op).getTime() : null, bijgewerkt: r ? new Date(r.bijgewerkt).getTime() : null };
  };
  return { aan: cfg.aan, lokiGeweigerd: cfg.lokiGeweigerd, intervalS: cfg.intervalS, bestand: per('bestand'), loki: per('loki') };
}

type SessionOk = { user: Gebruiker; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
export function siemRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  return {
    // Alleen lezen, in een actief technisch profiel met journaal.lezen (Адміністратор, Аудитор, Власник).
    'POST /api/beheer/siem/stand': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const auth = await requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth) return error(auth.errorCode, 401);
      if (auth.user.status !== 'approved' && !isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
      const tab = String((ctx.body as Record<string, unknown> | null)?.tabContext || '');
      if (!TAB_RE.test(tab) || !(await heeftTechMogelijkheid(auth.user.id, tab, 'journaal.lezen'))) return error('TECH_JOURNAAL_VEREIST', 403);
      return json(await siemStand());
    }) as RouterMiddleware],
  };
}
