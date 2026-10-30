// EIGEN LOGO'S VAN DE BEHEERDER (BYOS, 21.10.2026) — de serverkant. Regels en ontsmetting: shared/merk-eigen.ts.
//
//   • map    — MERK_EIGEN_MAP (standaard /srv/mijn-ruimte/merk-eigen). De beheerder legt er <sleutel>.svg of <sleutel>.png in (het
//              bestand dat hij zelf van de officiële merkpagina van de dienst haalde). De server leest de map; wat niet door de
//              controle komt, wordt OVERGESLAGEN en in het antwoord voor de beheerder genoemd (nooit stil «half» getoond).
//   • lezen  — POST /api/owner/merk-eigen/lijst: elke goedgekeurde sessie (logo's staan op elke pagina). Antwoord: de logo's als
//              data-URI (de browser zet ze in een <img>; een SVG in <img> voert geen script uit) + een hash per bestand.
//   • zetten — POST /api/owner/admin/merk-eigen/zetten en …/wissen: alleen de EIGENAAR, op admin, met een verse passkey-bevestiging
//              (STEP_UP_REQUIRED, methods ['passkey'], zoals de beveiligingsschakelaars). Het bestand gaat door DEZELFDE controle
//              en wordt atomair geschreven (tijdelijk bestand + rename). Elke wijziging komt in het beheerjournaal.
// Deze module haalt niets van buiten. (Logo's van domeinen — BIMI/website — haalt sinds 21.10.2026 backend/merk-bron.ts, met een
// eigen schakelaar van de eigenaar; een eigen bestand van de beheerder gaat daar altijd vóór.)
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { passkeyStapOpGeldig, stapOpVerbruiken, type StapOpAuth } from './stap-op';
import { isEigenaar } from './tech-profiel';
import {
  MERK_EIGEN_MAX_AANTAL, MERK_EIGEN_MAX_BYTES, MERK_EIGEN_SLEUTEL, MERK_EIGEN_STANDAARD_MAP,
  controleerMerkEigen, merkEigenBestandsnaam, merkEigenDataUri, type MerkEigenSoort,
} from '../shared/merk-eigen';

export const merkEigenMap = () => (process.env.MERK_EIGEN_MAP || MERK_EIGEN_STANDAARD_MAP).replace(/\/+$/, '');

export type MerkEigenRij = { sleutel: string; soort: MerkEigenSoort; data: string; hash: string; bytes: number };
export type MerkEigenGeweigerd = { bestand: string; reden: string };

let cache: { sleutel: string; op: number; rijen: MerkEigenRij[]; geweigerd: MerkEigenGeweigerd[] } | null = null;
const CACHE_MS = 30_000;
/** Na zetten/wissen meteen opnieuw lezen. */
export const merkEigenCacheWeg = () => { cache = null; };

/** Leest de map (met een korte cache op naam+grootte+mtime). Een ontbrekende map = geen eigen logo's, geen fout. */
export async function merkEigenLezen(): Promise<{ rijen: MerkEigenRij[]; geweigerd: MerkEigenGeweigerd[] }> {
  const map = merkEigenMap();
  let namen: string[] = [];
  try { namen = (await readdir(map)).filter((n) => !n.startsWith('.')).sort(); } catch { return { rijen: [], geweigerd: [] }; }
  const kenmerk: string[] = [];
  for (const n of namen.slice(0, MERK_EIGEN_MAX_AANTAL * 2)) { try { const st = await stat(join(map, n)); kenmerk.push(`${n}:${st.size}:${st.mtimeMs}`); } catch { /* weg */ } }
  const sleutel = kenmerk.join('|');
  if (cache && cache.sleutel === sleutel && Date.now() - cache.op < CACHE_MS) return cache;
  const rijen: MerkEigenRij[] = [], geweigerd: MerkEigenGeweigerd[] = [];
  const gezien = new Set<string>();
  for (const n of namen) {
    const b = merkEigenBestandsnaam(n);
    if (!b) { geweigerd.push({ bestand: n, reden: 'NAAM' }); continue; }
    if (gezien.has(b.sleutel)) { geweigerd.push({ bestand: n, reden: 'DUBBEL' }); continue; }
    if (rijen.length >= MERK_EIGEN_MAX_AANTAL) { geweigerd.push({ bestand: n, reden: 'TE_VEEL' }); continue; }
    try {
      const st = await stat(join(map, n));
      if (!st.isFile()) { geweigerd.push({ bestand: n, reden: 'GEEN_BESTAND' }); continue; }
      if (st.size > MERK_EIGEN_MAX_BYTES) { geweigerd.push({ bestand: n, reden: 'TE_GROOT' }); continue; }
      const u = controleerMerkEigen(b.soort, await readFile(join(map, n)));
      if (!u.ok) { geweigerd.push({ bestand: n, reden: u.reden }); continue; }
      gezien.add(b.sleutel);
      rijen.push({ sleutel: b.sleutel, soort: u.soort, data: merkEigenDataUri(u.soort, u.inhoud), hash: createHash('sha256').update(u.inhoud).digest('hex').slice(0, 16), bytes: u.inhoud.length });
    } catch { geweigerd.push({ bestand: n, reden: 'ONLEESBAAR' }); }
  }
  cache = { sleutel, op: Date.now(), rijen, geweigerd };
  return cache;
}

