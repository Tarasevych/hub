// ZOEKEN — BRONNEN EN DE LEVENSCYCLUS VAN DE INDEX (Z2, 22.10.2026). Contract: scratchpad/zoek-API.md; kern: backend/zoek-index.ts.
//
// WAT DIT DOET
//   1. LADEN. Voor elke goedgekeurde mens: de persoonlijke lade altijd; de technische lade alleen als hij technische rechten
//      heeft (technischeRechten) — en per deelbare dienst alleen als die dienst daar op «власні дані» staat (standVan === 'eigen').
//      Nooit via tabContext: de cron heeft geen tabblad; de lade wordt EXPLICIET gekozen en elke rij met hoortBij getoetst.
//   2. INCREMENTEEL. app.records heeft updated_at (+ index records_updated_idx): een scanstap leest alleen rijen die ná de
//      waterlijn (updated_at, id) van de vorige stap veranderden — ook bij 50 000 brieven (geen db.list(1000) meer). Bord en
//      ICS/CalDAV hebben hun eigen updated_at/gezien_op. GitHub heeft geen wijzigingsfeed: periodiek (ZOEK_INDEX_GITHUB_MIN).
//   3. VERDWENEN RIJEN. Eens per ZOEK_INDEX_VOLLEDIG_MIN een afstemming op id's (alleen id's, geen inhoud): wat niet meer in
//      de bron staat, verdwijnt uit de index — met de delen (bijlagen, bestanden in archieven) via het voorvoegsel «id:».
//   4. ZWAAR WERK IN DE RIJ. Bijlagen downloaden, bestanden lezen, OCR en archieven (Z3: backend/zoek/inhoud.ts) gebeuren
//      NOOIT in een verzoek van de gebruiker, alleen als wachtrij-item (app.zoek_wachtrij, lease + backoff, backend/zoek/wachtrij.ts).
//   5. SLEUTELKLUIS (0092). Een dichte sleutel = geen fout: het item wordt uitgesteld (WACHT_SLEUTEL), de stand zegt
//      «очікує входу», en zodra de sleutel in het serverproces open is (backend/sleutelkluis-achtergrond.ts) loopt het verder.
//   6. ONTKOPPELD. Is een bron niet (meer) verbonden (koppelFeit), dan wordt haar index gewist (verwijderBron) en de rij
//      geannuleerd — hetzelfde bij bevriezen/verwijderen van een technische lade (LadeUitvoerder, bijTechRechtenVerlies).
//   7. GEHEIMEN. Alle tekst gaat door maskeerGeheimen (adapters.ts) vóór zij de index raakt.
//
// VERTRAGING PER BRON (eerlijk): cron elke 5 min (+ de achtergrondronde in het serverproces, zelfde advisory lock):
//   ui ≤ 5 min na een release; mail/cloud/drive/agenda ≤ 5 min na de synchronisatie van de bron zelf (Gmail-lijst, Drive changes,
//   agenda-sync hebben hun eigen cron van 5 min → effectief ≤ 10 min); bord ≤ 5 min; github ≤ ZOEK_INDEX_GITHUB_MIN (30 min);
//   bijlage/inhoud: daarna, zodra de wachtrij eraan toe is (ZOEK_INDEX_ITEMS per run). Verwijderingen: ≤ ZOEK_INDEX_VOLLEDIG_MIN (15 min; alleen id's).
import { error, json } from '../../server/platform';
import { getPool } from '../../server/platform/pg';
import { hoortBij, type DeelbareDienst, type Lade, type LadeBesluit } from '../../shared/ruimte-scheiding';
import { DIENST_VAN_BRON, type ZoekBron, type ZoekObject } from '../../shared/zoek-model';
import { projectieLade, herkomstUitBody } from '../ruimte-projecties';
import { registreerLadeUitvoerder, standVan, technischeRechten } from '../ruimte-scheiding';
import { ladeNogGeldig, metLade as metCloudLade } from '../ruimte-cloud-agenda';
import { metLade as metMailLade } from '../mail-ruimte';
import { bijTechRechtenVerlies } from '../tech-profiel';
import { kluisStand } from '../sleutelkluis';
import { googleSuiteMailProviderSnapshot, googleSuiteDriveProviderSnapshot, googleSuitePrincipalAccessToken } from '../google-suite-inrichting';
import { normalizeGmailMessage, type GmailMessage } from '../mail-gmail';
import { ghStatus, ghRepos, ghIssues, ghReadme } from '../github-platform';
import { idsVanBron, indexeer, verwijder, verwijderBron, standZetten, standVanBron } from '../zoek-index';
import { agendaExternObject, agendaGoogleObject, bijlageObject, bordObject, cloudObject, driveObject, githubIssueObject, githubRepoObject, mailObject } from './adapters';
import { uiCatalogusVersie, uiZoekObjecten } from './catalogus-ui';
import { ocrBeschikbaarheid, ocrCacheWissen, ocrUitvoeren, tekstUit } from './tekst-extractie';
import { formaatVan } from './adapters';
import { FORMATEN } from '../../shared/zoek-formaten';
import { VOLLEDIG_ID, zoekAnnuleren, zoekFout, zoekKlaar, zoekMelden, zoekOphalen, zoekOpruimen, zoekTelling, zoekUitstellen, type Q, type WachtItem } from './wachtrij';
import { standAfleiden, WACHT_LADE, WACHT_SLEUTEL, type BronStandVolledig, type KoppelFeit, type StandRij } from './stand';

// ---------------------------------------------------------------- instellingen (ENV-VARS.md)
const env = (k: string, std: number, min: number, max: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? Math.max(min, Math.min(max, v)) : std; };
export const INSTELLINGEN = Object.freeze({
  /** Tijd per cron-run (ms); daarna stopt de run netjes en pakt de volgende run de rest. */
  runMs: () => env('ZOEK_INDEX_RUN_MS', 120_000, 5_000, 600_000),
  /** Hoogstens zoveel wachtrij-items per run. */
  items: () => env('ZOEK_INDEX_ITEMS', 60, 1, 500),
  /** Rijen per scanstap (één stap = één wachtrij-item; meer rijen → de stap plant zichzelf opnieuw). */
  scanRijen: () => env('ZOEK_INDEX_SCAN_RIJEN', 400, 20, 5000),
  /** Afstemming op verdwenen rijen, minuten. */
  volledigMin: () => env('ZOEK_INDEX_VOLLEDIG_MIN', 15, 1, 1440),
  /** GitHub opnieuw lezen, minuten (geen wijzigingsfeed). */
  githubMin: () => env('ZOEK_INDEX_GITHUB_MIN', 30, 5, 1440),
  /** Grootste bestand/bijlage waarvan de inhoud gelezen wordt, MiB. */
  inhoudMaxMb: () => env('ZOEK_INDEX_INHOUD_MAX_MB', 25, 1, 200),
  /** Hoe lang een item wacht als de sleutelkluis dicht is, minuten. */
  sleutelWachtMin: () => env('ZOEK_INDEX_SLEUTEL_WACHT_MIN', 10, 1, 720),
});

