// Cloud vNext — TAKEN (29.10.2026): achtergrond-overdrachten tussen diensten, contract in shared/cloud-overdracht-model.ts.
// Een overdracht is een RECORD (app.records, collectie cloud_taken_v1) dat de server zelf afwerkt: de pagina maakt de
// taak aan en blijft bruikbaar; de voortgang staat eerlijk in het record en overleeft een herstart ('bezig' zonder
// hartslag valt terug naar 'wacht'). Richtingen in deze versie: eigen → Google Drive en Google Drive → eigen
// (kopie of verplaats; verplaatsen haalt de bron pas weg NA een gelukte schrijf — bij 'eigen' betekent dat de
// prullenbak, dus 30 dagen herstelbaar). Grenzen komen uit OVERDRACHT_GRENZEN, mét hun bron en suggestie; niets
// heet hier klaar vóór de bytes echt staan.
//
// Google-toegang wordt HERGEBRUIKT uit backend/google-suite-inrichting.ts (snapshot + principal-token): er is hier
// geen tweede OAuth. De Drive-aanroepen spiegelen de bestaande productiepatronen (multipart ≤ 5 MB, alt=media ≤ 32 MB).
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, error, json, storage } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { denyMutation } from './rbac';
import { OVERDRACHT_GRENZEN, overdrachtGrens, type CloudTaak, type CloudTaakPunt, type CloudTaakSoort, type CloudTaakStand } from '../shared/cloud-overdracht-model';
import { hoortBij, ladeFilter, ladeVelden, type Lade } from '../shared/ruimte-scheiding';
import { cloudVoorvoegsel, ladeOf, padInLade } from './ruimte-cloud-agenda';
import { googleSuiteDriveProviderSnapshot, googleSuitePrincipalAccessToken } from './google-suite-inrichting';
import { schoneNaam } from '../shared/cloud-vnext-model';

const TAKEN = 'cloud_taken_v1';
const ITEMS = 'cloud_items_v1';
const HARTSLAG_MS = 2 * 60 * 1000;      // 'bezig' zonder bijgewerktOp binnen deze tijd (herstart) → terug naar 'wacht'
const TIK_MS = 2000;
const LIJST_MAX = 50;

type Tweetalig = readonly [string, string];
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const idOfNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= 400 ? v : null);
const iso = (ms: number): string => new Date(ms > 0 ? ms : Date.now()).toISOString();
const fout = (code: string): never => { throw new Error(code); };
const extensie = (naam: string): string => { const m = /\.([A-Za-z0-9]{1,10})$/.exec(naam); return m ? `.${m[1].toLowerCase()}` : ''; };

type TaakRecord = {
  ownerUserId?: string; ruimte?: string;
  soort?: CloudTaakSoort; stand?: CloudTaakStand; bron?: CloudTaakPunt; doel?: CloudTaakPunt;
  naam?: string; totaalBytes?: number; voortgangBytes?: number;
  fout?: { code: string; uitleg: Tweetalig; suggestie?: Tweetalig };
  createdAt?: number; updatedAt?: number;
};
type MetId<T> = T & { id: string };
const zonderId = <T extends { id?: string }>(r: T): Omit<T, 'id'> => { const { id: _id, ...rest } = r; return rest; };

const naarBuiten = (r: MetId<TaakRecord>): CloudTaak => ({
  id: r.id, soort: r.soort === 'verplaats' ? 'verplaats' : 'kopie', stand: (['wacht', 'bezig', 'klaar', 'fout', 'geannuleerd'] as const).includes(r.stand as CloudTaakStand) ? (r.stand as CloudTaakStand) : 'wacht',
  bron: r.bron as CloudTaakPunt, doel: r.doel as CloudTaakPunt, naam: str(r.naam) || 'bestand',
  totaalBytes: num(r.totaalBytes), voortgangBytes: num(r.voortgangBytes),
  ...(r.fout && str(r.fout.code) ? { fout: r.fout } : {}),
  aangemaaktOp: iso(num(r.createdAt)), bijgewerktOp: iso(num(r.updatedAt) || num(r.createdAt)),
});

