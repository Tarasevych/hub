// Technische ruimtes v2 (27.10.2026): ÉÉN beslisfunctie voor «mag dit verzoek nu in de technische ruimte?» — voor de site, de AI/MCP
// en de browserextensie. Puur (geen database): backend/tech-ruimtes-kern.ts verzamelt de feiten en roept dit aan. Zo kunnen site en AI
// niet meer verschillend tellen (audit S4), is «eigenaar» één definitie (S5) en hangt elke technische toegang aan een levende
// aanmeldsessie (S7). Zie docs/ontwerp/TECH-RUIMTES-API.md.
import { rolInfo, isTechRol, mogelijkhedenVan, DUUR_KEUZES, type TechMogelijkheid, type TechRol } from './tech-rollen';

export type Ruimte = 'prive' | 'technisch';
export type RuimteModus = 'tijd' | 'tot-technisch-einde' | 'tot-site-uitloggen';
export const RUIMTE_MODI: readonly RuimteModus[] = Object.freeze(['tijd', 'tot-technisch-einde', 'tot-site-uitloggen']);
export const isRuimteModus = (v: unknown): v is RuimteModus => typeof v === 'string' && (RUIMTE_MODI as readonly string[]).includes(v);
export type Tweetalig = { uk: string; nl: string };

/** De enige definitie van «eigenaar van de server»: rol owner ÉN het adres uit OWNER_EMAIL (was op drie manieren gedefinieerd). */
export const isEigenaarDefinitie = (rol: string | null | undefined, emailIsOwner: boolean): boolean => rol === 'owner' && emailIsOwner;

/** Open modi (zonder klok) vragen een rol met een plafond van minstens 4 uur. */
export const OPEN_MIN_PLAFOND = 240;
export const RUIMTE_MAX_MINUTEN = 480;

/** Rollen die bij een termijn meekomen: alleen die waarvan het plafond de termijn toelaat (ipv het MINIMUM over alle rollen). */
export function rollenVoorTermijn(rollen: readonly string[], profielMax: number, modus: RuimteModus, minuten?: number): TechRol[] {
  const geldig = rollen.filter(isTechRol);
  if (modus === 'tijd') {
    const m = Number(minuten);
    if (!Number.isFinite(m) || m < 15 || m > RUIMTE_MAX_MINUTEN || m > profielMax) return [];
    return geldig.filter((r) => (rolInfo(r)?.plafondMinuten ?? 0) >= m);
  }
  if (profielMax < OPEN_MIN_PLAFOND) return [];
  return geldig.filter((r) => (rolInfo(r)?.plafondMinuten ?? 0) >= OPEN_MIN_PLAFOND);
}

export type TermijnOptie = { modus: RuimteModus; minuten?: number; label: Tweetalig; beschikbaar: boolean; reden?: Tweetalig; rollen: TechRol[] };
const minLabel = (m: number): Tweetalig => m < 60 ? { uk: `${m} хв`, nl: `${m} min` } : { uk: `${m / 60} год`, nl: `${m / 60} uur` };
const naam = (r: string) => rolInfo(r)?.naam ?? [r, r];

/** Alle termijnen, ook de onbeschikbare (met reden). Nooit verbergen. */
export function termijnOpties(rollen: readonly string[], profielMax: number): TermijnOptie[] {
  const opties: TermijnOptie[] = [];
  const alle = rollen.filter(isTechRol);
  const metReden = (o: Omit<TermijnOptie, 'beschikbaar' | 'reden' | 'rollen'>, mee: TechRol[], waarom: () => Tweetalig): TermijnOptie => {
    if (!mee.length) return { ...o, beschikbaar: false, reden: waarom(), rollen: [] };
    const weg = alle.filter((r) => !mee.includes(r));
    return { ...o, beschikbaar: true, rollen: mee, ...(weg.length ? { reden: { uk: `Без ролей: ${weg.map((r) => naam(r)[0]).join(', ')} (їхній ліміт коротший).`, nl: `Zonder rollen: ${weg.map((r) => naam(r)[1]).join(', ')} (hun plafond is korter).` } } : {}) };
  };
  for (const m of DUUR_KEUZES) {
    opties.push(metReden({ modus: 'tijd', minuten: m, label: { uk: `На час: ${minLabel(m).uk}`, nl: `Op tijd: ${minLabel(m).nl}` } }, rollenVoorTermijn(alle, profielMax, 'tijd', m),
      () => m > profielMax ? { uk: `Ваш профіль дозволяє не більше ${profielMax} хв.`, nl: `Uw profiel staat hoogstens ${profielMax} min toe.` } : { uk: 'Жодна ваша роль не дозволяє так довго.', nl: 'Geen van uw rollen staat zo lang toe.' }));
  }
  const open = (modus: RuimteModus, label: Tweetalig) => opties.push(metReden({ modus, label }, rollenVoorTermijn(alle, profielMax, modus),
    () => profielMax < OPEN_MIN_PLAFOND ? { uk: 'Ваш профіль обмежений часом: без часу потрібно щонайменше 4 год.', nl: 'Uw profiel is in tijd beperkt: zonder tijdsgrens vraagt minstens 4 uur.' } : { uk: 'Потрібна роль із лімітом щонайменше 4 год (не «Адміністратор»).', nl: 'Vraagt een rol met een plafond van minstens 4 uur (niet «Beheerder»).' }));
  open('tot-technisch-einde', { uk: 'До завершення технічного сеансу', nl: 'Tot het einde van de technische sessie' });
  open('tot-site-uitloggen', { uk: 'До виходу з акаунта на сайті', nl: 'Tot uitloggen van de site-account' });
  return opties;
}
/** Langste termijn op tijd: de BESTE rol telt (begrensd door het profiel en 8 uur). */
export const maxMinutenBeste = (rollen: readonly string[], profielMax: number): number =>
  Math.min(profielMax, RUIMTE_MAX_MINUTEN, Math.max(0, ...rollen.filter(isTechRol).map((r) => rolInfo(r)?.plafondMinuten ?? 0)));

