// Cloud vNext — INTEGRATIES (vlag cloud-vnext): één eerlijke statusroute voor het integratiecentrum. De statische catalogus
// (wat kan, wat sleutels vraagt, wat niet bestaat) leeft in shared/cloud-vnext-model.ts en reist met de bundel; deze route geeft
// alleen het LEVENDE deel: Google-accounts (echt gekoppeld of niet), of de M4-omgevingssleutels op de server staan, en of de
// zoekindex de cloudbronnen kent. Niets heet «підключено» zonder deze controle.
//
// VASTE BESLISSINGEN
//   • geen nieuwe OAuth-stromen hier — Google loopt via de bestaande routes (providers/google/connect/start); M4 wordt alleen
//     GERAPPORTEERD (sleutels aanwezig of niet, accounts alleen-lezen uit de stagingtabel), nooit gedaan alsof iets verbonden is;
//   • deze route SCHRIJFT niets en geeft nooit tokens of geheimen terug — alleen booleans, e-mails en statuswoorden;
//   • elke deelcontrole heeft zijn eigen try/catch: valt één bron uit (bv. de M4-tabel bestaat nog niet), dan antwoordt de rest
//     gewoon en blijft het antwoord het contract IntegratiesUit (src/cloud-vnext/cloud-client.ts) volgen;
//   • geen merkafbeeldingen uit src/merk in de cloudbundel (monogrammen, zoals agenda).
import { db, error, json } from '../server/platform';
import { hoortBij, ladeFilter } from '../shared/ruimte-scheiding';
import type { CloudWebdavKoppeling } from '../shared/cloud-vnext-model';
import type { RouterMiddleware } from '../server/platform/router';
import { googleSuiteDriveProviderSnapshot, googleSuiteFotoScopeStatus } from './google-suite-inrichting';
import { PostgresCloudConnections } from './cloud-verbinding-m4-pg';
import { ladeOf } from './ruimte-cloud-agenda';
import { INDEX_BRONNEN } from './zoek/bronnen';
import { veiligeFoutcode, vnextFoutAntwoord } from './cloud-vnext-fout';
import { cloudVlagAan } from './cloud-vlaggen-poort';
import { afhandelenCloudAutomatiseringen, afhandelenCloudWebdav, webdavOverzichtDeel } from './cloud-vnext-webdav';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string; accessLevel?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
const DIENSTEN = ['cloud', 'hub'] as const;

type IntegratiesUit = {
  google: { gekoppeld: boolean; accounts: Array<{ id: string; email: string; actief: boolean; status: string; principalId?: string; sync?: SyncFeit }>; fout?: string };
  photos: { gekoppeld: boolean };
  m4: { stagingAan: boolean; aanbieders: Array<{ id: string; sleutelsAanwezig: boolean; accounts: Array<{ id: string; label: string; status: string }> }> };
  webdav: { koppelingen: CloudWebdavKoppeling[] };
  zoekIndex: { cloud: boolean; drive: boolean };
};

type SyncFeit = { laatstGeluktOp: number; laatstPogingOp: number; foutCode: string; herstelNodig: boolean };
export async function syncFeiten(ownerUserId: string): Promise<Map<string, SyncFeit>> {
  const uit = new Map<string, SyncFeit>();
  try {
    const lade = ladeOf(ownerUserId);
    const rows = await db.list<Record<string, unknown>>('google_suite_sync_state_v1', { filter: { service: 'drive', ...ladeFilter(lade) } });
    const lijst = (rows.items as Array<Record<string, unknown>>).filter((r) => hoortBij(r, lade)).sort((a, b) => Number(a.updatedAt || 0) - Number(b.updatedAt || 0));
    for (const r of lijst) uit.set(String(r.accountId || ''), { laatstGeluktOp: Number(r.lastSuccessAt || 0), laatstPogingOp: Number(r.lastAttemptAt || 0), foutCode: String(r.errorCode || '').slice(0, 80), herstelNodig: Boolean(r.recoveryRequired) });
  } catch { /* таблиця ще не читається: решта відповідає штатно */ }
  return uit;
}

const M4_FAMILIES = [
  { id: 'onedrive', envPrefix: 'CLOUD_MICROSOFT', providers: ['onedrive-personal', 'onedrive-business', 'sharepoint'] },
  { id: 'dropbox', envPrefix: 'CLOUD_DROPBOX', providers: ['dropbox'] },
  { id: 'box', envPrefix: 'CLOUD_BOX', providers: ['box'] },
] as const;
const envAanwezig = (naam: string) => Boolean(String(process.env[naam] || '').trim());
const heeftAanbiederSleutels = (id: string, envPrefix: string) =>
  (id === 'onedrive' && envAanwezig('ONEDRIVE_CLIENT_ID') && envAanwezig('ONEDRIVE_CLIENT_SECRET')) ||
  (envAanwezig(`${envPrefix}_CLIENT_ID`) && envAanwezig(`${envPrefix}_CLIENT_SECRET`));

