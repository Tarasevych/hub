// Welke vensters een mens open of geminimaliseerd heeft — op de SERVER, per ACCOUNT en per RUIMTE (migratie 0089).
//
// WAAROM OP DE SERVER EN NIET IN DE BROWSER. Precies de klacht van de eigenaar (20.10.2026): «згорнуті вікна в одному
// просторі втрачаються, якщо я переходжу на інший піддомен». hub, mail en cloud zijn APARTE oorsprongen: sessionStorage
// en localStorage van mail.tarasevych.com zijn een ander vakje dan die van hub.tarasevych.com. Alleen de server (of een
// cookie op het hoofddomein, en daar hoort dit niet in) ziet alle drie. Daarom dezelfde opzet als het menu en het
// uiterlijk: server is de waarheid, de browser houdt een cache voor het eerste beeld.
//
// WAT ER BEWAARD WORDT. Alleen een kleine, hervatbare beschrijving: soort venster, titel, stap, de ingevulde ADRES-regel
// en of het geminimaliseerd is. Geen wachtwoorden, codes of tokens — shared/vensters-onthouden-model.ts gooit zulke
// velden eruit (zonderGeheimen) en zet een venster dat op het wachtwoord stond op de stap «wachtwoord-opnieuw». Deze
// route controleert dat nog eens met standHeeftGeheim(): zou er ooit toch een geheim veld binnenkomen, dan weigeren we
// het hele verzoek in plaats van het stil te bewaren.
//
// DEZE ROUTES ZIJN DIENSTBREED. Elke goedgekeurde sessie mag erbij, want het dok hoort bij de PERSOON en niet bij één
// subdomein; de scheiding loopt via de RUIMTE (prive/technisch), zoals bij alle gegevens sinds 0082.
import { error, json } from '../server/platform';
import { getPool } from '../server/platform/pg';
import { denyMutation, rejectForeignOwnerUserId } from './rbac';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import {
  LEGE_VENSTERSTAND, normaliseerVensterStand, standHeeftGeheim, type VensterStand,
} from '../shared/vensters-onthouden-model';
import type { AiRuimte } from '../shared/ai-ruimte';
import { isIngeschakeld, journaalTellen, ontzegelMetDek, registreerHerversleutelaar, sleutelOpen, verzegelMetDek } from './sleutelkluis';
import { SLEUTEL_GESLOTEN_CODE } from '../shared/sleutelkluis';

const sys = () => getPool('systeem');
/** Sleutelkluis (0092): de vensterlijst onder de eigen gegevenssleutel (kolom vensters_versleuteld; `vensters` blijft dan '[]'). */
const vensterAad = (userId: string, ruimte: AiRuimte) => `venster-stand|${userId}|${ruimte}`;

export type VensterStandMetSleutel = VensterStand & { /** 'gesloten': de lijst staat onder de eigen sleutel en die is dicht in deze sessie. */ sleutel?: 'gesloten' | 'serversleutel' };
export async function vensterStandLezen(userId: string, ruimte: AiRuimte): Promise<VensterStandMetSleutel> {
  const rijen = await sys().query('SELECT vensters, vensters_versleuteld, bijgewerkt_op FROM app.venster_stand WHERE user_id = $1 AND ruimte = $2', [userId, ruimte]);
  const rij = rijen.rows[0] as { vensters: unknown; vensters_versleuteld: string | null; bijgewerkt_op: string } | undefined;
  if (!rij) return LEGE_VENSTERSTAND;
  const op = new Date(String(rij.bijgewerkt_op)).getTime();
  if (rij.vensters_versleuteld) {
    const dek = sleutelOpen({ userId, ruimte });
    if (!dek) return { ...LEGE_VENSTERSTAND, sleutel: 'gesloten' };
    try { return normaliseerVensterStand({ vensters: JSON.parse(ontzegelMetDek(dek, rij.vensters_versleuteld, vensterAad(userId, ruimte))), op }); }
    catch { return { ...LEGE_VENSTERSTAND, sleutel: 'gesloten' }; }
  }
  const stand = normaliseerVensterStand({ vensters: rij.vensters, op });
  if (await isIngeschakeld({ userId, ruimte })) { journaalTellen({ userId, ruimte }, 'app.venster_stand', 'serversleutel-gelezen'); return { ...stand, sleutel: 'serversleutel' }; }
  return stand;
}

