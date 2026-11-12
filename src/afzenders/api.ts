// Afzenderstatus in de browser: verzamelt de afzenders van de zichtbare rijen, vraagt ze in één keer op (≤ 100 per verzoek)
// en bewaart ze 5 minuten. Een rij gebruikt `useAfzender(from, messageId, accountId)`; geen eigen verzoek per rij.
import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import type { AfzenderBron, AfzenderStatus, BewijsRegel, DnsBewijs, VertrouwensNiveau } from '../../shared/mail-afzenders';
import { normaliseerScanBeleid, type ScanBeleid } from '../../shared/mail-scan-beleid';
import type { ScanVoorkeur } from '../../shared/contacten-scan-voorkeuren';

export type AfzenderInfo = { adres: string; naam: string; domein: string; status: AfzenderStatus; bron: AfzenderBron | null; reden: string; merk: string; opgeslagen: boolean; bericht?: 'auth-mislukt' | ''; notitie?: string };
export const mailContext = () => ({ service: 'mail', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

const TTL = 5 * 60_000;
const cache = new Map<string, { v: AfzenderInfo; t: number }>();
const wachtrij = new Map<string, { from: string; messageId: string; accountId: string }>();
const bezig = new Set<string>();
const luisteraars = new Set<() => void>();
let timer = 0;
/** Oranje «не перевірено» pas na de eerste volledige controle (server: markeringenAan). Tot het eerste antwoord: uit. */
let markeringen = false;
const sleutel = (from: string, messageId = '') => `${from.trim().toLowerCase()}|${messageId}`;
const melden = () => { for (const l of luisteraars) l(); };

async function verzenden() {
  timer = 0;
  const deel = [...wachtrij.entries()].slice(0, 100);
  for (const [k] of deel) { wachtrij.delete(k); bezig.add(k); }
  if (wachtrij.size) timer = window.setTimeout(() => void verzenden(), 30);
  if (!deel.length) return;
  try {
    const r = await api.post('/api/owner/mail/afzenders/status', { ...mailContext(), items: deel.map(([, v]) => v) });
    const items = (r.data?.items || []) as AfzenderInfo[];
    if (typeof r.data?.markeringen === 'boolean') markeringen = r.data.markeringen;
    deel.forEach(([k], i) => { if (items[i]) cache.set(k, { v: items[i], t: Date.now() }); });
  } catch { /* stil: zonder antwoord geen pastille (nooit een vals «перевірено») */ }
  finally { for (const [k] of deel) bezig.delete(k); melden(); }
}
function vraag(from: string, messageId: string, accountId: string) {
  const k = sleutel(from, messageId), c = cache.get(k);
  if ((c && Date.now() - c.t < TTL) || bezig.has(k) || wachtrij.has(k)) return;
  wachtrij.set(k, { from, messageId, accountId });
  if (!timer) timer = window.setTimeout(() => void verzenden(), 60);
}
const abonneer = (l: () => void) => { luisteraars.add(l); return () => { luisteraars.delete(l); }; };

/** Status van de afzender van één bericht; `null` zolang die nog niet bekend is. */
export function useAfzender(from: string | undefined, messageId = '', accountId = ''): AfzenderInfo | null {
  const k = sleutel(from || '', messageId);
  const v = useSyncExternalStore(abonneer, () => cache.get(k)?.v || null, () => null);
  useEffect(() => { if (from) vraag(from, messageId, accountId); }, [from, messageId, accountId, v === null]);
  return v;
}
/** Of de oranje «не перевірено»-pastilles al aan staan (pas na de eerste volledige controle van bestaande berichten). */
export function useMarkeringenAan(): boolean {
  return useSyncExternalStore(abonneer, () => markeringen, () => false);
}
/** Na een afgeronde controle: pastilles meteen aan, zonder te wachten op het volgende statusverzoek. */
export function markeringenZetten(aan: boolean) { markeringen = aan; melden(); }
/** Na een wijziging (bevestigd, ingetrokken, verwijderd): alle gecachte regels van dit adres bijwerken of laten vervallen. */
export function afzenderGewijzigd(adres: string, nieuw?: Partial<AfzenderInfo>) {
  for (const [k, c] of cache) if (c.v.adres === adres) {
    if (nieuw) cache.set(k, { v: { ...c.v, ...nieuw, bericht: nieuw.status === 'geverifieerd' ? '' : c.v.bericht }, t: Date.now() }); else cache.delete(k);
  }
  melden();
}
/** Alleen voor tests / harness. */
export const _afzenderCache = { leeg: () => { cache.clear(); wachtrij.clear(); bezig.clear(); markeringen = false; melden(); } };

export type AuthUit = { betrouwbaar: boolean; authserv: string; spf: string; dkim: Array<{ uitslag: string; domein: string }>; dmarc: string; dmarcDomein: string } | null;
export const afzenderApi = {
  controle: (from: string, messageId: string, accountId: string) => api.post('/api/owner/mail/afzenders/controle', { ...mailContext(), from, messageId, accountId }).then((r) => r.data.controle as { adres: string; domein: string; naam?: string; auth: AuthUit; classificatie: { status: AfzenderStatus; reden: string; merk: string } | null }),
  nu: (b: { from?: string; adres?: string; messageId?: string; accountId?: string }) => api.post('/api/owner/mail/afzenders/nu', { ...mailContext(), ...b }).then((r) => r.data.nu as { adres: string; domein: string; auth: AuthUit; classificatie: { status: AfzenderStatus; reden: string; merk: string } | null; dns: unknown; uitlegUk: string; uitlegNl: string; gratis: boolean }),
  verifieren: (b: { from?: string; adres?: string; naam?: string; notitie?: string; ookVerdacht?: boolean }) => api.post('/api/owner/mail/afzenders/verifieren', { ...mailContext(), ...b, bevestig: true }).then((r) => r.data.afzender),
  intrekken: (adres: string, reden = '') => api.post('/api/owner/mail/afzenders/intrekken', { ...mailContext(), adres, reden }).then((r) => r.data.afzender),
  bijwerken: (adres: string, b: { naam?: string; notitie?: string }) => api.post('/api/owner/mail/afzenders/bijwerken', { ...mailContext(), adres, ...b }).then((r) => r.data.afzender),
  vervangen: (adres: string, nieuwAdres: string, ookVerdacht = false) => api.post('/api/owner/mail/afzenders/vervangen', { ...mailContext(), adres, nieuwAdres, ookVerdacht }).then((r) => r.data.afzender),
  verwijderen: (adres: string) => api.post('/api/owner/mail/afzenders/verwijderen', { ...mailContext(), adres }),
  lijst: (b: { zoek?: string; status?: string; pagina?: number; perPagina?: number }) => api.post('/api/owner/mail/afzenders/lijst', { ...mailContext(), ...b }).then((r) => r.data),
  detail: (adres: string) => api.post('/api/owner/mail/afzenders/detail', { ...mailContext(), adres }).then((r) => r.data.afzender),
  auditStart: (b: { hervatten?: boolean; limiet?: number } = {}) => api.post('/api/owner/mail/afzenders/audit/start', { ...mailContext(), ...b }).then((r) => r.data.audit),
  auditStatus: () => api.post('/api/owner/mail/afzenders/audit/status', mailContext()).then((r) => r.data.audit),
  auditStop: () => api.post('/api/owner/mail/afzenders/audit/stop', mailContext()).then((r) => r.data.audit),
};
export const foutCode = (e: unknown) => String((e as { response?: { data?: { error?: string; reasonCode?: string } } })?.response?.data?.error || (e as { response?: { data?: { reasonCode?: string } } })?.response?.data?.reasonCode || (e as Error)?.message || 'AFZENDER_FOUT');

// ------------------------------------------------------------------------------------------------ «Контакти й відправники» (0074)
export type ContactRij = {
  adres: string; naam: string; domein: string; status: AfzenderStatus; bron: AfzenderBron | null; reden: string; merk: string; aantal: number; verzonden: number;
  laatsteOp: string | null; laatstVerzondenOp: string | null; eersteOp: string | null; notitie: string; inContacten: boolean; officieel: boolean; organisatie: string;
  vertrouwen: number; niveau: VertrouwensNiveau; accounts: string[]; bijgewerktOp: string; geverifieerdOp: string | null;
  historie?: Array<{ op: string; tijd: number; door: string; van?: string; naar?: string; reden?: string }>;
  bewijs?: { laatste?: { spf: string; dmarc: string; dkim: string; tijd: number; authserv?: string; dkimDomein?: string; dmarcDomein?: string; spfDomein?: string; arc?: string }; pass?: number; fail?: number; verdachtePogingen?: number };
};
export type ContactFilter = '' | 'geverifieerd' | 'onbekend' | 'verdacht' | 'geschreven' | 'officieel' | 'contacten';
export type ContactSortering = 'recent' | 'naam' | 'aantal' | 'vertrouwen' | 'risico';
export type ContactLijst = { totaal: number; pagina: number; perPagina: number; filter: ContactFilter; sorteer: ContactSortering; tellers: Record<string, number>; contacten: ContactRij[] };
export type ContactVerwant = { adres: string; naam: string; domein: string; status: AfzenderStatus; aantal: number; verzonden: number; laatsteOp: string | null; laatstVerzondenOp: string | null; niveau: VertrouwensNiveau };
export type ContactDetail = { contact: ContactRij & { accountsInfo: Array<{ id: string; email: string }> }; dns: DnsBewijs | null; regels: BewijsRegel[]; verwant: ContactVerwant[]; huidigAccount: string };
export type ScanStand = {
  staat: 'nooit' | 'bezig' | 'gepauzeerd' | 'gestopt' | 'klaar' | 'fout' | 'onderbroken'; loopt: boolean; automatisch?: boolean;
  accounts: Array<{ accountId: string; email: string; staat: string; fase: 'volledig' | 'bijwerken'; verwerkt: number; schatting: number; fout: string; eersteKlaarOp: string | null; bijgewerktOp: string | null;
    /** 0075: stand van het automatisch herhalen van deze mailbox (nummer van de poging, moment van de volgende poging). */
    poging?: number; wachtTot?: string | null }>;
  verwerkt: number; schatting: number; eersteKlaarOp: string | null; bijgewerktOp: string | null;
  tellers: { contacten: number; geverifieerd: number; verdacht: number; geschreven: number; officieel: number; dns: number };
  /** 0075: de bewaarde keuze «запам'ятати вибір» en hoeveel pogingen de server doet. */
  beleid?: ScanBeleid; maxPogingen?: number;
  gekoppeld?: Array<{ accountId: string; email: string; voorkeur: ScanVoorkeur }>;
};
export const contactenApi = {
  lijst: (b: { zoek?: string; filter?: ContactFilter; sorteer?: ContactSortering; pagina?: number; perPagina?: number }) => api.post('/api/owner/mail/contacten/lijst', { ...mailContext(), ...b }).then((r) => r.data as ContactLijst),
  detail: (adres: string) => api.post('/api/owner/mail/contacten/detail', { ...mailContext(), adres }).then((r) => r.data as ContactDetail),
  verdacht: (adres: string) => api.post('/api/owner/mail/contacten/verdacht', { ...mailContext(), adres, bevestig: true }).then((r) => r.data.afzender),
  contact: (adres: string, aan: boolean) => api.post('/api/owner/mail/contacten/contact', { ...mailContext(), adres, aan }).then((r) => r.data.afzender),
  scanStatus: () => api.post('/api/owner/mail/contacten/scan/status', mailContext()).then((r) => r.data.scan as ScanStand),
  scanStart: (b: { opnieuw?: boolean; bijwerken?: boolean; accountIds?: string[] } = {}) => api.post('/api/owner/mail/contacten/scan/start', { ...mailContext(), ...b }).then((r) => r.data.scan as ScanStand),
  scanAuto: (accountIds?: string[]) => api.post('/api/owner/mail/contacten/scan/auto', { ...mailContext(), ...(accountIds ? { accountIds } : {}) }).then((r) => r.data.scan as ScanStand),
  scanVoorkeur: (accountId: string, voorkeur: ScanVoorkeur) => api.post('/api/owner/mail/contacten/scan/voorkeur', { ...mailContext(), accountId, voorkeur }).then((r) => r.data.scan as ScanStand),
  scanPauze: () => api.post('/api/owner/mail/contacten/scan/pauze', mailContext()).then((r) => r.data.scan as ScanStand),
  scanStop: () => api.post('/api/owner/mail/contacten/scan/stop', mailContext()).then((r) => r.data.scan as ScanStand),
  taakStart: (soort: 'onbekend' | 'rest' | 'verdacht') => api.post('/api/owner/mail/contacten/taak/start', { ...mailContext(), soort }).then((r) => r.data.taak),
  /** 0075 «запам'ятати вибір»: zonder argument alleen lezen, met argument bewaren. */
  scanBeleid: (beleid?: ScanBeleid) => api.post('/api/owner/mail/contacten/scan/beleid', { ...mailContext(), ...(beleid ? { beleid } : {}) })
    .then((r) => ({ beleid: normaliseerScanBeleid(r.data.beleid), scan: r.data.scan as ScanStand })),
};

/** Gedeelde scanstand voor de melding, de weergave en de instellingen (één poll tegelijk, alleen zolang de controle loopt). */
let scan: ScanStand | null = null;
const scanLuisteraars = new Set<() => void>();
let scanTimer = 0, pollMislukt = 0;
// BUG-002: vroeger stopte één HTTP_502 of time-out op …/scan/status het bijhouden stil (de stand bleef op «loopt» hangen). Nu:
// opnieuw vragen met een groeiende pauze (2,5 → 30 s), hoogstens 12 keer na elkaar; de laatst bekende stand blijft staan.
const POLL_MS = 2500, POLL_MAX_MS = 30_000, POLL_MAX_MISLUKT = 12;
function plannenPoll(wachtMs: number) {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    void contactenApi.scanStatus().then((st) => { pollMislukt = 0; zetScanStand(st); }).catch(() => {
      pollMislukt++;
      if (scan?.loopt && pollMislukt < POLL_MAX_MISLUKT) plannenPoll(Math.min(POLL_MAX_MS, POLL_MS * 2 ** pollMislukt));
    });
  }, wachtMs);
}
export function zetScanStand(s: ScanStand | null) {
  // Een antwoord zonder `automatisch` (status) wist de vlag van …/scan/auto niet zolang dezelfde run loopt.
  if (s && scan?.automatisch && !s.automatisch && s.loopt) s = { ...s, automatisch: true };
  scan = s; for (const l of scanLuisteraars) l();
  window.clearTimeout(scanTimer);
  if (s && s.loopt) plannenPoll(POLL_MS);
}
export function useScanStand(): ScanStand | null {
  return useSyncExternalStore((l) => { scanLuisteraars.add(l); return () => { scanLuisteraars.delete(l); }; }, () => scan, () => null);
}

