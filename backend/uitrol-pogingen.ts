// Pogingen om een update uit te rollen die NIET tot een installatie kwamen (migratie 0081, eigenaar 20.10.2026).
//
// Het probleem: brak het uploaden af in de BROWSER (bv. NotReadableError van de File API — het gekozen bestand was verplaatst of
// lag «op aanvraag» in een cloudmap), dan hoorde de server daar NIETS van. In de geschiedenis bleef niets over; de tweede, wel
// geslaagde poging stond er als enige. Daardoor was niet te zien op welke etappe het stokte en waarom.
//
// Dit bestand bewaart twee soorten regels in dezelfde tabel, altijd van elkaar te onderscheiden:
//   gemeld_door = 'browser'  het tabblad meldde de afbreking (POST /api/uitrol/poging/afgebroken). Dat is een mededeling van een
//                            CLIENT, dus: alleen van wie echt mag voorbereiden (een geldige grant), met een frequentielimiet,
//                            met afgekapte velden, nooit met een account of voorbereider uit het verzoeklichaam, en op het
//                            scherm met het merkteken «повідомлено браузером».
//   gemeld_door = 'server'   de server stelde het zelf vast (een upload die stil viel of te oud werd).
//
// Niets wordt verzonnen: zonder reden (tabblad gesloten, netwerk weg) komt er code 'ZONDER_REDEN' met reden_bekend = false in,
// en shared/uitrol-pogingen.ts zegt dat in mensentaal — uit dezelfde bron als alle andere foutteksten.
import { getPool } from '../server/platform/pg';
import { rateLimit } from '../server/platform/beveiliging';
import { journaalSchrijf } from './beheer-journaal';
import { NIET_VOLTOOID, POGING_LIMIETEN, ZONDER_REDEN, isEtappe, type PogingEtappe, type PogingMelder, type PogingUit, type PogingenAntwoord } from '../shared/uitrol-pogingen';

const sys = () => getPool('systeem');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSIE = /^[0-9]{8}-[0-9]{6}$/;
const SHA = /^[0-9a-f]{64}$/;
const MAX_BYTES = 300 * 1024 * 1024;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');
/** Afkappen én besturingstekens eruit: een client mag geen onleesbare of eindeloze velden in de geschiedenis zetten. */
const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
const getal = (v: unknown, min: number, max: number, standaard = min) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : standaard;
};

/** Wie meldt (altijd van de SERVER-kant bepaald: de grant van de sessie, nooit iets uit het verzoeklichaam). */
export type PogingGrant = { id: string; label: string; accountId: string };

export class PogingFout extends Error { constructor(public code: string, public status = 400) { super(code); } }

export type PogingInvoer = {
  voorstelId?: string; versie?: string; sha256?: string; bytes?: number; etappe: PogingEtappe;
  verstuurd?: number; procent?: number; code?: string; redenBekend?: boolean; poging?: number; bestand?: string;
  gemeldOp?: string; gemeldDoor: PogingMelder; grant?: PogingGrant | null;
};

/**
 * Eén regel wegschrijven. Gebruikt NOOIT gegevens uit het lichaam voor «wie»: account en voorbereider komen uit de grant (of,
 * bij een vaststelling van de server, uit het voorstel zelf). Het percentage wordt uit de bytes herberekend zodra die bekend zijn,
 * zodat een client geen vals percentage in de geschiedenis kan zetten.
 */