// ---------------------------------------------------------------- foutteksten (eerlijk, tweetalig; grenzen dragen hun bron mee)
const UITLEG: Record<string, Tweetalig> = {
  BRON_NIET_GEKOPPELD: ['Джерело не підключене: цей Google-акаунт не знайдено серед підключених.', 'De bron is niet gekoppeld: dit Google-account staat niet bij de verbonden accounts.'],
  DOEL_NIET_GEKOPPELD: ['Ціль не підключена: цей Google-акаунт не знайдено серед підключених.', 'Het doel is niet gekoppeld: dit Google-account staat niet bij de verbonden accounts.'],
  BRON_ONBEKEND: ['Файл-джерело не знайдено (можливо, його видалили).', 'Het bronbestand is niet gevonden (misschien is het verwijderd).'],
  SCHIJF_VOL: ['На диску сервера замало вільного місця для цього файла.', 'De serverschijf heeft te weinig vrije ruimte voor dit bestand.'],
  GOOGLE_WEIGERT: ['Google Drive відхилив запит (доступ міг збігти — перепідключіть акаунт у центрі інтеграцій).', 'Google Drive weigerde het verzoek (de toegang kan verlopen zijn — koppel het account opnieuw in het integratiecentrum).'],
  OPSLAAN_MISLUKT: ['Не вдалося записати байти у ваше сховище.', 'De bytes konden niet in uw opslag worden geschreven.'],
  GEANNULEERD: ['Зупинено на ваше прохання.', 'Op uw verzoek gestopt.'],
};
const grensFout = (code: 'DOEL_LIMIET' | 'BRON_LIMIET', dienst: string): { code: string; uitleg: Tweetalig; suggestie?: Tweetalig } => {
  const g = overdrachtGrens(dienst);
  return { code, uitleg: g ? g.bron : UITLEG.GOOGLE_WEIGERT, ...(g?.suggestie ? { suggestie: g.suggestie } : {}) };
};

// ---------------------------------------------------------------- Google-toegang (hergebruik; overschrijfbaar voor tests)
type DriveToegang = { token: string; accountId: string; email: string };
let driveToegang = async (userId: string, accountId: string): Promise<DriveToegang | null> => {
  try {
    const providers = await googleSuiteDriveProviderSnapshot(userId) as Array<{ id: string; account?: { id: string } | null; accounts: Array<{ id: string; email: string; principalId: string; status: string }> }>;
    const provider = providers.find((p) => p.id === 'google');
    const account = accountId ? provider?.accounts.find((a) => a.id === accountId) : provider?.accounts.find((a) => a.id === provider?.account?.id) || provider?.accounts[0];
    if (!account || account.status !== 'connected') return null;
    const token = await googleSuitePrincipalAccessToken(userId, account.principalId, 'drive' as never);
    return { token, accountId: account.id, email: account.email };
  } catch { return null; }
};
/** Vrije schijfruimte voor het eigen doel — overschrijfbaar voor tests. */
let vrijeBytes = async (): Promise<number | null> => {
  try { const { statfs } = await import('node:fs/promises'); const s = await statfs(process.env.UPLOADS_DIR || '/srv/data/uploads'); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
};
const SCHIJF_RESERVE = 256 * 1024 * 1024;

// Drive-aanroepen, gespiegeld aan de productie (google-suite-browser.ts): multipart-upload en alt=media, host vastgepind.
const driveStat = async (token: string, fileId: string): Promise<{ naam: string; bytes: number; mime: string } | null> => {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${encodeURIComponent('id,name,size,mimeType,trashed')}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  const f = await resp.json() as { id?: string; name?: string; size?: string; mimeType?: string; trashed?: boolean };
  if (f.id !== fileId || !f.name || f.trashed || f.mimeType === 'application/vnd.google-apps.folder') return null;
  const bytes = Number(f.size || 0);
  return Number.isSafeInteger(bytes) && bytes >= 0 ? { naam: String(f.name), bytes, mime: String(f.mimeType || 'application/octet-stream') } : null;
};
const driveAfhalen = async (token: string, fileId: string, max: number): Promise<Buffer | null> => {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;
  const buf = Buffer.from(await resp.arrayBuffer());
  return buf.length <= max ? buf : null;
};
const driveNeerzetten = async (token: string, mapId: string, naam: string, bytes: Buffer, mime: string): Promise<string | null> => {
  const grens = `taak_${Date.now()}_${randomBytes(6).toString('hex')}`;
  const kop = Buffer.from(`--${grens}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: naam, parents: [mapId || 'root'] })}\r\n--${grens}\r\nContent-Type: ${mime}\r\n\r\n`);
  const staart = Buffer.from(`\r\n--${grens}--`);
  const resp = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,size`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${grens}` }, body: Buffer.concat([kop, bytes, staart]),
  });
  if (!resp.ok) return null;
  const uit = await resp.json() as { id?: string };
  return str(uit.id) || null;
};
const drivePrullenbak = async (token: string, fileId: string): Promise<boolean> => {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
  });
  return resp.ok;
};

