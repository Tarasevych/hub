// De browserkant van /api/notities/* (backend/notities-vnext.ts). Elke aanroep draagt dienst + tabblad mee, net als het bord:
// de server kiest de lade (prive/technisch) uit het TABBLAD, nooit uit wat de pagina zegt.
import { api, ApiError } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { sessieDienst } from '../canoniek-navigatie';
import { ruimteFeitenUit, ruimteGeslotenUit, type RuimteFeiten, type RuimteGesloten } from '../../shared/ruimte-weergave';
import { weergaveAccountNu, weergaveRuimteNu } from '../gedeelde-voorkeuren';
import { cacheAccountKey } from '../account-sleutel';
import type { Notitie, NotitieInvoer, NotitieKleur, NotitieMap, NotitieRevisie, NotitieSoort, Weergave } from '../../shared/notities-vnext-model';

const body = (extra: Record<string, unknown> = {}) => ({ service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin, ...extra });

export type LijstAntwoord = { notities: Notitie[]; totaal: number; offset: number; limiet: number; volgende: number | null; telling: Record<Weergave, number>; mappen: NotitieMap[]; etiketten: Array<{ etiket: string; aantal: number }>; ruimte: RuimteFeiten | null };
export type LijstFilter = { weergave: Weergave; mapId: string | null; etiket: string; vraag: string; soort: NotitieSoort | ''; kleur: NotitieKleur | ''; offset?: number; limiet?: number };
export type ImportItemUit = { titel: string; inhoud: string; soort: NotitieSoort; kleur: NotitieKleur; etiketten: string[]; bestand: string; vingerafdruk: string; dubbel: 'bestaand' | 'in-import' | '' };
export type ImportFoutUit = { bestand: string; fout: string };
export type ImportVoorbeeldUit = { items: ImportItemUit[]; fouten: ImportFoutUit[]; bestanden: number; nieuw: number; dubbel: number };

/** Een fout van de server, met als het even kan de code (bv. VERSIE_VEROUDERD) en de gegevens (bv. de huidige notitie). */
export class NotitiesFout extends Error {
  constructor(public code: string, public status: number, public data: any, public gesloten: RuimteGesloten | null) { super(code); this.name = 'NotitiesFout'; }
}
async function roep<T>(pad: string, data: Record<string, unknown> = {}): Promise<T> {
  try { const r = await api.post(pad, body(data)); kladRuimteVan(r.data); return r.data as T; }
  catch (e) {
    if (e instanceof ApiError) throw new NotitiesFout(e.message || `HTTP_${e.status}`, e.status, e.response?.data, ruimteGeslotenUit(e.response?.data));
    throw new NotitiesFout(String((e as Error)?.message || 'FOUT'), 0, null, null);
  }
}

export const notitiesClient = {
  lijst: async (f: LijstFilter): Promise<LijstAntwoord> => { const d = await roep<any>('/api/notities/lijst', f); return { ...d, ruimte: ruimteFeitenUit(d) }; },
  een: (id: string) => roep<{ notitie: Notitie }>('/api/notities/een', { id }).then((d) => d.notitie),
  nieuw: (invoer: NotitieInvoer) => roep<{ notitie: Notitie }>('/api/notities/nieuw', invoer).then((d) => d.notitie),
  wijzig: (id: string, versie: number | null, patch: Partial<NotitieInvoer>) => roep<{ notitie: Notitie }>('/api/notities/wijzig', { id, versie, ...patch }).then((d) => d.notitie),
  actie: (id: string, actie: 'vast' | 'losmaken' | 'archief' | 'uit-archief' | 'prullenbak' | 'herstel' | 'definitief') => roep<{ notitie: Notitie }>('/api/notities/actie', { id, actie }).then((d) => d.notitie),
  revisies: (id: string) => roep<{ revisies: NotitieRevisie[] }>('/api/notities/revisies', { id }).then((d) => d.revisies),
  revisieHerstel: (id: string, revisieId: string) => roep<{ notitie: Notitie }>('/api/notities/revisie-herstel', { id, revisieId }).then((d) => d.notitie),
  mappen: () => roep<{ mappen: NotitieMap[] }>('/api/notities/mappen', { actie: 'lijst' }).then((d) => d.mappen),
  mapNieuw: (naam: string, kleur: NotitieKleur) => roep<{ map: NotitieMap }>('/api/notities/mappen', { actie: 'nieuw', naam, kleur }).then((d) => d.map),
  mapWijzig: (id: string, patch: { naam?: string; kleur?: NotitieKleur }) => roep<{ map: NotitieMap }>('/api/notities/mappen', { actie: 'wijzig', id, ...patch }).then((d) => d.map),
  mapVerwijder: (id: string) => roep<{ verwijderd: boolean }>('/api/notities/mappen', { actie: 'verwijder', id }),
  importVoorbeeld: (bestanden: { naam: string; tekst: string }[]) => roep<ImportVoorbeeldUit>('/api/notities/import/voorbeeld', { bestanden }),
  importUitvoeren: (bestanden: { naam: string; tekst: string }[], opts: { ookDubbelen: boolean; mapId: string | null; etiket: string }) => roep<{ aangemaakt: Notitie[]; overgeslagen: number; fouten: ImportFoutUit[] }>('/api/notities/import/uitvoeren', { bestanden, ...opts }),
  export: (ookArchief: boolean) => roep<{ notities: Notitie[]; mappen: NotitieMap[] }>('/api/notities/export', { ookArchief }),
};

