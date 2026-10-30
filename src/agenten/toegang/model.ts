// «Доступи» (contract 0.6 §3/§4): puur model, zonder React of netwerk. Zet de antwoorden van de bestaande routes (agents/overzicht,
// mcp/tokens/list, agents/list, ai/grants/list, agents/extensie-status) en de nieuwe beheerroute (agents/extensie-beheer) om naar
// één lijst «wat heeft de gebruiker aan AI's gegeven», per methode. Onbekende of kapotte velden vallen weg (veilige richting).
import { BROWSER_CAPS, MAX_DAGEN, MAX_MINUTEN } from '../../../shared/extensie-ontgrendeling';

export type Ruimte = 'prive' | 'technisch';
export type T2 = readonly [uk: string, nl: string];
export const ruimteVan = (v: unknown): Ruimte => (v === 'technisch' ? 'technisch' : 'prive');

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v ? (/^\d+$/.test(v) ? Number(v) : new Date(v).getTime()) : NaN; return Number.isFinite(n) && n > 0 ? n : null; };
const lijst = (v: unknown, max = 40): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 120).slice(0, max) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const HOST = /^[a-z0-9.-]{1,80}$/;
const hosts = (v: unknown) => lijst(v).map((h) => h.toLowerCase()).filter((h) => HOST.test(h));

/** Hosts van de privéruimte (contract §2: hub, mail, cloud, ai, id, github, huis, mcp; nooit admin.*). */
export const PRIVE_HOSTS_STANDAARD = Object.freeze(['hub', 'mail', 'cloud', 'ai', 'id', 'github', 'huis', 'mcp'].map((d) => `${d}.tarasevych.com`));
export const PRIVE_DAGEN = Object.freeze([1, 7, 30] as const);
export const TECH_MINUTEN = Object.freeze([15, 30, 60, 120, 240, 480] as const);
/** Plafond van het beleid. 366 dagen / 366×24×60 min = «без обмеження» (de server verlengt «handmatig»). */
export const BELEID_MAX_DAGEN = Object.freeze([1, 7, 30, 182, 365, MAX_DAGEN] as const);
export const BELEID_MAX_MINUTEN = Object.freeze([15, 30, 60, 120, 240, 480, 1440, 10080, 43200, MAX_MINUTEN] as const);

// ------------------------------------------------------------------------------------------------ mogelijkheden in mensentaal
export const CAP_MENS: Readonly<Record<string, T2>> = Object.freeze({
  'browser.read': ['читати сторінки', 'pagina’s lezen'],
  'browser.navigate': ['відкривати сторінки', 'pagina’s openen'],
  'browser.interact': ['натискати й вводити', 'klikken en typen'],
  'browser.screenshot': ['робити знімки екрана', 'schermafbeeldingen maken'],
  'browser.debug': ['глибока діагностика', 'diepe diagnose'],
  'machine.read': ['читати файли й стан пристрою', 'bestanden en status van het apparaat lezen'],
  'machine.write': ['записувати файли', 'bestanden schrijven'],
  'machine.exec': ['запускати дозволені програми', 'toegestane programma’s starten'],
  'machine.docker': ['керувати Docker', 'Docker beheren'],
});
export const capMens = (c: string): T2 => CAP_MENS[c] ?? [c, c];
export const ALLE_BROWSER_CAPS: readonly string[] = BROWSER_CAPS;

export type Methode = 'connector' | 'token' | 'apparaat' | 'extensie' | 'lokaal';
export const METHODEN: readonly Methode[] = ['connector', 'token', 'apparaat', 'extensie', 'lokaal'];
export const METHODE_TEKST: Readonly<Record<Methode, { naam: T2; uitleg: T2 }>> = Object.freeze({
  connector: { naam: ['Конектори ШІ', 'AI-connectors'], uitleg: ['ШІ (Claude, Grok…) підключено через вхід OAuth.', 'AI (Claude, Grok…) gekoppeld via OAuth-aanmelding.'] },
  token: { naam: ['Токени', 'Tokens'], uitleg: ['Ключ, який ви самі видали агентові.', 'Een sleutel die u zelf aan een agent gaf.'] },
  apparaat: { naam: ['Пристрої (агент на ПК)', 'Apparaten (pc-agent)'], uitleg: ['Що ШІ може робити на вашому комп’ютері.', 'Wat de AI op uw computer mag doen.'] },
  extensie: { naam: ['Розширення браузера', 'Browserextensie'], uitleg: ['Що ШІ може робити у вашому браузері, окремо для профілю користувача й технічного.', 'Wat de AI in uw browser mag, apart voor het gebruikers- en het technische profiel.'] },
  lokaal: { naam: ['Локальний агент', 'Lokale agent'], uitleg: ['Програма на цьому комп’ютері читає сторінки через розширення (лише читання).', 'Een programma op deze computer leest pagina’s via de extensie (alleen lezen).'] },
});