// ---------------------------------------------------------------- records lezen/schrijven
async function alleTaken(filter: Record<string, unknown>, limiet = 200): Promise<Array<MetId<TaakRecord>>> {
  const uit: Array<MetId<TaakRecord>> = [];
  let token: string | undefined;
  while (uit.length < limiet) {
    const blad = await db.list<TaakRecord>(TAKEN, { filter, limit: Math.min(1000, limiet), ...(token ? { nextToken: token } : {}) });
    uit.push(...(blad.items as unknown as Array<MetId<TaakRecord>>));
    if (!blad.nextToken) break;
    token = blad.nextToken;
  }
  return uit;
}
async function taakBijwerken(r: MetId<TaakRecord>, delta: Partial<TaakRecord>): Promise<MetId<TaakRecord>> {
  const record: TaakRecord = { ...zonderId(r), ...delta, updatedAt: Date.now() };
  await db.update(TAKEN, [{ id: r.id, record: record as Record<string, unknown> }]);
  return { ...record, id: r.id };
}
type ItemRecord = { ownerUserId?: string; ruimte?: string; kind?: string; title?: string; originalName?: string; mimeType?: string; sizeBytes?: number; storagePath?: string; verwijderdOp?: string | null; mapId?: string | null; workspaceId?: string };
async function eigenItem(lade: Lade, id: string | null): Promise<MetId<ItemRecord> | null> {
  if (!id) return null;
  const [r] = await db.get<ItemRecord>(ITEMS, [id]);
  return r && hoortBij(r, lade) ? { ...r, id } : null;
}

