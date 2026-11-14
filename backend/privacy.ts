// Fase 3 — privacy (AVG/GDPR):
//  * analytics: toestemming staat standaard UIT; zonder toestemming wordt niets geteld. Met toestemming
//    alleen anonieme dagtellers per gebeurtenisnaam (geen user-id, IP of apparaat in de teller).
//  * export: alle rijen van het account (app.records.owner_id = account) + bestandsmetadata, als JSON,
//    met geheimen/hashes weggelaten.
//  * verwijderen (INTEG-001, 03.11.2026): zelf wissen én beheer lopen via deleteRecoverably (status=deleted, 30 dagen
//    herstelbaar). De opruimjob rondt verlopen verwijderingen af met het VOLLEDIGE wissen (accountMeteenWissen:
//    alle tabellen met een accountkolom + records + bestanden; SEC-002 privacy-logboek-01). Onomkeerbaar; standaard
//    aan, uitzetten met ACCOUNT_DEFINITIEF_WISSEN=0 — dan rapporteert de job alleen (droog).
import { strToU8, zipSync } from 'fflate';
import { getPool } from '../server/platform/pg';
import { storage } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';

export const PRIVACY_TABEL = 'privacy_voorkeuren_v1';
export const ANALYTICS_TABEL = 'analytics_tellers_v1';
// Audit-fix 10: ruimer (liever een veld te veel weglaten dan een geheim exporteren): ook sleutels, API-keys,
// credentials, refresh/access, sessies, OTP/TOTP/herstel, handtekeningen, JWT en versleutelde velden (…Enc).
const GEHEIM_SLEUTEL = /(token|secret|hash|cookie|proof|nonce|pkce|pass(word|wd|phrase)?$|password|wachtwoord|cipher|encrypt|sealed|salt|verifier|codes?$|seed|private|key$|keys$|api[-_]?key|credential|authoriz|bearer|jwt|signature|otp|totp|recovery|herstel|session|refresh|grant|^iv$|^tag$|enc$|kid$|geheim|sleutel|envelop|omslag|zegel|hmac|(^|_)binding(_|$)|^binding|uitdaging|challenge)/i;
// SEC-002 (privacy-logboek-08): sleutelmateriaal met een andere kolomnaam ging mee in de export — de omslag van de
// gegevenssleutel (envelop + KDF-parameters), de controlewaarde, passkey-uitdagingen, HMAC-bindingen van technische sessies,
// OAuth-challenge en zegels. De namen hierboven dekken die (algemene namen als «state» en «controle» alleen per tabel,
// zodat een gewoon veld met die naam elders niet uit de kopie verdwijnt); tabellen die ALLEEN zulk kortlevend of sleutelmateriaal
// bevatten gaan helemaal niet mee, en van de omslagtabel alleen de niet-geheime kolommen (wat, voor wie, wanneer).
const NIET_IN_EXPORT = new Set(['passkey_uitdagingen']);
const EXTRA_WEG: Record<string, string[]> = { sleutelkluis_omslag: ['parameters', 'envelop'], sleutelkluis: ['controle'], mcp_oauth_auth: ['state'] };
const GEBEURTENIS = /^[a-z0-9][a-z0-9_.-]{0,59}$/;
/** Kolommen waarmee een rij bij een account hoort: het account is dan het onderwerp van de rij (zelfde reikwijdte als het wissen). */
const ACCOUNT_KOLOMMEN = ['user_id', 'owner_id', 'account_id', 'eigenaar_id'];
/** Een versleutelde envelop (v1.iv.ct.tag, dek1.… of een omslag van de gegevenssleutel omslag1.…) is een geheim en hoort niet in de kopie. */
const VERSLEUTELD = /^(v[1-9]\.[^.\s]+\.[^.\s]+\.[^.\s]+|dek1\.|omslag1\.)/; // v2…v9: na rotatie van de serversleutel (geheimen-07)

export async function privacyVoorkeur(userId: string): Promise<{ analyticsConsent: boolean; updatedAt: number }> {
  const r = await getPool().query("SELECT data FROM app.records WHERE tbl = $1 AND data->>'userId' = $2 ORDER BY seq DESC LIMIT 1", [PRIVACY_TABEL, userId]);
  const d = (r.rows[0]?.data || {}) as { analyticsConsent?: unknown; updatedAt?: unknown };
  return { analyticsConsent: d.analyticsConsent === true, updatedAt: Number(d.updatedAt || 0) };
}

