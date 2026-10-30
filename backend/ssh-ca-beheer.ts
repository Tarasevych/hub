// SSH-CA beheren vanaf de site (18.10.2026): stand, «Voorbereiden», «Aanzetten», «Uitzetten», «Ontmantelen», intrekken (KRL),
// lijst van uitgegeven certificaten. De site voert zelf niets als root uit: ze schrijft een verzoek in /srv/mijn-ruimte/ssh-ca-beheer
// en start mijn-ruimte-ssh-ca-beheer.service (polkit: alleen «start» van die vaste naam). Root (deploy/ssh-ca/mijn-ruimte-ssh-ca.sh
// beheer) controleert alles opnieuw: voor «inrichten» en «aan» de passkey-assertie met ZIJN sleutelbestand (goedkeur-hulp
// verifieer-ssh-ca), en elke sshd-wijziging met `sshd -t` vóór herladen, met terugzetten bij een fout.
//
// Poort aan de site: eigenaar (isEigenaar) + ssh.host in de actieve activering van dit tabblad + stap-op (route). Agents nooit
// (AGENT_VERBODEN: /api/ssh-ca/). Alles in het journaal (owner.ssh-ca.*).
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as kern from '../deploy/goedkeuring/webauthn-kern.mjs';
import { auditToevoegen } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import { SSH_CA_BEHEER_ACTIES, SSH_CA_PASSKEY_ACTIES, type SshCaBeheerActie, type SshCaCertRij, type SshCaStand } from '../shared/ssh-ca';
import { actieveActivatie, isEigenaar, TAB_RE, TechFout, type Gebruiker } from './tech-profiel';
import type { ActivatieKort } from './ssh-ca';

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROOT_CODES = new Set(['OK', 'SSH_CA_PASSKEY', 'SSH_CA_SSHD_ONGELDIG', 'SSH_CA_SSHD_HERLADEN', 'SSH_CA_SSHD_GEEN_INCLUDE', 'SSH_CA_SSHD_NIET_ACTIEF',
  'SSH_CA_NIET_GEREED', 'SSH_CA_RECHTEN', 'SSH_CA_KRL', 'SSH_CA_SERIE', 'SSH_CA_ACTIE', 'SSH_CA_TE_OUD', 'SSH_CA_CONTROLE']);

export type BeheerIo = {
  schrijf: (id: string, body: string) => Promise<void>;
  wis: (id: string) => Promise<void>;
  start: () => Promise<void>;
  lees: (naam: string) => Promise<string | null>;
};
export type PasskeyDeps = {
  sleutels: () => Promise<{ rpId: string; origins: string[]; sleutels: unknown[] }>;
  maak: (userId: string, onderwerp: string, velden: Record<string, unknown>) => Promise<{ id: string; nonce: string; verloopt: number; uitdaging: string }>;
  verbruik: (userId: string, id: unknown) => Promise<{ onderwerp: string; nonce: string; verloopt: number }>;
  opties: (uitdaging: string, b: never) => unknown;
  assertie: (v: unknown) => kern.Assertie;
};
export type RootAntwoord = { ok: boolean; code: string; uk?: string; nl?: string; detail?: string; stand?: SshCaStand; ingetrokken?: number[] };

const beheerInbox = () => process.env.SSH_CA_BEHEER_INBOX || '/srv/mijn-ruimte/ssh-ca-beheer';
const uitDir = () => process.env.SSH_CA_UIT || '/var/lib/mijn-ruimte/ssh-ca-uit';
const sys = () => getPool('systeem');
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));
const audit = (actorId: string, action: string, details: Record<string, unknown>, result: 'success' | 'denied' = 'success') =>
  auditToevoegen({ ownerId: actorId, actorId, action, type: 'beveiliging', result, details }).catch(() => undefined);

/** Eigenaar + ssh.host in de activering van DIT tabblad. Alles daarbuiten: 403. */
export function poort(u: Gebruiker, activatie: ActivatieKort): void {
  if (!isEigenaar(u)) throw new TechFout('OWNER_REQUIRED', 403);
  if (!activatie?.mogelijkheden.includes('ssh.host')) throw new TechFout('TECH_SSH_CA_VEREIST', 403);
}

