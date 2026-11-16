// EIGEN LOGO VAN DE GEBRUIKER (REESTR-LOGO-001, 16.11.2026) — de serverkant. Migratie 0300, register: src/merk/merk-register.ts.
//
// Павло: «щоб користувач міг там призначити свій логотип навіть якщо системний є, типу діє той, який встановив користувач, доки не
// буде видалено користувацький або не замінено». Elke goedgekeurde gebruiker kan voor een merk zijn EIGEN bestand kiezen; het gaat
// op de hele site vóór het systeemlogo, maar alleen voor hem en alleen in de ruimte (privé/technisch) van het tabblad.
//
//   • lezen  — POST /api/owner/merk-gebruiker/lijst: de eigen rijen van deze (mens, ruimte), als data-URI. Nooit die van een ander:
//              de mens komt uit de sessie, de ruimte uit gegevensRuimteVeilig (database), niets uit het verzoek.
//   • zetten — POST /api/owner/merk-gebruiker/zetten {sleutel, soort, data}: door DEZELFDE controle als een bestand van de beheerder
//              (shared/merk-eigen.ts: SVG ontsmet, PNG echt, ≤ 200 KB). Een bestaande rij wordt vervangen («замінено»).
//   • wissen — POST /api/owner/merk-gebruiker/wissen {sleutel}: de rij weg; het systeemlogo staat meteen weer («видалено»).
// Sleutelkluis aan → het bestand ALLEEN onder de eigen gegevenssleutel (zoals app.afzender_beeld); dicht → niets bewaard (423).
// Elke wijziging komt in het journaal van het account (alleen sleutel, soort en grootte — nooit het bestand).
import { createHash } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import { isIngeschakeld, journaalTellen, ontzegelMetDek, registreerHerversleutelaar, sleutelOpen, verzegelMetDek } from './sleutelkluis';
import { MERK_EIGEN_MAX_BYTES, MERK_EIGEN_SLEUTEL, controleerMerkEigen, merkEigenDataUri, type MerkEigenSoort } from '../shared/merk-eigen';

const sys = () => getPool('systeem');
/** Hoeveel eigen logo's één mens per ruimte mag hebben (zelfde grens als die van de beheerder). */
export const MERK_GEBRUIKER_MAX = 64;

export type GebruikerLade = { userId: string; ruimte: 'prive' | 'technisch' };
export type GebruikerMerkRij = { sleutel: string; soort: MerkEigenSoort; data: string; hash: string; bytes: number; gewijzigd: number };
export class MerkGebruikerFout extends Error { constructor(public code: string, public status = 400) { super(code); } }

const aad = (l: GebruikerLade, sleutel: string) => `merk-gebruiker|${l.userId}|${l.ruimte}|${sleutel}`;
const sha256Hex = (b: Buffer) => createHash('sha256').update(b).digest('hex');
/** Kenmerk van de lijst voor de browser: hoort een lijst bij een ander account/ruimte, dan gooit het register de vorige weg. */
export const scopeVan = (l: GebruikerLade) => createHash('sha256').update(`merk-gebruiker-scope|${l.userId}|${l.ruimte}`).digest('hex').slice(0, 16);

type Rij = { sleutel: string; soort: MerkEigenSoort; data: Buffer | null; data_versleuteld: string | null; sha256: string; bytes: number; gewijzigd_op: Date };

/** De eigen logo's van deze lade. Versleutelde rijen bij een dichte sleutel worden geteld (`gesloten`), niet getoond. */
export async function merkGebruikerLijst(l: GebruikerLade): Promise<{ merken: GebruikerMerkRij[]; gesloten: number }> {
  const rijen = (await sys().query(`SELECT sleutel, soort, data, data_versleuteld, sha256, bytes, gewijzigd_op FROM app.merk_gebruiker
    WHERE user_id = $1 AND ruimte = $2 ORDER BY sleutel LIMIT $3`, [l.userId, l.ruimte, MERK_GEBRUIKER_MAX])).rows as Rij[];
  const dek = rijen.some((r) => r.data_versleuteld) ? sleutelOpen(l) : null;
  const merken: GebruikerMerkRij[] = [];
  let gesloten = 0;
  for (const r of rijen) {
    let inhoud: Buffer | null = r.data ? Buffer.from(r.data) : null;
    if (!inhoud && r.data_versleuteld) {
      if (!dek) { gesloten++; continue; }
      try { inhoud = Buffer.from(ontzegelMetDek(dek, r.data_versleuteld, aad(l, r.sleutel)), 'base64'); } catch { gesloten++; continue; }
    }
    if (!inhoud) continue;
    merken.push({ sleutel: r.sleutel, soort: r.soort, data: merkEigenDataUri(r.soort, inhoud), hash: r.sha256.slice(0, 16), bytes: r.bytes, gewijzigd: new Date(r.gewijzigd_op).getTime() });
  }
  return { merken, gesloten };
}

