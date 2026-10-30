// SSH-certificaat van één uur (etap C, deel 2). Deze module geeft geen recht en leest geen vlag:
// ssh.host (alleen rol Власник) in een lopende activering is de poort — terminal.servers alleen is NIET genoeg (14.10: een
// SSH-sessie als beheer is toegang tot de host zelf, meer dan een terminal in een container zonder netwerk); de root-schakelaar ssh-ca (exact true) is de handtekening.
// De principal, de duur en de opties kiest het root-script, niet dit verzoek.
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditToevoegen } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import { identiteitVan, minutenUit, principalsVoor, publiekeSleutel, schakelaarAan, SSH_CA_MINUTEN, SSH_CA_PRINCIPAL } from '../shared/ssh-ca';
import { actieveActivatie, TAB_RE, TechFout, type Gebruiker } from './tech-profiel';

const CODES = new Set(['SSH_CA_UIT', 'SSH_CA_NIET_GEREED', 'SSH_CA_SLEUTEL', 'SSH_CA_LIMIET', 'SSH_CA_CONTROLE', 'SSH_CA_TE_OUD', 'SSH_CA_DUUR', 'SSH_CA_PRINCIPAL']);
const CERT_RE = /^ssh-ed25519-cert-v01@openssh.com [A-Za-z0-9+/=]{20,2000}$/;
const VINGER_RE = /^SHA256:[A-Za-z0-9+/]{43}$/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type Uitgifte = { cert: string; geldigTot: string; vinger: string; principal: typeof SSH_CA_PRINCIPAL; principals: string[]; minuten: number; serie: number | null };
export type ActivatieKort = { id: string; mogelijkheden: readonly string[]; rollen?: readonly string[] } | null;
export type SshIo = {
  schakelaar: () => Promise<boolean>;
  schrijf: (id: string, body: string) => Promise<void>;
  wis: (id: string) => Promise<void>;
  start: () => Promise<void>;
  lees: (id: string) => Promise<string | null>;
};

const inboxDir = () => process.env.SSH_CA_INBOX || '/srv/mijn-ruimte/ssh-ca-inbox';
const uitDir = () => process.env.SSH_CA_UIT || '/var/lib/mijn-ruimte/ssh-ca-uit';
const rechtenPad = () => process.env.SSH_CA_RECHTEN || '/etc/mijn-ruimte/mcp-rechten.json';

const audit = (actorId: string, action: string, details: Record<string, unknown>, result: 'success' | 'denied' = 'success') =>
  auditToevoegen({ ownerId: actorId, actorId, action, type: 'beveiliging', result, details }).catch(() => undefined);

export function parseUitgifte(raw: string, gevraagd: { minuten?: number; principals?: readonly string[] } = {}): { ok: true; uitgifte: Uitgifte } | { ok: false; code: string } {
  let d: Record<string, unknown>;
  try { d = JSON.parse(raw) as Record<string, unknown>; } catch { return { ok: false, code: 'SSH_CA_CONTROLE' }; }
  if (d.ok !== true) {
    const code = String(d.code || '');
    return { ok: false, code: CODES.has(code) ? code : 'SSH_CA_CONTROLE' };
  }
  const cert = String(d.cert || '');
  const vinger = String(d.vinger || '');
  if (d.principal !== SSH_CA_PRINCIPAL || !CERT_RE.test(cert) || !VINGER_RE.test(vinger) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(String(d.geldigTot || ''))) {
    return { ok: false, code: 'SSH_CA_CONTROLE' };
  }
  // Root mag niet méér geven dan gevraagd: principals ⊆ gevraagd (standaard beheer), duur = gevraagd.
  const principals = Array.isArray(d.principals) ? d.principals.map(String) : [SSH_CA_PRINCIPAL];
  const toegestaan = new Set(gevraagd.principals ?? [SSH_CA_PRINCIPAL]);
  if (!principals.length || principals.some((p) => !toegestaan.has(p))) return { ok: false, code: 'SSH_CA_CONTROLE' };
  const minuten = d.minuten === undefined ? SSH_CA_MINUTEN : Number(d.minuten);
  if (!Number.isInteger(minuten) || minuten < 5 || minuten > 60 || (gevraagd.minuten !== undefined && minuten !== gevraagd.minuten)) return { ok: false, code: 'SSH_CA_CONTROLE' };
  const serie = d.serie === undefined ? null : Number(d.serie);
  if (serie !== null && !(Number.isSafeInteger(serie) && serie > 0)) return { ok: false, code: 'SSH_CA_CONTROLE' };
  return { ok: true, uitgifte: { cert, geldigTot: String(d.geldigTot), vinger, principal: SSH_CA_PRINCIPAL, principals, minuten, serie } };
}

const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Vraag een certificaat. `activatie` komt van de server (actieveActivatie), nooit uit de body.
 * De vlag speelt hier geen rol: zonder ssh.host (Власник) weigert de server ook als de knop zichtbaar zou zijn.
 */
