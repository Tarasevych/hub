// Updates goedkeuren met de passkey van de eigenaar (zie deploy/RUNBOOK-VEILIGE-UITROL.md §13).
//
//  1. Een VOORBEREIDER (account, agenttoken tvh_… of MCP-koppeling met een geldige grant uit app.uitrol_voorbereiders) uploadt een
//     pakket in stukken + metadata (wie, commit, wijzigingen, tests). Het komt in de uploads-map van de app met status
//     'wacht-op-goedkeuring' en installeert niets.
//  2. De EIGENAAR opent Admin → «Оновлення» / «Updates» en drukt «Схвалити й встановити». De browser maakt een WebAuthn-assertie
//     (userVerification=required) over een challenge = hash(voorstel-id, versie, sha256, nonce, vervaltijd ≤ 5 min), eenmalig.
//  3. De app controleert de assertie vooraf (snelle melding), kopieert het pakket naar de goedkeur-inbox met een .goedkeuring.json
//     en tikt `aanvraag` aan. Root (mijn-ruimte-goedkeuring.path) controleert ALLES opnieuw tegen de root-sleutels
//     /etc/mijn-ruimte/goedkeur-passkeys.json en de eigen sha256 van zijn kopie; pas dan installeer-app.sh (gezondheid + rollback).
//     Een gecompromitteerde app kan dus niets goedkeuren: zonder de passkey van de eigenaar weigert root.
//  4. Passkeys: elke gebruiker registreert ze zelf in Instellingen → «Способи входу» (backend/passkeys.ts, rpId tarasevych.com).
//     Alleen de eigenaar kan bij een eigen passkey «Може схвалювати оновлення сервера» aanvragen: dan schrijft de app een
//     aanmelding in de goedkeur-inbox. De allereerste wordt via SSH bevestigd (`mijn-ruimte-passkey toevoegen <vingerafdruk>`);
//     volgende met een assertie van een al bekende passkey; intrekken idem. Root beslist, de app vraagt alleen.
// Een agent kan voorbereiden en de stand lezen, NOOIT goedkeuren.
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as kern from '../deploy/goedkeuring/webauthn-kern.mjs';
import { error, isOwnerEmail, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { rateLimit } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { meld } from './melder';
import { ruimteOf } from '../shared/ai-ruimte';
import { parseRootGebeurtenissen, toonbareInstallaties } from './server-beheer';
import { ToegangFout, gebruikVastleggen, redenVan, viaAppIngetrokken, wijzigingVastleggen } from './toegang-context';

export const UITROL_LIMIETEN = Object.freeze({
  maxBytes: 300 * 1024 * 1024,
  maxStuk: 512 * 1024,
  voorbereiderMaxDagen: 30,
  voorstelWachtDagen: 7,
  uploadUren: 24,
  openPerVoorbereider: 3,
  uitdagingMs: 5 * 60 * 1000,
  wachtendeAanmeldingen: 5,
});
export type Soort = 'account' | 'agenttoken' | 'mcp-koppeling';
export type Onderwerp = { soort: Soort; id: string; accountId: string };
export const SOORTEN: readonly Soort[] = ['account', 'agenttoken', 'mcp-koppeling'];

// ------------------------------------------------------------------------------------------------ paden (tests: omgeving)
const voorstelDir = () => process.env.UITROL_VOORSTEL_DIR || path.join(process.env.UPLOADS_DIR || '/srv/data/uploads', 'uitrol-voorstellen');
const goedkeurInbox = () => process.env.GOEDKEUR_INBOX || '/srv/mijn-ruimte/goedkeur-inbox';
const sleutelsPad = () => process.env.GOEDKEUR_SLEUTELS || '/etc/mijn-ruimte/goedkeur-passkeys.json';
const rechtenPad = () => process.env.MCP_RECHTEN_PAD || '/etc/mijn-ruimte/mcp-rechten.json';
const statusDir = () => process.env.OPDRACHT_STATUS_DIR || '/var/lib/mijn-ruimte-uitrol-status';
const pakketPad = (id: string) => path.join(voorstelDir(), `${id}.tar.gz`);
const sys = () => getPool('systeem');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSIE = /^[0-9]{8}-[0-9]{6}$/;
const SHA = /^[0-9a-f]{64}$/;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');
const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
const nonceNieuw = () => randomBytes(32).toString('base64url');

export class UitrolFout extends Error { constructor(public code: string, public status = 400) { super(code); } }
function fout(code: string, status = 400): never { throw new UitrolFout(code, status); }

async function auditeer(ownerId: string | null, actorId: string | null, action: string, result: string, details: Record<string, unknown>) {
  await auditToevoegen({ ownerId, actorId, action, type: 'beveiliging', result, details, service: 'admin' }).catch(() => undefined);
}

// ------------------------------------------------------------------------------------------------ root-bestanden (alleen lezen)
export async function leesSleutels() {
  try { return kern.normaliseerSleutelbestand(JSON.parse(await readFile(sleutelsPad(), 'utf8'))); }
  catch { return kern.normaliseerSleutelbestand({}); }
}
export async function schakelaarAan(): Promise<boolean> {
  try { return JSON.parse(await readFile(rechtenPad(), 'utf8'))['passkey-goedkeuring'] === true; } catch { return false; }
}

// ------------------------------------------------------------------------------------------------ voorbereiders (grants)
const grantUit = (r: any) => ({
  id: String(r.id), soort: r.soort as Soort, onderwerp: String(r.onderwerp), accountId: String(r.account_id), label: String(r.label),
  gegevenDoor: String(r.gegeven_door), gegevenOp: iso(r.gegeven_op), verlooptOp: iso(r.verloopt_op), ingetrokkenOp: iso(r.ingetrokken_op),
  status: r.ingetrokken_op ? 'ingetrokken' : new Date(r.verloopt_op).getTime() <= Date.now() ? 'verlopen' : 'actief',
});

/** Geldige grant voor een van de onderwerpen (in volgorde: specifiek eerst), en het account is nog in orde (niet geblokkeerd). */
export async function actieveGrant(onderwerpen: Onderwerp[]) {
  for (const o of onderwerpen) {
    if (!SOORTEN.includes(o.soort) || !o.id || !o.accountId) continue;
    const { rows } = await sys().query(
      `SELECT g.* FROM app.uitrol_voorbereiders g
         LEFT JOIN app.records r ON r.tbl = 'users' AND r.id = g.account_id
        WHERE g.soort = $1 AND g.onderwerp = $2 AND g.account_id = $3 AND g.ingetrokken_op IS NULL AND g.verloopt_op > now()
          AND r.id IS NOT NULL AND COALESCE(r.data->>'status', '') NOT IN ('blocked', 'rejected', 'deleted')
          AND COALESCE((r.data->>'retiredAt')::numeric, 0) = 0
          AND NOT EXISTS (SELECT 1 FROM app.user_ai_settings s WHERE s.user_id = g.account_id AND s.blocked_at IS NOT NULL)
        ORDER BY g.verloopt_op DESC LIMIT 1`, [o.soort, o.id, o.accountId]);
    if (rows[0]) return grantUit(rows[0]);
  }
  return null;
}

async function onderwerpControleren(soort: Soort, onderwerp: string): Promise<{ id: string; accountId: string; label: string }> {
  if (soort === 'account') {
    const { rows } = await sys().query(`SELECT id, data->>'email' AS email, data->>'name' AS name, data->>'status' AS status, data->>'role' AS role FROM app.records
      WHERE tbl = 'users' AND (id = $1 OR lower(data->>'email') = lower($1)) LIMIT 2`, [onderwerp]);
    if (rows.length !== 1) fout('ONDERWERP_ONBEKEND', 404);
    const u = rows[0];
    if (u.status !== 'approved' && u.role !== 'owner') fout('ACCOUNT_NIET_GOEDGEKEURD', 409);
    return { id: String(u.id), accountId: String(u.id), label: tekst(u.email || u.name || u.id, 80) };
  }
  // Updates voorbereiden raakt de server: alleen een token of koppeling uit de TECHNISCHE ruimte (0042) komt in aanmerking.
  // Een privéverbinding krijgt dit recht nooit, ook niet van de eigenaar — zo kan een AI in de accountruimte de site niet raken.
  if (soort === 'agenttoken') {
    const { rows } = await sys().query(`SELECT id, user_id, name, prefix, ruimte FROM app.mcp_console_tokens WHERE id::text = $1 AND revoked_at IS NULL AND expires_at > now()`, [onderwerp]);
    if (!rows[0]) fout('ONDERWERP_ONBEKEND', 404);
    if (ruimteOf(rows[0].ruimte) !== 'technisch') fout('RUIMTE_PRIVE', 409);
    return { id: String(rows[0].id), accountId: String(rows[0].user_id), label: tekst(`${rows[0].name} (${rows[0].prefix}…)`, 80) };
  }
  const { rows } = await sys().query(`SELECT id, user_id, client_name, ruimte FROM app.mcp_oauth_tokens WHERE id::text = $1 AND revoked_at IS NULL AND refresh_expires_at > now()`, [onderwerp]);
  if (!rows[0]) fout('ONDERWERP_ONBEKEND', 404);
  if (ruimteOf(rows[0].ruimte) !== 'technisch') fout('RUIMTE_PRIVE', 409);
  return { id: String(rows[0].id), accountId: String(rows[0].user_id), label: tekst(rows[0].client_name || 'MCP', 80) };
}

export async function grantGeven(door: { id: string; email?: string }, input: { soort?: unknown; onderwerp?: unknown; dagen?: unknown; label?: unknown }) {
  const soort = String(input.soort || '') as Soort;
  if (!SOORTEN.includes(soort)) fout('SOORT_ONGELDIG');
  const dagen = Number(input.dagen ?? 7);
  if (!Number.isInteger(dagen) || dagen < 1 || dagen > UITROL_LIMIETEN.voorbereiderMaxDagen) fout('DUUR_ONGELDIG');
  const o = await onderwerpControleren(soort, tekst(input.onderwerp, 200).trim());
  const label = tekst(input.label, 80).trim() || o.label;
  const { rows } = await sys().query(`INSERT INTO app.uitrol_voorbereiders (soort, onderwerp, account_id, label, gegeven_door, verloopt_op)
    VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6)) RETURNING *`, [soort, o.id, o.accountId, label, door.email || door.id, dagen]);
  await auditeer(door.id, door.id, 'uitrol_voorbereider_gegeven', 'success', { soort, onderwerp: o.id, account: o.accountId, label, dagen });
  return grantUit(rows[0]);
}
/**
 * Recht «updates voorbereiden» intrekken (§13.10): altijd met een reden (≥ 10 tekens) en — via de route — een sterke step-up.
 * Nooit stil: het getroffen account krijgt een melding «Це були ви?»-stijl met een link naar de wijziging, en de wijziging
 * (wie, sessie, apparaat, IP-hash, waarom) staat in zijn geschiedenis en journaal (audit met ownerId = dat account).
 */
export async function grantIntrekken(door: { id: string; email?: string }, id: unknown, meta: { reden?: unknown; auth?: Parameters<typeof wijzigingVastleggen>[0]['auth'] } = {}) {
  if (!UUID.test(String(id || ''))) fout('NIET_GEVONDEN', 404);
  let reden: string;
  try { reden = redenVan(meta.reden); } catch (e) { fout((e as ToegangFout).code || 'REDEN_TE_KORT'); }
  const { rows } = await sys().query(`UPDATE app.uitrol_voorbereiders SET ingetrokken_op = now(), ingetrokken_door = $2 WHERE id = $1 AND ingetrokken_op IS NULL RETURNING *`, [String(id), door.email || door.id]);
  if (!rows[0]) fout('NIET_GEVONDEN', 404);
  // Lopende uploads van deze voorbereider stoppen; wat al wacht, blijft zichtbaar voor de eigenaar (die kan afwijzen).
  await sys().query(`UPDATE app.uitrol_voorstellen SET status = 'afgebroken', bijgewerkt_op = now() WHERE voorbereider_id = $1 AND status = 'uploaden'`, [String(id)]);
  const getroffen = String(rows[0].account_id);
  const wijziging = await wijzigingVastleggen({ userId: getroffen, actor: door, soort: 'voorbereider-ingetrokken', sleutel: String(id), label: String(rows[0].label || ''), reden: reden!, auth: meta.auth });
  const details = { id: String(id), soort: rows[0].soort, onderwerp: rows[0].onderwerp, label: String(rows[0].label || ''), reden: reden!, wijziging, door: door.email || door.id };
  await auditeer(door.id, door.id, 'uitrol_voorbereider_ingetrokken', 'success', details);
  if (getroffen !== door.id) await auditeer(getroffen, door.id, 'uitrol_voorbereider_ingetrokken', 'success', details);
  await meld(getroffen, 'security_warning', 'Право готувати оновлення відкликано / Recht om updates voor te bereiden ingetrokken',
    `${door.email || 'Власник'} відкликав право «${String(rows[0].label || '')}». Причина: «${reden!}». Якщо це несподівано — перегляньте зміну. / ${door.email || 'De eigenaar'} heeft het recht «${String(rows[0].label || '')}» ingetrokken. Reden: «${reden!}». Onverwacht? Bekijk de wijziging.`,
    `https://id.tarasevych.com/methods?wijziging=${wijziging}`);
  return grantUit(rows[0]);
}
export async function grantsLijst() {
  const { rows } = await sys().query('SELECT * FROM app.uitrol_voorbereiders ORDER BY gegeven_op DESC LIMIT 100');
  return rows.map(grantUit);
}
/** Keuzelijsten voor «Кому дозволено»: goedgekeurde accounts, actieve agenttokens en MCP-koppelingen — alleen uit de technische ruimte. */
async function kandidaten() {
  const accounts = (await sys().query(`SELECT id, data->>'email' AS email, data->>'name' AS name FROM app.records
    WHERE tbl = 'users' AND (data->>'status' = 'approved' OR data->>'role' = 'owner') AND COALESCE((data->>'retiredAt')::numeric, 0) = 0 ORDER BY data->>'email' LIMIT 200`)).rows
    .map((r) => ({ id: String(r.id), label: tekst(r.email || r.name || r.id, 80) }));
  const tokens = (await sys().query(`SELECT t.id, t.name, t.prefix, r.data->>'email' AS email FROM app.mcp_console_tokens t LEFT JOIN app.records r ON r.tbl = 'users' AND r.id = t.user_id
    WHERE t.revoked_at IS NULL AND t.expires_at > now() AND t.ruimte = 'technisch' ORDER BY t.created_at DESC LIMIT 100`)).rows
    .map((r) => ({ id: String(r.id), label: tekst(`${r.name} (${r.prefix}…) · ${r.email || ''}`, 120) }));
  let koppelingen: Array<{ id: string; label: string }> = [];
  try {
    koppelingen = (await sys().query(`SELECT o.id, o.client_name, r.data->>'email' AS email FROM app.mcp_oauth_tokens o LEFT JOIN app.records r ON r.tbl = 'users' AND r.id = o.user_id
      WHERE o.revoked_at IS NULL AND o.refresh_expires_at > now() AND o.ruimte = 'technisch' ORDER BY o.created_at DESC LIMIT 100`)).rows
      .map((r) => ({ id: String(r.id), label: tekst(`${r.client_name || 'MCP'} · ${r.email || ''}`, 120) }));
  } catch { koppelingen = []; }
  return { accounts, agenttokens: tokens, koppelingen };
}

// ------------------------------------------------------------------------------------------------ voorstellen (voorbereiden)
const voorstelUit = (r: any) => ({
  id: String(r.id), versie: String(r.versie), status: String(r.status), bytes: Number(r.bytes), sha256: String(r.sha256), ontvangen: Number(r.ontvangen),
  voorbereider: String(r.voorbereider_label), voorbereiderId: String(r.voorbereider_id), commit: r.bron_commit ? String(r.bron_commit) : '',
  wijzigingen: String(r.wijzigingen || ''), tests: r.tests || {}, diffSamenvatting: String(r.diff_samenvatting || ''),
  aangemaaktOp: iso(r.aangemaakt_op), bijgewerktOp: iso(r.bijgewerkt_op), beslistOp: iso(r.beslist_op), beslistDoor: r.beslist_door ? String(r.beslist_door) : '',
  uitkomstCode: r.uitkomst_code ? String(r.uitkomst_code) : '', uitkomst: r.uitkomst || null,
});
function testsSchoon(v: unknown) {
  const t = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const getal = (x: unknown) => (Number.isInteger(Number(x)) && Number(x) >= 0 && Number(x) < 1e6 ? Number(x) : null);
  return { geslaagd: getal(t.passed ?? t.geslaagd), mislukt: getal(t.failed ?? t.mislukt), samenvatting: tekst(t.summary ?? t.samenvatting, 2000) };
}

export async function voorstelBegin(onderwerpen: Onderwerp[], a: Record<string, unknown>) {
  const grant = await actieveGrant(onderwerpen);
  if (!grant) fout('GEEN_VOORBEREIDER_GRANT', 403);
  const versie = String(a.version ?? a.versie ?? '');
  const bytes = Number(a.bytes);
  const sha = String(a.sha256 || '').toLowerCase();
  if (!VERSIE.test(versie)) fout('VERSIE_ONGELDIG');
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > UITROL_LIMIETEN.maxBytes) fout('GROOTTE_ONGELDIG');
  if (!SHA.test(sha)) fout('SHA256_ONGELDIG');
  const commit = String(a.commit || '').toLowerCase();
  if (commit && !/^[0-9a-f]{7,64}$/.test(commit)) fout('COMMIT_ONGELDIG');
  const limiet = await rateLimit(`uitrol-voorstel:${grant!.id}`, 10, 3600);
  if (!limiet.ok) fout('RATE_LIMITED', 429);
  const open = Number((await sys().query(`SELECT count(*)::int AS n FROM app.uitrol_voorstellen WHERE voorbereider_id = $1 AND status IN ('uploaden', 'wacht-op-goedkeuring')`, [grant!.id])).rows[0].n);
  if (open >= UITROL_LIMIETEN.openPerVoorbereider) fout('TE_VEEL_OPEN', 409);
  let row;
  try {
    row = (await sys().query(`INSERT INTO app.uitrol_voorstellen (versie, bytes, sha256, voorbereider_id, voorbereider_label, account_id, bron_commit, wijzigingen, tests, diff_samenvatting)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10) RETURNING *`,
      [versie, bytes, sha, grant!.id, grant!.label, grant!.accountId, commit || null, tekst(a.changelog ?? a.wijzigingen, 8000), JSON.stringify(testsSchoon(a.tests)), tekst(a.diff_summary ?? a.diffSamenvatting, 8000)])).rows[0];
  } catch (err) {
    if (String((err as { code?: string }).code) === '23505') fout('VERSIE_BESTAAT_AL', 409);
    throw err;
  }
  await mkdir(voorstelDir(), { recursive: true, mode: 0o750 });
  await writeFile(`${pakketPad(row.id)}.deel`, Buffer.alloc(0), { mode: 0o640 });
  await auditeer(grant!.accountId, grant!.accountId, 'uitrol_voorstel_begonnen', 'success', { voorstel: row.id, versie, bytes, sha256: sha, voorbereider: grant!.label, soort: grant!.soort });
  return { id: String(row.id), versie, maxStuk: UITROL_LIMIETEN.maxStuk, status: 'uploaden' };
}