/** Bewaart (of vervangt) het eigen logo voor één merk. Gooit MerkGebruikerFout met een code die de pagina kan uitleggen. */
export async function merkGebruikerZetten(l: GebruikerLade, sleutel: string, soort: MerkEigenSoort, ruw: Buffer): Promise<GebruikerMerkRij> {
  if (!MERK_EIGEN_SLEUTEL.test(sleutel)) throw new MerkGebruikerFout('MERK_EIGEN_SLEUTEL');
  const u = controleerMerkEigen(soort, ruw);
  if (!u.ok) throw new MerkGebruikerFout(`MERK_EIGEN_${u.reden}`.slice(0, 60).replace(/[^A-Z0-9_]/g, '_'));
  const bestaat = (await sys().query(`SELECT 1 FROM app.merk_gebruiker WHERE user_id = $1 AND ruimte = $2 AND sleutel = $3`, [l.userId, l.ruimte, sleutel])).rowCount;
  if (!bestaat) {
    const n = Number((await sys().query(`SELECT count(*)::int AS n FROM app.merk_gebruiker WHERE user_id = $1 AND ruimte = $2`, [l.userId, l.ruimte])).rows[0]?.n || 0);
    if (n >= MERK_GEBRUIKER_MAX) throw new MerkGebruikerFout('MERK_EIGEN_TE_VEEL');
  }
  let data: Buffer | null = u.inhoud, versleuteld: string | null = null;
  if (await isIngeschakeld(l)) {
    const dek = sleutelOpen(l);
    if (!dek) { journaalTellen(l, 'app.merk_gebruiker', 'gesloten-overgeslagen'); throw new MerkGebruikerFout('SLEUTELKLUIS_GESLOTEN', 423); }
    versleuteld = verzegelMetDek(dek, u.inhoud.toString('base64'), aad(l, sleutel));
    data = null;
  }
  const hash = sha256Hex(u.inhoud);
  await sys().query(`INSERT INTO app.merk_gebruiker (user_id, ruimte, sleutel, soort, data, data_versleuteld, sha256, bytes, gewijzigd_op)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
    ON CONFLICT (user_id, ruimte, sleutel) DO UPDATE SET soort = EXCLUDED.soort, data = EXCLUDED.data, data_versleuteld = EXCLUDED.data_versleuteld,
      sha256 = EXCLUDED.sha256, bytes = EXCLUDED.bytes, gewijzigd_op = now()`,
  [l.userId, l.ruimte, sleutel, u.soort, data, versleuteld, hash, u.inhoud.length]);
  return { sleutel, soort: u.soort, data: merkEigenDataUri(u.soort, u.inhoud), hash: hash.slice(0, 16), bytes: u.inhoud.length, gewijzigd: Date.now() };
}

export async function merkGebruikerWissen(l: GebruikerLade, sleutel: string): Promise<boolean> {
  if (!MERK_EIGEN_SLEUTEL.test(sleutel)) return false;
  return ((await sys().query(`DELETE FROM app.merk_gebruiker WHERE user_id = $1 AND ruimte = $2 AND sleutel = $3`, [l.userId, l.ruimte, sleutel])).rowCount ?? 0) > 0;
}

// «Перешифрувати мої дані зараз» (0092): eigen logo's die nog onversleuteld in deze lade staan onder de DEK zetten.
registreerHerversleutelaar('app.merk_gebruiker', async (lade, dek) => {
  const l: GebruikerLade = { userId: lade.userId, ruimte: lade.ruimte === 'technisch' ? 'technisch' : 'prive' };
  const rijen = (await sys().query(`SELECT sleutel, data FROM app.merk_gebruiker WHERE user_id = $1 AND ruimte = $2 AND data IS NOT NULL`, [l.userId, l.ruimte])).rows as Array<{ sleutel: string; data: Buffer }>;
  let n = 0;
  for (const r of rijen) {
    const env = verzegelMetDek(dek, Buffer.from(r.data).toString('base64'), aad(l, r.sleutel));
    n += (await sys().query(`UPDATE app.merk_gebruiker SET data = NULL, data_versleuteld = $4 WHERE user_id = $1 AND ruimte = $2 AND sleutel = $3 AND data IS NOT NULL`,
      [l.userId, l.ruimte, r.sleutel, env])).rowCount ?? 0;
  }
  return { gevonden: rijen.length, herversleuteld: n };
});