// ------------------------------------------------------------------------------- klad (alleen in deze browser, nooit een geheim)
// SEC-002 (aanv-ronde1-07): het klad stond onder «mr-notitie-klad:<id|nieuw>», zonder account en zonder ruimte, en bleef na
// afmelden staan: de volgende mens in deze browser kreeg bij «Нова нотатка» het niet-opgeslagen klad van een ander aangeboden
// (en de persoonlijke en technische ruimte van één mens deelden het). Nu:
//  - sleutel «mr-notitie-klad:<accountsleutel u-xxxxxxxx>:<prive|technisch>:<id|nieuw>»; account en ruimte staan ook IN de
//    waarde en worden bij het lezen vergeleken (een klad van een ander account/ruimte wordt nooit aangeboden);
//  - zonder bekend account in dit tabblad ('anon') of zonder bekende ruimte: geen klad lezen of schrijven;
//  - een klad verloopt na KLAD_MAX_LEEFTIJD; verlopen, onleesbare en oude (niet-gebonden) sleutels worden opgeruimd;
//  - wisNotitieKladden(account?) wist bij afmelden (voor src/lokale-sporen.ts: het voorvoegsel is NOTITIE_KLAD_VOORVOEGSEL).
// Чернетку прив'язано до облікового запису й простору, вона має термін придатності, старі ключі прибираються.
// Eén bron met het wissen bij afmelden (src/lokale-sporen.ts).
import { NOTITIE_KLAD_VOORVOEGSEL } from '../lokale-sporen';
export { NOTITIE_KLAD_VOORVOEGSEL };
const KLAD = NOTITIE_KLAD_VOORVOEGSEL;
export const KLAD_MAX_LEEFTIJD = 14 * 24 * 3600_000;
export type KladRuimte = 'prive' | 'technisch';
export type KladScope = { account: string; ruimte: KladRuimte };
export type Klad = { titel: string; inhoud: string; op: string; account?: string; ruimte?: KladRuimte };
type KladOpslag = { length: number; key: (i: number) => string | null; getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void };
const opslagNu = (): KladOpslag | null => { try { return typeof localStorage === 'undefined' ? null : (localStorage as unknown as KladOpslag); } catch { return null; } };
const NIEUWE_SLEUTEL = /^u-[a-f0-9]{8}:(prive|technisch):[^:]{1,200}$/;

/** Ruimte van de laatste serverantwoord (de server kiest de lade uit het tabblad); null = nog niets gehoord. */
let kladRuimte: KladRuimte | null = null;
function kladRuimteVan(data: unknown) { const f = ruimteFeitenUit(data); if (f) kladRuimte = f.ruimte; else if (data && typeof data === 'object' && kladRuimte === null) kladRuimte = weergaveRuimteNu() === 'technisch' ? 'technisch' : 'prive'; }
/** Account en ruimte van DIT tabblad, of null (dan geen klad). */
export function kladScopeNu(): KladScope | null {
  let account = 'anon';
  try { account = cacheAccountKey(weergaveAccountNu()); } catch { /* geen voorkeuren */ }
  if (!account || account === 'anon' || !kladRuimte) return null;
  return { account, ruimte: kladRuimte };
}
export const kladSleutel = (scope: KladScope, id: string) => `${KLAD}${scope.account}:${scope.ruimte}:${String(id || 'nieuw').slice(0, 200)}`;