type Rij = Record<string, unknown>;
const sys: Q = (sql, p = []) => getPool('systeem').query(sql, p) as any;
/** Welke bronnen Z2 indexeert; 'ui' dekt ook pagina/instelling/hulp (één catalogus, vier bronnamen). */
export const INDEX_BRONNEN: readonly ZoekBron[] = ['ui', 'mail', 'bijlage', 'cloud', 'drive', 'agenda', 'bord', 'github'];
export const UI_BRONNEN: readonly ZoekBron[] = ['ui', 'pagina', 'instelling', 'hulp'];
const RECORD_TABEL: Partial<Record<ZoekBron, string>> = { mail: 'mail_items_v1', cloud: 'cloud_items_v1', drive: 'google_suite_drive_projection_v1', agenda: 'google_suite_calendar_events_v1' };
const fetchTimed = async (url: string, init: RequestInit = {}, ms = 20000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); } };
const maxInhoud = () => INSTELLINGEN.inhoudMaxMb() * 1024 * 1024;
/** Leest Z3 dit formaat (shared/zoek-formaten.ts)? Onbekend → nee: geen download voor niets. */
const indexeerbaar = (mime: string, naam: string) => { const f = formaatVan(mime, naam); return !!f && f !== 'overig' && FORMATEN.some((x) => x.id === f && x.methode !== 'geen'); };
const tijd = (r: Rij, ...k: string[]) => { for (const x of k) { const v = Number(r[x]) || Date.parse(String(r[x] || '')); if (v) return v; } return 0; };
const dienstVan = (bron: ZoekBron): DeelbareDienst | null => DIENST_VAN_BRON[bron] as DeelbareDienst | null;
const ladeSleutel = (l: Lade) => `${l.userId}:${l.ruimte}`;

// ---------------------------------------------------------------- stand (Z2-kolommen uit 0101 naast de kernkolommen uit 0100)
type Z2Stand = { waterlijn: number; waterlijnId: string; cursor: Record<string, unknown>; volledigOp: number; wachtReden: string };
async function z2Stand(lade: Lade, bron: ZoekBron): Promise<Z2Stand> {
  const r = (await sys(`SELECT extract(epoch from waterlijn)*1000 AS w, waterlijn_id, cursor, extract(epoch from volledig_op)*1000 AS v, wacht_reden
      FROM app.zoek_bron_stand WHERE user_id=$1 AND ruimte=$2 AND bron=$3`, [lade.userId, lade.ruimte, bron])).rows[0];
  return { waterlijn: Number(r?.w) || 0, waterlijnId: String(r?.waterlijn_id || ''), cursor: (r?.cursor && typeof r.cursor === 'object' ? r.cursor : {}) as Record<string, unknown>, volledigOp: Number(r?.v) || 0, wachtReden: String(r?.wacht_reden || '') };
}
async function z2StandZetten(lade: Lade, bron: ZoekBron, patch: Partial<Z2Stand>) {
  await sys(`INSERT INTO app.zoek_bron_stand (user_id, ruimte, bron, bijgewerkt_op) VALUES ($1,$2,$3, now()) ON CONFLICT (user_id, ruimte, bron) DO NOTHING`, [lade.userId, lade.ruimte, bron]);
  await sys(`UPDATE app.zoek_bron_stand SET
      waterlijn = CASE WHEN $4::double precision IS NULL THEN waterlijn ELSE to_timestamp($4/1000.0) END,
      waterlijn_id = COALESCE($5, waterlijn_id), cursor = COALESCE($6::jsonb, cursor),
      volledig_op = CASE WHEN $7::double precision IS NULL THEN volledig_op ELSE to_timestamp($7/1000.0) END,
      wacht_reden = COALESCE($8, wacht_reden), bijgewerkt_op = now()
    WHERE user_id=$1 AND ruimte=$2 AND bron=$3`,
    [lade.userId, lade.ruimte, bron, patch.waterlijn ?? null, patch.waterlijnId ?? null, patch.cursor ? JSON.stringify(patch.cursor) : null, patch.volledigOp ?? null, patch.wachtReden ?? null]);
}
async function kernStand(lade: Lade, bron: ZoekBron): Promise<StandRij> {
  const k = await standVanBron(lade, bron);
  const z = await z2Stand(lade, bron);
  return { stand: k.stand, voortgang: k.voortgang, aantal: k.aantal, laatsteOk: k.laatsteOk, laatstePoging: k.laatstePoging, fout: k.fout, versie: k.versie, wachtReden: z.wachtReden, volledigOp: z.volledigOp };
}
/** Id's die de index al heeft voor deze lade+bron (alleen id's: geen inhoud over de lijn; via de kern, onder RLS). */
const bekendeIds = async (lade: Lade, bron: ZoekBron): Promise<Set<string>> => new Set((await idsVanBron(lade, bron)).map((r) => r.id));
const INHOUD_BRONNEN: ReadonlySet<ZoekBron> = new Set<ZoekBron>(['bijlage', 'cloud', 'drive']);
/** OCR-tekst van verdwenen documenten wissen (Z3, 0102: per gebruiker/ruimte/sha256). `versie` begint met de sha256 van de bytes. */
async function ocrWissenVoor(lade: Lade, bron: ZoekBron, rijen: Array<{ id: string; versie: string }>): Promise<void> {
  if (!INHOUD_BRONNEN.has(bron)) return;
  for (const sha of new Set(rijen.map((r) => (r.versie.match(/^([a-f0-9]{64})/) || [])[1]).filter(Boolean) as string[])) await ocrCacheWissen(lade, sha).catch(() => undefined);
}
/** Een hoofd-id en al zijn delen («id:pad») verwijderen, in één bron (plus hun OCR-cache). */
async function wisMetDelen(lade: Lade, bron: ZoekBron, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const rijen = await idsVanBron(lade, bron), alle = new Set(rijen.map((r) => r.id));
  const weg = new Set<string>();
  for (const id of ids) { weg.add(id); for (const k of alle) if (k.startsWith(`${id}:`)) weg.add(k); }
  const lijst = [...weg].filter((k) => alle.has(k));
  await ocrWissenVoor(lade, bron, rijen.filter((r) => weg.has(r.id)));
  return verwijder(lade, bron, lijst);
}