async function eigenVoorstel(onderwerpen: Onderwerp[], id: unknown) {
  if (!UUID.test(String(id || ''))) fout('NIET_GEVONDEN', 404);
  const grant = await actieveGrant(onderwerpen);
  if (!grant) fout('GEEN_VOORBEREIDER_GRANT', 403);
  const { rows } = await sys().query('SELECT * FROM app.uitrol_voorstellen WHERE id = $1 AND voorbereider_id = $2', [String(id), grant!.id]);
  if (!rows[0]) fout('NIET_GEVONDEN', 404);
  return { grant: grant!, row: rows[0] };
}

export async function voorstelStuk(onderwerpen: Onderwerp[], a: Record<string, unknown>) {
  const { row } = await eigenVoorstel(onderwerpen, a.id);
  if (row.status !== 'uploaden') fout('STATUS_ONGELDIG', 409);
  const data = String(a.data || '');
  if (!/^[A-Za-z0-9+/=_-]+$/.test(data)) fout('DATA_ONGELDIG');
  const buf = Buffer.from(data, data.includes('-') || data.includes('_') ? 'base64url' : 'base64');
  if (!buf.length || buf.length > UITROL_LIMIETEN.maxStuk) fout('STUK_TE_GROOT');
  const offset = a.offset === undefined ? Number(row.ontvangen) : Number(a.offset);
  if (offset !== Number(row.ontvangen)) fout('OFFSET_ONJUIST', 409);
  if (offset + buf.length > Number(row.bytes)) fout('TE_VEEL_DATA');
  const fh = await open(`${pakketPad(row.id)}.deel`, 'r+');
  try { await fh.write(buf, 0, buf.length, offset); } finally { await fh.close(); }
  const upd = await sys().query(`UPDATE app.uitrol_voorstellen SET ontvangen = $3, bijgewerkt_op = now() WHERE id = $1 AND ontvangen = $2 AND status = 'uploaden' RETURNING ontvangen`, [row.id, offset, offset + buf.length]);
  if (!upd.rows[0]) fout('OFFSET_ONJUIST', 409);
  return { id: String(row.id), ontvangen: offset + buf.length, bytes: Number(row.bytes) };
}