export async function uitgeven(u: Gebruiker, tab: string, publiekIn: unknown, io: SshIo, activatie: ActivatieKort, opties: { wachtMs?: number; slaapMs?: number; minuten?: unknown } = {}): Promise<Uitgifte> {
  if (!TAB_RE.test(tab)) throw new TechFout('TAB_ONGELDIG');
  if (!activatie?.mogelijkheden.includes('ssh.host')) throw new TechFout('TECH_SSH_CA_VEREIST', 403);
  const publiek = publiekeSleutel(publiekIn);
  if (!publiek) throw new TechFout('SSH_CA_SLEUTEL');
  const minuten = minutenUit(opties.minuten);
  if (minuten === null) throw new TechFout('SSH_CA_DUUR');
  // Principals per rol (shared/ssh-ca.ts); zonder rollen-informatie: ssh.host hoort alleen bij de eigenaar → beheer.
  const toegang = principalsVoor(activatie.rollen?.length ? activatie.rollen : ['eigenaar']);
  if (!toegang.length) throw new TechFout('TECH_SSH_CA_VEREIST', 403);
  if (!(await io.schakelaar())) throw new TechFout('SSH_CA_UIT', 409);
  const id = randomUUID();
  const body = JSON.stringify({ id, publiek, identiteit: identiteitVan(u.email), minuten, toegang });
  if (body.includes('"principal"') || body.includes('"ttl"') || body.length > 2048) throw new TechFout('SSH_CA_SLEUTEL');
  await io.schrijf(id, body);
  await io.start().catch(() => undefined);
  const wacht = opties.wachtMs ?? 8000;
  const stap = opties.slaapMs ?? 200;
  const tot = Date.now() + wacht;
  let raw: string | null = null;
  while (Date.now() < tot) {
    raw = await io.lees(id);
    if (raw) break;
    await slaap(stap);
  }
  if (!raw) {
    await io.wis(id).catch(() => undefined);
    await slaap(stap);
    raw = await io.lees(id);
  }
  if (!raw) throw new TechFout('SSH_CA_GEEN_ANTWOORD', 504);
  const uit = parseUitgifte(raw, { minuten, principals: toegang });
  if (!uit.ok) throw new TechFout(uit.code, uit.code === 'SSH_CA_UIT' ? 409 : 400);
  return uit.uitgifte;
}

async function padIn(map: string, id: string): Promise<string> {
  if (!ID_RE.test(id)) throw new TechFout('SSH_CA_CONTROLE');
  const doel = path.join(map, `${id}.json`);
  if (path.dirname(doel) !== map) throw new TechFout('SSH_CA_CONTROLE');
  return doel;
}

export function standaardIo(): SshIo {
  return {
    async schakelaar() {
      try { return schakelaarAan(JSON.parse(await readFile(rechtenPad(), 'utf8'))); } catch { return false; }
    },
    async schrijf(id, body) {
      const doel = await padIn(inboxDir(), id);
      const tmp = `${doel}.tmp`;
      await writeFile(tmp, body, { mode: 0o640 });
      await rename(tmp, doel);
    },
    async wis(id) { await unlink(await padIn(inboxDir(), id)); },
    start() {
      return new Promise((resolve, reject) => {
        execFile('/usr/bin/systemctl', ['start', '--no-block', '--no-ask-password', 'mijn-ruimte-ssh-ca.service'], { timeout: 5000 }, (err) => err ? reject(err) : resolve());
      });
    },
    async lees(id) {
      try { return await readFile(await padIn(uitDir(), id), 'utf8'); } catch { return null; }
    },
  };
}

/** Productiepad: activering uit de database, daarna het root-script. Het certificaat zelf gaat niet naar het journaal. */
const sys = () => getPool('systeem');

/** Vingerafdruk van de CA uit de laatste stand van root (voor de unieke sleutel ca_vinger + serie). */
async function caVinger(): Promise<string> {
  try { const v = String(JSON.parse(await readFile(path.join(uitDir(), 'beheer-status.json'), 'utf8')).vinger || ''); return VINGER_RE.test(v) ? v : ''; } catch { return ''; }
}

/** Uitgifte vastleggen: serie van root, door wie, tot wanneer (servertijd + minuten), principals. Nooit het certificaat zelf. */
export async function vastleggen(u: Gebruiker, r: Uitgifte, activatieId = ''): Promise<void> {
  if (r.serie === null) return;
  await sys().query(`INSERT INTO app.ssh_ca_certificaten (serie, ca_vinger, vinger, user_id, email, identiteit, principals, minuten, geldig_tot, activatie_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + make_interval(mins => $8::int), $9) ON CONFLICT (ca_vinger, serie) DO NOTHING`,
  [r.serie, await caVinger(), r.vinger, u.id, String(u.email || ''), identiteitVan(u.email), r.principals, r.minuten, activatieId]);
}

export async function uitgevenVoor(u: Gebruiker, tab: string, publiekIn: unknown, minuten?: unknown): Promise<Uitgifte> {
  const a = TAB_RE.test(tab) ? await actieveActivatie(u.id, tab) : null;
  try {
    const r = await uitgeven(u, tab, publiekIn, standaardIo(), a, { minuten });
    await vastleggen(u, r, a?.id).catch((e) => console.error('[ssh-ca] vastleggen', (e as Error).message));
    await audit(u.id, 'owner.ssh-ca.uitgegeven', { vinger: r.vinger, principal: r.principal, principals: r.principals, minuten: r.minuten, serie: r.serie, viaActivatie: a?.id });
    return r;
  } catch (e) {
    if (e instanceof TechFout) await audit(u.id, 'owner.ssh-ca.geweigerd', { code: e.code }, 'denied');
    throw e;
  }
}
