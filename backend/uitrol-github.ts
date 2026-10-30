// Publiceren van een geïnstalleerde release op GitHub en downloaden van bewaarde releases (audit 18.10.2026, punt 4).
//
// Waarom de site en niet root:
//  - Vroeger maakte het root-script de release met een token uit /etc/mijn-ruimte/github-token en een JSON-body die met tekst-
//    vervanging werd gebouwd (een aanhalingsteken of nieuwe regel in SAMENVATTING brak de JSON). Het zocht bovendien een archief dat nooit
//    bestond, dus er werd nooit iets gepubliceerd (laatste tag 08.10.2026).
//  - De token hoort in de kluis van de eigenaar (versleuteld, met passkey te tonen/wijzigen, gelogd). Root heeft geen kluis.
//  - Root bewaart het archief (/srv/mijn-ruimte/pakketten) en zet pad + sha256 in de OK-gebeurtenis; backend/uitrol-runs.ts koppelt
//    dat aan de run en roept naInstallatie() aan. Publiceren is daarna gewoon een HTTPS-verzoek vanuit de app.
//
// Token: kluisdoel `github-uitrol` (technisch: fine-grained, Contents: write op één repository) heeft voorrang; anders `github`
// (de persoonlijke PAT van de eigenaar, die ook de GitHub-pagina gebruikt). De token verlaat de server nooit en komt nooit in een
// foutmelding, log of antwoord: fouten worden codes (GITHUB_HTTP_401, GITHUB_NETWERK, …).
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { error, fileDownload, json } from '../server/platform';
import { rateLimit } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { apiPlatformVaultItems, readOwnerVaultPlaintext } from './api-platform-kluis';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { PAKKET_PAD } from './server-beheer';

const API = 'https://api.github.com';
const UPLOADS = 'https://uploads.github.com';
export const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;
const VERSIE = /^\d{8}-\d{6}$/;
const COMMIT40 = /^[0-9a-f]{40}$/;
const RUN_ID = /^[A-Za-z0-9:_.-]{3,80}$/;
export const TOKEN_DOELEN = ['github-uitrol', 'github'] as const;
export type TokenDoel = (typeof TOKEN_DOELEN)[number];
const MAX_POGINGEN = 3;

const sys = () => getPool('systeem');
export const pakkettenDir = () => (process.env.UITROL_PAKKETTEN_DIR || '/srv/mijn-ruimte/pakketten').replace(/\/+$/, '');

// ------------------------------------------------------------------------------------------------ afhankelijkheden (tests)
type TokenBron = (eigenaarId: string) => Promise<{ token: string; doel: TokenDoel; naam: string } | null>;
async function tokenUitKluis(eigenaarId: string) {
  const items = await apiPlatformVaultItems(eigenaarId);
  for (const doel of TOKEN_DOELEN) {
    const item = items.find((r) => r.purpose === doel);
    if (!item) continue;
    try { return { token: await readOwnerVaultPlaintext(eigenaarId, item.keyName, doel), doel, naam: item.keyName }; } catch { /* volgende */ }
  }
  return null;
}
let doFetch: typeof fetch = (...a) => fetch(...a);
let tokenOf: TokenBron = tokenUitKluis;
let slaap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Alleen voor tests. */
export function setUitrolGithubDeps(d: { fetch?: typeof fetch; token?: TokenBron; slaap?: (ms: number) => Promise<void> } | null) {
  doFetch = d?.fetch ?? ((...a) => fetch(...a)); tokenOf = d?.token ?? tokenUitKluis; slaap = d?.slaap ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
}

/** Een fout zonder token: alleen een code en (optioneel) de HTTP-status. */
export class GithubFout extends Error { constructor(public code: string, public status = 0, public tijdelijk = false) { super(code); } }

