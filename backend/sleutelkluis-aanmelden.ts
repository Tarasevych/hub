// KLUIS-AANMELDEN (16.11.2026) — вхід, який одразу розшифровує дані. Aanmelden dat meteen ontsleutelt.
//
// WAAROM: Павло wil geen tweede stap. Wie zich aanmeldt met iets wat ALLEEN hij weet of heeft, hoort daarmee meteen zijn gegevens
// te openen — ook op een nieuw apparaat. Twee wegen kunnen dat zonder de belofte te breken («de server kan zelf niets openen»):
//
//   1. WACHTWOORD. Omslag 'wachtwoord': de DEK onder KEK = scrypt(wachtwoord, eigen zout). In de database staat alleen de omslag
//      en het zout, nooit het wachtwoord (de aanmeldhash is een ANDERE berekening met een ander zout, toegangslaag.ts). Bij de
//      aanmelding rekent de server de KEK, opent de DEK voor de nieuwe sessie en gooit de KEK weg.
//      Bestaat de omslag nog niet (eerste aanmelding na deze update) en is de sleutel dicht, dan houdt de server de KEK hoogstens
//      15 minuten in het geheugen: zodra de mens in die tijd op een andere manier opent (pasje, kaart), wordt de omslag gemaakt.
//      Eerlijk: een wachtwoord is zwakker dan de herstelcode (20 willekeurige tekens). Wie de database kopieert, kan een zwak
//      wachtwoord offline raden (scrypt maakt elke poging duur, niet onmogelijk). Daarom: de mens kan het per ruimte uitzetten
//      (app.sleutelkluis_voorkeur), en een tijdelijk wachtwoord van de beheerder (mustChange) maakt nooit een omslag.
//   2. PASSKEY. Omslag 'passkey-aanmelden': de DEK onder KEK = HKDF(PRF(AANMELD_PRF_ZOUT)). Het zout is vast, omdat de browser bij
//      het aanmelden nog niet weet welke passkey de mens kiest. De PRF-uitkomst verlaat de browser NOOIT: de server stuurt na de
//      geslaagde aanmelding de omslag terug met een eenmalig token (2 min), de browser opent hem en stuurt de DEK — precies zoals
//      bij het gewone ontgrendelen met een passkey. De omslag wordt gemaakt wanneer de browser de DEK en die PRF tegelijk heeft:
//      bij het koppelen van een passkey en bij elk ontgrendelen met een passkey (tweede PRF-zout in dezelfde vraag).
//
// Wat NIET kan (en waarom niet): Google, Microsoft, Telegram-knop, sms en de code uit de app (TOTP) geven de browser geen geheim
// dat de server niet zelf heeft of kan maken. Een omslag daaronder zou de server zelf kunnen openen = verzwakking.
import { randomBytes } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { AANMELD_PRF_ZOUT, omslagAad } from '../shared/sleutelkluis';
import type { AiRuimte } from '../shared/ai-ruimte';
import { kekUitWachtwoordAsync } from './sleutelkluis-kdf';
import {
  SCRYPT, SleutelkluisFout, isIngeschakeld, naOpenen, omslaan, omslagGebruikt, omslagOpenen, omslagZetten, omslagenVan,
  sleutelOpen, sleutelOpenen, type KluisLade,
} from './sleutelkluis';

const sys = () => getPool('systeem');
const RUIMTES: readonly AiRuimte[] = ['prive', 'technisch'];
const ladenVan = (userId: string): KluisLade[] => RUIMTES.map((ruimte) => ({ userId, ruimte }));
const sleutelVan = (l: KluisLade) => `${l.userId}|${l.ruimte}`;
const nul = (b: Buffer | null | undefined) => { try { b?.fill(0); } catch { /* niets */ } };
const sessieHouders = (ids: string[]) => [...new Set(ids.filter((x) => /^[A-Za-z0-9_-]{8,120}$/.test(x)))].map((id) => ({ soort: 'sessie' as const, id }));
const audit = (userId: string, action: string, details: Record<string, unknown>, result: 'success' | 'denied' = 'success') =>
  auditToevoegen({ ownerId: userId, actorId: userId, action, type: 'beveiliging', result, details }).catch(() => undefined);