// ---------------------------------------------------------------- de werker: één taak tegelijk, hartslag in het record
let klok: ReturnType<typeof setInterval> | null = null;
let klokAan = true;
let bezigNu = false;
function startKlok(): void {
  if (!klokAan || klok) return;
  klok = setInterval(() => { void tik().catch(() => undefined); }, TIK_MS);
  (klok as unknown as { unref?: () => void }).unref?.();
}
async function tik(): Promise<void> {
  if (bezigNu) return;
  bezigNu = true;
  try {
    const nu = Date.now();
    // 1. Hangende 'bezig' (herstart, crash): zonder verse hartslag terug naar 'wacht'.
    for (const t of await alleTaken({ stand: 'bezig' })) if (nu - num(t.updatedAt) > HARTSLAG_MS) await taakBijwerken(t, { stand: 'wacht' });
    // 2. De oudste wachtende taak van een mens zonder lopende taak.
    const wacht = (await alleTaken({ stand: 'wacht' })).sort((a, b) => num(a.createdAt) - num(b.createdAt));
    const bezig = await alleTaken({ stand: 'bezig' });
    const taak = wacht.find((t) => !bezig.some((b) => b.ownerUserId === t.ownerUserId));
    if (!taak) return;
    const geclaimd = await taakBijwerken(taak, { stand: 'bezig' });
    await voer(geclaimd).catch(async (e) => {
      const code = String((e as Error)?.message || 'GOOGLE_WEIGERT');
      const [vers] = await db.get<TaakRecord>(TAKEN, [taak.id]);
      if (vers && vers.stand === 'geannuleerd') return; // intussen geannuleerd: zo laten
      const f = code === 'DOEL_LIMIET' || code === 'BRON_LIMIET' ? grensFout(code, 'google-drive') : { code: UITLEG[code] ? code : 'GOOGLE_WEIGERT', uitleg: UITLEG[code] ?? UITLEG.GOOGLE_WEIGERT };
      await taakBijwerken({ ...(vers as TaakRecord), id: taak.id }, { stand: 'fout', fout: f });
    });
  } finally { bezigNu = false; }
}
/** Nog geannuleerd? (de mens kan tijdens het werk op «annuleren» drukken) */
async function geannuleerd(id: string): Promise<boolean> {
  const [r] = await db.get<TaakRecord>(TAKEN, [id]);
  return !r || r.stand === 'geannuleerd';
}
async function voer(t: MetId<TaakRecord>): Promise<void> {
  const lade: Lade = { userId: str(t.ownerUserId), ruimte: t.ruimte === 'technisch' ? 'technisch' : 'prive' };
  const bron = t.bron as CloudTaakPunt, doel = t.doel as CloudTaakPunt;
  if (bron.dienst === 'eigen' && doel.dienst === 'google-drive') {
    const item = await eigenItem(lade, idOfNull(bron.id)) ?? fout('BRON_ONBEKEND');
    if (str(item.verwijderdOp) || (item.kind ?? 'file') !== 'file') fout('BRON_ONBEKEND');
    const pad = str(item.storagePath);
    if (!pad || !padInLade(pad, lade)) fout('BRON_ONBEKEND');
    const g = OVERDRACHT_GRENZEN['google-drive'];
    if (g.uploadMaxBytes !== null && num(item.sizeBytes) > g.uploadMaxBytes) fout('DOEL_LIMIET');
    const toegang = await driveToegang(lade.userId, str(doel.account)) ?? fout('DOEL_NIET_GEKOPPELD');
    const [gelezen] = await storage.read([pad], { eigenaar: str(item.ownerUserId) || undefined });
    if (!gelezen?.content) fout('BRON_ONBEKEND');
    const bytes = Buffer.from(gelezen!.content as string, 'base64');
    if (await geannuleerd(t.id)) return;
    const naam = str(t.naam) || str(item.title) || 'bestand';
    const nieuwId = await driveNeerzetten(toegang!.token, str(doel.mapId), naam, bytes, str(item.mimeType) || 'application/octet-stream') ?? fout('GOOGLE_WEIGERT');
    if (!nieuwId) return;
    if (t.soort === 'verplaats') {
      // De bron pas weg NA de gelukte schrijf — en «weg» is bij 'eigen' de prullenbak (30 dagen herstelbaar).
      const [vers] = await db.get<ItemRecord>(ITEMS, [item.id]);
      if (vers && hoortBij(vers, lade) && !str(vers.verwijderdOp)) await db.update(ITEMS, [{ id: item.id, record: { ...vers, verwijderdOp: iso(Date.now()), updatedAt: Date.now() } as Record<string, unknown> }]);
    }
    await taakBijwerken(t, { stand: 'klaar', voortgangBytes: bytes.length, totaalBytes: bytes.length });
    return;
  }
  if (bron.dienst === 'google-drive' && doel.dienst === 'eigen') {
    const toegang = await driveToegang(lade.userId, str(bron.account)) ?? fout('BRON_NIET_GEKOPPELD');
    const info = await driveStat(toegang!.token, str(bron.id)) ?? fout('BRON_ONBEKEND');
    const g = OVERDRACHT_GRENZEN['google-drive'];
    if (g.downloadMaxBytes !== null && info!.bytes > g.downloadMaxBytes) fout('BRON_LIMIET');
    const vrij = await vrijeBytes();
    if (vrij !== null && vrij < info!.bytes + SCHIJF_RESERVE) fout('SCHIJF_VOL');
    const buf = await driveAfhalen(toegang!.token, str(bron.id), g.downloadMaxBytes ?? Number.MAX_SAFE_INTEGER) ?? fout('GOOGLE_WEIGERT');
    if (await geannuleerd(t.id)) return;
    await taakBijwerken(t, { voortgangBytes: buf!.length, totaalBytes: buf!.length });
    // Via een tijdelijk bestand en writeVanPad: zelfde atomische weg als de uploads, nooit half werk.
    const tmpMap = await mkdtemp(join(tmpdir(), 'cloud-vnext-taak-'));
    try {
      const tmpPad = join(tmpMap, 'inhoud');
      await writeFile(tmpPad, buf!, { mode: 0o600 });
      const naam = schoneNaam(t.naam) || schoneNaam(info!.naam) || 'bestand';
      // Naamkeuze zonder stil overschrijven: bestaat de naam al in de doelmap, dan krijgt de kopie een volgnummer.
      const items = (await db.list<ItemRecord>(ITEMS, { filter: ladeFilter(lade), limit: 1000 })).items as unknown as Array<MetId<ItemRecord>>;
      const doelMap = idOfNull(doel.mapId);
      const bezet = new Set(items.filter((r) => hoortBij(r, lade) && !str(r.verwijderdOp) && (idOfNull(r.mapId) ?? null) === doelMap).map((r) => str(r.title) || str(r.originalName)));
      let eind = naam;
      for (let n = 2; bezet.has(eind) && n < 100; n++) { const punt = naam.lastIndexOf('.'); eind = punt > 0 ? `${naam.slice(0, punt)} (${n})${naam.slice(punt)}` : `${naam} (${n})`; }
      const nu = Date.now();
      const storagePath = `${cloudVoorvoegsel(lade)}/${nu}-${randomBytes(10).toString('hex')}${extensie(eind)}`;
      const [geschreven] = await storage.writeVanPad([{ path: storagePath, vanPad: tmpPad, contentType: info!.mime, ownerId: lade.userId }]);
      if (!geschreven) fout('OPSLAAN_MISLUKT');
      const record = {
        ...ladeVelden(lade), workspaceId: '', suggestedWorkspaceId: '', kind: 'file', title: eind, originalName: eind,
        description: '', textContent: '', sourceUrl: '', mimeType: info!.mime, sizeBytes: buf!.length, storagePath,
        tags: [], people: [], status: 'captured', aiState: 'fallback', aiConfidence: 0, createdAt: nu, updatedAt: nu, openedAt: 0,
        mapId: doelMap, favoriet: false, verwijderdOp: null, versies: [], sha256: '', bron: 'google-drive',
      };
      const [nieuwId] = await db.add(ITEMS, [record as Record<string, unknown>]);
      if (!nieuwId) { await storage.delete([storagePath]).catch(() => undefined); fout('OPSLAAN_MISLUKT'); }
      if (t.soort === 'verplaats') await drivePrullenbak(toegang!.token, str(bron.id));
      await taakBijwerken(t, { stand: 'klaar', naam: eind });
    } finally { await rm(tmpMap, { recursive: true, force: true }).catch(() => undefined); }
    return;
  }
  fout('ACTIE_ONGELDIG');
}