// ------------------------------------------------------------------------------------------------ instellingen
export type Instellingen = { repo: string; automatisch: boolean; bijgewerkt: string };
export async function instellingenVan(eigenaarId: string): Promise<Instellingen> {
  const r = await sys().query(`SELECT repo, automatisch, bijgewerkt_op FROM app.uitrol_github_instellingen WHERE eigenaar_id = $1`, [eigenaarId]);
  const row = r.rows[0];
  return { repo: String(row?.repo || ''), automatisch: Boolean(row?.automatisch), bijgewerkt: row?.bijgewerkt_op ? new Date(row.bijgewerkt_op).toISOString() : '' };
}
export async function instellingenOpslaan(eigenaar: { id: string; email?: string }, invoer: { repo?: unknown; automatisch?: unknown }): Promise<Instellingen> {
  const repo = String(invoer.repo ?? '').trim();
  if (repo && !REPO.test(repo)) throw new GithubFout('REPO_ONGELDIG', 400);
  const voor = await instellingenVan(eigenaar.id);
  const automatisch = invoer.automatisch === undefined ? voor.automatisch : invoer.automatisch === true;
  await sys().query(`INSERT INTO app.uitrol_github_instellingen (eigenaar_id, repo, automatisch, bijgewerkt_op) VALUES ($1, $2, $3, now())
    ON CONFLICT (eigenaar_id) DO UPDATE SET repo = EXCLUDED.repo, automatisch = EXCLUDED.automatisch, bijgewerkt_op = now()`, [eigenaar.id, repo, automatisch]);
  await schrijfBeheerAudit({ actor: eigenaar, actie: 'owner.uitrol.github.instellingen', doel: { soort: 'github', id: repo || '—' },
    voor: { repo: voor.repo, automatisch: voor.automatisch }, na: { repo, automatisch }, service: 'admin' });
  return instellingenVan(eigenaar.id);
}

/** Stand voor «Налаштування → GitHub»: welke token (alleen naam en doel), repository, automatisch, laatste publicaties. Nooit de token. */
export async function githubStand(eigenaarId: string) {
  const items = await apiPlatformVaultItems(eigenaarId).catch(() => []);
  const tokens = TOKEN_DOELEN.map((doel) => { const it = items.find((r) => r.purpose === doel); return { doel, aanwezig: Boolean(it), naam: it?.keyName || '' }; });
  const gebruikt = tokens.find((t) => t.aanwezig)?.doel || null;
  const inst = await instellingenVan(eigenaarId);
  const log = await sys().query(`SELECT run_id, versie, repo, tag, uitkomst, url, fout, door, tijd FROM app.uitrol_github_publicaties ORDER BY tijd DESC LIMIT 20`);
  return {
    gekoppeld: Boolean(gebruikt), gebruikt, tokens, ...inst,
    klaar: Boolean(gebruikt && inst.repo),
    publicaties: log.rows.map((r) => ({ runId: String(r.run_id), versie: String(r.versie), repo: String(r.repo), tag: String(r.tag), uitkomst: String(r.uitkomst),
      url: String(r.url), fout: String(r.fout), door: String(r.door), tijd: new Date(r.tijd).toISOString() })),
  };
}

// ------------------------------------------------------------------------------------------------ publiceren
type RunRij = { id: string; versie: string; staat: string; pakket_pad: string; pakket_sha256: string; pakket_grootte: number; wijzigingen: string; bron_commit: string; github_release_url: string };
async function runRij(runId: string): Promise<RunRij | null> {
  const r = await sys().query(`SELECT id, versie, staat, pakket_pad, pakket_sha256, pakket_grootte, wijzigingen, bron_commit, github_release_url FROM app.uitrol_runs WHERE id = $1`, [runId]);
  return (r.rows[0] as RunRij) || null;
}

/** De body van de release als echte JSON (aanhalingstekens, nieuwe regels en backslashes blijven heel). */
export function releaseBody(run: { versie: string; wijzigingen: string; bron_commit: string; pakket_sha256: string }) {
  const tag = `uitrol-${run.versie}`;
  const tekst = [
    (run.wijzigingen || '').trim() || '—',
    '',
    `sha256: \`${run.pakket_sha256}\``,
    COMMIT40.test(run.bron_commit) ? `commit: ${run.bron_commit}` : 'commit: невідомо / onbekend (BRON-COMMIT ontbreekt in het pakket)',
  ].join('\n');
  const b: Record<string, unknown> = { tag_name: tag, name: `Mijn Ruimte ${run.versie}`, body: tekst.slice(0, 60000), draft: false, prerelease: false };
  if (COMMIT40.test(run.bron_commit)) b.target_commitish = run.bron_commit;
  return b;
}