// ---------------------------------------------------------------- koppelingen (live)
export async function koppelFeit(bron: ZoekBron, lade: Lade): Promise<KoppelFeit> {
  try {
    if (UI_BRONNEN.includes(bron) || bron === 'bord') return { verbonden: true };   // eigen opslag van Mijn Ruimte
    if (bron === 'mail' || bron === 'bijlage') {
      const snap: any = await metMailLade(lade, 'mail', () => googleSuiteMailProviderSnapshot(lade.userId));
      const google = (snap?.accounts || []).filter((a: any) => a?.status === 'connected').length;
      const imap = (await sys(`SELECT count(*)::int AS n FROM app.mail_imap_koppeling WHERE user_id = $1 AND COALESCE(ruimte,'prive') = $2 AND actief`, [lade.userId, lade.ruimte]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n || 0;
      if (bron === 'bijlage') return { verbonden: google > 0, ...(google ? {} : imap ? { opmerking: 'IMAP_BIJLAGEN_NIET_GEINDEXEERD' } : {}) };
      return { verbonden: google + imap > 0, ...(imap && !google ? { opmerking: 'IMAP_NIET_OPGESLAGEN' } : {}) };
    }
    if (bron === 'drive') {
      const providers: any[] = await metCloudLade(lade, 'cloud', () => googleSuiteDriveProviderSnapshot(lade.userId)) as any;
      const g = providers.find((p) => p?.id === 'google');
      return { verbonden: (g?.accounts || []).some((a: any) => a?.status === 'connected') };
    }
    if (bron === 'cloud') return { verbonden: true };
    if (bron === 'agenda') {
      const st = (await sys(`SELECT data FROM app.records WHERE tbl='google_suite_calendar_sync_state_v1' AND owner_id=$1 AND data->>'service'='calendar' LIMIT 20`, [lade.userId])).rows.map((r) => r.data as Rij).filter((r) => hoortBij(r as any, lade));
      const ext = (await sys(`SELECT count(*)::int AS n FROM app.agenda_abonnement WHERE user_id = $1 AND COALESCE(ruimte,'prive') = $2 AND actief`, [lade.userId, lade.ruimte]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n || 0;
      const syncFout = String(st.find((r) => r.errorCode)?.errorCode || '');
      return { verbonden: st.length > 0 || ext > 0, ...(syncFout ? { opmerking: `GOOGLE_AGENDA_${syncFout}`.slice(0, 120) } : {}) };
    }
    if (bron === 'github') {
      const st: any = await ghStatus({ userId: lade.userId, ruimte: lade.ruimte });
      if (!st.ok) return { verbonden: false, fout: st.error };
      return { verbonden: Boolean(st.data?.connected) };
    }
  } catch (e) { return { verbonden: false, fout: (e instanceof Error ? e.message : 'KOPPELING_ONLEESBAAR').slice(0, 120) }; }
  return { verbonden: false };
}

// ---------------------------------------------------------------- laden per mens (expliciet, nooit via tabContext)
export type LadeMetBronnen = { lade: Lade; bronnen: ZoekBron[] };
/** Welke laden en bronnen voor deze mens geïndexeerd horen te worden. */
export async function ladenVan(userId: string): Promise<LadeMetBronnen[]> {
  const uit: LadeMetBronnen[] = [{ lade: { userId, ruimte: 'prive' }, bronnen: [...INDEX_BRONNEN] }];
  const rechten = await technischeRechten(userId);
  if (!rechten.ok) return uit;
  const tech: ZoekBron[] = ['ui'];
  for (const bron of INDEX_BRONNEN) {
    const dienst = dienstVan(bron); if (!dienst) continue;
    if ((await standVan(userId, dienst)) === 'eigen') tech.push(bron);
  }
  uit.push({ lade: { userId, ruimte: 'technisch' }, bronnen: tech });
  return uit;
}

// ---------------------------------------------------------------- scanstappen (incrementeel)
type StapUitkomst = { klaar: boolean; verwerkt: number; gemeld: number };

async function stapUi(lade: Lade): Promise<StapUitkomst> {
  const heeftProfiel = lade.ruimte === 'technisch' ? true : (await technischeRechten(lade.userId)).ok;
  const versie = `${uiCatalogusVersie()}:${lade.ruimte === 'technisch' ? 'technisch' : heeftProfiel ? 'profiel' : 'iedereen'}`;
  const huidig = await standVanBron(lade, 'ui');
  if (huidig.versie === versie && huidig.aantal > 0) { await standZetten(lade, 'ui', { stand: 'klaar', voortgang: 100, laatsteOk: Date.now(), laatstePoging: Date.now(), fout: '' }); return { klaar: true, verwerkt: 0, gemeld: 0 }; }
  const objecten = uiZoekObjecten(lade, { heeftProfiel });
  const r = await indexeer(lade, objecten);
  const nieuw = new Map<ZoekBron, Set<string>>();
  for (const o of objecten) { if (!nieuw.has(o.bron)) nieuw.set(o.bron, new Set()); nieuw.get(o.bron)!.add(o.id); }
  for (const bron of UI_BRONNEN) {
    const oud = await bekendeIds(lade, bron), weg = [...oud].filter((id) => !nieuw.get(bron)?.has(id));
    if (weg.length) await verwijder(lade, bron, weg);
    await standZetten(lade, bron, { stand: 'klaar', voortgang: 100, laatsteOk: Date.now(), laatstePoging: Date.now(), fout: '', versie });
  }
  return { klaar: true, verwerkt: r.toegevoegd + r.bijgewerkt, gemeld: 0 };
}

/** mail / cloud / drive / agenda(google): app.records met waterlijn op (updated_at, id). */
async function stapRecords(lade: Lade, bron: ZoekBron): Promise<StapUitkomst> {
  const tabel = RECORD_TABEL[bron]!;
  const z = await z2Stand(lade, bron);
  const limiet = INSTELLINGEN.scanRijen();
  const { rows } = await sys(`SELECT id, data, extract(epoch from updated_at)*1000 AS t FROM app.records
      WHERE tbl=$1 AND owner_id=$2 AND (updated_at, id) > (to_timestamp($3/1000.0), $4) ORDER BY updated_at, id LIMIT $5`,
    [tabel, lade.userId, z.waterlijn, z.waterlijnId, limiet]);
  const objecten: ZoekObject[] = []; const meldingen: Parameters<typeof zoekMelden>[1] = []; const weg: string[] = [];
  for (const r of rows) {
    const d: Rij & { id: string } = { ...(r.data as Rij), id: String(r.id) };
    if (!hoortBij(d as any, lade)) continue;   // rij van de andere lade van dezelfde mens: niet van ons
    if (bron === 'mail') {
      objecten.push(mailObject(lade, d));
      if (d.hasAttachments && d.source === 'provider' && d.providerMessageId) meldingen.push({ userId: lade.userId, ruimte: lade.ruimte, bron: 'bijlage', bronId: d.id, payload: { mailAccountId: String(d.mailAccountId || ''), versie: tijd(d, 'updatedAt', 'receivedAt') } });
    } else if (bron === 'cloud') {
      objecten.push(cloudObject(lade, d));
      const naam = String(d.originalName || d.title || ''), mime = String(d.mimeType || '');
      if (d.storagePath && Number(d.sizeBytes || 0) <= maxInhoud() && indexeerbaar(mime, naam)) meldingen.push({ userId: lade.userId, ruimte: lade.ruimte, bron: 'cloud', bronId: d.id, payload: { inhoud: true } });
    } else if (bron === 'drive') {
      if (d.trashed) { weg.push(d.id); continue; }
      objecten.push(driveObject(lade, d));
      const naam = String(d.name || ''), mime = String(d.mimeType || ''), size = Number(d.size || 0);
      const googleDoc = /^application\/vnd\.google-apps\.(document|spreadsheet|presentation)$/.test(mime);
      if ((googleDoc || (size <= maxInhoud() && indexeerbaar(mime, naam))) && d.principalId && d.providerFileId) meldingen.push({ userId: lade.userId, ruimte: lade.ruimte, bron: 'drive', bronId: d.id, payload: { inhoud: true } });
    } else if (bron === 'agenda') objecten.push(agendaGoogleObject(lade, d));
  }
  if (weg.length) await wisMetDelen(lade, bron, weg);
  if (objecten.length) await indexeer(lade, objecten);
  const gemeld = meldingen.length ? await zoekMelden(sys, meldingen) : 0;
  const laatste = rows[rows.length - 1];
  if (laatste) await z2StandZetten(lade, bron, { waterlijn: Number(laatste.t), waterlijnId: String(laatste.id) });
  const klaar = rows.length < limiet;
  if (klaar && bron === 'agenda') await stapAgendaExtern(lade);
  if (klaar) await afstemmen(lade, bron, z);
  // Voortgang: hoeveel van alle rijen van deze tabel ligt al onder de waterlijn.
  const totaal = Number((await sys(`SELECT count(*)::int AS n FROM app.records WHERE tbl=$1 AND owner_id=$2`, [tabel, lade.userId])).rows[0]?.n || 0);
  const onder = klaar ? totaal : Number((await sys(`SELECT count(*)::int AS n FROM app.records WHERE tbl=$1 AND owner_id=$2 AND (updated_at, id) <= (to_timestamp($3/1000.0), $4)`, [tabel, lade.userId, Number(laatste?.t) || z.waterlijn, String(laatste?.id || z.waterlijnId)])).rows[0]?.n || 0);
  await standZetten(lade, bron, { voortgang: totaal ? Math.round((100 * onder) / totaal) : 100, laatstePoging: Date.now(), ...(klaar ? { stand: gemeld ? 'indexeert' : 'klaar', laatsteOk: Date.now(), fout: '' } : { stand: 'indexeert' }) });
  return { klaar, verwerkt: objecten.length, gemeld };
}

/** ICS/CalDAV (app.agenda_externe_gebeurtenis, 0076): eigen tabel, waterlijn op gezien_op. */
async function stapAgendaExtern(lade: Lade): Promise<void> {
  const z = await z2Stand(lade, 'agenda');
  const vanaf = Number(z.cursor.externWaterlijn) || 0;
  const { rows } = await sys(`SELECT * FROM app.agenda_externe_gebeurtenis WHERE user_id = $1 AND COALESCE(ruimte,'prive') = $2 AND gezien_op > to_timestamp($3/1000.0) ORDER BY gezien_op LIMIT 5000`, [lade.userId, lade.ruimte, vanaf]);
  if (!rows.length) return;
  await indexeer(lade, rows.map((r) => agendaExternObject(lade, r)));
  const max = Math.max(...rows.map((r) => Number(new Date(r.gezien_op).getTime()) || 0));
  await z2StandZetten(lade, 'agenda', { cursor: { ...z.cursor, externWaterlijn: max } });
}

/** Bord: app.mcp_console_items (taken en notities), waterlijn op updated_at. */
async function stapBord(lade: Lade): Promise<StapUitkomst> {
  const z = await z2Stand(lade, 'bord');
  const limiet = INSTELLINGEN.scanRijen();
  const { rows } = await sys(`SELECT * FROM app.mcp_console_items WHERE user_id = $1 AND COALESCE(ruimte,'prive') = $2 AND (updated_at, id::text) > (to_timestamp($3/1000.0), $4) ORDER BY updated_at, id LIMIT $5`,
    [lade.userId, lade.ruimte, z.waterlijn, z.waterlijnId, limiet]);
  if (rows.length) await indexeer(lade, rows.map((r) => bordObject(lade, r)));
  const laatste = rows[rows.length - 1];
  if (laatste) await z2StandZetten(lade, 'bord', { waterlijn: new Date(laatste.updated_at).getTime(), waterlijnId: String(laatste.id) });
  const klaar = rows.length < limiet;
  if (klaar) await afstemmen(lade, 'bord', z);
  await standZetten(lade, 'bord', { voortgang: klaar ? 100 : 50, laatstePoging: Date.now(), ...(klaar ? { stand: 'klaar', laatsteOk: Date.now(), fout: '' } : { stand: 'indexeert' }) });
  return { klaar, verwerkt: rows.length, gemeld: 0 };
}

/** GitHub: geen wijzigingsfeed → periodiek volledig lezen; de kern slaat ongewijzigde objecten over (versie). */
async function stapGithub(lade: Lade): Promise<StapUitkomst> {
  const z = await z2Stand(lade, 'github');
  if (z.volledigOp && Date.now() - z.volledigOp < INSTELLINGEN.githubMin() * 60_000) return { klaar: true, verwerkt: 0, gemeld: 0 };
  const wie = { userId: lade.userId, ruimte: lade.ruimte };
  const repos: any[] = [];
  for (let page = 1; page <= 5; page++) { const r: any = await ghRepos(wie, { page }); if (!r.ok) throw new Error(r.error); repos.push(...r.data.repos); if (!r.data.hasMore) break; }
  const objecten: ZoekObject[] = [];
  for (const repo of repos.slice(0, 60)) {
    const rm: any = await ghReadme(wie, repo.fullName).catch(() => ({ ok: false }));
    objecten.push(githubRepoObject(lade, repo, rm.ok ? String(rm.data?.text || '') : ''));
    for (const kind of ['issue', 'pr'] as const) {
      const is: any = await ghIssues(wie, repo.fullName, { state: 'all', kind }).catch(() => ({ ok: false }));
      if (is.ok) for (const i of is.data.items.slice(0, 200)) objecten.push(githubIssueObject(lade, repo.fullName, i));
    }
  }
  const r = await indexeer(lade, objecten);
  const nieuw = new Set(objecten.map((o) => o.id)), oud = await bekendeIds(lade, 'github');
  const weg = [...oud].filter((id) => !nieuw.has(id)); if (weg.length) await verwijder(lade, 'github', weg);
  await z2StandZetten(lade, 'github', { volledigOp: Date.now() });
  await standZetten(lade, 'github', { stand: 'klaar', voortgang: 100, laatsteOk: Date.now(), laatstePoging: Date.now(), fout: '' });
  return { klaar: true, verwerkt: r.toegevoegd + r.bijgewerkt, gemeld: 0 };
}

/** Afstemming op verdwenen rijen (alleen id's). Hoogstens eens per ZOEK_INDEX_VOLLEDIG_MIN. */
async function afstemmen(lade: Lade, bron: ZoekBron, z: Z2Stand): Promise<number> {
  if (z.volledigOp && Date.now() - z.volledigOp < INSTELLINGEN.volledigMin() * 60_000) return 0;
  let bronIds = new Set<string>();
  if (RECORD_TABEL[bron]) {
    const { rows } = await sys(`SELECT id, data->>'ruimte' AS ruimte, data->>'trashed' AS trashed FROM app.records WHERE tbl=$1 AND owner_id=$2`, [RECORD_TABEL[bron], lade.userId]);
    bronIds = new Set(rows.filter((r) => hoortBij({ ownerUserId: lade.userId, ruimte: r.ruimte }, lade) && r.trashed !== 'true').map((r) => (bron === 'agenda' ? `g:${r.id}` : String(r.id))));
    if (bron === 'agenda') {
      const ext = await sys(`SELECT abonnement_id, agenda_url, uid FROM app.agenda_externe_gebeurtenis WHERE user_id = $1 AND COALESCE(ruimte,'prive') = $2`, [lade.userId, lade.ruimte]);
      for (const r of ext.rows) bronIds.add(agendaExternObject(lade, r).id);
    }
  } else if (bron === 'bord') {
    const { rows } = await sys(`SELECT id::text AS id FROM app.mcp_console_items WHERE user_id = $1 AND COALESCE(ruimte,'prive') = $2`, [lade.userId, lade.ruimte]);
    bronIds = new Set(rows.map((r) => String(r.id)));
  } else return 0;
  const inIndex = await idsVanBron(lade, bron);
  const hoofd = (id: string) => (bron === 'cloud' || bron === 'drive' ? id.split(':')[0] : id);
  const wegRijen = inIndex.filter((r) => !bronIds.has(hoofd(r.id)));
  await ocrWissenVoor(lade, bron, wegRijen);
  let n = wegRijen.length ? await verwijder(lade, bron, wegRijen.map((r) => r.id)) : 0;
  if (bron === 'mail') {
    const wegB = (await idsVanBron(lade, 'bijlage')).filter((r) => !bronIds.has(r.id.split(':')[0]));
    await ocrWissenVoor(lade, 'bijlage', wegB);
    if (wegB.length) n += await verwijder(lade, 'bijlage', wegB.map((r) => r.id));
  }
  await z2StandZetten(lade, bron, { volledigOp: Date.now() });
  return n;
}

// ---------------------------------------------------------------- zwaar werk per item (bijlagen, bestandsinhoud)
type InhoudUit = { objecten: ZoekObject[]; ocrNodig: boolean };
/**
 * Bytes → objecten (hoofdobject + één object per bestand in een archief/e-mail), via Z3 (backend/zoek/tekst-extractie.ts).
 * Eerste pas (`ocr` false): tekstlaag + OCR-PLAN, nooit OCR zelf; is OCR nodig én beschikbaar, dan meldt `ocrNodig` dat en plant de
 * aanroeper een tweede wachtrij-item. Tweede pas (`ocr` true): OCR met cache per (gebruiker, ruimte, sha256, pagina).
 */
async function inhoudObjecten(lade: Lade, basis: ZoekObject, bytes: Uint8Array, mime: string, naam: string, deel: (pad: string, tekst: string, sha: string, ocr: boolean) => ZoekObject, ocr = false): Promise<InhoudUit> {
  const invoer = { bytes, mime, naam, sleutel: lade, archief: {} };
  const r = await tekstUit({ ...invoer, ocr: ocr ? 'direct' : 'plan' });
  const nodig = (p?: { nodig: boolean; beschikbaar: boolean }) => Boolean(p?.nodig && p.beschikbaar);
  let ocrNodig = !ocr && nodig(r.ocrPlan);
  const extraHoofd = { formaat: r.formaat, status: r.status, ...(r.fout ? { fout: r.fout } : {}), ocr: r.herkomst === 'ocr' || r.status === 'ocr_nodig', ocrNietBeschikbaar: r.status === 'ocr_niet_beschikbaar', ...(r.paginas?.length ? { paginas: r.paginas.length } : {}) };
  const hoofd: ZoekObject = { ...basis, tekst: [basis.tekst || '', r.tekst || ''].filter(Boolean).join('\n').slice(0, 200000), versie: `${r.sha256}:${r.status}:${(r.tekst || '').length}`, formaat: formaatVan(mime, naam, bytes.subarray(0, 512)), fragmentBron: r.herkomst === 'ocr' ? 'ocr' : basis.fragmentBron, extra: { ...basis.extra, ...extraHoofd } };
  const objecten: ZoekObject[] = [hoofd];
  if (r.onderdelen?.length) {
    hoofd.tekst = [hoofd.tekst, r.onderdelen.map((d) => d.pad).join('\n')].filter(Boolean).join('\n').slice(0, 200000);
    hoofd.extra = { ...hoofd.extra, archief: r.herkomst === 'archief', bestanden: r.onderdelen.length, problemen: (r.problemen || []).map((p) => p.code).slice(0, 10) };
    for (const d of r.onderdelen) {
      let tekst = d.tekst, viaOcr = d.herkomst === 'ocr';
      if (ocr && nodig(d.ocrPlan)) {
        const o = await ocrUitvoeren({ ...invoer, pad: d.pad, paginas: d.ocrPlan?.paginas }).catch(() => null);
        if (o && o.tekst) { tekst = o.tekst; viaOcr = true; }
      } else if (!ocr && nodig(d.ocrPlan)) ocrNodig = true;
      if (tekst) objecten.push(deel(d.pad, tekst, d.sha256, viaOcr));
    }
  }
  return { objecten, ocrNodig };
}

async function mailPrincipal(lade: Lade, mailAccountId: string) {
  const acc = (await sys(`SELECT data FROM app.records WHERE tbl='mail_accounts_v1' AND id=$1`, [mailAccountId])).rows[0]?.data as Rij | undefined;
  const email = String(acc?.email || '').trim().toLowerCase(); if (!email || !hoortBij(acc as any, lade)) throw new Error('GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED');
  return metMailLade(lade, 'mail', async () => {
    const snap: any = await googleSuiteMailProviderSnapshot(lade.userId);
    const a = (snap?.accounts || []).find((x: any) => String(x?.email || '').toLowerCase() === email && x?.status === 'connected');
    if (!a) throw new Error('GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED');
    return googleSuitePrincipalAccessToken(lade.userId, a.principalId, 'mail') as Promise<string>;
  });
}
const gmail = (token: string, pad: string) => fetchTimed(`https://gmail.googleapis.com/gmail/v1/users/me${pad}`, { headers: { Authorization: `Bearer ${token}` } }, 30000);
const gmailFout = (status: number) => (status === 401 ? 'GOOGLE_MAIL_MESSAGES_REAUTH_REQUIRED' : status === 429 ? 'GOOGLE_MAIL_MESSAGES_RATE_LIMITED' : status === 404 ? 'NOT_FOUND' : status === 403 ? 'GOOGLE_MAIL_MESSAGES_FORBIDDEN' : 'GOOGLE_MAIL_MESSAGES_PROVIDER_UNAVAILABLE');
const recordRij = async (tabel: string, id: string): Promise<Rij | null> => { const r = (await sys(`SELECT data FROM app.records WHERE tbl=$1 AND id=$2`, [tabel, id])).rows[0]; return r ? { ...(r.data as Rij), id } : null; };

async function itemVerwerken(lade: Lade, item: WachtItem): Promise<number> {
  const { bron, bronId } = item;
  if (item.actie === 'verwijderen') {
    let n = await wisMetDelen(lade, bron, [bronId]);
    if (bron === 'mail') n += await wisMetDelen(lade, 'bijlage', [bronId]);
    return n;
  }
  if (bron === 'bijlage') {
    const r = await recordRij('mail_items_v1', bronId);
    if (!r || !hoortBij(r as any, lade)) return wisMetDelen(lade, 'bijlage', [bronId]);
    const token = await mailPrincipal(lade, String(r.mailAccountId || ''));
    const pmid = encodeURIComponent(String(r.providerMessageId || ''));
    const msg = await gmail(token, `/messages/${pmid}?format=full`); if (!msg.ok) throw new Error(gmailFout(msg.status));
    const norm = normalizeGmailMessage(await msg.json() as GmailMessage);
    const objecten: ZoekObject[] = []; let ocrNodig = false;
    for (const b of norm.attachments.slice(0, 20)) {
      if (!b.providerAttachmentId || b.sizeBytes > maxInhoud() || !indexeerbaar(b.contentType, b.filename)) continue;
      const res = await gmail(token, `/messages/${pmid}/attachments/${encodeURIComponent(b.providerAttachmentId)}`); if (!res.ok) throw new Error(gmailFout(res.status));
      const bytes = new Uint8Array(Buffer.from(String(((await res.json()) as any)?.data || ''), 'base64url'));
      if (!bytes.length || bytes.length > maxInhoud()) continue;
      const basis = bijlageObject(lade, r, b, { pad: '', tekst: '', sha256: '' });
      const uit = await inhoudObjecten(lade, basis, bytes, b.contentType, b.filename, (pad, tekst, sha, ocr) => bijlageObject(lade, r, b, { pad, tekst, sha256: sha, ocr }), Boolean(item.payload.ocr));
      objecten.push(...uit.objecten); ocrNodig ||= uit.ocrNodig;
    }
    const nieuw = new Set(objecten.map((o) => o.id)), oud = [...await bekendeIds(lade, 'bijlage')].filter((id) => id === bronId || id.startsWith(`${bronId}:`));
    const weg = oud.filter((id) => !nieuw.has(id)); if (weg.length) await verwijder(lade, 'bijlage', weg);
    if (objecten.length) await indexeer(lade, objecten);
    if (ocrNodig) await zoekMelden(sys, [{ userId: lade.userId, ruimte: lade.ruimte, bron: 'bijlage', bronId, payload: { ...item.payload, ocr: true }, vertragingMs: 1000 }]);
    return objecten.length;
  }
  if (bron === 'cloud') {
    const r = await recordRij('cloud_items_v1', bronId);
    if (!r || !hoortBij(r as any, lade)) return wisMetDelen(lade, 'cloud', [bronId]);
    let objecten = [cloudObject(lade, r)]; let ocrNodig = false;
    const pad = String(r.storagePath || ''), mime = String(r.mimeType || ''), naam = String(r.originalName || r.title || '');
    if (item.payload.inhoud && pad && Number(r.sizeBytes || 0) <= maxInhoud() && indexeerbaar(mime, naam)) {
      const { storage } = await import('../../server/platform');
      const [e] = await storage.read([pad], { eigenaar: lade.userId });
      if (e?.content) {
        const bytes = new Uint8Array(['txt', 'md', 'csv', 'json', 'html'].includes(formaatVan(mime, naam)) && !/^[A-Za-z0-9+/]*={0,2}$/.test(e.content.slice(0, 200)) ? Buffer.from(e.content, 'utf8') : Buffer.from(e.content, 'base64'));
        if (bytes.length <= maxInhoud()) { const uit = await inhoudObjecten(lade, objecten[0], bytes, mime, naam, (p, t, sha, ocr) => cloudObject(lade, r, { pad: p, tekst: t, sha256: sha, ocr }), Boolean(item.payload.ocr)); objecten = uit.objecten; ocrNodig = uit.ocrNodig; }
      }
    }
    const nieuw = new Set(objecten.map((o) => o.id)), oud = [...await bekendeIds(lade, 'cloud')].filter((id) => id.startsWith(`${bronId}:`));
    const weg = oud.filter((id) => !nieuw.has(id)); if (weg.length) await verwijder(lade, 'cloud', weg);
    await indexeer(lade, objecten);
    if (ocrNodig) await zoekMelden(sys, [{ userId: lade.userId, ruimte: lade.ruimte, bron: 'cloud', bronId, payload: { inhoud: true, ocr: true }, vertragingMs: 1000 }]);
    return objecten.length;
  }
  if (bron === 'drive') {
    const r = await recordRij('google_suite_drive_projection_v1', bronId);
    if (!r || !hoortBij(r as any, lade) || r.trashed) return wisMetDelen(lade, 'drive', [bronId]);
    let objecten = [driveObject(lade, r)]; let ocrNodig = false;
    const mime = String(r.mimeType || ''), naam = String(r.name || ''), size = Number(r.size || 0);
    const googleDoc = /^application\/vnd\.google-apps\.(document|spreadsheet|presentation)$/.test(mime);
    if (item.payload.inhoud && (googleDoc || (size <= maxInhoud() && indexeerbaar(mime, naam))) && r.principalId && r.providerFileId) {
      const token = await metCloudLade(lade, 'cloud', () => googleSuitePrincipalAccessToken(lade.userId, String(r.principalId), 'drive') as Promise<string>);
      const id = encodeURIComponent(String(r.providerFileId));
      // Zelfde twee Drive-aanroepen als backend/google-suite-browser.ts (export voor Google-documenten, anders alt=media).
      const exportMime = mime === 'application/vnd.google-apps.spreadsheet' ? 'text/csv' : 'text/plain';
      const url = googleDoc ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(exportMime)}` : `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;
      const res = await fetchTimed(url, { headers: { Authorization: `Bearer ${token}` } }, 30000);
      if (res.status === 401) throw new Error('CLOUD_GOOGLE_REAUTH_REQUIRED');
      if (res.status === 429) throw new Error('CLOUD_GOOGLE_RATE_LIMITED');
      if (!res.ok) throw new Error('CLOUD_GOOGLE_FILE_READ_FAILED');
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length && bytes.length <= maxInhoud()) { const uit = await inhoudObjecten(lade, objecten[0], bytes, googleDoc ? exportMime : mime, googleDoc ? `${naam}.txt` : naam, (p, t, sha, ocr) => driveObject(lade, r, { pad: p, tekst: t, sha256: sha, ocr }), Boolean(item.payload.ocr)); objecten = uit.objecten; ocrNodig = uit.ocrNodig; }
    }
    const nieuw = new Set(objecten.map((o) => o.id)), oud = [...await bekendeIds(lade, 'drive')].filter((id) => id.startsWith(`${bronId}:`));
    const weg = oud.filter((id) => !nieuw.has(id)); if (weg.length) await verwijder(lade, 'drive', weg);
    await indexeer(lade, objecten);
    if (ocrNodig) await zoekMelden(sys, [{ userId: lade.userId, ruimte: lade.ruimte, bron: 'drive', bronId, payload: { inhoud: true, ocr: true }, vertragingMs: 1000 }]);
    return objecten.length;
  }
  // mail / agenda / bord: één rij opnieuw lezen (gebeurt normaal via de scanstap; hier voor expliciete meldingen).
  if (bron === 'mail' || bron === 'agenda') {
    const r = await recordRij(RECORD_TABEL[bron]!, bron === 'agenda' ? bronId.replace(/^g:/, '') : bronId);
    if (!r || !hoortBij(r as any, lade)) { await wisMetDelen(lade, bron, [bronId]); if (bron === 'mail') await wisMetDelen(lade, 'bijlage', [bronId]); return 0; }
    await indexeer(lade, [bron === 'mail' ? mailObject(lade, r) : agendaGoogleObject(lade, r)]); return 1;
  }
  if (bron === 'bord') {
    const r = (await sys(`SELECT * FROM app.mcp_console_items WHERE id::text = $1 AND user_id = $2 AND COALESCE(ruimte,'prive') = $3`, [bronId, lade.userId, lade.ruimte])).rows[0];
    if (!r) return wisMetDelen(lade, 'bord', [bronId]);
    await indexeer(lade, [bordObject(lade, r)]); return 1;
  }
  return 0;
}

// ---------------------------------------------------------------- één wachtrij-item
export type ItemUitkomst = 'klaar' | 'opnieuw' | 'fout' | 'vervangen' | 'uitgesteld';
export async function verwerkWachtItem(item: WachtItem): Promise<ItemUitkomst> {
  const lade: Lade = { userId: item.userId, ruimte: item.ruimte };
  const bron = item.bron;
  try {
    // 1. Is de lade nog van deze mens? Technisch: alleen zolang de rechten én de dienststand («eigen») er nog zijn.
    const dienst = dienstVan(bron);
    if (lade.ruimte === 'technisch') {
      const rechten = await technischeRechten(lade.userId);
      if (!rechten.ok) throw new Error('BEVROREN');
      if (dienst && !(await ladeNogGeldig(lade.userId, 'technisch', dienst))) throw new Error('DIENST_UIT');
    }
    // 2. Sleutelkluis: dicht = wachten, geen fout, geen verbruikte poging. (De catalogus van de interface leest geen gegevens.)
    if (!UI_BRONNEN.includes(bron) && (await kluisStand(lade)) === 'gesloten') {
      await z2StandZetten(lade, bron, { wachtReden: WACHT_SLEUTEL });
      await standZetten(lade, bron, { stand: 'gedeeltelijk', laatstePoging: Date.now(), fout: '' });
      return (await zoekUitstellen(sys, item, WACHT_SLEUTEL, INSTELLINGEN.sleutelWachtMin() * 60_000)) === 'vervangen' ? 'vervangen' : 'uitgesteld';
    }
    // 3. Niet (meer) verbonden: de index van deze bron weg, het item klaar.
    if (item.actie !== 'verwijderen') {
      const k = await koppelFeit(bron, lade);
      if (!k.verbonden) {
        if (k.fout) throw new Error(k.fout);
        if (INHOUD_BRONNEN.has(bron) || bron === 'mail') await ocrWissenVoor(lade, bron === 'mail' ? 'bijlage' : bron, await idsVanBron(lade, bron === 'mail' ? 'bijlage' : bron));
        await verwijderBron(lade, bron); if (bron === 'mail') await verwijderBron(lade, 'bijlage');
        await zoekAnnuleren(sys, lade, bron);
        await standZetten(lade, bron, { stand: 'niet_gekoppeld', voortgang: 0, laatstePoging: Date.now(), fout: '' });
        await z2StandZetten(lade, bron, { wachtReden: '', waterlijn: 0, waterlijnId: '', volledigOp: 0 });
        await zoekKlaar(sys, item.id);
        return 'klaar';
      }
    }
    await z2StandZetten(lade, bron, { wachtReden: '' });
    // 4. Het werk.
    if (item.actie === 'volledig') {
      const uit: StapUitkomst = bron === 'ui' ? await stapUi(lade) : bron === 'bord' ? await stapBord(lade) : bron === 'github' ? await stapGithub(lade) : RECORD_TABEL[bron] ? await stapRecords(lade, bron) : { klaar: true, verwerkt: 0, gemeld: 0 };
      await zoekKlaar(sys, item.id);
      if (!uit.klaar) await zoekMelden(sys, [{ userId: lade.userId, ruimte: lade.ruimte, bron, bronId: VOLLEDIG_ID, actie: 'volledig' }]);
      return 'klaar';
    }
    await itemVerwerken(lade, item);
    await zoekKlaar(sys, item.id);
    const telling = await zoekTelling(sys, lade, bron);
    if (telling.wachtend + telling.bezig === 0) await standZetten(lade, bron, { stand: 'klaar', voortgang: 100, laatsteOk: Date.now(), laatstePoging: Date.now(), fout: '' });
    return 'klaar';
  } catch (e) {
    const code = (e instanceof Error ? e.message : 'ZOEK_INDEX_MISLUKT').slice(0, 300);
    const uit = await zoekFout(sys, item, code);
    if (uit === 'fout' || item.actie === 'volledig') await standZetten(lade, bron, { stand: uit === 'fout' ? 'fout' : 'gedeeltelijk', laatstePoging: Date.now(), fout: code }).catch(() => undefined);
    if (code === 'BEVROREN' || code === 'DIENST_UIT') await zoekAnnuleren(sys, lade, code === 'BEVROREN' ? undefined : bron).catch(() => undefined);
    return uit;
  }
}

// ---------------------------------------------------------------- plannen en de ronde
/** Plant voor elke lade van deze mens een scanstap per bron waarvoor er geen poging in de laatste `minuten` was. */
export async function planVoorGebruiker(userId: string, minuten = 4.5, forceer = false): Promise<number> {
  let gepland = 0;
  // Eén query per mens: welke (ruimte, bron) hadden onlangs een poging.
  const recent = new Set(forceer ? [] : (await sys(`SELECT ruimte, bron FROM app.zoek_bron_stand WHERE user_id=$1 AND laatste_poging_op > now() - ($2::double precision * interval '1 minute')`, [userId, minuten])).rows.map((r) => `${r.ruimte}:${r.bron}`));
  for (const { lade, bronnen } of await ladenVan(userId)) {
    for (const bron of bronnen) {
      if (bron === 'bijlage' || recent.has(`${lade.ruimte}:${bron}`)) continue;   // bijlagen volgen uit de mailscan
      gepland += await zoekMelden(sys, [{ userId: lade.userId, ruimte: lade.ruimte, bron, bronId: VOLLEDIG_ID, actie: 'volledig' }]);
    }
  }
  return gepland;
}

export type RondeUitkomst = { gebruikers: number; gepland: number; opgehaald: number; klaar: number; opnieuw: number; fout: number; vervangen: number; uitgesteld: number; opgeruimd: number; duurMs: number; afgebroken: boolean };
/** Eén ronde (cron of achtergrond): plannen, dan items verwerken tot het tijdsbudget op is. */
export async function runZoekIndex(opties: { limiet?: number; budgetMs?: number; gebruikers?: readonly string[] } = {}): Promise<RondeUitkomst> {
  const begin = Date.now(), budget = opties.budgetMs ?? INSTELLINGEN.runMs(), limiet = opties.limiet ?? INSTELLINGEN.items();
  // Alleen goedgekeurde mensen; `gebruikers` beperkt de ronde (tests, «Оновити індекс» voor één mens).
  const gebruikers = (await sys(`SELECT id FROM app.records WHERE tbl='users' AND data->>'status'='approved' AND ($1::text[] IS NULL OR id = ANY($1::text[])) ORDER BY id LIMIT 500`, [opties.gebruikers ? [...opties.gebruikers] : null])).rows.map((r) => String(r.id));
  let gepland = 0;
  for (const userId of gebruikers) { if (Date.now() - begin > budget / 2) break; gepland += await planVoorGebruiker(userId).catch(() => 0); }
  const tel: RondeUitkomst = { gebruikers: gebruikers.length, gepland, opgehaald: 0, klaar: 0, opnieuw: 0, fout: 0, vervangen: 0, uitgesteld: 0, opgeruimd: 0, duurMs: 0, afgebroken: false };
  while (tel.opgehaald < limiet) {
    if (Date.now() - begin > budget) { tel.afgebroken = true; break; }
    const items = await zoekOphalen(sys, Math.min(10, limiet - tel.opgehaald));
    if (!items.length) break;
    tel.opgehaald += items.length;
    for (const it of items) { tel[await verwerkWachtItem(it)] += 1; if (Date.now() - begin > budget) { tel.afgebroken = true; break; } }
    if (tel.afgebroken) break;
  }
  tel.opgeruimd = await zoekOpruimen(sys);
  tel.duurMs = Date.now() - begin;
  return tel;
}

export const zoekIndexCron = async (event: { payload?: { limiet?: number; budgetMs?: number } } = {}): Promise<{ statusCode: number; body: string }> => {
  try {
    const uit = await runZoekIndex({ limiet: Math.min(500, Math.max(1, Number(event?.payload?.limiet) || INSTELLINGEN.items())), budgetMs: Number(event?.payload?.budgetMs) || undefined });
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...uit }) };
  } catch (e) {
    console.error('Zoek index cron failed', { reason: e instanceof Error ? e.message : 'ZOEK_INDEX_CRON_FAILED' });
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: e instanceof Error ? e.message.slice(0, 120) : 'ZOEK_INDEX_CRON_FAILED' }) };
  }
};