// ------------------------------------------------------------------------------------------------ bronnen (genormaliseerd)
export type Oauth = { id: string; naam: string; scope: string; ruimte: Ruimte; sinds: number | null; laatst: number | null; tot: number | null };
export type Token = { id: string; naam: string; prefix: string; scopes: string[]; ruimte: Ruimte; sinds: number | null; laatst: number | null; tot: number | null };
export type Apparaat = { id: string; naam: string; platform: string; online: boolean; ruimte: Ruimte };
export type Grant = { id: string; agentId: string; cap: string; domeinen: string[]; altijd: boolean; tot: number };
export type Ontgrendeling = { gid: string; caps: string[]; domeinen: string[]; lokaal: boolean; begin: number | null; eind: number; rollen: string[] };
export type Slot = { agentId: string; naam: string; ruimte: Ruimte; online: boolean; versie: string; staat: string; ontgrendeling: Ontgrendeling | null; aiVerbonden: boolean; lokaalVerbonden: boolean; laatstGezien: number | null };
export type Recht = {
  prive: { mag: boolean; code?: string; caps: string[]; maxDagen: number };
  technisch: { mag: boolean; code?: string; rollen: string[]; caps: string[]; activatieTot: number | null; passkeys: number } | null;
};
export type ExtStatus = { sloten: Slot[]; recht: Recht; nu: number };