type Gebruiker = { id: string; email?: string; status?: string };
type SessieOk = { service: string; user: Gebruiker };
type Ctx = { event: Record<string, unknown>; body: unknown };
type Deps = { requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessieOk | { errorCode: string }> };
const lijf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});

export function merkGebruikerRoutes(deps: Deps): Record<string, RouterMiddleware[]> {
  const route = (run: (a: SessieOk, l: GebruikerLade, b: Record<string, unknown>) => Promise<Record<string, unknown>>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const a = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in a || a.user.status !== 'approved') return error('OWNER_APPROVED_SESSION_REQUIRED', 403);
    const b = lijf(ctx.body);
    try {
      // De ruimte komt NOOIT uit het verzoek: alleen het tabblad mag haar verkleinen (gegevensRuimteVeilig leest rechten zelf).
      const ruimte = await gegevensRuimteVeilig(a.user.id, { tabContext: typeof b.tabContext === 'string' ? b.tabContext : null });
      const l: GebruikerLade = { userId: a.user.id, ruimte: ruimte === 'technisch' ? 'technisch' : 'prive' };
      return json({ ok: true, ...(await run(a, l, b)) });
    } catch (e) {
      if (e instanceof MerkGebruikerFout) return error(e.code, e.status);
      console.error('[merk-gebruiker]', (e as Error)?.message || e); return error('MERK_GEBRUIKER_FOUT', 500);
    }
  }) as RouterMiddleware;
  const lijst = async (l: GebruikerLade) => { const r = await merkGebruikerLijst(l); return { ...r, scope: scopeVan(l), ruimte: l.ruimte, max: MERK_GEBRUIKER_MAX }; };

  return {
    'POST /api/owner/merk-gebruiker/lijst': [route(async (_a, l) => lijst(l))],
    'POST /api/owner/merk-gebruiker/zetten': [route(async (a, l, b) => {
      const sleutel = String(b.sleutel || '').slice(0, 41);
      const soort = b.soort === 'png' ? 'png' : b.soort === 'svg' ? 'svg' : '';
      if (!soort) throw new MerkGebruikerFout('MERK_EIGEN_SOORT');
      const data = String(b.data || '');
      if (!/^[A-Za-z0-9+/=\s]+$/.test(data) || data.length > Math.ceil(MERK_EIGEN_MAX_BYTES * 4 / 3) + 16) throw new MerkGebruikerFout('MERK_EIGEN_TE_GROOT');
      let rij: GebruikerMerkRij;
      try { rij = await merkGebruikerZetten(l, sleutel, soort, Buffer.from(data.replace(/\s+/g, ''), 'base64')); }
      catch (e) {
        await schrijfBeheerAudit({ actor: { id: a.user.id }, doel: { soort: 'merk', naam: sleutel || '-' }, actie: 'owner.ui.merk.gezet', resultaat: 'denied', reden: (e as Error).message, details: { ruimte: l.ruimte, soort } });
        throw e;
      }
      await schrijfBeheerAudit({ actor: { id: a.user.id }, doel: { soort: 'merk', naam: sleutel }, actie: 'owner.ui.merk.gezet', resultaat: 'success', details: { ruimte: l.ruimte, soort, bytes: rij.bytes, hash: rij.hash } });
      return { merk: { sleutel: rij.sleutel, soort: rij.soort, hash: rij.hash, bytes: rij.bytes }, ...(await lijst(l)) };
    })],
    'POST /api/owner/merk-gebruiker/wissen': [route(async (a, l, b) => {
      const sleutel = String(b.sleutel || '').slice(0, 41);
      const weg = await merkGebruikerWissen(l, sleutel);
      await schrijfBeheerAudit({ actor: { id: a.user.id }, doel: { soort: 'merk', naam: sleutel || '-' }, actie: 'owner.ui.merk.gewist', resultaat: weg ? 'success' : 'failure', details: { ruimte: l.ruimte } });
      return { gewist: weg, ...(await lijst(l)) };
    })],
  };
}