export function parseStand(raw: string | null): SshCaStand | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    const b = (k: string) => d[k] === true;
    return {
      bijgewerkt: String(d.bijgewerkt || '').slice(0, 25), ca: b('ca'), vinger: /^SHA256:[A-Za-z0-9+/]{43}$/.test(String(d.vinger || '')) ? String(d.vinger) : '',
      include: b('include'), dropin: b('dropin'), sshdVertrouwt: b('sshdVertrouwt'), krl: b('krl'), ingetrokken: Number.isSafeInteger(d.ingetrokken) ? Number(d.ingetrokken) : 0,
      schakelaar: b('schakelaar'), pathUnit: b('pathUnit'), account: /^[a-z_][a-z0-9_-]{0,31}$/.test(String(d.account || '')) ? String(d.account) : 'beheer',
      principals: Array.isArray(d.principals) ? d.principals.map(String).filter((p) => /^[a-z_][a-z0-9_-]{0,31}$/.test(p)).slice(0, 8) : [],
    };
  } catch { return null; }
}

export function parseAntwoord(raw: string): RootAntwoord {
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    const code = String(d.code || '');
    const st = d.stand ? parseStand(JSON.stringify(d.stand)) : null;
    return {
      ok: d.ok === true && code === 'OK', code: ROOT_CODES.has(code) ? code : 'SSH_CA_CONTROLE',
      uk: typeof d.uk === 'string' ? d.uk.slice(0, 300) : undefined, nl: typeof d.nl === 'string' ? d.nl.slice(0, 300) : undefined,
      detail: typeof d.detail === 'string' ? d.detail.slice(0, 300) : undefined, ...(st ? { stand: st } : {}),
      ...(Array.isArray(d.ingetrokken) ? { ingetrokken: d.ingetrokken.filter((n) => Number.isSafeInteger(n)).map(Number) } : {}),
    };
  } catch { return { ok: false, code: 'SSH_CA_CONTROLE' }; }
}

/** Verzoek naar root en kort wachten op beheer-<id>.json. Geen antwoord → verzoek terugnemen (504). */
async function naarRoot(io: BeheerIo, body: Record<string, unknown>, opties: { wachtMs?: number; slaapMs?: number }): Promise<RootAntwoord> {
  const id = randomUUID();
  const tekst = JSON.stringify({ id, ...body });
  if (tekst.length > 60_000) throw new TechFout('SSH_CA_CONTROLE');
  await io.schrijf(id, tekst);
  await io.start().catch(() => undefined);
  const tot = Date.now() + (opties.wachtMs ?? 25_000);
  const stap = opties.slaapMs ?? 300;
  while (Date.now() < tot) {
    const raw = await io.lees(`beheer-${id}.json`);
    if (raw) return parseAntwoord(raw);
    await slaap(stap);
  }
  await io.wis(id).catch(() => undefined);
  const laat = await io.lees(`beheer-${id}.json`);
  if (laat) return parseAntwoord(laat);
  throw new TechFout('SSH_CA_GEEN_ANTWOORD', 504);
}

export async function stand(u: Gebruiker, activatie: ActivatieKort, io: BeheerIo, vernieuwen: boolean, opties: { wachtMs?: number; slaapMs?: number } = {}): Promise<{ stand: SshCaStand | null }> {
  poort(u, activatie);
  if (vernieuwen) {
    try { const r = await naarRoot(io, { actie: 'status' }, { wachtMs: opties.wachtMs ?? 8000, slaapMs: opties.slaapMs }); if (r.stand) return { stand: r.stand }; } catch { /* laatste bekende stand */ }
  }
  return { stand: parseStand(await io.lees('beheer-status.json')) };
}

/** Stap 1 voor «inrichten»/«aan»: eenmalige challenge (doel ssh-ca, actie in de challenge, ≤ 5 min). */
export async function uitdaging(u: Gebruiker, activatie: ActivatieKort, actieIn: unknown, pk: PasskeyDeps) {
  poort(u, activatie);
  const actie = String(actieIn || '') as SshCaBeheerActie;
  if (!SSH_CA_PASSKEY_ACTIES.includes(actie)) throw new TechFout('SSH_CA_ACTIE');
  const b = await pk.sleutels();
  if (!b.sleutels.length) throw new TechFout('GEEN_PASSKEY', 409);
  const c = await pk.maak(u.id, actie, { actie });
  return { uitdagingId: c.id, verloopt: c.verloopt, actie, publicKey: pk.opties(c.uitdaging, b as never) };
}