/** Naar «Контакти й відправники» (optioneel met één adres open). Het adres gaat via sessionStorage, nooit in de URL. */
export const CONTACT_OPEN_SLEUTEL = 'tsv:mail-contact-open';
export async function openContacten(adres = '', lang: 'uk' | 'nl' = 'uk') {
  try { if (adres) sessionStorage.setItem(CONTACT_OPEN_SLEUTEL, adres); else sessionStorage.removeItem(CONTACT_OPEN_SLEUTEL); } catch { /* optioneel */ }
  try {
    const { writeLocalTab } = await import('../canoniek-navigatie');
    writeLocalTab('mail', 'contacts', lang);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new CustomEvent('tsv:mail-contact-open', { detail: { adres } }));
  } catch { /* buiten de app (harness) */ }
}
export function neemContactOpen(): string {
  try { const a = sessionStorage.getItem(CONTACT_OPEN_SLEUTEL) || ''; sessionStorage.removeItem(CONTACT_OPEN_SLEUTEL); return a; } catch { return ''; }
}
/** «Відкрити листи від нього»: de mail zoekt in alle mail op from:/to: dit adres (via het bestaande hervat-mechanisme van de
 *  mail, sessionStorage + resume_context — het adres staat niet in de URL). */
export function openLijstVan(adres: string, accountId: string, richting: 'van' | 'naar' = 'van') {
  const query = `${richting === 'van' ? 'from' : 'to'}:${adres}`;
  try {
    sessionStorage.setItem('tsv:cognitive-resume-pending:mail', JSON.stringify({ id: '', service: 'mail', accountId, tab: 'all', containerId: '', resourceId: '', query, scrollTop: 0, viewMode: 'mail-search-all', path: [], draftId: '', viewerPosition: '', density: 'normal', updatedAt: Date.now() }));
    const u = new URL(location.href); u.pathname = '/all'; u.search = ''; u.hash = ''; u.searchParams.set('resume_context', '1');
    location.assign(u.toString());
  } catch { /* buiten de app */ }
}

