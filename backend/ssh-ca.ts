// SSH-certificaat van één uur (etap C, deel 2). Deze module geeft geen recht en leest geen vlag:
// terminal.servers in een lopende activering is de poort; de root-schakelaar ssh-ca (exact true) is de handtekening.
// De principal, de duur en de opties kiest het root-script, niet dit verzoek.
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditToevoegen } from '../server/platform/audit';
import { identiteitVan, publiekeSleutel, schakelaarAan, SSH_CA_MINUTEN, SSH_CA_PRINCIPAL } from '../shared/ssh-ca';
import { actieveActivatie, TAB_RE, TechFout, type Gebruiker } from './tech-profiel';

const CODES = new Set(['SSH_CA_UIT', 'SSH_CA_NIET_GEREED', 'SSH_CA_SLEUTEL', 'SSH_CA_LIMIET', 'SSH_CA_CONTROLE', 'SSH_CA_TE_OUD']);
const CERT_RE = /^ssh-ed25519-cert-v01@openssh.com [A-Za-z0-9+/=]{20,2000}$/;
const VINGER_RE = /^SHA256:[A-Za-z0-9+/]{43}$/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type Uitgifte = { cert: string; geldigTot: string; vinger: string; principal: typeof SSH_CA_PRINCIPAL; minuten: number };
export type ActivatieKort = { id: string; mogelijkheden: readonly string[] } | null;
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

export function parseUitgifte(raw: string): { ok: true; uitgifte: Uitgifte } | { ok: false; code: string } {
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
  return { ok: true, uitgifte: { cert, geldigTot: String(d.geldigTot), vinger, principal: SSH_CA_PRINCIPAL, minuten: SSH_CA_MINUTEN } };
}

const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Vraag een certificaat. `activatie` komt van de server (actieveActivatie), nooit uit de body.
 * De vlag speelt hier geen rol: zonder terminal.servers weigert de server ook als de knop zichtbaar zou zijn.
 */
export async function uitgeven(u: Gebruiker, tab: string, publiekIn: unknown, io: SshIo, activatie: ActivatieKort, opties: { wachtMs?: number; slaapMs?: number } = {}): Promise<Uitgifte> {
  if (!TAB_RE.test(tab)) throw new TechFout('TAB_ONGELDIG');
  if (!activatie?.mogelijkheden.includes('terminal.servers')) throw new TechFout('TECH_SSH_CA_VEREIST', 403);
  const publiek = publiekeSleutel(publiekIn);
  if (!publiek) throw new TechFout('SSH_CA_SLEUTEL');
  if (!(await io.schakelaar())) throw new TechFout('SSH_CA_UIT', 409);
  const id = randomUUID();
  const body = JSON.stringify({ id, publiek, identiteit: identiteitVan(u.email) });
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
  const uit = parseUitgifte(raw);
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
export async function uitgevenVoor(u: Gebruiker, tab: string, publiekIn: unknown): Promise<Uitgifte> {
  const a = TAB_RE.test(tab) ? await actieveActivatie(u.id, tab) : null;
  try {
    const r = await uitgeven(u, tab, publiekIn, standaardIo(), a);
    await audit(u.id, 'owner.ssh-ca.uitgegeven', { vinger: r.vinger, principal: r.principal, minuten: r.minuten, viaActivatie: a?.id });
    return r;
  } catch (e) {
    if (e instanceof TechFout) await audit(u.id, 'owner.ssh-ca.geweigerd', { code: e.code }, 'denied');
    throw e;
  }
}