export function normOauth(v: unknown): Oauth[] {
  return (Array.isArray(v) ? v : []).map(obj).filter((g) => str(g.id) && g.status === 'active' && !g.revokedAt)
    .map((g) => ({ id: str(g.id, 80), naam: str(g.clientName, 80) || 'AI', scope: str(g.scope, 400), ruimte: ruimteVan(g.ruimte), sinds: num(g.createdAt), laatst: num(g.lastUsedAt), tot: num(g.expiresAt) }));
}
export function normTokens(v: unknown, nu: number): Token[] {
  return (Array.isArray(v) ? v : []).map(obj).filter((t) => str(t.id) && !t.revokedAt && (num(t.expiresAt) ?? 0) > nu)
    .map((t) => ({ id: str(t.id, 80), naam: str(t.name, 80) || 'agent', prefix: str(t.prefix, 24), scopes: Array.isArray(t.scopes) ? lijst(t.scopes) : str(t.scopes, 400).split(/[\s,]+/).filter(Boolean), ruimte: ruimteVan(t.ruimte), sinds: num(t.createdAt), laatst: num(t.lastSeenAt), tot: num(t.expiresAt) }));
}
export function normApparaten(v: unknown): Apparaat[] {
  return (Array.isArray(v) ? v : []).map(obj).filter((a) => str(a.id))
    .map((a) => ({ id: str(a.id, 80), naam: str(a.name, 80) || '—', platform: str(a.platform, 40), online: a.status === 'connected', ruimte: ruimteVan(a.ruimte) }));
}
export function normGrants(v: unknown, nu: number): Grant[] {
  const g = obj(v).grants;
  return (Array.isArray(g) ? g : []).map(obj).filter((x) => str(x.id) && str(x.agentId) && !x.revokedAt && (num(x.expiresAt) ?? 0) > nu)
    .map((x) => ({ id: str(x.id, 80), agentId: str(x.agentId, 80), cap: str(x.capability, 40), domeinen: hosts(x.domains), altijd: x.always === true, tot: num(x.expiresAt) ?? 0 }));
}
export function normOntgrendeling(v: unknown): Ontgrendeling | null {
  const o = obj(v);
  const eind = num(o.eind);
  if (!str(o.gid) || !eind) return null;
  return { gid: str(o.gid, 80), caps: lijst(o.caps).filter((c) => ALLE_BROWSER_CAPS.includes(c)), domeinen: hosts(o.domeinen), lokaal: o.lokaal === true, begin: num(o.begin), eind, rollen: lijst(o.rollen) };
}
function normSlot(v: unknown, browserNaam = ''): Slot | null {
  const s = obj(v);
  const agentId = str(s.agentId, 80);
  if (!agentId) return null;
  return {
    agentId, naam: str(s.naam, 80) || browserNaam || 'Browser', ruimte: ruimteVan(s.ruimte), online: s.online === true, versie: str(s.versie, 20), staat: str(s.staat, 20) || 'onbekend',
    ontgrendeling: normOntgrendeling(s.ontgrendeling), aiVerbonden: obj(s.ai).verbonden === true, lokaalVerbonden: obj(s.lokaal).verbonden === true, laatstGezien: num(s.laatstGezien),
  };
}
/** extensie-status 0.6 (`agenten` met ruimte, of `browsers[].sloten`) en 0.5 (`recht.magOntgrendelen` = alleen technisch). */
export function normExtStatus(v: unknown): ExtStatus {
  const d = obj(v);
  const sloten: Slot[] = [];
  for (const a of Array.isArray(d.agenten) ? d.agenten : []) { const s = normSlot(a); if (s) sloten.push(s); }
  for (const b of Array.isArray(d.browsers) ? d.browsers : []) {
    const bo = obj(b);
    const sl = Array.isArray(bo.sloten) ? bo.sloten : Object.values(obj(bo.sloten));
    for (const x of sl) { const s = normSlot(x, str(bo.naam, 80)); if (s && !sloten.some((y) => y.agentId === s.agentId)) sloten.push(s); }
  }
  const r = obj(d.recht);
  const p = obj(r.prive), t = r.technisch === null ? null : obj(r.technisch);
  const oud = typeof r.magOntgrendelen === 'boolean';
  const recht: Recht = {
    prive: { mag: p.mag === true, code: str(p.code, 40) || undefined, caps: lijst(p.caps), maxDagen: Math.max(1, Math.min(30, Number(p.maxDagen) || 30)) },
    technisch: oud
      ? { mag: r.magOntgrendelen === true, code: str(r.code, 40) || undefined, rollen: lijst(r.rollen), caps: lijst(r.caps), activatieTot: num(r.activatieTot), passkeys: Number(r.passkeys) || 0 }
      : t && Object.keys(t).length ? { mag: t.mag === true, code: str(t.code, 40) || undefined, rollen: lijst(t.rollen), caps: lijst(t.caps), activatieTot: num(t.activatieTot), passkeys: Number(t.passkeys) || 0 } : null,
  };
  return { sloten, recht, nu: num(d.nu) ?? Date.now() };
}

// ------------------------------------------------------------------------------------------------ één lijst «Мої доступи»
export type Doel =
  | { soort: 'oauth'; id: string }
  | { soort: 'token'; id: string }
  | { soort: 'grants'; agentId: string }
  | { soort: 'ontgrendeling'; agentId: string; gid: string; ruimte: Ruimte; domeinen: string[]; lokaal: boolean; caps: string[] };
export type ToegangRij = {
  sleutel: string; methode: Methode; ruimte: Ruimte; naam: string;
  /** Wat de AI mag (mensentaal). */ wat: T2[];
  /** Waar: diensten of domeinen. */ waar: T2[];
  tot: number | null; sinds: number | null; online: boolean | null;
  /** Vergrendeld: er zijn toestemmingen, maar de extensie doet niets tot de gebruiker opent. */ dicht?: boolean;
  doel: Doel; details: Array<[string, string]>;
};

