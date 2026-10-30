// Afstemming vNext (UI-014) — KOPPEL: relaties en kandidaten (lexicaal + graf; semantisch = gepland), conflicten met
// eigenaarsbesluit, releasekoppeling aan de BESTAANDE uitrolgeschiedenis (app.uitrol_runs, read-only — deze routes rollen
// NOOIT iets uit), postflight («uitgerold ≠ bevestigd», dossier §5/§7), statische scan (tabs/vlaggen/routes van de server
// zelf, zonder één netwerk- of productie-aanroep), rapporten en «mogelijkheden». Contract: shared/afstemming-model.ts.
//
// VASTE BESLISSINGEN
//   • GEEN auto-merge: kandidaten blijven kandidaten; bevestigen/afwijzen doet alleen de eigenaar en levert ALTIJD een
//     Besluit-rij + append-only gebeurtenissen op beide kaarten; een verzoek met `alsAgent: true` → AGENT_MAG_NIET (§8 van
//     de acceptatiescenario's: een agent keurt nooit zichzelf);
//   • tellers op de kaart (koppelingen, openConflicten) worden HERBEREKEND uit de bron (nooit ±1 geraden) en raken het
//     veld `versie` van de kaart niet aan: dat veld bewaakt inhoudelijke bewerkingen (409), geen afgeleide cijfers;
//   • records lezen ALTIJD met paginering (db.list limit 1000 + nextToken-lus, plafond 20 000) — de oude 100-afkap is een
//     bekende bug die hier niet terug mag komen; elke rij wordt op ownerUserId gecontroleerd;
//   • gebeurtenissen (afstemming_gebeurtenissen_v1) worden hier alléén TOEGEVOEGD — er bestaat geen update/delete-pad;
//   • de scan is een inventaris van ÉIGEN feiten: public/canonical-service.js (tabs), app.feature_flags (vlaggen) en de
//     route-registraties in backend/*.ts als tekst; bevindingen zijn signalen/concepten, er wordt niets aangemaakt;
//   • postflight zet nooit een kaart op «werkt»: hij telt alleen controleerbaar productiebewijs ná de release en meldt
//     eerlijk wat onbevestigd bleef of regresseerde.
// Foutcodes uit het contract: KAART_ONBEKEND, KOPPEL_ONBEKEND, KOPPEL_ZELF, KOPPEL_BESTAAT, RELEASE_ONBEKEND,
// AGENT_MAG_NIET; aanvullend (additief, zelfde stijl als cloud): REDEN_VEREIST (reden < 5 tekens), SOORT_ONBEKEND,
// KOPPEL_BESLIST (beslist = niet meer te wijzigen/verwijderen), ACTIE_ONGELDIG.
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { db, error, json } from '../server/platform';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import {
  AFSTEMMING_LIMIETEN as LIMIET, KOPPEL_SOORTEN,
  type Actor, type Besluit, type BewijsStuk, type Gebeurtenis, type Kaart, type Koppeling, type KoppelSoort, type ReleaseKoppeling, type ScanBevinding,
} from '../shared/afstemming-model';

// ------------------------------------------------------------------------------------------------ opslagvormen
const KAARTEN = 'afstemming_kaarten_v1';            // eigendom van de kern (A-deel); hier lezen + alleen tellers bijwerken
const GEBEURTENISSEN = 'afstemming_gebeurtenissen_v1'; // append-only
const KOPPELINGEN = 'afstemming_koppelingen_v1';    // van dit bestand
const BESLUITEN = 'afstemming_besluiten_v1';        // van dit bestand
const RELEASE = 'afstemming_release_v1';            // van dit bestand
const BEWIJS = 'afstemming_bewijs_v1';              // eigendom van de kern; hier alleen lezen (postflight/mogelijkheden/rapport)
const LEES_PLAFOND = 20_000;

type MetId<T> = T & { id: string };
type KaartRecord = Omit<Kaart, 'id'> & { ownerUserId?: string; bedoeling?: string; verwachtGedrag?: string };
type KoppelRecord = Omit<Koppeling, 'id'> & { ownerUserId?: string };
type BesluitRecord = Omit<Besluit, 'id'> & { ownerUserId?: string };
type ReleaseRecord = Omit<ReleaseKoppeling, 'id'> & { ownerUserId?: string };
type BewijsRecord = Omit<BewijsStuk, 'id'> & { ownerUserId?: string };
type GebeurtenisRecord = Omit<Gebeurtenis, 'id'> & { ownerUserId?: string };

