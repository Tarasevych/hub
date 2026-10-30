// Bureaublad van de hub, PER GEBRUIKER bewaard op de server (hub.tarasevych.com/overzicht → «Робочий стіл»).
//
// Zelfde opzet als backend/hub-indeling-voorkeuren.ts (één rij per gebruiker in een eigen, naar de gebruiker gehashte
// tabel, zodat er geen rij van iemand anders in beeld kan komen), maar met een EIGEN sleutel: de blokvoorkeuren
// (formaat/ingeklapt van de oude blokken) en de tegels van het bureaublad zijn verschillende dingen en mogen elkaar
// niet overschrijven.
//
// De server vertrouwt de browser niet: wat binnenkomt gaat door normaliseerBureau van shared/bureau-indeling.ts —
// dezelfde zuivere functie die de browser gebruikt. Tegels die nog geen echte gegevensbron hebben («binnenkort»)
// vallen daar weg, dus er kan nooit een tegel worden bewaard die doet alsof ze werkt.
import { db, error, json } from '../server/platform';
import { createHash } from 'node:crypto';
import { MAX_TEGELS, normaliseerBureau, type BureauIndeling } from '../shared/bureau-indeling';
import { hoortBij, ladeVelden, type Lade } from '../shared/ruimte-scheiding';
import { bordLade } from './ruimte-bord-github';

type User = { id: string; status: string };
type AuthSuccess = { service: string; user: User };
type AuthFailure = { errorCode: string };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<AuthSuccess | AuthFailure>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
/**
 * `ruimte` hoort bij de GEGEVENSLADE (migratie 0086): het bureaublad is onderdeel van de dienst «bord», dus het volgt exact
 * de stand die de mens voor het bord koos. Een rij zonder dat veld is PERSOONLIJK — elk bestaand bureaublad blijft dus staan
 * waar het stond, en de technische ruimte begint met een leeg bureaublad in plaats van met dat van de persoon.
 */
type Rij = { id: string; ownerUserId: string; ruimte?: unknown; indeling: BureauIndeling; updatedAt: number };

/** Eigen tabel per gebruiker (zoals hub_layout_preferences_v1), met een eigen naam voor het bureaublad. */
const tabel = (owner: string) => `hub_bureau_v1:${createHash('sha256').update(owner).digest('hex').slice(0, 32)}`;
const objectVan = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
/** Grens op de ruwe invoer vóór het ontleden: een indeling van 16 tegels is enkele honderden bytes. */
const MAX_BYTES = 8000;

/**
 * Lezen uit ÉÉN lade. De tabel is al per mens (gehashte naam), dus hier blijft alleen de lade over: 'prive' telt een rij
 * zonder `ruimte` mee, 'technisch' nooit. Er mag per lade hoogstens één rij zijn — twee bureaubladen in dezelfde lade is een
 * fout, maar een persoonlijk ÉN een technisch bureaublad naast elkaar is juist de bedoeling.
 */
const lees = async (lade: Lade): Promise<Rij | null> => {
  const rijen = await db.list<Rij>(tabel(lade.userId), { limit: 8 });
  const mijn = rijen.items.filter((r) => hoortBij(r, lade));
  if (mijn.length > 1) throw new Error('OWNER_HUB_BUREAU_DUPLICATE');
  return mijn[0] ?? null;
};

const schrijf = async (lade: Lade, indeling: BureauIndeling) => {
  const bak = tabel(lade.userId);
  const huidig = await lees(lade);
  const record = { ...ladeVelden(lade), indeling: normaliseerBureau(indeling), updatedAt: Date.now() };
  if (huidig) {
    const [ok] = await db.update(bak, [{ id: huidig.id, record }]);
    if (!ok) throw new Error('OWNER_HUB_BUREAU_SAVE_FAILED');
    return record;
  }
  const [id] = await db.add(bak, [record]);
  if (!id) throw new Error('OWNER_HUB_BUREAU_SAVE_FAILED');
  return record;
};

const code = (caught: unknown, terugval: string) =>
  caught instanceof Error && caught.message.startsWith('OWNER_HUB_BUREAU_') ? caught.message : terugval;

/**
 * Beide routes gaan door DEZELFDE poort als de taken en notities (dienst «bord»): laden en bewaren lezen en schrijven
 * uitsluitend in de lade die de poort teruggeeft. Weigert de poort (dienst uit, nog niets gekozen, bevroren), dan komt er
 * geen leeg bureaublad maar het antwoord van `bordLade` — met de reden in beide talen, zodat het scherm het kan uitleggen.
 */
export const createHubBureauRoutes = (authorize: Authorize) => ({
  'POST /api/owner/hub/bureau/load': [async (ctx: Context) => {
    const auth = await authorize(ctx.event, ctx.body);
    if ('errorCode' in auth || auth.service !== 'hub' || auth.user.status !== 'approved') return error('OWNER_HUB_BUREAU_REQUIRED', 403);
    const poort = await bordLade({ userId: auth.user.id, tabContext: objectVan(ctx.body).tabContext });
    if (!poort.ok) return poort.resp;
    try {
      const rij = await lees(poort.lade);
      return json({ source: 'server_hub_bureau_v1', bestaat: Boolean(rij), max: MAX_TEGELS, indeling: normaliseerBureau(rij?.indeling), updatedAt: Number(rij?.updatedAt || 0), ruimte: poort.kop });
    } catch (caught) { return error(code(caught, 'OWNER_HUB_BUREAU_LOAD_FAILED'), 500); }
  }],
  'POST /api/owner/hub/bureau/save': [async (ctx: Context) => {
    const auth = await authorize(ctx.event, ctx.body);
    if ('errorCode' in auth || auth.service !== 'hub' || auth.user.status !== 'approved') return error('OWNER_HUB_BUREAU_REQUIRED', 403);
    const ruw = objectVan(ctx.body).indeling;
    if (JSON.stringify(ruw ?? null).length > MAX_BYTES) return error('OWNER_HUB_BUREAU_TOO_LARGE', 413);
    const poort = await bordLade({ userId: auth.user.id, tabContext: objectVan(ctx.body).tabContext });
    if (!poort.ok) return poort.resp;
    try {
      const record = await schrijf(poort.lade, normaliseerBureau(ruw));
      return json({ source: 'server_hub_bureau_v1', bestaat: true, max: MAX_TEGELS, indeling: record.indeling, updatedAt: record.updatedAt, ruimte: poort.kop });
    } catch (caught) { return error(code(caught, 'OWNER_HUB_BUREAU_SAVE_FAILED'), 500); }
  }],
});