// ---------------------------------------------------------------- bevriezen / verwijderen van een technische lade
for (const dienst of ['mail', 'cloud', 'agenda', 'bord', 'github'] as const) {
  registreerLadeUitvoerder({
    dienst, naam: 'zoek-index',
    // Overdragen aan de eigenaar: de index wordt daar opnieuw opgebouwd (zijn cron ziet de rijen); hier alleen wissen.
    overdragen: async ({ lade }) => [{ tabel: 'app.zoek_objecten', rijen: await wisLade(lade, dienst), opmerking: 'index wordt bij de ontvanger opnieuw opgebouwd' }],
    verwijderen: async ({ lade }) => [{ tabel: 'app.zoek_objecten', rijen: await wisLade(lade, dienst) }],
  });
}
async function wisLade(lade: Lade, dienst: DeelbareDienst): Promise<number> {
  if (lade.ruimte !== 'technisch') return 0;
  let n = 0;
  for (const bron of INDEX_BRONNEN) if (dienstVan(bron) === dienst) { n += await verwijderBron(lade, bron); await zoekAnnuleren(sys, lade, bron); }
  return n;
}
bijTechRechtenVerlies((userId) => { void zoekAnnuleren(sys, { userId, ruimte: 'technisch' }).catch(() => undefined); });