/** Alleen voor tests: de klok uit, één tik met de hand, en de toegangs-/schijfmetingen vervangen. */
export const cloudVnextTakenProef = {
  zetKlok: (aan: boolean) => { klokAan = aan; if (!aan && klok) { clearInterval(klok); klok = null; } },
  tikProef: () => tik(),
  zetDriveToegang: (fn: ((userId: string, accountId: string) => Promise<DriveToegang | null>) | null) => { if (fn) driveToegang = fn; },
  zetVrijeBytes: (fn: (() => Promise<number | null>) | null) => { if (fn) vrijeBytes = fn; },
};

// ---------------------------------------------------------------- routes
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
const bodyOf = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
const DIENSTEN = ['cloud', 'hub'] as const;
const CODE_PATROON = /^[A-Z][A-Z_]{2,39}$/;

const puntVan = (v: unknown): CloudTaakPunt | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.dienst === 'eigen') return { dienst: 'eigen', ...(idOfNull(o.id) ? { id: idOfNull(o.id)! } : {}), ...(idOfNull(o.mapId) ? { mapId: idOfNull(o.mapId) } : {}) };
  if (o.dienst === 'google-drive') { const account = idOfNull(o.account); return account ? { dienst: 'google-drive', account, ...(idOfNull(o.id) ? { id: idOfNull(o.id)! } : {}), ...(idOfNull(o.mapId) ? { mapId: idOfNull(o.mapId)! } : {}) } : null; }
  return null;
};

