// MAILBEELD-001 (16.11.2026) — «Завантажувати при отриманні (приватно)»: externe beelden van NIEUWE brieven haalt de eigen server op
// zodra de brief binnenkomt, en bewaart ze (onder de eigen gegevenssleutel als de sleutelkluis aanstaat). Bij het lezen komen ze
// daarna uit deze voorraad: geen enkel verzoek meer naar buiten, dus de afzender ziet niet óf en wanneer de brief gelezen werd.
// Besluit van de eigenaar 16.11.2026: «згоден … також треба щоб можна було змінити вибір будь-коли» → keuze in «Вигляд», op elk moment.
//
// Wat wel en niet:
//   • alleen brieven die NA het aanzetten binnenkomen (de incrementele synchronisatie), nooit het archief;
//   • niet voor Spam, Prullenbak, Verzonden en Concepten (labels van Gmail op het moment van ontvangst);
//   • alleen https-beelden uit <img src> en background="…" — precies wat het leesvenster zelf zou ophalen (src/MailBerichtTekst.tsx);
//   • hoogstens 30 beelden per brief, 4 MiB per beeld (de grens van de beeldproxy), 512 MiB per lade (oudst gebruikte eerst weg),
//     180 dagen na het laatste gebruik weg;
//   • de URL zelf wordt niet bewaard: alleen HMAC(pepper, url) — een URL van een volgpixel bevat vaak een persoonlijke code;
//   • sleutelkluis aan maar dicht → NIETS bewaard (ook niet onversleuteld); de brief komt in de wachtrij (alleen het id bij de
//     provider) en wordt bij de volgende onderhoudsronde met open sleutel alsnog verwerkt.
// Uk: сервер завантажує зображення нових листів одразу при отриманні; читання потім нічого не надсилає назовні.
import { createHash, createHmac } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import type { Lade } from '../shared/ruimte-scheiding';
import { isIngeschakeld, journaalTellen, ontzegelMetDek, registreerHerversleutelaar, sleutelOpen, verzegelMetDek } from './sleutelkluis';

const sys = () => getPool('systeem');
export const BEELDEN_PER_BERICHT = 30;
export const PLAFOND_PER_LADE = 512 * 1024 * 1024;
export const BEWAAR_DAGEN = 180;
export const WACHTRIJ_DAGEN = 7;
export const WACHTRIJ_POGINGEN = 5;
/** Labels waarvoor nooit iets wordt opgehaald: Spam (besluit), Prullenbak, en eigen post (Verzonden, Concepten). */
export const OVERSLAAN_LABELS: readonly string[] = Object.freeze(['SPAM', 'TRASH', 'SENT', 'DRAFT']);
const MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/apng', 'image/x-icon', 'image/vnd.microsoft.icon']);

export type Voorkeur = { bijOntvangst: boolean; aanSinds: number; gewijzigdOp: number };
export type Haal = (url: string) => Promise<{ bytes: Buffer; contentType: string }>;
export type UitVoorraad = { mime: string; inhoud: Buffer } | { gesloten: true } | { fout: string } | null;

const ruimteVan = (l: Lade) => (l.ruimte === 'technisch' ? 'technisch' : 'prive');
/** Dezelfde vorm als de beeldproxy (google-suite-mail-browser.ts → reader/remote-image): zonder NUL, getrimd, hoogstens 8000 tekens. */
export const normaliseerUrl = (url: unknown): string => String(url ?? '').replace(/\u0000/g, '').trim().slice(0, 8000);
/** HMAC van de URL met een serverpepper; zelfde pepperregel als de foto's van afzenders (backend/merk-bron.ts → adresHash). */
export function urlHash(url: string): string {
  for (const naam of ['MAIL_BEELD_PEPPER', 'AFZENDER_BEELD_PEPPER', 'AUDIT_IP_PEPPER']) {
    const p = String(process.env[naam] || '').trim();
    if (p.length >= 32) return createHmac('sha256', p).update(`mail-beeld-v1|${normaliseerUrl(url)}`).digest('hex');
  }
  throw new Error('MAIL_BEELD_PEPPER_ONTBREEKT');
}
const beeldAad = (l: Lade, hash: string) => `mail-beeld|${l.userId}|${ruimteVan(l)}|${hash}`;

// ------------------------------------------------------------------------------------------------ welke beelden staan in een brief
const ENTITEITEN: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
const ontEntiteit = (s: string) => s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi, (heel, e: string) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : heel; }
  return ENTITEITEN[e.toLowerCase()] ?? heel;
});
/**
 * De https-adressen die het leesvenster zou ophalen: `src` van <img> en `background` van elk element (src/MailBerichtTekst.tsx →
 * prepareHtml). Lineaire expressies (geen geneste herhaling), hoogstens 2 MB html bekeken, uniek, in volgorde, hoogstens `max`.
 */
