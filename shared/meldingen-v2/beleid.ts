// Meldingen v2 (vlag `meldingen-v2`, standaard UIT) — LEVERINGSBELEID. Pure regels, zonder React en zonder netwerk: dezelfde code
// draait in de browser (paneel, bel, geluid) en op de server (backend/meldingen-regels.ts normaliseert en bewaart hiermee).
//
// Bouwt VOORT op het bestaande mechanisme (shared/melding-typen.ts: geluid/opduiken/tonen per type, met `kritiek` = niet te
// verbergen) — geen tweede systeem: een oude typevoorkeur wordt hieronder naar een modus vertaald (modusUitTypeVoorkeur).
//
// Vier modi:
//   prioriteit — geluid + banner + teller + geschiedenis
//   normaal    — geen geluid; wel teller + geschiedenis
//   stil       — alleen geschiedenis (geen teller, geen banner)
//   uit        — niet in het gewone centrum (audit/verplichte regels blijven bestaan op de server)
// Beschermde gebeurtenissen (beveiliging, inzageverzoeken, bevestigingsverzoeken, wettelijk/operationeel verplicht) kunnen NOOIT
// onder `normaal` zakken, ook niet door «Не турбувати»: zij blijven geteld en zichtbaar (alleen het geluid mag dan zwijgen).
import { isKritiekType, isMeldingType, type MeldingType, type TypeVoorkeur } from '../melding-typen';

export type LeverModus = 'prioriteit' | 'normaal' | 'stil' | 'uit';
export const LEVER_MODI: readonly LeverModus[] = ['prioriteit', 'normaal', 'stil', 'uit'];
export const isLeverModus = (v: unknown): v is LeverModus => typeof v === 'string' && (LEVER_MODI as readonly string[]).includes(v);

/** Waarop een regel slaat. Leeg veld = «alles». Specifieker wint: account > dienst+categorie > dienst > categorie. */
export type RegelDoel = { dienst?: string; account?: string; categorie?: string };
export type LeverRegel = RegelDoel & { modus: LeverModus; bijgewerkt: number };
export type NietStoren = { tot: number; sinds: number } | null;
/** UI-014 (vlag meldingen-uitleg-v3): weergavegrootte van het paneel per account. Ontbreekt = standaard. */
export type Tekstgrootte = 'S' | 'M' | 'L' | 'XL';
export type Dichtheid = 'compact' | 'normaal' | 'ruim';
export type PaneelWeergave = { tekst: Tekstgrootte; dichtheid: Dichtheid };
export const TEKSTGROOTTES: readonly Tekstgrootte[] = ['S', 'M', 'L', 'XL'];
export const DICHTHEDEN: readonly Dichtheid[] = ['compact', 'normaal', 'ruim'];
export const STANDAARD_WEERGAVE: PaneelWeergave = { tekst: 'M', dichtheid: 'normaal' };
export function normaliseerWeergave(v: unknown): PaneelWeergave | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const tekst = TEKSTGROOTTES.includes(o.tekst as Tekstgrootte) ? (o.tekst as Tekstgrootte) : STANDAARD_WEERGAVE.tekst;
  const dichtheid = DICHTHEDEN.includes(o.dichtheid as Dichtheid) ? (o.dichtheid as Dichtheid) : STANDAARD_WEERGAVE.dichtheid;
  return { tekst, dichtheid };
}
export type LeverRegels = { versie: 1; regels: LeverRegel[]; nietStoren: NietStoren; bijgewerkt: number; weergave?: PaneelWeergave };

export const MAX_REGELS = 200;
export const MAX_NIET_STOREN_MS = 7 * 24 * 3600_000;
export const NIET_STOREN_KEUZES_MIN = [30, 60, 120, 480, 1440] as const;
export const legeRegels = (): LeverRegels => ({ versie: 1, regels: [], nietStoren: null, bijgewerkt: 0 });

const SLEUTEL = /^[a-z0-9][a-z0-9._:@+-]{0,119}$/i;
const veld = (v: unknown): string | undefined => { const s = String(v ?? '').trim(); return s && SLEUTEL.test(s) ? s.toLowerCase() : undefined; };

/** Strikte normalisatie van wat een client stuurt (server) of wat uit de opslag komt. Ongeldige regels vallen weg. */
export function normaliseerRegels(raw: unknown, nu = Date.now()): LeverRegels {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lijst = Array.isArray(r.regels) ? r.regels : [];
  const uit = new Map<string, LeverRegel>();
  for (const x of lijst.slice(0, MAX_REGELS * 2)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (!isLeverModus(o.modus)) continue;
    const doel: RegelDoel = { dienst: veld(o.dienst), account: veld(o.account), categorie: veld(o.categorie) };
    if (!doel.dienst && !doel.account && !doel.categorie) continue; // een regel «voor alles» bestaat niet: daarvoor is «Не турбувати»
    const b = Number(o.bijgewerkt);
    uit.set(regelSleutel(doel), { ...schoon(doel), modus: o.modus, bijgewerkt: Number.isFinite(b) && b > 0 ? Math.min(b, nu) : nu });
  }
  const ns = r.nietStoren as Record<string, unknown> | null | undefined;
  let nietStoren: NietStoren = null;
  if (ns && typeof ns === 'object') {
    const tot = Number(ns.tot), sinds = Number(ns.sinds);
    if (Number.isFinite(tot) && tot > nu) nietStoren = { tot: Math.min(tot, nu + MAX_NIET_STOREN_MS), sinds: Number.isFinite(sinds) && sinds > 0 ? Math.min(sinds, nu) : nu };
  }
  const bw = Number(r.bijgewerkt);
  const weergave = normaliseerWeergave(r.weergave);
  return { versie: 1, regels: [...uit.values()].slice(0, MAX_REGELS), nietStoren, bijgewerkt: Number.isFinite(bw) && bw > 0 ? bw : 0, ...(weergave ? { weergave } : {}) };
}
const schoon = (d: RegelDoel): RegelDoel => { const o: RegelDoel = {}; if (d.dienst) o.dienst = d.dienst; if (d.account) o.account = d.account; if (d.categorie) o.categorie = d.categorie; return o; };
export const regelSleutel = (d: RegelDoel) => `${d.dienst || '*'}|${d.account || '*'}|${d.categorie || '*'}`;

