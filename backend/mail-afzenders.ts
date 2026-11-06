// Eigen database van afzenders per account (mail.tarasevych.com; audit 18.10.2026, artefact-draad f252547a, migratie 0064).
//
//  - De regels (wanneer «geverifieerd», «verdacht», «onbekend») staan in shared/mail-afzenders.ts; hier alleen opslag, routes,
//    de eerste controle over de bestaande mail en de luie controle van berichten van bekende diensten.
//  - Strikt per account: alles onder alsGebruiker() (RLS, eigen rijen). De voortgang van de eerste controle schrijft de
//    systeemrol (app.mail_afzender_audit); de app-rol leest die alleen.
//  - Sinds 20.10.2026 (migratie 0083) is de sleutel niet meer «de mens» maar «de mens ÉN de ruimte»: het technische profiel
//    heeft eigen contacten, of gebruikt bewust de persoonlijke. Welke lade dat is, beslist de poort — backend/mail-ruimte.ts,
//    die backend/ruimte-scheiding.ts vraagt — en NOOIT de invoer van het verzoek. Elke query hieronder gaat daarom door
//    `inLade()` of begint met `ladeVereist()`; een rij zonder `ruimte` is persoonlijk, dus er is niets verhuisd of verdwenen.
//  - Nooit berichtinhoud: van Gmail lezen we alleen From, Date en Authentication-Results (format=metadata).
//  - Een handmatige bevestiging wordt nooit automatisch teruggedraaid. Een bericht met mislukte DMARC van een bevestigd adres
//    wordt per bericht als verdacht getoond (en in het bewijs geteld), het adres blijft bevestigd.
//  - Het beheerlogboek krijgt alleen het domein en een korte hash van het adres (het logboek is voor de beheerder zichtbaar;
//    de adressen zelf blijven in de eigen database van de gebruiker).
import { createHash } from 'node:crypto';
import { error, json } from '../server/platform';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { alsGebruiker } from './ai-toestemmingen';
import { ladeVereist, MailRuimteFout } from './mail-ruimte';
import { sqlLadeWaar, type Lade } from '../shared/ruimte-scheiding';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import {
  AFZENDER_STATUSSEN, adresVan, adressenVan, authGeslaagdVoor, bekendeDienstVoor, bewijsRegels, classificeer, geldigAdres, isGratisMailbox, naamSleutel, niveauVoor,
  normaliseerAdres, organisatieDomein, parseAuthResults, vertrouwenVan,
  type AfzenderBron, type AfzenderStatus, type AuthResultaten, type Classificatie, type ContactInvoer, type DnsBewijs,
} from '../shared/mail-afzenders';
import { authUitslag } from '../shared/mail-afzenders'; // звірка рядків доказу з AuthUitslag (стара помилка TS2322 у herbeoordeelUitBewijs, 31.10.2026)
import { AFZENDER_REGELS_VERSIE, magAutomatischOverschrijven, magContactnaamOpheffen, NU_UITLEG } from '../shared/afzender-regels';
import { DNS_GRENS, herhaalVerdacht } from '../shared/afzender-wachtrij';
import { beperkt, DNS_GELIJKTIJDIG, domeinDns, fetchMetTijd, gmailFoutVan, gmailScanBron, tokenVoor, wisTokens, type ScanBron, type ScanKop } from './mail-afzender-bronnen';
import { taakBijwerken, taakLezen, taakPauze, taakSoort, taakStart, taakStilBij, taakStop } from './mail-contacten-taak';
import {
  isTijdelijkeScanFout, normaliseerScanBeleid, SCAN_MAX_POGINGEN, scanBackoffMs, scanHerhaalPlan, scanMagHerhalen, STANDAARD_SCAN_BELEID, type ScanBeleid,
} from '../shared/mail-scan-beleid';