async function sha256Bestand(p: string) {
  const h = createHash('sha256');
  await new Promise<void>((resolve, reject) => { createReadStream(p).on('data', (c) => h.update(c)).on('end', () => resolve()).on('error', reject); });
  return h.digest('hex');
}

export async function voorstelKlaar(onderwerpen: Onderwerp[], a: Record<string, unknown>) {
  const { grant, row } = await eigenVoorstel(onderwerpen, a.id);
  if (row.status !== 'uploaden') fout('STATUS_ONGELDIG', 409);
  const deel = `${pakketPad(row.id)}.deel`;
  const st = await stat(deel).catch(() => null);
  if (!st || st.size !== Number(row.bytes) || Number(row.ontvangen) !== Number(row.bytes)) fout('ONVOLLEDIG', 409);
  const fh = await open(deel, 'r');
  const kop = Buffer.alloc(2);
  try { await fh.read(kop, 0, 2, 0); } finally { await fh.close(); }
  if (kop[0] !== 0x1f || kop[1] !== 0x8b) { await afbreken(row.id, 'GEEN_GZIP'); fout('GEEN_GZIP'); }
  if ((await sha256Bestand(deel)) !== row.sha256) { await afbreken(row.id, 'SHA256_VERSCHILT'); fout('SHA256_VERSCHILT'); }
  await rename(deel, pakketPad(row.id));
  await sys().query(`UPDATE app.uitrol_voorstellen SET status = 'wacht-op-goedkeuring', bijgewerkt_op = now() WHERE id = $1 AND status = 'uploaden'`, [row.id]);
  await auditeer(grant.accountId, grant.accountId, 'uitrol_voorstel_klaar', 'success', { voorstel: row.id, versie: row.versie, sha256: row.sha256, voorbereider: grant.label });
  return { id: String(row.id), versie: String(row.versie), status: 'wacht-op-goedkeuring' };
}
async function afbreken(id: string, code: string) {
  await sys().query(`UPDATE app.uitrol_voorstellen SET status = 'afgebroken', uitkomst_code = $2, bijgewerkt_op = now() WHERE id = $1`, [id, code]);
  await rm(`${pakketPad(id)}.deel`, { force: true });
}
export async function voorstelAnnuleren(onderwerpen: Onderwerp[], a: Record<string, unknown>) {
  const { row } = await eigenVoorstel(onderwerpen, a.id);
  if (!['uploaden', 'wacht-op-goedkeuring'].includes(row.status)) fout('STATUS_ONGELDIG', 409);
  await sys().query(`UPDATE app.uitrol_voorstellen SET status = 'afgebroken', uitkomst_code = 'GEANNULEERD', bijgewerkt_op = now() WHERE id = $1`, [row.id]);
  await rm(`${pakketPad(row.id)}.deel`, { force: true }); await rm(pakketPad(row.id), { force: true });
  return { id: String(row.id), status: 'afgebroken' };
}
export async function voorstelStatus(onderwerpen: Onderwerp[], a: Record<string, unknown>) {
  await synchroniseer();
  const grant = await actieveGrant(onderwerpen);
  if (!grant) fout('GEEN_VOORBEREIDER_GRANT', 403);
  const { rows } = await sys().query(`SELECT * FROM app.uitrol_voorstellen WHERE voorbereider_id IN (SELECT id FROM app.uitrol_voorbereiders WHERE soort = $1 AND onderwerp = $2)
    ${a.id ? 'AND id::text = $3' : ''} ORDER BY aangemaakt_op DESC LIMIT 20`, a.id ? [grant!.soort, grant!.onderwerp, String(a.id)] : [grant!.soort, grant!.onderwerp]);
  return { grantVerloopt: grant!.verlooptOp, voorstellen: rows.map(voorstelUit).map(({ uitkomst: _u, ...v }) => v) };
}