async function gh(token: string, url: string, init: { method?: string; body?: unknown; raw?: unknown; type?: string; lengte?: number } = {}) {
  let res: Response;
  try {
    res = await doFetch(url, {
      method: init.method || 'GET', redirect: 'error', signal: AbortSignal.timeout(init.raw ? 15 * 60_000 : 30_000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mijn-ruimte-uitrol', 'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(init.type ? { 'Content-Type': init.type } : {}), ...(init.lengte ? { 'Content-Length': String(init.lengte) } : {}) },
      body: (init.raw as RequestInit["body"]) ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      ...(init.raw ? { duplex: 'half' } : {}),
    } as RequestInit);
  } catch { throw new GithubFout('GITHUB_NETWERK', 0, true); }
  const data = await res.json().catch(() => null) as Record<string, unknown> | null;
  return { status: res.status, data };
}
const httpFout = (status: number) => new GithubFout(`GITHUB_HTTP_${status}`, status, status >= 500 || status === 429);

async function eenPoging(token: string, repo: string, run: RunRij) {
  const tag = `uitrol-${run.versie}`;
  // Idempotent: bestaat de release al (vorige poging, of handmatig), dan die gebruiken.
  let rel = await gh(token, `${API}/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  if (rel.status === 404) rel = await gh(token, `${API}/repos/${repo}/releases`, { method: 'POST', body: releaseBody(run) });
  if (rel.status < 200 || rel.status > 299 || !rel.data) throw httpFout(rel.status);
  const id = Number(rel.data.id), htmlUrl = String(rel.data.html_url || '');
  if (!Number.isSafeInteger(id) || !/^https:\/\/github\.com\//.test(htmlUrl)) throw new GithubFout('GITHUB_ANTWOORD_ONGELDIG', rel.status);
  const naam = `mijn-ruimte-${run.versie}.tar.gz`;
  const assets = Array.isArray(rel.data.assets) ? rel.data.assets as Array<Record<string, unknown>> : [];
  if (!assets.some((a) => a.name === naam)) {
    const s = await stat(run.pakket_pad).catch(() => null);
    if (!s) throw new GithubFout('ARCHIEF_ONTBREEKT');
    const up = await gh(token, `${UPLOADS}/repos/${repo}/releases/${id}/assets?name=${encodeURIComponent(naam)}`,
      { method: 'POST', raw: Readable.toWeb(createReadStream(run.pakket_pad)) as unknown, type: 'application/gzip', lengte: s.size });
    if (up.status < 200 || up.status > 299) throw httpFout(up.status);
  }
  return htmlUrl;
}

const lopend = new Set<string>();
/**
 * Publiceert één run (maximaal 3 pogingen bij netwerk-, 5xx- of 429-fouten; 1 s, 4 s ertussen). Uitkomst in de run (github_*),
 * in het publicatielogboek en in het beheerjournaal. Gooit nooit; geeft { uitkomst, code?, url? }.
 */
export async function publiceer(runId: string, door: { id: string; email?: string } | 'automatisch', eigenaarId?: string) {
  if (!RUN_ID.test(runId)) return { uitkomst: 'fout' as const, code: 'RUN_ONGELDIG' };
  if (lopend.has(runId)) return { uitkomst: 'fout' as const, code: 'AL_BEZIG' };
  lopend.add(runId);
  const doorTekst = door === 'automatisch' ? 'automatisch' : (door.email || door.id);
  const actor = door === 'automatisch' ? null : door;
  const eigenaar = eigenaarId || (door === 'automatisch' ? '' : door.id);
  let run: RunRij | null = null, repo = '';
  const vastleggen = async (uitkomst: 'ok' | 'fout' | 'overgeslagen', code: string, url = '', pogingen = 0) => {
    if (run) {
      await sys().query(`UPDATE app.uitrol_runs SET github_release_url = CASE WHEN $2 <> '' THEN $2 ELSE github_release_url END, github_fout = $3,
          github_pogingen = github_pogingen + $4, github_op = now() WHERE id = $1`, [run.id, url, uitkomst === 'ok' ? '' : code, pogingen]);
      await sys().query(`INSERT INTO app.uitrol_github_publicaties (run_id, versie, repo, tag, uitkomst, url, fout, door) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [run.id, run.versie, repo, `uitrol-${run.versie}`, uitkomst, url, uitkomst === 'ok' ? '' : code.slice(0, 400), doorTekst]);
    }
    await schrijfBeheerAudit({ actor, eigenaar: eigenaar || null, actie: uitkomst === 'ok' ? 'owner.uitrol.github.gepubliceerd' : 'owner.uitrol.github.mislukt',
      doel: { soort: 'release', id: run?.versie || runId, naam: repo || undefined }, resultaat: uitkomst === 'ok' ? 'success' : uitkomst === 'overgeslagen' ? 'denied' : 'failure',
      details: { code, url: url || undefined, pogingen, door: doorTekst }, service: 'admin' });
    return { uitkomst, code: uitkomst === 'ok' ? undefined : code, url: url || undefined };
  };
  try {
    run = await runRij(runId);
    if (!run) { run = null; return await vastleggen('fout', 'RUN_ONBEKEND'); }
    if (run.staat !== 'klaar') return await vastleggen('overgeslagen', 'RUN_NIET_KLAAR');
    if (!VERSIE.test(run.versie)) return await vastleggen('overgeslagen', 'VERSIE_ONGELDIG');
    if (!run.pakket_pad || !PAKKET_PAD.test(run.pakket_pad) || !run.pakket_sha256) return await vastleggen('overgeslagen', 'ARCHIEF_NIET_BEWAARD');
    if (!eigenaar) return await vastleggen('overgeslagen', 'GEEN_EIGENAAR');
    repo = (await instellingenVan(eigenaar)).repo;
    if (!repo) return await vastleggen('overgeslagen', 'GEEN_REPO');
    const tok = await tokenOf(eigenaar);
    if (!tok) return await vastleggen('overgeslagen', 'GITHUB_NIET_GEKOPPELD');
    let laatste: GithubFout = new GithubFout('ONBEKEND');
    for (let poging = 1; poging <= MAX_POGINGEN; poging++) {
      try { const url = await eenPoging(tok.token, repo, run); return await vastleggen('ok', 'OK', url, poging); }
      catch (e) {
        laatste = e instanceof GithubFout ? e : new GithubFout('ONBEKEND');
        if (!laatste.tijdelijk || poging === MAX_POGINGEN) return await vastleggen('fout', laatste.code, '', poging);
        await slaap(poging === 1 ? 1000 : 4000);
      }
    }
    return await vastleggen('fout', laatste.code, '', MAX_POGINGEN);
  } catch (e) {
    console.error('[uitrol-github] publiceren mislukt:', e instanceof GithubFout ? e.code : 'onverwacht');
    return { uitkomst: 'fout' as const, code: e instanceof GithubFout ? e.code : 'ONVERWACHT' };
  } finally { lopend.delete(runId); }
}