export function cloudVnextTakenRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  const route = (run: (ctx: Ctx, auth: SessionOk, lade: Lade, d: Record<string, unknown>) => Promise<Resp>): RouterMiddleware[] => [(async (raw: unknown) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    try { startKlok(); return await run(ctx, auth, ladeOf(auth.user.id), bodyOf(ctx.body)); }
    catch (err) {
      const code = String((err as Error)?.message || '');
      if (CODE_PATROON.test(code) && !code.startsWith('CLOUD_') && !code.startsWith('DB_')) return error(code, code === 'TAAK_ONBEKEND' ? 404 : 400);
      console.error('[cloud-vnext-taken]', code);
      return error(code.slice(0, 80) || 'CLOUD_VNEXT_FOUT', 500);
    }
  }) as unknown as RouterMiddleware];

  const taken = async (lade: Lade): Promise<Array<MetId<TaakRecord>>> => (await alleTaken(ladeFilter(lade))).filter((r) => hoortBij(r, lade));
  const eigenTaak = async (lade: Lade, id: unknown): Promise<MetId<TaakRecord>> => {
    const schoon = idOfNull(id) || fout('TAAK_ONBEKEND');
    const [r] = await db.get<TaakRecord>(TAKEN, [schoon]);
    if (!r || !hoortBij(r, lade)) fout('TAAK_ONBEKEND');
    return { ...(r as TaakRecord), id: schoon };
  };

  const takenRoute = route(async (_c, auth, lade, d) => {
    const actie = str(d.actie);
    if (actie !== 'lijst') {
      const denied = denyMutation(auth.user, 'cloud.write'); if (denied) return denied;
    }
    if (actie === 'nieuw') {
      const soort: CloudTaakSoort = d.soort === 'verplaats' ? 'verplaats' : d.soort === 'kopie' ? 'kopie' : fout('ACTIE_ONGELDIG');
      const bron = puntVan(d.bron) ?? fout('ACTIE_ONGELDIG');
      const doel = puntVan(d.doel) ?? fout('ACTIE_ONGELDIG');
      let naam = '', totaal = 0;
      if (bron!.dienst === 'eigen' && doel!.dienst === 'google-drive') {
        const item = await eigenItem(lade, idOfNull(bron!.id)) ?? fout('BRON_ONBEKEND');
        if (str(item.verwijderdOp) || (item.kind ?? 'file') !== 'file') fout('BRON_ONBEKEND');
        naam = str(item.title) || str(item.originalName) || 'bestand';
        totaal = num(item.sizeBytes);
        const g = OVERDRACHT_GRENZEN['google-drive'];
        if (g.uploadMaxBytes !== null && totaal > g.uploadMaxBytes) return json({ error: 'DOEL_LIMIET', grens: g, bytes: totaal }, 400);
        if (!await driveToegang(auth.user.id, str((doel as { account?: string }).account))) return json({ error: 'DOEL_NIET_GEKOPPELD' }, 400);
      } else if (bron!.dienst === 'google-drive' && doel!.dienst === 'eigen') {
        const toegang = await driveToegang(auth.user.id, str((bron as { account?: string }).account));
        if (!toegang) return json({ error: 'BRON_NIET_GEKOPPELD' }, 400);
        const info = await driveStat(toegang.token, str(bron!.id) || fout('BRON_ONBEKEND')) ?? fout('BRON_ONBEKEND');
        naam = info!.naam; totaal = info!.bytes;
        const g = OVERDRACHT_GRENZEN['google-drive'];
        if (g.downloadMaxBytes !== null && totaal > g.downloadMaxBytes) return json({ error: 'BRON_LIMIET', grens: g, bytes: totaal }, 400);
        const vrij = await vrijeBytes();
        if (vrij !== null && vrij < totaal + SCHIJF_RESERVE) return json({ error: 'SCHIJF_VOL', vrijBytes: vrij, nodigBytes: totaal + SCHIJF_RESERVE }, 400);
      } else fout('ACTIE_ONGELDIG');
      // Dezelfde actieve taak niet dubbel: geef de bestaande terug. Veldsgewijs vergelijken — Postgres (jsonb)
      // sorteert objectsleutels, dus JSON.stringify is hier geen gelijkheid.
      const puntGelijk = (x: unknown, y: CloudTaakPunt): boolean => {
        const o = (x || {}) as Record<string, unknown>;
        return o.dienst === y.dienst && (idOfNull(o.id) ?? null) === ((y as { id?: string }).id ?? null)
          && (idOfNull(o.account) ?? null) === ((y as { account?: string }).account ?? null)
          && (idOfNull(o.mapId) ?? null) === ((y as { mapId?: string | null }).mapId ?? null);
      };
      const bestaand = (await taken(lade)).find((r) => (r.stand === 'wacht' || r.stand === 'bezig') && r.soort === soort && puntGelijk(r.bron, bron!) && puntGelijk(r.doel, doel!));
      if (bestaand) return json({ taak: naarBuiten(bestaand) });
      const nu = Date.now();
      const record: TaakRecord = { ...ladeVelden(lade), soort, stand: 'wacht', bron: bron!, doel: doel!, naam, totaalBytes: totaal, voortgangBytes: 0, createdAt: nu, updatedAt: nu };
      const [id] = await db.add(TAKEN, [record as Record<string, unknown>]);
      if (!id) throw new Error('CLOUD_TAAK_AANMAKEN_MISLUKT');
      return json({ taak: naarBuiten({ ...record, id }) });
    }
    if (actie === 'lijst') {
      const lijst = (await taken(lade)).sort((a, b) => num(b.updatedAt) - num(a.updatedAt)).slice(0, LIJST_MAX);
      return json({ taken: lijst.map(naarBuiten) });
    }
    if (actie === 'annuleer') {
      const t = await eigenTaak(lade, d.id);
      if (t.stand !== 'wacht' && t.stand !== 'bezig') fout('ACTIE_ONGELDIG');
      return json({ taak: naarBuiten(await taakBijwerken(t, { stand: 'geannuleerd', fout: { code: 'GEANNULEERD', uitleg: UITLEG.GEANNULEERD } })) });
    }
    if (actie === 'opnieuw') {
      const t = await eigenTaak(lade, d.id);
      if (t.stand !== 'fout' && t.stand !== 'geannuleerd') fout('ACTIE_ONGELDIG');
      return json({ taak: naarBuiten(await taakBijwerken(t, { stand: 'wacht', voortgangBytes: 0, fout: undefined })) });
    }
    if (actie === 'opruimen') {
      const weg = (await taken(lade)).filter((r) => r.stand === 'klaar' || r.stand === 'fout' || r.stand === 'geannuleerd');
      for (let i = 0; i < weg.length; i += 400) await db.delete(TAKEN, weg.slice(i, i + 400).map((r) => r.id));
      return json({ ok: true, aantal: weg.length });
    }
    return fout('ACTIE_ONGELDIG');
  });

  return { 'POST /api/owner/cloud/vnext/taken': takenRoute };
}