// ------------------------------------------------------------------------------------------------ voorkeur (uitzetten per ruimte)
/** Mag het wachtwoord in deze ruimte de sleutel openen? Standaard ja (Павло 16.11: «без двох кроків»); de mens kan het uitzetten. */
export async function wachtwoordOpentToegestaan(lade: KluisLade): Promise<boolean> {
  const r = await sys().query('SELECT wachtwoord_uit FROM app.sleutelkluis_voorkeur WHERE user_id = $1 AND ruimte = $2', [lade.userId, lade.ruimte]);
  return r.rows[0]?.wachtwoord_uit !== true;
}
/** Aan/uit. Uit = de omslag meteen weg (en een wachtende KEK vergeten); aan = bij de volgende aanmelding met wachtwoord opnieuw. */
export async function wachtwoordOpentZetten(lade: KluisLade, aan: boolean): Promise<void> {
  await sys().query(
    `INSERT INTO app.sleutelkluis_voorkeur (user_id, ruimte, wachtwoord_uit, gewijzigd_op) VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, ruimte) DO UPDATE SET wachtwoord_uit = EXCLUDED.wachtwoord_uit, gewijzigd_op = now()`, [lade.userId, lade.ruimte, !aan]);
  if (!aan) await wachtwoordOmslagWeg(lade);
  await audit(lade.userId, 'sleutelkluis.wachtwoord_opent', { ruimte: lade.ruimte, aan });
}

// ------------------------------------------------------------------------------------------------ wachtwoord
/** Hoe lang een KEK uit het wachtwoord hoogstens in het geheugen wacht op een open sleutel. */
export const WACHT_MS = 15 * 60 * 1000;
const wachtend = new Map<string, { kek: Buffer; salt: Buffer; tot: number }>();
const wachtWeg = (lade: KluisLade) => { const w = wachtend.get(sleutelVan(lade)); if (w) { nul(w.kek); wachtend.delete(sleutelVan(lade)); } };
const wachtZetten = (lade: KluisLade, kek: Buffer, salt: Buffer) => { wachtWeg(lade); wachtend.set(sleutelVan(lade), { kek, salt, tot: Date.now() + WACHT_MS }); };
/** Alleen voor tests en diagnose: wacht er nu een KEK voor deze lade? (De KEK zelf komt hier nooit naar buiten.) */
export const wachtVoor = (lade: KluisLade): boolean => { const w = wachtend.get(sleutelVan(lade)); return !!w && w.tot > Date.now(); };

const AAD = (lade: KluisLade) => omslagAad(lade.userId, lade.ruimte, 'wachtwoord', 'wachtwoord');
async function wachtwoordOmslaan(lade: KluisLade, dek: Buffer, kek: Buffer, salt: Buffer, waarom: string): Promise<void> {
  const envelop = omslaan(kek, dek, AAD(lade));
  await omslagZetten(lade, 'wachtwoord', 'wachtwoord', '', { kdf: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString('base64url') }, envelop);
  await audit(lade.userId, 'sleutelkluis.wachtwoord_omslag', { ruimte: lade.ruimte, waarom });
}
export async function wachtwoordOmslagWeg(lade: KluisLade): Promise<boolean> {
  wachtWeg(lade);
  const r = await sys().query(`DELETE FROM app.sleutelkluis_omslag WHERE user_id = $1 AND ruimte = $2 AND soort = 'wachtwoord'`, [lade.userId, lade.ruimte]);
  return (r.rowCount ?? 0) > 0;
}
// Wacht er een KEK en gaat de sleutel open (op welke manier ook)? Dan nu de omslag maken en de KEK vergeten.
naOpenen(async (lade, dek) => {
  const w = wachtend.get(sleutelVan(lade));
  if (!w) return;
  wachtend.delete(sleutelVan(lade));
  try { if (w.tot > Date.now() && (await isIngeschakeld(lade))) await wachtwoordOmslaan(lade, dek, w.kek, w.salt, 'na-openen'); }
  finally { nul(w.kek); }
});

/**
 * Na een GESLAAGDE aanmelding met wachtwoord (en tweede factor als die er is): per ruimte met kluis de sleutel openen voor de nieuwe
 * sessie. Fouten hier breken de aanmelding nooit (de kaart blijft de weg terug). Geeft terug welke ruimtes nu open zijn.
 */
