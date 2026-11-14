// Voorkeuren voor meldingen in het menu (menu v2, fase B3). Zonder afhankelijkheden, zodat shared/menu-model.ts ze kan
// normaliseren als deel van het `sidebar`-veld (browser én server). Logica voor de badges: shared/menu-meldingen.ts.
import { normaliseerTypeVoorkeuren, type MeldingType, type TypeVoorkeur } from './melding-typen';
export const MELDING_CATEGORIEEN = ['post', 'beveiliging', 'toegang', 'delen', 'ai', 'systeem'] as const;
export type MeldingCategorie = typeof MELDING_CATEGORIEEN[number];
export const CATEGORIE_TEKST: Record<MeldingCategorie, [string, string]> = {
  post: ['Пошта', 'E-mail'], beveiliging: ['Безпека', 'Beveiliging'], toegang: ['Доступ і запити', 'Toegang en verzoeken'],
  delen: ['Спільний доступ', 'Delen'], ai: ['ШІ та агенти', 'AI en agenten'], systeem: ['Система', 'Systeem'],
};
/** Kleur van de badge per categorie (licht/donker) — los van de kleur van het onderdeel: rood = beveiliging, enz. */
export const CATEGORIE_KLEUR: Record<MeldingCategorie, { licht: string; donker: string }> = {
  post: { licht: '#1a5fd6', donker: '#7aa7ff' }, beveiliging: { licht: '#dc2626', donker: '#fca5a5' }, toegang: { licht: '#c2570c', donker: '#fdba74' },
  delen: { licht: '#15803d', donker: '#4ade80' }, ai: { licht: '#9333ea', donker: '#d8b4fe' }, systeem: { licht: '#6b7280', donker: '#a1a1aa' },
};

export const BADGE_STIJLEN = ['getal', 'punt'] as const;
export type BadgeStijl = typeof BADGE_STIJLEN[number];
export const HERINNER_MINUTEN = [0, 15, 30, 60, 120] as const;
export type MeldingVoorkeuren = {
  aan: boolean;                // badges in het menu tonen
  stijl: BadgeStijl;           // getal of alleen een gekleurde stip
  knipperen: boolean;          // even pulseren als er iets NIEUWS binnenkomt
  herinneren: number;          // elke N minuten zachtjes herinneren aan ongelezen meldingen (0 = nooit)
  bellen: boolean;             // bij aanwijzen een lijstje «sms-bellen» naast het item
  categorieen: Record<MeldingCategorie, boolean>;
  stil: { aan: boolean; van: string; tot: string }; // stille uren: geen knipperen/herinneren (badges blijven)
  /** IDENTITEIT-014: serverwaarschuwing (access_recovery_low) als er na gebruik nog ≤2 herstelcodes over zijn. Beveiligingswaarschuwing → standaard AAN.
   *  Попередження сервера, коли після використання лишилося ≤2 кодів відновлення; за замовчуванням увімкнено. */
  reserveHerinnering: boolean;
  /** Per type (18.10.2026): geluid, opduiken (toast), tonen. Kritieke types altijd getoond (shared/melding-typen.ts). */
  soorten: Record<MeldingType, TypeVoorkeur>;
};
export const standaardMeldingen = (): MeldingVoorkeuren => ({
  aan: true, stijl: 'getal', knipperen: true, herinneren: 0, bellen: true,
  categorieen: { post: true, beveiliging: true, toegang: true, delen: true, ai: true, systeem: true },
  stil: { aan: false, van: '22:00', tot: '07:00' },
  reserveHerinnering: true,
  soorten: normaliseerTypeVoorkeuren(null),
});
const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const bool = (v: unknown, std: boolean) => (typeof v === 'boolean' ? v : std);
export function normaliseerMeldingen(raw: unknown): MeldingVoorkeuren {
  const r = obj(raw), s = standaardMeldingen(), c = obj(r.categorieen), st = obj(r.stil);
  const her = Number(r.herinneren);
  return {
    aan: bool(r.aan, s.aan),
    stijl: (BADGE_STIJLEN as readonly string[]).includes(String(r.stijl)) ? r.stijl as BadgeStijl : s.stijl,
    knipperen: bool(r.knipperen, s.knipperen),
    herinneren: (HERINNER_MINUTEN as readonly number[]).includes(her) ? her : s.herinneren,
    bellen: bool(r.bellen, s.bellen),
    categorieen: Object.fromEntries(MELDING_CATEGORIEEN.map((k) => [k, bool(c[k], true)])) as Record<MeldingCategorie, boolean>,
    stil: { aan: bool(st.aan, false), van: TIJD.test(String(st.van)) ? String(st.van) : s.stil.van, tot: TIJD.test(String(st.tot)) ? String(st.tot) : s.stil.tot },
    reserveHerinnering: bool(r.reserveHerinnering, s.reserveHerinnering),
    soorten: normaliseerTypeVoorkeuren(r.soorten),
  };
}
/** Valt `nu` (minuten na middernacht, lokale tijd) binnen de stille uren? Ook over middernacht heen (22:00–07:00). */
export function isStil(v: MeldingVoorkeuren, minutenNaMiddernacht: number): boolean {
  if (!v.stil.aan) return false;
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const van = m(v.stil.van), tot = m(v.stil.tot), n = ((minutenNaMiddernacht % 1440) + 1440) % 1440;
  if (van === tot) return false;
  return van < tot ? n >= van && n < tot : n >= van || n < tot;
}

