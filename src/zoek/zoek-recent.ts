// Recente zoekopdrachten van de bovenbalk (zoekronde 02.11.2026; INTEG-001 03.11.2026: met TYPE): alleen op dit apparaat
// (localStorage, altijd met try/catch) en per aangemeld account (de sleutel bevat de gebruikers-id), zodat een gedeelde browser
// de zoekopdrachten van een ander account niet toont. Zonder bekend account wordt niets bewaard. Wissen kan met één knop in het
// uitklapvenster van het zoekveld.
//
// Een rij heeft een TYPE (`soort`): 'zoek' = een getypte zoekopdracht (opnieuw uitvoeren in het venster), 'functie' en 'pagina' =
// een rechtstreeks gekozen functie/pagina van de site (opent opnieuw rechtstreeks, met de route erbij). Er worden GEEN titels van
// resultaten uit persoonlijke bronnen (onderwerp van een e-mail, bestandsnaam) bewaard: alleen wat de gebruiker zelf typte en de
// namen van functies/pagina's van de site zelf. Oudere rijen zonder `soort` gelden als 'zoek'.
//
// ORCH-001 (05.11.2026): een lijst PER RUIMTE van het tabblad. In het technische profiel gekozen pagina's (admin.*, api.*, de
// technische tabbladen van mcp.*) horen niet als rechtstreekse link in de privéruimte van hetzelfde account — de twee ruimtes zijn
// gescheiden (src/gedeelde-voorkeuren.ts houdt per tabblad bij in welke ruimte het staat). De privéruimte houdt de oude sleutel
// (`mr-zoek-recent:<id>`, bestaande lijsten blijven), het technische profiel krijgt `mr-zoek-recent:<id>:technisch`.
//
// Na de onafhankelijke controle (05.11.2026): de ruimte volgt de TECHNISCHE ACTIVERING van dit tabblad, niet het uiterlijk.
// Het uiterlijk (tsv-weergave-ruimte) is alleen op beheerpagina's technisch; op hub, mail, id of mcp/agents met een actief profiel
// toont de zoeker toch technische resultaten (admin/sso), en die kwamen zo in de privélijst. Daarom:
//  1. ZoekGlobaal bepaalt de ruimte bij het OPENEN van het menu (recentRuimteVoor: de activering; terwijl de status na F5 nog
//     laadt, de laatst bekende ruimte van dit tabblad) en gebruikt die ene ruimte voor lezen, bewaren en wissen;
//  2. een route naar een technische plek (isTechRoute: admin.*, api.*, elk tabblad van mcp.* buiten de hub «Підключення ШІ», het
//     tabblad #technisch van die hub) komt ALTIJD in de technische lijst, ook als de ruimte op dat moment 'gebruiker' is;
//  3. zulke rijen in de privélijst (bewaard vóór de scheiding, toen er één lijst was) worden daar niet meer getoond en verdwijnen
//     bij het volgende bewaren.
import { ZOEK_ROUTE_HOSTS, type ZoekRoute } from '../../shared/zoek-model';
import type { Categorie } from './zoek-logica';

export type RecentSoort = 'zoek' | 'functie' | 'pagina';
export const RECENT_SOORTEN: readonly RecentSoort[] = ['zoek', 'functie', 'pagina'];
export type RecenteZoekopdracht = { vraag: string; sectie: Categorie; tijd: number; soort: RecentSoort; route?: ZoekRoute };
/** Extra gegevens bij het bewaren: het type en (bij een functie/pagina) de route om opnieuw rechtstreeks te openen. */
export type RecentExtra = { soort?: RecentSoort; route?: ZoekRoute | null };
export const RECENT_MAX = 8;
export const RECENT_VRAAG_MAX = 300;
const CATEGORIEEN: readonly string[] = ['all', 'mail', 'files', 'paginas', 'instellingen', 'agenda', 'github', 'bord', 'overig'];
const HOSTS: readonly string[] = ZOEK_ROUTE_HOSTS;

type Opslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
let gebruiker = '';

/** Wordt aangeroepen zodra de gebruiker bekend is (useSessieGebruiker); null/leeg = niet aangemeld → niets bewaren. */
export function zetZoekGebruiker(id: string | null | undefined): void {
  gebruiker = typeof id === 'string' ? id.trim().slice(0, 80) : '';
}
/** De huidige gebruiker voor de zoekgeheugens (leeg = niet aangemeld). */
export const zoekGebruiker = (): string => gebruiker;