/** Wat een melding voor het beleid is. `beschermd` wordt NIET door de client bepaald maar afgeleid (isBeschermd). */
export type BeleidInvoer = { dienst?: string; account?: string; categorie?: string; soort?: string; vraagtBevestiging?: boolean; verplicht?: boolean };

/** Beschermd = kritiek type (beveiliging, inzage), bevestigingsverzoek, of uitdrukkelijk verplicht (wettelijk/operationeel). */
export function isBeschermd(m: BeleidInvoer): boolean {
  if (m.vraagtBevestiging || m.verplicht) return true;
  const c = String(m.categorie || '').toLowerCase();
  if (isMeldingType(c) && isKritiekType(c as MeldingType)) return true;
  return /^(security|beveiliging|passkey|login_nieuw|inzage|toegang_verzoek|access_request|recovery|herstel)/.test(String(m.soort || '').toLowerCase());
}

const past = (r: LeverRegel, m: BeleidInvoer) =>
  (!r.dienst || r.dienst === String(m.dienst || '').toLowerCase()) &&
  (!r.account || r.account === String(m.account || '').toLowerCase()) &&
  (!r.categorie || r.categorie === String(m.categorie || '').toLowerCase());
const gewicht = (r: LeverRegel) => (r.account ? 4 : 0) + (r.dienst ? 2 : 0) + (r.categorie ? 1 : 0);

/** De regel die geldt (meest specifiek; bij gelijk gewicht de laatst gewijzigde), of null. */
export function geldendeRegel(regels: LeverRegels, m: BeleidInvoer): LeverRegel | null {
  let beste: LeverRegel | null = null;
  for (const r of regels.regels) if (past(r, m) && (!beste || gewicht(r) > gewicht(beste) || (gewicht(r) === gewicht(beste) && r.bijgewerkt > beste.bijgewerkt))) beste = r;
  return beste;
}

export type Levering = { modus: LeverModus; geluid: boolean; banner: boolean; teller: boolean; centrum: boolean; beschermd: boolean; gedempt: 'niet-storen' | 'regel' | null };

/** Het eindoordeel voor één melding. `standaard` = modus zonder regel (bv. uit de oude typevoorkeur of uit de ernst). */
export function levering(regels: LeverRegels, m: BeleidInvoer, standaard: LeverModus = 'normaal', nu = Date.now()): Levering {
  const beschermd = isBeschermd(m);
  const regel = geldendeRegel(regels, m);
  let modus: LeverModus = regel ? regel.modus : standaard;
  let gedempt: Levering['gedempt'] = regel && rang(regel.modus) > rang(standaard) ? 'regel' : null;
  if (beschermd && rang(modus) > rang('normaal')) { modus = 'normaal'; gedempt = null; } // nooit onopgemerkt te dempen
  const dnd = !!regels.nietStoren && regels.nietStoren.tot > nu;
  let geluid = modus === 'prioriteit', banner = modus === 'prioriteit';
  if (dnd) { if (geluid || banner) gedempt = 'niet-storen'; geluid = false; banner = beschermd && banner; }
  return { modus, geluid, banner, teller: modus === 'prioriteit' || modus === 'normaal', centrum: modus !== 'uit', beschermd, gedempt };
}
const rang = (m: LeverModus) => LEVER_MODI.indexOf(m);

/** Brug met het oude mechanisme (geluid/opduiken/tonen per type) — dezelfde instelling, andere woorden. */
export function modusUitTypeVoorkeur(v: TypeVoorkeur | undefined): LeverModus {
  if (!v) return 'normaal';
  if (!v.tonen) return 'uit';
  if (v.geluid || v.opduiken) return v.geluid ? 'prioriteit' : 'normaal';
  return 'stil';
}

/** Zet (of wis met modus=null) één regel; geeft nieuwe regels terug (onveranderlijk). */
export function zetRegel(regels: LeverRegels, doel: RegelDoel, modus: LeverModus | null, nu = Date.now()): LeverRegels {
  const d = schoon({ dienst: veld(doel.dienst), account: veld(doel.account), categorie: veld(doel.categorie) });
  if (!d.dienst && !d.account && !d.categorie) return regels;
  const k = regelSleutel(d);
  const rest = regels.regels.filter((r) => regelSleutel(r) !== k);
  return { ...regels, regels: modus ? [...rest, { ...d, modus, bijgewerkt: nu }].slice(-MAX_REGELS) : rest, bijgewerkt: nu };
}
export function zetNietStoren(regels: LeverRegels, minuten: number | null, nu = Date.now()): LeverRegels {
  if (!minuten || minuten <= 0) return { ...regels, nietStoren: null, bijgewerkt: nu };
  return { ...regels, nietStoren: { sinds: nu, tot: nu + Math.min(minuten * 60_000, MAX_NIET_STOREN_MS) }, bijgewerkt: nu };
}