// ---------------------------------------------------------------- stand voor het scherm
export type BronStandMetOcr = BronStandVolledig & { ocr?: { beschikbaar: boolean; engine: string; talen: string[]; ontbrekend?: { uk: string; nl: string } } };
export async function bronStanden(userId: string, body: unknown): Promise<BronStandMetOcr[]> {
  const uit: BronStandMetOcr[] = [];
  // OCR-beschikbaarheid van DEZE server (Z3): «OCR недоступний: встановіть…» hoort bij de stand van bijlagen en bestanden.
  const ocr = await ocrBeschikbaarheid().then((b) => ({ beschikbaar: b.beschikbaar, engine: String(b.engine || ''), talen: b.talen, ...(b.ontbrekend ? { ontbrekend: b.ontbrekend } : {}) })).catch(() => ({ beschikbaar: false, engine: '', talen: [] as string[] }));
  for (const bron of INDEX_BRONNEN) {
    const dienst = dienstVan(bron);
    const besluit: LadeBesluit | null = dienst ? await projectieLade(herkomstUitBody(userId, null, body), dienst) : null;
    const lade: Lade = besluit ? (besluit.ok ? besluit.lade : { userId, ruimte: 'prive' }) : { userId, ruimte: 'prive' };
    if (besluit && !besluit.ok) { uit.push(standAfleiden(bron, { verbonden: false, opmerking: besluit.code }, null, { wachtend: 0, bezig: 0, fout: 0, laatsteWachtFout: '', laatsteWachtFoutOp: 0 })); continue; }
    const [k, rij, telling] = await Promise.all([koppelFeit(bron, lade), kernStand(lade, bron), zoekTelling(sys, lade, bron)]);
    uit.push({ ...standAfleiden(bron, k, rij, telling), ...(INHOUD_BRONNEN.has(bron) ? { ocr } : {}) });
  }
  return uit;
}