// ------------------------------------------------------------------------------------------------ Gmail-bron (vervangbaar in tests)
export type GmailKop = { from: string; auth: string[]; tijd: number };
export type GmailBron = {
  accounts(userId: string): Promise<Array<{ id: string; email: string }>>;
  lijst(userId: string, accountId: string, pageToken: string, max: number): Promise<{ ids: string[]; next: string; schatting?: number }>;
  kop(userId: string, accountId: string, messageId: string): Promise<GmailKop | null>;
};
const standaardBron: GmailBron = {
  async accounts(userId) { return gmailScanBron.accounts(userId); },
  async lijst(userId, accountId, pageToken, max) {
    const token = await tokenVoor(userId, accountId);
    const p = new URLSearchParams({ maxResults: String(max), includeSpamTrash: 'false', fields: 'messages/id,nextPageToken,resultSizeEstimate' });
    if (pageToken) p.set('pageToken', pageToken);
    const r = await fetchMetTijd(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${p}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(await gmailFoutVan(r));
    const d = await r.json() as { messages?: Array<{ id?: string }>; nextPageToken?: string; resultSizeEstimate?: number };
    return { ids: (d.messages || []).map((m) => String(m.id || '')).filter((id) => /^[A-Za-z0-9_-]{1,200}$/.test(id)), next: String(d.nextPageToken || ''), schatting: Number(d.resultSizeEstimate || 0) };
  },
  async kop(userId, accountId, messageId) {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(messageId)) return null;
    const token = await tokenVoor(userId, accountId);
    const p = new URLSearchParams({ format: 'metadata', fields: 'id,internalDate,payload/headers' });
    for (const naam of ['From', 'Date', 'Authentication-Results']) p.append('metadataHeaders', naam);
    const r = await fetchMetTijd(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${p}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(await gmailFoutVan(r));
    const d = await r.json() as { internalDate?: string; payload?: { headers?: Array<{ name?: string; value?: string }> } };
    const h = d.payload?.headers || [];
    const van = (naam: string) => h.filter((x) => String(x.name || '').toLowerCase() === naam.toLowerCase()).map((x) => String(x.value || ''));
    return { from: van('From')[0] || '', auth: van('Authentication-Results'), tijd: Number(d.internalDate || 0) || Date.parse(van('Date')[0] || '') || 0 };
  },
};
let bron: GmailBron = standaardBron;
/** Alleen voor tests: een nep-Gmail. Terug naar de echte met `zetGmailBron(null)`. */
export function zetGmailBron(b: GmailBron | null) { bron = b || standaardBron; wisTokens(); lazyCache.clear(); lazyEmmer.clear(); }
let scanBron: ScanBron = gmailScanBron;
/** Alleen voor tests: nep-Gmail voor de volledige controle («Контакти й відправники»). */
export function zetScanBron(b: ScanBron | null) { scanBron = b || gmailScanBron; wisTokens(); autoLaatst.clear(); }

// ------------------------------------------------------------------------------------------------ in welke LADE werken we?
// Gescheiden gegevensruimtes (0083): elke rij van afzenders en contacten hangt niet meer aan de mens alleen, maar aan
// (mens, ruimte). De lade komt UITSLUITEND van de poort (backend/mail-ruimte.ts, die backend/ruimte-scheiding.ts vraagt) en
// nooit uit de invoer; is er geen lade gebonden, dan is dit verzoek niet gepoort en krijgt het een fout in plaats van de
// persoonlijke gegevens. `W` is de WHERE-voorwaarde ($1 = de mens), `R` de letterlijke ruimte voor een nieuwe rij.
const W = (lade: Lade) => sqlLadeWaar('ruimte', lade, 1);
const R = (lade: Lade) => (lade.ruimte === 'technisch' ? 'technisch' : 'prive');
/** Lezen en schrijven in de lade van deze aanroep, onder RLS (eigen rijen) zoals voorheen. */
const inLade = <T>(userId: string, fn: (q: Q, lade: Lade) => Promise<T>): Promise<T> => {
  const lade = ladeVereist(userId);
  return alsGebruiker(lade.userId, (q) => fn(q, lade));
};

// ------------------------------------------------------------------------------------------------ rijen
export type AfzenderRij = {
  adres: string; naam: string; domein: string; status: AfzenderStatus; bron: AfzenderBron | null; reden: string; merk: string;
  bewijs: Bewijs; eersteOp: string | null; laatsteOp: string | null; aantal: number; notitie: string; historie: Historie[];
  geverifieerdOp: string | null; geverifieerdDoor: string | null; bijgewerktOp: string;
  /** 0074: «ви писали», in contacten, waar gezien en afgeleide velden (organisatie, officieel, vertrouwen). */
  verzonden?: number; laatstVerzondenOp?: string | null; inContacten?: boolean; accounts?: string[];
  organisatie?: string; officieel?: boolean; vertrouwen?: number;
};
export type Bewijs = {
  laatste?: { spf: string; dkim: string; dmarc: string; authserv: string; dkimDomein: string; dmarcDomein: string; tijd: number; arc?: string; spfDomein?: string };
  pass?: number; fail?: number; zonder?: number; verdachtePogingen?: number;
  /** Версія правил, за якою цей рядок уже переглянуто (одноразовий перегляд старих автоматичних вердиктів). */
  regelVersie?: number;
};
export type Historie = { op: string; tijd: number; door: string; van?: string; naar?: string; reden?: string };
type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const naarRij = (r: any): AfzenderRij => ({
  adres: r.adres, naam: r.naam || '', domein: r.domein, status: r.status, bron: r.bron || null, reden: r.reden || '', merk: r.merk || '',
  bewijs: r.bewijs || {}, eersteOp: iso(r.eerste_op), laatsteOp: iso(r.laatste_op), aantal: Number(r.aantal || 0), notitie: r.notitie || '',
  historie: Array.isArray(r.historie) ? r.historie : [], geverifieerdOp: iso(r.geverifieerd_op), geverifieerdDoor: r.geverifieerd_door || null, bijgewerktOp: iso(r.bijgewerkt_op) || '',
  verzonden: Number(r.verzonden || 0), laatstVerzondenOp: iso(r.laatst_verzonden_op), inContacten: r.in_contacten === true, accounts: Array.isArray(r.accounts) ? r.accounts : [],
  organisatie: r.organisatie || '', officieel: r.officieel === true, vertrouwen: Number(r.vertrouwen || 0),
});
const KOLOMMEN = 'adres, naam, domein, status, bron, reden, merk, bewijs, eerste_op, laatste_op, aantal, notitie, historie, geverifieerd_op, geverifieerd_door, bijgewerkt_op, verzonden, laatst_verzonden_op, in_contacten, accounts, organisatie, officieel, vertrouwen';
const NIEUWE_VELDEN = { verzonden: 0, laatstVerzondenOp: null, inContacten: false, accounts: [] as string[], organisatie: '', officieel: false, vertrouwen: 0 };
/** De invoer voor bewijsRegels/vertrouwenVan (shared) uit een rij + DNS. */
export const contactInvoer = (r: AfzenderRij, dns: DnsBewijs | null): ContactInvoer => ({
  adres: r.adres, domein: r.domein, status: r.status, bron: r.bron, reden: r.reden, merk: r.merk, bewijs: r.bewijs, aantal: r.aantal, laatsteOp: r.laatsteOp,
  verzonden: r.verzonden || 0, laatstVerzondenOp: r.laatstVerzondenOp || null, inContacten: r.inContacten === true, geverifieerdOp: r.geverifieerdOp, bijgewerktOp: r.bijgewerktOp || null, dns,
});
async function leesDns(q: Q, lade: Lade, domeinen: string[]): Promise<Map<string, DnsBewijs>> {
  if (!domeinen.length) return new Map();
  const rows = (await q(`SELECT domein, gegevens FROM app.mail_domein_dns WHERE ${W(lade)} AND domein = ANY($2::text[])`, [lade.userId, [...new Set(domeinen)]])).rows;
  return new Map(rows.map((r) => [r.domein, r.gegevens as DnsBewijs]));
}
async function slaDnsOp(q: Q, lade: Lade, d: DnsBewijs) {
  await q(`INSERT INTO app.mail_domein_dns (user_id, ruimte, domein, gegevens, gecontroleerd_op) VALUES ($1, '${R(lade)}', $2, $3::jsonb, to_timestamp($4 / 1000.0))
     ON CONFLICT (user_id, ruimte, domein) DO UPDATE SET gegevens = EXCLUDED.gegevens, gecontroleerd_op = EXCLUDED.gecontroleerd_op`, [lade.userId, d.domein, JSON.stringify(d), d.tijd]);
}
const metHistorie = (h: Historie[], e: Historie) => [...h, e].slice(-50);

/** Rij wegschrijven; organisatie, officieel en vertrouwen worden hier altijd opnieuw afgeleid (met het DNS-bewijs van het domein:
 *  meegegeven, of uit app.mail_domein_dns). */
async function schrijfRij(q: Q, lade: Lade, r: AfzenderRij, dns?: DnsBewijs | null) {
  if (dns === undefined) dns = (await leesDns(q, lade, [r.domein])).get(r.domein) || null;
  const v = vertrouwenVan(contactInvoer(r, dns));
  r.organisatie = organisatieDomein(r.domein); r.officieel = !!bekendeDienstVoor(r.domein); r.vertrouwen = v.score;
  await q(`INSERT INTO app.mail_afzenders (user_id, ruimte, ${KOLOMMEN})
     VALUES ($1, '${R(lade)}', $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14::jsonb, $15, $16, now(), $17, $18, $19, $20::text[], $21, $22, $23)
     ON CONFLICT (user_id, ruimte, adres) DO UPDATE SET naam = EXCLUDED.naam, domein = EXCLUDED.domein, status = EXCLUDED.status, bron = EXCLUDED.bron,
       reden = EXCLUDED.reden, merk = EXCLUDED.merk, bewijs = EXCLUDED.bewijs, eerste_op = EXCLUDED.eerste_op, laatste_op = EXCLUDED.laatste_op,
       aantal = EXCLUDED.aantal, notitie = EXCLUDED.notitie, historie = EXCLUDED.historie, geverifieerd_op = EXCLUDED.geverifieerd_op,
       geverifieerd_door = EXCLUDED.geverifieerd_door, bijgewerkt_op = now(), verzonden = EXCLUDED.verzonden, laatst_verzonden_op = EXCLUDED.laatst_verzonden_op,
       in_contacten = EXCLUDED.in_contacten, accounts = EXCLUDED.accounts, organisatie = EXCLUDED.organisatie, officieel = EXCLUDED.officieel, vertrouwen = EXCLUDED.vertrouwen`,
  [lade.userId, r.adres, r.naam.slice(0, 200), r.domein, r.status, r.bron, r.reden, r.merk.slice(0, 80), JSON.stringify(r.bewijs), r.eersteOp, r.laatsteOp, r.aantal, r.notitie.slice(0, 500), JSON.stringify(r.historie.slice(-50)), r.geverifieerdOp, r.geverifieerdDoor,
    r.verzonden || 0, r.laatstVerzondenOp || null, r.inContacten === true, (r.accounts || []).slice(0, 20), (r.organisatie || '').slice(0, 253), r.officieel === true, r.vertrouwen || 0]);
}
async function leesRijen(q: Q, lade: Lade, adressen: string[], voorUpdate = false): Promise<Map<string, AfzenderRij>> {
  if (!adressen.length) return new Map();
  const rows = (await q(`SELECT ${KOLOMMEN} FROM app.mail_afzenders WHERE ${W(lade)} AND adres = ANY($2::text[])${voorUpdate ? ' FOR UPDATE' : ''}`, [lade.userId, adressen])).rows;
  return new Map(rows.map((r) => [r.adres, naarRij(r)]));
}
async function contactenVan(q: Q, lade: Lade): Promise<Map<string, string[]>> {
  const rows = (await q(`SELECT naam, adres FROM app.mail_afzenders WHERE ${W(lade)} AND (status = 'geverifieerd' OR in_contacten) AND naam <> '' ORDER BY laatste_op DESC NULLS LAST LIMIT 3000`, [lade.userId])).rows;
  const m = new Map<string, string[]>();
  for (const r of rows) { const k = naamSleutel(r.naam); if (!k) continue; m.set(k, [...(m.get(k) || []), r.adres]); }
  return m;
}

// ------------------------------------------------------------------------------------------------ samenvoegen (puur, getest)
export type Waarneming = { adres: string; naam: string; domein: string; klass: Classificatie; auth: AuthResultaten; tijd: number; telt: boolean };
/** Een nieuwe waarneming (bericht) samenvoegen met de bestaande rij. Handmatig bevestigd blijft altijd bevestigd. */
export function samenvoegen(rij: AfzenderRij | null, w: Waarneming, nu = Date.now()): AfzenderRij {
  const tijd = w.tijd > 0 ? new Date(w.tijd).toISOString() : null;
  const basis: AfzenderRij = rij ? { ...rij, bewijs: { ...rij.bewijs }, historie: [...rij.historie] } : {
    adres: w.adres, naam: w.naam, domein: w.domein, status: 'onbekend', bron: null, reden: '', merk: '', bewijs: {}, eersteOp: tijd, laatsteOp: tijd,
    aantal: 0, notitie: '', historie: [], geverifieerdOp: null, geverifieerdDoor: null, bijgewerktOp: new Date(nu).toISOString(), ...NIEUWE_VELDEN, accounts: [],
  };
  if (w.telt) basis.aantal += 1;
  if (tijd && (!basis.eersteOp || tijd < basis.eersteOp)) basis.eersteOp = tijd;
  if (tijd && (!basis.laatsteOp || tijd > basis.laatsteOp)) { basis.laatsteOp = tijd; if (w.naam) basis.naam = w.naam; }
  if (!basis.naam && w.naam) basis.naam = w.naam;
  const b = basis.bewijs;
  if (w.auth.betrouwbaar) {
    b.laatste = { spf: w.auth.spf, dkim: w.auth.dkim.map((k) => `${k.uitslag}:${k.domein}`).join(',').slice(0, 300), dmarc: w.auth.dmarc, authserv: w.auth.authserv, dkimDomein: w.auth.dkim.find((k) => k.uitslag === 'pass')?.domein || '', dmarcDomein: w.auth.dmarcDomein, tijd: w.tijd || nu, arc: w.auth.arc || '', spfDomein: w.auth.spfDomein || '' };
    if (w.auth.dmarc === 'pass') b.pass = (b.pass || 0) + 1;
    else if (w.auth.dmarc === 'fail') b.fail = (b.fail || 0) + 1;
  } else b.zonder = (b.zonder || 0) + 1;
  const was = basis.status, k = w.klass;
  const eigenHandtekening = authGeslaagdVoor(w.auth, w.domein || basis.domein);
  const contactNaamWeg = basis.status === 'verdacht' && magContactnaamOpheffen(basis.reden, eigenHandtekening);
  if (basis.status === 'geverifieerd') {
    // Bevestigd blijft bevestigd; een imitatiepoging met dit adres tellen we en tonen we per bericht.
    if (k.status === 'verdacht') {
      b.verdachtePogingen = (b.verdachtePogingen || 0) + 1;
      if ((b.verdachtePogingen || 0) <= 3 || (b.verdachtePogingen || 0) % 25 === 0) basis.historie = metHistorie(basis.historie, { op: 'verdachte-poging', tijd: nu, door: 'systeem', reden: k.reden });
    }
  } else if (contactNaamWeg) {
    // Лише автоматичне «ім’я контакту», і лише коли підпис — власний домен. Інші автоматичні причини лишаються.
    const volgende = k.reden === 'NAAM_VAN_CONTACT_ANDER_ADRES'
      ? { status: 'onbekend' as const, bron: null, reden: isGratisMailbox(basis.domein) ? 'GRATIS_MAILBOX' : 'NIET_BEVESTIGD', merk: '' }
      : k;
    basis.status = volgende.status; basis.bron = volgende.bron; basis.reden = volgende.reden; basis.merk = volgende.merk;
    if (volgende.status === 'geverifieerd') { basis.geverifieerdOp = new Date(nu).toISOString(); basis.geverifieerdDoor = 'systeem'; }
  } else if (basis.status === 'verdacht' && !magAutomatischOverschrijven(basis.reden, k.status)) {
    // Ручна підозра лишається. Автоматична теж, доки нове спостереження не «перевірене».
  } else if (k.status !== 'onbekend' || basis.reden !== k.reden) {
    basis.status = k.status; basis.bron = k.bron; basis.reden = k.reden; basis.merk = k.merk;
    if (k.status === 'geverifieerd') { basis.geverifieerdOp = new Date(nu).toISOString(); basis.geverifieerdDoor = 'systeem'; }
  }
  if (basis.status !== was || !rij) basis.historie = metHistorie(basis.historie, { op: rij ? 'automatisch' : 'gezien', tijd: nu, door: 'systeem', van: rij ? was : undefined, naar: basis.status, reden: basis.reden });
  return basis;
}

/** Перегляд збереженого Authentication-Results. Ручну позначку не знімає. Без доказу статус не змінюється, але версію правил ставимо. */
export function herbeoordeelUitBewijs(rij: AfzenderRij, nu = Date.now()): AfzenderRij {
  const stempel = (r: AfzenderRij): AfzenderRij => r.bewijs?.regelVersie === AFZENDER_REGELS_VERSIE ? r : { ...r, bewijs: { ...r.bewijs, regelVersie: AFZENDER_REGELS_VERSIE } };
  if (rij.bron === 'handmatig' || rij.reden === 'HANDMATIG' || rij.reden === 'HANDMATIG_VERDACHT') return stempel(rij);
  const laatste = rij.bewijs?.laatste;
  if (!laatste?.dmarc) return stempel(rij);
  const auth: AuthResultaten = {
    betrouwbaar: true, authserv: laatste.authserv || '', spf: authUitslag(laatste.spf || ''), spfDomein: laatste.spfDomein || '',
    dkim: laatste.dkimDomein ? [{ uitslag: 'pass', domein: laatste.dkimDomein }] : [],
    dmarc: authUitslag(laatste.dmarc), dmarcDomein: laatste.dmarcDomein || '', arc: authUitslag(laatste.arc || ''),
  };
  const klass = classificeer({ naam: rij.naam, adres: rij.adres, domein: rij.domein, auth });
  if (klass.status === rij.status && klass.reden === rij.reden) return stempel(rij);
  return stempel(samenvoegen(rij, { adres: rij.adres, naam: rij.naam, domein: rij.domein, klass, auth, tijd: laatste.tijd || nu, telt: false }, nu));
}

// ------------------------------------------------------------------------------------------------ status voor de lijst (+ luie controle)
const lazyCache = new Map<string, { auth: AuthResultaten; tot: number }>();
const lazyEmmer = new Map<string, number[]>();
const LAZY_PER_VERZOEK = 5, LAZY_PER_5MIN = 40;
const magLazy = (userId: string) => {
  const nu = Date.now(), lijst = (lazyEmmer.get(userId) || []).filter((t) => nu - t < 300_000);
  if (lijst.length >= LAZY_PER_5MIN) { lazyEmmer.set(userId, lijst); return false; }
  lijst.push(nu); lazyEmmer.set(userId, lijst); return true;
};
export type StatusItem = { from: unknown; messageId?: unknown; accountId?: unknown };
export type StatusUit = { adres: string; naam: string; domein: string; status: AfzenderStatus; bron: AfzenderBron | null; reden: string; merk: string; opgeslagen: boolean; bericht?: 'auth-mislukt' | ''; notitie?: string };
export async function afzenderStatus(userId: string, items: StatusItem[]): Promise<StatusUit[]> {
  const invoer = items.slice(0, 100).map((i) => ({ ...adresVan(i.from), messageId: String(i.messageId || ''), accountId: String(i.accountId || '') }));
  const adressen = [...new Set(invoer.map((i) => i.adres).filter(Boolean))];
  const { rijen, contacten } = await inLade(userId, async (q, lade) => ({ rijen: await leesRijen(q, lade, adressen), contacten: await contactenVan(q, lade) }));
  // Luie controle: alleen berichten van een bekend merkdomein zonder bevestiging, met bericht-id, beperkt per verzoek en per 5 min.
  const teControleren = invoer.filter((i) => i.adres && i.messageId && /^[A-Za-z0-9_-]{1,200}$/.test(i.messageId) && bekendeDienstVoor(i.domein)
    && (!rijen.get(i.adres) || rijen.get(i.adres)!.status === 'onbekend')).slice(0, LAZY_PER_VERZOEK);
  const authPerBericht = new Map<string, AuthResultaten>();
  for (const i of teControleren) {
    const c = lazyCache.get(i.messageId);
    if (c && c.tot > Date.now()) { authPerBericht.set(i.messageId, c.auth); continue; }
    if (!magLazy(userId)) break;
    try {
      const kop = await bron.kop(userId, i.accountId, i.messageId);
      if (!kop) continue;
      const auth = parseAuthResults(kop.auth);
      lazyCache.set(i.messageId, { auth, tot: Date.now() + 3600_000 });
      if (lazyCache.size > 5000) lazyCache.delete(lazyCache.keys().next().value as string);
      authPerBericht.set(i.messageId, auth);
      const klass = classificeer({ naam: i.naam, adres: i.adres, domein: i.domein, auth, contacten });
      const nieuw = await inLade(userId, async (q, lade) => {
        const oud = (await leesRijen(q, lade, [i.adres], true)).get(i.adres) || null;
        const r = samenvoegen(oud, { adres: i.adres, naam: i.naam, domein: i.domein, klass, auth, tijd: kop.tijd, telt: false });
        await schrijfRij(q, lade, r); return r;
      });
      rijen.set(i.adres, nieuw);
    } catch { /* Gmail niet bereikbaar: status blijft wat hij was */ }
  }
  return invoer.map((i) => {
    if (!i.adres) return { adres: '', naam: i.naam, domein: '', status: 'onbekend', bron: null, reden: 'GEEN_ADRES', merk: '', opgeslagen: false };
    const rij = rijen.get(i.adres), auth = authPerBericht.get(i.messageId);
    if (rij) {
      const perBericht = auth ? classificeer({ naam: i.naam, adres: i.adres, domein: i.domein, auth, contacten }) : null;
      const misluktBericht = !!perBericht && perBericht.status === 'verdacht' && rij.status === 'geverifieerd';
      return { adres: rij.adres, naam: i.naam || rij.naam, domein: rij.domein, status: misluktBericht ? 'verdacht' : rij.status, bron: rij.bron, reden: misluktBericht ? perBericht!.reden : rij.reden, merk: rij.merk, opgeslagen: true, bericht: misluktBericht ? 'auth-mislukt' : '', notitie: rij.notitie };
    }
    const k = classificeer({ naam: i.naam, adres: i.adres, domein: i.domein, auth, contacten });
    return { adres: i.adres, naam: i.naam, domein: i.domein, status: k.status, bron: k.bron, reden: k.reden, merk: k.merk, opgeslagen: false };
  });
}

/** Authenticatie van één bericht voor het bevestigvenster (SPF/DKIM/DMARC van de vertrouwde server). */
export async function berichtControle(userId: string, accountId: string, messageId: string, from: unknown) {
  const a = adresVan(from);
  if (!messageId) return { adres: a.adres, domein: a.domein, auth: null, classificatie: null };
  const kop = await bron.kop(userId, accountId, messageId);
  if (!kop) return { adres: a.adres, domein: a.domein, auth: null, classificatie: null };
  const vanKop = adresVan(kop.from || from);
  const auth = parseAuthResults(kop.auth);
  const contacten = await inLade(userId, (q, lade) => contactenVan(q, lade));
  return { adres: vanKop.adres, domein: vanKop.domein, naam: vanKop.naam, auth: { betrouwbaar: auth.betrouwbaar, authserv: auth.authserv, spf: auth.spf, dkim: auth.dkim, dmarc: auth.dmarc, dmarcDomein: auth.dmarcDomein }, classificatie: classificeer({ ...vanKop, auth, contacten }) };
}

/** «Перевірити зараз»: свіжий DNS домену (не для безкоштовної пошти) і Authentication-Results недавнього листа. Без вмісту листа. */
export async function afzenderNu(userId: string, i: { adres?: unknown; from?: unknown; accountId?: unknown; messageId?: unknown }) {
  const v = adresVan(i.from || i.adres);
  const adres = v.adres || normaliseerAdres(i.adres);
  if (!geldigAdres(adres)) fout('AFZENDER_ADRES_ONGELDIG');
  const domein = adres.slice(adres.lastIndexOf('@') + 1);
  const gratis = isGratisMailbox(domein);
  let auth: AuthResultaten | null = null;
  const messageId = String(i.messageId || ''), accountId = String(i.accountId || '');
  if (messageId && accountId) {
    try {
      const kop = await bron.kop(userId, accountId, messageId);
      if (kop) auth = parseAuthResults(kop.auth);
    } catch { auth = null; }
  }
  let dns: DnsBewijs | null = null;
  if (!gratis) {
    try {
      dns = await domeinDns(domein);
      await inLade(userId, async (q, lade) => { await slaDnsOp(q, lade, dns!); await herbereken(q, lade, [dns!]); }).catch(() => undefined);
    } catch { dns = null; }
  }
  let contacten = new Map<string, string[]>();
  try { contacten = await inLade(userId, (q, lade) => contactenVan(q, lade)); } catch { /* без бази лишається класифікація з того, що вже є */ }
  const classificatie = classificeer({ naam: v.naam, adres, domein, auth: auth || undefined, contacten });
  return { adres, domein, auth, classificatie, dns, uitlegUk: NU_UITLEG[0], uitlegNl: NU_UITLEG[1], gratis };
}

// ------------------------------------------------------------------------------------------------ beheer (lijst, bevestigen, …)
export class AfzenderFout extends Error { constructor(public code: string, public status = 400) { super(code); } }
// Оголошення функції (не const-стрілка), щоб TypeScript звужував тип після `if (!x) fout(...)` (стара помилка TS2345 ×6, виправлено 31.10.2026).
// Functiedeclaratie i.p.v. const-pijl: alleen dan versmalt TypeScript het type na `if (!x) fout(...)`.
function fout(code: string, status = 400): never { throw new AfzenderFout(code, status); }
const adresHash = (adres: string) => createHash('sha256').update(adres).digest('hex').slice(0, 16);
const logboek = (userId: string, actie: string, adres: string, extra: { voor?: unknown; na?: unknown; reden?: string; resultaat?: string } = {}) =>
  schrijfBeheerAudit({ actor: userId, eigenaar: userId, service: 'mail', actie, doel: { soort: 'afzender', id: adresHash(adres), naam: adres.slice(adres.lastIndexOf('@') + 1) }, ...extra }).catch(() => undefined);

export async function afzendersLijst(userId: string, i: { zoek?: unknown; status?: unknown; pagina?: unknown; perPagina?: unknown }) {
  const zoek = String(i.zoek || '').trim().toLowerCase().slice(0, 120), status = AFZENDER_STATUSSEN.includes(i.status as AfzenderStatus) ? String(i.status) : '';
  const per = Math.min(100, Math.max(5, Number(i.perPagina) || 25)), pagina = Math.max(1, Math.floor(Number(i.pagina) || 1));
  return inLade(userId, async (q, lade) => {
    const params: unknown[] = [lade.userId]; const waar = [W(lade)];
    if (status) { params.push(status); waar.push(`status = $${params.length}`); }
    if (zoek) { params.push(`%${zoek.replace(/[%_\\]/g, (c) => `\\${c}`)}%`); waar.push(`(adres ILIKE $${params.length} OR lower(naam) ILIKE $${params.length} OR domein ILIKE $${params.length})`); }
    const totaal = Number((await q(`SELECT count(*)::int AS n FROM app.mail_afzenders WHERE ${waar.join(' AND ')}`, params)).rows[0]?.n || 0);
    params.push(per, (pagina - 1) * per);
    const rows = (await q(`SELECT ${KOLOMMEN} FROM app.mail_afzenders WHERE ${waar.join(' AND ')} ORDER BY (status = 'verdacht') DESC, laatste_op DESC NULLS LAST, adres LIMIT $${params.length - 1} OFFSET $${params.length}`, params)).rows;
    const tellers = Object.fromEntries((await q(`SELECT status, count(*)::int AS n FROM app.mail_afzenders WHERE ${W(lade)} GROUP BY status`, [userId])).rows.map((r) => [r.status, r.n]));
    return { totaal, pagina, perPagina: per, tellers: { geverifieerd: tellers.geverifieerd || 0, onbekend: tellers.onbekend || 0, verdacht: tellers.verdacht || 0 }, afzenders: rows.map((r) => { const x = naarRij(r); return { ...x, historie: undefined }; }) };
  });
}
export async function afzenderDetail(userId: string, adresRuw: unknown) {
  const adres = normaliseerAdres(adresRuw);
  if (!geldigAdres(adres)) fout('AFZENDER_ADRES_ONGELDIG');
  const r = await inLade(userId, async (q, lade) => (await leesRijen(q, lade, [adres])).get(adres) || null);
  if (!r) fout('AFZENDER_NIET_GEVONDEN', 404);
  return r!;
}
const tekst = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** «Зберегти» додає адресу в «Мої контакти», не лише ставить geverifieerd. Чиста функція: база пише викликач. */
export function bewaarInContacten(basis: AfzenderRij, userId: string, naam: string, notitie: string | undefined, nu: number, ondanks = ''): AfzenderRij {
  const was = basis.status;
  let historie = basis.historie;
  if (!basis.inContacten) historie = metHistorie(historie, { op: 'in-contacten', tijd: nu, door: userId });
  historie = metHistorie(historie, { op: 'handmatig-bevestigd', tijd: nu, door: userId, van: was, naar: 'geverifieerd', reden: ondanks ? `ondanks ${ondanks}` : undefined });
  return { ...basis, naam: naam || basis.naam, notitie: notitie !== undefined ? notitie : basis.notitie, status: 'geverifieerd', bron: 'handmatig', reden: 'HANDMATIG',
    inContacten: true, geverifieerdOp: new Date(nu).toISOString(), geverifieerdDoor: userId, historie };
}

export async function afzenderVerifieren(userId: string, i: { adres?: unknown; from?: unknown; naam?: unknown; notitie?: unknown; bevestig?: unknown; ookVerdacht?: unknown }) {
  if (i.bevestig !== true) fout('AFZENDER_BEVESTIG_VEREIST');
  const v = adresVan(i.from || i.adres), adres = v.adres || normaliseerAdres(i.adres);
  if (!geldigAdres(adres)) fout('AFZENDER_ADRES_ONGELDIG');
  const domein = adres.slice(adres.lastIndexOf('@') + 1), naam = tekst(i.naam ?? v.naam, 200);
  const r = await inLade(userId, async (q, lade) => {
    const oud = (await leesRijen(q, lade, [adres], true)).get(adres) || null;
    const contacten = await contactenVan(q, lade);
    const nuKlass = oud?.status === 'verdacht' ? { status: 'verdacht', reden: oud.reden } : classificeer({ naam: naam || v.naam, adres, domein, contacten });
    if (nuKlass.status === 'verdacht' && i.ookVerdacht !== true) fout('AFZENDER_VERDACHT_BEVESTIG', 409);
    const nu = Date.now();
    const basis = oud || samenvoegen(null, { adres, naam, domein, klass: { status: 'onbekend', bron: null, reden: 'NIET_BEVESTIGD', merk: '' }, auth: { betrouwbaar: false, authserv: '', spf: '', spfDomein: '', dkim: [], dmarc: '', dmarcDomein: '', arc: '' }, tijd: 0, telt: false }, nu);
    const nieuw = bewaarInContacten(basis, userId, naam || basis.naam, i.notitie !== undefined ? tekst(i.notitie, 500) : undefined, nu, nuKlass.status === 'verdacht' ? nuKlass.reden : '');
    await schrijfRij(q, lade, nieuw);
    // Стара помилка: `was` тут не існувало (ReferenceError під час ручної верифікації відправника); потрібен статус ДО верифікації.
    // Oude fout: `was` bestond hier niet (ReferenceError bij handmatig verifiëren); bedoeld is de status vóór de verificatie.
    return { nieuw, was: basis.status, ondanks: nuKlass.status === 'verdacht' ? nuKlass.reden : '' };
  });
  await logboek(userId, 'owner.mail.afzender.geverifieerd', adres, { voor: r.was, na: 'geverifieerd', reden: r.ondanks ? `bevestigd ondanks ${r.ondanks}` : undefined });
  return r.nieuw;
}
export async function afzenderIntrekken(userId: string, i: { adres?: unknown; reden?: unknown }) {
  const adres = normaliseerAdres(i.adres);
  if (!geldigAdres(adres)) fout('AFZENDER_ADRES_ONGELDIG');
  const r = await inLade(userId, async (q, lade) => {
    const oud = (await leesRijen(q, lade, [adres], true)).get(adres);
    if (!oud) fout('AFZENDER_NIET_GEVONDEN', 404);
    // Live-audit 19.10 (F5): ook een eigen markering «підозрілий» (HANDMATIG_VERDACHT) moet de gebruiker kunnen opheffen.
    const eigenMarkering = oud!.status === 'verdacht' && oud!.reden === 'HANDMATIG_VERDACHT';
    if (oud!.status !== 'geverifieerd' && !eigenMarkering) fout('AFZENDER_NIET_GEVERIFIEERD', 409);
    const nu = Date.now();
    const nieuw: AfzenderRij = eigenMarkering
      ? { ...oud!, status: 'onbekend', bron: null, reden: 'MARKERING_OPGEHEVEN', geverifieerdOp: null, geverifieerdDoor: null, historie: metHistorie(oud!.historie, { op: 'markering-opgeheven', tijd: nu, door: userId, van: 'verdacht', naar: 'onbekend', reden: tekst(i.reden, 200) || undefined }) }
      : { ...oud!, status: 'onbekend', bron: null, reden: 'INGETROKKEN', geverifieerdOp: null, geverifieerdDoor: null, historie: metHistorie(oud!.historie, { op: 'ingetrokken', tijd: nu, door: userId, van: 'geverifieerd', naar: 'onbekend', reden: tekst(i.reden, 200) || undefined }) };
    await schrijfRij(q, lade, nieuw); return { nieuw, was: oud!.status };
  });
  await logboek(userId, r.was === 'verdacht' ? 'owner.mail.afzender.markering-opgeheven' : 'owner.mail.afzender.ingetrokken', adres, { voor: r.was, na: 'onbekend', reden: tekst(i.reden, 200) || 'door de gebruiker' });
  return r.nieuw;
}
export async function afzenderBijwerken(userId: string, i: { adres?: unknown; naam?: unknown; notitie?: unknown }) {
  const adres = normaliseerAdres(i.adres);
  if (!geldigAdres(adres)) fout('AFZENDER_ADRES_ONGELDIG');
  const r = await inLade(userId, async (q, lade) => {
    const oud = (await leesRijen(q, lade, [adres], true)).get(adres);
    if (!oud) fout('AFZENDER_NIET_GEVONDEN', 404);
    const nieuw: AfzenderRij = { ...oud!, naam: i.naam !== undefined ? tekst(i.naam, 200) : oud!.naam, notitie: i.notitie !== undefined ? tekst(i.notitie, 500) : oud!.notitie, historie: metHistorie(oud!.historie, { op: 'bijgewerkt', tijd: Date.now(), door: userId }) };
    await schrijfRij(q, lade, nieuw); return nieuw;
  });
  await logboek(userId, 'owner.mail.afzender.bijgewerkt', adres);
  return r;
}
/** De afzender stapt over op een nieuw adres: de bevestiging, naam en notitie verhuizen; het oude adres wordt «onbekend». */
export async function afzenderVervangen(userId: string, i: { adres?: unknown; nieuwAdres?: unknown; ookVerdacht?: unknown }) {
  const adres = normaliseerAdres(i.adres), nieuwAdres = normaliseerAdres(i.nieuwAdres);
  if (!geldigAdres(adres) || !geldigAdres(nieuwAdres)) fout('AFZENDER_ADRES_ONGELDIG');
  if (adres === nieuwAdres) fout('AFZENDER_ZELFDE_ADRES');
  const r = await inLade(userId, async (q, lade) => {
    const rijen = await leesRijen(q, lade, [adres, nieuwAdres], true), oud = rijen.get(adres);
    if (!oud) fout('AFZENDER_NIET_GEVONDEN', 404);
    const domein = nieuwAdres.slice(nieuwAdres.lastIndexOf('@') + 1), contacten = await contactenVan(q, lade);
    for (const [k, v] of contacten) contacten.set(k, [...v, nieuwAdres]); // het eigen contact telt niet als «andere afzender met dezelfde naam»
    const klass = classificeer({ naam: oud!.naam, adres: nieuwAdres, domein, contacten });
    if (klass.status === 'verdacht' && i.ookVerdacht !== true) fout('AFZENDER_VERDACHT_BEVESTIG', 409);
    const nu = Date.now(), bestaand = rijen.get(nieuwAdres);
    const doel: AfzenderRij = { ...(bestaand || oud!), adres: nieuwAdres, domein, naam: oud!.naam || bestaand?.naam || '', notitie: oud!.notitie || bestaand?.notitie || '',
      status: oud!.status === 'geverifieerd' ? 'geverifieerd' : (bestaand?.status || 'onbekend'), bron: oud!.status === 'geverifieerd' ? 'handmatig' : (bestaand?.bron || null),
      reden: oud!.status === 'geverifieerd' ? 'HANDMATIG' : (bestaand?.reden || 'NIET_BEVESTIGD'), geverifieerdOp: oud!.status === 'geverifieerd' ? new Date(nu).toISOString() : (bestaand?.geverifieerdOp || null),
      geverifieerdDoor: oud!.status === 'geverifieerd' ? userId : (bestaand?.geverifieerdDoor || null), aantal: bestaand?.aantal || 0, eersteOp: bestaand?.eersteOp || null, laatsteOp: bestaand?.laatsteOp || null, bewijs: bestaand?.bewijs || {},
      historie: metHistorie(bestaand?.historie || [], { op: 'vervangen-van', tijd: nu, door: userId, van: adres }) };
    const verlaten: AfzenderRij = { ...oud!, status: 'onbekend', bron: null, reden: 'INGETROKKEN', geverifieerdOp: null, geverifieerdDoor: null, historie: metHistorie(oud!.historie, { op: 'vervangen-door', tijd: nu, door: userId, naar: nieuwAdres }) };
    await schrijfRij(q, lade, doel); await schrijfRij(q, lade, verlaten);
    return doel;
  });
  await logboek(userId, 'owner.mail.afzender.vervangen', adres, { voor: adresHash(adres), na: adresHash(nieuwAdres) });
  return r;
}
export async function afzenderVerwijderen(userId: string, i: { adres?: unknown }) {
  const adres = normaliseerAdres(i.adres);
  if (!geldigAdres(adres)) fout('AFZENDER_ADRES_ONGELDIG');
  const n = await inLade(userId, async (q, lade) => (await q(`DELETE FROM app.mail_afzenders WHERE ${W(lade)} AND adres = $2`, [userId, adres])).rowCount || 0);
  if (!n) fout('AFZENDER_NIET_GEVONDEN', 404);
  await logboek(userId, 'owner.mail.afzender.verwijderd', adres);
  return { ok: true };
}

// ------------------------------------------------------------------------------------------------ eerste controle (achtergrond, hervatbaar)
type AuditStaat = { staat: 'bezig' | 'gepauzeerd' | 'klaar' | 'fout' | 'nooit'; accountId: string; verwerkt: number; limiet: number; adressen: number; geverifieerd: number; verdacht: number; fout: string; gestartOp: string | null; bijgewerktOp: string | null; klaarOp: string | null; loopt: boolean; vastgelopen: boolean };
const lopend = new Map<string, { stop: boolean; klaar: Promise<void> }>();
const sys = () => getPool('systeem');
export const AUDIT_PAGINA = 50, AUDIT_GELIJKTIJDIG = 5;
let pauzeMs = 300;
/** Alleen voor tests: geen wachttijd tussen pagina's. */
export const zetAuditPauze = (ms: number) => { pauzeMs = ms; };
const slaap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Oranje «не перевірено»-pastilles pas na de eerste VOLLEDIGE controle van bestaande berichten (artefact-draad f252547a, punt 4:
 * «перед тим як увімкнути позначки, пройтися по наявних листах»). Vóór die tijd zou bijna elke rij oranje zijn, ook voor
 * afzenders die de controle zo dadelijk als bekend markeert. Geverifieerd (✓) en verdacht (rood) gelden per bericht en zijn
 * altijd zichtbaar: een vervalsing mag nooit wachten op een audit.
 */
export async function markeringenAan(userId: string): Promise<boolean> {
  try {
    const lade = ladeVereist(userId);
    const r = (await sys().query(`SELECT (SELECT klaar_op FROM app.mail_afzender_audit WHERE ${W(lade)}) AS a,
      (SELECT bool_and(eerste_klaar_op IS NOT NULL) FROM app.mail_contacten_scan WHERE ${W(lade)}) AS b`, [userId])).rows[0];
    return Boolean(r?.a) || r?.b === true;
  } catch { return false; }
}

export async function auditStand(userId: string): Promise<AuditStaat> {
  const lade = ladeVereist(userId);
  const r = (await sys().query(`SELECT * FROM app.mail_afzender_audit WHERE ${W(lade)}`, [userId])).rows[0];
  const loopt = lopend.has(userId);
  if (!r) return { staat: 'nooit', accountId: '', verwerkt: 0, limiet: 0, adressen: 0, geverifieerd: 0, verdacht: 0, fout: '', gestartOp: null, bijgewerktOp: null, klaarOp: null, loopt, vastgelopen: false };
  const vastgelopen = r.staat === 'bezig' && !loopt && Date.now() - new Date(r.bijgewerkt_op).getTime() > 120_000;
  return { staat: r.staat, accountId: r.account_id, verwerkt: r.verwerkt, limiet: r.limiet, adressen: r.adressen, geverifieerd: r.geverifieerd, verdacht: r.verdacht, fout: r.fout, gestartOp: iso(r.gestart_op), bijgewerktOp: iso(r.bijgewerkt_op), klaarOp: iso(r.klaar_op), loopt, vastgelopen };
}
export async function auditStarten(userId: string, i: { accountId?: unknown; limiet?: unknown; hervatten?: unknown }) {
  const lade = ladeVereist(userId);
  if (lopend.has(userId)) return auditStand(userId);
  const accounts = await bron.accounts(userId);
  const accountId = String(i.accountId || '') || accounts[0]?.id || '';
  if (!accountId || !accounts.some((a) => a.id === accountId)) fout('GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED', 409);
  const limiet = Math.min(20000, Math.max(100, Math.floor(Number(i.limiet) || 5000)));
  const huidig = (await sys().query(`SELECT staat, account_id FROM app.mail_afzender_audit WHERE ${W(lade)}`, [userId])).rows[0];
  const hervat = i.hervatten === true && huidig && huidig.staat !== 'klaar' && huidig.account_id === accountId;
  if (hervat) await sys().query(`UPDATE app.mail_afzender_audit SET staat = 'bezig', fout = '', limiet = $2, bijgewerkt_op = now() WHERE ${W(lade)}`, [userId, limiet]);
  else await sys().query(`INSERT INTO app.mail_afzender_audit (user_id, ruimte, account_id, staat, page_token, verwerkt, limiet) VALUES ($1, '${R(lade)}', $2, 'bezig', '', 0, $3)
      ON CONFLICT (user_id, ruimte) DO UPDATE SET account_id = EXCLUDED.account_id, staat = 'bezig', page_token = '', verwerkt = 0, limiet = EXCLUDED.limiet, fout = '', gestart_op = now(), bijgewerkt_op = now(), klaar_op = NULL`, [userId, accountId, limiet]);
  await logboek(userId, 'owner.mail.afzender.audit.gestart', 'audit@mail', { na: { limiet, hervat: !!hervat } });
  const taak = { stop: false, klaar: Promise.resolve() };
  taak.klaar = draaien(userId, accountId, taak).finally(() => { lopend.delete(userId); });
  lopend.set(userId, taak);
  return auditStand(userId);
}
export async function auditStoppen(userId: string) {
  const lade = ladeVereist(userId);
  const t = lopend.get(userId);
  if (t) { t.stop = true; await t.klaar; }
  else await sys().query(`UPDATE app.mail_afzender_audit SET staat = 'gepauzeerd', bijgewerkt_op = now() WHERE ${W(lade)} AND staat = 'bezig'`, [userId]);
  return auditStand(userId);
}
/** Voor tests: wachten tot de lopende controle klaar is. */
export async function auditWachten(userId: string) { await lopend.get(userId)?.klaar; }

// De lade reist mee met de losgekoppelde taak: zij wordt gestart BINNEN de poort (backend/mail-ruimte.ts → metLade), en een
// AsyncLocalStorage volgt de hele belofteketen. `ladeVereist` vindt haar dus ook hier, en vindt zij niets, dan stopt het werk
// met een fout in plaats van in de verkeerde lade te schrijven.
async function draaien(userId: string, accountId: string, taak: { stop: boolean }) {
  const lade = ladeVereist(userId);
  let fouten = 0;
  for (;;) {
    const st = (await sys().query(`SELECT page_token, verwerkt, limiet FROM app.mail_afzender_audit WHERE ${W(lade)}`, [userId])).rows[0];
    if (!st) return;
    if (taak.stop) { await sys().query(`UPDATE app.mail_afzender_audit SET staat = 'gepauzeerd', bijgewerkt_op = now() WHERE ${W(lade)}`, [userId]); return; }
    if (st.verwerkt >= st.limiet) { await afronden(userId); return; }
    try {
      const pagina = await bron.lijst(userId, accountId, st.page_token, Math.min(AUDIT_PAGINA, st.limiet - st.verwerkt));
      const koppen: Array<GmailKop | null> = [];
      for (let i = 0; i < pagina.ids.length; i += AUDIT_GELIJKTIJDIG) {
        koppen.push(...await Promise.all(pagina.ids.slice(i, i + AUDIT_GELIJKTIJDIG).map((id) => bron.kop(userId, accountId, id).catch((e) => { if (/RATE_LIMITED|REAUTH|SCOPE/.test(String((e as Error).message))) throw e; return null; }))));
      }
      // Eén transactie per pagina: wordt de controle onderbroken, dan is deze pagina niet half geteld en begint hij opnieuw.
      await inLade(userId, async (q, lade) => {
        const contacten = await contactenVan(q, lade);
        const ws = koppen.filter(Boolean).map((k) => { const a = adresVan(k!.from); const auth = parseAuthResults(k!.auth); return { a, auth, tijd: k!.tijd }; }).filter((x) => x.a.adres);
        const rijen = await leesRijen(q, lade, [...new Set(ws.map((x) => x.a.adres))], true);
        for (const x of ws) {
          const klass = classificeer({ naam: x.a.naam, adres: x.a.adres, domein: x.a.domein, auth: x.auth, contacten });
          rijen.set(x.a.adres, samenvoegen(rijen.get(x.a.adres) || null, { adres: x.a.adres, naam: x.a.naam, domein: x.a.domein, klass, auth: x.auth, tijd: x.tijd, telt: true }));
        }
        for (const r of rijen.values()) await schrijfRij(q, lade, r);
      });
      const t = (await sys().query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'geverifieerd')::int AS g, count(*) FILTER (WHERE status = 'verdacht')::int AS v FROM app.mail_afzenders WHERE ${W(lade)}`, [userId])).rows[0];
      await sys().query(`UPDATE app.mail_afzender_audit SET page_token = $2, verwerkt = verwerkt + $3, adressen = $4, geverifieerd = $5, verdacht = $6, bijgewerkt_op = now() WHERE ${W(lade)}`,
        [userId, pagina.next, pagina.ids.length, t.n, t.g, t.v]);
      fouten = 0;
      if (!pagina.next || !pagina.ids.length) { await afronden(userId); return; }
      if (pauzeMs) await slaap(pauzeMs);
    } catch (e) {
      const code = /^[A-Z0-9_]{3,60}$/.test(String((e as Error).message)) ? String((e as Error).message) : 'AUDIT_MISLUKT';
      fouten += 1;
      // Punt 15 (0075): ook de oudere controle (app.mail_afzender_audit) gebruikt dezelfde ene definitie van «tijdelijk» en
      // dezelfde ladder uit shared/mail-scan-beleid.ts — anders kan er weer een tweede lijst gaan afwijken (HTTP_502 ontbrak).
      if (isTijdelijkeScanFout(code) && scanMagHerhalen(fouten)) { if (pauzeMs) await slaap(scanBackoffMs(fouten)); continue; }
      await sys().query(`UPDATE app.mail_afzender_audit SET staat = 'fout', fout = $2, bijgewerkt_op = now() WHERE ${W(lade)}`, [userId, code]);
      return;
    }
  }
}
async function afronden(userId: string) {
  const lade = ladeVereist(userId);
  await sys().query(`UPDATE app.mail_afzender_audit SET staat = 'klaar', klaar_op = now(), bijgewerkt_op = now() WHERE ${W(lade)}`, [userId]);
  const s = await auditStand(userId);
  await logboek(userId, 'owner.mail.afzender.audit.klaar', 'audit@mail', { na: { verwerkt: s.verwerkt, adressen: s.adressen, geverifieerd: s.geverifieerd, verdacht: s.verdacht } });
}

// ================================================================================================ «Контакти й відправники» (0074)
// Volledige controle van ALLE adressen in ALLE gekoppelde mailboxen (alle mappen, ook archief en verzonden), alleen metadata.
//  - Hervatbaar per mailbox: na elke pagina staan de contactrijen ÉN de voortgang (paginatoken) in één transactie.
//  - Ontvangen bericht → de afzender (From) met de Authentication-Results van de eigen server; verzonden bericht (label SENT)
//    → de ontvangers (To/Cc/Bcc) tellen als «ви писали». Eigen adressen en concepten tellen niet.
//  - Per nieuw domein DNS-bewijs (bronnen: backend/mail-afzender-bronnen.ts), begrensd per pagina; de rest in een DNS-ronde
//    aan het einde. Na de eerste volledige controle: incrementeel (alleen nieuwere berichten dan het hoogwater).
//  - Start automatisch één keer wanneer de gebruiker de mail opent (POST …/contacten/scan/auto), met zichtbare voortgang en
//    «Пауза» / «Зупинити». Logboek zonder adressen (alleen tellers).
export const SCAN_PAGINA = 50, SCAN_DNS_PER_PAGINA = 8;
let scanPauzeMs = 250;
/** Alleen voor tests: geen wachttijd tussen pagina's. */
export const zetScanPauze = (ms: number) => { scanPauzeMs = ms; };
type ScanTaak = { verzoek: null | 'pauze' | 'stop'; klaar: Promise<void> };
const scanLopend = new Map<string, ScanTaak>();
const autoLaatst = new Map<string, number>();
export type ScanAccountStand = { accountId: string; email: string; staat: string; fase: 'volledig' | 'bijwerken'; verwerkt: number; schatting: number; fout: string; eersteKlaarOp: string | null; bijgewerktOp: string | null; gestartOp: string | null;
  /** 0075: stand van het automatisch herhalen — nummer van de lopende poging en tot wanneer gewacht wordt (ISO). */
  poging: number; wachtTot: string | null };
export type ScanStand = {
  staat: 'nooit' | 'bezig' | 'gepauzeerd' | 'gestopt' | 'klaar' | 'fout' | 'onderbroken'; loopt: boolean; accounts: ScanAccountStand[];
  verwerkt: number; schatting: number; eersteKlaarOp: string | null; bijgewerktOp: string | null; automatisch?: boolean;
  tellers: { contacten: number; geverifieerd: number; verdacht: number; geschreven: number; officieel: number; dns: number };
  /** 0075: de bewaarde keuze «запам'ятати вибір» en het maximum aantal pogingen (zodat de browser dezelfde tekst toont). */
  beleid: ScanBeleid; maxPogingen: number;
};
const scanRij = (r: any): ScanAccountStand => ({ accountId: r.account_id, email: r.account_email || '', staat: r.staat, fase: r.fase, verwerkt: Number(r.verwerkt || 0), schatting: Number(r.schatting || 0), fout: r.fout || '', eersteKlaarOp: iso(r.eerste_klaar_op), bijgewerktOp: iso(r.bijgewerkt_op), gestartOp: iso(r.gestart_op), poging: Number(r.poging || 0), wachtTot: iso(r.wacht_tot) });

export async function contactenScanStand(userId: string): Promise<ScanStand> {
  const loopt = scanLopend.has(userId);
  return inLade(userId, async (q, lade) => {
    const rows = (await q(`SELECT * FROM app.mail_contacten_scan WHERE ${W(lade)} ORDER BY account_email, account_id`, [userId])).rows;
    const t = (await q(`SELECT count(*)::int AS n, count(*) FILTER (WHERE status = 'geverifieerd')::int AS g, count(*) FILTER (WHERE status = 'verdacht')::int AS v,
      count(*) FILTER (WHERE verzonden > 0)::int AS s, count(*) FILTER (WHERE officieel)::int AS o FROM app.mail_afzenders WHERE ${W(lade)}`, [userId])).rows[0];
    const dnsN = Number((await q(`SELECT count(*)::int AS n FROM app.mail_domein_dns WHERE ${W(lade)}`, [userId])).rows[0]?.n || 0);
    const beleid = normaliseerScanBeleid((await q(`SELECT beleid FROM app.mail_contacten_scan_beleid WHERE ${W(lade)}`, [userId])).rows[0]?.beleid);
    const accounts = rows.map(scanRij), st = accounts.map((a) => a.staat);
    // «overgeslagen» (0075, beleid «пропускати проблемні») is géén openstaande beslissing: de controle liep door, dus de stand
    // blijft 'klaar' zolang er niets anders wacht. Welke mailbox overgeslagen is, staat per rij in `accounts`.
    const staat: ScanStand['staat'] = !accounts.length ? 'nooit' : loopt ? 'bezig' : st.includes('fout') ? 'fout' : st.includes('gestopt') ? 'gestopt' : st.includes('gepauzeerd') ? 'gepauzeerd'
      : st.some((s) => s === 'bezig' || s === 'wacht') ? 'onderbroken' : 'klaar';
    const klaar = accounts.every((a) => a.eersteKlaarOp) ? accounts.map((a) => a.eersteKlaarOp!).sort().at(-1) || null : null;
    return { staat, loopt, accounts, verwerkt: accounts.reduce((s, a) => s + a.verwerkt, 0), schatting: accounts.reduce((s, a) => s + a.schatting, 0), eersteKlaarOp: klaar,
      bijgewerktOp: accounts.map((a) => a.bijgewerktOp || '').sort().at(-1) || null,
      tellers: { contacten: t.n, geverifieerd: t.g, verdacht: t.v, geschreven: t.s, officieel: t.o, dns: dnsN }, beleid, maxPogingen: SCAN_MAX_POGINGEN };
  });
}

/**
 * 0075 «запам'ятати вибір»: de bewaarde keuze wat er na een tijdelijke fout gebeurt. Eén rij per gebruiker, onder RLS.
 * Zonder rij: 'automatisch' (zelf verdergaan) — de eigenaar hoeft nooit iets te klikken om verder te gaan.
 */
export async function contactenScanBeleid(userId: string): Promise<ScanBeleid> {
  return inLade(userId, async (q, lade) => normaliseerScanBeleid((await q(`SELECT beleid FROM app.mail_contacten_scan_beleid WHERE ${W(lade)}`, [userId])).rows[0]?.beleid));
}
export async function contactenScanBeleidZetten(userId: string, ruw: unknown): Promise<ScanBeleid> {
  const beleid = normaliseerScanBeleid(ruw);
  await inLade(userId, (q, lade) => q(`INSERT INTO app.mail_contacten_scan_beleid (user_id, ruimte, beleid) VALUES ($1, '${R(lade)}', $2)
    ON CONFLICT (user_id, ruimte) DO UPDATE SET beleid = EXCLUDED.beleid, bijgewerkt_op = now()`, [userId, beleid]));
  await logboek(userId, 'owner.mail.contacten.scan.beleid', 'contacten@mail', { na: { beleid } });
  return beleid;
}

/** Volledige controle starten of hervatten. `opnieuw`: alles opnieuw tellen. `bijwerken`: afgeronde mailboxen incrementeel. */
export async function contactenScanStarten(userId: string, i: { opnieuw?: unknown; bijwerken?: unknown } = {}) {
  if (scanLopend.has(userId)) return contactenScanStand(userId);
  const accounts = await scanBron.accounts(userId);
  if (!accounts.length) fout('GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED', 409);
  const schattingen = new Map<string, { email: string; totaal: number }>();
  for (const a of accounts) { try { schattingen.set(a.id, await scanBron.profiel(userId, a.id)); } catch { /* schatting is optioneel */ } }
  await inLade(userId, async (q, lade) => {
    if (i.opnieuw === true) {
      await q(`DELETE FROM app.mail_contacten_scan WHERE ${W(lade)}`, [userId]);
      await q(`UPDATE app.mail_afzenders SET aantal = 0, verzonden = 0, laatst_verzonden_op = NULL, accounts = '{}', bewijs = bewijs - 'pass' - 'fail' - 'zonder' WHERE ${W(lade)}`, [userId]);
    }
    const bestaand = new Map((await q(`SELECT account_id, staat FROM app.mail_contacten_scan WHERE ${W(lade)}`, [userId])).rows.map((r) => [r.account_id, r.staat]));
    for (const a of accounts) {
      const p = schattingen.get(a.id), email = (p?.email || a.email || '').slice(0, 254), staat = bestaand.get(a.id);
      if (!staat) await q(`INSERT INTO app.mail_contacten_scan (user_id, ruimte, account_id, account_email, staat, fase, schatting) VALUES ($1, '${R(lade)}', $2, $3, 'wacht', 'volledig', $4)`, [userId, a.id, email, p?.totaal || 0]);
      else if (staat === 'klaar') {
        if (i.bijwerken === true) await q(`UPDATE app.mail_contacten_scan SET staat = 'wacht', fase = 'bijwerken', page_token = '', verwerkt = 0, schatting = 0, run_hoogwater = 0, fout = '', poging = 0, wacht_tot = NULL, gestart_op = now(), bijgewerkt_op = now() WHERE ${W(lade)} AND account_id = $2`, [userId, a.id]);
      } else await q(`UPDATE app.mail_contacten_scan SET staat = 'wacht', fout = '', poging = 0, wacht_tot = NULL, account_email = $3, schatting = CASE WHEN fase = 'volledig' AND $4 > 0 THEN $4 ELSE schatting END, bijgewerkt_op = now() WHERE ${W(lade)} AND account_id = $2`, [userId, a.id, email, p?.totaal || 0]);
    }
  });
  await logboek(userId, 'owner.mail.contacten.scan.gestart', 'contacten@mail', { na: { accounts: accounts.length, opnieuw: i.opnieuw === true, bijwerken: i.bijwerken === true } });
  const taak: ScanTaak = { verzoek: null, klaar: Promise.resolve() };
  scanLopend.set(userId, taak);
  taak.klaar = scanDraaien(userId, taak).catch((e) => { console.error('[mail-contacten]', String((e as Error).message).slice(0, 120)); }).finally(() => { scanLopend.delete(userId); });
  return contactenScanStand(userId);
}
/** Pauze (hervatbaar, ook automatisch bij het volgende openen niet) of stop (geen automatische controles meer tot u herstart). */
export async function contactenScanOnderbreken(userId: string, soort: 'pauze' | 'stop') {
  const t = scanLopend.get(userId);
  if (t) { t.verzoek = soort; await t.klaar; }
  await inLade(userId, (q, lade) => q(`UPDATE app.mail_contacten_scan SET staat = $2, bijgewerkt_op = now() WHERE ${W(lade)} AND (staat IN ('wacht', 'bezig') OR ($2 = 'gestopt' AND staat = 'gepauzeerd'))`, [userId, soort === 'pauze' ? 'gepauzeerd' : 'gestopt']));
  await logboek(userId, `owner.mail.contacten.scan.${soort === 'pauze' ? 'gepauzeerd' : 'gestopt'}`, 'contacten@mail');
  return contactenScanStand(userId);
}
/** Voor tests: wachten tot de lopende controle klaar is. */
export async function contactenScanWachten(userId: string) { await scanLopend.get(userId)?.klaar; }

/** Bij het openen van de mail: de eerste keer starten; daarna hervatten na een herstart, nieuwe mailboxen en (≥ 15 min) bijwerken. */
export async function contactenScanAuto(userId: string, nu = Date.now()): Promise<ScanStand> {
  if (scanLopend.has(userId) || nu - (autoLaatst.get(userId) || 0) < 60_000) return contactenScanStand(userId);
  autoLaatst.set(userId, nu);
  let accounts: Array<{ id: string }> = [];
  try { accounts = await scanBron.accounts(userId); } catch { return contactenScanStand(userId); }
  if (!accounts.length) return contactenScanStand(userId);
  const stand = await contactenScanStand(userId), per = new Map(stand.accounts.map((a) => [a.accountId, a]));
  if (stand.accounts.some((a) => a.staat === 'gestopt' || a.staat === 'gepauzeerd')) return stand; // de gebruiker koos zelf
  const nieuw = accounts.some((a) => !per.has(a.id));
  const onderbroken = stand.accounts.some((a) => a.staat === 'bezig' || a.staat === 'wacht');
  // Herstelbare fouten na 1 u opnieuw proberen; een (vermeende) scope-fout na 1 u ook: één verzoek bewijst of die nog geldt (F2).
  const herstelbaar = stand.accounts.some((a) => (a.staat === 'fout' || a.staat === 'overgeslagen')
    && (isTijdelijkeScanFout(a.fout) || /SCOPE_REQUIRED/.test(a.fout)) && nu - Date.parse(a.bijgewerktOp || '') > 3600_000);
  const oud = stand.accounts.length > 0 && stand.accounts.every((a) => a.staat === 'klaar') && nu - Date.parse(stand.bijgewerktOp || '') > 15 * 60_000;
  if (!nieuw && !onderbroken && !herstelbaar && !oud) return stand;
  const s = await contactenScanStarten(userId, { bijwerken: oud && !nieuw && !onderbroken });
  return { ...s, automatisch: true };
}

type Ontvangen = { soort: 'ontvangen'; naam: string; adres: string; domein: string; auth: AuthResultaten; tijd: number };
type Verzonden = { soort: 'verzonden'; naam: string; adres: string; domein: string; tijd: number };
/** Eén bericht → waarnemingen (puur, getest). Concepten en eigen adressen tellen niet. */
export function waarnemingenVan(kop: ScanKop, eigen: ReadonlySet<string>): Array<Ontvangen | Verzonden> {
  if (kop.labels.includes('DRAFT') || kop.labels.includes('CHAT')) return [];
  const van = adresVan(kop.from);
  if (kop.labels.includes('SENT') || (van.adres && eigen.has(van.adres))) {
    return [...adressenVan(kop.to), ...adressenVan(kop.cc), ...adressenVan(kop.bcc)].filter((a, i, l) => !eigen.has(a.adres) && l.findIndex((x) => x.adres === a.adres) === i)
      .slice(0, 50).map((a) => ({ soort: 'verzonden' as const, naam: a.naam, adres: a.adres, domein: a.domein, tijd: kop.tijd }));
  }
  if (!van.adres) return [];
  return [{ soort: 'ontvangen', naam: van.naam, adres: van.adres, domein: van.domein, auth: parseAuthResults(kop.auth), tijd: kop.tijd }];
}
const metAccount = (r: AfzenderRij, accountId: string): AfzenderRij => ((r.accounts || []).includes(accountId) || (r.accounts || []).length >= 20 ? r : { ...r, accounts: [...(r.accounts || []), accountId] });
/** Verzonden waarneming samenvoegen: telt «ви писали»; de status van een bestaande rij verandert niet. */
export function verzondenSamenvoegen(rij: AfzenderRij | null, w: Verzonden, klass: Classificatie, nu = Date.now()): AfzenderRij {
  const tijd = w.tijd > 0 ? new Date(w.tijd).toISOString() : null;
  const basis: AfzenderRij = rij ? { ...rij, bewijs: { ...rij.bewijs }, historie: [...rij.historie] } : {
    adres: w.adres, naam: w.naam, domein: w.domein, status: klass.status === 'verdacht' ? 'verdacht' : 'onbekend', bron: null, reden: klass.status === 'verdacht' ? klass.reden : klass.reden || 'NIET_BEVESTIGD', merk: klass.merk,
    bewijs: {}, eersteOp: null, laatsteOp: null, aantal: 0, notitie: '', historie: [{ op: 'gezien', tijd: nu, door: 'systeem', naar: klass.status === 'verdacht' ? 'verdacht' : 'onbekend', reden: 'VERZONDEN' }],
    geverifieerdOp: null, geverifieerdDoor: null, bijgewerktOp: new Date(nu).toISOString(), ...NIEUWE_VELDEN, accounts: [],
  };
  basis.verzonden = (basis.verzonden || 0) + 1;
  if (tijd && (!basis.laatstVerzondenOp || tijd > basis.laatstVerzondenOp)) basis.laatstVerzondenOp = tijd;
  if (!basis.naam && w.naam) basis.naam = w.naam;
  return basis;
}

async function scanDraaien(userId: string, taak: ScanTaak) {
  const accounts = await scanBron.accounts(userId);
  const eigen = new Set(accounts.map((a) => a.email.toLowerCase()).filter(Boolean));
  const rows = await inLade(userId, async (q, lade) => (await q(`SELECT account_id, account_email, staat FROM app.mail_contacten_scan WHERE ${W(lade)}`, [userId])).rows);
  for (const r of rows) if (r.account_email) eigen.add(String(r.account_email).toLowerCase());
  // 0075: de bewaarde keuze bepaalt of een tijdelijke fout zelf herhaald wordt, overgeslagen wordt of op de gebruiker wacht.
  const beleid = await contactenScanBeleid(userId);
  for (const a of accounts) {
    const r = rows.find((x) => x.account_id === a.id);
    if (!r || !['wacht', 'bezig'].includes(r.staat)) continue;
    await scanAccount(userId, a.id, eigen, taak, beleid);
    if (taak.verzoek) return;
  }
  await dnsRonde(userId, taak);
  if (taak.verzoek) return;
  const s = await contactenScanStand(userId);
  await logboek(userId, 'owner.mail.contacten.scan.klaar', 'contacten@mail', { na: { verwerkt: s.verwerkt, contacten: s.tellers.contacten, geverifieerd: s.tellers.geverifieerd, verdacht: s.tellers.verdacht, geschreven: s.tellers.geschreven, dns: s.tellers.dns } });
}

async function scanAccount(userId: string, accountId: string, eigen: ReadonlySet<string>, taak: ScanTaak, beleid: ScanBeleid = STANDAARD_SCAN_BELEID) {
  const zet = (staat: string, extra = '', params: unknown[] = []) => inLade(userId, (q, lade) => q(`UPDATE app.mail_contacten_scan SET staat = $3${extra}, bijgewerkt_op = now() WHERE ${W(lade)} AND account_id = $2`, [userId, accountId, staat, ...params]));
  await zet('bezig');
  let fouten = 0;
  for (;;) {
    if (taak.verzoek) { await zet(taak.verzoek === 'pauze' ? 'gepauzeerd' : 'gestopt'); return; }
    const st = await inLade(userId, async (q, lade) => (await q(`SELECT page_token, fase, hoogwater FROM app.mail_contacten_scan WHERE ${W(lade)} AND account_id = $2`, [userId, accountId])).rows[0]);
    if (!st) return;
    const hoogwater = Number(st.hoogwater || 0), bijwerken = st.fase === 'bijwerken' && hoogwater > 0;
    try {
      // Gmail «after:» werkt op seconden; een uur overlap en daarna strikt filteren op internalDate > hoogwater: niets dubbel.
      const pagina = await scanBron.lijst(userId, accountId, st.page_token, SCAN_PAGINA, bijwerken ? `after:${Math.max(0, Math.floor(hoogwater / 1000) - 3600)}` : undefined);
      const koppen: Array<ScanKop | null> = [];
      const stilIds: string[] = [];
      for (let i = 0; i < pagina.ids.length; i += AUDIT_GELIJKTIJDIG) {
        koppen.push(...await Promise.all(pagina.ids.slice(i, i + AUDIT_GELIJKTIJDIG).map((id) => scanBron.kop(userId, accountId, id).catch((e) => {
          if (/RATE_LIMITED|REAUTH|SCOPE|NOT_CONNECTED/.test(String((e as Error).message))) throw e;
          stilIds.push(`${accountId}|${id}`);
          return null;
        }))));
      }
      if (stilIds.length) void taakStilBij(userId, stilIds).catch(() => undefined);
      const geldig = koppen.filter((k): k is ScanKop => !!k && (!bijwerken || k.tijd > hoogwater));
      const ws = geldig.flatMap((k) => waarnemingenVan(k, eigen));
      const maxTijd = geldig.reduce((m, k) => Math.max(m, k.tijd || 0), 0);
      // DNS voor een beperkt aantal nieuwe domeinen van deze pagina (buiten de transactie; de rest in de DNS-ronde).
      const domeinen = [...new Set(ws.map((w) => w.domein).filter((d) => d && !isGratisMailbox(d)))];
      const bekend = await inLade(userId, async (q, lade) => new Set((await q(`SELECT domein FROM app.mail_domein_dns WHERE ${W(lade)} AND domein = ANY($2::text[]) AND gecontroleerd_op > now() - interval '24 hours'`, [userId, domeinen])).rows.map((r) => r.domein)));
      const nieuweDns = await beperkt(domeinen.filter((d) => !bekend.has(d)).slice(0, SCAN_DNS_PER_PAGINA), DNS_GELIJKTIJDIG, (d) => domeinDns(d));
      await inLade(userId, async (q, lade) => {
        for (const d of nieuweDns) await slaDnsOp(q, lade, d);
        const contacten = await contactenVan(q, lade);
        const rijen = await leesRijen(q, lade, [...new Set(ws.map((w) => w.adres))], true);
        for (const w of ws) {
          const oud = rijen.get(w.adres) || null;
          if (w.soort === 'ontvangen') {
            const klass = classificeer({ naam: w.naam, adres: w.adres, domein: w.domein, auth: w.auth, contacten });
            rijen.set(w.adres, metAccount(samenvoegen(oud, { adres: w.adres, naam: w.naam, domein: w.domein, klass, auth: w.auth, tijd: w.tijd, telt: true }), accountId));
          } else {
            const klass = oud ? { status: oud.status, bron: oud.bron, reden: oud.reden, merk: oud.merk } as Classificatie : classificeer({ naam: w.naam, adres: w.adres, domein: w.domein, contacten });
            rijen.set(w.adres, metAccount(verzondenSamenvoegen(oud, w, klass), accountId));
          }
        }
        const dnsMap = await leesDns(q, lade, [...rijen.values()].map((r) => r.domein));
        for (const r of rijen.values()) await schrijfRij(q, lade, r, dnsMap.get(r.domein) || null);
        const klaar = !pagina.next || !pagina.ids.length;
        await q(`UPDATE app.mail_contacten_scan SET page_token = $3, verwerkt = verwerkt + $4, run_hoogwater = GREATEST(run_hoogwater, $5), poging = 0, wacht_tot = NULL, fout = '', bijgewerkt_op = now()${klaar
          ? `, staat = 'klaar', hoogwater = GREATEST(hoogwater, run_hoogwater, $5), eerste_klaar_op = COALESCE(eerste_klaar_op, now())` : ''} WHERE ${W(lade)} AND account_id = $2`,
        [userId, accountId, klaar ? '' : pagina.next, pagina.ids.length, maxTijd]);
      });
      fouten = 0;
      if (!pagina.next || !pagina.ids.length) return;
      if (scanPauzeMs) await slaap(scanPauzeMs);
    } catch (e) {
      const code = /^[A-Z0-9_]{3,60}$/.test(String((e as Error).message)) ? String((e as Error).message) : 'SCAN_MISLUKT';
      if (code === 'SCAN_MISLUKT') console.error('[mail-contacten] pagina mislukt:', String((e as { code?: string }).code || ''), String((e as Error).message).slice(0, 160));
      fouten += 1;
      // 0075: één ladder voor élke tijdelijke fout (429, 5xx, quota, time-out) — 2 s, 4 s, 8 s … max 120 s, hoogstens
      // SCAN_MAX_POGINGEN pogingen. De lopende poging en het moment van de volgende staan in de rij, zodat de pagina en de
      // zwevende melding «повторюю через N с, спроба X» kunnen tonen — ook nadat de gebruiker de pagina herlaadt.
      const plan = scanHerhaalPlan(code, fouten, beleid);
      if (plan.soort === 'herhaal') {
        const tot = new Date(Date.now() + plan.wachtMs).toISOString();
        await inLade(userId, (q, lade) => q(`UPDATE app.mail_contacten_scan SET staat = 'bezig', fout = $3, poging = $4, wacht_tot = $5, bijgewerkt_op = now() WHERE ${W(lade)} AND account_id = $2`,
          [userId, accountId, code, plan.poging, tot]));
        // In tests staat scanPauzeMs op 0: dan geen echte wachttijd, maar wél dezelfde ladder en dezelfde stand in de database.
        if (scanPauzeMs) await slaap(plan.wachtMs);
        continue;
      }
      // «пропускати проблемні»: deze mailbox overslaan en de controle met de volgende mailbox laten doorgaan (scanDraaien).
      await inLade(userId, (q, lade) => q(`UPDATE app.mail_contacten_scan SET staat = $3, fout = $4, poging = $5, wacht_tot = NULL, bijgewerkt_op = now() WHERE ${W(lade)} AND account_id = $2`,
        [userId, accountId, plan.soort === 'overslaan' ? 'overgeslagen' : 'fout', code, fouten]));
      return;
    }
  }
}

/** DNS-ronde: domeinen zonder (vers) DNS-bewijs, op alfabet (niet een willekeurige 2000), en het vertrouwen herberekenen. */
async function dnsRonde(userId: string, taak: ScanTaak | null, max = DNS_GRENS): Promise<string[]> {
  // Ook de JOIN blijft binnen één lade: anders zou de technische lade het DNS-bewijs van de persoonlijke zien (of omgekeerd
  // denken dat er nog geen bewijs is). `COALESCE(..., 'prive')` houdt rijen van vóór 0083 persoonlijk.
  const domeinen = (await inLade(userId, async (q, lade) => (await q(`SELECT DISTINCT a.domein FROM app.mail_afzenders a
     LEFT JOIN app.mail_domein_dns d ON d.user_id = a.user_id AND COALESCE(d.ruimte, 'prive') = COALESCE(a.ruimte, 'prive') AND d.domein = a.domein
     WHERE a.user_id = $1 AND COALESCE(a.ruimte, 'prive') = $3 AND (d.domein IS NULL OR d.gecontroleerd_op < now() - interval '24 hours') ORDER BY a.domein LIMIT $2`, [lade.userId, max, R(lade)])).rows.map((r) => String(r.domein))))
    .filter((d) => !isGratisMailbox(d));
  for (let i = 0; i < domeinen.length; i += 20) {
    if (taak?.verzoek) return domeinen.slice(0, i);
    const deel = await beperkt(domeinen.slice(i, i + 20), DNS_GELIJKTIJDIG, (d) => domeinDns(d));
    await inLade(userId, async (q, lade) => {
      for (const d of deel) await slaDnsOp(q, lade, d);
      await herbereken(q, lade, deel);
    });
  }
  return domeinen;
}
async function herbereken(q: Q, lade: Lade, dns: DnsBewijs[]) {
  const per = new Map(dns.map((d) => [d.domein, d]));
  const rows = (await q(`SELECT ${KOLOMMEN} FROM app.mail_afzenders WHERE ${W(lade)} AND domein = ANY($2::text[])`, [lade.userId, [...per.keys()]])).rows;
  for (const r of rows) {
    const rij = naarRij(r), v = vertrouwenVan(contactInvoer(rij, per.get(rij.domein) || null));
    if (v.score !== rij.vertrouwen) await q(`UPDATE app.mail_afzenders SET vertrouwen = $3 WHERE ${W(lade)} AND adres = $2`, [lade.userId, rij.adres, v.score]);
  }
}

// ------------------------------------------------------------------------------------------------ contactenlijst en detail
export const CONTACT_FILTERS = ['geverifieerd', 'onbekend', 'verdacht', 'geschreven', 'officieel', 'contacten'] as const;
export const CONTACT_SORTERINGEN = ['recent', 'naam', 'aantal', 'vertrouwen', 'risico'] as const;
const SORTEER_SQL: Record<string, string> = {
  recent: 'GREATEST(laatste_op, laatst_verzonden_op) DESC NULLS LAST, adres',
  naam: "lower(COALESCE(NULLIF(naam, ''), adres)), adres",
  aantal: '(aantal + verzonden) DESC, adres',
  vertrouwen: 'vertrouwen DESC, GREATEST(laatste_op, laatst_verzonden_op) DESC NULLS LAST, adres',
  risico: "(status = 'verdacht') DESC, vertrouwen ASC, GREATEST(laatste_op, laatst_verzonden_op) DESC NULLS LAST, adres",
};
const FILTER_SQL: Record<string, string> = {
  geverifieerd: "status = 'geverifieerd'", onbekend: "status = 'onbekend'", verdacht: "status = 'verdacht'", geschreven: 'verzonden > 0', officieel: 'officieel', contacten: 'in_contacten',
};
export async function contactenLijst(userId: string, i: { zoek?: unknown; filter?: unknown; sorteer?: unknown; pagina?: unknown; perPagina?: unknown }) {
  const zoek = String(i.zoek || '').trim().toLowerCase().slice(0, 120);
  const filter = (CONTACT_FILTERS as readonly string[]).includes(String(i.filter)) ? String(i.filter) : '';
  const sorteer = (CONTACT_SORTERINGEN as readonly string[]).includes(String(i.sorteer)) ? String(i.sorteer) : 'recent';
  const per = Math.min(100, Math.max(5, Number(i.perPagina) || 30)), pagina = Math.max(1, Math.floor(Number(i.pagina) || 1));
  return inLade(userId, async (q, lade) => {
    const params: unknown[] = [lade.userId]; const zoekWaar = [W(lade)];
    if (zoek) { params.push(`%${zoek.replace(/[%_\\]/g, (c) => `\\${c}`)}%`); zoekWaar.push(`(adres ILIKE $${params.length} OR lower(naam) ILIKE $${params.length} OR domein ILIKE $${params.length})`); }
    const waar = filter ? [...zoekWaar, FILTER_SQL[filter]] : zoekWaar;
    // Tellers per filter binnen de huidige zoekopdracht (de chips tonen hoeveel er bij die zoekterm horen).
    const t = (await q(`SELECT count(*)::int AS alle, ${CONTACT_FILTERS.map((f) => `count(*) FILTER (WHERE ${FILTER_SQL[f]})::int AS ${f}`).join(', ')} FROM app.mail_afzenders WHERE ${zoekWaar.join(' AND ')}`, params)).rows[0];
    const totaal = filter ? Number(t[filter] || 0) : Number(t.alle || 0);
    const lp = [...params, per, (pagina - 1) * per];
    const rows = (await q(`SELECT ${KOLOMMEN} FROM app.mail_afzenders WHERE ${waar.join(' AND ')} ORDER BY ${SORTEER_SQL[sorteer]} LIMIT $${lp.length - 1} OFFSET $${lp.length}`, lp)).rows;
    return { totaal, pagina, perPagina: per, filter, sorteer, tellers: t as Record<string, number>,
      contacten: rows.map((r) => { const x = naarRij(r); return { ...x, historie: undefined, niveau: niveauVoor(x.vertrouwen || 0) }; }) };
  });
}

export async function contactDetail(userId: string, adresRuw: unknown, nu = Date.now()) {
  const adres = normaliseerAdres(adresRuw);
  if (!geldigAdres(adres)) fout('AFZENDER_ADRES_ONGELDIG');
  let { rij, dns } = await inLade(userId, async (q, lade) => {
    const r = (await leesRijen(q, lade, [adres])).get(adres) || null;
    return { rij: r, dns: r ? (await leesDns(q, lade, [r.domein])).get(r.domein) || null : null };
  });
  if (!rij) fout('AFZENDER_NIET_GEVONDEN', 404);
  // Luie DNS-controle: nog geen (verse) DNS voor dit domein → nu opvragen (met time-outs), bewaren en het vertrouwen bijwerken.
  if (!isGratisMailbox(rij!.domein) && (!dns || nu - dns.tijd > 24 * 3600_000)) {
    const d = await domeinDns(rij!.domein, nu);
    dns = d;
    await inLade(userId, async (q, lade) => { await slaDnsOp(q, lade, d); await herbereken(q, lade, [d]); });
  }
  return inLade(userId, async (q, lade) => {
    const r = (await leesRijen(q, lade, [adres])).get(adres)!;
    const inv = contactInvoer(r, dns), v = vertrouwenVan(inv);
    const gratis = isGratisMailbox(r.domein);
    const verwant = (await q(`SELECT adres, naam, domein, status, aantal, verzonden, laatste_op, laatst_verzonden_op, vertrouwen FROM app.mail_afzenders
       WHERE ${W(lade)} AND adres <> $2 AND (($3::text <> '' AND organisatie = $3) OR ($4::text <> '' AND lower(naam) = lower($4)))
       ORDER BY GREATEST(laatste_op, laatst_verzonden_op) DESC NULLS LAST LIMIT 25`, [userId, adres, gratis ? '' : r.organisatie || organisatieDomein(r.domein), r.naam])).rows
      .map((x) => ({ adres: x.adres, naam: x.naam || '', domein: x.domein, status: x.status as AfzenderStatus, aantal: Number(x.aantal || 0), verzonden: Number(x.verzonden || 0), laatsteOp: iso(x.laatste_op), laatstVerzondenOp: iso(x.laatst_verzonden_op), niveau: niveauVoor(Number(x.vertrouwen || 0)) }));
    const mailboxen = (await q(`SELECT account_id, account_email FROM app.mail_contacten_scan WHERE ${W(lade)}`, [userId])).rows;
    const accounts = (r.accounts || []).map((id) => ({ id, email: mailboxen.find((m) => m.account_id === id)?.account_email || '' }));
    return { contact: { ...r, vertrouwen: v.score, niveau: v.niveau, accountsInfo: accounts }, dns, regels: bewijsRegels(inv), verwant };
  }).then(async (uit) => ({ ...uit, huidigAccount: await (scanBron.huidig?.(userId) ?? Promise.resolve('')).catch(() => '') || uit.contact.accounts?.[0] || '' }));
}

export async function contactVerdachtMarkeren(userId: string, i: { adres?: unknown; reden?: unknown; bevestig?: unknown }) {
  if (i.bevestig !== true) fout('AFZENDER_BEVESTIG_VEREIST');
  const adres = normaliseerAdres(i.adres);
  if (!geldigAdres(adres)) fout('AFZENDER_ADRES_ONGELDIG');
  const r = await inLade(userId, async (q, lade) => {
    const oud = (await leesRijen(q, lade, [adres], true)).get(adres);
    if (!oud) fout('AFZENDER_NIET_GEVONDEN', 404);
    const nu = Date.now();
    const nieuw: AfzenderRij = { ...oud!, status: 'verdacht', bron: null, reden: 'HANDMATIG_VERDACHT', geverifieerdOp: null, geverifieerdDoor: null, inContacten: false,
      historie: metHistorie(oud!.historie, { op: 'handmatig-verdacht', tijd: nu, door: userId, van: oud!.status, naar: 'verdacht', reden: tekst(i.reden, 200) || undefined }) };
    await schrijfRij(q, lade, nieuw); return { nieuw, was: oud!.status };
  });
  await logboek(userId, 'owner.mail.afzender.verdacht', adres, { voor: r.was, na: 'verdacht', reden: 'door de gebruiker' });
  return r.nieuw;
}
export async function contactInContacten(userId: string, i: { adres?: unknown; aan?: unknown }) {
  const adres = normaliseerAdres(i.adres);
  if (!geldigAdres(adres)) fout('AFZENDER_ADRES_ONGELDIG');
  const aan = i.aan !== false;
  const r = await inLade(userId, async (q, lade) => {
    const oud = (await leesRijen(q, lade, [adres], true)).get(adres);
    if (!oud) fout('AFZENDER_NIET_GEVONDEN', 404);
    if (aan && oud!.status === 'verdacht') fout('AFZENDER_VERDACHT_CONTACT', 409);
    const nieuw: AfzenderRij = { ...oud!, inContacten: aan, historie: metHistorie(oud!.historie, { op: aan ? 'in-contacten' : 'uit-contacten', tijd: Date.now(), door: userId }) };
    await schrijfRij(q, lade, nieuw); return nieuw;
  });
  await logboek(userId, aan ? 'owner.mail.afzender.contact' : 'owner.mail.afzender.geen-contact', adres);
  return r;
}

// ------------------------------------------------------------------------------------------------ черга (блок 5)
/** Одна пачка з 25 адрес за раз, до `rondes` пачок. Перегляд — зі збереженого доказу, без Gmail. Лише «Повторити підозрілі» ще раз читає листи, які раніше впали. */
export async function contactenTaakLopen(userId: string, soortRuw: unknown, rondes = 1) {
  const soort = taakSoort(soortRuw);
  if (!soort) fout('TAAK_SOORT');
  await taakStart(userId, soort);
  let laatste = await taakLezen(userId, soort);
  const max = Math.min(8, Math.max(1, rondes));
  for (let ronde = 0; ronde < max && laatste.staat === 'bezig'; ronde++) {
    laatste = await inLade(userId, async (q, lade) => {
      const status = soort === 'verdacht' ? 'verdacht' : 'onbekend';
      const extra = soort === 'verdacht' ? ` AND reden <> 'HANDMATIG_VERDACHT'` : soort === 'rest' ? ` AND NOT (bewijs ? 'laatste')` : '';
      const rows = (await q(`SELECT ${KOLOMMEN} FROM app.mail_afzenders WHERE ${W(lade)} AND status = $2 AND adres > $3${extra} ORDER BY adres LIMIT 25`, [lade.userId, status, laatste.cursor || ''])).rows;
      let gewijzigd = 0;
      let cursor = laatste.cursor;
      for (const raw of rows) {
        const rij = naarRij(raw);
        cursor = rij.adres;
        const nieuw = herbeoordeelUitBewijs(rij);
        const statusAnders = nieuw.status !== rij.status || nieuw.reden !== rij.reden;
        const versieAnders = (nieuw.bewijs?.regelVersie || 0) !== (rij.bewijs?.regelVersie || 0);
        if (statusAnders || versieAnders) await schrijfRij(q, lade, nieuw);
        if (statusAnders) gewijzigd += 1;
      }
      return taakBijwerken(userId, soort, { cursor, verwerkt: laatste.verwerkt + rows.length, gewijzigd: laatste.gewijzigd + gewijzigd, staat: rows.length < 25 ? 'klaar' : 'bezig' });
    });
  }
  if (soort === 'verdacht' && laatste.stil.length) {
    const pogingen: Array<{ id: string; ok: boolean }> = [];
    for (const id of laatste.stil.slice(0, 25)) {
      const streep = id.indexOf('|');
      const accountId = streep > 0 ? id.slice(0, streep) : '';
      const messageId = streep > 0 ? id.slice(streep + 1) : '';
      if (!accountId || !messageId) { pogingen.push({ id, ok: false }); continue; }
      try {
        const kop = await scanBron.kop(userId, accountId, messageId);
        pogingen.push({ id, ok: kop != null });
      } catch (e) {
        if (/RATE_LIMITED|REAUTH|SCOPE|NOT_CONNECTED/.test(String((e as Error).message))) break;
        pogingen.push({ id, ok: false });
      }
    }
    if (pogingen.length) laatste = await taakBijwerken(userId, soort, { stil: herhaalVerdacht(laatste.stil, pogingen) });
  }
  if (soort === 'rest') {
    const domeinen = await dnsRonde(userId, null, 40).catch(() => [] as string[]);
    if (domeinen.length) laatste = await taakBijwerken(userId, soort, { dnsCursor: domeinen[domeinen.length - 1] });
  }
  return laatste;
}

// ------------------------------------------------------------------------------------------------ routes
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
export function mailAfzenderRoutes(deps: { requireSession: RequireSession }): Record<string, RouterMiddleware[]> {
  const route = (run: (body: Record<string, unknown>, userId: string) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.service !== 'mail' || auth.user.status !== 'approved') return error('OWNER_MAIL_SESSION_REQUIRED', 403);
    const body = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>;
    try { return json({ ok: true, ...(await run(body, auth.user.id) as object) }); }
    catch (e) {
      if (e instanceof AfzenderFout) return error(e.code, e.status);
      // Zonder lade is dit verzoek niet door de ruimtepoort gekomen: dat is een fout van de site, geen reden om gegevens te geven.
      if (e instanceof MailRuimteFout) { console.error('[mail-afzenders] ruimtepoort ontbreekt op een route'); return error(e.code, e.status); }
      const code = String((e as Error).message || '');
      if (/^GOOGLE_MAIL_[A-Z_]+$/.test(code)) return error(code, code === 'GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED' ? 409 : 502);
      console.error('[mail-afzenders]', code.slice(0, 120)); return error('AFZENDER_FOUT', 500);
    }
  }) as RouterMiddleware;
  return {
    'POST /api/owner/mail/afzenders/status': [route(async (b, u) => ({ items: await afzenderStatus(u, Array.isArray(b.items) ? b.items as StatusItem[] : []), markeringen: await markeringenAan(u) }))],
    'POST /api/owner/mail/afzenders/controle': [route(async (b, u) => ({ controle: await berichtControle(u, String(b.accountId || ''), String(b.messageId || ''), b.from) }))],
    'POST /api/owner/mail/afzenders/nu': [route(async (b, u) => ({ nu: await afzenderNu(u, b) }))],
    'POST /api/owner/mail/afzenders/lijst': [route(async (b, u) => afzendersLijst(u, b))],
    'POST /api/owner/mail/afzenders/detail': [route(async (b, u) => ({ afzender: await afzenderDetail(u, b.adres) }))],
    'POST /api/owner/mail/afzenders/verifieren': [route(async (b, u) => ({ afzender: await afzenderVerifieren(u, b) }))],
    'POST /api/owner/mail/afzenders/intrekken': [route(async (b, u) => ({ afzender: await afzenderIntrekken(u, b) }))],
    'POST /api/owner/mail/afzenders/bijwerken': [route(async (b, u) => ({ afzender: await afzenderBijwerken(u, b) }))],
    'POST /api/owner/mail/afzenders/vervangen': [route(async (b, u) => ({ afzender: await afzenderVervangen(u, b) }))],
    'POST /api/owner/mail/afzenders/verwijderen': [route(async (b, u) => afzenderVerwijderen(u, b))],
    'POST /api/owner/mail/afzenders/audit/start': [route(async (b, u) => ({ audit: await auditStarten(u, b) }))],
    'POST /api/owner/mail/afzenders/audit/status': [route(async (_b, u) => ({ audit: await auditStand(u) }))],
    'POST /api/owner/mail/afzenders/audit/stop': [route(async (_b, u) => ({ audit: await auditStoppen(u) }))],
    // «Контакти й відправники» (0074)
    'POST /api/owner/mail/contacten/lijst': [route(async (b, u) => contactenLijst(u, b))],
    'POST /api/owner/mail/contacten/detail': [route(async (b, u) => contactDetail(u, b.adres))],
    'POST /api/owner/mail/contacten/verdacht': [route(async (b, u) => ({ afzender: await contactVerdachtMarkeren(u, b) }))],
    'POST /api/owner/mail/contacten/contact': [route(async (b, u) => ({ afzender: await contactInContacten(u, b) }))],
    'POST /api/owner/mail/contacten/scan/status': [route(async (_b, u) => ({ scan: await contactenScanStand(u) }))],
    'POST /api/owner/mail/contacten/scan/start': [route(async (b, u) => ({ scan: await contactenScanStarten(u, { opnieuw: b.opnieuw, bijwerken: b.bijwerken }) }))],
    'POST /api/owner/mail/contacten/scan/auto': [route(async (_b, u) => ({ scan: await contactenScanAuto(u) }))],
    'POST /api/owner/mail/contacten/scan/pauze': [route(async (_b, u) => ({ scan: await contactenScanOnderbreken(u, 'pauze') }))],
    'POST /api/owner/mail/contacten/scan/stop': [route(async (_b, u) => ({ scan: await contactenScanOnderbreken(u, 'stop') }))],
    'POST /api/owner/mail/contacten/taak/start': [route(async (b, u) => ({ taak: await contactenTaakLopen(u, b.soort, 4) }))],
    'POST /api/owner/mail/contacten/taak/pauze': [route(async (b, u) => { const s = taakSoort(b.soort); if (!s) fout('TAAK_SOORT'); return { taak: await taakPauze(u, s) }; })],
    'POST /api/owner/mail/contacten/taak/stop': [route(async (b, u) => { const s = taakSoort(b.soort); if (!s) fout('TAAK_SOORT'); return { taak: await taakStop(u, s) }; })],
    'POST /api/owner/mail/contacten/taak/stand': [route(async (b, u) => { const s = taakSoort(b.soort); if (!s) fout('TAAK_SOORT'); return { taak: await taakLezen(u, s) }; })],
    // 0075: de bewaarde keuze «запам'ятати вибір» (zonder `beleid` in de body: alleen lezen).
    'POST /api/owner/mail/contacten/scan/beleid': [route(async (b, u) => ({
      beleid: b.beleid === undefined ? await contactenScanBeleid(u) : await contactenScanBeleidZetten(u, b.beleid),
      scan: await contactenScanStand(u),
    }))],
  };
}