export async function zetAnalyticsToestemming(userId: string, waarde: boolean): Promise<{ analyticsConsent: boolean; updatedAt: number }> {
  const nu = Date.now();
  const data = { userId, analyticsConsent: waarde === true, updatedAt: nu };
  await getPool().query(
    `INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (tbl, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [PRIVACY_TABEL, `privacy:${userId}`, JSON.stringify(data)],
  );
  return { analyticsConsent: data.analyticsConsent, updatedAt: nu };
}

/** Telt één anonieme gebeurtenis, alleen met toestemming. De teller bevat geen verwijzing naar het account. */
export async function analyticsTellen(userId: string, naam: unknown): Promise<'geteld' | 'geen-toestemming' | 'ongeldig'> {
  const n = String(naam || '').trim().toLowerCase();
  if (!GEBEURTENIS.test(n)) return 'ongeldig';
  if (!(await privacyVoorkeur(userId)).analyticsConsent) return 'geen-toestemming';
  const dag = new Date().toISOString().slice(0, 10);
  await getPool().query(
    `INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, jsonb_build_object('dag', $3::text, 'naam', $4::text, 'aantal', 1))
     ON CONFLICT (tbl, id) DO UPDATE SET data = jsonb_set(app.records.data, '{aantal}', to_jsonb(COALESCE((app.records.data->>'aantal')::bigint, 0) + 1)), updated_at = now()`,
    [ANALYTICS_TABEL, `a:${dag}:${n}`, dag, n],
  );
  return 'geteld';
}

export function zonderGeheimen(waarde: unknown, diepte = 0): unknown {
  if (diepte > 12) return '[diep]';
  if (waarde instanceof Date) return waarde;
  if (Buffer.isBuffer(waarde)) return `[binair, ${waarde.length} bytes]`;
  if (typeof waarde === 'string' && VERSLEUTELD.test(waarde)) return '[versleuteld, niet opgenomen]';
  if (Array.isArray(waarde)) return waarde.map((v) => zonderGeheimen(v, diepte + 1));
  if (waarde && typeof waarde === 'object') {
    return Object.fromEntries(Object.entries(waarde as Record<string, unknown>).filter(([k]) => !GEHEIM_SLEUTEL.test(k)).map(([k, v]) => [k, zonderGeheimen(v, diepte + 1)]));
  }
  return waarde;
}

/**
 * Export van alle gegevens die bij dit account horen. Dezelfde reikwijdte als het wissen (wisRecordsVanAccount), plus
 * elke andere tabel met een accountkolom: een nieuwe tabel komt zo vanzelf mee. Geen afkapping en geen stille fouten:
 * als een deel niet te lezen is, stopt de export i.p.v. dat er stilzwijgend iets ontbreekt.
 */
export async function persoonsgegevensExport(userId: string) {
  const pool = getPool();
  const account = await pool.query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [userId]);
  const email = String((account.rows[0]?.data as { email?: unknown } | undefined)?.email || '').toLowerCase();
  const rijen = await pool.query(
    `SELECT tbl, id, data, created_at, updated_at FROM app.records
      WHERE (tbl = 'users' AND id = $1)
         OR owner_id = $1
         OR (tbl <> 'users' AND (data->>'accountId' = $1 OR data->>'userId' = $1 OR data->>'recipientUserId' = $1))
         OR ($2 <> '' AND tbl IN ('workspace_members', 'site_notifications') AND COALESCE(data->>'userId', '') = ''
             AND COALESCE(data->>'recipientUserId', '') = '' AND lower(COALESCE(data->>'email', data->>'recipientEmail', '')) = $2)
      ORDER BY tbl, seq`,
    [userId, email],
  );
  const gegevens: Record<string, unknown[]> = {};
  for (const r of rijen.rows) (gegevens[r.tbl] ||= []).push({ id: r.id, aangemaakt: r.created_at, bijgewerkt: r.updated_at, gegevens: zonderGeheimen(r.data) });
  // Alle andere tabellen met een accountkolom. records en storage_objects hierboven of hieronder apart.
  const tabellen = await pool.query(
    `SELECT table_name::text AS tabel, array_agg(column_name::text ORDER BY column_name) AS kolommen
       FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name NOT IN ('records', 'storage_objects') AND column_name = ANY($1::text[])
      GROUP BY table_name ORDER BY table_name`,
    [ACCOUNT_KOLOMMEN],
  );
  const beveiligingslog: unknown[] = [];
  for (const t of tabellen.rows as Array<{ tabel: string; kolommen: string[] }>) {
    if (NIET_IN_EXPORT.has(t.tabel)) continue;
    const weg = EXTRA_WEG[t.tabel] || [];
    const schoon = (r: Record<string, unknown>) => zonderGeheimen(weg.length ? Object.fromEntries(Object.entries(r).filter(([k]) => !weg.includes(k))) : r);
    const voorwaarde = t.kolommen.map((k) => `"${k}"::text = $1`).join(' OR ');
    const uit = await pool.query(`SELECT * FROM app."${t.tabel}" WHERE ${voorwaarde}`, [userId]);
    if (t.tabel === 'audit') beveiligingslog.push(...uit.rows.map((r) => schoon(r)));
    else if (uit.rows.length) gegevens[`app.${t.tabel}`] = uit.rows.map((r) => schoon(r));
  }
  const bestanden = await pool.query('SELECT path, content_type, size_bytes, created_at FROM app.storage_objects WHERE owner_id = $1 ORDER BY created_at', [userId]);
  return {
    formaat: 'mijn-ruimte-export-v1',
    gemaaktOp: new Date().toISOString(),
    accountId: userId,
    toelichting: 'Geheimen, tokens, sleutels en versleutelde velden zijn niet opgenomen. Bestanden: alleen metadata; de inhoud zelf is via de cloud-app te downloaden.',
    gegevens,
    bestanden: bestanden.rows,
    beveiligingslog,
  };
}

// ------------------------------------------------------------------------------------------------ IDENTITEIT-015: ZIP із CSV
// «Табличний» формат вивантаження: ті самі дані, що й у JSON (уже без секретів — zonderGeheimen), по одному CSV на таблицю в ZIP
// (fflate, уже залежність проєкту). Вкладені об'єкти — стовпці «батько.поле» на один рівень, глибше й масиви — JSON у клітинці.
// Захист від формул у табличних програмах: клітинка, що починається з = + - @ або табуляції, отримує апостроф спереду.
// Tabelvorm van de export: per tabel één CSV in een ZIP, zonder geheimen, met bescherming tegen formules.
export const ZIP_FORMAAT = 'mijn-ruimte-export-v1-zip';
type Export = Awaited<ReturnType<typeof persoonsgegevensExport>>;
const FORMULE = /^[=+\-@\t\r]/;
function celTekst(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (FORMULE.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const gewoonObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !Buffer.isBuffer(v);
/** Een rij plat maken: één niveau «ouder.veld», dieper blijft JSON in de cel. */
function plat(rij: unknown): Record<string, unknown> {
  if (!gewoonObject(rij)) return { waarde: rij };
  const uit: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rij)) {
    if (gewoonObject(v) && Object.keys(v).length) for (const [k2, v2] of Object.entries(v)) uit[`${k}.${k2}`] = v2;
    else uit[k] = v;
  }
  return uit;
}
/** CSV (RFC 4180, CRLF, UTF-8 met BOM voor spreadsheetprogramma's) uit een lijst rijen; kolommen = vereniging van alle sleutels. */
export function naarCsv(rijen: unknown[]): string {
  const platte = rijen.map(plat);
  const kolommen: string[] = [];
  const gezien = new Set<string>();
  for (const r of platte) for (const k of Object.keys(r)) if (!gezien.has(k)) { gezien.add(k); kolommen.push(k); }
  const regels = [kolommen.map(celTekst).join(','), ...platte.map((r) => kolommen.map((k) => celTekst(r[k])).join(','))];
  return `﻿${regels.join('\r\n')}\r\n`;
}
const bestandVoor = (naam: string, gebruikt: Set<string>) => {
  const basis = naam.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 80) || 'tabel';
  let n = `${basis}.csv`, i = 2;
  while (gebruikt.has(n.toLowerCase())) n = `${basis}-${i++}.csv`;
  gebruikt.add(n.toLowerCase());
  return n;
};
/** ZIP met één CSV per tabel + bestanden.csv + beveiligingslog.csv + LEESMIJ.txt. Geen netwerk, geen schijf. */
export async function persoonsgegevensZip(data: Export): Promise<{ bytes: Buffer; tabellen: Array<{ naam: string; bestand: string; rijen: number }> }> {
  const gebruikt = new Set<string>(['leesmij.txt']);
  const tabellen: Array<{ naam: string; bestand: string; rijen: number }> = [];
  const inhoud: Record<string, Uint8Array> = {};
  const voeg = (naam: string, rijen: unknown[], map = '') => {
    const bestand = bestandVoor(naam, gebruikt);
    inhoud[`${map}${bestand}`] = strToU8(naarCsv(rijen));
    tabellen.push({ naam, bestand: `${map}${bestand}`, rijen: rijen.length });
  };
  for (const [naam, rijen] of Object.entries(data.gegevens)) voeg(naam, rijen as unknown[], 'tabellen/');
  voeg('bestanden', data.bestanden as unknown[]);
  voeg('beveiligingslog', data.beveiligingslog);
  const lijst = tabellen.map((t) => `- ${t.bestand}: ${t.rijen}`).join('\n');
  inhoud['LEESMIJ.txt'] = strToU8([
    `Mijn Ruimte — вивантаження даних / export van gegevens (${data.gemaaktOp}), обліковий запис / account ${data.accountId}`,
    '',
    'Один CSV-файл на таблицю (UTF-8, кома як роздільник). Вкладені поля — стовпці «батько.поле»; глибші — JSON у клітинці.',
    'Паролі, ключі, токени й зашифровані поля не включено. Файли — лише перелік (bestanden.csv); вміст завантажте в хмарі.',
    'beveiligingslog.csv — журнал безпеки: входи, пристрої, дії з доступом. Зберігайте архів як пароль і не пересилайте.',
    '',
    'Eén CSV-bestand per tabel (UTF-8, komma als scheidingsteken). Geneste velden: kolommen «ouder.veld»; dieper: JSON in de cel.',
    'Wachtwoorden, sleutels, tokens en versleutelde velden zijn niet opgenomen. Bestanden: alleen de lijst (bestanden.csv).',
    'beveiligingslog.csv is het beveiligingslogboek. Bewaar het archief als een wachtwoord en stuur het niet door.',
    '',
    lijst,
    '',
  ].join('\r\n'));
  return { bytes: Buffer.from(zipSync(inhoud, { level: 6 })), tabellen };
}

/** Стерти записи й файли одного акаунта і лишити надгробок без персональних даних. Власника сервера не чіпає. */
export async function wisRecordsVanAccount(userId: string, email: string, nu = Date.now()): Promise<{ rijen: number; bestanden: number }> {
  const pool = getPool();
  const rol = await pool.query("SELECT COALESCE(data->>'role', '') AS role FROM app.records WHERE tbl = 'users' AND id = $1", [userId]);
  if (String(rol.rows[0]?.role || '') === 'owner') throw new Error('OWNER_NIET_WISSEN');
  const adres = String(email || '').toLowerCase();
  const paden = (await pool.query('SELECT path FROM app.storage_objects WHERE owner_id = $1', [userId])).rows.map((r) => String(r.path));
  for (let i = 0; i < paden.length; i += 100) await storage.delete(paden.slice(i, i + 100));
  const weg = await pool.query(
    `DELETE FROM app.records WHERE (owner_id = $1 AND tbl <> 'users')
        OR (tbl <> 'users' AND (data->>'accountId' = $1 OR data->>'userId' = $1 OR data->>'recipientUserId' = $1))
        OR ($2 <> '' AND tbl IN ('workspace_members', 'site_notifications')
            AND COALESCE(data->>'userId', '') = '' AND COALESCE(data->>'recipientUserId', '') = ''
            AND lower(COALESCE(data->>'email', data->>'recipientEmail', '')) = $2
            AND NOT EXISTS (SELECT 1 FROM app.records u WHERE u.tbl = 'users' AND u.id <> $1 AND lower(u.data->>'email') = $2))`,
    [userId, adres],
  );
  const bestaand = await pool.query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [userId]);
  const oud = (bestaand.rows[0]?.data || {}) as { deletedAt?: number; recoverableUntil?: number };
  const tombe = { status: 'deleted', role: 'member', email: `gewist-${userId}@invalid`, name: '', picture: '', sub: '', entitlements: [], deletedAt: oud.deletedAt || nu, recoverableUntil: nu, retiredAt: nu, gewistAt: nu, updatedAt: nu };
  await pool.query("UPDATE app.records SET data = $2::jsonb, updated_at = now() WHERE tbl = 'users' AND id = $1", [userId, JSON.stringify(tombe)]);
  await auditToevoegen({ ownerId: userId, actorId: 'systeem', action: 'account.definitief_gewist', result: 'success', details: { rijen: weg.rowCount || 0, bestanden: paden.length } }).catch(() => undefined);
  return { rijen: weg.rowCount || 0, bestanden: paden.length };
}

/**
 * SEC-002 (toets-g10b #4): een account dat niet gewist kan worden, valt niet meer stil weg. Teller en tijd op de grafsteen
 * (de kandidatenlijst zet zulke accounts achteraan, zodat ze de rest niet blokkeren), een regel in het auditlogboek, en bij de
 * eerste mislukking en daarna elke 10e een melding aan de eigenaar van de site. Alleen de foutcode, geen persoonsgegevens.
 */
async function afrondenMisluktVastleggen(userId: string, fout: string): Promise<void> {
  try {
    const r = await getPool().query(
      `UPDATE app.records SET data = data || jsonb_build_object('afrondenMislukt', COALESCE((data->>'afrondenMislukt')::int, 0) + 1, 'afrondenLaatstePoging', $2::bigint)
        WHERE tbl = 'users' AND id = $1 RETURNING (data->>'afrondenMislukt')::int AS n`, [userId, Date.now()]);
    const n = Number(r.rows[0]?.n || 0);
    await auditToevoegen({ ownerId: userId, actorId: 'systeem', action: 'privacy.afronden_mislukt', result: 'failure', details: { userId, fout: fout.slice(0, 120), pogingen: n } }).catch(() => undefined);
    if (n === 1 || n % 10 === 0) {
      const eigenaar = (await getPool().query(`SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' ORDER BY seq LIMIT 1`)).rows[0]?.id as string | undefined;
      if (eigenaar) {
        const { meld } = await import('./melder');
        await meld(eigenaar, 'security', 'Остаточне стирання не вдалося / Definitief wissen mislukt',
          `Обліковий запис ${userId} не вдалося остаточно стерти після 30 днів (спроба ${n}): ${fout.slice(0, 80)}. Дані лишаються в базі, доки причину не усунуто. / Account ${userId} kon na 30 dagen niet definitief gewist worden (poging ${n}): ${fout.slice(0, 80)}. De gegevens blijven staan tot de oorzaak is opgelost.`);
      }
    }
  } catch (e) { console.error('[privacy] mislukking vastleggen mislukt:', String((e as Error)?.message || e).slice(0, 120)); }
}