/** Schrijft één bestand (na controle) atomair in de map; wist een eventueel bestand van de andere soort voor dezelfde sleutel. */
export async function merkEigenZetten(sleutel: string, soort: MerkEigenSoort, inhoud: Buffer): Promise<{ ok: true; rij: MerkEigenRij } | { ok: false; reden: string }> {
  if (!MERK_EIGEN_SLEUTEL.test(sleutel)) return { ok: false, reden: 'SLEUTEL' };
  const u = controleerMerkEigen(soort, inhoud);
  if (!u.ok) return u;
  const map = merkEigenMap();
  await mkdir(map, { recursive: true, mode: 0o755 });
  // Beveiligingsreview 21.10.2026: zonder deze grens schreef «zetten» onbeperkt nieuwe sleutels weg, terwijl `merkEigenLezen` er
  // hoogstens MERK_EIGEN_MAX_AANTAL toont (de rest stil «TE_VEEL») — de beheerder kreeg «bewaard» voor een logo dat nooit verscheen,
  // en de map op de schijf groeide zonder bovengrens. Vervangen van een BESTAANDE sleutel mag altijd.
  const bestaande = new Set((await readdir(map).catch(() => [] as string[])).map((n) => merkEigenBestandsnaam(n)?.sleutel).filter((k): k is string => !!k));
  if (!bestaande.has(sleutel) && bestaande.size >= MERK_EIGEN_MAX_AANTAL) return { ok: false, reden: 'TE_VEEL' };
  const doel = join(map, `${sleutel}.${soort}`);
  const tmp = join(map, `.${sleutel}.${randomBytes(6).toString('hex')}.tmp`);
  await writeFile(tmp, u.inhoud, { mode: 0o644 });
  await rename(tmp, doel);
  await rm(join(map, `${sleutel}.${soort === 'svg' ? 'png' : 'svg'}`), { force: true });
  merkEigenCacheWeg();
  return { ok: true, rij: { sleutel, soort, data: merkEigenDataUri(soort, u.inhoud), hash: createHash('sha256').update(u.inhoud).digest('hex').slice(0, 16), bytes: u.inhoud.length } };
}

export async function merkEigenWissen(sleutel: string): Promise<boolean> {
  if (!MERK_EIGEN_SLEUTEL.test(sleutel)) return false;
  const map = merkEigenMap();
  let weg = false;
  for (const soort of ['svg', 'png'] as const) {
    try { await stat(join(map, `${sleutel}.${soort}`)); await rm(join(map, `${sleutel}.${soort}`), { force: true }); weg = true; } catch { /* niet aanwezig */ }
  }
  merkEigenCacheWeg();
  return weg;
}

type Gebruiker = { id: string; email: string; role?: string; status: string };
type SessieOk = { service: string; user: Gebruiker };
type Ctx = { event: Record<string, unknown>; body: unknown };
type Deps = { requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessieOk | { errorCode: string }> };
const lijf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});