/** Stap 2: de actie zelf. «inrichten»/«aan» alleen met een geldige assertie (site controleert vooraf, root beslist). */
export async function beheer(u: Gebruiker, activatie: ActivatieKort, input: { actie?: unknown; uitdagingId?: unknown; assertie?: unknown }, io: BeheerIo, pk: PasskeyDeps,
  opties: { wachtMs?: number; slaapMs?: number } = {}): Promise<RootAntwoord> {
  poort(u, activatie);
  const actie = String(input.actie || '') as SshCaBeheerActie;
  if (!SSH_CA_BEHEER_ACTIES.includes(actie) || actie === 'status') throw new TechFout('SSH_CA_ACTIE');
  let body: Record<string, unknown> = { actie };
  let passkey = '';
  if (SSH_CA_PASSKEY_ACTIES.includes(actie)) {
    if (!input.assertie || !input.uitdagingId) throw new TechFout('SSH_CA_PASSKEY_VEREIST', 403);
    let assertie: kern.Assertie;
    try { assertie = pk.assertie(input.assertie); } catch { throw new TechFout('SSH_CA_PASSKEY_VEREIST', 403); }
    let c: { onderwerp: string; nonce: string; verloopt: number };
    try { c = await pk.verbruik(u.id, input.uitdagingId); } catch { throw new TechFout('UITDAGING_ONGELDIG', 403); }
    if (c.onderwerp !== actie) throw new TechFout('UITDAGING_ONGELDIG', 403);
    const b = await pk.sleutels();
    const r = kern.verifieerAssertie({ assertie, verwachteUitdaging: kern.uitdagingVoor('ssh-ca', { actie, nonce: c.nonce, verloopt: c.verloopt }), rpId: b.rpId, origins: b.origins, sleutels: b.sleutels as never });
    if (!r.ok) {
      await audit(u.id, 'owner.ssh-ca.beheer.geweigerd', { actie, code: `PASSKEY_${r.code}` }, 'denied');
      throw new TechFout(`PASSKEY_${r.code}`, 403);
    }
    passkey = r.vingerafdruk.slice(0, 16);
    body = { actie, doel: 'ssh-ca', nonce: c.nonce, verloopt: c.verloopt, assertie };
  }
  const antwoord = await naarRoot(io, body, opties);
  await audit(u.id, antwoord.ok ? `owner.ssh-ca.${actie}` : 'owner.ssh-ca.beheer.geweigerd', { actie, code: antwoord.code, ...(passkey ? { passkey } : {}), viaActivatie: activatie?.id }, antwoord.ok ? 'success' : 'denied');
  return antwoord;
}

const rij = (r: Record<string, unknown>): SshCaCertRij => {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : null);
  const tot = iso(r.geldig_tot) || '';
  return {
    serie: Number(r.serie), vinger: String(r.vinger), door: String(r.email || r.user_id), aangemaakt: iso(r.aangemaakt_op) || '', geldigTot: tot,
    principals: (r.principals as string[]) || [], minuten: Number(r.minuten), ingetrokken: iso(r.ingetrokken_op), ingetrokkenDoor: r.ingetrokken_door ? String(r.ingetrokken_door) : null,
    reden: String(r.reden || ''), actief: !r.ingetrokken_op && Date.parse(tot) > Date.now(),
  };
};

export async function lijst(u: Gebruiker, activatie: ActivatieKort): Promise<{ certificaten: SshCaCertRij[] }> {
  poort(u, activatie);
  const { rows } = await sys().query(`SELECT serie, vinger, user_id, email, aangemaakt_op, geldig_tot, principals, minuten, ingetrokken_op, ingetrokken_door, reden
    FROM app.ssh_ca_certificaten ORDER BY aangemaakt_op DESC LIMIT 100`);
  return { certificaten: rows.map(rij) };
}