export async function naWachtwoordAanmelding(userId: string, wachtwoord: string, sessieIds: string[]): Promise<AiRuimte[]> {
  const houders = sessieHouders(sessieIds);
  const open: AiRuimte[] = [];
  if (!wachtwoord || !houders.length) return open;
  for (const lade of ladenVan(userId)) {
    try {
      if (!(await isIngeschakeld(lade)) || !(await wachtwoordOpentToegestaan(lade))) continue;
      const [rij] = await omslagenVan(lade, 'wachtwoord', 'wachtwoord');
      if (rij) {
        const p = rij.parameters as { N?: number; r?: number; p?: number; salt?: string };
        const kek = await kekUitWachtwoordAsync(wachtwoord, Buffer.from(String(p.salt || ''), 'base64url'), { N: Number(p.N) || SCRYPT.N, r: Number(p.r) || SCRYPT.r, p: Number(p.p) || SCRYPT.p });
        let dek: Buffer | null = null;
        try { dek = omslagOpenen(kek, rij.envelop, AAD(lade)); } catch { dek = null; } finally { nul(kek); }
        if (dek) {
          for (const h of houders) await sleutelOpenen(lade, dek, h);
          nul(dek);
          void omslagGebruikt(rij.id);
          await audit(userId, 'sleutelkluis.ontgrendeld', { ruimte: lade.ruimte, methode: 'wachtwoord-aanmelding' });
          open.push(lade.ruimte);
          continue;
        }
        // Past niet meer (het wachtwoord werd elders gewijzigd zonder open sleutel): de oude omslag weg, hieronder opnieuw.
        await wachtwoordOmslagWeg(lade);
      }
      const salt = randomBytes(16);
      const kek = await kekUitWachtwoordAsync(wachtwoord, salt, SCRYPT);
      const nu = sleutelOpen(lade);
      if (nu) {
        const dek = Buffer.from(nu);
        try {
          for (const h of houders) await sleutelOpenen(lade, dek, h);
          await wachtwoordOmslaan(lade, dek, kek, salt, 'aanmelding');
        } finally { nul(dek); nul(kek); }
        open.push(lade.ruimte);
      } else wachtZetten(lade, kek, salt);
    } catch (e) { console.error('[sleutelkluis] wachtwoord na aanmelding:', (e as Error).message); }
  }
  return open;
}

/** Het wachtwoord is gewijzigd (door de mens zelf, met step-up): de oude omslag past niet meer → nieuwe, of wachten op open. */
export async function wachtwoordGewijzigd(userId: string, nieuw: string): Promise<void> {
  for (const lade of ladenVan(userId)) {
    try {
      if (!(await isIngeschakeld(lade))) continue;
      await wachtwoordOmslagWeg(lade);
      if (!(await wachtwoordOpentToegestaan(lade))) continue;
      const salt = randomBytes(16);
      const kek = await kekUitWachtwoordAsync(nieuw, salt, SCRYPT);
      const open = sleutelOpen(lade);
      if (open) { const dek = Buffer.from(open); try { await wachtwoordOmslaan(lade, dek, kek, salt, 'wachtwoord-gewijzigd'); } finally { nul(dek); nul(kek); } }
      else wachtZetten(lade, kek, salt);
    } catch (e) { console.error('[sleutelkluis] wachtwoord gewijzigd:', (e as Error).message); }
  }
}
/** Het wachtwoord is verwijderd of door de beheerder vervangen: geen enkele wachtwoordomslag meer. */
export async function wachtwoordVervallen(userId: string): Promise<void> {
  for (const lade of ladenVan(userId)) await wachtwoordOmslagWeg(lade).catch(() => false);
}

// ------------------------------------------------------------------------------------------------ passkey bij het aanmelden
export const TOKEN_MS = 2 * 60 * 1000;
const tokens = new Map<string, { userId: string; passkeyId: string; houders: Array<{ soort: 'sessie'; id: string }>; ruimtes: Set<AiRuimte>; tot: number }>();
const tokensOpruimen = () => { const nu = Date.now(); for (const [k, t] of tokens) if (t.tot <= nu) tokens.delete(k); };

/**
 * Na een geslaagde aanmelding met een passkey. Ruimtes die al open zijn, krijgen de nieuwe sessie als houder (geen werk voor de
 * browser). Voor dichte ruimtes met een 'passkey-aanmelden'-omslag van DEZE passkey: de omslag + een eenmalig token terug.
 */