export function merkEigenRoutes(deps: Deps): Record<string, RouterMiddleware[]> {
  const beheer = (run: (auth: SessieOk, b: Record<string, unknown>) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    const b = lijf(ctx.body);
    const actor = { id: auth.user.id, email: auth.user.email };
    const sleutel = String(b.sleutel || '').slice(0, 41);
    if (!isEigenaar(auth.user as never)) {
      await schrijfBeheerAudit({ actor, doel: { soort: 'merk', naam: sleutel || '-' }, actie: 'integration.merk-eigen.geweigerd', resultaat: 'denied', reden: 'OWNER_REQUIRED' });
      return error('OWNER_REQUIRED', 403);
    }
    if (!(await passkeyStapOpGeldig(auth as unknown as StapOpAuth))) {
      await schrijfBeheerAudit({ actor, doel: { soort: 'merk', naam: sleutel || '-' }, actie: 'integration.merk-eigen.geweigerd', resultaat: 'denied', reden: 'STEP_UP_REQUIRED' });
      return json({ error: 'STEP_UP_REQUIRED', reasonCode: 'STEP_UP_REQUIRED', methods: ['passkey'], maxAgeSeconds: 300 }, 403);
    }
    try {
      const uit = await run(auth, b);
      await stapOpVerbruiken(auth as unknown as StapOpAuth);
      return json(uit);
    } catch (e) {
      const code = (e as Error).message || 'MERK_EIGEN_FOUT';
      if (/^[A-Z][A-Z0-9_]{2,60}$/.test(code)) return error(code, 400);
      console.error('[merk-eigen]', code); return error('MERK_EIGEN_FOUT', 500);
    }
  }) as RouterMiddleware;

  return {
    'POST /api/owner/merk-eigen/lijst': [(async (raw) => {
      const ctx = raw as unknown as Ctx;
      const auth = await deps.requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth || auth.user.status !== 'approved') return error('OWNER_APPROVED_SESSION_REQUIRED', 403);
      const { rijen, geweigerd } = await merkEigenLezen();
      // De weigeringen (bestandsnaam + reden) alleen voor de eigenaar: een gewone gebruiker heeft niets aan de inhoud van de map.
      return json({ ok: true, merken: rijen.map(({ sleutel, soort, data, hash }) => ({ sleutel, soort, data, hash })), ...(isEigenaar(auth.user as never) ? { geweigerd, map: merkEigenMap() } : {}) });
    }) as RouterMiddleware],
    'POST /api/owner/admin/merk-eigen/zetten': [beheer(async (auth, b) => {
      const sleutel = String(b.sleutel || ''), soort = b.soort === 'png' ? 'png' : b.soort === 'svg' ? 'svg' : '';
      if (!soort) throw new Error('MERK_EIGEN_SOORT');
      const data = String(b.data || '');
      if (!/^[A-Za-z0-9+/=\s]+$/.test(data) || data.length > Math.ceil(MERK_EIGEN_MAX_BYTES * 4 / 3) + 16) throw new Error('MERK_EIGEN_TE_GROOT');
      const u = await merkEigenZetten(sleutel, soort, Buffer.from(data.replace(/\s+/g, ''), 'base64'));
      await schrijfBeheerAudit({ actor: { id: auth.user.id, email: auth.user.email }, doel: { soort: 'merk', naam: sleutel }, actie: 'integration.merk-eigen.gezet', resultaat: u.ok ? 'success' : 'denied', reden: u.ok ? undefined : u.reden, details: u.ok ? { soort, bytes: u.rij.bytes, hash: u.rij.hash } : { soort } });
      if (!u.ok) throw new Error(`MERK_EIGEN_${u.reden}`.slice(0, 60).replace(/[^A-Z0-9_]/g, '_'));
      return { ok: true, merk: { sleutel: u.rij.sleutel, soort: u.rij.soort, hash: u.rij.hash, bytes: u.rij.bytes } };
    })],
    'POST /api/owner/admin/merk-eigen/wissen': [beheer(async (auth, b) => {
      const sleutel = String(b.sleutel || '');
      const weg = await merkEigenWissen(sleutel);
      await schrijfBeheerAudit({ actor: { id: auth.user.id, email: auth.user.email }, doel: { soort: 'merk', naam: sleutel }, actie: 'integration.merk-eigen.gewist', resultaat: weg ? 'success' : 'failure' });
      return { ok: true, gewist: weg };
    })],
  };
}