/** Intrekken (veilige richting, geen root-passkey): alleen series die de site heeft uitgegeven en nog niet introk. */
export async function intrekken(u: Gebruiker, activatie: ActivatieKort, input: { series?: unknown; reden?: unknown }, io: BeheerIo, opties: { wachtMs?: number; slaapMs?: number } = {},
  db: { bekend: (series: number[]) => Promise<number[]>; markeer: (series: number[], door: string, reden: string) => Promise<void> } = standaardDb()): Promise<RootAntwoord> {
  poort(u, activatie);
  const series = Array.isArray(input.series) ? [...new Set(input.series.map(Number))] : [];
  if (!series.length || series.length > 100 || series.some((n) => !Number.isSafeInteger(n) || n < 1)) throw new TechFout('SSH_CA_SERIE');
  const reden = String(input.reden ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
  const bekend = await db.bekend(series);
  if (bekend.length !== series.length) throw new TechFout('SSH_CA_SERIE_ONBEKEND', 404);
  const antwoord = await naarRoot(io, { actie: 'intrekken', series }, opties);
  if (antwoord.ok) await db.markeer(series, String(u.email || u.id), reden);
  await audit(u.id, antwoord.ok ? 'owner.ssh-ca.ingetrokken' : 'owner.ssh-ca.beheer.geweigerd', { actie: 'intrekken', series, reden, code: antwoord.code, viaActivatie: activatie?.id }, antwoord.ok ? 'success' : 'denied');
  return antwoord;
}

function standaardDb() {
  return {
    async bekend(series: number[]) {
      const { rows } = await sys().query(`SELECT serie FROM app.ssh_ca_certificaten WHERE serie = ANY($1::bigint[]) AND ingetrokken_op IS NULL`, [series]);
      return rows.map((r) => Number(r.serie));
    },
    async markeer(series: number[], door: string, reden: string) {
      await sys().query(`UPDATE app.ssh_ca_certificaten SET ingetrokken_op = now(), ingetrokken_door = $2, reden = $3 WHERE serie = ANY($1::bigint[]) AND ingetrokken_op IS NULL`, [series, door, reden]);
    },
  };
}

async function padIn(map: string, naam: string): Promise<string> {
  const doel = path.join(map, naam);
  if (path.dirname(doel) !== map) throw new TechFout('SSH_CA_CONTROLE');
  return doel;
}

export function standaardBeheerIo(): BeheerIo {
  return {
    async schrijf(id, body) {
      if (!ID_RE.test(id)) throw new TechFout('SSH_CA_CONTROLE');
      const doel = await padIn(beheerInbox(), `${id}.json`);
      await writeFile(`${doel}.tmp`, body, { mode: 0o640 });
      await rename(`${doel}.tmp`, doel);
    },
    async wis(id) { if (ID_RE.test(id)) await unlink(await padIn(beheerInbox(), `${id}.json`)); },
    start() {
      return new Promise((resolve, reject) => {
        execFile('/usr/bin/systemctl', ['start', '--no-block', '--no-ask-password', 'mijn-ruimte-ssh-ca-beheer.service'], { timeout: 5000 }, (err) => err ? reject(err) : resolve());
      });
    },
    async lees(naam) {
      if (!/^beheer-(status|[0-9a-f-]{36})\.json$/.test(naam)) return null;
      try { return await readFile(await padIn(uitDir(), naam), 'utf8'); } catch { return null; }
    },
  };
}

export async function standaardPasskey(): Promise<PasskeyDeps> {
  const g = await import('./uitrol-goedkeuring');
  return {
    sleutels: () => g.leesSleutels() as never,
    maak: (userId, onderwerp, velden) => g.uitdagingMaken(userId, 'ssh-ca' as never, onderwerp, velden),
    verbruik: (userId, id) => g.uitdagingVerbruiken(userId, id, 'ssh-ca'),
    opties: (uitdaging, b) => g.assertieOpties(uitdaging, b),
    assertie: (v) => g.assertieUit(v),
  };
}

/** Productiepaden (routes): activering uit de database voor dit tabblad. */
export const activatieVoor = async (u: Gebruiker, tab: string): Promise<ActivatieKort> => (TAB_RE.test(tab) ? actieveActivatie(u.id, tab) : null);