export async function naPasskeyAanmelding(userId: string, passkeyId: string, sessieIds: string[]): Promise<{ token: string; omslagen: Array<{ ruimte: AiRuimte; envelop: string; aad: string }> } | null> {
  const houders = sessieHouders(sessieIds);
  if (!houders.length) return null;
  const omslagen: Array<{ ruimte: AiRuimte; envelop: string; aad: string }> = [];
  for (const lade of ladenVan(userId)) {
    try {
      if (!(await isIngeschakeld(lade))) continue;
      const open = sleutelOpen(lade);
      if (open) { const dek = Buffer.from(open); try { for (const h of houders) await sleutelOpenen(lade, dek, h); } finally { nul(dek); } continue; }
      const [rij] = await omslagenVan(lade, 'passkey-aanmelden', passkeyId);
      if (rij) omslagen.push({ ruimte: lade.ruimte, envelop: rij.envelop, aad: omslagAad(lade.userId, lade.ruimte, 'passkey-aanmelden', passkeyId) });
    } catch (e) { console.error('[sleutelkluis] passkey na aanmelding:', (e as Error).message); }
  }
  if (!omslagen.length) return null;
  tokensOpruimen();
  const token = randomBytes(32).toString('base64url');
  tokens.set(token, { userId, passkeyId, houders, ruimtes: new Set(omslagen.map((o) => o.ruimte)), tot: Date.now() + TOKEN_MS });
  return { token, omslagen };
}

/** De browser opende de omslag met de PRF van de aanmelding en stuurt de DEK. Eenmalig per ruimte; de DEK wordt gecontroleerd. */
export async function aanmeldTokenGebruiken(token: unknown, ruimte: unknown, dekHex: unknown): Promise<{ userId: string; ruimte: AiRuimte }> {
  tokensOpruimen();
  const t = typeof token === 'string' ? tokens.get(token) : undefined;
  const r: AiRuimte = ruimte === 'technisch' ? 'technisch' : 'prive';
  if (!t || !t.ruimtes.has(r)) throw new SleutelkluisFout('SLEUTELKLUIS_AANMELD_TOKEN', 403);
  t.ruimtes.delete(r);
  if (!t.ruimtes.size) tokens.delete(String(token));
  if (!/^[0-9a-f]{64}$/i.test(String(dekHex || ''))) throw new SleutelkluisFout('SLEUTELKLUIS_DEK_ONGELDIG', 403);
  const lade: KluisLade = { userId: t.userId, ruimte: r };
  const dek = Buffer.from(String(dekHex), 'hex');
  try { for (const h of t.houders) await sleutelOpenen(lade, dek, h); } finally { nul(dek); }
  const [rij] = await omslagenVan(lade, 'passkey-aanmelden', t.passkeyId);
  if (rij) void omslagGebruikt(rij.id);
  await audit(t.userId, 'sleutelkluis.ontgrendeld', { ruimte: r, methode: 'passkey-aanmelding', passkey: t.passkeyId.slice(0, 8) });
  return { userId: t.userId, ruimte: r };
}

/** De browser sloeg de DEK om onder de PRF met het aanmeldzout (bij koppelen of ontgrendelen met DEZE, net gecontroleerde passkey). */
export async function passkeyAanmeldOmslagOpslaan(lade: KluisLade, passkeyId: string, envelop: unknown): Promise<boolean> {
  const e = String(envelop || '');
  if (!e) return false;
  if (!/^[0-9a-f-]{36}$/i.test(passkeyId) || !/^omslag1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(e) || e.length > 400) throw new SleutelkluisFout('SLEUTELKLUIS_OMSLAG_ONGELDIG');
  if (!(await isIngeschakeld(lade))) return false;
  await omslagZetten(lade, 'passkey-aanmelden', passkeyId, '', { salt: AANMELD_PRF_ZOUT, prf: true }, e);
  await audit(lade.userId, 'sleutelkluis.passkey_aanmelden_omslag', { ruimte: lade.ruimte, passkey: passkeyId.slice(0, 8) });
  return true;
}

/** Alleen voor tests. */
export const aanmeldGeheugenLeeg = () => { for (const k of [...wachtend.keys()]) { nul(wachtend.get(k)?.kek); wachtend.delete(k); } tokens.clear(); };