// ================================================================================================ gescheiden gegevensruimtes (0083)
// «In welke ruimte zit ik nu, en waarom is dit leeg?» Twee dingen die het scherm moet kunnen zeggen:
//   1. de STAND, uit /api/owner/mail/ruimte (die route geeft nooit post, en blijft leesbaar als de dienst uit of bevroren is);
//   2. de WEIGERING van een gewoon postverzoek — de poort antwoordt met 403 en een tweetalige uitleg. Die vangen we hier op,
//      zodat de lijsten een eerlijke uitleg tonen in plaats van een leeg vlak dat er normaal uitziet.
export type RuimteDienstStand = {
  ok: boolean; dienst: 'mail' | 'contacten'; naam: { uk: string; nl: string }; ruimte: 'prive' | 'technisch'; gedeeld: boolean;
  stand: 'eigen' | 'gedeeld' | 'uit' | 'bevroren'; standNaam?: { uk: string; nl: string }; code?: string; uitleg: { uk: string; nl: string };
};
export type RuimteStand = {
  mail: RuimteDienstStand; contacten: RuimteDienstStand; technischeMailboxen: string[];
  omvang?: { mail: Array<{ tabel: string; rijen: number }>; contacten: Array<{ tabel: string; rijen: number }> };
};

let ruimte: RuimteStand | null = null;
const ruimteLuisteraars = new Set<() => void>();
const ruimteMelden = () => { for (const l of ruimteLuisteraars) l(); };
/** De stand ophalen. Mislukt dat, dan blijft de vorige stand staan: nooit een verzonnen «alles in orde». */
export async function ruimteStandLaden(): Promise<RuimteStand | null> {
  try {
    const r = await api.post('/api/owner/mail/ruimte', mailContext());
    ruimte = { mail: r.data.mail, contacten: r.data.contacten, technischeMailboxen: r.data.technischeMailboxen || [], ...(r.data.omvang ? { omvang: r.data.omvang } : {}) };
  } catch { /* stil: de band verschijnt dan niet, en er wordt niets beloofd */ }
  ruimteMelden();
  return ruimte;
}
export function useRuimteStand(): RuimteStand | null {
  useEffect(() => { if (!ruimte) void ruimteStandLaden(); }, []);
  return useSyncExternalStore((l) => { ruimteLuisteraars.add(l); return () => { ruimteLuisteraars.delete(l); }; }, () => ruimte, () => null);
}
/** De codes waarmee de ruimtepoort weigert (backend/ruimte-scheiding.ts). Alles anders is een gewone fout. */
export const RUIMTE_CODES = ['KEUZE_ONTBREEKT', 'DIENST_UIT', 'BEVROREN', 'DIENST_ONBEKEND', 'GEEN_GEBRUIKER'] as const;
export type RuimteWeigering = { code: string; dienst: string; uitleg: { uk: string; nl: string } };
/** Is deze fout een weigering van de ruimtepoort? Dan hoort het scherm de uitleg te tonen, niet «нічого не знайдено». */
export function ruimteWeigeringVan(e: unknown): RuimteWeigering | null {
  const d = (e as { response?: { status?: number; data?: { error?: string; dienst?: string; uitleg?: { uk: string; nl: string } } } })?.response;
  const code = String(d?.data?.error || '');
  if (d?.status !== 403 || !(RUIMTE_CODES as readonly string[]).includes(code) || !d?.data?.uitleg) return null;
  // Meteen de verse stand ophalen: dan klopt de band ook als de rechten net zijn weggevallen.
  void ruimteStandLaden();
  return { code, dienst: String(d.data.dienst || ''), uitleg: d.data.uitleg };
}