export function kladLezenVoor(scope: KladScope | null, id: string, opslag: KladOpslag | null = opslagNu(), nu = Date.now()): Klad | null {
  if (!scope || !opslag) return null;
  const sleutel = kladSleutel(scope, id);
  try {
    const ruw = opslag.getItem(sleutel);
    if (!ruw) return null;
    const v = JSON.parse(ruw) as Partial<Klad>;
    const op = Date.parse(String(v?.op || ''));
    const geldig = v && typeof v.titel === 'string' && typeof v.inhoud === 'string' && v.account === scope.account && v.ruimte === scope.ruimte && Number.isFinite(op) && nu - op <= KLAD_MAX_LEEFTIJD && op <= nu + 60_000;
    if (!geldig) { opslag.removeItem(sleutel); return null; }
    return { titel: v.titel as string, inhoud: v.inhoud as string, op: String(v.op), account: scope.account, ruimte: scope.ruimte };
  } catch { try { opslag.removeItem(sleutel); } catch { /* geen opslag */ } return null; }
}
export function kladBewarenVoor(scope: KladScope | null, id: string, k: Pick<Klad, 'titel' | 'inhoud'>, opslag: KladOpslag | null = opslagNu(), nu = Date.now()) {
  if (!scope || !opslag) return;
  try { opslag.setItem(kladSleutel(scope, id), JSON.stringify({ titel: k.titel, inhoud: k.inhoud, op: new Date(nu).toISOString(), account: scope.account, ruimte: scope.ruimte })); } catch { /* geen opslag of vol */ }
}
export function kladWissenVoor(scope: KladScope | null, id: string, opslag: KladOpslag | null = opslagNu()) {
  if (!scope || !opslag) return;
  try { opslag.removeItem(kladSleutel(scope, id)); } catch { /* geen opslag */ }
}
const sleutelsMetVoorvoegsel = (opslag: KladOpslag): string[] => {
  const uit: string[] = [];
  try { for (let i = 0; i < Number(opslag.length || 0); i += 1) { const k = opslag.key(i); if (typeof k === 'string' && k.startsWith(KLAD)) uit.push(k); } } catch { /* niet opsombaar */ }
  return uit;
};
/** Ruimt verlopen, onleesbare en oude (niet aan account+ruimte gebonden) kladden op. Geeft het aantal gewiste sleutels. */
export function kladOpruimen(opslag: KladOpslag | null = opslagNu(), nu = Date.now()): number {
  if (!opslag) return 0;
  let n = 0;
  for (const k of sleutelsMetVoorvoegsel(opslag)) {
    let weg = !NIEUWE_SLEUTEL.test(k.slice(KLAD.length));
    if (!weg) { try { const v = JSON.parse(opslag.getItem(k) || 'null') as Partial<Klad> | null; const op = Date.parse(String(v?.op || '')); weg = !v || !Number.isFinite(op) || nu - op > KLAD_MAX_LEEFTIJD; } catch { weg = true; } }
    if (weg) { try { opslag.removeItem(k); n += 1; } catch { /* privévenster */ } }
  }
  return n;
}
/** Afmelden: wis de kladden van één account (ruwe id of sleutel u-xxxxxxxx), of zonder argument van alle accounts. */
export function wisNotitieKladden(account?: unknown, opslag: KladOpslag | null = opslagNu()): number {
  if (!opslag) return 0;
  const sleutel = account === undefined ? '' : cacheAccountKey(account);
  if (account !== undefined && (!sleutel || sleutel === 'anon')) return 0;
  let n = 0;
  for (const k of sleutelsMetVoorvoegsel(opslag)) {
    if (sleutel && !k.startsWith(`${KLAD}${sleutel}:`)) continue;
    try { opslag.removeItem(k); n += 1; } catch { /* privévenster */ }
  }
  return n;
}
let opgeruimd = false;
const eenmaalOpruimen = () => { if (opgeruimd) return; opgeruimd = true; kladOpruimen(); };
export function kladLezen(id: string): Klad | null { eenmaalOpruimen(); return kladLezenVoor(kladScopeNu(), id); }
export function kladBewaren(id: string, k: Omit<Klad, 'op'>) { kladBewarenVoor(kladScopeNu(), id, k); }
export function kladWissen(id: string) { kladWissenVoor(kladScopeNu(), id); }

// ------------------------------------------------------------------------------- voorkeuren van de weergave (per browser)
export type Voorkeuren = { indeling: 'kaarten' | 'lijst'; volgorde: 'gewijzigd' | 'aangemaakt' | 'titel'; zijkolom: boolean; leesbaar: boolean };
const VOORKEUR = 'mr-notities-voorkeuren';
export function voorkeurenLezen(): Voorkeuren {
  const basis: Voorkeuren = { indeling: 'kaarten', volgorde: 'gewijzigd', zijkolom: true, leesbaar: false };
  try { const v = localStorage.getItem(VOORKEUR); return v ? { ...basis, ...(JSON.parse(v) as Partial<Voorkeuren>) } : basis; } catch { return basis; }
}
export function voorkeurenBewaren(v: Voorkeuren) { try { localStorage.setItem(VOORKEUR, JSON.stringify(v)); } catch { /* geen opslag */ } }