type SnapshotAccount = { id: string; email: string; status: string } | null;
type Snapshot = { id: string; accounts: Array<{ id: string; email: string; status: string; principalId?: string }>; activeAccountId?: string };

async function googleDeel(ownerUserId: string): Promise<IntegratiesUit['google']> {
  try {
    const snapshots = (await googleSuiteDriveProviderSnapshot(ownerUserId)) as Array<Snapshot & { account: SnapshotAccount }>;
    const google = snapshots.find((item) => item.id === 'google');
    if (!google) return { gekoppeld: false, accounts: [] };
    const actiefId = String(google.activeAccountId || '');
    const accounts = (google.accounts || []).map((item) => ({
      id: String(item.id || ''), email: String(item.email || ''), actief: item.id === actiefId && item.status === 'connected', status: String(item.status || ''),
      ...(item.principalId ? { principalId: String(item.principalId).slice(0, 120) } : {}),
    }));
    const feiten = await syncFeiten(ownerUserId);
    const metSync = accounts.map((item) => { const f = feiten.get(item.id); return f ? { ...item, sync: f } : item; });
    return { gekoppeld: accounts.some((item) => item.status === 'connected'), accounts: metSync };
  } catch (caught) {
    const fout = veiligeFoutcode(caught, 'CLOUD_GOOGLE_STATUS_ONBESCHIKBAAR');
    if (fout === 'CLOUD_GOOGLE_STATUS_ONBESCHIKBAAR') console.error('[cloud-vnext-integraties] google:', String((caught as Error)?.message || caught).slice(0, 500));
    return { gekoppeld: false, accounts: [], fout };
  }
}

async function photosDeel(ownerUserId: string, email: string): Promise<IntegratiesUit['photos']> {
  if (!email) return { gekoppeld: false };
  try {
    const stand = await googleSuiteFotoScopeStatus(ownerUserId, email);
    return { gekoppeld: Boolean(stand.gekoppeld && stand.lezen) };
  } catch { return { gekoppeld: false }; }
}

async function m4Deel(ownerUserId: string): Promise<IntegratiesUit['m4']> {
  const stagingAan = (process.env.CLOUD_M4_CONNECTIONS_STAGING === 'enabled') || (await cloudVlagAan('cloud-m4-koppelingen-v1', ownerUserId));
  let accounts: Array<{ id: string; provider: string; label: string; displayName: string; email: string; status: string }> = [];
  try {
    const rows = await new PostgresCloudConnections().list({ owner: ownerUserId, space: ladeOf(ownerUserId).ruimte });
    accounts = rows.map((row) => ({ id: row.id, provider: row.provider, label: row.label, displayName: row.displayName, email: row.email, status: row.status }));
  } catch { accounts = []; }
  return {
    stagingAan,
    aanbieders: M4_FAMILIES.map((familie) => ({
      id: familie.id,
      sleutelsAanwezig: heeftAanbiederSleutels(familie.id, familie.envPrefix),
      accounts: accounts
        .filter((row) => (familie.providers as readonly string[]).includes(row.provider))
        .map((row) => ({ id: row.id, label: row.label || row.displayName || row.email || familie.id, status: row.status })),
    })),
  };
}

export function cloudVnextIntegratiesRoutes(requireSession: RequireSession, opties: { vlagAan?: (u: SessionOk['user']) => Promise<boolean> } = {}): Record<string, RouterMiddleware[]> {
  const route = (run: (ctx: Ctx, auth: SessionOk) => Promise<Resp>): RouterMiddleware[] => [(async (raw: unknown) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    if (opties.vlagAan && !(await opties.vlagAan(auth.user).catch(() => false))) return error('CLOUD_VNEXT_UIT', 404);
    try { return await run(ctx, auth); }
    catch (err) { return vnextFoutAntwoord('cloud-vnext-integraties', err); }
  }) as unknown as RouterMiddleware];
  return {
    'POST /api/owner/cloud/vnext/integraties': route(async (_ctx, auth) => {
      const [google, photos, m4, webdav] = await Promise.all([
        googleDeel(auth.user.id),
        photosDeel(auth.user.id, String(auth.user.email || '')),
        m4Deel(auth.user.id),
        webdavOverzichtDeel(auth.user.id),
      ]);
      const uit: IntegratiesUit = {
        google, photos, m4, webdav,
        zoekIndex: { cloud: (INDEX_BRONNEN as readonly string[]).includes('cloud'), drive: (INDEX_BRONNEN as readonly string[]).includes('drive') },
      };
      return json(uit);
    }),
    'POST /api/owner/cloud/vnext/webdav': route((ctx, auth) => afhandelenCloudWebdav(ctx.body, auth)),
    'POST /api/owner/cloud/vnext/automatiseringen': route((ctx, auth) => afhandelenCloudAutomatiseringen(ctx.body, auth)),
  };
}