/** Stand van root (status.json van de passkey-uitrol) overnemen; verlopen en onvoltooide voorstellen opruimen. */
export async function synchroniseer() {
  try {
    const st = JSON.parse(await readFile(path.join(statusDir(), 'status.json'), 'utf8')) as Record<string, string>;
    if (st && st.methode === 'passkey' && VERSIE.test(String(st.versie || ''))) {
      const nieuw = st.staat === 'klaar' ? 'geinstalleerd' : st.staat === 'geweigerd' ? 'geweigerd' : st.staat === 'mislukt' ? 'mislukt' : '';
      if (nieuw) {
        const { rows } = await sys().query(`UPDATE app.uitrol_voorstellen SET status = $2, uitkomst_code = $3, uitkomst = $4::jsonb, bijgewerkt_op = now()
          WHERE versie = $1 AND status = 'goedgekeurd' RETURNING id, versie`, [st.versie, nieuw, tekst(st.code, 40), JSON.stringify({ uk: tekst(st.uk, 300), nl: tekst(st.nl, 300), tijd: tekst(st.tijd, 40) })]);
        for (const r of rows) await rm(pakketPad(r.id), { force: true });
      }
    }
  } catch { /* nog geen status */ }
  const verlopen = await sys().query(`UPDATE app.uitrol_voorstellen SET status = 'verlopen', bijgewerkt_op = now()
    WHERE status = 'wacht-op-goedkeuring' AND aangemaakt_op < now() - make_interval(days => $1) RETURNING id`, [UITROL_LIMIETEN.voorstelWachtDagen]);
  const half = await sys().query(`UPDATE app.uitrol_voorstellen SET status = 'afgebroken', uitkomst_code = 'UPLOAD_TE_OUD', bijgewerkt_op = now()
    WHERE status = 'uploaden' AND aangemaakt_op < now() - make_interval(hours => $1) RETURNING id`, [UITROL_LIMIETEN.uploadUren]);
  for (const r of [...verlopen.rows, ...half.rows]) { await rm(pakketPad(r.id), { force: true }); await rm(`${pakketPad(r.id)}.deel`, { force: true }); }
  await sys().query(`DELETE FROM app.goedkeur_uitdagingen WHERE verloopt_ms < (extract(epoch FROM now()) * 1000)::bigint - 86400000`);
}