/** Na het koppelen van een nieuw archief (backend/uitrol-runs.ts): automatisch publiceren als de eigenaar dat aanzette. Nooit wachten. */
export function naInstallatie(runId: string) {
  void (async () => {
    try {
      const r = await sys().query(`SELECT eigenaar_id FROM app.uitrol_github_instellingen WHERE automatisch AND repo <> '' ORDER BY bijgewerkt_op DESC LIMIT 1`);
      const eigenaar = r.rows[0]?.eigenaar_id ? String(r.rows[0].eigenaar_id) : '';
      if (eigenaar) await publiceer(runId, 'automatisch', eigenaar);
    } catch (err) { console.error('[uitrol-github] wachtrij:', (err as Error).message); }
  })();
}

// ------------------------------------------------------------------------------------------------ archieven (download, opruimen)
/** Het bestand van een run, alleen als het pad in de archiefmap ligt en de naam bij de versie past. */
export async function archiefVanRun(runId: string): Promise<{ pad: string; naam: string; sha256: string; grootte: number; versie: string } | null> {
  if (!RUN_ID.test(runId)) return null;
  const run = await runRij(runId);
  if (!run || !run.pakket_pad || !VERSIE.test(run.versie)) return null;
  const dir = pakkettenDir(), naam = `mijn-ruimte-${run.versie}.tar.gz`;
  const pad = path.resolve(run.pakket_pad);
  if (pad !== path.join(dir, naam)) return null;
  const s = await stat(pad).catch(() => null);
  if (!s || !s.isFile()) return null;
  return { pad, naam, sha256: run.pakket_sha256, grootte: s.size, versie: run.versie };
}