const PRIVE_WAAR: T2[] = [['ваш простір: пошта, диск, дошка, календар, GitHub, пристрої — лише увімкнене в «Доступ ШІ»', 'uw ruimte: mail, Drive, bord, agenda, GitHub, apparaten — alleen wat aan staat bij «AI-toegang»']];
const TECH_WAAR: T2[] = [['керування сайтом і сервером (технічний простір)', 'beheer van site en server (technische ruimte)']];
const waarRuimte = (r: Ruimte) => (r === 'technisch' ? TECH_WAAR : PRIVE_WAAR);
const hostT2 = (h: string): T2 => [h, h];
const SCOPE_MENS: Record<string, T2> = {
  'mcp:read': ['читати', 'lezen'], 'mcp:write': ['змінювати', 'wijzigen'], 'mcp:tools': ['користуватися інструментами', 'hulpmiddelen gebruiken'],
  read: ['читати', 'lezen'], write: ['змінювати', 'wijzigen'], tools: ['користуватися інструментами', 'hulpmiddelen gebruiken'],
};
const scopeMens = (s: string): T2 => SCOPE_MENS[s] ?? CAP_MENS[s] ?? [s, s];

export function bouwRijen(b: { oauth: Oauth[]; tokens: Token[]; apparaten: Apparaat[]; grants: Grant[]; ext: ExtStatus | null }, nu = Date.now()): ToegangRij[] {
  const uit: ToegangRij[] = [];
  for (const g of b.oauth) {
    const scopes = g.scope.split(/[\s,]+/).filter(Boolean);
    uit.push({ sleutel: `oauth:${g.id}`, methode: 'connector', ruimte: g.ruimte, naam: g.naam, wat: scopes.length ? scopes.map(scopeMens) : [['користуватися інструментами вашого простору', 'hulpmiddelen van uw ruimte gebruiken']],
      waar: waarRuimte(g.ruimte), tot: g.tot, sinds: g.sinds, online: null, doel: { soort: 'oauth', id: g.id }, details: [['scope', g.scope || '—'], ['id', g.id]] });
  }
  for (const t of b.tokens) {
    uit.push({ sleutel: `token:${t.id}`, methode: 'token', ruimte: t.ruimte, naam: t.naam, wat: t.scopes.length ? t.scopes.slice(0, 12).map(scopeMens) : [['користуватися інструментами вашого простору', 'hulpmiddelen van uw ruimte gebruiken']],
      waar: waarRuimte(t.ruimte), tot: t.tot, sinds: t.sinds, online: null, doel: { soort: 'token', id: t.id }, details: [['prefix', `${t.prefix}…`], ['id', t.id]] });
  }
  const sloten = b.ext?.sloten ?? [];
  const slotIds = new Set(sloten.map((s) => s.agentId));
  const grantsVan = (id: string) => b.grants.filter((g) => g.agentId === id && g.tot > nu);
  for (const a of b.apparaten) {
    if (a.platform === 'browser' || slotIds.has(a.id)) continue;
    const gs = grantsVan(a.id);
    if (!gs.length) continue;
    uit.push({ sleutel: `apparaat:${a.id}`, methode: 'apparaat', ruimte: a.ruimte, naam: a.naam, wat: [...new Set(gs.map((g) => g.cap))].map(capMens),
      waar: [['цей пристрій: лише дозволені теки й програми', 'dit apparaat: alleen toegestane mappen en programma’s']], tot: Math.max(...gs.map((g) => g.tot)), sinds: null, online: a.online,
      doel: { soort: 'grants', agentId: a.id }, details: gs.map((g) => [capMens(g.cap)[1], new Date(g.tot).toISOString()] as [string, string]) });
  }
  // Browsers die (nog) niet in extensie-status staan maar wel toestemmingen hebben (bijv. status kon niet laden).
  const browserIds = new Set([...slotIds, ...b.apparaten.filter((a) => a.platform === 'browser').map((a) => a.id)]);
  for (const id of browserIds) {
    const s = sloten.find((x) => x.agentId === id);
    const a = b.apparaten.find((x) => x.id === id);
    const ruimte = s?.ruimte ?? a?.ruimte ?? 'prive';
    const naam = s?.naam ?? a?.naam ?? 'Browser';
    const o = s?.ontgrendeling && s.ontgrendeling.eind > nu ? s.ontgrendeling : null;
    const gs = grantsVan(id);
    if (o) {
      uit.push({ sleutel: `extensie:${id}`, methode: 'extensie', ruimte, naam, wat: o.caps.map(capMens), waar: o.domeinen.map(hostT2), tot: o.eind, sinds: o.begin, online: s?.online ?? null,
        doel: { soort: 'ontgrendeling', agentId: id, gid: o.gid, ruimte, domeinen: o.domeinen, lokaal: o.lokaal, caps: o.caps },
        details: [['gid', o.gid], ...(o.rollen.length ? [['rollen', o.rollen.join(', ')] as [string, string]] : []), ...(s?.versie ? [['versie', s.versie] as [string, string]] : [])] });
      if (o.lokaal) {
        uit.push({ sleutel: `lokaal:${id}`, methode: 'lokaal', ruimte, naam: `${naam} · Native Messaging`, wat: [capMens('browser.read')], waar: o.domeinen.map(hostT2), tot: o.eind, sinds: o.begin,
          online: s?.lokaalVerbonden ?? null, doel: { soort: 'ontgrendeling', agentId: id, gid: o.gid, ruimte, domeinen: o.domeinen, lokaal: true, caps: o.caps }, details: [['gid', o.gid]] });
      }
    } else if (gs.length && ruimte === 'prive') {
      uit.push({ sleutel: `extensie:${id}`, methode: 'extensie', ruimte, naam, wat: [...new Set(gs.map((g) => g.cap))].map(capMens),
        waar: [...new Set(gs.flatMap((g) => g.domeinen))].map(hostT2), tot: Math.max(...gs.map((g) => g.tot)), sinds: null, online: s?.online ?? a?.online ?? null, dicht: true,
        doel: { soort: 'grants', agentId: id }, details: gs.map((g) => [capMens(g.cap)[1], new Date(g.tot).toISOString()] as [string, string]) });
    }
  }
  return uit;
}