/** Per tabblad (sessionStorage): de laatst bekende ruimte van de zoeker. Alleen voor het eerste beeld na F5, zolang de status van het
 *  technische profiel nog laadt; daarna beslist de activering zelf (recentRuimteVoor). Niet de hint van het uiterlijk: die is op
 *  privépagina's 'gebruiker', ook met een actief technisch profiel. */
export const RECENT_RUIMTE_HINT = 'mr-zoek-ruimte';
export type RecentRuimte = 'gebruiker' | 'technisch';
/** Wat de zoeker van het technische profiel van DIT tabblad weet (src/tech/tech-opslag.ts: `geladen` en profielVan()). */
export type RecentTechStand = { geladen: boolean; technisch: boolean };
type SessieOpslag = Pick<Storage, 'getItem' | 'setItem'>;
const sessieOpslag = (): SessieOpslag | null => {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
};
/** De laatst bekende ruimte van dit tabblad; zonder hint (of geblokkeerde opslag) de privéruimte. */
export const recentRuimteNu = (opslag: Pick<Storage, 'getItem'> | null = sessieOpslag()): RecentRuimte => {
  try { return opslag?.getItem(RECENT_RUIMTE_HINT) === 'technisch' ? 'technisch' : 'gebruiker'; } catch { return 'gebruiker'; }
};
/** De ruimte voor de lijst. Status geladen → de activering van dit tabblad (en die wordt onthouden voor F5); status nog niet geladen
 *  (net na F5) → de laatst bekende. Een technische route gaat daarnaast altijd naar de technische lijst (bewaarRecent). */
export function recentRuimteVoor(t: RecentTechStand, opslag: SessieOpslag | null = sessieOpslag()): RecentRuimte {
  if (!t.geladen) return recentRuimteNu(opslag);
  const r: RecentRuimte = t.technisch ? 'technisch' : 'gebruiker';
  try { if (opslag && opslag.getItem(RECENT_RUIMTE_HINT) !== r) opslag.setItem(RECENT_RUIMTE_HINT, r); } catch { /* privémodus: alleen niet onthouden */ }
  return r;
}
export const recentSleutel = (id: string, ruimte: RecentRuimte = recentRuimteNu()): string =>
  (id ? (ruimte === 'technisch' ? `mr-zoek-recent:${id}:technisch` : `mr-zoek-recent:${id}`) : '');

/** Tabbladen van mcp.* voor iedereen: de hub «Підключення ШІ» (agents) en wat daarheen doorstuurt (overview, connect; shared/ai-agent-bord.ts
 *  → mcpIngang). Als tabblad-id of als pad (slug uit public/canonical-service.js). Elk ander tabblad van mcp.* is technisch. */
const MCP_PRIVE: ReadonlySet<string> = new Set(['', '/', 'agents', '/agenten', 'overview', '/overzicht', 'connect', '/verbinden']);
/** Een route naar een technische plek: admin.*, api.*, mcp.* buiten de hub, of het tabblad #technisch van de hub. Twijfel → technisch
 *  (dan ontbreekt de rij hooguit in de privélijst; omgekeerd zou een technische link in de privéruimte staan). */
export function isTechRoute(r: ZoekRoute | null | undefined): boolean {
  if (!r) return false;
  if (r.host === 'admin' || r.host === 'api') return true;
  if (r.host !== 'mcp') return false;
  const hash = String(r.hash || '').replace(/^#/, '').split(/[/?]/)[0];
  return !MCP_PRIVE.has(String(r.pad || '')) || hash === 'technisch';
}

const standaardOpslag = (): Opslag | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

/** Een route uit de opslag controleren: vorm en lengtes (de echte URL maakt routeUrl() later nog eens veilig: alleen hosts van de site). */
const leesRoute = (v: unknown): ZoekRoute | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  if (typeof r.host !== 'string' || !HOSTS.includes(r.host) || typeof r.pad !== 'string' || r.pad.length > 500) return undefined;
  const params: Record<string, string> = {};
  if (r.params && typeof r.params === 'object') for (const [k, x] of Object.entries(r.params as Record<string, unknown>)) if (/^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/.test(k) && typeof x === 'string') params[k] = x.slice(0, 500);
  return { host: r.host as ZoekRoute['host'], pad: r.pad, ...(typeof r.hash === 'string' && r.hash ? { hash: r.hash.slice(0, 200) } : {}), ...(Object.keys(params).length ? { params } : {}) };
};