export async function vensterStandSchrijven(userId: string, ruimte: AiRuimte, ruw: unknown): Promise<VensterStandMetSleutel> {
  const stand = normaliseerVensterStand(ruw);
  if (await isIngeschakeld({ userId, ruimte })) {
    const dek = sleutelOpen({ userId, ruimte });
    if (!dek) throw new Error(SLEUTEL_GESLOTEN_CODE);
    await sys().query(
      `INSERT INTO app.venster_stand (user_id, ruimte, vensters, vensters_versleuteld, bijgewerkt_op) VALUES ($1,$2,'[]'::jsonb,$3,now())
       ON CONFLICT (user_id, ruimte) DO UPDATE SET vensters = '[]'::jsonb, vensters_versleuteld = EXCLUDED.vensters_versleuteld, bijgewerkt_op = now()`,
      [userId, ruimte, verzegelMetDek(dek, JSON.stringify(stand.vensters), vensterAad(userId, ruimte))],
    );
    return vensterStandLezen(userId, ruimte);
  }
  await sys().query(
    `INSERT INTO app.venster_stand (user_id, ruimte, vensters, vensters_versleuteld, bijgewerkt_op) VALUES ($1,$2,$3::jsonb,NULL,now())
     ON CONFLICT (user_id, ruimte) DO UPDATE SET vensters = EXCLUDED.vensters, vensters_versleuteld = NULL, bijgewerkt_op = now()`,
    [userId, ruimte, JSON.stringify(stand.vensters)],
  );
  return vensterStandLezen(userId, ruimte);
}
// «Перешифрувати зараз»: een rij die nog in platte jsonb staat, onder de DEK zetten.
registreerHerversleutelaar('app.venster_stand', async (lade, dek) => {
  const rijen = await sys().query('SELECT vensters FROM app.venster_stand WHERE user_id = $1 AND ruimte = $2 AND vensters_versleuteld IS NULL', [lade.userId, lade.ruimte]);
  const rij = rijen.rows[0] as { vensters: unknown } | undefined;
  if (!rij) return { gevonden: 0, herversleuteld: 0 };
  await sys().query(`UPDATE app.venster_stand SET vensters = '[]'::jsonb, vensters_versleuteld = $3, bijgewerkt_op = now() WHERE user_id = $1 AND ruimte = $2`,
    [lade.userId, lade.ruimte, verzegelMetDek(dek, JSON.stringify(normaliseerVensterStand({ vensters: rij.vensters, op: Date.now() }).vensters), vensterAad(lade.userId, lade.ruimte))]);
  return { gevonden: 1, herversleuteld: 1 };
});

type User = { id: string; status: string };
type AuthSuccess = { service: string; user: User };
type AuthFailure = { errorCode: string };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<AuthSuccess | AuthFailure>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
const lichaam = (body: unknown) => (body && typeof body === 'object' ? (body as Record<string, unknown>) : {});

export const createVensterRoutes = (authorize: Authorize) => {
  const auth = async (ctx: Context) => {
    const uitslag = await authorize(ctx.event, ctx.body);
    if ('errorCode' in uitslag || uitslag.user.status !== 'approved') return null;
    return uitslag;
  };
  const ruimteVan = (userId: string, body: Record<string, unknown>) =>
    gegevensRuimteVeilig(userId, { tabContext: typeof body.tabContext === 'string' ? body.tabContext : null });

  return {
    'POST /api/owner/vensters/laden': [async (ctx: Context) => {
      const gebruiker = await auth(ctx);
      if (!gebruiker) return error('OWNER_VENSTERS_SESSIE_VEREIST', 403);
      const ruimte = await ruimteVan(gebruiker.user.id, lichaam(ctx.body));
      const stand = await vensterStandLezen(gebruiker.user.id, ruimte);
      return json({ ok: true, bron: 'server_vensters_v1', ruimte, ...stand });
    }],
    'POST /api/owner/vensters/opslaan': [async (ctx: Context) => {
      const gebruiker = await auth(ctx);
      if (!gebruiker) return error('OWNER_VENSTERS_SESSIE_VEREIST', 403);
      const geweigerd = rejectForeignOwnerUserId(gebruiker.user, ctx.body) || denyMutation(gebruiker.user as never, 'workspace.write');
      if (geweigerd) return geweigerd;
      const body = lichaam(ctx.body);
      // Eerlijk weigeren is beter dan stil opschonen: wie hier een geheim meestuurt, heeft een fout in zijn weergave.
      if (standHeeftGeheim(body.vensters)) return error('OWNER_VENSTERS_GEHEIM_GEWEIGERD', 400);
      const ruimte = await ruimteVan(gebruiker.user.id, body);
      try {
        const stand = await vensterStandSchrijven(gebruiker.user.id, ruimte, { vensters: body.vensters, op: Date.now() });
        return json({ ok: true, bron: 'server_vensters_v1', ruimte, ...stand });
      } catch (e) {
        // Sleutel dicht: niets bewaard, en de browser hoort dat (hij houdt zijn eigen cache tot de mens ontgrendelt).
        if ((e as Error).message === SLEUTEL_GESLOTEN_CODE) return error(SLEUTEL_GESLOTEN_CODE, 423);
        throw e;
      }
    }],
  };
};