// ------------------------------------------------------------------------------------------------ beheer «Усі користувачі»
export type Beleid = {
  priveAan: boolean; technischAan: boolean; priveCaps: string[] | null; technischCaps: string[] | null;
  priveMaxDagen: number; technischMaxMinuten: number; lokaalAan: boolean; notitie: string; gewijzigdDoor: string; gewijzigdOp: number | null;
};
export const STANDAARD_BELEID: Beleid = Object.freeze({ priveAan: true, technischAan: true, priveCaps: null, technischCaps: null, priveMaxDagen: 30, technischMaxMinuten: 480, lokaalAan: true, notitie: '', gewijzigdDoor: '', gewijzigdOp: null }) as Beleid;
export type BeheerBrowser = { agentId: string; naam: string; ruimte: Ruimte; online: boolean; versie: string; ontgrendeling: Ontgrendeling | null };
export type BeheerGebruiker = { userId: string; email: string; naam: string; techProfiel: boolean; eigenaar: boolean; beleid: Beleid; browsers: BeheerBrowser[] };

const veld = (o: Record<string, unknown>, camel: string, snake: string) => (camel in o ? o[camel] : o[snake]);
const capsOfNull = (v: unknown): string[] | null => (v === null || v === undefined ? null : lijst(v).filter((c) => ALLE_BROWSER_CAPS.includes(c)));
export function normBeleid(v: unknown): Beleid {
  const o = obj(v);
  const b = (c: string, s: string, std: boolean) => { const x = veld(o, c, s); return typeof x === 'boolean' ? x : std; };
  const n = (c: string, s: string, std: number, min: number, max: number) => { const x = Number(veld(o, c, s)); return Number.isFinite(x) && x >= min ? Math.min(max, Math.round(x)) : std; };
  return {
    priveAan: b('priveAan', 'prive_aan', true), technischAan: b('technischAan', 'technisch_aan', true),
    priveCaps: capsOfNull(veld(o, 'priveCaps', 'prive_caps')), technischCaps: capsOfNull(veld(o, 'technischCaps', 'technisch_caps')),
    priveMaxDagen: n('priveMaxDagen', 'prive_max_dagen', 30, 1, MAX_DAGEN), technischMaxMinuten: n('technischMaxMinuten', 'technisch_max_minuten', 480, 15, MAX_MINUTEN),
    lokaalAan: b('lokaalAan', 'lokaal_aan', true), notitie: str(veld(o, 'notitie', 'notitie'), 500), gewijzigdDoor: str(veld(o, 'gewijzigdDoor', 'gewijzigd_door'), 120), gewijzigdOp: num(veld(o, 'gewijzigdOp', 'gewijzigd_op')),
  };
}
export function normBeheer(v: unknown): BeheerGebruiker[] {
  const g = obj(v).gebruikers;
  return (Array.isArray(g) ? g : []).map(obj).filter((u) => str(u.userId)).map((u) => ({
    userId: str(u.userId, 80), email: str(u.email, 160), naam: str(u.naam, 120), techProfiel: u.techProfiel === true, eigenaar: u.eigenaar === true || u.isEigenaar === true,
    beleid: normBeleid(u.beleid),
    browsers: (Array.isArray(u.browsers) ? u.browsers : []).map(obj).filter((x) => str(x.agentId)).map((x) => ({
      agentId: str(x.agentId, 80), naam: str(x.naam, 80) || 'Browser', ruimte: ruimteVan(x.ruimte), online: x.online === true, versie: str(x.versie, 20), ontgrendeling: normOntgrendeling(x.ontgrendeling),
    })),
  }));
}
/** Wat naar POST …/extensie-beheer/beleid gaat: alleen de velden van het beleid (camelCase, zoals de andere routes). */
export const beleidVelden = (b: Beleid) => ({
  priveAan: b.priveAan, technischAan: b.technischAan, priveCaps: b.priveCaps, technischCaps: b.technischCaps, priveMaxDagen: b.priveMaxDagen,
  technischMaxMinuten: b.technischMaxMinuten, lokaalAan: b.lokaalAan, notitie: b.notitie.slice(0, 500),
});