/**
 * Afronden van verwijderingen waarvan de herstelperiode voorbij is (30 dagen). INTEG-001: standaard aan; uitzetten met ACCOUNT_DEFINITIEF_WISSEN=0.
 * SEC-002 (privacy-logboek-01): het afronden is het VOLLEDIGE wissen (accountMeteenWissen): ook alle relationele tabellen
 * met een accountkolom (zoekindex, notities, concepten, passkeys, koppelingen …), niet alleen app.records en bestanden.
 * Dynamische import: account-wissen.ts importeert dit bestand al statisch. Eén mislukt account houdt de andere niet tegen
 * en blijft kandidaat (geen gewistAt) voor de volgende ronde.
 */
export async function verlopenVerwijderingenAfronden(nu = Date.now(), uitvoeren = process.env.ACCOUNT_DEFINITIEF_WISSEN !== '0') {
  const pool = getPool();
  const kandidaten = await pool.query(
    `SELECT id, data FROM app.records WHERE tbl = 'users' AND data->>'status' = 'deleted'
       AND jsonb_typeof(data->'recoverableUntil') = 'number' AND (data->>'recoverableUntil')::numeric > 0 AND (data->>'recoverableUntil')::numeric < $1
       AND COALESCE(data->>'gewistAt', '') = '' AND COALESCE(data->>'role', '') <> 'owner'
      ORDER BY COALESCE((data->>'afrondenMislukt')::int, 0), (data->>'recoverableUntil')::numeric LIMIT 50`, /* toets-g10b #4: wie steeds faalt, achteraan */
    [nu],
  );
  const { accountMeteenWissen, accountWisTelling } = await import('./account-wissen');
  const verslag: Array<{ id: string; rijen: number; bestanden: number; fout?: string }> = [];
  for (const k of kandidaten.rows as Array<{ id: string; data: Record<string, unknown> }>) {
    const email = String(k.data.email || '').toLowerCase();
    try {
      if (!uitvoeren) {
        const n = await pool.query('SELECT count(*)::int n FROM app.records WHERE owner_id = $1 AND tbl <> $2', [k.id, 'users']);
        const b = await pool.query('SELECT count(*)::int n FROM app.storage_objects WHERE owner_id = $1', [k.id]);
        const relationeel = await accountWisTelling(k.id);
        verslag.push({ id: k.id, rijen: Number(n.rows[0].n) + relationeel.rijen, bestanden: Number(b.rows[0].n) });
        continue;
      }
      const gewist = await accountMeteenWissen(k.id, email, nu);
      verslag.push({ id: k.id, rijen: gewist.rijen, bestanden: gewist.bestanden });
    } catch (e) {
      const fout = String((e as Error)?.message || e).slice(0, 120);
      console.error('[privacy] account afronden mislukt:', k.id, fout);
      verslag.push({ id: k.id, rijen: 0, bestanden: 0, fout });
      if (uitvoeren) await afrondenMisluktVastleggen(k.id, fout);
    }
  }
  return { uitgevoerd: uitvoeren, accounts: verslag };
}