// ------------------------------------------------------------------------------------------------ challenges
export async function uitdagingMaken(userId: string, doel: 'registreren' | kern.Doel, onderwerp: string, velden: Record<string, unknown> = {}) {
  const nonce = nonceNieuw();
  const verloopt = Date.now() + UITROL_LIMIETEN.uitdagingMs - 2000;
  const uitdaging = doel === 'registreren' ? nonce : kern.uitdagingVoor(doel, { ...velden, nonce, verloopt } as never);
  const { rows } = await sys().query(`INSERT INTO app.goedkeur_uitdagingen (user_id, doel, onderwerp, nonce, uitdaging, verloopt_ms) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, doel, onderwerp, nonce, uitdaging, verloopt]);
  return { id: String(rows[0].id), nonce, verloopt, uitdaging };
}
/** Eenmalig verbruiken (atomisch). Ook bij een fout daarna is de challenge op. */
export async function uitdagingVerbruiken(userId: string, id: unknown, doel: string) {
  if (!UUID.test(String(id || ''))) fout('UITDAGING_ONGELDIG', 403);
  const { rows } = await sys().query(`UPDATE app.goedkeur_uitdagingen SET gebruikt_op = now()
    WHERE id = $1 AND user_id = $2 AND doel = $3 AND gebruikt_op IS NULL AND verloopt_ms > (extract(epoch FROM now()) * 1000)::bigint
    RETURNING onderwerp, nonce, uitdaging, verloopt_ms`, [String(id), userId, doel]);
  if (!rows[0]) fout('UITDAGING_ONGELDIG', 403);
  return { onderwerp: String(rows[0].onderwerp), nonce: String(rows[0].nonce), uitdaging: String(rows[0].uitdaging), verloopt: Number(rows[0].verloopt_ms) };
}
export function assertieUit(v: unknown): kern.Assertie {
  const a = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const s = (x: unknown, n: number) => { const t = String(x ?? ''); if (!t || t.length > n || !/^[A-Za-z0-9_-]+$/.test(t)) fout('ASSERTIE_ONGELDIG'); return t; };
  return { credentialId: s(a.credentialId, 1400), clientDataJSON: s(a.clientDataJSON, 8192), authenticatorData: s(a.authenticatorData, 8192), signature: s(a.signature, 2048) };
}
export const assertieOpties = (uitdaging: string, b: Awaited<ReturnType<typeof leesSleutels>>) => ({
  challenge: uitdaging, rpId: b.rpId, timeout: 120000, userVerification: 'required',
  allowCredentials: b.sleutels.map((s) => ({ type: 'public-key', id: s.credentialId })),
});

// ------------------------------------------------------------------------------------------------ goedkeuren / afwijzen (eigenaar)
type Eigenaar = { id: string; email?: string };
export async function goedkeurUitdaging(eigenaar: Eigenaar, voorstelId: unknown) {
  if (!(await schakelaarAan())) fout('PASSKEY_GOEDKEURING_UIT', 409);
  const b = await leesSleutels();
  if (!b.sleutels.length) fout('GEEN_PASSKEY', 409);
  if (!UUID.test(String(voorstelId || ''))) fout('NIET_GEVONDEN', 404);
  const { rows } = await sys().query('SELECT * FROM app.uitrol_voorstellen WHERE id = $1', [String(voorstelId)]);
  const v = rows[0];
  if (!v) fout('NIET_GEVONDEN', 404);
  if (v.status !== 'wacht-op-goedkeuring') fout('STATUS_ONGELDIG', 409);
  const u = await uitdagingMaken(eigenaar.id, 'goedkeuren', String(v.id), { voorstelId: String(v.id), versie: String(v.versie), sha256: String(v.sha256) });
  return { uitdagingId: u.id, verloopt: u.verloopt, publicKey: assertieOpties(u.uitdaging, b), voorstel: { id: String(v.id), versie: String(v.versie), sha256: String(v.sha256) } };
}

export async function goedkeuren(eigenaar: Eigenaar, input: { id?: unknown; uitdagingId?: unknown; assertie?: unknown }) {
  const assertie = assertieUit(input.assertie);
  const u = await uitdagingVerbruiken(eigenaar.id, input.uitdagingId, 'goedkeuren');
  if (u.onderwerp !== String(input.id || '')) fout('UITDAGING_ONGELDIG', 403);
  if (!(await schakelaarAan())) fout('PASSKEY_GOEDKEURING_UIT', 409);
  const { rows } = await sys().query('SELECT * FROM app.uitrol_voorstellen WHERE id = $1', [u.onderwerp]);
  const v = rows[0];
  if (!v || v.status !== 'wacht-op-goedkeuring') fout('STATUS_ONGELDIG', 409);
  // Opnieuw uitrekenen uit de HUIDIGE gegevens: een gewijzigd voorstel (andere sha/versie) past niet meer bij de challenge.
  const verwacht = kern.uitdagingVoor('goedkeuren', { voorstelId: String(v.id), versie: String(v.versie), sha256: String(v.sha256), nonce: u.nonce, verloopt: u.verloopt });
  const b = await leesSleutels();
  const r = kern.verifieerAssertie({ assertie, verwachteUitdaging: verwacht, rpId: b.rpId, origins: b.origins, sleutels: b.sleutels });
  if (!r.ok) {
    await auditeer(eigenaar.id, eigenaar.id, 'uitrol_voorstel_goedkeuring_geweigerd', 'denied', { voorstel: String(v.id), versie: String(v.versie), code: r.code });
    fout(`PASSKEY_${r.code}`, 403);
  }
  // Het pakket nog eens tegen de vastgelegde sha256 houden (root doet dat straks op zijn eigen kopie).
  if ((await sha256Bestand(pakketPad(String(v.id))).catch(() => '')) !== String(v.sha256)) fout('PAKKET_GEWIJZIGD', 409);
  const inbox = goedkeurInbox();
  const naam = `mijn-ruimte-${v.versie}.tar.gz`;
  const tmp = path.join(inbox, `.${naam}.${randomBytes(4).toString('hex')}.deel`);
  await copyFile(pakketPad(String(v.id)), tmp);
  await writeFile(path.join(inbox, `${naam}.goedkeuring.json`), JSON.stringify({
    doel: 'goedkeuren', voorstelId: String(v.id), versie: String(v.versie), sha256: String(v.sha256), nonce: u.nonce, verloopt: u.verloopt, assertie,
  }) + '\n', { mode: 0o640 });
  await rename(tmp, path.join(inbox, naam));
  await writeFile(path.join(inbox, 'aanvraag'), `${new Date().toISOString()} ${v.versie}\n`, { mode: 0o640 });
  await sys().query(`UPDATE app.uitrol_voorstellen SET status = 'goedgekeurd', beslist_op = now(), beslist_door = $2, bijgewerkt_op = now() WHERE id = $1`, [String(v.id), eigenaar.email || eigenaar.id]);
  await auditeer(eigenaar.id, eigenaar.id, 'uitrol_voorstel_goedgekeurd', 'success', { voorstel: String(v.id), versie: String(v.versie), sha256: String(v.sha256), passkey: r.vingerafdruk.slice(0, 16), voorbereider: String(v.voorbereider_label) });
  await passkeyGebruikVoorVingerafdruk(eigenaar.id, r.vingerafdruk, 'uitrol-goedkeuren', 'admin');
  return { id: String(v.id), versie: String(v.versie), status: 'goedgekeurd' };
}

export async function afwijzen(eigenaar: Eigenaar, id: unknown, reden: unknown) {
  if (!UUID.test(String(id || ''))) fout('NIET_GEVONDEN', 404);
  const { rows } = await sys().query(`UPDATE app.uitrol_voorstellen SET status = 'afgewezen', beslist_op = now(), beslist_door = $2, uitkomst_code = 'AFGEWEZEN', uitkomst = $3::jsonb, bijgewerkt_op = now()
    WHERE id = $1 AND status IN ('uploaden', 'wacht-op-goedkeuring') RETURNING *`, [String(id), eigenaar.email || eigenaar.id, JSON.stringify({ reden: tekst(reden, 500) })]);
  if (!rows[0]) fout('STATUS_ONGELDIG', 409);
  await rm(pakketPad(String(id)), { force: true }); await rm(`${pakketPad(String(id))}.deel`, { force: true });
  await auditeer(eigenaar.id, eigenaar.id, 'uitrol_voorstel_afgewezen', 'success', { voorstel: String(id), versie: String(rows[0].versie), reden: tekst(reden, 200) });
  return { id: String(id), status: 'afgewezen' };
}

// ------------------------------------------------------------------------------------------------ passkeys van de eigenaar
type Aanmelding = { bestand: string; vingerafdruk: string; credentialId: string; alg: number; jwk: kern.Jwk; label: string; aangemaakt: string };
const AANMELDING = /^sleutel-aanmelding-[0-9a-f]{64}\.json$/;
export async function wachtendeAanmeldingen(): Promise<Aanmelding[]> {
  let namen: string[] = [];
  try { namen = (await readdir(goedkeurInbox())).filter((n) => AANMELDING.test(n)).sort(); } catch { return []; }
  const uit: Aanmelding[] = [];
  for (const naam of namen) {
    try {
      const d = JSON.parse(await readFile(path.join(goedkeurInbox(), naam), 'utf8'));
      uit.push({ bestand: naam, vingerafdruk: kern.vingerafdruk({ alg: d.alg, jwk: d.jwk }), credentialId: String(d.credentialId), alg: d.alg, jwk: d.jwk, label: tekst(d.label, 60), aangemaakt: tekst(d.aangemaakt, 40) });
    } catch { /* ongeldig */ }
  }
  return uit;
}

/**
 * Aanmelding van een (al door de app geverifieerde) passkey van de eigenaar voor root: `sleutel-aanmelding-<vingerafdruk>.json`
 * in de goedkeur-inbox. Root rekent de vingerafdruk zelf uit en voegt hem alleen toe via SSH (eerste) of met een assertie van een
 * sleutel die al in het root-bestand staat. Hoogstens UITROL_LIMIETEN.wachtendeAanmeldingen tegelijk (oudste valt weg).
 */
export async function aanmeldingSchrijven(eigenaar: Eigenaar, sleutel: { credentialId: string; alg: number; jwk: kern.Jwk; label: string; aaguid?: string }) {
  const fp = kern.vingerafdruk({ alg: sleutel.alg, jwk: sleutel.jwk });
  const b = await leesSleutels();
  if (b.sleutels.some((s) => s.vingerafdruk === fp || s.credentialId === sleutel.credentialId)) fout('PASSKEY_BESTAAT_AL', 409);
  const inbox = goedkeurInbox();
  const oud = (await wachtendeAanmeldingen()).filter((w) => w.vingerafdruk !== fp);
  for (const w of oud.slice(0, Math.max(0, oud.length - (UITROL_LIMIETEN.wachtendeAanmeldingen - 1)))) await rm(path.join(inbox, w.bestand), { force: true });
  const label = tekst(sleutel.label, 60).trim() || 'passkey';
  await writeFile(path.join(inbox, `sleutel-aanmelding-${fp}.json`), JSON.stringify({
    credentialId: sleutel.credentialId, alg: sleutel.alg, jwk: sleutel.jwk, label, aangemaakt: new Date().toISOString(), aaguid: sleutel.aaguid || '', vingerafdruk: fp,
  }) + '\n', { mode: 0o640 });
  await auditeer(eigenaar.id, eigenaar.id, 'uitrol_passkey_aangemeld', 'success', { vingerafdruk: fp, label, eerste: b.sleutels.length === 0 });
  return { vingerafdruk: fp, kort: kern.vingerafdrukKort(fp), label, eerste: b.sleutels.length === 0, sshOpdracht: sshOpdracht(fp) };
}
export const sshOpdracht = (fp: string) => `sudo mijn-ruimte-passkey toevoegen ${fp.slice(0, 32)}`;

export async function aanmeldingIntrekken(eigenaar: Eigenaar, fp: unknown) {
  const v = String(fp || '');
  if (!SHA.test(v)) fout('NIET_GEVONDEN', 404);
  await rm(path.join(goedkeurInbox(), `sleutel-aanmelding-${v}.json`), { force: true });
  await auditeer(eigenaar.id, eigenaar.id, 'uitrol_passkey_aanmelding_ingetrokken', 'success', { vingerafdruk: v });
  return { ok: true };
}

export async function sleutelUitdaging(eigenaar: Eigenaar, doel: 'sleutel-toevoegen' | 'sleutel-verwijderen', fp: unknown) {
  const v = String(fp || '');
  if (!SHA.test(v)) fout('NIET_GEVONDEN', 404);
  const b = await leesSleutels();
  if (!b.sleutels.length) fout(doel === 'sleutel-toevoegen' ? 'EERSTE_VIA_SSH' : 'GEEN_PASSKEY', 409);
  if (doel === 'sleutel-toevoegen' && !(await wachtendeAanmeldingen()).some((w) => w.vingerafdruk === v)) fout('NIET_GEVONDEN', 404);
  if (doel === 'sleutel-verwijderen' && !b.sleutels.some((s) => s.vingerafdruk === v)) fout('NIET_GEVONDEN', 404);
  const u = await uitdagingMaken(eigenaar.id, doel, v, { vingerafdruk: v });
  return { uitdagingId: u.id, verloopt: u.verloopt, publicKey: assertieOpties(u.uitdaging, b) };
}

export async function sleutelVerzoek(eigenaar: Eigenaar, doel: 'sleutel-toevoegen' | 'sleutel-verwijderen', input: { uitdagingId?: unknown; assertie?: unknown }) {
  const assertie = assertieUit(input.assertie);
  const u = await uitdagingVerbruiken(eigenaar.id, input.uitdagingId, doel);
  // Via de app ingetrokken: root neemt die sleutel alleen nog via SSH terug (OPNIEUW_VIA_SSH); niet doen alsof het zo kan.
  if (doel === 'sleutel-toevoegen' && (await viaAppIngetrokken(eigenaar.id)).has(u.onderwerp)) fout('OPNIEUW_VIA_SSH', 409);
  const b = await leesSleutels();
  const verwacht = kern.uitdagingVoor(doel, { vingerafdruk: u.onderwerp, nonce: u.nonce, verloopt: u.verloopt });
  const r = kern.verifieerAssertie({ assertie, verwachteUitdaging: verwacht, rpId: b.rpId, origins: b.origins, sleutels: b.sleutels });
  if (!r.ok) { await auditeer(eigenaar.id, eigenaar.id, `uitrol_passkey_${doel === 'sleutel-toevoegen' ? 'toevoegen' : 'verwijderen'}_geweigerd`, 'denied', { code: r.code }); fout(`PASSKEY_${r.code}`, 403); }
  const inbox = goedkeurInbox();
  const verzoek: Record<string, unknown> = { doel, nonce: u.nonce, verloopt: u.verloopt, assertie };
  if (doel === 'sleutel-toevoegen') {
    const w = (await wachtendeAanmeldingen()).find((x) => x.vingerafdruk === u.onderwerp);
    if (!w) fout('NIET_GEVONDEN', 404);
    verzoek.nieuw = { credentialId: w!.credentialId, alg: w!.alg, jwk: w!.jwk, label: w!.label };
  } else verzoek.vingerafdruk = u.onderwerp;
  await writeFile(path.join(inbox, `${doel}-${u.onderwerp.slice(0, 32)}.json`), JSON.stringify(verzoek) + '\n', { mode: 0o640 });
  if (doel === 'sleutel-toevoegen') await unlink(path.join(inbox, `sleutel-aanmelding-${u.onderwerp}.json`)).catch(() => undefined);
  await writeFile(path.join(inbox, 'sleutel-aanvraag'), `${new Date().toISOString()} ${doel}\n`, { mode: 0o640 });
  await auditeer(eigenaar.id, eigenaar.id, doel === 'sleutel-toevoegen' ? 'uitrol_passkey_toevoegen_gevraagd' : 'uitrol_passkey_verwijderen_gevraagd', 'success', { vingerafdruk: u.onderwerp, bevestigdMet: r.vingerafdruk.slice(0, 16) });
  await passkeyGebruikVoorVingerafdruk(eigenaar.id, r.vingerafdruk, doel === 'sleutel-toevoegen' ? 'goedkeur-recht-bevestigen' : 'goedkeur-recht-intrekken');
  return { ok: true, vingerafdruk: u.onderwerp };
}

/** Gebruik van een root-sleutel ook bij de eigen passkey (zelfde vingerafdruk) in «Способи входу» tonen. */
async function passkeyGebruikVoorVingerafdruk(userId: string, fp: string, actie: string, dienst?: string) {
  try {
    const { rows } = await sys().query('UPDATE app.passkeys SET laatst_gebruikt_op = now() WHERE user_id = $1 AND vingerafdruk = $2 RETURNING id', [userId, fp]);
    if (rows[0]) await gebruikVastleggen(userId, 'passkey', String(rows[0].id), actie, dienst ? { dienst } : {});
  } catch (err) { console.error('[uitrol-goedkeuring] gebruik vastleggen:', (err as Error).message); }
}

/**
 * Recht «Може схвалювати оновлення» intrekken zonder root-assertie (§13.10): rechten afnemen is de veilige richting. De app legt
 * `sleutel-intrekken-<vingerafdruk>.json` in de inbox (met reden, wie en sessie) en tikt `sleutel-aanvraag` aan; root haalt de
 * sleutel uit /etc/mijn-ruimte/goedkeur-passkeys.json en onthoudt de vingerafdruk: OPNIEUW toevoegen kan daarna alleen via SSH.
 */
export async function sleutelIntrekkenAanvragen(eigenaar: Eigenaar, fp: string, meta: { reden: string; sessie: string; wijziging: string }) {
  if (!SHA.test(fp)) fout('NIET_GEVONDEN', 404);
  const inbox = goedkeurInbox();
  await writeFile(path.join(inbox, `sleutel-intrekken-${fp.slice(0, 32)}.json`), JSON.stringify({
    doel: 'sleutel-intrekken', vingerafdruk: fp, reden: tekst(meta.reden, 500), door: tekst(eigenaar.email || eigenaar.id, 200), sessie: tekst(meta.sessie, 80).slice(0, 8), wijziging: tekst(meta.wijziging, 40), tijd: new Date().toISOString(),
  }) + '\n', { mode: 0o640 });
  await writeFile(path.join(inbox, 'sleutel-aanvraag'), `${new Date().toISOString()} sleutel-intrekken\n`, { mode: 0o640 });
  await auditeer(eigenaar.id, eigenaar.id, 'uitrol_passkey_intrekken_gevraagd', 'success', { vingerafdruk: fp.slice(0, 16), wijziging: meta.wijziging });
}
/** Ligt er nog een intrekverzoek dat root niet verwerkt heeft? */
export async function intrekkenLopend(fp: string): Promise<boolean> {
  if (!SHA.test(fp)) return false;
  try { await stat(path.join(goedkeurInbox(), `sleutel-intrekken-${fp.slice(0, 32)}.json`)); return true; } catch { return false; }
}
/** Nog niet verwerkt intrekverzoek weghalen («Це був не я» vóór root). true = het lag er nog (recht blijft dus). */
export async function intrekkenAnnuleren(fp: string): Promise<boolean> {
  if (!(await intrekkenLopend(fp))) return false;
  try { await unlink(path.join(goedkeurInbox(), `sleutel-intrekken-${fp.slice(0, 32)}.json`)); return true; } catch { return false; }
}

// ------------------------------------------------------------------------------------------------ overzicht (eigenaar)
export async function overzicht() {
  await synchroniseer();
  const b = await leesSleutels();
  const voorstellen = (await sys().query('SELECT * FROM app.uitrol_voorstellen ORDER BY aangemaakt_op DESC LIMIT 50')).rows.map(voorstelUit);
  let rootStatus: unknown = null; let sleutelStatus: unknown = null; let ruw = '';
  try { rootStatus = JSON.parse(await readFile(path.join(statusDir(), 'status.json'), 'utf8')); } catch { rootStatus = null; }
  try { sleutelStatus = JSON.parse(await readFile(path.join(statusDir(), 'goedkeur-sleutels.json'), 'utf8')); } catch { sleutelStatus = null; }
  try { ruw = await readFile(path.join(statusDir(), 'gebeurtenissen.jsonl'), 'utf8'); } catch { ruw = ''; }
  const gezet = voorstellen.filter((v) => v.status === 'geinstalleerd').map((v) => v.versie);
  const installaties = toonbareInstallaties(parseRootGebeurtenissen(ruw), gezet).slice(-50).reverse().map((g) => ({
    id: g.id, tijd: g.tijd, code: g.code, herkomst: g.herkomst || '', wie: g.wie || '', pakket: g.pakket || '', release: g.release || g.tag || '',
    commit: g.commit || '', adres: g.adres || '', uk: g.uk, nl: g.nl,
  }));
  return {
    schakelaar: await schakelaarAan(), rpId: b.rpId, origins: b.origins,
    passkeys: b.sleutels.map((s) => ({ vingerafdruk: s.vingerafdruk, kort: kern.vingerafdrukKort(s.vingerafdruk), label: s.label, toegevoegd: s.toegevoegd, door: s.door })),
    wachtend: (await wachtendeAanmeldingen()).map((w) => ({ vingerafdruk: w.vingerafdruk, kort: kern.vingerafdrukKort(w.vingerafdruk), label: w.label, aangemaakt: w.aangemaakt, sshOpdracht: sshOpdracht(w.vingerafdruk) })),
    voorstellen, installaties, voorbereiders: await grantsLijst(), kandidaten: await kandidaten(), rootStatus, sleutelStatus, limieten: UITROL_LIMIETEN,
  };
}

// ------------------------------------------------------------------------------------------------ MCP-hulpmiddelen (alleen voorbereiden)
export const UITROL_TOOLS = [
  { name: 'uitrol_voorstel_begin', title: 'Prepare a server update (upload start)', description: 'Start uploading an UNSIGNED release package (git archive with UITROL-VERSIE; see deploy/uitrol/maak-voorstelpakket.sh) as a proposal. It installs nothing: the owner must approve it on the website with a passkey. Requires a "prepare updates" grant from the owner.', inputSchema: { type: 'object', properties: { version: { type: 'string', description: 'YYYYMMDD-HHMMSS, must match UITROL-VERSIE inside the package.' }, bytes: { type: 'number' }, sha256: { type: 'string' }, commit: { type: 'string' }, changelog: { type: 'string', description: 'What changed (max 8000 chars).' }, tests: { type: 'object', properties: { passed: { type: 'number' }, failed: { type: 'number' }, summary: { type: 'string' } }, additionalProperties: false }, diff_summary: { type: 'string' } }, required: ['version', 'bytes', 'sha256'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
  { name: 'uitrol_voorstel_stuk', title: 'Upload one chunk of a proposed update', description: 'Write one base64 chunk (max 512 KiB decoded) at the given offset (must equal the bytes received so far).', inputSchema: { type: 'object', properties: { id: { type: 'string' }, offset: { type: 'number' }, data: { type: 'string' } }, required: ['id', 'data'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
  { name: 'uitrol_voorstel_klaar', title: 'Finish the upload of a proposed update', description: 'Checks size and sha256; the proposal then waits for the owner\'s passkey approval. You cannot approve it yourself.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
  { name: 'uitrol_voorstel_status', title: 'Status of proposed updates', description: 'Your proposals and their status: uploaden, wacht-op-goedkeuring, goedgekeurd, geinstalleerd, mislukt, geweigerd, afgewezen, verlopen, afgebroken.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'uitrol_voorstel_annuleren', title: 'Cancel a proposed update', description: 'Cancel your own proposal while it is uploading or waiting for approval.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true } },
] as const;
export const UITROL_TOOL_NAMEN: ReadonlySet<string> = new Set(UITROL_TOOLS.map((t) => t.name));
/** Namen die er nooit komen: een agent keurt nooit goed. */
export const isGoedkeurPoging = (name: string) => /goedkeur|approve|schval|схвал/i.test(name) && /uitrol|release|update|voorstel/i.test(name);

export async function voerUitrolToolUit(onderwerpen: Onderwerp[], name: string, args: Record<string, unknown>) {
  if (isGoedkeurPoging(name)) fout('ALLEEN_EIGENAAR_MET_PASSKEY', 403);
  switch (name) {
    case 'uitrol_voorstel_begin': return voorstelBegin(onderwerpen, args);
    case 'uitrol_voorstel_stuk': return voorstelStuk(onderwerpen, args);
    case 'uitrol_voorstel_klaar': return voorstelKlaar(onderwerpen, args);
    case 'uitrol_voorstel_status': return voorstelStatus(onderwerpen, args);
    case 'uitrol_voorstel_annuleren': return voorstelAnnuleren(onderwerpen, args);
    default: return fout('TOOL_ONBEKEND', 404);
  }
}
export async function heeftVoorbereiderGrant(onderwerpen: Onderwerp[]) { try { return !!(await actieveGrant(onderwerpen)); } catch { return false; } }

// ------------------------------------------------------------------------------------------------ routes
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
export type UitrolRouteDeps = { requireSession: RequireSession; stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null>; sterkeStapOp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> };
const body = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
export const isEigenaar = (u: SessionOk['user']) => u.role === 'owner' && isOwnerEmail(u.email);

export function uitrolGoedkeuringRoutes(deps: UitrolRouteDeps): Record<string, RouterMiddleware[]> {
  const metFouten = async (run: () => Promise<unknown>): Promise<Resp> => {
    try { return json(await run()); }
    catch (err) {
      if (err instanceof UitrolFout) return error(err.code, err.status);
      console.error('[uitrol-goedkeuring]', (err as Error).message);
      return error('UITROL_FOUT', 500);
    }
  };
  /** Eigenaar op admin.tarasevych.com; stepUp: recente herbevestiging (registreren, grants geven). */
  const eigenaar = (opts: { stepUp?: boolean; sterk?: boolean; reden?: boolean }, run: (ctx: Ctx, auth: SessionOk) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    if (!isEigenaar(auth.user)) return error('OWNER_REQUIRED', 403);
    // Eerst de reden (anders eerst een bevestigingsvenster en daarna pas «reden te kort»).
    if (opts.reden) { try { redenVan(body(ctx.body).reden); } catch (e) { return error((e as ToegangFout).code || 'REDEN_TE_KORT', 400); } }
    if (opts.sterk) {
      if (!deps.sterkeStapOp) return error('STEP_UP_STRONG_REQUIRED', 403);
      const su = await deps.sterkeStapOp(ctx, auth);
      if (su) return su;
    } else if (opts.stepUp) {
      if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403);
      const su = await deps.stepUp(ctx, auth);
      if (su) return su;
    }
    return metFouten(() => run(ctx, auth));
  }) as RouterMiddleware;
  /** Voorbereider via een gewone sessie (onderwerp = het account). */
  const voorbereider = (run: (o: Onderwerp[], a: Record<string, unknown>) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    return metFouten(() => run([{ soort: 'account', id: auth.user.id, accountId: auth.user.id }], body(ctx.body)));
  }) as RouterMiddleware;
  const wie = (auth: SessionOk): Eigenaar => ({ id: auth.user.id, email: auth.user.email });

  return {
    // `ik`: wie de pagina bekijkt (voor «Розгорнути з цього пристрою»: de eigenaar als voorbereider van zijn eigen pakket).
    'POST /api/owner/uitrol/overzicht': [eigenaar({}, async (_ctx, auth) => ({ ...(await overzicht()), ik: { id: auth.user.id, email: auth.user.email || '' } }))],
    'GET /api/owner/uitrol/log': [eigenaar({}, async () => {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const dir = '/var/lib/mijn-ruimte-uitrol';
        const entries = await fs.promises.readdir(dir).catch(() => []);
        const latest = entries.filter(e => e.startsWith('pakket.')).sort().pop();
        if (!latest) return { log: '' };
        const logPath = path.join(dir, latest, 'installeer.log');
        const buf = await fs.promises.readFile(logPath).catch(() => Buffer.from(''));
        return { log: buf.toString('utf-8').slice(-4000) };
      } catch { return { log: '' }; }
    })],
    'GET /api/owner/uitrol/archief/:versie': [eigenaar({}, async (ctx) => {
      const versie = String(ctx.params?.versie || '').replace(/[^0-9-]/g, '');
      if (!versie) return error(400, 'versie');
      const file = `/srv/mijn-ruimte/releases/mijn-ruimte-${versie}.tar.gz`;
      try {
        const stat = await import('fs').then(fs => fs.promises.stat(file));
        if (!stat.isFile()) return error(404, 'niet gevonden');
        const buf = await import('fs').then(fs => fs.promises.readFile(file));
        return { statusCode: 200, headers: { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="mijn-ruimte-${versie}.tar.gz"` }, body: buf };
      } catch { return error(404, 'niet gevonden'); }
    })],
    'POST /api/owner/uitrol/voorbereiders/toevoegen': [eigenaar({ stepUp: true }, async (ctx, auth) => ({ voorbereider: await grantGeven(wie(auth), body(ctx.body)) }))],
    'POST /api/owner/uitrol/voorbereiders/intrekken': [eigenaar({ sterk: true, reden: true }, async (ctx, auth) => ({ voorbereider: await grantIntrekken(wie(auth), body(ctx.body).id, { reden: body(ctx.body).reden, auth: auth as never }) }))],
    'POST /api/owner/uitrol/voorstel/uitdaging': [eigenaar({}, async (ctx, auth) => goedkeurUitdaging(wie(auth), body(ctx.body).id))],
    'POST /api/owner/uitrol/voorstel/goedkeuren': [eigenaar({}, async (ctx, auth) => {
      const limiet = await rateLimit(`uitrol-goedkeuren:${auth.user.id}`, 10, 600);
      if (!limiet.ok) fout('RATE_LIMITED', 429);
      return goedkeuren(wie(auth), body(ctx.body));
    })],
    'POST /api/owner/uitrol/voorstel/afwijzen': [eigenaar({}, async (ctx, auth) => afwijzen(wie(auth), body(ctx.body).id, body(ctx.body).reden))],
    // Passkeys (registreren, «Може схвалювати оновлення сервера», intrekken): backend/passkeys.ts → Instellingen → «Способи входу».
    // Voorbereiden met een gewone sessie (account-grant). Agents gebruiken de MCP-hulpmiddelen hierboven.
    'POST /api/uitrol/voorstel/begin': [voorbereider(voorstelBegin)],
    'POST /api/uitrol/voorstel/stuk': [voorbereider(voorstelStuk)],
    'POST /api/uitrol/voorstel/klaar': [voorbereider(voorstelKlaar)],
    'POST /api/uitrol/voorstel/status': [voorbereider(voorstelStatus)],
    'POST /api/uitrol/voorstel/annuleren': [voorbereider(voorstelAnnuleren)],
  };
}