// ------------------------------------------------------------------------------------------------ kleine hulpjes (puur)
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const nu = (): string => new Date().toISOString();
const fout = (code: string): never => { throw new Error(code); };
const STATUS: Record<string, number> = { KAART_ONBEKEND: 404, KOPPEL_ONBEKEND: 404, RELEASE_ONBEKEND: 404, AGENT_MAG_NIET: 403 };
const BEKEND = new Set(['KAART_ONBEKEND', 'KOPPEL_ONBEKEND', 'KOPPEL_ZELF', 'KOPPEL_BESTAAT', 'KOPPEL_BESLIST', 'RELEASE_ONBEKEND', 'AGENT_MAG_NIET', 'REDEN_VEREIST', 'SOORT_ONBEKEND', 'ACTIE_ONGELDIG']);
const clampZekerheid = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 100) / 100)) : 0; };
/** Symmetrische soorten: A↔B en B↔A zijn dezelfde relatie, dus ook hetzelfde duplicaat. */
const SYMMETRISCH: ReadonlySet<KoppelSoort> = new Set(['duplicates', 'overlaps', 'conflicts_with', 'relates_to']);
const kaartTekst = (k: KaartRecord): string => {
  const t = Array.isArray(k.titel) ? k.titel.join(' ') : '';
  const s = Array.isArray(k.samenvatting) ? k.samenvatting.join(' ') : '';
  return `${t} ${s} ${str(k.bedoeling)} ${str(k.verwachtGedrag)}`.toLowerCase();
};
/** Betekenisvolle woorden (≥4 letters, uk/nl/latijn) voor de lexicale kandidaten. */
const woorden = (tekst: string): Set<string> => {
  const uit = new Set<string>();
  for (const m of tekst.toLowerCase().matchAll(/[\p{L}][\p{L}\p{N}’'-]{3,}/gu)) uit.add(m[0]);
  return uit;
};

// ------------------------------------------------------------------------------------------------ lezen mét paginering
async function alleRecords<T>(collectie: string, filter: Record<string, unknown>): Promise<Array<MetId<T>>> {
  const uit: Array<MetId<T>> = [];
  let token: string | undefined;
  while (uit.length < LEES_PLAFOND) {
    const blad = await db.list<T>(collectie, { filter, limit: 1000, ...(token ? { nextToken: token } : {}) });
    uit.push(...(blad.items as unknown as Array<MetId<T>>));
    if (!blad.nextToken) break;
    token = blad.nextToken;
  }
  return uit;
}
const vanEigenaar = <T extends { ownerUserId?: string }>(rijen: Array<MetId<T>>, userId: string): Array<MetId<T>> => rijen.filter((r) => str(r.ownerUserId) === userId);
const eigenKaarten = async (userId: string) => vanEigenaar(await alleRecords<KaartRecord>(KAARTEN, { ownerUserId: userId }), userId);
const eigenKoppelingen = async (userId: string) => vanEigenaar(await alleRecords<KoppelRecord>(KOPPELINGEN, { ownerUserId: userId }), userId);
const eigenReleaseKoppelingen = async (userId: string) => vanEigenaar(await alleRecords<ReleaseRecord>(RELEASE, { ownerUserId: userId }), userId);
const eigenBewijs = async (userId: string, kaartId?: string) => vanEigenaar(await alleRecords<BewijsRecord>(BEWIJS, kaartId ? { ownerUserId: userId, kaartId } : { ownerUserId: userId }), userId);
async function eenKaart(userId: string, id: unknown): Promise<MetId<KaartRecord>> {
  const schoon = str(id);
  if (!schoon) fout('KAART_ONBEKEND');
  const [r] = await db.get<KaartRecord>(KAARTEN, [schoon]);
  if (!r || str(r.ownerUserId) !== userId) fout('KAART_ONBEKEND');
  return { ...(r as KaartRecord), id: schoon };
}

// ------------------------------------------------------------------------------------------------ gebeurtenissen (append-only) en tellers
async function gebeurtenis(userId: string, kaartId: string, soort: Gebeurtenis['soort'], actor: Actor, payload: Record<string, unknown>, correlatieId?: string): Promise<void> {
  const rij: GebeurtenisRecord = { ownerUserId: userId, kaartId, soort, actor, bron: 'afstemming-koppel', payload, op: nu(), ...(correlatieId ? { correlatieId } : {}) };
  await db.add(GEBEURTENISSEN, [rij as unknown as Record<string, unknown>]);
}
/** Tellers op de kaart HERBEREKENEN uit de koppelingen (voorgesteld + bevestigd tellen mee; conflicts_with → openConflicten). */
async function herberekenTellers(userId: string, kaartIds: string[]): Promise<void> {
  const uniek = [...new Set(kaartIds.filter(Boolean))];
  if (!uniek.length) return;
  const alle = await eigenKoppelingen(userId);
  for (const id of uniek) {
    const [r] = await db.get<KaartRecord>(KAARTEN, [id]);
    if (!r || str(r.ownerUserId) !== userId) continue;
    const mijne = alle.filter((k) => (k.van === id || k.naar === id) && k.stand !== 'afgewezen');
    const record: KaartRecord = {
      ...(r as KaartRecord),
      koppelingen: mijne.length,
      openConflicten: mijne.filter((k) => k.soort === 'conflicts_with').length,
      bijgewerktOp: nu(),
    };
    await db.update(KAARTEN, [{ id, record: record as unknown as Record<string, unknown> }]);
  }
}
const naarBuitenKoppel = (r: MetId<KoppelRecord>): Koppeling => ({ id: r.id, van: str(r.van), naar: str(r.naar), soort: r.soort, reden: str(r.reden), zekerheid: num(r.zekerheid), stand: r.stand, voorgesteldDoor: r.voorgesteldDoor || { soort: 'eigenaar', id: '' }, op: str(r.op), ...(r.besluitOp ? { besluitOp: str(r.besluitOp) } : {}) });
const naarBuitenRelease = (r: MetId<ReleaseRecord>): ReleaseKoppeling => ({ id: r.id, kaartId: str(r.kaartId), releaseVersie: str(r.releaseVersie), ...(r.runId ? { runId: str(r.runId) } : {}), ...(r.commit ? { commit: str(r.commit) } : {}), zekerheid: num(r.zekerheid), stand: r.stand === 'bevestigd' ? 'bevestigd' : 'voorgesteld', preflight: r.preflight || 'onbekend', postflight: r.postflight || 'niet_gecontroleerd', op: str(r.op) });

// ------------------------------------------------------------------------------------------------ uitrolgeschiedenis (read-only)
type UitrolRij = { id: string; versie: string; release: string; wijzigingen: string; bron_commit: string; op: string };
/** Geïnstalleerde releases uit app.uitrol_runs (staat 'klaar'), jongste eerst. Leeg = eerlijk leeg («nog geen releases»). */
async function uitrolReleases(limiet = 120): Promise<UitrolRij[]> {
  try {
    const r = await getPool('systeem').query(
      `SELECT id, versie, release, wijzigingen, bron_commit, COALESCE(geeindigd_op, gestart_op) AS op
         FROM app.uitrol_runs WHERE staat = 'klaar'
        ORDER BY COALESCE(geeindigd_op, gestart_op) DESC, id DESC LIMIT $1`, [limiet]);
    return r.rows.map((x: Record<string, unknown>) => ({ id: str(x.id), versie: str(x.versie) || str(x.release), release: str(x.release), wijzigingen: str(x.wijzigingen), bron_commit: str(x.bron_commit), op: new Date(String(x.op)).toISOString() }));
  } catch { return []; } // tabel afwezig in een kale omgeving → eerlijk leeg, geen verzonnen geschiedenis
}

// ------------------------------------------------------------------------------------------------ statische inventaris (scan, §8)
async function inventarisTabs(): Promise<string[]> {
  try {
    const tekst = await readFile(join(process.cwd(), 'public', 'canonical-service.js'), 'utf8');
    const m = /const tabs=\{(.*?)\};/s.exec(tekst);
    if (!m) return [];
    const uit: string[] = [];
    for (const paar of m[1].matchAll(/([a-z]+):\[([^\]]*)\]/g)) {
      const dienst = paar[1];
      for (const t of paar[2].matchAll(/'([a-z-]+)'/g)) uit.push(`${dienst}/${t[1]}`);
    }
    return uit;
  } catch { return []; }
}
async function inventarisVlaggen(): Promise<string[]> {
  try { return (await getPool('systeem').query('SELECT sleutel FROM app.feature_flags ORDER BY sleutel')).rows.map((r: Record<string, unknown>) => str(r.sleutel)).filter(Boolean); }
  catch { return []; }
}
async function inventarisRoutes(): Promise<string[]> {
  try {
    const map = join(process.cwd(), 'backend');
    const uit = new Set<string>();
    for (const naam of await readdir(map)) {
      if (!naam.endsWith('.ts')) continue;
      const tekst = await readFile(join(map, naam), 'utf8').catch(() => '');
      for (const m of tekst.matchAll(/'POST (\/api\/owner\/[a-z0-9/_:-]+)'/g)) uit.add(m[1]);
    }
    return [...uit].sort();
  } catch { return []; }
}
/** Noemt een kaarttekst deze sleutel? Korte woorden alleen op woordgrens, paden/vlaggen als substring. */
function genoemd(teksten: string[], sleutel: string): boolean {
  const kern = sleutel.includes('/') && !sleutel.startsWith('/') ? sleutel.split('/')[1] : sleutel; // tab 'cloud/files' → 'files'
  const klein = kern.toLowerCase();
  if (klein.length >= 6 || klein.startsWith('/')) return teksten.some((t) => t.includes(klein));
  const grens = new RegExp(`(^|[^\\p{L}\\p{N}])${klein.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u');
  return teksten.some((t) => grens.test(t));
}

// ------------------------------------------------------------------------------------------------ de routes
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
const DIENSTEN = ['api', 'hub', 'admin'] as const;

export function afstemmingKoppelRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  const route = (run: (ctx: Ctx, auth: SessionOk, d: Record<string, unknown>) => Promise<Resp>): RouterMiddleware[] => [(async (raw: unknown) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
    if (auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    try { return await run(ctx, auth, (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>); }
    catch (err) {
      const code = String((err as Error)?.message || 'AFSTEMMING_FOUT').slice(0, 80);
      return error(code, STATUS[code] ?? (BEKEND.has(code) ? 400 : 500));
    }
  }) as unknown as RouterMiddleware];

  return {
    // -------------------------------------------------------------- koppelingen: voorstellen, beslissen, lijst, verwijderen
    'POST /api/owner/afstemming/koppel': route(async (_c, auth, d) => {
      const userId = auth.user.id;
      const actie = str(d.actie);
      const alsAgent = d.alsAgent === true;
      const actor: Actor = alsAgent ? { soort: 'agent', id: str(d.agentId) || 'agent' } : { soort: 'eigenaar', id: userId };
      if (actie === 'stel-voor') {
        const soort = str(d.soort) as KoppelSoort;
        if (!KOPPEL_SOORTEN.includes(soort)) fout('SOORT_ONBEKEND');
        const van = str(d.van), naar = str(d.naar);
        if (van && van === naar) fout('KOPPEL_ZELF');
        const reden = str(d.reden).trim();
        if (reden.length < 5) fout('REDEN_VEREIST');
        const [a, b] = [await eenKaart(userId, van), await eenKaart(userId, naar)];
        const bestaande = await eigenKoppelingen(userId);
        const dubbel = bestaande.some((k) => k.stand !== 'afgewezen' && k.soort === soort && ((k.van === van && k.naar === naar) || (SYMMETRISCH.has(soort) && k.van === naar && k.naar === van)));
        if (dubbel) fout('KOPPEL_BESTAAT');
        const rij: KoppelRecord = { ownerUserId: userId, van, naar, soort, reden: reden.slice(0, 500), zekerheid: clampZekerheid(d.zekerheid), stand: 'voorgesteld', voorgesteldDoor: actor, op: nu() };
        const [id] = await db.add(KOPPELINGEN, [rij as unknown as Record<string, unknown>]);
        if (!id) throw new Error('OPSLAAN_MISLUKT');
        const corr = randomUUID();
        await gebeurtenis(userId, van, 'koppeling', actor, { koppelingId: id, soort, met: b.externId, stand: 'voorgesteld' }, corr);
        await gebeurtenis(userId, naar, 'koppeling', actor, { koppelingId: id, soort, met: a.externId, stand: 'voorgesteld' }, corr);
        await herberekenTellers(userId, [van, naar]);
        return json({ koppeling: naarBuitenKoppel({ ...rij, id }) });
      }
      if (actie === 'bevestig' || actie === 'wijs-af') {
        if (alsAgent) fout('AGENT_MAG_NIET'); // een agent keurt nooit; hij kan alleen voorstellen (§8 scenario's)
        const id = str(d.id);
        const [r] = id ? await db.get<KoppelRecord>(KOPPELINGEN, [id]) : [null];
        if (!r || str(r.ownerUserId) !== userId) fout('KOPPEL_ONBEKEND');
        const rij = r as KoppelRecord;
        const doel = actie === 'bevestig' ? 'bevestigd' : 'afgewezen';
        if (rij.stand === doel) return json({ koppeling: naarBuitenKoppel({ ...rij, id }) }); // idempotent
        if (rij.stand !== 'voorgesteld') fout('KOPPEL_BESLIST');
        const record: KoppelRecord = { ...rij, stand: doel as KoppelRecord['stand'], besluitOp: nu() };
        await db.update(KOPPELINGEN, [{ id, record: record as unknown as Record<string, unknown> }]);
        const besluit: BesluitRecord = { ownerUserId: userId, kaartId: rij.van, ...(rij.soort === 'conflicts_with' ? { conflictMet: rij.naar } : {}), keuze: actie === 'bevestig' ? 'bevestig' : 'afwijzen', reden: str(d.reden).trim().slice(0, 500) || `${rij.soort}: ${doel}`, eigenaar: userId, op: nu() };
        await db.add(BESLUITEN, [besluit as unknown as Record<string, unknown>]);
        const corr = randomUUID();
        await gebeurtenis(userId, rij.van, 'besluit', { soort: 'eigenaar', id: userId }, { koppelingId: id, soort: rij.soort, stand: doel }, corr);
        await gebeurtenis(userId, rij.naar, 'besluit', { soort: 'eigenaar', id: userId }, { koppelingId: id, soort: rij.soort, stand: doel }, corr);
        await herberekenTellers(userId, [rij.van, rij.naar]);
        return json({ koppeling: naarBuitenKoppel({ ...record, id }) });
      }
      if (actie === 'lijst') {
        const kaartId = str(d.kaartId);
        const alle = await eigenKoppelingen(userId);
        const uit = (kaartId ? alle.filter((k) => k.van === kaartId || k.naar === kaartId) : alle).map(naarBuitenKoppel);
        return json({ koppelingen: uit });
      }
      if (actie === 'verwijder') {
        const id = str(d.id);
        const [r] = id ? await db.get<KoppelRecord>(KOPPELINGEN, [id]) : [null];
        if (!r || str(r.ownerUserId) !== userId) fout('KOPPEL_ONBEKEND');
        if ((r as KoppelRecord).stand !== 'voorgesteld') fout('KOPPEL_BESLIST'); // besliste relaties blijven geschiedenis
        await db.delete(KOPPELINGEN, [id]);
        await herberekenTellers(userId, [str((r as KoppelRecord).van), str((r as KoppelRecord).naar)]);
        return json({ ok: true });
      }
      return fout('ACTIE_ONGELDIG') as never;
    }),

    // -------------------------------------------------------------- kandidaten: lexicaal + graf — NIETS wordt opgeslagen
    'POST /api/owner/afstemming/kandidaten': route(async (_c, auth, d) => {
      const userId = auth.user.id;
      const kaartId = str(d.kaartId);
      const kaarten = (await eigenKaarten(userId)).filter((k) => k.gearchiveerd !== true);
      const bestaande = await eigenKoppelingen(userId);
      const alBekend = (a: string, b: string): boolean => bestaande.some((k) => (k.van === a && k.naar === b) || (k.van === b && k.naar === a));
      const perKaart = new Map(kaarten.map((k) => [k.id, woorden(kaartTekst(k))]));
      const vers: Koppeling[] = [];
      const paren: Array<[MetId<KaartRecord>, MetId<KaartRecord>]> = [];
      if (kaartId) { const basis = kaarten.find((k) => k.id === kaartId); if (!basis) fout('KAART_ONBEKEND'); for (const ander of kaarten) if (ander.id !== kaartId) paren.push([basis!, ander]); }
      else for (let i = 0; i < kaarten.length; i++) for (let j = i + 1; j < kaarten.length; j++) paren.push([kaarten[i], kaarten[j]]);
      for (const [a, b] of paren) {
        if (vers.length >= (kaartId ? 20 : 50)) break;
        if (alBekend(a.id, b.id)) continue;
        const wa = perKaart.get(a.id)!, wb = perKaart.get(b.id)!;
        const gemeen = [...wa].filter((w) => wb.has(w));
        if (gemeen.length >= 2) {
          const unie = new Set([...wa, ...wb]).size || 1;
          vers.push({ id: '', van: a.id, naar: b.id, soort: gemeen.length >= 4 ? 'duplicates' : 'overlaps', reden: `спільні слова: ${gemeen.slice(0, 6).join(', ')}`, zekerheid: Math.round((gemeen.length / unie) * 100) / 100, stand: 'voorgesteld', voorgesteldDoor: { soort: 'systeem', id: 'kandidaten-lexicaal' }, op: nu() });
        } else if (a.dienst && a.dienst === b.dienst && a.categorie && a.categorie === b.categorie) {
          vers.push({ id: '', van: a.id, naar: b.id, soort: 'relates_to', reden: `та сама служба (${a.dienst}) і категорія (${a.categorie})`, zekerheid: 0.3, stand: 'voorgesteld', voorgesteldDoor: { soort: 'systeem', id: 'kandidaten-graf' }, op: nu() });
        }
      }
      const bewaard = bestaande.filter((k) => k.stand === 'voorgesteld' && (!kaartId || k.van === kaartId || k.naar === kaartId)).map(naarBuitenKoppel);
      return json({ kandidaten: [...bewaard, ...vers] });
    }),

    // -------------------------------------------------------------- graaf: knopen + randen (bevestigd én voorgesteld, met stand)
    'POST /api/owner/afstemming/graaf': route(async (_c, auth, d) => {
      const userId = auth.user.id;
      const dienst = str(d.dienst);
      const soorten = Array.isArray(d.soorten) ? (d.soorten as unknown[]).map((s) => str(s)).filter((s) => (KOPPEL_SOORTEN as readonly string[]).includes(s)) : [];
      const kaarten = (await eigenKaarten(userId)).filter((k) => k.gearchiveerd !== true && (!dienst || k.dienst === dienst));
      const perId = new Set(kaarten.map((k) => k.id));
      let randen = (await eigenKoppelingen(userId)).filter((k) => k.stand !== 'afgewezen' && perId.has(k.van) && perId.has(k.naar) && (!soorten.length || soorten.includes(k.soort)));
      let knopen = kaarten;
      const basis = str(d.kaartId); // additief: met kaartId + diepte alleen de omgeving van die kaart
      const diepte = Math.min(6, Math.max(1, num(d.diepte) || 6));
      if (basis && perId.has(basis)) {
        const bereikt = new Set<string>([basis]);
        let rand = [basis];
        for (let stap = 0; stap < diepte && rand.length; stap++) {
          const volgende: string[] = [];
          for (const k of randen) {
            if (rand.includes(k.van) && !bereikt.has(k.naar)) { bereikt.add(k.naar); volgende.push(k.naar); }
            if (rand.includes(k.naar) && !bereikt.has(k.van)) { bereikt.add(k.van); volgende.push(k.van); }
          }
          rand = volgende;
        }
        knopen = knopen.filter((k) => bereikt.has(k.id));
        randen = randen.filter((k) => bereikt.has(k.van) && bereikt.has(k.naar));
      }
      knopen = [...knopen].sort((a, b) => str(a.externId).localeCompare(str(b.externId))).slice(0, 400);
      const zichtbaar = new Set(knopen.map((k) => k.id));
      return json({
        knopen: knopen.map((k) => ({ id: k.id, externId: str(k.externId), titel: k.titel, fase: k.levensfase, gezondheid: k.gezondheid, dienst: str(k.dienst) })),
        randen: randen.filter((k) => zichtbaar.has(k.van) && zichtbaar.has(k.naar)).map((k) => ({ van: k.van, naar: k.naar, soort: k.soort, stand: k.stand })),
      });
    }),

    // -------------------------------------------------------------- releases: de ECHTE uitrolgeschiedenis + kaartkoppelingen
    'POST /api/owner/afstemming/releases': route(async (_c, auth, d) => {
      const userId = auth.user.id;
      const vanaf = Math.max(0, num(str(d.token))); // eenvoudige offset-token
      const rijen = await uitrolReleases();
      const blad = rijen.slice(vanaf, vanaf + 30);
      const koppelingen = await eigenReleaseKoppelingen(userId);
      const releases = blad.map((r) => ({
        versie: r.versie, op: r.op, samenvatting: r.wijzigingen.slice(0, 400), commit: r.bron_commit.slice(0, 12), runId: r.id,
        kaarten: koppelingen.filter((k) => k.releaseVersie === r.versie).map(naarBuitenRelease),
        ongeregistreerd: [] as string[], // diff-analyse per release is gepland — eerlijk leeg, nooit verzonnen
      }));
      return json({ releases, volgende: vanaf + 30 < rijen.length ? String(vanaf + 30) : null });
    }),

    // -------------------------------------------------------------- release-koppel: kaart ↔ release (bevestigen = eigenaar)
    'POST /api/owner/afstemming/release-koppel': route(async (_c, auth, d) => {
      const userId = auth.user.id;
      const alsAgent = d.alsAgent === true;
      const kaart = await eenKaart(userId, d.kaartId);
      const releaseVersie = str(d.releaseVersie).trim().slice(0, 80);
      if (!releaseVersie) fout('RELEASE_ONBEKEND');
      const bestaand = (await eigenReleaseKoppelingen(userId)).find((k) => k.kaartId === kaart.id && k.releaseVersie === releaseVersie);
      if (bestaand) fout('KOPPEL_BESTAAT');
      const bekend = (await uitrolReleases()).find((r) => r.versie === releaseVersie);
      const zekerheid = clampZekerheid(d.zekerheid);
      const bevestig = d.bevestig === true;
      if (bevestig && alsAgent) fout('AGENT_MAG_NIET');
      const rij: ReleaseRecord = {
        ownerUserId: userId, kaartId: kaart.id, releaseVersie,
        ...(bekend ? { runId: bekend.id } : {}), ...(str(d.commit) ? { commit: str(d.commit).slice(0, 40) } : {}),
        zekerheid, stand: bevestig ? 'bevestigd' : 'voorgesteld',
        preflight: !bekend ? 'ongeregistreerd' : zekerheid >= 0.5 ? 'ok' : 'onbekend',
        postflight: 'niet_gecontroleerd', op: nu(),
      };
      const [id] = await db.add(RELEASE, [rij as unknown as Record<string, unknown>]);
      if (!id) throw new Error('OPSLAAN_MISLUKT');
      if (bevestig) {
        const besluit: BesluitRecord = { ownerUserId: userId, kaartId: kaart.id, keuze: 'bevestig', reden: `release ${releaseVersie}`, eigenaar: userId, op: nu() };
        await db.add(BESLUITEN, [besluit as unknown as Record<string, unknown>]);
      }
      await gebeurtenis(userId, kaart.id, 'release', alsAgent ? { soort: 'agent', id: str(d.agentId) || 'agent' } : { soort: 'eigenaar', id: userId }, { releaseVersie, stand: rij.stand, preflight: rij.preflight });
      return json({ koppeling: naarBuitenRelease({ ...rij, id }) });
    }),

    // -------------------------------------------------------------- postflight: uitgerold ≠ bevestigd (scenario 4)
    'POST /api/owner/afstemming/postflight': route(async (_c, auth, d) => {
      const userId = auth.user.id;
      const releaseVersie = str(d.releaseVersie).trim();
      const release = (await uitrolReleases()).find((r) => r.versie === releaseVersie);
      if (!release) fout('RELEASE_ONBEKEND');
      const koppelingen = (await eigenReleaseKoppelingen(userId)).filter((k) => k.releaseVersie === releaseVersie);
      let gecontroleerd = 0;
      const regressies: string[] = [];
      const onbevestigd: string[] = [];
      for (const k of koppelingen) {
        const [kr] = await db.get<KaartRecord>(KAARTEN, [str(k.kaartId)]);
        if (!kr || str(kr.ownerUserId) !== userId) continue;
        const extern = str(kr.externId) || str(k.kaartId);
        let doel: ReleaseRecord['postflight'];
        if (kr.gezondheid === 'regressed') { regressies.push(extern); doel = 'regressie'; }
        else {
          const bewijs = await eigenBewijs(userId, str(k.kaartId));
          const productieBewijs = bewijs.some((b) => b.omgeving === 'production' && b.resultaat === 'geslaagd' && str(b.waargenomenOp) > release!.op);
          if (productieBewijs) { gecontroleerd += 1; doel = 'gecontroleerd'; }
          else { onbevestigd.push(extern); doel = 'niet_gecontroleerd'; }
        }
        if (doel !== k.postflight) {
          await db.update(RELEASE, [{ id: k.id, record: { ...k, id: undefined, postflight: doel } as unknown as Record<string, unknown> }]);
          await gebeurtenis(userId, str(k.kaartId), 'release', { soort: 'systeem', id: 'postflight' }, { releaseVersie, postflight: doel });
        }
      }
      return json({ gecontroleerd, regressies, onbevestigd });
    }),

    // -------------------------------------------------------------- scan: eigen tabs/vlaggen/routes ↔ kaarten (read-only)
    'POST /api/owner/afstemming/scan': route(async (_c, auth) => {
      const userId = auth.user.id;
      const kaarten = (await eigenKaarten(userId)).filter((k) => k.gearchiveerd !== true);
      const teksten = kaarten.map((k) => kaartTekst(k));
      const bevindingen: ScanBevinding[] = [];
      const inventaris: Array<{ naam: string; sleutels: string[] }> = [
        { naam: 'вкладка', sleutels: await inventarisTabs() },
        { naam: 'прапорець', sleutels: await inventarisVlaggen() },
        { naam: 'маршрут', sleutels: (await inventarisRoutes()).slice(0, 120) },
      ];
      for (const groep of inventaris) {
        for (const sleutel of groep.sleutels) {
          if (bevindingen.length >= 190) break;
          if (!genoemd(teksten, sleutel)) bevindingen.push({ soort: 'zonder_kaart', sleutel, detail: `${groep.naam} без картки — кандидат на чернетку (сценарій 6)` });
        }
      }
      const alleSleutels = inventaris.flatMap((g) => g.sleutels);
      for (const k of kaarten) {
        if (bevindingen.length >= 200) break;
        const tekst = kaartTekst(k);
        if (!alleSleutels.some((s) => genoemd([tekst], s))) bevindingen.push({ soort: 'kaart_zonder_spoor', sleutel: str(k.externId), detail: 'картка не згадує жодної вкладки, прапорця чи маршруту — слід перевірити прив’язку', kaartId: k.id });
      }
      return json({ bevindingen: bevindingen.slice(0, 200), op: nu() });
    }),

    // -------------------------------------------------------------- rapport: telbare feiten, geen verzonnen procenten (§9)
    'POST /api/owner/afstemming/rapport': route(async (_c, auth, d) => {
      const userId = auth.user.id;
      const periode = str(d.periode) === 'maand' ? 'maand' : 'week';
      const dagen = periode === 'maand' ? 30 : 7;
      const sinds = new Date(Date.now() - dagen * 86400_000).toISOString();
      const kaarten = (await eigenKaarten(userId)).filter((k) => k.gearchiveerd !== true);
      const bewijs = await eigenBewijs(userId);
      const nieuw = kaarten.filter((k) => str(k.aangemaaktOp) >= sinds).length;
      const veranderd = kaarten.filter((k) => str(k.bijgewerktOp) >= sinds && str(k.aangemaaktOp) < sinds).length;
      const zonderEigenaar = kaarten.filter((k) => num(k.criteriaTotaal) === 0).length; // «zonder criteria»: niets om te toetsen
      const conflicten = kaarten.filter((k) => num(k.openConflicten) > 0).length;
      const grens = new Date(Date.now() - LIMIET.gezondheidVerouderdDagen * 86400_000).toISOString();
      const verouderd = kaarten.filter((k) => {
        if (k.gezondheid !== 'working') return false;
        const laatste = bewijs.filter((b) => b.kaartId === k.id && b.resultaat === 'geslaagd').map((b) => str(b.waargenomenOp)).sort().pop();
        return !laatste || laatste < grens;
      }).length;
      const tekst: [string, string] = [
        `За ${periode === 'maand' ? 'місяць' : 'тиждень'}: нових карток ${nieuw}, змінених ${veranderd}; без критеріїв ${zonderEigenaar}; з відкритими конфліктами ${conflicten}; «працює» без свіжого доказу (понад ${LIMIET.gezondheidVerouderdDagen} дн) ${verouderd}.`,
        `Afgelopen ${periode === 'maand' ? 'maand' : 'week'}: ${nieuw} nieuwe kaarten, ${veranderd} gewijzigd; ${zonderEigenaar} zonder criteria; ${conflicten} met open conflicten; ${verouderd} «werkt» zonder vers bewijs (ouder dan ${LIMIET.gezondheidVerouderdDagen} dagen).`,
      ];
      return json({ nieuw, veranderd, zonderEigenaar, conflicten, verouderd, tekst });
    }),

    // -------------------------------------------------------------- mogelijkheden: alleen bewezen dingen heten «перевірено»
    'POST /api/owner/afstemming/mogelijkheden': route(async (_c, auth) => {
      const userId = auth.user.id;
      const ZICHTBAAR = new Set(['deployed', 'production_verified', 'accepted']);
      const kaarten = (await eigenKaarten(userId)).filter((k) => k.gearchiveerd !== true && (ZICHTBAAR.has(k.levensfase) || (k.legacy && k.gezondheid === 'working')));
      const bewijs = await eigenBewijs(userId);
      const perDienst = new Map<string, Array<{ externId: string; titel: Kaart['titel']; uitleg: string; route: string; stand: 'перевірено' | 'не перевірено' }>>();
      for (const k of [...kaarten].sort((a, b) => str(a.externId).localeCompare(str(b.externId)))) {
        const productie = bewijs.some((b) => b.kaartId === k.id && b.omgeving === 'production' && b.resultaat === 'geslaagd');
        const eigenaarZagLegacy = Array.isArray(k.legacy?.bewijslaag) && k.legacy!.bewijslaag.includes('owner_browser_verified'); // de ENIGE uitzondering: de eigenaar keek destijds zelf
        const tekst = kaartTekst(k);
        const route = /(^|\s)(\/[a-z][a-z0-9/-]{2,})/.exec(tekst)?.[2] || '';
        const dienst = str(k.dienst) || 'site';
        const lijst = perDienst.get(dienst) || [];
        lijst.push({ externId: str(k.externId), titel: k.titel, uitleg: (Array.isArray(k.samenvatting) ? str(k.samenvatting[0]) : '').slice(0, 300), route, stand: productie || eigenaarZagLegacy ? 'перевірено' : 'не перевірено' });
        perDienst.set(dienst, lijst);
      }
      const rubrieken = [...perDienst.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dienst, items]) => ({ dienst, items }));
      return json({ rubrieken });
    }),
  };
}