export function beeldUrlsUitHtml(html: string, max = BEELDEN_PER_BERICHT): string[] {
  const bron = String(html || '').slice(0, 2_000_000), uit: string[] = [], gezien = new Set<string>();
  const neem = (raw: string) => {
    const url = normaliseerUrl(ontEntiteit(raw));
    if (!/^https:\/\//i.test(url) || url.length > 8000 || gezien.has(url) || uit.length >= max) return;
    gezien.add(url); uit.push(url);
  };
  const tag = /<(img|[a-z][a-z0-9]{0,15})\b[^>]{0,8000}>/gi;
  for (let m = tag.exec(bron); m && uit.length < max; m = tag.exec(bron)) {
    const heel = m[0], naam = m[1].toLowerCase();
    const attr = (n: string) => { const r = new RegExp(`\\s${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(heel); return r ? (r[1] ?? r[2] ?? r[3] ?? '') : null; };
    if (naam === 'img') { const s = attr('src'); if (s !== null) neem(s); }
    const bg = attr('background'); if (bg !== null) neem(bg);
  }
  return uit;
}

// ------------------------------------------------------------------------------------------------ voorkeur
export async function voorkeurVan(lade: Lade): Promise<Voorkeur> {
  const r = (await sys().query('SELECT bij_ontvangst, aan_sinds, gewijzigd_op FROM app.mail_beeld_voorkeur WHERE user_id = $1 AND ruimte = $2', [lade.userId, ruimteVan(lade)])).rows[0];
  return { bijOntvangst: r?.bij_ontvangst === true, aanSinds: r?.aan_sinds ? new Date(r.aan_sinds).getTime() : 0, gewijzigdOp: r?.gewijzigd_op ? new Date(r.gewijzigd_op).getTime() : 0 };
}
/** Aan of uit, op elk moment. Uitzetten wist niets (de bewaarde beelden blijven tonen zonder spoor); wissen is een eigen knop. */
export async function zetVoorkeur(lade: Lade, aan: boolean): Promise<Voorkeur> {
  await sys().query(
    `INSERT INTO app.mail_beeld_voorkeur (user_id, ruimte, bij_ontvangst, aan_sinds, gewijzigd_op) VALUES ($1, $2, $3, CASE WHEN $3 THEN now() END, now())
     ON CONFLICT (user_id, ruimte) DO UPDATE SET bij_ontvangst = EXCLUDED.bij_ontvangst,
       aan_sinds = CASE WHEN EXCLUDED.bij_ontvangst THEN COALESCE(CASE WHEN app.mail_beeld_voorkeur.bij_ontvangst THEN app.mail_beeld_voorkeur.aan_sinds END, now()) END,
       gewijzigd_op = now()`,
    [lade.userId, ruimteVan(lade), aan === true]);
  if (!aan) await sys().query('DELETE FROM app.mail_beeld_wachtrij WHERE user_id = $1 AND ruimte = $2', [lade.userId, ruimteVan(lade)]);
  return voorkeurVan(lade);
}

// ------------------------------------------------------------------------------------------------ voorraad
/** Eén beeld bewaren (of een negatieve rij). 'gesloten' = sleutelkluis aan maar dicht: niets bewaard. */
export async function beeldOpslaan(lade: Lade, url: string, u: { mime: string; inhoud: Buffer } | { fout: string }): Promise<'ok' | 'gesloten'> {
  const hash = urlHash(url), ruimte = ruimteVan(lade);
  if ('fout' in u) {
    await sys().query(
      `INSERT INTO app.mail_beeld_voorraad (user_id, ruimte, url_hash, fout) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, ruimte, url_hash) DO NOTHING`,
      [lade.userId, ruimte, hash, String(u.fout || 'MISLUKT').replace(/[^A-Z0-9_]/g, '_').slice(0, 60) || 'MISLUKT']);
    return 'ok';
  }
  if (!MIMES.has(u.mime) || !u.inhoud.length || u.inhoud.length > 4 * 1024 * 1024) return beeldOpslaan(lade, url, { fout: 'TYPE_OF_GROOTTE' });
  let data: Buffer | null = u.inhoud, versleuteld: string | null = null;
  if (await isIngeschakeld(lade)) {
    const dek = sleutelOpen(lade);
    if (!dek) { journaalTellen(lade, 'app.mail_beeld_voorraad', 'gesloten-overgeslagen'); return 'gesloten'; }
    versleuteld = verzegelMetDek(dek, u.inhoud.toString('base64'), beeldAad(lade, hash));
    data = null;
  }
  await sys().query(
    `INSERT INTO app.mail_beeld_voorraad (user_id, ruimte, url_hash, mime, grootte, data, data_versleuteld, sha256, fout, opgehaald, laatst_gebruikt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, now(), now())
     ON CONFLICT (user_id, ruimte, url_hash) DO UPDATE SET mime = EXCLUDED.mime, grootte = EXCLUDED.grootte, data = EXCLUDED.data,
       data_versleuteld = EXCLUDED.data_versleuteld, sha256 = EXCLUDED.sha256, fout = NULL, opgehaald = now(), laatst_gebruikt = now()`,
    [lade.userId, ruimte, hash, u.mime, u.inhoud.length, data, versleuteld, createHash('sha256').update(u.inhoud).digest('hex')]);
  return 'ok';
}

/** Het bewaarde beeld voor deze URL in DEZE lade, of null. Werkt `laatst_gebruikt` bij (voor het opruimen). */
export async function beeldUitVoorraad(lade: Lade, url: string): Promise<UitVoorraad> {
  const hash = urlHash(url);
  const r = (await sys().query(
    `UPDATE app.mail_beeld_voorraad SET laatst_gebruikt = now() WHERE user_id = $1 AND ruimte = $2 AND url_hash = $3
     RETURNING mime, data, data_versleuteld, fout`, [lade.userId, ruimteVan(lade), hash])).rows[0] as { mime: string | null; data: Buffer | null; data_versleuteld: string | null; fout: string | null } | undefined;
  if (!r) return null;
  if (r.fout || !r.mime) return { fout: r.fout || 'MISLUKT' };
  if (r.data) return { mime: r.mime, inhoud: Buffer.from(r.data) };
  const dek = sleutelOpen(lade);
  if (!dek) return { gesloten: true };
  try { return { mime: r.mime, inhoud: Buffer.from(ontzegelMetDek(dek, r.data_versleuteld!, beeldAad(lade, hash)), 'base64') }; }
  catch { return { gesloten: true }; }
}

export async function voorraadOmvang(lade: Lade): Promise<{ aantal: number; bytes: number; wachtrij: number }> {
  const [a, w] = await Promise.all([
    sys().query('SELECT count(*)::int AS n, COALESCE(sum(grootte), 0)::bigint AS b FROM app.mail_beeld_voorraad WHERE user_id = $1 AND ruimte = $2 AND fout IS NULL', [lade.userId, ruimteVan(lade)]),
    sys().query('SELECT count(*)::int AS n FROM app.mail_beeld_wachtrij WHERE user_id = $1 AND ruimte = $2', [lade.userId, ruimteVan(lade)]),
  ]);
  return { aantal: Number(a.rows[0]?.n || 0), bytes: Number(a.rows[0]?.b || 0), wachtrij: Number(w.rows[0]?.n || 0) };
}
/** «Видалити збережені зображення»: alles van deze lade weg (voorraad en wachtrij). De keuze zelf blijft. */
export async function voorraadWissen(lade: Lade): Promise<number> {
  const r = await sys().query('DELETE FROM app.mail_beeld_voorraad WHERE user_id = $1 AND ruimte = $2', [lade.userId, ruimteVan(lade)]);
  await sys().query('DELETE FROM app.mail_beeld_wachtrij WHERE user_id = $1 AND ruimte = $2', [lade.userId, ruimteVan(lade)]);
  return r.rowCount ?? 0;
}
/** Opruimen: ongebruikt sinds 180 dagen weg; boven het plafond de langst niet gebruikte eerst. */
export async function voorraadOpruimen(lade: Lade): Promise<number> {
  const u = lade.userId, ru = ruimteVan(lade);
  const oud = await sys().query(`DELETE FROM app.mail_beeld_voorraad WHERE user_id = $1 AND ruimte = $2 AND laatst_gebruikt < now() - make_interval(days => $3)`, [u, ru, BEWAAR_DAGEN]);
  const teVeel = await sys().query(
    `DELETE FROM app.mail_beeld_voorraad v USING (
       SELECT url_hash FROM (SELECT url_hash, sum(grootte) OVER (ORDER BY laatst_gebruikt DESC, url_hash) AS opgeteld
         FROM app.mail_beeld_voorraad WHERE user_id = $1 AND ruimte = $2) x WHERE x.opgeteld > $3) weg
     WHERE v.user_id = $1 AND v.ruimte = $2 AND v.url_hash = weg.url_hash`, [u, ru, PLAFOND_PER_LADE]);
  return (oud.rowCount ?? 0) + (teVeel.rowCount ?? 0);
}

// ------------------------------------------------------------------------------------------------ bij ontvangst
export type OntvangenBrief = { berichtId: string; labelIds: readonly string[]; htmlBody: string };
export type Uitslag = { status: 'uit' | 'overgeslagen' | 'gesloten' | 'klaar'; opgehaald: number; mislukt: number; bekend: number };

/** Moet deze brief nog beelden krijgen? (label-regel + keuze) */
export const briefTelt = (b: Pick<OntvangenBrief, 'labelIds'>): boolean => !b.labelIds.some((l) => OVERSLAAN_LABELS.includes(String(l).toUpperCase()));

async function wachtrijZetten(lade: Lade, mailAccountId: string, berichtId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{3,300}$/.test(berichtId) || !mailAccountId) return;
  await sys().query(
    `INSERT INTO app.mail_beeld_wachtrij (user_id, ruimte, mail_account_id, bericht_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, ruimte, mail_account_id, bericht_id) DO NOTHING`, [lade.userId, ruimteVan(lade), mailAccountId.slice(0, 300), berichtId]);
}

/**
 * De beelden van één nieuwe brief ophalen en bewaren. Nooit gooien: een fout van één beeld wordt een negatieve rij, een fout van de
 * database telt als 'mislukt' van de hele brief (de synchronisatie van de post zelf mag hier nooit op stuklopen).
 */
export async function beeldenBijOntvangst(lade: Lade, mailAccountId: string, brief: OntvangenBrief, haal: Haal, opties: { voorkeur?: Voorkeur } = {}): Promise<Uitslag> {
  const leeg = (status: Uitslag['status']): Uitslag => ({ status, opgehaald: 0, mislukt: 0, bekend: 0 });
  try {
    const vk = opties.voorkeur ?? await voorkeurVan(lade);
    if (!vk.bijOntvangst) return leeg('uit');
    if (!briefTelt(brief)) return leeg('overgeslagen');
    const urls = beeldUrlsUitHtml(brief.htmlBody);
    if (!urls.length) return leeg('klaar');
    if (await isIngeschakeld(lade) && !sleutelOpen(lade)) { await wachtrijZetten(lade, mailAccountId, brief.berichtId); return leeg('gesloten'); }
    const hashes = urls.map(urlHash);
    const bekend = new Set((await sys().query('SELECT url_hash FROM app.mail_beeld_voorraad WHERE user_id = $1 AND ruimte = $2 AND url_hash = ANY($3::text[])', [lade.userId, ruimteVan(lade), hashes])).rows.map((r) => String(r.url_hash)));
    const nieuw = urls.filter((_, i) => !bekend.has(hashes[i]));
    const uit: Uitslag = { status: 'klaar', opgehaald: 0, mislukt: 0, bekend: urls.length - nieuw.length };
    let cursor = 0, gesloten = false;
    const werker = async () => {
      for (;;) {
        const i = cursor++;
        if (i >= nieuw.length || gesloten) return;
        const url = nieuw[i];
        let r: 'ok' | 'gesloten';
        try {
          const b = await haal(url);
          r = await beeldOpslaan(lade, url, { mime: b.contentType, inhoud: b.bytes });
          if (r === 'ok') uit.opgehaald += 1;
        } catch (e) {
          const code = (e instanceof Error ? e.message : '').replace(/^GOOGLE_MAIL_READER_IMAGE_/, '') || 'MISLUKT';
          r = await beeldOpslaan(lade, url, { fout: code }).catch(() => 'ok' as const);
          uit.mislukt += 1;
        }
        if (r === 'gesloten') gesloten = true;
      }
    };
    await Promise.all([werker(), werker(), werker()]);
    if (gesloten) { await wachtrijZetten(lade, mailAccountId, brief.berichtId); uit.status = 'gesloten'; }
    if (uit.opgehaald) await voorraadOpruimen(lade).catch(() => 0);
    return uit;
  } catch (e) {
    if (process.env.MAIL_BEELD_DEBUG) console.error('beeldenBijOntvangst', e);
    return { status: 'klaar', opgehaald: 0, mislukt: 1, bekend: 0 };
  }
}

/**
 * Wachtrij verwerken (onderhoudsronde, per mens): brieven van wie de sleutel dicht was. `brief` haalt de brief opnieuw op bij de
 * provider (null = bestaat niet meer). Hoogstens `max` per ronde; na 7 dagen of 5 pogingen vervalt een rij.
 */
export async function wachtrijVerwerken(userId: string, brief: (mailAccountId: string, berichtId: string) => Promise<OntvangenBrief | null>, haal: Haal, max = 10): Promise<{ verwerkt: number; open: number }> {
  await sys().query(`DELETE FROM app.mail_beeld_wachtrij WHERE user_id = $1 AND (ontvangen_op < now() - make_interval(days => $2) OR pogingen >= $3)`, [userId, WACHTRIJ_DAGEN, WACHTRIJ_POGINGEN]);
  const rijen = (await sys().query(`SELECT ruimte, mail_account_id, bericht_id FROM app.mail_beeld_wachtrij WHERE user_id = $1 ORDER BY ontvangen_op LIMIT $2`, [userId, Math.max(1, Math.min(50, max))])).rows as Array<{ ruimte: string; mail_account_id: string; bericht_id: string }>;
  let verwerkt = 0;
  for (const r of rijen) {
    const lade: Lade = { userId, ruimte: r.ruimte === 'technisch' ? 'technisch' : 'prive' };
    if (await isIngeschakeld(lade) && !sleutelOpen(lade)) continue; // nog dicht: blijft staan, telt niet als poging
    const weg = () => sys().query('DELETE FROM app.mail_beeld_wachtrij WHERE user_id = $1 AND ruimte = $2 AND mail_account_id = $3 AND bericht_id = $4', [userId, r.ruimte, r.mail_account_id, r.bericht_id]);
    try {
      const b = await brief(r.mail_account_id, r.bericht_id);
      if (!b) { await weg(); continue; }
      const u = await beeldenBijOntvangst(lade, r.mail_account_id, b, haal);
      if (u.status !== 'gesloten') { await weg(); verwerkt += 1; }
    } catch {
      await sys().query('UPDATE app.mail_beeld_wachtrij SET pogingen = pogingen + 1 WHERE user_id = $1 AND ruimte = $2 AND mail_account_id = $3 AND bericht_id = $4', [userId, r.ruimte, r.mail_account_id, r.bericht_id]);
    }
  }
  const open = Number((await sys().query('SELECT count(*)::int AS n FROM app.mail_beeld_wachtrij WHERE user_id = $1', [userId])).rows[0]?.n || 0);
  return { verwerkt, open };
}

// «Перешифрувати мої дані зараз» (0092): beelden die nog onversleuteld in deze lade staan onder de DEK zetten.
registreerHerversleutelaar('app.mail_beeld_voorraad', async (lade, dek) => {
  const l: Lade = { userId: lade.userId, ruimte: lade.ruimte === 'technisch' ? 'technisch' : 'prive' };
  const rijen = (await sys().query('SELECT url_hash, data FROM app.mail_beeld_voorraad WHERE user_id = $1 AND ruimte = $2 AND data IS NOT NULL', [l.userId, ruimteVan(l)])).rows as Array<{ url_hash: string; data: Buffer }>;
  let n = 0;
  for (const r of rijen) {
    const env = verzegelMetDek(dek, Buffer.from(r.data).toString('base64'), beeldAad(l, r.url_hash));
    n += (await sys().query('UPDATE app.mail_beeld_voorraad SET data = NULL, data_versleuteld = $4 WHERE user_id = $1 AND ruimte = $2 AND url_hash = $3 AND data IS NOT NULL',
      [l.userId, ruimteVan(l), r.url_hash, env])).rowCount ?? 0;
  }
  return { gevonden: rijen.length, herversleuteld: n };
});

// ------------------------------------------------------------------------------------------------ op de achtergrond
// De synchronisatie van de post wacht hier NIET op (een trage beeldserver mag de lijst niet ophouden). Hoogstens twee brieven
// tegelijk voor de hele server; de rest wacht netjes in volgorde. Een fout wordt alleen gelogd (zonder URL of inhoud).
let bezig = 0;
const wacht: Array<() => void> = [];
export function beeldenBijOntvangstOpAchtergrond(lade: Lade, mailAccountId: string, brief: OntvangenBrief, haal: Haal): Promise<Uitslag | null> {
  return new Promise((klaar) => {
    const start = () => {
      bezig += 1;
      beeldenBijOntvangst(lade, mailAccountId, brief, haal)
        .then((u) => klaar(u), () => klaar(null))
        .finally(() => { bezig -= 1; wacht.shift()?.(); });
    };
    if (bezig < 2) start(); else if (wacht.length < 500) wacht.push(start); else klaar(null);
  });
}