export async function pogingBewaren(p: PogingInvoer): Promise<{ id: string }> {
  if (!isEtappe(p.etappe)) throw new PogingFout('ETAPPE_ONGELDIG');
  const versie = VERSIE.test(String(p.versie || '')) ? String(p.versie) : '';
  const sha = SHA.test(String(p.sha256 || '').toLowerCase()) ? String(p.sha256).toLowerCase() : '';
  const bytes = getal(p.bytes, 0, MAX_BYTES, 0);
  const verstuurd = getal(p.verstuurd, 0, bytes || MAX_BYTES, 0);
  // Reden onbekend ⇒ altijd dezelfde code, zodat de geschiedenis «zonder reden» niet van een bekende oorzaak te onderscheiden valt.
  const redenBekend = p.redenBekend !== false && !!tekst(p.code, POGING_LIMIETEN.maxCode).trim() && tekst(p.code, POGING_LIMIETEN.maxCode).trim() !== ZONDER_REDEN;
  const code = redenBekend ? tekst(p.code, POGING_LIMIETEN.maxCode).trim() : ZONDER_REDEN;
  const procent = bytes > 0 ? Math.max(0, Math.min(100, Math.round((verstuurd / bytes) * 100))) : getal(p.procent, 0, 100, 0);
  const gemeldOp = p.gemeldOp && Number.isFinite(Date.parse(String(p.gemeldOp))) ? new Date(String(p.gemeldOp)).toISOString() : null;
  const voorstelId = UUID.test(String(p.voorstelId || '')) ? String(p.voorstelId) : null;
  const { rows } = await sys().query(
    `INSERT INTO app.uitrol_pogingen (voorstel_id, versie, sha256, bytes, etappe, verstuurd, procent, code, reden_bekend, poging, bestand,
       gemeld_door, voorbereider_id, voorbereider_label, account_id, gemeld_op)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
    [voorstelId, versie, sha, bytes, p.etappe, verstuurd, procent, code, redenBekend, getal(p.poging, 1, POGING_LIMIETEN.maxPoging, 1),
      tekst(p.bestand, POGING_LIMIETEN.maxBestand), p.gemeldDoor, p.grant?.id && UUID.test(p.grant.id) ? p.grant.id : null,
      tekst(p.grant?.label, POGING_LIMIETEN.maxBestand), tekst(p.grant?.accountId, 80), gemeldOp],
  );
  // Zelfde weg als de andere uitrolgebeurtenissen (uitrol_voorstel_begonnen, uitrol_voorstel_klaar …): het beheerlogboek, zodat de
  // geschiedenis ook via admin.tarasevych.com/audit te lezen is. Een mislukte logregel mag de melding nooit laten vallen.
  await journaalSchrijf({
    actie: 'uitrol_poging_afgebroken', actor: p.grant?.accountId || null, resultaat: 'afgebroken',
    doel: { soort: 'pakket', id: voorstelId || versie || '—', naam: versie || tekst(p.bestand, 80) || '—' },
    details: { etappe: p.etappe, code, redenBekend, procent, verstuurd, bytes, poging: getal(p.poging, 1, POGING_LIMIETEN.maxPoging, 1), gemeldDoor: p.gemeldDoor, voorstel: voorstelId || '', versie, sha256: sha, voorbereider: tekst(p.grant?.label, 120) },
    service: 'admin',
  });
  await pogingenOpruimen().catch((e) => console.error('[uitrol-pogingen] opruimen mislukt:', (e as Error).message));
  return { id: String(rows[0].id) };
}

/**
 * Melding van de BROWSER. Komt van een client, dus: geldige grant (door de aanroeper gecontroleerd), frequentielimiet per
 * voorbereider, en een voorstel-id dat ECHT van deze voorbereider is — anders 404. Zo kan niemand regels in de geschiedenis van
 * een ander zetten.
 */
export async function pogingMelden(grant: PogingGrant, a: Record<string, unknown>): Promise<{ id: string; bewaard: true }> {
  const limiet = await rateLimit(`uitrol-poging:${grant.id}`, POGING_LIMIETEN.perUur, 3600);
  if (!limiet.ok) throw new PogingFout('RATE_LIMITED', 429);
  const etappe = String(a.etappe ?? a.stap ?? '');
  if (!isEtappe(etappe)) throw new PogingFout('ETAPPE_ONGELDIG');
  let voorstelId = UUID.test(String(a.voorstelId ?? a.id ?? '')) ? String(a.voorstelId ?? a.id) : '';
  let versie = VERSIE.test(String(a.versie ?? a.version ?? '')) ? String(a.versie ?? a.version) : '';
  let bytes = getal(a.bytes, 0, MAX_BYTES, 0);
  if (voorstelId) {
    const { rows } = await sys().query('SELECT id, versie, bytes, sha256 FROM app.uitrol_voorstellen WHERE id = $1 AND voorbereider_id = $2', [voorstelId, grant.id]);
    if (!rows[0]) throw new PogingFout('NIET_GEVONDEN', 404);
    // Wat de server al wéét over dit voorstel weegt zwaarder dan wat de browser meestuurt.
    versie = String(rows[0].versie || versie); bytes = Number(rows[0].bytes || bytes);
    if (!a.sha256 && rows[0].sha256) a = { ...a, sha256: rows[0].sha256 };
  } else voorstelId = '';
  return { ...(await pogingBewaren({
    voorstelId, versie, sha256: String(a.sha256 || ''), bytes, etappe,
    verstuurd: getal(a.verstuurd ?? a.offset, 0, MAX_BYTES, 0), procent: getal(a.procent, 0, 100, 0),
    code: typeof a.code === 'string' ? a.code : '', redenBekend: a.redenBekend !== false && a.code !== ZONDER_REDEN,
    poging: getal(a.poging, 1, POGING_LIMIETEN.maxPoging, 1), bestand: String(a.bestand || ''),
    gemeldOp: typeof a.tijd === 'string' ? a.tijd : typeof a.gemeldOp === 'string' ? a.gemeldOp : '',
    gemeldDoor: 'browser', grant,
  })), bewaard: true as const };
}

/** Vaststelling van de SERVER zelf (een upload die nooit werd afgemaakt). Geen client in het spel, dus geen limieten. */
export async function pogingServerMelden(v: { id?: unknown; versie?: unknown; sha256?: unknown; bytes?: unknown; ontvangen?: unknown; voorbereider_id?: unknown; voorbereider_label?: unknown; account_id?: unknown; code?: unknown }): Promise<void> {
  try {
    await pogingBewaren({
      voorstelId: String(v.id || ''), versie: String(v.versie || ''), sha256: String(v.sha256 || ''), bytes: Number(v.bytes || 0),
      etappe: 'uploaden', verstuurd: Number(v.ontvangen || 0), code: String(v.code || NIET_VOLTOOID), redenBekend: true, poging: 1,
      gemeldDoor: 'server',
      grant: { id: String(v.voorbereider_id || ''), label: String(v.voorbereider_label || ''), accountId: String(v.account_id || '') },
    });
  } catch (e) { console.error('[uitrol-pogingen] serverpoging niet bewaard:', (e as Error).message); }
}

const pogingUit = (r: any): PogingUit => ({
  id: String(r.id), voorstelId: r.voorstel_id ? String(r.voorstel_id) : '', versie: String(r.versie || ''), sha256: String(r.sha256 || ''),
  bytes: Number(r.bytes || 0), etappe: String(r.etappe), verstuurd: Number(r.verstuurd || 0), procent: Number(r.procent || 0),
  code: String(r.code || ZONDER_REDEN), redenBekend: r.reden_bekend === true, poging: Number(r.poging || 1), bestand: String(r.bestand || ''),
  gemeldDoor: String(r.gemeld_door), voorbereider: String(r.voorbereider_label || ''), gemeldOp: iso(r.gemeld_op), tijd: iso(r.aangemaakt_op),
  voorstelStatus: String(r.voorstel_status || ''),
  ontvangen: Number(r.voorstel_ontvangen || 0),
  hervatbaar: String(r.voorstel_status || '') === 'uploaden' && Number(r.voorstel_ontvangen || 0) > 0,
});

/** Lijst voor de eigenaar (Admin → «Оновлення»): «Останні розгортання» en «Уся історія» tonen hiermee elke poging. */
export async function pogingenLijst(f: Record<string, unknown> = {}): Promise<PogingenAntwoord> {
  const limiet = getal(f.limiet ?? f.perPagina, 1, 100, 20);
  const q = tekst(f.q, 80).trim();
  const van = /^\d{4}-\d{2}-\d{2}$/.test(String(f.van || '')) ? String(f.van) : '';
  const tot = /^\d{4}-\d{2}-\d{2}$/.test(String(f.tot || '')) ? String(f.tot) : '';
  const waar: string[] = []; const p: unknown[] = [];
  const bind = (v: unknown) => { p.push(v); return `$${p.length}`; };
  if (van) waar.push(`g.aangemaakt_op >= ${bind(van)}::timestamptz`);
  if (tot) waar.push(`g.aangemaakt_op < (${bind(tot)}::timestamptz + interval '1 day')`);
  if (q) { const l = bind(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); waar.push(`(g.versie ILIKE ${l} OR g.code ILIKE ${l} OR g.etappe ILIKE ${l} OR g.voorbereider_label ILIKE ${l} OR g.bestand ILIKE ${l})`); }
  const basis = waar.length ? `WHERE ${waar.join(' AND ')}` : '';
  const totaal = Number((await sys().query(`SELECT count(*)::int AS n FROM app.uitrol_pogingen g ${basis}`, p)).rows[0].n);
  const { rows } = await sys().query(
    `SELECT g.*, v.status AS voorstel_status, v.ontvangen AS voorstel_ontvangen
       FROM app.uitrol_pogingen g LEFT JOIN app.uitrol_voorstellen v ON v.id = g.voorstel_id
       ${basis} ORDER BY g.aangemaakt_op DESC, g.id DESC LIMIT ${bind(limiet)}`, p);
  return { pogingen: rows.map(pogingUit), totaal };
}

/** Bewaartermijn en maximum per account (zoals bij de buurtabellen): regels over afbrekingen groeien nooit onbeperkt. */
export async function pogingenOpruimen(): Promise<{ oud: number; teveel: number }> {
  const oud = await sys().query(`DELETE FROM app.uitrol_pogingen WHERE aangemaakt_op < now() - make_interval(days => $1)`, [POGING_LIMIETEN.bewaarDagen]);
  const teveel = await sys().query(
    `DELETE FROM app.uitrol_pogingen g USING (
       SELECT id, row_number() OVER (PARTITION BY account_id ORDER BY aangemaakt_op DESC, id DESC) AS rn FROM app.uitrol_pogingen
     ) r WHERE r.id = g.id AND r.rn > $1`, [POGING_LIMIETEN.maxPerAccount]);
  return { oud: oud.rowCount || 0, teveel: teveel.rowCount || 0 };
}