// ---------------------------------------------------------------- routes
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<{ service: string; user: { id: string; status: string } } | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
const bodyOf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
const authOf = async (authorize: Authorize, ctx: Ctx) => { const a = await authorize(ctx.event, ctx.body); return 'errorCode' in a || a.user.status !== 'approved' ? null : a; };

export const createZoekBronnenRoutes = (authorize: Authorize) => ({
  'POST /api/owner/zoek/bronnen/stand': [async (ctx: Ctx) => {
    const a = await authOf(authorize, ctx); if (!a) return error('OWNER_ZOEK_REQUIRED', 403);
    return json({ bronnen: await bronStanden(a.user.id, ctx.body), afgeleid: 'live_koppeling+wachtrij+bronstand+sleutelkluis' });
  }],
  /** «Оновити індекс»: plant de scanstappen van deze mens opnieuw (alle bronnen of één). Het werk zelf blijft in de rij. */
  'POST /api/owner/zoek/bronnen/vernieuwen': [async (ctx: Ctx) => {
    const a = await authOf(authorize, ctx); if (!a) return error('OWNER_ZOEK_REQUIRED', 403);
    const gevraagd = String(bodyOf(ctx.body).bron || '');
    if (gevraagd && !(INDEX_BRONNEN as readonly string[]).includes(gevraagd)) return error('ZOEK_BRON_ONBEKEND', 400);
    let gepland = 0;
    for (const { lade, bronnen } of await ladenVan(a.user.id)) {
      for (const bron of bronnen) {
        if (bron === 'bijlage' || (gevraagd && bron !== gevraagd)) continue;
        gepland += await zoekMelden(sys, [{ userId: lade.userId, ruimte: lade.ruimte, bron, bronId: VOLLEDIG_ID, actie: 'volledig' }]);
      }
    }
    return json({ ok: true, gepland });
  }],
});

/** Voor tests: de interne stappen. */
export const _intern = { stapUi, stapRecords, stapBord, stapGithub, afstemmen, itemVerwerken, z2Stand, z2StandZetten, bekendeIds, ladeSleutel };