// ------------------------------------------------------------------------------------------------ de beslissing
export type RuimteBron = 'site' | 'mcp' | 'extensie';
export type RuimteSessieFeit = {
  id: string; rollen: readonly string[]; modus: RuimteModus; actief: Ruimte;
  /** ms; null = geen klok */ eind: number | null; grens: number; beeindigd: boolean;
  /** de ankersessie van de site leeft nog (niet ingetrokken, niet verlopen) */ siteSessieLeeft: boolean;
  /** dit verzoek hoort bij deze sessie (tab geregistreerd of sessie-id gelijk); voor MCP niet van toepassing */ gebonden: boolean;
  /** ruimtes-scheiding (0123): HMAC-binding aan de site-sessie klopt. Ontbreekt = niet gecontroleerd (vlag uit, oud gedrag). */
  bindingGeldig?: boolean;
};
export type RuimteCtx = {
  bron: RuimteBron; nu: number; eigenaar: boolean; accountActief: boolean;
  profiel: { rollen: readonly string[]; ingetrokken: boolean } | null;
  sessie: RuimteSessieFeit | null;
  /** alleen bron 'mcp': geldige AI-instelling met 'technisch' voor deze sessie */ aiToegestaan?: boolean;
};
export type RuimteBesluit = { toegestaan: boolean; ruimte: Ruimte; mogelijkheden: TechMogelijkheid[]; rollen: TechRol[]; eind: number | null; code: string; sessieId: string | null };

export function ruimteToegang(ctx: RuimteCtx, ruimte: Ruimte): RuimteBesluit {
  const nee = (code: string): RuimteBesluit => ({ toegestaan: ruimte === 'prive' && ctx.accountActief, ruimte: 'prive', mogelijkheden: [], rollen: [], eind: null, code, sessieId: null });
  if (!ctx.accountActief) return { ...nee('ACCOUNT_NIET_ACTIEF'), toegestaan: false };
  if (ruimte === 'prive') return nee('PRIVE');
  const heeftProfiel = ctx.eigenaar || (!!ctx.profiel && !ctx.profiel.ingetrokken && ctx.profiel.rollen.length > 0);
  if (!heeftProfiel) return nee('GEEN_TECH_PROFIEL');
  const s = ctx.sessie;
  if (!s || s.beeindigd) return nee('GEEN_TECH_SESSIE');
  if (!s.siteSessieLeeft) return nee('SITE_SESSIE_WEG');
  if (s.bindingGeldig === false) return nee('BINDING_ONGELDIG');
  if (s.grens <= ctx.nu) return nee('GRENS_VOORBIJ');
  if (s.modus === 'tijd' && (s.eind === null || s.eind <= ctx.nu)) return nee('VERLOPEN');
  if (s.actief !== 'technisch') return nee('PAUZE');
  if (ctx.bron !== 'mcp' && !s.gebonden) return nee('NIET_GEBONDEN');
  if (ctx.bron === 'mcp' && !ctx.aiToegestaan) return nee('AI_NIET_TOEGESTAAN');
  // Rechten: alleen rollen die het profiel NU nog heeft (ingetrokken rol = weg), eigenaar houdt 'eigenaar'.
  const nu = new Set(ctx.eigenaar ? ['eigenaar', ...(ctx.profiel?.rollen ?? [])] : (ctx.profiel?.rollen ?? []));
  const rollen = s.rollen.filter(isTechRol).filter((r) => nu.has(r));
  if (!rollen.length) return nee('GEEN_ROLLEN');
  return { toegestaan: true, ruimte: 'technisch', mogelijkheden: mogelijkhedenVan(rollen), rollen, eind: s.modus === 'tijd' ? s.eind : s.grens, code: 'TECHNISCH', sessieId: s.id };
}