/** Overzicht van de archiefmap: aantal, totale grootte, oudste en nieuwste versie. */
export async function archiefOverzicht() {
  const dir = pakkettenDir();
  const namen = (await readdir(dir).catch(() => [] as string[])).filter((n) => /^mijn-ruimte-\d{8}-\d{6}\.tar\.gz$/.test(n)).sort();
  let totaal = 0;
  for (const n of namen) totaal += (await stat(path.join(dir, n)).catch(() => null))?.size || 0;
  return { aantal: namen.length, bytes: totaal, oudste: namen[0]?.slice(12, 27) || '', nieuwste: namen.at(-1)?.slice(12, 27) || '' };
}

/** Verwijdert archieven ouder dan de N nieuwste (N ≥ 3). De actieve release blijft altijd. Run-rijen houden hun sha256; alleen het pad wordt leeg. */
export async function archievenOpruimen(eigenaar: { id: string; email?: string }, bewaar: unknown) {
  const n = Number(bewaar);
  if (!Number.isInteger(n) || n < 3 || n > 500) throw new GithubFout('BEWAAR_ONGELDIG', 400);
  const dir = pakkettenDir();
  const namen = (await readdir(dir).catch(() => [] as string[])).filter((x) => /^mijn-ruimte-\d{8}-\d{6}\.tar\.gz$/.test(x)).sort().reverse();
  const actief = await sys().query(`SELECT versie FROM app.uitrol_runs WHERE staat = 'klaar' AND versie <> '' ORDER BY geeindigd_op DESC NULLS LAST LIMIT 1`).then((r) => String(r.rows[0]?.versie || '')).catch(() => '');
  const weg = namen.slice(n).filter((x) => x !== `mijn-ruimte-${actief}.tar.gz`);
  let bytes = 0;
  for (const x of weg) {
    const p = path.join(dir, x);
    bytes += (await stat(p).catch(() => null))?.size || 0;
    await unlink(p).catch(() => undefined); await unlink(`${p}.sha256`).catch(() => undefined);
    await sys().query(`UPDATE app.uitrol_runs SET pakket_pad = '' WHERE pakket_pad = $1`, [p]);
  }
  await schrijfBeheerAudit({ actor: eigenaar, actie: 'owner.uitrol.pakket.opgeruimd', doel: { soort: 'pakketten', id: String(weg.length) }, details: { bewaar: n, verwijderd: weg.map((x) => x.slice(12, 27)), bytes }, service: 'admin' });
  return { ...(await archiefOverzicht()), verwijderd: weg.length, verwijderdBytes: bytes };
}

// ------------------------------------------------------------------------------------------------ eenmalige downloadlinks
export const DOWNLOAD_SEC = 300;
const links = new Map<string, { userId: string; runId: string; tot: number }>();
export function downloadLinkMaken(userId: string, runId: string) {
  const nu = Date.now();
  for (const [k, v] of links) if (v.tot < nu) links.delete(k);
  const id = randomBytes(24).toString('base64url');
  links.set(id, { userId, runId, tot: nu + DOWNLOAD_SEC * 1000 });
  return id;
}
export function downloadLinkGebruiken(id: string, userId: string, runId: string) {
  const l = links.get(id);
  if (!l) return false;
  links.delete(id);
  return l.userId === userId && l.runId === runId && l.tot >= Date.now();
}

// ------------------------------------------------------------------------------------------------ routes
type Ctx = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
type SessionOk = { user: { id: string; email: string; role?: string }; service?: string };
type Resp = Awaited<ReturnType<RouterMiddleware>>;
export type GithubRouteDeps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
  isEigenaar: (u: SessionOk['user']) => boolean;
  sterkeStapOp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null>;
};
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;