/** Eén bewaarde rij controleren; alles wat niet klopt wordt weggelaten (bv. handmatig aangepaste opslag). */
const leesRij = (v: unknown): RecenteZoekopdracht | null => {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const vraag = typeof r.vraag === 'string' ? r.vraag.trim().slice(0, RECENT_VRAAG_MAX) : '';
  const sectie = typeof r.sectie === 'string' && CATEGORIEEN.includes(r.sectie) ? (r.sectie as Categorie) : 'all';
  const tijd = typeof r.tijd === 'number' && Number.isFinite(r.tijd) && r.tijd > 0 ? r.tijd : 0;
  if (!vraag || !tijd) return null;
  const route = leesRoute(r.route);
  // Een functie/pagina zonder (geldige) route kan niet rechtstreeks openen → geldt als gewone zoekopdracht met die tekst.
  const soort: RecentSoort = (r.soort === 'functie' || r.soort === 'pagina') && route ? r.soort : 'zoek';
  return soort === 'zoek' ? { vraag, sectie, tijd, soort } : { vraag, sectie, tijd, soort, route };
};

/** Sleutel om dubbelen te herkennen: een zoekopdracht per tekst (hoofdletters tellen niet mee), een functie/pagina per tekst + route. */
const dubbelSleutel = (r: Pick<RecenteZoekopdracht, 'vraag' | 'soort' | 'route'>): string =>
  `${r.soort}|${r.vraag.toLocaleLowerCase()}|${r.soort === 'zoek' ? '' : JSON.stringify(r.route || null)}`;

/** Recente zoekopdrachten van één ruimte, nieuwste eerst. Geen id, geen opslag of een kapotte waarde → lege lijst. De privéruimte toont
 *  nooit een technische route (isTechRoute), ook niet uit een lijst van vóór de scheiding. */
export function leesRecent(id: string = gebruiker, opslag: Pick<Storage, 'getItem'> | null = standaardOpslag(), ruimte: RecentRuimte = recentRuimteNu()): RecenteZoekopdracht[] {
  const sleutel = recentSleutel(id, ruimte);
  if (!sleutel || !opslag) return [];
  try {
    const ruw = opslag.getItem(sleutel);
    if (!ruw) return [];
    const lijst: unknown = JSON.parse(ruw);
    if (!Array.isArray(lijst)) return [];
    return lijst.map(leesRij).filter((x): x is RecenteZoekopdracht => x !== null && (ruimte === 'technisch' || !isTechRoute(x.route))).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** Voegt een rij vooraan toe (zonder dubbel) en geeft de lijst van `ruimte` terug. Zonder `extra` is het een gewone zoekopdracht.
 *  Een technische route gaat altijd naar de technische lijst; de privélijst blijft dan zoals hij was. */
export function bewaarRecent(vraag: string, sectie: Categorie, nu: number = Date.now(), id: string = gebruiker, opslag: Opslag | null = standaardOpslag(), extra: RecentExtra = {}, ruimte: RecentRuimte = recentRuimteNu()): RecenteZoekopdracht[] {
  const v = vraag.trim().slice(0, RECENT_VRAAG_MAX);
  const route = extra.route ? leesRoute(extra.route) : undefined;
  const doel: RecentRuimte = isTechRoute(route) ? 'technisch' : ruimte;
  const sleutel = recentSleutel(id, doel);
  if (!v || !sleutel || !opslag) return leesRecent(id, opslag, ruimte);
  const soort: RecentSoort = (extra.soort === 'functie' || extra.soort === 'pagina') && route ? extra.soort : 'zoek';
  const rij: RecenteZoekopdracht = soort === 'zoek' ? { vraag: v, sectie, tijd: nu, soort } : { vraag: v, sectie, tijd: nu, soort, route };
  const sl = dubbelSleutel(rij);
  const lijst = [rij, ...leesRecent(id, opslag, doel).filter(r => dubbelSleutel(r) !== sl)].slice(0, RECENT_MAX);
  try { opslag.setItem(sleutel, JSON.stringify(lijst)); } catch { /* vol of geblokkeerd: deze keer niets bewaard */ }
  return doel === ruimte ? lijst : leesRecent(id, opslag, ruimte);
}

/** Alle recente zoekopdrachten van dit account op dit apparaat wissen — alleen die van `ruimte` (de andere lijst blijft). */
export function wisRecent(id: string = gebruiker, opslag: Pick<Storage, 'removeItem'> | null = standaardOpslag(), ruimte: RecentRuimte = recentRuimteNu()): void {
  const sleutel = recentSleutel(id, ruimte);
  if (!sleutel || !opslag) return;
  try { opslag.removeItem(sleutel); } catch { /* geblokkeerd: niets te wissen */ }
}