/** Zoeken/filter in «Усі користувачі». */
export type BeheerFilter = 'alle' | 'open' | 'tech' | 'geblokkeerd';
export function filterGebruikers(lijst: BeheerGebruiker[], zoek: string, filter: BeheerFilter, nu = Date.now()): BeheerGebruiker[] {
  const q = zoek.trim().toLowerCase();
  return lijst.filter((u) => {
    if (q && !`${u.email} ${u.naam}`.toLowerCase().includes(q)) return false;
    if (filter === 'open') return u.browsers.some((b) => !!b.ontgrendeling && b.ontgrendeling.eind > nu);
    if (filter === 'tech') return u.techProfiel;
    if (filter === 'geblokkeerd') return !u.beleid.priveAan || !u.beleid.technischAan;
    return true;
  });
}

/** Keuzes die een nieuwe rij niet eerder laten eindigen dan `tot` (0 = geen lopende ontgrendeling). */
export function nietKorter(keuzes: readonly number[], eenheidMs: number, tot: number | null, nu = Date.now()): number[] {
  const rest = Math.max(0, (tot ?? 0) - nu);
  return keuzes.filter((n) => n * eenheidMs + 60_000 >= rest);
}
export const ONBEPAALD_MS = 10 * 365 * 86_400_000;
/** «ще 2 год 5 хв» / «nog 2 u 5 min»; verlopen → «закінчився». */
export function restTijd(tot: number | null, nu = Date.now()): T2 {
  if (!tot) return ['без строку', 'zonder einde'];
  const ms = tot - nu;
  if (ms >= ONBEPAALD_MS) return ['безстроково', 'onbepaald'];
  if (ms <= 0) return ['закінчився', 'verlopen'];
  const min = Math.ceil(ms / 60000);
  if (min < 60) return [`ще ${min} хв`, `nog ${min} min`];
  const u = Math.floor(min / 60), m = min % 60;
  if (u < 48) return [`ще ${u} год${m ? ` ${m} хв` : ''}`, `nog ${u} u${m ? ` ${m} min` : ''}`];
  const d = Math.floor(u / 24);
  return [`ще ${d} дн.`, `nog ${d} dagen`];
}