export function uitrolGithubRoutes(deps: GithubRouteDeps): Record<string, RouterMiddleware[]> {
  const eigenaar = (opts: { sterk?: boolean }, run: (ctx: Ctx, auth: SessionOk) => Promise<Resp | unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    if (!deps.isEigenaar(auth.user)) return error('OWNER_REQUIRED', 403);
    if (opts.sterk) {
      if (!deps.sterkeStapOp) return error('STEP_UP_STRONG_REQUIRED', 403);
      const su = await deps.sterkeStapOp(ctx, auth);
      if (su) return su;
    }
    try {
      const uit = await run(ctx, auth);
      return uit && typeof uit === 'object' && 'statusCode' in (uit as object) ? uit as Resp : json(uit);
    } catch (e) {
      if (e instanceof GithubFout) return error(e.code, e.status >= 400 && e.status < 500 ? e.status : 400);
      console.error('[uitrol-github] route:', (e as Error).message);
      return error('UITROL_GITHUB_FOUT', 500);
    }
  }) as RouterMiddleware;
  const wie = (a: SessionOk) => ({ id: a.user.id, email: a.user.email });

  return {
    'POST /api/owner/uitrol/github/stand': [eigenaar({}, async (_c, a) => ({ ...(await githubStand(a.user.id)), archief: await archiefOverzicht() }))],
    'POST /api/owner/uitrol/github/instellingen': [eigenaar({ sterk: true }, async (c, a) => ({ instellingen: await instellingenOpslaan(wie(a), lichaam(c.body)) }))],
    'POST /api/owner/uitrol/github/publiceren': [eigenaar({ sterk: true }, async (c, a) => {
      const limiet = await rateLimit(`uitrol-github:${a.user.id}`, 10, 3600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      return publiceer(String(lichaam(c.body).run || ''), wie(a), a.user.id);
    })],
    // Downloaden van een bewaard pakket in twee stappen (zoals de nachtelijke back-ups): 1) link — eigenaar + sterke bevestiging
    // (passkey/TOTP/herstelcode, client.ts vraagt die zelf), 20 per uur, eenmalige downloadId (5 min, gebonden aan account en run);
    // 2) bestand — dezelfde eigenaar met die downloadId, één keer. Bestand via de vaste allowlist in server/start.ts. Beide in het journaal.
    'POST /api/owner/uitrol/pakket/:runId/link': [eigenaar({ sterk: true }, async (c, a) => {
      const limiet = await rateLimit(`uitrol-pakket:${a.user.id}`, 20, 3600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      const runId = String(c.params?.runId || '');
      const arch = await archiefVanRun(runId);
      if (!arch) {
        await schrijfBeheerAudit({ actor: wie(a), actie: 'owner.uitrol.pakket.gedownload', doel: { soort: 'run', id: runId.slice(0, 80) }, resultaat: 'failure', details: { code: 'ARCHIEF_NIET_BEWAARD' }, service: 'admin' });
        return error('ARCHIEF_NIET_BEWAARD', 404);
      }
      return { downloadId: downloadLinkMaken(a.user.id, runId), naam: arch.naam, sha256: arch.sha256, grootte: arch.grootte, geldigSec: DOWNLOAD_SEC };
    })],
    'POST /api/owner/uitrol/pakket/:runId': [eigenaar({}, async (c, a) => {
      const runId = String(c.params?.runId || '');
      if (!downloadLinkGebruiken(String(lichaam(c.body).downloadId || ''), a.user.id, runId)) return error('DOWNLOAD_LINK_ONGELDIG', 403);
      const arch = await archiefVanRun(runId);
      if (!arch) return error('ARCHIEF_NIET_BEWAARD', 404);
      await schrijfBeheerAudit({ actor: wie(a), actie: 'owner.uitrol.pakket.gedownload', doel: { soort: 'release', id: arch.versie }, details: { run: runId, sha256: arch.sha256, bytes: arch.grootte }, service: 'admin' });
      const r = fileDownload(arch.pad, arch.naam, 'application/gzip');
      r.headers = { ...r.headers, 'X-Pakket-Sha256': arch.sha256 };
      return r;
    })],
    'POST /api/owner/uitrol/pakketten/opruimen': [eigenaar({ sterk: true }, async (c, a) => archievenOpruimen(wie(a), lichaam(c.body).bewaar))],
  };
}
